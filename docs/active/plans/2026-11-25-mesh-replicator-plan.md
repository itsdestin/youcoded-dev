---
status: active
date: 2026-11-25
---

<!-- Written by a read-only planning agent; decisions at the end are the session lead's. -->

# Replicator build plan (store ↔ link), YouCoded Mesh Phase 2

Workspace: `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build`. Nothing was edited.

Not read: design section 2 beyond its headings and the 2.5 relay lines, and the body of section 8 beyond a keyword pass. Line numbers in the stale list come from direct reads of 4, 5.2, 5.3, 5.8, 6.1, 6.3, 9.2 and the Phase 2 row.

## Decisions for you

Four things the brief did not anticipate. Each changes the shape of the build.

- **A retired id forces a second id space.** The store never refills a retired id, so "recopy" needs a new local id while the wire keeps the old one. I plan a derived mapping: local id = wire id for incarnation 0, else `SHA-256("youcoded-mesh/v1/incarnation\0" ‖ wireId ‖ n)`, found by probing for the lowest non-retired `n`. The alternative is a store-level "incarnation" field.
- **The replicator never uses store parking for peer lines.** Parks drain without any signature check, so a paired device could park forged lines past the head and have them join the chain when the gap fills. Out-of-order frames are dropped and re-requested instead.
- **The link lacks a live lane.** `Link` has no `sendLive` and no presence. Heads, wants, acks and naks must not go through `hold`: non-line groups have a 4,096-frame per-writer quota at the relay. This step adds `Link.sendLive` over the relay's existing `pass` op.
- **One small store change is a prerequisite.** `Head` does not expose the partial marker's end (review 10 F-D, rule vii). Add `Head.refill: { from: number; end: number } | null` (the existing private `ackedEnd`).

## 1. Responsibilities

**Does:**
- Exchange heads with each peer and pull missing lines in order.
- Verify every incoming batch against the writer's head signature and the local chain before `append`.
- Acknowledge only after `append` returns `ok` (fsynced).
- Serve "everything after N" from the store in bounded batches.
- Push the writer's new lines live.
- React to every store report: rollback, damage, retire, rejected parks.
- Fork locally when told of a takeover.
- Expose a status per version, including loud stuck states.

**Does not:**
- Decide which version is current, who hosts, or what is deleted (control log).
- Read transcripts (adapters).
- Evict, or build eviction proofs (storage policy).
- Apply relay 30-day or 1 GB rules, or registers.
- Show anything.
- Delete anything under `aside/`, `retired/` or `highwater/`.

**Seams it exposes for later pieces:**
- `VersionDirectory`, the stand-in for the control log: `describe(wireId) → { chatId, runtime, parent, forkLine, forkHash, token, writer } | null`, `wanted(wireId)`, `onChange`.
- `appendLocal(wireId, lines)` for adapters. It refuses unless this device is `writer` (caller rule i).
- `SourceRefill.resupply(wireId, from, to)`, so an adapter can re-supply writer lines that no peer holds.
- `peerAcks(wireId)`, returning signed `{ holder, lines, hash, sig }` in the shape of `EvictionProof.acks`.
- `ensureBody(wireId)`, design seam S9.

## 2. Messages

**Shared protocol file: nothing must be added.** The relay never parses sealed bodies, and `hold` (with `line: true`), `pass`, `fetch-after`, `gap`, `released` and `doorbell` already exist. The replicator imports `MAX_FRAME_BYTES` and `RATE_MAX_HOLDS` from `src/shared/mesh-protocol.ts`. If a constant is ever added, copy the file byte-for-byte to `wecoded-marketplace/worker/src/mesh/protocol.ts`; `tests/mesh/protocol-drift.test.ts` enforces it.

New sealed kinds go in `replicator/wire.ts`: CBOR, strict parsers, `onlyKeys`, in the style of `main/mesh/wire.ts`.

| Kind | Lane | Body | Bound |
|---|---|---|---|
| `lines` | durable `hold`, `line: true`, group `chat:<HMAC>` | `{ version, segment: 0, from, lines[], head: { lines, hash, sig }, part? }` | sealed wire ≤ 1 MiB; payload budget 768 KiB; ≤ 256 lines |
| `heads-sum` | live | `{ count, digest }` over sorted `(version, lines, hash)` | about 50 B |
| `heads` | live, paged | `{ page, of, heads: [{ version, lines, hash, conversationHash, stamp, state }] }` | ≤ 2,000 entries |
| `intro` | live | version descriptor plus the writer's signature (interim directory only) | about 300 B |
| `want` | live, to one peer | `{ version, segment: 0, haveLines, haveHash, through? }` | |
| `ack` | live | `{ version, lines, hash, sig }` | |
| `nak` | live | `{ version, at, why, hashAtYourCount? }`, where `why` is `gap`, `evicted`, `not-a-prefix`, `unavailable`, `disk-full` or `unknown-version` | |

- `head.lines` must equal `from + lines.length`. `sig` is the writer's Ed25519 signature over a label, the wire id, `lines` and `hash`.
- A line larger than the payload budget travels alone as `part: { index, of, totalBytes }`. The receiver reassembles it in a scratch file and treats it as one line.
- `ack` is line-based. The design's `*ack { group, throughSeq }` cannot mean "lines stored". Its detached signature makes it usable as a `ProofAck` later.
- Link changes: `sendLive({ kind, body, to })`, plus `Carrier.pass` and `Carrier.onPass`, mirrored in `carrier-memory.ts` and `carrier-relay.ts`. Also add `unfollow`.

## 3. State machine per (peer, version)

All work on one version runs through one serial queue per version. States: `unknown → comparing → in-sync | pulling | serving | refilling | diverged | retired-recopy | stuck(reason)`.

**Discovery.** On connect, on a presence change, and on a timer that the rig can shrink, send `heads-sum`. On a mismatch, send paged `heads`. For a version with no descriptor, ask for its `intro`. Follow a chat group lazily, only once a peer's head differs.

**Who sends.** The receiver drives.
- Peer shorter, and `hashAt(peer.lines) == peer.hash`: wait for its `want`. The writer also pushes new lines unasked.
- Peer longer: send `want` to the writer if it is online, otherwise to the peer with the highest head.
- Same count, different hash, or the prefix hash mismatches: `diverged`.

**Serving a `want`.** Check `hashAt(haveLines) == haveHash`, else send `nak not-a-prefix` with my hash there. Then loop:
1. `read` a batch.
2. `await sendDurable`.
3. Wait for ack progress.

Limits: a window of 4 frames per session, 4 sessions, 16 MiB of read buffers in total, and at most 6 holds per second. The sender keeps no retry state.

**Receiving `lines`, in order.**
1. Descriptor known and wanted, else throw `FrameWait`.
2. Verify `sig` against `directory.writer`'s key, else `FrameReject`.
3. If `from > head`, drop the frame and re-send `want`.
4. Compute the chain from `hashAt(from)` over the lines with `chainStep`. It must equal `head.hash`, else `FrameReject`.
5. Save the signed head in a two-slot file.
6. Call `append`.
7. On `ok`, send `ack` and update heads.

**`append` outcomes.**
- `ok`: as above.
- `parked`: must not happen. If it does, `releaseParked` it, count a loud error, and re-send `want`.
- `not-a-prefix` (only reachable with a valid writer signature): run `scrubStep` in slices until done.
  - Own bytes damaged: `setAsideDamaged`, then recopy as the next incarnation.
  - Bytes fine and I am not the writer: the same (set aside, recopy from the writer, diagnostic).
  - I am the writer: never retire on a peer's word. Send `nak not-a-prefix` with my signed head.
- Throws `disk-full`: no ack. Send `nak disk-full`, set status, back off.
- Throws `damaged`: the id is retired; recopy.
- Throws `limit` or `bad-argument`: `stuck`.

**`read` outcomes.**
- `'evicted'`: send `nak evicted`; the requester tries another peer.
- Throws `corrupt`: enter `refilling` and send `nak unavailable`.
- Throws `evicted` from `hashAt` (chain values lost): cannot compare at that N; compare at my head instead.

**Rollback or damage report** (`head().rolledBack`, `damagedFromLine`, `refill`, or a `corrupt` read):
1. `releaseParked` every entry of `parkedList`.
2. Advertise the head as `{ lines: from, hashAt(from), state: 'refilling' }`. Peers ignore my acks while I am in this state.
3. `want` from `from` through the source's head, including lines never acknowledged.
4. The state clears only when `head().refill` is null and a read of the range succeeds.
5. Re-send heads to all peers.
6. If I am the writer and no peer reaches `end`, call `SourceRefill`. Otherwise stay `stuck(refill)`. Never clear silently.

**Rejected parks.** When `head().rejectedParks` rises, read `rejectedList` and re-request from each `fromLine`.

**Fork.** On a child descriptor:
- If I hold the parent through `forkLine`, `hashAt` matches `forkHash`, and the id equals `deriveForkId(...)`: call `forkVersion` locally. No bytes travel.
- Otherwise pull the parent to `forkLine` first.
- `evicted` from `forkVersion`: register the child fresh and copy all of it.
- `version-conflict`: `stuck`.
- Parent sessions continue untouched.

**Reconnect and restart.** Drop all sessions and in-memory acks, release leftover parks, re-send heads.

**Where a naive implementation gives a quiet wrong answer:**
- Appending before verifying the signature and chain.
- Letting unverified lines park.
- Treating the longer copy as the winner.
- Recording an ack by line count without checking `hashAt`.
- Keeping `max()` of a peer's acks; a peer can roll back, so acks must be allowed to fall.
- Trusting `evictedLines` as "a peer holds it" (review 9 F5).
- Calling a version refilled from `damagedFromLine == null` alone.
- Accepting a peer's `not-a-prefix` without a writer signature.
- Advertising the full head while refilling.
- Accepting child lines from anyone but the named writer.
- Serving beyond the highest signed head it holds.
- Reusing the retired id.
- Treating "the relay stored it" as an ack.

## 4. Persisted and derived

**Persisted**, under `<userData>/mesh/replicator/`:
- `heads/<wirehex>.sh`: a two-slot record of the writer's signed head. It cannot be derived, and a non-writer needs it to serve and to re-prove. The valid slot is the highest one with `lines ≤ head` and a matching `hashAt`.
- `intro/<wirehex>`: the interim descriptors. These are deleted when the control log lands.

**Derived:**
- What to send: the store is the queue. The comment in `link.ts` that "the replicator keeps its own durable queue" becomes untrue.
- Peer acks: from heads.
- Incarnation map: by probing.
- The writer's own signed head: re-signed from `head()` at start.
- Large-line scratch files: cleared at start.

## 5. Files under `desktop/src/main/mesh/replicator/`

| File | About | Holds |
|---|---|---|
| `index.ts` | 20 lines | exports |
| `replicator.ts` | 350 | wiring, per-version queues, status |
| `wire.ts` | 180 | kinds and parsers |
| `compare.ts` | 120 | pure head comparison |
| `receive.ts` | 260 | receiving and every outcome |
| `serve.ts` | 200 | sessions, window, pacing |
| `repair.ts` | 220 | refill, retire and recopy, rejected parks |
| `forks.ts` | 120 | local forks |
| `signed-heads.ts` | 120 | the two-slot head file |
| `idmap.ts` | 80 | incarnations |
| `directory.ts` | 150 | seam and interim implementation |
| `budget.ts` | 80 | memory and rate budgets |

Header invariants to write:
1. No line reaches `append` unless a writer signature covers its chain value.
2. No append past the head.
3. An ack follows an fsynced `ok` and names lines and hash.
4. A peer's claim schedules work and never proves anything.
5. Divergence is never settled by length.
6. A retired id is never reused.
7. Only the named writer appends locally.
8. A report clears only on store evidence.
9. Every failure ends in a named status.
10. Bounded memory and frames of at most 1 MiB.
11. No body in logs; no key leaves the device.

## 6. Tests

**Unit:**
- Parsers against hostile input.
- The `compare.ts` table.
- Signed-head slots under the five store fault kinds.
- Budgets.
- The incarnation map.

**In-memory world**, in `tests/mesh/replicator-world.ts`. Extend the `world(names)` pattern of `tests/mesh/link.test.ts`: real `Link`, real crypto, `MemoryHub`. Add a real `ChatStore` per device over `store/fault-fs.ts`, a virtual clock, and hub hooks for drop, duplicate, reorder, delay, `gap` and `pass`.

Scenarios:
- Two and three devices live.
- B offline for 24 virtual hours, with and without a relay `gap`.
- A kill at every file operation of receive, serve, fork and retire, using the `crash.test.ts` method.
- Duplicated, reordered, dropped and delayed frames.
- A peer lying about heads; a stale peer; a forged `not-a-prefix` (LT-6).
- A paired non-writer serving forged lines.
- Rollback of a folder, then refill.
- Retire, then recopy.
- Fork during a copy.
- Two devices given one child id.
- Disk full mid-batch (LT-15).
- A 5 MiB line.

**Seeded fuzz**, `replicator-model.ts` and `replicator-fuzz.test.ts`, in the style of `convergence-model.ts`. The oracle is a plain per-version array, written only by the test's own `appendLocal` calls. At quiescence it asserts:
- Every device's servable lines are a prefix of the oracle. No line exists that no device appended.
- All online devices hold equal heads for every acknowledged prefix.
- Any line once acknowledged by a device is either readable there, or sits in a named non-`in-sync` status on that device. No silent loss.
- No version is `in-sync` while `refill` is non-null.

**Real-process rig:** `tests/mesh-rig/rig.ts`, with new test-control routes `/rep/append`, `/rep/heads` and `/rep/read`, for the 2-second timing.

## 7. Acceptance, against the Phase 2 "done when"

| Phase 2 line | Reachable now | How |
|---|---|---|
| Readable on B in under 2 s | Yes | Rig p95, from `appendLocal` on A to a successful `read` on B, for a 50-line reply |
| After B was off a day | Partly | Works when A is online at B's return, or when B already knew the chat and the relay still holds the frames. A chat created while B was off, with A offline at B's return, needs the control log's `claim` |
| Inventories match | Yes | Equal `lines`, `hash`, `conversationHash`; `verify().ok`; byte compare |
| T2, T14, T16; chat list; relay rules | No | Later pieces |

## 8. Risks and conflicts

**Engineering risks:**
1. **A writer that rolled back whole.** After an undetectable store-root rollback the writer can sign a different history. Peers then set aside lines they had acknowledged: kept, loud, but gone from view until the control log can show "two versions".
2. **Group count.** One group per chat meets `MAX_GROUPS = 5000`. `Link.syncAll` fetches every followed group at connect, against a limit of 300 messages per 10 s.
3. **Group names across generations.** `HMAC(set secret, id)` changes with the generation. This is undecided.
4. **Frame size disagreement.** `crypto/frames.ts` has `MAX_FRAME_BYTES = 8 MiB`; the relay allows 1 MiB.
5. **Retry on `over-limit`.** `sendDurable` retries every 2 s forever.
6. **Main-thread cost.** `verify()` on a 300 MB chat would block; use `scrubStep` slices.
7. **Review 10 conditions.** F-A, F-B, F-C and F-E are still open in the store header.

**Design statements made stale by version-per-takeover** (`design.md`):
- **4.2 idea 3, lines 608–609**: "tails, old segments" as set-aside kinds. The store has no tails; the other ending is the parent version.
- **4.3 B steps 3–4, lines 656–666**: `released` "stating what it had beyond the takeover point", and the set-aside tail. Those lines simply stay in the parent version.
- **5.3, lines 1064–1075**: the id rules (main id = chat id, tail id, fork id `SHA-256(chat id ‖ fork entry id)`). The store uses `deriveForkId(parent, fromLine, hashAt, token)`, and every takeover makes a new id.
- **5.3, lines 1076–1080**: "stores its own lines from the split point and reads earlier ones from its parent". A child holds a full copy of `[0, N)`.
- **5.3, lines 1087–1088 and 1169–1170**: the store "re-keys a version when `decide` says its id changed". There is no re-key; the id is sealed into every file.
- **5.3, lines 1168–1169**: per-line provenance. The store records none; the writer is per version.
- **5.3, lines 1177–1181**: the `moved` answer and `segment` in the ask.
- **5.3, lines 1181–1188**: "host for that range" and "the new host signs from its takeover point". There is one writer per version id.
- **5.3, line 1190**: "64 MB per line, 16 MB per frame". The frame limit is 1 MiB; the store has no per-line cap.
- **5.3, lines 1192–1193**: "lines with a hole before them are parked". This is unsafe for peer lines, and a park never fills an acknowledged position.
- **5.3, lines 1195–1206**: "set aside and recopied" implies the same id, and "an old host's tail". A retired id is never refilled.
- **6.1 S2, line 2042**: lists `setAsideTail` and `tail`, which no longer exist. It lacks `registerVersion`, `forkVersion`, `deriveForkId`, `parkedList`, `rejectedList`, `releaseParked`, `scrubStep`, `verify`, `keptBytes`, and the typed `corrupt` throw from `read`.
- **6.1 S3, line 2043**: `sendDurable(target, frame) → Ack` meaning the target stored it. In `link.ts` it resolves when the carrier stored it. `sendLive` and `presence` do not exist.
- **6.1 S5, line 2045**: `segment` and `tails[{ takeover, fate }]` in `decide`'s output.
- **6.3, lines 2114–2118**: `segment` in `*want`; `moved` in `*answer`; `*ack { group, throughSeq }`.
- **6.3, lines 2127–2128**: "Tails are stored apart from the version, keyed by the takeover entry's id".
- **9.2, lines 2427–2428 and 2433–2434**: the INV-5 tail wording, and INV-10 "old segments replicated".
- **Section 10, line 2501**: the control-log entry `segment` in the Phase 2 row.
- **5.8, lines 1926–1929** is compatible, but should name the store's `EvictionProof` shape.

## 9. What a user would notice

Nothing, on one condition. `MeshService` starts whenever the switch is on, so the replicator and the store folder must be created only in test mode, or behind their own flag, until adapters exist. Extend `tests/mesh/off-switch.test.ts` to assert that no `mesh/store` or `mesh/replicator` folder appears.

### Critical Files for Implementation
- `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/store.ts`
- `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/store/types.ts`
- `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/link.ts`
- `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/src/main/mesh/carrier-memory.ts`
- `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop/tests/mesh/link.test.ts`

## Decisions taken (session lead, 2026-11-25; all engineering, nothing in design section 2 changes)

1. Retired id: the derived incarnation mapping in `replicator/idmap.ts` is used; no store-level incarnation field.
2. Peer lines never use store parking; out-of-order frames are dropped and re-requested.
3. `Link.sendLive` over the relay's existing `pass` op is added in this step (with `Carrier.pass` / `onPass` in both carriers).
4. `Head.refill` is added by the store's review-10 follow-up.
5. The replicator and store folders are created only in test mode / behind their own flag until adapters exist; `off-switch.test.ts` asserts it.
6. The stale design statements listed in section 8 are corrected in the design's engineering sections as a separate docs commit.

## Changes after reviews 1–3 (builder, 2026-11-26; items 1–3 are reviewed engineering, item 4 was decided by the session lead after review 3)

1. **Review 1** (writer replaces its history; acks; id reuse; announcements; line cap; hot loops): a writer keeps a record of the highest head it signed and refuses below it; an ack is a signed statement that is listed only while the holder's own heads agree; every incarnation id is hashed; announcements are first-wins and durable; a line over the wire cap is refused by name; the same peer is not asked twice within 2 s and a child waiting for its parent re-asks only on growth.
2. **Review 2** (lost tail, damaged acks, stranded lines, intro hijack, expected head): the own record has a second copy in `witness/` (outside the store and the replicator folder); an ack covers only what the device can vouch for and carries a solicit round; a `want` can carry a `cover` point so a holder serves lines beyond its own saved points up to a point the ASKER holds; root version ids are derived from set, chat, writer and a nonce (`deriveRootId`); `appendLocal` takes the head the caller last saw; one shared store listing for all versions (1,000 versions: 96 s to 0.7 s).
3. **Review 3, the receive side stays; the writer's "may I append" gate was simplified** (it was wrong in ordinary use and three rounds of patching had not converged):
   - the gate opens once EVERY roster device that is currently reachable has sent its heads completely (every page), or the set has no other device, or nobody is reachable after 5 s; it is latched for the life of the process and never expires; a status read never changes it; every refusal asks the others for heads again;
   - the own records carry a CRC-32 and heal each other; both bad -> the store head plus the gate, counted and named; the records are a detector for PARTIAL rollbacks only;
   - a peer's claim of more lines (or another chain value at the same count) holds an append only while it could still be backed: the clock starts when the claim is first heard and only a batch from that device resets it; after 10 minutes it is discounted, counted and named (the device is named, the chat is never called diverged);
   - `appendLocal` REQUIRES the expected head; solicit rounds are random 48-bit numbers; there is no unbound-id mode (only a test-only directory subclass skips the binding).
4. **The backstop (lead's decision): the self-fork replaces the permanent fault `writer-signed-two-histories` for a living writer.** A writer restored from an old backup cannot know locally that it is behind; when it learns (from writer-signed points held by peers) that it signed two histories that part at line p: the history the peers hold stays under V; the writer's newer lines move to V2, a fork of V at p (id derived from V, p, the chain value and a token with the writer's id and the domain word `selffork`), announced with an ordinary writer-signed announcement, its own copy of V is set aside and refilled from the peers, and it writes to both. A peer holding a contradicted copy keeps it under `diverged(writer-two-histories ... waiting for the writer)` and resolves when the announcement arrives: a peer that held the old history carries on, a peer that held only the newer history sets its copy aside once the same lines are held verified under V2. Nothing is deleted anywhere. Which version is current is NOT decided (control log, later); `Replicator.selfForks()` and the `onSelfFork` callback expose both. A writer killed at any file operation finishes the move at its next start (journal in `replicator/selffork/`). `unsigned-lines-contradicted` on a non-writer uses the same resolution; without a self-fork announcement it stays (named) because lines nobody signed for may be the only copy of real lines.
5. **Still open, by design:** a paired device can create a competing version for any chat id; a whole-profile restore is only noticed through the peers (gate and self-fork), never locally; lines held by nobody are lost (store limit 4).

### Review 4 (builder, 2026-11-27)

- **F1, the class:** the id of a self-fork target carries the writer's head (a tail in the signed token) and a counter; a target that already exists here is used only if it is empty or holds exactly my own content up to its head, otherwise the counter moves on; and the copy loop itself refuses (loudly, journal kept) to append onto a version whose content differs from mine. Journal notes now carry the token and the stage (`start`, `copied`, `done`); a `done` note stays on disk and is what `selfForks()` reads after a restart.
- **F2:** a chat that is being moved has an explicit mark (set when the move is queued; derived from an unfinished note at start). `appendLocal` refuses at once with `writer-self-fork-in-progress`, status reads `refilling(self-fork-in-progress)` before anything else, a second move cannot start over it, and the move runs as a queue step that keeps the queue when the 120 s ceiling passes (`hold`). Steps that change a copy for a long time (the move, repairs, refills) are `hold` steps; steps that only read are still given up at the ceiling so a hung store call cannot wedge a chat.
- **F3, F4:** a claim's clock is reset only by a batch that advances my verified content, and an absolute clock (30 min from the first claim) ends only when I hold what was claimed. The gate waits for a heard device's complete heads for at most 60 s, then stops counting it (named in status, `gate-device-discounted`); its later heads are honoured like anyone's.
- **F5:** a copy faulted by a second history is taken off the fault by exactly one thing: a verified writer-signed batch that starts at its head with its OWN chain value as base. **F6 (root cause):** the restart-from-zero ask that a same-count divergence causes was answered one signed point at a time and never continued, so both sides sat in `diverged`; the ask now goes on from where the batch ended until the lines part. **F7:** one roster device may announce at most 1000 versions to this device (`intro-over-budget`); lazy registration of announced versions is not done.
- Lower: an unsigned nak never marks the writer's chat `diverged`; the announcement of peers' versions beyond the budget is counted, not kept. Deleted as dead or redundant: the older-record chain check (the chain value is cumulative), the echo check in the claim loop (an echo equals my own state).

### Review 4 gap-closing round (builder, 2026-11-27)

- **Found by making the fuzz really self-fork** (and by the reviewer's own harness): (a) a batch's base is now always read from MY chain, never from "the value the previous batch from this device ended at" (that value could come from a refused batch, and a continuation was then appended onto my different lines); (b) when a batch is refused, the signed points that came with it, which are not on my chain, are forgotten (a copy kept answering `unavailable` for lines it really held); (c) a copy faulted by a second history is also taken off the fault by a verified writer batch that ENDS at my head and reproduces my chain value (cover), and it asks the writer for its signed head when the writer claims exactly my head; (d) the restart-from-zero ask goes on past a shared point for a WRITER too (its state is `pulling`, not `diverged`).
- **Deleted:** the re-entry guard of F2e (no behavioural test could break it; the one-move-at-a-time mark covers it).
- **C5 (the writer's continued ask):** a directed test cannot isolate it, because the slow timers reach the same result minutes later. Its proof is the reviewer's own seed 13535: it fails with the guard broken (twice) and passes with it (three times).
- **F7, lazy registration of announced versions: not built.** Reason: announcements are what the directory keeps so that a later `rep.want` can find a version; making registration lazy means every read path (status, serve, gate, scrub) would have to cope with a version that is known but not yet registered, and that touches the store's open path, a change that needs its own review. What the budget costs instead: the per-device cap of 1000 announced versions lets one hostile device make this device keep about 2,000 small files / 440 KB under `replicator/` and 5,000 files / 930 KB under `store/` (reviewer's H3, 1,500 sent in about 5 s). Across a 17-device set, if every device were hostile, the worst case is about 17 times that: 34,000 files / 7.5 MB and 85,000 files / 16 MB. Nothing grows past that, nothing is lost, and the cost is disk only.
- **Fuzz coverage:** the model now rolls the writer back to an earlier profile after peers hold newer signed lines and chats on: plain, again to the same backup, interrupted by a kill with a second rollback before the move resumed, with a child fork already made, and a second version moving itself. A first version of that rollback silently did nothing for second versions (the chat was refused because the writer's gate was still closed after the restart); fixed, after which second-version moves went from 1 in 480 seeds to about 1 in 16.
- **20,000-seed fuzz (8 workers, seeds 1-20000) after these fixes:** 33 seeds failed in the run. On a single re-run 25 passed (the run was interrupted by the machine sleeping and heavy load, so timing-based failures are expected); three more (14938, 12401, 19016) passed 3 of 3 further re-runs. Seeds 3285, 7637 and 8902 were model faults (the model chatted on a second version the writer had lost; the model restored a store that held the only copy of a second version): fixed and passing. Still open: seed 14226 (a writer that restored a whole profile, with one peer holding each side of its root: the writer moves the same lines 26 times, loud on both peers, nothing lost) and seed 17103 (too slow to finish inside 900 s here; earlier it reported "A still waits for the writer"). Per-case self-fork counts over the 20,000 seeds: plain 1,129, again 1,106, interrupted 1,088, with a child fork 1,086, a second version moving itself 936 (1,075 tried), appends in a second version 1,011, 6,668 self-forks in all.
