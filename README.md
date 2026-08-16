# nestjs-api-template

A reusable NestJS API boilerplate for server-to-server backends: Postgres + TypeORM,
Valkey, structured logging, security defaults, JWT/JWKS auth, Swagger docs, tests, and
CI/CD wired up out of the box. Fork or clone it, run the renaming checklist below, and
start building.

Agent-facing conventions live in [`AGENTS.md`](AGENTS.md) (Claude Code reads it via the
`CLAUDE.md` symlink) — including the strict `services/`/`tasks/`/`src/` folder
convention every new service or cronjob must follow.

## Stack

- Node 24, TypeScript 6, NestJS 11 (monorepo mode)
- PostgreSQL (`pgvector/pgvector` image) + TypeORM (`synchronize: false`, migrations only)
- Valkey (Redis-compatible), available for caching/queues
- Auth: JWT bearer guard verified against a remote JWKS endpoint — works with AWS
  Cognito, Auth0, or any OIDC-ish issuer
- Swagger/OpenAPI docs at `/docs`
- Jest (unit + e2e), Docker + docker compose, GitHub Actions CI + CD — both on ARM64
  runners, so the built image is arm64 (see [CI / CD](#ci--cd))

## Quickstart

Node version is pinned two ways, kept in sync — [Volta](https://volta.sh) via the
`volta` field in `package.json` (auto-switches to the right `node`/`npm` when you `cd`
into the repo, no separate command) and `.nvmrc` for `nvm`. Use whichever you already
have installed; re-pin both (`volta pin node@<version> npm@<version>` + update
`.nvmrc`) together if the version ever changes.

```bash
cp .env.example .env
docker compose up -d        # Postgres + Valkey
npm install
npm run db-migrate          # applies database/migrations
npm run start:dev
```

Then:

- `GET http://localhost:3000/` — app name, status, and the deployed commit SHA
- `GET http://localhost:3000/health` — liveness
- `GET http://localhost:3000/ready` — readiness (checks DB + Valkey, 503 if degraded)
- `http://localhost:3000/docs` — Swagger UI
- `http://localhost:3000/tasks` — example CRUD resource

## Project layout

```
src/                        # shared code, imported via the #src/* subpath
  auth/                     # JwtAuthGuard + @CurrentUser()
  common/                   # exception filter, request-id middleware
  config/                   # env parsing (POSTGRES_CONFIG, AUTH_CONFIG, ...)
  database/                 # TypeORM module
  entities/                 # ALL TypeORM entities (centralized)
  health/                   # liveness/readiness — reusable across services
  logger/                   # CustomLogger
  valkey/                   # ioredis client
services/                   # one folder per long-running app (services/*, via #services/*)
  api/src/                  #   the HTTP API: main.ts, bootstrap.ts, app.module.ts
    tasks/                  #   example CRUD resource — see below
tasks/                      # one folder per short-lived script/cronjob
  db-migration/             #   forward-only migration runner, run before boot
database/
  bootstrap/                # fresh-DB SQL (extensions, generate_ulid()) — not a migration
  migrations/                # forward-only migrations, applied by tasks/db-migration
test/                        # e2e specs (jest-e2e.json)
.github/workflows/ci.yml     # every PR: lint, type-check, build, unit + e2e tests
.github/workflows/cd.yml     # every push to main: build + push the Docker image to ECR
```

**Adding a new service or cronjob**: always mirror `services/api` (for a new
long-running service) or `tasks/db-migration` (for a new short-lived task) — same file
shape, register it in `nest-cli.json`, add it to the `build` script. This is a strict
convention documented in full in `AGENTS.md` so both humans and coding agents keep the
codebase consistent as it grows. Anything shared by more than one service/task belongs
in `src/`, never duplicated.

Conventions (PKs, naming, layering, migrations) are documented in `AGENTS.md` — read
that before adding a feature.

## Auth

`JwtAuthGuard` (`src/auth/jwt-auth.guard.ts`) verifies `Authorization: Bearer <token>`
against a JWKS endpoint using [`jose`](https://github.com/panva/jose). It's unused
until you set `AUTH_CONFIG` — with no config it fails closed (every route it protects
returns 401). Protect a route with:

```ts
@UseGuards(JwtAuthGuard)
@Get('me')
me(@CurrentUser() user: JWTPayload) { ... }
```

`AUTH_CONFIG` is a JSON env var: `{"jwksUri": "...", "issuer": "...", "audience": "..."}`.

**AWS Cognito** (the default for future projects): point `jwksUri` at
`https://cognito-idp.<region>.amazonaws.com/<user-pool-id>/.well-known/jwks.json`,
`issuer` at `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>`, and
`audience` at the app client ID. No code changes needed — Cognito issues standard
RS256 JWTs with a hosted JWKS. See `.env.example` for both a generic and a Cognito
example.

## The `tasks` example resource

`services/api/src/tasks/` + `src/entities/task.entity.ts` is a full example of the
Controller → Service → Repository layering with DTOs, class-validator, Swagger
decorators, and one guarded route. It exists to be copied for your first real
resource — then deleted, along with its migration
(`database/migrations/20260816120000-create-tasks.sql`) and specs, once you don't need
it anymore.

## Config & secrets

Every config group (`POSTGRES_CONFIG`, `VALKEY_CONFIG`, `AUTH_CONFIG`, and any new one
you add) resolves the same way, via `src/config/secret-config.ts`:

1. **Env var first** — if set, it's used as-is (a JSON blob, same shape either way).
2. **AWS SSM Parameter Store fallback** — if unset *and* `NODE_ENV` is `staging` or
   `production`, the value is fetched from Parameter Store at `/${NODE_ENV}/<group>`
   (e.g. `/production/postgres`) — a single SecureString holding the same JSON shape
   as the env var, decrypted on read.
3. **Anywhere else** (local dev, CI, `NODE_ENV=test`) — Parameter Store is never
   touched. A missing required group throws at boot; an optional one (`AUTH_CONFIG`)
   is simply unset.

This means you can deploy without putting secrets in the environment at all — leave
`POSTGRES_CONFIG`/etc. unset in the ECS task definition and provision
`/staging/postgres`, `/production/postgres`, `/staging/valkey`, `/production/auth`,
etc. in Parameter Store instead. Both the API (`requireSecretConfig`/
`optionalSecretConfig`) and `tasks/db-migration/db-config.ts` (a self-contained copy,
since that task doesn't import `#src/*`) implement this identically — see `AGENTS.md`
for the full rule any new secret must follow.

**Deploy-time IAM**: whatever runtime role runs the container (e.g. an ECS task role —
distinct from the GitHub Actions CD role, which only needs ECR push) needs
`ssm:GetParameter` on the parameters it reads, plus `kms:Decrypt` if they're
SecureString with a customer-managed KMS key.

**Postgres SSL**: `POSTGRES_CONFIG`'s `ssl` field must be `false` for local/docker
Postgres and `true` against AWS RDS — RDS requires TLS, but its certificate chain isn't
in Node's default trust store, so the app maps `ssl:true` to
`{ rejectUnauthorized: false }` (same place in both implementations above).

## Logging

`CustomLogger` (`src/logger/custom-logger.service.ts`) is the app-wide logger. Two
things worth knowing:

- **Every log line is tagged with the request that triggered it** — `requestIdMiddleware`
  stores the `x-request-id` in an `AsyncLocalStorage` (`src/common/request-context.ts`)
  that any code downstream of it (controllers, services, TypeORM queries) can read via
  `getRequestId()`, and `CustomLogger` includes it automatically. Grep a request's id
  across every line it touched, in either output mode below.
- **`LOG_JSON_FORMAT=true`** switches from colored text to one JSON object per line
  (`{timestamp, level, pid, context, requestId, message}`) — turn it on wherever logs
  get shipped to an aggregator (CloudWatch Logs Insights, etc.); leave it off for
  readable local dev output. Default is off.

## Health checks

`HealthController` (`src/health/`) hand-rolls `/health` (liveness) and `/ready`
(readiness — pings Postgres + Valkey, 503 if either is down) rather than using
[`@nestjs/terminus`](https://docs.nestjs.com/recipes/terminus), Nest's official health
module. That's a deliberate call for now: Terminus's main value is
`HealthIndicator` building blocks (`TypeOrmHealthIndicator`, disk/memory checks, HTTP
ping) once you're checking several dependencies — for 2 checks, hand-rolling is
simpler and has no extra dependency. **Revisit this once health checks grow** (a third
datastore, an external API dependency, disk/memory thresholds) — that's the point
where Terminus's indicators start paying for themselves over more hand-written
try/catch blocks.

## Testing

```bash
npm test          # unit specs (mocked repositories/deps, no DB needed)
npm run test:e2e  # e2e specs (needs docker compose up -d + npm run db-migrate)
```

`test/health.e2e-spec.ts` and `test/tasks.e2e-spec.ts` boot the real `AppModule`
against a live Postgres/Valkey. The authenticated write path isn't exercised in e2e
(it needs a real JWKS issuer) — `tasks.service.spec.ts` covers that logic as a unit
test instead.

## CI / CD

Two separate workflows, deliberately split:

- **`.github/workflows/ci.yml`** — runs on every PR: `lint` → `type-check` → `build` →
  unit `test` → apply bootstrap SQL → `db-migrate` → `test:e2e`, against real Postgres +
  Valkey service containers. No Docker image is built here — this workflow only gates
  correctness.
- **`.github/workflows/cd.yml`** — runs on every push to `main`/`develop`. Builds the
  Docker image, embedding the commit SHA via `--build-arg GIT_SHA` (baked in as the
  `GIT_SHA` env var, surfaced at runtime by `GET /`), and pushes it to AWS ECR tagged
  `:<environment>-<timestamp>` (`production-...` from `main`, `staging-...` from
  `develop`) and `:latest`. It does **not** re-run tests — CI already gated the PR that
  got merged. It does not deploy anywhere; actual deployment (ECS, App Runner, etc.) is
  project-specific and left as a follow-up once you know your target infra.

**Both workflows run on `ubuntu-24.04-arm` (ARM64) GitHub-hosted runners.** This means
the CD-built Docker image is a native **arm64** image — `docker build` isn't
cross-compiling, it's compiling for the runner's own architecture, and `node:24-alpine`
resolves to its arm64 variant automatically. Whatever runs this image (ECS task
definition, EC2 instance, Fargate service, App Runner, etc.) **must be configured for
ARM64/Graviton**, or the container will fail to start with an `exec format error`. If
you need an x86_64 image instead, either change `runs-on` to `ubuntu-latest` in both
workflows, or build multi-arch with `docker buildx build --platform linux/amd64,linux/arm64`.

**CD prerequisites** (configure once per real project, not needed to run CI/tests
locally):

- An ECR repository already created in your AWS account.
- An IAM role with an OIDC trust policy for `token.actions.githubusercontent.com`
  (scoped to this repo) and push permissions on that ECR repository — no long-lived
  AWS keys are stored in GitHub.
- Repo secrets/variables: `AWS_ROLE_ARN` (secret), `AWS_REGION` (variable),
  `ECR_REPOSITORY` (variable, the repository name).

`.github/dependabot.yml` opens weekly PRs for npm, GitHub Actions, and Docker base
image updates (`@nestjs/*` and `@types/*` grouped into single PRs to cut down on
noise) — CI runs against every one before you merge.

## Using this as a template for a new project

1. `package.json`: rename `name`, reset `version`.
2. `docker-compose.yml` / `.env(.example)`: change the Postgres user/db name if you
   want something more specific than `app`.
3. Set `APP_NAME` in `.env` instead of hunting through code — it's what `GET /`
   returns and what titles the Swagger docs.
4. Delete `services/api/src/tasks/`, `src/entities/task.entity.ts`, and
   `database/migrations/20260816120000-create-tasks.sql` once you've copied the
   pattern for your real resources.
5. Configure `AUTH_CONFIG` for your actual issuer, or delete `src/auth/` if the
   project doesn't need auth.
6. Set up the CD prerequisites above (ECR repo, OIDC role, secrets/vars) once you know
   the target AWS account — or delete `.github/workflows/cd.yml` if this project won't
   deploy from GitHub Actions. Confirm your deploy target runs on ARM64/Graviton
   (default here) — switch both workflows off `ubuntu-24.04-arm` first if it doesn't.
7. Update this README and `AGENTS.md`'s "What this is" section to describe the actual
   project.

## Code quality skills

`.claude/skills/` includes a Clean Code pack (`boy-scout` + `clean-comments`/
`clean-functions`/`clean-general`/`clean-names`/`clean-tests`), Jest best practices
(`javascript-typescript-jest`), and PostgreSQL guidance (`postgresql-code-review`,
`postgresql-optimization`) — Claude Code picks these up automatically while writing or
reviewing code in this repo.

## Known issues

`npm audit` reports 2 high-severity findings, both the same root cause: `js-yaml`
(pulled in transitively by `@nestjs/swagger` for an OpenAPI YAML export feature this
template never calls — `SwaggerModule.setup()` only serves the JSON spec). No release
of `@nestjs/swagger` currently resolves to a clean `js-yaml` — `npm audit fix --force`
just swaps between two vulnerable ranges. Real-world risk is low (no code path here
parses untrusted YAML), but Dependabot will open a PR the moment an upstream fix lands.

## Licensing

This template ships under the [MIT License](LICENSE) — reuse it freely. When a
project built from this boilerplate becomes a real product/SaaS that shouldn't be
open source, see [`LICENSE-PROPRIETARY.example.md`](LICENSE-PROPRIETARY.example.md)
for the swap procedure (replace `LICENSE`, update `package.json`'s `license` field).
