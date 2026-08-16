import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { VALKEY_CLIENT } from '#src/valkey/valkey.constants.js';

@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(VALKEY_CLIENT) private readonly valkey: Redis,
  ) {}

  @Get()
  hello() {
    return {
      name: this.config.getOrThrow<string>('appName'),
      status: 'ok',
      commitSha: this.config.getOrThrow<string>('gitSha'),
    };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, 'up' | 'down'> = {
      database: 'down',
      valkey: 'down',
    };
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'up';
    } catch {
      // down
    }
    try {
      const pong = await this.valkey.ping();
      checks.valkey = pong === 'PONG' ? 'up' : 'down';
    } catch {
      // down
    }
    const ok = Object.values(checks).every((s) => s === 'up');
    if (!ok) {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }
    return { status: 'ok', checks };
  }
}
