# Workspace Knowledge Management — Phases 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Phases 1, 2, and the Phase-4 convention rider of `docs/superpowers/specs/2026-07-15-workspace-knowledge-management-design.md` — cut eager context ~45k→~10k tokens, stand up ROADMAP.md, census all lifecycle docs into `docs/active/`+`docs/archive/`, triage PITFALLS.md into rules/tests/sub-repo docs, and create `docs/MAP.md`.

**Architecture:** Pure docs/conventions work in the `youcoded-dev` workspace repo plus small doc-removal PRs in sub-repos. No app code changes except optional small pinning tests (each via normal sub-repo worktree+PR flow). Phases 1 and 2 ship in direct succession — the de-`@import` window before rules expand is deliberately not bridged (spec, Execution phases note).

**Tech Stack:** Markdown, bash (hook script), git. No build system involved for workspace changes.

**Scope:** Phase 3 (`/audit` rebuild) is a SEPARATE follow-up plan — it consumes the `verify:` anchors this plan creates. Phase 4's "status frontmatter required on new plans/specs" convention rides Task 6 here (it's one CLAUDE.md paragraph).

---

## Read these first

1. The spec: `docs/superpowers/specs/2026-07-15-workspace-knowledge-management-design.md` (entire file — it is the authority; this plan operationalizes it).
2. Destin's research note on loading mechanics: `~/.claude/research/context-loading-strategies.md` (why `@import` saves nothing; rules with `paths:` are lazy; rules WITHOUT `paths:` are eager — never create one without `paths:`).
3. `docs/PITFALLS.md` — you will be rewriting it in Phase 2; skim the section headers now so the census (Task 7) doesn't archive something PITFALLS still points to.

## Execution rules for this plan

- **Worktree:** all workspace-repo work happens in a dedicated worktree:
  ```bash
  cd /c/Users/desti/youcoded-dev
  git worktree add ../youcoded-dev.wt-knowledge -b feat/knowledge-mgmt
  ```
  After EACH task: commit in the worktree, then merge to master and push (docs-only changes; landing fast avoids conflicts with concurrent sessions):
  ```bash
  cd /c/Users/desti/youcoded-dev && git pull origin master && git merge --no-ff feat/knowledge-mgmt -m "merge: <task summary>" && git push origin master
  cd ../youcoded-dev.wt-knowledge && git rebase master
  ```
  At plan end: `git worktree remove ../youcoded-dev.wt-knowledge && git branch -D feat/knowledge-mgmt` (no junctions are used in this worktree — plain removal is safe).
- **Dirty-file guard:** before `git mv`/editing any doc, run `git -C /c/Users/desti/youcoded-dev status --porcelain -- <file>` against the MAIN checkout. If dirty (another live session owns it), SKIP it and record it in the task's residue list. Known dirty at plan-writing time: `docs/superpowers/plans/2026-07-13-custom-session-tags-plan-b-ui.md`.
- **Sub-repo changes** (doc deletions/moves out of `youcoded/`, `youcoded-core/`, `wecoded-marketplace/`) follow standing rules: branch in that sub-repo, PR, merge, push. Docs-only PRs; no builds needed.
- **Confidence protocol (Destin's instruction):** execute high-confidence dispositions directly, recording each in the changelog ("I did the following"). Queue ONLY low/medium-confidence items for Destin, each with a recommendation. Do not ask pre-approval for obvious calls.
- **Changelog:** every disposition (archive/delete/migrate/keep) is recorded in `docs/audits/2026-07-15-knowledge-mgmt-changelog.md` (created in Task 4). Append as you go; commit with each task.

---

# PHASE 1 — mechanical wins + census

### Task 1: Preflight

**Files:** none created.

- [ ] **Step 1: Sync every repo**

```bash
cd /c/Users/desti/youcoded-dev && git pull origin master
for r in youcoded youcoded-core youcoded-admin wecoded-marketplace; do git -C $r fetch origin && git -C $r pull origin master; done
git -C wecoded-themes fetch origin && git -C wecoded-themes pull origin main
```

- [ ] **Step 2: Create the worktree** (command in Execution rules above).

- [ ] **Step 3: Snapshot the dirty-file list** — `git status --porcelain` in the main workspace checkout; save the list of dirty `docs/**` files into your working notes. These files are skipped by every later task.

- [ ] **Step 4: Record baseline eager-token measurement** (for the before/after in the changelog):

```bash
# Words in everything eager-loaded today: root CLAUDE.md + its 7 @imports + eager rule + user CLAUDE.md
wc -w CLAUDE.md docs/shared-ui-architecture.md docs/chat-reducer.md docs/android-runtime.md docs/toolkit-structure.md docs/registries.md docs/build-and-release.md docs/PITFALLS.md .claude/rules/live-app-safety.md ~/.claude/CLAUDE.md
```

Tokens ≈ words × 1.35. Expect ~45k tokens total. Save the number.

### Task 2: Create `docs/audits/` + changelog + move the historical audit

**Files:**
- Create: `docs/audits/2026-07-15-knowledge-mgmt-changelog.md`
- Move: `docs/AUDIT.md` → `docs/audits/2026-04-23.md`

- [ ] **Step 1: Move the old audit**

```bash
mkdir -p docs/audits && git mv docs/AUDIT.md docs/audits/2026-04-23.md
```

- [ ] **Step 2: Create the changelog** with this exact header:

```markdown
---
plan: docs/superpowers/plans/2026-07-15-workspace-knowledge-mgmt-phases-1-2.md
started: 2026-07-15
residue: 0
---

# Knowledge-management execution changelog

Running record of every disposition made while executing Phases 1+2. `residue:` above counts
open items awaiting Destin's decision (listed under ## Residue). Update the count whenever
the list changes — the session-start hook greps it.

## Dispositions

| # | Item | Disposition | Confidence | Notes |
|---|------|-------------|------------|-------|

## Residue (needs Destin)

(none yet)
```

- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: create docs/audits/, move historical AUDIT.md, start knowledge-mgmt changelog"`. Merge+push per Execution rules.

### Task 3: Create ROADMAP.md (seeded from knowledge-debt triage)

**Files:**
- Create: `ROADMAP.md` (workspace root)
- Read: `docs/knowledge-debt.md` (full file — do NOT triage from titles alone)

- [ ] **Step 1: Write the skeleton** at `/c/Users/desti/youcoded-dev.wt-knowledge/ROADMAP.md`:

```markdown
# YouCoded Roadmap

Single planning surface for the whole product (app + registries + worker + plugins).
Format: checkbox items with backtick tokens — type (`bug`|`feature`|`idea`, default `feature`),
milestone (`vX.Y.Z`), tags (`#kebab-case`, same vocabulary as custom session tags),
issue link (`repo#N`), `(added YYYY-MM-DD)`. Section headers pass their tokens down;
an item's own tokens win. Unknown tokens degrade to tags. `[x]` = shipped (note the
commit/PR in the detail line) — shipped items collect in ## Shipped.

## v1.3 — sync release

- [ ] Ship v1.3: all master content + desktop-only sync `feature` (added 2026-07-15)
  Gated on sync being entirely complete (incl. Phase 2 conversation sync). Status: docs/superpowers/2026-07-10-sync-completion-handoff.md.

## v1.3.1 — Android + polish `v1.3.1`

- [ ] Android sync + Android-resume fixes `feature` `#android` (added 2026-07-15)
  Port longest-first walkSlugParts, thread resumeSessionId through the bridge + cwd guard, store/basename resolver; Android restore-backend demolition follow-up from Plan 2c.
- [ ] Misleading error messages — full audit + replacement `bug` (added 2026-07-15)
  Per docs/error-message-standards.md; committed as a v1.3.1 followup in CLAUDE.md.

## Bugs

## Features

## Someday / ideas

- [ ] Project View Roadmap tab — render any project's ROADMAP.md, same discovery pattern as context files `idea` `#project-view` (added 2026-07-15)
- [ ] Rolling ROADMAP cleanup-by-release (archive ## Shipped tail per release) `idea` (added 2026-07-15)
- [ ] Restore-from-backup redesign (removed in Plan 2c; redesign around local-models/accounts/platform) `idea` `#sync` (added 2026-07-15)

## Shipped
```

- [ ] **Step 2: Triage all knowledge-debt entries into it.** Read `docs/knowledge-debt.md` end to end. For each dated entry, apply exactly one disposition and log it in the changelog table:

| Disposition | When | Action |
|---|---|---|
| → ROADMAP | deferred product work, known bug, hardening idea | Append item under the right section, with `(added <original noticed date>)`, tags, and a 1-line detail citing the original context |
| Drop (resolved) | entry marked RESOLVED or verifiably shipped (check git log) | Changelog row only |
| Drop (subsumed) | mechanism replaced by this redesign (e.g. "Analytics payload ↔ privacy copy must stay in sync" — subsumed by the /audit outward-facing review) | Changelog row noting what subsumes it |
| Fix now | genuine doc drift fixable in minutes (e.g. "Document Go-binary exec trap in Android runtime docs" — verify the claim, add the doc line) | Fix, cite verification in the commit |
| Residue | can't verify or needs Destin | Changelog ## Residue + bump `residue:` |

Starting guidance from entry titles (verify each against the full entry text + git before acting): `Restore-from-backup`, `DiffusionGemma`, `Onboarding.tsx`, `Icon override dead code`, `Sign + size-cap announcement payload`, `Android Library local themes`, `Android integrations`, `ModelPickerPopup /fast bypass`, `Copilot/AI key buddy floater`, `Unified SystemState`, `StatusBar usage chips native`, the six `Local-mode:` entries, `Legacy conversation-index retirement` → ROADMAP. `Cross-device project auto-discovery (✅ RESOLVED)` → drop. `Analytics payload ↔ privacy copy` → drop (subsumed). `Accounts Phase 1/2 dispositioned follow-ups`, `plan docs show pre-hardening code` → read carefully; anything already dispositioned drops, anything open → ROADMAP. For the six `Local-mode` entries (2026-05-19, opencode-MVP era): that branch is ARCHIVED — check each against the Phase 0/1 native-runtime work (PR #115/#119); carry forward only what still applies to the native harness, tagged `#native-runtime`.

- [ ] **Step 3: Sweep the other known deferred-work sources into ROADMAP** (one line each; dedup against what Step 2 added): PITFALLS "deferred"/"v2"/"follow-up" mentions you already know of — Android artifact `not-implemented-on-mobile` stubs (mobile Project View v2), `.partial` orphan scan IPC (Plan C known gap), Amendment K2 router hot-reload open item, Android PtyBridge echo-driven submit TODO, xterm scrollback duplicate-chrome mitigation, index full retirement (2c note), Android local-theme synthesis parity gap. Do NOT exhaustively mine every doc — the census (Task 7) and Phase 2 triage will surface more; capture-on-sight is the ongoing mechanism.

- [ ] **Step 4: Commit** — `git add ROADMAP.md docs/audits/ && git commit -m "docs: create ROADMAP.md seeded from knowledge-debt triage"`. Merge+push.

### Task 4: Delete knowledge-debt.md and GEMINI.md; update the session-start hook

**Files:**
- Delete: `docs/knowledge-debt.md`, `GEMINI.md`
- Modify: `.claude/hooks/context-inject.sh:77-112` (the staleness tail)

- [ ] **Step 1: Delete the two files**

```bash
git rm docs/knowledge-debt.md GEMINI.md
```

- [ ] **Step 2: Replace the staleness tail of the hook.** In `.claude/hooks/context-inject.sh`, replace everything from the `# --- Staleness detection ---` comment (line 77) through the knowledge-debt block (line 112) with:

```bash
# --- Staleness detection ---
# Points at the newest dated audit report in docs/audits/. Warns when stale (>60 days)
# or when the report's `residue:` frontmatter count is non-zero (unapplied findings).
AUDITS_DIR="$WORKSPACE/docs/audits"
if [[ -d "$AUDITS_DIR" ]]; then
    LATEST_AUDIT=$(ls "$AUDITS_DIR"/[0-9]*.md 2>/dev/null | sort | tail -1)
    if [[ -n "$LATEST_AUDIT" ]]; then
        AUDIT_CTIME=$(git -C "$WORKSPACE" log -1 --format=%ct -- "${LATEST_AUDIT#$WORKSPACE/}" 2>/dev/null || true)
        [[ -z "$AUDIT_CTIME" ]] && AUDIT_CTIME=$(stat -c %Y "$LATEST_AUDIT" 2>/dev/null || stat -f %m "$LATEST_AUDIT" 2>/dev/null || echo "")
        if [[ -n "$AUDIT_CTIME" ]]; then
            NOW_EPOCH=$(date +%s)
            AUDIT_AGE_DAYS=$(( (NOW_EPOCH - AUDIT_CTIME) / 86400 ))
            if [[ $AUDIT_AGE_DAYS -gt 60 ]]; then
                echo "### ⚠️ Audit staleness"
                echo "Latest audit ($(basename "$LATEST_AUDIT")) is ${AUDIT_AGE_DAYS} days old. Consider running \`/audit\`."
                echo ""
            fi
        fi
        # residue: N in the report frontmatter = findings awaiting action
        RESIDUE=$(grep -m1 -E '^residue: *[0-9]+' "$LATEST_AUDIT" | grep -oE '[0-9]+' || true)
        if [[ -n "$RESIDUE" && "$RESIDUE" -gt 0 ]] 2>/dev/null; then
            echo "### ⚠️ Unapplied audit findings"
            echo "${RESIDUE} open item(s) in $(basename "$LATEST_AUDIT"). Review the ## Residue section."
            echo ""
        fi
    fi
fi
```

Leave everything above line 77 (project-state injection) byte-untouched.

- [ ] **Step 3: Test the hook manually**

```bash
CLAUDE_PROJECT_DIR=/c/Users/desti/youcoded-dev.wt-knowledge bash .claude/hooks/context-inject.sh
```

Expected: project-state output; NO "knowledge debt" section; an "Unapplied audit findings" warning appears only if the changelog's `residue:` > 0 (note: `2026-04-23.md` has no `residue:` line — the grep must silently produce nothing for it, not error). Run once with `residue: 2` temporarily set in the changelog to prove the warning fires, then revert.

- [ ] **Step 4: Commit** — `git commit -am "chore: delete knowledge-debt.md + GEMINI.md, repoint session-start staleness at docs/audits/"`. Merge+push. Log both deletions in the changelog.

### Task 5: `docs/local-dev-vm.md` — ask Destin (residue item)

- [ ] **Step 1:** Add to the changelog ## Residue: "docs/local-dev-vm.md — is the VM flow still used? Recommend: archive (superseded by run-dev.sh isolation) unless still in use." Bump `residue:`. Do not delete/move the file yet. Continue with the plan; Destin answers asynchronously.

### Task 6: CLAUDE.md rewrite (the ~35k-token win) + Phase-4 rider

**Files:**
- Modify: `CLAUDE.md` (the `## Subsystem References` block at the end, the `## Keeping Documentation Accurate` section, and additions)

- [ ] **Step 1: Replace the `## Subsystem References` section** (currently the final section, containing the seven `@docs/...` imports) with:

```markdown
## Where Knowledge Lives

New knowledge goes to, in descending preference: **a pinning test > a WHY comment at the edit site > a path-scoped rule in `.claude/rules/` > the lazy doc the rule points to**. Never a new always-loaded doc. Full taxonomy: `docs/superpowers/specs/2026-07-15-workspace-knowledge-management-design.md`.

| Kind of knowledge | Home |
|---|---|
| Invariant / lesson | Pinning test → WHY comment → path-scoped rule → the rule's lazy doc. Slim `docs/PITFALLS.md` holds only cross-repo items |
| Planned feature / bug / idea | `ROADMAP.md` — capture in the SAME session Destin mentions it (typed, tagged, dated; dedup first) |
| Doc contradicting code | **Fix on sight** (verify against code; cite verification in the commit). Unfixable this session → ROADMAP `bug` tagged `#docs`. There is no drift ledger |
| CC-version watch item | `youcoded/docs/cc-dependencies.md` |
| Completed/superseded plans, specs, handoffs | `docs/archive/` (in-flight ones live in `docs/active/`) |
| Destin-specific preferences / session feedback | Auto-memory — LAST resort; product planning never lives in memory |

**Document lifecycle:** new specs/plans/handoffs save to `docs/active/{specs,plans,handoffs,investigations,prototypes}/` with `status:` frontmatter (`draft | active | shipped | superseded`). When a feature merges, its docs move to `docs/archive/` and the ROADMAP item flips to `[x]` in the same session — "Merge means merge AND push" extends to "…AND archive the docs AND flip the roadmap item." Searches for live docs exclude `docs/archive/` by default.

## Subsystem References (read on demand — NOT auto-loaded)

Path-scoped rules in `.claude/rules/` inject automatically when you touch matching files. Start any non-trivial task at `docs/MAP.md` (subsystem → entry points → rule → doc → guard tests). Direct pointers:

| Doc | Read when… |
|---|---|
| `docs/PITFALLS.md` | before any non-trivial change — cross-repo invariants |
| `docs/chat-reducer.md` | touching chat state, transcript events, attention |
| `docs/android-runtime.md` | touching the Android/Termux runtime |
| `docs/shared-ui-architecture.md` | adding IPC or cross-platform features |
| `docs/registries.md` | touching marketplace/themes registries |
| `docs/build-and-release.md` | building, releasing, version bumping |
| `docs/toolkit-structure.md` | touching youcoded-core (deprecated plugin) |
| `docs/error-message-standards.md` | writing any user-facing error |
| `docs/local-dev.md` | running the dev instance |
```

(Phase 2 Task 12 updates the table rows for any doc that moves into a sub-repo — expect `chat-reducer.md`, `android-runtime.md`, `shared-ui-architecture.md`, `toolkit-structure.md` paths to change.)

- [ ] **Step 2: Update `## Keeping Documentation Accurate`** — it currently references `docs/knowledge-debt.md` (deleted) and `docs/AUDIT.md` (moved). Replace those sentences: unresolved findings live in the latest `docs/audits/` report's `## Residue`; the session-start hook warns when the latest audit is >60 days old or has non-zero `residue:`. Keep the "/audit" usage guidance otherwise intact (Phase 3 rewrites it).

- [ ] **Step 3: Add the one-product principle** — one paragraph in `## About This Project`: "The five sub-repos are components of a single consolidated product. Planning, versioning, and roadmapping happen at the workspace level (`ROADMAP.md`); sub-repo docs exist only for knowledge physically coupled to that repo's code."

- [ ] **Step 4: First-screen MAP pointer** — add one line to the CLAUDE.md preamble (directly under the first heading's intro sentence): "Navigation: `docs/MAP.md` maps every subsystem to its entry points, rule, lazy doc, and guard tests." (MAP.md is created in Phase 2 Task 13 — acceptable dangling reference for the hours in between, per the direct-succession decision.)

- [ ] **Step 5: Verify no `@import` remains**

```bash
grep -n "^@docs" CLAUDE.md
```

Expected: no output.

- [ ] **Step 6: Measure the new eager load**

```bash
wc -w CLAUDE.md .claude/rules/live-app-safety.md ~/.claude/CLAUDE.md
```

Target: ≤ ~7,400 words (~10k tokens) for the set (MEMORY.md adds ~1k more; that's inside budget). Record before/after in the changelog.

- [ ] **Step 7: Commit** — `git commit -am "docs(claude-md): de-@import subsystem docs, add knowledge taxonomy + lifecycle + roadmap conventions"`. Merge+push.

### Task 7: Document census — workspace repo

**Files:**
- Create: `docs/active/{specs,plans,handoffs,investigations,prototypes}/`, `docs/archive/{specs,plans,handoffs,investigations,prototypes}/`
- Move: everything under `docs/superpowers/` (151 files) + `docs/plans/marketplace-integrations-v2.md`

- [ ] **Step 1: Create the tree**

```bash
mkdir -p docs/active/{specs,plans,handoffs,investigations,prototypes} docs/archive/{specs,plans,handoffs,investigations,prototypes}
```

- [ ] **Step 2: Classify.** Default disposition for everything in `docs/superpowers/` is **archive** (status: `shipped` if its feature verifiably merged, `superseded` if replaced). The ACTIVE set is the exception — starting list (verify each against git log/memory before deciding; anything ambiguous → active, it's cheap to archive later):
  - `specs/2026-07-15-workspace-knowledge-management-design.md` (this redesign) — active
  - `plans/2026-07-15-workspace-knowledge-mgmt-phases-1-2.md` (this plan) — active
  - `specs/2026-07-09-platform-vision-roadmap.md` — active (governing roadmap doc)
  - `specs/2026-07-10-phase2-conversation-sync-design.md` — active (Android Phase 3 remains)
  - `2026-07-10-sync-completion-handoff.md` — active until v1.3 ships (memory: release gating)
  - `specs/2026-07-13-custom-session-tags-design.md` + `plans/2026-07-13-custom-session-tags-plan-{a,b}-*.md` — active (Plan B in flight; plan-b file is DIRTY — skip the move, changelog-residue it)
  - `plans/2026-04-21-deprecate-youcoded-core.md` — active (release N+1 pending)
  - `investigations/2026-07-10-harness-design-ideas.md` — active (feeds native-runtime phases)
  - `2026-07-10-remote-access-review-handoff.md`, `2026-07-10-review-followups.md`, `2026-07-13-sync-project-discovery-review-findings.md`, `2026-07-14-plan-2b-review-findings-and-moved-gate.md` — read each: capture still-open follow-ups as ROADMAP items, then ARCHIVE the doc (taxonomy: deferred work lives in ROADMAP, not handoffs). If a doc is mostly-open, keep active.
  Root-level `docs/superpowers/2026-*.md` files are handoffs → `handoffs/`. `plans/research/*` → `investigations/`.

- [ ] **Step 3: Stamp frontmatter and move.** Every moved file gets frontmatter PREPENDED (before its `# title`; if the file already has frontmatter, merge keys):

```markdown
---
status: shipped        # or: active | superseded | draft
shipped: <PR/commit if known, else omit>
---
```

Move with `git mv` so history follows:

```bash
git mv docs/superpowers/specs/<f> docs/archive/specs/<f>     # or docs/active/...
git mv docs/plans/marketplace-integrations-v2.md docs/archive/plans/
rmdir docs/plans
```

Batch: do handoffs → investigations → prototypes → plans → specs, committing after each batch (`git commit -m "docs(census): archive superpowers <batch>"`). Log per-file dispositions in the changelog (a compact table: file → active/archive → status).

- [ ] **Step 4: Dissolve `docs/superpowers/`** — after the batches, `ls docs/superpowers` must show only dirty-skipped files (expected: the custom-session-tags plan-b file). Leave the dir until the skipped files are movable; add a changelog residue line: "docs/superpowers/ holds N dirty-skipped files — move when their sessions land."

- [ ] **Step 5: Fix inbound references.** Search for now-broken paths and update (EXCLUDE archive itself):

```bash
grep -rn "docs/superpowers" --include="*.md" -l . | grep -v docs/archive
grep -rn "docs/superpowers" .claude/ scripts/ 2>/dev/null
```

Expected hits to fix: `CLAUDE.md` (several references, incl. the workspace-artifacts bullet — change to `docs/active/` + `docs/archive/`), `docs/PITFALLS.md` (many "Governing plan/spec:" pointers — fix the ones for ACTIVE docs now; archived-doc pointers get rewritten in Phase 2 triage anyway, so batch-fix those with `sed` to the new archive path), memory files (`project_master_review_2026_07_10.md`, `project_sync_release_gating.md` — update paths in Task 10). Also the brainstorming/writing-plans save-location: the skills honor user preference — the CLAUDE.md lifecycle convention (Task 6) IS that preference statement; verify it says "save to docs/active/…".

- [ ] **Step 6: Commit + merge+push.**

### Task 8: Document census — sub-repos

**Files (per sub-repo, via PR):**
- youcoded: delete `docs/superpowers/**` (13), `docs/plans/**` (4), `docs/specs/**` (3), `docs/investigations/**` (1) — KEEP `docs/cc-dependencies.md`, `docs/engine-dependencies.md`, `docs/provider-dependencies.md` (living reference, spine docs for release agents)
- youcoded-core: delete `docs/superpowers/**` (2), `docs/plans/**` (1) — KEEP contributing/for-beginners/quickstart/system-architecture/landing-copy (user-facing repo docs; repo is being archived anyway)
- wecoded-marketplace: delete `docs/phase-{0..6}-implementation-prompt.md` (7), `docs/unified-marketplace-plan.md`, `docs/unified-marketplace-research-report.md` — first CHECK `registries.md`/worker README don't cite them as living docs
- wecoded-themes, youcoded-admin: no lifecycle docs found (verify with the Step-1 sweep)

- [ ] **Step 1: Sweep for strays beyond the known lists** (lifecycle docs can hide outside `docs/`):

```bash
for r in youcoded youcoded-core youcoded-admin wecoded-themes wecoded-marketplace; do
  grep -rliE "implementation plan|design doc|handoff" --include="*.md" $r --exclude-dir=node_modules 2>/dev/null | grep -viE "README|CHANGELOG|dependencies|VENDORED"
done
```

Review hits; anything that is a dated spec/plan/handoff/investigation joins the move set. (Known extra candidate: `wecoded-marketplace/spotify-services/docs/plan.md` — but PITFALLS cites it as a reference for MCP probe methodology; if cited, COPY to archive and leave the original.)

- [ ] **Step 2: Copy into workspace archive with `origin:` frontmatter.** For each file, in the WORKSPACE worktree:

```bash
SHA=$(git -C /c/Users/desti/youcoded-dev/<repo> rev-parse --short HEAD)
```

Create `docs/archive/<kind>/<original-filename>` with prepended frontmatter:

```markdown
---
status: shipped            # or superseded
origin: <repo>@<SHA>:<original/path/in/repo.md>
---
```

Commit in the workspace: `git commit -m "docs(census): absorb <repo> lifecycle docs into archive"`. Merge+push. (Accepted cost per spec: inbound GitHub links to the old sub-repo paths will 404.)

- [ ] **Step 3: Delete from each sub-repo via PR.** Per repo:

```bash
cd /c/Users/desti/youcoded-dev/<repo>
git worktree add ../<repo>-worktrees/docs-census -b chore/docs-census
cd ../<repo>-worktrees/docs-census
git rm -r <the moved paths>
git commit -m "chore: move lifecycle docs to youcoded-dev workspace archive (docs/archive/)"
git push -u origin chore/docs-census
gh pr create --title "chore: move lifecycle docs to workspace archive" --body "Docs relocated to youcoded-dev docs/archive/ with origin frontmatter (workspace knowledge-mgmt Phase 1). 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge each PR (docs-only; self-merge per normal flow), pull master, remove the worktree + branch. **Guard:** before `git rm` on `youcoded/docs/plans/2026-04-14-marketplace-redesign*.md` etc., grep the sub-repo for inbound references (`grep -rn "docs/plans/" youcoded --include="*.md" --include="*.ts" -l`) and fix any.

- [ ] **Step 4: Log everything in the changelog.**

### Task 9: Baseline outward-facing docs review

**Files (read + fix-on-sight):** `youcoded/README.md`, `youcoded-core/README.md`, `wecoded-marketplace/README.md`, `wecoded-themes/README.md`, `youcoded-admin/README.md`, each repo's `LICENSE`, each repo's `CLAUDE.md` (incl. `youcoded/desktop/CLAUDE.md` if present), privacy copy: `youcoded/desktop/src/renderer/components/AboutPopup.tsx` Privacy section + landing-page FAQ (locate via `grep -rn "privacy" youcoded --include="*.html" --include="*.tsx" -il`).

- [ ] **Step 1:** For each doc, verify its concrete claims against current code (feature lists, install instructions, paths, version numbers, plugin lists). Method: for each checkable claim, find the source file that proves/disproves it. Fix inaccuracies in the sub-repo directly (docs-only commits can ride the Task 8 census PRs where the repo already has one open, else a small separate PR).
- [ ] **Step 2:** **Privacy copy is decision-residue** — NEVER auto-edit. If the in-app Privacy section, FAQ, or analytics copy disagrees with what the code sends (cross-check against `wecoded-marketplace/worker/src/lib/analytics.ts` blob order and the device-hash design), write the discrepancy + recommended wording into the changelog ## Residue and bump `residue:`.
- [ ] **Step 3:** Log each repo's outcome ("verified clean" is a logged outcome too).

### Task 10: One-time auto-memory review

**Files:** `~/.claude/projects/C--Users-desti-youcoded-dev/memory/` — MEMORY.md + 19 topic files (13 `feedback_*`, 6 `project_*`, 1 `reference_*` at plan time).

- [ ] **Step 1:** Read every memory file. Apply per file:
  - **feedback_*** — behavioral guidance → stays in memory (its home). Check only for drift (e.g. `feedback_dislikes_status_glyphs.md` claims SessionDrawer statusInfo() still uses glyphs — PITFALLS says that migrated to plain words; verify in code and update the memory).
  - **project_*** — split test: *product planning* (release scope, gating, roadmap facts) → ensure ROADMAP.md carries it (v1.3/v1.3.1 sections from Task 3 should already; add anything missing), then TRIM the memory to the behavioral part ("don't propose shipping early") or delete if nothing behavioral remains. *Session-behavior context* stays.
  - **reference_*** — keep; verify the referenced thing still exists.
  - Update any memory pointing at `docs/superpowers/...` paths to the new `docs/active|archive/...` locations.
- [ ] **Step 2:** Update `MEMORY.md` index lines to match. Log dispositions in the changelog. Anything you're unsure deserves deletion → residue, not delete.

---

# PHASE 2 — PITFALLS triage, rules expansion, MAP

**Triage discipline (from the spec):** implementer executes high-confidence dispositions directly, logging every entry in the changelog; ONLY low/medium-confidence entries queue for Destin, each with a recommendation. Eager-tier criterion: single-violation-is-catastrophic (live-app-safety class) stays eager; ships-a-catchable-bug can be rule-/doc-scoped.

### Task 11: Define the rule template + `verify:` anchor schema

**Files:**
- Create: `.claude/rules/README.md` (the schema doc Phase 3's harvester will consume)

- [ ] **Step 1: Write `.claude/rules/README.md`:**

```markdown
# Rules conventions

Every rule file: YAML frontmatter + terse body (≤600 words). Overflow migrates to the
lazy doc the rule points to, or becomes a pinning test.

    ---
    paths:                       # REQUIRED — omitting it makes the rule EAGER (never do this
      - "youcoded/desktop/src/main/sync-spaces/**"    #  except live-app-safety.md)
    last_verified: YYYY-MM-DD
    verify:                      # machine-checkable anchors — harvested by /audit (Phase 3)
      - path: youcoded/desktop/src/main/sync-spaces/engine.ts          # file exists
      - path: youcoded/desktop/src/main/sync-spaces/git-transport.ts
        contains: "GIT_DIR"                                            # regex present in file
      - test: youcoded/desktop/tests/sync-transport-contract.ts        # test file exists; full audit runs it
    ---

Body format per invariant: **invariant (1–2 sentences) · why (1 sentence or link) · guard
(the pinning test, or "none — candidate")**. End the body with a pointer to the lazy doc
for depth.
```

- [ ] **Step 2: Commit** — `git add .claude/rules/README.md && git commit -m "docs(rules): rule template + verify: anchor schema"`. Merge+push.

### Task 12: PITFALLS triage — section by section

**Files:**
- Modify: `docs/PITFALLS.md` (shrinks to ≤2,500 words by the end)
- Create: new rules (Step 2 table); Modify: existing 7 rules
- Create in sub-repos (via one youcoded PR at the end): `youcoded/docs/` additions

- [ ] **Step 1: Work through PITFALLS.md one `##` section at a time** (32 sections). For each entry apply exactly one of the spec's five dispositions, and append a changelog row (`entry → delete | one-liner | rule:<file> | sub-repo:<path> | keep`, confidence, guard):
  1. **Delete** — historical narrative, superseded designs, deprecated systems (git keeps it).
  2. **One-liner + guard pointer** — already pinned by a named test → one line in the destination rule/doc naming invariant + test.
  3. **→ path-scoped rule** — subsystem invariant → the matching rule file (Step 2 table), ≤600 words/rule; overflow → the rule's lazy doc.
  4. **→ sub-repo doc** — single-repo depth → `youcoded/docs/<subsystem>.md` (batch these; one PR at the end of the task).
  5. **Keep** — genuinely cross-repo/cross-cutting → slim PITFALLS.md, template: *invariant · why · guard*.

  Apply the eager-tier criterion during disposition: anything in the "one violation is catastrophic" class (candidates: the live-app rule already covers the big one; check "never write to PTY during pending interaction" and "worktree-remove follows junctions" — the junction one is catastrophic data loss → it stays in CLAUDE.md/eager tier, where it already lives).

- [ ] **Step 2: Create/expand rules per this starting map** (adjust globs after reading the sections; every new rule follows the Task 11 template with real `verify:` anchors):

| Rule file | `paths:` globs | Absorbs PITFALLS sections |
|---|---|---|
| `sync-spaces.md` (new) | `youcoded/desktop/src/main/sync-spaces/**`, `youcoded/desktop/src/main/sync-service.ts`, `youcoded/desktop/src/main/snapshot-retention.ts` | Sync Spaces + import + SyncHub + discovery + Plan 2c + Sync Warnings |
| `conversations.md` (new) | `youcoded/desktop/src/main/conversations/**`, `youcoded/desktop/src/main/session-browser.ts`, `youcoded/desktop/src/main/device-identity.ts` | Conversation Store 2a + leases 2b + Resume Browser & identity + slug resolution |
| `artifacts.md` (new) | `youcoded/desktop/src/main/artifacts/**`, `youcoded/desktop/src/renderer/components/project-view/**`, `youcoded/desktop/src/renderer/components/SessionDrawer.tsx`, `youcoded/desktop/src/renderer/state/artifact-*.ts` | Artifact Viewer (all subsections) |
| `engine-local-models.md` (new) | `youcoded/desktop/src/main/engine/**`, `youcoded/desktop/src/main/models/**`, `youcoded/desktop/test-engine/**` | Plan B + Plan C sections |
| `native-runtime.md` (new) | locate the Phase 0/1 provider/harness modules first (`grep -rn "HarnessSession\|NativeSessionHost" youcoded/desktop/src/main -l`) | Multi-Model Provider Seam + Plan A |
| `pty-io.md` (new) | `youcoded/desktop/src/main/pty-worker.js`, `youcoded/app/**/PtyBridge.kt`, `youcoded/desktop/src/renderer/hooks/useSubmitConfirmation.ts`, `youcoded/desktop/src/renderer/state/pty-input-gate.ts`, `youcoded/desktop/test-conpty/**` | PTY Writes + PTY Resize + Keyboard Routing (PTY parts) |
| `worker-backend.md` (new) | `wecoded-marketplace/worker/**` | Cloudflare Workers + Analytics |
| `chat-reducer.md` (existing — expand paths) | add `youcoded/desktop/src/main/transcript-watcher.ts`, `subagent-watcher.ts`, `youcoded/desktop/src/renderer/state/attention-classifier.ts`, `youcoded/shared-fixtures/**` | Chat Reducer + transcript/vendored-emulator entries |
| `react-renderer.md` (existing) | keep | Overlays + Header Bar + Framed Shell + Theme contrast |
| `android-runtime.md` (existing) | keep | Android Runtime + Build-Type Parity |
| `ipc-bridge.md` (existing) | keep | Cross-Platform + Settings→Development parity entries |
| `registries.md` (existing) | keep | Theme marketplace + plugin registries + MCP authoring |
| `youcoded-toolkit.md` (existing) | keep | Bundled plugins/hooks |

- [ ] **Step 3: Triage the seven `docs/*.md` subsystem docs the same way** (they're no longer imported, so they're now the lazy layer):
  - `chat-reducer.md`, `android-runtime.md`, `shared-ui-architecture.md` — single-repo (youcoded) → `git rm` from workspace, add to `youcoded/docs/` via the same PR as disposition-4 content; their rules + CLAUDE.md table rows point at the new paths.
  - `toolkit-structure.md` — deprecated plugin; shrink to a stub inside `youcoded-toolkit.md` rule + archive the doc.
  - `registries.md`, `build-and-release.md`, `local-dev.md`, `error-message-standards.md` — cross-repo → stay workspace-level (trim per the same entry hygiene).
- [ ] **Step 4: Rewrite slim PITFALLS.md** — only disposition-5 keeps, template format, ≤2,500 words (`wc -w docs/PITFALLS.md`).
- [ ] **Step 5:** Update the CLAUDE.md pointer table (Task 6 note) for moved docs. Update rules' `last_verified` to today.
- [ ] **Step 6: Commit cadence** — one workspace commit per PITFALLS section-cluster (e.g. per rule file created), so the diff is reviewable; one youcoded PR for all sub-repo doc additions/moves. Merge+push after each cluster.

### Task 13: Create `docs/MAP.md`

**Files:**
- Create: `docs/MAP.md` (~1k tokens)

- [ ] **Step 1: Write the map** — one row per subsystem; every cell a real path (verify each exists before writing):

```markdown
# Workspace Map

Subsystem → where to start → what loads → what guards. Verified by /audit; update when
entry points move.

| Subsystem | Entry points | Rule | Lazy doc | Guard tests |
|---|---|---|---|---|
| Chat state & transcripts | `youcoded/desktop/src/renderer/state/chat-reducer.ts`, `youcoded/desktop/src/main/transcript-watcher.ts` | `chat-reducer.md` | `youcoded/docs/chat-reducer.md` | `transcript-watcher.test.ts`, `transcript-parity` fixtures |
| IPC bridge (3 surfaces) | `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, `SessionService.kt` | `ipc-bridge.md` | `youcoded/docs/shared-ui-architecture.md` | `ipc-channels.test.ts` |
| Sync spaces | `youcoded/desktop/src/main/sync-spaces/engine.ts` | `sync-spaces.md` | (rule is self-contained) | `sync-transport-contract.ts` |
| Conversations & resume | `youcoded/desktop/src/main/conversations/`, `session-browser.ts` | `conversations.md` | … | `transcript-mirror.test.ts`, `slug-path-resolution.test.ts` |
| Artifacts & Project View | `youcoded/desktop/src/main/artifacts/` | `artifacts.md` | … | `local-theme-synthesizer.test.ts`-style unit suites |
| Local engine & models | `youcoded/desktop/src/main/engine/`, `models/` | `engine-local-models.md` | `youcoded/docs/engine-dependencies.md` | `test-engine/probe-*.mjs` |
| Native runtime / providers | (per Task 12 discovery) | `native-runtime.md` | `youcoded/docs/provider-dependencies.md` | … |
| PTY I/O | `youcoded/desktop/src/main/pty-worker.js`, `PtyBridge.kt` | `pty-io.md` | `youcoded/desktop/test-conpty/README.md` | `test-conpty/*.mjs` |
| Android runtime | `youcoded/app/.../runtime/Bootstrap.kt` | `android-runtime.md` | `youcoded/docs/android-runtime.md` | `assembleReleaseTest` |
| React renderer & themes | `youcoded/desktop/src/renderer/` | `react-renderer.md` | … | contrast audit script |
| Registries & marketplace | `wecoded-marketplace/`, `wecoded-themes/` | `registries.md` | `docs/registries.md` | `validate-plugin-pr.yml`, theme CI |
| Worker backend | `wecoded-marketplace/worker/src/` | `worker-backend.md` | … | worker vitest suite |
| Build & release | `.github/workflows/` in each repo | — | `docs/build-and-release.md` | CI itself |
```

Fill every `…` with the real doc produced by Task 12 (no `…` may survive into the commit). Add/merge rows to match the final rule set.

- [ ] **Step 2:** Token check: `wc -w docs/MAP.md` ≤ ~800 words. Commit — `git add docs/MAP.md && git commit -m "docs: workspace MAP — subsystem routing table"`. Merge+push.

### Task 14: Retire the `context-*` skills

**Files:**
- Delete: `.claude/skills/context-android/`, `.claude/skills/context-desktop/`, `.claude/skills/context-toolkit/`

- [ ] **Step 1:** Read each `SKILL.md` first; anything it covers that the new rules/docs DON'T is a Task 12 gap — fold it in before deleting.
- [ ] **Step 2:** `git rm -r .claude/skills/context-android .claude/skills/context-desktop .claude/skills/context-toolkit`
- [ ] **Step 3:** `grep -rn "context-android\|context-desktop\|context-toolkit" . --include="*.md" | grep -v docs/archive` — fix any references (expect: possibly `.claude/commands/audit.md`, CLAUDE.md). Commit + merge+push.

### Task 15: Pinning tests for unguarded high-value invariants

- [ ] **Step 1:** From the Task 12 changelog, collect every "guard: none — candidate" row. Rank by blast radius.
- [ ] **Step 2:** For each candidate that is small (≤ ~40 LOC of test, no new fixtures): write the test in a youcoded worktree, run it, include in ONE `test(pins): …` PR. Follow existing test file patterns (vitest, `youcoded/desktop/tests/`).
- [ ] **Step 3:** Larger candidates → ROADMAP items tagged `#tests` with the invariant named. Log all outcomes.

### Task 16: Budgets + final verification + wrap-up

- [ ] **Step 1: Budget checks** (record all three in the changelog):

```bash
wc -w CLAUDE.md .claude/rules/live-app-safety.md ~/.claude/CLAUDE.md   # eager ≤ ~7,400 words
wc -w docs/PITFALLS.md                                                  # ≤ 2,500 words
for f in .claude/rules/*.md; do echo "$f: $(wc -w < $f)"; done          # each ≤ ~600 words
```

- [ ] **Step 2: Link integrity sweep** — no live doc points at a dead path:

```bash
grep -rn "docs/superpowers\|knowledge-debt\|docs/AUDIT.md\|GEMINI" --include="*.md" . | grep -v docs/archive
```

Expected: only hits inside the changelog/audit-history describing the migration, and the dirty-skipped files.

- [ ] **Step 3: Spec conformance re-read** — re-read the spec top to bottom; confirm every Phase 1/2 bullet has a changelog entry or a residue line. Set the final `residue:` count.
- [ ] **Step 4: Present the residue list to Destin** — the low/medium-confidence dispositions, privacy-copy discrepancies (if any), local-dev-vm question, dirty-skipped files. Wait for his calls; apply them.
- [ ] **Step 5: Cleanup** — final merge+push; remove the worktree + branch; remove sub-repo census worktrees; confirm `git worktree list` is clean in every repo.

---

## Self-review record (done at plan-writing time)

- **Spec coverage:** Phase 1 bullets → Tasks 2–10 (de-import: T6; ROADMAP: T3; deletions: T4; census+origin: T7–8; outward review: T9; memory review: T10; hook: T4; AUDIT move: T2; local-dev-vm: T5). Phase 2 bullets → T11–15 (5-way triage: T12; subsystem docs: T12.3; rules+verify: T11–12; MAP: T13; context-* retirement: T14; pinning tests: T15). Phase 4 rider → T6 (lifecycle/status-frontmatter convention). Budgets/principle 5 → T16. Phase 3 explicitly out of scope (own plan).
- **Known judgment boundaries:** T3 knowledge-debt dispositions, T7 active/archive calls, T12 five-way triage are judgment work by design — the plan supplies the procedure, starting tables, and confidence protocol rather than pretending the content fits in a plan.
- **Type/name consistency:** changelog path, `residue:` key, `status:` enum (`draft|active|shipped|superseded`), rule template keys (`paths`, `last_verified`, `verify`) are used identically across tasks and match the spec.
