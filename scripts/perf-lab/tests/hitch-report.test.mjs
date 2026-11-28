import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, analyseRhythm, buildWarning, causeOfFrame, causeOfStall, launchSummaries, parseSince, readLines, render, rhythmFor, rhythmHeadline } from '../hitch-report.mjs';

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
  assert.match(causeOfFrame({ d: 300, sl: 0, sc: [] }), /unattributed.*no script timing recorded/);
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
  assert.match(render(analyse(rows), 0), /timer-only measurements are lower bounds/);
  assert.doesNotMatch(render(analyse(rows), 0), /accurate to about \+\/- 50 ms/);
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

// ---- per-launch view, rhythm view, headline, terminal-ack wording (synthetic data generated here) ----
const S0 = Date.UTC(2026, 10, 1, 12, 0, 0);
// A stall line is written when the stall ENDS, so ts = start + ms.
const stallRow = (launch, startMs, ms, extra = {}) => ({ ts: new Date(startMs + ms).toISOString(), t: startMs + ms, launch, kind: 'main-stall', ms, ...extra });
const frameRow = (launch, atMs, d = 150) => ({ ts: new Date(atMs).toISOString(), t: atMs, launch, kind: 'frame', d, sl: 0, sc: [] });
// Small deterministic pseudo-random numbers so "random" fixtures never flake.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
// n stalls from a timer of periodS seconds, starting at phaseS into each cycle, +-100 ms jitter.
const timerStalls = (launch, periodS, phaseS, n, seed = 7) => { const r = rng(seed); return Array.from({ length: n }, (_, i) => stallRow(launch, S0 + i * periodS * 1000 + phaseS * 1000 + (r() - 0.5) * 200, 100 + Math.round(r() * 100))); };
const randomStalls = (launch, n, spanMs, seed = 3) => { const r = rng(seed); return Array.from({ length: n }, () => stallRow(launch, S0 + Math.floor(r() * spanMs), 100 + Math.round(r() * 100))); };

test('terminal-ack as the last request is labelled as terminal output, not named as a cause, and is still counted', () => {
  assert.match(causeOfStall({ ms: 300, lastIpc: 'session:terminal-ack', lastIpcAgoMs: 100 }), /during terminal output, no specific request/);
  assert.doesNotMatch(causeOfStall({ ms: 300, lastIpc: 'session:terminal-ack', lastIpcAgoMs: 100 }), /terminal-ack/);
  assert.match(causeOfStall({ ms: 300, lastIpc: 'session:list', lastIpcAgoMs: 100 }), /last request it started was session:list/);
  assert.match(causeOfStall({ ms: 300, lastIpc: 'session:list', lastIpcAgoMs: 900 }), /no app request had started/);
  const rows = [1, 2, 3].map((i) => stallRow('a', S0 + i * 7000, 300, { lastIpc: 'session:terminal-ack', lastIpcAgoMs: 50 }));
  const g = analyse(rows).byCause.find((x) => /during terminal output/.test(x.key));
  assert.equal(g.count, 3);
});

test('per-launch summary: counts, rate, stalled time, median/p90 and freezes', () => {
  const H = 3_600_000;
  const rows = [
    ...[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((ms, i) => stallRow('L1', S0 + i * 60_000, ms)),
    frameRow('L1', S0 + 30_000), frameRow('L1', S0 + 90_000),
    { ts: new Date(S0 + H).toISOString(), t: S0 + H, launch: 'L1', kind: 'minute' }, // stretches the launch to 1 hour
  ];
  const [l] = launchSummaries(rows);
  assert.equal(l.launch, 'L1');
  assert.equal(l.durationMs, H - 100); // first line is stamped when its 100 ms stall ended
  assert.equal(l.stalls, 10);
  assert.equal(Math.round(l.stallsPerHour), 10);
  assert.equal(l.stalledMs, 5500);
  assert.equal(l.medianStallMs, 500);
  assert.equal(l.p90StallMs, 900);
  assert.equal(l.freezes, 2);
  assert.equal(l.vsPrevious, null);
});

test('per-launch comparison says better/worse by how much, and refuses short launches', () => {
  const H = 3_600_000;
  const mk = (launch, start, nStalls, spanMs) => [
    ...Array.from({ length: nStalls }, (_, i) => stallRow(launch, start + 1000 + i * 1000, 200)),
    { ts: new Date(start + spanMs).toISOString(), t: start + spanMs, launch, kind: 'minute' },
  ];
  const rows = [...mk('A', S0, 100, H), ...mk('B', S0 + 2 * H, 40, H), ...mk('C', S0 + 4 * H, 40, 5 * 60_000)];
  const ls = launchSummaries(rows);
  assert.deepEqual(ls.map((l) => l.launch), ['A', 'B', 'C']);
  assert.equal(ls[1].vsPrevious.verdict, 'better');
  assert.ok(Math.abs(ls[1].vsPrevious.stallsPerHourChange - -0.6) < 0.01);
  assert.equal(ls[2].vsPrevious.comparable, false); // C covers only 5 minutes
  const worse = launchSummaries([...mk('A', S0, 40, H), ...mk('B', S0 + 2 * H, 100, H)]);
  assert.equal(worse[1].vsPrevious.verdict, 'worse');
  const text = render(analyse([...mk('A', S0, 100, H), ...mk('B', S0 + 2 * H, 40, H)]), 0);
  assert.match(text, /PER LAUNCH/);
  assert.match(text, /BETTER.*60% fewer stalls an hour/);
});

test('rhythm finds a 10 s timer, names its phase, and folds the 5 s echo into it', () => {
  const stalls = timerStalls('L', 10, 6.2, 120).map((r) => ({ start: r.t - r.ms, ms: r.ms }));
  const [h, ...rest] = rhythmFor(stalls);
  assert.equal(rest.length, 0);
  assert.equal(h.periodS, 10);
  assert.ok(h.share > 0.9, `share ${h.share}`);
  assert.ok(h.harmonics.includes(5)); // the 5 s fold is the same timer, not a second finding
});

test('rhythm does not promote a true 5 s timer to a longer period', () => {
  const stalls = timerStalls('L', 5, 1.2, 150).map((r) => ({ start: r.t - r.ms, ms: r.ms }));
  const found = rhythmFor(stalls);
  assert.equal(found.length, 1);
  assert.equal(found[0].periodS, 5);
});

test('rhythm reports nothing for stalls scattered at random', () => {
  const stalls = randomStalls('L', 400, 6 * 3_600_000).map((r) => ({ start: r.t - r.ms, ms: r.ms }));
  assert.deepEqual(rhythmFor(stalls), []);
});

test('rhythm needs enough stalls, and the headline names the worst repeating stall', () => {
  const few = analyseRhythm(timerStalls('FEW', 10, 3, 20));
  assert.equal(few[0].tested, false);
  assert.equal(rhythmHeadline(few), null);
  const rows = [...timerStalls('85e4', 10, 6.2, 100), ...randomStalls('RND', 100, 3_600_000)];
  const rhythm = analyseRhythm(rows);
  assert.equal(rhythm.find((l) => l.launch === 'RND').repeating.length, 0);
  assert.match(rhythmHeadline(rhythm), /^Most engine stalls repeat every 10 s \(\d+% of them, launch 85e4\) — a timer, not real work\./);
  const a = analyse(rows);
  assert.match(render(a, 0), /THE SHORT VERSION\n {2}Most engine stalls repeat every 10 s/);
  assert.match(render(a, 0), /REPEATING STALLS/);
  assert.equal(JSON.parse(JSON.stringify(a)).rhythm.find((l) => l.launch === '85e4').repeating[0].periodS, 10);
  assert.equal(analyse(randomStalls('RND', 100, 3_600_000)).headline, null);
});
