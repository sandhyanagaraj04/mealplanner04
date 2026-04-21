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

// ─── Ingestion ─────────────────────────────────────────────────────────────────

export type IngestionSourceType = "url" | "text";

export type IngestionStatus = "draft" | "confirmed" | "discarded";

export type WarningCode =
  | "MISSING_TITLE"
  | "MISSING_SERVINGS"
  | "INGREDIENT_NO_QUANTITY"
  | "INGREDIENT_NO_UNIT"
  | "INGREDIENT_NO_MATCH"
  | "INGREDIENT_PARSE_FAILED"
  | "URL_FETCH_FAILED"
  | "URL_TIMEOUT"
  | "URL_NOT_HTML"
  | "URL_NO_STRUCTURED_DATA"
  | "URL_PRIVATE_HOST"
  | "URL_FETCH_PARTIAL"
  | "STEP_TOO_SHORT"
  | "NO_STEPS_FOUND"
  | "LOW_CONFIDENCE"
  | "SECTION_DETECTION_FAILED"
  | "SERVINGS_AMBIGUOUS"
  | "UNIT_CONVERSION_IMPOSSIBLE";

export interface ParseWarning {
  code: WarningCode;
  message: string;
  // Which field the warning is about ("ingredients[2]", "steps", "title", …)
  field: string | null;
  // The raw line or value that triggered this warning — always preserved
  context: string | null;
}

// ─── Per-ingredient draft line ─────────────────────────────────────────────────
// rawText is always set. All other fields are nullable — null = parser could not
// determine; the UI must surface nulls so the user can correct them.

export interface IngredientDraftLine {
  rawText: string;        // immutable source — never discarded
  quantity: number | null;
  unit: string | null;    // normalised unit string, e.g. "g", "cup"
  name: string | null;    // ingredient name after quantity + unit
  notes: string | null;   // prep notes, e.g. "finely chopped"
  isOptional: boolean;
  ingredientId: string | null;  // null = no canonical Ingredient match found
  confidence: number;     // 0–1 per this line
}

export interface StepDraftLine {
  stepNumber: number;
  instruction: string;    // always the full text, never truncated
  durationMins: number | null;
}

// ─── Full ingestion draft ──────────────────────────────────────────────────────

export interface RecipeIngestionDraft {
  title: string | null;
  servings: number | null;
  ingredients: IngredientDraftLine[];
  steps: StepDraftLine[];
  // Overall quality signals
  confidence: number;     // 0–1 weighted average
  warnings: ParseWarning[];
}

// ─── Raw content extraction result (internal) ─────────────────────────────────

export interface ExtractedContent {
  // Which extraction method succeeded
  method: "schema_org" | "section_headers" | "heuristic";
  title: string | null;
  servings: number | null;
  // Raw ingredient lines — one per array entry, unparsed
  ingredientLines: string[];
  // Raw instruction text block — passed to instructionParser
  instructionText: string;
  // The method-specific base confidence before per-field adjustments
  baseConfidence: number;
  warnings: ParseWarning[];
}

// ─── Parser output (single ingredient line) ────────────────────────────────────

export interface ParsedIngredient {
  rawText: string;
  quantity: number | null;
  unit: string | null;
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
  stateId: string | null;
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
  ingredientId: string | null;
  ingredientName: string;
  category: string | null;
  totalQuantity: number | null;
  unit: string | null;
  // Whether totalQuantity required unit conversion (may affect precision)
  unitConverted: boolean;
  sources: ShoppingSource[];
}

export interface ShoppingList {
  mealPlanWeekId: string;
  weekStart: string;
  items: ShoppingListItem[];
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

export interface PatchIngredientInput {
  quantity?: number | null;
  unit?: string | null;
  ingredientId?: string | null;
  notes?: string | null;
  isOptional?: boolean;
}

export interface CreateMealPlanInput {
  name?: string;
  weekStart: string;
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
