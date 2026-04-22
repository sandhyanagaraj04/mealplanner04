import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { updateMealPlanItem, removeMealPlanItem } from "@/lib/services/mealPlanService";
import { UpdateItemSchema } from "@/lib/validations/mealplan";
import { ok, noContent, badRequest, notFound, conflict, serverError, validationError } from "@/lib/api";

type Params = { params: Promise<{ planId: string; itemId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId, itemId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = UpdateItemSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = await updateMealPlanItem(planId, itemId, userId, parsed.data);

    if (result.error === "not_found") return notFound("Meal plan");
    if (result.error === "item_not_found") return notFound("Meal plan item");
    if (result.error === "conflict") {
      return conflict("Another meal is already planned for that day and meal type");
    }

    return ok(result.item);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId, itemId } = await params;

    const deleted = await removeMealPlanItem(planId, itemId, userId);
    if (!deleted) return notFound("Meal plan item");

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
