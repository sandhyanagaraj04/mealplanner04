// GET    /api/ingest/:id — retrieve draft with full parsedDraft
// PATCH  /api/ingest/:id — update draft fields (title, servings, ingredients, steps)
// DELETE /api/ingest/:id — discard (soft-delete, sets status = "discarded")

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getIngestion, discardIngestion, patchIngestionDraft } from "@/lib/services/ingestionService";
import { ok, noContent, notFound, conflict, serverError, validationError } from "@/lib/api";
import { PatchDraftSchema } from "@/lib/validations/ingest";
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

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { ingestionId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return noContent();

    const parsed = PatchDraftSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = await patchIngestionDraft(ingestionId, userId, parsed.data);

    if ("error" in result) {
      if (result.error === "not_found") return notFound("Ingestion");
      return conflict("Cannot edit a confirmed or discarded ingestion.");
    }

    const draft = result.draft as RecipeIngestionDraft;
    return ok({
      ingestionId: result.ingestion.id,
      confidence: result.draft.confidence,
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
