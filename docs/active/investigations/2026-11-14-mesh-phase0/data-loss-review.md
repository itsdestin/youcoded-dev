---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0 — independent adversarial review of design.md for data loss and safety
---

# YouCoded Mesh — data-loss and safety review

Reviewer stance: someone who did not write the design, trying to lose a finished reply or a file edit. Read in full:
`docs/active/design/2026-11-07-mesh-sync/design.md` (1,412 lines). Code facts were checked in
`youcoded/desktop/src/main/` where noted. No prototype was run. Anything not run is a reading, and says so.

**Verdict: PARTIAL.** The design's core is careful: the store keeps its own bytes (4.2.2), an acknowledgement is only "through line N
without holes" (5.3), takeovers happen at reply ends (5.4), tails are set aside rather than thrown away, pairing never
deletes (2.4), `becomeHost` is safe to repeat (5.4). But there are several sequences that lose finished work with no rule
stopping them (section 4 ranks 12), and **14 places where one part of the design contradicts another** (section 3). The worst: an
acknowledgement from a device that has since been wiped still lets other devices evict (D-1); the old copy of a chat
after a file rewrite is deleted after 30 days and was never copied (D-9); work done in a terminal on a device that is not the
host is never read and then replaced (D-7); every 30-day timer reads the device's own clock (D-16).

Format per path: **Design says** (section), **Sequence that loses data**, **Already prevented?**, **Invariant and test**.
Invariant IDs `INV-n`; test IDs `LT-n` ("loss test"), proposed as additions to section 9, to run in the T1 rig.

## 1. What is already right (so builders keep it)

- The store is separate from runtime files and keeps its own bytes (4.2.2). Do not weaken.
- Eviction needs an acknowledgement from another device, not a keeper (5.8, 8.10), and never for a chat hosted here.
- An acknowledgement means "durably stored, no hole" (S3). Keep fsync-before-ack as a stated requirement (see D-17).
- Takeover names a reply end; lines beyond it are set aside, never deleted on arrival (5.4).
- A tail holding a finished reply becomes a version (5.4 table).
- Release by the relay is announced and marked so the writer treats those lines as undelivered again (5.6.3).
- Pairing "never deletes anything" and clash copies keep both (2.4, 2.8).
- Edit beats delete for project files (2.8).
- Old working files are kept aside, not removed, at `becomeHost` (5.4) (but see D-6, D-7).
- A file that grows past 50 MiB is un-staged, and the old committed version stays on peers (checked:
  `git-transport.ts:629-650`, `git reset` of the staged oversize file leaves HEAD's version); no delete propagates.

## 2. Path by path

### D-1 "Recent" eviction (2.2, 5.8, S9)

- **Design says.** On "recent", lines and extras of chats unused for 30 days may be evicted. Never evicted: a chat hosted here, and any line "no other device has acknowledged". Chain values stay.
- **Sequence.**
  1. Phone P (recent) and tablet Q (recent) both hold chat X, hosted on desktop D.
  2. P acknowledges what Q sent and Q what P sent: both "acknowledged by another device".
  3. After 30 days both evict X's lines. D is the only holder.
  4. D's disk dies, or D is a reinstalled Android or a Windows machine reset; the relay released X at 30 days (5.6).
  5. X exists nowhere. Everything the design says about this ("exists only on the device that wrote them", 2.5) is about lines the relay let go, not about acknowledgements that came from other evicting devices.
- A second variant: the acknowledging device was **wiped** (Android uninstall: "data was wiped (always, after an Android uninstall)", 5.1 Reinstalling). Its roster entry stays until removed or the 30-day offer is accepted. Its old acknowledgements remain "valid", and every other recent device that evicted on the strength of them lost the only copy.
- **Prevented?** No. The rule says "another device", not "another device that will keep it".
- **INV-1 (anchor).** A device may evict a line only if a **keep-everything device or a super-host that is currently on the roster** has acknowledged it, and it has just **re-proved possession**: at eviction time the evicting device sends the anchor a random range `[a,b]` of the chat and the anchor returns the SHA-256 of its own bytes for that range under a fresh nonce. If no anchor is reachable, the device does not evict (disk pressure is surfaced to the user instead). Acknowledgements from removed or reinstalled devices (a new `hello` session with an empty head table, or a reinstall `add`) never count and are retroactively void for that device's incarnation.
- **LT-1.** Rig: P, Q recent; D keep-everything. Evict on P and Q, wipe D, assert at least one of {P, Q, D's backup} still holds, or that eviction never happened. Variant: Q uninstalled before P evicts.
- **Also:** a device with only "recent" peers must show "N chats exist only on this device" in the chat list (visible in the existing "waiting" label slot) rather than a silence that looks like safety. (User-visible: Destin.)

### D-2 Relay release: 1 GB, 30 days after last line, 90 idle days, signed drop (2.5, 5.6)

- **Design says.** Frames dropped once every roster device has received them, 30 days after last line, or by LRU at 1 GB; registers kept with no limit; whole room erased after 90 idle days; a signed "drop this group" from any roster device empties it at once. Releases are announced and kept as a mark.
- **Sequence 1 (stale `received`).** The relay drops a frame because every roster device "received" it, where `received` counters are unsealed claims (5.6.3). Device Z's claim was true, but Z's disk was reset afterwards (D-1, variant). The relay's bookkeeping is not evidence. The design already says relay acknowledgement does not permit eviction (5.8), so the loss needs two failures: Z wiped and the writer's device lost.
- **Sequence 2 (hostile or buggy `drop`).** Any roster device, including a stolen unlocked one or one with a bug, signs `drop` for 400 groups. All waiting lines for devices that were offline vanish at once. The writers hold the lines; the mark only applies to *releases*, not `drop`. A `drop` for a chat that is not deleted leaves writers unaware.
- **Sequence 3 (90 days).** User on a long trip, all devices off 91 days. The relay erases the room. Devices register again by themselves (2.5). Whatever the relay held was already on a device. Lost: the `del:` registers, so a device that missed a deletion cannot learn it from the relay (see D-5).
- **Prevented?** Partly. Sequence 1 is covered by INV-1. Sequences 2 and 3 are not covered.
- **INV-2.** `drop` is honoured by the relay only for a chat whose `deleted` control entry the relay holds, or for a project the roster says is removed; otherwise the relay treats it as "release" (announced and marked). **INV-3.** After the relay erases or restores a room, every writer re-offers every line whose latest signed acknowledgement from an anchor (INV-1) is missing, as if released.
- **LT-2.** Signed `drop` of a live chat; erase then re-register; assert writers resend.

### D-3 Quit rule and the "relay counts" wording (2.6 vs 5.8)

- **Design says.** The app quits at once when "every finished reply has reached another device, the relay or the super-host" (2.6). Relay acknowledgement does not permit eviction but counts for the quit rule (5.8).
- **Sequence.** Phone is the only host. It quits, believing the relay has the reply. The relay has it, then releases at 1 GB overnight (release is announced; the phone is off and never hears the announcement or the mark). The phone's own copy is intact. Safe as long as the phone is not lost. Danger only with D-1/D-12.
- **Prevented?** Yes for the phone's own copy. Not for the user's *belief*: the line "Offline - some chats may not have synced" is absent in this case, so the user may uninstall or hand in the phone believing the reply is safe.
- **INV-4.** The quit rule says "reached **a device**, or is in the relay and an anchor will collect it". The relay alone is a "waiting" state, shown in the list and before Remove/Sign out/Uninstall. Android: the uninstall-risk is addressed in D-12.

### D-4 Tails set aside, then removed after 30 days (5.4)

- **Design says.** A takeover names the last reply end held by the taker; lines the previous host wrote beyond are its tail, set aside everywhere. Tail table: only an unfinished reply: set aside 30 days then removed. One or more finished replies: a second version. Unknown (old host has not spoken): set aside, waiting. "Lines in the tail after its last reply end are an unfinished reply."
- **Sequence 1 (the end marker decides everything).** `isReplyEnd` is each runtime's own marker (the event the app treats as `turn-complete`, 5.3). Cases where a reply looks finished to the user but may not carry the marker: user interrupt (Esc), a tool error that ends the turn, an API overload message ("Overloaded"), a max-token cut-off, a hook that stops the turn, a compaction event, a `/clear`, a session killed by the OS after the final text was written. If any lacks the marker, a **finished reply is classified unfinished** and is removed 30 days after the takeover on every device. Nothing in the design lists the cases; T2 tests non-append events, not turn endings.
- **Sequence 2 (the clock).** The 30 days run on each device's own clock (D-16). A clock jump forward removes tails early.
- **Sequence 3 (the contradiction).** 2.7 says "The unfinished reply is dropped", and the table says set aside 30 days; 5.4 later says "A tail holding a finished reply is never thrown away". The three statements agree only if classification is perfect.
- **Sequence 4 (remover cannot see the tail).** "If the previous host is removed without speaking, the remover appends `released` on its behalf naming the longest tail any reachable device holds." If only the removed device held the tail (the lines never left it), the remover names nothing. The tail's classification is then "unknown", and the removed device's real tail (maybe finished replies) is unreachable. After removal, 2.4 says what the device wrote and had not sent "is lost unless paired again".
- **Prevented?** No.
- **INV-5.** (a) Removal of a tail requires that **the device that wrote it has acknowledged the `released`** naming it, or 90 days have passed since the takeover on the timer rules of INV-9. (b) The writer of a tail never deletes its own original until all roster devices have it or its owner chooses. (c) Any tail whose last line is not a *positively recognised* mid-reply state (a tool call awaiting its result, or assistant text with a still-streaming marker) is classified **finished** (fail toward keeping). **LT-3**: enumerate every way Claude Code and the native runtime end a turn from the real transcripts on Destin's desktop (read-only) and in a rig (interrupt, error, overload, kill -9 after last text). Each ending is classified; none ends in "removed".

### D-5 Delete and Recently deleted (2.1, 5.4)

- **Design says.** `deleted` is also held in a `del:` register on the keeper "so that a device returning after any length of time learns of it before sending anything; that register is removed when the 30 days are up". Each device removes the body "30 days after the later of the entry's time and the moment it first saw it, and keeps the entry". The deleting device tells the relay to drop waiting lines.
- **Sequence 1 (all devices purge on the same day).** Any one device (or a stolen one, or a bug, or a mis-tap on a list) deletes 212 chats. Every device, offline or online, deletes the bodies 30 days from its own first sight. There is no longer hold on any device, no keep-everything exception, no bulk friction. The most destructive action in the whole system has the weakest guard.
- **Sequence 2 (unsent work meets a delete).** A laptop is offline for two weeks and writes finished replies in chat X while a phone deletes X. On return: "A device returning with unsent lines for a deleted chat keeps them in its own Recently deleted and sends nothing". They are removed 30 days after the laptop first saw the deletion. Intended. But the user who restores X at day 20 gets X **without** the laptop's finished replies unless restore also pulls the laptop's deleted-copy. The text says `restored` names the `deleted` it undoes; it does not say restored chats include the late lines held only in another device's Recently deleted.
- **Sequence 3 (`restored` after bodies are gone).** The device that restores has removed its body (30 days after its own first-sight); another device removed earlier; if no device has the body, `restored` brings back a chat with chain values and no lines. The design has `restoreBody` (S2) but not what happens when no peer has the bytes.
- **Sequence 4 (clocks).** See D-16: a forward clock jump removes Recently-deleted bodies early.
- **Sequence 5 (working files).** The text says "each device removes the body", which reads as the store. It does not say what happens to the **runtime file** `~/.claude/projects/<slug>/<id>.jsonl` left there by earlier hosting, nor to extras (`subagents/`, `tool-results/`, `plans/`, `todos/`). If left, the adapter on a host may re-ingest it and the deleted chat reappears under the same id. If removed, it is removal of a file Claude Code (not the store) owns.
- **Sequence 6 (`del:` after 30 days).** A device that returns on day 31 or 100 learns of the deletion only from peers' control logs, not the relay (register removed). If it reaches only the relay, it re-uploads lines for a deleted chat and resurrects it.
- **Prevented?** No for 1, 2, 3, 5, 6.
- **INV-6.** (a) Recently deleted is **per device and never shorter than the longest hold any online keep-everything device chooses**, and a **bulk delete** (more than 5 chats from one device within 10 minutes, or any delete of a chat used within 7 days) is held **24 hours** on other devices with an "Undo" notice before the relay `drop` or any body removal begins. (b) `restored` carries "include late lines from each device's own Recently deleted" and, when no peer has the body, the chat shows "stored on <devices>, offline" rather than an empty chat. (c) The `del:` register is retained as long as any roster device could still be unaware: until every roster device has acknowledged the `deleted` entry, or 400 days. (d) Delete never touches runtime files or extras of other versions; it removes only what the mesh itself wrote (marked by a sidecar record), and the adapter ignores any runtime file for a version marked deleted. **LT-4:** delete then restart each device; the chat does not reappear. Delete 212 chats from device A; nothing is removed anywhere for 24 hours; undo restores all. Restore after the late-lines scenario.

### D-6 Becoming host: "replace the working file from the store, keeping any old one aside" (5.4)

- **Design says.** `becomeHost` writes a fresh working file from the store; "keeping any old one aside". Crash at any step is safe.
- **Sequence 1 (unread lines).** Laptop L was host of X, went to sleep; phone took over (tail set aside on every device); L wakes, the user runs `claude --resume` **in a terminal** before the app has checked (the app's launch check runs "before any hosted chat continues or is resumed" for chats the app runs, 5.9; a terminal start bypasses it). Claude Code appends lines to L's working file. Later L hosts X again: the working file is replaced; the "old one" goes aside. Where is "aside", and who removes it? The design does not say. If aside means inside `~/.claude/projects/` it is exposed to Claude Code's own cleanup and to the app's own scanning for chats (it would show as a stray chat). If aside means the mesh store, nothing reads it.
- **Sequence 2 (never ingested).** The lines written in a terminal on a non-host device are in no store: S1 says the adapter "runs only on the host" (6.1). So they have no `claim`, no tail, no version. Replacement then makes them invisible to every device; the file sits aside forever, unlisted.
- **Prevented?** No.
- **INV-7.** Before any working file is replaced or any `becomeHost` step, the adapter runs once over the file. If the file contains lines not in the store (or `not-a-prefix`), they are ingested as a **tail or a version** on this device (not silently merged), and the notice shows "Lines written here outside the app were kept as a separate version." The old file is moved to `~/.youcoded/mesh/aside/<version>/<timestamp>/` (outside Claude Code's folder, which `cleanupPeriodDays` cleans and which the app scans), listed in "Check sync", and **never deleted automatically**. **INV-8.** On a non-host device, a watcher (file-size/mtime poll, same as the transcript watcher) notices growth of a runtime file for a chat in the store that this device does not host, and ingests it as in INV-7. **LT-5:** terminal-resume on a non-host device writes two finished replies; become host; both replies appear as a version on every device.

### D-7 Non-host runtime-file writes (extension of D-6)

Covered by INV-7 and INV-8. Add: the existing app hook that tells a terminal session "this chat is now hosted on Phone" (5.3) is advice, not enforcement; the user may ignore it and keep working. The work must not vanish because the user ignored a hint. (User-visible: a notice naming the chat. Destin reviews wording.)

### D-8 `not-a-prefix` handling (5.3)

- **Design says.** The device re-hashes its own bytes; if they no longer match its chain, "the copy is damaged: set aside and recopied". Otherwise the control log decides (an old host's tail or a second version). "If the log explains nothing, a non-host sets its copy aside, recopies from the host, and records a diagnostic."
- **Sequence 1 (the set-aside has no rule).** Set aside for how long? Where? Shown to the user? Unspecified. Contradicts 4.2.3: "Nothing is deleted or merged on a guess"; here the recopy discards the non-host's version of events, and "if the log explains nothing" is by definition the case where the design does not know what happened.
- **Sequence 2 (who is "the host").** A pending `decide` (5.4) or a stale host register makes the wrong device "the host". The non-host recopies from the wrong source and its *unique* lines are set aside with no retention.
- **Sequence 3 (a lying answer).** `not-a-prefix` is "answerer's hash at N". An answerer without a host head signature (see threat model C-1) can make honest devices set aside good copies. Every honest device recopies from the same liar.
- **Sequence 4 (damaged copy).** "Damaged" is a disk-side judgement: a bit flip, a truncated tail after a power loss. Setting aside is right; the replacement may come from a device that is also behind. The set-aside copy is the only whole copy until the recopy completes.
- **INV-9.** Set-aside copies (damaged, `not-a-prefix`, tails, old segments, void lines) share **one retention rule**: kept until (a) an anchor device has the same lines or a longer chain containing them, **and** (b) the user can see them in "Check sync", **and** (c) at least 90 days have passed on a trusted clock (X-5). Never deleted while they contain a reply end the live chain lacks. Lines unique to a set-aside copy that form a complete reply are offered as a version. **LT-6:** feed a device a forged `not-a-prefix`; its good copy survives and is listed. Truncate a store file at every byte offset of the last line; recovery keeps all complete lines.

### D-9 Segment rewrite: "old segment kept 30 days and copied nowhere" (5.3)

- **Design says.** A new segment starts when the runtime rewrote or shrank its file; it is the whole chat again from line one. The old segment is kept on the host for 30 days and copied nowhere. "This has not been seen in Destin's chats; T2 checks it."
- **Sequence 1 (compaction that rewrites).** Claude Code, today or in a later version, rewrites the transcript during `/compact` or resume. The old segment is the *only* full pre-compaction transcript, anywhere. After 30 days it is deleted, and the runtime's file never had it again. This contradicts 2.3 ("A chat's lines, whole") and the reason the store exists (4.2.2: "because Claude Code deletes old transcript files"). The old segment is the case the store was built for.
- **Sequence 2 (damaged file).** A file shrinks because the disk filled, an antivirus quarantined a block, or the runtime crashed mid-write. The "new segment" is the damaged file; the old segment is the only good one. Deleted at day 30 by a clock rule.
- **Sequence 3 (one copy).** Copied nowhere, so a lost host loses it, and no other device's `ensureBody` can find it (S9).
- **Prevented?** No. **Contradicts** 4.2(2), 4.2(5), 2.3.
- **INV-10.** Old segments are **replicated like any lines** to anchors (keep-everything devices) and **never deleted automatically**; storage cost is shown in "Check sync" and the user may free it. If storage cost is the concern, delete requires INV-9. **LT-7:** truncate a runtime file, append a new line, assert the old segment is on an anchor, and after 31 simulated days (clock rules X-5) still present.

### D-10 Removal voiding unsent work (2.4, 5.1, 4.3 D)

- **Design says.** Removing a device "keeps what it already holds and can be paired again. Anything it wrote and had not sent is lost unless it is paired again" (2.4). 5.1: what a removed device signs beyond the cut-off is **void everywhere**; a removed device paired again "gets a fresh `add`, which stands"; a void entry loses only its own effect.
- **Sequence 1 (honest remove).** A laptop is off in a drawer for 33 days with three days of finished replies it never synced (it was on a plane, no wifi). The 30-day offer fires on the phone; the user taps yes ("old device"). The laptop's lines are beyond the cut-off, so void.
- **Sequence 2 (ambiguity).** 2.4 says "lost unless paired again", but nothing in 5.1 un-voids lines. A re-pair gives a fresh `add`; the earlier lines are still beyond the earlier cut-off. Either the lines come back (then "void" is not permanent and a hostile removed device can re-pair and reinstate everything it forged) or they do not (then "unless paired again" is false).
- **Sequence 3 (the remover's `released`).** D-4 sequence 4: the remover names only a tail it can see.
- **Prevented?** No: the two statements disagree (contradiction K-1 below).
- **INV-11.** Void means **ignored by `decide` and hidden from the chat, never deleted**. Voided lines and the removed device's unsent work stay in storage on every device that has them and on the removed device, and when that device re-pairs (new `add` plus unlock on an existing device) they are offered as **versions** ("Laptop has 3 days of replies that were set aside when it was removed. Add them as versions?"). The removal screen must say, before the yes, what the target hosted and when it was last seen ("Last seen 33 days ago. It may hold replies that never synced; they will be set aside. Remove anyway?") (user-visible). **LT-8:** remove a device holding unsent finished replies, re-pair it, assert the replies come back as versions on every device and that a forged line signed by the removed device beyond the cut-off is *offered* as a version only on explicit user choice, not included automatically.

### D-11 Pairing combine, set joins, project clashes, edit-versus-delete (2.4, 2.8, 5.7)

- **Design says.** Pairing never deletes. Same project: files that differ keep both copies. Same lines edited: both kept; "name (from Device, date)". One edited, one deleted: edit kept. Both renamed differently: both kept. Merge commits fixed so every device derives the same tree.
- **Sequence 1 (case-folding and Unicode).** Device A has `Readme.md` and `README.md`; B is Windows or macOS (case-insensitive). The merge or checkout writes one over the other. Silent loss, not a conflict (no rule in 5.7). Also NFC/NFD on macOS (`é`), reserved Windows names, trailing dots. See threat model G-4.
- **Sequence 2 (uncommitted local edits).** B is typing; the wait is "about 2 s" (5.7). A's bundle arrives and the merge touches the same file. Git refuses to overwrite a dirty file, so the engine must either commit first (a half-typed edit becomes a commit; fine) or fail. The current engine commits then merges; the new carrier must keep that order. Not verified in the new design (UNVERIFIED). A `reset --hard` or `checkout -f` anywhere in the carrier loses unsaved edits; searched `git-transport.ts`: no `reset --hard`, no `checkout -f` found (command: `rg "reset', '--hard|--hard|checkout', '-f|--force" sync-spaces/git-transport.ts` returned only `git add -f` (line 920) and `git rm --force` (line 945)). `git rm --force` on line 945 is today's conflict step "deleted remotely: deletion wins canonical (ours survives as the copy)", and the copy is written first (lines 935-937), so nothing is lost today. The new rule is the opposite (edit beats delete, 2.8): the rewritten conflict code must keep the write-the-copy-first order, pinned by LT-9.
- **Sequence 3 (the "same project?" question).** User says "same" for two unrelated folders that happen to share a name (5.7: "the lower id stays and the other becomes an alias"). Files with the same path but different content keep both copies, no loss. But the **combine** step uses `--allow-unrelated-histories` (today's code, `git-transport.ts:895`). A project's `package.json` from two projects now lives in one folder as a "(from Device)" pair. Not data loss, but confusing and hard to separate. No undo.
- **Sequence 4 (set joining).** The joined sets have different generations; a companion Q that was off moves over "when it next comes on" via a sealed message in the old set's mailbox. The old set's room "empties as its devices move and is erased by the 90-day rule" (5.1). Mailbox retention is not stated (only chat groups have a 30-day rule). If Q comes on after the room is erased or the mailbox aged out, it never learns of the new set. It is stranded with its own data and its own unsent work, and the new set lists Q as a member it cannot reach. Not loss on Q's disk, but the new set's "waiting" bookkeeping for Q (lines held for Q at the relay) can drop on the 30-day rule while Q never received them.
- **Sequence 5 (a file that becomes ineligible).** A tracked file that newly matches `NEVER_SYNC` (renamed `.env`) is un-staged. The old name looks deleted; peers delete it. Intended. A file whose name case changes (`.ENV`) is not matched (threat model G-7) and leaks. Not loss, but the opposite problem.
- **INV-12.** (a) A carrier import never overwrites an existing path: colliding or unrepresentable paths are materialised under distinct names and reported. (b) The engine commits local changes before it merges, and no carrier call may discard working-tree changes; asserted by a test that edits a file during a merge window. (c) Mailbox retention for a joining message is at least 400 days and never shorter than the old room's life; a stranded companion is shown in the new set as "has not joined yet". **LT-9:** 2-device rig on a case-insensitive filesystem (or a simulated one) with `A.txt`/`a.txt`, NFC/NFD pairs, Windows reserved names; edits during merge; every file's bytes found somewhere.

### D-12 Reinstall and uninstall (5.1 Reinstalling)

- **Design says.** Data survives: same machine id, re-pair replaces the entry with no extra question, chats it hosted stay with it. Data wiped (always, after an Android uninstall): a new device, the old entry goes by removal or the 30-day offer, "after which its chats can be continued elsewhere".
- **Sequence.** User uninstalls and reinstalls the Android app to fix something. All chats hosted on that phone, and every unacknowledged line, are gone. Before that, other recent devices evicted on this phone's acknowledgements (D-1). The old entry still counts as a holder in head tables ("stored on Phone"). For up to 30 days the others show chats as "stored on Phone, offline", and "Continue here" is offered only after the old entry is removed.
- **INV-13.** Android uninstall protection: before first run after reinstall, the app asks "Restore from your other devices or cloud backup?" and the mesh treats a reinstall as a *new incarnation* (INV-1) so acknowledgements stop counting immediately and the other devices **mark the old entry "wiped" within one round trip of the new device's `hello`** rather than after 30 days. A one-line warning before uninstall is not possible on Android; compensate with the "N chats exist only on this device" label (D-1) and with Android `allowBackup`/cloud backup settings stated in the setup screen. **LT-10:** reinstall rig; the old acknowledgements are ignored; the chat list shows the right holders.

### D-13 The switch-over (2.9, 7.3)

- **Design says.** "A device switches when it is updated." It runs one last ordinary sync then never pulls. It then pushes only `mesh-backup/<device id>`. Devices update at different times; until all are updated and paired, the two groups do not exchange. "Nothing is lost."
- **Sequence 1 (last sync fails silently).** The last ordinary sync can fail (offline, auth expired, a 4 GB repository, GitHub push limits). If the code proceeds to "never pull" anyway, chats continued on the other device since the last successful pull exist only there and on GitHub's `main`; the one-time restore reads `main` and every backup branch, so recoverable by hand. Acceptable only if the restore is offered **to a paired device too** (7.3 offers it only on devices "not yet paired with another").
- **Sequence 2 (A and B update on different days).** A switches Monday. B continues on GitHub two-way until Friday and does not see anything A wrote Tuesday to `mesh-backup/A`. On Friday B's last ordinary sync pulls `main` (A's Monday state), then B "never pulls again". A's Tuesday to Thursday work is on `mesh-backup/A` only; B sees it **only after pairing**, and only the one-time restore (not offered once paired) or the ordinary combine on pairing can fetch it, which depends on A and B being on together or on the relay carrying it. A chat continued on both sides appears as two versions. Matches the design's statement; but "Nothing is lost" requires pairing to happen. If A is lost before pairing, its Tuesday work survives only as `mesh-backup/A` on GitHub; the **restore must be available after pairing**.
- **Sequence 3 (backup silently stale).** The interim lane pushes whole stores to GitHub; repositories are already 4.28 GB (7.3). A push that fails (size limit, rate limit, token expiry) must not read as "backed up". A one-device user told they have a GitHub backup may have none.
- **Sequence 4 (names and flags).** Conversions at the switch (2.9, 5.4: names and flags move into control logs) happen once; names or flags set on a not-yet-updated device after A switched are in `ConversationNames/` on `main` that A no longer reads. Minor loss of user labels, not chat content.
- **INV-14.** (a) "Never pull" begins only after a **successful** last sync, else the device stays on the old system and says so. (b) The one-time restore is available on any device at any time (adds only, prefix rule, S11) and states "N chats on GitHub are not on this device". (c) Backup status shows "last successful upload" and turns amber after 48 hours; a failed push is never silent. **LT-11:** rehearse A-then-B updates with the old system active on B; kill the last sync midway; assert every chat is findable on every device or in the restore's list.

### D-14 Rollback (7.3)

- **Design says.** Later release turns the switch off, each device writes its store back into `Personal/Conversations/` (records rebuilt from control logs; deleted chats left out), ordinary GitHub sync resumes with conflict copies.
- **Sequence 1 (writing a shorter file over a longer one).** A "recent" device's store lacks old chat bodies (D-1). "Writes its store back" for a chat whose body is evicted either writes a stub or skips it. A stub pushed to GitHub in ordinary sync replaces the full file on `main` HEAD for every old-system device; a conflict copy path preserves the other side, but the stub wins the name.
- **Sequence 2 (deleted chats "left out").** A chat deleted inside the 30 days is omitted. Two-way sync treats absence as no change, not as deletion (no tombstones in the old system, 3.2: "No chat can be deleted ... today"), so the chat remains on `main` and returns on every old-system device.
- **Sequence 3 (versions).** The old system has no versions; a version written as `<id> (from device, date)` copies is the old conflict style (3.2). Which wins the name is arbitrary.
- **INV-15.** Rollback writes a chat file only if it is **at least as long as and has as a prefix** what the destination has; evicted chats are skipped, not stubbed; versions go out under the old conflict naming; deleted chats are listed in a report file for the user. **LT-12:** rollback rehearsal in Phase 7 with a recent device, a deleted chat, and two versions; every file on `main` after is at least as long as before.

### D-15 Claude Code's own `cleanupPeriodDays` (4.2.2, 3.1)

- **Design says.** The store holds its own bytes because Claude Code deletes old transcript files (`cleanupPeriodDays`).
- **Facts.** The app seeds `cleanupPeriodDays = 365` only when the key is absent (`retention-default.ts:26-40`; an explicit user value is respected, even a short one). Claude Code deletes by file age at its own start.
- **Sequence 1 (before ingestion).** A chat that lives only as a Claude Code file on a device (never run under the app, terminal-only) with `cleanupPeriodDays` at 30: Claude Code deletes it on its next start before the mesh first indexes it (first-run indexing, 4.3 A step 1, runs once at pairing/first run, not continuously). The design's "every chat on disk is indexed" covers only what exists at that moment.
- **Sequence 2 (becomeHost resets the clock).** `becomeHost` writes a fresh working file with a new modification time; Claude Code's cleanup then keeps it. Fine. But a working file left from an earlier hosting on a device that is no longer host ages out and is deleted by Claude Code. Fine **only** because the store has the bytes (INV-7 requires that the adapter run before it is relied on).
- **Sequence 3 (aside files).** Old working files kept aside inside `~/.claude/projects/` age out under Claude Code's cleanup and may contain unique lines (D-6). INV-7 puts them outside.
- **INV-16.** The adapter runs continuously on every device for every runtime file it can see (host or not, INV-8), not only at first run, so a file is ingested within seconds of appearing; and the mesh start-up check warns when `cleanupPeriodDays` is shorter than 30 on a device that is the **only** holder of lines. **LT-13:** set `cleanupPeriodDays` to 1 in a rig home, write a terminal chat, advance mtime by two days, start Claude Code; the chat is in the store first.

### D-16 Clocks on every 30-day rule (5.2 vs 5.4, 5.8)

- **Design says.** "Correctness never depends on comparing two devices' clocks; only two display matters do (which version is 'older', and whether a chat is 'recent')." But removal of Recently-deleted bodies (30 days from entry time or first seen), tail removal (30 days), old segment removal (30 days), "recent" eviction (30 days) and the 30-day-unseen offer all read a device's own clock. T12 requires "identical ... delete dates everywhere" but the rule uses "first saw it", which is local.
- **Sequence.** Phone's clock jumps a year forward (user changes timezone settings, a dead CMOS battery on a PC, a VM snapshot restore, NTP failure, a hostile `at` on a signed entry). All timers expire at once: Recently-deleted bodies, tails, old segments, evictable chats; combined with D-1 this removes data that was meant to stay for weeks.
- **INV-17.** (see threat model X-5) Every clock-driven removal needs two agreeing time sources and a count of days the app actually ran; a jump of more than 1 day between launches pauses all timers and shows a notice. `lastLineAt` for "recent" is the receiving device's first-seen time. **LT-14:** jump the clock forward 400 days, back 400 days, in each direction at each step of D-4, D-5, D-9; no body is removed early.

### D-17 Other paths walked

- **Disk full / acknowledgement before durability.** S3 says an acknowledgement means "stored durably". INV-18: fsync the store write before acknowledging, and refuse to acknowledge on `ENOSPC`; on a full disk, the host shows "Out of space. New messages may not be saved" instead of dropping lines. **LT-15:** fill the disk in the rig during a reply.
- **Chip switch and fence (5.4).** The old host "refuses forwarded messages with 'handed over'" while the new host starts. A message typed during the fence stays in the box (2.1). Verified in text; add the test: type at every millisecond of the hand-over, assert exactly one of {delivered, kept in the box}.
- **Hold across sleep (5.9).** The block answers "wait" to Claude Code's pre-action hook; if the hook times out, Claude Code proceeds (hook-timeout behaviour is T19's question). A reply that proceeds after sleep on a host that has since been replaced edits project files that the new host also edits. Files merge by the project rules (no loss), but a **second reply running** on the old host writes to the chat's working file that INV-7 replaces: handled by D-6.
- **Delete during a running reply on another device (2.1).** "Stops a reply running in it." The host stops the reply and its lines are kept in Recently deleted (5.4 text). Fine.
- **Relay over 1 GB mid-write.** Release of "whole groups" while one group is being written (5.6: never the writing group "while another remains"). If it is the only group, the new frames are refused ("over-limit") and the writer keeps them (S3 retry). Fine; add test T14 variant.
- **A watcher "sent" confirmation (5.5).** The watcher keeps the text until the host confirms the line. A host that stores the line then dies before confirming: the watcher resends; duplicates by `callId`. Fine; the id store must persist across host restart (threat model S-7).
- **Version fallback for old apps (5.11).** "Unknown entry and frame kinds are kept and passed on, never dropped". A bound on storage is needed (threat model L-7). A too-old device that cannot parse `deleted` still holds bodies after others deleted: no data loss, only a privacy delay.
- **Interim restore adds only (S11).** Fine.
- **Android battery limits.** A long reply on the phone killed by Android mid-write: partial last line is "not ingested" (S1: a trailing partial line is not ingested). Fine.
- **Finished replies written on a device when the app was not running** (a terminal run): D-6, D-7.
- **Extras on `recent` eviction (2.2, 5.8).** Helper working files evicted; "helpers' reports are kept but unfinished helper work cannot be continued" (2.2). The design says reports are kept: only if those live in lines or the content-hashed extras. A helper's working file with partial output is an extra that "grows" and is evicted with the chat. Accepted by 2.2 but the notice must name it.

## 3. Statements in the design that contradict each other

| # | Statement A | Statement B | What to decide |
|---|---|---|---|
| K-1 | 2.4: what a removed device wrote and had not sent "is lost unless it is paired again" | 5.1: what it signs beyond the cut-off is void everywhere; no un-void path; "fresh `add` ... stands" | INV-11: void = hidden and kept, offered back as versions on re-pair. |
| K-2 | 4.2(5) and 8.10: a device does not clear its copy until another device has it; no device clears its only copy on a keeper's word alone | 5.3: old segment "copied nowhere" and deleted at 30 days; 5.4 delete, tails and set-asides removed by timers; `not-a-prefix` copy set aside and recopied | INV-9, INV-10: one retention rule; the universal statement must say which cases are the deliberate exceptions (delete) and nothing else may be. |
| K-3 | 2.3: "A chat's lines, whole" and 4.2(2): the store exists because runtime files lose lines | 5.3: after a rewrite the old segment is kept 30 days, copied nowhere | INV-10. |
| K-4 | 5.2: "Correctness never depends on comparing two devices' clocks" | 5.4 and 5.8: 30-day removals, "recent", unseen offer all use a device's clock; T12 requires identical delete dates though the rule uses first-seen time | INV-17: define the timer source and what T12 compares. |
| K-5 | 2.7: "The unfinished reply is dropped" | 5.4: "A tail holding a finished reply is never thrown away" | Both hold only if `isReplyEnd` is complete (D-4 LT-3). Fail toward keep. |
| K-6 | 5.4 table: "Only an unfinished reply: set aside 30 days, then removed" | 5.4 later: unknown tails wait for `released`; 30-day offer then removal appends `released` naming only what reachable devices hold | Define "unknown" tail past removal: INV-5(a), INV-11. |
| K-7 | 2.5: relay holds "until every device has them, or 30 days" | 5.6: dropped when every roster device has received, but "recent" devices and non-downloading project devices are skipped | State that "every device" means every device that wants the chat; the user message "Relay full" must not read as "waiting for all". Test (T14). |
| K-8 | 5.6: `received` is unsealed and relay-readable (no signature stated) | 5.6 and 5.8: only a signed acknowledgement between devices permits eviction; the relay's counters are not trusted | Consistent only if `received` can never trigger deletion of the only copy (INV-3). Sign `received` (threat model Y-10). |
| K-8b | 8.10: "no device clears its only copy ... on a keeper's word alone" | 5.4: `deleted` is "also held in a `del:` register on the keeper" and devices "learn of it before sending anything" | Fine if the register value is the signed entry (it is). Add: bulk delete friction (INV-6). |
| K-9 | 2.4: "Pairing never deletes anything" | 5.7 and 3.6: pairing merges with `--allow-unrelated-histories`; case-fold and NFC collisions overwrite files on some systems (D-11) | INV-12(a): import never overwrites. |
| K-10 | 4.3 A step 5 and 5.4: copies "identical" means identical bytes, relying on T21 | 5.3: identical-copy hosting decided by `claim ... ranHere`; the design says T21 may not pass | If T21 finds line-ending differences, the combine becomes "two versions" for most chats on day one; Phase 7's quiet combine promise (2.9) fails. Decide before Phase 2. |
| K-11 | 2.9: "GitHub two-way sync is off on that device" at update | 7.3: the old `main` branches are left; restore "offered on any device not yet paired" | Restore must also be available after pairing (INV-14(b)). |
| K-12 | 2.6: quit "at once provided every finished reply has reached another device, the relay or the super-host" | 5.8: the relay's acknowledgement "does not permit eviction, though it counts for the quit rule" | Consistent, but the user reading "Offline ... may not have synced" absent concludes safety (D-3). Word the label by what exists where. |
| K-13 | 2.2: a chat hosted on a phone is never cleared from that phone | 5.1: a phone uninstall is a wipe; a "hosted" chat on a wiped phone is lost | INV-13; no contradiction in text, but the promise is only as good as the phone's storage. |

## 4. Top risks, in order

1. **D-1 Eviction on acknowledgements from devices that may themselves evict or be wiped.** Silent loss of finished replies on the sum of two ordinary events (a recent-device pair, one disk failure). Fix: INV-1.
2. **D-9 Old segment kept 30 days and copied nowhere.** Deletes the only whole copy in the exact case the store was built for. Fix: INV-10.
3. **D-6/D-7 Work done outside the app on a non-host device is never read, then replaced or hidden.** Fix: INV-7, INV-8.
4. **D-16 Local clocks drive every deletion timer.** One wrong clock removes tails, Recently-deleted bodies and old segments early. Fix: INV-17.
5. **D-5 Delete is the most destructive action and the least guarded.** Bulk delete from any device purges everywhere on the same day; restore may return empty chats; deleted-register ages out. Fix: INV-6.
6. **D-4 Tail classification depends on a reply-end marker nobody has enumerated.** A finished reply with no marker is removed after 30 days. Fix: INV-5, LT-3.
7. **D-10 Removal voids unsent work, and 2.4 and 5.1 disagree about getting it back.** Fix: INV-11.
8. **D-8 `not-a-prefix` set-aside has no retention rule and can be provoked by a liar.** Fix: INV-9 and threat model C-1.
9. **D-11 Case-folding, Unicode and reserved-name collisions overwrite files silently.** Fix: INV-12(a), LT-9.
10. **D-13/D-14 Switch-over and rollback: restore not offered after pairing; silent backup failure; rollback could write shorter files.** Fix: INV-14, INV-15.
11. **D-12 Android uninstall.** The most common way a normal user erases a device. Fix: INV-13 plus visible "only on this device" counts.
12. **D-2 Hostile or buggy `drop`** and relay erase vs `del:` retention. Fix: INV-2, INV-3, INV-6(c).

## 5. What this changes in the design (proposed, not applied)

- 5.8 and S9: replace "another device has acknowledged" with INV-1's anchor and re-proof rule.
- 5.3 "Chat store": delete "kept on the host for 30 days and copied nowhere"; use INV-10.
- 5.4 "Becoming host": add INV-7 (ingest before replace; aside outside Claude Code's folder; never auto-deleted). Add INV-8 to 5.3.
- 5.4 "Deleting": add INV-6 (bulk friction, restore with late lines, `del:` retention, runtime files untouched).
- 5.4 tail table: add INV-5 (writer acknowledges; fail toward finished).
- 5.1 "Roster": define "void" as INV-11 and fix 2.4's sentence to match.
- 5.2 "Clocks": replace the first sentence's absolute claim with INV-17.
- 5.6: sign `received`; restrict `drop` (INV-2); re-offer after erase (INV-3).
- 5.7: import never overwrites (INV-12a); stage-before-merge assertion (INV-12b).
- 7.3: INV-14 and INV-15.
- Section 9: add LT-1 to LT-15 (as rows or as acceptance lines of the phase that builds them: Phase 2 for LT-1, 2, 5, 6, 7, 13, 15; Phase 4 for LT-9; Phase 5 for LT-3, 4, 8, 14; Phase 7 for LT-11, 12; Phase 1 for LT-10).
- Section 12: add "Eviction without an anchor" and "Clock-driven deletion" to the risk list.

## 6. Needs Destin (what a user would experience)

1. **"Only on this device" count.** A phone or laptop that holds chats no other device has shows a plain label, "12 chats exist only on this device". Pro: tells users when one lost phone means lost chats. Con: one more thing on screen. Recommended.
2. **Deleting many chats at once waits a day before anything is erased elsewhere, with an "Undo" notice.** Pro: a mis-tap or a bad device cannot erase everything on the same day. Con: storage used for a day longer; deleted chats on other devices are not instantly gone. Recommended.
3. **Removing a device shows what it may hold that never synced.** "Last seen 33 days ago; it may have replies that never synced. They are kept aside and can be added back if you pair it again." Pro: removes the "lost unless paired again" cliff. Con: a longer warning. Recommended.
4. **Old copies of a chat after Claude Code rewrites its file are kept (not erased at 30 days).** Pro: never lose the full history. Con: some extra disk; a line in "Check sync" showing the size and a button to free it. Recommended.
5. **A notice when lines were written in a terminal on a device that is not hosting the chat.** Pro: that work does not vanish. Con: one more notice in a rare case. Recommended.

## 7. Could not test here

- Nothing was executed. Case-folding behaviour (macOS, Windows, Android), clock-jump behaviour, Claude Code's turn-ending cases, and `git rm --force` at `git-transport.ts:945` need the rig.
- Whether Claude Code's hook-timeout lets a reply proceed after "wait" (D-17) is T19's job.
- Android uninstall behaviour with `allowBackup` and Keystore keys was not examined (no device attached).
