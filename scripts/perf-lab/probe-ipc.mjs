// scripts/perf-lab/probe-ipc.mjs — detects WHOLE-APP stalls, not just renderer jank.
//
// WHY this exists, and why it is separate from the renderer long-task probe:
// Destin reports the app "freezing up fully" — every animation app-wide slows,
// clicks stop registering. That is not incremental slowness in one component; it
// is the signature of a BLOCKED SINGLE THREAD. And the rig could not see it,
// because scenario-workload's probe only watches the RENDERER's main thread.
//
// The main process is single-threaded too, and it serves IPC for every session.
// When it blocks, nothing in the app can proceed: no session gets a reply, no
// window updates. A concrete instance is already in the source —
// TranscriptWatcher.getHistory (transcript-watcher.ts:451-488) does a
// synchronous fs.readFileSync of an ENTIRE transcript and then parses every line,
// from inside an IPC handler (main/ipc/session.ts, the session:history entry). On a large transcript that is
// seconds during which the whole app is frozen.
//
// HOW: ping `window.claude.getPlatform()` on a fixed interval and record the
// round-trip. Its handler is `() => process.platform` (main/ipc/ui.ts, the platform:get entry)
// — a constant, zero work — so every millisecond measured is queueing and thread
// availability, never handler cost.
//
// READING THE RESULT: this measures END-TO-END unresponsiveness, which is what a
// user feels, and a renderer block delays the ping too. To attribute a stall,
// read it ALONGSIDE the renderer long-task probe:
// Record ping scheduling delay as well as round trips: a renderer can block
// BEFORE a timer sends its ping, then report a fast reply afterward. A supported
// long-task observer can also miss that block. Main-process attribution requires
// an independent main-loop sample; absence of renderer entries is not that sample.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).

/** Start pinging. Replaces any previous probe so repeated passes cannot stack. */
export async function installIpcStallProbe(cdp, { everyMs = 100 } = {}) {
  if (!Number.isInteger(everyMs) || everyMs <= 0) throw new Error('IPC probe period must be a positive integer.');
  return cdp.evaluate(`(() => {
    try { if (window.__ipcStall && window.__ipcStall.stop) window.__ipcStall.stop(); } catch (e) { /* none installed */ }
    const t0 = performance.now();
    const samples = [];          // [tRel, roundTripMs]
    let timer = 0, inFlight = false, missed = 0;
    let stoppedAt = null, lastTick = t0, maxTickDelay = 0, tickSamples = 0;
    const clock = () => stoppedAt === null ? performance.now() : stoppedAt;
    const doc = typeof document === 'object' ? document : null;
    const visibilityAtStart = doc?.visibilityState ?? null;
    let sawHidden = visibilityAtStart === 'hidden', visibilityAtStop = null;
    const onVisibility = () => { sawHidden ||= doc?.visibilityState === 'hidden'; };
    doc?.addEventListener?.('visibilitychange', onVisibility);
    // The still-outstanding ping, if any: [tRel, sentAtPerfNow]. Kept OUTSIDE the
    // ping closure so a reader can see a ping that has not come back yet.
    //
    // WHY THIS EXISTS. The first version pushed a sample only AFTER its await
    // resolved. So a ping that NEVER came back — a main process wedged for the
    // rest of the run — produced no sample at all: pings 0, maxMs null,
    // totalStallMs 0. The most catastrophic possible result was indistinguishable
    // from a perfectly responsive app, and it is the reading a keep/reject gate
    // would have accepted as a large improvement.
    let outstanding = null;
    const ping = async () => {
      if (stoppedAt !== null) return;
      // Never overlap: if a ping is still outstanding the main process is busy,
      // and issuing more would queue behind it and measure our own backlog.
      if (inFlight) { missed++; return; }
      inFlight = true;
      const s = performance.now();
      outstanding = [Math.round(s - t0), s];
      let rejected = false;
      try { await window.claude.getPlatform(); }
      // A rejected ping still tells us the round trip took this long — but it is
      // NOT the same evidence as a completed one. A surface that rejects
      // instantly would otherwise log ~0ms as a healthy round trip forever.
      catch (e) { rejected = true; }
      // Keep the pending-at-stop observation; a later reply is not a completed
      // in-window sample and must not move the measurement's end time.
      if (stoppedAt !== null) return;
      const e = performance.now();
      samples.push([Math.round(s - t0), Math.round(e - s), rejected ? 1 : 0]);
      outstanding = null;
      inFlight = false;
    };
    timer = setInterval(() => {
      if (stoppedAt !== null) return;
      const n = performance.now();
      maxTickDelay = Math.max(maxTickDelay, n - lastTick - ${everyMs});
      lastTick = n; tickSamples++;
      void ping();
    }, ${everyMs});
    // Otherwise a short operation can finish before the first timer fires.
    void ping();
    window.__ipcStall = {
      revision: 2, t0, samples, everyMs: ${everyMs},
      observedMs: () => Math.round(clock() - t0),
      tickSamples: () => tickSamples,
      // Includes a timer that is already late but has not run yet, even the first.
      maxTickDelayMs: () => Math.round(Math.max(maxTickDelay, clock() - lastTick - ${everyMs}, 0)),
      visibility: () => ({ visibilityAtStart, visibilityAtEnd: stoppedAt === null ? doc?.visibilityState ?? null : visibilityAtStop, sawHidden }),
      missedTicks: () => missed,
      // How long the currently-outstanding ping has been waiting, right now.
      // null when nothing is in flight. This is the only way to see a stall that
      // has not ENDED yet — including one that never will.
      openStallMs: () => (outstanding === null ? null : Math.round(clock() - outstanding[1])),
      rejected: () => samples.reduce((a, s) => a + (s[2] ? 1 : 0), 0),
      stop() {
        if (stoppedAt === null) { stoppedAt = performance.now(); visibilityAtStop = doc?.visibilityState ?? null; }
        if (timer) clearInterval(timer); timer = 0;
        doc?.removeEventListener?.('visibilitychange', onVisibility);
      },
    };
    return true;
  })()`);
}

export async function stopIpcStallProbe(cdp) {
  return cdp.evaluate(`(() => { if (!window.__ipcStall) return false; window.__ipcStall.stop(); return true; })()`);
}

/**
 * Totals. Thresholds are chosen against what a person actually perceives:
 *   >100ms  a click feels laggy
 *   >250ms  the UI feels stuck
 *   >1000ms the app looks frozen — this is the number that matches the complaint
 */
export async function readIpcStallProbe(cdp) {
  return cdp.evaluate(`(() => {
    const p = window.__ipcStall;
    if (!p) throw new Error('readIpcStallProbe: window.__ipcStall is not installed — installIpcStallProbe() was never run on this page, or the page reloaded since.');
    const rt = p.samples.map((s) => s[1]).sort((a, b) => a - b);
    const at = (q) => (rt.length ? rt[Math.min(rt.length - 1, Math.floor(rt.length * q))] : null);
    const over = (n) => p.samples.filter((s) => s[1] > n).length;
    // Time spent unresponsive, counting only the part of each stall beyond the
    // ping interval — the interval itself is not a stall.
    const stallMs = p.samples.reduce((a, s) => a + Math.max(0, s[1] - p.everyMs), 0);
    // A ping that is STILL outstanding when we read the probe. A wedged main
    // process produces exactly this and no completed sample, so without it the
    // worst possible outcome reads as pings 0 / stall 0 — a clean bill of health.
    const openMs = p.openStallMs ? p.openStallMs() : null;
    return {
      revision: p.revision ?? null,
      pings: p.samples.length,
      openStallMs: openMs,
      observedMs: p.observedMs?.() ?? null,
      tickSamples: p.tickSamples?.() ?? null,
      maxTickDelayMs: p.maxTickDelayMs?.() ?? null,
      ...(p.visibility?.() ?? {}),
      // Round trips that came back as a REJECTION rather than a reply. A surface
      // that fails instantly logs ~0ms, which looks like a very fast app.
      rejectedPings: p.rejected ? p.rejected() : 0,
      missedTicks: p.missedTicks(),
      medianMs: at(0.5), p95Ms: at(0.95), maxMs: rt.length ? rt[rt.length - 1] : null,
      over100ms: over(100), over250ms: over(250), over1000ms: over(1000),
      totalStallMs: Math.round(stallMs),
      // The five worst, with when they happened, so a stall can be lined up
      // against the renderer probe's long-task timestamps.
      worst: [...p.samples].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, ms]) => ({ atMs: t, roundTripMs: ms })),
    };
  })()`);
}
