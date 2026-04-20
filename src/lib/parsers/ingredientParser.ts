import type { ParsedIngredient } from "@/types";

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

// ─── Quantity parsing ──────────────────────────────────────────────────────────

function parseQuantity(text: string): { quantity: number | null; rest: string } {
  const s = text.trimStart();

  // Range: "1-2" or "1–2" — take lower bound
  const rangeMatch = s.match(/^(\d+)[–-](\d+)/);
  if (rangeMatch) {
    return { quantity: parseFloat(rangeMatch[1]), rest: s.slice(rangeMatch[0].length).trimStart() };
  }

  // Mixed number: "1 1/2"
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]);
    const num = parseInt(mixedMatch[2]);
    const den = parseInt(mixedMatch[3]);
    if (den === 0) return { quantity: null, rest: s };
    return { quantity: whole + num / den, rest: s.slice(mixedMatch[0].length).trimStart() };
  }

  // Simple fraction: "3/4"
  const fracMatch = s.match(/^(\d+)\/(\d+)/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1]);
    const den = parseInt(fracMatch[2]);
    if (den === 0) return { quantity: null, rest: s };
    return { quantity: num / den, rest: s.slice(fracMatch[0].length).trimStart() };
  }

  // Decimal or integer: "2.5" or "300"
  const numMatch = s.match(/^(\d+\.?\d*)/);
  if (numMatch) {
    return { quantity: parseFloat(numMatch[1]), rest: s.slice(numMatch[0].length).trimStart() };
  }

  return { quantity: null, rest: s };
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

// ─── Notes / name splitting ───────────────────────────────────────────────────

function splitNameNotes(text: string): { name: string | null; notes: string | null } {
  const s = text.trim();
  if (!s) return { name: null, notes: null };

  // Extract parenthetical content: "chicken breast (skin-on)" → notes: "skin-on"
  const parenMatch = s.match(/^(.*?)\s*\(([^)]+)\)(.*)$/);
  let base = s;
  const parenNotes: string[] = [];

  if (parenMatch) {
    base = (parenMatch[1] + parenMatch[3]).trim();
    parenNotes.push(parenMatch[2].trim());
  }

  // Split on comma: "garlic, minced" → name: garlic, notes: minced
  const commaIdx = base.indexOf(",");
  if (commaIdx !== -1) {
    const name = base.slice(0, commaIdx).trim();
    const afterComma = base.slice(commaIdx + 1).trim();
    const notes = [...parenNotes, afterComma].filter(Boolean).join(", ");
    return { name: name || null, notes: notes || null };
  }

  const notes = parenNotes.join(", ");
  return { name: base || null, notes: notes || null };
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
  // "or optional" at end
  if (/,?\s*optional$/i.test(s)) {
    isOptional = true;
    s = s.replace(/,?\s*optional$/i, "").trimEnd();
  }

  const { quantity, rest: afterQty } = parseQuantity(s);
  const { unit, rest: afterUnit } = parseUnit(afterQty);
  const { name, notes } = splitNameNotes(afterUnit);

  return { rawText, quantity, unit, name, notes, isOptional };
}

export function parseIngredientsBlock(raw: string): ParsedIngredient[] {
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.match(/^[-*#]+\s*$/)) // skip pure dividers
    .map(parseIngredientLine);
}
