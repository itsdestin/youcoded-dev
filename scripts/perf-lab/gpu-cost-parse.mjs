// scripts/perf-lab/gpu-cost-parse.mjs — the PURE half of gpu-cost.mjs.
//
// Everything here takes text or arrays and returns plain numbers, so it can be
// unit-tested without a GPU, a compositor or an app. gpu-cost.mjs does the I/O.
//
// Three families of function:
//   1. amdgpu per-process accounting  (/proc/<pid>/fdinfo/*)  -> parseFdinfo, sumClients, engineDelta
//   2. Chromium trace summarising     (Tracing.dataCollected)  -> summariseTrace
//   3. statistics + trust checks      (median, noise floor, positive-control monotonicity)
//
// Node built-ins only.

// ── 1. fdinfo ────────────────────────────────────────────────────────────────

const toKiB = (v, unit) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  switch ((unit || 'KiB').toLowerCase()) {
    case 'kib': return n;
    case 'mib': return n * 1024;
    case 'gib': return n * 1024 * 1024;
    case 'b': return n / 1024;
    default: return n;
  }
};

/**
 * Parse ONE /proc/<pid>/fdinfo/<fd> file. Returns null unless it is a DRM fd.
 * amdgpu (kernel 7.1.3, 2026-10-05) exposes:
 *   drm-driver, drm-client-id, drm-pdev
 *   drm-engine-gfx / -compute / -dma / -enc / -dec ...: <N> ns   (cumulative busy time)
 *   drm-memory-vram / -gtt / -cpu: <N> KiB                       (resident now)
 * Engine keys are ABSENT until that client has submitted work, so a missing
 * engine means "zero so far", not "unsupported".
 */
export function parseFdinfo(text) {
  if (typeof text !== 'string' || !/^drm-driver:/m.test(text)) return null;
  const out = { driver: null, clientId: null, pdev: null, engines: {}, memoryKiB: {} };
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'drm-driver') out.driver = value;
    else if (key === 'drm-client-id') out.clientId = Number(value);
    else if (key === 'drm-pdev') out.pdev = value;
    else if (key.startsWith('drm-engine-') && !key.startsWith('drm-engine-capacity')) {
      const v = /^(\d+)\s*ns$/.exec(value);
      if (v) out.engines[key.slice('drm-engine-'.length)] = Number(v[1]);
    } else if (/^drm-memory-/.test(key)) {
      const v = /^(\d+)\s*([A-Za-z]*)$/.exec(value);
      if (v) out.memoryKiB[key.slice('drm-memory-'.length)] = toKiB(v[1], v[2]);
    }
  }
  return out;
}

/**
 * One process opens the render node several times and every duplicate fd reports
 * the SAME client's totals. Summing fds would multiply the cost by the fd count
 * (measured 2026-10-05: the Chromium GPU process shows four fds per client).
 * Dedupe by drm-client-id; later duplicates are ignored.
 *
 * @param {Array<{pid:number, comm?:string, fd:object}>} entries parsed fdinfo with owner
 * @returns {Map<number,{pid:number, comm:string, engines:object, memoryKiB:object}>} by clientId
 */
export function sumClients(entries) {
  const byClient = new Map();
  for (const e of entries) {
    if (!e?.fd || e.fd.driver !== 'amdgpu' || !Number.isFinite(e.fd.clientId)) continue;
    if (byClient.has(e.fd.clientId)) continue;
    byClient.set(e.fd.clientId, { pid: e.pid, comm: e.comm ?? '', engines: e.fd.engines, memoryKiB: e.fd.memoryKiB });
  }
  return byClient;
}

/** Total of one engine across a client map. */
export function totalEngineNs(clients, engine = 'gfx') {
  let t = 0;
  for (const c of clients.values()) t += c.engines[engine] ?? 0;
  return t;
}

/**
 * GPU busy % of ONE engine between two client maps over `wallNs`.
 * Clients that appear only in `after` count from zero (a client born inside the
 * window); clients only in `before` (exited) are ignored and reported in `lost`
 * so the caller can say the reading is a lower bound.
 */
export function engineDelta(before, after, wallNs, engine = 'gfx') {
  let ns = 0, lost = 0;
  for (const [id, a] of after) ns += Math.max(0, (a.engines[engine] ?? 0) - (before.get(id)?.engines[engine] ?? 0));
  for (const id of before.keys()) if (!after.has(id)) lost++;
  return { ns, pct: wallNs > 0 ? (ns / wallNs) * 100 : null, lostClients: lost };
}

/** Sum of one memory kind (vram|gtt) across clients, in MiB. */
export function memoryMiB(clients, kind) {
  let k = 0;
  for (const c of clients.values()) k += c.memoryKiB[kind] ?? 0;
  return k / 1024;
}

// ── 2. trace summarising ─────────────────────────────────────────────────────

/**
 * Reduce a Chromium trace (array of events) to the frame facts that matter.
 * Events come from categories viz, cc, benchmark, disabled-by-default-devtools.timeline.frame.
 *
 * What each number is — and is NOT:
 *  - compositorFrames: count of `Display::DrawAndSwap` on the GPU process's
 *    display compositor = frames the app handed to the (virtual) compositor.
 *  - drawAndSwap*: wall time the viz thread spent in that call (CPU-side
 *    recording of GPU commands, NOT GPU execution time; that is fdinfo's job).
 *  - presented: count of PipelineReporter frames that reached STATE_PRESENTED_*;
 *    dropped: STATE_DROPPED; noUpdate: STATE_NO_UPDATE_DESIRED (nothing changed,
 *    which is GOOD at idle, not a missed frame).
 *  - presentLatency*: `SubmitCompositorFrameToPresentationCompositorFrame`, i.e.
 *    submit -> compositor says it was presented. On a headless/virtual compositor
 *    this is the virtual output's cadence, not a panel's.
 *  - frameIntervals: gaps between consecutive compositor frames (ms).
 */
export function summariseTrace(events, { fromUs = -Infinity, toUs = Infinity } = {}) {
  const inWin = (e) => typeof e.ts === 'number' && e.ts >= fromUs && e.ts <= toUs;
  const ev = (events ?? []).filter(inWin);
  const draws = ev.filter((e) => e.name === 'Display::DrawAndSwap' && e.ph === 'X').sort((a, b) => a.ts - b.ts);
  const drawDurMs = draws.map((e) => (e.dur ?? 0) / 1000);
  const intervals = [];
  for (let i = 1; i < draws.length; i++) intervals.push((draws[i].ts - draws[i - 1].ts) / 1000);

  const states = { presented: 0, dropped: 0, noUpdate: 0, other: 0 };
  for (const e of ev) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b') continue;
    const s = e.args?.frame_reporter?.state ?? '';
    if (/^STATE_PRESENTED/.test(s)) states.presented++;
    else if (s === 'STATE_DROPPED') states.dropped++;
    else if (s === 'STATE_NO_UPDATE_DESIRED') states.noUpdate++;
    else states.other++;
  }

  // Async b/e pairs for the stage we care about, matched on id2.local + pid.
  const open = new Map();
  const latencyMs = [];
  for (const e of ev) {
    if (e.name !== 'SubmitCompositorFrameToPresentationCompositorFrame') continue;
    const key = `${e.pid}:${e.id2?.local ?? e.id}`;
    if (e.ph === 'b') open.set(key, e.ts);
    else if (e.ph === 'e' && open.has(key)) { latencyMs.push((e.ts - open.get(key)) / 1000); open.delete(key); }
  }
  const spanS = draws.length > 1 ? (draws[draws.length - 1].ts - draws[0].ts) / 1e6 : null;
  return {
    compositorFrames: draws.length,
    compositorFps: spanS ? (draws.length - 1) / spanS : null,
    drawAndSwapMs: describe(drawDurMs),
    frameIntervalMs: describe(intervals),
    longIntervals: intervals.filter((x) => x > 50).length,
    pipeline: states,
    presentLatencyMs: describe(latencyMs),
  };
}

// ── 3. statistics + trust ────────────────────────────────────────────────────

export function median(a) {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function percentile(a, p) {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[i];
}
export function describe(a) {
  const v = a.filter(Number.isFinite);
  if (!v.length) return { n: 0, median: null, p95: null, max: null, mean: null };
  return { n: v.length, median: median(v), p95: percentile(v, 95), max: Math.max(...v), mean: v.reduce((x, y) => x + y, 0) / v.length };
}
/** Spread of repeated readings of the SAME scene: the noise floor. */
export function spread(a) {
  const v = a.filter(Number.isFinite);
  if (v.length < 2) return { n: v.length, min: v[0] ?? null, max: v[0] ?? null, range: null, median: median(v) };
  return { n: v.length, min: Math.min(...v), max: Math.max(...v), range: Math.max(...v) - Math.min(...v), median: median(v) };
}

/**
 * Is a difference real? `delta` between two cells' medians must exceed `k` times
 * the larger of the two cells' own repeat ranges AND an absolute floor (so two
 * readings of 0.01% vs 0.02% do not count as a "doubling").
 */
export function exceedsNoise(medianA, rangeA, medianB, rangeB, { k = 2, absFloor = 0 } = {}) {
  if (![medianA, medianB].every(Number.isFinite)) return false;
  const delta = Math.abs(medianB - medianA);
  const noise = Math.max(rangeA ?? 0, rangeB ?? 0);
  return delta > k * noise && delta > absFloor;
}

/**
 * Positive control: readings at increasing load levels must RISE. Returns the
 * verdict and the worst violation. `tol` lets a tiny reversal through (it is
 * inside noise), expressed in the signal's own units.
 */
export function monotonicRise(levels, tol = 0) {
  const v = levels.map((l) => l.value);
  let worst = 0;
  for (let i = 1; i < v.length; i++) worst = Math.max(worst, v[i - 1] - v[i]);
  const rose = v.length >= 2 && v[v.length - 1] > v[0];
  return { ok: rose && worst <= tol, rose, worstReversal: worst, values: v };
}

/** The refusal rule: a software renderer, or an unknown one, means NO numbers. */
export function rendererVerdict(rendererRecord) {
  if (!rendererRecord) return { ok: false, reason: 'renderer record missing' };
  if (rendererRecord.softwareRendering === null || rendererRecord.softwareRendering === undefined) return { ok: false, reason: `renderer unknown (${rendererRecord.error ?? 'no glRenderer'})` };
  if (rendererRecord.softwareRendering) return { ok: false, reason: `software renderer: ${rendererRecord.glRenderer}` };
  if (rendererRecord.featureStatus?.gpu_compositing && !String(rendererRecord.featureStatus.gpu_compositing).startsWith('enabled')) return { ok: false, reason: `GPU compositing not enabled (${rendererRecord.featureStatus.gpu_compositing})` };
  if (rendererRecord.featureStatus?.rasterization && !String(rendererRecord.featureStatus.rasterization).startsWith('enabled')) return { ok: false, reason: `GPU rasterization not enabled (${rendererRecord.featureStatus.rasterization})` };
  if (!/radeon|amd/i.test(rendererRecord.glRenderer ?? '')) return { ok: false, reason: `renderer is not the expected Radeon: ${rendererRecord.glRenderer}` };
  return { ok: true, reason: null };
}
