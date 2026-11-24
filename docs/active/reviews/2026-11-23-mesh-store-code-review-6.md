# Mesh store code review 6

Reviewer 6, 2026-11-23. Head reviewed: `94a129d66` (branch `session/64-mesh-sync-build`). Read-only on the repository.
Status: final.

**Verdict: SAFE WITH CONDITIONS.** All five round-5 findings (F1 to F5) are closed for the shapes they reported and for the neighbours I tried, and 100,000 random runs of my own fuzz found no silent wrong message and no silent loss except in two places. Those two places are real defects (below, B1 and B2), both small to fix, both need an unusual event (a takeover while a parked append exists; a crash in a tiny window plus a lost file). Fix B1 and B2 before building the replicator on top. Nothing found needs a redesign.

## What I ran and saw, versus what I only read

- RAN: own fuzz (`store-review-6/fuzz6.test.ts`, own oracle, own fault catalogue, own generator; only the virtual crash disk `vfs.ts` is borrowed from review 5, as a shim). 100,000 seeds of the general fuzz plus 50,000 targeted seeds (eviction x index/checkpoint faults, parked x swaps, tails). Every seed: 2 chats (40% of seeds the 2 versions share one chat and diverge), 2 to 4 sessions with random operations and crashes (power loss, process kill, torn or garbage writes, reordered unsynced writes), then ONE fault, then a possible crash during the repair at reopen, then reopen, check every line, resend the true lines, check again, reopen a second time.
- RAN: three hand-written probes (`probe1/2/3.test.ts`) for B1, B2 and the F3/F4/F5 neighbours.
- RAN: repo tests at head (357 pass) and a mutation spot-check on a copy.
- READ ONLY (not executed): the round-5 diff of `recovery.ts`, `parked.ts`, `highwater.ts`, `checkpoint.ts`, `inventory.ts` and the three oracle-loosening commits.

## Findings, most severe first

### B1. A parked append from the old history is drained into the new history after a takeover (REAL STORE DEFECT)

What a user would experience: after a takeover the chat shows messages from the OLD host's history in the middle of the NEW host's history, and the true continuation is then refused.

Reproduction (deterministic, `probe1.test.ts`): append A lines 0..40; park A lines 50..53 (the head is 40, so the append is parked); `setAsideTail` at line 20; append B lines 20..50 (the head reaches 50, the park drains). Result: lines 50, 51, 52 read `A-50..A-52` straight after `B-49`; the correct next append B 50..60 returns `not-a-prefix`; `head.damagedFromLine` is null. Nothing is reported.

Why: a park is sealed with its position and its own line hash (round-5 fix for F1) but nothing ties it to the chain it belongs to, and `setAsideTail`/`cutTo` (store.ts ~1173-1211) does not touch parks. `drain` (parked.ts:70-95) applies a park whose `from` equals the head with no check against history, because `applyLines` only compares overlap when `from < count`.
This is the F1 class (a valid file that is not the one that belongs here) in the one direction the position-and-hash id cannot see: the right position, the wrong history.
Suggested fix: when a takeover cut (or a quarantine that restarts the version) happens, move every park whose `from` is beyond the cut to `rejected/` (kept, never deleted). It is one loop in `setAsideTail` after `cutTo`.
Not found by the fuzz because the fuzz appends one canonical history; probe-only.

### B2. A set-aside tail is only protected by its `.done` marker, and the marker can be missing for good (REAL STORE DEFECT, narrow)

What a user would experience: the lines an old host had written after a takeover are the only copy in `tails/<id>.tail`. If that one file is lost, the store says "no such tail" (plain `null`), not "corrupt", and a repeat of the takeover call then answers `{lines: 0}` and writes an empty tail plus a `.done` marker, which erases the evidence for good. Up to 27 acknowledged lines vanished silently in the fuzz.

Reproduction (deterministic, `probe3.test.ts`): append 0..40, `setAsideTail` at 20, then reproduce a crash between the cut and the marker by deleting `.done`. Reopen, retry `setAsideTail`: it returns `{lines: 20}` but STILL writes no marker (store.ts:1117-1121: the condition `st.count === existing.fromLine + L` is false because the cut already happened, so `markCutDone` is never reached). Then lose `tails/<id>.tail`: `tail()` returns `null`, `head` is clean, nothing is reported. A second retry writes the empty tail and `.done`.
Fuzz: 24 distinct seeds in 100,000 plus 3 in the targeted run (for example 2206, 10199, 7906, 8328, 11817, 5549, 92954); each is a crash during `setAsideTail`, then one lost or rolled-back `tails/*.tail`.
Why it matters: round 4 F6 added the `.done` rule precisely so that a lost tail is reported; the rule has a hole in the very window it exists for (a crash between the cut and the marker), and a successful retry does not close the hole.
Suggested fix: in the retry branch (store.ts ~1117), when the tail exists, `!done`, the version is already at `existing.fromLine` and its chain value there equals `existing.fromHash`, call `markCutDone`. Better still: write an intent marker BEFORE the cut so that a missing tail is always evidence.
It is "two events" (a crash plus a lost file) but the crash is ordinary and the window is not rare enough to be a documented limit.

### B3. The high-water mark is raised less often than the header says (documentation, LOW)
`inventory.ts` says "up to 255 of the newest lines can be rolled back unreported". The mark is raised when `count - noted >= 256` at the END of an append call, so one large append call overshoots: in the fuzz a folder rolled back to a snapshot 282 lines newer than the record (seed 96018) was not reported. The limit is "255 plus the size of one append call". Not a defect, a wrong sentence.

### B4. Reads can throw `corrupt` while `head.damagedFromLine` is still null (INFO, UX)
After a single flipped byte in a body, `read` throws `corrupt` (typed, good) for that line but `head()` does not say so until the next scrub (about 280 of 100,000 seeds). After sibling or foreign body swaps the reported `damagedFromLine` can be later than a line that already throws. A screen that decides "is this chat healthy?" from `head` alone will say yes while a read of one message fails. Not data loss. Worth knowing for the UI layer: treat a `corrupt` read as the signal.

### Observations that are NOT defects (judged against the documented limits)
- Whole-root rollback, and rollback of the folder together with the high-water record, are silent (documented limit 4). Confirmed by `probe2`, and ~1,400 fuzz seeds.
- A takeover retried after a rollback lowers the mark and hides the rollback (deliberate cut; fuzz harness artifact in two seeds, 304847 and 318816).
- A set-aside tail created after a snapshot disappears with the folder when the folder is put back (documented).
- One fault in a version's `meta.json` right after a crash in its very first registration makes the version unreadable: the documented "two faults" case (`damaged`, typed, set-aside available).
- After a partial rollback (half of the files old, half new) the version is sometimes quarantined (`damaged`, typed, kept in `aside/`): 54 of ~4,200 runs. Safe, but the whole chat is unavailable until a peer resends it.

## F1 to F5: status

| Finding | Status | Evidence |
|---|---|---|
| F1 parked appends not bound to position | CLOSED for swaps, siblings, foreign, older, rot of park files (20,000 targeted seeds clean). NEIGHBOUR OPEN: B1 (right position, wrong history after a takeover) |
| F2 tail lacks takeover id | CLOSED (envelope id; tail sibling/swap/foreign clean over 25,000 seeds). NEIGHBOUR OPEN: B2 (marker hole) |
| F3 whole-folder rollback silent | CLOSED when the record knew the head: of ~4,200 exact rollbacks only 87 (2%) were silent and every one was newer than the record (documented limit 4, up to 255 plus one append). Deliberate-cut and tail interplay documented. Rollback of the record alone: under-reports, no loss (probe2). Record AND folder together: undetectable (documented). |
| F4 one deleted `index.bin` after eviction quarantines the version | CLOSED (probe2: kept lines served, after a further append and a reopen; 30,000 targeted seeds with eviction twice then index/checkpoint faults: zero silent) |
| F5 stale checkpoint after a second eviction | CLOSED (probe2: an older checkpoint after a second eviction still reads the evicted prefix as evicted, never as served-wrong; with the index deleted as well it still holds) |

## Oracle-excuse judgement (commits 7ad7b6e38, 810f7cb23, 94a129d66)

- 7ad7b6e38 ("count a close only when it finished"): HONEST. A close that was killed raises no high-water mark, so a rollback test must not expect one. Correct and strictly tightens the fuzz.
- 810f7cb23 ("rollback combined with a fault in the high-water record is two faults"): HONEST IN PRINCIPLE, TOO WIDE IN PRACTICE. The record can only under-report, so a rollback plus a rotted record is indeed two faults. But `hwFaulted` is set once and never reset, so a rollback many episodes later, after the store has long since rewritten the record, is still excused (`exemptFrom = 0`). It cannot hide a defect on its own, but it removes the oracle's ability to notice a record that is NOT repaired later. I did not find a case where this hid a real loss (my own oracle has no such excuse and found none), but I recommend resetting `hwFaulted` whenever the record has been rewritten.
- 94a129d66 ("a second fault on a folder that was just rolled back"): HONEST. After a rollback the first report is promised, not a second one. Same caveat as above: the flag lasts until the head passes the acknowledged count, which can be many episodes.
None of the three hides a loss that my stricter oracle found. The loss the repo's fuzz DOES miss (B1, B2) is not an excuse; it is a coverage gap: the fuzz writes one canonical history (no divergent histories, so B1 is invisible) and its tail faults always meet a tail whose marker exists (B2 needs a crash in the window plus a lost tail).

## Mutation spot-check
14 single checks removed one at a time in a throwaway copy (`store-review-6/mutations.py`, `runmut.py`). "Repo" = failing tests among the 357 (excluding fuzz.test.ts). "My fuzz" = violations in 8,000 general seeds (plus 4,000 targeted seeds for the survivors).

| Mutation (check removed) | Repo tests | My fuzz |
|---|---|---|
| M1 park drain ignores the sealed position+hash id | 1 fail | survives (redundant, see below) |
| M2 park drain ignores the line-hash check | 1 fail | survives (redundant) |
| M3 envelope ignores version key | 7 fail | survives (other layers catch it) |
| M4 envelope ignores role | 2 fail | survives |
| M5 envelope ignores sealed id (tail takeover id) | 3 fail | survives |
| M6 rollback report skips "same history" comparison | 1 fail | survives |
| **M7 a rolled-back head may lower the high-water mark** | **0 fail (SURVIVOR)** | survives |
| M8 checkpoint ignores version tag | 2 fail | killed (wrong head hash, evicted without evict) |
| M9 slot files pick the older slot | 11 fail | killed (false rollback alarms, 479) |
| M10 checkpoint boundary-flag consistency | 1 fail | survives |
| M11 takeover cut does not lower the high-water record | 3 fail | killed (false alarms, 650) |
| M12 retry may write an empty tail over a lost marked tail | 1 fail | survives |
| M13 tail() ignores `.done` when tail is gone | 3 fail | survives |
| M14 high-water never raised during appends | 2 fail | survives |

Reading: the repo's tests kill 13 of 14; the one survivor is M7 (the guard in `highwater.ts` `noteHw` that stops a rolled-back head from overwriting the mark it was compared with): no test notices it, so add one (roll back, append a few lines, reopen, expect the rollback still reported until the head passes the old count). My fuzz kills only 3 of 14, which says it is weaker than the repo tests for single-identity checks: M1/M2 guard each other (a swapped park fails the hash check even without the id), and the envelope checks are backed by chain checks, so removing one rarely changes a visible result. My fuzz is the stronger tool for freshness and high-water behaviour (M8, M9, M11) and found B2, which the repo tests and fuzz miss.

## Fuzz totals (my harness)
- General run: 100,000 seeds (1..100000), about 100,000 crashes injected, one fault dealt in 86,000 of them (24 fault kinds, between 1,100 and 8,200 each), 13,800 seeds with no fault as false-alarm control.
- Targeted: 30,000 seeds eviction x (index/checkpoint/marks/hw faults), 20,000 seeds parked x (swaps/siblings/foreign/older/rot/rollback), 3 tails-focused sets inside the general run.
- Violations by severity over the general run: silent wrong or missing message: 24 seeds, ALL of them B2 (tail marker). No wrong line served in any seed. No untyped exception in any seed. No `false alarm` in the no-fault control. No second-open shrink.
- Reported but typed (INFO): 280 reads that throw `corrupt` before the head says so (B4), version unavailable under one fault: 130 runs (all `meta.json` after a crashed first registration, aside-note rot after an explicit set-aside, and partial rollbacks).

## Complexity note
Inventory rows: 37 (21 version rows and 16 root rows, of which 21 are live-state kinds and the rest are kept or scratch copies), down from 39 and from the "25 file kinds" of round 5. Merging `partial`/`damaged` into `marks.bin` and one envelope for small files is a real simplification: one reader (`envelope.ts`, 56 lines) replaces five parsers. `store.ts` is exactly 1,500 lines, which looks budget-driven (the recent splits moved code out; they did not reduce it). The hardest part to reason about now is not a file kind, it is the set of ORDERING rules around a cut and a takeover (tail file, cut, lowered high-water record, lowered checkpoint, `.done` marker, parks, retry): B1 and B2 both live there. A short state diagram of `setAsideTail` would pay for itself before the replicator calls it. I would not simplify further before building; I would fix B1 and B2 and add the two probes as regression tests.

## What I did NOT cover
- Control log and extras (no operations in my fuzz; the repo's own fuzz covers them, I did not judge it).
- Disk full (ENOSPC), file systems that lie about fsync, Windows rename semantics, Android.
- Two faults in one run, except fault plus a crash during repair (25% of faulty runs).
- Concurrent processes (lock), clock changes, very large chats (largest 900 lines; bodies in up to ~20 chunk files).
- The adapter layer (`adapter.ts`) and the classifier.
- Rollback of the whole store root (documented undetectable).
- `restoreBody` with wrong bytes supplied by a peer.
