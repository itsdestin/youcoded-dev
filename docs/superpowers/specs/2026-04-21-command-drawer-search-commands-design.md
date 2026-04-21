---
status: draft
created: 2026-04-21
---

# Command Drawer Search — Include Slash Commands

## Summary

Expand the Command Drawer's search results to include slash commands alongside skills. Today the drawer (`youcoded/desktop/src/renderer/components/CommandDrawer.tsx`) only surfaces skills — even though the search bar placeholder says "Search skills and commands…" and a central slash-command dispatcher (`slash-command-dispatcher.ts`) already implements nine commands with native UI. This spec wires those dispatcher-backed commands, every filesystem-discovered user/project/plugin command, and a curated list of Claude Code built-ins into the drawer's search result set.

Commands appear **only when the user types a query**. The browse-mode view (no query) stays skill-only, matching the original product constraint: "these shouldn't be visible when the user isn't searching."

## Goals

- In search mode, any slash command on the user's machine — YouCoded-handled, user-defined, plugin-provided, or CC built-in — appears in the drawer's filtered results matched by name or description.
- Browse mode (empty query) is unchanged: skills, favorites, category chips only.
- Clickable commands execute on click (dispatcher for YouCoded-handled, PTY forward for filesystem-discovered).
- CC built-ins that require a terminal-only TUI panel render as disabled cards with an explanatory note directing the user to Terminal View.
- Works identically on desktop (Electron) and Android (WebView); both consume the same `window.claude.commands.list()` IPC surface.

## Non-Goals

- No dynamic discovery of CC built-ins via `claude -p --output-format=stream-json` subprocess. This was researched and rejected because the `system/init` message omits core meta commands (`/help`, `/model`, `/status`, `/permissions`, etc.) and provides name-only data for the rest. A hardcoded, version-audited list gives us descriptions and consistency that init can't.
- No changes to typed-command behavior. The existing `slash-command-dispatcher.ts` intercept path for commands typed into `InputBar` stays exactly as it is.
- No new favoriting, pinning, or per-command customization. Commands don't participate in favorites today and won't here.
- No new visual section headers (e.g. "Commands" / "Skills"). Search results render as a single flat grid with a `/` prefix to visually distinguish commands.
- No native UIs built for any new commands in this spec. Promoting a CC built-in from unclickable to clickable is an explicit follow-up — move its entry from the built-ins list into the YouCoded-handled list and add a dispatcher case.

## Architecture

### Data model

One new type, added to `youcoded/desktop/src/shared/types.ts`:

```ts
export type CommandEntry = {
  name: string                   // '/compact', '/superpowers:brainstorming'
  description: string
  source: 'youcoded' | 'filesystem' | 'cc-builtin'
  clickable: boolean
  disabledReason?: string        // populated when clickable=false
  aliases?: string[]             // e.g. /clear → ['/reset', '/new']
}
```

`aliases` is flattened at enumeration time: each alias becomes a searchable `CommandEntry` in its own right, sharing the primary entry's description. This keeps the filter loop simple (no alias-aware matching).

### Three sources, merged at IPC time

**Source 1 — YouCoded-handled (hardcoded, nine commands).**
A new module `youcoded/desktop/src/main/youcoded-commands.ts` exports the same roster as the `switch` cases in `slash-command-dispatcher.ts`:

| Primary | Aliases | Description |
|---------|---------|-------------|
| `/compact` | — | Compact conversation with native spinner card |
| `/clear` | `/reset`, `/new` | Clear conversation timeline with native marker |
| `/model` | — | Open native model picker |
| `/fast` | — | Toggle fast mode |
| `/effort` | — | Open effort-level picker |
| `/copy` | — | Copy assistant response to clipboard |
| `/resume` | — | Open native Resume Browser |
| `/config` | `/settings` | Open Preferences popup |
| `/cost` | `/usage` | Show native Usage card |

All `source: 'youcoded'`, `clickable: true`. A comment at the top of the module mirrors the dispatcher's `case` list and points there as the source of behavior.

**Source 2 — Filesystem-scanned (dynamic).**
`youcoded/desktop/src/main/command-scanner.ts` reads `.md` files from:

- `~/.claude/commands/` (user)
- `<session cwd>/.claude/commands/` (project — `cwd` comes from the active session)
- `~/.claude/plugins/marketplaces/*/plugins/*/commands/` (plugin — follows the same plugin subtree `skill-scanner.ts` already walks)

For each file, extract the command name from the filename (stem + `/` prefix; preserve plugin namespace prefix when the file lives under a plugin directory — e.g. `superpowers/commands/brainstorm.md` → `/superpowers:brainstorm`) and the description from YAML frontmatter. Missing frontmatter → description defaults to an empty string (still searchable by name). All `source: 'filesystem'`, `clickable: true`.

Results are cached for the session lifetime, same pattern `skill-provider.ts` uses for `installedCache`. A session-restart invalidates the cache — fine for now; later we can add a watcher if users report stale entries.

**Source 3 — CC built-ins (hardcoded, ~18 commands).**
`youcoded/desktop/src/main/cc-builtin-commands.ts` exports a static list. **Every entry has `clickable: false`** and a `disabledReason: "Please run {name} in Terminal View."` field. Rationale lives at the top of the file:

> Claude Code ships as a compiled binary with no filesystem-discoverable manifest for its built-in commands. Anthropic's SDK init message (`system/init.slash_commands`) omits most core meta commands (`/help`, `/status`, `/permissions`, etc.). Maintaining the list by hand with a `cc-dependencies.md` audit entry is the least-fragile path for this data. When Claude Code adds or removes built-ins, the `review-cc-changes` release agent flags the drift.

Entries:

| Name | Description |
|------|-------------|
| `/help` | Show Claude Code help |
| `/status` | Show session, config, and auth status |
| `/permissions` | Manage tool permissions |
| `/memory` | Edit CLAUDE.md memory files |
| `/agents` | Manage subagents |
| `/mcp` | Manage MCP servers |
| `/plugin` | Manage plugins |
| `/hooks` | Manage hooks |
| `/doctor` | Diagnose the installation |
| `/logout` | Sign out of your Anthropic account |
| `/context` | Show current context-window usage |
| `/review` | Review a pull request |
| `/security-review` | Review pending changes for security issues |
| `/init` | Initialize a CLAUDE.md file |
| `/extra-usage` | Show detailed usage data |
| `/heapdump` | Dump a heap snapshot |
| `/insights` | Show session insights |
| `/team-onboarding` | Team setup flow |

### Dedup at merge time

The IPC handler merges the three sources with this precedence: **`youcoded` > `filesystem` > `cc-builtin`**, deduplicated by primary name. Why: user/plugin `.md` with the same name as a YouCoded-handled entry could exist (some CC-shipped skills overlap), and we want our native UI to win. Additionally, if a skill with the same name already exists in `skillProvider.getInstalled()`, the handler drops the corresponding command entry so `/review`, `/init`, `/security-review`, and similar skill-backed commands aren't double-listed.

### IPC surface

One new handler, matching the existing `skills:list` shape:

- **Message type string:** `commands:list` (identical across `preload.ts`, `ipc-handlers.ts`, and `SessionService.kt` — required per `PITFALLS.md → Cross-Platform`).
- **Desktop:** `ipcMain.handle('commands:list', ...)` returns `CommandEntry[]`.
- **Android:** handler added in `SessionService.handleBridgeMessage()`, responds with `bridgeServer.respond(ws, 'commands:list', id, { entries: [...] })` wrapped per Android's JSONObject convention.
- **Preload:** `window.claude.commands.list()` added to both `preload.ts` and `remote-shim.ts`.
- **Shape normalization:** the shim unwraps Android's `{entries: [...]}` wrapper before returning so React sees `CommandEntry[]` uniformly (matching the existing pattern from `PITFALLS.md`).

### Renderer integration

`src/renderer/state/skill-context.tsx` gains a parallel `drawerCommands: CommandEntry[]` field. Populated by an `await window.claude.commands.list()` call alongside the existing skill fetch, inside the same provider. Memoized.

`CommandDrawer.tsx`:

- **Browse mode:** unchanged. `searchFiltered` still derives from `drawerSkills` only. The `drawerCommands` array is not read.
- **Search mode:** a new `commandSearchFiltered` memo filters `drawerCommands` by the same query logic (`name.includes(q) || description.includes(q)`). The render path concatenates skills + commands in a single grid (skills first, commands second, each internally alphabetized by `name`/`displayName`). `renderDrawerCard` gets a sibling `renderCommandCard(entry)` that:
  - Displays the `/name` in a monospace style (Cascadia/Consolas) as the primary label.
  - Description as secondary.
  - If `clickable`: styled like a skill card, `onClick` invokes a new `onSelectCommand` prop.
  - If `!clickable`: muted opacity, `cursor-not-allowed`, `title={disabledReason}`, no `onClick` wiring.
- The existing "Add Skills +" tile stays as the final grid member in search mode.

A new prop `onSelectCommand: (entry: CommandEntry) => void` on `CommandDrawer`. `App.tsx` wires it to:

- `source === 'youcoded'`: call `dispatchSlashCommand` directly with the entry's name (same input shape InputBar builds — empty files, current session, etc.).
- `source === 'filesystem'`: invoke the existing PTY send path (`session-manager.sendInput` for desktop / equivalent for Android) with `${entry.name}\r`.
- `source === 'cc-builtin'`: should never fire (`clickable: false`), but guard with a no-op for defensive programming.

In both clickable cases the drawer closes on click, matching current skill-selection behavior.

### Keyboard handling

No new keybindings. Existing drawer keyboard behavior (Escape to close, `/` to open search mode from `InputBar`) applies unchanged.

## Cross-platform parity

Three files must stay aligned by message type (see `PITFALLS.md → Cross-Platform`):

| File | Addition |
|------|----------|
| `youcoded/desktop/src/main/preload.ts` | `window.claude.commands.list()` ipcRenderer.invoke |
| `youcoded/desktop/src/main/ipc-handlers.ts` | `ipcMain.handle('commands:list', ...)` |
| `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | `'commands:list'` case in `handleBridgeMessage()` |
| `youcoded/desktop/src/renderer/remote-shim.ts` | `commands.list()` over WebSocket |

Android's filesystem scan uses the same paths as desktop (`~/.claude/` under Android maps to the app's Termux home). One Kotlin helper mirrors the TypeScript enumerator: read frontmatter, preserve plugin prefix.

## CC Coupling

Per `PITFALLS.md → Cross-Platform` and `docs/cc-dependencies.md`, this feature introduces one new CC-coupling:

> **CC built-in command list.** `cc-builtin-commands.ts` encodes the names and descriptions of Claude Code built-in slash commands (`/help`, `/status`, `/permissions`, …). Claude Code releases that add, rename, or remove built-ins will cause drift. The `review-cc-changes` release agent must flag CHANGELOG entries touching slash-command lists and point reviewers at `cc-builtin-commands.ts`.

Add the entry to `youcoded/docs/cc-dependencies.md` before merging.

## Failure modes

- **Filesystem scan fails** (permission error, bad YAML, missing directory): log and continue. Empty `filesystem` source; YouCoded-handled and CC built-ins still appear.
- **CC is uninstalled / not on PATH:** not a concern — we never invoke `claude` for this feature.
- **Project `commands/` directory doesn't exist:** treated as empty source, no error.
- **Two different plugins ship the same command name** (e.g. two plugins both define `brainstorm`): both appear in results, distinguished by their namespace prefix (`/foo:brainstorm`, `/bar:brainstorm`). No collision — namespace is part of the enumerated name.
- **Stale cache after a plugin install:** user opens drawer before the skill-install IPC completes. The existing `installedCache` invalidation on install path in `skill-provider.ts` gets a sibling `commandsCache` reset. `PluginInstaller` already calls the invalidation hook; we add `commandsCache = null` to that path.

## Testing

- Unit: `command-scanner.test.ts` — filesystem enumeration with mocked directories; YAML parsing edge cases (no frontmatter, broken frontmatter, nested plugin paths).
- Unit: `cc-builtin-commands.test.ts` — every entry has the expected shape (`clickable: false`, `disabledReason` present and matches template).
- Unit: merge precedence in `ipc-handlers.ts` — duplicate names resolve `youcoded > filesystem > cc-builtin`; skill-backed commands are dropped.
- Component: `CommandDrawer.test.tsx` — browse mode hides commands; search mode shows commands; disabled commands do not fire `onSelectCommand`.
- Manual: on desktop, open drawer, type `/help` → see disabled card with note; type `/comp` → see clickable `/compact` (YouCoded-handled) and any plugin commands matching. Repeat on Android.

## Open Questions

None blocking implementation. Follow-ups captured as non-goals:

- Whether to build native UIs for any currently-unclickable CC built-ins (`/status`, `/context`, etc.) is a separate product decision — each promotion is a small standalone change.
- Whether commands should participate in favorites is deferred until users ask for it.
