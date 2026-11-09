// scripts/perf-lab/run-lock.mjs — one measuring run at a time (acceptance A5).
//
// WHY: two runs sharing the fixed CDP port, display and fixture HOME would corrupt each
// other AND compete for CPU, so each would measure noise. The lock lives under the lab
// SCRATCH. It records pid + process start time, because a bare pid can be reused by an
// unrelated process after a crash. A lock is declared stale ONLY when that pid is gone or
// has a different start time; anything unverifiable (corrupt file, unreadable /proc)
// refuses. This module never signals or kills any process.
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

/** Linux process start time (clock ticks since boot) or null when the pid does not exist. */
export function procStartTime(pid, { read = readFileSync } = {}) {
  let stat;
  try { stat = read(`/proc/${pid}/stat`, 'utf8'); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ESRCH') return null; throw e; }
  // comm (field 2) may contain spaces/parens, so split after the LAST ')'. starttime is field 22.
  const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const start = rest[19];
  if (!/^\d+$/.test(start ?? '')) throw new Error(`cannot parse start time of pid ${pid}`);
  return start;
}

export function acquireRunLock(lockPath, { pid = process.pid, startTime = procStartTime, now = () => new Date().toISOString(), label = '' } = {}) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const mine = { pid, startTime: startTime(pid), createdAt: now(), label };
  if (mine.startTime === null) throw new Error(`run lock: cannot read own process start time (pid ${pid})`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600);
      try { writeSync(fd, JSON.stringify(mine)); } finally { closeSync(fd); }
      let released = false;
      return { path: lockPath, owner: mine, release() {
        if (released) return; released = true;
        // Only remove the lock if it is still ours.
        try { const cur = JSON.parse(readFileSync(lockPath, 'utf8')); if (cur.pid === pid && cur.startTime === mine.startTime) unlinkSync(lockPath); } catch { /* already gone */ }
      } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let held;
    try { held = JSON.parse(readFileSync(lockPath, 'utf8')); } catch (e) {
      if (e.code === 'ENOENT') continue;           // released between our two calls: retry
      throw new Error(`run lock ${lockPath} exists but cannot be read/parsed (${e.message}); not removing it automatically — inspect it, and delete it only if no lab run is active`);
    }
    if (!Number.isInteger(held?.pid) || typeof held?.startTime !== 'string') throw new Error(`run lock ${lockPath} is malformed; not removing it automatically — inspect it`);
    const current = startTime(held.pid);
    if (current !== null && current === held.startTime) throw new Error(`another perf-lab run holds the lock (pid ${held.pid}, started ${held.createdAt}${held.label ? `, ${held.label}` : ''}); wait for it to finish — lock ${lockPath}`);
    // Verified stale: that pid is gone or reused by a different process. Rename first so two
    // contenders cannot both delete a lock the other just re-created.
    const aside = `${lockPath}.stale-${pid}-${Date.now()}`;
    try { renameSync(lockPath, aside); unlinkSync(aside); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw new Error(`run lock ${lockPath}: could not acquire after retries (contention)`);
}
