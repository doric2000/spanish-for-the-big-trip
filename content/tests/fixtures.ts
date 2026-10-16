import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateUnit, type Unit } from '../src/schema.js';

const realSource: unknown = JSON.parse(await readFile(new URL('../../units/unit1a.json', import.meta.url), 'utf8'));
export function realDraft(): Unit {
  const result = validateUnit(structuredClone(realSource));
  assert.ok(result.success, result.success ? '' : result.error.message);
  return result.data;
}
// Synthetic contract fixtures only. None of this copy, audio reuse or approval
// is saved to units/ or counts as a reviewed learner lesson.
export function publishableUnit(): Unit {
  const unit = realDraft();
  // Generic regression fixtures keep their own stable synthetic scenario, review and
  // summary, appended below in teaching order. The authored ones are covered by
  // scenario.test.ts and realDraft().
  unit.activities = unit.activities.filter(a => a.type !== 'bounded_scenario' && a.phase !== 'review' && a.phase !== 'summary');
  unit.status = 'published'; unit.pendingStages = [];
  unit.preparedLanguage.produce = [...unit.preparedLanguage.understand];
  const review = { status: 'approved' as const, source: 'Synthetic test only', note: 'Not approved learner copy' };
  const fields = { review, required: true, introduces: [], uses: ['lang-hola'], helpIds: [] };
  unit.help = [{ id: 'help-test', titleHe: 'עזר בדיקה', bodyHe: 'נתוני בדיקה בלבד', audioAssetId: null, review }, ...unit.help];
  for (const help of unit.help) help.review = review;
  unit.activities.find(a => a.type === 'listen_select')!.helpIds = ['help-test'];
  unit.activities.splice(6, 0, { ...fields, id: 'test-explanation', phase: 'preparation', type: 'explanation', titleHe: 'הסבר בדיקה', generalHe: 'נתוני בדיקה בלבד', examples: [{ textEs: 'Hola', meaningHe: 'שלום' }] });
  unit.activities.push(
    { ...fields, id: 'test-speaking', phase: 'practice', type: 'speak_reveal', promptHe: 'נתוני בדיקה בלבד', modelTextEs: 'Hola', audioAssetId: 'juan-hola-v1', alternativeHe: 'השוואה ללא מיקרופון', completion: 'self_comparison' },
    { ...fields, id: 'test-scenario', phase: 'scenario', type: 'bounded_scenario', titleHe: 'תרחיש בדיקה', changedDetail: true, startNodeId: 'start', nodes: [
      { id: 'start', textEs: 'Hola', translationHe: 'שלום', audioAssetId: 'juan-hola-v1', terminal: false, choices: [
        { id: 'reply', textEs: 'Hola', textHe: 'שלום', outcome: 'advance', nextNodeId: 'end', feedbackHe: 'משוב בדיקה' },
        { id: 'retry', textEs: 'No', textHe: 'לא', outcome: 'retry', nextNodeId: null, feedbackHe: 'ניסיון נוסף' },
      ] },
      { id: 'end', textEs: 'Gracias', translationHe: 'תודה', audioAssetId: 'juan-gracias-v1', terminal: true, choices: [] },
    ] },
    { ...structuredClone(unit.activities.find(a => a.type === 'listen_select')!), id: 'test-review', phase: 'review' },
    { ...fields, id: 'test-summary', phase: 'summary', type: 'summary', titleHe: 'סיכום בדיקה', bodyHe: 'נתוני בדיקה בלבד', actionLabelHe: 'חזרה למפה' },
  );
  unit.completionScenarioId = 'test-scenario';
  for (const activity of unit.activities) activity.review = review;
  const image = unit.media.find(m => m.kind === 'image' && m.status === 'approved')!.path;
  const audio = unit.media.find(m => m.kind === 'audio' && m.status === 'approved')!.path;
  for (const media of unit.media) { media.status = 'approved'; media.path = media.kind === 'audio' ? audio : image; }
  const result = validateUnit(unit);
  assert.ok(result.success, result.success ? '' : result.error.message);
  return result.data;
}
