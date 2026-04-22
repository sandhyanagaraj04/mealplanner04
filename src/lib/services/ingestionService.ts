import { db } from "@/lib/db";
import { parseRecipeInput } from "@/lib/parsers/recipeParser";
import { findIngredientByName } from "@/lib/services/ingredientService";
import type { IngestInput, ConfirmIngestionInput, PatchDraftInput } from "@/lib/validations/ingest";
import type { RecipeIngestionDraft } from "@/types";
import { computeConfidence } from "@/lib/parsers/confidenceScorer";
import { track, LOW_CONFIDENCE_THRESHOLD } from "@/lib/analytics/track";

// ─── Ingest ───────────────────────────────────────────────────────────────────

export async function ingest(userId: string, input: IngestInput) {
  const result = await parseRecipeInput(
    input.type === "url"
      ? { sourceType: "url", url: input.url }
      : { sourceType: "text", text: input.text }
  );

  const ingestion = await db.recipeIngestion.create({
    data: {
      userId,
      sourceType: input.type,
      sourceUrl: input.type === "url" ? input.url : null,
      rawContent: result.rawContent,
      rawIngredients: result.rawIngredients,
      rawInstructions: result.rawInstructions,
      parsedDraft: result.draft as object,
      confidence: result.draft.confidence,
      status: "draft",
    },
  });

  track("recipe_import_completed", {
    userId,
    ingestionId: ingestion.id,
    confidence: result.draft.confidence,
    ingredientCount: result.draft.ingredients.length,
    stepCount: result.draft.steps.length,
    warningCount: result.draft.warnings.length,
    sourceType: input.type,
  });

  if (result.draft.confidence < LOW_CONFIDENCE_THRESHOLD) {
    track("parse_low_confidence", {
      ingestionId: ingestion.id,
      confidence: result.draft.confidence,
      warningCodes: result.draft.warnings.map((w) => w.code),
    });
  }

  return { ingestion, draft: result.draft };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getIngestion(id: string, userId: string) {
  return db.recipeIngestion.findFirst({ where: { id, userId } });
}

export async function listIngestions(
  userId: string,
  opts: { status?: string; limit: number; offset: number }
) {
  const where = {
    userId,
    ...(opts.status ? { status: opts.status } : {}),
  };

  const [items, total] = await db.$transaction([
    db.recipeIngestion.findMany({
      where,
      select: {
        id: true,
        sourceType: true,
        sourceUrl: true,
        confidence: true,
        status: true,
        createdAt: true,
        recipeId: true,
        // Return title from parsedDraft without loading the full JSON
        parsedDraft: true,
      },
      skip: opts.offset,
      take: opts.limit,
      orderBy: { createdAt: "desc" },
    }),
    db.recipeIngestion.count({ where }),
  ]);

  return { items, total };
}

// ─── Confirm → creates Recipe ─────────────────────────────────────────────────
// Takes the stored parsedDraft and materialises it as a Recipe record.
// Any overrides (name, servings) from the confirm payload take precedence.

export async function confirmIngestion(
  id: string,
  userId: string,
  overrides: ConfirmIngestionInput = {}
) {
  const ingestion = await db.recipeIngestion.findFirst({ where: { id, userId } });
  if (!ingestion) return { error: "not_found" as const };
  if (ingestion.status !== "draft") return { error: "not_draft" as const };

  const draft = ingestion.parsedDraft as unknown as RecipeIngestionDraft;
  const name = overrides.name ?? draft.title ?? "Untitled Recipe";
  const servings = overrides.servings ?? draft.servings ?? 2;

  return db.$transaction(async (tx) => {
    // Create Recipe
    const recipe = await tx.recipe.create({
      data: {
        userId,
        name,
        description: overrides.description ?? null,
        servings,
        source: ingestion.sourceUrl ?? null,
        rawIngredients: ingestion.rawIngredients,
        rawInstructions: ingestion.rawInstructions,
      },
    });

    // Create RecipeIngredient rows from draft
    if (draft.ingredients.length > 0) {
      await tx.recipeIngredient.createMany({
        data: draft.ingredients.map((line, idx) => ({
          recipeId: recipe.id,
          sortOrder: idx,
          rawText: line.rawText,
          displayName: line.displayName,
          normalizedName: line.normalizedName,
          quantity: line.quantity,
          quantityMax: line.quantityMax,
          unit: line.unit,
          ingredientId: line.ingredientId,
          preparationNote: line.preparationNote,
          isOptional: line.isOptional,
        })),
      });
    }

    // Create RecipeStep rows
    if (draft.steps.length > 0) {
      await tx.recipeStep.createMany({
        data: draft.steps.map((step) => ({
          recipeId: recipe.id,
          stepNumber: step.stepNumber,
          instruction: step.instruction,
          durationMins: step.durationMins,
        })),
      });
    }

    // Mark ingestion as confirmed and link it
    await tx.recipeIngestion.update({
      where: { id },
      data: { status: "confirmed", recipeId: recipe.id },
    });

    const saved = await tx.recipe.findUniqueOrThrow({
      where: { id: recipe.id },
      include: {
        ingredients: {
          include: { ingredient: true },
          orderBy: { sortOrder: "asc" },
        },
        steps: { orderBy: { stepNumber: "asc" } },
      },
    });

    track("recipe_saved", {
      userId,
      recipeId: recipe.id,
      ingestionId: id,
      ingredientCount: saved.ingredients.length,
      stepCount: saved.steps.length,
      servings: saved.servings,
    });

    return { recipe: saved };
  });
}

// ─── Patch draft ─────────────────────────────────────────────────────────────
// Merges user edits into the stored parsedDraft JSON without touching rawContent.
// Confidence is recomputed from the updated fields.

export async function patchIngestionDraft(
  id: string,
  userId: string,
  patch: PatchDraftInput
) {
  const ingestion = await db.recipeIngestion.findFirst({ where: { id, userId } });
  if (!ingestion) return { error: "not_found" as const };
  if (ingestion.status !== "draft") return { error: "not_draft" as const };

  const current = ingestion.parsedDraft as unknown as RecipeIngestionDraft;

  const updated: RecipeIngestionDraft = {
    ...current,
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.servings !== undefined && { servings: patch.servings }),
    ...(patch.ingredients !== undefined && { ingredients: patch.ingredients }),
    ...(patch.steps !== undefined && { steps: patch.steps }),
    warnings: current.warnings,
  };

  updated.confidence = computeConfidence(updated);

  const result = await db.recipeIngestion.update({
    where: { id },
    data: { parsedDraft: updated as object, confidence: updated.confidence },
  });

  return { ingestion: result, draft: updated };
}

// ─── Discard ──────────────────────────────────────────────────────────────────

export async function discardIngestion(id: string, userId: string): Promise<boolean> {
  const ingestion = await db.recipeIngestion.findFirst({ where: { id, userId } });
  if (!ingestion) return false;

  await db.recipeIngestion.update({ where: { id }, data: { status: "discarded" } });
  return true;
}

// ─── Re-parse ─────────────────────────────────────────────────────────────────
// Keeps rawContent unchanged; runs the parser again against the stored raw text.
// Useful when the parser is improved or the user edited the raw text sections.

export async function reparseIngestion(id: string, userId: string) {
  const ingestion = await db.recipeIngestion.findFirst({ where: { id, userId } });
  if (!ingestion) return { error: "not_found" as const };
  if (ingestion.status !== "draft") return { error: "not_draft" as const };

  const result = await parseRecipeInput({
    sourceType: ingestion.sourceType as "url" | "text",
    text: ingestion.rawIngredients + "\n\n" + ingestion.rawInstructions,
  });

  const updated = await db.recipeIngestion.update({
    where: { id },
    data: {
      parsedDraft: result.draft as object,
      confidence: result.draft.confidence,
      rawIngredients: result.rawIngredients || ingestion.rawIngredients,
      rawInstructions: result.rawInstructions || ingestion.rawInstructions,
    },
  });

  return { ingestion: updated, draft: result.draft };
}
