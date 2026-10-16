import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { AttemptRequestSchema, projectActivity, type AttemptRequest } from '../src/api-contract.js';
import { applyAttempt, ContractError, startUnit, type SubmissionState } from '../src/progress.js';
import { validateUnit, type Unit } from '../src/schema.js';
import { publishableUnit, realDraft } from './fixtures.js';

const actor = { userId: '00000000-0000-4000-8000-000000000001', provider: 'google' as const };
function arrangement(unit: Unit) {
  const activity = unit.activities.find(a => a.id === '1a-arrange-greeting');
  assert.ok(activity?.type === 'arrange');
  return activity;
}
function request(state: SubmissionState, response: AttemptRequest['response']): AttemptRequest {
  return { requestId: randomUUID(), revision: state.progress.revision, activityId: state.progress.currentActivityId!, expectedProgressVersion: state.progress.progressVersion, response };
}
function submit(unit: Unit, state: SubmissionState, response: AttemptRequest['response']) {
  return applyAttempt(actor, unit, state, request(state, response));
}
function atArrangement(unit: Unit): SubmissionState {
  let state: SubmissionState = { progress: startUnit(actor, unit, [], []), attempts: [] };
  while (state.progress.currentActivityId !== arrangement(unit).id) {
    const activity = unit.activities.find(a => a.id === state.progress.currentActivityId)!;
    const response: AttemptRequest['response'] = activity.type === 'listen_select'
      ? { kind: 'choice', choiceId: activity.correctChoiceId }
      : activity.type === 'speak_reveal'
        ? { kind: 'self_comparison', mode: 'without_microphone', compared: true }
        : { kind: 'continue' };
    state = submit(unit, state, response).state;
  }
  return state;
}
function rejects(action: () => unknown, status: number) {
  assert.throws(action, error => error instanceof ContractError && error.status === status);
}

test('1A arrangement follows the approved speaking task and only uses prepared language', () => {
  const unit = realDraft();
  const activity = arrangement(unit);
  const index = unit.activities.indexOf(activity);
  assert.equal(unit.activities[index - 1]!.id, '1a-speak-thanks');
  const preparation = unit.activities.findIndex(a => a.introduces.includes('lang-buenos-dias'));
  assert.ok(preparation >= 0 && preparation < index);
  assert.deepEqual(activity.uses, ['lang-buenos-dias']);
  assert.ok(unit.preparedLanguage.produce.includes('lang-buenos-dias'));
  assert.equal(activity.expectedTileIds.map(id => activity.tiles.find(t => t.id === id)!.textEs).join(' '), 'Buenos días');
  assert.equal(unit.status, 'draft');
});

test('arrangement authoring rejects duplicate, missing and unknown answer tiles', () => {
  const cases: { change: (unit: Unit) => void; message: string }[] = [
    { change: unit => { arrangement(unit).tiles[1]!.id = 'dias'; }, message: 'Duplicate ID' },
    { change: unit => { arrangement(unit).expectedTileIds = ['dias', 'dias']; }, message: 'Duplicate ID' },
    { change: unit => { arrangement(unit).expectedTileIds[0] = 'unknown'; }, message: 'Unknown answer tile' },
    { change: unit => { arrangement(unit).tiles.push({ id: 'extra', textEs: 'Hola' }); }, message: 'every tile exactly once' },
    { change: unit => { unit.preparedLanguage.produce = ['lang-gracias']; }, message: 'production' },
  ];
  for (const { change, message } of cases) {
    const unit = realDraft(); change(unit);
    const result = validateUnit(unit);
    assert.ok(!result.success && result.error.issues.some(i => i.message.includes(message)), message);
  }
});

test('public arrangement sends tiles but withholds answer order, feedback and editorial metadata', () => {
  const activity = arrangement(realDraft());
  const publicActivity = projectActivity(activity);
  assert.ok(publicActivity.type === 'arrange' && 'tiles' in publicActivity);
  assert.deepEqual(publicActivity.tiles, activity.tiles);
  for (const privateKey of ['expectedTileIds', 'feedback', 'review', 'uses', 'introduces']) assert.equal(privateKey in publicActivity, false, privateKey);
  assert.equal(AttemptRequestSchema.safeParse({ ...request(atArrangement(publishableUnit()), { kind: 'arrange', tileIds: ['buenos', 'dias'] }), response: { kind: 'arrange', tileIds: ['buenos', 'dias'], correct: true } }).success, false);
});

test('invalid arrangement submissions do not mutate state or bypass a required task', () => {
  const unit = publishableUnit(); const state = atArrangement(unit); const before = structuredClone(state);
  for (const tileIds of [[], ['buenos'], ['buenos', 'buenos'], ['buenos', 'unknown'], ['buenos', 'dias', 'dias']]) {
    rejects(() => submit(unit, state, { kind: 'arrange', tileIds }), 400);
  }
  rejects(() => submit(unit, state, { kind: 'continue' }), 400);
  rejects(() => submit(unit, state, { kind: 'skip' }), 400);
  assert.deepEqual(state, before);
});

test('wrong order stays on the arrangement and correction after resume retains assistance', () => {
  const unit = publishableUnit(); const state = atArrangement(unit);
  const wrong = submit(unit, state, { kind: 'arrange', tileIds: ['dias', 'buenos'] });
  assert.equal(wrong.result.outcome, 'retry');
  assert.equal(wrong.result.feedbackHe, arrangement(unit).feedback.retryHe);
  assert.equal(wrong.state.progress.currentActivityId, arrangement(unit).id);
  assert.equal(wrong.state.progress.completed.length, state.progress.completed.length);
  const resumed = { ...wrong.state, progress: startUnit(actor, unit, [wrong.state.progress], []) };
  const corrected = submit(unit, resumed, { kind: 'arrange', tileIds: ['buenos', 'dias'] });
  assert.equal(corrected.result.outcome, 'correct_with_help');
  assert.equal(corrected.state.progress.completed.at(-1)!.usedHelp, true);
  assert.notEqual(corrected.state.progress.currentActivityId, arrangement(unit).id);
});

test('unassisted arrangement and explicit hint produce distinct evidence without a speech score', () => {
  const unit = publishableUnit(); const initial = atArrangement(unit);
  const unaided = submit(unit, initial, { kind: 'arrange', tileIds: ['buenos', 'dias'] });
  assert.equal(unaided.result.outcome, 'correct');
  const helped = submit(unit, initial, { kind: 'help', helpId: 'help-arrange-greeting' });
  assert.equal(helped.state.progress.currentActivityId, arrangement(unit).id);
  const correct = submit(unit, helped.state, { kind: 'arrange', tileIds: ['buenos', 'dias'] });
  assert.equal(correct.result.outcome, 'correct_with_help');
  assert.equal('score' in correct.result, false);
  assert.equal(correct.state.progress.completed.at(-1)!.comparisonMode, null);
});

test('replaying an ordered tile submission advances once and changed order with the same request ID conflicts', () => {
  const unit = publishableUnit(); const state = atArrangement(unit);
  const attempt = request(state, { kind: 'arrange', tileIds: ['buenos', 'dias'] });
  const first = applyAttempt(actor, unit, state, attempt);
  const replay = applyAttempt(actor, unit, first.state, attempt);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.state, first.state);
  assert.deepEqual(replay.result, first.result);
  rejects(() => applyAttempt(actor, unit, first.state, { ...attempt, response: { kind: 'arrange', tileIds: ['dias', 'buenos'] } }), 409);
});
