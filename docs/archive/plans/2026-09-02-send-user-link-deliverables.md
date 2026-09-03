---
status: shipped
created: 2026-09-02
revised: 2026-09-02 — SHIPPED complete (PR #381, merge e4bcf98e): desktop, Android, and Claude Code sessions
type: plan
topic: The model can present a link (live web or localhost/IP) as a deliverable, in the same Deliverables card that already handles files.
source: Destin request 2026-09-02 ("the model should be able to present a link (either to live web or localhost/ip) as a deliverable")
---

# SendUserLink — links as deliverables

Shipped in two rounds on one PR (#381, merge `e4bcf98e`): slice A built the
desktop tool and the card; slice B added Android parity, the Claude Code route,
and the fixes from Destin's review of slice A.

## What was built (slice A — desktop)

A new native harness tool **`SendUserLink`**, the link-side mirror of
`SendUserFile` (which the app already uses to present files as a "Deliverables"
card):

```
SendUserLink {
  links:    [{ url, label? }]   // 1+
  caption?: string
  status?:  'normal' | 'proactive'   // parity-accepted, ignored
  display?: 'render' | 'attach'      // parity-accepted, ignored (see below)
}
```

**Validation (stateless, like SendUserFile):** every URL must parse with
`new URL()` **and** have an explicit `http:` or `https:` scheme. This accepts
`http://localhost:5173` and `http://192.168.x.x:8080` (the model's main use
case) and rejects `file:`, `javascript:`, `ftp:`, and scheme-less
`localhost:5173` (unsafe to open). A failing call fails WHOLE and names every
bad URL with its own reason — the shared "url: reason" shape from
docs/error-message-standards.md, never a guessed cause.

**Renderer:** `SendUserLink` calls are pulled out of tool groups exactly like
`SendUserFile` (AssistantTurnBubble → `collectBubbleSentFiles`) and render as
**link tiles** in the same in-bubble `DeliverablesCard`. A link tile is visually
distinct (globe glyph, no artifact thumbnail), shows the model's label over the
full URL — or, with no label, the host over the path, and one clean line when
there is no path — and opens
via `window.claude.shell.openExternal(url)` **only on a user click** — the model
never triggers navigation itself. File and link deliveries merge into ONE card
in call order.

**Open path:** the IPC `OPEN_EXTERNAL` handler was relaxed from `https://`-only
to `^https?:\/\/` (any host), so localhost / LAN dev-server links actually open
in the system browser instead of being silently dropped. The scheme remains the
hard boundary — `file:`, `javascript:` etc. still never open.

**Permissions:** `SendUserLink` is in `alwaysAllowed` (it only *names* URLs;
opening happens at click time through the scheme allowlist), in
`NATIVE_TOOL_NAMES`, in `CORE_TOOLS`, and in the tool-registry-manifest
bounds-exempt list.

**Deliberately NOT in slice A** — the first three were closed by slice B below;
auto-open remains open:

- **Auto-open for links** — STILL OPEN. `deliverable-auto-open.ts` stays
  file-only, and `display` is therefore documented to the model as
  accepted-and-ignored rather than described as a behaviour that does not
  exist. Opening a browser tab uninvited is a bigger interruption than opening
  the in-app panel, and a link has no artifact to reveal; revisit only with
  explicit Destin sign-off on the UX.
- **Android parity** — DONE in slice B.
- **Claude Code sessions** — DONE in slice B (not anticipated in slice A).
- **Right-click "Open link" on link tiles** — STILL OPEN. The context menu's
  `linkMenu` keys on `<a>`, and tiles are `<button data-link-url>`; the primary
  click already works. Worth a small follow-up.
- **Harness evaluator case** — STILL OPEN. A case that verifies a model reaches
  for SendUserLink after spinning up a dev server (offered per the
  harness-evaluator rule; not run in either session).

## Files touched (slice A)

- `desktop/src/main/harness/tools/send-user-link.ts` (new)
- `desktop/src/main/harness/tools/index.ts` (register in CORE_TOOLS)
- `desktop/src/shared/harness-manifest.ts` (NATIVE_TOOL_NAMES)
- `desktop/src/shared/permission-types.ts` (alwaysAllowed)
- `desktop/src/main/ipc-handlers.ts` (OPEN_EXTERNAL allowlist)
- `desktop/src/renderer/components/DeliverablesCard.tsx` (link tile + parsing)
- `desktop/src/renderer/components/AssistantTurnBubble.tsx` (collect + hoist links)
- `desktop/src/renderer/components/tool-views/ToolBody.tsx` (bare-card fallback)
- `desktop/src/renderer/components/ToolCard.tsx` (friendlyToolDisplay case)
- Tests: `send-user-link-tool.test.ts`, `deliverables-link-tile.test.tsx` (new),
  plus updated `permission-engine.test.ts`, `tool-registry-manifest.test.ts`,
  `deliverables-bubble.test.tsx`
- Workbench fixture: `src/renderer/dev/workbench/fixtures/tools/senduserlink.jsonl`

## What was built (slice B — Android, Claude Code, review fixes)

### Claude Code sessions get the same tool

Claude Code ships `SendUserFile` and has **no** link equivalent (verified
against the live tool schema: "the tool sends files, it doesn't fetch URLs").
So the app hands each Claude Code session it launches a one-tool MCP server of
its own — `desktop/src/main/claude-code-mcp.ts` writes the server plus a config
into the app's **own** userData dir and `session-manager.ts` appends
`--mcp-config <file> --allowedTools mcp__youcoded__SendUserLink`.

**Why not the bundled-plugin route** (the one theme-builder and chatsearch
use), which was the obvious first answer:

- A bundled plugin's `mcp-manifest.json` is written into `~/.claude.json` by
  `mcp-reconciler.ts`, whose manifest path is *"additive-only — never
  overwritten, never removed"*. An uninstall or rename would leave a dead
  server pointing at a missing file, in **every** Claude Code on the machine,
  with nothing in the app able to clear it.
- That file is shared with plain terminal `claude`, where the tool would be a
  dead end: the model would call it, be told "Sent 1 link to the user", and no
  card would exist anywhere.
- Bundled plugins are not bundled in the binary — `reconcileBundledPlugins()`
  looks them up in the WeCoded marketplace index and downloads them, so this
  would have meant a public publication and a network dependency at launch.

Command-line flags persist nothing: close the session and it is gone, uninstall
the app and it is gone, and a `claude` run outside YouCoded is untouched.
`--allowedTools` pre-approves exactly this tool (it *adds* to the session
allowlist; it restricts nothing else), so handing the user a link never raises
a permission prompt.

**The renderer matches `mcp__youcoded__SendUserLink` EXACTLY**, never a
`mcp__*__SendUserLink` wildcard: the app installs third-party MCP servers from
the marketplace, and any of them could name a tool `SendUserLink` and otherwise
draw official-looking, one-click-to-the-browser tiles in the user's chat.
`shared/send-user-link.ts` owns both names and the single matcher.

The server itself is hand-rolled newline-delimited JSON-RPC 2.0 with **zero
dependencies** — Claude Code spawns it as a plain node process with no
`node_modules` beside it, on desktop and under Termux alike.

### Android

`ClaudeCodeMcp.kt` + `PtyBridge.kt` deploy the same server (a byte-identical
asset, pinned by `claude-code-mcp-parity.test.ts`) into `.claude-mobile/` and
append the same two flags. The MCP config launches it as
`linker64 <node> <server>`, not bare `node`: SELinux refuses a direct exec of
the embedded binaries from `app_data_file`, which is the same reason PtyBridge
launches Claude Code that way.

`SessionService.kt` also grows a **`shell:open-external`** case firing
`Intent.ACTION_VIEW`, and `remote-shim.ts` routes through it on the Android
host. React runs under `file://` in the WebView, where `window.open` from a
promise callback silently does nothing (the trap the
`sync:restore:browse-url` comment already records) — without this the link tile
would have been a dead button on a phone. Scheme-gated http/https, like
desktop's handler. Three-surface parity is pinned in `ipc-channels.test.ts`.

### Fixes from Destin's review of slice A

- The tool no longer describes a `display: "render"` behaviour nothing
  implements; the parameter is documented as accepted-and-ignored, like
  `status`, and the file header records *why* auto-open is file-only.
- The card walks the calls once, so tiles appear in **call order** — every file
  no longer jumps ahead of every link.
- A tile with no label shows host over path instead of printing the same URL
  twice, and one clean line when there is no path. The full URL stays in the
  tooltip.
- The tile key carries the index, so the same URL sent twice draws twice
  instead of one tile silently vanishing to a duplicate React key.

## Files touched (slice B)

- `desktop/src/shared/send-user-link.ts` (new — both tool names, the matcher,
  the shared description)
- `desktop/src/main/claude-code-mcp.ts` (new — embedded server + deploy)
- `desktop/src/main/session-manager.ts` (the two flags; nodePath hoisted)
- `app/src/main/assets/send-user-link-mcp.js` (new — the server, canonical copy
  mirrored into the desktop module)
- `app/src/main/kotlin/.../runtime/ClaudeCodeMcp.kt` (new)
- `app/src/main/kotlin/.../runtime/PtyBridge.kt` (deploy + flags)
- `app/src/main/kotlin/.../runtime/SessionService.kt` (`shell:open-external`)
- `desktop/src/renderer/remote-shim.ts` (bridge on the Android host)
- `desktop/src/renderer/components/{DeliverablesCard,AssistantTurnBubble,ToolCard}.tsx`,
  `tool-views/ToolBody.tsx` (match both names; the three review fixes)
- `desktop/src/main/harness/tools/send-user-link.ts` (honest `display` copy)
- `youcoded/docs/cc-dependencies.md` (the two CLI flags + the tool-name
  convention as CC touchpoints)
- Tests: `claude-code-link-mcp.test.ts`, `claude-code-mcp-parity.test.ts`,
  `ClaudeCodeMcpTest.kt` (new); updated `session-manager.test.ts`,
  `ipc-channels.test.ts`, `deliverables-link-tile.test.tsx`,
  `deliverables-bubble.test.tsx`
- Workbench fixture: `fixtures/tools/senduserlink-claude-code.jsonl`

## Verification

- `bash scripts/verify.sh send-user-link` → **all checks passed** (tsc, vitest
  related + 33 source-scanning guards, knip, eslint, ast-grep), both rounds.
- `node scripts/workbench-boot-check.mjs` → 15/15 routes mount cleanly (slice A).
- `./gradlew test -x bundleWebUi` → **full Android suite green** (slice B).
- CI on PR #381: Android, macOS, Ubuntu, Windows builds all pass.
- **End to end against the real CLI** (slice B): the MCP server is spawned as a
  node subprocess and spoken to over stdio JSON-RPC by
  `claude-code-link-mcp.test.ts` (handshake, framing, notifications,
  unparseable input, every validation case); and a live
  `claude -p … --mcp-config ./mcp-config.json --allowedTools mcp__youcoded__SendUserLink`
  run loaded the server, called the tool, and returned its exact result text
  with no permission prompt.

**NOT verified on an Android device.** Both Android paths (the linker64
indirection in the MCP config, and the new `Intent.ACTION_VIEW` handler) reuse
mechanisms PtyBridge and SessionService already rely on, and the Kotlin tests
and build pass — but nothing has run on hardware.