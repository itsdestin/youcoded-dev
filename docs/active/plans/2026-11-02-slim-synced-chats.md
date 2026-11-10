---
date: 2026-11-02
status: active
type: plan
card: 98
topic: Sync size — leave pictures and duplicate file copies out of the synced copy of Claude Code chats (piece 1), then a one-time fresh start of GitHub history (piece 2)
---

# Sync size: slim synced chats

**This is the single current document for sync size growth** (card #98, "growth, very long chats").
It replaces the measurements and option list in `docs/active/investigations/2026-09-01-transcript-storage-long-term.md`,
which is kept only for its July numbers and the long-term "every transcript on every device" goal.

## Status (2026-11-09)

| | State |
|---|---|
| Investigation and measurements | **Done** (2026-11-02) |
| Design, rev 1 → independent review → rev 2 (this doc) | **Done**; Destin cut an earlier, larger design ("super overcomplicated") down to the two pieces below |
| Piece 1 code | **Not started.** Waiting on Destin's go-ahead. App worktree `worktrees/sessions/sync-slim-history/youcoded`, branch `session/sync-slim-history`, no commits yet |
| Piece 2 | **Not started**, deliberately after piece 1 ships |
| Measurement scripts (`breakdown.py`, `slim.py`, …) | **Lost** (lived in a session temp folder, gone after a crash on 2026-11-03). Re-measuring means rewriting them — small, but budget for it |

**First build step, because it could change the plan:** write the slim rule (§1), then run the real Claude Code
check under Verification. If Claude Code cannot keep editing files read earlier in a slimmed chat, stop and redesign
before building §3–§6.

## Why — measured 2026-11-02 on the Z13

- GitHub repo `youcoded-sync-personal`: **3.78 GB**, growing ~1.2 GB/month (2.6 GB on 2026-10-05, 652 MB on
  2026-07-30). GitHub's soft ceiling is 5 GB → reached around **early December 2026** at this rate; past it GitHub may
  refuse pushes and sync stops for the whole account.
- A latest-version-only copy of the repo is **2.9 GB**. So ~0.9 GB is old versions; most of the size is the
  *current* chat files. (July's finding — "history compaction would not help" — no longer fully holds, but slimming
  is still the bigger lever.)
- Claude Code chat files (`Personal/Conversations/claude/transcripts/**.jsonl`, 2,395 files, 8.9 GB on disk):
  **56% is pictures** (base64), each stored twice — in the message and again in its `toolUseResult` — plus full file
  text duplicated in `toolUseResult.file.content` / `originalFile`. Actual conversation text is only ~0.5 GB.
- First cut of the slim rule: **8.9 GB → 3.4 GB on disk, 4.4 GB → 1.0 GB compressed**, ~2% of lines change.
  All **35** chats over the 50 MB per-file cap (which today stop syncing) fell under it. Re-measure with the final rule.
- YouCoded never shows chat pictures when a chat is reopened (`transcript-watcher.ts` keeps text only; pasted images
  show as `[Image #N]`), so nothing changes on screen.

## What the user will experience

- Nothing changes on screen. Sync grows 3–4× slower (~1.2 → ~0.3 GB/month).
- Most or all of the ~35 chats too big to sync today start syncing.
- A chat continued on a **different** device *without* "continue on this computer": Claude there cannot see that chat's
  earlier screenshots or full earlier file reads (short placeholder instead). The device where the chat happened keeps
  everything — its own file is never modified.
- "Continue on this computer" (handoff) still moves the exact full file.
- Nothing already on GitHub shrinks until piece 2.
- Accepted risk: a device off for 30+ days that comes back on an old app version, before it updates, can briefly
  upload an older full copy of a chat; the newer device puts it right on its next sync.

## Piece 1 design

### 1. The slimming rule — new pure module `conversations/transcript-slim.ts`

- Works on **complete lines only** (ending in `\n`); a partial last line (Claude Code mid-write) is not copied.
- Only `type:"user"` lines, Claude Code provider only (native transcripts hold image paths, not data).
- Fast path: lines ≤ 4 KB or without `"base64"`/`toolUseResult` keep their exact bytes.
- Image blocks replaced only at **top level of `message.content`** and **inside `tool_result.content`** (depth ≤ 2) →
  `{type:"text", text:"[Image not synced to this device]"}`. Never inside an assistant `tool_use.input`.
- `toolUseResult`: drop `originalFile`, `file.content`, `file.base64`, empty nested base64 `data`. Keep
  `structuredPatch` and the small keys YouCoded reads (`status`, `agentId`, `backgroundTaskId`, `taskId`,
  `timeoutMs`, `persistent`, `task_id`, `task_type`, `message`, `resumedAgentId`).
- Changed lines: prefer a byte splice of the removed spans over parse-and-reserialise (keeps big integers, key order,
  escapes and lone surrogates exactly); fixtures from real transcripts pin it. Unchanged and unparseable lines keep
  their bytes.

### 2. Line identity, not content

A line's identity is its `uuid` (fallback: `type` + `timestamp`, then line index). Slimming never changes it, and
future changes to the rule can't break matching. Full and slim forms of the same line are "the same line".

### 3. Copy rules (`conversations/transcript-mirror.ts`)

Today: "bigger file = newer" (`mirrorIn` / `materializeOut` compare sizes). New: "more complete lines = newer".

- **mirrorIn (device → sync copy):** device has more lines → atomically write `slim(device file up to last \n)`
  (whole file, tmp + rename, same cost as today's copy; deterministic, so git deltas stay small). Fewer →
  `shrunk`, keep sync copy (`/clear` protection unchanged). Equal → nothing.
- **materializeOut (sync copy → device):** sync copy has more lines and the device file's lines match its first lines
  by identity → write device file + the sync copy's extra lines (the device keeps its own full lines). No match →
  replace (today's behaviour). Missing → copy. `shouldCommit` liveness re-check unchanged.
- **Line counts without re-reading every file:** a per-device cache `{size, mtimeMs, ino, completeLines}` per path
  (userData, never synced), validated on every use, so a stale cache only costs a re-read. First launch after upgrade:
  equal sizes = already mirrored without reading (today's assumption).
- While slimming is off (gate below), mirrorIn writes unslimmed bytes but still uses the line rule.

### 4. Gate — slim only when every active device understands it

An older app still uses "bigger = newer" and would copy an older full file over a newer slim one.

- New file `Personal/Devices/caps/<machineId>.json` (`{slimTranscripts: 1}`), written at launch by official builds.
  A subfolder because old code only scans `Devices/*.json`, and `renameDevice`/`upsertSelf`
  (`sync-spaces/device-registry.ts`) rebuild records from known fields only — a flag kept there would be erased.
- "Official build" = packaged desktop **or** the Android headless backend (`headless/electron-headless.ts` hard-codes
  `isPackaged = false`, so the phone needs its own signal).
- Slimming on ⇔ this instance is official **and** every device seen in the last 30 days (registry `lastSeen` or hub
  `lastSyncByDevice`) has a caps file. A device known to the hub with no record counts as "no".
- Dev builds never slim the real Personal space.

### 5. Handoff (`conversations/handoff-transcript.ts`)

Receipts stay exact-bytes (sha256 + byteLength). Replace the byte-size/byte-prefix guards with line-identity prefix
checks: sender (`old.size >= source.byteLength || !prefix(...)` in `publishHandoffTranscript`) and receiver
(`existing.byteLength >= receipt.byteLength` and both `prefix(...)` checks in `importHandoffTranscript`). Streamed
line hashing.

### 6. Other required changes

- `conversations/slug-repair.ts` `classifyPair`/`uuidContentHashes`: same uuid with full vs slim bytes is not a fork.
- `chatsearch-index/index-store.ts`: record source path + inode/first-4 KB hash; reset the offset when it changes (today
  it resets only on shrink, and `refresh-core.ts` can switch between the local file and the sync copy — landing
  mid-line).
- Over-cap chats: when mirrorIn finds a sync copy over 50 MB, rewrite it slim **and remove its `info/exclude` line**
  (`sync-spaces/git-transport.ts` otherwise keeps it excluded until next launch). Limit by bytes per push; skip chats
  whose lease is held.
- Comments/docs that state the size rule: `transcript-mirror.ts` header ("Size comparison … is sufficient"),
  `youcoded/docs/conversations.md`, `slug-repair-state.ts`, `youcoded/docs/sync-spaces.md`; new entry in
  `youcoded/docs/cc-dependencies.md` (we now depend on Claude Code tolerating slimmed history).

### Verification

- Unit: slim rule on real-line fixtures (Read image, Read text, Edit, Bash, screenshot MCP, pasted image, assistant
  `tool_use` containing `"type":"image"` JSON, partial last line, big integers / surrogates); identity matching; both
  copy directions incl. `/clear`, divergence, missing files, live-session abort; cache invalidation; handoff with mixed
  files; gate (Android official, dev never, caps subfolder, hub-only device).
- Existing tests to update: `transcript-mirror`, `handoff-transcript`, `handoff-freshness-integration`,
  `conversations-service*`, `sync-spaces-device-registry`, slug-repair, chatsearch index.
- **Real Claude Code check** (dev instance, isolated profile, throwaway sync space — never the real Personal space):
  slim a chat with screenshots and Reads, `--resume` it on a second profile, then Edit a file read earlier in the
  slimmed history, and `/rewind`. Unknown until done: whether Claude Code rebuilds its "file already read" state from
  `toolUseResult`.
- `bash scripts/verify.sh`.

## Piece 2 — one-time fresh start of GitHub history (later, manual)

After piece 1 has run on every device: replace the GitHub repo's history with a single latest-only snapshot
(measured 2.9 GB before slimming; roughly 1 GB after). Every device then has to re-download. Manual and one-time,
run with Destin, not automatic. This is the same item as card #127's "Deferred manual step: compact the remote `.git`
history". Needs its own short plan before it runs: how other devices notice and re-clone without making conflict
copies, and confirming every device's newest chats were pushed first.

## Out of scope (stay on card #98 or elsewhere)

- `attachment` lines in chats (~1 GB), the native lane, a restore UI.
- The long-term goal "every chat on every device, always" — possibly a different store than GitHub for chat files
  (see the investigation doc). Piece 1 buys months to years, not forever.
- Card #98's other items: one file watch per synced project (a), a second hidden history for synced code projects
  (b), slow far-behind uploads timing out (c), and the first download showing no progress.
- Absent chats read "Not synced to this device yet" in `SessionCardDetails.tsx` — wrong for a chat that will never
  arrive. Piece 1 should make that rarer (fewer over-cap chats), not fix the wording.

## Existing problems found along the way (not fixed by this plan; report, don't fix unasked)

- A remote branch that was deleted on GitHub is treated like "offline", so the next sync quietly re-uploads
  everything (`sync-spaces/git-transport.ts`, pull path).
- `git-transport.ts:1225` comment claims "NO conflict-copy explosion", but its snapshot-before-merge contradicts it.
- `info/attributes` (`* -text`) is written only when the repo is created (`git-transport.ts:432`), so older repos may
  lack it.
- Push has a fixed 5-minute timeout (`GIT_TIMEOUT`, `git-transport.ts:109`) while fetch is idle-based — relevant to
  card #98 item (c).
- The 500 MB size notice (`SIZE_WARN_BYTES`, `engine.ts:29`) measures the local repo, not what's on GitHub.
