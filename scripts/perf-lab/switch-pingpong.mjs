// scripts/perf-lab/switch-pingpong.mjs — session switching measured the way a person does it:
// real mouse clicks (and the real keyboard shortcut) through the browser's input path, rapid back-and-forth,
// typing and scrolling right after arrival, and the work that lands AFTER the click.
//
// WHY this exists (a code review of 2026-10-05 found the old switch measurement could not see these): the old rig
// used a synthetic el.click(), one switch per second, stopped its clock two frames after the pane swapped, and
// never looked at hidden chats catching up, a hidden terminal's backlog being written on show, the shared glyph-atlas
// clear, interrupted/burst switching, or typing right after arriving.
//
// ONE packaged-app boot per configuration (pair x session count). Sequences in a configuration:
//   a      spaced baseline: A<->B at 1000 ms, 20 switches (comparable with the old rig)
//   b400 / b250 / b150   human ping-pong at 400 / 250 / 150 ms, 20 switches each
//   c      burst: 10 switches 40 ms apart across 4 sessions, then stop (3 reps)
//   d      interrupted: click B, click C 60 ms later (8 reps)
//   e      keyboard: hold the app's own switcher (hold Shift, Arrow Down held for 2 s, release) (3 reps)
//   f      catch-up: work that landed while the destination was hidden (stream / flood), then arrive (reps)
//   ctrl   positive control: the same switch with a known 200 ms main-thread block injected after each click
//   noop   no-op control: click the already-active session — must report "no switch", not 0 ms
//   late   work landing AFTER arrival: CDP metric deltas from first frame to ~3.4 s, switches 3.6 s apart
//   probe  typing + one wheel tick at +50/+150/+300/+600 ms after the click (separate pass: probes would perturb timing)
//   profile  CPU profile of the worst switch, re-run
//
// Per switch: t0 (browser event timestamp AND CDP dispatch time), first frame at which the destination pane is the
// visible one, the frame after it (rendered), SETTLED = no DOM change / layout shift in that pane (chat) or no buffer /
// output change (terminal) for 150 ms, every frame gap > 1.5x the frame period, long animation frames (with script
// attribution) and long tasks, and main-process IPC pings across the sequence. Every switch must really land on the
// intended pane (identity from data-chat-session-id / terminal order) or the sample is dropped and counted.
//
// LIMITS (say them in any write-up): Xvfb + llvmpipe software rendering; rAF/frames are not the physical panel's
// presented frames; fake Claude Code producer (fake-claude.cjs); fixture sizes (small 50 / medium 2500 / huge 3500 turns)
// vs the owner's real histories; one boot per configuration is a shakedown, repeat before ranking.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture, ccProjectSlug, stableUuid, transcriptBody, CONTENT_SEED } from './fixture.mjs';
import { startXvfb, launchApp, readCmdline, selfChain } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { waitForSessionReady } from './scenario-workload.mjs';
import { readRendererInfo } from './gpu.mjs';
import { loadPackageStamp, refusePackageProcesses } from './gpu-theme.mjs';
import { installIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';
import { readEmissions } from './hops.mjs';
import { selfTimes, buckets } from './profile-open.mjs';
import { bounded, metrics, diff as metricsDiff } from './suspects.mjs';
import { pageRecorder } from './switch-page.mjs';
import {
  analyseSwitch, bestClockSync, buildPlan, controlVerdict, estimatePeriod, frameGaps, needsRepeat, percentile,
  splitCold, summarise, summariseSwitches, toPageTime,
} from './switch-analysis.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);

export const CHAT_PAIRS = ['small-huge', 'huge-huge', 'idle-streaming', 'idle-caughtup'];
export const TERM_PAIRS = ['term-term', 'term-flood2', 'term-flood20'];
export const ALL_SEQS = ['a', 'b400', 'b250', 'b150', 'c', 'd', 'e', 'f', 'ctrl', 'noop', 'late', 'probe', 'profile'];
const FLOOD_MB = { 'term-flood2': 2, 'term-flood20': 20 };
const CDP_PORT = 9593;

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: null, appDir: null, out: join(root, 'scratch/perf-lab/switch'), only: ALL_SEQS.join(','), pairs: null, sessions: '6', view: null, maxMinutes: 16, probeReps: 4, tag: '' };
  const known = ['--checkout', '--app-dir', '--out', '--only', '--pairs', '--sessions', '--view', '--max-minutes', '--probe-reps', '--tag'];
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!known.includes(k) || v === undefined || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  if (!o.checkout && !o.appDir) o.checkout = join(root, 'youcoded');
  for (const k of ['checkout', 'appDir', 'out']) if (o[k] && !isAbsolute(o[k])) throw Error(`--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())} must be absolute`);
  o.maxMinutes = Number(o.maxMinutes); o.probeReps = Number(o.probeReps);
  if (!Number.isInteger(o.maxMinutes) || o.maxMinutes < 1 || o.maxMinutes > 40) throw Error('--max-minutes must be 1..40');
  if (!Number.isInteger(o.probeReps) || o.probeReps < 1 || o.probeReps > 12) throw Error('--probe-reps must be 1..12');
  o.only = String(o.only).split(',');
  if (o.only.some(s => !ALL_SEQS.includes(s))) throw Error(`--only takes ${ALL_SEQS.join(',')}`);
  o.sessions = String(o.sessions).split(',').map(Number);
  if (o.sessions.some(n => ![6, 16].includes(n))) throw Error('--sessions takes 6, 16 or 6,16');
  if (o.view && !['chat', 'terminal'].includes(o.view)) throw Error('--view takes chat or terminal');
  o.pairs = o.pairs ? String(o.pairs).split(',') : (o.view === 'terminal' ? TERM_PAIRS : CHAT_PAIRS);
  if (o.pairs.some(p => ![...CHAT_PAIRS, ...TERM_PAIRS].includes(p))) throw Error(`--pairs takes ${[...CHAT_PAIRS, ...TERM_PAIRS].join(',')}`);
  return o;
}

/**
 * The sessions one configuration opens, in order, and which indices are the roles A (where you are), B (destination),
 * C and D (the other two of the four a burst cycles through). kind: 'cc' = Claude Code (fake-claude PTY), 'native'.
 * resume: which transcript the session is resumed from ('small' | 'medium' | 'huge' | 'huge2' | 'x<k>' | null = fresh/empty).
 */
export function worldSpec(pair, count) {
  const cc = (name, resume) => ({ name, kind: 'cc', resume });
  const nat = name => ({ name, kind: 'native', resume: null });
  let list, roles;
  if (pair === 'small-huge') { list = [cc('small', 'small'), cc('huge', 'huge'), cc('medium', 'medium'), cc('empty', null), nat('native-0'), nat('native-1')]; roles = { A: 0, B: 1, C: 2, D: 3 }; }
  else if (pair === 'huge-huge') { list = [cc('huge', 'huge'), cc('huge2', 'huge2'), cc('small', 'small'), cc('empty', null), nat('native-0'), nat('native-1')]; roles = { A: 0, B: 1, C: 2, D: 3 }; }
  else if (pair === 'idle-streaming' || pair === 'idle-caughtup') { list = [cc('small', 'small'), nat('native-0'), cc('huge', 'huge'), cc('empty', null), nat('native-1'), cc('medium', 'medium')]; roles = { A: 0, B: 1, C: 2, D: 3 }; }
  else { list = [cc('small', 'small'), cc('empty', null), cc('medium', 'medium'), cc('huge', 'huge'), nat('native-0'), nat('native-1')]; roles = { A: 0, B: 1, C: 2, D: 3 }; }
  for (let k = 0; list.length < count; k++) list.push(cc(`extra-${k}`, `x${k}`));
  return { list, roles, view: pair.startsWith('term-') ? 'terminal' : 'chat' };
}

// ── page helpers ─────────────────────────────────────────────────────────────

const callSw = (cdp, expr) => cdp.evaluate(`(() => { const S = window.__sw; if (!S) throw new Error('window.__sw is not installed'); return (${expr}); })()`);

async function syncClock(cdp) {
  const s = [];
  for (let i = 0; i < 9; i++) {
    const nodeBefore = Date.now();
    const r = await cdp.evaluate('window.__sw.clock()');
    s.push({ nodeBefore, nodeAfter: Date.now(), pageEpoch: r.pageEpoch, pageNow: r.pageNow });
  }
  return bestClockSync(s);
}

const mouse = (cdp, type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
const key = (cdp, type, k, code, vk, extra = {}) => cdp.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...extra });

/** A real click: press + release through the browser's input path. Returns the Node epoch time just before the press and how long the press took to be acknowledged. */
async function realClick(cdp, box) {
  const nodeAt = Date.now(), p0 = performance.now();
  await mouse(cdp, 'mousePressed', box.x, box.y);
  const ackMs = performance.now() - p0;
  await mouse(cdp, 'mouseReleased', box.x, box.y);
  return { nodeAt, ackMs: r1(ackMs) };
}

// ── world: fixture, app, sessions ────────────────────────────────────────────

function writeExtraTranscripts(fixture, count) {
  const slug = ccProjectSlug(fixture.projects.alpha), dir = join(fixture.home, '.claude', 'projects', slug);
  const out = {};
  const one = (key, turns) => {
    const sessionId = stableUuid(`${CONTENT_SEED}:switchpp:${key}`);
    const path = join(dir, `${sessionId}.jsonl`);
    const lines = transcriptBody({ content: 'realistic', sessionId, cwd: fixture.projects.alpha, turns, startedAt: Date.now() - 2 * 86400000, seed: `${CONTENT_SEED}:switchpp:${key}` });
    writeFileSync(path, lines.join('\n') + '\n');
    return { sessionId, cwd: fixture.projects.alpha, turns, path };
  };
  out.huge2 = one('huge2', 3500);
  for (let k = 0; k < Math.max(0, count - 6); k++) out[`x${k}`] = one(`x${k}`, 50);
  return out;
}

async function createSession(cdp, opts) {
  const r = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify(opts)}); return { id: s.id }; } catch (e) { return { error: e && e.message ? e.message : String(e) }; } })()`);
  if (r.error) throw Error(`session.create(${opts.name}) failed: ${r.error}`);
  return r.id;
}

async function openWorld(ctx) {
  const { cdp, fixture, fake, spec, extras } = ctx;
  const ids = [], warnings = [];
  for (const s of spec.list) {
    if (s.kind === 'native') {
      ids.push(await createSession(cdp, { name: s.name, cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native', binding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId }, preset: 'coder' }));
    } else {
      const t = s.resume ? (fixture.transcripts[s.resume] ?? extras[s.resume]) : null;
      if (s.resume && !t) warnings.push(`no transcript for ${s.resume}: ${s.name} is EMPTY`);
      ids.push(await createSession(cdp, t ? { name: s.name, cwd: t.cwd, skipPermissions: true, resumeSessionId: t.sessionId } : { name: s.name, cwd: fixture.projects.alpha, skipPermissions: true }));
      await waitForSessionReady(cdp);
    }
  }
  return { ids, warnings };
}

// ── the measuring context ────────────────────────────────────────────────────

const cfgOf = ctx => ({ ids: ctx.ids, mode: ctx.view, ptyIdx: ctx.ptyIdx, watch: ctx.view === 'terminal' ? [ctx.roles.A, ctx.roles.B, ctx.roles.C, ctx.roles.D] : [] });

/** Setup navigation only (never timed): select a session with a synthetic click and wait for its pane. */
async function goTo(ctx, idx, settleMs = 900) {
  const { cdp, ids } = ctx;
  await cdp.evaluate(`(() => { const s = document.querySelector('[data-session-strip]') || document.querySelector('.session-strip'); const el = s && s.querySelector('[data-session-id="${ids[idx]}"]'); if (el) { el.click(); return true; } return false; })()`);
  for (let i = 0; i < 100; i++) {
    const v = await cdp.evaluate(`(window.__swVis ? window.__swVis() : -9)`);
    if (v === idx) { await sleep(settleMs); ctx.visited.add(idx); return true; }
    await sleep(100);
  }
  throw Error(`goTo(${idx}): the pane never became visible (visible = ${await cdp.evaluate('window.__swVis ? window.__swVis() : -9')})`);
}

async function installVis(ctx) {
  const { cdp } = ctx;
  await cdp.evaluate(`window.__swVis = () => window.__sw.visNow(${JSON.stringify(ctx.view)}, ${JSON.stringify(ctx.ids)}, ${JSON.stringify(ctx.ptyIdx)}); true`);
}

/** Pill centres for every target while `active` is the active session (the active pill is wide, the others shrink, so the table is per active session). */
async function measureBoxes(ctx, actives) {
  const { cdp, ids } = ctx;
  const table = {};
  for (const x of actives) {
    await goTo(ctx, x, 1200);
    table[x] = await cdp.evaluate(`(() => { const s = document.querySelector('[data-session-strip]') || document.querySelector('.session-strip'); const out = {}; if (!s) return out; const ids = ${JSON.stringify(ids)}; for (const el of s.querySelectorAll('[data-session-id]')) { const i = ids.indexOf(el.getAttribute('data-session-id')); if (i < 0) continue; const r = el.getBoundingClientRect(); out[i] = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) }; } return out; })()`);
  }
  return table;
}

export function ipcWindow(raw, from, to) {
  if (!raw) return null;
  const rows = raw.samples.map(s => ({ at: raw.t0 + s[0], rt: s[1], rej: s[2] })).filter(s => s.at >= from - 100 && s.at <= to);
  const rts = rows.map(r => r.rt);
  return { pings: rows.length, maxMs: rts.length ? Math.max(...rts) : null, over100: rts.filter(n => n > 100).length, over250: rts.filter(n => n > 250).length, over1000: rts.filter(n => n > 1000).length, stallMs: Math.round(rows.reduce((a, r) => a + Math.max(0, r.rt - raw.everyMs), 0)), rejected: rows.filter(r => r.rej).length };
}

/**
 * Run one click plan under the recorder and return analysed samples.
 * plan: [{ at, idx }] click schedule. opts: { tailMs, block (ms of main-thread block after each click), streaming,
 * expectNoop, ipc (default true), label, until (async fn awaited after the last click, before the tail), metrics (bool) }.
 */
async function runPlan(ctx, plan, opts = {}) {
  const { cdp, boxes, ids } = ctx;
  const { tailMs = 2800, block = 0, streaming = false, expectNoop = false, ipc = true, until = null, label = '', capMs = 3000, beforeStep = null, aim = false } = opts;
  const inst = await cdp.evaluate(`window.__sw.install(${JSON.stringify(cfgOf(ctx))})`);
  if (ipc) await installIpcStallProbe(cdp, { everyMs: 50 });
  const sync = await syncClock(cdp);
  const m0 = await metrics(cdp);
  await sleep(700);
  const startFrame = await cdp.evaluate('window.__sw.clock().pageNow');
  const t = performance.now();
  const steps = [];
  let cur = await cdp.evaluate('window.__swVis()');
  for (let i = 0; i < plan.length; i++) {
    const wait = t + plan[i].at - performance.now();
    if (wait > 0) await sleep(wait);
    if (beforeStep) await beforeStep(i);
    // WHY aim (fast cadences only): the pill row is still animating (the active pill grows, the others shift) when the next click
    // is due 150 ms later, so the settled-layout coordinates miss. A person aims at where the pill IS; so one element's rectangle is read
    // immediately before the click (outside t0..settle). It forces a layout flush just before t0, which is why aim runs are labelled.
    const box = aim ? await cdp.evaluate(`(() => { const s = document.querySelector('[data-session-strip]') || document.querySelector('.session-strip'); const el = s && s.querySelector('[data-session-id="${ids[plan[i].idx]}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`) : boxes[cur]?.[plan[i].idx];
    if (!box) { steps.push({ i, idx: plan[i].idx, from: cur, error: 'no pill box for this pair (the pill is not in the strip)' }); continue; }
    const c = await realClick(cdp, box);
    steps.push({ i, idx: plan[i].idx, from: cur, nodeAt: c.nodeAt, ackMs: c.ackMs, cold: !ctx.visited.has(plan[i].idx), plannedAt: plan[i].at });
    ctx.visited.add(plan[i].idx);
    if (block) await cdp.send('Runtime.evaluate', { expression: `(() => { const e = performance.now() + ${block}; while (performance.now() < e); return true; })()`, returnByValue: true });
    cur = plan[i].idx; // where the click should have taken us; the page's frames decide whether it did
  }
  if (until) await until();
  await sleep(tailMs);
  const m1 = await metrics(cdp);
  const R = await cdp.evaluate('window.__sw.read()');
  const ipcRaw = ipc ? await cdp.evaluate('({ t0: window.__ipcStall.t0, everyMs: window.__ipcStall.everyMs, samples: window.__ipcStall.samples })').catch(() => null) : null;
  if (ipc) await stopIpcStallProbe(cdp).catch(() => {});
  await cdp.evaluate('window.__sw.stop && window.__sw.stop()').catch(() => {});
  return analysePlan(ctx, { R, steps, sync, ipcRaw, m0, m1, inst, label, opts: { streaming, expectNoop, capMs }, startFrame });
}

/** Offline: turn the page's lists + the node-side click log into one analysed sample per click. */
export function analysePlan(ctx, { R, steps, sync, ipcRaw, m0, m1, inst, label, opts, startFrame }) {
  const { ids, names, view } = ctx;
  const endObserved = R.ft.length ? R.ft[R.ft.length - 1] : 0;
  const pds = R.ev.filter(e => e[0] === 'pointerdown' && e[3]).map(e => ({ ts: e[2], now: e[1], pill: e[3], used: false }));
  const clicks = R.ev.filter(e => e[0] === 'click');
  const firstClickEst = steps.find(s => s.nodeAt)?.nodeAt;
  const period = estimatePeriod(R.ft.filter(t => firstClickEst === undefined || t < toPageTime(firstClickEst, sync))) ?? estimatePeriod(R.ft) ?? 16.7;
  const samples = [];
  // match each node-side click to its pointerdown in the page, in order
  const matched = steps.map(s => {
    if (!s.nodeAt) return null;
    const est = toPageTime(s.nodeAt, sync);
    const pd = pds.find(p => !p.used && p.ts >= est - 30);
    if (pd) pd.used = true;
    return pd ?? null;
  });
  const t0s = matched.map(m => m?.ts ?? null);
  steps.forEach((s, k) => {
    const base = { seq: label, i: s.i, from: names[s.from] ?? s.from, to: names[s.idx], toIdx: s.idx, fromIdx: s.from, cold: !!s.cold, ackMs: s.ackMs ?? null, plannedAt: s.plannedAt };
    if (s.error) { samples.push({ ...base, ok: false, status: 'no-pill', reason: s.error }); return; }
    const pd = matched[k];
    if (!pd) { samples.push({ ...base, ok: false, status: 'lost-click', reason: 'the page never saw a pointerdown for this click' }); return; }
    if (pd.pill !== ids[s.idx]) { samples.push({ ...base, ok: false, status: 'misclick', reason: `the click landed on another session's pill (${ids.indexOf(pd.pill)}), intended ${s.idx}` }); return; }
    const nextT0 = t0s.slice(k + 1).find(v => v !== null) ?? null;
    const beforeI = (() => { let b = -1; for (let i = 0; i < R.ft.length; i++) { if (R.ft[i] < pd.ts) b = i; else break; } return b < 0 ? s.from : R.fv[b]; })();
    const a = analyseSwitch(R, { t0: pd.ts, target: s.idx, before: beforeI, nextT0, endObserved, expectNoop: opts.expectNoop, streaming: opts.streaming, mode: view, period });
    const clk = clicks.find(c => c[2] >= pd.ts);
    a.pressToClickMs = clk ? r1(clk[2] - pd.ts) : null;
    a.queueDelayMs = r1(pd.now - pd.ts);
    a.t0DispatchPage = r1(toPageTime(s.nodeAt, sync));
    a.t0DeliveryMs = r1(pd.ts - a.t0DispatchPage);
    if (ipcRaw) a.ipc = ipcWindow(ipcRaw, pd.ts, Math.min(nextT0 ?? Infinity, pd.ts + (a.windowMs ?? 1500)));
    samples.push({ ...base, ...a });
  });
  const firstT0 = t0s.find(v => v !== null) ?? null;
  const gapsAll = firstT0 === null ? [] : frameGaps(R.ft, firstT0, endObserved, period);
  const lastOk = [...samples].reverse().find(s => s.ok && s.status === 'ok');
  return {
    label, period: r1(period), samples, instrument: inst, flags: R.flags,
    summary: { ...summariseSwitches(samples), ...splitCold(samples) },
    sequence: {
      framesRecorded: R.ft.length, gapsOver1p5x: gapsAll.length, gapMaxMs: gapsAll.length ? Math.max(...gapsAll.map(g => g.gapMs)) : 0, gapTotalMs: r1(gapsAll.reduce((a, g) => a + g.gapMs, 0)),
      longAnimationFrames: R.loaf.length, longTasks: R.lt.length, longestTaskMs: R.lt.length ? r1(Math.max(...R.lt.map(l => l[1]))) : 0,
      layoutShifts: R.ls.length, ipc: ipcRaw ? ipcWindow(ipcRaw, firstT0 ?? 0, endObserved) : null,
      workPerPane: (() => { const w = {}; for (const [, idx, n] of R.mu) { w[names[idx] ?? idx] = w[names[idx] ?? idx] ?? { callbacks: 0, records: 0 }; w[names[idx] ?? idx].callbacks++; w[names[idx] ?? idx].records += n; } return w; })(),
      framesVisiblePerPane: (() => { const w = {}; R.fv.forEach((v, i) => { if (R.ft[i] >= (firstT0 ?? Infinity)) w[names[v] ?? v] = (w[names[v] ?? v] ?? 0) + 1; }); return w; })(),
      finalSettleMs: lastOk ? lastOk.settleMs : null, finalShowMs: lastOk ? lastOk.showMs : null, metrics: metricsDiff(m0, m1),
    },
    loafTop: R.loaf.filter(l => l[1] >= 50).sort((a, b) => b[1] - a[1]).slice(0, 5).map(l => ({ durationMs: r1(l[1]), blockingMs: r1(l[2]), scripts: l[3] })),
    raw: { t0s, endObserved, t0Frames: R.ft.length },
  };
}

// ── streams and floods for the hidden-work pairs ─────────────────────────────

async function streamInto(ctx, idx, deltas) {
  const { cdp, fake, ids } = ctx;
  fake.plan({ deltas, perSec: 150, seed: `switchpp-${Date.now() % 100000}`, text: null });
  const completion = fake.expectCompletion(), n = fake.requests.length;
  const sent = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(ids[idx])}, 'switch-pingpong fixture')`);
  if (sent?.status !== 'sent') throw Error(`native send refused: ${JSON.stringify(sent)}`);
  for (let i = 0; i < 100 && !fake.requests[n]?.deltasSent; i++) await sleep(50);
  if (!fake.requests[n]?.deltasSent) throw Error('the fake stream never started');
  return { rec: fake.requests[n], completion };
}

async function floodInto(ctx, idx, mb) {
  const { cdp, ids, fixture } = ctx;
  const t0 = Date.now(), marker = `[perf-lab] flood complete: ${mb} MB`;
  await cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(ids[idx])}, ${JSON.stringify(`perf-lab-flood ${mb}\r`)}); true`);
  let done = null;
  for (let i = 0; i < 900 && !done; i++) { done = readEmissions(fixture.home).find(r => r.flood === mb && r.t >= t0 - 500 && r.event === 'done'); if (!done) await sleep(200); }
  if (!done) throw Error(`flood of ${mb} MB never finished in 180 s`);
  return { marker, producerMs: done.t - t0 };
}

const tailHas = (ctx, idx, marker) => ctx.cdp.evaluate(`(window.__terminalRegistry?.getScreenText(${JSON.stringify(ctx.ids[idx])}, 6) ?? '').includes(${JSON.stringify(marker)})`);

/** Wrap a plan in whatever hidden-destination work the pair needs while it runs (an active stream for idle-streaming). */
async function withStream(ctx, seconds, fn) {
  if (ctx.pair !== 'idle-streaming') return fn();
  const s = await streamInto(ctx, ctx.roles.B, Math.ceil((seconds + 6) * 150));
  const started = s.rec.deltasSent > 0;
  try { return { ...(await fn()), stream: { started, perSecWanted: 150 } }; }
  finally { await Promise.race([s.completion, sleep(60000)]).catch(() => {}); }
}

// ── the sequences ────────────────────────────────────────────────────────────

async function seqPlain(ctx, kind, extra = {}) {
  const plan = buildPlan(kind, ctx.roles);
  const dur = plan.at(-1).at / 1000 + 4;
  const streaming = ctx.pair === 'idle-streaming';
  await goTo(ctx, ctx.roles.A, 1200);
  return withStream(ctx, dur + 3, () => runPlan(ctx, plan, { label: kind, streaming, aim: kind === 'b150', ...extra }));
}

async function seqBurst(ctx, reps = 3) {
  const out = { reps: [] };
  for (let r = 0; r < reps; r++) {
    await goTo(ctx, ctx.roles.A, 1500);
    const plan = buildPlan('c', ctx.roles);
    const res = await withStream(ctx, 6, () => runPlan(ctx, plan, { label: `c#${r}`, streaming: ctx.pair === 'idle-streaming', tailMs: 3500, aim: true }));
    const R = res; const steps = R.samples, last = steps.at(-1);
    const finalIdx = plan.at(-1).idx;
    const t0s = R.raw.t0s;
    const firstT0 = t0s[0], lastT0 = t0s.at(-1);
    R.burst = {
      finalPane: ctx.names[finalIdx],
      firstClickToFinalShowMs: last?.showDomMs != null && lastT0 != null && firstT0 != null ? r1(lastT0 - firstT0 + last.showMs) : null,
      lastClickToFinalShowMs: last?.showMs ?? null,
      lastClickToFinalSettleMs: last?.settleMs ?? null,
      clicksLanded: steps.filter(s => s.ok).length, clicksSent: steps.length,
      intermediateFramesVisible: R.sequence.framesVisiblePerPane,
      workPerPane: R.sequence.workPerPane,
    };
    out.reps.push(R);
  }
  return out;
}

async function seqInterrupted(ctx, reps = 8) {
  const out = { reps: [] };
  for (let r = 0; r < reps; r++) {
    await goTo(ctx, ctx.roles.A, 1500);
    const res = await withStream(ctx, 6, () => runPlan(ctx, buildPlan('d', ctx.roles), { label: `d#${r}`, streaming: ctx.pair === 'idle-streaming', tailMs: 3000, aim: true }));
    const [b, c] = res.samples;
    res.interrupted = {
      bShownAtAll: b ? (res.sequence.framesVisiblePerPane[ctx.names[ctx.roles.B]] ?? 0) > 1 : null,
      bWorkCallbacks: res.sequence.workPerPane[ctx.names[ctx.roles.B]]?.callbacks ?? 0,
      cShowMs: c?.showMs ?? null, cSettleMs: c?.settleMs ?? null, cLanded: !!c?.ok,
      cShowFromFirstClickMs: c?.showMs != null && res.raw.t0s[0] != null && res.raw.t0s[1] != null ? r1(res.raw.t0s[1] - res.raw.t0s[0] + c.showMs) : null,
    };
    out.reps.push(res);
  }
  return out;
}

async function seqKeys(ctx, reps = 3) {
  const { cdp, ids, roles, names } = ctx;
  const out = { reps: [], note: 'the app switcher: hold Shift 350 ms (the list opens), Arrow Down repeats, release Shift = switch. It only works when no text box has focus, so the focus is cleared first.' };
  for (let r = 0; r < reps; r++) {
    await goTo(ctx, roles.A, 1500);
    await cdp.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true');
    await cdp.evaluate(`window.__sw.install(${JSON.stringify(cfgOf(ctx))})`);
    await installIpcStallProbe(cdp, { everyMs: 50 });
    const sync = await syncClock(cdp);
    await sleep(600);
    const shiftDownAt = Date.now();
    await key(cdp, 'keyDown', 'Shift', 'ShiftLeft', 16, { modifiers: 8 });
    await sleep(450);
    const rows = await cdp.evaluate(`document.querySelectorAll('[data-session-idx]').length`);
    const holdStart = performance.now();
    let downs = 0;
    while (performance.now() - holdStart < 2000) { await key(cdp, 'keyDown', 'ArrowDown', 'ArrowDown', 40, { modifiers: 8, autoRepeat: downs > 0 }); downs++; await sleep(33); }
    await key(cdp, 'keyUp', 'ArrowDown', 'ArrowDown', 40, { modifiers: 8 });
    await key(cdp, 'keyUp', 'Shift', 'ShiftLeft', 16);
    await sleep(3200);
    const R = await cdp.evaluate('window.__sw.read()');
    const ipcRaw = await cdp.evaluate('({ t0: window.__ipcStall.t0, everyMs: window.__ipcStall.everyMs, samples: window.__ipcStall.samples })').catch(() => null);
    await stopIpcStallProbe(cdp).catch(() => {});
    await cdp.evaluate('window.__sw.stop()').catch(() => {});
    const endObserved = R.ft.at(-1), period = estimatePeriod(R.ft.slice(0, 30)) ?? 16.7;
    const shiftUp = R.ev.find(e => e[0] === 'keyup' && e[4] === 'Shift');
    const arrows = R.ev.filter(e => e[0] === 'keydown' && e[4] === 'ArrowDown');
    const finalIdx = ids.length - 1; // the list clamps at the last session
    const holdFrom = arrows[0]?.[2] ?? 0;
    const a = shiftUp ? analyseSwitch(R, { t0: shiftUp[2], target: finalIdx, before: roles.A, nextT0: null, endObserved, mode: ctx.view, period }) : { ok: false, status: 'no-shift-release', reason: 'the page never saw Shift released' };
    out.reps.push({
      listRowsShownDuringHold: rows, arrowKeysSent: downs, arrowKeysSeen: arrows.length,
      arrowQueueDelayMs: summarise(arrows.map(e => e[1] - e[2])),
      holdFrameGaps: shiftUp ? frameGaps(R.ft, holdFrom, shiftUp[2], period) : [],
      holdLongAnimationFrames: R.loaf.filter(l => l[0] >= holdFrom && (!shiftUp || l[0] <= shiftUp[2])).length,
      holdMs: shiftUp ? r1(shiftUp[2] - holdFrom) : null,
      finalPane: names[finalIdx], finalSwitch: { ...a, cold: !ctx.visited.has(finalIdx) },
      ipc: ipcWindow(ipcRaw, shiftUp ? shiftUp[2] - 2500 : 0, endObserved),
      shiftDownToUpMs: r1(Date.now() - shiftDownAt),
    });
    ctx.visited.add(finalIdx);
  }
  return out;
}

/** Work that landed while the destination was hidden (chat: a streamed reply; terminal: a flood), then arrival. */
async function seqCatchup(ctx, reps) {
  const { roles } = ctx, out = { reps: [] };
  const mb = FLOOD_MB[ctx.pair];
  if (!(ctx.pair === 'idle-caughtup' || mb)) return { status: 'n/a', reason: 'this pair has no hidden-work arrival (catch-up applies to idle-caughtup and the terminal flood pairs)' };
  for (let r = 0; r < reps; r++) {
    await goTo(ctx, roles.A, 1500);
    let prep;
    if (mb) { const f = await floodInto(ctx, roles.B, mb); await sleep(2500); prep = { kind: 'flood', mb, producerMs: f.producerMs, marker: f.marker, markerInBufferBeforeShow: await tailHas(ctx, roles.B, f.marker) }; }
    else { const s = await streamInto(ctx, roles.B, 1500); await Promise.race([s.completion, sleep(40000)]); await sleep(2500); prep = { kind: 'reply', deltas: 1500 }; }
    const stay = mb ? (mb >= 20 ? 24000 : 9000) : 4000;
    // Before leaving B again: is everything that landed while B was hidden on its screen now?
    const beforeStep = async i => { if (i === 1) prep.contentOnScreenWhenLeaving = mb ? await tailHas(ctx, roles.B, prep.marker) : null; };
    const res = await runPlan(ctx, [{ at: 0, idx: roles.B }, { at: stay, idx: roles.A }], { label: `f#${r}`, tailMs: 1500, capMs: mb ? stay - 2000 : 3000, beforeStep });
    res.prep = prep;
    if (res.samples[0]) { res.samples[0].catchup = true; res.samples[0].cold = r === 0; }
    out.reps.push(res);
  }
  return out;
}

async function seqNoop(ctx, n = 6) {
  await goTo(ctx, ctx.roles.A, 1200);
  // click A's own pill, which is already active (the active pill box when A is active)
  const plan = Array.from({ length: n }, (_, i) => ({ at: i * 800, idx: ctx.roles.A }));
  return runPlan(ctx, plan, { label: 'noop', expectNoop: true, tailMs: 1500 });
}

async function seqCtrl(ctx) {
  // The same 10 warm-ish switches twice: plain, then with a known 200 ms main-thread block injected right after each click.
  const plan10 = buildPlan('a', ctx.roles).slice(0, 10);
  await goTo(ctx, ctx.roles.A, 1200);
  const p = await withStream(ctx, 14, () => runPlan(ctx, plan10, { label: 'ctrl-plain10', streaming: ctx.pair === 'idle-streaming', ipc: false }));
  await goTo(ctx, ctx.roles.A, 1200);
  const b = await withStream(ctx, 16, () => runPlan(ctx, plan10, { label: 'ctrl-block200', streaming: ctx.pair === 'idle-streaming', ipc: false, block: 200 }));
  const warm = r => r.samples.filter(s => s.ok && !s.cold);
  const verdictShow = controlVerdict(warm(p).map(s => s.showMs), warm(b).map(s => s.showMs));
  const verdictSettle = ctx.pair === 'idle-streaming' ? null : controlVerdict(warm(p).map(s => s.settleMs), warm(b).map(s => s.settleMs));
  return { plain: p.summary, blocked: b.summary, verdictShow, verdictSettle, blockMs: 200, plainSamples: p.samples, blockedSamples: b.samples };
}

async function seqLate(ctx, n = 10, spacingMs = 3600) {
  const { cdp, boxes, roles } = ctx, rows = [];
  await goTo(ctx, roles.A, 1500);
  await cdp.evaluate(`window.__sw.install(${JSON.stringify(cfgOf(ctx))})`);
  let cur = roles.A;
  const runOne = async () => {
    for (let i = 0; i < n; i++) {
      const target = cur === roles.A ? roles.B : roles.A;
      const box = boxes[cur]?.[target];
      if (!box) { rows.push({ i, error: 'no pill box' }); continue; }
      const tStart = performance.now();
      const m0 = await metrics(cdp);
      await realClick(cdp, box);
      const shownAt = await cdp.evaluate(`window.__sw.waitShown(${target}, 4000)`);
      const m1 = await metrics(cdp);
      const left = tStart + spacingMs - 120 - performance.now();
      if (left > 0) await sleep(left);
      const m2 = await metrics(cdp);
      rows.push({ i, to: ctx.names[target], cold: !ctx.visited.has(target), shown: shownAt !== null, switchWork: metricsDiff(m0, m1), afterArrival: metricsDiff(m1, m2) });
      ctx.visited.add(target);
      cur = target;
      const rest = tStart + spacingMs - performance.now();
      if (rest > 0) await sleep(rest);
    }
  };
  await withStream(ctx, n * spacingMs / 1000 + 4, runOne);
  await cdp.evaluate('window.__sw.stop()').catch(() => {});
  const warm = rows.filter(r => !r.error && !r.cold && r.shown);
  const pick = (k, f) => summarise(warm.map(r => r.afterArrival[k]));
  return { spacingMs, windowMs: spacingMs - 120, rows, afterArrival: { scriptMs: pick('scriptMs'), layoutMs: pick('layoutMs'), styleMs: pick('styleMs'), taskMs: pick('taskMs'), layouts: pick('layouts'), styleRecalcs: pick('styleRecalcs'), busyPct: pick('busyPct') }, switchWork: { scriptMs: summarise(warm.map(r => r.switchWork.scriptMs)), layoutMs: summarise(warm.map(r => r.switchWork.layoutMs)), styleMs: summarise(warm.map(r => r.switchWork.styleMs)), taskMs: summarise(warm.map(r => r.switchWork.taskMs)) } };
}

const OFFSETS = [50, 150, 300, 600];

async function seqProbe(ctx, kind, reps) {
  const { cdp, boxes, roles, ids } = ctx, probes = [];
  await goTo(ctx, roles.A, 1500);
  // where a wheel tick goes: the middle of the visible pane (one layout read, before any timing)
  const mid = await cdp.evaluate(`(() => { const el = ${ctx.view === 'chat' ? `document.querySelector('[data-chat-session-id]:not([aria-hidden])')` : `document.querySelector('.terminal-overlay-scroll:not(.terminal-hidden)')`}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (!mid) throw Error('no visible pane to aim the probe at');
  await cdp.evaluate(`window.__sw.install(${JSON.stringify(cfgOf(ctx))})`);
  const sync = await syncClock(cdp);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let li = 0, cur = roles.A;
  const body = async () => {
    for (const off of OFFSETS) {
      for (let rep = 0; rep < reps; rep++) {
        const box = boxes[cur]?.[roles.B];
        if (!box) { probes.push({ off, rep, error: 'no pill box' }); continue; }
        const ch = letters[li++ % 26];
        let base = null;
        if (kind === 'key' && ctx.view === 'terminal') base = await cdp.evaluate(`window.__sw.setEcho(${roles.B}, ${JSON.stringify(ids[roles.B])}, ${JSON.stringify(ch)})`);
        await cdp.evaluate(`(() => { const el = ${ctx.view === 'chat' ? `[...document.querySelectorAll('.input-bar-container textarea')].find(e => !e.closest('[aria-hidden="true"]'))` : `document.querySelector('.terminal-overlay-scroll:not(.terminal-hidden) textarea')`}; if (el) el.focus(); return !!el; })()`);
        const tStart = performance.now(), nodeAt = Date.now();
        await realClick(cdp, box);
        const wait = tStart + off - performance.now();
        if (wait > 0) await sleep(wait);
        const sentAt = Date.now();
        let naturalTag = null;
        if (kind === 'key') { naturalTag = await cdp.evaluate(`(() => { const t = document.activeElement ? document.activeElement.tagName : ''; const el = ${ctx.view === 'chat' ? `[...document.querySelectorAll('.input-bar-container textarea')].find(e => !e.closest('[aria-hidden="true"]'))` : `document.querySelector('.terminal-overlay-scroll:not(.terminal-hidden) textarea')`}; if (el) el.focus(); return t; })()`); }
        if (kind === 'key') { await key(cdp, 'keyDown', ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0), { text: ch }); await key(cdp, 'keyUp', ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0)); }
        else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -120 });
        await sleep(1000);
        const echo = kind === 'key' && ctx.view === 'terminal' ? await cdp.evaluate('window.__sw.readEcho()') : null;
        probes.push({ off, rep, ch, nodeAt, sentAt, base, naturalTag, echoAt: echo?.t ?? null });
        ctx.visited.add(roles.B);
        // back to A, unmeasured (a real click so focus state matches a person's)
        const back = boxes[roles.B]?.[roles.A];
        if (back) await realClick(cdp, back);
        cur = roles.A;
        await sleep(1100);
      }
    }
  };
  const total = OFFSETS.length * reps * 2.6;
  await withStream(ctx, total + 5, body);
  const R = await cdp.evaluate('window.__sw.read()');
  await cdp.evaluate('window.__sw.stop()').catch(() => {});
  const pds = R.ev.filter(e => e[0] === 'pointerdown' && e[3] === ids[roles.B]);
  const results = probes.map((p, k) => {
    if (p.error) return { ...p, ok: false };
    const est = toPageTime(p.nodeAt, sync), pd = pds.find(e => e[2] >= est - 30);
    if (!pd) return { off: p.off, rep: p.rep, ok: false, reason: 'click not seen' };
    const t0 = pd[2];
    const evType = kind === 'key' ? 'keydown' : 'wheel';
    const input = R.ev.find(e => e[0] === evType && e[2] >= t0 && (kind === 'wheel' || e[4] === p.ch));
    if (!input) return { off: p.off, rep: p.rep, ok: false, lost: true, reason: `the page never saw the ${evType}` };
    const out = { off: p.off, rep: p.rep, ok: true, actualOffsetMs: r1(input[2] - t0), queueDelayMs: r1(input[1] - input[2]), focusedTag: input[5], focusBeforeForcedTag: p.naturalTag };
    if (kind === 'key') {
      if (ctx.view === 'chat') {
        const inp = R.ev.find(e => e[0] === 'input' && e[2] >= input[2] && e[2] <= input[2] + 1500);
        if (!inp) { out.lost = true; out.echoMs = null; out.reason = `the key reached ${input[5] || 'nothing'} but no text was entered`; }
        else { const f = R.ft.find(t => t >= inp[1]); out.echoMs = f === undefined ? null : r1(f - input[2]); }
      } else { out.echoMs = p.echoAt === null ? null : r1(p.echoAt - input[2]); if (out.echoMs === null) { out.lost = true; out.reason = 'the character never appeared in the terminal'; } }
    }
    return out;
  });
  const byOff = {};
  for (const off of OFFSETS) {
    const rs = results.filter(r => r.off === off);
    byOff[off] = { n: rs.length, lost: rs.filter(r => r.lost || !r.ok).length, queueDelayMs: summarise(rs.filter(r => r.ok).map(r => r.queueDelayMs)), echoMs: summarise(rs.map(r => r.echoMs)), actualOffsetMs: summarise(rs.filter(r => r.ok).map(r => r.actualOffsetMs)) };
  }
  return { kind, offsets: OFFSETS, reps, note: kind === 'key' ? 'focus is forced onto the visible composer/terminal just before the key (after the pill click it naturally sits on the pill button: see focusBeforeForcedTag), so the numbers are main-thread availability, not focus behaviour' : undefined, naturalFocusAfterClick: (() => { const c = {}; for (const r of results) if (r.focusBeforeForcedTag !== undefined) c[r.focusBeforeForcedTag] = (c[r.focusBeforeForcedTag] ?? 0) + 1; return c; })(), byOffset: byOff, results, flags: R.flags };
}

async function seqProfile(ctx, worst) {
  const { cdp, boxes } = ctx;
  if (!worst) return { status: 'n/a', reason: 'no usable sample to re-run' };
  const out = { worst, runs: [] };
  const { fromIdx, toIdx } = worst;
  for (let r = 0; r < 3; r++) {
    await goTo(ctx, fromIdx, 1500);
    await cdp.evaluate(`window.__sw.install(${JSON.stringify(cfgOf(ctx))})`);
    const box = boxes[fromIdx]?.[toIdx];
    if (!box) { out.runs.push({ error: 'no pill box' }); break; }
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
    await realClick(cdp, box);
    await sleep(2800);
    const { profile } = await cdp.send('Profiler.stop'); await cdp.send('Profiler.disable');
    await cdp.evaluate('window.__sw.stop()').catch(() => {});
    const file = `${ctx.outBase}.profile${r}.cpuprofile`;
    writeFileSync(file, JSON.stringify(profile));
    const rows = selfTimes(profile), total = rows.reduce((s, x) => s + x.ms, 0);
    const idle = rows.find(x => /\(idle\)/.test(x.name))?.ms ?? 0;
    out.runs.push({ file, sampledMs: Math.round(total), busyMs: Math.round(total - idle), buckets: buckets(rows).slice(0, 8).map(b => ({ name: b.name, ms: Math.round(b.ms) })), top: rows.filter(x => !/\(idle\)/.test(x.name)).slice(0, 14).map(x => ({ ms: Math.round(x.ms), fn: x.name })) });
  }
  out.note = 'sampling slows the page: use the function ranking, not the milliseconds, as the finding';
  return out;
}

// ── configuration runner ─────────────────────────────────────────────────────

function worstSample(results) {
  let best = null;
  for (const [seq, r] of Object.entries(results)) {
    const lists = r?.samples ? [r.samples] : r?.reps ? r.reps.map(x => x.samples).filter(Boolean) : [];
    for (const list of lists) for (const s of list ?? []) {
      if (!s.ok || s.status !== 'ok') continue;
      const score = Math.max(s.settleMs ?? 0, s.showMs ?? 0);
      if (!best || score > best.score) best = { score, seq, fromIdx: s.fromIdx, toIdx: s.toIdx, from: s.from, to: s.to, showMs: s.showMs, settleMs: s.settleMs, cold: s.cold };
    }
  }
  return best;
}

export async function runConfig(opts, stamp, pair, count, outFile) {
  const bound = bounded(opts.maxMinutes);
  const spec = worldSpec(pair, count), view = spec.view;
  const report = { status: 'incomplete', pair, sessions: count, view, build: { sha: stamp.sha, dirty: stamp.dirty, builtAt: stamp.builtAt, appDir: stamp.appDir }, loadAvgStart: readFileSync('/proc/loadavg', 'utf8').trim(), options: { only: opts.only, probeReps: opts.probeReps }, sequences: {}, errors: {}, warnings: [] };
  report.unusable = Number(report.loadAvgStart.split(' ')[0]) > 8;
  const outBase = outFile.replace(/\.json$/, '');
  let fixtureRoot, fake, x, app, ctx;
  try {
    refusePackageProcesses(stamp.appDir);
    fixtureRoot = mkdtempSync(join(ROOT, 'scratch/perf-lab/switch-fixture-'));
    const fixture = buildFixture(fixtureRoot, { fakeProvider: true, log: () => {} });
    const extras = writeExtraTranscripts(fixture, count);
    fake = await bound(startFakeProvider({ port: fixture.fakeProvider.port }), 'fake provider');
    x = await bound(startXvfb(':99'), 'Xvfb');
    app = await bound(launchApp({ binary: join(stamp.appDir, 'youcoded'), appDir: stamp.appDir, fixture, display: x.display, cdpPort: CDP_PORT, refuseExisting: true }), 'launch', 90000);
    const cdp = app.cdp;
    report.gpu = await bound(readRendererInfo(app.cdpPort, cdp), 'GPU info');
    await bound(cdp.send('Performance.enable'), 'metrics domain');
    await cdp.evaluate(`(${pageRecorder})()`);
    ctx = { cdp, fixture, fake, spec, extras, pair, view: 'chat', roles: spec.roles, names: spec.list.map(s => s.name), visited: new Set(), outBase, ids: [], ptyIdx: [], boxes: {} };
    const { ids, warnings } = await bound(openWorld(ctx), 'sessions', 240000);
    ctx.ids = ids; report.warnings.push(...warnings);
    ctx.ptyIdx = spec.list.map((s, i) => (s.kind === 'cc' ? i : -1)).filter(i => i >= 0);
    await installVis(ctx);
    if (view === 'terminal') await terminalSetup(ctx, bound);
    report.terminalRenderer = view === 'terminal' ? await cdp.evaluate(`document.querySelector('.terminal-overlay-scroll .xterm-screen canvas') ? 'webgl' : (document.querySelector('.terminal-overlay-scroll .xterm-rows') ? 'dom' : 'unknown')`) : null;
    report.userAgent = await cdp.evaluate('navigator.userAgent');
    report.refreshHz = await cdp.evaluate(`new Promise(r => { const a = []; const f = t => { a.push(t); a.length < 40 ? requestAnimationFrame(f) : r(1000 / ((a.at(-1) - a[0]) / (a.length - 1))); }; requestAnimationFrame(f); })`).then(n => Math.round(n * 10) / 10);
    // pair-specific state, before any sequence
    await goTo(ctx, ctx.roles.A, 1500);
    if (pair === 'idle-caughtup') { const s = await streamInto(ctx, ctx.roles.B, 1500); await Promise.race([s.completion, sleep(40000)]); await sleep(2000); report.preState = 'a full streamed reply (1500 deltas) landed in the hidden destination before the first switch'; }
    if (FLOOD_MB[pair]) { const f = await floodInto(ctx, ctx.roles.B, FLOOD_MB[pair]); await sleep(3000); report.preState = `the hidden destination terminal produced ${FLOOD_MB[pair]} MB (producer took ${f.producerMs} ms) before the first switch`; }
    ctx.boxes = await bound(measureBoxes(ctx, [ctx.roles.A, ctx.roles.B, ctx.roles.C, ctx.roles.D]), 'pill boxes');
    ctx.visited.clear(); // so the first TIMED visit to each session is flagged cold (it has been shown once during setup, so it is not a first-ever render)
    report.pillBoxes = Object.fromEntries(Object.entries(ctx.boxes).map(([k, v]) => [ctx.names[k], Object.fromEntries(Object.entries(v).map(([i, b]) => [ctx.names[i], `${b.x},${b.y} w${b.w}`]))]));
    for (const seq of ALL_SEQS) {
      if (!opts.only.includes(seq)) continue;
      const t = Date.now();
      try {
        let res;
        if (['a', 'b400', 'b250', 'b150'].includes(seq)) res = await bound(seqPlain(ctx, seq), seq, 180000);
        else if (seq === 'c') res = await bound(seqBurst(ctx), seq, 180000);
        else if (seq === 'd') res = await bound(seqInterrupted(ctx), seq, 180000);
        else if (seq === 'e') res = await bound(seqKeys(ctx), seq, 120000);
        else if (seq === 'f') res = await bound(seqCatchup(ctx, FLOOD_MB[pair] === 20 ? 3 : 4), seq, 420000);
        else if (seq === 'ctrl') res = await bound(seqCtrl(ctx), seq, 180000);
        else if (seq === 'noop') res = await bound(seqNoop(ctx), seq, 60000);
        else if (seq === 'late') res = await bound(seqLate(ctx), seq, 180000);
        else if (seq === 'probe') res = { key: await bound(seqProbe(ctx, 'key', opts.probeReps), 'probe-key', 240000), wheel: view === 'chat' ? await bound(seqProbe(ctx, 'wheel', opts.probeReps), 'probe-wheel', 240000) : { status: 'n/a', reason: 'terminal wheel scrolls the xterm scrollback, not measured here' } };
        else if (seq === 'profile') res = await bound(seqProfile(ctx, worstSample(report.sequences)), seq, 120000);
        res.loadAvg = readFileSync('/proc/loadavg', 'utf8').trim(); res.wallMs = Date.now() - t;
        report.sequences[seq] = res;
      } catch (e) { report.errors[seq] = String(e?.message ?? e); }
      writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
    }
    report.worst = worstSample(report.sequences);
    report.status = Object.keys(report.errors).length ? 'incomplete' : 'measured';
  } catch (e) { report.error = String(e?.message ?? e); }
  finally {
    report.loadAvgEnd = readFileSync('/proc/loadavg', 'utf8').trim();
    try { for (const id of [...(ctx?.ids ?? [])].reverse()) await ctx.cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`).catch(() => {}); } catch { /* app gone */ }
    if (app) await Promise.race([app.kill(), sleep(8000)]).catch(e => { report.cleanupError = e.message; });
    if (x?.proc) x.proc.kill('SIGTERM');
    if (fake) await Promise.race([fake.close(), sleep(3000)]).catch(() => {});
    if (fixtureRoot) { try { rmSync(fixtureRoot, { recursive: true, force: true }); } catch (e) { report.cleanupError = e.message; } }
    writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

/** Terminal view for the four roles: switch to each, Ctrl+`, and fill its terminal with glyphs (what a used terminal holds). */
async function terminalSetup(ctx, bound) {
  const { cdp, ids } = ctx;
  for (const idx of [0, 1, 2, 3]) {
    ctx.view = 'chat'; await installVis(ctx);
    await goTo(ctx, idx, 600);
    const ev = { modifiers: 2, key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192 };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
    ctx.view = 'terminal'; await installVis(ctx);
    for (let i = 0; i < 100; i++) { if ((await cdp.evaluate('window.__swVis()')) === idx) break; await sleep(100); }
    const sentinel = '[perf-lab] glyph fill complete: 2000 lines';
    await cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(ids[idx])}, 'perf-lab-glyphs 2000\\r'); true`);
    await bound((async () => { for (let i = 0; i < 300; i++) { if (await cdp.evaluate(`(window.__terminalRegistry?.getScreenText(${JSON.stringify(ids[idx])}, 8) ?? '').includes(${JSON.stringify(sentinel)})`)) return; await sleep(200); } throw Error(`terminal ${idx} never showed the glyph sentinel`); })(), `glyph fill ${idx}`, 70000);
  }
}

// ── rig etiquette: one run at a time, quiet machine ──────────────────────────

/** Other perf-lab node runs (not us, not our ancestors). */
export function otherRigRuns(selfPids = selfChain()) {
  const out = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const pid = Number(d);
    if (selfPids.has(pid)) continue;
    const cmd = readCmdline(pid);
    if (/^(timeout \d+ )?(\S*\/)?node\s/.test(cmd) && /scripts\/perf-lab\/[\w-]+\.mjs/.test(cmd) && !/--test/.test(cmd) && !/switch-analysis\.test|\.test\.mjs/.test(cmd)) out.push({ pid, cmd: cmd.slice(0, 200) });
  }
  return out;
}

async function waitForQuiet(maxMs = 30 * 60000) {
  const t0 = Date.now();
  for (;;) {
    const busy = otherRigRuns(), load = Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
    if (!busy.length && load < 8) return { waitedMs: Date.now() - t0 };
    if (Date.now() - t0 > maxMs) return { waitedMs: Date.now() - t0, gaveUp: true, busy: busy.map(b => b.pid), load };
    console.log(`[wait] ${busy.length ? `another rig run (${busy.map(b => b.pid).join(',')})` : `load ${load}`} — ${Math.round((Date.now() - t0) / 1000)} s`);
    await sleep(60000);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  if (!assetsReady()) throw Error('perf-lab assets not cached');
  const appDir = opts.appDir ?? join(opts.checkout, 'desktop', 'release', 'linux-unpacked');
  const stamp = await loadPackageStamp({ checkout: opts.checkout ?? resolve(appDir, '..', '..', '..'), appDir });
  console.log(`build ${stamp.sha}${stamp.dirty ? ' (dirty)' : ''} ${appDir}`);
  mkdirSync(opts.out, { recursive: true });
  const reports = [];
  for (const count of opts.sessions) for (const pair of opts.pairs) {
    const file = join(opts.out, `${pair}-s${count}${opts.tag ? '-' + opts.tag : ''}.json`);
    const w = await waitForQuiet();
    console.log(`[run] ${pair} x${count} (waited ${Math.round(w.waitedMs / 1000)} s${w.gaveUp ? ', GAVE UP waiting' : ''}) -> ${file}`);
    const rep = await runConfig(opts, stamp, pair, count, file);
    rep.waited = w;
    writeFileSync(file, JSON.stringify(rep, null, 2) + '\n');
    console.log(`[done] ${pair} x${count}: ${rep.status}${rep.unusable ? ' UNUSABLE (load > 8 at start)' : ''}${rep.error ? ' ' + rep.error : ''}${Object.keys(rep.errors).length ? ' errors: ' + JSON.stringify(rep.errors) : ''}`);
    reports.push(rep);
  }
  if (reports.some(r => r.status !== 'measured')) process.exitCode = 2;
  return reports;
}
void existsSync; void statSync; void execFileSync; void percentile; void needsRepeat;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 2; });
