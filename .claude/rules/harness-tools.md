---
paths:
  # Split from native-runtime.md 2026-08-12 (rule-body budget): the harness
  # subdirectories — tool implementations, injection, skills, search, MCP.
  - "youcoded/desktop/src/main/harness/tools/**"
  - "youcoded/desktop/src/main/harness/injection/**"
  - "youcoded/desktop/src/main/harness/mcp/**"
  - "youcoded/desktop/src/main/harness/skills/**"
  - "youcoded/desktop/src/main/harness/search/**"
  - "youcoded/desktop/src/main/mcp-reconciler.ts"
last_verified: 2026-08-11
verify:
  - path: youcoded/desktop/src/main/harness/tools/guards.ts
    contains: "toPosix"
  - path: youcoded/desktop/src/main/harness/tools/bash.ts
    contains: "rebaseReportedCwd"
  - path: youcoded/desktop/src/main/harness/tools/grep.ts
    contains: "path-separator"
  - test: youcoded/desktop/tests/harness-tools-core.test.ts
  - path: youcoded/desktop/src/main/harness/skills/skill-catalog.ts
  - path: youcoded/desktop/src/main/harness/tools/skill.ts
  - path: youcoded/desktop/src/main/harness/injection/path-triggers.ts
    contains: "paths:"
  - path: youcoded/desktop/src/main/harness/injection/injection-budget.ts
    contains: "truncated"
  - test: youcoded/desktop/tests/skill-catalog.test.ts
  - test: youcoded/desktop/tests/skill-tool-gating.test.ts
  - test: youcoded/desktop/tests/injection-budget.test.ts
  - test: youcoded/desktop/tests/path-triggers.test.ts
  - test: youcoded/desktop/tests/rule-injection.test.ts
  - path: youcoded/desktop/src/main/harness/mcp/mcp-registry.ts
    contains: "secretRef"
  - path: youcoded/desktop/src/main/harness/mcp/mcp-client.ts
    contains: "stderr: 'pipe'"
  - path: youcoded/desktop/src/main/harness/mcp/mcp-manager.ts
  - path: youcoded/desktop/src/main/harness/mcp/mcp-tools.ts
    contains: "permissionSubject"
  - path: youcoded/desktop/src/main/mcp-reconciler.ts
    contains: "_youcodedOwnedMcpServers"
  - test: youcoded/desktop/tests/mcp-registry.test.ts
  - test: youcoded/desktop/tests/mcp-client.test.ts
  - test: youcoded/desktop/tests/mcp-manager.test.ts
  - test: youcoded/desktop/tests/mcp-tools.test.ts
  - test: youcoded/desktop/tests/mcp-gating.test.ts
  - test: youcoded/desktop/tests/mcp-projection.test.ts
  - test: youcoded/desktop/tests/mcp-startup-wiring.test.ts
---
# Native harness tools, web tools, skills/injection & MCP

Session lifecycle: sibling rule `native-runtime.md`. **Depth + why for every bullet: `youcoded/docs/native-runtime.md` (Plan A/B rule-overflow, "Tool output honesty", M3 skills/injection, MCP sections).**

## Core tools — guards: `harness-tools-core`/`harness-tool-guards`/`harness-tool-bounds` tests
- **The file-tool guards (secret paths, cwd jail) are honest friction, NOT a sandbox — Bash bypasses them.** Never present them as a security boundary or glob toward one.
- **Bash cwd is SCOPED-PERSISTENT; the file tools are not** — `shellCwd` tracks across calls (newline-terminated `__YC_CWD__` sentinel); a `cd` outside `ctx.cwd` is reverted AND announced; only cwd persists (resets on resume); file tools still resolve against `ctx.cwd`; PowerShell stays stateless.
- **Tools emit FORWARD SLASHES; Bash reports cwd in the ROOT'S SPELLING** — `toPosix()` is the one output normalizer; `rebaseReportedCwd()` re-expresses `pwd` in `ctx.cwd`'s vocabulary; containment is checked BEFORE the rebase; **`ctx.cwd` is never canonicalized** (permission-store key). **These guards are VACUOUS on Linux** — they fail only on Windows/macOS CI (`eba51705`). Four known traps: `docs/archive/specs/2026-08-11-harness-cross-platform-path-vocabulary.md`.
- **Tools DECLARE what they omitted (`bounds`); `defineTool`/`composeNotice` render it** — never hand-written truncation prose; `moreHint` is the tool's own vocabulary (per-call, else the static fallback) — guards: `tool-registry-manifest`/`harness-tool-conformance`, ast-grep `tool-bounds-not-hand-rolled`.

## Web tools (Plan B) — guards: `net-guard`/`web-fetch-tool`/`search-backends`/`search-service` tests
- **WebFetch/WebSearch follow redirects MANUALLY and re-validate every hop** (scheme + literal IP + DNS answer) — the SSRF bypass class; honest friction. Never `redirect:'follow'`.
- **WebFetch keeps its pre-parse complexity guard (`MAX_TAGS`/`MAX_DEPTH`)** — Readability is synchronous + ~quadratic in DOM depth; the 5MB cap is not a cost bound.
- **WebSearch walks a data-driven backend chain** (tavily → exa → ddg; ships in-app, refreshes from `raw.githubusercontent.com/itsdestin/youcoded/master/search-chain.json`). **DDG `202` = rate-limited, NEVER retried.** Backend ids from IPC are whitelisted.
- **Search keys are `safeStorage`-encrypted; `search-providers.json` holds only `secretRef`s**; `search:*` has 5-surface parity; `search:test` never throws (guards: `search-key-store`/`ipc-channels`).
- **AskUserQuestion rides the permission-ask rail** — the broker threads `decision.updatedInput`; `formatAnswers` is TOTAL (a throw = dangling tool_call = bricked session) — guards: `native-permission-broker`/`ask-user-question-tool`.

## Skills & injection (M3 items 1/3/5) — guards: `skill-catalog`/`skill-tool-gating`/`injection-budget`/`project-instruction-budget`/`path-triggers`/`rule-injection`/`slash-routing` tests
- **Injection is MESSAGES, never a prompt edit** (`prompt-assembly.ts` stays byte-stable) — a mid-session prompt change discards the KV cache prefix.
- **Injected content is bounded by the profile; truncation announces itself** (budgets from the REAL window; unmeasured = small, frontier providers exempt).
- **The ROOT project-instruction file is OUTLINED to fit (`fitProjectInstructions`), never tail-cut** — every heading survives; the notice says only what happened; **sizing is fixed at session start — `setBinding` does NOT re-apply it.**
- **`Skill` is CONDITIONAL and absent from `NATIVE_TOOL_NAMES`** — attached only when the profile affords its catalog; re-synced on `setBinding`; `/skill-name` works on every model.
- **A rule with no `paths:` is SKIPPED, never global** — an eager rule rides every turn.
- **`native:*` four-surface parity is pinned** (`ipc-channels.test.ts` → "native:* channel parity").

## MCP (M3 item 4, phase 1) — guards: the seven `mcp-*.test.ts` suites
- **MCP secret plaintext NEVER enters `~/.youcoded/mcp.json`** — `secretRef` only; plaintext in `SecretsStore`.
- **Attachment is WHOLE-SERVER, in registry order, dropping from the END** — a model can't reason over a partial tool set.
- **Grants are PER-TOOL (`mcp__{server}__{tool}`), not per-server** (`permissionSubject` → `undefined`) — a server update can add a destructive tool (no revocation UI until M5).
- **`stderr: 'pipe'` on the stdio transport is LOAD-BEARING** — the SDK's `'inherit'` default hides a failing server's only explanation.
- **A server's own annotations (`readOnlyHint`, `destructiveHint`) are IGNORED** — not a trusted authority about its own danger.
- **Projection into `~/.claude.json` NEVER overwrites an unowned entry** — ownership is the TOP-LEVEL `_youcodedOwnedMcpServers: string[]`; colliding unowned ids are SKIPPED into `skippedCollisions`.
