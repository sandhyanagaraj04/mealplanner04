import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { TEST_USER_ID } from "@/lib/auth";
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
  const { planId } = await params;

  const plan = await db.mealPlanWeek.findFirst({
    where: { id: planId, userId: TEST_USER_ID },
    include: {
      items: {
        include: {
          recipe: {
            select: { id: true, name: true, servings: true },
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
      where: { userId: TEST_USER_ID, weekStart: new Date(prevWeekStart + "T00:00:00Z") },
      select: { id: true },
    }),
    db.mealPlanWeek.findFirst({
      where: { userId: TEST_USER_ID, weekStart: new Date(nextWeekStart + "T00:00:00Z") },
      select: { id: true },
    }),
  ]);

  const initialItems = plan.items.map((item) => ({
    id: item.id,
    dayOfWeek: item.dayOfWeek,
    mealType: item.mealType as MealType,
    servings: item.servings,
    recipe: {
      id: item.recipe.id,
      name: item.recipe.name,
      servings: item.recipe.servings,
    },
  }));

  return (
    <div className="flex flex-col gap-4 pt-2">
      <Link
        href="/plans"
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors self-start"
      >
        ← All Plans
      </Link>

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
