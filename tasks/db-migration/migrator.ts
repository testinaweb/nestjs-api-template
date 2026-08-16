import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal subset of the pg client surface the migrator depends on.
 * Keeping it narrow lets tests supply a lightweight mock.
 */
export interface QueryableClient {
  query<Row = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name       text        PRIMARY KEY,
  checksum   text        NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

export function readMigrationFiles(directory: string): MigrationFile[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(directory, name), 'utf8');
      return { name, sql, checksum: checksumOf(sql) };
    });
}

export async function ensureMigrationsTable(
  client: QueryableClient,
): Promise<void> {
  await client.query(CREATE_MIGRATIONS_TABLE);
}

export async function fetchAppliedChecksums(
  client: QueryableClient,
): Promise<Map<string, string>> {
  const result = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

export function assertNoModifiedMigrations(
  files: MigrationFile[],
  applied: Map<string, string>,
): void {
  for (const file of files) {
    const appliedChecksum = applied.get(file.name);
    if (appliedChecksum !== undefined && appliedChecksum !== file.checksum) {
      throw new Error(
        `Migration '${file.name}' was modified after it was applied (checksum mismatch). ` +
          'Applied migrations are immutable — create a new migration instead.',
      );
    }
  }
}

export function pendingMigrations(
  files: MigrationFile[],
  applied: Map<string, string>,
): MigrationFile[] {
  return files.filter((file) => !applied.has(file.name));
}

/**
 * Apply every pending migration inside a single transaction. Either all
 * pending migrations commit together, or none of them are applied.
 */
export async function applyMigrationsInTransaction(
  client: QueryableClient,
  pending: MigrationFile[],
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const file of pending) {
      await client.query(file.sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [file.name, file.checksum],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Run all pending migrations found in `directory` against `client`.
 * Returns the number of migrations applied.
 */
export async function migrate(
  client: QueryableClient,
  directory: string,
): Promise<number> {
  const files = readMigrationFiles(directory);
  await ensureMigrationsTable(client);
  const applied = await fetchAppliedChecksums(client);
  assertNoModifiedMigrations(files, applied);

  const pending = pendingMigrations(files, applied);
  if (pending.length > 0) {
    await applyMigrationsInTransaction(client, pending);
  }
  return pending.length;
}
