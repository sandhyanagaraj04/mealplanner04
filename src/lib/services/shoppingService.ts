import { db } from "@/lib/db";
import { convertUnit, roundQty, getUnitDimension } from "@/lib/parsers/unitConverter";
import { scaleQuantity } from "@/lib/parsers/ingredientScaler";
import type {
  ShoppingList,
  ShoppingListItem,
  ShoppingSource,
  ShoppingState,
  DayOfWeek,
  MealType,
} from "@/types";
import type { UpdateIngredientState } from "@/lib/validations/mealplan";

// ─── Merge-warning text ────────────────────────────────────────────────────────
// Called when totalQuantity cannot be computed due to incompatible units or
// missing quantities. Returns a short, human-readable explanation.

type MergeFailReason =
  | { kind: "unknown_qty" }
  | { kind: "mixed_unit_presence" }
  | { kind: "incompatible_dims"; unitA: string; unitB: string }
  | { kind: "same_dim_no_convert"; unitA: string; unitB: string };

function mergeWarningText(r: MergeFailReason): string {
  switch (r.kind) {
    case "unknown_qty":
      return "Some quantities unknown — amounts shown per meal";
    case "mixed_unit_presence":
      return "Mixed: some sources have no unit — amounts shown per meal";
    case "incompatible_dims": {
      const dA = getUnitDimension(r.unitA);
      const dB = getUnitDimension(r.unitB);
      if (dA !== dB)
        return `Cannot combine ${dA} (${r.unitA}) and ${dB} (${r.unitB}) — amounts shown per meal`;
      return `Different units (${r.unitA}, ${r.unitB}) — amounts shown per meal`;
    }
    case "same_dim_no_convert":
      return `Cannot convert ${r.unitA} ↔ ${r.unitB} — amounts shown per meal`;
  }
}

// ─── Grouping key ─────────────────────────────────────────────────────────────
// Priority: matched ingredient ID → normalizedName → raw text.
// Using normalizedName lets "finely chopped garlic" and "minced garlic" share a
// group even when there is no canonical Ingredient DB match.

function groupKey(ri: {
  ingredientId: string | null;
  normalizedName: string | null;
  rawText: string;
}): string {
  if (ri.ingredientId) return `ingredient:${ri.ingredientId}`;
  if (ri.normalizedName) return `normalized:${ri.normalizedName.toLowerCase()}`;
  return `raw:${ri.rawText.toLowerCase().trim()}`;
}

// ─── Initialise state rows ────────────────────────────────────────────────────
// Ensures every (MealPlanItem × RecipeIngredient) pair has a state row so the
// client can always PATCH without needing to create first.

export async function initializeShoppingStates(planId: string, userId: string): Promise<void> {
  const plan = await db.mealPlanWeek.findFirst({
    where: { id: planId, userId },
    select: {
      items: { select: { id: true, recipeId: true } },
    },
  });
  if (!plan || plan.items.length === 0) return;

  const recipeIds = [...new Set(plan.items.map((i) => i.recipeId))];
  const riRows = await db.recipeIngredient.findMany({
    where: { recipeId: { in: recipeIds } },
    select: { id: true, recipeId: true },
  });

  // Build expected pairs
  const riByRecipe = new Map<string, string[]>();
  for (const ri of riRows) {
    const arr = riByRecipe.get(ri.recipeId) ?? [];
    arr.push(ri.id);
    riByRecipe.set(ri.recipeId, arr);
  }

  const pairs: { mealPlanItemId: string; recipeIngredientId: string }[] = [];
  for (const item of plan.items) {
    for (const riId of riByRecipe.get(item.recipeId) ?? []) {
      pairs.push({ mealPlanItemId: item.id, recipeIngredientId: riId });
    }
  }
  if (pairs.length === 0) return;

  // Skip pairs that already have a row
  const existing = await db.mealPlanIngredientState.findMany({
    where: { mealPlanItemId: { in: plan.items.map((i) => i.id) } },
    select: { mealPlanItemId: true, recipeIngredientId: true },
  });
  const existingSet = new Set(
    existing.map((e) => `${e.mealPlanItemId}:${e.recipeIngredientId}`)
  );

  const missing = pairs.filter(
    (p) => !existingSet.has(`${p.mealPlanItemId}:${p.recipeIngredientId}`)
  );
  if (missing.length === 0) return;

  await db.mealPlanIngredientState.createMany({
    data: missing.map((p) => ({ ...p, state: "PENDING" })),
    skipDuplicates: true,
  });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export async function getShoppingList(planId: string, userId: string): Promise<ShoppingList | null> {
  const plan = await db.mealPlanWeek.findFirst({
    where: { id: planId, userId },
    include: {
      items: {
        include: {
          recipe: { select: { id: true, name: true, servings: true } },
          ingredientStates: {
            select: {
              id: true,
              recipeIngredientId: true,
              state: true,
              quantityOverride: true,
              unitOverride: true,
              note: true,
            },
          },
        },
      },
    },
  });

  if (!plan) return null;

  const recipeIds = [...new Set(plan.items.map((i) => i.recipeId))];
  const ingredients = await db.recipeIngredient.findMany({
    where: { recipeId: { in: recipeIds } },
    include: { ingredient: true },
  });

  const riMap = new Map(ingredients.map((ri) => [ri.id, ri]));

  type StateRow = (typeof plan.items)[0]["ingredientStates"][0];
  const stateIndex = new Map<string, Map<string, StateRow>>();
  for (const item of plan.items) {
    const byRi = new Map<string, StateRow>();
    for (const s of item.ingredientStates) byRi.set(s.recipeIngredientId, s);
    stateIndex.set(item.id, byRi);
  }

  // ── Build groups ───────────────────────────────────────────────────────────
  const groups = new Map<string, ShoppingListItem>();
  // Track first merge failure per group key
  const mergeFailures = new Map<string, MergeFailReason>();

  for (const item of plan.items) {
    const recipeIngredients = ingredients.filter((ri) => ri.recipeId === item.recipeId);
    const stateByRi = stateIndex.get(item.id) ?? new Map();

    for (const ri of recipeIngredients) {
      const stateRow = stateByRi.get(ri.id);

      const scaledQty = scaleQuantity(ri.quantity, item.scaleFactor);
      const effectiveQty = stateRow?.quantityOverride ?? scaledQty;
      const effectiveUnit = stateRow?.unitOverride ?? ri.unit;

      const source: ShoppingSource = {
        stateId: stateRow?.id ?? null,
        mealPlanItemId: item.id,
        recipeIngredientId: ri.id,
        dayOfWeek: item.dayOfWeek as DayOfWeek,
        mealType: item.mealType as MealType,
        recipeName: item.recipe.name,
        scaledQuantity: scaledQty,
        unit: ri.unit,
        state: (stateRow?.state ?? "PENDING") as ShoppingState,
        quantityOverride: stateRow?.quantityOverride ?? null,
        unitOverride: stateRow?.unitOverride ?? null,
        note: stateRow?.note ?? null,
      };

      const key = groupKey(ri);

      if (!groups.has(key)) {
        groups.set(key, {
          ingredientId: ri.ingredientId ?? null,
          ingredientName: ri.ingredient?.name ?? ri.displayName ?? ri.rawText,
          category: ri.ingredient?.category ?? null,
          totalQuantity: effectiveQty != null ? roundQty(effectiveQty) : null,
          unit: effectiveUnit,
          unitConverted: false,
          sourceCount: 1,
          mergeWarning: null,
          sources: [source],
        });
        if (effectiveQty == null) {
          mergeFailures.set(key, { kind: "unknown_qty" });
        }
        continue;
      }

      const group = groups.get(key)!;
      group.sources.push(source);
      group.sourceCount += 1;

      // ── Unit aggregation with conversion ──────────────────────────────────
      if (mergeFailures.has(key)) {
        // Already failed — just accumulate sources
        continue;
      }

      if (effectiveQty == null || group.totalQuantity == null) {
        group.totalQuantity = null;
        mergeFailures.set(key, { kind: "unknown_qty" });
        continue;
      }

      if (effectiveUnit === null && group.unit === null) {
        group.totalQuantity = roundQty(group.totalQuantity + effectiveQty);
        continue;
      }

      if (effectiveUnit === group.unit) {
        group.totalQuantity = roundQty(group.totalQuantity + effectiveQty);
        continue;
      }

      // Units differ — check for mixed unit presence first
      if (effectiveUnit === null || group.unit === null) {
        group.totalQuantity = null;
        mergeFailures.set(key, { kind: "mixed_unit_presence" });
        continue;
      }

      // Both have units but they differ — attempt dimensional conversion
      const converted = convertUnit(effectiveQty, effectiveUnit, group.unit);
      if (converted !== null) {
        group.totalQuantity = roundQty(group.totalQuantity + converted);
        group.unitConverted = true;
        continue;
      }

      // Conversion failed — record why
      group.totalQuantity = null;
      const dA = getUnitDimension(group.unit);
      const dB = getUnitDimension(effectiveUnit);
      mergeFailures.set(
        key,
        dA !== dB
          ? { kind: "incompatible_dims", unitA: group.unit, unitB: effectiveUnit }
          : { kind: "same_dim_no_convert", unitA: group.unit, unitB: effectiveUnit }
      );
    }
  }

  // Stamp merge warnings onto groups
  for (const [key, reason] of mergeFailures) {
    const group = groups.get(key);
    if (group) group.mergeWarning = mergeWarningText(reason);
  }

  // ── Sort: resolved first, then alphabetically ──────────────────────────────
  const items = [...groups.values()].sort((a, b) => {
    if (a.ingredientId && !b.ingredientId) return -1;
    if (!a.ingredientId && b.ingredientId) return 1;
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  const unresolvedCount = items.filter((i) => !i.ingredientId).length;

  return {
    mealPlanWeekId: planId,
    weekStart: plan.weekStart.toISOString().slice(0, 10),
    items,
    unresolvedCount,
  };
}

// ─── Update ingredient state ──────────────────────────────────────────────────

export async function updateIngredientState(
  stateId: string,
  planId: string,
  userId: string,
  data: UpdateIngredientState
) {
  const stateRow = await db.mealPlanIngredientState.findFirst({
    where: { id: stateId },
    include: {
      mealPlanItem: {
        select: {
          mealPlanWeekId: true,
          mealPlanWeek: { select: { userId: true } },
        },
      },
    },
  });

  if (!stateRow) return { error: "not_found" as const };
  if (
    stateRow.mealPlanItem.mealPlanWeekId !== planId ||
    stateRow.mealPlanItem.mealPlanWeek.userId !== userId
  ) {
    return { error: "forbidden" as const };
  }

  const updated = await db.mealPlanIngredientState.update({
    where: { id: stateId },
    data: {
      state: data.state,
      ...(data.quantityOverride !== undefined && { quantityOverride: data.quantityOverride }),
      ...(data.unitOverride !== undefined && { unitOverride: data.unitOverride }),
      ...(data.note !== undefined && { note: data.note }),
    },
  });

  return { state: updated };
}

// ─── Bulk reset ───────────────────────────────────────────────────────────────

export async function resetShoppingList(planId: string, userId: string): Promise<boolean> {
  const plan = await db.mealPlanWeek.findFirst({ where: { id: planId, userId } });
  if (!plan) return false;

  await db.mealPlanIngredientState.updateMany({
    where: { mealPlanItem: { mealPlanWeekId: planId } },
    data: { state: "PENDING", quantityOverride: null, unitOverride: null, note: null },
  });

  return true;
}
