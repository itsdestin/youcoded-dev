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
  GLYPH_LINES, GLYPH_SENTINEL, MEASURES, NUMERIC_PATHS, SWITCH_COUNT, glyphCommand, medianRun, summariseSwitches,
} from '../scenario-terminal.mjs';

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

test('any line that is not exactly the command only echoes — other scenarios see what they always did', async () => {
  // The trailing 1-line fill is the signal that every earlier line was processed.
  const input = `hello\n${glyphCommand(5)} extra\nx${glyphCommand(5)}\n${glyphCommand(1)}\n`;
  const out = await runFake(input, GLYPH_SENTINEL(1));
  assert.ok(out.includes('hello'), 'input is still echoed');
  assert.equal((out.match(GLYPH_LINE) ?? []).length, 1, 'only the exact command produced glyph lines');
  assert.ok(!out.includes(GLYPH_SENTINEL(5)));
});

test('defaults match the brief: 2,000 lines, 40 switches (enough for a p95 that is not just the max)', () => {
  assert.equal(GLYPH_LINES, 2000);
  assert.equal(glyphCommand(), 'perf-lab-glyphs 2000');
  assert.equal(SWITCH_COUNT, 40);
  // The scenario types the command followed by \r; pty-worker writes <= 56 bytes atomically.
  assert.ok(Buffer.byteLength(`${glyphCommand()}\r`) <= 56, 'the typed command must stay on the atomic-submit path');
});

const sw = (i, { ok = true, ms = 100 + i, clears = 1, ipc = { pings: 10, totalStallMs: 5, maxMs: 60, over250ms: 0, over1000ms: 0 }, mode = 'pill', verdict = 'none' } = {}) =>
  ({ i, idx: i % 4, name: `cc-${i % 4}`, ok, mode, ms, clears, ipc, stall: { verdict } });

test('summariseSwitches times only verified switches and counts clears over the whole window', () => {
  const switches = [
    sw(0), sw(1), sw(2), sw(3, { clears: 0 }),
    // A switch that landed on nothing is fast BECAUSE nothing happened; it must not count.
    sw(4, { ok: false, ms: 1, clears: 0, mode: 'none' }),
  ];
  // 5 clears in total: 3 immediate, 2 landed after their switch painted.
  const s = summariseSwitches({ switches, clearsBefore: 10, clearsAfter: 15 });
  assert.equal(s.verifiedSwitches, 4);
  assert.equal(s.failedSwitches, 1);
  assert.equal(s.switchPaintedMedianMs, 102, 'median of 100,101,102,103 (upper middle), the failed 1 ms excluded');
  assert.equal(s.atlasClearsTotal, 5);
  assert.equal(s.atlasClearsPerSwitch, 1.3, '5 clears over 4 VERIFIED switches, one decimal');
  assert.equal(s.lateClears, 2);
  assert.equal(s.ipc.pings, 50);
  assert.equal(s.ipc.totalStallMs, 25);
});

test('summariseSwitches reports null, never 0, for what was not measured', () => {
  const noInstrument = summariseSwitches({ switches: [sw(0, { clears: null }), sw(1, { clears: null })], clearsBefore: null, clearsAfter: null });
  assert.equal(noInstrument.atlasClearsPerSwitch, null, 'a build without the counter must not read as zero clears');
  assert.equal(noInstrument.atlasClearsTotal, null);
  const nothingWorked = summariseSwitches({ switches: [sw(0, { ok: false, ipc: { error: 'gone' } })], clearsBefore: 3, clearsAfter: 3 });
  assert.equal(nothingWorked.switchPaintedMedianMs, null);
  assert.equal(nothingWorked.atlasClearsPerSwitch, null, 'no verified switch, nothing to divide by');
  assert.equal(nothingWorked.ipc.pings, 0, 'an errored probe contributes no pings — which run.mjs refuses');
  assert.equal(nothingWorked.ipc.maxMs, null);
});

test('medianRun keeps a never-measured metric null rather than 0', () => {
  const runs = [
    { switchPaintedMedianMs: 120, atlasClearsPerSwitch: 1, ipc: { totalStallMs: 4, pings: 700 }, longtaskMaxMs: null },
    { switchPaintedMedianMs: 140, atlasClearsPerSwitch: 1, ipc: { totalStallMs: 9, pings: 690 }, longtaskMaxMs: null },
    { switchPaintedMedianMs: 130, atlasClearsPerSwitch: 1.1, ipc: { totalStallMs: 6, pings: 710 }, longtaskMaxMs: null },
  ];
  const m = medianRun(runs);
  assert.equal(m.switchPaintedMedianMs, 130);
  assert.equal(m.ipc.totalStallMs, 6);
  assert.equal(m.ipc.pings, 700);
  assert.equal(m.longtaskMaxMs, null, 'an observer that never reported must not read as no long tasks');
  for (const p of NUMERIC_PATHS) {
    const v = p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), m);
    assert.ok(v === null || typeof v === 'number', `${p} is neither null nor a number`);
  }
});

test('MEASURES says what the scenario cannot see', () => {
  assert.equal(MEASURES.scenario, 'terminal');
  assert.ok(MEASURES.question.endsWith('?'));
  const blind = MEASURES.blindTo.join(' ');
  assert.match(blind, /llvmpipe/, 'the software renderer must be named');
  assert.match(blind, /re-upload cost on real hardware is NOT measured/, 'the GPU half of the heal cost is not measured and must say so');
  assert.match(blind, /wallpaper/i);
});
