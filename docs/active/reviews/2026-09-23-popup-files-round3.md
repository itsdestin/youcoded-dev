# Popup and Session Files refinement — third visual comparison (2026-09-23)

**Status:** Submitted 21:37 UTC: `H-3=body`, `P-4=quiet` with the explicit additional request to **remove the Project Instructions / Always / 4.1 KB metadata banner**, `F-3=center`. Do not treat a pick as final production acceptance or global rule approval. The metadata removal was not pictured in this deck; show it before assuming the rest of the Project context-file treatment is settled.

`popup-files-round3.review.json` shows actual Workbench screens in Halftone Dimension and Meadow Mist, not a production implementation or a guide-rule approval. The previous round's answer file picked aligned H-1/H-2 and 84×48 F-2 conditionally. Destin clarified that “Project file screen” means the large context-file detail popup under Projects → Instructions & Memories, not the Files grid/list.

## What this comparison isolates

| Change | Earlier view | Alternatives to pick from | What stays fixed |
|---|---|---|---|
| H-3 · About version | Second line inside header | Inline version beside title; version at top of body | Aligned 56px/16px semibold header; visible version; dialog width and disclaimer/privacy copy |
| P-4 · Project context file | Metadata band, boxed project notice, full-width file | Quieter metadata + plain notice; quieter metadata + centered reading surface | Existing header divider, actions, notice copy, scroll fade; other users of ProjectDetailOverlay unaffected |
| F-3 · Session Files text | Earlier picked 84×48, compact text group | Centered group with measured gap; top/bottom alignment against image | 84×48 preview, search treatment, conditional fade, file actions |

`round3-plan.json` captured 16/16 expected screens (8 per theme); `round3-project-plan.json` recaptured 6/6 Project screens using representative fixture text instead of the Workbench's normally empty single-path-heading fixture. The staged `round3/review/shots-round3-review` includes those screens and the previously selected F-2 image as reference. All source-only comparison branches and the temporary text fixture were removed after capture; pre-existing app worktree changes were preserved. Desktop temporary typecheck passed. Preview built; screenshot contrast reports still flagged failures, so do not treat this as a contrast pass.

**Pending:** Destin's picks. Phone/touch, keyboard, Android, production file reading and edit/save behaviour have not been evaluated here. Record answers before promoting any candidate to the design guide or production.
