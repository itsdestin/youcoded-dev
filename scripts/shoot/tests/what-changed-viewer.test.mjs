// "What changed" viewer: its pure helpers and the local server that saves the owner's answers.
// Run: node --test scripts/shoot/tests/what-changed-viewer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, resolveInRun } from '../what-changed/serve.mjs';
import {
  boxToPercent, boxSide, areaOf, aggregateScreens, countStatuses, groupByArea, matchesFilter,
  matchesQuery, categories, wordParts, progress, buildDecisions, validateDecisions,
} from '../what-changed/viewer/helpers.js';

const screens = [
  { name: 'settings/about', theme: 'a', status: 'changed', changes: [{ kind: 'text', role: 'button', name: 'Go', oldText: 'Check', newText: 'Look' }] },
  { name: 'settings/about', theme: 'b', status: 'unchanged', changes: [] },
  { name: 'chat/empty', theme: 'a', status: 'new', changes: [] },
  { name: 'chat/x', theme: 'a', status: 'failed', reason: 'never loaded' },
  { name: 'chat/composer', theme: 'a', status: 'changed', changes: [{ kind: 'pixels', box: { x: 0, y: 0, w: 1, h: 1 } }] },
];

test('boxes scale from CSS px to percentages of the picture; removed boxes belong to before', () => {
  assert.deepEqual(boxToPercent({ x: 100, y: 50, w: 50, h: 25 }, 1.5, 1500, 750), { left: 10, top: 10, width: 5, height: 5 });
  assert.equal(boxToPercent({ x: 1, y: 1, w: 1, h: 1 }, 2, 0, 0), null);
  assert.equal(boxSide({ kind: 'removed', side: 'after' }), 'before');
  assert.equal(boxSide({ kind: 'added' }), 'after');
});

test('theme rows fold into one entry per screen name, grouped by area', () => {
  const entries = aggregateScreens(screens);
  assert.equal(entries.length, 4);
  assert.equal(entries.find((e) => e.name === 'settings/about').status, 'changed');
  assert.deepEqual(countStatuses(entries), { changed: 2, new: 1, unchanged: 0, failed: 1, removed: 0 });
  assert.equal(areaOf('settings/about'), 'settings');
  assert.equal(areaOf('lonely'), 'lonely');
  assert.deepEqual(groupByArea(entries.filter((e) => e.status !== 'failed')).map((g) => [g.area, g.items.length]), [['settings', 1], ['chat', 2]]);
});

test('filters and search look at the changes inside each screen', () => {
  const [about] = aggregateScreens(screens);
  assert.deepEqual(categories(screens[0].changes[0]).sort(), ['controls', 'wording']);
  assert.ok(matchesFilter(about, 'wording') && matchesFilter(about, 'controls') && !matchesFilter(about, 'other'));
  assert.ok(matchesFilter(aggregateScreens(screens).find((e) => e.name === 'chat/composer'), 'other'));
  assert.ok(matchesQuery(about, 'look') && matchesQuery(about, 'SETTINGS') && !matchesQuery(about, 'zebra'));
});

test('word diffs split into old and new columns with only changed words marked', () => {
  const { oldParts, newParts } = wordParts([{ old: 'Check', new: 'Look' }, { same: 'for updates' }]);
  assert.deepEqual(oldParts, [{ text: 'Check', mark: true }, { text: 'for updates' }]);
  assert.deepEqual(newParts, [{ text: 'Look', mark: true }, { text: 'for updates' }]);
  assert.deepEqual(wordParts([{ old: 'gone' }]).newParts, []);
});

test('progress counts only reviewable screens that have a verdict; decisions drop empty entries', () => {
  const entries = aggregateScreens(screens);
  assert.deepEqual(progress(entries, { 'chat/empty': { verdict: 'keep' }, 'chat/x': { verdict: 'keep' } }), { decided: 1, total: 3 });
  const d = buildDecisions('r1', { a: { verdict: 'keep', note: '' }, b: { verdict: '', note: '' } }, new Date('2026-01-02T03:04:05Z'));
  assert.deepEqual(d, { run: 'r1', decidedAt: '2026-01-02T03:04:05.000Z', screens: { a: { verdict: 'keep', note: '' } } });
  assert.equal(validateDecisions(d), null);
  assert.ok(validateDecisions({ screens: { a: { verdict: 'maybe', note: '' } } }));
  assert.ok(validateDecisions({ screens: [] }));
});

function runFolder() {
  const root = mkdtempSync(join(tmpdir(), 'wc-'));
  const run = join(root, 'run1');
  mkdirSync(join(run, 'before', 's'), { recursive: true });
  writeFileSync(join(run, 'changes.json'), '{"screens":[]}');
  writeFileSync(join(run, 'before', 's', 'a b.png'), 'png');
  writeFileSync(join(root, 'secret.txt'), 'top secret');
  return { root, run };
}
const req = (url, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
  const r = http.request(url, { method, headers }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
  r.on('error', reject); if (body) r.write(body); r.end();
});

test('the server shows the viewer and the run folder, and saves decisions beside changes.json', async () => {
  const { run } = runFolder();
  const { server, url } = await startServer({ run });
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(server.address().address, '127.0.0.1');
    assert.equal((await req(url)).status, 200);
    assert.match((await req(url + 'run/changes.json')).body, /screens/);
    assert.equal((await req(url + 'run/before/s/a%20b.png')).body, 'png');
    assert.deepEqual(JSON.parse((await req(url + 'api/info')).body), { run: 'run1' });
    const good = { screens: { 'settings/about': { verdict: 'keep', note: 'ok' } } };
    const put = await req(url + 'api/decisions', { method: 'PUT', body: JSON.stringify(good) });
    assert.equal(put.status, 200);
    const saved = JSON.parse(readFileSync(join(run, 'decisions.json'), 'utf8'));
    assert.equal(saved.run, 'run1');
    assert.deepEqual(saved.screens, good.screens);
    assert.ok(!existsSync(join(run, 'decisions.json.tmp')));
    assert.equal((await req(url + 'run/decisions.json')).status, 200);
    assert.equal((await req(url + 'api/decisions', { method: 'PUT', body: '{"screens":{"a":{"verdict":"zzz","note":""}}}' })).status, 400);
    assert.equal((await req(url + 'api/decisions', { method: 'PUT', body: 'nope' })).status, 400);
  } finally { server.close(); }
});

test('the server refuses paths outside the run folder, other pages writing, and other hosts', async () => {
  const { root, run } = runFolder();
  symlinkSync(join(root, 'secret.txt'), join(run, 'link.txt'));
  const { server, url, port } = await startServer({ run });
  try {
    // `..` is clamped at the run folder's own root, so the answer is either refused or inside it.
    for (const bad of ['../secret.txt', '..%2Fsecret.txt', '../../etc/passwd']) {
      const got = resolveInRun(run, bad);
      assert.ok(got === null || got.startsWith(run + '/'), bad);
      assert.ok(got === null || !got.endsWith('/etc/passwd') || got.startsWith(run), bad);
    }
    assert.equal(resolveInRun(run, '%00'), null);
    for (const p of ['run/../secret.txt', 'run/%2e%2e/secret.txt', 'run/..%2fsecret.txt', 'run/..%5csecret.txt', 'run/link.txt', 'viewer.css/../../serve.mjs', 'serve.mjs', 'make-sample.mjs']) {
      const r = await req(url + p);
      assert.notEqual(r.status, 200, p);
      assert.ok(!r.body.includes('top secret'), p);
    }
    // A raw ../ request line (not tidied by URL parsing on the client side).
    const raw = await new Promise((resolve) => {
      net_connect(port, `GET /run/../../secret.txt HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`, resolve);
    });
    assert.ok(!raw.includes('top secret'));
    const cross = await req(url + 'api/decisions', { method: 'PUT', body: '{"screens":{}}', headers: { Origin: 'http://evil.example' } });
    assert.equal(cross.status, 403);
    const rebind = await req(url + 'api/info', { headers: { Host: 'evil.example' } });
    assert.equal(rebind.status, 403);
    assert.equal((await req(url + 'run/changes.json', { method: 'POST' })).status, 405);
    assert.ok(!existsSync(join(run, 'decisions.json')));
  } finally { server.close(); }
});

import net from 'node:net';
function net_connect(port, text, cb) {
  const sock = net.connect(port, '127.0.0.1', () => sock.write(text));
  let d = ''; sock.on('data', (c) => (d += c)); sock.on('close', () => cb(d));
}
