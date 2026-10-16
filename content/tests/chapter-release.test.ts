import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkChapterRelease } from '../src/chapter-release.js';
import { validateUnit, type Unit } from '../src/schema.js';
import { publishableUnit } from './fixtures.js';
import { unitDigest } from '../src/digest.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = async (name: string) => JSON.parse(await readFile(new URL(`../../${name}`, import.meta.url), 'utf8'));
const plan = await read('release-plan.json');
const pendingReviews = await read('release-reviews.json');
const realDraft = await read('units/unit1a.json');

async function fixture() {
  const reviews = structuredClone(pendingReviews);
  const units: Unit[] = [];
  for (const chapter of plan.chapters) {
    const review = reviews.chapters.find((r: { chapterId: string }) => r.chapterId === chapter.id)!;
    for (const check of Object.values(review.checks) as { status: string; evidence: string | null }[]) {
      check.status = 'passed';
      check.evidence = 'Synthetic test evidence only; not a real chapter approval';
    }
    for (const id of chapter.unitIds) {
      const unit = publishableUnit();
      unit.id = id;
      unit.chapterId = chapter.id;
      unit.aliases = [];
      unit.requires = units.length ? [units.at(-1)!.provides[0]!] : [];
      unit.provides = [plan.skillIds[units.length]];
      unit.pendingStages = [];
      for (const activity of unit.activities) activity.review.status = 'approved';
      for (const asset of unit.media) {
        const knownPath = unit.media.find(m => m.kind === asset.kind && m.status === 'approved' && m.path)?.path;
        assert.ok(knownPath);
        asset.path = knownPath;
        asset.status = 'approved';
      }
      review.unitRevisions[id] = unit.revision;
      review.unitDigests[id] = await unitDigest(unit, root);
      units.push(unit);
    }
  }
  return { reviews, units };
}

test('opening sequence preserves all three and four units; real draft cannot release a chapter', async () => {
  assert.deepEqual(plan.productionOrder, ['C01', 'C02']);
  assert.deepEqual(plan.chapters.map((c: { unitIds: string[] }) => c.unitIds.length), [3, 4]);
  const result = await checkChapterRelease(plan, pendingReviews, [realDraft], ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('missing unit C01-U02')));
  assert.ok(result.issues.some(i => i.includes('missing unit C01-U03')));
  assert.ok(result.issues.some(i => i.includes('contentCopy')));
  assert.ok(result.issues.some(i => i.includes('pendingStages')));
  assert.equal(realDraft.status, 'draft');
});

test('a complete first chapter may release without unfinished chapter two', async () => {
  const { reviews, units } = await fixture();
  const result = await checkChapterRelease(plan, reviews, units.filter(u => u.chapterId === 'C01'), ['C01'], root);
  assert.equal(result.ready, true, result.issues.join('\n'));
  assert.deepEqual(result.unitIds, plan.chapters[0].unitIds);
});

test('both complete synthetic chapters pass without modifying real lesson sources', async () => {
  const { reviews, units } = await fixture();
  const result = await checkChapterRelease(plan, reviews, units, ['C01', 'C02'], root);
  assert.equal(result.ready, true, result.issues.join('\n'));
  assert.equal(result.unitIds.length, 7);
  assert.equal(realDraft.status, 'draft');
  assert.ok(realDraft.pendingStages.length > 0);
});

test('partial chapters are blocked even if every loaded unit is structurally ready', async () => {
  const { reviews, units } = await fixture();
  const result = await checkChapterRelease(plan, reviews, units.slice(0, -1), ['C01', 'C02'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('missing unit C02-U04')));
});

test('empty, skipped, duplicate, reversed and unknown chapter selections are blocked', async () => {
  const { reviews, units } = await fixture();
  for (const selection of [[], ['C02'], ['C01', 'C01'], ['C02', 'C01'], ['C01', 'C02', 'C99']]) {
    assert.equal((await checkChapterRelease(plan, reviews, units, selection, root)).ready, false);
  }
});

test('a unit cannot be substituted from a different chapter or counted twice', async () => {
  const { reviews, units } = await fixture();
  units[0]!.chapterId = 'C02';
  const result = await checkChapterRelease(plan, reviews, [...units, units[1]!], ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('belongs to C02')));
  assert.ok(result.issues.some(i => i.includes('Duplicate unit source')));
});

test('every human/device check needs evidence tied to the current unit revisions', async () => {
  const { reviews, units } = await fixture();
  reviews.chapters[0].checks.iphoneFlow.evidence = null;
  units[0]!.revision += 1;
  const result = await checkChapterRelease(plan, reviews, units, ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('iphoneFlow')));
  assert.ok(result.issues.some(i => i.includes('does not cover revision')));
});

test('unreviewed copy and pending stages still block a complete chapter', async () => {
  const { reviews, units } = await fixture();
  units[0]!.activities[0]!.review.status = 'needs_review';
  units[1]!.pendingStages = ['summary'];
  const result = await checkChapterRelease(plan, reviews, units, ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('review')));
  assert.ok(result.issues.some(i => i.includes('pendingStages')));
});

test('declared ready audio must actually exist', async () => {
  const { reviews, units } = await fixture();
  units[0]!.media.find(m => m.kind === 'audio')!.path = 'assets/no-such-chapter-audio.mp3';
  const result = await checkChapterRelease(plan, reviews, units, ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('approved file is missing')));
});

test('editing content under an unchanged revision invalidates chapter evidence', async () => {
  const { reviews, units } = await fixture();
  units[0]!.titleHe += ' changed';
  const result = await checkChapterRelease(plan, reviews, units, ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('content and media digest')));
});

test('chapter evidence cannot be reused after silently changing planned membership', async () => {
  const { reviews, units } = await fixture();
  const changed = structuredClone(plan);
  changed.chapters[0].unitIds.pop();
  const result = await checkChapterRelease(changed, reviews, units, ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('exactly the planned')));
});

test('a prerequisite cannot come from a later unit', async () => {
  const { reviews, units } = await fixture();
  units[0]!.requires = [units[1]!.provides[0]!];
  const result = await checkChapterRelease(plan, reviews, units, ['C01'], root);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.includes('prerequisite not provided earlier')));
});

test('malformed manifests and duplicate chapter reviews are rejected', async () => {
  const { reviews, units } = await fixture();
  const badPlan = structuredClone(plan);
  badPlan.chapters[0].unitIds.push(badPlan.chapters[0].unitIds[0]);
  assert.equal((await checkChapterRelease(badPlan, reviews, units, ['C01'], root)).ready, false);
  reviews.chapters.push(structuredClone(reviews.chapters[0]));
  assert.equal((await checkChapterRelease(plan, reviews, units, ['C01'], root)).ready, false);
});
