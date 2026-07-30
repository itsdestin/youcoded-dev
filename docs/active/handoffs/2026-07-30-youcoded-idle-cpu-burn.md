---
status: shipped
created: 2026-07-30
owner: completed 2026-07-30 (youcoded PR #274)
---

# Handoff: YouCoded desktop idle CPU burn — measure, attribute, fix

> **RESOLVED 2026-07-30 — youcoded PR #274.** Findings and corrections:
> `docs/active/investigations/2026-07-30-idle-cpu-burn.md`.
>
> Root cause was perpetual CSS animations that were not layer-promoted, NOT the
> lease/heartbeat lead below (renderer JS profiled 99% idle; `pty:output` = 0
> bytes). Two premises below are wrong and are corrected in the investigation:
> the 104-133% live-app figures were **not idle** (the measuring session was
> itself running inside the app alongside 6 other streaming CC sessions), and
> the "~0% hidden" budget was already met — Chromium throttles hidden windows
> correctly, so the problem is exclusively visible-and-idle.
>
> Everything below is preserved as the original brief.

## Why

The production app family burns real CPU around the clock on Destin's Z13, which
is battery cost on every user's machine. Measured evidence, all from external
read-only observation of the live app:

- **2026-07-28 ~21:00** — `/opt/YouCoded/youcoded --type=zygote --no-zygote-sandbox`
  (PID 6468 that boot) at **124–133% CPU sustained**; 1,914 CPU-seconds over
  1,534 s of wall clock (>1 full core average since launch). A sibling
  `--type=zygote` process held 77–82% at the same time. Caveat: ps comm/args for
  Electron children can mislead — map PIDs via `/proc/PID/cmdline` before
  trusting the process type.
- **2026-07-30** — over a 22 h uptime, the youcoded process family accumulated
  ~276 CPU-minutes (137.7 + 78.4 + 31.7 + 27.9) ≈ **21% of one core, continuously**.
- Battery context: median on-battery draw is 25.1 W (4-day distribution);
  the family's continuous burn plus its timer wakeups is a meaningful slice of
  the light-use budget.

## Strongest lead

The **lease/heartbeat subsystem polls and logs relentlessly**. During the
2026-07-27 network outage window the journal shows, every ~30 s, continuously:

```
youcoded[5879]: [lease] hub disconnected
youcoded[5879]: [lease] renew a473d97a: null (hub gave no answer)   ← ×4 lease ids
```

Four leases renewed on a 30 s cadence with per-cycle logging, and an apparent
tight reconnect loop when the hub is unreachable. Question for the session:
what work does each renew fan out to (IPC → renderer wakeups → React re-renders?),
and what does the loop do when offline (backoff or hot spin?).

Other hypotheses, unordered: renderer animation loops running while the window
is idle/hidden (status dot, theme effects, terminal glyph atlas, waiting games);
status/usage polling timers; hot store causing re-render churn; pty-worker
polling; GPU-process compositing at the panel's 180 Hz even when content is
static (measure — not YouCoded's code, but YouCoded's window).

## Constraints (non-negotiable)

- **Live-app safety rule applies in full** (`.claude/rules/live-app-safety.md`):
  the production install is read-only-from-outside. `ps`, `/proc/PID/*`, journal
  reads are fine; DevTools/IPC/signals/file-touching are not.
- All instrumented measurement happens in a **dev instance**
  (`bash scripts/run-dev.sh <worktree> --label "Idle CPU"` — distinct `--offset`
  + `--profile` if another dev instance may be running) or the **UI workbench**
  (`bash scripts/run-workbench.sh`, renderer-only, fake `window.claude` — ideal
  for isolating renderer timers from backend noise; after any mock-shim change
  run `node scripts/workbench-boot-check.mjs`).
- Code changes in a worktree; Serena for TS symbol queries; if IPC surfaces are
  touched, `ipc-channels.test.ts` parity applies.

## Suggested method

1. Baseline in dev: app idle-visible vs minimized/hidden vs workbench-renderer-only.
   Thread-level attribution via `ps -eLo pcpu,tid,comm` deltas and
   `/proc/PID/task/*/stat`; Chromium tracing via the dev instance's remote
   debugging port (`scripts/cdp-eval.mjs` header documents CDP access) —
   `Performance`/`Timer` categories will name the JS timers directly.
2. Kill hypotheses one at a time (disable lease subsystem / hide window / blank
   theme) and re-measure. One variable per run.
3. Fix the top offenders in youcoded PRs. Idle budget worth proposing:
   **<5% of one core family-wide, idle-visible; ~0% hidden.**
4. Leave behind a repeatable measurement (script or documented procedure) so the
   number can't silently regress; findings doc to
   `docs/active/investigations/`, flip this handoff + ROADMAP item when done.

## Paste-prompt for the investigating session

> Read docs/active/handoffs/2026-07-30-youcoded-idle-cpu-burn.md and execute it:
> measure and attribute YouCoded's idle CPU burn in a dev instance, fix the top
> offenders, and leave a repeatable measurement behind. Live-app safety rule
> applies — never touch the production install.
