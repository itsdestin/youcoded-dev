---
status: active
date: 2026-11-14
topic: Mesh Phase 0 - do chats ever rewrite their own file? Settling T2 (no) against T21 (yes) and the fate of "segments" (design 5.3)
---

# Segments decision

## 1. Verdict

**Both reports are right about what they measured; neither found a runtime rewrite.** Every "same-device rewrite" T21 flagged is an artefact: 2 native chats were edited by a one-off hand repair, 2 Claude Code chats are old-sync-system products (a file swapped by the sync, and one chat id filed in two project folders), and the third (301cfe19) is two computers chatting at once. Segments are **not needed for native (a), not needed for Claude Code (b) on the evidence, kept only as a safety net (c)** - and the safety net should be the existing "new version" mechanism, not a segment store.

## 2. What was done

Read-only. Scripts in `docs/active/prototypes/2026-11-14-mesh-phase0/segments/` (stream blobs from `~/YouCoded/Personal/.youcoded/sync.git` with `GIT_OPTIONAL_LOCKS=0`; counts, line types, ids only).
- Read T2 and T21 and T21's `results/*.jsonl` to list exactly which chats and which pairs.
- Walked all 76 distinct versions of 5b7f12b0 in history (`git log --reverse --raw -- '*5b7f12b0*'`, then line count, size, first-line hash per blob); compared A (801 lines), B (246) and the latest by `uuid` sets, positions, `timestamp` order, `version`, `parentUuid` (`5b7f-*.py`).
- Compared the 7 on-disk copies of 301cfe19 by user/assistant `uuid` sequence (`301c-conflict-copies.py`).
- 26d919ff: `ls` of live and mirror copies plus `git log --raw` of its path.
- Native: inspected line 161 of 85765071 and line 83 of e45bcfaf (field names only), listed the neighbouring files, read the archived plan that names the repair, and searched the app source for writers.

## 3. Findings

**1. T21 names 2 same-device Claude Code chats (5b7f12b0, 26d919ff) and 2 native (85765071, e45bcfaf).** (`T21-real-copies.md` finding 8, 6C.) The lead's "3 Claude Code" adds 301cfe19, whose consecutive pairs are partly labelled same-device (DestinsLinuxPC to DestinsLinuxPC). All five are explained below. The other real splits (67ab2252, 94e763be) are cross-device and are genuine two-version cases.

**2. Native 85765071 and e45bcfaf: a hand repair of oversized images, not the runtime.**
- Line 161 of 85765071 (a `tool-result`) now points its image at `~/.youcoded/repair-images/85765071/` and carries `imageLabels`; the folder was created 2026-10-20 16:10, between the two versions (2026-10-20 05:50 and 22:13 local). T21 saw `.data.images.0` shrink and `imageLabels` appear.
- e45bcfaf has a sibling `e45bcfaf-...jsonl.bak-before-image-removal` (720,005 bytes, 2026-10-07 13:46) beside the live file; its line 83 lost `.data.images`. The archived plan `docs/archive/plans/2026-10-07-oversized-image-safety.md` (lines 31, 2171) names that backup and the "rescued conversation" and says to leave it alone.
- No code in the app does this: `rg "repair-images"` over `youcoded/`, `scripts/`, `docs/` (excluding transcripts) finds nothing.
- **App write paths for native chat files** (`youcoded/desktop/src/main`): `NativeHome.appendSessionLine` (`native-home.ts:156-185`, `appendFile` plus a guard newline) is the only transcript writer. Other writers in `native-home.ts`: `writeSessionArtifact` `:304` (separate spill files), `ensureTextFile` `:346` (new files only). Searched `main/harness`, `main/conversations`, `native-home.ts`, `session-store.ts` for `writeFile`, `truncate`, `rename`; hits are tools writing the user's files (`tools/write.ts:140`, `edit.ts:239,273`), `accepted-history-store.ts:811` (own manifest), `conversation-store.ts:175` (damaged-file quarantine copy), none touch a transcript line. The one other whole-file transcript mover is `slug-repair.ts` (rename or replace-with-larger, T2 finding 6). So: **no code path edits a native line in place**; the image tool-result is written once (`harness-session.ts:3374-3382`).
- UNVERIFIED: who ran the repair (a session script outside the repo; its code is not in the repo or the archive).

**2b. Size of the risk it still shows:** such hand repairs can happen again (the plan itself is about images that break a chat). They are the only evidence of an edit of an earlier line in a runtime file.

**3. Claude Code 5b7f12b0: the sync swapped the file; Claude Code only appended.** 76 distinct versions, all committed by GalaxyBook, Claude Code `2.1.211` in both A and B.
- A (801 lines, 2.1 MB, lines timestamped 03:11-07:59Z) to B (246 lines, 3.2 MB, from 07:59:56Z): committed as "sync from personal", not a normal snapshot. B's first line has `parentUuid` inside A, and **A and B share 0 uuids**: B is the later half of the same conversation, A the earlier half. B is bigger in bytes (images) but shorter in lines.
- From B on, every later version is an append-only extension of the one before (checked by uuid prefix: 4 of 4 early steps and the walk to the end). Then at 1784230719 ("local snapshot before merge") the file contains A again, **inserted in the middle** (lines 634-1151, 518 of A's 523 uuids), and the final file has 175 timestamp inversions. Claude Code never reorders, so this is a merge result.
- Reading: the old sync's size-only copy rule (`transcript-mirror.ts` header lines 8-11: copy when the other file is strictly larger) replaced A with a larger divergent B, and a later git merge put A back in the middle. UNVERIFIED as the exact step (no log of that day); what is verified is that no one process wrote the 801 to 246 change and that the next versions are pure appends.
- Side finding: the live file on this computer today is that out-of-order file. Claude Code resumes from it as it is. The mesh's first-run copy must take existing files as they are.

**4. Claude Code 26d919ff: one chat id in two project folders, not a rewrite.** The "consecutive" 488 to 378 pair is two different paths read as one (T21's path label says only "main"). `git log --raw`: commit `c1b11e9c05` (1786853909) deletes the copy under `transcripts/Change/` and renames another; `b2542e0eda` (10 s later) adds the `destin/` copy. On disk today: `~/.claude/projects/-home-destin/` (5,532,831 bytes) and `...PAF-574...Public-Change/` (two spellings of the folder, 5,532,831 and 4,409,708 bytes), the mirror has both sizes. Two files share the first 278 lines and each grew on its own: a fork by resuming from another folder, split by the slug-encoding bug (`slug-repair.ts` header calls this case C, a true fork). Each file is append-only. It is the "two versions" case.

**5. Claude Code 301cfe19: two computers, real forks.** Seven copies (live, 6 conflict copies from two Linux computers and the Z13). By user/assistant uuid sequence 21 pairs: 14 are clean prefixes; the rest diverge at line 519 (6 lines exist only in one copy) or 678 (10 lines). All divergences are different lines appended on different computers; none is a changed earlier line. The "same-device" Linux pairs are that computer's snapshots after it pulled the other's copy (alternating authors within seconds, e.g. Z13/Linux 1417 vs 1426 lines at 1793872074/1793872299).

**6. Why T2 saw nothing.** T2 looked at current live files (3,180 first-poll `rewritten`: 0) and a 25-minute watch with one real automatic compaction that appended. A live snapshot cannot see a past swap; T21's history can, and its non-appends all fall under findings 2-5 (sync swap, two folders, two computers, hand repair). T2 finding 7 (391 compaction summaries all in-file) agrees.

**7. Not examined: the 10 history pairs where a newer version is a clean prefix of an earlier one** (385 to 384 lines, 1,011 to 1,006). Cause UNVERIFIED. They are tail drops, not changed lines, and a "longer copy wins" rule or a shrink check covers them. If one was Claude Code shrinking its own file, the safety net below handles it.

## 4. Verdict on segments, with what is lost under each option if a rewrite did happen

| Option | What is lost | Cost |
|---|---|---|
| Segments as designed (section 5.3) | Nothing for 30 days (old whole chat kept on the host, copied nowhere); then the old text | A segment field through the store, the wire (`moved` answer), the chain, 30-day retention, Phase 2 frames |
| **Prefix mismatch becomes a new version** (recommended) | Nothing: the old version stays as it was, with all copies on other devices; the new text is stored as a version whose parent is the old one from line 0 | Nothing new: it reuses version storage ("stores them all", 5.3) and the existing `not-a-prefix` and split handling |
| Fix the native writer | Nothing to fix: no code edits in place | None. A hand repair is a one-off outside the app |
| Stop and ask a person (T2's proposal) | Nothing lost, but no copying of that chat until someone acts | Least code; leaves the chat stuck on other devices |

(a) native: not needed. (b) Claude Code: not needed on this data (0 runtime rewrites in 1,364 chats and history; T2). (c) as a safety net only, and as a version, not a segment.

## 5. What this changes in the design

**5.3 "The store", first bullet** (lines ~737-740 and T21's item 4 are superseded). Replace the segments bullet with:
> A chat version's lines are one append-only run, chained from line one. If a host's adapter reports that its runtime rewrote, shrank, replaced or deleted its file, copying of that version stops at its last good head (which stays as it was, everywhere), a diagnostic is recorded, and the new content is stored as a new version whose parent is the old one from line zero. No segment is kept and nothing is retained for 30 days. This has not been seen from a runtime in Destin's chats (T2 and T21: the apparent cases were a hand image repair, the old sync swapping a file, one id filed in two folders, and two computers writing at once).

Then remove or fix (as T2 proposed): the `segment` field in S2 (`hashAt/read/append`), the `moved` answer in "Copying", "Head ... segment" in section 1, the `segment` control entry, and Phase 2 segment frames; keep the chain `h[0] = SHA-256(version id)`. Alternative with less churn: keep a `segment` field but always write 0.

**Also, from this work:** (1) the mesh is the only program that writes into live chat files on a device after turn-on, so it must never replace a file a runtime has open or is about to append to (that is exactly what the old size-only copy did in 5b7f12b0); (2) a hand repair of a chat line (image rescue) should be done through a mesh function later, else it appears as a new version; a repaired line whose user/assistant uuids are unchanged could be accepted as the same version (not decided here).

## 6. Needs Destin

Nothing. If a rewrite ever did happen, he would see a second version of that chat in the list, the same "two versions" display already designed. Nothing seen today would trigger it.

## 7. Could not test here

- Windows, Mac and phone runtime files (only their history blobs, via this computer's sync repo).
- The one-off image repair script (not in the repo): author and exact behaviour UNVERIFIED.
- The exact step that swapped 5b7f12b0 (no log), the 10 newer-shorter history pairs (cause), and whether the old sync still runs on any device.
