import { jwtVerify, SignJWT } from "jose";

import { env } from "../lib/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "medtrack-api";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/** Returns the user id, or null for any invalid, expired or tampered token. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
