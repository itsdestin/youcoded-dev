---
title: Performance roadmap consolidation and migration ledger
status: active
date: 2026-09-29
---

# Migration ledger

`docs/roadmap/perf.md` is the primary owner for app responsiveness and measurement validity. This is a **roadmap move, not a shipped-fix closure**: the three accepted Find/chrome/shrink app edits shipped in youcoded#591 (`eebcdea314c5d6b42444d991789a2541c405dbb8`), but the broader smoothness program stays open. The highlighter, plain parser, hidden geometry gate and first-page preparation experiments were removed from the integration source and preserved at `scratch/perf-lab/paused-rendering-experiments/`; see `docs/active/investigations/2026-09-29-performance-status.md` for measured versus unmeasured evidence. Historical details of old entries are preserved in workspace revision `3ca6e784aaad160c5c424d45d5eb95a547dc9728`: `git show <revision>:docs/roadmap/<old area>.md`. Descriptions below identify the old entry's opening words so each move can be audited without repeating its biography in the live backlog.

| Former primary entry (old area, opening words) | New primary perf.md entry (opening words) | Qualification retained |
|---|---|---|
| user-interface: Sustained sluggishness in real use | The app still feels sluggish across sessions and over time | Historical cycle outcomes remain in the linked investigation; not shipped closed. |
| user-interface: Switching sessions in terminal view redraws | Session switching in terminal view may redraw | Software-lane result inside spread; hardware unmeasured. |
| user-interface: Same per-tile blur cost | Other card grids may repeat per-tile blur | Suspected, not confirmed GPU defect. |
| user-interface: The animation frame-budget cost ships to phones | Animation frame budgets have not been checked | Needs real-device measurement. |
| dev-workspace: The perf lab's new "blank on arrival" count | The blank-on-switch detector has not demonstrated sensitivity | Zero on fixed code alone is not a negative control. |
| dev-workspace: The perf rig cannot see the file pane during a streaming reply | File-pane content changing while a different file is open | Recent Files-open long-history mixed diagnostics exist; other-file edits remain unmeasured. |
| dev-workspace: The perf rig's native-stream phase streams into a brand-new chat | Standard native-stream runs use a fresh chat | Six seeded long-history mixed sessions have been measured; the standard gate still differs. |
| dev-workspace: Two numbers the workspace can measure but never records | The rig has no recurring same-machine startup-mark and idle-CPU trend | Manual real-history capture exists, nightly lane not built. |
| dev-workspace: The speed-test comparison judges two runs | Comparison controls are only partial | Current comparator checks identity and pre-boot noise; mid-run external interference is still unmeasured. |
| dev-workspace: The blank-content instrument measures partly with its own weight | Scrollblank sampling itself can slow the renderer | Probe overhead/false positive risk; no clean result claimed. |
| dev-workspace: The terminal's DRAWING of a large burst | Sustained terminal output and typing remain unmeasured together | Later 200/2,000-line bursts checked visible suffix and found one unassigned hardware task; old claim of never measured withdrawn. |
| dev-workspace: Every perf number is taken software-rendered | Software-rendered runs do not establish real high-refresh behavior | Later native probe disproved one software attribution; don't generalize to FPS. |
| dev-workspace: Perf rig: the native-chat parity screen photographs | Identical-code native-chat screenshots can differ | Nondeterministic baseline; known duplicate-bubble photo also changed. |
| dev-workspace: Perf rig: the artifacts phase's session-files drawer lists nothing | The artifacts rig sometimes shows an empty session-files drawer | Cause unknown. |
| dev-workspace: Perf lab: the rig is built and THREE measurement cycles | The repeatable performance suite does not yet cover | Merged with the remaining-coverage umbrella; historic cycles did ship, complete coverage didn't. |
| files: A very large Markdown file still takes ~0.9 s | A very large Markdown file still pauses visibly | Ordinary small-file 570 ms claim withdrawn; colouring is a decision. |
| files: Stutters when editing a file | Editing a file, copying code or navigating an HTML preview | Symptoms reported; no master-lane timing yet. |
| chat-data: Starring, tagging or renaming a chat | Starring, tagging or renaming a chat triggers a later full search-index rebuild | Separate read/heal half shipped in #573; index remains open. |
| themes: A theme whose mascot has companions | Theme mascot companions may animate | Body measured; companions unmeasured; `all` scope preserved. |
| themes: A community theme's custom CSS can run a never-ending animation | Community CSS may keep an always-visible theme animation running | Reduced Effects exists; opt-out-by-default author-motion policy undecided. |
| sync: Sync notices changes by watching every single file | Large synced projects still consume more file watches | Existing correction shipped 2026-09-29; platform-specific lean strategy undecided. |
| sync: A synced code project that already keeps its own version history | Synced code projects that already keep Git history | Duplicate sync work is a product decision, not a measured speed ratio. |
| sync: The Personal sync history only grows | Personal sync history keeps growing | Merged with sync: Sync will hit GitHub's size ceiling; measured sizes and original design link preserved. |
| sync: Sync will hit GitHub's size ceiling | Personal sync history keeps growing | Earlier 841/652 MB and later 1.7/2.5 GB observations are historical snapshots, not one current measurement. |
| sync: A device that falls far behind | A device far behind on a slow connection | Hypothesis only; recorded 280 MB completed in 44 s. |
| remote-access: With a phone connected, the computer sends it | A phone receives output and chat events for every open computer session | Remote fanout identified in review; device load not measured. |
| remote-access: First connect from a phone sits on a white screen | First remote connect can leave a phone showing white | Built phone first-paint timing absent; scripted delay fixed separately. |
| remote-access: A reconnect costs far more than what was missed | Phone reconnect still transfers a full copy | Merged with remote-access: A dropped connection should resume rather than re-sync; preserve full snapshot fallback. |
| remote-access: A dropped connection should resume rather than re-sync | Phone reconnect still transfers a full copy | Sequence-based proposal, not shipped. |
| android-only: The phone still reads long conversations | Android still reads an entire long conversation | Desktop cycle-2 paging did not implement Android Kotlin tail. |
| marketplace: Every marketplace refresh re-downloads the whole catalog | Marketplace refresh sends the whole catalog and details | Merged with marketplace: The catalog payload carries detail-page data; slim list first, delta refresh later. |
| marketplace: The catalog payload carries detail-page data | Marketplace refresh sends the whole catalog and details | Original size/~5,000 rows and investigation link retained. |
| files: A dev instance's main process ran out of memory | After 73 minutes and ~15 helpers changing files | Fix in #335 may cover; not reproduced since. |
| files: Git surface profiling checkpoint before Android or multi-window | Git refresh for a file can start up to three git processes | files keeps only the distinct parked helper consolidation and release checkpoint as a cross-reference. |
| files: The app held roughly a quarter of a million file watches | The old ~250,000 file-watch count exhausted available watches | #501 and #590 fixes shipped; remeasure before closing, not another proposed code fix. |
| files: Git surface profiling checkpoint before Android or multi-window (nonperformance half) | files: Git surface phase 2 | The parked duplicate repo-containment helper and release checkpoint remain in files as a distinct open item; its measured-cost half maps to the perf Git refresh item above. |
| chat-data: v1.3.1 release blocker Smaller reads left over from cycle 2 | v1.3.1 blocker, blocked on simplification phase 5 | Runtime-cost portion migrated; D11 type ambiguity remains in chat-data with same blocked release flag. |
| dev-workspace: The main-process blocking-call list still holds ~650 calls | Remaining main-process blocking work can still interrupt every window | Runtime B2/B4/B5/B7/B10/B12 and theme writes moved; dev-workspace keeps distinct allowlist bookkeeping. |
| dev-workspace: Two small tooling papercuts from the premium-motion session | Fresh perf worktrees re-download ~490 MB | Only asset-download cost moved; dev-workspace keeps dev-stop child-label papercut. |

## Incoming Office entries consolidated on resume

After integrating newer workspace master, four additional primary performance entries moved from `files.md` into perf: **Restoring a kept version** (unnecessary picture copying), **If one project's file list hangs** (file-list slot starvation), **On a big Excel workbook** (autosave typing stalls), and **Every open Office document** (retained editor memory). Their 2026-10-02 confirmation/needs-verify statuses are preserved; this session did not remeasure Office. Missing-picture, concurrent-save and recovery correctness remain separate file-feature concerns. This extends the original 38 moved/split-source ledger to 42; it is not a shipped-fix closure.

## Intentional nonmoves and cross-references

Primary runtime cost and measurement questions now live in `perf.md` even when a platform or release decision is involved. Distinct feature semantics remain in their own areas, without a duplicate open performance entry: `chat-data.md` retains D11's type ambiguity and searching never-loaded history; `files.md` retains the parked Git helper consolidation and Android/multi-window feature checkpoint while perf owns process-spawning cost. `themes.md` retains the unrelated Windows Minimalist blur release check; `remote-access.md` retains protocol correctness, permissions, order, and responsive button semantics apart from the moved first-paint/reconnect costs. `android-only.md` retains the broader Android rebuild; `marketplace.md` retains catalog feature behavior. `local-models.md` keeps choice of runner hardware and model-speed information; `native-harness.md` keeps cloud cache/specialist cost decisions; `sync.md` keeps security, lease and correctness questions apart from moved watch/history/catch-up resource costs. `dev-workspace.md` keeps blocking-call test allowlist classification and dev-stop labeling, not the runtime/asset-download cost. The watch explosion already had #501 and #590 code fixes; perf requests a remeasurement, **not** an unbuilt duplicate fix.

The perf program's newly confirmed priorities (hidden-first-page typing stalls, intermittent switch/resize stalls, cold Find) and the aggregated **coverage gaps** are separate entries with evidence/status in `perf.md`. The ledger preserves historical scope without asserting that paused experiments or unmeasured lanes shipped.
