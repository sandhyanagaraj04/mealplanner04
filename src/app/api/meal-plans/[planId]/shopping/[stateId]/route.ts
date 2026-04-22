// PATCH /api/meal-plans/:planId/shopping/:stateId
// Updates the shopping state for one ingredient in one meal occurrence.

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { updateIngredientState } from "@/lib/services/shoppingService";
import { UpdateIngredientStateSchema } from "@/lib/validations/mealplan";
import { ok, badRequest, notFound, forbidden, serverError, validationError } from "@/lib/api";

type Params = { params: Promise<{ planId: string; stateId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId, stateId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = UpdateIngredientStateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = await updateIngredientState(stateId, planId, userId, parsed.data);

    if (result.error === "not_found") return notFound("Ingredient state");
    if (result.error === "forbidden") return forbidden();

    return ok(result.state);
  } catch (err) {
    return serverError(err);
  }
}
