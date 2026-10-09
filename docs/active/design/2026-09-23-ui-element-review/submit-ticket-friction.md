---
status: active
date: 2026-10-07
related: redesign-backlog.md row 13, submit-ticket-1.json, docs/roadmap/other-features.md (misc)
---

# Submit a ticket — where the guide helped, and where it didn't

First drafts of the redesigned "Submit a ticket" flow (Settings → Help & feedback → Report a
bug, review step included), built only from `guide-draft.md`, `decisions.md`, the backlog and
the workspace tooling. Deck: `submit-ticket-1.json` (before `runs/st-before`, after
`runs/st-after`; YouCoded, YouCoded Night, Midnight). Code: `ReportDesign.tsx`,
`ticket-practice.ts` (practice switches), screen states in `screens/settings.ts`.

References opened first (guide "How to use" step 2): **Marketplace → Plugin details** (a top
card about the subject, then labelled cards), **Session details** (the subject as read text in
a card, with its pill), **Settings → Account, signed out** (one sentence and its button inside
one card), **Backup & sync** (a problem notice with its own Show details / Try again inside,
at the right). Destin's earlier verdicts: `rest-sweep#RS-1` (the regrouping he approved, with
"some of the ux is still a bit odd"), `surface-levels#SL-12` ("grouped/arranged/displayed
differently. it just looks off"), and the signed 2026-09-10 contract rows R11–R23
(`docs/archive/design/2026-09-08-error-states-development/`).

## The flow today, step by step — and what is odd

Practice states shot for every step (`settings/development/bug-report#…`, 23 states).

| Step | What it shows | What is odd (guide rule) |
|---|---|---|
| Draft | "Your ticket" card: a tiny public-ticket line, then the Bug/Feature switch, Title, Description. "Include with ticket" card: three tick rows. A loose grey "Add a title and a description to carry on." and a full-width Review ticket. | 1. The first thing in the card is an 11px notice, above the choice that shapes the rest. 2. The reason line floats bare between the card and the button ("Text that describes a card lives inside it"). 3. Ticking "Screenshots or files" drops a grey notice OUTSIDE the card, between it and the button ("a notice about one thing sits inside that thing"). |
| Review | "Review your ticket": the SAME two editable boxes again (Bug/Feature gone); then bare "Error details and version" + a code line, bare "Recent logs" + a bare sentence + a log box, all on the popup; "Optional AI help" fold whose opened text and buttons sit bare too; Submit and Back stacked full width. | 4. Nothing reads as a review — it is the draft again, minus the one choice you can't see any more. 5. Three groups sit bare on the popup ("Nothing sits bare"). 6. The pieces have no shared shape (label/code/notice/textbox). 7. Two buttons stacked full width in a 600px popup (guide: side by side, filled right — the older R21 signed the stack). 8. AI help: two wide outlined buttons plus an 11px caption under only the second. |
| Sending | A spinner line alone in the middle of a shrunken popup. | 9. Centred status line, bare. |
| Sent / Finish in GitHub / Assistant on it | Two sentences and stacked buttons, bare. In "Finish in GitHub" the FILLED Done is under the outlined Open it again. | 10. Bare text; 11. order flips between the two screens. |
| Failed | A grey ErrorState box ABOVE the label, bold "Your ticket wasn't sent", a centred Retry; the Submit button vanishes from the bottom. | 12. Not the notice box; a centred button; the problem sits far from where you pressed. |
| Offline | The same, reading "getaddrinfo ENOTFOUND api.github.com". | 13. Machine words for "no network". |
| Hand-over failed | Headed "Your ticket wasn't sent" — no ticket was being sent — and its Retry SENT the ticket. | 14. A real bug: wrong words, wrong action. |
| From an error | Should start "This happened in Office."; Diagnose should open on review with AI help open. Neither happens. | 15. A real bug: every caller keeps the popup mounted, so the seed ran at mount, before any error. |

Not odd in the guide's terms but worth Destin's eye: the tick rows keep their checkbox at the
right beside an (i) — two small controls side by side (R18 signed that shape).

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | Draft: Bug/Feature first in the card; the public line moves to the card's foot and carries the "Add a title…" reason when the button is grey. | Odd 1, 2; guide "Text that describes a card lives inside it". **Guide silent** on where a "this will be public" disclosure goes. |
| 2 | Files notice inside the Include card, under its row. | Guide "Status and notices" (inside the thing it is about). |
| 3 | Review = a read-only "Your ticket" card (title + Bug/Feature `Pill`, description, "This ticket will be public on GitHub.") and a "Sent with it" card holding every attached piece; "Nothing else — only your title and description." when nothing is ticked. Edit only through Back to draft. | Odd 4–6; references Session details and Plugin details. **Behaviour-visible change:** the boxes are no longer editable on review (the logs box still is). |
| 4 | Three drafts of the review behind `?ticketReview=` (cards shipped / folded / onepage) → Choice ST-C1. | Brief: "how the review step presents what will be sent". `onepage` also tests "one page vs steps"; it puts AI help on the draft, against R17 — said on the slide. |
| 5 | AI help: a fold row; opened, one card with the disclaimer and two setting rows (what it does + a small outlined Rewrite / Start). Buttons keep their old names for screen readers. | Odd 8; guide "Text and buttons in one box"; R17 kept. |
| 6 | Footer: side by side at the right, Submit on the right; stacked full width (Submit on top) at phone width. Submit is disabled when the title or description is empty (Diagnose can open review with an empty draft). | Odd 7; guide "Buttons" (BP-1, BW-2). **Reopens signed R21** → ST-4. The disable is new and small (GitHub refuses an empty title anyway). |
| 7 | A failed send REPLACES the footer with the danger notice: GitHub's own words + "Your draft is still here.", Back to draft and Try again inside, no title. | Odd 12; guide "A problem replaces the card it is about", "no red titles". `ErrorState` is no longer used here (CLAUDE.md still names it; the guide's notice rule is newer). |
| 8 | No network: amber notice in plain words, ONLY when the computer reports no network (`useNetworkOnline`, Games' rule). | Odd 13; error-message standards. |
| 9 | Hand-over failures are told apart (`errorFrom`): their own sentence, and Try again retries the setup. | Odd 14 — bug fix, pinned. |
| 10 | Context applies when it arrives (effect), never overwriting typed words. | Odd 15 — bug fix, pinned; seen red first. |
| 11 | Outcomes (sending, sent, finish in GitHub, setting up, on it) are one card each, no label (single-card popup); two buttons share the width, filled on the right. | Odd 9–11; Account's sign-in card. |
| 12 | Marked `data-parts-agree` on the button pairs and `data-centres-agree` on the title + pill row. No findings. | Tooling. |

Nothing invented to my knowledge. One thing I first drew and removed: a thin vertical line to
the left of what a tick adds on the one-page draft — no recipe has it.

**What gets sent is unchanged.** Same fields, same evidence, same browser route for files. One
discrepancy found and asked, not changed (ST-Q1): the main process always appends
"Environment: YouCoded vX · desktop · <OS release>" to bug AND feature tickets
(`dev-tools.ts buildIssueBody`), even with "Error details and version" unticked, and nothing on
screen shows that line. Also seen: a bug ticket with logs unticked still carries an empty
"Logs" fold in its body.

## Tooling — did the latest tooling help?

| Tool | Verdict |
|---|---|
| Open-first steps with typing and ticking | **The big win.** Every state of a multi-step form (typed, ticked, reviewed, sent, failed, offline, handed over) with no switch in production code — 23 states from one list. |
| Practice switches (`ticket=hold`, `network=offline`, `refused`, `reportFrom=error`) | Easy to add in the mock; `hold` is the only way to photograph a state that lasts 0 ms. |
| Shooting the states was itself a review | It found two real bugs (15 and 14) that the 53 unit tests missed — both looked fine in tests because the tests render with the context from the start. |
| `waitMs` | Worked for "Your assistant is on it" (setup takes 2.5 s). |
| 1.5× shots, region crops, `"new": true`, per-deck preview | Worked. |
| Parts / centres agree | Marked; quiet. Cheap to add. |
| "Several designs of one screen" recipe | Worked; switch kept in its own file (`ticket-practice.ts`) so commits by path can't sweep another session's edits in `workbench-mode.ts`. |

## New friction

1. **A tall popup can't be a good before/after slide.** The ticket popup is ~740px tall; both
   pictures stack and only the top of "Today" is on screen until you scroll (ST-1…ST-3,
   ST-13). Cropping shorter hides the very change. The deck needs a side-by-side mode for tall
   crops (shrink to fit both), or a zoom-to-fit default.
2. **`highlight: "panel"` is refused on a close-up**, while every outcome slide warns
   "whole-surface change, name an element instead". The warning's advice and the refusal
   contradict each other; for a close-up of one popup "the panel" is exactly the element.
3. **One picture times out only under load**: `#small · youcoded` failed twice in the full
   72-picture run ("Runtime.evaluate timed out after 20s") and passes alone. Because a reshoot
   into the same `--out` rewrites the manifest (project-switcher round 2), the only fix is
   reshooting all 72. That state is left out of the deck.
4. **Open-first steps take the label at the time of shooting**, so a before run must be shot
   BEFORE the labels change; I added the states and shot "before" first. Worth one line in
   the README's "Several designs" recipe.
5. **The signed older contract (R17–R23) is not linked from the guide or MAP's design rows**;
   I found it only through test names (`R21:` in `report-screen-shape.test.tsx`). A redesign
   that reverses a signed row needs to know it exists before drawing.

## Left undone / unsure

- Android: shared React UI, no IPC change; not built or run here.
- Contribute screen untouched.
- The tick rows' (i) + checkbox pairing kept (R18).
- `#small · youcoded` picture not taken (friction 3); `#small-review` is in every theme.
- No UX-tester / code-reviewer run (short route; ask Destin).

## Round 2 (2026-10-07) — after Destin's submit-ticket-1 answers

Deck `submit-ticket-2.json` (before = round 1 `runs/st-after`, after `runs/st2-after`).
Approved and recorded in decisions.md: read-only review (ST-2), folded rows (ST-C1), side-by-side
buttons reversing R21 (ST-4), failure notice (ST-5/6), sending card (ST-10), phone (ST-14),
version always sent (ST-Q1 "show").

| # | What I did | Driven by |
|---|---|---|
| R2-1 | Include choices explain themselves in a plain hint; the (i) buttons are gone (reverses signed R18). Three looks behind `?ticketTicks=` (rows shipped / switches / left) → ST2-C1. | ST-1 "the checkbox ux is still odd", ST-13. **Guide silent** on how a set of "include this" tick choices looks — Settings rows are for settings, ConsentRow for consent. |
| R2-2 | Version dropped from the tick box: "The error you saw" shows only when opened from an error, says what it adds, and sends where + the error. Description never pre-filled. The review lists "App version and system — always sent". | ST-13, ST-Q1. **Data change, both asked for:** the description no longer carries a duplicate version line (the main process's Environment line still sends it); the place-it-happened line moved from the description into the error details, sent only while ticked; the hand-over prompt now carries the error details. |
| R2-3 | `FoldCard` (local): a folded box whose content opens inside it; AI help and the review's folded rows use it. Guide rule added ("A folded box opens inside itself") — **guide-draft.md edited, the other helper's file.** | ST-3. The shared `FoldRow` opens BELOW its box; About (Privacy ×4, Licenses ×1), Performance, Backup & sync's Sync log and the status bar's Theme cycle use it — asked as ST2-Q1, not changed. |
| R2-4 | Outcomes keep the ticket card on screen with a status pill (Submitted / Finish in GitHub / Not sent) and one line at its foot; the buttons stay where Submit was, in the approved pair. "Assistant started" gains Submit public ticket. | ST-8/ST-9 "a better happy medium", ST-12 "looks weird". The middle: neither bare text nor a separate card — the card he already approved, re-tagged. |
| R2-5 | Hand-over in plain words: "Downloads YouCoded's code to this computer and starts a new conversation that works on it"; "Downloading YouCoded's code for your assistant"; "couldn't be downloaded, so your assistant didn't start". | ST-7, ST-11 ("what does that even mean"). "Working copy" was developer language that slipped past round 1. |

### Tooling friction this round
1. **A JSX `aria-label` on a component that doesn't take one type-checks and vanishes.**
   Hyphenated props are never checked in TSX, so `ConsentRow aria-label=…` compiled and did
   nothing. Caught only by reading the props.
2. **A row's accessible name is title + hint**, so adding a hint to a fold header renamed it
   ("Optional AI help Your assistant can…") and broke every test and open-first step that
   clicks it by name. Open-first steps need the full joined name ("Recent logs 4 lines — open
   to read…"). A `{ role, label: /^Recent logs/ }` prefix match would make both sturdier.
3. **A `waitMs` state's panel box is measured before the wait**, so the manifest records the
   pre-wait (spinner) size; the deck's crop boxes had to be read off the pictures instead.
4. **shoot's load fix landed between rounds** (42e3377f): 75/75 pictures, no timeouts, at a
   load average near 50. Round 1's friction 3 is gone.
5. **The pointer stays where the last open step clicked**, so the clicked fold header shows its
   hover tint in the picture — reads like a selected state.

## Round 3 (2026-10-07) — after Destin's submit-ticket-2 answers

Deck `submit-ticket-3.json` (ticket: Round 2 `runs/st2-after` vs `runs/st3-after`; folds: `runs/fold-before`
/ `runs/fold-sync-before` vs `runs/st3-after` / `runs/fold-sync-after`).

| # | What I did | Driven by |
|---|---|---|
| R3-1 | Switches only (the `?ticketTicks=` switch and the two losing looks deleted). | ST2-C1 "switches". |
| R3-2 | Sending: only a "Sending your ticket…" box under the "Your ticket" label; replaced by the tagged ticket when done. | ST2-10 note. |
| R3-3 | "Open in browser". Destin wrote "Open in Browser"; decisions "Sentence case everywhere" makes it a small b — said on the slide. | ST2-6. |
| R3-4 | **The shared `FoldRow` now opens inside its own box** (the box wraps a box-less header row + content); `FoldCard` deleted; new `tests/FoldRow.test.tsx`, seen red against the old FoldRow. | ST2-Q1 "all". |
| R3-5 | The "Submitted" tag: checked — it is the guide's status pill (green tint and border, words in the normal text colour), same as Installed/Online. On light lavender the 15% green tint reads nearly grey; left as the shared pill (a Pill-wide question, not this screen's). | Coordinator check. |
| R3-6 | The code download, answered from the code (below) and asked as ST3-Q1 with both pictures. | ST2-7 "when would a user encounter this screen?", ST2-9. |

### When the "Downloading YouCoded's code" screen appears (evidence)
- Only path: Review ticket → Optional AI help → "Let your assistant try to fix it" → Start
  (`ReportDesign.tsx` `handOver`). Contribute's "Set up development workspace" runs the same download.
- It downloads unless the app is holding a "ready" answer from earlier: `handOver` asks
  `setupStatus()`, which is `setupStatusState` — a variable in the main process's memory
  (`dev-tools.ts` `workspaceSetupStatus`). Nothing records it on disk.
- So it downloads again after **every app restart**, and after Contribute's screen clears the
  status (`clearWorkspaceSetupStatus`). Each run clones into a NEW folder — `freeWorkspacePath`
  "Never reuses one" (`~/YouCoded/Development/youcoded-workspace`, `-2`, … up to 100) — then runs
  `setup.sh`, which the code itself sizes at about 1 GB with five nested repositories.
- The screen's "This can take a few minutes the first time" is therefore wrong after a restart.

### Repo-wide search for folds (the "every affected place" list)
- `rg -n "<FoldRow"` → 9 call sites in 4 files, all changed by the root fix: AboutPopup ×6
  (Your account, Friends & presence, Anonymous usage stats, Remote access and games / Setup
  downloads on Android, Open-source libraries), PerformancePopup ×1 (mapped over 3 sections),
  SyncPanel ×1 (Sync log), StatusBar ×1 (Theme cycle). All on submit-ticket-3 except Friends &
  presence, Remote access and Setup downloads (same look as the two Privacy rows shown).
- `FirstRunView.tsx` imports FoldRow but never renders it.
- **Hand-built folds NOT using FoldRow** (a `SettingRow expanded` header with content opening
  below — likely the same mistake; not inspected one by one, not changed): ContributionWalkthrough
  ("How contributing works"), SessionContextPopup ×2, LookSettings ×2 (Fine-tune, Additional
  customizations), EngineCard (advanced), LocalModelsSection ×3, LocalModelSetup (first run),
  GitReviewView ×2, SubagentTimeline, RuntimeBinding (memory detail). Found by
  `rg -n "expanded=\{"` over `src/renderer`; tool cards and chat bubbles with their own chevrons
  are outside the guide.

### Tooling friction this round
1. **A zsh variable holding several screen names is ONE argument** — `shoot $F` silently shot
   nothing and printed nothing (no "unknown screen", no count). shoot should refuse an argument
   containing a space, or print "0 pictures".
2. **"Before" for a primitive change needs the old primitive**: I swapped the file to HEAD, shot,
   and swapped back. `shoot --before` wants a whole worktree; a `--before-file <path>@<ref>`
   override would make one-file before/afters cheap.
3. **Open-first steps that must reach the bottom of a dialog** need scroll, click, scroll again
   (Sync log opened off-screen the first time).
4. **A decide slide accepts today/problem/proposal** — not in AUTHORING.md's decide table.
5. A practice log stamped with the clock makes every before/after of it "changed" (Sync log).

## Round 4 (2026-10-08) — after Destin's submit-ticket-3 answers

Deck `submit-ticket-4.json` (hover: `runs/hover-before` vs `runs/hover-after`, shot at 1×;
Contribute: `runs/contribute-before` vs `runs/st4-after`).

| # | What I did | Driven by |
|---|---|---|
| R4-1 | FoldRow: the header row carries the padding and the box's corners (rounded all round closed, top when open), so its pointer highlight fills the box. Pinned in `tests/FoldRow.test.tsx` (seen red on round 3's FoldRow). Every FoldRow user changes with it. | ST3-5 note. |
| R4-2 | The ticket's "Let your assistant try to fix it" opens Contribute (its own popup, the ticket steps aside), titled "Let your assistant try to fix it", the ticket's words and error details carried in the conversation's first message; "Back to ticket" returns. The ticket's waiting/failed download screens are deleted. | ST3-Q1 "contribute". |
| R4-3 | Contribute reworded for both arrivals: what it does, "about 1 GB, the first time", "your app and files don't change", what opens next. "Development workspace", "set up", "separate project" and "working copy" are gone. From a ticket, "Download and start" starts the conversation when the download finishes. "How contributing works" moved onto the shared FoldRow. | ST3-Q1 note. **Guide silent** on a short bullet list of facts inside a card — I used one. |
| R4-4 | The repeat download fixed in `dev-tools.ts`: `findManagedWorkspace` looks for the first FINISHED copy (`.git`, `setup.sh`, `youcoded/desktop/package.json`) under `~/YouCoded/Development`, async; setup reuses it and the status reports it ready after a restart. Never moves, deletes or edits a copy; a half-made copy is skipped and left alone; a reused copy is not re-added to the project list. 3 tests, seen red without the fix. | ST3-Q1. **Android:** no managed setup there (`dev:setup-workspace` is refused over the bridge; the legacy Android `dev:install-workspace` uses one fixed `$HOME/youcoded-dev` and has no screen calling it), so no repeat-download path. |

### Tooling friction this round
1. **A one-file "before" again needed swapping three files by hand** (FoldRow, ContributionDesign,
   ContributionWalkthrough) and putting them back — round 3 proposal "`--before-file`" would have
   covered it.
2. **Hover pictures need `SHOOT_SCALE=1`** (the 1.5× pointer is still off, project-switcher round
   3); the screen list can only say so in a comment.
3. **A dialog that hands over to another dialog can't keep its own screen mark**: Contribute
   opened from the ticket had to carry the ticket's mark (`screen` prop) to be photographed as a
   ticket state.
4. **The highlight change is subtle at 15% tint** — the before/after differ by a thin strip of
   pixels; a pointer-state slide would read better as a zoomed close-up.

## Round 5 (2026-10-08) — after Destin's submit-ticket-4 answers; building the proposals

Deck `submit-ticket-5.json`. Hover pictures at 1× (`runs/r5-before-1x`/`r5-after-1x`), the rest at
1.5× (`runs/r5-before`/`r5-after`, `r5-ms-*` for Local models).

| # | What I did | Driven by |
|---|---|---|
| R5-1 | The shared fold lights its WHOLE box while its header is pointed at (`has-[>button:hover]` on the box); a clickable header row (`SettingRow header`) takes no tint of its own. Guard rewritten in `tests/FoldRow.test.tsx`, red on round 4's fold. | ST4-2 note. |
| R5-2 | **Sweep for the same hard edge** (`rg "aria-expanded"` + `hover:bg-` over `src/renderer/components`, then by eye): Permissions folder cards (fixed — the card lights, header untinted), Session context skills (fixed by moving onto FoldRow; also lost a divider line), the new-session memory warning (fixed, FoldRow), Git review commit cards (`GitReviewCard.tsx`, own component, header `hover:bg-inset` edge to edge — not fixed, asked ST5-Q2), Open tasks' "Inactive" heading (a full-width `border-t` line — not fixed, asked ST5-Q2). RepoCard (model cards) has no header tint — fine. Tool cards / chat bubbles / SubagentTimeline: outside the guide ("Not covered yet"). | ST4-2 "check other screens/menus". |
| R5-3 | **Hand-built folds moved onto FoldRow:** Session context (rules ExpandRow + skill cards; `DetailCardCollapsible` deleted), Appearance (Additional customizations, Fine-tune glass), Local engine Advanced, a model's Advanced, the memory warning (RuntimeBinding). FoldRow gained `flush` for content with its own padding. Not moved: RepoCard ×3 (already contains its content, no tint), GitReviewCard ×2 (asked), SubagentTimeline (tool view, exempt). With round 4's walkthrough that is all 14 accounted for. | Proposal 1. |
| R5-4 | **Tag tints measured** on all 14 themes (`dev/pills` sheet, pixel ΔE fill vs surface, table in `status-tag-tints.txt`): green 8.4–18 (reads grey on pale themes), neutral in a card 2.5–8.7 (under 5 on Light, Dark, Midnight, Crème, Devil's Garden, Morning Rounds, YouCoded Night). Proposed stronger tints behind `?pillTint=strong` (`pill-practice.ts`), not shipped: lowest green 26.9, neutral 5.9. ST5-10. **Left alone** (Destin 2026-10-08, decisions "Status tags"). | Proposal 9. |
| R5-5 | Guide: "a review before sending" recipe; "when an action finishes, keep its subject"; "a failed action replaces its buttons"; "choosing what goes with something"; "say what happens on the user's computer"; the fold highlight rule; one checklist line. | Proposals 2–7. |
| R5-6 | MAP's Help & feedback row links the signed 2026-09-08 contract and says R18/R21 were replaced. | Proposal 22. |
| R5-7 | Contribute's two failures are the notice box in place of the buttons, inside the card, with Try again (Back to ticket when from a ticket); `ErrorState` no longer used there. 2 guards, red on round 4. | Coordinator item 6. |
| R5-8 | List in a card: asked as ST5-Q1, no rule written. | Proposal 8. |

### Not pictured
- **The memory warning** (new-session form, a local model too big): no practice screen reaches
  it (it needs the local provider and a 14B model chosen in the form). Covered by its tests only.
- **Git review cards and Open tasks' line**: no practice screen (no git repo; Open tasks is empty
  in the practice app).

### Tooling friction this round
1. **Measuring a colour needed a purpose-built sheet** (`dev/pills`, fixed positions, 1×) and a
   throwaway pixel script; there is no "sample these points across themes" in shoot.
2. **`--themes all` is only six themes** — YouCoded, YouCoded Night and six community themes were
   missing; I listed all 14 by hand.
3. **A decide slide with a two-picture composite squeezes its text** into three thin columns and
   pushes the options below the fold; and its percent `box` had to be found by trial (three tries).
4. **A fold that is already open on a screen can't be "opened" by an open step** — the click closes
   it (model settings); the screen list has no way to say "already open".

## Round 6 (2026-10-08) — after Destin's submit-ticket-5 answers

Deck `submit-ticket-6.json`. Before pictures made with the new `shoot --before-file` (no file
swapping by hand): `runs/r6`, `r6-git`, `r6-tasks`; after-only `r6-extra`.

| # | What I did | Driven by |
|---|---|---|
| R6-1 | **`Slider`** (`components/ui/Slider.tsx`): a real range input over the drawing (keyboard, screen readers, touch for free), its thumb sized to the drawn handle so a press lands on it; the fill ends half a track past the handle's centre so its round end wraps the handle. Used for Volume and the seven glass sliders — every slider in the app (search: `type="range"` in `src/renderer`). Guard: `primitive-adoption.test.ts` fails on a hand-made range input; `tests/Slider.test.tsx`. Not changed: the **Pages kit's `.yc-range`** (plain HTML in users' Pages) — asked as ST6-Q1. Guide: Settings → slider rule. | ST5-5 note. |
| R6-2 | Contribute's failures in plain words, the raw reason behind a **Details** fold; "no network" only when the computer reports none. The practice errors are now real-world ones (`spawn claude ENOENT` through Electron's IPC wrapper; git's own exit-128 output) via `?devOpen=fail` and the `refused` scenario. **The real app had the same problem**: both failures put `plainMessage(e)` — the operation's own text — into the message; fixed by the same change. | ST5-9. |
| R6-3 | Git review commit cards light as one box (`GitReviewCard`); practice state `chat/files/open/a-launch-brief#git-review` (marked by the drawer's own `chat/files`). Open tasks' two folded sections are the shared FoldRow; practice screen `dev/open-tasks` mounts the real popup over fixed tasks (`OpenTasksPractice.tsx`). Guards in their own test files, seen red. | ST5-Q2 "yes". |
| R6-4 | Guide: lists in a card allowed. | ST5-Q1 "allow". |
| R6-5 | The ticket and Contribute read the network flag once at the failure (`networkOnlineNow`) instead of keeping window listeners on while closed (performance rule 2). | Found while editing. |
| R6-6 | The stale "shoot hover at 1×" notes in the screen list removed (fixed at the root 2026-10-06, a394a871). | Coordinator. |

Seen while there, not changed: Open tasks shows the running task in **blue italic text** — a status
hue in text, against the guide.

### Tooling friction this round
1. **`--before-file` worked first time** and replaced the hand swap. One limit: the before side gets
   ONLY the named files at HEAD, so a screen state added this round must work on both — fine here.
2. **A named `mark` is checked BEFORE the open steps** (`shoot.mjs` initial mark check uses
   `markOf(screen)`), so a mark that only appears after the steps (Git review) can't be named;
   I used the drawer's always-present mark instead. Proposal below.
3. **A hover that changes nothing visible on one theme blocks the build** ("nothing differs … in
   youcoded-night"); `highlight: "panel"` (new) got it through.
4. Live slides work in a picture deck, and the build reuses the photo-only copy.

## Proposals implemented

The tooling helper built items 10–21 of the round-4 list (workspace `2be2dcf3`, app `b25fea743`):

| # | Proposal | Done as |
|---|---|---|
| 10 | Deck: fit two tall pictures side by side | Tall pairs stay side by side, shrunk to fit (deck-render test). |
| 11 | Deck: `"panel"` on a close-up | Works on a close-up; the whole-surface warning points at it. |
| 12 | shoot: one-file before | `--before-file <path>@<ref>` (`before-file.mjs`, tests). |
| 13 | shoot: per-screen scale / 1.5× pointer | The 1.5× pointer offset was fixed at the root on 2026-10-06 (a394a871); re-checked on the fold hovers. |
| 14 | shoot: pointer off the page before the picture | Done after open steps that end on a click. |
| 15 | shoot/journeys: match by the start of a name | `labelStarts`, or a label ending in "…". |
| 16 | shoot: measure a `waitMs` screen after the wait | Done. |
| 17 | shoot: refuse an argument with a space | Refused before any build. |
| 18 | shoot: a state names its mark | `mark` on a screen entry (checked before the steps — see round 6 friction 2). |
| 19 | Guard `aria-*` a component drops | `tests/aria-props.test.ts` (type checker per call site). |
| 20 | Deck guide: today/problem/proposal on decide slides | The build keeps them; AUTHORING says so. |
| 21 | Workbench: fixed clock for practice logs | `PRACTICE_LOG_CLOCK` in the mock. |

Also implemented by me (rounds 3–6): the shared fold opens inside its box (R3); the code download
is reused (R4); every hand-built fold moved (R5); guide rules 2–8 (R5–R6); the MAP link (R5).

## Proposed guide and tooling changes (most valuable first — not implemented)

1. **Guide: "a review before sending" recipe** — the item as read text in a top card (with its
   kind pill), then one "Sent with it" card listing every attached piece; edits go back a step.
   (Decisions 3–4; references Session details, Plugin details.)
2. **Guide: an action's failure replaces its buttons** — a failed send is the notice box where
   the buttons were, with Back and Try again inside it. Generalises "A problem replaces the
   card it is about" to a footer.
3. **Guide: where "this will be public" goes** — the card's foot, joined by the reason the main
   button is grey.
4. **Deck: fit two tall crops side by side** (friction 1).
5. **Deck: allow `"panel"` on a close-up of one screen**, or stop warning (friction 2).
6. **shoot: merge, don't replace, a run's manifest on a partial reshoot** (again; friction 3).
7. **MAP: link the 2026-09-08 ticket contract from the Help & feedback row** (friction 5).

Added after round 2 (ranked into the list above by value):
- **(now #1) FoldRow opens inside its box** — make the shared `FoldRow` render its content inside
  its own box (the `FoldCard` shape in `ReportDesign.tsx`), so About, Performance, Backup & sync
  and the status bar follow the new guide rule in one change; then delete `FoldCard`. Pending
  ST2-Q1.
- **(#3) Guide: "include this with it" choices** — a recipe for opt-in attachments (rows that
  explain themselves; whichever look ST2-C1 picks), and "a choice that doesn't apply isn't shown".
- **(#4) Guide: plain words for developer actions** — name what happens to the user's computer
  ("downloads YouCoded's code"), never the mechanism ("a working copy"); add to the checklist.
- **(#6) Guide: an outcome keeps its subject** — after an action finishes, keep the card it acted
  on, tag it with a status pill, and keep the buttons where the action's were.
- **shoot / journeys: match a control by label prefix** (`label: /^…/`) for open-first steps.
- **shoot: measure a `waitMs` screen's panel after the wait.**
- **shoot: move the pointer off the page before the picture** when the last open step clicked.
- **TSX: an ast-grep rule (or wrapper type) flagging `aria-*` on a component whose props don't
  accept it.**

Added after round 3:
- **(#2) Hand-built folds follow the same rule** — move the 14 `SettingRow expanded` folds listed in
  round 3 onto `FoldRow` (or its shape), screen by screen with before/afters.
- **(#5) The code download remembers itself** — whatever ST3-Q1 decides, `workspaceSetupStatus`
  should find an existing `~/YouCoded/Development/youcoded-workspace*` instead of cloning again
  after every restart (also hits Contribute).
- **(#8) Pill: the ok tint is near-invisible on light themes** — measure contrast of every Pill
  tone on every theme (the "Submitted" tag reads grey on YouCoded).
  **Measured (R5-4); not adopted** — Destin, 2026-10-08: "i think we should leave status tags
  alone for now". Tints unchanged; the stronger look stays behind `?pillTint=strong`, unused
  (decisions "Status tags").
- **shoot: refuse an argument with a space in it** (round 3 friction 1).
- **shoot: `--before-file <path>@<ref>`** for one-file before/afters (friction 2).
- **deck AUTHORING: list today/problem/proposal on decide slides** (friction 4).
- **workbench: a fixed clock for practice logs** (friction 5).

Added after round 4:
- **shoot: a screen entry can carry its own scale** (`scale: 1` for hover states).
- **shoot: a screen state may name the mark it expects** when one dialog hands over to another.
- **Guide: a short list of facts inside a card** — allowed or not (Contribute uses three bullets).

Added after round 5:
- **shoot: sample named points across themes** (a `--measure` that writes colours at given
  coordinates per picture) — would have replaced the throwaway pixel script.
- **shoot: `--themes all` means every theme the workbench has** (14, not 6).
- **deck: a decide slide gives its text room** when its picture is a composite; and a `box` can be
  given in the screen's own pixels.
- **Fix the two sweep finds** if Destin says yes on ST5-Q2 (Git review cards, Open tasks line), and
  give them practice states.

Added after round 6:
- **shoot: check a named `mark` after the open steps** (or allow it to appear by then) — a view
  reached only by clicking can't be named today (round 6 friction 2).
- **Open tasks: the running task's blue italic words** — status colour in text; give it the
  guide's look (a dot and a pill).
- **Pages kit slider** if Destin says yes on ST6-Q1.
