import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { listMealPlans, createMealPlan } from "@/lib/services/mealPlanService";
import { MealPlanCreateSchema } from "@/lib/validations/mealplan";
import {
  ok,
  created,
  badRequest,
  serverError,
  validationError,
  conflict,
  isPrismaUniqueError,
  parsePagination,
} from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const { limit, offset } = parsePagination(req.nextUrl.searchParams);
    const { items, total } = await listMealPlans(userId, { limit, offset });
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

    const parsed = MealPlanCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const plan = await createMealPlan(userId, parsed.data);
      return created(plan);
    } catch (err) {
      if (isPrismaUniqueError(err)) {
        return conflict("A meal plan for that week already exists");
      }
      throw err;
    }
  } catch (err) {
    return serverError(err);
  }
}
