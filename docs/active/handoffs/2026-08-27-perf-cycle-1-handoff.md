---
title: Perf optimization cycle 1 — handoff for the session that runs it
status: active
date: 2026-08-27
supersedes_for_next_steps: docs/active/handoffs/2026-08-27-perf-lab-session-status.md
approved_by: Destin, 2026-08-27 ("i like 1-3")
decision_page: https://claude.ai/code/artifact/e00aa59a-e4b0-466b-a49a-a8e06da22f64
---

# Perf optimization cycle 1 — handoff

**Read this first, then only what it points at.** The status doc
(`2026-08-27-perf-lab-session-status.md`) is the full history; this is the plan.

## 0. What Destin approved, in his words

> "i like 1-3."

Three cards from the Round-Zero decision page, to be done **in this order**:

| order | card | what it is |
|---|---|---|
| **cycle 1** | card 2 | stop re-doing the whole conversation for every streamed word — three verified per-token costs (§3) |
| cycle 2 | card 1 | paged conversation history (the other session's approved spec — §5) |
| cycle 3 | card 3 | park hidden conversations' views (after paging makes rebuild cheap — §6) |

Cards 4 and 6 are on hold pending re-measure; card 5 (CSS containment vs theme
glows) is Destin's call and untouched.

## 1. The objective (v3, Destin, 2026-08-27)

> "create the infrastructure to hillclimb/optimize all bug classes and improve code
> efficiency autonomously … we will use these bugs to test the rig"

Cycle 1 is the **first end-to-end run of that loop on a real change**: measure →
change → re-measure → the gate says KEEP or REJECT → ship only a KEEP. The number the
rig produces is the deliverable's proof; a change without a KEEP does not ship.

## 2. State of the world (verified 2026-08-27 evening)

- **Workspace** `youcoded-dev` on `master`, merged with `origin/master` (135 upstream
  commits from other sessions came in the same day). **~53 local commits, NOT pushed** —
  the rig, five reports, handoff/ROADMAP updates. Push needs Destin's OK (rule).
- **Product** worktree `worktrees/perf-lab/` on `perf/optimization-pass` at `16ea12e`,
  **rebased onto master `40feb750`**, 4 commits ahead (opt-in perf marks only, zero
  product behaviour change). NOT pushed, no PR. Built binary at
  `worktrees/perf-lab/desktop/release/linux-unpacked/` matches `16ea12e` — the rig
  rebuilds automatically when the tree fingerprint changes.
- **Rig**: `scripts/perf-lab/`, **285 tests** (`cd scripts/perf-lab && node --test tests/*.test.mjs`).
- **Reports** in `perf-reports/` — the two that matter:
  - `2026-08-27-1141-16ea12e-post-rebase-baseline` — full run, 20/20 metrics, trusted
    for every phase **except `workload`** (its workload phase predates the fixes below).
  - `2026-08-27-2207-16ea12e-per-boot` — workload only, the trusted shape of that phase.
  - **Therefore cycle 1 needs a fresh full baseline first** (§4 step 1).
- **Machine**: nothing left running. Xvfb `:99` may linger (harmless, reused).
- Destin's live app: `/opt/YouCoded`. **Never touch it.** The rig is proven unable to
  (29 tests in `launch.test.mjs`).

## 3. Cycle 1 — the change (card 2), exactly

Three per-token costs on the streaming path, each **verified by hand** in the register
(`docs/active/investigations/2026-08-27-perf-defect-classes.md` N1–N3) and re-located
on the rebased code 2026-08-27 evening:

| id | what | where (worktree, `desktop/src/renderer/`) | the fix |
|---|---|---|---|
| N1 | `findArchiveBoundary(state.timeline)` — a reverse scan of the **entire** timeline, **inline in the render body**, on every render (= every streamed token). In the common no-compact case it walks to index 0 and returns nothing. | `components/ChatView.tsx:765`; impl `state/archive-boundary.ts:20` | memoize on `state.timeline` (identity changes only on append; `useMemo`), or track the boundary in the reducer when a compact/clear marker is appended |
| N2 | a **forced layout reflow per token**: `scrollToBottom` reads `scrollHeight` then writes `scrollTop`, from an effect whose deps include `state.lastActivityAt`, which the reducer stamps `Date.now()` on every delta (6 sites: `state/chat-reducer.ts:874, 1192, 1244, 1277, 1287, 1308`) | effect `components/ChatView.tsx:254`; hook `hooks/use-stick-to-bottom.ts` (~:92–99; the hook's own comment at :120–134 calls this "a FULL forced reflow") | drop `lastActivityAt` from the effect deps (it is a timestamp, not content) and pin only on `timeline.length`/`isThinking`; and/or coalesce to one `requestAnimationFrame` per frame; keep the existing debounced `onScroll` path as is |
| N3 | `splitIntoBubbles(turn)` is `useMemo`'d on `[turn]` but the reducer creates a **new `turn` object per delta**, so the memo never hits while streaming | `components/AssistantTurnBubble.tsx:410` (memo), `:241` (impl) | memo on the turn's content identity (e.g. block count + last block length) or make the reducer mutate-in-place-then-copy so the reference is stable until a block boundary |

Existing tests to keep green and extend: `desktop/tests/archive-boundary.test.ts`,
`desktop/tests/stick-to-bottom.test.ts`. Rule: every edit carries a WHY comment; every
behaviour claim gets a pinning test.

**What we already know the renderer gets right** (do not "fix"): per-session
`useSyncExternalStore` in `state/chat-context.ts`; `React.memo` on `AssistantTurnBubble`
and `ToolCard`; listener hygiene; no JSON parse on the streaming path (register, "What the
renderer already gets right").

**Expected effect, in the rig's terms** (these are the KEEP metrics for this cycle):

| metric | today | expectation |
|---|---|---|
| `workload.median.switchPaintedBySize.empty.medianMs` — switch into an EMPTY conversation while two others stream | **1.70 / 1.72 / 2.60 s** (three fresh boots) | should collapse toward the ~50 ms container swap |
| `workload.median.switchPaintedBySize.small.medianMs` — switch into a streaming small conversation | 1.5–7.9 s, noisy | should settle low and stop being bimodal |
| `workload.median.probe.longtaskTotalMs` | 230–300 s per ~4 min window | down |
| `workload.median.switchPaintedBySize.huge.medianMs` (PRIMARY) | 11.2–12.6 s | **must not rise** — this is the "did the fix just move work" guard |
| `replayStall.huge.median.rendererLongtaskMaxMs` (PRIMARY) | 5.6–6.3 s | must not rise |

Anything that improves the empty-switch tax while `huge` gets slower is a REJECT, and
the gate is built to say so.

## 4. Cycle 1 — the procedure

Run everything from the workspace root. **Do no other work on the machine during a
measurement** (the rig records load and discards busy samples, but the best filter is
not making noise).

1. **Fresh full baseline on unchanged code** (~26 min):
   ```bash
   node scripts/perf-lab/run.mjs --label cycle1-baseline
   ```
   Exit 0 and "20/20" in the summary, or stop and read `--help` / the `.md`. Do NOT
   reuse `post-rebase-baseline` for the A/B — its workload phase is pre-fix.
2. **Make the change** on `perf/optimization-pass` in `worktrees/perf-lab/` (N1, N2, N3;
   one commit each so a REJECT can bisect). `bash scripts/verify.sh worktrees/perf-lab`
   must pass.
3. **Re-measure** (the rig rebuilds automatically when the tree changed):
   ```bash
   node scripts/perf-lab/run.mjs --label cycle1-n1n2n3
   ```
4. **Gate**:
   ```bash
   node scripts/perf-lab/compare.mjs perf-reports/<baseline>.json perf-reports/<target>.json
   ```
   KEEP requires: the target metric improved by more than 5% **and** more than the
   baseline's run-to-run spread; no PRIMARY metric regressed beyond its spread; no new
   ERROR lines in any boot; every PRIMARY path present in both reports. A missing path or
   a zero baseline fails closed.
5. **KEEP** → open the PR from `perf/optimization-pass` to `youcoded` master with the two
   report stems and the compare output in the body (**ask Destin before pushing / opening
   the PR** — standing rule). **REJECT** → bisect by commit (N1 / N2 / N3), re-run
   `--only workload` (~18 min) per candidate, keep what keeps.
6. **Re-run the eyeball** after a KEEP: `node scripts/perf-lab/eyeball.mjs` puts the same
   build on Destin's real screen; ask him to switch between a streaming conversation and
   an empty one. His feel is the final calibration.

**Harness gotcha (2026-08-27, twice):** a `run_in_background` Bash task running the rig
was killed ~15–25 s after launch with no user action. Launch detached and watch the log
with `Monitor` instead:
```bash
setsid nohup bash -c "node scripts/perf-lab/run.mjs --label X > scratch/perf-lab/logs/X.console.log 2>&1; echo EXIT \$? >> scratch/perf-lab/logs/X.console.log" >/dev/null 2>&1 </dev/null &
```
Plain background watchers were killed the same way; `Monitor` polling for `^EXIT ` was not.

## 5. Cycle 2 — card 1, paged history (do NOT start until cycle 1 has shipped or been rejected)

- Spec: `docs/active/specs/2026-08-27-paged-history-and-read-hardening-design.md`
  (**draft, PAUSED, unreviewed, no plan** — written by the other session from an
  approved conversation). Their handoff:
  `docs/active/handoffs/2026-08-27-oom-read-class-session-handoff.md`.
- **Destin's decisions, made 2026-08-27, do not relitigate:** paged history over
  "stream + virtualise"; auto-fetch on scroll-to-top, no button; `PAGE_TURNS` 30,
  `PAGE_MAX_BYTES` 2 MB, `EVICT_AFTER_MS` 5 min once loaded > 2 pages, never below one page.
- Their spec lists "virtualising the ChatView" as out of scope (§6). Our measurement says
  rendering every entry is ~99% of the freeze. **There is no conflict**: paging + eviction
  bounds the rendered entries to ~1–2 pages, which is the effect virtualisation would
  have had. Say this in the spec review rather than re-arguing it.
- Procedure: spec review first (it was never reviewed as a document) → `writing-plans`
  → build → the same measure/gate loop. KEEP metrics: `history.huge.median.resumeStableMs`
  (22.0 s today), `history.medium.median.resumeStableMs` (14.8 s),
  `replayStall.huge.median.rendererLongtaskMaxMs`, `switchPaintedBySize.huge.medianMs`.
  **Rig note:** the workload settle rule assumes `ENTRIES_PER_TURN` = 2 entries rendered
  per turn *for the whole transcript*. Paging breaks that assumption on purpose — the
  rig will report every resumed switch as unsettled/short until `expectedEntries` is
  taught about pages. Budget that rig change into cycle 2; it is loud, not silent.

## 6. Cycle 3 — card 3, park hidden views

`ChatView.tsx:678/697` keeps every open session's view mounted (`content-visibility:
hidden`, deliberately not `display:none`). 463 MB → 7.0 GB at six sessions. After paging,
a view is ~30 turns, so unmount-and-rebuild on switch is cheap. KEEP metric:
`workload.median.pssAfterMb`; guard: `switchPaintedBySize.*` must not rise; scroll
position must survive (add a pinning test).

## 7. What the rig still owes (parallelisable with cycle 1, by another session)

1. **Wire `scenario-idle.mjs`** (911 lines, 48 tests, no importer). Report key must be
   `idleSessions` (`idle` is taken by the zero-session cold-start sample). Swap its latency
   metrics in for the two blind `idle.*` PRIMARY entries. This is what measures the two
   forever-scanners (register S1, M4).
2. **Replace the decorative stall metrics.** `replayStall.medium.median.mainProcessStallMaxMs`
   moves 173% run to run, `…ipcTotalStallMs` 78%: with 3 repeats they can neither register
   a win nor a loss. Honest replacement: main-process CPU seconds from `/proc` over the
   replay window.
3. **The transcript-mirror write-back** (ROADMAP, added 2026-08-27): the app's copy under
   `~/YouCoded/Personal/Conversations/…` was *larger* than the original and re-extended it.
   Not a rig problem any more (fresh boot per repeat); possibly an app bug class.
4. Coverage still missing: terminal, marketplace, sync, theme switching, buddy windows.
5. Perf-lab is not in CI (`grep -rn perf-lab .github/workflows/` → nothing).

## 8. What this project learned, compressed (the part worth carrying to any rig)

1. **Stability is not validity, and neither is coverage.** The most stable number ever
   reported (3,330 ms, 0.4% spread) was a hardcoded timeout. A metric can be in PRIMARY
   the whole time and be pointed at the wrong configuration.
2. **Every timing carries the count of what rendered, beside what was expected.** Nine
   rig defects were found this way in one day; none would have been visible from the
   timing alone. "N of M expected" is the cheapest guard there is.
3. **Every scenario declares what it measures and what it is blind to** (`MEASURES`),
   rendered beside the numbers, and a scenario claiming no blind spots fails its test.
4. **Fresh boot + fresh fixture per repeat.** Two attempts to clean up inside one boot
   both failed for reasons outside the rig's control (the app's own mirror). Isolation
   costs 40 s; contamination cost a day.
5. **Calibrate against the human once.** Headless, no GPU, virtual display — the numbers
   meant nothing until Destin opened the same build on his real screen and saw the same
   22 s. Do it again after every KEEP.
6. **The retraction survives its own instrument.** The stall probe overstates the main
   process; main still measured ~1%. Know the bias *direction* of every probe.

## 9. Standing rules (unchanged)

- Never touch `/opt/YouCoded` or real `~/.claude`, `~/.youcoded`, `~/.config/youcoded`.
  The rig writes only under `scripts/perf-lab/`, `scratch/perf-lab/`, `perf-reports/`.
- Never signal a process the rig did not provably spawn.
- Confirm before `git push` and before opening any PR.
- No product code change before its card is approved (cards 1–3 are).
- Explain outcomes in plain language; Destin does not read code. Annotate edits with WHY.
