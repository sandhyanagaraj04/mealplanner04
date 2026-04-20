import { z } from "zod";

export const RecipeCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  servings: z.number().int().min(1).max(100).default(2),
  prepMins: z.number().int().min(0).max(1440).default(0),
  cookMins: z.number().int().min(0).max(1440).default(0),
  rawIngredients: z.string().min(1),
  rawInstructions: z.string().min(1),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
});

export const RecipeUpdateSchema = RecipeCreateSchema.partial();

export type RecipeCreate = z.infer<typeof RecipeCreateSchema>;
export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;
