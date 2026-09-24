---
status: superseded
date: 2026-09-23
type: plan
tags: [native-harness, prompt-cache, evaluation, opencode, luna]
---

# Luna prompt-reuse offline feasibility implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether the approved YouCoded-vs-OpenCode Luna experiment can measure and cap provider requests without reaching real accounts, modifying the built app, or writing a controller on an unproven data source.

**Architecture:** This is a prerequisite gate, not the scored experiment. Pin OpenCode's source to v1.18.31, establish observable request/usage/failed-retry boundaries for *both* clients, then prove launch-state isolation using read-only source inspection and a no-launch dry run. Record a pass/block verdict; only a pass authorizes a separate implementation plan for fixture, normalizer, controller and synthetic-stream tests. A pass is not authorization to install OpenCode, authenticate or send model requests.

**Tech Stack:** Git worktrees, Node.js, Bash, Electron, OpenCode v1.18.31 pinned source, YouCoded native harness diagnostics. Parent contract: `docs/archive/specs/2026-09-15-youcoded-opencode-luna-prompt-reuse.md`.

## Global Constraints

- Use the workspace session `prompt-reuse-luna-recovery`; the workspace and `youcoded` component worktrees are returned by `node scripts/workspace-start.mjs --session prompt-reuse-luna-recovery`.
- **No** live YouCoded access, OAuth, ChatGPT-plan requests, OpenRouter/Go/Zen spending, unapproved installation, or changes to installed OpenCode or existing auth stores.
- No HTTP interception, raw provider traffic logging, copied ciphertext, account IDs or real session exports. Only published version-pinned source and synthetic data may be inspected.
- Stop if provider-request attempt counting or pre-dispatch request ceilings cannot be made reliable for either arm. Successful *message* usage alone is insufficient; missing cache counts are null.
- Do not edit the app in this gate. Do not commit, push or merge unless explicitly asked. Later implementation requires numeric per-turn, per-repetition and whole-run ceilings approved before live use.

## First-pass outcome (2026-09-23)

**BLOCKED for live use under the current spec; no provider request was made.** The pinned OpenCode 1.18.31 [`processor.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/session/processor.ts) persists a `step-finish` part only after a completed model step. Its [`retry.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/session/retry.ts) can retry a failed stream without a step-finish usage part for that attempt; [`run.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/cli/cmd/run.ts) streams parts, not a complete provider-request ledger. [`session.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/session/session.ts) subtracts cached-read/write counts from total input in its persisted `tokens.input` field, and defaults missing cache-read detail to zero. Reconstructing provider-total input or treating missing cache detail as zero without inspecting earlier provider fields would be wrong. The actual ChatGPT OAuth response's cache fields remain unverified.

YouCoded's `chatgpt-auth.ts:995-1015` records dispatches before each underlying fetch (including its 401 re-send), but `chatgpt-request-diagnostics.ts:192-220,235-266` queues outcome rows and flushes them asynchronously. A controller polling the diagnostic JSONL therefore does **not** yet have a proven pre-dispatch stop mechanism. For both arms, source-backed observation of completed requests is not equivalent to control over the *next* request. Do not implement the scorer or make a compatibility probe until the request-control design is approved and an offline fake-transport test proves it fails closed.

`run-dev.sh --dry-run` under a private HOME and XDG roots printed the isolated YouCoded worktree/profile and `(--dry-run: not launching)`; it did not prove every effective Electron path. The installed `opencode --version` returned `1.18.2`; the experiment's pinned `1.18.31` has not been installed. The remaining path/config and OAuth cache-coverage checks are still unknown, not passed.

**Decision (2026-09-23):** Destin approved tightly scoped, content-free *experiment-only* pre-dispatch instrumentation for **both** isolated clients, with no prompt or model behavior change. Design the exact seams and fake-transport tests before client edits; installation, authentication and model requests are not authorized by this decision. No client code was edited in this feasibility gate.

## File ownership

- Existing input, no edits: `docs/archive/specs/2026-09-15-youcoded-opencode-luna-prompt-reuse.md`.
- This plan records steps only. Its completion verdict is a short report in conversation with exact pinned source URLs and worktree `file:line` references; do not make a permanent report that includes account/profile data.
- If either gate blocks, propose a **specific** non-interception path to regain coverage, its privacy/fairness trade-off and the approval it needs. Do not silently weaken the experiment or start building a scorer.

---

### Task 1: Version-pinned request/usage contract

**Inputs:** OpenCode `v1.18.31` GitHub release and its source, YouCoded `youcoded/desktop/src/main/providers/chatgpt-request-diagnostics.ts`, `chatgpt-model.ts`, `provider-registry.ts`.

**Produces:** An evidence table for each arm: (1) attempt dispatch, (2) success/failure/abort/retry, (3) root vs auxiliary lane, (4) nullable provider-reported input/cached count, (5) whether total input includes cached tokens, (6) a *pre-dispatch* controller-visible counter/ceiling, (7) post-restart metadata/restoration evidence. Mark each confirmed, unavailable or unknown and identify the exact source.

- [ ] **Step 1: Establish version scope.** Check `https://github.com/anomalyco/opencode/releases/tag/v1.18.31`; start from `https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/session/llm.ts` and `https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/session/processor.ts`; inspect referenced files at the same tag, never main-branch docs as proof of 1.18.31 behavior. Record the installed binary's version separately with `opencode --version` (this is read-only and does not authenticate). Expected: release tag exists; local installed version is recorded without being changed.
- [ ] **Step 2: Trace OpenCode's request-to-record lifecycle.** Read pinned `packages/opencode/src/session/llm.ts`, `processor.ts` and their referenced stream/event, retry, auth and storage implementations. For each actual provider attempt, locate a public event or safely inspectable local record produced **before the next dispatch**, including retries and failure paths. Inspect the cache token mapping rather than treating message/step tokens as a provider-request row. Expected: a cited chain or an explicit unknown/block; a `step-finish` row on successful steps alone does not pass.
- [ ] **Step 3: Trace YouCoded diagnostics.** Read `youcoded/desktop/src/main/providers/chatgpt-request-diagnostics.ts:20-35,192-220,241-279`, `provider-registry.ts` and `chatgpt-model.ts` in this worktree. Verify dispatch and finish/loss rows, file-flush timing, usage extraction, root/auxiliary labels and whether the controller could stop the next provider attempt when the ceiling is met. Expected: cite the concrete hook and any gaps; a delayed JSONL writer is not automatically a pre-dispatch counter.
- [ ] **Step 4: Decide the gate.** PASS only if both arms expose all attempts, failure/auxiliary attempts and a way to prevent an over-ceiling dispatch without network interception or product behavior change. PARTIAL/BLOCK if fields are absent, logged only after another dispatch, or only aggregated by message; do not infer a guarantee from CLI documentation. Record whether cache usage comparability remains unproven until an authorized compatibility probe even if the attempt ceiling passes. Expected: a one-line PASS/PARTIAL/BLOCK per client with evidence.

### Task 2: Launcher state-isolation contract

**Inputs:** `scripts/run-dev.sh`, `youcoded/desktop/src/main/main.ts`, `native-home.ts`, conversation roots, both clients' documented config precedence and root resolution.

**Produces:** A path table covering effective `HOME`, XDG roots, Electron `appData/userData`, `NativeHome`, project/transcript roots, ChatGPT auth/secrets, diagnostics, continuation, instructions/skills, OpenCode auth/plugins/share/config and any built-profile reads. No real auth files are opened.

- [ ] **Step 1: Confirm YouCoded paths.** Trace `YOUCODED_PROFILE` handling and Electron `appData/userData` at `main.ts:336-353`, `os.homedir()` paths via `native-home.ts:52-57`, and `run-dev.sh:216-230`. Account for `main.ts`'s read of the built-profile machine identity *relative to its resolved appData path*. Expected: private `HOME` **and** XDG config/data/cache roots are needed; `--profile` alone is not enough.
- [x] **Step 2: Dry-run without launch.** Run `HOME=/tmp/youcoded-luna-offline-placeholder XDG_CONFIG_HOME=/tmp/youcoded-luna-offline-placeholder/config XDG_DATA_HOME=/tmp/youcoded-luna-offline-placeholder/data XDG_CACHE_HOME=/tmp/youcoded-luna-offline-placeholder/cache bash scripts/run-dev.sh --path /home/destin/youcoded-dev/worktrees/sessions/prompt-reuse-luna-recovery/youcoded --profile luna-eval --label 'Luna Cache Experiment' --no-devtools --dry-run` from the workspace worktree. Expected: it prints the experiment checkout/profile and `(--dry-run: not launching)`; no Electron, Vite, login, filesystem migration or remote server starts. The printed profile path is descriptive, not proof of effective Electron paths; source-trace those separately.
- [ ] **Step 3: Confirm OpenCode isolation from pinned code.** Inventory 1.18.31's HOME and XDG handling, global/project/inline/managed config merge, default `AGENTS.md`/`CLAUDE.md` ancestry, plugin/MCP loading, `share` default/override, auth state and background server/session storage. A private XDG root without private HOME is not a pass. Expected: list exact environment/config keys and how to assert effective values offline; if an uncontrolled credential or instruction source remains, BLOCK before launch.
- [ ] **Step 4: Decide the gate.** PASS only when both clients' *read and write* roots can be kept away from the real home/installed app and a verifiable effective-config inspection exists; otherwise BLOCK with the escaping path and proposed remedy. Do not launch a browser, Electron or OpenCode TUI in this task.

**Follow-up source evidence (2026-09-23; still BLOCKED):** A scrubbed-env `run-dev.sh --dry-run` selected the isolated app and `luna-eval` with DevTools off; it did not start Electron or prove its effective paths. Separate Node and Bun children resolved private `HOME`, `os.homedir()` and `TMPDIR`, with private XDG config/data/cache/state values. A separate Bun child imported pinned OpenCode's actual `@opencode-ai/core/global` module under that scrubbed environment and asserted every resulting `Global.Path` value (home/data/bin/log/repos/cache/config/state/tmp) is under the private root; it did not start the client or resolve other plugin/project paths. The existing private root and its home/config/data/cache/bun-cache directories were mode 0700; a depth-six scan of the private state trees found no symlinks, and `findmnt -R` reported no mount rooted inside the private experiment root at inspection time. Neither result is a future-launch attestation or a full symlink scan. OpenCode 1.18.31's `packages/core/src/global.ts:10-43` derives XDG state and OS temp separately and creates directories at module import; any future launcher must set `XDG_STATE_HOME` **and** `TMPDIR` in addition to the earlier variables. `packages/opencode/src/config/config.ts:438-479` schedules `Npm.install` for each config directory; `packages/core/src/npm.ts:139-155` can reify missing `node_modules`. `OPENCODE_PURE` does not guard that config-directory install in the inspected code, so even a private, empty config can start background package/network work. `config/config.ts:530-535` can read Linux `/etc/opencode`; its directory was absent in this metadata-only check, not permanently guaranteed absent. `config/paths.ts:23-40` may include project and private-home `.opencode` directories; `session/instruction.ts:60-66,110-135` loads instruction ancestry unless disabled. `auth/index.ts:58-79` reads private XDG data auth unless test-only `OPENCODE_AUTH_CONTENT` overrides it; that empty override must **not** be carried into an eventual authenticated run. `session/llm.ts:224-253` has an opt-in native LLM runtime distinct from the tested AI SDK route; its flag is `OPENCODE_EXPERIMENTAL_NATIVE_LLM` (`effect/runtime-flags.ts:54`). Although `session/llm/native-runtime.ts:148-152` picks up the OAuth provider fetch override, the fake SDK-retry test does not validate this route; the launcher must explicitly keep native/WebSocket modes off or they require separate coverage. `config/config.ts:438-479` and `skill/index.ts:222-225` also show plugin setup and skill URLs need a private, inspected merged config rather than reliance on `--pure` alone. These source and child-env checks do not certify Electron paths, merged runtime config, plugins, startup network or safe live launch.

### Task 3: Signed-off offline outcome and next stage

**Inputs:** Task 1 and Task 2 evidence tables and the parent spec's `Implementation and verification contract`.

**Produces:** An honest next-action decision, not an untested execution rig.

- [ ] **Step 1: Audit coverage.** Explicitly separate proven request ceilings from still-unverified cache field semantics, continuation metadata and actual Luna OAuth routing. Cite each speculative claim as unknown rather than closing it by inference. Compare the findings against the spec's no-traffic-interception/no-product-change and privacy constraints.
- [ ] **Step 2: Issue decision.** If both gates PASS, write a *separate* offline controller/fixture implementation plan with exact files, fake-stream tests, numeric proposed ceilings and live authorization checkpoints; use TDD and review it before implementation. If either gate BLOCKS, stop and offer Destin 2–3 options (e.g. tightly scoped pre-score instrumentation on both arms, a less ambitious observational test, or ending the comparison) with fairness/privacy and quota implications. Do not install or send even a one-line compatibility probe without an explicit later decision.
- [ ] **Step 3: Verify scope.** Run `git diff --check` and `git status --short` in the session workspace and component worktree. Expected: only this plan and the already-approved spec modification in the workspace; no app changes or new auth/profile state.
