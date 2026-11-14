# Mesh chat store: third-round data-loss review

Subject: `youcoded/desktop/src/main/mesh/store/` at `0ec2ebdf5` (round-2 fixes; previous `4285811b2`). Review only: nothing in the repo was edited or committed. All experiments ran on a scratch copy (`git archive 0ec2ebdf5`) under the session scratchpad; no real user data, no `/opt/YouCoded`, no network. Synthetic chat lines only.

## Verdict

**SAFE TO WIRE A CALLER: yes-with-fixes.**

Fix F1 first (one flipped bit in one small unchecked file permanently deletes acknowledged lines). Fix F2 before real users depend on a single device holding the only copy. The rest can follow the caller.

Prior findings regressed: **none**. The 192 existing tests pass, and a 24,000-sequence fuzz found no reappearance of any round-1 or round-2 loss.

## What was run

| Check | Result |
|---|---|
| Suite from the commit's content (scratch copy, own minimal vitest config because the repo's `--project unit` config pulls in the whole app) | `Test Files 8 passed (8)`, `Tests 192 passed (192)`, 15.5 s |
| Fuzz (append, park, setAsideTail, evict, restore, control append, putExtra, scrub, crash at a random disk operation with tear / power loss / unsynced-unlink models, single-bit rot in a random file, reopen; invariant checked after every reopen) | **24,000 sequences** (seeds 1000 to 24999; 18,000 with evict/restore, 6,000 without), 4 workers. 50,271 injected crashes, 46,056 bit flips, 1,090 quarantines, 40,098 corrupt reads. Plus about 700 development seeds and 2,000 sequences with rot aimed at the three unchecked config files |
| Fuzz violations | 90 sequences flagged. After triage: 18 seeds are finding F3, 4 seeds are finding F4, 68 were harness artefacts (an evicted prefix legitimately has no local bytes) and are clean after the harness fix and re-run. **No sequence lost an acknowledged line while the rot was in an index, body, checkpoint, summary, scrub, control log or extras file.** F1 was found by reading, then demonstrated; the fuzz keeps those three config files out of its rot pool by default |
| Fuzz seeds with a real violation | F3: 1408, 2127, 2749, 2915, 3397, 3704, 4457, 5814, 7077, 10269, 11063, 13832, 15680, 15746, 17362, 18179, 19890, 20933. F4: 3791, 6895, 13684, 17011. Wrong bytes served as verified (F3 consequence): 2127, 2749, 3704, 5814, 13832, 15680, 15746, 18179, 20933 |
| Lock, two real processes, 300 trials | 150 trials of "both callers got `store-locked-stale?` and both retry with the same `breakLockToken`" plus 150 trials with a stale `LOCK` and a stale `LOCK.takeover` left by a crash: exactly one process won every time, never two |

## Findings

Severity: critical = silent loss, silent divergence, or wrong bytes served as verified.

### F1. CRITICAL. One flipped bit in `evicted.json` permanently deletes acknowledged, un-evicted body chunks. Demonstrated.

`evicted.json` is `{"lines":20,"bytes":3370,...}`: plain JSON, no checksum, and the numbers are trusted blindly. On every open, `loadOnce` finishes "an interrupted eviction" by deleting every body chunk whose end is at or below `bytes` (`store.ts` 391-397). Nothing compares `bytes` with the index record of line `lines-1`.

Demonstration (`demo1`): 60 lines in 4 chunks, evict the first 20, flip bit 2 of the first digit of `bytes` (3370 becomes 7370), reopen. Two chunks are unlinked; `read` of line 30 then throws `corrupt: no body chunk covers offset`; **20 un-evicted, acknowledged lines have no copy anywhere under the root**. A flip in the other direction (a smaller `bytes`) makes `checkChunks` call the first chunk missing, which quarantines the whole healthy version (reasoned from `recovery.ts` 65, not demonstrated). Present in `4285811b2` too (review 2 judged only "revert on power loss" for this file, not a flip).

Fix: put a CRC in `evicted.json` and, independently, never unlink a chunk unless the index record at `lines-1` says its end is at or below `bytes` (derive `bytes` from the index; treat the file's `bytes` as a hint). On any mismatch, serve everything and refuse to unlink.

### F2. HIGH (loud, not silent; N7 deviation assessed). After a split, intact and verifiable lines are set aside with no way back except a peer.

When the index header is bad and a body byte is rotted at line k, only lines 0..k-1 are served (`recovery.ts` 322, `keep = lastAnchored + 1`). Demonstrated (`demo2`, 100 lines, rot at line 10): head = 10, `damagedFromLine` = 10, the 90 later lines are copied to `torn/000001-body` and the old index to `replaced-index/index-0001.bin`. **All 89 lines after the rotted one verify against the kept old index** (the chain continues through the old records), so they are provably good bytes. Nothing in the store reads `torn/` or `replaced-index/` back; the only path is a hand copy, or a peer resending lines 10 onwards. Where this device is the only mesh holder, the user sees a chat cut off at line 10 although 89 lines of it are fine. (The runtime's own transcript file is a second copy, but only if the caller re-feeds the store from `head.lines`; the adapter does not talk to the store today, so nothing does this yet.)

Contrast: a healthy index with the same rotted byte already serves lines k+1 onward correctly (the matrix below shows `head=100 flaggedFrom=50 readCorrupt=1`). The split path is strictly worse than leaving valid old records in place.

Fix: when a damaged header is the only index damage, keep the old valid records and only mark the mismatching lines as bad (the same `badLine` mechanism the healthy path uses). Do not truncate to the first mismatch. At minimum add a `restoreSetAside()` that re-appends the verified suffix.

Set-aside durability (question b): the suffix cannot be overwritten or pruned. `torn/` names are `max+1` and never deleted; a second fault in the live version does not touch `torn/`; replaced indexes are numbered by directory count. A second rot inside the torn copy is a second fault on a single copy. The only way a set-aside copy becomes unusable is F7 (cap).

### F3. MEDIUM. A crash that tears an index write, plus rot inside that batch, is accepted as verified. Demonstrated by fuzz (18 seeds).

After a crash during an index write the next open "adopts" the body lines past the last whole record (`adoptSurplus`): their records are re-derived from the bytes with nothing to compare against (the checkpoint is written after the index, so it never covers an in-flight batch). If a byte of that batch is rotted, the rotted byte is hashed into the chain. Result: `head.hash` differs from every peer, `damagedFromLine` is null, the line is served as verified (`WRONG-BYTES-SERVED`), and a peer's correct resend of that line answers `not-a-prefix` forever. In all 18 seeds the divergent line lies inside the last crashed batch and `torn/` holds an `*-index-tail` file. Needs two faults (crash and rot in the same batch). The window is one append call (up to 512 MiB), not 31 lines.

Fix: report adopted lines (`head.adoptedFromLine`) so the caller can check them against a peer before relying on them, and make the caller's reaction to `not-a-prefix` at an adopted line a `setAsideTail` cut. Cheaper but weaker: do not adopt a batch the checkpoint does not cover; set it aside as never acknowledged (it was never acknowledged), at the cost of the rot-damaged-last-record case C1 wanted adoption for.

### F4. LOW-MEDIUM. A flipped bit in `partial.json` silently drops the "lines were set aside, heal pending" flag. Demonstrated by fuzz (4 seeds).

The version then looks healthy, just shorter; `damagedFromLine` is null. The code comment says this is accepted ("only loses the damaged flag"), but the caller can no longer tell a short chat from a damaged one. Fix: checksum it; an unreadable marker should report damaged-from-head rather than nothing.

### F5. MEDIUM-LOW. `meta.json` and `FORMAT` have no checksum. Demonstrated.

`meta.json`: flip one letter of `chatId` (still valid JSON, `demo2` M1). The chain seeds change, so every line reads `corrupt: body bytes do not match the chain` and `verify` fails at line 0. Add any index fault and the rebuild splits at line 0: head 0, all 30 lines in `torn/`. A flip in `FORMAT` makes the whole store refuse to open (`corrupt: unknown store format`). In 2,000 sequences with rot aimed at the three config files, 1,615 ended unopenable: loud, and data stays on disk, but there is no recovery tool. Fix: CRC, plus a copy of the chat id inside the index header so `meta.json` can be cross-checked.

### F6. LOW-MEDIUM. Control log: a harmless garbage or zero tail is permanent "damage". Demonstrated.

A zero-extended tail (file size persisted, data not, common after a power cut on ext4) or any tail that is not a recognisable truncated header is not "torn": it is skipped, reported by `controlDamage` for ever (offset 288, length 4096, "bad record marker" in `demo2`), never cleared, and the only remedy offered, `quarantineControl`, moves the whole log aside. Entries before and after are served, new appends work. A record whose payload CRC is bad but whose length ends exactly at end of file is also classed as damage, not torn. Mid-log damage, torn final record, all-zero record (magic mismatch), zero length (decodes to null, skipped by its own header length), huge length (rejected above 4 MiB + 64 KiB, then resync) and pruning (none, cap 1,024 torn files) all behave as documented. Residual (reasoned, not exploited): after header damage the resync trusts any `YCL1` that parses as a valid record, including bytes inside another record's payload; a peer-supplied body could embed one, but it must still pass the signature check the caller owns. Fix: treat a trailing region with no valid record after it as torn (cut and keep), as the old code did.

### F7. LOW. Caps that wedge, none that lose acknowledged data.

- `torn/` at 4,096 files (`recovery.ts` 155): the version becomes unreadable, reads included (`unreadable: limit`, demonstrated). Nothing lost, but a healthy version is out of service until someone deletes files by hand. The cap is not tested (revert R08).
- `maxRejectedBytes`: a not-a-prefix park that does not fit stays in `parked/`, is retried on every append, counts toward the parked cap, and `releaseParked` then throws `limit` (demonstrated). Parks past the cap are refused with a typed error; nothing lost, the refused lines are still on the peer.
- `maxExtrasBytes`, `disk-full`: refuse with typed errors; acknowledged data untouched. Disk-full has one gap: the claim "reads never write anything that can fail" is false for a torn index tail (`keepBytes` creates `torn/`) and for a control log with a torn tail; both reads throw `disk-full` while the disk is full (demonstrated) and recover when space returns.

### F8. LOW. `close()` that throws leaves the lock held.

`close()` runs `saveCheckpoint` before releasing the lock and rethrows anything that is not disk-full. A failure there skips `this.closed = true` and `lock.release()`; the next open in the same process answers `store-locked` until restart. Observed under injected errors; real-world trigger is an I/O error at shutdown. Fix: release in a `finally`.

### F9. LOW (stated bound). The "31 lines past the checkpoint" bound is for a healthy disk only.

Checkpoint writes after an append are best effort and a full disk is swallowed, so with the disk full the uncheckpointed window grows without limit. Also, index lost + body rot beyond the newest checkpoint accepts the rotted line (matrix: `idx=deleted bodyrot=line98 ckpt=ok` serves one wrong line, head not a true prefix, nothing flagged).

### F10. Informational. A single rotted record of an evicted line quarantines the whole version.

Evicted lines' records exist only in the index (no bodies to re-derive from), so one flipped bit there ends in `Damaged` and the version, including its un-evicted bodies, is moved to `aside/` intact (1,090 such quarantines in the fuzz, bytes always kept). By design the evicted prefix lives on peers; flagging it so the caller knows a recopy is needed.

### Not demonstrated
Stale takeover file plus two openers could in theory both unlink and recreate the takeover file; 150 trials never produced two holders and `assertHeld` would refuse one of them on its next write, so left as unverified-low. The `again && !same` check in `lock.ts` is untested (revert R17).

## (a) Checkpoint fault matrix (`matrix.test.ts`, 100 lines appended one per call, kill -9 copy so the newest checkpoint is at line 96; 60 combinations)

| Index fault | Body rot | Checkpoint ok | rotted / deleted | stale (line 64) |
|---|---|---|---|---|
| none | none, 50, 98 | served in full, rot flagged by line, no wrong bytes | same | same |
| index deleted | none | head 100, true prefix | **quarantined** (nothing vouches; bytes kept in `aside/`) | head 100 (stale checkpoint still vouches) |
| index deleted | line 50 | quarantined intact | quarantined intact | quarantined intact |
| index deleted | line 98 (past newest checkpoint) | **head 100, one wrong line served as verified, nothing flagged** | quarantined | wrong line served |
| header bad | none / 50 / 98 | all lines kept / split at 50 / split at 98 (suffix in `torn/`) | same | same |
| cut mid-record at record 40 | none | head 100, true prefix | head 100 | head 100 |
| cut mid-record | line 50 | quarantined intact | **wrong line served, unflagged** | quarantined |
| cut mid-record | line 98 | **wrong line served, unflagged** | wrong line served | wrong line served |
| one record flipped mid-index | any | served, split at rot line | same | same |

Answers: no acknowledged line is ever dropped (kept, set aside or quarantined, bytes present). A wrong byte is served as verified only when an index fault (deleted, or cut) combines with a body rot that no surviving record or checkpoint covers (lines past the newest checkpoint, or the checkpoint also gone): the documented residue, plus F3. A healthy version is never quarantined by a checkpoint fault alone (rotted, deleted or stale checkpoint with a good index: served in full). Crash between body, index and checkpoint writes: covered by the existing kill sweeps and 50,271 fuzz crashes; the only failure class is F3.

## (d) Revert test: do the tests notice when each fix is removed?

Each fix was reverted alone in a scratch copy and the full store suite run (192 tests). "Caught" = at least one test fails.

| Rev | Fix reverted | Result |
|---|---|---|
| R01 | checkpoint written every N appends | caught (1: the checkpoint-kept-level test) |
| R02 | checkpoint written at close | caught (1) |
| R03 | checkpoint lowered before a cut (`cutTo`) | caught (6) |
| R04 | checkpoint lowered by a split rebuild | caught (4) |
| R05 | rebuild limit counts the checkpoint's lines | caught (2) |
| R06 | index shorter than checkpoint forces a rebuild | caught (2) |
| R07 | index disagreeing with the checkpoint forces a rebuild | caught (1) |
| R08 | **4,096-file cap on `torn/` (refusal)** | **NOT caught (192 pass)** |
| R09 | control record header checksum | caught (1) |
| R10 | control resync to the next valid record | caught (1) |
| R11 | byte cap on `rejected/` | caught (1) |
| R12 | `putExtra` replaces a rotted "present" file | caught (1) |
| R13 | lock `assertHeld` before each write | caught (2) |
| R14 | file handles closed in rebuild `finally` | caught (5) |
| R15 | scrub pass wrap-around | caught (1) |
| R16 | "nothing vouches for the body" refusal | caught (1) |
| R17 | **lock "changed hands" check after takeover** | **NOT caught** |
| R18 | takeover "cut done" marker | caught (1) |
| R19 | split keeps only the verified prefix | caught (1) |
| R20 | rebuild rejects checkpoint ahead of the body | **NOT caught** (equivalent: the next line, `recAt(ckpt.count-1)` null, throws the same `Damaged`; redundant guard) |
| R21 | checkpoint file CRC | caught (1) |
| R22 | **load tolerates a full disk while trimming surplus (`trimDeferred`)** | **NOT caught** |
| R23 | `breakLockToken` passed through `open` | caught (2) |
| R24 | control torn-file cap | caught (1) |
| R25 | classifier-stale chain recompute | caught (2) |
| R26 | tail-file header checksum | caught (1) |
| R27 | `breakLockToken` skips the liveness check | caught (2) |
| R28 | `maxExtrasBytes` refusal | caught (1) |
| R30 | rollback of a failed append | caught (1) |
| R35 | `partial.json` written on split | caught (4) |
| R37 | unacknowledged surplus kept in `torn/` | caught (3) |

30 fixes reverted; 3 not caught by any test (R08, R17, R22); R20 is an equivalent mutant. The honest gaps are the torn cap, the lock hand-over re-check and the full-disk load tolerance. Also: no test covers any flip in `evicted.json`, `meta.json`, `partial.json` or `FORMAT` (F1, F4, F5).

## (c)/(f) short answers

- Control framing: mid-log damage skipped and later entries served; torn final record cut and kept; zero record, zero length and huge length handled; torn files never pruned; see F6 for the permanent-damage side effect.
- Lock: following the documented recommendation, two callers cannot both break (150 + 150 real-process trials; takeover file serialises, loser sees `store-locked`). Residual: R17 untested; stale takeover file plus two openers is a theoretical double unlink (not reproduced).

## Unverified

- Other operating systems (macOS, Windows, Android): lock liveness, directory fsync, hard-link fallback.
- Real power loss and real storage that reorders or lies about fsync (the shim models cut-to-last-sync, unsynced renames, creates and unlinks only; not write reordering across files).
- Tests on a real disk (`MESH_STORE_TMPDIR`): all runs here were on tmpfs.
- Bit flips in other directions of F1 (smaller `bytes`) end-to-end; the quarantine is read from the code, not run.
- Multi-version stores and chats above a few hundred lines (fuzz chats are at most 260 lines).

Side effect to know about: vitest in the scratch copy wrote cache files into the worktree's gitignored `desktop/node_modules/.vite-temp` through a symlink. No tracked file changed.

Scratch material (not in the repo): `/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-3/` (`fuzz/fuzz.test.ts`, `demo/*.test.ts`, `rev/reverts.mjs`, `lockdemo/`).
