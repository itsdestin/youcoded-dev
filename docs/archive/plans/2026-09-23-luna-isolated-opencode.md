---
status: superseded
date: 2026-09-23
type: plan
tags: [native-harness, prompt-cache, evaluation, opencode, luna]
---

# Luna isolated OpenCode acquisition plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtain and verify an independent OpenCode 1.18.31 source/build for offline transport instrumentation without changing the installed 1.18.2 client, live app or existing profiles.

**Architecture:** Acquire the exact release tag into an experiment-only, nonshared directory; inspect the build script and lockfile; install pinned dependencies under a private HOME and XDG cache, then build only the Linux x64 client. Do not launch it against a model or perform OAuth. The separate instrumentation plan must name exact pinned transport files and fake-network tests before client source is edited.

**Tech Stack:** Git, Bun, TypeScript, OpenCode 1.18.31, Linux x64.

## Global Constraints

- Work from the session worktree `prompt-reuse-luna-recovery` for YouCoded and workspace docs. OpenCode source and dependencies live **outside** all shared checkouts at `/home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31`; never link to `/usr/bin/opencode` or existing OpenCode auth/config directories.
- The user authorized an isolated download/build and experiment-only, content-free pre-dispatch counting. OAuth, provider requests, paid calls, account/profile copying, production-app changes, commits, pushes and merges remain out of scope.
- Never run the acquired OpenCode client until effective HOME/XDG paths and plugin/config ancestry are audited; `--version` is allowed only after checking it has no initialization or auth side effects.
- No provider traffic capture or HTTPS interception. The count must eventually happen synchronously before actual dispatch, include low-level retries/resends, and refuse over-limit attempts. All proofs use fake transports.

---

### Task 1: Acquire exact source without disturbing installed OpenCode

**Paths:** Create `/home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31` and private HOME/XDG siblings. No workspace source files edited.

- [x] **Step 1: Inspect destination before creating it.** Run `test ! -e /home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31 && git ls-remote --tags https://github.com/anomalyco/opencode.git refs/tags/v1.18.31` and record the tag object. Expected: destination absent, exactly one tag line (`014614d35b397775e5d397a490fc72368c894ec2` observed); if it exists, stop and inspect instead of overwriting another session's work.
- [x] **Step 2: Create a private experiment root and fetch tag.** Run `install -d -m 0700 /home/destin/.cache/youcoded-luna-experiment && git clone --depth 1 --branch v1.18.31 --single-branch https://github.com/anomalyco/opencode.git /home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31`. Expected: the checkout is outside the workspace and shared checkouts; do not use `git reset`, `git clean` or modify `/usr/bin/opencode`.
- [x] **Step 3: Verify checkout identity.** Run `git -C /home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31 describe --tags --exact-match HEAD && git -C /home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31 status --short && opencode --version`. Expected: `v1.18.31`, empty source status, installed client still its original version.

### Task 2: Inspect pinned build and install privately

**Paths:** Read `bun.lock`, root `package.json`, `packages/opencode/package.json`, `packages/opencode/script/build.ts` at the private checkout. Dependency output remains in that checkout; cache/home under the private experiment root.

- [x] **Step 1: Inspect scripts and platform flags before running them.** Search the pinned build script for Linux/x64 target flags, artifact paths, package downloads and commands with external side effects. Check `bun.lock` exists. Expected: identify a Linux-only build invocation; if the script would publish, alter system binaries, read existing profiles or install globally, do not run it.
- [x] **Step 2: Install pinned dependencies.** Create private `home`, `config`, `data`, `cache` and `bun-cache` directories with mode 0700. In the checkout run `HOME=/home/destin/.cache/youcoded-luna-experiment/home XDG_CONFIG_HOME=/home/destin/.cache/youcoded-luna-experiment/config XDG_DATA_HOME=/home/destin/.cache/youcoded-luna-experiment/data XDG_CACHE_HOME=/home/destin/.cache/youcoded-luna-experiment/cache BUN_INSTALL_CACHE_DIR=/home/destin/.cache/youcoded-luna-experiment/bun-cache bun install --frozen-lockfile`; review the command's output and any lifecycle scripts. Expected: lockfile unchanged and no global installation. On failure inspect rather than repeatedly reinstalling.
- [x] **Step 3: Build only Linux x64.** From `packages/opencode/` in the private checkout run `env -u OPENCODE_RELEASE HOME=/home/destin/.cache/youcoded-luna-experiment/home XDG_CONFIG_HOME=/home/destin/.cache/youcoded-luna-experiment/config XDG_DATA_HOME=/home/destin/.cache/youcoded-luna-experiment/data XDG_CACHE_HOME=/home/destin/.cache/youcoded-luna-experiment/cache BUN_INSTALL_CACHE_DIR=/home/destin/.cache/youcoded-luna-experiment/bun-cache OPENCODE_VERSION=1.18.31 OPENCODE_CHANNEL=latest bun run script/build.ts --single --skip-install --skip-embed-web-ui`. `--single` selects the host Linux x64 target; `--skip-install` prevents script-level extra installs; `--skip-embed-web-ui` avoids unrelated web app building. `OPENCODE_VERSION` avoids detached-tag preview stamping; `env -u OPENCODE_RELEASE` prevents the script's `gh release upload` path. The script may fetch the public models.dev catalog; that is not a model call. Expected: `dist/opencode-linux-x64/bin/opencode` (private) passes the script's own `--version` smoke with `1.18.31`. If the build initiates unexpected activity, stop and report rather than guessing flags.

### Task 3: Handoff to the instrumentation plan

**Pinned transport inventory:** `packages/opencode/src/plugin/openai/codex.ts:328-435` installs the OAuth provider fetch and rewrites `/v1/responses` or `/chat/completions` before its final HTTP fetch. A pinned `@ai-sdk/openai` 3.0.88 test (`generateText` with `maxRetries: 1` and a fake 503) proves its retry enters this custom fetch again and the second wire send is refused; separate offline tests exercise two explicit calls and an auxiliary URL. This proves the tested SDK route, not all provider transports. `codex.ts:135-148` refreshes an expired OAuth token through a separate token-endpoint fetch; it is not a model request and has no model-request reservation. `packages/opencode/src/plugin/openai/ws-pool.ts:43-155,217-239` can send over WebSocket, retry/fallback to HTTP, and bypass a single pre-wrapper reservation; `src/plugin/index.ts` enables this mode by flag/channel. The isolated HTTP-only gate refuses WebSocket mode rather than silently undercount. YouCoded's `desktop/src/main/providers/chatgpt-auth.ts:995-1034` sends each model attempt through `send()`, including a second send after 401, independently of token refresh. This inventory does **not** prove coverage of other configured providers, alternate native runtimes or every auxiliary lane; the later runner must pin/attest effective routing and fail if it differs.

- [x] **Step 1: Inventory the exact pinned HTTP and optional WebSocket Codex transport paths, refresh calls and auxiliary provider routes in the acquired source and dependencies.** Record file:line evidence and an explicit coverage table; a plugin that sees only model steps does not satisfy the request ceiling.
- [x] **Step 2: Write a separate TDD plan for isolated YouCoded and OpenCode pre-dispatch counters, fake 401/retry/WebSocket/auxiliary streams, zero-content logs, overflow/fail-closed behavior, and tests that prove the over-limit request never reaches a fake network adapter.** Have that plan reviewed before edits. No OAuth or actual provider request is included.
- [x] **Step 3: Verify `git diff --check` and status in the workspace, app component, pinned source and original installed version.** Preserve existing unstaged spec/plan changes; do not commit anything without an explicit request.
