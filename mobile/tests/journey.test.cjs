const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(relative) {
  const filename = path.join(__dirname, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: () => { throw new Error('Unexpected runtime dependency'); } }, { filename });
  return exports;
}

const journey = compile('../src/map/journey.ts');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/curriculum/curriculum-plan.json'), 'utf8'));
const chapters = journey.journeyFromPlan(plan.chapters, ['C01']);

test('the map follows the curriculum order, so the airport chapter (C16) comes eighth', () => {
  assert.equal(chapters.length, plan.chapters.length);
  assert.deepEqual([...chapters.map(c => c.number)], [...chapters.map((_, i) => i + 1)]);
  assert.equal(chapters[7].id, 'C16');
  assert.equal(chapters[0].title, 'מפגש ראשון עם מטייל');
  assert.deepEqual([...chapters[0].unitTitles], ['המפגש הראשון', 'בקשה לשמוע שוב', 'פנייה בנימוס כשלא הבנתי']);
});

test('only open chapters are open, and only they get unit stamps', () => {
  assert.deepEqual([...chapters.filter(c => c.open).map(c => c.id)], ['C01']);
  const layout = journey.layoutJourney(chapters);
  assert.equal(layout.posters.length, chapters.length);
  assert.equal(layout.stamps.length, 3);
  assert.ok(layout.stamps.every(s => s.chapterId === 'C01'));
  assert.deepEqual([...layout.stamps.map(s => s.current)], [true, false, false], 'exactly one current unit');
});

test('posters alternate sides, stay inside the map, and never overlap each other', () => {
  const { posters, stamps, height } = journey.layoutJourney(chapters);
  posters.forEach((p, i) => {
    assert.equal(p.onRight, i % 2 === 0);
    assert.ok(p.x >= 0 && p.x + journey.POSTER.width <= journey.MAP_WIDTH, `poster ${i} fits`);
    if (i > 0) assert.ok(p.y >= posters[i - 1].y + journey.POSTER.height, `poster ${i} below the previous one`);
  });
  for (const s of stamps) assert.ok(s.y - journey.STAMP / 2 > posters[0].y + journey.POSTER.height, 'stamps come after their poster');
  assert.ok(height > posters.at(-1).y + journey.POSTER.height);
});

test('the route visits every poster and stamp in order and the open part ends after the last unit', () => {
  const layout = journey.layoutJourney(chapters);
  assert.equal(layout.route.length, layout.posters.length + layout.stamps.length + 1);
  assert.equal(layout.openPoints, 4, 'chapter 1 poster plus its three units');
  const d = journey.routePath(layout.route);
  assert.match(d, /^M\d/);
  assert.equal((d.match(/C/g) || []).length, layout.route.length - 1);
});

test('the map fits every iPhone width without scaling: nothing crosses the screen edge', () => {
  // A 390pt canvas scaled to a wider RTL screen once pushed the map off the screen.
  for (const width of [320, 375, 390, 402, 430, 440]) {
    const { posters, stamps, route } = journey.layoutJourney(chapters, 150, width);
    for (const p of posters) assert.ok(p.x >= 0 && p.x + journey.POSTER.width <= width, `poster at ${width}pt`);
    for (const s of stamps) assert.ok(s.x - journey.STAMP / 2 >= 0 && s.x + journey.STAMP / 2 <= width, `stamp at ${width}pt`);
    for (const [x] of route) assert.ok(x >= 0 && x <= width, `route at ${width}pt`);
  }
  const screen = fs.readFileSync(path.join(__dirname, '../src/map/journey-screen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /transformOrigin/, 'no scaled canvas');
  assert.match(screen, /layoutJourney\(chapters, \d+, width\)/, 'layout uses the measured width');
  assert.match(screen, /sceneImage: \{[^}]*width: POSTER\.width - 12, height: POSTER\.height - 12/, 'scene image has an explicit size');
});
