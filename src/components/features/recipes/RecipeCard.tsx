import Link from "next/link";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prepMins: number;
  cookMins: number;
  source: string | null;
  _count: { ingredients: number };
};

function formatMins(mins: number): string {
  if (mins === 0) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const timeParts = [
    recipe.prepMins ? `${formatMins(recipe.prepMins)} prep` : null,
    recipe.cookMins ? `${formatMins(recipe.cookMins)} cook` : null,
  ].filter(Boolean);

  const meta = [
    `${recipe.servings} serving${recipe.servings !== 1 ? "s" : ""}`,
    ...timeParts,
    `${recipe._count.ingredients} ingredient${recipe._count.ingredients !== 1 ? "s" : ""}`,
  ].join(" · ");

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block rounded-xl border border-[var(--border)] bg-white p-4 hover:border-[var(--accent)] transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors truncate">
            {recipe.name}
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">{meta}</p>
          {recipe.description && (
            <p className="text-sm text-[var(--muted)] mt-1.5 line-clamp-2">
              {recipe.description}
            </p>
          )}
          {recipe.source && (
            <p className="text-xs text-[var(--accent)] mt-1.5">
              🔗 {sourceDomain(recipe.source)}
            </p>
          )}
        </div>
        <span className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors flex-shrink-0 mt-0.5">
          →
        </span>
      </div>
    </Link>
  );
}
