import { type ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const learner = { sub: USER_ID, role: 'authenticated', aud: 'authenticated', is_anonymous: false };

function guardFor(claims: object | null) {
  const supabase = { auth: { getClaims: () => Promise.resolve(claims ? { data: { claims }, error: null } : { data: null, error: new Error('invalid JWT') }) } };
  return new AuthGuard(supabase as unknown as SupabaseClient);
}

function contextWith(request: Partial<AuthenticatedRequest>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let warnings: string[];
  beforeEach(() => {
    warnings = [];
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => { warnings.push(String(message)); });
  });
  afterEach(() => vi.restoreAllMocks());

  it('passes Google and Apple learners with their provider', async () => {
    for (const provider of ['google', 'apple']) {
      const request: Partial<AuthenticatedRequest> = { headers: { authorization: 'Bearer t' } };
      await expect(guardFor({ ...learner, app_metadata: { provider } }).canActivate(contextWith(request))).resolves.toBe(true);
      expect(request.user).toEqual({ userId: USER_ID, provider });
    }
    expect(warnings).toEqual([]);
  });

  it('logs why a request was refused, without the token or the user id', async () => {
    const cases: [object | null, Partial<AuthenticatedRequest>, string][] = [
      [learner, { headers: {} }, 'no Bearer token'],
      [null, { headers: { authorization: 'Bearer secret-token' } }, 'token did not verify'],
      [{ ...learner, role: 'service_role' }, { headers: { authorization: 'Bearer secret-token' } }, 'not a signed-in learner'],
      [{ ...learner, app_metadata: { provider: 'email', providers: ['email'] } }, { headers: { authorization: 'Bearer secret-token' } }, 'provider "email"'],
      [learner, { headers: { authorization: 'Bearer secret-token' } }, 'app_metadata missing'],
    ];
    for (const [claims, request, reason] of cases) {
      await expect(guardFor(claims).canActivate(contextWith(request))).rejects.toThrow(UnauthorizedException);
      expect(warnings.at(-1)).toContain(reason);
    }
    for (const line of warnings) {
      expect(line).not.toContain('secret-token');
      expect(line).not.toContain(USER_ID);
    }
  });
});
