// ─── Domain constants ──────────────────────────────────────────────────────────

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const SHOPPING_STATES = ["PENDING", "HAVE_IT", "NEED_TO_BUY", "BOUGHT"] as const;
export type ShoppingState = (typeof SHOPPING_STATES)[number];

export const INGREDIENT_CATEGORIES = [
  "baking",
  "produce",
  "dairy",
  "protein",
  "pantry",
  "spice",
  "other",
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

// ─── Parser output ─────────────────────────────────────────────────────────────
// The parser always returns this shape; null fields mean "could not determine".
// The UI should surface null fields for user correction.

export interface ParsedIngredient {
  rawText: string;
  quantity: number | null;
  unit: string | null;
  // name is what we'll try to match against the Ingredient table
  name: string | null;
  notes: string | null;
  isOptional: boolean;
}

// ─── API response envelope ─────────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiOk<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Shopping list aggregation ─────────────────────────────────────────────────

export interface ShoppingSource {
  stateId: string | null; // null if MealPlanIngredientState row doesn't exist yet
  mealPlanItemId: string;
  dayOfWeek: DayOfWeek;
  mealType: MealType;
  recipeName: string;
  scaledQuantity: number | null;
  unit: string | null;
  state: ShoppingState;
  quantityOverride: number | null;
  unitOverride: string | null;
  note: string | null;
}

export interface ShoppingListItem {
  // null if no canonical ingredient was matched
  ingredientId: string | null;
  // canonical name if matched, otherwise the raw text of first occurrence
  ingredientName: string;
  category: string | null;

  // Aggregated quantity — only non-null when all sources share the same unit
  // and all have a quantity. Otherwise surfaces sources individually.
  totalQuantity: number | null;
  unit: string | null;

  sources: ShoppingSource[];
}

export interface ShoppingList {
  mealPlanWeekId: string;
  weekStart: string; // ISO date string
  items: ShoppingListItem[];
  // Items with no canonical ingredient match (need user attention)
  unresolvedCount: number;
}

// ─── Service input/output types ────────────────────────────────────────────────

export interface CreateRecipeInput {
  name: string;
  description?: string;
  servings: number;
  prepMins?: number;
  cookMins?: number;
  source?: string;
  rawIngredients: string;
  rawInstructions: string;
}

export interface UpdateRecipeInput {
  name?: string;
  description?: string;
  servings?: number;
  prepMins?: number;
  cookMins?: number;
  source?: string;
  rawIngredients?: string;
  rawInstructions?: string;
}

// Patch a single parsed ingredient field without re-running the full parser
export interface PatchIngredientInput {
  quantity?: number | null;
  unit?: string | null;
  ingredientId?: string | null;
  notes?: string | null;
  isOptional?: boolean;
}

export interface CreateMealPlanInput {
  name?: string;
  weekStart: string; // ISO date "YYYY-MM-DD" — will be normalised to Monday
  notes?: string;
}

export interface AddMealPlanItemInput {
  recipeId: string;
  dayOfWeek: DayOfWeek;
  mealType: MealType;
  servings: number;
  customNote?: string;
}

export interface UpdateMealPlanItemInput {
  servings?: number;
  dayOfWeek?: DayOfWeek;
  mealType?: MealType;
  customNote?: string | null;
}

export interface UpdateIngredientStateInput {
  state: ShoppingState;
  quantityOverride?: number | null;
  unitOverride?: string | null;
  note?: string | null;
}
