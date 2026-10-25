---
status: draft
date: 2026-10-24
related: docs/active/investigations/2026-10-24-pages-finish-audit.md (what exists); docs/active/design/2026-10-24-pages-finish/pages-finish.questions.answers.json (Destin's first answers); docs/active/specs/2026-09-15-youcoded-pages-scope.md; docs/active/specs/2026-09-01-agent-platform-vision-and-state.md; cards #90, #61, #155
---

# Finishing Pages — the architecture proposal

**Direction approved in two question decks; screens not yet designed; nothing built.**

## Decisions from round 2 (`pages-finish-2.questions.answers.json`, 2026-10-24)

- **Build missing systems once, for the whole app;** Pages is their first user. Card #61
  (Agents & Automations) joins this effort.
- **An autonomous assistant is one job:** a prompt, a model, a start condition (a timer, an
  event such as "an email arrived", or a button), and a fixed set of permissions. Destin: the
  permissions should be "more granular than the ask/edit/full auto offered for real chat
  sessions": a limited toolset, possibly tools chats never use (e.g. only `email_read` and
  `email_write`), and **each tool its own "Always allow" / "Ask first" per assistant**. Reuse
  where possible, but more modular. "Assistants that own duties" maybe later, not now.
  *Design consequence:* a recipe's allowed operations can become an assistant's tools: an email
  recipe yields `email_read`/`email_write`, each with its own allow/ask switch.
- **Still open — needs more thought before step 4:** how unattended asks behave ("need to
  think more through various autonomous assistant types and use cases"). Next: a catalogue of
  assistant types and use cases, each with its permission pattern, before deciding.
- **Claude subscription for background runs: yes, now** (Claude Code headless), alongside
  provider models.
- **Still open — needs pictures:** where a page's chat lives (Destin "unsure" on the side
  panel). Show layouts on a choice deck before step 3.
- **Spending limits:** one system; on by default for pages and automations, optional for chats.
- **One Settings window per page** replaces the connections window; opened from the card and
  the top band.
- **Accounts:** build the shared "Sign in with…" system here (step 5), evaluating and pulling in
  card #155's unfinished Google work. That work exists only as uncommitted files in
  `worktrees/sessions/155-google-files` (34 files, never committed or pushed as of 2026-10-24).
- **Hosting: GitHub stays the store;** no self-hosting now.
- **Publishing needs a GitHub account for now.** Publishing without GitHub, versions/forks/
  "update my version", the AI reviewer and programs in shared pages move to a **separate
  follow-up item** after this foundation is done.

## Step 1 screens — approved (`pages-finish-step1.review.answers.json`, 2026-10-24)

All ten screens approved, as built in the workbench on `session/90-pages-finish` (youcoded):
Page settings (top card, "What it can reach", "Websites it opens without asking"); gear on
each library card and beside an open page's name; the recipe approval card (`does` list,
"Nothing else there can be reached."); named sign-in parts (Plaid now uses them too); one
general "Together, this page could send…" amber line (`combinedRisk`); "Open this website?"
with a per-site "Don't ask again" switch; phone width. Follow-up applied from S-card-gear:
"Edit in chat" moved off the card into Page settings. Q-band-popup: the band gear opens the
same popup — recorded as an exception in the design guide. Backend still to build:
`pages.openWebsite`, `pages.forgetOpenSite` (mock-only), `does`/`parts`/`openSites` in main.

## The idea in one paragraph

A page should not have its own private copies of things the app already does. It is a
**window onto the app's own systems**: the same sign-ins, the same file access, the same chats,
the same assistants, the same marketplace — each one handed to the page through one approval
card and one settings window. Where the app is missing a system that a page needs (a scheduler,
spending limits, "Sign in with Google"), we build it **once, for the whole app**, and pages
become one of its users. That is what makes "build almost any app inside YouCoded" possible
without us building pieces for each page.

## The seven building blocks

| # | Block | What a page gets | Built on (exists today) | New, built once for the whole app |
|---|---|---|---|---|
| 1 | **Service recipes** | Reach any web service: public, pasted key, username+password, or a sign-in account | the key connection, its exact address/method rules, key storage, the re-ask rules | a recipe format; an `allow` list (method + path) for every recipe; multi-part secrets; bank, home, GitHub and YouCoded rewritten as ready-made recipes |
| 2 | **Accounts** | "Sign in with…" a service, using an account kept in Settings › Connected services | GitHub and YouCoded sign-ins, OpenRouter's sign-in method, the keychain store, card #155's Google work | one shared account store and sign-in engine for the whole app (pages, Google files, calendar all use it) |
| 3 | **Files** | pick a file; remember a file; one folder; full file access (read and write approved separately) | the Open/Save windows, Office's "page never learns the path" handles, the phone's secret-file block list | a file grant kind with the four levels; YouCoded does every read/write; the builder always picks the narrowest |
| 4 | **Chat in a page** | a real chat panel beside the page, bound to it, with the page's context; the assistant can change the page live | the chat view and composer (already take a session id), the buddy window precedent, the page-data tools, project instructions files | the chat panel extracted from the main window so it can sit in a page; a link from a page to its chats; the page-data tools for the app's own assistant (today only Claude Code has them) |
| 5 | **Assistants and automations** | assistants a page defines and runs: now, on a schedule (overnight), or as a hand-run workflow of several | helper definitions (charter + allowed tools), the hidden-conversation mechanism helpers use, the stop control | **the Agents & Automations runner (card #61)**: a job list, Run now, schedules, hidden runs, a "waiting for you" inbox — for the whole app; pages are its first user |
| 6 | **Spending limits** | a monthly limit per page, set in its settings | cost is already counted per reply for the status bar | a limit that actually stops work — for pages, automations, and optionally ordinary chats |
| 7 | **Sharing** | publish, install, update, make your own version, carry your changes onto updates, see all versions | GitHub publishing (themes, skills), commit-keyed scan status, pages already being git folders | a pages registry; `forkedFrom` lineage; an "update my version" assistant merge; a YouCoded publishing route for people without GitHub |

**One approval card and one settings window cover all seven.** Every block adds lines to the
same approval card (with the combined-risk line from deck 1) and a section to the same
per-page settings window, which replaces today's "N connections" dialog.

## How the pieces behave (what you would notice)

- **A page with a chat** (your YouCoded-Dev page): opening the page shows the page with a chat
  panel beside it, already in that project's folder with its instructions. You talk to it like
  any chat; it can redraw the page or change it. Those chats are ordinary chats — in your chat
  list, marked with the page's icon. Works with every model a normal chat can use, including the
  Claude subscription.
- **An autonomous assistant**: defined inside the page (name, what it does, what it may touch,
  which model, when it runs). It runs hidden — never in your chat list — and the page shows its
  results. Its runs are listed in the page's settings and in the app-wide automations list; each
  run's full conversation can be opened read-only.
- **A workflow**: several assistants in one page, with Run buttons the page draws; the page can
  run them in order, feeding one's result to the next.
- **When an assistant running unattended needs a yes**: it never waits forever and never
  silently says yes. Before it runs it has a list of what it may do; anything outside that list
  pauses the run as "Waiting for you", with a notification, and the request appears in the page
  and the automations list.
- **Money**: every page using the assistant has a monthly limit (its settings). Reaching it
  stops the work with a clear notice; it never warns and keeps going.

## Technical notes (for the builders)

1. **Kind registry.** Replace the five parallel `switch (c.kind)` blocks (`parseConnections`,
   `fingerprint`, `covers`, `methodAllowed`, `credentialFor`) with one registry entry per kind
   holding parse, fingerprint, door, wording and phone policy. Target: a new kind touches 2–3
   files, not 9–12. Do this first; everything else lands as entries.
2. **Recipes.** `web` kind = `{service, hosts[], auth: none|key|basic|multi|account, inject, allow[{method,pathPrefix}], test?}`.
   `public`/`key`/`youcoded`/`github` become recipes; `writePaths` becomes `allow`. Plaid =
   bundled recipe on `multi` secrets + host-held per-account tokens + browser sign-in (open URL
   then poll). Home = `local` recipe (address the person types) + a protocol profile for the live
   socket and video (message shape, deny list, transceivers, data channels from the profile).
   Existing manifests keep parsing (old kinds map to recipes) and existing approvals keep their
   fingerprints, so nobody is re-asked.
3. **Accounts.** One `AccountStore` in main (keychain secrets, refresh, per-device) behind
   Settings › Connected services; GitHub/YouCoded/OpenRouter/ChatGPT sign-ins registered there;
   desktop OAuth = PKCE + loopback. Pages ask `auth: account` with scopes; the grant is per page,
   fingerprinted by scopes. Coordinates with card #155 (paused: OAuth vs rclone).
4. **Files.** `files` kind with `level: pick|remember|folder|all`, `access: read|write|readwrite`.
   Picks are opaque handles (Office pattern), folders/all are mediated reads/writes in main with
   the phone deny list applied everywhere. Native Android = the phone's own picker; remote access =
   the computer's dialogs.
5. **Chat panel.** Extract `SessionChatPane` (ChatView + composer + status chips + send gate)
   from `App.tsx` so the page view and the main view mount the same thing. Page-bound sessions are
   ordinary sessions created with `cwd` = page or project folder and an owner label. Native
   page-data tools mirror `claude-code-pages-mcp.ts` (pattern: doc-comments tools).
6. **Runner (card #61).** A reusable session factory pulled out of the `ipc-handlers.ts`
   closure; an `owner` + `hidden` header field (generalising `sessionKind`); hidden runs excluded
   from the strip, Resume, phone snapshot, welcome-back, chat search, title/conversation feeders
   and sync; a persisted job store with Run now + schedules + missed-run policy; budgets as hard
   stops; a `needs-approval` inbox. Agents are definition files in the page folder (specialist
   format: charter, allowed tools, allowed folders, model). Background lanes: native providers,
   and Claude Code headless (`claude -p`, stream output) for subscription users.
7. **Spend.** Enforced in the harness where `costForUsage` is already summed, per owner (page,
   automation, optionally chat), stored next to the approval, per device.
8. **Sharing.** Monorepo registry (`wecoded-pages`, like themes); `page.json` gains `version`
   and `forkedFrom {id, version, commit}`; review status keyed by commit + rules version (catalog
   pattern); marketplace pages re-ask on code change; programs only in reviewed versions;
   "update my version" = git three-way merge with an assistant resolving conflicts, preview, undo.
   Publishing: the person's GitHub sign-in, or a YouCoded bot that opens the PR for people
   without GitHub. Self-hosting rejected for now (infrastructure is cheap; moderation and legal
   duties are not; GitHub gives review, history and forks free) — revisit for private/unlisted links.
9. **Security fixes first.** Popups: ask unless the site is approved (`PageHost.tsx:710`,
   `main.ts:747`). Forms: check whether a form can post out (`allow-forms`; CSP `form-action`
   does not inherit `default-src`). Name-server re-binding: pin the checked address
   (`net-guard.ts:6-7`).

## Proposed order (each step usable on its own)

1. Foundation: kind registry, recipes (your pages move onto them unchanged), security fixes,
   the page settings window, the combined-risk line. **Built 2026-10-24** (step 1 technical
   design). A phone's own browser cannot stop a page navigating its frame; the Android app
   and the computer can — stated, not hidden.
1b. Plaid and Home as bundled recipes: body-injected multi-part secrets, a host-held per-account
   token store, a browser sign-in flow, and device protocol profiles — so the last two built-in
   special cases become general mechanisms.
2. Files.
3. Chat in a page.
4. Assistants and automations runner + spending limits + background (card #61 joins here).
5. Accounts ("Sign in with…") — with or after card #155.
6. Sharing, basic: registry on GitHub, publish with a GitHub account, install, updates
   (marketplace pages re-ask on code change), "Not reviewed" label with clear risks.
7. Separate follow-up item: publishing without GitHub, versions/forks and "update my version",
   the AI reviewer, programs in shared pages.

Each step: screens on a review deck first, then a technical design with one review round,
then build, then Destin tries it in a dev window.
