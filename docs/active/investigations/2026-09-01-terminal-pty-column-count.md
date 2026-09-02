---
date: 2026-09-01
status: active
type: investigation
topic: Terminal text stops two-thirds across the pane — the PTY never learns the real column count
---

# Terminal text stops two-thirds across the pane

**Symptom.** In a 1440×900 dev instance (xvfb, plan
`scripts/ui-review/plans/electron-live-session.json`, shot
`scratch/ui-phase-d-electron/shots-electron-live-session/app/e2-terminal-view.png`), Claude
Code's TUI and its input line wrap at roughly 950 px while the terminal pane is 1440 px wide.
Destin has not seen this in his own app.

**Hypothesis (from the P-20 rig, not yet proven).** The PTY was sized once, too early, and the
correction never reached it. `TerminalView.tsx` sizes the PTY through `fitAndSync` →
`flushResize` (`youcoded/desktop/src/renderer/components/TerminalView.tsx` ~:286–340):

1. `fitAndSync` returns without fitting while the container is 0×0 — which is the case
   whenever the terminal mounts behind the chat view.
   <!-- claim: {"path": "youcoded/desktop/src/renderer/components/TerminalView.tsx", "contains": "el\\.clientWidth === 0 \\|\\| el\\.clientHeight === 0\\) return;"} -->
2. Once the pane becomes visible, the first real fit is debounced (120 ms) and deduped
   against `lastCols`/`lastRows`; if that first flush is dropped or coalesced, the PTY keeps
   whatever width it got at spawn, and CC wraps to that.

**What would settle it.** A dev-instance run that logs every `session.resize` call for one
session alongside the pane width: if the PTY only ever receives the initial (smaller) grid,
the hypothesis holds. Also check whether a maximized-at-launch window avoids it (Destin's
launch shape) — that would explain why he has never hit it.

**History.** Added 2026-08-27 (ledger P-20.1). Still open 2026-09-01: the dedup/debounce
path is unchanged (only `71ec99ae` touched the file since, a paint-colour change).
