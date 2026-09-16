# Fresh UX review 1b — reporting and contribution

Pre-design-approval review of the simulated backend at http://localhost:5558/?mode=workbench. Desktop 1280×900 and narrow 390×844, midnight theme. No uploads, external actions, setup, or server changes. Screenshots below were opened individually. Paths are relative to the workspace root.

## Findings

- U1 — I expected a backup failure to offer a direct way to report it / the error instead says “If it keeps failing, report it from Settings → Development,” requiring me to leave the error and remember a settings route; offer “Report a problem” beside Retry — narrow Backup & Sync failure — `scratch/ux1b-narrow2/midnight/backup.png`
- U2 — I expected plain-language help for reporting an issue or suggesting an idea / the route uses “Development,” then “Report a Bug or Request a Feature,” then “Submit a ticket”; “Report a problem or suggest an idea” would make the destination and form feel consistent and less developer-oriented — Settings/report form — `scratch/ux1b-flows/midnight/report.png`
- U3 — I expected to understand the contribution promise before opening help / the reassuring “You don’t need to know how to code” is hidden under “How contributing works,” while the introduction and main action use “separate project” and “Set up separate workspace”; put the no-coding reassurance in the introduction and consider “Create a safe working copy” for the action — narrow contribution introduction and explanation — `scratch/ux1b-narrow2/midnight/contribution.png`, `scratch/ux1b-walkthrough/midnight/contribution.png`
- U4 — I expected a concise, immediately readable backup error / “Sync hit an unexpected problem. It will keep retrying automatically. If it keeps failing, report it from Settings → Development.” is a dense block of small red text on narrow screens; shorten to “Couldn’t sync. We’ll keep trying.” and make reporting a separate control — narrow Backup & Sync — `scratch/ux1b-narrow2/midnight/backup.png`
- U5 — I expected the currently relevant privacy review area and next action to remain easy to find / selecting Recent logs pushes its editable sample and the rest of the form below the narrow dialog’s visible bottom, with no visible scrollbar in this capture; similarly the contribution steps continue below the visible area. A clearer scroll cue or retained footer would help. This is a discoverability observation, not a claim that scrolling is broken — narrow report and contribution explanation — `scratch/ux1b-narrow2/midnight/logs-disclosure.png`, `scratch/ux1b-walkthrough/midnight/contribution.png`

## Triage — revision 2

- U1 — **accepted for the app-wide error audit**, not this contribution redesign. The screenshot is existing Backup & Sync. Carry into `docs/active/investigations/2026-09-08-error-states-development-audit.md`; no Sync UI edit in this round.
- U2 — **rejected**. Submit a ticket is the user's explicit S-3 choice; existing Development labels are preserved. Do not reopen settled naming.
- U3 — **accepted** for visible no-coding reassurance: contribution introduction now begins “You don’t need to know how to code.” Retain the plain setup action “Set up separate workspace”; **reject** “safe working copy” because it promises safety and changes the requested setup vocabulary.
- U4 — **accepted for the app-wide error audit**, alongside U1. Existing Backup & Sync is outside these revised screens; no surprise Sync styling/copy change.
- U5 — **accepted for targeted verification**, not an assumed scroll bug. `scratch/error-review2-scroll.json` scrolls the narrow logs/review and contribution walkthrough to the bottom and asserts each next button lies fully inside its dialog and viewport. Results recorded in the design ledger; no broad UX loop or speculative footer change.

## Coverage and outcome

**Partially completed.** Found the route through Settings → Development and opened the report form on desktop and narrow layouts. The report makes GitHub publicity explicit before the fields. Error details/version starts selected; recent logs starts unselected. On narrow layout I opened About recent logs and selected Include recent logs; the resulting form says “Review and remove private details” and explicitly marks the logs as sample text. This gives a useful privacy warning. I did not complete editing sample logs, fill a report, switch to Feature, or reach the final report-review screen, so those interactions remain unreviewed.

Opened the contribution introduction and “How contributing works” on narrow layout. The visible explanation establishes that no coding knowledge is needed, then describes proposing an idea and reviewing the design. Later steps and Workspace details were not fully inspected. Setup is explicitly unavailable in the prototype and is not reported as a bug.

Opened the narrow Backup & Sync failure example. It offers Try again and Connect GitHub and says automatic retry will continue. Neither was activated. No local-only contribution example was reached; it remains unreviewed, not absent. Desktop contribution and desktop expanded logs were not covered.

The desktop report fit within the viewport. Narrow captures show content continuing below modal boundaries; scroll completion was not verified. Touch input, high-density display, other themes, keyboard-only navigation, backend collection, redaction, persistence, submission, backup and actual contribution setup were not tested.

## Execution evidence and limitations

The workbench wrapper dump exposes only its toolbar. I used the app iframe URL discovered from the rendered DOM (`?mode=workbench&child=1&view=app&scenario=default&latency=150`) for subsequent tool runs. Dumps preceded navigation/disclosure actions. No source, specs, or prior reviews were used to derive findings.

Commands and actual summary output:

- `node scripts/ui-review/shot.mjs scratch/ux1b-dev.json scratch/ux1b-dev` → `1/1 shots verified.`
- `node scripts/ui-review/shot.mjs scratch/ux1b-flows.json scratch/ux1b-flows` → `2/3 shots verified.` The shot named logs actually shows the base chat, not a logs review; its generic body assertion was insufficient. The contribution attempt failed its expectation. Neither is used as evidence of those surfaces.
- `node scripts/ui-review/shot.mjs scratch/ux1b-narrow.json scratch/ux1b-narrow` → `0/3 shots verified.` The desktop Settings selector did not exist at narrow width; the initial dump exposed Open menu, which was used in the retry. This was a test-navigation error, not an app failure.
- `node scripts/ui-review/shot.mjs scratch/ux1b-narrow.json scratch/ux1b-narrow2` → `3/3 shots verified.` Screenshots visually confirmed reporting, contribution introduction and Backup & Sync.
- `node scripts/ui-review/shot.mjs scratch/ux1b-narrow.json scratch/ux1b-walkthrough` → `3/3 shots verified.` The contribution screenshot confirmed the expanded explanation but not its offscreen remainder.

Automated contrast counts were not treated as findings because several concern background content rather than the reviewed dialogs. Exploration exceeded the requested tool-call budget while resolving the wrapper and narrow navigation; coverage was stopped short rather than implying complete acceptance.
