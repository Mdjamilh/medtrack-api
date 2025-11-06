import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { currentUserId, requireAuth } from "../auth/middleware.js";
import { signAccessToken, TOKEN_TTL_SECONDS } from "../auth/tokens.js";
import type { Database } from "../db/types.js";
import { LoginBody, RegisterBody, UpdateMeBody } from "../http/schemas.js";
import { authenticate, getUser, registerUser, toPublicUser, updateUser } from "../services/users.js";

export function authRouter(db: Database) {
  const router = Router();

  // Slows down credential stuffing and signup spam per IP.
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." } },
  });

  const issue = async (user: { id: string }) => ({
    token: await signAccessToken(user.id),
    expiresIn: TOKEN_TTL_SECONDS,
  });

  router.post("/auth/register", authLimiter, async (req, res) => {
    const user = await registerUser(db, RegisterBody.parse(req.body));
    res.status(201).json({ user, ...(await issue(user)) });
  });

  router.post("/auth/login", authLimiter, async (req, res) => {
    const user = await authenticate(db, LoginBody.parse(req.body));
    res.json({ user, ...(await issue(user)) });
  });

  router.get("/me", requireAuth, async (req, res) => {
    res.json(toPublicUser(await getUser(db, currentUserId(req))));
  });

  router.patch("/me", requireAuth, async (req, res) => {
    res.json(await updateUser(db, currentUserId(req), UpdateMeBody.parse(req.body)));
  });

  return router;
}
