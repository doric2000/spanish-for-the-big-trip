const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the lesson's recording hook (src/lesson/recording.ts) against the same native
// timing contracts as the AudioLab proof. These tests cannot prove microphone capture or
// speaker output on a device.
function createHook({ granted = true, canAskAgain = false } = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lesson/recording.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const hooks = [];
  const cleanups = [];
  const loadedFiles = [];
  const audioModes = [];
  const timers = new Set();
  let cursor = 0;
  let onRecorderStatus;
  let prepareCount = 0;
  const recorder = {
    isRecording: false,
    async prepareToRecordAsync(options) { assert.ok(options, 'each take prepares a fresh file'); prepareCount++; },
    record() { this.isRecording = true; },
    async stop() { this.isRecording = false; },
  };
  const player = {
    playing: false,
    pause() { this.playing = false; },
    replace(source) { loadedFiles.push(source.uri); },
    async seekTo() {},
    play() { this.playing = true; },
  };
  const audio = {
    RecordingPresets: { HIGH_QUALITY: { extension: '.m4a' } },
    async requestRecordingPermissionsAsync() { return { granted, canAskAgain }; },
    async setAudioModeAsync(mode) { audioModes.push(mode); },
    useAudioRecorder(options, listener) { onRecorderStatus = listener; return recorder; },
    useAudioRecorderState() { return { isRecording: recorder.isRecording, durationMillis: 2400 }; },
    useAudioPlayer(source, options) { assert.equal(options.keepAudioSessionActive, true); return player; },
    useAudioPlayerStatus() { return { playing: player.playing, isLoaded: loadedFiles.length > 0, duration: 2, currentTime: 1 }; },
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
    useCallback: (fn) => fn,
    useEffect(effect) { if (!cleanups.ran) cleanups.push(effect); },
  };
  const modules = {
    react, 'expo-audio': audio,
    '../audio-playback': { playAudible(p) { p.play(); } },
  };
  const sandbox = {
    exports: {},
    require(name) { assert.ok(name in modules, name); return modules[name]; },
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
  };
  vm.runInNewContext(outputText, sandbox, { filename: 'recording.ts' });
  const render = () => { cursor = 0; return sandbox.exports.useSelfRecording(); };
  render();
  cleanups.ran = true;
  return {
    render, recorder, player, loadedFiles, audioModes,
    get prepareCount() { return prepareCount; },
    finishFile(uri) { onRecorderStatus({ isFinished: true, hasError: false, url: uri }); },
    expireFinalization() { [...timers].forEach((run) => run()); },
    unmount() { cleanups.forEach((effect) => effect()?.()); },
    // expo-audio frees the native recorder first when the screen closes; after that any
    // use of the JavaScript object throws (Dor's iPhone, 2026-10-26).
    release() {
      const gone = () => { throw new Error('Unable to find the native shared object'); };
      Object.defineProperty(recorder, 'isRecording', { get: gone });
      recorder.stop = gone;
    },
  };
}

test('a refused microphone reports the refusal and never starts recording', async () => {
  const hook = createHook({ granted: false, canAskAgain: false });
  const result = await hook.render().start();
  assert.deepEqual({ ...result }, { denied: true, canAskAgain: false });
  assert.equal(hook.recorder.isRecording, false);
  assert.equal(hook.prepareCount, 0);
  assert.equal(hook.render().busy, false);
});

test('a take is ready to play only after the native finish event', async () => {
  const hook = createHook();
  assert.equal(await hook.render().start(), 'recording');
  assert.equal(hook.recorder.isRecording, true);
  assert.equal(hook.audioModes.at(-1).allowsRecording, true);

  const stopping = hook.render().stop();
  await Promise.resolve();
  assert.equal(hook.loadedFiles.length, 0, 'stop returning is not proof the file is finished');
  hook.finishFile('file:///take.m4a');
  assert.equal(await stopping, true);
  assert.deepEqual(hook.loadedFiles, ['file:///take.m4a']);
  assert.equal(hook.audioModes.at(-1).allowsRecording, false, 'the speaker is given back after recording');
  const state = hook.render();
  assert.equal(state.uri, 'file:///take.m4a');
  assert.equal(state.progress, 0.5);

  await state.togglePlayback();
  assert.equal(hook.player.playing, true);
  // A new take starts a fresh file and stops the replay first.
  assert.equal(await hook.render().start(), 'recording');
  assert.equal(hook.player.playing, false);
  assert.equal(hook.prepareCount, 2);
  assert.equal(hook.render().uri, null);
});

test('a missing finish event fails the take without leaving the controls busy', async () => {
  const hook = createHook();
  await hook.render().start();
  const stopping = hook.render().stop();
  hook.expireFinalization();
  assert.equal(await stopping, false);
  const state = hook.render();
  assert.equal(state.busy, false);
  assert.ok(state.failure);
  assert.equal(hook.loadedFiles.length, 0);
  assert.equal(await state.start(), 'recording', 'the learner can record again');
});

test('leaving the screen mid-take stops the microphone', async () => {
  const hook = createHook();
  await hook.render().start();
  hook.unmount();
  await Promise.resolve();
  assert.equal(hook.recorder.isRecording, false);
  assert.equal(hook.audioModes.at(-1).allowsRecording, false);
});

test('closing the screen after expo-audio released the recorder does not throw', async () => {
  // Moving to the next practice without recording: nothing to stop.
  const idle = createHook();
  idle.release();
  assert.doesNotThrow(() => idle.unmount());
  assert.equal(idle.audioModes.at(-1).allowsRecording, false);
  // Closing mid-take: the stop attempt fails quietly, the speaker is still given back.
  const mid = createHook();
  await mid.render().start();
  mid.release();
  assert.doesNotThrow(() => mid.unmount());
  await Promise.resolve();
  assert.equal(mid.audioModes.at(-1).allowsRecording, false);
});
