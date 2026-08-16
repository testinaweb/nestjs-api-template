import { optionalSecretConfig, requireSecretConfig } from './secret-config.js';

export interface PostgresConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
}

export interface ValkeyConfig {
  host: string;
  port: number;
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
