---
status: active
date: 2026-08-27
tags: [marketplace, wecoded, plugins, themes, skills, mcp, trust, strategy]
---

# WeCoded marketplace — where it is, where the field is, where to take it (2026-08-27)

Written for Destin, in plain language. Every number below was measured by a research
agent (commands and URLs are in the session, and the ones that matter are inline). Items
marked ⚠️ could not be verified and should not be repeated as fact.

**Counts re-measured 2026-08-28** against `wecoded-marketplace/index.json` after a review
pass; the originals were off by a few in every row. Registry counts drift every time a
plugin PR merges — **never hard-code one into a doc or a README; compute it from
`index.json`.** The review that found these: `docs/active/investigations/2026-08-28-marketplace-overhaul-plan-review.md`.

---

## 1. What the marketplace is today

**In one sentence:** a static list of ~300 Claude Code plugins (289 of them copied from
Anthropic's official list, 13 ours), 7 themes and 9 "integrations", served as JSON files
from GitHub, with a small Cloudflare backend that stores sign-ins, install counts, star
ratings, reviews and theme likes.

| Thing | Count | Where it lives |
|---|---|---|
| Plugins shown in the app | **302** (339 in the file; 37 hidden as deprecated) | `wecoded-marketplace/index.json` |
| …from Anthropic's official list | 289 live (312 incl. deprecated) | copied by `scripts/sync.js` |
| …ours | 13 live (27 incl. deprecated; only **12** have a matching folder) | top-level dirs in `wecoded-marketplace/` |
| Skills *inside* those plugins | 2,084 live (2,193 incl. deprecated) | not browsable on their own |
| Commands / agents / hooks | 191 / 103 / 29 live | same |
| MCP servers | **0 extracted** (125 live plugins have an MCP config, but the extractor records no names) | `MarketplaceDetailOverlay.tsx:472` shows a placeholder |
| Themes | 7 | separate repo `wecoded-themes` |
| Integrations | 9 (**4** marked available; Android can't install any) | `integrations/index.json` |
| "Prompt" items | 0 live (all 14 deprecated) | the type is dead |

**Where it pulls from.** One place: Anthropic's `claude-plugins-official/.claude-plugin/marketplace.json`
(`sync.js:38`). No searching GitHub, no other registries. The sync only runs when someone
merges a plugin PR — there is **no schedule**, so the list is 15 days stale right now.

**What a user sees.** One screen: a hero carousel + hand-curated rails ("Destin's picks", "If
you journal", …) + an "Explore everything" grid. Filters: search box, Type (skill/theme),
Vibe (7 life areas — but only 10 of 300 items have one, and picking a vibe silently hides
every theme), Meta (new/popular/picks). No category filter even though every item has a
category. No sort. Detail page: description, "What's inside" (click a skill to read its
file), reviews (star + text, only after installing and signing in), source link.

**Trust and safety today.** At submission: CI blocks secret-looking *filenames* and enforces
size/enum/ID rules; secret-looking *contents* only produce a warning (`validate-plugin-pr.yml:161`
— a live token passes). Nothing scans scripts, hooks or MCP configs for bad behaviour. No
license check. No "verified" badge, no permission summary before install, no sandbox. Reviews
are moderated by an on-Worker AI classifier. The one real runtime guard: post-install shell
commands only run for repos under **`itsdestin/` or `destinationunknown/`**
(`TRUSTED_POSTINSTALL_ORGS`, `plugin-installer.ts:111`).

**Backend (Cloudflare Worker).** Sign-in via GitHub, installs (counted), ratings (one per
installed plugin), theme likes, reports, `GET /stats`, plus the friends/presence/sync-hub
routes the social features use — **11 path prefixes across 12 route modules**, of which
`worker/README.md` documents three. No catalog search, no catalog API — the catalog is not
in a database at all.

⚠️ **The rate limiter may not work in production.** `worker/src/lib/rate-limit.ts` keeps its
counters only in the Cloudflare Cache API, which Cloudflare documents as having **no effect
on `*.workers.dev` deployments** — and the Worker is served from
`wecoded-marketplace-api.destinj101.workers.dev`. If that holds, every `checkRateLimit` call
returns "allowed". Unverified against production; it gates ratings and reports today and
would gate comments tomorrow, so it needs a live check before any un-gated write ships.

**Honest verdict.** The *shell* is good: one screen, rails, detail overlay with readable
skill files, reviews, sign-in, install counts. The *inside* is thin: one upstream, no
per-type browsing, no MCP servers, no trust signals, ratings gated so hard nobody leaves
them, stats file dead, docs describing things that don't exist (README says 174 items,
CONTRIBUTING points at a `plugins/` folder that doesn't exist and tells people to hand-edit
a generated file).

---

## 2. Who else does this, and what they do better

Closest structural matches to WeCoded (a *bundle* of skills + MCP + hooks + themes, inside
an app): **Kiro Powers** (76 items, verified/community tiers), **Pi packages** (npm-tagged
extensions/skills/prompts/themes, no trust layer), **Gemini CLI extensions** (66+ Google
repos, list-by-adding-a-GitHub-topic, no review). None of them has ratings or reviews.

| Who | Size | Can we pull from it? | Trust | Social | Steal this |
|---|---|---|---|---|---|
| **Official MCP Registry** | **25,291** servers | ✅ free API, data is **CC0 public domain** (ToS §10, verified today) | Only proves *who* published (GitHub/DNS). Says "assume minimal-to-no moderation"; does NOT delist vulnerable servers | none | Its ToS §11 literally invites sub-registries to add stars + security scans, with a `_meta` slot for `user_rating`, `download_count`, `security_scan` |
| **Docker MCP Catalog** | ~320 servers, 18.3M pulls | ✅ free JSON at `desktop.docker.com/mcp/catalog/v3/catalog.json` (repo MIT; ⚠️ served file has no stated license) | SBOM + provenance, digest-pinned, runs in a container capped at 1 CPU/2 GB, intercepts tool calls carrying secrets | pulls | The **permission surface**: every server declares which secrets it needs (with a link to get the key), OAuth, volumes, allowed hosts. Nobody has ported this to skills |
| **Anthropic official + community plugins** | 289 + **2,282** | ✅ Apache-2.0 JSON | Community list pins **2,274/2,282 to a commit SHA** and re-syncs nightly | none | SHA-pinning: an author can't swap a good version for a bad one after approval |
| **Claude Directory** (claude.com/plugins) | ~200+ | ❌ no API | "Anthropic verified" badge — their policy says it is *not a security audit* | install counts | Install dialog shows **context cost in tokens/turn** and a "Will install" list of every command/agent/skill/hook/MCP |
| **OpenAI Codex plugins** | small | ✅ git | Human review; submissions need **5 positive + 3 negative test cases**; `readOnlyHint`/`destructiveHint` flags. (`openai/skills` is deprecated) | none | Requiring *negative* tests |
| **Hermes Agent** | federated | ✅ reads other hubs via `/.well-known/skills/index.json` | Tiers: builtin → trusted (OpenAI/Anthropic/HF/NVIDIA) → community; scans for injection/exfil | none | Homebrew-style "taps" + a de-facto federation protocol |
| **ClawHub** (OpenClaw) | ⚠️ 3–14k, irreconcilable | ✅ `/v1/feeds/skills` (robots.txt allows it) | Post-incident: VirusTotal + ClawScan; **>3 unique reports auto-hides** | **comments, stars, installs, version history** — the only catalog with real discussion | The auto-hide threshold |
| **skills.sh** (Vercel) | 1.29M installs | ⚠️ API needs a Vercel token | `/audit` endpoint aggregates Socket, Snyk, Runlayer → pass/warn/fail | dedup'd installs | The public multi-vendor audit verdict |
| **Tessl** | 2,000+ | ❌ | Snyk scan at publish/browse/install | versions, changelogs | **Evals: does the skill measurably help?** Nobody else grades usefulness |
| **Glama** | ~80k | ❌ ToS bans building a competing directory from its data | Builds every server in a micro-VM and **watches what it does** (files, network) | A–F grade | Score weights the *worst* tool at 40% so one bad tool sinks a server |
| **Obsidian** (7,019 plugins) | — | ✅ JSON + per-version download stats | 2026-05 model: scanner on **every version**, human review only for popular/flagged; bans obfuscation and telemetry; **Restricted Mode on by default** | downloads | Rescan every version; a local lint that mirrors the exact gate that will reject you |
| **VS Code** | 50–100k ⚠️ | ✅ swappable gallery | Trust dialog, real sandbox flag, per-call confirmation, **public removal log** | — | The removal log |
| Smithery (17k MCP, acquired by Arcade 2026-08) | — | ⚠️ no ToS exists | Write-only credential vault; publishes uptime % | usage | Uptime as a ranking signal |
| PulseMCP | 21,990 | ✅ documented API; ToS claims the *compilation* → email first | Official/Reference/Community provenance filter | visitors | Provenance as a first-class filter |
| Dead/avoid | Continue hub (DNS gone), Copilot Extensions (sunset), Cline (2.1k-issue queue), VS Code Marketplace (ToS forbids), Glama data, cursor.directory (bot wall), system-prompt leak repos (no rights) | | | | |

**What the ClawHub disaster taught everyone (2026):** Koi found 341/2,857 skills malicious;
Snyk found 36.8% flawed, 13.4% critical; Unit 42 found five that beat both scanners, one
padded to 22 MB to exceed scanner size limits. Scanning alone is provably not enough; the
durable defenses are **pin to a commit, rescan every version, show permissions, sandbox**.

**The five gaps nobody fills** (most defensible first): (1) a normalized permission summary
shown at install, across item types; (2) sandboxed *skill* execution (only MCP gets it
anywhere); (3) signed entries checked at install; (4) rescan on every version; (5) **ratings,
reviews and comments** — absent from every catalog surveyed except ClawHub. Three standards
bodies (MCP Registry, Agent Skills, the new five-vendor Agent Plugins 1.0.0 of 2026-08-06)
all drew their boundary at exactly this place and left trust "for downstream." WeCoded's
pitch — social + personal + non-technical users — sits squarely in that hole.

---

## 3. What we can mine, ranked, with the legal status

Rule of thumb from the research (not legal advice): **facts about an item (name, link,
stars, license, dates) are free to list; the item's files are copyrighted and need a
license.** ~25% of `claude-code-skills` repos have *no* license → those are link-only.
Where we do copy files: keep the license text, credit the author, record the exact commit.

| # | Source | Get | Verdict |
|---|---|---|---|
| 1 | **Official MCP Registry** — 25,291 servers, CC0 | `GET registry.modelcontextprotocol.io/v0.1/servers?version=latest&limit=100` (253 pages, ~2.5 min), hourly deltas via `updated_since` | **Mirror.** Also *become* a sub-registry (implement its API so any MCP host can read us) |
| 2 | **github/awesome-copilot** — ~940 skills/agents/instructions/plugins, MIT, CI-validated by GitHub itself | `.github/plugin/marketplace.json` + `plugins/external.json` | **Mirror.** Best quality-per-item; copy its JSON schemas as our baseline |
| 3 | **Docker MCP Catalog** — ~320, tool-level data | `desktop.docker.com/mcp/catalog/v3/catalog.json` | **Mirror.** Only source with "what does this server actually do + need" |
| 4 | **Anthropic first-party** — `anthropics/skills` (14 Apache; **exclude** docx/pdf/pptx/xlsx which are proprietary, and unlicensed `doc-coauthoring`), `claude-plugins-official` (53 local Apache; the other 236 are pointers → link), knowledge-work/financial/legal packs (Apache) | raw marketplace.json files | **Mirror the licensed ones** — we already do most of this |
| 5 | **PatrickJS/awesome-cursorrules** — 257 rule files, **CC0** | git tree | **Mirror.** Zero obligations; our "prompt / CLAUDE.md snippet" corpus for free |
| 6 | **GitHub topic sweep** — `mcp-server` 25,938 · `agent-skills` 18,068 · `claude-code-plugin` 5,698 · `claude-code-skills` 1,593 · `openclaw-skill` 777 | search API, shard by star ranges to beat the 1,000 cap; **filter ≥10★, pushed <180d, OSI license** (cuts ~80% — over half sit at ≤1 star) | **List metadata; mirror only licensed** |
| 7 | **npm / PyPI** enrichment keyed off the registry's package identifiers | npm search API (⚠️ page offset resets above 5,000 — don't paginate blindly); PyPI has no search, use per-package JSON | **Mirror metadata** (downloads, deps, license) |
| 8 | **OpenClaw side** — VoltAgent/awesome-openclaw-skills (5,376, MIT) + ClawHub `/v1/feeds/skills` | raw md files / feed | **Mirror list**, verified publishers via feed. Don't crawl clawskills.sh (blocks bots) |
| 9 | **Themes** — tinted-theming (250+ palettes, MIT), iTerm2-Color-Schemes (450+, MIT with per-theme credit), Gogh, catppuccin/rosé-pine/nord, **Open VSX** (17,072, per-item license — the only VS Code-compatible source we may legally touch) | repos / `open-vsx.org/api/-/search` | **Mirror as palette seeds** for `/theme-builder`. Never name a tier "Dracula" (trademark) |
| 10 | **Trust stack, all free**: deps.dev v3 (one call → license + dep graph + vulns + Scorecard + stars), OSV.dev (queries by bare commit SHA), OpenSSF Scorecard, GitHub App (12,500 req/hr), NVIDIA **SkillSpector** self-hosted (71 injection/exfil patterns, offline), Cisco **skill-scanner** (Apache, built for SKILL.md + its scripts) | APIs | **Use.** Skip VirusTotal (public API bans commercial use); Snyk agent-scan needs a token ⚠️ |
| — | Also fine: obra/superpowers (MIT, 14), ComposioHQ/awesome-claude-skills (864, per-item Apache), ccplugins/awesome-claude-code-plugins (151, Apache), punkpeye awesome-mcp-servers list (MIT) | | |
| ✗ | **Avoid**: VS Code Marketplace (ToS + enforced), Glama data (ToS bans competing use), hesreallyhim/awesome-claude-code (CC BY-**NC-ND**), LangSmith Hub prompts (no per-prompt license), leaked-system-prompt repos, anthropics/claude-code examples (all rights reserved) | | |

The 2026 landscape already has "index everything" players (Smithery 17k, PulseMCP 22k,
Glama 80k). **Volume is not the win.** Curation + trust + community feedback on top of a
mirrored base is.

---

## 4. Proposal — what "gold standard" means here, in five layers

Each layer is independently shippable. Rough order of value ÷ cost.

### Layer A — A catalog with real structure (foundation, unblocks everything else)
- **Move the catalog into the Worker's database.** Today it's a JSON file with no search, no
  API, and a 24-hour cache that hides new items (ROADMAP:71). A D1 table + `GET /catalog`
  with search/filter/sort fixes staleness, enables per-type browsing and lets the app and
  any outside host read us.
- **Promote types to first class**: Skill · Command · Agent · Hook · MCP server · Plugin
  (bundle) · Theme · Prompt/instruction snippet · Integration. Today only plugin/theme
  exist; 2,066 skills are invisible except through their parent.
- **One `Item` record for everything** with: type, source repo + exact commit, license
  (SPDX), what it adds ("Will install": 3 commands, 1 hook, 2 MCP servers), what it needs
  (secrets, network, files, OS), context cost, versions, origin tier.
- **Scheduled sync** (hourly deltas from the MCP registry, nightly for GitHub sources),
  pinned to commit SHAs like Anthropic's community list — an author can't swap files after
  we've listed them.

**User experience change:** search actually finds skills by name; new items appear within
an hour, not a day; filters for category/type work; themes stop vanishing when a vibe is
picked.

### Layer B — Trust you can see (our biggest differentiator)
- **Origin tiers** shown as a badge on every card: *YouCoded* · *Verified publisher*
  (namespace-proven via MCP registry / GitHub org match) · *Community* · *Mirrored from X*.
- **A "What this can do" panel before install**, in plain words, computed not declared:
  "Runs shell commands on install · Adds a hook that runs after every file edit · Needs a
  GitHub token · Talks to api.github.com". Docker's catalog already has this for MCP; we
  extend it to skills/hooks by scanning the files. This is gap #1 that nobody fills.
- **Automated scan on every version** (SkillSpector + Cisco skill-scanner + OSV for deps +
  secret-content as a *blocker* not a warning), result shown as a simple pass/caution/fail
  with the reasons, and a public "removed items" log like VS Code's.
- **Community flagging with an auto-hide threshold** (ClawHub: >3 unique reports hides
  pending review). The Worker already has `/reports`.
- Later: run MCP servers in a container (Docker's model) and offer "Restricted Mode" by
  default for hooks (Obsidian's model — installed but inert until one deliberate choice).

**User experience change:** a non-technical user can tell in one glance whether something
is ours, verified, or "some repo on GitHub", and what it will do to their machine before
saying yes.

### Layer C — Feedback that people actually leave
- **Un-gate lightweight feedback.** Today a review requires install + sign-in + text, so
  there are none. Add one-tap 👍/👎 after first use (still tied to install, so it's not
  gameable by strangers), keep written reviews for those who want to.
- **Comments / Q&A per item** (ClawHub is the only one with this; it's the thing Destin's
  "see how others feel" ask means). Threaded, sign-in required, same AI moderation.
- **Signals attackers can't buy** for ranking: verified installs per week, retention (still
  installed after 30 days), thumbs ratio — not raw install counts (Orca showed those are
  forgeable without auth).
- **Usefulness grading** (Tessl's idea, nobody else does it): run our harness evaluator on
  a skill in a fixture and publish "improves task X by Y" — expensive, later.

### Layer D — Presentation and organization
- Keep the hero + rails (they're good). Replace the Type chip with real type filters and add
  category chips derived from the data (every entry already carries a `category`; the comment
  at `scripts/schema.js:6` promises chips derived from **life areas**, not categories).
- **Collections**: user-made, shareable lists ("my freshman survival kit") — fits the social
  pillar, and rails become just Destin's collections.
- Per-item page additions: origin badge, "What this can do", scan verdict, versions +
  changelog, "works with" (Claude Code / native harness / OpenClaw / Codex — SKILL.md is
  cross-agent now, ~46 adopters), similar items, comments.
- Fix the audit's open items: phone-width rails clipping (P-17), raw markdown in
  `longDescription`, two blank theme previews.
- Publish flow: the bundled publisher already opens the PR; add a local pre-check that
  runs the exact CI gate (Obsidian's "lint that mirrors the gate") so authors never get
  rejected by surprise.

### Layer E — Interoperability (be readable by others, read from others)
- Implement the **MCP Registry sub-registry API** so any MCP host (Claude Code, Codex,
  VS Code, Hermes) can point at WeCoded and get our verdicts under
  `_meta["com.wecoded/…"]` — the ToS designed this slot for us.
- Serve `/.well-known/skills/index.json` so Hermes-style agents can "tap" WeCoded.
- Install targets: write skills to each agent's path (skills.sh does 75+; we need Claude
  Code, native harness, and whatever OpenClaw/Codex paths matter to our users).

---

## 5. Open bugs and cruft (all verified today; details in the bug agent's report)

**Breaks users**
1. Installed plugins get wiped when Claude Code re-clones its marketplace folder; user-installed ones stay dead (ROADMAP:693). Needs an app-owned install root.
2. ~~Bundled plugins are never upgraded after first install (ROADMAP:69).~~ **SHIPPED 2026-08-27** — youcoded#345 + #346, wecoded-marketplace#69 + #70. `reconcileBundledPlugins()` is on master on both platforms, and the index now publishes each plugin's own `plugin.json` version so the Update badge compares one number space.
3. Theme "Update available" badge has no working action (**ROADMAP:725**). The `theme:update` IPC exists end-to-end and `MarketplaceCard` renders the Update label; the break is in the click path between the card/detail overlay and that IPC. **Fold into the overhaul** — the UI branch rewrites exactly that corner element.
4. Android can't install/connect integrations — stubbed (`SessionService.kt:1100`, youcoded #78).
5. ~~A newly published bundled plugin is invisible for 24h (cache TTL, ROADMAP:71).~~ **SHIPPED 2026-08-27** in the same batch (one refetch per process when a bundled id is missing). Layer A's hourly catalog shortens the general staleness window too.
6. Deleted `youcoded-core` SessionStart hook path still registered → error on every new session (ROADMAP:1043). Quick.

**Degrades / latent**
7. Community theme CSS can inject uncapped `@keyframes` (30% CPU forever; Reduced Effects won't stop it) (ROADMAP:381).
8. Worker CI is red; 3 dependabot PRs blocked — #63 (workers-types 4→5), #61 (vitest 2.1.9→4.1.10), #60 (worker minor/patch group), all failing `test` on the same `ERESOLVE`: `@cloudflare/vitest-pool-workers@0.5.41` peers `vitest 2.0.x–2.1.x`. Matters because deploy = tests → migrations → prod.
9. Two theme previews blank in-app (Devil's Garden, Kuromi Dreamer) (ROADMAP:1042).
10. Theme `icons` override: advertised badge, wired to nothing (youcoded #45).
11. `stats.json` is empty and 5 months stale; README says "rebuilt daily". Install/like counts for themes never tracked (marketplace #6).
12. No scheduled upstream sync (only fires on plugin PRs); 15 days stale.
13. Phone-width rails clip (audit P-17); raw markdown in detail `longDescription`.
14. google-services: OAuth 7-day re-auth unverified in the wild (#9), no macOS/Linux E2E (#8).
15. `mcpServers` extracted as empty for all 336 entries.
16. `${CLAUDE_PLUGIN_ROOT}` unset in Bash → chatsearch's documented command fails (ROADMAP:189). Rode the same 2026-08-27 batch — confirm it landed before re-listing it.
17. Secret *content* scan is a warning, not a block (`validate-plugin-pr.yml:161`).
18. Share-link import throws "not yet implemented" (`skill-provider.ts:591`).
19. Android missing: delete own review, like a theme, refresh theme registry.
20. ⚠️ `checkRateLimit` stores counters only in the Cloudflare Cache API, which is documented as a no-op on `*.workers.dev` — so ratings/reports/installs may have **no rate limit in production**. Needs a live check (hammer a limited route ~70× and look for a 429). Blocks any sign-in-only write, e.g. comments.

**Docs / cruft (all one-liners)**
21. README: 174 entries → **compute from `index.json`** (339 today); "26 YouCoded / 148 imported" is likewise wrong — count it, don't copy a number from here, it drifts on every plugin merge. README also claims `stats.json` is "rebuilt daily by CI"; no such CI exists.
22. CONTRIBUTING: `plugins/<id>/` dir doesn't exist; tells people to hand-edit generated `index.json`.
23. `docs/registries.md:3` says "no CI rebuild" — wrong; both docs name the wrong cache dir (`wecoded-` vs `youcoded-marketplace-cache`).
24. `PITFALLS.md:21` names a `sourceMarketplace: "youcoded-core"` value that occurs 0 times.
25. `curated-defaults.json` names `theme-builder`, which isn't a registry id (the plugin is `wecoded-themes-plugin`; the scanner would key it `wecoded-themes-plugin:theme-builder`). Worse than a no-op: the bare string is **already written into `~/.claude/youcoded-skills.json` → `favorites[]`**, where it resolves to nothing.
26. `wecoded-marketplace/themes/index.json` is an abandoned 2-theme duplicate registry; 13/24 `overrides/` target deprecated entries, one targets a missing id; root `index.json` and `skills/index.json` duplicate 380 KB.
27. `worker/README.md` describes 3 route groups; there are **11** (12 route modules). It documents none of `/social`, `/sync`, `/app`, `/stats`, `/reports`.
28. `/theme-builder` never run end-to-end since the Kit rewrite (ROADMAP:687).
29. Latest `/audit` report is 43 days old, predates all of the above.

---

## 6. Decisions

**Decided 2026-08-27 (Destin):** option **(b)** — Layers A–D inside the app now — with **(c), the public sub-registry (Layer E), as a clear intended follow-up**, not a maybe. Both are on `ROADMAP.md` under Features. Build A so E is a switch: every catalog row carries source repo, exact commit and license from day one.

Remaining decisions, in order:

1. ~~Scope of ambition~~ — decided above.
2. **Mirror files or link only, by default?** Recommendation: **mirror metadata for
   everything; mirror files only where the license allows; install always fetches from the
   pinned upstream commit.** This keeps us out of the EU-database-right and copyright
   traps the research surfaced, and still gives one-click installs.
3. **How much to index**: the whole MCP registry (25k, mostly junk at ≤1 star) or a
   quality-filtered slice (≥10★, active, licensed, scanned)? ~~Recommendation: ingest
   everything, show the filtered slice with a "show all" toggle.~~ **Revised 2026-08-28
   after the plan review:** the MCP Registry is **cut from the first build entirely** and
   moves to the Layer E follow-up. Reasons, all measured: its entries cannot be installed by
   our installer, cannot be rated (voting needs a prior install), and are never scanned — so
   they arrive as thousands of grey "Not checked" cards; and the star lookup that decides
   which ones to show is capped at 400 repos per run against a 25,291-row corpus, i.e. **~62
   weeks** before the filter even has its inputs. Docker's ~320 servers fill the Connections
   tab with better data (declared secrets, allowed hosts, volumes, OAuth) at ~1% of the cost.
   A "show all" toggle is therefore moot for now; revisit it with Layer E, where the full
   corpus is the point. See `2026-08-30-marketplace-overhaul-remaining-work.md` → Deferred.
4. **Gate model for community submissions**: bot-first with human escalation (Obsidian) —
   the only model a one-person team can staff. Full human review (Raycast/Codex) doesn't
   scale; zero-gate auto-index is what got ClawHub owned.
5. **Naming**: "marketplace" vs the accessibility rule ("files" not "artifacts"). Something
   like **"Add-ons"** or **"Library"** may test better with students — worth a copy pass.

Next step once (1) is answered: a design pass in the workbench for the new card/detail
anatomy (origin badge, "What this can do", scan verdict, thumbs/comments), reviewed as a
deck, before any backend work — per the UI-first rule.
