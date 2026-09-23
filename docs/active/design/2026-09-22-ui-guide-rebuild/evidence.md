---
status: active
date: 2026-09-22
related: docs/active/plans/2026-09-21-ui-ux-consistency-audit.md
---

# UI guide rebuild — evidence inventory

This is research, **not** an approved guide. The current guide's statements and
existing component designs are candidates to test, not requirements to reproduce.
No claim about a screenshot is valid until the new sweep's `coverage.md` confirms it.

## Capture and fidelity

- App worktree: `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/youcoded`.
- Baseline run: `scratch/ui-consistency-baseline/` in this session's workspace worktree.
- Coverage: `scratch/ui-consistency-baseline/coverage.md` reports **320 covered,
  1 partial, 87 missed** of 408 planned surfaces in the six themes. This sweep
  also passed the eight-surface stress DOM-size check. The capture's first line
  verified that workbench `:5473` served this session's app worktree.
- Calibration evidence is covered across all six themes: `shots-main/settings-drawer`,
  `settings-donate`, `session-files-pane`; `shots-project-files-any-size/files-docs`
  and `files-root`; `shots-narrow/session-files`. `shots-main/settings-appearance`
  is **partial** (not verified in Meadow Mist). Do not call it a six-theme example.
- The 87 missed surfaces (10 in `assistant-settings`, 10 in `overlays`, 8 in `main`,
  7 in `chatgpt-signin`, 6 each in `chatsearch-gate-main` and `local-engine`,
  plus smaller groups) are **unreviewed**, not defects or successes. Several are
  previous-round-specific plans with stale selectors. Before any app-wide claim,
  triage relevant misses and rerun fixed plans; do not claim complete UI coverage
  from the successful exit code.
- Three calibration sources: baseline `scratch/ui-consistency-baseline/`,
  typography-only `scratch/ui-consistency-calibration-type/` (42 covered,
  1 partial, 8 missed of 51), and contained-divider plus compact-file-card
  `scratch/ui-consistency-calibration-after/` (60 covered, 1 partial, 12 missed
  of 73). Settings, Donate and Session Files are verified in **all six themes**
  in each required run. Deck crops are stitched exclusively from those real
  renderer shots under `scratch/ui-consistency-calibration-deck/`. Mockup source
  edits were removed after capture; **no proposed treatment is approved or
  implemented** by the existence of a picture.
- Workbench shows the actual renderer with fixture data, not real integrations.
  Real-session, touch, hover, motion and 1.5× zoom remain unverified unless separately
  exercised on an isolated dev/Workbench surface.

## First calibration decision (submitted)

`calibration.review.answers.json` records three visual **Yes** answers. C-1 prefers
16px medium drawer/dialog titles over today's 14px bold; C-3 prefers compact
inset Session Files cards over continuous rows. C-2 prefers a contained taper
but asks to tune its beginning/end and says the current scroll-fade animation
may look “very janky” against it. All three submitted answers were made
while viewing Halftone Dimension (`theme` in the answer file). This is not
approval of a final taste rule or
of applying these changes throughout the app. Before a divider rule deck, inspect
where scroll fades meet headers in the real renderer and compare a few endpoint
variants without editing the running app. No production component/style was changed for calibration. A later, dev-only
Workbench comparison was initially dev-only; the later Settings-only approval
and implementation are recorded below.

## Scroll-fade interaction to test before T-02

Read-only trace: the Settings header (`SettingsPanel.tsx:343-350`) is fixed above
its scrolling `.scroll-fade` body (`:352`); the shared `Dialog.tsx:229-265` has
the same split unless `scrollBody={false}`. `useScrollFade.ts:36-57` sets top/bottom
flags once scroll room exists. `globals.css:1143-1168` paints a **36px** sticky
panel-coloured gradient whose opacity changes over **150ms**; it is a separate
paint layer from the divider, not a mask of the line. The CSS history at
`:1103-1114` notes a visible colour mismatch on translucent wallpaper panels.
Therefore a static header crop cannot prove whether the line/fade meeting looks
smooth while scrolling. Compare top/scrolled states and a wallpaper theme in the
isolated renderer, and let Destin judge actual motion before final T-02 approval.
The wide Assistant settings rail has its own plain scrolling exception; do not
infer one fade behaviour everywhere. The isolated `settings-taper-calibration`
Workbench candidate mounts the real Settings drawer and the real scroll hook at
700×620; its body measured **726px of content in a 568px viewport** and
`data-fade-bottom=true`. At `scrollTop=100`, the three proposed top treatments
had `data-fade-top=true` with settled opacity **1 / 0.45 / 0** respectively
(`ui-probe --no-motion`, Halftone Dimension). The candidate also mounts the renderer's `ThemeBg` so wallpaper themes are
painted behind the real drawer/scrim; the back end remains a fixture. These
checks prove scroll geometry and final painted states, **not** the feel of the
transition; Destin will judge
motion by operating the live panes himself. At this stage the proposals were
dev-only and unapproved; the later Settings-only approval is recorded below.

Destin's correction (screenshot 2026-09-23): the fade's painted, full-width edge
is itself the problem, in addition to the translucent colour mismatch. Browser
computed styles in isolated Settings: Meadow drawer uses `--panel` at 0.58 alpha
but the fade's gradient starts at **opaque** `rgb(221,233,218)`; Halftone
uses 0.78 alpha beneath an opaque `rgb(16,14,28)` gradient. Solid Light and
Dark drawers and gradients are both opaque, so colour mismatch is specific
to translucent themes, while the edge-to-edge strip remains in every theme.
`scroll-surface.live.json` is an unapproved, review-only content-mask proposal:
it removes the two overlay pseudos in the candidate, uses the real drawer as
backing, and tapers the 36px content fade at left/right. Known caveat from
existing CSS history: a mask on descendants of `.layer-surface` popups once
failed under backdrop-filter and overflow; do not generalize this Settings
result to dialogs without checking them separately.

Destin's next review found the 36px content mask **not aggressive enough and not
covering enough content**. That rejects its strength, not necessarily the
content-fade approach. `scroll-surface-strength.live.json` compares that
36px/20%-side version against review-only 64px/12%-side and 84px/8%-side
versions. All retain the same provisional header line and real scroll hook;
no strength or app-wide rule is approved yet. The submitted strength deck chose
“Other”: Destin requested **42px** with slightly narrower side margins than
option B (64px / 12%). `scroll-surface-42.live.json` compares a review-only
42px / 10% mask directly with B; this is another visual test, not approval.
Its submitted answer again chose “Other”: keep the 42px depth and 10% sides,
but make the fade more aggressive. `scroll-surface-intensity.live.json` holds
those dimensions fixed and tests two faster content-disappearance curves
against the linear 42px version. This is not an approval of a curve or a rule.
The submitted intensity deck chose “Other”: Destin wants the fade closer to
the left/right edges. `scroll-surface-width.live.json` compares 10%, 7% and
4% side tapers with the middle-strength curve and 42px depth held constant.
The submitted width deck picked **4% sides** while viewing Meadow Mist. This
settles the preferred width for the Settings comparison, not a final guide
rule. The held middle-strength curve was a test condition, not an approval.
`scroll-surface-curve-at-4.live.json` held 42px / 4% constant while comparing curves.
The submitted curve deck picked the **steady (linear) curve** while viewing
Meadow Mist. Together with the 42px request and chosen 4% sides, that is the
preferred Settings fade for further visual review. `scroll-line-endpoints.live.json`
holds it fixed while comparing 8%, 20% and 32% header-line tapers. No shared
scroll treatment, dialog behaviour or final guide rule is approved. The
submitted endpoints deck picked **quick 8% ends** while viewing Halftone.
`settings-composition.live.json` places today's unchanged Settings drawer
beside the combined choices for a final visual check before any Settings-only
production styling is changed. Destin selected the combination in
`settings-composition.live.answers.json` (`ui-guide-settings-composition-8#S-1`,
submitted 2026-09-23), which authorized a **Settings-only** production edit.
`SettingsPanel.tsx` and `SettingsDrawer.css` now carry the selected 16px medium
heading, 8% tapered line, and unpainted 42px/4%-side content fade. The old
painted overlay remains global outside Settings and the newly approved shared
Dialog; the approved Project detail now also has a separately scoped mask. Desktop `verify.sh` passed
(types, related tests, knip, lint, design lint, invariants); Android
`./gradlew test -x bundleWebUi` passed with 843 tests / 0 failures in
102 result XML files. An isolated browser probe confirmed the Today and
Selected Workbench panes remain distinct, and checked the selected styling
in the ordinary Workbench app outside any comparison pane.
Destin also requested analogous header/body treatments in popup modals.
He selected the candidate on both real About and Development dialogs in
`popup-header-fade.live.answers.json` (`ui-guide-popup-header-fade-1#P-1` and
`#P-2`, submitted 2026-09-23). This approved the shared titled `<Dialog>`
header and scrolling body, now implemented in `ui/Dialog.tsx` and `ui/Dialog.css`.
Short/non-scrolling dialog bodies have no active fade; untitled bodies retain
their original styling. `dialog-shell.test.tsx` covers the component/CSS coupling,
non-titled exception and Today baseline; desktop `verify.sh` passed. Android
`./gradlew test -x bundleWebUi` passed (tasks up-to-date; 843 XML test results
were previously recorded). `<OverlayPanel>` supplies no shared header, so custom
Marketplace, Tags and Context popups are **not yet covered**; the broad
request still needs representative visual checks for those exceptions.
`project-popup-edge.live.json` compared the real full-screen
`ProjectDetailOverlay` with representative notes. Destin selected the
Settings-style candidate in `ui-guide-project-popup-edge-1#P-1` (submitted
2026-09-23). `ProjectDetailOverlay.tsx`/`.css` now carry the selected 16px
medium title, 8% line and 42px/4%-side content fade, with its original
scrollbar and optional metadata boundary left intact. The tester noted faint
text near the fade until scrolled further; the deck disclosed this trade-off
before submission. Its preview self-verified Meadow Mist and Halftone
Dimension at 1440×900 and 1024×768, and the contact sheet was inspected.
The answered Today pane retains the original 16px semibold/full-width line
and bare scroll body through dev-only CSS. This answer does not cover
Marketplace viewers or the Tags popup, approve final guide wording, merge
or release. A separate post-build `project-popup-edge.acceptance.json` deck
was submitted as `ui-guide-project-popup-acceptance-1#A-1` on 2026-09-23:
Destin chose Applied Project detail. Its independent contract grader passed,
the tester verified 24 captures across two sizes/two themes/top-middle-end,
and desktop `verify.sh` passed again after strengthening the live scroll-state
test. Android's 102 result XML files record 843 tests / 0 failures; its last
Gradle run reported up-to-date tasks and did not rebundle the web UI.

The next word-only questions in `custom-popup-headers.questions.json` did
**not** produce a design choice: Destin submitted Other for both (`Q-1`:
"confused. need to see this"; `Q-2`: "need to see this"). Do not infer a
Marketplace or Tags approval from those answers. `custom-popup-headers.live.json`
therefore compares the real file viewer (with a Workbench-only sample Markdown
file) and the real Tags & note editor in several themes before touching either
production popup. The short Tags editor may fit without scrolling, in which
case its conditional fade remains off; the live review states this limitation.
On `ui-guide-custom-popup-visual-1#M-1`, Destin selected **one-line** and noted
"but style it like other headers"; on `#T-1`, he selected **fade** (submitted
2026-09-23). This approves only the actual `FileViewerOverlay` one-line 16px
medium filename, 8% contained divider and 42px/4%-side mask, and the compact
`SessionTagsChip` editor's 16px medium title, 8% divider, and conditional mask.
`FileViewerOverlay.tsx`/`.css` and `SessionTagsChip.tsx`/`.css` now carry those
scoped choices. Workbench's Today variants use dev-only CSS to retain honest
old headers/bare scrolling. These answers do **not** extend to the main
Marketplace detail header, other custom overlays, final guide wording,
shipping or merging. In the post-implementation deck `custom-popup-headers.acceptance.answers.202609231035.json`, Destin chose **one-line** again for `M-1` and **fade** again for `T-1` on 2026-09-23 while viewing Meadow Mist. These accept the two scoped applied treatments, not a shared rule for other popups or final guide wording.

The next unapproved shell is `MarketplaceDetailOverlay`'s outer **Details** header, shared by skill and theme entries. Its original 18px semibold title, full-width divider and bare scrolling body are distinct from the approved *nested file viewer*; the large entry name and trust/actions live inside the body. Baseline `scratch/ui-consistency-baseline/coverage.md` reports `shots-marketplace-overhaul/detail` covered in all six themes, with separate Marketplace detail captures missing Dark. `marketplace-detail-shell.live.json` therefore asks about the skill and theme cases separately on the real overlay in Workbench. The alternative is **review-only** CSS on the preview route: 16px medium outer title, 8% tapered divider and conditional unpainted 42px/4%-side body fade. Destin submitted `marketplace-detail-shell.live.answers.json` on 2026-09-23 with **proposed** for skill `S-1` and theme `T-1` (both viewed in Meadow Mist). `MarketplaceDetailOverlay.tsx`/`.css` now apply those two scoped choices to the shared outer Details shell; Workbench's Today candidate restores original styling through dev-only CSS. The nested file viewer, entry names and actions are not folded into this decision. In `marketplace-detail-shell.acceptance.answers.json`, Destin picked the applied **proposed** treatment for both skill `S-1` and theme `T-1` on 2026-09-23 while viewing Meadow Mist. These two applied Details surfaces are accepted; final guide wording and other overlays remain open.

## Remaining titled custom shell: Resume Session

An inventory after Marketplace Details acceptance found no new Tags header: the suggested tag-picker candidate was `SessionTagsChip`, already approved. `ResumeBrowser.tsx:1583-1591` is the remaining distinct titled custom shell, and baseline `shots-main/resume-browser` / `resume-browser-stress` are covered in six themes. It has a 14px bold title, an **already tapered** 14% contained divider explicitly requested by Destin on 2026-09-10, and a painted `.scroll-fade` on its session list. Its desktop mode has a two-column transcript preview, while narrow/Android has a single list; a universal popup edit could disturb either. Destin said “resume should probably match everything else, idk why it would differ. let me see it,” then selected Matching in `ui-guide-resume-shell-1#R-1` and chose Applied in the post-build `ui-guide-resume-shell-acceptance-1#R-1` review. This approved the list-side title, divider and fade only; no global guide rule was approved. `globals.css` records a previous mask-image failure specifically inside Resume's `.layer-surface` under backdrop-filter/overflow, so the proposed unpainted mask needs visual proof at short scrolling height in wallpaper themes, not just a CSS assertion.

Review fixture `ResumeShellDemo` mounts the actual component with Workbench session data, auto-selects a previewable card through its real button, and restores the old styling in the Today iframe; the selected styling now lives in production. At 1100×600, direct browser probes confirmed overflow and a conditional lower fade with a real four-row transcript in Halftone (315px client / 358px content); stress probes scrolled to the end in Meadow Mist and Halftone and confirmed `data-fade-top=true`, `data-fade-bottom=false`. Magnified top/end captures showed the content mask visibly tapering in both themes despite the older warning in `globals.css`. The screenshot driver's Chrome bound CDP only to `[::1]:9978` while `shot.mjs` polls `127.0.0.1`, so its capture was stopped without evidence; isolated `ui-probe.mjs` produced and inspected the same candidate at short height instead. That tool issue is not a Resume UI verdict. `ResumeBrowser.tsx`/`.css` now carry the selected list-side title, divider and masked scroll edge; the transcript pane and controls remain separate. See `docs/active/reviews/2026-09-23-resume-shell-applied.md` for tests, platform limits and post-build acceptance.

## Old-guide claims to inventory, not adopt

| Source in `2026-08-25-ui-design-guide.md` | Subject | Treatment |
|---|---|---|
| §1, lines 28–60 (`G-1`–`G-5`) | primitives, tokens, radii, primary action, text floor | Split hard technical constraints from aesthetic choices and exceptions. |
| §2.1–2.4, lines 66–155 (`G-6`–`G-8` plus prose) | depth, contrast, type/weights, semantic colour, accent, spacing, borders, shadow, hover/press/motion | Check each normative clause; no blanket adoption from a heading. |
| §3, lines 158–181 (`G-9`, `G-12` and unnumbered prescriptions) | control types and use/don't-use table | Separate functional semantics from visual taste. |
| §4.1–4.2, lines 189–263 (`G-13`, `G-15`, `G-20`, `G-22`–`G-27` and prose) | chrome, chat, tool cards, files, status and tags | Confirm surface and prior decisions before proposing generalisations. |
| §4.3–4.5, lines 264–315 (`G-10`, `G-11`, `G-16` and prose) | settings/dialogs, screens, side panes | Compare what the shared component actually draws in each theme. |
| §4.6–4.8, lines 316–382 (`G-14`, `G-17`–`G-19`, `G-21`, `G-28`–`G-30` and prose) | chips, cards/rows, menus, states, button placement, phone | Retain approved product/functionality constraints outside taste voting. |
| §5–6, lines 386–425 | theme-pack promises and checklist | Verify guards separately; build a new short checklist from approved guide. |

Before final rule decks, break these groups into individual normative claims and
record exact source, current examples, counterexamples, technical constraints,
coverage and any known decision. The grouping is a search map, **not** a completed
claim-by-claim audit.

## Calibration leads from source and verified baseline captures

| Role | Current implementation | Competing claim or treatment | Question to investigate |
|---|---|---|---|
| Header/type | `youcoded/desktop/src/renderer/components/SettingsPanel.tsx:343-349` and `ui/Dialog.tsx:229-255` draw a `text-sm font-bold` title and `border-b border-edge`. | Current guide §2.2 says dialog titles `text-base`, `font-medium`, no bold; §4.3 repeats it. | Which title size/weight reads right in Settings and dialogs? Does the visual hierarchy need one treatment for both? |
| Separators | Those same shared headers have a full-width `border-b`. `project-view/tabs/FilesTab.tsx:739-742` uses row borders inside a rounded row wrapper. | A decorative line that reaches both container edges may feel like a cut; a structural content boundary may have a different purpose. | Compare inset-stop, fade and no-line in real containers; decide decorative vs structural cases separately. |
| File entries | `SessionDrawer.tsx:1373-1397` uses flat two-line rows, with remove on hover/focus. `project-view/tabs/FilesTab.tsx:678-727` has preview cards **and** `:731-779` has its own file-list row. | A file's purpose and available preview determine whether a row or a card makes sense; the Project view is not just one card treatment. | What should Session Files show and how should it relate to Project Files' grid/list states? Check phone/touch remove accessibility separately. |

The verified light-theme captures show the current Settings and Donate headers have a
hard edge-to-edge hairline, whereas the Project Files screen has preview-bearing
cards and Session Files has compact edge-to-edge rows. That is a description of
what is visible, **not a defect verdict**. The six-theme sheets were inspected;
`shots-main/{settings-drawer,settings-donate,session-files-pane}` and
`shots-project-files-any-size/files-docs` are covered in all six palettes.
`docs/roadmap/user-interface.md` contains related existing items (including
phone-width file-label/remove behaviour); link those rather than filing duplicates.

## Deferred wording follow-up (submitted 2026-09-23)

`rule-words-round1.questions.answers.json`: **T-02/r2 Yes** to the quoted scoped header/scroll-edge rule; **T-01/r3 Don't know** until Destin sees popup sizes and classes *in app context* alongside simplification/unification choices; **T-03/r3 Don't know** while he considers small left-hand square or rectangular file previews. Neither deferred wording is approved. The T-02 decision changes no other shell or screen.

Source-based starting point for the popup comparison: `ui/Dialog.tsx:70-83,117-128` already defines four named width/height ceilings — prompt 340×476, panel 420×588, document 600×840 and wide 820×700, each responsive to viewport limits. The source comment derives these from content measure rather than arbitrary rungs; wide is the two-pane Assistant settings exception. A search of `components/**/*.tsx` found **33 direct `<OverlayPanel` occurrences in 30 files** (including Dialog's own shell): e.g. a search palette at 640px (`project-view/ProjectSwitcher.tsx:110-115`), near-fullscreen detail overlays with responsive insets (`project-view/ProjectDetailOverlay.tsx:42-45`, `marketplace/MarketplaceDetailOverlay.tsx:147-150`), the differently inset file viewer (`marketplace/FileViewerOverlay.tsx:70-77`), and Resume's two-pane custom window (`ResumeBrowser.tsx:1562`). This is an inventory starting point, not proof that every anchored popup uses `OverlayPanel` or that 33 are distinct designs. Old baseline captures include missed surfaces (the close-session prompt, for example) and predate accepted scoped restyles; verify **fresh** screenshots before labeling anything Today.

The Session Files row is an `ArtifactRecord` (`SessionDrawer.tsx:1345-1402`) with path/status/timestamp but **no preview field** (`shared/artifacts/types.ts:44-60`). Project Files already mounts `ArtifactThumbnail` on its grid (`project-view/tabs/FilesTab.tsx:682-705`): `ArtifactThumbnail.tsx:1-16,64-155,185-245` supports actual image bytes via guarded binary IPC, Markdown/text/HTML content via the artifact API, lazy in-view reads and an extension glyph if unavailable. A left-side image preview can therefore be proposed using real content and a truthful fallback, but legibility at small sizes, load/failure states, path safety and Android parity need review; do not draw invented previews of files that have none.

A context-free reviewer of the baseline accepted three framing corrections for the
calibration deck: name **drawer versus dialog** title roles; point specifically
to the separator **under the title**, not the search/row lines; and compare the
**same Session Files pane** before/after, using Project Files only as a reference.
These corrections are reflected in `calibration.review.json`. A second fresh
reviewer inspected the rendered deck and spotted orange callouts covering the
very line/card edges being compared. The callouts were moved off those details;
the deck was re-previewed in both desktop and smaller windows before serving.
