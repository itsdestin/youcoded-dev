#!/usr/bin/env node
// scripts/perf-lab/gpu-bind-run.mjs — ONE bounded launch of an app candidate on the supervised private
// compositor, with the renderer verdict and an after-run cleanup proof. Calls only the supported join
// (gpu-bind.mjs); it never names the owner's Wayland socket, DISPLAY or session bus.
//
//   node scripts/perf-lab/gpu-bind-run.mjs --checkout <abs approved checkout> --app-dir <abs linux-unpacked> \
//        --evidence-dir <abs NEW dir> --fixture-root <abs NEW dir containing /perf-lab/> [--cdp-port 9591]
//
// Wrap it in `timeout --kill-after=10 <=180` when running for real (the compositor itself is capped at 60 s).
// Exit 0 = hardware renderer proven AND cleanup proven. Exit 3 = software/unknown renderer (labelled, not GPU
// evidence). Exit 2 = anything else.
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { buildFixture } from './fixture.mjs';
import { acquireGpuBinding, verifyBindingCleanup, readGpuEvidence } from './gpu-bind.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { assertPortsFree } from './gpu-cost.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export function parseBindArgs(argv) {
  const known = ['--checkout', '--app-dir', '--evidence-dir', '--fixture-root', '--cdp-port'], o = { cdpPort: 9591 }, seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[++i];
    if (!known.includes(k) || seen.has(k) || typeof v !== 'string' || !v || v.startsWith('--')) throw Error(`Unknown/duplicate/missing option ${k}`);
    seen.add(k); o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const key of ['checkout', 'appDir', 'evidenceDir', 'fixtureRoot']) if (typeof o[key] !== 'string' || !isAbsolute(o[key]) || resolve(o[key]) !== o[key]) throw Error(`--${key} must be a canonical absolute path`);
  if (!o.fixtureRoot.includes('/perf-lab/')) throw Error('--fixture-root must contain /perf-lab/ (supervisor run-directory rule)');
  o.cdpPort = Number(o.cdpPort); if (!Number.isInteger(o.cdpPort) || o.cdpPort < 1024 || o.cdpPort > 65535) throw Error('Invalid --cdp-port');
  return o;
}

export async function runOnce(o) {
  const report = { status: 'incomplete', startedAt: new Date().toISOString(), options: o, steps: {} };
  let binding, app, primary;
  try {
    refusePackageProcesses(o.appDir);
    await assertPortsFree([10000, 10020, o.cdpPort]);
    binding = await acquireGpuBinding({ checkout: o.checkout, appDir: o.appDir, evidenceDir: o.evidenceDir });
    report.steps.compositor = { socket: binding.socketPath, refreshHz: binding.inspection.observed.refreshHz, output: binding.inspection.observed.name, modeVerified: true };
    mkdirSync(o.fixtureRoot, { recursive: false, mode: 0o700 });
    const fixture = buildFixture(o.fixtureRoot, { checkout: o.checkout, seedEngine: false, historySizes: { small: 12 }, decoyCount: 0, fakeProvider: false, log() {} });
    app = await binding.launchApp({ fixture, cdpPort: o.cdpPort });
    report.steps.app = { pid: app.pid, cdpPort: app.cdpPort, ozone: 'wayland (private socket only)' };
    await sleep(3000); // let the first frames reach the GPU process before it is asked who it is
    const { renderer, evidence } = await readGpuEvidence(app);
    report.renderer = renderer; report.gpuEvidence = evidence;
  } catch (error) { primary = error; report.error = String(error?.message ?? error); }
  finally {
    try { if (app) report.steps.appKill = { cleanupConfirmed: (await app.kill())?.cleanupConfirmed === true }; }
    catch (error) { report.steps.appKill = { cleanupConfirmed: false, error: String(error?.message ?? error) }; }
    if (binding) {
      try { report.cleanup = await verifyBindingCleanup(binding, { appPackageDir: o.appDir }); }
      catch (error) { report.cleanup = { ok: false, error: String(error?.message ?? error) }; }
    } else if (primary?.cleanup) report.cleanup = { ok: primary.cleanup.cleanupConfirmed === true, compositorOnly: primary.cleanup };
  }
  report.status = report.cleanup?.ok === true && report.gpuEvidence?.hardware === true && !primary ? 'hardware-verified' : report.gpuEvidence ? 'not-hardware-or-cleanup-failed' : 'incomplete';
  // WHY try: an early refusal (before the compositor made the evidence dir) must still return its report.
  try { writeFileSync(join(o.evidenceDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); } catch (error) { report.writeError = String(error.message); }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  runOnce(parseBindArgs(process.argv.slice(2))).then(r => {
    console.log(JSON.stringify({ status: r.status, renderer: r.gpuEvidence ?? null, cleanup: r.cleanup ? { ok: r.cleanup.ok, gone: r.cleanup.gone } : null, error: r.error ?? null }, null, 2));
    process.exitCode = r.status === 'hardware-verified' ? 0 : r.gpuEvidence && r.cleanup?.ok ? 3 : 2;
  }).catch(e => { console.error(e); process.exitCode = 2; });
}
