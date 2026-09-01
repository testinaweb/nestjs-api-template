import { resolve } from 'node:path';
import { Client } from 'pg';
import { getDbConfig } from './db-config';
import { migrate, runBootstrap } from './migrator';

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), 'database', 'migrations');
const BOOTSTRAP_DIRECTORY = resolve(process.cwd(), 'database', 'bootstrap');

async function main(): Promise<void> {
  const client = new Client(await getDbConfig());
  await client.connect();

  try {
    // Bootstrap first — creates extensions and functions (e.g. generate_ulid())
    // that migrations depend on. Idempotent and re-run on every deploy.
    const bootstrapCount = await runBootstrap(client, BOOTSTRAP_DIRECTORY);
    if (bootstrapCount > 0) {
      console.log(`Ran ${bootstrapCount} bootstrap script(s).`);
    }

    const appliedCount = await migrate(client, MIGRATIONS_DIRECTORY);
    console.log(
      appliedCount === 0
        ? 'No pending migrations.'
        : `Applied ${appliedCount} migration(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed:', error);
  process.exit(1);
});
