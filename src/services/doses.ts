import { TZDate } from "@date-fns/tz";
import { addDays, addMinutes, format, startOfDay } from "date-fns";
import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { doseLogs } from "../db/schema.js";
import type { Database } from "../db/types.js";
import { classifyDoses, currentStreak, summarize, type ClassifiedDose } from "../domain/adherence.js";
import { expandSchedule, isScheduledInstant } from "../domain/schedule.js";
import { HttpError } from "../http/errors.js";
import { getMedication, listMedications, type MedicationWithSchedule } from "./medications.js";
import { getUser } from "./users.js";

/** Doses may be logged up to this long before they're due (e.g. taking the evening pill early). */
const EARLY_LOG_MINUTES = 120;

type Window = { from: Date; to: Date };

/** Local calendar dates → [start of first day, start of the day after the last) in the user's timezone. */
export function dayWindow(fromDate: string, toDate: string, timeZone: string): Window {
  const [fy, fm, fd] = fromDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toDate.split("-").map(Number) as [number, number, number];
  return {
    from: new Date(new TZDate(fy, fm - 1, fd, timeZone).getTime()),
    to: new Date(addDays(new TZDate(ty, tm - 1, td, timeZone), 1).getTime()),
  };
}

export const localDate = (at: Date, timeZone: string) => format(new TZDate(at, timeZone), "yyyy-MM-dd");

async function classifyForMedications(
  db: Database,
  meds: MedicationWithSchedule[],
  window: Window,
  timeZone: string,
  now: Date,
) {
  const scheduled = meds.filter((m) => m.schedule);
  const logs =
    scheduled.length === 0
      ? []
      : await db
          .select()
          .from(doseLogs)
          .where(
            and(
              inArray(
                doseLogs.medicationId,
                scheduled.map((m) => m.id),
              ),
              gte(doseLogs.scheduledFor, window.from),
              lt(doseLogs.scheduledFor, window.to),
            ),
          );

  return scheduled.map((medication) => ({
    medication,
    doses: classifyDoses(
      expandSchedule(medication.schedule!, { ...window, timeZone }),
      logs.filter((l) => l.medicationId === medication.id),
      now,
    ),
  }));
}

/** Every dose for one local day, across active medications, in time order. */
export async function dosesForDay(db: Database, userId: string, date: string | undefined, now = new Date()) {
  const { timezone } = await getUser(db, userId);
  const day = date ?? localDate(now, timezone);
  const meds = await listMedications(db, userId, { active: true });
  const perMed = await classifyForMedications(db, meds, dayWindow(day, day, timezone), timezone, now);

  const doses = perMed
    .flatMap(({ medication, doses }) =>
      doses.map((dose) => ({
        medicationId: medication.id,
        medicationName: medication.name,
        dose: medication.dose,
        scheduledFor: dose.scheduledFor,
        localTime: format(new TZDate(dose.scheduledFor, timezone), "HH:mm"),
        state: dose.state,
        note: dose.note,
      })),
    )
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return { date: day, timezone, doses };
}

/** Records (or changes) the outcome of one scheduled dose. */
export async function logDose(
  db: Database,
  userId: string,
  medicationId: string,
  input: { scheduledFor: Date; status: "taken" | "skipped"; note?: string | null },
  now = new Date(),
) {
  const { timezone } = await getUser(db, userId);
  const medication = await getMedication(db, userId, medicationId);
  if (!medication.schedule) throw HttpError.badRequest("This medication has no schedule yet.", "NO_SCHEDULE");
  if (!isScheduledInstant(medication.schedule, input.scheduledFor, timezone)) {
    throw HttpError.badRequest("scheduledFor doesn't match a scheduled dose time.", "NOT_SCHEDULED");
  }
  if (input.scheduledFor > addMinutes(now, EARLY_LOG_MINUTES)) {
    throw HttpError.badRequest("Doses can only be logged up to 2 hours before they're due.", "TOO_EARLY");
  }

  const values = { status: input.status, note: input.note ?? null, loggedAt: now };
  const [log] = await db
    .insert(doseLogs)
    .values({ medicationId, scheduledFor: input.scheduledFor, ...values })
    .onConflictDoUpdate({ target: [doseLogs.medicationId, doseLogs.scheduledFor], set: values })
    .returning();
  return log!;
}

export async function undoDose(db: Database, userId: string, medicationId: string, scheduledFor: Date) {
  await getMedication(db, userId, medicationId);
  const deleted = await db
    .delete(doseLogs)
    .where(and(eq(doseLogs.medicationId, medicationId), eq(doseLogs.scheduledFor, scheduledFor)))
    .returning({ id: doseLogs.id });
  if (deleted.length === 0) throw HttpError.notFound("Dose log");
}

/** Adherence over [from, to] local dates (inclusive), per medication and overall, plus the current streak. */
export async function adherenceReport(
  db: Database,
  userId: string,
  range: { from?: string; to?: string },
  now = new Date(),
) {
  const { timezone } = await getUser(db, userId);
  const today = localDate(now, timezone);
  const to = range.to ?? today;
  const from = range.from ?? localDate(addDays(startOfDay(new TZDate(now, timezone)), -29), timezone);
  if (from > to) throw HttpError.badRequest("from must be on or before to.", "INVALID_DATE_RANGE");

  const meds = await listMedications(db, userId);
  const perMed = await classifyForMedications(db, meds, dayWindow(from, to, timezone), timezone, now);
  const all = perMed.flatMap((m) => m.doses);

  const byDay = new Map<string, ClassifiedDose[]>();
  for (const dose of all) {
    const day = localDate(dose.scheduledFor, timezone);
    byDay.set(day, [...(byDay.get(day) ?? []), dose]);
  }

  return {
    from,
    to,
    timezone,
    overall: summarize(all),
    currentStreakDays: currentStreak(byDay, today),
    medications: perMed.map(({ medication, doses }) => ({
      medicationId: medication.id,
      name: medication.name,
      ...summarize(doses),
    })),
  };
}
