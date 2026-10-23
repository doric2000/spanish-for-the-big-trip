import { Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Progress } from '@spanish-for-trip/content/progress';
import { fakeProgress } from '../../test/fake-progress.js';
import { fakeRevisions, publishedFixture, unit1aPayload } from '../../test/unit1a.js';
import type { VerifiedUser } from '../auth/auth.guard.js';
import type { ApiConfig } from '../config.js';
import type { UnitRevisionsRepository } from '../units/unit-revisions.repository.js';
import { UnitsService } from '../units/units.service.js';
import type { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

const learner: VerifiedUser = { userId: '00000000-0000-4000-8000-000000000001', provider: 'google' };
const other: VerifiedUser = { userId: '00000000-0000-4000-8000-000000000002', provider: 'apple' };

function setup(payloads: Record<string, unknown>[], allowDraftUnits: boolean, rows: Progress[] = []) {
  const config: ApiConfig = { supabaseUrl: 'https://example.supabase.co', supabaseSecretKey: 'test-only', allowDraftUnits };
  const revisions = fakeRevisions(payloads) as unknown as UnitRevisionsRepository;
  const progress = fakeProgress(rows);
  const service = new ProgressService(new UnitsService(revisions, config), revisions, progress as unknown as ProgressRepository, config);
  return { service, progress };
}

// A second published unit that needs what 1A provides.
function nextUnit() {
  return publishedFixture(unit1aPayload(), { id: 'C01-U02', aliases: [], requires: ['greeting'], provides: [] });
}
function completed1a(status: 'draft' | 'published'): { payload: Record<string, unknown>; row: Progress } {
  return {
    payload: status === 'published' ? publishedFixture(unit1aPayload()) : unit1aPayload(),
    row: { userId: learner.userId, unitId: 'C01-U01', revision: 1, status: 'completed', currentActivityId: null,
      progressVersion: 16, scenarioNodeId: null, usedHelpForCurrent: false, completed: [] },
  };
}

describe('ProgressService.start', () => {
  it('starts 1A at the entry for a new learner, through the atomic function', async () => {
    const { service, progress } = setup([unit1aPayload()], true);
    const result = await service.start(learner, 'C01-U01');
    expect(result.status).toBe('started');
    expect(result.progress).toMatchObject({ userId: learner.userId, revision: 1, currentActivityId: 'u1a-entry', progressVersion: 0 });
    expect(progress.writes).toEqual([{ userId: learner.userId, unitId: 'C01-U01', revision: 1, firstActivityId: 'u1a-entry' }]);
  });

  it('returns the existing progress on a second start, without writing again', async () => {
    const { service, progress } = setup([unit1aPayload()], true);
    await service.start(learner, 'C01-U01');
    const again = await service.start(learner, 'C01-U01');
    expect(again.status).toBe('existing');
    expect(progress.writes).toHaveLength(1);
  });

  it('keeps learners apart: each gets their own row', async () => {
    const { service, progress } = setup([unit1aPayload()], true);
    await service.start(learner, 'C01-U01');
    const theirs = await service.start(other, 'C01-U01');
    expect(theirs.status).toBe('started');
    expect(theirs.progress.userId).toBe(other.userId);
    expect(progress.rows).toHaveLength(2);
  });

  it('returns 404 for the 1A draft without ALLOW_DRAFT_UNITS and for an unknown unit', async () => {
    const { service, progress } = setup([unit1aPayload()], false);
    await expect(service.start(learner, 'C01-U01')).rejects.toThrow(NotFoundException);
    await expect(setup([unit1aPayload()], true).service.start(learner, 'C01-U99')).rejects.toThrow(NotFoundException);
    expect(progress.writes).toHaveLength(0);
  });

  it('needs a completed published prerequisite; a completed draft never unlocks', async () => {
    const asDraft = completed1a('draft');
    const locked = setup([asDraft.payload, nextUnit()], true, [asDraft.row]);
    await expect(locked.service.start(learner, 'C01-U02')).rejects.toThrow(NotFoundException);
    expect(locked.progress.writes).toHaveLength(0);

    const asPublished = completed1a('published');
    const unlocked = setup([asPublished.payload, nextUnit()], true, [asPublished.row]);
    expect((await unlocked.service.start(learner, 'C01-U02')).status).toBe('started');
  });

  it('returns the completion of a finished revision without writing', async () => {
    const done = completed1a('published');
    const { service, progress } = setup([done.payload], false, [done.row]);
    expect((await service.start(learner, 'C01-U01')).status).toBe('completed');
    expect(progress.writes).toHaveLength(0);
  });

  it('turns a database failure into 503 so the app can retry', async () => {
    const { service, progress } = setup([unit1aPayload()], true);
    progress.forUnit = () => Promise.reject(new Error('connection reset'));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    await expect(service.start(learner, 'C01-U01')).rejects.toThrow(ServiceUnavailableException);
  });
});
