import type { AttemptResult, Progress } from '@spanish-for-trip/content/progress';
import type { StartStatus, SubmitInput, SubmitOutcome } from '../src/progress/progress.repository.js';

// Stands in for ProgressRepository and behaves like the two database functions:
// start_unit_progress (the active row wins, then a completed row of the same revision,
// otherwise a new row) and submit_activity_attempt (replay, conflict or store both).
export function fakeProgress(initial: Progress[] = []) {
  const rows = initial.map(p => structuredClone(p));
  const writes: { userId: string; unitId: string; revision: number; firstActivityId: string }[] = [];
  const attempts: { userId: string; requestId: string; fingerprint: string; result: AttemptResult }[] = [];
  return {
    rows,
    writes,
    attempts,
    attempt: (userId: string, requestId: string) => {
      const found = attempts.find(a => a.userId === userId && a.requestId === requestId);
      return Promise.resolve(found ? { fingerprint: found.fingerprint, result: structuredClone(found.result) } : null);
    },
    submit: (input: SubmitInput): Promise<SubmitOutcome> => {
      const { request } = input;
      const row = rows.find(p => p.userId === input.userId && p.unitId === input.unitId && p.revision === request.revision);
      if (!row) return Promise.resolve({ status: 'not_found' });
      const previous = attempts.find(a => a.userId === input.userId && a.requestId === request.requestId);
      if (previous) {
        return Promise.resolve(previous.fingerprint === input.fingerprint
          ? { status: 'replayed', result: structuredClone(previous.result) }
          : { status: 'conflict', reason: 'request_id_reused' });
      }
      if (row.status !== 'in_progress' || row.progressVersion !== request.expectedProgressVersion || row.currentActivityId !== request.activityId) {
        return Promise.resolve({ status: 'conflict', reason: 'progress_changed' });
      }
      attempts.push({ userId: input.userId, requestId: request.requestId, fingerprint: input.fingerprint, result: structuredClone(input.result) });
      Object.assign(row, structuredClone(input.result.progress));
      return Promise.resolve({ status: 'stored', result: structuredClone(input.result) });
    },
    forUnit: (userId: string, unitId: string) =>
      Promise.resolve(rows.filter(p => p.userId === userId && p.unitId === unitId).map(p => structuredClone(p))),
    completed: (userId: string) =>
      Promise.resolve(rows.filter(p => p.userId === userId && p.status === 'completed').map(p => structuredClone(p))),
    start: (userId: string, unitId: string, revision: number, firstActivityId: string, scenarioNodeId: string | null) => {
      writes.push({ userId, unitId, revision, firstActivityId });
      const own = rows.filter(p => p.userId === userId && p.unitId === unitId);
      const active = own.find(p => p.status === 'in_progress');
      if (active) return Promise.resolve({ status: 'existing' as StartStatus, progress: structuredClone(active) });
      const done = own.find(p => p.revision === revision && p.status === 'completed');
      if (done) return Promise.resolve({ status: 'completed' as StartStatus, progress: structuredClone(done) });
      const progress: Progress = {
        userId, unitId, revision, status: 'in_progress', currentActivityId: firstActivityId, progressVersion: 0,
        scenarioNodeId, usedHelpForCurrent: false, completed: [],
      };
      rows.push(progress);
      return Promise.resolve({ status: 'started' as StartStatus, progress: structuredClone(progress) });
    },
  };
}
