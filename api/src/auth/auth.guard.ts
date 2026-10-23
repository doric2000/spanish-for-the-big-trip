import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
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
  private readonly logger = new Logger('Auth');

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  // Says why a request was refused, so a 401 can be diagnosed from the server log.
  // Only the reason and non-secret claim values: never the token or the user id.
  private refuse(reason: string): never {
    this.logger.warn(`401: ${reason}`);
    throw new UnauthorizedException();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) this.refuse('no Bearer token');

    // Checks the signature and expiry against the project's signing keys.
    const { data, error } = await this.supabase.auth.getClaims(token);
    if (error && isAuthRetryableFetchError(error)) throw new ServiceUnavailableException();
    const claims = data?.claims;
    if (!claims) this.refuse('token did not verify');
    // Only a signed-in learner: no anonymous session and no service token.
    if (
      claims.role !== 'authenticated' ||
      ![claims.aud].flat().includes('authenticated') ||
      claims.is_anonymous === true ||
      typeof claims.sub !== 'string'
    ) {
      this.refuse(`not a signed-in learner (role ${String(claims.role)}, anonymous ${String(claims.is_anonymous)})`);
    }
    // app_metadata is set by Supabase Auth, not by the user, so it is part of the
    // verified token. Any provider other than Google or Apple is refused.
    const provider = signInProvider(claims.app_metadata);
    if (!provider) {
      const metadata = claims.app_metadata as { provider?: unknown; providers?: unknown } | undefined;
      this.refuse(`sign-in provider not allowed (provider ${JSON.stringify(metadata?.provider ?? null)}, providers ${JSON.stringify(metadata?.providers ?? null)}, app_metadata ${metadata ? 'present' : 'missing'})`);
    }
    // The user id comes only from the verified token, never from the request body.
    request.user = { userId: claims.sub, provider };
    return true;
  }
}
