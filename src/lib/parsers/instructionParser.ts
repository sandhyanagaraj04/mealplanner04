// Parses a raw instruction blob into discrete steps.
// Handles numbered lists ("1. ...", "Step 1:", "Step 1 –"),
// lettered lists ("a. ..."), and paragraph-separated text.
// Raw text is always preserved on the Recipe; this output populates RecipeStep rows.

export interface ParsedStep {
  stepNumber: number;
  instruction: string;
  durationMins: number | null;
}

// ─── Duration extraction ───────────────────────────────────────────────────────
// Looks for patterns like "cook for 20 minutes", "bake 1 hour 30 minutes"

const DURATION_RE =
  /(?:for\s+)?(\d+)\s*(?:hour|hr)s?\s*(?:and\s+)?(?:(\d+)\s*(?:minute|min)s?)?|(?:for\s+)?(\d+)\s*(?:minute|min)s?/i;

function extractDuration(text: string): number | null {
  const m = text.match(DURATION_RE);
  if (!m) return null;

  if (m[1] !== undefined) {
    // hours (+ optional minutes)
    const hrs = parseInt(m[1]);
    const mins = m[2] !== undefined ? parseInt(m[2]) : 0;
    return hrs * 60 + mins;
  }
  if (m[3] !== undefined) {
    return parseInt(m[3]);
  }
  return null;
}

// ─── Step splitters ────────────────────────────────────────────────────────────

// "1. ...", "1) ...", "Step 1: ...", "Step 1 – ...", "Step 1. ..."
const NUMBERED_PREFIX_RE = /^(?:step\s+)?\d+[.):\-–]\s*/i;

function splitByNumberedList(raw: string): string[] | null {
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Require that at least 2 of the first 3 non-empty lines start with a number
  const numbered = lines.filter((l) => NUMBERED_PREFIX_RE.test(l));
  if (numbered.length < 2) return null;

  // Merge continuation lines (no leading number) into the preceding step
  const steps: string[] = [];
  let current = "";

  for (const line of lines) {
    if (NUMBERED_PREFIX_RE.test(line)) {
      if (current) steps.push(current.trim());
      current = line.replace(NUMBERED_PREFIX_RE, "");
    } else {
      current += " " + line;
    }
  }
  if (current.trim()) steps.push(current.trim());

  return steps.filter(Boolean);
}

function splitByParagraphs(raw: string): string[] {
  return raw
    .split(/\n\n+/)
    .map((block) => block.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function parseInstructions(raw: string): ParsedStep[] {
  const stripped = raw.trim();
  if (!stripped) return [];

  const chunks = splitByNumberedList(stripped) ?? splitByParagraphs(stripped);

  return chunks.map((instruction, idx) => ({
    stepNumber: idx + 1,
    instruction,
    durationMins: extractDuration(instruction),
  }));
}
