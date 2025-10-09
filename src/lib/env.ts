import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  CORS_ORIGINS: z.string().default("*"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = schema.parse({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  JWT_SECRET: process.env.JWT_SECRET || undefined,
});

if (parsed.NODE_ENV === "production" && !parsed.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

export const env = {
  ...parsed,
  // A fixed development secret keeps tokens valid across dev restarts; never used in production.
  JWT_SECRET: parsed.JWT_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
};
