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
  assert.equal(steps.length, 6);
  assert.equal(steps[0].bodyHe, unit.activities[0].bodyHe);
  assert.equal(steps[0].actionLabelHe, unit.activities[0].actionLabelHe);
  assert.equal(steps[0].sceneAssetId, 'juan-hostel-v1');
  assert.equal(steps[0].kickerHe, 'פרק ראשון');
  assert.equal(steps[0].sceneCaption, 'HOSTEL · 07:30');
  assert.equal(steps[0].characterNameHe, 'חואן');
  assert.equal(steps[1].characterNameHe, 'חואן');
  const interrupted = structuredClone(learnerUnit);
  interrupted.activities.splice(2, 0, { type: 'explanation', id: 'new-required-preparation' });
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

test('media URLs come only from the server projection: pending audio stays null even with a URL', () => {
  const urls = { 'juan-buenos-dias-v1': 'https://assets.example/buenos-dias.mp3', 'juan-hola-v1': 'https://assets.example/old-hola.mp3' };
  const cards = data.openingSteps(projected(unit, urls)).filter(s => s.type === 'vocabulary');
  assert.equal(cards[0].expressionEs, 'Hola');
  assert.equal(cards[0].audioUrl, null, 'pending audio is not served');
  assert.equal(cards[1].audioUrl, urls['juan-buenos-dias-v1']);
  assert.equal(data.openingSteps(projected(unit)).every(s => (s.type === 'entry' ? s.sceneUrl : s.audioUrl) === null), true, 'nothing hosted yet');
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
