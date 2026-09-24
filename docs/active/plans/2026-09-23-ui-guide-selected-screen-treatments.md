---
status: superseded
date: 2026-09-23
---

# Selected screen treatments — implementation plan

**Goal:** Apply three visually picked screen treatments in the isolated app worktree, without publishing draft design-guide rules. Sources: `popup-files-round2.review.answers.json#H-1/H-2/F-2`, `popup-files-round3.review.answers.json#H-3/P-4/F-3`, `project-context-metadata.review.answers.json#P-5`.

**Scope:** Shared titled `<Dialog>` keeps existing widths; align its header at a 56px minimum with a 16px semibold title. About moves its version string to the top of its body. Other custom shells keep their existing approved chrome; the Project context-file reader alone loses its scope/timing/size meta row and uses an unboxed explanation. Session Files gets an 84×48 left thumbnail with centered proportional filename/status, inset cards, the tapered header and conditional list fade, without the redundant search divider. No IPC, persistence, theme tokens, global guide wording, commit or shipping changes.

## Task 1 — one-line dialogs and About
- Modify `youcoded/desktop/src/renderer/components/ui/Dialog.tsx` header sizing/title and `AboutPopup.tsx` version placement; retain content, close button, all sizes and body scroll.
- Extend an existing dialog test and About test in `youcoded/desktop/tests/` to assert version in the body, absent subtitle in the header, and aligned header class. Run the focused test red, implement, run green.

## Task 2 — Project context-file detail
- Modify only `youcoded/desktop/src/renderer/components/project-view/ContextEditorOverlay.tsx`: omit `meta` on project-scoped files and render its existing warning/explanation unboxed; preserve the global warning, content and actions. Do not change `ProjectDetailOverlay.tsx` or other callers.
- Add a focused rendering test for a project-scoped vs global file, first red then green. Check edit mode as well as reading state in the isolated Workbench.

## Task 3 — Session Files
- Modify only `youcoded/desktop/src/renderer/components/SessionDrawer.tsx` plus a small scoped CSS file if needed; reuse `ArtifactThumbnail`, `useScrollFade` and the approved header/fade recipe without re-declaring theme tokens. Preserve the remove control, row memoization and compact viewport access. Add tests to `tests/SessionDrawer.test.tsx`, first red then green, covering preview placement and file actions.

## Verification and review
- `bash scripts/verify.sh <app-worktree>`; check Android SDK/JDK availability, then run Android tests if available (never `bundleWebUi` with hardlinked dependencies). Any failure gets diagnosed and fixed in this scope.
- Capture affected real Workbench screens in Meadow Mist and Halftone Dimension, desktop and narrow; check file-list overflow at top and bottom and an alternate dialog size. Compare selected deck candidates to the built screens; serve a before/after review deck for Destin, not a production sign-off. T-01/T-03 wording remains deferred until a separate wording review and broader theme coverage.
