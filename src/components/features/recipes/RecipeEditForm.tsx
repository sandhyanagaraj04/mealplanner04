"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prepMins: number;
  cookMins: number;
  source: string | null;
  rawIngredients: string;
  rawInstructions: string;
};

export default function RecipeEditForm({ recipe }: { recipe: Recipe }) {
  const router = useRouter();

  const [name, setName] = useState(recipe.name);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [servings, setServings] = useState(String(recipe.servings));
  const [prepMins, setPrepMins] = useState(String(recipe.prepMins));
  const [cookMins, setCookMins] = useState(String(recipe.cookMins));
  const [source, setSource] = useState(recipe.source ?? "");
  const [rawIngredients, setRawIngredients] = useState(recipe.rawIngredients);
  const [rawInstructions, setRawInstructions] = useState(recipe.rawInstructions);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawChanged =
    rawIngredients !== recipe.rawIngredients ||
    rawInstructions !== recipe.rawInstructions;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        servings: parseInt(servings) || recipe.servings,
        prepMins: parseInt(prepMins) || 0,
        cookMins: parseInt(cookMins) || 0,
        source: source.trim() || null,
      };

      if (rawIngredients !== recipe.rawIngredients) body.rawIngredients = rawIngredients;
      if (rawInstructions !== recipe.rawInstructions) body.rawInstructions = rawInstructions;

      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");

      router.push(`/recipes/${recipe.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${recipe.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      router.push("/recipes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5 pb-12">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="name">Title</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={busy}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="desc">Description</label>
        <textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={busy}
          placeholder="Optional short description"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 resize-y"
        />
      </div>

      {/* Servings / times */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor="servings">Servings</label>
          <input
            id="servings"
            type="number"
            min="1"
            max="500"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor="prep">Prep (min)</label>
          <input
            id="prep"
            type="number"
            min="0"
            value={prepMins}
            onChange={(e) => setPrepMins(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor="cook">Cook (min)</label>
          <input
            id="cook"
            type="number"
            min="0"
            value={cookMins}
            onChange={(e) => setCookMins(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
      </div>

      {/* Source URL */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="source">Source URL</label>
        <input
          id="source"
          type="url"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={busy}
          placeholder="https://example.com/recipe"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border)]" />

      {/* Raw ingredients */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-semibold" htmlFor="raw-ing">Ingredients (raw text)</label>
          {rawChanged && (
            <span className="text-xs text-amber-700">Will re-parse on save</span>
          )}
        </div>
        <textarea
          id="raw-ing"
          value={rawIngredients}
          onChange={(e) => setRawIngredients(e.target.value)}
          rows={10}
          disabled={busy}
          placeholder={"2 cups all-purpose flour\n1 tsp salt\n..."}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 resize-y"
        />
      </div>

      {/* Raw instructions */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="raw-inst">Instructions (raw text)</label>
        <textarea
          id="raw-inst"
          value={rawInstructions}
          onChange={(e) => setRawInstructions(e.target.value)}
          rows={10}
          disabled={busy}
          placeholder={"1. Preheat oven to 375°F\n2. Mix flour and salt\n..."}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 resize-y"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="text-sm text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Delete Recipe"}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={busy}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
