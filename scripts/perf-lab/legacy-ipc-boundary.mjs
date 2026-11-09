import { readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';

const bounded = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Legacy IPC boundary did not answer before controller deadline')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/** WHY a boundary handshake, not a new probe: install already sends an immediate
 * ping. Its await can still be unresolved when a fast operation ends, and no timer
 * may yet have fired. Wait for actual timer/reply readiness BEFORE operation timing;
 * drain AFTER the end mark. Atomic idle-check+stop prevents a new ping between the
 * final read and stop. We never clear pending state or count a timeout as a reply.
 * IPC evidence includes this explicitly labeled setup/drain, not operation-only time.
 * The existing common/document probe implementation and semantics stay untouched. */
export async function ipcBoundary(cdp, { stop = false, timeoutMs = 1000 } = {}) {
  return bounded(cdp.evaluate(`(async () => {
    // perf-lab: legacy IPC boundary
    const p = window.__ipcStall;
    if (!p) throw new Error('Legacy IPC probe missing at boundary');
    const began = performance.now();
    while (true) {
      const ready = p.tickSamples() > 0 && p.samples.length > 0 && p.openStallMs() === null;
      if (ready || performance.now() - began >= ${timeoutMs}) {
        if (${stop}) p.stop();
        return { ready, elapsedMs: performance.now() - began, stopped: ${stop},
          scope: 'IPC setup + operation + bounded drain; renderer marks exclude setup/drain' };
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  })()`), timeoutMs + 1000);
}

export async function finishLegacyIpc(cdp, options = {}) {
  let boundary = null, boundaryError = null;
  try { boundary = await ipcBoundary(cdp, { ...options, stop: true }); }
  catch (error) { boundaryError = error.message; }
  // Always stop even when the boundary/controller failed; stop freezes outstanding
  // evidence rather than manufacturing a successful completed ping.
  try { await bounded(stopIpcStallProbe(cdp), 1000); } catch (error) { boundaryError ??= error.message; }
  try {
    const read = await bounded(readIpcStallProbe(cdp), 1000);
    return { ...read, boundary, ...(!boundary?.ready || boundaryError ? { error: boundaryError ?? 'Legacy IPC readiness/drain deadline exceeded' } : {}) };
  } catch (error) { return { error: error.message, boundary }; }
}
