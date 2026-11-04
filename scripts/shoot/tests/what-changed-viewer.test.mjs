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
  matchesQuery, categories, rowLabel, describeStyle, describeMove, groupChanges, wordParts, progress, buildDecisions, validateDecisions,
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

test('areas split at the first slash or hash, and the rest is the row label', () => {
  assert.equal(areaOf('chat#admin-approval'), 'chat');
  assert.equal(areaOf('settings/assistant/cloud#x'), 'settings');
  assert.equal(rowLabel('settings/assistant/cloud#x'), 'assistant/cloud#x');
  assert.equal(rowLabel('dev/overlay#trust'), 'overlay#trust');
  assert.equal(rowLabel('lonely'), 'lonely');
});

test('screens with wording, added or removed changes list first within an area', () => {
  const rows = (name, kind) => ({ name, theme: 'a', status: 'changed', changes: [{ kind }] });
  const g = groupByArea(aggregateScreens([rows('a/pix', 'pixels'), rows('a/moved', 'moved'), rows('a/word', 'text'), rows('a/style', 'restyled')]));
  assert.deepEqual(g[0].items.map((e) => e.name), ['a/word', 'a/style', 'a/moved', 'a/pix']);
  assert.deepEqual(g[0].items[0].kinds, ['text']);
});

test('style and position changes are said in plain words; invisible ones are dropped', () => {
  assert.equal(describeStyle({ prop: 'radius', from: '8px', to: '6px' }).label, 'Corners less rounded');
  assert.equal(describeStyle({ prop: 'font', from: '16px 500 Nunito', to: '18px 500 Nunito' }).label, 'Text size larger');
  assert.equal(describeStyle({ prop: 'border', from: '0px solid rgb(1, 1, 1)', to: '0px solid rgb(2, 2, 2)' }), null);
  assert.deepEqual(describeStyle({ prop: 'color', from: 'rgb(1, 2, 3)', to: 'rgb(4, 5, 6)' }).swatch, { from: 'rgb(1, 2, 3)', to: 'rgb(4, 5, 6)' });
  assert.equal(describeMove({ box: { x: 11, y: 14, w: 36, h: 24 }, beforeBox: { x: 20, y: 20, w: 24, h: 24 } }), 'Moved left 9 px, up 6 px, Wider by 12 px');
});

test('repeated changes fold into one group; wording and added come first, pixels last', () => {
  const btn = (name, dx) => ({ kind: 'restyled', role: 'button', name, styleChanges: [{ prop: 'color', from: 'rgb(1, 1, 1)', to: 'rgb(2, 2, 2)' }], box: { x: dx, y: 0, w: 1, h: 1 }, beforeBox: { x: 0, y: 0, w: 1, h: 1 } });
  const changes = [{ kind: 'pixels', box: { x: 0, y: 0, w: 1, h: 1 } }, btn('a', 5), btn('b', 9), btn('c', 2),
    { kind: 'moved', role: 'button', name: 'm1', box: { x: 1, y: 1, w: 1, h: 1 }, beforeBox: { x: 0, y: 0, w: 1, h: 1 } },
    { kind: 'moved', role: 'button', name: 'm2', box: { x: 3, y: 1, w: 1, h: 1 }, beforeBox: { x: 0, y: 0, w: 1, h: 1 } },
    { kind: 'text', role: 'button', name: 'T', oldText: 'a', newText: 'b' }];
  const g = groupChanges(changes);
  assert.deepEqual(g.map((x) => x.kind), ['text', 'restyled', 'moved', 'pixels']);
  assert.equal(g[1].title, '3 buttons restyled');
  assert.deepEqual(g[1].lines.map((l) => l.text), ['Text colour changed']);
  assert.equal(g[2].items.length, 2);
});
