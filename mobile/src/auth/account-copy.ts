// Learner-facing Hebrew for the account screen, kept free of React Native so tests can load it.

export function savedProgressLabel(units: number): string {
  if (units <= 0) return 'עדיין אין';
  if (units === 1) return 'יחידה אחת';
  return `${units} יחידות`;
}

export function providerLabel(provider: string | undefined): string {
  if (provider === 'apple') return 'Apple';
  if (provider === 'google') return 'Google';
  return 'חשבון';
}
