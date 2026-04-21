// Unit conversion utilities used by both the shopping aggregation service
// and the ingredient parser for normalisation.

// ─── Conversion tables ────────────────────────────────────────────────────────
// All factors convert TO the base unit (ml for volume, g for weight).

export const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.78676,
  "fl oz": 29.57353,
  cup: 236.58824,
  pint: 473.17647,
  quart: 946.35295,
  gallon: 3785.4118,
};

export const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.34952,
  lb: 453.59237,
};

// Count-based units — no numeric conversion between them.
// Two "cloves" and three "cloves" → 5 cloves, but "clove" ≠ "slice".
const COUNT_UNITS = new Set([
  "clove",
  "slice",
  "can",
  "jar",
  "package",
  "bunch",
  "head",
  "piece",
  "sprig",
  "stalk",
  "stick",
  "sheet",
  "strip",
  "pinch",
  "dash",
  "handful",
  "drop",
]);

export type UnitDimension = "volume" | "weight" | "count" | "unknown";

export function getUnitDimension(unit: string): UnitDimension {
  if (unit in VOLUME_TO_ML) return "volume";
  if (unit in WEIGHT_TO_G) return "weight";
  if (COUNT_UNITS.has(unit)) return "count";
  return "unknown";
}

// ─── Core conversion ──────────────────────────────────────────────────────────

/**
 * Convert `quantity` from `fromUnit` to `toUnit`.
 * Returns null when conversion is impossible (different dimensions or unknown unit).
 * Round-trips through the base unit, so precision is float-safe for recipe quantities.
 */
export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string
): number | null {
  if (fromUnit === toUnit) return quantity;

  // Volume → volume
  const fromMl = VOLUME_TO_ML[fromUnit];
  const toMl = VOLUME_TO_ML[toUnit];
  if (fromMl !== undefined && toMl !== undefined) {
    return (quantity * fromMl) / toMl;
  }

  // Weight → weight
  const fromG = WEIGHT_TO_G[fromUnit];
  const toG = WEIGHT_TO_G[toUnit];
  if (fromG !== undefined && toG !== undefined) {
    return (quantity * fromG) / toG;
  }

  // Count → count: only if identical unit (handled above)
  return null;
}

/**
 * Given a list of (quantity, unit) pairs, find the best target unit and return
 * the summed total.  Returns null total if any conversion is impossible.
 * The "best" target is the first non-null unit seen (preserves user intent).
 */
export function aggregateQuantities(
  items: Array<{ quantity: number | null; unit: string | null }>
): { total: number | null; unit: string | null; converted: boolean } {
  const withValues = items.filter((i) => i.quantity != null);
  if (withValues.length === 0) return { total: null, unit: null, converted: false };

  const targetUnit = withValues.find((i) => i.unit != null)?.unit ?? null;
  if (!targetUnit) {
    // All quantities present but no units — sum as-is
    const total = withValues.reduce((sum, i) => sum + i.quantity!, 0);
    return { total, unit: null, converted: false };
  }

  let total = 0;
  let converted = false;

  for (const item of withValues) {
    if (item.quantity == null) continue;

    if (item.unit === null) {
      // Quantity without unit — can't reliably aggregate; bail out
      return { total: null, unit: targetUnit, converted };
    }

    if (item.unit === targetUnit) {
      total += item.quantity;
    } else {
      const result = convertUnit(item.quantity, item.unit, targetUnit);
      if (result === null) {
        return { total: null, unit: targetUnit, converted };
      }
      total += result;
      converted = true;
    }
  }

  return { total, unit: targetUnit, converted };
}

/** Round a quantity to a human-readable precision (max 3 sig figs). */
export function roundQty(n: number): number {
  if (n === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const factor = Math.pow(10, 2 - magnitude);
  return Math.round(n * factor) / factor;
}
