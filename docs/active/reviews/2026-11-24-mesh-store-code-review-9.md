VERDICT: safe with conditions to build the replicator on (one real invariant hole to close first, plus four rules the replicator must obey; details below)
CONVERGING: yes. Reviews 6-8 attacked older files, folder rollbacks and swapped sibling files; this round ran 50,000 mixed-fault and 5,000 crash-only seeds of an independent fuzz and found zero wrong lines served from any of those classes, and only one new path (conflicting park after a folder rollback) that is outside the kinds the earlier fuzzes dealt.

Review 9 of the mesh chat store (head 1c3471373, restructure range ede86e58c..1c3471373). Reviewer did not write the code. Harness: `docs/active/prototypes/2026-11-14-mesh-phase0/store-review-9/` (fuzz9.test.ts, vfs.ts, probes 1-7). Read-only on the repo; scratch outputs not copied.

## Findings by severity

### F1 (MEDIUM) A conflicting park can replace lines that were acknowledged before a folder rollback
What a user would experience: after an old backup of one chat's folder is put back, the chat can end up holding different text at some lines than it held before, and those lines are served as normal. The store does report "rolled back from line 10", but only line 10 is refused; the changed lines further on are served, and a resend of the true lines is answered `not-a-prefix` forever. The only exit is retiring the copy.
Exact reproduction (deterministic, `probe7.test.ts`): version holds true lines 0..9; a sender parks DIFFERENT lines Y at 12..14; snapshot the folder (park in `parked/`, head 10); append true lines 10..39 (the park is moved to `rejected/`); put the snapshot folder back (head 10, park back in `parked/`, high-water record says 40, store reports `rolledBack {from 10, had 40}`); resend true lines 10..11. The head reaches 12, the park drains, lines 12..14 are now Y. `read(12..15)` serves Y because the flagged line (10) is outside the range. Output: `diff "..........X.DIFFDIFFDIFF"`, `r2 not-a-prefix`.
Where: `parked.ts` `drain` (line 90, called from `store.ts:740` after every ok append) applies a park whenever the head reaches its start, with no look at the rolled-back state; `store.ts:643-646` `assertServable` refuses only the first damaged line.
Needs: a sender that parks lines which differ from the true history (a diverged history under one id) AND a folder rollback. Narrow, but it breaks the stated headline invariant ("an acknowledged line N is the same bytes forever").
Restructure-introduced: no (the path is old); the restructure's claim that wrong lines "can no longer exist" is not true for it. The repo fuzz cannot see it: `fuzz.test.ts:213` excuses a conflicting park winning when `(i >= c.ackedAt || v.faulted)`, i.e. after ANY fault on the version it excuses a park replacing acknowledged lines and then overwrites the model with the winner (line 214). That clause is broad, not narrow.
Fix: `drain` must not apply a park whose start is below `rolledBack.had`; `assertServable` should refuse every line below `rolledBack.had`, not only line `from`; narrow the fuzz excuse to `i >= c.ackedAt`.

### F2 (LOW-MEDIUM) The store cannot stop two histories under one child id; the replicator must
`forkVersion` is idempotent for the same (parent, line, token) and answers `created:false` when the prefix matches. Nothing stops two devices from then appending DIFFERENT continuations to that same child id (same token). The store is correct for each device alone; the result after sync would be one id with two histories. Rule for the replicator: only the host named by the takeover entry ever appends to a child; a different continuation needs a new token (a different token gives a different id, verified).

### F3 (LOW) Retirement is two witnesses in two different folders; the replicator must never remove both
`aside/<id>-n/` (store root) and `versions/<id>/retired.json` (inside the version folder). A single folder rollback or a single deletion removes at most one: 0 failures over ~500 single-witness cases, and putting pre-retirement files back in every subset (500 cases) never revived an id. Both deleted = documented limit 5; in my fuzz that fault serves the old id (147 of 147). Reachability by ONE fault: only a whole-store-root rollback (limit 4). By a replicator: `keptBytes()` is offered so the replicator can run a disk budget on aside/; a retention job that deletes aside/ folders AND reaps leftover retired version folders would un-retire the id (`registerVersion` then creates a fresh empty version under the old id). Condition: retention may delete one witness, never both.

### F4 (LOW) Loudness cost of rare multi-file states
Quarantine (whole chat copy retired, bodies kept in aside/, copy again from a peer) happens only when several files are wrong at once: a complete foreign set (index+checkpoint+bodies) put in 100%; an older sibling's set 99.8%; an older index+checkpoint pair that predates the first index/checkpoint (both files vanish while bodies exist) 37% of olderIdxCk cases ("nothing stored vouches for the body"). No single-file fault ever quarantined a version (see table).

### F5 (INFO) Older checkpoint that still records an eviction a later restore had undone
After folder rollbacks (26 cases in 20,000 seeds) `head.evictedLines` is larger than what the caller asked for; the bodies are present but those lines read as typed `evicted`. Harmless to correctness (nothing wrong served) but a replicator that trusts "evicted" would believe a peer holds lines that are actually here. Not investigated further.

### F6 (INFO, harness-side corrections of my own, not store bugs)
A park drained over an unacknowledged append after a crash (the documented conflict-park-won) and a park overlapping the head extending it both looked like errors until the model was fixed; the reverse leg of my first "swap both" fault used the wrong file set.

## Per-step results

### 1. Is the invariant enforced or stated?
- append over a damaged region: appends continue at the head and never touch the damaged range (`store.ts:866-925`; writes start at `st.bodyEnd`; tailShort starts a new chunk). Enforced by checks; 0 violations.
- `restoreBody` (`store.ts:1292-1360`): every supplied line is checked against the index chain value before anything is written (`1327`, evicted prefix against the boundary `1319`), then read back (`1338`). 30% of my restore calls carried a flipped byte: 0 accepted (`RESTORE-ACCEPTED-WRONG-BYTES` = 0 in 50k seeds). If the index itself were older, it is a prefix of the same history, so its values are still the true ones. Enforced.
- scrub: reads only, sets `badLine`; no repair path writes.
- resend "clearing a flag" (`store.ts:831`): the flag is cleared only for lines compared byte for byte with a resend that was first chain-checked against the index record (`765`). One rotted byte: 300/300 healed by one full resend, exactly one line unreadable meanwhile (probe6).
- evicted then restored from a peer with different bytes: refused typed (above).
- rebuild from bodies when bodies and index are both older but consistent: the surplus bodies are moved to torn/ (kept) and the head is the older one; reported through the high-water record when it knows, otherwise silent (limit 4, see step 6). Never different lines.
- conflict parks: see F1. Enforced by convention for the rollback case, by check otherwise (a park is applied only when the head reaches its start; 0 acknowledged lines changed without a rollback in 50k seeds).
- The two recovery branches the author flagged (`recovery.ts:349`, `:367`, `i >= ckpt.count`): both only END the rebuild early; they cannot add or alter a line. I did not find a single fault that needs them to be reachable; fuzz hit no wrong line through them.

### 2. Fork
- Crash at EVERY disk operation of `forkVersion`: probe4, 3 scenarios (multi-chunk, single chunk, with a park) x fork points 0/1/17/40 x every operation index x 3 tear modes x kill/power x 2 settle seeds = 8,040 cases. Child absent (6,540) or complete (1,500), never partial; retry returns the right result; the parent's index and body files were byte-identical in every case; zero untyped errors; the child accepted an append afterwards.
- Fork from a faulted parent (fault dealt, no heal): 20,000 seeds, 9,207 children made, every child equal to the acknowledged prefix; 1,698 typed `corrupt` refusals. Evicted parent refused `evicted` (code at `store.ts:1174`); child id of another content `version-conflict` (`1166-1172`); retired child or parent `damaged` (`1158`).
- Two forks of one parent/line with different tokens: different ids (hash includes the token); same token twice: `created:false`.

### 3. Retirement
Single witness deleted (aside only / json only), pre-retirement files back in every subset, whole pre-retirement folder back: 0 revivals. Both deleted: limit 5, see F3. A retired id refused every read, append and registration (`store.ts:1158`, `:225`; fuzz `RETIRED-ACCEPTED-APPEND` = 0).

### 4. Classes of reviews 6-8, and the sibling swap (highest value)
Answer: a file of a child cannot be dropped into its parent (or the reverse, or into another chat) and serve the other ending's lines. Reason: every file that holds history is tagged with the folder's version key (index header tag, both checkpoint slots, every small file envelope, parks, high-water record), so a sibling's valid file reads as `foreign` and is re-derived from this version's own bodies; the one untagged file kind, the body chunks, is checked line by line against chain values that sit in this version's own index, and past the fork point the sibling's bytes give different chain values. Evidence over ~13,000 swap-fault seeds (single-file and whole-set, parent<->child and same-chat siblings, bodies from older snapshots, other chats): wrong lines served 0. Outcomes: swapped index 100% silently repaired, swapped checkpoint 100%, meta/scrub/summary 100%, swapped body chunk flagged in 45% and harmless (identical bytes) in 55%, one foreign chunk file: one full resend healed 100% (probe5, 1,300 cases), a complete set of the sibling: 100% quarantine, older sibling's set 99.8% quarantine, another chat's files 27% quarantine. Older index+checkpoint+bodies together, for a parent and for a child, and whole-folder rollback: shorter or flagged, never different (silent shrink only inside limit 4, step 6). Seed rule: chain seeds ignore the version id by design, so only the tag separates siblings; an acceptable single point as long as the tag derivation (`chain.ts versionTag(key)`) stays checked at every read, which `matrix.test.ts` pins.

### 5. Loudness cost
- Crash-only: 5,000 seeds, every operation kind ran (append 34,660, fork 8,485, evict 5,622, retire 4,517, park 7,251, restore 702): zero quarantines, zero flags, zero typed errors, zero untyped exceptions, forks survived crashes.
- One rotted byte in one body chunk: 300/300 exactly one unreadable line, no quarantine, healed by resend (probe6). Per-fault table (first check, only the faulted versions; a "none" cell means that outcome never happened):

| fault | n | repaired silently | flagged (narrow) | unreadable lines | quarantined | silent shrink | other |
|---|---|---|---|---|---|---|---|
| flip one bit | 4547 | 63% | 21% | 16% | 0 | 0 | |
| zero/garble a range | 2756 | 70% | 18% | 12% | 0 | 0 | |
| truncate | 2765 | 68% | 32% | - | 0 | 0 | |
| delete one file | 1747 | 39% | 61% | - | 0 | 0 | |
| older index | 347 | 100% | - | - | 0 | 0 | |
| older checkpoint | 374 | 100% | - | - | 0 | 0 | |
| older bodies | 339 | 2% | 98% | - | 0 | 0 | |
| older index+bodies | 386 | 3% | 97% | - | 0 | 0 | |
| older index+checkpoint | 390 | 10% | 51% | - | 37% | 1.8% | |
| older all three | 422 | 10% | 87% | - | 0 | 2.6% | |
| whole version folder back | 1226 | 41% | 36% | - | 0 | 1.8% | 22% typed unknown-version (folder predates the version) |
| swap index / checkpoint | 755 / 713 | 100% | 0 | - | 0 | 0 | |
| swap body | 707 | 55% | 45% | - | 0 | 0 | |
| swap whole set of a sibling | 534 | 0 | 0 | - | 100% | 0 | |
| swap older sibling set | 451 | 0.2% | 0 | - | 99.8% | 0 | |
| other chat's files | 931 | 52% | 21% | - | 27% | 0 | |
| retirement witness fault (single) | ~900 | retired stays retired 100% | | | | | |
| whole store root back | 4250 | 50% | - | - | 0 | 16% | 14% typed unknown-version (limit 4) |

Unfaulted versions: zero collateral (not flagged, not quarantined, no changed line) in all runs.

### 6. The five excuses and the repo fuzz
- `evict-exempt`: honest (typed `evicted`, by design). `rollback-with-record-lost`: honest (two faults). `rollback-then-index-fault-after-eviction`: honest (two faults). `rollback-to-unrecorded-head`: honest, but the window is real, see below. `conflict-park-won`: NOT narrow, see F1 (the `|| v.faulted` clause).
- Window: the high-water record is raised every 256 lines, at close and at every eviction/restore. After a whole-folder rollback to a point the record never saw (up to 255 lines older than the head), the chat reads as shorter and healthy with no report. My fuzz saw silent shrink in 1.8% of folder-rollback faults and 2.6% of older-triple faults (chats of under 100 lines; max silently lost 87). Worst case a user can suffer under the documented limits: the 255 most recent lines of one chat vanish silently from that device after an old copy of its version folder is put back (cut bytes are kept in torn/, nothing different is ever served; a peer or the source transcript refills them). For a tool-heavy chat that is minutes of the latest conversation; the whole-store-root rollback has no bound at all (limit 4). The window is acceptable only if the replicator compares heads with peers after any restore.
- Coverage assertion (`fuzz.test.ts:447-451`): real (the run fails if any operation or fault kind never ran), but its threshold is "at least once", so a nearly dead branch passes. My run shows every kind in thousands.
- `fault-fs.ts` change (+8 lines in `rename`): when a directory is renamed, the records of synced/touched/pending files under it follow to the new name. Without it the shim would miss unsynced data inside the renamed work folder (the only directory rename the store does is the fork). It is stricter for fork, neutral elsewhere (the new code runs only when the source path has children, which for other renames does not happen). I reproduced the effect on my own disk: unsynced data inside a renamed folder is lost in power-cut mode, and the fork syncs its files before the rename (`fork.ts:58-59`, `63`).

### 7. `read()` judgement call (lines after a damaged line)
Sound for the stored values: each line is checked against its own chain value and the previous record's value, both from the index, where each record carries a CRC; rebuild keeps the OLD record's chain value as truth when a body is rotted (`recovery.ts:388`), so a rotted body cannot rewrite its own reference. A single fault cannot damage body and reference together. 0 wrong lines in 50k seeds, including reads after the flagged line. The one gap is F1: `rolledBack` marks only the first line, not the range below `had`.

### 8. Complexity
Net source: -422 lines (363 added, 785 removed in 14 non-test files), store.ts 1,474 lines (was 1,500), recovery.ts 616 (was 672). Simpler: the whole class "which of two histories" is gone, the fork crash table has one non-destructive step, 35 file kinds. Hardest remaining part: `recovery.ts rebuildIndex` (about 170 lines, `recovery.ts:~280-467`): derived-only stretches, `ambiguous`, `gapStart`, `mode 'changed'`, partial markers, checkpoint lowering, all in one loop, plus the five ways the head can be reported lower (`damagedFrom`: partial, badLine, rolledBack). Should it be simplified before the replicator? Not blocking; but give the replicator ONE precise rule: "a version is trustworthy only through head.damagedFromLine and below head.rolledBack.had; below `had` nothing may be served or drained" (F1) and add a state table for the six flags in `vstate.ts`.

## Fuzz totals
- Mixed (crash + one file fault, sometimes a crash during repair): 30,000 seeds (run A) + 20,000 seeds (run B, with fork-from-faulted-parent added) + ~7,000 targeted swap seeds + 3,000 swap/older seeds = ~60,000. Operations: ~350,000 appends, ~85,000 forks, ~57,000 evictions (~6,800 restores), ~44,000 retirements+recopies, ~74,000 parks. Two chats, parents and children with same and different continuations, conflicting parks, eviction/restore, retirement and recopy into a new id.
- Crash-only: 5,000 seeds, 0 violations.
- Violations in mixed runs, all classified: SILENT-SHRINK 878 (rbRoot ~800 limit 4; rbFolder/olderAll/olderIdxCk ~80, limit-4 window, max lost 87); RETIRED-ID-SERVES 147 (all both-witness, limit 5); evicted-more-than-asked 50 (F5); READ-THREW-AFTER-RESEND 3 (multi-file foreign-chunk swaps where several chunk files of a sibling were put in at once; single foreign chunk always healed in probe5; I did not run those to ground); WRONG-LINE-SERVED 0; untyped exceptions 0; unfaulted-version collateral 0.
- Oracle: after reopen every acknowledged line (below eviction) is present and byte-identical, or covered by a typed error / damage flag / rolledBack report / retirement; any served line that differs from the model is a violation even after a flagged line; a retired id never serves or accepts; a fault in one version never changes another; faults are made durable before the next power cut (`settle('kill')` before every fault).

## What I did not cover
- The repo's own fuzz and test suite were not run by me (only read); my harness is independent and used my own virtual disk, not `fault-fs.ts`. Real filesystems (rename/fsync semantics beyond the virtual disk's model) were not exercised.
- Chats over a few hundred lines (so the 255-line window and 256-line high-water cadence were only probed indirectly); control log, extras, locks; replicator behaviour; disk-full paths; Windows; the three multi-file READ-THREW-AFTER-RESEND cases; F5 root cause; concurrency (two processes).
- The two flagged recovery branches (`i >= ckpt.count`) were judged by reading plus fuzz, not by a constructed proof that no single fault reaches them.
