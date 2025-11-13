import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, signUp } from "./helpers.js";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

describe("POST /v1/auth/register", () => {
  it("creates an account and returns a token, never the password hash", async () => {
    const { body } = await signUp(t.app, { email: "  Ava@Example.COM ", timezone: "America/New_York" });
    expect(body.user).toMatchObject({ email: "ava@example.com", timezone: "America/New_York" });
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.token).toMatch(/^ey/);
    expect(body.expiresIn).toBe(86400);
  });

  it("rejects duplicate emails regardless of case", async () => {
    await signUp(t.app, { email: "dup@example.com" });
    const res = await t
      .api()
      .post("/v1/auth/register")
      .send({ email: "DUP@example.com", password: "another password", name: "Dup" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns field-level validation errors", async () => {
    const res = await t
      .api()
      .post("/v1/auth/register")
      .send({ email: "not-an-email", password: "short", name: "", timezone: "Mars/Olympus" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      "email",
      "name",
      "password",
      "timezone",
    ]);
  });

  it("handles malformed JSON", async () => {
    const res = await t.api().post("/v1/auth/register").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("POST /v1/auth/login", () => {
  it("logs in with the right password", async () => {
    await signUp(t.app, { email: "login@example.com" });
    const res = await t
      .api()
      .post("/v1/auth/login")
      .send({ email: "LOGIN@example.com", password: "correct horse battery" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await t.api().post("/v1/auth/login").send({ email: "login@example.com", password: "nope" });
    const unknown = await t.api().post("/v1/auth/login").send({ email: "ghost@example.com", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe("/v1/me", () => {
  it("requires a valid bearer token", async () => {
    expect((await t.api().get("/v1/me")).status).toBe(401);
    expect((await t.api().get("/v1/me").set("Authorization", "Bearer garbage")).status).toBe(401);
  });

  it("returns and updates the current user", async () => {
    const { auth } = await signUp(t.app);
    expect((await t.api().get("/v1/me").set(auth)).body.timezone).toBe("UTC");

    const res = await t.api().patch("/v1/me").set(auth).send({ timezone: "Asia/Dhaka" });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe("Asia/Dhaka");
    expect((await t.api().patch("/v1/me").set(auth).send({})).status).toBe(400);
  });
});

describe("platform", () => {
  it("serves health, OpenAPI and JSON 404s with security headers", async () => {
    const health = await t.api().get("/healthz");
    expect(health.body).toEqual({ status: "ok" });
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-powered-by"]).toBeUndefined();

    const spec = await t.api().get("/openapi.json");
    expect(spec.body.openapi).toBe("3.0.3");
    expect(Object.keys(spec.body.paths)).toContain("/v1/adherence");

    const missing = await t.api().get("/v1/nope");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });
});
