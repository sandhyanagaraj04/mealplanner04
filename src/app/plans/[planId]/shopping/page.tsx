import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
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
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { planId } = await params;

  await initializeShoppingStates(planId, userId);
  const list = await getShoppingList(planId, userId);
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
