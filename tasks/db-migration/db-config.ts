import type { ClientConfig } from 'pg';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * Same env-var-then-Parameter-Store fallback as src/config/secret-config.ts. Kept as
 * a separate, minimal copy here because this task is intentionally standalone (see
 * AGENTS.md) rather than importing #src/*. Keep the two in sync if this ever changes.
 */
const DEPLOYED_NODE_ENVS = new Set(['staging', 'production']);

let ssmClient: SSMClient | undefined;

function getSsmClient(): SSMClient {
  if (!ssmClient) ssmClient = new SSMClient({});
  return ssmClient;
}

async function readPostgresConfigJson(): Promise<string> {
  const raw = process.env.POSTGRES_CONFIG;
  if (raw) return raw;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (!DEPLOYED_NODE_ENVS.has(nodeEnv)) {
    throw new Error('POSTGRES_CONFIG environment variable is required.');
  }

  const name = `/${nodeEnv}/postgres`;
  let value: string | undefined;
  try {
    const response = await getSsmClient().send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    value = response.Parameter?.Value;
  } catch (error) {
    throw new Error(`Failed to read Parameter Store value at ${name}`, {
      cause: error,
    });
  }
  if (!value) {
    throw new Error(
      `POSTGRES_CONFIG is unset and no value was found at Parameter Store ${name}`,
    );
  }
  return value;
}

/**
 * Build a Postgres ClientConfig from POSTGRES_CONFIG — an env var if set, otherwise
 * AWS SSM Parameter Store at /${NODE_ENV}/postgres when NODE_ENV is staging/production.
 * Either source must contain a JSON object, for example:
 * {"host":"localhost","port":5432,"username":"postgres","password":"pw","database":"app","ssl":false}
 */
export async function getDbConfig(): Promise<ClientConfig> {
  const raw = await readPostgresConfigJson();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `POSTGRES_CONFIG is not valid JSON: ${(error as Error).message}`,
      {
        cause: error,
      },
    );
  }

  const config: ClientConfig = {
    host: (parsed.host as string) ?? 'localhost',
    port: (parsed.port as number) ?? 5432,
    user: (parsed.username as string) ?? 'postgres',
    password: (parsed.password as string) ?? '',
    database: (parsed.database as string) ?? 'app',
  };

  if (parsed.ssl !== undefined) {
    config.ssl =
      parsed.ssl === true
        ? { rejectUnauthorized: false }
        : (parsed.ssl as ClientConfig['ssl']);
  }

  return config;
}
