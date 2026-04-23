import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import NewPlanButton from "@/components/features/planner/NewPlanButton";

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const year = end.getUTCFullYear();
  return `${fmt(weekStart)} – ${fmt(end)}, ${year}`;
}

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const plans = await db.mealPlanWeek.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      weekStart: true,
      _count: { select: { items: true } },
    },
    orderBy: { weekStart: "desc" },
    take: 52,
  });

  const existingWeeks = plans.map((p) =>
    new Date(p.weekStart).toISOString().slice(0, 10)
  );

  // Detect current week plan
  const nowMonday = (() => {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  })();
  const currentPlan = plans.find(
    (p) => new Date(p.weekStart).toISOString().slice(0, 10) === nowMonday
  );

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Meal Plans</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {plans.length} week{plans.length !== 1 ? "s" : ""}
          </p>
        </div>
        <NewPlanButton existingWeeks={existingWeeks} />
      </div>

      {currentPlan && (
        <Link
          href={`/plans/${currentPlan.id}`}
          className="flex items-center justify-between rounded-xl border-2 border-[var(--accent)] bg-white p-4 hover:bg-green-50 transition-colors"
        >
          <div>
            <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide">This Week</p>
            <p className="font-semibold mt-0.5">{formatWeekRange(new Date(currentPlan.weekStart))}</p>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              {currentPlan._count.items} meal{currentPlan._count.items !== 1 ? "s" : ""} planned
            </p>
          </div>
          <span className="text-[var(--accent)] text-lg">→</span>
        </Link>
      )}

      {plans.length === 0 ? (
        <p className="text-center text-[var(--muted)] py-12">
          No plans yet. Click <strong>+ New Week</strong> to start.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans
            .filter((p) => p.id !== currentPlan?.id)
            .map((plan) => (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 py-3 hover:border-[var(--accent)] transition-colors group"
              >
                <div>
                  <p className="font-medium group-hover:text-[var(--accent)] transition-colors">
                    {formatWeekRange(new Date(plan.weekStart))}
                  </p>
                  <p className="text-sm text-[var(--muted)] mt-0.5">
                    {plan._count.items} meal{plan._count.items !== 1 ? "s" : ""} planned
                  </p>
                </div>
                <span className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">→</span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
