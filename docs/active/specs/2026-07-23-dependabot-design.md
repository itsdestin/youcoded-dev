---
status: active
date: 2026-07-23
owner: Destin (decisions) / Claude (spec)
---

# Dependabot across the YouCoded workspace

Automate dependency updates in the three repos that have a real dependency surface,
and close the CI gaps that would otherwise make those updates unverifiable.

Dependency bumps happen reactively today — the Electron 41.0.3 → 41.10.3 bump
(`38619bd6`, shipping the transparent-window smear fix) landed only because someone
noticed the upstream issue. Nothing surfaces a security patch or an upstream bug fix
on its own.

---

## 1. Verified findings

Everything below was checked against the live repos on 2026-07-22/23, not assumed.
Two of these corrected an initial claim that was wrong.

### 1.1 CI *does* run on PRs in youcoded — my first claim was wrong

Check runs attach to a **commit SHA**, not to a PR. Pushing a branch named
`fix/electron-41.10.3-smear` matches `desktop-ci.yml`'s `fix/**` pattern, fires the
workflow, and the runs land on the same SHA that is the PR head — so GitHub displays
them on the PR. All **30** most-recent merged youcoded PRs carry a full check rollup.

The narrower claim that survives: CI fires only for branches matching
`master | feat/** | feature/** | fix/**`. All 30 of those PRs used `feat/` or `fix/`,
so the naming discipline holds in practice and there is **no live gap in youcoded**.

### 1.2 Dependabot branches would not match

Dependabot names branches `dependabot/npm_and_yarn/...`; the `dependabot/` prefix is
fixed and not configurable. That matches none of the four patterns, so Dependabot PRs
specifically would arrive unchecked.

**Confidence note:** this is the one load-bearing claim not verified against these
repos, because no repo here has run Dependabot yet. It is knowledge about Dependabot's
naming, and it is cheap to falsify — the first Dependabot PR either shows a check
rollup or it does not. See §5.

### 1.3 wecoded-marketplace has no pre-merge checks at all — worse than a Dependabot problem

PRs **#51–#55** all merged with an **empty check rollup**. Four of them touched
`worker/`. `worker-deploy.yml` triggers only on push to master and runs the tests as
part of the **deploy** job, so worker code is exercised *after* merge, against
production Cloudflare. `validate-plugin-pr.yml` does run on `pull_request`, but is
path-scoped to `plugins/**`.

This affects hand-written PRs today, independent of Dependabot.

### 1.4 node-pty is a trap for automated bumps

`desktop/package.json` runs `postinstall: node scripts/patch-node-pty.js`, which
rewrites a line in `node_modules/node-pty/lib/unixTerminal.js` to fix a macOS
spawn-helper path bug. When its target string is absent the script prints
`pattern not found — skipping (may be fixed upstream)` and **exits 0**.

So a version bump can silently drop the fix: `npm ci` succeeds, CI goes green, and the
breakage appears only in a **packaged** macOS build (`posix_spawn failed`), which
`desktop-ci.yml` never produces. Independent corroboration: npm's `latest` for node-pty
is **1.1.0**, *below* the pinned `1.2.0-beta.12` — automated tooling has no idea which
direction is forward here.

The same "green CI does not prove a packaged build works" logic covers `koffi` (native
FFI, prebuilt binaries) and `@vscode/ripgrep` (downloads a platform binary at install).

### 1.5 First-run volume

`npm outdated` in `desktop/`: **27 packages behind** — 7 major, 20 minor/patch.
Majors: `typescript 5.9.3→7.0.2`, `electron →43.2.0` (2 majors), `koffi 2→3`,
`pdfjs-dist 5→6`, `chokidar 4→5`, `which 4→7`, `@testing-library/jest-dom 6→7`.

Under the policy in §4, desktop alone yields ~24 day-one PRs. With partykit, the
worker, themes, Gradle, and GitHub Actions, an ungrouped first run is **~40–60 PRs at
once**.

### 1.6 No branch protection

`itsdestin/youcoded` has no branch protection and no rulesets. That is why **#210**
merged with `build (windows-latest)=FAILURE` and **#207** with
`build (macos-latest)=FAILURE`. Consequence for this design: GitHub auto-merge fires
when *required* checks pass, so with none configured it would merge **immediately,
without waiting for CI**. Auto-merge is only meaningful after required checks exist.

---

## 2. Decisions (Destin, 2026-07-22/23)

| # | Decision | Chosen |
|---|---|---|
| 1 | Scope | **Dependabot + the CI gaps it exposes** — one project, not split |
| 2 | Risk posture | **Tiered** — block risky natives, allow everything else incl. majors |
| 3 | Cadence | **Weekly, grouped, throttled** — minor/patch batched, majors individual |
| 4 | Auto-merge | **None**, and **no branch-protection changes** |
| 5 | youcoded CI trigger | **Standard** (`push: [master]` + `pull_request:`), not the minimal `dependabot/**` addition |

Decision 4 rationale: see §1.6 — auto-merge without required checks merges *before*
CI, which is strictly worse than manual merging. Revisit only if required checks are
added later.

---

## 3. Scope

### In

| Repo | Ecosystem | Directory | Watches |
|---|---|---|---|
| youcoded | npm | `/desktop` | ~56 packages, the main surface |
| youcoded | npm | `/desktop/partykit` | typescript (see §6 on `"latest"`) |
| youcoded | gradle | `/`, `/app` | AGP 8.7.0, Kotlin 2.1.0, Compose BOM 2024.12.01, okhttp, mlkit, camerax |
| youcoded | github-actions | `/` | checkout@v4, setup-node@v4, setup-java@v4, upload-artifact@v4, setup-gradle@v4 |
| wecoded-marketplace | npm | `/worker` | hono, wrangler, vitest, @cloudflare/* |
| wecoded-marketplace | github-actions | `/` | same action set |
| wecoded-themes | npm, github-actions | `/` | playwright (its only dep) |

### Out, with reasons

- **youcoded-core** — one `actions/checkout@v4`, no package manifest, and the repo is
  scheduled for archival after release N+1 (`docs/active/plans/2026-04-21-deprecate-youcoded-core.md`).
  Throwaway work.
- **youcoded-admin** — private, no workflows, no dependencies.
- **`civic-report/`, `wecoded-marketplace-publisher/`, `wecoded-themes-plugin/`** —
  verified **zero dependencies** in all three; they are plugin manifests, not npm projects.
- **`youcoded/terminal-emulator-vendored/`** — vendored source. Auto-bumping vendored
  code defeats the point of vendoring it.

---

## 4. Design

### 4.1 Part A — make the checks real

**youcoded** (`desktop-ci.yml`, `android-ci.yml`) — switch to:

```yaml
on:
  push:
    branches: [master]
  pull_request:
  workflow_dispatch:
```

Neither workflow reads `secrets.*` (android-ci only *mentions* release-keystore secrets
in a comment explaining it runs without them), so Dependabot's restricted token and
absent secrets are fine.

Trade-off accepted with decision 5: pushes to `feat/**`/`fix/**` no longer get checks
*before* a PR is opened. In exchange, every PR is checked regardless of branch name —
including `chore/`, `refactor/`, and `docs/`, which get **zero** checks today.

> **Implementation note:** both files carry a long comment documenting the
> 2026-07-14→07-16 incident where the `feat/**` vs `feature/**` gap left master red
> across 18 pushes. **Amend that comment, do not delete it** — it is the reason this
> change exists, and the new trigger is the fix it was pointing at.

**wecoded-marketplace** — new `.github/workflows/worker-ci.yml`:

```yaml
name: Worker CI

# Worker code had NO pre-merge checks: worker-deploy.yml runs only on push to master
# and runs the tests as part of DEPLOYING, so a broken PR merged green and failed at
# deploy time against production. Verified 2026-07-22: PRs #51-#55 all merged with an
# empty check rollup, four of them touching worker/. This runs the same tests first.
on:
  pull_request:
    paths:
      - 'worker/**'
      - '.github/workflows/worker-ci.yml'
  workflow_dispatch:

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
          node-version: '20'          # match worker-deploy.yml — confirm at implementation
          cache: 'npm'
          cache-dependency-path: worker/package-lock.json
      - run: npm ci
      - run: npm run typecheck        # tsc --noEmit
      - run: npm test                 # vitest run
```

**wecoded-themes** — no new workflow. Its `test` script is npm's default `exit 1` stub
and `validate-theme.yml` is scoped to `themes/**`, so a playwright bump has nothing
meaningful to check. Take the GitHub Actions updates; accept that the single npm dep is
eyeballed rather than build a check that only pretends to verify something. Flagged as
an open item in §7.

### 4.2 Part B — the Dependabot configs

Common to every entry: `interval: weekly`, `open-pull-requests-limit: 5`, and a group
batching **minor + patch into one PR per ecosystem**, with majors left individual so a
bad one can be reviewed and reverted alone.

**`youcoded/.github/dependabot.yml`**

```yaml
version: 2

# Design + decisions: youcoded-dev/docs/active/specs/2026-07-23-dependabot-design.md
# Weekly + grouped: minor/patch batch into ONE PR per ecosystem; majors stay individual.

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
      # node-pty is PATCHED after install by desktop/scripts/patch-node-pty.js, which
      # rewrites a line in unixTerminal.js and EXITS 0 when that line is absent
      # ("pattern not found - skipping"). A bump can therefore silently drop the macOS
      # spawn-helper fix while npm ci and CI stay green; the breakage shows only in a
      # PACKAGED mac build (posix_spawn failed), which desktop-ci.yml never produces.
      # Bump by hand and re-verify the patch applied. Note also that npm's "latest"
      # (1.1.0) is BELOW our pin (1.2.0-beta.12) - "forward" is not machine-decidable.
      - dependency-name: "node-pty"
      # Natives below: green tests do not prove a PACKAGED build works, so majors get
      # bumped deliberately rather than automatically. Minor/patch still flow.
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
  # Two entries: plugin versions live in the ROOT build.gradle.kts (AGP, Kotlin) while
  # libraries live in app/build.gradle.kts (Compose BOM, okhttp, mlkit, camerax).
  # terminal-emulator-vendored/ is deliberately absent - it is vendored source.
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

**`wecoded-marketplace/.github/dependabot.yml`** — `npm` at `/worker` plus
`github-actions` at `/`, same schedule/limit/group shape. No `ignore` block: the worker
has no native deps, and `worker-ci.yml` (§4.1) gives every bump a real pre-merge signal.

**`wecoded-themes/.github/dependabot.yml`** — `github-actions` at `/` plus `npm` at `/`
(playwright only), same shape. No `ignore` block.

---

## 5. Verification

1. **The load-bearing one (§1.2):** the first Dependabot PR in youcoded shows a
   **non-empty check rollup**. If it is empty, the `pull_request:` trigger is not
   catching Dependabot branches and Part A needs revisiting before any bump is merged.
2. A PR touching `worker/` shows the new `worker-ci` check *before* merge.
3. Grouped PRs read like "bump 19 npm deps", not 19 separate PRs.
4. **No** PR is opened for `node-pty`, nor for an `electron` / `koffi` /
   `@vscode/ripgrep` major.
5. Gradle produces PRs for both root plugin versions and `app/` libraries, without
   duplicates (see §6).

---

## 6. Risks

- **`"partykit": "latest"`** in `desktop/partykit/package.json` is a floating tag.
  Dependabot will likely move only the lockfile and leave the manifest alone — low
  value, no harm. Worth recording as a pre-existing oddity: a floating `latest` means
  that dependency *already* changes under you with no PR at all.
- **Gradle multi-module discovery** — `/` and `/app` are specified explicitly rather
  than assuming Dependabot walks subprojects from the root. If the first run shows
  duplicate or missing Gradle PRs, collapse or split that entry accordingly.
- **First-run burst** — `open-pull-requests-limit: 5` throttles it, but expect roughly
  two weeks of drain-down before a ~3–6 PR/week steady state.
- **Node version drift** in `worker-ci.yml` — pinned to `20` above; confirm against
  `worker-deploy.yml` at implementation time so pre-merge and deploy agree.

---

## 7. Open items

- **wecoded-themes npm has no meaningful check** (§4.1). Proceeding as designed —
  playwright bumps get eyeballed. Raised with Destin 2026-07-22; not objected to, but
  not explicitly confirmed either. Revisit if a playwright bump ever breaks preview
  generation in `update-registry.yml`.
- **Required status checks / auto-merge** deferred by decision 4. The prerequisite is
  branch protection (§1.6). Natural revisit point: after a month of grouped PRs, if
  merging them by hand feels like busywork.
