---
date: 2026-09-01
status: active
type: investigation
topic: ~100 fixed sleeps still stand in for signals in the desktop suite, and mcp-startup-wiring cannot survive eight concurrent full runs
---

# Fixed sleeps as signals, and the one test that cannot be hoisted

**Where this stands.** youcoded#362/#363 fixed twelve causes of intermittent failure; the desktop
suite passes six concurrent full runs 6/6 with zero unhandled errors (Desktop CI green on all three
OSes at `0371c265`). Two residuals were left on purpose. Both are judgment calls, not facts to accept.

**(1) ~100 `await new Promise((r) => setTimeout(r, N))` remain** (36 in
`youcoded/desktop/tests/native-session-host.test.ts` alone). Not all are waits — some legitimately
let time pass, and one in `transcript-watcher.test.ts` is a *negative* assertion whose whole job is a
bounded pause (raising it turned 250 ms into 15 s and made that file 6x slower; reverted). Each one
that stands in for a real signal is a latent copy of the steer-test bug #363 fixed (`7c99e6f6`).
Converting them blind is more dangerous than leaving them: convert the ones you touch. The pattern is
the first invariant in `.claude/rules/test-suite-hygiene.md`.

**(2) `youcoded/desktop/tests/mcp-startup-wiring.test.ts` exceeds even the 30 s budget at EIGHT
concurrent full suites**, and times out at 5 s per test under lighter load (seen 2026-08-25 on both
`feat/send-user-file-card` and master `73e2defe`). It `await import()`s all ~3,900 lines of
`ipc-handlers.ts` inside each test body (five sites). The import genuinely cannot be hoisted: the
file's `os` mock is a closure over a per-test temp home, so a static import would evaluate before
that directory exists.
<!-- claim: {"path": "youcoded/desktop/tests/mcp-startup-wiring.test.ts", "contains": "vi\\.mock\\('os', async \\(importOriginal\\)"} -->
Eight concurrent suites is past any real scenario (CI runs one; a developer might run two), so this
was left rather than restructured on speculation. If it fails on real CI, restructure the mock so the
import can move to module scope — do not raise the number again.

**Evidence and measurements:** `docs/testing-under-load.md`.

**Related.** The macOS-only reds on the same "budget is marginal" hypothesis are tracked by the
sync-spaces-engine debounce item (`2026-09-01-sync-engine-debounce-macos-flake.md`) — on 2026-08-31
(youcoded#366) the macOS leg went red three times on one unchanged tree with a different victim each
run while Ubuntu and Windows passed all three.

**Update 2026-09-02 — six converted, and the eight-concurrent claim did not reproduce.**

*Sleeps:* 108 counted, now 102. The six taken were the ones that were not merely letting time pass:
five copies of `send('go')` followed by `await new Promise(r => setTimeout(r, 20))` in
`native-session-host.test.ts` — a guess that a child's turn had started, which is the exact bug
youcoded#363 fixed once in that same file and left a helper for (`waitForTurnInFlight`, previously
used at one site out of six) — and one whose own comment said "poll for it" above a `setTimeout(r, 30)`.
The rest were read and left: most of the large ones (120/150/80/80/150 ms) are NEGATIVE assertions —
"wait a bounded time and prove nothing happened" — which have no signal to wait on by construction,
and the `setTimeout(r, 10)` majority sit inside fake model streams, where they ARE the simulated work.

*MCP startup wiring:* did not exceed its budget in any of 27 full local runs on 2026-09-02 — 1 alone,
6 concurrent, 4 pinned to 4 cores with `taskset`, and two 8-way concurrent sweeps. The 8-way sweeps
DID break the suite, just not here: `harness-eval-orchestrator` (3/8 runs) and `harness-review-runner`
(4/8) hit 30,000 ms, and two React tests (`comment-list`, `feedback-section`) failed on effect timing.
All four are fixed. So the residual recorded above is still open in principle but has never been
measured failing; the file's in-body `await import()` remains unhoistable for the reason stated.

**History.** Filed 2026-08-28 as the deliberate residual of #362/#363; re-verified 2026-09-01 (the
five in-body imports and the `os` mock are unchanged); re-measured 2026-09-02.
