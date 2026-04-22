"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function currentMonday(): string {
  return mondayOf(new Date().toISOString().slice(0, 10));
}

export default function NewPlanButton({ existingWeeks }: { existingWeeks: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentMonday);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const weekStart = mondayOf(date);
      const res = await fetch("/api/meal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = await res.json();

      if (res.status === 409) {
        // Already exists — find and navigate to it
        const existingRes = await fetch(`/api/meal-plans?limit=100`);
        const existingData = await existingRes.json();
        if (existingData.ok) {
          const plan = existingData.data.items.find(
            (p: { weekStart: string; id: string }) =>
              new Date(p.weekStart).toISOString().slice(0, 10) === weekStart
          );
          if (plan) { router.push(`/plans/${plan.id}`); return; }
        }
        setError("A plan for that week already exists.");
        return;
      }

      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to create plan");
      router.push(`/plans/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors"
      >
        + New Week
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        disabled={loading}
        className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
      />
      <button
        onClick={handleCreate}
        disabled={loading || !date}
        className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating…" : "Open"}
      </button>
      <button
        onClick={() => { setOpen(false); setError(null); }}
        disabled={loading}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
