import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import WeekPlanner from "@/components/features/planner/WeekPlanner";
import type { MealType } from "@/types";

type Params = { params: Promise<{ planId: string }> };

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUTCDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export default async function PlannerPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { planId } = await params;

  const plan = await db.mealPlanWeek.findFirst({
    where: { id: planId, userId },
    include: {
      items: {
        include: {
          recipe: {
            select: { id: true, name: true, servings: true },
          },
          shoppingItems: {
            select: { id: true, itemName: true, quantity: true, unit: true, note: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: [{ dayOfWeek: "asc" }, { mealType: "asc" }],
      },
    },
  });

  if (!plan) notFound();

  const weekStart = toIsoDate(new Date(plan.weekStart));
  const prevWeekStart = addUTCDays(weekStart, -7);
  const nextWeekStart = addUTCDays(weekStart, 7);

  const [prevPlan, nextPlan] = await Promise.all([
    db.mealPlanWeek.findFirst({
      where: { userId, weekStart: new Date(prevWeekStart + "T00:00:00Z") },
      select: { id: true },
    }),
    db.mealPlanWeek.findFirst({
      where: { userId, weekStart: new Date(nextWeekStart + "T00:00:00Z") },
      select: { id: true },
    }),
  ]);

  const initialItems = plan.items.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name ?? null,
    dayOfWeek: item.dayOfWeek,
    mealType: item.mealType as MealType,
    servings: item.servings,
    customNote: item.customNote ?? null,
    recipe: item.recipe
      ? { id: item.recipe.id, name: item.recipe.name, servings: item.recipe.servings }
      : null,
    shoppingItems: item.shoppingItems.map((si) => ({
      id: si.id,
      itemName: si.itemName,
      quantity: si.quantity,
      unit: si.unit,
      note: si.note,
    })),
  }));

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/plans"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          ← All Plans
        </Link>
        <Link
          href={`/plans/${plan.id}/shopping`}
          className="text-sm rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          Shopping List →
        </Link>
      </div>

      <WeekPlanner
        planId={plan.id}
        weekStart={weekStart}
        initialItems={initialItems}
        prevPlanId={prevPlan?.id ?? null}
        nextPlanId={nextPlan?.id ?? null}
      />
    </div>
  );
}
