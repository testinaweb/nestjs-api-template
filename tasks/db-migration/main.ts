import { resolve } from 'node:path';
import { Client } from 'pg';
import { getDbConfig } from './db-config';
import { migrate } from './migrator';

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), 'database', 'migrations');

async function main(): Promise<void> {
  const client = new Client(await getDbConfig());
  await client.connect();

  try {
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
