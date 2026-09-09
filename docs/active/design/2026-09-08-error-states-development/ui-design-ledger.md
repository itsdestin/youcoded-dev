---
status: draft
date: 2026-09-08
---
# Development UI design ledger — not feature completion

Only `?mode=workbench` selects the proposed screens. Normal runtime retains the legacy flows. The new screens are real renderer components with local UI state; all unbuilt external actions are disabled and explicitly labelled. No backend, IPC, shared ErrorState, installer, GitHub or live-app changes.

| # | Proposed visible change | Why / rule | Current versus unbuilt |
|---|---|---|---|
| 1 | Friendly Development entry; separate Known issues and Roadmap | Canonical roadmap answer; G-1 / G-5 | Links exist; no pinned GitHub issue created |
| 2 | Click/tap information button expands a five-step contribution walkthrough | Conversation → design → separate preview → checks → explicit public proposal | Local expansion works; no session is launched |
| 3 | Editable report title and description; review without AI | Minimal evidence and optional AI answers | Local editing works; context/version acquisition unbuilt |
| 4 | Logs off by default; explicit review before optional AI | Sharing consent / accurate evidence | Sample editing only; no diagnostics or logs read |
| 5 | Browser attachment guidance warns upload happens on attachment | Browser-attachments answer | No capture, export, upload or browser submission implemented |
| 6 | Distinct files / managed project / private backup statuses; local-only fallback | Leave-existing and allow-local answers | Disabled setup actions; existing folders never inspected or changed |
| 7 | Draft survives close/back; labelled submission-error example with Retry | Error-message standards | Mounted local state only; reload clears draft. Retry dismisses a mock error, never sends a request |

## Safety and fidelity
- The old install and automatic-AI code remains unchanged in legacy functions outside the workbench design. It is **not** the implementation of the proposed actions.
- No shim changes; no new MOCK_ONLY IPC channels needed because the permitted disabled-prototype route was used.
- Real durable draft storage, originating-error handoff, diagnostics, optional AI consent/provider selection, report submission/reconciliation, attachments/export, managed setup and backup remain unbuilt.
- Workbench: `http://localhost:5557/?mode=workbench&title=Error%20Reporting%20Design`.
- Launcher used offset 384. `run-workbench.sh` has no help/label/profile parser: `--help` returned `error: no checkout found for '--help'`. After reading its source, launched with the requested label/profile arguments (ignored by this script), distinct env offset, and disposable browser profiles supplied by shot.mjs. No Electron process.

## Evidence
Before evidence already supplied in `scratch/error-review-before/coverage.md`: Development, bug report and contribution covered in all six themes. Inspected the three Midnight raw screenshots:
- `shots-main/midnight/settings-development.png`
- `shots-overlays/midnight/development-bug-report.png`
- `shots-overlays/midnight/development-contribute.png`

After:
- `scratch/error-design-after-fixed/{midnight,meadow-mist,halftone-dimension}/{development,walkthrough,report,report-review,attachments,contribute}.png`: **18/18 shots verified**, stress scenario, 150ms mock latency.
- `scratch/error-design-narrow/midnight/{report,report-review,contribute,report-error}.png`: **4/4 verified**, 390×720, empty scenario, 150ms mock latency.
- `scratch/error-design-scroll/halftone-dimension/walkthrough-bottom.png`: expanded walkthrough bottom capture.
- Plans: `scratch/error-design-shots.json`, `scratch/error-design-narrow.json`, `scratch/error-design-scroll.json`.
- First capture had three attachment misses because the plan tried to scroll a non-overflowing dialog. Removed that unnecessary scroll and recaptured successfully. Do not use `scratch/error-design-after/` as final evidence.
- Visually inspected development, report review, contribution, expanded stress-theme walkthrough and narrow submission-error shots. Capture verification is not a blanket contrast pass: probes report 8–31 contrast findings on desktop and 1 on narrow; theme/scrim and underlying app content require fresh UX review, not an assertion that every finding is harmless.

## Verification
TDD command (from `youcoded/desktop`):
`npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx`
- Before behavior changes: `3 tests | 2 failed` (missing Title; missing proposed setup action).
- After design: `Test Files 1 passed (1); Tests 3 passed (3)`.

`bash scripts/verify.sh ./youcoded` final output:
```
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.
```
Earlier verification correctly caught legacy-flow tests when the initial draft replaced those screens globally; workbench-only routing now preserves them. Final log: `/tmp/error-design-verify3.log`.
`git -C youcoded diff --check`: exit 0. Scoped diff read back. Android and Worker not tested; no platform/backend changes.

Historical note: the first review deck was subsequently created and submitted; see `error-states.review.answers.json`. The revision below has no new deck and is not approved.

## Revision — 2026-09-09

Source: submitted first-review answers S-1 through S-7. Old numbers 1–7 above are retained unchanged as history. S-1/S-2/S-3 were yes **with requested changes**; S-5/S-7 were yes. **S-4 and S-6 were OTHER: revised, not approved.** All new visible changes below require fresh UX testing before a revision deck.

| # | Revision | Source / status |
|---|---|---|
| 8 | Move How contributing works off Development and into Contribute; use the shared expandable SettingRow | S-1 note; revised |
| 9 | Explain three separate facts: private backup saves work; a GitHub proposal is a separate choice; installed app unchanged | S-2 note; revised |
| 10 | Keep the header Submit a ticket for both Bug and Feature tabs | S-3 note; revised |
| 11 | Evidence becomes compact SettingRows; recent logs remain off by default; click/tap info explains logs; selected sample logs remain editable | S-4 OTHER; revised, NOT approved |
| 12 | Short public warning; AI explanation behind a settings disclosure after Review; one submission primary, matched small secondary buttons; review selected context before any future transmission | S-4 OTHER; revised, NOT approved |
| 13 | Contribute uses panel-sized settings layout, one purpose paragraph, two disclosure rows and one setup action; technical status moves behind Workspace details | S-6 OTHER; revised, NOT approved |
| 14 | Local-only and failed-backup fixtures stay visible outside collapsed information, with only relevant disabled actions | S-6 OTHER; revised, NOT approved |
| 15 | Workbench Known issues and Roadmap explicitly label unavailable prototype links and cannot open external sites | Safety correction; legacy links unchanged |

Preserved: five-step contribution sequence and explicit approval before public proposals; editable ticket fields without mandatory AI; attachment upload-on-attach warning (S-5); draft/error/retry behavior (S-7). No diagnostics, provider calls, uploads, installs or GitHub actions were added. No backend/IPC or shim edits. Real backup status is unbuilt: `contributionState=local-only|backup-failed` are explicitly labelled example states, not reports about this machine.

### Existing settings exemplars inspected
- `PreferencesPopup.tsx:261–271`: SettingRow with right-hand control, description owned by row.
- `assistant-settings/pages.tsx:258–304`: compact grouped rows and selected-setting/error context.
- `PermissionsSection.tsx`: shared settings row anatomy and reference-information separation.
- Primitive authorities: `ui/SettingRow.tsx`, `ui/AnchorTip.tsx`. Reused SettingRow, AnchorTip, Dialog, Button, Checkbox; no new control styling or primitive.

### Revision evidence (real renderer, not the legacy UI)
All paths below are workspace-relative. Before was captured **before editing** from the current first-review design on :5557; PID 2306269 cwd was verified as this worktree's `youcoded/desktop`. A fresh workbench on :5558 (offset 385, PID 1087223, same verified cwd) serves revised source; :5557 was not stopped or modified. Launch supplied label/profile, though run-workbench.sh only parses its checkout argument. Disposable shot browsers are isolated.

- Before: `scratch/error-revision-before/{midnight,meadow-mist}/{development,walkthrough,report,review,logs,attachments,error,retained,contribute}.png` — 18/18 verified, 1440×900; `coverage.md` read.
- After: `scratch/error-revision-after/{midnight,meadow-mist}/` — 22/22 verified, 1280×900; `coverage.md` read. Adds `workspace-details.png` and `log-info.png`.
- Matched-viewport After for pairs: `scratch/error-revision-matched/{midnight,meadow-mist}/{development,walkthrough,report,logs,contribute}.png` — 1440×900. Use this with Before for a future deck, not the differently-sized capture above.
- Narrow corrected: `scratch/error-revision-narrow-fixed/midnight/` — 11/11 verified, 390×844. The first narrow run left the top menu open; its pictures are superseded. Corrected plan clicks the actual Settings menuitem before Development.
- State fixtures: `scratch/error-revision-states/midnight/{local-only,backup-failed}.png` — 2/2 verified, 1280×900.
- Plans: `scratch/error-revision-plans.mjs`, `scratch/error-revision-{desktop,narrow,matched,local-only,backup-failed}.json`.
- Bounded previews: `scratch/error-revision-previews/before-{logs,contribute}.png` (1280×800). Inspected these, plus revised desktop review/logs, Midnight and Meadow Mist contribution, and walkthrough at <=1280×900. No giant contact sheet was opened. Image delivery hit the tool's eight-image cap: corrected narrow/state pictures need fresh UX tester visual inspection, rather than claiming they were seen.
- Contrast probes still report findings (desktop 8–17; corrected narrow 3–4). These include underlying renderer content; this pass does not certify contrast. Fresh tester should triage them.

### Revision checks
From `youcoded/desktop`:
`npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx`
New assertions before revision: `Test Files 1 failed (1); Tests 3 failed | 4 passed (7)` (walkthrough location, ticket heading/disclosure, local-only visibility).

`npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx tests/development-popup.test.tsx`
```
Test Files  2 passed (2)
     Tests  18 passed (18)
```
Log: `/tmp/error-revision-tests.log`.

`bash scripts/verify.sh ./youcoded`
First run: types/knip/lint/invariants passed; tests had 1 failure in untouched `tests/use-provider-type.test.tsx:108` (invalidation spy), 1152 passed, 1 skipped. Isolated `npx vitest run tests/use-provider-type.test.tsx`: 14/14 passed. No unrelated source changed; no claim that the cause is proven.
Second full verification (`/tmp/error-revision-verify2.log`):
```
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.
```
`git -C youcoded diff --check`: exit 0. Routing/source diff read back. Android/Worker not tested (unchanged). Initial background capture/verify attempts ran from desktop by mistake and failed to locate workspace scripts; corrected cwd before retry.

Historical revision handoff: no deck had yet been created; fresh UX tester was next.

## Second review deck — ready, not served

Fresh review `docs/active/reviews/2026-09-09-error-states-development-ux-review-1b.md` is now triaged U1–U5 in that file. U1/U4 are accepted into the existing app-wide audit (not contribution changes); U2 naming proposal rejected in favor of the user's S-3 choice; U3 no-coding reassurance added to the visible introduction while keeping Set up separate workspace (no “safe” promise); U5 targeted scroll verification passed, so no speculative scrolling/footer edit.

- Spec: `error-states.review-2.json`; generated page: `error-states.review-2.html`; generated images: `images/error-states.review-2/` (32 images).
- Eight steps preserve change numbers 8–15. S-1/S-2/S-3 notes are explicit; S-4/S-6 remain labelled revisions, NOT prior approval. Original deck and answers were not changed.
- Before source remains `scratch/error-revision-before/`; matched 1440×900 After remains `scratch/error-revision-matched/`, with refreshed contribution/walkthrough in `scratch/error-review2-copy/` (4/4 verified) and matched example failure in `scratch/error-review2-state/` (2/2 verified).
- Deck aliases are tight, unscaled dialog crops from those matched 1440×900 sources. `scratch/error-review2-runs/provenance.json` records every original path and crop rectangle; `scratch/error-review2-prepare.py` reproduces them. Compact landing uses 440×510 at +500+195; tall forms 620×840 at +410+30; contribution After uses actual compact dialog extent. The deck preserves differing dialog sizes rather than enlarging the compact After to pretend it is the same size.
- U5 command: `WB_PORT=5558 CDP_PORT=18392 node scripts/ui-review/shot.mjs scratch/error-review2-scroll.json scratch/error-review2-scroll midnight` → `2/2 shots verified.` Both 390×844 pictures were visually inspected. Submit public issue and Set up separate workspace are fully inside dialog/viewport after scrolling, pinned by rectangle assertions. This verifies reachability, not touch hardware behavior.
- `scratch/error-review2-coverage.md` read: 5 covered, 0 partial, 0 missed. Current :5558 owner PID 1223183 was checked; cwd is this isolated `youcoded/desktop`.
- Latest focused command after intro-copy edit: `npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx tests/development-popup.test.tsx` → `Test Files 2 passed (2); Tests 18 passed (18)`; `/tmp/error-review2-tests.log`. Last full verification remains `/tmp/error-revision-verify2.log`, all passed; not rerun for a single copy sentence.
- Preview command: `python3 scripts/ui-review/review-cards.py preview docs/active/design/2026-09-08-error-states-development/error-states.review-2.json --sizes 1280x800 --themes midnight --out scratch/error-review2-preview` → wrote HTML, 32 crops and eight individual 1280×800 previews. Log `/tmp/error-review2-preview.log`. Explicit whole-dialog highlight warnings are non-blocking; active Cotton Candy Sky was uncaptured, so builder selected Midnight.
- Visually inspected individual preview pages 1,2,3,4,6,7, plus both U5 captures. Tool's eight-image delivery budget refused pages 5/8; these remain the only uninspected deck previews (they reuse the inspected logs/landing image pairs with different text). Exact remaining files: `scratch/error-review2-preview/p5-midnight-1280x800.png` and `p8-midnight-1280x800.png`. NEVER read contact.png. Parent can inspect these two bounded images before serving; no broad UX loop required.

No serve command run. No commits, GitHub operations, installs or backend/Sync UI edits. Prototype external operations stay disabled. This is a second UI decision deck, not implementation acceptance.

## Revision — 2026-09-09, second round

Source: submitted second-review answers R2-8 through R2-15. Numbers 1–15 above are retained
unchanged as history. R2-8/R2-10/R2-12/R2-13 were yes; **R2-9, R2-11 and R2-14 were OTHER;
R2-15 was NO.** Revisions 16–19 apply those notes and have not been shown to Destin yet.

| # | Revision | Source / status |
|---|---|---|
| 16 | Contribute landing: delete the prototype status line and the Workspace details row; the setup action reads **Set up development workspace** | R2-9 + R2-13 notes; revised, NOT approved |
| 17 | Contribute walkthrough: delete the gray warning box under step 5 | R2-9 note; revised, NOT approved |
| 18 | Ticket draft: one **Include with ticket** heading over three identical rows; per-row paragraphs, gray sub-labels and the box around the public warning removed; every explanation moves behind that row's (i) | R2-11 note; revised, NOT approved |
| 19 | Ticket review: selection rows are not repeated; error details and recent logs each render as small heading + one line + content; the flow says **ticket** throughout (Review ticket, Review your ticket, Submit public ticket) | R2-11 note + copy correction; revised, NOT approved |

Correction already applied, not re-asked (R2-15 **no**, "the link should never be unavailable"):
revision 15 is reversed. `DevelopmentPopup.tsx` opens the real
`github.com/itsdestin/youcoded/issues` and the canonical `ROADMAP.md`, pinned by
`DevelopmentDesign.test.tsx` asserting both `window.open` calls. Example-state demo controls
were removed from the user-facing screens at the same time.

R2-14 ("confused?") is **not** answered by these revisions. The slide asked about a labelled
example of a failed backup, and the answer records confusion about the slide rather than a
direction. It is carried into the next round as an open question, not a silent decision.

### Why the single-noun change (19) was made without being asked

The flow named one object four ways across four controls — *Submit a ticket* (title),
*Review report* (button), *Review your bug report* (heading), *Submit public issue* (button).
That reads as four different actions. It is unified on **ticket**, the word R2-10 approved, and
pinned by `DevelopmentDesign.test.tsx` → "calls the ticket a ticket at every step", which also
fails if *bug report*, *feature request* or *public issue* reappear anywhere in the flow.

### Revision checks

`npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx tests/development-popup.test.tsx`
→ `Test Files 2 passed (2); Tests 19 passed (19)` (18 before, plus the new single-noun guard).

`bash scripts/verify.sh ./youcoded`
```
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.
```
Android and the marketplace Worker are not covered and were not changed.

## Third review deck — built and inspected, not yet answered

- Spec `error-states.review-3.json`; page `error-states.review-3.html`; 8 crops in
  `images/error-states.review-3/`.
- Four approve steps, numbers 16–19, one screen each: Contribute landing, Contribute
  walkthrough, ticket draft, ticket review.
- Before source `scratch/error-r3-before/midnight/` (round-2 code, 5/5 verified). After source
  `scratch/error-r4-after/midnight/` (6/6 verified) plus `scratch/error-r4-narrow/` at 390×844
  (3/3 verified). Deck run folders assembled at `scratch/error-r4-deck/{before,after}`.
- **Each crop rectangle is the BEFORE dialog's measured `[role=dialog]` bounds**, so the pair is
  framed identically and the shorter After sits inside it. An earlier union rectangle leaked chat
  background into the After panel.
- Highlights are the rig's measured pixel diff. Text anchors were tried and rejected: they need a
  `measure` entry captured at shot time, and slide 16's anchor text does not exist in the Before
  run at all. Hand-placed whole-crop boxes were removed.
- Previews read individually as bounded pages (`scratch/error-r4-preview/p1..p4`, 1280×800, and
  `scratch/error-r4-preview-tall/` at 1280×950). Never `contact.png`. Two defects found and fixed
  in the deck itself: overflowing card copy and the leaking crops above. At 1280×950 the deck uses
  its wide layout and every card fits; the fade seen at 800px tall is that viewport, not the copy.
- No serve had been run at the time of writing. No commits, GitHub operations, installs or backend
  edits. This is a UI decision deck, not implementation acceptance.

## Revision — 2026-09-09, third round

Source: submitted third-review answers R3-16 through R3-19.
**R3-18 was YES — the ticket draft's content and hierarchy are approved.** R3-16, R3-17 and
R3-19 were OTHER, all three for the same reason, in Destin's words:

> "that button is ugly and doesn't match other styling in the app. why did we mock up 'setup is
> not connected in this preview'. the workbench shouldn't have code that makes it look different
> from the real app, that defeats the whole point. res-style this."
> · "again get rid of all the 'not connected in this preview' shit."

| # | Revision | Source / status |
|---|---|---|
| 20 | Contribute landing: the setup action is a full-width primary `<Button className="w-full py-2.5">`, not a chip-sized disabled one | R3-16 note; revised, NOT approved |
| 21 | Contribute walkthrough: same button treatment with the five steps open | R3-17 note; revised, NOT approved |
| 22 | Ticket draft: **Review ticket** becomes the same full-width primary. Content and hierarchy already approved at R3-18; only the control changed | R3-16/R3-19 applied to an approved screen; re-asked, not assumed |
| 23 | Ticket review: every prototype caption deleted; error details shows a real version line; Submit public ticket primary over an outlined Back to draft | R3-19 note; revised, NOT approved |

### The app's dialog button convention

Established by reading the real screens this design replaces, not invented here:
`ContributePopup.tsx` (legacy) uses `<Button onClick={onInstall} className="w-full py-2.5">`,
and `BugReportPopup.tsx` (legacy) stacks `w-full py-2.5` primary over `w-full py-2.5` secondary.
`Button.tsx` documents `sm` as "inline row actions (EngineCard, provider rows, chips)" and `md`
as "forms, popup footers, most actions" — the mockups had been using `sm`, a chip size, in
dialog footers, plus `disabled` (which applies `opacity-50`). That combination is what read as
a different app.

### Captions are gone, and cannot come back

Deleted: "Setup is not connected in this preview", "Submission is not connected in this
preview", "No error details or version collected in this preview", "Prototype · AI unavailable…",
and the contribute landing's "Prototype · setup and backup unavailable".
Pinned by `DevelopmentDesign.test.tsx` → "never captions the contribution screen…" and
"never captions the ticket screens…", which match
`/in this preview|prototype ·|prototype:|not connected|unavailable in this/i` against the whole
rendered screen in every state the tests walk.

**Guard proven by breaking it** (test-suite-hygiene: a guard you did not break is a guard you
did not test). Re-adding "Setup is not connected in this preview." to `ContributionDesign.tsx`:
`Tests 1 failed | 9 passed (10)` — `AssertionError: expected 'Contribute to YouCoded…' not to
match /in this preview|…/i`. Reverted: `10 passed (10)`.

The disabled-button assertion was replaced rather than deleted: the safety that matters is that
the design never reaches the legacy installer, so the test now *clicks* the enabled button and
still asserts `installWorkspace` was never called.

### Revision checks

`npx vitest run src/renderer/components/development/DevelopmentDesign.test.tsx tests/development-popup.test.tsx`
→ `Test Files 2 passed (2); Tests 21 passed (21)`.

`bash scripts/verify.sh ./youcoded` → types, tests, knip, lint and ast-grep all PASS.
Android and the marketplace Worker are not covered and were not changed.

## Fourth review deck — built and inspected, not yet answered

- Spec `error-states.review-4.json`; page `error-states.review-4.html`; 8 crops in
  `images/error-states.review-4/`. Four approve steps, numbers 20–23.
- **Before is what he reviewed last round** (`scratch/error-r4-after/`, the round-3 state), after
  is `scratch/error-r5-after/` (6/6 verified) plus `scratch/error-r5-narrow/` at 390×844 (3/3).
  Deck runs assembled at `scratch/error-r5-deck/`.
- Crops are the union of the two measured `[role=dialog]` rectangles, which are within ~15px of
  each other this round, so the pair is framed near-identically.
- Bounded previews inspected at 1280×950 (`scratch/error-r5-preview/`). Never `contact.png`.
- Step 22 deliberately re-asks about an approved screen (R3-18 yes) because its button changed.
  Approved UI is not amended silently.

## Fourth review — ALL APPROVED, 2026-09-09

Submitted answers `error-states.review-4.answers.json`: **R4-20, R4-21, R4-22 and R4-23 all
YES**, 6–8 seconds each. Revisions 20–23 are approved, and R3-18 (ticket draft content and
hierarchy) was already approved in the round before.

**The UI design stage for these screens is complete.** Every visible change 1–23 is now either
approved or superseded by an approved one. Nothing here is implemented: the screens are
workbench designs behind `?mode=workbench`, no backend, IPC, install or GitHub call exists.

Still open, and NOT closed by this approval:

- **R2-14** — the failed-backup example slide. His answer was "confused?", which records
  confusion about the slide rather than a direction. It has never been re-asked.
- The four Goal items in the handoff (app-wide error migration, managed contribution project,
  report backend, pinned roadmap issue) are all unbuilt.

Next gate per `.claude/rules/feature-flow.md` is the contract deck, written by a FRESH agent
from `scripts/ui-review/contract-agent.md`, with a UX-tester run before implementation.
