import { randomUUID } from 'node:crypto';

// Self-contained because the same sampler is serialized into an OWNED Electron
// main context and renderer context. It does not rely on long-task observers.
export function createLoopSampler({ everyMs = 20, maxEvents = 256, stallFloorMs = 50,
  now = () => performance.now(), schedule = setInterval, cancel = clearInterval } = {}) {
  if (!Number.isInteger(everyMs) || everyMs <= 0 || !Number.isInteger(maxEvents) || maxEvents <= 0) throw new Error('Loop period and event cap must be positive integers.');
  if (!Number.isFinite(stallFloorMs) || stallFloorMs < 0) throw new Error('Invalid stall floor.');
  const startedAt = now();
  let last = startedAt, stoppedAt = null, sampleCount = 0, maxGap = 0, maxDelay = 0;
  let total = 0, totalExcess = 0, delayedSamples = 0, droppedEvents = 0, invalidClock = !Number.isFinite(startedAt);
  const events = [], waiters = [];
  const tick = () => {
    if (stoppedAt !== null) return;
    const t = now();
    if (!Number.isFinite(t) || t < last) invalidClock = true;
    const gap = Math.max(0, t - last), delay = Math.max(0, gap - everyMs);
    last = t; sampleCount++;
    // WHY: a long-task threshold misses sustained short-task congestion. This
    // constant-space sum measures timer excess, NOT CPU busy time/utilization.
    totalExcess += delay; if (delay > 0) delayedSamples++;
    maxGap = Math.max(maxGap, gap); maxDelay = Math.max(maxDelay, delay);
    if (delay >= stallFloorMs) {
      total += delay;
      if (events.length < maxEvents) events.push({ atMs: t - startedAt, delayMs: delay });
      else droppedEvents++;
    }
    for (const w of waiters.splice(0)) w.resolve();
  };
  const timer = schedule(tick, everyMs);
  timer?.unref?.();
  return {
    ready() {
      if (sampleCount > 0) return Promise.resolve();
      if (stoppedAt !== null) return Promise.reject(new Error('Loop probe stopped before a sample.'));
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    stop() {
      if (stoppedAt !== null) return;
      stoppedAt = now(); cancel(timer);
      for (const w of waiters.splice(0)) w.reject(new Error('Loop probe stopped before a sample.'));
    },
    snapshot() {
      const end = stoppedAt === null ? now() : stoppedAt;
      if (!Number.isFinite(end) || end < last || end < startedAt) invalidClock = true;
      const openGap = Math.max(0, end - last), openDelay = Math.max(0, openGap - everyMs);
      const round = n => Math.round(n * 10) / 10;
      return {
        available: !invalidClock, invalidClock, startedAt, everyMs,
        observedMs: round(Math.max(0, end - startedAt)), sampleCount,
        maxGapMs: round(Math.max(maxGap, openGap)), maxDelayMs: round(Math.max(maxDelay, openDelay)),
        openDelayMs: round(openDelay), totalStallMs: round(total + (openDelay >= stallFloorMs ? openDelay : 0)),
        totalExcessMs: round(totalExcess + openDelay), delayedSamples,
        events: events.map(e => ({ atMs: round(e.atMs), delayMs: round(e.delayMs) })),
        droppedEvents, truncated: droppedEvents > 0, stopped: stoppedAt !== null,
      };
    },
  };
}

function keyFor(kind) {
  if (!['main', 'renderer'].includes(kind)) throw new Error('Unknown loop-probe context.');
  return `__youcodedLabLoop_${kind}`;
}

/** Caller must have proved ownership of the target before connecting. The main
 * identity check is a second fence, performed before touching any existing probe. */
export async function installLoopProbe(cdp, { kind = 'renderer', owner, everyMs = 20, maxEvents = 256 } = {}) {
  const key = keyFor(kind), token = randomUUID();
  if (kind === 'main' && (!Number.isInteger(owner?.pid) || !owner?.binary || !owner?.home)) throw new Error('Main-loop sampling requires an owned process identity.');
  return cdp.evaluate(`(() => {
    const kind=${JSON.stringify(kind)}, owner=${JSON.stringify(owner ?? null)}, key=${JSON.stringify(key)};
    if (kind === 'main') {
      if (typeof window !== 'undefined' || typeof process !== 'object' || process.pid !== owner.pid || process.execPath !== owner.binary || process.env.HOME !== owner.home || process.getBuiltinModule?.('node:worker_threads')?.isMainThread !== true) throw new Error('Refusing a foreign or non-main loop target.');
    } else if (typeof window !== 'object' || typeof document !== 'object') throw new Error('Renderer loop target is not a page.');
    globalThis[key]?.sampler.stop();
    const sampler=(${createLoopSampler.toString()})({everyMs:${JSON.stringify(everyMs)},maxEvents:${JSON.stringify(maxEvents)}});
    const meta={revision:2,kind,token:${JSON.stringify(token)},epochStartMs:performance.timeOrigin+sampler.snapshot().startedAt};
    globalThis[key]={sampler,meta};
    return {...meta,...sampler.snapshot()};
  })()`);
}

export async function readLoopProbe(cdp, kind, { token, stop = false, waitForSample = false } = {}) {
  const key = keyFor(kind);
  return cdp.evaluate(`(async () => {
    const p=globalThis[${JSON.stringify(key)}];
    if(!p || (${JSON.stringify(token ?? null)} !== null && p.meta.token !== ${JSON.stringify(token ?? null)})) throw new Error('Loop probe missing or replaced.');
    if(${JSON.stringify(waitForSample)}) await p.sampler.ready();
    if(${JSON.stringify(stop)}) p.sampler.stop();
    return {...p.meta,...p.sampler.snapshot()};
  })()`);
}
