---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0, T2 (do chats only grow?) plus a first throwaway version of seam S1 (source adapter)
---

# T2: do chats only grow? (and seam S1, first version)

## 1. Verdict

**PARTIAL.** The pass line ("100% of non-append events reported as `rewritten`, none pass silently") holds for every
event I could produce or observe: all 11 synthetic cases, 12 real file deletions during a 25-minute live watch, and 0 silent
misses in 181 full re-hash scrubs. Three things stop me writing PASS:

1. **One known blind spot, by construction:** a same-size edit in the middle of a big file passes the cheap check. The slow
   re-hash scrub catches it (tested). Nothing like it exists in the real data.
2. **`/compact` and `/clear` were not run** (forbidden here). One *real, automatic* compaction did happen on a watched live chat
   during the window and was a pure append (finding 9). Deliberate `/compact`, `/clear`, resume-from-summary and kill mid-write are left for the T3 agent.
3. **A different design problem turned up in part (d):** "reply end" cannot be a per-line check for Claude Code (finding 14). It
   changes S1's `isReplyEnd(line)` and a sentence in 5.3.

**Are segments (design 5.3) needed in practice? No.** In 1,364 Claude Code chats, 1,820 native chats and a live watch, no file
ever lost or changed an earlier byte. Keep the `rewritten` path as a cheap safety net (it is already written and tested), but
do not build segment storage, 30-day segment retention or segment frames in Phase 2; cut them to "on `rewritten`, stop
copying that chat and raise a diagnostic". (Section 4 has the wording.)

## 2. What was done

All code is throwaway Node ESM in `docs/active/prototypes/2026-11-14-mesh-phase0/T2/` (no dependencies).

| File | What it does |
|---|---|
| `adapter.mjs` | S1: `poll(path, state, opts) -> {lines, replyEnds, state} \| {rewritten: reason, state}`; `scrub()` |
| `adapter.test.mjs` | 11 unit tests (`node --test adapter.test.mjs`) |
| `bench-unchanged.mjs` | times an unchanged big file (`node bench-unchanged.mjs <file> --make-mb 300`) |
| `reply-end.mjs` | `classifyCC`, `isReplyEndCC/Native`, `replyEndStepCC/Native` (the lookahead tracker) |
| `lines.mjs` | splits on byte 0x0a only (see finding 5) |
| `static-scan.mjs`, `aggregate.mjs` | part (a)+(d): all 8,869 transcripts, 4 workers, 53 s (`node static-scan.mjs <outDir>`, then `node aggregate.mjs <outDir>`) |
| `dig.mjs`, `dupregion.mjs`, `badlines.mjs`, `ctx.mjs`, `orphans.mjs`, `samesid.mjs`, `versions.mjs` | follow-ups that explain each anomaly the scan counted |
| `afterend.mjs`, `msgsplit.mjs`, `msgsplit2.mjs`, `blocks.mjs`, `endstate.mjs` | part (d) reply-end questions |
| `validate-real.mjs` | runs the adapter over every real chat (read-only) and an incremental-vs-from-scratch check on 20 copies cut mid-line |
| `watch-live.mjs` | part (b): live observation (`node watch-live.mjs 25 <log>`) |
| `results/` | `static-scan-aggregate.txt`, `dig-anomalies.txt`, `validate-real.txt`, `watch-live-log.jsonl` (ids only, no chat text) |

Real data was only ever opened read-only (`fs.openSync(path,'r')`, `createReadStream`). The one experiment that needs a writable
copy (`validate-real.mjs`) writes `copy.jsonl` into the session scratch folder and deletes it. No chat text appears in this report
or in `results/`.

Scope of the real data (at scan time, 2026-11-14 ~09:40Z): `~/.claude/projects`: **1,364 main transcripts** (7.76 GB,
1,482,543 lines) plus **5,684 helper files** under `subagents/` (9.83 GB, 966,628 lines); `~/.youcoded/sessions`: **1,820 native
files** (0.90 GB, 326,547 lines). Other sessions create and delete throwaway chats while I scan, so counts drift by a few files
between runs; the figures below come from the last full run unless said otherwise.

## 3. Findings

### The adapter (seam S1)

1. **All 11 unit tests pass.** Cases: append; partial trailing line (not ingested until its newline arrives); truncate;
   truncate then regrow past the old size (a size check alone misses this; reported `rewritten`); in-place rewrite inside the last
   64 KiB; in-place rewrite in the first 4 KiB of a big file; file replaced by rename (identical bytes, new inode: `replaced`);
   file deleted (`missing`); 13 MB append across the 8 MB read chunk equals the from-scratch chain; the lookahead tracker. Evidence: `node --test adapter.test.mjs` -> `tests 11, pass 11, fail 0`.
2. **Speed: an unchanged file polls in 0.17 ms median (p99 1.5 ms, max 2.2 ms) at 311 MB; target was under 50 ms.** Command:
   `node bench-unchanged.mjs <scratch>/big300.jsonl --make-mb 300` (200 polls; page cache warm). The cheap check is one `fstat`
   and two small reads, so it does not grow with file size. The first full ingest of that 311 MB file took 3.0 s (about 100 MB/s,
   dominated by hashing line by line), which is also the cost of one full re-hash scrub. In the live watch the average poll was
   0.40 ms across 17,829 polls (max 407 ms: one poll that ingested a large burst).
3. **On real data the adapter agrees with an independent scan.** `validate-real.mjs` ran `poll()` from scratch on 3,180 real
   chats (1,360 main Claude Code + 1,820 native): 0 `rewritten` on first poll; line counts matched the scan's in 3,175; the 5
   differences are chats that grew after the scan (4, all live) or one chat id that exists in three folders and collided in my
   id-keyed lookup (not an adapter fault). 20 real files cut mid-line, polled, then completed and polled again, gave the same chain,
   line count, reply ends and tracker state as one from-scratch poll: 20/20.
4. **Two cheap-check hashes, one addition to the design.** The design's cheap check (identity + size + hash of the last 64 KiB)
   misses a compaction-style rewrite from line 1 that grows past the old offset *and* leaves the last 64 KiB equal. I added a hash of the first 4 KiB. The only
   remaining blind spot is a same-size edit in the middle (tested: cheap check passes it, `scrub()` catches it). Recommendation: run
   `scrub()` when a chat becomes host-ready, after the host process restarts, and when idle (3 s per 300 MB), not on a timer for huge files. In 181 scrubs during the live watch: 0 failures.
5. **A reader trap, worth telling every builder: split lines on the byte 0x0a only.** Claude Code writes raw U+2028/U+2029
   inside JSON strings (they are valid and `JSON.stringify` does not escape them). Node's `readline` cuts lines there. My first scan
   reported 168 "bad JSON lines" in 5 files and a wrong line count; after switching to byte splitting the real number is 20 bad lines in 2 files (finding 8). 4 main files (7 lines), 15 helper files (25 lines) and 5 native files (5 lines) contain such characters. The adapter was never affected (it only looks for 0x0a).
6. **Identity is path-bound; chats move.** `conversations/slug-repair.ts` can move a transcript to the right project folder
   (`renameSync`), or replace one by a larger copy ("replaced-with-superset", lines 307 and 665). To the adapter, the old path is
   `missing`. The store must key a chat by chat id, and treat "same id appeared at a new path" as a continuation, not a new chat. A replace-with-superset reads as `replaced` (a new segment) even though the bytes are a clean extension. That is the safe direction. If it turns out to be common, `replaced` could first run the full re-hash and continue when the old prefix is intact.

### (a) Static: signs of non-append history, every transcript

Counts for the 1,364 main Claude Code chats unless noted (command: `node static-scan.mjs` then `aggregate.mjs`; full table in `results/static-scan-aggregate.txt`).

7. **Compaction markers: 391 `compact_boundary` lines, each with a matching `isCompactSummary` line, in 196 chats.** For 379 the
   `logicalParentUuid` (the last line before the compaction) is present earlier in the same file; for 11 it is present 5 lines *after*
   the boundary (an attachment line; still in the file); for **1** it is absent from the file and from all 7,034 Claude Code files
   (chat `24c3d97e`, line 3765, an automatic compaction at 969,950 tokens; a `grep` of the uuid in every file finds only the boundary
   line that cites it). Cause UNVERIFIED: either that line was never written (an in-memory message) or an older rewrite removed it;
   I cannot tell from one snapshot. 390 of 391 confirm "every pre-marker line is still present" at the one line each marker names; I did not and cannot confirm every line (no earlier snapshot exists). The compactions span Claude Code 2.1.112 to 2.1.325 (about 75 distinct versions). Older ones in deleted files are not in the data.
8. **Other structure counts (main chats):** a first line that is a `summary` or a continuation of another session id: **0**;
   lines with a `sessionId` other than the file name: **0**; `forkedFrom`: **0**; `isSidechain` lines: **0**; `summary`-type lines: **0**.
   Unparseable lines: **20 lines in 2 files** (`6c1bd6e6` 13, `c314c6e8` 7), mid-file, errors like "expected ',' or '}'" with no control characters and no lone surrogates, so Claude Code (or two writers) wrote malformed lines itself; the app silently skips them. Consequence: the store must hash and copy bytes, never re-serialize JSON. `parentUuid` pointing outside the file: **9 lines in 2 files**; 8 of the 9 targets are the unparseable lines themselves (the uuid text is there but the line does not parse); 1 target (`6c1bd6e6` line 4623) exists nowhere. Native chats: 0 unparseable lines, 0 duplicate uuids.
9. **Duplicate uuids: 11 chats, 6,440 repeated lines, all appended later (nearest repeat 21 lines after the first; none adjacent).** They sit
   in blocks that start exactly on a `compact_boundary` line (the 3 biggest chats: Claude Code re-writes the kept recent history after the marker, with
   unchanged uuids) or just before it (hook attachments). 800 repeats are byte-identical; the rest differ in `message`, `parentUuid`, `cwd`, `slug`, `version`
   and similar fields. This is not a rewrite (the earlier copy is untouched) but it means **a chat's lines are not unique by uuid** and a compaction can add thousands of lines at once (up to 2,512 in one chat). Native chats: none.
10. **Timestamps are NOT monotonic, so they cannot detect anything:** 1,322 of 1,364 chats have at least one line older than an earlier line (104,581
    lines; 830 chats by over 1 s, 300 by over 60 s, worst 8.1 days). By line type: attachments 61,730, assistant 26,714, user 13,809, others small. User/assistant lines
    alone: 812 chats, 10,476 lines (the 8-day case is old history re-written after a compaction). Native: 1 chat, 1 line, 1.9 s. So "used" (last line added) must come from file time or arrival time, never from line timestamps.
11. **Native chats (1,820): 45 contain a `compact-summary` event (95 lines) and 3 a `context-clear` (4 lines), all appended; no rewrite marker, no duplicate, no unparseable line.**
12. **Same chat id in several project folders: 1 id of 1,358** is in 3 folders; two copies are byte-identical, the third (4.4 MB vs 5.5 MB) is not a prefix of the larger.
    That is a T21-type question (a slug-repair leftover); I did not investigate it further.
    Helper files (5,684): first-line session id differs from the file name in 5,640 by design (they carry the parent's id); not relevant to append-only.

### (b) Dynamic: 25 minutes of live observation

13. **Setup and result.** `node watch-live.mjs 25 <log>` ran 09:33:42Z to 09:58:43Z (poll every 2 s, discover new active files every 15 s, full
    scrub every 3 min per file, my own adapter, files opened read-only). It tracked 37 files (25 still present at the end: 11 main chats and 14 helper files; 12 deleted during the window;
    no native chat was written during the window), 17,829 polls, 3,317 new lines (19 MB), 56 reply ends, 181 scrubs. Totals and per-file lines: `results/watch-live-log.jsonl`.
    - **12 `rewritten` events, all reason `missing`**: the T3 agent deleted its throwaway chats (`~/.claude/projects/-tmp-claude-1000-...-t3-proj*` no longer exist). All 12 were reported. Zero other `rewritten`. Zero `SCRUB-FAIL`.
    - **One real automatic compaction happened inside the window.** Chat `e5537c74` (a long live session) wrote a `compact_boundary` at 09:37:57Z (line 1879, preTokens/postTokens present, trigger `auto`). My adapter had read 1,878 lines
      and then ingested the boundary and 24 more lines as plain appends: 0 rewrites, 0 scrub failures. This is the first live proof that a current Claude Code compaction appends.
    - Not exercised: `/clear` (starts a new id by documented behaviour), resume-from-summary, kill mid-write, any deliberate `/compact`. T3 owns those.

### (c) What the app already knows

14. **The app's shrink handler still assumes a rewrite that does not happen.** `transcript-watcher.ts:989-1001`: "`/clear` truncates the JSONL. `/compact` rewrites it with a summary"; if the file shrank below the offset it resets the offset to 0 and emits `transcript-shrink`. The same file, at line 134, says the compact summary is "appended to the same JSONL". The data above agrees with line 134: 391 of 391 summaries sit in-file after a boundary. `docs/cc-dependencies.md` is mixed: line 375 says `/compact` "rewrites the SAME transcript file" (stale), line 113-114 says "a file shrink alone no longer claims successful compaction" and describes the boundary-plus-summary lines. The comment at 989 and the sentence at cc-dependencies.md:375 should be corrected to "appends"; the shrink code is still a fine defence and should stay. (Not edited: Phase 0 does not change app source.)
15. **Native chats are append-only by construction.** `session-store.ts` writes only through `NativeHome.appendSessionLine` (`native-home.ts:162-185`): `appendFile`, plus a crash guard that first
    appends a `\n` when the file does not end in one (so a torn record becomes its own bad line and the next record starts clean). I searched `main/harness`, `native-home.ts`, `session-store.ts` and `main/conversations` for `writeFile`, `truncate`, `rename`, `unlink`, `rm`, `ftruncate`: transcript files are never rewritten there. `writeSessionArtifact` writes *separate* spill files; `accepted-history-store` writes its own manifest by temp-file-and-rename (a different file). Native compaction and clear are marker events (`compact-summary`, `context-clear`), and a retry tombstone is an appended `assistant-thinking` with `dropPart`. The only whole-file writers of a transcript are `slug-repair.ts` (finding 6) and Claude Code itself.
    One native fact for S1: a torn tail followed by that guard newline becomes a line that does not parse; the adapter ingests it as a normal line (hash by bytes), which is correct.

### (d) End-of-reply markers, and how real chats end

16. **Claude Code, per the app (`transcript-watcher.ts:376`):** an `assistant` line with `message.stop_reason` set and not `tool_use` emits `turn-complete`; a user line whose whole text is
    `[Request interrupted by user]` (or `... for tool use]`) emits `user-interrupt`, which ends the turn (`transcript-watcher.ts:241-258`). **Native:** persisted `turn-complete` and `user-interrupt` events; `session-error` also ends a turn but is never written to the file (`session-store.ts:205-214`), so it can never be a reply-end line.
17. **A per-line `isReplyEnd` is wrong for Claude Code.** Claude Code writes one API message as one line per content block, and **each of those lines carries the message's final `stop_reason`.** Over the 1,364 main chats: **31,685 lines** carry a non-`tool_use` stop reason but they belong to only **21,238 distinct messages**; 9,802 messages are 2 lines and about 110 are 3 or more (up to 71 lines). The usual pair is a `thinking` block line then the `text` block line (9,933 of 10,221 consecutive pairs; `blocks.mjs`). A takeover cut right after the first line would leave the answer text on the old host. The app itself sees several `turn-complete` per message and dedupes by uuid. So "the event the app treats as `turn-complete`" (design 5.3) is not safe as a cut point.
    **Working fix, implemented and tested (`replyEndStepCC`):** remember the last end-looking line with its `message.id`, and confirm it only when an assistant line with a different message id, any user line, or the `system` `turn_duration` line arrives. Bookkeeping lines (`last-prompt`, `ai-title`, `mode`, `queue-operation`, ...) neither confirm nor cancel. Result over all 1,360 main chats: **21,832 confirmed reply ends**, against 20,957 `turn_duration` lines and 21,238 distinct final messages (the difference is interrupts, API errors and 32 chats from older versions that have no `turn_duration`). 62 chats end with an end-looking line not yet confirmed; they confirm on the next line, or the host's own idle signal.
18. **Do real chats end on a reply end or mid-reply?** (last turn line, ignoring bookkeeping lines; `endstate.mjs`; ages by file time at 09:48Z)

    | Runtime | Chats | End on a reply end | End mid-reply | No turn line at all |
    |---|---|---|---|---|
    | Claude Code main | 1,364 | **1,299** (1,268 `end_turn`, 17 API error, 1 other synthetic, 13 interrupt) | **39** (25 an unanswered prompt, 9 a tool result, 5 a tool call) | 26 |
    | Native | 1,820 | **1,611** (1,572 `turn-complete`, 39 `user-interrupt`) | **168** (66 user message, 52 tool result, 22 tool call, 18 reply text, 10 thinking) | 41 (header only) |

    Of the 207 mid-reply chats, 1 is live right now (a tool result 15 minutes old) and 3 had a prompt under a day ago; the other 203 are over a day old: work abandoned by a crash, a quit or an interrupt that left no marker. These are exactly the "tail after the last reply end" case the design already handles (set aside). So about **1 in 10 native chats and 3% of Claude Code chats** end mid-reply, and a takeover offered on them must go back to the last confirmed reply end.
19. **Ambiguous cases, with counts (Claude Code main chats):**
    - *API errors:* 452 lines (224 chats) are synthetic assistant lines (`model` `<synthetic>`, `isApiErrorMessage`, stop reason `stop_sequence`). The app counts them as `turn-complete`. They do end the attempt; whether the user considers that a "finished reply" is a product question (a retry usually follows).
    - *Interrupted turns:* 359 interrupt lines in 227 chats; all 359 carry a `promptId`; treat as reply ends. Other stop reasons that end a turn: `max_tokens` 6 and `refusal` 6 (app: `turn-complete`).
    - *Queued messages and background results:* 803 times a turn line follows a reply end with no typed prompt in between. Cause: 359+174+64+56+23+... are `queue-operation` dequeue/enqueue plus an injected meta user line (a background-task result or queued message), 64 plus a `scheduled_task_fire`, 6 a local command. So the reply end was real and a new reply starts; 78 in 2 chats are `end_turn` followed straight by a tool result (inside the preserved-history re-writes of finding 9). `queue-operation` and `queued_command` lines are bookkeeping, not reply ends.
    - *Sidechain lines:* none in main chats (0). Helper files (5,684) are different: 4,625 helper files hold 242,265 assistant lines with no stop reason (streamed blocks), and 1,023 end mid-block. Helper files carry no reliable reply-end marker, but the design never indexes them (they are copied "everything after byte N", sent when a parent reply ends), so nothing needs fixing.
    - *Native:* no dups, no missing markers; 295 interrupt lines in 141 chats, 0 with promptId (not applicable).

## 4. What this changes in the design

**5.3 "The store", segments (about line 735-745).** Replace the first segments bullet and the sentence that says the old segment is kept 30 days with:
> A chat version's lines are one append-only run. If the host adapter ever reports that the runtime rewrote, shrank, replaced or deleted its file, copying of that chat stops, a diagnostic is recorded, and a person (or T3-style tooling) decides; no second segment is created. This has not been seen in 1,364 Claude Code chats, 1,820 native chats and a 25-minute live watch including one real automatic compaction (T2).

Dropping segments removes: the `segment` field in S2 (`hashAt(version, segment, n)`, `read`, `append`), the `moved` answer in 5.3, "Head ... segment" in section 1's word table, and the Phase 2 work for segment frames. Do this only if Destin's rule "nothing is lost on a guess" is not read as requiring the old segment; the cheaper alternative is to keep the field name but always write segment 0.

**6.1 row S1.** Replace `isReplyEnd(line)` with a per-runtime step function and add the head hash:
> `state` holds byte offset, line count, chain hash, file identity (dev+inode), a hash of the last 64 KiB before the offset, **a hash of the first 4 KiB of the file**, and a per-runtime reply state. ... `replyEnd(state, line) -> {state, confirmed[]}` (per runtime). A confirmed reply end may name an **earlier** line than the one just read. Claude Code: a line is a reply end only after a later line shows its message is complete (a different `message.id`, any user line, or a `turn_duration` line). Native: a persisted `turn-complete` or `user-interrupt` line, immediately. A full re-hash happens only when the cheap check fails, plus `scrub()` when a chat becomes host-ready and after the host process restarts.

**5.3 "The store" bullet "An index of reply ends".** Replace "from each runtime's own end-of-reply marker (the event the app treats as `turn-complete`)" with "from the rule in S1; the app's `turn-complete` fires once per content block in Claude Code chats and is not a safe cut point".

**3.1 table row "Grows only?".** Replace "Usually. The watcher handles the file shrinking ..." with "Always in 1,364 chats and 391 compactions (T2): compaction appends a boundary line, a summary, and a re-written copy of the kept recent lines. The watcher's shrink code (`transcript-watcher.ts:989`) is defence in depth. Lines are not unique by uuid (6,440 repeats in 11 chats), line timestamps are not increasing (1,322 of 1,364 chats), and a few lines are not valid JSON (20 in 2 chats): copy bytes, never re-serialize, and take "used" from arrival time." Also correct "Destin's 295 compactions" (now 391).

**5.3 "Identity"/storage.** One added rule: a chat is keyed by chat id, not path (finding 6); slug-repair moves or replaces files.

**Section 9 row T2.** Mark "kill mid-write, `/compact`, `/clear`, resume-from-summary" as moved to T3; "Again in Phase 2" stays.

## 5. Needs Destin

Nothing is user-visible yet. One product question for later, not now: should a chat that ended on an API error ("something went wrong, try again") count as a finished reply for the "continue on another device" cut point? Engineering recommendation: no, treat it as mid-reply (go back to the previous finished reply); it appears in 224 of 1,364 chats and a takeover on the error would hand over a reply the user never saw complete. It is a one-line change in `replyEndStepCC`.

## 6. Could not test here

- `/compact`, `/clear`, resume-from-summary and a kill mid-write against Claude Code: forbidden on real sessions; left for the T3 agent's throwaway sessions.
- Windows and macOS: file identity (inode) is unreliable on some Windows file systems; a `fileId` fallback needs a Windows test. Android file-system behaviour untested.
- Older Claude Code versions than 2.1.112, and compactions in chats Claude Code already deleted, are not in the data.
- The cause of the 1 boundary whose parent line is absent (finding 7) and of the 20 malformed lines (finding 8) is UNVERIFIED.
- The adapter's per-file memory use: `poll()` returns every new line in memory; a first ingest of a 327 MB chat holds about that much. A real implementation should stream batches (the 3 s first-ingest time was measured with in-memory lines).
