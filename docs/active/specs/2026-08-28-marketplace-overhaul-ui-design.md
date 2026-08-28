---
status: active
date: 2026-08-28
tags: [marketplace, wecoded, plugins, skills, mcp, trust, feedback, ui]
strategy: docs/active/investigations/2026-08-27-marketplace-strategy.md
decks: docs/active/design/2026-08-27-marketplace-overhaul/
branch: youcoded feat/marketplace-overhaul-ui (worktree worktrees/marketplace-ui)
---

# Marketplace overhaul — approved UI design (2026-08-28)

The user-facing shape of the marketplace overhaul (strategy doc §4, Layers A–D),
approved by Destin over three review decks on 2026-08-27/28. Everything below is
**final for the build**; the backend is designed around it. The mockup lives on the
branch named in the frontmatter, in the workbench, against invented data.

## 1. What a user sees

### 1.1 One screen, two modes (unchanged)
Discovery (nothing filtered): hero → filter bar → integrations rail → curated rails →
"Explore everything" grid. Search (anything filtered): filter bar → results grid.

### 1.2 Filter bar — one row, never wraps
`[All 42 | Plugins 28 | Skills 22 | Specialists 5 | Connections 5 | Prompts 2 | Themes 7]  [Any vibe ▾] [Everything ▾]            [Search…]`

- **Type switch** — the shared pill (same control as the Library's Plugins | Themes).
  Six kinds + All. Counts: a kind counts every row of that kind *including* members
  of bundles; **All counts only what the grouped grid shows** (bundles + standalone
  items + themes), so both numbers say what you will see.
- **Vibe** — dropdown, pick one: Any vibe · School · Work · Creative · Health ·
  Personal · Finance · Home. (Was seven pick-many chips; pick-many is gone.)
- **Show** — dropdown, pick one: Everything · Featured picks · Newest first · Most
  installed. (Was three toggle chips New / Popular / Featured picks.)
- **Search** shrinks first when the window narrows (min 9rem); the bar itself never wraps.
- **Phone (≤640px)**: the sticky bar is the search pill with the Filters trigger; the
  Filters sheet stacks Type (a sideways-scrolling row *inside* the sheet's padding),
  Vibe and Show as full-width dropdowns, then Apply.

### 1.3 Words
| Internal | User-facing | Why |
|---|---|---|
| `plugin` | **Plugin** | a bundle of things |
| `skill` | **Skill** | |
| `specialist` | **Specialist** | the app's existing word for an agent definition (Permissions) |
| `tool` (MCP server) | **Connection** | Destin 2026-08-28: "Connections for now" — non-MCP tools may come later; the detail page's fine print may still say "MCP server" |
| `prompt` | **Prompt** | CLAUDE.md / rule-file snippets |
| theme | **Theme** | separate registry, unchanged |

Commands and hooks are **not** kinds — they only exist inside a plugin.

### 1.4 Grouped when browsing, split when looking for something specific

A typed search shows members **and** bundles — approved (R1-5): typing "brainstorm" should find
the Brainstorming skill *and* Superpowers. What must **not** happen is a search for a bundle's
own name returning that bundle plus all fourteen of its members, which is what happens if
member rows carry a "Part of <bundle>" description. The catalog therefore leaves member
descriptions empty (§5) rather than the screen de-duplicating after the fact — the fix belongs
to the data, not the filter.
| Where | What a card is |
|---|---|
| All / discovery (hero, rails, Explore everything) | one card per **bundle** or standalone item; members of bundles never appear |
| A type tab | one card per row **of that kind, members included** |
| Typed search | members included (typing "brainstorm" finds the Brainstorming skill *and* Superpowers) |
| Vibe / Show only, no type, no text | grouped (bundles) |
| Inside a bundle's detail → What's inside | each member row opens **that member's own page** (with its own Install); rows without a catalog row fall back to the file viewer |

A member card carries a **Part of Superpowers** tag that jumps to the bundle. A member
counts as installed when its bundle is (per-item install is a follow-up, §5).

### 1.5 Card anatomy (wide)
```
Title ……………………………………………  [INSTALLED] [★]      ← star / ⬇ / spinner INLINE, not floating
Skill                                            ← kind only, only for non-plugin kinds
[🛡 Likely safe] [✦ YouCoded] [👤 @destin]         ← badge row: safety · origin · author
Blurb, two lines reserved even when one          ← keeps every card in a row the same shape
[Part of Superpowers]                            ← members only
Uses the internet · Needs a key                  ← risky abilities as WORDS, own line, only if any
👍 93%   ⬇ 412                    1 skill · 1 command   ← feedback left, contents right
```
- Phone / compact: same, the safety chip shows only its shield, the abilities line is
  hidden (the detail page carries it), the author chip carries the author.
- Known limit, accepted 2026-08-28: three chips do not fit a **rail** card — the author
  chip truncates to "@de…" (full name on hover). Grid cards and phones fit.

### 1.6 Two trust signals, never a score
| Badge | Values | Look |
|---|---|---|
| **Safety** (automatic check of *this version*) | **Likely safe** · **Caution N** · **Not checked** | grey shield-tick · amber shield-! · empty grey shield. Grey for "not checked" on purpose — most mirrored items start there. |
| **Origin** (who published) | **YouCoded** · **Verified** · **Community** | sparkle · shield-check · two-people icons |
| **Author** | the publisher's name | person icon; "Published by …" on hover |

Hover on any chip gives a one-sentence explanation (e.g. *"Likely" because no check is
perfect — see What this can do*). Touch has no hover: a tap explanation is a follow-up (§5).

> **Open question, raised 2026-08-28 by the plan review — needs one more look before build.**
> The decks showed a healthy mix of Likely safe / Caution / Not checked, because the fixture
> data was invented. The real ratio is not that. The scanner reads files only for our own
> ~2,600 rows and the 257 cursorrules; Docker, awesome-copilot and everything else mirrored
> arrives `unchecked` — so **roughly half the catalog, and nearly every card in the mirrored
> sources, will carry the grey shield.** A grid of grey shields may read as "this marketplace
> is unsafe" rather than "we haven't looked yet".
>
> The alternative is to render **no** shield when the status is `unchecked`, so the badge only
> ever appears when it has something to say, and its absence is the neutral state. That is a
> reversal of an approved decision, so it is written here as a question rather than a change:
> it wants one small deck against real ingest data. Nothing else in the design moves either
> way. (The `@de…` author-chip truncation on rail cards was approved on its merits — R3-2 —
> and is *not* being reopened.)

### 1.7 Detail page
```
Title                                   [★] [share] [Install | Uninstall]
Plugin                                   ← kind
[🛡 Likely safe] [✦ YouCoded] [👤 @destin] from anthropics/claude-plugins-official · Part of Superpowers →
Tagline
WHAT THIS CAN DO                         ← BEFORE the description
┌ 🌐 Connects to the internet · api.congress.gov
│ 🔑 Needs a Congress.gov key · CONGRESS_API_KEY
│ 📁 Saves reports to your Encyclopedia
│ ⊞ Adds 1 skill and 1 command
│ ── The automatic check flagged: (Caution items only)
│ • Downloads and runs a helper program the first time it is used
└
#tags  vibe  audience
ABOUT
WHAT'S INSIDE  (members are links to their own pages)
FEEDBACK  Helpful 93% · 127 votes            [👍 Helpful] [👎 Not for me]
  comments (avatar · handle · relative date), newest first        ← no Report in v1, see §5
  [comment box]                                                [Post comment]
Source: repo · MIT · pinned to 4f1c2a9
```
- "What this can do" is **computed from files**, never author-declared; an item with
  nothing risky says so ("Adds instructions only — no commands, no internet, no files
  outside its own folder") rather than showing nothing.
- Caution findings live inside the same box; Install is **not** blocked.
- **Feedback replaces Reviews.** Stars, the review form and the star widget are removed.
  Voting needs install + sign-in (one vote per account, same rule ratings had). Commenting
  needs sign-in only, so a question can be asked before installing. Existing star reviews
  are not shown (there are almost none).
- Footer states the licence and the exact upstream commit the listing is pinned to
  ("an author can't swap the files after we checked them").

## 2. Data contract the UI needs (what the catalog must produce)

`SkillEntry.catalog?: CatalogMeta` — `desktop/src/shared/catalog-types.ts`:

| Field | Meaning | Who computes it |
|---|---|---|
| `itemType` | plugin · skill · specialist · tool · prompt | catalog, from the files |
| `partOf?` | `{id, displayName}` of the bundle a member belongs to | catalog |
| `origin.tier` | youcoded · verified · community | catalog: our repos → youcoded; MCP-registry namespace proof or GitHub org match → verified; else community |
| `origin.mirroredFrom?` | source name shown as "from …" | catalog |
| `scan.status`, `checkedAt`, `findings[]` | Likely safe / Caution / Not checked, per version | scanner (SkillSpector + Cisco skill-scanner + OSV + secret-content) |
| `capabilities[]` | `{kind: shell|network|secret|files|auto|adds, label, detail?}` in plain words | catalog, from hooks / scripts / MCP config / declared secrets |
| `license?`, `sourceCommit?` | SPDX id; pinned upstream commit | catalog |

Absent block = "a plugin, community, not checked" and every new surface hides itself,
so today's registry keeps loading.

Feedback (Worker): `/stats` plugins gain `thumbs_up`, `thumbs_down` and themes gain
`installs` (theme cards sit in the same grid as plugin cards, which show a download count);
new routes `GET /comments/:id`, `POST /comments`, `POST /thumbs` (value up · down · null),
`GET /thumbs/:id` (the caller's own vote, so the buttons do not forget it between visits).
A vote below **5 total** shows a count — "3 of 4 people found this helpful" — not a
percentage; one up-vote is not "100%". Shapes
in `desktop/src/renderer/state/marketplace-api-client.ts` and the workbench fake
`desktop/src/renderer/dev/workbench/fixtures/marketplace/worker-api-mock.ts`.

Member ids are `<bundle>/<name>` — the real scheme, fixed by the catalog design.
**Consequence for every route that takes an id:** a member page's Feedback section calls
`/comments/superpowers/brainstorming`, which is **two** path segments. A single-segment
route (`:plugin_id`) will not match it, and `isPublicReadPath` rejects it, so a skill's own
page would show a comment box that 404s on desktop and is CORS-blocked on Android. Both the
feedback routes and `/catalog/:id` must accept one **or two** segments. (`validateId` itself
is length-only — 1–128 chars — so the ids are fine; it is purely the route shape.)

## 3. Decision ledger (three decks, 20 steps)

| # | Step | Answer | Note / consequence |
|---|---|---|---|
| R1-1 | Type switch (7 kinds) | yes | "keep the container to a single row; collapse the other toggles into dropdowns" → R2-1 |
| R1-2 | Card trust badges | other | "Checked → grey shield-tick 'Likely Safe' with hover/click explanation; card layout needs cleanup; globe/key icons unclear" → R2-3, R2-4 |
| R1-3 | Card bottom row (thumbs, glyphs) | other | see R1-2 |
| R1-4 | Skills tab = split view | other | "need to clean up cards a tad" → R2-5 |
| R1-5 | Search finds the skill | **yes** | |
| R1-6 | Detail: trust line + What this can do | **yes** | "i like this quite a bit" |
| R1-7 | Caution findings in the same box | **yes** | |
| R1-8 | Feedback replaces Reviews | **yes** | |
| R1-9 | Phone: scrolling type row | other | "collapse to dropdowns; the type row expands beyond the card edge" → R2-6 |
| R1-10 | Name for MCP servers | **Connections** | "hard cuz we'll add non-MCP tools later; good enough for now" |
| R2-1 | One-row filter bar with two dropdowns | **yes** | vibe became pick-one |
| R2-2 | Connections | **yes** | |
| R2-3 | Shield "Likely safe", first | **yes** | "show a download icon next to 412; the star in-line with INSTALLED" → R3-1 |
| R2-4 | Card anatomy (words not glyphs, 2-line blurb) | **yes** | |
| R2-5 | Same card in the split view | **yes** | |
| R2-6 | Phone sheet | **yes** | |
| R2-7 | Detail badges | **yes** | "make author a chip like Likely safe / YouCoded on all surfaces" → R3-2/3 |
| R3-1 | Star beside INSTALLED; ⬇ 412 | **yes** | |
| R3-2 | Author chip on cards | **yes** | "@de…" truncation on rail cards accepted as-is |
| R3-3 | Author chip on detail | **yes** | |

Rejected along the way (do not re-propose): green-dot "Checked" badge; capability
glyphs on cards; vibe/meta chips in the bar; "Tools" as the MCP word; star ratings.

## 4. Surfaces touched (branch `feat/marketplace-overhaul-ui`)
- `components/marketplace/MarketplaceFilterBar.tsx` — type switch, dropdowns, phone sheet; `FilterState` is now `{type, vibe, view, query}`.
- `MarketplaceScreen.tsx` — grouped/split rule, member badge, `onNavigate` to the overlay, installed-via-bundle.
- `MarketplaceCard.tsx` — anatomy above; star inline; `InstallFavoriteCorner` gained `inline`.
- `MarketplaceDetailOverlay.tsx` — trust line, `CapabilityList`, `FeedbackSection`, member navigation, licence/commit footer.
- New: `TrustBadges.tsx` (Scan/Origin/Author), `CapabilityList.tsx`, `FeedbackSection.tsx`, `CommentList.tsx` (from ReviewList), `type-icons.tsx`, `shared/catalog-types.ts`.
- Removed: `StarRating.tsx`, `RatingSubmitModal.tsx`, `ReviewList.tsx` and their tests; `tests/filter-chip.test.tsx` re-pinned (the bar no longer uses chips; the drawer still does).
- `App.tsx` — Library → Marketplace hands over `'plugin'` (was `'skill'`, which now means Skills).
- Workbench: `fixtures/marketplace/catalog.ts` (invented catalog rows + feedback), `worker-api-mock.ts` (fake Worker; also stops the workbench hitting production for stats), `mock-shim.ts` serves `buildCatalog(...)`.
- Review rig: `scripts/ui-review/plans/marketplace-overhaul{,-narrow}.json`.

## 5. Deferred (ROADMAP entries)
- Per-item install of a bundle member (today installing a member installs its bundle).
- **Report a comment.** The Worker's `reports` table is keyed to a *rating*
  (`rating_user_id`, `rating_plugin_id`), so it cannot take a comment id without a schema
  change. Rather than ship a button that does nothing, v1 renders **no** Report affordance on
  comments; the AI classifier still hides flagged text at post time.
- **Delete your own comment** — reviews had it (`marketplace:rate:delete`); comments ship
  without it on every platform.
- **Real descriptions for bundle members.** A member's description is deliberately **empty**
  in v1: filling it with "Part of Superpowers." made searching a bundle's name match every one
  of its members, so typing "superpowers" returned the bundle plus fourteen near-identical
  cards. The card's `Part of X` chip already carries that fact. Real text comes from each
  `SKILL.md`'s frontmatter once the ingest can afford ~2,000 extra fetches.
- Tap-to-explain for the badges on touch (hover-only today).
- Edge fade on the phone sheet's scrolling type row.
- The `'skill'`→`'plugin'` handover means Library's "browse marketplace" lands on Plugins; confirm Android's Library does the same.
- Ranking inside a type tab / search (registry order today); duplicates when a word matches a bundle and its members.
- Comment moderation (reuse the review classifier) and the Report button's backend for comments.
- Orphaned star-review rows in the Worker DB.

## 6. What happens next
Implementation plan (writing-plans) for Layer A (catalog in D1 + sync + scanner) and
the Worker routes, then wire the UI to the real data and drop the workbench fakes.
