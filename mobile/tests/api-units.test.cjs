const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/api/units.ts');
const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const api = {};
vm.runInNewContext(outputText, {
  exports: api, setTimeout, clearTimeout, AbortController, encodeURIComponent,
  require: () => { throw new Error('Unexpected runtime dependency'); },
}, { filename });

const reply = (status, body = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('sends the token as a Bearer header to our API and returns the unit', async () => {
  let seen;
  const fakeFetch = async (url, init) => { seen = { url, init }; return reply(200, { id: 'C01-U01' })(); };
  const result = await api.fetchUnit('http://192.168.1.20:3000', 'C01-U01', 'token-a', fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.unit.id, 'C01-U01');
  assert.equal(seen.url, 'http://192.168.1.20:3000/v1/units/C01-U01');
  assert.equal(seen.init.headers.Authorization, 'Bearer token-a');
});

test('maps server answers and network failures to reasons the screen can explain', async () => {
  const reasons = {};
  for (const [status, name] of [[401, 'unauthorized'], [404, 'not_found'], [500, 'server'], [503, 'server']]) {
    reasons[name + status] = (await api.fetchUnit('http://x', 'C01-U01', 't', reply(status))).reason;
    assert.equal(reasons[name + status], name, String(status));
  }
  const offline = async () => { throw new TypeError('Network request failed'); };
  assert.equal((await api.fetchUnit('http://x', 'C01-U01', 't', offline)).reason, 'unreachable');
  assert.equal((await api.fetchUnit(undefined, 'C01-U01', 't', offline)).reason, 'not_configured');
});

test('a request that never answers (blocked port) times out as unreachable', async () => {
  const hanging = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const result = await api.fetchUnit('http://x', 'C01-U01', 't', hanging, 20);
  assert.equal(result.reason, 'unreachable');
});
