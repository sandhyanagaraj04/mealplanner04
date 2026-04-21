// GET    /api/ingest/:id — retrieve draft with full parsedDraft
// DELETE /api/ingest/:id — discard (soft-delete, sets status = "discarded")

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getIngestion, discardIngestion } from "@/lib/services/ingestionService";
import { ok, noContent, notFound, serverError } from "@/lib/api";
import type { RecipeIngestionDraft } from "@/types";

type Params = { params: Promise<{ ingestionId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { ingestionId } = await params;

    const ingestion = await getIngestion(ingestionId, userId);
    if (!ingestion) return notFound("Ingestion");

    const draft = ingestion.parsedDraft as unknown as RecipeIngestionDraft;

    return ok({
      ingestionId: ingestion.id,
      sourceType: ingestion.sourceType,
      sourceUrl: ingestion.sourceUrl,
      status: ingestion.status,
      confidence: ingestion.confidence,
      createdAt: ingestion.createdAt,
      // Full draft
      title: draft.title,
      servings: draft.servings,
      ingredients: draft.ingredients,
      steps: draft.steps,
      warnings: draft.warnings,
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { ingestionId } = await params;

    const discarded = await discardIngestion(ingestionId, userId);
    if (!discarded) return notFound("Ingestion");

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
