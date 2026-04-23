import { z } from "zod";
import { MEAL_TYPES, SHOPPING_STATES } from "@/types";

export const MealPlanCreateSchema = z.object({
  name: z.string().max(200).optional(),
  // Accept any ISO date string; the service normalises it to the Monday of that week
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  notes: z.string().max(2000).optional(),
});

export const MealPlanUpdateSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const AddQuickItemSchema = z.object({
  type: z.literal("quick"),
  name: z.string().min(1).max(200),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(MEAL_TYPES),
  customNote: z.string().optional(),
});

const AddRecipeItemSchema = z.object({
  type: z.literal("recipe"),
  recipeId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(MEAL_TYPES),
  servings: z.number().int().min(1),
  customNote: z.string().optional(),
});

export const AddItemSchema = z.discriminatedUnion("type", [AddQuickItemSchema, AddRecipeItemSchema]);

export const UpdateItemSchema = z.object({
  servings: z.number().int().min(1).max(500).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  customNote: z.string().max(500).nullable().optional(),
  recipeId: z.string().optional(),
  name: z.string().max(200).optional(),
});

export const UpdateIngredientStateSchema = z.object({
  state: z.enum(SHOPPING_STATES),
  quantityOverride: z.number().positive().nullable().optional(),
  unitOverride: z.string().max(50).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export type MealPlanCreate = z.infer<typeof MealPlanCreateSchema>;
export type MealPlanUpdate = z.infer<typeof MealPlanUpdateSchema>;
export type AddItem = z.infer<typeof AddItemSchema>;
export type UpdateItem = z.infer<typeof UpdateItemSchema>;
export type UpdateIngredientState = z.infer<typeof UpdateIngredientStateSchema>;
