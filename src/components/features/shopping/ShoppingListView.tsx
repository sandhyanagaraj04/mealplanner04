"use client";

import { useState, useCallback } from "react";
import { formatQuantity } from "@/lib/parsers/ingredientScaler";
import type { ShoppingList, ShoppingListItem, ShoppingSource, ShoppingState } from "@/types";

// ─── Category display config ──────────────────────────────────────────────────

const CATEGORY_ORDER = [
  "produce",
  "dairy",
  "protein",
  "baking",
  "pantry",
  "spice",
  "other",
  null, // unresolved / no matched ingredient
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  produce: "Produce",
  dairy: "Dairy",
  protein: "Protein",
  baking: "Baking",
  pantry: "Pantry",
  spice: "Spices & Herbs",
  other: "Other",
};

// ─── State helpers ────────────────────────────────────────────────────────────

type SourceKey = string; // `${mealPlanItemId}:${recipeIngredientId}`

function sourceKey(src: ShoppingSource): SourceKey {
  return `${src.mealPlanItemId}:${src.recipeIngredientId}`;
}

function effectiveState(
  src: ShoppingSource,
  localStates: Map<SourceKey, ShoppingState>
): ShoppingState {
  return localStates.get(sourceKey(src)) ?? src.state;
}

type GroupState = "to_buy" | "bought" | "have_it" | "mixed";

function groupState(
  item: ShoppingListItem,
  localStates: Map<SourceKey, ShoppingState>
): GroupState {
  const states = item.sources.map((s) => effectiveState(s, localStates));
  if (states.every((s) => s === "BOUGHT")) return "bought";
  if (states.every((s) => s === "HAVE_IT")) return "have_it";
  if (states.every((s) => s === "PENDING" || s === "NEED_TO_BUY")) return "to_buy";
  return "mixed";
}

function isToBuy(s: ShoppingState) {
  return s === "PENDING" || s === "NEED_TO_BUY";
}

// ─── Quantity display ─────────────────────────────────────────────────────────

function fmtQty(qty: number | null, unit: string | null): string {
  const q = formatQuantity(qty);
  if (!q && !unit) return "—";
  return [q, unit].filter(Boolean).join(" ");
}

// ─── Day / meal labels ────────────────────────────────────────────────────────

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function sourceMeta(src: ShoppingSource): string {
  const day = DAY_SHORT[src.dayOfWeek] ?? "";
  const meal = src.mealType.charAt(0).toUpperCase() + src.mealType.slice(1);
  return `${day} · ${meal} · ${src.recipeName}`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function patchState(planId: string, stateId: string, state: ShoppingState): Promise<void> {
  await fetch(`/api/meal-plans/${planId}/shopping/${stateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

async function deleteAllStates(planId: string): Promise<void> {
  await fetch(`/api/meal-plans/${planId}/shopping`, { method: "DELETE" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateIcon({ state, mixed }: { state: GroupState | ShoppingState; mixed?: boolean }) {
  if (state === "bought" || state === "BOUGHT") {
    return (
      <span className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "have_it" || state === "HAVE_IT") {
    return (
      <span className="w-5 h-5 rounded-full border-2 border-[var(--muted)] flex items-center justify-center flex-shrink-0 opacity-50">
        <svg className="w-3 h-3 text-[var(--muted)]" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (mixed) {
    return (
      <span className="w-5 h-5 rounded-full border-2 border-[var(--accent)] flex items-center justify-center flex-shrink-0 opacity-60">
        <span className="w-2 h-0.5 bg-[var(--accent)] rounded" />
      </span>
    );
  }
  return (
    <span className="w-5 h-5 rounded-full border-2 border-[var(--border)] flex-shrink-0" />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  planId: string;
  list: ShoppingList;
}

export default function ShoppingListView({ planId, list }: Props) {
  // Local state per source — keyed by mealPlanItemId:recipeIngredientId
  const [localStates, setLocalStates] = useState<Map<SourceKey, ShoppingState>>(() => {
    const m = new Map<SourceKey, ShoppingState>();
    for (const item of list.items) {
      for (const src of item.sources) {
        m.set(sourceKey(src), src.state);
      }
    }
    return m;
  });

  const [filter, setFilter] = useState<"all" | "remaining" | "bought">("remaining");
  const [resetting, setResetting] = useState(false);

  // ── State update ────────────────────────────────────────────────────────────
  const applyState = useCallback(
    async (src: ShoppingSource, newState: ShoppingState) => {
      const key = sourceKey(src);
      const prevState = localStates.get(key) ?? src.state;

      // Optimistic
      setLocalStates((prev) => new Map(prev).set(key, newState));

      if (src.stateId) {
        try {
          await patchState(planId, src.stateId, newState);
        } catch {
          // Revert on failure
          setLocalStates((prev) => new Map(prev).set(key, prevState));
        }
      }
    },
    [planId, localStates]
  );

  const toggleSource = useCallback(
    (src: ShoppingSource) => {
      const current = effectiveState(src, localStates);
      const next: ShoppingState = current === "BOUGHT" ? "NEED_TO_BUY" : "BOUGHT";
      applyState(src, next);
    },
    [applyState, localStates]
  );

  const toggleHaveIt = useCallback(
    (src: ShoppingSource) => {
      const current = effectiveState(src, localStates);
      const next: ShoppingState = current === "HAVE_IT" ? "NEED_TO_BUY" : "HAVE_IT";
      applyState(src, next);
    },
    [applyState, localStates]
  );

  const toggleGroup = useCallback(
    (item: ShoppingListItem) => {
      const gs = groupState(item, localStates);
      const next: ShoppingState = gs === "bought" ? "NEED_TO_BUY" : "BOUGHT";
      for (const src of item.sources) applyState(src, next);
    },
    [applyState, localStates]
  );

  const markGroupHaveIt = useCallback(
    (item: ShoppingListItem) => {
      const gs = groupState(item, localStates);
      const next: ShoppingState = gs === "have_it" ? "NEED_TO_BUY" : "HAVE_IT";
      for (const src of item.sources) applyState(src, next);
    },
    [applyState, localStates]
  );

  const resetAll = useCallback(async () => {
    setResetting(true);
    try {
      await deleteAllStates(planId);
      setLocalStates((prev) => {
        const next = new Map(prev);
        for (const [k] of next) next.set(k, "PENDING");
        return next;
      });
    } finally {
      setResetting(false);
    }
  }, [planId]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  function itemVisible(item: ShoppingListItem): boolean {
    if (filter === "all") return true;
    const states = item.sources.map((s) => effectiveState(s, localStates));
    if (filter === "remaining") return states.some(isToBuy);
    if (filter === "bought") return states.every((s) => s === "BOUGHT");
    return true;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalItems = list.items.length;
  const remainingItems = list.items.filter((item) =>
    item.sources.some((s) => isToBuy(effectiveState(s, localStates)))
  ).length;
  const boughtItems = list.items.filter((item) =>
    item.sources.every((s) => effectiveState(s, localStates) === "BOUGHT")
  ).length;

  // ── Group by category ────────────────────────────────────────────────────────
  type CategoryKey = (typeof CATEGORY_ORDER)[number];
  const grouped = new Map<CategoryKey, ShoppingListItem[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);

  for (const item of list.items) {
    if (!itemVisible(item)) continue;
    // Items with ingredientId use their ingredient's category; others use null (unresolved)
    const cat = (item.ingredientId ? item.category : null) as CategoryKey;
    const target = grouped.has(cat) ? cat : null;
    grouped.get(target)!.push(item);
  }

  const visibleCategories = CATEGORY_ORDER.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0);

  if (list.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Shopping List</h1>
        <p className="text-sm text-[var(--muted)] italic">
          No meals planned this week — add some recipes to the planner first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Shopping List</h1>
        <button
          onClick={resetAll}
          disabled={resetting}
          className="text-xs text-[var(--muted)] hover:text-red-500 transition-colors disabled:opacity-40"
        >
          {resetting ? "Resetting…" : "Reset all"}
        </button>
      </div>

      {/* Stats + filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--muted)]">
          {remainingItems} of {totalItems} remaining
          {boughtItems > 0 && ` · ${boughtItems} bought`}
        </span>
        <div className="ml-auto flex gap-1">
          {(["remaining", "all", "bought"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)]"
              }`}
            >
              {f === "remaining" ? "Remaining" : f === "bought" ? "Bought" : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Unresolved warning */}
      {list.unresolvedCount > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
          {list.unresolvedCount} ingredient{list.unresolvedCount !== 1 ? "s" : ""} could not be
          matched to a canonical ingredient — duplicates across recipes may appear as separate rows.
        </p>
      )}

      {visibleCategories.length === 0 && (
        <p className="text-sm text-[var(--muted)] italic pt-4 text-center">
          {filter === "remaining" ? "All done! Nothing left to buy." : "Nothing here."}
        </p>
      )}

      {/* Category sections */}
      {visibleCategories.map((cat) => {
        const items = grouped.get(cat)!;
        const label =
          cat === null ? "Unresolved" : CATEGORY_LABELS[cat] ?? cat;

        return (
          <section key={cat ?? "__unresolved"} className="flex flex-col gap-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] pb-1.5 border-b border-[var(--border)]">
              {label}
              {cat === null && (
                <span className="ml-1 font-normal normal-case tracking-normal">
                  — match uncertain
                </span>
              )}
            </h2>

            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {items.map((item) => (
                <ShoppingRow
                  key={`${item.ingredientId ?? "raw"}:${item.ingredientName}`}
                  item={item}
                  localStates={localStates}
                  onToggleGroup={() => toggleGroup(item)}
                  onHaveItGroup={() => markGroupHaveIt(item)}
                  onToggleSource={toggleSource}
                  onHaveItSource={toggleHaveIt}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ─── Shopping row ─────────────────────────────────────────────────────────────

interface RowProps {
  item: ShoppingListItem;
  localStates: Map<SourceKey, ShoppingState>;
  onToggleGroup: () => void;
  onHaveItGroup: () => void;
  onToggleSource: (src: ShoppingSource) => void;
  onHaveItSource: (src: ShoppingSource) => void;
}

function ShoppingRow({
  item,
  localStates,
  onToggleGroup,
  onHaveItGroup,
  onToggleSource,
  onHaveItSource,
}: RowProps) {
  const gs = groupState(item, localStates);
  const dimmed = gs === "bought" || gs === "have_it";
  const hasWarning = item.mergeWarning !== null;

  return (
    <li className="py-2.5">
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleGroup}
          aria-label={gs === "bought" ? "Mark as not bought" : "Mark as bought"}
          className="flex-shrink-0"
        >
          <StateIcon state={gs} mixed={gs === "mixed"} />
        </button>

        {/* Name */}
        <span
          className={`flex-1 min-w-0 text-sm font-medium ${
            dimmed ? "line-through text-[var(--muted)]" : "text-[var(--foreground)]"
          }`}
        >
          {item.ingredientName}
        </span>

        {/* Quantity or warning */}
        <span className="text-sm text-[var(--muted)] text-right flex-shrink-0 tabular-nums">
          {hasWarning ? (
            <span className="text-amber-500 text-xs">⚠ mixed</span>
          ) : (
            fmtQty(item.totalQuantity, item.unit)
          )}
          {item.unitConverted && !hasWarning && (
            <span className="ml-0.5 text-xs opacity-60">~</span>
          )}
        </span>

        {/* Source count badge */}
        {item.sourceCount > 1 && (
          <span className="text-xs text-[var(--muted)] tabular-nums flex-shrink-0">
            ×{item.sourceCount}
          </span>
        )}

        {/* Have-it button */}
        <button
          onClick={onHaveItGroup}
          aria-label={gs === "have_it" ? "I need this" : "I have this at home"}
          title={gs === "have_it" ? "Mark as need to buy" : "I have it at home"}
          className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border transition-colors ${
            gs === "have_it"
              ? "border-[var(--muted)] text-[var(--muted)] bg-[var(--muted)]/10"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]"
          }`}
        >
          {gs === "have_it" ? "✓ have" : "have"}
        </button>
      </div>

      {/* Merge warning + per-source breakdown */}
      {hasWarning && (
        <div className="mt-1.5 ml-8 flex flex-col gap-1">
          <p className="text-xs text-amber-600">{item.mergeWarning}</p>
          {item.sources.map((src) => {
            const ss = effectiveState(src, localStates);
            const srcDimmed = ss === "BOUGHT" || ss === "HAVE_IT";
            const displayQty = src.quantityOverride ?? src.scaledQuantity;
            const displayUnit = src.unitOverride ?? src.unit;
            return (
              <div
                key={sourceKey(src)}
                className="flex items-center gap-2 py-0.5"
              >
                <button
                  onClick={() => onToggleSource(src)}
                  className="flex-shrink-0"
                  aria-label={ss === "BOUGHT" ? "Unmark" : "Mark as bought"}
                >
                  <StateIcon state={ss} />
                </button>
                <span
                  className={`flex-1 min-w-0 text-xs ${
                    srcDimmed ? "line-through text-[var(--muted)]" : "text-[var(--foreground)]"
                  }`}
                >
                  {sourceMeta(src)}
                </span>
                <span className="text-xs text-[var(--muted)] tabular-nums flex-shrink-0">
                  {fmtQty(displayQty, displayUnit)}
                </span>
                <button
                  onClick={() => onHaveItSource(src)}
                  className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded border transition-colors ${
                    ss === "HAVE_IT"
                      ? "border-[var(--muted)] text-[var(--muted)] bg-[var(--muted)]/10"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]"
                  }`}
                >
                  {ss === "HAVE_IT" ? "✓" : "have"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
