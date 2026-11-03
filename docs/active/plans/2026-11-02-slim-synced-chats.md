---
date: 2026-11-02
status: draft
type: plan
card: 98
topic: Leave pictures and duplicate file copies out of the synced copy of Claude Code chats
---

# Slim synced chats (piece 1 of sync growth)

Revision 2 — after an independent review against the code (2026-11-02). Changes from rev 1: the
append/offset bookkeeping is gone (whole-file atomic write, as today); lines are matched by identity
(`uuid`), not by `slim(a) === b`; the capability flag moved out of the device record into its own file;
dev builds never slim; the slim rule touches only user-role image blocks; chat search reset and the
over-cap exclude line became required changes; the Claude Code check now includes Edit and `/rewind`.

## Why

Measured on Destin's Z13, 2026-11-02 (Personal space, GitHub repo `youcoded-sync-personal`):

- GitHub repo 3.8 GB, growing ~1.2 GB/month (2.6 GB on 2026-10-05). GitHub's soft ceiling is 5 GB.
- A latest-version-only clone of the same repo is **2.9 GB** — history is not the main cost; the current
  transcript content is (matches `docs/active/investigations/2026-09-01-transcript-storage-long-term.md`).
- Claude Code transcripts (`Conversations/claude/transcripts/**.jsonl`, 2,395 files, 8.9 GB on disk):
  56% base64 images, each stored twice (in `message.content` and in the line's `toolUseResult`), plus full file
  text duplicated in `toolUseResult.file.content` / `originalFile`.
- A first cut of the rule: **8.9 GB → 3.4 GB on disk, 4.4 GB → 1.0 GB compressed**; ~2% of lines change.
  All **35** transcripts over the 50 MB cap fell under it. (Re-measure with the final rule.)

YouCoded never renders transcript images when a chat is reopened (`transcript-watcher.ts` keeps only text
blocks; pasted images show as `[Image #N]`), so nothing changes on screen on any device.

## What changes for the user

- Sync copies grow 3–4× slower (~1.2 → ~0.3 GB/month on GitHub).
- A chat continued on a **different** device without a handoff: Claude there cannot see that chat's earlier
  screenshots or full earlier file reads (short placeholder instead). The device where the chat happened keeps
  everything — its own file is never modified.
- Handoff ("move this chat to this computer") still transfers the exact full file.
- Nothing already on GitHub shrinks (piece 2, a one-time manual fresh start, is out of scope).

## Design

### 1. The slimming rule — new pure module `conversations/transcript-slim.ts`

- Works on **complete lines only** (ending in `\n`); a partial last line (Claude Code mid-write) is not copied.
- Only `type:"user"` lines, Claude Code provider only (native transcripts hold image paths, not data).
- Fast path: lines ≤ 4 KB or without `"base64"`/`toolUseResult` keep their exact bytes.
- Image blocks replaced only at **top level of `message.content`** and **inside `tool_result.content`** (depth ≤ 2) →
  `{type:"text", text:"[Image not synced to this device]"}`. Never inside an assistant `tool_use.input`.
- `toolUseResult`: drop `originalFile`, `file.content`, `file.base64`, empty nested base64 `data`. Keep
  `structuredPatch` and the small keys YouCoded reads (`status`, `agentId`, `backgroundTaskId`, `taskId`,
  `timeoutMs`, `persistent`, `task_id`, `task_type`, `message`, `resumedAgentId`).
- Changed lines: prefer a byte splice of the removed spans over parse-and-reserialise (keeps big integers,
  key order, escapes and lone surrogates exactly); fixtures from real transcripts pin it. Unchanged lines and
  unparseable lines keep their bytes.

### 2. Line identity, not content

A line's identity is its `uuid` (fallback: `type` + `timestamp`, then line index). Slimming never changes it, and
future changes to the rule can't break matching. Full and slim forms of the same line are "the same line".

### 3. Copy rules (`conversations/transcript-mirror.ts`)

"Bigger file = newer" becomes "more complete lines = newer".

- **mirrorIn (device → sync copy):** device has more lines → atomically write `slim(device file up to last \n)`
  (whole file, tmp + rename, same cost as today's copy; deterministic, so git deltas stay small). Fewer →
  `shrunk`, keep sync copy (`/clear` protection unchanged). Equal → nothing.
- **materializeOut (sync copy → device):** sync copy has more lines and the device file's lines match its first
  lines by identity → write device file + the sync copy's extra lines (the device keeps its own full lines).
  No match → replace (today's behaviour). Missing → copy. `shouldCommit` liveness re-check unchanged.
- **Line counts without re-reading every file:** a per-device cache `{size, mtimeMs, ino, completeLines}` per
  path (userData, never synced). Validated on every use, so a stale or foreign cache only costs a re-read,
  never correctness; two app instances on one machine each keep their own. First launch after upgrade: equal
  sizes = already mirrored without reading (today's assumption).
- While slimming is off (gate below), mirrorIn writes unslimmed bytes but still uses the line rule.

### 4. Gate — slim only when every active device understands it

An older app still uses "bigger = newer" and would copy an older full file over a newer slim one.

- New file `Personal/Devices/caps/<machineId>.json` (`{slimTranscripts: 1}`), written at launch by official
  builds. A subfolder, because old code only scans `Devices/*.json` and rewrites device records from known
  fields (rename / `upsertSelf` would erase a flag kept there).
- "Official build" = packaged desktop **or** the Android headless backend (`electron-headless.ts` hard-codes
  `isPackaged = false`, so it needs its own signal).
- Slimming on ⇔ this instance is official **and** every device seen in the last 30 days (registry `lastSeen`
  or hub `lastSyncByDevice`) has a caps file. A device known to the hub with no record counts as "no".
- Dev builds never slim the real Personal space, regardless of caps.
- Accepted risk, documented: a device idle >30 days that returns on an old build, before it auto-updates, can
  push an older full copy over a newer slim one; the newer device's original restores it on its next mirror.

### 5. Handoff (`conversations/handoff-transcript.ts`)

Receipts stay exact-bytes (sha256 + byteLength). Replace the byte-size/byte-prefix guards with line-identity
prefix checks: sender (`old.size >= source.byteLength || !prefix(...)`) and receiver
(`existing.byteLength >= receipt.byteLength`, and both `prefix(...)` checks). Streamed line hashing.

### 6. Other required changes

- `conversations/slug-repair.ts` `classifyPair`/`uuidContentHashes`: same uuid with full vs slim bytes is not a fork.
- `chatsearch-index/index-store.ts`: record source path + inode/first-4 KB hash; reset the offset when it changes
  (today it resets only on shrink, so switching from a slim copy to a full local file would land mid-line).
- Over-cap chats (35 today): when mirrorIn finds a sync copy over 50 MB, rewrite it slim, **and remove its
  `info/exclude` line** (`git-transport.ts` keeps it excluded until next launch otherwise). Limit by bytes per
  push; skip chats whose lease is held.
- Comments/docs that state the size rule: `transcript-mirror.ts` header, `conversations.md`, `slug-repair-state.ts`,
  `sync-spaces.md`; new entry in `cc-dependencies.md`.

## Verification

- Unit: slim rule on real-line fixtures (Read image, Read text, Edit, Bash, screenshot MCP, pasted image,
  assistant `tool_use` containing `"type":"image"` JSON, partial last line, big integers / surrogates);
  identity matching; both copy directions incl. `/clear`, divergence, missing files, live-session abort; cache
  invalidation; handoff with mixed files; gate (Android official, dev never, caps subfolder, hub-only device).
- Existing tests to update: `transcript-mirror`, `handoff-transcript`, `handoff-freshness-integration`,
  `conversations-service*`, `sync-spaces-device-registry`, slug-repair, chatsearch index.
- **Real Claude Code check** (dev instance, isolated profile, throwaway sync space): slim a chat with screenshots
  and Reads, `--resume` on a second profile, then Edit a file read earlier in the slimmed history, and `/rewind`.
  Unknown until done: whether Claude Code rebuilds its "file already read" state from `toolUseResult`.
- `bash scripts/verify.sh`.

## Out of scope

Shrinking existing GitHub history (piece 2), `attachment` lines (~1 GB), the native lane, a restore UI.
