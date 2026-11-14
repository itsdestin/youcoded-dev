# Mesh chat store: second-round data-loss review

Subject: `desktop/src/main/mesh/store/` at `4285811b2` (the fix commit; original `9221e279d`). Reviewer wrote neither. Review-only: nothing in the repo was changed. No real user data was read; every script uses synthetic lines on tmpfs.

**Verdict: SAFE TO WIRE A CALLER: yes-with-fixes.** Every first-round critical and high finding is truly fixed against its original demonstration. The new machinery has two findings that meet the "silent" bar (N1, N2) and four more that should land before the replicator depends on them (N3 to N6). None of the six is reachable by a plain process kill; N1 needs two faults at once, N2 needs one flipped bit in a log file. Counts: critical 2, high 1, medium 7, low 8.

## How this was run

- Store sources at `4285811b2` copied to `/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-2/src`, compiled with the worktree's `tsc` into `.../out`, driven by plain node scripts (list at the end).
- `cd desktop && npx vitest run --project unit src/main/mesh/store`: **7 files, 150 tests, all passed** (28 s). The tests run on tmpfs, so fsync cost and real-disk ordering are still untested (UNVERIFIED on a real disk).
- First-round scripts `e1.js` and `e2.js` re-run (e2 with the lock edited away after each simulated death, since the lock does not go through the injectable Fs).

## First-round findings: truly fixed?

| # | Status | Evidence (re-created against the new code) |
|---|---|---|
| C1 | **Fixed** for the index. Not fixed for the control log (see N2). | `e1.js` E1: 100 lines, one bit flipped in record 50: reopen gives 100 lines, body 12,490 bytes unchanged, verify ok. Old E2 (record older than the 4,096 window): the open-time scrub (8,192 records) rebuilt it; 5,000 lines kept. Deleted `index.bin`, truncated to 8 bytes, bad header: all keep 100 lines (but see N1). |
| C2 | **Fixed**, residuals N9, N14. | Second open in the same process: `store-locked`. 12 processes racing for a stale lock, 25 rounds x 3 stale shapes (dead pid, pid with no start time, unreadable file): exactly one winner every round, zero overlapping holders (`a5.js`). Kill -9 of a real holder: next open succeeds. Live pid with unknown start time: refused. Pid reused (live pid, wrong start time): taken over. Other host: refused. Write-time size guards on body and index also present (store.ts writeNew). |
| H1 | **Fixed**, tiny residual N15. | `e2b.js` E5: head 15 before and 15 after the replayed takeover id. E5b clamped retry: ok. |
| H2 | **Fixed.** | `e2b.js` E4: kill at each of 19 operations of `setAsideDamaged`; the aside index is exactly 16 + 116 x 20 bytes in every case (stricter than the builder's `<= 16` check). My own sweep `a12.js` repeats this with torn writes and power loss: 60 crash points x 3 modes, no loss (outcomes only "full" or "cut but preserved in aside"). |
| H3 | **Fixed** for read, resend and open. Gaps N3 (scrub never wraps on a growing chat) and N6 (extras). | `read` of a flipped body byte now rejects `corrupt` and sets `damagedFromLine`; a wrong resend returns `not-a-prefix`; the correct resend heals and keeps the bad bytes in `healed/` (`a6.js`). Old record-5 case caught by the open-time scrub. |
| H4 | **Fixed.** | Default verifier refuses everything (`bad-proof`). With an accept-all verifier a wrong-hash or wrong-version proof still fails the binding checks; a verifier that returns the string `"yes"` is refused (must be exactly `true`). I found no other body-dropping path: `cutTo` (tail file durable first), `trimBody` (copies to `torn/` first), quarantine and aside (moves), `evictBody` (the only deleter, behind the verifier). `firstBadBody` refuses to evict bytes that already fail the chain. |
| M1 | **Fixed**, with a documented hole (N13). | 4,000-line file, same-size edit at line 1000, then append: `poll` now returns `rewritten` (was: silent). |
| M2 | **Fixed** for directory creation; shim now models it. | `mkdirDurable` is the only caller of `fs.mkdir` besides itself (grep). `fsyncDir` no longer swallows errors (L1). Gaps in the shim: see "Crash sweep honesty". |
| M3 | a, b, c, d: **b, c, d fixed; a not fixed** (N2). | Parked-control cap exists; `id == SHA-256(body)` enforced; self-reference refused. The cut-off-versus-damaged test misreads a bit flip in the length field as a torn tail. |
| M4 | **Fixed**, residual N12. | 50-file cap reached in 7 ms (was 14 s per 1,000); `fromLine` 10,000 past the head refused `bad-argument`; 16-digit names. |
| M5 | **Fixed**, with a side effect (N4). | Stamp in the index header and in `Head.classifierStamp`. |
| M6 | **Fixed.** | Two id-less end lines: first end now confirmed (`[0]`, pending 1). `pause_turn` then `end_turn` of one message: one end. `max_tokens`/`refusal` still count as ends (explicit decision now); `apiErrorsEndReplies` default is still true while the design said "proposed no": an open decision, not a defect. |
| M7 | **Partly fixed.** | 59 new hardening tests, the tests that asserted the old destructive behaviour were changed, deleted-index and two-process cases now exist. Still tmpfs; property tests still use fixed seeds. |
| L1 | Fixed | `fsyncDir` throws except on Windows. |
| L2 | Fixed | `append([nonewline])` now rejects (`bad-line`), does not throw synchronously. |
| L3 | Fixed | Symlink: `unreadable:ELOOP`; FIFO: `unreadable:ENOTREG` (no hang); same bytes, new inode, then append: continues with no new version. |
| L4 | Fixed | read past head, negative `from`, `conversationLines(-1)`: all `bad-argument`; `hashAt(99)` is null. |
| L5 | Fixed in code (not exercised by me) | `restoreBody` checks every evicted line first. |
| L6 | Fixed | Tail header carries a CRC. |
| L7 | **Deferred**: safe to defer, with one API trap (N12b). | Same-`fromLine` conflicting parked chunks are applied in hash-name order; the loser goes to `rejected/`, kept. Both are chain-gated, so neither can overwrite stored bytes. The trap is that nothing tells the caller. |
| L8 | Fixed | `maxAppendBytes`, `maxLineBytes` (adapter), `limit` errors. |
| L9 | Fixed | `maxExtraBytes`; extras directory temp sweep. |
| Gaps | **Deferred** (per-line provenance, re-key on `decide` rename) | Still absent (grep). Safe to defer for loss, but see N16. |

## New findings

Severity key: critical = silent loss or silent divergence.

**N1. CRITICAL (needs two faults). Rebuild-from-body accepts WRONG bytes whenever the old index cannot vouch for them. Demonstrated** (`a1.js`).
`rebuildIndex` (recovery.ts) compares the rebuilt chain with old records only `if (oldHdrOk)`. If the 16-byte header is damaged, or `index.bin` is missing or cut under 16 bytes, `oldSlots` is 0 and nothing is compared, even when every old record is still valid. Results with one rotted body byte at line 10 of 100: header flip, deleted index, and truncated-to-8 index all reopen "healthy": 100 lines, `verify()` ok, **line 10 differs from the original, and the head hash changed**. A later correct resend from a peer cannot heal it (the chain now includes the bad bytes, so it answers `not-a-prefix`); peers will see a fork the store cannot explain. The same hole opens after a crash between the two renames at the end of `rebuildIndex`: `index.bin` is gone, the verified `index.rebuild` and `replaced-index/index-0001.bin` are ignored, and the retry is a second unverified rebuild.
Fix: when the header is bad but length is a whole number of records, decode the records anyway and compare against them; when there is no usable old index at all, also consult the newest `replaced-index/*.bin` and the leftover `index.rebuild`; if there is still nothing to compare against and bodies exist, do not accept silently: quarantine, or mark the version `unverified` (reads allowed, flagged in `Head`, resend allowed to replace any line that disagrees with a peer). Never report `verify() ok` on a chain that was derived from the very bytes it is checking.

**N2. CRITICAL (one flipped bit). Control log: a flipped bit in a record's LENGTH field is read as a torn tail and silently cuts every later acknowledged entry. Demonstrated** (`a4.js`).
control.ts load: `if (good + 8 + len > buf.length) break;` runs before the CRC check, so a damaged length that is larger than the rest of the file (but under the 4 MiB limit) is "a torn final record". 10 acknowledged entries, one bit in record 3's length: reopen shows **3 entries**, no error, the 7 lost entries sit in `torn-1.bin`, and `keepTorn` deletes all but the newest 8 such files. This is the first-round C1 defect, surviving in the control log (the fix covered only complete-and-bad-CRC records).
Fix: a record is torn only if the length is plausible AND the remaining bytes are exactly what the tail of a half-written append could be: i.e. bytes after it are fewer than the record claims and the header itself (len and crc) is intact per a header CRC. Add a CRC over the 8-byte length+crc header, or write a fixed footer. Until then, treat any non-final inconsistency as `damaged` and never prune `torn-*` files that hold more than one record's worth of bytes.

**N3. HIGH. The rolling scrub never wraps while a version keeps growing, so old rot is never found. Demonstrated** (`a3.js`).
`scrubSome` restarts from line 0 only when `scrubMark >= count` at the START of a call. If one line arrives between calls, the mark stays below the head and each call only checks the new tail. 2,000 lines scrubbed once, rot planted at line 100, then 400 rounds of "append one line, scrub 50 KB": never detected (mark 2,400 of 2,400). With no appends it was found on the next call. The most-used chats are exactly the ones that keep growing. The stated detection bound ("within ceil(bytes / maxBytes) calls") is false for them. The on-open scrub has the same shape after a restart that appended lines.
Fix: keep a separate `passStart` (the head count when a pass began); a pass ends when the mark reaches `passStart`, then restart at 0 regardless of newer lines; the lines added during the pass are covered by the next pass or at once by the append check. Also reset the mark in `cutTo`, healing and rebuild (a stale mark after a cut only delays detection by one pass: I tested it, `a15.js`, found on the second call).

**N4. MEDIUM-HIGH (latent until eviction is used). A version with an evicted prefix is bricked, and drags down `listVersions` for everyone, by any classifier-stamp change. Demonstrated** (`a11.js`).
`rebuildIndex` throws `StoreError('classifier-changed')` when the first lines' bodies are evicted and the stamp differs. It is not `Damaged`, so nothing quarantines; `load()` rethrows it on every call. Evict 30 of 60 lines, reopen with the stamp changed (a `CLASSIFIER_VERSION` bump in an app update, or flipping `apiErrorsEndReplies`): `head`, `append`, `restoreBody` and `listVersions` all throw. `restoreBody`, the one operation that could fix it, goes through the same load and also throws. The only escape is `setAsideDamaged`, which moves the whole version aside and starts it empty. No data is destroyed (peers hold the bodies by proof), but the chat is unusable until a full recopy, and every app update that touches the classifier hits every evicted chat at once.
Fix: for an evicted prefix, keep the old conversation-chain values and mark the version `needs-reclassify` instead of failing; allow `restoreBody` to run without a clean load; or re-derive `c` for the evicted region lazily when bodies come back. Test: an app-upgrade rehearsal with evicted versions.

**N5. MEDIUM. Reading needs free disk space: a full disk makes healthy versions unreadable. Demonstrated** (`a10.js`).
`loadOnce` calls `scrubSome`, which calls `saveScrubMark`, an atomic write (`writeFileAtomic`). Make that write fail with ENOSPC: `head()` and `read()` of an undamaged version throw; after the space is freed they work. Design INV-18 and LT-15 say a full disk must refuse writes, not make the chat unreadable.
Fix: make the scrub-mark save best-effort (catch and ignore), and never let a read path write anything that can fail.

**N6. MEDIUM. Extras are never checked on read, and a rotted extra can never be replaced. Demonstrated** (`a10.js`).
`readExtra` returns the file bytes without hashing them against their name. Flip a bit: `readExtra` returns the wrong bytes; `putExtra` of the correct bytes answers `present` and keeps the bad file. Control entries have only a per-record CRC on load, with the id not rechecked either (low).
Fix: verify SHA-256 on `readExtra`; in `putExtra`, when the file exists, verify it and replace it (keep the bad one aside) if it does not hash to its name.

**N7. MEDIUM. One bad body byte plus any rebuild trigger quarantines a whole healthy version (denial of service, no loss). Demonstrated** (`a2.js`).
300 lines, one flipped byte in line 40's body: reopen with a different stamp (app upgrade) gives `damaged`, all 300 lines moved to `aside/<v>-q1`; `read` refuses until `setAsideDamaged`, which leaves the version empty. Same with one index-record flip plus one unrelated body flip. The bytes are all kept, and nothing restores them from `aside/` (there is no such operation), so recovery depends entirely on a peer having a copy.
Fix: when the rebuilt chain first disagrees at line k, keep lines [0, k) (they verified), move only the rest aside and flag `damagedFromLine = k`, so the version stays readable and a peer's resend heals it.

**N8. MEDIUM-LOW. One version with a garbage `meta.json`, `evicted.json` or `damaged.json` makes `listVersions()` throw for every version. Demonstrated** (`a14.js`).
Only `damaged` is caught inside the listing loop. The healthy neighbour still answers `head()`. There is also no remedy for the bad version: `setAsideDamaged` itself reads `meta.json` and throws `corrupt`.
Fix: list a version that fails to load as `{ damaged: 'unreadable: <code>' }`; make `setAsideDamaged` work without `meta.json`.

**N9. MEDIUM. Stale lock can lock the user out with no way back; one wrong-takeover case. UNVERIFIED on the target platforms; the logic is demonstrated** (`a5b.js`).
(a) A lock from another host name is never taken over (`other host -> store-locked`). If the machine's host name changes after a crash (rename, DHCP/mDNS, Android), the app can never open its own store; the only fix is deleting `LOCK` by hand and the error text does not say so. (b) Where the start time is unknown (not Linux, so macOS, Windows and possibly Android, which may report `android`) a reused pid looks alive forever: same lock-out. Android kills app processes without warning, so a left-behind lock there is routine, and `kill(pid, 0)` on another app's process answers EPERM, which is counted as alive. (c) Opposite risk: two processes in different pid namespaces sharing the root (a sandbox, a container) see each other's pid as "not running" and would steal a live lock (same host name). (d) No heartbeat: a `LOCK` file deleted under a live holder lets a second opener in (demonstrated) with no defence beyond the size guard.
Fix: store a machine/boot id instead of the host name; offer an explicit, logged `forceUnlock` for the user path; test on Android before wiring there.

**N10. LOW-MEDIUM. File-handle leak in `rebuildIndex`, and in Node 24+/Electron 44 a leaked handle that is garbage-collected is an uncaught exception. Demonstrated** (`a13.js`).
`oldFile` is opened, then the `index.rebuild` open can fail (inode exhaustion, permissions, an injected crash) before the `try`; the handle is never closed. The tracking sweep found this as the only leaking open site among 295 crash points. My own crash sweep died with `A FileHandle object was closed during garbage collection` on Node 26. UNVERIFIED for Electron 44's bundled Node.
Fix: open `nf` first inside the try, or put `oldFile` in the same try/finally.

**N11. LOW-MEDIUM. Several kept-forever folders have no byte cap.**
`rejected/` is capped at 1,024 files but not bytes (a junk park can be up to the 256 MB parked cap before it is moved there), `tails/` 1,024 x any size, `aside/` and `replaced-index/` grow per event, `extras/` has no total cap, `healed/` grows per heal. All are event-driven except the first and last, which a paired peer can drive: park 256 MB of junk, fill the gap with the real lines, repeat. Not demonstrated at scale (reasoned from caps). Correct against INV-9's "never delete" but needs a disk budget owned by the replicator or S9.

**N12. LOW-MEDIUM. Parks: (a) junk parked far past the head occupies the cap forever; (b) a `parked` acknowledgement can later silently become `rejected/` with no API to see it.**
(a) A parked file at `fromLine > count` is only released when the head reaches it or the file is rejected; nothing ages it out. At the 2,048-file cap, legitimate out-of-order parks answer `parked-full` (demonstrated at a cap of 50; sequential appends are unaffected). (b) `rejected/` is not readable through any method; the replicator that was told `parked` believes the peer's lines are safe while the store has moved them aside as non-prefix.
Fix: expose `rejectedList(version)` and age out parked files at `fromLine` further than the gap cap behind the replicator's own timeout.

**N13. LOW (documented hole, now measured). Adapter scrub misses an edit that restores the mtime until the 6 h period. Demonstrated** (`a9b.js`).
Idle file, completed cycle, one byte edited, mtime restored with `touch -r`: 500 polls at the same clock gave no `rewritten`; after 6 simulated hours it was found in 26 polls. An edit behind the cursor while the file keeps growing was found after 95 polls at 256 KiB per poll on a 13 MB file, about two full cycles, not the one the header comment claims (`a9.js`). Edits that change the mtime, including the 4,000-line mid-file case, are found.
Fix: correct the stated bound in the comment; consider hashing the whole prefix once on every app start.

**N14. LOW. Lock litter and a weak fallback.** `LOCK.new-<pid>-<hex>` temp files left by a crash are never swept (tiny). On a file system without hard links the lock falls back to exclusive-create, where a reader may see an empty file; `readLock` calls that `unreadable` and a second opener can unlink the other's in-progress takeover file, so two takeovers could proceed (not demonstrated; UNVERIFIED on FAT/exFAT/some SMB).

**N15. LOW. A replayed `setAsideTail` after the same lines were deliberately re-appended cuts them again.** The H1 fix cuts when `count == fromLine + L` and the head hash equals the saved `headHash`. If the new host's lines are byte-identical to the tail, that test passes and the lines are removed again (the tail file keeps them). Needs a persisted "cut done" marker in the tail file. Not demonstrated; reasoned from the code.

**N16. LOW (future format trap). Provenance cannot live in the index record.** The rebuild re-derives records from body bytes alone; a per-line "which device wrote it" field would be lost in any rebuild. Keep provenance in its own file keyed by line number, and make rebuild treat it as optional.

**N17. LOW. `torn/` and the control `torn-*` files are pruned to the newest 8**, which is looser than INV-9's "one retention rule, never deleted" for set-aside material (nine unacknowledged-tail events delete the oldest). For `torn/` these are unacknowledged or redundant bytes; for the control log it is N2's lost entries.

## Attacks that came back clean (so the next reviewer need not repeat them)

- **Heal-on-resend cannot replace good bytes** (`a6.js`): identical resend leaves the file byte-identical and creates no `healed/`; a same-length mutated line, and a mutated line inside a longer overlap with a valid new tail, both answer `not-a-prefix` with the body unchanged. Healing happens only for a line whose stored bytes differ AND whose resent bytes satisfy the chain from the stored previous record; a hash collision is the only way around that. A bad stored line plus a wrong resend: unchanged. Five repeated damage-and-heal cycles: the bad bytes are kept each time.
- **Read-time verification**: `read`, `conversationLines`, `setAsideTail` read with verification; unverified reads are used only by the scrub, healing, the eviction pre-check, `verify` and the summary catch-up (all intended). `hashAt`/`summary`/`replyEnds` read only the index. The one unverified byte source is `readExtra` (N6).
- **Quarantine never overwrites** (`a7.js`): three rounds give `q1`, `q2`, `q3`, each keeping its own body and index; a plain `setAsideDamaged` in between gets `-4`. The `continue` when a file already exists in the target cannot lose a file because it only fires for a file the aside copy already holds.
- **`torn/`** stayed at 8 files over 20 torn index tails (bounded).
- **Rebuild loop**: `attempt < 2` bounds each load; I found no persisting `NeedsRebuild` after a successful rebuild. A caller retrying a version that throws `corrupt` repeatedly would add two `replaced-index` files per call, but I could not construct a condition that persists.
- **Eviction verifier**: every path goes through `evictBody`; the verifier is consulted after the binding checks; throwing or a non-`true` return refuses.
- **Persisted scrub cursor**: a crash between scrub and cursor save only repeats work; a cursor past the file end resets to 0.
- **Lock crash states** (`a5b.js`): kill -9 of the holder, stale lock plus stale takeover file, stale takeover file only: all recover. Same-process second open with the first never closed: refused (fail loud). A process that never calls `close()` leaves a lock the next process takes over (pid dead).
- **My own crash sweep over the new operations** (`a12.js`, process kill, power loss and both, every operation): rebuild after record rot, rebuild after stamp change, quarantine, `setAsideTail`, `evictBody`, `setAsideDamaged`: 354 crash points x modes, **zero** losses, zero wrong bytes; outcomes were full, cut-but-preserved (tail or aside), evicted prefix, or `damaged` with the bodies in `aside/`.

## Crash sweep honesty: unsynced unlink and rename-over-existing

The builder says the shim models neither. I tried to build a loss through exactly those gaps and found none for **acknowledged** data:

- Every rename-over-existing is `writeFileAtomic` (temp file fsynced, rename, directory fsynced before it returns). Old-or-new content is legal; both are whole files. The targets are `summary.json`, `scrub.json`, `evicted.json`, `damaged.json`, `aside.intent`; `evicted.json` is the only one whose flip matters, and its write is directory-synced before the first chunk is unlinked, so an acknowledged eviction cannot revert to a state that has lost chunks.
- Every unlink that matters is followed by a directory fsync before the operation returns, and a resurrected file is harmless: a parked file replays (idempotent), a surplus chunk is trimmed to `torn/`, an evicted chunk is removed again, an old `aside.intent` is completed by `finishAside`.
- Truncates are all followed by an fsync (grep of every `truncate(`), so the shim's "cut back to last sync" model covers them.
- Smaller effects found: (1) `rebuildIndex` unlinks `scrub.json` without a directory sync, so after a power cut a stale mark from the OLD index can come back and claim lines verified under the new one (one extra pass; part of N3). (2) A rename across two directories (`moveAway`, `finishAside`) is fsynced in both directories only after the move; a power cut inside that window can persist either end first. Both ends are covered by the intent file or the `parked/` retry, and the moved bytes are junk or kept. (3) Reordering of unsynced writes between files is covered by fsync ordering everywhere I looked (body before index).
- Remaining unmodelled risk is the file system itself: real disks that lie about fsync, and ext4/btrfs/APFS/NTFS differences (UNVERIFIED; tmpfs here).

## API: what changed and what the replicator must do

Changed behaviour that can trap a caller:
1. `open` takes the lock and throws `store-locked` (never retry in a loop; surface it; call `close()` on every shutdown or the same process cannot reopen).
2. Argument errors now reject (use `.catch`). `read` past the head rejects `bad-argument` (a cut by `setAsideTail` between `head()` and `read()` can trigger it: re-read the head and retry). `pause_turn` is no longer a reply end.
3. `read` rejects `corrupt` for a damaged body (it used to serve it). That is a signal to request the line from a peer and `append` it, not to drop the peer.

What the replicator must do to use the store safely:
- **Never trust its own cursor over the store's head.** The adapter state is persisted by the caller; the store can legitimately end up shorter (torn tail trimmed, a version quarantined, tail cut). Persist adapter state only after `append` returns, and at start compare `adapterState.lines` with `head().lines` and `hashAt(adapterState.lines)`; if the store is behind, restart the adapter from the store head.
- **Schedule `scrubStep`** for every version (the store never does) and read `head().damagedFromLine`; until N3 is fixed, do it also when a version is idle.
- Treat `damaged` (quarantine) as "serves nothing"; do not call `setAsideDamaged` until a peer has the lines (there is no restore from `aside/`); never call it on a healthy mismatch, each call moves a whole copy into a never-pruned folder.
- Handle `parked-full`, `limit`, `bad-argument` (fromLine too far) and treat a `parked` acknowledgement as provisional until the head reaches it (N12).
- Compare `Head.classifierStamp` before comparing conversation hashes; plan for N4 before evicting anything.
- Supply a real `proofVerifier` (default refuses everything) and call `evictBody` only with proofs it has checked itself.
- `appendControl` now requires `id == SHA-256(body)`: confirm that is how the control-log design computes the entry id before wiring (it is a hard `bad-argument` otherwise).
- Budget disk for `aside/`, `rejected/`, `tails/`, `replaced-index/`, `healed/`, `extras/` (N11).

## UNVERIFIED

Electron/Chromium profile lock stopping a second app instance (carried over); Android lock behaviour and `process.platform` there; Windows and macOS lock liveness and directory fsync; hard-link-less file systems (FAT, exFAT, some SMB/NFS); Electron 44's Node treating a GC-closed handle as an error; real-disk fsync cost and power-cut ordering (all tests and my sweeps run on tmpfs); behaviour on a file system without `O_EXCL`/`link` guarantees (NFS v2/old SMB); N15 and N11 at scale (reasoned, not run).

## Scratch scripts (all in `/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-2/`)

| Script | What it did | Outcome |
|---|---|---|
| `a1.js` | one body flip + (header flip / index deleted / index cut to 8) | rebuild accepts wrong bytes, verify ok (N1) |
| `a2.js` | one body flip + stamp change; index flip + body flip | whole version quarantined (N7) |
| `a3.js`, `a15.js` | scrub with growth; stale cursor after a cut | never wraps (N3); stale cursor only one pass late |
| `a4.js` | control log length-bit flip | 10 entries become 3 (N2) |
| `a5.js`, `a5b.js` | 12-process stale-lock race x 3 shapes; lock leftovers, kill -9, other host, reuse | one winner always; N9 lock-out cases |
| `a6.js` | resend attacks on good and rotted bytes | cannot replace good bytes |
| `a7.js` | repeated quarantine, torn growth | no overwrite, torn bounded at 8 |
| `a9.js`, `a9b.js`, `a16.js` | adapter edits behind cursor, mtime restore, symlink/FIFO/inode swap | N13; L3 fixed |
| `a10.js` | ENOSPC on the scrub-mark write; extras bit rot | N5, N6 |
| `a11.js` | evicted prefix + stamp change | N4 |
| `a12.js` | crash sweep, 6 new operations, 3 fault modes, 354 points | zero loss |
| `a13.js` | open-handle tracking over crash points | one leak site (N10) |
| `a14.js` | garbage small JSON files | listVersions throws (N8) |
| `e1.js`, `e2b.js`, `v1.js` | first-round demos re-run, eviction/parks/classifier checks | C1, H1, H2, H3, H4, M4, M5, M6, L2, L4 fixed |
