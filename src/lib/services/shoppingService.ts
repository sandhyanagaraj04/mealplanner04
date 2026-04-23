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
import { track } from "@/lib/analytics/track";

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

// Starting confidence based purely on what kind of key anchors the group.
function initialConfidence(key: string): number {
  if (key.startsWith("ingredient:")) return 1.0;
  if (key.startsWith("normalized:")) return 0.9;
  return 0.8; // "raw:" or "quick:"
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

  const recipeIds = [...new Set(plan.items.map((i) => i.recipeId).filter((id): id is string => id !== null))];
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
    for (const riId of (item.recipeId ? riByRecipe.get(item.recipeId) : undefined) ?? []) {
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

// ─── Potential duplicate detection ───────────────────────────────────────────
// Finds pairs of unresolved items whose names share a significant word (> 3 chars).
// These are likely the same ingredient from two recipes entered differently,
// e.g. "garlic clove" and "crushed garlic".

function significantWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[\s,()]+/)
      .filter((w) => w.length > 3)
  );
}

function detectPotentialDuplicates(
  unresolved: import("@/types").ShoppingListItem[]
): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < unresolved.length; i++) {
    const wa = significantWords(unresolved[i].ingredientName);
    for (let j = i + 1; j < unresolved.length; j++) {
      const wb = significantWords(unresolved[j].ingredientName);
      const overlap = [...wa].some((w) => wb.has(w));
      if (overlap) {
        pairs.push([unresolved[i].ingredientName, unresolved[j].ingredientName]);
      }
    }
  }
  return pairs;
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
          shoppingItems: {
            select: { id: true, itemName: true, quantity: true, unit: true, note: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!plan) return null;

  const recipeIds = [...new Set(plan.items.map((i) => i.recipeId).filter((id): id is string => id !== null))];
  const ingredients = await db.recipeIngredient.findMany({
    where: { recipeId: { in: recipeIds } },
    include: { ingredient: true },
  });

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
  // Tracks evolving confidence for each group (may be lowered by cross-type merges)
  const groupConfidence = new Map<string, number>();

  // ── Pass 1: recipe meals ───────────────────────────────────────────────────
  for (const item of plan.items) {
    if (!item.recipeId || !item.recipe) continue;
    if (!item.includeInShopping) continue; // user opted this meal out of the shopping list
    const recipeIngredients = ingredients.filter((ri) => ri.recipeId === item.recipeId);
    const stateByRi = stateIndex.get(item.id) ?? new Map();

    for (const ri of recipeIngredients) {
      const stateRow = stateByRi.get(ri.id);

      // Rule: exclude ingredients the user already has
      if (stateRow?.state === "HAVE_IT") continue;

      const scaledQty = scaleQuantity(ri.quantity, item.scaleFactor);
      const effectiveQty = stateRow?.quantityOverride ?? scaledQty;
      const effectiveUnit = stateRow?.unitOverride ?? ri.unit;

      const source: ShoppingSource = {
        stateId: stateRow?.id ?? null,
        mealPlanItemId: item.id,
        recipeIngredientId: ri.id,
        quickShoppingItemId: null,
        dayOfWeek: item.dayOfWeek as DayOfWeek,
        mealType: item.mealType as MealType,
        recipeName: item.recipe!.name,
        scaledQuantity: scaledQty,
        unit: ri.unit,
        state: (stateRow?.state ?? "PENDING") as ShoppingState,
        quantityOverride: stateRow?.quantityOverride ?? null,
        unitOverride: stateRow?.unitOverride ?? null,
        note: stateRow?.note ?? null,
      };

      const key = groupKey(ri);

      if (!groups.has(key)) {
        const conf = initialConfidence(key);
        groups.set(key, {
          ingredientId: ri.ingredientId ?? null,
          ingredientName: ri.ingredient?.name ?? ri.displayName ?? (ri.rawText.trim() || "Unknown ingredient"),
          category: ri.ingredient?.category ?? null,
          totalQuantity: effectiveQty != null ? roundQty(effectiveQty) : null,
          unit: effectiveUnit,
          unitConverted: false,
          sourceCount: 1,
          mergeWarning: null,
          mergeConfidence: conf,
          sources: [source],
        });
        groupConfidence.set(key, conf);
        if (effectiveQty == null) {
          mergeFailures.set(key, { kind: "unknown_qty" });
        }
        continue;
      }

      const group = groups.get(key)!;
      group.sources.push(source);
      group.sourceCount += 1;

      // ── Unit aggregation with conversion ──────────────────────────────────
      if (mergeFailures.has(key)) continue;

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

      if (effectiveUnit === null || group.unit === null) {
        group.totalQuantity = null;
        mergeFailures.set(key, { kind: "mixed_unit_presence" });
        continue;
      }

      const converted = convertUnit(effectiveQty, effectiveUnit, group.unit);
      if (converted !== null) {
        group.totalQuantity = roundQty(group.totalQuantity + converted);
        group.unitConverted = true;
        continue;
      }

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

  // ── Pass 2: quick meals ────────────────────────────────────────────────────
  // Quick meal shopping items enter the same groups as recipe ingredients when
  // the item name matches a normalised group key exactly.  Otherwise they form
  // their own "quick:" group.  Cross-type merges lower confidence to 0.7.
  for (const item of plan.items) {
    if (item.type !== "quick") continue;
    if (!item.shoppingItems || item.shoppingItems.length === 0) continue;

    for (const si of item.shoppingItems) {
      const itemNameNorm = (si.itemName ?? "").toLowerCase().trim();
      if (!itemNameNorm) continue; // defensive: skip blank names

      // Try to merge into an existing recipe group via normalised-name key
      const normalizedKey = `normalized:${itemNameNorm}`;
      const isCrossType = groups.has(normalizedKey);
      const key = isCrossType ? normalizedKey : `quick:${itemNameNorm}`;

      const qty = si.quantity ?? null;
      const unit = si.unit ?? null;

      const source: ShoppingSource = {
        stateId: null,
        mealPlanItemId: item.id,
        recipeIngredientId: null,
        quickShoppingItemId: si.id,
        dayOfWeek: item.dayOfWeek as DayOfWeek,
        mealType: item.mealType as MealType,
        recipeName: item.name ?? null,
        scaledQuantity: qty,
        unit,
        state: "PENDING",
        quantityOverride: null,
        unitOverride: null,
        note: si.note ?? null,
      };

      if (!groups.has(key)) {
        groups.set(key, {
          ingredientId: null,
          ingredientName: si.itemName.trim() || "Unknown item",
          category: null,
          totalQuantity: qty != null ? roundQty(qty) : null,
          unit,
          unitConverted: false,
          sourceCount: 1,
          mergeWarning: null,
          mergeConfidence: 0.8,
          sources: [source],
        });
        groupConfidence.set(key, 0.8);
        if (qty == null) mergeFailures.set(key, { kind: "unknown_qty" });
        continue;
      }

      const group = groups.get(key)!;
      group.sources.push(source);
      group.sourceCount += 1;

      // Cross-type merges are inherently less certain (name matched, but one side
      // was user-typed free text)
      if (isCrossType) {
        const prev = groupConfidence.get(key) ?? 1.0;
        groupConfidence.set(key, Math.min(prev, 0.7));
      }

      if (mergeFailures.has(key)) continue;

      if (qty == null || group.totalQuantity == null) {
        group.totalQuantity = null;
        mergeFailures.set(key, { kind: "unknown_qty" });
        continue;
      }

      if (unit === null && group.unit === null) {
        group.totalQuantity = roundQty(group.totalQuantity + qty);
        continue;
      }

      if (unit === group.unit) {
        group.totalQuantity = roundQty(group.totalQuantity + qty);
        continue;
      }

      if (unit === null || group.unit === null) {
        group.totalQuantity = null;
        mergeFailures.set(key, { kind: "mixed_unit_presence" });
        continue;
      }

      const converted = convertUnit(qty, unit, group.unit);
      if (converted !== null) {
        group.totalQuantity = roundQty(group.totalQuantity + converted);
        group.unitConverted = true;
        continue;
      }

      group.totalQuantity = null;
      const dA = getUnitDimension(group.unit);
      const dB = getUnitDimension(unit);
      mergeFailures.set(
        key,
        dA !== dB
          ? { kind: "incompatible_dims", unitA: group.unit, unitB: unit }
          : { kind: "same_dim_no_convert", unitA: group.unit, unitB: unit }
      );
    }
  }

  // Stamp merge warnings and final confidence onto groups
  for (const [key, reason] of mergeFailures) {
    const group = groups.get(key);
    if (group) group.mergeWarning = mergeWarningText(reason);
  }
  for (const [key, conf] of groupConfidence) {
    const group = groups.get(key);
    if (group) group.mergeConfidence = conf;
  }

  // ── Sort: resolved first, then alphabetically ──────────────────────────────
  const items = [...groups.values()].sort((a, b) => {
    if (a.ingredientId && !b.ingredientId) return -1;
    if (!a.ingredientId && b.ingredientId) return 1;
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  const unresolvedCount = items.filter((i) => !i.ingredientId).length;

  // ── Potential duplicate detection ─────────────────────────────────────────
  // Scan unresolved items (no ingredientId) for pairs that share a significant word
  // (> 3 chars). These may be the same ingredient entered differently by two recipes.
  const potentialDuplicates = detectPotentialDuplicates(
    items.filter((i) => !i.ingredientId)
  );

  track("shopping_list_generated", {
    userId,
    planId,
    itemCount: items.length,
    unresolvedCount,
    potentialDuplicateCount: potentialDuplicates.length,
    mergeWarningCount: items.filter((i) => i.mergeWarning !== null).length,
  });

  return {
    mealPlanWeekId: planId,
    weekStart: plan.weekStart.toISOString().slice(0, 10),
    items,
    unresolvedCount,
    potentialDuplicates,
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
