import type { ParsedIngredient } from "@/types";
import { normalizeIngredientName } from "@/lib/parsers/ingredientNormalizer";

// ─── Unit normalisation map ────────────────────────────────────────────────────
// key: lowercase variant the user might type → value: canonical unit stored in DB

const UNIT_MAP: Record<string, string> = {
  // Volume – imperial
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  "fl oz": "fl oz",
  "fluid oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  pint: "pint",
  pints: "pint",
  pt: "pint",
  quart: "quart",
  quarts: "quart",
  qt: "quart",
  gallon: "gallon",
  gallons: "gallon",
  gal: "gallon",
  // Volume – metric
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  // Weight – imperial
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  // Weight – metric
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  // Counts / containers
  clove: "clove",
  cloves: "clove",
  slice: "slice",
  slices: "slice",
  can: "can",
  cans: "can",
  jar: "jar",
  jars: "jar",
  package: "package",
  packages: "package",
  pkg: "package",
  bunch: "bunch",
  bunches: "bunch",
  head: "head",
  heads: "head",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  sprig: "sprig",
  sprigs: "sprig",
  stalk: "stalk",
  stalks: "stalk",
  stick: "stick",
  sticks: "stick",
  sheet: "sheet",
  sheets: "sheet",
  strip: "strip",
  strips: "strip",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  handful: "handful",
  handfuls: "handful",
  drop: "drop",
  drops: "drop",
};

// Multi-word units must be tried first (longest match wins)
const SORTED_UNITS = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length);

// ─── Unicode fraction map ──────────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const UNICODE_FRAC_RE = new RegExp(
  `[${Object.keys(UNICODE_FRACTIONS).join("")}]`
);

// ─── Quantity parsing ──────────────────────────────────────────────────────────

interface QuantityResult {
  quantity: number | null;
  quantityMax: number | null;
  rest: string;
}

function parseQuantity(text: string): QuantityResult {
  const s = text.trimStart();

  // Replace unicode fractions with decimal equivalents for easier parsing
  const normalised = s.replace(UNICODE_FRAC_RE, (ch) =>
    String(UNICODE_FRACTIONS[ch] ?? ch)
  );

  // Range: "1-2", "1–2", or "1 to 2" — keep both bounds
  const rangeMatch = normalised.match(/^(\d+(?:\.\d+)?)\s*(?:[–-]|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    return {
      quantity: parseFloat(rangeMatch[1]),
      quantityMax: parseFloat(rangeMatch[2]),
      rest: s.slice(rangeMatch[0].length).trimStart(),
    };
  }

  // Mixed number with unicode fraction: "1½" or "1 ½"
  const mixedUnicodeMatch = normalised.match(/^(\d+)\s*(0\.\d+)/);
  if (mixedUnicodeMatch) {
    const whole = parseInt(mixedUnicodeMatch[1]);
    const frac = parseFloat(mixedUnicodeMatch[2]);
    // Only valid if frac came from a single unicode char (no decimal in original)
    const originalAfterWhole = s.slice(mixedUnicodeMatch[1].length).trimStart();
    if (UNICODE_FRAC_RE.test(originalAfterWhole[0])) {
      return {
        quantity: whole + frac,
        quantityMax: null,
        rest: s.slice(mixedUnicodeMatch[1].length + 1 + 1).trimStart(), // skip digit + space + unicode char
      };
    }
  }

  // Mixed number: "1 1/2"
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]);
    const num = parseInt(mixedMatch[2]);
    const den = parseInt(mixedMatch[3]);
    if (den === 0) return { quantity: null, quantityMax: null, rest: s };
    return {
      quantity: whole + num / den,
      quantityMax: null,
      rest: s.slice(mixedMatch[0].length).trimStart(),
    };
  }

  // Simple fraction: "3/4"
  const fracMatch = s.match(/^(\d+)\/(\d+)/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1]);
    const den = parseInt(fracMatch[2]);
    if (den === 0) return { quantity: null, quantityMax: null, rest: s };
    return {
      quantity: num / den,
      quantityMax: null,
      rest: s.slice(fracMatch[0].length).trimStart(),
    };
  }

  // Decimal or integer: "2.5" or "300"
  const numMatch = s.match(/^(\d+\.?\d*)/);
  if (numMatch) {
    return {
      quantity: parseFloat(numMatch[1]),
      quantityMax: null,
      rest: s.slice(numMatch[0].length).trimStart(),
    };
  }

  // Unicode fraction alone: "¼ tsp"
  const unicodeMatch = s.match(UNICODE_FRAC_RE);
  if (unicodeMatch && s.indexOf(unicodeMatch[0]) === 0) {
    return {
      quantity: UNICODE_FRACTIONS[unicodeMatch[0]],
      quantityMax: null,
      rest: s.slice(1).trimStart(),
    };
  }

  return { quantity: null, quantityMax: null, rest: s };
}

// ─── Unit parsing ──────────────────────────────────────────────────────────────

function parseUnit(text: string): { unit: string | null; rest: string } {
  const s = text.trimStart();

  for (const key of SORTED_UNITS) {
    // Require word boundary after unit so "g" doesn't match "garlic"
    const re = new RegExp(`^${key}s?(?=[\\s,.(]|$)`, "i");
    const match = s.match(re);
    if (match) {
      return { unit: UNIT_MAP[key], rest: s.slice(match[0].length).trimStart() };
    }
  }

  return { unit: null, rest: s };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function parseIngredientLine(rawText: string): ParsedIngredient {
  let s = rawText.trim();
  let isOptional = false;

  // Optional marker
  const optionalRe = /^\(optional\)|^optional:\s*/i;
  if (optionalRe.test(s)) {
    isOptional = true;
    s = s.replace(optionalRe, "").trimStart();
  }
  if (/,?\s*optional$/i.test(s)) {
    isOptional = true;
    s = s.replace(/,?\s*optional$/i, "").trimEnd();
  }

  const { quantity, quantityMax, rest: afterQty } = parseQuantity(s);
  const { unit, rest: afterUnit } = parseUnit(afterQty);

  // normalizeIngredientName handles comma-split, paren extraction, and prep-verb prefix
  const norm = normalizeIngredientName(afterUnit);

  return {
    rawText,
    displayName: norm.displayName || null,
    normalizedName: norm.normalizedName,
    quantity,
    quantityMax,
    unit,
    preparationNote: norm.preparationNote,
    isOptional,
    _prepNoteSource: norm.prepNoteSource,
  };
}

export function parseIngredientsBlock(raw: string): ParsedIngredient[] {
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.match(/^[-*#]+\s*$/))
    .map(parseIngredientLine);
}
