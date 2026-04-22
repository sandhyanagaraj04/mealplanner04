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
  | "NO_INGREDIENTS_FOUND"
  | "INGREDIENT_NO_QUANTITY"
  | "INGREDIENT_NO_UNIT"
  | "INGREDIENT_NO_MATCH"
  | "INGREDIENT_PARSE_FAILED"
  | "URL_FETCH_FAILED"
  | "URL_TIMEOUT"
  | "URL_NOT_HTML"
  | "URL_NO_STRUCTURED_DATA"
  | "URL_VIDEO_DETECTED"
  | "URL_MULTIPLE_RECIPES"
  | "URL_PRIVATE_HOST"
  | "URL_FETCH_PARTIAL"
  | "STEP_TOO_SHORT"
  | "NO_STEPS_FOUND"
  | "LOW_CONFIDENCE"
  | "SECTION_DETECTION_FAILED"
  | "SERVINGS_AMBIGUOUS"
  | "UNIT_CONVERSION_IMPOSSIBLE"
  | "SHOPPING_POTENTIAL_DUPLICATE";

export interface ParseWarning {
  code: WarningCode;
  message: string;
  // Which field the warning is about ("ingredients[2]", "steps", "title", …)
  field: string | null;
  // The raw line or value that triggered this warning — always preserved
  context: string | null;
}

// ─── Per-ingredient draft line ─────────────────────────────────────────────────
// Stored in RecipeIngestion.parsedDraft JSON.
// rawText is ALWAYS set. All other fields are nullable — null = parser could not
// determine with sufficient confidence; the UI must surface nulls for correction.

export interface IngredientDraftLine {
  rawText: string;           // immutable source — never discarded
  displayName: string | null;    // full name as written: "finely chopped onions"
  normalizedName: string | null; // canonical: "onion" — null if unsure
  quantity: number | null;
  quantityMax: number | null;    // non-null for ranges: "3–4" → max: 4
  unit: string | null;
  preparationNote: string | null; // "finely chopped", "to taste"
  isOptional: boolean;
  ingredientId: string | null;   // null = no canonical Ingredient DB match
  confidence: number;            // 0–1 per this line (see confidenceScorer)
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
// Returned by ingredientParser.parseIngredientLine.
// All nullable fields mean "could not determine" — never silently guessed.
// _prepNoteSource is internal; used by confidenceScorer then dropped.

export type PrepNoteSource = "comma" | "paren" | "prefix" | null;

export interface ParsedIngredient {
  rawText: string;

  // What the user sees: full name as written, prep words included
  displayName: string | null;
  // Canonical form: lowercase, no prep words, singularized where safe
  // null when normalisation confidence was too low to attempt
  normalizedName: string | null;

  // Quantity: primary value (or lower bound for ranges)
  quantity: number | null;
  // Upper bound when the original text was a range ("3–4 cloves")
  quantityMax: number | null;
  unit: string | null;

  // Extracted prep instruction — "finely chopped", "to taste", "at room temp"
  preparationNote: string | null;
  isOptional: boolean;

  // Internal flag — how the prep note was found; affects per-line confidence
  _prepNoteSource: PrepNoteSource;
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
  recipeIngredientId: string;
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
  unitConverted: boolean;
  // How many distinct meal plan slots need this ingredient
  sourceCount: number;
  // Non-null when quantities could not be merged (incompatible units, missing qty, etc.)
  mergeWarning: string | null;
  sources: ShoppingSource[];
}

export interface ShoppingList {
  mealPlanWeekId: string;
  weekStart: string;
  items: ShoppingListItem[];
  unresolvedCount: number;
  // Pairs of unresolved ingredient names that share words and may be duplicates.
  // Each tuple is [nameA, nameB] from items in the unresolved category.
  potentialDuplicates: [string, string][];
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
