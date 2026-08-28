---
status: shipped
created: 2026-08-27
kind: implementation-handoff
supersedes_context_for: docs/active/handoffs/2026-08-26-model-download-resume-handoff.md
spec: docs/archive/specs/2026-08-26-model-download-resume-design.md
plan: docs/archive/plans/2026-08-26-model-download-resume.md
---

# Continuation handoff — interrupted model downloads

Written 2026-08-27 before a context compaction. The plan is still the contract;
this file records **where execution stopped, what the plan does not say, and the
traps that cost real time in the first session.**

## 1. State

- Worktree `worktrees/download-resume`, branch `feat/model-download-resume`,
  tip **`6d27f2d0`**, working tree clean, nothing pushed, no PR.
- Base is `origin/master` at `62c1f182`. **`origin/master` has since moved to
  `1f044b0d`** — rebase before opening the PR, not before (it invalidates the
  screenshots).
- Branch touches 9 files: the 6 renderer/shared ones from the design pass, plus
  `download-manifest.ts` (new), `cache-scan.ts`, `engine-manager.ts`, and their tests.

**Plan tasks 0–6 are DONE and committed.** Task 2's human gate is **closed** —
Destin signed off 2026-08-27 ("okay, good enough") after four review rounds.

| Task | State |
|---|---|
| 0 Worktree · 1 Types · 2 Design pass (gated) | done |
| 3 `download-manifest.ts` | done — 8 tests |
| 4 Downloader writes/keeps/removes the manifest | done — 11 tests |
| 5 `scanLocalDownloads` + `isComplete`, `scanGgufCache` derived | done — 13 tests |
| 6 `installedModels()` three states + delete cleanup | done — 13 tests |
| **7 `ModelManager.resume()` + disk guard** | **NEXT** |
| 8 Channel surgery (`models:orphaned-partials` → `models:resume`) | not started |
| 9 Renderer tests vs the real backend | not started |
| 10 Verify, exercise, document, ship | not started |

## 2. Start here

`cd youcoded/desktop && npx tsc --noEmit` currently reports exactly the Task 7/8
work and nothing else — **treat that error list as the to-do**:

```
model-manager.ts(11)  no exported member 'scanPartialFiles'   → delete the import (Task 7)
model-manager.ts(18)  no exported member 'OrphanedPartial'    → delete from the type import (Task 7)
model-manager.ts(150) parameter 'p' implicitly any            → falls out with orphanedPartials()
```

Task 7 (plan line 1394) then: `bytesOnDiskFor()`, `download()` passing it to the
guard, `resume()` reading the manifest, `orphanedPartials()` deleted,
`checkDiskSpace` gaining a third argument. Task 8 (plan line 1620) enumerates
every one of the five surfaces.

## 3. What the plan does not tell you

- **The UI is finished and signed off.** Do not reopen it. Final geometry lives
  in `LocalModelsSection.tsx` (`MASK`, `BAND_H/SWEEP/DEPTH`, `ROW_BANNER`).
  Destin tuned it himself on `docs/active/design/2026-08-26-download-resume/band-shape-tuner.html`.
- **Copy decisions he made** (all already implemented): "Delete" everywhere
  (never "Discard"); "Pause" not "Cancel" while bytes move, and a live download
  shows that ONE control; a row that cannot be resumed says **Damaged**, not
  "Unfinished"; the damaged explanation lives behind an (i); quality gets its own
  full line; progress numbers are centred above the bar, not under the name.
- **Task 9's cancel-before-delete test needs rethinking.** The row now hides
  Delete while a download is live, so that ordering cannot be driven through a
  click. The guard in `remove()` is kept deliberately (a stale progress stream
  can still report `downloading`) — pin it by rendering with a live progress and
  exercising the handler, not by clicking a button that isn't there.
- **Task 10 Step 2 is read-only against Destin's REAL model folder** — `NativeHome`
  uses `os.homedir()`. The interactive quit/relaunch checks are HIS to run.
- Two ROADMAP items were opened from this work and are NOT part of it: the
  boot-check false-pass, and the app-wide binary-vs-decimal GB question.

## 4. Traps that cost time — do not repeat

1. **`run-workbench.sh` must be launched with an ABSOLUTE path.** Run it with the
   shell sitting in the worktree and it fails with "No such file or directory";
   the launch looks fine and every later screenshot is of nothing. Cost three
   rounds. Always confirm afterwards:
   `ss -ltnp | grep :<port>` and `readlink /proc/<pid>/cwd`.
2. **`workbench-boot-check.mjs` prints "All N routes mount cleanly" against a
   DEAD port** (verified against port 5999, exit 0). A green boot check proves
   nothing unless you separately confirmed something is listening. On the ROADMAP.
3. **`VITE_NO_WATCH=1` means the server never picks up your edits.** Restart the
   workbench after every source change or you will screenshot the old build —
   this is what made a correctly-written taper look broken for three rounds.
4. **`coverage.md` is built from `manifest-*.json` in `shots-<plan>/`, and it
   UNIONS them.** A re-shoot adds a manifest; it does not replace the failing one.
   To make a refill count, delete the superseded manifests, then
   `run-review.sh --reports-only <outDir>`. Deleting the PNGs or the run logs
   does nothing.
5. **Concurrent sweeps collide.** Other sessions run reviews on this machine;
   the rig refuses rather than mixing worktrees. Use `YOUCODED_PORT_OFFSET` ≥100
   away, and kill only processes you have confirmed are yours (`/proc/<pid>/cmdline`).
6. **Meadow-mist is the flaky theme** under load — it drops interactive shots.
   Refill that theme alone rather than re-running the sweep.
7. **Announce before opening a window on his desktop.** Also: he asked for images
   opened with `gwenview`, not chat attachments.

## 5. Definition of done (unchanged from the original handoff)

`rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials|OrphanedPartial|scanPartialFiles|activePartialNames' src tests ../app/src` → nothing.
`bash scripts/verify.sh <worktree> --full` exit 0, pasted into the PR body.
After merge: archive spec + plan + both handoffs, `status: shipped`, ROADMAP
`[x]` with the merge SHA, MAP row updated, worktree and branch removed.
