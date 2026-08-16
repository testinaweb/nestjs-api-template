import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ValkeyConfig } from '#src/config/configuration.js';
import { VALKEY_CLIENT } from './valkey.constants.js';

type ShutdownAwareRedis = Redis & OnApplicationShutdown;

@Global()
@Module({
  providers: [
    {
      provide: VALKEY_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const v = config.getOrThrow<ValkeyConfig>('valkey');
        const client: ShutdownAwareRedis = Object.assign(
          new Redis({
            host: v.host,
            port: v.port,
            lazyConnect: false,
            maxRetriesPerRequest: null,
          }),
          {
            // Nest calls this on any provider instance that defines it, so the
            // connection closes cleanly on app.close()/shutdown signals.
            onApplicationShutdown: async (): Promise<void> => {
              await client.quit();
            },
          },
        );
        return client;
      },
    },
  ],
  exports: [VALKEY_CLIENT],
})
export class ValkeyModule {}
