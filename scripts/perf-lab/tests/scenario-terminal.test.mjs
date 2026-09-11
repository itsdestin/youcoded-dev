// Unit tests for scenario-terminal.mjs — everything checkable without an app.
// Run: node --test scripts/perf-lab/tests/scenario-terminal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLYPH_LINES, GLYPH_SENTINEL, IPC_PING_MS, MEASURES, NUMERIC_PATHS, SQUEEZED_SLOT_MS, SWITCH_COUNT, SWITCH_EVERY_MS,
  glyphCommand, ipcRow, medianRun, stallReading, summariseSwitches,
} from '../scenario-terminal.mjs';
import { attributeStall } from '../scenario-artifacts.mjs';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fake-claude.cjs');
// A glyph line as fake-claude prints it: colour SGR (bold every fifth), a 5-digit number.
const GLYPH_LINE = /\x1b\[(?:1;)?3[1-7]m\d{5} /g;

/**
 * Runs the REAL fake-claude.cjs (the glyph-fill fixture) with `input` on stdin and
 * resolves with its stdout once `untilText` appears — the same sentinel the scenario
 * waits for, so no test here sleeps. HOME and cwd are a throwaway dir (fake-claude
 * creates an empty transcript under HOME), removed with retries.
 */
function runFake(input, untilText, { timeoutMs = 10_000 } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'perf-lab-terminal-'));
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_DESKTOP_PIPE;
  delete env.CLAUDE_DESKTOP_SESSION_ID;
  const child = spawn(process.execPath, [FAKE], { cwd: home, env, stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`fake-claude never printed ${JSON.stringify(untilText)}; got ${JSON.stringify(out.slice(-300))}`)), timeoutMs);
    child.stdout.on('data', (b) => {
      out += b.toString();
      if (out.includes(untilText)) { clearTimeout(timer); resolve(out); }
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
  child.stdin.write(input);
  return done.finally(() => {
    child.kill('SIGTERM');
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
}

test('the glyph fill prints n numbered lines of mixed glyphs, then the sentinel the scenario waits for', async () => {
  const out = await runFake(`${glyphCommand(50)}\n`, GLYPH_SENTINEL(50));
  const lines = out.match(GLYPH_LINE) ?? [];
  assert.equal(lines.length, 50, 'one colour-prefixed numbered line per requested line');
  assert.ok(out.includes('00050 '), 'the last line is numbered 50');
  // Coverage is the point: a digits-only fill would leave the atlas nearly empty.
  assert.equal(new Set(lines.map((l) => l.replace(/\d{5} $/, ''))).size, 14, 'seven colours, each also in bold (the atlas keys a glyph by colour and weight)');
  for (const ch of ['~', '{', 'Z', '╭', '─', '⏺', '✓']) assert.ok(out.includes(ch), `no ${ch} in the fill`);
});

test('any line that is not the command (whitespace aside) only echoes — other scenarios see what they always did', async () => {
  // The trailing 1-line fill is the signal that every earlier line was processed.
  // `  perf-lab-glyphs 2  ` is accepted on purpose: the line is trimmed, which is
  // what fake-claude's comment says; any OTHER text on the line is not.
  const input = `hello\n${glyphCommand(5)} extra\nx${glyphCommand(5)}\n  ${glyphCommand(2)}  \n${glyphCommand(1)}\n`;
  const out = await runFake(input, GLYPH_SENTINEL(1));
  assert.ok(out.includes('hello'), 'input is still echoed');
  assert.equal((out.match(GLYPH_LINE) ?? []).length, 3, 'only the whitespace-padded 2-line and the 1-line command produced glyph lines');
  assert.ok(out.includes(GLYPH_SENTINEL(2)));
  assert.ok(!out.includes(GLYPH_SENTINEL(5)));
});

test('defaults match the brief: 2,000 lines, 40 one-second slots, ~20 pings a slot', () => {
  assert.equal(GLYPH_LINES, 2000);
  assert.equal(glyphCommand(), 'perf-lab-glyphs 2000');
  assert.equal(SWITCH_COUNT, 40);
  assert.ok(SWITCH_EVERY_MS / IPC_PING_MS >= 10, 'a slot must hold enough pings to see a stall that is not the click');
  // The scenario types the command followed by \r; pty-worker writes <= 56 bytes atomically.
  assert.ok(Buffer.byteLength(`${glyphCommand()}\r`) <= 56, 'the typed command must stay on the atomic-submit path');
});

// ── The per-slot IPC row (review fix, 2026-09-10) ───────────────────────────

/** A readIpcStallProbe() result, in the exact shape probe-ipc.mjs returns it. */
const probeRead = (over = {}) => ({
  pings: 19, openStallMs: null, rejectedPings: 0, missedTicks: 0,
  medianMs: 4, p95Ms: 9, maxMs: 40, over100ms: 0, over250ms: 0, over1000ms: 0, totalStallMs: 0, worst: [],
  ...over,
});

test('ipcRow keeps openStallMs, rejectedPings and missedTicks from the probe reading', () => {
  const row = ipcRow(probeRead({ openStallMs: 900, rejectedPings: 2, missedTicks: 17 }), 50);
  assert.equal(row.openStallMs, 900, 'a ping still outstanding at the slot close must survive into the row');
  assert.equal(row.rejectedPings, 2, 'rejections must not pass as fast replies');
  assert.equal(row.missedTicks, 17);
  assert.equal(row.everyMs, 50, 'the interval travels with the row so the open stall is counted like a finished one');
  assert.equal(ipcRow(probeRead(), 50).openStallMs, null, 'nothing in flight reads null, not 0');
  assert.deepEqual(ipcRow({ error: 'page gone' }, 50), { error: 'page gone' });
  assert.ok(ipcRow(null, 50).error, 'a missing reading is an error row, never an empty success');
});

const sw = (i, { ok = true, ms = 100 + i, clears = 1, ipc = ipcRow(probeRead({ pings: 10, totalStallMs: 5, maxMs: 60 }), 50), mode = 'pill', verdict = 'none' } = {}) =>
  ({ i, idx: i % 4, name: `cc-${i % 4}`, ok, mode, ms, clears, ipc, stall: { verdict } });

test('summariseSwitches times only verified switches and counts clears over the whole window', () => {
  const switches = [
    sw(0), sw(1), sw(2), sw(3, { clears: 0 }),
    // A switch that landed on nothing is fast BECAUSE nothing happened; it must not count.
    sw(4, { ok: false, ms: 1, clears: 0, mode: 'none' }),
  ];
  // 5 clears in total: 3 inside the slots, 2 that no slot saw (between slots / the settle).
  const s = summariseSwitches({ switches, clearsBefore: 10, clearsAfter: 15 });
  assert.equal(s.verifiedSwitches, 4);
  assert.equal(s.failedSwitches, 1);
  assert.equal(s.switchPaintedMedianMs, 102, 'median of 100,101,102,103 (upper middle), the failed 1 ms excluded');
  assert.equal(s.atlasClearsTotal, 5);
  assert.equal(s.atlasClearsPerSwitch, 1.3, '5 clears over 4 VERIFIED switches, one decimal');
  assert.equal(s.clearsOutsideSlots, 2);
  assert.equal(s.ipc.pings, 50);
  assert.equal(s.ipc.totalStallMs, 25);
  assert.equal(s.ipc.readErrors, 0);
});

test('a ping still pending when a slot closes counts toward the stall total, max and thresholds', () => {
  // The reviewed failure: the probe is stopped right after the read, so a ping that
  // has not come back is never recorded as a sample. 900 ms outstanding at a 50 ms
  // interval is 850 ms of stall — the same "beyond the interval" rule probe-ipc
  // applies to a finished ping.
  const pending = sw(1, { ipc: ipcRow(probeRead({ pings: 3, totalStallMs: 0, maxMs: 40, openStallMs: 900 }), 50) });
  const justSent = sw(2, { ipc: ipcRow(probeRead({ pings: 19, totalStallMs: 0, maxMs: 30, openStallMs: 12 }), 50) });
  const s = summariseSwitches({ switches: [sw(0), pending, justSent], clearsBefore: 0, clearsAfter: 3 });
  assert.equal(s.ipc.totalStallMs, 5 + 850 + 0, 'the pending ping adds its wait beyond the interval; a ping sent 12 ms ago adds nothing');
  assert.equal(s.ipc.maxMs, 900, 'the worst round trip includes the one still outstanding');
  assert.equal(s.ipc.over250ms, 1);
  assert.equal(s.ipc.over1000ms, 0);
  assert.equal(s.ipc.openStalls, 1);
  // …and the row itself still carries the fields a reader needs to see why.
  assert.equal(pending.ipc.openStallMs, 900);
  assert.equal(pending.ipc.rejectedPings, 0);
});

test('slots whose IPC reading errored are counted, not silently skipped', () => {
  const lost = sw(1, { ipc: ipcRow({ error: 'readIpcStallProbe: window.__ipcStall is not installed' }, 50) });
  const rejected = sw(2, { ipc: ipcRow(probeRead({ pings: 10, totalStallMs: 5, maxMs: 60, rejectedPings: 4 }), 50) });
  const s = summariseSwitches({ switches: [sw(0), lost, rejected], clearsBefore: 0, clearsAfter: 3 });
  assert.equal(s.ipc.readErrors, 1, 'a total over fewer slots is a floor, and the report must be able to say so');
  assert.equal(s.ipc.pings, 20, 'the surviving slots still sum');
  assert.equal(s.ipc.rejectedPings, 4);
});

test('summariseSwitches reports null, never 0, for what was not measured', () => {
  const noInstrument = summariseSwitches({ switches: [sw(0, { clears: null }), sw(1, { clears: null })], clearsBefore: null, clearsAfter: null });
  assert.equal(noInstrument.atlasClearsPerSwitch, null, 'a build without the counter must not read as zero clears');
  assert.equal(noInstrument.atlasClearsTotal, null);
  assert.equal(noInstrument.clearsOutsideSlots, null);
  const nothingWorked = summariseSwitches({ switches: [sw(0, { ok: false, ipc: ipcRow({ error: 'gone' }, 50) })], clearsBefore: 3, clearsAfter: 3 });
  assert.equal(nothingWorked.switchPaintedMedianMs, null);
  assert.equal(nothingWorked.atlasClearsPerSwitch, null, 'no verified switch, nothing to divide by');
  assert.equal(nothingWorked.ipc.pings, 0, 'an errored probe contributes no pings — which run.mjs refuses');
  assert.equal(nothingWorked.ipc.maxMs, null);
  assert.equal(nothingWorked.ipc.readErrors, 1);
});

test('medianRun keeps a never-measured metric null rather than 0, and carries the IPC honesty counts', () => {
  const runs = [
    { switchPaintedMedianMs: 120, atlasClearsPerSwitch: 1, ipc: { totalStallMs: 4, pings: 700, openStalls: 0, readErrors: 0, rejectedPings: 0 }, longtaskMaxMs: null },
    { switchPaintedMedianMs: 140, atlasClearsPerSwitch: 1, ipc: { totalStallMs: 9, pings: 690, openStalls: 2, readErrors: 1, rejectedPings: 0 }, longtaskMaxMs: null },
    { switchPaintedMedianMs: 130, atlasClearsPerSwitch: 1.1, ipc: { totalStallMs: 6, pings: 710, openStalls: 1, readErrors: 1, rejectedPings: 3 }, longtaskMaxMs: null },
  ];
  const m = medianRun(runs);
  assert.equal(m.switchPaintedMedianMs, 130);
  assert.equal(m.ipc.totalStallMs, 6);
  assert.equal(m.ipc.pings, 700);
  assert.equal(m.ipc.openStalls, 1);
  assert.equal(m.ipc.readErrors, 1);
  assert.equal(m.ipc.rejectedPings, 0);
  assert.equal(m.longtaskMaxMs, null, 'an observer that never reported must not read as no long tasks');
  for (const p of NUMERIC_PATHS) {
    const v = p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), m);
    assert.ok(v === null || typeof v === 'number', `${p} is neither null nor a number`);
  }
});

test('MEASURES says what the scenario cannot see, and where the IPC clock starts and stops', () => {
  assert.equal(MEASURES.scenario, 'terminal');
  assert.ok(MEASURES.question.endsWith('?'));
  const blind = MEASURES.blindTo.join(' ');
  assert.match(blind, /llvmpipe/, 'the software renderer must be named');
  assert.match(blind, /re-upload cost on real hardware is NOT measured/, 'the GPU half of the heal cost is not measured and must say so');
  assert.match(blind, /wallpaper/i);
  assert.match(MEASURES.clocks['ipc.totalStallMs'], /slot/, 'the IPC clock must say it covers the whole slot, not just the click');
  assert.match(MEASURES.clocks['ipc.totalStallMs'], /in flight/);
});

// ── Post-shakedown fixes (2026-09-11) ───────────────────────────────────────

test('the per-slot stall verdict sees a ping still pending at the slot close', () => {
  // Main process blocked across the close: finished pings topped out at 20 ms, one
  // has been waiting 900 ms, and the renderer was quiet. attributeStall reads only
  // maxMs, so without stallReading this slot's verdict was 'none'.
  const read = probeRead({ maxMs: 20, openStallMs: 900 });
  const quietRenderer = { longtaskMaxMs: 10, longtaskSupported: true };
  assert.equal(attributeStall(read, quietRenderer).verdict, 'none', 'the premise: the raw reading hides the stall');
  assert.equal(attributeStall(stallReading(read), quietRenderer).verdict, 'main');
  assert.equal(stallReading(read).openStallMs, 900, 'the rest of the reading is untouched');
  // Nothing pending leaves the finished max as it was.
  assert.equal(stallReading(probeRead({ maxMs: 20, openStallMs: null })).maxMs, 20);
  // No data at all stays null, so the verdict is 'unknown' rather than a clean 'none'.
  assert.equal(stallReading(probeRead({ pings: 0, maxMs: null, openStallMs: null })).maxMs, null);
  assert.equal(attributeStall(stallReading(probeRead({ pings: 0, maxMs: null, openStallMs: null })), quietRenderer).verdict, 'unknown');
  assert.equal(stallReading({ error: 'gone' }), null);
  assert.equal(stallReading(null), null);
});

test('slots squeezed below 900 ms by a slow earlier switch are counted', () => {
  // A switch that overruns its second pushes the next slots' starts later while
  // their ends stay on the schedule, so they probe less than a full second each.
  const rows = [
    { ...sw(0), slotMs: 1002 },
    { ...sw(1), slotMs: 2400 },   // the slow switch itself: a long slot, not a squeezed one
    { ...sw(2), slotMs: 610 },
    { ...sw(3), slotMs: SQUEEZED_SLOT_MS },   // exactly at the line is not squeezed
    { ...sw(4), slotMs: null },   // no reading: unknown, never counted as squeezed
  ];
  const s = summariseSwitches({ switches: rows, clearsBefore: 0, clearsAfter: 5 });
  assert.equal(s.squeezedSlots, 1);
  assert.equal(SQUEEZED_SLOT_MS, 900);
  assert.ok(NUMERIC_PATHS.includes('squeezedSlots'), 'the count must reach the report median');
});
