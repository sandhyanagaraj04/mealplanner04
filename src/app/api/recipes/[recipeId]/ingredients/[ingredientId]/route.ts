// PATCH /api/recipes/:recipeId/ingredients/:ingredientId
// Corrects a single parsed ingredient field without re-parsing the whole recipe.
// Preserves rawText — only updates the nullable parsed columns.

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { patchRecipeIngredient } from "@/lib/services/recipeService";
import { PatchIngredientSchema } from "@/lib/validations/recipe";
import { ok, badRequest, notFound, serverError, validationError } from "@/lib/api";

type Params = { params: Promise<{ recipeId: string; ingredientId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { recipeId, ingredientId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = PatchIngredientSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const row = await patchRecipeIngredient(recipeId, ingredientId, userId, parsed.data);
    if (!row) return notFound("Recipe or ingredient");

    return ok(row);
  } catch (err) {
    return serverError(err);
  }
}
