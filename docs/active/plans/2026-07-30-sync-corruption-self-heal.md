---
status: active
date: 2026-07-30
spec: docs/active/specs/2026-07-30-sync-corruption-self-heal-design.md
repo: youcoded (desktop only)
branch: fix/sync-corruption-self-heal
---

# Sync Corruption Self-Heal + Honest Failures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-zero git exit in the sync transport can never masquerade as success; crash-corrupted sync repos repair themselves once per launch; the devices-list self row reports real sync recency.

**Architecture:** Invert the transport's failure default (benign becomes an explicit allowlist, corruption throws coded `repo-corrupt`), add a two-tier `repair()` to `GitTransport` (zero-byte purge + reset to `origin/main`; escalate to backup-aside + re-init), wire a once-per-launch heal into the engine's existing catch, and rewire `buildStatusData`'s self-recency fields off legacy marker files onto sync-spaces evidence.

**Tech Stack:** TypeScript (Electron main process), vitest with real-git integration harnesses (existing `sync-spaces-git-transport.test.ts` conventions).

## Global Constraints

- **Work in a git worktree** off `youcoded` master, branch `fix/sync-corruption-self-heal` (create via superpowers:using-git-worktrees at execution start). Sub-repo code goes to `youcoded`; the two docs-only tasks touch the `youcoded-dev` workspace repo.
- **Desktop main process only.** No Android work (no `syncspaces:*` Kotlin handlers exist). No renderer changes except none — the panel plumbing already handles `notice`/`error` events.
- **Annotate non-trivial edits with WHY comments** (Destin is a non-developer; this is a hard workspace rule).
- **Error copy:** specific + accurate (real stderr detail) or general + non-committal — never a guessed cause (`docs/error-message-standards.md`).
- **Test-file timeout conventions:** real-git test files carry `vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })`; engine fs-watch tests use the file's single `WAIT_MS = 60_000` knob with `vi.waitFor` — never inline timeout literals (see the header comments in both existing files).
- **`lastSyncEpoch` stays SECONDS on the `status:data` wire** — `SyncPanel.tsx:1717` multiplies by 1000; `sync-display-state.ts` consumes it as-is. Do not change the unit.
- **The worktree is read-only to the repair** — `repair()` writes only under `<root>/.youcoded/`.
- **Before claiming done:** `bash scripts/verify.sh <worktree>` green (tsc, related vitest, knip, ast-grep) plus the new test files.
- **Copy strings are load-bearing:** the heal notice is exactly `Sync repaired itself after a crash. Your files were untouched.` (approved in spec §3).

---

### Task 1: Land PR #248 (sequencing predecessor)

The spec (§5) sequences the same-family health-check fix first. It is finished work from 2026-07-24 sitting in the `sync-health` worktree with an open PR.

**Files:** none in this repo — GitHub merge + worktree cleanup.

- [ ] **Step 1: Check the PR's CI state**

Run: `cd ~/youcoded-dev/youcoded && gh pr view 248 --json state,mergeable,statusCheckRollup | head -50`
Expected: `state: OPEN`. If any check is red, look at WHICH: the known deterministic macOS red (`sync-spaces-engine.test.ts` "debounces file changes into one sync", ROADMAP `## Bugs`) does not block per existing precedent, but **anything else red → stop and ask Destin** before merging.

- [ ] **Step 2: Merge the PR**

Run: `gh pr merge 248 --merge`
Expected: merged into `itsdestin/youcoded` master.

- [ ] **Step 3: Sync master + clean up the worktree and branch**

```bash
cd ~/youcoded-dev/youcoded && git fetch origin && git checkout master && git pull origin master
git worktree remove ~/youcoded-dev/worktrees/sync-health
git push origin --delete fix/sync-health-primary-system 2>/dev/null || true  # skip if auto-deleted
git branch -D fix/sync-health-primary-system
git log --oneline -1   # confirm the merge commit is present
```

- [ ] **Step 4: Flip the ROADMAP entry**

In `~/youcoded-dev/ROADMAP.md`, the entry `- [ ] "No sync configured" fires on a machine whose GitHub sync is healthy` (`## Bugs`, added 2026-07-24): flip to `- [x]`, append `**MERGED <date> — youcoded PR #248, merge <sha>**` to its header line. Commit + push `youcoded-dev`:

```bash
cd ~/youcoded-dev && git add ROADMAP.md && git commit -m "docs(roadmap): PR #248 merged — flip the sync-health entry" && git push origin master
```

---

### Task 2: `classifyGitFailure` primitives (pure, TDD)

**Files:**
- Modify: `youcoded/desktop/src/main/sync-error-classifier.ts` (append; existing exports untouched)
- Test: `youcoded/desktop/tests/sync-error-classifier.test.ts` (append a new `describe`)

**Interfaces:**
- Produces (Task 3/4 consume):
  - `export const REPO_CORRUPT_ERROR_CODE = 'repo-corrupt'`
  - `export function matchGitCorruption(stderr: string): string | null` — the matched evidence line, or null
  - `export function isNetworkFailureStderr(stderr: string): boolean`
  - `export function stderrTail(stderr: string, max?: number): string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/sync-error-classifier.test.ts`:

```ts
import { matchGitCorruption, isNetworkFailureStderr, stderrTail, REPO_CORRUPT_ERROR_CODE } from '../src/main/sync-error-classifier';

describe('classifyGitFailure primitives', () => {
  it('recognizes the crash-corruption signatures', () => {
    // Real stderr captured from the 2026-07-27 Z13 incident.
    expect(matchGitCorruption('error: object file .git/objects/32/5153…bf8b94c is empty\nfatal: bad object HEAD')).toContain('is empty');
    expect(matchGitCorruption('fatal: bad object refs/heads/main')).toContain('bad object');
    expect(matchGitCorruption('error: unable to read 3251535497a31d0436ae0f81533468121bf8b94c')).toContain('unable to read');
    expect(matchGitCorruption('fatal: index file corrupt')).toContain('index file corrupt');
    expect(matchGitCorruption('fatal: not a git repository: /x/.youcoded/sync.git')).toContain('not a git repository');
    expect(matchGitCorruption('error: Unknown object type for 12ac40…')).toContain('Unknown object type');
    expect(matchGitCorruption('fatal: bad ref for refs/heads/main')).toContain('bad ref');
    expect(matchGitCorruption('error: loose object 99d1… is corrupt')).toContain('corrupt');
  });

  it('does NOT flag benign / unrelated failures as corruption', () => {
    // First push: origin/main doesn't exist yet — the ahead-probe's expected failure.
    expect(matchGitCorruption('fatal: Invalid revision range origin/main..main')).toBeNull();
    expect(matchGitCorruption("fatal: couldn't find remote ref main")).toBeNull();
    expect(matchGitCorruption('nothing to commit, working tree clean')).toBeNull();
    expect(matchGitCorruption("fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com")).toBeNull();
    expect(matchGitCorruption('')).toBeNull();
  });

  it('recognizes network failures (the silent-offline allowlist)', () => {
    expect(isNetworkFailureStderr('fatal: unable to access …: Could not resolve host: github.com')).toBe(true);
    expect(isNetworkFailureStderr('fatal: unable to access …: Connection timed out')).toBe(true);
    expect(isNetworkFailureStderr('ssh: connect to host github.com port 22: Network is unreachable')).toBe(true);
    expect(isNetworkFailureStderr("fatal: couldn't find remote ref main")).toBe(true); // empty remote: first device, pre-first-push
    expect(isNetworkFailureStderr('fatal: bad object HEAD')).toBe(false);
    expect(isNetworkFailureStderr('remote: Repository not found.')).toBe(false);
  });

  it('stderrTail keeps the end of long stderr (where git puts the fatal line)', () => {
    const s = 'error: line1\n'.repeat(200) + 'fatal: the actual cause';
    expect(stderrTail(s)).toContain('fatal: the actual cause');
    expect(stderrTail(s).length).toBeLessThanOrEqual(300);
    expect(stderrTail('short')).toBe('short');
    expect(REPO_CORRUPT_ERROR_CODE).toBe('repo-corrupt');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/youcoded-dev/worktrees/sync-self-heal/desktop && npx vitest run tests/sync-error-classifier.test.ts`
Expected: FAIL — `matchGitCorruption` is not exported.

- [ ] **Step 3: Implement**

Append to `src/main/sync-error-classifier.ts`:

```ts
// ---------------------------------------------------------------------------
// Git failure primitives (2026-07-30 corruption self-heal spec).
// WHY these live here: pure, no-import string classifiers beside the existing
// stderr→SyncWarning patterns, unit-tested without a GitTransport. The
// transport (git-transport.ts) consumes them to invert its failure default —
// benign is an explicit allowlist, never the silent fallthrough that let a
// crash-corrupted repo report "synced" for three days (2026-07-27 incident).
// ---------------------------------------------------------------------------

/** Machine-readable marker for a corrupt hidden sync repo — same mechanism as
 *  GITHUB_AUTH_ERROR_CODE: the engine copies it onto the 'error' event, and it
 *  is what triggers the transport's repair() path. Never string-match prose. */
export const REPO_CORRUPT_ERROR_CODE = 'repo-corrupt';

// Crash signatures: what git prints when loose objects / refs / the index were
// truncated by power loss. Sources: the 2026-07-27 Z13 forensics (zero-byte
// objects → "object file … is empty", "bad object", "Unknown object type",
// "unable to read") plus git's other integrity fatals. Deliberately NOT a
// generic /corrupt/ match — "corrupt" appears in unrelated advice text.
const CORRUPTION_PATTERNS: RegExp[] = [
  /object file .* is empty/i,
  /bad object/i,
  /unable to read/i,
  /index file corrupt/i,
  /index file smaller than expected/i,
  /not a git repository/i,
  /unknown object type/i,
  /bad ref/i,
  /loose object .* is corrupt/i,
  /missing (blob|tree|commit|object)/i,
];

/** The first stderr line evidencing repo corruption, or null. The line (not a
 *  boolean) so error messages can carry the real detail per
 *  docs/error-message-standards.md. */
export function matchGitCorruption(stderr: string): string | null {
  if (!stderr) return null;
  for (const line of stderr.split('\n')) {
    if (CORRUPTION_PATTERNS.some(p => p.test(line))) return line.trim();
  }
  return null;
}

// The silent-offline allowlist (spec §13 of the sync design: offline must
// never block or alarm). "couldn't find remote ref" is here because a freshly
// provisioned EMPTY remote fails `fetch origin main` with it — the normal
// first-device state, healed by the first push.
const NETWORK_PATTERNS: RegExp[] = [
  /could not resolve host/i,
  /unable to access/i,
  /connection timed out/i,
  /connection refused/i,
  /network is unreachable/i,
  /could not read from remote repository/i,
  /couldn't find remote ref/i,
  /operation timed out/i,
];

/** True when stderr looks like a network/offline failure (or an empty remote
 *  awaiting its first push) — the cases the transport keeps silent by design. */
export function isNetworkFailureStderr(stderr: string): boolean {
  return NETWORK_PATTERNS.some(p => p.test(stderr || ''));
}

/** Last `max` chars of stderr — git puts the fatal line at the END. */
export function stderrTail(stderr: string, max = 300): string {
  const s = (stderr || '').trim();
  return s.length <= max ? s : s.slice(s.length - max);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/sync-error-classifier.test.ts`
Expected: PASS (existing cases too).

- [ ] **Step 5: Commit**

```bash
git add src/main/sync-error-classifier.ts tests/sync-error-classifier.test.ts
git commit -m "feat(sync): pure git-failure classifiers — corruption + network allowlist"
```

---

### Task 3: Transport honesty — non-zero exits stop masquerading as success

**Files:**
- Modify: `youcoded/desktop/src/main/sync-spaces/git-transport.ts` (`push()` ~L256-291, `pull()` ~L320-403, plus two small helpers near `throwAuthFailure` ~L88)
- Test: `youcoded/desktop/tests/sync-spaces-git-transport.test.ts` (append to `GitTransport specifics`)

**Interfaces:**
- Consumes: Task 2's `matchGitCorruption`, `isNetworkFailureStderr`, `stderrTail`, `REPO_CORRUPT_ERROR_CODE`.
- Produces: `push()`/`pull()` now THROW (a) coded `repo-corrupt` errors on corruption, (b) plain errors with real stderr on unexplained local failures — Task 5's engine catch relies on `e.syncErrorCode === 'repo-corrupt'`. Benign returns unchanged for: nothing-to-push, no-remote, offline/empty-remote fetch, first-push ahead-probe.

- [ ] **Step 1: Write the failing tests**

Append to the `GitTransport specifics` describe in `tests/sync-spaces-git-transport.test.ts`:

```ts
  // ---- Honest failures (2026-07-30 spec §1). Pins the 2026-07-27 bug: a
  // crash-truncated loose object made every git op fail while push() returned
  // {pushed:false} ("nothing to push") — sync dead 3 days, panel green. ----

  /** Zero-byte-truncate the loose object HEAD points at — the exact artifact a
   *  power loss leaves (rename landed, content never flushed). */
  function corruptHeadObject(root: string): void {
    const gd = path.join(root, '.youcoded', 'sync.git');
    const env = { ...process.env, GIT_DIR: gd };
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { env }).toString().trim();
    fs.truncateSync(path.join(gd, 'objects', head.slice(0, 2), head.slice(2)), 0);
  }

  it('push() on a crash-corrupted repo throws coded repo-corrupt — never a silent {pushed:false}', async () => {
    const h = await makeHarness();
    const a = await h.makeDeviceSpace();
    fs.writeFileSync(path.join(a.root, 'one.md'), 'first');
    await h.transport.push(a, 'seed');           // HEAD + origin/main now exist
    corruptHeadObject(a.root);
    fs.writeFileSync(path.join(a.root, 'two.md'), 'second');
    await expect(h.transport.push(a, 'after crash')).rejects.toMatchObject({ syncErrorCode: 'repo-corrupt' });
    await h.cleanup();
  });

  it('pull() on a crash-corrupted repo throws coded repo-corrupt — never a silent {updated:false}', async () => {
    const h = await makeHarness();
    const a = await h.makeDeviceSpace();
    fs.writeFileSync(path.join(a.root, 'one.md'), 'first');
    await h.transport.push(a, 'seed');
    corruptHeadObject(a.root);
    fs.writeFileSync(path.join(a.root, 'two.md'), 'second'); // dirty → pull's snapshot commit must run
    await expect(h.transport.pull(a)).rejects.toMatchObject({ syncErrorCode: 'repo-corrupt' });
    await h.cleanup();
  });

  it('benign paths stay silent: first push against an empty remote still works end-to-end', async () => {
    // Guards the allowlist: unborn origin/main ("Invalid revision range"),
    // empty-remote fetch ("couldn't find remote ref") must NOT throw.
    const h = await makeHarness();
    const a = await h.makeDeviceSpace();
    fs.writeFileSync(path.join(a.root, 'one.md'), 'first');
    const pulled = await h.transport.pull(a);          // empty remote — benign
    expect(pulled.updated).toBe(false);
    const r = await h.transport.push(a, 'first push'); // no origin/main yet — benign probe failure
    expect(r.pushed).toBe(true);
    await h.cleanup();
  });

  it('an unexplained local git failure surfaces the real stderr, not a guess', async () => {
    const h = await makeHarness();
    const a = await h.makeDeviceSpace();
    fs.writeFileSync(path.join(a.root, 'one.md'), 'first');
    await h.transport.push(a, 'seed');
    // Make the repo unwritable in a NON-corruption way: replace the objects dir
    // with a file → git add fails with an EACCES/ENOTDIR-flavored error.
    const objects = path.join(a.root, '.youcoded', 'sync.git', 'objects');
    fs.rmSync(objects, { recursive: true, force: true });
    fs.writeFileSync(objects, 'not a directory');
    fs.writeFileSync(path.join(a.root, 'two.md'), 'second');
    await expect(h.transport.push(a, 'x')).rejects.toThrow(/Sync failed for|needs repair/);
    await h.cleanup();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-git-transport.test.ts -t 'repo-corrupt'`
Expected: FAIL — push resolves `{pushed:false}` instead of rejecting.

- [ ] **Step 3: Implement the helpers**

In `git-transport.ts`, extend the classifier import (top of file):

```ts
import { matchGitCorruption, isNetworkFailureStderr, stderrTail, REPO_CORRUPT_ERROR_CODE } from '../sync-error-classifier';
```

Below `throwAuthFailure` (~L92) add:

```ts
/** Throw the corruption as a coded error. The engine matches the CODE (never
 *  prose) to trigger repair(); the message still carries the real git line per
 *  docs/error-message-standards.md. */
function throwRepoCorrupt(spaceId: string, op: string, detail: string): never {
  const e: any = new Error(`Sync data for ${spaceId} needs repair (git ${op}: ${detail})`);
  e.syncErrorCode = REPO_CORRUPT_ERROR_CODE;
  throw e;
}
```

And two private methods on `GitTransport` (below `git()` ~L200):

```ts
  /** Guard for LOCAL git ops (add/diff/commit/checkout/rev-parse…): exit 0
   *  passes; corruption throws coded repo-corrupt; anything else throws with
   *  the REAL stderr. WHY (2026-07-27 incident): the old shape returned benign
   *  results on failure — a corrupt repo reported "nothing to push" for three
   *  days while the panel showed green. Benign is now an explicit allowlist
   *  via the `benign` predicate, never the fallthrough. */
  private assertLocalOk(space: SyncSpace, op: string, r: ExecResult, benign?: (r: ExecResult) => boolean): void {
    if (r.code === 0) return;
    if (benign?.(r)) return;
    const corrupt = matchGitCorruption(r.stderr);
    if (corrupt) throwRepoCorrupt(space.id, op, corrupt);
    throw new Error(`Sync failed for ${space.id} (git ${op}): ${stderrTail(r.stderr)}`);
  }

  /** Corruption-only guard for PROBE ops whose non-zero exit is often expected
   *  (ahead/behind rev-list before origin/main exists). Keeps the probe's
   *  benign fallthrough but refuses to let corruption ride it. */
  private throwIfCorrupt(space: SyncSpace, op: string, r: ExecResult): void {
    if (r.code === 0) return;
    const corrupt = matchGitCorruption(r.stderr);
    if (corrupt) throwRepoCorrupt(space.id, op, corrupt);
  }
```

- [ ] **Step 4: Thread the guards through `push()`**

Replace the body of `push()` (current L256-291) with:

```ts
  /** Stage everything, unstage+exclude oversize files, commit, push. */
  async push(space: SyncSpace, message: string): Promise<PushResult> {
    this.reapStaleLocks(space); // heal an orphaned lock from a crashed prior write
    const add = await this.git(space, ['add', '-A']);
    this.assertLocalOk(space, 'add', add);
    const oversize = await this.unstageOversize(space);
    const staged = await this.git(space, ['diff', '--cached', '--name-only']);
    this.assertLocalOk(space, 'diff', staged);
    let commit: string | undefined;
    if (staged.stdout.trim().length > 0) {
      const c = await this.git(space, ['commit', '-m', message]);
      // THE 2026-07-27 bug site: this used to `return {pushed:false}` on ANY
      // failure — indistinguishable from "nothing to push", so a corrupt repo
      // synced "green" forever. Benign allowlist: a commit race where another
      // cycle already committed the staged set ("nothing to commit").
      this.assertLocalOk(space, 'commit', c, (r) => /nothing to commit/i.test(r.stdout + r.stderr));
      const head = await this.git(space, ['rev-parse', 'HEAD']);
      this.assertLocalOk(space, 'rev-parse', head);
      commit = head.stdout.trim();
    }
    if (!(await this.hasRemote(space))) return { pushed: false, commit, oversize };
    const ahead = await this.git(space, ['rev-list', '--count', 'origin/main..main']);
    // origin/main may not exist yet (first push) — rev-list fails benignly;
    // push anyway. Corruption must not ride that fallthrough.
    this.throwIfCorrupt(space, 'rev-list', ahead);
    if (ahead.code === 0 && ahead.stdout.trim() === '0' && !commit) return { pushed: false, oversize };
    const p = await this.git(space, ['push', '-u', 'origin', 'main']);
    if (p.code !== 0) {
      // Non-fast-forward: another device pushed first. Merge, then push again.
      // The recovery pull's outcome MUST be surfaced on the result: it applies
      // the peer's changes, and discarding it made those changes invisible to
      // the engine's event (updated:false → no materialize sweep, no discovery,
      // no conflict notice) until some unrelated later pull — a stale-resume /
      // forked-transcript hazard on conversations (2026-07-15 review finding).
      const recovery = await this.pull(space);
      const retry = await this.git(space, ['push', '-u', 'origin', 'main']);
      if (retry.code !== 0) {
        // An auth-refused push must SURFACE (engine error event → red dot +
        // Reconnect CTA), never return a silent pushed:false — an expired
        // token would otherwise look like "nothing to push" forever.
        const auth = classifyGitAuthFailure(retry.stderr, retry.tokenUsed);
        if (auth) throwAuthFailure(auth);
        this.throwIfCorrupt(space, 'push', retry);
        // Offline stays silent by design (spec §13); every OTHER push refusal
        // (deleted repo, server-side hook, …) surfaces with the real stderr.
        if (!isNetworkFailureStderr(retry.stderr)) {
          throw new Error(`Sync push failed for ${space.id}: ${stderrTail(retry.stderr)}`);
        }
      }
      return { pushed: retry.code === 0, commit, oversize, updated: recovery.updated, conflictCopies: recovery.conflictCopies };
    }
    return { pushed: true, commit, oversize };
  }
```

- [ ] **Step 5: Thread the guards through `pull()`**

In `pull()` (current L320-348), apply the same treatment to the local ops — replace the snapshot block and the probe block:

```ts
  async pull(space: SyncSpace): Promise<PullResult> {
    this.reapStaleLocks(space); // heal an orphaned lock from a crashed prior write
    // Snapshot local changes first so merge never runs on a dirty tree.
    const add = await this.git(space, ['add', '-A']);
    this.assertLocalOk(space, 'add', add);
    await this.unstageOversize(space);
    const dirtyR = await this.git(space, ['diff', '--cached', '--name-only']);
    this.assertLocalOk(space, 'diff', dirtyR);
    const dirty = dirtyR.stdout.trim();
    if (dirty) {
      const snap = await this.git(space, ['commit', '-m', `local snapshot before merge (${this.deviceName})`]);
      this.assertLocalOk(space, 'commit', snap, (r) => /nothing to commit/i.test(r.stdout + r.stderr));
    }

    if (!(await this.hasRemote(space))) return { updated: false, conflictCopies: [] };
    const fetch = await this.git(space, ['fetch', 'origin', 'main']);
    if (fetch.code !== 0) {
      // Auth refusals must NOT masquerade as offline: "offline" is silent by
      // design (spec §13), so an expired/revoked credential would read as a
      // healthy-but-idle device forever. Same for corruption (2026-07-30 spec).
      // Every remaining fetch failure keeps the never-block offline contract.
      const auth = classifyGitAuthFailure(fetch.stderr, fetch.tokenUsed);
      if (auth) throwAuthFailure(auth);
      this.throwIfCorrupt(space, 'fetch', fetch);
      return { updated: false, conflictCopies: [] }; // offline — never block (spec §13)
    }
    // Fix: a fresh device has no local `main` yet (nothing committed). `main..origin/main`
    // errors on an unborn branch, so adopt the remote wholesale on first sync — this is
    // what lets a second device actually receive the first device's push.
    const localMain = await this.git(space, ['rev-parse', '--verify', '--quiet', 'main']);
    this.throwIfCorrupt(space, 'rev-parse', localMain);
    if (localMain.code !== 0) {
      const co = await this.git(space, ['checkout', '-B', 'main', 'origin/main']);
      // Used to return {updated:false} on failure — silent. A failed remote
      // adoption is a real error (corrupt local objects, unreadable remote tip).
      this.assertLocalOk(space, 'checkout', co);
      return { updated: true, conflictCopies: [] };
    }
    const behind = await this.git(space, ['rev-list', '--count', 'main..origin/main']);
    this.throwIfCorrupt(space, 'rev-list', behind);
    if (behind.code !== 0 || behind.stdout.trim() === '0') return { updated: false, conflictCopies: [] };
```

(The merge/conflict block below L350 is unchanged — its commit failure already throws.)

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tests/sync-spaces-git-transport.test.ts`
Expected: ALL pass — the 4 new cases AND every existing case (the contract suite is the regression net for the allowlist; a wrongly-strict guard breaks first-push/offline cases here).

- [ ] **Step 7: Commit**

```bash
git add src/main/sync-spaces/git-transport.ts tests/sync-spaces-git-transport.test.ts
git commit -m "fix(sync): non-zero git exits can no longer masquerade as success

Benign is now an explicit allowlist (nothing-to-push, first-push probes,
offline, empty remote); corruption throws coded repo-corrupt; everything
else throws with the real stderr. Pins the 2026-07-27 silent-outage bug."
```

---

### Task 4: `repair()` — two-tier heal in the transport

**Files:**
- Create: `youcoded/desktop/src/main/sync-spaces/repair.ts`
- Modify: `youcoded/desktop/src/main/sync-spaces/types.ts` (add `repair?` to `SyncTransport`)
- Modify: `youcoded/desktop/src/main/sync-spaces/git-transport.ts` (add `repair()` method)
- Test: `youcoded/desktop/tests/sync-spaces-repair.test.ts` (new)

**Interfaces:**
- Consumes: `GitTransport.git()`/`init()` (existing), Task 2's classifiers (indirectly — repair itself is trigger-agnostic).
- Produces (Task 5 consumes): `SyncTransport.repair?(space: SyncSpace): Promise<void>` — resolves when healed (Tier 1 or 2), rejects when the repo cannot be repaired. `repair.ts` exports `deleteZeroByteObjects(gitDir: string): number`, `brokenBackupName(gitDir: string, now: Date): string`, `pruneBrokenBackups(gitDir: string): void`.

- [ ] **Step 1: Add the interface member**

In `types.ts`, inside `SyncTransport` after `gitDirSizeBytes?`:

```ts
  /** Repair a corrupt hidden repo (crash-truncated objects, bad refs, corrupt
   *  index). Tier 1 deletes zero-byte loose objects and resets main to the
   *  local origin/main; Tier 2 moves the whole repo aside as a .broken-<date>
   *  backup and re-inits (the engine's normal provisioning + pull re-adopt the
   *  remote). NEVER touches the user's files — only <root>/.youcoded/.
   *  Optional like maybeGc — a non-git transport omits it. */
  repair?(space: SyncSpace): Promise<void>;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/sync-spaces-repair.test.ts`:

```ts
// desktop/tests/sync-spaces-repair.test.ts
// Real-git INTEGRATION tests for the two-tier corruption repair (2026-07-30
// spec §2), plus unit tests for the pure fs helpers. Same conventions as
// sync-spaces-git-transport.test.ts (real subprocesses → generous ceiling).
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { GitTransport } from '../src/main/sync-spaces/git-transport';
import { deleteZeroByteObjects, brokenBackupName, pruneBrokenBackups } from '../src/main/sync-spaces/repair';
import type { SyncSpace } from '../src/main/sync-spaces/types';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

function makeWorld() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-repair-'));
  const bare = path.join(tmp, 'remote.git');
  fs.mkdirSync(bare);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);
  const root = path.join(tmp, 'device');
  fs.mkdirSync(root);
  const space: SyncSpace = { id: 'project:repair', kind: 'project', root };
  const transport = new GitTransport({ deviceName: 'RepairTest' });
  const gitDir = path.join(root, '.youcoded', 'sync.git');
  const gitEnv = { ...process.env, GIT_DIR: gitDir };
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return { tmp, bare, root, space, transport, gitDir, gitEnv, cleanup };
}

/** Clone the bare remote and return the file list + a file's content. */
function remoteState(bare: string, tmp: string): { files: string[]; read: (f: string) => string } {
  const co = fs.mkdtempSync(path.join(tmp, 'verify-'));
  execFileSync('git', ['clone', '--quiet', bare, co]);
  const files = fs.readdirSync(co).filter(f => f !== '.git').sort();
  return { files, read: (f) => fs.readFileSync(path.join(co, f), 'utf8') };
}

describe('repair helpers (pure)', () => {
  it('deleteZeroByteObjects removes exactly the empty poison files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-zb-'));
    const objects = path.join(tmp, 'objects');
    fs.mkdirSync(path.join(objects, 'ab'), { recursive: true });
    fs.mkdirSync(path.join(objects, 'cd'), { recursive: true });
    fs.writeFileSync(path.join(objects, 'ab', 'empty1'), '');
    fs.writeFileSync(path.join(objects, 'cd', 'empty2'), '');
    fs.writeFileSync(path.join(objects, 'cd', 'real'), 'content');
    expect(deleteZeroByteObjects(tmp)).toBe(2);
    expect(fs.existsSync(path.join(objects, 'cd', 'real'))).toBe(true);
    expect(fs.existsSync(path.join(objects, 'ab', 'empty1'))).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('pruneBrokenBackups keeps only the newest backup', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-pb-'));
    const gd = path.join(tmp, 'sync.git');
    fs.mkdirSync(`${gd}.broken-2026-07-27T19-21-00`);
    fs.mkdirSync(`${gd}.broken-2026-07-28T20-16-00`);
    fs.mkdirSync(`${gd}.broken-2026-07-30T14-00-00`);
    pruneBrokenBackups(gd);
    expect(fs.readdirSync(tmp).sort()).toEqual(['sync.git.broken-2026-07-30T14-00-00']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('brokenBackupName is filesystem-safe (no colons — Windows)', () => {
    const name = brokenBackupName('/x/sync.git', new Date('2026-07-30T14:05:06Z'));
    expect(name).toBe('/x/sync.git.broken-2026-07-30T14-05-06');
  });
});

describe('GitTransport.repair (real git)', () => {
  it('Tier 1: zero-byte HEAD object → reset to origin/main → next push recovers ALL local content', async () => {
    const w = makeWorld();
    await w.transport.init(w.space);
    await w.transport.setRemote(w.space, w.bare);
    fs.writeFileSync(path.join(w.root, 'pushed.md'), 'made it out');
    await w.transport.push(w.space, 'seed');                       // origin/main exists
    // Local-only commit after the push, then the crash zeroes its object —
    // mirrors the Z13: local tip unreadable, older origin/main intact, and the
    // stranded commit NEVER reached the remote (rewind the bare too).
    fs.writeFileSync(path.join(w.root, 'stranded.md'), 'local only');
    await w.transport.push(w.space, 'will be stranded');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { env: w.gitEnv }).toString().trim();
    const prev = execFileSync('git', ['rev-parse', 'HEAD~1'], { env: w.gitEnv }).toString().trim(); // resolve BEFORE truncating
    fs.truncateSync(path.join(w.gitDir, 'objects', head.slice(0, 2), head.slice(2)), 0);
    execFileSync('git', ['--git-dir', w.bare, 'update-ref', 'refs/heads/main', prev]);       // remote never saw the crash commit
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', prev], { env: w.gitEnv }); // local mirror agrees

    await expect(w.transport.push(w.space, 'x')).rejects.toMatchObject({ syncErrorCode: 'repo-corrupt' });
    await w.transport.repair!(w.space);
    expect(fs.existsSync(w.gitDir)).toBe(true);                    // Tier 1 — repo NOT moved aside
    fs.writeFileSync(path.join(w.root, 'after-heal.md'), 'post');
    const r = await w.transport.push(w.space, 'healed snapshot');
    expect(r.pushed).toBe(true);
    const remote = remoteState(w.bare, w.tmp);
    // Every worktree file made it out — including the one stranded by the crash.
    expect(remote.files).toEqual(['after-heal.md', 'pushed.md', 'stranded.md']);
    expect(remote.read('stranded.md')).toBe('local only');
    w.cleanup();
  });

  it('Tier 2: origin/main unreadable too → repo moved aside as .broken-*, fresh init', async () => {
    const w = makeWorld();
    await w.transport.init(w.space);
    await w.transport.setRemote(w.space, w.bare);
    fs.writeFileSync(path.join(w.root, 'a.md'), 'content-a');
    await w.transport.push(w.space, 'seed');
    // Zero EVERY loose object: local origin/main's closure is gone → Tier 1
    // verification fails → Tier 2.
    const objects = path.join(w.gitDir, 'objects');
    for (const d of fs.readdirSync(objects)) {
      const dir = path.join(objects, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) fs.truncateSync(path.join(dir, f), 0);
    }
    await w.transport.repair!(w.space);
    const parent = path.join(w.root, '.youcoded');
    const entries = fs.readdirSync(parent);
    expect(entries.some(e => e.startsWith('sync.git.broken-'))).toBe(true);  // backup kept
    expect(fs.existsSync(path.join(w.gitDir, 'HEAD'))).toBe(true);           // fresh repo
    // Re-provision (the engine's ensureProvisioned does this in prod), then a
    // normal pull+push cycle converges: remote history re-adopted, worktree pushed.
    await w.transport.setRemote(w.space, w.bare);
    await w.transport.pull(w.space);
    fs.writeFileSync(path.join(w.root, 'b.md'), 'content-b');
    const r = await w.transport.push(w.space, 'post tier2');
    expect(r.pushed).toBe(true);
    const remote = remoteState(w.bare, w.tmp);
    expect(remote.files).toEqual(['a.md', 'b.md']);
    w.cleanup();
  });

  it('worktree files are NEVER touched by repair', async () => {
    const w = makeWorld();
    await w.transport.init(w.space);
    await w.transport.setRemote(w.space, w.bare);
    fs.writeFileSync(path.join(w.root, 'precious.md'), 'do not touch');
    await w.transport.push(w.space, 'seed');
    const before = fs.statSync(path.join(w.root, 'precious.md')).mtimeMs;
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { env: w.gitEnv }).toString().trim();
    fs.truncateSync(path.join(w.gitDir, 'objects', head.slice(0, 2), head.slice(2)), 0);
    await w.transport.repair!(w.space);
    expect(fs.readFileSync(path.join(w.root, 'precious.md'), 'utf8')).toBe('do not touch');
    expect(fs.statSync(path.join(w.root, 'precious.md')).mtimeMs).toBe(before);
    w.cleanup();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-repair.test.ts`
Expected: FAIL — `repair.ts` doesn't exist.

- [ ] **Step 4: Implement `repair.ts`**

```ts
// desktop/src/main/sync-spaces/repair.ts
// Pure fs helpers for the two-tier corruption repair (2026-07-30 spec §2).
// The orchestration lives on GitTransport.repair() (it needs the credentialed
// git runner); these helpers hold the fs mechanics so they unit-test without
// spawning git.
import fs from 'fs';
import path from 'path';

/**
 * Delete every ZERO-BYTE loose object under <gitDir>/objects. Returns a count.
 *
 * WHY zero-byte specifically: a power loss during a loose-object write leaves
 * the FILENAME (the rename landed) with no CONTENT (never flushed). That file
 * is POISON, not just damage — git checks object existence by name, so
 * `add -A` sees it "exists" and never rewrites it from the intact worktree
 * file. The repo can therefore never self-heal until the empty file is gone;
 * deleting it makes the next `add` regenerate the object. (16 of these across
 * three crashes in the 2026-07-27 Z13 incident.)
 *
 * Best-effort per file; one-level walk matching git's objects/<2-hex>/<38-hex>
 * layout (pack/ and info/ contain no zero-byte hazards worth recursing for).
 */
export function deleteZeroByteObjects(gitDir: string): number {
  const objects = path.join(gitDir, 'objects');
  let removed = 0;
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(objects); } catch { return 0; }
  for (const d of dirs) {
    const dir = path.join(objects, d);
    let entries: string[] = [];
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      entries = fs.readdirSync(dir);
    } catch { continue; }
    for (const f of entries) {
      const p = path.join(dir, f);
      try {
        if (fs.statSync(p).size === 0) { fs.rmSync(p, { force: true }); removed++; }
      } catch { /* raced away / unreadable — the git-level verify catches it */ }
    }
  }
  return removed;
}

/** `<gitDir>.broken-2026-07-30T14-05-06` — colons replaced (Windows paths). */
export function brokenBackupName(gitDir: string, now: Date): string {
  return `${gitDir}.broken-${now.toISOString().slice(0, 19).replace(/:/g, '-')}`;
}

/**
 * Keep only the NEWEST `<basename>.broken-*` sibling of gitDir; delete older
 * ones. Backups exist so a repair can never destroy evidence, but corruption
 * recurs on crash-prone hardware (three in three days on the Z13) and each
 * backup is a full repo — unbounded they'd eat the disk.
 */
export function pruneBrokenBackups(gitDir: string): void {
  const parent = path.dirname(gitDir);
  const prefix = `${path.basename(gitDir)}.broken-`;
  let entries: string[] = [];
  try { entries = fs.readdirSync(parent).filter(e => e.startsWith(prefix)); } catch { return; }
  // ISO timestamps sort lexically — newest last.
  entries.sort();
  for (const stale of entries.slice(0, -1)) {
    try { fs.rmSync(path.join(parent, stale), { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}
```

- [ ] **Step 5: Implement `GitTransport.repair()`**

In `git-transport.ts`, import the helpers and add below `maybeGc` (keep the interface-optional pattern):

```ts
import { deleteZeroByteObjects, brokenBackupName, pruneBrokenBackups } from './repair';
```

```ts
  /** Two-tier corruption repair (2026-07-30 spec §2). Resolves when healed;
   *  throws when even Tier 2 failed. NEVER touches the user's files — every
   *  write is under <root>/.youcoded/. The engine gates calls to once per
   *  space per launch. */
  async repair(space: SyncSpace): Promise<void> {
    const gd = this.gitDir(space);
    // ---- Tier 1: surgical, offline-capable ----
    if (fs.existsSync(path.join(gd, 'HEAD'))) {
      deleteZeroByteObjects(gd);
      const tip = await this.git(space, ['rev-parse', '--verify', '--quiet', 'origin/main']);
      if (tip.code === 0) {
        const sha = tip.stdout.trim();
        // Light closure check: commit + root tree readable. NOT a full fsck —
        // that times out on real repos (>2 min on the Z13's Personal space).
        // Residual damage this misses fails the next push, which escalates
        // back here and takes Tier 2 (same launch-scoped heal attempt).
        const commitOk = (await this.git(space, ['cat-file', 'commit', sha])).code === 0;
        const treeOk = (await this.git(space, ['cat-file', '-p', `${sha}^{tree}`])).code === 0;
        if (commitOk && treeOk) {
          const upd = await this.git(space, ['update-ref', 'refs/heads/main', sha]);
          // Delete the index: it may reference the just-deleted poison hashes.
          // add -A rebuilds it from the worktree — files are the source of truth.
          try { fs.rmSync(path.join(gd, 'index'), { force: true }); } catch { /* rebuilt anyway */ }
          const probe = await this.git(space, ['rev-parse', '--verify', 'HEAD']);
          if (upd.code === 0 && probe.code === 0) return; // healed — local changes re-commit on the next cycle
        }
      }
    }
    // ---- Tier 2: move the repo aside, start fresh ----
    // The worktree files and the GitHub remote are the two real sources of
    // truth; the hidden repo is just transport machinery. After the re-init,
    // the engine's normal cycle re-provisions the remote (ensureProvisioned →
    // setRemote: provisionGithubRemote treats an existing repo as SUCCESS) and
    // pull() adopts origin/main via its unborn-branch checkout — real ancestry,
    // so NO conflict-copy explosion (spec §2).
    if (fs.existsSync(gd)) {
      fs.renameSync(gd, brokenBackupName(gd, new Date()));
      pruneBrokenBackups(gd);
    }
    await this.init(space);
  }
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tests/sync-spaces-repair.test.ts`
Expected: PASS (all 6).

- [ ] **Step 7: Commit**

```bash
git add src/main/sync-spaces/repair.ts src/main/sync-spaces/git-transport.ts src/main/sync-spaces/types.ts tests/sync-spaces-repair.test.ts
git commit -m "feat(sync): two-tier repair() for crash-corrupted sync repos"
```

---

### Task 5: Engine wiring — heal once per launch, notice on success, danger on failure

**Files:**
- Modify: `youcoded/desktop/src/main/sync-spaces/engine.ts` (the `syncSpace` catch, ~L187-196; one new Set field near `warnedLargeSpaces` ~L69)
- Test: `youcoded/desktop/tests/sync-spaces-engine.test.ts` (append; fake-transport unit tests)

**Interfaces:**
- Consumes: Task 4's `transport.repair?`, Task 2's `REPO_CORRUPT_ERROR_CODE` (via the error's `syncErrorCode` — the engine matches the code string `'repo-corrupt'`, imported constant).
- Produces: on heal success → `notice` event with the approved copy, then an automatic rerun of the sync; on heal failure → `error` event with `errorCode: 'repo-repair-failed'`; second corruption in one launch → plain `error` event with `errorCode: 'repo-corrupt'` (existing red-dot path). No public API change.

**Design note (spec §2 "boot probe" fold):** the spec's boot-time `rev-parse` probe in `addSpace` is folded into the op-time path: `startEngine` fires an initial reconcile sync for every space at launch (`service.ts:309`), so a corrupt repo throws `repo-corrupt` within the first cycle and heals right there — same "heals at startup" guarantee, no separate probe machinery or transport surface. The spec is updated to record this.

- [ ] **Step 1: Write the failing tests**

Append to `tests/sync-spaces-engine.test.ts` (uses the file's existing `fakeTransport()` + `WAIT_MS`):

```ts
describe('corruption self-heal', () => {
  function corruptOnce(t: ReturnType<typeof fakeTransport>) {
    // First push throws coded repo-corrupt; after repair() runs, pushes succeed.
    let repaired = false;
    (t as any).repair = vi.fn(async () => { repaired = true; });
    t.push = vi.fn(async (s: SyncSpace) => {
      if (!repaired) { const e: any = new Error('Sync data needs repair (git commit: bad object HEAD)'); e.syncErrorCode = 'repo-corrupt'; throw e; }
      t.pushes.push(s.id); return { pushed: true, oversize: [] };
    }) as any;
    return t;
  }

  it('repairs once, emits the notice, and the rerun sync succeeds', async () => {
    const t = corruptOnce(fakeTransport());
    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(t, { onEvent: (e) => events.push(e), pollMs: 0, debounceMs: 50 });
    const space: SyncSpace = { id: 'project:heal', kind: 'project', root: tmp };
    await engine.addSpace(space);
    await engine.syncSpace(space);
    await vi.waitFor(() => expect(t.pushes.length).toBe(1), { timeout: WAIT_MS });
    expect((t as any).repair).toHaveBeenCalledTimes(1);
    const notice = events.find(e => e.type === 'notice');
    expect(notice).toMatchObject({ spaceId: 'project:heal', message: 'Sync repaired itself after a crash. Your files were untouched.' });
    // The healed rerun emitted a real synced event; no error event ever fired.
    await vi.waitFor(() => expect(events.some(e => e.type === 'synced')).toBe(true), { timeout: WAIT_MS });
    expect(events.filter(e => e.type === 'error')).toEqual([]);
    await engine.stop();
  });

  it('a SECOND corruption in the same launch surfaces as an error — no heal loop', async () => {
    const t = fakeTransport();
    (t as any).repair = vi.fn(async () => {});
    t.push = vi.fn(async () => { const e: any = new Error('still corrupt'); e.syncErrorCode = 'repo-corrupt'; throw e; }) as any;
    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(t, { onEvent: (e) => events.push(e), pollMs: 0, debounceMs: 50 });
    const space: SyncSpace = { id: 'project:loop', kind: 'project', root: tmp };
    await engine.addSpace(space);
    await engine.syncSpace(space);   // corrupt → heals (attempt 1) → rerun → corrupt AGAIN
    await vi.waitFor(() => expect(events.some(e => e.type === 'error' && e.errorCode === 'repo-corrupt')).toBe(true), { timeout: WAIT_MS });
    expect((t as any).repair).toHaveBeenCalledTimes(1);  // never a second attempt
    await engine.stop();
  });

  it('a FAILED repair surfaces repo-repair-failed, never a phantom synced', async () => {
    const t = fakeTransport();
    (t as any).repair = vi.fn(async () => { throw new Error('no network for tier 2'); });
    t.push = vi.fn(async () => { const e: any = new Error('bad object HEAD'); e.syncErrorCode = 'repo-corrupt'; throw e; }) as any;
    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(t, { onEvent: (e) => events.push(e), pollMs: 0, debounceMs: 50 });
    const space: SyncSpace = { id: 'project:sad', kind: 'project', root: tmp };
    await engine.addSpace(space);
    await engine.syncSpace(space);
    await vi.waitFor(() => expect(events.some(e => e.type === 'error' && e.errorCode === 'repo-repair-failed')).toBe(true), { timeout: WAIT_MS });
    expect(events.some(e => e.type === 'synced')).toBe(false);
    await engine.stop();
  });

  it('a transport WITHOUT repair() falls through to the plain error event', async () => {
    const t = fakeTransport(); // no repair member — future non-git transport
    t.push = vi.fn(async () => { const e: any = new Error('bad object HEAD'); e.syncErrorCode = 'repo-corrupt'; throw e; }) as any;
    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(t, { onEvent: (e) => events.push(e), pollMs: 0, debounceMs: 50 });
    const space: SyncSpace = { id: 'project:norep', kind: 'project', root: tmp };
    await engine.addSpace(space);
    await engine.syncSpace(space);
    await vi.waitFor(() => expect(events.some(e => e.type === 'error' && e.errorCode === 'repo-corrupt')).toBe(true), { timeout: WAIT_MS });
    await engine.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-engine.test.ts -t 'corruption self-heal'`
Expected: FAIL — no notice event; repair never called.

- [ ] **Step 3: Implement**

In `engine.ts`: import the code constant —

```ts
import { REPO_CORRUPT_ERROR_CODE } from '../sync-error-classifier';
```

Add the launch-scoped guard beside `warnedLargeSpaces` (~L69):

```ts
  // One heal attempt per space per LAUNCH (spec §2 guardrail): a second
  // corruption in the same run means something deeper than crash damage —
  // surface it instead of thrashing repair/fail loops at poll cadence.
  private healedSpaces = new Set<string>();
```

Replace the `syncSpace` catch block (~L187-191):

```ts
      } catch (e: any) {
        const errorCode = typeof e?.syncErrorCode === 'string' ? e.syncErrorCode : undefined;
        // Crash-corrupted repo: repair automatically (approved policy — the
        // heal never touches user files and keeps the broken repo aside as a
        // backup), notify after, and rerun THIS space's sync so the panel goes
        // green on real evidence. Guarded to once per space per launch.
        if (errorCode === REPO_CORRUPT_ERROR_CODE && this.transport.repair && !this.healedSpaces.has(space.id)) {
          this.healedSpaces.add(space.id);
          try {
            await this.transport.repair(space);
            this.onEvent({ type: 'notice', spaceId: space.id, message: 'Sync repaired itself after a crash. Your files were untouched.' });
            st.rerun = true; // the finally block fires the healed sync
          } catch (re: any) {
            // Repair itself failed (e.g. Tier 2 with no network/auth). Cause
            // genuinely unknown → surface the real detail, no guessed cause.
            this.onEvent({ type: 'error', spaceId: space.id, message: `Sync self-repair failed: ${String(re?.message ?? re)}`, errorCode: 'repo-repair-failed' });
          }
        } else {
          // Forward the typed marker (e.g. 'github-auth' from the transport /
          // provisioning) so the panel can offer the matching CTA — the message
          // alone is prose and must never be string-matched.
          this.onEvent({ type: 'error', spaceId: space.id, message: String(e?.message ?? e), errorCode });
        }
      } finally {
```

(The existing `finally` block is untouched — its `st.rerun` handling is exactly what re-fires the healed sync.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/sync-spaces-engine.test.ts`
Expected: ALL pass — 4 new + all existing (single-flight, debounce, error-event cases must be unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/main/sync-spaces/engine.ts tests/sync-spaces-engine.test.ts
git commit -m "feat(sync): auto-repair corrupt repos once per launch, notice on success"
```

---

### Task 6: End-to-end integration — corrupt repo → engine heals → remote byte-matches worktree

**Files:**
- Test: `youcoded/desktop/tests/sync-spaces-repair.test.ts` (append — reuses Task 4's `makeWorld`/`remoteState`)

This is the spec §6 headline test: the full engine + real transport + real corruption, proving the *system* (not just the parts) converges.

- [ ] **Step 1: Write the test**

Append to `tests/sync-spaces-repair.test.ts`:

```ts
import { SpaceSyncEngine } from '../src/main/sync-spaces/engine';
import type { SpaceSyncEvent } from '../src/main/sync-spaces/types';

describe('engine + real transport end-to-end', () => {
  it('crash-corrupted repo: engine heals, reruns, and the remote ends byte-identical to the worktree', async () => {
    const w = makeWorld();
    await w.transport.init(w.space);
    await w.transport.setRemote(w.space, w.bare);
    fs.writeFileSync(path.join(w.root, 'day1.md'), 'pushed before the crash');
    await w.transport.push(w.space, 'seed');
    // The crash: local tip object zeroed; the crash commit never reached the
    // remote (Z13 shape) — rewind BOTH the bare's main and the local mirror.
    fs.writeFileSync(path.join(w.root, 'day2.md'), 'stranded by the crash');
    await w.transport.push(w.space, 'stranded');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { env: w.gitEnv }).toString().trim();
    const prev = execFileSync('git', ['rev-parse', 'HEAD~1'], { env: w.gitEnv }).toString().trim();
    fs.truncateSync(path.join(w.gitDir, 'objects', head.slice(0, 2), head.slice(2)), 0);
    execFileSync('git', ['--git-dir', w.bare, 'update-ref', 'refs/heads/main', prev]);
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', prev], { env: w.gitEnv });

    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(w.transport, { onEvent: (e) => events.push(e), pollMs: 0, debounceMs: 50 });
    await engine.addSpace(w.space);
    await engine.syncSpace(w.space);
    await vi.waitFor(() => expect(events.some(e => e.type === 'synced' && (e as any).pushed)).toBe(true), { timeout: 120_000 });
    await engine.stop();

    expect(events.some(e => e.type === 'notice' && /repaired itself/.test((e as any).message))).toBe(true);
    expect(events.filter(e => e.type === 'error')).toEqual([]);
    const remote = remoteState(w.bare, w.tmp);
    expect(remote.files).toEqual(['day1.md', 'day2.md']);
    expect(remote.read('day2.md')).toBe('stranded by the crash');  // the 3,381-file class, in miniature
    w.cleanup();
  });
});
```

- [ ] **Step 2: Run to verify pass**

Run: `npx vitest run tests/sync-spaces-repair.test.ts`
Expected: PASS. (If it fails, the seam is real — debug the engine/transport interaction, not the test.)

- [ ] **Step 3: Commit**

```bash
git add tests/sync-spaces-repair.test.ts
git commit -m "test(sync): end-to-end crash-corruption heal — remote converges to worktree"
```

---

### Task 7: Self-row recency off legacy markers (spec §4)

**Files:**
- Create: `youcoded/desktop/src/main/sync-spaces/self-sync-status.ts`
- Modify: `youcoded/desktop/src/main/sync-spaces/engine.ts` (add `anySyncing()`, one-liner near `liveSpaceIds()` ~L203)
- Modify: `youcoded/desktop/src/main/sync-spaces/service.ts` (two exports near `getLastSyncByDevice` ~L47)
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` (`buildStatusData()` L1894-1897 + the import at L60-61)
- Test: `youcoded/desktop/tests/self-sync-status.test.ts` (new)

**Interfaces:**
- Consumes: `manager.lastSyncFor(spaceId): number | null` (ms), `roots.spaces()`, engine `states` map.
- Produces: `deriveSelfLastSyncEpochSec(spacesLastSyncMs: number | null, legacyMarkerRaw: string | null): number | null` (SECONDS — the wire unit); service exports `getSelfLastSyncEpochMs(): number | null` and `isSyncSpacesSyncing(): boolean`; engine gains `anySyncing(): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/self-sync-status.test.ts`:

```ts
// desktop/tests/self-sync-status.test.ts
import { describe, it, expect } from 'vitest';
import { deriveSelfLastSyncEpochSec } from '../src/main/sync-spaces/self-sync-status';

describe('deriveSelfLastSyncEpochSec', () => {
  it('prefers sync-spaces evidence (ms → wire seconds)', () => {
    expect(deriveSelfLastSyncEpochSec(1_785_446_434_842, null)).toBe(1_785_446_434);
  });
  it('falls back to the legacy marker for Drive/iCloud-only installs', () => {
    expect(deriveSelfLastSyncEpochSec(null, '1785000000')).toBe(1_785_000_000);
  });
  it('takes the max when both systems have synced', () => {
    expect(deriveSelfLastSyncEpochSec(1_785_446_434_842, '1785000000')).toBe(1_785_446_434);
    expect(deriveSelfLastSyncEpochSec(1_784_000_000_000, '1785000000')).toBe(1_785_000_000);
  });
  it('null when neither exists (→ UI "last seen" fallback), and on garbage', () => {
    expect(deriveSelfLastSyncEpochSec(null, null)).toBeNull();
    expect(deriveSelfLastSyncEpochSec(null, 'not-a-number')).toBeNull();
    expect(deriveSelfLastSyncEpochSec(null, '')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/self-sync-status.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the pure module**

```ts
// desktop/src/main/sync-spaces/self-sync-status.ts
// Pure derivation of the "this device" sync recency shown in the devices list.
//
// WHY this exists (2026-07-30 spec §4, the "last seen 22 hours ago" screenshot
// bug): buildStatusData used to read ONLY ~/.claude/toolkit-state/.sync-marker,
// which just the LEGACY Drive/iCloud push path stamps — absent on GitHub-era
// installs, so the self row fell back to the launch-time "last seen" while
// peer rows (SyncHub map) looked live. Primary evidence is now the sync-spaces
// persisted lastSync map; the legacy marker survives only as a fallback/max for
// installs still using the extra-backups system.
/** Returns SECONDS (the status:data wire unit — SyncPanel multiplies by 1000). */
export function deriveSelfLastSyncEpochSec(
  spacesLastSyncMs: number | null,
  legacyMarkerRaw: string | null,
): number | null {
  const legacySec = legacyMarkerRaw ? (parseInt(legacyMarkerRaw, 10) || null) : null;
  const spacesSec = spacesLastSyncMs != null ? Math.floor(spacesLastSyncMs / 1000) : null;
  if (spacesSec == null) return legacySec;
  if (legacySec == null) return spacesSec;
  return Math.max(spacesSec, legacySec);
}
```

- [ ] **Step 4: Expose the live readers**

`engine.ts`, next to `liveSpaceIds()` (~L203):

```ts
  /** True while any space's sync chain is in flight — feeds the self row's
   *  live "Syncing…" band (the legacy .sync-lock stat never fires for spaces). */
  anySyncing(): boolean {
    return [...this.states.values()].some(s => s.syncing);
  }
```

`service.ts`, next to `getLastSyncByDevice` (~L47):

```ts
/** Max persisted last-successful-sync across this device's spaces (ms), or
 *  null when sync is off / has never succeeded. Evidence-grade: recordSyncSuccess
 *  stamps only on real 'synced' events (transport failures now THROW — spec §1),
 *  so this can no longer advance while sync is broken. */
export function getSelfLastSyncEpochMs(): number | null {
  if (!manager || !roots) return null;
  let max: number | null = null;
  for (const s of roots.spaces()) {
    const t = manager.lastSyncFor(s.id);
    if (t != null && (max === null || t > max)) max = t;
  }
  return max;
}

/** Live: any space's sync currently in flight. */
export function isSyncSpacesSyncing(): boolean {
  return engine?.anySyncing() ?? false;
}
```

- [ ] **Step 5: Rewire `buildStatusData()`**

`ipc-handlers.ts` — add to the existing service import (L60-61): `getSelfLastSyncEpochMs, isSyncSpacesSyncing`, plus `import { deriveSelfLastSyncEpochSec } from './sync-spaces/self-sync-status';`. Replace L1892-1897:

```ts
    // Sync state for live updates — SyncPanel also fetches via IPC,
    // but these fields let the compact section row update in real-time.
    // Self recency comes from sync-spaces evidence FIRST (the persisted
    // lastSync map); the legacy .sync-marker survives as a fallback/max for
    // Drive/iCloud-only installs. WHY: the marker is absent on GitHub-era
    // installs, so reading only it showed "last seen 22 hours ago" on a
    // machine that was (supposedly) syncing every 90 seconds (2026-07-30 spec §4).
    const syncMarkerRaw = readTextFile(path.join(os.homedir(), '.claude', 'toolkit-state', '.sync-marker'));
    const lastSyncEpoch = deriveSelfLastSyncEpochSec(getSelfLastSyncEpochMs(), syncMarkerRaw);
    // Live spaces syncing OR the legacy lock dir (extra-backups pushes).
    let syncInProgress = isSyncSpacesSyncing();
    try { syncInProgress = syncInProgress || fs.statSync(path.join(os.homedir(), '.claude', 'toolkit-state', '.sync-lock')).isDirectory(); } catch {}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/self-sync-status.test.ts tests/sync-spaces-service.test.ts && npx tsc --noEmit`
Expected: PASS / clean. (`sync-spaces-service.test.ts` guards the service exports didn't break its module init.)

- [ ] **Step 7: Commit**

```bash
git add src/main/sync-spaces/self-sync-status.ts src/main/sync-spaces/engine.ts src/main/sync-spaces/service.ts src/main/ipc-handlers.ts tests/self-sync-status.test.ts
git commit -m "fix(sync): self device row reads real sync evidence, not the legacy marker"
```

---

### Task 8: Verify, document, ship

**Files:**
- Modify: `youcoded-dev/.claude/rules/sync-spaces.md` (workspace repo)
- Modify: `youcoded/docs/sync-spaces.md` (depth doc, youcoded repo — commit rides the PR)
- Modify: `youcoded-dev/docs/active/specs/2026-07-30-sync-corruption-self-heal-design.md` (record the boot-probe fold)
- Modify: `youcoded-dev/ROADMAP.md` (flip on merge)

- [ ] **Step 1: Full verification**

Run: `bash ~/youcoded-dev/scripts/verify.sh <worktree-path>`
Expected: green (tsc, related vitest, knip, ast-grep). Then the full desktop suite once: `npm test` — expected all green except the known pre-existing macOS-only debounce flake (Linux run: all green).

- [ ] **Step 2: Update the rule (workspace repo)**

In `youcoded-dev/.claude/rules/sync-spaces.md`, "Git transport" section, add:

```md
- **Non-zero git exits are guilty until proven benign.** Benign is an explicit allowlist (`nothing to commit`, first-push probes, offline/empty-remote via `isNetworkFailureStderr`); corruption (`matchGitCorruption`) throws coded `repo-corrupt`; everything else throws with the REAL stderr — a failed commit must never return `{pushed:false}` ("nothing to push") · why: a crash-corrupted repo synced "green" for three days (2026-07-27) · guard: `sync-spaces-git-transport.test.ts` honest-failure cases.
- **Zero-byte loose objects are POISON, not damage** — git checks existence by filename, so `add` never rewrites them from the intact worktree; `repair()` (Tier 1: purge + reset main→origin/main + drop index; Tier 2: move repo aside as `.broken-*` + re-init) is the ONLY correct response, and it never writes outside `.youcoded/` · guard: `sync-spaces-repair.test.ts`.
```

And in the "Engine & service" section:

```md
- **Corrupt-repo heal is ONCE per space per launch** (`healedSpaces`), notice on success (exact copy pinned), `repo-repair-failed` danger on failure — never a repair/fail loop at poll cadence · guard: `sync-spaces-engine.test.ts` corruption cases. Self device-row recency derives from `lastSyncFor` evidence + legacy-marker max (`self-sync-status.ts`), NEVER the legacy marker alone · guard: `self-sync-status.test.ts`.
```

Add `verify:` anchors in the rule frontmatter for `youcoded/desktop/src/main/sync-spaces/repair.ts` and the two new test paths.

- [ ] **Step 3: Update the depth doc (youcoded repo, in the PR)**

In `youcoded/docs/sync-spaces.md`, add a `## Corruption & self-repair` section: the poison mechanic, the two tiers, the once-per-launch guard, the benign allowlist inversion, and the 2026-07-27 incident as the motivating case (3 crashes, 16 zero-byte objects, 3 days green-while-dead). Reference the spec by workspace path.

- [ ] **Step 4: Record the boot-probe fold in the spec**

In the spec's §2 Triggers bullet, replace the boot-probe line with: "Launch coverage rides the initial reconcile sync (`startEngine` syncs every space at startup), so a corrupt repo heals in the first cycle — the separate `addSpace` probe was folded away at plan time (same guarantee, less machinery)." Commit to `youcoded-dev`.

- [ ] **Step 5: PR + merge + closeout**

Use superpowers:finishing-a-development-branch. PR to `itsdestin/youcoded` titled `fix(sync): honest git failures + crash-corruption self-heal + real self-row recency`. After merge: clean up worktree + branch, flip the ROADMAP entry to `[x]` with the merge sha, move the spec and this plan to `docs/archive/{specs,plans}/`, push `youcoded-dev`.

---

## Execution notes

- Tasks 2→6 are strictly ordered (each consumes the previous task's exports). Task 7 is independent of 4-6 (only needs Task 3's honesty for its *semantics*, not its code) and may run in parallel with them in a subagent setup. Task 1 goes first (merge-conflict avoidance on `sync-service.ts` imports); Task 8 last.
- The `sync-spaces-engine.test.ts` file is the known macOS CI red (ROADMAP `## Bugs`) — new cases there must not use fs-watch timing (they don't: they call `syncSpace` directly), so they add no flake surface.
- Do NOT run any of this against `~/YouCoded/` or Destin's live app — all tests run in `os.tmpdir()` sandboxes. The Z13's real repair is a separate manual session task, already scoped.
