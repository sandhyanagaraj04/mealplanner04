import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getIngredient, updateIngredient } from "@/lib/services/ingredientService";
import { IngredientUpdateSchema } from "@/lib/validations/ingredient";
import { ok, badRequest, notFound, serverError, validationError, conflict, isPrismaUniqueError } from "@/lib/api";

type Params = { params: Promise<{ ingredientId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await getUserId(req);
    const { ingredientId } = await params;
    const ingredient = await getIngredient(ingredientId);
    if (!ingredient) return notFound("Ingredient");
    return ok(ingredient);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await getUserId(req);
    const { ingredientId } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    const parsed = IngredientUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const ingredient = await updateIngredient(ingredientId, parsed.data);
      if (!ingredient) return notFound("Ingredient");
      return ok(ingredient);
    } catch (err) {
      if (isPrismaUniqueError(err)) return conflict("Ingredient name already taken");
      throw err;
    }
  } catch (err) {
    return serverError(err);
  }
}
