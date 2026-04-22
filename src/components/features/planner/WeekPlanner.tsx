"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MealType } from "@/types";
import ScaledIngredients from "@/components/features/planner/ScaledIngredients";

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "snack", "dinner"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanItem = {
  id: string;
  dayOfWeek: number;
  mealType: MealType;
  servings: number;
  recipe: { id: string; name: string; servings: number };
};

type RecipeOption = { id: string; name: string; servings: number };

export interface WeekPlannerProps {
  planId: string;
  weekStart: string; // ISO date string "YYYY-MM-DD"
  initialItems: PlanItem[];
  prevPlanId: string | null;
  nextPlanId: string | null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayHeading(isoDate: string): string {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const fmt = (s: string) =>
    new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const year = new Date(end + "T00:00:00Z").getUTCFullYear();
  return `${fmt(weekStart)} – ${fmt(end)}, ${year}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Btn({
  onClick,
  disabled,
  title,
  children,
  variant = "ghost",
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  variant?: "ghost" | "danger" | "accent" | "copy";
}) {
  const cls = {
    ghost: "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]",
    danger: "text-[var(--muted)] hover:text-red-600 hover:bg-red-50",
    accent: "text-[var(--accent)] hover:text-[var(--accent-hover)] hover:bg-green-50",
    copy: "text-amber-600 hover:text-amber-700 hover:bg-amber-50",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded p-1 text-xs transition-colors disabled:opacity-30 ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── Recipe Picker ────────────────────────────────────────────────────────────

function RecipePicker({
  recipes,
  loading,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: {
  recipes: RecipeOption[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (recipe: RecipeOption) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search recipes…"
          className="flex-1 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <Btn onClick={onClose} title="Cancel" variant="ghost">✕</Btn>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--muted)] px-1">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-[var(--muted)] px-1">
          {query ? "No matches" : "No recipes yet"}
        </p>
      ) : (
        <ul className="max-h-48 overflow-y-auto flex flex-col divide-y divide-[var(--border)] rounded border border-[var(--border)] bg-white">
          {filtered.slice(0, 20).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 hover:text-[var(--accent)] transition-colors flex items-center justify-between"
              >
                <span className="truncate">{r.name}</span>
                <span className="text-xs text-[var(--muted)] ml-2 flex-shrink-0">
                  {r.servings} serv
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeekPlanner({
  planId,
  weekStart,
  initialItems,
  prevPlanId,
  nextPlanId,
}: WeekPlannerProps) {
  const router = useRouter();

  // ── Core state ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<PlanItem[]>(initialItems);
  const [copySource, setCopySource] = useState<PlanItem | null>(null);

  // Picker state
  const [pickerSlot, setPickerSlot] = useState<{ day: number; meal: MealType } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const recipesLoaded = useRef(false);

  // Per-slot error flashes
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Which filled slots are showing their scaled ingredient list
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());

  function toggleExpanded(itemId: string) {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  const slotKey = (day: number, meal: MealType) => `${day}-${meal}`;

  function getSlot(day: number, meal: MealType): PlanItem | undefined {
    return items.find((i) => i.dayOfWeek === day && i.mealType === meal);
  }

  function flashError(day: number, meal: MealType, msg: string) {
    const key = slotKey(day, meal);
    setErrors((e) => ({ ...e, [key]: msg }));
    setTimeout(() => setErrors((e) => { const n = { ...e }; delete n[key]; return n; }), 3000);
  }

  // Load recipes once on first picker open
  const loadRecipes = useCallback(async () => {
    if (recipesLoaded.current) return;
    recipesLoaded.current = true;
    setRecipesLoading(true);
    try {
      const res = await fetch("/api/recipes?limit=200");
      const data = await res.json();
      if (data.ok) {
        setRecipes(
          data.data.items.map((r: { id: string; name: string; servings: number }) => ({
            id: r.id,
            name: r.name,
            servings: r.servings,
          }))
        );
      }
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  // Close picker on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPickerSlot(null);
        setCopySource(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────

  async function openPicker(day: number, meal: MealType) {
    setPickerSlot({ day, meal });
    setPickerQuery("");
    loadRecipes();
  }

  async function assignRecipe(day: number, meal: MealType, recipe: RecipeOption) {
    setPickerSlot(null);
    const optimistic: PlanItem = {
      id: `optimistic-${day}-${meal}`,
      dayOfWeek: day,
      mealType: meal,
      servings: recipe.servings,
      recipe,
    };
    setItems((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/meal-plans/${planId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id, dayOfWeek: day, mealType: meal, servings: recipe.servings }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      // Replace optimistic with real
      setItems((prev) =>
        prev.map((i) => (i.id === optimistic.id ? { ...data.data, mealType: data.data.mealType as MealType } : i))
      );
    } catch (err) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
      flashError(day, meal, err instanceof Error ? err.message : "Failed to add");
    }
  }

  async function removeItem(item: PlanItem) {
    if (copySource?.id === item.id) setCopySource(null);
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    try {
      const res = await fetch(`/api/meal-plans/${planId}/items/${item.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove");
    } catch {
      setItems((prev) => [...prev, item]); // revert
      flashError(item.dayOfWeek, item.mealType, "Failed to remove");
    }
  }

  async function updateServings(item: PlanItem, delta: number) {
    const next = Math.max(1, item.servings + delta);
    if (next === item.servings) return;

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, servings: next } : i))
    );

    try {
      const res = await fetch(`/api/meal-plans/${planId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, servings: item.servings } : i))
      );
    }
  }

  async function pasteToSlot(day: number, meal: MealType) {
    if (!copySource) return;
    const src = copySource;
    setCopySource(null);
    await assignRecipe(day, meal, src.recipe);
  }

  // Navigate to adjacent week; create plan if needed
  async function navigateWeek(dir: -1 | 1) {
    const targetId = dir === -1 ? prevPlanId : nextPlanId;
    if (targetId) {
      router.push(`/plans/${targetId}`);
      return;
    }
    // Create the adjacent week
    const targetDate = addDays(weekStart, dir * 7);
    const res = await fetch("/api/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: targetDate }),
    });
    const data = await res.json();
    if (data.ok) router.push(`/plans/${data.data.id}`);
    else if (res.status === 409) {
      // Already exists — refresh to pick up the planId
      router.refresh();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1 pb-12">

      {/* Week header */}
      <div className="flex items-center justify-between gap-2 pb-4">
        <div>
          <h1 className="text-xl font-bold">{formatWeekRange(weekStart)}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigateWeek(-1)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => navigateWeek(1)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Copy mode banner */}
      {copySource && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            Copying <strong>{copySource.recipe.name}</strong> — click an empty slot to paste
          </span>
          <button
            type="button"
            onClick={() => setCopySource(null)}
            className="font-medium hover:text-amber-900"
          >
            Cancel ✕
          </button>
        </div>
      )}

      {/* 7 days */}
      {Array.from({ length: 7 }, (_, dayIdx) => {
        const dayDate = addDays(weekStart, dayIdx);

        return (
          <div key={dayIdx} className="rounded-xl border border-[var(--border)] bg-white overflow-hidden mb-3">
            {/* Day header */}
            <div className="px-4 py-2 bg-[var(--background)] border-b border-[var(--border)]">
              <span className="text-sm font-semibold">
                {formatDayHeading(dayDate)}
              </span>
            </div>

            {/* Meal rows */}
            {MEAL_ORDER.map((meal, mealIdx) => {
              const item = getSlot(dayIdx, meal);
              const isPickerOpen =
                pickerSlot?.day === dayIdx && pickerSlot?.meal === meal;
              const errMsg = errors[slotKey(dayIdx, meal)];
              const isPasteTarget =
                copySource !== null &&
                copySource.mealType === meal &&
                !item;
              const isLastMeal = mealIdx === MEAL_ORDER.length - 1;

              return (
                <div
                  key={meal}
                  className={`flex gap-0 ${!isLastMeal ? "border-b border-[var(--border)]" : ""}`}
                >
                  {/* Meal label */}
                  <div className="w-24 flex-shrink-0 flex items-start px-3 pt-2.5 text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                    {MEAL_LABELS[meal]}
                  </div>

                  {/* Slot content */}
                  <div className="flex-1 min-w-0 px-2 py-2">
                    {errMsg && (
                      <p className="text-xs text-red-600 mb-1">{errMsg}</p>
                    )}

                    {item ? (
                      /* Filled slot */
                      <div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Recipe name — click to expand scaled ingredients */}
                          <button
                            type="button"
                            onClick={() => toggleExpanded(item.id)}
                            className="flex-1 min-w-0 text-left text-sm font-medium truncate hover:text-[var(--accent)] transition-colors"
                            title={expandedSlots.has(item.id) ? "Hide ingredients" : "Show scaled ingredients"}
                          >
                            {item.recipe.name}
                            <span className="ml-1 text-[var(--muted)] text-xs">
                              {expandedSlots.has(item.id) ? "▴" : "▾"}
                            </span>
                          </button>

                          {/* Servings control */}
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Btn
                              onClick={() => updateServings(item, -1)}
                              disabled={item.servings <= 1}
                              title="Fewer servings"
                              variant="ghost"
                            >−</Btn>
                            <span className="text-sm font-semibold w-5 text-center tabular-nums">
                              {item.servings}
                            </span>
                            <Btn
                              onClick={() => updateServings(item, 1)}
                              title="More servings"
                              variant="ghost"
                            >+</Btn>
                            <span className="text-xs text-[var(--muted)]">🧑</span>
                          </div>

                          {/* Copy */}
                          <Btn
                            onClick={() =>
                              setCopySource(copySource?.id === item.id ? null : item)
                            }
                            title="Copy to another day"
                            variant={copySource?.id === item.id ? "copy" : "ghost"}
                          >
                            {copySource?.id === item.id ? "📋✓" : "📋"}
                          </Btn>

                          {/* Remove */}
                          <Btn
                            onClick={() => removeItem(item)}
                            title="Remove"
                            variant="danger"
                          >✕</Btn>
                        </div>

                        {/* Scaled ingredient list — lazy-loaded on expand */}
                        {expandedSlots.has(item.id) && (
                          <ScaledIngredients
                            recipeId={item.recipe.id}
                            recipeDefaultServings={item.recipe.servings}
                            planServings={item.servings}
                          />
                        )}
                      </div>
                    ) : isPickerOpen ? (
                      /* Recipe picker */
                      <RecipePicker
                        recipes={recipes}
                        loading={recipesLoading}
                        query={pickerQuery}
                        onQueryChange={setPickerQuery}
                        onSelect={(r) => assignRecipe(dayIdx, meal, r)}
                        onClose={() => setPickerSlot(null)}
                      />
                    ) : isPasteTarget ? (
                      /* Paste target */
                      <button
                        type="button"
                        onClick={() => pasteToSlot(dayIdx, meal)}
                        className="w-full text-left text-sm text-amber-700 font-medium rounded border-2 border-dashed border-amber-400 bg-amber-50 px-2 py-1 hover:bg-amber-100 transition-colors"
                      >
                        Paste: {copySource!.recipe.name}
                      </button>
                    ) : (
                      /* Empty slot */
                      <button
                        type="button"
                        onClick={() => openPicker(dayIdx, meal)}
                        className="text-sm text-[var(--muted)] hover:text-[var(--accent)] hover:bg-green-50 rounded px-2 py-1 transition-colors w-full text-left"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Week summary */}
      <p className="text-xs text-center text-[var(--muted)]">
        {items.length} meal{items.length !== 1 ? "s" : ""} planned ·{" "}
        {28 - items.length} slot{28 - items.length !== 1 ? "s" : ""} empty
      </p>

      {/* Day labels reference */}
      <p className="text-xs text-center text-[var(--muted)]">
        {DAY_SHORT.map((d, i) => (
          <span key={i}>{i > 0 ? " · " : ""}{d}</span>
        ))}
      </p>
    </div>
  );
}
