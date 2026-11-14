---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0, T4 — do project files settle between equal devices (design 2.8, 5.7, S8)
---

# T4: project-file convergence

## 1. Verdict

**PARTIAL.** Section 5.7 as written FAILS the section 9 pass line: with its merge rules, three devices keep producing merge commits forever (68 of 150 dense schedules never settled; one hand-built case made 405 commits from 3 edits and was still going). **With the four changes in section 4 below it PASSES**: 1,000 of 1,000 random three-device schedules, 300 of 300 four-device, 200 of 200 five-device, 300 of 300 with each device matching lines differently, and 24 of 24 two-hosts-writing-every-2-seconds schedules. Identical trees and identical commit ids everywhere, bounded commit count, no lost content, no repeated copies visible, bad tips merged nothing. O14 (one fixed sequencer) is not needed.

## 2. What was done

Throwaway carrier simulation, real `git` 2.56.0 (the only version installed here), temp folders under `/dev/shm`, all code in `docs/active/prototypes/2026-11-14-mesh-phase0/T4/`:

| File | What it is |
|---|---|
| `lib.mjs` | The merge rule from 5.7 written as app code on git plumbing: `merge-base`, `diff-tree`, per-file `merge-file`, a throwaway index, `write-tree`, `commit-tree`. Not `git merge`. |
| `carrier.mjs` | A device (work folder + hidden history repo `.youcoded/sync.git` + bare `.youcoded/mesh-remote.git`), a network that reorders, delays, drops and duplicates, and the send/receive loop. History moves only as incremental `git bundle` files. |
| `fuzz.mjs` | Seeded schedule fuzzer and assertions. |
| `scenarios.mjs`, `scenarios-output.txt` | One hand-built case per rule in 5.7. |
| `perf.mjs` | Sizes and times on a 5,000-file project. |
| `runall.sh`, `runmore.sh`, `results-*.txt` | The campaign and its raw output. |

Re-run: `node fuzz.mjs --n 1000 --devices 3 --jobs 6 --seed0 1` (about 17 minutes); one schedule with its history graph: `node fuzz.mjs --seed 892 --devices 3`; add `--cfg key=value,...` to switch a rule off (keys in section 3.1); `node scenarios.mjs`; `node perf.mjs 5000`.

**What a schedule is.** 3 devices (also 4 and 5) with a shared starting project; a chain (A meets only B, B meets only C), full or star topology; all devices commit every simulated 2 s for 6 to 21 ticks (each device with 40 to 100 percent chance per tick of one random action: create, insert a line, replace a line so two devices hit the same line, delete a line, delete a file, rename; file names reused so a file and a folder can collide); clocks skewed by up to a month; bundles delivered in random order, duplicated up to 30 percent, dropped up to 30 percent (the sender re-sends), delayed. 30 percent of schedules also inject a **rogue device with an unrelated root commit** sending tips with bundles; 12 percent of ticks inject **a tip pointing at a commit no bundle ever delivers**. After writing stops, delivery continues (still reordered and duplicated, no loss) until nothing moves.

**What is asserted after it stops:** every device has the same HEAD commit id; work folders are identical byte for byte and equal HEAD (nothing uncommitted); history growth is bounded (merge commits in history at most devices times user commits, which is provable: every merge a device makes adds at least one user commit its head lacked); every commit any device made is in the final history; every line any user wrote is in some file unless a user removed it (every line is a unique token, so a lost line is detectable; an edit lost to a delete shows up here); no version appears under two names; rogue content was never merged and a device that received both a rogue tip and its bundle says "diverged"; fake tips merged nothing.

## 3. Findings

### 3.1 Results

| Run | Schedules | Passed | Merge commits per user commit (median / 95th / max) | Ticks to settle (avg / max) |
|---|---|---|---|---|
| 3 devices, the amended rules | 1,000 | **1,000** | 0.76 / 1.18 / 1.40 | 17.9 / 35 |
| 4 devices | 300 | **300** | 1.00 / 1.73 / 2.14 | 20.4 / 46 |
| 5 devices | 200 | **200** | 1.17 / 2.23 / 2.59 | 22.2 / 39 |
| 3 devices, each uses a different line-matching method | 300 | **300** | 0.79 / 1.19 / 1.33 | 17.7 / 32 |
| 2 hosts both writing every 2 s for 2 minutes | 24 | **24** | 0.51 / 0.71 / 0.72 (about 113 user commits per run) | 14.4 / 25 |

Raw: `results-main-3dev.txt`, `results-4dev.txt`, `results-5dev.txt`, `results-mixed-git-methods.txt`, `results-long-2hosts.txt`. A tick is 2 simulated seconds; "settle" counts ticks after writing stopped and includes the simulated network's random delays, drops and retries, so it is not a latency figure. These schedules are far denser than real use (3 devices all editing the same 7 files every 2 s): 6,948 conflict copies appeared in 960 of the 1,000 three-device schedules.

Commit growth is linear: with 2 hosts writing every 2 s the history gains about 1.5 commits per user commit (the user commit plus about 0.5 merge commits); after writing stops it stops (no further commits in any run; "settled" requires no messages, no sends and no head change for 4 ticks).

**Rules switched off one at a time, on the same first 150 seeds** (`results-ablation-*.txt`; all 150 pass with every rule on):

| Switched off | Passed of 150 | What went wrong |
|---|---|---|
| (design 5.7 as written: ordinary merge commits, merge heads in arrival order, no dominance rule, stock criss-cross base, duplicates shown) | **63** | 68 schedules never settled, heads differ on 62, merge commits up to 312 |
| Dominance rule (section 4, change 1), deterministic commits kept | 141 | storm: average 38 merge commits instead of 21; up to 148; 9 schedules over the growth bound |
| Deterministic merge commits (fixed author, message, date, parent order), dominance rule kept | 150 | nothing: not needed once the dominance rule exists |
| "More history first" in the tie-break (lower id only) | 150 (but 497 of 500 in the longer run) | 3 of 500 never settle, see 3.3 |
| Conservative base (use git-style merged base for criss-crosses) | 150 | too few seeds to show it: 4 of 1,000 lose a line, see 3.5 |
| Duplicate-hiding (section 4, change 4) | 109 | 41 schedules show the same version under two names |

Longer runs of the questionable rules (`results-long-ablation-*.txt`), same seeds 1 upward:

| Variant | Schedules | Passed | Conflict copies made |
|---|---|---|---|
| Amended rules (conservative base) | 1,000 | 1,000 | 6,948 |
| Stock git-style virtual base | 1,000 | 996: **4 lose a user's line** (seeds 490, 510, 725, 800) | 4,600 |
| One real base (lowest id) | 1,000 | 1,000 | 8,986 |
| Tie-break by lower id only | 500 | 497: **3 never settle** (seeds 214, 307, 496) | not compared |

### 3.2 5.7 as written does not converge (the number-one risk was real)

`scenarios.mjs`, last three cases, three devices each edit the same line: with ordinary merge commits, merge heads folded in arrival order and no other rule, the trees are identical but the commit ids never agree, because every device keeps merging the other devices' merge commits (all with the same tree). 405 commits from 3 edits after 120 ticks and still rising (`scenarios-output.txt`). Making the merge commit deterministic as 5.7 says (fixed author, message, later parent's date, sorted parents) removes the endless version but not the storm: 7 merge commits instead of 2 for the same three edits. The reason is that a device holding merge(A,B) then C and a device holding merge(B,C) then A produce different merge commits of the same content, and each treats the other's as news.

### 3.3 The smallest change that stops it: a "nothing new here" rule

A head is **covered** by another when every non-merge commit reachable from it is already reachable from the other. A device ignores covered heads, adopts a covering head outright (no new commit), and makes a merge commit only when each head has a user commit the other lacks. On a content tie (two heads cover each other) the commit with **more history wins, then the lower id**. Lower id alone dead-locked once (an earlier revision of this prototype, seed 105: a device whose head was a descendant of the lower-id commit never gave way, the other devices never took it); in the 500-schedule run, lower-id-only left 3 schedules (214, 307, 496) with different heads that never settled. With this rule, each merge strictly adds a user commit to the merging device's head, which is what bounds the commit count, and **identical merge commits stop being necessary** (the row above: switching determinism off changes nothing). Keeping them is harmless and was kept.

Side effect, stated plainly: adopting a covering head can move a device's `main` to a commit that is not a descendant of its old one (merge-only commits are dropped from `main`; every user commit survives, asserted). `types.ts` documents `maybeGc` as "never rewrites history", and `GitTransport.push` assumes fast-forward. The carrier must force-update its own tip.

### 3.4 Tip exchange needs a one-time reply

First version of the loop never settled for a different reason: if device D has the same head as peer P and P's tip message to D was lost, D re-sent forever because P never learned D was caught up. Fix: each message carries the sender's head; a device that receives a head it already contains answers once with its own head, and answers are not answered. Out-of-order bundles whose prerequisites are missing are parked and retried after any later import (`importFails` counter in the device stats): required, because the carrier repo only has what has been imported or pushed into it, so a device must also push its own commits into `mesh-remote.git` before it can name them as a bundle prerequisite.

### 3.5 Criss-cross merges: the stock base choice silently loses a version

When two merge heads have several merge bases (a criss-cross, which appears with three devices), the obvious fix, git's own, is to merge the bases into a virtual base. In this setting that **loses content**: the virtual base resolves the bases' own clashes by picking a winner, and a version that merely equals that made-up winner is then read as "unchanged" and dropped. Found at seed 725 (a line `A29` written by a user and then missing from every file; it happens with the duplicate-copy deletion of 3.6 on or off). The first 1,000-schedule run (stock base) failed on exactly that one schedule (`results-earlier-main-recursive-base.txt`). Smallest change: when building the virtual base, anything the bases disagree on is left out of it (it reads as "not there"), so both sides count as having added their version and the clash rule keeps both. Cost, user visible: **more conflict copies** in criss-cross cases (6,948 copies over the same 1,000 schedules instead of 4,600 with the stock base, +51 percent). Evidence this matters: the stock base lost a user's line in 4 of 1,000 schedules (the table in 3.1). Picking one real base (the lowest id) instead lost nothing in 1,000 schedules but makes more copies than the conservative base (8,986 versus 6,948), so it is the fallback if the conservative base ever misbehaves.

### 3.6 Deleting duplicate copies is unsafe; hiding them is safe

Two versions by the same device on the same day get the same copy name, and which one keeps the plain name depends on merge order, so the same version can end up under two names (27 percent of dense schedules). The natural fix, deleting a copy whose bytes equal its original, **loses content**: one branch deletes copy N because it equals the file F, another branch changes F, and merging the two deletions-and-edits drops both (seed 892: line `A32`). Fix that passes: keep such copies in the stored history but do not write or show them; staging puts their entries back instead of recording a deletion. A copy becomes visible again the moment it stops being identical. Costs: staging (`git-transport.ts:1006` `stageAll`) must restore hidden entries, and checkout must skip them. Without it, 41 of 150 schedules show clutter (table above).

### 3.7 Rules that hold, with the evidence

- **Same lines edited on both devices:** the lower blob id keeps the name, the other becomes `name (from <device>, <date>)` with device and UTC date from the commit that made that version (latest non-merge commit that touched the file; falling back to the latest non-merge commit of that side when a merge created the file). Same result on every device in all runs. Three devices on one line: one keeps the name, two copies (`scenarios-output.txt`).
- **Edit versus delete:** the edit is kept (scenario; any run in which a user's line would be lost fails the line-loss assertion).
- **Both renamed differently:** both names kept, **for free**, because the merge does no rename detection (a rename is a delete plus an add). So nothing here is heuristic or git-version dependent.
- **Rename on one device, edit on the other:** the user sees **two files**: the old name with the edit, the new name with the old text (`scenarios-output.txt`, "renamed on one device"). Content is never lost, but the edit does not follow the rename. Detecting renames would fix it and bring back a heuristic. Left as is.
- **A file here, a folder of the same name there:** not in 5.7. Needed: the folder keeps the name, the file becomes `name (from <device>, <date>)`.
- **Copy name already taken by a different version:** `name (from Laptop 2, date)`, as `freeCopyName` does today (`git-transport.ts:1093`). Replacing the number by the version's own id gave no improvement (38 versus 41 duplicate-showing schedules of 150, `results-ablation-*` experiment, not kept).
- **Three-way clashes** produce copies of copies (`a (from A) (from B).txt`) when a user edits a copy; observed, bounded, all preserved.
- **Date of the later parent:** the merge commit's date is the larger of the parents' dates, which is symmetric, so ties cannot differ. Clocks skewed by up to a month are in every run; the only visible effect is that a copy's name can carry a date a month off (for example `2025-09-09` for a file written on 2025-10-09), because 5.7 takes the date from the commit.
- **Chain topology** (A meets only B, B meets only C): passes; A's work reaches C only inside B's commits.
- **Tip pointing at a missing bundle:** 1,314 fake tips across the 1,000-schedule run, none merged, none flagged. This is **"waiting", not "diverged"**: an out-of-order bundle looks the same. 5.7's safety sentence should say so (section 4).
- **Tip from unrelated history:** 425 devices flagged "diverged" in the main run, rogue content never merged, a flagged sender is ignored from then on.

### 3.8 Sizes and times (5,000 files, 13.4 MB, one folder level, this machine, the machine was shared and loaded, so times are indicative)

Run `node perf.mjs 5000`:

| Step | Time |
|---|---|
| First commit of all 5,000 files (device A, one time) | about 0.28 s |
| First download to a second device from a git fetch, including checkout (one time) | about 0.7 s |
| Whole project as one bundle (a first download by bundle) | 6.9 MB |
| One device: snapshot after a one-line edit (`add -A` plus commit) | 32 to 75 ms |
| One device: the same check when nothing changed | 8 to 11 ms |
| Cut an incremental bundle for one peer | about 20 ms |
| **Bundle for a one-line edit of one text file** | **459 to 462 bytes** |
| Peer: import the bundle (carrier repo plus history repo) | 17 to 19 ms |
| Peer: adopt it and update the work folder (fast-forward) | 128 to 134 ms |
| Both devices edited different files: merge | 69 to 79 ms each |
| Both edited the same lines: merge with a copy made | 77 to 82 ms |

So a full round, edit to visible on the other device, is about 0.2 s of git work for a 5,000-file project, plus whatever the network and the 2 s wait add. Two more bundle sizes (`node perf-binary.mjs`): a 5 MB binary file with 100 bytes changed in place gives a 707-byte bundle; the same file fully rewritten (as a re-zipped Office file would be) gives 5.2 MB, the file's whole size. UNVERIFIED for real Office files; the second number is the bound. Load on the machine was about 20 during these runs (other investigations were running), so treat times as upper-ish estimates.

### 3.9 Git version sensitivity

- Only git 2.56.0 is installed here; **no other version was tried (UNVERIFIED)**. The Android app ships its own git build (`git-transport.ts:494` mentions its empty template folder); its version is unknown.
- What the merge uses: `merge-base --all`, `diff-tree -r --raw -z --no-renames`, `ls-tree`, `read-tree`, `update-index --index-info`, `write-tree`, `commit-tree`, `bundle create`, `fetch` from a bundle, and `merge-file -p` for per-file text merging. Everything except the last is long-standing plumbing. The prototype passes `--diff-algorithm=myers` to `merge-file`; that option is newer than most of the others, so the real code should leave it out and take git's default (UNVERIFIED which version added it).
- **No rename detection and no `git merge`** means the two sources of cross-version drift (rename similarity scoring, merge-strategy changes) are not used.
- The one place a version change could change a result is the line-level text merge. The 300-schedule "different line matching per device" run (myers, patience, histogram, minimal assigned round-robin) passed 300 of 300: because a device adopts the winning merge commit whole, devices need not compute identical trees for the same pair of heads, only agree on which commit wins. That run simulates version drift with different algorithms on one binary; it is not proof across versions.
- Commit ids stay identical across versions only if `commit-tree` writes the same bytes; not needed for convergence, as shown.

## 4. What this changes in the design

**5.7, "The same merge on every device"**: replace the bullets with:

- The merge is the app's own code over git plumbing (list above), not `git merge`, and runs on a clean work folder after the usual snapshot commit. Per file, against the merge base: changed on one side only, take it; both sides changed different lines, take the text merge; both changed the same lines (or both added the same name with different content, or the text merge fails or the file is binary): the side with the lower blob id keeps the name, the other becomes `name (from <device>, <date>)`, device and UTC date read from the commit that made that version; one side edited and the other deleted: keep the edit; both renamed differently: both kept (renames are never detected, a rename is a delete plus an add); a file on one side and a folder of the same name on the other: the folder keeps the name, the file becomes a copy; a copy name taken by different content gets "Device 2", "Device 3".
- **Several merge bases:** merge the bases into one shared ancestor, leaving out any file they disagree on (never choose a winner among them).
- **Which head to merge:** a head whose non-merge commits are all inside another head is ignored; if two heads hold the same commits the one with more history wins, then the lower commit id; a merge commit is made only when each head has commits the other lacks. A device that adopts a head that is not a descendant of its own moves its own `main` there and force-updates its tip in the carrier repo; user commits are never dropped.
- **Merge commits** still use a fixed author and message, the later parent's date and sorted parents (harmless; no longer needed for convergence).
- **Duplicate copies:** a conflict copy whose bytes equal its original, or an earlier-named copy of the same original, stays in history but is not written to the work folder and is not shown; staging restores its entry instead of recording a deletion; it appears again once it stops being identical. Never delete it.
- With three or more histories the sentence "devices may pass through different merge commits, but end on the same tree, and on the same commit once nothing new is being written" is now tested and true for 1,800 schedules, but only because of the rules above.

**5.7 Safety:** replace "Adopt a tip only if it connects to local history; otherwise the project is 'diverged'" with: a tip whose commits are not here yet is **waiting** (keep it, retry, ask the device); a tip whose commits are here and share no root commit with ours is **diverged**; a diverged sender is ignored for that project. Each message carries the sender's tip; a device that already contains a received tip answers once with its own tip, and answers are not answered. A bundle whose prerequisites are missing is parked and retried after any later import. Local commits are also written into the carrier repo, so they can be named as bundle prerequisites.

**3.6 and 6.1 S8:** the existing contract tests `divergent edits converge: remote wins canonical, local kept as conflict copy` (`sync-transport-contract.ts:68`) and the first-sync test at about line 127 to 136 ("remote/A wins canonical") encode today's rule and must be rewritten as 5.7 says; the secrets rule (`isNeverSyncPath`, `git-transport.ts:911-925`: never make a "(from ...)" copy of a secret) is **not** in the prototype and has to be re-applied inside the new merge (UNVERIFIED how; a secret is excluded from staging today, so it should never reach a clash, but the conflict branch exists for the case where it did).

**9 row T4:** add the assertions "same version never under two names", "a user's line is never lost unless a user removed it", "tip with missing objects waits, unrelated root is diverged", and the schedule generator in `fuzz.mjs`. Again in Phase 4 against `GitTransport` itself (this prototype did not touch it).

**12.1:** can stay first among risks until Phase 4 repeats T4 on the real transport, but the risk is now "did the real code match the prototype", not "can it converge".

**O14** (one fixed sequencer per project) is not needed. If the amended rules were rejected, O14 would need: a lock or register naming one device per project; every other device sends its commits only to that device and only that device merges; files then move only while it is on. A cheaper middle option exists and is already in the design as traffic-only: send to the lowest-id online device first; with the dominance rule that alone would make most merges happen in one place, but it was not needed for correctness here and was not simulated.

## 5. Needs Destin

Two things users will see, both small; neither blocks the build:

1. **Conflict copies** in criss-cross cases (three or more devices catching up on each other's changes at once) are made more often than a plain git merge would (about half again as many in the worst-case test), because the stock way silently dropped a version in 4 of 1,000 test runs. Recommendation: keep it safe. Cost: occasionally one more `name (from Device, date)` file.
2. **Rename plus edit:** if one device renames a file while another edits it, the user sees two files (the old name with the edit, the new name with the old text) rather than one renamed, edited file. Recommendation: accept it; fixing it needs rename guessing, which can differ between computers.

## 6. Could not test here

- Any git other than 2.56.0, including the Android build of git.
- Windows or macOS (case-insensitive file names: `guards.ts` `findCaseCollisions` names collisions; the prototype does not model them), symlinks, file modes, binary files through the text merge (`merge-file` fails on them and the prototype treats that as a clash; not exercised), files near the 50 MiB cap.
- Writes landing in the work folder while a merge is running (the prototype is single-threaded; the real code must snapshot first, as `pull()` does at `git-transport.ts:777-815`).
- The keeper's tip register, the sequencer, the released-bundle fallback ("fetch straight from a device"), encryption, real `engine.ts` timers and file watching. The prototype exchanges tips directly between devices.
- `GitTransport` itself; T4 must be repeated there in Phase 4.
