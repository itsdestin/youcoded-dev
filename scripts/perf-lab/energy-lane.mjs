// scripts/perf-lab/energy-lane.mjs — lane C: an ESTIMATE of how much whole-chip power a defined app workload adds.
//
// WHAT IT MEASURES (owner decision Q-3, 2026-10-21): only the amdgpu hwmon `power1_*` meter (label PPT, found by hwmon
// name, never a hard-coded hwmonN). It is a whole-chip reading — CPU cores, graphics and the rest of the package that the
// driver counts — so the lane reports the DIFFERENCE between a window where the app does a defined workload and the idle
// windows either side of it, and always labels it an ESTIMATE of whole-chip power difference. It is never "app watts".
//
// HOW (differential): every repeat is baseline / workload / baseline. delta = workload - mean(the two baselines), so slow
// drift in the machine's idle power cancels. >= 5 clean repeats are required; the run reports the median and the spread.
//
// WHY A CPU-COVERAGE SELF-CHECK: on 2026-10-21 the meter read a flat 36.0 W under a CPU-only load (AC power, "quiet"
// profile) — either it does not count CPU cores or the package sat at its power cap. The lane therefore proves, on every
// run, that THIS meter moves under a known CPU-only load before it believes any app number. If it does not move, the result
// is `insensitive` (not zero, not measured) and the reason names the likely cause. Inconclusive checks stay incomplete.
//
// WHY INTERFERENCE PER WINDOW: another program drawing power inside a window would be charged to the app. Every window
// (baseline AND workload) carries the interference watch's verdict; a repeat containing a disturbed or unknown window is
// excluded from the median and counted. Too few clean repeats makes the run incomplete. A power-profile or charger change
// anywhere in the run invalidates it (different power caps mean a different machine).
//
// Battery (power_now, or current_now * voltage_now) is read only opportunistically, only while the battery is Discharging.
//
// No app code is imported here: the app boot and workload are injected (scenario-energy.mjs wires the real ones), so the
// whole lane is exercised offline with fake sensors.
import { readdirSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { discoverEnergySensors, readDiagnosticText, readEnergySnapshot } from './energy.mjs';
import { readEnvironment } from './interference-watch.mjs';

export const ENERGY_LANE = Object.freeze({
  revision: 1,
  // 7 attempted by default so a couple of disturbed repeats still leave the 5 clean ones the owner asked for.
  repeats: 7, minCleanRepeats: 5, maxExtraRepeats: 3,
  windowMs: 22_000,            // one baseline window; the workload window is as long as the workload itself
  minWindowMs: 8_000,          // a window shorter than this is not a measurement
  restMs: 2_000,               // unmeasured pause between windows so one does not bleed into the next
  sampleMs: 1_000,             // meter polling; matches energy.mjs's minimum interval
  minSamples: 5,               // meter readings required inside one window
  cpuRepeats: 3, cpuWindowMs: 12_000, minCpuCleanTriples: 2,
  noiseFloorW: 0.5,            // below this a "response" is indistinguishable from the meter's own jitter
  estimateLabel: 'ESTIMATE of whole-chip power difference (amdgpu PPT meter, workload minus surrounding idle); not application watts',
});

// Paths compare.mjs / ab.mjs read. Lower is better for all three. Defined in compare.mjs (ENERGY_PATHS) — re-exported
// here only as documentation of the report shape: energy.median.{deltaWatts,baselineWatts}, energy.battery.median.deltaWatts.

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const round2 = (n) => (finite(n) ? Math.round(n * 100) / 100 : n);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Same rule as run.mjs's median(): upper middle of the sorted values, null when there are none (never 0).
export const medianOf = (xs) => { const s = xs.filter(finite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rangeOf = (xs) => { const v = xs.filter(finite); return v.length ? Math.max(...v) - Math.min(...v) : null; };

// ── sensors ──────────────────────────────────────────────────────────────────

/**
 * Pick the amdgpu PPT meter out of a discovery result. Never a hard-coded hwmonN, never a guess: the hwmon chip must be
 * named amdgpu and the channel must be power1 (input preferred over average). When the chip exposes power1_label it must
 * say PPT; a missing label is accepted but recorded as unverified.
 */
export async function selectPptMeter(discovery, { read = readDiagnosticText } = {}) {
  const candidates = (discovery?.sensors ?? []).filter((s) => s.kind === 'hwmon-power' && /:amdgpu$/.test(s.scope ?? '') && /\/power1_(input|average)$/.test(s.path));
  if (!candidates.length) return { status: 'unsupported', reason: 'no amdgpu hwmon power1_input/power1_average found (this machine has no supported chip power meter)' };
  const sensor = candidates.find((s) => s.path.endsWith('power1_input')) ?? candidates[0];
  let label = null;
  try { label = (await read(join(dirname(sensor.path), 'power1_label'))).trim(); } catch { /* no label file: unverified, not a failure */ }
  if (label !== null && label !== 'PPT') return { status: 'unsupported', reason: `amdgpu power1 is labelled ${JSON.stringify(label)}, not PPT; refusing to read a different meter as whole-chip power` };
  return { status: 'supported', sensor, label, labelVerified: label === 'PPT' };
}

/** A reader returning watts from the chosen meter. Throws on any failed/unsupported read (a failed read is never 0 W). */
export function meterReader(sensor, { readSnapshot = readEnergySnapshot } = {}) {
  return async () => {
    const snap = await readSnapshot(sensor);
    if (snap?.status !== 'supported' || !finite(snap.powerW)) throw new Error(`meter read ${snap?.status ?? 'failed'}: ${snap?.reason ?? 'no power value'}`);
    return snap.powerW;
  };
}

/**
 * The first battery that can give watts: power_now, else |current_now| * voltage_now. Returns null when none exists.
 * WHY not energy.mjs's discovered battery sensors alone: those cover power_now/energy_now only, and many laptops expose
 * just current_now and voltage_now.
 */
export async function locateBattery({ list = () => readdirSync('/sys/class/power_supply').sort(), read = readDiagnosticText } = {}) {
  let names;
  try { names = await list(); } catch { return null; }
  for (const name of names) {
    const dir = `/sys/class/power_supply/${name}`;
    try {
      if ((await read(`${dir}/type`)).trim() !== 'Battery') continue;
      const has = async (f) => { try { await read(`${dir}/${f}`); return true; } catch { return false; } };
      const kind = (await has('power_now')) ? 'power_now' : (await has('current_now')) && (await has('voltage_now')) ? 'current-voltage' : null;
      if (kind) return { name, dir, kind };
    } catch { /* not readable: next supply */ }
  }
  return null;
}

/** One battery reading { watts, state }. */
export function batteryReader(battery, { read = readDiagnosticText } = {}) {
  const num = async (f) => { const n = Number((await read(`${battery.dir}/${f}`)).trim()); if (!finite(n)) throw new Error(`battery ${f} not a number`); return n; };
  return async () => {
    const state = (await read(`${battery.dir}/status`)).trim();
    const watts = battery.kind === 'power_now' ? Math.abs(await num('power_now')) / 1e6 : (Math.abs(await num('current_now')) * (await num('voltage_now'))) / 1e12;
    return { watts, state };
  };
}

// ── CPU-only synthetic load ──────────────────────────────────────────────────

/**
 * Busy-loop worker threads: a CPU-only load that touches no graphics, disk or network. The stop flag is a shared Int32 the
 * workers poll; stop() also terminates the worker handles it created (this module's own threads, never another process).
 */
export function startCpuLoad({ threads = Math.max(2, Math.min(8, Math.floor(cpus().length / 2))), WorkerCtor = Worker } = {}) {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const code = "const {workerData}=require('node:worker_threads');const f=new Int32Array(workerData);let x=0;"
    + 'for(;;){for(let i=0;i<2e6;i++)x+=Math.sqrt(i);globalThis.__sink=x;if(Atomics.load(f,0)===1)break;}';
  const workers = Array.from({ length: threads }, () => new WorkerCtor(code, { eval: true, workerData: flag.buffer }));
  return { threads, async stop() { Atomics.store(flag, 0, 1); await Promise.all(workers.map((w) => w.terminate())); } };
}

// ── one window ───────────────────────────────────────────────────────────────

// Fires `fn` now and every intervalMs; the returned stop() waits for an in-flight read. Injected in tests.
export function defaultPoll(fn, intervalMs) {
  let stopped = false, inflight = Promise.resolve();
  const tick = () => { if (!stopped) inflight = inflight.then(fn).catch(() => {}); };
  tick();
  const timer = setInterval(tick, intervalMs);
  return async () => { stopped = true; clearInterval(timer); await inflight; };
}

export function windowStats(watts) {
  const v = watts.filter(finite);
  if (!v.length) return null;
  return { n: v.length, meanW: round2(mean(v)), minW: round2(Math.min(...v)), maxW: round2(Math.max(...v)), spreadW: round2(Math.max(...v) - Math.min(...v)) };
}

/**
 * Measure one window: poll the meter (and the battery if discharging) while `run()` executes, then take the interference
 * watch's verdict for exactly this window. `usable` is the single yes/no the rest of the lane trusts.
 */
export async function measureWindow(deps, { label, kind, run }) {
  const { readMeter, readBattery = null, interference = null, poll = defaultPoll, now = () => performance.now(), cfg = ENERGY_LANE, readEnv = readEnvironment, env0 } = deps;
  const mark = interference?.mark?.() ?? null;
  const watts = [], battery = { watts: [], states: [] };
  let readFailures = 0, lastFailure = null;
  const take = async () => {
    try { watts.push(await readMeter()); } catch (e) { readFailures++; lastFailure = e.message; }
    if (readBattery) { try { const b = await readBattery(); battery.watts.push(b.watts); battery.states.push(b.state); } catch { battery.states.push('unreadable'); } }
  };
  const t0 = now();
  const stop = poll(take, cfg.sampleMs);
  let runError = null;
  try { await run(); } catch (e) { runError = e; }
  await stop();                                         // waits for an in-flight meter read
  await take();                                         // one reading at the very end so the window is bracketed
  const durationMs = now() - t0;
  const verdict = mark === null || !interference
    ? { label, verdict: 'unknown', reasons: ['no interference watch was running for this window'], offenders: [], platformProfiles: [], acStates: [] }
    : interference.verdictSince(mark, label);
  const envEnd = (() => { try { return readEnv(); } catch { return { platformProfile: null, acOnline: null }; } })();
  const envChanged = [];
  if (env0) {
    if (env0.platformProfile !== null && (envEnd.platformProfile !== env0.platformProfile || (verdict.platformProfiles ?? []).some((p) => p !== env0.platformProfile))) envChanged.push('power profile');
    if (env0.acOnline !== null && (envEnd.acOnline !== env0.acOnline || (verdict.acStates ?? []).some((a) => a !== env0.acOnline))) envChanged.push('charger state');
  }
  const power = windowStats(watts);
  const reasons = [];
  if (runError) reasons.push(`the window's work failed: ${runError.message}`);
  if (verdict.verdict !== 'clean') reasons.push(`interference ${verdict.verdict}: ${(verdict.reasons ?? []).join('; ') || 'no reason recorded'}`);
  if (readFailures) reasons.push(`${readFailures} meter read(s) failed (${lastFailure})`);
  if (!power || power.n < cfg.minSamples) reasons.push(`only ${power?.n ?? 0} meter readings (need ${cfg.minSamples})`);
  if (durationMs < cfg.minWindowMs) reasons.push(`window lasted ${Math.round(durationMs)} ms (need ${cfg.minWindowMs})`);
  if (envChanged.length) reasons.push(`${envChanged.join(' and ')} changed`);
  const batteryOk = readBattery && battery.watts.length >= cfg.minSamples && battery.states.every((s) => s === 'Discharging');
  return {
    label, kind, durationMs: Math.round(durationMs), power, samplesW: watts.map((w) => Math.round(w * 10) / 10), readFailures,
    battery: readBattery ? (batteryOk ? { meanW: round2(mean(battery.watts)), n: battery.watts.length } : { unavailable: battery.states.some((s) => s !== 'Discharging') ? 'battery was not discharging for the whole window' : 'too few battery readings' }) : null,
    interference: { verdict: verdict.verdict, reasons: verdict.reasons ?? [], offenders: verdict.offenders ?? [], durationS: verdict.durationS ?? null, platformProfiles: verdict.platformProfiles ?? [], acStates: verdict.acStates ?? [] },
    verdict, envChanged, usable: reasons.length === 0, unusableReasons: reasons,
  };
}

/** baseline / workload / baseline. delta needs all three usable. */
export async function runTriple(deps, { index, prefix, baseline, workload, expectBurnW = null }) {
  const win = (suffix, kind, run) => measureWindow(deps, { label: `${prefix}-${index}-${suffix}`, kind, run });
  const a = await win('baseline-a', 'baseline', baseline);
  await deps.sleep(deps.cfg.restMs);
  const cpu0 = deps.cpuSeconds?.() ?? null;
  const w = await win('workload', 'workload', workload);
  const cpuBurn = cpu0 === null ? null : deps.cpuSeconds() - cpu0;
  await deps.sleep(deps.cfg.restMs);
  const b = await win('baseline-b', 'baseline', baseline);
  const windows = [a, w, b];
  const reasons = windows.flatMap((x) => x.unusableReasons.map((r) => `${x.label}: ${r}`));
  const triple = { index, windows: windows.map(({ verdict, ...rest }) => rest), verdicts: windows.map((x) => x.verdict), clean: reasons.length === 0, excludedReasons: reasons, envChanged: [...new Set(windows.flatMap((x) => x.envChanged))] };
  if (cpuBurn !== null) triple.workloadProcessCpuSeconds = round2(cpuBurn);
  if (triple.clean) {
    const base = (a.power.meanW + b.power.meanW) / 2;
    Object.assign(triple, { baselineWatts: round2(base), workloadWatts: w.power.meanW, deltaWatts: round2(w.power.meanW - base), baselineDriftW: round2(Math.abs(a.power.meanW - b.power.meanW)) });
    if ([a, w, b].every((x) => x.battery?.meanW !== undefined)) triple.batteryDeltaWatts = round2(w.battery.meanW - (a.battery.meanW + b.battery.meanW) / 2);
    if (expectBurnW !== null && cpuBurn !== null && cpuBurn < expectBurnW) { triple.clean = false; triple.excludedReasons.push(`the synthetic load used only ${round2(cpuBurn)} CPU-s (expected >= ${round2(expectBurnW)}); it did not actually load the CPU`); }
  }
  return triple;
}

// ── CPU-coverage verdict ─────────────────────────────────────────────────────

/**
 * Does the meter move under a CPU-only load? `true` (responds), `false` (every Δ within the baselines' own spread: the
 * meter, or the power cap, hides CPU load) or 'inconclusive' (not enough clean evidence). Never false from thin evidence.
 */
export function assessCpuCoverage(triples, { env = null, cfg = ENERGY_LANE } = {}) {
  const clean = triples.filter((t) => t.clean);
  const base = { cleanTriples: clean.length, attempted: triples.length, deltasW: clean.map((t) => t.deltaWatts), excludedReasons: triples.filter((t) => !t.clean).flatMap((t) => t.excludedReasons).slice(0, 12) };
  if (clean.length < cfg.minCpuCleanTriples) return { ...base, meterRespondsToCpu: 'inconclusive', reason: `only ${clean.length} of ${triples.length} CPU-load repeats were clean (need ${cfg.minCpuCleanTriples}); the meter's response to CPU is unknown` };
  const baselineMeans = clean.flatMap((t) => t.windows.filter((w) => w.kind === 'baseline').map((w) => w.power.meanW));
  const noiseW = Math.max(rangeOf(baselineMeans) ?? 0, cfg.noiseFloorW);
  const med = medianOf(base.deltasW), above = base.deltasW.filter((d) => d > noiseW).length;
  const out = { ...base, noiseW: round2(noiseW), medianDeltaW: round2(med), baselineMeanW: round2(mean(baselineMeans)), loadMeanW: round2(mean(clean.map((t) => t.workloadWatts))) };
  if (med > noiseW && above > clean.length / 2) return { ...out, meterRespondsToCpu: true, reason: `median ${round2(med)} W under a CPU-only load, above the baselines' own ${round2(noiseW)} W spread` };
  if (base.deltasW.every((d) => d <= noiseW)) {
    const hints = [];
    if (env?.acOnline === true) hints.push('on AC power');
    if (env?.platformProfile) hints.push(`power profile "${env.platformProfile}"`);
    return { ...out, meterRespondsToCpu: false, reason: `a CPU-only load moved the meter by ${round2(med)} W, within the baselines' ${round2(noiseW)} W spread${hints.length ? `; the package may be pinned at its power cap (${hints.join(', ')}) or this meter does not count CPU cores` : ''}` };
  }
  return { ...out, meterRespondsToCpu: 'inconclusive', reason: `the CPU-load response was mixed (${above} of ${clean.length} repeats above ${round2(noiseW)} W, median ${round2(med)} W)` };
}

// ── the section ──────────────────────────────────────────────────────────────

/** Pure: everything gathered so far -> the report section. Called after every repeat so a crash leaves a readable partial. */
export function buildEnergySection(state) {
  const { cfg, meter, env0, envEnd, cpuCoverage, triples, workload, battery: batteryInfo, discovery, finished, stopReason } = state;
  const clean = triples.filter((t) => t.clean);
  const envChanged = [...new Set(triples.flatMap((t) => t.envChanged).concat(cpuCoverage?.envChanged ?? []))];
  if (envEnd && env0) {
    if (env0.platformProfile !== null && envEnd.platformProfile !== env0.platformProfile) envChanged.push('power profile (run start vs end)');
    if (env0.acOnline !== null && envEnd.acOnline !== env0.acOnline) envChanged.push('charger state (run start vs end)');
  }
  let status, reason;
  if (!meter || meter.status !== 'supported') { status = 'unsupported'; reason = meter?.reason ?? 'no meter'; }
  else if (envChanged.length) { status = 'incomplete'; reason = `${[...new Set(envChanged)].join(' and ')} changed during the run; different power caps mean a different machine, so the run is invalid`; }
  else if (!cpuCoverage) { status = 'incomplete'; reason = 'the CPU-coverage self-check has not run'; }
  else if (cpuCoverage.meterRespondsToCpu === false) { status = 'insensitive'; reason = `the meter did not respond to a known CPU-only load, so an app workload's difference cannot be trusted: ${cpuCoverage.reason}`; }
  else if (cpuCoverage.meterRespondsToCpu !== true) { status = 'incomplete'; reason = `CPU-coverage self-check inconclusive: ${cpuCoverage.reason}`; }
  else if (!finished) { status = 'incomplete'; reason = stopReason ?? 'the run stopped before all repeats finished'; }
  else if (clean.length < cfg.minCleanRepeats) { status = 'incomplete'; reason = `only ${clean.length} clean repeat(s) of ${triples.length} attempted (need ${cfg.minCleanRepeats}); ${triples.length - clean.length} excluded for interference or failed windows`; }
  else { status = 'measured'; reason = null; }

  const measured = status === 'measured';
  const runs = measured ? clean.map((t) => ({ repeat: t.index, deltaWatts: t.deltaWatts, baselineWatts: t.baselineWatts, workloadWatts: t.workloadWatts, baselineDriftW: t.baselineDriftW })) : [];
  const med = (k) => medianOf(runs.map((r) => r[k]));
  // Battery: opportunistic. Needs the same minimum of clean repeats that also have a fully-Discharging battery reading.
  const bRuns = measured ? clean.filter((t) => finite(t.batteryDeltaWatts)).map((t) => ({ repeat: t.index, deltaWatts: t.batteryDeltaWatts })) : [];
  const battery = !batteryInfo ? { status: 'absent', reason: 'no readable battery' }
    : batteryInfo.startState !== 'Discharging' ? { status: 'not-discharging', reason: `battery state was ${batteryInfo.startState}; on mains power it says nothing about the app`, kind: batteryInfo.kind }
    : bRuns.length >= cfg.minCleanRepeats ? { status: 'measured', kind: batteryInfo.kind, runs: bRuns, median: { deltaWatts: medianOf(bRuns.map((r) => r.deltaWatts)) }, label: 'coarse whole-system battery drain difference; not app watts' }
    : { status: 'incomplete', kind: batteryInfo.kind, reason: `only ${bRuns.length} repeat(s) had a fully discharging battery in all three windows (need ${cfg.minCleanRepeats})`, runs: bRuns };

  return {
    revision: cfg.revision, lane: 'energy', status, reason, standardAcceptance: false, appAttributable: false, estimateLabel: cfg.estimateLabel,
    meterRespondsToCpu: cpuCoverage?.meterRespondsToCpu ?? 'inconclusive',
    meter: meter?.status === 'supported' ? { path: meter.sensor.path, scope: meter.sensor.scope, unit: meter.sensor.unit, label: meter.label, labelVerified: meter.labelVerified } : null,
    workload, options: { repeats: cfg.repeats, minCleanRepeats: cfg.minCleanRepeats, maxExtraRepeats: cfg.maxExtraRepeats, windowMs: cfg.windowMs, sampleMs: cfg.sampleMs, minSamples: cfg.minSamples, cpuRepeats: cfg.cpuRepeats, cpuWindowMs: cfg.cpuWindowMs },
    environment: { start: env0 ?? null, end: envEnd ?? null, changed: [...new Set(envChanged)] },
    cpuCoverage: cpuCoverage ?? null,
    counts: { attempted: triples.length, clean: clean.length, excluded: triples.length - clean.length, minClean: cfg.minCleanRepeats },
    excluded: triples.filter((t) => !t.clean).map((t) => ({ repeat: t.index, reasons: t.excludedReasons })),
    repeats: triples,
    // `runs` and `median` follow compare.mjs's report shape so energy.median.deltaWatts has its raw samples behind it
    // (runsFor -> energy.runs[].deltaWatts). Empty/null unless the run is MEASURED: a non-measured run has no number.
    runs, median: measured ? { deltaWatts: med('deltaWatts'), baselineWatts: med('baselineWatts'), workloadWatts: med('workloadWatts') } : null,
    spread: measured ? { deltaWattsRange: round2(rangeOf(runs.map((r) => r.deltaWatts))), baselineWattsRange: round2(rangeOf(runs.map((r) => r.baselineWatts))) } : null,
    battery, sensorDiscovery: discovery ?? null,
  };
}

/** Plain-words problems for a finished energy report; empty = measured and well formed. */
export function energyLaneProblems(report, { cfg = ENERGY_LANE } = {}) {
  const e = report?.energy;
  if (!e) return ['energy: no energy section was recorded'];
  const problems = [];
  if (e.status !== 'measured') problems.push(`energy: ${e.status} — ${e.reason ?? 'no reason recorded'}`);
  else {
    if (!Array.isArray(e.runs) || e.runs.length < cfg.minCleanRepeats) problems.push(`energy: only ${e.runs?.length ?? 0} clean repeats behind the median (need ${cfg.minCleanRepeats})`);
    if (!finite(e.median?.deltaWatts)) problems.push('energy: median.deltaWatts is not a finite number; the comparison would be blind to it');
    if (e.meterRespondsToCpu !== true) problems.push('energy: measured without a passing CPU-coverage self-check');
  }
  return problems;
}

// ── the lane ─────────────────────────────────────────────────────────────────

/**
 * Run the whole lane. `deps` supplies everything that touches the machine, so tests drive it with fakes:
 *   meter {status,sensor,label,labelVerified}, readMeter(), battery {kind,...}|null, readBattery(),
 *   interference {mark(), verdictSince(mark,label)}, baseline() (hold still), workload() (the app's defined work),
 *   startCpuLoad(), cpuSeconds(), readEnv(), poll, sleep, checkDeadline(), onProgress(section), log(), options.
 */
export async function runEnergyLane(deps) {
  const cfg = { ...ENERGY_LANE, ...(deps.options ?? {}) };
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const readEnv = deps.readEnv ?? readEnvironment;
  const log = deps.log ?? (() => {});
  const env0 = readEnv();
  const wdeps = { ...deps, cfg, sleep, readEnv, env0 };
  const state = { cfg, meter: deps.meter, env0, envEnd: null, cpuCoverage: null, triples: [], workload: deps.workloadInfo ?? null, battery: null, discovery: deps.discovery ?? null, finished: false, stopReason: null };
  const progress = () => deps.onProgress?.(buildEnergySection(state));
  if (deps.meter?.status !== 'supported') { state.finished = true; return buildEnergySection(state); }

  // Battery is only worth reading when it is discharging right now; check once, then let each window re-verify its states.
  if (deps.battery && deps.readBattery) {
    try { const first = await deps.readBattery(); state.battery = { kind: deps.battery.kind, name: deps.battery.name, startState: first.state }; }
    catch { state.battery = null; }
  }
  if (!(state.battery?.startState === 'Discharging')) wdeps.readBattery = null;
  progress();

  // 1. CPU-coverage self-check, built from the same baseline/load/baseline triples as the real measurement.
  const cpuTriples = [];
  for (let i = 1; i <= cfg.cpuRepeats; i++) {
    deps.checkDeadline?.();
    let load = null;
    const threads = deps.cpuThreads ?? undefined;
    const holdBaseline = () => sleep(cfg.cpuWindowMs);
    const burnLoad = async () => { load = deps.startCpuLoad(threads ? { threads } : undefined); try { await sleep(cfg.cpuWindowMs); } finally { await load.stop(); } };
    // WHY the CPU-seconds guard after the triple: the thread count is known only once the load has started.
    const t = await runTriple(wdeps, { index: i, prefix: 'cpu-check', baseline: holdBaseline, workload: burnLoad });
    if (load && t.workloadProcessCpuSeconds !== undefined) {
      const expected = load.threads * (t.windows[1].durationMs / 1000) * 0.5;
      if (t.workloadProcessCpuSeconds < expected && t.clean) { t.clean = false; t.excludedReasons.push(`the synthetic load used only ${t.workloadProcessCpuSeconds} CPU-s (expected >= ${round2(expected)}); it did not actually load the CPU`); }
    }
    cpuTriples.push(t);
    log(`energy cpu-check ${i}/${cfg.cpuRepeats}: ${t.clean ? `delta ${t.deltaWatts} W` : `excluded — ${t.excludedReasons[0]}`}`);
  }
  state.cpuCoverage = { ...assessCpuCoverage(cpuTriples, { env: env0, cfg }), triples: cpuTriples, envChanged: [...new Set(cpuTriples.flatMap((t) => t.envChanged))] };
  log(`energy cpu-check: meterRespondsToCpu=${state.cpuCoverage.meterRespondsToCpu} — ${state.cpuCoverage.reason}`);
  progress();

  // 2. The app workload only when the meter is proven to move; otherwise the numbers could not be believed anyway.
  if (state.cpuCoverage.meterRespondsToCpu === true) {
    // Attempt up to repeats + maxExtra, stopping once `repeats` clean ones exist: a disturbed repeat is replaced, not lost.
    while (state.triples.filter((t) => t.clean).length < cfg.repeats && state.triples.length < cfg.repeats + cfg.maxExtraRepeats) {
      deps.checkDeadline?.();
      const index = state.triples.length + 1;
      const t = await runTriple(wdeps, { index, prefix: 'energy', baseline: deps.baseline, workload: deps.workload });
      state.triples.push(t);
      log(`energy ${index}: ${t.clean ? `workload ${t.workloadWatts} W vs idle ${t.baselineWatts} W = ${t.deltaWatts} W` : `EXCLUDED — ${t.excludedReasons[0]}`}`);
      progress();
    }
    state.finished = true;
  } else state.finished = true;
  state.envEnd = readEnv();
  return buildEnergySection(state);
}
