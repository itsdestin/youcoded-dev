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
//  * Only a taker deletes a lock, and only while holding a small side lock (<lockPath>.takeover, also
//    mkdir). Inside it, the taker re-checks that the folder is STILL the exact one it judged abandoned
//    (same inode, same owner record) before removing it. WHY (review 2026-11-27): the first version moved
//    the folder aside first, and a slow taker could move a brand-new LIVE lock, leaving two holders.
//    A fresh lock always has a new inode, and mkdir cannot recreate the path while the dead one still
//    exists, so nothing live can be removed. Nothing here ever signals or kills a process.
//  * A side lock left by a taker that crashed mid-takeover (milliseconds of work) is cleared after
//    TAKEOVER_STALE_MS.
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

const same = (a, b) => (a === null && b === null) || (!!a && !!b && a.pid === b.pid && a.startTime === b.startTime && a.acquiredAt === b.acquiredAt);
const inode = (p) => { try { return fs.statSync(p).ino; } catch { return null; } };

export const TAKEOVER_STALE_MS = 30_000;

/** Remove an abandoned lock, but only if it is still the exact folder that was judged. true = removed. */
export function removeIfStillAbandoned(lockPath, judgedIno, judgedOwner) {
  const side = `${lockPath}.takeover`;
  try { fs.mkdirSync(side); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Another taker is at work, or one crashed mid-takeover. Clear only a long-abandoned side lock.
    try { if (Date.now() - fs.statSync(side).mtimeMs > TAKEOVER_STALE_MS) fs.rmSync(side, { recursive: true, force: true }); } catch { /* gone already */ }
    return false;
  }
  try {
    if (inode(lockPath) !== judgedIno || !same(readOwner(lockPath), judgedOwner)) return false; // replaced: leave it
    fs.rmSync(lockPath, { recursive: true, force: true });
    return true;
  } finally { fs.rmSync(side, { recursive: true, force: true }); }
}

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
      const judgedIno = inode(lockPath);
      const verdict = isStale(lockPath, { maxAgeMs, now: now() });
      if (!verdict.stale) return { acquired: false, path: lockPath, owner: verdict.owner };
      if (judgedIno === null) continue; // released while we looked: try mkdir again
      if (!removeIfStillAbandoned(lockPath, judgedIno, verdict.owner ?? null)) return { acquired: false, path: lockPath, owner: readOwner(lockPath) };
      continue; // folder is free now: loop and mkdir
    }
    const owner = { pid: process.pid, host: os.hostname(), startTime: processStartTime(process.pid), acquiredAt: new Date(now()).toISOString() };
    try {
      beforeOwnerWrite?.(lockPath);
      const file = path.join(lockPath, 'owner.json');
      fs.writeFileSync(file, `${JSON.stringify(owner, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      // WHY: mkdir proved this call owns the new folder; do not leave an owner-less lock behind.
      // Only remove it while it carries no owner or ours (never another process's lock).
      const there = readOwner(lockPath);
      if (there === null || same(there, owner)) fs.rmSync(lockPath, { recursive: true, force: true });
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
