import type { AttemptRequest, PublicUnit } from '../../../content/src/api-contract';
import type { AttemptResult, Progress } from '../../../content/src/progress-types';

// conflict (409): the progress moved on elsewhere, or the request id was reused.
export type UnitFailure = 'not_configured' | 'unreachable' | 'unauthorized' | 'not_found' | 'conflict' | 'server';
type Failure = { ok: false; reason: UnitFailure };
export type UnitResult = { ok: true; unit: PublicUnit } | Failure;
export type StartResult = { ok: true; status: 'started' | 'existing' | 'completed'; progress: Progress } | Failure;
export type AttemptOutcome = { ok: true; result: AttemptResult } | Failure;

type Call = { baseUrl: string | undefined; path: string; accessToken: string; body?: unknown; fetchImpl: typeof fetch; timeoutMs: number };

// Asks our API (not Supabase); the server checks the token, strips the answers and
// decides every attempt. Who the learner is comes only from the token.
async function callApi<T>({ baseUrl, path, accessToken, body, fetchImpl, timeoutMs }: Call): Promise<{ ok: true; data: T } | Failure> {
  if (!baseUrl) return { ok: false, reason: 'not_configured' };
  // Without a timeout, a blocked port leaves the request hanging instead of failing.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { Authorization: `Bearer ${accessToken}` }
        : { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: false, reason: 'unauthorized' };
    if (response.status === 404) return { ok: false, reason: 'not_found' };
    if (response.status === 409) return { ok: false, reason: 'conflict' };
    if (!response.ok) return { ok: false, reason: 'server' };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    // Network error, timeout, or a body that is not JSON.
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

const unitPath = (unitId: string) => `/v1/units/${encodeURIComponent(unitId)}`;

export async function fetchUnit(
  baseUrl: string | undefined, unitId: string, accessToken: string,
  fetchImpl: typeof fetch = fetch, timeoutMs = 10_000,
): Promise<UnitResult> {
  const result = await callApi<PublicUnit>({ baseUrl, path: unitPath(unitId), accessToken, fetchImpl, timeoutMs });
  return result.ok ? { ok: true, unit: result.data } : result;
}

// Starting again is safe: the server returns the existing or completed progress.
export async function startUnit(
  baseUrl: string | undefined, unitId: string, accessToken: string,
  fetchImpl: typeof fetch = fetch, timeoutMs = 10_000,
): Promise<StartResult> {
  const result = await callApi<{ status: 'started' | 'existing' | 'completed'; progress: Progress }>(
    { baseUrl, path: `${unitPath(unitId)}/start`, accessToken, body: {}, fetchImpl, timeoutMs });
  return result.ok ? { ok: true, ...result.data } : result;
}

// Resending the same request (same requestId) after a failure is safe: the server
// answers it from its log instead of applying it twice.
export async function submitAttempt(
  baseUrl: string | undefined, unitId: string, accessToken: string, request: AttemptRequest,
  fetchImpl: typeof fetch = fetch, timeoutMs = 10_000,
): Promise<AttemptOutcome> {
  const result = await callApi<AttemptResult>(
    { baseUrl, path: `${unitPath(unitId)}/attempts`, accessToken, body: request, fetchImpl, timeoutMs });
  return result.ok ? { ok: true, result: result.data } : result;
}
