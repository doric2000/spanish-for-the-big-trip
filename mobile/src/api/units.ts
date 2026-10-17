import type { PublicUnit } from '../../../content/src/api-contract';

export type UnitFailure = 'not_configured' | 'unreachable' | 'unauthorized' | 'not_found' | 'server';
export type UnitResult = { ok: true; unit: PublicUnit } | { ok: false; reason: UnitFailure };

// Asks our API (not Supabase) for a unit; the server checks the token and strips the answers.
export async function fetchUnit(
  baseUrl: string | undefined,
  unitId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<UnitResult> {
  if (!baseUrl) return { ok: false, reason: 'not_configured' };
  // Without a timeout, a blocked port leaves the request hanging instead of failing.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/v1/units/${encodeURIComponent(unitId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: false, reason: 'unauthorized' };
    if (response.status === 404) return { ok: false, reason: 'not_found' };
    if (!response.ok) return { ok: false, reason: 'server' };
    return { ok: true, unit: (await response.json()) as PublicUnit };
  } catch {
    // Network error, timeout, or a body that is not JSON.
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
