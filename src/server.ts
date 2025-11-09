import { createApp } from "./app.js";
import { createDatabase } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const { db, close } = await createDatabase();
const server = createApp({ db }).listen(env.PORT, () => {
  logger.info(`MedTrack API listening on http://localhost:${env.PORT} (docs at /docs)`);
});

// Finish in-flight requests, then release the database, on Ctrl+C or a container stop.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => void close().then(() => process.exit(0)));
  });
}
