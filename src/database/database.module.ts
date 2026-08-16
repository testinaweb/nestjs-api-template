import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import type { PostgresConfig } from '#src/config/configuration.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pg = config.getOrThrow<PostgresConfig>('postgres');
        return {
          type: 'postgres',
          host: pg.host,
          port: pg.port,
          username: pg.username,
          password: pg.password,
          database: pg.database,
          // RDS requires TLS but its default cert chain isn't in Node's trust store,
          // so ssl:true needs rejectUnauthorized:false (mirrors tasks/db-migration's
          // db-config.ts, which talks to the same database over a separate pg client).
          ssl: pg.ssl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: false,
          namingStrategy: new SnakeNamingStrategy(),
          // @nestjs/typeorm retries on boot by default (9 attempts, 3s apart — ~27s
          // total), which isn't quite enough to ride out an RDS Multi-AZ failover
          // (typically 60-120s). Made explicit and extended rather than relying on
          // the library default silently falling short.
          retryAttempts: 20,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
