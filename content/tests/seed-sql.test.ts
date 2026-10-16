import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ChapterPlanSchema } from '../src/chapter-release.js';
import { buildDraftSeedSql, sqlText } from '../src/seed-sql.js';
import { realDraft } from './fixtures.js';

const plan = ChapterPlanSchema.parse(JSON.parse(await readFile(new URL('../../release-plan.json', import.meta.url), 'utf8')));
const digest = 'a'.repeat(64);

function payloadOf(sql: string): unknown {
  const match = sql.match(/values \('C01-U01', 1, 2, '((?:[^']|'')*)'::jsonb/);
  assert.ok(match, 'payload literal not found');
  return JSON.parse(match[1]!.replaceAll("''", "'"));
}

test('seed SQL stores the validated 1A draft exactly and idempotently', () => {
  const unit = realDraft();
  const sql = buildDraftSeedSql(plan, unit, digest, 'content/units/unit1a.json');
  assert.deepEqual(payloadOf(sql), unit, 'stored JSON must round-trip to the validated unit');
  assert.match(sql, /values \('spanish-for-the-big-trip', 'ספרדית לטיול הגדול'\)/);
  assert.match(sql, /values \('C01', 'spanish-for-the-big-trip', 'מפגש ראשון עם מטייל', 1\)/);
  assert.match(sql, /values \('C01-U01', 'C01', array\['1A'\]::text\[\], 'המפגש הראשון', 1\)/);
  assert.equal((sql.match(/on conflict/g) ?? []).length, 4, 'every insert must be safe to rerun');
  assert.match(sql, /where public\.unit_revisions\.status = 'draft'/, 'published rows are never overwritten');
  assert.match(sql, /raise exception/, 'a published revision with other content must stop the script');
  assert.ok(sql.includes(`'${digest}'`));
});

test('seed SQL escapes single quotes in authored text', () => {
  const unit = realDraft();
  unit.titleHe = "המפגש ה'ראשון'";
  const sql = buildDraftSeedSql(plan, unit, digest, 'content/units/unit1a.json');
  assert.ok(sql.includes("'המפגש ה''ראשון'''"));
  assert.deepEqual(payloadOf(sql), unit);
  assert.equal(sqlText("it's"), "'it''s'");
  assert.throws(() => sqlText('a\0b'), /NUL/);
});

test('seed SQL refuses published revisions, unplanned units and bad digests', () => {
  const published = realDraft();
  published.status = 'published';
  assert.throws(() => buildDraftSeedSql(plan, published, digest, 'x'), /Only draft revisions/);

  const unplanned = realDraft();
  unplanned.id = 'C01-U99';
  assert.throws(() => buildDraftSeedSql(plan, unplanned, digest, 'x'), /not planned/);

  const otherChapter = realDraft();
  otherChapter.chapterId = 'C99';
  assert.throws(() => buildDraftSeedSql(plan, otherChapter, digest, 'x'), /not in the release plan/);

  assert.throws(() => buildDraftSeedSql(plan, realDraft(), 'not-a-digest', 'x'), /SHA-256/);
});
