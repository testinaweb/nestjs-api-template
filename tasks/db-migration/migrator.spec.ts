import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap, type QueryableClient } from './migrator';

function createMockClient(): {
  client: QueryableClient;
  queries: string[];
} {
  const queries: string[] = [];
  const client: QueryableClient = {
    query: async <Row = unknown>(text: string) => {
      queries.push(text);
      return { rows: [] as Row[] };
    },
  };
  return { client, queries };
}

describe('runBootstrap', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bootstrap-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 0 when the directory does not exist', async () => {
    const { client, queries } = createMockClient();
    const count = await runBootstrap(client, join(dir, 'does-not-exist'));
    expect(count).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it('returns 0 when the directory has no .sql files', async () => {
    writeFileSync(join(dir, 'README.md'), '# not sql');
    const { client, queries } = createMockClient();
    const count = await runBootstrap(client, dir);
    expect(count).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it('executes every .sql file in sorted order', async () => {
    // Written out of order to prove sorting is applied.
    writeFileSync(join(dir, '002-functions.sql'), 'CREATE FUNCTION b();');
    writeFileSync(join(dir, '001-extensions.sql'), 'CREATE EXTENSION a;');
    writeFileSync(join(dir, 'ignore.txt'), 'not executed');

    const { client, queries } = createMockClient();
    const count = await runBootstrap(client, dir);

    expect(count).toBe(2);
    expect(queries).toEqual(['CREATE EXTENSION a;', 'CREATE FUNCTION b();']);
  });

  it('propagates errors from the client (fails the deploy)', async () => {
    writeFileSync(join(dir, '001-extensions.sql'), 'BROKEN SQL');
    const client: QueryableClient = {
      query: async () => {
        throw new Error('syntax error');
      },
    };
    await expect(runBootstrap(client, dir)).rejects.toThrow('syntax error');
  });
});
