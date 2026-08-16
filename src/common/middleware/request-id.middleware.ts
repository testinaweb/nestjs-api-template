import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from '#src/common/request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns an `x-request-id` if the caller didn't send one, echoes it back, and makes
 * it available for the rest of the request (e.g. to CustomLogger) via AsyncLocalStorage.
 * Mounted directly with `app.use()` in main.ts — plain Express middleware, no DI
 * needed, which also sidesteps Express 5's stricter wildcard route matching that
 * NestModule.configure(...).forRoutes('*') runs into.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  requestContextStorage.run({ requestId }, next);
}
