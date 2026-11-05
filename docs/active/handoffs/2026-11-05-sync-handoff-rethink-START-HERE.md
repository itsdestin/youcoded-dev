---
status: active
date: 2026-11-05
topic: Moving a conversation between computers — lost messages, false "may have newer messages" alarms, no sync visibility
related-cards: 121, 125, 98, 127
---

# Sync & handoff between computers — investigation and rethink brief

A read-only investigation (2026-11-05) of the conversation sync and handoff systems,
prompted by Destin switching between his laptop (`destinsZ13`) and desktop
(`DestinsLinuxPC`) many times while fixing the desktop's root partition and
reinstalling Windows. **Nothing was changed in code.** The next session may do a broader
rethink of parts of the sync design rather than patch each finding; the findings below
are its evidence, not a fix list to execute blindly.

## What Destin reported (his words, lightly trimmed)

1. "A couple of times I've lost messages or the conversation hasn't fully synced when I
   switched … I'm not sure what happened to the other copies of the conversation. It's
   not entirely clear to me where those other messages went. They just kinda disappeared
   into the ether."
2. "There's no loading indication or indication that the messages haven't fully synced yet."
3. "After clicking 'take over here', the session just shows 'syncing latest messages' for
   a while before showing the 'this conversation may have newer messages on your other
   computer' warning/error. But all of the messages were already synced."
4. "Lots of bugs and jank in how sync and handoff works." Goal: "more consistent, more
   robust … less confusing when they're switching back and forth between devices."

## Evidence from his real data (read-only, from the laptop)

The conversation is `301cfe19-9c15-4c64-b2bb-f42d0d90ca71` (project `youcoded-dev`).
It shows under two names because the automatic namer renamed it as the topic moved, and
each device kept its own last choice: laptop "Valorant On This Device", desktop "Windows
Install And Drive Rebuild". A conflict copy of the NAME file also exists
(`~/YouCoded/Personal/ConversationNames/claude/301cfe19… (from destinsZ13, 2026-11-05).json`).

### Incident A — lost final exchange (02:47 local / 09:47Z)

| Local time | Event | Evidence |
|---|---|---|
| 02:38 | last state the laptop later resumed from | sync commit `c5f239971c` (1400 lines) |
| 02:47:22–:38 | desktop: "lets switch. sure its safe?" → answer → "The switch is armed… Quit YouCoded" | records only in the desktop copy |
| 02:47:54 | desktop commits it locally ("local snapshot before merge", `9c490d246c`) but **never pushes** — Destin quits YouCoded and the PC drops to a TTY | `9c490d246c` absent from laptop history until 13:57 |
| 02:48:58 | laptop resumes the conversation from the 02:38 copy, no pull-first | `desktop.log` SessionSetup line; Destin: "didnt safe here it seems" |
| 13:57 | desktop comes back, pushes; the copies disagree; the desktop's version is filed as `…/transcripts/youcoded-dev/301cfe19… (from DestinsLinuxPC 2, 2026-11-05).jsonl` | file on disk; "2" is the same-day collision suffix, not a new device |

Lost: 8 records (1 user message + replies). An audit of all 24 `(from …)` transcript
copies in Personal found **no other unique user messages** (one GalaxyBook copy from
2026-07-29 has 29 unique non-message records). The script is easy to re-run: compare
record `uuid` sets between each `(from …)` copy and its main file.

### Incident B — false "may have newer messages" (≈15:08 local)

Desktop (requester `b2402f16…` = DestinsLinuxPC) took over from the laptop (sender
`7570a46c…` = destinsZ13).

| Local time | Event |
|---|---|
| ~15:08:00 | desktop starts its 25 s wait, shows "Syncing latest messages" |
| 15:08:23 | laptop stops the session, writes receipt `Personal/Handoffs/claude/301cfe19….json` (byteLength 13,255,801, sha256 `a95985d3…`) |
| 15:08:29 | laptop sync begins with a full pull/merge round (`3e04ba1868`) |
| 15:09:00 | laptop's commit with receipt + the whole 13 MB transcript (`b9f8185b61`), then push |

The laptop's local transcript, the mirror and the receipt all match byte-for-byte; the
handoff **succeeded on the sender** but landed ~35+ s after the request — past the
requester's 25 s cap. The desktop's own side was not inspected (its log is on the
desktop); the timing alone explains the symptom.

### Logging gap

The laptop's `~/.claude/desktop.log` contains **no** handoff, lease, takeover or sync
lines for either incident. Reconstruction was only possible from the sync repo's git
history (`~/YouCoded/Personal/.youcoded/sync.git`) and file contents.

## Findings from the code (ranked)

Two parallel read-only code audits plus direct verification. "Confirmed" = read in code;
"plausible" = reasoned, not reproduced. Paths under `youcoded/desktop/src/`.

### Can lose messages

1. **Transcripts reconcile by file size only** (confirmed, `main/conversations/transcript-mirror.ts:112-158`).
   `mirrorIn` copies local→space only if local is strictly larger; `materializeOut`
   copies space→local only if space is strictly larger. Content is never compared.
   With two writers this is "bigger file wins". Worst case (confirmed path): resume a
   stale copy → new turns are smaller than the space copy → `mirrorIn` returns `shrunk`,
   uploads nothing → at session end `materializeOne` (`main/conversations/service.ts`
   ~767) overwrites local with the bigger space copy → the new turns are gone with no
   conflict copy. A conflict copy only appears when git itself conflicts.
2. **Quit doesn't flush** (confirmed, `main/sync-spaces/engine.ts` `stop()` ~465;
   shutdown in `main/main.ts` ~2040). The pending debounce is cancelled, no final
   mirror+push runs, quit waits ≤6 s. Matches Incident A exactly. No sleep/wake hook
   either (next sync waits for the 120 s poll or a hub signal).
3. **Ordinary Resume never pulls first** (confirmed for the normal path,
   `main/ipc-handlers.ts` ~690-740, `main/conversations/resume-admission.ts`). Only the
   takeover/handoff path syncs first. Not traced: whether ordinary resume ever reaches
   the receipt check.
4. **Copy only happens at turn end** (confirmed, `service.ts` ~436-453). A crash, sleep
   or kill mid-turn leaves the other device behind until the reconciler's 30-min tick.
5. **After `/compact` uploads may stall** until the file outgrows its old size (plausible
   — depends on whether Claude Code rewrites the file shorter; unverified).
6. **Forcing / "continue with saved copy" uses the local file**, so it inherits (1).

### False alarms and dead ends in handoff

7. **Fixed 25 s cap** (confirmed, `main/conversations/handoff-attempt.ts:146` loop
   deadline and `:180` race timer). It covers the sender noticing, stopping, publishing,
   a full sync round and a 13 MB push, plus the requester's pull. Incident B. No
   automatic retry or late admission after the alert.
8. **The sender doesn't fast-path its final copy** — it runs a normal sync cycle
   (snapshot → fetch → merge → push of the whole transcript) after writing the receipt.
9. **Byte-exact prefix rule** (confirmed, `main/conversations/handoff-transcript.ts`
   `importHandoffTranscript` → `divergent destination`). The requester's local file must
   be an exact byte prefix of the sender's. Claude Code appends bookkeeping records
   (`cost-state`, `last-prompt`, `permission-mode`, …) when a session ends, so a device
   that previously held the conversation can differ in trailing records with identical
   messages. Real example: the `(from DestinsLinuxPC, 2026-11-05)` copy has every message
   but diverges at record 757 (`cost-state` vs `attachment`). Retry can then never succeed.
10. **One sentence for every failure** (confirmed, `renderer/components/HandoffFreshnessInline.tsx:30`,
    `renderer/state/pending-handoff.ts:144-159`). `tab.cause` (`receipt not confirmed`,
    `no distinct verified sender`, `divergent destination`, `holder changed`,
    `lease-denied`) is stored but not shown. A sleeping/offline/reinstalled sender ends
    instantly as `no distinct verified sender` → same warning; "Try again" is useless.
11. **Unproven stop on the sender gives up silently** (confirmed, `main/conversations/takeover.ts`
    ~153-170, `main/session-manager.ts` ~644-675): no receipt, no lease release, no
    notice on either side.
12. **Copy promises that aren't true in practice** (`renderer/components/takeover-dialog-copy.ts`
    ~303, ~311): other device "will stop and save on its own" (only if awake and
    running — never for a reinstalled install id); its later writes are "kept as a
    separate copy" (only as an invisible `(from …)` file).
13. **Force needs the original holder to still hold the lease** (`handoff-attempt.ts` ~289);
    if it expired during the dialog the toast says "Close the conversation there" —
    wrong advice for an asleep machine.

### No visibility

14. **Resume list says nothing about devices or freshness** (confirmed,
    `renderer/components/ResumeBrowser.tsx` ~229 declares `device?` but never renders it).
    Only "Not synced to this device yet" / "Project folder not on this device" exist.
15. **Sync status is space-wide only** (`sync-dot-state.ts`, `SyncPanel.tsx`); offline
    cycles are silent by design; the conflict notice ("A conflict note appeared") names
    files, not conversations, and vanishes on restart (card #121).
16. **Conflict copies are invisible.** Nothing reads `(from …)` files: the reconciler
    scans `~/.claude/projects`, Resume lists by record, materialize follows the record's
    canonical path. Locations: `~/YouCoded/Personal/Conversations/<provider>/transcripts/<project>/<id> (from <device>, <date>).jsonl`,
    plus `Devices/` and `ConversationNames/` copies. Overwritten local files (finding 1)
    have no backup at all; only sync git history has older versions.
17. **Names are a separate synced file per conversation** (`naming-store.ts`), so the
    two devices can show different names; the pending tab shows `savedName || 'Conversation'`.
18. Also: transcripts over 50 MB never sync (card #98); a pull racing a mirror write can
    throw "Sync merge could not complete" and self-heal next cycle (plausible,
    `sync-spaces/git-transport.ts` ~809-962).

## Directions for the rethink (proposals, not decisions)

These came out of the investigation; none is approved. Destin directs product, the
session makes the technical calls, and any visible change goes through a review deck.

- **Merge transcripts by message, not by size.** Records carry `uuid`s; union by uuid
  with timestamp order, treat uuid-less bookkeeping records as non-conflicting. Where
  two devices truly branched (both added turns after the same point), keep both as a
  visible "two versions" choice in the Resume list instead of a hidden file. Removes
  findings 1, 5, 6, 9 and most of 16. Open question: whether Claude Code resumes
  correctly from a merged file whose `parentUuid` chain forks.
- **Flush on quit, sleep and wake** (bounded), and fast-path a handoff's final copy
  ahead of the normal sync cycle. Removes 2, 8 and most of 7.
- **Pull before opening** a conversation another device touched recently, with a short
  visible "Getting the latest from <device>…" state.
- **Replace the fixed 25 s with progress-aware waiting**: keep waiting while the sender
  reports progress (stopped → published → pushed), say which device and step, offer
  "Continue without waiting". Admit automatically if the receipt lands after the alert.
- **Specific notices per cause** (asleep/offline/reinstalled, couldn't close, true
  divergence), and copy that only promises what the app does.
- **Per-conversation sync state** in the Resume list and tab: "Open on <device>",
  "Last updated on <device>, <time>", "Syncing…", "Behind".
- **Structured logging** of every lease, takeover, receipt and sync step to `desktop.log`.
- **Reconsider how big transcripts travel** — every sync re-commits the whole 13 MB file;
  ties into card #98 (growth, >50 MB chats, first download).
- **Device identity across reinstall**: a reinstalled machine gets a new install id; old
  leases and copy can point at a device that will never answer.

## Related existing work

- Cards: **#121** (conflict copies invisible, Backup & Sync wording), **#125** (same
  chat on two computers; also H1/H4/H5 double-writer races), **#98** (sync growth, >50 MB
  chats, first download), **#127** (rare sync edge cases; (d) dev instance syncing real
  Personal — see #17). Link to these before filing new cards (idea-intake).
- Prior records: `docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md`,
  `docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md`,
  `docs/archive/investigations/2026-09-23-handoff-message-freshness.md`,
  `docs/archive/plans/2026-09-23-handoff-freshness.md`,
  `docs/archive/design/2026-09-23-handoff-freshness/inline-direction.md`.
- Depth docs: `youcoded/docs/sync-spaces.md`, `youcoded/docs/conversations.md`;
  rules `.claude/rules/conversations.md`, `sync-spaces`.
- Tests that exist and would anchor changes: `desktop/tests/handoff-freshness-integration.test.ts`
  (two roots, real bare git), `handoff-attempt.test.ts`, `handoff-transcript.test.ts`,
  `resume-admission.test.ts`, `pending-handoff.test.ts`, `conversation-store-core.test.ts`,
  `sync-spaces-git-transport.test.ts`, `wecoded-marketplace/worker/test/sync-hub.test.ts`.

## Not verified / open

- The desktop's own log for Incident B (on DestinsLinuxPC; ask Destin or read it there).
- Whether `/compact` shrinks the transcript file (finding 5).
- Whether ordinary resume ever passes through `importConfirmedHandoff`.
- Worker side (`wecoded-marketplace/worker/src/sync/room.ts`) was not audited.
- Android: runs the same backend, so the same findings presumably apply; not checked.
- Nothing was reproduced in a dev instance. A two-root reproduction of finding 1 (stale
  resume → new turns → session end) in a unit/integration test is the cheapest first proof.

## Cautions for the next session

- Destin's real sync folder (`~/YouCoded/Personal`) and live app are read-only.
  Dev instances must not sync his real Personal space (card #17 / #127(d)); test with
  two temporary roots and a bare git remote, as `handoff-freshness-integration.test.ts` does.
- The one lost exchange (Incident A) is recoverable from the `(from DestinsLinuxPC 2, …)`
  copy if Destin wants it back; it is only the "is it safe to switch?" Q&A.
