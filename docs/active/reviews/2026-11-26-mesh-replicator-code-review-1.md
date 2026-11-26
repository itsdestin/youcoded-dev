# Replicator review 1 (independent, read-only) — branch session/64-mesh-sync-build @ 256f95015

Scratch dir: /tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-1/
(world.ts = my own world; fuzz.test.ts = my attack fuzz and oracle; targeted*.test.ts = the single-scenario repros; out*.log = their output; fz-*.jsonl = fuzz results; mut-log.txt / mut-results.jsonl = mutation results)

## Verdict

NOT safe to build adapters on yet; SAFE WITH CONDITIONS once F1, F2 and F3 are fixed. The core the builder asked about (receive ordering, signature/chain checks, ack after fsync, serving never past a signature, the crash sweep) held up under everything I threw at it. The failures I found are on the WRITER side (it can silently replace its own chat history) and in the ack/id plumbing around it. It converges in every run that does not contain a writer-side retire or a destroyed sole copy; the cases that do not converge are named on at least one device (stuck / refilling / diverged), except where noted.

## Findings (most severe first)

### F1 CONFIRMED, QUIET LOSS (high): the writer can replace its own history and every peer then silently discards the old one
- What goes wrong: when the WRITER's own copy is set aside (store says damaged, or its store folder is put back), its new copy starts empty. The writer cannot refill from peers (`writer-ahead-unexplained`, receive.ts:97-102, sets stuck 'writer-behind-unreported'). But `appendLocal` (replicator.ts:389-398) only refuses while the store reports a repair (`repairFrom(head)`), which a fresh incarnation does not. So appendLocal returns ok and starts a new history at line 0. Its signed batch contradicts what peers hold, `append` answers not-a-prefix under a VALID writer signature, so each peer sets its whole copy aside and recopies the new, shorter history (repair.ts:34-45), then clears the flags at the next ok append (receive.ts:135). Result: all devices say in-sync, the old lines are only in aside folders, the only loud signal is "stuck" on the writer.
- Repro A (targeted.test.ts T3): A writer, 6 lines on A and B. `A.store.setAsideDamaged`, `A.rep.reportCorrupt`. After 120 virtual s A is `stuck(writer-behind-unreported)` with 0 lines; `appendLocal` returns `ok 1`; 90 s later B holds 1 line, `in-sync/1`, chains equal to A's new line (6 lines gone from view).
- Repro B (targeted3.test.ts T10): whole store folder of A put back 3 lines ago while B holds 6. A shows `stuck(writer-behind-unreported)` within 60 s (it KNOWS), `appendLocal` still returns `ok`, B ends `in-sync/5` after setting its 6-line copy aside.
- Fuzz: 39 of 120 seeds in batch c (e.g. seeds 1041, 1048, 1053): all three devices hold the same history that differs from what the writer authored at line 0, all `in-sync`.
- Fix direction: appendLocal must refuse while stuck is 'writer-behind-unreported', while incarnation > 0 and not yet refilled, or while any fresh peer head claims more lines of this version than my head. When the writer's copy is retired, set a refill marker (end = highest peer head) so the writer accepts its own signed lines back (they carry its own signature; the guard at receive.ts:97 should key off "I know I am behind", not "the store reported"). Peers should not clear a diverged/retired-recopy status at the next ok append when the recopy REPLACED more acknowledged lines than it received.

### F2 CONFIRMED, QUIET (medium): a peer's ack outlives the copy it was for; and acks otherwise vanish every hello
- (a) `retireAndRecopy` (repair.ts:34-45) never advertises, so the other devices keep the retired copy's ack. T2: B retires its 5-line copy and cannot reach A; `A.peerAcks(V)` still reports B holding 5 while B holds 0. Fuzz (non-writer retire op): 34 occurrences in 16 seeds of 120 (batch c), 11 in batch d2. Window = until the next heads exchange (up to one discovery period, 60 s default). A later eviction proof built from `peerAcks` would let a device delete bodies that nobody holds.
- (b) `hello()` clears every peer ack (replicator.ts:168) and nothing recreates them (T1: acks `[5]` right after the batch, `[]` after one hello period; in a quiet in-sync system `peerAcks` is always empty). Safe direction, but it means eviction proofs can never be assembled from a quiet system.
- Fix direction: broadcast heads at the end of retireAndRecopy; on hello re-send an ack of my current head to the writer and to peers that ask (instead of deleting); keep acks keyed with the holder's incarnation/heads stamp.

### F3 CONFIRMED (medium): wire ids and local ids share one namespace, so a paired device can get its lines written into the folder that serves as another version's copy
- idmap.ts:17 maps incarnation 0 to the wire id itself; incarnation n is SHA-256(label, wire, n). A hostile paired device announces a version whose wire id equals `incarnationId(W1, 1)` (it can compute it). The probe (replicator.ts:82-88) only checks that the store answers `head()`, so when W1 is retired the "next incarnation" folder is found already live and registered with the attacker's chat id.
- T9 (targeted2.test.ts): after M announces W2 = incarnationId(W1,1) and sends 2 lines signed by M, B's W1 is set aside; B's current copy of W1 IS that folder: 2 lines, line 0 is M's, status `pulling/2/inc1` (not stuck, not diverged). That is a line the named writer of W1 never signed sitting in W1's copy. When A is reachable it is then retired again (each cycle retires another incarnation; 32 cycles end in 'too many retired incarnations', permanent stuck).
- Fix direction: derive local ids for EVERY incarnation (including 0) through the domain-separated hash so no wire id can equal a local id; also compare the registered folder's chat id/parent with the descriptor in `setupVersion` before treating it as `registered`.

### F4 CONFIRMED (medium): interim directory is last-wins under concurrency, and its conflict flag is erased by the next append
- directory.ts:80-96 `accept` awaits between the "already known?" check and the set. T5 (6 trials, intros from A and from M arriving together): the SECOND one won every time on B, both returned 'new', no conflict flagged, status unnamed ('comparing'). A paired device that times its intro with the real one captures the version id on that device.
- When the conflict IS flagged, `run.stuck='directory-conflict'` (replicator.ts:271) is cleared by the next ok append (receive.ts:135). T4: after M's lines (signed by M, the writer on B) land under A's version id, B shows `diverged("peer says my copy is not a prefix of theirs")` — loud, but names the wrong cause and the directory conflict is gone.
- This is a loud-only effect when it happens once; it becomes quiet in the sense that B holds M-authored lines under A's version id (rule (i) of the store header: one id, two histories) and counts a bad-head-signature counter rather than a named status.
- Fix direction: decide first-wins synchronously (set the map entry before any await, write after), keep the conflict in the directory itself, never in `run.stuck`.

### F5 CONFIRMED (low-medium, liveness, no named state): lines over 16 MiB never catch up through `want`; lines over 64 MiB can never replicate
- serve.ts `pump` reads the batch (buildBatch) and only THEN calls `readBytes.take(bytes)`; the ceiling is 16 MiB (budget.ts:8) while a line may be 64 MiB (wire.ts MAX_LINE_BYTES). T8b: B away, relay forgot, A holds one 17 MiB line: after 400 virtual s B holds 2 of 3, status `pulling` (39 `pull-stalled`), A `serving` forever, re-reading the 17 MiB line every 500 ms. The writer's live push (T8) bypasses the budget, so it only shows on the catch-up path.
- PLAUSIBLE (reasoned, not run): the store accepts 512 MiB per append (store.ts:107) while the wire parser caps a line at 64 MiB / 128 parts, so appendLocal accepts a line that no peer will ever parse; the writer reports in-sync (status only compares with what peers claimed).
- Fix direction: refuse lines over the wire cap in appendLocal; read oversized lines in parts under the budget; give the stall a named state.

### F6 CONFIRMED (low-medium, cost/resource): a paired device can make a device do unbounded work
- T6: one 100-byte `rep.sum` with `ask: true` makes the victim call `store.head()` 4 times per version (1,200 calls for 300 versions) and answer with a heads page; at 5,000 versions about 20,000 head reads and 10 heads frames per tiny frame.
- T12: one `rep.heads` frame naming 2,000 unknown versions made the victim send 2,000 signed `want intro` frames (20,000 frames for 10 frames) and keep an entry per id in `peer.heads` (replicator.ts:247-263), `#introAsked`, and (via nak/want/ack) `runs`/`#queues` keyed by peer-supplied ids. No per-peer rate limit or cap on entries.
- T7: one part-0 frame with a replayed genuine head and a 64 MiB claim pins the whole 64 MiB reassembly budget (receive.ts:60-67) until the next hello; a real 3 MiB line then fails with part-over-budget and arrives only after hello (confirmed: 3 of 4 lines after 40 virtual s, 4 of 4 after the hello). Repeatable every period. MAX_SESSIONS=4 can be filled by one peer the same way (`serve-session-limit`).
- Also: `reconsider` enqueues an `adopt` for every waiting child on every call with no de-duplication (replicator.ts:357-360); in the one stalled run (below) 22,193 such tasks queued behind one blocked task.
- Fix direction: cap and rate-limit per peer (entries per heads frame, intro asks per period, sessions per peer), cap the per-peer maps, de-duplicate adopt.

### F7 CONFIRMED, by design but easy to misread (low): "in-sync" is only "I hold everything anyone has claimed"
- status() (replicator.ts:411-428) never compares hashes, ignores freshness, and a peer that is refilling or whose chain cannot be compared (evicted) leaves it at in-sync. Fuzz: tail lines that exist only on a damaged writer are `in-sync` on both other devices (seeds 240, 247, 1156) while the writer is `refilling`/`stuck(refill-no-source)` (named on the writer only). A hostile peer can also flip any device's status to `diverged` with one forged `rep.lines` frame carrying a replayed genuine head (receive.ts chain-mismatch branch sets `run.diverged`); it clears at the next heads exchange.

### F8 UNRESOLVED OBSERVATION: a version queue can wedge with no named state
- With injected crashes armed (FaultFs failAt), seed 3040 stalled in 3 of 3 runs and two of three batch-d shards stalled (killed by me). A traced copy shows, on device B, ONE started task on a version queue with `store.head()` calls for two versions pending forever (`crashed=false`) and 22,193 queued tasks behind it. With crash arming turned off (NOCRASH=1) the same seed finished. I could not isolate whether this is the store (an internal wait after an injected throw) or a replicator self-wait; it may be an artefact of continuing to use a store object after its fake crash. Two real properties remain either way: nothing times out a blocked store call (status() does not use the queue, so it keeps reporting the old state), and F6's de-dup gap lets the backlog grow without bound. Repro: `HANGLOG=... SEED0=3040 SEEDS=1 OPS=50 npx vitest run --config mut-trace/cfg2.mjs fuzz` (hang dump in hang.log / hang2.log).

### F9 PLAUSIBLE/INFO: rot at rest is found only when something reads it
- The replicator never starts a scrub itself (only on error paths and the store's scrub-on-open). Seeds 1156, 3118: a device with a rotted body line says `ok`/in-sync and has acked those lines until the final read threw `corrupt`. Matches the `reportCorrupt` seam design; it means an ack is "held in the index" not "bytes verified". Suggest a slow background `scrubStep` slice while peers still hold copies.

## Answers to the builder's list (3a-3f) and items 4-7
- 3a receive.applyLines: no sequence I built made a device save an ack or a signed point out of order with append, or append lines without a writer signature. Signed point is saved before append (harmless: it is a true statement; a crash between leaves a point above head, which serve.ts refuses past `head.lines`). `lastSigned` as base is sound because every append before it was verified from a trusted base (induction), but it is not independent of the store: if the store chain at `from` is already wrong the lines are appended onto it (ack then names the real head hash, so it is not credited; heads compare shows it). The one real gap here is F1 (the writer-side).
- 3b buildBatch: a non-writer serves only up to a point it holds a signature for; the `through` clamp is redundant with buildBatch's own bound (see mutation table). No leak outside the set (link-level roster check). Cost amplification: F6.
- 3c: checkRepair clearing held in my fuzz (rot 232, rollback 32, crash restarts 1,327). Full crash sweep: see below. A crash between set-aside and re-registering is covered by the sweep (retire scenario) and by my 1,327 crash restarts. The set-aside itself is the problem (F1/F2).
- 3d: directory: F4 and the limit in the header. Loud for a single conflict, quiet only through the race and through F3.
- 3e: live handlers are all idempotent by reading (sum/heads/want/ack/nak/intro) and under 'dup' and late delivery in the fuzz. Replayed or reordered frames only move acks DOWN, kill a serve session (an older ack makes `a.lines < s.acked` drop the session), or flip a heads entry for up to a hello. None changed a copy.
- 3f: a liar's stale heads entry never produced in-sync wrongly in my runs, but status() ignores freshness (F7): a refilling or stale entry with lines <= mine reads in-sync.
- 5 acks: no ack was ever recorded on a different chain (0 SAFETY ack violations in the runs without writer-side history swap); an ack never comes from relay storage; stale-after-retire is F2. An ack is also only a SIGNED STATEMENT by that device (hostile paired device can sign anything for itself): fine for own devices, say so in the proof's contract.
- 6 off-switch: `service.ts` imports store/replicator only inside `startReplicator`, gated by testMode && replicator flag; the repo's off-switch test asserts no folder in off / switch-on / test-mode-without-flag states. Logging: reportFailure logs only `Error.message`; the new code logs no frame bodies or key material (grep of replicator/ and the link additions).
- 7 bounds: reassembly is one shared 64 MiB counter (bounded, but pinnable: F6). Read budget does not bound reads (F5). Unbounded maps keyed by peer ids: F6. signed-heads thinning only ever drops points covered by a kept later point; it cannot affect verification (a receiver verifies against the signature in the batch), only which first batch a non-writer can serve (batches over 256 lines or 640 KiB answer 'unavailable', loud). After 256 records every add rewrites the whole file (cost, not safety). The 5,000-group cost was NOT measured (not run).

## Mutation results (scratch copies; builder's replicator.test, replicator-hostile.test, replicator-repair.test = 6+11+9 tests)
| guard broken | caught? |
|---|---|
| writer-ahead-unexplained removed | NO (also not by replicator-fuzz.test); and the guard is what causes the writer to wedge (F1) |
| ack sent BEFORE append (extra early ack) | not by those three files; YES by replicator-crash.test sampled sweep (3 of 4 tests fail, e.g. receive k=40 "acknowledged lines are on disk: expected 0 >= 4") |
| part reassembly ordering check removed | NO — redundant: the chain check at the end rejects a mis-assembled line |
| 16 MiB read budget removed | NO test; and the budget is harmful above 16 MiB (F5) |
| ENOSPC catch around heads.add removed | YES (LT-15 test) |
| non-writer `through` clamp removed | NO — redundant with buildBatch's own signed-point bound |
| non-writer re-check "my chain at the signed point" removed | NO — receiver's chain check still rejects, so loud not quiet |
| ack chain check removed | YES |
| chain check before append removed | YES |

## What I ran (exact)
- Full crash sweep: `MESH_REPLICATOR_CRASH_FULL=1` replicator-crash.test.ts, every file operation, tear and no-tear: 4 passed (4), 970.8 s.
- My attack fuzz (own world, own oracle: truth = what writers' appendLocal returned ok for; chain recomputed independently from the store's published seed). Three real devices (A, B, C), one hostile paired device M on the roster with 14 frame attacks (forged lines on a genuine head, reordered lines, replayed captured lines, wants with true/false prefixes and `through`, forged and lying acks, naks, lying heads, sums, conflicting/new intros, part abuse, shifted genuine batches, relabelled-group live frames), lossy/duplicating/delaying relay (pass and hold), relay gaps, offline toggles, graceful and crash restarts, injected crashes at random file operations, ENOSPC, body rot (flip/zero/cut), folder rollback, store set-aside (retire), forks. 
  - Batch b: seeds 240-319, 80 seeds x 45 ops = 3,600 ops (no retire op): 0 SAFETY violations.
  - Batch c: seeds 1040-1159, 120 seeds x 50 ops = 6,000 ops incl. 74 writer and 161 non-writer retires: F1 in 39 seeds, F2 in 16 seeds.
  - Batch d: seeds 3080-3119 only (40 x 50 = 2,000 ops, non-writer retire only): 0 SAFETY violations, F2 again. The other two d shards (3040-3079, 3120-3159) stalled and were killed (F8).
  - Totals for the counted runs: 240 seeds, 11,600 main ops, 1,778 hostile actions, 2,882 successful appends, 1,327 crash restarts, 381 clean restarts, 232 rots, 32 folder rollbacks, 274 retires. An earlier 30-seed batch (seeds 100-129) used a buggy oracle and is not counted.
  - Not counted but real: single-scenario repros T1-T14 in targeted*.test.ts.
- Mutation runs as above.

## Not done
- Unpaired / removed-device frames beyond reading the link path; fork behaviour under a hostile fork intro (only the fork op and M's intro conflicts in the fuzz); powerLoss/reorder modes of FaultFs (only the kill modes); the 5,000-group cost; a real relay; Windows; the fuzz was not re-run after F1-F3 fixes; whole-store-root rollback only as T10; the stall F8 is not root-caused.
