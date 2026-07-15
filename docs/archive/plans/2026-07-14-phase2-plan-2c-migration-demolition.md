---
status: shipped
---

# Plan 2c — Migration + Legacy Demolition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Opus implementers, two-stage review per task, whole-branch review before PR (handoff §3).

**Goal:** Retire the legacy sync-service machinery now that the space-based system covers its jobs: delete the legacy push loops / auto-restore / slug-symlink aggregation (with the one-time on-disk sweep), shrink Drive/iCloud to daily dated snapshot-only backups, make the store the read source for titles/flags, and add a bounded local git-gc for the sync repos.

**Architecture:** Strictly subtractive plus two migrations (symlink sweep, backup reshape). `sync-service.ts` is edited for the FIRST time since 1a — every deletion here was pre-cleared by design §4/§4a of the Phase-2 spec. Nothing in the transport/engine/store changes.

**Gate — CLEARED to proceed (Destin, 2026-07-14: "I don't care about the old sync system, ready to run 2c").** An earlier draft gated the destructive tasks on 2b being merged+dogfooded; that was over-coupling. The fallback paths 2c removes (auto-restore, slug aggregation, backup writers, the 2a-era flag/title dual-write) are all **2a-era machinery that already shipped and was dogfooded** — they are NOT the safety net under 2b's leases/takeover. So 2c does not depend on 2b being stable and may run now.

**The ONE real constraint is merge-order, not correctness:** 2b's open PR (`feat/sync-leases`) edits `ipc-handlers.ts` (session-exit region) and `main.ts` (startup wiring); 2c Tasks 4 + 5 also edit those two files (delete legacy calls / wire the sweep). Whichever merges second rebases those two files — adjacent code, not shared logic, so manageable. **Prefer to land 2b first if it's close; otherwise branch 2c from current master and rebase when 2b lands.** Coordinate at Task 1. Everything else in 2c (`sync-service.ts`, the new modules, `session-browser.ts`, `git-transport.ts`) does not overlap 2b at all.

**Governing docs (READ FIRST):** spec `2026-07-10-phase2-conversation-sync-design.md` §4 + §4a (the deletion list IS the contract); handoff §2.B "2c must-not-forget" + §5 decisions (NO auto-restore EVER; aggressive snapshot pruning); PITFALLS → Sync Warnings, Resume Browser, Conversation Store.

**Worktree:** `feat/sync-legacy-demolition` in `youcoded`.

---

## Decision points — ANSWERED by Destin 2026-07-14 (do not re-ask)

1. **Legacy `personal-sync` repo: DELETE it, don't leave it frozen** ("don't really want a dead repo laying around"). The repurpose from design §4 is moot (1a already provisioned the personal-space repo both devices use). Deletion is Task 10 — a guided, gated final task with a pre-delete verification checklist and an explicit per-run confirmation from Destin (destructive cross-account action; never automatic).
2. **Snapshot retention is TIERED (grandfather-father-son), ~3 months total:** keep every daily snapshot ≤7 days old; from 8–28 days keep ONE per calendar week (the newest in each week); from 29–90 days keep ONE per calendar month (the newest in each month); delete everything older than 90 days. Task 3 implements exactly this.
3. **Remote .git compaction deferred — CONFIRMED by Destin 2026-07-14.** Only the SAFE local repack runs automatically (no history rewrite, no peer impact). The risky remote history-deletion stays a deliberate manual procedure, triggered by a >500MB per-launch warning. Task 8 as written.

## Bugs to be wary of

- **Line numbers below were verified 2026-07-14 and WILL drift** — re-grep every anchor (`aggregateConversations`, `rewriteProjectSlugs`, `regenerateTopicCache`, `restoreInProgress`, `--update`) before editing. The FUNCTION NAMES are the contract, not the numbers.
- **The sweep must NEVER delete a real file.** `lstatSync().isSymbolicLink()` is true for Windows junctions in Node — but test on BOTH a file symlink and a dir junction fixture. Deletion: `fs.unlinkSync` for file symlinks, `fs.rmdirSync` for dir junctions/symlinks (try unlink, on `EPERM`/`EISDIR` fall back to rmdir). NEVER `rm -rf`/`recursive: true` — recursion through a junction deletes the TARGET's contents (the worktree-junction lesson, workspace CLAUDE.md).
- **Deleting the 15-min push loop before the daily snapshot works = a backup-freshness hole.** Task order below is deliberate: build the new daily snapshot FIRST, delete the old writers SECOND. Don't reorder.
- **`regenerateTopicCache` deletion:** grep ALL callers first (`Grep 'regenerateTopicCache' desktop/src`) — the Resume Browser invariants in PITFALLS exist because of this machinery; any caller you miss keeps rebumping mtimes.
- **Warning codes:** removing `PROJECTS_UNSYNCED` must also remove its writer in `runHealthCheck()` and any SyncPanel copy that references it — grep the literal string across renderer + main.
- **Auto-title still writes topic files** (the in-session `echo > topics/topic-<id>` hook). 2c does NOT change the hook — it removes topic files as a READ source (store title wins). Deleting the write path is a youcoded-core/app-hook change out of scope here; note it in knowledge-debt if desired.

---

### Task 1: Preflight audit

- [ ] Check 2b's status: `git log --oneline -10 origin/master | grep -i lease` and `git branch -a | grep sync-leases`. If 2b is already merged, branch 2c from master normally. If 2b's PR is still open, branch 2c from current master anyway (Destin cleared this — gate above) and note that Tasks 4/5 will rebase against `ipc-handlers.ts` + `main.ts` when 2b lands; keep those two edits small and well-commented to make the rebase trivial.
- [ ] Grep and RECORD current line anchors for: `aggregateConversations`, `rewriteProjectSlugs`, `regenerateTopicCache`, the `pull()` call sites, `pushTimer = setInterval`, the three auto-restore `--update` pulls (`CLAUDE.md`, `config.json`, encyclopedia — around `sync-service.ts:1256-1280` as of 2026-07-14), `PROJECTS_UNSYNCED`, `--ignore-existing`, the GitHub backup target, the recent-50 pull. Paste the map into the task notes for later tasks.
- [ ] Commit nothing; this is reconnaissance.

### Task 2: Symlink sweep module (design §4a part 2)

**Files:**
- Create: `youcoded/desktop/src/main/conversations/symlink-sweep.ts`
- Test: `youcoded/desktop/tests/symlink-sweep.test.ts`

- [ ] **Step 1: Failing tests** (real tmp dirs; skip junction test on non-Windows, symlink test everywhere):
  - removes a file symlink inside a slug dir; leaves the real target untouched
  - removes a dir junction/symlink at the slug level; the TARGET dir's contents survive
  - never touches real files/dirs (fixture with a real `.jsonl` beside a symlinked one)
  - idempotent (second run: zero removals, no throw)
  - returns counts `{removed, failed}`; a single EACCES doesn't abort the sweep (per-entry try/catch)
- [ ] **Step 2: Implement:**

```ts
// One-time cleanup of the legacy sync-service's aggregation artifacts (design §4a.2):
// aggregateConversations() symlinked every conversation into the home slug, and
// rewriteProjectSlugs() junctioned foreign-device slug dirs. Deleting those
// creators (Task 4) does NOT remove the ~687 links already on disk — this sweep
// does. lstat (never stat) so we NEVER follow a link; remove ONLY symlinks/junctions.
import fs from 'node:fs';
import path from 'node:path';

export function sweepProjectSymlinks(projectsDir: string): { removed: number; failed: number } {
  let removed = 0, failed = 0;
  let slugs: string[] = [];
  try { slugs = fs.readdirSync(projectsDir); } catch { return { removed, failed }; }
  for (const slug of slugs) {
    const slugPath = path.join(projectsDir, slug);
    try {
      // A junctioned/symlinked SLUG DIR (rewriteProjectSlugs artifact): remove the link itself.
      if (fs.lstatSync(slugPath).isSymbolicLink()) { removeLink(slugPath); removed++; continue; }
      if (!fs.lstatSync(slugPath).isDirectory()) continue;
      for (const entry of fs.readdirSync(slugPath)) {
        const p = path.join(slugPath, entry);
        try {
          if (fs.lstatSync(p).isSymbolicLink()) { removeLink(p); removed++; }
        } catch { failed++; } // per-entry isolation — one EACCES must not abort the sweep
      }
    } catch { failed++; }
  }
  return { removed, failed };
}

// unlink works for file symlinks; dir symlinks/junctions on Windows need rmdir.
// NEVER recursive — recursion through a junction deletes the target's contents.
function removeLink(p: string): void {
  try { fs.unlinkSync(p); }
  catch { fs.rmdirSync(p); }
}
```

- [ ] **Step 3: Green. Commit** — `feat(sync): one-time symlink sweep for legacy slug aggregation`.

### Task 3: New daily snapshot backup (BEFORE any deletion)

**Files:**
- Modify: `youcoded/desktop/src/main/sync-service.ts` (reshape, don't delete yet)
- Test: extend the sync-service tests where the harness allows; the rclone layer is exec-mocked in existing tests — follow that pattern.

- [ ] Reshape the Drive/iCloud push path to: once daily (persist last-run stamp in `~/.claude/toolkit-state/`), copy the `~/.claude` backup set (memory, CLAUDE.md, encyclopedia, config, skills — the existing set) to `Backup/<YYYY-MM-DD>/` dated folders instead of the flat overwrite tree. Reuse `isIgnoredPath()` from `sync-spaces/guards.ts` for scrub consistency (PITFALLS — the iCloud leak lesson).
- [ ] Add tiered pruning (Destin's decision 2 — grandfather-father-son). Implement as a PURE function (house pattern) + thin rclone shell:

```ts
// snapshot-retention.ts — pure: (folderNames: string[], today: Date) => string[] toDelete
// Folder names are Backup/<YYYY-MM-DD>. Rules (each snapshot's age in days vs today):
//   age <= 7          → keep all
//   8 <= age <= 28    → keep only the NEWEST snapshot per ISO calendar week
//   29 <= age <= 90   → keep only the NEWEST snapshot per calendar month
//   age > 90          → delete
// Unparseable names are NEVER returned for deletion (fail-safe: unknown = keep).
```

  Unit-test the tier boundaries (day 7/8, 28/29, 90/91), the newest-per-bucket picks, and the unparseable-name guard. After a successful snapshot, delete each returned folder via rclone `purge` on that EXACT dated path — never a wildcard.
- [ ] The conversation/projects content is already covered by `daily-backup.ts` (spaces) — do NOT duplicate it here. This snapshot covers only the non-space `~/.claude` set.
- [ ] Commit — `feat(sync): dated daily Drive/iCloud snapshots with pruning`.

### Task 4: Delete the legacy writers + aggregation (design §12 / §4a part 1)

**Files:** `youcoded/desktop/src/main/sync-service.ts` (+ any imports/tests that reference the deleted symbols)

Delete, in one reviewed commit (grep each symbol for ALL callers first):
- [ ] `aggregateConversations()` + `rewriteProjectSlugs()` + their `pull()` call sites (~`:1595-1596`) + `regenerateTopicCache()` (~`:1953`) + its call site (~`:1604`).
- [ ] The 15-min `pushTimer` loop (~`:216`), the session-end push, the 30s index-debounce push (grep `debounce` in the file), the recent-50 pull, `--ignore-existing` semantics.
- [ ] The GitHub backup target + GitHub restore adapter (the old repo stays frozen per Decision 1).
- [ ] The auto-restore-on-launch pulls (`CLAUDE.md` / `config.json` / encyclopedia `--update` block ~`:1256-1280`). **The Restore Wizard's explicit snapshot-restore path STAYS** — verify it doesn't route through anything you delete (grep `RestoreWizard` IPC handlers → sync-service methods before cutting).
- [ ] `PROJECTS_UNSYNCED` warning code + its `runHealthCheck()` writer + renderer references; shrink remaining codes to actionable-only per design §4.
- [ ] Commit — `feat(sync): delete legacy push loops, auto-restore, slug aggregation (design §12)`.

### Task 5: Run the sweep once at startup

**Files:** `youcoded/desktop/src/main/main.ts` (or wherever `startConversationStore` is called — colocate)

- [ ] Call `sweepProjectSymlinks(path.join(os.homedir(), '.claude', 'projects'))` once per launch, detached, AFTER the deletions land in the same release (running it while the built app still recreates links is pointless churn but harmless — it's idempotent; a once-marker file is optional, skip it: 687 lstats is cheap). Log the counts.
- [ ] Keep the 2a reconciler symlink-skip (design §4a.3) — verify it's untouched; add a WHY comment pointing here if not present.
- [ ] Commit — `feat(sync): startup symlink sweep wiring`.

### Task 6: Store becomes the read source for titles/flags

**Files:** `youcoded/desktop/src/main/session-browser.ts`, `ipc-handlers.ts` (flag paths), tests.

- [ ] Title precedence for store-backed rows: `record.title` first; the topic-file/index chain remains only for legacy (non-store) rows. Grep the "name precedence" implementation in `session-browser.ts` and reorder for store rows only.
- [ ] `setSessionFlag` goes store-only (delete the legacy conversation-index dual-write — grep `setSessionFlag` for the dual-write introduced in 2a). The legacy index file stops being written; keep reads working for any residual legacy-only row this release, note full index retirement in knowledge-debt.
- [ ] Resolve the knowledge-debt entry "CC-drift: cleanupPeriodDays coverage": verify `retention-default.ts`/`RetentionDefault.kt` still seed 365 correctly against current CC, then mark the entry resolved in `docs/knowledge-debt.md` (that file lives in the workspace repo — separate commit there).
- [ ] Commit — `feat(sync): store-first titles + store-only flags`.

### Task 7: Whole-suite regression + restore-path verification

- [ ] `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run` + `npx tsc --noEmit` + `npm run build` in `youcoded/desktop`.
- [ ] Manual (dev instance): fresh launch → no auto-restore fires (watch for rclone spawns; add a temp trace if needed); Restore Wizard still lists snapshots; daily snapshot writes a dated folder on the forced-run path; Resume Browser titles unchanged; flags round-trip.
- [ ] Commit fixes as found.

### Task 8: Local git maintenance + deferred remote compaction (the §7 "known limit")

**Files:**
- Modify: `youcoded/desktop/src/main/sync-spaces/git-transport.ts` (or a small `maintenance.ts` beside it)
- Test: extend the transport tests (30s timeouts live in the suite file, not global config — PITFALLS).

- [ ] After every Nth successful sync per space (N=50, persisted counter in the space's `.youcoded/` state, NOT config.json), run `git gc --auto --quiet` with the space's `GIT_DIR`/`GIT_WORK_TREE` env. Local repack only — **never** any history rewrite; this shrinks local disk and keeps push sizes sane, and cannot desync peers.
- [ ] Add a size probe: if `sync.git` exceeds 500MB, emit a one-per-launch warning event ("Sync history for <space> is large — see docs") through the existing `broadcast()` error/notice channel. Remote force-push compaction stays a documented manual procedure (write it into the handoff §2 as a named deferred item) — automating a coordinated force-push + peer re-clone is out of scope by decision 3.
- [ ] Contract-suite regression: full transport suite green (gc must not perturb the conflict/convergence tests).
- [ ] Commit — `feat(sync): periodic local git gc + size warning`.

### Task 9-pre (numbered Task 10 in commits): Delete the legacy `personal-sync` GitHub repo — GATED, runs LAST

Destin's decision 1: no dead repo. This is a guided manual step executed WITH Destin in the session, **after** Task 7's verification passes and at least one dated snapshot exists on Drive/iCloud. It is deliberately NOT app code — a one-time operation ships no product surface.

- [ ] **Pre-delete checklist (all must pass; show Destin the evidence):**
  - The new personal-space repo exists and both devices synced from it within the last day (`gh repo view <personal-space-repo> --json pushedAt`).
  - A dated snapshot folder exists for today on Drive or iCloud.
  - The legacy repo's content is confirmed superseded: its conversation JSONLs are a subset of what the store/space now holds (spot-check 3 filenames from the repo tree against `~/YouCoded/Personal/Conversations/claude/transcripts/`). Anything present ONLY in the legacy repo gets pulled down into a local archive folder FIRST (`gh repo clone` to a temp dir → copy the uniques → show Destin).
  - Task 4's writer deletions are merged (nothing will re-create the repo).
- [ ] **Delete:** `gh auth refresh -h github.com -s delete_repo` (interactive — Destin runs it via `! gh auth refresh ...` in the session prompt if needed), then `gh repo delete <owner>/personal-sync --yes` ONLY after Destin types explicit confirmation in the conversation. GitHub retains deleted private repos ~90 days via support restore — mention this as the safety net.
- [ ] Record the deletion (date, repo name, verification evidence summary) in the handoff tracker.

### Task 9: Docs, PITFALLS, review, PR

- [ ] PITFALLS updates: mark the "sync-service.ts is byte-untouched until 2c" and "Do NOT stop creating the symlinks before 2c" invariants as RETIRED-BY-2c (edit them to past tense with the commit ref — don't silently delete, future readers grep them); new entries: sweep-never-recursive, snapshot-restore-only, gc-is-local-only.
- [ ] Update handoff tracker (2c → shipped; remote-compaction deferred item named) and spec header (§4 implemented).
- [ ] Whole-branch two-stage review; PR; merge AND push; clean worktree.

## Self-check before calling 2c done

- `grep -r "aggregateConversations\|rewriteProjectSlugs\|regenerateTopicCache\|PROJECTS_UNSYNCED\|ignore-existing" desktop/src` → zero hits.
- A dev launch on Destin's machine shows the sweep log line with a plausible count (~hundreds first run, 0 after).
- `~/.claude/projects/C--Users-desti/` no longer contains 73-byte symlinks (spot-check).
- Drive remote shows `Backup/<today>/` and no writes outside dated dirs after a day.
