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
  # G-1 background Bash: the registry lives one level up from tools/.
  - "youcoded/desktop/src/main/harness/shell-registry.ts"
last_verified: 2026-08-28
verify:
  - path: youcoded/desktop/src/main/harness/tools/guards.ts
    contains: "toPosix"
  - path: youcoded/desktop/src/main/harness/tools/bash.ts
    contains: "rebaseReportedCwd"
  - path: youcoded/desktop/src/main/harness/shell-registry.ts
    contains: "SIGTERM"
  - test: youcoded/desktop/tests/shell-registry.test.ts
  - test: youcoded/desktop/tests/bash-background.test.ts
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
  - test: youcoded/desktop/tests/send-user-file-tool.test.ts
  - path: youcoded/desktop/src/main/harness/tools/arg-errors.ts
    contains: "unknown parameter"
  - path: youcoded/desktop/src/main/harness/pdf-text.ts
    contains: "serialized"
  - path: youcoded/desktop/src/main/harness/tools/write.ts
    contains: "detectOmissionPlaceholder"
  - test: youcoded/desktop/tests/tool-arg-errors.test.ts
  - test: youcoded/desktop/tests/native-tools-polish.test.ts
  - test: youcoded/desktop/tests/read-pdf.test.ts
  - test: youcoded/desktop/tests/ask-user-question-card-other.test.tsx
  - path: youcoded/desktop/src/main/harness/tools/send-user-file.ts
    contains: "permissionSubject: \(\) => undefined"
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

Session lifecycle: `native-runtime.md`. **Depth + why for every bullet: `youcoded/docs/native-runtime.md`.**

## Core tools — guards: `harness-tools-core`/`harness-tool-guards`/`harness-tool-bounds` tests
- **The file-tool guards (secret paths, cwd jail) are honest friction, NOT a sandbox — Bash bypasses them.** Never present them as a security boundary or glob toward one.
- **Bash cwd is SCOPED-PERSISTENT; the file tools are not** — `shellCwd` tracks across calls (`__YC_CWD__` sentinel); a `cd` outside `ctx.cwd` is reverted AND announced; only cwd persists (resets on resume); PowerShell stays stateless.
- **Tools emit FORWARD SLASHES; Bash reports cwd in the ROOT'S SPELLING** — `toPosix()` is the one output normalizer; `rebaseReportedCwd()` re-expresses `pwd` in `ctx.cwd`'s vocabulary; containment is checked BEFORE the rebase; **`ctx.cwd` is never canonicalized** (permission-store key). **VACUOUS on Linux** — fails only on Windows/macOS CI (`eba51705`).
- **Schemas are `.strict()` (MCP pass-through); PDF extraction is SERIALIZED (`pdf-text.ts`); Write REFUSES omission placeholders; served-reads dedupe CLEARS on compaction/resume; Bash text has NO pipe advice** — guards: `tool-arg-errors`, `read-pdf`, `native-tools-polish`.
- **Tools DECLARE what they omitted (`bounds`); `defineTool`/`composeNotice` render it** — never hand-written truncation prose; `moreHint` is the tool's own vocabulary — guards: `tool-registry-manifest`/`harness-tool-conformance`, ast-grep `tool-bounds-not-hand-rolled`.
- **Background Bash: `ShellRegistry` (`harness/shell-registry.ts`), HOST-owned per session** — group/tree kill (`SIGTERM`→`SIGKILL` 2 s, `taskkill /T`), foreground too; a time limit HANDS OFF, never kills (except leading `sleep`); stdin closed; cap 5 counts explicit starts; `BashOutput` is doom-loop-exempt, 8 reads/turn — guards: `shell-registry`/`bash-background` tests.

## Web tools (Plan B) — guards: `net-guard`/`web-fetch-tool`/`search-backends`/`search-service` tests
- **WebFetch/WebSearch follow redirects MANUALLY and re-validate every hop** (scheme + literal IP + DNS answer) — the SSRF bypass class. Never `redirect:'follow'`.
- **WebFetch keeps its pre-parse complexity guard (`MAX_TAGS`/`MAX_DEPTH`)** — Readability is synchronous and ~quadratic in DOM depth.
- **WebSearch walks a data-driven backend chain** (tavily → exa → ddg; refreshes from the repo's `search-chain.json`). **DDG `202` = rate-limited, NEVER retried.** IPC backend ids are whitelisted.
- **Search keys are `safeStorage`-encrypted; `search-providers.json` holds only `secretRef`s**; `search:*` has 5-surface parity; `search:test` never throws (guards: `search-key-store`/`ipc-channels`).
- **AskUserQuestion rides the permission-ask rail** — the broker threads `decision.updatedInput`; `formatAnswers` is TOTAL (a throw bricks the session). **A human dismissal ENDS the turn** — guards: `native-permission-broker`/`ask-user-question-tool`.

## Skills & injection (M3) — guards: `skill-catalog`/`skill-tool-gating`/`injection-budget`/`project-instruction-budget`/`path-triggers`/`rule-injection`/`slash-routing` tests
- **Injection is MESSAGES, never a prompt edit** (`prompt-assembly.ts` stays byte-stable) — a prompt change discards the KV cache prefix.
- **Injected content is bounded by the profile; truncation announces itself** (budgets from the REAL window; unmeasured = small).
- **The ROOT project-instruction file is OUTLINED to fit (`fitProjectInstructions`), never tail-cut** — every heading survives; the notice states what happened; **sizing is fixed at session start — `setBinding` does NOT re-apply it.**
- **`Skill` is CONDITIONAL and absent from `NATIVE_TOOL_NAMES`** — attached only when the profile affords its catalog; re-synced on `setBinding`; `/skill-name` works on every model.
- **A rule with no `paths:` is SKIPPED, never global** — eager rules ride every turn.
- **`native:*` four-surface parity is pinned** (`ipc-channels.test.ts` → "native:* channel parity").

## MCP (M3) — guards: the seven `mcp-*.test.ts` suites
- **MCP secret plaintext NEVER enters `~/.youcoded/mcp.json`** — `secretRef` only; plaintext in `SecretsStore`.
- **Attachment is WHOLE-SERVER, in registry order, dropping from the END** — no partial tool sets.
- **Grants are PER-TOOL (`mcp__{server}__{tool}`), not per-server** — a server update can add a destructive tool (no revocation UI until M5).
- **`stderr: 'pipe'` on the stdio transport is LOAD-BEARING** — `'inherit'` hides a failing server's only explanation.
- **A server's own `readOnlyHint`/`destructiveHint` are IGNORED.**
- **Projection into `~/.claude.json` NEVER overwrites an unowned entry** — ownership is the TOP-LEVEL `_youcodedOwnedMcpServers: string[]`; colliding unowned ids are SKIPPED into `skippedCollisions`.
