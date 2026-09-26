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

## The first-launch picture (profiled, 2026-09-26)

`real-scale-startup.mjs --profile --real-look`: observe-only launch, 25 s, nothing poked;
Destin's theme (Meadow Mist), wallpaper and installed plugins copied in (plugin registry
paths rewritten into the copy). Main process CPU-profiled from its first line
(`--inspect-brk`), the window from attach (~1.2 s), plus long tasks, frame gaps, the IPC
heartbeat, per-process CPU and every program the app starts. Cold and warm agree.

**Window (renderer) script is not the stutter.** Two long tasks per launch, both
≤270 ms and both before the first paint (module evaluation / first render); after
that the window's own script is ~1% busy.

**The idle welcome screen redraws continuously, and with this theme each redraw is
expensive.** Idle, averaged over 10 s by Chromium process type:

| | GPU process | window | frames drawn in 24 s |
|---|---|---|---|
| Meadow Mist (Destin's) | **99%** of a core | 14% | 610 (≈25/s) |
| stock theme | 1% | 7% | 1,429 (≈60/s) |

On screen while idle: ONE running animation — the mascot's `rig-breathe` (smooth,
infinite, allowlisted in `infinite-animation-allowlist.test.ts` as character motion) —
and four `backdrop-filter: blur(22px)` surfaces, including the welcome screen's
full-window `chrome-glass--bare` frame (1200×800, since 79fe9f737, 2026-08-27). Each
breathing frame invalidates the area under the full-window blur, so the blur is
recomputed every frame. Xvfb is software-rendered, so 99% overstates a real GPU; the
SHAPE (constant work at display rate while nothing changes) is not an artifact. The
stock theme shows the same breathing costs ~nothing without the blur. Not measured on a
real display — that needs a window on Destin's desktop.

**The main process is 100–170% busy for the first ~9 s**, then ~6%. By profile:
- slug repair 6.2: `firstCwd` decodes a 512 KB head per transcript to a string (≈1.1 s
  of `toString`) and JSON-parses up to 200 lines each (≈1.5–1.9 s of `extractCwd`) —
  ~3,280 files, where the cwd is almost always in the first few lines;
- the ~0.85 s freeze: `conversation-store.ts` `heal()` → `readdirSync` of the whole
  Conversations dir (≈440 ms) + the conflict-name regex per entry, reached from
  `store.get()` per session in `repairRecordsAndSpace`, plus `existsSync` per session
  (≈100–170 ms) — all synchronous;
- the Resume native list: `parseSessionLines`/`parseHead` ≈0.5 s per scan;
- **a ~170 ms freeze every launch: `pacman -Qo` via `spawnSync`**
  (`linux-install-kind.ts`), reached from the update check's `parseReleaseResponse`;
- small synchronous spawns elsewhere: analytics `execSync` (6 ms), `nvidia-smi` probe
  (5 ms here; unbounded on a machine where it hangs), ROCm `ldconfig` (3 ms).

Programs started at launch: `git clone --depth 1` of the marketplace when its cache is
missing (cold copy only — Destin's live log shows a fetch every launch), `pacman -Qo`.

**Not in the rig, present in Destin's real launch:** GitHub sync of the Personal space,
real `claude` processes (the fixture's `claude` is a fake that answers instantly), and a
real GPU at 180 Hz. The live log's 16–24 s repair vs 9 s here says the real launch
carries roughly double this load.

## Welcome screen on the real display (Destin approved, deck Q-1, 2026-09-26)

`scratch/real-screen.mjs` (not kept): packaged app, Meadow Mist, idle welcome screen on
the real display (XWayland, ANGLE on the Radeon 8060S), 5 s windows; the live app was
running throughout. GPU chip busy = `/sys/class/drm/card1/device/gpu_busy_percent`.

| condition | GPU chip busy | GPU process CPU | window CPU |
|---|---|---|---|
| test app not running | 6–10% | — | — |
| welcome screen as launched | 36% | 30% | 23% |
| mascot hidden | 8% | 0% | 2% |
| mascot shown, all blur off | 30% | 16% | 19% |

**This reverses the Xvfb attribution.** On software rendering the blur looked like the
cost (99% → 5% with blur off); on the real GPU the blur is a minority of it and the
mascot's never-ending motion (`rig-breathe` plus MascotRig's own sway) is most of it:
~25 points of GPU and ~half a CPU core while nothing happens. Also disproved: drawing the
mascot above `.chrome-glass` (z 11) changed nothing on Xvfb. Deck Q-2 was answered
("leave it") on the blur-centred framing; reopened as `startup-perf-mascot.questions.json`.

**Outcome (2026-09-26):** Destin asked to test a lower frame rate instead of answering
Q-3 (`startup-perf-mascot.questions.json`, left unanswered — superseded). The rig body
loops now run in MascotRig's 30/s update (`rig-body-loop.ts`); real screen, idle welcome
screen: GPU chip 36% → ~12–17% busy, app CPU ~2/3 → ~1/4 of a core. Judged side by side
live (`mascot-frame-rate.live.json`): Destin picked "30 per second".
