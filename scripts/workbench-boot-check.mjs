#!/usr/bin/env node
// Headless boot check for the UI Workbench.
//
// WHY THIS EXISTS: on 2026-07-29 the full desktop suite (3958 tests) and
// `tsc --noEmit` were both green while the workbench crashed at boot with
// "window.claude?.getIncognito is not a function". Unit tests assert the mock's
// channels in isolation; nothing asserted that the REAL app can actually mount
// against it. This script does, and it found three separate boot-breakers in a
// row (a bare top-level callable, a subscription registrar returning a Promise,
// and firstRun's `[]` routing the app into the onboarding wizard).
//
// Run it after ANY change to the mock shim, and before claiming the workbench
// works. It is not a substitute for Destin's visual pass — it proves the app
// mounts without errors, not that it looks right.
//
// KNOWN BLIND SPOT, measured rather than assumed: this only exercises MOUNT.
// Re-introducing the `on[A-Z]` registrar bug (a Promise where React expects an
// effect cleanup) does NOT fail this script, because a Promise-as-cleanup only
// throws when something UNMOUNTS and a static page load never does. That class
// is covered by tests/workbench-shim-semantics.test.ts instead. Treat the two
// as complementary: unit tests pin channel SHAPES, this pins that the real app
// can mount against them at all.
//
// Usage:
//   bash scripts/run-workbench.sh <worktree>          # in another terminal
//   node scripts/workbench-boot-check.mjs [port]      # default 5233
//
// Requires a Chrome/Chromium binary; it launches its own headless instance on a
// scratch profile and cleans it up.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.argv[2] ?? '5233';
// One Chrome debugging port per workbench port: two sessions running boot checks
// against different worktrees (5233 and 5243, 2026-08-25) shared 9977, the second
// attached to the first's Chrome and hung for 40 minutes. Override with
// BOOT_CHECK_CDP_PORT if a port is taken.
const CDP_PORT = Number(process.env.BOOT_CHECK_CDP_PORT ?? 9977 + (Number(PORT) - 5173));
// A boot check that cannot finish is a failure, not a wait: cap the whole run.
setTimeout(() => { console.error('boot-check: timed out after 4 minutes'); process.exit(1); }, 240000).unref();
const BASE = `http://127.0.0.1:${PORT}/?mode=workbench`;

// Every surface the workbench can show. A boot failure in any one of them is a
// failure — `default` alone would have missed the firstRun crash on a machine
// where the mock happened to resolve differently.
const ROUTES = [
  ['parent frame (toolbar)', ''],
  ['app · default', '&child=1&scenario=default'],
  ['app · empty', '&child=1&scenario=empty'],
  ['app · no-providers', '&child=1&scenario=no-providers'],
  ['app · refused', '&child=1&scenario=refused'],
  ['app · stress', '&child=1&scenario=stress'],
  ['tool gallery', '&child=1&view=tools'],
  ['comparisons', '&child=1&view=compare'],
  ['assistant settings', '&child=1&view=assistant-final'],
  // The parked-turn opt-in (toolbar "Stalled turn" toggle → ?stalled=1). It
  // replays the fixture's `{"type":"stalled"}` line, which is the ONLY way the
  // red "Provider may have stalled" card, its live count-up timer and its
  // Retry/Stop buttons render in the workbench. Off by default (see
  // fixture-loader.ts), so without a route here that whole surface — a
  // component with a setInterval and two IPC-firing buttons — had no standing
  // boot guard at all. Two routes because the toolbar itself renders the
  // toggle: the parent frame proves the control mounts, the child proves the
  // card it summons does.
  ['parent frame · stalled toggle on', '&stalled=1'],
  ['app · default + stalled turn', '&child=1&scenario=default&stalled=1'],
  // `?firstRun=<STEP>` (mock-shim.ts) renders the onboarding wizard, which no
  // click can reach once setup is complete. Added 2026-08-25 with the UI-review
  // rig so the wizard is a standing route rather than a surface nobody sees.
  ['app · first-run wizard', '&child=1&scenario=default&firstRun=AUTHENTICATE'],
];

const CHROME = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'];

function findChrome() {
  for (const bin of CHROME) {
    const { status } = spawnSync('which', [bin], { stdio: 'ignore' });
    if (status === 0) return bin;
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('No Chrome/Chromium binary found (tried: ' + CHROME.join(', ') + ')');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'workbench-boot-'));
const proc = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const cleanup = () => {
  proc.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);

async function waitForCdp() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

async function checkRoute(url) {
  const target = await (await fetch(
    `http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' },
  )).json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails?.exception?.description
        ?? msg.params.exceptionDetails?.text ?? 'unknown exception');
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  // Long enough for the 3s firstRun timeout and the classifier's first tick.
  await new Promise((r) => setTimeout(r, 6000));

  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      failedToStart: document.body.innerText.includes('failed to start'),
      message: document.body.innerText.slice(0, 200),
      stillBooting: !!document.getElementById('boot'),
    })`,
    returnByValue: true,
  });

  ws.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`);
  return { ...JSON.parse(probe.result.value ?? '{}'), errors };
}

await waitForCdp();

let failed = 0;
for (const [label, query] of ROUTES) {
  const r = await checkRoute(BASE + query);
  // `stillBooting` catches the case the error boundary never runs because the
  // module graph failed to load at all — the #boot spinner is still in the DOM.
  const bad = r.failedToStart || r.stillBooting || r.errors.length > 0;
  if (bad) {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (r.failedToStart) console.log(`      error boundary: ${r.message.replace(/\n/g, ' | ')}`);
    if (r.stillBooting) console.log('      never mounted (boot spinner still present)');
    for (const e of [...new Set(r.errors)].slice(0, 5)) {
      console.log(`      ${e.split('\n')[0]}`);
    }
  } else {
    console.log(`ok    ${label}`);
  }
}

console.log(failed === 0
  ? `\nAll ${ROUTES.length} workbench routes mount cleanly.`
  : `\n${failed}/${ROUTES.length} routes failed.`);
process.exit(failed === 0 ? 0 : 1);
