import { z } from "zod";

export const IngestUrlSchema = z.object({
  type: z.literal("url"),
  url: z.string().url("Must be a valid URL"),
});

export const IngestTextSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(10, "Text must be at least 10 characters"),
});

export const IngestSchema = z.discriminatedUnion("type", [IngestUrlSchema, IngestTextSchema]);

// When confirming, the user can override the title and servings before the
// Recipe is created (in case the parser got them wrong).
export const ConfirmIngestionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  servings: z.number().int().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
});

export type IngestInput = z.infer<typeof IngestSchema>;
export type ConfirmIngestionInput = z.infer<typeof ConfirmIngestionSchema>;

// ─── Patch draft ──────────────────────────────────────────────────────────────
// Allows the review UI to persist user edits to the draft before confirming.

const IngredientPatchSchema = z.object({
  rawText: z.string(),
  displayName: z.string().nullable(),
  normalizedName: z.string().nullable(),
  quantity: z.number().nullable(),
  quantityMax: z.number().nullable(),
  unit: z.string().nullable(),
  preparationNote: z.string().nullable(),
  isOptional: z.boolean(),
  ingredientId: z.string().nullable(),
  confidence: z.number(),
});

const StepPatchSchema = z.object({
  stepNumber: z.number().int().min(1),
  instruction: z.string().min(1),
  durationMins: z.number().int().min(0).nullable(),
});

export const PatchDraftSchema = z.object({
  title: z.string().min(1).max(200).nullable().optional(),
  servings: z.number().int().min(1).max(500).nullable().optional(),
  ingredients: z.array(IngredientPatchSchema).optional(),
  steps: z.array(StepPatchSchema).optional(),
});

export type PatchDraftInput = z.infer<typeof PatchDraftSchema>;
