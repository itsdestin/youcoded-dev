# Context-free UX review 1 — Development and reporting

Tested the supplied localhost:5557 workbench in Midnight at desktop 1440×1000 and narrow 390×844. Used control dumps before navigating each screen. No uploads, external GitHub actions, server changes, or product edits. Screenshots and action plans are under `scratch/ux1-*`. Disabled preview actions are not reported as missing functionality.

- U1 — I expected “Start with a conversation, not code” to lead with describing an idea / the contribution screen instead leads with project setup, three technical statuses, and backup choices before showing any conversation; put “Describe your idea” and a short example first, with setup explained when needed — Contribute to YouCoded, desktop and narrow — `scratch/ux1-details/midnight/contribute.png`; `scratch/ux1-finalnarrow/midnight/contribute.png`
- U2 — I expected an immediately understandable way to help without coding / “A separate contribution workspace,” “app-managed project,” “Workspace files,” and “Managed project” sound like different technical things I must understand; use “A separate project for your changes,” “YouCoded creates a new project and leaves your existing files alone,” “Project files,” and “Project setup,” and explain the distinction only if it changes my next action — Contribute to YouCoded — `scratch/ux1-details/midnight/contribute.png`
- U3 — I expected to understand exactly what extra information would become public / “Include originating error and app version” bundles two things and uses unfamiliar “originating”; use “Include error details and YouCoded version,” or separate the choices if they can be shared independently; replace “No originating error from Settings” with “No error details to include” — Report a bug — `scratch/ux1-details/midnight/report.png`
- U4 — I expected a plain explanation of optional information / “Include recent logs (optional)” does not say what logs are or why I might share them; use “Include recent activity records (optional)” with “These may help explain the problem. Review them for private information before sharing.” — Report a bug — `scratch/ux1-details/midnight/report.png`
- U5 — I expected the reporting warning to focus on privacy / “GitHub issues are public. Review everything you share. Reporting does not require AI or install a workspace.” mixes the important public-sharing warning with an unfamiliar installation concern; use “Your report will be public on GitHub. Review everything before sharing. No AI or setup required.” Explain what GitHub is for newcomers — Report a bug — `scratch/ux1-details/midnight/report.png`
- U6 — I expected a non-developer-friendly place to report trouble / “Development” sounds intended for programmers, and its subtitle is clipped at “Report a bug, contribute, o…” even on desktop; consider “Help improve YouCoded” with “Report a problem or share an idea” — Settings — `scratch/ux1-settings/midnight/settings.png`
- U7 — I expected short, everyday navigation labels / “Report a Bug or Request a Feature” wraps onto two lines; use “Report a problem or idea.” “Send it to the maintainers” → “Send it to the YouCoded team.” “Known issues” → “Known problems,” “Browse open issues on GitHub” → “See reported problems on GitHub,” and “Roadmap” → “Planned improvements” — Development — `scratch/ux1-details/midnight/how.png`
- U8 — I expected the form to use the same plain language as its task / “Bug,” “Feature,” “Title,” and “How can we reproduce it?” can be “Problem,” “Idea,” “Short summary,” and “What steps caused it?” respectively; the last wording makes it clearer what useful details to give — Report a bug — `scratch/ux1-details/midnight/report.png`
- U9 — I expected a clear next step without reading repeated setup caveats / “Set up separate workspace,” “Continue on this device only,” and “Connect private backup” can be “Create project,” “Continue without backup,” and “Set up private backup.” Replace “Not created · separate from installing the files” with an explanation of what remains to be done, rather than another distinction between project and files — Contribute to YouCoded — `scratch/ux1-details/midnight/contribute.png`
- U10 — I expected narrow-screen content to get me to a useful action quickly / at 390×844 the contribution screen spends essentially the whole first view on setup status, with all setup buttons below the visible area; scrolling may reach them, but moving detailed status into an optional explanation would make the first step discoverable sooner — Contribute to YouCoded, narrow — `scratch/ux1-finalnarrow/midnight/contribute.png`

## Implementation triage (UI design only)

- U1 — **accepted in part**: lead with a concrete idea and explain setup before talking with an assistant. **rejected** a new conversation-first action: approved scope remains installing a separate contribution workspace, not a new conversation feature.
- U2 — **accepted**: use separate project, Project files and Project setup; retain distinct files/setup/backup facts without claiming readiness.
- U3 — **accepted**: error details and YouCoded version; no error details to include. Keep the approved minimal context choice bundled; independent collection controls are not implemented.
- U4 — **accepted in part**: explain logs as app activity and errors, their usefulness and privacy risk even when unchecked. **rejected** replacing “logs” with “activity records”: that euphemism obscures what is shared.
- U5 — **accepted**: lead with public sharing and explain GitHub; shorten no-AI/no-setup reassurance.
- U6 — **rejected for this iteration**: retain Development; changing the Settings label is a terminology decision and normal Settings is outside this workbench-only edit. Clipped normal-runtime subtitle remains unchanged and is not counted fixed.
- U7 — **accepted in part**: simpler descriptive text (“YouCoded team”, “reported problems”). **rejected for this iteration**: renaming the bug/feature entry, Known issues or Roadmap. No terminology decision is needed to evaluate the approved design, so retain familiar labels rather than add another question.
- U8 — **accepted in part**: description prompt now asks “What steps caused it?”. **rejected for this iteration**: replacing Bug/Feature/Title labels; those terminology changes require a separate deck choice if pursued.
- U9 — **accepted in part**: Continue without backup, Set up private backup, and concrete project-setup explanation. **rejected** “Create project” as the main action: keep Set up separate workspace explicit about the approved installation task.
- U10 — **accepted**: move the first setup action above all detailed statuses, on both sizes; details remain available without hiding desktop information.

Counts by finding: 4 fully accepted (U2/U3/U5/U10), 5 mixed accepted/rejected (U1/U4/U7/U8/U9), 1 rejected for this iteration (U6), 0 already handled. Every item is triaged; rejected terminology ideas are not silently applied. Tester limitations below remain unchanged. Builder-run capture and DOM checks supplement rather than replace this fresh tester's partial review.

## Outcome and limits

**Understandable in principle, not fully verified as completable.** The reporting form clearly warns that reports are public, provides a useful description prompt, and presents choices for error/version information, activity records, and attachments. The contribution explanation explicitly says no coding knowledge is needed and offers clearer wording or an easier-to-use screen as examples. Those are reassuring.

**Most confusing moment:** choosing “Contribute to YouCoded — Start with a conversation, not code” and immediately having to interpret workspace files, a managed project, private backup, and installation distinctions instead of starting that conversation.

Coverage: opened Development, report, contribution, and the Development “How contributing works” explanation at desktop; opened contribution and that explanation at narrow size. Scrolled the explanation in both sizes. Attempted a filled report and enabled recent logs in both sizes; the final control dumps show “Logs to review,” “Improve wording with AI,” “Preview a submission error,” “Back to draft,” and “Submit public issue.” However, the filled-report screenshot expectation failed, so I do **not** treat those captures as verified report-review evidence or claim successful submission. I stopped without verifying the AI explanation, submission-error preview, back-to-draft behavior, attachment option, or the contribution screen’s own expanded explanation. The image delivery limit also prevented visual inspection of the final scrolled explanation captures. No claim is made about their clipping or legibility.

Some initial navigation attempts failed because the outer workbench dump only exposed its toolbar, narrow navigation uses Menu instead of the desktop Settings control, and broad text matching selected the wrong control. These were test-navigation problems, not established app defects. Later runs used the displayed app frame and specific control labels.

Verification commands and actual summary output:

```text
node scripts/ui-review/shot.mjs scratch/ux1-details.json scratch/ux1-details
3/3 shots verified.

node scripts/ui-review/shot.mjs scratch/ux1-finaldesktop.json scratch/ux1-finaldesktop
2/3 shots verified.
Unverified: review-filled — TypeError: Cannot read properties of undefined (reading 'click')

node scripts/ui-review/shot.mjs scratch/ux1-finalnarrow.json scratch/ux1-finalnarrow
2/3 shots verified.
Unverified: review-filled — TypeError: Cannot read properties of undefined (reading 'click')

node scripts/ui-review/shot.mjs scratch/ux1-repair-desktop.json scratch/ux1-review-desktop
0/1 shots verified.
Unverified: review-filled — expect failed: js:document.body.innerText.includes("Settings text is cut off")

node scripts/ui-review/shot.mjs scratch/ux1-repair-narrow.json scratch/ux1-review-narrow
0/1 shots verified.
Unverified: review-filled — expect failed: js:document.body.innerText.includes("Settings text is cut off")
```

Touch input and high-density display behavior were not tested. No confirmed app crash or hang was observed in the verified screens. This is a partial review, not acceptance of the complete reporting flow.
