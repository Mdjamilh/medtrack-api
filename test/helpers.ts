import request from "supertest";

import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import type { Database } from "../src/db/types.js";

/** A fresh app backed by an in-memory, fully migrated Postgres. */
export async function createTestApp() {
  const { db, close } = await createDatabase({ inMemory: true });
  const app = createApp({ db });
  return { app, db, close, api: () => request(app) };
}

let counter = 0;

/** Registers a user and returns its id and an Authorization header. */
export async function signUp(app: Parameters<typeof request>[0], overrides: Record<string, string> = {}) {
  counter += 1;
  const res = await request(app)
    .post("/v1/auth/register")
    .send({
      email: `user${counter}@example.com`,
      password: "correct horse battery",
      name: `User ${counter}`,
      ...overrides,
    })
    .expect(201);
  return { id: res.body.user.id as string, auth: { Authorization: `Bearer ${res.body.token}` }, body: res.body };
}

export type TestDb = Database;
