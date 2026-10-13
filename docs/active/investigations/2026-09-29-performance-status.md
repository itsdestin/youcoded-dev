---
title: Performance program — current state and next steps
status: active
date: 2026-09-29
last_updated: 2026-10-04
---

# Start here: performance status

**The authorized closeout is complete. The broader performance program remains open.** This page is the current restart point; the backlog is `docs/roadmap/perf.md`.

## Merged and cleaned up

| Repository | Merge | Result |
|---|---|---|
| App | youcoded#591 — `eebcdea314c5d6b42444d991789a2541c405dbb8` | Loaded-message Find, unchanged chrome-measurement reuse, bottom arrival after content shrink, and the bounded Find expiry repair. |
| Workspace | youcoded-dev#235 — `c745172e693418a577fc00004d2ff0885d0d2678` | Performance backlog consolidation, measurement-tool safety/validity fixes, verifier screen-gate repair, evidence preservation and lifecycle archival. |

Both PRs and their postmerge CI passed. The original performance session's app/workspace worktrees and local/remote branches were removed after remote ancestry and evidence preservation were verified. Unrelated work was left alone. No release tag or installation was performed as part of this closeout.

## Verified results and boundaries

- **Loaded-message Find:** searches loaded authored user/assistant messages, including folded rows; the controller is unmounted while closed. Reference-pill labels and Unicode offsets are covered. It does not search never-loaded pages or reasoning/tool details.
- **Delayed Find correction:** if a resize has already queued a correction when the 800 ms window expires, apply one final correction before stopping. User intent still cancels it and the four-correction cap remains. A package-attributed delayed-frame run and an ordinary uninstrumented run both kept the exact match stable and uncovered; screenshots were inspected. This does not establish behavior for layout first reported after expiry or position changes without a resize notification.
- **Chrome measurements:** historical matched full-content switches improved from 55–56 ms to 15–17 ms by retaining unchanged inherited geometry. This is not a fix for every switch/resize stall.
- **Bottom arrival after shrink:** corrected a reproduced approximately 289 px gap hiding the newest tool result while the chat was still marked at bottom. User unstick/Find intent and tab-return policy remain intact.
- **Final local verification:** full desktop types/tests/knip/lint/design lint/invariants, screen-open checks and journeys passed with eight test workers; Android executed 594 tests in each of three variants with zero failures/errors/skips, excluding `bundleWebUi`; 431 workspace script/hook tests and 594 CI-equivalent perf-tool tests passed. The fixture-download test was excluded from the latter.

Exact final Find evidence and test limitations: `docs/archive/investigations/2026-10-03-find-expiry-closeout.md`. Failed originals were retained, not replaced by successful runs. The earlier mixed status and diagnostic chronology now lives in `docs/archive/investigations/2026-10-04-performance-closeout-status-snapshot.md`, not as instructions on this page.

## Work from 2026-10-04 and 2026-10-05 (shipped 2026-10-08)

A separate performance session built **five fixes**, then a hitch recorder and a session-switching fix. All of it merged to master on 2026-10-08 (youcoded#616, youcoded-dev#250): long code blocks while a reply streams, big spreadsheets (CSV/Excel), scrolling that waited for a busy page, terminal floods (a speed brake so output is not lost and Ctrl+C answers at once), ordinary reply-streaming cost, the always-on hitch recorder, and cheaper session switches. Records: `docs/archive/investigations/2026-10-04-performance-gap-review.md` and the four 2026-10-05 investigations beside it. **Every still-open question from that work is in `docs/roadmap/perf.md`** (owner decisions, the unexplained click-to-screen delay, Windows/macOS/phone checks).

The three items under "Next performance work" below were **not** that session's focus. One of them, hidden-history typing stalls, did not reproduce in a single run on current master (zero freezes over 50 ms; September's runs showed 122-145 ms): one run, so it stays open until repeated. The uncommitted experiments of the old stream-attribution session are on branch `backup/performance-stream-attribution-wip` (app and workspace repos): reference only, never apply over master.

## Next performance work

1. **Remeasure hidden-history typing stalls on current master.** The old source showed synchronous hidden first-page Markdown work; upstream rendering/loading code has changed since those experiments. Establish a fresh cause before restoring any candidate.
2. **Investigate intermittent switch/resize stalls and approximately 1 Hz callback episodes.** Historical slow cases remain unexplained; successful short runs are not a general resolution.
3. **Measure cold Find indexing and lifecycle costs separately.** First query, streaming refresh and reopened-search retention remain open. Searching never-loaded history is a separate scope item in `docs/roadmap/chat-data.md`.

Other coverage remains in perf: long soak/retained-memory slopes, giant bodies, sustained terminal output with typing, expensive tool churn, private sync interference, effects-heavy native presentation, native drag/resize, and Android/remote motion. These are coverage gaps, not all confirmed defects. Long soak was explicitly deferred. Native compositor feedback and renderer callbacks are not certified FPS or input-to-photon measurements.

## Paused experiments — not shipping fixes

The source archive preserves **27 files**, including both accepted changes and unfinished experiments. **Never apply its full patch over master.**

| Candidate | Restart boundary |
|---|---|
| Shared highlighter registry | Earlier focused tests/review and narrow measurements exist; residual work and variability prevent a completed-stall claim. |
| Literal paragraph parser | Direct JSX shortcut was rejected for changing streaming DOM identity. The parser-level replacement had narrow fixture evidence, not repeated general acceptance. |
| Hidden physical-scroll gate | Review repaired activation/observer races, but final runtime activation/Find acceptance was not completed. Do not change the legacy tab-return policy inadvertently. |
| Cooperative first-page mdast preparation | Interrupted while repairing rendered-group coverage, global cache/queue budgets and test-only API cleanup. No final build, review or runtime acceptance. It is not off-thread rendering. |

Recovery instructions: `docs/active/prototypes/2026-09-29-paused-rendering/README.md`. Historical implementation detail: `docs/active/plans/2026-09-29-history-rendering-and-stalls.md`. The old candidate stamp `4d7b0adf86f9` predates the interrupted preparation work and later scroll repairs; it is not current source.

## Evidence and restart rules for this work

- `docs/active/investigations/2026-09-29-performance-evidence-index.md` maps historical scratch paths to the preserved private evidence, manifests and shipping receipts. The final snapshot contains 116,217 verified regular files and 430 verified symlink targets; an off-device backup has not been verified.
- Restore only a selected experiment onto a fresh isolated branch after comparing it with current source. Preserve complete-page publication, exact content, background progress, Find navigation and user scroll intent.
- Measure both active typing and resume-to-complete-content/immediate activation. A change that merely moves the hitch into the click is not an improvement.
- Keep timed measurements serial; separate profiled diagnostics from clean comparisons and retain failed/slow originals.

Historical bounded results: `docs/archive/investigations/2026-09-28-short-cycle-results.md`, `docs/archive/investigations/2026-09-29-long-history-mixed-files.md`, `docs/archive/investigations/2026-09-29-native-presentation-feedback.md`, and `docs/archive/investigations/2026-09-29-presentation-followup-results.md`. Their measurements do not certify sustained whole-app smoothness.
