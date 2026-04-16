# GEMINI.md — YouCoded Workspace Guidelines

This file provides foundational mandates for Gemini CLI. Subsystem details live in `docs/` and `.claude/rules/`.

## Project Identity

**YouCoded** is a cross-platform AI assistant app built by a non-developer (Destin) entirely through AI conversation.
**YouCoded** is the toolkit (Claude Code plugin) that supplements the app with personalization features.

## Workspace Layout

| Directory | Repo | What it is |
|-----------|------|------------|
| `youcoded/` | itsdestin/youcoded | **The app** — Desktop (Electron) + Android (Kotlin) |
| `youcoded-core/` | itsdestin/youcoded-core | **The toolkit** — Skills, hooks, commands |
| `wecoded-themes/` | itsdestin/wecoded-themes | Community theme registry |
| `wecoded-marketplace/` | itsdestin/wecoded-marketplace | Skill marketplace registry |

## Core Mandates

1.  **Always sync before working**: `bash setup.sh` pulls the latest from all sub-repos.
2.  **Use worktrees for non-trivial work**: Avoid concurrent sessions overwriting changes.
3.  **Annotate with "WHY" comments**: Destin is a non-developer; explain the rationale for changes.
4.  **No local builds for Destin**: All builds happen in CI. Use scripts for local verification (see `docs/build-and-release.md`).
5.  **Documentation is self-verifying**: Run Documentation Audits when in doubt or after major changes.

## Subsystem Rules (Hard Constraints)

### Android Runtime (`youcoded/app/**`)
- **`LD_LIBRARY_PATH` is mandatory** in `Bootstrap.buildRuntimeEnv()`.
- **All exec routes through `/system/bin/linker64`** for SELinux W^X bypass.
- **`TMPDIR` = `$HOME/.cache/tmpdir`** (NOT `$HOME/tmp`).
- **Do not poll `isRunning`**: Use `sessionFinished: StateFlow<Boolean>` in `PtyBridge`/`DirectShellBridge`.

### IPC Bridge
- **Parity is critical**: `preload.ts` (Desktop) and `LocalBridgeServer.kt` (Android) must stay in sync for message formats.
- **Protocol**: `type` + `id` + `payload` structure.

### Chat Reducer
- **Invariants**: `toolCalls` Map must never be cleared. `activeTurnToolIds` Set tracks in-flight tools.
- **Thinking indicator**: Timeout logic is in the reducer; do not duplicate in renderer.

### Toolkit (`youcoded-core/`)
- **Single Source of Truth**: Update `core/hooks/hooks-manifest.json`, never edit `settings.json` directly.
- **Permissions**: `.sh` files MUST have execute bit set (`git update-index --chmod=+x`).

## Specialized Sub-Agents

Invoke these sub-agents for deep tasks in specific subsystems:

-   **`android-expert`**: Use `codebase_investigator` for `youcoded/app/` with objective "Verify and implement Android runtime logic adhering to `docs/android-runtime.md`."
-   **`ipc-expert`**: Use `codebase_investigator` for `youcoded/desktop/src/preload.ts` and `youcoded/app/src/main/java/**/bridge/`.
-   **`audit-expert`**: Use `generalist` to perform the audit methodology defined in `.claude/commands/audit.md`.

## Auditing Workflow

Gemini CLI can perform documentation audits using the `codebase_investigator` and `generalist` sub-agents.
1.  **Sync**: `bash setup.sh`.
2.  **Identify Scope**: (ipc, chat, android, toolkit, release).
3.  **Audit**: For each scope, use `codebase_investigator` to verify claims in `docs/` against current code.
4.  **Report**: Summarize findings in `docs/AUDIT.md` following the template in `.claude/commands/audit.md`.
5.  **Debts**: Log unresolved drift to `docs/knowledge-debt.md`.

## Subsystem Documentation
- @docs/shared-ui-architecture.md
- @docs/chat-reducer.md
- @docs/android-runtime.md
- @docs/toolkit-structure.md
- @docs/registries.md
- @docs/build-and-release.md
- @docs/PITFALLS.md
