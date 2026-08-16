import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

/** Reads the JWT claims attached by JwtAuthGuard. Only valid on routes it protects. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JWTPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
