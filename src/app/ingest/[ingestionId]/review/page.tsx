import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { TEST_USER_ID } from "@/lib/auth";
import type { RecipeIngestionDraft } from "@/types";
import ReviewEditor from "@/components/features/review/ReviewEditor";

// Confidence below this value forces the review banner to "review required" state.
export const REVIEW_THRESHOLD = 0.75;

type Params = { params: Promise<{ ingestionId: string }> };

export default async function ReviewPage({ params }: Params) {
  const { ingestionId } = await params;

  const ingestion = await db.recipeIngestion.findFirst({
    where: { id: ingestionId, userId: TEST_USER_ID },
  });

  if (!ingestion) notFound();

  // Already confirmed → go to the recipe
  if (ingestion.status === "confirmed" && ingestion.recipeId) {
    redirect(`/recipes/${ingestion.recipeId}`);
  }

  // Discarded → back to import
  if (ingestion.status === "discarded") {
    redirect("/ingest");
  }

  const draft = ingestion.parsedDraft as unknown as RecipeIngestionDraft;

  return (
    <ReviewEditor
      ingestionId={ingestion.id}
      initialTitle={draft.title}
      initialServings={draft.servings}
      initialIngredients={draft.ingredients}
      initialSteps={draft.steps}
      initialConfidence={ingestion.confidence}
      warnings={draft.warnings}
      rawIngredients={ingestion.rawIngredients}
      rawInstructions={ingestion.rawInstructions}
      sourceUrl={ingestion.sourceUrl ?? null}
    />
  );
}
