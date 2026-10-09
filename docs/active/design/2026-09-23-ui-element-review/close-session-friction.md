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

## Proposed guide and tooling changes (most valuable first — not implemented)

1. **Dialog: a `footer` slot** that stays put under the scrolling body and keeps the shared
   fade, so no popup wires its own scroll band (friction 7; the close prompt, and every other
   `scrollBody={false}` caller, would move onto it).
2. **A shared `useEnterToConfirm`** that ignores focused controls and stacked popups, plus an
   ast-grep rule flagging a raw window `keydown` Enter that calls a confirm (friction 8).
3. **Guide: an action popup that also edits** (close, send, resume): whether its editing cards
   start open or folded, and that edits are pending until the action — from CS-2's answer.
4. **Guide: a "don't ask again" control** — where it sits and its shape (friction 11).
5. **Guide: the label rule's switch-card exception** — say whether a card of yes/no rows under a
   labelled card needs its own label (Session details and this prompt have none).
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
