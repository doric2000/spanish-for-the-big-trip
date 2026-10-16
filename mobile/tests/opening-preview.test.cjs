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

test('home route never loads the draft preview in production and links to recorder/account in development', () => {
  for (const development of [false, true]) {
    const pushed = [];
    let previewLoads = 0;
    function AudioLab() {}
    function OpeningPreview() {}
    const Home = loadRoute('index.tsx', development, {
      'expo-router': () => ({ router: { push: href => pushed.push(href) } }),
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
      assert.equal(JSON.stringify(pushed), JSON.stringify(['/recorder', '/account']));
    }
  }
});

test('root layout: splash and loading first, sign-in only when signed out, app screens only when signed in', () => {
  let session;
  const splash = { held: 0, hidden: 0 };
  function View() {}
  function ActivityIndicator() {}
  function Provider() {}
  const Stack = Object.assign(function Stack() {}, { Screen() {}, Protected() {} });
  const Layout = loadRoute('_layout.tsx', true, {
    'expo-router': () => ({ Stack }),
    'expo-splash-screen': () => ({ preventAutoHideAsync: async () => { splash.held++; return true; }, hide: () => { splash.hidden++; } }),
    // Effects run right away here: the layout is called as a plain function, not rendered by React.
    react: () => ({ useEffect: effect => { effect(); } }),
    'react-native': () => ({ View, ActivityIndicator }),
    '../auth/session-context': () => ({ SessionContext: { Provider } }),
    '../auth/use-session': () => ({ useSession: () => session }),
    '../theme': () => ({ theme: { colors: { background: '#fff', primary: '#000' } } }),
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
  let g = guards(Layout());
  assert.equal(g.signIn, true);
  assert.equal(g.app, false, 'no guest mode');
  assert.equal(JSON.stringify(g.signInScreens), JSON.stringify(['sign-in']));
  assert.equal(JSON.stringify(g.appScreens), JSON.stringify(['index', 'account', 'recorder']));
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
