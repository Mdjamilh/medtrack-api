/**
 * Creates a demo account with two medications and two weeks of realistic dose
 * history, so /v1/doses and /v1/adherence have something to show.
 *   npm run seed   →   demo@example.com / medtrack-demo
 */
import { addDays, addMinutes } from "date-fns";
import { eq } from "drizzle-orm";

import { createDatabase } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { expandSchedule } from "../src/domain/schedule.js";
import { logDose } from "../src/services/doses.js";
import { createMedication, setSchedule } from "../src/services/medications.js";
import { registerUser } from "../src/services/users.js";

const EMAIL = "demo@example.com";
const PASSWORD = "medtrack-demo";
const TIMEZONE = "America/New_York";

const { db, close } = await createDatabase();

await db.delete(users).where(eq(users.email, EMAIL));
const user = await registerUser(db, { email: EMAIL, password: PASSWORD, name: "Demo Patient", timezone: TIMEZONE });

const now = new Date();
const start = addDays(now, -14);
const startDate = start.toISOString().slice(0, 10);

const metformin = await createMedication(db, user.id, {
  name: "Metformin",
  dose: "500 mg",
  instructions: "Take with meals",
});
await setSchedule(db, user.id, metformin.id, {
  times: ["08:00", "20:00"],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDate,
});

const atorvastatin = await createMedication(db, user.id, {
  name: "Atorvastatin",
  dose: "20 mg",
  instructions: "At bedtime",
});
await setSchedule(db, user.id, atorvastatin.id, { times: ["22:00"], daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startDate });

// Deterministic, mostly-good adherence: every 7th dose missed, every 11th skipped.
let n = 0;
let logged = 0;
for (const med of [metformin, atorvastatin]) {
  const schedule = {
    times: med.id === metformin.id ? ["08:00", "20:00"] : ["22:00"],
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startDate,
    endDate: null,
  };
  for (const scheduledFor of expandSchedule(schedule, { from: start, to: addMinutes(now, -90), timeZone: TIMEZONE })) {
    n += 1;
    if (n % 7 === 0) continue;
    await logDose(db, user.id, med.id, { scheduledFor, status: n % 11 === 0 ? "skipped" : "taken" }, now);
    logged += 1;
  }
}

await close();
console.log(`Seeded ${EMAIL} / ${PASSWORD} with 2 medications and ${logged} dose logs.`);
