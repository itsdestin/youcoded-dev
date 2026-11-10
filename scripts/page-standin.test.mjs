// page-standin: serves a page with a stub window.youcoded backed by the folder's own data.json,
// binds loopback only, answers fetch from local data only, and refuses odd hosts.
// Run: node --test scripts/page-standin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createStandin, stubScript } from './page-standin.mjs';

function fixture({ data, fetchMap, connections = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'standin-'));
  writeFileSync(join(dir, 'page.html'), '<!doctype html><html><head><title>Fixture</title></head><body><h1 id=x>hi</h1></body></html>');
  writeFileSync(join(dir, 'page.json'), JSON.stringify({ name: 'Fixture', connections }));
  if (data !== undefined) writeFileSync(join(dir, 'data.json'), JSON.stringify(data));
  if (fetchMap) writeFileSync(join(dir, 'fetch.json'), JSON.stringify(fetchMap));
  return dir;
}
const get = (port, path = '/', host) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port, path, headers: host ? { host } : {} }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej);
});
/** Runs the injected stub in a bare context and hands back its window. */
function runStub(opts) {
  const win = { console: { info() {} } }; win.window = win;
  vm.runInNewContext(stubScript(opts), win);
  return win;
}

test('serves page.html with the stub and the folder\'s data.json baked in, before the page\'s own head', async () => {
  const dir = fixture({ data: { tab: 'app', n: 3 } });
  const s = await createStandin(dir);
  try {
    const r = await get(s.port);
    assert.equal(r.status, 200);
    assert.match(r.body, /<h1 id=x>hi<\/h1>/);
    assert.match(r.body, /window\.youcoded = \{/);
    assert.ok(r.body.indexOf('window.youcoded = {') < r.body.indexOf('<title>Fixture</title>'), 'stub comes first');
    assert.match(r.body, /"tab":"app","n":3/);
  } finally { await s.close(); }
});

test('binds 127.0.0.1 only, and refuses a request whose Host is anything else', async () => {
  const s = await createStandin(fixture());
  try {
    assert.equal(s.server.address().address, '127.0.0.1');
    assert.equal((await get(s.port, '/', 'evil.example.com')).status, 403);
    assert.equal((await get(s.port, '/', `localhost:${s.port}`)).status, 200);
    assert.equal((await get(s.port, '/other')).status, 404);
  } finally { await s.close(); }
});

test('a folder with no page.html is refused plainly', async () => {
  await assert.rejects(createStandin(mkdtempSync(join(tmpdir(), 'standin-empty-'))), /no page\.html/);
});

test('no data.json means data is null; invalid JSON is a plain error on load, not a crash', async () => {
  const none = await createStandin(fixture());
  try { assert.match((await get(none.port)).body, /data: null/); } finally { await none.close(); }
  const dir = fixture(); writeFileSync(join(dir, 'data.json'), '{nope');
  const bad = await createStandin(dir);
  try { const r = await get(bad.port); assert.equal(r.status, 500); assert.match(r.body, /data\.json is not valid JSON/); } finally { await bad.close(); }
});

test('data containing </script> cannot end the injected script early', async () => {
  const s = await createStandin(fixture({ data: { t: '</script><b>x' } }));
  try { assert.doesNotMatch((await get(s.port)).body.replace(/<\/script><\/head>/, ''), /<\/script><b>/); } finally { await s.close(); }
});

test('stub: save updates data and fires onData; refresh fires onRefresh; nothing is written back', () => {
  const w = runStub({ data: { a: 1 }, connections: [], fetchMap: {} });
  const seen = []; let refreshed = 0;
  w.youcoded.onData((d) => seen.push(d)); w.youcoded.onRefresh(() => refreshed++);
  w.youcoded.save({ a: 2 }); w.__standin.refresh();
  assert.equal(JSON.stringify(seen), '[{"a":2}]'); assert.equal(w.youcoded.data.a, 2); assert.equal(refreshed, 1);
});

test('stub: fetch answers only from the local map; an unknown URL is an honest no-data answer, never a network call', async () => {
  const w = runStub({ data: null, connections: [], fetchMap: { 'https://api.example.com/a': { status: 200, body: { n: 1 } }, 'https://api.example.com/t': 'text' } });
  const hit = await w.youcoded.fetch('https://api.example.com/a');
  assert.equal(hit.status, 200); assert.equal(hit.body, '{"n":1}');
  assert.equal((await w.youcoded.fetch('https://api.example.com/t')).body, 'text');
  const miss = await w.youcoded.fetch('https://api.example.com/other');
  assert.equal(miss.ok, false); assert.equal(miss.reason, 'standin-no-data');
});

test('stub: connections decide which abilities exist (like the app)', async () => {
  const none = runStub({ data: null, connections: [], fetchMap: {} });
  assert.equal(none.youcoded.startSession, undefined); assert.equal(none.youcoded.chats, undefined); assert.equal(none.youcoded.program, undefined);
  const all = runStub({ data: null, connections: [{ kind: 'session' }, { kind: 'chats', access: 'full' }, { kind: 'program', file: 'x.mjs' }], fetchMap: {} });
  assert.equal(typeof all.youcoded.startSession, 'function');
  assert.equal(JSON.stringify(await all.youcoded.chats.list()), '{"ok":true,"chats":[]}'); // JSON: the stub lives in another vm realm
  assert.equal((await all.youcoded.program.run('x.mjs')).reason, 'standin-no-programs');
});

test('source guard: no outgoing network, no token, no shell', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./page-standin.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  // the only `fetch(` is the stub's own (a string inside the injected script); the server side never fetches
  assert.doesNotMatch(src, /child_process|gh auth|GITHUB_TOKEN|X-GitHub-PAT|workers\.dev|https\.request|http\.request|await fetch\(/);
});
