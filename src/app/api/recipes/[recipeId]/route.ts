import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRecipe, updateRecipe, deleteRecipe } from "@/lib/services/recipeService";
import { RecipeUpdateSchema } from "@/lib/validations/recipe";
import {
  ok,
  noContent,
  badRequest,
  notFound,
  serverError,
  validationError,
} from "@/lib/api";

type Params = { params: Promise<{ recipeId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { recipeId } = await params;
    const recipe = await getRecipe(recipeId, userId);
    if (!recipe) return notFound("Recipe");
    return ok(recipe);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { recipeId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = RecipeUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const recipe = await updateRecipe(recipeId, userId, parsed.data);
    if (!recipe) return notFound("Recipe");

    return ok(recipe);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { recipeId } = await params;

    const deleted = await deleteRecipe(recipeId, userId);
    if (!deleted) return notFound("Recipe");

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
