import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { projectActivity, type AttemptRequest } from '../src/api-contract.js';
import { applyAttempt, ContractError, startUnit, type SubmissionState } from '../src/progress.js';
import { validateUnit, type Unit } from '../src/schema.js';
import { publishableUnit, realDraft } from './fixtures.js';

const actor = { userId: '00000000-0000-4000-8000-000000000001', provider: 'google' as const };
function scene(unit: Unit) {
  const activity = unit.activities.find(a => a.id === '1a-ending-scenario');
  assert.ok(activity?.type === 'bounded_scenario');
  return activity;
}
// Synthetic publication status/media only, never written to the real lesson.
// Keep the actual authored scenario while reusing the generic recap/summary.
function withAuthoredScene(): Unit {
  const unit = publishableUnit();
  const actual = structuredClone(scene(realDraft()));
  actual.review = { status: 'approved', source: 'Synthetic scenario test only', note: 'Not human lesson approval' };
  unit.activities = unit.activities.map(a => a.type === 'bounded_scenario' ? actual : a);
  unit.completionScenarioId = actual.id;
  const checked = validateUnit(unit);
  assert.ok(checked.success, checked.success ? '' : checked.error.message);
  return checked.data;
}
function request(state: SubmissionState, response: AttemptRequest['response']): AttemptRequest {
  return { requestId: randomUUID(), revision: state.progress.revision, activityId: state.progress.currentActivityId!, expectedProgressVersion: state.progress.progressVersion, response };
}
function submit(unit: Unit, state: SubmissionState, response: AttemptRequest['response']) {
  return applyAttempt(actor, unit, state, request(state, response));
}
function choose(unit: Unit, state: SubmissionState, choiceId: string) {
  return submit(unit, state, { kind: 'scenario_choice', nodeId: state.progress.scenarioNodeId!, choiceId });
}
function beginScene(unit: Unit): SubmissionState {
  let state: SubmissionState = { progress: startUnit(actor, unit, [], []), attempts: [] };
  while (state.progress.currentActivityId !== scene(unit).id) {
    const activity = unit.activities.find(a => a.id === state.progress.currentActivityId)!;
    const response: AttemptRequest['response'] = activity.type === 'listen_select'
      ? { kind: 'choice', choiceId: activity.correctChoiceId }
      : activity.type === 'speak_reveal'
        ? { kind: 'self_comparison', mode: 'without_microphone', compared: true }
        : activity.type === 'arrange'
          ? { kind: 'arrange', tileIds: activity.expectedTileIds }
          : { kind: 'continue' };
    state = submit(unit, state, response).state;
  }
  return state;
}
function rejects(action: () => unknown, status: number) {
  assert.throws(action, error => error instanceof ContractError && error.status === status);
}

test('authored ending uses prepared expressions and visible nonverbal actions without invented speech', () => {
  const unit = realDraft(); const activity = scene(unit);
  assert.equal(unit.completionScenarioId, activity.id);
  assert.equal(unit.activities[unit.activities.indexOf(activity) - 1]!.id, '1a-arrange-greeting');
  // Every Spanish word in the scene was prepared earlier in the unit.
  const words = (text: string) => text.toLowerCase().replace(/[¿?¡!.,]/g, '').split(/\s+/).filter(Boolean);
  const taughtWords = new Set(unit.languageItems.flatMap(l => words(l.textEs)));
  const taught = { has: (text: string) => words(text).every(w => taughtWords.has(w)) };
  for (const node of activity.nodes) {
    if (node.textEs !== null) assert.ok(taught.has(node.textEs), node.textEs);
    else {
      assert.ok(node.contextHe);
      assert.equal(node.translationHe, null);
      assert.equal(node.audioAssetId, null);
    }
    for (const choice of node.choices) assert.ok(taught.has(choice.textEs), choice.textEs);
  }
  assert.equal(activity.changedDetail, true);
  // A scenario lists only language the learner produces in it.
  assert.deepEqual(new Set(activity.uses), new Set(unit.preparedLanguage.produce));
});

test('scenario contract rejects partial speech tuples and context-free nonverbal steps', () => {
  const changes: { change: (unit: Unit) => void; message: string }[] = [
    { change: u => { scene(u).nodes[0]!.audioAssetId = null; }, message: 'present together' },
    { change: u => { scene(u).nodes[1]!.translationHe = 'תיאור שאינו דיבור'; }, message: 'present together' },
    { change: u => { delete scene(u).nodes[1]!.contextHe; }, message: 'visible context' },
    { change: u => { delete scene(u).nodes[1]!.promptHe; }, message: 'learner prompt' },
    { change: u => { scene(u).nodes[0]!.audioAssetId = 'unknown'; }, message: 'Unknown audio' },
  ];
  for (const { change, message } of changes) {
    const unit = realDraft(); change(unit); const result = validateUnit(unit);
    assert.ok(!result.success && result.error.issues.some(i => i.message.includes(message)), message);
  }
  assert.ok(validateUnit(publishableUnit()).success, 'existing spoken-only scenario contract still validates');
});

test('scenario projection separates Hebrew actions from speech and exposes only the current node', () => {
  const activity = scene(realDraft());
  const shown = projectActivity(activity, 'offer-coffee');
  assert.ok('node' in shown);
  assert.equal(shown.node.contextHe, activity.nodes[1]!.contextHe);
  assert.equal(shown.node.promptHe, activity.nodes[1]!.promptHe);
  assert.equal(shown.node.textEs, null);
  assert.equal('translationHe' in shown.node, false);
  assert.equal(shown.node.audioAssetId, null);
  const output = JSON.stringify(shown);
  for (const key of ['nextNodeId', 'outcome', 'feedbackHe', 'review', 'nodes']) assert.equal(output.includes(`"${key}":`), false, key);
  assert.equal(output.includes('sugar-answer'), false);
});

test('a spoken line hides its translation and the Hebrew choice labels until the learner asks for them', () => {
  const activity = scene(realDraft());
  const shown = projectActivity(activity, 'greeting');
  assert.ok('node' in shown);
  assert.equal(shown.node.textEs, 'Buenos días.');
  assert.equal('translationHe' in shown.node, false);
  assert.ok(shown.node.choices.length > 0);
  for (const choice of shown.node.choices) assert.equal('textHe' in choice, false, choice.id);
  assert.equal(JSON.stringify(shown).includes('בוקר טוב'), false);
});

test('asking for Juan\'s translation is registered as help, stays on the node and then advances normally', () => {
  const unit = withAuthoredScene(); const initial = beginScene(unit);
  const asked = submit(unit, initial, { kind: 'scenario_translation', nodeId: 'greeting' });
  assert.equal(asked.result.outcome, 'help');
  assert.deepEqual(asked.result.revealed, { translationHe: 'בוקר טוב.' });
  assert.equal(asked.state.progress.scenarioNodeId, 'greeting');
  assert.equal(asked.state.progress.usedHelpForCurrent, true);
  const again = submit(unit, asked.state, { kind: 'scenario_translation', nodeId: 'greeting' });
  assert.equal(again.state.progress.scenarioNodeId, 'greeting');
  const advanced = choose(unit, again.state, 'buenos-dias');
  assert.equal(advanced.state.progress.scenarioNodeId, 'offer-coffee');
  // Assistance on a line is kept for the whole scene and recorded when the scene completes.
  const offered = choose(unit, advanced.state, 'cafe');
  assert.equal(offered.state.progress.scenarioNodeId, 'coffee-answer');
  const finished = choose(unit, offered.state, 'azucar');
  assert.equal(finished.state.progress.currentActivityId, 'test-review');
  assert.equal(finished.state.progress.completed.at(-1)!.usedHelp, true);
});

test('translation requests are refused for silent nodes, other nodes and finished scenes', () => {
  const unit = withAuthoredScene(); const initial = beginScene(unit);
  rejects(() => submit(unit, initial, { kind: 'scenario_translation', nodeId: 'offer-coffee' }), 409);
  const greeted = choose(unit, initial, 'hola').state;
  rejects(() => submit(unit, greeted, { kind: 'scenario_translation', nodeId: 'greeting' }), 409);
  rejects(() => submit(unit, greeted, { kind: 'scenario_translation', nodeId: 'offer-coffee' }), 400);
  const answered = choose(unit, choose(unit, greeted, 'cafe').state, 'azucar').state;
  assert.equal(answered.progress.currentActivityId, 'test-review');
  rejects(() => submit(unit, answered, { kind: 'scenario_translation', nodeId: 'sugar-answer' }), 400);
});

test('every greeting leads through the coffee and sugar offers to the answer from Juan before recap', () => {
  for (const greeting of ['buenos-dias', 'hola', 'hola-buenos-dias']) {
    const unit = withAuthoredScene();
    let state = choose(unit, beginScene(unit), greeting).state;
    assert.equal(state.progress.scenarioNodeId, 'offer-coffee');
    const offered = choose(unit, state, 'cafe');
    assert.equal(offered.result.outcome, 'advanced');
    assert.equal(offered.state.progress.scenarioNodeId, 'coffee-answer');
    state = { ...offered.state, progress: startUnit(actor, unit, [offered.state.progress], []) };
    assert.equal(state.progress.scenarioNodeId, 'coffee-answer', 'resume returns to the same node');
    const finished = choose(unit, state, 'azucar');
    assert.equal(finished.result.outcome, 'scenario_completed');
    assert.equal(finished.state.progress.status, 'in_progress');
    assert.equal(finished.state.progress.currentActivityId, 'test-review');
    assert.equal(finished.state.progress.completed.at(-1)!.usedHelp, false);
    assert.ok(finished.result.revealed && 'node' in finished.result.revealed);
    // The ending carries Juan's spoken answer as well as the Hebrew outcome.
    assert.equal(finished.result.revealed.node.id, 'sugar-answer');
    assert.equal(finished.result.revealed.node.textEs, 'No, gracias.');
    assert.ok(finished.result.revealed.node.contextHe);
  }
});

test('retry and resume preserve the scenario node and assistance; wrong-step and bypass attempts are rejected', () => {
  const unit = withAuthoredScene(); const initial = beginScene(unit);
  const wrong = choose(unit, initial, 'gracias');
  assert.equal(wrong.result.outcome, 'retry');
  assert.equal(wrong.state.progress.scenarioNodeId, 'greeting');
  const before = structuredClone(wrong.state);
  rejects(() => submit(unit, wrong.state, { kind: 'scenario_choice', nodeId: 'offer-coffee', choiceId: 'cafe' }), 409);
  rejects(() => choose(unit, wrong.state, 'unknown'), 400);
  rejects(() => submit(unit, wrong.state, { kind: 'continue' }), 400);
  rejects(() => submit(unit, wrong.state, { kind: 'skip' }), 400);
  assert.deepEqual(wrong.state, before);
  let state = { ...wrong.state, progress: startUnit(actor, unit, [wrong.state.progress], []) };
  assert.equal(state.progress.usedHelpForCurrent, true);
  state = choose(unit, state, 'hola').state;
  // Offering sugar into an empty cup and answering instead of offering both stay in place.
  for (const choiceId of ['azucar', 'si-gracias']) {
    const retry = choose(unit, state, choiceId);
    assert.equal(retry.result.outcome, 'retry');
    assert.equal(retry.state.progress.scenarioNodeId, 'offer-coffee');
    assert.ok(retry.result.feedbackHe);
    state = retry.state;
  }
  state = choose(unit, state, 'cafe').state;
  const finished = choose(unit, state, 'azucar');
  assert.equal(finished.state.progress.completed.at(-1)!.usedHelp, true);
});

test('lost-response replay does not repeat the coffee offer and a changed choice with the same request ID conflicts', () => {
  const unit = withAuthoredScene(); const state = choose(unit, beginScene(unit), 'hola').state;
  const attempt = request(state, { kind: 'scenario_choice', nodeId: 'offer-coffee', choiceId: 'cafe' });
  const first = applyAttempt(actor, unit, state, attempt);
  const replay = applyAttempt(actor, unit, first.state, attempt);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.state, first.state);
  assert.deepEqual(replay.result, first.result);
  rejects(() => applyAttempt(actor, unit, first.state, { ...attempt, response: { kind: 'scenario_choice', nodeId: 'offer-coffee', choiceId: 'azucar' } }), 409);
});
