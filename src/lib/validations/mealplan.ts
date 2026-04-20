import { z } from "zod";
import { MEAL_TYPES } from "@/types";

export const MealPlanCreateSchema = z.object({
  name: z.string().min(1).max(200),
  weekStart: z.string().datetime(), // ISO UTC Monday
  notes: z.string().max(2000).optional(),
});

export const MealSlotUpdateSchema = z.object({
  recipeId: z.string().cuid().nullable(),
  customNote: z.string().max(500).nullable(),
});

export const MealSlotBulkUpdateSchema = z.object({
  slots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealType: z.enum(MEAL_TYPES as [string, ...string[]]),
      recipeId: z.string().cuid().nullable().optional(),
      customNote: z.string().max(500).nullable().optional(),
    })
  ),
});

export type MealPlanCreate = z.infer<typeof MealPlanCreateSchema>;
export type MealSlotUpdate = z.infer<typeof MealSlotUpdateSchema>;
