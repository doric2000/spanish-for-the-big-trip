const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const unit = JSON.parse(fs.readFileSync(path.join(root, 'content/units/unit1a.json'), 'utf8'));
function compile(relative, requireMock) {
  const filename = path.join(__dirname, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: requireMock ?? (() => { throw new Error('Unexpected runtime dependency'); }) }, { filename });
  return exports;
}
const data = compile('../src/lesson/opening-data.ts');

test('mobile preview reads the actual preparation prefix and never skips an unsupported interaction', () => {
  const before = JSON.stringify(unit);
  const steps = data.openingSteps(unit);
  assert.equal(steps.length, 6);
  assert.equal(steps[0].bodyHe, unit.activities[0].bodyHe);
  assert.equal(steps[0].actionLabelHe, unit.activities[0].actionLabelHe);
  assert.equal(JSON.stringify(steps).includes('correctChoiceId'), false);
  assert.equal(JSON.stringify(steps).includes('review'), false);
  assert.equal(JSON.stringify(unit), before);
  const interrupted = structuredClone(unit);
  interrupted.activities.splice(2, 0, { type: 'explanation', id: 'new-required-preparation' });
  assert.equal(data.openingSteps(interrupted).length, 2, 'do not skip unseen preparation to render later cards');
});

test('pending audio is unavailable even if a historical path exists; only the approved recording is offered', () => {
  const draft = structuredClone(unit);
  draft.media.find(m => m.id === 'juan-hola-v1').path = 'assets/old-audition.mp3';
  const cards = data.openingSteps(draft).filter(s => s.type === 'vocabulary');
  assert.equal(cards[0].audioPath, null);
  assert.equal(cards.filter(c => c.audioPath !== null).length, 1);
  assert.equal(cards[1].expressionEs, 'Buenos días');
  assert.ok(fs.existsSync(path.join(root, cards[1].audioPath)));
  draft.media.find(m => m.id === 'juan-buenos-dias-v1').status = 'pending';
  assert.equal(data.openingSteps(draft).filter(s => s.type === 'vocabulary').every(c => c.audioPath === null), true);
});

test('production App never loads the unpublished preview; development can switch to the preserved recorder and back', () => {
  for (const development of [false, true]) {
    const source = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    let recorderOpen = false;
    let previewLoads = 0;
    function AudioLab() {}
    function OpeningPreview() {}
    const exports = {};
    vm.runInNewContext(outputText, {
      exports, __DEV__: development,
      require(name) {
        if (name === 'react') return { useState: () => [recorderOpen, value => { recorderOpen = value; }] };
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
        if (name === './src/audio-lab') return { __esModule: true, default: AudioLab };
        if (name === './src/lesson/opening-preview') {
          assert.equal(development, true, 'release cannot require draft content');
          previewLoads += 1;
          return { default: OpeningPreview };
        }
        throw new Error(name);
      },
    });
    const first = exports.default();
    if (!development) {
      assert.equal(first.type, AudioLab);
      assert.equal(first.props.onBack, undefined);
      assert.equal(previewLoads, 0);
    } else {
      assert.equal(first.type, OpeningPreview);
      first.props.onOpenRecorder();
      const recorder = exports.default();
      assert.equal(recorder.type, AudioLab);
      recorder.props.onBack();
      assert.equal(exports.default().type, OpeningPreview);
    }
  }
});
