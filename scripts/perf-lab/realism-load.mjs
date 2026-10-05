// scripts/perf-lab/realism-load.mjs — a "busy desktop" for the real-use lab.
//
// WHY: the owner's hitch burst coincided with other heavy work on the machine (a browser, VMs, builds). The lab used to run on a
// quiet machine. This starts a PRIVATE background load, on the lab's own invisible display only, so a cell can be measured with
// and without contention:
//   1. four CPU hogs, each busy ~35% of the time (a 35 ms burn every 100 ms) ~ "something compiling or a VM idling"
//   2. a browser-like page: a full-window canvas animation at 60 fps plus a few glass layers (gpu-control/control.html) in a
//      private Chrome profile — the GPU and compositor are shared with the app under test, as on his desktop.
// Everything started here is killed by PID (never by name). It never touches the owner's browser, profile or display.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The hog: burn `burnMs` of every `periodMs` on one core. Atomics.wait is a true sleep, so the cost is the burn, not the sleep.
export const HOG_SOURCE = `
const sab = new Int32Array(new SharedArrayBuffer(4));
const burn = ${35}, period = ${100};
for (;;) { const e = Date.now() + burn; while (Date.now() < e); Atomics.wait(sab, 0, 0, period - burn); }
`;

export const CHROME_BIN = '/usr/bin/google-chrome-stable';

/**
 * Start the load. `display`: { kind:'x11', display:':99' } or { kind:'wayland', socketName, runtimeDir }.
 * Returns { pids, stop(), describe }. `hogs` and `canvasPage` can be turned off for tests.
 */
export async function startBusyDesktop({ display, workDir, controlHtml, hogs = 4, browser = true, log = () => {} }) {
  const procs = [];
  const info = { hogs: 0, browser: false, browserPid: null };
  for (let i = 0; i < hogs; i++) {
    const p = spawn(process.execPath, ['-e', HOG_SOURCE], { stdio: 'ignore', detached: false });
    procs.push(p); info.hogs++;
  }
  if (browser) {
    if (!existsSync(CHROME_BIN)) log('busy desktop: no google-chrome-stable; the browser-like load is skipped');
    else {
      const profile = join(workDir, 'chrome-profile');
      mkdirSync(profile, { recursive: true });
      const env = { PATH: process.env.PATH, HOME: workDir };
      const args = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--no-sandbox', `--app=file://${controlHtml}?n=3&mode=bubbles&canvas=1&fps=60&spin=1`, '--window-size=1280,800'];
      if (display.kind === 'x11') { env.DISPLAY = display.display; args.push('--ozone-platform=x11'); }
      else { env.WAYLAND_DISPLAY = display.socketName; env.XDG_RUNTIME_DIR = display.runtimeDir; args.push('--ozone-platform=wayland'); }
      // Refuse to ever point at the owner's session (a Wayland socket under /run/user, or the real X display).
      if ((env.XDG_RUNTIME_DIR ?? '').startsWith('/run/user/')) throw new Error('busy desktop: refusing the real runtime dir');
      if (env.DISPLAY && !/^:\d+$/.test(env.DISPLAY)) throw new Error('busy desktop: unexpected DISPLAY');
      const p = spawn(CHROME_BIN, args, { env, stdio: 'ignore', detached: true });
      procs.push(p); info.browser = true; info.browserPid = p.pid;
      await sleep(2500);
    }
  }
  const pids = procs.map(p => p.pid);
  return {
    pids, info,
    async stop() {
      for (const p of procs) { try { if (p.pid === info.browserPid) process.kill(-p.pid, 'SIGTERM'); else p.kill('SIGTERM'); } catch { /* gone */ } }
      await sleep(1000);
      for (const p of procs) { try { if (p.pid === info.browserPid) process.kill(-p.pid, 'SIGKILL'); else p.kill('SIGKILL'); } catch { /* gone */ } }
      try { rmSync(join(workDir, 'chrome-profile'), { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}
