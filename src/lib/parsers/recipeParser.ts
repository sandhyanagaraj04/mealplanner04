// Orchestrates the full recipe parsing pipeline.
// Input: raw content + source type
// Output: RecipeIngestionDraft (structured, confidence-scored, with warnings)
//
// All parsed fields are NULLABLE. Raw text is ALWAYS preserved in IngredientDraftLine.rawText.
// Unparsed lines are kept as-is with confidence 0.0 and a warning.

import type {
  RecipeIngestionDraft,
  IngestionSourceType,
  ExtractedContent,
  IngredientDraftLine,
  ParseWarning,
} from "@/types";
import { fetchUrl } from "@/lib/parsers/urlFetcher";
import { extractFromText } from "@/lib/parsers/textExtractor";
import { parseIngredientLine, parseIngredientsBlock } from "@/lib/parsers/ingredientParser";
import { parseInstructions } from "@/lib/parsers/instructionParser";
import { computeConfidence, generateWarnings, scoreIngredientLine } from "@/lib/parsers/confidenceScorer";
import { findIngredientByName } from "@/lib/services/ingredientService";

// ─── Ingredient enrichment ────────────────────────────────────────────────────
// After basic parsing, attempt to link each ingredient to the canonical Ingredient table.
// Runs in parallel (Promise.all) — any individual DB lookup failure falls back to null.

async function enrichIngredients(lines: string[]): Promise<IngredientDraftLine[]> {
  const parsed = parseIngredientsBlock(lines.join("\n"));

  const enriched = await Promise.all(
    parsed.map(async (pi, idx): Promise<IngredientDraftLine> => {
      let ingredientId: string | null = null;

      if (pi.normalizedName ?? pi.displayName) {
        try {
          const match = await findIngredientByName(
            pi.normalizedName ?? pi.displayName!
          );
          ingredientId = match?.id ?? null;
        } catch {
          // DB lookup failure is non-fatal — raw line preserved
        }
      }

      const draft: IngredientDraftLine = {
        rawText: pi.rawText,
        displayName: pi.displayName,
        normalizedName: pi.normalizedName,
        quantity: pi.quantity,
        quantityMax: pi.quantityMax,
        unit: pi.unit,
        preparationNote: pi.preparationNote,
        isOptional: pi.isOptional,
        ingredientId,
        confidence: 0, // computed below
      };
      draft.confidence = scoreIngredientLine(draft);
      return draft;
    })
  );

  return enriched;
}

// ─── Servings extraction from ingredient/title context ───────────────────────
// Used as a fallback when the content extractor didn't find a servings value.

function extractServingsHeuristic(text: string): number | null {
  const m = text.match(/\b(?:serves?|for|feeds?|yield|makes?)\s+(\d+)\b/i);
  if (m) {
    const n = parseInt(m[1]);
    if (n > 0 && n <= 500) return n;
  }
  return null;
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────

export interface ParsePipelineInput {
  sourceType: IngestionSourceType;
  // Provide `url` when sourceType === "url", `text` when sourceType === "text"
  url?: string;
  text?: string;
}

export interface ParsePipelineResult {
  rawContent: string;
  rawIngredients: string;   // ingredient lines joined — stored on Recipe when confirmed
  rawInstructions: string;  // instruction text — stored on Recipe when confirmed
  draft: RecipeIngestionDraft;
}

export async function parseRecipeInput(
  input: ParsePipelineInput
): Promise<ParsePipelineResult> {
  let rawContent: string;
  let extracted: ExtractedContent;

  // ── Step 1: Obtain raw content + extract sections ───────────────────────────
  if (input.sourceType === "url") {
    if (!input.url) throw new Error("url is required when sourceType is 'url'");
    const result = await fetchUrl(input.url);
    rawContent = result.rawContent;
    extracted = result.extracted;
  } else {
    if (!input.text) throw new Error("text is required when sourceType is 'text'");
    rawContent = input.text;
    extracted = extractFromText(input.text);
  }

  // ── Step 2: Parse ingredients ───────────────────────────────────────────────
  const ingredients = await enrichIngredients(extracted.ingredientLines);

  // ── Step 3: Parse steps ─────────────────────────────────────────────────────
  const steps = parseInstructions(extracted.instructionText);

  // ── Step 4: Servings fallback ───────────────────────────────────────────────
  const servings =
    extracted.servings ??
    extractServingsHeuristic(rawContent.slice(0, 2000)); // check early in doc

  // ── Step 5: Collect all warnings ────────────────────────────────────────────
  const fetchWarnings: ParseWarning[] = extracted.warnings;

  const draft: RecipeIngestionDraft = {
    title: extracted.title,
    servings,
    ingredients,
    steps,
    confidence: 0, // computed next
    warnings: [],  // computed next
  };

  const fieldWarnings = generateWarnings(draft);
  draft.warnings = [...fetchWarnings, ...fieldWarnings];
  draft.confidence = computeConfidence(draft, extracted.baseConfidence);

  if (draft.confidence < 0.4) {
    draft.warnings.push({
      code: "LOW_CONFIDENCE",
      message: `Overall parse confidence is low (${Math.round(draft.confidence * 100)}%). Manual review recommended.`,
      field: null,
      context: null,
    });
  }

  // ── Step 6: Preserve raw text sections ──────────────────────────────────────
  const rawIngredients = extracted.ingredientLines.join("\n");
  const rawInstructions = extracted.instructionText;

  return { rawContent, rawIngredients, rawInstructions, draft };
}
