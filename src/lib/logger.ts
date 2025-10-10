import pino from "pino";

import { env } from "./env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password"],
  ...(env.NODE_ENV === "development" && { transport: { target: "pino-pretty", options: { colorize: true } } }),
});
