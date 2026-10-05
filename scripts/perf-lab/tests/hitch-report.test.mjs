import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, causeOfFrame, parseSince, readLines, render } from '../hitch-report.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const sample = join(here, 'fixtures', 'hitches-sample.jsonl');
const tool = join(here, '..', 'hitch-report.mjs');
const run = (...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' });

test('counts, totals and groups the fixture', () => {
  const { rows, bad } = readLines([sample], 0);
  assert.equal(bad, 1); // the half-written last line is skipped, not fatal
  const a = analyse(rows);
  assert.equal(a.totals.freezes, 3);
  assert.equal(a.totals.stalls, 1);
  assert.equal(a.totals.slowInputs, 1);
  assert.equal(a.totals.frozenMs, 900 + 300 + 150 + 700);
  assert.equal(a.totals.launches, 1);
  assert.equal(a.worst[0].ms, 900);
  assert.match(a.byCause[0].key, /main process stall|renderBigSheet/);
  assert.ok(a.byCause.some((g) => /style & layout/.test(g.key)));
  assert.ok(a.byCause.some((g) => /renderBigSheet \(index-abc.js\)/.test(g.key)));
  assert.ok(a.byCause.some((g) => /session:list/.test(g.key)));
  assert.ok(a.byScreen.some((g) => /terminal/.test(g.key)));
  assert.ok(a.byScreen.some((g) => /dialog open/.test(g.key)));
  assert.deepEqual(a.bySessions.map((g) => g.key).sort(), ['3 sessions'.replace('3', '2-3'), '8 or more sessions'].sort());
  assert.equal(a.startups[0].appMountedMs, 1800);
  assert.ok(a.memory.length >= 2);
});

test('memory growth per hour is first minute -> last minute of each hour', () => {
  const a = analyse(readLines([sample], 0).rows);
  const first = a.memory[0];
  assert.ok(first.last['main process'] > first.first['main process']);
});

test('causeOfFrame reads plainly', () => {
  assert.match(causeOfFrame({ d: 300, sl: 250, sc: [] }), /style & layout/);
  assert.match(causeOfFrame({ d: 300, sl: 0, sc: [] }), /no script of ours/);
  assert.match(causeOfFrame({ d: 300, sl: 0, sc: [{ d: 280, fl: 200, fn: 'measure', src: 'a.js' }] }), /forced layout inside measure/);
});

test('--since keeps only the recent window, and rejects nonsense', () => {
  assert.equal(parseSince('90m'), 90 * 60_000);
  assert.equal(parseSince('24h'), 86_400_000);
  assert.throws(() => parseSince('soon'));
  const { rows } = readLines([sample], parseSince('30m'), Date.parse('2026-10-05T10:00:00Z'));
  assert.ok(rows.length > 0 && rows.every((r) => r.t >= Date.parse('2026-10-05T09:30:00Z')));
});

test('CLI: plain-language text, a --json mode, a directory input, and an error for nothing found', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hitch-report-'));
  try {
    mkdirSync(join(dir, 'perf'));
    copyFileSync(sample, join(dir, 'perf', 'hitches.jsonl'));
    writeFileSync(join(dir, 'perf', 'hitches.1.jsonl'), readFileSync(sample, 'utf8').split('\n')[1] + '\n'); // an older generation
    const text = run(dir);
    assert.equal(text.status, 0);
    assert.match(text.stdout, /THE SHORT VERSION/);
    assert.match(text.stdout, /renderBigSheet/);
    assert.match(text.stdout, /MEMORY, HOUR BY HOUR/);
    assert.match(text.stdout, /STARTUP, PER LAUNCH/);
    const json = JSON.parse(run(join(dir, 'perf', 'hitches.jsonl'), '--json').stdout);
    assert.equal(json.totals.stalls, 1);
    assert.equal(run(join(dir, 'empty-nowhere')).status, 1);
    assert.equal(run(dir, '--since', 'bogus').status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('is read-only: the file is byte-identical afterwards', () => {
  const before = readFileSync(sample);
  run(sample);
  assert.ok(before.equals(readFileSync(sample)));
});

test('a stall whose last request started long before it is not blamed on that request', () => {
  const a = analyse([{ t: 1, ts: '2026-10-05T09:00:00.000Z', launch: 'x', kind: 'main-stall', ms: 400, lastIpc: 'session:list', lastIpcAgoMs: 20000, sessions: 1 }]);
  assert.doesNotMatch(a.byCause[0].key, /session:list/);
  assert.match(a.byCause[0].key, /no app request had started inside the stall/);
});

test('a request is named only if it started inside the stall, worded as a maybe', () => {
  const mk = (ago) => analyse([{ t: 1, ts: '2026-10-05T09:00:00.000Z', launch: 'x', kind: 'main-stall', ms: 400, lastIpc: 'session:list', lastIpcAgoMs: ago, sessions: 1 }]).byCause[0].key;
  assert.match(mk(350), /last request it started was session:list — may be unrelated/);
  assert.doesNotMatch(mk(500), /session:list/); // started before the stall began: the old +300 slack named it
});

test('the text report says stall lengths are approximate', () => {
  const { rows } = readLines([sample], 0);
  assert.match(render(analyse(rows), 0), /accurate to about \+\/- 50 ms/);
});
