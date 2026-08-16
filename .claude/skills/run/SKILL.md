---
name: run
description: Use to boot the LeapMap API locally and verify it responds — starts Postgres + Valkey, applies migrations, runs the API, checks health endpoints.
when_to_use: |
  Trigger when asked to run/start the app, smoke-test a change, or confirm the API is healthy locally.
---

# Run LeapMap API locally

1. `docker compose up -d`  (Postgres + Valkey; wait until both are healthy)
2. `npm run db-migrate`     (apply pending migrations)
3. `npm run start:dev`      (API on http://localhost:3000)
4. Verify:
   - `curl -s localhost:3000/`        → `{"name":"leapmap-api","status":"ok"}`
   - `curl -s localhost:3000/health`  → `{"status":"ok"}`
   - `curl -s localhost:3000/ready`   → database + valkey "up"
