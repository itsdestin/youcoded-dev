// Observed availability, not guessed causes. In particular, a supported long-task
// observer can report ZERO while CDP-executed JS blocks the renderer for seconds.
const measurement = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export const STALL_MEASUREMENT_REVISION = 2;

/** WHY availability alone is not evidence: a probe can attach but never tick,
 * remain running, or observe an invalid clock. No cross-clock intersection is
 * performed here; independent peaks describe their own observation window only. */
export function validIndependentMain(p) {
  return p?.available === true && p.invalidClock === false && p.stopped === true
    && Number.isInteger(p.sampleCount) && p.sampleCount >= 2
    && measurement(p.everyMs) > 0 && measurement(p.observedMs) > 0
    && measurement(p.maxDelayMs) !== null;
}

/** WHY share this check: quiet completed responses cannot certify coverage when
 * a later ping is still outstanding or the renderer could not schedule samples. */
export function completeIpcEvidence(ipc) {
  return ipc != null && !ipc.error && ipc.openStallMs === null
    && ipc.rejectedPings === 0 && ipc.sawHidden === false
    && Number.isInteger(ipc.pings) && ipc.pings > 0
    && Number.isInteger(ipc.tickSamples) && ipc.tickSamples > 0
    && measurement(ipc.observedMs) > 0 && measurement(ipc.maxTickDelayMs) !== null
    && measurement(ipc.maxMs) !== null;
}

/** Independent main is optional; missing evidence cannot incriminate main. */
export function attributeStall(ipc, probe, { stallMs = 250, independentMain = null } = {}) {
  const finished = measurement(ipc?.maxMs);
  const pending = measurement(ipc?.openStallMs);
  const ipcMax = finished === null && pending === null ? null : Math.max(finished ?? 0, pending ?? 0);
  const longtask = probe?.longtaskSupported === false ? null : measurement(probe?.longtaskMaxMs);
  const schedule = measurement(ipc?.maxTickDelayMs);
  const frame = measurement(probe?.frameGapMaxMs);
  const main = validIndependentMain(independentMain) ? independentMain.maxDelayMs : null;
  const hidden = ipc?.sawHidden === true;
  const renderer = Math.max(longtask ?? 0, hidden ? 0 : (schedule ?? 0));
  // WHY positive observations survive incomplete coverage: missing/hidden/rejected
  // samples weaken a healthy verdict, not the stalls already observed.
  // Explicit missing window/mark evidence differs from a legacy full-window probe
  // that has no windowMs field. Either failure weakens coverage, not observed peaks.
  const missingRendererWindow = probe?.missingMark != null
    || (Object.hasOwn(probe ?? {}, 'windowMs') && !(measurement(probe.windowMs) > 0));
  const incomplete = !completeIpcEvidence(ipc) || missingRendererWindow
    || probe?.error || probe?.errors?.length > 0;
  const coverage = incomplete ? ' Coverage is incomplete (pending, hidden, rejected or missing observations); this is not a healthy result.' : '';
  if (main !== null && main > stallMs) {
    if (renderer > stallMs) return {
      verdict: 'unclear', why: `Independent main-loop delay was ${main}ms and renderer delay was ${renderer}ms; both were affected, so one cause cannot be assigned.`,
    };
    return { verdict: 'main', why: `Independent main-loop sampling observed a ${main}ms delay; main-thread unresponsiveness was measured directly.` };
  }
  if (renderer > stallMs) {
    if (ipcMax !== null && ipcMax > renderer * 2) return {
      verdict: 'unclear', why: `A ${renderer}ms renderer delay was observed, but does not explain the ${ipcMax}ms IPC delay; additional delay remains unattributed.`,
    };
    return { verdict: 'renderer', why: `The renderer had a ${renderer}ms task or scheduling delay. Fast completed IPC samples cannot erase that observed stall.${coverage}` };
  }
  if (frame !== null && frame > stallMs) return {
    verdict: 'unclear', why: `Frames were delayed ${frame}ms without a matching measured loop stall; rendering/presentation or an unobserved thread delay remains possible.`,
  };
  if (longtask === null && schedule === null && main === null) return {
    verdict: 'unknown', why: 'The thread probes supplied no usable observations; an IPC delay alone cannot locate the stall.',
  };
  if (ipcMax !== null && ipcMax > stallMs) return {
    verdict: 'unclear', why: `IPC was delayed ${ipcMax}ms, but a low long-task reading does not prove the renderer was idle or that main blocked.`,
  };
  if (incomplete || ipcMax === null || (longtask === null && schedule === null)) return {
    verdict: 'unknown', why: 'A required probe reported no usable data; absence of observations is not a healthy result.',
  };
  return { verdict: 'none', why: `No observed IPC, renderer, frame or available main-loop delay exceeded ${stallMs}ms.` };
}
