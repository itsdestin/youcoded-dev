---
status: active
---
# Startup lag and the slow first Resume open, measured at real scale

**Asked (Destin, 2026-09-25):** "the app sometimes really lags on startup, and the first
launch of the resume browser can seemingly load indefinitely."

**How measured.** `scripts/perf-lab/real-scale-startup.mjs` boots the packaged app
(branch `session/startup-perf-20260926`, app marks added there) against a
`cp --reflink` copy of this machine's history — 1,096 Claude Code transcripts (6.7 GB),
2,615 conversation records, 1,018 native session files, 4.8 GB of synced copies — in a
throwaway HOME with no sync configured. Boot 1 is cold (copied files are not in the OS
file cache, like a first launch after reboot); boot 2 relaunches warm. Two full runs;
the numbers below are run 2 and agree with run 1 within ~10%. Raw: the run JSON is
not kept (it names real conversations); rerun the script to regenerate.

## Timeline (ms from process spawn, run 2)

| | cold | warm |
|---|---|---|
| session list up (`yc:sessions-listed`) | 1,567 | 1,595 |
| **first Resume open, requested at list-up** | **2,988** | **4,208** |
| — of which native session list (`nativeHost.listAsync`) | 2,062 | 1,816 |
| — of which Claude Code transcript scan | ~660 | ~2,040 |
| — of which store overlay | ~230 | ~330 |
| second Resume open, after launch work settled | 1,714 | 1,710 |
| — of which native session list | 813 | 854 |
| slug repair (start → done) | 9,078 | 8,882 |
| — stage 6.2 `repairRecordsAndSpace` | ~9,050 | ~8,850 |
| reconcile + materialize (after repair) | ~150 | ~150 |
| main-process freezes > 200 ms (100 ms IPC heartbeat) | one, 918 ms at ~9.2 s | one, 845 ms at ~9.1 s |

## Findings

1. **The "endless" spinner did not reproduce.** Worst first open: 4.2 s. The live app's
   own log shows its repair taking 16–24 s against 9 s here, so a real launch carries
   roughly twice this load (GitHub sync, resumed Claude Code sessions — neither present
   in the rig). A 4 s wait doubled is long enough to read as "forever", but that is
   inference: the indefinite case is still unexplained.
2. **Every Resume open re-reads all 1,018 native session files first** (256 KB head each,
   children included only to be filtered out) — 0.8–2.1 s, nothing cached. This is the
   largest single cost of an open and is NOT in the roadmap's Resume item, which names
   only the Claude Code half.
3. **Two full scans run at once when Resume opens.** `App.tsx`'s first-run probe
   (`setHasResumable`, ~line 3468) calls `session.browse()` just to learn whether ANY
   past conversation exists — at every launch with no open session, and again whenever
   `resumeRequested` changes, i.e. on the same click that opens the Resume browser. The
   two scans share nothing (the transcript-meta cache shares only per-file reads).
4. **The in-memory transcript cache barely helps**: a settled second open still takes
   1.7 s (native list 0.85 s + transcript pass 0.8 s of stats, topic reads and slug
   resolution + store overlay).
5. **The launch repair costs ~9 s of disk reading, all in stage 6.2**, and holds one
   ~0.9 s main-process freeze near its end (every window stalls). It re-derives the same
   answers every launch; sweeps (reconcile/materialize) wait behind it.
6. The chat-search index refresh at launch is 0.2 s — not a factor. Drawing the Resume
   list is chunked (50 rows) — not a factor.

## What this changes in the plan (Stage 1)

- Native list: cache per file on (size, mtime) like the transcript cache, and skip
  specialist children by name before reading. Biggest win per open.
- First-run probe: ask a cheap "has any conversation" question (or reuse the Resume
  result) instead of a full scan; never re-run it on the Resume click.
- Persist the transcript/native caches across restarts so the first open after launch
  is as cheap as the second.
- Repair stage 6.2: remember what it already checked; find and remove the ~0.9 s freeze.
- Spinner: say "still loading" with Retry after a few seconds (unchanged from plan).
- Still unexplained: the "loads forever" case. Next time it happens, note the time —
  `~/.claude/desktop.log` around it is the next evidence.
