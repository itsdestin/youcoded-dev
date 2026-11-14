---
status: active
date: 2026-11-14
topic: Mesh Phase 0 T19 — holding a reply across sleep (simulation only)
---

# T19: holding a reply across sleep

Written by the lead from the investigating agent's prototype output (the agent stopped before
writing its own report). Numbers are read straight from
`docs/active/prototypes/2026-11-14-mesh-phase0/T19/results.jsonl`; `bash run-all.sh` there
re-runs everything (about 8 minutes).

## 1. Verdict

**PARTIAL.** The pass line ("no file change or command happens between wake and release, on
every system") was met **in a simulation on Linux only**. No real sleep was performed on any
system: this machine may not be suspended by an agent, and no Windows, Mac or phone is attached.

## 2. What was done

- A stand-in app (`app.mjs`) and a stand-in assistant runtime (`runtime.mjs`) that asks the app
  before every write. "Sleep" is both processes frozen with SIGSTOP for a random time, stopped
  and continued in random order (`trial.mjs`).
- Three ways for the app to notice the sleep: `signal` (told before sleep; the message can be
  lost), `gap` (the app notices its own once-a-second tick skipped), `both`.
- `detector-unit.mjs`: which detector notices which kind of pause. `clocks.mjs`: which clocks
  count sleep time on this machine. `pty-stop.py`: does freezing the assistant's terminal
  group freeze everything it started.

## 3. Findings

1. **No hold: writes happen after wake.** Baseline, 50 trials: 50 had at least one write after
   wake that nobody approved after wake (514 such writes).
2. **Sleep signal alone is not enough.** With the signal always delivered: 0 of 50 trials
   slipped. With the signal lost a quarter of the time: 28 of 100 trials slipped (6,433
   writes), every one in a trial where the signal was lost.
3. **Signal plus the tick gap: no slips.** 100 trials with a quarter of signals lost: 0 slips.
   Gap alone, 200 trials: 0 slips. (The first run had 2 and 8 slips; the fix was to also check
   the gap at the moment a request is handled, `app.mjs:80`, not only on the tick.)
4. **A command already approved before sleep still runs after wake** ("straddle"): 12 to 19
   trials per 100. The hold cannot stop these: the answer was given before the lid closed.
   The design must say so; the takeover rules must treat such a write as the old host's.
5. **Release took 0.1 to 1.8 seconds** after wake in every held trial; none was left held.
6. **Which detector notices what** (`detector-unit.out`): comparing the wall clock with the
   since-boot clock catches a real suspend only when the since-boot clock stops during sleep;
   the tick gap catches real suspend, a frozen process and a 5-second stall; a clock set
   **back** by the network time service is caught by neither (harmless: no sleep happened).
7. **Freezing the process group is not a reliable hold.** A child that put itself in its own
   group kept running while the group was frozen (`pty-stop.out`: A frozen, B and C advanced).
   Keys typed while frozen were delivered afterwards.

## 4. What this changes in the design

- **Section 5 (hold across sleep):** the hold is "sleep signal **and** tick gap, checked on the
  tick and again whenever a pre-action ask is handled". The signal alone is never relied on.
- State plainly: "a command approved before sleep can finish after wake; it counts as written
  by the old host". Add to the takeover tests (T12/T13 rig).
- Pausing the process is dropped as a hold method (finding 7).
- **12.5 (waking from sleep)** stays an open risk until real sleeps are run.

## 5. Needs Destin

Nothing new. Real sleep tests on his desktop (round 14, Q-6) are still owed and need the
remote sign-in and wake-over-network set up first.

## 6. Could not test here

Real suspend on Linux, and everything on Windows, macOS and Android. Whether each system
delivers its sleep signal before freezing the app. Whether Claude Code's real pre-action ask
waits indefinitely for a "wait" answer (the stand-in runtime does).
