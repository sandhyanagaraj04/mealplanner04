import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { addMealPlanItem } from "@/lib/services/mealPlanService";
import { AddItemSchema } from "@/lib/validations/mealplan";
import { created, badRequest, notFound, conflict, serverError, validationError } from "@/lib/api";

type Params = { params: Promise<{ planId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = AddItemSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = await addMealPlanItem(planId, userId, parsed.data);

    if (result.error === "not_found") return notFound("Meal plan");
    if (result.error === "recipe_not_found") return notFound("Recipe");
    if (result.error === "conflict") {
      return conflict("A meal is already planned for that day and meal type");
    }

    return created(result.item);
  } catch (err) {
    return serverError(err);
  }
}
