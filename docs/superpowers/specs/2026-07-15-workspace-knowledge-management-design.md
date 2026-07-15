# Workspace Knowledge Management & Context Efficiency Redesign

- **Date:** 2026-07-15
- **Status:** active
- **Scope:** youcoded-dev workspace conventions, docs structure, `/audit`, ROADMAP system. No app code in this spec (the Project View Roadmap tab is deferred — it becomes a roadmap entry, not a design here).

## Motivation (measured, not vibes)

A Fable 5 survey of the workspace on 2026-07-15 found:

- **~45k tokens of context load eagerly at every session start** (~a quarter of the window): CLAUDE.md `@import`s all seven subsystem docs, including the 26,378-word PITFALLS.md — directly contradicting CLAUDE.md's own "loaded only when relevant" claim. The lazy mechanism that should carry this content (path-scoped `.claude/rules/`) works and is barely used: of 7 rules files, only `live-app-safety.md` (`paths: "**"`) loads eagerly; the 6 file-scoped ones correctly load on demand.
- **PITFALLS.md is an append-only journal** (32 sections, ~381 entries) mixing true cross-cutting invariants (~20 entries) with subsystem-specific detail, incident history, and entries already pinned by tests.
- **`/audit` has itself drifted into misleading**: it instructs verifying the pre-2026-04 dedup design ("content-based, no optimistic flag" — since inverted), the removed thinking-timeout, and the three-layer toolkit structure (flattened April 2026); it references nonexistent memory files and covers 5 subsystems out of ~12.
- **docs/superpowers holds ~4.5MB of completed/superseded plans and specs** with no status markers, indistinguishable in search results from living documents — an error generator for lesser models, which can't tell a dead plan from a live instruction.
- **knowledge-debt.md conflated four unrelated things** (doc drift, deferred product work, CC-version watch items, hardening ideas), never emptied, and trained everyone to ignore its session-start nag.
- **Planned features and known bugs had no home** — scattered across knowledge-debt, "deferred" sections in merged plans, handoffs, GitHub issues, and memory.

## Governing principles

1. **Proximity beats documents.** For preventing lesser-model errors, in descending reliability: a failing test > a comment at the edit site > a path-scoped rule injected on file touch > a lazy doc the rule points to > an always-loaded mega-doc. Invest in the top of that list.
2. **One product.** The five sub-repos are components of a single consolidated product. Planning, versioning, and roadmapping happen at the workspace level. Sub-repo docs exist only for knowledge physically coupled to that repo's code (e.g. `youcoded/docs/cc-dependencies.md`).
3. **Every kind of knowledge has exactly one home** (taxonomy below). Anything filed elsewhere is misfiled.
4. **Fix-on-sight.** A doc known to be wrong gets fixed the moment the inconsistency is verified — there is no drift ledger. Deferred-fix bookkeeping cost more than the fixes.
5. **Every knowledge store needs a delete/shrink mechanism, not just an append mechanism.** PITFALLS.md rotted because appending was the only operation anyone performed. Each store gets a budget or sweep the audit enforces: per-rule cap (~600 words — overflow migrates to the lazy doc or a pinning test), slim-PITFALLS cap (~2,500 words), eager-load cap (~10k tokens). Exception by choice: ROADMAP.md is append-only for now — shipped items flip to `[x]` and collect in a `## Shipped` tail; a rolling cleanup-by-release mechanism is captured as a roadmap `idea`, not implemented.

## The taxonomy

| Kind of knowledge | Home | Notes |
|---|---|---|
| Invariants & lessons ("don't break this") | Pinning test, else WHY comment at the site, else path-scoped rule in `.claude/rules/`, else the doc the rule points to | Slim workspace PITFALLS.md keeps only genuinely cross-repo/cross-cutting items |
| Planned features, bugs, someday-ideas | `ROADMAP.md` (workspace root, single file for the whole product) | See format below |
| Doc found contradicting code | **Fixed immediately** (verify against code first, cite what was verified in the commit) | knowledge-debt.md is deleted; no ledger |
| Drift found by `/audit` | The dated audit report, until its findings are applied | The report is the only ledger, and it's a snapshot, not an accumulator |
| External bug reports / PR-linked tracking | GitHub issues | An inbox, never the plan; triaged into ROADMAP.md with a `youcoded#N` link token |
| CC-version watch items | `youcoded/docs/cc-dependencies.md` review flow | Reviewed on CC bumps, not at session start |
| History (completed plans/specs, incident narratives, superseded handoffs) | `docs/archive/` + git log | Searchable when needed, invisible otherwise |
| Codebase orientation (subsystem → entry points → rule → doc → guards) | `docs/MAP.md` | Every cell is an anchor; audit-verified, so it can't rot |

## ROADMAP.md

### What it is

The single planning surface for the product. Destin-visible (renders nicely on GitHub), conversationally capturable ("hey Claude, we should do X at some point" → a line appended in the same session), and designed as a **generic per-project product convention** so YouCoded's Project View can later render a Roadmap tab for *any* user's project — the same discovery pattern as context files. Only the file convention ships now; the tab is a roadmap entry.

### Format

Plain markdown with a small deterministic token grammar. Two rules:

1. **Items are checkbox list lines with optional backtick tokens**, followed by optional indented free-text detail:

   ```md
   - [ ] Surface .partial orphans from previous app runs `bug` `v1.3.1` `#local-models` `youcoded#78` (added 2026-07-15)
     Needs a cache-scan-for-.partial IPC; deferred from Plan C.
   ```

   Token vocabulary:
   - **Type:** `bug` | `feature` | `idea` (default when absent: `feature`)
   - **Milestone:** `vX.Y.Z` (product version — one version line for the whole product)
   - **Tags:** `#kebab-case` — MUST use the same vocabulary as custom session tags (Plans A/B, 2026-07-13) so a future Roadmap↔conversations join works with no format change
   - **Issue link:** `repo#N` (repo-qualified, e.g. `youcoded#78`, so it can't collide with `#tags`)
   - **Status:** checkbox state — `[ ]` open, `[x]` done; `in-progress` as a token for active items
   - `(added YYYY-MM-DD)` date suffix, added at capture time
   - **Unknown tokens degrade to tags.** The (future) parser must be lenient by construction — a creative lesser model can enrich the format but not break it.

2. **Section headers pass their tokens down.** The file is organized however reads best to a human (`## v1.3.1 — polish`, or `## Bugs` / `## Someday`); items inherit the section header's tokens, so per-line noise stays low. An item's effective fields = its own tokens ∪ its section's tokens (own tokens win on conflict). Display grouping (by type, by version, by status) is render-time; any file organization supports all groupings because the fields survive.

### Capture convention (goes in CLAUDE.md)

When Destin expresses future intent ("we should do X at some point", "known bug: Y", "someday it'd be cool if Z"), append an item to `ROADMAP.md` in the same session — one line + optional detail, dated, typed, tagged if obvious. Check for an existing similar item before appending (dedup at capture; the audit dedups as backstop). Don't ask where it goes; don't create competing lists anywhere else. Completed items get `[x]` (with the shipping PR/commit in the detail line) and collect in a `## Shipped` tail section. The file is append-only for now — rolling cleanup-by-release is itself a seeded roadmap `idea`.

### GitHub issues relationship

Triage, not sync. Inbound issues (in-app reports via Settings→Development, community filings) that are real get a roadmap line with a `repo#N` token; shipping a linked roadmap item closes the issue. No two-way automation (silent-drift generator; YAGNI).

## PITFALLS.md restructure

Triage all ~381 entries into exactly one of:

1. **Delete** — historical narrative, superseded designs, entries about deprecated/removed systems. Git history keeps them.
2. **One-liner + guard pointer** — entries already pinned by a test shrink to one line naming the invariant and the test.
3. **Migrate to a path-scoped rule** — subsystem invariants move to `.claude/rules/<subsystem>.md` with `paths:` frontmatter (expand coverage: sync-spaces, conversations, artifacts, engine/models, PTY-writes, overlays, worker/analytics…). Rules stay terse; each points to a lazy doc for depth.
4. **Migrate to sub-repo docs** — single-repo detail (e.g. engine notes) moves next to the code (`youcoded/docs/…`), matching the `cc-dependencies.md` / `engine-dependencies.md` pattern.
5. **Keep** — the ~20 genuinely cross-cutting items remain in a slim workspace PITFALLS.md (target: under ~2,500 words), which is *pointed to*, never `@import`ed.

The same triage applies to the existing `docs/*.md` subsystem docs (chat-reducer, android-runtime, shared-ui-architecture, toolkit-structure, registries…): several are single-repo and belong next to their code; what stays workspace-level becomes the lazy doc its rule points to. The three `.claude/skills/context-*` skills are retired in this phase — they duplicate what rules + lazy docs now cover (another parallel structure that drifts; `context-toolkit` documents a deprecated plugin).

**Entry hygiene going forward:** every pitfall entry must name its **guard** — the test that pins it, or the mechanical check `/audit` runs. An unguarded invariant is a standing request for a pinning test. New-entry template: *invariant (1–2 sentences) · why (1 sentence or a link) · guard*.

## Workspace map (`docs/MAP.md`)

The navigation aid the context cut would otherwise leave missing: a compact (~1k-token) table of **subsystem → entry-point files → its rule → its lazy doc → its guard tests**. This is how a session routes itself ("touching sync? start at `engine.ts`, your rule is `sync-spaces.md`, contract tests are `sync-transport-contract.ts`") without loading any subsystem doc. Every cell is a machine-checkable anchor, so the audit verifies the map mechanically and updates it for new/renamed entry points — it cannot rot the way prose does. Pointed to from CLAUDE.md's first screen. Created in Phase 2 (it references the expanded rules).

## `/audit` rebuild (manifest-driven, fix-executing, diff-scoped)

`/audit` is a maintenance *process*, not a report generator. It fixes what it finds and leaves the workspace healthier than it found it. Dumping an unactioned to-do list is a failure mode, not an output.

- **Inline anchors, no separate manifest:** each rule carries a `verify:` block in its frontmatter and doc claims carry optional trailing guard lines — machine-checkable anchors (file exists, symbol/regex present at a path, named test exists and passes) living IN the document they verify. The audit script HARVESTS anchors from docs/rules at run time; there is no standalone claims-manifest file. Rationale: a separate manifest is a parallel structure that drifts from the docs it describes — the exact failure mode that killed `/audit` v1 (its hardcoded expectations asserted the pre-April design as ground truth). Claim and check must travel together. Agents handle only the residue of genuinely semantic claims.
- **Diff-scoped by default:** each audit report records the per-repo HEAD SHAs it verified against in its frontmatter. The next run diffs `lastAuditedSHA..HEAD` per repo and re-verifies only claims whose anchor paths intersect the diff. A quiet week audits in minutes; a heavy week audits what changed. `/audit full` remains for occasional (quarterly-ish) full re-verification, since diff-scoping can't catch claims that were wrong from the start or drift in unanchored prose.
- **Fix, don't report:** findings are worked through in the same run — doc/rule/CLAUDE.md corrections applied inline and committed as they go; larger fixes (new pinning tests, rule restructures) via subagent-driven-development with verification. Sub-repo code fixes follow normal working rules (worktree, tests, PR) — the audit gets no special bypass. The dated report (`docs/audits/YYYY-MM-DD.md`) is an audit trail: a changelog of applied fixes plus a residue of items needing a human decision (product-behavior questions, deletions of user-created content). The residue should be near-empty on a healthy run; anything left in it is the only surviving drift ledger.
- **Roadmap verification:** every open `[ ]` ROADMAP.md item is checked against code/commits since its added date; already-shipped items are flipped to `[x]` with the shipping commit noted. Stale `in-progress` markers get the same treatment.
- **Workspace gardening (meta-pass):** enforce the store budgets from principle 5 (eager load ≤ ~10k tokens; per-rule ~600 words; slim PITFALLS ~2,500 words) and trim/migrate regressions; detect subsystems that gained code but lack a path-scoped rule; verify `docs/MAP.md` anchors and update the map for new/renamed entry points; sweep `docs/active/` for docs whose feature shipped and move them to `docs/archive/`; verify status frontmatter presence; dedup ROADMAP items; review outward-facing docs (README/privacy/license/sub-repo CLAUDE.md) against the diff since last audit. This is the enforcement mechanism that keeps the Phase 1–2 cleanup from re-rotting.
- **Scope derivation:** subsystem list comes from `.claude/rules/*` `paths:` frontmatter, not a hardcoded enumeration — new subsystems are covered the day their rule lands.
- The audit skill's own claims (what it tells agents to expect) must be regenerated from current docs each rebuild — the April failure mode was the audit asserting stale expectations as ground truth.

## Document lifecycle: `docs/active/` and `docs/archive/`

Two folders under `docs/`, each mirroring `plans/ specs/ handoffs/ investigations/ prototypes/` inside:

- **`docs/active/`** — live and in-progress lifecycle documents only. This replaces `docs/superpowers/` as where brainstorming/writing-plans save new specs and plans (stated in CLAUDE.md; the skills honor user-preference locations). Because it holds only what's in flight, the folder listing IS the index — no INDEX.md.
- **`docs/archive/`** — completed and superseded documents. Git history preserves provenance; grep hygiene: live searches default to excluding `docs/archive/`.
- **Initial census (Phase 1):** sweep the workspace AND all sub-repos for lifecycle documents (specs, plans, handoffs, investigations, prototypes) and sort every one into the two folders. Living *reference* docs coupled to code (`youcoded/docs/cc-dependencies.md`, `engine-dependencies.md`, `terminal-emulator-vendored/VENDORED.md`, etc.) are NOT lifecycle documents and stay in their sub-repos. Docs moved out of a sub-repo get an `origin: <repo>@<sha>:<path>` frontmatter line so provenance survives the cross-repo move (git history doesn't).
- **Move-on-completion convention (goes in CLAUDE.md):** when a feature merges, its associated spec/plan/handoff docs move `docs/active/` → `docs/archive/` in the same session — this rides the existing "Merge means merge AND push" working rule, which extends to "…AND archive the docs AND flip the roadmap item," so completion hygiene attaches to a habit every session already has. The `/audit` gardening pass is the backstop, not the primary mechanism.
- Everything in `docs/active/` carries `status:` frontmatter: `draft | active | merged | superseded` (+ `merged:` commit/PR where known), so sweeps stay mechanical. Handoff docs also carry an explicit expiry condition ("archive when X merges").

## Outward-facing docs review (READMEs, privacy, licenses, sub-repo CLAUDE.md)

- **Phase 1 baseline review:** verify every sub-repo's README, privacy copy (in-app Privacy section, landing-page FAQ, analytics spec copy), LICENSE, and CLAUDE.md for accuracy against current code; fix on sight.
- **Recurring in `/audit` (gardening pass):** diff each repo since the last audit and review these outward-facing docs against what changed — the general mechanism that subsumes the old "analytics payload ↔ privacy copy must stay in sync" pitfall. Privacy copy changes remain decision-residue (never silently auto-edited — they're user-facing promises); README/CLAUDE.md accuracy fixes apply on sight.

## CLAUDE.md changes

- **Remove the `@import` block** — replace with a pointer table (path + one-line "read when…" per doc). This is the single biggest win: ~45k → ~10k eager tokens.
- Add the **one-product principle** and the **taxonomy table** (compressed).
- Add the **ROADMAP capture convention** and the **fix-on-sight policy**.
- Add the **document lifecycle convention**: new specs/plans save to `docs/active/`; on feature completion, associated docs move to `docs/archive/` in the same session. Extend "Merge means merge AND push" to include archiving docs + flipping the roadmap item.
- Point to `docs/MAP.md` on the first screen.
- Add a "where does knowledge go" line: test > comment > rule > doc, in that order.

## Session-start hook changes

- Drop the knowledge-debt nag (file is deleted).
- Staleness signal points at the latest `docs/audits/` report: warn if >60 days old or if it has unapplied findings.

## Other deletions/moves

- `GEMINI.md` — delete (Gemini CLI discontinued June 2026).
- `docs/plans/marketplace-integrations-v2.md` — archive; remove the orphan `docs/plans/` dir. `docs/superpowers/` is dissolved entirely by the census (contents sorted into `docs/active/`/`docs/archive/`).
- `docs/AUDIT.md` — becomes `docs/audits/2026-04-23.md` (historical).
- `docs/knowledge-debt.md` — delete after triage: deferred-product-work entries → ROADMAP.md; CC-watch entries → cc-dependencies flow; genuine drift entries → fixed on the spot or carried into the next audit report if verification is needed.
- `docs/local-dev-vm.md` — verify with Destin whether the VM flow is still used; archive if dead.

## Execution phases

1. **Phase 1 — mechanical wins + census:** de-`@import` CLAUDE.md; create ROADMAP.md (seeded from knowledge-debt triage + known deferred work + `idea` entries for the Project View Roadmap tab and rolling roadmap cleanup-by-release); delete knowledge-debt.md + GEMINI.md; the document census — sweep workspace + all sub-repos for lifecycle docs and sort into `docs/active/`/`docs/archive/` with status + `origin:` frontmatter (dissolving `docs/superpowers/`); baseline review of READMEs, privacy copy, licenses, and sub-repo CLAUDE.md files; hook update.
2. **Phase 2 — PITFALLS triage** (judgment-heavy, reviewed): the 5-way triage above, including the existing `docs/*.md` subsystem docs; expand `.claude/rules/` (with `verify:` anchor blocks); create `docs/MAP.md`; retire the `context-*` skills; add pinning tests where high-value invariants are unguarded.
3. **Phase 3 — `/audit` rebuild:** anchor-harvesting + anchor-check script (inline `verify:` blocks, no separate manifest); diff-scoped incremental mode with per-repo SHA tracking; fix-executing flow (inline + subagent-driven-development); roadmap verification; workspace-gardening meta-pass; dated audit-trail reports; retire the old command doc.
4. **Phase 4 — lifecycle enforcement:** status frontmatter required on new plans/specs (writing-plans/brainstorming conventions note); periodic archive sweep is then trivial.

## Out of scope (deliberately)

- Project View Roadmap tab implementation (first roadmap entry instead).
- Roadmap `#tags` ↔ conversations join (waits on custom-session-tags Plan B shipping; format is already compatible).
- Any two-way GitHub issue sync.
