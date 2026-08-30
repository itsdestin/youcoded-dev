---
status: shipped
date: 2026-08-28
tags: [marketplace, review, catalog, feedback, plans]
reviews:
  - docs/active/investigations/2026-08-27-marketplace-strategy.md
  - docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
  - docs/active/plans/2026-08-28-marketplace-feedback-worker.md
  - docs/active/plans/2026-08-28-marketplace-catalog-service.md
  - docs/active/plans/2026-08-28-marketplace-app-wiring.md
note: the last two plans above were consolidated 2026-08-30 into docs/active/plans/2026-08-30-marketplace-overhaul-remaining-work.md
applied: 2026-08-28
---

# Review of the five marketplace-overhaul documents (2026-08-28)

> **All findings below were applied to the four other documents on 2026-08-28**, plus two new
> `bug` entries and a rewritten overhaul note in `ROADMAP.md`. This file is the audit trail —
> the reasoning behind those edits, and the measurements that justify them. It is not a
> to-do list.
>
> What changed, in one line each: strategy doc counts re-measured and the "show all" decision
> reversed · spec gains the member-id routing consequence, drops the dead Report button, defers
> comment delete · Plan 1 gains a rate-limiter gate (Task 0), a two-segment `/comments` route,
> and a relaxed URL rule · Plan 2 loses the MCP Registry source (and `slice`, delta runs,
> `noRetire`, `last-run`) and gains the merge rule, ETag/304, the `CATALOG_ENABLED` kill
> switch, HEAD resolution and the change-skip · Plan 3 loses the `?? sourceSha` fallback and
> gains ETag handling on both platforms, a cycle guard, and verifications that verify.

Everything below was checked against the actual code today. Where I state a number, the
command that produced it is named. Where I could not check something, I say so.

---

## Verdict in one paragraph

The **UI spec is the strongest document of the five** — the decision ledger, the list of
things already rejected, and the rule that "what this can do" is computed from files and
never taken from the author's own description are all genuinely good, and the fallback
design (an item with no catalog block just renders as it does today) means the app can't
break if the backend is late. **Plan 1 (thumbs + comments) is close to shippable** — three
real problems, all small. **Plan 3 (app wiring) is sound but contains one change that would
quietly stop plugins from ever updating.** **Plan 2 (the catalog) is where the trouble is**:
it is roughly twice as much machinery as the approved UI actually needs, and about half of
that machinery is in service of one source (the 25,000-server MCP Registry) whose entries
nobody can install, nobody can rate, and nobody can safety-check. Cutting that one source
removes most of the plan's risk and most of its cost.

---

## 1. The seven things that would actually be felt by a user

Ordered by how much damage they'd do, worst first.

### A. Plugins would stop getting updates (Plan 3, Task 2) — the most serious one

**What the plan does:** when you install a plugin, instead of taking whatever the author has
published right now, the app checks out the exact version the catalog recorded.

**Why that's a problem here:** the catalog gets that version number from `sourceSha`, a field
`sync.js` already stamped into `index.json` — and the ingest code re-uses that same stale
field instead of looking up the author's current version. **236 of the 302 live entries
already carry a `sourceSha`** (`python3 -c` over `index.json`). So those 236 would freeze at
whatever commit was recorded whenever `sync.js` last ran, and stay frozen.

Today they don't freeze: `installFromUrl` does a plain shallow clone with no version, so you
get the author's latest. After this change you'd get a snapshot — and the **Update** button
(which the in-flight `fix/bundled-plugin-upgrade` branch exists specifically to make work)
would re-fetch the same frozen snapshot and report success while changing nothing.

**What a user sees:** "I clicked Update and it says it updated, but the plugin is the same
old version." That is exactly the kind of change that's impossible to trace back to this
work.

**Fix (small):** the ingest must resolve the repo's *current* HEAD every run and store that
as `sourceCommit` — that's the whole point of "an author can't swap the files after we
checked them", and it only holds if we re-check hourly. And drop `?? entry.sourceSha` from
the installer fallback: an entry with no catalog block should keep today's behaviour
(latest), not silently pin to a months-old commit.

### B. Listings would appear and disappear on their own (Plan 2, Tasks 3 and 10)

Three separate versions of the same underlying flaw: **a partial or rate-limited ingest run
overwrites good data with worse data.**

1. Whether an MCP-Registry listing is shown at all depends on its GitHub star count. The star
   count is looked up fresh every run, capped at 400 lookups. On an hourly "changed items
   only" run, a popular server that got updated is re-normalised with **no star count in
   hand** → it drops below the bar → `slice = 0` → **it vanishes from the marketplace** until
   some later run happens to look it up again.
2. The safety badge works the same way. If the run can't read a plugin's files (GitHub rate
   limit — see E), the code correctly refuses to claim `checked` and writes `unchecked`
   instead. But it *overwrites* the previous `checked`. So our own plugins would flip from
   "Likely safe" to "Not checked" and back, hour to hour, for no reason the user can see.
3. Same for licence and star count on our own entries — one failed lookup and the detail
   page's "MIT · pinned to 4f1c2a9" footer loses its licence.

**Fix:** see "Add one thing" below. It's ten lines and it kills all three.

### C. The brake on comment spam is probably not connected (Plan 1)

Both new write routes lean on `checkRateLimit` (60 votes/hour, 20 comments/hour) for abuse
control, and comments need **sign-in only — no install** (deliberately, so people can ask a
question before installing).

`worker/src/lib/rate-limit.ts` stores its counters exclusively in the Cloudflare Cache API.
Cloudflare documents the Cache API as **having no effect on `*.workers.dev` deployments** —
and the Worker is served from `wecoded-marketplace-api.destinj101.workers.dev`. If that still
holds, `checkRateLimit` reads 0 every time and always returns "allowed", in production, today,
for ratings too.

This is worth a **two-minute check before Plan 1 merges**, not an assumption either way: hit
an existing rate-limited route ~70 times against production and see whether it ever answers
429. If it doesn't, the counters need to live in D1 (a small table + a `DELETE` in the daily
cron) before an open comment box goes live.

Two smaller companions to this:
- **The Report button on comments has no backend.** The spec's detail-page mockup shows
  `report` on every comment; §5 defers "the Report button's backend for comments". A visible
  button that does nothing is worse than no button. And it is not a quick wire-up: the
  Worker's `reports` table is keyed to a *rating* (`rating_user_id`, `rating_plugin_id`,
  migration 0003), so it cannot take a comment id without a schema change. The right v1 call
  is to render no Report control at all and defer both.
- **Nobody can delete their own comment**, on any platform. Reviews had delete
  (`marketplace:rate:delete`); comments ship without it.

### D. The catalog is one very large download, fetched hourly, by every device

Nothing in Plan 2 or Plan 3 bounds the size of `GET /catalog`. My estimate from the real data:

| Source | Rows |
|---|---|
| Our registry: 302 live bundles + 2,084 skills + 103 specialists + 125 connections | **~2,600** |
| awesome-copilot: ~940 plugins + 415 skills + 223 agents + 193 instructions | ~1,800 |
| Docker MCP catalog | ~320 |
| awesome-cursorrules | 257 |
| MCP Registry (the shown slice) | unknown, plausibly 1,000–3,000 |

That's **6,000–8,000 rows**. Today's `index.json` is 382,381 bytes for 339 rows — about
1.1 KB each. So `/catalog` lands somewhere around **6–10 MB, in one response, with no paging
and no "has anything changed?" check**, downloaded hourly on desktop *and on Android over
mobile data*, written to disk, and `JSON.parse`d in the main process at every app launch.

Two knock-on effects:
- **Cost.** The Worker reads every row out of D1 on every request (16 paged queries). D1's
  free tier is 5 million row-reads/day → about **600 catalog fetches per day** before it
  runs out. That's roughly 25 users at a 1-hour refresh. The `Cache-Control: public,
  max-age=300` header doesn't rescue this: Cloudflare's edge cache is documented as not
  applying to `*.workers.dev` responses (same caveat as C — worth confirming).
- **A dead field.** The plan computes `generated_at` with the comment "so clients can tell
  whether anything changed" — and then Plan 3's client never looks at it.

**Fix (cheap and large):** return `ETag: "<generated_at>"` and answer `304 Not Modified` when
the client sends it back; have both clients send `If-None-Match`. The hourly refresh then
costs a few hundred bytes on the ~23 hours out of 24 when nothing changed. That plus the cut
in "Subtract one thing" brings this back into normal range.

### E. The hourly job can't finish inside GitHub's budget

`GITHUB_TOKEN` inside GitHub Actions is limited to **1,000 API requests per hour per
repository**, and the plan's own helper stops at 200 remaining — so ~800 usable calls.
Counting what the plan asks for in one run:

- our source: ~153 distinct repo lookups + ~237 file-tree lookups ≈ **390**
- awesome-copilot: one `/commits/` lookup **per externally-hosted plugin** (unknown, but the
  file lists ~940 plugins)
- MCP Registry: **400** star lookups
- cursorrules + copilot tree/head calls: ~6

The run will hit the limit partway through and degrade to "unchecked" — which then triggers
problem B. Separately, the file scanning does **~6,000 sequential raw-file downloads** for our
302 plugins (up to 20 files each) plus 257 for cursorrules, every hour, from Actions IPs;
`timeout-minutes: 50` is tight for that and `raw.githubusercontent.com` has its own throttle.

There's also a trigger that will never fire: the workflow lists
`push: paths: ["index.json", …]`, but the job that rebuilds `index.json` commits it with
**`[skip ci]`** in the message (`e952af6`, `fd3ed70` in the git log). GitHub skips every
workflow for such a commit, so "a merged plugin PR re-ingests immediately" doesn't happen.

**Fix:** only re-download a plugin's files when its commit sha differs from what the catalog
already stores. Most hours that's a handful of plugins instead of 302, and it removes ~95% of
both the API calls and the wall-clock time.

### F. Comments and votes are broken on a skill's own page (Plan 1 × the spec)

The spec's whole point in §1.4 is that a skill inside a bundle gets **its own page**, with its
own feedback section. Those pages have ids like `superpowers/brainstorming`.

`GET /comments/:plugin_id` will not match that — the router's `:param` doesn't cross a slash —
and `isPublicReadPath` explicitly rejects anything with a second segment, so it wouldn't be
allowed through CORS on Android either. Plan 2 spotted exactly this problem for `/catalog` and
added a two-segment route; Plan 1 didn't. As written, every skill page shows a comment box
that 404s.

(For what it's worth, `validateId` is length-only — 1 to 128 characters — so the ids
themselves are fine. It's purely the route shape.)

### G. Most of what the overhaul adds is inert

Follow the rules through to their conclusion for a mirrored MCP-Registry or awesome-copilot
row:

- **Not installable** — Plan 3, Task 6 correctly hides Install and shows "Open source".
- **Not rateable** — voting requires a prior install, which can never happen.
- **Not checked** — Plan 2 only scans files for our own entries and cursorrules. Docker, the
  MCP Registry and awesome-copilot are all hard-coded `scan: { status: "unchecked" }`.

So thousands of new cards arrive carrying a grey "Not checked" shield, no thumbs, and a button
that sends you to GitHub. That's honest, but it is not the "gold standard" the strategy doc
describes, and it dilutes the grid the curation is supposed to protect. The strategy's own
Layer B ("automated scan on every version — our biggest differentiator") is delivered for
about **5%** of the resulting catalog.

---

## 2. Numbers that are wrong

Every count in the strategy doc's §1 table is slightly off, and Plan 2 then instructs a worker
to copy some of them into the README as corrections — which would replace one wrong number
with another.

| Claim | Reality (measured today) |
|---|---|
| 336 entries, 36 deprecated, 300 shown | **339 / 37 / 302** |
| 13 ours, 287 Anthropic | **13 ours / 289 Anthropic** among live rows (27/312 counting deprecated; only **12** ids have a matching folder in the repo) |
| 2,066 skills / 190 commands / 109 agents / 26 hooks | **2,084 / 191 / 103 / 29** live (2,193 / 212 / 122 / 30 including deprecated) |
| Post-install shell gated to `itsdestin/` | **two** orgs — `itsdestin/` and `destinationunknown/` |
| `MarketplaceDetailOverlay.tsx:436` is the MCP placeholder | line 436 renders real names; the placeholder is the separate fallback at 472–473. The *conclusion* holds: 0 of 339 entries have any extracted server names |
| `schema.js:7` promised category chips | it promises chips derived from **life areas**, not categories |
| 9 integrations, 5 usable | 9 listed, **4** marked available |
| Worker serves 9 route groups | **11** path prefixes / 12 route modules (the "README says 3" part is correct) |
| `stats.json` 5 months stale | 4.7 months — `2026-04-05`, untouched since the repo was scaffolded |

Two of these are load-bearing: **Plan 2 Task 11 tells a worker to write "13 YouCoded / 287
Anthropic" into the README.** Have it compute both numbers from `index.json` at edit time
instead of hard-coding a figure that drifts every time a plugin merges.

One item is *worse* than the doc says: `curated-defaults.json` names `theme-builder`, which
isn't a registry id — and that bare string has **already been written into
`~/.claude/youcoded-skills.json` → `favorites[]`**, where it resolves to nothing. So it isn't
just a no-op on first run; there's a dead favourite sitting in the live profile.

---

## 3. Contradictions between the documents

1. **"Show all" was promised and then dropped.** Strategy §6, decision 3 (recommended and not
   struck through): "ingest everything into the database, *show* the filtered slice by default
   **with a 'show all' toggle** — search still finds the long tail." Plan 2 serves `slice = 1`
   only, adds no search route and no "all" route. As built, ~22,000 stored rows are
   permanently unreachable — except by guessing an id, since `GET /catalog/:id` ignores the
   slice entirely. Either implement the toggle or delete the promise; leaving it means paying
   to store and refresh data nobody can ever see.

2. **"Refreshed hourly" is only true for the grid.** Plan 3 changes `fetchIndex()` only.
   `curated-defaults.json` and the featured list are separate fetches from raw GitHub on the
   24-hour TTL, so the hero and the curated rails still lag a day. Worth one line in the plan
   so nobody is surprised.

3. **Migration numbering by handshake.** Plan 2: "next is 0006 (0005 is Plan 1's — if Plan 1
   has not merged, this plan's migration is 0005 and Plan 1's becomes 0006; whoever merges
   second renumbers)." D1 records applied migrations by filename and applies in order; adding a
   0005 *after* 0006 has already run applies it out of order. Since Plan 1 is explicitly "do
   first", just delete the conditional: Plan 1 = 0005, Plan 2 = 0006, always.

4. **A step that verifies nothing.** Plan 3, Task 7:
   `git branch --contains $(git rev-parse origin/master) | grep -q master` — that asks "is
   origin/master's tip on master?", which is trivially true right after a pull. It should name
   the feature commit's sha.

5. **A test the plan knows is wrong.** Plan 2, Task 6 writes `entry.test.mjs` asserting
   `sourceMarketplace === "docker"`, then adds a parenthetical telling the worker to fix the
   test afterwards. Just write it correctly.

---

## 4. If I could add one thing

**A "never downgrade" rule in the Worker's upsert.** When an incoming row omits a field the
stored row already has — `stars`, `license`, `sourceCommit` — keep the stored value. When the
incoming `scan.status` is `unchecked` and the stored one is `checked` or `caution`, keep the
stored one (and its `checkedAt`, so the age is visible). Never let `slice` fall from 1 to 0
because a star lookup didn't happen this hour.

Ten or fifteen lines in one place. It converts every partial, rate-limited or half-broken
ingest run from *visible damage* into *a run that simply didn't improve anything* — which is
what a background job should do. It single-handedly removes problem B, most of the harm from
E, and it's the difference between a marketplace that changes under Destin for no reason and
one that only ever gets better.

## And subtract one thing

**The official MCP Registry source — Plan 2 Task 10, plus everything that exists only to
serve it:** the `slice` column, the delta/`updated_since` runs, the `noRetire` branch, the
`catalog_runs` watermark table and its `/admin/catalog/last-run` route, the star-enrichment
loop, and the weekly full-pass cron. Move it to the follow-up where the sub-registry work
(Layer E) lives — that's the context where 25,000 servers is the point rather than a cost.

Why it's the right thing to cut:

- **The arithmetic doesn't work.** 25,291 servers, enriched at up to 400 star-lookups per run
  — but the enrichment loop only walks the servers the run actually fetched, and hourly runs
  fetch only *changed* servers. So the 400/run catch-up happens on the **weekly** full pass
  only: 25,000 ÷ 400 ≈ **62 weeks** before the catalog even knows which servers clear the
  quality bar. The Architecture paragraph's "enrichment catches up 400 repos per run" is not
  what the code does.
- **The output is inert** — see G above: uninstallable, unrateable, unchecked.
- **It causes most of D and E** — the bulk of the response size, the 400 API calls per run,
  and the "listings vanish" failure in B are all downstream of it.
- **Nothing in the approved UI needs it.** The Connections tab is filled by Docker's ~320
  servers, which arrive with *better* data (declared secrets, allowed hosts, volumes,
  OAuth, tool counts) and real provenance. Four sources still populate all six type tabs.

Cutting it removes roughly 400 lines, one D1 table, two routes, one cron schedule and one
column — and it takes the catalog from ~6–10 MB down to ~3–5 MB before the ETag fix.

---

## 5. Other ways to simplify without losing anything

- **Only re-read files whose sha changed.** Store the sha you scanned; skip a plugin whose sha
  is unchanged. Removes ~95% of the 6,000 hourly downloads and most of the GitHub budget.
  Also applies to cursorrules: 257 files that change roughly never, re-downloaded hourly —
  compare the repo HEAD to last run's and skip the whole source when equal.
- **ETag + 304** on `/catalog` (see D).
- **Stop parsing and re-stringifying.** `GET /catalog` does `JSON.parse` on every stored row
  and then `c.json` stringifies the whole array again. Concatenating the stored strings avoids
  megabytes of work per request. Worth doing whether or not the MCP source is cut.
- **Drop the constant-time compare on the ingest token.** A 32-byte random header on a Worker
  isn't a timing-attack target; it's twelve lines of ceremony. (Harmless, just noise.)
- **Comment rules copied from reviews may be the wrong rules.** `validateCommentText` rejects
  *any* URL. On a plugin Q&A thread, "known issue, see github.com/x/y/issues/3" is the single
  most useful comment someone can leave, and it would be rejected. The repeated-character
  check (`(.)\1{9,}`) also catches `----------` and `..........`. Worth Destin's call, since
  it's a product decision, not a technical one.

---

## 6. Things worth deciding before anyone starts building

1. **Is the pinning behaviour in A what you want?** "An author can't swap the files after we
   checked them" is a real safety property — but it only works if we re-check often, and it
   trades away automatic updates. Recommendation: pin to the sha the ingest resolved *this
   hour*, never to the old `sourceSha`. That keeps the property and keeps updates flowing.
2. **Does the safety badge earn its place if it says "Not checked" on ~95% of listings?**
   Honest, but a grid of grey shields may read as "this marketplace is unsafe". If the MCP
   source is cut, that ratio improves a lot (our 2,600 + 257 cursorrules would be checked,
   Docker's 320 and copilot's 1,800 not) — still under half. An alternative worth considering:
   only show the shield when there is something to say, and let "no shield" mean "we haven't
   looked" rather than printing it on every card.
3. **The URL rule for comments** (above).
4. **Is there a kill switch?** If one bad ingest run publishes garbage, every device picks it
   up within the hour and the only remedy is a Worker deploy. A `[vars]` flag that makes
   `/catalog` answer 503 — which the app already handles by falling back to `index.json` —
   costs about three lines and would let Destin turn the whole thing off from a commit.

---

## 7. What's good, and should not be re-litigated

- The UI spec's decision ledger, and especially the list of already-rejected ideas.
- "Computed from files, never author-declared" and "never `checked` without having read the
  files" — the two rules that make the trust layer meaningful rather than decorative.
- The absent-catalog-block default ("a plugin, community, not checked" and every new surface
  hides itself), which means a backend outage degrades to today's app rather than an empty
  screen.
- The three-step network fallback in Plan 3, and the stale-cache last resort.
- The plans' concreteness generally — real file paths, real line numbers, failing test first,
  and per-task commit boundaries. The problems above are design problems, not sloppiness.
