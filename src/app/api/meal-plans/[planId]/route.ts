import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getMealPlan, updateMealPlan, deleteMealPlan } from "@/lib/services/mealPlanService";
import { MealPlanUpdateSchema } from "@/lib/validations/mealplan";
import { ok, noContent, badRequest, notFound, serverError, validationError } from "@/lib/api";

type Params = { params: Promise<{ planId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId } = await params;
    const plan = await getMealPlan(planId, userId);
    if (!plan) return notFound("Meal plan");
    return ok(plan);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = MealPlanUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const plan = await updateMealPlan(planId, userId, parsed.data);
    if (!plan) return notFound("Meal plan");

    return ok(plan);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId } = await params;

    const deleted = await deleteMealPlan(planId, userId);
    if (!deleted) return notFound("Meal plan");

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
