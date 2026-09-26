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
import { waitFor } from './cdp.mjs';

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
  const cfg = { checkout: join(ROOT, 'youcoded'), warmBoots: 1, keep: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--checkout') cfg.checkout = resolve(argv[++i]);
    else if (a === '--warm-boots') cfg.warmBoots = Number(argv[++i]);
    else if (a === '--keep') cfg.keep = true;
    else if (a === '--out') cfg.out = resolve(argv[++i]);
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
  log(`copied real history into ${fixture.home} in ${Date.now() - t0} ms`);

  const boots = [];
  try {
    boots.push(await oneBoot(build, fixture, 'cold'));
    for (let i = 1; i <= cfg.warmBoots; i++) {
      writeFileSync(fixture.perfLog, '');      // each boot's marks stand alone
      boots.push(await oneBoot(build, fixture, `warm-${i}`));
    }
  } finally {
    if (!cfg.keep) rmSync(fixture.home, { recursive: true, force: true });
  }
  const report = { at: new Date().toISOString(), build: { sha: build.sha, dirty: build.dirty }, boots };
  const out = cfg.out ?? join(ROOT, 'perf-reports', `real-scale-startup-${report.at.replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  log(`report → ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
