"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import type { IngredientDraftLine, StepDraftLine, ParseWarning } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  ingestionId: string;
  initialTitle: string | null;
  initialServings: number | null;
  initialIngredients: IngredientDraftLine[];
  initialSteps: StepDraftLine[];
  initialConfidence: number;
  warnings: ParseWarning[];
  rawIngredients: string;
  rawInstructions: string;
  sourceUrl: string | null;
}

// Editable ingredient — numeric fields as strings so inputs stay controlled
interface EditIngredient {
  _key: string;
  rawText: string;
  displayName: string;
  normalizedName: string;
  quantity: string;
  quantityMax: string;
  unit: string;
  preparationNote: string;
  isOptional: boolean;
  ingredientId: string | null;
  confidence: number;
}

interface EditStep {
  _key: string;
  stepNumber: number;
  instruction: string;
  durationMins: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REVIEW_THRESHOLD = 0.75;
let _keyCounter = 0;
function newKey() { return String(++_keyCounter); }

function toEditIngredient(line: IngredientDraftLine): EditIngredient {
  return {
    _key: newKey(),
    rawText: line.rawText,
    displayName: line.displayName ?? "",
    normalizedName: line.normalizedName ?? "",
    quantity: line.quantity != null ? String(line.quantity) : "",
    quantityMax: line.quantityMax != null ? String(line.quantityMax) : "",
    unit: line.unit ?? "",
    preparationNote: line.preparationNote ?? "",
    isOptional: line.isOptional,
    ingredientId: line.ingredientId,
    confidence: line.confidence,
  };
}

function toEditStep(step: StepDraftLine): EditStep {
  return {
    _key: newKey(),
    stepNumber: step.stepNumber,
    instruction: step.instruction,
    durationMins: step.durationMins != null ? String(step.durationMins) : "",
  };
}

function fromEditIngredient(e: EditIngredient): IngredientDraftLine {
  const qty = parseFloat(e.quantity);
  const qtyMax = parseFloat(e.quantityMax);
  return {
    rawText: e.rawText || e.displayName,
    displayName: e.displayName || null,
    normalizedName: e.normalizedName || null,
    quantity: isNaN(qty) ? null : qty,
    quantityMax: isNaN(qtyMax) ? null : qtyMax,
    unit: e.unit || null,
    preparationNote: e.preparationNote || null,
    isOptional: e.isOptional,
    ingredientId: e.ingredientId,
    confidence: e.confidence,
  };
}

function fromEditStep(e: EditStep, idx: number): StepDraftLine {
  const dur = parseInt(e.durationMins);
  return {
    stepNumber: idx + 1,
    instruction: e.instruction,
    durationMins: isNaN(dur) ? null : dur,
  };
}

function confidenceMeta(c: number): { label: string; color: string; bg: string; border: string } {
  if (c >= REVIEW_THRESHOLD) return { label: "Good", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" };
  if (c >= 0.5) return { label: "Fair", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "Low", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">{children}</span>;
}

function InlineInput({
  value, onChange, placeholder, className = "", type = "text", disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`rounded border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 disabled:bg-[var(--background)] ${className}`}
    />
  );
}

function IconBtn({
  onClick, title, children, danger,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex-shrink-0 rounded p-1 text-sm transition-colors ${
        danger
          ? "text-[var(--muted)] hover:text-red-600 hover:bg-red-50"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewEditor({
  ingestionId,
  initialTitle,
  initialServings,
  initialIngredients,
  initialSteps,
  initialConfidence,
  warnings: initialWarnings,
  rawIngredients,
  rawInstructions,
  sourceUrl,
}: Props) {
  const router = useRouter();
  const uid = useId();

  // ── Editable state ───────────────────────────────────────────────────────
  const [title, setTitle] = useState(initialTitle ?? "");
  const [servings, setServings] = useState(initialServings != null ? String(initialServings) : "");
  const [ingredients, setIngredients] = useState<EditIngredient[]>(() =>
    initialIngredients.map(toEditIngredient)
  );
  const [steps, setSteps] = useState<EditStep[]>(() => initialSteps.map(toEditStep));
  const [confidence, setConfidence] = useState(initialConfidence);
  const [warnings, setWarnings] = useState(initialWarnings);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [rawOpen, setRawOpen] = useState(initialConfidence < REVIEW_THRESHOLD);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const meta = confidenceMeta(confidence);
  const needsReview = confidence < REVIEW_THRESHOLD;

  // ── Ingredient helpers ───────────────────────────────────────────────────
  function updateIngredient(key: string, patch: Partial<EditIngredient>) {
    setIngredients((prev) => prev.map((ing) => ing._key === key ? { ...ing, ...patch } : ing));
  }

  function removeIngredient(key: string) {
    setIngredients((prev) => prev.filter((ing) => ing._key !== key));
  }

  function addIngredient() {
    setIngredients((prev) => [
      ...prev,
      {
        _key: newKey(),
        rawText: "",
        displayName: "",
        normalizedName: "",
        quantity: "",
        quantityMax: "",
        unit: "",
        preparationNote: "",
        isOptional: false,
        ingredientId: null,
        confidence: 0,
      },
    ]);
  }

  // ── Step helpers ─────────────────────────────────────────────────────────
  function updateStep(key: string, patch: Partial<EditStep>) {
    setSteps((prev) => prev.map((s) => s._key === key ? { ...s, ...patch } : s));
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s._key !== key));
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { _key: newKey(), stepNumber: prev.length + 1, instruction: "", durationMins: "" },
    ]);
  }

  function moveStep(key: string, dir: -1 | 1) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function patchDraft() {
    const servingsNum = parseInt(servings);
    const body = {
      title: title.trim() || null,
      servings: isNaN(servingsNum) ? null : servingsNum,
      ingredients: ingredients.map(fromEditIngredient),
      steps: steps.map(fromEditStep),
    };

    const res = await fetch(`/api/ingest/${ingestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
    return data.data;
  }

  async function handleConfirm() {
    setSaving(true);
    setActionError(null);
    try {
      await patchDraft();

      const res = await fetch(`/api/ingest/${ingestionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Confirm failed");

      router.push(`/recipes/${data.data.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unexpected error");
      setSaving(false);
    }
  }

  async function handleReparse() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/ingest/${ingestionId}/reparse`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Reparse failed");

      const d = data.data;
      setTitle(d.title ?? "");
      setServings(d.servings != null ? String(d.servings) : "");
      setIngredients((d.ingredients as IngredientDraftLine[]).map(toEditIngredient));
      setSteps((d.steps as StepDraftLine[]).map(toEditStep));
      setConfidence(d.confidence);
      setWarnings(d.warnings);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    if (!confirm("Discard this import? This cannot be undone.")) return;
    setSaving(true);
    try {
      await fetch(`/api/ingest/${ingestionId}`, { method: "DELETE" });
      router.push("/ingest");
    } catch {
      setActionError("Discard failed. Try again.");
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Review Import</h1>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--muted)] underline underline-offset-2 hover:text-[var(--accent)] break-all"
            >
              {sourceUrl}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={saving}
          className="flex-shrink-0 text-sm text-[var(--muted)] hover:text-red-600 transition-colors disabled:opacity-40"
        >
          Discard
        </button>
      </div>

      {/* Confidence banner */}
      <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${meta.bg} ${meta.border}`}>
        <span className={`text-2xl font-bold ${meta.color}`}>
          {Math.round(confidence * 100)}%
        </span>
        <div>
          <p className={`text-sm font-semibold ${meta.color}`}>
            {needsReview ? "Review required — confidence is low" : `Parse confidence: ${meta.label}`}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {needsReview
              ? "Check highlighted fields below before confirming."
              : "Looks good. Edit anything that needs correcting."}
          </p>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Warnings</FieldLabel>
          <ul className="flex flex-col gap-1">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span className="flex-shrink-0">⚠</span>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Original raw text — collapsible */}
      <div className="rounded-lg border border-[var(--border)]">
        <button
          type="button"
          onClick={() => setRawOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-[var(--background)] transition-colors rounded-lg"
        >
          <span>Original raw text</span>
          <span className="text-[var(--muted)]">{rawOpen ? "▲" : "▼"}</span>
        </button>
        {rawOpen && (
          <div className="border-t border-[var(--border)] px-4 py-3 flex flex-col gap-4">
            {rawIngredients && (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Ingredients</p>
                <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--foreground)] bg-[var(--background)] rounded p-2 overflow-x-auto">{rawIngredients}</pre>
              </div>
            )}
            {rawInstructions && (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Instructions</p>
                <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--foreground)] bg-[var(--background)] rounded p-2 overflow-x-auto">{rawInstructions}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-title`} className="text-sm font-semibold">Title</label>
        <input
          id={`${uid}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Recipe title"
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] ${
            !title.trim() ? "border-amber-400" : "border-[var(--border)]"
          }`}
          disabled={saving}
        />
        {!title.trim() && (
          <p className="text-xs text-amber-700">Title is required before confirming.</p>
        )}
      </div>

      {/* Servings */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-servings`} className="text-sm font-semibold">Servings</label>
        <input
          id={`${uid}-servings`}
          type="number"
          min="1"
          max="500"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder="e.g. 4"
          className="w-24 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
          disabled={saving}
        />
      </div>

      {/* Ingredients */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            Ingredients
            <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">({ingredients.length})</span>
          </span>
          <button
            type="button"
            onClick={addIngredient}
            disabled={saving}
            className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium disabled:opacity-40"
          >
            + Add
          </button>
        </div>

        {ingredients.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic">No ingredients. Use + Add to add one.</p>
        )}

        <div className="flex flex-col gap-2">
          {ingredients.map((ing) => (
            <div
              key={ing._key}
              className={`rounded-lg border bg-white p-3 flex flex-col gap-2 ${
                ing.displayName === "" && ing.quantity === "" ? "border-amber-300" : "border-[var(--border)]"
              }`}
            >
              {/* Row 1: qty / unit / name / delete */}
              <div className="flex gap-2 items-center">
                <InlineInput
                  value={ing.quantity}
                  onChange={(v) => updateIngredient(ing._key, { quantity: v })}
                  placeholder="Qty"
                  className="w-14 text-center"
                  disabled={saving}
                />
                <InlineInput
                  value={ing.unit}
                  onChange={(v) => updateIngredient(ing._key, { unit: v })}
                  placeholder="Unit"
                  className="w-20"
                  disabled={saving}
                />
                <InlineInput
                  value={ing.displayName}
                  onChange={(v) => updateIngredient(ing._key, { displayName: v })}
                  placeholder="Ingredient name"
                  className="flex-1 min-w-0"
                  disabled={saving}
                />
                <IconBtn onClick={() => removeIngredient(ing._key)} title="Remove" danger>
                  ✕
                </IconBtn>
              </div>

              {/* Row 2: prep note / optional */}
              <div className="flex gap-2 items-center">
                <InlineInput
                  value={ing.preparationNote}
                  onChange={(v) => updateIngredient(ing._key, { preparationNote: v })}
                  placeholder="Prep note (e.g. finely chopped)"
                  className="flex-1 min-w-0 text-[var(--muted)]"
                  disabled={saving}
                />
                <label className="flex items-center gap-1.5 text-xs text-[var(--muted)] cursor-pointer select-none flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={ing.isOptional}
                    onChange={(e) => updateIngredient(ing._key, { isOptional: e.target.checked })}
                    disabled={saving}
                    className="accent-[var(--accent)]"
                  />
                  Optional
                </label>
              </div>

              {/* Row 3: raw text (read-only reference) */}
              {ing.rawText && (
                <p className="text-xs text-[var(--muted)] font-mono bg-[var(--background)] rounded px-2 py-1 break-all">
                  raw: {ing.rawText}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            Steps
            <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">({steps.length})</span>
          </span>
          <button
            type="button"
            onClick={addStep}
            disabled={saving}
            className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium disabled:opacity-40"
          >
            + Add
          </button>
        </div>

        {steps.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic">No steps. Use + Add to add one.</p>
        )}

        <div className="flex flex-col gap-2">
          {steps.map((step, idx) => (
            <div key={step._key} className="rounded-lg border border-[var(--border)] bg-white p-3 flex gap-3">
              {/* Step number + reorder */}
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => moveStep(step._key, -1)}
                  disabled={saving || idx === 0}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-20 text-xs leading-none"
                  title="Move up"
                >▲</button>
                <span className="text-sm font-semibold text-[var(--muted)] w-5 text-center">{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => moveStep(step._key, 1)}
                  disabled={saving || idx === steps.length - 1}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-20 text-xs leading-none"
                  title="Move down"
                >▼</button>
              </div>

              {/* Instruction */}
              <textarea
                value={step.instruction}
                onChange={(e) => updateStep(step._key, { instruction: e.target.value })}
                placeholder="Step instruction…"
                rows={3}
                disabled={saving}
                className="flex-1 min-w-0 rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 resize-y"
              />

              <IconBtn onClick={() => removeStep(step._key)} title="Remove step" danger>
                ✕
              </IconBtn>
            </div>
          ))}
        </div>
      </div>

      {/* Error message */}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={handleReparse}
          disabled={saving}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
        >
          ↺ Reparse
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving || !title.trim()}
          className="rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Confirm Recipe →"}
        </button>
      </div>
    </div>
  );
}
