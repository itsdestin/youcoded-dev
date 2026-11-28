#!/usr/bin/env node
// scripts/perf-lab/lane-run.mjs — the DESKTOP-SIDE half of the realistic performance lane (remote.mjs drives it over SSH).
//
// Runs four scenarios (type, menus, switch, idle) against TWO builds of the app, alternating baseline/candidate, each leg a
// fresh launch of one build on a generated chat history, 16 Claude Code chats (the fake `claude`), and the heavy glass +
// particle theme. Spec: docs/active/specs/2026-11-28-remote-realistic-perf-lab-lane.md (realistic perf lane).
//
//   node lane-run.mjs --out <dir> --display :0 --baseline <checkout> --candidate <checkout>
//        [--scenarios type,menus,switch,idle] [--repeats 3] [--idle-minutes 10] [--sessions 16] [--streaming 4]
//        [--history-projects 136 --history-sessions 1800 --history-mb 870] [--theme-source <dir>] [--cdp-port 9593]
//        [--allow-software-gl]   (smoke only: accepts a software renderer; the leg is marked "smoke", never "ok")
//
// SAFETY (same model as real-scale-startup.mjs / launch.mjs, which this reuses):
// - Every leg runs with its own HOME, its own userData (<home>/.config/youcoded) and its own ports; the history is generated
//   (history-gen.mjs), never copied from anyone. Nothing here reads or writes ~/.youcoded, ~/.claude or ~/.config/youcoded.
// - launchApp refuses a fixture home that is the real home and only ever signals processes matching this run's own paths.
// - It REFUSES to start if any YouCoded process that is not one of this run's own is running (the installed app uses the same
//   screen and the same process name). It never signals such a process.
// - No network of its own: analytics off, no sync configured, remote-access server off, automatic update install off, the
//   only "model" is fake-claude.cjs. (The app may still make its own read-only update/registry checks; see the README.)
import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture } from './fixture.mjs';
import { launchApp } from './launch.mjs';
import { connect } from './cdp.mjs';
import { waitForSessionReady } from './scenario-workload.mjs';
import { readRendererInfo } from './gpu.mjs';
import { installTheme, parseCell } from './gpu-cost.mjs';
import { cpuSnapshot, cpuPercent } from './procs.mjs';
import { eventRecorder } from './realism-page.mjs';
import { analyseRun } from './realism.mjs';
import { humanAimMs, humanGapMs, humanHoldMs, humanPlan, rng } from './realism-stats.mjs';
import { installIpcStallProbe, readIpcStallProbe } from './probe-ipc.mjs';
import { filesFor, readLines } from './hitch-report.mjs';
import { realisticTurn } from './content.mjs';
import { generateHistory, pickLaneSessions, writeFixtureSettings, DEFAULTS as HISTORY_DEFAULTS } from './history-gen.mjs';
import { lanePage } from './lane-page.mjs';
import { legMetrics, summariseFrames } from './lane-measure.mjs';
import { compareLegs, render } from './lane-report.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error('[lane]', ...a);
export const ALL_SCENARIOS = Object.freeze(['type', 'menus', 'switch', 'idle']);

// The owner's glass + particle look, exactly as realism.mjs writes it for `--theme heavy` (settings only, no conversation data).
// Copied rather than imported because realism.mjs holds it inline inside runBoot; keep the two in step.
export const HEAVY_APPEARANCE = Object.freeze({
  theme: 'devils-garden', hideCodeAndConfigs: false, showDeletedArtifacts: false, contextDisplay: 'percent', reducedEffects: false, showTimestamps: true,
  lookOverrides: { chromeStyle: 'floating', glass: 'custom', bubbleStyle: 'default', roundness: 0.5, glassCustom: { 'panels-blur': 16, 'panels-opacity': 0.68, 'bubble-blur': 10, 'bubble-opacity': 0.68, 'terminal-opacity': 0.6, 'terminal-blur': 8, 'terminal-brightness': 0.86 } },
  pagesSeeThrough: true,
});

export function parseOptions(argv) {
  const o = { out: null, display: ':0', baseline: null, candidate: null, scenarios: [...ALL_SCENARIOS], repeats: 3, idleMinutes: 10, sessions: 16, streaming: 4, historyProjects: HISTORY_DEFAULTS.projects, historySessions: HISTORY_DEFAULTS.sessions, historyMB: HISTORY_DEFAULTS.targetMB, themeSource: null, cdpPort: 9593, allowSoftwareGL: false, keep: false, baselineLabel: 'baseline', candidateLabel: 'candidate', machine: null };
  const names = { '--out': 'out', '--display': 'display', '--baseline': 'baseline', '--candidate': 'candidate', '--scenarios': 'scenarios', '--repeats': 'repeats', '--idle-minutes': 'idleMinutes', '--sessions': 'sessions', '--streaming': 'streaming', '--history-projects': 'historyProjects', '--history-sessions': 'historySessions', '--history-mb': 'historyMB', '--theme-source': 'themeSource', '--cdp-port': 'cdpPort', '--baseline-label': 'baselineLabel', '--candidate-label': 'candidateLabel', '--machine': 'machine' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--allow-software-gl') { o.allowSoftwareGL = true; continue; }
    if (k === '--keep') { o.keep = true; continue; }
    const key = names[k];
    if (!key || argv[i + 1] === undefined) throw new Error(`lane-run: unknown or incomplete option ${k}`);
    o[key] = argv[++i];
  }
  for (const k of ['repeats', 'idleMinutes', 'sessions', 'streaming', 'historyProjects', 'historySessions', 'historyMB', 'cdpPort']) {
    o[k] = Number(o[k]);
    if (!(o[k] > 0)) throw new Error(`lane-run: --${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a positive number`);
  }
  if (typeof o.scenarios === 'string') o.scenarios = o.scenarios === 'all' ? [...ALL_SCENARIOS] : o.scenarios.split(',').filter(Boolean);
  for (const s of o.scenarios) if (!ALL_SCENARIOS.includes(s)) throw new Error(`lane-run: unknown scenario "${s}" (want ${ALL_SCENARIOS.join(', ')})`);
  if (!o.out || !o.baseline || !o.candidate) throw new Error('lane-run: --out, --baseline and --candidate are required');
  if (o.streaming > o.sessions) throw new Error('lane-run: --streaming cannot exceed --sessions');
  if (o.sessions < 2) throw new Error('lane-run: need at least 2 sessions');
  return o;
}

/** The legs, in the order they run: for each repeat and scenario, baseline THEN candidate, so drift never favours one side. */
export function legSchedule({ scenarios, repeats }) {
  const legs = [];
  for (let repeat = 1; repeat <= repeats; repeat++) for (const scenario of scenarios) for (const side of ['baseline', 'candidate']) legs.push({ scenario, side, repeat });
  return legs;
}

/**
 * YouCoded processes that are NOT this run's own. `ownRoot` is this run's folder; a process whose executable lives under it is ours.
 * Reads /proc (injectable for tests). Returns [{pid, exe}]. Never signals anything.
 */
export function foreignYouCodedProcesses(ownRoot, { procDir = '/proc', readdir = readdirSync, readFile = (p) => readFileSync(p, 'utf8'), readlink = readlinkSync } = {}) {
  const found = [];
  for (const name of readdir(procDir)) {
    if (!/^\d+$/.test(name)) continue;
    let comm = '', exe = '';
    try { comm = readFile(join(procDir, name, 'comm')).trim(); } catch { continue; }
    if (comm !== 'youcoded') continue;
    try { exe = readlink(join(procDir, name, 'exe')); } catch { exe = '(unreadable)'; }
    if (exe.startsWith(resolve(ownRoot) + sep)) continue;
    found.push({ pid: Number(name), exe });
  }
  return found;
}

// ── a person at the keyboard: seeded gaps, real key events ───────────────────

const KEY_CODES = { ' ': ['Space', 32], '.': ['Period', 190], ',': ['Comma', 188], '?': ['Slash', 191], "'": ['Quote', 222] };
const keyEvent = (cdp, type, ch) => {
  const [code, vk] = KEY_CODES[ch] ?? [`Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0)];
  return cdp.send('Input.dispatchKeyEvent', { type, key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(type === 'keyDown' ? { text: ch } : {}) });
};
const mouse = (cdp, type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
const press = async (cdp, box, r) => { await mouse(cdp, 'mouseMoved', box.x, box.y); await sleep(humanAimMs(r)); await mouse(cdp, 'mousePressed', box.x, box.y); await sleep(humanHoldMs(r)); await mouse(cdp, 'mouseReleased', box.x, box.y); };
const escape = (cdp) => cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }).then(() => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }));

export const TYPING_TEXT = 'the quick brown fox keeps typing while other chats are busy answering, and a person does not slow down for them. ';

/** Seeded key gaps: log-normal around 140 ms (a steady typist), with an occasional longer think. Pure. */
export function typingGaps(count, seed = 'lane-typing') {
  const r = rng(seed);
  return Array.from({ length: count }, () => (r() < 0.06 ? Math.round(400 + r() * 700) : Math.round(Math.min(320, Math.max(70, 140 * Math.exp(0.35 * (r() + r() + r() - 1.5)))))));
}

// ── streaming chats: append realistic turns into some chats' transcript files ──

function startStreamers(fixture, picks, seed) {
  let stopped = false;
  const done = picks.map(async (p, k) => {
    const r = rng(`${seed}:stream:${k}`);
    let parent = null;
    for (let turn = 0; !stopped; turn++) {
      const t = realisticTurn({ index: 1_000_000 + turn, seed: `${seed}:stream:${p.id}`, cwd: p.cwd, sessionId: p.id, parentUuid: parent, startedAt: Date.now() });
      parent = t.lastUuid;
      for (const line of t.lines) {
        if (stopped) return;
        await appendFile(p.path, `${line}\n`);
        await sleep(Math.round(250 + r() * 450));
      }
      await sleep(Math.round(300 + r() * 900));
    }
  });
  return { async stop() { stopped = true; await Promise.allSettled(done); } };
}

// ── measuring window: recorder + IPC probe + trace + CPU ─────────────────────

async function startTrace(app) {
  const v = await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
  const browser = await connect(v.webSocketDebuggerUrl);
  const trace = { events: [], truncated: false, complete: false };
  let finish;
  const done = new Promise((ok) => { finish = ok; });
  browser.on('Tracing.dataCollected', (p) => { for (const e of p.value ?? []) { if (trace.events.length < 150_000) trace.events.push(e); else trace.truncated = true; } });
  browser.on('Tracing.tracingComplete', (p) => { trace.complete = !p?.stream && p?.dataLossOccurred === false; finish(); });
  await browser.send('Tracing.start', { categories: 'devtools.timeline,blink,cc,viz,gpu,disabled-by-default-devtools.timeline.frame', options: 'record-as-much-as-possible', transferMode: 'ReportEvents' });
  return { async stop() { try { await browser.send('Tracing.end'); await Promise.race([done, sleep(10_000)]); } finally { browser.close(); } return trace; } };
}

async function startWindow(ctx, { traceFromStart = true } = {}) {
  const { cdp, ids, app } = ctx;
  await cdp.evaluate(`window.__rl.install(${JSON.stringify({ ids })})`);
  await installIpcStallProbe(cdp, { everyMs: 100 });
  const pids = app.family();
  const cpu0 = cpuSnapshot(pids), t0 = process.hrtime.bigint();
  const startEpoch = Date.now();
  let tracer = traceFromStart ? await startTrace(app).catch((e) => { ctx.notes.push(`trace not started: ${e.message}`); return null; }) : null;
  return {
    startTrace: async () => { tracer = await startTrace(app).catch((e) => { ctx.notes.push(`trace not started: ${e.message}`); return null; }); },
    async stop() {
      const endEpoch = Date.now();
      const R = await cdp.evaluate('window.__rl.read()');
      const ipc = await readIpcStallProbe(cdp).catch(() => null);
      const trace = tracer ? await tracer.stop() : null;
      const cpuP = cpuPercent(cpu0, cpuSnapshot(app.family()), Number(process.hrtime.bigint() - t0) / 1e9);
      await cdp.evaluate('window.__rl.stop && window.__rl.stop(); true').catch(() => {});
      // The app's own freeze rows for this leg's window (engine stalls, same detector as the in-app recorder).
      let stallRows = null;
      try { stallRows = readLines(filesFor(ctx.fixture.userData), 0).rows.filter((r) => r.t >= startEpoch && r.t <= endEpoch + 2000); } catch { ctx.notes.push('hitch recorder file not found: engine stalls not measured on this build'); }
      return { startEpoch, endEpoch, R, ipc, frames: trace && trace.events.length ? summariseFrames(trace.events) : null, traceInfo: trace ? { events: trace.events.length, complete: trace.complete, truncated: trace.truncated } : null, cpuPct: cpuP.totalPct, stallRows, loaf: R?.loaf ?? null, ev: R?.ev ?? null };
    },
  };
}

// ── session opening ──────────────────────────────────────────────────────────

async function openSessions(ctx, picks, { fresh }) {
  const { cdp } = ctx;
  const made = [];
  const list = [...picks.map((p) => ({ name: `chat-${p.id.slice(0, 4)}`, cwd: p.cwd, resume: p.id }))];
  if (fresh) list.push({ name: 'fresh', cwd: picks[0].cwd, resume: undefined });
  for (const s of list) {
    const r = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify({ name: s.name, cwd: s.cwd, skipPermissions: true, resumeSessionId: s.resume })}); return { id: s.id }; } catch (e) { return { error: String(e && e.message || e) }; } })()`);
    if (r.error) throw new Error(`session.create(${s.name}): ${r.error}`);
    await waitForSessionReady(cdp, { clearMs: 120_000 });
    made.push(r.id);
  }
  ctx.ids = made;
  await sleep(2000);
}

const visibleId = async (ctx) => ctx.cdp.evaluate(`(() => { const ids = ${JSON.stringify(ctx.ids)}; for (const id of ids) { const el = document.querySelector('[data-chat-session-id="' + id + '"]'); if (el && !el.hasAttribute('aria-hidden')) return id; } return null; })()`);
async function pressPill(ctx, id, r) {
  const box = await ctx.cdp.evaluate(`window.__rl.aim(${JSON.stringify(id)})`);
  if (!box) return false;
  await press(ctx.cdp, box, r);
  return true;
}

// ── scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = {
  // Fresh chat focused, human-paced key presses while `streaming` other chats print replies.
  async type(ctx) {
    const r = rng(`${ctx.seed}:type`);
    const fresh = ctx.ids.at(-1);
    for (let i = 0; i < 3 && (await visibleId(ctx)) !== fresh; i++) { await pressPill(ctx, fresh, r); await sleep(900); }
    if ((await visibleId(ctx)) !== fresh) throw new Error('the fresh chat never became the visible one');
    const stream = startStreamers(ctx.fixture, ctx.picks.slice(0, ctx.opts.streaming), ctx.seed);
    await sleep(4000); // let the streams get going before the first key
    const w = await startWindow(ctx);
    const composer = await ctx.cdp.evaluate('window.__rl.composer()');
    if (!composer) throw new Error('could not find the message box');
    await press(ctx.cdp, composer, r);
    const text = TYPING_TEXT.repeat(3);
    const gaps = typingGaps(text.length, `${ctx.seed}:gaps`);
    for (let i = 0; i < text.length; i++) { await keyEvent(ctx.cdp, 'keyDown', text[i]); await keyEvent(ctx.cdp, 'keyUp', text[i]); await sleep(gaps[i]); }
    await sleep(1200);
    // Erase what was typed so no leg leaves a draft behind.
    await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    const m = await w.stop();
    await stream.stop();
    return { ...m, typed: text.length };
  },

  // Each menu opened and closed `opensPerMenu` times; the first open is kept apart from the repeats.
  async menus(ctx) {
    const r = rng(`${ctx.seed}:menus`);
    const OPENS = ctx.opts.opensPerMenu ?? 10;
    await ctx.cdp.evaluate(`(${lanePage})()`);
    const w = await startWindow(ctx);
    const menus = {};
    const windows = [];
    const openClose = async (name) => {
      const opens = [];
      for (let i = 0; i < OPENS; i++) {
        const box = await ctx.cdp.evaluate(`window.__lane.box(${JSON.stringify(name)})`);
        if (!box) return { error: `the "${name}" menu button was not found on this build`, opens };
        const from = await ctx.cdp.evaluate('window.__lane.now()');
        await press(ctx.cdp, box, r);
        const ms = await ctx.cdp.evaluate(`window.__lane.opened(${JSON.stringify(name)})`);
        const to = await ctx.cdp.evaluate('window.__lane.now()');
        windows.push({ menu: name, open: i + 1, from, to });
        if (ms === null) return { error: `the "${name}" menu never opened`, opens };
        opens.push(ms);
        await sleep(350);
        await escape(ctx.cdp);
        if (!(await ctx.cdp.evaluate(`window.__lane.closed(${JSON.stringify(name)})`))) { await escape(ctx.cdp); await sleep(300); }
        await sleep(450);
      }
      return { opens };
    };
    menus.session = await openClose('session');
    menus.model = await openClose('model');
    menus.main = await openClose('main');
    // The folder picker sits inside the session menu: open that (untimed), find the picker's button, time the picker.
    const sBox = await ctx.cdp.evaluate('window.__lane.box("session")');
    if (!sBox) menus.folder = { error: 'the session menu button was not found, so the folder picker was unreachable', opens: [] };
    else {
      await press(ctx.cdp, sBox, r);
      if (!(await ctx.cdp.evaluate('window.__lane.opened("session")'))) menus.folder = { error: 'the session menu never opened', opens: [] };
      else if (!(await ctx.cdp.evaluate('window.__lane.probeFolder()'))) menus.folder = { error: 'the folder picker button was not found inside the session menu', opens: [] };
      else {
        // The pause lets the probe's own open/close settle before timing starts.
        await sleep(500);
        // folder trigger lookup is "visible folderTrigger while the session menu is open".
        menus.folder = await openClose('folder');
      }
      await escape(ctx.cdp); await sleep(400);
    }
    const m = await w.stop();
    // Longest frame inside each timed open (page clock), so a slow open can be matched to the code behind it.
    for (const win of windows) win.loafMaxMs = Math.max(0, ...(m.R?.loaf ?? []).filter((l) => l[0] >= win.from && l[0] <= win.to).map((l) => l[1]));
    return { ...m, menus, openWindows: windows };
  },

  // Clicks through the session strip at human pace; four destinations are mid-answer.
  async switch(ctx) {
    const r = rng(`${ctx.seed}:switch`);
    await ctx.cdp.evaluate(`(${lanePage})()`);
    const stream = startStreamers(ctx.fixture, ctx.picks.slice(0, ctx.opts.streaming), ctx.seed);
    await sleep(4000);
    const w = await startWindow(ctx);
    const cur = Math.max(0, ctx.ids.indexOf(await visibleId(ctx)));
    const { plan } = humanPlan({ seed: `${ctx.seed}:switchplan`, seconds: ctx.opts.switchSeconds ?? 60, count: ctx.ids.length, start: cur, wheelShare: 0, typeShare: 0, kbdShare: 0 });
    const t = performance.now();
    const steps = [], settleMs = [];
    for (const a of plan) {
      const wait = t + a.at - performance.now();
      if (wait > 0) await sleep(wait);
      const at0 = performance.now() - t;
      const id = ctx.ids[a.idx];
      const box = await ctx.cdp.evaluate(`window.__rl.aim(${JSON.stringify(id)})`);
      if (!box) { steps.push({ kind: 'click', idx: a.idx, error: 'no pill box', at: at0 }); continue; }
      await mouse(ctx.cdp, 'mouseMoved', box.x, box.y); await sleep(humanAimMs(r));
      await mouse(ctx.cdp, 'mousePressed', box.x, box.y);
      steps.push({ kind: 'click', idx: a.idx, at: at0, nodeEpoch: Date.now() });
      const ms = await ctx.cdp.evaluate(`window.__lane.visibleAfter(${JSON.stringify(id)})`);
      if (ms !== null) settleMs.push(ms);
      await sleep(humanHoldMs(r));
      await mouse(ctx.cdp, 'mouseReleased', box.x, box.y);
    }
    await sleep(1200);
    const m = await w.stop();
    await stream.stop();
    const secs = Math.max(1, (plan.at(-1)?.at ?? 0) / 1000 + 1.2);
    const a = analyseRun(m.R, steps, ctx.ids, secs);
    return { ...m, switch: { settleMs, wrong: a.identity.wrong, blank: a.identity.blank, clicks: steps.filter((s) => !s.error).length, missed: steps.filter((s) => s.error).length } };
  },

  // Nothing touched: engine stalls and their rhythm over `idleMinutes`; the frame trace covers only the last minute.
  async idle(ctx) {
    const total = ctx.opts.idleMinutes * 60_000;
    const traceMs = Math.min(60_000, total);
    const w = await startWindow(ctx, { traceFromStart: false });
    const t0 = Date.now();
    let traced = false;
    while (Date.now() - t0 < total) {
      if (!traced && total - (Date.now() - t0) <= traceMs) { await w.startTrace(); traced = true; }
      await sleep(Math.min(5000, Math.max(100, total - (Date.now() - t0))));
      if ((Date.now() - t0) % 60_000 < 5000) log(`idle ${Math.round((Date.now() - t0) / 60_000)} / ${ctx.opts.idleMinutes} min`);
    }
    return { ...(await w.stop()), idleMs: total };
  },
};

// ── one leg ──────────────────────────────────────────────────────────────────

/**
 * Is the app really drawing on a graphics card? gpu-cost-parse's rendererVerdict also demands a Radeon (the laptop); this lane
 * runs on an NVIDIA desktop, so the same checks apply minus the vendor test. Pure.
 */
export function gpuVerdict(r) {
  if (!r) return { ok: false, reason: 'renderer record missing' };
  if (r.softwareRendering === null || r.softwareRendering === undefined) return { ok: false, reason: `renderer unknown (${r.error ?? 'no glRenderer'})` };
  if (r.softwareRendering) return { ok: false, reason: `software renderer: ${r.glRenderer}` };
  for (const f of ['gpu_compositing', 'rasterization']) if (r.featureStatus?.[f] && !String(r.featureStatus[f]).startsWith('enabled')) return { ok: false, reason: `GPU ${f.replace('_', ' ')} not enabled (${r.featureStatus[f]})` };
  return { ok: true, reason: null };
}

export function approvedStub() {
  // fixture.mjs only checks that its `checkout` argument is the workspace's own youcoded folder (it is not read: seedEngine is
  // false); on the desktop that is an empty placeholder next to scripts/, created here when missing.
  const stub = join(ROOT, 'youcoded');
  if (!existsSync(stub)) mkdirSync(stub, { recursive: true });
  return stub;
}

async function runLeg(leg, opts, shared) {
  const t0 = Date.now();
  const res = { ...leg, status: 'failed', reason: null, metrics: {}, notes: [] };
  const build = leg.side === 'baseline' ? opts.baseline : opts.candidate;
  const binary = join(build, 'desktop', 'release', 'linux-unpacked', 'youcoded');
  const appDir = join(build, 'desktop', 'release', 'linux-unpacked');
  let app, fixture, stub;
  try {
    stub = approvedStub();
    if (!existsSync(binary)) throw new Error(`no built app at ${binary}`);
    fixture = buildFixture(shared.legRoot, { checkout: stub, seedEngine: false, historySizes: {}, decoyCount: 0 });
    // Overlay the generated history at the SAME path it was generated at (the files name their folders inside).
    execFileSync('cp', ['-a', '--reflink=auto', `${shared.pristine}/.`, `${fixture.home}/`]);
    const settings = writeFixtureSettings(fixture.home);
    installTheme(fixture, parseCell('devils-garden'), opts.themeSource);
    writeFileSync(join(fixture.home, '.claude/youcoded-appearance.json'), JSON.stringify(HEAVY_APPEARANCE));
    Object.assign(process.env, settings.env); // launchConfiguration inherits process.env
    app = await launchApp({ binary, appDir, fixture, cdpPort: opts.cdpPort, display: opts.display, refuseExisting: true, protocolDebug: false });
    const cdp = app.cdp;
    // The window is the whole output, as a person uses it (browser-level endpoint: Browser.* is not available on a page connection).
    try {
      const v = await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/version`)).json();
      const br = await connect(v.webSocketDebuggerUrl);
      const tg = (await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/list`)).json()).find((t) => t.type === 'page' && !t.url.includes('mode='));
      const { windowId } = await br.send('Browser.getWindowForTarget', { targetId: tg.id });
      await br.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
      br.close();
    } catch (e) { res.notes.push(`window size failed: ${e.message}`); }
    await sleep(1500);
    const renderer = await readRendererInfo(app.cdpPort, cdp);
    const verdict = gpuVerdict(renderer);
    res.renderer = { glRenderer: renderer?.glRenderer ?? null, ok: verdict.ok, reason: verdict.reason ?? null };
    if (!verdict.ok && !opts.allowSoftwareGL) { res.status = 'invalid'; res.reason = `not on the graphics card: ${verdict.reason}`; return res; }
    await cdp.send('Performance.enable').catch(() => {});
    await cdp.evaluate(`(${eventRecorder})()`);
    const picks = shared.picks.slice(0, scenarioSessionCount(leg.scenario, opts));
    const ctx = { cdp, app, fixture, opts, ids: [], picks: shared.picks, seed: `${shared.seed}:${leg.scenario}:${leg.side}:${leg.repeat}`, notes: res.notes };
    await openSessions(ctx, picks, { fresh: leg.scenario === 'type' });
    res.theme = await cdp.evaluate(`({ theme: document.documentElement.dataset.theme, reduced: document.documentElement.hasAttribute('data-reduced-effects'), wallpaper: document.documentElement.hasAttribute('data-wallpaper'), canvases: [...document.querySelectorAll('canvas')].filter(c => c.width > 200).length })`);
    if (res.theme.theme !== 'devils-garden' || res.theme.reduced) { res.status = 'invalid'; res.reason = `the heavy theme was not active (${JSON.stringify(res.theme)})`; return res; }
    res.sessionsOpen = ctx.ids.length;
    const raw = await SCENARIOS[leg.scenario](ctx);
    res.metrics = legMetrics(leg.scenario, raw);
    res.detail = { traceInfo: raw.traceInfo, typed: raw.typed, menus: raw.menus, openWindows: raw.openWindows, switch: raw.switch, idleMs: raw.idleMs, stallRows: raw.stallRows?.length ?? null, loafWorst: (raw.loaf ?? []).slice().sort((a, b) => b[1] - a[1]).slice(0, 5) };
    res.status = verdict.ok ? 'ok' : 'smoke';
  } catch (e) {
    res.reason = String(e?.message ?? e);
  } finally {
    try { await app?.kill(); } catch (e) { res.notes.push(`app teardown: ${e.message}`); res.status = 'failed'; res.reason ??= `teardown: ${e.message}`; }
    // The leg's home holds a full generated history: remove it now, never leave 870 MB per leg behind.
    if (!opts.keep && fixture) { try { rmSync(fixture.home, { recursive: true, force: true }); } catch { /* removed by the final sweep */ } }
  }
  res.wallMs = Date.now() - t0;
  return res;
}

const scenarioSessionCount = (scenario, opts) => (scenario === 'type' ? opts.sessions - 1 : opts.sessions);

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  mkdirSync(opts.out, { recursive: true });
  opts.themeSource ??= join(ROOT, 'wecoded-themes', 'themes');
  // Refuse BEFORE anything is built or launched: another YouCoded owns this screen.
  const others = foreignYouCodedProcesses(dirname(opts.out));
  if (others.length) throw new Error(`refusing to run: another YouCoded is running (${others.map((p) => `${p.pid} ${p.exe}`).join('; ')}). It shares this screen; close it yourself, this tool never touches it.`);
  const legRoot = join(opts.out, 'leg');
  const pristine = join(opts.out, 'history-pristine');
  mkdirSync(legRoot, { recursive: true });
  // Generate the history ONCE, at the path every leg's home will have, then park it: each leg restores from the parked copy.
  const stub = approvedStub();
  const seedFixture = buildFixture(legRoot, { checkout: stub, seedEngine: false, historySizes: {}, decoyCount: 0 });
  const manifest = generateHistory(seedFixture.home, { projects: opts.historyProjects, sessions: opts.historySessions, targetMB: opts.historyMB }, { log });
  rmSync(pristine, { recursive: true, force: true });
  renameSync(seedFixture.home, pristine);
  const picks = pickLaneSessions(manifest, opts.sessions);
  const shared = { legRoot, pristine, picks, seed: 'lane-v1' };
  const results = { meta: { baseline: opts.baselineLabel, candidate: opts.candidateLabel, machine: opts.machine ?? 'this computer', repeats: opts.repeats, scenarios: opts.scenarios, history: `${manifest.totals.projects} project folders, ${manifest.totals.files} session files, ${Math.round(manifest.totals.bytes / 1048576)} MB (generated)`, sessions: opts.sessions, streaming: opts.streaming, idleMinutes: opts.idleMinutes, startedAt: new Date().toISOString() }, legs: [] };
  const save = () => writeFileSync(join(opts.out, 'lane-results.json'), `${JSON.stringify(results, null, 2)}\n`);
  for (const leg of legSchedule(opts)) {
    log(`leg: ${leg.scenario} / ${leg.side} / repeat ${leg.repeat}`);
    const r = await runLeg(leg, opts, shared);
    log(`  -> ${r.status}${r.reason ? `: ${r.reason}` : ''}`);
    results.legs.push(r);
    save();
  }
  results.meta.finishedAt = new Date().toISOString();
  save();
  const cmp = compareLegs(results);
  writeFileSync(join(opts.out, 'lane-report.txt'), render(cmp));
  writeFileSync(join(opts.out, 'lane-report.json'), `${JSON.stringify(cmp, null, 2)}\n`);
  if (!opts.keep) { rmSync(pristine, { recursive: true, force: true }); rmSync(legRoot, { recursive: true, force: true }); }
  if (results.legs.some((l) => l.status !== 'ok')) process.exitCode = 3;
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 2; });
}
