import { readFileSync } from 'node:fs';

// The real 1A draft from content/, as the seed stored it in unit_revisions.
export function unit1aPayload(): Record<string, unknown> {
  const file = new URL('../../content/units/unit1a.json', import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

// A test-only copy of 1A that meets every publication rule (approved copy, help and
// media, no open stages). The real 1A is a draft; marking it "published" alone would
// fail validation, as it should.
export function publishedFixture(payload: Record<string, unknown>, changes: Record<string, unknown> = {}): Record<string, unknown> {
  const unit = structuredClone(payload) as {
    activities: { review: { status: string } }[]; help: { review: { status: string } }[];
    media: { id: string; status: string; path: string | null }[];
  } & Record<string, unknown>;
  for (const item of [...unit.activities, ...unit.help]) item.review.status = 'approved';
  for (const media of unit.media) { media.status = 'approved'; media.path ??= `assets/test/${media.id}`; }
  return { ...unit, status: 'published', pendingStages: [], ...changes };
}

// Behaves like the real repository: published only, unless drafts are included.
export function fakeRevisions(payloads: Record<string, unknown>[]) {
  return {
    latest: (unitId: string, includeDrafts: boolean) => {
      const match = payloads.find(p => p.id === unitId && (includeDrafts || p.status === 'published'));
      return Promise.resolve(match ? { payload: match } : null);
    },
    exact: (unitId: string, revision: number, includeDrafts: boolean) => {
      const match = payloads.find(p => p.id === unitId && p.revision === revision && (includeDrafts || p.status === 'published'));
      return Promise.resolve(match ? { payload: match } : null);
    },
    published: (unitId: string, revision: number) => {
      const match = payloads.find(p => p.id === unitId && p.revision === revision && p.status === 'published');
      return Promise.resolve(match ? { payload: match } : null);
    },
  };
}

// Answer keys and review data that must never reach the learner.
export const PRIVATE_FIELDS = ['correctChoiceId', 'expectedTileIds', 'feedbackHe', 'nextNodeId', 'editorial', 'pendingStages', 'assets/characters'];
