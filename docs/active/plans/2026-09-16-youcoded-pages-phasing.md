---
status: active
date: 2026-09-16
related: docs/active/specs/2026-09-15-youcoded-pages-scope.md (the approved scope this orders)
---

# YouCoded Pages — the phasing plan

**What this is.** The approved scope (2026-09-15) says everything Pages should eventually
include. This plan puts it in build order. Each phase ends with something a person can use.
Phases 1 and 2 are built and on master; Phases 3 and 4 are directions, not decisions — their
open questions get answered on a questions deck when each phase starts.

## Where to pick up (2026-09-23)

- **Released?** Phase 2 is on master (youcoded#552) but in no app release yet. When the release
  that carries it ships, merge the held page-builder skill update in the same step
  (wecoded-marketplace branch `session/youcoded-pages-phase2`, plugin 0.2.0 — bring it up to
  master first). Roadmap: "Publish the page-builder skill's connections update".
- **Next build, chosen by Destin:** a home-network connection so a Home Assistant style page can
  reach one named device (roadmap: "A page that manages a device on the home network"). Starts
  with a short deck for its approval wording.
- **Then:** Pages on a phone (never designed at phone width; connected pages over remote access
  never tried) with the small leftover of a page deleted while open; then Phase 3 below.
- **Depth:** Phase 1 and Phase 2 technical designs and the Phase 2 security review are in
  `docs/archive/specs/` and `docs/archive/reviews/`; code and tests are listed on the MAP row.
- **Destin's working preferences for this feature:** he reviews decks himself (no UX tester,
  code reviewer or grader) and skipped the contract in both phases.

**Destin's direction (2026-09-16):** "splitting it into ordered steps with each step
producing the new functionalities"; the permissions infrastructure is "an open question";
"get to a point where we can begin implementing the shell."

## The short version

| Phase | What a person gets | What it proves | Status |
|---|---|---|---|
| 1 · The shell | A Pages icon, a library of pages, pinned page icons, a page open inside the app in the live theme, a first page built in chat | The tab, the library, isolation, theming, the creator | **shipped 2026-09-17** |
| 2 · Connections and refresh | A page that shows live information from a service and refreshes while the app is open | The permission model's first real test | **shipped 2026-09-23** (app; skill held for the release) |
| 3 · Files and assistant tasks | A page that opens a file and asks a model to do something with it | Page-owned conversations, file access | open |
| 4 · Marketplace | Publish a page, install someone else's, updates that re-ask when they need more | Packaging, review, trust on update | open |
| Later | Sign-in style custom services, computer programs, a visual editor, standalone Android | — | open |

## Phase 1 — the shell (pinned)

**A person can:** open Pages from the top-left icon, see their pages, open one, pin a favourite
so it gets its own icon, and build a first page by describing it in chat. A page looks like part
of YouCoded and stays that way when the theme changes.

What is in it:

- **Pages icon** between Settings and Projects. Permanent; cannot be removed. Narrow screens
  reach it through the same overflow menu Projects uses.
- **Pages library.** A full screen in the same family as Projects: header with the title and
  the back affordance, then page cards. Each card: name, a one-line description, where it lives
  (Personal, or the project's name), and the pin. Empty state names what is missing and offers
  "Make a page".
- **Pinned page icons.** Up to a small number of pinned pages appear as their own icons beside
  Projects. Beyond that they live in the library. Pin state is per device.
- **A page open in the app.** Full screen, same header family: page name, pin, "Edit in chat",
  back. The page itself runs in an isolated frame (the same isolation the file viewer already
  uses for HTML), gets the current theme's colours, fonts and radii at startup, and gets them
  again live when the theme changes. Switching themes never rebuilds the page or loses what is
  on it.
- **A page style kit.** One stylesheet the page can use so its buttons, fields, cards and text
  match the app. Pictures, drawings and game art keep their own colours.
- **The creator skill.** A built-in skill, like the theme builder, that turns "make me a page
  that…" into a page using the style kit. An edit goes straight to live; git history is the
  undo (decided 2026-09-17, see Build decisions below).
- **Personal and project pages.** A page belongs to you or to a project, and says which.

What is NOT in it: no connections to services, no file access beyond the picker, no model
tasks, no background work, no marketplace, no permissions screen. In Phase 1 the app did not
block a page from reaching the internet (decided 2026-09-17: no blocking work in Phase 1).
**Superseded by Phase 2:** pages are now blocked from everything they have not been allowed.

Proving page: something that needs nothing from outside — a timer, a paint page, a notes
board. Destin's analytics dashboard is Phase 2's proving page, not Phase 1's.

Design record: `docs/active/design/2026-09-15-youcoded-pages/` (the questions deck and its
answers, then the shell's review decks).

Shell deck, round 1 (2026-09-16, `youcoded-pages-shell.review.answers.json`): the top-bar
button and pinned buttons, the empty library and both phone layouts are approved; the pin cap
is four. Asked for: a better pin glyph on the cards, more intriguing examples on the welcome
card (a calendar, a news feed, an email browser, a team timesheet), and richer sample pages
("too basic for what i had envisioned"). Open: the page header layout ("may want to come back
to this layout"), carried into round 2 as a question.

Round 2 (`youcoded-pages-shell-r2.review.answers.json`): the upright pin, the new welcome
copy, the week planner and the paint studio are all approved. On the page header: "i don't
think i want a header in that style… hide the pinned/edit tags… maybe a side panel… give me
a few different options (framed, frameless, side panel)".

Round 3 (`youcoded-pages-shell-r3.review.answers.json`): side panel chosen, with a frame of its
own: "keep exit/maximize/minimize, put back to chat where the games/files panels would be, a
page name where the session browser would be, and the new side panel instead of the
settings/project panel options"; the panel lists all pages with the pin beside each, a centred
Manage pages button opens the library, the panel collapses from a top-left button, Esc · Back
to chat stays top-right. The ⋯ menu from round 3 was dropped in favour of that.

Round 4 (`youcoded-pages-shell-r4.review.answers.json`, 2026-09-17): the collapse is approved;
the rest was polish — "the spacing/dividers/alignments are all kinds of fucked up": no
divider under the band ("the edge of the frame itself should be the divider"), no divider
above Manage pages ("just a bare pill button"), no odd margin between panel and pane, a
better-styled Esc · Back to chat, and Edit in chat as "a separate edit button, with a hover
tooltip clearly explaining what it is… just in the header", not beside the name.

Round 5 (`youcoded-pages-shell-r5.review.answers.json`): the collapsed frame is approved.
Changes asked: the side panel "in its own framed container, kinda like games/files in framed
chat sessions"; Manage pages wider; Back to chat "should match styling of max/min/exit icon"
(no outline); and "remove the edit option from the page header, and keep it only accessible in
the manage pages view". Applied in round 6.

Round 6 (`youcoded-pages-shell-r6.review.answers.json`): all three approved — the quiet Back
to chat pill, the framed panel with a full-width Manage pages, and Edit only on the library
cards. One note: align "Back to chat" and "Esc" and put a dot between them (applied).

**Build decisions (interview, 2026-09-17):**

- **Sync is built in.** Personal pages live in the Personal sync space (`~/YouCoded/Personal/Pages/<slug>/`);
  project pages live inside the project in a VISIBLE folder (`<project>/Pages/<slug>/`) and
  travel with it. Not `<project>/.youcoded/`: that folder is git-ignored and excluded from sync
  by design (`sync-spaces/guards.ts` DEFAULT_IGNORES, `artifacts/project-manager.ts`), so a page
  there would never leave the machine.
  A page's own saved data lives in its folder and syncs with it (later save wins on a conflict).
  Pin state is per device, kept beside the pages (`Personal/Pages/.pins/<deviceId>.json`) rather
  than inside the device registry, whose schema version older builds reject outright.
- **Versioning is git.** Both homes are git repositories; "put it back" in chat restores from
  history. No draft state, no previous-copy file: an assistant's edit goes straight to live and
  the open page reloads.
- **No outside-access blocking in Phase 1** ("i dont want to do much backend work").
  Superseded by Phase 2, which blocks everything unapproved.
- **Rename, delete, icon and description through chat** for now; the library keeps only pin
  and Edit in chat.
- **The three sample pages stay workbench demos**; a fresh install starts with the welcome card.
- ~~**The side panel starts hidden**, everywhere.~~ Superseded the same day: the panel is
  pinned open (redirection below).
- Switching pages in the panel reloads the page; accepted for Phase 1 since page data is saved
  as it goes.

**Redirection during the first dev try (2026-09-17, in chat):** the Pages icon opens straight
into the page view (panel + framed window, "No page selected" until one is picked); the panel is
pinned open and its toggle removed; the band carries the app's Settings, Pages and Projects icons
(not the chat/terminal toggle, files or games); a filled "+ Create a page" sits above Manage
pages; the old Pages screen is reached only through Manage pages and closes back onto the view.
Built and committed the same day. Rows R22 (panel starts hidden), R21 (library header "Esc · Back
to chat") and the round-1 "Pages button opens the library" reading are superseded. (The contract
these rows belonged to was later skipped — see the wrap-up below.) Since 2026-09-23 a person with
no pages lands on the welcome card in the page view itself (youcoded#550).

**Second redirection during testing (2026-09-17, in chat):** Create a page / Make a page / Edit
open the app's new-session dialog (folder, model, skip permissions) with the page-builder command
waiting in the composer; a pinned button opens its page edge to edge with the panel hidden and
the button lit (the Pages icon brings the panel back); the chat's global shortcuts are blocked
under the page view; Project View wears the same band and framed pane (ScreenBand). In floating
chrome (Halftone Dimension) the screens went transparent over the wallpaper with glass panes;
four framings were captured (`youcoded-pages-floating.choice.json`) and Destin picked **two
cards** in chat, then asked for the gap under the header pill to match the gutters (8px
everywhere). Two Settings bugs fixed (scrim order, Esc from inside a page). The round-10 deck
spec (`youcoded-pages-shell-r10.review.json`) was written and never built: Destin asked to hold
THAT deck while he refined the design ("wait on the deck"), then skipped it at wrap-up. This was
about one deck, not a standing rule to hold decks.

**Phase 1 wrap-up (2026-09-17, later the same day):** Destin's own end-to-end pass in the dev
window passed. He chose to skip the contract and the round-10 / acceptance decks ("this is
already built basically, and i have done most of the reviews myself") — so the decisions of
this phase live in the nine answered decks, the floating-theme choice deck and this plan, not
in a signed contract. Both branches were brought up to master (255 / 343 commits) and the
full desktop verification is green on master's toolchain. Left open, filed on the roadmap
(`docs/roadmap/other-features.md`): the page view at phone width, a page deleted while open,
and a one-off accent-coloured tint over pages in two wallpaper themes that cleared on its own.

**How a skill change is tried before it ships:** the installed plugin in Destin's everyday app
must not be changed, so copy `skills/page-builder` into a throwaway project's
`.claude/skills/` under another name (Phase 2 used `page-builder-next`) and start the dev
window's chat in that folder. Choose a project page there, or the page syncs to every device.
(The 2026-09-17 build-status notes that stood here — a contract awaiting signature, "still to
build" lists — were overtaken by the wrap-up above and removed on 2026-09-23.)

## Phase 2 — connections and refresh (shipped 2026-09-23)

**A person can:** make a page that shows information from a service and keeps it current
while the app is open. Proving page: the analytics dashboard.

Direction: a page's manifest lists what it wants to reach; the app asks once, at install or
first open, and again only when the list changes. The app holds credentials; page code never
sees them.

**Decided on two questions decks (2026-09-19)** —
`youcoded-pages-connections.questions.answers.json` and
`youcoded-pages-connections-2.questions.answers.json`, both in the design folder:

- **Everything unapproved is blocked.** The app becomes a page's only way out; the creator
  skill pastes libraries into the page itself and uses `data:` URLs or inline SVG for pictures.
  This reverses Phase 1's "no blocking work".
- **A page may ask for the whole internet** as its own blunt approval ("Can reach any website.
  Anything shown in this page, or typed into it, could be sent anywhere."). Destin: "what if i
  want to create a basic web browser". **Never combined** with a key or sign-in on the same
  page; the creator skill splits such a request into two pages.
- **A true browser page is later**, as its own item: most large sites refuse to be shown inside
  another page, so it needs an app-supplied website view with its own design.
- **Access is described as a plain list**, one sentence per thing reached; no levels or badges.
- **Always ask once, including for pages made in the person's own chats.** An edit that adds a
  connection or changes an address asks again, showing only the new line; removing never asks.
- **All four kinds of connection:** the YouCoded sign-in (the marketplace session the app already
  holds is accepted by the worker's `/admin/analytics/*` endpoints), a pasted key, public
  information with no key, and the GitHub sign-in (blunt wording: it can change repositories).
  Sign-in with Google and the like stays later. "i kinda want all of the above".
- **Two kinds of keyed connection: look-up only (enforced by the app) or full.** The words
  "read-only" and "safe" are never used for an outside service.
- **A key is typed only into the app's approval screen**, kept where model-provider keys live;
  a second page is offered the saved key and still asks.
- **Refresh on opening and while open**; no background refresh for pinned pages in this
  phase. The one-minute floor is the creator skill's guidance, not an enforced limit: the app
  refuses past 120 requests a minute per page, because one refresh of a dashboard can be a
  dozen requests.
- **The age and the refresh button belong to the app**, in the band beside the page name,
  connected pages only. Review round 1 cut it to a bare "2m" (no "Updated … ago"); a failed update
  reads "Couldn't update · 3h" while the page keeps its last numbers.
- **Managing lives in two places:** a Connections line on the page's library card, and saved
  keys (with the pages using each) under Settings › Account › Connected services (renamed from
  Connected accounts in review round 1). Remove says "stops future use".
- **Phone:** may use and approve pages; a new key is entered on the computer only ("Finish
  setting this up on your computer").

Foundations found 2026-09-19 (read-only sweep): no content-security policy or request filter
exists anywhere in the app; `page.json` reads only name/description/icon and ignores the rest;
keys live in `main/providers/secrets-store.ts` (safeStorage, refs only on disk); the outbound
primitive to build on is `main/harness/tools/net-guard.ts` (`guardedFetch`); there is no
fetch-on-behalf channel; approval vocabulary to match is `marketplace/CapabilityList.tsx` and
`ui/Dialog.tsx`; `ConnectedAccounts.tsx` is the Settings home; the `useVisibleInterval` hook the
guard test names does not exist yet.

**Security review and deck 3 (2026-09-20 → 23).** A reviewer found 18 problems in the design;
17 were fixed and one reversed on build (`docs/archive/reviews/2026-09-20-youcoded-pages-phase2-design-review-1.md`).
Deck 3 (`youcoded-pages-connections-3.questions.answers.json`) then settled the wording they
touched: look-up lines say "Cannot change anything there. The page decides what it sends to this
address."; the whole-internet card names the home network; a page whose code changed since it was
allowed shows a quiet, dismissible note in the band and is not blocked; opening links in the
browser stays allowed. Destin asked whether home-network access should ever be allowed — filed
as a separate connection kind for a Home Assistant style page (`docs/roadmap/other-features.md`).
A key now goes as `Authorization: Bearer <key>` unless the manifest says otherwise, and the
page-builder skill (wecoded-marketplace, 0.2.0) teaches connections. The screens took four review
rounds (`youcoded-pages-connections-r1…r4.review.answers.json`); the biggest change was splitting
key entry into its own second step with the page author's instructions for finding the key.

**Added after the first real open:** a YouCoded connection may make changes only at the exact
places it lists (`writePaths`, for the analytics page's campaign builder) — never the whole
account; look-ups stay open.

**End-to-end pass (2026-09-23, Destin, dev window).** The analytics dashboard, built in chat by
the updated skill, read live numbers through the YouCoded sign-in after one approval, and its
campaign builder wrote through a named `writePaths` place. A weather page using a pasted key also
worked ("tested with a weather app, and this seems to work"). Two fixes came out of the first
open: requests past four at once now queue instead of being refused, and the per-minute cap is
120. Not tried: a phone over remote access; Android refuses by design.

**Merged 2026-09-23** (youcoded#552). The page-builder skill update (wecoded-marketplace
`session/youcoded-pages-phase2`, plugin 0.2.0) is held until an app release carries Phase 2 —
merging it earlier would hand everyone a skill that builds pages their app cannot run. Next
phase starts with a Home Assistant style home-network connection (Destin, 2026-09-23).

## Phase 3 — files and assistant tasks (open)

**A person can:** make a page that opens a file and asks a chosen model to do something with
it, then shows the result. Proving page: the spreadsheet report.

Direction: opening and saving go through the normal file picker; a page that needs standing
access to a folder asks for that folder. A model task is a conversation the page owns, with the
app's existing stop control, spending limit and permission prompts, and a "show conversation"
link.

Open questions: when standing folder access is worth its own grant; how a page's conversation
shows up in the session list; whether a page can pick any model or only the ones already set
up; what happens when the model is unavailable or the task fails.

## Phase 4 — marketplace (open)

**A person can:** publish a page, install one, and get updates.

Direction: pages are folders, so packaging follows how themes already package and install.
The one new mechanism: an update that asks for more than the installed version re-asks; an
update that asks for the same or less installs quietly. Reviewed status attaches to a version.

Open questions: review process and who reviews; whether custom connections are packaged with
the page or separately; how a project-owned page is shared.

## Later (open, retained)

- **Sign-in style custom services** that can graduate into supported services (scope §7).
- **Computer programs** with their own trust and versioning (scope §9).
- **A visual editor** with chat beside the preview, drag, reorganise and resize (Destin's
  explicit request in the questions deck).
- **Standalone Android** (scope §12).
- **Durable background automation** coordinated with Agents & Automations (scope §10).

## How each phase runs

1. A questions deck for that phase's open questions (skipped for Phase 1: the 2026-09-15 deck
   covered it).
2. Mockups in the workbench, then a Before/After review deck. Destin reviews decks himself;
   the automated UX tester, code reviewer and grader are not used (his standing preference).
3. Technical design with one adversarial review round, build, verify, Destin's own end-to-end
   try in a dev window, then his merge call. (The contract step was skipped in both phases on
   his call.)
