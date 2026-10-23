#!/usr/bin/env node
// scripts/perf-lab/bigfence-stream-run.mjs — standalone entry for the "one huge code fence" scenario (see scenario-bigfence-stream.mjs).
//
//   node scripts/perf-lab/bigfence-stream-run.mjs --a <checkout> [--b <checkout>] [--rounds 2] [--label x] [--only code-2000,json-700]
//        [--out <dir>] [--check]
//
// --only takes rung ids written variant-size (code-2000, code-20000, json-700, jsonone-700). Everything else about the run is the path-list
// runner's contract: cached-only builds (never builds, never downloads), busy-machine semantics with every window's interference verdict kept,
// A/B interleaved (A,B then B,A ...), a run lock, one app boot per rung, and an exploratory label. No model is used: the reply comes from the
// lab's local fake model server.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { installDocumentReceipt, withDocumentWatchdog, MEMORY_BASIS } from './scenario-document-stalls.mjs';
import { SCRATCH, nativeStreamFixtureOptions, setInterferenceSink, setWindowLabel, withBoot } from './run.mjs';
import { publishReportJson } from './atomic-report.mjs';
import { labProcessesRunning } from './pathlist-stream-run.mjs';
import {
  alignClocks, buildWindows, longtaskWindows, loopWindows, probeLogSource, startTypingTrain, summariseTyping,
} from './scenario-pathlist-stream.mjs';
import {
  BIGFENCE_SCENARIO, BIGFENCE_THRESHOLDS, DEFAULT_RUNGS, ALL_VARIANTS, PSS_CAP_MB, RUNG_GRACE_MS, SETTLE_TIMEOUT_MS, SCROLL_PASS,
  aggregateRounds, awaitFinalPaintSource, classifyRung, finishedReadingSource, paneStateSource, planRungs, publicPlan, renderComparison,
  scrollPassSource, TABLE_METRICS,
} from './scenario-bigfence-stream.mjs';

// WHY: buildFixture only accepts the workspace's own approved `youcoded/` path (assertApprovedCheckoutPath), and the A/B candidates
// (e.g. a baseline copy) are not on that list. The fixture is model-free and identical for both sides, so it is built from the approved path;
// the candidate under test is still the `build` passed to withBoot. Nothing about the approval check is loosened.
export const FIXTURE_CHECKOUT = resolve(fileURLToPath(new URL('../../youcoded', import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.error('[bigfence]', ...a);

/**
 * One rung inside one booted app. Same skeleton as pathlist-stream-run.measureRung (one native session on the fake endpoint, typing probe
 * running from before the send to after the scroll), plus the finished-page half: after the reply has painted, a scroll pass through the block
 * while the typing probe keeps going. Returns the raw record classifyRung() judges.
 */
export async function measureRung(app, fixture, plan, { _deps = {} } = {}) {
  const cdp = app.cdp;
  const d = { startFakeProvider, installProbe, stopProbe, installLoopProbe, readLoopProbe, exchangeDocumentClock, installDocumentReceipt, startTypingTrain, sleep, ..._deps };
  const fake = await d.startFakeProvider({ port: fixture.fakeProvider.port });
  let train = null, loopToken = null;
  try {
    await d.installProbe(cdp);
    await installStreamHelpers(cdp);
    const created = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify({
      name: 'bigfence', cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native',
      binding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId }, preset: 'coder' })}); return { id: s.id }; } catch (e) { return { error: String(e && e.message || e) }; } })()`);
    if (created.error) throw Object.assign(new Error(`session.create failed: ${created.error}`), { status: 'instrument' });
    const sessionId = created.id;
    let visible = false;
    for (let i = 0; i < 200 && !visible; i++) {
      visible = await cdp.evaluate(`(() => { const a = [...document.querySelectorAll('[data-chat-session-id]')].filter((x) => !x.closest('[aria-hidden="true"]')); return a.length === 1 && a[0].dataset.chatSessionId === ${JSON.stringify(sessionId)}; })()`);
      if (!visible) await d.sleep(100);
    }
    await d.sleep(1500);
    fake.plan({ deltas: plan.deltas, perSec: plan.perSec, text: plan.text });
    const completion = fake.expectCompletion();

    await d.installDocumentReceipt(cdp, plan.id, sessionId);
    loopToken = (await d.installLoopProbe(cdp, { kind: 'renderer', maxEvents: 256 })).token;
    await app.mainLoop.start();
    const watchMark = app.interference?.mark?.() ?? null;

    const exchanges = [await d.exchangeDocumentClock(cdp), await d.exchangeDocumentClock(cdp)];
    // WHY 350 ms (path-list uses 250): the train stops sending at 240 keys (the page-side receipt cap is 256) and this stream can last 60 s,
    // so 250 ms keys would run out before the scroll pass - leaving the finished-page typing delay unmeasured.
    train = d.startTypingTrain(cdp, { everyMs: 350 });
    await d.sleep(1500);   // idle typing baseline
    const sendMs = await cdp.evaluate('performance.now()');
    const send = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(sessionId)}, 'bigfence-stream')`);
    if (!send || send.status === 'failed') throw Object.assign(new Error(`native.send failed: ${JSON.stringify(send)}`), { status: 'instrument' });
    const rec = await completion;
    const timeOrigin = await cdp.evaluate('performance.timeOrigin');
    const streamEndMs = rec.endedAt - timeOrigin;
    const final = await cdp.evaluate(awaitFinalPaintSource(plan, SETTLE_TIMEOUT_MS));
    // Finished-page half. Only when the reply really painted: scrolling a half-drawn page would measure something else.
    let scroll = null, finished = null;
    if (final.ok) {
      await d.sleep(500);
      finished = await cdp.evaluate(finishedReadingSource);
      scroll = await cdp.evaluate(scrollPassSource(SCROLL_PASS));
      await d.sleep(500);
    }
    await train.stop();
    exchanges.push(await d.exchangeDocumentClock(cdp), await d.exchangeDocumentClock(cdp));

    const windows = buildWindows({ sendMs, streamEndMs, paintedMs: final.paintedAtMs });
    const probe = await cdp.evaluate(probeLogSource);
    const loop = await d.readLoopProbe(cdp, 'renderer', { token: loopToken, stop: true, waitForSample: true });
    const main = await app.mainLoop.read({ stop: true, waitForSample: true });
    const receipt = await cdp.evaluate('({receipts:window.__documentStall.receipts,overflow:window.__documentStall.overflow})');
    const clocks = alignClocks(exchanges);
    const pane = await cdp.evaluate(paneStateSource(plan));
    // The scroll pass's own long tasks. WHY reuse longtaskWindows with the scroll window in the 'stream' slot: it is the same
    // "log entries whose start falls in [a,b]" maths; the slot name is the helper's, the result is read back as scrollTasks.
    const scrollTasks = scroll?.ok ? longtaskWindows(probe, { stream: [scroll.startMs, scroll.endMs], settle: null }).stream : null;
    return {
      fakeRecord: rec, final: { ...final, state: pane ?? final.state }, finished, scroll, scrollTasks, sessionVisible: visible, windows,
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

export async function runRung(build, checkout, plan, label) {
  setWindowLabel(label);
  const fixture = buildFixture(SCRATCH, { ...nativeStreamFixtureOptions({ streamCompletionDiagnostics: true }), checkout: FIXTURE_CHECKOUT, log: () => {} });
  let raw;
  try {
    raw = await withBoot(build, fixture, async (app) => {
      const guarded = await withDocumentWatchdog(app, () => measureRung(app, fixture, plan), {
        timeoutMs: plan.streamMs + RUNG_GRACE_MS + SCROLL_PASS.durationMs + 5000, maxRssMb: PSS_CAP_MB, memoryBasis: MEMORY_BASIS.pss });
      if (guarded.status) return { failure: { status: guarded.status, error: guarded.error }, memory: guarded.memory };
      return { ...guarded.value, memory: guarded.memory };
    }, { mainLoop: true });
  } catch (e) {
    raw = { failure: { status: e.status ?? 'instrument', error: e.message } };
  }
  return classifyRung(plan, raw);
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rung ids are variant-size: code-2000, json-700. */
export function parseRungId(id) {
  const m = /^([a-z]+)-(\d+)$/.exec(id);
  if (!m || !ALL_VARIANTS.includes(m[1]) || Number(m[2]) < 1) throw new Error(`rung ${id}: expected <${ALL_VARIANTS.join('|')}>-<size> (lines for code, KB for json)`);
  return [m[1], Number(m[2])];
}

export function parseCli(argv) {
  const o = { rounds: 2, label: '', rungs: DEFAULT_RUNGS.map(([v, n]) => [v, n]), check: false, out: join(resolve(fileURLToPath(new URL('../..', import.meta.url))), 'perf-reports', 'bigfence-stream') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`${k} needs a value`); return x; };
    if (k === '--a') o.a = resolve(v());
    else if (k === '--b') o.b = resolve(v());
    else if (k === '--rounds') o.rounds = Number(v());
    else if (k === '--label') o.label = v();
    else if (k === '--only') o.rungs = v().split(',').map((x) => x.trim()).filter(Boolean).map(parseRungId);
    else if (k === '--out') o.out = resolve(v());
    else if (k === '--check') o.check = true;
    else if (k === '--cached-only' || k === '--busy-machine') { /* always on; accepted so command lines match the lab's */ }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!o.a) throw new Error('--a <checkout> is required');
  if (!Number.isInteger(o.rounds) || o.rounds < 1) throw new Error('--rounds must be a whole number >= 1');
  if (!o.rungs.length) throw new Error('--only needs at least one rung');
  return o;
}

export async function main(argv) {
  const cfg = parseCli(argv);
  const plans = planRungs({ rungs: cfg.rungs });
  const sides = { old: cfg.a, ...(cfg.b ? { new: cfg.b } : {}) };
  if (cfg.check) {
    say(`plan: ${plans.length} rungs x ${Object.keys(sides).length} side(s) x ${cfg.rounds} round(s) = ${plans.length * Object.keys(sides).length * cfg.rounds} boots`);
    for (const p of plans) say(`${p.id}: ${p.lineCount} lines, ${Math.round(p.fenceChars / 1000)} KB, ${p.deltas} deltas at ${p.perSec}/s (${p.atCloudSpeed ? 'cloud speed' : 'FASTER than cloud'}), ~${Math.round(p.streamMs / 1000)} s, ${p.overLimit ? 'OVER' : 'under'} the candidate's colour limit`);
    return 0;
  }
  const running = labProcessesRunning();
  if (running.length) { say(`refusing: a lab run is in progress (pid ${running.map((r) => r.pid).join(', ')})`); return 2; }
  const lock = acquireRunLock(join(SCRATCH, 'run.lock'), { label: `bigfence-stream ${cfg.label}` });
  const interference = [];
  setInterferenceSink(interference);
  const report = { scenario: BIGFENCE_SCENARIO, timestamp: new Date().toISOString(), label: cfg.label, thresholds: BIGFENCE_THRESHOLDS,
    exploratory: { mode: 'busy-machine', note: 'measured without waiting for a quiet machine; every window keeps its interference verdict; not comparable to quiet-machine numbers' },
    sides: {}, plans: plans.map(publicPlan), rows: [], interference };
  const stem = `bigfence-stream-${report.timestamp.replace(/[^0-9]/g, '').slice(0, 12)}${cfg.label ? `-${cfg.label.replace(/[^\w-]/g, '-')}` : ''}`;
  try {
    mkdirSync(cfg.out, { recursive: true });
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
        publishReportJson(cfg.out, stem, report);   // checkpoint after every rung
      }
    }
    writeFileSync(join(cfg.out, `${stem}.md`), `# bigfence-stream (${cfg.label || 'unlabelled'})\n\nExploratory, busy-machine. Cells: median (min-max) over rounds. old = candidate A, new = candidate B. \`coloured\` 1 = the block was drawn with syntax colour, 0 = drawn plain.\n${renderComparison(report.aggregate, { sides: Object.keys(sides), metrics: TABLE_METRICS })}\n`);
    say(`report: ${join(cfg.out, stem)}.json / .md`);
    return 0;
  } finally { lock.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(join(SCRATCH), { recursive: true });
  process.exitCode = await main(process.argv.slice(2));
  setTimeout(() => process.exit(process.exitCode), 10_000).unref();
}
