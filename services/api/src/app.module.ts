import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '#src/config/config.module.js';
import { LoggerModule } from '#src/logger/logger.module.js';
import { DatabaseModule } from '#src/database/database.module.js';
import { ValkeyModule } from '#src/valkey/valkey.module.js';
import { AuthModule } from '#src/auth/auth.module.js';
import { HealthModule } from '#src/health/health.module.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    ValkeyModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    HealthModule,
    TasksModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
