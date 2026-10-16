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

// Objects created inside vm have another realm's prototypes, so compare fields, not deepEqual.
const storage = compile('../src/auth/chunked-storage.ts');
const apple = compile('../src/auth/apple-sign-in.ts');
const google = compile('../src/auth/google-sign-in.ts');

function memoryStore() {
  const map = new Map();
  return {
    map,
    getItemAsync: async key => (map.has(key) ? map.get(key) : null),
    setItemAsync: async (key, value) => {
      assert.ok(Buffer.byteLength(value, 'utf8') <= 2048, `Keychain value too large for ${key}`);
      assert.match(key, /^[\w.-]+$/, 'SecureStore keys allow only letters, digits, ".", "-" and "_"');
      map.set(key, value);
    },
    deleteItemAsync: async key => { map.delete(key); },
  };
}

test('a large session is split into Keychain-sized pieces and read back intact', async () => {
  const store = memoryStore();
  const kv = storage.createChunkedStorage(store);
  // Worst case: 4-byte characters (emoji) in user metadata.
  const session = JSON.stringify({ access_token: 'x'.repeat(1500), refresh_token: 'r'.repeat(40), user: { name: '😀'.repeat(400) } });
  await kv.setItem('sb-ref-auth-token', session);
  assert.equal(await kv.getItem('sb-ref-auth-token'), session);
  assert.ok(Number(store.map.get('sb-ref-auth-token.count')) > 1);
});

test('a shorter session replaces a longer one without leftover pieces, and removal clears everything', async () => {
  const store = memoryStore();
  const kv = storage.createChunkedStorage(store);
  await kv.setItem('k', 'a'.repeat(storage.CHUNK_CHARS * 3));
  await kv.setItem('k', 'short');
  assert.equal(await kv.getItem('k'), 'short');
  assert.deepEqual([...store.map.keys()].sort(), ['k.0', 'k.count']);
  await kv.removeItem('k');
  assert.equal(store.map.size, 0);
  assert.equal(await kv.getItem('k'), null);
});

test('a missing piece reads as signed out instead of returning a corrupted session', async () => {
  const store = memoryStore();
  const kv = storage.createChunkedStorage(store);
  await kv.setItem('k', 'b'.repeat(storage.CHUNK_CHARS * 2));
  store.map.delete('k.1');
  assert.equal(await kv.getItem('k'), null);
  store.map.set('k.count', 'not-a-number');
  assert.equal(await kv.getItem('k'), null);
});

function appleDeps(overrides = {}) {
  const calls = {};
  return {
    calls,
    deps: {
      randomNonce: () => 'raw-nonce',
      sha256Hex: async value => `sha256(${value})`,
      requestAppleCredential: async hashed => { calls.apple = hashed; return { identityToken: 'apple-id-token' }; },
      exchangeWithSupabase: async (token, nonce) => { calls.supabase = { token, nonce }; return { error: null }; },
      ...overrides,
    },
  };
}

test('Apple gets the hashed nonce and Supabase gets the raw nonce with the identity token', async () => {
  const { deps, calls } = appleDeps();
  assert.equal((await apple.signInWithApple(deps)).status, 'signed_in');
  assert.equal(calls.apple, 'sha256(raw-nonce)');
  assert.deepEqual(calls.supabase, { token: 'apple-id-token', nonce: 'raw-nonce' });
});

test('cancel, missing token, Apple failure and Supabase rejection never sign in', async () => {
  const canceled = Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' });
  let r = await apple.signInWithApple(appleDeps({ requestAppleCredential: async () => { throw canceled; } }).deps);
  assert.equal(r.status, 'canceled');

  const noToken = appleDeps({ requestAppleCredential: async () => ({ identityToken: null }) });
  r = await apple.signInWithApple(noToken.deps);
  assert.equal(r.status, 'error');
  assert.equal(noToken.calls.supabase, undefined, 'nothing is sent to Supabase without a token');

  r = await apple.signInWithApple(appleDeps({ requestAppleCredential: async () => { throw new Error('boom'); } }).deps);
  assert.equal(r.status, 'error');

  r = await apple.signInWithApple(appleDeps({ exchangeWithSupabase: async () => ({ error: { message: 'Invalid nonce' } }) }).deps);
  assert.equal(r.status, 'error');
  assert.equal(r.message, 'Invalid nonce');
});

function googleDeps(overrides = {}) {
  const calls = {};
  return {
    calls,
    deps: {
      requestGoogleCredential: async () => ({ type: 'success', idToken: 'google-id-token' }),
      exchangeWithSupabase: async token => { calls.supabase = token; return { error: null }; },
      ...overrides,
    },
  };
}

test('Google: the ID token from Google is exchanged with Supabase', async () => {
  const { deps, calls } = googleDeps();
  assert.equal((await google.signInWithGoogle(deps)).status, 'signed_in');
  assert.equal(calls.supabase, 'google-id-token');
});

test('Google: cancel, missing token, Google failure and Supabase rejection never sign in', async () => {
  const canceled = googleDeps({ requestGoogleCredential: async () => ({ type: 'cancelled' }) });
  assert.equal((await google.signInWithGoogle(canceled.deps)).status, 'canceled');
  assert.equal(canceled.calls.supabase, undefined);

  const noToken = googleDeps({ requestGoogleCredential: async () => ({ type: 'success', idToken: null }) });
  let r = await google.signInWithGoogle(noToken.deps);
  assert.equal(r.status, 'error');
  assert.equal(noToken.calls.supabase, undefined, 'nothing is sent to Supabase without a token');

  r = await google.signInWithGoogle(googleDeps({ requestGoogleCredential: async () => { throw new Error('boom'); } }).deps);
  assert.equal(r.status, 'error');

  r = await google.signInWithGoogle(googleDeps({ exchangeWithSupabase: async () => ({ error: { message: 'Unacceptable audience' } }) }).deps);
  assert.equal(r.status, 'error');
  assert.equal(r.message, 'Unacceptable audience');
});

const deletion = compile('../src/auth/delete-account.ts');

function deletionDeps(overrides = {}) {
  const calls = [];
  return { calls, deps: {
    deleteOnServer: async () => { calls.push('server'); return { error: null }; },
    forgetGoogle: async () => { calls.push('google'); },
    signOutLocally: async () => { calls.push('signOut'); },
    ...overrides,
  } };
}

test('account deletion: server first, then local clean-up, then one sign-in confirmation', async () => {
  const { deps, calls } = deletionDeps();
  assert.equal((await deletion.deleteAccount(deps)).status, 'deleted');
  assert.deepEqual([...calls], ['server', 'google', 'signOut']);
  assert.equal(deletion.consumeAccountDeleted(), true, 'sign-in shows "the account was deleted"');
  assert.equal(deletion.consumeAccountDeleted(), false, 'and only once');
});

test('account deletion: a server failure keeps the learner signed in and shows no confirmation', async () => {
  const failed = deletionDeps({ deleteOnServer: async () => ({ error: { message: 'network' } }) });
  const r = await deletion.deleteAccount(failed.deps);
  assert.equal(r.status, 'error');
  assert.deepEqual([...failed.calls], [], 'no sign-out and no Google revoke when nothing was deleted');
  assert.equal(deletion.consumeAccountDeleted(), false);
  const thrown = deletionDeps({ deleteOnServer: async () => { throw new Error('offline'); } });
  assert.equal((await deletion.deleteAccount(thrown.deps)).status, 'error');
  // A failing Google revoke or sign-out after a successful delete still counts as deleted.
  const messy = deletionDeps({ forgetGoogle: async () => { throw new Error('not signed in to Google'); }, signOutLocally: async () => { throw new Error('x'); } });
  assert.equal((await deletion.deleteAccount(messy.deps)).status, 'deleted');
  deletion.consumeAccountDeleted();
});

test('account screen: delete asks first, with a cancel and a destructive choice, and calls the database function', () => {
  const account = read('auth/account-screen.tsx');
  assert.match(account, /onPress=\{confirmDelete\}/);
  assert.match(account, /Alert\.alert\('למחוק את החשבון\?'/);
  assert.match(account, /style: 'destructive', onPress: \(\) => \{ void removeAccount\(\); \}/);
  assert.match(account, /supabase\.rpc\('delete_my_account'\)/);
  assert.match(read('auth/sign-in-screen.tsx'), /consumeAccountDeleted\(\) \? 'deleted'/);
});

const copy = compile('../src/auth/account-copy.ts');
const read = relative => fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');

test('account copy: saved progress in natural Hebrew and a readable sign-in provider', () => {
  assert.equal(copy.savedProgressLabel(0), 'עדיין אין');
  assert.equal(copy.savedProgressLabel(1), 'יחידה אחת');
  assert.equal(copy.savedProgressLabel(4), '4 יחידות');
  assert.equal(copy.providerLabel('apple'), 'Apple');
  assert.equal(copy.providerLabel('google'), 'Google');
  assert.equal(copy.providerLabel(undefined), 'חשבון');
});

test('the passport stamp appears only for real saved progress', () => {
  assert.equal(copy.showPassportStamp({ state: 'ok', rows: 1 }), true);
  assert.equal(copy.showPassportStamp({ state: 'ok', rows: 0 }), false, 'none yet');
  assert.equal(copy.showPassportStamp({ state: 'loading' }), false);
  assert.equal(copy.showPassportStamp({ state: 'error' }), false);
});

test('sign-out asks for confirmation first, with a cancel and a destructive choice', () => {
  const account = read('auth/account-screen.tsx');
  assert.match(account, /onPress=\{confirmSignOut\}/);
  assert.match(account, /Alert\.alert\('לצאת מהחשבון\?'/);
  assert.match(account, /style: 'cancel'/);
  assert.match(account, /style: 'destructive', onPress: \(\) => \{ void signOut\(\); \}/);
});

test('sign-in offers Google next to Apple, and only one sign-in runs at a time', () => {
  const screen = read('auth/sign-in-screen.tsx');
  assert.match(screen, /signInWithApple\(appleDeps\)/, 'Apple stays');
  assert.match(screen, /המשך עם Apple/);
  // The native Apple button would follow the phone's language, not the app's Hebrew.
  assert.doesNotMatch(screen, /AppleAuthenticationButton/);
  assert.match(screen, /המשך עם Google/);
  assert.match(screen, /signInWithGoogle\(googleDeps\)/);
  // One shared guard: a second tap on either button while signing in does nothing.
  assert.equal((screen.match(/if \(inProgress\.current\) return;/g) || []).length, 1);
});

test('screens take their top and bottom padding from the device safe areas', () => {
  for (const file of ['auth/sign-in-screen.tsx', 'auth/account-screen.tsx', 'lesson/opening-preview.tsx']) {
    const source = read(file);
    assert.match(source, /useSafeAreaInsets\(\)/, file);
    assert.match(source, /insets\.top/, file);
    assert.match(source, /insets\.bottom/, file);
    assert.doesNotMatch(source, /paddingTop: \d/, `${file} has a hardcoded top padding`);
  }
});

test('the app declares Hebrew only, so iOS lays it out right-to-left natively', () => {
  const { expo } = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  assert.deepEqual([...expo.ios.infoPlist.CFBundleLocalizations], ['he']);
  assert.equal(expo.ios.infoPlist.CFBundleDevelopmentRegion, 'he');
  const names = expo.plugins.map(p => (Array.isArray(p) ? p[0] : p));
  assert.equal(new Set(names).size, names.length, 'each config plugin is listed once');
  const google = expo.plugins.find(p => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin');
  assert.match(google[1].iosUrlScheme, /^com\.googleusercontent\.apps\.[\w-]+$/);
});

test('no screen fakes right-to-left by hand (React Native mirrors these in RTL)', () => {
  // In native RTL, 'row-reverse' and 'flex-end' would put things back on the left,
  // and textAlign 'right' is swapped to the left. Use 'row', 'flex-start' and the
  // natural alignment of Hebrew text instead.
  for (const file of ['auth/sign-in-screen.tsx', 'auth/account-screen.tsx', 'lesson/opening-preview.tsx', 'audio-lab.tsx']) {
    assert.doesNotMatch(read(file), /row-reverse|'flex-end'|textAlign: 'right'/, file);
  }
});
