#!/usr/bin/env node
// scripts/perf-lab/gpu-cost.mjs — what does a THEME cost on the REAL graphics card, measured INVISIBLY.
//
// WHAT IT DOES
//   1. Starts a private, invisible KWin ("kwin_wayland --virtual") on its own socket, with its own
//      D-Bus and runtime dir, then adds + selects a 2560x1600 @ 179.89 Hz mode on its one virtual
//      output (scale 1.5 like the owner's panel). Nothing appears on the real screen: the virtual
//      compositor renders on the same Radeon (radeonsi/ANGLE) but never scans out to a monitor.
//   2. Launches the PACKAGED app (a copy under scratch/perf-lab/gpu/app, built by the rig) with a
//      fixture HOME and --ozone-platform=wayland against that socket. Theme + toggles are written
//      into the fixture, never into the real ~/.claude (live-app-safety.md).
//   3. REFUSES to report anything unless Chromium says it is on the Radeon with GPU compositing and
//      GPU rasterization enabled (gpu.mjs + gpu-cost-parse.mjs rendererVerdict).
//   4. For each cell, samples for N seconds: per-process GPU engine time (amdgpu fdinfo, deduped by
//      drm-client-id), whole-GPU busy %, shader clock + board power (hwmon), CPU by process role,
//      PSS + GPU memory; then a SEPARATE traced window (viz/cc) for frame counts, intervals,
//      pipeline states and draw time (tracing adds overhead, so it never shares a window with the
//      GPU/CPU readings).
//   5. Runs a POSITIVE CONTROL (a page with N window-sized or bubble-sized backdrop-filter layers
//      over an animating canvas) and a NOISE FLOOR (same scene repeated) so a reading can be
//      judged: a theme difference only counts if it exceeds the repeat spread and the control
//      rose monotonically with N.
//
// WHAT IT CANNOT SEE — read before quoting any number
//   - The virtual compositor does not scan out: no panel timing, no DCN/display-engine cost, no
//     real vblank, no VRR/PSR behaviour, no tearing/late-flip. "Presented" means "the virtual
//     compositor reported the frame", not "photons at 180 Hz".
//   - KWin's own GPU time is not readable per process (kwin is not dumpable, so /proc/<pid>/fdinfo
//     is empty). Only whole-GPU busy % sees it, and the owner's desktop contaminates that figure.
//     The app's per-process fdinfo numbers are NOT contaminated by other processes.
//   - GPU engine time depends on the clock the driver chose; sclk is recorded beside it.
//   - Smoothness as a human feels it (180 Hz) needs eyes on the real panel.
//
// USAGE
//   node scripts/perf-lab/gpu-cost.mjs --app-dir <abs> --out <abs .json under scratch/perf-lab/gpu/> \
//        --suite control|themes|probe [--seconds 15] [--repeats 3] [--cells 'midnight,cotton-candy-sky+noparticles,…'] \
//        [--scene welcome|chat|stream  (comma list)]  [--theme-source <abs wecoded-themes/themes>]
//   Cell spec = <slug>[+reduced][+noparticles][+smallwall][+noblur].  "midnight" is the built-in plain theme.
//
// Node built-ins only. Pure maths lives in gpu-cost-parse.mjs (unit-tested).
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync, statSync, openSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';
import { buildFixture } from './fixture.mjs';
import { readRendererInfo } from './gpu.mjs';
import { launchApp, readPpid, selfChain } from './launch.mjs';
import { cpuSnapshot, cpuPercent, findFamily, pssMb, loadAvg1 } from './procs.mjs';
import { createServer } from 'node:net';
import { startFakeProvider } from './fake-provider.mjs';
import { waitFor } from './cdp.mjs';
import {
  parseFdinfo, sumClients, totalEngineNs, engineDelta, memoryMiB, summariseTrace,
  median, spread, describe, exceedsNoise, monotonicRise, rendererVerdict,
} from './gpu-cost-parse.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const GPU_DIR = join(ROOT, 'scratch', 'perf-lab', 'gpu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : n);
const REAL_WAYLAND_NAMES = new Set(['wayland-0', 'wayland-1']);

// ── sysfs ────────────────────────────────────────────────────────────────────

/** The amdgpu card + its hwmon dir. Throws (loudly) if this is not an AMD GPU machine. */
export function findAmdgpu() {
  for (const card of readdirSync('/sys/class/drm').filter((d) => /^card\d+$/.test(d))) {
    const dev = `/sys/class/drm/${card}/device`;
    try {
      if (!existsSync(`${dev}/gpu_busy_percent`)) continue;
      const hw = readdirSync(`${dev}/hwmon`)[0];
      return { card, dev, hwmon: hw ? `${dev}/hwmon/${hw}` : null, pdev: readlinkSync(dev).split('/').pop() };
    } catch { /* next */ }
  }
  throw new Error('gpu-cost: no amdgpu card with gpu_busy_percent found under /sys/class/drm');
}
const num = (p) => { try { return Number(readFileSync(p, 'utf8').trim()); } catch { return null; } };
export function readGpuSysfs(g) {
  return {
    busy: num(`${g.dev}/gpu_busy_percent`),
    sclkMHz: g.hwmon ? (num(`${g.hwmon}/freq1_input`) ?? NaN) / 1e6 : null,
    powerW: g.hwmon ? (num(`${g.hwmon}/power1_average`) ?? num(`${g.hwmon}/power1_input`) ?? NaN) / 1e6 : null,
    vramUsedMiB: (num(`${g.dev}/mem_info_vram_used`) ?? NaN) / 1048576,
    gttUsedMiB: (num(`${g.dev}/mem_info_gtt_used`) ?? NaN) / 1048576,
  };
}
export function acState() {
  try { for (const d of readdirSync('/sys/class/power_supply')) { if (/^AC|ADP/i.test(d)) return num(`/sys/class/power_supply/${d}/online`) === 1 ? 'AC' : 'battery'; } } catch { /* none */ }
  return 'unknown';
}

// ── per-process GPU accounting ───────────────────────────────────────────────

/** Every amdgpu client held by any pid in `pids`, deduped by drm-client-id. */
export function readClients(pids, pdev) {
  const entries = [];
  for (const pid of pids) {
    let fds; try { fds = readdirSync(`/proc/${pid}/fdinfo`); } catch { continue; }
    let comm = ''; try { comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { /* gone */ }
    for (const fd of fds) {
      let target = ''; try { target = readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      if (!target.startsWith('/dev/dri/')) continue;
      let text; try { text = readFileSync(`/proc/${pid}/fdinfo/${fd}`, 'utf8'); } catch { continue; }
      const parsed = parseFdinfo(text);
      if (parsed && (!pdev || parsed.pdev === pdev)) entries.push({ pid, comm, fd: parsed });
    }
  }
  return sumClients(entries);
}

// ── private invisible compositor ─────────────────────────────────────────────

/**
 * Start `kwin_wayland --virtual` on a private socket. SAFETY: the compositor gets its OWN
 * XDG_RUNTIME_DIR, config and D-Bus, and DISPLAY/WAYLAND_DISPLAY are removed, so it cannot
 * reach the owner's compositor, bus or settings. Every client command below carries the same
 * private env and an absolute-checked socket name.
 */
export async function startVirtualCompositor({ dir = GPU_DIR, socket = 'perf-0', scale = 1.5, width = 2560, height = 1600, hz = 180 } = {}) {
  const rt = join(dir, 'rt'); const cfg = join(dir, 'cfg');
  mkdirSync(rt, { recursive: true, mode: 0o700 }); mkdirSync(cfg, { recursive: true });
  if (join(rt, socket).length > 107) throw new Error(`gpu-cost: socket path too long for AF_UNIX (${join(rt, socket).length} > 107): ${join(rt, socket)}`);
  if (REAL_WAYLAND_NAMES.has(socket)) throw new Error('gpu-cost: refusing a socket name that could be the real session');
  const env = privateEnv({ rt, cfg, socket });
  if (existsSync(join(rt, socket))) throw new Error(`gpu-cost: ${join(rt, socket)} already exists — a previous compositor was not stopped; stop it by pid first`);
  const log = openSync(join(dir, 'kwin-virtual.log'), 'a');
  const proc = spawn('dbus-run-session', ['--', 'kwin_wayland', '--virtual', '--socket', socket, '--width', String(width), '--height', String(height), '--scale', String(scale), '--no-lockscreen', '--no-global-shortcuts'],
    { env, detached: true, stdio: ['ignore', log, log] });
  const handle = { pid: proc.pid, socketPath: join(rt, socket), env, rt, async stop() { await stopGroup(proc.pid); } };
  const t0 = Date.now();
  while (!existsSync(handle.socketPath)) { if (Date.now() - t0 > 15000) { await handle.stop(); throw new Error('gpu-cost: virtual KWin did not create its socket within 15 s'); } await sleep(150); }
  await sleep(1000);
  // Add a custom ~180 Hz mode, then select it. kscreen-doctor talks to the PRIVATE socket only.
  try {
    kscreen(env, [`output.Virtual-0.addCustomMode.${width}.${height}.${Math.round(hz * 1000)}.full`]);
    const modes = kscreen(env, ['-o']);
    const m = /(\d+):\S*?@(17[89]\.\d+|180\.\d+)/.exec(modes.replace(/\x1b\[[0-9;]*m/g, ''));
    if (m) kscreen(env, [`output.Virtual-0.mode.${m[1]}`]);
    // WHY via kscreen-doctor and not only --scale: kwin_wayland's --scale rounds to an integer; the owner's panel runs 1.5.
    kscreen(env, [`output.Virtual-0.scale.${scale}`]);
  } catch (e) { handle.modeError = String(e.message ?? e); }
  handle.info = waylandInfo(env);
  return handle;
}
function privateEnv({ rt, cfg, socket }) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, XDG_RUNTIME_DIR: rt, XDG_CONFIG_HOME: cfg, XDG_DATA_HOME: join(cfg, 'data'), XDG_CACHE_HOME: join(cfg, 'cache'), WAYLAND_DISPLAY: socket, QT_QPA_PLATFORM: 'wayland' };
  if (env.XDG_RUNTIME_DIR === `/run/user/${process.getuid()}`) throw new Error('gpu-cost: refusing the real runtime dir');
  return env;
}
function kscreen(env, args) {
  if (env.XDG_RUNTIME_DIR.startsWith('/run/user/')) throw new Error('gpu-cost: kscreen-doctor must use the private runtime dir');
  return execFileSync('kscreen-doctor', args, { env, timeout: 20000, encoding: 'utf8' });
}
export function waylandInfo(env) {
  if (env.XDG_RUNTIME_DIR.startsWith('/run/user/')) throw new Error('gpu-cost: wayland-info must use the private runtime dir');
  const text = execFileSync('wayland-info', [], { env, timeout: 15000, encoding: 'utf8' });
  const refresh = [...text.matchAll(/refresh:\s*([\d.]+) Hz/g)].map((m) => Number(m[1]));
  return { refreshHz: refresh, presentationProtocol: /wp_presentation/.test(text), dmabuf: /zwp_linux_dmabuf_v1/.test(text), logical: /logical_width:\s*(\d+), logical_height:\s*(\d+)/.exec(text)?.slice(1).map(Number) ?? null, scale: /scale:\s*([\d.]+)/.exec(text)?.[1] ?? null };
}
async function stopGroup(pid) {
  // Only OUR process group (dbus-run-session + its children). Never a name match.
  try { process.kill(-pid, 'SIGTERM'); } catch { /* gone */ }
  for (let i = 0; i < 30; i++) { await sleep(200); try { process.kill(-pid, 0); } catch { return; } }
  try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ }
}

// ── theme fixture ────────────────────────────────────────────────────────────

export const DEFAULT_THEME_SOURCE = '/home/destin/youcoded-dev/wecoded-themes/themes';
export function parseCell(spec) {
  const [slug, ...toggles] = spec.split('+');
  const known = new Set(['reduced', 'noparticles', 'smallwall', 'noblur']);
  for (const t of toggles) if (!known.has(t)) throw new Error(`unknown toggle "${t}" in cell "${spec}" (known: ${[...known].join(', ')})`);
  return { spec, slug, toggles: new Set(toggles) };
}
/** Copy a registry theme into the fixture and apply file-level toggles. Returns the manifest actually installed. */
export function installTheme(fixture, cell, source = DEFAULT_THEME_SOURCE) {
  writeFileSync(join(fixture.home, '.claude/youcoded-appearance.json'), JSON.stringify({ theme: cell.slug, reducedEffects: cell.toggles.has('reduced'), lookOverrides: {} }));
  if (cell.slug === 'midnight') return null;
  const src = join(source, cell.slug); const dest = join(fixture.home, '.claude/wecoded-themes', cell.slug);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, errorOnExist: true, force: false, dereference: false });
  const mfile = join(dest, 'manifest.json');
  const m = JSON.parse(readFileSync(mfile, 'utf8'));
  // WHY these toggles are manifest edits in the FIXTURE COPY: they change exactly one variable of the
  // shipped theme without touching app source or the registry.
  if (cell.toggles.has('noparticles') && m.effects) { m.effects.particles = 'none'; }
  if (cell.toggles.has('noblur') && m.background) { m.background['panels-blur'] = 0; m.background['bubble-blur'] = 0; }
  if (cell.toggles.has('smallwall') && m.background?.type === 'image') {
    const wall = join(dest, m.background.value);
    // 2560x1600 is the owner's panel in device pixels; "^" = fill then centre-crop, quality 90.
    execFileSync('magick', [wall, '-resize', '2560x1600^', '-gravity', 'center', '-extent', '2560x1600', '-quality', '90', wall]);
  }
  writeFileSync(mfile, JSON.stringify(m, null, 2));
  return m;
}

// ── page helpers ─────────────────────────────────────────────────────────────

const BUBBLE_PROBE = `(() => {
  const root = document.documentElement;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !el.closest('[aria-hidden="true"]'); };
  const b = [...document.querySelectorAll('.in-view .bg-inset, .in-view .bg-accent')].filter(vis);
  const glass = b.filter((el) => { const f = getComputedStyle(el).backdropFilter; return f && f !== 'none'; });
  const canv = [...document.querySelectorAll('canvas')].filter((c) => c.width > 200 && c.height > 200);
  return { theme: root.dataset.theme, wallpaper: root.hasAttribute('data-wallpaper'), reduced: root.hasAttribute('data-reduced-effects'), bubbleGlassAttr: root.hasAttribute('data-bubble-glass'),
    visibleBubbles: b.length, glassBubbles: glass.length, bigCanvases: canv.length, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
    panelsBlur: getComputedStyle(root).getPropertyValue('--panels-blur').trim(), bubbleBlur: getComputedStyle(root).getPropertyValue('--bubble-blur').trim(),
    bgImage: (document.querySelector('#theme-bg') ? getComputedStyle(document.querySelector('#theme-bg')).backgroundImage.slice(0, 120) : null) };
})()`;

async function browserCdp(port) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return connect(v.webSocketDebuggerUrl);
}
async function processRoles(br) {
  const r = await br.send('SystemInfo.getProcessInfo');
  return (r.processInfo ?? []).map((p) => ({ pid: p.id, type: p.type }));
}

/** The app's processes: every pid naming the package or fixture, minus THIS process and its ancestors (our own argv names the package). */
function appPids(appDir, home) {
  const ours = selfChain(readPpid, process.pid);
  return findFamily([appDir, home]).filter((p) => !ours.has(p));
}

// ── one measurement window ───────────────────────────────────────────────────

/**
 * Sample `seconds` of an app that is already showing the scene. NO tracing here.
 * Returns plain numbers; every figure is a rate over this window.
 */
export async function measureWindow(app, ctx, { seconds }) {
  const { gpu, appDir, home } = ctx;
  const br = await browserCdp(app.cdpPort);
  const roles = await processRoles(br).catch(() => []); br.close();
  const roleOf = new Map(roles.map((r) => [r.pid, r.type]));
  const pids = appPids(appDir, home);
  const cpu0 = cpuSnapshot(pids); const cl0 = readClients(pids, gpu.pdev); const t0 = process.hrtime.bigint();
  const sys0 = readGpuSysfs(gpu);
  const busy = [], sclk = [], power = [], perSecPct = [];
  let prev = cl0, prevT = t0;
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())));
    const s = readGpuSysfs(gpu); if (Number.isFinite(s.busy)) busy.push(s.busy); if (Number.isFinite(s.sclkMHz)) sclk.push(s.sclkMHz); if (Number.isFinite(s.powerW)) power.push(s.powerW);
    const now = process.hrtime.bigint();
    if (now - prevT >= 1_000_000_000n) {
      const cl = readClients(appPids(appDir, home), gpu.pdev);
      perSecPct.push(engineDelta(prev, cl, Number(now - prevT)).pct);
      prev = cl; prevT = now;
    }
  }
  const t1 = process.hrtime.bigint(); const wallNs = Number(t1 - t0);
  const pids1 = appPids(appDir, home);
  const cl1 = readClients(pids1, gpu.pdev); const cpu1 = cpuSnapshot(pids1);
  const gfx = engineDelta(cl0, cl1, wallNs, 'gfx'); const comp = engineDelta(cl0, cl1, wallNs, 'compute');
  const cpuP = cpuPercent(cpu0, cpu1, wallNs / 1e9);
  const byRole = {};
  for (const [pid, pct] of cpuP.perPid) { const r = roleOf.get(pid) ?? 'other'; byRole[r] = (byRole[r] ?? 0) + pct; }
  const pss = pssMb(pids1); const pssRole = {};
  for (const p of pss.perPid) { const r = roleOf.get(p.pid) ?? 'other'; pssRole[r] = (pssRole[r] ?? 0) + p.mb; }
  const sys1 = readGpuSysfs(gpu);
  const gpuProcClients = [...cl1.values()];
  return {
    seconds: round(wallNs / 1e9, 1), loadAvg1: loadAvg1(),
    appGpuGfxPct: round(gfx.pct, 3), appGpuComputePct: round(comp.pct, 3), appGpuGfxPctPerSecond: describe(perSecPct.filter(Number.isFinite)),
    lostClients: gfx.lostClients,
    // WHY: the driver changes the shader clock with load (measured 693-1324 MHz in one session), and the same job
    // takes longer at a lower clock, so engine-time % alone moves with the clock. % x MHz ~ megacycles/second of
    // graphics work, which holds steadier across clock changes. Both are reported; neither is a power figure.
    appGpuMegacyclesPerSec: Number.isFinite(gfx.pct) && sclk.length ? round(gfx.pct / 100 * (sclk.reduce((a, b) => a + b, 0) / sclk.length), 2) : null,
    systemGpuBusyPct: describe(busy), sclkMHz: describe(sclk), boardPowerW: describe(power),
    cpuPctByRole: Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, round(v, 2)])), cpuPctTotal: round(cpuP.totalPct, 2),
    pssMbByRole: Object.fromEntries(Object.entries(pssRole).map(([k, v]) => [k, round(v, 1)])), pssMbTotal: pss.totalMb,
    appGpuVramMiB: round(memoryMiB(cl1, 'vram'), 1), appGpuGttMiB: round(memoryMiB(cl1, 'gtt'), 1),
    systemVramUsedMiBDelta: round(sys1.vramUsedMiB - sys0.vramUsedMiB, 1), systemGttUsedMiBDelta: round(sys1.gttUsedMiB - sys0.gttUsedMiB, 1),
    clientsSeen: gpuProcClients.map((c) => ({ pid: c.pid, comm: c.comm, role: roleOf.get(c.pid) ?? 'other', gfxNs: c.engines.gfx ?? 0 })),
  };
}

/** A separate window WITH tracing, for frame facts only. */
export async function traceWindow(app, { seconds }) {
  const br = await browserCdp(app.cdpPort);
  const ev = []; br.on('Tracing.dataCollected', (p) => { for (const e of p.value) ev.push(e); });
  const done = new Promise((r) => br.on('Tracing.tracingComplete', r));
  await br.send('Tracing.start', { traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: ['viz', 'cc', 'benchmark', 'disabled-by-default-devtools.timeline.frame'] }, transferMode: 'ReportEvents' });
  await sleep(seconds * 1000);
  await br.send('Tracing.end'); const end = await done; br.close();
  return { ...summariseTrace(ev), eventCount: ev.length, dataLoss: end?.dataLossOccurred ?? null, seconds };
}

// ── scenes ───────────────────────────────────────────────────────────────────

async function pageFor(app) {
  const list = await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/list`)).json();
  const t = list.find((x) => x.type === 'page'); return connect(t.webSocketDebuggerUrl);
}
const CONTROL_URL = (q) => `file://${join(ROOT, 'scripts/perf-lab/gpu-control/control.html')}?${q}`;
async function navigateControl(app, q) {
  const p = await pageFor(app);
  await p.send('Page.enable'); await p.send('Page.navigate', { url: CONTROL_URL(q) });
  await sleep(2500); p.close();
}

/** Boot a themed app on the invisible compositor. Returns the app + context. */
async function bootApp(opts, comp, cell, { fakeProvider = true } = {}) {
  const root = join(opts.work, `boot-${Date.now()}`); mkdirSync(root, { recursive: true });
  const fixture = buildFixture(root, { fakeProvider, log() {} });
  const manifest = installTheme(fixture, cell, opts.themeSource);
  // WHY a retry: on 2026-10-05, while other sessions' rigs and two VMs held the machine at load 28-50, the
  // app's main process twice stalled before opening a window (never reproduced at load < 10, and not caused
  // by the environment). One retry on a fresh profile is cheap; a second failure is reported, not hidden.
  let app, lastErr;
  for (let attempt = 1; attempt <= 2 && !app; attempt++) {
    try {
      app = await launchApp({ binary: join(opts.appDir, 'youcoded'), appDir: opts.appDir, fixture, cdpPort: opts.cdpPort, waylandSocket: comp.socketPath, protocolLog: join(root, `wayland-stderr-${attempt}.log`), protocolDebug: false, refuseExisting: true });
    } catch (e) { lastErr = e; console.error(`  boot attempt ${attempt} failed: ${String(e.message).split('\n')[0]}`); }
  }
  if (!app) throw lastErr;
  return { app, fixture, root, manifest };
}
async function waitThemeReady(app, cell) {
  await waitFor(app.cdp, `document.documentElement.dataset.theme===${JSON.stringify(cell.slug)}`, { timeoutMs: 40000, everyMs: 300 });
  await sleep(3000);
}

/** ~10 visible bubbles: five short exchanges through the fake provider (nothing leaves the machine). */
async function buildChat(app, fixture, fake) {
  const cdp = app.cdp;
  const binding = { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId };
  const r = await cdp.evaluate(`(async () => { try { const s = await window.claude.session.create(${JSON.stringify({ name: 'gpu-cost', cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native', binding, preset: 'coder' })}); return { id: s.id }; } catch (e) { return { error: String(e.message || e) }; } })()`);
  if (r.error) throw new Error(`gpu-cost: could not create the native chat session: ${r.error}`);
  await sleep(2500);
  for (let i = 0; i < 5; i++) {
    fake.plan({ deltas: 40, perSec: 200, seed: `gpu-cost-${i}`, chars: 360 });
    const done = fake.expectCompletion();
    await cdp.evaluate(`window.claude.native.send(${JSON.stringify(r.id)}, ${JSON.stringify(`gpu-cost question ${i + 1}: please describe the weather in a sentence or two.`)})`);
    await done; await sleep(1200);
  }
  await sleep(1500);
  return r.id;
}

async function streamStart(app, sessionId, fake, { perSec, seconds }) {
  fake.plan({ deltas: Math.ceil(perSec * (seconds + 8)), perSec, seed: `stream-${Math.random()}` });
  const done = fake.expectCompletion();
  await app.cdp.evaluate(`window.claude.native.send(${JSON.stringify(sessionId)}, 'gpu-cost stream')`);
  await sleep(1500);
  // WHY wrapped: returning the bare promise from an async function would make the caller wait for the whole stream.
  return { done };
}

// ── suites ───────────────────────────────────────────────────────────────────

function summarise(windows, pick) { return spread(windows.map(pick)); }
function cellSummary(windows, traces) {
  return {
    appGpuGfxPct: summarise(windows, (w) => w.appGpuGfxPct),
    appGpuMegacyclesPerSec: summarise(windows, (w) => w.appGpuMegacyclesPerSec),
    systemGpuBusyPctMean: summarise(windows, (w) => w.systemGpuBusyPct.mean),
    sclkMHzMean: summarise(windows, (w) => w.sclkMHz.mean),
    boardPowerWMean: summarise(windows, (w) => w.boardPowerW.mean),
    gpuProcessCpuPct: summarise(windows, (w) => w.cpuPctByRole.GPU ?? w.cpuPctByRole.gpu ?? 0),
    rendererCpuPct: summarise(windows, (w) => w.cpuPctByRole.renderer ?? w.cpuPctByRole.Renderer ?? 0),
    browserCpuPct: summarise(windows, (w) => w.cpuPctByRole.browser ?? w.cpuPctByRole.Browser ?? 0),
    appGpuVramMiB: summarise(windows, (w) => w.appGpuVramMiB),
    appGpuGttMiB: summarise(windows, (w) => w.appGpuGttMiB),
    pssMbTotal: summarise(windows, (w) => w.pssMbTotal),
    compositorFps: spread(traces.map((t) => t.compositorFps)),
    drawAndSwapMsP95: spread(traces.map((t) => t.drawAndSwapMs.p95)),
    frameIntervalMsMedian: spread(traces.map((t) => t.frameIntervalMs.median)),
    frameIntervalMsP95: spread(traces.map((t) => t.frameIntervalMs.p95)),
    longIntervals: spread(traces.map((t) => t.longIntervals)),
    droppedPipelineFrames: spread(traces.map((t) => t.pipeline.dropped)),
    presentLatencyMsMedian: spread(traces.map((t) => t.presentLatencyMs.median)),
  };
}

async function gate(app, ctx) {
  const rec = await readRendererInfo(app.cdpPort, app.cdp);
  const v = rendererVerdict(rec);
  ctx.renderer = rec;
  if (!v.ok) throw Object.assign(new Error(`gpu-cost REFUSES to report: ${v.reason}`), { refused: true, renderer: rec });
  return rec;
}

export async function runControlSuite(opts, comp, ctx) {
  const cell = parseCell('midnight');
  const { app, root } = await bootApp(opts, comp, cell, { fakeProvider: false });
  const out = { variants: [] };
  try {
    await waitThemeReady(app, cell);
    await gate(app, ctx);
    const variants = [
      { id: 'idle-static', q: 'n=0&canvas=0', n: 0 },
      { id: 'full-canvas-n0', q: 'n=0&mode=full', n: 0 },
      { id: 'full-canvas-n1', q: 'n=1&mode=full', n: 1 },
      { id: 'full-canvas-n4', q: 'n=4&mode=full', n: 4 },
      { id: 'full-canvas-n16', q: 'n=16&mode=full', n: 16 },
      { id: 'bubbles-canvas-n10', q: 'n=10&mode=bubbles', n: 10 },
      { id: 'bubbles-canvas-n40', q: 'n=40&mode=bubbles', n: 40 },
      { id: 'bubbles-static-n10', q: 'n=10&mode=bubbles&canvas=0', n: 10 },
      { id: 'spin-cadence', q: 'n=0&canvas=0&spin=1', n: 0 },
    ];
    for (const v of opts.only ? variants.filter((x) => opts.only.includes(x.id)) : variants) {
      await navigateControl(app, v.q);
      const windows = [], traces = [];
      for (let i = 0; i < opts.repeats; i++) windows.push(await measureWindow(app, ctx, { seconds: opts.seconds }));
      traces.push(await traceWindow(app, { seconds: Math.min(10, opts.seconds) }));
      out.variants.push({ ...v, windows, traces, summary: cellSummary(windows, traces) });
      console.error(`  ${v.id}: app gfx ${out.variants.at(-1).summary.appGpuGfxPct.median}%  sys busy ${out.variants.at(-1).summary.systemGpuBusyPctMean.median}%  fps ${round(out.variants.at(-1).summary.compositorFps.median, 1)}`);
    }
  } finally { await app.kill().catch(() => {}); }
  // Checks the reader needs: monotone rise, and the noise floor from the repeated idle windows.
  const gfx = (id) => out.variants.find((v) => v.id === id)?.summary.appGpuGfxPct;
  const sys = (id) => out.variants.find((v) => v.id === id)?.summary.systemGpuBusyPctMean;
  const full = ['full-canvas-n0', 'full-canvas-n1', 'full-canvas-n4', 'full-canvas-n16'];
  const bub = ['full-canvas-n0', 'bubbles-canvas-n10', 'bubbles-canvas-n40'];
  const mk = (ids, f) => ids.filter((id) => f(id)).map((id) => ({ id, value: f(id).median }));
  out.checks = {
    noiseFloorGfxPctRange: gfx('idle-static')?.range ?? null,
    noiseFloorSystemBusyRange: sys('idle-static')?.range ?? null,
    appGpuTimeRisesWithFullLayers: monotonicRise(mk(full, gfx), 0.3),
    systemBusyRisesWithFullLayers: monotonicRise(mk(full, sys), 1.5),
    appGpuTimeRisesWithBubbles: monotonicRise(mk(bub, gfx), 0.3),
    staticBlurIsCheap: gfx('bubbles-static-n10') && gfx('idle-static') ? { staticBubbles: gfx('bubbles-static-n10').median, idle: gfx('idle-static').median } : null,
  };
  return out;
}

export async function runThemeSuite(opts, comp, ctx) {
  const results = [];
  for (const spec of opts.cells) {
    const cell = parseCell(spec);
    const { app, fixture, root, manifest } = await bootApp(opts, comp, cell);
    const fake = await startFakeProvider({ port: fixture.fakeProvider.port });
    const rec = { spec, slug: cell.slug, toggles: [...cell.toggles], manifestBackground: manifest?.background ? { type: manifest.background.type, value: manifest.background.value, panelsBlur: manifest.background['panels-blur'], bubbleBlur: manifest.background['bubble-blur'] } : null, effects: manifest?.effects ?? null };
    try {
      await waitThemeReady(app, cell);
      if (!ctx.renderer) await gate(app, ctx);
      // WHY optional: the 'welcome' scene is the app as it launches (no chat); it is also the scene the 2026-09-26 real-display probe measured, which lets this method be cross-checked against that one.
      const sessionId = opts.scenes.some((x) => x !== 'welcome') ? await buildChat(app, fixture, fake) : null;
      rec.page = await app.cdp.evaluate(BUBBLE_PROBE);
      const shot = await app.cdp.send('Page.captureScreenshot', { format: 'png' });
      const shotPath = join(opts.work, `shot-${spec.replace(/[^a-z0-9+-]/gi, '_')}-${Date.now()}.png`); writeFileSync(shotPath, Buffer.from(shot.data, 'base64')); rec.screenshot = shotPath;
      for (const scene of opts.scenes) {
        const windows = [], traces = [];
        for (let i = 0; i < opts.repeats; i++) {
          let done = null; if (scene === 'stream') done = (await streamStart(app, sessionId, fake, { perSec: 150, seconds: opts.seconds })).done;
          windows.push(await measureWindow(app, ctx, { seconds: opts.seconds }));
          if (done) { await done.catch(() => {}); await sleep(1500); }
        }
        let done = null; if (scene === 'stream') done = (await streamStart(app, sessionId, fake, { perSec: 150, seconds: 10 })).done;
        traces.push(await traceWindow(app, { seconds: 8 }));
        if (done) { await done.catch(() => {}); await sleep(1500); }
        rec[scene] = { windows, traces, summary: cellSummary(windows, traces) };
        console.error(`  ${spec} [${scene}]: app gfx ${rec[scene].summary.appGpuGfxPct.median}%  sys busy ${rec[scene].summary.systemGpuBusyPctMean.median}%  gpuproc cpu ${round(rec[scene].summary.gpuProcessCpuPct.median, 1)}%  fps ${round(rec[scene].summary.compositorFps.median, 1)}  vram ${rec[scene].summary.appGpuVramMiB.median}`);
      }
    } catch (e) { rec.error = String(e.message ?? e); if (e.refused) throw e; }
    finally { await fake.close().catch(() => {}); await app.kill().catch(() => {}); }
    results.push(rec);
  }
  return { cells: results };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const o = { suite: 'probe', seconds: 15, repeats: 3, scene: 'chat', cdpPort: 9591, themeSource: DEFAULT_THEME_SOURCE, hz: 180, scale: 1.5, keepCompositor: false };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]; const v = argv[i + 1];
    if (k === '--keep-compositor') { o.keepCompositor = true; i--; continue; }
    if (!k.startsWith('--') || v === undefined) throw new Error(`bad option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const k of ['appDir', 'out']) if (!o[k] || !isAbsolute(o[k])) throw new Error(`--${k} must be an absolute path`);
  if (!resolve(o.out).startsWith(GPU_DIR + '/')) throw new Error(`--out must be inside ${GPU_DIR}/`);
  o.seconds = Number(o.seconds); o.repeats = Number(o.repeats); o.cdpPort = Number(o.cdpPort); o.hz = Number(o.hz); o.scale = Number(o.scale);
  o.cells = typeof o.cells === 'string' ? o.cells.split(',').map((s) => s.trim()).filter(Boolean) : ['midnight'];
  o.scenes = String(o.scene).split(',');
  if (o.only) o.only = String(o.only).split(',');
  o.work = join(GPU_DIR, 'work'); mkdirSync(o.work, { recursive: true });
  return o;
}

/**
 * WHY: launch.mjs builds the app's env from process.env minus a short deny-list. Under a Plasma session
 * that carries ~60 session variables (KDE_*, SESSION_MANAGER, ICEAUTHORITY, XAUTHORITY, systemd's
 * MANAGERPID/INVOCATION_ID...). Measured 2026-10-05: with the full inherited env the packaged app's main
 * process stalls forever after its start-up chores and never opens a window (0 of 3 boots came up),
 * while the same app with a minimal env opens in ~1 s. Removing any ONE group of variables fixed it only
 * for two of six groups, so the trigger is not a single variable; an allow-list is the robust answer. It
 * also stops the test app from being handed the owner's session-manager and auth sockets.
 */
export function sanitizeProcessEnv(env = process.env, keep = ['PATH', 'LANG', 'USER', 'LOGNAME', 'TERM', 'HOME', 'TMPDIR']) {
  for (const k of Object.keys(env)) if (!keep.includes(k)) delete env[k];
  return env;
}

/**
 * WHY: the app derives its ports from YOUCODED_PORT_OFFSET=100 (remote server 10000, engine 10020) and the
 * rig's fake provider uses 9558. A second app on the same ports (an orphan of an earlier run, or another
 * session's rig) makes the new app stall before opening a window, which looks like a CDP timeout. Measured
 * 2026-10-05: three "mystery hangs" were all this. Refuse up front and say so.
 */
export async function assertPortsFree(ports = [10000, 10020, 9558]) {
  for (const port of ports) {
    await new Promise((ok, no) => {
      const srv = createServer(); srv.once('error', () => no(new Error(`gpu-cost: port ${port} is already in use (another perf-lab/dev app?). Find the holder with: ss -ltnp | grep :${port} — stop it by pid, then retry.`)));
      srv.listen(port, () => srv.close(() => ok()));
    });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  sanitizeProcessEnv();
  await assertPortsFree();
  const gpu = findAmdgpu();
  const report = { tool: 'gpu-cost.mjs', startedAt: new Date().toISOString(), suite: opts.suite, options: { ...opts, work: undefined }, machine: { acPower: acState(), gpuCard: gpu.card, pdev: gpu.pdev, kernel: execFileSync('uname', ['-r'], { encoding: 'utf8' }).trim() }, status: 'incomplete' };
  report.build = (() => { try { return JSON.parse(readFileSync(join(opts.appDir, '.perf-lab-build.json'), 'utf8')); } catch { return null; } })();
  let comp; const ctx = { gpu, appDir: opts.appDir, home: null, renderer: null };
  try {
    comp = await startVirtualCompositor({ scale: opts.scale, hz: opts.hz });
    report.compositor = { pid: comp.pid, ...comp.info, modeError: comp.modeError ?? null, note: 'private invisible kwin_wayland --virtual; no scanout' };
    // The fixture HOME lives under work/boot-*; the app family is matched by appDir plus the home root.
    ctx.home = opts.work;
    if (opts.suite === 'control') Object.assign(report, await runControlSuite(opts, comp, ctx));
    else if (opts.suite === 'themes') Object.assign(report, await runThemeSuite(opts, comp, ctx));
    else throw new Error(`unknown suite ${opts.suite}`);
    report.renderer = ctx.renderer; report.status = 'measured';
  } catch (e) {
    report.error = String(e.message ?? e); report.renderer = e.renderer ?? ctx.renderer;
    report.status = e.refused ? 'refused' : 'incomplete';
  } finally {
    if (comp && !opts.keepCompositor) await comp.stop();
    report.finishedAt = new Date().toISOString();
    writeFileSync(opts.out, JSON.stringify(report, null, 1) + '\n');
  }
  console.log(`gpu-cost: ${report.status} — ${opts.out}${report.error ? `\n${report.error}` : ''}`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((r) => { if (r.status !== 'measured') process.exitCode = 2; }).catch((e) => { console.error(e); process.exitCode = 2; });
}
