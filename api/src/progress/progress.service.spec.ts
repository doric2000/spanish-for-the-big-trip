import { BadRequestException, ConflictException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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

describe('ProgressService.submit', () => {
  const requestId = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  // A learner who reached "ננסה יחד" (u1a-primer-listen) after the entry and five cards.
  function atPrimer(allowDraftUnits = true) {
    const row: Progress = { userId: learner.userId, unitId: 'C01-U01', revision: 1, status: 'in_progress',
      currentActivityId: 'u1a-primer-listen', progressVersion: 6, scenarioNodeId: null, usedHelpForCurrent: false, completed: [] };
    return setup([unit1aPayload()], allowDraftUnits, [row]);
  }
  const choose = (n: number, choiceId: string, expectedProgressVersion = 6) => ({
    requestId: requestId(n), revision: 1, activityId: 'u1a-primer-listen', expectedProgressVersion,
    response: { kind: 'choice', choiceId },
  });

  it('decides a correct answer on the server and moves on to the dialogue', async () => {
    const { service, progress } = atPrimer();
    const result = await service.submit(learner, 'C01-U01', choose(1, 'hello'));
    expect(result.outcome).toBe('correct');
    expect(result.feedbackHe).toBe('נכון! המשמעות של Hola היא שלום.');
    expect(result.progress).toMatchObject({ currentActivityId: 'u1a-dialogue', progressVersion: 7 });
    expect(progress.rows[0]).toMatchObject({ currentActivityId: 'u1a-dialogue', progressVersion: 7 });
    expect(progress.attempts).toHaveLength(1);
  });

  it('keeps a wrong answer on the same activity with corrective feedback, and never reveals the answer key', async () => {
    const { service } = atPrimer();
    const result = await service.submit(learner, 'C01-U01', choose(1, 'thanks'));
    expect(result.outcome).toBe('retry');
    expect(result.feedbackHe).toBe('לא בדיוק. הקשיבו שוב ונסו עוד פעם.');
    expect(result.progress).toMatchObject({ currentActivityId: 'u1a-primer-listen', progressVersion: 7, usedHelpForCurrent: true });
    expect(JSON.stringify(result)).not.toContain('correctChoiceId');
  });

  it('answers a retry of the same request from the log, even after the progress moved on', async () => {
    const { service, progress } = atPrimer();
    const first = await service.submit(learner, 'C01-U01', choose(1, 'hello'));
    const again = await service.submit(learner, 'C01-U01', choose(1, 'hello'));
    expect(again).toEqual(first);
    expect(progress.attempts).toHaveLength(1);
    expect(progress.rows[0].progressVersion).toBe(7);
  });

  it('refuses a reused request id with other content and a stale progress version (409)', async () => {
    const { service, progress } = atPrimer();
    await service.submit(learner, 'C01-U01', choose(1, 'hello'));
    await expect(service.submit(learner, 'C01-U01', choose(1, 'thanks'))).rejects.toThrow(ConflictException);
    // A new request computed from the old version 6: the learner already moved on.
    await expect(service.submit(learner, 'C01-U01', choose(2, 'hello'))).rejects.toThrow(ConflictException);
    expect(progress.attempts).toHaveLength(1);
  });

  it('turns a conflict found by the database (a simultaneous request) into 409', async () => {
    const { service, progress } = atPrimer();
    progress.submit = () => Promise.resolve({ status: 'conflict', reason: 'progress_changed' });
    await expect(service.submit(learner, 'C01-U01', choose(1, 'hello'))).rejects.toThrow(ConflictException);
  });

  it('returns 400 for a malformed body, an unknown choice or a client-chosen outcome', async () => {
    const { service, progress } = atPrimer();
    await expect(service.submit(learner, 'C01-U01', { nonsense: true })).rejects.toThrow(BadRequestException);
    await expect(service.submit(learner, 'C01-U01', choose(1, 'not-a-choice'))).rejects.toThrow(BadRequestException);
    await expect(service.submit(learner, 'C01-U01', { ...choose(2, 'hello'), outcome: 'correct' })).rejects.toThrow(BadRequestException);
    expect(progress.attempts).toHaveLength(0);
  });

  it('returns 404 before a start, for another learner, and for the draft without ALLOW_DRAFT_UNITS', async () => {
    const { service } = atPrimer();
    await expect(service.submit(other, 'C01-U01', choose(1, 'hello'))).rejects.toThrow(NotFoundException);
    await expect(atPrimer(false).service.submit(learner, 'C01-U01', choose(1, 'hello'))).rejects.toThrow(NotFoundException);
    await expect(setup([unit1aPayload()], true).service.submit(learner, 'C01-U01', choose(1, 'hello'))).rejects.toThrow(NotFoundException);
  });
});
