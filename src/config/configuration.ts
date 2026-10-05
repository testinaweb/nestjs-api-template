import { optionalSecretConfig, requireSecretConfig } from './secret-config.js';

export interface PostgresConfig {
  host: string;
  /** Read-replica host for SELECTs. Falls back to `host` when empty/undefined. */
  readonlyHost?: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
}

export interface ValkeyConfig {
  host: string;
  port: number;
  /**
   * Enable TLS (in-transit encryption) for the connection. Required by any
   * ElastiCache for Valkey cluster created with `transitEncryptionEnabled: true` —
   * which includes every **serverless** cache (serverless always encrypts in transit,
   * it can't be turned off) and a provisioned cluster with transit encryption on. Omit/
   * false for a plaintext local/docker Valkey. Defaults to false.
   */
  tls?: boolean;
}

export interface AuthConfig {
  jwksUri: string;
  issuer: string;
  audience?: string;
}

export interface AppConfig {
  appName: string;
  gitSha: string;
  nodeEnv: string;
  port: number;
  corsOrigin: string | true;
  swaggerEnabled: boolean;
  postgres: PostgresConfig;
  valkey: ValkeyConfig;
  auth: AuthConfig | null;
}

export async function loadConfiguration(): Promise<AppConfig> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const [postgres, valkey, auth] = await Promise.all([
    requireSecretConfig<PostgresConfig>('POSTGRES_CONFIG', 'postgres'),
    requireSecretConfig<ValkeyConfig>('VALKEY_CONFIG', 'valkey'),
    optionalSecretConfig<AuthConfig>('AUTH_CONFIG', 'auth'),
  ]);
  return {
    appName: process.env.APP_NAME ?? 'api',
    gitSha: process.env.GIT_SHA ?? 'unknown',
    nodeEnv,
    port: Number(process.env.PORT ?? 3000),
    corsOrigin: process.env.CORS_ORIGIN ?? true,
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
    postgres,
    valkey,
    auth,
  };
}
