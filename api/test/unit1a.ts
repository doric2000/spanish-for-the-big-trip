import { readFileSync } from 'node:fs';

// The real 1A draft from content/, as the seed stored it in unit_revisions.
export function unit1aPayload(): Record<string, unknown> {
  const file = new URL('../../content/units/unit1a.json', import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

// Behaves like the real repository: published only, unless drafts are included.
export function fakeRevisions(payloads: Record<string, unknown>[]) {
  return {
    latest: (unitId: string, includeDrafts: boolean) => {
      const match = payloads.find(p => p.id === unitId && (includeDrafts || p.status === 'published'));
      return Promise.resolve(match ? { payload: match } : null);
    },
  };
}

// Answer keys and review data that must never reach the learner.
export const PRIVATE_FIELDS = ['correctChoiceId', 'expectedTileIds', 'feedbackHe', 'nextNodeId', 'editorial', 'pendingStages', 'assets/characters'];
