import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import {
  searchIngredients,
  createIngredient,
} from "@/lib/services/ingredientService";
import { IngredientCreateSchema, IngredientSearchSchema } from "@/lib/validations/ingredient";
import { ok, created, badRequest, serverError, validationError, conflict, isPrismaUniqueError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await getUserId(req); // auth guard
    const sp = req.nextUrl.searchParams;

    const parsed = IngredientSearchSchema.safeParse({
      q: sp.get("q") ?? "",
      limit: sp.get("limit") ?? "10",
    });
    if (!parsed.success) return validationError(parsed.error);

    const results = await searchIngredients(parsed.data.q, parsed.data.limit);
    return ok(results);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await getUserId(req);
    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = IngredientCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const ingredient = await createIngredient(parsed.data);
      return created(ingredient);
    } catch (err) {
      if (isPrismaUniqueError(err)) {
        return conflict(`Ingredient "${parsed.data.name}" already exists`);
      }
      throw err;
    }
  } catch (err) {
    return serverError(err);
  }
}
