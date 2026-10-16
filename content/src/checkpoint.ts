import { randomUUID } from 'node:crypto';
import { applyAttempt, ContractError, startUnit, type SubmissionState } from './progress.js';
import type { AttemptRequest } from './api-contract.js';
import { publishableUnit } from '../tests/fixtures.js';

// A transparent local learning exercise using synthetic completeness. No auth,
// HTTP, database writes or real publication is simulated as having happened.
const actor = { userId: '00000000-0000-4000-8000-000000000001', provider: 'google' as const };
const unit = publishableUnit();
let state: SubmissionState = { progress: startUnit(actor, unit, [], []), attempts: [] };
function request(response: AttemptRequest['response']): AttemptRequest {
  return { requestId: randomUUID(), revision: unit.revision, activityId: state.progress.currentActivityId!, expectedProgressVersion: state.progress.progressVersion, response };
}
while (state.progress.currentActivityId !== 'u1a-primer-listen') state = applyAttempt(actor, unit, state, request({ kind: 'continue' })).state;
const first = request({ kind: 'choice', choiceId: 'hello' });
console.log('LOCAL SYNTHETIC CHECKPOINT — no phone, authentication, API or Supabase connection.');
console.log('1. Request prepared by phone (example):', JSON.stringify(first, null, 2));
const submitted = applyAttempt(actor, unit, state, first);
console.log('2. Expected server decision:', submitted.result.outcome);
console.log('3. Proposed atomic database write: attempt + progress together. Current local activity:', submitted.state.progress.currentActivityId);
const replayed = applyAttempt(actor, unit, submitted.state, first);
console.log('4. Lost response / same request retry:', replayed.replayed, '; saved attempt count unchanged:', replayed.state.attempts.length === submitted.state.attempts.length);
try { applyAttempt(actor, unit, submitted.state, { ...first, response: { kind: 'choice', choiceId: 'thanks' } }); }
catch (error) {
  if (!(error instanceof ContractError)) throw error;
  console.log('5. Same request ID / changed answer:', error.status, error.message);
}
console.log('Dor checkpoint: explain why a retry must keep requestId, and propose another invalid case.');
