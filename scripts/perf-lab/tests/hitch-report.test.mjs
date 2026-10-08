import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, buildWarning, causeOfFrame, parseSince, readLines, render } from '../hitch-report.mjs';

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

// ── Switching sessions (switch marks, 2026-10-05) ────────────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-10-05T12:00:00.000Z');
const sw = (i, over = {}) => ({ ts: new Date(T0 + i * 10_000).toISOString(), v: '1', launch: 'a', win: 'w1', kind: 'switch', cause: 'pill', vm: 'chat', dk: 'claude', str: false, cold: false, open: 5, ff: 40, st: 60, end: 'settled', interrupted: false, e1: 100, e2: 100, mut: 2, ls: 0, lsv: 0, loaf: 0, loafMs: 0, ind: null, gap: 5000, drain: null, ...over });
const withT = (rows) => rows.map((r) => ({ ...r, t: Date.parse(r.ts) }));
const fixtureRows = () => withT([
  sw(0, { cold: true, gap: null, ff: 30, st: 30 }),
  sw(1, { ff: 120, st: 900, mut: 400, e1: 3000, e2: 5000, cold: true }),            // a huge session that un-folds late
  sw(2, { vm: 'terminal', ff: 50, st: 700, drain: 250000, e1: null, e2: null, mut: 0, gap: 800 }),
  sw(3, { str: true, ff: 90, st: null, end: 'streaming', mut: 90 }),
  sw(4, { gap: 200, ff: 25, st: 25 }), sw(5, { gap: 150, ff: null, st: null, end: 'interrupted', interrupted: true }),
  sw(6, { ff: 450, st: 450 }), sw(7, { end: 'hidden', ff: null, st: null }),
  { ts: new Date(T0 + 1 * 10_000 + 300).toISOString(), launch: 'a', kind: 'frame', d: 250, b: 200, sl: 5, rd: 5, inp: true, sc: [], ctx: { vm: 'chat' }, sessions: 5 },   // a freeze during switch 1
  { ts: new Date(T0 + 1 * 10_000 + 1500).toISOString(), launch: 'a', kind: 'frame', d: 300, b: 250, sl: 5, rd: 5, inp: false, sc: [], ctx: { vm: 'chat' }, sessions: 5 }, // 1.5 s later: after arrival, outside the switch
]);

test('switching: counts, percentiles and threshold buckets', () => {
  const w = analyse(fixtureRows()).switching;
  assert.equal(w.total, 8);
  assert.equal(w.counted, 7);                // the hidden one is left out of the timings
  assert.equal(w.interrupted, 1);
  assert.equal(w.hiddenOrClosed, 1);
  assert.equal(w.showed.n, 6);               // the interrupted one never showed
  assert.equal(w.showed.max, 450);
  assert.equal(w.showed.p50, 50);
  assert.equal(w.settled.max, 900);
  assert.equal(w.settledUnknown, 1);         // the streaming one
  assert.deepEqual(w.overShowed, { over100: 2, over200: 1, over400: 1 });
  assert.deepEqual(w.overSettled, { over100: 3, over200: 3, over400: 3 });
});

test('switching: splits by view, visit, destination and rhythm', () => {
  const s = analyse(fixtureRows()).switching.splits;
  assert.deepEqual(s.byView.map((x) => x.switches), [6, 1]);
  assert.deepEqual(s.byVisit.map((x) => x.switches), [2, 5]);
  assert.deepEqual(s.byDestination.map((x) => x.switches), [6, 1]);
  assert.deepEqual(s.byRhythm.map((x) => x.switches), [2, 5]);    // gap < 500: switches 4 and 5
  assert.equal(s.byView[1].settled.max, 700);
});

test('switching: the worst switches carry their counts and the freezes that overlapped them in time', () => {
  const w = analyse(fixtureRows()).switching;
  assert.equal(w.worst.length, 3);
  assert.equal(w.worst[0].settledMs, 900);
  assert.equal(w.worst[0].entriesAtSettle, 5000);
  assert.equal(w.worst[0].mutations, 400);
  assert.equal(w.worst[0].firstVisit, true);
  assert.deepEqual(w.worst[0].overlapping.map((h) => [h.kind, h.ms]), [['freeze', 250]]);   // the 300 ms one starts 1.5 s in, after this switch had settled (it is counted under 'after arrival')
  assert.equal(w.worst[1].settledMs, 700);
  assert.deepEqual(w.worst[1].overlapping, []);
  assert.equal(w.worst[1].drainedChars, 250000);
});

test('switching: what happened in the 2 s after arrival', () => {
  const a = analyse(fixtureRows()).switching.afterArrival;
  assert.equal(a.keptChanging, 2);                     // switches 1 and 2 changed >= 50 ms after first showing; 3 never held still
  assert.equal(a.medianExtraMs, 650);
  assert.equal(a.freezes, 2);
  assert.equal(a.switchesWithAFreeze, 1);
  assert.equal(a.freezeMs, 550);
});

test('switching: no switch lines, no section; with them, a plain-language section and raw aggregates in --json', () => {
  assert.equal(analyse(readLines([sample], 0).rows).switching, null);
  assert.doesNotMatch(render(analyse(readLines([sample], 0).rows), 0), /SWITCHING SESSIONS/);
  const dir = mkdtempSync(join(tmpdir(), 'hitch-report-sw-'));
  try {
    const f = join(dir, 'hitches.jsonl');
    writeFileSync(f, fixtureRows().map(({ t, ...r }) => JSON.stringify(r)).join('\n') + '\n');
    const text = run(f).stdout;
    assert.match(text, /SWITCHING SESSIONS/);
    assert.match(text, /8 switch\(es\) between sessions recorded; 1 of them cut short/);
    assert.match(text, /Until the new session SHOWED/);
    assert.match(text, /Chat view or terminal view/);
    assert.match(text, /Quick back-and-forth, or spaced out/);
    assert.match(text, /THE THREE WORST/);
    assert.match(text, /THE 2 SECONDS AFTER ARRIVAL/);
    assert.match(text, /Freezes at the same time: freeze 250 ms/);
    assert.doesNotMatch(text, /undefined|NaN|\[object/);
    const j = JSON.parse(run(f, '--json').stdout);
    assert.equal(j.switching.total, 8);
    assert.equal(j.switching.splits.byView[0].switches, 6);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A developer build switches several times slower than the installed app, so the report must say which it read.
const startupRow = (packaged) => ({ v: '1', launch: 'l1', ts: '2026-10-05T09:00:00.000Z', kind: 'startup', main: {}, loadedMs: 1000, renderer: null, ...(packaged === undefined ? {} : { packaged }) });
test('warns when the startup lines say developer build (packaged=false)', () => {
  const a = analyse([startupRow(false)]);
  assert.match(buildWarning(a.build), /developer build.*several times slower than the installed app; don't compare to installed numbers/);
  assert.match(render(a, 0), /WARNING: .*developer build/);
  assert.match(render(a, 0), /DEVELOPER build/);
});
test('warns when the packaged field is missing (older recorder files)', () => {
  const a = analyse([startupRow(undefined)]);
  assert.match(buildWarning(a.build), /no packaged flag/);
  assert.match(render(analyse(readLines([sample], 0).rows), 0), /WARNING: .*no packaged flag/);
});
test('stays quiet for an installed build', () => {
  const a = analyse([startupRow(true)]);
  assert.equal(buildWarning(a.build), null);
  assert.doesNotMatch(render(a, 0), /WARNING/);
});
