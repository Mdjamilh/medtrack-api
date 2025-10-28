import { and, asc, eq } from "drizzle-orm";

import { medications, schedules, type Medication, type Schedule } from "../db/schema.js";
import type { Database } from "../db/types.js";
import { HttpError } from "../http/errors.js";

export type MedicationWithSchedule = Medication & { schedule: Omit<Schedule, "medicationId"> | null };

export async function listMedications(
  db: Database,
  userId: string,
  { active }: { active?: boolean } = {},
): Promise<MedicationWithSchedule[]> {
  const rows = await db
    .select({ medication: medications, schedule: schedules })
    .from(medications)
    .leftJoin(schedules, eq(schedules.medicationId, medications.id))
    .where(and(eq(medications.userId, userId), active === undefined ? undefined : eq(medications.active, active)))
    .orderBy(asc(medications.name));
  return rows.map(({ medication, schedule }) => ({ ...medication, schedule: schedule && stripId(schedule) }));
}

const stripId = ({ medicationId: _id, ...rest }: Schedule) => rest;

/** Scoped by owner: another user's medication is reported as not found. */
export async function getMedication(db: Database, userId: string, id: string): Promise<MedicationWithSchedule> {
  const [row] = await db
    .select({ medication: medications, schedule: schedules })
    .from(medications)
    .leftJoin(schedules, eq(schedules.medicationId, medications.id))
    .where(and(eq(medications.id, id), eq(medications.userId, userId)));
  if (!row) throw HttpError.notFound("Medication");
  return { ...row.medication, schedule: row.schedule && stripId(row.schedule) };
}

export async function createMedication(
  db: Database,
  userId: string,
  input: { name: string; dose: string; instructions?: string | null },
): Promise<MedicationWithSchedule> {
  const [medication] = await db
    .insert(medications)
    .values({ ...input, userId })
    .returning();
  return { ...medication!, schedule: null };
}

export async function updateMedication(
  db: Database,
  userId: string,
  id: string,
  patch: { name?: string; dose?: string; instructions?: string | null; active?: boolean },
): Promise<MedicationWithSchedule> {
  const [updated] = await db
    .update(medications)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))
    .returning({ id: medications.id });
  if (!updated) throw HttpError.notFound("Medication");
  return getMedication(db, userId, id);
}

export async function deleteMedication(db: Database, userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(medications)
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))
    .returning({ id: medications.id });
  if (deleted.length === 0) throw HttpError.notFound("Medication");
}

/** Creates or replaces the medication's schedule. */
export async function setSchedule(
  db: Database,
  userId: string,
  id: string,
  input: { times: string[]; daysOfWeek: number[]; startDate: string; endDate?: string | null },
): Promise<MedicationWithSchedule> {
  await getMedication(db, userId, id);
  if (input.endDate && input.endDate < input.startDate) {
    throw HttpError.badRequest("endDate must be on or after startDate.", "INVALID_DATE_RANGE");
  }
  const values = {
    times: [...new Set(input.times)].sort(),
    daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  };
  await db
    .insert(schedules)
    .values({ medicationId: id, ...values })
    .onConflictDoUpdate({ target: schedules.medicationId, set: values });
  return getMedication(db, userId, id);
}
