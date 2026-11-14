---
status: draft
date: 2026-11-13
topic: The complete marketplace — units, kinds, finding things, curation, sentiment, safety
related-cards: 244, 245, 51, 52, 59, 63, 75, 77, 90, 130, 155, 202, 217, 225, 248
base: docs/active/specs/2026-11-13-marketplace-foundation-design.md (install record, engine, home)
---

# The complete marketplace — product design (draft)

Destin, 2026-11-13: "the purpose of this design is to more thoughtfully design/think-through and
build-out the final, completed, ideal version of my marketplace vision" — including Pages, the
units of organization, filtering and sorting, curation of top listings, sentiment and safety
tracking, how elements of plugins connect, and what the units of a plugin are. His standing goal
(2026-08-27): "the gold-standard/frontier of sharing ai capabilities … maximum
transparency/manageability/availability, ability to see how others feels about various items,
safety/security warnings and verifications".

The foundation design (install record, transaction engine, app-owned home) is the layer under
this one and is unchanged by it. This document is the layer users see.

## Where it stands today (measured 2026-11-13)

- The live catalog is about 4,156 rows (2026-08-31 count); the bundled fallback list is 369.
  Default order is alphabetical by id. No ranking exists anywhere.
- Three separate registries with three row shapes: plugins (catalog), themes (8), sign-in
  connections (9). A fourth is planned for Pages.
- Three overlapping topic schemes, all nearly empty or unused: `category` (16 values, never
  shown), `tags` (9 of 369 rows), life areas / "Vibe" (10 rows).
- "Most installed" and "Newest first" sort on fields the rows do not carry.
- A skill is shown as its own card but installed, updated, removed, rated and turned off per
  plugin. Tool servers in `mcp-manifest.json` are missed by the catalog.
- Sentiment: Helpful / Not for me votes, comments, theme likes, first-install counts from
  signed-in users only. Not recorded: removals, active installs, real use, failures, versions.
- Safety: four file patterns checked hourly, latest commit only, no history, no person, no AI.
  No report path for a listing or a comment. No admin screen.
- Dependencies live in prose. Operating-system limits are written four ways.
- A Page has no version, author or fingerprint.

## 1. Units

Three levels, each with one job. Every screen uses the same three.

| Level | What it is | What happens at this level |
|---|---|---|
| **Listing** | One thing an author publishes | Install, update, remove, turn off, rate, comment, report, safety verdict, version, author |
| **Part** | One usable piece inside a listing | Shown where it is used; switched on or off (everywhere, or per project — #75) |
| **Collection** | A named list of listings | Browse, share, "install all"; installs nothing by itself |

**Part types** (closed list, one vocabulary in manifests, catalog and UI):
skill · command · specialist · tool connection · automation (hook) · page · theme · style ·
prompt · knowledge (files the assistant may read) · setup step. A bundled program is not a part;
it is a disclosed ability ("runs a program on your computer").

**Kind is derived, never authored.** A listing with one part is named by that part (a Theme, a
Page, a Skill, a Specialist, a Prompt). A listing with several is a Plugin. Collections that
also carry settings are Setups (#63 i; `HarnessManifest`).

**Rules that follow:**
- Rating, comments, reports and the safety verdict belong to the listing, never to a part —
  one author, one version, one body of files.
- A part card always says "Part of X" and opens X (Destin, 2026-04-21). It never has its own
  Install button; it has "Get X" and, once installed, an on/off switch.
- "Install one item out of a bundle" is answered by install-then-choose: the listing installs
  whole, the user picks which parts are on. Files are small; a partial install would create
  listings whose installed content matches no scanned version.
- Favourites, chips and per-project switches all key on part ids (`listing:part`).

## 2. One catalog for every kind

Plugins, themes, pages, sign-in connections, specialists, prompts and setups become rows of one
catalog with one row shape, fed by source adapters (the plugin repo, the themes repo, a pages
repo, outside lists). The separate theme and integrations registries become adapters; their
screens become views of the one catalog filtered by kind.

Row (all derived from the listing's files at one commit unless marked):
`id, kind, parts[], author, displayVersion, contentId, changesUrl, topics[] (classified),
audience (classified), requires{}, worksWith[], abilities[], platforms[], engines{},
preview[] (generated), scan{} (per version), signals{} (from the Worker), editorial{} (hand)`.

**One manifest vocabulary for relationships** (replaces `recommends`, `provides`,
`optionalIntegrations`, four spellings of the operating system):
- `requires.platforms` — one word list: windows, mac, linux, android.
- `requires.app` — minimum app version.
- `requires.accounts` — a connected account by kind (google, spotify, todoist-key…).
- `requires.programs` — something that must be on the computer (python, docker).
- `requires.listings` — another listing.
- `worksWith` — soft links, both directions; drives "Works with" and "Because you have X".
- `provides` — named abilities other listings can ask for (calendar, tasks, mail), so a Page
  that needs "a calendar" is satisfied by Google or Apple.

The install engine enforces `requires`: it offers to connect the account, install the needed
listing, or explains why this device cannot run it. Nothing is implied in prose.

**Connected accounts are the app's, not a listing's** (#155–#159): sign-ins and keys are held by
the app's secure store, with health and permissions in one Connected accounts screen. Listings
ask for an account; they do not keep their own token files. Key entry (Todoist) is the first
case. Existing plugin-owned token folders migrate one plugin at a time.

**Engines.** Each row carries, per part type, whether it works under Claude Code, YouCoded's
engine, and later other assistants. The page says so in one line. Parity work: commands, tool
connections and specialists under YouCoded's engine first; an automation runner after; exports
to other assistants' folders (Codex / AGENTS.md conventions) as further adapters.

## 3. Building on each other's work ("GitHub for normies")

Destin's words this section is built from:
- 2026-10-06 (dictated; `docs/archive/design/2026-10-12-management-surface/destin-words.md:16`):
  "I want it all to basically work like GitHub for norms … take a page that they download from
  the marketplace. fork it, customize it, rearrange it, whatever, um, and have their own
  version, and then publish their own version of the marketplace if they want. And maybe have
  those linked somehow … show on one page like all given pages that are like a variant of it.
  Or like the parent pages … I want people to be able to report bugs for pages and marketplace
  plugins. And I want marketplace to host really like anything."
- 2026-10-24 (Pages deck, Q-edits): "some sort of clear forking/reconciliation mechanism that
  allows users to modify and customize pages while still at least being informed of
  changes/updates to the original page with the ability to 1) trace all forks/variants of
  different pages in the marketplace 2) rebase your page agentically on an updated upstream
  version".
- 2026-10-24 (Q-publish): "the entire foundation of the marketplace, as it stands now, is
  github. if we were to consider hosting our own marketplace content, we really need to
  consider the costs/risks".
- 2026-10-06: "make cool free shit and share that free shit with each other and make that free
  shit better."

Git stays underneath and is never shown. Each git idea gets one plain action:

| Git idea | In the app | What it does |
|---|---|---|
| fork | **Make it mine** → "Your version" | Any installed listing, of any kind, can be changed — by hand or by asking the assistant. The record keeps what it came from (`basedOn {id, version, contentId}`). |
| history | **History** | Every change to an installed listing is a restorable point, "like any other typical version history menu". Works for the author's updates and your own edits alike. |
| upstream changed | **Update and keep my changes** | You are always told when the original changes. The assistant carries your changes onto the new version, shows a preview, and can be undone. Also offered: Replace with the new one, Keep mine. |
| publish a fork | **Publish my version** | Your version becomes its own listing, linked to its parent. Credit to every author up the chain is automatic and cannot be removed. The parent's licence must allow it; if it does not, your version stays private. |
| network graph | **Family** | Every listing page shows Based on (its parents) and Versions by others (its variants), ranked like anything else. One page traces the whole family. |
| pull request | **Suggest to the author** | Send your changes back to the original. The author sees a plain summary of what changed, tries it, and accepts or declines; accepted work is credited. |
| issue | **Report a problem** | A bug report to the author, separate from a safety report to us. Open problems are counted on the page. |

Rules that make this safe and honest:
- A published version is a listing in its own right: scanned and reviewed as itself, with its
  own votes and comments. "What we checked" adds **How it differs from the original**, written
  by the AI reviewer from the actual difference, and flags any ability the parent did not have.
- Ratings never transfer from parent to variant. Family size and "N people built on this" are
  signals for the parent's ranking.
- Variants are grouped under their original while browsing ("12 versions") unless a variant
  outranks it; search can open the family flat.
- A variant of a turned-off listing is reviewed before it stays up.

**Where published work is stored.** GitHub remains the store. Three ways for a person without a
GitHub account to publish, with the cost and risk he asked for:
- *YouCoded submits it for them* (recommended): the app sends the files under the person's
  YouCoded account; a YouCoded-owned GitHub organisation holds them. Cost: none for storage;
  our time moderating. Risk: we become the named host of what people publish (takedown
  requests come to us), and a wave of junk needs per-account limits and review-before-public.
- *GitHub account required* (today's decision for Pages): no hosting duty, but it shuts out
  exactly the people this is for.
- *Our own storage*: full control; a real monthly cost that grows with every published item,
  and we carry backups, abuse and availability ourselves. Not justified while GitHub is free.

**"Host really like anything."** A Page or plugin that needs its own program, database or
server declares it under `requires.programs`; the install engine's later adapters (Docker,
local services) start it on the person's own computer. Hosting other people's servers for them
is not designed here: it is a running cost per listing and a different business.

### How updates treat a copy you changed

One rule for every kind:

- The record keeps the `contentId` it installed. If the files on disk no longer match, the item
  is **Your version** (`basedOn {id, version, contentId}`, the same field the Pages plan calls `forkedFrom`).
- When the author updates: an unchanged copy updates like anything else. A changed copy offers
  **Update and keep my changes** (three-way merge; falls back to the next two when it cannot),
  **Replace with the new one** (old copy kept in history), **Keep mine**.
- Anything local can be published from the app: pick it, the app packages it, checks for
  secrets, and submits under the signed-in account. No GitHub knowledge needed (#202); GitHub
  remains the store behind it. Publishing a changed copy of someone else's listing publishes a
  fork that names its origin.

**Pages specifically** (#90, #202, #217): a Page listing is its folder (`page.html`,
`page.json`, `page.md`) at a commit, with `version`, author and `contentId`. Its declared
connections are its abilities and appear under "What this can do". Approvals already keyed to a
code fingerprint become approvals keyed to the listing version, so an update that adds a
connection asks again (section 6). Data (`data.json`) is never part of a listing and never
replaced by an update. Shared Pages run behind the separate walled address (#217) before the
kind opens to the public. Built-in Pages (Office, Automations) are `origin: builtin`.

## 4. Finding things

**Facets** (every one filled by machine for every row; hand overrides allowed):
- **Kind** — Plugins, Skills, Specialists, Connections, Pages, Themes, Prompts, Setups.
- **Topic** — one list of about twelve plain topics replacing category, tags and life areas
  (for example: Writing, School, Work, Money, Home, Health, Fun, Research, Design, Coding,
  Data, Automation). Assigned at ingest by an AI classifier reading the listing; stored with the
  commit so it cannot drift; a hand override wins.
- **Audience** — Everyday or Coding. Most of the 4,156 imported rows are developer tools; the
  app serves students and professionals. Browsing opens on Everyday with Coding one tap away.
- **Runs here** — on by default. Items this device cannot run sit last with the reason
  (Destin, 2026-11-01), never hidden from search.
- **Needs** — nothing, an account, a key, a paid service.
- **Safety** — checked only.
- **Works without Claude Code.**

**Sort**: Recommended (the ranking in section 5), Most used, Best rated, Newest, Recently
updated — each backed by a real field in the row.

**Search** is one ranked service in the Worker: name, tagline, description, part names and part
descriptions (generated where the author wrote none), topic words and synonyms. The same
service is the assistant's marketplace search tool (#52), so "check what we already have" and a
person typing in the box get the same answer. A match on a plugin and its parts returns the
plugin once, with the matching parts named under it.

**Library** gains search, the kind filter, an always-present Updates tab, and **Needs
attention**: Caution since install, broken account, cannot run here, no longer listed, turned
off for safety. Later: "not used in 60 days".

## 5. Curation that maintains itself

Destin, 2026-08-28: "how can we make this self-maintaing?" The featured list was last edited in
April and its first slot is wrong (#51).

**A quality bar.** A listing is **Showcased** when it is checked, runs on at least one desktop
system, has a description and a preview, and is either hand-picked or has earned signals
(below). Browsing shows Showcased listings; everything else is reached by search, by a filter,
or by "Show everything". Uninstallable rows (the 77 Docker tools) fall below the bar by
definition and stay findable by name.

**A ranking** (one formula, published on a help page, used for Recommended and every generated
rail): retained installs (still installed after 7 and 30 days) · helpful share with a small-
numbers correction · recent growth · health on the current version · minus early removals and
upheld reports. Counts only install-verified, rate-limited signals.

**Rails** are of two sorts:
- **Generated**: Popular this week, New and rising, Top in each topic, Because you have X
  (from `worksWith`), Updated recently. They refill themselves.
- **Hand-picked**: "Destin's picks" and themed sets. Each pick carries a date and an expiry; an
  expired or broken pick drops out and shows in the admin queue instead of failing silently. A
  pick must be Showcased-eligible (no "Not checked" items in the hero).

**Collections**: anyone signed in can make a named list and share it by link; a Setup is a
collection plus settings that installs as one step (#63 i). Popular collections can be picked
into rails.

**Listing pages** all have the same sections: preview · What it does (author) · What's inside
(parts) · What this can do (abilities) · Needs · Works with · What changed · What we checked ·
How people find it (votes, health) · Comments · Similar · Source and licence. Previews are
generated: real pictures for Pages and themes (#130), "Try asking…" examples for skills.

## 6. Sentiment and safety

**Sentiment**
- Helpful / Not for me stays. A vote records the version it was cast on; the page shows "on
  this version" beside all-time once numbers allow. "Not for me" offers one optional reason
  (didn't work · not what I expected · hard to set up · seems unsafe); "didn't work" and "seems
  unsafe" feed health and reports.
- Comments: delete your own, report another's, author replies marked as the author, the
  version shown on each. Flagged comments are hidden pending review as today.
- The dead star-review routes are removed.

**Signals the store lacks today** (each is a count per listing and version, never content):
installs and removals; active installs; early removals; install, update and setup failures;
whether a part was used at all in a week. Health = share of recent installs and updates on a
version that succeeded and stayed. A version whose health collapses is held back from further
updates automatically and raised in the admin queue.
*How these are collected is Destin's privacy decision* — `PRIVACY.md` today promises that
without sign-in nothing is reported.

**Safety — one ladder, one vocabulary**

| Step | What it means | Label |
|---|---|---|
| 0 | Nothing read | Not checked |
| 1 | Files scanned by rule on this exact version | Checked |
| 2 | An AI reviewer read this version and compared what it does with what it claims (#245) | Reviewed |
| 3 | A person at YouCoded reviewed it, or YouCoded made it | Verified by YouCoded |

Caution overrides any step. The Worker keeps the verdict for every version it has scanned, so
an installed older version can be judged as itself.

- **Abilities are permissions.** "What this can do" is shown before install. An update that
  adds an ability (starts running programs, reaches a new account) is never applied silently:
  the Update button says what is new and asks. This generalises what Pages already do.
- **Publishers**: an author page (their listings, how long they have published, upheld
  reports). "Verified publisher" means the account provably controls the source — a fact, not
  an endorsement.
- **Reports**: report a listing, a comment or a publisher. Enough independent reports hide a
  comment, or mark a listing for review, until a person decides. An admin screen (in the
  existing dashboard) holds the queue: reports, held comments, expired picks, failing versions,
  health collapses.
- **Off-switch**: per listing or per version, as shipped 2026-11-05.
- Later steps on the same ladder: known-vulnerability checks on bundled dependencies; scanning
  Docker images once that adapter exists.

## 7. The assistant and the phone

- The assistant can search the marketplace and propose an install; the person approves it in
  the usual permission card. It is told to look there before building something new (#52).
- Every operation works from the phone under the 2026-10-01 rules. The phone layout (#225)
  uses the same facets and rails in a single column.

## 8. Build order

One branch per repo; each phase leaves the app shippable.

1. **Foundation** — record, engine, app-owned home, updates that work (foundation design).
2. **One catalog** — unified row, kinds and parts, `requires` / `worksWith`, platforms in one
   vocabulary, tool servers detected, real fields for sorting, part descriptions.
3. **Finding** — facets, topics and audience classifier, ranked search, Library search and
   Needs attention, listing page sections.
4. **Trust** — verdict history per version, abilities on update, reports, admin queue,
   comment delete/report, publisher pages, the label ladder; then the AI reviewer.
5. **Signals and curation** — new counts (per the privacy decision), health, ranking,
   generated rails, pick expiry, Showcase bar.
6. **Kinds** — connected accounts and key entry; Pages as listings (after the Pages branch and
   #217 land); editable-kind updates; publish from the app; specialists, prompts, setups,
   collections; then Make it mine, History, Family, Suggest to the author and Report a problem
   (section 3) for every kind.
7. **Engines** — tool connections, commands and specialists under YouCoded's engine; the
   automation runner; other assistants' folders.
8. **Assistant search; phone layout.**

Not designed here: paying authors (tip jar). The publisher page is where it would attach.

## Open (technical, for review rounds)

- Classifier and AI reviewer: which model, cost per version, and how a verdict is stored so it
  is a function of the commit.
- Search: Worker-side index for 4,000+ rows and their parts; offline fallback.
- Whether Pages publish into the marketplace repo or their own; either is one adapter.
- Three-way merge for single-file Pages: quality threshold before offering it.
