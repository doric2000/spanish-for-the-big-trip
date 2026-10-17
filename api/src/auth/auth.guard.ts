import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { SUPABASE } from '../core.module.js';

export interface VerifiedUser {
  userId: string;
}

export type AuthenticatedRequest = Request & { user?: VerifiedUser };

// Runs before the route handler: without a valid Supabase session the request
// never reaches the service or the database.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();

    // Checks the signature and expiry against the project's signing keys.
    const { data, error } = await this.supabase.auth.getClaims(token);
    if (error && isAuthRetryableFetchError(error)) throw new ServiceUnavailableException();
    const claims = data?.claims;
    // Only a signed-in learner: no anonymous session and no service token.
    if (
      !claims ||
      claims.role !== 'authenticated' ||
      ![claims.aud].flat().includes('authenticated') ||
      claims.is_anonymous === true ||
      typeof claims.sub !== 'string'
    ) {
      throw new UnauthorizedException();
    }
    // The user id comes only from the verified token, never from the request body.
    request.user = { userId: claims.sub };
    return true;
  }
}
