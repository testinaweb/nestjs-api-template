import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import type { Request } from 'express';
import type { AuthConfig } from '#src/config/configuration.js';

export interface AuthenticatedRequest extends Request {
  user: JWTPayload;
}

/**
 * Verifies `Authorization: Bearer <token>` against a remote JWKS endpoint.
 * Works with AWS Cognito, Auth0, or any OIDC-ish issuer — point AUTH_CONFIG at its
 * JWKS URI. Fails closed: with no AUTH_CONFIG, every protected route rejects.
 *
 * `jose` is ESM-only; it's loaded via dynamic import() rather than a static import
 * so this module stays loadable under Jest's CJS test runner too, not just Node.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth = this.config.get<AuthConfig | null>('auth');
    if (!auth) {
      throw new UnauthorizedException('Authentication is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    this.jwks ??= createRemoteJWKSet(new URL(auth.jwksUri));

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: auth.issuer,
        audience: auth.audience,
      });
      (request as AuthenticatedRequest).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim() || undefined;
  }
}
