---
status: active
date: 2026-09-16
related: docs/active/specs/2026-09-15-youcoded-pages-scope.md (the approved scope this orders)
---

# YouCoded Pages — the phasing plan

**What this is.** The approved scope (2026-09-15) says everything Pages should eventually
include. This plan puts it in build order. Each phase ends with something a person can use.
Only Phase 1 is pinned down. Every later phase is a direction, not a decision: its open
questions are listed and get answered on a questions deck when that phase starts.

**Destin's direction (2026-09-16):** "splitting it into ordered steps with each step
producing the new functionalities"; the permissions infrastructure is "an open question";
"get to a point where we can begin implementing the shell."

## The short version

| Phase | What a person gets | What it proves | Status |
|---|---|---|---|
| 1 · The shell | A Pages icon, a library of pages, pinned page icons, a page open inside the app in the live theme, a first page built in chat | The tab, the library, isolation, theming, the creator | **pinned — building** |
| 2 · Connections and refresh | A page that shows live information from a service and refreshes while the app is open | The permission model's first real test | open |
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
  that…" into a page using the style kit. Draft edits stay separate from the working version
  until applied; the previous working version stays recoverable.
- **Personal and project pages.** A page belongs to you or to a project, and says which.

What is NOT in it: no outside connections, no file access beyond the picker, no model tasks,
no background work, no marketplace, no permissions screen. A Phase 1 page cannot reach
anything outside itself, so there is nothing to ask permission for yet.

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

## Phase 2 — connections and refresh (open)

**A person can:** make a page that shows information from a service and keeps it current
while the app is open. Proving page: the analytics dashboard.

Direction: a page's manifest lists what it wants to reach; the app asks once, at install or
first open, and again only when the list changes. The app holds credentials; page code never
sees them.

Open questions (for that phase's questions deck):

- How coarse are the levels a person sees? The 2026-09-16 review proposed three ("just a page",
  "connected", "computer") over the scope's eight kinds; Destin has not decided.
- Which connections ship first? Proposed: YouCoded's own analytics, plus "paste a key" for
  services that take a key. Sign-in style services (Google and the like) are later.
- What honest wording goes on the approval screen, and what can we truthfully promise about
  "read-only"?
- Refresh: a per-page interval while the app is open, with a visible last-updated time. Is
  anything beyond that needed in this phase?

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
3. Contract, build, verify, review deck of the built thing, then Destin's merge call.
