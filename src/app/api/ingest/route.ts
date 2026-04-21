// POST /api/ingest
// Accepts a URL or raw text, runs the full parsing pipeline, stores the
// draft ingestion, and returns the structured output with confidence + warnings.

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { ingest, listIngestions } from "@/lib/services/ingestionService";
import { IngestSchema } from "@/lib/validations/ingest";
import { ok, created, badRequest, serverError, validationError, parsePagination } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const sp = req.nextUrl.searchParams;
    const { limit, offset } = parsePagination(sp);
    const status = sp.get("status") ?? undefined;

    const { items, total } = await listIngestions(userId, { status, limit, offset });
    return ok({ items, total, limit, offset });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = IngestSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { ingestion, draft } = await ingest(userId, parsed.data);

    return created({
      ingestionId: ingestion.id,
      sourceType: ingestion.sourceType,
      sourceUrl: ingestion.sourceUrl,
      status: ingestion.status,
      // Structured draft output
      title: draft.title,
      servings: draft.servings,
      ingredients: draft.ingredients,
      steps: draft.steps,
      // Quality signals
      confidence: draft.confidence,
      warnings: draft.warnings,
    });
  } catch (err) {
    return serverError(err);
  }
}
