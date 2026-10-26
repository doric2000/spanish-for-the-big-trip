import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { validateUnit, phases, type Unit } from '../src/schema.js';
import { checkSkillGraph } from '../src/curriculum.js';
import { unitDigest } from '../src/digest.js';
import { AttemptRequestSchema, projectActivity, projectUnit, restorePending, type AttemptRequest } from '../src/api-contract.js';
import { applyAttempt, ContractError, startUnit, type SubmissionState, type VerifiedActor } from '../src/progress.js';
import { publishableUnit, realDraft } from './fixtures.js';

const actor: VerifiedActor = { userId: '00000000-0000-4000-8000-000000000001', provider: 'google' };
const other: VerifiedActor = { userId: '00000000-0000-4000-8000-000000000002', provider: 'apple' };
function begin(unit = publishableUnit()): SubmissionState { return { progress: startUnit(actor, unit, [], []), attempts: [] }; }
function request(state: SubmissionState, response: AttemptRequest['response'], requestId = randomUUID()): AttemptRequest {
  return { requestId, revision: state.progress.revision, activityId: state.progress.currentActivityId!, expectedProgressVersion: state.progress.progressVersion, response };
}
function step(unit: Unit, state: SubmissionState, response: AttemptRequest['response']) { return applyAttempt(actor, unit, state, request(state, response)); }
function at(unit: Unit, target: string): SubmissionState {
  let state = begin(unit);
  while (state.progress.currentActivityId !== target) {
    const activity = unit.activities.find(a => a.id === state.progress.currentActivityId)!;
    const response: AttemptRequest['response'] = activity.type === 'listen_select'
      ? { kind: 'choice', choiceId: activity.correctChoiceId }
      : activity.type === 'speak_reveal'
        ? { kind: 'self_comparison', mode: 'without_microphone', compared: true }
        : activity.type === 'arrange'
          ? { kind: 'arrange', tileIds: activity.expectedTileIds }
          : { kind: 'continue' };
    state = step(unit, state, response).state;
  }
  return state;
}
function rejects(action: () => unknown, status: number) { assert.throws(action, error => error instanceof ContractError && error.status === status); }
function invalid(unit: Unit, fragment: string) {
  const result = validateUnit(unit);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(i => i.message.includes(fragment)), result.error.message);
}

test('removing pending flags does not fabricate a complete lesson', () => {
  // 1A now has every learning phase (review and summary were approved 2026-10-16), so what
  // still blocks it is the unreviewed copy and the pending audio, not a missing phase.
  const unit = realDraft(); unit.status = 'published'; unit.pendingStages = [];
  const result = validateUnit(unit);
  assert.ok(!result.success);
  const messages = result.error.issues.map(i => i.message);
  assert.ok(messages.some(m => m.includes('reviewed activity copy')));
  assert.ok(messages.some(m => m.includes('approved media')));
  assert.ok(!messages.some(m => m.includes('mandatory')), 'no learning phase is missing any more');
});

test('1A ends with the approved review activities and summary, in teaching order', () => {
  const unit = realDraft();
  const ids = unit.activities.map(a => a.id);
  assert.deepEqual(ids.slice(ids.indexOf('1a-ending-scenario')), ['1a-ending-scenario', '1a-review-si', '1a-review-no', '1a-review-greet', '1a-summary']);
  const greet = unit.activities.find(a => a.id === '1a-review-greet');
  assert.ok(greet?.type === 'speak_reveal' && greet.modelNoteHe === 'גם Buenos días מתאים במפגש בבוקר.');
  const summary = unit.activities.find(a => a.id === '1a-summary');
  assert.ok(summary?.type === 'summary' && summary.actionLabelHe === 'חזרה למפה');
});

test('every learning phase, speaking and the completion scenario are enforced independently', () => {
  for (const phase of phases) {
    const unit = publishableUnit();
    unit.activities = unit.activities.filter(a => a.phase !== phase);
    assert.equal(validateUnit(unit).success, false, phase);
  }
  const unit = publishableUnit(); unit.activities = unit.activities.filter(a => a.type !== 'speak_reveal');
  invalid(unit, 'speaking');
  const noDetail = publishableUnit(); const scenario = noDetail.activities.find(a => a.type === 'bounded_scenario')!;
  scenario.changedDetail = false; invalid(noDetail, 'changed familiar detail');
});

test('new language must be declared and prepared before use; production is explicit', () => {
  const unit = realDraft(); unit.activities[0]!.uses = ['lang-hola']; invalid(unit, 'before preparation');
  const unknown = realDraft(); unknown.activities[1]!.introduces = ['unknown']; invalid(unknown, 'Unknown language');
  const production = publishableUnit(); production.preparedLanguage.produce = []; invalid(production, 'production');
});

test('unknown help, unreviewed help and incorrect phase assignments are blocked', () => {
  const unit = realDraft(); unit.activities[0]!.helpIds = ['missing']; invalid(unit, 'Unknown help');
  const unreviewed = publishableUnit(); unreviewed.help[0]!.review.status = 'needs_review'; invalid(unreviewed, 'reviewed help');
  const phase = realDraft(); phase.activities[0]!.phase = 'summary'; invalid(phase, 'does not match');
});

test('scenario destinations, unreachable nodes, dead ends and cycles are rejected', () => {
  for (const variation of ['unknown', 'cycle', 'unreachable', 'deadend']) {
    const unit = publishableUnit(); const activity = unit.activities.find(a => a.type === 'bounded_scenario')!;
    if (variation === 'unknown') activity.nodes[0]!.choices[0]!.nextNodeId = 'missing';
    if (variation === 'cycle') activity.nodes[0]!.choices[0]!.nextNodeId = 'start';
    if (variation === 'unreachable') activity.nodes.push({ ...structuredClone(activity.nodes[1]!), id: 'isolated' });
    if (variation === 'deadend') activity.nodes[0]!.choices = activity.nodes[0]!.choices.filter(c => c.outcome === 'retry');
    assert.equal(validateUnit(unit).success, false, variation);
  }
});

test('skill graph rejects unknown skills, missing providers and dependency cycles', () => {
  const first = publishableUnit(); first.provides = ['a']; first.requires = ['b'];
  const second = publishableUnit(); second.id = 'second'; second.provides = ['b']; second.requires = ['a'];
  assert.ok(checkSkillGraph([first, second], ['a', 'b']).some(i => i.includes('cyclic')));
  assert.ok(checkSkillGraph([first], ['a']).some(i => i.includes('unknown skill b')));
  assert.ok(checkSkillGraph([first], ['a', 'b']).some(i => i.includes('no provider')));
});

test('review digest binds content and actual media bytes without depending on draft/published marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-content-'));
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets', 'fixture'), 'first');
    const unit = publishableUnit(); for (const media of unit.media) media.path = 'assets/fixture';
    const original = await unitDigest(unit, root);
    unit.status = 'draft'; assert.equal(await unitDigest(unit, root), original);
    unit.titleHe += ' changed'; assert.notEqual(await unitDigest(unit, root), original);
    unit.titleHe = publishableUnit().titleHe;
    await writeFile(join(root, 'assets', 'fixture'), 'second');
    assert.notEqual(await unitDigest(unit, root), original);
  } finally {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('spanish-content-'));
    await rm(target, { recursive: true, force: true });
  }
});

test('runtime projection allowlists all supported types and hides answers, feedback, review, paths and branches', () => {
  const unit = publishableUnit();
  const urls = Object.fromEntries(unit.media.map(m => [m.id, `https://assets.example/${m.id}`]));
  const projected = projectUnit(unit, urls);
  const text = JSON.stringify(projected);
  for (const forbidden of ['correctChoiceId', 'expectedTileIds', 'correctHe', 'feedbackHe', 'retryHe', 'nextNodeId', 'outcome', 'editorial', 'review', 'pendingStages', 'assets/characters', 'Synthetic test only']) {
    // A legitimate phase is named review; reject metadata keys rather than that word.
    if (forbidden === 'review') assert.equal(text.includes('"review":'), false);
    else assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(new Set(projected.activities.map(a => a.type)), new Set(['entry', 'vocabulary_card', 'listen_select', 'dialogue', 'speak_reveal', 'arrange', 'explanation', 'bounded_scenario', 'summary']));
  const question = projected.activities.find(a => a.type === 'listen_select')!;
  assert.equal('expressionEs' in question, false);
  assert.equal(text.includes('"id":"end"'), false, 'future scenario nodes are not exposed');
  assert.throws(() => projectUnit(realDraft(), urls));
  assert.throws(() => projectUnit(unit, { ...urls, [unit.media[0]!.id]: 'file:///private' }));
  assert.throws(() => projectUnit(unit, {}), /Missing approved HTTPS media/, 'published stays strict about media');
});

test('draft projection needs explicit allowDraft and returns null for unhosted or unapproved media', () => {
  const draft = realDraft();
  assert.throws(() => projectUnit(draft, {}), /Drafts are not learner-readable/);
  assert.throws(() => projectUnit(draft, {}, {}, { allowDraft: false }), /Drafts are not learner-readable/);
  const hosted = draft.media.find(m => m.status === 'approved')!;
  const pending = draft.media.find(m => m.status !== 'approved')!;
  const urls = { [hosted.id]: `https://assets.example/${hosted.id}`, [pending.id]: `https://assets.example/${pending.id}` };
  const projected = projectUnit(draft, urls, {}, { allowDraft: true });
  const urlOf = (id: string) => projected.media.find(m => m.id === id)!.url;
  assert.equal(urlOf(hosted.id), urls[hosted.id]);
  assert.equal(urlOf(pending.id), null, 'pending audio is not served even when a URL exists');
  assert.ok(projected.media.filter(m => m.id !== hosted.id).every(m => m.url === null));
  assert.throws(() => projectUnit(draft, { [hosted.id]: 'file:///private' }, {}, { allowDraft: true }), /HTTPS/);
  const text = JSON.stringify(projected);
  for (const forbidden of ['correctChoiceId', 'expectedTileIds', 'feedbackHe', 'nextNodeId', 'editorial', 'pendingStages', 'assets/characters']) assert.equal(text.includes(forbidden), false, forbidden);
});

test('drafts start and take attempts only with allowDraft, and never count as a completed prerequisite', () => {
  const draft = realDraft();
  rejects(() => startUnit(actor, draft, [], []), 404);
  const progress = startUnit(actor, draft, [], [], { allowDraft: true });
  assert.equal(progress.currentActivityId, 'u1a-entry');
  const state: SubmissionState = { progress, attempts: [] };
  const continueEntry = request(state, { kind: 'continue' });
  rejects(() => applyAttempt(actor, draft, state, continueEntry), 404);
  const moved = applyAttempt(actor, draft, state, continueEntry, { allowDraft: true });
  assert.equal(moved.result.progress.currentActivityId, 'u1a-vocab-hola');

  // Finishing a draft is development data: it never unlocks a published unit.
  const next = publishableUnit(); next.id = 'next-unit'; next.requires = [...draft.provides];
  const completedDraft = { ...progress, status: 'completed' as const, currentActivityId: null };
  rejects(() => startUnit(actor, next, [completedDraft], [draft]), 404);
  rejects(() => startUnit(actor, next, [completedDraft], [draft], { allowDraft: true }), 404);
  // The same completion of a published revision does unlock it.
  const publishedRevision = { ...draft, status: 'published' as const };
  assert.equal(startUnit(actor, next, [completedDraft], [publishedRevision]).unitId, 'next-unit');
});

test('entry poster details are optional, projected when present and checked against characters', () => {
  const entry = projectUnit(realDraft(), {}, {}, { allowDraft: true }).activities[0]!;
  assert.ok(entry.type === 'entry');
  assert.deepEqual([entry.kickerHe, entry.sceneCaption, entry.characterId], ['פרק ראשון', 'HOSTEL · 07:30', 'juan']);
  const bare = realDraft(); const first = bare.activities[0]!;
  assert.ok(first.type === 'entry');
  delete first.kickerHe; delete first.sceneCaption; delete first.characterId;
  assert.equal(validateUnit(bare).success, true, 'the details stay optional');
  const projected = projectActivity(first);
  assert.equal('kickerHe' in projected || 'sceneCaption' in projected || 'characterId' in projected, false);
  const unknown = realDraft(); const scene = unknown.activities[0]!;
  assert.ok(scene.type === 'entry'); scene.characterId = 'nobody'; invalid(unknown, 'Unknown character');
});

test('explanation examples carry their own optional audio, checked against the media list', () => {
  const explanation = projectUnit(realDraft(), {}, {}, { allowDraft: true }).activities.find(a => a.type === 'explanation')!;
  assert.ok(explanation.type === 'explanation');
  assert.deepEqual(explanation.examples.map(e => e.audioAssetId), ['juan-cafe-question-v1', 'juan-azucar-question-v1']);
  const bare = realDraft(); const activity = bare.activities.find(a => a.type === 'explanation')!;
  assert.ok(activity.type === 'explanation');
  for (const example of activity.examples) delete example.audioAssetId;
  assert.equal(validateUnit(bare).success, true, 'the audio stays optional');
  const projected = projectActivity(activity);
  assert.ok(projected.type === 'explanation');
  assert.equal(projected.examples.some(e => 'audioAssetId' in e), false);
  const unknown = realDraft(); const broken = unknown.activities.find(a => a.type === 'explanation')!;
  assert.ok(broken.type === 'explanation'); broken.examples[0]!.audioAssetId = 'nothing'; invalid(unknown, 'Unknown audio asset: nothing');
});

test('attempt input rejects client-selected user, correctness, raw audio and unknown response fields', () => {
  const state = begin(); const valid = request(state, { kind: 'continue' });
  for (const key of ['userId', 'correct', 'audio', 'completed']) assert.equal(AttemptRequestSchema.safeParse({ ...valid, [key]: 'injected' }).success, false);
  assert.equal(AttemptRequestSchema.safeParse({ ...valid, response: { kind: 'self_comparison', mode: 'recording', compared: true, score: 100 } }).success, false);
});

test('authentication, ownership, drafts and invalid activity transitions fail without changing input', () => {
  const unit = publishableUnit(); const state = begin(unit); const before = structuredClone(state);
  rejects(() => applyAttempt(null, unit, state, request(state, { kind: 'continue' })), 401);
  rejects(() => applyAttempt(other, unit, state, request(state, { kind: 'continue' })), 404);
  rejects(() => applyAttempt(actor, realDraft(), state, request(state, { kind: 'continue' })), 404);
  rejects(() => applyAttempt(actor, unit, state, { ...request(state, { kind: 'continue' }), activityId: 'missing' }), 400);
  rejects(() => applyAttempt(actor, unit, state, { ...request(state, { kind: 'continue' }), activityId: unit.activities[1]!.id }), 409);
  rejects(() => step(unit, state, { kind: 'skip' }), 400);
  assert.deepEqual(state, before);
});

test('acknowledging content records viewed evidence, not a correct answer', () => {
  const unit = publishableUnit(); const next = step(unit, begin(unit), { kind: 'continue' });
  assert.equal(next.result.outcome, 'viewed');
  assert.equal(next.state.progress.completed[0]!.evidence, 'viewed');
  assert.equal(next.state.progress.progressVersion, 1);
});

test('wrong answer stays in place; later correct answer records assisted success', () => {
  const unit = publishableUnit(); const state = at(unit, 'u1a-primer-listen');
  const wrong = step(unit, state, { kind: 'choice', choiceId: 'thanks' });
  assert.equal(wrong.result.outcome, 'retry'); assert.equal(wrong.state.progress.currentActivityId, state.progress.currentActivityId);
  const correct = step(unit, wrong.state, { kind: 'choice', choiceId: 'hello' });
  assert.equal(correct.result.outcome, 'correct_with_help');
  assert.equal(correct.state.progress.completed.at(-1)!.usedHelp, true);
  rejects(() => step(unit, state, { kind: 'choice', choiceId: 'missing' }), 400);
  rejects(() => step(unit, state, { kind: 'continue' }), 400);
});

test('written hint and optional help preserve current activity and assistance across resume', () => {
  const unit = publishableUnit(); let state = at(unit, 'u1a-primer-listen');
  const hint = step(unit, state, { kind: 'written_hint' });
  assert.deepEqual(hint.result.revealed, { expressionEs: 'Hola.' }); state = hint.state;
  state = step(unit, state, { kind: 'help', helpId: 'help-test' }).state;
  const resumed = startUnit(actor, unit, [state.progress], []);
  assert.equal(resumed.usedHelpForCurrent, true);
  rejects(() => step(unit, state, { kind: 'help', helpId: 'missing' }), 400);
});

test('self-comparison and microphone alternative complete speaking without pronunciation judgment', () => {
  for (const mode of ['recording', 'without_microphone'] as const) {
    const unit = publishableUnit(); const state = at(unit, 'test-speaking');
    const result = step(unit, state, { kind: 'self_comparison', mode, compared: true });
    assert.equal(result.result.outcome, 'self_compared');
    assert.equal(result.state.progress.completed.at(-1)!.comparisonMode, mode);
    assert.equal('score' in result.result, false);
  }
});

test('scenario retry, terminal transition, recap and summary all participate in completion', () => {
  const unit = publishableUnit(); const spoken = step(unit, at(unit, 'test-speaking'), { kind: 'self_comparison', mode: 'recording', compared: true });
  let state = spoken.state;
  rejects(() => step(unit, state, { kind: 'scenario_choice', nodeId: 'end', choiceId: 'reply' }), 409);
  state = step(unit, state, { kind: 'scenario_choice', nodeId: 'start', choiceId: 'retry' }).state;
  assert.equal(state.progress.scenarioNodeId, 'start');
  state = step(unit, state, { kind: 'scenario_choice', nodeId: 'start', choiceId: 'reply' }).state;
  assert.equal(state.progress.status, 'in_progress');
  assert.equal(state.progress.currentActivityId, 'test-review');
  state = step(unit, state, { kind: 'choice', choiceId: 'hello' }).state;
  state = step(unit, state, { kind: 'continue' }).state;
  assert.equal(state.progress.status, 'completed'); assert.equal(state.progress.currentActivityId, null);
});

test('same request after a lost response replays once; different body and distinct stale requests conflict', () => {
  const unit = publishableUnit(); const initial = begin(unit); const first = request(initial, { kind: 'continue' });
  const submitted = applyAttempt(actor, unit, initial, first);
  const replay = applyAttempt(actor, unit, submitted.state, first);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.result, submitted.result); assert.equal(replay.state.attempts.length, 1);
  rejects(() => applyAttempt(actor, unit, submitted.state, { ...first, response: { kind: 'skip' } }), 409);
  rejects(() => applyAttempt(actor, unit, submitted.state, { ...first, requestId: randomUUID() }), 409);
  rejects(() => applyAttempt(actor, unit, initial, { ...first, revision: 999 }), 409);
});

test('replaying an older request never rolls authoritative progress back', () => {
  const unit = publishableUnit(); const state = begin(unit); const first = request(state, { kind: 'continue' });
  const one = applyAttempt(actor, unit, state, first);
  const two = step(unit, one.state, { kind: 'continue' });
  const replay = applyAttempt(actor, unit, two.state, first);
  assert.equal(replay.result.progress.progressVersion, 1);
  assert.equal(replay.state.progress.progressVersion, 2);
});

test('resume pins old revisions; new starts choose latest, completed records remain historical', () => {
  const old = publishableUnit(); const oldState = begin(old); const latest = structuredClone(old); latest.revision = 2;
  assert.equal(startUnit(actor, latest, [oldState.progress], []).revision, 1);
  const completed = { ...oldState.progress, status: 'completed' as const, currentActivityId: null };
  assert.equal(startUnit(actor, old, [completed], []).status, 'completed');
  assert.equal(startUnit(actor, latest, [completed], []).revision, 2);
});

test('skill-based unlock uses only own completion and the skills in that exact revision', () => {
  const source = publishableUnit(); source.provides = ['greeting']; const next = structuredClone(source); next.id = 'next'; next.requires = ['greeting'];
  const completed = { ...begin(source).progress, status: 'completed' as const, currentActivityId: null };
  assert.equal(startUnit(actor, next, [completed], [source]).unitId, 'next');
  rejects(() => startUnit(actor, next, [{ ...completed, userId: other.userId }], [source]), 404);
  rejects(() => startUnit(actor, next, [completed], [{ ...source, revision: 2 }]), 404);
});

test('pending request serialization survives restart, rejects a different user and contains no credentials/audio', () => {
  const state = begin(); const pending = { userId: actor.userId, unitId: state.progress.unitId, request: request(state, { kind: 'continue' }) };
  const restored = restorePending(JSON.parse(JSON.stringify(pending)), actor.userId);
  assert.deepEqual(restored, pending); assert.equal(restorePending(pending, other.userId), null);
  assert.equal(restorePending({ ...pending, accessToken: 'not-a-real-token' }, actor.userId), null);
});
