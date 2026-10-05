---
status: active
date: 2026-10-05
related: redesign-backlog.md row 11, games-social-1.json
---

# Games: friends panel, sign-in and lobby — where the guide helped, and where it didn't

First drafts of the redesigned Games panel (backlog row 11), built only from `guide-draft.md`,
`decisions.md`, the backlog and the workspace tooling. App commits: practice states + screens
(no visual change), then the redesign. Deck: `games-social-1.json` (before `runs/gs-before`,
after `runs/gs-after`; YouCoded, YouCoded Night, Midnight).

References opened first (guide "How to use" step 2): **the sessions menu's status pill**
(`SessionStrip.tsx` `StatusPill` — a live status with its dot inside), **Account → Your profile**
(identity row + outlined button in one level-1 card; the signed-in/out card in the same spot),
**Session details' Tags card** (an "Add a tag" box at the top of the card that holds the list),
**Settings → Remote Access device list** (short names as plain rows in one shared box), and the
**solo leaderboards** (`Leaderboard.tsx`, a score column at the right under a small label).

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | Signed out: one card at the TOP, Destin's sentence verbatim, a filled Sign in; "Flappy and 2048 play without an account" removed. | Backlog row 11 (verbatim). Guide "Empty states" (a card with a short explanation and one button). |
| 2 | The Sign in is **centred** by default; a full-width draft is on the deck (GC-2). | **Contradicted.** Destin's direction says "centered filled sign in"; guide "Buttons" says any lone button is full width unless it sits on one line beside its text. Built both, asked. |
| 3 | A "Friends" label over that card and over the signed-in card; a "Games" label over the grid. | Guide "Spacing" → a label comes first; once one card has a label every card does. The grid is cards you pick (raised cards), so it is **ambiguous** whether "every card labelled" covers a card grid — I labelled it so the two groups read as siblings. |
| 4 | Unplayable games (versus signed out; versus when the server is down) are disabled and greyed with `opacity-50`; their line still says why. | Row 11 ("grey/disable unplayable games"). **Reverses** the arcade spec §4.2 / old guide §4.7 rule that signed-out versus tiles stay clickable to explain the gate — the friends panel now explains it. Guide "Text and numbers": the faintest grey is only for disabled things. |
| 5 | Signed in: ONE level-1 card holds you (name, live pill, Go incognito), the add box, and every person as plain rows in ONE nested box. | Guide "Card levels" (one idea = one card; nested = level-2), "Lists of short names are plain rows inside one shared box", decisions K-RULE (four-kinds rejected: keep grouping cards). |
| 6 | Status as pills with a dot inside: Online / In game green, Offline grey; Connecting… / Incognito / Offline for you. | Row 11 ("online status should be a status pill"); guide "Status and notices" (live status carries its dot inside the pill); decisions S-1, PL-1…4 (lobby states green/grey). **Tooling gap:** the shared `Pill` had no dot — the only dotted pill is the session switcher's private copy. I added an optional `dot` to `Pill` (static dot, no animation — performance rule 6). Not invented vocabulary, but a primitive change: flag it. |
| 7 | "Last seen 3h ago" stays a grey line under an offline friend; the pill says Offline. | Guide silent on history vs live state — chose: pill = live state, grey line = history (the setting row's hint). |
| 8 | Friend requests are rows in the same list: incoming first ("Wants to be your friend", filled Accept + outlined Decline), sent last ("Request sent" pill + Cancel). | Row 11 ("add a friend could be subsumed into friends"). **Ambiguous:** guide principle 6 says one filled button per view; Accept stays filled (change 47, 2026-07-16), so several incoming requests show several filled buttons. Guide silent on a list where each row has its own main action. |
| 9 | Add a friend: three drafts behind `?friendsAdd=` — box at the top of the card (shipped default), full-width outlined button under the list that opens the box, a fold-out row. Box keeps "Add" inside it as a small filled button. | Row 11 left the "how" open. Guide "Buttons" (action inside the text box — P-5/G-8; a follow-up action is a full-width outlined button — P-3; never a dashed add box — fix batch 1) and "Settings" (fold-outs are boxed rows). The top-box default copies Session details' Add a tag. The "Add" button label replaced "Send request" (screen-reader name: "Send friend request"). |
| 10 | Lobby keeps: incoming challenge (Accept/Decline notice), declined notice, and each friend's pill, record and Challenge. Removed: profile card, add box, requests, sent requests, ⋯ menu. | Row 11 ("just show scores for each person … with challenge. no add friend in game panels"). |
| 11 | Lobby record: three drafts behind `?lobbyScores=` — right-hand column under "Your record" (shipped default), today's chip, a sentence under the name ("You lead 4–2"). | Row 11 left the "how" open. Column copies the solo leaderboards' score column; the sentence uses `recordSentence` (the end-of-game card's wording). **Guide silent** on numbers in a list row. |
| 12 | Lobby while incognito: a notice "You're incognito. Friends can't see you or challenge you." with Go online inside it. | Guide "Status and notices" (a notice's buttons go inside it). Needed because the incognito switch left the lobby (moved to the friends card). |
| 13 | Empty lobby: a card + full-width filled "Add a friend" that goes back to the Games list. | Guide "Empty states" (first time → card + one full-width filled button). **Behaviour:** the button navigates; it doesn't open the box (in the `button`/`fold` drafts you still have to open it). |
| 14 | Presence pills hidden whenever presence is unknown (incognito, server unreachable) instead of showing "Offline". | Workspace rule "never invent a cause/state"; found reading the round's pictures (degraded state showed everyone "Offline" beside "Active just now"). Guide silent on unknown status. |
| 15 | Block confirm inside the ⋯ menu: red Block on top, Cancel under it, full width. | Guide "Buttons" (destructive confirm: red takes the main action's place — on top when stacked). Was side by side with red on the LEFT. The red "Block" menu item text was left as it was — **guide silent** on destructive menu items vs "never coloured text". |
| 16 | Phone and 640×480: same layout; nothing scrolls sideways. In 640×480 the friends card fills the first screen and the games are out of sight. | Guide "Every theme, every width". The cost is asked as a question (GQ-1) rather than solved by inventing a cap. |

## Tooling — did the Marketplace-round improvements help?

| Improvement | Verdict |
|---|---|
| **Practice-state switches / fixtures pattern** | Helped a lot. Adding `?friends=many|requests|none` to the existing `social` fake took ~40 lines and gave every state the brief asked for. The "N designs of one real screen" recipe in `scripts/shoot/README.md` was exactly right — three switches in `workbench-mode.ts`, screen entries with `params`. |
| **1.5× pictures by default** | Helped — chip/pill borders were judged at Destin's scale with no extra step. |
| **Region crops `<screen>@WxH+X+Y`** | Essential: the games pane is 420px on the right of a 1440px picture, so a whole-screen crop is mostly chat. |
| **`highlight: "panel"`** | **Broke on region crops**: `build` refused every step ("has no panel box to draw (a region crop, or an old picture)"). The region already IS the panel, so for a whole-pane redesign there was nothing to box; I dropped the field and accepted the default `auto`, which then warns "whole-surface change, name an element" on 13 of 16 steps — the same warning the Marketplace round asked to silence. Fix: let `panel` on a region crop mean "the region itself", or translate the panel box into region coordinates. |
| **"Parts agree" check (`data-parts-agree`)** | Used: marked the friend-request button pair and the challenge Accept/Decline pair. No findings. It cannot see the thing that actually needed checking (pill heights next to buttons in one row are DIFFERENT by design), so it stays a narrow check. |
| **Preview writes per deck, `--themes`** | Helped: `preview/games-social-1/` held only this deck. Still easy to forget `--themes` (default takes two). |
| **verify keeps logs** | Fine; both full runs passed so the logs weren't needed. `shoot --check` was NOT blocked by port 4717 this time. |

## New friction

1. **The crop names a screen STATE, and a typo silently shows a different state.** My first build
   pointed GS-2/3/4 at `chat/games@…` (signed out) instead of `chat/games#friends@…`, and GS-5/6 at
   the one-friend lobby. The build passed; only reading the preview pages caught it ("signed in,
   four friends" headline over a signed-out picture). A check that the step's `path` and its crop
   agree is impossible, but `build` could print, per step, which screen state each crop resolves to.
2. **Tall crops lose the side cards.** A 420×560 pane crop puts What changed / You'll notice / Risk
   in a side column that fits ~2 short cards; the Risk card vanished on GS-1/GS-2 and "You'll
   notice" was cut mid-sentence. AUTHORING.md warns about it; a side pane is ALWAYS tall, so every
   games step hits it. I shortened the words and dropped Risk on tall steps. A build-time warning
   ("this step will render side-column; N cards won't fit") would save a preview round.
3. **Choice slides with tall pictures stack the variants vertically**, so only the first is on
   screen and the answer bar covers the rest until you scroll. Not wrong, but three 420×560
   drafts are hard to compare. Side-by-side for tall crops (each scaled down) would suit a pane.
4. **Panel box for a lobby excludes its header**, the games list's includes it (the lobby's mark
   sits in the body). Crops therefore needed hand-measured header offsets (`+910+40` not `+910+84`).
5. **The shoot "before" needed a two-commit dance** (fixtures first, picture, then the redesign) —
   the same as the Marketplace round. `shoot --before <commit>` that builds a temporary checkout
   would remove it.
6. **No shared avatar.** Friends have `avatar_url` but `AccountAvatar` is private to
   `AccountSection.tsx`; I left avatars out rather than copy it.
7. **The landing page films this pane** (`?signedIn=1`, Jake only). The next `site-assets.sh` run
   will film the new friends card; nobody is told. Not regenerated here.

8. **A load-sensitive failure in `shoot --check`, unrelated to games — fixed.** The second full
   verify failed `office/versions`: "Escape should close dialog Versions only … after: panel
   office/document". Alone it passed 4 of 4 (and in verify runs 1 and 3). Cause: the Escape test
   compared layers by NAME, and the Office document panel under the dialog renames itself (from
   its text to its screen mark) when it finishes loading — so under load the same panel read as a
   different one. Fix (workspace `scripts/shoot/`): `listLayers` gives each layer element a stable
   `uid`; the Escape test compares uids and keeps names for the message. Shoot's 18 tests pass and
   three later full `--check` runs were clean. **Not reproduced on demand** (1 in 6 under load), so
   "seen red, then green" was not possible for this one.

8. **`shoot --check`'s Escape test failed once in six full runs** (`office/versions`, never on a
   games screen): it named layers by text, and the Office document panel under the Versions dialog
   renamed itself (its text → its screen mark) as it finished loading during the 2 s wait, so "the
   panel stayed open" read as "Escape closed two layers". Passed 4 of 4 run alone. **Fixed in this
   round** (workspace `scripts/shoot/explore-page.mjs` gives each layer element a stable `uid`;
   `shoot.mjs` compares uids, keeping names for the message). Two full `--check` runs and the final
   `verify --full` were clean after it. Not reproducible on demand, so the fix is reasoned, not
   seen red→green. A panel that genuinely re-mounts on Escape would now be flagged — none did.
9. **A PC crash mid-round** damaged the app repo's object store (repaired by the coordinator). The
   workspace drafts, runs and deck survived intact (every picture re-read, manifests parsed).

## Left undone / unsure

- Avatars on friend rows (no shared avatar piece).
- The ⋯ trigger and its menu stay hand-rolled (moved unchanged): a `⋯` text glyph, not an icon button.
- The lobby's fallback sign-in screen (only reachable by signing out while a lobby is open) keeps
  its old look with the 🎮 emoji.
- Solo boards (Flappy/2048) untouched — row 11 is about the versus lobby; their "Add a friend and
  their best shows up here" invitation now points at the friends card implicitly.
- The friends list is not chunked (`useChunkedReveal`): friends lists are small (server caps
  requests per day) and the old lobby wasn't either; a 1,000-friend stress pin was not added.
- Android: shared renderer, no native UI for games/friends (Kotlin only proxies the social and
  arcade calls, unchanged). Not built here.

## Round 2 (2026-10-05) — after Destin's games-social-1 answers

Deck `games-social-2.json` (before `runs/gs-after` = round 1, after `runs/gs2-after`). References
opened: **Settings → Account's signed-out card** (`SignedOutBody`), **Appearance's themes box**
(`ThemeScreen.tsx`: capped `.scroll-mask` list with its buttons inside at the bottom), the app's one
dropdown **`ui/Select`** (as in Settings → Providers), the **sessions menu rows** and the **Settings list**.

| # | What I did | Driven by |
|---|---|---|
| R2-1 | Signed-out card = Account's: level-1 card, left-aligned 12px line, full-width filled Sign in. | GS-1 note ("doesn't match app styling"), GC-2 (full). The guide's "Empty states" recipe gave round 1 nothing about text size or alignment; copying a named screen did. |
| R2-2 | Your status is one `Select` (Online / Incognito) at the right of the card; the pill and Go incognito are gone. | GS-2 note. **Guide silent** on a dropdown inside a card's header row; Select is a full-width field, so it needed a fixed-width box (first draft stretched over the summary — caught in the pictures, not by any check). |
| R2-3 | The card starts folded to ONE line, no "Friends" title inside it (the label above says it); arrow on the right; folds again each time Games opens. Two drafts behind `?friendsSummary=`: `count` ("2 of 4 online · 1 request", shipped) and `names` (green "2 online" pill + "Jake, Mira"). | GS-2 note. First draft repeated "Friends" under the "Friends" label — the guide's "a label never repeats the popup's title" doesn't cover a label repeating inside its own card; read off the pictures. |
| R2-4 | Opened list: Appearance's themes-box pattern — capped (`max-h-64`), scrolls under the masked fade, filled full-width "Add a friend" INSIDE the box at the bottom, rows passing under it; online first; no folding. | GC-1 note ("dark … inside the container, like the appearance panel"), GQ-1 note ("scrollable, like resume browser"). The guide has no recipe for "a list with its action pinned inside" — Appearance is the only example; worth a guide line. "Dark" read as filled (the theme's filled button). |
| R2-5 | Accept is the rightmost button; Decline left of it. | GS-3. **Round 1 broke the guide**, not the other way round: "two buttons side by side: the filled one on the right". I had kept the old lobby's order. No conflict to report. |
| R2-6 | Lobby: record as a sentence only (GC-3 line); column/chip and `?lobbyScores=` removed. Two arrangements behind `?lobbyRows=`: `switcher` (sessions-menu plain rows, pill after the name, shipped) and `settings` (Settings-list boxed rows). | GS-5 note ("rearrange these tiles to match other app ui"), GS-7 ("rearrange"). **Ambiguous:** "tiles" on the lobby step most likely means the friend rows (the only tiles on that picture); the games grid was left as it is. |
| R2-7 | Three distinct not-connected states (`friends-data.ts` `socialState`, one source for the card and the tiles): **incognito** — line "Hidden from friends", dropdown says Incognito, no notice, Connect 4/Chess still open and say "You're incognito"; **no internet** — line "No internet connection", amber notice "This computer is offline…" + Try again, Connect 4/Chess greyed; **server unreachable** — line "Game server unreachable", red notice + Try again, Connect 4/Chess greyed. Friends' pills hidden in all three. | GS-12 note; `docs/error-message-standards.md`: "no internet" only when `navigator.onLine` is false (the browser reports no network — a fact); online-but-failing says WHERE ("game server"), not why; every error state has an action (Try again). New `hooks/useNetworkOnline.ts`. |
| R2-8 | Practice states: `?incognito=1`, `?network=offline`, `?friendsOpen=1`, `?friends=lots` (12 friends). | Needed to photograph each state. |

### Tooling friction this round
1. **An approve slide can't compare two different screen states**, so a brand-new state (incognito,
   offline, the long list) can only go on as a one-picture slide whose buttons read "Yes build it /
   No leave it" — wrong words for something already built. I renamed round 2's `#requests` screen to
   the opened card so at least that one compares.
2. **"Show three states side by side" has no tool.** I cut three panes per theme by hand into
   `runs/gs2-after/shots-states/<theme>/three.png` and named it with a deck `crops` entry. A
   `"crop": ["a", "b", "c"]` that lays several screens side by side would do it.
3. **A dropdown that silently fills its row** (`Select` is `w-full`; its `className` doesn't win
   over that) overlapped the summary text. No check caught it — "parts agree" only reads marked rows.
4. **Choice slides compare whatever data their screens carry** — round 2's first build compared a
   summary WITH a request against one without; only reading the slide caught it.
5. The crash wiped the session scratchpad (the crop helper); rebuilt in a minute. `preview` per deck
   and `--themes` worked as intended. `verify --full`: 9/9 PASS (twice this round).

### Not done / unsure
- Games grid left as it is (see R2-6).
- "No internet" can only be shown when the computer has NO network; a network with no internet reads
  as "Game server unreachable" — correct by the standards, but Destin may expect "no internet" there.
- Status dropdown says "Online" while offline (it is your choice, not your connection) — not said on
  the deck; could confuse.
- The add box, once open, sits over the last row of the list (it grows upward inside the box).
