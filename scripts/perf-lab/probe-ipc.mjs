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
// from inside an IPC handler (ipc-handlers.ts:2489). On a large transcript that is
// seconds during which the whole app is frozen.
//
// HOW: ping `window.claude.getPlatform()` on a fixed interval and record the
// round-trip. Its handler is `() => process.platform` (ipc-handlers.ts:1387-1389)
// — a constant, zero work — so every millisecond measured is queueing and thread
// availability, never handler cost.
//
// READING THE RESULT: this measures END-TO-END unresponsiveness, which is what a
// user feels, and a renderer block delays the ping too. To attribute a stall,
// read it ALONGSIDE the renderer long-task probe:
//   ping stalled + renderer long task at the same moment -> the RENDERER blocked
//   ping stalled + renderer idle                          -> the MAIN PROCESS blocked
// The second is the app-wide freeze, and the one the plain long-task number misses.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).

/** Start pinging. Replaces any previous probe so repeated passes cannot stack. */
export async function installIpcStallProbe(cdp, { everyMs = 100 } = {}) {
  return cdp.evaluate(`(() => {
    try { if (window.__ipcStall && window.__ipcStall.stop) window.__ipcStall.stop(); } catch (e) { /* none installed */ }
    const t0 = performance.now();
    const samples = [];          // [tRel, roundTripMs]
    let timer = 0, inFlight = false, missed = 0;
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
      const e = performance.now();
      samples.push([Math.round(s - t0), Math.round(e - s), rejected ? 1 : 0]);
      outstanding = null;
      inFlight = false;
    };
    timer = setInterval(ping, ${everyMs});
    window.__ipcStall = {
      t0, samples, everyMs: ${everyMs},
      missedTicks: () => missed,
      // How long the currently-outstanding ping has been waiting, right now.
      // null when nothing is in flight. This is the only way to see a stall that
      // has not ENDED yet — including one that never will.
      openStallMs: () => (outstanding === null ? null : Math.round(performance.now() - outstanding[1])),
      rejected: () => samples.reduce((a, s) => a + (s[2] ? 1 : 0), 0),
      stop() { if (timer) clearInterval(timer); timer = 0; },
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
      pings: p.samples.length,
      openStallMs: openMs,
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
