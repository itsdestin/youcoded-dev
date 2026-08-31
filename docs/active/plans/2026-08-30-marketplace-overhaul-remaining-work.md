---
status: active
created: 2026-08-30
spec: docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
supersedes:
  - docs/active/plans/2026-08-28-marketplace-catalog-service.md
  - docs/active/plans/2026-08-28-marketplace-app-wiring.md
---

# Marketplace Overhaul — Remaining Work

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**This document is self-contained and authoritative.** It replaces
`2026-08-28-marketplace-catalog-service.md` and `2026-08-28-marketplace-app-wiring.md`, both
now marked `superseded`. Do not work from those files; every task in them is reproduced here,
renumbered into one sequence, in the order they should actually be done. The approved UI spec
(`docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md`) is still the design
authority and is **not** superseded.

## Where this stands (2026-08-30)

The overhaul was originally written as three plans. **Plan 1 (feedback — thumbs + comments)
shipped on 2026-08-28**; its own document, `2026-08-28-marketplace-feedback-worker.md`, stays
`status: shipped` as the record of what it found. What that leaves:

**Done and live in production:**
- Seven Worker routes for votes, comments and installs, plus admin takedown and
  `/auth/export` — `wecoded-marketplace` PRs #71, #72, #73, merged and deployed, 229 tests
  green, routes hand-verified against the live Worker.
- Migration `0005_feedback.sql` is applied, so the migration this plan adds is **0006**.

**Done but not merged:**
- The whole app-side UI, on `youcoded` branch `feat/marketplace-overhaul-ui`
  (worktree `/home/destin/youcoded-dev/worktrees/marketplace-ui`): the type switch, the trust
  chips, "What this can do", the Feedback section, and every component this plan touches.
  As of 2026-08-30 it is **247 commits behind and 14 ahead** of `origin/master`, off a
  merge-base from 2026-08-27, and master has since landed the bundled-plugin-upgrade work
  and 14 feedback commits in the same card/overlay/provider files. Rebasing it is **Task 0**.

**Not started — this document:**
- The catalog service (Worker half + hourly ingest) that gives those cards real data.
- The app reading that catalog on both platforms, pinned installs, member → bundle.
- Three app fixes that are independent of all of it (the Update button, prompt updates,
  small fixes).

**Known-unverified, inherited:** the Android code written for Plan 1 has never been compiled —
there is no Android SDK on this machine. It is Kotlin-consistent with its neighbours, nothing
more. Task 19 is compiled and unit-tested by `android-ci.yml` on the PR instead (Global
Constraints → App).

**Reading old references.** "Plan 1" in the task bodies below means the shipped feedback work
above. All other cross-references have been renumbered into this document's single task
sequence; if you find a stray "Plan 2" or "Plan 3", they were this document's Phases 2 and 4.

## Goal

A catalog the app can read that carries, for every listing, the block the approved UI already
renders — kind, who published it, whether this version was checked, what it can do, licence,
pinned commit — built hourly from four sources and served by the WeCoded Worker; and both
apps reading it, installing from it at a pinned commit, with an Update button that finally
does something.

## Architecture

**Serve.** The Worker stores one row per listing in D1 (`catalog_items`, full entry as JSON
plus a few indexed columns) — that is the source of truth the ingest merges into. But
**`GET /catalog` does not read those rows.** At the end of an ingest run that actually changed
something, the Worker assembles the whole catalog **once** and writes it to a KV namespace;
every client request then serves that one pre-built object (Task 7b). `GET /catalog/:id` stays
on D1 (one indexed row). An ingest token guards `POST /admin/catalog/*`.

**Why the read path is KV and not D1** — this is the difference between a marketplace that
serves a few hundred people and one that serves as many as show up. The catalog is identical
for every user and changes at most once an hour: that is a *file*, not a query. Assembling it
per request means ~5,000 D1 row-reads every time anyone opens the store, against a free-tier
budget of 5 M row-reads/day — roughly **1,000 catalog fetches a day for the entire user base**.
Building it once an hour instead costs ~120,000 row-reads/day total *regardless of how many
users there are*, and the serve path becomes one KV read (100,000/day free, ~100× the old
ceiling, and KV reads are edge-cached globally).

**And KV specifically, not R2**, for one reason worth writing down: KV has its own global cache
tier that works **on a `*.workers.dev` address**, whereas Cloudflare's HTTP cache and the Cache
API do not (ROADMAP: "Put the Worker on a custom domain"). So this fix stands on its own and
does not wait on the domain decision — and when the domain does land, the HTTP edge cache
stacks on top of it rather than replacing it.

**Ingest.** A dependency-free Node 20 script tree in `wecoded-marketplace/scripts/catalog/`
runs in GitHub Actions every hour, pulls each source (our own `index.json`, Docker's MCP
catalog, `github/awesome-copilot`, `PatrickJS/awesome-cursorrules`), normalises to
`SkillEntry + catalog`, computes capabilities and a rule-based scan from the files **at the
repo's current HEAD**, and upserts in batches. It then compares what it saw against the ids
the Worker already holds for that source and sends the difference to a per-source "finish"
call as an explicit retire list — which refuses to retire more than a fifth of a source at
once, because a scraper that collected 12 of 257 rows is broken, not authoritative.

**Consume.** `skill-provider.ts` (desktop main) and `MarketplaceFetcher.kt` (Android) gain a
catalog fetch in front of the existing `index.json` fetch, same on-disk cache envelope, 1-hour
TTL, three-step fallback (Worker → raw GitHub → stale cache). `plugin-installer.ts` /
`PluginInstaller.kt` accept `sourceCommit` and check it out after the shallow clone. The
renderer needs no change: it already renders `entry.catalog`.

**Three rules make the ingest safe to run unattended**, and they are the difference between a
background job and a liability:

1. **Never downgrade (Task 6).** An upsert that arrives without a field the stored row already
   has — `stars`, `license`, `sourceCommit`, `publishedAt` — keeps the stored value; an incoming
   `scan.status: "unchecked"` never overwrites a stored `checked`/`caution`. A rate-limited,
   half-finished or otherwise degraded run therefore *fails to improve* the catalog instead of
   visibly damaging it. Without this, one bad hour flips "Likely safe" to "Not checked" across
   the grid and back again.
2. **Only re-read what changed (Task 12).** The ingest asks the Worker for the commit it has on
   file for each id, and re-downloads a plugin's files only when HEAD differs. That is ~95% of
   the run's GitHub traffic removed. An unchanged entry is **not sent at all** — the source
   reports its id (and its members' ids) as *skipped*, so the retire step knows it was seen.
3. **Never write an unchanged row (Task 6).** The Worker merges every incoming row onto the
   stored one and, when the result is byte-identical, writes nothing. This is the rule that
   keeps the catalog inside D1's **write** budget — **100,000 rows written per day on the free
   tier**, with index updates counted on top. A design that rewrote every row every hour to
   mark it "seen" would spend ~96,000 of those on rows that did not change; this design spends
   them only on what moved. "Seen" is carried by the ingest instead (rule 2's skipped list plus
   what it sent), and retirement is an explicit id list, so nothing has to be written to prove
   a row is still alive. Corollary for every source file: **never stamp a per-run value
   (`new Date()`, a run id) into a row that did not change**, or the skip never fires.

**Deliberately not here:** the official MCP Registry (25,291 servers). See **Deferred** at the
end for the measured reasons and where it goes instead.

**Tech stack:** Hono + D1 + vitest-pool-workers (Worker); Node 20 `fetch` + `node:test`
(ingest, zero npm deps, like `scripts/sync.js`); GitHub Actions cron; Electron main (Node 22,
`fetch`, `child_process` git); Kotlin (`java.net.URL`, ProcessBuilder git); React renderer
(unchanged); vitest; Gradle unit tests.

## Order of work

Six phases, counting the rebase. The ordering is not arbitrary — Phase 0 goes first because
every task on the app branch is a guess until it lands; Phase 1 next because it depends on
nothing else and can go out on its own; Phase 3 is a settled decision that now costs only a
copy pass, not a task list.

| Phase | Tasks | Repo / branch | Depends on |
|---|---|---|---|
| **0 — Rebase the app branch** | 0 | `youcoded` `feat/marketplace-overhaul-ui` | nothing |
| **1 — App fixes that depend on nothing** | 1–3 | `youcoded` `feat/marketplace-overhaul-ui` | Task 0 |
| **2 — Catalog service** | 4–14 (incl. 7b) | `wecoded-marketplace` `feat/catalog-service` (Task 9 is on the app branch) | nothing |
| **3 — Wording for the unchecked shield** | 15 | `youcoded` `feat/marketplace-overhaul-ui` | nothing |
| **4 — App reads the catalog** | 16–22 | `youcoded` `feat/marketplace-overhaul-ui` | Phase 2 deployed |
| **5 — Verify, merge, close out** | 23 | both | Phases 0–4 |

Phases 1 and 2 are independent of each other and can run in parallel in separate worktrees
once Task 0 is done.
Phase 3 no longer gates anything — Destin settled it on 2026-08-30 (the shield stays; see
Task 15), so it is now a small copy-and-tooltip change that can ride along with Phase 1.

---

## Global Constraints

### The catalog contract (Phase 2 produces it, Phase 4 consumes it — these must not drift)

- `GET https://wecoded-marketplace-api.destinj101.workers.dev/catalog` →
  `200 { generated_at: number, entries: SkillEntry[] }`. Every entry has the `index.json`
  fields **plus** `catalog: CatalogMeta` (`desktop/src/shared/catalog-types.ts`); members carry
  `catalog.partOf`; deprecated rows are omitted. Any origin allowed.
- `Cache-Control: public, max-age=300`, an **`ETag`**, and **`304 Not Modified` with an empty
  body** when the client sends a matching `If-None-Match`.
- **The ETag is `"cat-<version>"`** — a counter the Worker bumps on every write (Task 4's
  `catalog_meta` table). **Clients must treat it as an opaque string**: store it, send it back,
  compare it for equality. Nothing on the client may parse it or compare it for ordering.
- **The response body is a pre-built KV object, not a query result** (Task 7b). This is
  invisible from the client's side — same URL, same shape, same ETag semantics — and is stated
  here only so nobody "optimises" the app around a per-request assembly that does not happen.
  If KV is empty or unreadable the Worker falls back to assembling from D1, so the contract
  holds either way.
- **The 304 is mandatory on both platforms, not an optimisation.** The response is several
  megabytes, both platforms refresh hourly, Android does it over mobile data, and Cloudflare's
  edge cache does not apply to `*.workers.dev` — so a client that ignores the ETag
  re-downloads the whole catalog 24 times a day and makes the Worker re-read every row out of
  D1 each time. Store the ETag alongside the cache and send it back; on 304, refresh the
  cache's timestamp and keep the body.
- **`/catalog` may answer `503`** — that is the `CATALOG_ENABLED` kill switch (Task 5). Clients
  treat it exactly like any other failure and fall through to `index.json`. Do not special-case
  it, do not surface an error; that is the whole point of it.
- **Size discipline.** ~2,600 rows come from our own registry alone (302 live bundles + 2,084
  skills + 103 specialists + 125 connections, measured against `index.json`), and today's rows
  average 1.1 KB. Expect roughly 5,000 rows / 4–6 MB — **measured 2026-08-31: Cloudflare
  Brotli-compresses Worker responses automatically** (today's 382 KB `index.json` travels as
  72 KB, 5.3×), so the wire cost is well under 1 MB. Compression does nothing for the *read*
  cost, which is why Task 7b moves the serve path off D1 entirely.
  **The live ceiling is now KV's 25 MB value limit — roughly 20,000 listings.** Past that the
  object has to be sharded or moved to R2, and that is the point at which the delta-refresh and
  card/detail-split items on the ROADMAP stop being optional. The **write** side is unchanged
  and still tighter than it looks: 100,000 D1 rows written/day, index updates counted on top.
  Rule 3 (Architecture) is what keeps an hourly job under it; any change that writes rows the
  ingest did not change needs the same scrutiny as a paging change.
- `CatalogMeta` lives in `desktop/src/shared/catalog-types.ts` on the app branch. This plan
  adds two optional fields there (Task 9): `upstreamId?: string`, `stars?: number`. Nothing
  else in the shape changes.

### Worker + ingest (Phase 2)

- Ids must satisfy the installer's `^[a-zA-Z0-9_-]+$` (`plugin-installer.ts:41`) **except**
  member rows, which use `<bundle>/<name>` and are never installed directly (Task 18 routes
  them to the bundle). Mirrored ids are prefixed by source: `mcp-…`, `docker-…`, `copilot-…`,
  `cursorrules-…`.
- **Ids may contain a slash.** `validateId` is length-only, but Hono's `:param` never crosses a
  slash, so every id-taking route needs a two-segment form (Task 7). Same trap the shipped
  feedback routes hit with `/comments`.
- Worker conventions: errors are plain-text lowercase messages (`src/lib/errors.ts`);
  `parseJsonBody` for JSON; public GETs go in `isPublicReadPath`; migrations
  `NNNN_snake_case.sql`, this plan is **0006**, unconditionally — the feedback plan's
  `0005_feedback.sql` merged 2026-08-28 (wecoded-marketplace#71), so 0006 is now simply the
  next number. Do **not** swap them: D1 records applied migrations by filename and applies in
  order, so a 0005 added after 0006 has run is applied out of order. `[env.test]` mirrors any
  new var; tests `DELETE FROM` their tables in `beforeEach`.
- Ingest never writes to the repo; it POSTs. The token is `CATALOG_INGEST_TOKEN` (Worker
  secret, CI secret `MARKETPLACE_CATALOG_INGEST_TOKEN`), compared with
  `crypto.subtle.timingSafeEqual`-equivalent constant-time logic.
- **There must be a kill switch.** `CATALOG_ENABLED` (a `wrangler.toml` `[vars]` value, Task 5)
  — set it to `"0"`, commit, and `GET /catalog` answers 503, which both clients handle by
  falling back to `index.json`. Without it, one bad ingest run reaches every device within the
  hour and the only remedy is writing and deploying code under pressure.
- **GitHub budget is the binding constraint.** `secrets.GITHUB_TOKEN` inside Actions is limited
  to **1,000 API requests per hour per repository** (not 5,000 — that is a personal access
  token), and `http.mjs` stops at 200 remaining, so a run has ~800 calls. The "only re-read
  what changed" rule keeps a steady-state hourly run at roughly **~420** calls (two per
  distinct repo — `/repos/{o}/{r}` for stars and licence, then its branch tip — cached per
  run; **207** distinct repos across the 237 live `url`/`git-subdir` entries, measured
  2026-08-30) plus a handful for the other sources. If that number ever needs to shrink,
  `git ls-remote <url> HEAD` resolves a branch tip with zero API calls. If a run ever hits
  `RateLimited`, that is the signal the skip logic has stopped working — do not "fix" it by
  raising the threshold. If the budget genuinely needs to grow later, a fine-grained PAT in a
  repo secret gets 5,000/hr; do not reach for that first.
- Raw file downloads (`raw.githubusercontent.com`) do not count against the API limit but have
  their own throttle, and they are the run's wall clock: at up to 20 files per plugin,
  re-reading everything is ~6,000 sequential fetches. Steady state must be dozens, not
  thousands.
- Capabilities and scan findings are **computed from files**, never taken from an author's
  description. Wording is plain: "Runs commands on your computer", "Connects to the internet ·
  api.notion.com", "Needs a Notion key · NOTION_TOKEN", "Runs automatically after every file
  edit", "Adds 3 skills and 1 command".
- Scan status: `caution` when any finding; `checked` when the files were fetched and scanned
  with no finding; `unchecked` when files could not be fetched (rate limit, no repo). Never
  `checked` without having read the files.
- Worker work is on `wecoded-marketplace` branch `feat/catalog-service` from `master`;
  `cd worker && npm test && npm run typecheck` before each commit; the ingest scripts run
  `node --test scripts/catalog/test`.

### App (Phases 1, 3, 4, 5)

- App work is on `youcoded` branch `feat/marketplace-overhaul-ui`, worktree
  `/home/destin/youcoded-dev/worktrees/marketplace-ui`.
- **Task 0 is the rebase, and nothing on the app branch starts before it.** The branch
  predates the bundled-plugin-upgrade merge (youcoded#345/#346, wecoded-marketplace#69/#70,
  shipped 2026-08-27), touches the same files, and is 247 commits behind besides.
- **What that shipped work means here:** the Update badge now compares the plugin's own
  `plugin.json` **version string**, published per entry by wecoded-marketplace#69. Pinning
  (Task 17) adds a second, sharper signal — the installed commit vs the catalog's
  `sourceCommit`. Do **not** replace the version comparison with the commit comparison in this
  plan; run them side by side and treat "either differs" as an update. The version number is
  what the author bumps deliberately; the commit is what actually changed. Changing that logic
  is its own piece of work, on the ROADMAP.
- Desktop cache dir stays `~/.claude/youcoded-marketplace-cache/` (five code sites name it).
- **`fetchIndex()` is the only thing this plan makes hourly.** `curated-defaults.json` and the
  featured list are separate fetches from raw GitHub on the 24-hour `INDEX_TTL`, so the hero
  and the curated rails still lag up to a day. That is out of scope; say so rather than
  claiming "new items appear within an hour" of anything but the grid.
- Every desktop change: `bash scripts/verify.sh marketplace-ui` from the workspace root before
  "done". Android: **there is no Android SDK on this machine** (no `ANDROID_HOME`, no
  `local.properties`, confirmed 2026-08-30), so Kotlin is compiled and unit-tested by
  `android-ci.yml` on the PR (`./gradlew test`, then `assembleDebug`). Write it
  Kotlin-consistent with its neighbours, push, read CI — and say in the PR that this is how it
  was verified. If an SDK is present, `cd worktrees/marketplace-ui && ./gradlew test -x bundleWebUi`
  (the `-x` is mandatory in a hardlinked worktree — see CLAUDE.md).
- Never guess in error strings: git failures surface `output.slice(0, 200)` verbatim, as the
  installer already does.
- **Line numbers in this plan are hints, not addresses.** They were read on 2026-08-28 against
  the branch *before* Task 0's rebase, and the shipped feedback work (14 app commits) has
  since moved several of these files. Every citation names the symbol or the string as well —
  locate by that, and treat a number that does not match as drift, not as a sign the claim is
  wrong.

---

## File structure

**Worker (`wecoded-marketplace/worker`)**
- `migrations/0006_catalog.sql` — `catalog_items`, `catalog_runs`, `catalog_meta`.
- `src/catalog/auth.ts` — `requireIngestToken`.
- `src/catalog/routes.ts` — `catalogRoutes`: `GET /catalog`, `GET /catalog/:id` (+ two-segment
  member form), `POST /admin/catalog/upsert`, `POST /admin/catalog/finish`,
  `GET /admin/catalog/shas`, `GET /admin/catalog/health`.
- `src/catalog/publish.ts` — `buildCatalogBody`, `publishCatalog`, `readPublished` (Task 7b:
  assemble once per changed run into KV; serve from there).
- `src/types.ts` — `CATALOG_INGEST_TOKEN`, `CATALOG_ENABLED`; `wrangler.toml` `[vars]` +
  `[env.test.vars]`; `test/env.d.ts`; `.github/workflows/worker-deploy.yml` secret push.
- `test/catalog.test.ts`, `test/catalog-auth.test.ts`, `test/schema.test.ts`, `test/cors.test.ts`.

**Ingest (`wecoded-marketplace/scripts/catalog/`)**
- `lib/http.mjs` — `getJson`, `getText`, `github` (auth + rate-limit aware), `postJson`.
- `lib/entry.mjs` — `slug`, `makeEntry`, `licenseToSpdx`, `CATALOG_SOURCES`.
- `lib/capabilities.mjs` — `scanFiles(files) → { capabilities, findings }`, `addsLine(components)`.
- `lib/worker.mjs` — `shas`, `upsert` (batched), `finish`.
- `sources/wecoded.mjs`, `sources/docker.mjs`, `sources/awesome-copilot.mjs`,
  `sources/cursorrules.mjs` — each exports `async function collect(ctx) → { entries, … }`.
- `build.mjs` — orchestrator (`--source <name>`, `--dry-run`, `--force-rescan`).
- `test/*.test.mjs` + `test/fixtures/*.json` (the samples captured on 2026-08-28).
- `.github/workflows/catalog-ingest.yml`.
- `docs/catalog.md` (repo-local reference).

**App (`youcoded`, branch `feat/marketplace-overhaul-ui`)**
- Modify `desktop/src/main/skill-provider.ts` — `fetchIndex()` tries the catalog first;
  `install()` resolves members to bundles and passes `sourceCommit`.
- Modify `desktop/src/main/plugin-installer.ts` — `MarketplaceEntry.sourceCommit?`,
  `pinToCommit()` after clone in `installFromUrl` / `installFromGitSubdir`, `InstallResult.commit?`
  reporting what was checked out; `skill-config-store.ts` — `PackageInfo.commit?` (Task 17).
- Create `desktop/tests/skill-provider-catalog.test.ts`, `desktop/tests/plugin-installer-pin.test.ts`.
- Modify `app/src/main/kotlin/com/youcoded/app/skills/MarketplaceFetcher.kt` — `fetchIndex()`
  catalog-first.
- Modify `app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt` — pin after clone;
  `.../LocalSkillProvider.kt` — member → bundle, pass the commit.
- Create `app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt`.
- Modify `desktop/src/renderer/dev/workbench/fixtures/marketplace/catalog.ts` header comment
  only (it now mirrors a real contract).
- Modify `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx`,
  `MarketplaceDetailOverlay.tsx`, `desktop/src/renderer/components/library/LibraryScreen.tsx` —
  connect the Update action (Task 1), the small fixes (Task 3), theme download counts (Task 22).
- Modify `desktop/src/main/skill-config-store.ts`, `skill-provider.ts` — prompts keep their
  marketplace id and stop reporting updates they did not perform (Task 2).
- Create `desktop/tests/marketplace-update-action.test.tsx`, `desktop/tests/prompt-install-update.test.ts`.

**Workspace (`youcoded-dev`)**
- Modify `docs/registries.md`, `.claude/rules/registries.md` — the catalog is the source;
  `index.json` is the fallback (Task 20).

---

## Phase 0 — Rebase the app branch

### Task 0: Rebase `feat/marketplace-overhaul-ui` onto `origin/master`

Do this first, today, and nothing else on the app branch until it is done. As of 2026-08-30
the branch is 247 commits behind and 14 ahead, its merge-base is 2026-08-27, and master has
since landed the bundled-plugin-upgrade work (youcoded#345/#346) and 14 feedback commits in
the same card/overlay/provider files this plan edits. Every line number and every "the code
does X" claim below was read before those landed; the rebase is where they get re-checked.

- [ ] `cd /home/destin/youcoded-dev/worktrees/marketplace-ui && git fetch origin && git rebase origin/master`
  — resolve conflicts keeping BOTH master's feedback/upgrade changes and this branch's UI; when
  in doubt, master wins in main-process files and this branch wins in renderer files.
- [ ] `bash scripts/verify.sh marketplace-ui` → OK (`--full` if
  it reports that test infra moved).
- [ ] From the worktree's `desktop/`: `node scripts/workbench-boot-check.mjs` — the branch adds
  workbench fixtures, and a rebase is exactly when a fixture stops matching a changed type.
- [ ] `git push --force-with-lease origin feat/marketplace-overhaul-ui`. No feature commit; the
  rebase is its own deliverable.
- [ ] Re-verify the Task 1 findings against the rebased tree: `rg -n "'Update' : 'Installed'"`,
  `rg -n '\.update\(' desktop/src/renderer`, and what the bundled-plugin launch path now does
  (`rg -n "BUNDLED_PLUGIN_IDS" desktop/src/main/skill-provider.ts`). If any moved, fix the
  citation in this document in the same commit that starts Task 1.

---

## Phase 1 — App fixes that depend on nothing

Three fixes on the app branch that need no catalog, no Worker change and no decision. They are
first because they can be built, verified and reviewed while Phase 2 is still being written,
and because the first of them fixes a button that has never worked at all.

**Task 0 first.**

### Task 1: Connect the Update action — it has never been wired to anything

**The finding (verified 2026-08-28, master).** The app can update a plugin or a theme. A user
cannot. `MarketplaceCard.tsx` renders the word **"Update"** inside a plain `<span>`
with no click handler (`rg -n "'Update' : 'Installed'"` — line 381 on the branch as of
2026-08-28); `library/LibraryScreen.tsx:265` lists everything with `updateAvailable` and
offers no action either — clicking a row just opens the detail overlay, which shows
Install/Uninstall and no Update. The function that performs it, `update(id, type)`
(`marketplace-context.tsx`, `rg -n "const update = "` — the body is around 326-340),
is exported from the provider and has **zero call sites
in the entire renderer** (`rg '\.update\(' desktop/src/renderer/{components,state}` finds
only its own definition and an unrelated `registry.update`). Behind it everything is real and
reachable from main: `skills:update` (`ipc-handlers.ts:1488`, `IPC.SKILLS_UPDATE`), `skillProvider.update`
(`skill-provider.ts:284`), and for themes `updateTheme(slug)`
(`theme-marketplace-provider.ts:255-266`, which re-runs `installTheme` over the same slug).

So the badge is decorative, app-wide, for both kinds. The only thing that moves on its own is
the bundled-plugin launch path in `skill-provider.ts` (the method that walks
`BUNDLED_PLUGIN_IDS`, called from `main.ts`) — on the pre-rebase branch it only installs what
is missing; whether master's bundled-plugin-upgrade merge made it upgrade too is what Task 0
re-checks. Either way it has no UI.

**This belongs in this plan.** Task 17 adds commit-pinning so "which version do I have" becomes
exact and reproducible — which is worth nothing while the user has no way to act on a version
being out of date. And this plan's branch rewrites that exact card corner, so wiring it now
costs a fraction of doing it later.

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` (the corner element)
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx` (header actions, both the skill and theme bodies)
- Modify: `desktop/src/renderer/components/library/LibraryScreen.tsx` (the Updates tab rows)
- Test: `desktop/tests/marketplace-update-action.test.tsx` (new)

**Interfaces:**
- Produces: clicking **Update** anywhere it is shown calls `mp.update(id, kind)` and shows an in-progress state, then the badge clears. Failure surfaces the real message from `update()`'s result — never a guessed cause (`docs/error-message-standards.md`).

- [ ] **Step 1: Failing test** — `desktop/tests/marketplace-update-action.test.tsx`, arranged
the way `tests/marketplace-card-compact.test.tsx` arranges providers, with `update` a `vi.fn()`
on the marketplace context:

```tsx
it('the card Update label is a button that calls update()', async () => {
  render(<MarketplaceCard item={{ kind: 'skill', entry: row() }} onOpen={() => {}} installed updateAvailable />);
  const btn = screen.getByRole('button', { name: /update/i });
  fireEvent.click(btn);
  await waitFor(() => expect(update).toHaveBeenCalledWith('x', 'skill'));
});

it('clicking Update does not also open the detail overlay', async () => {
  const onOpen = vi.fn();
  render(<MarketplaceCard item={{ kind: 'skill', entry: row() }} onOpen={onOpen} installed updateAvailable />);
  fireEvent.click(screen.getByRole('button', { name: /update/i }));
  expect(onOpen).not.toHaveBeenCalled();
});

it('a theme card updates through the theme path', async () => {
  render(<MarketplaceCard item={{ kind: 'theme', entry: themeRow() }} onOpen={() => {}} installed updateAvailable />);
  fireEvent.click(screen.getByRole('button', { name: /update/i }));
  await waitFor(() => expect(update).toHaveBeenCalledWith('golden-sunbreak', 'theme'));
});

it('shows the real failure message, not a guess', async () => {
  update.mockResolvedValueOnce({ ok: false, error: "fatal: couldn't find remote ref abc123" });
  render(<MarketplaceCard item={{ kind: 'skill', entry: row() }} onOpen={() => {}} installed updateAvailable />);
  fireEvent.click(screen.getByRole('button', { name: /update/i }));
  await waitFor(() => expect(screen.getByText(/couldn't find remote ref/i)).toBeTruthy());
});
```

- [ ] **Step 2: Run** `npx vitest run tests/marketplace-update-action.test.tsx` → FAIL — "Update"
is not a button, so `getByRole('button', …)` finds nothing.

- [ ] **Step 3: Implement**

`MarketplaceCard.tsx` — the corner currently renders one `<span>` for all three of
Installing / Update / Installed. Split it: keep the span for Installing and Installed, and
make Update a real `<button>` that calls `mp.update(entry.id, kind)` and
**`e.stopPropagation()`s** so it does not also trigger the card's open handler. While it runs,
show "Updating…" and disable it.

`MarketplaceDetailOverlay.tsx` — in both bodies, when `updateAvailable`, put an **Update**
button next to Uninstall. This is the fix ROADMAP:736 diagnosed for themes: the theme path
works, `installTheme` on an installed slug already overwrites in place, but the overlay swaps
to the uninstall affordance once installed so the user's only route today is
uninstall-then-reinstall.

`LibraryScreen.tsx` — the Updates tab rows get the same button. A tab named "Updates" that
cannot update is the version of this bug a user meets first.

- [ ] **Step 4: Which comparison decides `updateAvailable`**

`marketplace-context.tsx:356-373` compares **version strings** (`isNewerVersion(pkg.version,
entry.version)`), and returns false when either side is missing. Task 17 adds a second, sharper
fact: the commit the installer actually checked out — recorded on the package as
`PackageInfo.commit` — vs `catalog.sourceCommit`. Use **both** — "either differs" means an
update is available — and keep them separate in the code with a comment saying why: the
version is what an author bumps deliberately, the commit is what actually changed. A package
with no `commit` recorded (anything installed before Task 17) contributes nothing to the
commit compare — no spurious badge on old installs. Note the existing sharp edge while you
are there: a marketplace entry with no version is recorded as `'1.0.0'` (`skill-provider.ts`,
the `|| '1.0.0'` fallbacks) and can be flagged spuriously; the commit comparison is what
rescues those.

- [ ] **Step 5: Run, gate, commit**

Run: `npx vitest run tests/marketplace-update-action.test.tsx` → PASS (4).
Run: `bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceCard.tsx desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx desktop/src/renderer/components/library/LibraryScreen.tsx desktop/tests/marketplace-update-action.test.tsx
git commit -m "feat(marketplace): the Update badge is a button that actually updates, for plugins and themes"
```

---

### Task 2: Installed prompts stop pretending they update

**The finding (verified 2026-08-28, master).** Installing a `type: "prompt"` entry works —
`skill-provider.ts:254-263` calls `configStore.createPromptSkill`. Updating one cannot, for
two independent reasons, and it **reports success anyway**:

1. **No package record.** The plugin and theme paths call `recordPackageInstall`; the prompt
   path does not. So `packages[id]` is undefined and `marketplace-context.tsx:359` hits
   `if (!pkg) continue` — an installed prompt can never be flagged as out of date.
2. **The marketplace id is thrown away.** `createPromptSkill`
   (`skill-config-store.ts:196-206`) mints its own `user:<timestamp>-<random>` id. The update
   branch (`skill-provider.ts:333-344`) then looks the entry up **by the marketplace id**,
   never matches, skips the content overwrite, still calls `updatePackageVersion`, and returns
   `{ ok: true }`. A silent false success.

Today this is invisible: there are **zero** live prompt entries (all 14 are deprecated). Phase
2 introduces **257** of them from awesome-cursorrules, all of which would install as permanent
one-time snapshots and lie when refreshed.

**Files:**
- Modify: `desktop/src/main/skill-config-store.ts` (`createPromptSkill` keeps a provided id), `desktop/src/main/skill-provider.ts` (prompt install records a package; prompt update finds the row or fails honestly)
- Test: `desktop/tests/prompt-install-update.test.ts` (new)

**Interfaces:**
- Produces: installing a marketplace prompt stores it under the **marketplace id** and records a `PackageInfo`, so the Update badge works; `update(id)` on a prompt either rewrites the content or returns `{ ok: false, error }` — never `{ ok: true }` having done nothing.
- Version: Phase 2 stamps cursorrules rows `version: "1.0.0"` and never moves it, so a version compare alone can never fire for them. Have the catalog use the **short `sourceCommit`** as the prompt's version (a one-line change in `sources/cursorrules.mjs`: `version: sha.slice(0, 7)`), which makes "the upstream file changed" visible through the machinery that already exists.

- [ ] **Step 1: Failing test**

```ts
it('a marketplace prompt is stored under its marketplace id and records a package', async () => {
  const p = makeProvider();
  await p.install('cursorrules-android-jetpack-compose');
  const cfg = store.load();
  expect(cfg.privateSkills.some((s) => s.id === 'cursorrules-android-jetpack-compose')).toBe(true);
  expect(store.getPackage('cursorrules-android-jetpack-compose')).toBeTruthy();
});

it('updating a prompt rewrites its content', async () => {
  const p = makeProvider();
  await p.install('cursorrules-android-jetpack-compose');
  registryPrompt = 'NEW TEXT';
  await p.update('cursorrules-android-jetpack-compose');
  expect(store.load().privateSkills.find((s) => s.id === 'cursorrules-android-jetpack-compose')!.prompt).toBe('NEW TEXT');
});

it('updating a prompt that is not there fails loudly instead of claiming success', async () => {
  const r = await makeProvider().update('cursorrules-not-installed');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/not installed/i);
});
```

- [ ] **Step 2: Run** → FAIL (stored under a `user:` id; third case returns `ok: true`).

- [ ] **Step 3: Implement**

`skill-config-store.ts` — `createPromptSkill` takes an optional `id` and uses it when given:
```ts
// A marketplace prompt must keep its marketplace id: update() looks the row up
// by that id, and minting a `user:` one here is why prompt updates silently did
// nothing and still reported success. Hand-made prompts keep the generated id.
const id = skill.id ?? `user:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

`skill-provider.ts` prompt install branch — pass the marketplace id through and record the
package the same way the plugin branch does (`recordPackageInstall(entry.id, entry.version …)`).

`skill-provider.ts` prompt update branch — when `findIndex` misses, **return the failure**:
```ts
if (idx < 0) return { ok: false, error: `${id} is not installed as a prompt` };
```
and only call `updatePackageVersion` after the content was actually written.

- [ ] **Step 4: If any of that turns out bigger than it looks, disable instead**

A prompt that shows Install and then quietly does nothing is worse than one that shows
"Open source". If this task runs long, make `isInstallableSource` (Task 21) return `false` for
prompts, ship the 257 as browsable-not-installable, and put the fix on the ROADMAP. Decide
that deliberately — do not half-fix it.

- [ ] **Step 5: Run, gate, commit**

Run: `npx vitest run tests/prompt-install-update.test.ts` → PASS (3). `bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/main/skill-config-store.ts desktop/src/main/skill-provider.ts desktop/tests/prompt-install-update.test.ts
git commit -m "fix(marketplace): prompts install under their marketplace id and updates no longer claim a success they did not perform"
```

---

### Task 3: The small things that are cheaper to fix while we are in these files

Two genuine one-liners in files this branch already rewrites. (Three more items used to live
here — theme download counts, the dead favourite, and "No longer listed" — but none of them
depends on nothing: the first spans the Worker, desktop and Android; the second is a
`curated-defaults.json` change that lands in Phase 2; the third needs the catalog. They are
**Task 22** now, after the catalog exists, so this phase stays finishable in one sitting.)

- [ ] **Two theme previews render blank** (Devil's Garden, Kuromi Dreamer — ROADMAP:1130).
  Same grid, same component as Task 1.
- [ ] **Rails clip at phone width** (UI audit P-17) and **`longDescription` renders raw
  markdown** in the detail overlay. Marketplace screen and `MarketplaceDetailOverlay.tsx`.
- [ ] Run `bash scripts/verify.sh marketplace-ui` and commit as one `fix(marketplace):` commit
  naming each item.

---

## Phase 2 — The catalog service

The Worker half and the hourly ingest. Independent of Phase 1; work it in the
`wecoded-marketplace` repo on branch `feat/catalog-service`. Task 9 is the one exception — it
is a small type addition on the **app** branch, and it is placed here because Phase 4 cannot
compile without it.

Order within the phase matters: the migration before the routes, the routes before the ingest
that calls them, the scaffold before the sources, and the workflow last so the first real run
happens against finished code.

### Task 4: Migration — `catalog_items`, `catalog_runs`, `catalog_meta`

**Files:**
- Create: `worker/migrations/0006_catalog.sql`
- Test: `worker/test/schema.test.ts`

- [ ] **Step 1: Failing schema test** — add to the existing `it`:

```ts
    expect(names).toContain("catalog_items");
    expect(names).toContain("catalog_runs");
    expect(names).toContain("catalog_meta");
```

- [ ] **Step 2: Run** `cd /home/destin/youcoded-dev/wecoded-marketplace && git checkout -b feat/catalog-service master && cd worker && npx vitest run test/schema.test.ts` → FAIL.

- [ ] **Step 3: Migration**

```sql
-- Marketplace overhaul, Layer A (docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md §2):
-- the catalog the app reads. One row per listing; the full entry (index.json
-- fields + the `catalog` block) lives in entry_json so the schema never has to
-- chase the app's SkillEntry shape. The indexed columns are the ones the read
-- and retire queries filter on.
CREATE TABLE catalog_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                -- wecoded | anthropic | docker | awesome-copilot | cursorrules
  item_type TEXT NOT NULL,             -- plugin | skill | specialist | tool | prompt
  part_of_id TEXT,                     -- bundle id for member rows
  deprecated INTEGER NOT NULL DEFAULT 0,
  source_commit TEXT,                  -- the commit whose FILES were scanned; drives the
                                       -- "only re-read what changed" skip in the ingest
  scan_rules TEXT,                     -- version of the rule set behind the stored verdict.
                                       -- The skip key is (commit, scan_rules), so bumping
                                       -- SCAN_RULES_VERSION re-scans the whole catalog by
                                       -- itself instead of waiting for a manual --force-rescan
                                       -- that nobody remembers to run.
  updated_at INTEGER NOT NULL,         -- last time the CONTENT changed — not "last seen"
  entry_json TEXT NOT NULL
);
-- There is deliberately NO run_id / "last touched" column. A row is written only when its
-- content changes (Task 6), and "still alive" is proven by the ingest's explicit retire list,
-- never by rewriting the row. Rewriting ~4,000 rows an hour to mark them seen would spend the
-- entire free-tier write budget (100,000 rows/day, index writes counted on top) on nothing.
--
-- (deprecated, id), not (deprecated) alone: GET /catalog walks the served rows in id order
-- by keyset (`WHERE deprecated = 0 AND id > ?`), and D1 bills rows SCANNED, not returned.
-- This is the only index on the table: every index is one more write per row change, and
-- nothing in this plan filters by part_of_id or item_type.
CREATE INDEX idx_catalog_served ON catalog_items(deprecated, id);

-- One row per (source, run). finished_at NULL = still running / crashed. Kept purely
-- for "did the ingest run, and what did it do" — nothing reads it to make a decision.
CREATE TABLE catalog_runs (
  id TEXT NOT NULL,
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  upserted INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (id, source)
);
CREATE INDEX idx_catalog_runs_source ON catalog_runs(source, finished_at);

-- Exactly one row (id = 'v'). Every write to catalog_items bumps `version`, and that
-- number IS the ETag of GET /catalog.
--
-- This table is the difference between the catalog working and the catalog running out
-- of database quota in its first week. Without it, answering "nothing has changed" means
-- reading every catalog row to compute the ETag first — so the cheap reply costs exactly
-- as much as sending the whole 5,000-row payload. D1's free tier allows 5 M row-reads a
-- day; at one full read per client refresh that is a few hundred refreshes a day for the
-- entire user base. With it, an unchanged reply reads ONE row.
CREATE TABLE catalog_meta (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO catalog_meta (id, version, updated_at) VALUES ('v', 1, 0);
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add migrations/0006_catalog.sql test/schema.test.ts && git commit -m "feat(worker): catalog_items + catalog_runs + catalog_meta tables"`.

---

### Task 5: Ingest token — binding, middleware, CI secret

**Files:**
- Create: `worker/src/catalog/auth.ts`
- Modify: `worker/src/types.ts` (Env), `worker/wrangler.toml` (`[env.test.vars]`), `worker/test/env.d.ts`, `.github/workflows/worker-deploy.yml` (Push secrets step)
- Test: `worker/test/catalog-auth.test.ts`

**Interfaces:**
- Produces: `requireIngestToken: MiddlewareHandler<HonoEnv>` — 401 `missing ingest token` / `invalid ingest token`; 503 `ingest token not configured` when the secret is empty.

- [ ] **Step 1: Failing test** — `worker/test/catalog-auth.test.ts`:

```ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("ingest token", () => {
  it("401s without the header, 401s with a wrong token, 200s with the test token", async () => {
    const body = JSON.stringify({ source: "docker", run_id: "r1", retire: [] });
    const headers = { "Content-Type": "application/json" };
    expect((await SELF.fetch("https://test.local/admin/catalog/finish", { method: "POST", headers, body })).status).toBe(401);
    expect((await SELF.fetch("https://test.local/admin/catalog/finish", { method: "POST", headers: { ...headers, "X-Catalog-Token": "nope" }, body })).status).toBe(401);
    expect((await SELF.fetch("https://test.local/admin/catalog/finish", { method: "POST", headers: { ...headers, "X-Catalog-Token": "test-ingest-token" }, body })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/catalog-auth.test.ts` → FAIL (404s).

- [ ] **Step 3: Implement**

`worker/src/types.ts` — add to `Env`:
```ts
  // Shared secret the catalog-ingest GitHub Action presents on
  // POST /admin/catalog/*. Set by CI (wrangler secret put); [env.test.vars]
  // carries a fixed test value. Empty/absent → those routes answer 503.
  CATALOG_INGEST_TOKEN?: string;
```
`worker/src/types.ts` — also add the kill switch:
```ts
  // Kill switch for GET /catalog. "0" → 503, which both clients already handle by
  // falling back to index.json. A bad ingest run reaches every device within the
  // hour; this is the way to stop it with a commit instead of a code change.
  CATALOG_ENABLED?: string;
```
`worker/wrangler.toml` — add `CATALOG_ENABLED = "1"` to the top-level `[vars]` block (next to `CUTOVER_TIMESTAMP`) **and** `CATALOG_INGEST_TOKEN = "test-ingest-token"` + `CATALOG_ENABLED = "1"` to `[env.test.vars]`. `worker/test/env.d.ts` — add `CATALOG_INGEST_TOKEN?: string;` and `CATALOG_ENABLED?: string;`.

**Also add the KV binding now** (Task 7b needs it; doing it here keeps `wrangler.toml` edits in
one commit). One-time provisioning, and it must happen **before** the PR merges or the deploy
fails on an unknown namespace id:
```bash
npx wrangler kv namespace create CATALOG            # prints the id
npx wrangler kv namespace create CATALOG --preview  # prints the preview id
```
then in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CATALOG_KV"
id = "<the id>"
preview_id = "<the preview id>"
```
`src/types.ts` `Env` gains `CATALOG_KV?: KVNamespace;` (**optional on purpose** — Task 7b falls
back to assembling from D1 when it is absent, so tests and any environment without the
namespace keep working). `test/env.d.ts` gains the same. vitest-pool-workers provisions KV
from `wrangler.toml` automatically; no test-side setup. Say in the PR body that the two
`wrangler kv namespace create` commands must be run and the ids committed before merge.

`worker/src/catalog/auth.ts`:
```ts
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HonoEnv } from "../types";
import { unauthorized } from "../lib/errors";

// Constant-time string compare — a plain === leaks the mismatch position.
function sameSecret(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Gate for POST /admin/catalog/* — the ingest job, not a user. */
export const requireIngestToken: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const expected = c.env.CATALOG_INGEST_TOKEN ?? "";
  if (!expected) throw new HTTPException(503, { message: "ingest token not configured" });
  const given = c.req.header("X-Catalog-Token") ?? "";
  if (!given) throw unauthorized("missing ingest token");
  if (!sameSecret(given, expected)) throw unauthorized("invalid ingest token");
  return next();
};
```

`.github/workflows/worker-deploy.yml` — in the Push secrets step, add:
```yaml
          echo "${{ secrets.MARKETPLACE_CATALOG_INGEST_TOKEN }}" | npx wrangler secret put CATALOG_INGEST_TOKEN
```
and tell Destin (in the PR body) to add the repo secret `MARKETPLACE_CATALOG_INGEST_TOKEN` (any 32+ random chars: `openssl rand -hex 32`) **before** merging — the deploy step fails on an empty secret.

The route the test hits is created in Task 6; for now register a stub in a new `worker/src/catalog/routes.ts`:
```ts
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { requireIngestToken } from "./auth";
export const catalogRoutes = new Hono<HonoEnv>();
catalogRoutes.post("/admin/catalog/finish", requireIngestToken, (c) => c.json({ ok: true }));
```
and mount it in `src/index.ts` (`import { catalogRoutes } from "./catalog/routes";` + `app.route("/", catalogRoutes);`).

- [ ] **Step 4: Run** → PASS. `npm run typecheck` clean. **Step 5: Commit** `git add src/catalog src/types.ts src/index.ts wrangler.toml test/env.d.ts test/catalog-auth.test.ts ../.github/workflows/worker-deploy.yml && git commit -m "feat(worker): CATALOG_INGEST_TOKEN + requireIngestToken"`.

---

### Task 6: Admin ingest routes — upsert (merging, write-skipping), finish (explicit retire, guarded), shas, health

**Files:**
- Modify: `worker/src/catalog/routes.ts`
- Test: `worker/test/catalog.test.ts`

**Interfaces:**
- `POST /admin/catalog/upsert` body `{ source, run_id, entries: Array<SkillEntry & { catalog: CatalogMeta }> }` (≤ 500 entries) → `{ ok: true, upserted: number, unchanged: number }`. Creates the `catalog_runs` row on first sight of `(run_id, source)`. Each entry's `id`, `catalog.itemType`, `catalog.partOf?.id`, `catalog.sourceCommit`, `deprecated` are read into columns. **Merges, never clobbers** — see below — and **writes only rows whose merged JSON differs from what is stored**; `unchanged` counts the rest. A row arriving without `publishedAt` gets the insert time on first sight and keeps it thereafter.
- `POST /admin/catalog/finish` body `{ source, run_id, retire: string[], note?, allow_mass_retire? }` → `{ ok: true, retired: number, refused?: { wouldRetire: number, live: number } }`: the listed ids of that source become `deprecated = 1`; the run row gets `finished_at`. **The list is computed by the ingest** (what `/shas` said the catalog holds, minus what the run sent, minus what its sources reported as skipped — Task 10); the Worker never infers "not seen" from anything, so nothing has to be written to prove a row is alive. **Refuses a mass retirement** — see below.
- `GET /admin/catalog/shas?source=…` → `{ shas: Record<id, string> }` — **every live id** of the source, valued `"<sourceCommit>:<scanRulesVersion>"` (either half may be empty). Two consumers: a source skips re-reading an id whose value matches its current key, and `build.mjs` treats the key set as "what the catalog holds" when computing the retire list. Not a bare commit: the scan rules are half of "is what we have still current".
- `GET /admin/catalog/health` (`requireAuth` + `requireAdminAccount` — the same admin gate `DELETE /admin/ratings/:user_id/:plugin_id` already uses, `src/reports/routes.ts:38`) → `{ version, publishedVersion, sources: Array<{ source, live, lastFinishedAt, lastRetired, lastNote }> }`. **`publishedVersion`** is the version of the pre-built KV object the public route is actually serving (Task 7b); when it lags `version` across a run that changed rows, the publish is failing silently and every request is quietly paying the old per-request D1 price — which is invisible from outside, because the fallback keeps answering correctly. Read-only. **This is how a human answers "is the catalog still being fed?"** — a stalled ingest produces no error anywhere, just an unchanging catalog, and GitHub silently disables a repository's `schedule:` triggers after 60 days of inactivity. A source whose `lastFinishedAt` is hours old is the tell.

**The write-skip (rule 3 — why this catalog fits in the free tier).** The upsert already reads
the stored JSON to merge onto it. Serialise the merged entry and compare it to the stored
string; if equal, skip the row. Key order is stable because the merge spreads the stored object
first, so a row that has not changed serialises to the same bytes it was stored as. Every
Docker and awesome-copilot row is sent every hour and lands here as `unchanged`; every
degraded-run row (rule 1) merges back to exactly what was stored and lands here too. The
catalog version bumps only when at least one row was written, so a no-op hour keeps every
client's ETag valid.

**The retire guard (the other important part).** A `finish` whose `retire` list is more than
`MAX_RETIRE_FRACTION` (20%) of the source's live rows refuses, retires nothing, records the
refusal in `catalog_runs.note`, and returns `refused`. The ingest turns that into a failed
workflow run.

Why: the four upstream sources are projects we do not control. The day `awesome-cursorrules`
renames `rules/` we collect 12 prompts instead of 257, the retire list is 245 long, and
without the guard those 245 would vanish — visibly, in everyone's app, until someone noticed.
A long retire list is evidence of a broken scraper, not of 245 deletions. Sources below
`RETIRE_GUARD_FLOOR` (10 live rows) are exempt — a ratio means nothing at that size — and
`allow_mass_retire: true` is the deliberate override for a real bulk removal.

**The merge rule (rule 1).** The incoming entry is merged onto the stored one before it is
compared and written:

| Situation | Result |
|---|---|
| incoming `catalog.stars` / `license` / `sourceCommit` / `upstreamId` is absent, stored has one | keep the stored value |
| incoming `catalog.scan.status === "unchecked"` (or no `scan` at all), stored is `checked` or `caution` | keep the stored `scan` **including its `checkedAt`**, so the badge shows its real age |
| incoming `catalog.capabilities` is absent or empty, stored has some | keep the stored list |
| incoming has no `publishedAt` | keep the stored one; on first insert, stamp now |
| anything the incoming entry *does* state | wins |

Why: a run that could not read a repo's files is not evidence that the repo became unsafe, and
a run that ran out of GitHub budget is not evidence that a licence disappeared. Without this
rule the badges and licences flap hour to hour and listings drop out of the grid for no reason
a user could ever explain. With it, a degraded run merges back to what was stored — and, by
the write-skip, changes nothing at all.

**Two D1 limits the code below is shaped by:** at most **100 bound parameters per query** (so
the stored-JSON lookup and the retire `IN (…)` both chunk at 100 — a single 500-placeholder
`IN` fails), and rows *scanned* are billed, which is why every walk is keyset, never OFFSET.

- [ ] **Step 1: Failing tests** — `worker/test/catalog.test.ts`:

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

const TOKEN = { "Content-Type": "application/json", "X-Catalog-Token": "test-ingest-token" };
const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: "plugin", displayName: id, description: "d", category: "development", author: "a", tags: [],
  version: "1.0.0", publishedAt: "2026-08-28T00:00:00Z", sourceMarketplace: "youcoded",
  sourceType: "url", sourceRef: "https://github.com/x/y.git",
  catalog: { itemType: "plugin", origin: { tier: "community" }, scan: { status: "unchecked" }, capabilities: [] },
  ...extra,
});
const post = (path: string, body: unknown) => SELF.fetch(`https://test.local${path}`, { method: "POST", headers: TOKEN, body: JSON.stringify(body) });
const version = async () => (await env.DB.prepare("SELECT version FROM catalog_meta WHERE id = 'v'").first<{ version: number }>())!.version;
const stored = async (id: string) => JSON.parse((await env.DB.prepare("SELECT entry_json FROM catalog_items WHERE id = ?").bind(id).first<{ entry_json: string }>())!.entry_json);

describe("catalog ingest routes", () => {
  beforeEach(async () => {
    for (const t of ["catalog_items", "catalog_runs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("upserts rows, indexes type / part_of, and reports the count", async () => {
    const res = await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [
      entry("bundle"),
      entry("bundle/skill-a", { catalog: { itemType: "skill", partOf: { id: "bundle", displayName: "Bundle" }, origin: { tier: "community" }, scan: { status: "unchecked" }, capabilities: [] } }),
    ] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, upserted: 2, unchanged: 0 });
    const row = await env.DB.prepare("SELECT item_type, part_of_id FROM catalog_items WHERE id = ?").bind("bundle/skill-a").first();
    expect(row).toEqual({ item_type: "skill", part_of_id: "bundle" });
  });

  it("a second upsert of the same id replaces the row", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [entry("x", { description: "old" })] });
    const res = await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r2", entries: [entry("x", { description: "new" })] });
    expect(await res.json()).toEqual({ ok: true, upserted: 1, unchanged: 0 });
    expect((await stored("x")).description).toBe("new");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM catalog_items").first<{ n: number }>())!.n).toBe(1);
  });

  it("an IDENTICAL upsert writes nothing and leaves the catalog version alone", async () => {
    // This is the write budget: Docker and copilot send every row every hour, and D1's
    // free tier allows 100,000 row-writes a day. Unchanged must cost zero writes.
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("same")] });
    const before = await version();
    const res = await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("same")] });
    expect(await res.json()).toEqual({ ok: true, upserted: 0, unchanged: 1 });
    expect(await version()).toBe(before);
  });

  it("stamps publishedAt on first sight and keeps it afterwards", async () => {
    const { publishedAt: _drop, ...noDate } = entry("dated");
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [noDate] });
    const first = (await stored("dated")).publishedAt as string;
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const res = await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [noDate] });
    expect(await res.json()).toEqual({ ok: true, upserted: 0, unchanged: 1 });   // the stamp did not make it "changed"
    expect((await stored("dated")).publishedAt).toBe(first);
  });

  it("finish retires exactly the listed ids of that source, and records the run", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("docker-a"), entry("docker-b")] });
    const res = await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: ["docker-b"] });
    expect(await res.json()).toEqual({ ok: true, retired: 1 });
    const dep = async (id: string) => (await env.DB.prepare("SELECT deprecated FROM catalog_items WHERE id = ?").bind(id).first<{ deprecated: number }>())!.deprecated;
    expect(await dep("docker-b")).toBe(1);
    expect(await dep("docker-a")).toBe(0);
    const run = await env.DB.prepare("SELECT upserted, retired, finished_at FROM catalog_runs WHERE id = 'r1' AND source = 'docker'")
      .first<{ upserted: number; retired: number; finished_at: number }>();
    expect(run).toMatchObject({ upserted: 2, retired: 1 });
    expect(run!.finished_at).toBeGreaterThan(0);
  });

  it("finish never touches another source's rows, even if named", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("docker-a")] });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [entry("w1")] });
    const res = await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: ["w1"] });
    expect(await res.json()).toEqual({ ok: true, retired: 0 });
  });

  it("finish REFUSES to retire most of a source in one run", async () => {
    // A scraper whose upstream moved a folder: 20 rows last hour, 2 this hour → an 18-id list.
    const many = Array.from({ length: 20 }, (_, i) => entry(`c${String(i).padStart(2, "0")}`));
    await post("/admin/catalog/upsert", { source: "cursorrules", run_id: "r1", entries: many });
    await post("/admin/catalog/finish", { source: "cursorrules", run_id: "r1", retire: [] });
    const gone = many.slice(2).map((e) => e.id);
    const res = await post("/admin/catalog/finish", { source: "cursorrules", run_id: "r2", retire: gone });
    expect(await res.json()).toEqual({ ok: true, retired: 0, refused: { wouldRetire: 18, live: 20 } });
    // Nothing was delisted, and the refusal is on the run record.
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM catalog_items WHERE deprecated = 1").first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT note FROM catalog_runs WHERE id = 'r2' AND source = 'cursorrules'").first<{ note: string }>())!.note)
      .toMatch(/refused/);
    // …and the override goes through.
    const forced = await post("/admin/catalog/finish", { source: "cursorrules", run_id: "r2", retire: gone, allow_mass_retire: true });
    expect((await forced.json<{ retired: number }>()).retired).toBe(18);
  });

  it("health reports live counts and when each source last finished", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("h1"), entry("h2")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: [] });
    // Admin identity, not the ingest token — this one is for a person, not the robot.
    // Same helper pair the reports tests use (test/helpers.ts); githubId 424242 is the
    // id configured in [env.test.vars] ADMIN_USER_IDS.
    const token = await issueTestSession(await createTestAccount({ githubId: "424242", login: "admin" }));
    const res = await SELF.fetch("https://test.local/admin/catalog/health", { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json<{ sources: Array<{ source: string; live: number; lastFinishedAt: number }> }>();
    expect(body.sources).toEqual([expect.objectContaining({ source: "docker", live: 2 })]);
    expect(body.sources[0]!.lastFinishedAt).toBeGreaterThan(0);
    // …and the ingest token alone does not open it — a robot credential is not a person.
    expect((await SELF.fetch("https://test.local/admin/catalog/health", { headers: { "X-Catalog-Token": "test-ingest-token" } })).status).toBe(401);
  });

  it("a small source is exempt from the retire guard", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("s1"), entry("s2"), entry("s3")] });
    expect((await (await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: ["s2", "s3"] })).json<{ retired: number }>()).retired).toBe(2);
  });

  it("a write bumps the catalog version, a retire bumps it, an empty finish does not", async () => {
    const before = await version();
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [
      entry("vv", { catalog: { itemType: "tool", origin: { tier: "community" }, capabilities: [],
        sourceCommit: "abc1234", scan: { status: "checked", checkedAt: "2026-08-28T00:00:00Z", rules: "3" } } }),
    ] });
    const afterWrite = await version();
    expect(afterWrite).toBeGreaterThan(before);
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: [] });
    expect(await version()).toBe(afterWrite);                 // nothing changed for a client
    await post("/admin/catalog/finish", { source: "docker", run_id: "r2", retire: ["vv"] });
    expect(await version()).toBeGreaterThan(afterWrite);      // a delisting is a change
  });

  it("rejects batches over 500, ids over 128 chars, or a missing source", async () => {
    const big = Array.from({ length: 501 }, (_, i) => entry(`e${i}`));
    expect((await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: big })).status).toBe(400);
    expect((await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("x".repeat(129))] })).status).toBe(400);
    expect((await post("/admin/catalog/upsert", { run_id: "r1", entries: [entry("q")] })).status).toBe(400);
  });

  it("NEVER downgrades: a degraded run keeps the stored scan, licence, stars and commit — and writes nothing", async () => {
    const good = entry("keeper", { catalog: { itemType: "plugin", origin: { tier: "youcoded" },
      scan: { status: "checked", checkedAt: "2026-08-28T00:00:00Z" },
      capabilities: [{ kind: "shell", label: "Runs commands on your computer" }],
      license: "MIT", sourceCommit: "abc1234", stars: 91 } });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [good] });

    // r2 is what a rate-limited run emits: it could not read the files or the repo.
    const degraded = entry("keeper", { catalog: { itemType: "plugin", origin: { tier: "youcoded" },
      scan: { status: "unchecked" }, capabilities: [] } });
    const res = await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r2", entries: [degraded] });
    // Merged back to exactly what was stored → the write-skip sees no difference.
    expect(await res.json()).toEqual({ ok: true, upserted: 0, unchanged: 1 });

    const cat = (await stored("keeper")).catalog;
    expect(cat.scan).toEqual({ status: "checked", checkedAt: "2026-08-28T00:00:00Z" });
    expect(cat.license).toBe("MIT");
    expect(cat.stars).toBe(91);
    expect(cat.sourceCommit).toBe("abc1234");
    expect(cat.capabilities).toHaveLength(1);
  });

  it("an UPGRADE still wins — a real scan replaces an unchecked one", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [entry("up")] });
    const better = entry("up", { catalog: { itemType: "plugin", origin: { tier: "youcoded" },
      scan: { status: "caution", checkedAt: "2026-08-28T01:00:00Z", findings: ["Downloads and runs code from the internet (install.sh)"] },
      capabilities: [], license: "MIT", sourceCommit: "def5678" } });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r2", entries: [better] });
    const cat = (await stored("up")).catalog;
    expect(cat.scan.status).toBe("caution");
    expect(cat.scan.findings).toHaveLength(1);
  });

  it("shas lists EVERY live id with its commit and rule version, and drops retired ones", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [
      entry("a", { catalog: { itemType: "plugin", origin: { tier: "youcoded" }, scan: { status: "checked", rules: "1" }, capabilities: [], sourceCommit: "aaa1111" } }),
      entry("b"),   // no commit, no rules — still listed, so the ingest knows it exists
    ] });
    const shas = async () => (await (await SELF.fetch("https://test.local/admin/catalog/shas?source=wecoded", { headers: TOKEN })).json<{ shas: Record<string, string> }>()).shas;
    expect(await shas()).toEqual({ a: "aaa1111:1", b: ":" });
    await post("/admin/catalog/finish", { source: "wecoded", run_id: "r1", retire: ["b"] });
    expect(await shas()).toEqual({ a: "aaa1111:1" });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/catalog.test.ts` → FAIL.

- [ ] **Step 3: Implement** — replace `worker/src/catalog/routes.ts`:

```ts
// Catalog — Layer A of the marketplace overhaul (spec §2). Serve side of the
// ingest job in scripts/catalog/. Rows are whole SkillEntry objects; the app
// renders entry.catalog untouched.
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { requireIngestToken } from "./auth";
import { badRequest } from "../lib/errors";
import { parseJsonBody } from "../lib/parse-json";
import { requireAuth } from "../auth/middleware";
import { requireAdminAccount } from "../auth/admin";

export const catalogRoutes = new Hono<HonoEnv>();

const SOURCES = new Set(["wecoded", "anthropic", "docker", "awesome-copilot", "cursorrules"]);
const MAX_BATCH = 500;
/** Same bound as validateId (lib/validate.ts), so every stored id can be read back through
 *  GET /catalog/:id. */
const MAX_ID = 128;
/** D1 allows at most 100 bound parameters per statement — every `IN (…)` below chunks at this. */
const IN_CHUNK = 100;
/** A `finish` may never delist more than this share of a source's live rows in one run —
 *  a long retire list is a broken scrape, not a bulk deletion. Sources with fewer than
 *  RETIRE_GUARD_FLOOR live rows are exempt (a ratio is meaningless at that size). */
export const MAX_RETIRE_FRACTION = 0.2;
export const RETIRE_GUARD_FLOOR = 10;

interface IngestCatalog {
  itemType?: string;
  partOf?: { id?: string };
  scan?: { status?: string; checkedAt?: string; findings?: string[]; rules?: string };
  capabilities?: unknown[];
  license?: string;
  sourceCommit?: string;
  stars?: number;
  upstreamId?: string;
  [k: string]: unknown;
}
interface IngestEntry {
  id?: string;
  deprecated?: boolean;
  publishedAt?: string;
  catalog?: IngestCatalog;
  [k: string]: unknown;
}

// THE MERGE RULE (rule 1). An ingest run that could not read a repo's files is not
// evidence that the repo became unsafe, and a run that ran out of GitHub budget is not
// evidence that a licence vanished — so a field the incoming row does not state keeps
// whatever is already on file, and an "unchecked" scan never overwrites a real one.
// Consequence: a degraded run merges back to what was stored, and the write-skip below
// then writes nothing at all.
//
// Key order matters for the write-skip: the STORED object is spread first, so an
// unchanged row serialises to the same bytes it was stored as.
const SCAN_RANK: Record<string, number> = { unchecked: 0, checked: 1, caution: 1 };
function mergeOntoStored(incoming: IngestEntry, storedJson: string | null, nowIso: string): IngestEntry {
  if (!storedJson) return incoming.publishedAt ? incoming : { ...incoming, publishedAt: nowIso };
  let stored: IngestEntry;
  try { stored = JSON.parse(storedJson) as IngestEntry; } catch { return incoming; }
  const a = incoming.catalog ?? {};
  const b = stored.catalog ?? {};
  const merged: IngestCatalog = { ...b, ...a };
  for (const k of ["license", "sourceCommit", "stars", "upstreamId"] as const) {
    if (a[k] === undefined && b[k] !== undefined) (merged as Record<string, unknown>)[k] = b[k];
  }
  if ((SCAN_RANK[a.scan?.status ?? "unchecked"] ?? 0) < (SCAN_RANK[b.scan?.status ?? "unchecked"] ?? 0)) {
    merged.scan = b.scan;                                    // keep the real verdict AND its age
  }
  if (!a.capabilities?.length && b.capabilities?.length) merged.capabilities = b.capabilities;
  const out: IngestEntry = { ...stored, ...incoming, catalog: merged };
  if (!incoming.publishedAt && stored.publishedAt) out.publishedAt = stored.publishedAt;
  return out;
}

async function ensureRun(db: D1Database, runId: string, source: string, now: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO catalog_runs (id, source, started_at) VALUES (?, ?, ?)")
    .bind(runId, source, now).run();
}

/** The ETag of GET /catalog is this number. Bumped by every write that changes what a
 *  client would receive — never by a no-op hour, so an unchanged catalog keeps every
 *  client's cached copy valid. */
async function bumpCatalogVersion(db: D1Database, now: number): Promise<void> {
  await db.prepare("UPDATE catalog_meta SET version = version + 1, updated_at = ? WHERE id = 'v'").bind(now).run();
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

catalogRoutes.post("/admin/catalog/upsert", requireIngestToken, async (c) => {
  const body = await parseJsonBody<{ source?: string; run_id?: string; entries?: IngestEntry[] }>(c);
  if (!body.source || !SOURCES.has(body.source)) throw badRequest("unknown source");
  if (!body.run_id || body.run_id.length > 64) throw badRequest("invalid run_id");
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw badRequest("entries must be a non-empty array");
  if (body.entries.length > MAX_BATCH) throw badRequest(`at most ${MAX_BATCH} entries per request`);
  const now = Math.floor(Date.now() / 1000);
  const nowIso = new Date(now * 1000).toISOString();
  await ensureRun(c.env.DB, body.run_id, body.source, now);

  for (const raw of body.entries) {
    if (typeof raw.id !== "string" || !raw.id || raw.id.length > MAX_ID) throw badRequest("entry without a valid id");
    if (!raw.catalog || typeof raw.catalog.itemType !== "string") throw badRequest(`entry ${raw.id} has no catalog.itemType`);
  }

  // Read the stored JSON for this batch's ids up front — one query per 100 ids (the D1
  // parameter cap), not one per row — because the merge AND the write-skip both need it.
  const stored = new Map<string, string>();
  for (const ids of chunks(body.entries.map((e) => e.id as string), IN_CHUNK)) {
    const { results } = await c.env.DB
      .prepare(`SELECT id, entry_json FROM catalog_items WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all<{ id: string; entry_json: string }>();
    for (const r of results) stored.set(r.id, r.entry_json);
  }

  const stmt = c.env.DB.prepare(
    `INSERT INTO catalog_items (id, source, item_type, part_of_id, deprecated, source_commit, scan_rules, updated_at, entry_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET source = excluded.source, item_type = excluded.item_type,
       part_of_id = excluded.part_of_id, deprecated = excluded.deprecated,
       source_commit = excluded.source_commit, scan_rules = excluded.scan_rules,
       updated_at = excluded.updated_at, entry_json = excluded.entry_json`
  );
  let unchanged = 0;
  const batch: D1PreparedStatement[] = [];
  for (const raw of body.entries) {
    const e = mergeOntoStored(raw, stored.get(raw.id as string) ?? null, nowIso);
    const json = JSON.stringify(e);
    // THE WRITE-SKIP (rule 3). Same bytes as stored → no write, no version bump. This is
    // what keeps an hourly job that re-sends ~1,200 Docker/copilot rows inside D1's
    // 100,000 row-writes/day. A row that was retired and has reappeared always differs
    // (deprecated flips), so revival still writes.
    if (json === stored.get(raw.id as string)) { unchanged++; continue; }
    // scan_rules comes off the MERGED entry, so a run that kept a stored verdict also
    // keeps the rule version that produced it.
    batch.push(stmt.bind(e.id, body.source, e.catalog!.itemType, e.catalog!.partOf?.id ?? null, e.deprecated ? 1 : 0,
      e.catalog!.sourceCommit ?? null, e.catalog!.scan?.rules ?? null, now, json));
  }
  if (batch.length) {
    await c.env.DB.batch(batch);
    await c.env.DB.prepare("UPDATE catalog_runs SET upserted = upserted + ? WHERE id = ? AND source = ?")
      .bind(batch.length, body.run_id, body.source).run();
    await bumpCatalogVersion(c.env.DB, now);
  }
  return c.json({ ok: true, upserted: batch.length, unchanged });
});

catalogRoutes.post("/admin/catalog/finish", requireIngestToken, async (c) => {
  const body = await parseJsonBody<{ source?: string; run_id?: string; retire?: unknown; note?: string; allow_mass_retire?: boolean }>(c);
  if (!body.source || !SOURCES.has(body.source)) throw badRequest("unknown source");
  if (!body.run_id) throw badRequest("invalid run_id");
  if (!Array.isArray(body.retire) || !body.retire.every((x) => typeof x === "string" && x.length > 0 && x.length <= MAX_ID)) {
    throw badRequest("retire must be an array of ids");
  }
  const ids = [...new Set(body.retire as string[])];
  const now = Math.floor(Date.now() / 1000);
  await ensureRun(c.env.DB, body.run_id, body.source, now);

  // The retire guard. Count first, delist second: a long list is a broken scrape, not
  // 245 deletions. See the Interfaces note above.
  const counts = await c.env.DB
    .prepare("SELECT COUNT(*) AS live FROM catalog_items WHERE source = ? AND deprecated = 0")
    .bind(body.source).first<{ live: number }>();
  const live = counts?.live ?? 0;
  const wouldRetire = ids.length;
  if (!body.allow_mass_retire && live >= RETIRE_GUARD_FLOOR && wouldRetire > live * MAX_RETIRE_FRACTION) {
    const note = `refused: would retire ${wouldRetire} of ${live} live rows`;
    await c.env.DB.prepare("UPDATE catalog_runs SET finished_at = ?, retired = 0, note = ? WHERE id = ? AND source = ?")
      .bind(now, note, body.run_id, body.source).run();
    return c.json({ ok: true, retired: 0, refused: { wouldRetire, live } });
  }

  // Retire the listed ids — of THIS source only, so a mistaken id can never reach across.
  // Rows keep their JSON so a listing that vanished upstream can be revived by a later
  // upsert (deprecated flips back to 0, which the write-skip sees as a change).
  let retired = 0;
  for (const part of chunks(ids, IN_CHUNK)) {
    const r = await c.env.DB
      .prepare(`UPDATE catalog_items SET deprecated = 1, updated_at = ? WHERE source = ? AND deprecated = 0 AND id IN (${part.map(() => "?").join(",")})`)
      .bind(now, body.source, ...part).run();
    retired += r.meta.changes ?? 0;
  }
  await c.env.DB.prepare("UPDATE catalog_runs SET finished_at = ?, retired = ?, note = ? WHERE id = ? AND source = ?")
    .bind(now, retired, body.note ?? null, body.run_id, body.source).run();
  if (retired) await bumpCatalogVersion(c.env.DB, now);
  return c.json({ ok: true, retired });
});

// What the catalog already holds for a source: EVERY live id, valued "<commit>:<rules>".
// Two consumers. The sources compare the value against their current skip key and do not
// re-download an unchanged repo (the ~6,000-fetch hour becomes a few dozen). build.mjs
// uses the KEY SET as "what exists", subtracts what the run sent or skipped, and sends the
// remainder to `finish` as the retire list — which is why every live id must be here,
// commit or no commit.
//
// The value is `<commit>:<scanRulesVersion>`, not a bare commit. A repo that has not
// moved but was scanned by an OLDER rule set is NOT up to date, and the ingest must
// re-read it. That is what makes "improve the scanner" a one-line version bump instead
// of a manual full rescan someone has to remember.
//
// Keyset, not OFFSET — the same reason as GET /catalog: OFFSET re-scans everything it
// skips, so paging 5,000 rows in blocks of 1,000 bills ~15,000 row-reads, not 5,000.
catalogRoutes.get("/admin/catalog/shas", requireIngestToken, async (c) => {
  const source = c.req.query("source") ?? "";
  if (!SOURCES.has(source)) throw badRequest("unknown source");
  const shas: Record<string, string> = {};
  let after = "";
  for (;;) {
    const { results } = await c.env.DB
      .prepare("SELECT id, source_commit, scan_rules FROM catalog_items WHERE source = ? AND deprecated = 0 AND id > ? ORDER BY id LIMIT 1000")
      .bind(source, after)
      .all<{ id: string; source_commit: string | null; scan_rules: string | null }>();
    for (const r of results) shas[r.id] = `${r.source_commit ?? ""}:${r.scan_rules ?? ""}`;
    if (results.length < 1000) break;
    after = results[results.length - 1]!.id;
  }
  return c.json({ shas });
});

// "Is the catalog still being fed?" — the one question no error message ever answers,
// because a stalled ingest fails silently: the rows just stop changing. Admin-gated
// (same identity check as /admin/analytics/*), read-only, cheap.
catalogRoutes.get("/admin/catalog/health", requireAuth, async (c) => {
  await requireAdminAccount(c);
  const meta = await c.env.DB.prepare("SELECT version, updated_at FROM catalog_meta WHERE id = 'v'")
    .first<{ version: number; updated_at: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT i.source AS source,
            COUNT(*) AS live,
            (SELECT MAX(finished_at) FROM catalog_runs r WHERE r.source = i.source) AS lastFinishedAt,
            (SELECT r.retired FROM catalog_runs r WHERE r.source = i.source ORDER BY r.finished_at DESC LIMIT 1) AS lastRetired,
            (SELECT r.note FROM catalog_runs r WHERE r.source = i.source ORDER BY r.finished_at DESC LIMIT 1) AS lastNote
     FROM catalog_items i WHERE i.deprecated = 0 GROUP BY i.source ORDER BY i.source`
  ).all();
  return c.json({ version: meta?.version ?? 0, updatedAt: meta?.updated_at ?? 0, sources: results });
});
```
(add `/admin/catalog/health` to the moderation section of `worker/README.md` — there is no
standalone route list there; the admin routes are named inline.)

- [ ] **Step 4: Run** `npx vitest run test/catalog.test.ts test/catalog-auth.test.ts && npm run typecheck` → PASS. **Step 5: Commit** `git add src/catalog/routes.ts test/catalog.test.ts && git commit -m "feat(worker): catalog ingest — merging, write-skipping upsert; explicit-list finish; shas"`.

---

### Task 7: Public reads — `GET /catalog`, `GET /catalog/:id`

**Files:**
- Modify: `worker/src/catalog/routes.ts`, `worker/src/index.ts` (`isPublicReadPath`)
- Test: `worker/test/catalog.test.ts`, `worker/test/cors.test.ts`

**Interfaces:** the contract in Global Constraints. `GET /catalog/:id` → `{ entry }` or 404 `not found`.

- [ ] **Step 1: Failing tests** — append to `test/catalog.test.ts`:

```ts
describe("GET /catalog", () => {
  beforeEach(async () => {
    for (const t of ["catalog_items", "catalog_runs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("returns live rows only, with a 5-minute cache header and an ETag", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("shown"), entry("gone")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: ["gone"] });
    const res = await SELF.fetch("https://test.local/catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("etag")).toBeTruthy();
    const body = await res.json<{ generated_at: number; entries: Array<{ id: string; catalog: unknown }> }>();
    expect(body.entries.map((e) => e.id)).toEqual(["shown"]);
    expect(body.entries[0].catalog).toBeTruthy();
    expect(typeof body.generated_at).toBe("number");
  });

  it("answers 304 with an empty body when the client already has this version", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a")] });
    const first = await SELF.fetch("https://test.local/catalog");
    const etag = first.headers.get("etag")!;
    const again = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    // A new upsert moves the ETag, so the client fetches for real again.
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("b")] });
    const third = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(third.status).toBe(200);
  });

  it("the kill switch turns the catalog off without a code change", async () => {
    // env is snapshotted at worker start, so drive the branch directly.
    expect(catalogDisabled({ CATALOG_ENABLED: "0" })).toBe(true);
    expect(catalogDisabled({ CATALOG_ENABLED: "1" })).toBe(false);
    expect(catalogDisabled({})).toBe(false);
  });

  it("a bundle MEMBER id (with a slash) resolves", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [
      entry("superpowers/brainstorming", { catalog: { itemType: "skill", partOf: { id: "superpowers", displayName: "Superpowers" }, origin: { tier: "verified" }, scan: { status: "unchecked" }, capabilities: [] } }),
    ] });
    const res = await SELF.fetch("https://test.local/catalog/superpowers/brainstorming");
    expect(res.status).toBe(200);
    expect((await res.json<{ entry: { id: string } }>()).entry.id).toBe("superpowers/brainstorming");
  });

  it("answers 304 from the version row, without reading the catalog", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a1")] });
    const first = await SELF.fetch("https://test.local/catalog");
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"cat-\d+"$/);
    const again = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    // A write moves the version, so the same conditional request now gets the payload.
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("a2")] });
    const third = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(third.status).toBe(200);
    expect(third.headers.get("etag")).not.toBe(etag);
  });

  it("returns more than one internal page", async () => {
    const many = Array.from({ length: 500 }, (_, i) => entry(`e${String(i).padStart(3, "0")}`));
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: many });
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("e500"), entry("e501")] });
    const body = await (await SELF.fetch("https://test.local/catalog")).json<{ entries: unknown[] }>();
    expect(body.entries.length).toBe(502);
  });

  it("GET /catalog/:id returns one entry or 404", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("one")] });
    expect((await (await SELF.fetch("https://test.local/catalog/one")).json<{ entry: { id: string } }>()).entry.id).toBe("one");
    expect((await SELF.fetch("https://test.local/catalog/none")).status).toBe(404);
  });
});
```

Import `catalogDisabled` at the top of `test/catalog.test.ts`:
```ts
import { catalogDisabled } from "../src/catalog/routes";
```

Append to `test/cors.test.ts` (same shape as the ratings origin test):
```ts
  it("GET /catalog and GET /catalog/:id accept any origin", async () => {
    for (const p of ["/catalog", "/catalog/some-id", "/catalog/some-bundle/some-member"]) {
      const res = await SELF.fetch(`https://test.local${p}`, { headers: { Origin: "https://nowhere.example" } });
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
```

- [ ] **Step 2: Run** → FAIL (404 / wrong header).

- [ ] **Step 3: Implement** — append to `routes.ts`:

```ts
/** Kill switch — see wrangler.toml [vars] CATALOG_ENABLED. Exported so a test can
 *  drive the branch: cloudflare:test snapshots env at worker start. */
export function catalogDisabled(env: { CATALOG_ENABLED?: string }): boolean {
  return env.CATALOG_ENABLED === "0";
}

// GET /catalog — everything the app shows.
//
// Two things in here are load-bearing, and both are about cost, not speed:
//
// 1. THE ETAG COMES FROM ONE ROW, AND THE 304 IS ANSWERED BEFORE ANY CATALOG ROW IS
//    READ. The obvious version — read the rows, derive an ETag from them, then maybe
//    reply 304 — makes the "nothing changed" answer cost exactly as much database work
//    as sending the whole several-MB payload, which defeats the entire point. D1's free
//    tier allows 5 M row-reads/day; a full catalog read is ~5,000 of them. That is a few
//    hundred client refreshes a day for the whole user base if every refresh pays full
//    price, and both clients refresh hourly. With the version row, an unchanged refresh
//    costs ONE row-read and the budget stops being the binding constraint.
// 2. KEYSET PAGING (`id > last`), NEVER OFFSET. D1 bills rows SCANNED, and OFFSET
//    re-scans everything it skips: 5,000 rows in pages of 500 costs ~27,500 row-reads
//    with OFFSET and 5,000 with a keyset. Same answer, five times the bill.
//
// The stored JSON is also CONCATENATED, not parsed and re-serialised: at a few thousand
// rows the naive JSON.parse-then-c.json costs megabytes of pointless work per request.
//
// (All of this exists because *.workers.dev is not served from Cloudflare's edge cache.
// On a custom domain the cache would absorb these repeats before they ever reach us —
// see the ROADMAP entry. Until then the Worker is the cache.)
catalogRoutes.get("/catalog", async (c) => {
  if (catalogDisabled(c.env)) {
    return c.text("catalog temporarily unavailable", 503);
  }
  const meta = await c.env.DB.prepare("SELECT version, updated_at FROM catalog_meta WHERE id = 'v'")
    .first<{ version: number; updated_at: number }>();
  const etag = `"cat-${meta?.version ?? 0}"`;
  c.header("Cache-Control", "public, max-age=300");
  c.header("ETag", etag);
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);

  const parts: string[] = [];
  let after = "";
  for (;;) {
    const { results } = await c.env.DB
      .prepare("SELECT id, entry_json FROM catalog_items WHERE deprecated = 0 AND id > ? ORDER BY id LIMIT 500")
      .bind(after)
      .all<{ id: string; entry_json: string }>();
    for (const r of results) parts.push(r.entry_json);
    if (results.length < 500) break;
    after = results[results.length - 1]!.id;
  }
  c.header("Content-Type", "application/json");
  return c.body(`{"generated_at":${meta?.updated_at ?? 0},"entries":[${parts.join(",")}]}`);
});

async function oneEntry(c: Context<HonoEnv>, id: string) {
  if (catalogDisabled(c.env)) return c.text("catalog temporarily unavailable", 503);
  const row = await c.env.DB.prepare("SELECT entry_json FROM catalog_items WHERE id = ? AND deprecated = 0")
    .bind(validateId(id, "catalog id")).first<{ entry_json: string }>();
  if (!row) throw notFound("not found");
  c.header("Cache-Control", "public, max-age=300");
  c.header("Content-Type", "application/json");
  return c.body(`{"entry":${row.entry_json}}`);
}

// Two-segment form FIRST — a bundle member's id is `<bundle>/<name>` and Hono's
// `:id` never matches across a slash.
catalogRoutes.get("/catalog/:bundle/:name", (c) => oneEntry(c, `${c.req.param("bundle")}/${c.req.param("name")}`));
catalogRoutes.get("/catalog/:id", (c) => oneEntry(c, c.req.param("id")));
```
(add `import type { Context } from "hono";` and `import { validateId } from "../lib/validate";` to the file's imports.)

`src/index.ts` `isPublicReadPath` — add:
```ts
  if (path === "/catalog") return true;
  if (path.startsWith("/catalog/")) {
    const parts = path.slice("/catalog/".length).split("/");
    return parts.length <= 2 && parts.every((p) => p.length > 0);
  }
```
The `ETag` / `If-None-Match` pair also has to survive CORS for any *browser* client: add
`"If-None-Match"` to `allowHeaders` and `"ETag"` to `exposeHeaders` on the public-read CORS
config (`exposeHeaders` does not exist on either config today). Neither app is affected —
desktop fetches from Electron's main process and Android from Kotlin, where CORS does not
apply — but the remote web UI and the workbench are browsers, and a browser that cannot read
`ETag` re-downloads the whole catalog every hour.

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. **Step 5: Commit** `git add src/catalog/routes.ts src/index.ts test/catalog.test.ts test/cors.test.ts && git commit -m "feat(worker): GET /catalog + GET /catalog/:id (public, ETag/304, kill switch)"`.

Then push and open the PR (`feat(worker): catalog service — storage, ingest routes, public reads`) with the secret instruction from Task 5; **merge it before Task 14's first real run.** Body ends with the standard Claude Code footer.

---

### Task 7b: Serve the catalog from a pre-built KV object, not from D1

**Numbered 7b rather than 8 on purpose** — Tasks 8–23 are cross-referenced by number
throughout this document and from the ROADMAP; renumbering them to insert one task would be a
worse trade than a lettered sub-task. Do it immediately after Task 7, in the same PR.

**What this changes and what it does not.** The public contract does not move at all: same URL,
same body shape, same `ETag`/304 semantics, same 503 kill switch. **Phase 4 needs zero
changes** — the app cannot tell the difference. What changes is only *where the bytes come
from*: Task 7 assembles the catalog out of ~5,000 D1 rows on every request; this task assembles
it **once per changed ingest run** into KV and serves that object.

**Why it is worth a task of its own.** At ~5,000 row-reads per assembly against a 5 M/day
free-tier budget, the per-request version caps the entire user base at roughly **1,000 catalog
fetches a day** — a few hundred people, and the failure mode is the catalog going dark (clients
fall back to `index.json`, so nobody sees an error and nobody gets fresh data either). Building
it once an hour costs ~120,000 row-reads/day *no matter how many users there are*, and the
serve path becomes one KV read against a 100,000/day free allowance that is itself
edge-cached. Same code, same contract, ~100× the ceiling.

**KV, not R2, and not the Cache API.** KV's own global cache tier works on a `*.workers.dev`
address; Cloudflare's HTTP cache and the Cache API do not (this is the same fact behind the
rate limiters never having limited anything — ROADMAP: "Put the Worker on a custom domain").
So this task stands alone and does not wait on the domain decision, and the HTTP edge cache
stacks on top of it later rather than replacing it.

**Files:**
- Create: `worker/src/catalog/publish.ts`
- Modify: `worker/src/catalog/routes.ts` (`GET /catalog` reads KV; `finish` publishes)
- Test: `worker/test/catalog-publish.test.ts`

**Interfaces:**
- `buildCatalogBody(db) → Promise<string>` — the exact body string Task 7 already builds
  (keyset walk, concatenated JSON, never parsed and re-serialised). Extracted verbatim from the
  route so the route and the publisher can never drift into producing different bytes.
- `publishCatalog(env) → Promise<{ version: number; bytes: number }>` — reads the version row,
  builds the body, writes it to `CATALOG_KV` under key `catalog:v<version>` **and** writes the
  pointer key `catalog:current` = `{ version, key, generatedAt }`. Versioned keys, not one
  mutable key, so a client mid-download is never served half of one catalog and half of
  another. Old versions are deleted on the next publish but one (keep N=2), which costs nothing
  and makes a bad publish a one-line rollback of the pointer.
- `readPublished(env) → Promise<{ version: number; body: string } | null>` — follows the
  pointer; `null` on any miss so the caller falls back.
- `GET /catalog`: kill switch → version row → ETag → 304 (all unchanged, and **still answered
  before any body work**) → `readPublished()` → **if null, fall back to `buildCatalogBody(db)`**
  and serve that.
- `POST /admin/catalog/finish`: after the retire step, **if the catalog version moved during
  this run**, call `publishCatalog`. A run that changed nothing publishes nothing.

**Three things not to get wrong:**

1. **Publish on the version, never on the clock.** The trigger is "the version counter moved",
   which rule 3 (Architecture) already makes exact. Publishing every hour regardless would
   rewrite a 5 MB object 24 times a day to no effect and, worse, would make the write cost
   proportional to nothing.
2. **The 304 must still be answered from the version row alone**, before the KV read. A KV read
   is cheap but it is not free, and the whole point of the ETag is that "nothing changed" is the
   cheapest possible answer.
3. **The D1 fallback is not dead code — it is the reason this is safe to ship.** An unprovisioned
   namespace, an empty KV, a failed publish: all of them degrade to exactly today's behaviour
   rather than to a broken catalog. Do not delete it, and do not make `CATALOG_KV` a required
   binding.

- [ ] **Step 1: Failing tests** — `worker/test/catalog-publish.test.ts`:

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { buildCatalogBody, publishCatalog, readPublished } from "../src/catalog/publish";

const TOKEN = { "Content-Type": "application/json", "X-Catalog-Token": "test-ingest-token" };
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://test.local${path}`, { method: "POST", headers: TOKEN, body: JSON.stringify(body) });

describe("the catalog is served from a pre-built object", () => {
  beforeEach(async () => {
    for (const t of ["catalog_items", "catalog_runs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
    await env.DB.prepare("UPDATE catalog_meta SET version = 1 WHERE id = 'v'").run();
  });

  it("finish publishes when the version moved, and GET /catalog serves that object", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: [] });
    const published = await readPublished(env);
    expect(published).not.toBeNull();
    // Prove the route is serving the OBJECT, not the rows: corrupt the rows and
    // the response must not change.
    await env.DB.prepare("DELETE FROM catalog_items").run();
    const body = await (await SELF.fetch("https://test.local/catalog")).json<{ entries: Array<{ id: string }> }>();
    expect(body.entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("a run that changed nothing does not republish", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: [] });
    const first = (await readPublished(env))!.version;
    // Same entry again → merges to identical bytes → no write, no version bump (rule 3).
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("a")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r2", retire: [] });
    expect((await readPublished(env))!.version).toBe(first);
  });

  it("falls back to building from D1 when nothing has been published", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("z")] });
    await env.CATALOG_KV!.delete("catalog:current");
    const res = await SELF.fetch("https://test.local/catalog");
    expect(res.status).toBe(200);
    expect((await res.json<{ entries: Array<{ id: string }> }>()).entries.map((e) => e.id)).toEqual(["z"]);
  });

  it("the 304 is answered without reading the published object at all", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1", retire: [] });
    const etag = (await SELF.fetch("https://test.local/catalog")).headers.get("etag")!;
    await env.CATALOG_KV!.delete("catalog:current");   // if the route touched it, this breaks
    const again = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("the published body is byte-identical to what the D1 path builds", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a"), entry("b")] });
    await publishCatalog(env);
    expect((await readPublished(env))!.body).toBe(await buildCatalogBody(env.DB));
  });
});
```

(reuse the `entry()` helper from `test/catalog.test.ts` — export it from a shared
`test/catalog-fixtures.ts` rather than duplicating it.)

- [ ] **Step 2: Run** `npx vitest run test/catalog-publish.test.ts` → FAIL (module does not exist).

- [ ] **Step 3: Implement** `worker/src/catalog/publish.ts`:

```ts
import type { HonoEnv } from "../types";

type Env = HonoEnv["Bindings"];
const POINTER = "catalog:current";
const KEEP = 2; // current + the one before it, so a bad publish rolls back by pointer

// The catalog body, built from D1. This is the SAME function the route's fallback
// uses, extracted so the served bytes and the published bytes can never drift.
//
// Keyset paging (`id > last`), never OFFSET: D1 bills rows SCANNED, and OFFSET
// re-scans everything it skips (~27,500 row-reads instead of ~5,000 for 5,000 rows).
// The stored JSON is concatenated, never parsed and re-serialised — at a few thousand
// rows that is megabytes of pointless work.
export async function buildCatalogBody(db: D1Database, generatedAt = 0): Promise<string> {
  const parts: string[] = [];
  let after = "";
  for (;;) {
    const { results } = await db
      .prepare("SELECT id, entry_json FROM catalog_items WHERE deprecated = 0 AND id > ? ORDER BY id LIMIT 500")
      .bind(after).all<{ id: string; entry_json: string }>();
    for (const r of results) parts.push(r.entry_json);
    if (results.length < 500) break;
    after = results[results.length - 1]!.id;
  }
  return `{"generated_at":${generatedAt},"entries":[${parts.join(",")}]}`;
}

/** Assemble the whole catalog once and store it. Called from `finish` ONLY when the
 *  version counter moved during the run — see Task 7b note 1. */
export async function publishCatalog(env: Env): Promise<{ version: number; bytes: number } | null> {
  if (!env.CATALOG_KV) return null;                       // unprovisioned → route falls back to D1
  const meta = await env.DB.prepare("SELECT version, updated_at FROM catalog_meta WHERE id = 'v'")
    .first<{ version: number; updated_at: number }>();
  const version = meta?.version ?? 0;
  const body = await buildCatalogBody(env.DB, meta?.updated_at ?? 0);
  const key = `catalog:v${version}`;
  // Versioned key first, pointer second: a reader mid-flight either sees the old
  // pointer (old object, still intact) or the new one (new object, fully written).
  // A single mutable key could serve half of one catalog and half of the next.
  await env.CATALOG_KV.put(key, body);
  await env.CATALOG_KV.put(POINTER, JSON.stringify({ version, key, generatedAt: meta?.updated_at ?? 0 }));
  // Best-effort GC of anything older than the last KEEP versions. A miss is harmless:
  // KV storage is measured in GB and these objects are megabytes.
  for (let v = version - KEEP; v > version - KEEP - 5 && v > 0; v--) {
    try { await env.CATALOG_KV.delete(`catalog:v${v}`); } catch { /* best-effort */ }
  }
  return { version, bytes: body.length };
}

/** The published catalog, or null on ANY miss — caller falls back to D1. */
export async function readPublished(env: Env): Promise<{ version: number; body: string } | null> {
  if (!env.CATALOG_KV) return null;
  try {
    const ptr = await env.CATALOG_KV.get(POINTER, "json") as { version: number; key: string } | null;
    if (!ptr) return null;
    const body = await env.CATALOG_KV.get(ptr.key, "text");
    return body ? { version: ptr.version, body } : null;
  } catch {
    return null;                                          // degrade to D1, never to an error
  }
}
```

`routes.ts` — `GET /catalog` keeps its kill switch, version read, ETag and 304 **exactly as
Task 7 wrote them** (the 304 must still land before any body work), then replaces the inline
keyset walk with:

```ts
  c.header("Content-Type", "application/json");
  // The pre-built object is the normal path. The D1 build is the fallback that makes
  // this safe: an unprovisioned namespace, an empty KV or a failed publish all degrade
  // to Task 7's behaviour instead of to a broken catalog. Do not remove it.
  const published = await readPublished(c.env);
  if (published) return c.body(published.body);
  return c.body(await buildCatalogBody(c.env.DB, meta?.updated_at ?? 0));
```

`routes.ts` — `POST /admin/catalog/finish`, after the retire step and the `catalog_runs`
update:

```ts
  // Publish only when this run actually changed the catalog (rule 3 makes that exact).
  // Republishing an unchanged catalog would rewrite a multi-MB object 24 times a day
  // for nothing. A publish failure must NOT fail the run — the route still falls back
  // to D1, and the next changed run republishes.
  if (versionAfter !== versionBefore) {
    try { await publishCatalog(c.env); }
    catch (err) { console.error("catalog publish failed", err); }
  }
```
(read the version row once before the retire step and once after; `finish` already reads it.)

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS (Task 7's suite must still be
green unchanged — the contract did not move). **Step 5: Commit**

```bash
git add src/catalog/publish.ts src/catalog/routes.ts test/catalog-publish.test.ts test/catalog-fixtures.ts && git commit -m "feat(worker): serve the catalog from a pre-built KV object, D1 as fallback"
```

- [ ] **Step 6: After deploy, prove it is actually serving from KV.** Two calls, and the
second is the one that matters:
```bash
curl -sI https://wecoded-marketplace-api.destinj101.workers.dev/catalog | grep -i etag
curl -s https://wecoded-marketplace-api.destinj101.workers.dev/admin/catalog/health   # (admin session)
```
`health` reports the published version alongside the live one; if they diverge and stay
diverged across an ingest run that changed rows, the publish is failing silently and every
request is quietly paying the old D1 price. Add `publishedVersion` to the `health` payload in
Task 6 for exactly this reason.

---

### Task 8: Votes, comments and installs must name a listing that exists

**Files:**
- Modify: `worker/src/lib/validate.ts` (add `requireCatalogId`), `worker/src/feedback/routes.ts`, `worker/src/installs/routes.ts`, `worker/src/ratings/routes.ts`
- Test: `worker/test/feedback.test.ts`, `worker/test/installs.test.ts`

**Why this belongs to this plan and not Plan 1.** `validateId` only checks the length (1–128
chars), so today anyone signed in can record an install, a vote or a comment against an id
that does not exist — unbounded junk rows in D1, and a spam vector with **no ceiling at all** — Plan 1's Task 0
measured `checkRateLimit` in production on 2026-08-28 and it blocked 0 of 160 requests
against a 60/minute cap, so this is the standing state until the Worker moves to a custom
domain, not a hypothetical. The Worker has never had a way to know
which ids are real. **`catalog_items` is that list**, so the check becomes possible for the
first time exactly here.

**Interfaces:**
- Produces: `requireCatalogId(db, id, label?) → Promise<string>` — validates the shape, then `SELECT 1 FROM catalog_items WHERE id = ?`; throws `badRequest("unknown plugin_id")` on a miss. Applied to `POST /thumbs`, `POST /comments`, `POST /installs`, `POST /ratings`, and the `GET` reads that take an id.
- **Two escape hatches, both deliberate:** theme ids (`theme:<slug>`) are not in `catalog_items` — they live in the themes registry, so `theme:`-prefixed ids skip the lookup. And if `catalog_items` is **empty** (a fresh database, or the ingest has never run) the check passes everything: an unpopulated catalog must not lock users out of installing.

- [ ] **Step 1: Failing test** — append to `worker/test/feedback.test.ts`:

```ts
describe("ids must name a real listing", () => {
  beforeEach(async () => {
    for (const t of [...TABLES, "catalog_items"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("400s a vote or comment for an id that is not in the catalog", async () => {
    const { token, account } = await seed();
    // A populated catalog is what turns the check on.
    await env.DB.prepare("INSERT INTO catalog_items (id, source, item_type, deprecated, updated_at, entry_json) VALUES ('real', 'wecoded', 'plugin', 0, 1, '{}')").run();
    await seedInstall(account.userId, "made-up");
    expect((await post("/thumbs", token, { plugin_id: "made-up", value: "up" })).status).toBe(400);
    expect((await post("/comments", token, { plugin_id: "made-up", text: "hi" })).status).toBe(400);
    await seedInstall(account.userId, "real");
    expect((await post("/thumbs", token, { plugin_id: "real", value: "up" })).status).toBe(200);
  });

  it("lets everything through while the catalog is empty, and always allows theme ids", async () => {
    const { token, account } = await seed();
    await seedInstall(account.userId, "anything");
    expect((await post("/thumbs", token, { plugin_id: "anything", value: "up" })).status).toBe(200);
    await env.DB.prepare("INSERT INTO catalog_items (id, source, item_type, deprecated, updated_at, entry_json) VALUES ('real', 'wecoded', 'plugin', 0, 1, '{}')").run();
    expect((await post("/installs", token, { plugin_id: "theme:golden-sunbreak" })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run** → FAIL (400 expected, 200 received).

- [ ] **Step 3: Implement** — append to `worker/src/lib/validate.ts`:

```ts
// An id that names something we actually list. `validateId` only bounds the
// length, which let a signed-in account write installs/votes/comments against
// invented ids — junk rows with no ceiling. catalog_items is the list of real
// ones, so this is only possible once the catalog exists (Task 4).
//
// Two deliberate escapes: theme ids live in the themes registry, not the
// catalog; and an EMPTY catalog (fresh DB, ingest never ran) passes everything,
// because an unpopulated catalog must never lock a user out of installing.
export async function requireCatalogId(db: D1Database, raw: string | undefined | null, label = "plugin_id"): Promise<string> {
  const id = validateId(raw, label);
  if (id.startsWith("theme:")) return id;
  const hit = await db.prepare("SELECT 1 AS ok FROM catalog_items WHERE id = ? LIMIT 1").bind(id).first<{ ok: number }>();
  if (hit) return id;
  const any = await db.prepare("SELECT 1 AS ok FROM catalog_items LIMIT 1").first<{ ok: number }>();
  if (!any) return id;                       // catalog not populated yet — allow
  throw badRequest(`unknown ${label}`);
}
```

Swap `validateId(body.plugin_id)` for `await requireCatalogId(c.env.DB, body.plugin_id)` in
`POST /thumbs`, `POST /comments`, `POST /installs` and `POST /ratings`. Leave the public
**read** routes (`GET /comments/<id>`, `GET /catalog/<id>`) on plain `validateId` — a read of
an unknown id already answers empty or 404 and costs one indexed lookup either way.

While in `installs/routes.ts`: it parses with `c.req.json<…>()` directly. Every other route
uses `parseJsonBody` (`src/lib/parse-json.ts`), which returns a clean 400 on malformed input
instead of an unhandled throw. Switch it.

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. **Step 5: Commit** `git add src/lib/validate.ts src/feedback/routes.ts src/installs/routes.ts src/ratings/routes.ts test/ && git commit -m "feat(worker): installs, votes and comments must name a listing that exists"`.

> **Sequencing:** this task edits files Plan 1 created. Plan 1's Worker half merged
> 2026-08-28 (wecoded-marketplace#71/#72/#73), so those files are on master and this runs in
> its normal place — rebase onto master first, since `feedback/routes.ts` moved after #73.

---

### Task 9: Shared type additions (app branch)

**Files:**
- Modify: `/home/destin/youcoded-dev/worktrees/marketplace-ui/desktop/src/shared/catalog-types.ts`

- [ ] **Step 1: Add the two optional fields** to `CatalogMeta` after `sourceCommit`, and one to `scan`:

```ts
  /** The listing's id in its upstream registry (reverse-DNS MCP name, Docker
   *  slug, …) — shown in the detail footer, used by the ingest to dedupe. */
  upstreamId?: string;
  /** GitHub stars at ingest time, where the source reports them (Docker's
   *  `metadata.githubStars`, our own repo lookups). Display and future ranking
   *  only — nothing hides a listing based on it. */
  stars?: number;
```

and widen `scan` (line 69) by one optional field:

```ts
  /** `rules` is the version of the scan rule set that produced this verdict
   *  (`SCAN_RULES_VERSION`, Task 11). Never rendered — the ingest reads it back through
   *  `/admin/catalog/shas` so that improving the scanner re-scans the catalog on the
   *  next hourly run instead of waiting for someone to remember `--force-rescan`. */
  scan: { status: ScanStatus; checkedAt?: string; findings?: string[]; rules?: string };
```

- [ ] **Step 2:** `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK. Commit on the app branch: `git commit -am "feat(catalog-types): upstreamId + stars"`.

---

### Task 10: Ingest scaffold — http, entry helpers, worker client, test harness

**Files:**
- Create: `scripts/catalog/lib/http.mjs`, `scripts/catalog/lib/entry.mjs`, `scripts/catalog/lib/worker.mjs`, `scripts/catalog/build.mjs`
- Create: `scripts/catalog/test/entry.test.mjs`, `scripts/catalog/test/worker.test.mjs`

**Interfaces:**
- `http.mjs`: `getJson(url, {headers?}) → any` (throws `Error("GET <url> → <status>")`), `getText(url)`, `postJson(url, body, {headers?})`, `github(pathOrUrl) → any` (adds `Authorization: Bearer ${process.env.GITHUB_TOKEN}` + `Accept: application/vnd.github+json`, tracks `x-ratelimit-remaining` in `github.remaining`, throws `RateLimited` when < 200), `githubRaw(owner, repo, sha, path) → string`.
- `entry.mjs`: `slug(s) → string` (lowercase, `[^a-z0-9_-]` → `-`, collapse, trim); `licenseToSpdx(name) → string | undefined`; `makeEntry({ id, itemType, displayName, description, author, repoUrl, sourceType, sourceRef, sourceSubdir?, sourceCommit?, origin, mirroredFrom?, license?, upstreamId?, stars?, capabilities, scan, partOf?, tags?, category?, tagline?, prompt?, components? }) → SkillEntry` filling `type`, `version`, `publishedAt`, `sourceMarketplace`, `visibility`… exactly the fields `index.json` rows carry today plus `catalog`.
- `worker.mjs`: `createWorkerClient({ host, token }) → { shas(source), upsert(source, runId, entries), finish(source, runId, retire, note?, allowMassRetire?) }`; `upsert` splits into batches of 500 and returns `{ upserted, unchanged }` summed across them.
- `build.mjs`: `node scripts/catalog/build.mjs --source docker [--dry-run] [--force-rescan] [--allow-mass-retire]`; without `--source` runs all; `--dry-run` writes `catalog-dry-run-<source>.json` and never POSTs; `--force-rescan` ignores the stored keys and re-reads every file (an emergency lever — a routine rule change should bump `SCAN_RULES_VERSION`, which does the same thing automatically); `--allow-mass-retire` overrides the Worker's retire guard for a genuine bulk removal. **The retire list is computed here, per Worker source: the ids `/shas` returned, minus the ids this run sent, minus the ids the source reported as `skipped`.** A source's `collect` may return `skipped: string[]` for ids it saw but did not emit because nothing changed (rule 2); they count as seen. **The script exits non-zero when any source errors, gets refused, or sees zero rows (nothing sent, unchanged or skipped)** — a broken scraper must never leave a green run behind it.

- [ ] **Step 1: Failing tests**

`scripts/catalog/test/entry.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slug, licenseToSpdx, makeEntry } from "../lib/entry.mjs";

test("slug is installer-safe", () => {
  assert.equal(slug("ai.agenttrust/mcp-server"), "ai-agenttrust-mcp-server");
  assert.equal(slug("  Brave Search!! "), "brave-search");
});

test("licenseToSpdx maps Docker's free-text names and passes SPDX through", () => {
  assert.equal(licenseToSpdx("MIT License"), "MIT");
  assert.equal(licenseToSpdx("Apache License 2.0"), "Apache-2.0");
  assert.equal(licenseToSpdx("MIT"), "MIT");
  assert.equal(licenseToSpdx("NOASSERTION"), undefined);
  assert.equal(licenseToSpdx(null), undefined);
});

test("makeEntry emits the index.json shape plus catalog", () => {
  const e = makeEntry({
    source: "docker",
    id: "docker-brave", itemType: "tool", displayName: "Brave Search", description: "d", author: "brave",
    repoUrl: "https://github.com/brave/brave-search-mcp-server", sourceType: "mcp-registry", sourceRef: "docker:mcp/brave-search",
    origin: "verified", mirroredFrom: "Docker MCP Catalog", license: "MIT", upstreamId: "brave", capabilities: [], scan: { status: "unchecked" },
  });
  assert.equal(e.type, "plugin");
  assert.equal(e.sourceMarketplace, "docker");
  assert.equal(e.catalog.itemType, "tool");
  assert.equal(e.catalog.origin.tier, "verified");
  assert.equal(e.catalog.license, "MIT");
  assert.equal(e.publishedAt, undefined);   // never "today" — the Worker stamps first-seen; a daily-changing value would defeat its write-skip
  assert.equal(e.category, "development");
});
```

`scripts/catalog/test/worker.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkerClient } from "../lib/worker.mjs";

test("upsert batches at 500 and sums the counts", async () => {
  const calls = [];
  const client = createWorkerClient({ host: "https://w.test", token: "t", fetchImpl: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify({ ok: true, upserted: JSON.parse(init.body).entries.length }), { status: 200 });
  }});
  const entries = Array.from({ length: 1201 }, (_, i) => ({ id: `e${i}`, catalog: { itemType: "plugin" } }));
  const n = await client.upsert("docker", "run-1", entries);
  assert.deepEqual(n, { upserted: 1201, unchanged: 0 });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.entries.length, 500);
  assert.equal(calls[2].body.entries.length, 201);
  assert.equal(calls[0].headers["X-Catalog-Token"], "t");
  assert.equal(calls[0].url, "https://w.test/admin/catalog/upsert");
});

test("a non-2xx from the Worker throws with the body", async () => {
  const client = createWorkerClient({ host: "https://w.test", token: "t", fetchImpl: async () => new Response("unknown source", { status: 400 }) });
  await assert.rejects(() => client.finish("docker", "r", []), /400.*unknown source/);
});
```

- [ ] **Step 2: Run** `cd /home/destin/youcoded-dev/wecoded-marketplace && node --test scripts/catalog/test/` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`scripts/catalog/lib/http.mjs`:
```js
// Tiny fetch helpers — no deps, like scripts/sync.js. GitHub calls are
// authenticated (60/hr unauthenticated is not survivable) and rate-limit aware:
// below 200 remaining we stop rather than get banned. The budget is 1,000/hr per
// repository for Actions' GITHUB_TOKEN, so hitting this is a signal that the
// "only re-read what changed" skip has stopped working — not a reason to raise it.
export class RateLimited extends Error {}

async function check(res, url) {
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res;
}

export async function getJson(url, { headers = {} } = {}) {
  return (await check(await fetch(url, { headers }), url)).json();
}
export async function getText(url, { headers = {} } = {}) {
  return (await check(await fetch(url, { headers }), url)).text();
}
export async function postJson(url, body, { headers = {} } = {}) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const GH_API = "https://api.github.com";
export const github = Object.assign(async function github(pathOrUrl) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for GitHub API calls");
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GH_API}${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "wecoded-catalog" } });
  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "1000");
  github.remaining = remaining;
  if (res.status === 403 && remaining === 0) throw new RateLimited(`GitHub rate limit hit (resets ${res.headers.get("x-ratelimit-reset")})`);
  if (remaining < 200) throw new RateLimited(`GitHub rate limit nearly exhausted (${remaining} left)`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}, { remaining: Infinity });

export function githubRaw(owner, repo, sha, path) {
  return getText(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`);
}
```

`scripts/catalog/lib/entry.mjs`:
```js
// The shape the app reads: today's index.json row + `catalog`. Keep in step
// with desktop/src/shared/types.ts SkillEntry and catalog-types.ts CatalogMeta.
export const CATALOG_SOURCES = ["wecoded", "anthropic", "docker", "awesome-copilot", "cursorrules"];

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const SPDX = new Map([
  ["mit license", "MIT"], ["mit", "MIT"],
  ["apache license 2.0", "Apache-2.0"], ["apache-2.0", "Apache-2.0"], ["apache 2.0", "Apache-2.0"],
  ["bsd 3-clause \"new\" or \"revised\" license", "BSD-3-Clause"], ["bsd-3-clause", "BSD-3-Clause"],
  ["bsd 2-clause \"simplified\" license", "BSD-2-Clause"], ["bsd-2-clause", "BSD-2-Clause"],
  ["gnu general public license v3.0", "GPL-3.0"], ["gpl-3.0", "GPL-3.0"],
  ["mozilla public license 2.0", "MPL-2.0"], ["mpl-2.0", "MPL-2.0"],
  ["isc license", "ISC"], ["isc", "ISC"], ["the unlicense", "Unlicense"], ["unlicense", "Unlicense"],
  ["creative commons zero v1.0 universal", "CC0-1.0"], ["cc0-1.0", "CC0-1.0"],
]);
export function licenseToSpdx(name) {
  if (!name || typeof name !== "string") return undefined;
  const k = name.trim().toLowerCase();
  if (k === "noassertion" || k === "other") return undefined;
  return SPDX.get(k) ?? (/^[A-Za-z0-9.+-]+$/.test(name.trim()) ? name.trim() : undefined);
}

const SOURCE_MARKETPLACE = { wecoded: "youcoded", anthropic: "anthropic", docker: "docker", "awesome-copilot": "awesome-copilot", cursorrules: "cursorrules" };

/** Build one catalog row. `source` is the ingest source name; everything the UI
 *  reads lives under `catalog`. Fields absent from the input are omitted, not
 *  nulled, so JSON stays small.
 *
 *  NOTHING in here may depend on the clock. The Worker skips writing a row whose
 *  merged JSON equals what it stored (rule 3); a `publishedAt: today` default would
 *  make every row "change" once a day and burn ~4,000 writes on nothing. Rows without
 *  a date get stamped by the Worker on first insert and keep that value. */
export function makeEntry(o) {
  const entry = {
    id: o.id,
    type: o.itemType === "prompt" ? "prompt" : "plugin",
    displayName: o.displayName,
    description: o.description ?? "",
    category: o.category ?? "development",
    author: o.author ?? "",
    tags: o.tags ?? [],
    version: o.version ?? "1.0.0",
    sourceMarketplace: SOURCE_MARKETPLACE[o.source ?? o.mirroredFromKey ?? "wecoded"] ?? o.source ?? "wecoded",
    sourceType: o.sourceType,
    sourceRef: o.sourceRef,
    catalog: {
      itemType: o.itemType,
      origin: { tier: o.origin, ...(o.mirroredFrom ? { mirroredFrom: o.mirroredFrom } : {}) },
      scan: o.scan,
      capabilities: o.capabilities ?? [],
      ...(o.license ? { license: o.license } : {}),
      ...(o.sourceCommit ? { sourceCommit: o.sourceCommit } : {}),
      ...(o.partOf ? { partOf: o.partOf } : {}),
      ...(o.upstreamId ? { upstreamId: o.upstreamId } : {}),
      ...(typeof o.stars === "number" ? { stars: o.stars } : {}),
    },
  };
  for (const k of ["publishedAt", "updatedAt", "sourceSubdir", "sourceSha", "repoUrl", "tagline", "longDescription", "lifeArea", "audience", "components", "prompt", "pluginName", "deprecated"]) {
    if (o[k] !== undefined) entry[k] = o[k];
  }
  return entry;
}
```
(`source` is the ingest source and every `makeEntry` caller passes it as `o.source` — the test above does too.)

`scripts/catalog/lib/worker.mjs`:
```js
// Client for the Worker's ingest routes (worker/src/catalog/routes.ts).
export function createWorkerClient({ host, token, fetchImpl = fetch }) {
  const headers = { "Content-Type": "application/json", "X-Catalog-Token": token };
  async function call(method, path, body) {
    const res = await fetchImpl(`${host}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }
  return {
    // Commits the catalog already has on file, keyed by id — the input to the
    // "only re-read what changed" skip in every source.
    shas: (source) => call("GET", `/admin/catalog/shas?source=${encodeURIComponent(source)}`).then((r) => r.shas ?? {}),
    async upsert(source, runId, entries) {
      const total = { upserted: 0, unchanged: 0 };
      for (let i = 0; i < entries.length; i += 500) {
        const r = await call("POST", "/admin/catalog/upsert", { source, run_id: runId, entries: entries.slice(i, i + 500) });
        total.upserted += r.upserted ?? 0;
        total.unchanged += r.unchanged ?? 0;
      }
      return total;
    },
    // `retire` is the explicit list of ids to delist — computed by build.mjs, never inferred
    // by the Worker. Always called, even with an empty list: that is what records the run.
    finish: (source, runId, retire, note, allowMassRetire) =>
      call("POST", "/admin/catalog/finish", { source, run_id: runId, retire, ...(note ? { note } : {}), ...(allowMassRetire ? { allow_mass_retire: true } : {}) }),
  };
}
```

`scripts/catalog/build.mjs`:
```js
#!/usr/bin/env node
// Catalog ingest — pulls every source, normalises, upserts to the Worker.
//   node scripts/catalog/build.mjs [--source <name>] [--dry-run] [--force-rescan] [--allow-mass-retire]
// Env: CATALOG_INGEST_TOKEN (required unless --dry-run), GITHUB_TOKEN (required),
//      CATALOG_HOST (default https://wecoded-marketplace-api.destinj101.workers.dev)
import fs from "node:fs";
import { createWorkerClient } from "./lib/worker.mjs";
import { CATALOG_SOURCES } from "./lib/entry.mjs";

const args = new Set(process.argv.slice(2));
const pick = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = pick("--source");
const dryRun = args.has("--dry-run");
const forceRescan = args.has("--force-rescan");
// Deliberate override for a real bulk removal upstream. Without it the Worker refuses to
// delist more than a fifth of a source in one run — see Task 6, "the retire guard".
const allowMassRetire = args.has("--allow-mass-retire");
const host = process.env.CATALOG_HOST ?? "https://wecoded-marketplace-api.destinj101.workers.dev";

const SOURCES = {
  wecoded: () => import("./sources/wecoded.mjs"),
  docker: () => import("./sources/docker.mjs"),
  "awesome-copilot": () => import("./sources/awesome-copilot.mjs"),
  cursorrules: () => import("./sources/cursorrules.mjs"),
};

const runId = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${process.env.GITHUB_RUN_ID ?? "local"}`;
const client = dryRun ? null : createWorkerClient({ host, token: process.env.CATALOG_INGEST_TOKEN ?? (() => { throw new Error("CATALOG_INGEST_TOKEN missing"); })() });
const report = { runId, sources: {} };
const names = only ? [only] : Object.keys(SOURCES);

for (const name of names) {
  if (!SOURCES[name]) throw new Error(`unknown source ${name}; known: ${CATALOG_SOURCES.join(", ")}`);
  const started = Date.now();
  try {
    const { collect } = await SOURCES[name]();
    // What the catalog already holds: every LIVE id → "<commit>:<rules>", one map per
    // Worker source (wecoded emits under "wecoded" AND "anthropic"). Two jobs: the source
    // compares values to skip re-reading unchanged repos, and this loop uses the KEY SET
    // to work out what to retire. --force-rescan blanks the values but keeps the keys —
    // a full re-read must still know what exists.
    const workerSources = name === "wecoded" ? ["wecoded", "anthropic"] : [name];
    const knownBySrc = {};
    for (const src of workerSources) knownBySrc[src] = client ? await client.shas(src) : {};
    const known = forceRescan ? {} : Object.assign({}, ...Object.values(knownBySrc));
    // `skipped`: ids the source saw but did not emit because nothing about them changed
    // (rule 2). They count as SEEN — never as retired — and cost the Worker nothing.
    const { entries, sources: subSources, skipped = [] } = await collect({ known, log: (m) => console.log(`[${name}] ${m}`) });
    const groups = subSources ?? { [name]: entries };
    const skippedSet = new Set(skipped);
    for (const [src, rows] of Object.entries(groups)) {
      if (dryRun) { fs.writeFileSync(`catalog-dry-run-${src}.json`, JSON.stringify(rows, null, 2)); console.log(`[${src}] dry-run: ${rows.length} rows, ${skipped.length} skipped`); continue; }
      const sent = new Set(rows.map((r) => r.id));
      const skippedHere = Object.keys(knownBySrc[src]).filter((id) => skippedSet.has(id)).length;
      // The retire list: what the catalog holds for this source minus what this run saw.
      // Computed HERE so the Worker never has to write a row to learn it is still alive.
      const retire = Object.keys(knownBySrc[src]).filter((id) => !sent.has(id) && !skippedSet.has(id));
      const { upserted, unchanged } = await client.upsert(src, runId, rows);
      const { retired, refused } = await client.finish(src, runId, retire, undefined, allowMassRetire);
      report.sources[src] = { sent: rows.length, upserted, unchanged, skipped: skippedHere, retired, ...(refused ? { refused } : {}), ms: Date.now() - started };
      console.log(`[${src}] sent ${rows.length} (wrote ${upserted}, unchanged ${unchanged}), skipped ${skippedHere}, retired ${retired}`);
      // A refusal means this run saw a fraction of what the catalog holds — a broken
      // scraper, an upstream rename, a rate limit. Nothing was delisted (that is the guard
      // working), but the run is NOT healthy and must not look green.
      if (refused) {
        console.error(`[${src}] REFUSED: this run saw only ${refused.live - refused.wouldRetire} of ${refused.live} live rows — retiring ${refused.wouldRetire} was blocked. ` +
          `Fix the source, or re-run with allow_mass_retire if the removal is real.`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    report.sources[name] = { error: String(err && err.message || err) };
    console.error(`[${name}] FAILED: ${err && err.stack || err}`);
    process.exitCode = 1;
  }
}

// A source that ran, threw nothing, and saw nothing is the silent failure this whole job
// is exposed to: the catalog would simply freeze at yesterday's data while the workflow
// stayed green. "Saw" is sent + skipped — a source that was genuinely unchanged reports
// everything as skipped and passes.
for (const [src, r] of Object.entries(report.sources)) {
  if (!r.error && !r.refused && (r.sent ?? 0) + (r.skipped ?? 0) === 0) {
    console.error(`[${src}] saw 0 rows — the source is broken or its upstream moved.`);
    process.exitCode = 1;
  }
}
fs.writeFileSync("catalog-report.json", JSON.stringify(report, null, 2));
if (process.exitCode) console.error(`\ncatalog ingest finished WITH ERRORS — see catalog-report.json`);
```

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS (4). **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): ingest scaffold — http, entry, worker client, build"`.

---

### Task 11: Capabilities + rule-based scan

**Files:**
- Create: `scripts/catalog/lib/capabilities.mjs`
- Test: `scripts/catalog/test/capabilities.test.mjs`

**Interfaces:**
- `SCAN_RULES_VERSION: string` and `skipKey(sha) → string` — **bump the version in the same
  commit as any change to the rules below.** The ingest skips re-reading a repo whose commit
  has not moved; without the rule version in that key, making the scanner smarter would
  re-check nothing, and every existing verdict would keep its old answer forever until a
  human remembered to run `--force-rescan`. With it, the bump *is* the rescan: the next
  hourly run finds every stored key stale and re-reads the corpus once.
- `scanFiles(files: Array<{ path: string; text: string }>, { title }) → { capabilities: Capability[], findings: string[], hosts: string[] }` — pure.
- `addsLine(components) → Capability | null` — e.g. `Adds 3 skills, 1 command and 2 specialists`.
- `mcpCapabilities(mcpJsonText, { title }) → Capability[]` — from `.mcp.json` servers: `command` → shell, `env` keys → secret, `url` → network.
- `hooksCapability(hooksJsonText) → Capability | null` — `Runs automatically <when>` from event names (`PreToolUse` → "before every tool call", `PostToolUse` → "after every tool call", `SessionStart` → "when a conversation starts", `Stop` → "every time the assistant stops", `UserPromptSubmit` → "every time you send a message").

- [ ] **Step 1: Failing tests** — `scripts/catalog/test/capabilities.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFiles, addsLine, mcpCapabilities, hooksCapability, skipKey, SCAN_RULES_VERSION } from "../lib/capabilities.mjs";

test("the skip key carries the rule version, so a bump invalidates every stored verdict", () => {
  assert.equal(skipKey("abc1234"), `abc1234:${SCAN_RULES_VERSION}`);
});

test("a plain SKILL.md yields no capabilities and no findings", () => {
  const r = scanFiles([{ path: "SKILL.md", text: "# Brainstorm\nAsk one question at a time." }], { title: "X" });
  assert.deepEqual(r.capabilities, []);
  assert.deepEqual(r.findings, []);
});

test("scripts reveal shell, network hosts and keys", () => {
  const r = scanFiles([
    { path: "scripts/run.sh", text: "#!/bin/bash\ncurl -s https://api.congress.gov/v3/bill -H \"X-Api-Key: $CONGRESS_API_KEY\"" },
  ], { title: "Civic" });
  assert.ok(r.capabilities.some((c) => c.kind === "shell"));
  assert.ok(r.capabilities.some((c) => c.kind === "network" && c.detail === "api.congress.gov"));
  assert.ok(r.capabilities.some((c) => c.kind === "secret" && c.detail === "CONGRESS_API_KEY"));
  assert.deepEqual(r.findings, []);
});

test("pipe-to-shell, eval of decoded text and hard-coded keys are findings", () => {
  const r = scanFiles([
    { path: "install.sh", text: "curl -fsSL https://example.com/x.sh | bash" },
    { path: "lib.js", text: "eval(Buffer.from(payload, 'base64').toString())\nconst k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'" },
  ], { title: "X" });
  assert.ok(r.findings.some((f) => /downloads and runs code from the internet/i.test(f)));
  assert.ok(r.findings.some((f) => /obfuscated/i.test(f)));
  assert.ok(r.findings.some((f) => /hard-coded key/i.test(f)));
});

test("mcp.json → command, env, url", () => {
  const caps = mcpCapabilities(JSON.stringify({ mcpServers: { notion: { command: "npx", args: ["-y", "@notionhq/notion-mcp-server"], env: { NOTION_TOKEN: "" } }, remote: { url: "https://mcp.example.com/sse" } } }), { title: "Notion" });
  assert.ok(caps.some((c) => c.kind === "shell" && /npx/.test(c.label)));
  assert.ok(caps.some((c) => c.kind === "secret" && c.detail === "NOTION_TOKEN"));
  assert.ok(caps.some((c) => c.kind === "network" && c.detail === "mcp.example.com"));
});

test("hooks → runs automatically", () => {
  const c = hooksCapability(JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }], PostToolUse: [] } }));
  assert.equal(c.kind, "auto");
  assert.match(c.label, /every time the assistant stops/);
  assert.match(c.label, /after every tool call/);
});

test("addsLine", () => {
  assert.equal(addsLine({ skills: ["a", "b", "c"], commands: ["x"], agents: ["p", "q"], hooks: [], mcpServers: [], hasMcpConfig: true }).label, "Adds 3 skills, 1 command, 2 specialists and 1 connection");
  assert.equal(addsLine({ skills: [], commands: [], agents: [], hooks: [], mcpServers: [], hasMcpConfig: false }), null);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `scripts/catalog/lib/capabilities.mjs`:

```js
// "What this can do" and the automatic check — computed from FILES, never from
// an author's description (spec §1.6/§1.7). Findings are plain sentences a
// non-technical user can act on; each rule names what it saw.
//
// Bump SCAN_RULES_VERSION on ANY change to the rules in this file — it is half the
// ingest's skip key (`<commit>:<version>`), so bumping it re-scans the whole catalog on
// the next hourly run. Leaving it alone after tightening a rule means the tightening
// never actually runs against anything already listed.
export const SCAN_RULES_VERSION = "1";
export const skipKey = (sha) => `${sha}:${SCAN_RULES_VERSION}`;

const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|ps1)$/i;
const HOST_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
const ENV_KEY_RE = /\b([A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD|API_KEY))\b/g;
const HARDCODED_KEY_RE = /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;
const PIPE_TO_SHELL_RE = /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/;
const OBFUSCATION_RE = /\beval\s*\(\s*(Buffer\.from|atob|base64|decode)|base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh|\bexec\s*\(\s*atob/;
const RM_RF_RE = /\brm\s+-rf\s+(\/|~|\$HOME)(?![\w/.-]*tmp)/;

export function scanFiles(files, { title }) {
  const capabilities = [];
  const findings = [];
  const hosts = new Set();
  const keys = new Set();
  let shell = false;
  for (const f of files) {
    const text = f.text ?? "";
    if (SCRIPT_EXT.test(f.path)) shell = true;
    for (const m of text.matchAll(HOST_RE)) hosts.add(m[1].toLowerCase());
    for (const m of text.matchAll(ENV_KEY_RE)) keys.add(m[1]);
    if (HARDCODED_KEY_RE.test(text)) findings.push(`Contains what looks like a hard-coded key in ${f.path}`);
    if (PIPE_TO_SHELL_RE.test(text)) findings.push(`Downloads and runs code from the internet (${f.path})`);
    if (OBFUSCATION_RE.test(text)) findings.push(`Runs obfuscated code — text is decoded and executed at runtime (${f.path})`);
    if (RM_RF_RE.test(text)) findings.push(`Deletes files outside its own folder (${f.path})`);
  }
  hosts.delete("github.com"); hosts.delete("raw.githubusercontent.com"); hosts.delete("docs.anthropic.com");
  if (shell) capabilities.push({ kind: "shell", label: "Runs commands on your computer" });
  const hostList = [...hosts].sort();
  if (hostList.length) capabilities.push({ kind: "network", label: "Connects to the internet", detail: hostList.slice(0, 3).join(", ") + (hostList.length > 3 ? ` +${hostList.length - 3}` : "") });
  for (const k of [...keys].sort()) capabilities.push({ kind: "secret", label: `Needs a ${title} key`, detail: k });
  return { capabilities, findings: [...new Set(findings)], hosts: hostList };
}

const EVENT_WORDS = {
  PreToolUse: "before every tool call", PostToolUse: "after every tool call", SessionStart: "when a conversation starts",
  Stop: "every time the assistant stops", SubagentStop: "every time a specialist finishes", UserPromptSubmit: "every time you send a message",
  Notification: "on every notification", PreCompact: "before the conversation is trimmed",
};
export function hooksCapability(text) {
  let json; try { json = JSON.parse(text); } catch { return null; }
  const events = Object.keys(json.hooks ?? json).filter((k) => EVENT_WORDS[k]);
  if (!events.length) return null;
  return { kind: "auto", label: `Runs automatically ${events.map((e) => EVENT_WORDS[e]).join(" and ")}` };
}

export function mcpCapabilities(text, { title }) {
  let json; try { json = JSON.parse(text); } catch { return []; }
  const servers = json.mcpServers ?? json.servers ?? json;
  const caps = [];
  for (const [name, s] of Object.entries(servers)) {
    if (!s || typeof s !== "object") continue;
    if (s.command) caps.push({ kind: "shell", label: `Runs ${s.command}${Array.isArray(s.args) && s.args.length ? " " + s.args.slice(0, 2).join(" ") : ""} on your computer` });
    for (const k of Object.keys(s.env ?? {})) caps.push({ kind: "secret", label: `Needs a ${title} key`, detail: k });
    if (typeof s.url === "string") { const h = s.url.match(/^https?:\/\/([^/:]+)/); if (h) caps.push({ kind: "network", label: "Connects to the internet", detail: h[1] }); }
    void name;
  }
  return caps;
}

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export function addsLine(c) {
  if (!c) return null;
  const parts = [];
  if (c.skills?.length) parts.push(plural(c.skills.length, "skill"));
  if (c.commands?.length) parts.push(plural(c.commands.length, "command"));
  if (c.agents?.length) parts.push(plural(c.agents.length, "specialist"));
  if (c.hooks?.length) parts.push(plural(c.hooks.length, "hook"));
  const conns = (c.mcpServers?.length || 0) || (c.hasMcpConfig ? 1 : 0);
  if (conns) parts.push(plural(conns, "connection"));
  if (!parts.length) return null;
  const label = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return { kind: "adds", label: `Adds ${label}` };
}
```

- [ ] **Step 4: Run** → PASS (6). **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): capabilities + rule-based scan"`.

---

### Task 12: Source — `wecoded` (our plugins + Anthropic official) with members

**Files:**
- Create: `scripts/catalog/sources/wecoded.mjs`
- Test: `scripts/catalog/test/wecoded.test.mjs` with fixture `scripts/catalog/test/fixtures/index-sample.json` (copy 3 rows from the repo's `index.json`: one `local` youcoded plugin with skills+commands, one `url` anthropic plugin with `sourceSha`, one `git-subdir` plugin with agents and `hasMcpConfig`).

**Interfaces:**
- `collect({ log }) → { entries, sources: { wecoded: SkillEntry[], anthropic: SkillEntry[] } }` — reads **the root** `index.json` (a bare 339-entry array — *not* `skills/index.json`, which is the same entries wrapped in `{version, generatedBy, entries}`; `sync.js` writes the wrapper first and regenerates the root file after it, and the root file is the one both apps fetch), drops `deprecated`, and for every plugin emits: the bundle row (`itemType: 'plugin'`, origin `youcoded` for `sourceMarketplace === 'youcoded'`, else `verified` with `mirroredFrom: 'anthropics/claude-plugins-official'`), plus member rows: `components.skills[]` → `skill`, `components.agents[]` → `specialist`, `hasMcpConfig || mcpServers.length` → one `tool` row named `<displayName> (connection)`. Members: id `<bundle>/<name>`, `partOf`, inherit origin/scan/license/commit, `capabilities: []`.
- **Version resolution — read this before writing the code.** `sourceCommit` must be the repo's **current HEAD**, resolved this run, and *never* the `sourceSha` already sitting in `index.json`. 236 of the 302 live entries carry a `sourceSha` that `sync.js` stamped whenever it last ran; re-using it would pin the catalog — and therefore every install (Task 17) — to a months-old commit that never moves again, so the Update button would re-fetch the same frozen version forever and report success. HEAD comes from the same cached `/repos/{o}/{r}` call that supplies stars and licence (`default_branch` → `/commits/{branch}`, or just `/commits/HEAD`), one per distinct repo per run. `sourceSha` is only a last-resort display value if the lookup fails.
- **Only re-read what changed.** `collect` receives `known` — `{ id: "<sourceCommit>:<scanRulesVersion>" }` from the Worker. When `skipKey(resolvedHead)` equals `known[id]`, the entry — **and every member row under it** — is **not emitted at all**; their ids go in the returned `skipped` list and no files are downloaded. The Worker never sees them, so it writes nothing (rule 3), and `build.mjs` counts them as seen so `finish` does not retire them. This is the difference between ~6,000 raw fetches an hour and a few dozen, and between ~2,600 row-writes an hour and a few dozen. The rule version is in the key on purpose: a scanner improvement must invalidate every stored verdict, so `--force-rescan` is for emergencies, not for routine rule changes. `normalise` therefore returns `{ rows, skipped }`.
- File fetch for scanning (only for entries whose HEAD moved): `local` → read from the repo checkout (`<sourceRef>/`), `url`/`git-subdir` → GitHub Tree at the resolved sha then raw fetch of: `.mcp.json`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, and up to 20 files under `scripts/`, `hooks/`, `bin/` with `SCRIPT_EXT`, each ≤ 64 KB. `scan.status`: `caution`/`checked` when fetched; `unchecked` when the fetch failed (log why) — and the merge rule makes that harmless for an entry that was previously checked.
- Licence: `local` → the repo's LICENSE (MIT — hard-code `MIT` for `sourceMarketplace === 'youcoded'`); GitHub → `/repos/{o}/{r}` `license.spdx_id` (guard null / `NOASSERTION`), cached per repo within the run. Stars from the same call.

- [ ] **Step 1: Failing test** — `scripts/catalog/test/wecoded.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../sources/wecoded.mjs";
import { skipKey } from "../lib/capabilities.mjs";
import sample from "./fixtures/index-sample.json" with { type: "json" };

test("normalise emits a bundle row + member rows with partOf", async () => {
  const fake = { files: async () => ({ ok: true, files: [{ path: "SKILL.md", text: "hi" }] }), repo: async () => ({ stars: 12, license: "MIT", head: "abc1234" }) };
  const { rows: out } = await normalise(sample, fake.files, fake.repo);
  {
    const bundles = out.filter((r) => r.catalog.itemType === "plugin");
    assert.equal(bundles.length, 3);
    const yc = bundles.find((b) => b.sourceMarketplace === "youcoded");
    assert.equal(yc.catalog.origin.tier, "youcoded");
    const an = bundles.find((b) => b.sourceMarketplace === "anthropic");
    assert.equal(an.catalog.origin.tier, "verified");
    assert.equal(an.catalog.origin.mirroredFrom, "anthropics/claude-plugins-official");
    assert.equal(an.catalog.sourceCommit, "abc1234");   // today's HEAD, not the frozen sourceSha
    const members = out.filter((r) => r.catalog.partOf);
    assert.ok(members.length >= 3);
    const skill = members.find((m) => m.catalog.itemType === "skill");
    assert.match(skill.id, /^[^/]+\/[^/]+$/);
    // A member's description must NOT repeat its bundle's name — that is what
    // makes a search for the bundle also return every one of its members.
    assert.equal(skill.description, "");
    assert.equal(skill.catalog.partOf.id, skill.pluginName);
    assert.ok(members.some((m) => m.catalog.itemType === "specialist"));
    assert.ok(members.some((m) => m.catalog.itemType === "tool"));
    assert.ok(bundles.every((b) => b.catalog.scan.status === "checked"));
    assert.ok(bundles.some((b) => b.catalog.capabilities.some((c) => c.kind === "adds")));
  }
});

test("a failed file fetch leaves the bundle unchecked, never checked", async () => {
  const { rows } = await normalise(sample, async () => ({ ok: false, files: [] }), async () => null);
  assert.ok(rows.filter((r) => !r.catalog.partOf).every((b) => b.catalog.scan.status === "unchecked"));
});

test("pins to today's HEAD, never to the stale sourceSha in index.json", async () => {
  const repo = async () => ({ stars: 1, license: "MIT", head: "newhead1" });
  const { rows } = await normalise(sample, async () => ({ ok: true, files: [] }), repo);
  const external = rows.filter((r) => !r.catalog.partOf && r.sourceMarketplace === "anthropic");
  assert.ok(external.length > 0);
  for (const b of external) {
    assert.equal(b.catalog.sourceCommit, "newhead1");
    assert.notEqual(b.catalog.sourceCommit, b.sourceSha);   // the frozen value must NOT win
  }
});

test("an unchanged entry is not emitted at all — it and its members are reported as skipped", async () => {
  const fetched = [];
  const repo = async () => ({ stars: 1, license: "MIT", head: "samehead" });
  // The Worker's view: every live GitHub-sourced id already at today's HEAD + rule version.
  const external = sample.filter((e) => !e.deprecated && e.sourceMarketplace !== "youcoded");
  const known = Object.fromEntries(external.map((e) => [e.id, skipKey("samehead")]));
  const { rows, skipped } = await normalise(sample, async (e) => { fetched.push(e.id); return { ok: true, files: [] }; }, repo, known);
  // Nothing GitHub-sourced was downloaded or emitted…
  assert.ok(fetched.every((id) => sample.find((e) => e.id === id).sourceMarketplace === "youcoded"));
  assert.ok(rows.every((r) => r.sourceMarketplace === "youcoded"));
  // …and every skipped bundle AND its members are in `skipped`, so finish never retires them.
  for (const e of external) {
    assert.ok(skipped.includes(e.id));
    for (const s of e.components?.skills ?? []) assert.ok(skipped.includes(`${e.id}/${s}`));
  }
  // Our own `local` plugins have no GitHub HEAD to compare, so they are read from the
  // checkout every run — no network, and the Worker's write-skip makes it free.
  assert.ok(fetched.length > 0);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `scripts/catalog/sources/wecoded.mjs`:

```js
// Our own registry (index.json = sync.js output: 13 YouCoded plugins + the
// Anthropic official list). Emits the bundle rows AND one row per member
// (skill / specialist / connection) so the type tabs and search can show them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { github, githubRaw } from "../lib/http.mjs";
import { makeEntry } from "../lib/entry.mjs";
import { scanFiles, addsLine, mcpCapabilities, hooksCapability, skipKey, SCAN_RULES_VERSION } from "../lib/capabilities.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OFFICIAL = "anthropics/claude-plugins-official";
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|ps1)$/i;
const MAX_FILES = 20, MAX_BYTES = 64 * 1024;

function parseRepo(url) {
  const m = String(url ?? "").match(/github\.com\/([^/]+)\/([^/.#]+)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** Files worth scanning for one plugin. Returns { ok, files } — ok=false means
 *  "could not read", which must surface as scan.status 'unchecked'. */
export async function fetchFiles(entry, sha) {
  const wanted = (p) => /^(\.mcp\.json|hooks\/hooks\.json|\.claude-plugin\/plugin\.json)$/.test(p) || (/^(scripts|hooks|bin)\//.test(p) && SCRIPT_EXT.test(p));
  if (entry.sourceType === "local") {
    const dir = path.join(ROOT, entry.sourceRef);
    if (!fs.existsSync(dir)) return { ok: false, files: [] };
    const files = [];
    const walk = (d, rel = "") => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), r = rel ? `${rel}/${n}` : n; if (fs.statSync(p).isDirectory()) { if (n !== "node_modules" && n !== ".git") walk(p, r); } else if (wanted(r) && files.length < MAX_FILES) files.push({ path: r, text: fs.readFileSync(p, "utf8").slice(0, MAX_BYTES) }); } };
    walk(dir);
    return { ok: true, files, sha: undefined };
  }
  const gh = parseRepo(entry.sourceRef);
  if (!gh || !sha) return { ok: false, files: [] };
  try {
    const tree = await github(`/repos/${gh.owner}/${gh.repo}/git/trees/${sha}?recursive=1`);
    const prefix = entry.sourceSubdir ? entry.sourceSubdir.replace(/\/$/, "") + "/" : "";
    const paths = (tree?.tree ?? []).filter((t) => t.type === "blob" && t.path.startsWith(prefix)).map((t) => t.path.slice(prefix.length)).filter(wanted).slice(0, MAX_FILES);
    const files = [];
    for (const p of paths) files.push({ path: p, text: (await githubRaw(gh.owner, gh.repo, sha, prefix + p)).slice(0, MAX_BYTES) });
    return { ok: true, files, sha };
  } catch (e) {
    return { ok: false, files: [], error: String(e.message ?? e) };
  }
}

/** GitHub repo facts, cached per run. */
export function repoFacts() {
  const cache = new Map();
  return async (url) => {
    const gh = parseRepo(url);
    if (!gh) return null;
    const key = `${gh.owner}/${gh.repo}`;
    if (!cache.has(key)) {
      // Two calls per distinct repo per run (facts, then the branch tip) — 207 repos
      // across the 237 live url/git-subdir entries, so ~420 calls at steady state.
      // `head` is the CURRENT tip: the catalog pins to what the author publishes
      // today, never to the stale sourceSha in index.json (see Interfaces).
      cache.set(key, github(`/repos/${key}`)
        .then(async (r) => r ? {
          stars: r.stargazers_count,
          license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : undefined,
          pushedAt: r.pushed_at,
          head: (await github(`/repos/${key}/commits/${r.default_branch}`))?.sha,
        } : null)
        .catch(() => null));
    }
    return cache.get(key);
  };
}

/** Member ids a bundle row implies — needed WITHOUT fetching anything, so a skipped
 *  bundle can report its members as seen too. Mirrors the `member(...)` calls below. */
function memberIds(e) {
  const c = e.components ?? {};
  return [
    ...(c.skills ?? []).map((s) => `${e.id}/${s}`),
    ...(c.agents ?? []).map((a) => `${e.id}/${a}`),
    ...(((c.mcpServers ?? []).length || c.hasMcpConfig) ? [`${e.id}/connection`] : []),
  ];
}

export async function normalise(index, files = fetchFiles, repo = repoFacts(), known = {}) {
  const out = [];
  const skipped = [];
  for (const e of index) {
    if (e.deprecated || e.type === "prompt") continue;
    const isOurs = e.sourceMarketplace === "youcoded";
    const facts = isOurs ? { license: "MIT" } : (await repo(e.repoUrl ?? e.sourceRef)) ?? {};
    // The version we are listing: today's HEAD. NEVER e.sourceSha — see Interfaces.
    const sourceCommit = facts.head ?? (isOurs ? undefined : e.sourceSha);
    // Unchanged since the catalog last looked → do not emit it, do not download anything;
    // report it (and its members) as skipped so the retire step knows it was seen. The
    // Worker never hears about it, so it writes nothing (rule 3).
    // skipKey, not the bare commit: an unmoved repo scanned by an older rule set is not
    // up to date. See Interfaces, "Only re-read what changed".
    if (!!sourceCommit && known[e.id] === skipKey(sourceCommit)) {
      skipped.push(e.id, ...memberIds(e));
      continue;
    }
    const fetched = await files(e, sourceCommit);
    const scanned = fetched.ok ? scanFiles(fetched.files, { title: e.displayName }) : null;
    const caps = [];
    if (scanned) {
      caps.push(...scanned.capabilities);
      const mcp = fetched.files.find((f) => f.path === ".mcp.json"); if (mcp) caps.push(...mcpCapabilities(mcp.text, { title: e.displayName }));
      const hooks = fetched.files.find((f) => f.path === "hooks/hooks.json"); const h = hooks && hooksCapability(hooks.text); if (h) caps.push(h);
    }
    const adds = addsLine(e.components); if (adds) caps.push(adds);
    const scan = scanned
      ? (scanned.findings.length
          ? { status: "caution", checkedAt: new Date().toISOString(), findings: scanned.findings, rules: SCAN_RULES_VERSION }
          : { status: "checked", checkedAt: new Date().toISOString(), rules: SCAN_RULES_VERSION })
      : { status: "unchecked" };
    const base = {
      source: isOurs ? "wecoded" : "anthropic",
      origin: isOurs ? "youcoded" : "verified",
      mirroredFrom: isOurs ? undefined : OFFICIAL,
      license: facts.license, stars: facts.stars, sourceCommit,
      author: e.author, repoUrl: e.repoUrl, tags: e.tags, category: e.category, lifeArea: e.lifeArea, audience: e.audience,
      version: e.version, publishedAt: e.publishedAt,
    };
    out.push(makeEntry({ ...base, id: e.id, itemType: "plugin", displayName: e.displayName, description: e.description, tagline: e.tagline, longDescription: e.longDescription,
      sourceType: e.sourceType, sourceRef: e.sourceRef, sourceSubdir: e.sourceSubdir, sourceSha: e.sourceSha, components: e.components,
      capabilities: caps, scan }));
    const member = (itemType, name, displayName, description) => out.push(makeEntry({ ...base, id: `${e.id}/${name}`, itemType, displayName, description,
      sourceType: e.sourceType, sourceRef: e.sourceRef, sourceSubdir: e.sourceSubdir, pluginName: e.id, partOf: { id: e.id, displayName: e.displayName }, capabilities: [], scan }));
    // Member descriptions are left EMPTY, not filled with "Part of <bundle>."
    // The card already shows a `Part of X` chip, and putting the bundle's name
    // into every member's description makes searching that bundle's name match
    // all of its members: type "superpowers" and you get the bundle plus 14
    // near-identical cards. A blank description is honest and does not pollute
    // the search corpus. Real descriptions come from each SKILL.md's frontmatter
    // in the follow-up below.
    const c = e.components ?? {};
    for (const s of c.skills ?? []) member("skill", s, titleCase(s), "");
    for (const a of c.agents ?? []) member("specialist", a, titleCase(a), "");
    if ((c.mcpServers ?? []).length || c.hasMcpConfig) member("tool", "connection", `${e.displayName} (connection)`, "");
  }
  return { rows: out, skipped };
}

const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/^./, (ch) => ch.toUpperCase());

export async function collect({ log, known = {} }) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "index.json"), "utf8"));
  log(`index.json: ${index.length} rows`);
  const { rows, skipped } = await normalise(index, fetchFiles, repoFacts(), known);
  const sources = { wecoded: rows.filter((r) => r.sourceMarketplace === "youcoded"), anthropic: rows.filter((r) => r.sourceMarketplace === "anthropic") };
  log(`wecoded ${sources.wecoded.length}, anthropic ${sources.anthropic.length}, skipped ${skipped.length} unchanged`);
  return { entries: rows, sources, skipped };
}
```

Member descriptions are **empty** here, deliberately — see the comment in the code. The
ingest reads each `SKILL.md`'s frontmatter `description` in a follow-up (one raw fetch per
skill — ~2,000 calls, out of the hourly budget; ROADMAP). Until then a member card shows its
name, its kind, and its `Part of X` chip, which is enough to pick it out of a list.

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS. Then a real dry run: `GITHUB_TOKEN=$(gh auth token) node scripts/catalog/build.mjs --source wecoded --dry-run` → writes `catalog-dry-run-wecoded.json` and `catalog-dry-run-anthropic.json`; open one bundle and eyeball `catalog.capabilities` against its repo, **and check that `catalog.sourceCommit` matches that repo's current branch tip on GitHub, not the entry's `sourceSha`.** Add `catalog-dry-run-*.json` and `catalog-report.json` to `.gitignore`.

- [ ] **Step 5: Commit** `git add scripts/catalog .gitignore && git commit -m "feat(catalog): wecoded source — bundles, members, scan"`.

---

### Task 13: Sources — Docker, awesome-copilot, cursorrules

**Files:**
- Create: `scripts/catalog/sources/docker.mjs`, `scripts/catalog/sources/awesome-copilot.mjs`, `scripts/catalog/sources/cursorrules.mjs`
- Test: `scripts/catalog/test/sources.test.mjs` with fixtures `docker-sample.json` (the `brave` entry, verbatim from 2026-08-28), `copilot-marketplace-sample.json` (one string-source and one object-source plugin), `cursorrules-sample.mdc`.

**Interfaces (each file):** `normalise(raw, helpers) → SkillEntry[]` (pure, tested) and `collect({ log }) → { entries }`.

Facts the code relies on (verified 2026-08-28): Docker `catalog.json` is `{ registry: { [slug]: {...} } }` — **no `name` key**, `tools[]` are `{name}` stubs, `metadata.license` is free text, `source` is `https://github.com/<o>/<r>/tree/<sha>…`, `image` is `mcp/<x>@sha256:…` for Docker-built, `secrets[]{name,env,description}`, `oauth` `{}` or populated, `allowHosts[]`, `disableNetwork`, `volumes[]`, `longLived`. awesome-copilot `marketplace.json` `plugins[]` has `source` as **string** `plugins/<name>` (in-repo) or **object** `{source:"github", repo, ref}`; no `category`; `skills/<name>/SKILL.md` (415), `agents/*.agent.md` (223), `instructions/*.instructions.md` (193). awesome-cursorrules: flat `rules/<slug>.mdc` (257) with YAML frontmatter `description`, `globs`, `alwaysApply`; LICENSE is CC0-1.0.

- [ ] **Step 1: Failing tests** — `scripts/catalog/test/sources.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import docker from "./fixtures/docker-sample.json" with { type: "json" };
import copilot from "./fixtures/copilot-marketplace-sample.json" with { type: "json" };
import fs from "node:fs";
import { normalise as normaliseDocker } from "../sources/docker.mjs";
import { normalise as normaliseCopilot } from "../sources/awesome-copilot.mjs";
import { normalise as normaliseRules } from "../sources/cursorrules.mjs";

test("docker: slug from the map key, verified when Docker built the image, secrets/oauth/hosts → capabilities", () => {
  const [brave] = normaliseDocker(docker);
  assert.equal(brave.id, "docker-brave");
  assert.equal(brave.displayName, "Brave Search");
  assert.equal(brave.catalog.itemType, "tool");
  assert.equal(brave.catalog.origin.tier, "verified");          // image starts with mcp/
  assert.equal(brave.catalog.origin.mirroredFrom, "Docker MCP Catalog");
  assert.equal(brave.catalog.license, "MIT");                    // "MIT License" → SPDX
  assert.equal(brave.catalog.upstreamId, "brave");
  assert.equal(brave.repoUrl, "https://github.com/brave/brave-search-mcp-server");
  assert.match(brave.catalog.sourceCommit, /^[0-9a-f]{7,40}$/);  // from source .../tree/<sha>
  assert.ok(brave.catalog.capabilities.some((c) => c.kind === "secret" && c.detail === "BRAVE_API_KEY"));
  assert.ok(brave.catalog.capabilities.some((c) => c.kind === "network"));
  assert.ok(brave.catalog.capabilities.some((c) => c.kind === "adds" && /tool/.test(c.label)));
  assert.equal(brave.catalog.scan.status, "unchecked");           // no files read here; Docker's provenance is not our scan
  assert.equal(brave.sourceType, "mcp-registry");
});

test("copilot: in-repo plugins pin to the repo sha as git-subdir; external ones resolve their tag", () => {
  const rows = normaliseCopilot(copilot, { repoSha: "deadbeef", resolveRef: () => "cafe1234" });
  const inRepo = rows.find((r) => r.id === "copilot-accessibility-kanban");
  assert.equal(inRepo.sourceType, "git-subdir");
  assert.equal(inRepo.sourceRef, "https://github.com/github/awesome-copilot.git");
  assert.equal(inRepo.sourceSubdir, "plugins/accessibility-kanban");
  assert.equal(inRepo.catalog.sourceCommit, "deadbeef");
  assert.equal(inRepo.catalog.origin.tier, "verified");
  assert.equal(inRepo.catalog.license, "MIT");
  const ext = rows.find((r) => r.id === "copilot-agent-council");
  assert.equal(ext.sourceType, "url");
  assert.equal(ext.sourceRef, "https://github.com/Avyayalaya/agent-council.git");
  assert.equal(ext.catalog.sourceCommit, "cafe1234");
  assert.equal(ext.catalog.origin.tier, "community");
});

test("cursorrules: one prompt row per .mdc, CC0, text inline", () => {
  const text = fs.readFileSync(new URL("./fixtures/cursorrules-sample.mdc", import.meta.url), "utf8");
  const [row] = normaliseRules([{ path: "rules/android-jetpack-compose-cursorrules-prompt-file.mdc", text }], { sha: "88ab01d" });
  assert.equal(row.id, "cursorrules-android-jetpack-compose");
  assert.equal(row.type, "prompt");
  assert.equal(row.catalog.itemType, "prompt");
  assert.equal(row.catalog.license, "CC0-1.0");
  assert.equal(row.version, "88ab01d");   // the commit IS the version — see Task 2; "1.0.0" would never move
  assert.match(row.description, /Jetpack Compose/);
  assert.ok(row.prompt.includes("Jetpack Compose"));
  assert.equal(row.catalog.scan.status, "checked");
  assert.deepEqual(row.catalog.capabilities, []);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`sources/docker.mjs`:
```js
import { getJson } from "../lib/http.mjs";
import { makeEntry, licenseToSpdx, slug } from "../lib/entry.mjs";
const URL_ = "https://desktop.docker.com/mcp/catalog/v3/catalog.json";

export function normalise(catalog) {
  const out = [];
  for (const [key, s] of Object.entries(catalog.registry ?? {})) {
    if (s.type && s.type !== "server" && s.type !== "remote") continue;
    const title = s.title || key;
    const caps = [];
    for (const sec of s.secrets ?? []) caps.push({ kind: "secret", label: `Needs a ${title} key`, detail: sec.env || sec.name });
    if (s.oauth && Object.keys(s.oauth).length) caps.push({ kind: "secret", label: `Signs in to ${title} with your account` });
    if (s.disableNetwork) { /* no network line */ }
    else if (Array.isArray(s.allowHosts) && s.allowHosts.length) caps.push({ kind: "network", label: "Connects to the internet", detail: s.allowHosts.map((h) => h.replace(/:\d+$/, "")).slice(0, 3).join(", ") });
    else caps.push({ kind: "network", label: "Connects to the internet" });
    if (Array.isArray(s.volumes) && s.volumes.length) caps.push({ kind: "files", label: "Reads and writes folders you choose" });
    if (s.longLived) caps.push({ kind: "auto", label: "Keeps running in the background" });
    const tools = Array.isArray(s.tools) ? s.tools.length : 0;
    if (tools) caps.push({ kind: "adds", label: `Adds ${tools} tool${tools === 1 ? "" : "s"}` });
    const sha = String(s.source ?? "").match(/\/tree\/([0-9a-f]{7,40})/)?.[1];
    out.push(makeEntry({
      source: "docker", id: `docker-${slug(key)}`, itemType: "tool", displayName: title, description: s.description ?? "",
      author: s.metadata?.owner ?? "", repoUrl: s.upstream || undefined, tags: (s.metadata?.tags ?? []).slice(0, 6),
      category: s.metadata?.category === "productivity" ? "productivity" : "development",
      sourceType: "mcp-registry", sourceRef: `docker:${s.image ?? key}`,
      origin: String(s.image ?? "").startsWith("mcp/") ? "verified" : "community", mirroredFrom: "Docker MCP Catalog",
      license: licenseToSpdx(s.metadata?.license), upstreamId: key, stars: s.metadata?.githubStars, sourceCommit: sha,
      capabilities: caps, scan: { status: "unchecked" },
      publishedAt: s.dateAdded,
    }));
  }
  return out;
}

export async function collect({ log }) {
  const catalog = await getJson(URL_);
  const entries = normalise(catalog);
  log(`${Object.keys(catalog.registry ?? {}).length} servers → ${entries.length} rows`);
  return { entries };
}
```

`sources/awesome-copilot.mjs`:
```js
import { getJson, github } from "../lib/http.mjs";
import { makeEntry, slug } from "../lib/entry.mjs";
const REPO = "github/awesome-copilot", CLONE = `https://github.com/${REPO}.git`, RAW = `https://raw.githubusercontent.com/${REPO}/main`;

export function normalise(marketplace, { repoSha, resolveRef, tree = [] }) {
  const out = [];
  const common = { source: "awesome-copilot", mirroredFrom: "github/awesome-copilot", scan: { status: "unchecked" }, capabilities: [] };
  for (const p of marketplace.plugins ?? []) {
    if (typeof p.source === "string") {
      out.push(makeEntry({ ...common, id: `copilot-${slug(p.name)}`, itemType: "plugin", displayName: p.name, description: p.description, author: "GitHub",
        repoUrl: `https://github.com/${REPO}/tree/main/${p.source}`, tags: (p.keywords ?? []).slice(0, 6), version: p.version,
        sourceType: "git-subdir", sourceRef: CLONE, sourceSubdir: p.source, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: p.name }));
    } else if (p.source && p.source.source === "github" && p.source.repo) {
      const ref = p.source.ref;
      out.push(makeEntry({ ...common, id: `copilot-${slug(p.name)}`, itemType: "plugin", displayName: p.name, description: p.description, author: p.author?.name ?? p.source.repo.split("/")[0],
        repoUrl: `https://github.com/${p.source.repo}`, tags: (p.keywords ?? []).slice(0, 6), version: p.version,
        sourceType: "url", sourceRef: `https://github.com/${p.source.repo}.git`, origin: "community", license: p.license, sourceCommit: resolveRef(p.source.repo, ref), upstreamId: `${p.source.repo}@${ref ?? "HEAD"}` }));
    }
  }
  // Standalone items in the repo tree: skills, agents (specialists), instructions (prompts).
  for (const t of tree) {
    const m = t.match(/^skills\/([^/]+)\/SKILL\.md$/); if (m) out.push(makeEntry({ ...common, id: `copilot-skill-${slug(m[1])}`, itemType: "skill", displayName: titleCase(m[1]), description: `Skill from github/awesome-copilot: ${m[1]}.`, author: "GitHub", repoUrl: `https://github.com/${REPO}/tree/main/skills/${m[1]}`, sourceType: "git-subdir", sourceRef: CLONE, sourceSubdir: `skills/${m[1]}`, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: `skills/${m[1]}` }));
    const a = t.match(/^agents\/([^/]+)\.agent\.md$/); if (a) out.push(makeEntry({ ...common, id: `copilot-agent-${slug(a[1])}`, itemType: "specialist", displayName: titleCase(a[1]), description: `Specialist from github/awesome-copilot: ${a[1]}.`, author: "GitHub", repoUrl: `https://github.com/${REPO}/blob/main/${t}`, sourceType: "file", sourceRef: `${RAW}/${t}`, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: t }));
    const i = t.match(/^instructions\/([^/]+)\.instructions\.md$/); if (i) out.push(makeEntry({ ...common, id: `copilot-instructions-${slug(i[1])}`, itemType: "prompt", displayName: titleCase(i[1]), description: `Instructions from github/awesome-copilot: ${i[1]}.`, author: "GitHub", repoUrl: `https://github.com/${REPO}/blob/main/${t}`, sourceType: "file", sourceRef: `${RAW}/${t}`, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: t }));
  }
  return out;
}
const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function collect({ log }) {
  const marketplace = await getJson(`${RAW}/.github/plugin/marketplace.json`);
  const head = await github(`/repos/${REPO}/commits/HEAD`);
  const tree = (await github(`/repos/${REPO}/git/trees/${head.sha}?recursive=1`))?.tree?.map((t) => t.path) ?? [];
  const refCache = new Map();
  const resolveRef = (repo, ref) => refCache.get(`${repo}@${ref}`);
  // Resolve external refs up front (one call each) so normalise stays pure.
  for (const p of marketplace.plugins ?? []) if (p.source && typeof p.source === "object") {
    const k = `${p.source.repo}@${p.source.ref}`; if (!refCache.has(k)) refCache.set(k, (await github(`/repos/${p.source.repo}/commits/${p.source.ref ?? "HEAD"}`))?.sha);
  }
  const entries = normalise(marketplace, { repoSha: head.sha, resolveRef, tree });
  log(`${entries.length} rows (plugins + skills + specialists + instructions)`);
  return { entries };
}
```
`sourceType: "file"` rows (a single markdown file) cannot be installed by the current installer; Task 21 hides Install for `sourceType` ∉ {local,url,git-subdir} — **including the `instructions/*` rows above, which are `type: "prompt"` but carry no `prompt` text** (they are pointers, not inline prompts).

Docker and awesome-copilot rows are sent every run; the Worker's write-skip (rule 3) makes that free when nothing changed. That only holds if **nothing in these two files varies per run** — no `new Date()`, no run id, no "fetched at" — which is why neither source stamps a `checkedAt` and `makeEntry` no longer defaults dates.

`sources/cursorrules.mjs`:
```js
import { github, githubRaw } from "../lib/http.mjs";
import { makeEntry, slug } from "../lib/entry.mjs";
import { skipKey, SCAN_RULES_VERSION } from "../lib/capabilities.mjs";
const REPO = "PatrickJS/awesome-cursorrules";

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {}; for (const line of m[1].split("\n")) { const kv = line.match(/^(\w+):\s*(.*)$/); if (kv) meta[kv[1]] = kv[2].replace(/^"|"$/g, ""); }
  return { meta, body: m[2] };
}

export function normalise(files, { sha }) {
  return files.map(({ path, text }) => {
    const name = path.replace(/^rules\//, "").replace(/\.mdc$/, "").replace(/-cursorrules-prompt-file$/, "");
    const { meta, body } = frontmatter(text);
    return makeEntry({
      source: "cursorrules", id: `cursorrules-${slug(name)}`, itemType: "prompt", displayName: name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      // The short commit is the version (Task 2): the app's Update badge compares version
      // strings, and a fixed "1.0.0" would mean an edited rule upstream never shows as one.
      version: sha.slice(0, 7),
      description: meta.description || `Cursor rules: ${name}.`, author: "PatrickJS", repoUrl: `https://github.com/${REPO}/blob/main/${path}`,
      sourceType: "file", sourceRef: `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`, prompt: body.trim().slice(0, 32 * 1024),
      origin: "community", mirroredFrom: "PatrickJS/awesome-cursorrules", license: "CC0-1.0", sourceCommit: sha, upstreamId: path,
      capabilities: [], scan: { status: "checked", checkedAt: new Date().toISOString(), rules: SCAN_RULES_VERSION },   // plain text, no code — read in full above
    });
  });
}

export async function collect({ log, known = {} }) {
  const head = await github(`/repos/${REPO}/commits/HEAD`);
  // 257 files that change roughly never. If the repo tip has not moved since the
  // catalog last read it, download nothing — re-emitting them would be ~257
  // pointless raw fetches an hour. One sample id is enough to tell.
  const mine = Object.keys(known).filter((k) => k.startsWith("cursorrules-"));
  if (mine.length && known[mine[0]] === skipKey(head.sha)) {
    log(`unchanged at ${head.sha.slice(0, 7)} — skipping`);
    // Everything the catalog holds for this source was seen: nothing sent, nothing retired.
    return { entries: [], skipped: mine };
  }
  const tree = (await github(`/repos/${REPO}/git/trees/${head.sha}?recursive=1`))?.tree ?? [];
  const paths = tree.filter((t) => t.type === "blob" && /^rules\/[^/]+\.mdc$/.test(t.path)).map((t) => t.path);
  const files = [];
  for (const p of paths) files.push({ path: p, text: await githubRaw("PatrickJS", "awesome-cursorrules", head.sha, p) });
  const entries = normalise(files, { sha: head.sha });
  log(`${entries.length} rules`);
  return { entries };
}
```

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS; then `GITHUB_TOKEN=$(gh auth token) node scripts/catalog/build.mjs --source docker --dry-run` (and `awesome-copilot`, `cursorrules`) — each writes its dry-run file; spot-check three rows each.

- [ ] **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): docker, awesome-copilot, cursorrules sources"`.

---

### Task 14: The workflow, docs, first real run

**Files:**
- Create: `.github/workflows/catalog-ingest.yml`
- Create: `docs/catalog.md` (repo-local)
- Modify: `.github/workflows/validate-plugin-pr.yml` — make the secret **content** scan blocking
- Delete: `themes/index.json`; prune `overrides/`
- Modify: `curated-defaults.json`
- Modify: `README.md` (root; fix the stale counts while there — **compute every number from `index.json` at edit time; do not copy one from a doc.** As of 2026-08-28 it is 339 entries / 302 live / 13 live YouCoded / 289 live Anthropic, and those move on every plugin merge. Also delete the claim that `stats.json` is "rebuilt daily by CI" — no such CI exists), `CONTRIBUTING.md` (remove "edit index.json"; plugins live at the top level, not `plugins/`)

- [ ] **Step 1: Workflow**

```yaml
name: Catalog ingest

on:
  # Hourly is the only trigger. There is deliberately NO `push` trigger on
  # index.json: the job that rebuilds it (validate-plugin-pr.yml → rebuild)
  # commits with `[skip ci]` in the message, and GitHub skips every workflow for
  # such a commit — so a push trigger would look right and never once fire.
  # A merged plugin PR therefore appears within the hour, which is the promise.
  schedule:
    - cron: "13 * * * *"
  workflow_dispatch:
    inputs:
      source: { description: "one source (blank = all)", required: false, default: "" }
      force_rescan: { description: "re-read every file, ignoring stored commits", type: boolean, default: false }
      allow_mass_retire: { description: "let a run delist >20% of a source (a REAL bulk removal upstream)", type: boolean, default: false }

concurrency: { group: catalog-ingest, cancel-in-progress: false }

# WHO NOTICES WHEN THIS BREAKS.
# `build.mjs` exits non-zero when any source errors, is refused by the retire guard, or
# produces zero rows — so a broken scraper turns this run red and GitHub emails the repo
# owner about a failed scheduled workflow. That is the alarm; there is no other one, which
# is why the script must never swallow a bad source into a green run.
# The hole it does not cover: **GitHub disables `schedule:` triggers on a repository with
# 60 days of no activity**, silently. A dead cron produces no failures at all, just a
# catalog frozen at its last good hour. `GET /admin/catalog/health` (Task 6) is how a human
# checks; it is also the thing to wire into the admin dashboard if this repo ever goes
# quiet for a season.

jobs:
  ingest:
    runs-on: ubuntu-latest
    # A steady-state run is minutes: ~420 GitHub API calls and a few dozen raw
    # file downloads, because unchanged entries are skipped. 30 minutes is the
    # ceiling for a --force-rescan; if a NORMAL run approaches it, the skip logic
    # has broken — investigate, do not raise this.
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: "20" }
      - run: node --test scripts/catalog/test/
      - name: Ingest
        env:
          CATALOG_INGEST_TOKEN: ${{ secrets.MARKETPLACE_CATALOG_INGEST_TOKEN }}
          # 1,000 API requests/hour per repository. http.mjs stops at 200 left.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          RESCAN=""; if [ "${{ inputs.force_rescan }}" = "true" ]; then RESCAN="--force-rescan"; fi
          MASS=""; if [ "${{ inputs.allow_mass_retire }}" = "true" ]; then MASS="--allow-mass-retire"; fi
          SRC=""; if [ -n "${{ inputs.source }}" ]; then SRC="--source ${{ inputs.source }}"; fi
          node scripts/catalog/build.mjs $SRC $RESCAN $MASS
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: catalog-report, path: catalog-report.json, retention-days: 14 }
```

- [ ] **Step 1b: Close the marketplace-repo cruft while we are in here**

Four one-liners that would otherwise each need their own PR, and one that matters:

1. **The secret-content scan must block, not warn.** `.github/workflows/validate-plugin-pr.yml`
   (~line 161) prints `::warning::` and does not set `FOUND_SECRETS=1`, so a live token in a
   file passes CI — while secret-looking *filenames* correctly fail. This plan's scanner
   (Task 11, `HARDCODED_KEY_RE`) already treats the same patterns as a **Caution** finding on
   the listing, so after this ships the identical rule exists in two places at two strengths.
   Make the content scan set `FOUND_SECRETS=1` like the filename checks do, and widen its
   patterns to match `capabilities.mjs` (`sk-`, `ghp_`, `gho_`, `AKIA`, `xox[baprs]-`).
   **Say so in the PR body:** this can fail a submission that passed yesterday, which is the
   intent, but it should not be a surprise.
2. **Delete `themes/index.json`.** It is a 2-of-7 subset of the themes registry, generated
   `2026-04-07`, superseded by `wecoded-themes/registry/theme-registry.json` (7 themes,
   regenerated continuously). Nothing reads it. Leaving a stale second registry in the tree
   is how a future session ships against the wrong file.
3. **Prune `overrides/`.** 24 files: **13 target ids that are deprecated**, and one
   (`youcoded-drive`) targets an id that does not exist — the registry's is `google-drive`.
   Delete the 13, fix or delete the one. Verify with a script over `index.json`, do not
   eyeball it.
4. **`curated-defaults.json` names `theme-builder`, which is not a registry id.** The plugin
   is `wecoded-themes-plugin`; `theme-builder` is a skill inside it. This is not a silent
   no-op — the bare string is already written into users' `~/.claude/youcoded-skills.json`
   → `favorites[]`, where it resolves to nothing. Point it at `wecoded-themes-plugin`.
   (Cleaning the dead entry out of existing profiles is app-side — Task 22.)

- [ ] **Step 2: Docs** — `docs/catalog.md`: what the catalog is, the four sources with their licences and the mirror/link decision (Docker repo MIT but served JSON unlicensed — we store metadata only; awesome-copilot MIT; cursorrules CC0; Anthropic official Apache-2.0 for the 53 local, the rest are pointers), **the merge rule and why a degraded run must never downgrade a row**, **the write-skip and why no source may stamp a per-run value into a row that did not change**, **the retire guard, that the retire list is computed by the ingest, and when to use `allow_mass_retire`**, **`SCAN_RULES_VERSION` — bump it to re-scan the whole catalog, do not reach for `--force-rescan`**, the "only re-read what changed" skip, what "Likely safe" means in v1 (rule-based; SkillSpector is the next step), the `CATALOG_ENABLED` kill switch and how to use it, how to run locally (`--dry-run`), the retire semantics, and the env vars. README/CONTRIBUTING corrections as listed.

- [ ] **Step 3: Commit, push, PR** — `git add .github/workflows/catalog-ingest.yml docs/catalog.md README.md CONTRIBUTING.md && git commit -m "feat(catalog): hourly ingest workflow + docs"`; push; `gh pr create` titled `feat(catalog): ingest pipeline — four sources → Worker catalog` with the standard footer. Before merging: the Worker PR from Task 7 is merged and deployed, and Destin has added `MARKETPLACE_CATALOG_INGEST_TOKEN` (tell him in the PR: `openssl rand -hex 32`, paste into repo Settings → Secrets; the Worker deploy pushes the same value to the Worker).

- [ ] **Step 4: First real run** — `gh workflow run catalog-ingest.yml --repo itsdestin/wecoded-marketplace -f force_rescan=true`, then `gh run watch`. Expected: **a green run** (the script exits non-zero on any error, refusal or empty source) and a report artifact with `upserted` per source and no `error` / `refused`. Then:

```bash
curl -s https://wecoded-marketplace-api.destinj101.workers.dev/catalog | python3 -c "
import json,sys,collections; d=json.load(sys.stdin); e=d['entries']
print(len(e), collections.Counter(x['sourceMarketplace'] for x in e))
print(collections.Counter(x['catalog']['itemType'] for x in e))
print(collections.Counter(x['catalog']['scan']['status'] for x in e))"
```
Expected: roughly 5,000 rows; every row has `catalog`; scan statuses are a mix of `checked`, `caution` and `unchecked` (never all `checked`). Paste the numbers into the PR.

- [ ] **Step 4b: Prove the two rules that make this safe to leave running**

```bash
API=https://wecoded-marketplace-api.destinj101.workers.dev
# Response size, and that a repeat fetch is free.
curl -s -o /dev/null -w 'bytes=%{size_download}\n' $API/catalog
ETAG=$(curl -sI $API/catalog | grep -i '^etag:' | cut -d' ' -f2- | tr -d '\r')
curl -s -o /dev/null -w 'repeat=%{http_code} bytes=%{size_download}\n' -H "If-None-Match: $ETAG" $API/catalog
```
Expected: a few MB the first time, **`repeat=304 bytes=0`** the second. If the repeat is 200,
the ETag path is broken and every device will re-download the whole catalog hourly — stop and
fix it before the app-wiring phase ships.

Then let the **second** hourly run happen and read its `catalog-report.json`: for
`wecoded`/`anthropic`, `skipped` should be nearly everything and `sent` small; for
`docker`/`awesome-copilot`, `sent` is everything but `unchanged` is nearly all of it; across
every source, `upserted` (rows actually written) should be in the dozens, the run should
finish in minutes, and no row's `scan.status` should have moved from `checked` to
`unchecked`. That is all three rules working. Then cross-check the one number the report
cannot see — **rows written, on the D1 dashboard** (Cloudflare → Workers & Pages → D1 → the
database → Metrics): the hour should be in the hundreds, not thousands. If it is thousands,
some source is stamping a per-run value (a date, a timestamp) into rows that did not change,
defeating the write-skip; find it before the second day, because the free tier is 100,000
row-writes/day. Re-run this check the first time a run *does* hit the GitHub limit — that is
the failure the merge rule exists for.

- [ ] **Step 5: ROADMAP** (workspace) — under the overhaul entry note "catalog service live <date>"; add follow-ups: **the official MCP Registry source (see Deferred below)**; SkillSpector / Cisco skill-scanner as a second scan stage; member descriptions from SKILL.md frontmatter; Docker `toolsUrl` fetch for tool descriptions; Layer E (sub-registry API) now has its data.

---

## Phase 3 — The unchecked shield stays; make it say why

**Settled 2026-08-30 by Destin, and it is not an open question any more.** The spec (§1.6)
asked whether a grey "Not checked" shield on roughly half the grid would read as *"this
marketplace is unsafe"*, and floated rendering no shield at all in that case. **The shield
stays.** The reason is the one the alternative got backwards: the absence of a badge reads as
*nothing to worry about*, and for a mirrored listing nobody has scanned, that is the wrong
message. A visible "Not checked" tells the user this one is on them to look at — which is
true, and is exactly the nudge worth giving.

That turns this phase from a decision into a copy task: the badge must now *earn* the space
it takes, so the wording and the hover explanation have to carry the "review this yourself"
meaning rather than just naming a state.

### Task 15: Make the unchecked shield say what the user should do

**Files:**
- Modify: the trust-badge component on the app branch (find with
  `rg -n "Not checked" desktop/src/renderer`)
- Test: whichever badge test already covers the three statuses (`rg -n "Likely safe" desktop/tests`)

**Interfaces:**
- Produces: `scan.status === 'unchecked'` still renders the grey shield on cards and the detail
  page. Its hover/tooltip text stops describing the system and starts telling the user what it
  means for them — one sentence, no jargon, in the shape of "We haven't checked this one — see
  What this can do, or open the source before installing." (Exact wording is Destin's call; put
  it in the deck at Task 23 rather than guessing alone.)

- [ ] **Step 1: Update the tooltip copy for `unchecked`** — and only the copy. The badge, its
  colour and its placement are approved and unchanged.
- [ ] **Step 2: Check it against the real ratio once the catalog is live.** Not to reopen the
  decision — to see the grid the user will actually see:

```bash
curl -s https://wecoded-marketplace-api.destinj101.workers.dev/catalog \
  | python3 -c "import json,sys,collections; e=json.load(sys.stdin)['entries']; \
      print(collections.Counter((x.get('catalog') or {}).get('scan',{}).get('status','none') for x in e))"
```
  If `unchecked` turns out to dominate far past the ~half estimate, that is a signal about
  **scanner coverage** (which sources get their files read — Task 12/13), not about the badge.
  Raise it as a ROADMAP item; do not resolve it by hiding the badge.
- [ ] **Step 3:** `bash scripts/verify.sh marketplace-ui` → OK; commit as
  `feat(marketplace): the unchecked shield tells the user to review it themselves`.

---

## Phase 4 — The app reads the catalog

Back on the app branch. Everything here needs Phase 2 deployed and its first ingest run
finished, because these tasks are verified against the live `/catalog`, not against a fixture.
(Phase 3 no longer gates this — the shield question was settled on 2026-08-30.)

Desktop first (Tasks 16–18), then Android (Task 19) which mirrors all three, then the three
pieces that are neither (Tasks 20–22).

### Task 16: Desktop — `fetchIndex()` reads the catalog first

**Files:**
- Modify: `desktop/src/main/skill-provider.ts` (constants lines 45–56; `fetchIndex` lines 654–670; `invalidateCache` lines 607–611)
- Test: `desktop/tests/skill-provider-catalog.test.ts`

**Interfaces:**
- Consumes: `MARKETPLACE_API_HOST` from `desktop/src/renderer/state/marketplace-api-client.ts` (main already imports from that module in `marketplace-api-handlers.ts:9`).
- Produces: `LocalSkillProvider.fetchIndex(): Promise<SkillEntry[]>` unchanged signature; entries now carry `catalog` when the Worker answered. Env override `YOUCODED_CATALOG_URL` (tests) — empty string disables the catalog step.

- [ ] **Step 1: Find how existing provider tests build a provider and stub fetch**

Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui/desktop && rg -n "new LocalSkillProvider|globalThis.fetch|vi.stubGlobal\('fetch'" tests | head`
Use the constructor call you find (it needs a config store and paths — copy the arrange block from the test that has it) in the test below; the fetch stub pattern is `globalThis.fetch = vi.fn(...)` as in `tests/review-list.test.tsx` history.

- [ ] **Step 2: Write the failing test**

Create `desktop/tests/skill-provider-catalog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The provider writes its cache under ~/.claude — point HOME at a scratch dir
// so the test never touches the real cache.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-'));
vi.stubEnv('HOME', home);
vi.stubEnv('USERPROFILE', home);
vi.stubEnv('YOUCODED_CATALOG_URL', 'https://catalog.test/catalog');

import { LocalSkillProvider } from '../src/main/skill-provider';

const CATALOG_ROW = {
  id: 'superpowers', type: 'plugin', displayName: 'Superpowers', description: 'x', category: 'development',
  author: 'Anthropic', tags: [], version: '1.0.1', publishedAt: '2026-01-01T00:00:00Z',
  sourceMarketplace: 'anthropic', sourceType: 'url', sourceRef: 'https://github.com/obra/superpowers.git',
  catalog: { itemType: 'plugin', origin: { tier: 'verified' }, scan: { status: 'checked' }, capabilities: [], sourceCommit: 'e91a6c0' },
};
const INDEX_ROW = { ...CATALOG_ROW, catalog: undefined };

function makeProvider() {
  // Copy the constructor arrange block from the existing provider test found in Step 1.
  return new LocalSkillProvider(/* … */);
}

// Module-scope so the second describe (Task 18) can reuse it.
let fetchMock: ReturnType<typeof vi.fn>;

describe('fetchIndex — catalog first, index.json fallback', () => {
  beforeEach(() => {
    fs.rmSync(path.join(home, '.claude', 'youcoded-marketplace-cache'), { recursive: true, force: true });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns catalog rows (with the catalog block) when the Worker answers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200 }));
    const entries = await makeProvider().listMarketplace();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://catalog.test/catalog');
    expect(entries[0].catalog?.sourceCommit).toBe('e91a6c0');
  });

  it('falls back to raw index.json when the Worker fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([INDEX_ROW]), { status: 200 }));
    const entries = await makeProvider().listMarketplace();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/raw\.githubusercontent\.com.*\/index\.json$/);
    expect(entries[0].id).toBe('superpowers');
    expect(entries[0].catalog).toBeUndefined();
  });

  it('sends If-None-Match once it has an ETag, and keeps the body on a 304', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200, headers: { ETag: '"cat-7"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const p = makeProvider();
    await p.listMarketplace();
    // Age the cache past the TTL so the second call goes to the network.
    const file = path.join(home, '.claude', 'youcoded-marketplace-cache', 'catalog.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...raw, fetchedAt: 0 }));
    const entries = await p.listMarketplace();
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"cat-7"');
    expect(entries[0].id).toBe('superpowers');          // 304 → cached body reused
    expect(fetchMock).toHaveBeenCalledTimes(2);         // never fell through to index.json
  });

  it('serves the catalog from cache within the TTL', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200 }));
    const p = makeProvider();
    await p.listMarketplace();
    await p.listMarketplace();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a stale catalog cache when both network paths fail', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200 }));
    const p = makeProvider();
    await p.listMarketplace();
    // Age the cache past the TTL, then make every fetch fail.
    const file = path.join(home, '.claude', 'youcoded-marketplace-cache', 'catalog.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...raw, fetchedAt: 0 }));
    fetchMock.mockRejectedValue(new Error('offline'));
    const entries = await p.listMarketplace();
    expect(entries[0].id).toBe('superpowers');
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/skill-provider-catalog.test.ts`
Expected: FAIL — first call goes to `raw.githubusercontent.com/...index.json`, not the catalog.

- [ ] **Step 4: Implement**

In `desktop/src/main/skill-provider.ts`, next to the other constants (after `INDEX_TTL`, line ~54):

```ts
import { MARKETPLACE_API_HOST } from '../renderer/state/marketplace-api-client';
// Marketplace overhaul: the Worker's catalog is the source of truth —
// it carries the type / origin / scan / capabilities block the UI renders and is
// refreshed hourly by CI. index.json on GitHub stays as the fallback so an
// outage (or an old Worker) degrades to today's behaviour, not to an empty grid.
// YOUCODED_CATALOG_URL: tests point it at a fake; "" disables the catalog step.
const CATALOG_URL = process.env.YOUCODED_CATALOG_URL ?? `${MARKETPLACE_API_HOST}/catalog`;
const CATALOG_CACHE = path.join(CACHE_DIR, 'catalog.json');
// 1h, not 24h: the Worker already caches 5 min and CI refreshes hourly, so a
// newly published plugin shows up within the hour instead of the next day.
const CATALOG_TTL = 60 * 60 * 1000;
```

Replace `fetchIndex()` (lines 654–670) with:

```ts
  private async fetchIndex(): Promise<SkillEntry[]> {
    // 1. Fresh catalog cache.
    const cachedCatalog = this.readCache<SkillEntry[]>(CATALOG_CACHE, CATALOG_TTL);
    if (cachedCatalog) return cachedCatalog;
    // 2. The Worker's catalog. The ETag matters: this response is several MB and we
    //    ask for it every hour, so on the ~23 hours out of 24 when nothing changed
    //    the Worker answers 304 with an empty body and we keep what we have.
    //    A 503 here is the CATALOG_ENABLED kill switch — treat it as any failure.
    if (CATALOG_URL) {
      try {
        const prevTag = this.readCacheEtag(CATALOG_CACHE);
        const resp = await fetch(CATALOG_URL, prevTag ? { headers: { 'If-None-Match': prevTag } } : undefined);
        if (resp.status === 304) {
          const stale = this.readCache<SkillEntry[]>(CATALOG_CACHE, Infinity);
          if (stale) { this.touchCache(CATALOG_CACHE, prevTag); return stale; }
        } else if (resp.ok) {
          const body = await resp.json() as { entries?: SkillEntry[] };
          if (Array.isArray(body.entries)) {
            this.writeCache(CATALOG_CACHE, body.entries, resp.headers.get('ETag') ?? undefined);
            return body.entries;
          }
        }
      } catch { /* fall through to index.json */ }
    }
    // 3. Raw index.json on GitHub (pre-overhaul path, unchanged).
    const cachedIndex = this.readCache<SkillEntry[]>(INDEX_CACHE, INDEX_TTL);
    if (cachedIndex) return cachedIndex;
    try {
      const resp = await fetch(`${REGISTRY_BASE}/index.json`);
      if (resp.ok) {
        const data = await resp.json() as SkillEntry[];
        this.writeCache(INDEX_CACHE, data);
        return data;
      }
    } catch { /* fall through to stale caches */ }
    // 4. Anything stale, newest source first.
    return this.readCache<SkillEntry[]>(CATALOG_CACHE, Infinity)
      ?? this.readCache<SkillEntry[]>(INDEX_CACHE, Infinity)
      ?? [];
  }
```

`writeCache` / `readCache` gain an optional `etag` on the envelope they already write
(`{ fetchedAt, data }` → `{ fetchedAt, etag?, data }`), plus two small helpers:
`readCacheEtag(file)` reads it back regardless of age, and `touchCache(file, etag)` rewrites
only `fetchedAt` so a 304 resets the TTL without re-serialising megabytes. Existing callers
are unaffected — the field is optional and every other cache omits it.

In `invalidateCache()` add `CATALOG_CACHE` to the file list:

```ts
    for (const file of [CATALOG_CACHE, INDEX_CACHE, DEFAULTS_CACHE, FEATURED_CACHE]) {
```

- [ ] **Step 5: Run to see it pass, then the gate**

Run: `npx vitest run tests/skill-provider-catalog.test.ts` → PASS (5).
Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK. (`knip` may flag the renderer import from main — `marketplace-api-handlers.ts` already does the same import, so it is allowed; if knip complains, it lists the exact rule.)

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/skill-provider.ts desktop/tests/skill-provider-catalog.test.ts
git commit -m "feat(marketplace): desktop reads the Worker catalog first, index.json as fallback"
```

---

### Task 17: Desktop — installs pin to `sourceCommit`

**Files:**
- Modify: `desktop/src/main/plugin-installer.ts` (`MarketplaceEntry` lines 85–104; `installFromUrl` 300–311; `installFromGitSubdir` 313–340; the switch 367–382)
- Modify: `desktop/src/main/skill-provider.ts` (the `installPlugin({...})` call, lines 232–244)
- Test: `desktop/tests/plugin-installer-pin.test.ts`

**Interfaces:**
- Produces: `MarketplaceEntry.sourceCommit?: string`; `pinToCommit(dir: string, commit: string): Promise<{ ok: boolean; output: string; commit?: string }>` (the full sha actually checked out); `InstallResult.commit?: string`; `PackageInfo.commit?: string` (`skill-config-store.ts`), written by `recordPackageInstall` — **this is the installed side of the commit comparison Task 1 Step 4 names; without it that comparison has no data.** `PackageInfo` already reaches the renderer through the existing packages map, so no new IPC channel. The provider passes **`sourceCommit: entry.catalog?.sourceCommit`** — the catalog's value **and nothing else**.
- **Update is safe with a pinned checkout.** `update()` re-runs `installPlugin` (`skill-provider.ts:305`), which deletes the folder and clones fresh — it never `git pull`s, so a detached HEAD is never a problem. Do not "improve" it into a pull.

> **Do not add `?? entry.sourceSha`.** It is the obvious-looking fallback and it is wrong.
> `sourceSha` is whatever `sync.js` stamped into `index.json` the last time it ran, and **236
> of the 302 live entries carry one**. Today those entries install the author's current
> version (a plain `clone --depth 1`, no sha). Falling back to `sourceSha` would freeze them
> at a months-old commit that never moves, and the Update button — which the in-flight
> `fix/bundled-plugin-upgrade` branch exists to make work — would re-fetch that same frozen
> commit and report success while changing nothing. An entry with no `catalog` block must
> keep today's behaviour: latest. Task 12 resolves the repo's real HEAD every hour, so
> `catalog.sourceCommit` is a *current* pin, which is the only kind worth having.

- [ ] **Step 1: Find how installer tests stub git**

Run: `rg -n "runGit|child_process|spawn" tests/plugin-installer*.test.ts tests/*installer*.test.ts | head`
Copy that mocking arrangement (likely `vi.mock('child_process', …)` capturing argv) into the test below.

- [ ] **Step 2: Write the failing test**

Create `desktop/tests/plugin-installer-pin.test.ts` — arrange git mocking as found in Step 1, then:

```ts
import { describe, it, expect } from 'vitest';
import { pinToCommit } from '../src/main/plugin-installer';

describe('pinToCommit', () => {
  it('fetches the commit shallowly and checks it out, in that order', async () => {
    const calls: string[][] = [];
    // (use the git stub from Step 1 to push every argv into `calls` and succeed)
    // (stub `rev-parse HEAD` to print the full sha)
    const r = await pinToCommit('/tmp/x', 'e91a6c0');
    expect(r.ok).toBe(true);
    expect(r.commit).toBe('e91a6c0ffffffffffffffffffffffffffffffff');
    expect(calls).toEqual([
      ['-C', '/tmp/x', 'fetch', '--depth', '1', 'origin', 'e91a6c0'],
      ['-C', '/tmp/x', 'checkout', '--detach', 'e91a6c0'],
      ['-C', '/tmp/x', 'rev-parse', 'HEAD'],
    ]);
  });

  it('records the checked-out commit on the package, so Update can compare it later', async () => {
    const entry = { id: 'x', sourceType: 'url', sourceRef: 'https://github.com/o/r.git', sourceCommit: 'e91a6c0' } as any;
    const r = await installPlugin(entry);
    expect(r).toMatchObject({ status: 'installed', commit: 'e91a6c0ffffffffffffffffffffffffffffffff' });
    // …and, through the provider (arrange as in tests/skill-provider-catalog.test.ts):
    // expect(store.getPackage('x')?.commit).toBe('e91a6c0ffffffffffffffffffffffffffffffff');
  });

  it('is not reached for an entry with no catalog block — those still install latest', async () => {
    // Guards the regression the `?? sourceSha` fallback would cause.
    const entry = { id: 'x', sourceType: 'url', sourceRef: 'https://github.com/o/r.git', sourceSha: 'stale123' } as any;
    await installPlugin(entry);
    expect(calls.some((c) => c.includes('checkout'))).toBe(false);
  });

  it('returns git output verbatim when the fetch fails (no guessed cause)', async () => {
    // (make the stub fail the fetch with output "fatal: couldn't find remote ref")
    const r = await pinToCommit('/tmp/x', 'deadbeef');
    expect(r.ok).toBe(false);
    expect(r.output).toContain("couldn't find remote ref");
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/plugin-installer-pin.test.ts`
Expected: FAIL — `pinToCommit` is not exported.

- [ ] **Step 4: Implement**

`plugin-installer.ts` — add to `MarketplaceEntry`:

```ts
  // Marketplace overhaul: the exact upstream commit the catalog
  // listed — the checked files. Absent for local (our own repo) sources.
  sourceCommit?: string;
```

Add the helper next to `installFromUrl`:

```ts
// After a `--depth 1` clone HEAD is whatever the branch is today; the catalog
// listed (and scanned) a specific commit. GitHub serves any reachable sha to
// a shallow fetch, so fetch it and detach onto it. On failure the git output
// is returned untouched — an "unknown sha" and a network error read differently
// and the user must see which.
export async function pinToCommit(dir: string, commit: string): Promise<{ ok: boolean; output: string; commit?: string }> {
  const fetched = await runGit('-C', dir, 'fetch', '--depth', '1', 'origin', commit);
  if (!fetched.ok) return fetched;
  const checked = await runGit('-C', dir, 'checkout', '--detach', commit);
  if (!checked.ok) return checked;
  // Report the FULL sha we landed on: the package record stores it, and Task 1's
  // Update compare reads it back against the catalog's sourceCommit.
  const head = await runGit('-C', dir, 'rev-parse', 'HEAD');
  return { ok: true, output: checked.output, commit: head.ok ? head.output.trim() : commit };
}
```

Change the two clone paths to take and use the commit:

```ts
async function installFromUrl(id: string, url: string, commit?: string): Promise<InstallResult> {
  if (!url.startsWith('https://')) {
    return { status: 'failed', error: 'Only HTTPS git URLs are supported' };
  }
  const targetDir = path.join(PLUGINS_DIR, id);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

  const { ok, output } = await runGit('clone', '--depth', '1', url, targetDir);
  if (!ok) return { status: 'failed', error: `git clone failed: ${output.slice(0, 200)}` };
  if (commit) {
    const pinned = await pinToCommit(targetDir, commit);
    if (!pinned.ok) return { status: 'failed', error: `could not check out the listed version ${commit}: ${pinned.output.slice(0, 200)}` };
    return { status: 'installed', commit: pinned.commit };
  }
  return { status: 'installed' };
}
```

(`InstallResult` gains `commit?: string`; `installFromGitSubdir` returns it the same way.)

```ts
```

and in `installFromGitSubdir(id, repoUrl, subdir, commit?)` — **after `sparse-checkout set`,
not before it.** Read the existing function first and place the call so the sparse paths are
already configured: `checkout --detach` materialises whatever the sparse config allows at that
moment, so pinning before the paths are set defeats the sparse clone and pulls the whole tree.
The order is: sparse clone → `sparse-checkout set <subdir>` → `pinToCommit` → read the subdir.

```ts
    if (commit) {
      const pinned = await pinToCommit(tmpDir, commit);
      if (!pinned.ok) return { status: 'failed', error: `could not check out the listed version ${commit}: ${pinned.output.slice(0, 200)}` };
    }
```

In the switch:

```ts
      case 'url':
        result = await installFromUrl(id, sourceRef, entry.sourceCommit);
        break;
      case 'git-subdir':
        result = await installFromGitSubdir(id, sourceRef, entry.sourceSubdir || '', entry.sourceCommit);
        break;
```

`skill-config-store.ts` — `PackageInfo` gains `commit?: string`, and `recordPackageInstall`
takes it as an optional extra argument (spread onto the existing record, the way `remember()`
in the permission store keeps its entry). `skill-provider.ts` — after a successful
`installPlugin`, pass `result.commit` through to `recordPackageInstall`. No `commit` recorded
= nothing to compare = no badge from the commit path (Task 1 Step 4).

`skill-provider.ts` — in the `installPlugin({ … })` call add:

```ts
      // Marketplace overhaul: pin to the commit the catalog scanned — and ONLY that. Deliberately
      // no `?? sourceSha` fallback: that field is a stale snapshot from whenever
      // sync.js last ran (236 of 302 live entries have one), so falling back to it
      // would freeze those plugins at an old version forever and make Update a
      // no-op that claims success. No catalog block → today's behaviour (latest).
      sourceCommit: marketplaceEntry.catalog?.sourceCommit,
```

- [ ] **Step 5: Run to see it pass, then the gate; commit**

Run: `npx vitest run tests/plugin-installer-pin.test.ts` → PASS (3). `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/main/plugin-installer.ts desktop/src/main/skill-provider.ts desktop/src/main/skill-config-store.ts desktop/tests/plugin-installer-pin.test.ts
git commit -m "feat(marketplace): installs check out the catalog's pinned commit and record it"
```

---

### Task 18: Desktop — installing a member installs its bundle

**Files:**
- Modify: `desktop/src/main/skill-provider.ts` (the `install(id)` method — find with `rg -n "async install\(" src/main/skill-provider.ts`)
- Test: `desktop/tests/skill-provider-catalog.test.ts` (append)

**Interfaces:**
- Produces: `install('<bundle>/<name>')` behaves exactly like `install('<bundle>')` and returns its result.

> **Fold in the mid-session votability bug while you are here** (ROADMAP, added 2026-08-28,
> found by hand-testing Plan 1). The single-install path reports only the **bundle** id to
> the Worker, never the member ids the provider then surfaces as their own listings — so a
> vote on a freshly installed member's page is refused until the next launch re-runs
> `reconcileInstalls()`. This task is the moment that stops being an edge case: after it,
> the id the user clicked to install is routinely a *member* id and the page they land on is
> that member's. Report the member ids too, or call the reconcile after a successful install
> (`POST /installs` takes a batch since wecoded-marketplace#72, so one call covers all of
> them).

- [ ] **Step 1: Write the failing test**

Append to `desktop/tests/skill-provider-catalog.test.ts`:

```ts
describe('install — a member row installs its bundle', () => {
  it('resolves catalog.partOf and installs the bundle id', async () => {
    const member = { ...CATALOG_ROW, id: 'superpowers/brainstorming', displayName: 'Brainstorming',
      catalog: { ...CATALOG_ROW.catalog, itemType: 'skill', partOf: { id: 'superpowers', displayName: 'Superpowers' } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW, member] }), { status: 200 }));
    const p = makeProvider();
    const spy = vi.spyOn(p, 'install');
    await p.install('superpowers/brainstorming').catch(() => undefined);
    // Second call is the recursion onto the bundle.
    expect(spy).toHaveBeenNthCalledWith(2, 'superpowers');
  });

  it('does not recurse forever on a catalog that points a row at itself', async () => {
    const loop = { ...CATALOG_ROW, id: 'loopy',
      catalog: { ...CATALOG_ROW.catalog, itemType: 'skill', partOf: { id: 'loopy', displayName: 'Loopy' } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [loop] }), { status: 200 }));
    const p = makeProvider();
    const spy = vi.spyOn(p, 'install');
    await p.install('loopy').catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/skill-provider-catalog.test.ts -t "member row"`
Expected: FAIL — `install` called once.

- [ ] **Step 3: Implement**

At the top of `install(id)` in `skill-provider.ts`, after the entry lookup:

```ts
    // Marketplace overhaul (spec §1.4): a skill/specialist/connection that lives
    // inside a bundle is installed by installing the bundle — per-item install
    // is a ROADMAP follow-up. The UI already shows a member as installed when
    // its bundle is.
    // The id check is a cycle guard, not paranoia: partOf comes from a catalog
    // built by a background job we do not control at install time, and a row that
    // points at itself (or a two-row loop) would recurse until the process dies.
    // One hop only — a member's bundle is never itself a member.
    const parent = entry.catalog?.partOf?.id;
    if (parent && parent !== id) {
      const bundle = entries.find((e) => e.id === parent);
      if (!bundle?.catalog?.partOf) return this.install(parent);
      return { status: 'failed', error: `catalog error: ${id} and ${parent} both claim to be inside another item` };
    }
```

- [ ] **Step 4: Pass, gate, commit**

Run: `npx vitest run tests/skill-provider-catalog.test.ts` → PASS. `bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/main/skill-provider.ts desktop/tests/skill-provider-catalog.test.ts
git commit -m "feat(marketplace): installing a bundle member installs the bundle"
```

---

### Task 19: Android — catalog first, pinned installs, member → bundle

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/MarketplaceFetcher.kt` (`fetchIndex()` lines 27–43; constants 14–21)
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt` (`installFromUrl` 265–272, `installFromGitSubdir` 274–…, the `when (sourceType)` at 115–124)
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt` (the install path — find with `rg -n "fun install" app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt`)
- Test: `app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt`

**Interfaces:**
- Produces: `MarketplaceFetcher.fetchIndex()` returns catalog rows (each a `JSONObject` with a `catalog` object) when the Worker answers; otherwise index.json; otherwise stale cache. `PluginInstaller` reads `entry.optJSONObject("catalog")?.optString("sourceCommit")` and pins.

- [ ] **Step 1: Write the failing unit test**

Create `app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt` (JVM unit test; the fetcher takes `homeDir` so the cache lands in a temp dir. To stub the network, add a constructor parameter `private val readUrl: (String) -> String = { URL(it).readText() }` to `MarketplaceFetcher` — Step 3 — and inject a fake here):

```kotlin
package com.youcoded.app.skills

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class MarketplaceFetcherCatalogTest {
    private fun home() = Files.createTempDirectory("yc-catalog").toFile()

    private val catalogBody = """{"generated_at":1,"entries":[{"id":"superpowers","type":"plugin","displayName":"Superpowers",
        "description":"x","category":"development","catalog":{"itemType":"plugin","origin":{"tier":"verified"},
        "scan":{"status":"checked"},"capabilities":[],"sourceCommit":"e91a6c0"}}]}"""
    private val indexBody = """[{"id":"superpowers","type":"plugin","displayName":"Superpowers","description":"x","category":"development"}]"""

    /** Ages the on-disk envelope past its TTL. Matches `writeCache`'s `{ fetchedAt, etag?, data }`
     *  shape — if the Kotlin envelope names the field differently, change it here, not there. */
    private fun expireCache(file: File) {
        val json = JSONObject(file.readText()); json.put("fetchedAt", 0L); file.writeText(json.toString())
    }

    @Test
    fun `prefers the Worker catalog and keeps the catalog block`() {
        val hits = mutableListOf<String>()
        val f = MarketplaceFetcher(home(), readUrl = { url, _ -> hits += url; if (url.endsWith("/catalog")) HttpText(200, catalogBody, "\"cat-7\"") else error("unexpected $url") })
        val arr = f.fetchIndex()
        assertEquals(1, hits.size)
        assertTrue(hits[0].endsWith("/catalog"))
        assertEquals("e91a6c0", arr.getJSONObject(0).getJSONObject("catalog").getString("sourceCommit"))
    }

    @Test
    fun `falls back to index json when the Worker fails`() {
        val hits = mutableListOf<String>()
        val f = MarketplaceFetcher(home(), readUrl = { url, _ -> hits += url; if (url.endsWith("/catalog")) error("503") else HttpText(200, indexBody, null) })
        val arr = f.fetchIndex()
        assertEquals(2, hits.size)
        assertTrue(hits[1].endsWith("/index.json"))
        assertEquals("superpowers", arr.getJSONObject(0).getString("id"))
        assertTrue(arr.getJSONObject(0).optJSONObject("catalog") == null)
    }

    @Test
    fun `serves the catalog from cache within the TTL`() {
        var n = 0
        val h = home()
        val f = MarketplaceFetcher(h, readUrl = { _, _ -> n++; HttpText(200, catalogBody, null) })
        f.fetchIndex(); f.fetchIndex()
        assertEquals(1, n)
    }

    @Test
    fun `sends the stored ETag and keeps the body on a 304`() {
        val h = home()
        val seen = mutableListOf<String?>()
        var first = true
        val f = MarketplaceFetcher(h, readUrl = { _, tag ->
            seen += tag
            if (first) { first = false; HttpText(200, catalogBody, "\"cat-7\"") } else HttpText(304, "", null)
        })
        f.fetchIndex()
        expireCache(File(h, ".claude/youcoded-marketplace-cache/catalog.json"))
        val arr = f.fetchIndex()
        assertEquals(listOf(null, "\"cat-7\""), seen)
        assertEquals("superpowers", arr.getJSONObject(0).getString("id"))
    }
}
```

- [ ] **Step 2: Run to see it fail — if you can**

There is no Android SDK on this machine (Global Constraints → App), so the honest sequence is:
write the test, write the code (Step 3), push, and read `android-ci.yml` on the PR — that run
is the compile check and the test run. If an SDK *is* present:
`cd /home/destin/youcoded-dev/worktrees/marketplace-ui && ./gradlew test -x bundleWebUi --tests '*MarketplaceFetcherCatalogTest*'`
→ compilation FAIL — no `readUrl` parameter.

- [ ] **Step 3: Implement the fetcher**

`MarketplaceFetcher.kt` — constructor gains the injectable reader; constants gain the catalog URL:

```kotlin
/** Minimal response the fetcher needs; `httpGet` sends If-None-Match when `etag` is non-null. */
data class HttpText(val status: Int, val body: String, val etag: String?)

class MarketplaceFetcher(
    private val homeDir: File,
    private val bundledIndexProvider: (() -> JSONArray)? = null,
    // Injectable for unit tests; production reads the URL directly. Returns the
    // status, body and ETag because the catalog is conditional-GET'd (304 → reuse).
    private val readUrl: (String, String?) -> HttpText = ::httpGet,
) {
    private val cacheDir = File(homeDir, ".claude/youcoded-marketplace-cache")
    private val registryBase = "https://raw.githubusercontent.com/itsdestin/wecoded-marketplace/master"
    // Marketplace overhaul: the Worker's catalog carries the
    // type / origin / scan / capabilities block; index.json is the fallback.
    // The host string is duplicated from MarketplaceApiClient.kt (desktop reads
    // MARKETPLACE_API_HOST); Step 7 pins the two together with a parity test so
    // they cannot drift the way IPC channel names used to.
    private val catalogUrl = "$API_HOST/catalog"
    private val statsTtl = 60 * 60 * 1000L       // 1 hour
    private val indexTtl = 24 * 60 * 60 * 1000L   // 24 hours
    private val catalogTtl = 60 * 60 * 1000L      // 1 hour — CI refreshes hourly
```

Replace `fetchIndex()`:

```kotlin
    fun fetchIndex(): JSONArray {
        val catalogFile = File(cacheDir, "catalog.json")
        val indexFile = File(cacheDir, "index.json")
        fun parseArray(s: String): JSONArray? = try { JSONArray(s) } catch (_: Exception) { null }

        // 1. Fresh catalog cache.
        readCache(catalogFile, catalogTtl)?.let { parseArray(it) }?.let { return it }
        // 2. The Worker's catalog: { generated_at, entries: [...] } — cache only the array.
        //    Send the stored ETag: this response is several MB and we ask hourly, so
        //    on the ~23 hours in 24 when nothing changed the Worker answers 304 with
        //    an empty body and the phone spends a few hundred bytes instead of ~5 MB
        //    of the user's mobile data. `readUrl` therefore returns the status and
        //    the ETag alongside the body (see the signature change below).
        try {
            val prev = readCacheEtag(catalogFile)
            val res = readUrl(catalogUrl, prev)
            if (res.status == 304) {
                readCache(catalogFile, Long.MAX_VALUE)?.let { parseArray(it) }?.let {
                    touchCache(catalogFile); return it
                }
            } else {
                val entries = JSONObject(res.body).getJSONArray("entries")
                writeCache(catalogFile, entries.toString(), res.etag)
                return entries
            }
        } catch (e: Exception) {
            // Includes the 503 from the CATALOG_ENABLED kill switch — same handling.
            Log.w("MarketplaceFetcher", "Catalog fetch failed, trying index.json", e)
        }
        // 3. Raw index.json (pre-overhaul path).
        readCache(indexFile, indexTtl)?.let { parseArray(it) }?.let { return it }
        try {
            val data = readUrl("$registryBase/index.json", null).body
            val arr = JSONArray(data)
            writeCache(indexFile, data)
            return arr
        } catch (e: Exception) {
            Log.w("MarketplaceFetcher", "Failed to fetch index", e)
        }
        // 4. Anything stale, newest source first, then the bundled copy.
        return readCache(catalogFile, Long.MAX_VALUE)?.let { parseArray(it) }
            ?: readCache(indexFile, Long.MAX_VALUE)?.let { parseArray(it) }
            ?: bundledIndexProvider?.invoke()
            ?: JSONArray()
    }
```

(`Log.w` in a JVM unit test throws `Method w in android.util.Log not mocked` unless stubbed. **`app/build.gradle.kts` has no `testOptions` block at all today** (verified 2026-08-30) — add `testOptions { unitTests.isReturnDefaultValues = true }` inside `android { }`, and say so in the commit: it changes what every JVM test in the module sees from Android framework calls — they return defaults instead of throwing.)

- [ ] **Step 4: Run the fetcher test to see it pass**

With an SDK: `./gradlew test -x bundleWebUi --tests '*MarketplaceFetcherCatalogTest*'` → BUILD SUCCESSFUL. Without one: this is checked by CI in Step 7.

- [ ] **Step 5: Pin installs and route members (no new test — mirrors Task 17/3; Gradle's existing installer tests must stay green)**

`PluginInstaller.kt` — add next to `installFromUrl`:

```kotlin
    // After a --depth 1 clone HEAD is today's branch tip; the catalog listed a
    // specific commit. GitHub serves any reachable sha to a shallow fetch.
    private suspend fun pinToCommit(dir: File, commit: String): Boolean {
        if (!runGit("-C", dir.absolutePath, "fetch", "--depth", "1", "origin", commit)) return false
        return runGit("-C", dir.absolutePath, "checkout", "--detach", commit)
    }
```

Change the signatures and bodies:

```kotlin
    private suspend fun installFromUrl(id: String, url: String, commit: String?): InstallResult {
        val targetDir = File(pluginsDir, id)
        if (targetDir.exists()) targetDir.deleteRecursively()
        val ok = runGit("clone", "--depth", "1", url, targetDir.absolutePath)
        if (!ok) return InstallResult.Failed("git clone failed for $url")
        if (!commit.isNullOrEmpty() && !pinToCommit(targetDir, commit)) {
            return InstallResult.Failed("could not check out the listed version $commit")
        }
        return InstallResult.Success
    }
```

and in `installFromGitSubdir(id, repoUrl, subdir, commit: String?)`, after the sparse clone succeeds:

```kotlin
            if (!commit.isNullOrEmpty() && !pinToCommit(tmpDir, commit)) {
                return InstallResult.Failed("could not check out the listed version $commit")
            }
```

In the `when (sourceType)` block (lines 115–124), read the commit once above it and pass it:

```kotlin
            // Marketplace overhaul: the catalog's pinned commit, and ONLY that — deliberately no
            // fallback to sourceSha, which is a stale snapshot from whenever sync.js
            // last ran (236 of 302 live entries have one) and would freeze those
            // plugins forever. No catalog block → null → today's behaviour (latest).
            val commit = entry.optJSONObject("catalog")?.optString("sourceCommit", "")?.ifEmpty { null }
            val result = when (sourceType) {
                "local" -> installFromLocal(id, sourceRef, sourceMarketplace)
                "url" -> installFromUrl(id, sourceRef, commit)
                "git-subdir" -> installFromGitSubdir(id, sourceRef, entry.optString("sourceSubdir"), commit)
                else -> InstallResult.Failed("Unknown source type: $sourceType")
            }
```

`LocalSkillProvider.kt` — at the top of its install function, after the entry lookup:

```kotlin
        // Marketplace overhaul (spec §1.4): a member of a bundle installs the bundle.
        // `!= id` is a cycle guard — partOf comes from a background-built catalog we
        // do not control, and a self-referencing row would recurse until the process
        // dies. One hop only; a bundle is never itself a member. Mirrors desktop.
        entry.optJSONObject("catalog")?.optJSONObject("partOf")?.optString("id", "")
            ?.takeIf { it.isNotEmpty() && it != id }?.let { return install(it) }
```

(Match the real function name and return type you find; keep the recursion on the same entry point the WebView calls.)

- [ ] **Step 6: Pin the two host strings together**

Add to `desktop/tests/ipc-channels.test.ts` (it already reads Kotlin source as text for the
channel-parity blocks): assert that `MarketplaceFetcher.kt`'s host constant and
`marketplace-api-client.ts`'s `MARKETPLACE_API_HOST` are the same string. Two hand-maintained
copies of a URL in two languages is exactly the drift the IPC parity tests exist to catch.

- [ ] **Step 7: Commit, push, and read CI**

With an SDK: `./gradlew test -x bundleWebUi` → BUILD SUCCESSFUL. Without one: commit, push, and
watch the `android-ci.yml` run on the branch — it must be green before Task 23, and the PR
body says that is how Android was verified.

```bash
git add app/src/main/kotlin/com/youcoded/app/skills/MarketplaceFetcher.kt app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt
git commit -m "feat(android): catalog-first index, pinned installs, member installs its bundle"
```

---

### Task 20: Workbench fixture note + docs

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/fixtures/marketplace/catalog.ts` (header comment, lines 1–9)
- Modify (workspace repo): `docs/registries.md` line 3 and line 12; `.claude/rules/registries.md`

- [ ] **Step 1: Update the fixture header**

Replace the header's "nothing in this file ships" paragraph with:

```ts
// Shapes mirror the Worker's GET /catalog contract (Phase 2) — `{ generated_at,
// entries }` where each entry is an index row plus `catalog`. The VALUES are
// still invented; the workbench never talks to the network.
```

- [ ] **Step 2: Fix the registry docs** (workspace repo `/home/destin/youcoded-dev`)

**Two of the three corrections this task used to carry are already done** (2026-08-28, fixed on sight in both `docs/registries.md` and `.claude/rules/registries.md` because they contradicted shipping code, not the catalog): the "No CI rebuild on either" claim (`validate-plugin-pr.yml` has a `rebuild` job on merge) and the cache directory (`youcoded-marketplace-cache`, 7 code sites, not `wecoded-`). The doc also now says which of the two `index.json` files the apps actually fetch.

What is left for this task, and only makes sense once the catalog is live: say in both files that **the app reads the Worker's `/catalog` first** (rebuilt hourly by `catalog-ingest.yml`, conditional-GET'd via ETag) and falls back to the GitHub `index.json`, and name the **`CATALOG_ENABLED` kill switch** and what it does (503 → clients fall back). That kill switch is the thing a future session needs to find in a hurry.

- [ ] **Step 3: Commit (two repos)**

```bash
cd /home/destin/youcoded-dev/worktrees/marketplace-ui && git add desktop/src/renderer/dev/workbench/fixtures/marketplace/catalog.ts && git commit -m "docs(workbench): catalog fixture mirrors the /catalog contract"
cd /home/destin/youcoded-dev && git add docs/registries.md .claude/rules/registries.md && git commit -m "docs(registries): catalog is the source, index.json the fallback; correct cache dir" && git push origin master
```

---

### Task 21: Rows the installer cannot install — hide Install, show the source

Phase 2 emits rows with `sourceType: "mcp-registry"` (Connections from Docker's MCP catalog — installed through the MCP settings, not as a plugin) and `sourceType: "file"` (a single markdown file: awesome-copilot agents/instructions). Today's installer answers both with `Unknown source type`, and the UI would show a green Install that fails. Prompt rows (`type: "prompt"` with inline `prompt` text, from awesome-cursorrules) are supposed to install through the provider's prompt path.

> **Verify that path actually works before trusting it.** There are **zero** live prompt
> entries in the registry today — all 14 are deprecated, and the strategy doc calls the type
> dead. This plan routes 257 cursorrules onto a code path nothing has exercised in months.
> Before Step 3, install one prompt row end-to-end in a dev instance (or write a provider
> test that does) and confirm it lands where the app expects. If it has rotted, the honest
> move is `isInstallableSource` returning `false` for prompts too, plus a ROADMAP item — a
> "prompt" that shows Install and then fails is worse than one that shows Open source.

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx` (the Install/Uninstall block in `SkillBody`'s header)
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` (the `corner` element)
- Test: `desktop/tests/marketplace-not-installable.test.tsx`

**Interfaces:**
- Produces: `isInstallableSource(entry: SkillEntry): boolean` exported from `desktop/src/shared/catalog-types.ts` — `true` for `local | url | git-subdir`, or `type === 'prompt'` **with non-empty `prompt` text**; `false` for `mcp-registry`, `file`, unknown — **including the 193 awesome-copilot instructions rows, which are `type: "prompt"` but carry no text** (Task 13 lists them as pointers). Without the text check they would show Install and install an empty prompt.

- [ ] **Step 1: Failing test** — `desktop/tests/marketplace-not-installable.test.tsx` (arrange providers the way `tests/marketplace-card-compact.test.tsx` does):

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { isInstallableSource } from '../src/shared/catalog-types';
import MarketplaceCard from '../src/renderer/components/marketplace/MarketplaceCard';
// …the same provider wrappers / mocks tests/marketplace-card-compact.test.tsx uses…

afterEach(cleanup);

const row = (sourceType: string, type: 'plugin' | 'prompt' = 'plugin', prompt = '/x') => ({
  id: 'x', type, displayName: 'X', description: 'd', category: 'development', prompt, source: 'marketplace', visibility: 'published',
  sourceType, sourceRef: 'mcp:x', repoUrl: 'https://github.com/o/r',
  catalog: { itemType: 'tool', origin: { tier: 'community' }, scan: { status: 'unchecked' }, capabilities: [] },
} as any);

describe('rows the installer cannot install', () => {
  it('isInstallableSource', () => {
    expect(isInstallableSource(row('url'))).toBe(true);
    expect(isInstallableSource(row('git-subdir'))).toBe(true);
    expect(isInstallableSource(row('local'))).toBe(true);
    expect(isInstallableSource(row('file', 'prompt', 'You are a Jetpack Compose expert…'))).toBe(true);
    expect(isInstallableSource(row('file', 'prompt', ''))).toBe(false);     // awesome-copilot instructions: a prompt row with no text
    expect(isInstallableSource(row('mcp-registry'))).toBe(false);
    expect(isInstallableSource(row('file'))).toBe(false);
  });

  it('the card shows no install button for an mcp-registry row', () => {
    render(<MarketplaceCard item={{ kind: 'skill', entry: row('mcp-registry') }} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/marketplace-not-installable.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`desktop/src/shared/catalog-types.ts` — append:
```ts
/** Can the app's installer take this row? Plugins from git, and prompt rows
 *  (installed as a private prompt). Connections from the MCP Registry and
 *  single-file rows are listed but not installable yet (ROADMAP). */
export function isInstallableSource(entry: { type?: string; sourceType?: string; prompt?: string }): boolean {
  // A prompt row installs only when the text is in the row. awesome-copilot's
  // instructions are `type: "prompt"` pointers with NO text; Install would store nothing.
  if (entry.type === 'prompt') return typeof entry.prompt === 'string' && entry.prompt.trim().length > 0;
  return entry.sourceType === 'local' || entry.sourceType === 'url' || entry.sourceType === 'git-subdir';
}
```

`MarketplaceCard.tsx` — the `corner` element: `const corner = suppressCorner || (kind === "skill" && !isInstallableSource(item.entry)) ? null : …` (import `isInstallableSource`).

`MarketplaceDetailOverlay.tsx` — in `SkillBody`'s header, wrap the Install/Uninstall branch: when `!isInstallableSource(entry)` render instead

```tsx
            <Button variant="secondary" size="lg" onClick={() => entry.repoUrl && window.open(entry.repoUrl, '_blank', 'noopener')} disabled={!entry.repoUrl}>
              Open source
            </Button>
```
and above `MetadataChips` a `Callout` (`tone="info"`): "This connection isn't installable from here yet. What this can do lists how it runs (as a package or a remote service); add it from the source page." — one sentence, no jargon beyond "package".

- [ ] **Step 4: Run** the test → PASS; `bash scripts/verify.sh marketplace-ui` → OK; **Step 5: Commit** `git add desktop/src/shared/catalog-types.ts desktop/src/renderer/components/marketplace/MarketplaceCard.tsx desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx desktop/tests/marketplace-not-installable.test.tsx && git commit -m "feat(marketplace): rows the installer cannot take show Open source instead of Install"`.

---

### Task 22: The fixes that needed the catalog first

Three items that used to sit in Task 3 and could not honestly be called "depends on nothing".

- [ ] **Theme cards show a download count — all three halves land here.** Plan 1 was going to
  add `installs` to `/stats`'s themes and has withdrawn it, because the premise was false:
  **the app never tells the Worker a theme was installed.** `installTheme()`
  (`marketplace-context.tsx:285`) installs to disk and never calls `marketplaceApi.install()`;
  the sole caller of that is the skill path at line 253. So the `installs` table holds zero
  theme rows and the field would have read `0` forever. Do it in this order, or not at all:
  1. Record the install — `installTheme` also calls `marketplaceApi.install('theme:' + slug)`
     after the disk install succeeds (fire-and-forget; a stats failure must not fail an
     install). Android's theme install path needs the same call. (Task 8 already lets
     `theme:` ids through the catalog check.)
  2. Worker — `/stats` gains `themes[slug].installs`, counted from `installs` rows whose
     `plugin_id` starts with `theme:`, prefix stripped; and skip those ids when seeding
     `plugins` so one row is not reported twice. That is a small `wecoded-marketplace` PR.
  3. Card — `MarketplaceCard.tsx:108-116` reads installs only from `stats.plugins`
     (`pluginStats` is `undefined` for a theme, so `installs` is always 0 and the count never
     renders). Read `themeStats?.installs` too.

  Steps 2 and 3 are worthless without step 1. If you only have time for one, do none of them
  and leave the ROADMAP item.
- [ ] **A dead favourite sits in the profile.** Task 14 fixes `curated-defaults.json`;
  app-side, decide whether to prune the stale `theme-builder` string out of existing
  `~/.claude/youcoded-skills.json` → `favorites[]` on load, or leave it. A favourite that
  resolves to nothing is invisible, so "leave it" is defensible — say which you chose.
- [ ] **Not built here: "No longer listed".** When an installed plugin's id is absent from the
  catalog it was delisted upstream — it keeps working but will never update again. Showing
  that on the Library row is right, **but only when the *catalog* answered `fetchIndex`** —
  never the `index.json` fallback, never the stale cache — or one unreachable Worker labels
  every installed item on the machine as abandoned. That guard needs the renderer to learn
  which source answered, which is a new IPC-parity surface (all the bridge platforms), not a
  small fix. It goes to the ROADMAP in Task 23 Step 4 with that rationale attached, so
  whoever builds it builds the guard first.
- [ ] Run `bash scripts/verify.sh marketplace-ui`; push and read `android-ci.yml` for the Kotlin
  half; commit as `fix(marketplace): theme download counts (app + worker) and the dead favourite`.

---

## Phase 5 — Verify end-to-end, merge, close out

### Task 23: Verify end-to-end, merge, close out

- [ ] **Step 1: Full desktop gate + a real-data smoke**

Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui --full` → OK.
Run: `curl -s https://wecoded-marketplace-api.destinj101.workers.dev/catalog | python3 -c "import json,sys; d=json.load(sys.stdin); e=d['entries']; print(len(e), sum(1 for x in e if x.get('catalog')), sum(1 for x in e if (x.get('catalog') or {}).get('partOf')))"`
Expected: three numbers — total rows, rows with a catalog block (must equal total), member rows (> 0).

Then prove the hourly refresh is actually cheap, on both platforms:
```bash
API=https://wecoded-marketplace-api.destinj101.workers.dev
ETAG=$(curl -sI $API/catalog | grep -i '^etag:' | cut -d' ' -f2- | tr -d '\r')
curl -s -o /dev/null -w 'repeat=%{http_code} bytes=%{size_download}\n' -H "If-None-Match: $ETAG" $API/catalog
```
Expected `repeat=304 bytes=0`. Then, in a dev instance, expire the cache file
(`fetchedAt: 0`) and relaunch: the log should show the conditional request and no
re-download. If the app re-downloads several MB, the ETag wiring is wrong and it will do
that hourly on every user's device, including phones on mobile data — that blocks the merge.

- [ ] **Step 2: Hand it to Destin for the interactive pass — do not script it**

Say before launching: `bash scripts/run-dev.sh marketplace-ui --label "Marketplace overhaul"` opens a window. He checks: the type switch counts, a Skills-tab card with "Part of …", a detail page's badges and "What this can do" showing REAL values (compare one against its GitHub repo), **an item showing "Update" — click it and confirm it actually updates and the badge clears** (try one plugin and one theme), install a `url`-sourced plugin and confirm `git -C ~/.claude/plugins/marketplaces/youcoded/plugins/<id> rev-parse HEAD` equals its `sourceCommit` — **and that this sha is the repo's current tip on GitHub, not an old one.** A pin to a stale commit is the one failure here that looks like success. Finally, a plugin installed *before* this branch (no recorded commit) must show no Update badge it did not show before — the commit compare stays silent without data. Then kill the dev window.

- [ ] **Step 3: Merge and clean up**

```bash
cd /home/destin/youcoded-dev/worktrees/marketplace-ui
git fetch origin && git rebase origin/master && bash /home/destin/youcoded-dev/scripts/verify.sh marketplace-ui
git push --force-with-lease origin feat/marketplace-overhaul-ui
gh pr create --repo itsdestin/youcoded --title "feat(marketplace): overhaul — catalog-backed cards, trust badges, What this can do, feedback" --body "$(cat <<'EOF'
Spec: youcoded-dev docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md (20/20 approved). Backend: wecoded-marketplace feedback routes + catalog service (both deployed).

- type switch (Plugins · Skills · Specialists · Connections · Prompts · Themes), grouped/split rule
- Likely safe / origin / author chips, "What this can do", thumbs + comments
- desktop + Android read /catalog first, index.json fallback; installs pin to the catalog's commit and record it; member installs its bundle
- Android verified by android-ci.yml on this PR (no SDK on the dev machine)
- **the Update badge is now a button.** It never was: the label was a plain span with no handler, and `update(id, type)` had zero call sites in the renderer — so no plugin and no theme could be updated from the UI, nothing outside the bundled-plugin launch path. Fixes ROADMAP:736 (themes) and the same bug for plugins.
- prompts install under their marketplace id and no longer report updates they did not perform

🤖 Generated with [Claude Code](https://claude.com/claude-code)

<the implementing session's URL>
EOF
)"
```

After merge (squash or merge per repo habit) and CI green:

```bash
# Confirm the FEATURE commit is on master. `git rev-parse origin/master` would be
# trivially true right after a pull and prove nothing.
cd /home/destin/youcoded-dev/youcoded && git pull origin master && git branch --contains <the merge sha from the PR> | grep -q master
git worktree remove /home/destin/youcoded-dev/worktrees/marketplace-ui
git push origin --delete feat/marketplace-overhaul-ui; git branch -D feat/marketplace-overhaul-ui
```

- [ ] **Step 4: Archive + ROADMAP (workspace repo)**

Move `docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md`, this plan and the three original plans it consolidates (`2026-08-28-marketplace-feedback-worker.md`, `2026-08-28-marketplace-catalog-service.md`, `2026-08-28-marketplace-app-wiring.md`), and `docs/active/investigations/2026-08-27-marketplace-strategy.md` to `docs/archive/` with `status: shipped`; flip the ROADMAP overhaul entry to `[x]` with the merge SHAs; leave the "public sub-registry" entry open. Add the follow-ups this plan hands off that are **not** on the ROADMAP yet (checked 2026-08-30): per-item install of a bundle member (spec §1.4/§5); member descriptions from each `SKILL.md`'s frontmatter (~2,000 raw fetches, only when the bundle's HEAD moved); "No longer listed" on the Library row with the catalog-only guard from Task 22; the dead-favourite cleanup if Task 22 chose "leave it". Commit by explicit path; push.

---

## Deferred: the official MCP Registry

Cut from this plan on 2026-08-28 after the review in
`docs/active/investigations/2026-08-28-marketplace-overhaul-plan-review.md`. It belongs with
**Layer E** (the sub-registry API), where the full 25,291-server corpus is the point rather
than a cost. The reasons, all measured rather than felt:

- **Nothing could be done with the rows.** They are not installable (the installer has no
  `mcp-registry` source type — Task 21 correctly shows "Open source" instead of
  Install), not rateable (a vote requires a prior install), and never scanned. So they would
  arrive as thousands of grey "Not checked" cards diluting the grid the curation exists to
  protect.
- **The quality filter could not get its inputs.** Which servers to show was decided by GitHub
  stars, looked up at ≤400 repos per run — against 25,291 servers, and only on the *weekly*
  full pass, because the hourly delta run only walks the servers that changed. That is roughly
  **62 weeks** before the filter knows what to filter.
- **It flipped listings on and off.** A popular server updated mid-week came back through a
  delta run with no star count in hand, fell under the bar and vanished from the marketplace
  until some later run happened to look it up. (The merge rule in Task 6 now prevents that
  class of bug generally — but the star mechanism would still have needed rethinking.)
- **It was most of the cost.** ~400 GitHub calls per run out of a ~800-call budget, most of
  the response bytes, and the `slice` column / delta runs / `noRetire` branch /
  `catalog_runs` watermark that existed only to serve it. Removing it took roughly 400 lines,
  one column, one route and one cron schedule out of this plan.
- **The approved UI does not need it.** Docker's ~320 servers fill the **Connections** tab
  with *better* data — declared secrets with their env var names, allowed hosts, volumes,
  OAuth, tool counts — and real provenance, at about 1% of the cost.

When it comes back, it needs: a persistent star store (enrich once, keep the value — the
merge rule already supports this), a real `updated_since` watermark that a delta run updates
(the old design never set `finished_at` on a delta run, so every hourly run re-fetched
everything since the last *weekly* pass), an install path for MCP servers, and a paging story
for `/catalog`. Strategy doc §6 decision 3 is updated to match.
