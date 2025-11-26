# MedTrack API

[![CI](https://github.com/Mdjamilh/medtrack-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Mdjamilh/medtrack-api/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)
![Coverage](https://img.shields.io/badge/coverage-99%25%20lines-brightgreen)

A REST API for tracking medication schedules, logging doses and reporting adherence. Patients add medications with a schedule such as "8:00 and 20:00 every day", log each dose as taken or skipped, and get adherence rates and streaks. Every time is computed in the patient's own timezone.

**Interactive docs:** https://medtrack-api.vercel.app/docs (live demo on an in-memory database, so data resets when the instance restarts)

![Swagger UI](docs/swagger-ui.png)

## Features

- **Accounts.** Register and log in with bcrypt-hashed passwords and 24-hour JWT access tokens. Logins return the same error, in roughly the same time, for unknown emails and wrong passwords.
- **Medications.** Full CRUD, with soft deactivation through `active: false`. Every query is scoped to the owner, and another user's medication returns 404.
- **Schedules.** Times of day, weekdays and a date range, expanded in the patient's IANA timezone, so 08:00 stays 08:00 through daylight-saving changes.
- **Dose log.** An idempotent `PUT` per scheduled dose (taken or skipped, with a note), which can be undone. Times that aren't on the schedule, or are more than 2 hours early, are rejected.
- **Daily view.** `GET /v1/doses` returns each dose for a day as `taken`, `skipped`, `missed`, `due` (within a 60-minute grace window) or `upcoming`.
- **Adherence.** Rates per medication and overall over any date range (default: last 30 days), plus the current streak of fully adherent days.
- **Production basics.** OpenAPI 3 generated from the same Zod schemas that validate requests, Swagger UI, helmet, CORS, rate-limited auth, structured logging with secret redaction, consistent JSON errors, graceful shutdown, a health check, and Docker.

## API at a glance

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/auth/register` | Create an account, returns a token |
| `POST` | `/v1/auth/login` | Log in, returns a token |
| `GET` / `PATCH` | `/v1/me` | Current user; change name or timezone |
| `GET` / `POST` | `/v1/medications` | List (`?active=true`) or add medications |
| `GET` / `PATCH` / `DELETE` | `/v1/medications/{id}` | Read, update or delete one |
| `PUT` | `/v1/medications/{id}/schedule` | Set or replace its schedule |
| `GET` | `/v1/doses?date=YYYY-MM-DD` | All doses for a local day with their state |
| `PUT` / `DELETE` | `/v1/medications/{id}/doses/{scheduledFor}` | Log or undo one dose |
| `GET` | `/v1/adherence?from=&to=` | Adherence report and current streak |
| `GET` | `/healthz`, `/openapi.json`, `/docs` | Health, spec, Swagger UI |

Errors always look like this:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request is invalid.", "details": [{ "path": "times.0", "message": "Use 24-hour HH:MM." }] } }
```

## Quick tour

```bash
API=http://localhost:4000

TOKEN=$(curl -s -X POST $API/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ava@example.com","password":"correct horse","name":"Ava","timezone":"America/New_York"}' | jq -r .token)

MED=$(curl -s -X POST $API/v1/medications -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Metformin","dose":"500 mg","instructions":"With meals"}' | jq -r .id)

curl -s -X PUT $API/v1/medications/$MED/schedule -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"times\":[\"08:00\",\"20:00\"],\"startDate\":\"$(date +%F)\"}"

curl -s $API/v1/doses -H "Authorization: Bearer $TOKEN" | jq          # today's doses and their state
curl -s $API/v1/adherence -H "Authorization: Bearer $TOKEN" | jq      # rates and streak
```

## Getting started

Requires Node.js 20 or newer.

```bash
git clone https://github.com/Mdjamilh/medtrack-api.git
cd medtrack-api
npm install
npm run seed   # optional demo account: demo@example.com / medtrack-demo
npm run dev    # http://localhost:4000/docs
```

Without `DATABASE_URL` the API uses an embedded PGlite database in `.pglite/` and migrates it automatically.

### With Postgres (Docker)

```bash
docker compose up -d db
DATABASE_URL=postgres://medtrack:medtrack@localhost:5432/medtrack npm run db:migrate
docker compose up --build api
```

See [.env.example](.env.example) for all settings. `JWT_SECRET` (32+ characters) is required when `NODE_ENV=production`.

## Project structure

```
src/
  domain/       pure logic: schedule expansion, dose states, adherence, streaks
  services/     use cases on the database (users, medications, doses)
  routes/       Express routers: parse with Zod, call a service, send JSON
  http/         Zod schemas, OpenAPI document, error handling
  auth/         bcrypt, JWT, bearer middleware
  db/           Drizzle schema and client (Postgres or PGlite)
api/index.ts    Vercel serverless entry
test/           Supertest integration tests on an in-memory database
```

More on the design in [docs/DESIGN.md](docs/DESIGN.md).

## Testing

```bash
npm test               # 37 tests: unit (domain) + integration (HTTP + real Postgres)
npm run test:coverage  # ~99% lines, ~90% branches
```

CI runs lint, typecheck, tests with coverage, the build, migrations and seeding against a real Postgres 17 service, and a Docker image build.

## License

[MIT](LICENSE)
