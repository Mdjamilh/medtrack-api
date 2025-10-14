import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  /** IANA timezone used to turn "08:00" into real instants. */
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose").notNull(),
    instructions: text("instructions"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("medications_user_idx").on(t.userId, t.active)],
);

/** One schedule per medication: times of day on chosen weekdays between two dates. */
export const schedules = pgTable(
  "schedules",
  {
    medicationId: uuid("medication_id")
      .primaryKey()
      .references(() => medications.id, { onDelete: "cascade" }),
    /** Local times, "HH:MM", sorted and unique. */
    times: text("times").array().notNull(),
    /** 0 = Sunday … 6 = Saturday. */
    daysOfWeek: smallint("days_of_week").array().notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
  },
  (t) => [
    check("schedules_times_not_empty", sql`cardinality(${t.times}) > 0`),
    check("schedules_days_not_empty", sql`cardinality(${t.daysOfWeek}) > 0`),
    check("schedules_date_order", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
  ],
);

export const doseStatus = pgEnum("dose_status", ["taken", "skipped"]);

export const doseLogs = pgTable(
  "dose_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: doseStatus("status").notNull(),
    note: text("note"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One record per scheduled dose; logging again updates it.
    uniqueIndex("dose_logs_medication_slot_uq").on(t.medicationId, t.scheduledFor),
  ],
);

export type User = typeof users.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type DoseLog = typeof doseLogs.$inferSelect;
