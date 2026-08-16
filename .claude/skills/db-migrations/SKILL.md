---
name: db-migrations
description: Use when creating, editing, applying, or reviewing PostgreSQL database migrations for LeapMap API. Explains the automated, transactional migration runner, the schema_migrations tracking table, seed conventions, and how migrations run per environment.
when_to_use: |
  Trigger when: adding a schema change (new table/column/index/constraint), changing the DB schema, adding or updating seed data, asking "how do migrations work", "how do I add a migration", "why didn't my migration run", debugging a failed migration, editing files under database/, or touching tasks/db-migration.
---

# Database Migrations

LeapMap applies schema changes with an automated, transactional migration runner
(`tasks/db-migration`) that runs **before** the API starts in staging and
production. Locally you run it on demand.

## Layout

```
database/
  bootstrap/001-extensions.sql   # pgcrypto + vector + generate_ulid() (bootstrap only)
  migrations/                    # incremental, forward-only migrations run by the runner
tasks/db-migration/
  main.ts                        # entrypoint: connect → migrate → disconnect
  migrator.ts                    # runner logic (tested)
  db-config.ts                   # POSTGRES_CONFIG → pg ClientConfig
```

## Core rules

1. **Bootstrap vs migrations are separate.**
   `bootstrap/001-extensions.sql` initializes a brand-new empty database (docker-compose
   init scripts locally; provisioning in staging/prod). The runner never applies it —
   it only applies files in `database/migrations/`.
2. **Migrations are forward-only.** There are no down/rollback files. To revert
   a change, write a new migration.
3. **Applied migrations are immutable.** The runner stores a sha256 checksum per
   migration; editing an already-applied file makes the runner fail. Never edit
   a migration that has shipped — add a new one.
4. **One batch, one transaction.** All pending migrations run inside a single
   transaction. If any statement fails, the whole batch rolls back and the
   process exits non-zero, so the API never starts against a half-migrated DB.
5. **Do not use non-transactional statements** (e.g. `CREATE INDEX CONCURRENTLY`,
   `VACUUM`, `ALTER SYSTEM`). They cannot run inside the batch transaction.
6. **`POSTGRES_CONFIG` is the only DB config.** Never reintroduce `DATABASE_*`
   env vars.

## Adding a migration

1. Create `database/migrations/<YYYYMMDDHHMMSS>-<short-description>.sql`
   (UTC timestamp prefix; files run in lexical order).
2. Write plain SQL — no wrapping `BEGIN`/`COMMIT` (the runner manages the
   transaction). `DO $$ ... $$` PL/pgSQL blocks are fine.
3. Prefer idempotent DDL where reasonable (`IF NOT EXISTS`, `IF EXISTS`) so the
   file is safe to reason about, though the checksum guard already prevents
   re-running an applied file.
4. Follow repo schema conventions: `snake_case`, ULID `char(26)` primary
   keys via `generate_ulid()`, `created_at`/`updated_at`/`deleted_at`
   timestamps, foreign keys `on delete no action`, soft deletes.

Example:

```sql
-- database/migrations/20260801120000-add-branch-timezone.sql
ALTER TABLE branches
    ADD COLUMN IF NOT EXISTS timezone varchar(50) NOT NULL DEFAULT 'UTC';
```

## Running

| Context            | How                                                              |
| ------------------ | --------------------------------------------------------------- |
| Local, once        | `npm run db-migrate`                                             |
| Local, dev + watch | `npm run start:dev:with-migration`                              |
| Docker             | Container `CMD` runs the runner, then the API (fails fast)      |

The runner resolves migrations from `database/migrations` relative to the
current working directory; the `database/` folder is copied into the production
image for this reason.

## The tracking table

```sql
CREATE TABLE schema_migrations (
  name       text        PRIMARY KEY,  -- migration file name
  checksum   text        NOT NULL,     -- sha256 of the file contents
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

On an existing database the runner just creates this table (empty) and applies
whatever is not yet recorded. Because the historical migrations were folded into
`bootstrap/001-extensions.sql`, existing environments start with an empty
`migrations/` folder and nothing re-runs.

## Tests

Runner logic is covered in `tasks/db-migration/*.spec.ts`. Keep them green when
changing the runner.
