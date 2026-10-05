import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { VALKEY_CLIENT } from '#src/valkey/valkey.constants.js';

/**
 * Hard per-check deadline for `/ready`. Each dependency probe races this: a check that
 * doesn't settle in time is reported `down`, so one stuck dependency can never hang the
 * endpoint (a stalled TCP connect doesn't always surface as a rejection, which is how a
 * slow/unreachable upstream turns `/ready` into an endless hang). `/ready` always answers
 * in ~1s with a per-check breakdown of what's up and what's down.
 */
const CHECK_TIMEOUT_MS = 1_000;

/** A sentinel so a timed-out check is reported as its own failure, not a generic one. */
class CheckTimeoutError extends Error {
  constructor() {
    super(`check timed out after ${CHECK_TIMEOUT_MS}ms`);
    this.name = 'CheckTimeoutError';
  }
}

/**
 * Runs `probe` with a hard wall-clock deadline. Resolves `'up'` only if the probe resolves
 * before the deadline; a rejection OR a timeout resolves `'down'`. Never rejects, so the
 * caller never has to guard it. The timer is always cleared so no handle is left dangling.
 */
async function checkWithTimeout(
  probe: () => Promise<unknown>,
): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckTimeoutError()), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(), deadline]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  async ready(@Res({ passthrough: true }) res: Response) {
    // Every check races the same 1s deadline and runs in parallel, so /ready always
    // answers in ~1s and the `checks` map says exactly which dependency is down. The
    // Valkey ping also treats a non-PONG reply as down.
    const [database, valkey] = await Promise.all([
      checkWithTimeout(() => this.dataSource.query('SELECT 1')),
      checkWithTimeout(async () => {
        const pong = await this.valkey.ping();
        if (pong !== 'PONG')
          throw new Error(`unexpected ping reply: ${String(pong)}`);
      }),
    ]);
    const checks = { database, valkey };
    const ok = Object.values(checks).every((s) => s === 'up');
    // Return the breakdown as a normal body (not a thrown exception) so the global
    // AllExceptionsFilter — which flattens every error to {statusCode,error,message} —
    // can't discard `checks`. The 503 status still signals "degraded" to the LB.
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', checks };
  }
}
