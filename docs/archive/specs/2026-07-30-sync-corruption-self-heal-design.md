---
status: shipped
date: 2026-07-30
owner: Destin
repos: youcoded (desktop main process only — sync-spaces has no Android mirror pre-Phase-3)
related:
  - .claude/rules/sync-spaces.md
  - youcoded/docs/sync-spaces.md
  - fix/sync-health-primary-system (unmerged worktree, same bug family — lands first)
---

# Sync corruption self-heal + honest failure surfacing

## Motivation: the 2026-07-27 incident

Three hard freezes on the Z13 (Jul 27 19:21, Jul 28 20:16, Jul 29 01:24 — the
known EC-wedge/s2idle hardware issue) left 16 zero-byte loose objects in the
Personal space's hidden sync repo. The first crash zeroed the object that
`refs/heads/main` points at, so every subsequent git operation failed with
`fatal: bad object HEAD`. **Sync was dead for three days while the panel showed
green and `lastSync` advanced every cycle.** 3,381 files (three days of
conversations) sat staged locally and never reached GitHub.

Two independent defects compounded:

1. **The transport converts failure into success.** `git()` never throws;
   `push()` maps a failed commit to `{pushed: false}` — indistinguishable from
   "nothing to push" — and `pull()` maps any failure to `{updated: false}`.
   The engine then emits `synced`, which stamps the `recordSyncSuccess`
   evidence marker the panel's green state gates on. The only failure that
   deliberately surfaces is auth (`classifyGitAuthFailure`); every other
   failure mode falls into exactly the trap that code's WHY comment warns
   about.

2. **Crash-corrupted repos never heal on their own.** A zero-byte loose object
   is *poison, not just damage*: git checks object existence by filename, so
   `add` sees the object "exists" and skips rewriting it, even though the real
   content sits in the worktree. Meanwhile `add -A` keeps succeeding (it
   doesn't need `HEAD`), writing new blobs that the *next* crash zeroes.
   Recurring crashes are a fact of life on real hardware; the sync system must
   survive them unattended.

A third, related defect (the screenshot bug): the "Your devices" self row reads
`~/.claude/toolkit-state/.sync-marker` — stamped only by the legacy
Drive/iCloud push path, absent on GitHub-era machines — so it falls back to
"last seen {launch time}" while peer rows ride the live SyncHub map. Same
dead-legacy-state family as the unmerged `fix/sync-health-primary-system`.

## Design

### 1. Honest failures (foundation)

Invert the transport's default: **a non-zero git exit produces an error unless
it matches an explicit benign allowlist.** Today benign is the silent
fallthrough; it becomes the exception.

- New pure `classifyGitFailure(stderr)` in `sync-error-classifier.ts` →
  `'benign' | 'corrupt' | 'auth' | 'unknown'`.
  - `benign` (allowlist): missing `origin/main` on first push ("Invalid
    revision range"), offline / unreachable host on pull, nothing-to-commit.
    Every currently-silent `if (code !== 0) return <benign result>` in
    `push()`/`pull()` is audited against this list.
  - `corrupt`: `bad object`, `object file .* is empty`, `unable to read`,
    `index file corrupt`, `not a git repository`, `bad ref`, `loose object
    .* is corrupt`.
  - `auth`: existing `classifyGitAuthFailure` patterns, unchanged.
  - `unknown`: error event carrying the real stderr tail (specific + accurate
    per `docs/error-message-standards.md` — never a guessed cause).
- `corrupt` → typed throw with `syncErrorCode: 'repo-corrupt'` (same mechanism
  as `github-auth`). Engine forwards the code on its `error` event as today.

**Invariant (pinning-test candidate, promotes to the sync-spaces rule):** a git
operation that fails for a non-allowlisted reason must never yield a `synced`
event, a `recordSyncSuccess` stamp, or a benign-looking
`{pushed:false}`/`{updated:false}`. This extends the 2026-07-22 evidence-gating
of remote-less spaces to *all* failure modes.

### 2. Auto-repair

Approved policy: **repair automatically, notify after** — the heal never
touches user files, the broken repo is kept aside, and a non-technical user has
no basis to answer a "Repair sync?" prompt.

New optional transport method `repair?(space)` (optional like `maybeGc?`, so
the transport contract stays compatible with future non-git transports),
implemented in new `sync-spaces/repair.ts`.

**Tier 1 — surgical, offline-capable:**
1. Delete all zero-byte files under `objects/` (un-poisons git so it
   regenerates them from the worktree).
2. Verify the local `origin/main` ref resolves and its commit + root tree read.
3. `update-ref refs/heads/main origin/main`.
4. Delete the index.
5. Done — the normal engine cycle re-stages the worktree (`add -A`), commits
   everything since the last push as one snapshot, and pushes.

**Tier 2 — refetch, escalation only:** if Tier 1's verification fails (or the
repo is missing/unopenable): rename `sync.git` → `sync.git.broken-<ISO date>`,
fresh `init()`, re-add remote, fetch `main`, reset. Keep the newest `.broken-*`
backup per space; prune older ones. Requires network + auth; heals anything up
to total repo destruction because the two sources of truth — worktree files and
the GitHub remote — are untouched.

Both tiers end in the same state, and neither can spawn conflict copies:
resetting to `origin/main` and committing the worktree on top gives git real
ancestry, so local changes are "newer", not "unrelated". A concurrent peer push
lands in the existing non-fast-forward recovery merge.

**Rejected alternatives:** reflog-walk to the newest intact local commit
(expensive closure verification on 22k-commit repos, still needs the fallback,
preserves only local commit granularity that no UI surfaces); always-nuke
(Tier 2 without the cheap fast path — re-downloads potentially >500 MiB for
what is usually an eight-file cleanup).

**Triggers:**
- Op-time: engine catches a `repo-corrupt` throw from any sync operation.
- Launch coverage rides the initial reconcile sync (`startEngine` syncs every
  space at startup), so a corrupt repo heals in the first cycle — the separate
  `addSpace` probe was folded away at plan time (same guarantee, less
  machinery).

**Guardrails:**
- Runs inside the space's existing single-flight sync chain.
- **One heal per space per launch.** A second corruption in the same launch
  stops and surfaces (danger state) instead of thrashing.
- Never writes outside `.youcoded/`. The worktree is read-only to the repair.
- No full `fsck`, ever — it times out on real repos (>2 min on Personal).
  Residual damage Tier 1's light verification misses fails the next push and
  escalates to Tier 2 (still within the once-per-launch budget: Tier 2 is the
  same heal attempt, not a second one).

### 3. Surfacing

- **Heal succeeded:** `notice` event (non-red, like the large-history notice):
  "Sync repaired itself after a crash. Your files were untouched."
- **Heal failed / second corruption in one launch:** red dot + danger via the
  existing `latestUnresolvedError` path, rendered as the general two-action
  `<ErrorState>` (Report bug / Diagnose with Claude) — at that point the cause
  is genuinely unknown and we don't pretend otherwise.
- No new UI surfaces; everything rides the existing panel/dot/notice plumbing.
  The legacy `.sync-warnings.json` StatusBar chip is untouched.

### 4. Device-row recency (the screenshot bug)

- Self's `lastSyncEpoch` in `buildStatusData()` (`ipc-handlers.ts`) switches
  from the legacy `.sync-marker` to sync-spaces evidence:
  `manager.lastSyncFor(...)` maxed across spaces (the persisted `lastSync` map
  in `toolkit-state/sync-spaces.json` the panel already trusts elsewhere).
- `syncInProgress` at the same code site has the identical disease (stats the
  legacy `.sync-lock`); it switches to the engine's live per-space `syncing`
  state, exposed through the service.
- `deviceActivityLabel` and its pinned wording ladder do not change — only
  what feeds them. Peer rows (SyncHub `lastSyncByDevice`) are already correct.
- **Ordering dependency:** this row is only as honest as §1 makes
  `recordSyncSuccess` — land §1 first or together, never the row rewire alone
  (it would confidently display phantom success).

### 5. Sequencing

1. Merge the stranded `fix/sync-health-primary-system` worktree (finished
   2026-07-24, same bug family, third member: startup health check reading
   legacy `storage_backends`).
2. §1 honest failures + tests.
3. §2 repair + §3 surfacing + tests.
4. §4 row rewire + tests.

### 6. Tests

Real-git integration tests beside the existing contract suite
(`sync-spaces-git-transport.test.ts` conventions), plus engine-level unit
tests:

- Zero-byte object in a live test repo → `push()` throws `repo-corrupt`,
  never returns `{pushed: false}`. **Pins the exact 2026-07-27 bug** (commit
  exiting 128 must not yield `synced`).
- Same corruption → `repair()` Tier 1 → next sync pushes; remote tree
  byte-matches the worktree.
- Corrupted `origin/main` closure against a local bare remote → Tier 2
  refetch → same end state; broken repo preserved as `.broken-*`.
- Engine: corrupt event triggers exactly one heal; second corruption in-launch
  → danger error, no heal loop.
- Benign allowlist: first-push-no-upstream and offline pull stay silent.
- Row rewire: self label derives from `lastSyncFor` max; absent legacy marker
  no longer forces the "last seen" fallback.

## Non-goals

- No worktree writes by the repair, ever.
- No full-`fsck` integrity scanning.
- No restore-wizard / history-browsing UI (Drive/iCloud stay write-only
  snapshots; GitHub remains the live recovery).
- No Android work (no `syncspaces:*` Kotlin handlers exist yet).
- The one-off manual repair of the Z13's Personal repo is operational work
  tracked in-session, not part of this spec (it applies the same mechanics by
  hand, but may keep local history since `ca2f6a0c` verified intact).
