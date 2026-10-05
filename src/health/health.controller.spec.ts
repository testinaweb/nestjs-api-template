import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
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

  /** A minimal Express Response stub that records the status set by the handler. */
  function makeRes(): Response & { statusCode: number } {
    const res = {
      statusCode: HttpStatus.OK,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
    };
    return res as unknown as Response & { statusCode: number };
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

  it('ready() returns 200 ok when both dependencies respond', async () => {
    const controller = makeController(
      { query: jest.fn().mockResolvedValue([]) },
      { ping: jest.fn().mockResolvedValue('PONG') },
    );
    const res = makeRes();
    await expect(controller.ready(res)).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', valkey: 'up' },
    });
    expect(res.statusCode).toBe(HttpStatus.OK);
  });

  it('ready() returns 503 degraded when a dependency rejects', async () => {
    const controller = makeController(
      { query: jest.fn().mockRejectedValue(new Error('connection refused')) },
      { ping: jest.fn().mockResolvedValue('PONG') },
    );
    const res = makeRes();
    await expect(controller.ready(res)).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down', valkey: 'up' },
    });
    expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('ready() reports a non-PONG valkey reply as down', async () => {
    const controller = makeController(
      { query: jest.fn().mockResolvedValue([]) },
      { ping: jest.fn().mockResolvedValue('nope') },
    );
    const res = makeRes();
    await expect(controller.ready(res)).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'up', valkey: 'down' },
    });
    expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('ready() reports a hanging dependency as down instead of hanging', async () => {
    jest.useFakeTimers();
    try {
      const controller = makeController(
        // A probe that never settles — the pre-fix bug that hung /ready forever.
        { query: jest.fn().mockReturnValue(new Promise(() => {})) },
        { ping: jest.fn().mockResolvedValue('PONG') },
      );
      const res = makeRes();
      const pending = controller.ready(res);
      // Advance past the per-check deadline so the stuck probe loses its race.
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toEqual({
        status: 'degraded',
        checks: { database: 'down', valkey: 'up' },
      });
      expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    } finally {
      jest.useRealTimers();
    }
  });
});
