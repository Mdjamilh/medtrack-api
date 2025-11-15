import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adherenceReport, dosesForDay, logDose } from "../src/services/doses.js";
import { createTestApp, signUp } from "./helpers.js";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

/** A user in New York with one twice-daily medication starting Mar 1, 2026. */
async function setup() {
  const user = await signUp(t.app, { timezone: "America/New_York" });
  const med = await t.api().post("/v1/medications").set(user.auth).send({ name: "Metformin", dose: "500 mg" });
  await t
    .api()
    .put(`/v1/medications/${med.body.id}/schedule`)
    .set(user.auth)
    .send({ times: ["08:00", "20:00"], startDate: "2026-03-01" });
  return { userId: user.id, medicationId: med.body.id as string, auth: user.auth };
}

// 08:00 and 20:00 New York time (EST, UTC-5) on Mar 2 and Mar 3.
const MAR2_AM = new Date("2026-03-02T13:00:00Z");
const MAR2_PM = new Date("2026-03-03T01:00:00Z");
const MAR3_AM = new Date("2026-03-03T13:00:00Z");

describe("dose service (fixed clock)", () => {
  it("lists a day's doses in local time with their state", async () => {
    const { userId, medicationId } = await setup();
    const now = new Date("2026-03-02T14:30:00Z"); // 09:30 local: morning dose missed, evening upcoming
    await logDose(t.db, userId, medicationId, { scheduledFor: MAR2_AM, status: "taken" }, now);

    const day = await dosesForDay(t.db, userId, "2026-03-02", now);
    expect(day.timezone).toBe("America/New_York");
    expect(day.doses.map((d) => [d.localTime, d.state])).toEqual([
      ["08:00", "taken"],
      ["20:00", "upcoming"],
    ]);
  });

  it("re-logging the same dose updates it instead of duplicating", async () => {
    const { userId, medicationId } = await setup();
    const now = new Date("2026-03-02T15:00:00Z");
    await logDose(t.db, userId, medicationId, { scheduledFor: MAR2_AM, status: "taken" }, now);
    await logDose(t.db, userId, medicationId, { scheduledFor: MAR2_AM, status: "skipped", note: "nausea" }, now);

    const day = await dosesForDay(t.db, userId, "2026-03-02", now);
    expect(day.doses[0]).toMatchObject({ state: "skipped", note: "nausea" });
  });

  it("refuses times that aren't on the schedule or too far in the future", async () => {
    const { userId, medicationId } = await setup();
    const now = new Date("2026-03-02T12:00:00Z");
    await expect(
      logDose(t.db, userId, medicationId, { scheduledFor: new Date("2026-03-02T13:15:00Z"), status: "taken" }, now),
    ).rejects.toMatchObject({ code: "NOT_SCHEDULED" });
    await expect(
      logDose(t.db, userId, medicationId, { scheduledFor: MAR3_AM, status: "taken" }, now),
    ).rejects.toMatchObject({ code: "TOO_EARLY" });
    // 08:00 dose logged at 07:00 local is fine (within 2 hours early).
    await expect(
      logDose(t.db, userId, medicationId, { scheduledFor: MAR2_AM, status: "taken" }, now),
    ).resolves.toMatchObject({ status: "taken" });
  });

  it("reports adherence and streaks", async () => {
    const { userId, medicationId } = await setup();
    const now = new Date("2026-03-03T14:30:00Z"); // Mar 3, 09:30 local
    await logDose(t.db, userId, medicationId, { scheduledFor: MAR2_AM, status: "taken" }, now);
    await logDose(t.db, userId, medicationId, { scheduledFor: MAR2_PM, status: "taken" }, now);
    await logDose(t.db, userId, medicationId, { scheduledFor: MAR3_AM, status: "taken" }, now);

    const report = await adherenceReport(t.db, userId, { from: "2026-03-01", to: "2026-03-03" }, now);
    // Mar 1: two missed; Mar 2: both taken; Mar 3: morning taken, evening upcoming.
    expect(report.overall).toEqual({ taken: 3, skipped: 0, missed: 2, settled: 5, rate: 0.6 });
    expect(report.currentStreakDays).toBe(1);
    expect(report.medications[0]).toMatchObject({ name: "Metformin", rate: 0.6 });
  });
});

describe("dose endpoints", () => {
  it("logs and undoes a dose over HTTP with ISO timestamps in the path", async () => {
    const { medicationId, auth } = await setup();
    const path = `/v1/medications/${medicationId}/doses/${encodeURIComponent(MAR2_AM.toISOString())}`;

    const logged = await t.api().put(path).set(auth).send({ status: "taken" });
    expect(logged.status).toBe(200);
    expect(logged.body).toMatchObject({ status: "taken", scheduledFor: MAR2_AM.toISOString() });

    expect((await t.api().delete(path).set(auth)).status).toBe(204);
    expect((await t.api().delete(path).set(auth)).status).toBe(404);
  });

  it("returns today's doses and a default 30-day adherence report", async () => {
    const { auth } = await setup();
    const doses = await t.api().get("/v1/doses").set(auth);
    expect(doses.status).toBe(200);
    expect(doses.body.doses).toHaveLength(2);

    const report = await t.api().get("/v1/adherence").set(auth);
    expect(report.status).toBe(200);
    expect(report.body).toHaveProperty("currentStreakDays");
    expect((await t.api().get("/v1/adherence?from=2026-03-05&to=2026-03-01").set(auth)).status).toBe(400);
  });
});
