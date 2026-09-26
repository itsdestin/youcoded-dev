// scripts/perf-lab/real-scale-startup.mjs — boots the PACKAGED app against a
// copy-on-write COPY of this machine's real conversation history, and times
// what launch and the first Resume open actually cost at that size.
//
// WHY this exists (2026-09-26): the rig's own fixture is ~600 tiny transcripts.
// Destin's history is ~1,100 Claude Code transcripts (6.7 GB) plus ~2,600
// conversation records and 4.8 GB of synced copies, and the costs he feels —
// a laggy launch, a first Resume open that "loads forever" — only exist at that
// size. A synthetic fixture cannot show them.
//
// SAFETY
// - The real history is never opened for writing. Each boot gets a fresh
//   `cp --reflink=always` copy inside the fixture HOME (btrfs: instant, no extra
//   space until something is modified). The app's startup repair MOVES files,
//   so running it on the real folders would change them — hence the copy.
// - Sync cannot reach the real backup: the fixture HOME has no sync settings,
//   and the Personal space is copied WITHOUT its .git, so there is no remote.
// - The app runs with HOME=<fixture> via launch.mjs, which carries the rig's
//   live-app guards (never signals Destin's app; fixture HOME may not be the
//   real home). Nothing here signals a process directly.
// - The copies hold real conversations: they live under scratch/ (gitignored)
//   and are deleted at the end of the run unless --keep is passed.
//
// What it measures, per boot (all ms since the app process was spawned):
// - the main-process marks, including the bg:* marks for the detached work
//   (conversation store, slug repair, reconcile + its copies, materialize,
//   chat-search index, every Resume scan);
// - `firstBrowse`: session.browse() called the moment the session list is up —
//   the "first Resume open" case;
// - `laterBrowse`: the same call once the background work has settled;
// - `heartbeat`: a trivial IPC round trip every 100 ms from the renderer. A
//   slow round trip means the main process was busy — every window feels that
//   as a freeze. Reported as the worst trip and the time spent over 200 ms.
//
// Usage: node scripts/perf-lab/real-scale-startup.mjs [--checkout <dir>] [--warm-boots 1] [--keep] [--out <file>]
// Boot 1 is COLD (freshly copied files are not in the OS file cache — the same
// as the first launch after a reboot). Later boots relaunch on the same copy:
// warm cache, and the repair's own previous work already done.
//
// Node built-ins only: the workspace root has no package.json and must not gain one.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { buildFixture } from './fixture.mjs';
import { launchApp, startXvfb } from './launch.mjs';
import { connect, waitFor } from './cdp.mjs';
import { findFamily } from './procs.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCRATCH = join(ROOT, 'scratch', 'perf-lab');
const REAL_HOME = resolve(process.env.HOME || homedir());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[real-scale]', ...a);

// What gets copied: everything the launch-time conversation work reads. Paths
// are relative to the real home; a missing source is skipped (other machines).
const COPY = [
  '.claude/projects',
  '.claude/topics',
  '.claude/conversation-index.json',
  '.claude/youcoded-folders.json',
  '.youcoded/sessions',
  '.youcoded/slug-repair-state.json',
  '.youcoded/chatsearch',
  'YouCoded/Personal/Conversations',
  'YouCoded/Personal/ConversationNames',
  'YouCoded/Personal/Tags',
];

function parseArgs(argv) {
  const cfg = { checkout: join(ROOT, 'youcoded'), warmBoots: 1, keep: false, out: null, realLook: false, profile: false, windowMs: 20_000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--checkout') cfg.checkout = resolve(argv[++i]);
    else if (a === '--warm-boots') cfg.warmBoots = Number(argv[++i]);
    else if (a === '--keep') cfg.keep = true;
    else if (a === '--out') cfg.out = resolve(argv[++i]);
    else if (a === '--real-look') cfg.realLook = true;
    else if (a === '--profile') cfg.profile = true;
    else if (a === '--window-ms') cfg.windowMs = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  return cfg;
}

function overlayRealHistory(home) {
  if (resolve(home) === REAL_HOME || REAL_HOME.startsWith(`${resolve(home)}/`)) {
    throw new Error(`refusing: fixture home ${home} is the real home or contains it`);
  }
  // The fixture's own synthetic transcripts would add ~600 files the real
  // machine does not have; the point here is the real shape only.
  rmSync(join(home, '.claude', 'projects'), { recursive: true, force: true });
  for (const rel of COPY) {
    const src = join(REAL_HOME, rel);
    if (!existsSync(src)) { log(`skip (absent): ~/${rel}`); continue; }
    const dest = join(home, rel);
    mkdirSync(dirname(dest), { recursive: true });
    // --reflink=always FAILS rather than silently doing an 11 GB full copy on a
    // filesystem without copy-on-write.
    execFileSync('cp', ['-a', '--reflink=always', src, dest]);
  }
  // Managed project folders are listed by name only (listProjects) — create the
  // names so project-keyed logic sees the same set; their contents are not read.
  const projectsRoot = join(REAL_HOME, 'YouCoded', 'Projects');
  if (existsSync(projectsRoot)) {
    for (const e of readdirSync(projectsRoot, { withFileTypes: true })) {
      if (e.isDirectory()) mkdirSync(join(home, 'YouCoded', 'Projects', e.name), { recursive: true });
    }
  }
}

// --real-look: the theme, wallpaper and installed plugins Destin actually launches
// with, so first-launch animation and plugin-reconcile costs are his, not the
// stock theme's. Plugin registries store ABSOLUTE install paths; the copies are
// rewritten to point inside the fixture so a launch-time plugin update can only
// ever write into the copy.
const LOOK = ['.claude/youcoded-appearance.json', '.claude/wecoded-themes', '.claude/plugins'];
const PLUGIN_REGISTRIES = ['.claude/plugins/installed_plugins.json', '.claude/plugins/known_marketplaces.json'];

function overlayRealLook(home) {
  for (const rel of LOOK) {
    const src = join(REAL_HOME, rel);
    if (!existsSync(src)) { log(`skip (absent): ~/${rel}`); continue; }
    const dest = join(home, rel);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    execFileSync('cp', ['-a', '--reflink=always', src, dest]);
  }
  for (const rel of PLUGIN_REGISTRIES) {
    const f = join(home, rel);
    if (!existsSync(f)) continue;
    writeFileSync(f, readFileSync(f, 'utf8').split(`${REAL_HOME}/`).join(`${resolve(home)}/`));
    // The fixture itself lives under the real home, so compare counts: every
    // real-home path must now be a fixture path.
    const t = readFileSync(f, 'utf8');
    if (t.split(`${REAL_HOME}/`).length !== t.split(`${resolve(home)}/`).length) throw new Error(`refusing: ${f} still names the real home after rewrite`);
  }
}

/** Every perf-log line (not last-wins): scans repeat, so each occurrence matters. */
function readMarks(perfLog, spawnedAt) {
  const out = [];
  for (const line of readFileSync(perfLog, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); out.push({ ...e, at: e.t - spawnedAt }); } catch { /* torn line */ }
  }
  return out;
}

const HEARTBEAT_JS = `(() => {
  window.__hb = [];
  const tick = () => {
    const t0 = performance.now();
    window.claude.getHomePath().then(() => {
      window.__hb.push([Date.now(), Math.round(performance.now() - t0)]);
      setTimeout(tick, 100);
    });
  };
  tick();
  return true;
})()`;

async function timedBrowse(cdp, timeoutMs) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const t0 = performance.now();
      const timeout = new Promise((res) => setTimeout(() => res('timeout'), ${timeoutMs}));
      const call = window.claude.session.browse().then((rows) => rows.length, (e) => 'error: ' + e);
      const rows = await Promise.race([call, timeout]);
      return { ms: Math.round(performance.now() - t0), rows, startedAt: Date.now() - Math.round(performance.now() - t0) };
    })()`,
    awaitPromise: true, returnByValue: true,
  });
  return r.result.value;
}

function heartbeatStats(samples, spawnedAt) {
  const slow = samples.filter(([, rtt]) => rtt > 200);
  const worst = samples.reduce((m, s) => (s[1] > m[1] ? s : m), [0, 0]);
  return {
    samples: samples.length,
    worstMs: worst[1],
    worstAt: worst[0] ? worst[0] - worst[1] - spawnedAt : null,
    over200Count: slow.length,
    over200TotalMs: slow.reduce((n, [, rtt]) => n + rtt, 0),
    // Slow trips with when they started, for the timeline.
    slow: slow.map(([end, rtt]) => ({ at: end - rtt - spawnedAt, ms: rtt })),
  };
}

const SETTLE_MARKS = ['bg:slug-repair:done', 'bg:reconcile:copies-done', 'bg:materialize:done', 'bg:chatsearch-refresh:done'];

// ── --profile: an observe-only boot that records the first `windowMs` of a launch ──
//
// WHY observe-only: the normal boot calls session.browse() the instant the list is
// up, which is itself launch work; to see what a first launch does ON ITS OWN —
// including what makes its animations stutter — nothing is poked until the window
// closes. Records: a CPU profile of the main process from its first line
// (--inspect-brk; the build's EnableNodeCliInspectArguments fuse is on), a CPU
// profile of the window from attach, every long task (≥50 ms of script/style/
// layout that blocks a frame), every frame gap, the IPC heartbeat, per-process CPU
// per second, and every program the app starts.
//
// Frame gaps under Xvfb include software-rendering cost that a real GPU would not
// pay; a gap that coincides with a LONG TASK is script work and would stutter on
// any machine. That overlap is what the report calls out.
const INSPECT_PORT = 9557;

const FRAMES_JS = `(() => {
  window.__frames = []; window.__longtasks = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longtasks.push([e.startTime, e.duration, e.name]); })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) { window.__longtasksError = String(e); }
  let last = performance.now();
  const f = (now) => { window.__frames.push([last, now - last]); last = now; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  return performance.timeOrigin;
})()`;

async function attachMainInspector(timeoutMs = 30_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${INSPECT_PORT}/json/list`)).json();
      if (list[0]?.webSocketDebuggerUrl) return connect(list[0].webSocketDebuggerUrl);
    } catch { /* not listening yet */ }
    await sleep(50);
  }
  throw new Error(`main-process inspector never appeared on :${INSPECT_PORT}`);
}

/** Sample times on the wall clock: profile µs → epoch ms via the moment the profiler started. */
function sampleTimes(profile, startWall) {
  const out = []; let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] ?? 0; out.push(startWall + (t - profile.startTime) / 1000); }
  return out;
}

/** Self time per function inside [fromWall, toWall] — "what was running during this stall". */
function topInWindow(profile, times, fromWall, toWall, n = 5) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    if (times[i] < fromWall || times[i] > toWall) continue;
    const cf = byId.get(profile.samples[i])?.callFrame; if (!cf) continue;
    const url = (cf.url || '').replace(/^.*\/(dist|src|node_modules|app\.asar)\//, '$1/');
    const key = `${cf.functionName || '(anonymous)'} ${url}${cf.lineNumber >= 0 ? `:${cf.lineNumber + 1}` : ''}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => `${Math.round(ms)}ms ${k}`);
}

/** Every descendant of `root` by parent pid — catches short-lived helpers (git,
 *  claude, shells) whose command lines never mention a rig path. Read-only. */
function descendants(root) {
  const kids = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(Number(d));
    } catch { /* exited */ }
  }
  const out = [root]; for (let i = 0; i < out.length; i++) out.push(...(kids.get(out[i]) ?? []));
  return out;
}

function procKind(cmd) {
  const t = /--type=([a-z-]+)/.exec(cmd); if (t) return t[1];
  const exe = (cmd.split(' ')[0] || '').split('/').pop();
  if (cmd.includes('linux-unpacked/youcoded') && !t) return 'main';
  return exe || 'other';
}

async function profileBoot(build, fixture, label, windowMs) {
  const launching = launchApp({ binary: build.binary, appDir: build.appDir, fixture, extraArgs: [`--inspect-brk=127.0.0.1:${INSPECT_PORT}`] });
  launching.catch(() => {});
  const mainCdp = await attachMainInspector();
  await mainCdp.send('Profiler.enable');
  await mainCdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await mainCdp.send('Profiler.start');
  const mainStartWall = Date.now();
  await mainCdp.send('Runtime.runIfWaitingForDebugger');
  const app = await launching;
  // Time zero is the moment the main process was let go, not the spawn: the
  // inspector pause before it is the rig's, not the app's.
  const zero = mainStartWall;
  try {
    const timeOrigin = (await app.cdp.send('Runtime.evaluate', { expression: FRAMES_JS, returnByValue: true })).result.value;
    await app.cdp.send('Runtime.evaluate', { expression: HEARTBEAT_JS, returnByValue: true });
    await app.cdp.send('Profiler.enable');
    await app.cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await app.cdp.send('Profiler.start');
    const rendStartWall = Date.now();
    const attachedAt = rendStartWall - zero;

    // Per-process CPU every 250 ms, and every program the app starts.
    const seen = new Map(); const cpuBuckets = new Map(); let prev = new Map();
    const HZ = 100;
    while (Date.now() - zero < windowMs) {
      const now = Date.now() - zero;
      for (const pid of new Set([...descendants(app.pid), ...findFamily(app.familyNeedles)])) {
        let cmd = ''; let ticks = 0;
        try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'latin1').replace(/\0/g, ' ').trim(); } catch { continue; }
        try { const st = readFileSync(`/proc/${pid}/stat`, 'utf8'); const r = st.slice(st.lastIndexOf(')') + 2).split(' '); ticks = Number(r[11]) + Number(r[12]); } catch { continue; }
        if (!seen.has(pid)) seen.set(pid, { firstSeen: now, kind: procKind(cmd), cmd: cmd.replaceAll(fixture.home, '~').slice(0, 160) });
        const d = ticks - (prev.get(pid) ?? ticks);
        prev.set(pid, ticks);
        const sec = Math.floor(now / 1000); const kind = seen.get(pid).kind;
        const b = cpuBuckets.get(sec) ?? {}; b[kind] = (b[kind] ?? 0) + (d / HZ) * 1000; cpuBuckets.set(sec, b);
      }
      await sleep(250);
    }

    // Idle CPU by Chromium process TYPE over the window's last 10 s, from the
    // browser's own process list (renderer vs GPU vs utility — /proc cmdlines
    // cannot tell a zygote-forked renderer from its zygote).
    const idleByType = await (async () => {
      try {
        const ver = await (await fetch(`http://127.0.0.1:${app.cdpPort}/json/version`)).json();
        const b = await connect(ver.webSocketDebuggerUrl);
        const snap = async () => (await b.send('SystemInfo.getProcessInfo')).processInfo;
        const a0 = await snap(); await sleep(10_000); const a1 = await snap();
        b.close();
        const out = {};
        // cpuTime is cumulative seconds; over 10 s, Δs × 10 = percent of one core.
        for (const p of a1) { const q = a0.find((x) => x.id === p.id); if (q) out[p.type] = (out[p.type] ?? 0) + (p.cpuTime - q.cpuTime) * 10; }
        for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
        return out;
      } catch (e) { return { error: String(e) }; }
    })();
    // What keeps the screen repainting while idle: running animations, and the
    // blurred surfaces that make every repaint beneath them expensive.
    const onScreen = await (async () => {
      const r = await app.cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const desc = (el) => el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')) : '?';
        const anims = document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({
          name: a.animationName || a.id || a.constructor.name, target: desc(a.effect && a.effect.target),
          infinite: !!(a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity),
        }));
        let blurred = 0; const blurSamples = [];
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el); const f = cs.backdropFilter || cs.webkitBackdropFilter;
          if (f && f !== 'none') { const r = el.getBoundingClientRect(); if (r.width && r.height) { blurred++; if (blurSamples.length < 8) blurSamples.push(desc(el) + ' ' + f + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } }
        }
        const canvases = [...document.querySelectorAll('canvas')].map((c) => desc(c) + ' ' + c.width + 'x' + c.height);
        return { anims, blurred, blurSamples, canvases, videos: document.querySelectorAll('video').length };
      })()` });
      return r.result.value;
    })();
    const { profile: mainProf } = await mainCdp.send('Profiler.stop');
    const { profile: rendProf } = await app.cdp.send('Profiler.stop');
    const r = async (e) => (await app.cdp.send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
    const frames = (await r('window.__frames')) ?? [];
    const longtasks = (await r('window.__longtasks')) ?? [];
    const hb = (await r('window.__hb')) ?? [];
    const rendMarks = (await r(`performance.getEntriesByType('mark').map(m => [m.name, m.startTime])`)) ?? [];

    const profDir = join(SCRATCH, 'profiles'); mkdirSync(profDir, { recursive: true });
    writeFileSync(join(profDir, `${label}-main.cpuprofile`), JSON.stringify(mainProf));
    writeFileSync(join(profDir, `${label}-renderer.cpuprofile`), JSON.stringify(rendProf));

    const mainTimes = sampleTimes(mainProf, mainStartWall);
    const rendTimes = sampleTimes(rendProf, rendStartWall);
    const rel = (wall) => Math.round(wall - zero);
    const tasks = longtasks.map(([st, dur]) => ({ at: rel(timeOrigin + st), ms: Math.round(dur) }));
    const longTasks = tasks.filter((t) => t.ms >= 100).map((t) => ({
      ...t, top: topInWindow(rendProf, rendTimes, zero + t.at, zero + t.at + t.ms),
    }));
    const gaps = frames.map(([st, d]) => ({ at: rel(timeOrigin + st), ms: Math.round(d) })).filter((g) => g.ms > 50);
    const hbSlow = hb.filter(([, rtt]) => rtt > 150).map(([end, rtt]) => ({ at: rel(end - rtt), ms: rtt }));
    const mainStalls = hbSlow.map((h) => ({ ...h, top: topInWindow(mainProf, mainTimes, zero + h.at, zero + h.at + h.ms) }));

    return {
      label, mode: 'profile', windowMs, attachedAt, idleCpuPctByType: idleByType, onScreen,
      rendererMarks: rendMarks.map(([n, st]) => ({ name: n, at: rel(timeOrigin + st) })),
      mainMarks: readMarks(fixture.perfLog, zero).map(({ name, at }) => ({ name, at })),
      frames: {
        count: frames.length,
        over50: gaps.length, over100: gaps.filter((g) => g.ms > 100).length,
        worst: [...gaps].sort((a, b) => b.ms - a.ms).slice(0, 20),
      },
      longTaskCount: tasks.length, longTaskTotalMs: tasks.reduce((n, t) => n + t.ms, 0),
      longTasksError: await r('window.__longtasksError ?? null'),
      longTasks,
      mainStalls,
      mainTop: topInWindow(mainProf, mainTimes, 0, Infinity, 30),
      rendererTop: topInWindow(rendProf, rendTimes, 0, Infinity, 30),
      cpuPerSecondMs: Object.fromEntries([...cpuBuckets.entries()].map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))])),
      processes: [...seen.entries()].map(([pid, v]) => ({ pid, ...v })),
    };
  } finally {
    try { mainCdp.close(); } catch {}
    await app.kill();
  }
}

async function oneBoot(build, fixture, label) {
  const app = await launchApp({ binary: build.binary, appDir: build.appDir, fixture });
  try {
    await app.cdp.send('Runtime.evaluate', { expression: HEARTBEAT_JS, returnByValue: true });
    await waitFor(app.cdp, `performance.getEntriesByType('mark').some(m => m.name === 'yc:sessions-listed')`, { timeoutMs: 180_000 });
    const listedAt = Date.now() - app.spawnedAt;
    log(`${label}: session list up at ${listedAt} ms — opening Resume`);
    const firstBrowse = await timedBrowse(app.cdp, 300_000);
    log(`${label}: first Resume load ${firstBrowse.ms} ms (${firstBrowse.rows} rows)`);

    // Wait for the detached launch work to finish (or 5 min), then time a second open.
    const deadline = Date.now() + 300_000;
    let settled = false;
    while (Date.now() < deadline) {
      const names = new Set(readMarks(fixture.perfLog, app.spawnedAt).map((m) => m.name));
      if (SETTLE_MARKS.every((n) => names.has(n))) { settled = true; break; }
      await sleep(1000);
    }
    await sleep(3000);
    const laterBrowse = await timedBrowse(app.cdp, 300_000);
    log(`${label}: later Resume load ${laterBrowse.ms} ms (background work ${settled ? 'settled' : 'NOT settled after 5 min'})`);

    const hb = (await app.cdp.send('Runtime.evaluate', { expression: 'window.__hb', returnByValue: true })).result.value ?? [];
    const marks = readMarks(fixture.perfLog, app.spawnedAt);
    return {
      label, listedAt, settled,
      firstBrowse: { ...firstBrowse, at: firstBrowse.startedAt - app.spawnedAt },
      laterBrowse: { ...laterBrowse, at: laterBrowse.startedAt - app.spawnedAt },
      heartbeat: heartbeatStats(hb, app.spawnedAt),
      marks: marks.map(({ name, at, ...rest }) => ({ name, at, ...Object.fromEntries(Object.entries(rest).filter(([k]) => !['t', 'pid'].includes(k))) })),
      desktopLogErrors: (() => { try { return readFileSync(join(fixture.home, '.claude', 'desktop.log'), 'utf8').split('\n').filter((l) => l.includes('"level":"ERROR"')); } catch { return []; } })(),
    };
  } finally {
    await app.kill();
  }
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const build = await buildApp(cfg.checkout, { skipIfFresh: true });
  log(`build ${build.sha?.slice(0, 7)}${build.dirty ? ' (dirty)' : ''} → ${build.binary}`);
  await startXvfb();
  const fixture = buildFixture(SCRATCH, { log });
  const t0 = Date.now();
  overlayRealHistory(fixture.home);
  if (cfg.realLook) overlayRealLook(fixture.home);
  log(`copied real history${cfg.realLook ? ' + look' : ''} into ${fixture.home} in ${Date.now() - t0} ms`);

  const boot = cfg.profile ? (b, f, l) => profileBoot(b, f, l, cfg.windowMs) : oneBoot;
  const boots = [];
  try {
    boots.push(await boot(build, fixture, 'cold'));
    for (let i = 1; i <= cfg.warmBoots; i++) {
      writeFileSync(fixture.perfLog, '');      // each boot's marks stand alone
      boots.push(await boot(build, fixture, `warm-${i}`));
    }
  } finally {
    if (!cfg.keep) rmSync(fixture.home, { recursive: true, force: true });
  }
  const report = { at: new Date().toISOString(), build: { sha: build.sha, dirty: build.dirty }, realLook: cfg.realLook, profile: cfg.profile, boots };
  const out = cfg.out ?? join(ROOT, 'perf-reports', `real-scale-startup-${report.at.replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  log(`report → ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
