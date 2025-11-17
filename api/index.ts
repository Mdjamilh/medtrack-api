import type { IncomingMessage, ServerResponse } from "node:http";

import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";

// Vercel serverless entry: build the app once per instance and reuse it.
let app: Promise<ReturnType<typeof createApp>> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  app ??= createDatabase().then(({ db }) => createApp({ db }));
  (await app)(req, res);
}
