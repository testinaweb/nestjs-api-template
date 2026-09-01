import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import type { PostgresConfig } from '#src/config/configuration.js';

// RDS requires TLS but its default cert chain isn't in Node's trust store, so
// ssl:true needs rejectUnauthorized:false (mirrors tasks/db-migration's db-config.ts,
// which talks to the same database over a separate pg client).
function toPgSsl(ssl: boolean): false | { rejectUnauthorized: false } {
  return ssl ? { rejectUnauthorized: false } : false;
}

/**
 * Builds TypeORM's master/slave replication config from PostgresConfig. TypeORM
 * routes plain SELECTs to a slave pool and everything else (writes, transactions) to
 * the master automatically — no query-level plumbing needed elsewhere.
 *
 * `readonlyHost` is optional: empty/undefined falls back to `host`, so this is a
 * no-op (reads and writes hit the same instance) until a real read replica exists.
 */
export function buildTypeOrmOptions(pg: PostgresConfig) {
  const credentials = {
    port: pg.port,
    username: pg.username,
    password: pg.password,
    database: pg.database,
    ssl: toPgSsl(pg.ssl),
  };
  const readonlyHost = pg.readonlyHost || pg.host;

  return {
    type: 'postgres',
    replication: {
      master: { host: pg.host, ...credentials },
      slaves: [{ host: readonlyHost, ...credentials }],
    },
    autoLoadEntities: true,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    // @nestjs/typeorm retries on boot by default (9 attempts, 3s apart — ~27s
    // total), which isn't quite enough to ride out an RDS Multi-AZ failover
    // (typically 60-120s). Made explicit and extended rather than relying on
    // the library default silently falling short.
    retryAttempts: 20,
    retryDelay: 3000,
  } satisfies TypeOrmModuleOptions;
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions(config.getOrThrow<PostgresConfig>('postgres')),
    }),
  ],
})
export class DatabaseModule {}
