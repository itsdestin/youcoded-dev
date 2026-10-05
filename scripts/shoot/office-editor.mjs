// The Office editor for pictures: shoot starts desktop/scripts/office-workbench-server.mjs
// itself when a screen it photographs needs the editor (tag `office`), and stops it afterwards.
//
// WHY (Task 9 fix round 1): verify.sh's `shoot --check` photographs office/* screens, and they
// only show a document when the editor server answers (127.0.0.1:4717, or the port below). It used to be a server
// someone had started by hand and left running — invisible state, so verify.sh was green only on
// a machine that happened to have one. Now shoot owns it for the length of the run.
//
// A server already answering for THIS checkout is reused and left running (another run, or a
// person's workbench, owns it). One answering for another checkout is left alone and this
// checkout gets its own server on a free port, because pictures from someone else's would show
// a different build of the editor.
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
    if (there.desktop === desktop) { log('office editor: reusing the server already running for this checkout'); return { port, stop() {} }; }
    // Someone else's editor (another worktree's, or an old one). Never stopped from here — it is
    // not ours — and never used: its pictures would show a different build of the editor.
    port = await freePort();
    log(`office editor: port ${DEFAULT_PORT} is held by ${there.desktop ? `the office editor of ${there.desktop}` : there.other} — starting this checkout's own on ${port}`);
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
  const child = spawn(process.execPath, ['scripts/office-workbench-server.mjs'], { cwd: desktop, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, YC_OFFICE_PORT: String(port) } });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  for (const t0 = Date.now(); Date.now() - t0 < START_MS; await sleep(200)) {
    const now = await whoServes(port);
    if (now?.desktop === desktop) {
      log(`office editor: started on ${port} (pid ${child.pid})`);
      return { port, stop() { if (exited === null) child.kill(); } };
    }
    if (exited !== null) break;
  }
  if (exited === null) child.kill();
  throw new Error(`the office editor server did not start within ${START_MS / 1000}s${exited !== null ? ` (exit ${exited})` : ''}${stderr ? `:\n${stderr.trim()}` : ''}`);
}
