// Ingredient name normaliser.
//
// Takes the raw name portion (after quantity and unit are stripped) and returns:
//   displayName    — input as-is, trimmed (what the user typed)
//   normalizedName — canonical form: lowercase, no prep words, singularized
//   preparationNote — detected prep instruction, or null
//   prepNoteSource  — how the note was found (drives confidence)
//
// Conservative approach: when in doubt, leave normalizedName = null rather than
// produce a wrong guess. The UI should surface null normalizedNames for review.

import type { PrepNoteSource } from "@/types";

// ─── Word lists ────────────────────────────────────────────────────────────────

// Adverbs that modify prep verbs ("finely chopped", "thinly sliced")
const PREP_ADVERBS = new Set([
  "finely", "thinly", "roughly", "coarsely", "freshly", "lightly",
  "well", "firmly", "evenly", "generously", "sparingly", "gently",
  "carefully", "thoroughly",
]);

// Past-participle prep verbs — these describe what was DONE to the ingredient
const PREP_VERBS = new Set([
  "chopped", "diced", "minced", "sliced", "grated", "shredded",
  "peeled", "deveined", "hulled", "pitted", "seeded", "cored",
  "quartered", "halved", "julienned", "cubed", "crumbled", "mashed",
  "toasted", "roasted", "grilled", "blanched", "crushed", "pressed",
  "squeezed", "zested", "ground", "beaten", "whisked", "melted",
  "softened", "chilled", "warmed", "thawed", "candied", "pickled",
  "smoked", "cured", "rendered", "clarified", "packed", "sifted",
  "sieved", "strained", "trimmed", "defatted", "deseeded",
]);

// Size/quality adjectives that are modifiers, not part of the identity.
// We strip these from normalizedName but do NOT put them in preparationNote
// (they aren't instructions for the cook).
const SIZE_ADJECTIVES = new Set([
  "large", "small", "medium", "mini", "tiny", "big",
  "extra-large", "xl", "medium-sized", "small-sized", "large-sized",
]);

// State adjectives: safe to strip from normalizedName; borderline cases kept.
// "fresh" is intentionally excluded — "fresh lemon juice" vs "lemon juice"
// are meaningfully different in some contexts.
const STATE_ADJECTIVES = new Set([
  "frozen", "canned", "cooked", "raw", "ripe", "overripe",
  "unsalted", "salted", "sweetened", "unsweetened", "low-fat", "whole",
  "skim", "dried",   // "dried" only as standalone; "sun-dried tomatoes" is an identity
]);

// ─── Singularizer ─────────────────────────────────────────────────────────────
// Conservative — only applies clear rules. Unknown cases returned unchanged.

// Words that are already singular or should never be singularized
const NON_SINGULAR = new Set([
  "asparagus", "broccoli", "cauliflower", "spinach", "lettuce",
  "rice", "flour", "sugar", "salt", "pepper", "garlic", "butter",
  "oil", "vinegar", "water", "milk", "cream", "wine", "juice",
  "stock", "broth", "beef", "pork", "lamb", "chicken", "turkey",
  "fish", "shrimp", "pasta", "cheese", "tofu", "tempeh", "seitan",
  "oats", "quinoa", "couscous", "bread", "dough",
  "grass", "series", "species",
]);

export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (NON_SINGULAR.has(lower)) return word;

  // -ies → -y: berries → berry, cherries → cherry
  if (lower.endsWith("ies") && lower.length > 4) {
    return word.slice(0, -3) + "y";
  }
  // -oes → -o: tomatoes → tomato, potatoes → potato
  if (lower.endsWith("oes") && lower.length > 4) {
    return word.slice(0, -1);
  }
  // -ves: leaves → leaf, knives → knife — too risky, skip
  // -s but not -ss / -us / -is / -ous / -ias / -eas
  if (
    lower.endsWith("s") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("us") &&
    !lower.endsWith("is") &&
    !lower.endsWith("ous") &&
    !lower.endsWith("ias") &&
    !lower.endsWith("eas") &&
    lower.length > 3
  ) {
    const candidate = word.slice(0, -1);
    if (candidate.length >= 3) return candidate;
  }

  return word;
}

// Singularize the last word in a multi-word phrase: "cherry tomatoes" → "cherry tomato"
function singularizeLast(phrase: string): string {
  const words = phrase.split(" ");
  if (words.length === 0) return phrase;
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(" ");
}

// ─── Prep-word prefix stripping ───────────────────────────────────────────────
// Matches a leading sequence of (optional adverb + prep verb).
// Only strips when the result leaves a non-trivial ingredient name.

const PREP_PREFIX_RE = new RegExp(
  `^(?:(${[...PREP_ADVERBS].join("|")})\\s+)?(${[...PREP_VERBS].join("|")})\\s+`,
  "i"
);

interface PrepPrefixResult {
  prepNote: string | null;
  remainder: string;
}

function stripPrepPrefix(text: string): PrepPrefixResult {
  const match = text.match(PREP_PREFIX_RE);
  if (!match) return { prepNote: null, remainder: text };

  const remainder = text.slice(match[0].length).trim();
  // Don't strip if it leaves nothing or just a single very short word
  if (remainder.length < 2) return { prepNote: null, remainder: text };

  return { prepNote: match[0].trim(), remainder };
}

// ─── Size/state adjective stripping ──────────────────────────────────────────
// Strips leading size/state words from the beginning of a name.
// Stops at the first word that is not in the strip sets.

function stripLeadingModifiers(text: string): string {
  const words = text.split(" ");
  let i = 0;
  while (i < words.length - 1) {
    // Always keep at least the last word
    const w = words[i].toLowerCase().replace(/[^a-z-]/g, "");
    if (SIZE_ADJECTIVES.has(w) || STATE_ADJECTIVES.has(w)) {
      i++;
    } else {
      break;
    }
  }
  return words.slice(i).join(" ");
}

// ─── Main export ───────────────────────────────────────────────────────────────

export interface NormalizationResult {
  displayName: string;         // input, trimmed — shown to user as-is
  normalizedName: string | null; // canonical — null if confidence too low
  preparationNote: string | null;
  prepNoteSource: PrepNoteSource;
}

/**
 * Normalizes an ingredient name after quantity and unit have been removed.
 *
 * Strategies, applied in order of confidence:
 *   1. Comma split         → "garlic, minced"        source: "comma"
 *   2. Paren extraction    → "chickpeas (drained)"   source: "paren"
 *   3. Prep-verb prefix    → "minced garlic"         source: "prefix"
 *   4. No split possible   → displayName kept whole  source: null
 *
 * Size/state adjectives are stripped from normalizedName only — they are NOT
 * moved to preparationNote since they are not cooking instructions.
 */
export function normalizeIngredientName(raw: string): NormalizationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { displayName: "", normalizedName: null, preparationNote: null, prepNoteSource: null };
  }

  let nameCandidate = trimmed;
  let preparationNote: string | null = null;
  let prepNoteSource: PrepNoteSource = null;

  // ── Strategy 1: comma split ──────────────────────────────────────────────────
  // "garlic, minced" → name: "garlic", prep: "minced"
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx > 0) {
    const before = trimmed.slice(0, commaIdx).trim();
    const after = trimmed.slice(commaIdx + 1).trim();
    if (before.length > 0 && after.length > 0) {
      nameCandidate = before;
      preparationNote = after;
      prepNoteSource = "comma";
    }
  }

  // ── Strategy 2: trailing parenthetical ──────────────────────────────────────
  // "chickpeas (drained)" → name: "chickpeas", prep: "drained"
  // Applied after comma split so we don't over-extract.
  // Only match trailing parens (at end of string) to avoid "(15 oz) chickpeas".
  if (prepNoteSource === null) {
    const trailingParenMatch = nameCandidate.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (trailingParenMatch) {
      const before = trailingParenMatch[1].trim();
      const parenContent = trailingParenMatch[2].trim();
      if (before.length > 0) {
        nameCandidate = before;
        preparationNote = parenContent;
        prepNoteSource = "paren";
      }
    }
  }

  // ── Strategy 3: prep-verb prefix ─────────────────────────────────────────────
  // "finely chopped onions" → prefix: "finely chopped", remainder: "onions"
  // Only attempted if no higher-confidence split was found.
  if (prepNoteSource === null) {
    const { prepNote, remainder } = stripPrepPrefix(nameCandidate);
    if (prepNote !== null) {
      nameCandidate = remainder;
      preparationNote = prepNote;
      prepNoteSource = "prefix";
    }
  }

  // ── Derive normalizedName ────────────────────────────────────────────────────
  // 1. Strip leading size/state modifiers
  // 2. Singularize last word
  // 3. Lowercase
  // Only produce normalizedName when the result is meaningfully different from
  // displayName, OR when the source confidence is high (comma/paren split).

  let normalizedName: string | null = null;
  const stripped = stripLeadingModifiers(nameCandidate).trim();
  const singularized = singularizeLast(stripped).toLowerCase();

  // Accept normalized form if it differs from displayName or the split was clean
  const isDifferent = singularized !== nameCandidate.toLowerCase();
  const isHighConfidenceSplit = prepNoteSource === "comma" || prepNoteSource === "paren";

  if (singularized.length > 1 && (isDifferent || isHighConfidenceSplit)) {
    normalizedName = singularized;
  } else if (singularized.length > 1) {
    // Low-confidence case: displayName is the best we have
    normalizedName = nameCandidate.toLowerCase().trim() || null;
  }

  return {
    displayName: trimmed,     // always the ORIGINAL full input, unmodified
    normalizedName: normalizedName || null,
    preparationNote,
    prepNoteSource,
  };
}
