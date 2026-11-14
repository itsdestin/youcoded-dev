---
status: active
date: 2026-11-14
topic: Mesh chat store, fourth adversarial review of commit 10b0465cf (independent fault-injection fuzz, stale-copy probes, mutation check)
---

# Mesh chat store: code review, round 4

Reviewed: `youcoded/desktop/src/main/mesh/store/` at `10b0465cf` (the store directory is byte-identical at the branch head `b39299727`). Read-only on the repo. All experiments ran in a scratch copy under `.../scratchpad/store-review-4/` (fuzz: `desktop/r4/fuzz.test.ts` + `myfs.ts`; probes: `scen.test.ts`, `tail.test.ts`, `big.test.ts`, `odd.test.ts`, `race.mjs`; mutation runner: `mut.py`).

## Verdict

**Yes, with conditions.** Nothing was found that serves wrong bytes, and nothing was found that loses an acknowledged line to a crash, a full disk, a stale lock, or one flipped/truncated/zeroed/deleted file in the places the earlier rounds attacked. 31,000 independent fuzz sequences and real two-process lock races held on all of those. But the promise as written ("never lost or silently changed by ... one corrupted/truncated/zeroed/deleted file of ANY kind", "stale-but-valid") is **not yet true**, because of the findings below. The author's fuzz has two blind spots that hid them (section "Were the tests weakened"). Conditions before building on it:

1. **F1 must be fixed before eviction is ever switched on** (an older copy of `evicted.json` makes the store delete bodies it was never told to delete). Today eviction needs a verifier the default store refuses, so nothing in the shipped app can trigger it; that is the only reason this is not a stop sign.
2. **F2 (control log) needs a decision**: either give the log an independent record (like the checkpoint) or state, in the promise and in `inventory.ts`, that the control log relies on peers for any loss that ends at a record boundary.
3. F3 (a missing or short body chunk hides the whole chat) contradicts promise 3 as written. Either change the promise or serve the intact lines.

## Findings, ranked

### F1 (HIGH) An older, internally valid copy of `evicted.json` deletes acknowledged bodies that were restored and never re-proven
- **A user would see:** lines that were on their disk and acknowledged become "evicted" (their body files are unlinked) with no proof from any other device for the current state. If no other device really holds them, they are gone.
- **Repro (RAN, `r4/scen.test.ts` S1):** append 30 lines (chunk size 1000); `evictBody(through 20)`; copy `evicted.json` (call it E20); `restoreBody(all lines)`; `evictBody(through 5)`; close; put E20 back (a stale but checksum-valid file); reopen. Before: `EEEEE.........` After reopen: `EEEEEEEEEEEEEEEEEEEE......`, and `body-0000000000000000.bin` is deleted. `head().evictedLines` says 20, `damagedFromLine` is null.
- **Fuzz (RAN):** `older` fault on `evicted.json`, single fault: final-run seeds 8459 and 31988 (18 and 13 acknowledged lines with no copy anywhere under the root); calibration seed 1055 lost 2 lines. 13 final-run sequences with at most one fault carry the "evicted without proof" flag: 10 are index swaps (F8) and 3 are this (21273, 8961, plus the two above counted separately).
- **Why:** `resolveEvicted` (`versionfiles.ts:59`) trusts a marker when the index record of its last line ends at the marker's byte count. That check proves the marker is *a past truth*, not that it is *current*. Then `store.ts:373` unlinks every chunk below it. The `DESTRUCTIVE-OK(verified-record)` reason on that line ("a proven eviction ... a checksummed marker that matches the index") is false for a stale marker.
- **Fix direction:** a freshness token the marker cannot fake: put an eviction generation number in the checkpoint slots (in-place, CRC'd) and in `evicted.json`, and delete on load only when they match; or never unlink on load, only inside `evictBody` and under an intent record that is itself consumed.

### F2 (HIGH for the promise, MEDIUM for the app) The control log has no independent record: deleted, truncated at a record boundary, or rolled back is silent
- **A user would see:** control entries (host changes etc.) that were acknowledged simply vanish; `controlLog()` returns fewer entries and `controlDamage()` is empty. Nothing is reported.
- **Repro (RAN, `scen.test.ts` S3):** append 6 control entries; close; (a) delete `control/<h>/log.bin` -> 0 entries, `controlDamage=[]`; (b) replace the log with a copy taken after entry 3 -> 3 entries, `controlDamage=[]`. A truncation that lands on a record boundary is identical to (b).
- **Fuzz (RAN):** `control-silent-loss-after-control-fault`, 891 sequences out of 31,000 (605 with exactly one fault).
- **Why not caught:** the author's fuzz excuses it (`fuzz.test.ts:153`, `controlHit`) and lists `control/` as a "single copy" file (`fuzz.test.ts:49`), so a silently shorter log is never a failure there. The honest limit "destroying the only copy is reported" is not honoured for this file, because nothing exists that could notice.
- **Fix direction:** write a count + chain hash of the log head into a second file (or into the same record as a trailer slot) the way the checkpoint does.

### F3 (MEDIUM) One short, truncated or missing body chunk moves the WHOLE chat aside; good lines are hidden
- **A user would see:** after any truncation of any body file (or deleting a chunk, or an older/shorter copy of one), the entire chat reads `damaged` and serves nothing, including thousands of intact lines in other chunks and the intact lines inside the truncated chunk. The bytes are kept in `aside/<vhex>-q<n>/`, so nothing is destroyed, but the user's chat is empty until a peer re-sends everything and someone calls `setAsideDamaged`.
- **Repro (RAN):** `scen.test.ts` S2b (delete the third of several chunks): `damaged: a10102-q1`. Fuzz stats (4,800-sequence calibration run, single-fault outcomes): truncating a body file ended in `version-unavailable` 438 of 438 times; deleting a chunk 145 of 233 (the rest `reads-fail`); an older (shorter) copy 52 of 62; flips and zero-fills, by contrast, are served around correctly (partial damage only, 700+ cases).
- **Why:** `store.ts:324` throws `Damaged` when the body is shorter than the index; `quarantine` moves everything. Promise 3 says one bad file never hides good lines. The index plus checkpoint are intact and could vouch for every line up to the truncation point.
- The same all-or-nothing quarantine happens for a single fault in `index.bin` of a version that has had a successful eviction (the index is then the only copy of the evicted prefix's chain values): about 600 flagged sequences. That one is an inherent limit; say so in the inventory.

### F4 (MEDIUM) A deleted first body chunk is relabelled as a deliberate eviction
- **A user would see:** `head().evictedLines = N`, reads return `'evicted'`, `damagedFromLine = null`. The replicator will believe the lines were "proven held elsewhere" when they were simply destroyed.
- **Repro (RAN, S2):** 30 lines, never evicted, delete `body-0000000000000000.bin`: `lines=30 evicted=6 damaged=null | EEEEEE....`. (`restoreBody` with the real lines then repairs it, so it is recoverable only if a peer has them.) Fuzz: 629 sequences with exactly one fault.
- **Why:** `resolveEvicted` derives the evicted prefix from "which chunk files exist". Deleting the first chunk cannot be told from an eviction.
- **Fix direction:** an eviction without a trusted marker whose chunk is missing should be `damaged`, not `evicted`.

### F5 (MEDIUM-LOW) An older, valid `evicted.json` taken from before a later eviction quarantines a healthy chat
- **Repro (RAN, S1b):** evict through 8, save the marker, evict through 20, put the first marker back: `damaged: a10102-q1`, the version is moved aside and starts empty. Cause: `versionfiles.ts:62` `firstMissing` throws `Damaged` when a trusted marker says bodies exist that don't. Data is kept, availability lost. Same root cause as F1 (the marker has no freshness).

### F6 (MEDIUM-LOW) A deleted tail file is silently replaced by an empty valid one on retry
- **Repro (RAN, `tail.test.ts`):** `setAsideTail` saves 4 lines; delete `tails/<id>.tail`; `tail(id)` returns `null`; retry `setAsideTail` returns `{lines: 0}` (original: 4) and writes a new, valid, EMPTY tail file. `tail(id)` then says "0 lines". The `.done` marker is still there, so the inconsistency (done, but no tail) is detectable and ignored. A flipped or zeroed tail correctly throws `corrupt` and is not overwritten.
- `store.ts:1138` comment "a NEW file (checked absent above)": the check at `:1114` is "does not decode", and a missing file is treated as absent. The fault destroyed the only copy of those lines; the retry then also removes the evidence that anything was there.

### F7 (MEDIUM-LOW) `restoreBody` reports success but keeps a rotted byte in the partly-evicted chunk
- **Repro (RAN, S5):** evict through 5 of 30 lines (chunk 0 survives because the boundary is inside it); flip one byte of line 2 in chunk 0; `restoreBody(all correct lines)` returns `{restoredLines: 5}`, `head.damagedFromLine = null`, but `read(2)` still throws `corrupt`. The correct bytes the peer supplied were verified and then discarded (`store.ts:1393`, "skip when S is 0"). Not a loss and never served wrong; the repair path just does not repair, and a later `append` resend heals it. Fuzz: 9 flagged sequences with no fault outside it.

### F8 (LOW-MEDIUM) A valid index file belonging to another chat truncates the body of this one
- **Repro (RAN, `swap.test.ts` plus fuzz seeds 24254, 28035):** put version B's `index.bin` in version A (a wrong-backup or misplaced file; checksums pass). A has intact bodies and a checkpoint that vouches for 22 lines. Result: `head lines=5 damagedFromLine=0`; A's body is cut to the 1203 bytes the foreign index describes and 8,599 bytes of acknowledged lines are moved to `torn/000002-body` (kept, not served; one line is split across `body-0` and `torn/`). The checkpoint could have rebuilt the right index. Nothing destroyed; real chats served as 5 damaged lines until someone reassembles.

### F9 (LOW) 127- and 128-byte version ids break on file-name length
- `keyOf` allows 1..128 bytes (`store.ts:204`), hex doubles it. **RAN (`odd.test.ts`, `big.test.ts`):** 128 bytes: `registerVersion` throws raw `ENAMETOOLONG` (not a typed error). 127 bytes: registration works, but the first quarantine (`aside/<254 hex>-q1`, 257 characters) throws raw `ENAMETOOLONG` on every call, so the damaged version can never be set aside. Real version ids are probably 32 bytes, so low.

### F10 (LOW, test gaps found by mutation, no live bug shown)
See the mutation table: M07, M25, M29, M31, M35, M37 survive the repo's own tests. Notably `control.ts:159` (a damaged, non-zero control tail is reported, never cut) has no test; breaking it makes the store move a rotted record to `torn/` and stop reporting it.

### Two-fault results (not promised, listed for honesty)
Swapping `meta.json`/`meta.copy` between two versions, then truncating one copy, leaves a version registered under the wrong chat id with valid checksums on both copies. The store then computes a valid-looking head under the wrong seed (my reference chain disagrees). 22 of the 31,000 sequences ended there; every one needed two or more file faults. Deleting `damaged.json` after a quarantine makes the version look healthy and empty (128 sequences, always the second fault).

## What held under attack (RAN)

- **31,000 independent fuzz sequences** (seeds 5001 to 36000; 6 to 27 steps each): random append, resend, gap-park, wrong-overlap append, close and reopen, crash at a random disk operation (torn write as prefix, garbage or zeros, then power loss as truncate or zero of unsynced tails), crash INSIDE recovery (armed during open and reads after a fault, then reopen), full disk (also with a torn write), evict, restore, control append, extras, snapshot, and a fault on a random file of the real folder: flip, truncate, truncate at record size, zero all, zero a range, delete, swap two files, older copy from an earlier snapshot, extend with duplicate bytes. 68,358 single-fault outcomes recorded. Earlier calibration runs of 2,400 and 4,800 sequences found only harness bugs of mine, fixed before the final run.
- **Never served wrong bytes after a single fault**: 0 `WRONG-BYTES` outside two-fault sequences; 0 `foreign-line-served`; 0 untyped errors from open, head, read, append, evict, restore, control or extras in 31,000 sequences (except F9 by separate probe).
- **No acknowledged line lost silently, one fault at a time**, except F1 and F8 (bytes) and F2 (control entries). No file outside `inventory.ts`'s table was ever created (checked after every step).
- **Both checkpoint slots, both meta copies**: any single damaged, zeroed, deleted, truncated or older copy: clean in about 98% of cases; the rest were swaps (two files) or interplay with earlier faults.
- **Crash during repair**: reopening after a crash armed inside recovery was clean every time (no flag outside the categories above).
- **Full disk**: reads kept working in every sequence whose version was healthy; 0 refused reads.
- **Reads with one rotten line**: flips and zero ranges in bodies were reported as exactly the bad line (`damagedFromLine`, `corrupt` on read) with every other line served, 700+ cases.
- **Stale lock and two real processes racing** (`race.mjs`): 8 and 16 child processes opening, appending and closing the same root for 8 seconds, 7 runs, six of them with SIGKILLs of random children and respawns (about 60 processes each, stale-lock takeovers happening). Every acknowledged line was present exactly once at its own position, `verify()` ok, no two writers ever acknowledged the same position (3,400 acks checked). Locked-out openers always got the typed `store-locked`.
- **Large chat**: 60,000 lines in 60 chunks of 256 KiB: write 0.7 s, reopen 76 ms, `verify` 0.34 s; a flipped byte mid-chunk reported only that line after `scrubStep`, and a resend healed it.
- **Real chat files (read-only, counts only)**: 1,360 files, 7.8 GB, 1,487,472 lines copied into a throwaway store with 4 MiB chunks: 0 head differences, 0 verify failures, 0 reported damaged.
- **Odd ids**: chat ids with `../`, NUL, 1,024 characters, emoji, backslashes: fine (they are hashed for the control dir, used only as a seed elsewhere); traversal through `takeoverId`, extra hash and parked name: refused with `bad-argument`. No file landed outside the root.
- **`DESTRUCTIVE-OK` sites** (about 85): read every reason. False ones: `store.ts:373` and `:1330` area (F1: "a proven eviction ... a marker that matches the index"), `store.ts:1138` (F6: "a NEW file (checked absent above)"). The rest held under attack, including all `kept-copy-first` sites (the copies are made and fsynced before the cut; M07 shows the fsync is not tested).

## Mutation check

22 lines in round A plus 16 in round B, chosen by me, applied one at a time to a scratch copy, then the repo's own 273 store tests run. 38 mutants: **27 caught, 11 survived** (2 of the 11 are likely equivalent mutants).

| Mutant | Result |
|---|---|
| M01 no checkpoint slot write before ack | caught (16 tests) |
| M02 body not fsynced before index | caught (4) |
| M03 index not fsynced before checkpoint | caught by ONE test only (fuzz fast slice) |
| M04 evicted hint trusted without index cross-check | caught by one test |
| M05 `evictBody` skips re-hashing the bytes it drops | caught by one test |
| M06 `restoreBody` skips chain check | caught (2) |
| **M07 torn-body copy not fsynced before the cut** | **SURVIVED** |
| M08 healBodies does not keep the bad bytes first | caught (3) |
| M09 overlap chain check skipped | caught (6) |
| M10 lock heartbeat never fails | caught (2) |
| M11 extras served without hash check | caught (2) |
| M12 checkpoint slot CRC ignored | caught (10) |
| M13 side-file CRC ignored | caught (3) |
| M14 index shorter than checkpoint not detected | caught (7) |
| M15 index vs checkpoint disagreement ignored | caught by one test |
| M16 index record CRC ignored | caught (8) |
| M17 control torn tail cut without keeping a copy | caught (2) |
| M18 eviction marker not written | caught (9) |
| M19 verifier result ignored | caught (2) |
| M20 surplus body cut without torn copy | caught (3) |
| M21 append rollback truncates body to 0 | caught (3) |
| M22 FORMAT bad copy overwritten not kept | caught by one test |
| M23 directory not fsynced after rename | caught (5) |
| M24 temp file not fsynced before rename | caught (7) |
| **M25 checkpoint slot not fsynced (the ack itself)** | **SURVIVED** |
| M26 `.bad-N` may overwrite an existing kept file | survived (probably equivalent: names are max+1) |
| M27 torn name may reuse an existing name | survived (probably equivalent, same reason) |
| **M28 second checkpoint slot no longer restored at load** | **SURVIVED** |
| **M29 control: any bad tail cut, not only all-zero** | **SURVIVED** |
| M30 putExtra does not check bytes against hash | caught (2) |
| **M31 unreadable fresh lock taken at once** | **SURVIVED** |
| **M32 second-writer guard on the body size removed** | **SURVIVED** |
| **M33 second-writer guard on the index size removed** | **SURVIVED** |
| M34 `evictBody` unlinks every chunk | caught (45) |
| **M35 `setAsideTail` does not read the tail back before cutting** | **SURVIVED** |
| M36 index tail cut without keeping a copy | caught (3) |
| **M37 deferred index-tail cut without keeping a copy** | **SURVIVED** |
| M38 checkpoint lowered without keeping the higher one | caught by one test |

M25 and M07 are the important ones: the fault shim only models power loss by cutting files back to their last-synced length, so an in-place overwrite that was not synced (the checkpoint slot, which IS the acknowledgement) cannot be seen to revert. The repo cannot tell whether the acknowledgement was made durable.

## Were the tests weakened to pass? (compared with `0ec2ebdf5`)

Not in the sense of loosened assertions. Of the lines changed in `crash.test.ts`, `hardening.test.ts` and `second-round.test.ts`, almost all are stronger: heads now stay at the full count with `damagedFromLine` set, every other line is asserted served, and kept-bytes assertions moved to "still in the body". One assertion was dropped: the check that the rotted byte is also present in a `torn/` copy (the design changed, so the byte is simply never moved). The checkpoint test switched from "every 10 lines" to "every append", consistent with the new design.

The new `fuzz.test.ts` has **two blind spots by construction**, and they are what hid F1 and F2:
1. Its fault set is flip, overwrite a byte, truncate, zero-length, delete. There is **no "older copy of the same file"** and no swap, no zeroed range, no truncation at a record boundary. Stale-but-valid is exactly what the checksums cannot see, and the fuzz never plays it.
2. `SINGLE_COPY` includes `control/` and `extras/` (`fuzz.test.ts:49`) and `controlHit` / `extrasHit` (`:153`, `:259`) turn a silent loss in those files into "allowed". The promise "a deleted file ... is reported" is therefore untested for the control log and extras.
It also uses one version per sequence (so nothing cross-version), and its crash faults only cover the append phase, not a crash inside recovery.

## What I could not test

- Real power loss with reordered writes across files, or file systems that lie about fsync (the shim and mine model neither).
- Windows and Android (fsync of directories, `O_NOFOLLOW`, hard-link lock fallback).
- A real replicator behind `proofVerifier`. F1 assumes the verifier accepts proofs; with the default (refuse everything) eviction cannot happen at all.
- Two faults at once (explicitly not promised); I only reported what they do.
- The adapter was read for destructive operations (none: it only opens runtime files read-only) but not fuzzed.

## Reproduction notes

- Fuzz: `R4_FROM=<a> R4_TO=<b> npx vitest run -c vitest.r4.config.ts r4/fuzz.test.ts` from `.../store-review-4/desktop` (failing sequences are copied to `R4_KEEP`; `R4_SNAP=<step>` snapshots the folder at that step). Sharding script: `r4/shard.sh`.
- Minimal repros are `r4/scen.test.ts` (S1, S1b, S2, S2b, S3, S5), `r4/tail.test.ts`, `r4/swap.test.ts`, `r4/odd.test.ts`, `r4/big.test.ts`.
- Seeds named above (final run range 5001 to 36000 unless stated): F1 8459, 31988, 21273, 8961 (1055 in calibration), F2 10277/10288/10317, F4 10226/10276, F8 24254/28035.
