import { db } from "@/lib/db";
import type {
  MealPlanCreate,
  MealPlanUpdate,
  AddItem,
  UpdateItem,
} from "@/lib/validations/mealplan";

// ─── Week helpers ──────────────────────────────────────────────────────────────

// Normalise any date to the Monday of its ISO week at UTC midnight
function toMondayUTC(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// ─── Week CRUD ────────────────────────────────────────────────────────────────

function weekWithItems() {
  return {
    items: {
      include: {
        recipe: {
          select: { id: true, name: true, servings: true, prepMins: true, cookMins: true },
        },
      },
      orderBy: [
        { dayOfWeek: "asc" as const },
        { mealType: "asc" as const },
      ],
    },
  };
}

export async function listMealPlans(
  userId: string,
  opts: { limit: number; offset: number }
) {
  const [items, total] = await db.$transaction([
    db.mealPlanWeek.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        weekStart: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
      skip: opts.offset,
      take: opts.limit,
      orderBy: { weekStart: "desc" },
    }),
    db.mealPlanWeek.count({ where: { userId } }),
  ]);
  return { items, total };
}

export async function getMealPlan(id: string, userId: string) {
  return db.mealPlanWeek.findFirst({
    where: { id, userId },
    include: weekWithItems(),
  });
}

export async function createMealPlan(userId: string, data: MealPlanCreate) {
  const weekStart = toMondayUTC(data.weekStart);
  return db.mealPlanWeek.create({
    data: {
      userId,
      name: data.name,
      weekStart,
      notes: data.notes,
    },
    include: weekWithItems(),
  });
}

export async function updateMealPlan(id: string, userId: string, data: MealPlanUpdate) {
  const existing = await db.mealPlanWeek.findFirst({ where: { id, userId } });
  if (!existing) return null;

  return db.mealPlanWeek.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
    include: weekWithItems(),
  });
}

export async function deleteMealPlan(id: string, userId: string): Promise<boolean> {
  const existing = await db.mealPlanWeek.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await db.mealPlanWeek.delete({ where: { id } });
  return true;
}

// ─── Item CRUD ────────────────────────────────────────────────────────────────

export async function addMealPlanItem(planId: string, userId: string, data: AddItem) {
  // Verify plan ownership
  const plan = await db.mealPlanWeek.findFirst({ where: { id: planId, userId } });
  if (!plan) return { error: "not_found" as const };

  // Verify recipe exists and belongs to this user
  const recipe = await db.recipe.findFirst({
    where: { id: data.recipeId, userId },
    select: { id: true, servings: true },
  });
  if (!recipe) return { error: "recipe_not_found" as const };

  const scaleFactor = recipe.servings > 0 ? data.servings / recipe.servings : 1;

  try {
    const item = await db.mealPlanItem.create({
      data: {
        mealPlanWeekId: planId,
        recipeId: data.recipeId,
        dayOfWeek: data.dayOfWeek,
        mealType: data.mealType,
        servings: data.servings,
        scaleFactor,
        customNote: data.customNote,
      },
      include: {
        recipe: {
          select: { id: true, name: true, servings: true },
        },
      },
    });

    // Pre-populate ingredient states so the shopping list is immediately queryable
    const ingredients = await db.recipeIngredient.findMany({
      where: { recipeId: data.recipeId },
      select: { id: true },
    });

    if (ingredients.length > 0) {
      await db.mealPlanIngredientState.createMany({
        data: ingredients.map((ri) => ({
          mealPlanItemId: item.id,
          recipeIngredientId: ri.id,
        })),
        skipDuplicates: true,
      });
    }

    return { item };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") return { error: "conflict" as const };
    throw err;
  }
}

export async function updateMealPlanItem(
  planId: string,
  itemId: string,
  userId: string,
  data: UpdateItem
) {
  const plan = await db.mealPlanWeek.findFirst({ where: { id: planId, userId } });
  if (!plan) return { error: "not_found" as const };

  const item = await db.mealPlanItem.findFirst({
    where: { id: itemId, mealPlanWeekId: planId },
    include: { recipe: { select: { servings: true } } },
  });
  if (!item) return { error: "item_not_found" as const };

  const newServings = data.servings ?? item.servings;
  const scaleFactor = newServings / item.recipe.servings;

  try {
    const updated = await db.mealPlanItem.update({
      where: { id: itemId },
      data: {
        ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
        ...(data.mealType !== undefined && { mealType: data.mealType }),
        ...(data.customNote !== undefined && { customNote: data.customNote }),
        servings: newServings,
        scaleFactor,
      },
      include: {
        recipe: { select: { id: true, name: true, servings: true } },
      },
    });
    return { item: updated };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") return { error: "conflict" as const };
    throw err;
  }
}

export async function removeMealPlanItem(
  planId: string,
  itemId: string,
  userId: string
): Promise<boolean> {
  const plan = await db.mealPlanWeek.findFirst({ where: { id: planId, userId } });
  if (!plan) return false;

  const item = await db.mealPlanItem.findFirst({
    where: { id: itemId, mealPlanWeekId: planId },
  });
  if (!item) return false;

  await db.mealPlanItem.delete({ where: { id: itemId } });
  return true;
}
