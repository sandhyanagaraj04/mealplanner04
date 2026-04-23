import Link from "next/link";
import { redirect } from "next/navigation";
import { listRecipes } from "@/lib/services/recipeService";
import { auth } from "@/auth";
import RecipeCard from "@/components/features/recipes/RecipeCard";
import RecipeSearch from "@/components/features/recipes/RecipeSearch";

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function RecipesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { q } = await searchParams;
  const { items, total } = await listRecipes(userId, { limit: 50, offset: 0, q });

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Recipes</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {q
              ? `${total} result${total !== 1 ? "s" : ""} for "${q}"`
              : `${total} recipe${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link
          href="/ingest"
          className="flex-shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          + Import
        </Link>
      </div>

      <RecipeSearch defaultValue={q ?? ""} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[var(--muted)]">
            {q
              ? `No recipes match "${q}". Try a different search.`
              : "No recipes yet."}
          </p>
          {!q && (
            <Link
              href="/ingest"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Import your first recipe →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {total > 50 && (
        <p className="text-xs text-center text-[var(--muted)]">
          Showing first 50 of {total}. Refine your search to find more.
        </p>
      )}
    </div>
  );
}
