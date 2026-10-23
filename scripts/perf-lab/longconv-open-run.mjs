#!/usr/bin/env node
// scripts/perf-lab/longconv-open-run.mjs — standalone entry for "open a long saved conversation" (see scenario-longconv-open.mjs).
//
//   node scripts/perf-lab/longconv-open-run.mjs --a <checkout> [--b <checkout>] [--rounds 2] [--label x] [--turns 40,200,1000] [--out <dir>] [--check]
//
// Same contract as the other standalone scenarios: cached-only builds (never builds, never downloads), busy-machine semantics with every
// window's interference verdict kept, A/B interleaved, a run lock, one app boot per rung, exploratory label. No model: the conversation is a
// native transcript file the fixture writes, resumed through the app's own resume event.
import { mkdirSync, writeFileSync, utimesSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from './build.mjs';
import { buildFixture } from './fixture.mjs';
import { startXvfb } from './launch.mjs';
import { acquireRunLock } from './run-lock.mjs';
import { interleaveSchedule } from './busy-interleave.mjs';
import { installLoopProbe, readLoopProbe } from './probe-loop.mjs';
import { exchangeDocumentClock } from './document-input.mjs';
import { installProbe, stopProbe } from './scenario-workload.mjs';
import { installDocumentReceipt, withDocumentWatchdog, MEMORY_BASIS } from './scenario-document-stalls.mjs';
import { scrollAndCount } from './late-content.mjs';
import { SCRATCH, nativeStreamFixtureOptions, setInterferenceSink, setWindowLabel, withBoot } from './run.mjs';
import { publishReportJson } from './atomic-report.mjs';
import { labProcessesRunning } from './pathlist-stream-run.mjs';
import { aggregateRounds, renderComparison } from './scenario-bigfence-stream.mjs';
import { alignClocks, loopWindows, longtaskWindows, probeLogSource, startTypingTrain, summariseTyping } from './scenario-pathlist-stream.mjs';
import {
  LONGCONV_SCENARIO, LONGCONV_THRESHOLDS, TURN_COUNTS, PSS_CAP_MB, RUNG_GRACE_MS, OPEN_TIMEOUT_MS, AFTER_OPEN_MS, SCROLL_UP, TABLE_METRICS,
  censusSource, classifyRung, longConversationLines, openSource, planRungs, summariseLateContent, visiblePaneIdsSource,
} from './scenario-longconv-open.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.error('[longconv]', ...a);
// WHY: see bigfence-stream-run.mjs - the approved fixture path, identical for both candidates; the candidate under test is the `build`.
export const FIXTURE_CHECKOUT = resolve(fileURLToPath(new URL('../../youcoded', import.meta.url)));

/** Replace the fixture's one big native session with the mixed prose / code / tool-card conversation of `turns` turns. Returns the resume detail. */
export function seedLongConversation(fixture, turns) {
  const ns = fixture.nativeSessions;
  if (!ns?.big) throw new Error('longconv: the fixture was built without { nativeSessions } - there is nothing to replace');
  const startedAt = Date.now() - 24 * 3_600_000;
  writeFileSync(ns.big.path, `${longConversationLines({ sessionId: ns.big.sessionId, cwd: ns.cwd, turns, startedAt, binding: ns.binding }).join('\n')}\n`);
  const mtime = new Date(Date.now() - 3_600_000);
  utimesSync(ns.big.path, mtime, mtime);
  return { claudeSessionId: ns.big.sessionId, projectSlug: ns.slug, projectPath: ns.cwd, provider: 'native', binding: ns.binding, bytes: statSync(ns.big.path).size };
}

export async function measureRung(app, fixture, plan, detail, { _deps = {} } = {}) {
  const cdp = app.cdp;
  const d = { installProbe, stopProbe, installLoopProbe, readLoopProbe, exchangeDocumentClock, installDocumentReceipt, startTypingTrain, scrollAndCount, sleep, ..._deps };
  let train = null, loopToken = null;
  try {
    await d.installProbe(cdp);
    await d.sleep(2000);   // let the booted app's own start-up work drain before the clock starts
    const priorIds = await cdp.evaluate(visiblePaneIdsSource);
    await d.installDocumentReceipt(cdp, plan.id, null);
    loopToken = (await d.installLoopProbe(cdp, { kind: 'renderer', maxEvents: 256 })).token;
    await app.mainLoop.start();
    const watchMark = app.interference?.mark?.() ?? null;
    const exchanges = [await d.exchangeDocumentClock(cdp), await d.exchangeDocumentClock(cdp)];

    // The open runs page-side and publishes window.__lc.sessionId the moment the new pane exists; the typing train starts then, so its keys
    // land on that pane (the receipt checks the target) and run through the open, the 3 s after it, and the scroll pass.
    const opening = cdp.evaluate(openSource({ detail: { claudeSessionId: detail.claudeSessionId, projectSlug: detail.projectSlug, projectPath: detail.projectPath, provider: detail.provider, binding: detail.binding }, marker: plan.marker, priorIds }));
    opening.catch(() => {});
    let sessionId = null;
    const t0 = Date.now();
    while (sessionId === null && Date.now() - t0 < OPEN_TIMEOUT_MS) {
      sessionId = await cdp.evaluate('window.__lc && window.__lc.sessionId || null');
      if (sessionId === null) await d.sleep(20);
    }
    if (sessionId !== null) {
      await cdp.evaluate(`window.__documentStall.sessionId = ${JSON.stringify(sessionId)}`);
      train = d.startTypingTrain(cdp);
    }
    const open = await opening;
    let census = null, late = null, lateRaw = null;
    if (open.ok) {
      await d.sleep(AFTER_OPEN_MS);                           // typing watched while the conversation just sits there
      const afterEndMs = await cdp.evaluate('performance.now()');
      census = await cdp.evaluate(censusSource);
      lateRaw = await d.scrollAndCount(cdp, SCROLL_UP);       // scroll-up stability, typing probe still running
      late = summariseLateContent(lateRaw);
      open.afterEndMs = afterEndMs;
    }
    await train?.stop();
    exchanges.push(await d.exchangeDocumentClock(cdp), await d.exchangeDocumentClock(cdp));

    // Windows in renderer time. The shared helpers name them stream/settle; here stream = event -> newest painted, settle = that + AFTER_OPEN_MS.
    const windows = open.ok ? { stream: [open.dispatchMs, open.newestPaintedMs], settle: [open.newestPaintedMs, open.afterEndMs] } : { stream: null, settle: null };
    const probe = await cdp.evaluate(probeLogSource);
    const loop = await d.readLoopProbe(cdp, 'renderer', { token: loopToken, stop: true, waitForSample: true });
    const main = await app.mainLoop.read({ stop: true, waitForSample: true });
    const receipt = await cdp.evaluate('({receipts:window.__documentStall.receipts,overflow:window.__documentStall.overflow})');
    const typing = train
      ? summariseTyping({ train: train.snapshot(), receipts: receipt.receipts, overflow: receipt.overflow, clocks: alignClocks(exchanges), windows })
      : { complete: false, reasons: ['the conversation pane never appeared, so no keys were sent'] };
    return {
      open, census, scrollUp: lateRaw, late, windows,
      longtasks: longtaskWindows(probe, windows), loop: loopWindows(loop, windows), typing,
      main: { maxDelayMs: main?.maxDelayMs ?? null, totalStallMs: main?.totalStallMs ?? null },
      interference: watchMark === null ? null : (() => { const v = app.interference.verdictSince(watchMark, plan.id); return { verdict: v.verdict, reasons: v.reasons ?? [] }; })(),
    };
  } finally {
    try { train?.cancel(); } catch { /* already stopped */ }
    try { await d.stopProbe(cdp); } catch { /* page gone */ }
  }
}

export async function runRung(build, plan, label) {
  setWindowLabel(label);
  const fixture = buildFixture(SCRATCH, { ...nativeStreamFixtureOptions({ streamCompletionDiagnostics: true }), nativeSessions: { count: 1, bigTurns: plan.turns, smallTurns: 1 }, checkout: FIXTURE_CHECKOUT, log: () => {} });
  const detail = seedLongConversation(fixture, plan.turns);
  let raw;
  try {
    raw = await withBoot(build, fixture, async (app) => {
      const guarded = await withDocumentWatchdog(app, () => measureRung(app, fixture, plan, detail), {
        timeoutMs: OPEN_TIMEOUT_MS + RUNG_GRACE_MS + AFTER_OPEN_MS + SCROLL_UP.durationMs + SCROLL_UP.settleMs, maxRssMb: PSS_CAP_MB, memoryBasis: MEMORY_BASIS.pss });
      if (guarded.status) return { failure: { status: guarded.status, error: guarded.error }, memory: guarded.memory };
      return { ...guarded.value, memory: guarded.memory };
    }, { mainLoop: true });
  } catch (e) {
    raw = { failure: { status: e.status ?? 'instrument', error: e.message } };
  }
  return classifyRung(plan, raw);
}

export function parseCli(argv) {
  const o = { rounds: 2, label: '', turns: [...TURN_COUNTS], check: false, out: join(resolve(fileURLToPath(new URL('../..', import.meta.url))), 'perf-reports', 'longconv-open') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`${k} needs a value`); return x; };
    if (k === '--a') o.a = resolve(v());
    else if (k === '--b') o.b = resolve(v());
    else if (k === '--rounds') o.rounds = Number(v());
    else if (k === '--label') o.label = v();
    else if (k === '--turns') o.turns = v().split(',').map((x) => Number(x.trim())).filter((x) => x);
    else if (k === '--out') o.out = resolve(v());
    else if (k === '--check') o.check = true;
    else if (k === '--cached-only' || k === '--busy-machine') { /* always on; accepted so command lines match the lab's */ }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!o.a) throw new Error('--a <checkout> is required');
  if (!Number.isInteger(o.rounds) || o.rounds < 1) throw new Error('--rounds must be a whole number >= 1');
  if (!o.turns.length || !o.turns.every((n) => Number.isInteger(n) && n >= 2)) throw new Error('--turns takes whole numbers >= 2');
  return o;
}

export async function main(argv) {
  const cfg = parseCli(argv);
  const plans = planRungs(cfg.turns);
  const sides = { old: cfg.a, ...(cfg.b ? { new: cfg.b } : {}) };
  if (cfg.check) {
    say(`plan: ${plans.length} rungs x ${Object.keys(sides).length} side(s) x ${cfg.rounds} round(s) = ${plans.length * Object.keys(sides).length * cfg.rounds} boots`);
    for (const p of plans) say(`${p.id}: ${p.turns} turns (${p.toolTurns} with tool cards), newest message carries ${p.marker}`);
    return 0;
  }
  const running = labProcessesRunning();
  if (running.length) { say(`refusing: a lab run is in progress (pid ${running.map((r) => r.pid).join(', ')})`); return 2; }
  const lock = acquireRunLock(join(SCRATCH, 'run.lock'), { label: `longconv-open ${cfg.label}` });
  const interference = [];
  setInterferenceSink(interference);
  const report = { scenario: LONGCONV_SCENARIO, timestamp: new Date().toISOString(), label: cfg.label, thresholds: LONGCONV_THRESHOLDS,
    exploratory: { mode: 'busy-machine', note: 'measured without waiting for a quiet machine; every window keeps its interference verdict; not comparable to quiet-machine numbers' },
    standIn: 'a generated native-session transcript resumed through the app\'s own resume event (no model); not a Claude Code conversation',
    sides: {}, plans, rows: [], interference };
  const stem = `longconv-open-${report.timestamp.replace(/[^0-9]/g, '').slice(0, 12)}${cfg.label ? `-${cfg.label.replace(/[^\w-]/g, '-')}` : ''}`;
  try {
    mkdirSync(cfg.out, { recursive: true });
    const builds = {};
    for (const [side, dir] of Object.entries(sides)) {
      builds[side] = await buildApp(dir, { skipIfFresh: true, cachedOnly: true });
      report.sides[side] = { checkout: dir, sha: builds[side].sha, branch: builds[side].branch, dirty: builds[side].dirty };
    }
    await startXvfb();
    const keyToSide = { a: 'old', b: 'new' };
    for (const slot of interleaveSchedule(cfg.rounds, { aa: false })) {
      const side = keyToSide[slot.key];
      if (!sides[side]) continue;
      for (const plan of plans) {
        say(`${slot.label} ${plan.id}`);
        const row = await runRung(builds[side], plan, `${slot.label}:${plan.id}`);
        report.rows.push({ side, round: slot.round, position: slot.position, row });
        say(`  -> ${row.status}${row.reason ? ` (${row.reason})` : ''}`);
        report.aggregate = aggregateRounds(report.rows, TABLE_METRICS);
        publishReportJson(cfg.out, stem, report);
      }
    }
    writeFileSync(join(cfg.out, `${stem}.md`), `# longconv-open (${cfg.label || 'unlabelled'})\n\nExploratory, busy-machine. Stand-in: generated native-session transcript resumed without a model. Cells: median (min-max) over rounds. old = candidate A, new = candidate B.\n${renderComparison(report.aggregate, { sides: Object.keys(sides), metrics: TABLE_METRICS })}\n`);
    say(`report: ${join(cfg.out, stem)}.json / .md`);
    return 0;
  } finally { lock.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(join(SCRATCH), { recursive: true });
  process.exitCode = await main(process.argv.slice(2));
  setTimeout(() => process.exit(process.exitCode), 10_000).unref();
}
