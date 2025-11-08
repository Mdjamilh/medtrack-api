import { Router } from "express";

import { currentUserId, requireAuth } from "../auth/middleware.js";
import type { Database } from "../db/types.js";
import { AdherenceQuery, DoseParams, DosesQuery, LogDoseBody } from "../http/schemas.js";
import { adherenceReport, dosesForDay, logDose, undoDose } from "../services/doses.js";

export function dosesRouter(db: Database) {
  const router = Router();

  router.get("/doses", requireAuth, async (req, res) => {
    const { date } = DosesQuery.parse(req.query);
    res.json(await dosesForDay(db, currentUserId(req), date));
  });

  router.put("/medications/:id/doses/:scheduledFor", requireAuth, async (req, res) => {
    const { id, scheduledFor } = DoseParams.parse(req.params);
    const log = await logDose(db, currentUserId(req), id, {
      scheduledFor: new Date(scheduledFor),
      ...LogDoseBody.parse(req.body),
    });
    res.json(log);
  });

  router.delete("/medications/:id/doses/:scheduledFor", requireAuth, async (req, res) => {
    const { id, scheduledFor } = DoseParams.parse(req.params);
    await undoDose(db, currentUserId(req), id, new Date(scheduledFor));
    res.status(204).end();
  });

  router.get("/adherence", requireAuth, async (req, res) => {
    res.json(await adherenceReport(db, currentUserId(req), AdherenceQuery.parse(req.query)));
  });

  return router;
}
