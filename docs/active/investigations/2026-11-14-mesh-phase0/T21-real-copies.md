---
status: active
date: 2026-11-14
topic: Mesh Phase 0, T21 - are real copies of the same chat identical, a clean prefix, or a real split?
---

# T21: real copies of the same chat on Destin's data

## 1. Verdict

**PARTIAL.** 99.4% of chats (1,784 of 1,795 compared) are only ever identical or a clean prefix. No line-ending, BOM, re-serialised-JSON or reordered-line difference exists anywhere. But 11 chats have a difference that is none of the three allowed outcomes, in three families (section 3, finding 6). A hash chain over raw lines, as written in design 5.3, would call them "two versions" when they are not. Each has a tested fix (section 4); with the fixes every pair lands in identical, prefix or real split.

## 2. What was done

All read-only. Code is in `docs/active/prototypes/2026-11-14-mesh-phase0/T21/` (README.md there gives the run order); outputs, with ids cut to 8 characters and no line contents, are in `T21/results/`.

- `lib.mjs`: streaming chain `h[n] = SHA-256(h[n-1] || raw line bytes incl. newline)` (16 bytes kept per line, 32 for the final), pair classifier (identical / prefix / diverged at line N, found by binary search because chains are cumulative), and a diagnosis ladder that never prints content: torn last line, BOM, CRLF-vs-LF, trailing newline, re-serialised JSON, reordered lines, then structure only (line `type` and user/assistant `uuid`).
- `scan-fs.mjs`: every copy on this machine, all pairs per chat id. Live Claude Code `~/.claude/projects/<slug>/<id>.jsonl` (top level only; `<id>/subagents/*` are extras), live native `~/.youcoded/sessions/<slug>/<id>.jsonl`, the mirror `~/YouCoded/Personal/Conversations/<provider>/transcripts/<project>/<id>.jsonl`, and all 28 `(from device, date)` conflict copies. 3,561 copies, 16.3 GiB, 4 workers, 0 read errors, none grew while being read.
- Git history: the sync engine's GIT_DIR is `~/YouCoded/Personal/.youcoded/sync.git` (git-transport.ts:293, work tree is the Personal folder; `core.autocrlf=false` at :493). Used only `git log`, `cat-file blob`, `cat-file --batch-check`, `ls-tree`, `count-objects`, `rev-list --count` with `GIT_OPTIONAL_LOCKS=0`. `parse-gitlog.mjs`, `sizes.mjs`, `select.mjs`, `scan-git.mjs`.
- `refine.mjs` (+ `nobk-residue.mjs`, `nativediff.mjs`): re-tests every non-clean pair with alternative chain inputs. `byteshape.mjs`: CRLF/BOM check of history blobs written by Windows, Mac and phone devices. `lastran.mjs`, `chat-level.mjs`: "last ran" and per-chat roll-up.

**History sampling rule.** The history has 125,040 commits (`rev-list --count --all`), 13 GB on disk. `git log --raw` (non-merge commits only) found 25,459 distinct (path, blob) versions on 3,012 transcript paths, 181.7 GiB uncompressed in total, so all were not hashed. Per chat id, versions ordered by oldest introducing commit time:
- Every version hashed ("full") for ids written by 2 or more devices, ids where any path ever got smaller, and ids with a conflict copy in history: 33 ids, 1,399 versions.
- Every other id with 2 or more versions: first 2, last 2 and 3 evenly spaced between: 1,118 ids, 5,898 version rows ("sample").
- 1,842 ids have a single version in history: not compared there (their disk copies are in the scan above).
- Total 7,275 distinct blobs hashed, about 30.5 GiB. Pairs tested: consecutive hashed versions; the latest version per device against each other device; the latest hashed version against today's mirror file.
- Gap: 3,581 merge commits were not diffed. 6 of the 2,899 transcript blobs at HEAD exist only through merges and were not attributed to a device. Not compared in history; their disk copies are covered.
- Gap: the repo is live (HEAD moved during the run), so history numbers are a snapshot of a few minutes.

## 3. Findings

**1. The mirror copies bytes verbatim.** `transcript-mirror.ts` `copyInto` is `fsp.copyFile` to a tmp name then `rename`; no rewrite, no slimming. `mirrorIn` copies only when local is strictly larger; `materializeOut` only when space is strictly larger (the size-only rule, file comment lines 8 to 11). Evidence: live Claude Code vs mirror, 1,354 of 1,360 pairs are byte-identical (table below).

**2. No byte-level format differences anywhere.** All 3,561 on-disk copies: 0 with a BOM, 0 with a CRLF line ending. History blobs written by the Windows laptop ("GalaxyBook", 449 blobs; records show Windows paths), "dm-windows-PC" (29), the phone ("localhost", 70) and the Mac (5): `byteshape.mjs` found 0 CRLF, 0 BOM, 0 missing final newline (553 blobs, 1.4 GiB). The diagnosis ladder (crlf-vs-lf, bom, trailing-newline-only, re-serialised-json, reordered-lines) matched 0 of the 74 non-clean pairs. The Windows-to-Linux cross-device pairs in history are clean prefixes (examples: `GalaxyBook+destinsZ13` 6 prefix, 1 bookkeeping-tail; `destinsZ13+dm-windows-PC` 1 prefix).

**3. Totals, copies on this machine's disk (all pairs per chat; 1,765 chats with 2 or more copies, 1,845 pairs).**

| Pair type | Identical | Clean prefix (shorter, longer) | Bookkeeping-tail only | Real split | Pairs |
|---|---|---|---|---|---|
| live Claude Code vs mirror | 1,354 | 3 (mirror shorter) | 0 | 3 | 1,360 |
| live native vs mirror | 31 | 379 (mirror shorter) | 0 | 0 | 410 |
| live vs live (same id in other folders) | 1 | 0 | 0 | 2 | 3 |
| mirror vs mirror (same id in 2 project folders) | 0 | 0 | 0 | 1 | 1 |
| conflict copy vs mirror | 11 | 8 (conflict shorter) | 6 | 3 | 28 |
| conflict copy vs live | 11 | 8 (conflict shorter) | 6 | 3 | 28 |
| conflict copy vs conflict copy | 0 | 0 | 10 | 5 | 15 |
| **Total** | **1,408** | **398** | **22** | **17** | **1,845** |

(Rows "conflict vs live" sum Claude Code 27 plus native 1; the 22 counts 20 plus the 2 "one holds all the other's lines but not as a prefix" pairs.) Of the 379 native live-vs-mirror prefixes, the mirror is the shorter copy every time: the native mirror lags the live file; 2 mirror copies are torn (finding 7).

**4. Totals, history (7,304 pairs, sampled as above).**

| Pair kind | Identical | Clean prefix | Bookkeeping-tail only | Native in-place edit | Real split | Pairs |
|---|---|---|---|---|---|---|
| consecutive versions | 16 | 6,103 | 14 | 2 | 10 | 6,145 |
| latest per device, across devices | 0 | 22 | 5 | 0 | 0 | 27 |
| latest hashed version vs today's mirror | 1,098 | 30 | 3 | 0 | 1 | 1,132 |
| **Total** | **1,114** | **6,155** | **22** | **2** | **11** | **7,304** |

Of the 6,155 prefixes, 10 are newer-shorter: a later version is a clean prefix of an earlier one (a rewind; examples 385 to 384 lines, 1,011 to 1,006). A longer-copy-wins rule handles them.

**5. Per chat: 1,795 chats compared (disk plus history). 1,784 only identical or prefix. 11 are flagged**, listed by 8-character id:
- Real split (5): 26d919ff, 301cfe19, 5b7f12b0, 67ab2252, 94e763be.
- Bookkeeping-tail only (5): 3c2f8b3c, 301cfe19, 82b598c4, acb48cfc, f29dc28e.
- Native in-place edit (2): native 85765071, native e45bcfaf.
(301cfe19 has both a real split and bookkeeping-tail pairs, so 11 distinct.)

**6. The three non-clean families.**

- **A. Bookkeeping-tail (not a line-ending problem).** 44 pairs (22 disk, 22 history) in 5 chats. One copy ends with 1 to 8 extra lines that are all bookkeeping (`last-prompt`, `cost-state`, `ai-title`, `mode`, `permission-mode`, `session-owner`, `atis-latch`) and the other copy continued the real conversation from the same point. Raw chains say "diverged at line N". The user/assistant lines of the shorter copy are an exact prefix of the longer one's. Evidence: tail-type histograms in `results/*-nonclean-pairs.jsonl` (`tailTypesA/B`, line types only); after the fix in section 4, 22 of 22 disk and 22 of 22 history Claude Code pairs become identical or prefix. The likely cause (UNVERIFIED, no process was observed): opening and closing a chat on a second device appends bookkeeping lines with no new message, so that device's copy no longer extends the other's. 301cfe19 was alternately opened on two Linux computers on 2026-11-05, which fits. The first-run combine (walk-through A step 5) would raise "two versions" for these chats.
- **B. Real split (17 disk pairs, 11 history pairs, 5 chats).** Both copies have user/assistant lines after the shared part that the other lacks. Left as is: this is the "two versions" case. 301cfe19 (two computers, 2026-11-05, several branches: the history has at least 4 split points), 67ab2252 (Z13 vs the Windows laptop), 94e763be (Z13 vs the other Linux PC; the shorter side holds 7 conversation lines the longer lacks), 26d919ff (same computer, one id in 3 project folders, split at line 278, 63 vs 128 conversation lines after it), 5b7f12b0 (see finding 8).
- **C. Native in-place edit.** 2 chats (native 85765071, e45bcfaf), same device, consecutive versions differ at an earlier line (lines 161 and 83), not at the end. `nativediff.mjs` (field names and lengths only): the image fields of a tool-result line changed (`.data.images`, `.data.imageLabels`, `.data.toolResult`). All the other lines of the older copy still appear in the newer one. So the native runtime edits an earlier line after writing it. A byte chain sees a split; the conversation is the same. Only 2 native chats were hit in 1,250 sampled native pairs, but 1,299 native chats are not mirrored and were not compared.

**7. Torn tail copies.** 2 of 410 native mirror files end with an unterminated last line, at sizes 176,128 and 155,648 bytes (exact multiples of 4,096). They are partial copies of a file still being written; the mirror's size-only rule repairs them on the next growth. A raw "last line" in them would hash a half line. Fix: chain only newline-terminated lines (the prototype does; both pairs then classify as clean prefix).

**8. Same-device rewrites exist, contrary to design 5.3 ("has not been seen in Destin's chats; T2 checks it").** Besides the 2 native chats, 5b7f12b0 (GalaxyBook, consecutive versions, 801 lines then 246, no shared first line) and 26d919ff (same device, 488 lines then 378, split at 278) are same-device version pairs where the later file is not an extension of the earlier. 6 more consecutive version pairs are newer-shorter prefixes. This is the T2 question; I did not investigate the cause. Section 5.3's "segment" rule is needed on real data.

**9. Can each device tell which chats it "last ran"?** Partly, by a name, not an id.
- The only persistent record is `ConversationRecord.device` (`store-core.ts:30`, "last device that ran a turn") plus `lastActive`. It is set from `os.hostname()` (`service.ts:191`, `:424`), refreshed at turn-complete and other transcript events, and merged newest-wins with `lastActive` (`store-core.ts:178` to `183`).
- `sessionIdMap` is an in-memory `Map` (`ipc/session-state.ts:12`, cleared at `:44`), not saved, so it says nothing after a restart.
- A live file existing here does not mean the chat last ran here: `materializeOut` copies other devices' files in. Evidence from `lastran.mjs` on the 1,765 chats with a live file here: record says this host (destinsZ13) 1,308; says another device 457 (GalaxyBook 366, DestinsLinuxPC 85, dm-windows-PC 4, Mac 2). For all 457, the live file is byte-identical to the mirror; for chats last run here, live is longer than the mirror in 382 and equal in 926. No contradictions (0 chats where another device is named but the local file is longer).
- Weak spots: the value is a hostname, not the device id in `Devices/*.json`. Names do not join: the phone's records say "localhost" while its device entry says "Destin's Z Flip7"; GalaxyBook and the Mac have no device entry at all; 3,058 records, 113 with an empty `device` (placeholders with no transcript); several Android devices could all say "localhost". The rule "record.device equals this machine's hostname" works on this computer today, nothing more.
- Chats with no record: 1,299 native live files (538 MB) have neither a mirror copy nor a record, and 9 Claude Code files likewise. They are not "last ran" anywhere on record; the first-run index will meet them as unknowns.

## 4. What this changes in the design

Only engineering sections (4 to 12), nothing in section 2. Wording is proposed, not applied.

1. **5.3, "A hash chain per segment" and 4.3 A step 5.** Add after the chain definition: "A second chain, the conversation chain, is kept beside it. It is `c[n] = SHA-256(c[n-1] || raw bytes of line)` over only the lines whose type is a conversation line (Claude Code: `user`, `assistant`; native: its own list of message, tool and turn-complete types, to be fixed from the native writer's source). The raw chain is used for copying and damage checks. `decide` and the first-run combine compare conversation chains. Bookkeeping lines (`last-prompt`, `cost-state`, `ai-title`, `mode`, `permission-mode`, `session-owner`, `atis-latch`, `tools-used`, `file-history-*`, `queue-operation`, `api-request*`, `pr-link`, `bridge-session`) never make two copies 'differ'." Evidence: with the user+assistant chain, 22 of 22 disk and 22 of 22 history Claude Code bookkeeping-tail pairs are identical or prefix and 28 of 28 real-split pairs stay diverged (`refine.json`). A deny-list chain ("every line except the bookkeeping list") also fixed 22 of 22 on disk but only 20 of 22 in history (it missed `bridge-session`), so prefer the allow-list.
2. **5.4, "Concurrent host entries".** Heads carry both chain values. Third bullet becomes: "The copies differ in conversation lines: two versions." A new bullet: "One copy's lines beyond the shared part are all bookkeeping: it counts as a prefix; the other copy's holder hosts; the bookkeeping-only lines are set aside as a tail (never shown to the user)."
3. **5.3, Copying.** "A copy is chained only through its last newline-terminated line; an unterminated final line is not a line yet." (2 of 410 native mirror files were torn.)
4. **5.3 Store and T2.** Replace "This has not been seen in Destin's chats; T2 checks it" with "Seen in 2 native and 3 Claude Code chats (T21); segments are needed." Also add to section 5.3: native tool-result lines with images are edited after the fact; the adapter must detect that an older line changed and open a new segment (or accept the new bytes for that line if the conversation chain is unchanged).
5. **4.3 A step 5 and 5.4 "last ran".** Replace "whether the chat was last run here" with its real source: "the conversation record's `device` field compared with this machine's host name at first run, recorded in the `claim` as a device id from then on. Chats whose record has no device are 'not last run here'." Real code needs the record to carry the device id (a field the records do not have), written at turn-complete beside `device`.
6. **7.3 One-time restore.** It already says "prefix: keep the longer; different: keep both as versions". Add "compared by conversation chain", else the restore gives 5 of Destin's chats a false second version (and would give a false version to any chat opened on a second computer).

## 5. Needs Destin

One thing he would see: when a chat was only opened and closed on a second computer (no new message), should the app treat it as the same chat, with no "two versions" notice? Recommend yes: it is the only case seen in the data (5 chats); a notice there would be noise with nothing to choose. The cost: the few bookkeeping lines of the quiet copy (title and last-prompt records) are dropped when the other copy wins. Alternative: show "two versions" every time (safe but noisy). Nothing else needs him.

## 6. Could not test here

- The phone's and the Windows/Mac computers' live runtime files and their app code: only their history blobs were read (via this Linux computer's sync history, section 3 finding 2).
- The real cause of the bookkeeping-tail lines (which runtime action writes them) and of same-device rewrites (T2 territory): not observed running.
- Native line-type list for the conversation chain: not derived from native source; the native pairs seen had no conversation-tail differences to test it on.
- The 1,842 chats with a single version in history, and the 3,581 merge commits, are not compared in history.
- Cross-device history on this data covers 27 pairs; with only 28 of 2,993 chats ever written by two devices, a different mix of use (more handoffs) could show more split cases than here.
