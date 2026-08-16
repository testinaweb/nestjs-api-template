import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * Every service credential/config group in this template must be loadable through
 * this helper: an env var (JSON) first, falling back to AWS SSM Parameter Store at
 * /${NODE_ENV}/<group> (a single SecureString holding the same JSON shape as the env
 * var) when NODE_ENV is "staging" or "production". Locally and in CI, NODE_ENV is
 * neither, so Parameter Store is never touched and no AWS access is required.
 *
 * This lets a deployment omit secrets from its env entirely and pull them from
 * Parameter Store at boot instead — never add a new secret/config group that only
 * reads an env var, use requireSecretConfig/optionalSecretConfig for it too.
 */

const DEPLOYED_NODE_ENVS = new Set(['staging', 'production']);

let ssmClient: SSMClient | undefined;

function getSsmClient(): SSMClient {
  ssmClient ??= new SSMClient({});
  return ssmClient;
}

function parseJson<T>(raw: string, source: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${source} is not valid JSON`);
  }
}

async function fetchFromParameterStore<T>(group: string): Promise<T | null> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (!DEPLOYED_NODE_ENVS.has(nodeEnv)) return null;

  const name = `/${nodeEnv}/${group}`;
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
  if (!value) return null;
  return parseJson<T>(value, `Parameter Store value at ${name}`);
}

async function loadConfigGroup<T>(
  envVarName: string,
  ssmGroup: string,
): Promise<T | null> {
  const raw = process.env[envVarName];
  if (raw) return parseJson<T>(raw, `Env var ${envVarName}`);
  return fetchFromParameterStore<T>(ssmGroup);
}

export async function requireSecretConfig<T>(
  envVarName: string,
  ssmGroup: string,
): Promise<T> {
  const value = await loadConfigGroup<T>(envVarName, ssmGroup);
  if (!value) {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    throw new Error(
      `Missing config: set ${envVarName}, or provision AWS SSM Parameter Store at ` +
        `/${nodeEnv}/${ssmGroup} (only consulted when NODE_ENV is staging or production)`,
    );
  }
  return value;
}

export async function optionalSecretConfig<T>(
  envVarName: string,
  ssmGroup: string,
): Promise<T | null> {
  return loadConfigGroup<T>(envVarName, ssmGroup);
}
