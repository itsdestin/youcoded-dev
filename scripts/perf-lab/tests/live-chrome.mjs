// scripts/perf-lab/tests/live-chrome.mjs — one headless Chrome for a LIVE proof test,
// with a launch that survives a slow CI runner.
//
// WHY (2026-09-26): the LIVE tests in layout-cost / late-content gave Chrome 12 s to
// open its debugging port, once. On the GitHub runner it sometimes has not — Chrome
// still alive, no error, just slow (roadmap dev-workspace: "Chrome never opened its
// debugging port", one master run in five). A docs-only PR went red on it. This waits
// up to 30 s and, if the port never opens, kills that Chrome and tries once more with
// a fresh profile before failing with every attempt's own startup output.
//
// Not a test file (no .test.mjs), so `node --test tests/*.test.mjs` never runs it.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTargets } from '../cdp.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stop(chrome) {
  if (chrome.exitCode !== null || chrome.signalCode !== null) return;
  await new Promise((done) => {
    const t = setTimeout(done, 5000);
    chrome.once('exit', () => { clearTimeout(t); done(); });
    chrome.kill('SIGKILL');
  });
}

/** Returns { chrome, profile, targets }. The caller still owns stopping `chrome`
 *  and removing `profile` (its existing finally block does both). */
export async function startLiveChrome(bin, port, args, profilePrefix, { attempts = 2, waitMs = 30_000 } = {}) {
  const failures = [];
  for (let a = 1; a <= attempts; a++) {
    const profile = mkdtempSync(join(tmpdir(), profilePrefix));
    const chrome = spawn(bin, [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', ...args, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    // Chrome's own startup error distinguishes a broken sandbox from a slow port bind.
    let err = '';
    chrome.stderr.on('data', (chunk) => { err = (err + chunk).slice(-8192); });
    chrome.on('error', (error) => { err = `${err}\n${error.message}`; });
    const t0 = Date.now();
    let targets = null;
    while (!targets && Date.now() - t0 < waitMs && chrome.exitCode === null && chrome.signalCode === null) {
      try { targets = await listTargets(port); } catch { await sleep(200); }
    }
    if (targets) return { chrome, profile, targets };
    failures.push(`attempt ${a}: exit=${chrome.exitCode}, signal=${chrome.signalCode}, after ${Date.now() - t0} ms: ${err}`);
    await stop(chrome);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* the OS will reap it */ }
  }
  throw new Error(`Chrome never opened its debugging port\n${failures.join('\n')}`);
}
