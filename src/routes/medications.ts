import { Router } from "express";

import { currentUserId, requireAuth } from "../auth/middleware.js";
import type { Database } from "../db/types.js";
import { IdParams, ListMedicationsQuery, MedicationBody, MedicationPatch, ScheduleBody } from "../http/schemas.js";
import {
  createMedication,
  deleteMedication,
  getMedication,
  listMedications,
  setSchedule,
  updateMedication,
} from "../services/medications.js";

export function medicationsRouter(db: Database) {
  const router = Router();
  router.use("/medications", requireAuth);

  router.get("/medications", async (req, res) => {
    const { active } = ListMedicationsQuery.parse(req.query);
    res.json({ data: await listMedications(db, currentUserId(req), { active }) });
  });

  router.post("/medications", async (req, res) => {
    const medication = await createMedication(db, currentUserId(req), MedicationBody.parse(req.body));
    res.status(201).location(`/v1/medications/${medication.id}`).json(medication);
  });

  router.get("/medications/:id", async (req, res) => {
    res.json(await getMedication(db, currentUserId(req), IdParams.parse(req.params).id));
  });

  router.patch("/medications/:id", async (req, res) => {
    const { id } = IdParams.parse(req.params);
    res.json(await updateMedication(db, currentUserId(req), id, MedicationPatch.parse(req.body)));
  });

  router.delete("/medications/:id", async (req, res) => {
    await deleteMedication(db, currentUserId(req), IdParams.parse(req.params).id);
    res.status(204).end();
  });

  router.put("/medications/:id/schedule", async (req, res) => {
    const { id } = IdParams.parse(req.params);
    res.json(await setSchedule(db, currentUserId(req), id, ScheduleBody.parse(req.body)));
  });

  return router;
}
