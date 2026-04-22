import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRecipe, updateRecipe, deleteRecipe } from "@/lib/services/recipeService";
import { RecipeUpdateSchema } from "@/lib/validations/recipe";
import {
  ok,
  noContent,
  badRequest,
  notFound,
  conflict,
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

    const result = await deleteRecipe(recipeId, userId);

    if ("error" in result && result.error === "not_found") return notFound("Recipe");
    if ("error" in result && result.error === "in_use") {
      return conflict(
        `Cannot delete: recipe is used in ${result.itemCount} meal slot${result.itemCount !== 1 ? "s" : ""} ` +
          `across ${result.planCount} plan${result.planCount !== 1 ? "s" : ""}. ` +
          `Remove it from all meal plans first.`
      );
    }

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
