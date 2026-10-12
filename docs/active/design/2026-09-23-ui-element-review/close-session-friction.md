---
status: active
date: 2026-10-08
related: redesign-backlog.md row 17, close-session-1.json, decisions.md (Session details / Tags rows)
---

# Close session prompt — where the guide helped, and where it didn't

Round 1 of backlog row 17 ("want to work on this page more as another follow up",
`tags-final#TF-5`), built from `guide-draft.md`, `decisions.md` and the workspace tooling.
Deck: `close-session-1.json` (before `runs/cs-before`, after `runs/cs-after`; Crème — Destin's
theme — YouCoded, YouCoded Night, Meadow Mist). Code: `CloseSessionPrompt.tsx`,
`tags/SessionDetails.tsx` (cards exported), `close-prompt-practice.ts` (`?closeTags=folded`),
states in `screens/chat.ts`.

References opened first (guide "How to use" step 2): **Session details** (status bar → tags;
the same job — a session's name, note, tags and pin — and the approved look,
`tags-final#TF-1`), **Resume → Organize** (the same Session details inside another flow),
**Close window / Quit sessions** (the other "close" confirmation: one action, one choice beside
it), and **Contribute's failures** (a failed read: plain sentence, Try again, raw reason under
Details, `submit-ticket-5#ST5-9`).

## The prompt today — and what is odd

| What it shows | What is odd (guide rule) |
|---|---|
| Title "Close session", the session's name as a grey subtitle. | 1. Session details and the detail pages put the subject's name in the top card, not the header. |
| A summary box (tag glyph, pin, chips; page glyph, "No note", pencil) that is a button; clicking swaps it for a second form. | 2. The older editor (search first, every tag in one cloud, a Note box, a Pin card, a "Save" button that saves nothing) — the last surface not on Session details' Tags card. 3. The summary box is an inset box on the popup, not a first-level card. 4. A hidden mode: "Save" closes the form but writes nothing. |
| "Mark complete" in its own boxed row with a check icon. | 5. Hand-styled box (`border-edge-dim !bg-inset`), not the card level. |
| With the editor open, Mark complete and Save drop below the scroll. | 6. The one question the popup exists for is out of sight while tagging. |
| A failed read: one small grey line on the popup, the raw error in it ("Mock failure (session.getMeta)"). | 7. Bare text on the popup; machine words; no Try again (guide: a problem replaces the card it is about). |
| Enter anywhere but a text box closes the session. | 8. A real bug: Enter on a focused tag pill, "+ New tag" or a switch closed the session mid-edit; Enter on Close session fired it twice (its click and the window handler). |

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | The prompt is Session details' cards: the name + note card (no label — the card about the popup's subject; click the name to rename, "+ Add a note" / quoted note in place), the Tags card (label "Tags", edited in place), then ONE card holding Pin to top and Mark complete. Dialog width `panel` (420px, Session details' width — still a narrow popup). | Backlog row 17; guide "Detail pages" (name in the top card), "Card levels", "A label comes first" (subject-card exception); decisions "Tags & note → Session details". |
| 2 | Pin to top + Mark complete share one card; Mark complete keeps its check icon so the two rows' words start on one edge. | Guide "Groups keep their card" (both are yes/no facts about the session). **Guide silent** on whether a card of switches needs a label once the Tags card above has one — Session details' approved Pin card has none, so I matched it. |
| 3 | Nothing writes until Close session (local state, delta to the caller, as before). Tag renames/colours and the session rename write at once, as everywhere else. | Kept from today's contract; **guide silent** on a popup whose edits are pending vs saved as you go. |
| 4 | Two looks for the Tags card behind `?closeTags=` (open / folded to one "Tags" row with the tags as its summary, opening inside itself) → choice CS-2. Shipped default: open. | Today's prompt deliberately started collapsed (ten workbench rounds: "a form in front of Close session"); Session details is open. **Guide silent** on how much editing a popup whose main job is an action should show by default — asked, not invented. |
| 5 | Failed read: the name card stays, the notice box (danger) replaces the cards — "Couldn't load this conversation's tags and note, so they can't be changed here. Closing it still works." with Try again; raw reason under a Details fold. Android's "can't be stored here" is an info notice, no button. | Guide "A problem replaces the card it is about"; ST5-9 (raw words behind Details); error standards (recoverable → Try again). |
| 6 | Enter confirms only from outside a control (`button`, `role=button`, `switch`, link, select) and never while the rename popup is open. Pinned; seen red with the guard removed. | Odd 8 — a bug fix. |
| 7 | The scroll band gets the shared see-through fade (`useScrollFade` + `dialog-scroll`); before, a tall tag edit box was cut off hard under the footer. | Guide "When the body scrolls, the content fades at the hidden edge". |
| 8 | App passes the live session name first, so a rename from the prompt shows at once. | Needed by 1. |
| 9 | `TagNoteEditor.tsx` deleted (its last user was this prompt). `TagCloud` / `NoteEditor` stay (workbench compare rounds, a test). | Dead code. |
| 10 | "Don't show again" kept: switch + words bottom-left, Close session filled at the right of the same line. | Guide principle 6 allows a control bottom-left when balanced on its line. **Guide has no recipe** for a "don't ask me again" control; noted, not asked. |

**What gets written is unchanged:** the same flags, tags and note deltas through the same calls.
No IPC change, so nothing to mirror on Android (the shared React UI ships there as is).

## Tooling — did it help?

| Tool | Verdict |
|---|---|
| Open-first steps (`open: ['Edit work']`, `'+ Add a note'` then a typed note) | Worked; every in-place state photographed without a practice switch in the app. |
| Shooting "before" first, with the new states added | Worked (round-1 lesson applied): `cs-before` was shot before any code change. |
| Practice switch in its own file | Worked; commits by path stay clean. |
| `highlight: "panel"` on a close-up | Worked once the warning pointed at it. |
| Choice slide | Worked with single pictures (see friction 3). |
| Tests | The Enter bug was found by reading the handler while moving buttons into the prompt, not by any test or shot. |

## Friction

1. **MAP has no row for the close prompt, Session details or tags.** `rg` over MAP for
   `CloseSessionPrompt`, `SessionDetails`, `TagNoteEditor`, "close prompt" and "close session"
   finds nothing; the only "Session close-out" row is the dev workflow. Found the code by
   searching the renderer.
2. **An open-step label must include aria-hidden text.** "+ Add a note" draws its "+" in an
   `aria-hidden` span, yet the step only matched `'+ Add a note'` — the tool's name for a
   control is not the browser's accessible name. A screen-reader-correct label failed with
   "not on screen".
3. **A choice whose variants are composites stacks them full width**, so the two designs
   can't be seen together; the answer bar covers the second. I fell back to one picture each.
4. **Close-up boxes for a popup that changed size are hand arithmetic.** The before panel is
   340×277 at y312, the after 420×508 at y196; a box covering both had to be worked out from
   two manifests per theme (Crème's panel sits 9px off the others).
5. **Every redesign slide warns "whole-surface change"**, then needs `"highlight": "panel"`
   added by hand — four slides, sixteen warnings. When a slide's crop is a close-up of one
   screen and the change is most of it, "panel" is always the answer.
6. **A before state and its after state can't pair when the way in changed.** Today's editor
   opens with "Edit tags and note" (`#editing`); the new one has no such step (`#tag-edit`
   clicks a tag). An approve slide takes one screen name, so the old editor appears nowhere on
   the deck except as CS-1's "Today".
7. **A popup with its own fixed footer loses the shared fade.** `Dialog` fades only the body it
   owns; a caller with `scrollBody={false}` must wire `useScrollFade` and the class by hand; this
   one simply had a hard cut under its footer. A `footer` slot on Dialog would remove the whole class.
8. **A window-level Enter-to-confirm is a trap** next to in-place editors, with no guard: any
   popup that adds buttons inherits "Enter closes everything".
9. **The preview contact sheet is unreadable** at 24 pages × 4 themes (773px wide); every check
   needed single pages.
10. **`--themes all` is still six themes** (round-5 friction); Crème + the two YouCoded themes +
    Meadow Mist were listed by hand.
11. **Guide gaps met:** a "don't ask again" control; a pending-edits popup vs save-as-you-go;
    how much editing an action popup shows by default; whether an unlabelled switch card is
    allowed after a labelled one (Session details does it, the guide says otherwise).
12. Process: I worked in the existing session worktree as briefed and did not run
    `workspace-start` (the brief gave the paths; another session shares this worktree).

## Not done / unsure

- Android: shared React UI, no IPC change; not built or run here.
- The "Don't show again" footer is unchanged (friction 11).
- The close prompt registers Escape twice (its own `useEscClose` and Dialog's) — harmless
  (the top entry closes it), pre-existing, left alone.
- No UX-tester / code-reviewer run (short route; ask Destin).

## Round 2 (2026-10-09) — after Destin's close-session-1 answers

Deck `close-session-2.json` (before = round 1's code via `shoot --before-file` on
`CloseSessionPrompt.tsx`, `SessionDetails.tsx`, `close-prompt-practice.ts` @HEAD; `runs/cs2`).
Recorded in decisions.md: "Close prompt: Session details' cards", "Close prompt: Tags card".

| # | What I did | Driven by |
|---|---|---|
| R2-1 | "+ Add a note" full width inside the card, the card's own 16px margins both sides (was a small button hung 8px into the left margin). Shared card, so Session details changes too — asked on CS2-4. | CS-1 note. |
| R2-2 | Pin to top and Mark complete out from under "Tags": shipped as one card labelled "In your lists" (both change how this session shows in your lists); "a card each" (Session lists / Resume list) and "inside the session's own card" behind `?closeFlags=`, on choice CS2-2. A test pins that neither switch sits in the Tags group. | CS-1 note; guide "A label comes first" (an unlabelled card under a labelled one reads as filed under it). |
| R2-3 | Session details checked: it has Pin to top alone, in the same unlabelled card under Tags (the same problem); Mark complete is deliberately not there. Not changed — asked as CS2-5 (follow the pick / leave it). | Coordinator: "stay consistent, or say why". |
| R2-4 | The note box is the app's plain text box (the ticket description's and a quick chip's): standard size, full width, upright words, three lines to start, growing as you write. Was a one-line italic pill hung 10px left, so its right edge stopped short. | CS-3 note; compared with `ReportDesign` description, `QuickChips` message, `ProjectHero` description (the source of the hang). |
| R2-5 | The folded Tags variant, its practice switch value and its states deleted. | CS-2 "open". |

### Friction this round
1. **The guide has no rule for the margins of a full-width control inside a card**, and the
   "hang into the margin so the words line up" trick (ProjectHero, copied into Session details)
   is exactly what read as odd: unequal margins on the button and the box.
2. **The guide's input rule is about a box with its own action** (Set, send); nothing says what a
   plain multi-line field looks like (size, italics, starting height). I matched the ticket's.
3. **A shared card means a "close prompt" change is a Session details change** — four surfaces
   at once. Nothing on the deck tooling marks a slide as "this also changes X"; I added a slide.
4. **A three-way choice of tall popups renders each picture about 180px wide** at 1440×900; the
   text is readable only with the deck's zoom.
5. **`--before-file` again saved a hand swap** — three files from HEAD for the before side.
6. **Six full verifies to get one green, after the restart** (load average 36–49, other
   sessions' browsers running). Each run failed a DIFFERENT load-sensitive test; every one
   passed alone. Fixed nine at their cause — fixed waits that a busy machine outruns:
   Welcome back (4 s wait), WebFetch (1 s CPU bound), doc-comments MCP (four 1 s polls),
   office recovery ×2 (a 30 ms sleep before reading the journal), the stall watchdog (250 ms
   and 400 ms windows), tokens-per-second (a 120 ms tool), shell still-running marks (assumed
   `echo` beats 60 ms), and the photo build's 3 s opener wait (`settings/android/tier`).
   **One left unexplained:** `pending-mutation-queue` "a docx move…" got no answer in 5 s once,
   then passed 24 targeted runs (16 concurrent, 8 under 40 busy processes) and the next two
   full runs; no file-watch limit was near. Not changed — no cause to fix.

## Round 3 (2026-10-12) — after Destin's close-session-2 answers

Deck `close-session-3.json` (before = round 2 via `--before-file` on the seven touched files;
`runs/cs3`). Recorded in decisions.md: "Close prompt: note button and note box", "Close prompt:
Pin to top and Mark complete".

| # | What I did | Driven by |
|---|---|---|
| R3-1 | One shared `SessionListsCard` ("In your lists": Pin to top + Mark complete) in `SessionDetails.tsx`, used by Session details and the close prompt; the close prompt's own copies and the `?closeFlags=` switch, its states and `close-prompt-practice.ts` deleted. | CS2-2 "lists". |
| R3-2 | Mark complete on every Session details surface (status bar, Resume → Organize, the side panel, a project's conversation), saving at once like the rest of it. | CS2-5 "follow" + "also add the complete toggle here". |
| R3-3 | **What complete does to an open session — checked, nothing to break:** the only readers are Resume's list (which never lists a running session: `ipc-handlers` passes the running ids to `listPastSessions`, which skips them), Welcome back's ticks (a complete session starts unticked) and the search index's metadata. The tab, the session lists and the chat ignore it. Resume's organize sheet already keeps a newly-completed row in view (`stickyComplete`). Hint reworded once for both popups: "Leaves it out of the resume list once it's closed, unless you turn on Show complete." | Coordinator: "make sure that can't confuse or break the open session". |
| R3-4 | `tests/SessionDetails.test.tsx` (label + both switches, outside Tags; Mark complete reports a change; the hint), seen red with Mark complete removed. | Guard. |

### Friction this round
1. **A required prop added to a shared card broke a test the type check skips**:
   `tag-cloud-honest.test.tsx` is one of the 47 test files still left out of `tsgo`, so it
   rendered Session details without `complete` and crashed at run time, not at type check.
2. **The test-hygiene rule (read this round, after round 2's flake work) prefers waiting on a
   signal to widening a budget**; round 2's fixes widened six waits. They return as soon as the
   condition holds and none is a fixed sleep before an assertion, but "a budget raised twice is a
   treadmill" — a second raise of any of them should become a signal wait instead.
3. **A "before" state can't open what didn't exist** — `chat/tags#complete` clicks Mark complete,
   so the before side failed 4 pictures by design; shoot reports them as NOT TAKEN either way.

## Proposals implemented (2026-10-13, deck close-session-4)

| # | Proposal | Done as |
|---|---|---|
| 1 | Dialog footer slot | `<Dialog footer>`: pinned under the shared body, which fades into it, no line. Moved: Close session, Close window, Update available (its full-width line gone), Unsaved changes before quit (its painted list fade gone). Not moved, with the reason: takeover confirm, pick a model to resume, Pick a handle, Support YouCoded, Share, Switch model, Import project, Connect GitHub, Publish theme, OpenRouter key, Remove backup — one short block that never scrolls, so a pinned footer changes nothing for the user; Assistant settings, Settings, the model picker, Backup & sync — own their whole layout (two panes, a wizard). |
| 2 | One Enter-to-confirm | `<Dialog onEnter>` + `hooks/use-enter-to-confirm.ts`; `useEscClose` answers "am I on top?". Moved: the close prompt (and Enter now honours "Don't show again"). Guard `tests/enter-to-confirm-authority.test.ts`, seen red on the old prompt; listed with reasons: ToolCard ×2 and PromptCard (chat cards' roving buttons, outside the guide), InputBar (sends a message). **Found, not changed:** while a popup is open, a waiting chat card still answers Enter on the window (cards are exempt from the guide; they need their own "no popup open" gate — ask). |
| 3, 4 | Guide: an action popup that edits; "don't ask again" | Guide → Popups and side panels. |
| 5 | Guide: label rule for a switch card | Guide → Spacing ("a card of switches too", the "In your lists" example). |
| 6 | MAP row | "Session details, tags and the close-session prompt". |
| 13 | Guide + ProjectHero: controls keep the card's margins | Guide → Card levels; ProjectHero's description box and "+ Add a description" no longer hang into the margin. |
| 14 | Guide: the plain multi-line field | Guide → Buttons (beside "a text box with its own action"). |

## Follow-ups rounds 4–6 (2026-10-12/13) — why round 5 invented styling

Destin on close-session-5#CS5-2: "you're doing a bunch of unique styling here again instead of
following the conventions we've already established. the fade is weird, the buttons for each file
are weird, etc. the header is too long".

**What happened.** Round 5 restyled "Unsaved changes" by composing card classes by hand — a nested
box per file built from `CARD_LEVEL_2` plus my own flex row, a loose grey note under the name, the
file's buttons as a separate cluster, the old sentence-title kept — instead of starting from the
shared pieces that already do each job: the setting row (`SettingRow`) for "a name, a line, a
control", the slim notice box (`Callout compact`) for "a problem on an item, with its buttons", and
the one-line title rule. The guide names all three; I opened Games' friends card as a reference for
the *container* and then built the *rows* freehand. The fade complaint was the same root: a body
cut mid-box in a too-short (340-point) popup, not a new fade — but it looked like one.

**Why the tools didn't stop it.**
1. The brief named references for the screen, not for each *part* of it; I satisfied "two or three
   references" at the popup level and invented below it.
2. Nothing flags a hand-built row: `design lint` catches raw colours and arbitrary sizes, not "a
   `<li>` with a name, a hint and buttons that is not a `SettingRow`".
3. A title written as a sentence ("6 files have unsaved changes.") passes every check.

**Round 6 did it the other way:** a conventions list first (each with its guide section or
decisions row and a real surface), the popup rebuilt from exactly those, the list put on the deck
(CS6-1), and the one gap (the "OK" label) asked as a question (CS6-4).

**Also measured, not guessed (CS5-1):** the beta card → Update now gap is 16 points; Submit a ticket
(card → Review ticket) 16; Close session (card → its button) 16 — a pixel column scan of 1×
pictures (`scratch/gap`). Unchanged.

**Live slides can't stage a waiting card.** CS5-4 (Enter behind a popup) had to be a words slide: a
live pane takes a scenario name only, and no scenario has a waiting permission card without a
practice setting (`reply=inbox`, `seed=…`).

## Proposed guide and tooling changes (most valuable first — 1–6, 13, 14 now implemented, above; 7–12, 15–20 with the tooling helper)

1. **Dialog: a `footer` slot** that stays put under the scrolling body and keeps the shared
   fade, so no popup wires its own scroll band (friction 7; the close prompt, and every other
   `scrollBody={false}` caller, would move onto it).
2. **A shared `useEnterToConfirm`** that ignores focused controls and stacked popups, plus an
   ast-grep rule flagging a raw window `keydown` Enter that calls a confirm (friction 8).
3. **Guide: an action popup that also edits** (close, send, resume): whether its editing cards
   start open or folded, and that edits are pending until the action — from CS-2's answer.
   **Answered:** open (close-session-1#CS-2) — now only the guide wording is left.
4. **Guide: a "don't ask again" control** — where it sits and its shape (friction 11).
5. **Guide: the label rule's switch-card exception** — say whether a card of yes/no rows under a
   labelled card needs its own label (Session details and this prompt have none).
   **Answered:** it does — "In your lists" (close-session-2#CS2-2, #CS2-5); no exception to
   write, only the example to add.
6. **MAP: a "Session details, tags and the close prompt" row** — `tags/SessionDetails.tsx`,
   `CloseSessionPrompt.tsx`, `useTagRegistry`, `useSessionMeta`, their tests and screens
   (friction 1).
7. **shoot/journeys: name a control the way the browser does** (skip `aria-hidden`), or match
   by "contains" (friction 2).
8. **deck: lay composite choice variants side by side**, shrunk to fit like tall approve pairs
   (friction 3).
9. **deck: `crop: "<screen>@panel"`** — a close-up box that covers the screen's panel in every
   run and theme, with a margin (friction 4).
10. **deck: default `highlight` to `"panel"`** on a single-screen close-up when the change covers
    most of it, instead of warning (friction 5).
11. **deck preview: one contact sheet per theme** (friction 9).
12. **shoot: `--themes all` means every theme the workbench has** (repeat; friction 10).

Added after round 2:
13. **Guide: a full-width control inside a card keeps the card's margins** — never hung into
    the margin to line up words (round 2 friction 1); ProjectHero's description box does it too.
14. **Guide: the plain multi-line field** — the shared text box at its standard size, full width,
    upright text, a few lines to start (round 2 friction 2).
15. **deck: a slide can say which other screens a shared change reaches** (round 2 friction 3).
16. **deck: three tall choice pictures get more room** — two rows, or the zoom opened (friction 4).
17. **Tests: a lint for fixed sleeps before an assertion** (`setTimeout(r, <100)` then `expect`)
    and for counted poll loops (`i < 40`) — every flake this round was one (round 2 friction 6).
18. **verify: say the machine's load in its summary** and rerun only the failed files alone, so
    a load flake reads as one at once instead of after a manual rerun.

Added after round 3:
19. **Type-check the remaining 47 test files** — a prop added to a shared component broke one
    only at run time (round 3 friction 1).
20. **shoot: a state can be marked after-only** (`newIn: 'after'`) so a before run skips it
    instead of reporting failures (round 3 friction 3).

Added after the follow-up rounds (4–6):
21. **Brief: a conventions list per part, before building** — for every piece of a screen (title,
    container, row, row actions, problems, scrolling, footer) name its guide section or decisions row
    and a real surface; anything left uncovered is a deck question, never a new style. Put the list
    on the first deck.
22. **Design lint: a row that should be the setting row** — flag a list item holding a title, a
    hint and buttons that is not `SettingRow`/`FoldRow` (an ast-grep rule over JSX `<li>`/`<div>`
    with that shape), and a hand-built problem line next to buttons that is not `Callout`.
23. **Guide + lint: popup titles name the popup** — no sentence titles, no counts or full stops in
    a title; a test over `<Dialog title=…>` literals.
24. **deck: a live pane can pass practice settings** (`params`), so a waiting card or a seeded chat
    can be tried live (round 5 friction).
25. **shoot: a crowded machine needs fewer browsers** — at load average 70–107 pictures timed out in
    bulk; shooting one theme at a time got all 40. shoot could size its tab pool by load, not cores.
