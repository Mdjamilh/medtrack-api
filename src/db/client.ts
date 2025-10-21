import path from "node:path";

import { env } from "../lib/env.js";
import * as schema from "./schema.js";
import type { Database } from "./types.js";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Postgres when DATABASE_URL is set (migrate with `npm run db:migrate`),
 * otherwise an embedded PGlite database that migrates itself, so the API
 * runs with no setup. Pass `inMemory` for tests.
 */
export async function createDatabase({ inMemory = false } = {}): Promise<{ db: Database; close: () => Promise<void> }> {
  if (env.DATABASE_URL && !inMemory) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(env.DATABASE_URL, { max: 5, prepare: false });
    return { db: drizzle(client, { schema }), close: () => client.end() };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const ephemeral = inMemory || Boolean(process.env.VERCEL);
  const client = new PGlite({ dataDir: ephemeral ? undefined : path.join(process.cwd(), ".pglite") });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}
