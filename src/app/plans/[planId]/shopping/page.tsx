import { notFound } from "next/navigation";
import Link from "next/link";
import { TEST_USER_ID } from "@/lib/auth";
import { initializeShoppingStates, getShoppingList } from "@/lib/services/shoppingService";
import ShoppingListView from "@/components/features/shopping/ShoppingListView";

type Params = { params: Promise<{ planId: string }> };

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ShoppingPage({ params }: Params) {
  const { planId } = await params;

  // Ensure every (item × ingredient) pair has a state row — idempotent.
  await initializeShoppingStates(planId, TEST_USER_ID);

  const list = await getShoppingList(planId, TEST_USER_ID);
  if (!list) notFound();

  return (
    <div className="flex flex-col gap-4 pt-2 pb-12">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/plans/${planId}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          ← Week Planner
        </Link>
        <span className="text-xs text-[var(--muted)]">
          Week of {formatWeekLabel(list.weekStart)}
        </span>
      </div>

      <ShoppingListView planId={planId} list={list} />
    </div>
  );
}
