"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RecipeSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      startTransition(() => {
        router.replace(`/recipes${params}`);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, router]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm select-none pointer-events-none">
        🔍
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title…"
        className="w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-4 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      />
    </div>
  );
}
