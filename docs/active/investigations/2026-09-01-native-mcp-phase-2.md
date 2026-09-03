---
date: 2026-09-01
status: active
type: investigation
topic: Native MCP phase 2 — settings UI, adopt flow, IPC (still unbuilt)
---

# Native MCP phase 2 — settings UI, the adopt flow, and IPC

**Roadmap entry:** `docs/roadmap/native-harness.md` → `## skills-mcp`.
**History:** added 2026-08-05 (deferred by phase 1, which merged as youcoded#280); re-verified
unbuilt 2026-09-01.

## What a user experiences

The app's own agent can use MCP servers, but only if someone hand-writes
`~/.youcoded/mcp.json`. There is no settings screen to add or edit a server, no way to adopt a
server that Claude Code already has in `~/.claude.json`, and no IPC channel the renderer could
call even if a screen existed. A non-technical user cannot use MCP with the native agent at all.

## What is on disk today (verified 2026-09-01)

- **No IPC surface.** `rg -n "mcp:" desktop/src/main/ipc-handlers.ts desktop/src/shared/*.ts
  desktop/src/preload/` returns nothing — there are no `mcp:*` channels.
- **No settings UI.** The only renderer mentions of MCP are the "protected config files" toggle
  (`SettingsPanel.tsx:1433`, which lists `.mcp.json` as a *protected* file), marketplace trust
  badges, and tool-card rendering of `mcp__*` tool names. Nothing lists or edits servers.
- **`McpRegistry.upsert()` still has zero production callers.** The write path exists
  (`youcoded/desktop/src/main/harness/mcp/mcp-registry.ts:241`) but the file's own comment
  still records the phase-1 state: the ONLY way to configure a secret-bearing server is a
  hand-edit, because `upsert()` has no caller.
  <!-- claim: {"path": "youcoded/desktop/src/main/harness/mcp/mcp-registry.ts", "contains": "the ONLY way \\(upsert\\(\\) has no caller\\) to configure"} -->
- **Projection is still one-way.** `mcp-reconciler.ts` projects YouCoded → Claude Code
  (`~/.youcoded/mcp.json` → `~/.claude.json`, ownership tracked in
  `_youcodedOwnedMcpServers`). Nothing reads the other direction, so a marketplace MCP that
  Claude Code can see stays invisible to native sessions.
- **Two code paths for server sources persist.** `mcp-reconciler.ts:17-35` scans plugin
  manifests (`~/.claude/plugins/*/mcp-manifest.json`) itself and separately consumes the
  registry; the plan's "manifest scan moves to feeding the registry" (Task 7 step 4) never
  happened, so plugin-bundled and user-configured servers have two ownership rules.
- Only two commits have touched `desktop/src/main/harness/mcp/` or `mcp-reconciler.ts` since
  2026-08-05 (`3febdfe2` tool-bounds advice, `3a0bd853` lease/teardown) — neither adds UI,
  IPC, or adoption.

## Latent defect that becomes reachable the moment phase 2 ships

`upsert()` (`mcp-registry.ts:269-270`) rebuilds the stored list with
`data.servers.filter((s) => fromStored(s) !== null)`. `fromStored` is the strict read guard
(rejects an empty id or one containing `__`, and drops unknown keys). So the first
`upsert()` of ANY server would permanently DELETE a hand-edited entry whose id is empty or
contains `__` — whereas `remove()` (`:294`) preserves it. Harmless today only because nothing
calls `upsert()`. Whoever builds the settings UI must fix this first (filter with a
lenient predicate, or surface the rejected entries to the user) or the first "Add server"
click silently eats a user's malformed hand-edit.

## Scope of phase 2 (from the 2026-08-05 deferral)

1. Settings screen: list / add / edit / remove servers, secrets entered once and stored via
   `SecretsStore` (never plaintext in `mcp.json` — invariant in `.claude/rules/harness-tools.md`).
2. Adopt flow: import servers already in `~/.claude.json` into the registry.
3. IPC: `mcp:*` channels with the usual multi-surface parity (`ipc-channels.test.ts`).
4. Fold the plugin-manifest scan into the registry so there is one ownership rule.
5. Fix the `upsert()`/`fromStored` deletion above before exposing `upsert()`.

Design context: `docs/archive/specs/2026-07-30-native-mcp-design.md`,
`docs/archive/plans/2026-07-30-native-mcp-phase1.md`.
