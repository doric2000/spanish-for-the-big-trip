const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the preserved AudioLab handlers against native API timing contracts.
// These tests cannot prove microphone capture or speaker output on a device.
function createApp() {
  const source = fs.readFileSync(path.join(__dirname, '../src/audio-lab.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const hooks = [];
  const alerts = [];
  const loadedFiles = [];
  const deactivations = [];
  const timers = new Set();
  let cursor = 0;
  let onRecorderStatus;
  let keepAudioSessionActive = false;
  let prepareOptions;
  const recorder = {
    isRecording: false,
    uri: 'file:///not-finalized-yet.m4a',
    async prepareToRecordAsync(options) { prepareOptions = options; },
    record() { this.isRecording = true; },
    async stop() { this.isRecording = false; },
  };
  const player = {
    playing: false,
    pause() {
      this.playing = false;
      // iOS pause schedules deactivation even for an idle player by default.
      if (!keepAudioSessionActive) {
        deactivations.push(() => { recorder.isRecording = false; });
      }
    },
    replace(source) { loadedFiles.push(source.uri); },
    async seekTo() {},
    play() { this.playing = true; },
  };
  const audio = {
    RecordingPresets: { HIGH_QUALITY: { extension: '.m4a' } },
    async requestRecordingPermissionsAsync() { return { granted: true }; },
    async setAudioModeAsync() {},
    useAudioRecorder(options, listener) { onRecorderStatus = listener; return recorder; },
    useAudioRecorderState() { return { isRecording: recorder.isRecording, durationMillis: 5000 }; },
    useAudioPlayer(source, options = {}) {
      keepAudioSessionActive = options.keepAudioSessionActive ?? false;
      if (source) loadedFiles.push(source);
      return player;
    },
    useAudioPlayerStatus() {
      return { playing: player.playing, isLoaded: loadedFiles.length > 0, duration: 5, error: null };
    },
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (next) => { hooks[index] = next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect() {},
  };
  const element = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'expo-audio': audio,
    // The real shared helper, so the test also covers how playback is started.
    './audio-playback': (() => {
      const { outputText: helper } = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/audio-playback.ts'), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
      const helperExports = {};
      vm.runInNewContext(helper, { exports: helperExports, require: () => ({}) });
      return helperExports;
    })(),
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': {
      Alert: { alert: (...args) => alerts.push(args) },
      Button: 'Button', Text: 'Text', View: 'View',
      Linking: { async openSettings() {} },
      StyleSheet: { create: (styles) => styles },
    },
  };
  const sandbox = {
    exports: {}, console,
    require(name) { assert.ok(name in modules, name); return modules[name]; },
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
  };
  vm.runInNewContext(outputText, sandbox, { filename: 'App.tsx' });

  function buttons() {
    cursor = 0;
    const found = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Button') found.push(node.props);
      const children = node.props?.children;
      for (const child of Array.isArray(children) ? children : [children]) visit(child);
    }
    visit(sandbox.exports.default());
    return found;
  }
  return {
    buttons, alerts, loadedFiles, player, recorder,
    get prepareOptions() { return prepareOptions; },
    flushDeactivations() { deactivations.splice(0).forEach((run) => run()); },
    finishFile(uri) { onRecorderStatus({ isFinished: true, hasError: false, url: uri }); },
    expireFinalization() { [...timers].forEach((run) => run()); },
  };
}

test('starting recording does not schedule player shutdown that interrupts the microphone', async () => {
  const app = createApp();
  await app.buttons()[0].onPress();
  app.flushDeactivations();
  assert.equal(app.recorder.isRecording, true);
  assert.ok(app.prepareOptions, 'each take explicitly prepares a fresh recording file');

  // Starting a new take while playback is active must also keep the session alive.
  app.recorder.isRecording = false;
  app.player.playing = true;
  await app.buttons()[0].onPress();
  app.flushDeactivations();
  assert.equal(app.recorder.isRecording, true);
});

test('playback loads the completed file only after the native finish event', async () => {
  const app = createApp();
  await app.buttons()[0].onPress();
  const stopping = app.buttons()[0].onPress();
  await Promise.resolve();
  assert.equal(app.loadedFiles.length, 0, 'stop returning is not proof the file is finished');
  assert.equal(app.buttons()[0].disabled, true);

  app.finishFile('file:///completed-five-second-take.m4a');
  await stopping;
  assert.deepEqual(app.loadedFiles, ['file:///completed-five-second-take.m4a']);
  assert.equal(app.buttons()[1].disabled, false);
  await app.buttons()[1].onPress();
  assert.equal(app.player.playing, true);
});

test('missing native completion does not leave the controls permanently busy', async () => {
  const app = createApp();
  await app.buttons()[0].onPress();
  const stopping = app.buttons()[0].onPress();
  app.expireFinalization();
  await stopping;
  assert.equal(app.alerts.length, 1);
  assert.equal(app.loadedFiles.length, 0);
  assert.equal(app.buttons()[0].disabled, false);
  await app.buttons()[0].onPress();
  assert.equal(app.recorder.isRecording, true);
});
