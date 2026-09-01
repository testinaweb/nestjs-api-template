# nestjs-api-template — Agent Instructions

## What this is
A reusable NestJS API boilerplate: server-to-server backend scaffold with Postgres,
Valkey, migrations, structured logging, security defaults, JWT/JWKS auth, and an
example CRUD resource showing the intended layering. Fork/clone this per project and
follow the "renaming checklist" in `README.md`.

## Before starting work
If a requirement is ambiguous, involves a design decision only the project owner can
make (architecture, infra/deployment target, a security or privacy tradeoff, a name or
convention not already established here), or conflicts with something already
documented — ask before writing code. Guessing on anything expensive to unwind is not
a shortcut, it's rework. Small, unambiguous fixes don't need a check-in; anything that
reads like "I'll just assume X" does.

## Stack
- Node 24, TypeScript 6, NestJS 11 (monorepo mode)
- PostgreSQL (pgvector-enabled image) + TypeORM (`synchronize: false`)
- Valkey (Redis-compatible), available for caching/queues (no queue library wired up
  by default — add BullMQ or similar per project if needed)
- Auth: generic JWT bearer guard verifying against a remote JWKS endpoint — works with
  AWS Cognito, Auth0, or any OIDC-ish issuer out of the box (see `src/auth/`)
- Jest, Docker + docker compose, GitHub Actions CI

## Layout (NestJS monorepo)
- `src/` — shared code: `common/`, `config/`, `database/`, `health/`, `logger/`,
  `valkey/`, `auth/`, and **`entities/` (ALL TypeORM entities live here, centralized)**
- `services/` — long-lived apps, each with its own `main.ts` (`services/api` = HTTP API)
- `tasks/` — short-lived scripts (`tasks/db-migration` = migration runner)
- `database/bootstrap/` — fresh-DB SQL (extensions + `generate_ulid`);
  `database/migrations/` — forward-only migrations
- Shared imports use the `#src/*` subpath (package.json `imports`). Relative imports
  use an explicit `.js` extension (nodenext ESM).

## Adding a new service or task

This is a strict structural convention — always follow it exactly, don't invent a
different shape for a new one.

- **`services/<name>/`** — a long-running app with its own process/event loop (an HTTP
  API, a worker that stays up). One folder per service. `services/api` is the
  reference shape: `src/main.ts` (bootstrap), `src/app.module.ts`, one subfolder per
  feature module.
- **`tasks/<name>/`** — a short-lived script that runs to completion and exits (a
  cronjob, a one-off job, a migration runner). One folder per task. `tasks/db-migration`
  is the reference shape: flat files (`main.ts` + whatever helpers it needs), its own
  `tsconfig.json`.
- **`src/`** — code shared by more than one service/task (config, logger, database,
  valkey, auth, entities, common). Never duplicate logic between `services/*` or
  `tasks/*` — if two of them need the same thing, it belongs in `src/` and gets
  imported via `#src/*`.

To add a new one:

1. Create the folder under `services/` or `tasks/`, copying the shape of the existing
   reference (`services/api` or `tasks/db-migration`) — same file layout, same import
   style (`#src/*` for shared code, explicit `.js` extensions on relative imports).
2. Register it in `nest-cli.json` under `projects.<name>` (`root`/`sourceRoot` pointing
   at the new folder). A service reuses the shared `tsconfig.build.json`; a task
   typically gets its own `tsconfig.json` (copy `tasks/db-migration/tsconfig.json`) if
   it's a standalone script that doesn't need the shared nodenext/`#src/*` setup —
   use the shared config instead if it does need to import `src/`.
3. Add `nest build <name>` to the `build` script in `package.json` so it's included in
   `npm run build`.
4. If it needs its own way to run/start it locally, add an `npm` script analogous to
   `start`/`start:dev` or `db-migrate`.

## Config & secrets

Every service credential/config group (Postgres, Valkey, auth, and any new one you
add) is loaded through `src/config/secret-config.ts`'s `requireSecretConfig`/
`optionalSecretConfig` — **never** add a new secret that only reads an env var
directly. The rule, uniformly:

1. Try the env var first (a JSON blob, e.g. `POSTGRES_CONFIG`).
2. If unset, and `NODE_ENV` is `staging` or `production`, fetch it from AWS SSM
   Parameter Store at `/${NODE_ENV}/<group>` (a single SecureString holding the same
   JSON shape as the env var — `WithDecryption: true`).
3. Otherwise (env var unset and `NODE_ENV` isn't staging/production — i.e. local dev,
   CI, `test`), it's simply missing: `requireSecretConfig` throws,
   `optionalSecretConfig` returns `null`.

This means a deployment can omit secrets from its env entirely and let the app pull
them from Parameter Store at boot — no AWS access is ever attempted locally or in CI.
`tasks/db-migration/db-config.ts` implements the identical behavior for
`POSTGRES_CONFIG` as a self-contained copy (that task doesn't import `#src/*` — see
"Adding a new service or task" above); keep the two in sync if this pattern changes.
`loadConfiguration()` in `configuration.ts` is `async` for exactly this reason —
`ConfigModule.forRoot`'s `load` factories may return a `Promise`.

`PostgresConfig.readonlyHost` is optional and falls back to `host` when
empty/undefined (`pg.readonlyHost || pg.host`) — never assume it's set.
`database.module.ts`'s `buildTypeOrmOptions` wires it into TypeORM's `replication`
option (SELECTs → `readonlyHost`, everything else → `host`, automatic, no query-level
changes needed). The migration runner ignores it entirely and always connects to
`host` — schema changes must never target a replica.

## Conventions
- PKs: `char(26)` ULID via `generate_ulid()`. snake_case DB ↔ camelCase TS
  (SnakeNamingStrategy). Timestamps `created_at`/`updated_at`/`deleted_at` (soft
  delete). FKs `ON DELETE NO ACTION`.
- Layered: Controller → Service → Repository. DTOs with class-validator. Entities
  centralized in `src/entities/`. `services/api/src/tasks/` is the reference example —
  copy its shape for new resources, then delete it once real domain modules exist.
- Migrations: forward-only raw SQL in `database/migrations/`, applied by
  `tasks/db-migration` before boot. Never edit an applied migration. See the
  **db-migrations** skill.
- Logging: use `CustomLogger` (`src/logger`). Never log secrets/PII. Every log line
  is auto-tagged with the current request id (`src/common/request-context.ts`,
  `AsyncLocalStorage`) when one is available. `LOG_JSON_FORMAT=true` switches output
  to one JSON object per line for log aggregators; default is colored text.
- Auth: protect a route with `@UseGuards(JwtAuthGuard)` from `#src/auth/jwt-auth.guard.js`;
  read the caller's claims with `@CurrentUser()`. Guard fails closed if `AUTH_CONFIG`
  isn't set.
- Never `synchronize: true`. Never hard-delete. Validate all input.

## Commands
- `npm run start:dev` — API in watch mode
- `npm run db-migrate` — apply pending migrations
- `npm run build` · `npm test` · `npm run test:e2e` · `npm run lint` · `npm run type-check`
- `docker compose up -d` — Postgres + Valkey for local dev

## Before calling anything done
Work here is only finished when it's safe, sound, and complete — not merely "written":

- **Safe**: the repo builds, boots, and passes its full test suite after the change.
  Never leave it in a state that wouldn't deploy. Don't leave debug code, commented-out
  blocks, or TODO stand-ins for something that should just be done.
- **Sound**: `npm run build` · `npm run type-check` · `npm run lint` · `npm test` all
  pass with zero errors, every time, for every change — not just at the end of a long
  session. If the change touches anything runtime-reachable (a module, endpoint,
  config path, migration), also run `npm run test:e2e` (needs `docker compose up -d`
  then `npm run db-migrate` first).
- **Complete**: tests exist for new/changed behavior (not just manually verified once
  and left uncovered), and documentation reflects reality — update `README.md`
  (user-facing) and this file (agent-facing conventions) whenever behavior, config,
  commands, or conventions change. An undocumented change is an unfinished change.

If validation surfaces something you're unsure how to resolve, or a gap the
requirements didn't cover, say so and ask rather than papering over it.
