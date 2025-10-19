export type DoseState = "taken" | "skipped" | "missed" | "due" | "upcoming";

export type ClassifiedDose = { scheduledFor: Date; state: DoseState; note: string | null };

/** How long after its scheduled time a dose still counts as "due" rather than "missed". */
export const GRACE_MINUTES = 60;

/**
 * Combines scheduled instants with what was logged. A logged dose keeps its
 * logged status; otherwise it's upcoming, due within the grace window, or
 * missed after it.
 */
export function classifyDoses(
  due: Date[],
  logs: { scheduledFor: Date; status: "taken" | "skipped"; note: string | null }[],
  now: Date,
  graceMinutes = GRACE_MINUTES,
): ClassifiedDose[] {
  const byTime = new Map(logs.map((log) => [log.scheduledFor.getTime(), log]));
  return due.map((scheduledFor) => {
    const log = byTime.get(scheduledFor.getTime());
    if (log) return { scheduledFor, state: log.status, note: log.note };
    const graceEnd = scheduledFor.getTime() + graceMinutes * 60_000;
    const state: DoseState =
      scheduledFor.getTime() > now.getTime() ? "upcoming" : now.getTime() < graceEnd ? "due" : "missed";
    return { scheduledFor, state, note: null };
  });
}

export type AdherenceSummary = {
  taken: number;
  skipped: number;
  missed: number;
  /** Doses whose outcome is settled: taken + skipped + missed. */
  settled: number;
  /** taken / settled, or null when nothing is settled yet. */
  rate: number | null;
};

export function summarize(doses: ClassifiedDose[]): AdherenceSummary {
  const count = (state: DoseState) => doses.filter((d) => d.state === state).length;
  const taken = count("taken");
  const skipped = count("skipped");
  const missed = count("missed");
  const settled = taken + skipped + missed;
  return { taken, skipped, missed, settled, rate: settled === 0 ? null : Math.round((taken / settled) * 1000) / 1000 };
}

/**
 * Consecutive days, counting back from `today`, on which every dose was
 * taken. Days without doses are ignored; today only counts once it's
 * complete, and doesn't break the streak while doses are still pending.
 */
export function currentStreak(dosesByDay: Map<string, ClassifiedDose[]>, today: string): number {
  let streak = 0;
  const days = [...dosesByDay.keys()]
    .filter((d) => d <= today)
    .sort()
    .reverse();
  for (const day of days) {
    const doses = dosesByDay.get(day) ?? [];
    if (doses.length === 0) continue;
    if (doses.some((d) => d.state === "missed" || d.state === "skipped")) break;
    if (doses.every((d) => d.state === "taken")) streak++;
    else if (day !== today) break;
  }
  return streak;
}
