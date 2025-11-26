# Design notes

## Layers

```
routes  ──►  services  ──►  domain (pure)
  │             │
  └─ Zod        └─ Drizzle (Postgres / PGlite)
```

- **Domain** functions are pure and take `now` and the timezone as arguments, so the hard parts (DST, grace windows, streaks) are unit-tested without a database or a clock.
- **Services** take the database as their first argument and throw `HttpError` for expected failures. Integration tests call them with a fixed `now`.
- **Routes** stay thin: parse the input with a Zod schema, resolve the caller, call one service, and send its result. Express 5 forwards rejected promises to the error handler, so no try/catch is needed.

## Time

- Schedules store **local** wall-clock times (`"08:00"`) and weekdays, not UTC instants. `expandSchedule` turns them into instants for a window using `@date-fns/tz`, so a dose stays at 08:00 local across DST and if the patient's offset changes.
- Dose logs store the **instant** they belong to (`scheduled_for`, `timestamptz`). `(medication_id, scheduled_for)` is unique, which makes logging an idempotent upsert.
- Day boundaries (for `/v1/doses?date=` and adherence ranges) are computed in the patient's timezone, not the server's.

## Dose states

| State | Rule |
|---|---|
| `taken` / `skipped` | A log exists for that instant |
| `upcoming` | No log, scheduled time in the future |
| `due` | No log, less than 60 minutes past the scheduled time |
| `missed` | No log, more than 60 minutes past |

**Adherence** is `taken / (taken + skipped + missed)`. Doses still `due` or `upcoming` are excluded, so the morning's pending pills don't drag today's number down. **Streaks** count back from today over days on which every dose was taken. Days without doses are ignored, and today only counts once it's complete.

## Security

- Passwords: bcrypt with 12 rounds. Login compares against a dummy hash when the email is unknown, so response time doesn't reveal which emails are registered.
- Tokens: HS256 JWT with issuer and expiry checked; `JWT_SECRET` (32+ characters) is required in production.
- Authorization: every medication and dose query includes `user_id = caller`; other users' resources are indistinguishable from missing ones (404).
- Hardening: helmet headers (with Swagger UI mounted before the CSP), a 100 kB JSON body limit, rate-limited auth endpoints, `x-powered-by` disabled, and authorization and cookie headers redacted from logs.

## Persistence

`createDatabase()` returns Postgres when `DATABASE_URL` is set, otherwise PGlite (Postgres compiled to WebAssembly) that migrates itself on start. Tests use an in-memory PGlite per file, so they exercise real SQL (constraints, upserts, enums) with no external service. CI additionally migrates and seeds a real Postgres 17.
