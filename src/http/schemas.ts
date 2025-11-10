import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { TIME_PATTERN } from "../domain/schedule.js";

extendZodWithOpenApi(z);

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const Id = z.uuid().openapi({ example: "6f1c2a5e-4b7d-4c2e-9a51-2f0f6a3d8e10" });
export const LocalDate = z.iso.date().openapi({ example: "2026-10-23" });
export const TimeZone = z
  .string()
  .refine(isTimeZone, "Must be an IANA timezone such as America/New_York.")
  .openapi({ example: "America/New_York" });

/** Trimmed and lowercased before validation, so pasted emails with stray spaces still work. */
const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .openapi({ type: "string", format: "email", example: "ava@example.com" });

// Auth & users
export const RegisterBody = z
  .object({
    email: Email,
    password: z.string().min(8, "Use at least 8 characters.").max(128),
    name: z.string().trim().min(1).max(100),
    timezone: TimeZone.optional(),
  })
  .openapi("RegisterBody");

export const LoginBody = z.object({ email: Email, password: z.string().min(1) }).openapi("LoginBody");

export const User = z
  .object({ id: Id, email: z.email(), name: z.string(), timezone: z.string(), createdAt: z.iso.datetime() })
  .openapi("User");

export const AuthResponse = z
  .object({ user: User, token: z.string(), expiresIn: z.number().int() })
  .openapi("AuthResponse");

export const UpdateMeBody = z
  .object({ name: z.string().trim().min(1).max(100).optional(), timezone: TimeZone.optional() })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.")
  .openapi("UpdateMeBody");

// Medications & schedules
export const ScheduleBody = z
  .object({
    times: z
      .array(z.string().regex(TIME_PATTERN, "Use 24-hour HH:MM."))
      .min(1)
      .max(12)
      .openapi({ example: ["08:00", "20:00"] }),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .default([0, 1, 2, 3, 4, 5, 6])
      .openapi({ description: "0 = Sunday … 6 = Saturday" }),
    startDate: LocalDate,
    endDate: LocalDate.nullable().optional(),
  })
  .openapi("ScheduleBody");

export const Schedule = z
  .object({
    times: z.array(z.string()),
    daysOfWeek: z.array(z.number()),
    startDate: LocalDate,
    endDate: LocalDate.nullable(),
  })
  .openapi("Schedule");

export const MedicationBody = z
  .object({
    name: z.string().trim().min(1).max(120).openapi({ example: "Metformin" }),
    dose: z.string().trim().min(1).max(60).openapi({ example: "500 mg" }),
    instructions: z.string().trim().max(500).nullable().optional().openapi({ example: "Take with food" }),
  })
  .openapi("MedicationBody");

export const MedicationPatch = MedicationBody.partial()
  .extend({ active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.")
  .openapi("MedicationPatch");

export const Medication = z
  .object({
    id: Id,
    name: z.string(),
    dose: z.string(),
    instructions: z.string().nullable(),
    active: z.boolean(),
    schedule: Schedule.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Medication");

export const ListMedicationsQuery = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

// Doses & adherence
export const DoseState = z.enum(["taken", "skipped", "missed", "due", "upcoming"]).openapi("DoseState");

export const DayDoses = z
  .object({
    date: LocalDate,
    timezone: z.string(),
    doses: z.array(
      z.object({
        medicationId: Id,
        medicationName: z.string(),
        dose: z.string(),
        scheduledFor: z.iso.datetime(),
        localTime: z.string().openapi({ example: "08:00" }),
        state: DoseState,
        note: z.string().nullable(),
      }),
    ),
  })
  .openapi("DayDoses");

export const DosesQuery = z.object({ date: LocalDate.optional() });

export const DoseParams = z.object({ id: Id, scheduledFor: z.iso.datetime({ offset: true }) });

export const LogDoseBody = z
  .object({ status: z.enum(["taken", "skipped"]), note: z.string().trim().max(500).nullable().optional() })
  .openapi("LogDoseBody");

export const DoseLog = z
  .object({
    id: Id,
    medicationId: Id,
    scheduledFor: z.iso.datetime(),
    status: z.enum(["taken", "skipped"]),
    note: z.string().nullable(),
    loggedAt: z.iso.datetime(),
  })
  .openapi("DoseLog");

const Summary = {
  taken: z.number().int(),
  skipped: z.number().int(),
  missed: z.number().int(),
  settled: z.number().int(),
  rate: z.number().min(0).max(1).nullable(),
};

export const AdherenceQuery = z.object({ from: LocalDate.optional(), to: LocalDate.optional() });

export const AdherenceReport = z
  .object({
    from: LocalDate,
    to: LocalDate,
    timezone: z.string(),
    overall: z.object(Summary),
    currentStreakDays: z.number().int(),
    medications: z.array(z.object({ medicationId: Id, name: z.string(), ...Summary })),
  })
  .openapi("AdherenceReport");

export const IdParams = z.object({ id: Id });

export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi("Error");

export const MedicationList = z.object({ data: z.array(Medication) }).openapi("MedicationList");
