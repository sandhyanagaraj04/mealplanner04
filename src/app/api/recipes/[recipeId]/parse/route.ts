// POST /api/recipes/:recipeId/parse
// Re-runs the ingredient + instruction parsers against the stored raw text.
// Does NOT change rawIngredients or rawInstructions — only replaces the parsed rows.

import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { reparseRecipe } from "@/lib/services/recipeService";
import { ok, notFound, serverError } from "@/lib/api";

type Params = { params: Promise<{ recipeId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { recipeId } = await params;

    const recipe = await reparseRecipe(recipeId, userId);
    if (!recipe) return notFound("Recipe");

    return ok(recipe);
  } catch (err) {
    return serverError(err);
  }
}
