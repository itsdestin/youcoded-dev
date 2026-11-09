// scripts/perf-lab/gpu-bind.mjs — the SUPPORTED way to run an app candidate on the private virtual compositor.
//
// WHY THIS EXISTS. Everything needed to bind an app to the private compositor already existed in pieces:
// the compositor supervisor (SO_PEERCRED-proven socket), the launch supervisor's `waylandSocket` +
// `waylandProof` plan fields, and launchApp's `supervisedBackend`. Nothing joined them outside scratch
// drivers. This module is that join, so gpu-cost / realism / the CLI (gpu-bind-run.mjs) all use one
// reviewed path and the app can never be pointed at any socket except the proven private one.
//
// SAFETY SHAPE (unchanged proofs, only joined):
//   compositor start -> ready -> inspect (mode, owned socket, kwin pid+starttime via SO_PEERCRED)
//   -> per launch: fresh launch supervisor whose plan carries the inspected socket + proof; the launch
//   worker re-verifies the proof (inode, live peer, starttime) immediately before releasing the app
//   -> app exits through its supervisor -> compositor stops through ITS supervisor.
// The user's real session socket (wayland-0), DISPLAY and the session bus are never named here.
//
// HARDWARE VERDICT. A binding is NOT GPU evidence by itself. `gpuEvidence()` turns the Chromium
// SystemInfo reading into {hardware, countsAsGpuEvidence}; software (llvmpipe/SwiftShader), unknown or
// non-Radeon renderers are labelled and never counted. Callers must carry that field into reports.
import { readFileSync, readdirSync, readlinkSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { startCompositorSupervisor } from './supervised-compositor-controller.mjs';
import { writeCompositorJson } from './supervised-compositor-linux.mjs';
import { startLaunchSupervisor } from './supervised-launch.mjs';
import { launchApp } from './launch.mjs';
import { readRendererInfo } from './gpu.mjs';
import { rendererVerdict } from './gpu-cost-parse.mjs';
import { COMPOSITOR_CAPS, COMPOSITOR_WALL_MAX_MS } from './supervised-compositor-policy.mjs';

const KWIN = '/usr/bin/kwin_wayland';

// WHY (2026-10-21): the compositor used to live a fixed 60 s, which no real workload fits. The lifetime is now an
// explicit, bounded parameter chosen from the requested workload plus margin and recorded in the evidence.
//   compositor wall = startup (compositor start + inspect + app launch) + workload + margin + the core's own cleanup reserve
//   app wall        = workload + margin + app cleanup reserve; the launch supervisor caps one app at 600 s.
export const GPU_LIFETIME = Object.freeze({ startupMs: 25000, marginMs: 30000, appCleanupReserveMs: 12000, appMinWallMs: 120000, appMaxWallMs: 600000 });
export function gpuLifetimeFor(workloadMs, { appWorkloadMs = workloadMs, startupMs = GPU_LIFETIME.startupMs, marginMs = GPU_LIFETIME.marginMs } = {}) {
  if (!Number.isFinite(workloadMs) || workloadMs < 0 || !Number.isFinite(appWorkloadMs) || appWorkloadMs < 0) throw Error('GPU workload budget must be a non-negative number of milliseconds');
  const raw = startupMs + workloadMs + marginMs + COMPOSITOR_CAPS.cleanupReserveMs;
  const compositorWallMs = Math.max(COMPOSITOR_CAPS.wallMs, Math.ceil(raw / 1000) * 1000);
  if (compositorWallMs > COMPOSITOR_WALL_MAX_MS) throw Error(`GPU workload budget ${Math.round(workloadMs / 1000)} s needs a ${Math.round(compositorWallMs / 1000)} s compositor lifetime, above the ${COMPOSITOR_WALL_MAX_MS / 1000} s maximum`);
  const appRaw = appWorkloadMs + marginMs + GPU_LIFETIME.appCleanupReserveMs + 20000; // 20 s: app start to first window
  const appWallMs = Math.max(GPU_LIFETIME.appMinWallMs, Math.ceil(appRaw / 1000) * 1000);
  if (appWallMs > GPU_LIFETIME.appMaxWallMs) throw Error(`GPU app budget ${Math.round(appWorkloadMs / 1000)} s needs a ${Math.round(appWallMs / 1000)} s app lifetime, above the launch supervisor's ${GPU_LIFETIME.appMaxWallMs / 1000} s cap`);
  return { workloadMs, appWorkloadMs, startupMs, marginMs, compositorWallMs, appWallMs, compositorMaxMs: COMPOSITOR_WALL_MAX_MS };
}

/** Pure: the three facts that must hold before ANY app may be bound to this inspection result. */
export function assertBindableInspection(inspection) {
  const s = inspection?.socket;
  if (inspection?.modeVerified !== true) throw Error('Compositor binding refused: output mode not verified');
  if (!s || s.owned !== true || s.pending === true || !Array.isArray(s.owners) || s.owners.length !== 1) throw Error('Compositor binding refused: socket not uniquely owned');
  if (s.ownerEvidence?.proofs?.includes('so-peercred-pid-uid-starttime') !== true) throw Error('Compositor binding refused: no SO_PEERCRED ownership proof');
  // Owner decision: the virtual output is 60 Hz. A different rate means a different (unreviewed) mode.
  if (inspection.observed?.refreshHz !== 60) throw Error(`Compositor binding refused: refresh ${inspection.observed?.refreshHz} Hz is not the approved 60 Hz`);
  return { socketPath: s.socketPath, proof: s };
}

/**
 * Pure: classify a readRendererInfo() record. `countsAsGpuEvidence` is the ONLY field a report may use to
 * decide whether numbers from this run are GPU measurements. Software is labelled, never counted.
 */
export function gpuEvidence(renderer) {
  const verdict = rendererVerdict(renderer);
  const text = String(renderer?.glRenderer ?? '');
  const software = renderer?.softwareRendering === true;
  return {
    hardware: verdict.ok === true,
    kind: verdict.ok ? 'hardware' : software ? 'software' : 'unknown-or-refused',
    countsAsGpuEvidence: verdict.ok === true && renderer?.source === 'SystemInfo',
    reason: verdict.ok ? (renderer?.source === 'SystemInfo' ? null : `renderer read via ${renderer?.source}, not SystemInfo`) : verdict.reason,
    glRenderer: text || null,
    source: renderer?.source ?? null,
    compositing: renderer?.featureStatus?.gpu_compositing ?? null,
    rasterization: renderer?.featureStatus?.rasterization ?? null,
    limits: 'Virtual 60 Hz compositor output: presentation is reported by the virtual compositor, not physical scanout, vblank or panel timing.',
  };
}

/** Every `...pid: N` (with a following starttime when present) in a text blob: recorded identities to check afterwards. */
export function recordedPids(text) {
  const found = new Map();
  for (const m of String(text).matchAll(/"(?:[a-zA-Z]*[pP]id)":(\d+)(?:,"starttime":"(\d+)")?/g)) {
    const pid = Number(m[1]);
    if (pid > 1 && (!found.has(pid) || m[2])) found.set(pid, m[2] ?? found.get(pid) ?? null);
  }
  return [...found].map(([pid, starttime]) => ({ pid, starttime }));
}
const readSafe = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const procStart = pid => { try { return readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[19]; } catch { return null; } };

/**
 * After-run proof, read-only: every recorded pid is gone (or was reused by a DIFFERENT process: starttime differs),
 * and no process still names this run's reservation / package / fixture. Never signals anything.
 */
export function verifyGone({ pids, needles, selfPids = [process.pid, process.ppid] }) {
  const alive = [], reused = [];
  for (const { pid, starttime } of pids) {
    const now = procStart(pid);
    if (now === null) continue;
    if (starttime && now !== starttime) { reused.push({ pid, recorded: starttime, now }); continue; }
    alive.push({ pid, starttime: now });
  }
  const named = [];
  for (const entry of readdirSync('/proc').filter(e => /^\d+$/.test(e))) {
    const pid = Number(entry);
    if (selfPids.includes(pid)) continue;
    let cmd = ''; try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { continue; }
    if (needles.some(n => n && cmd.includes(n))) named.push({ pid, cmd: cmd.slice(0, 160) });
  }
  return { ok: alive.length === 0 && named.length === 0, alive, reused, named };
}

/**
 * Acquire a verified private compositor. Returns a binding whose launchApp() starts supervised apps on it and
 * whose release() stops the compositor and writes retirement.json. If acquisition fails the compositor is stopped
 * before the error is rethrown (error.cleanup carries the retirement receipt).
 */
export async function acquireGpuBinding({ checkout, appDir, evidenceDir, wallMs = COMPOSITOR_CAPS.wallMs, startCompositor = startCompositorSupervisor, launchSupervisor = startLaunchSupervisor, launch = launchApp } = {}) {
  if (!evidenceDir || resolve(evidenceDir) !== evidenceDir) throw Error('acquireGpuBinding needs a canonical absolute evidenceDir');
  mkdirSync(evidenceDir, { recursive: false, mode: 0o700 }); // refuses an existing directory: evidence is never mixed
  const handle = startCompositor({ wallMs }); // explicit bounded lifetime (default 60 s); validated by compositorPlan
  const retirementPath = join(evidenceDir, 'retirement.json');
  let released = null;
  const release = async () => {
    released ??= (async () => {
      const receipt = await handle.writeRetirement(retirementPath);
      // Own reservation files only (fixed names), kept beside the receipt as evidence.
      let evidence = '';
      try { evidence = readFileSync(join(handle.reservation, 'compositor-evidence.jsonl'), 'utf8'); writeFileSync(join(evidenceDir, 'compositor-evidence.jsonl'), evidence, { flag: 'wx', mode: 0o600 }); } catch { /* evidence is best-effort; receipt above is authoritative */ }
      return { receipt, evidence };
    })();
    return released;
  };
  let inspection;
  try {
    await handle.ready;
    inspection = await handle.inspect();
    writeCompositorJson(join(evidenceDir, 'inspection.json'), inspection);
    var bindable = assertBindableInspection(inspection);
  } catch (error) {
    try { error.cleanup = (await release()).receipt; } catch (cleanup) { error.cleanup = { cleanupConfirmed: false, error: String(cleanup?.message ?? cleanup) }; }
    throw error;
  }
  const apps = [];
  return {
    handle, inspection, compositorWallMs: wallMs, socketPath: bindable.socketPath, proof: bindable.proof, evidenceDir, apps,
    /** Supervised app on the private socket. app.kill() retires the app supervisor; release() retires the compositor. */
    async launchApp({ fixture, cdpPort = 9591, wallMs = 120000, maxRssMb = 2048, cleanupReserveMs = 12000 }) {
      const binary = join(appDir, 'youcoded');
      const supervisor = await launchSupervisor({ runDir: dirname(fixture.home), fixture, binary, checkout, wallMs, maxRssMb, cleanupReserveMs, cdpPort, display: ':99', waylandSocket: bindable.socketPath, waylandProof: bindable.proof });
      let app;
      try { app = await launch({ binary, appDir, fixture, cdpPort, display: ':99', waylandSocket: bindable.socketPath, refuseExisting: true, supervisedBackend: supervisor }); }
      catch (error) { apps.push({ runDir: dirname(fixture.home), startupFailure: String(error?.message ?? error) }); throw error; }
      const record = { runDir: dirname(fixture.home), pid: app.pid };
      apps.push(record);
      const kill = app.kill;
      app.kill = async () => { const receipt = await kill(); record.receipt = receipt; return receipt; };
      return app;
    },
    release,
  };
}

/**
 * The full after-run check the validation task requires. Reads files and /proc only.
 * `appRunDirs` are the per-app supervisor run directories (their supervisor-evidence.jsonl lists the app pids).
 */
export async function verifyBindingCleanup(binding, { appPackageDir, extra = [] } = {}) {
  const { receipt, evidence } = await binding.release();
  const pids = recordedPids(evidence);
  for (const a of binding.apps) {
    for (const f of ['supervisor-evidence.jsonl']) pids.push(...recordedPids(readSafe(join(a.runDir, f))));
    if (a.receipt) pids.push(...recordedPids(JSON.stringify(a.receipt)));
  }
  const unique = [...new Map(pids.map(p => [p.pid, p])).values()];
  const needles = [binding.handle.reservation && dirname(binding.handle.reservation), appPackageDir ? join(appPackageDir, 'youcoded') : null, ...binding.apps.map(a => a.runDir), ...extra];
  const gone = verifyGone({ pids: unique, needles });
  let caps = null; try { caps = execFileSync('getcap', [KWIN], { encoding: 'utf8' }).trim(); } catch { caps = 'getcap-unavailable'; }
  const appsConfirmed = binding.apps.every(a => a.receipt?.cleanupConfirmed === true);
  return {
    compositorCleanupConfirmed: receipt.cleanupConfirmed === true,
    appCleanupConfirmed: appsConfirmed, appCount: binding.apps.length,
    recordedPidCount: unique.length, gone, getcap: caps, getcapUnchanged: caps === `${KWIN} cap_sys_nice=ep`,
    ok: receipt.cleanupConfirmed === true && appsConfirmed && gone.ok && caps === `${KWIN} cap_sys_nice=ep`,
  };
}

/** Read the renderer through the lab's SystemInfo path and classify it. Never throws. */
export async function readGpuEvidence(app) {
  const renderer = await readRendererInfo(app.cdpPort, app.cdp);
  return { renderer, evidence: gpuEvidence(renderer) };
}
export const _internals = { existsSync };
