Job A verdict: SAFE WITH CONDITIONS (to build the replicator on): every single fault and every plain crash I tried is loud or repaired, but two or three older files put back after a takeover are still served quietly in a reachable corner (F1), and the replicator must obey the conditions at the end.
Job B recommendation: (b) restructure to a new version folder per takeover (and per quarantine) BEFORE building the replicator. Confidence about 75 percent that this is the cheaper path; what would change my mind is listed in the design section.

---
status: active
date: 2026-11-24
topic: Mesh chat store, review 8 of "round 7" (49f21d81e..ede86e58c) plus a design judgement
---

# Mesh store review 8

Reviewed head `ede86e58c` (store dir `desktop/src/main/mesh/store/`). Read-only on the repo. Everything I ran lives in scratch and is copied (harness only) to `docs/active/prototypes/2026-11-14-mesh-phase0/store-review-8/`. "RAN" means I executed it and saw the output; "READ" means inferred from code only.

## What I ran versus read

RAN:
- Review 7's probes 1 to 4 again on both trees (49f21d81e as "old", ede86e58c as "new").
- My own probes 5 to 10 on real files (list below), each printing head, flags and which served lines are wrong.
- My own fuzz (`fuzz7.test.ts`, virtual disk with power loss and reordering): 30,000 mixed-fault seeds, 10,000 seeds of pair/rollback faults, 6,000 crash-only seeds with crashes inside appends AND takeovers, 2,840 takeover-crash-only, 8,000 mixed seeds for the per-fault loudness table.
- `b2.test.ts`: every disk operation of `setAsideTail` as a crash point, times 3 tear modes, 2 settle modes, 10 tail/marker fault kinds, with and without a prior takeover and parks: 72,000 scenarios, 0 bad.
- The IN-REPO fuzz (`fuzz.test.ts`, `MESH_STORE_FUZZ` long run) from a scratch copy of the head tree: seeds 300000-302499 and 500000-502499 clean; 400000-402499 one failing seed (400086, a real hole, F1); plus three more 6,000-seed ranges (see "In-repo fuzz totals").
- Not run: the repo's 397-test suite (the author's number; I did not need it), Android, anything on `/opt/YouCoded` or `~/.claude`.

READ only: the claims about what the author's `fuzz.test.ts` oracle excuses (judged from the code, section 4), the design alternative (section Job B).

## Findings, most severe first

### F1 (MEDIUM, quiet wrong lines; reachable by a restore of backup files; existed before, NOT closed by round 7)
Older index + checkpoint + bodies from before a takeover put back, when the takeover's tail does not reach the old head, are served as the chat with no flag.
- User sees: after a backup restore (index, checkpoint, body files copied back; `tails/` and the high-water record left alone), the chat shows lines 23 to 34 from the replaced history as if they were current. `head()` says `damagedFromLine: null`, `rolledBack: null`, `lostTakeovers: 0`. Wrong lines go to peers.
- Reproduction (RAN, `probe8.test.ts`, real files): append 29 lines, snapshot, append 6 more (35), snapshot; put the whole version folder back to the 29-line state (loud: `rolledBack {from 29, had 35}`); `setAsideTail(id, v, 23)` and append 4 new lines; then copy `index.bin`, `checkpoint.bin` and `body-*` from the 35-line snapshot back. Result on head: `head=35, damaged=null, rolledBack=null, lost=0, 12 wrong lines at 23..34`. Without the checkpoint in the restored set the same state is quarantined (loud), so the hole is exactly the "all three older" case.
- Same shape found by the in-repo fuzz: seed 400086 (`MESH_STORE_FUZZ_SEEDS=400086` fails in 114 ms: WRONG-BYTES-SERVED lines 23..34, head 62, faults "pair index+body" twice around a takeover and an evict). Reproduced the same lines with my own fuzz7 (rbOverlay and olderPair classes).
- Why: `store.ts:361-363`. When the checkpoint's history count is below the folder's (`ck.hist < histNow`) the code runs `cutAwayBranchHit` and, on "no hit", sets `blessed = true`, i.e. "proven not on a replaced history". But the tail only holds lines from the cut to the head AT THE TIME (here 23..28). A head the version once had and lost earlier (here 35, lost to the first rollback) is on no tail, so "no hit" proves nothing. The sound rule is already in the code: `sharedPrefixBound` (`tails.ts:67`) says an older-count checkpoint can only vouch for lines up to the smallest cut. A checkpoint with `hist < histNow` and `count > bound` should be refused, hit or no hit.
- Pre-existing? The old tree serves the same 12 wrong lines (probe8 "old"). Round 7 closed the cases where the head lies ON a tail and left this one. The inventory header (`inventory.ts:49`) and the store comment ("PROVEN: a served head is never a point of a replaced history after an override") state more than is true here.
- Related, same cause, no fault needed beyond a file copy: `rbOverlay` (older files copied back OVER the folder, newer chunk files left in place because chunk files are named by byte offset and the old and new names interleave). Real files, dump of fuzz seed 20268: head 55, `damagedFromLine 40`, lines 26..31 are the replaced history's, unflagged (the flag starts at 40 where a newer chunk breaks). Old and new trees behave the same (RAN, `replay.test.ts`). The proof at `store.ts:359` is skipped there because the physical body is shorter than the index claims (`layout.phys >= last.offset + last.len`).
- Fix direction: refuse (quarantine) a checkpoint/index whose history count is below the folder's whenever its count exceeds `sharedPrefixBound`; do not use "no tail hit" as a blessing. This is a two-line change, but see Job B for why I would not keep adding such lines.

### F2 (MEDIUM-LOW, permanent lock-out after one fault; new in round 7)
Losing `tails/` (one fault) makes every future takeover on that version fail with `corrupt` forever, even after `setAsideDamaged` and a full recopy.
- User sees: when a device later has to take over this chat, `setAsideTail` throws `corrupt`; the chat can never change host again on this version. There is no way to clear it, because the count in the high-water record never lowers and `tails/` stays outside the quarantine.
- Reproduction (RAN, `probe9.test.ts`): takeover, close, delete `versions/<id>/tails/`, reopen: `head.lostTakeovers = 1`. New takeover at 12: `corrupt`. `setAsideDamaged`, recopy 12 lines: `lostTakeovers` still 1; takeover at 6: `corrupt`.
- Why: `tails.ts:194` refuses while `lostTakeovers(st) > 0`; `highwater.ts:118` never lowers the count; `lowerHw` carries it.
- Also: `tail(<lost id>)` returns `null` (not an error); only `head().lostTakeovers` says the loss (the oracle accepts this).
- Fix direction: a documented way to acknowledge a loss (the quarantine of a version should retire the version id and its count with it), or at least a typed error that tells the replicator to start a new version.

### F3 (MEDIUM for the replicator, by design: the loud signal is not on the read path)
With `lostTakeovers > 0` the store serves lines of a replaced history without any error from `read()`.
- RAN (`probe10`): all three files older and `tails/` gone, high-water record intact: `head=20, damagedFrom=null, lost=1, 10 wrong lines served`. The only signal is `head().lostTakeovers`. A replicator that reads lines to send to peers without first reading `head()` will spread wrong lines.
- The in-repo oracle excuses this on purpose (`wrong-bytes-with-a-report`, `fuzz.test.ts:~232`), and `lostReported` is sticky.
- Condition: the replicator must treat `lostTakeovers > 0` like `damagedFromLine = 0`: serve nothing from that version.

### F4 (LOW, quarantine resets the high-water head to 0 on purpose: how reachable)
After any quarantine the high-water head is 0 until peers refill the version. Every older backup is therefore "ahead of the record", so a restore of the pre-quarantine files is invisible during that period. That is ONE fault (a file restore) and the window can be long. It is a larger exposure than the ordinary "rollback to a head the record never saw" limit (255 lines). Not demonstrated end to end by me (READ); the mechanism is `highwater.ts:127 resetHw`. The reset is only there to avoid reporting the empty head as a rollback; the ladder-and-chain-match rule would already prevent a false report if the reset were replaced by a "version retired" mark.

### F5 (INFO) Fuzz gaps, not store defects
- In-repo seed 701072 (range 700000-706000): faults "rollback of the folder" then "older highwater/<key>.hw": the store behaves as documented (whole-root rollback undetectable) but the oracle did not excuse it (`fuzz.test.ts` has `hwFaulted` for hw faults but the rollback-then-older-hw order is missed). The author's two newest excuses were added without a re-run; my slice suggests a third gap, not a store loss.
- The generator produces conflicting parks (parks whose lines differ from what is later appended). My crash-only run saw one `not-a-prefix` after a crash in an append that is that conflict, not a store fault (seed 170).

## Step results

### 1. Review 7's probes and variants (RAN)
| probe | result at head |
|---|---|
| probe1 idx only / ck only / body only | repaired or flagged, 0 wrong lines (as round 6) |
| probe1 idx+body, ck+body, idx+ck+body | now quarantine (`damaged`, typed). Round 6 served 10 wrong lines. F1 of review 7 is closed for these |
| probe1 idx+ck | head 20, `damagedFrom 10`, reads past 10 throw `corrupt`: loud |
| probe3 (F2: park across quarantine + recopy) | `park=parked recopy=ok head=12 wrongLines=0` for both setAsideDamaged alone and after a takeover. Old tree: 2 wrong lines. Closed |
| probe4 (whole STORE ROOT put back) | unchanged, documented limit; head 14 with 7 wrong lines vs the resent history, no report |
| probe10 (F1 variants, the 3 pair/triple combos x tails gone x hw gone) | with `tails/` present and hw present: all quarantine or flag. `tails/` gone, hw present: `lost=1` flagged but wrong lines served (F3). `tails/` and hw gone: idx+ck+body and ck+body serve 10 wrong lines, quiet (the documented limit) |
| probe5 (whole version folder back to a snapshot between takeovers, hw intact) | `lostTakeovers` 1 and 2: reported |

### 2. Attacks on the new mechanisms
- Crash between `.begun` and the count write, count write and cut, cut and `.done`: `b2` enumerates every disk operation: 72,000 scenarios, 0 bad. READ: `.begun` is durable before the count write (atomic write with fsync of file and directory), so a power cut cannot leave the count ahead of the marker (no false `lostTakeovers`).
- History count in the checkpoint made stale by ONE fault: deleting a `.begun` lowers the folder's count below the checkpoint's; the version stays served (fuzz fault `delBegun`: 377 of 377 clean), the epoch changes in the safe direction. An older checkpoint is the only way to make it lag, and that is F1's territory.
- Takeover count in the high-water record made wrong by one fault: deleting/zeroing the record only under-reports; it is written before the cut, never lowered, carried through `lowerHw`. READ and RAN (probe9). The cost is F2.
- Quarantine resetting the high-water head: F4.
- Pre-quarantine files reappearing: see F4 (one fault, window until refill).

### 3. Loudness cost of the new quarantine paths (RAN)
- No file fault, crashes only (unsynced data lost and reordered, tear modes none/prefix/garbage, crashes inside appends, takeovers, scrub, close and reopen): 6,000 seeds (3,810 crashes in appends, 5,696 crash events) plus 2,840 takeover-crash seeds: 0 quarantines, 0 flags, 0 typed errors. No false alarm. (The one sequence that looked like an alarm, seed 170, is a harness park conflict.)
- Single faults that DO now cost a version (loud, but versions): per 8,000 mixed seeds, share of runs ending flagged or refused: `olderCk` 37 percent (185 of 504), `olderBody` 73 percent, `olderPair idx+body` 100 percent, `olderPair ck+body` 98 percent, `olderTail`/`delTail` 100 percent refused as typed errors, `olderIdx` 25 percent flagged, `rbOverlay` 84 percent. `olderCk` and `olderIdx` are repaired in the rest. The author's own named cost: a single older checkpoint after an eviction and a takeover quarantines the whole version (round 6 behaviour, `fuzz.test.ts` `olderCkptAfterEvictAndTakeover`).

### 4. Oracle excuses (READ `fuzz.test.ts`), one by one
1. `stale-history-head-reported`: narrow, checks its cause (older index, version emptied after a divergent takeover, flag at or before the first divergence). Honest.
2. `pair-head-flagged` (`pairCause = pairInjected && damagedFromLine !== null`): wide at the head-hash check: ANY flag value excuses a wrong head; only the strict per-line read oracle then protects. Acceptable only because reads are strict, which is how seed 400086 was caught.
3. `head-of-another-history-lost-takeover-reported` and `wrong-bytes-with-a-report` (`reportedLostTakeover`): the widest. Once `lostTakeovers > 0` (and `lostReported` is sticky), every wrong line anywhere is excused. It is the F3 design choice written into the test. It could hide a loss that is unrelated to the lost takeover that triggered it.
4. `undecidableIdentical` / `sameRewriteTakeover`: narrow, checks the marker text in `marks.bin`. Honest.
5. `olderCkptAfterEvictAndTakeover`: narrow and named, but it excuses a real cost (one older checkpoint kills the version), documented as "unchanged from round 6".
6. `rollback-then-index-fault-after-eviction` (the newest): two faults, documented limit 2. Honest, but added without a re-run.
7. `faultOnIndexAfterEviction`, `lossy`, `rotted`: general "a fault destroyed the only copy" flags; they are set by any matching fault and are not cleared until a clean check. Wide, inherited.
8. `destroyed-after-setaside`, `evict-exempt`, `absent-but-kept`: inherited.
9. `hwFaulted` / `rollbackActive`: expire as designed; the rollback-then-older-hw order is missed (F5).
10. `takeover-refused-*` (`corrupt` ends a takeover unanswered): consistent with F2.
None of the ten is wide enough to hide a quiet loss by itself; number 3 and 7 together can hide a lot after a first loss in the same sequence. The oracle's per-line read check does not consider `damagedFromLine`, which is stricter than the store's own promise: good.

### 5. The dead evict/restore branch (READ git history)
`fuzz.test.ts` had the line `} else if (op < 0.78) {          } else if (op < 0.78) {` from round 6 commit `6b0ab96f7` until round 7 `a629f8dc0` (the first `else if` was an empty block), so for round 6 evict and restore never ran in the in-repo fuzz. Any "N seeds clean" claim about the round-6 tree from the in-repo fuzz, and the 100,000-seed claim if it used the in-repo fuzz, therefore did not cover: evictions, restores, an older checkpoint after an eviction (the excuse of item 5 is the thing it later found), eviction with takeovers, and any fault dealt after those. Rounds 4 and 5 ran it live (the commit before `6b0ab96f7`). Reviewers 6 and 7 used their own fuzzes, which is why they were not affected.

### In-repo fuzz totals (RAN, scratch copy of head)
16,208 seeds in six ranges (300000-302499, 400000-402499, 500000-502499 complete; 600000-, 700000-, 800000- stopped by me at about 2,900 each, 8,708 seeds), fast-slice settings, `BIG` off. Two failing seeds: 400086 (a real hole: F1) and 701072 (documented limit, oracle gap: F5). So about 1 real violation per 16,000 seeds at head, against the author's 31,200 clean. That is consistent with a tail of rare multi-fault cases, not with a clean oracle. The in-repo fuzz at round 6 did not exercise eviction at all (step 5).

## Design analysis (Job B)

### 1. Converging or accreting? Accreting (evidence)
- Size of the area: lines in the non-test source that mention takeover, epoch, history count, cut-away proof, rejected parks, `lostTakeovers`, `tailsShown`, `blessed`: 75 at `22b666f71` (round 5/6 boundary), 116 at `49f21d81e` (end of round 6), 258 at `ede86e58c` (end of round 7). The area grew 3.4 times in two rounds; the non-test diff was +529 lines in round 6 and +343 in round 7 of a 5,300-line module. The rest of the store (envelope rule, checkpoint, index) stopped moving: rounds 4 and 5 found 10 and 6 findings in many different files, and they converged to zero because one rule (the envelope: every file states what it is) closed the class.
- Findings by round in this area: round 6: B1 (park drained onto the wrong history), B2 (tail lost silently); round 7: F1 (two older files), F2 (park across quarantine), F3 (tail and markers lost), F4, F5; round 8 (mine): F1 (three older files, tail does not reach), F2 (lock-out), F3 (read path), F4. Each round's findings need more simultaneous faults (round 6: one crash; round 7: two older files; round 8: a rollback, a takeover and a restore), so severity IS falling. But the number of findings per round is not falling, and every one is a gap at the edge of the previous round's proof object: epoch (round 6) leaves quarantine (round 7); the tail-chain proof (round 7) leaves heads the tail never held (round 8); the hw takeover count (round 7) leaves a lock-out (round 8).
- The mechanisms do not compose into one rule. There are now FOUR independent identities for "which history is this file from": the epoch from `.begun` names plus aside folder names (parks), the history count (checkpoint only, not the index, not the bodies), the cut-away tail chain proof (recovery and load paths, with different gates: `overrode`, `ambiguous && ckpt`, `count > ck.count && slotsOk === 2`, `ck.hist < histNow`, `layout.phys >= ...`), and the high-water takeover count. Each has its own gate where it applies; F1 and the rbOverlay finding are both "the gate did not open".
- The fuzz needs ten named excuses and only deals pair faults "where their promise exists". The place the generator avoids (a second pair fault after an earlier resolved one) is where seed 400086 lives.
Verdict: accreting. Each fix is correct and narrow, the harm is that the cost of the next gap stays about the same while the code under proof grows.

### 2. The alternative: a takeover never edits a version folder; it creates a new one
I evaluated this against the real code (READ; nothing prototyped).

What the code already says supports it:
- `adapter.ts` header: when a file stops being a pure extension "the caller then records a diagnostic and starts a NEW VERSION; no segments". `types.ts` `VersionMeta.parent`: "rewrite becomes a new version whose parent is the old one". The store already thinks "history changed = new version". The in-place takeover is the one place that breaks that rule.
- `chain.ts`: the chain seed is `SHA-256(chat id || segment)`, not the version id, so a copied prefix keeps identical chain values: index records and bodies up to the cut are byte-valid in the new folder (only the small enveloped files that carry the version key, meta, checkpoint slots and the index header, need rewriting).
- No code outside the store calls `setAsideTail`, `tail()` or `rejectedList` yet (RAN `rg`). The replicator is not built. Changing the contract now is cheap.
- The spec says forks are kept, never dropped (`2026-11-06-youcoded-mesh-sync-design.md:126`). The old version staying whole IS a kept fork.

What it deletes (estimates from reading, not measured):
- `tails.ts` (239 lines): `setAsideTailLocked` and its 7-step crash table, `readEpoch`, `histCount`, `sharedPrefixBound`, `cutAwayBranchHit`, `holdsTailPrefix`, `lostTakeovers`, `pendingTakeovers`. The only shortening operation (`cutTo`: lowers hw, checkpoint, index and trims body) goes with them, together with `recovery.ts`'s re-adoption of "lines the index lost" and the pending-cut retry.
- In the recovery paths: both `cutAwayBranchHit` blocks (`recovery.ts:466-476`, `store.ts:343-363`), the `overrode`/`ambiguous`/`blessed` logic, the "which of two files is the older one" relaxations ("time only runs one way"). With a version that never shortens and never changes history, an older file is always a PREFIX of the truth, so: the index or checkpoint shorter than the other is re-derived; a body shorter than the index is a typed gap. Nothing can hold "another history".
- `Checkpoint.hist`, `HwValue.takeovers`, `Head.lostTakeovers`, `VState.tailsShown`, `epoch`/`hist` on `VState`, the epoch seal and `rejectOutsideEpoch` in `parked.ts`, five of the `RejectReason` kinds, the aside-folder-as-history-name rule in `asides.ts`. `resetHw` on quarantine (F4) is no longer needed because a quarantined version id is retired.
- Fuzz: faults `delBegun/putBackBegun/delDone`, the pending takeover model, `staleIndexInjected`, `pairCause`, `reportedLostTakeover`, `lostReported`, `sameRewriteTakeover`, `undecidableIdentical`, `rollbackActive` and about six of the ten excuses. The F1/F2/F3/F5 classes of reviews 6, 7 and 8 become impossible by construction instead of detected by a proof.
- The replicator no longer has to fence a deposed host (review 7 F4): the old host's late lines address the OLD version id and extend that fork; the new host writes to the new id.

What it costs:
1. Disk: the prefix is copied (cut line N). Old chats hold two copies of the prefix after a takeover; the old version can be dropped by the caller (eviction with proof) once the fork is replicated. Cheaper variants: hard links of whole chunk files below the cut (unsafe: `restoreBody` and a scrub rewrite chunk files in place, and the workspace already forbids in-place writes through hard links) or reflink copy where the file system has it; or a fork that reads the parent's lines below N by reference (more machinery: cross-folder reads, parent rollback checks). I would start with a plain copy.
2. Eviction interplay: the copy carries the evicted boundary state (the checkpoint keeps the chain state at the boundary). A cut below `evictedLines` is refused as now (`evicted`).
3. The switch: the store needs no "current version" pointer. Which version is current for a chat is the replicator's control-log state (the control log is already acknowledged, append-only, anchored). The store offers `forkVersion(parentId, newId, fromLine)`: build `versions/<new>.tmp` (prefix lines, meta with `parent` and fork line, index, checkpoint, hw), fsync, rename into place (one atomic directory rename), then the caller appends the control entry. A crash before the rename leaves a temp folder to delete; a crash between rename and the control entry leaves an orphan new version no chat points at (harmless, idempotent retry with the same id); the old version is never touched, so there is no destructive step and no intent marker.
4. Callers: `setAsideTail` becomes `forkVersion`; `tail()` becomes `read(parent, from, to)`; `rejectedList` shrinks to parks refused for conflict only; quarantine must also RETIRE the version id (a retired id refuses `registerVersion`/`append`) so the replicator recopies into a new id: this one change deletes the epoch-through-aside-names rule and F4.
5. New failure modes: (a) version proliferation if hosts flip-flop (a copy per fork; needs a retention rule in the replicator); (b) the new id must be derived the same way on every device (for example from parent id, cut line, chain value at the cut and the taking device), or two devices that fork the same way create two ids; that is a protocol decision that belongs to the replicator, and a wrong choice is a visible duplicate fork, not a data loss; (c) everything above the store that assumes one version per chat (search index, transcript mirror) must follow the control log's current id; (d) a deleted or rolled-back new folder shows as unknown version, loud.
6. Residual risks it does NOT remove: an older state of a single version (handled by checksums plus the high-water record, unchanged), a whole-root rollback (undetectable, unchanged), the file-integrity classes of rounds 1 to 5.

Is there a simpler option? One that I considered and would not choose: stamp one generation id in the index header and the checkpoint, with a (generation, cut line) ledger in the high-water record and the tails, and refuse any older-generation file beyond its cut. It closes F1 completely and is a smaller diff, but it keeps the in-place cut (and all its crash states and pending-takeover recovery), the park epochs, and every excuse that exists to explain them. It is the best patch, not the best structure.

### 3. Recommendation: (b), restructure before the replicator
- Reason 1: the bug class is eliminated, not caught. Since the takeover appeared (round 6) every round has found a way for a file to hold another history; version-per-takeover removes the possibility instead of adding the fifth proof.
- Reason 2: the contract change is free today and expensive later: no code outside the store calls these functions, the replicator is the next thing to be built, and the adapter already speaks "new version".
- Reason 3: it deletes more than it adds. Estimated 600 to 800 lines of source and a similar amount of fuzz oracle logic out, a 100-line fork function and a version-retire mark in. The destructive `cutTo`, the only operation that ever shortens a version, disappears with the hardest recovery code.
- Confidence: about 75 percent. Not 95 because: (1) I did not prototype the fork function and the temp-folder swap; the claim that the prefix copy is byte-valid rests on reading `chain.ts` and the index header code, not on running it; (2) the replicator's id-derivation and the "current version" bookkeeping must be designed (a deck for Destin: they do not change what users see unless the chat "forks" are shown); (3) host flip-flops may be more frequent than I assume, which would push the copy cost up.
- What would change my mind to (a): evidence that takeovers will be frequent AND chats long AND the disk copy unacceptable with no reflink (then keep the in-place design but adopt the generation-stamp option above, and fix F1/F2 as listed); or a measured result that `forkVersion` is not simpler than about 200 lines.
- If you choose (a) anyway: do not build the replicator before F1 (the `blessed` rule), F2 (lock-out) and the F3 read-path rule are decided.

## Conditions for building the replicator on this store (if (a), or until (b) lands)
1. Treat `head().lostTakeovers > 0` as damaged from line 0: serve nothing from that version, refetch (F3).
2. Treat `rolledBack` and `damagedFromLine` as before; a head of another history can still appear unflagged after a restore of three older files (F1). Do not use the store as the only line of defence against a backup restore.
3. Do not let a deposed host reach `append` after a takeover (review 7 F4); poll `rejectedList` and `rejectedParks`.
4. Expect `setAsideTail` to refuse with `corrupt` permanently after the loss of `tails/` (F2) and have a "start a new version" answer ready.
5. Keep `tails/` and `highwater/` out of any restore or sync scope.

## What I did not cover
- Android, the replicator, the real app, large (10,000+ line) chats beyond the in-repo fuzz's own `BIG` option (I ran with it off), disk-full during the new quarantine moves beyond what `b2` and the in-repo fuzz do, Windows rename semantics.
- No mutation testing this round.
- Whole-store-root rollback and a restore from before a quarantine are documented limits; I measured their reachability only for F4 by reading.
- The design alternative was not built or measured; every size estimate is by reading.

## Files
Harness (no outputs): `docs/active/prototypes/2026-11-14-mesh-phase0/store-review-8/` (`fuzz7.test.ts`, `b2.test.ts`, `probe1` to `probe10`, `replay.test.ts`, `vfs.ts`, `vitest.config.mjs`, `an.py`). Harness changes versus review 7: the virtual-disk faults are made durable before the fault (otherwise the next power cut undoes a `put`), `lostTakeovers` counts as a report, crash faults inside appends with a retry model (`R7_CRASHALL`), `R7_DUMP` to write a failing disk image to real files for `replay.test.ts`.
