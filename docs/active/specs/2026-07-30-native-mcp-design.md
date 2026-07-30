---
status: draft
date: 2026-07-30
owner: Destin (decisions) / Claude (spec)
implements: docs/active/plans/2026-07-22-native-runtime-parity-program.md — §4 Milestone M3 item 4 (MCP in native sessions)
---

# MCP in native sessions — design spec

MCP works in Claude Code sessions today and not at all in native ones. This spec closes
that gap by **inverting who owns the configuration**: YouCoded's own registry becomes the
source of truth, and Claude Code receives a projection of it.

**Destin's framing (2026-07-30), which every decision below serves:** *"I want YouCoded to
fully own it, but YouCoded MCPs should apply BOTH in Claude Code AND native sessions… a user
shouldn't really be able to tell whether they're using Claude Code or a native model, and
marketplace MCPs should work with both by default."*

## 1. Where this starts from

Verified against master `14f0fbda` on 2026-07-30.

- **MCP exists in the app, for Claude Code only.** `desktop/src/main/mcp-reconciler.ts` scans
  `~/.claude/plugins/*/mcp-manifest.json` and writes matching servers into `~/.claude.json`'s
  `mcpServers`. Android mirrors it at `app/.../skills/McpReconciler.kt`. The native harness
  reads none of this.
- **The manifest slot is already reserved.** `shared/harness-manifest.ts` declares
  `mcp?: string[]` with the comment *"The MCP pass (M3 item 4, its own plan) lands one. Left
  declared rather than deleted so that plan does not have to re-litigate the manifest shape."*
- **No MCP dependency exists.** Nothing matching `modelcontextprotocol` in `desktop/package.json`.
- **The renderer already understands MCP tool names.** `ToolCard.tsx:224` parses
  `mcp__{server}__{action}` into a `Server: Action` label, and `ToolBody.tsx:917` special-cases
  one MCP tool for shell-style rendering.
- **The marketplace already advertises MCP.** `MarketplaceCard.tsx:75` shows an "MCP" badge
  from `mcpServers`/`hasMcpConfig`.

Two facts from the existing harness make large parts of this cheap, and both were checked
rather than assumed:

- `harness-session.ts:1304` validates tool arguments with `tool.inputSchema.safeParse(...)` —
  zod. MCP publishes JSON Schema. §4 resolves the mismatch.
- `subject-glob.ts:6` — `subjectMatches` returns `true` when `pattern === undefined`. A tool
  whose `permissionSubject()` returns `undefined` therefore gets a **tool-wide grant**, which
  is already the documented behavior for `TodoWrite`. Per-tool MCP grants need no new
  permission code (§5).

## 2. Decisions taken

| # | Question | Decision | Who |
|---|---|---|---|
| 1 | Config source | YouCoded owns the registry; Claude Code receives a projection | Destin |
| 2 | Adopting a CC-configured server | **Move** — replace CC's entry with a YouCoded-managed one | Destin |
| 3 | Model can't afford all MCP tools | Attach what fits, **and tell the user what was dropped** | Destin |
| 4 | What "Always allow" grants | That one tool, from that one server | Destin |
| 5 | First release scope | Registry + native client; adopt flow and settings UI follow | Destin |
| 6 | Transports | stdio **and** HTTP in phase 1 | Claude (§4) |
| 7 | Partial server attachment | Never — whole server or nothing | Claude (§6) |
| 8 | Drop order under budget pressure | Registry order, from the end | Claude (§6) |
| 9 | Argument validation | Permissive locally; the server is the authority | Claude (§4) |

## 3. Ownership model

```
                    ~/.youcoded/mcp.json   ← marketplace plugins register here
                     (source of truth)     ← user adds here (phase 2 UI)
                            │              ← adopt writes here
                ┌───────────┴───────────┐
         McpManager                 projection
      (native sessions)         → ~/.claude.json mcpServers
                                    (Claude Code sessions)
```

Today's flow is plugin manifests → `~/.claude.json`. This **inverts** it: plugin manifests
feed the registry, and the registry feeds both runtimes. `mcp-reconciler.ts` keeps its job
(writing `~/.claude.json`) but changes its input.

### 3.1 Registry shape

`~/.youcoded/mcp.json`, written exclusively through `NativeHome.mutateJson` (the locked
read-modify-write; `mutateFileUnderLock` is its internal primitive, not the caller's API):

```jsonc
{
  "schema": 1,
  "servers": [
    {
      "id": "gmail",                    // sanitized [a-z0-9-], unique, used in tool names
      "label": "Gmail",
      "enabled": true,
      "transport": { "type": "stdio", "command": "npx", "args": ["-y", "@x/gmail-mcp"] },
      "envRefs": { "GMAIL_TOKEN": "secretRef:mcp/gmail/GMAIL_TOKEN" },
      "origin": { "kind": "marketplace", "plugin": "google-services" },
      "state": "ready"                  // ready | needs-setup | error
    }
  ]
}
```

`origin.kind` is one of `user` | `marketplace` | `adopted`. Order in `servers[]` is
user-meaningful — it is the drop order under budget pressure (§6).

### 3.2 Secrets never enter the registry

**`~/.youcoded/` is synced.** MCP servers routinely carry API keys in `env` or in HTTP
headers. Those must not be written there, and this is not a style preference — the native
runtime rule states it as an invariant: *"Machine-bound ciphertext must not enter a syncable
home."*

The registry stores only `secretRef` pointers; values go to the `safeStorage`-encrypted
`userData/native-secrets.json` through the existing `SecretsStore`. This is the identical
split already used by `providers.json` (API keys) and `search-providers.json` (search keys).
A registry entry is therefore safe to sync, and a synced entry on a second device resolves to
that device's own secret or reports `needs-setup`.

`SearchKeyStore` (`harness/search/search-key-store.ts`) is the closest existing analogue and
should be read before implementing this — it already solves the structural-interface split
(`NativeHomeLike`/`SecretsLike` with compile-time drift guards), the encrypt-then-store
ordering, and the delete ordering that leaves a harmless dangling pointer rather than an
unreachable ciphertext blob.

### 3.3 Projection into Claude Code

Every enabled registry entry is written into `~/.claude.json`'s `mcpServers` with its secrets
resolved, using the atomic write `mcp-reconciler.ts` already performs.

**The reconciler's current promise changes and must be restated, not quietly dropped.** Its
header says *"Never removes user-added MCP servers."* Adopt (§3.4) deliberately replaces a
user-written entry. The new rule:

> YouCoded manages exactly the entries it owns. An entry it does not own is never modified or
> removed — except by an explicit user adopt action, which converts it into an owned entry.

Owned entries must be identifiable in `~/.claude.json` so a later reconcile can tell "mine,
update it" from "theirs, leave it". Marking mechanism is an implementation detail for the
plan, but it must survive a user hand-editing the file around it.

### 3.4 Adopt

A server configured in `~/.claude.json` that YouCoded does not own is **detected and offered**,
never silently taken. Adopting copies the config into the registry, moves any secret-shaped
values into `SecretsStore`, and replaces the `~/.claude.json` entry with an owned one of the
same name.

Claude Code sees no functional change. YouCoded genuinely owns it afterward — disabling it in
the app turns it off in both runtimes, which is the only reading of "ownership" that means
anything.

**This rewrites a line the user may have written by hand.** The adopt UI must say so plainly
before acting. Phase 2.

## 4. The native client

New directory `desktop/src/main/harness/mcp/`:

| Module | Responsibility |
|---|---|
| `mcp-registry.ts` | Read/write `~/.youcoded/mcp.json`; resolve `secretRef`s |
| `mcp-client.ts` | One server connection: connect, list tools, call tool, close |
| `mcp-manager.ts` | Process-level connection pool — lazy, refcounted, shared across sessions |
| `mcp-tools.ts` | MCP tool → `NativeTool` adapter |

Dependency: the official `@modelcontextprotocol/sdk`. First runtime dep added to this area;
the plan should pin a version and record it in `youcoded/docs/provider-dependencies.md`.

**Connections are process-level, not per-session.** Two native sessions using Gmail share one
subprocess. The manager refcounts and closes a server when its last session releases it, and
`destroyAll()` at app quit tears down the pool.

### 4.1 Transports: stdio and HTTP, both in phase 1

The existing `mcp-manifest.json` shape already declares `type: 'http'` (`mcp-reconciler.ts:30`),
and marketplace cards already show an "MCP" badge for those plugins. Shipping stdio-only would
make a badge **already visible in the UI** untrue for HTTP servers. The extra cost is one
transport construction path, not a second architecture.

### 4.2 The JSON Schema mismatch

MCP tools describe arguments in JSON Schema; `NativeTool.inputSchema` is `z.ZodType`, consumed
in two places with different needs:

- **To the model** (`buildAiTools`, `harness-session.ts:443`): `NativeTool` gains an optional
  raw-schema field, and `buildAiTools` uses the AI SDK's `jsonSchema()` helper when present,
  falling back to `zodSchema()`. The server's schema reaches the model **unmodified**.
- **To the driver** (`safeParse`, `harness-session.ts:1304`): MCP tools carry a permissive
  passthrough schema.

**Why not convert JSON Schema to zod:** the conversion is lossy, and a lossy conversion that
rejects a valid call is a bug we would have invented. The server owns its argument contract
and returns a real error for a bad call — which is strictly better information than ours. The
local schema exists to keep the driver's single validation path intact, not to second-guess
the server.

## 5. Naming and permissions

### 5.1 `mcp__{server}__{tool}`

Matching Claude Code's convention is the stated requirement, but it also **buys the renderer
for free**: `ToolCard.tsx:224` already parses this exact shape into a `Server: Action` label.
Native MCP tool cards render correctly with zero renderer changes.

Collision safety: server ids are sanitized to `[a-z0-9-]` and uniqueness-enforced at registry
write; no native tool name begins with `mcp__` (verified against `NATIVE_TOOL_NAMES` and
`CONDITIONAL_TOOL_NAMES`).

### 5.2 Permissions need no new machinery

- `permissionSubject()` returns `undefined` → tool-wide grant for that one namespaced tool.
  "Always allow `mcp__gmail__search_threads`" grants exactly that; sending mail still prompts.
- `rulesForMode` already opens `ask` and `auto-edit` with `{tool:'*', action:'ask'}`, and MCP
  tools get **no** entry in `alwaysAllowed`. An unknown MCP tool therefore prompts by default.
- `full-auto` allows everything, unchanged.

**Why per-tool and not per-server:** a server update can add a destructive tool under an
existing grant, and there is still no way to revoke a remembered rule until M5 item 3 ships.
The program plan's M5 sequencing note — *"don't widen grants before item 3 exists"* — applies
directly here.

## 6. Budget gating

MCP tool schemas ride the request on **every turn**. Three servers can be 30+ tools, which is
the exact problem `Skill` gating exists to solve.

Gating mirrors `syncSkillTool` (`harness-session.ts:405`): the resolved `CapabilityProfile`
decides how much tool schema the session can carry, and MCP servers are attached until the
budget is spent. Re-evaluated on `setBinding`, so a model swap adds or removes servers the
same way it adds or removes `Skill`.

Two rules fixed here:

- **Whole server or nothing.** A server that can search mail but not send is worse than an
  absent one — the model plans against a capability it then can't complete.
- **Drop from the end of registry order.** Predictable and user-controllable, rather than
  arbitrary or alphabetical.

**Dropped servers are announced to the user.** Silent truncation is already a filed complaint
against rule injection (program plan §4 residue: *"rule truncation is invisible to the user"*).
Repeating it here would be repeating a known mistake.

## 7. Failure handling

All copy follows `docs/error-message-standards.md` — specific and accurate, or general and
non-committal with Report-bug / Diagnose actions. Never a guessed cause.

| Failure | Behavior |
|---|---|
| Server won't start | Surface the **actual** stderr/spawn error. Never "MCP server failed" |
| Server dies mid-session | Tool call returns an honest error result; the turn continues |
| Server hangs | Bounded call timeout; a hung server must not look like a stalled model |
| Needs OAuth / setup | Listed as `needs-setup`, not silently skipped (today's `auto:false` path) |
| Secret missing on this device | `needs-setup` naming the server and the missing key |

The stall interaction deserves care: native sessions already have a prefill/stall watchdog,
and a slow MCP call must not be misreported as a stalled model. This is the same class of bug
`prefillBudgetMs` fixed for slow prefill.

## 8. Phasing

**Phase 1 — registry + native client.** Registry with the secret split, the manager and
client (stdio + HTTP), the tool adapter and naming, permission wiring, profile gating,
projection into `~/.claude.json`. Configured by hand-editing JSON; verified by tests and a
dogfood.

**Phase 1 is developer-operable only and cannot ship to users as-is.** That is the accepted
cost of separating risky client work from UI iteration.

**Phase 2 — adopt + settings surface.** Detection of unowned `~/.claude.json` servers, the
adopt action with its explainer, and a settings surface to add/remove/enable/test servers.
The `search:*` family (list / set-key / remove-key / test, with a settings panel) is the
established shape to follow, including full IPC parity.

## 9. Deferred, with reasons

- **Per-server manual enable/disable for small models** — Destin, 2026-07-30, explicitly
  intended as a followup to decision 3: *"an eventual UI menu to allow users to manually
  enable/disable certain tools/mcps for smaller models."* Phase 2 or later; belongs with the
  settings surface.
- **MCP resources and prompts** — tools only in v1. Resources overlap the artifact/context
  work and prompts overlap the skill/command surfaces; both deserve their own pass.
- **Android** — `SessionService.kt` has no native provider branch at all. M8.
- **`HarnessManifest.mcp?: string[]`** — the per-preset allowlist. The field is consumed in
  this pass only if it costs nothing; otherwise it stays reserved. Note that
  `HarnessManifest.tools` has no consumer either (program plan §4 residue), so a preset field
  that silently does nothing is an established failure mode here, not a hypothetical.

## 10. Testing

| Area | What it pins |
|---|---|
| Registry | Round-trip; secrets never written to `~/.youcoded/`; lock-path writes |
| Projection | Owned entries updated; unowned entries never touched; adopt replaces exactly one |
| Adapter | `mcp__server__tool` naming; id sanitizing; collision rejection; raw-schema passthrough |
| Gating | Server dropped when the profile can't afford it; whole-server granularity; drop order |
| Permissions | An MCP tool asks in `ask` mode; "always allow" grants exactly one tool |
| Failure | Real stderr surfaces; dead server doesn't fail the turn; timeout is bounded |
| IPC parity | Any `mcp:*` channel appears in all four surfaces (`ipc-channels.test.ts`) |

**The vacuous-coverage trap applies with force here.** PR #268 produced five tests that proved
nothing about shipping code, three found only by mutation-testing the guards. Every test above
should be mutation-checked: break the code, watch it fail, restore.

## 11. Open questions for the implementation plan

1. **How owned entries are marked in `~/.claude.json`** so reconcile distinguishes mine from
   theirs, in a way that survives hand-editing.
2. **Where the "servers dropped for this model" notice appears** — status bar, session banner,
   or first-turn system notice. Should be decided against the UI Workbench once it merges.
3. ~~**Whether `@modelcontextprotocol/sdk` can be used for transport only.**~~ **RESOLVED
   2026-07-30 — yes.** Checked against `@modelcontextprotocol/sdk@1.30.0` installed and read,
   not from its README. `Client` exposes `connect(transport)` / `listTools()` /
   `callTool({name, arguments})` / `close()` — protocol and transport only, with no agentic
   loop of its own, so it composes with a harness that owns the loop. The
   "client-owns-execution" concern applies to the *AI SDK's* `experimental_createMCPClient`,
   not to this package. Three further facts that change the plan:
   - **It ships a CJS build** (`dist/cjs`, with a `require` condition in its exports map), so
     the CommonJS main process can consume it. This was a genuine potential blocker.
   - **`StdioClientTransport` defaults `stderr: 'inherit'`.** Capturing the real spawn error
     (§7's "surface the actual stderr, never a guessed cause") requires explicitly passing
     `stderr: 'pipe'` and reading the exposed stream. The default silently routes it to the
     app's own stderr where no error message can reach.
   - **MCP tools may carry `annotations.readOnlyHint` / `destructiveHint`.** These come from
     the SERVER and are therefore untrusted: they may inform UI copy, but must never widen a
     grant or skip a prompt. Recorded here so a later reader does not mistake them for a
     safety signal.
