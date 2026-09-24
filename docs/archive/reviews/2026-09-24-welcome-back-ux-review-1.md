# Welcome-back UX review — beta tester pass 1

Scenario: `scenario=welcome-back` (crash-recovery startup screen) plus the related "Resume
Session" list under `scenario=stress&stressRows=2000`. Screenshots under `scratch/ux1/midnight/`.

- U1 rejected — existing Resume-browser behaviour Destin ruled on (title = rename, R12/R5-1); Welcome back reuses the browser as he asked (Q-actions). Finding: Expected clicking a session's bold, underlined title (it has a pencil icon right next to it) to open/preview that conversation / instead it opens a "Rename session" dialog — the actual way to preview a conversation is clicking anywhere else on its card — Welcome back screen — scratch/ux1/midnight/preview-click.png
- U2 accepted — rows whose last model is not set up here now say so on the card before Resume is pressed. Finding: Expected "Resume 3" to either fully resume all 3 checked sessions or clearly warn me first that one can't / instead it silently resumes the 2 that have a working model and leaves the modal open with no advance warning that "sync health primary system" needs a new model chosen (its old model, qwen3-coder-30b-a3b-instruct, is unavailable) — Welcome back screen — scratch/ux1/midnight/resume-3-clicked.png
- U3 accepted — the after-the-fact footer line is gone; the per-row note (U2) is recomputed from the rows themselves, so it cannot go stale. Finding: Expected the helper text under the list to always describe the session(s) actually still needing attention / instead, after I resolved the one session that needed a model, the text kept reading "1 session needs a model picked first. Choose one to resume it." even though the one session left in the list ("theme contrast pass") already has a valid model — it's just unchecked because I chose not to resume it. The message is stale and describes a problem that session doesn't have — Welcome back screen (after partial resume) — scratch/ux1/midnight/resume-zero-checked.png
- U4 rejected — pre-existing status-bar chip, and in the workbench an artifact of the fake backend (no terminal to read the mode from); not part of this feature. Finding: Wording: the status bar shows "PERMISSION UNKNOWN" in red, all caps, right after a session resumes, with no explanation of what permission it means (file access? running commands?). A non-developer would likely read this as something broken. Suggest a plainer, less alarming label such as "Permissions not set" with a tooltip, or hide it until it's actually relevant — Chat screen (bottom status bar), all screenshots after a resume — scratch/ux1/midnight/resume-final.png
- U5 rejected — pre-existing preview-pane header, not changed by this feature; out of scope. Finding: Visual: a thin light-gray bar is clipped across the top border of the pinned conversation-preview header card (the little bar showing the session's title/tags while scrolled), overlapping the rounded corner — looks like a leftover scrollbar track rendering on top of the card rather than inside it — Welcome back screen, right-hand preview pane — scratch/ux1/midnight/crop-bar.png (full view: scratch/ux1/midnight/preview-card-click.png)
- U6 rejected — pre-existing preview-pane styling; out of scope. Finding: Visual/contrast: the "|" divider shown before a collapsed tool-call summary ("Read a file and searched the code (+1 more)") in the conversation preview is very low contrast — measured ratio 2.02:1 against a 4.5:1 minimum — effectively invisible for low-vision users — Welcome back preview pane — scratch/ux1/midnight/preview-card-click.png
- U7 rejected — same pre-existing chip as U4; out of scope. Finding: Visual/contrast: the red "PERMISSION UNKNOWN" status-bar text itself is slightly under the accessibility contrast minimum (4.11:1 measured vs. 4.5:1 required) against the dark status-bar background — Chat screen status bar — scratch/ux1/midnight/check-disabled.png

## Stress test (2000 sessions)

Opened the "Resume Session" picker (via the session-tabs dropdown → Resume) against
`scenario=stress&stressRows=2000`. Typed a search query ("session 5") and it filtered the list
immediately with no visible blank frame, spinner hang, or delay. I could not detect frame-level
stutter with this tool (it only takes screenshots, not video), so treat this as "no hang/blank
found," not proof of perfectly smooth scrolling.

## Summary

I completed the task: resumed all sessions in one pass, resumed a partial subset (leaving one
out and one requiring a new model), marked a session complete, and used "Start fresh" then
found the same sessions again via the normal "Resume Session" browser — all worked. The most
confusing moment was clicking a session's title expecting a preview and getting a rename box
instead (U1); the second most confusing was the stale "needs a model" message that kept
pointing at a session that no longer needed one (U3).
