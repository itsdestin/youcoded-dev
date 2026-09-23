---
status: active
date: 2026-09-22
related: docs/active/plans/2026-09-21-ui-ux-consistency-audit.md
---

# Proposed taste rules — decision ledger

**Partial approval only.** T-02/r2's exact scoped wording is approved; T-01 and
T-03 are deferred. The first deck chose visual examples, **not** global rules.
Each remaining candidate needs
verified current screens and theme coverage before its rule deck. Final wording and
exceptions must be approved by Destin in a submitted deck; the answer source is
`<deck-key>#<step-id>`.
An edited rule increments its revision and is asked again. UI implementation decisions
are separate from rule approvals.

| ID / revision | Draft for calibration (not final wording) | Current example / competing example | Impact to investigate | Status / answer |
|---|---|---|---|---|
| T-01 / r3 · compact outer titles | **Candidate exact wording:** “Use a 16px medium-weight title for the outer header of Settings and titled popups. Page headings, section labels, row labels, file and entry names, and buttons have their own hierarchy; don't resize them just to match popup titles. Leave room for Back, Close, and long titles.” | `shots-main/settings-drawer` and `settings-donate` in all six themes; `SettingsPanel.tsx:343-349` and `ui/Dialog.tsx:229-255` formerly drew 14px bold; both now use the selected 16px medium title. Counterexample: `shots-main/session-files-pane` has its own list heading and file labels, not a shared dialog title. | Named header surfaces and long-title handling; phone-width dialogs need separate wrapping check. No implied change to page headings. | deferred / visual direction **yes** `ui-guide-calibration-1#C-1`; exact r3 wording **not approved** `ui-guide-wording-round1-1#T-01-r3` — `ui-guide-popup-files-comparison-1#P-1` requests one consistent whole-header layout (spacing, height, subtitle and close placement) across the four named dialog widths, with title typography to tune visually; the shared 16px-medium title alone is not the decision. P-2 says word-only custom-popup options were confusing; `ui-guide-popup-files-round2#H-1/H-2` picked the 56px/16px-semibold aligned direction with **one-line headers required** and a separate concern that Project File details do not match the app. `ui-guide-popup-files-round3#H-3` then picked moving About's version to the top of its body (single-line header); `#P-4` picked the quiet Project context-file detail and `ui-guide-project-context-metadata#P-5` picked that view **without** its Project Instructions / Always / file-size metadata row. The filename, actions, unboxed explanation, approved header line/fade, and underlying file metadata stay intact. These scoped directions are now implemented and **accepted in the development worktree** (`ui-guide-selected-screens-built#B-1/B-2/B-3`, all Yes); they do not approve global wording, merging or release. Keep r3 wording deferred |
| T-02 / r2 · header line and scroll edge | **Candidate exact wording:** “On the reviewed fixed-header, separately scrolling Settings and titled-popup shells, draw a 1px header line inset 16px per side and tapered over the first and last 8% of its span. Where more body content is hidden, fade the content at that edge over 42px, softening the outer 4%; otherwise show no fade. Do not paint a panel-colored strip. Structural row borders, Markdown rules, metadata boundaries, internal separators, untitled dialogs and the wide Assistant settings rail are separate roles; review new custom shells before using this recipe.” | Settings and shared Dialog headers formerly drew full-width `border-b`; both now use the approved 8% line. Custom popup headers and Project Files list remain separate subjects. | Shared headers, card sections, menus, lists, Markdown rules; each classified decorative / structural / content before changing. | approved / exact r2 wording **yes** `ui-guide-wording-round1-1#T-02-r2` (2026-09-23), limited to reviewed fixed-header/scroll-body shells; no broad divider refactor |
| T-03 / r3 · two file views | **Candidate exact wording:** “In Session Files, use compact inset cards for files without previews: put the filename first, then a short status and date, with a quiet outline; do not invent a thumbnail. In Project Files, keep both the preview grid and dense list, choosing by task and available preview. Phone download cards and other file surfaces may use their own treatment.” | `shots-main/session-files-pane` and `shots-narrow/session-files` across six themes vs `shots-project-files-any-size/files-docs` preview grid; Project Files also has a code-confirmed dense list (`FilesTab.tsx:731-779`). Current `SessionDrawer.tsx:1373-1397` flat rows are the conflicting surface. | Applies to Session Files desktop/phone, not all file browsers. Touch/keyboard remove reachability is a functional constraint to test separately, not a taste vote. | deferred / compact **card** direction yes `ui-guide-calibration-1#C-3`; exact r3 wording **not approved** `ui-guide-wording-round1-1#T-03-r3` — `ui-guide-popup-files-comparison-1#F-1` selects a left rectangular preview as a direction, with no separate search-line and the reviewed tapered header/fade; `ui-guide-popup-files-round2#F-2` then picked the 84×48 balanced rectangle, but asked to rebalance filename/status alignment against each preview. `ui-guide-popup-files-round3#F-3` picks the centered filename/status text group beside that same preview. The Session Files development treatment was accepted (`ui-guide-selected-screens-built#B-3` Yes); neither the pick nor acceptance approves final rule wording, merging or release |

The wording above is *hypothesis*. The first submitted deck chose 16px medium
Settings/dialog titles and compact inset Session Files cards without thumbnails.
It did **not** approve the proposed global rules. T-02/r2 received later scoped wording approval in `ui-guide-wording-round1-1#T-02-r2`; the chronology below records the tests that led there. In C-2 Destin chose a tapered
header line but added: “i want to tune the beginning/end of the taper a bit. also
we will need to re-think how our scroll-fade animations look, as the current one
will look very janky against this tapered line i think”. Tune its endpoints and
review the actual scroll-edge animation **before** asking him to approve final
T-02 wording or implement a broad divider rule. `taper.live.json` separately
asks about endpoints and scroll-edge treatment using operable Settings panes;
those choices are not final rule wording or production-edit permission. Destin
clarified that the **painted scroll effect itself** is a flat, full-width dark
strip on Meadow Mist, not merely a timing/opacity preference. The separate
`scroll-surface.live.json` compares this effect with a tapered content mask,
showing the actual drawer background through it across solid and wallpaper
themes. It is review-only; check the chosen combination, dialog exceptions and
wallpaper themes before T-02/r2. In the submitted Settings comparison Destin
picked a steady content fade (42px depth, 4% side taper), after rejecting the
opaque painted strip and trying stronger/deeper alternatives. That selection is
for the Settings visual treatment only; `scroll-line-endpoints.live.json` now
re-tested header line endpoints with that fade held fixed. Destin picked
quick 8% line ends; `settings-composition.live.json` asks whether the
combined Settings-only treatment should replace today's drawer. He selected it
in `ui-guide-settings-composition-8#S-1`, and it was applied to Settings only.
He subsequently requested popup parity and selected the treatment for real
About and Development dialogs (`ui-guide-popup-header-fade-1#P-1`, `#P-2`), so
the shared titled `<Dialog>` now uses it. He also selected it for the larger
Project-detail shell (`ui-guide-project-popup-edge-1#P-1`), now applied to that
specific overlay. He then selected the one-line, 16px medium file header and
same divider/fade for the Marketplace file viewer (`M-1`), and a conditional
fade plus matching header for the compact Tags & note popup (`T-1`), both in
`ui-guide-custom-popup-visual-1`. Destin separately selected and accepted the
same outer Details treatment for Marketplace skill and theme detail views in
`ui-guide-marketplace-detail-shell-1` and its post-build acceptance deck;
entry names, actions and nested file viewer remain distinct. The remaining
custom titled shell, Resume Session, was chosen as Matching in
`ui-guide-resume-shell-1#R-1` on 2026-09-23; the reviewed scope is its list-side
16px medium heading, 8%-within-inset divider, and conditional unpainted
42px/4%-side list fade. Its preview pane, filter controls and session cards
were not approved for restyling. Destin chose **Applied** in the post-build
`ui-guide-resume-shell-acceptance-1#R-1` review (2026-09-23). This is a
scoped UI approval, **not** final T-02 wording or a broad divider refactor.
The Session Files decision contradicts r1's implication that metadata-first
files should stay flat rows;
T-03/r3 above is the revised candidate, including Project Files' two modes
and the separate phone-download role; decide its exact wording in the rule deck. Keep Project Files' grid **and** list explicit.
Do not publish any candidate before its own final-wording deck and counterexample
review.
