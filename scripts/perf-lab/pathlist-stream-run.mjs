#!/usr/bin/env node
// scripts/perf-lab/pathlist-stream-run.mjs — standalone entry for the assistant-path-list streaming scenario.
//
//   node scripts/perf-lab/pathlist-stream-run.mjs --a <checkout> [--b <checkout>] [--rounds 3] [--label x] [--only code,prose,control]
//        [--sizes 100,500] [--control-sizes 2000] [--out <dir>] [--check]
//
// WHY standalone: run.mjs / ab.mjs were busy with a long A/B when this was written, so this file edits NO existing lab file; it only
// imports their exported helpers (withBoot, buildApp cached-only, fixture, fake provider, the loop/frame probes). Folding it into
// run.mjs as a phase is a later, separate step. Always cached-only (never builds) and always busy-machine semantics: it never waits for a
// quiet machine, every window's interference verdict is recorded, and the report is labelled exploratory.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { buildApp } from './build.mjs';
import { buildFixture } from './fixture.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { startXvfb } from './launch.mjs';
import { acquireRunLock } from './run-lock.mjs';
import { interleaveSchedule } from './busy-interleave.mjs';
import { installLoopProbe, readLoopProbe } from './probe-loop.mjs';
import { exchangeDocumentClock } from './document-input.mjs';
import { installProbe, stopProbe } from './scenario-workload.mjs';
import { installStreamHelpers } from './scenario-native-stream.mjs';
import { installDocumentReceipt, sampleOwnedMemory, withDocumentWatchdog, MEMORY_BASIS } from './scenario-document-stalls.mjs';
import { SCRATCH, nativeStreamFixtureOptions, setInterferenceSink, setWindowLabel, withBoot } from './run.mjs';
import { publishReportJson } from './atomic-report.mjs';
import {
  PATHLIST_SCENARIO, PATHLIST_SIZES, CONTROL_SIZES, VARIANTS, ALL_VARIANTS, PATHLIST_THRESHOLDS, PSS_CAP_MB, RUNG_GRACE_MS, SETTLE_TIMEOUT_MS,
  aggregateRounds, alignClocks, awaitFinalPaintSource, buildWindows, classifyRung, longtaskWindows, loopWindows, paneStateSource,
  planRungs, probeLogSource, publicPlan, renderComparison, startTypingTrain, summariseTyping,
} from './scenario-pathlist-stream.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.error('[pathlist]', ...a);

/**
 * One rung inside one booted app: one native session bound to the fake endpoint, one streamed reply, typing + long-task + timer-delay +
 * memory evidence, then wait for the finished reply to paint. Returns the `raw` record classifyRung() judges (never throws for an app
 * problem — the watchdog/catch in runRung turns those into failed rows).
 */
export async function measureRung(app, fixture, plan, { _deps = {} } = {}) {
  const cdp = app.cdp;
  const d = { startFakeProvider, installProbe, stopProbe, installLoopProbe, readLoopProbe, exchangeDocumentClock, installDocumentReceipt, startTypingTrain, sleep, ..._deps };
  const fake = await d.startFakeProvider({ port: fixture.fakeProvider.port });
  let train = null, loopToken = null;
  try {
    await d.installProbe(cdp);
    await installStreamHelpers(cdp);
    // The one native session this rung streams into. Same create call the lab's other native scenarios use.
    const created = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify({
      name: 'pathlist', cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native',
      binding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId }, preset: 'coder' })}); return { id: s.id }; } catch (e) { return { error: String(e && e.message || e) }; } })()`);
    if (created.error) throw Object.assign(new Error(`session.create failed: ${created.error}`), { status: 'instrument' });
    const sessionId = created.id;
    // Wait for it to be the one pane on screen (a fresh session takes focus; if it did not, say so rather than measure a hidden pane).
    let visible = false;
    for (let i = 0; i < 200 && !visible; i++) {
      visible = await cdp.evaluate(`(() => { const a = [...document.querySelectorAll('[data-chat-session-id]')].filter((x) => !x.closest('[aria-hidden="true"]')); return a.length === 1 && a[0].dataset.chatSessionId === ${JSON.stringify(sessionId)}; })()`);
      if (!visible) await d.sleep(100);
    }
    await d.sleep(1500); // let the new session's own start-up work drain before the idle typing baseline
    fake.plan({ deltas: plan.deltas, perSec: plan.perSec, text: plan.text });
    const completion = fake.expectCompletion();

    await d.installDocumentReceipt(cdp, plan.id, sessionId);
    loopToken = (await d.installLoopProbe(cdp, { kind: 'renderer', maxEvents: 256 })).token;
    await app.mainLoop.start();
    const watchMark = app.interference?.mark?.() ?? null;

    const exchanges = [await d.exchangeDocumentClock(cdp), await d.exchangeDocumentClock(cdp)];
    train = d.startTypingTrain(cdp);
    await d.sleep(1500); // idle typing baseline: the same keys on the same page before anything streams
    const sendMs = await cdp.evaluate('performance.now()');
    const send = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(sessionId)}, 'pathlist-stream')`);
    if (!send || send.status === 'failed') throw Object.assign(new Error(`native.send failed: ${JSON.stringify(send)}`), { status: 'instrument' });
    const rec = await completion;
    const timeOrigin = await cdp.evaluate('performance.timeOrigin');
    const streamEndMs = rec.endedAt - timeOrigin;   // wall-clock epoch -> renderer clock; both read the same system clock
    const final = await cdp.evaluate(awaitFinalPaintSource(plan, SETTLE_TIMEOUT_MS));
    await d.sleep(500); // a short tail so a late reflow after "painted" still lands inside the typing record
    await train.stop();
    exchanges.push(await d.exchangeDocumentClock(cdp), await d.exchangeDocumentClock(cdp));

    const windows = buildWindows({ sendMs, streamEndMs, paintedMs: final.paintedAtMs });
    const probe = await cdp.evaluate(probeLogSource);
    const loop = await d.readLoopProbe(cdp, 'renderer', { token: loopToken, stop: true, waitForSample: true });
    const main = await app.mainLoop.read({ stop: true, waitForSample: true });
    const receipt = await cdp.evaluate('({receipts:window.__documentStall.receipts,overflow:window.__documentStall.overflow})');
    const clocks = alignClocks(exchanges);
    const pane = await cdp.evaluate(paneStateSource(plan));
    return {
      fakeRecord: rec, final: { ...final, state: pane ?? final.state }, sessionVisible: visible, windows,
      longtasks: longtaskWindows(probe, windows),
      loop: loopWindows(loop, windows),
      typing: summariseTyping({ train: train.snapshot(), receipts: receipt.receipts, overflow: receipt.overflow, clocks, windows }),
      main: { maxDelayMs: main?.maxDelayMs ?? null, totalStallMs: main?.totalStallMs ?? null },
      interference: watchMark === null ? null : (() => { const v = app.interference.verdictSince(watchMark, plan.id); return { verdict: v.verdict, reasons: v.reasons ?? [] }; })(),
    };
  } finally {
    try { train?.cancel(); } catch { /* already stopped */ }
    try { await d.stopProbe(cdp); } catch { /* page gone */ }
    try { await fake.close(); } catch { /* already closed */ }
  }
}

/** Boot a fresh app + fixture for one rung, measure it under the memory/time watchdog, and return its classified row. */
export async function runRung(build, checkout, plan, label) {
  setWindowLabel(label);
  const fixture = buildFixture(SCRATCH, { ...nativeStreamFixtureOptions({ streamCompletionDiagnostics: true }), checkout, log: () => {} });
  let raw;
  try {
    raw = await withBoot(build, fixture, async (app) => {
      const guarded = await withDocumentWatchdog(app, () => measureRung(app, fixture, plan), {
        timeoutMs: plan.streamMs + RUNG_GRACE_MS, maxRssMb: PSS_CAP_MB, memoryBasis: MEMORY_BASIS.pss });
      // A watchdog stop (timeout / memory cap / lost process) and a thrown instrument error both become a failed row with the reason kept.
      if (guarded.status) return { failure: { status: guarded.status, error: guarded.error }, memory: guarded.memory };
      return { ...guarded.value, memory: guarded.memory };
    }, { mainLoop: true });
  } catch (e) {
    raw = { failure: { status: e.status ?? 'instrument', error: e.message } };
  }
  return classifyRung(plan, raw);
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function parseCli(argv) {
  const o = { rounds: 3, label: '', only: [...VARIANTS], sizes: [...PATHLIST_SIZES], controlSizes: [...CONTROL_SIZES], check: false, out: join(resolve(fileURLToPath(new URL('../..', import.meta.url))), 'perf-reports', 'pathlist-stream') };
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`${k} needs a value`); return x; };
    if (k === '--a') o.a = resolve(v());
    else if (k === '--b') o.b = resolve(v());
    else if (k === '--rounds') o.rounds = Number(v());
    else if (k === '--label') o.label = v();
    else if (k === '--only') o.only = list(v());
    else if (k === '--sizes') o.sizes = list(v()).map(Number);
    else if (k === '--control-sizes') o.controlSizes = list(v()).map(Number);
    else if (k === '--out') o.out = resolve(v());
    else if (k === '--check') o.check = true;
    else if (k === '--cached-only' || k === '--busy-machine') { /* always on; accepted so command lines match the lab's */ }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!o.a) throw new Error('--a <checkout> is required');
  if (!Number.isInteger(o.rounds) || o.rounds < 1) throw new Error('--rounds must be a whole number >= 1');
  if (!o.only.every((x) => ALL_VARIANTS.includes(x))) throw new Error(`--only takes ${ALL_VARIANTS.join(', ')}`);
  if (![...o.sizes, ...o.controlSizes].every((n) => Number.isInteger(n) && n > 0)) throw new Error('sizes must be whole numbers');
  return o;
}

/** Refuses while a lab A/B is running: the run lock is the real guard, this adds a readable message and also catches a process that has not locked yet. */
export function labProcessesRunning(procRoot = '/proc') {
  const hits = [];
  for (const name of readdirSync(procRoot)) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    let cmd = '';
    try { cmd = readFileSync(join(procRoot, name, 'cmdline'), 'utf8').replaceAll('\0', ' '); } catch { continue; }
    if (/perf-lab\/(ab|run)\.mjs/.test(cmd)) hits.push({ pid: Number(name), cmd: cmd.slice(0, 160) });
  }
  return hits;
}

export async function main(argv) {
  const cfg = parseCli(argv);
  const plans = planRungs({ sizes: cfg.sizes, controlSizes: cfg.controlSizes, variants: cfg.only });
  const sides = { old: cfg.a, ...(cfg.b ? { new: cfg.b } : {}) };
  if (cfg.check) {
    say(`plan: ${plans.length} rungs x ${Object.keys(sides).length} side(s) x ${cfg.rounds} round(s) = ${plans.length * Object.keys(sides).length * cfg.rounds} boots`);
    for (const p of plans) say(`${p.id}: ${p.deltas} deltas at ${p.perSec}/s (${p.atCloudSpeed ? 'cloud speed' : 'FASTER than cloud'}), ~${Math.round(p.streamMs / 1000)} s, expects ${p.expectedChips} chips`);
    return 0;
  }
  const running = labProcessesRunning();
  if (running.length) { say(`refusing: a lab run is in progress (pid ${running.map((r) => r.pid).join(', ')})`); return 2; }
  const lock = acquireRunLock(join(SCRATCH, 'run.lock'), { label: `pathlist-stream ${cfg.label}` });
  const interference = [];
  setInterferenceSink(interference);
  const report = { scenario: PATHLIST_SCENARIO, timestamp: new Date().toISOString(), label: cfg.label, thresholds: PATHLIST_THRESHOLDS,
    exploratory: { mode: 'busy-machine', note: 'measured without waiting for a quiet machine; every window keeps its interference verdict; not comparable to quiet-machine numbers' },
    sides: {}, plans: plans.map(publicPlan), rows: [], interference };
  const stem = `pathlist-stream-${report.timestamp.replace(/[^0-9]/g, '').slice(0, 12)}${cfg.label ? `-${cfg.label.replace(/[^\w-]/g, '-')}` : ''}`;
  try {
    const builds = {};
    for (const [side, dir] of Object.entries(sides)) {
      builds[side] = await buildApp(dir, { skipIfFresh: true, cachedOnly: true });   // refuses (throws) rather than build
      report.sides[side] = { checkout: dir, sha: builds[side].sha, branch: builds[side].branch, dirty: builds[side].dirty };
    }
    await startXvfb();
    const schedule = interleaveSchedule(cfg.rounds, { aa: false });
    const keyToSide = { a: 'old', b: 'new' };
    for (const slot of schedule) {
      const side = keyToSide[slot.key];
      if (!sides[side]) continue;
      for (const plan of plans) {
        say(`${slot.label} ${plan.id}`);
        const row = await runRung(builds[side], sides[side], plan, `${slot.label}:${plan.id}`);
        report.rows.push({ side, round: slot.round, position: slot.position, row });
        say(`  -> ${row.status}${row.reason ? ` (${row.reason})` : ''}`);
        report.aggregate = aggregateRounds(report.rows);
        publishReportJson(cfg.out, stem, report);   // checkpoint after every rung: a crash keeps what was measured
      }
    }
    writeFileSync(join(cfg.out, `${stem}.md`), `# pathlist-stream (${cfg.label || 'unlabelled'})\n\nExploratory, busy-machine. Cells: median (min-max) over rounds.\n${renderComparison(report.aggregate, { sides: Object.keys(sides) })}\n`);
    say(`report: ${join(cfg.out, stem)}.json / .md`);
    return 0;
  } finally { lock.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(join(SCRATCH), { recursive: true });
  process.exitCode = await main(process.argv.slice(2));
  setTimeout(() => process.exit(process.exitCode), 10_000).unref();
}
