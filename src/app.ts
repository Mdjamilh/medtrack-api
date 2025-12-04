import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { Database } from "./db/types.js";
import { docsPage } from "./http/docs-page.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { openApiDocument } from "./http/openapi.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { dosesRouter } from "./routes/doses.js";
import { medicationsRouter } from "./routes/medications.js";

export function createApp({ db }: { db: Database }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const spec = openApiDocument();
  app.get("/openapi.json", (_req, res) => res.json(spec));
  // The docs page uses an inline script and a CDN, so it's served before the strict CSP below.
  const docsHtml = docsPage({ specUrl: "/openapi.json", title: "MedTrack API docs" });
  app.get(["/docs", "/docs/"], (_req, res) => res.type("html").send(docsHtml));

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "100kb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/healthz" } }));

  app.get("/", (_req, res) => res.redirect("/docs"));
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.use("/v1", authRouter(db), medicationsRouter(db), dosesRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
