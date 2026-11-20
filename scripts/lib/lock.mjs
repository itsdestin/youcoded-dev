// scripts/lib/lock.mjs — the one self-clearing lock every workspace script uses.
//
// WHY: each script used to keep its own lock folder/file, and a crashed run left it behind,
// blocking the next session until someone deleted it by hand (or, for shoot, for two minutes).
// This helper records WHO holds the lock (pid, host, process start time, when) and treats the
// lock as abandoned when that process is gone, when the pid now belongs to a different process,
// or when the lock is older than a ceiling. Same idea as the app's backup-lock takeover.
//
// Shape on disk: a directory <lockPath>/ holding owner.json. A directory (not a file) because
// mkdir is atomic, and prune-worktrees / existing tests look for the folder by name.
//
// Race rules:
//  * Creating the lock is mkdir: exactly one concurrent caller wins.
//  * Taking over an abandoned lock is a rename of the old folder to a private name: rename is
//    atomic, so only one taker moves it. The taker then re-reads the moved owner; if it is not
//    the abandoned owner it judged (someone else took over first and the folder we moved is
//    LIVE), it puts it back and backs off. Nothing here ever signals or kills a process.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

/** Linux process start time (clock ticks since boot) as a string, or null when unknown/absent. */
export function processStartTime(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // comm (field 2) may contain spaces/parens: split after the LAST ')'. starttime is field 22.
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    return /^\d+$/.test(start ?? '') ? start : null;
  } catch { return null; }
}

/** true = running, false = gone, null = cannot tell (treated as running by callers). */
export function pidState(pid) {
  try { process.kill(pid, 0); return true; } catch (e) {
    if (e.code === 'ESRCH') return false;
    return e.code === 'EPERM' ? true : null;
  }
}

function readOwner(lockPath) {
  try { return JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8')); } catch { return null; }
}

function ageMs(lockPath, owner, now) {
  const at = owner?.acquiredAt ? Date.parse(owner.acquiredAt) : NaN;
  if (Number.isFinite(at)) return now - at;
  try { return now - fs.statSync(lockPath).mtimeMs; } catch { return 0; }
}

/** Is this lock abandoned? Pure judgment; changes nothing. Unverifiable = not stale (until the ceiling). */
export function isStale(lockPath, { maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now(), host = os.hostname() } = {}) {
  const owner = readOwner(lockPath);
  if (ageMs(lockPath, owner, now) > maxAgeMs) return { stale: true, owner, why: 'older than the ceiling' };
  if (!owner || !Number.isInteger(owner.pid)) return { stale: false, owner }; // mid-write or hand-made: wait for the ceiling
  if (owner.host && owner.host !== host) return { stale: false, owner };      // another machine's pid means nothing here
  if (pidState(owner.pid) === false) return { stale: true, owner, why: 'owner process is gone' };
  if (owner.startTime) {
    const current = processStartTime(owner.pid);
    if (current !== null && current !== owner.startTime) return { stale: true, owner, why: 'pid reused by another process' };
  }
  return { stale: false, owner };
}

const same = (a, b) => a && b && a.pid === b.pid && a.startTime === b.startTime && a.acquiredAt === b.acquiredAt;

/**
 * Try once to take the lock. Returns { acquired: true, path, release() } or
 * { acquired: false, path, owner } (owner may be null). `beforeOwnerWrite(lockPath)` is a test hook.
 */
export function tryAcquireLock(lockPath, { maxAgeMs = DEFAULT_MAX_AGE_MS, beforeOwnerWrite = null, now = Date.now } = {}) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const verdict = isStale(lockPath, { maxAgeMs, now: now() });
      if (!verdict.stale) return { acquired: false, path: lockPath, owner: verdict.owner };
      const aside = `${lockPath}.stale-${process.pid}-${Date.now()}`;
      try { fs.renameSync(lockPath, aside); } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'ENOTEMPTY' || e.code === 'EEXIST') continue; // someone else moved it: look again
        throw e;
      }
      const moved = readOwner(aside);
      // A lock with no owner never matched a judged pid; compare owners only when we judged one.
      if (verdict.owner && !same(moved, verdict.owner)) {
        // We moved a different (live) lock than the one we judged. Put it back if we can.
        try { fs.renameSync(aside, lockPath); } catch { fs.rmSync(aside, { recursive: true, force: true }); }
        return { acquired: false, path: lockPath, owner: moved };
      }
      fs.rmSync(aside, { recursive: true, force: true });
      continue; // folder is free now: loop and mkdir
    }
    const owner = { pid: process.pid, host: os.hostname(), startTime: processStartTime(process.pid), acquiredAt: new Date(now()).toISOString() };
    try {
      beforeOwnerWrite?.(lockPath);
      const file = path.join(lockPath, 'owner.json');
      fs.writeFileSync(file, `${JSON.stringify(owner, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      // WHY: mkdir proved this call owns the new folder; do not leave an owner-less lock behind.
      fs.rmSync(lockPath, { recursive: true, force: true });
      throw error;
    }
    let released = false;
    return { acquired: true, path: lockPath, owner, release() {
      if (released) return; released = true;
      // Remove only if still ours: after a takeover the folder may belong to someone else.
      if (same(readOwner(lockPath), owner)) fs.rmSync(lockPath, { recursive: true, force: true });
    } };
  }
  return { acquired: false, path: lockPath, owner: readOwner(lockPath) };
}

/** Wait (polling) up to timeoutMs for the lock. Resolves to the same shape as tryAcquireLock. */
export async function acquireLock(lockPath, { timeoutMs = 0, pollMs = 200, ...rest } = {}) {
  for (const until = Date.now() + timeoutMs; ; await new Promise(r => setTimeout(r, pollMs))) {
    const got = tryAcquireLock(lockPath, rest);
    if (got.acquired || Date.now() >= until) return got;
  }
}
