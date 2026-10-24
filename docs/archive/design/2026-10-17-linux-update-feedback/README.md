---
status: merged
work-item: 162
app-pr: https://github.com/itsdestin/youcoded/pull/630
app-commit: dff19cdc1409dddf49a66500092a50ef89432c99
---

# Linux update feedback

Destin reported that **Launch installer** gives no useful feedback after the administrator password. He asked to investigate and fix directly, and approved the small-fix workflow in chat.

## Initial evidence (before the fix)

- `update-installer.ts`: Linux native packages run through `pkexec`; `runToCompletion` discards stdout and stderr with `stdio: 'ignore'` and returns only an exit status.
- `UpdatePanel.tsx`: one `launching` state covers verification, the password prompt, package installation and restart. Its only indication is a disabled **Launching…** button.
- The launch promise is not caught. Closing the panel resets the local install state even while the package manager is still running.

## Focused design

Keep the existing update dialog and full-width button. During installation, show only the current action in its label: preparing, awaiting administrator approval, the installer's latest reported line, then restarting. No expandable section, standalone output, or explanatory text underneath. Never invent a percentage or claim authentication succeeded without evidence. Failure diagnostics remain inside the approved error notice's Details. This supersedes the rejected bare loading line and normal-operation Details card in the earlier review rounds.

Keep an in-flight installation across closing/reopening the dialog. Filter progress by job ID. Idle closed panels unsubscribe; a panel that owns an active installation retains only its bounded progress snapshot while hidden, without React updates, and restores it on reopening. Prevent concurrent backend launches. An uncertain outcome (transport loss or timeout) must not offer a second installer while the first might still be running. Leave the existing verified-download gate and remote update refusals intact.

References: the existing Update available dialog, EngineCard's installation/error controls, and LocalModelDownloadStrip's real progress/status feedback. Use the original shared Button and the approved ErrorState/notice Details rather than a new visual language.

## Change ledger

| Number | Change | Rule |
|---|---|---|
| 1 | The existing button label updates with the current action; no extra content beneath it. | Destin's explicit correction; reflect known facts, not guesses. |
| 2 | Installation errors retain their actual details; unknown outcomes offer report/diagnose, not another install. | Error message standards; one installer at a time. |
| 3 | Closing/reopening the popup retains the running installation. | Closing a view does not cancel the system package manager. |

## Safety and verification

No real package manager, password prompt, installed application replacement or app relaunch was used for automated testing. Backend tests inject children; renderer tests inject progress/results. Visual review uses the real renderer with a fake backend.

Final `bash scripts/verify.sh <session>/youcoded` passed: 5,922 tests (283 suites; 36 tests/1 suite skipped), source/test types, knip, lint, design lint, invariants, screens and journeys. Logs: `scratch/verify-20261017-211503-1580933/`. All 16 workbench boot-check routes mounted. Fresh code review and follow-up found no remaining blockers. Android's host installer and the marketplace Worker were not changed or runtime-tested.

Screenshots cover light, midnight, Halftone Dimension, Meadow Mist and 390px width. Identical before-state screenshots are expected: the old UI showed the same Launching button for every native-install phase. The first review deck was readable at 1440×900. At 1280×800, before/after, status, headline and answer buttons fit, but a visual reviewer still found the last Risk note faded/clipped on steps 1, 2, 4 and 5 after two layout/copy revisions. Do not claim the smaller-window deck layout is clean; use full-width viewing or revisit deck infrastructure separately. This limitation is in the review presentation, not the update panel.

## Submitted review and revision

`linux-update-feedback.review.answers.json` records Destin's submitted decisions: LU-3 (failure Details) and LU-4 (uncertain outcomes) approved; LU-1, LU-2 and LU-5 rejected. LU-1: “no. i dont like bare text like this . keep the button styling”; LU-5: “this just doesnt matcch our ui design guide at all”. The answered deck and its screenshots are unchanged.

Revision 2 keeps the existing full-width Button through preparing, approval, running, handoff and restart. Only its label changes, with the shared spinner inheriting the button's text colour. System output uses the standard Details FoldRow rather than a standalone log box. Approved errors remain unchanged. Updated behavioral tests assert the actual disabled full-width button, not just text, and opening Details to read output; both failed against the rejected bare-text design before the revision.

`linux-update-feedback.review-2.json` revisits only rejected LU-1/LU-2/LU-5. `runs-2/` captures original button → revised button in four themes and at 390px. Its rendered preview was checked at 1440×900 and 1280×800 with both pictures, all notes and answer controls visible. Reference pieces: the original UpdatePanel action, shared Button and standard FoldRow.

Revision 2 verification passed all required desktop checks (`scratch/verify-20261018-084241-1705963/`); the fresh follow-up reviewer found no blockers. Master advanced meanwhile: `c8c44c14b` also touches `preload.ts`, but inspection shows its edits are in the unrelated hitch recorder, not updater channels. Nothing was silently integrated; recheck against current master before shipping.

Revision 2 results: LU-1 and LU-5 approved; LU-2 marked Other because its separate Details card looked unrelated. Destin then clarified in chat: “we don't need anything to be expandable and we don't need extra detail beneath the button. just show the current action in the button as the download progressses”. Revision 3 removes all normal-operation details/helper text, and updates the button with only the latest non-empty package-manager line (bounded to 160 characters and visually truncated as needed). Preparing/approval/restart retain their known labels. Error handling is unchanged. Regression tests fail against revision 2, then pass with the button-only implementation, including changing actions and catching up after closing/reopening.

`linux-update-feedback.review-3.json` is a single LU-2 comparison. Its preview was inspected at 1440×900 and 1280×800; screenshots cover four themes and 390px width. Earlier answered decks and decision files are preserved.

Revision 3 passed all required desktop checks (`scratch/verify-20261018-114846-2109898/`), and the fresh narrow code review found no blockers. No real privileged installation was run.

Final approval is recorded in `linux-update-feedback.review-3.answers.json` (LU-2 yes, submitted 2026-10-18 18:55). Together with the earlier approved LU-1/LU-5 and LU-3/LU-4, all UI items are approved.

## Landed

Destin subsequently authorized merge and close-out. App PR [#630](https://github.com/itsdestin/youcoded/pull/630) merged into remote master as `dff19cdc1409dddf49a66500092a50ef89432c99` on 2026-10-18. The branch first reconciled current app master; required desktop verification passed again (`scratch/verify-20261018-122347-2253103/`). GitHub desktop Linux checks and Android CI passed, and Gitleaks found no leaks in the published app commit. Windows/macOS matrix builds were skipped by PR policy, not verified in this run. No real privileged installation or installed-app replacement was tested; the source fix becomes available through a later release, not by merging alone.

The earlier close-out falsely called the unchanged base tips landed while work was uncommitted; existing card #22(e) records the recurrence. Cleanup is now governed by actual remote ancestry of the implementation and archive commits.

Archive contents preserve all three submitted specs, answers, built decks and their 72 referenced image crops (about 4 MB total). Raw capture runs, preview contact sheets, stale generated crops and server state were omitted rather than adding the roughly 90 MB working directory to git history. Archived answered decks are immutable: use `serve --no-build`; their raw `runs*` captures are not archived.
