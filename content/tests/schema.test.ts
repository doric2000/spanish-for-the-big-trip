import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateUnit, type Unit } from '../src/schema.js';
import { checkMediaFiles } from '../src/cli.js';
import { publishableUnit } from './fixtures.js';

const unitPath = new URL('../../units/unit1a.json', import.meta.url);
const productRoot = fileURLToPath(new URL('../../../', import.meta.url));
const source: unknown = JSON.parse(await readFile(unitPath, 'utf8'));
function draft(): Unit {
  const parsed = validateUnit(structuredClone(source));
  assert.ok(parsed.success, parsed.success ? '' : parsed.error.message);
  return parsed.data;
}
function invalid(input: unknown, fragment: string) {
  const result = validateUnit(input);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => `${issue.path.join('.')}: ${issue.message}`.includes(fragment)), result.error.message);
}
function exercise(unit: Unit) {
  const activity = unit.activities.find(a => a.type === 'listen_select');
  assert.ok(activity?.type === 'listen_select');
  return activity;
}

test('real 1A draft keeps its expressions and the six-turn coffee dialogue', () => {
  const unit = draft();
  assert.equal(unit.id, 'C01-U01');
  assert.deepEqual(unit.aliases, ['1A']);
  assert.equal(unit.status, 'draft');
  assert.deepEqual(unit.activities.filter(a => a.type === 'vocabulary_card').map(a => a.expressionEs), ['Hola', 'Buenos días', 'Gracias', 'Sí', 'No', 'Café', 'Azúcar']);
  const dialogue = unit.activities.find(a => a.type === 'dialogue');
  assert.ok(dialogue?.type === 'dialogue');
  assert.deepEqual(dialogue.turns.map(t => t.textEs), ['Hola. Buenos días.', 'Hola, buenos días.', '¿Café?', 'Sí, gracias.', '¿Azúcar?', 'No, gracias.']);
  assert.deepEqual(dialogue.turns.map(t => t.speakerId), ['juan', 'learner', 'juan', 'learner', 'juan', 'learner']);
});

test('current draft cannot pass the publication gate', () => {
  const result = validateUnit(source, true);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some(i => i.path[0] === 'pendingStages'));
    assert.ok(result.error.issues.some(i => i.path[0] === 'media'));
    assert.ok(result.error.issues.some(i => i.path.at(-1) === 'review'));
  }
});

test('duplicate activity ID is rejected', () => {
  const unit = draft();
  unit.activities.push(structuredClone(unit.activities[0]!));
  invalid(unit, 'Duplicate ID');
});

test('publication schema accepts a synthetic fully reviewed revision without mutating the draft', () => {
  const unit = publishableUnit();
  // Synthetic completeness is tested without writing new lesson content.
  const result = validateUnit(unit, true);
  assert.ok(result.success);
  assert.equal(result.data.status, 'published');
  assert.equal(draft().status, 'draft');
});

test('a missing answer declaration is rejected', () => {
  const unit = draft();
  const activity = exercise(unit) as unknown as Record<string, unknown>;
  delete activity.correctChoiceId;
  invalid(unit, 'correctChoiceId');
});

test('correct answer must exist among the choices', () => {
  const unit = draft();
  exercise(unit).correctChoiceId = 'missing-answer';
  invalid(unit, 'Correct answer does not exist');
});

test('duplicate choices are rejected even when the answer points to that ID', () => {
  const unit = draft();
  const activity = exercise(unit);
  activity.choices[1]!.id = activity.choices[0]!.id;
  invalid(unit, 'Duplicate ID');
});

test('unknown audio and speaker references are rejected', () => {
  const unit = draft();
  exercise(unit).audioAssetId = 'unknown-audio';
  invalid(unit, 'Unknown audio asset');
  const second = draft();
  const dialogue = second.activities.find(a => a.type === 'dialogue');
  assert.ok(dialogue?.type === 'dialogue');
  dialogue.turns[0]!.speakerId = 'unknown-person';
  invalid(second, 'Unknown speaker');
});

test('media cannot traverse outside the product assets directory', () => {
  for (const path of ['assets/../README.md', '../secret', 'https://example.com/audio.mp3', 'assets\\audio.mp3']) {
    const unit = draft();
    unit.media[0]!.path = path;
    invalid(unit, 'Use an assets/ path');
  }
});

test('approved source files exist and pending audio is not misreported as ready', async () => {
  const unit = draft();
  assert.deepEqual(await checkMediaFiles(unit, productRoot), []);
  const audio = unit.media.find(a => a.kind === 'audio' && a.status === 'approved');
  assert.ok(audio);
  audio.path = 'assets/missing-audio-fixture.mp3';
  assert.ok((await checkMediaFiles(unit, productRoot)).some(message => message.includes(audio.id)));
});

test('unsupported activity types and empty learner copy are rejected', () => {
  const unit = draft();
  (unit.activities[0] as unknown as Record<string, unknown>).type = 'unrestricted-ai-dialogue';
  invalid(unit, 'type');
  const second = draft();
  exercise(second).promptHe = ' ';
  invalid(second, 'promptHe');
});
