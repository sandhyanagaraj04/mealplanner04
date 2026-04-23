import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getRecipe } from "@/lib/services/recipeService";
import { auth } from "@/auth";

type Params = { params: Promise<{ recipeId: string }> };

function formatMins(mins: number): string {
  if (mins === 0) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function formatQty(qty: number | null, max: number | null): string {
  if (qty === null) return "";
  const fmt = (n: number) => (n % 1 === 0 ? String(n) : parseFloat(n.toFixed(3)).toString());
  return max !== null ? `${fmt(qty)}–${fmt(max)}` : fmt(qty);
}

export default async function RecipeDetailPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { recipeId } = await params;
  const recipe = await getRecipe(recipeId, userId);
  if (!recipe) notFound();

  const timeParts = [
    recipe.prepMins ? `${formatMins(recipe.prepMins)} prep` : null,
    recipe.cookMins ? `${formatMins(recipe.cookMins)} cook` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6 pb-12 pt-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <Link
          href="/recipes"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex-shrink-0 mt-1"
        >
          ← Recipes
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/plans"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            + Add to Plan
          </Link>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Title + meta */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-tight">{recipe.name}</h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
          <span>{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}</span>
          {timeParts.map((t) => (
            <span key={t}>· {t}</span>
          ))}
        </div>

        {recipe.source && (
          <a
            href={recipe.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline break-all"
          >
            🔗 {recipe.source}
          </a>
        )}

        {recipe.description && (
          <p className="text-sm text-[var(--muted)] mt-1">{recipe.description}</p>
        )}
      </div>

      {/* Ingredients */}
      <section>
        <h2 className="text-base font-semibold mb-3">
          Ingredients
          <span className="ml-1.5 text-sm font-normal text-[var(--muted)]">
            ({recipe.ingredients.length})
          </span>
        </h2>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic">No ingredients parsed.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recipe.ingredients.map((ing) => {
              const qty = formatQty(ing.quantity, ing.quantityMax);
              const unit = ing.unit ?? "";
              const name = ing.displayName ?? ing.rawText;
              const prep = ing.preparationNote;

              return (
                <li
                  key={ing.id}
                  className="flex gap-3 text-sm py-1.5 border-b border-[var(--border)] last:border-0"
                >
                  <span className="w-20 flex-shrink-0 text-right text-[var(--muted)] font-mono text-xs pt-0.5">
                    {[qty, unit].filter(Boolean).join(" ")}
                  </span>
                  <span className="flex-1 min-w-0">
                    {name}
                    {prep && (
                      <span className="text-[var(--muted)]">, {prep}</span>
                    )}
                    {ing.isOptional && (
                      <span className="ml-1.5 text-xs text-[var(--muted)] italic">(optional)</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Steps */}
      <section>
        <h2 className="text-base font-semibold mb-3">
          Instructions
          <span className="ml-1.5 text-sm font-normal text-[var(--muted)]">
            ({recipe.steps.length} step{recipe.steps.length !== 1 ? "s" : ""})
          </span>
        </h2>
        {recipe.steps.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic">No steps parsed.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {recipe.steps.map((step) => (
              <li key={step.id} className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {step.stepNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{step.instruction}</p>
                  {step.durationMins && (
                    <p className="text-xs text-[var(--muted)] mt-1">
                      ⏱ {formatMins(step.durationMins)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
