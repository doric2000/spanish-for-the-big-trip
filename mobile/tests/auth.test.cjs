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

test('sign-out asks for confirmation first, with a cancel and a destructive choice', () => {
  const account = read('auth/account-screen.tsx');
  assert.match(account, /onPress=\{confirmSignOut\}/);
  assert.match(account, /Alert\.alert\('לצאת מהחשבון\?'/);
  assert.match(account, /style: 'cancel'/);
  assert.match(account, /style: 'destructive', onPress: \(\) => \{ void signOut\(\); \}/);
});

test('sign-in offers no Google button before Google sign-in exists', () => {
  // Comments may mention Google; no button label or Google sign-in module may appear.
  assert.doesNotMatch(read('auth/sign-in-screen.tsx'), /עם Google|google-signin|GoogleSignin/i);
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
