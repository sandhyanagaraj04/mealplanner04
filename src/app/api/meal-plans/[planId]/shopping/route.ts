import { type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getShoppingList, resetShoppingList } from "@/lib/services/shoppingService";
import { ok, notFound, serverError } from "@/lib/api";

type Params = { params: Promise<{ planId: string }> };

// GET — aggregated shopping list for the week
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId } = await params;

    const list = await getShoppingList(planId, userId);
    if (!list) return notFound("Meal plan");

    return ok(list);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE — reset all ingredient states to PENDING
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId(req);
    const { planId } = await params;

    const reset = await resetShoppingList(planId, userId);
    if (!reset) return notFound("Meal plan");

    return ok({ reset: true });
  } catch (err) {
    return serverError(err);
  }
}
