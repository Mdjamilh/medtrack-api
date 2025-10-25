import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";
import { signAccessToken, verifyAccessToken } from "./tokens.js";

describe("access tokens", () => {
  it("round-trips the user id", async () => {
    const token = await signAccessToken("user-123");
    await expect(verifyAccessToken(token)).resolves.toBe("user-123");
  });

  it("rejects tampered and malformed tokens", async () => {
    const token = await signAccessToken("user-123");
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", iss: "medtrack-api" })).toString("base64url");
    await expect(verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).resolves.toBeNull();
    await expect(verifyAccessToken("not-a-jwt")).resolves.toBeNull();
  });
});

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const [a, b] = await Promise.all([hashPassword("correct horse"), hashPassword("correct horse")]);
    expect(a).not.toBe(b);
    await expect(verifyPassword("correct horse", a)).resolves.toBe(true);
    await expect(verifyPassword("wrong", a)).resolves.toBe(false);
  });
});
