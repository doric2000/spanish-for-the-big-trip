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

test('start and attempts are POSTs with a JSON body and the same Bearer token', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    return url.endsWith('/start') ? reply(200, { status: 'existing', progress: { progressVersion: 3 } })()
      : reply(200, { outcome: 'viewed', progress: { progressVersion: 4 } })();
  };
  const started = await api.startUnit('http://x', 'C01-U01', 'token-a', fakeFetch);
  assert.equal(started.ok, true);
  assert.equal(started.status, 'existing');
  assert.equal(started.progress.progressVersion, 3);
  const request = { requestId: 'r-1', revision: 1, activityId: 'u1a-entry', expectedProgressVersion: 3, response: { kind: 'continue' } };
  const sent = await api.submitAttempt('http://x', 'C01-U01', 'token-a', request, fakeFetch);
  assert.equal(sent.ok, true);
  assert.equal(sent.result.progress.progressVersion, 4);

  assert.equal(seen[0].url, 'http://x/v1/units/C01-U01/start');
  assert.equal(seen[1].url, 'http://x/v1/units/C01-U01/attempts');
  for (const { init } of seen) {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer token-a');
    assert.equal(init.headers['Content-Type'], 'application/json');
  }
  assert.equal(seen[0].init.body, '{}');
  // The app sends what the learner did, never a user id or an outcome.
  assert.deepEqual(JSON.parse(seen[1].init.body), request);
  assert.equal(seen[1].init.body.includes('userId'), false);
});

test('a 409 is a conflict, a 503 a server failure and a dropped connection unreachable', async () => {
  const request = { requestId: 'r-1', revision: 1, activityId: 'a', expectedProgressVersion: 0, response: { kind: 'continue' } };
  assert.equal((await api.submitAttempt('http://x', 'C01-U01', 't', request, reply(409))).reason, 'conflict');
  assert.equal((await api.submitAttempt('http://x', 'C01-U01', 't', request, reply(503))).reason, 'server');
  const offline = async () => { throw new TypeError('Network request failed'); };
  assert.equal((await api.submitAttempt('http://x', 'C01-U01', 't', request, offline)).reason, 'unreachable');
  assert.equal((await api.startUnit('http://x', 'C01-U01', 't', reply(404))).reason, 'not_found');
});
