# Dependabot Implementation Plan

> **EXECUTED AND SHIPPED 2026-07-23.** All 5 tasks implemented, each reviewed clean, all
> PRs merged: youcoded #216 + #217, marketplace #56 + #57, themes #21 — plus amendment
> #238, which removed a Gradle entry this plan got wrong (Task 2 specified two Gradle
> entries; they duplicated every app dependency). V1–V5 all verified. Full outcome:
> `docs/archive/specs/2026-07-23-dependabot-design.md` §8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate weekly, grouped, throttled dependency-update PRs in the three YouCoded sub-repos with a real dependency surface, and close the CI gaps that would otherwise make those PRs unverifiable.

**Architecture:** Two parts per the spec. **Part A** makes checks fire on the PRs Dependabot will open — a `pull_request:` trigger on youcoded's two CI workflows (Dependabot's `dependabot/**` branches match none of the current push patterns), and a new pre-merge `worker-ci.yml` for the marketplace worker (which has *no* pre-merge checks today). **Part B** adds three `dependabot.yml` configs with a tiered `ignore` policy that blocks bumps whose green CI wouldn't prove correctness (`node-pty`, native majors).

**Tech Stack:** GitHub Actions YAML, Dependabot `version: 2` config YAML. No application code changes. Validation is local YAML parsing (`python3` + pyyaml — `actionlint`/`yamllint` are not installed) plus defined post-merge behavioral observation.

**Spec:** `docs/archive/specs/2026-07-23-dependabot-design.md` — read **§8 (outcome)** first; §1 (verified findings) and §2 (decisions) for background. (Path references to `docs/active/…` further down are preserved verbatim inside commit messages and PR bodies — they record what was actually executed on the day.)

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include these.

- **Cadence (decision 3):** every Dependabot entry uses `interval: "weekly"`, `open-pull-requests-limit: 5`, and a group batching `["minor", "patch"]` into one PR per ecosystem. Majors stay individual (no group entry for them).
- **Risk posture (decision 2):** desktop `ignore` block blocks `node-pty` entirely, and `electron` / `koffi` / `@vscode/ripgrep` at `version-update:semver-major` only. No other repo has an `ignore` block.
- **Auto-merge (decision 4):** none. **Do not** add branch protection, required checks, or auto-merge to any repo.
- **youcoded CI trigger (decision 5):** Standard — `push: [master]` + `pull_request:`. **Amend** the incident-history comment in each workflow; do not delete it.
- **Sub-repo isolation (workspace rule):** each sub-repo's changes go to that sub-repo as its own PR — never mixed into the `youcoded-dev` workspace repo. Only *this plan document* is committed to `youcoded-dev`.
- **WHY comments (workspace rule):** Destin is a non-developer; every non-obvious config line carries a comment explaining why. The full-file contents below already include them — preserve them verbatim.
- **Node version parity:** `worker-ci.yml` must use `node-version: "20"` to match `worker-deploy.yml` (verified 2026-07-23).

---

## File Structure

Five PRs across three repos. Within each repo, Part A (a check) lands and merges *before* the Part B config that depends on it, so the config's first run is actually checked.

| PR | Repo | Branch | File | Responsibility |
|----|------|--------|------|----------------|
| 1 | youcoded | `chore/ci-pull-request-trigger` | modify `.github/workflows/desktop-ci.yml`, `.github/workflows/android-ci.yml` | Check every PR regardless of branch name |
| 2 | youcoded | `chore/dependabot` | create `.github/dependabot.yml` | npm×2 + gradle×2 + actions update config |
| 3 | wecoded-marketplace | `chore/worker-ci` | create `.github/workflows/worker-ci.yml` | Pre-merge tests for `worker/` PRs |
| 4 | wecoded-marketplace | `chore/dependabot` | create `.github/dependabot.yml` | npm (`/worker`) + actions update config |
| 5 | wecoded-themes | `chore/dependabot` | create `.github/dependabot.yml` | npm (`/`) + actions update config |

**Merge order:** PR 1 before PR 2; PR 3 before PR 4; PR 5 anytime. PRs 1/3/5 are independent and can go in parallel.

**Note for the executor:** these are small, isolated `.github/` edits in three *independent* git repos. Feature branches in each sub-repo checkout are sufficient — a separate worktree per five-line config change is overkill, and cross-session collision risk on `.github/` config is negligible. If the subagent-driven flow prefers worktrees, use `isolation: "worktree"`, but it is not required here.

**A note on verification for config work.** This plan has no unit tests — the deliverables are CI/Dependabot YAML. Forcing fabricated `pytest` steps would be dishonest. Each task instead has: (a) a **local** step that parses the YAML and asserts the exact keys are present, and (b) a **post-merge** behavioral check listed once in the "Post-Merge Verification" section at the end. Do not claim a task is "verified" on the strength of the local parse alone — the local parse proves the file is well-formed, not that GitHub accepts it or that the trigger fires.

---

## Task 1: youcoded — check every PR (Part A)

**Files:**
- Modify: `youcoded/.github/workflows/desktop-ci.yml:3-10` (the `on:` block only)
- Modify: `youcoded/.github/workflows/android-ci.yml:3-8` (the `on:` block only)

**Interfaces:**
- Consumes: nothing.
- Produces: a `pull_request:` trigger on both workflows. Task 2's verification (Dependabot PRs show a check rollup) depends on this being on `master` first.

**Context:** Check runs attach to a commit SHA. Today both workflows trigger on `push` to `master | feat/** | feature/** | fix/**`, so a PR gets checks only because its branch name happens to match. Dependabot names branches `dependabot/**`, matching none of those. Adding `pull_request:` checks every PR by name-independent event. Verified 2026-07-23: all 30 recent youcoded PRs used `feat/`/`fix/` and were checked, so this is not fixing a live youcoded gap — it is the prerequisite that makes Task 2 verifiable, and it also closes checks for `chore/`/`refactor/`/`docs/` branches that get none today.

- [ ] **Step 1: Replace the `on:` block in `desktop-ci.yml`**

Replace lines 3–10 (from `on:` through `  workflow_dispatch:`) with exactly:

```yaml
on:
  # Every PR is checked via `pull_request`, regardless of branch name. This
  # replaces the branch-name allowlist that caused the incident below: that
  # list was a proxy for "is this a PR", and the proxy failed when 'feat/**'
  # was listed but 'feature/**' matched nothing — so those branches and their
  # PRs got NO checks and master stayed red from 2026-07-14 to 07-16 (18
  # failing pushes) without anyone noticing. `pull_request` also lets
  # Dependabot's `dependabot/**` PRs run checks; they matched none of the old
  # push patterns. `push: [master]` keeps the post-merge run on master.
  push:
    branches: [master]
  pull_request:
  workflow_dispatch:
```

Leave the entire `jobs:` block (lines 12 onward), including its own comments, untouched.

- [ ] **Step 2: Replace the `on:` block in `android-ci.yml`**

Replace lines 3–8 (from `on:` through `  workflow_dispatch:`) with exactly:

```yaml
on:
  # See desktop-ci.yml for the full rationale: `pull_request` checks every PR
  # regardless of branch name, replacing the branch-name allowlist whose
  # 'feat/**' vs 'feature/**' gap left pushes unchecked, and letting
  # Dependabot's `dependabot/**` PRs run. `push: [master]` keeps the
  # post-merge run on master.
  push:
    branches: [master]
  pull_request:
  workflow_dispatch:
```

Leave the `jobs:` block untouched.

- [ ] **Step 3: Validate both files parse and carry the new trigger**

Run (from `youcoded/`):

```bash
cd youcoded
python3 - <<'PY'
import yaml
for f in [".github/workflows/desktop-ci.yml", ".github/workflows/android-ci.yml"]:
    # PyYAML parses the bare `on:` key as boolean True (YAML 1.1). Both spellings checked.
    d = yaml.safe_load(open(f))
    on = d.get("on", d.get(True))
    assert on is not None, f"{f}: no on: block"
    assert "pull_request" in on, f"{f}: missing pull_request trigger"
    assert on["push"]["branches"] == ["master"], f"{f}: push branches not [master]"
    print(f"OK {f}: pull_request present, push=[master]")
PY
```

Expected output:
```
OK .github/workflows/desktop-ci.yml: pull_request present, push=[master]
OK .github/workflows/android-ci.yml: pull_request present, push=[master]
```

- [ ] **Step 4: Commit on a feature branch**

```bash
cd youcoded
git fetch origin && git checkout master && git pull origin master
git checkout -b chore/ci-pull-request-trigger
git add .github/workflows/desktop-ci.yml .github/workflows/android-ci.yml
git commit -m "ci: check every PR via pull_request, not a branch-name allowlist

Checks attached only to push events on master|feat/**|feature/**|fix/**, so a
PR was checked only because its branch name happened to match. That allowlist
already failed once (the feat/** vs feature/** gap left master red 07-14..07-16).
Add pull_request so every PR runs regardless of branch name — including
Dependabot's dependabot/** branches, which matched none of the old patterns.
push:[master] keeps the post-merge master run. Incident comments amended, not
deleted — they are why this change exists.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push and open the PR**

```bash
cd youcoded
git push -u origin chore/ci-pull-request-trigger
gh pr create --repo itsdestin/youcoded --base master \
  --title "ci: check every PR via pull_request, not a branch-name allowlist" \
  --body "Adds a \`pull_request:\` trigger to desktop-ci and android-ci so every PR is checked regardless of branch name. Prerequisite for Dependabot (its \`dependabot/**\` branches match none of the current push patterns). Also closes checks for chore/refactor/docs branches. Self-verifies: this PR is on a \`chore/\` branch that gets zero checks today, so if the full desktop+android matrix appears on it, the fix works. Spec: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md §4.1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: Confirm self-verification, then hand to Destin to merge**

This PR is on a `chore/` branch, which gets **zero** checks under the old triggers. Because a `pull_request` workflow runs from the PR head's workflow files, the new trigger applies to this very PR. Confirm the rollup appeared:

```bash
gh pr view --repo itsdestin/youcoded chore/ci-pull-request-trigger \
  --json statusCheckRollup \
  -q '[.statusCheckRollup[] | "\(.name // .context)=\(.conclusion // .state)"] | join(", ")'
```

Expected: a non-empty rollup including `build (ubuntu-latest)`, `build (windows-latest)`, `build (macos-latest)`, and the Android `build`. If it is **empty**, the trigger is not catching the PR — stop and diagnose before proceeding to Task 2. Do not merge; surface to Destin per decision 4 (no auto-merge).

---

## Task 2: youcoded — `dependabot.yml` (Part B)

**Files:**
- Create: `youcoded/.github/dependabot.yml`

**Interfaces:**
- Consumes: Task 1's `pull_request:` trigger, which must be merged to `master` first (so the first Dependabot PR is checked).
- Produces: weekly grouped update PRs for desktop npm, partykit npm, Gradle (root + app), and GitHub Actions.

**Context:** Ignore policy per spec §1.4 / decision 2. `node-pty` blocked entirely (its post-install patch exits 0 when its target line is gone, so a bump silently drops the macOS fix with green CI; npm's `latest` is also *below* the pin). `electron`/`koffi`/`@vscode/ripgrep` majors blocked (green tests don't prove a packaged build works). Two Gradle entries because plugin versions live in the root `build.gradle.kts` and libraries in `app/build.gradle.kts`.

- [ ] **Step 1: Create `youcoded/.github/dependabot.yml`**

Write exactly:

```yaml
version: 2

# Design + decisions: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md
# Cadence for every entry: weekly, max 5 open PRs, minor/patch grouped into ONE
# PR per ecosystem; majors stay individual so a bad one is reviewed/reverted alone.

updates:
  # ---- Desktop Electron app: the largest surface (~56 packages) ----
  - package-ecosystem: "npm"
    directory: "/desktop"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      desktop-minor-patch:
        update-types: ["minor", "patch"]
    ignore:
      # node-pty is PATCHED after install by desktop/scripts/patch-node-pty.js,
      # which rewrites a line in unixTerminal.js and EXITS 0 when that line is
      # absent ("pattern not found - skipping"). A bump can therefore silently
      # drop the macOS spawn-helper fix while `npm ci` and CI stay green; the
      # breakage shows only in a PACKAGED mac build (posix_spawn failed), which
      # desktop-ci.yml never produces. Bump by hand and re-verify the patch
      # applied. (npm's "latest" 1.1.0 is also BELOW our pin 1.2.0-beta.12 —
      # "forward" is not machine-decidable here.)
      - dependency-name: "node-pty"
      # Natives below: green tests do NOT prove a PACKAGED build works, so
      # majors are bumped deliberately, not automatically. Minor/patch still flow.
      - dependency-name: "electron"           # major = new Node ABI, native rebuilds
        update-types: ["version-update:semver-major"]
      - dependency-name: "koffi"              # native FFI, prebuilt binaries
        update-types: ["version-update:semver-major"]
      - dependency-name: "@vscode/ripgrep"    # downloads a platform binary at install
        update-types: ["version-update:semver-major"]

  # ---- PartyKit multiplayer server ----
  - package-ecosystem: "npm"
    directory: "/desktop/partykit"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      partykit-minor-patch:
        update-types: ["minor", "patch"]

  # ---- Android (Gradle) ----
  # Two entries: plugin versions (AGP, Kotlin) live in the ROOT build.gradle.kts;
  # libraries (Compose BOM, okhttp, mlkit, camerax) live in app/build.gradle.kts.
  # terminal-emulator-vendored/ is deliberately absent — it is vendored source.
  - package-ecosystem: "gradle"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      gradle-root-minor-patch:
        update-types: ["minor", "patch"]
  - package-ecosystem: "gradle"
    directory: "/app"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      gradle-app-minor-patch:
        update-types: ["minor", "patch"]

  # ---- GitHub Actions ----
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      actions-minor-patch:
        update-types: ["minor", "patch"]
```

- [ ] **Step 2: Validate structure — parse, and assert the policy invariants**

Run (from `youcoded/`):

```bash
cd youcoded
python3 - <<'PY'
import yaml
d = yaml.safe_load(open(".github/dependabot.yml"))
assert d["version"] == 2, "version must be 2"
ups = d["updates"]
ecos = [(u["package-ecosystem"], u["directory"]) for u in ups]
expected = [("npm","/desktop"),("npm","/desktop/partykit"),
            ("gradle","/"),("gradle","/app"),("github-actions","/")]
assert ecos == expected, f"entries/order wrong: {ecos}"
for u in ups:
    assert u["schedule"]["interval"] == "weekly"
    assert u["open-pull-requests-limit"] == 5
    g = next(iter(u["groups"].values()))
    assert g["update-types"] == ["minor","patch"], "group must be minor+patch"
# Desktop ignore policy
desktop = ups[0]
ig = {i["dependency-name"]: i.get("update-types") for i in desktop["ignore"]}
assert ig["node-pty"] is None, "node-pty must be ignored ENTIRELY (no update-types)"
for dep in ["electron","koffi","@vscode/ripgrep"]:
    assert ig[dep] == ["version-update:semver-major"], f"{dep} must ignore majors only"
# No other entry has an ignore block
for u in ups[1:]:
    assert "ignore" not in u, f"{u['directory']} must NOT have an ignore block"
print("OK dependabot.yml: 5 entries, all weekly/limit-5/grouped, ignore policy correct")
PY
```

Expected output:
```
OK dependabot.yml: 5 entries, all weekly/limit-5/grouped, ignore policy correct
```

- [ ] **Step 3: Commit on a feature branch**

```bash
cd youcoded
git fetch origin && git checkout master && git pull origin master
git checkout -b chore/dependabot
git add .github/dependabot.yml
git commit -m "chore: add Dependabot config (weekly, grouped, tiered ignores)

Weekly minor/patch grouped per ecosystem, majors individual, 5 open PR cap.
Watches desktop npm, partykit npm, Gradle (root plugins + app libs), and
GitHub Actions. Ignores: node-pty entirely (post-install patch exits 0 when
its target line is gone -> silently drops the macOS fix with green CI), and
electron/koffi/@vscode/ripgrep majors (green tests don't prove a packaged
build works). Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR (after Task 1 has merged to master)**

```bash
cd youcoded
git push -u origin chore/dependabot
gh pr create --repo itsdestin/youcoded --base master \
  --title "chore: add Dependabot config (weekly, grouped, tiered ignores)" \
  --body "Adds \`.github/dependabot.yml\`. Weekly, minor/patch grouped per ecosystem, majors individual, 5 open PRs max. Ignores node-pty entirely and electron/koffi/@vscode/ripgrep majors — see the WHY comments in the file. Requires the pull_request trigger (separate PR) on master first so the first Dependabot PR is checked. Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md §4.2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Hand to Destin to merge (decision 4: no auto-merge). Post-merge checks are in the final section.

---

## Task 3: wecoded-marketplace — `worker-ci.yml` (Part A)

**Files:**
- Create: `wecoded-marketplace/.github/workflows/worker-ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a `worker-ci` check that runs on any PR touching `worker/**`. Task 4's worker dependency bumps rely on this for a pre-merge signal.

**Context:** Verified 2026-07-23 — marketplace PRs #51–#55 all merged with an *empty* check rollup; #52/#53/#54/#55 touched `worker/`. Worker tests run only inside `worker-deploy.yml`'s post-merge deploy job, against production. This runs the same `npm ci && npm run typecheck && npm test` at PR time. Node pinned to `"20"` to match `worker-deploy.yml`.

- [ ] **Step 1: Create `wecoded-marketplace/.github/workflows/worker-ci.yml`**

Write exactly:

```yaml
name: Worker CI

# Worker code had NO pre-merge checks: worker-deploy.yml runs only on push to
# master and runs the tests as part of DEPLOYING, so a broken PR merged green
# and failed at deploy time against production. Verified 2026-07-23: PRs #51-#55
# all merged with an empty check rollup, four of them touching worker/. This
# runs the same tests first. Node 20 + cache path mirror worker-deploy.yml.
on:
  pull_request:
    paths:
      - "worker/**"
      - ".github/workflows/worker-ci.yml"
  workflow_dispatch: {}

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: worker
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: worker/package-lock.json
      - run: npm ci
      - run: npm run typecheck   # tsc --noEmit
      - run: npm test            # vitest run
```

- [ ] **Step 2: Validate it parses and mirrors worker-deploy's toolchain**

Run (from `wecoded-marketplace/`):

```bash
cd wecoded-marketplace
python3 - <<'PY'
import yaml
d = yaml.safe_load(open(".github/workflows/worker-ci.yml"))
on = d.get("on", d.get(True))
assert "pull_request" in on and on["pull_request"]["paths"][0] == "worker/**"
job = d["jobs"]["test"]
assert job["defaults"]["run"]["working-directory"] == "worker"
node = [s for s in job["steps"] if "setup-node" in str(s.get("uses",""))][0]
assert node["with"]["node-version"] == "20", "node must be 20 (match worker-deploy.yml)"
runs = [s["run"] for s in job["steps"] if "run" in s]
assert any("npm ci" in r for r in runs)
assert any("typecheck" in r for r in runs) and any("npm test" in r for r in runs)
print("OK worker-ci.yml: pull_request on worker/**, node 20, ci+typecheck+test")
PY
```

Expected output:
```
OK worker-ci.yml: pull_request on worker/**, node 20, ci+typecheck+test
```

- [ ] **Step 3: Commit on a feature branch**

```bash
cd wecoded-marketplace
git fetch origin && git checkout master && git pull origin master
git checkout -b chore/worker-ci
git add .github/workflows/worker-ci.yml
git commit -m "ci: run worker tests on PRs, not only at deploy time

Worker code had no pre-merge checks — worker-deploy.yml runs the tests inside
the post-merge deploy job, so a broken PR merged green and failed against
production. PRs #51-#55 all merged with an empty rollup, four touching worker/.
This runs npm ci + typecheck + test on any worker/** PR. Node 20 mirrors
worker-deploy.yml.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR**

```bash
cd wecoded-marketplace
git push -u origin chore/worker-ci
gh pr create --repo itsdestin/wecoded-marketplace --base master \
  --title "ci: run worker tests on PRs, not only at deploy time" \
  --body "Adds \`worker-ci.yml\` — npm ci + typecheck + test on any \`worker/**\` PR. Closes the gap where worker code had zero pre-merge checks (tests ran only inside the post-merge deploy job, against production; PRs #51-#55 all merged with an empty rollup). Node 20 matches worker-deploy.yml. This PR only adds a \`.github/\` file so it won't trigger itself — verify via \`workflow_dispatch\` or the first worker/** PR after merge. Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md §4.1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Hand to Destin to merge.

---

## Task 4: wecoded-marketplace — `dependabot.yml` (Part B)

**Files:**
- Create: `wecoded-marketplace/.github/dependabot.yml`

**Interfaces:**
- Consumes: Task 3's `worker-ci` check, merged to `master` first (so worker bumps get a pre-merge signal).
- Produces: weekly grouped update PRs for the worker's npm deps and GitHub Actions.

**Context:** No `ignore` block — the worker has no native deps, and `worker-ci.yml` gives every bump a real check.

- [ ] **Step 1: Create `wecoded-marketplace/.github/dependabot.yml`**

Write exactly:

```yaml
version: 2

# Design + decisions: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md
# Weekly, max 5 open PRs, minor/patch grouped per ecosystem; majors individual.
# No ignore block: the worker has no native deps, and worker-ci.yml gives every
# bump a real pre-merge check.

updates:
  # ---- Cloudflare Worker (hono, wrangler, vitest, @cloudflare/*) ----
  - package-ecosystem: "npm"
    directory: "/worker"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      worker-minor-patch:
        update-types: ["minor", "patch"]

  # ---- GitHub Actions ----
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      actions-minor-patch:
        update-types: ["minor", "patch"]
```

- [ ] **Step 2: Validate structure**

Run (from `wecoded-marketplace/`):

```bash
cd wecoded-marketplace
python3 - <<'PY'
import yaml
d = yaml.safe_load(open(".github/dependabot.yml"))
assert d["version"] == 2
ups = d["updates"]
assert [(u["package-ecosystem"], u["directory"]) for u in ups] == \
       [("npm","/worker"),("github-actions","/")]
for u in ups:
    assert u["schedule"]["interval"] == "weekly"
    assert u["open-pull-requests-limit"] == 5
    assert next(iter(u["groups"].values()))["update-types"] == ["minor","patch"]
    assert "ignore" not in u, "marketplace has no ignore block"
print("OK marketplace dependabot.yml: npm(/worker)+actions, weekly/grouped, no ignores")
PY
```

Expected output:
```
OK marketplace dependabot.yml: npm(/worker)+actions, weekly/grouped, no ignores
```

- [ ] **Step 3: Commit on a feature branch**

```bash
cd wecoded-marketplace
git fetch origin && git checkout master && git pull origin master
git checkout -b chore/dependabot
git add .github/dependabot.yml
git commit -m "chore: add Dependabot config for worker npm + GitHub Actions

Weekly minor/patch grouped, majors individual, 5 open PR cap. No ignore block —
worker has no native deps and worker-ci.yml gives every bump a pre-merge check.
Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR (after Task 3 has merged to master)**

```bash
cd wecoded-marketplace
git push -u origin chore/dependabot
gh pr create --repo itsdestin/wecoded-marketplace --base master \
  --title "chore: add Dependabot config for worker npm + GitHub Actions" \
  --body "Adds \`.github/dependabot.yml\` — weekly grouped updates for the worker's npm deps and GitHub Actions. No ignore block (worker has no native deps; worker-ci.yml checks every bump). Requires worker-ci on master first. Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md §4.2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Hand to Destin to merge.

---

## Task 5: wecoded-themes — `dependabot.yml` (Part B, standalone)

**Files:**
- Create: `wecoded-themes/.github/dependabot.yml`

**Interfaces:**
- Consumes: nothing (no Part A — see context).
- Produces: weekly grouped update PRs for the repo's single npm dep and GitHub Actions.

**Context:** Per spec §4.1/§7, themes gets *no* new pre-merge check: its `test` script is npm's default `exit 1` stub and `validate-theme.yml` is scoped to `themes/**`, so a `playwright` bump has nothing meaningful to verify. Take the GitHub Actions updates; accept that the single npm dep (playwright) is eyeballed. **Default branch is `main`, not `master`** — Dependabot targets it automatically, but use `main` in the git commands below. This is an accepted open item (§7), not an oversight.

- [ ] **Step 1: Create `wecoded-themes/.github/dependabot.yml`**

Write exactly:

```yaml
version: 2

# Design + decisions: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md
# Weekly, max 5 open PRs, minor/patch grouped per ecosystem; majors individual.
# NOTE: this repo has no meaningful npm test (the `test` script is the default
# `exit 1` stub, and validate-theme.yml is scoped to themes/**), so the single
# npm dep (playwright) is eyeballed on review — an accepted trade-off (spec §7).
# GitHub Actions updates carry no such caveat.

updates:
  # ---- npm: playwright only (used for preview generation) ----
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      npm-minor-patch:
        update-types: ["minor", "patch"]

  # ---- GitHub Actions ----
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      actions-minor-patch:
        update-types: ["minor", "patch"]
```

- [ ] **Step 2: Validate structure**

Run (from `wecoded-themes/`):

```bash
cd wecoded-themes
python3 - <<'PY'
import yaml
d = yaml.safe_load(open(".github/dependabot.yml"))
assert d["version"] == 2
ups = d["updates"]
assert [(u["package-ecosystem"], u["directory"]) for u in ups] == \
       [("npm","/"),("github-actions","/")]
for u in ups:
    assert u["schedule"]["interval"] == "weekly"
    assert u["open-pull-requests-limit"] == 5
    assert next(iter(u["groups"].values()))["update-types"] == ["minor","patch"]
print("OK themes dependabot.yml: npm(/)+actions, weekly/grouped")
PY
```

Expected output:
```
OK themes dependabot.yml: npm(/)+actions, weekly/grouped
```

- [ ] **Step 3: Commit on a feature branch (base = `main`)**

```bash
cd wecoded-themes
git fetch origin && git checkout main && git pull origin main
git checkout -b chore/dependabot
git add .github/dependabot.yml
git commit -m "chore: add Dependabot config for npm + GitHub Actions

Weekly minor/patch grouped, majors individual, 5 open PR cap. npm covers the
single dep (playwright); no pre-merge check exists here (test script is the
default exit-1 stub), so playwright bumps are eyeballed — accepted trade-off.
Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR**

```bash
cd wecoded-themes
git push -u origin chore/dependabot
gh pr create --repo itsdestin/wecoded-themes --base main \
  --title "chore: add Dependabot config for npm + GitHub Actions" \
  --body "Adds \`.github/dependabot.yml\` — weekly grouped updates for the single npm dep (playwright) and GitHub Actions. No new pre-merge check here (the npm \`test\` script is the default exit-1 stub), so playwright bumps are eyeballed on review — an accepted trade-off (design §7). Design: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md §4.1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Hand to Destin to merge.

---

## Commit the plan itself (workspace repo)

The plan document is a workspace artifact — commit it to `youcoded-dev` (NOT to any sub-repo).

- [ ] **Step: Commit and push the plan**

```bash
cd /home/destin/youcoded-dev
git add docs/active/plans/2026-07-23-dependabot-implementation.md
git commit -m "docs(plans): Dependabot implementation plan — 5 PRs across 3 repos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin master
```

---

## Post-Merge Verification (spec §5)

These cannot run before merge — they observe GitHub/Dependabot behavior. Run them after the relevant PRs land on the default branch. Do each, record the result, and surface any miss to Destin.

> **ALL FIVE VERIFIED 2026-07-23.** Dependabot auto-ran on merge (no manual trigger was
> needed — the "Check for updates" step below turned out to be unnecessary), opening 29
> PRs. **V1 passed** — the load-bearing assumption held. **V5 passed only after #238**:
> the first run exposed that this plan's two Gradle entries duplicated every app
> dependency (#235 == #222), so the `/app` entry was deleted. Results and the
> unanticipated flake finding: spec §8.

- [ ] **V1 (load-bearing — spec §1.2):** After Tasks 1+2 merge, wait for or force the first Dependabot run (repo → Insights → Dependency graph → Dependabot → "Check for updates"). The **first Dependabot PR must show a non-empty check rollup**:
  ```bash
  gh pr list --repo itsdestin/youcoded --author "app/dependabot" --json number,headRefName --limit 5
  gh pr view --repo itsdestin/youcoded <that-PR#> --json statusCheckRollup \
    -q '[.statusCheckRollup[] | "\(.name // .context)=\(.conclusion // .state)"] | join(", ")'
  ```
  If empty, the `pull_request` trigger is not catching `dependabot/**` — revisit Task 1 before merging any bump. This is the single assumption not verifiable locally.

- [ ] **V2:** A PR touching `worker/**` shows the `worker-ci` check before merge. Confirm via `workflow_dispatch` on `worker-ci.yml` (Actions tab → Worker CI → Run workflow) or the first Dependabot worker PR's rollup.

- [ ] **V3:** Grouped PR titles read like "bump the desktop-minor-patch group with N updates", **not** N separate PRs. Confirm in each repo's PR list.

- [ ] **V4:** **No** Dependabot PR is opened for `node-pty`, nor for an `electron` / `koffi` / `@vscode/ripgrep` **major**. (Minor/patch electron PRs are expected and fine.)

- [ ] **V5:** Gradle produces PRs for **both** the root plugin versions (AGP/Kotlin) and `app/` libraries, with no duplicate or missing entries. If wrong, adjust the two Gradle `directory` entries per spec §6 (collapse or split).

- [ ] **On completion:** move the spec and this plan from `docs/active/` to `docs/archive/` and flip the ROADMAP item, per the workspace "merge means merge AND archive AND flip the roadmap item" rule. (Add a ROADMAP entry first if none exists.)

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- §3 scope (3 repos, 6 ecosystem entries, 4 exclusions) → Tasks 2/4/5 configs; exclusions are simply not present.
- §4.1 Part A (youcoded triggers, worker-ci, themes-no-check) → Tasks 1, 3, and Task 5 context.
- §4.2 Part B (three dependabot.yml with exact ignore policy) → Tasks 2, 4, 5.
- §5 verification (5 checks) → Post-Merge Verification V1–V5.
- §6 risks (partykit `latest`, Gradle discovery, burst, node parity) → partykit entry in Task 2, V5 for Gradle, node-20 asserted in Task 3 Step 2.
- §7 open items (themes npm caveat, deferred auto-merge) → Task 5 context + comment; auto-merge explicitly excluded in Global Constraints.

**Placeholder scan:** no TBD/TODO/"add error handling"/"similar to Task N". Every file's full content is inline; every command has expected output.

**Type/name consistency:** group keys are unique per entry (`desktop-minor-patch`, `partykit-minor-patch`, `gradle-root-minor-patch`, `gradle-app-minor-patch`, `actions-minor-patch`, `worker-minor-patch`, `npm-minor-patch`); every group uses `["minor", "patch"]`; every entry uses `interval: "weekly"` + `open-pull-requests-limit: 5`; node is `"20"` in both worker-ci and the parity assertion. The `on:`-parses-as-`True` PyYAML quirk is handled identically in all three workflow-validating snippets.
