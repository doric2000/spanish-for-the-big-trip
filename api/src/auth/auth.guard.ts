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

// The product allows only these sign-in providers (AGENTS.md, Product boundaries).
export const SIGN_IN_PROVIDERS = ['google', 'apple'] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export interface VerifiedUser {
  userId: string;
  provider: SignInProvider;
}

function signInProvider(appMetadata: unknown): SignInProvider | null {
  const provider = (appMetadata as { provider?: unknown } | undefined)?.provider;
  return SIGN_IN_PROVIDERS.find((p) => p === provider) ?? null;
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
    // app_metadata is set by Supabase Auth, not by the user, so it is part of the
    // verified token. Any provider other than Google or Apple is refused.
    const provider = signInProvider(claims.app_metadata);
    if (!provider) throw new UnauthorizedException();
    // The user id comes only from the verified token, never from the request body.
    request.user = { userId: claims.sub, provider };
    return true;
  }
}
