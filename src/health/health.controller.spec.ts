import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const values: Record<string, string> = {
    appName: 'test-api',
    gitSha: 'abc1234',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  function makeController(
    dataSource: Partial<DataSource>,
    valkey: Partial<Redis>,
  ): HealthController {
    return new HealthController(
      dataSource as DataSource,
      config,
      valkey as Redis,
    );
  }

  it('hello() returns the configured app name and commit sha', () => {
    const controller = makeController({}, {});
    expect(controller.hello()).toEqual({
      name: 'test-api',
      status: 'ok',
      commitSha: 'abc1234',
    });
  });

  it('health() always returns ok', () => {
    const controller = makeController({}, {});
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('ready() returns ok when both dependencies respond', async () => {
    const controller = makeController(
      { query: jest.fn().mockResolvedValue([]) },
      { ping: jest.fn().mockResolvedValue('PONG') },
    );
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', valkey: 'up' },
    });
  });

  it('ready() throws 503 when a dependency is unreachable', async () => {
    const controller = makeController(
      { query: jest.fn().mockRejectedValue(new Error('connection refused')) },
      { ping: jest.fn().mockResolvedValue('PONG') },
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
