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
// The same projection the API returns (content/ is built first: npm --prefix ../content run build).
const { projectUnit } = require(path.join(root, 'content/dist/src/api-contract.js'));
const projected = (source, urls = {}) => projectUnit(source, urls, {}, { allowDraft: true });
test('mobile preview reads the actual preparation prefix and never skips an unsupported interaction', () => {
  const learnerUnit = projected(unit);
  const steps = data.openingSteps(learnerUnit);
  // Entry, seven cards, the explanation, two checks, the dialogue, the practice check,
  // two speaking practices and arranging words; the scenario is not built yet.
  assert.equal(JSON.stringify(steps.map(s => s.type)), JSON.stringify(['entry', ...Array(7).fill('vocabulary'), 'explanation', 'listen_select', 'listen_select', 'dialogue', 'listen_select', 'speak', 'speak', 'arrange']));
  assert.equal(unit.activities[steps.length].type, 'bounded_scenario');
  assert.equal(steps[0].bodyHe, unit.activities[0].bodyHe);
  assert.equal(steps[0].actionLabelHe, unit.activities[0].actionLabelHe);
  assert.equal(steps[0].sceneAssetId, 'juan-hostel-v1');
  assert.equal(steps[0].kickerHe, 'פרק ראשון');
  assert.equal(steps[0].sceneCaption, 'HOSTEL · 07:30');
  assert.equal(steps[0].characterNameHe, 'חואן');
  assert.equal(steps[1].characterNameHe, 'חואן');
  const interrupted = structuredClone(learnerUnit);
  interrupted.activities.splice(2, 0, { type: 'bounded_scenario', id: 'new-required-preparation' });
  assert.equal(data.openingSteps(interrupted).length, 2, 'do not skip unseen preparation to render later cards');
});

test('entry poster details are optional: a unit without them shows none', () => {
  const bare = projected(unit);
  for (const key of ['kickerHe', 'sceneCaption', 'characterId']) delete bare.activities[0][key];
  const [entry] = data.openingSteps(bare);
  assert.deepEqual([entry.kickerHe, entry.sceneCaption, entry.characterNameHe], [null, null, null]);
});

test('unit and header codes come from the stable unit id', () => {
  assert.deepEqual({ ...data.unitCodes('C01-U01') }, { short: '1A', long: 'C01·U01' });
  assert.deepEqual({ ...data.unitCodes('C02-U04') }, { short: '2D', long: 'C02·U04' });
  assert.deepEqual({ ...data.unitCodes('draft-x') }, { short: 'draft-x', long: 'draft-x' }, 'unknown shapes are shown as is');
  assert.equal(data.activityCode('C01-U01', 0, 16), '1A·01/16');
  assert.equal(data.activityCode('C01-U01', 15, 16), '1A·16/16');
});

test('entry screen: explicit image size, padded centring, no hard-coded unit copy', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/entry-screen.tsx'), 'utf8');
  // Sized only by its edges, iOS drew Juan's scene at pixel size (Dor's iPhone, 2026-10-17).
  assert.match(screen, /<Image source=\{source\} style=\{\{ width, height \}\}/);
  // alignSelf on the RTL ScrollView content was ignored and the column sat on the right edge.
  assert.doesNotMatch(screen, /alignSelf: 'center'/);
  for (const copy of ['חואן', 'HOSTEL', 'פרק ראשון', 'בוא נתחיל']) assert.equal(screen.includes(copy), false, copy);
});

test('vocabulary cards carry the character image id; long expressions use the long-text state', () => {
  const cards = data.openingSteps(projected(unit)).filter(s => s.type === 'vocabulary');
  assert.equal(JSON.stringify(cards.map(c => c.expressionEs)), JSON.stringify(['Hola', 'Buenos días', 'Gracias', 'Sí', 'No', 'Café', 'Azúcar']));
  assert.ok(cards.every(c => c.characterImageAssetId === 'juan-reference-v1' && c.characterImageUrl === null));
  assert.equal(JSON.stringify(cards.map(c => data.isLongExpression(c.expressionEs))), JSON.stringify([false, true, false, false, false, false, false]));
});

test('vocabulary card screen: fixed heading, unit copy from data, disabled play without a file', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/vocabulary-card-screen.tsx'), 'utf8');
  assert.match(screen, /const TITLE_HE = 'המילים שנצטרך'/);
  // An auto-fitting heading needs a definite width: flex 1, not only flexShrink.
  assert.match(screen, /title: \{ flex: 1,/);
  for (const copy of ['Hola', 'שלום', 'חואן']) assert.equal(screen.includes(`'${copy}'`) || screen.includes(`>${copy}<`), false, copy);
  assert.match(screen, /audio \? <Playback[^]*: <LessonAudioButton label="השמעה" playing=\{false\} disabled/);
  // The avatar image has an explicit size (see the entry screen test).
  const avatar = fs.readFileSync(path.join(__dirname, '../src/lesson/lesson-avatar.tsx'), 'utf8');
  assert.match(avatar, /width: crop\.imageWidth \* scale, height: crop\.imageHeight \* scale/);
  assert.doesNotMatch(screen, /alignSelf: 'center'/);
});

test('every bundled development file exists', () => {
  const media = fs.readFileSync(path.join(__dirname, '../src/lesson/media.ts'), 'utf8');
  const files = [...media.matchAll(/require\('([^']+)'\)/g)].map(m => path.resolve(__dirname, '../src/lesson', m[1]));
  assert.ok(files.length >= 3);
  for (const file of files) assert.ok(fs.existsSync(file), file);
});

test('media URLs come only from the server projection: pending audio stays null even with a URL', () => {
  const urls = { 'juan-buenos-dias-v1': 'https://assets.example/buenos-dias.mp3', 'juan-hola-v1': 'https://assets.example/old-hola.mp3' };
  const cards = data.openingSteps(projected(unit, urls)).filter(s => s.type === 'vocabulary');
  assert.equal(cards[0].expressionEs, 'Hola');
  assert.equal(cards[0].audioUrl, null, 'pending audio is not served');
  assert.equal(cards[1].audioUrl, urls['juan-buenos-dias-v1']);
  const urlsOf = s => s.type === 'entry' ? [s.sceneUrl] : s.type === 'explanation' ? s.examples.map(e => e.audioUrl)
    : s.type === 'dialogue' ? s.turns.flatMap(t => [t.audioUrl, t.imageUrl]) : s.type === 'arrange' ? [] : [s.audioUrl];
  assert.equal(data.openingSteps(projected(unit)).flatMap(urlsOf).every(url => url === null), true, 'nothing hosted yet');
  const check = data.openingSteps(projected(unit, urls)).find(s => s.type === 'listen_select');
  assert.equal(check.audioUrl, null, 'the pending Hola recording is not served on the check either');
});

test('the explanation step carries the rule and each example with its own question recording', () => {
  const source = unit.activities.find(a => a.type === 'explanation');
  const step = data.openingSteps(projected(unit)).find(s => s.type === 'explanation');
  assert.equal(step.id, 'u1a-explain-question');
  assert.equal(step.titleHe, source.titleHe);
  assert.equal(step.generalHe, source.generalHe);
  assert.equal(JSON.stringify(step.examples.map(e => [e.textEs, e.meaningHe, e.audioAssetId, e.audioUrl])),
    JSON.stringify([['¿Café?', 'קפה?', 'juan-cafe-question-v1', null], ['¿Azúcar?', 'סוכר?', 'juan-azucar-question-v1', null]]),
    'pending recordings are not served yet');
  // The word recordings say Café flat; the example must never fall back to them.
  assert.notEqual(step.examples[0].audioAssetId, 'juan-cafe-v1');
  const bare = projected(unit);
  for (const example of bare.activities.find(a => a.type === 'explanation').examples) delete example.audioAssetId;
  const silent = data.openingSteps(bare).find(s => s.type === 'explanation');
  assert.equal(silent.examples.every(e => e.audioAssetId === null && e.audioUrl === null), true, 'an example without audio shows a disabled button');
});

test('explanation screen: lesson copy only from data, one player per example, disabled play without a file', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/explanation-screen.tsx'), 'utf8');
  for (const copy of ['שאלה במילה אחת', 'Café', 'קפה', 'ממש כמו בעברית']) assert.equal(screen.includes(copy), false, copy);
  assert.match(screen, /<PlayButton label=\{`השמעה: \$\{example\.textEs\}`\} playing=\{false\} disabled/);
  // Starting one example stops the other.
  assert.match(screen, /if \(current !== index\) pause\(\);\s*\}, \[current, index, pause\]\)/);
  assert.match(screen, /accessibilityLanguage="es-MX"/);
  assert.doesNotMatch(screen, /alignSelf: 'center'|row-reverse|textAlign: 'right'/);
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.match(preview, /step\?\.type === 'explanation'[^]*onNext=\{advance\} onBack=\{back\}/);
});

test('the preview no longer bundles the raw unit with its answers', () => {
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.equal(preview.includes('units/unit1a.json'), false);
  assert.match(preview, /fetchUnit\(/);
});

function loadRoute(relative, development, modules) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app', relative), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, __DEV__: development,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name in modules) return modules[name]();
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports.default;
}

test('home is the trip map; only development builds can start the draft unit from it', () => {
  for (const development of [false, true]) {
    const pushed = [];
    function JourneyScreen() {}
    const Home = loadRoute('index.tsx', development, {
      'expo-router': () => ({ router: { push: href => pushed.push(href) } }),
      '../map/journey-screen': () => ({ __esModule: true, default: JourneyScreen }),
    });
    const screen = Home();
    assert.equal(screen.type, JourneyScreen);
    screen.props.onOpenAccount();
    if (development) screen.props.onStartUnit();
    else assert.equal(screen.props.onStartUnit, undefined, 'release has nothing to start yet');
    assert.equal(JSON.stringify(pushed), JSON.stringify(development ? ['/account', '/lesson'] : ['/account']));
  }
});

test('lesson route never loads the draft preview in production and links to recorder/account in development', () => {
  for (const development of [false, true]) {
    const pushed = [];
    let previewLoads = 0;
    function AudioLab() {}
    function OpeningPreview() {}
    const Home = loadRoute('lesson.tsx', development, {
      'expo-router': () => ({ router: { push: href => pushed.push(href), back: () => pushed.push('back') } }),
      '../audio-lab': () => ({ __esModule: true, default: AudioLab }),
      '../lesson/opening-preview': () => {
        assert.equal(development, true, 'release cannot require draft content');
        previewLoads += 1;
        return { default: OpeningPreview };
      },
    });
    const screen = Home();
    if (!development) {
      assert.equal(screen.type, AudioLab);
      assert.equal(previewLoads, 0);
    } else {
      assert.equal(screen.type, OpeningPreview);
      screen.props.onOpenRecorder();
      screen.props.onOpenAccount();
      screen.props.onClose();
      assert.equal(JSON.stringify(pushed), JSON.stringify(['/recorder', '/account', 'back']));
    }
  }
});

test('root layout: splash and loading first, sign-in only when signed out, app screens only when signed in', () => {
  let session;
  const splash = { held: 0, hidden: 0 };
  let fonts = false;
  function View() {}
  function ActivityIndicator() {}
  function Provider() {}
  const Stack = Object.assign(function Stack() {}, { Screen() {}, Protected() {} });
  const Layout = loadRoute('_layout.tsx', true, {
    'expo-router': () => ({ Stack }),
    '@expo-google-fonts/karantina': () => ({}),
    '@expo-google-fonts/rubik': () => ({}),
    '@expo-google-fonts/space-mono': () => ({}),
    'expo-font': () => ({ useFonts: () => [fonts, null] }),
    'expo-splash-screen': () => ({ preventAutoHideAsync: async () => { splash.held++; return true; }, hide: () => { splash.hidden++; } }),
    // Effects run right away here: the layout is called as a plain function, not rendered by React.
    react: () => ({ useEffect: effect => { effect(); } }),
    'react-native': () => ({ View, ActivityIndicator }),
    '../auth/session-context': () => ({ SessionContext: { Provider } }),
    '../auth/use-session': () => ({ useSession: () => session }),
    '../theme': () => ({ theme: { colors: { background: '#fff', primary: '#000' } }, retro: { colors: { night: '#000', gold: '#fff' } } }),
  });
  const guards = tree => {
    const [signInGroup, appGroup] = tree.props.children.props.children;
    return {
      signIn: signInGroup.props.guard, signInScreens: [signInGroup.props.children].flat().map(s => s.props.name),
      app: appGroup.props.guard, appScreens: [appGroup.props.children].flat().map(s => s.props.name),
    };
  };
  assert.equal(splash.held, 1, 'the splash is held from the moment the layout module loads');
  session = undefined;
  assert.equal(Layout().type, View, 'nothing is shown until the saved session is read');
  assert.equal(splash.hidden, 0, 'the splash stays up while the session is unknown');
  session = null;
  assert.equal(Layout().type, View, 'still loading until the fonts are ready');
  assert.equal(splash.hidden, 0, 'the splash waits for the fonts too');
  fonts = true;
  let g = guards(Layout());
  assert.equal(g.signIn, true);
  assert.equal(g.app, false, 'no guest mode');
  assert.equal(JSON.stringify(g.signInScreens), JSON.stringify(['sign-in']));
  assert.equal(JSON.stringify(g.appScreens), JSON.stringify(['index', 'lesson', 'account', 'recorder']));
  assert.equal(splash.hidden, 1, 'the splash hides once we know the user is signed out');
  session = { user: { id: 'user-a' } };
  const signedIn = Layout();
  g = guards(signedIn);
  assert.equal(g.signIn, false);
  assert.equal(g.app, true);
  assert.equal(signedIn.type, Provider);
  assert.equal(signedIn.props.value, session);
});

test('every screen file under src/app is declared in the root layout', () => {
  const routes = fs.readdirSync(path.join(__dirname, '../src/app'))
    .filter(f => f.endsWith('.tsx') && f !== '_layout.tsx').map(f => f.replace(/\.tsx$/, '')).sort();
  const layout = fs.readFileSync(path.join(__dirname, '../src/app/_layout.tsx'), 'utf8');
  const declared = [...layout.matchAll(/Stack\.Screen name="([^"]+)"/g)].map(m => m[1]).sort();
  assert.equal(JSON.stringify(routes), JSON.stringify(declared), 'an undeclared route would bypass the sign-in guard');
});

test('the server progress decides where the lesson resumes; past the supported steps is the end screen', () => {
  const steps = data.openingSteps(projected(unit));
  const at = (currentActivityId, status = 'in_progress') => ({ status, currentActivityId, revision: 1, progressVersion: 0 });
  assert.equal(data.frontierIndex(steps, at('u1a-entry')), 0);
  assert.equal(data.frontierIndex(steps, at(steps[3].id)), 3);
  assert.equal(data.frontierIndex(steps, at('u1a-vocab-azucar')), 7);
  assert.equal(data.frontierIndex(steps, at('u1a-explain-question')), 8);
  assert.equal(data.frontierIndex(steps, at('u1a-check-offer')), 10);
  assert.equal(data.frontierIndex(steps, at('u1a-dialogue')), 11);
  assert.equal(data.frontierIndex(steps, at('u1a-practice-listen')), 12);
  assert.equal(data.frontierIndex(steps, at('1a-speak-thanks')), 13);
  assert.equal(data.frontierIndex(steps, at('u1a-speak-decline')), 14);
  assert.equal(data.frontierIndex(steps, at('1a-arrange-greeting')), 15);
  // The scenario is not built yet: the preview ends there.
  assert.equal(data.frontierIndex(steps, at('1a-ending-scenario')), steps.length);
  assert.equal(data.frontierIndex(steps, at(null, 'completed')), steps.length);
});

test('a continue request comes from the saved progress and carries no user id or outcome', () => {
  const progress = { status: 'in_progress', currentActivityId: 'u1a-vocab-hola', revision: 1, progressVersion: 1, userId: 'not-sent' };
  const request = data.continueRequest(progress, '00000000-0000-4000-8000-000000000001');
  assert.equal(JSON.stringify(request), JSON.stringify({ requestId: '00000000-0000-4000-8000-000000000001', revision: 1,
    activityId: 'u1a-vocab-hola', expectedProgressVersion: 1, response: { kind: 'continue' } }));
  // It must pass the server's own schema.
  const { AttemptRequestSchema } = require(path.join(root, 'content/dist/src/api-contract.js'));
  assert.equal(AttemptRequestSchema.safeParse(request).success, true);
});

test('a saved tap is restored only for the same learner, unit and exact server position', () => {
  const me = '00000000-0000-4000-8000-0000000000aa';
  const progress = { status: 'in_progress', currentActivityId: 'u1a-vocab-hola', revision: 1, progressVersion: 1 };
  const request = data.continueRequest(progress, '00000000-0000-4000-8000-000000000001');
  const saved = (overrides = {}) => JSON.stringify({ userId: me, unitId: 'C01-U01', request, ...overrides });

  // Same place: resent with its original requestId.
  assert.equal(data.restorablePending(saved(), me, 'C01-U01', progress).requestId, request.requestId);
  // Another learner signed in on this phone, or another unit.
  assert.equal(data.restorablePending(saved(), '00000000-0000-4000-8000-0000000000bb', 'C01-U01', progress), null);
  assert.equal(data.restorablePending(saved({ unitId: 'C01-U02' }), me, 'C01-U01', progress), null);
  // The server already stored it (its answer was lost): progress moved, so resending
  // would replay the old answer and jump back. Dropped.
  assert.equal(data.restorablePending(saved(), me, 'C01-U01', { ...progress, currentActivityId: 'u1a-vocab-buenos-dias', progressVersion: 2 }), null);
  assert.equal(data.restorablePending(saved(), me, 'C01-U01', { ...progress, status: 'completed', currentActivityId: null }), null);
  // Nothing saved, damaged JSON, or a request that is not exactly a continue.
  assert.equal(data.restorablePending(null, me, 'C01-U01', progress), null);
  assert.equal(data.restorablePending('{not json', me, 'C01-U01', progress), null);
  assert.equal(data.restorablePending(saved({ request: { ...request, response: { kind: 'skip' } } }), me, 'C01-U01', progress), null);
  assert.equal(data.restorablePending(saved({ request: { ...request, outcome: 'correct' } }), me, 'C01-U01', progress), null);
});

test('the listen-select step carries the question and choices but never the answer or the expression', () => {
  const check = data.openingSteps(projected(unit)).find(s => s.type === 'listen_select');
  const source = unit.activities.find(a => a.id === 'u1a-primer-listen');
  assert.equal(check.titleHe, 'ננסה יחד');
  assert.equal(check.promptHe, source.promptHe);
  assert.equal(JSON.stringify(check.choices), JSON.stringify(source.choices));
  assert.equal(check.allowWrittenHint, true);
  assert.equal(check.characterNameHe, 'חואן');
  assert.equal(check.characterImageAssetId, 'juan-reference-v1');
  const text = JSON.stringify(check);
  for (const secret of ['correctChoiceId', 'Hola.', source.feedback.correctHe, source.feedback.retryHe]) assert.equal(text.includes(secret), false, secret);
});

test('choice and hint requests pass the server schema and carry no outcome', () => {
  const { AttemptRequestSchema } = require(path.join(root, 'content/dist/src/api-contract.js'));
  const progress = { status: 'in_progress', currentActivityId: 'u1a-primer-listen', revision: 1, progressVersion: 6 };
  const id = '00000000-0000-4000-8000-000000000002';
  const choice = data.attemptRequest(progress, id, { kind: 'choice', choiceId: 'thanks' });
  assert.equal(JSON.stringify(choice), JSON.stringify({ requestId: id, revision: 1, activityId: 'u1a-primer-listen',
    expectedProgressVersion: 6, response: { kind: 'choice', choiceId: 'thanks' } }));
  assert.equal(AttemptRequestSchema.safeParse(choice).success, true);
  assert.equal(AttemptRequestSchema.safeParse(data.attemptRequest(progress, id, { kind: 'written_hint' })).success, true);
});

test('only the same unconfirmed tap reuses its requestId', () => {
  const progress = { status: 'in_progress', currentActivityId: 'u1a-primer-listen', revision: 1, progressVersion: 6 };
  const sent = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000003', { kind: 'choice', choiceId: 'thanks' });
  assert.equal(data.sameTap(sent, progress, { kind: 'choice', choiceId: 'thanks' }), true);
  assert.equal(data.sameTap(sent, progress, { kind: 'choice', choiceId: 'hello' }), false, 'another answer is a new tap');
  assert.equal(data.sameTap(sent, progress, { kind: 'written_hint' }), false);
  assert.equal(data.sameTap(sent, { ...progress, progressVersion: 7 }, { kind: 'choice', choiceId: 'thanks' }), false, 'after the server moved on');
});

test('a saved answer or hint is restored only at the exact server position', () => {
  const me = '00000000-0000-4000-8000-0000000000aa';
  const progress = { status: 'in_progress', currentActivityId: 'u1a-primer-listen', revision: 1, progressVersion: 6 };
  for (const response of [{ kind: 'choice', choiceId: 'hello' }, { kind: 'written_hint' }]) {
    const request = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000004', response);
    const saved = (r = request) => JSON.stringify({ userId: me, unitId: 'C01-U01', request: r });
    assert.equal(JSON.stringify(data.restorablePending(saved(), me, 'C01-U01', progress)), JSON.stringify(request));
    // A wrong answer the server stored bumps the version: the saved one is dropped.
    assert.equal(data.restorablePending(saved(), me, 'C01-U01', { ...progress, progressVersion: 7 }), null);
    assert.equal(data.restorablePending(saved({ ...request, response: { ...response, outcome: 'correct' } }), me, 'C01-U01', progress), null);
  }
  const bad = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000005', { kind: 'choice', choiceId: 'hello' });
  bad.response.choiceId = 7;
  assert.equal(data.restorablePending(JSON.stringify({ userId: me, unitId: 'C01-U01', request: bad }), me, 'C01-U01', progress), null);
});

test('listen-select screen: unit copy only from data, states only from the server reply', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/listen-select-screen.tsx'), 'utf8');
  for (const copy of ['ננסה יחד', 'מה פירוש', 'שלום', 'תודה', 'Hola', 'חואן', 'נכון!', 'לא בדיוק']) assert.equal(screen.includes(copy), false, copy);
  assert.equal(screen.includes('correctChoiceId'), false, 'the app never knows the answer');
  assert.match(screen, /result\.outcome === 'correct' \|\| result\.outcome === 'correct_with_help'/);
  assert.match(screen, /result\.outcome === 'retry'/);
  assert.doesNotMatch(screen, /alignSelf: 'center'/);
  // Figma's TAG code label is not drawn (Dor, 2026-10-25).
  assert.equal(screen.includes('TAG'), false);
});

test('listen-select screen: "חזרה" in every state only moves the view back', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/listen-select-screen.tsx'), 'utf8');
  // Question and hint: on the dark background. Retry, correct and a solved check seen again: on the sheet.
  assert.match(screen, /<LessonSecondaryButton label="חזרה" disabled=\{save\.busy\} onPress=\{onBack\} \/>/);
  assert.equal(screen.match(/<LessonSheetSecondaryButton label="חזרה" onPress=\{onBack\} \/>/g).length, 1, 'the retry sheet');
  assert.match(screen, /<ContinueSheet [^>]*onBack=\{onBack\}/);
  assert.match(screen, /<SuccessSheet [^>]*onBack=\{onBack\} \/>/);
  assert.match(screen, /<FeedbackSheet [^]*onBack=\{onBack\} \/>/);
  // The success and continue sheets share one row: "חזרה" and "ממשיכים".
  const sheet = fs.readFileSync(path.join(__dirname, '../src/lesson/lesson-sheet.tsx'), 'utf8');
  assert.match(sheet, /<LessonSheetSecondaryButton label="חזרה" onPress=\{onBack\} \/>[^]*<LessonDarkButton label="ממשיכים" onPress=\{onContinue\} \/>/);
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.match(preview, /<ListenSelectScreen [^]*onBack=\{back\} onClose=\{onClose\} \/>/);
  assert.match(preview, /const back = \(\) => \{ if \(!save\.busy\) setIndex\(current => moveOpeningStep\(current, 'back', steps\.length\)\); \};/);
});

test('the dialogue step carries every line with its speaker, translation and own recording', () => {
  const source = unit.activities.find(a => a.type === 'dialogue');
  const step = data.openingSteps(projected(unit)).find(s => s.type === 'dialogue');
  assert.equal(step.id, 'u1a-dialogue');
  assert.equal(step.titleHe, source.titleHe);
  assert.equal(step.translationInitiallyVisible, false);
  assert.equal(JSON.stringify(step.turns.map(t => [t.id, t.textEs, t.translationHe, t.audioAssetId])),
    JSON.stringify(source.turns.map(t => [t.id, t.textEs, t.translationHe, t.audioAssetId])));
  assert.equal(JSON.stringify(step.turns.map(t => t.speaker)), JSON.stringify(['character', 'learner', 'character', 'learner', 'character', 'learner']));
  assert.equal(JSON.stringify([...new Set(step.turns.map(t => t.speakerNameHe))]), JSON.stringify(['חואן', 'אתם']));
  // Juan's lines show his approved face; the learner's lines show the plane badge.
  assert.equal(step.turns.every(t => t.imageAssetId === (t.speaker === 'learner' ? null : 'juan-reference-v1')), true);
  assert.equal(step.turns.every(t => t.audioUrl === null), true, 'all six recordings are pending');
});

test('the whole-dialogue run plays lines with a recording in order and skips the rest', () => {
  const playable = [true, false, true, false, false, true];
  assert.equal(data.nextPlayable(playable, -1), 0);
  assert.equal(data.nextPlayable(playable, 0), 2);
  assert.equal(data.nextPlayable(playable, 2), 5);
  assert.equal(data.nextPlayable(playable, 5), null);
  assert.equal(data.nextPlayable(Array(6).fill(false), -1), null, 'no recording: the button is disabled');
});

test('dialogue screen: lesson copy only from data, one line at a time, disabled play without a file', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/dialogue-screen.tsx'), 'utf8');
  for (const copy of ['השיחה עם', 'חואן', 'אתם', 'Hola', 'Café', 'שלום', 'juan']) assert.equal(screen.includes(copy), false, copy);
  assert.match(screen, /<TurnPlay label=\{`השמעה: \$\{turn\.textEs\}`\} playing=\{false\} disabled/);
  assert.match(screen, /disabled=\{first === null\} onPress=\{toggleAll\}/);
  // Starting one line stops the other; tapping another line ends the run.
  assert.match(screen, /if \(current !== index\) pause\(\);\s*\}, \[current, index, pause\]\)/);
  assert.match(screen, /setSequence\(running => running === index \? running : null\)/);
  // Each line's translation is its own.
  assert.match(screen, /translated: shown\.includes\(turn\.id\)/);
  assert.match(screen, /accessibilityLanguage="es-MX"/);
  assert.doesNotMatch(screen, /alignSelf: 'center'|row-reverse|textAlign: 'right'/);
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.match(preview, /<DialogueScreen [^]*save=\{shownSave\} onNext=\{advance\} onBack=\{back\} onClose=\{onClose\} \/>/);
});

test('the lesson flow keeps an answer on its screen and moves only on continue', () => {
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.match(preview, /onAnswer=\{response => tap\(response, false\)\}/);
  assert.match(preview, /void tap\(\{ kind: 'continue' \}, true\)/);
  assert.match(preview, /reviewOnly=\{index < frontier\}/);
});

test('the speaking steps carry the prompt, the model line and its own recording', () => {
  const steps = data.openingSteps(projected(unit)).filter(s => s.type === 'speak');
  assert.equal(JSON.stringify(steps.map(s => s.id)), JSON.stringify(['1a-speak-thanks', 'u1a-speak-decline']));
  for (const step of steps) {
    const source = unit.activities.find(a => a.id === step.id);
    assert.equal(step.promptHe, source.promptHe);
    assert.equal(step.modelTextEs, source.modelTextEs);
    assert.equal(step.alternativeHe, source.alternativeHe);
    assert.equal(step.audioAssetId, source.audioAssetId);
    assert.equal(step.modelNoteHe, null);
    assert.equal(step.audioUrl, null, 'the model recordings are pending');
  }
  // The optional note under the model comes through when the unit has one.
  const withNote = projected(unit);
  const greet = withNote.activities.find(a => a.id === '1a-review-greet');
  withNote.activities = [greet];
  assert.equal(data.openingSteps(withNote)[0].modelNoteHe, greet.modelNoteHe);
});

test('a self-comparison passes the server schema, carries no score, and restores only exactly', () => {
  const { AttemptRequestSchema } = require(path.join(root, 'content/dist/src/api-contract.js'));
  const me = '00000000-0000-4000-8000-0000000000aa';
  const progress = { status: 'in_progress', currentActivityId: '1a-speak-thanks', revision: 1, progressVersion: 14 };
  for (const mode of ['recording', 'without_microphone']) {
    const response = { kind: 'self_comparison', mode, compared: true };
    const request = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000006', response);
    assert.equal(AttemptRequestSchema.safeParse(request).success, true, mode);
    assert.equal(JSON.stringify(request.response), JSON.stringify(response));
    const saved = r => JSON.stringify({ userId: me, unitId: 'C01-U01', request: r });
    assert.equal(JSON.stringify(data.restorablePending(saved(request), me, 'C01-U01', progress)), JSON.stringify(request));
    assert.equal(data.restorablePending(saved({ ...request, response: { ...response, compared: false } }), me, 'C01-U01', progress), null);
    assert.equal(data.restorablePending(saved({ ...request, response: { ...response, score: 90 } }), me, 'C01-U01', progress), null);
  }
  const unknown = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000007', { kind: 'self_comparison', mode: 'typed', compared: true });
  assert.equal(data.restorablePending(JSON.stringify({ userId: me, unitId: 'C01-U01', request: unknown }), me, 'C01-U01', progress), null);
});

test('speak screen: lesson copy only from data, both paths report a comparison, nothing is uploaded', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/speak-screen.tsx'), 'utf8');
  for (const copy of ['חואן', 'הכובע', 'Gracias', 'קפה', 'לתרגל בקול', 'juan']) assert.equal(screen.includes(copy), false, copy);
  assert.match(screen, /\{content\.alternativeHe\}/);
  assert.match(screen, /continueRow\('recording'\)/);
  assert.match(screen, /continueRow\('without_microphone'\)/);
  // A step seen again opens on the model; refusing the microphone offers the way without it.
  assert.match(screen, /useState<Phase>\(reviewOnly \? 'model' : 'ready'\)/);
  assert.match(screen, /<SheetButton label=\{content\.alternativeHe\} onPress=\{\(\) => setPhase\('model'\)\} \/>/);
  // Without its recording the model's play button is disabled.
  assert.match(screen, /<LessonAudioButton label="השמעה" playing=\{false\} disabled/);
  // Comments may say there is no score; the code may not show one.
  assert.doesNotMatch(screen.replace(/\/\/.*$/gm, ''), /score|ציון|row-reverse|textAlign: 'right'/i);
  const recording = fs.readFileSync(path.join(__dirname, '../src/lesson/recording.ts'), 'utf8');
  assert.doesNotMatch(recording, /fetch\(|upload|supabase|storage/i, 'the take never leaves the phone');
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.match(preview, /void tap\(\{ kind: 'self_comparison', mode, compared: true \}, true\)/);
  assert.match(preview, /<SpeakScreen [^]*reviewOnly=\{index < frontier\} save=\{shownSave\}\s*onCompare=\{compare\} onBack=\{back\} onClose=\{onClose\} \/>/);
});

test('the arrange step carries the tiles in the unit order and the hint id, never the answer or the hint text', () => {
  const step = data.openingSteps(projected(unit)).find(s => s.type === 'arrange');
  const source = unit.activities.find(a => a.id === '1a-arrange-greeting');
  assert.equal(step.id, source.id);
  assert.equal(step.titleHe, source.titleHe);
  assert.equal(step.promptHe, source.promptHe);
  assert.equal(JSON.stringify(step.tiles), JSON.stringify(source.tiles));
  assert.equal(step.helpId, 'help-arrange-greeting');
  const text = JSON.stringify(step);
  const hint = unit.help.find(h => h.id === 'help-arrange-greeting');
  for (const secret of ['expectedTileIds', source.feedback.correctHe, source.feedback.retryHe, hint.bodyHe]) assert.equal(text.includes(secret), false, secret);
  // An arrangement without help shows no hint.
  const bare = projected(unit);
  bare.activities = [{ ...bare.activities.find(a => a.id === source.id), helpIds: [] }];
  assert.equal(data.openingSteps(bare)[0].helpId, null);
});

test('word-order and hint requests pass the server schema, carry no outcome and restore only exactly', () => {
  const { AttemptRequestSchema } = require(path.join(root, 'content/dist/src/api-contract.js'));
  const me = '00000000-0000-4000-8000-0000000000aa';
  const progress = { status: 'in_progress', currentActivityId: '1a-arrange-greeting', revision: 1, progressVersion: 15 };
  const saved = r => JSON.stringify({ userId: me, unitId: 'C01-U01', request: r });
  for (const response of [{ kind: 'arrange', tileIds: ['dias', 'buenos'] }, { kind: 'help', helpId: 'help-arrange-greeting' }]) {
    const request = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000008', response);
    assert.equal(AttemptRequestSchema.safeParse(request).success, true, response.kind);
    assert.equal(JSON.stringify(request.response), JSON.stringify(response));
    assert.equal(JSON.stringify(data.restorablePending(saved(request), me, 'C01-U01', progress)), JSON.stringify(request));
    assert.equal(data.restorablePending(saved({ ...request, response: { ...response, outcome: 'correct' } }), me, 'C01-U01', progress), null);
    assert.equal(data.restorablePending(saved(request), me, 'C01-U01', { ...progress, progressVersion: 16 }), null);
  }
  const bad = data.attemptRequest(progress, '00000000-0000-4000-8000-000000000009', { kind: 'arrange', tileIds: ['buenos', 7] });
  assert.equal(data.restorablePending(saved(bad), me, 'C01-U01', progress), null);
  // Another order is a new tap with a new requestId.
  const sent = data.attemptRequest(progress, '00000000-0000-4000-8000-00000000000a', { kind: 'arrange', tileIds: ['dias', 'buenos'] });
  assert.equal(data.sameTap(sent, progress, { kind: 'arrange', tileIds: ['dias', 'buenos'] }), true);
  assert.equal(data.sameTap(sent, progress, { kind: 'arrange', tileIds: ['buenos', 'dias'] }), false);
});

test('arrange screen: lesson copy only from data, the server decides, taps only, "חזרה" in every state', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/lesson/arrange-screen.tsx'), 'utf8');
  for (const copy of ['Buenos', 'días', 'מברכים', 'בוקר טוב', 'הביטוי מתחיל', 'ננסה שוב', 'expectedTileIds']) assert.equal(screen.includes(copy), false, copy);
  assert.match(screen, /onAnswer\(\{ kind: 'arrange', tileIds: slots as string\[\] \}\)/);
  assert.match(screen, /onAnswer\(\{ kind: 'help', helpId: content\.helpId \}\)/);
  assert.match(screen, /result\.outcome === 'correct' \|\| result\.outcome === 'correct_with_help'/);
  assert.match(screen, /result\.outcome === 'retry'/);
  // Check stays disabled until every slot holds a tile; no dragging.
  assert.match(screen, /<LessonButton label="בדיקה" busy=\{save\.busy\} disabled=\{!full\}/);
  assert.doesNotMatch(screen, /Gesture|PanResponder|onLongPress|row-reverse|textAlign: 'right'/);
  // "חזרה" while arranging; the success and continue sheets carry it too.
  assert.match(screen, /<LessonSecondaryButton label="חזרה" disabled=\{save\.busy\} onPress=\{onBack\} \/>/);
  assert.match(screen, /<SuccessSheet [^>]*onBack=\{onBack\} \/>/);
  assert.match(screen, /<ContinueSheet [^>]*onBack=\{onBack\} \/>/);
  const preview = fs.readFileSync(path.join(__dirname, '../src/lesson/opening-preview.tsx'), 'utf8');
  assert.match(preview, /<ArrangeScreen [^]*reviewOnly=\{index < frontier\} save=\{shownSave\} onAnswer=\{response => tap\(response, false\)\}[^]*onBack=\{back\} onClose=\{onClose\} \/>/);
});
