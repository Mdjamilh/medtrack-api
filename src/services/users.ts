import { eq } from "drizzle-orm";

import { hashPassword, verifyPassword } from "../auth/password.js";
import { users, type User } from "../db/schema.js";
import type { Database } from "../db/types.js";
import { HttpError } from "../http/errors.js";

export type PublicUser = Pick<User, "id" | "email" | "name" | "timezone" | "createdAt">;

export const toPublicUser = ({ id, email, name, timezone, createdAt }: User): PublicUser => ({
  id,
  email,
  name,
  timezone,
  createdAt,
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function registerUser(
  db: Database,
  input: { email: string; password: string; name: string; timezone?: string },
): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  const existing = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
  if (existing) throw HttpError.conflict("An account with this email already exists.");

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: input.name,
      timezone: input.timezone ?? "UTC",
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return toPublicUser(user!);
}

/** bcrypt hash of a throwaway string, compared against when the email is unknown. */
const DUMMY_HASH = "$2b$12$8lbPXYb6zJcP5KmkKt8nEODah5299saZQ1f.tFStTgcgP/qtIZga6";

/**
 * Same error, and roughly the same response time, for an unknown email and a
 * wrong password, so accounts can't be enumerated.
 */
export async function authenticate(db: Database, input: { email: string; password: string }): Promise<PublicUser> {
  const user = await db.query.users.findFirst({ where: eq(users.email, normalizeEmail(input.email)) });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw HttpError.unauthorized("Email or password is incorrect.");
  return toPublicUser(user);
}

export async function getUser(db: Database, id: string): Promise<User> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) throw HttpError.unauthorized("This account no longer exists.");
  return user;
}

export async function updateUser(
  db: Database,
  id: string,
  patch: { name?: string; timezone?: string },
): Promise<PublicUser> {
  const [user] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  if (!user) throw HttpError.unauthorized("This account no longer exists.");
  return toPublicUser(user);
}
