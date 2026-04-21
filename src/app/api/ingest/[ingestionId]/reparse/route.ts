// POST /api/ingest/:id/reparse
// Re-runs the parser against the stored raw text. Useful when the parser
// is improved or when the user has manually edited rawIngredients/rawInstructions
// via a future edit endpoint. rawContent is NEVER changed.

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { reparseIngestion } from "@/lib/services/ingestionService";
import { ok, notFound, conflict, serverError } from "@/lib/api";
import type { RecipeIngestionDraft } from "@/types";

type Params = { params: Promise<{ ingestionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { ingestionId } = await params;

    const result = await reparseIngestion(ingestionId, userId);

    if (result.error === "not_found") return notFound("Ingestion");
    if (result.error === "not_draft") {
      return conflict("Cannot re-parse a confirmed or discarded ingestion.");
    }

    const draft = result.draft as RecipeIngestionDraft;
    return ok({
      ingestionId: result.ingestion.id,
      title: draft.title,
      servings: draft.servings,
      ingredients: draft.ingredients,
      steps: draft.steps,
      confidence: draft.confidence,
      warnings: draft.warnings,
    });
  } catch (err) {
    return serverError(err);
  }
}
