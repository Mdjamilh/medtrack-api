import type { RequestHandler } from "express";

import { HttpError } from "../http/errors.js";
import { verifyAccessToken } from "./tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireAuth for authenticated routes. */
    userId?: string;
  }
}

/** Requires `Authorization: Bearer <token>` and exposes the caller as req.userId. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) throw HttpError.unauthorized("A valid bearer token is required.");
  req.userId = userId;
  next();
};

export function currentUserId(req: { userId?: string }): string {
  if (!req.userId) throw HttpError.unauthorized();
  return req.userId;
}
