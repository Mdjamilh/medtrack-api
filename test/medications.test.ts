import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, signUp } from "./helpers.js";

let t: Awaited<ReturnType<typeof createTestApp>>;
let auth: Record<string, string>;

beforeAll(async () => {
  t = await createTestApp();
  ({ auth } = await signUp(t.app));
});

afterAll(async () => {
  await t.close();
});

const create = (body: object, headers = auth) => t.api().post("/v1/medications").set(headers).send(body);

describe("medications", () => {
  it("creates, reads, updates and lists medications", async () => {
    const created = await create({ name: "Metformin", dose: "500 mg", instructions: "With food" });
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`/v1/medications/${created.body.id}`);
    expect(created.body).toMatchObject({ name: "Metformin", active: true, schedule: null });

    const id = created.body.id;
    const patched = await t.api().patch(`/v1/medications/${id}`).set(auth).send({ dose: "1000 mg", active: false });
    expect(patched.body).toMatchObject({ dose: "1000 mg", active: false });

    await create({ name: "Atorvastatin", dose: "20 mg" });
    const all = await t.api().get("/v1/medications").set(auth);
    expect(all.body.data.map((m: { name: string }) => m.name)).toEqual(["Atorvastatin", "Metformin"]);
    const active = await t.api().get("/v1/medications?active=true").set(auth);
    expect(active.body.data.map((m: { name: string }) => m.name)).toEqual(["Atorvastatin"]);
  });

  it("hides other users' medications behind a 404", async () => {
    const mine = await create({ name: "Lisinopril", dose: "10 mg" });
    const other = await signUp(t.app);

    for (const res of [
      await t.api().get(`/v1/medications/${mine.body.id}`).set(other.auth),
      await t.api().patch(`/v1/medications/${mine.body.id}`).set(other.auth).send({ dose: "x" }),
      await t.api().delete(`/v1/medications/${mine.body.id}`).set(other.auth),
      await t
        .api()
        .put(`/v1/medications/${mine.body.id}/schedule`)
        .set(other.auth)
        .send({
          times: ["08:00"],
          startDate: "2026-01-01",
        }),
    ]) {
      expect(res.status).toBe(404);
    }
    expect((await t.api().get("/v1/medications").set(other.auth)).body.data).toEqual([]);
  });

  it("sets a schedule, de-duplicating and sorting times and days", async () => {
    const med = await create({ name: "Vitamin D", dose: "1000 IU" });
    const res = await t
      .api()
      .put(`/v1/medications/${med.body.id}/schedule`)
      .set(auth)
      .send({ times: ["20:00", "08:00", "08:00"], daysOfWeek: [5, 1, 1], startDate: "2026-01-01" });
    expect(res.status).toBe(200);
    expect(res.body.schedule).toEqual({
      times: ["08:00", "20:00"],
      daysOfWeek: [1, 5],
      startDate: "2026-01-01",
      endDate: null,
    });

    // Replacing the schedule keeps one row per medication.
    const replaced = await t
      .api()
      .put(`/v1/medications/${med.body.id}/schedule`)
      .set(auth)
      .send({ times: ["09:30"], startDate: "2026-02-01", endDate: "2026-03-01" });
    expect(replaced.body.schedule).toMatchObject({ times: ["09:30"], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
  });

  it("validates schedules", async () => {
    const med = await create({ name: "Test", dose: "1" });
    const put = (body: object) => t.api().put(`/v1/medications/${med.body.id}/schedule`).set(auth).send(body);

    expect((await put({ times: ["8:00"], startDate: "2026-01-01" })).status).toBe(400);
    expect((await put({ times: [], startDate: "2026-01-01" })).status).toBe(400);
    expect((await put({ times: ["08:00"], daysOfWeek: [7], startDate: "2026-01-01" })).status).toBe(400);
    const range = await put({ times: ["08:00"], startDate: "2026-03-01", endDate: "2026-02-01" });
    expect(range.status).toBe(400);
    expect(range.body.error.code).toBe("INVALID_DATE_RANGE");
  });

  it("deletes medications", async () => {
    const med = await create({ name: "Temporary", dose: "1" });
    expect((await t.api().delete(`/v1/medications/${med.body.id}`).set(auth)).status).toBe(204);
    expect((await t.api().get(`/v1/medications/${med.body.id}`).set(auth)).status).toBe(404);
  });

  it("rejects malformed ids", async () => {
    const res = await t.api().get("/v1/medications/not-a-uuid").set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("id");
  });
});
