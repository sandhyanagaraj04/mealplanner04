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

type PlanItemShoppingItem = {
  id: string;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

type PlanItem = {
  id: string;
  type?: string;
  name?: string | null;
  dayOfWeek: number;
  mealType: MealType;
  servings: number;
  customNote?: string | null;
  includeInShopping?: boolean;
  recipe: { id: string; name: string; servings: number } | null;
  shoppingItems?: PlanItemShoppingItem[];
};

function displayName(item: PlanItem): string {
  if (item.type !== "quick" && !item.recipe) return "Recipe not available";
  return item.name ?? item.recipe?.name ?? "Unnamed";
}

function isRecipeMissing(item: PlanItem): boolean {
  return item.type !== "quick" && !item.recipe;
}

type RecipeOption = { id: string; name: string; servings: number };

// Draft row for the quick-meal shopping items form
type ShoppingDraft = {
  _key: string;
  item_name: string;
  quantity: string;
  unit: string;
  note: string;
};

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
      className={`rounded p-2 sm:p-1 text-xs transition-colors disabled:opacity-30 ${cls}`}
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
          className="flex-1 rounded border border-[var(--border)] bg-white px-2 py-2 sm:py-1 text-sm outline-none focus:border-[var(--accent)]"
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

// ─── Quick Meal Form ──────────────────────────────────────────────────────────

type QuickMealSubmitData = {
  name: string;
  customNote?: string;
  shopping_items?: Array<{ item_name: string; quantity?: number; unit?: string; note?: string }>;
};

function QuickMealForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: QuickMealSubmitData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [drafts, setDrafts] = useState<ShoppingDraft[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      { _key: String(Date.now() + Math.random()), item_name: "", quantity: "", unit: "", note: "" },
    ]);
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d._key !== key));
  }

  function updateDraft(key: string, field: keyof Omit<ShoppingDraft, "_key">, value: string) {
    setDrafts((prev) => prev.map((d) => (d._key === key ? { ...d, [field]: value } : d)));
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const validItems = drafts
      .filter((d) => d.item_name.trim())
      .map((d) => ({
        item_name: d.item_name.trim(),
        ...(d.quantity && !isNaN(parseFloat(d.quantity)) ? { quantity: parseFloat(d.quantity) } : {}),
        ...(d.unit.trim() ? { unit: d.unit.trim() } : {}),
        ...(d.note.trim() ? { note: d.note.trim() } : {}),
      }));
    onSubmit({
      name: trimmed,
      ...(note.trim() ? { customNote: note.trim() } : {}),
      ...(validItems.length > 0 ? { shopping_items: validItems } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {/* Name + Add — stacks vertically on mobile so Add is always visible */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-1">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !shoppingOpen) handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Meal name…"
          className="flex-1 rounded border border-[var(--border)] bg-white px-3 py-2.5 sm:px-2 sm:py-1 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full sm:w-auto rounded bg-[var(--accent)] px-3 py-2.5 sm:py-1 text-sm sm:text-xs font-medium text-white disabled:opacity-40 hover:bg-[var(--accent-hover)]"
        >
          Save meal
        </button>
      </div>

      {/* Notes (optional) */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notes (optional)…"
        className="rounded border border-[var(--border)] bg-white px-3 py-2 sm:px-2 sm:py-1 text-sm sm:text-xs text-[var(--muted)] outline-none focus:border-[var(--accent)] focus:text-[var(--foreground)]"
      />

      {/* Shopping items — collapsed by default */}
      <div className="rounded border border-[var(--border)] bg-[var(--background)] overflow-hidden">
        <button
          type="button"
          onClick={() => {
            if (!shoppingOpen) { setShoppingOpen(true); if (drafts.length === 0) addDraft(); }
            else setShoppingOpen(false);
          }}
          className="w-full text-left px-3 py-2.5 sm:px-2 sm:py-1.5 text-sm sm:text-xs text-[var(--muted)] hover:text-[var(--foreground)] flex items-center justify-between transition-colors"
        >
          <span>Need to buy anything for this meal?</span>
          <span>{shoppingOpen ? "▴" : "▾"}</span>
        </button>

        {shoppingOpen && (
          <div className="flex flex-col gap-2 sm:gap-1 px-3 sm:px-2 pb-3 sm:pb-2 border-t border-[var(--border)]">
            {drafts.map((d) => (
              <div key={d._key} className="flex flex-col gap-1 pt-2 sm:pt-1">
                {/* Item name + remove */}
                <div className="flex gap-1.5 sm:gap-1">
                  <input
                    type="text"
                    value={d.item_name}
                    onChange={(e) => updateDraft(d._key, "item_name", e.target.value)}
                    placeholder="Item name…"
                    className="flex-1 rounded border border-[var(--border)] bg-white px-3 py-2 sm:px-2 sm:py-1 text-sm sm:text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraft(d._key)}
                    className="text-[var(--muted)] hover:text-red-500 px-2 py-2 sm:px-1 text-sm sm:text-xs"
                  >✕</button>
                </div>
                {/* Qty / unit / note — full-width on mobile */}
                <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-1">
                  <input
                    type="number"
                    value={d.quantity}
                    onChange={(e) => updateDraft(d._key, "quantity", e.target.value)}
                    placeholder="Qty"
                    min="0"
                    className="rounded border border-[var(--border)] bg-white px-2 py-2 sm:w-14 sm:py-0.5 text-sm sm:text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    type="text"
                    value={d.unit}
                    onChange={(e) => updateDraft(d._key, "unit", e.target.value)}
                    placeholder="Unit"
                    className="rounded border border-[var(--border)] bg-white px-2 py-2 sm:w-16 sm:py-0.5 text-sm sm:text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    type="text"
                    value={d.note}
                    onChange={(e) => updateDraft(d._key, "note", e.target.value)}
                    placeholder="Note"
                    className="rounded border border-[var(--border)] bg-white px-2 py-2 sm:flex-1 sm:py-0.5 text-sm sm:text-xs outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addDraft}
              className="mt-1 py-1 text-sm sm:text-xs text-[var(--accent)] hover:underline text-left"
            >
              + Add item
            </button>
          </div>
        )}
      </div>
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
  const [pickerSlot, setPickerSlot] = useState<{ day: number; meal: MealType; mode: "recipe" | "quick" } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const recipesLoaded = useRef(false);

  // Attach-recipe state (quick → recipe conversion)
  const [attachItemId, setAttachItemId] = useState<string | null>(null);
  const [attachQuery, setAttachQuery] = useState("");
  const [attachStep, setAttachStep] = useState<"picking" | "confirming">("picking");
  const [pendingAttachRecipe, setPendingAttachRecipe] = useState<RecipeOption | null>(null);

  function openAttach(itemId: string) {
    setAttachItemId(itemId);
    setAttachQuery("");
    setAttachStep("picking");
    setPendingAttachRecipe(null);
    loadRecipes();
  }

  function closeAttach() {
    setAttachItemId(null);
    setPendingAttachRecipe(null);
    setAttachStep("picking");
  }

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
    setPickerSlot({ day, meal, mode: "recipe" });
    setPickerQuery("");
    loadRecipes();
  }

  async function assignRecipe(day: number, meal: MealType, recipe: RecipeOption) {
    setPickerSlot(null);
    const optimistic: PlanItem = {
      id: `optimistic-${day}-${meal}`,
      type: "recipe",
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
        body: JSON.stringify({ type: "recipe", recipeId: recipe.id, dayOfWeek: day, mealType: meal, servings: recipe.servings }),
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

  async function assignQuickMeal(day: number, meal: MealType, formData: QuickMealSubmitData) {
    setPickerSlot(null);
    const optimistic: PlanItem = {
      id: `optimistic-quick-${day}-${meal}`,
      type: "quick",
      name: formData.name,
      customNote: formData.customNote ?? null,
      dayOfWeek: day,
      mealType: meal,
      servings: 1,
      recipe: null,
      shoppingItems: (formData.shopping_items ?? []).map((si, i) => ({
        id: `optimistic-si-${i}`,
        itemName: si.item_name,
        quantity: si.quantity ?? null,
        unit: si.unit ?? null,
        note: si.note ?? null,
      })),
    };
    setItems((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/meal-plans/${planId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "quick", dayOfWeek: day, mealType: meal, ...formData }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
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

  async function toggleIncludeInShopping(item: PlanItem) {
    const next = item.includeInShopping === false ? true : false;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, includeInShopping: next } : i))
    );
    try {
      const res = await fetch(`/api/meal-plans/${planId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInShopping: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...data.data, mealType: data.data.mealType as MealType } : i))
      );
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? item : i))
      );
    }
  }

  async function pasteToSlot(day: number, meal: MealType) {
    if (!copySource) return;
    const src = copySource;
    setCopySource(null);
    if (src.type === "quick" || !src.recipe) {
      await assignQuickMeal(day, meal, { name: src.name ?? "Quick meal" });
    } else {
      await assignRecipe(day, meal, src.recipe);
    }
  }

  async function attachRecipe(item: PlanItem, recipe: RecipeOption, clearShoppingItems: boolean) {
    closeAttach();
    const prev = { ...item };
    setItems((all) =>
      all.map((i) =>
        i.id === item.id
          ? { ...i, type: "recipe", recipe, shoppingItems: clearShoppingItems ? [] : i.shoppingItems }
          : i
      )
    );
    try {
      const res = await fetch(`/api/meal-plans/${planId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "recipe", recipeId: recipe.id, clearShoppingItems }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      setItems((all) =>
        all.map((i) => (i.id === item.id ? { ...data.data, mealType: data.data.mealType as MealType } : i))
      );
    } catch (err) {
      setItems((all) => all.map((i) => (i.id === item.id ? prev : i)));
      flashError(item.dayOfWeek, item.mealType, err instanceof Error ? err.message : "Failed to attach");
    }
  }

  function handleRecipeSelected(item: PlanItem, recipe: RecipeOption) {
    const hasShoppingItems = (item.shoppingItems?.length ?? 0) > 0;
    if (!hasShoppingItems) {
      attachRecipe(item, recipe, false);
    } else {
      setPendingAttachRecipe(recipe);
      setAttachStep("confirming");
    }
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
            Copying <strong>{displayName(copySource)}</strong> — click an empty slot to paste
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
                  className={`flex flex-col sm:flex-row gap-0 ${!isLastMeal ? "border-b border-[var(--border)]" : ""}`}
                >
                  {/* Meal label — inline above content on mobile, sidebar on sm+ */}
                  <div className="sm:w-24 sm:flex-shrink-0 flex items-center sm:items-start px-3 pt-2 pb-0.5 sm:pt-2.5 sm:pb-0 text-[10px] sm:text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                    {MEAL_LABELS[meal]}
                  </div>

                  {/* Slot content — full width on mobile */}
                  <div className="flex-1 min-w-0 px-3 sm:px-2 pb-3 sm:py-2 pt-0 sm:pt-2">
                    {errMsg && (
                      <p className="text-xs text-red-600 mb-1">{errMsg}</p>
                    )}

                    {item ? (
                      /* Filled slot */
                      <div>
                        {/* Attach-recipe picker / confirm — replaces normal controls while active */}
                        {attachItemId === item.id ? (
                          <div className="flex flex-col gap-1">
                            {attachStep === "picking" ? (
                              <>
                                <p className="text-xs text-[var(--muted)] font-medium">Attach a recipe to this meal:</p>
                                <RecipePicker
                                  recipes={recipes}
                                  loading={recipesLoading}
                                  query={attachQuery}
                                  onQueryChange={setAttachQuery}
                                  onSelect={(r) => handleRecipeSelected(item, r)}
                                  onClose={closeAttach}
                                />
                              </>
                            ) : (
                              /* Confirm step — shopping items conflict */
                              <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-2">
                                <p className="text-xs text-amber-900 font-medium">
                                  This meal has {item.shoppingItems!.length} manually added shopping item{item.shoppingItems!.length !== 1 ? "s" : ""}. What would you like to do?
                                </p>
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() => attachRecipe(item, pendingAttachRecipe!, true)}
                                    className="text-left text-xs rounded border border-[var(--border)] bg-white px-2 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                  >
                                    Replace with recipe ingredients
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => attachRecipe(item, pendingAttachRecipe!, false)}
                                    className="text-left text-xs rounded border border-[var(--border)] bg-white px-2 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                  >
                                    Keep both temporarily
                                  </button>
                                  <button
                                    type="button"
                                    onClick={closeAttach}
                                    className="text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1 flex-wrap">
                              {/* Meal name */}
                              <button
                                type="button"
                                onClick={() => item.recipe && toggleExpanded(item.id)}
                                disabled={isRecipeMissing(item)}
                                className={`flex-1 min-w-0 text-left text-sm font-medium truncate transition-colors ${
                                  isRecipeMissing(item)
                                    ? "text-[var(--muted)] italic cursor-default"
                                    : "hover:text-[var(--accent)]"
                                }`}
                                title={
                                  isRecipeMissing(item)
                                    ? "Recipe was deleted"
                                    : item.recipe
                                    ? (expandedSlots.has(item.id) ? "Hide ingredients" : "Show scaled ingredients")
                                    : undefined
                                }
                              >
                                {displayName(item)}
                                {item.recipe && (
                                  <span className="ml-1 text-[var(--muted)] text-xs">
                                    {expandedSlots.has(item.id) ? "▴" : "▾"}
                                  </span>
                                )}
                              </button>

                              {/* Servings control — recipe meals only */}
                              {item.type !== "quick" && (
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  <Btn onClick={() => updateServings(item, -1)} disabled={item.servings <= 1} title="Fewer servings" variant="ghost">−</Btn>
                                  <span className="text-sm font-semibold w-5 text-center tabular-nums">{item.servings}</span>
                                  <Btn onClick={() => updateServings(item, 1)} title="More servings" variant="ghost">+</Btn>
                                  <span className="text-xs text-[var(--muted)]">🧑</span>
                                </div>
                              )}

                              {/* Shopping list toggle — recipe meals only */}
                              {item.type !== "quick" && (
                                <Btn
                                  onClick={() => toggleIncludeInShopping(item)}
                                  title={item.includeInShopping !== false ? "Exclude from shopping list" : "Include in shopping list"}
                                  variant={item.includeInShopping !== false ? "ghost" : "danger"}
                                >
                                  🛒
                                </Btn>
                              )}

                              {/* Copy */}
                              <Btn onClick={() => setCopySource(copySource?.id === item.id ? null : item)} title="Copy to another day" variant={copySource?.id === item.id ? "copy" : "ghost"}>
                                {copySource?.id === item.id ? "📋✓" : "📋"}
                              </Btn>

                              {/* Remove */}
                              <Btn onClick={() => removeItem(item)} title="Remove" variant="danger">✕</Btn>
                            </div>

                            {/* Quick meal secondary row */}
                            {item.type === "quick" && (
                              <div className="mt-0.5 flex items-center gap-2">
                                {(item.shoppingItems?.length ?? 0) > 0 && (
                                  <span className="text-xs text-[var(--muted)]">
                                    {item.shoppingItems!.length} shopping item{item.shoppingItems!.length !== 1 ? "s" : ""}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openAttach(item.id)}
                                  className="text-xs text-[var(--accent)] hover:underline"
                                >
                                  Attach recipe
                                </button>
                              </div>
                            )}

                            {/* Scaled ingredients — recipe meals only */}
                            {expandedSlots.has(item.id) && item.recipe && (
                              <ScaledIngredients
                                recipeId={item.recipe.id}
                                recipeDefaultServings={item.recipe.servings}
                                planServings={item.servings}
                              />
                            )}
                          </>
                        )}
                      </div>
                    ) : isPickerOpen ? (
                      /* Picker with recipe/quick tabs */
                      <div className="flex flex-col gap-1 pt-1">
                        {/* Mode tabs */}
                        <div className="flex gap-2 sm:gap-1 mb-2 sm:mb-1">
                          <button
                            type="button"
                            onClick={() => setPickerSlot((s) => s ? { ...s, mode: "recipe" } : s)}
                            className={`flex-1 sm:flex-none px-3 sm:px-2 py-2 sm:py-0.5 rounded text-sm sm:text-xs font-medium transition-colors ${pickerSlot?.mode === "recipe" ? "bg-[var(--accent)] text-white" : "bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                          >
                            Recipe
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerSlot((s) => s ? { ...s, mode: "quick" } : s)}
                            className={`flex-1 sm:flex-none px-3 sm:px-2 py-2 sm:py-0.5 rounded text-sm sm:text-xs font-medium transition-colors ${pickerSlot?.mode === "quick" ? "bg-[var(--accent)] text-white" : "bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                          >
                            Quick meal
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerSlot(null)}
                            className="text-sm sm:text-xs text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-2 sm:px-1 sm:py-0"
                            title="Cancel"
                          >✕</button>
                        </div>

                        {pickerSlot?.mode === "quick" ? (
                          <QuickMealForm
                            onSubmit={(fd) => assignQuickMeal(dayIdx, meal, fd)}
                            onCancel={() => setPickerSlot(null)}
                          />
                        ) : (
                          /* Recipe picker */
                          <RecipePicker
                            recipes={recipes}
                            loading={recipesLoading}
                            query={pickerQuery}
                            onQueryChange={setPickerQuery}
                            onSelect={(r) => assignRecipe(dayIdx, meal, r)}
                            onClose={() => setPickerSlot(null)}
                          />
                        )}
                      </div>
                    ) : isPasteTarget ? (
                      /* Paste target */
                      <button
                        type="button"
                        onClick={() => pasteToSlot(dayIdx, meal)}
                        className="w-full text-left text-sm text-amber-700 font-medium rounded border-2 border-dashed border-amber-400 bg-amber-50 px-2 py-1 hover:bg-amber-100 transition-colors"
                      >
                        Paste: {displayName(copySource!)}
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
