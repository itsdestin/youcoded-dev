# Multi-Model Support — Design (OpenCode-as-Provider MVP)

**Date:** 2026-05-04
**Status:** Design — pending implementation plan

## Problem

YouCoded today is structurally a Claude Code wrapper. The chat reducer, transcript watcher, hook system, skill router, MCP integration, attention classifier, and permission flow are all coupled to Claude Code's specific CLI surface and JSONL transcript format. A `SessionProvider` seam exists at session-spawn (`'claude' | 'gemini'`), but it only goes one level deep — non-Claude sessions are second-class today (terminal-only, no chat view, no skills, no hooks).

We want users to be able to choose a local model (Qwen 3 via Ollama) as a first-class session type alongside Claude — same chat UI, same conversation experience — without weakening Claude's place as the headline runtime.

## The choice: leverage OpenCode instead of building a parallel agent

The strategic question is *where the agent loop lives*. There are two viable paths:

1. **Embed an existing agent CLI as the runtime backend** — spawn a mature open-source agent that already has tools, skills, MCP, permissions, and multi-provider model support. Treat it like we treat Claude Code today: external process producing structured output we translate into our chat UI.
2. **Build our own in-process agent layer** — use a library like Vercel AI SDK to build the agent loop, tool definitions, prompts, etc. inside YouCoded.

Both paths satisfy "let users use non-Claude models in YouCoded." Path 1 ships in weeks and gives users full agentic capability immediately. Path 2 ships chat-only in weeks and takes months to reach feature parity, but YouCoded owns the agent.

**This MVP picks Path 1, with [OpenCode](https://opencode.ai) as the embedded backend.** Rationale:
- The user explicitly prioritized leveraging existing software over building from scratch.
- OpenCode supports 75+ model providers including Ollama, runs locally, and is MIT-licensed.
- Architecturally, OpenCode integrates *more cleanly* than Claude Code does today: it ships a built-in HTTP+SSE server (`opencode serve`) and an official JS SDK (`@opencode-ai/sdk`), so we drive it programmatically over HTTP/SSE rather than parsing a TUI.
- OpenCode's `Part`-based event model (TextPart, ReasoningPart, ToolPart with state machine, FilePart, etc.) maps almost 1:1 onto our existing `TRANSCRIPT_*` reducer actions — the chat view requires zero changes.

Path 2 (Vercel AI SDK harness) is preserved as a roadmap option in `docs/superpowers/plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md`. It remains useful if/when YouCoded wants a first-party agent for differentiation reasons or for environments where running an external binary is undesirable.

## Goals

- Add a third provider, `'local'`, backed by OpenCode running headlessly against Ollama
- First-run UX that auto-installs Ollama, pulls Qwen 3 8B, installs OpenCode, and writes OpenCode's config file to point at Ollama — all without the user editing JSON
- Local sessions render in the existing chat view — same bubbles, streaming, markdown, tool cards
- Tool calls display via the existing ToolCard UI (translation from OpenCode's `ToolPart`)
- Conversation persistence + resume — handled by OpenCode's own SQLite storage; we read it via OpenCode's REST API
- LM Studio supported for users who already have it (alternative endpoint URL in OpenCode config)
- Architecture additive for adding more providers later (other agent CLIs as their own provider; Vercel AI SDK harness as an alternative path)

## Non-goals (MVP)

- No native YouCoded tool definitions — OpenCode owns the tool layer
- No native YouCoded permission UI integration — OpenCode's prompt mechanism for now (can be improved post-MVP)
- No skills / MCP integration UI — OpenCode supports both internally; surfacing them in YouCoded's settings/picker is post-MVP
- No statusline integration for local sessions
- No terminal pane on local sessions (chat-only — view-mode toggle hidden when `provider === 'local'`). OpenCode runs headlessly in the background; if a power-user terminal view is wanted later, `opencode attach <port>` could be exposed.
- No attention classifier on local sessions (no PTY to read; classifier explicitly gated on `provider === 'claude'`)
- No Android. Local runtime option is hidden in the Runtime selector on Android and remote-browser surfaces using the existing `isAndroid()`/`isRemoteMode()` platform detection. Android support requires investigating OpenCode binary distribution for Termux + reachable Ollama.
- No multimodal / image input
- No remote endpoints (OpenRouter, Together, Groq) — possible via OpenCode's provider config but defers settings UX for keys
- **No mid-session provider switching, ever.** Switching from Claude to Local mid-conversation would require killing the CC process, format-converting message history, and restarting in a new runtime. Bad UX, bad reliability, dubious value. Spelled out as a permanent non-goal.

## Approach

**OpenCode runs as a single background daemon.** YouCoded's main process launches `opencode serve --port <free>` once at app startup (or lazily on first local-session creation), waits for ready, and keeps it alive for the app's lifetime. All local sessions share that one daemon — they're separate sessions inside OpenCode, multiplexed over HTTP.

**Per-session adapter translates events.** A new `OpenCodeSessionAdapter` per local session subscribes to OpenCode's SSE stream, filters events for that session ID, and emits `transcript-event` messages in the exact shape `TranscriptWatcher` emits for Claude sessions. The chat reducer doesn't know which source produced an event.

**No PTY for local sessions.** Unlike Claude/Gemini paths, local sessions don't spawn a per-session child process. The renderer never sees a terminal for them — the runtime is the shared OpenCode daemon. View-mode toggle is hidden in the header.

**OpenCode owns persistence.** OpenCode writes session/message data to its own SQLite database (Drizzle ORM, WAL mode, ~`~/.local/share/opencode/opencode.db` on Linux, equivalent on other platforms). YouCoded does not maintain a separate session store for local sessions. Resume queries OpenCode's REST `GET /session` and `GET /session/:id/message`.

Alternatives considered and rejected for MVP:

- **Vercel AI SDK in-process harness** — the original draft of this spec. Higher control, much more code, months to feature parity. Preserved as a roadmap option (see `docs/superpowers/plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md`).
- **OpenCode-as-PTY (like Gemini today)** — would give us terminal-only sessions in ~1 week, but no chat view. Half the value. Worth knowing this is the cheap fallback if HTTP/SSE integration unexpectedly fails during implementation.
- **Embedding Cline / Aider / Continue** — all viable alternatives to OpenCode. OpenCode chosen because of (a) headless server + official SDK (others require more wrapping), (b) explicit local-first design (Cline is VS Code extension, Aider is also CLI but Python), (c) richer event model.

## Architecture

### Provider type extension

```ts
// src/shared/types.ts
export type SessionProvider = 'claude' | 'gemini' | 'local';

export interface SessionInfo {
  // ... existing fields
  provider: SessionProvider;
  model?: string;             // for 'local', the model ID OpenCode will use (e.g. 'ollama/qwen3:8b')
  endpoint?: string;          // for 'local', OpenCode's HTTP server URL (e.g. http://127.0.0.1:53217), assigned at daemon startup
}
```

### OpenCodeService — daemon lifecycle

A new singleton in `src/main/opencode-service.ts`:

```ts
class OpenCodeService {
  start(): Promise<void>           // spawn `opencode serve` on a free port; await /event SSE handshake
  stop(): Promise<void>            // kill child process
  isRunning(): boolean
  baseUrl(): string                // e.g. http://127.0.0.1:53217
  sdk(): OpenCodeClient            // memoized @opencode-ai/sdk client
  
  // Session-level convenience methods (thin wrappers over the SDK):
  createSession(opts: { systemPrompt?: string }): Promise<{ id: string }>
  sendMessage(sessionId: string, text: string): Promise<void>
  cancelSession(sessionId: string): Promise<void>
  destroySession(sessionId: string): Promise<void>
  listSessions(): Promise<Array<{ id: string; title: string; updatedAt: number; ... }>>
}
```

Lifecycle: started on app launch (after first-run setup completes — see Persistence/First-Run sections). One process for the lifetime of the app. Crash recovery: if the child exits unexpectedly, `OpenCodeService` restarts it; in-flight session adapters surface a `turn-complete` with `stopReason: 'error'` so the chat view doesn't hang.

Port allocation: `OpenCodeService` finds a free port at startup (Node's `net.createServer().listen(0)` then read `address().port`). Stored in `OpenCodeService.baseUrl()` for adapters and IPC handlers to read.

### OpenCodeSessionAdapter — per-session event translator

A new file `src/main/opencode-session-adapter.ts`:

```ts
class OpenCodeSessionAdapter extends EventEmitter {
  // Subscribes to the OpenCode SSE event stream, filters for opts.sessionId,
  // translates each Part type into a transcript-event in the same shape
  // TranscriptWatcher emits.
  constructor(opts: { sessionId: string; service: OpenCodeService });
  destroy(): void;
}
```

Event mapping (illustrative — exact field names verified during implementation against `@opencode-ai/sdk` types):

| OpenCode event/Part | YouCoded transcript-event |
|---|---|
| `message.updated` (UserMessage) | `{ type: 'user-message', sessionId, data: { text, timestamp, uuid } }` |
| `part.delta` (TextPart) | `{ type: 'assistant-text', sessionId, data: { text, timestamp, uuid } }` |
| `part.delta` (ReasoningPart) | `{ type: 'assistant-thinking', sessionId, data: { text, ... } }` (uses existing thinking-heartbeat shape) |
| `ToolPart` (state: pending) | `{ type: 'tool-use', sessionId, data: { toolName, toolInput, toolUseId } }` |
| `ToolPart` (state: completed) | `{ type: 'tool-result', sessionId, data: { toolUseId, result, isError } }` |
| `StepFinishPart` / `message.completed` | `{ type: 'turn-complete', sessionId, data: { stopReason, model, usage } }` |

The chat reducer dispatches the existing `TRANSCRIPT_USER_MESSAGE` / `TRANSCRIPT_ASSISTANT_TEXT` / `TRANSCRIPT_THINKING_HEARTBEAT` / `TRANSCRIPT_TOOL_USE` / `TRANSCRIPT_TOOL_RESULT` / `TRANSCRIPT_TURN_COMPLETE` actions — no reducer changes.

### SessionManager delegation

`SessionManager.createSession()` branches on `provider`:

- `'claude'` / `'gemini'` → existing PTY worker path, unchanged
- `'local'` → asks `OpenCodeService.createSession(...)` for a session ID, constructs an `OpenCodeSessionAdapter` for that ID, wires its events through the existing `transcript-event` pipeline. Resume passes an existing OpenCode session ID instead of creating new.

`SessionManager.sendInput()` for local sessions:
- Plain text → `OpenCodeService.sendMessage(sessionId, text)`
- Single-byte ESC (`\x1b`) → `OpenCodeService.cancelSession(sessionId)` (interrupt the in-flight turn)

`SessionManager.destroySession()` for local sessions: tears down the adapter, calls `OpenCodeService.destroySession(sessionId)`, removes from registry. Does NOT stop the OpenCode daemon — it stays up for other sessions.

## UI integration

### Provider chosen at session creation

The runtime picker lives in the existing new-session form (the "+" expansion in `SessionStrip.tsx`). The current `isGemini: boolean` toggle generalizes into a small **Runtime** segmented control at the top of the form:

```
Runtime:  [● Claude]  [○ Local]  [○ Gemini]
Folder:   [folder picker]
Model:    [list updates based on runtime]
Skip Permissions: [toggle, grayed out for non-Claude]
[Create]
```

Selecting **Local** swaps the Model dropdown to the user's installed Ollama models (queried live via Ollama's `/api/tags` HTTP endpoint, since YouCoded knows the Ollama URL from its first-run setup; OpenCode is configured to use those models). If no models are installed, the form shows "Install Qwen 3 8B →" inline, kicking off the first-run flow.

Local is hidden on Android and remote-browser via existing `isAndroid()`/`isRemoteMode()` platform detection plus a `window.claude.local.supported` capability flag.

### Mid-session model picker — within-runtime swaps only

The existing `ModelPickerPopup.tsx` continues to handle mid-session model changes:

- Claude session → Claude variants (current behavior, unchanged)
- Local session → installed Ollama models. We notify OpenCode of the swap (likely via creating a follow-up message that names the model in OpenCode's config, or via OpenCode's session-update REST endpoint — implementation detail to verify against the SDK).
- Gemini session → unchanged

Stretch: locking the model at creation time is acceptable for MVP if mid-session swap proves complicated.

### First-run for local mode

Three-stage setup, all driven by extending `prerequisite-installer.ts`:

1. **Ollama.** Detect; if missing, prompt: *"Local mode needs Ollama (~300 MB). Install now? [Install] [Skip]"*. Install via `https://ollama.com/install.{ps1,sh}` bootstrap (Linux/macOS) or `OllamaSetup.exe` silent install (Windows). Wait for daemon ready.
2. **Model.** Detect installed models via Ollama's `/api/tags`. If none, prompt: *"Download Qwen 3 8B (~5 GB)? [Download] [Choose different model] [Skip]"*. Stream pull progress via Ollama's `/api/pull`.
3. **OpenCode.** Detect binary; if missing, install via `https://opencode.ai/install` bootstrap script (Linux/macOS) or fetch the appropriate Windows binary from GitHub Releases. Then write `~/.config/opencode/opencode.json` to declare a custom Ollama provider (npm: `@ai-sdk/openai-compatible`, baseURL: `http://localhost:11434/v1`) and a placeholder `auth.json` so OpenCode considers it configured.

Progress for all three shown in the existing `SetupScreen` UI.

LM Studio is detected (via its default port `1234`) and offered as an alternative endpoint in settings, but never auto-installed — when configured, YouCoded writes a different baseURL into OpenCode's config.

### Per-session UI differences for `provider === 'local'`

- View-mode toggle (chat ↔ terminal) hidden in HeaderBar — local sessions are chat-only
- Permission-mode badge hidden — OpenCode owns the permission concept; we don't surface it in MVP
- Status pill shows the model name (`qwen3:8b`)
- Stop button visible mid-stream, routes to `OpenCodeService.cancelSession()`
- Attention banner inert (no PTY classifier) — `attentionState` stays `'ok'`

### Settings panel additions

New "Local Models" section in the existing settings panel:

- Ollama endpoint URL (defaults to `http://localhost:11434`)
- Default model (dropdown of installed Ollama models)
- "Manage Ollama models →" button (deep links to `ollama list` workflow)
- (Future) OpenCode advanced config: link to `~/.config/opencode/opencode.json` for power users

Endpoint changes trigger a rewrite of OpenCode's config file and a restart of the OpenCode daemon. (Or a SIGHUP if OpenCode supports config reload — verify in implementation.)

## Persistence

OpenCode owns persistence. YouCoded does NOT maintain a parallel session store for local sessions.

- **Storage location:** OpenCode's SQLite at platform-specific path (e.g. `~/.local/share/opencode/opencode.db` on Linux), Drizzle ORM, WAL mode (concurrent reads supported).
- **Session list (for ResumeBrowser):** YouCoded calls OpenCode's REST `GET /session`. Returns array of session metadata (id, title, timestamps, etc.). Cached in renderer for the duration of the picker.
- **Message history (for resume):** OpenCode replays the session's messages over SSE when we re-attach to a session. We translate each historical Part to a transcript-event the same way we translate live events. Chat reducer hydrates from empty.
- **No write-side concerns:** OpenCode is the only writer. No atomic-write logic, no .tmp file dance, no concurrent-write conflicts to manage.
- **Auto-titling:** OpenCode handles it. We display its title in the session strip.

## Roadmap

Each item is a separate spec/plan; this section sketches what comes after MVP.

| Stage | Adds | Approx. effort |
|---|---|---|
| **B** | Permission flow integration — surface OpenCode's permission requests in our existing `PERMISSION_REQUEST` UI instead of OpenCode's default mechanism | ~1–2 weeks |
| **C** | Skills / MCP UI integration — let users browse and toggle OpenCode's skills/MCP servers from YouCoded's settings | ~2–3 weeks |
| **D** | Android support — investigate OpenCode binary on Termux, or a "remote OpenCode on a PC, Android client connects" pattern | Investigation + 4+ weeks |
| **E (Alternative)** | Vercel AI SDK in-process harness — preserved at `docs/superpowers/plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md`. Builds a first-party agent layer using `@ai-sdk/openai`. Sense-makes if YouCoded later wants a fully native local-mode experience independent of OpenCode, or for environments where running an external CLI is undesirable. | ~6+ weeks for a tools-capable harness |

## Risks and open questions

- **Repo fork situation.** Two OpenCode repos exist as of this writing — `sst/opencode` (original) and `anomalyco/opencode` (recent split). Need to pick a canonical source to bundle from before MVP ships. Doesn't block design.
- **SDK + schema verification.** Research confirmed event types and SQLite/Drizzle storage from docs and DeepWiki, but the actual SDK type definitions and DB DDL haven't been read line-by-line yet. Implementation Task 1 verifies these against `@opencode-ai/sdk` package types.
- **OpenCode lifecycle management.** Running `opencode serve` as a long-lived child process means YouCoded's main owns: spawn, wait-for-ready, port allocation, crash detection, restart, graceful shutdown on app quit. More state than the per-session PTY model. Mitigated by: well-understood subprocess management patterns in `src/main/`, OpenCode is itself a stable daemon.
- **OpenCode API stability.** Active project, latest release dated today (2026-05-04). Some risk of breaking changes between releases. Mitigation: pin to a specific OpenCode version when bundling, treat OpenCode upgrades as a release-time decision (similar to how Anthropic's Claude Code upgrades are tracked in `cc-dependencies.md`). Add an `oc-dependencies.md` file analogous to `cc-dependencies.md` to document YouCoded's coupling points to OpenCode.
- **Permission UX gap.** MVP doesn't surface OpenCode's permission requests in YouCoded's UI. Users see whatever OpenCode emits as text in the chat (likely an "approve this tool call?" message). This is OK for MVP but feels rough next to Claude's polished permission cards. Stage B fixes this.
- **Mid-session model swap.** Need to verify OpenCode supports model swap via SDK without losing session context, or whether it requires creating a fresh session. Verify during implementation.
- **Concurrent local sessions.** Multiple sessions sharing one OpenCode daemon → OpenCode's responsibility. Documenting expected behavior (queueing? parallel?) needs SDK testing.
- **Stop-mid-stream cleanup.** OpenCode's cancel API behavior: does it persist the partial assistant message? Verify; mirror Claude session interrupt behavior in chat view.
- **Bundling vs separate install.** Bundling the OpenCode binary in YouCoded's installer adds ~30 MB but eliminates a setup step. Auto-downloading at first-run keeps installer small. MVP recommendation: auto-download on first-run, bundle later if first-run friction is reported.
- **Disk usage of two installations.** Users with both Claude Code AND OpenCode have ~600 MB of overlapping CLI tooling installed. Acceptable; document in onboarding.

## References

- [OpenCode official site](https://opencode.ai/)
- [OpenCode CLI docs](https://opencode.ai/docs/cli/)
- [OpenCode Server docs (HTTP+SSE+OpenAPI)](https://opencode.ai/docs/server/)
- [OpenCode Providers docs (Ollama setup)](https://opencode.ai/docs/providers/)
- [Storage and Database (DeepWiki)](https://deepwiki.com/sst/opencode/2.9-storage-and-database)
- [Message and Part Structure (DeepWiki)](https://deepwiki.com/sst/opencode/2.2-message-and-prompt-system)
- [Event Bus (DeepWiki)](https://deepwiki.com/sst/opencode/2.8-event-bus-and-sync-architecture)
- [`sst/opencode` (GitHub)](https://github.com/sst/opencode) and [`anomalyco/opencode` (GitHub)](https://github.com/anomalyco/opencode)
- [Ollama × OpenCode integration](https://docs.ollama.com/integrations/opencode)
- Existing YouCoded patterns:
  - `src/main/session-manager.ts` — provider seam
  - `src/main/transcript-watcher.ts` — `transcript-event` shape we mirror
  - `src/renderer/state/chat-reducer.ts` — `TRANSCRIPT_*` actions
  - `src/renderer/components/SessionStrip.tsx` — new-session form (where the runtime picker lives)
  - `src/main/prerequisite-installer.ts` — install pattern Ollama / OpenCode setup follows
- Roadmap alternative: [Vercel AI SDK in-process harness plan](../plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md) — preserved for future consideration
