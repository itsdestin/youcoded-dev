// The Office editor for pictures: shoot starts desktop/scripts/office-workbench-server.mjs
// itself when a screen it photographs needs the editor (tag `office`), and stops it afterwards.
//
// WHY (Task 9 fix round 1): verify.sh's `shoot --check` photographs office/* screens, and they
// only show a document when the editor server answers on 127.0.0.1:4717. It used to be a server
// someone had started by hand and left running — invisible state, so verify.sh was green only on
// a machine that happened to have one. Now shoot owns it for the length of the run.
//
// A server already answering for THIS checkout is reused and left running (another run, or a
// person's workbench, owns it). One answering for another checkout is refused with its folder
// named, because pictures from it would show a different build of the editor.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'http://127.0.0.1:4717';
const START_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function whoServes() {
  try {
    const r = await fetch(`${ORIGIN}/yc-workbench-info`, { signal: AbortSignal.timeout(2000) });
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

/** Makes sure the editor answers for `checkout`. Returns { stop() } — a no-op unless this call started it. */
export async function ensureOfficeEditor(checkout, log = () => {}) {
  const desktop = join(checkout, 'desktop');
  const there = await whoServes();
  if (there) {
    if (there.desktop === desktop) { log('office editor: reusing the server already running for this checkout'); return { stop() {} }; }
    throw new Error(`port 4717 is held by ${there.desktop ? `the office editor of ${there.desktop}` : there.other} — stop it (by its pid) and run again`);
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
  const child = spawn(process.execPath, ['scripts/office-workbench-server.mjs'], { cwd: desktop, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  for (const t0 = Date.now(); Date.now() - t0 < START_MS; await sleep(200)) {
    const now = await whoServes();
    if (now?.desktop === desktop) {
      log(`office editor: started (pid ${child.pid})`);
      return { stop() { if (exited === null) child.kill(); } };
    }
    if (exited !== null) break;
  }
  if (exited === null) child.kill();
  throw new Error(`the office editor server did not start within ${START_MS / 1000}s${exited !== null ? ` (exit ${exited})` : ''}${stderr ? `:\n${stderr.trim()}` : ''}`);
}
