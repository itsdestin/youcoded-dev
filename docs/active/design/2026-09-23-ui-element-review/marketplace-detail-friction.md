---
status: active
date: 2026-10-04
related: redesign-backlog.md row 9, marketplace-detail-1.json
---

# Marketplace detail pages — where the guide helped, and where it didn't

First drafts of every Marketplace detail page (plugin, bundle, member skill, flagged
item, uninstallable connection, theme installed / not installed, integration, phone,
small window), built only from `guide-draft.md`, `decisions.md` and the workspace
tooling. App commits `59987dc7d` (screens + fixtures, no visual change) and
`678005121` (the redesign). Deck: `marketplace-detail-1.json`.

References opened first (guide "How to use" step 2): **Session details** (a popup about
one thing), **Account** (text + button in one card), **Backup & sync** (labelled cards,
notice inside a card), **About** (fold-out rows inside a card), the **skills drawer**
(cards). Decisions below name the rule that drove them.

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | Every detail page is the shared `Dialog`: one-line title, ✕, tapered line, Esc. "Esc · Close" gone (also from the file viewer). | Guide "Popups and side panels"; decisions B-1, H-2. Clear. |
| 2 | Popup width `document` (600px); `wide` (820) for the two-column variant. | **Guide silent** on which width a content page gets; it only defines "narrow ≤420". I took Dialog.tsx's own derivation (600 = long-reading measure). |
| 3 | Title is "<Kind> details" (Plugin / Skill / Connection / Theme / Integration details); the name sits large in the top card. | **Guide silent** on what a popup about one item is titled. Copied Session details. Asked as MD-13. |
| 4 | Top card has **no label above it**. | **Guide contradicts the approved screen.** Guide "A label comes first: a popup never opens straight into a card" — but Session details (approved 2026-10-04, decisions row 121) opens straight into its name card. A label there could only repeat the title. Followed Session details; the guide needs an exception: "the popup's subject card". |
| 5 | Top card text order: name + status pill on one line, one chip row under it, then the description. | Guide "Cards" → text order; decisions U-1, CA-1. The recipe is written for **grid cards**; I applied it to the detail page's top card by analogy — **guide ambiguous** whether "Cards" covers a detail page. |
| 6 | Chip row never wraps and fades at its end (24px mask). | Decisions G-9. **Tooling gap:** no shared piece or class exists for the fade — MarketplaceCard itself does NOT fade, it just clips. I wrote `[data-detail-chips]` in DetailPage.css; a shared `ChipRow` is the real fix. |
| 7 | Chips: Likely safe · source · author · "412 installs" · 👍 93%. Numbers use `Badge` (bold number, grey word). | Guide "Text and numbers" (bold number + grey word); decisions CA-1 ("footer details chips too"). Trust badges and `Badge` are two different hand-made chip looks (`TrustBadges.BADGE` vs `ui/Badge`); they nearly match by luck. **Guide silent** on one chip piece. |
| 8 | Status pill: shared `Pill` (Installed / In use / Needs auth…). Replaced the integration's `STATUS_TONE_CLASS` (coloured text) and the theme's disabled "Active" button. | Guide "Status and notices"; decisions S-1; "nothing that isn't a button looks like one". Clear. |
| 9 | Favourite + share as icon buttons at the top card's top right. | Guide "Cards" → quick actions top right. Clear. LikeButton (theme heart) left as it was — it is hand-rolled; **not** converted. |
| 10 | Buttons: one button full width; two side by side at the right, filled on the right; stacked full width with filled on top at phone width. | Guide "Buttons"; decisions BP-1, BP-3, BW-1/2. **Ambiguous:** the guide's width rule is about popups (≤420 = narrow); 600px popups are "wide", but the button sits inside a card — I treated the card as the space. |
| 11 | Lone **Uninstall** is a full-width outlined button. | Guide "One button: full width". **Guide probably wrong here:** written for a lone MAIN action (BP-3: "a lone main action"), the guide text drops "main". A full-width Uninstall is the biggest thing on the page. Asked as MD-12. |
| 12 | Update is the filled button when installed (Uninstall outlined beside it). | Guide "one filled button per view; main action filled". My judgement that Update is the main action there. |
| 13 | Theme with update: three buttons (Uninstall, Update, Apply theme). | **Guide silent** on three buttons. |
| 14 | Install failure: danger notice inside the top card with "Retry install" inside it. | Guide "Status and notices" (notice inside the thing, its buttons inside the notice); decisions P-2/P-4. Was only a hover tooltip — invisible on touch. |
| 15 | "Can't install from here" info notice moved into the top card. | Same rule. |
| 16 | Every other group = small label + level-1 card: What this can do, About, What's inside, Feedback, Source. | Guide "Spacing" → nothing bare, a label first; decisions NB-1…3. Clear. |
| 17 | Flagged findings: warning `Callout` inside "What this can do", replacing a ruled-off list with amber dots. | Guide "Status and notices"; "No line crosses the full width". Clear. |
| 18 | About text set to 14px (`text-sm`); markdown used to inherit the chat's larger size. | Guide "Text and numbers" (body 14px). |
| 19 | About is **not** given the reading underline. | **Guide contradicts the reference.** Guide/decision F-1 say a label over reading text gets the soft underline; About's own "Disclaimer" label (the guide's example) no longer has it after the nothing-bare rebuild. Followed the screen. |
| 20 | Topic tags / life area / audience: neutral `Badge`s at the foot of the About card. | Guide "Card levels" (text describing a card lives in it). **Guide silent** on topic tags vs the chip row; I kept them out of the never-wrap row so the safety facts stay visible. |
| 21 | What's inside: one boxed `SettingRow` per member (name, its description, arrow), grouped "Skills 14". | **Guide ambiguous between two recipes:** "Lists of short names are plain rows in one shared box" vs "Settings-style lists (each row opens something) are boxed rows". Rows open pages, so boxed. Long for a 14-skill bundle — that is why the folded and two-column variants exist. |
| 22 | "Agents" relabelled "Specialists" in What's inside. | The app's own word (CATALOG_TYPE_LABEL). Copy change — flag if unwanted. |
| 23 | Comments: each in a level-2 box, 8px apart (no full-width lines). | Guide "Card levels" (no full-width lines; nested = one look); decisions SP-5 (8px). |
| 24 | Comment box: Textarea with "Post comment" outlined under it at the right. | **Guide asks for something no piece supports:** "a text box with its own action keeps it inside the box … small filled button". `InputGroup` is single-line only; a multi-line box with an inside button does not exist. Left as before. Also: the inside button would be filled → two filled buttons on the page (Install + Post); the guide doesn't say which rule wins. |
| 25 | Feedback summary + Helpful / Not for me on one line; reason line under. | Guide "Buttons" → text and buttons in one box; NB-2. |
| 26 | Source card: "Source code" row with an outlined Open button (was a raw underlined URL), Licence, Checked version with the explanation written out (was a hover tooltip). | Guide "Buttons" (underline only inside a sentence); narrow-viewport rule (tooltips never fire on touch). |
| 27 | Integration page moved into its own file on the same shell; removed the disabled "Settings (Coming soon…)" button and the disabled status-buttons ("macOS only", "Coming soon", "Deprecated" — the pill says it). Lost: the integration's coloured outline round the whole popup. | Guide "nothing that isn't a button looks like one"; Dialog has no per-popup border colour. **Behaviour-adjacent:** a dead button removed — called out on MD-9. |
| 28 | Setup facts as `SettingRow`s in a "Setup" card; the post-connect command as an info notice with Dismiss / Copy / Open new setup session inside. | Guide "Settings"; "Status and notices". Dismiss was bare text → outlined (decisions F-2). |
| 29 | Theme preview + colour swatches in one "Preview" card. | Nothing bare. |
| 30 | Not-found: a single card, no "Close" link (the ✕ is the way out). | Guide "Buttons" (close is the ✕); single-card popup needs no label. |
| 31 | **Three arrangements** (one column / two columns / folded), behind a workbench-only switch `?detailLayout=` (workbench-mode.ts, the existing `?screenFrame=` precedent). App ships "one column". | **Guide silent** on how to arrange a page with this much information — the one real open choice. Two columns is **invented arrangement** (no popup has a content side-column; only Assistant settings' nav pane). Folded copies About → Privacy. |
| 32 | Folded variant's group label "More about this plugin". | **Invented copy.** Needed a label that doesn't repeat the title. |

## Tooling friction

1. **Deck builder refused the app's default themes.** `review-cards.py build` failed with
   `no tokens for theme "youcoded"`: `deck/tokens.json` knows only light/dark/midnight/creme,
   and the new built-ins YouCoded / YouCoded Night live as JSON in the app, not in
   `globals.css` or `wecoded-themes`. Earlier decks (yc-theme-1) dodged it by labelling
   YouCoded pictures "light"/"dark". **Fixed in this session:** `deck/build.py` now also reads
   `youcoded/desktop/src/renderer/themes/builtin/<slug>.json` (this worktree first, then the
   shared checkout) and names them "YouCoded" / "YouCoded Night". No test added — the
   existing `test_tokens.py` pins only tokens.json; a test would need an app checkout in CI.
2. **Auto-highlight is meaningless for a whole-page redesign.** Every approve step warns "the
   change covers 80–99% of the crop — name an element instead". There is nothing smaller to
   name. A step-level "whole page changed, box the panel" option would silence honest warnings.
3. **The contact sheet is unreadable for a 13-step, 3-theme deck**: `preview` packs every page ×
   size × theme into one 2904×32552 image, displayed ~16× too small to judge. I read individual
   `preview/p*.png` pages instead. `preview/` is also shared by every deck in the folder, so
   older decks' pages sit beside this one's (p10-light… from another deck).
4. **No shoot screen per variant without code:** layout variants needed a production-code switch
   (`workbenchDetailLayout`) plus `params` in the screen list. That works, but there is no
   written recipe for "show N designs of one real screen on a Choice slide"; I found the
   `screenFrame` precedent by grepping.
5. **Sub-screens and marks:** a `marketplace/detail/<kind>` sub-screen must be marked with its
   full name, but the popup only knew its kind. Needed a `screen` prop threaded from the opener.
   The README covers `useScreenOpen(…, subpages)` but not how the opened surface learns which
   sub-name to mark.
6. **The workbench could not open the integration page at all**: `integrations.list` fell to the
   catch-all `[]`, so the page had never been photographed. Added fixtures + a hand-written mock
   (commit 1). Worth a sweep: which real popups are unreachable in the workbench because their
   list call returns `[]`?
7. `verify.sh` passed first time (types, full suite, knip, lint, design-lint ratchet, ast-grep,
   shoot --check, journeys). Two tests pinned the OLD look by source text
   (`marketplace-detail-shell.test.ts` pinned exact class strings and a CSS file) — rewritten to
   pin "built on Dialog, never 'Esc · Close'" instead. One test read the popup from the render
   container; Dialog portals to `document.body`.
8. `shoot` itself was excellent: 48 pictures in ~25s, every one proven open.

## Left undone / unsure

- LikeButton (theme heart) and TrustBadges keep their hand-made chip/button styles.
- The file viewer keeps its own shell (only its close control changed) and its footer line.
- The old workbench review mockup `MarketplaceDetailHeaderDemo` still compiles but its "Today"
  CSS no longer matches the new markup; it is a past round's record.
- Install-failed, installing and update-available states were not photographed (need a failing
  or slow install in the fake backend).
- Android: shared renderer, no native change; not built here.

## Round 2 (2026-10-05) — after Destin's marketplace-detail-1 answers

App commit `a3a29bd1d`; deck `marketplace-detail-2.json` (before = round 1's drafts,
`runs/mkd-after`; after = `runs/mkd2-after`).

| # | What I did | Driven by |
|---|---|---|
| R2-1 | Two columns is the only layout; the one-column / folded drafts and `?detailLayout=` are gone. Phone and windows under 640px fold to one column. | MD-1 (picked columns). |
| R2-2 | Buttons in the right-hand column stack full width. | Guide "Buttons" (stacked when narrow). **Guide gap:** the rule is written by popup width (≤420) and phone width; a narrow COLUMN inside a wide popup is neither. I treated "the space the buttons sit in" as what counts. |
| R2-3 | Every chip in a detail page (top row and topic chips) is `MetaChip`, the trust badges' own box. | MD-1 note "install is tiny". |
| R2-4 | Heart redrawn (standard symmetric 24-unit heart, Feather/Lucide shape); like button is the shared ghost button, liked = accent fill, not red. | MD-7. **Guide silent** on whether a "like" may be red: principle 2 keeps status hues out of WORDS, and a heart is an icon, not a status. Asked in the deck (M2-5 risk line). **Tooling gap:** the app has no icon set to "use a proper heart from" — every icon is a hand-drawn SVG in its own file. |
| R2-5 | Feedback: comments as plain rows in ONE shared box; the vote reason under the vote words (not under the buttons); the comment box is the shared field with Post inside (Enter posts). Three drafts: together / split / question. | MD-6; guide "Buttons" (action inside the text box), "Lists" (one shared box). **Behaviour change to flag:** the comment box is one line now (was two); Shift-Enter does not add a line. |
| R2-6 | Theme page: three drafts — card first (round 1), picture first, picture beside. | MD-7/MD-8. Picture-first gives the picture card **no label** — same exception as the top card (the guide has none for it). |
| R2-7 | A long source address breaks onto a second line instead of running under the Open button; the pinned-version line is shorter. | Found reading the round-2 pictures (side column is ~250px). |

### Tooling lessons

**(a) The chip sizes were different and nothing caught it.** Root cause: three chip
recipes in one row — the trust badges (11px, normal line height), the shared `Badge`
(11px but `leading-none`, so a ~4px shorter box), and the card's `ThumbsSummary` (its own
12px text) placed inside a Badge. Every check passed because none compares siblings:
design-lint only flags raw colours / arbitrary values / restyled primitives, and both
recipes are "legal"; `shoot` proves a screen opened, not that its parts agree; my own
picture review missed a 4px height difference at contact-sheet scale. **Could a check
catch it? Yes, two ways:** (1) a unit pin on the cause — done: `trust-badges-scan.test.tsx`
asserts every fact chip renders the badges' exact box (seen red when the box was changed);
(2) a general browser check — `shoot` already runs a page script per screen; a "siblings
agree" pass could measure every child of a marked row (`[data-detail-chips]`, any
`data-chip-row`) and flag height differences over 1px. That would also catch the same bug
on the Marketplace cards, which still mix the two recipes. Not built — candidate.

**(b) A broken icon (the heart) passed every check and my screenshot review.** The path was
valid SVG that drew the wrong shape: types, lint, design-lint and tests cannot know what a
heart looks like; `shoot` saw a non-empty picture; at 12px in a 1440px screenshot it read as
"a small heart-ish mark" to me. **Could a check catch it? Partly.** A cheap symmetry test
would have: render each icon to a bitmap (the shoot browser can rasterise an inline SVG)
and flag shapes whose left/right halves differ when the icon is meant to be symmetric (heart,
star, shield, chevrons) — this one's right lobe was visibly lower. More generally, an
**icon sheet** — every hand-drawn icon in the app rendered at 48px in one picture, added to
`shoot --list` — would let a human (or the review deck) see broken drawings that are
invisible at real size. Neither exists; the root problem is that the app has ~100 one-off
SVGs and no shared icon set. Candidate.

### Other tooling friction this round

- **`highlight: {"text": …}` is refused on shoot pictures** ("a shoot picture names a screen,
  not an element"), so pointing at the chips or the heart needed hand-placed percentage boxes,
  which then warn "prefer a selector". There was no working way to box a small element on a
  shoot screen without hand-measuring both runs' pixels; when before and after have different
  popup widths one box has to cover both positions.
- The deck's Before had to be round 1's picture folder (`runs/mkd-after`), so every approve
  step's "Round 1" shows the ONE-column layout he didn't pick — the diff mixes the layout
  change with the step's own change. A `shoot --before <commit>` that also takes the
  workbench switches (e.g. `?detailLayout=columns`) for the before side would have given a
  cleaner Before.
- verify's first run failed one behaviour test because the comment button's visible word
  changed ("Post comment" → "Post"); fixed with an accessible name rather than editing the
  test. Fine — it caught a real screen-reader regression.

## Round 3 (2026-10-05) — after Destin's marketplace-detail-2 answers

App commit `3884e2fad`; deck `marketplace-detail-3.json` (before `runs/mkd2-after`, after
`runs/mkd3-after`).

| # | What I did | Driven by |
|---|---|---|
| R3-1 | Feedback is two cards (Feedback = votes, Comments = thread + box) everywhere; the other looks and `?feedbackLook=` removed. | M2-2 "split". |
| R3-2 | Theme page: picture beside, only layout; `?themeLayout=` removed. **No label above the picture card.** | M2-3/M2-4 "side" + "dont need the text 'preview'". **Destin-approved exception to the guide's "a label comes first / once one card has a label every card does"**: a card that is a picture OF the item needs no label (like the top card). The page now has an unlabelled picture card beside a labelled "Colours" card — the guide should name this exception. |
| R3-3 | In the narrow right column, the heart/star/share move from beside the name to beside the chips. | Found in the round-3 pictures: "Meadow Mist" broke mid-word ("Meado / w Mist"). **Guide gap:** "quick actions at the top right" assumes a card wide enough for name + actions on one line. Cost: the chips there are cut short by the fade. |
| R3-4 | Four like-button drafts, all the shared `Button` (ghost / secondary / primary-when-liked / icon-only + "88 likes" chip). | M2-3 note. The `chip` draft's count does not move the instant you like (the chip reads page stats, the button owns the live count) — said on the slide. |
| R3-5 | Three integration drafts: big tile (round 2), small badge beside the name, no icon; the latter two use a `compact` top card where description and buttons share one line. | M2-10. **Guide silent** on item icons (only `ProviderIcon` for providers); the 20px badge copies the provider-logo size. In the compact card a lone button hugs the right instead of going full width — the "text and buttons on one line" rule (NB-2) outranks "one button: full width" there; the guide doesn't say which wins. |

### Tooling friction this round
- **`shoot --check` flagged two real variants as LOOK-ALIKE** (outline vs ghost heart, heart-only
  vs heart+count): the difference is a few pixels, below the check's thumbnail resolution, so
  verify failed until I declared `sameAs` with a reason — which records two different screens
  as "expected identical". A finer comparison (or comparing the marked panel's crop at full
  size) would avoid a false declaration.
- **Choice slides cannot crop a shoot screen.** The like-button drafts differ in a 40px button
  on a full 1440×900 picture; a `crops` region only works for old-style `shots-<plan>` folders,
  so I cut close-ups by hand (`runs/mkd3-after/shots-like/`). A per-slide `region` on a shoot
  screen name would remove that step.
- **Liked states can't be photographed**: the fake backend never starts a theme as liked, so the
  "filled when liked" draft can only be shown un-liked. A `?liked=1`-style switch is missing.
- **The `preview/` folder is shared by every deck in this folder**: `p2-midnight` for this deck
  was another deck's stale picture (a provider-cards deck), because preview only rendered the
  sizes/themes asked and left older files in place. Easy to read the wrong picture.

## Round 4 (2026-10-05) — after Destin's marketplace-detail-3 answers

App commit `7567c48bf`; deck `marketplace-detail-4.json` (before `runs/mkd3-after`, after
`runs/mkd4-after`).

| # | What I did | Driven by |
|---|---|---|
| R4-1 | Like is a heart-only icon button; its count is the "N likes" chip. The button reports every count change (optimistic step and rollback included) to the page through `onCountChange`, so the chip moves the instant you click. Other styles and `?likeStyle=` removed. | M3-1 "chip". Clean enough: one callback, no new store. |
| R4-2 | Big tile kept; three alignments behind `?integrationAlign=`: **row** (tile, words, buttons on one centre line — default and my pick), block, top. | M3-2. **Guide gap:** the guide never says how an icon lines up with a title + hint + control. The closest recipes are the setting row (icon, title, hint, control right, vertically centred) and the Account profile card — both are "row", which is why I recommend it. In "row" a lone button hugs the right (text-and-buttons-on-one-line beats one-button-full-width, NB-2) — again the guide doesn't say which wins. |
| R4-3 | Theme chips in the narrow column: three drafts behind `?themeChips=` — wrap, a plain facts line under the buttons, fewer chips. In all three the heart/star/share go back on the name's line with **word-only wrapping** (`break-normal`). | M3-3. "Wrap" breaks decision G-9 ("the chip row never wraps") — a Destin-requested exploration; whichever he picks, the guide's G-9 needs a narrow-column exception or the page needs fewer chips. |

### Tooling friction this round
- **verify's `shoot --check` is blocked by another session.** The Office screens need the
  office editor on fixed port 4717, which another worktree's editor (`ha-pages-connection`)
  held for the whole round. The check refuses to run any screen, not just the Office ones,
  and names no way round it but stopping another session's process (not mine to stop).
  I proved the marketplace and library screens open with a plain `shoot` (27/27, no
  look-alikes) instead. A per-worktree port, or `--check` skipping only the Office screens
  with a warning, would fix it.
- **One full-suite run failed and the next two passed** with no change in between; the
  first run's log was not kept (verify prints only the summary unless you capture it), so I
  could not name the test. verify should save each check's full log to a file and print its
  path on FAIL.
- **`preview` renders only the first two themes** of a three-theme deck at the requested
  size, and leaves stale pages from other decks in the shared `preview/` folder (cleared it
  this round before reading).

## Round 5 (2026-10-05) — after Destin's marketplace-detail-4 answers

App commit `50ee98926`; deck `marketplace-detail-5.json` (before `runs/mkd4-after`,
after `runs/mkd5-after`; step M5-1 compares with round 3, `runs/mkd3-after`, as `today`,
because round 4 already showed the picked row layout).

| # | What I did | Driven by |
|---|---|---|
| R5-1 | Integration top card: `row` only; `block` removed from the code, `?integrationAlign=` gone. | M4-1. |
| R5-2 | **No "Installed" pill on themes.** Plugins, skills and connections keep theirs. | M4-2 "remove th installed chip". Applied to themes only: plugin pages' pill was approved (MD-2) and decisions S-1 names "Installed" as the pill that "looks good". On a theme the Apply / Uninstall buttons already say it; "In use" stays because the buttons don't say that. |
| R5-3 | **Every detail page's chip row is one line that scrolls sideways** — no scrollbar, edges fade only on the side with more (the Marketplace rails' treatment, 24px instead of 44px). Native sideways scrolling only: touch swipe, trackpad two-finger, Shift + mouse wheel. A plain vertical wheel is NOT translated. | M4-2 "chips can be scrollable left/right". **This refines decision G-9** ("the chip row never wraps: one line that fades out at its end") → "never wraps; scrolls sideways, fading at the edge that has more". Why no wheel translation: the rails don't do it, and turning vertical wheel into sideways scroll would trap the popup's own scrolling whenever the pointer crossed the row. Cost: a mouse user without Shift can't scroll the chips (said on M5-2). |
| R5-4 | Wrap / facts / fewer drafts and `?themeChips=` removed; the heart/star/share stay on the name's line with word-only name wrapping. | M4-2. |

### Tooling friction this round
- **Correction to round 4:** `preview` renders all three themes when asked
  (`--themes youcoded,youcoded-night,midnight`); without `--themes` it takes only the first two.
  Not a bug, but the default silently skips a theme the deck carries.
- **A deck can't name a third run.** Runs must be `today`, `before` or `after`, so comparing
  with an older round meant borrowing `today` and relabelling it per slide.
- **An approve slide with nothing changed is refused** ("nothing differs … name an element") —
  correct, but the not-installed theme page genuinely didn't change; it needed a hand-placed box
  and a "nothing visible changed" note to stay on the deck Destin asked for.
- **Port 4717 still held** by `ha-pages-connection`'s `scripts/office-workbench-server.mjs`
  (pid checked read-only, ~20 min old, so restarted by that session since round 4). Not stopped.
- **Round 4's one-off full-suite failure did not reproduce**: 5 back-to-back full desktop runs
  (`nice npx vitest run`, logs kept in the session scratchpad), plus verify's own full run —
  6 of 6 green, 16,534 tests each. Without the original log the test cannot be named, so it is
  reported, not fixed. The real gap is that verify discards the failing run's log.
- verify this round: 8 of 9 PASS; `shoot --check` again blocked by the other session's port 4717.
  Substitute: plain `shoot` of every marketplace and library screen, all opened (no look-alikes).

## Closing fix (2026-10-05) — chip clipping (marketplace-detail-5#M5-3)

App commit `36cad47b1`. Cause: a sideways-scrolling box (`overflow-x: auto`) also clips
vertically at its content edge, and at a 1.5× screen scale the chips' 1px bottom border
rounded just outside it. Fix: `py-1 -my-1` on the chip row (room inside the clip, spacing
unchanged). Checked on every detail page kind in YouCoded, YouCoded Night and Midnight and at
phone width, at 1× and `SHOOT_SCALE=1.5`. Guard: a source pin in
`marketplace-detail-shell.test.ts` (seen red without the classes) — jsdom has no layout, so a
geometric guard ("every child's box lies inside its scrolling parent") needs a browser; it
would belong in `shoot` (see proposal 2). **This was the third visual defect that every check
passed** (chip sizes R2, broken heart R2, clipped border R5); my own 1× screenshot review missed
it too — it only shows at Destin's 1.5× scale.

## Proposed guide and tooling changes (most valuable first — not implemented)

1. **Shoot at Destin's scale by default** — `scripts/shoot/engine.mjs`: make `SHOOT_SCALE=1.5`
   the default for review shots (keep 1× for `--check`). Why: the chip clipping (R5) is invisible
   at 1× and was found only by Destin; every review picture I read was 1×.
2. **A "parts agree" pass in shoot** — `scripts/shoot/shoot.mjs` page script: for every marked
   chip row / button row (`[data-detail-chips]`, `[data-detail-actions]`, future `data-row`), flag
   siblings whose heights differ by >1px and children whose box leaves a clipping parent. Why:
   catches the R2 chip-size mismatch and the R5 clipping in one check; nothing in verify compares
   siblings or clip bounds today.
3. **verify keeps every check's full log** — `scripts/verify.sh`: write each check's output to a
   file and print its path on FAIL. Why: R4's one-off full-suite failure could not be named; 6
   later runs were green, so the flake (if any) is unidentifiable.
4. **`shoot --check` must not depend on another session's port** — `scripts/shoot/office-editor.mjs`:
   per-worktree port, or skip only the Office screens with a warning. Why: the check was blocked
   for three rounds (R4–R5, closing) by `ha-pages-connection`'s editor on fixed port 4717, so
   verify could never be fully green.
5. **Guide: a "detail page" recipe** — `guide-draft.md` (Recipes): popup titled by kind, the
   subject's top card (exempt from "a label first"), two columns (reading left / facts right),
   one-row icon alignment (tile | title + hint | buttons, as the setting row), picture-of-the-item
   cards unlabelled. Why: R1 had to infer all of this from Session details / Account; four of
   Destin's five rounds corrected arrangement, not pieces.
6. **Guide: G-9 rewritten** — `guide-draft.md` "Cards": "the chip row never wraps; it scrolls
   sideways, fading at the edge with more; vertical room inside the clip". And name the ONE chip
   piece (`MetaChip`, or move it to `components/ui/`) — the app has two chip recipes (`Badge`,
   `TrustBadges.BADGE`) that differ by line height. Why: R2 (sizes), R4–R5 (wrap → scroll).
7. **Guide: resolve the button-rule conflicts** — `guide-draft.md` "Buttons": (a) "one button full
   width" applies to a lone MAIN action (BP-3's own words); (b) "text and buttons on one line" wins
   over full width when they fit; (c) "narrow" means the space the buttons sit in (a 250px column
   counts), not only popup width. Why: R1 #11, R3 R3-5, R2 R2-2.
8. **An icon sheet and a shared icon set** — new `shoot` screen rendering every hand-drawn SVG at
   48px; longer term a shared icon module. Why: the malformed heart (R2) passed every check and my
   review at 12px; "use the app's heart" was impossible because there is no icon set.
9. **Deck builder improvements** — `scripts/ui-review/deck/`: (a) a `region` crop on a shoot screen
   name (R3/R4 needed hand-cut close-ups); (b) any number of named runs, not just
   today/before/after (R5); (c) `preview` defaults to all the deck's themes and writes into a
   per-deck folder, not the shared `preview/` (R3 stale pages, R4 missing theme); (d) a
   "whole page changed — box the panel" highlight that doesn't warn (R1). (The app-theme token
   fix was made in R1.)
10. **Workbench fixtures for the hidden states** — `dev/workbench/mock-shim.ts`: switches for an
   install that fails, one that is slow, an update available and a theme already liked. Why: those
   states were never photographed in five rounds; the install-failed notice (R1) and
   filled-when-liked (R3) were shipped/asked unseen.
11. **A written recipe for "N designs of one real screen"** — `scripts/shoot/README.md`: the
   `workbench-mode.ts` switch + screen `params` pattern, and that LOOK-ALIKE can fire on genuinely
   different small variants (R3 needed a `sameAs` that misdescribes two screens); a finer
   look-alike comparison of the marked panel would avoid that.

## Proposals implemented (2026-10-05, approved by Destin)

All 11 done (app `49554ec96`, workspace commit beside this note); 7(a) in Destin's words — "any lone
button is full width, unless it fits on one line beside its text".

- **Correction (proposal 3):** verify.sh already kept FAILED checks' logs in `scratch/verify-*` and
  printed the folder once after the summary; I missed it in rounds 4–5 because I filtered its output to
  the PASS/FAIL lines. It now keeps every check's log and names the file on the FAIL line itself.
- **First run of "parts agree" across every screen** found: (1) the Marketplace detail pages' filled and
  outlined buttons differ by 2px (fixed on the detail pages; the same difference exists wherever the app
  pairs the two — a Button-primitive change left for Destin); (2) on every phone-width Marketplace card
  the safety chip is 18px beside a 22.5px author/source chip (not fixed; card rows left unmarked until it
  is). It also catches the M5-3 clipping at 1× (seen red with the fix removed).
- **First icon sheet:** no malformed drawing found among the ~150 exported icons; inline icons are not
  on it.
- **Practice states, first look:** the install-failed notice (and its reason) disappears by itself
  after about 6 seconds — the app clears install errors on a timer — leaving a plain Install button
  with no explanation.
