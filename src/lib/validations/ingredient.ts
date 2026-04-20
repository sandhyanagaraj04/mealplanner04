import { z } from "zod";
import { INGREDIENT_CATEGORIES } from "@/types";

export const IngredientCreateSchema = z.object({
  name: z.string().min(1).max(200).transform((s) => s.toLowerCase().trim()),
  aliases: z.array(z.string().min(1).max(200)).max(50).default([]),
  category: z.enum(INGREDIENT_CATEGORIES).optional(),
});

export const IngredientUpdateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.toLowerCase().trim())
    .optional(),
  aliases: z.array(z.string().min(1).max(200)).max(50).optional(),
  category: z.enum(INGREDIENT_CATEGORIES).nullable().optional(),
});

export const IngredientSearchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type IngredientCreate = z.infer<typeof IngredientCreateSchema>;
export type IngredientUpdate = z.infer<typeof IngredientUpdateSchema>;
export type IngredientSearch = z.infer<typeof IngredientSearchSchema>;
