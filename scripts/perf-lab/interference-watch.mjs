// scripts/perf-lab/interference-watch.mjs — notice, DURING a measured window, that something that is
// not the app under test used the machine.
//
// WHY this exists (owner request 2026-10-21: "ensure other open apps don't break our measurements
// without us noticing"): noiseGate looks at the machine ONCE before each boot. Nothing watched the
// measurement itself, so a VM, a build or a browser starting mid-window was accepted silently. This
// module samples every ~500 ms while a window is open and answers with a verdict:
//   clean     nothing foreign mattered
//   disturbed something foreign did (the verdict NAMES it, in plain words)
//   unknown   we could not tell (sensor failed, window too short, sample buffer overflowed).
//             Unknown is never reported as clean: missing is not zero.
//
// "Foreign" = any process that is not the app family under test, not this lab's own node process, and
// not a descendant of either (Xvfb, the supervised compositor, the app's children are the lab's own).
//
// Everything reads through injectable readers (same style as noiseGate) so the tests are offline.
import { readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SAMPLE_INTERVAL_MS = 500;
// WHY 1.0 core average: one fully busy core taken from a 4+ core machine for a whole window is the
// smallest foreign load that visibly moves a wall-clock median here; below it the run-to-run spread
// we already see (a few %) hides it. The pre-boot gate's "10% of the machine" is the same order.
export const FOREIGN_CPU_AVG_CORES = 1.0;
// WHY 2 cores in any 2 s: a short VM boot or compile burst can wreck a 2-second hitch or switch
// measurement while barely moving the window average. 2 s matches the longest single stall we grade.
export const FOREIGN_CPU_BURST_CORES = 2.0;
export const FOREIGN_CPU_BURST_SPAN_MS = 2_000;
// WHY 10: Linux "some" pressure avg10 above 10% means tasks spent over a tenth of the last 10 s
// stalled waiting for disk or memory; that directly lands in file/IPC latency numbers.
export const PRESSURE_AVG10_LIMIT = 10;
// WHY 5%: a foreign GPU client holding more than 5% of one engine during the window is more than
// compositor housekeeping; below it the reading is indistinguishable from idle.
export const FOREIGN_GPU_ENGINE_SHARE = 0.05;
// WHY a cap: a window must never grow memory without bound. 7200 samples = 1 hour at 500 ms, far
// beyond any phase; beyond it we say 'unknown' instead of silently dropping evidence.
export const MAX_SAMPLES = 7_200;
// WHY 1 s: a verdict from less than two samples' worth of elapsed time is a guess; say 'unknown' instead.
export const MIN_WINDOW_MS = 1_000;
// A foreign group has to average this much to be NAMED in a clean verdict's context list.
const NAME_FLOOR_CORES = 0.05;
const HZ = 100; // CLK_TCK on Linux; procs.mjs makes the same assumption.

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const tryRead = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// ---- default readers ---------------------------------------------------------------------------

/** Whole-machine jiffies from /proc/stat: { idle, total }. */
export function readMachineTicks(read = tryRead) {
  const text = read('/proc/stat');
  if (!text) return null;
  const f = text.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  if (f.length < 5 || f.some((n) => !Number.isFinite(n))) return null;
  return { idle: f[3] + f[4], total: f.reduce((a, b) => a + b, 0) };
}

/** Parse one /proc/<pid>/stat line; comm may contain spaces/parens so split after the LAST ")". */
export function parseProcStat(line) {
  const open = line.indexOf('('), close = line.lastIndexOf(')');
  if (open < 0 || close < open) return null;
  const rest = line.slice(close + 2).split(' ');
  const ticks = Number(rest[11]) + Number(rest[12]);
  const start = Number(rest[19]);
  const ppid = Number(rest[1]);
  if (![ticks, start, ppid].every(Number.isFinite)) return null;
  return { name: line.slice(open + 1, close), ppid, ticks, start };
}

/** Every process as { pid, key, name, ppid, ticks }; key = pid+starttime so a reused pid is a new process. */
export function readProcesses({ list = () => readdirSync('/proc'), read = tryRead } = {}) {
  const out = [];
  for (const d of list()) {
    if (!/^\d+$/.test(d)) continue;
    const text = read(`/proc/${d}/stat`);
    if (!text) continue; // vanished between listing and reading: tolerated, never an error
    const p = parseProcStat(text);
    if (p) out.push({ pid: Number(d), key: `${d}:${p.start}`, name: p.name, ppid: p.ppid, ticks: p.ticks });
  }
  return out;
}

/** avg10 of the "some" line for cpu/io/memory; a pressure file that does not exist reads as null. */
export function readPressure(read = tryRead) {
  const out = {};
  for (const k of ['cpu', 'io', 'memory']) {
    const m = /^some .*avg10=([\d.]+)/m.exec(read(`/proc/pressure/${k}`) ?? '');
    out[k] = m ? Number(m[1]) : null;
  }
  return out;
}

export function readGpuBusy({ list = () => readdirSync('/sys/class/drm'), read = tryRead } = {}) {
  for (const d of list()) {
    if (!/^card\d+$/.test(d)) continue;
    const v = read(`/sys/class/drm/${d}/device/gpu_busy_percent`);
    if (v !== null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export const readPlatformProfile = (read = tryRead) => read('/sys/firmware/acpi/platform_profile')?.trim() ?? null;

/** true/false when a Mains supply reports online, null when no mains supply can be read. */
export function readAcOnline({ list = () => readdirSync('/sys/class/power_supply'), read = tryRead } = {}) {
  let seen = false;
  for (const d of list()) {
    if (read(`/sys/class/power_supply/${d}/type`)?.trim() !== 'Mains') continue;
    const on = read(`/sys/class/power_supply/${d}/online`)?.trim();
    if (on === '1') return true;
    if (on === '0') seen = true;
  }
  return seen ? false : null;
}

/** amdgpu PPT power meter in watts (found by hwmon name, never a hard-coded hwmonN), or null. */
export function readGpuWatts({ list = () => readdirSync('/sys/class/hwmon'), read = tryRead } = {}) {
  for (const d of list()) {
    if (read(`/sys/class/hwmon/${d}/name`)?.trim() !== 'amdgpu') continue;
    const uw = Number(read(`/sys/class/hwmon/${d}/power1_input`));
    if (Number.isFinite(uw) && uw > 0) return uw / 1e6;
  }
  return null;
}

/**
 * Per-process GPU engine time from /proc/<pid>/fdinfo (drm-engine-* ns), or null when nothing could be
 * read at all. Returns { clients: Map key -> {pid,name,ns}, unreadable } — unreadable counts processes
 * we were not allowed to inspect, so attribution can say it is partial.
 */
export function readGpuClients({ list = () => readdirSync('/proc'), listFd = (p) => readdirSync(`/proc/${p}/fd`),
  link = readlinkSync, read = tryRead } = {}) {
  const clients = new Map();
  let unreadable = 0, readable = 0;
  for (const d of list()) {
    if (!/^\d+$/.test(d)) continue;
    let fds;
    try { fds = listFd(d); } catch { unreadable++; continue; }
    readable++;
    for (const fd of fds) {
      let target = '';
      try { target = link(`/proc/${d}/fd/${fd}`); } catch { continue; }
      if (!target.startsWith('/dev/dri/')) continue;
      const info = read(`/proc/${d}/fdinfo/${fd}`);
      if (!info) continue;
      const id = /^drm-client-id:\s*(\d+)/m.exec(info)?.[1];
      let ns = 0;
      for (const m of info.matchAll(/^drm-engine-[\w-]+:\s*(\d+) ns/gm)) ns += Number(m[1]);
      if (id === undefined) continue;
      const key = `${d}:${id}`;
      const name = (read(`/proc/${d}/comm`) ?? '?').trim();
      clients.set(key, { pid: Number(d), name, ns: Math.max(ns, clients.get(key)?.ns ?? 0) });
    }
  }
  return readable === 0 ? null : { clients, unreadable };
}

// ---- grouping / ownership ----------------------------------------------------------------------

/** pids that belong to the lab or the app: the given set, this process, and every descendant of those. */
export function ownedSet(procs, ownedPids, selfPid) {
  const roots = new Set([...ownedPids, selfPid]);
  const kids = new Map();
  for (const p of procs) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p.pid); }
  const out = new Set(roots);
  const stack = [...roots];
  while (stack.length) for (const c of kids.get(stack.pop()) ?? []) if (!out.has(c)) { out.add(c); stack.push(c); }
  return out;
}

const pidText = (pids) => `${pids.length === 1 ? 'pid' : 'pids'} ${pids.slice(0, 4).join(', ')}${pids.length > 4 ? `, +${pids.length - 4} more` : ''}`;
const offenderText = (o) => `${o.name}${o.pids.length > 1 ? ` ×${o.pids.length}` : ''} (${pidText(o.pids)}) used ${round1(o.cores)} core${round1(o.cores) === 1 ? '' : 's'}`;

/** "qemu-system-x86 ×3 using 3.3 cores, ..." for the quiet-wait message; '' when nothing stands out. */
export function describeOffenders(offenders, n = 3) {
  return offenders.slice(0, n).map((o) => `${o.name}${o.pids.length > 1 ? ` ×${o.pids.length}` : ''} using ${round1(o.cores)} core${round1(o.cores) === 1 ? '' : 's'}`).join(', ');
}

/**
 * Who is using the CPU right now, apart from the lab and the app? Two scans `seconds` apart.
 * Used by noiseGate so a waiting run tells the owner what to close.
 */
export async function topForeignProcesses({ seconds = 3, ownedPids = () => [], selfPid = process.pid,
  readProcs = readProcesses, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const a = readProcs();
  await sleep(seconds * 1000);
  const b = readProcs();
  const owned = ownedSet(b, ownedPids(), selfPid);
  const before = new Map(a.map((p) => [p.key, p.ticks]));
  const groups = new Map();
  for (const p of b) {
    if (owned.has(p.pid) || !before.has(p.key)) continue;
    const cores = (p.ticks - before.get(p.key)) / HZ / seconds;
    if (cores <= 0) continue;
    const g = groups.get(p.name) ?? { name: p.name, pids: [], cores: 0 };
    g.pids.push(p.pid); g.cores += cores; groups.set(p.name, g);
  }
  return [...groups.values()].filter((g) => g.cores >= NAME_FLOOR_CORES).sort((x, y) => y.cores - x.cores);
}

// ---- the watch ---------------------------------------------------------------------------------

export function createInterferenceWatch({
  intervalMs = SAMPLE_INTERVAL_MS, maxSamples = MAX_SAMPLES, now = Date.now, autoTimer = true,
  selfPid = process.pid,
  readTicks = readMachineTicks, readProcs = readProcesses, pressure = readPressure, gpuBusy = readGpuBusy,
  profile = readPlatformProfile, acOnline = readAcOnline, gpuWatts = readGpuWatts, gpuClients = readGpuClients,
} = {}) {
  let ownedFn = () => [];
  let timer = null, running = false;
  let samples = [], overflow = false, readFailures = 0;
  let prev = null;                 // { t, machine, ticks: Map key -> ticks, birth: Set of keys seen }
  let gpuStart = null, startedAt = 0;
  let lastOwned = new Set([selfPid]); // WHY kept: the GPU attribution at stop() needs the same ownership view as the CPU samples

  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

  /** One sample. Public so tests drive time by hand. */
  function tick() {
    const t = now();
    const machine = safe(readTicks);
    const procs = safe(readProcs);
    if (!machine || !procs) { readFailures++; return; } // a missed reading is counted, never filled with zero
    const owned = ownedSet(procs, safe(ownedFn, []) ?? [], selfPid);
    lastOwned = owned;
    const ticks = new Map(procs.map((p) => [p.key, p.ticks]));
    if (prev) {
      const dt = (t - prev.t) / 1000;
      const dTotal = machine.total - prev.machine.total;
      const groups = {};
      let foreign = 0;
      for (const p of procs) {
        if (owned.has(p.pid)) continue;
        // A process first seen mid-window was born inside it: all its CPU time so far counts.
        const base = prev.ticks.get(p.key) ?? 0;
        const cores = dt > 0 ? (p.ticks - base) / HZ / dt : 0;
        if (cores <= 0) continue;
        foreign += cores;
        const g = groups[p.name] ?? (groups[p.name] = { cores: 0, pids: [] });
        g.cores += cores; g.pids.push(p.pid);
      }
      for (const name of Object.keys(groups)) if (groups[name].cores < NAME_FLOOR_CORES) delete groups[name];
      if (samples.length >= maxSamples) overflow = true;
      else {
        samples.push({
          t, dt, foreign, groups,
          busy: dTotal > 0 ? 100 * (1 - (machine.idle - prev.machine.idle) / dTotal) : null,
          pressure: safe(pressure), gpu: safe(gpuBusy), watts: safe(gpuWatts),
          profile: safe(profile), ac: safe(acOnline),
        });
      }
    }
    prev = { t, machine, ticks };
  }

  function start(ownedPidsFn = () => []) {
    ownedFn = ownedPidsFn;
    samples = []; overflow = false; readFailures = 0; prev = null; running = true;
    startedAt = now();
    gpuStart = safe(gpuClients);
    tick(); // baseline only: deltas need two readings
    if (autoTimer) { timer = setInterval(tick, intervalMs); timer.unref?.(); }
    return api;
  }

  /** Index to pass to verdictSince() so a sub-window (e.g. a background window) gets its own verdict. */
  const mark = () => samples.length;

  function verdictFrom(label, from, gpuDelta) {
    return summarize(label, samples.slice(from), { overflow, readFailures, gpuDelta, intervalMs });
  }
  const verdictSince = (m, label = 'window') => verdictFrom(label, m ?? 0, null);

  function stop(label = 'window') {
    if (!running) return summarize(label, [], { overflow: false, readFailures: 0, gpuDelta: null, intervalMs, notRunning: true });
    if (timer) clearInterval(timer);
    timer = null; running = false;
    tick();
    const gpuEnd = safe(gpuClients);
    const gpuDelta = gpuAttribution(gpuStart, gpuEnd, lastOwned, (now() - startedAt) * 1e6);
    return verdictFrom(label, 0, gpuDelta);
  }

  const api = { start, stop, tick, mark, verdictSince };
  return api;
}

/** Foreign GPU holders between two fdinfo scans. { attribution, holders } */
function gpuAttribution(a, b, ownedPids, windowNs) {
  if (!a || !b) return { attribution: 'not-attributable', holders: [] };
  const holders = [];
  for (const [key, c] of b.clients) {
    if (ownedPids.has(c.pid)) continue;
    const base = a.clients.get(key)?.ns ?? 0;
    const share = windowNs > 0 ? (c.ns - base) / windowNs : 0;
    if (share >= FOREIGN_GPU_ENGINE_SHARE) holders.push({ pid: c.pid, name: c.name, share: round2(share) });
  }
  // unreadable>0: other users' processes cannot be inspected, so "none seen" is only partial.
  return { attribution: b.unreadable > 0 ? 'partial' : 'attributed', holders };
}

const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined))];

/** Pure: samples in, verdict out. */
export function summarize(label, samples, { overflow = false, readFailures = 0, gpuDelta = null, intervalMs = SAMPLE_INTERVAL_MS, notRunning = false } = {}) {
  const unknownReasons = [];
  if (notRunning) unknownReasons.push('the interference watch was not running for this window');
  if (overflow) unknownReasons.push(`more than ${MAX_SAMPLES} samples were taken, so the watch stopped recording; the rest of the window is unwatched`);
  const spanMs = samples.reduce((a, x) => a + x.dt * 1000, 0);
  if (!notRunning && spanMs < MIN_WINDOW_MS) unknownReasons.push('no usable readings were taken (window shorter than 1 s or /proc unreadable)');
  if (readFailures > 0 && samples.length) unknownReasons.push(`${readFailures} reading(s) of /proc failed during the window`);

  const durationMs = samples.reduce((s, x) => s + x.dt * 1000, 0);
  const durS = durationMs / 1000;
  const reasons = [];

  // Foreign CPU, by process name.
  const byName = new Map();
  let foreignCoreSeconds = 0;
  for (const s of samples) {
    foreignCoreSeconds += s.foreign * s.dt;
    for (const [name, g] of Object.entries(s.groups)) {
      const e = byName.get(name) ?? { name, pids: new Set(), coreSeconds: 0 };
      e.coreSeconds += g.cores * s.dt; g.pids.forEach((p) => e.pids.add(p)); byName.set(name, e);
    }
  }
  const offenders = [...byName.values()]
    .map((e) => ({ name: e.name, pids: [...e.pids], cores: durS > 0 ? e.coreSeconds / durS : 0 }))
    .filter((o) => o.cores >= NAME_FLOOR_CORES).sort((a, b) => b.cores - a.cores);
  const avgCores = durS > 0 ? foreignCoreSeconds / durS : 0;

  // Worst span of FOREIGN_CPU_BURST_SPAN_MS (sliding, by real elapsed time).
  let peak = 0, peakSamples = [];
  for (let i = 0; i < samples.length; i++) {
    let ms = 0, cs = 0, j = i;
    while (j < samples.length && ms < FOREIGN_CPU_BURST_SPAN_MS) { ms += samples[j].dt * 1000; cs += samples[j].foreign * samples[j].dt; j++; }
    if (ms >= FOREIGN_CPU_BURST_SPAN_MS - intervalMs / 2) {
      const cores = cs / (ms / 1000);
      if (cores > peak) { peak = cores; peakSamples = samples.slice(i, j); }
    }
  }

  if (avgCores > FOREIGN_CPU_AVG_CORES) {
    reasons.push(`other programs used ${round1(avgCores)} cores on average over ${Math.round(durS)} s (limit ${FOREIGN_CPU_AVG_CORES}): ${offenders.slice(0, 3).map(offenderText).join('; ')}`);
  } else if (peak > FOREIGN_CPU_BURST_CORES) {
    const names = new Map();
    for (const s of peakSamples) for (const [n, g] of Object.entries(s.groups)) { const e = names.get(n) ?? { name: n, pids: new Set(), cs: 0 }; e.cs += g.cores * s.dt; g.pids.forEach((p) => e.pids.add(p)); names.set(n, e); }
    const spanS = peakSamples.reduce((a, s) => a + s.dt, 0) || 1;
    const top = [...names.values()].map((e) => ({ name: e.name, pids: [...e.pids], cores: e.cs / spanS })).sort((a, b) => b.cores - a.cores).slice(0, 3);
    reasons.push(`a burst of other programs used ${round1(peak)} cores for 2 s (limit ${FOREIGN_CPU_BURST_CORES}): ${top.map(offenderText).join('; ')}`);
  }

  // Disk / memory stalls.
  const maxOf = (k) => { const v = samples.map((s) => s.pressure?.[k]).filter(Number.isFinite); return v.length ? Math.max(...v) : null; };
  const pressure = { cpuMax: maxOf('cpu'), ioMax: maxOf('io'), memoryMax: maxOf('memory') };
  if (pressure.ioMax !== null && pressure.ioMax > PRESSURE_AVG10_LIMIT) reasons.push(`the disk made programs wait ${pressure.ioMax}% of the time (limit ${PRESSURE_AVG10_LIMIT}%)`);
  if (pressure.memoryMax !== null && pressure.memoryMax > PRESSURE_AVG10_LIMIT) reasons.push(`memory shortage made programs wait ${pressure.memoryMax}% of the time (limit ${PRESSURE_AVG10_LIMIT}%)`);

  // Power profile / mains power changing mid-window.
  const profiles = uniq(samples.map((s) => s.profile));
  const acStates = uniq(samples.map((s) => s.ac));
  if (profiles.length > 1) reasons.push(`the power profile changed during the window (${profiles.join(' -> ')})`);
  if (acStates.length > 1) reasons.push('the charger was plugged in or removed during the window');

  // GPU: only an attributed foreign holder counts; the busy figure alone cannot say whose it is.
  const gpuVals = samples.map((s) => s.gpu).filter(Number.isFinite).sort((a, b) => a - b);
  const watts = samples.map((s) => s.watts).filter(Number.isFinite);
  const gpu = {
    busyMin: gpuVals.length ? gpuVals[0] : null,
    busyMedian: gpuVals.length ? gpuVals[Math.floor(gpuVals.length / 2)] : null,
    busyMax: gpuVals.length ? gpuVals[gpuVals.length - 1] : null,
    // Informative only: a flat reading under load usually means the power cap is the limit.
    pptWattsMin: watts.length ? round1(Math.min(...watts)) : null,
    pptWattsMax: watts.length ? round1(Math.max(...watts)) : null,
    attribution: gpuDelta?.attribution ?? 'not-attributable',
    foreignHolders: gpuDelta?.holders ?? [],
  };
  if (gpu.foreignHolders.length) {
    reasons.push(`${gpu.foreignHolders.map((h) => `${h.name} (pid ${h.pid}) held the graphics chip ${Math.round(h.share * 100)}% of the time`).join('; ')}`);
  }

  const busyVals = samples.map((s) => s.busy).filter(Number.isFinite);
  const verdict = reasons.length ? 'disturbed' : unknownReasons.length ? 'unknown' : 'clean';
  return {
    label, verdict, reasons: [...reasons, ...(reasons.length ? unknownReasons.map((r) => `also: ${r}`) : unknownReasons)],
    durationS: round1(durS), samples: samples.length, overflow,
    foreignAvgCores: round2(avgCores), foreignPeak2sCores: round2(peak),
    offenders: offenders.slice(0, 5).map((o) => ({ ...o, cores: round2(o.cores) })),
    machineBusyPct: busyVals.length ? { avg: round1(busyVals.reduce((a, b) => a + b, 0) / busyVals.length), max: round1(Math.max(...busyVals)) } : null,
    pressure, gpu, platformProfiles: profiles, acStates,
  };
}

/**
 * Why a report's windows cannot be trusted as quiet-machine numbers. Empty = every window was clean.
 *
 * WHY INCOMPLETE and not a new status: the report vocabulary is healthy / incomplete (see how
 * neverQuiet is handled). A disturbed window's numbers are KEPT in the report, but a report that
 * carries one must not be ranked or compared, which is exactly what "incomplete" already means.
 * 'unknown' is treated the same way: a window we could not watch is not a clean window.
 * A report with NO `interference` field at all (written before the watch existed, or hand-built) adds
 * nothing here; assessComparability refuses those separately so old numbers are never silently reused.
 */
export function interferenceProblems(report) {
  const windows = report?.interference?.windows;
  if (!Array.isArray(windows)) return [];
  const problems = [];
  const env = report.identity?.environment;
  for (const w of windows) {
    if (w?.verdict === 'clean') {
      // The report's environment was recorded once at the start; a window that saw another profile/AC state
      // means it changed BETWEEN windows too, and the whole run no longer shares one environment.
      if (env && ((env.platformProfile !== null && (w.platformProfiles ?? []).some((v) => v !== env.platformProfile))
        || (env.acOnline !== null && (w.acStates ?? []).some((v) => v !== env.acOnline)))) {
        problems.push(`interference: window ${w.label} ran under a different power profile or charger state than the run started with`);
      }
      continue;
    }
    problems.push(`interference: window ${w?.label ?? '?'} ${w?.verdict === 'disturbed' ? 'was DISTURBED by other programs (numbers kept but not trustworthy)' : 'could not be checked for outside interference'} — ${(w?.reasons ?? []).join('; ') || 'no reason recorded'}`);
  }
  return problems;
}

/** One-line plain-words form of a verdict for logs and Markdown. */
export function verdictLine(v) {
  const head = `${v.label}: ${v.verdict}`;
  if (v.verdict === 'clean') return `${head} (${v.samples} samples over ${v.durationS} s${v.offenders.length ? `; busiest other: ${describeOffenders(v.offenders, 1)}` : ''})`;
  return `${head} — ${v.reasons.join('; ')}`;
}

/** The environment a report was taken in; A/B pairs whose profile or AC state differ are refused. */
export function readEnvironment(deps = {}) {
  const { profile = readPlatformProfile, acOnline = readAcOnline } = deps;
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  return { platformProfile: safe(profile), acOnline: safe(acOnline) };
}

// Standalone: `node interference-watch.mjs [seconds]` watches this machine with no app (owned = none).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seconds = Number(process.argv[2] ?? 20);
  const w = createInterferenceWatch().start(() => []);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const v = w.stop('standalone');
  console.log(verdictLine(v));
  console.log(JSON.stringify(v, null, 2));
}
