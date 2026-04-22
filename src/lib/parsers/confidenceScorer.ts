import type {
  IngredientDraftLine,
  StepDraftLine,
  ParseWarning,
  RecipeIngestionDraft,
} from "@/types";

// ─── Per-ingredient scoring ───────────────────────────────────────────────────

export function scoreIngredientLine(line: IngredientDraftLine): number {
  const hasName = line.displayName !== null && line.displayName.trim().length > 0;
  const hasQty = line.quantity !== null;
  const hasUnit = line.unit !== null;
  const hasMatch = line.ingredientId !== null;

  if (hasName && hasQty && hasUnit && hasMatch) return 1.0;
  if (hasName && hasQty && hasUnit) return 0.9;
  if (hasName && hasQty) return 0.75;   // e.g. "2 eggs" — no unit, common case
  if (hasName) return 0.55;             // name only
  if (hasQty) return 0.25;             // quantity with no name
  return 0.0;                           // completely raw, nothing parsed
}

// ─── Per-field scoring ────────────────────────────────────────────────────────

function scoreTitle(title: string | null): number {
  if (!title) return 0;
  if (title.length < 3) return 0.3;    // suspiciously short
  if (title.length > 120) return 0.6;  // suspiciously long
  return 1.0;
}

function scoreServings(servings: number | null): number {
  if (servings === null) return 0;
  if (servings < 1 || servings > 200) return 0.4; // implausible
  return 1.0;
}

function scoreIngredients(lines: IngredientDraftLine[]): number {
  if (lines.length === 0) return 0;
  const scores = lines.map(scoreIngredientLine);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function scoreSteps(steps: StepDraftLine[]): number {
  if (steps.length === 0) return 0;
  if (steps.length === 1) return 0.4;  // single block — probably not well-parsed
  if (steps.length >= 2 && steps.length <= 20) return 1.0;
  // Very many steps might mean over-splitting
  return 0.7;
}

// ─── Warning generation ───────────────────────────────────────────────────────

export function generateWarnings(draft: {
  title: string | null;
  servings: number | null;
  ingredients: IngredientDraftLine[];
  steps: StepDraftLine[];
}): ParseWarning[] {
  const warnings: ParseWarning[] = [];

  if (!draft.title) {
    warnings.push({
      code: "MISSING_TITLE",
      message: "No recipe title could be detected. Please add one before saving.",
      field: "title",
      context: null,
    });
  }

  if (draft.servings === null) {
    warnings.push({
      code: "MISSING_SERVINGS",
      message: "Serving count not found. Scaling will use a default of 2.",
      field: "servings",
      context: null,
    });
  }

  if (draft.ingredients.length === 0) {
    warnings.push({
      code: "NO_INGREDIENTS_FOUND",
      message:
        "No ingredients were detected. Paste the ingredient list directly, or add them manually below.",
      field: "ingredients",
      context: null,
    });
  }

  if (draft.steps.length === 0) {
    warnings.push({
      code: "NO_STEPS_FOUND",
      message: "No cooking steps were detected. The instructions block may need manual splitting.",
      field: "steps",
      context: null,
    });
  }

  draft.steps.forEach((step, idx) => {
    if (step.instruction.trim().length < 15) {
      warnings.push({
        code: "STEP_TOO_SHORT",
        message: `Step ${step.stepNumber} is very short and may be incomplete.`,
        field: `steps[${idx}]`,
        context: step.instruction,
      });
    }
  });

  let noQtyCount = 0;
  let noUnitCount = 0;

  draft.ingredients.forEach((line, idx) => {
    if (line.displayName === null && line.quantity === null) {
      warnings.push({
        code: "INGREDIENT_PARSE_FAILED",
        message: `Could not parse this ingredient line. Raw text preserved.`,
        field: `ingredients[${idx}]`,
        context: line.rawText,
      });
    } else {
      if (line.quantity === null && !line.isOptional) noQtyCount++;
      if (line.unit === null && line.quantity !== null) noUnitCount++;
      if (line.ingredientId === null && line.displayName !== null) {
        warnings.push({
          code: "INGREDIENT_NO_MATCH",
          message: `"${line.displayName}" has no match in the ingredient database. Link it manually.`,
          field: `ingredients[${idx}]`,
          context: line.rawText,
        });
      }
    }
  });

  if (noQtyCount > 0) {
    warnings.push({
      code: "INGREDIENT_NO_QUANTITY",
      message: `${noQtyCount} ingredient${noQtyCount > 1 ? "s have" : " has"} no detected quantity.`,
      field: "ingredients",
      context: null,
    });
  }

  if (noUnitCount > 0) {
    warnings.push({
      code: "INGREDIENT_NO_UNIT",
      message: `${noUnitCount} ingredient${noUnitCount > 1 ? "s have" : " has"} a quantity but no unit — assumed to be a count.`,
      field: "ingredients",
      context: null,
    });
  }

  return warnings;
}

// ─── Overall confidence ───────────────────────────────────────────────────────

/**
 * Computes the overall confidence score as a weighted average.
 * Weights: title 20%, ingredients 40%, steps 30%, servings 10%.
 * Also applies a penalty for zero-length sections.
 */
export function computeConfidence(
  draft: RecipeIngestionDraft,
  baseConfidence = 1.0
): number {
  const titleScore = scoreTitle(draft.title);
  const ingredientScore = scoreIngredients(draft.ingredients);
  const stepsScore = scoreSteps(draft.steps);
  const servingsScore = scoreServings(draft.servings);

  const weighted =
    titleScore * 0.2 +
    ingredientScore * 0.4 +
    stepsScore * 0.3 +
    servingsScore * 0.1;

  // Apply the extraction method's base confidence as a ceiling
  return Math.min(weighted, baseConfidence);
}
