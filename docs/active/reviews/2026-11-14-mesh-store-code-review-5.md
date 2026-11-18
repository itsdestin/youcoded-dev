---
status: active
date: 2026-11-14
topic: mesh chat store, fifth independent code review (store at 54e70f4b6)
---

# Mesh chat store, review 5

Reviewer worked from scratch twice (machine reboot, then a session stop wiped /tmp scratch, so the round-4 reviewer's harness could not be reused). All harness code was rebuilt by me: own virtual disk, own generator, own oracle. "RAN" below means I executed it and saw the output; "UNVERIFIED" means I did not.

## Verdict

**Yes with conditions** for building the replicator on top of this store.

Round 4's whole classes are closed in what I could attack: across about 110,000 random sequences (crashes at every kind of point including reordered/unsynced writes and lost directory entries, one rotted/older/foreign/missing/cut/extended file, up to three nested crashes inside repair) I found no case where a single fault silently lost or silently changed an acknowledged line, control entry or extra. The remaining problems are narrower:

Conditions before trusting it:
1. **Parked-append files are not bound to their own name (new bug, RAN).** A valid copy of another parked file placed under a name makes the store later put the WRONG lines into the chain with no report. Same hole, smaller, in set-aside tails (the file does not say which takeover it belongs to). Fix before the replicator relies on parked appends. See F1, F2.
2. **A whole chat folder rolled back is invisible (RAN).** Documented limit, not a bug, but the replicator must not assume the store can tell. See F3 for what to do.
3. **After an eviction, one damaged index.bin hides the whole version (admitted limit, RAN).** Bytes are kept, nothing is lost, but every line reads damaged until peers resend. See F4. Acceptable only if the replicator treats "version quarantined" as "refetch from peers" and never as data loss.

## Findings by severity

### F1 (high) A parked file whose content is for a different position is believed. RAN.
- What a user would experience: after a damaged copy / mixed restore of the parked folder, the chat later shows messages from the wrong place in the conversation, silently, and the true lines are not asked for again because the head has "passed" them.
- Repro (real disk, `r5/sib.test.ts`): append 5 lines; park 3 lines A at line 8 and 2 lines B at line 12 (both answered `parked`); close; swap the two `parked/*.park` files (each keeps a valid checksum and the version tag); reopen; append lines 5-7. Result: head 10, line 8 equals B's first line, no damaged report. Single-file variant also RAN: overwrite only the line-12 park with a copy of the line-8 park, fill the gap up to 12: lines 12-14 are A's lines, head 15, no report.
- Cause: a park file carries only the version tag and framed lines (store.ts around line 971, read at 1004). Its position lives only in the file NAME and the name's 16 hex digits are never checked against the content. The drain appends whatever lines it reads at the name's position.
- Fix: put the position (and a hash of the lines) inside the file; at drain compare with the name; mismatch goes to rejected/ like a damaged park.
- Fuzz note: my random "swap" and "foreign" faults reach parked files only rarely, so the fuzz did not find this; I looked for it because every earlier round's bugs were of the form "valid file, wrong identity".

### F2 (medium-low) Set-aside tail does not say which takeover id it belongs to. RAN twice: fuzz seed 200636 and an isolated repro (`r5/tailsib.test.ts`): tails A (from line 6, 2 lines) and B (from line 3, 7 lines) for one version; copy B's file over A's name; `tail(A)` returns fromLine=3 with 7 lines, no error.
- A `tails/<id>.tail` replaced by another tail of the SAME version returns the other tail's lines (different start line) with no error; the real tail's only copy is gone. inventory.ts claims foreign tails are refused, but only tails of another version are.
- Fix: put the takeover id in the tail header and check it on read.

### F3 (medium; honest limit) Whole-folder rollback of one chat is silent. RAN.
- Event: a backup tool restores `versions/<chat>/` as it was an hour ago. Every file is old but consistent. The store opens, serves the old state, reports nothing: `head.lines` is simply lower. In my fuzz every such sequence ended with "head=N, acked=M, no damaged flag".
- Nothing inside the folder can detect it by design; a checksum cannot know it is old. A control log is not affected the same way (it has its own anchor, which sits inside the chat's control folder, so a rollback of that folder is equally silent).
- How bad it really is: lines the device had already sent to other devices are still held by them; the replicator learns the head is lower than what peers say it holds and refetches (an ordinary "behind" situation). The loss is real only for lines no other device has yet and whose source file (the runtime's own jsonl) is gone. For a store whose purpose is replication, this is low-to-medium.
- What the store can do cheaply: keep one tiny high-water file OUTSIDE the chat folders (e.g. `root/highwater.bin`: per version, line count plus chain value, rewritten lazily, say at close and every N lines). On open, a version whose head is behind its high-water mark with the SAME chain prefix is reported "rolled back to line N (had M)". Costs one small write per N lines; detects folder-level rollback but not a whole-root restore (nothing local can). Report it as `damagedFromLine`-style "behind" so the replicator treats it as a resend request.
- Alternative: leave as is and make the replicator the authority (it compares heads with peers anyway). I would take this alternative plus a documented line in inventory.ts.

### F4 (medium; admitted limit 2) One index.bin fault after an eviction quarantines the version. RAN (seed 124959).
- Sequence: 21 lines, evict 12, delete index.bin (single fault). Result: the version moves to `aside/<name>-q1/`, `head()` throws `damaged`, all 21 lines unreadable including the 9 kept ones that sit intact in `aside/.../b001371.bin`. Violates "one bad file never hides good lines".
- Why: after an eviction the chain values of the 12 evicted lines exist only in index.bin; rebuilding the index for the kept lines needs the chain value at line 12.
- Fix (small): store the chain state at the eviction boundary (raw chain value, conversation chain value, count, reply-end state, about 100 bytes) in both checkpoint slots and in evicted.json. Then the index for the kept lines can be rebuilt from the bodies alone and verified against the checkpoint head.
- Impact if left: recoverable (nothing deleted); costs a full refetch of that chat.

### F5 (low; admitted limit 3) Older checkpoint after a later eviction. RAN (seed 130172).
- Evict 19, later evict 27, then an older checkpoint (still saying 19) comes back: lines 19-26 (no body locally by design, holders have them) read as DAMAGED instead of evicted. `restoreBody(allLines)` restores only the 19 lines the stale record names; a second `restoreBody` call is needed to repair the hole. Nothing a holder lacks is lost; the replicator must call restore again or just resend.
- Targeted check (400 runs x 2 variants): `restoreBody` acknowledged then immediate power loss, with and without an older checkpoint: all 30 lines intact every run.

### F6 (info) Parked appends, rejected/, tails and kept copies are the families where "valid file, wrong name" can still be true. Control-parked (`.ent`) are safe: name equals SHA-256 of the body and the entry names its chat. Body chunks and extras are safe (chain / hash). Index, checkpoint, meta, summary, partial, damaged are safe (version key inside). Park and tail are the two exceptions.

## What held (RAN)

Own virtual disk models: per-file unsynced writes (any subsequence survives a power cut, so reordering between files and within a file; torn last write as prefix or garbage), unsynced directory operations (per-directory prefix survives; created or renamed file that was not synced disappears or reverts; cross-directory rename atomic), full disk with torn partial writes, clock jumps (also backwards), ids at the 64-byte limit (10 percent of versions), 1 to 2 versions sharing a chat, resend overlaps, gapped appends, wrong-bytes overlaps, control entries with causal links, extras, evictions, restores, set-aside tails.

Offline faults on any file: flip, truncate, cut a record, zero, zero a range, delete, swap two files, foreign (same-role file from another version/chat), older copy (a snapshot from earlier in the same run), duplicated-extended, plus (separately) whole-folder rollback. After each fault: 0 to 3 nested crashes inside the repair that open performs (each crash with a random surviving subset of unsynced state).

Totals: 300 + 32,000 + 40,000 + a further 12,000 (oracle fix-up reruns and mutation baselines) of seeds. After removing my own oracle mistakes (listed below), every sequence with zero or one data fault ended in: nothing lost, or loss reported and bytes retained, with the exceptions F1/F2 (not reached by random faults), F3, F4, F5.

Inventory completeness: my oracle checked every file present under the root after every check against `inventoryRow`; 0 files unknown in all runs, including aside/, tails/, extras/, control/anchor.*, manifest.bin, partial/damaged copies and COMPLETE marks that the sequences produced.

## Task A (the 11 disputed sequences) -- UNVERIFIED individually

The round-4 harness was deleted with scratch (two wipes) so I could not rerun seeds 5001-36000 of that harness. Substitute: my own harness over seeds 2001-34000 and 100001-140000 under the same fault classes. I cannot adjudicate the author's 11 by number. What I can say: every f<=1 case my harness produced fell into F3/F4/F5 or my own oracle gaps; the multi-fault leftovers (seeds 2947, 4671, 5520, 5844 of my run) all involve at least two data faults chained by me, with later wrong-bytes at a lost position (the admitted "any new line accepted at a lost position"), not a single fault turned into two by the store.
Fault-count definition I used: one fault = one offline file damage event (or one crash with its own unsynced-state outcome); every crash that lands while the store is repairing an earlier fault is counted as a second event but the oracle keeps applying "no silent loss, no wrong bytes served". I did not find a case where the store itself created a second fault from one (a crash during repair of a single fault always converged to the same outcome as without the crash).

## Task B (my fuzz)

As above. Not covered: two OS processes dancing on the lock while faults occur (the lock file uses the real disk directly, bypassing the fault layer; after each crash I deleted LOCK myself) UNVERIFIED; real fsync lies UNVERIFIED; setAsideDamaged (the aside path was reached only via automatic quarantine, seed 124959).
Oracle mistakes I made and fixed (shown so nobody repeats them): an eviction that crashed half way counted as "not evicted"; checking lines the store had not actually evicted; counting a typed read error in already-evicted lines as silence; a retried set-aside after lines were appended legitimately captures a different set (tail oracle gave 13 false alarms until fixed; 2 remain and I could not tell oracle from store: 201506 did not reproduce in isolation, 200636 is F2).

## Task C (new files)

anchor.json/anchor.copy: rotted, older, foreign, missing, cut, extended all handled in my runs (control losses were always reported; anchor with a different chat's hash rejected). Reviewed control.ts load(): anchor is advanced even while a loss stands, so a second loss cannot hide behind the first: sound. Weakness: anchor lives inside the same control folder, so a folder rollback hits log and anchor together (F3).
manifest.bin: records of stored/removed extras; missing blob that the manifest names throws `corrupt` (good); a deleted manifest is rebuilt from the folder. No failure found.
partial.copy, damaged.copy: handled (second copy used). aside/<n>/COMPLETE: handled (a quarantined version was reached and finished, seed 124959). Version tags: index, checkpoint, side files carry the version; park and tail do not carry position/id (F1, F2).

## Task D (admitted limits)

(1) index fault after an eviction: real, single fault, F4. (2) after a lost line is reported, store accepts any new line at that position: no f<=1 instance seen in about 76,000 sequences; appears only after two or more chained data faults (f=2/3 hits in my runs). (3) checkpoint lost/older past an eviction: F5; not a promise break (bytes are held by the proof's holders), but the report says damaged instead of evicted.

## Task E (mutation check)

23 mutants applied to a scratch copy (never the worktree), each run against 2,400 fixed seeds of my fuzz (a baseline of unmutated code on the same seeds gave 2 unexplained tail-oracle hits; "kill" means new f<=1 violations vs that baseline). My tail oracle is noisy (it fired 1-3 times on most mutants, including ones unrelated to tails), so a kill whose only evidence is `tail-*` is counted as SURVIVED below.

Killed for real (big, specific signals): M02 checkpoint slot not fsynced; M04 atomic write without file fsync; M05 atomic write without directory fsync (extras refused/missing); M07 control anchor prefix test always true (66 silent control losses); M08 control log append without fsync; M12 rotted extra served (142 wrong-bytes); M13 foreign index copy used in a rebuild (12 losses); M20 body append without fsync; M21 index append without fsync.

SURVIVED (my fuzz did not notice): M01 checkpoint identity tag unchecked; M03 side-file version key unchecked; M06 control record of another chat accepted; M10 anchor chat identity unchecked; M11 extra that the manifest says was stored but is gone reads as absent instead of throwing; M14 foreign index accepted at load; M15 partial.copy never written; M16 damaged.copy never written; M19 restoreBody read-back skipped; M22 checkpoint evicted-count > count allowed; M23 hole check skipping ahead; M09 anchor.copy never written (1 weak hit); M17 tail read-back skipped and M18 tail from an evicted line allowed (inconclusive because of the tail oracle noise). M24 did not apply (the pattern occurs twice).
Reading the survivors: M09, M15, M16 are second-copy protections that only matter after TWO faults, and M01, M03, M06, M10, M14, M22 are identity checks whose job is also done by a second layer (chain values, index cross-check), so a single wrong file is still caught; I cannot call them equivalent without a test that isolates the first layer, and the repo's own matrix tests are what should kill them (not run by me). M11 survived because MY oracle accepts null for an extra after any extras fault; the repo's own oracle does not (so it likely kills it). M19, M23 and M17-M18 have real gaps in my fuzz (restore read-back, holes inside a chunk, set-aside tail read-back): treat as untested by me.
The author's "equivalent" mutants M14 and N02: UNVERIFIED. Their definitions were in the request, not in the repo or in any file I could find (grep of the worktree finds neither); my own M14 is a different mutant (index foreign check) and it survived my fuzz.

## Task F (tests weakened?)

Compared with 10b0465cf: no assertion removed from the fuzz oracle; its excuse is "a destroying fault (truncate, zero, delete) on a file that is the only copy of those bytes may be reported as damage", plus control and extras now excuse nothing; the in-place-overwrite revert model (revertInPlace) was ADDED to the crash sweep. Two things worth knowing:
- faults.test.ts quarantine tests were changed from "truncate the body" to "delete index.bin AND checkpoint.bin" (two files) because a cut body no longer quarantines. Consistent with the new design; it means the quarantine test no longer covers any single-fault path (F4 is the single-fault path and is untested).
- The old fuzz's SINGLE_COPY list included `parked/` as an excused single copy; keep it excused only if F1 is fixed in a way that rejects (never applies) a mismatched park.
Excuses still in the repo fuzz besides "only copy destroyed and reported": a fault in another chat's files does not count; flip/overwrite/dup are not treated as destroying. I found no other.

## Task G (complexity)

Plainly: not yet simple enough to trust without a rule that every file be self-identifying. about 10,000 lines in the folder counting tests (store.ts 1,648, recovery.ts 615); 25 file kinds, each with its own repair rule; eviction state lives in four places (checkpoint, evicted.json, index.bin chain values, the aside copy) with a veto rule between them. Every bug of the last three rounds, plus F1/F2 now, is "a file that does not state what it is". Recommended:
1. One rule, one helper: every file carries (version key, role, position or id) inside its checksummed bytes and the reader checks all three. Park and tail are the last two that do not.
2. Delete evicted.json (the inventory says nothing is decided from it except a veto): put the boundary chain state into the checkpoint instead (also fixes F4).
3. Fold partial/damaged markers and their `.copy` files into one two-slot file written the same way as the checkpoint (one mechanism instead of three).
4. scrub.json, stale-conv.json, summary.json are derivable; consider dropping them from the durable set.

## Untested / UNVERIFIED

Two-process lock races with faults; file systems that lie about fsync; Windows directory fsync; real-disk (non-virtual) power loss; `setAsideDamaged` flow directly; Task A individual seeds; 201506.

## Files

My scratch (may be gone): /tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-5/desktop/r5/ (vfs.ts, fuzz.test.ts, sib.test.ts, restore.test.ts, restore2.test.ts, mutants.json, mut.py).
