import { z } from "zod";

export const RecipeCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  servings: z.number().int().min(1).max(100).default(2),
  prepMins: z.number().int().min(0).max(1440).default(0),
  cookMins: z.number().int().min(0).max(1440).default(0),
  source: z.string().max(500).optional(),
  rawIngredients: z.string().min(1, "At least one ingredient is required"),
  rawInstructions: z.string().min(1, "Instructions are required"),
});

export const RecipeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().min(1).max(100).optional(),
  prepMins: z.number().int().min(0).max(1440).optional(),
  cookMins: z.number().int().min(0).max(1440).optional(),
  source: z.string().max(500).nullable().optional(),
  rawIngredients: z.string().min(1).optional(),
  rawInstructions: z.string().min(1).optional(),
});

// PATCH a single parsed ingredient — used for manual correction without
// triggering a full re-parse of the parent recipe
export const PatchIngredientSchema = z.object({
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  ingredientId: z.string().cuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isOptional: z.boolean().optional(),
});

export type RecipeCreate = z.infer<typeof RecipeCreateSchema>;
export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;
export type PatchIngredient = z.infer<typeof PatchIngredientSchema>;
