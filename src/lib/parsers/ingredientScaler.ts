// Ingredient quantity scaling.
//
// Design invariants:
//   - All functions are pure and immutable — inputs are never modified.
//   - null quantity means "unknown amount"; it stays null after scaling.
//   - unit is preserved exactly as-is; this module does NOT convert units.
//   - scaleFactor = targetServings / recipeDefaultServings.

import { roundQty } from "@/lib/parsers/unitConverter";

// ─── Core math ────────────────────────────────────────────────────────────────

/**
 * Scale a single quantity by a factor.
 * Returns null when qty is null — an unknown amount cannot be scaled.
 * Returns 0 when qty is 0, regardless of factor.
 */
export function scaleQuantity(qty: number | null, factor: number): number | null {
  if (qty === null) return null;
  if (qty === 0) return 0;
  return roundQty(qty * factor);
}

/**
 * Compute the scale factor from recipe default servings → target servings.
 * Guards against division by zero; returns 1 (no scaling) in degenerate cases.
 */
export function computeScaleFactor(defaultServings: number, targetServings: number): number {
  if (defaultServings <= 0 || targetServings <= 0) return 1;
  return targetServings / defaultServings;
}

// ─── Ingredient object scaling ────────────────────────────────────────────────

export interface ScalableIngredient {
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
}

export interface ScaledResult {
  scaledQuantity: number | null;
  scaledQuantityMax: number | null;
  unit: string | null;
}

/**
 * Scale both quantity and quantityMax of an ingredient.
 * Returns a plain ScaledResult so callers can spread it onto whatever shape they need.
 * Does not assume units exist — unit is carried through unchanged.
 */
export function scaleIngredient(ing: ScalableIngredient, factor: number): ScaledResult {
  return {
    scaledQuantity: scaleQuantity(ing.quantity, factor),
    scaledQuantityMax: scaleQuantity(ing.quantityMax, factor),
    unit: ing.unit,
  };
}

// ─── Human-readable formatting ────────────────────────────────────────────────

// Common vulgar fractions used in recipes, ordered by value ascending.
// Tolerance: how close a float can be to the fraction's true value.
const FRACTIONS: Array<[value: number, symbol: string]> = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];
const FRACTION_TOLERANCE = 0.015;

function formatNumber(n: number): string {
  if (n <= 0) return String(Math.round(n));
  const whole = Math.floor(n);
  const frac = n - whole;

  // Exact integer
  if (frac < FRACTION_TOLERANCE) return String(whole);

  // Rounds up to next integer
  if (frac > 1 - FRACTION_TOLERANCE) return String(whole + 1);

  // Try common fractions
  for (const [value, symbol] of FRACTIONS) {
    if (Math.abs(frac - value) < FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole} ${symbol}` : symbol;
    }
  }

  // Decimal fallback — trim trailing zeros
  const decimal = n.toFixed(2).replace(/\.?0+$/, "");
  return decimal;
}

/**
 * Format a (possibly scaled) quantity for display.
 * - null → "" (never shows "null" or "undefined")
 * - range (qty–max): "1–2", "½–¾"
 * - no unit: caller is responsible for appending nothing
 */
export function formatQuantity(
  qty: number | null,
  qtyMax: number | null = null
): string {
  if (qty === null) return "";
  const lo = formatNumber(qty);
  if (qtyMax !== null && Math.abs(qtyMax - qty) > FRACTION_TOLERANCE) {
    return `${lo}–${formatNumber(qtyMax)}`;
  }
  return lo;
}

/**
 * Full display line for a scaled ingredient.
 *
 * Examples (qty | unit | name | prep | optional):
 *   "2 cups all-purpose flour, sifted"
 *   "1–2 cloves garlic, minced (optional)"
 *   "½ tsp fine salt"
 *   "3 eggs"             ← no unit
 *   "salt to taste"      ← null quantity, no unit
 */
export function formatScaledIngredientLine(ing: {
  scaledQuantity: number | null;
  scaledQuantityMax: number | null;
  unit: string | null;
  displayName: string | null;
  rawText: string;
  preparationNote: string | null;
  isOptional: boolean;
}): string {
  const parts: string[] = [];

  const qtyStr = formatQuantity(ing.scaledQuantity, ing.scaledQuantityMax);
  if (qtyStr) parts.push(qtyStr);
  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.displayName ?? ing.rawText);
  if (ing.preparationNote) parts.push(ing.preparationNote);

  const line = parts.join(" ");
  return ing.isOptional ? `${line} (optional)` : line;
}
