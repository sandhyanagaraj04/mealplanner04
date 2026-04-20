import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 pt-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Welcome</h1>
        <p className="mt-1 text-[var(--muted)]">Plan your meals for the week.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/plans"
          className="block rounded-xl border border-[var(--border)] bg-white p-4 hover:border-[var(--accent)] transition-colors"
        >
          <div className="font-semibold">Meal Plans</div>
          <div className="text-sm text-[var(--muted)] mt-0.5">View and edit your weekly plans</div>
        </Link>

        <Link
          href="/recipes"
          className="block rounded-xl border border-[var(--border)] bg-white p-4 hover:border-[var(--accent)] transition-colors"
        >
          <div className="font-semibold">Recipes</div>
          <div className="text-sm text-[var(--muted)] mt-0.5">Browse and add recipes</div>
        </Link>
      </div>
    </div>
  );
}
