import type { Progress } from '@spanish-for-trip/content/progress';
import type { StartStatus } from '../src/progress/progress.repository.js';

// Stands in for ProgressRepository and behaves like public.start_unit_progress:
// the active row wins, then a completed row of the same revision, otherwise a new row.
export function fakeProgress(initial: Progress[] = []) {
  const rows = initial.map(p => structuredClone(p));
  const writes: { userId: string; unitId: string; revision: number; firstActivityId: string }[] = [];
  return {
    rows,
    writes,
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
