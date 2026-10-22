// scripts/perf-lab/background-window.mjs — wire background-cost.mjs to a bounded leg of a run.
//
// Takes a CPU-time / context-switch reading of the owned app family at the start and end of a window and
// reports the difference. These are WORK counters: CPU seconds are time the processes were scheduled, and
// context switches are scheduler events. They are not watts, energy or battery cost.
//
// WHY survivors: backgroundDelta refuses a window whose process list changed (a pid that appeared or
// vanished cannot be priced honestly). A renderer or utility that exits mid-leg would otherwise turn the whole
// reading into 'incomplete'. We keep the strict path first; if members vanished we re-read only the survivors
// and say so (`membership`), never counting a vanished process as zero.
import { readFileSync } from 'node:fs';
import { readClockTicks, readBackgroundSnapshot, backgroundDelta } from './background-cost.mjs';
import { killableFamily } from './launch.mjs';

const WORK_LABEL = 'CPU time and context switches are work counters, not energy, watts or battery cost';
const bootId = () => readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();

/** Owned family pids = the launched candidate's processes, minus anything protected or belonging to this rig. */
export const ownedFamilyPids = app => killableFamily(app.familyNeedles).pids;

export async function beginBackgroundWindow(app, label, deps = {}) {
  const { pids = ownedFamilyPids, clock = readClockTicks, snapshot = readBackgroundSnapshot, epoch = bootId } = deps;
  try {
    const hz = await clock();
    if (hz.status !== 'supported') return { label, failed: { status: hz.status, reason: hz.reason } };
    const members = pids(app);
    const before = await snapshot(members, { hz: hz.hz, epoch: epoch() });
    return { label, hz: hz.hz, epoch: epoch(), members, before };
  } catch (e) { return { label, failed: { status: 'failed', reason: e.message } }; }
}

export async function endBackgroundWindow(app, handle, deps = {}) {
  const { pids = ownedFamilyPids, snapshot = readBackgroundSnapshot, delta = backgroundDelta } = deps;
  const out = { label: handle.label, workLabel: WORK_LABEL, powerAttribution: false };
  if (handle.failed) return { ...out, status: handle.failed.status, reason: handle.failed.reason };
  try {
    let after = await snapshot(handle.members, { hz: handle.hz, epoch: handle.epoch });
    let before = handle.before;
    const nowMembers = pids(app);
    const startedWith = handle.members.length, appeared = nowMembers.filter(p => !handle.members.includes(p));
    let vanished = [];
    if (after.status === 'incomplete' && after.processes.length) {
      // Re-read only the processes still alive, and compare them against their own start readings.
      vanished = (after.errors ?? []).map(e => e.pid);
      const survivors = after.processes.map(p => p.pid);
      after = await snapshot(survivors, { hz: handle.hz, epoch: handle.epoch });
      before = { ...before, status: 'supported', processes: before.processes.filter(p => survivors.includes(p.pid)) };
    }
    const d = delta(before, after);
    const wholeFamily = !vanished.length && !appeared.length;
    return { ...out, status: d.status, reason: d.reason, delta: d.status === 'supported' ? d : undefined,
      membership: { startedWith, measured: after.processes?.length ?? 0, vanished, appeared, wholeFamily,
        note: wholeFamily ? 'same processes at both ends' : 'processes that vanished or appeared during the window are NOT priced (not zero)' } };
  } catch (e) { return { ...out, status: 'failed', reason: e.message }; }
}
