import { db } from "@/lib/db";
import { convertUnit, roundQty } from "@/lib/parsers/unitConverter";
import type {
  ShoppingList,
  ShoppingListItem,
  ShoppingSource,
  ShoppingState,
  DayOfWeek,
  MealType,
} from "@/types";
import type { UpdateIngredientState } from "@/lib/validations/mealplan";

// ─── Aggregation ──────────────────────────────────────────────────────────────
// Groups ingredients across all meal plan items for the week.
//
// Same canonical ingredient (same ingredientId) → same group.
// No canonical match → grouped by normalised rawText.
//
// Quantities are summed after unit conversion to the group's target unit
// (the first non-null unit seen in the group). If conversion is impossible
// (e.g. volume vs weight) the group's totalQuantity is set to null, and the
// UI must show per-source quantities instead.

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

  // Fetch all recipe ingredients referenced in the plan
  const recipeIds = [...new Set(plan.items.map((i) => i.recipeId))];
  const ingredients = await db.recipeIngredient.findMany({
    where: { recipeId: { in: recipeIds } },
    include: { ingredient: true },
  });

  // Index recipe ingredients by id for O(1) lookup
  const riMap = new Map(ingredients.map((ri) => [ri.id, ri]));

  // Index shopping states: mealPlanItemId → Map<recipeIngredientId, stateRow>
  type StateRow = (typeof plan.items)[0]["ingredientStates"][0];
  const stateIndex = new Map<string, Map<string, StateRow>>();
  for (const item of plan.items) {
    const byRi = new Map<string, StateRow>();
    for (const s of item.ingredientStates) byRi.set(s.recipeIngredientId, s);
    stateIndex.set(item.id, byRi);
  }

  // ── Build groups ───────────────────────────────────────────────────────────
  const groups = new Map<string, ShoppingListItem>();

  for (const item of plan.items) {
    const recipeIngredients = ingredients.filter((ri) => ri.recipeId === item.recipeId);
    const stateByRi = stateIndex.get(item.id) ?? new Map();

    for (const ri of recipeIngredients) {
      const stateRow = stateByRi.get(ri.id);

      // Effective quantity: user override > scaled recipe quantity
      const scaledQty = ri.quantity != null ? ri.quantity * item.scaleFactor : null;
      const effectiveQty = stateRow?.quantityOverride ?? scaledQty;
      const effectiveUnit = stateRow?.unitOverride ?? ri.unit;

      const source: ShoppingSource = {
        stateId: stateRow?.id ?? null,
        mealPlanItemId: item.id,
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

      const key = ri.ingredientId
        ? `ingredient:${ri.ingredientId}`
        : `raw:${ri.rawText.toLowerCase().trim()}`;

      if (!groups.has(key)) {
        groups.set(key, {
          ingredientId: ri.ingredientId ?? null,
          ingredientName: ri.ingredient?.name ?? ri.rawText,
          category: ri.ingredient?.category ?? null,
          totalQuantity: effectiveQty != null ? roundQty(effectiveQty) : null,
          unit: effectiveUnit,
          unitConverted: false,
          sources: [source],
        });
        continue;
      }

      const group = groups.get(key)!;
      group.sources.push(source);

      // ── Unit aggregation with conversion ──────────────────────────────────
      if (effectiveQty == null || group.totalQuantity == null) {
        // One side is null — can't aggregate
        group.totalQuantity = null;
        continue;
      }

      if (effectiveUnit === null && group.unit === null) {
        // Both unitless — sum as counts
        group.totalQuantity = roundQty(group.totalQuantity + effectiveQty);
        continue;
      }

      if (effectiveUnit === group.unit) {
        group.totalQuantity = roundQty(group.totalQuantity + effectiveQty);
        continue;
      }

      // Units differ — attempt conversion to group's target unit
      if (effectiveUnit != null && group.unit != null) {
        const converted = convertUnit(effectiveQty, effectiveUnit, group.unit);
        if (converted !== null) {
          group.totalQuantity = roundQty(group.totalQuantity + converted);
          group.unitConverted = true;
          continue;
        }
      }

      // Conversion impossible (different dimensions) — null out total
      group.totalQuantity = null;
    }
  }

  // ── Sort: resolved ingredients first, then alphabetically ─────────────────
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
