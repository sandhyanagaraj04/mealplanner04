// Event tracking and operational logging.
//
// track()         — business analytics events. Currently writes structured JSON
//                   to stdout so any log aggregator can pick them up.
//                   Swap the emit() implementation to forward to PostHog / Segment /
//                   a DB table without changing any call sites.
//
// log.parseFailure()           — ingredient lines that produced no parseable output.
// log.normalizationConflict()  — ingredient names the normalizer couldn't canonicalise.
//
// All output is newline-delimited JSON. Fields common to every record:
//   level  — "info" | "warn" | "error"
//   event  — snake_case event/log name
//   ts     — ISO 8601 timestamp

// ─── Confidence threshold ─────────────────────────────────────────────────────
// Below this value the review gate forces human inspection.
// Matches REVIEW_THRESHOLD in src/app/ingest/[ingestionId]/review/page.tsx.
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

// ─── Analytics event definitions ─────────────────────────────────────────────

interface Events {
  recipe_import_started: {
    userId: string;
    sourceType: "url" | "text";
    /** Hostname only — never the full URL (may contain credentials or tokens) */
    urlDomain?: string;
    textLength?: number;
  };

  recipe_import_completed: {
    userId: string;
    ingestionId: string;
    confidence: number;
    ingredientCount: number;
    stepCount: number;
    warningCount: number;
    sourceType: string;
  };

  parse_low_confidence: {
    ingestionId: string;
    confidence: number;
    /** WarningCode values present on the draft */
    warningCodes: string[];
  };

  recipe_saved: {
    userId: string;
    recipeId: string;
    ingestionId: string;
    ingredientCount: number;
    stepCount: number;
    servings: number;
  };

  meal_added: {
    userId: string;
    planId: string;
    recipeId?: string;
    dayOfWeek: number;
    mealType: string;
    servings: number;
    scaleFactor: number;
  };

  shopping_list_generated: {
    userId: string;
    planId: string;
    itemCount: number;
    unresolvedCount: number;
    potentialDuplicateCount: number;
    mergeWarningCount: number;
  };
}

type EventName = keyof Events;

// ─── Operational log definitions ─────────────────────────────────────────────

export type ParseFailureReason =
  /** Both displayName and quantity are null — nothing could be extracted */
  | "no_display_name_no_quantity"
  /** Confidence score is 0 — parser produced output but with zero confidence */
  | "zero_confidence";

export type NormalizationConflictReason =
  /** All strategies exhausted; could not produce a canonical ingredient name */
  | "null_normalized_name"
  /** Prep-prefix stripping reduced the name to fewer than 4 characters */
  | "prefix_over_stripped"
  /** Comma-split fired but the original text also has a parenthetical expression */
  | "comma_paren_ambiguity";

// ─── Internal emitter ─────────────────────────────────────────────────────────

function emit(
  level: "info" | "warn" | "error",
  tag: string,
  event: string,
  props: Record<string, unknown>
): void {
  const record = JSON.stringify({ level, event, ...props, ts: new Date().toISOString() });
  if (level === "error") {
    console.error(`[${tag}]`, record);
  } else if (level === "warn") {
    console.warn(`[${tag}]`, record);
  } else {
    console.log(`[${tag}]`, record);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit a business analytics event.
 * Call sites should pass only properties defined in the Events interface above
 * so the schema stays auditable.
 */
export function track<T extends EventName>(event: T, props: Events[T]): void {
  const level =
    event === "parse_low_confidence" ? "warn" : "info";
  emit(level, "analytics", event, props as Record<string, unknown>);
}

export const log = {
  /**
   * An ingredient line produced no usable parse output.
   * Fired once per failed line, not once per ingestion.
   */
  parseFailure(
    rawText: string,
    reason: ParseFailureReason,
    context?: { ingestionId?: string; lineIndex?: number }
  ): void {
    emit("error", "parse_failure", "parse_failure", {
      rawText,
      reason,
      ...context,
    });
  },

  /**
   * The ingredient normaliser encountered an ambiguous or conflicting input
   * and could not produce a reliable canonical name.
   */
  normalizationConflict(
    rawText: string,
    reason: NormalizationConflictReason,
    context?: {
      displayName?: string;
      prepNoteSource?: string | null;
      remainder?: string;
    }
  ): void {
    emit("warn", "normalization_conflict", "normalization_conflict", {
      rawText,
      reason,
      ...context,
    });
  },
};
