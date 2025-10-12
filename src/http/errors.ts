import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { logger } from "../lib/logger.js";

/** An expected failure with a status code and a message that's safe to return. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest = (message: string, code = "BAD_REQUEST") => new HttpError(400, code, message);
  static unauthorized = (message = "Authentication required.") => new HttpError(401, "UNAUTHORIZED", message);
  static notFound = (what = "Resource") => new HttpError(404, "NOT_FOUND", `${what} not found.`);
  static conflict = (message: string) => new HttpError(409, "CONFLICT", message);
}

export type ErrorBody = {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}.` } } satisfies ErrorBody);
};

/** Every error leaves the API in the same JSON shape; unexpected ones are logged, never leaked. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request is invalid.",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    } satisfies ErrorBody);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } } satisfies ErrorBody);
    return;
  }
  // Malformed JSON bodies from express.json().
  if (error?.type === "entity.parse.failed") {
    res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "The request body is not valid JSON." } } satisfies ErrorBody);
    return;
  }

  logger.error({ err: error, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong." } } satisfies ErrorBody);
};
