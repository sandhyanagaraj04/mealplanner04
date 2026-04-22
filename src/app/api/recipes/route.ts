import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { listRecipes, createRecipe } from "@/lib/services/recipeService";
import { RecipeCreateSchema } from "@/lib/validations/recipe";
import {
  ok,
  created,
  badRequest,
  serverError,
  validationError,
  parsePagination,
} from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const sp = req.nextUrl.searchParams;
    const { limit, offset } = parsePagination(sp);
    const q = sp.get("q") ?? undefined;

    const { items, total } = await listRecipes(userId, { limit, offset, q });
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

    const parsed = RecipeCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const recipe = await createRecipe(userId, parsed.data);
    return created(recipe);
  } catch (err) {
    return serverError(err);
  }
}
