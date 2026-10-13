#!/usr/bin/env node
// scripts/perf-lab/realism.mjs — session flipping measured as close to "a person using the real app" as this machine allows,
// with every realism factor switchable so the gap between the lab and the owner's recorded hitches can be explained by ABLATION.
//
// ONE COMMAND (the "real-use" preset): node scripts/perf-lab/realism.mjs --preset real-use --checkout <dir with desktop/release/linux-unpacked>
//
// Factors (each a flag; see realism-stats.mjs PRESETS):
//   --build packaged|dev        packaged = what ships; dev = Vite + React dev mode, launched privately on the lab's display
//   --history fixture|real      real = reflink COPIES of some of the owner's real transcripts (sizes only are ever read), picked by size
//   --theme stock|heavy         heavy = the owner's glass + particle theme with wallpaper (devils-garden) and his look overrides
//   --display xvfb|gpu          gpu = the private invisible KWin on the real Radeon, 2560x1600 logical-scale 1.5 at ~180 Hz (refused if software GL)
//   --sessions N                2..20 Claude Code sessions (the fake `claude` binary; the on-screen history is the real/fixture transcript)
//   --busy on|off               a background CPU + browser-like GPU load; measured as its own run inside the same boot
// Runs inside ONE boot (so fresh vs warm vs busy are same-app comparisons): fresh (right after boot, nothing visited), then a census +
// warm-up (every session shown, the biggest scrolled to the top and back), warm, busy (if --busy on), then controls (200 ms block, no-op).
//
// SAFETY: see real-scale-startup.mjs. The real history is only ever COPIED with `cp --reflink=always` into a scratch fixture HOME under
// scratch/perf-lab/realism-fixture-*; originals are never opened for writing; this file reads only sizes and mtimes of the originals and
// counts of DOM elements in the copies — never conversation text. The copies are deleted at the end of every boot.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture, ccProjectSlug, stableUuid, transcriptBody, CONTENT_SEED } from './fixture.mjs';
import { startXvfb, launchApp, launchConfiguration, selfChain } from './launch.mjs';
import { connect, waitFor } from './cdp.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { waitForSessionReady } from './scenario-workload.mjs';
import { readRendererInfo } from './gpu.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { bounded } from './suspects.mjs';
import { findFamily, cpuSnapshot, cpuPercent } from './procs.mjs';
import { otherRigRuns } from './switch-pingpong.mjs';
import {
  findAmdgpu, readClients, readGpuSysfs, startVirtualCompositor, installTheme, parseCell, sanitizeProcessEnv, assertPortsFree, DEFAULT_THEME_SOURCE,
} from './gpu-cost.mjs';
import { engineDelta, rendererVerdict } from './gpu-cost-parse.mjs';
import { eventRecorder } from './realism-page.mjs';
import { startBusyDesktop } from './realism-load.mjs';
import { cpus } from 'node:os';
import {
  calibrate, dist, humanAimMs, humanHoldMs, humanPlan, mb, pickBySize, resolveFactors, rng, shuffled, splitEvent, summariseEvents, targetFromHitches, SLOW_MS,
} from './realism-stats.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const REAL_HOME = resolve(process.env.HOME || homedir());
const WORK = join(ROOT, 'scratch', 'perf-lab', 'realism');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const CDP_PORT = 9593;
const HIS_FILE = '/home/destin/.config/youcoded-perfzero/perf';

// ── options ──────────────────────────────────────────────────────────────────

export function parseOptions(argv) {
  const o = { preset: 'real-use', checkout: null, appDir: null, devSource: null, out: join(WORK, 'out'), seqs: 'fresh,warm,busy,ctrl,noop', seconds: 75, tag: '', boots: 1, soakMinutes: 10, maxMinutes: 30, seed: 'real-use', waitMinutes: 40, aim: 'fresh', sha: null, devRef: null, pick: 'ladder', deep: 'off' };
  const over = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!k?.startsWith('--') || v === undefined) throw Error(`Invalid option ${k}`);
    const key = k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['build', 'history', 'theme', 'display', 'sessions', 'busy'].includes(key)) over[key] = v; else if (key in o) o[key] = v; else throw Error(`Unknown option ${k}`);
  }
  o.factors = resolveFactors(o.preset, over);
  for (const k of ['seconds', 'boots', 'maxMinutes', 'waitMinutes', 'soakMinutes']) o[k] = Number(o[k]);
  o.seqs = String(o.seqs).split(',').filter(Boolean);
  for (const s of o.seqs) if (!['fresh', 'warm', 'soak', 'busy', 'ctrl', 'noop'].includes(s)) throw Error(`--seqs takes fresh,warm,soak,busy,ctrl,noop (got ${s})`);
  if (o.factors.busy === 'off' && !o.seqs.includes('keepbusy')) o.seqs = o.seqs.filter(s => s !== 'busy');
  if (!['fresh', 'cached'].includes(o.aim)) throw Error('--aim takes fresh|cached');
  if (!['ladder', 'newest', 'biggest'].includes(o.pick)) throw Error('--pick takes ladder|newest|biggest');
  if (!['on', 'off'].includes(o.deep)) throw Error('--deep takes on|off');
  for (const k of ['checkout', 'appDir', 'devSource', 'out']) if (o[k] && !isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  if (!o.checkout && !o.appDir) o.checkout = join(ROOT, 'youcoded');
  return o;
}

// ── the app: packaged copy or private dev build ──────────────────────────────

/** A reflink COPY of the packaged build under scratch (never launched in place: the frozen checkout stays untouched) + a stamp. */
export function preparePackaged(checkout, appDirOpt, shaOpt = null) {
  const src = appDirOpt ?? join(checkout, 'desktop', 'release', 'linux-unpacked');
  if (!existsSync(join(src, 'youcoded'))) throw Error(`no packaged app at ${src}`);
  const sha = shaOpt ?? execFileSync('git', ['-C', checkout ?? dirname(dirname(dirname(src))), 'rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8' }).trim();
  const dest = join(WORK, 'apps', `packaged-${sha}`);
  if (!existsSync(join(dest, 'youcoded'))) {
    mkdirSync(dirname(dest), { recursive: true });
    execFileSync('cp', ['-a', '--reflink=always', src, dest]);
  }
  const built = statSync(join(src, 'youcoded')).mtime.toISOString();
  return { kind: 'packaged', sha, appDir: dest, binary: join(dest, 'youcoded'), builtAt: built };
}

/** A private Vite DEV tree of the same commit: `git archive` of desktop/ + reflink copies of node_modules and the built main-process JS. */
export function prepareDev(checkout, ref = null) {
  const sha = execFileSync('git', ['-C', checkout, 'rev-parse', '--short=9', ref ?? 'HEAD'], { encoding: 'utf8' }).trim();
  const dest = join(WORK, 'apps', `dev-${sha}`);
  const desk = join(dest, 'desktop');
  if (!existsSync(join(desk, 'package.json'))) {
    mkdirSync(dest, { recursive: true });
    execFileSync('bash', ['-c', `git -C ${JSON.stringify(checkout)} archive ${ref ?? 'HEAD'} desktop | tar -x -C ${JSON.stringify(dest)}`]);
    // COW copies: later writes (Vite's cache) never reach the source checkout's files.
    execFileSync('cp', ['-a', '--reflink=always', join(checkout, 'desktop', 'node_modules'), join(desk, 'node_modules')]);
    rmSync(join(desk, 'node_modules', '.vite'), { recursive: true, force: true });
    if (ref) {
      // A specific commit has no matching built main-process JS in the checkout: compile it here (what `npm run dev:main` does, minus the network fetch).
      const run = (cmd, args) => execFileSync(cmd, args, { cwd: desk, stdio: 'ignore', timeout: 600000 });
      run(process.execPath, ['scripts/generate-preload-channels.mjs']);
      run(join(desk, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json']);
      cpSync(join(desk, 'src/main/pty-worker.js'), join(desk, 'dist/main/pty-worker.js'));
    } else execFileSync('cp', ['-a', '--reflink=always', join(checkout, 'desktop', 'dist'), join(desk, 'dist')]);
  }
  // WHY pre-warm (as scripts/run-dev.js does): a cold Vite cache optimises dependencies on the first page load and RELOADS the page mid-boot,
  // which destroyed the measuring connection ("Execution context was destroyed") in the first dev trial.
  if (!existsSync(join(desk, 'node_modules', '.vite'))) execFileSync(join(desk, 'node_modules', '.bin', 'vite'), ['optimize'], { cwd: desk, stdio: 'ignore', timeout: 300000 });
  return { kind: 'dev', sha, appDir: dest, desktop: desk };
}

/** Launch the dev tree: Vite on 5173+100, then Electron against it. Same fixture env as the packaged launcher. Returns an app-like handle. */
async function launchDev({ dev, fixture, display, waylandSocket, cdpPort }) {
  const { env, args } = launchConfiguration({ fixture, display, waylandSocket, protocolDebug: false });
  mkdirSync(join(fixture.home, '.runtime'), { recursive: true, mode: 0o700 });
  const vitePort = 5173 + 100;
  await assertPortsFree([vitePort]);
  const logDir = fixture.home;
  const vite = spawn(join(dev.desktop, 'node_modules', '.bin', 'vite'), [], { cwd: dev.desktop, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://localhost:${vitePort}/`); if (r.ok) break; } catch { /* not yet */ } await sleep(500); }
  const proc = spawn(join(dev.desktop, 'node_modules', 'electron', 'dist', 'electron'), ['.', `--remote-debugging-port=${cdpPort}`, '--no-sandbox', ...args], { cwd: dev.desktop, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let target;
  for (let i = 0; i < 240 && !target; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); target = l.find(t => t.type === 'page' && t.url.startsWith(`http://localhost:${vitePort}`) && !t.url.includes('mode=')); } catch { /* not yet */ }
    if (!target) await sleep(500);
  }
  void logDir;
  const killAll = async () => { for (const p of [proc, vite]) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } await sleep(2500); for (const p of [proc, vite]) { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } } };
  if (!target) { await killAll(); throw Error('dev app: no window within 120 s'); }
  let cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  // Wait until the page is loaded and the preload bridge exists, and has stayed so for 4 s (a dev server may still reload once).
  let okSince = 0;
  for (let i = 0; i < 120 && Date.now() - okSince < 4000; i++) {
    try { const ready = await cdp.evaluate('document.readyState === "complete" && !!window.claude && !!document.querySelector("#root, body")'); if (ready) { okSince = okSince || Date.now(); } else okSince = 0; }
    catch { okSince = 0; try { cdp.close(); } catch { /* gone */ } await sleep(1000); const l = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); const t = l.find(x => x.type === 'page' && x.url.startsWith(`http://localhost:${vitePort}`)); if (t) { cdp = await connect(t.webSocketDebuggerUrl); await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); } }
    await sleep(500);
  }
  return { cdp, cdpPort, pid: proc.pid, family: () => findFamily([dev.appDir]), kill: async () => { try { cdp.close(); } catch { /* gone */ } await killAll(); } };
}

// ── history: sizes only from the originals; reflink copies into the fixture ─

export function listRealTranscripts() {
  const base = join(REAL_HOME, '.claude', 'projects');
  const out = [];
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(base, d.name))) {
      if (!f.endsWith('.jsonl')) continue;
      const p = join(base, d.name, f), s = statSync(p);
      out.push({ path: p, id: f.slice(0, -6), size: s.size, mtimeMs: s.mtimeMs });
    }
  }
  return out;
}

function installRealHistory(fixture, count, mode = 'ladder') {
  const slugDir = join(fixture.home, '.claude', 'projects', ccProjectSlug(fixture.projects.alpha));
  if (resolve(fixture.home) === REAL_HOME) throw Error('refusing: fixture home is the real home');
  rmSync(join(fixture.home, '.claude', 'projects'), { recursive: true, force: true });
  mkdirSync(slugDir, { recursive: true });
  const all = listRealTranscripts();
  const picks = shuffled(pickBySize(all, count, { mode }), 'strip-order').map(i => all[i]);
  return picks.map((t, k) => {
    // COPY (copy-on-write) — the original is never opened for writing; its text is never read here.
    execFileSync('cp', ['--reflink=always', t.path, join(slugDir, `${t.id}.jsonl`)]);
    return { name: `real${k + 1}`, source: 'real', resume: t.id, cwd: fixture.projects.alpha, sizeMB: mb(t.size), ageDays: r1((Date.now() - t.mtimeMs) / 86400e3) };
  });
}

function installFixtureHistory(fixture, count) {
  const slug = ccProjectSlug(fixture.projects.alpha), dir = join(fixture.home, '.claude', 'projects', slug);
  const base = [['small', fixture.transcripts.small], ['huge', fixture.transcripts.huge], ['medium', fixture.transcripts.medium]];
  const list = base.map(([name, t]) => ({ name, source: 'fixture', resume: t.sessionId, cwd: t.cwd, sizeMB: mb(statSync(t.path).size), turns: t.turns }));
  const extra = (key, turns) => {
    const sessionId = stableUuid(`${CONTENT_SEED}:realism:${key}`);
    const path = join(dir, `${sessionId}.jsonl`);
    writeFileSync(path, transcriptBody({ content: 'realistic', sessionId, cwd: fixture.projects.alpha, turns, startedAt: Date.now() - 2 * 86400000, seed: `${CONTENT_SEED}:realism:${key}` }).join('\n') + '\n');
    return { name: key, source: 'fixture', resume: sessionId, cwd: fixture.projects.alpha, sizeMB: mb(statSync(path).size), turns };
  };
  if (count > 3) list.push(extra('huge2', 3500));
  for (let k = 0; list.length < count; k++) list.push(extra(`x${k}`, 50));
  return list.slice(0, count);
}

// ── input ────────────────────────────────────────────────────────────────────

const mouse = (cdp, type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, ...extra });
const key = (cdp, type, k, code, vk, extra = {}) => cdp.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...extra });

async function goTo(ctx, idx, settleMs = 900) {
  const { cdp, ids } = ctx;
  await cdp.evaluate(`(() => { const s = document.querySelector('[data-session-strip]') || document.querySelector('.session-strip'); const el = s && s.querySelector('[data-session-id="${ids[idx]}"]'); if (el) { el.click(); return true; } return false; })()`);
  for (let i = 0; i < 150; i++) {
    const v = await visibleIdx(ctx);
    if (v === idx) { await sleep(settleMs); return true; }
    await sleep(100);
  }
  throw Error(`goTo(${idx}) never became visible`);
}
const visibleIdx = async ctx => ctx.cdp.evaluate(`(() => { const ids = ${JSON.stringify(ctx.ids)}; for (let i = 0; i < ids.length; i++) { const el = document.querySelector('[data-chat-session-id="' + ids[i] + '"]'); if (el && !el.hasAttribute('aria-hidden')) return i; } return -1; })()`);

/** Execute a plan with real CDP input; returns the node-side step log. */
async function execPlan(ctx, plan, { block = 0, aimMode = 'fresh', r }) {
  const { cdp, ids } = ctx;
  const steps = [], t = performance.now();
  for (const a of plan) {
    const wait = t + a.at - performance.now();
    if (wait > 0) await sleep(wait);
    const at0 = performance.now() - t;
    if (a.kind === 'click') {
      const box = await cdp.evaluate(`window.__rl.aim(${JSON.stringify(ids[a.idx])})`);
      if (!box) { steps.push({ kind: 'click', idx: a.idx, error: 'no pill box', at: at0 }); continue; }
      await mouse(cdp, 'mouseMoved', box.x, box.y);          // the pointer arrives over the pill (hover styles, pointerover) ...
      await sleep(humanAimMs(r));                              // ... a moment of aiming ...
      const p0 = performance.now();
      await mouse(cdp, 'mousePressed', box.x, box.y);
      const ack = performance.now() - p0;
      steps.push({ kind: 'click', idx: a.idx, at: at0, ackMs: r1(ack), nodeEpoch: Date.now() });
      await sleep(humanHoldMs(r));                              // ... a person holds the button ~100 ms
      await mouse(cdp, 'mouseReleased', box.x, box.y);
    } else if (a.kind === 'wheel') {
      const mid = await cdp.evaluate('window.__rl.paneMid()');
      if (mid) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: a.dy });
      steps.push({ kind: 'wheel', at: at0 });
    } else if (a.kind === 'type') {
      const c = await cdp.evaluate('window.__rl.composer()');
      if (c) {
        await mouse(cdp, 'mousePressed', c.x, c.y); await sleep(60); await mouse(cdp, 'mouseReleased', c.x, c.y);
        for (const ch of a.text) { await key(cdp, 'keyDown', ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0), { text: ch }); await key(cdp, 'keyUp', ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0)); await sleep(70); }
        for (let i = 0; i < a.text.length; i++) { await key(cdp, 'keyDown', 'Backspace', 'Backspace', 8); await key(cdp, 'keyUp', 'Backspace', 'Backspace', 8); await sleep(50); }
        await cdp.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true');
      }
      steps.push({ kind: 'type', at: at0 });
    } else if (a.kind === 'kbd') {
      await cdp.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true');
      await key(cdp, 'keyDown', 'Shift', 'ShiftLeft', 16, { modifiers: 8 });
      await sleep(450);
      await key(cdp, 'keyDown', 'ArrowDown', 'ArrowDown', 40, { modifiers: 8 }); await key(cdp, 'keyUp', 'ArrowDown', 'ArrowDown', 40, { modifiers: 8 });
      await sleep(80);
      await key(cdp, 'keyUp', 'Shift', 'ShiftLeft', 16);
      steps.push({ kind: 'kbd', at: at0 });
    }
  }
  return steps;
}

// ── measuring one run ────────────────────────────────────────────────────────

/** Per-process CPU (and GPU engine time when the real GPU is in use) over a window. */
function startSampler(ctx) {
  const pids = ctx.app.family();
  const cpu0 = cpuSnapshot(pids), t0 = process.hrtime.bigint();
  const cl0 = ctx.gpuInfo ? readClients(pids, ctx.gpuInfo.pdev) : null;
  const sys0 = ctx.gpuInfo ? readGpuSysfs(ctx.gpuInfo) : null;
  return () => {
    const pids1 = ctx.app.family(), wallNs = Number(process.hrtime.bigint() - t0);
    const cpuP = cpuPercent(cpu0, cpuSnapshot(pids1), wallNs / 1e9);
    const out = { cpuPctTotal: r1(cpuP.totalPct) };
    if (cl0) { const cl1 = readClients(pids1, ctx.gpuInfo.pdev); out.appGpuGfxPct = r1(engineDelta(cl0, cl1, wallNs, 'gfx').pct); const s1 = readGpuSysfs(ctx.gpuInfo); out.sclkMHz = r1(s1.sclkMHz); out.systemGpuBusyPct = s1.busy; }
    return out;
  };
}

export function analyseRun(R, steps, ids, seconds) {
  const ev = R.ev.map(splitEvent).filter(e => ['pointerdown', 'pointerup', 'click'].includes(e.name));
  const minutes = seconds / 60;
  const sum = summariseEvents(ev, { minutes });
  const kinds = {}; for (const row of R.ev) { kinds[row[0]] = (kinds[row[0]] ?? 0) + 1; }
  // identity: a press on pill P must show P's pane 450 ms later — judged only when the next press is >= 500 ms away
  const downs = R.cap.filter(c => c[0] === 'pointerdown' && c[2]).map(c => c[1]);
  let judged = 0, wrong = 0, blank = 0;
  const wrongList = [];
  for (const [when, pid, vis] of R.pane) {
    const next = downs.find(t => t > when);
    if (next !== undefined && next - when < 500) continue;
    judged++;
    if (!vis) { blank++; wrongList.push({ pid: ids.indexOf(pid), shown: 'none' }); } else if (vis !== pid) { wrong++; wrongList.push({ pid: ids.indexOf(pid), shown: ids.indexOf(vis) }); }
  }
  const clicks = steps.filter(s => s.kind === 'click');
  const loafs = R.loaf.map(l => ({ dur: l[1], block: l[2], render: l[3] ? l[1] - (l[3] - l[0]) : null }));
  return {
    seconds, clicksPlanned: clicks.length, clicksMissed: clicks.filter(c => c.error).length,
    pressesSeen: downs.length, eventTimingRows: R.ev.length, eventKinds: kinds, flags: R.flags,
    events: sum, all: { ...sum.all, slowPerActiveMin: sum.all.slowPerMin },
    loaf: { n: R.loaf.length, durMax: loafs.length ? r1(Math.max(...loafs.map(l => l.dur))) : 0, dur: dist(loafs.map(l => l.dur)), blockingMax: loafs.length ? r1(Math.max(...loafs.map(l => l.block))) : 0, over100: loafs.filter(l => l.dur >= 100).length,
      worst: [...R.loaf].sort((a, b) => b[1] - a[1]).slice(0, 4).map(l => ({ dur: r1(l[1]), block: r1(l[2]), styleLayoutAfterRenderStart: l[3] ? r1(l[0] + l[1] - l[3]) : null, scripts: l[5] })) },
    longTasks: { n: R.lt.length, max: R.lt.length ? r1(Math.max(...R.lt.map(l => l[1]))) : 0 },
    identity: { judged, wrong, blank, examples: wrongList.slice(0, 5) },
  };
}

async function flipRun(ctx, label, { seconds, seed, block = 0, planOverride = null }) {
  const { cdp, ids } = ctx;
  const cur = await visibleIdx(ctx);
  const { plan } = planOverride ? { plan: planOverride } : humanPlan({ seed: `${seed}:${label}`, seconds, count: ids.length, start: Math.max(0, cur) });
  await cdp.evaluate(`window.__rl.install(${JSON.stringify({ ids })})`);
  await sleep(500);
  if (block) await cdp.evaluate(`window.__rl.armBlock(${block})`);
  const stop = startSampler(ctx);
  const r = rng(`${seed}:${label}:input`);
  const steps = await execPlan(ctx, plan, { block, r, aimMode: ctx.opts.aim });
  await sleep(1200);                                   // let the last frame present and the 450 ms pane check run
  const res = stop();
  const R = await cdp.evaluate('window.__rl.read()');
  await cdp.evaluate('window.__rl.stop && window.__rl.stop(); window.__rl.disarmBlock && window.__rl.disarmBlock(); true').catch(() => {});
  const secs = Math.max(1, (plan.at(-1)?.at ?? 0) / 1000 + 1.2);
  const out = analyseRun(R, steps, ids, secs);
  out.docElements = await cdp.evaluate('document.getElementsByTagName("*").length').catch(() => null);
  out.label = label; out.resources = res; out.loadAvg = readFileSync('/proc/loadavg', 'utf8').trim();
  return out;
}

// WHY deep: a person who has scrolled back through a conversation has made the app draw the older pages too. Scroll each chat to its top
// until no older entries appear (bounded), then back to the newest. Setup only, never timed.
async function deepScroll(ctx, i) {
  const { cdp } = ctx;
  let last = -1, stable = 0;
  for (let r = 0; r < 40 && stable < 3; r++) {
    const n = await cdp.evaluate(`(() => { const root = document.querySelector('[data-chat-session-id="${ctx.ids[i]}"]'); const sc = root && (root.querySelector('[data-chat-scroll], .overflow-y-auto') || root); if (sc) sc.scrollTop = 0; return root ? root.querySelectorAll('.timeline-entry').length : -1; })()`);
    await sleep(600);
    if (n === last) stable++; else { stable = 0; last = n; }
  }
  await cdp.evaluate(`(() => { const root = document.querySelector('[data-chat-session-id="${ctx.ids[i]}"]'); const sc = root && (root.querySelector('[data-chat-scroll], .overflow-y-auto') || root); if (sc) sc.scrollTop = sc.scrollHeight; return true; })()`);
  await sleep(500);
  return last;
}

async function warmUp(ctx) {
  const { cdp } = ctx;
  for (let i = 0; i < ctx.ids.length; i++) {
    await goTo(ctx, i, 700);
    const mid = await cdp.evaluate('(window.__rl.install({ids: ' + JSON.stringify(ctx.ids) + '}), window.__rl.paneMid())');
    if (mid) { for (let k = 0; k < 10; k++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -600 }); await sleep(40); } await sleep(400); for (let k = 0; k < 10; k++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: 600 }); await sleep(40); } await sleep(300); }
    await cdp.evaluate('window.__rl.stop && window.__rl.stop()').catch(() => {});
  }
  if (ctx.opts.deep === 'on') { ctx.deepEntries = []; for (let i = 0; i < ctx.ids.length; i++) { await goTo(ctx, i, 700); ctx.deepEntries.push(await deepScroll(ctx, i)); } }
  await goTo(ctx, 0, 1500);
}

async function censusAll(ctx) {
  const out = [];
  for (let i = 0; i < ctx.ids.length; i++) { await goTo(ctx, i, 900); out.push(await ctx.cdp.evaluate(`window.__rl.census(${JSON.stringify(ctx.ids[i])})`)); }
  return out;
}

// ── one boot ─────────────────────────────────────────────────────────────────

function waitForQuiet(maxMs) {
  return (async () => {
    const t0 = Date.now();
    for (;;) {
      const busy = otherRigRuns(), load = Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
      if (!busy.length && load < 8) return { waitedMs: Date.now() - t0 };
      if (Date.now() - t0 > maxMs) return { waitedMs: Date.now() - t0, gaveUp: true, load, busy: busy.map(b => b.pid) };
      console.log(`[wait] ${busy.length ? `another rig run (${busy.map(b => b.pid).join(',')})` : `load ${load}`} - ${Math.round((Date.now() - t0) / 1000)} s`);
      await sleep(60000);
    }
  })();
}

export async function runBoot(opts, bootNo, outFile) {
  const f = opts.factors, bound = bounded(opts.maxMinutes);
  const report = { status: 'incomplete', pick: opts.pick, deep: opts.deep, factors: f, preset: opts.preset, boot: bootNo, tag: opts.tag, startedAt: new Date().toISOString(), loadAvgStart: readFileSync('/proc/loadavg', 'utf8').trim(), sessions: [], runs: {}, controls: {}, errors: {}, notes: [] };
  report.unusable = Number(report.loadAvgStart.split(' ')[0]) > 8;
  let root, fake, xvfb, comp, app, busy, ctx;
  try {
    const built = f.build === 'dev' ? prepareDev(opts.checkout, opts.devRef) : preparePackaged(opts.checkout, opts.appDir, opts.sha);
    report.build = { kind: built.kind, sha: built.sha, builtAt: built.builtAt ?? null };
    if (f.build === 'packaged') refusePackageProcesses(built.appDir);
    root = mkdtempSync(join(WORK, 'realism-fixture-')); // under scratch/ (gitignored); deleted in finally
    const fixture = buildFixture(root, { fakeProvider: true, log: () => {} });
    // theme
    const cell = parseCell(f.theme === 'heavy' ? 'devils-garden' : 'midnight');
    installTheme(fixture, cell, DEFAULT_THEME_SOURCE);
    if (f.theme === 'heavy') {
      // his glass look overrides, exactly as his appearance file holds them (settings only, no conversation data)
      writeFileSync(join(fixture.home, '.claude/youcoded-appearance.json'), JSON.stringify({ theme: 'devils-garden', hideCodeAndConfigs: false, showDeletedArtifacts: false, contextDisplay: 'percent', reducedEffects: false, showTimestamps: true,
        lookOverrides: { chromeStyle: 'floating', glass: 'custom', bubbleStyle: 'default', roundness: 0.5, glassCustom: { 'panels-blur': 16, 'panels-opacity': 0.68, 'bubble-blur': 10, 'bubble-opacity': 0.68, 'terminal-opacity': 0.6, 'terminal-blur': 8, 'terminal-brightness': 0.86 } }, pagesSeeThrough: true }));
    }
    const world = f.history === 'real' ? installRealHistory(fixture, f.sessions, opts.pick) : installFixtureHistory(fixture, f.sessions);
    fake = await bound(startFakeProvider({ port: fixture.fakeProvider.port }), 'fake provider');
    // display
    let launchOpts = {}, busyDisplay;
    if (f.display === 'gpu') {
      sanitizeProcessEnv(); await assertPortsFree([10000, 10020]);
      comp = await bound(startVirtualCompositor({ scale: 1.5, hz: 180 }), 'virtual compositor', 40000);
      report.compositor = { pid: comp.pid, ...comp.info, modeError: comp.modeError ?? null };
      launchOpts = { waylandSocket: comp.socketPath };
      busyDisplay = { kind: 'wayland', socketName: 'perf-0', runtimeDir: comp.rt };
      ctxGpu = findAmdgpu();
    } else { xvfb = await bound(startXvfb(':99'), 'Xvfb'); launchOpts = { display: xvfb.display }; busyDisplay = { kind: 'x11', display: xvfb.display }; }
    if (f.build === 'packaged') {
      app = await bound(launchApp({ binary: built.binary, appDir: built.appDir, fixture, cdpPort: CDP_PORT, refuseExisting: true, protocolLog: comp ? join(root, 'wayland.log') : undefined, protocolDebug: false, ...launchOpts }), 'launch', 90000);
    } else app = await bound(launchDev({ dev: built, fixture, cdpPort: CDP_PORT, display: launchOpts.display, waylandSocket: launchOpts.waylandSocket }), 'dev launch', 150000);
    const cdp = app.cdp;
    // The window is the whole output, as a person uses it. WHY the browser-level endpoint: Browser.* is not available on a page connection
    // (it worked on the packaged app's page target by luck of version; the dev tree's did not).
    try {
      const v = await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/version`)).json();
      const br = await connect(v.webSocketDebuggerUrl);
      const tg = (await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/list`)).json()).find(t => t.type === 'page' && !t.url.includes('mode='));
      const { windowId } = await br.send('Browser.getWindowForTarget', { targetId: tg.id });
      await br.send('Browser.setWindowBounds', { windowId, bounds: comp ? { windowState: 'maximized' } : { left: 0, top: 0, width: 1600, height: 1000 } });
      br.close();
    } catch (e) { report.notes.push('window size failed: ' + e.message); }
    await sleep(f.build === 'dev' ? 8000 : 1500);
    report.renderer = await bound(readRendererInfo(app.cdpPort, cdp), 'GPU info');
    if (f.display === 'gpu') { const v = rendererVerdict(report.renderer); report.rendererVerdict = v; if (!v.ok) throw Object.assign(Error(`REFUSED: ${v.reason}`), { refused: true }); }
    report.viewport = await cdp.evaluate('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
    report.userAgent = await cdp.evaluate('navigator.userAgent');
    report.refreshHz = await cdp.evaluate(`new Promise(r => { const a = []; const g = t => { a.push(t); a.length < 60 ? requestAnimationFrame(g) : r(1000 / ((a.at(-1) - a[0]) / (a.length - 1))); }; requestAnimationFrame(g); })`).then(n => r1(n));
    await cdp.send('Performance.enable').catch(() => {});
    await cdp.evaluate(`(${eventRecorder})()`);
    ctx = { cdp, app, opts, ids: [], gpuInfo: f.display === 'gpu' ? ctxGpu : null };
    // open the sessions (real Claude Code sessions through the fake `claude`; on-screen history = the transcript)
    for (const s of world) {
      const id = await bound((async () => { const r = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify({ name: s.name, cwd: s.cwd, skipPermissions: true, resumeSessionId: s.resume })}); return { id: s.id }; } catch (e) { return { error: String(e && e.message || e) }; } })()`); if (r.error) throw Error(`session.create(${s.name}): ${r.error}`); await waitForSessionReady(cdp, { clearMs: 120000 }); return r.id; })(), `open ${s.name}`, 240000);
      ctx.ids.push(id); report.sessions.push({ name: s.name, source: s.source, sizeMB: s.sizeMB, ageDays: s.ageDays ?? null, turns: s.turns ?? null });
    }
    await sleep(2000);
    // theme proof
    report.themeProof = await cdp.evaluate(`({ theme: document.documentElement.dataset.theme, reduced: document.documentElement.hasAttribute('data-reduced-effects'), wallpaper: document.documentElement.hasAttribute('data-wallpaper'), canvases: [...document.querySelectorAll('canvas')].filter(c => c.width > 200).length })`);
    // ── runs ──
    const seed = opts.seed;
    const doRun = async (label, extra = {}) => {
      report.runs[label] = await bound(flipRun(ctx, label, { seconds: opts.seconds, seed, ...extra }), label, (opts.seconds + 60) * 1000);
      report.runs[label].loadAvgStart = report.runs[label].loadAvg;
      writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
    };
    for (const s of opts.seqs) {
      try {
        if (s === 'fresh') { await doRun('fresh'); }
        else if (s === 'warm') { await bound(warmUp(ctx), 'warm-up', opts.deep === 'on' ? 900000 : 300000); report.census = await bound(censusAll(ctx), 'census', 200000); report.deepEntries = ctx.deepEntries ?? null; report.census.forEach((c, i) => { if (c) report.sessions[i].census = c; }); await goTo(ctx, 0, 1500); await doRun('warm'); }
        else if (s === 'soak') {
          // WHY: his app had been up 2.5 h with memory climbing; a soak of continuous human flipping approximates accumulation (listeners, caches, heap).
          await goTo(ctx, 0, 1000);
          report.runs.soakload = await bound(flipRun(ctx, 'soakload', { seconds: opts.soakMinutes * 60, seed }), 'soak', (opts.soakMinutes * 60 + 120) * 1000);
          report.soakHeapMB = await cdp.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null');
          await doRun('soaked');
        }
        else if (s === 'busy') {
          busy = await startBusyDesktop({ ...(['heavy', 'both'].includes(f.busy) ? { hogs: Math.ceil(cpus().length * 1.25), duty: 1 } : {}), ...(['gpu', 'both'].includes(f.busy) ? { pageQuery: 'n=16&mode=full&canvas=1&fps=60&spin=1' } : {}), display: busyDisplay, workDir: join(root, 'busy'), controlHtml: join(ROOT, 'scripts/perf-lab/gpu-control/control.html'), log: m => report.notes.push(m) });
          report.busy = busy.info; await sleep(6000);
          try { await doRun('busy'); } finally { await busy.stop(); busy = null; }
        } else if (s === 'ctrl') {
          // positive control: a known 200 ms main-thread block right after every press — the numbers MUST rise by about that much
          const plan = []; let c = 0; for (let k = 0; k < 16; k++) { c = (c + 1) % ctx.ids.length; plan.push({ at: 800 + k * 1400, kind: 'click', idx: c }); }
          report.controls.block200 = await bound(flipRun(ctx, 'ctrl', { seconds: 25, seed, block: 200, planOverride: plan }), 'ctrl', 120000);
        } else if (s === 'noop') {
          const cur = await visibleIdx(ctx); const plan = []; for (let k = 0; k < 8; k++) plan.push({ at: 800 + k * 700, kind: 'click', idx: cur });
          report.controls.noop = await bound(flipRun(ctx, 'noop', { seconds: 10, seed, planOverride: plan }), 'noop', 90000);
        }
      } catch (e) { report.errors[s] = String(e?.message ?? e); }
      writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
    }
    report.status = Object.keys(report.errors).length ? 'incomplete' : 'measured';
  } catch (e) { report.error = String(e?.message ?? e); report.errorStack = String(e?.stack ?? '').split('\n').slice(0, 6).join(' | '); if (e.refused) report.status = 'refused'; }
  finally {
    report.loadAvgEnd = readFileSync('/proc/loadavg', 'utf8').trim();
    if (busy) await busy.stop().catch(() => {});
    try { for (const id of [...(ctx?.ids ?? [])].reverse()) await ctx.cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`).catch(() => {}); } catch { /* app gone */ }
    if (app) await Promise.race([app.kill(), sleep(15000)]).catch(e => { report.cleanupError = e.message; });
    if (xvfb?.proc) xvfb.proc.kill('SIGTERM');
    if (comp) await comp.stop().catch(() => {});
    if (fake) await Promise.race([fake.close(), sleep(3000)]).catch(() => {});
    // The fixture HOME holds copies of real conversations when --history real: delete it (a directory THIS run created, under scratch/).
    if (root && root.startsWith(join(WORK, 'realism-fixture-'))) { try { rmSync(root, { recursive: true, force: true }); report.fixtureDeleted = !existsSync(root); } catch (e) { report.cleanupError = e.message; } }
    report.finishedAt = new Date().toISOString();
    writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
let ctxGpu = null;

export function loadTarget(path = HIS_FILE) {
  const files = ['hitches.1.jsonl', 'hitches.jsonl'].map(n => join(path, n)).filter(existsSync);
  const rows = [];
  for (const fl of files) for (const line of readFileSync(fl, 'utf8').split('\n')) { if (!line) continue; try { rows.push(JSON.parse(line)); } catch { /* torn */ } }
  return targetFromHitches(rows, { minSessions: 2 });
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  if (!assetsReady()) throw Error('perf-lab assets not cached');
  mkdirSync(opts.out, { recursive: true });
  const target = loadTarget();
  const f = opts.factors;
  const stem = `${opts.tag || opts.preset}-${f.build}-${f.history}-${f.theme}-${f.display}-s${f.sessions}-b${f.busy}${opts.pick !== 'ladder' ? '-' + opts.pick : ''}${opts.deep === 'on' ? '-deep' : ''}`;
  const reports = [];
  for (let b = 1; b <= opts.boots; b++) {
    const file = join(opts.out, `${stem}-boot${b}.json`);
    const w = await waitForQuiet(opts.waitMinutes * 60000);
    console.log(`[run] ${stem} boot ${b} (waited ${Math.round(w.waitedMs / 1000)} s${w.gaveUp ? ', GAVE UP waiting: load/another run persists' : ''}) -> ${file}`);
    const rep = await runBoot(opts, b, file);
    rep.waited = w; rep.target = target;
    for (const k of ['fresh', 'warm', 'soaked', 'busy']) if (rep.runs[k]) rep.runs[k].calibration = calibrate(rep.runs[k].all, target);
    writeFileSync(file, JSON.stringify(rep, null, 2) + '\n');
    console.log(`[done] ${stem} boot ${b}: ${rep.status}${rep.error ? ' ' + rep.error : ''}${Object.keys(rep.errors).length ? ' errors: ' + JSON.stringify(rep.errors) : ''}`);
    reports.push(rep);
  }
  if (reports.some(r => r.status !== 'measured')) process.exitCode = 2;
  return reports;
}
void SLOW_MS; void selfChain; void cpSync; void waitFor;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 2; });
