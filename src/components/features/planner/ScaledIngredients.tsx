"use client";

import { useState, useEffect } from "react";
import {
  computeScaleFactor,
  scaleIngredient,
  formatQuantity,
  formatScaledIngredientLine,
} from "@/lib/parsers/ingredientScaler";

type ApiIngredient = {
  id: string;
  rawText: string;
  displayName: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  preparationNote: string | null;
  isOptional: boolean;
};

interface Props {
  recipeId: string;
  /** Recipe's canonical serving count — the denominator for scaling. */
  recipeDefaultServings: number;
  /** How many people this meal plan slot is for — the numerator. */
  planServings: number;
}

export default function ScaledIngredients({
  recipeId,
  recipeDefaultServings,
  planServings,
}: Props) {
  const [ingredients, setIngredients] = useState<ApiIngredient[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setIngredients(data.data.ingredients);
        else setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [recipeId]);

  const factor = computeScaleFactor(recipeDefaultServings, planServings);
  const isScaled = Math.abs(factor - 1) > 0.001;

  if (error) {
    return <p className="text-xs text-red-500 mt-2">Could not load ingredients.</p>;
  }

  if (ingredients === null) {
    return (
      <div className="mt-2 pt-2 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)] animate-pulse">Loading…</p>
      </div>
    );
  }

  if (ingredients.length === 0) {
    return (
      <div className="mt-2 pt-2 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)] italic">No ingredients on record.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-col gap-0.5">
      {/* Scale factor badge */}
      {isScaled && (
        <p className="text-xs text-[var(--muted)] mb-1">
          Scaled ×{factor % 1 === 0 ? factor : factor.toFixed(2)}
          <span className="ml-1 text-[var(--border)]">
            ({recipeDefaultServings} → {planServings} servings)
          </span>
        </p>
      )}

      {ingredients.map((ing) => {
        const scaled = scaleIngredient(ing, factor);
        const qtyStr = formatQuantity(scaled.scaledQuantity, scaled.scaledQuantityMax);
        const name = ing.displayName ?? ing.rawText;
        const hasQtyOrUnit = qtyStr || ing.unit;

        return (
          <div key={ing.id} className="flex gap-2 text-xs">
            {/* Quantity + unit column — fixed width so names align */}
            <span className="w-20 flex-shrink-0 text-right font-mono text-[var(--muted)]">
              {hasQtyOrUnit
                ? [qtyStr, ing.unit].filter(Boolean).join(" ")
                : ""}
            </span>

            {/* Name + prep note */}
            <span className={ing.isOptional ? "text-[var(--muted)]" : "text-[var(--foreground)]"}>
              {name}
              {ing.preparationNote && (
                <span className="text-[var(--muted)]">, {ing.preparationNote}</span>
              )}
              {ing.isOptional && (
                <span className="ml-1 text-[var(--muted)] italic">(opt)</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
