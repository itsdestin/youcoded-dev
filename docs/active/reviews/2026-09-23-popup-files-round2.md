---
status: active
date: 2026-09-23
related: docs/active/design/2026-09-22-ui-guide-rebuild/popup-files-round2.review.json
---

# Popup headers and Session Files — second visual round

The submitted second comparison (`popup-files-round2.review.answers.json`, 21:15 UTC) picked **aligned** for H-1 and H-2, and **balanced (84×48)** for F-2, each with a qualification. H-1: every dialog header should have **one line** — the current About subtitle makes the picked candidate two lines, so that pictured candidate is *not* accepted unchanged. H-2: Destin also wants the Project File screen improved because it does not feel consistent with the app; follow-up clarification: he means **the near-fullscreen file detail popup shown in H-2**, not the Project Files grid/list tab. F-2: adjust how each card's filename/status aligns with its preview before seeking visual acceptance. These are refinements to mock, not production or global-rule authorization.

The submitted first comparison (`popup-files-comparison.review.answers.json`) picked a **direction**, not final style: consolidate the whole header of the four dialog sizes and tune title typography; show custom-class alternatives visually; treat anchored menus and near-fullscreen viewers as separate roles pending an A/B; choose a rectangular file preview while refining sizing/spacing, removing the search-row divider, and showing a tapered header + conditional fade.

The second deck captures three **real-renderer** temporary header treatments (today, 56px-min/16px semibold, 64px-min/18px medium) in the four actual dialog sizes and three custom title shells plus the unchanged anchored menu. It does **not** resize or merge popup classes. Session Files has three actual `ArtifactThumbnail` preview widths/heights (72×44, 84×48, 96×52) with inset cards and the requested shared header edge, no search divider, and a scroll-driven unpainted fade. The file rows use Workbench sample data; no image is invented for files without a supported preview. The cards' click/removal behavior and Android remain unapproved and unverified. The CSS shared-header treatments are **mockups only**, not a rule for every popup.

Evidence: `scratch/ui-consistency-popup-preview/round2/shots-round2-plan/` captured **54/54 self-verified** screenshots in Halftone Dimension and Meadow Mist, the themes Destin used when answering the preceding round. `shots-fade-plan/` separately verified overflow exposes a bottom fade and reaching the end removes it (2/2). The UI-review deck was previewed and its contact sheet read before serving. Theme probes still report contrast failures on these fixture pages; this round is for design choices, not a contrast sign-off. Phone/narrow, touch, keyboard, and Android views remain unreviewed before an implementation acceptance.

The mockup-only modifications to `index.tsx`, `globals.css` and `SessionDrawer.tsx` were removed after capture; `git diff --exit-code -- desktop/src/renderer/components/SessionDrawer.tsx` and a source search for both preview flags confirmed removal while preserving the pre-existing changes in the other files. No production change or guide rule is approved until Destin submits this deck and any acceptance step. `ui/Dialog.css` supplies the approved tapered header and mask recipe reused in the temporary Session Files example, not a new final rule.
