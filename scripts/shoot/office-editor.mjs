// The Office editor for pictures: shoot starts desktop/scripts/office-workbench-server.mjs
// itself when a screen it photographs needs the editor (tag `office`), and stops it afterwards.
//
// WHY (Task 9 fix round 1): verify.sh's `shoot --check` photographs office/* screens, and they
// only show a document when the editor server answers (127.0.0.1:4717, or the port below). It used to be a server
// someone had started by hand and left running — invisible state, so verify.sh was green only on
// a machine that happened to have one. Now shoot owns it for the length of the run.
//
// A server already answering on the usual port is left alone — whoever started it owns it and
// may stop it at any moment — and this run gets its own server on a free port (see
// ensureOfficeEditor for why even this checkout's own is not reused).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// WHY a port of its own when 4717 is taken (marketplace-detail friction, proposal 4): the editor
// listened only on 4717, so while ANOTHER session's editor held it, every `shoot --check` (and so
// every verify.sh) in this worktree failed for hours — and the only way out it offered was to stop
// a process that was not ours. Skipping the Office screens would have made verify green by
// photographing less; a free port keeps them covered. 4717 stays the first choice, so a person's
// running workbench (which expects it) still shares one server.
const DEFAULT_PORT = 4717;
const START_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A port nothing is listening on right now (the OS picks it). */
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((res, rej) => {
    const s = createServer(); s.unref(); s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

async function whoServes(port = DEFAULT_PORT) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/yc-workbench-info`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { other: 'an older editor server with no identity (started before fix round 1)' };
    return await r.json();
  } catch {
    return null; // nothing listening
  }
}

/** The compiled main-process modules the server imports, rebuilt when their sources are newer. */
function ensureMainBuild(desktop, log) {
  const names = ['x2t', 'office-protocol', 'theme-fonts', 'office-sessions'];
  const stale = names.some((n) => {
    const src = join(desktop, 'src/main/office', `${n}.ts`);
    const out = join(desktop, 'dist/main/office', `${n}.js`);
    return !existsSync(out) || (existsSync(src) && statSync(src).mtimeMs > statSync(out).mtimeMs);
  });
  if (!stale) return;
  log('office editor: compiling the main process (its office modules changed)');
  execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { cwd: desktop, stdio: ['ignore', 'ignore', 'pipe'] });
}

/** Makes sure the editor answers for `checkout`. Returns { port, stop() } — `stop` is a no-op
 *  unless this call started it; `port` is where the practice app must look (shoot passes it as
 *  `?officePort=`). */
export async function ensureOfficeEditor(checkout, log = () => {}) {
  const desktop = join(checkout, 'desktop');
  let port = DEFAULT_PORT;
  const there = await whoServes(port);
  if (there) {
    // WHY never reuse, not even this checkout's own (2026-10-13): the server on 4717 belongs to
    // whoever started it — usually ANOTHER shoot run of this same checkout (two verify.sh runs, or
    // a verify and a deck build, overlapping) — and that run stops it when it finishes. A run that
    // reused it lost its editor mid-run: every screen that draws a document (office/document,
    // office/spreadsheet, chat/files/edit/*, …) then failed together at its 20 s limit, "its mark
    // is not on the page". Measured over this worktree's verify logs: 6 of 10 runs that reused
    // the server lost editor screens (4 lost all six, every one "mark not on the page"); of 15
    // that started their own, none did (one lost them to a browser stall that hit every
    // screen, a different failure). It looked like
    // load (it came with load above ~50) only because overlapping runs are what make the load.
    // Never stopped from here — it is not ours — and never used.
    port = await freePort();
    log(`office editor: port ${DEFAULT_PORT} is held by ${there.desktop === desktop ? 'another run of this checkout (it stops it when it ends)' : there.desktop ? `the office editor of ${there.desktop}` : there.other} — starting this run's own on ${port}`);
  }
  if (!existsSync(join(desktop, 'office-addon', 'manifest.json'))) {
    // WHY fetch here (2026-10-03): office-addon/ is downloaded, not in git, so every fresh
    // worktree lacked it once Office merged, and `verify.sh`'s screens check failed in every new
    // session until someone fetched it by hand. The pinned, checksum-verified download is the
    // same one `npm run dev` does; offline it still ends in the error below.
    log('office editor: no add-on in this checkout yet — fetching the pinned one');
    try {
      execFileSync(process.execPath, ['scripts/fetch-office.mjs'], { cwd: desktop, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch { /* reported just below */ }
    if (!existsSync(join(desktop, 'office-addon', 'manifest.json'))) {
      throw new Error(`no Office add-on in ${desktop}/office-addon, and fetching it failed — run \`node scripts/fetch-office.mjs\` in desktop/ to see why`);
    }
  }
  ensureMainBuild(desktop, log);
  return startEditorServer({ desktop, port, log });
}

// ─── Starting our own server, and only ever using our own ───────────────────
// WHY (final review F23, 2026-10-13): two runs that started at the same moment both saw 4717
// free and both started a server there. The loser's child died on "address in use", but its
// wait loop asked "who serves 4717?" before checking that, saw the WINNER's server for the same
// checkout, and took it as its own (with a stop() that did nothing) — the very sharing the
// never-reuse rule above exists to prevent. A server is now ours only when it reports OUR child's
// pid (the server says its pid in /yc-workbench-info) while that child is alive; when our child
// dies before answering, we try again on a port the OS has just handed us.
const ATTEMPTS = 3;

/** Whether the server's identity answer is our own child's. Exported for the tests. */
export function isOurServer(info, { desktop, pid, alive }) {
  if (!info || !alive || info.desktop !== desktop) return false;
  // A server that predates the pid field (an older checkout on shoot's --before side) can't say;
  // the caller then holds off and accepts it only if our child is still alive a moment later
  // (a child that lost the port dies on "address in use" as soon as it tries to listen).
  return info.pid === undefined ? 'unproven' : info.pid === pid;
}

/** The children this process started and has not stopped — killed on exit and on Ctrl-C. */
const live = new Set();
let handlersInstalled = false;
// WHY (final review F24): every run starts its own editor on a fresh port, so a run killed by
// Ctrl-C or by a stopped verify.sh (SIGTERM) used to leave its editor running for good, one more
// per interrupted run. Node runs no `finally` and no 'exit' listener when a signal kills it by
// default, so the signals are caught here, our own children killed by pid (never by name), and
// the process then ends the way the signal would have ended it (exit code 128 + signal number).
function installCleanup() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const killAll = () => { for (const c of live) { try { process.kill(c.pid, 'SIGTERM'); } catch { /* already gone */ } } live.clear(); };
  process.on('exit', killAll);
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.once(sig, () => { killAll(); process.exit(code); });
  }
}

/** Starts `server` (default: the checkout's office-workbench-server.mjs) and waits until it answers
 *  as ours. Returns { port, pid, stop() }. `server`/`startMs` are for the tests. */
export async function startEditorServer({ desktop, port, log = () => {}, server = 'scripts/office-workbench-server.mjs', startMs = START_MS }) {
  installCleanup();
  let lastErr = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const child = spawn(process.execPath, [server], { cwd: desktop, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, YC_OFFICE_PORT: String(port) } });
    live.add(child);
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    let exited = null;
    child.on('exit', (code, signal) => { exited = code ?? signal ?? 'killed'; live.delete(child); });
    const stop = () => { if (exited === null) child.kill(); live.delete(child); };
    for (const t0 = Date.now(); Date.now() - t0 < startMs; await sleep(200)) {
      // Our child's death is checked FIRST: once it is gone, whatever answers on the port is not ours.
      if (exited !== null) break;
      const now = await whoServes(port);
      let ours = isOurServer(now, { desktop, pid: child.pid, alive: exited === null });
      if (ours === 'unproven') { await sleep(1500); ours = exited === null; }
      if (ours) {
        log(`office editor: started on ${port} (pid ${child.pid})`);
        return { port, pid: child.pid, stop };
      }
    }
    stop();
    lastErr = `the office editor server did not start within ${startMs / 1000}s${exited !== null ? ` (exit ${exited})` : ''}${stderr ? `:\n${stderr.trim()}` : ''}`;
    if (exited === null) break; // it never answered while alive — a new port won't help
    const next = await freePort();
    log(`office editor: the server on ${port} was not ours (our child exited ${exited}) — trying again on ${next}`);
    port = next;
  }
  throw new Error(lastErr);
}
