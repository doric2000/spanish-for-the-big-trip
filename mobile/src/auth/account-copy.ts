// Learner-facing Hebrew for the account screen, kept free of React Native so tests can load it.

export function savedProgressLabel(units: number): string {
  if (units <= 0) return 'עדיין אין';
  if (units === 1) return 'יחידה אחת';
  return `${units} יחידות`;
}

// The passport stamp means real saved progress: only when progress loaded and at
// least one unit is saved (never while loading, on error, or with none yet).
export type ProgressRead = { state: 'loading' } | { state: 'ok'; rows: number } | { state: 'error' };
export function showPassportStamp(progress: ProgressRead): boolean {
  return progress.state === 'ok' && progress.rows > 0;
}

export function providerLabel(provider: string | undefined): string {
  if (provider === 'apple') return 'Apple';
  if (provider === 'google') return 'Google';
  return 'חשבון';
}
