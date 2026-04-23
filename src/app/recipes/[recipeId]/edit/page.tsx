import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import RecipeEditForm from "@/components/features/recipes/RecipeEditForm";

type Params = { params: Promise<{ recipeId: string }> };

export default async function RecipeEditPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { recipeId } = await params;

  const recipe = await db.recipe.findFirst({
    where: { id: recipeId, userId },
    select: {
      id: true,
      name: true,
      description: true,
      servings: true,
      prepMins: true,
      cookMins: true,
      source: true,
      rawIngredients: true,
      rawInstructions: true,
    },
  });

  if (!recipe) notFound();

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-center gap-3">
        <Link
          href={`/recipes/${recipe.id}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          ← Back
        </Link>
        <span className="text-[var(--border)]">/</span>
        <h1 className="text-lg font-bold truncate">{recipe.name}</h1>
      </div>

      <RecipeEditForm recipe={recipe} />
    </div>
  );
}
