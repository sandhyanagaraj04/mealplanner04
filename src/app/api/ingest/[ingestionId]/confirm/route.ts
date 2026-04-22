// POST /api/ingest/:id/confirm
// Materialises the draft as a Recipe. Accepts optional overrides for name and servings.

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { confirmIngestion } from "@/lib/services/ingestionService";
import { ConfirmIngestionSchema } from "@/lib/validations/ingest";
import { ok, badRequest, notFound, conflict, serverError, validationError } from "@/lib/api";

type Params = { params: Promise<{ ingestionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { ingestionId } = await params;

    // Body is optional — all fields have defaults
    const body = await req.json().catch(() => ({}));
    const parsed = ConfirmIngestionSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = await confirmIngestion(ingestionId, userId, parsed.data);

    if ("error" in result) {
      if (result.error === "not_found") return notFound("Ingestion");
      return conflict("This ingestion has already been confirmed or discarded.");
    }

    return ok(result.recipe);
  } catch (err) {
    return serverError(err);
  }
}
