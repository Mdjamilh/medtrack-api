import { OpenApiGeneratorV3, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { ZodType } from "zod";

import * as s from "./schemas.js";

const registry = new OpenAPIRegistry();
const bearer = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});
const secured = [{ [bearer.name]: [] }];

const json = (schema: ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const errors = {
  400: json(s.ErrorResponse, "Validation error"),
  401: json(s.ErrorResponse, "Missing or invalid token"),
  404: json(s.ErrorResponse, "Not found or not yours"),
};

registry.registerPath({
  method: "post",
  path: "/v1/auth/register",
  tags: ["Auth"],
  summary: "Create an account",
  request: { body: { content: { "application/json": { schema: s.RegisterBody } } } },
  responses: {
    201: json(s.AuthResponse, "Account created"),
    400: errors[400],
    409: json(s.ErrorResponse, "Email taken"),
  },
});
registry.registerPath({
  method: "post",
  path: "/v1/auth/login",
  tags: ["Auth"],
  summary: "Log in",
  request: { body: { content: { "application/json": { schema: s.LoginBody } } } },
  responses: { 200: json(s.AuthResponse, "Logged in"), 401: errors[401], 429: json(s.ErrorResponse, "Rate limited") },
});
registry.registerPath({
  method: "get",
  path: "/v1/me",
  tags: ["Auth"],
  summary: "Current user",
  security: secured,
  responses: { 200: json(s.User, "The current user"), 401: errors[401] },
});
registry.registerPath({
  method: "patch",
  path: "/v1/me",
  tags: ["Auth"],
  summary: "Update name or timezone",
  security: secured,
  request: { body: { content: { "application/json": { schema: s.UpdateMeBody } } } },
  responses: { 200: json(s.User, "Updated user"), 400: errors[400], 401: errors[401] },
});

registry.registerPath({
  method: "get",
  path: "/v1/medications",
  tags: ["Medications"],
  summary: "List medications",
  security: secured,
  request: { query: s.ListMedicationsQuery },
  responses: {
    200: json(s.MedicationList, "Medications"),
    401: errors[401],
  },
});
registry.registerPath({
  method: "post",
  path: "/v1/medications",
  tags: ["Medications"],
  summary: "Add a medication",
  security: secured,
  request: { body: { content: { "application/json": { schema: s.MedicationBody } } } },
  responses: { 201: json(s.Medication, "Created"), 400: errors[400], 401: errors[401] },
});
for (const [method, summary, body, status] of [
  ["get", "Get a medication", undefined, 200],
  ["patch", "Update a medication (or deactivate it)", s.MedicationPatch, 200],
  ["delete", "Delete a medication and its logs", undefined, 204],
] as const) {
  registry.registerPath({
    method,
    path: "/v1/medications/{id}",
    tags: ["Medications"],
    summary,
    security: secured,
    request: { params: s.IdParams, ...(body && { body: { content: { "application/json": { schema: body } } } }) },
    responses: {
      [status]: status === 204 ? { description: "Deleted" } : json(s.Medication, "The medication"),
      ...errors,
    },
  });
}
registry.registerPath({
  method: "put",
  path: "/v1/medications/{id}/schedule",
  tags: ["Medications"],
  summary: "Set or replace the dosing schedule",
  security: secured,
  request: { params: s.IdParams, body: { content: { "application/json": { schema: s.ScheduleBody } } } },
  responses: { 200: json(s.Medication, "Medication with its schedule"), ...errors },
});

registry.registerPath({
  method: "get",
  path: "/v1/doses",
  tags: ["Doses"],
  summary: "All doses for a local day with their state",
  security: secured,
  request: { query: s.DosesQuery },
  responses: { 200: json(s.DayDoses, "Doses in time order"), 400: errors[400], 401: errors[401] },
});
registry.registerPath({
  method: "put",
  path: "/v1/medications/{id}/doses/{scheduledFor}",
  tags: ["Doses"],
  summary: "Log a dose as taken or skipped (idempotent)",
  security: secured,
  request: { params: s.DoseParams, body: { content: { "application/json": { schema: s.LogDoseBody } } } },
  responses: { 200: json(s.DoseLog, "The dose log"), ...errors },
});
registry.registerPath({
  method: "delete",
  path: "/v1/medications/{id}/doses/{scheduledFor}",
  tags: ["Doses"],
  summary: "Undo a dose log",
  security: secured,
  request: { params: s.DoseParams },
  responses: { 204: { description: "Removed" }, ...errors },
});
registry.registerPath({
  method: "get",
  path: "/v1/adherence",
  tags: ["Adherence"],
  summary: "Adherence rate per medication and overall, with the current streak",
  security: secured,
  request: { query: s.AdherenceQuery },
  responses: {
    200: json(s.AdherenceReport, "Report (defaults to the last 30 days)"),
    400: errors[400],
    401: errors[401],
  },
});

export function openApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "MedTrack API",
      version: "1.0.0",
      description:
        "Medication schedules, dose logging and adherence reports. Authenticate with `POST /v1/auth/login` and send the token as `Authorization: Bearer <token>`.",
    },
    servers: [{ url: "/" }],
  });
}
