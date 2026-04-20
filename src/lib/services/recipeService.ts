import { db } from "@/lib/db";
import { parseIngredientsBlock } from "@/lib/parsers/ingredientParser";
import { parseInstructions } from "@/lib/parsers/instructionParser";
import { findIngredientByName } from "@/lib/services/ingredientService";
import type { RecipeCreate, RecipeUpdate, PatchIngredient } from "@/lib/validations/recipe";

// ─── Read ──────────────────────────────────────────────────────────────────────

const recipeWithRelations = {
  ingredients: {
    include: { ingredient: true },
    orderBy: { sortOrder: "asc" as const },
  },
  steps: { orderBy: { stepNumber: "asc" as const } },
} as const;

export async function getRecipe(id: string, userId: string) {
  return db.recipe.findFirst({
    where: { id, userId },
    include: recipeWithRelations,
  });
}

export async function listRecipes(
  userId: string,
  opts: { limit: number; offset: number; q?: string }
) {
  const where = {
    userId,
    ...(opts.q
      ? { name: { contains: opts.q, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await db.$transaction([
    db.recipe.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        servings: true,
        prepMins: true,
        cookMins: true,
        source: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { ingredients: true } },
      },
      skip: opts.offset,
      take: opts.limit,
      orderBy: { updatedAt: "desc" },
    }),
    db.recipe.count({ where }),
  ]);

  return { items, total };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRecipe(userId: string, data: RecipeCreate) {
  const parsedIngredients = parseIngredientsBlock(data.rawIngredients);
  const parsedSteps = parseInstructions(data.rawInstructions);

  // Attempt to auto-link each parsed ingredient to the canonical Ingredient table
  const ingredientLinks = await Promise.all(
    parsedIngredients.map(async (pi) => {
      if (!pi.name) return null;
      const match = await findIngredientByName(pi.name);
      return match?.id ?? null;
    })
  );

  return db.$transaction(async (tx) => {
    const recipe = await tx.recipe.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        servings: data.servings,
        prepMins: data.prepMins ?? 0,
        cookMins: data.cookMins ?? 0,
        source: data.source,
        rawIngredients: data.rawIngredients,
        rawInstructions: data.rawInstructions,
      },
    });

    await tx.recipeIngredient.createMany({
      data: parsedIngredients.map((pi, idx) => ({
        recipeId: recipe.id,
        sortOrder: idx,
        rawText: pi.rawText,
        quantity: pi.quantity,
        unit: pi.unit,
        ingredientId: ingredientLinks[idx],
        notes: pi.notes,
        isOptional: pi.isOptional,
      })),
    });

    await tx.recipeStep.createMany({
      data: parsedSteps.map((s) => ({
        recipeId: recipe.id,
        stepNumber: s.stepNumber,
        instruction: s.instruction,
        durationMins: s.durationMins,
      })),
    });

    return tx.recipe.findUniqueOrThrow({
      where: { id: recipe.id },
      include: recipeWithRelations,
    });
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateRecipe(id: string, userId: string, data: RecipeUpdate) {
  // Verify ownership
  const existing = await db.recipe.findFirst({ where: { id, userId } });
  if (!existing) return null;

  // If raw text changed, re-parse and replace child rows
  const reParseIngredients =
    data.rawIngredients !== undefined && data.rawIngredients !== existing.rawIngredients;
  const reParseSteps =
    data.rawInstructions !== undefined && data.rawInstructions !== existing.rawInstructions;

  return db.$transaction(async (tx) => {
    if (reParseIngredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      const parsed = parseIngredientsBlock(data.rawIngredients!);
      const links = await Promise.all(
        parsed.map(async (pi) => {
          if (!pi.name) return null;
          const match = await findIngredientByName(pi.name);
          return match?.id ?? null;
        })
      );
      await tx.recipeIngredient.createMany({
        data: parsed.map((pi, idx) => ({
          recipeId: id,
          sortOrder: idx,
          rawText: pi.rawText,
          quantity: pi.quantity,
          unit: pi.unit,
          ingredientId: links[idx],
          notes: pi.notes,
          isOptional: pi.isOptional,
        })),
      });
    }

    if (reParseSteps) {
      await tx.recipeStep.deleteMany({ where: { recipeId: id } });
      const steps = parseInstructions(data.rawInstructions!);
      await tx.recipeStep.createMany({
        data: steps.map((s) => ({
          recipeId: id,
          stepNumber: s.stepNumber,
          instruction: s.instruction,
          durationMins: s.durationMins,
        })),
      });
    }

    return tx.recipe.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.servings !== undefined && { servings: data.servings }),
        ...(data.prepMins !== undefined && { prepMins: data.prepMins }),
        ...(data.cookMins !== undefined && { cookMins: data.cookMins }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.rawIngredients !== undefined && { rawIngredients: data.rawIngredients }),
        ...(data.rawInstructions !== undefined && { rawInstructions: data.rawInstructions }),
      },
      include: recipeWithRelations,
    });
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRecipe(id: string, userId: string): Promise<boolean> {
  const existing = await db.recipe.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await db.recipe.delete({ where: { id } });
  return true;
}

// ─── Re-parse (explicit user action) ─────────────────────────────────────────
// Keeps rawIngredients/rawInstructions intact; replaces all parsed child rows.

export async function reparseRecipe(id: string, userId: string) {
  const recipe = await db.recipe.findFirst({ where: { id, userId } });
  if (!recipe) return null;

  return updateRecipe(id, userId, {
    rawIngredients: recipe.rawIngredients,
    rawInstructions: recipe.rawInstructions,
  });
}

// ─── Patch a single ingredient row ───────────────────────────────────────────
// Lets the user correct a single parsed field without touching anything else.

export async function patchRecipeIngredient(
  recipeId: string,
  ingredientRowId: string,
  userId: string,
  data: PatchIngredient
) {
  // Verify recipe ownership
  const recipe = await db.recipe.findFirst({ where: { id: recipeId, userId } });
  if (!recipe) return null;

  return db.recipeIngredient.update({
    where: { id: ingredientRowId, recipeId },
    data: {
      ...(data.quantity !== undefined && { quantity: data.quantity }),
      ...(data.unit !== undefined && { unit: data.unit }),
      ...(data.ingredientId !== undefined && { ingredientId: data.ingredientId }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isOptional !== undefined && { isOptional: data.isOptional }),
    },
    include: { ingredient: true },
  });
}
