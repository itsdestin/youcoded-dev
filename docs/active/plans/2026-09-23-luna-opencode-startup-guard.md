---
status: active
date: 2026-09-23
type: plan
tags: [native-harness, prompt-cache, opencode, luna]
---

# Luna OpenCode optional-package isolation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent OpenCode 1.18.31's optional config-directory package setup from making unapproved background network requests during the isolated Luna experiment, without changing normal OpenCode behavior or silently dropping external config.

**Architecture:** Only the private, pinned OpenCode source under `/home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31` changes. Its config loader already schedules `Npm.install` for each directory even when `OPENCODE_PURE` is set. When `YOUCODED_LUNA_EXPERIMENT=1`, require `OPENCODE_PURE=true`, skip that optional detached install, and refuse a merged config requesting external plugins, MCPs or configured skill paths or URLs. Tests inject a fake Npm service and fake HTTP so they cannot touch the compositor, account or network. This is a *partial startup barrier*, not launch authorization.

**Tech Stack:** Bun tests, Effect `Config.Service` and injected `Npm.Service`, pinned OpenCode 1.18.31; no new dependency.

## Global Constraints

- User approved this specific experiment-only startup guard; do not edit installed `/usr/bin/opencode`, real auth/profile state, the running built YouCoded app or shared worktrees.
- No OAuth, client launch, compatibility probe, provider requests, package download or paid evaluation. Do not commit, push or merge.
- Preserve prompt/model selection: refuse nonempty plugin/MCP/configured-skill paths or URLs rather than silently remove it. OAuth provider plugin is bundled and remains available; default launches continue to schedule optional installs unchanged.
- Continue to treat `XDG_STATE_HOME`, `TMPDIR`, merged config, startup network and provider routes as separate launch gates. A green unit test does not lift them.

---

### Task 1: Fake-only config-install seam and fail-closed experiment policy

**Files:**
- Modify: `/home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31/packages/opencode/test/config/config.test.ts` (existing fake service layer and writable-config tests around lines 96–113 and 1127–1155)
- Modify: `/home/destin/.cache/youcoded-luna-experiment/opencode-v1.18.31/packages/opencode/src/config/config.ts` (directory install at lines 438–480 and merged-config return at lines 589–609)
- Modify: `docs/active/plans/2026-09-23-luna-request-gate.md` (record verified scope/remaining barriers)

**Interfaces:** `configLayer({ npm?: Layer.Layer<Npm.Service> })` lets the test count `install` calls with `Layer.mock(Npm.Service)`. The existing `Config.Service.get()` and `waitForDependencies()` interfaces are unchanged. The experiment flag is the same exact `YOUCODED_LUNA_EXPERIMENT=1` already used for the private Codex guard; `OPENCODE_PURE=1` is required alongside it.

- [x] **Step 1: Write the failing fake-service tests.** Extend `configLayer` options with `npm?: Layer.Layer<Npm.Service>` and replace `[Npm.node, NpmTest.noop]` with `[Npm.node, options.npm ?? NpmTest.noop]`. In the writable-config test section, add a grouped test fixture using `configIt({ npm: Layer.mock(Npm.Service)({ install: (dir) => Effect.sync(() => { installs.push(dir) }) }) })`; use `withProcessEnvs({ YOUCODED_LUNA_EXPERIMENT: '1', OPENCODE_PURE: '1', OPENCODE_CONFIG_DIR: configDir }, Config.Service.use((svc) => svc.get().pipe(Effect.andThen(svc.waitForDependencies()))).pipe(provideInstanceEffect(dir)))` with `dir` and `configDir` from `tmpdirScoped()`/`FSUtil.use.ensureDir`. Assert `installs` remains empty. Add a test for a project config containing `plugin: ['@scope/unwanted']` and tests for an MCP entry and `skills.urls` with the same fake layer; each must refuse before any npm call. Add a non-experiment test with the fake service to assert the existing install is called, and an experiment-without-PURE test that refuses. Use `Effect.exit` to assert failures without real HTTP. The test file's `unexpectedHttp` transport is already fail-closed.
- [x] **Step 2: Run the targeted new tests red** under the private HOME/XDG/cache/state/TMPDIR environment, e.g. `bun test test/config/config.test.ts -t 'Luna optional package setup'`. Before implementation they must fail because the fake install is called or the unsafe config is accepted; no real npm service is used.
- [x] **Step 3: Implement the minimal gated policy.** At the start of instance config loading, if `process.env.YOUCODED_LUNA_EXPERIMENT === '1'` and `!Flag.OPENCODE_PURE`, throw an accurate error. Inside the config-directory loop keep `ensureGitignore` and config discovery, but schedule `npmSvc.install`/`deps.push` only if the experiment flag is absent. After all config sources have merged and before returning the final config, throw in experiment mode when `result.plugin?.length`, `Object.keys(result.mcp ?? {}).length`, or `result.skills?.paths?.length` or `result.skills?.urls?.length` is nonzero. Explain WHY: optional installs can reach the network before the provider-request guard; rejecting configured integrations avoids silently changing the task. Do not change the built-in Codex OAuth plugin or provider fetch.
- [x] **Step 4: Run tests green** with the same private environment, then `bun test test/plugin/codex.test.ts test/plugin/openai-ws.test.ts`, `bun run typecheck`, and rebuild the private Linux x64 binary with the existing `script/build.ts --single --skip-install --skip-embed-web-ui` command and private environment. Confirm its version remains 1.18.31 and installed `/usr/bin/opencode` remains 1.18.2. Run workspace `node scripts/audit-anchors.mjs` and all three `git diff --check`; check statuses, not logs containing credentials.
**Verification caveat:** The build subprocess and its internal smoke test used private HOME/XDG/TMPDIR, but two appended version-only commands after the build inherited the shell's ordinary environment. Read-only metadata inspection found no newly changed OpenCode directories at their known XDG/temp roots, but cannot prove those commands made no reads; do not reuse that unsafe command shape. No auth or provider request was attempted.

**Review follow-up:** A read-only reviewer found that configured `skills.paths` could escape the fixture despite the URL check; a seventh fake-only red/green test now pins refusal of both fields. The reviewer also noted the pre-existing empty pure-mode branch at `plugin/index.ts:181-183`. For merged config specs, the new `result.plugin` refusal happens before the plugin service executes; changing the normal pure-mode branch would alter product behavior outside the approved experiment. Programmatic plugin origins not represented in the merged config, auto-discovered skill directories and other startup network remain separate preflight risks; this review does not certify a launch.

- [x] **Step 5: Request a read-only review** of experiment-only behavior, fake-service proof and normal-launch parity. Record remaining startup/auth/tool-network gaps in the parent request-gate plan; no client launch or live comparison follows automatically.

## Self-review before execution

- Coverage is deliberately limited to optional config npm work and rejecting declared external integrations. It does **not** block active Console/well-known remote config, OAuth refresh, WebSearch/WebFetch, model catalog, Electron paths, or every third-party process; the live verdict stays BLOCKED.
- The implementation changes no prompt or selected provider/model. All tests use existing fake HTTP/Npm layers and private temporary state. No account or model transport is enabled.
- The user authorized the guard and requested continued offline work; no git commit is authorized, regardless of generic planning-skill commit examples.
