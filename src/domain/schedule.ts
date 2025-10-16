import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfDay } from "date-fns";

export type ScheduleRule = {
  /** Local times "HH:MM". */
  times: string[];
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  /** Inclusive local dates "YYYY-MM-DD". */
  startDate: string;
  endDate: string | null;
};

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Expands a schedule into the concrete instants a dose is due within
 * [from, to), interpreting times in the patient's timezone so "08:00" stays
 * 08:00 local across daylight-saving changes.
 */
export function expandSchedule(rule: ScheduleRule, { from, to, timeZone }: { from: Date; to: Date; timeZone: string }) {
  const due: Date[] = [];
  const days = new Set(rule.daysOfWeek);
  const times = [...new Set(rule.times)].sort();

  for (let day = startOfDay(new TZDate(from, timeZone)); day < to; day = addDays(day, 1)) {
    const date = format(day, "yyyy-MM-dd");
    if (date < rule.startDate || (rule.endDate && date > rule.endDate) || !days.has(day.getDay())) continue;

    for (const time of times) {
      const [hours, minutes] = time.split(":").map(Number);
      const instant = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, timeZone);
      const at = new Date(instant.getTime());
      if (at >= from && at < to) due.push(at);
    }
  }
  return due;
}

/** True when `at` is exactly one of the schedule's due instants. */
export function isScheduledInstant(rule: ScheduleRule, at: Date, timeZone: string): boolean {
  const local = new TZDate(at, timeZone);
  const window = { from: startOfDay(local), to: addDays(startOfDay(local), 1), timeZone };
  return expandSchedule(rule, window).some((d) => d.getTime() === at.getTime());
}
