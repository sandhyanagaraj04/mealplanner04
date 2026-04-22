// Extracts recipe sections from a raw text paste.
// Strategy:
//   1. Look for section-header keywords (Ingredients / Instructions)
//   2. If found → split on them (high confidence)
//   3. If not found → heuristic line classification (lower confidence)

import type { ExtractedContent, ParseWarning } from "@/types";

// ─── Section headers ───────────────────────────────────────────────────────────

const INGREDIENT_HEADER_RE = /^#+\s*|^\*+\s*/; // strip markdown if present
const SECTION_INGREDIENT_RE = /^ingredients?:?\s*$/i;
const SECTION_INSTRUCTION_RE =
  /^(instructions?|directions?|method|steps?|preparation|how\s+to\s+make):?\s*$/i;
const SECTION_SERVINGS_RE = /^(serves?|yield|makes?|servings?):?\s*/i;

// ─── Servings detection ───────────────────────────────────────────────────────

export function extractServingsFromText(text: string): number | null {
  // "Serves 4", "Makes 6 servings", "Yield: 4", "Servings: 2-4" (take lower bound)
  const patterns = [
    /(?:serves?|yield|makes?|servings?)[:\s]+(\d+)/i,
    /(\d+)\s+servings?/i,
    /(?:for|feeds)\s+(\d+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1]);
      if (n > 0 && n <= 500) return n;
    }
  }
  return null;
}

// ─── Title detection from raw text ────────────────────────────────────────────
// The title is often the first non-empty line before any section headers.
// It must be < 150 chars and not look like an ingredient (no leading digit/fraction).

function extractTitle(lines: string[]): string | null {
  for (const line of lines) {
    const clean = line.replace(INGREDIENT_HEADER_RE, "").trim();
    if (!clean) continue;
    if (/^[\d½⅓¼¾⅔⅛⅜⅝⅞]/.test(clean)) continue; // looks like ingredient
    if (SECTION_INGREDIENT_RE.test(clean) || SECTION_INSTRUCTION_RE.test(clean)) return null;
    if (clean.length > 3 && clean.length < 150) return clean;
  }
  return null;
}

// ─── Heuristic line classification ───────────────────────────────────────────
// Used when no section headers are found.
// A line is "ingredient-like" if it starts with a quantity/fraction/unit.

const INGREDIENT_LINE_RE =
  /^(?:\(optional\)\s*)?(?:\d+[\/\d\s]*|\d*[½⅓¼¾⅔⅛⅜⅝⅞])\s*(?:tsp|tbsp|cup|oz|lb|g|kg|ml|l|clove|slice|can|bunch|pinch|dash|handful)?\b/i;

function classifyLines(lines: string[]): {
  ingredientLines: string[];
  instructionLines: string[];
} {
  const ingredientLines: string[] = [];
  const instructionLines: string[] = [];

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    if (INGREDIENT_LINE_RE.test(clean)) {
      ingredientLines.push(clean);
    } else if (clean.length > 20) {
      // Short lines that aren't quantities are ambiguous — keep as instruction
      instructionLines.push(clean);
    }
    // Very short lines (< 20 chars, no quantity) are dropped from both
    // but their original form is still in the rawContent.
  }

  return { ingredientLines, instructionLines };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function extractFromText(rawText: string): ExtractedContent {
  const lines = rawText.split("\n").map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const warnings: ParseWarning[] = [];

  if (nonEmpty.length === 0) {
    return {
      method: "heuristic",
      title: null,
      servings: null,
      ingredientLines: [],
      instructionText: "",
      baseConfidence: 0,
      warnings: [
        {
          code: "URL_FETCH_FAILED",
          message: "Input text is empty.",
          field: null,
          context: null,
        },
      ],
    };
  }

  // Look for explicit servings line anywhere in the text
  const servingsLine = nonEmpty.find((l) => SECTION_SERVINGS_RE.test(l));
  const servings = extractServingsFromText(rawText);

  // ── Strategy 1: explicit section headers ────────────────────────────────────
  const ingredientHeaderIdx = nonEmpty.findIndex((l) =>
    SECTION_INGREDIENT_RE.test(l.replace(INGREDIENT_HEADER_RE, ""))
  );
  const instructionHeaderIdx = nonEmpty.findIndex((l) =>
    SECTION_INSTRUCTION_RE.test(l.replace(INGREDIENT_HEADER_RE, ""))
  );

  if (ingredientHeaderIdx !== -1 && instructionHeaderIdx !== -1) {
    const before = nonEmpty.slice(0, Math.min(ingredientHeaderIdx, instructionHeaderIdx));
    const title = extractTitle(before) ?? null;

    let ingredientLines: string[];
    let instructionText: string;

    if (ingredientHeaderIdx < instructionHeaderIdx) {
      ingredientLines = nonEmpty
        .slice(ingredientHeaderIdx + 1, instructionHeaderIdx)
        .filter((l) => !SECTION_SERVINGS_RE.test(l));
      instructionText = nonEmpty.slice(instructionHeaderIdx + 1).join("\n");
    } else {
      ingredientLines = nonEmpty.slice(ingredientHeaderIdx + 1).filter((l) => !SECTION_SERVINGS_RE.test(l));
      instructionText = nonEmpty.slice(instructionHeaderIdx + 1, ingredientHeaderIdx).join("\n");
    }

    // Warn if servings header was present but value not extracted
    if (servingsLine && servings === null) {
      warnings.push({
        code: "SERVINGS_AMBIGUOUS",
        message: `Found a servings line but could not extract a number: "${servingsLine}"`,
        field: "servings",
        context: servingsLine,
      });
    }

    return {
      method: "section_headers",
      title,
      servings,
      ingredientLines,
      instructionText,
      baseConfidence: 0.85,
      warnings,
    };
  }

  // ── Strategy 2: one section header found ────────────────────────────────────
  if (ingredientHeaderIdx !== -1 || instructionHeaderIdx !== -1) {
    const idx = ingredientHeaderIdx !== -1 ? ingredientHeaderIdx : instructionHeaderIdx;
    const before = nonEmpty.slice(0, idx);
    const after = nonEmpty.slice(idx + 1);
    const title = extractTitle(before) ?? null;

    warnings.push({
      code: "SECTION_DETECTION_FAILED",
      message:
        ingredientHeaderIdx !== -1
          ? "Found an Ingredients section but no Instructions header. The instruction block may be inaccurate."
          : "Found an Instructions section but no Ingredients header. The ingredient list may be inaccurate.",
      field: null,
      context: null,
    });

    const { ingredientLines, instructionLines } = classifyLines(after);

    return {
      method: "section_headers",
      title,
      servings,
      ingredientLines: ingredientHeaderIdx !== -1 ? after : ingredientLines,
      instructionText:
        instructionHeaderIdx !== -1 ? after.join("\n") : instructionLines.join("\n"),
      baseConfidence: 0.6,
      warnings,
    };
  }

  // ── Strategy 3: heuristic classification ────────────────────────────────────
  // Detect "wall of text" — long unstructured input where heuristics will likely fail.
  // Threshold: > 80 non-empty lines or > 4000 chars with no headers found.
  const isWallOfText =
    nonEmpty.length > 80 || rawText.length > 4000;

  if (isWallOfText) {
    warnings.push({
      code: "SECTION_DETECTION_FAILED",
      message:
        "The text is long and has no recognisable section headers. " +
        "Add \"Ingredients\" and \"Instructions\" labels to help the parser, or split the text into two separate pastes.",
      field: null,
      context: null,
    });
  } else {
    warnings.push({
      code: "SECTION_DETECTION_FAILED",
      message:
        'No "Ingredients" or "Instructions" headers found. Used heuristic classification — review carefully.',
      field: null,
      context: null,
    });
  }

  const title = extractTitle(nonEmpty);
  const toClassify = title
    ? nonEmpty.filter((l) => l !== title)
    : nonEmpty;

  const { ingredientLines, instructionLines } = classifyLines(toClassify);

  // For very long unstructured text, lower the confidence further.
  const heuristicConfidence = isWallOfText ? 0.2 : 0.4;

  return {
    method: "heuristic",
    title,
    servings,
    ingredientLines,
    instructionText: instructionLines.join("\n"),
    baseConfidence: heuristicConfidence,
    warnings,
  };
}
