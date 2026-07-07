# OpenCode-as-Provider MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `'local'` session provider to YouCoded backed by [OpenCode](https://opencode.ai) running headlessly against Ollama. Local sessions render in the existing chat view (same bubbles, streaming, tool cards) by translating OpenCode's structured events into the same `transcript-event` shape `TranscriptWatcher` produces for Claude.

**Architecture:** A single shared `OpenCodeService` (background daemon, `opencode serve --port <free>`) is launched at app start. Per-session `OpenCodeSessionAdapter` instances subscribe to OpenCode's SSE stream over HTTP via the official `@opencode-ai/sdk` package and translate `Part` events (TextPart, ToolPart, ReasoningPart, StepFinish, etc.) into `transcript-event` messages the chat reducer already understands. No PTY for local sessions. Tools, skills, MCP, and permissions are handled by OpenCode internally.

**Tech Stack:** TypeScript, Node 20+, Electron, `@opencode-ai/sdk` (official OpenCode JS SDK), Vitest, React 18.

**Spec:** `docs/superpowers/specs/2026-05-04-multi-model-harness-design.md`

**Alternative path (deferred):** `docs/superpowers/plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md` — a first-party agent layer using `@ai-sdk/openai`. Not the active MVP.

---

## File Structure

| Path | Purpose | Action |
|------|---------|--------|
| `youcoded/desktop/src/shared/types.ts` | Add `'local'` to `SessionProvider`; add `endpoint?` field; reserve `LOCAL_*` IPC channel constants | Modify |
| `youcoded/desktop/src/main/ollama-detector.ts` | Pure HTTP probe of Ollama (`isReachable`, `listModels`, `pullModel`) | Create |
| `youcoded/desktop/src/main/opencode-service.ts` | Singleton: spawn `opencode serve` on a free port, expose SDK client, manage lifecycle (start/stop/crash-restart) | Create |
| `youcoded/desktop/src/main/opencode-session-adapter.ts` | Per-local-session translator: subscribes to OpenCode SSE, filters by sessionId, emits `transcript-event` in the shape TranscriptWatcher emits | Create |
| `youcoded/desktop/src/main/opencode-config-writer.ts` | Writes `~/.config/opencode/opencode.json` + `auth.json` to point OpenCode at the configured Ollama endpoint | Create |
| `youcoded/desktop/src/main/session-manager.ts` | Branch `provider === 'local'` to `OpenCodeService` + adapter | Modify |
| `youcoded/desktop/src/main/main.ts` (or `ipc-handlers.ts` if that's where the watcher is wired) | Start `OpenCodeService` after first-run setup completes; wire harness `transcript-event` into the same IPC channel TranscriptWatcher feeds | Modify |
| `youcoded/desktop/src/main/preload.ts` | Expose `window.claude.local.*` (listOllamaModels, isOllamaInstalled, installOllama, pullModel, isOpenCodeInstalled, installOpenCode, writeConfig, listSessions, supported) | Modify |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Wire IPC handlers for `local:*` channels + the harness `transcript-event` re-emit | Modify |
| `youcoded/desktop/src/renderer/remote-shim.ts` | Stub `window.claude.local.*` with `supported: false` for Android/remote | Modify |
| `youcoded/desktop/src/main/prerequisite-installer.ts` | Add `installOllama` + `installOpenCode` (mirrors existing `installClaude` pattern) | Modify |
| `youcoded/desktop/src/renderer/components/SessionStrip.tsx` | Replace `isGemini` boolean with three-way Runtime selector (gated by `local.supported`); model dropdown queries Ollama via `local.listOllamaModels`; inline "Install Ollama + Qwen 3 8B →" CTA | Modify |
| `youcoded/desktop/src/renderer/components/HeaderBar.tsx` | Hide chat/terminal toggle and permission-mode badge for `provider === 'local'`; plumb `defaultLocalEndpoint` | Modify |
| `youcoded/desktop/src/renderer/components/ModelPickerPopup.tsx` | Runtime-scoped model list — local sessions show installed Ollama models | Modify |
| `youcoded/desktop/src/renderer/hooks/useAttentionClassifier.ts` | Accept `provider?` option; short-circuit when not `'claude'` | Modify |
| `youcoded/desktop/src/renderer/components/ChatView.tsx` | Pass `provider: session?.provider` to `useAttentionClassifier` | Modify |
| `youcoded/desktop/src/renderer/components/SettingsPanel.tsx` | New "Local Models" section: Ollama endpoint URL, default model, link to Ollama management | Modify |
| `youcoded/desktop/src/renderer/App.tsx` | Pass `provider: 'local'`; pass `defaultLocalEndpoint`; route Stop button via existing ESC path (already works for local because SessionManager intercepts ESC) | Modify |
| `youcoded/desktop/src/renderer/components/LocalSetupModal.tsx` | Multi-step modal: install Ollama → pull model → install OpenCode → write config | Create |
| `youcoded/desktop/src/renderer/components/restore/ResumeBrowser.tsx` | "Local" tab queries `window.claude.local.listSessions()` (which calls OpenCode's REST `GET /session`) | Modify |
| `youcoded/docs/oc-dependencies.md` | Coupling registry analog to `cc-dependencies.md` — documents YouCoded's touchpoints to OpenCode for upgrade-time review | Create |
| `youcoded/desktop/tests/ollama-detector.test.ts` | Unit tests with mocked HTTP | Create |
| `youcoded/desktop/tests/opencode-service.test.ts` | Unit tests (mock subprocess + SDK) for daemon lifecycle | Create |
| `youcoded/desktop/tests/opencode-session-adapter.test.ts` | Unit tests for event translation (mocked SDK event stream) | Create |
| `youcoded/desktop/tests/opencode-config-writer.test.ts` | Unit tests for config-file output | Create |
| `youcoded/desktop/tests/session-manager-local.test.ts` | Tests for local branch in SessionManager (createSession, sendInput routing, ESC cancel, destroy) | Create |
| `youcoded/desktop/package.json` | Add `@opencode-ai/sdk` dep | Modify |

The new files are intentionally split: `opencode-service.ts` owns the daemon and is the single seam to the SDK; `opencode-session-adapter.ts` is pure event translation (no subprocess management, no IPC); `opencode-config-writer.ts` is pure file I/O. Each is unit-testable in isolation.

---

## Setup (one-time)

- [ ] **Setup Step 1: Sync the workspace**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin
git pull origin master
```

Expected: clean pull, no conflicts.

- [ ] **Setup Step 2: Create the implementation worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git worktree add ../youcoded.wt/opencode-mvp -b feat/opencode-mvp origin/master
```

Expected: worktree at `C:\Users\desti\youcoded-dev\youcoded.wt\opencode-mvp` on `feat/opencode-mvp` off latest master.

- [ ] **Setup Step 3: Junction `node_modules`**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp/desktop
cmd //c "mklink /J node_modules ..\\..\\..\\youcoded\\desktop\\node_modules"
ls node_modules | head -3
```

Expected: a few package directory names print. **Critical:** before `git worktree remove` later, run `cmd //c "rmdir node_modules"` FIRST — `git worktree remove` follows junctions on Windows and would wipe the main checkout's `node_modules`. (See `docs/PITFALLS.md → Working With Destin`.)

- [ ] **Setup Step 4: Install `@opencode-ai/sdk` in the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp/desktop
npm install @opencode-ai/sdk
```

Run from inside the worktree (not the main checkout) so `package.json` and `package-lock.json` land on the feature branch and `node_modules` (junctioned) gets the new package.

Verify the diff is in the worktree, not master:

```bash
git -C /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp status --short
git -C /c/Users/desti/youcoded-dev/youcoded status --short
```

Expected: worktree shows `M desktop/package.json` and `M desktop/package-lock.json`; main checkout shows nothing new.

- [ ] **Setup Step 5: SDK + config-schema spike (BLOCKING — do not proceed past this without it)**

Tasks 4–6 hard-code SDK method names and config-file shapes that come from research summaries, not from reading the actual package or running `opencode init`. Pin the real names AND config shape before writing any test or production code that depends on them.

Create a throwaway spike file `youcoded/desktop/scratch/opencode-spike.ts` (`scratch/` is gitignored — add to `.gitignore` if not already):

```ts
// Throwaway: prove out OpenCode's surface so the plan's tests reference real names.
// Run with: npx ts-node scratch/opencode-spike.ts (or the project's preferred way).

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

async function main() {
  // 1. Capture the SDK's actual exports + types
  const sdk = await import('@opencode-ai/sdk');
  console.log('=== @opencode-ai/sdk exports ===');
  console.log(Object.keys(sdk));

  // Print the .d.ts so we can copy real names into the plan
  const dtsPath = require.resolve('@opencode-ai/sdk').replace(/\.js$/, '.d.ts');
  console.log('\n=== .d.ts contents ===');
  console.log(fs.readFileSync(dtsPath, 'utf8'));

  // 2. Capture an opencode-generated config for ground truth
  // Requires opencode binary installed — skip this section if not yet.
  try {
    const tmpHome = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oc-init-'));
    const proc = spawn('opencode', ['init'], { env: { ...process.env, HOME: tmpHome }, stdio: 'inherit' });
    await new Promise((r) => proc.on('exit', r));
    const cfgPath = path.join(tmpHome, '.config', 'opencode', 'opencode.json');
    if (fs.existsSync(cfgPath)) {
      console.log('\n=== opencode init -generated opencode.json ===');
      console.log(fs.readFileSync(cfgPath, 'utf8'));
    }
    const authPath = path.join(tmpHome, '.config', 'opencode', 'auth.json');
    if (fs.existsSync(authPath)) {
      console.log('\n=== opencode init -generated auth.json ===');
      console.log(fs.readFileSync(authPath, 'utf8'));
    }
    await fs.promises.rm(tmpHome, { recursive: true, force: true });
  } catch (e) {
    console.log('skipping opencode init (binary not yet installed):', e);
  }

  // 3. Drive a real opencode serve and call each SDK method we plan to use
  // (Run this after `opencode` is on PATH and an Ollama config exists.)
  // ... add session.create / session.message.create / session.cancel / session.list /
  //     event.subscribe calls and capture what the actual event payloads look like.
}

main().catch(console.error);
```

Run it. Then update this plan in place to substitute real names everywhere a placeholder name appears in Tasks 3–6:

- Real factory/client name (placeholder: `createOpencodeClient`)
- Real session methods (placeholders: `client.session.create`, `client.session.message.create`, `client.session.cancel`, `client.session.delete`, `client.session.list`)
- Real event subscription mechanism (placeholder: `client.event.subscribe`)
- Real event payload shapes (placeholders for `properties.info.sessionID`, `properties.parts[]`, `properties.part.type`, etc.)
- Real `opencode.json` shape — especially `provider.<name>.npm`, `provider.<name>.options.baseURL`, AND the **permission policy field** (Task 3 needs this to set allow-all for MVP — see "Critical fixes" addendum below)
- Real `auth.json` shape

**Pin canonical OpenCode repo: `sst/opencode`** (the original; `anomalyco/opencode` is a recent fork with unclear maintenance posture). The `https://opencode.ai/install` script and `https://github.com/sst/opencode/releases/latest/download/...` URLs in Task 8 assume `sst/opencode`. If the spike or smoke test reveals the install scripts have moved, re-evaluate then.

Do not start Task 3, 4, 5, or 6 until the spike has produced concrete answers to all of the above.

- [ ] **Setup Step 6: Commit the dep + create `oc-dependencies.md`**

Create `youcoded/docs/oc-dependencies.md` (analog to the existing `cc-dependencies.md`). Content reflects facts pinned in Setup Step 5:

```markdown
# OpenCode Coupling Registry

YouCoded depends on OpenCode's HTTP+SSE server, SDK, event shape, config-file format, and CLI behavior. This document tracks each touchpoint so the next OpenCode version bump has a clear coupling-impact list.

Format mirrors `cc-dependencies.md`.

## Pinned version

`@opencode-ai/sdk@1.14.35` + matching `opencode` binary on PATH. Bump together with a full coupling re-check (re-run the inspection that produced the "Verified API Surface" section in the OpenCode-MVP plan).

## Touchpoints

- **`opencode serve` CLI flags** — `--port` (default 4096; we override with a free port), `--hostname` (default 127.0.0.1). (`opencode-service.ts`)
- **Readiness probe endpoint** — `GET /global/health` returns `{ healthy: true, version: string }`. `OpenCodeService.start()` polls this until 200. (`opencode-service.ts`)
- **REST endpoints** — `POST /session` (create), `GET /session` (list), `DELETE /session/:id` (delete), `POST /session/:id/message` (sync prompt), `POST /session/:id/prompt_async` (async prompt — what we use), `GET /session/:id/message` (history), `POST /session/:id/abort` (cancel). (`opencode-service.ts`, `opencode-session-adapter.ts`)
- **`@opencode-ai/sdk` exports** — top-level `createOpencodeClient(config)` factory and `OpencodeClient` class. (`opencode-service.ts`)
- **`@opencode-ai/sdk` method paths** — `client.session.create()`, `.list()`, `.delete(id)`, `.abort(id)`, `.promptAsync(id, body)`, `.messages(id)`, plus `client.event.subscribe()` returning an SSE stream. (`opencode-service.ts`, `opencode-session-adapter.ts`)
- **SSE event `type` literals (dotted strings)** — used by the adapter: `message.part.updated` (carries `{ part: Part, delta?: string }` — incremental text chunks live in `delta`), `message.updated` (final message info), `session.idle` (turn-complete signal), `session.error`, `permission.updated` (we allow-all in MVP, so we ignore this). (`opencode-session-adapter.ts`)
- **`Part` discriminated union** — `text`, `reasoning`, `file`, `tool`, `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `retry`, `compaction`, `subtask`. (`opencode-session-adapter.ts`)
- **`ToolPart.state` discriminator** — field is `status` (NOT `type`); values `pending` | `running` | `completed` | `error`. Each variant has different fields: `completed` carries `output: string`, `error` carries `error: string`, both carry `input: {}` and `time: { start, end }`. (`opencode-session-adapter.ts`)
- **`prompt`/`promptAsync` body shape** — `{ parts: Array<TextPartInput | ...>, model?: { providerID, modelID }, agent?, system?, tools?, messageID?, noReply? }`. User text goes via `parts: [{ type: 'text', text }]`. (`opencode-service.ts`, `session-manager.ts`)
- **Config file format** — `~/.config/opencode/opencode.json` (Linux/macOS) / `%APPDATA%\opencode\opencode.json` (Windows). Provider declaration: `{ provider: { ollama: { npm: '@ai-sdk/openai-compatible', name, options: { baseURL: 'http://host:port/v1' }, models: {...} } } }`. Permission allow-all: top-level `"permission": "allow"` (string shorthand) — NOT `permission.default`. (`opencode-config-writer.ts`)
- **`auth.json`** — at `~/.local/share/opencode/auth.json` (Linux), `~/Library/Application Support/opencode/auth.json` (macOS), `%LOCALAPPDATA%\opencode\auth.json` (Windows). For local Ollama (no auth), this file is NOT required. We do not write it. (`opencode-config-writer.ts`)
- **Session storage path (SQLite)** — Linux `~/.local/share/opencode/opencode.db`, macOS `~/Library/Application Support/opencode/opencode.db`, Windows `%LOCALAPPDATA%\opencode\opencode.db`. Currently NOT read directly — we use REST. (No active reader.)
- **Binary distribution** — install bootstrap URL `https://opencode.ai/install` (POSIX bash). Windows installs from a GitHub Releases asset (`opencode-windows-x64.zip` etc. under `sst/opencode`). The SDK strictly requires `opencode` on PATH or a known absolute path — there is no in-process embedded server. (`prerequisite-installer.ts → installOpenCode`)
- **`OPENCODE_CONFIG_CONTENT` env var** — accepts a JSON-stringified config and bypasses file-based config loading. We do NOT use it for MVP (file-based config is more inspectable and editable), but it's a known alternative if file-write friction arises. (No active reader.)
```

Commit:

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp
git add desktop/package.json desktop/package-lock.json docs/oc-dependencies.md
git commit -m "feat(opencode): add @opencode-ai/sdk dep + oc-dependencies coupling registry"
```

---

## Verified API Surface (post-Step-5)

> **Implementer subagents — read this section before writing any test or production code in Tasks 3, 4, 5, or 6.** The illustrative TypeScript in those tasks was written with placeholders. Where the placeholder disagrees with this section, **this section wins**. Update the test fixtures and the production code together.

### SDK exports (`@opencode-ai/sdk@1.14.35`)

- `createOpencodeClient(config)` — factory returning an `OpencodeClient` instance. Plan placeholder name was correct; usable as-is.
- `OpencodeClient` — class form (alternative to factory). Either works.
- `createOpencode({...})` — async factory that ALSO subprocess-spawns `opencode serve` itself via `cross-spawn`, watches stdout for `"opencode server listening on <url>"` (5s timeout), parses URL. **We do NOT use this** — Task 4's `OpenCodeService` manages the subprocess directly with port polling and crash detection, which is more robust than stdout-regex.
- The SDK is a thin REST/SSE client. Strictly requires the `opencode` binary on PATH or absolute path. There is no in-process embedded server.

### SDK method names (corrections to placeholders)

| Plan placeholder | Real name |
|---|---|
| `client.session.message.create(id, { text })` | **`client.session.promptAsync(id, body)`** (returns immediately; events stream via SSE — required for our streaming UI) |
| `client.session.cancel(id)` | **`client.session.abort(id)`** |
| `client.session.message.list(id)` | **`client.session.messages(id)`** — returns `Array<{ info: Message, parts: Part[] }>` (note the `{info, parts}` envelope, NOT a flat array) |
| `client.session.create()` | unchanged |
| `client.session.list()` | unchanged |
| `client.session.delete(id)` | unchanged |
| `client.event.subscribe(handler)` | unchanged — returns an unsubscribe function |

### `promptAsync` body shape

```ts
body?: {
  parts: Array<TextPartInput | FilePartInput | ...>;   // REQUIRED
  model?: { providerID: string; modelID: string };     // e.g., { providerID: 'ollama', modelID: 'qwen3:8b' }
  agent?: string;
  system?: string;
  tools?: Record<string, boolean>;
  messageID?: string;
  noReply?: boolean;
}
```

User text is wrapped: `parts: [{ type: 'text', text: userText }]`.

### Ready probe (Task 4)

`GET /global/health` → `{ healthy: true, version: string }`. The plan placeholder `GET /event` is **wrong** — `/event` is the SSE event stream, not a probe. Poll `/global/health` until 200 or deadline.

### Permission policy (Task 3)

Top-level `permission` field accepts:
- `"allow"` (string shorthand — what we use for MVP) — equivalent to `{ "*": "allow" }`
- `{ "<toolName>": "allow" | "ask" | "deny", ... }` (per-tool object form)

The plan placeholder `permission.default = 'allow'` is **wrong** — it's a top-level `"permission": "allow"` shorthand. Update both the test assertion and the implementation:

```ts
// In opencode.json:
{ "permission": "allow", "provider": { ... } }

// In the writer:
cfg.permission = cfg.permission ?? 'allow';

// In the test:
expect(cfg.permission).toBe('allow');
```

Env-var alternative `OPENCODE_PERMISSION='{"*":"allow"}'` exists but we use the file form for inspectability.

### Event subscription mechanism (Task 5)

```ts
const unsubscribe = client.event.subscribe((ev: { type: string; properties: object }) => {
  // ...
});
```

The handler receives every event for every session — filter by `properties.sessionID || properties.info?.sessionID || properties.part?.sessionID` matching this adapter's `ocSessionId`. Different events nest the session id in different places (see table below).

### SSE event `type` literals

| Event `type` (runtime string) | `properties` shape (top-level keys) |
|---|---|
| `message.updated` | `{ info: Message }` (full Message object including `info.sessionID`) |
| `message.part.updated` | `{ part: Part, delta?: string }` (`delta` = incremental text chunk for streaming Text/Reasoning parts) |
| `message.part.removed` | `{ sessionID, messageID, partID }` |
| `message.removed` | `{ sessionID, messageID }` |
| `session.idle` | `{ sessionID }` — **use this as turn-complete signal** |
| `session.error` | `{ sessionID?, error? }` |
| `session.created` / `session.updated` / `session.deleted` | `{ info: Session }` |
| `permission.updated` | `{ id, sessionID, time, title, metadata }` (we IGNORE in MVP — permission is allow-all) |
| `file.edited`, `todo.updated`, `command.executed`, `lsp.client.diagnostics`, `pty.*`, `tui.*`, `vcs.branch.updated`, `installation.*`, `server.*` | various — not used by adapter for MVP |

There is **no `part.delta` event** — the plan's Task 5 placeholder `'part.delta'` is wrong. Streaming text deltas arrive on `message.part.updated` with `properties.delta` populated.

### `Part` discriminated union (full)

Discriminator field: `type`. Variants: `text`, `reasoning`, `file`, `tool`, `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `retry`, `compaction`, plus inline `subtask`.

```ts
TextPart       = { type: 'text',        id, sessionID, messageID, text: string, synthetic?, ignored?, time?, metadata? }
ReasoningPart  = { type: 'reasoning',   id, sessionID, messageID, text: string, time, metadata? }
ToolPart       = { type: 'tool',        id, sessionID, messageID, callID: string, tool: string /* tool NAME */, state: ToolState, metadata? }
StepStartPart  = { type: 'step-start',  id, sessionID, messageID, snapshot? }
StepFinishPart = { type: 'step-finish', id, sessionID, messageID, reason: string, snapshot?, cost: number, tokens: TokenUsage }
SnapshotPart   = { type: 'snapshot',    id, sessionID, messageID, snapshot: string }
FilePart       = { type: 'file',        id, sessionID, messageID, mime, filename?, url, source? }
// (plus patch, agent, retry, compaction, subtask — not consumed by MVP adapter)
```

### `ToolPart.state` discriminator (CRITICAL)

The state is itself a discriminated union. Discriminator field is **`status`** (NOT `type`):

```ts
ToolStatePending   = { status: 'pending',   input: {},  raw: string }
ToolStateRunning   = { status: 'running',   input: {},  title?, metadata?, time: { start } }
ToolStateCompleted = { status: 'completed', input: {},  output: string, title, metadata, time: { start, end, compacted? }, attachments?: FilePart[] }
ToolStateError     = { status: 'error',     input: {},  error: string, metadata?, time: { start, end } }
```

The plan placeholder `part.state === 'pending'` (treating `state` as a string) and `part.state === 'failed'` (wrong status literal) are both wrong. Correct usage:

```ts
// Tool input — read from state, not from part.tool
const toolName = part.tool;                 // string
const toolInput = part.state.input;          // object
const toolUseId = part.id;                   // or part.callID
const status = part.state.status;            // 'pending' | 'running' | 'completed' | 'error'

// On completed:
const result = part.state.output;            // string

// On error:
const errorMsg = part.state.error;           // string

if (status === 'pending' || status === 'running') {
  // emit tool-use
} else if (status === 'completed') {
  // emit tool-result with isError: false
} else if (status === 'error') {
  // emit tool-result with isError: true, result: errorMsg
}
```

### Resume hydration shape (Task 5)

`client.session.messages(ocSessionId)` returns `Array<{ info: Message, parts: Part[] }>`. The plan's Task 5 placeholder treats history items as flat `{ id, role, time, parts }` objects — that's wrong. Real shape nests under `info`:

```ts
const history = await sdk.session.messages(ocSessionId);
for (const item of history) {
  const role = item.info.role;             // 'user' | 'assistant'
  const messageId = item.info.id;
  const time = item.info.time?.created;
  const parts = item.parts;                // Part[]
  // translate each part as you would for a message.updated event
}
```

### Architecture confirmation

- We spawn `opencode serve --port <free>` as our own subprocess (Task 4's `OpenCodeService`). Port polling against `GET /global/health`. Native crash detection via `child.on('exit')`.
- We pass the `opencode` binary's absolute path explicitly — never rely on `PATH` lookup (works on dev, fragile on packaged Electron).
- Config goes to `~/.config/opencode/opencode.json` on POSIX, `%APPDATA%\opencode\opencode.json` on Windows. The `OpenCodeConfigWriter` resolves home via constructor parameter for testability.

---

## Task 1: Provider Type Extension

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`

- [ ] **Step 1: Extend `SessionProvider` and `SessionInfo`**

Open `src/shared/types.ts`. Locate the `SessionProvider` definition (around line 28–29). Replace:

```ts
// Which CLI/runtime backend powers a session — defaults to 'claude'
export type SessionProvider = 'claude' | 'gemini' | 'local';

export interface SessionInfo {
  // ... existing fields unchanged
  provider: SessionProvider;
  /** Model alias for the session (e.g. 'claude-sonnet-4-6' or 'qwen3:8b' for local) */
  model?: string;
  // (Earlier plan revisions added an `endpoint?: string` field on SessionInfo
  //  for "IPC-routing convenience". Dropped in v2 — sendInput reaches the
  //  OpenCodeService via the singleton, not via this field. Kept this comment
  //  so a future reader doesn't re-add it.)
  // ... existing fields unchanged
}
```

- [ ] **Step 2: Add IPC channel constants**

Locate the existing `IPC` constant in the same file. Add:

```ts
export const IPC = {
  // ... existing channels
  // Ollama probes
  LOCAL_LIST_OLLAMA_MODELS: 'local:list-ollama-models',
  LOCAL_IS_OLLAMA_INSTALLED: 'local:is-ollama-installed',
  LOCAL_INSTALL_OLLAMA: 'local:install-ollama',
  LOCAL_INSTALL_OLLAMA_PROGRESS: 'local:install-ollama:progress',
  LOCAL_PULL_MODEL: 'local:pull-model',
  LOCAL_PULL_MODEL_PROGRESS: 'local:pull-model:progress',
  // OpenCode setup
  LOCAL_IS_OPENCODE_INSTALLED: 'local:is-opencode-installed',
  LOCAL_INSTALL_OPENCODE: 'local:install-opencode',
  LOCAL_INSTALL_OPENCODE_PROGRESS: 'local:install-opencode:progress',
  LOCAL_WRITE_OPENCODE_CONFIG: 'local:write-opencode-config',
  // OpenCode session ops
  LOCAL_LIST_SESSIONS: 'local:list-sessions',
};
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp/desktop
npx tsc --noEmit
```

Expected: no errors. If existing exhaustive switch statements on `SessionProvider` complain about `'local'`, add a placeholder `case 'local':` branch.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/shared/types.ts
git commit -m "types(opencode): extend SessionProvider with 'local'; add endpoint field; reserve IPC channels"
```

---

## Task 2: OllamaDetector (TDD)

**Files:**
- Create: `youcoded/desktop/src/main/ollama-detector.ts`
- Test: `youcoded/desktop/tests/ollama-detector.test.ts`

OpenCode talks to Ollama for us, but YouCoded still needs to know what models are installed (for the new-session form's model dropdown), whether Ollama is reachable (to gate the install CTA), and how to trigger model pulls during first-run.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/ollama-detector.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaDetector } from '../src/main/ollama-detector';

describe('OllamaDetector', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let detector: OllamaDetector;

  beforeEach(() => {
    fetchMock = vi.fn();
    detector = new OllamaDetector('http://localhost:11434', fetchMock as any);
  });

  it('isReachable() returns true when /api/version 200s', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ version: '0.5.0' }) });
    expect(await detector.isReachable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/version',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('isReachable() returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await detector.isReachable()).toBe(false);
  });

  it('isReachable() returns false on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await detector.isReachable()).toBe(false);
  });

  it('listModels() returns model names from /api/tags', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        models: [
          { name: 'qwen3:8b', size: 4_900_000_000, modified_at: '2026-05-01T00:00:00Z' },
          { name: 'llama3.2:3b', size: 2_000_000_000, modified_at: '2026-04-15T00:00:00Z' },
        ],
      }),
    });
    expect(await detector.listModels()).toEqual([
      { name: 'qwen3:8b', sizeBytes: 4_900_000_000, modifiedAt: '2026-05-01T00:00:00Z' },
      { name: 'llama3.2:3b', sizeBytes: 2_000_000_000, modifiedAt: '2026-04-15T00:00:00Z' },
    ]);
  });

  it('listModels() returns [] when Ollama is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await detector.listModels()).toEqual([]);
  });

  it('pullModel() streams progress events from NDJSON response body', async () => {
    const chunks = [
      '{"status":"pulling manifest"}\n',
      '{"status":"downloading","completed":1024,"total":4096}\n',
      '{"status":"downloading","completed":4096,"total":4096}\n',
      '{"status":"success"}\n',
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: stream });

    const events: any[] = [];
    await detector.pullModel('qwen3:8b', (ev) => events.push(ev));
    expect(events).toEqual([
      { kind: 'status', status: 'pulling manifest' },
      { kind: 'progress', status: 'downloading', completedBytes: 1024, totalBytes: 4096 },
      { kind: 'progress', status: 'downloading', completedBytes: 4096, totalBytes: 4096 },
      { kind: 'done' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/ollama-detector.test.ts 2>&1 | tail -10
```

Expected: every test fails with `Cannot find module '../src/main/ollama-detector'`.

- [ ] **Step 3: Implement `OllamaDetector`**

Create `youcoded/desktop/src/main/ollama-detector.ts`:

```ts
export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export type PullEvent =
  | { kind: 'status'; status: string }
  | { kind: 'progress'; status: string; completedBytes: number; totalBytes: number }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/** Probes a running Ollama server. Does not install Ollama itself. */
export class OllamaDetector {
  constructor(
    private readonly baseUrl: string = 'http://localhost:11434',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async isReachable(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/version`, { method: 'GET' });
      return res.ok;
    } catch { return false; }
  }

  async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) return [];
      const json = await res.json() as { models?: Array<{ name: string; size: number; modified_at: string }> };
      return (json.models ?? []).map(m => ({ name: m.name, sizeBytes: m.size, modifiedAt: m.modified_at }));
    } catch { return []; }
  }

  async pullModel(name: string, onEvent: (ev: PullEvent) => void): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });
    } catch (e: any) {
      onEvent({ kind: 'error', message: String(e?.message ?? e) });
      return;
    }
    if (!res.ok || !res.body) {
      onEvent({ kind: 'error', message: `pull failed: HTTP ${res.status}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (parsed.error) { onEvent({ kind: 'error', message: parsed.error }); return; }
          if (parsed.status === 'success') { onEvent({ kind: 'done' }); return; }
          if (typeof parsed.completed === 'number' && typeof parsed.total === 'number') {
            onEvent({ kind: 'progress', status: parsed.status ?? 'downloading', completedBytes: parsed.completed, totalBytes: parsed.total });
          } else if (parsed.status) {
            onEvent({ kind: 'status', status: parsed.status });
          }
        } catch { /* skip unparseable lines */ }
      }
    }
    onEvent({ kind: 'done' });
  }
}
```

- [ ] **Step 4: Run tests, verify pass, commit**

```bash
npx vitest run tests/ollama-detector.test.ts 2>&1 | tail -10
```

Expected: 6 passing.

```bash
git add desktop/src/main/ollama-detector.ts desktop/tests/ollama-detector.test.ts
git commit -m "feat(opencode): OllamaDetector — probe Ollama HTTP API + model pulls"
```

---

## Task 3: OpenCodeConfigWriter (TDD)

**Files:**
- Create: `youcoded/desktop/src/main/opencode-config-writer.ts`
- Test: `youcoded/desktop/tests/opencode-config-writer.test.ts`

Writes `~/.config/opencode/opencode.json` declaring the Ollama provider (via `@ai-sdk/openai-compatible`) and setting permission policy to allow-all for MVP. Per Verified API Surface, no `auth.json` is required for local Ollama. Pure file I/O; no network.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/opencode-config-writer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { OpenCodeConfigWriter } from '../src/main/opencode-config-writer';

describe('OpenCodeConfigWriter', () => {
  let tmpHome: string;
  let writer: OpenCodeConfigWriter;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-cfg-'));
    writer = new OpenCodeConfigWriter(tmpHome);
  });

  afterEach(async () => { await fs.rm(tmpHome, { recursive: true, force: true }); });

  it('writeOllamaConfig() creates opencode.json with the Ollama provider declared', async () => {
    await writer.writeOllamaConfig({ ollamaBaseUrl: 'http://localhost:11434' });
    const text = await fs.readFile(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8');
    const cfg = JSON.parse(text);
    expect(cfg.provider).toBeDefined();
    expect(cfg.provider.ollama).toBeDefined();
    expect(cfg.provider.ollama.options.baseURL).toBe('http://localhost:11434/v1');
    expect(cfg.provider.ollama.npm).toBe('@ai-sdk/openai-compatible');
  });

  it('writeOllamaConfig() does NOT write auth.json (Ollama via OpenAI-compat needs no auth)', async () => {
    // Verified API Surface confirms: for local Ollama (no auth), auth.json is
    // not required by OpenCode. Don't write a file users will be confused by.
    await writer.writeOllamaConfig({ ollamaBaseUrl: 'http://localhost:11434' });
    await expect(fs.access(path.join(tmpHome, '.config', 'opencode', 'auth.json'))).rejects.toThrow();
  });

  it('writeOllamaConfig() preserves user-modified fields outside provider/ollama', async () => {
    // Pre-seed an existing config with custom fields
    await fs.mkdir(path.join(tmpHome, '.config', 'opencode'), { recursive: true });
    await fs.writeFile(
      path.join(tmpHome, '.config', 'opencode', 'opencode.json'),
      JSON.stringify({ theme: 'dracula', model: 'somethingelse', custom: 'field' }),
      'utf8',
    );
    await writer.writeOllamaConfig({ ollamaBaseUrl: 'http://localhost:11434' });
    const cfg = JSON.parse(await fs.readFile(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8'));
    expect(cfg.theme).toBe('dracula');
    expect(cfg.custom).toBe('field');
    expect(cfg.provider.ollama).toBeDefined();
  });

  it('writeOllamaConfig() accepts non-default endpoint (e.g. LM Studio)', async () => {
    await writer.writeOllamaConfig({ ollamaBaseUrl: 'http://localhost:1234' });
    const cfg = JSON.parse(await fs.readFile(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8'));
    expect(cfg.provider.ollama.options.baseURL).toBe('http://localhost:1234/v1');
  });

  it('writeOllamaConfig() sets permission policy to allow-all (MVP simplification)', async () => {
    // Without this, OpenCode's permission system would prompt on every tool
    // call and the prompts have no UI listener in MVP — tools would hang.
    // Per "Verified API Surface": top-level "permission": "allow" string
    // shorthand (NOT permission.default).
    await writer.writeOllamaConfig({ ollamaBaseUrl: 'http://localhost:11434' });
    const cfg = JSON.parse(await fs.readFile(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8'));
    expect(cfg.permission).toBe('allow');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run tests/opencode-config-writer.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `OpenCodeConfigWriter`**

Create `youcoded/desktop/src/main/opencode-config-writer.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';

export interface OllamaConfigOpts {
  /** Base URL of Ollama (without trailing /v1). Default: http://localhost:11434 */
  ollamaBaseUrl: string;
}

export class OpenCodeConfigWriter {
  private readonly configDir: string;

  constructor(homeDir: string) {
    this.configDir = path.join(homeDir, '.config', 'opencode');
  }

  /** Declare an Ollama-via-OpenAI-compat provider in opencode.json. No auth.json — Ollama has no API key. */
  async writeOllamaConfig(opts: OllamaConfigOpts): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    const cfgPath = path.join(this.configDir, 'opencode.json');

    // Merge into existing opencode.json if present (preserve user fields)
    let cfg: any = {};
    try {
      cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
    cfg.provider = cfg.provider ?? {};
    cfg.provider.ollama = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Ollama (local)',
      options: {
        baseURL: opts.ollamaBaseUrl.replace(/\/$/, '') + '/v1',
      },
    };
    // MVP simplification: allow all tool calls without per-call user approval.
    // Matches Claude's --dangerously-skip-permissions mode. Stage B integrates
    // OpenCode's permission events into our existing PERMISSION_REQUEST UI.
    // Top-level "permission": "allow" string shorthand (per Verified API Surface).
    cfg.permission = cfg.permission ?? 'allow';
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
    // No auth.json — Ollama via OpenAI-compat has no API key (per Verified API Surface).
  }
}
```

- [ ] **Step 4: Run tests, verify pass, commit**

```bash
npx vitest run tests/opencode-config-writer.test.ts 2>&1 | tail -10
```

Expected: 5 passing.

```bash
git add desktop/src/main/opencode-config-writer.ts desktop/tests/opencode-config-writer.test.ts
git commit -m "feat(opencode): OpenCodeConfigWriter — generate opencode.json for Ollama"
```

---

## Task 4: OpenCodeService — daemon lifecycle (TDD, ready-detection via port polling)

**Files:**
- Create: `youcoded/desktop/src/main/opencode-service.ts`
- Test: `youcoded/desktop/tests/opencode-service.test.ts`

The single seam between YouCoded and OpenCode. Spawns `opencode serve --port <free>`, waits for ready, exposes the SDK client, manages crashes/shutdown.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/opencode-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeService } from '../src/main/opencode-service';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

const mockSpawn = vi.fn();
vi.mock('child_process', async (orig) => ({
  ...(await orig() as any),
  spawn: (...args: any[]) => mockSpawn(...args),
}));

const mockSdkConstructor = vi.fn();
vi.mock('@opencode-ai/sdk', () => ({
  // Verified: @opencode-ai/sdk@1.14.35 exports both createOpencodeClient (factory)
  // and OpencodeClient (class). Either works; we use the factory.
  createOpencodeClient: (opts: any) => mockSdkConstructor(opts),
}));

function makeFakeChild(): ChildProcess {
  const ee = new EventEmitter() as any;
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  ee.kill = vi.fn();
  ee.pid = 12345;
  return ee;
}

describe('OpenCodeService', () => {
  let svc: OpenCodeService;

  beforeEach(() => {
    mockSpawn.mockReset();
    mockSdkConstructor.mockReset();
  });

  afterEach(async () => { await svc?.stop(); });

  // Note: ready-detection is by polling the configured port, not by parsing
  // stdout. This is more robust against OpenCode log-format changes between
  // versions. Tests inject a fake fetch that "becomes reachable" after a
  // controlled delay.

  function makeReachableAfter(delayMs: number): ReturnType<typeof vi.fn> {
    const start = Date.now();
    return vi.fn(async () => {
      if (Date.now() - start < delayMs) {
        throw new Error('ECONNREFUSED');
      }
      return { ok: true, status: 200 } as Response;
    });
  }

  it('start() spawns "opencode serve --port N" and resolves once the port becomes reachable', async () => {
    const fakeChild = makeFakeChild();
    mockSpawn.mockReturnValueOnce(fakeChild);
    const fetchMock = makeReachableAfter(50);

    svc = new OpenCodeService({ binaryPath: '/usr/local/bin/opencode', fetchImpl: fetchMock as any });
    await svc.start();

    expect(svc.isRunning()).toBe(true);
    expect(svc.baseUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/local/bin/opencode',
      expect.arrayContaining(['serve', '--port', expect.any(String)]),
      expect.any(Object),
    );
  });

  it('start() rejects if the port never becomes reachable within the deadline', async () => {
    const fakeChild = makeFakeChild();
    mockSpawn.mockReturnValueOnce(fakeChild);
    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED'); });

    svc = new OpenCodeService({
      binaryPath: '/usr/local/bin/opencode',
      fetchImpl: fetchMock as any,
      readyDeadlineMs: 200,   // short for tests
    });

    await expect(svc.start()).rejects.toThrow(/did not become reachable/);
    expect(svc.isRunning()).toBe(false);
    expect(fakeChild.kill).toHaveBeenCalled();
  });

  it('start() rejects if the child exits before becoming reachable', async () => {
    const fakeChild = makeFakeChild();
    mockSpawn.mockReturnValueOnce(fakeChild);
    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED'); });

    svc = new OpenCodeService({
      binaryPath: '/usr/local/bin/opencode',
      fetchImpl: fetchMock as any,
      readyDeadlineMs: 5000,
    });
    const startP = svc.start();
    setImmediate(() => fakeChild.emit('exit', 1));

    await expect(startP).rejects.toThrow();
    expect(svc.isRunning()).toBe(false);
  });

  it('stop() kills the child process and clears state', async () => {
    const fakeChild = makeFakeChild();
    mockSpawn.mockReturnValueOnce(fakeChild);
    const fetchMock = makeReachableAfter(20);

    svc = new OpenCodeService({ binaryPath: '/usr/local/bin/opencode', fetchImpl: fetchMock as any });
    await svc.start();
    await svc.stop();
    expect(fakeChild.kill).toHaveBeenCalled();
    expect(svc.isRunning()).toBe(false);
  });

  it('emits "crashed" if the child exits unexpectedly while running', async () => {
    const fakeChild = makeFakeChild();
    mockSpawn.mockReturnValueOnce(fakeChild);
    const fetchMock = makeReachableAfter(20);

    svc = new OpenCodeService({ binaryPath: '/usr/local/bin/opencode', fetchImpl: fetchMock as any });
    await svc.start();

    const crashSpy = vi.fn();
    svc.on('crashed', crashSpy);
    fakeChild.emit('exit', 137);
    expect(crashSpy).toHaveBeenCalledWith({ exitCode: 137 });
    expect(svc.isRunning()).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failures**

```bash
npx vitest run tests/opencode-service.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Implement `OpenCodeService`**

Create `youcoded/desktop/src/main/opencode-service.ts`:

```ts
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';

// Verified API Surface: @opencode-ai/sdk@1.14.35 exports createOpencodeClient
// (factory) and OpencodeClient (class). We use the factory.
import { createOpencodeClient } from '@opencode-ai/sdk';

export interface OpenCodeServiceOpts {
  /** Absolute path to the opencode binary, located by ipc-handlers from prerequisite-installer's recorded path. */
  binaryPath: string;
  /** Override for testing — env vars passed through to the child. */
  env?: NodeJS.ProcessEnv;
  /** Override for testing — inject a mock fetch for the readiness probe. */
  fetchImpl?: typeof fetch;
  /** How long to wait for the port to become reachable. Default 15_000 ms. */
  readyDeadlineMs?: number;
  /** Poll interval for the readiness probe. Default 200 ms. */
  readyPollMs?: number;
}

/**
 * Manages a single shared `opencode serve` daemon that all local-mode sessions
 * use. Owns subprocess lifecycle, port allocation, ready-detection, crash
 * detection, graceful shutdown.
 */
export class OpenCodeService extends EventEmitter {
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private host: string = '127.0.0.1';
  private client: any = null;       // typed as the actual SDK return type during impl
  private intentionalShutdown = false;

  constructor(private readonly opts: OpenCodeServiceOpts) {
    super();
  }

  isRunning(): boolean { return !!this.child && this.port !== null; }
  baseUrl(): string {
    if (this.port === null) throw new Error('OpenCodeService not started');
    return `http://${this.host}:${this.port}`;
  }
  sdk(): any {
    if (!this.client) throw new Error('OpenCodeService SDK not initialized');
    return this.client;
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.intentionalShutdown = false;
    const port = await this.allocatePort();
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const readyDeadlineMs = this.opts.readyDeadlineMs ?? 15_000;
    const readyPollMs = this.opts.readyPollMs ?? 200;

    const child = spawn(
      this.opts.binaryPath,
      ['serve', '--port', String(port)],
      {
        env: { ...process.env, ...(this.opts.env ?? {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    this.child = child;
    this.host = '127.0.0.1';

    // Track child exit BEFORE port becomes reachable (start failed) vs AFTER
    // (crash). Used by the polling loop and the long-lived crash handler.
    let exitedDuringStartup = false;
    const startupExitListener = (code: number | null) => {
      exitedDuringStartup = true;
    };
    child.once('exit', startupExitListener);

    // Poll /global/health until reachable or deadline. Per Verified API Surface,
    // GET /global/health returns { healthy: true, version: string } and is the
    // documented liveness probe.
    const baseUrl = `http://${this.host}:${port}`;
    const deadline = Date.now() + readyDeadlineMs;
    while (Date.now() < deadline && !exitedDuringStartup) {
      try {
        const res = await fetchImpl(`${baseUrl}/global/health`, { method: 'GET' });
        if (res.ok) {
          this.port = port;
          this.client = createOpencodeClient({ baseURL: baseUrl });
          // Swap startup exit listener for the long-lived crash handler.
          child.off('exit', startupExitListener);
          child.on('exit', (code) => {
            const wasRunning = this.isRunning();
            this.child = null;
            this.port = null;
            this.client = null;
            if (this.intentionalShutdown) return;
            if (wasRunning) this.emit('crashed', { exitCode: code });
          });
          return;
        }
      } catch { /* not yet reachable, keep polling */ }
      await new Promise((r) => setTimeout(r, readyPollMs));
    }

    // Either the deadline elapsed or the child exited before becoming reachable.
    child.kill();
    this.child = null;
    if (exitedDuringStartup) {
      throw new Error('opencode serve exited before becoming reachable');
    }
    throw new Error(`opencode serve did not become reachable within ${readyDeadlineMs}ms`);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.intentionalShutdown = true;
    this.child.kill();
    // Best-effort wait for exit — non-fatal if it doesn't.
    await new Promise<void>((resolve) => {
      if (!this.child) return resolve();
      this.child.once('exit', () => resolve());
      setTimeout(() => resolve(), 2_000);
    });
    this.child = null;
    this.port = null;
    this.client = null;
  }

  // Session-level convenience wrappers — SDK names per Verified API Surface.
  async createSession(opts: { systemPrompt?: string }): Promise<{ id: string }> {
    return await this.client.session.create(opts);
  }
  /** Streaming send — events arrive via SSE. Use this for chat (we render incrementally). */
  async sendMessage(sessionId: string, text: string, model?: { providerID: string; modelID: string }): Promise<void> {
    await this.client.session.promptAsync(sessionId, {
      parts: [{ type: 'text', text }],
      ...(model ? { model } : {}),
    });
  }
  async cancelSession(sessionId: string): Promise<void> {
    await this.client.session.abort(sessionId);
  }
  async destroySession(sessionId: string): Promise<void> {
    await this.client.session.delete(sessionId);
  }
  async listSessions(): Promise<Array<{ id: string; title: string; updatedAt: number }>> {
    return await this.client.session.list();
  }

  private async allocatePort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        if (typeof addr === 'object' && addr) {
          const port = addr.port;
          srv.close(() => resolve(port));
        } else {
          srv.close(() => reject(new Error('failed to allocate port')));
        }
      });
      srv.on('error', reject);
    });
  }
}
```

- [ ] **Step 4: Run tests, verify pass, commit**

```bash
npx vitest run tests/opencode-service.test.ts 2>&1 | tail -10
```

Expected: 5 passing. The ready-detection path uses `GET /global/health` polling per Verified API Surface — no stdout regex.

```bash
git add desktop/src/main/opencode-service.ts desktop/tests/opencode-service.test.ts
git commit -m "feat(opencode): OpenCodeService — spawn + manage opencode serve daemon"
```

---

## Task 5: OpenCodeSessionAdapter — event translator (TDD)

**Files:**
- Create: `youcoded/desktop/src/main/opencode-session-adapter.ts`
- Test: `youcoded/desktop/tests/opencode-session-adapter.test.ts`

Per local session, subscribes to OpenCode's SSE event stream via the SDK, filters events by `ocSessionId`, and emits `transcript-event` messages tagged with `desktopSessionId` (which may differ from `ocSessionId` for new sessions — see Task 6 for the rationale).

Two non-obvious behaviors:

1. **Skips `user-message` events from OpenCode entirely.** The renderer dispatches `USER_PROMPT` optimistically when the user hits send, and `SessionManager.sendInput` then emits a synthetic `user-message` transcript-event with the *exact text we sent* — guaranteeing the chat reducer's content-match dedup clears the optimistic bubble's `pending` flag. Re-emitting from OpenCode's echo would risk dedup misses if OpenCode normalizes whitespace.
2. **On construction for an existing session, fetches message history via REST first, synthesizes transcript-events for each historical message, THEN subscribes to live SSE.** Defensive against SSE-only-delivers-new-events behavior. A `seenUuids` set prevents duplicates if OpenCode's SSE does happen to replay on subscribe.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/opencode-session-adapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeSessionAdapter } from '../src/main/opencode-session-adapter';
import { EventEmitter } from 'events';

function makeFakeService() {
  const eventBus = new EventEmitter();
  // Per-session message history mock — lets tests pre-seed history so
  // the resume hydration path can be exercised.
  const historyBySession = new Map<string, any[]>();
  return {
    eventBus,
    seedHistory(sessionId: string, messages: any[]) {
      historyBySession.set(sessionId, messages);
    },
    sdk: () => ({
      event: {
        subscribe: (handler: (ev: any) => void) => {
          const fn = (ev: any) => handler(ev);
          eventBus.on('event', fn);
          return () => eventBus.off('event', fn);
        },
      },
      session: {
        // Verified: client.session.messages(id) returns Array<{info: Message, parts: Part[]}>
        messages: async (sessionId: string) => historyBySession.get(sessionId) ?? [],
      },
    }),
  };
}

describe('OpenCodeSessionAdapter', () => {
  let svc: ReturnType<typeof makeFakeService>;
  let adapter: OpenCodeSessionAdapter;
  let emitted: any[];

  beforeEach(async () => {
    svc = makeFakeService();
    adapter = new OpenCodeSessionAdapter({
      ocSessionId: 'OC1',
      desktopSessionId: 'DESK1',   // intentionally different from ocSessionId to prove emit-tag uses desktop id
      service: svc as any,
      isResume: false,
    });
    emitted = [];
    adapter.on('transcript-event', (ev) => emitted.push(ev));
    // Wait for adapter's async constructor work (subscribe, optional history fetch)
    await new Promise((r) => setImmediate(r));
  });

  afterEach(() => adapter.destroy());

  it('SKIPS user-message events from OpenCode (dedup is handled by SessionManager synthetic emit)', () => {
    svc.eventBus.emit('event', {
      type: 'message.updated',
      properties: {
        info: { id: 'M1', sessionID: 'OC1', role: 'user', time: { created: 1714857600000 } },
        parts: [{ type: 'text', text: 'hello' }],
      },
    });
    expect(emitted).toEqual([]);
  });

  it('translates assistant TextPart deltas into "assistant-text" events tagged with desktopSessionId', () => {
    // Verified: streaming text deltas arrive on message.part.updated with `delta` populated.
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        delta: 'hello ',
        part: { type: 'text', id: 'P1', sessionID: 'OC1', messageID: 'M1', text: 'hello ' },
      },
    });
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        delta: 'world',
        part: { type: 'text', id: 'P1', sessionID: 'OC1', messageID: 'M1', text: 'hello world' },
      },
    });
    expect(emitted.map(e => e.type)).toEqual(['assistant-text', 'assistant-text']);
    expect(emitted.map(e => e.data.text)).toEqual(['hello ', 'world']);
    expect(emitted.every(e => e.sessionId === 'DESK1')).toBe(true);   // emit uses desktopSessionId
  });

  it('translates ReasoningPart deltas into "assistant-thinking" tagged with desktopSessionId', () => {
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        delta: 'pondering...',
        part: { type: 'reasoning', id: 'P2', sessionID: 'OC1', messageID: 'M1', text: 'pondering...', time: { start: 1 } },
      },
    });
    expect(emitted[0]).toMatchObject({
      type: 'assistant-thinking',
      sessionId: 'DESK1',
      data: { text: 'pondering...' },
    });
  });

  it('translates ToolPart pending into "tool-use" with input', () => {
    // Verified: ToolPart.state is itself a discriminated union with `status` field;
    // input lives at part.state.input, tool name at part.tool (string).
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          id: 'T1',
          callID: 'call-1',
          sessionID: 'OC1',
          messageID: 'M2',
          tool: 'read_file',
          state: { status: 'pending', input: { path: '/x' }, raw: '' },
        },
      },
    });
    expect(emitted[0]).toMatchObject({
      type: 'tool-use',
      sessionId: 'DESK1',
      data: { toolName: 'read_file', toolInput: { path: '/x' }, toolUseId: 'T1' },
    });
  });

  it('translates ToolPart completed into "tool-result"', () => {
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          id: 'T1',
          callID: 'call-1',
          sessionID: 'OC1',
          messageID: 'M2',
          tool: 'read_file',
          state: {
            status: 'completed',
            input: { path: '/x' },
            output: 'file contents',
            title: 'read_file',
            metadata: {},
            time: { start: 1, end: 2 },
          },
        },
      },
    });
    expect(emitted[0]).toMatchObject({
      type: 'tool-result',
      sessionId: 'DESK1',
      data: { toolUseId: 'T1', result: 'file contents', isError: false },
    });
  });

  it('translates ToolPart error into "tool-result" with isError:true', () => {
    // Verified: error status literal is 'error' (not 'failed').
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          id: 'T2',
          callID: 'call-2',
          sessionID: 'OC1',
          messageID: 'M2',
          tool: 'bash',
          state: { status: 'error', input: {}, error: 'permission denied', time: { start: 1, end: 2 } },
        },
      },
    });
    expect(emitted[0]).toMatchObject({
      type: 'tool-result',
      sessionId: 'DESK1',
      data: { toolUseId: 'T2', result: 'permission denied', isError: true },
    });
  });

  it('translates session.idle into "turn-complete"', () => {
    // Verified: session.idle is the cleanest turn-complete signal.
    svc.eventBus.emit('event', {
      type: 'session.idle',
      properties: { sessionID: 'OC1' },
    });
    expect(emitted[0]).toMatchObject({
      type: 'turn-complete',
      sessionId: 'DESK1',
    });
  });

  it('IGNORES events for other OpenCode sessions', () => {
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        part: { type: 'text', id: 'P', sessionID: 'OC_OTHER', messageID: 'M', text: 'not ours' },
        delta: 'not ours',
      },
    });
    expect(emitted).toEqual([]);
  });

  it('destroy() unsubscribes — no further events emitted after', () => {
    adapter.destroy();
    svc.eventBus.emit('event', {
      type: 'message.part.updated',
      properties: {
        part: { type: 'text', id: 'P', sessionID: 'OC1', messageID: 'M', text: 'late' },
        delta: 'late',
      },
    });
    expect(emitted).toEqual([]);
  });

  it('isResume:true fetches message history via REST and emits transcript-events for each message', async () => {
    // Tear down the default adapter (from beforeEach) and create a resume one.
    adapter.destroy();
    // Verified shape: messages() returns Array<{ info: Message, parts: Part[] }>
    svc.seedHistory('OC1', [
      {
        info: { id: 'm-1', role: 'user',      time: { created: 100 } },
        parts: [{ type: 'text', id: 'p-1', sessionID: 'OC1', messageID: 'm-1', text: 'prior q' }],
      },
      {
        info: { id: 'm-2', role: 'assistant', time: { created: 200 } },
        parts: [{ type: 'text', id: 'p-2', sessionID: 'OC1', messageID: 'm-2', text: 'prior a' }],
      },
    ]);
    emitted = [];
    adapter = new OpenCodeSessionAdapter({
      ocSessionId: 'OC1', desktopSessionId: 'DESK1',
      service: svc as any, isResume: true,
    });
    adapter.on('transcript-event', (ev) => emitted.push(ev));
    // Wait for the async history fetch
    await new Promise((r) => setTimeout(r, 50));

    // Note: user-message IS emitted from the history-fetch path even though
    // it's skipped from live SSE — the optimistic dedup doesn't apply on
    // resume (no pending entries to match against; the chat reducer state
    // for the resumed session starts empty).
    expect(emitted.map(e => e.type)).toEqual(['user-message', 'assistant-text', 'turn-complete']);
    expect(emitted[0].data.text).toBe('prior q');
    expect(emitted[1].data.text).toBe('prior a');
  });
});
```

- [ ] **Step 2: Run, verify failures**

```bash
npx vitest run tests/opencode-session-adapter.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `OpenCodeSessionAdapter`**

Create `youcoded/desktop/src/main/opencode-session-adapter.ts`:

```ts
import { EventEmitter } from 'events';
import type { OpenCodeService } from './opencode-service';

export interface OpenCodeSessionAdapterOpts {
  /** OpenCode's internal session ID — used to filter incoming SSE events. */
  ocSessionId: string;
  /** YouCoded's desktop session ID — used to tag emitted transcript-events
   *  so the chat reducer keys them on the same id the renderer holds.
   *  For RESUME, this equals ocSessionId. For NEW sessions, they may differ. */
  desktopSessionId: string;
  service: OpenCodeService;
  /** When true, fetch message history via REST first and emit synthesized
   *  transcript-events for hydration before subscribing to live SSE. */
  isResume?: boolean;
}

/**
 * Translates OpenCode SSE events for a single session into transcript-event
 * messages matching the shape TranscriptWatcher emits for Claude sessions.
 *
 * Behaviors worth knowing about (see Task 5 prose for rationale):
 * - SKIPS user-message events from live SSE; SessionManager.sendInput
 *   synthesizes them with the exact text we sent so dedup is reliable.
 * - On isResume:true, fetches message history via REST and emits
 *   transcript-events for each historical message before subscribing.
 *   Tracks seenUuids to filter duplicates if SSE happens to replay history.
 *
 * Event shapes per Verified API Surface section of the plan:
 *   message.part.updated → { part: Part, delta?: string }
 *   message.updated      → { info: Message }
 *   session.idle         → { sessionID }
 *   ToolPart.state       → { status: 'pending' | 'running' | 'completed' | 'error', ... }
 */
export class OpenCodeSessionAdapter extends EventEmitter {
  private unsubscribe: (() => void) | null = null;
  private seenUuids = new Set<string>();
  private destroyed = false;

  constructor(private readonly opts: OpenCodeSessionAdapterOpts) {
    super();
    void this.init();
  }

  private async init(): Promise<void> {
    const sdk = this.opts.service.sdk();

    // Hydration first (fetch history, synthesize events) — defensive against
    // SSE delivering only new events. Then subscribe to live.
    // Verified: client.session.messages(id) returns Array<{ info: Message, parts: Part[] }>.
    if (this.opts.isResume) {
      try {
        const messages = await sdk.session.messages(this.opts.ocSessionId);
        for (const item of messages) {
          if (this.destroyed) return;
          this.handleHistoryMessage(item);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[OpenCodeSessionAdapter] history fetch failed:', e);
      }
    }

    if (this.destroyed) return;
    this.unsubscribe = sdk.event.subscribe((ev: any) => this.handleEvent(ev));
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private handleHistoryMessage(item: any): void {
    // Verified shape: { info: { id, role, time, ... }, parts: Part[] }
    // INCLUDES user-message here (no optimistic bubble exists for historical messages).
    const info = item.info ?? {};
    const parts: any[] = item.parts ?? [];
    for (const part of parts) {
      const translated = this.translatePart(part, info, /* skipUser = */ false);
      if (translated) this.emit('transcript-event', translated);
    }
    // Each historical assistant message ends a turn.
    if (info.role === 'assistant') {
      this.emit('transcript-event', {
        type: 'turn-complete',
        sessionId: this.opts.desktopSessionId,
        data: { stopReason: 'stop', model: info.model ?? null, usage: null },
      });
    }
  }

  private handleEvent(ev: any): void {
    // Different events nest sessionID in different places — check all known shapes.
    const sessionId =
      ev?.properties?.info?.sessionID ??
      ev?.properties?.sessionID ??
      ev?.properties?.part?.sessionID;
    if (sessionId !== this.opts.ocSessionId) return;

    // Streaming text/reasoning deltas: message.part.updated carries `delta` string.
    if (ev.type === 'message.part.updated') {
      const part = ev.properties.part;
      const delta = ev.properties.delta as string | undefined;

      if (part.type === 'text' && delta) {
        this.emit('transcript-event', {
          type: 'assistant-text',
          sessionId: this.opts.desktopSessionId,
          data: { text: delta, timestamp: Date.now(), uuid: `oc-${Date.now()}-${Math.random().toString(36).slice(2,8)}` },
        });
        return;
      }
      if (part.type === 'reasoning' && delta) {
        this.emit('transcript-event', {
          type: 'assistant-thinking',
          sessionId: this.opts.desktopSessionId,
          data: { text: delta, timestamp: Date.now() },
        });
        return;
      }

      // Tool parts arrive on this event too — every state transition triggers an update.
      if (part.type === 'tool') {
        const translated = this.translatePart(part, { sessionID: sessionId }, /* skipUser */ true);
        if (translated) this.emit('transcript-event', translated);
      }
      return;
    }

    // Final-state assistant message (covers user/system messages on resume too).
    if (ev.type === 'message.updated') {
      const info = ev.properties.info;
      const parts: any[] = info?.parts ?? ev.properties.parts ?? [];
      for (const part of parts) {
        const translated = this.translatePart(part, info, /* skipUser = */ true);
        if (translated) this.emit('transcript-event', translated);
      }
      return;
    }

    // Turn complete — session.idle is the cleanest signal.
    if (ev.type === 'session.idle') {
      this.emit('transcript-event', {
        type: 'turn-complete',
        sessionId: this.opts.desktopSessionId,
        data: { stopReason: 'stop', model: null, usage: null },
      });
      return;
    }
  }

  private translatePart(part: any, info: any, skipUser: boolean): any | null {
    if (part.type === 'text' && info.role === 'user') {
      if (skipUser) return null;
      // Resume hydration only — uuid-dedup against SSE replay
      if (info.id && this.seenUuids.has(info.id)) return null;
      if (info.id) this.seenUuids.add(info.id);
      return {
        type: 'user-message',
        sessionId: this.opts.desktopSessionId,
        data: { text: part.text, timestamp: info.time?.created ?? Date.now(), uuid: info.id },
      };
    }
    if (part.type === 'tool') {
      // Verified: ToolPart has top-level `tool: string` (the name), `callID: string`,
      // and `state` is itself a discriminated union with `status` field.
      const status = part.state?.status;
      const toolName = part.tool;
      const toolInput = part.state?.input;

      if (status === 'pending' || status === 'running') {
        return {
          type: 'tool-use',
          sessionId: this.opts.desktopSessionId,
          data: {
            toolName,
            toolInput,
            toolUseId: part.id,
            timestamp: info.time?.created ?? Date.now(),
          },
        };
      }
      if (status === 'completed') {
        return {
          type: 'tool-result',
          sessionId: this.opts.desktopSessionId,
          data: {
            toolUseId: part.id,
            result: part.state?.output ?? '',
            isError: false,
            timestamp: info.time?.created ?? Date.now(),
          },
        };
      }
      if (status === 'error') {
        return {
          type: 'tool-result',
          sessionId: this.opts.desktopSessionId,
          data: {
            toolUseId: part.id,
            result: part.state?.error ?? '',
            isError: true,
            timestamp: info.time?.created ?? Date.now(),
          },
        };
      }
    }
    return null;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/opencode-session-adapter.test.ts 2>&1 | tail -10
```

Expected: 10 passing. If a test fails because the actual SDK event shape diverges from the Verified API Surface section, fix the translator AND the test together — keep them honest about the contract.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/opencode-session-adapter.ts desktop/tests/opencode-session-adapter.test.ts
git commit -m "feat(opencode): OpenCodeSessionAdapter — translate SSE events to transcript-event"
```

---

## Task 6: SessionManager Delegation (with tests)

**Files:**
- Modify: `youcoded/desktop/src/main/session-manager.ts`
- Create: `youcoded/desktop/tests/session-manager-local.test.ts`

- [ ] **Step 1: Wire the OpenCode service + adapter map + id mapping + pending-sends queue into `SessionManager`**

Open `src/main/session-manager.ts`. Add imports + properties:

```ts
import { OpenCodeService } from './opencode-service';
import { OpenCodeSessionAdapter } from './opencode-session-adapter';
```

Extend the class. Three pieces of new state are required because OpenCode session creation is async and OpenCode generates its own session IDs:

```ts
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, ManagedSession>();
  private pipeName: string = '';
  private opencodeService: OpenCodeService | null = null;
  private localAdapters = new Map<string, OpenCodeSessionAdapter>();      // keyed on desktop id

  // Desktop id -> OpenCode session id. For RESUME these are equal (the user
  // picked an OC session id from the resume browser). For NEW sessions, the
  // desktop id is a fresh UUID and the OC id is whatever OpenCode generates
  // when we call createSession; the renderer holds the desktop id, but
  // every SDK call needs the OC id, so we translate via this map.
  private localIdMap = new Map<string, string>();

  // sendInput may arrive after createSession returned synchronously but
  // before the OC session id resolved. Queue the texts and drain when ready.
  private localPendingSends = new Map<string, string[]>();

  setOpenCodeService(svc: OpenCodeService) {
    this.opencodeService = svc;
    // When OpenCode crashes, every local adapter is bound to a dead SDK.
    // Tear them all down and emit session-exit with the child's exit code
    // (non-zero triggers the chat reducer's session-died attentionState
    // via SESSION_PROCESS_EXITED — the existing AttentionBanner surfaces).
    svc.on('crashed', ({ exitCode }) => this.handleOpencodeCrash(exitCode ?? 1));
  }

  private handleOpencodeCrash(exitCode: number): void {
    for (const [desktopId, session] of this.sessions) {
      if (session.info.provider !== 'local') continue;
      this.localAdapters.get(desktopId)?.destroy();
      this.localAdapters.delete(desktopId);
      this.localIdMap.delete(desktopId);
      this.localPendingSends.delete(desktopId);
      session.info.status = 'destroyed';
      this.sessions.delete(desktopId);
      this.emit('session-exit', desktopId, exitCode);
    }
  }

  setPipeName(name: string) {
    this.pipeName = name;
  }
  // ...
}
```

- [ ] **Step 2: Branch `createSession` on `provider === 'local'`**

In `createSession(opts: CreateSessionOpts): SessionInfo` (around line 44), add the local branch right after the existing `const id = randomUUID();` and `const provider = opts.provider || 'claude';` lines:

```ts
createSession(opts: CreateSessionOpts): SessionInfo {
  const id = randomUUID();
  const provider: SessionProvider = opts.provider || 'claude';
  const resolvedCwd = (opts.cwd && fs.existsSync(opts.cwd)) ? opts.cwd : os.homedir();

  // --- LOCAL provider branch ---
  if (provider === 'local') {
    if (!this.opencodeService) throw new Error('OpenCode service not wired');

    // Desktop session id assignment:
    // - RESUME: the renderer hands us the OC session id (it queried
    //   opencodeService.listSessions to populate the resume browser). Use
    //   it as the desktop id; the localIdMap entry is identity.
    // - NEW: the desktop id is a fresh UUID. The OC session id won't be
    //   known until createSession() resolves — set the localIdMap entry
    //   in the .then() block. Sends arriving before that get queued.
    const desktopId = opts.resumeSessionId || id;
    const isResume = !!opts.resumeSessionId;

    const info: SessionInfo = {
      id: desktopId, name: opts.name, cwd: resolvedCwd,
      permissionMode: 'normal', skipPermissions: false,
      status: 'active', createdAt: Date.now(),
      provider: 'local', model: opts.model,
      ...(opts.initialInput !== undefined ? { initialInput: opts.initialInput } : {}),
    };
    this.sessions.set(desktopId, { info, worker: null });   // worker unused for local
    this.emit('session-created', info);

    const ensureOcSession = isResume
      ? Promise.resolve({ id: opts.resumeSessionId! })
      : this.opencodeService.createSession({ systemPrompt: opts.systemPrompt });

    ensureOcSession.then((ocSession) => {
      this.localIdMap.set(desktopId, ocSession.id);
      const adapter = new OpenCodeSessionAdapter({
        ocSessionId: ocSession.id,
        desktopSessionId: desktopId,
        service: this.opencodeService!,
        isResume,
      });
      adapter.on('transcript-event', (event) => this.emit('transcript-event', event));
      this.localAdapters.set(desktopId, adapter);

      // Drain any queued sends that arrived during the create race window.
      const queued = this.localPendingSends.get(desktopId) ?? [];
      this.localPendingSends.delete(desktopId);
      for (const text of queued) {
        this.emitSyntheticUserMessage(desktopId, text);
        this.opencodeService!.sendMessage(ocSession.id, text).catch((err) => {
          log('ERROR', 'SessionManager', 'OpenCode sendMessage (queued) failed', { sessionId: desktopId, error: String(err) });
        });
      }
    }).catch((err) => {
      log('ERROR', 'SessionManager', 'Local session start failed', { sessionId: desktopId, error: String(err) });
      this.localPendingSends.delete(desktopId);
      this.emit('session-exit', desktopId, 1);
      this.sessions.delete(desktopId);
    });

    return info;
  }
  // --- end LOCAL branch ---

  // Existing PTY path continues unchanged.
  const args: string[] = [];
  // ...
```

- [ ] **Step 3: Update `CreateSessionOpts` to accept the new fields**

In the same file, find `interface CreateSessionOpts` (around line 15). Add:

```ts
export interface CreateSessionOpts {
  // ... existing
  /** Local-only: system prompt to pass to OpenCode session creation */
  systemPrompt?: string;
}
```

- [ ] **Step 4: Update `sendInput` and `destroySession` for local sessions**

`sendInput` for local sessions translates desktop id → OC id (queueing if not yet mapped) and emits a synthetic `user-message` after sendMessage succeeds so the optimistic bubble's `pending` flag clears via content-match dedup.

```ts
private emitSyntheticUserMessage(desktopId: string, text: string): void {
  // Tagged with the EXACT text we sent — guarantees content-match dedup
  // against the optimistic USER_PROMPT bubble's pending entry. Bypasses
  // any whitespace normalization OpenCode might apply to its echo.
  this.emit('transcript-event', {
    type: 'user-message',
    sessionId: desktopId,
    data: { text, timestamp: Date.now(), uuid: `local-u-${Date.now()}-${Math.random().toString(36).slice(2,8)}` },
  });
}

sendInput(id: string, text: string): boolean {
  const session = this.sessions.get(id);
  if (!session) return false;
  if (session.info.provider === 'local') {
    if (!this.opencodeService) return false;
    const userText = text.endsWith('\r') ? text.slice(0, -1) : text;
    if (userText === '\x1b') {
      const ocId = this.localIdMap.get(id);
      if (ocId) this.opencodeService.cancelSession(ocId).catch(() => { /* swallow */ });
      // No queued cancel for un-mapped sessions — there's nothing to cancel yet.
      return true;
    }
    if (!userText) return true;
    const ocId = this.localIdMap.get(id);
    if (!ocId) {
      // OC session not yet created — queue the text. The .then() in createSession
      // drains the queue with the synthetic user-message + sendMessage.
      const q = this.localPendingSends.get(id) ?? [];
      q.push(userText);
      this.localPendingSends.set(id, q);
      return true;
    }
    this.emitSyntheticUserMessage(id, userText);
    this.opencodeService.sendMessage(ocId, userText).catch((err) => {
      log('ERROR', 'SessionManager', 'OpenCode sendMessage failed', { sessionId: id, error: String(err) });
    });
    return true;
  }
  try { session.worker!.send({ type: 'input', data: text }); } catch { return false; }
  return true;
}

destroySession(id: string): boolean {
  const session = this.sessions.get(id);
  if (!session) return false;
  session.info.status = 'destroyed';
  this.sessions.delete(id);
  this.emit('session-exit', id, 0);
  if (session.info.provider === 'local') {
    this.localAdapters.get(id)?.destroy();
    this.localAdapters.delete(id);
    const ocId = this.localIdMap.get(id);
    this.localIdMap.delete(id);
    this.localPendingSends.delete(id);
    if (ocId) this.opencodeService?.destroySession(ocId).catch(() => { /* swallow */ });
    return true;
  }
  try {
    session.worker!.send({ type: 'kill' });
    session.worker!.disconnect();
  } catch { /* worker already closed */ }
  return true;
}
```

**`ManagedSession.worker` type change is definite, not optional:** change its type to `worker: ChildProcess | null`. The local branch sets `worker: null` (no PTY worker for local sessions); the existing PTY paths still set a real `ChildProcess`. All access via `session.worker!` (with non-null assertion) in the existing code paths since they only run for non-local providers.

- [ ] **Step 5: Add tests for the local branch**

Create `youcoded/desktop/tests/session-manager-local.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SessionManager } from '../src/main/session-manager';

function makeMockService(opts: { createImmediately?: boolean } = {}) {
  const ee = new EventEmitter() as any;
  ee.baseUrl = () => 'http://127.0.0.1:53217';
  // Allow tests to control whether createSession resolves before sendInput
  // arrives (race window) or after.
  let resolveCreate: (v: { id: string }) => void = () => {};
  const createPromise = new Promise<{ id: string }>((res) => { resolveCreate = res; });
  ee.createSession = vi.fn((_opts: any) => {
    if (opts.createImmediately !== false) resolveCreate({ id: 'oc-NEW' });
    return createPromise;
  });
  ee.resolveCreate = (id: string) => resolveCreate({ id });
  ee.sendMessage = vi.fn(async () => {});
  ee.cancelSession = vi.fn(async () => {});
  ee.destroySession = vi.fn(async () => {});
  ee.sdk = () => ({
    event: { subscribe: () => () => {} },
    session: { message: { list: async () => [] } },
  });
  return ee;
}

describe('SessionManager local branch', () => {
  let sm: SessionManager;
  let svc: ReturnType<typeof makeMockService>;

  beforeEach(() => {
    sm = new SessionManager();
    svc = makeMockService();
    sm.setOpenCodeService(svc as any);
  });

  it('createSession({ provider: "local" }) creates an OpenCode session and registers desktopId↔ocId map', async () => {
    const info = sm.createSession({
      name: 'L', cwd: '', skipPermissions: false,
      provider: 'local', model: 'qwen3:8b',
    });
    expect(info.provider).toBe('local');
    expect(info.id).toBeTruthy();
    expect(svc.createSession).toHaveBeenCalled();
    // Drain microtasks so the .then() that maps desktop→oc fires
    await new Promise((r) => setImmediate(r));
    // Send AFTER mapping is established → routes via the OC id, not the desktop id
    sm.sendInput(info.id, 'hello\r');
    expect(svc.sendMessage).toHaveBeenCalledWith('oc-NEW', 'hello');
  });

  it('createSession with resumeSessionId uses the OC id as desktopId AND skips fresh OC creation', () => {
    const info = sm.createSession({
      name: 'L', cwd: '', skipPermissions: false,
      provider: 'local', resumeSessionId: 'oc-resume-7',
    });
    expect(info.id).toBe('oc-resume-7');
    expect(sm.getSession('oc-resume-7')).toBeDefined();
    expect(svc.createSession).not.toHaveBeenCalled();
  });

  it('sendInput before OC session resolves QUEUES the text; drains after creation', async () => {
    svc = makeMockService({ createImmediately: false });
    sm.setOpenCodeService(svc as any);
    const info = sm.createSession({
      name: 'L', cwd: '', skipPermissions: false, provider: 'local',
    });
    // Send while OC session create is still pending
    sm.sendInput(info.id, 'first\r');
    sm.sendInput(info.id, 'second\r');
    expect(svc.sendMessage).not.toHaveBeenCalled();
    // Now resolve the create
    svc.resolveCreate('oc-LATE');
    await new Promise((r) => setImmediate(r));
    // Both queued sends should have flushed
    expect(svc.sendMessage).toHaveBeenCalledWith('oc-LATE', 'first');
    expect(svc.sendMessage).toHaveBeenCalledWith('oc-LATE', 'second');
  });

  it('sendInput emits a synthetic user-message transcript-event before sendMessage (for dedup)', async () => {
    const events: any[] = [];
    sm.on('transcript-event', (e) => events.push(e));
    const info = sm.createSession({ name: 'L', cwd: '', skipPermissions: false, provider: 'local' });
    await new Promise((r) => setImmediate(r));
    sm.sendInput(info.id, 'hi there\r');
    const userMsg = events.find((e) => e.type === 'user-message');
    expect(userMsg).toBeDefined();
    expect(userMsg.sessionId).toBe(info.id);   // tagged with desktopId
    expect(userMsg.data.text).toBe('hi there'); // exact text we sent (no whitespace normalization risk)
  });

  it('sendInput on a local session routes single ESC byte to cancelSession with OC id', async () => {
    const info = sm.createSession({ name: 'L', cwd: '', skipPermissions: false, provider: 'local' });
    await new Promise((r) => setImmediate(r));
    sm.sendInput(info.id, '\x1b');
    expect(svc.cancelSession).toHaveBeenCalledWith('oc-NEW');
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it('destroySession on a local session calls OpenCodeService.destroySession with OC id and emits exit', async () => {
    const exitSpy = vi.fn();
    sm.on('session-exit', exitSpy);
    const info = sm.createSession({ name: 'L', cwd: '', skipPermissions: false, provider: 'local' });
    await new Promise((r) => setImmediate(r));
    expect(sm.destroySession(info.id)).toBe(true);
    expect(svc.destroySession).toHaveBeenCalledWith('oc-NEW');
    expect(exitSpy).toHaveBeenCalledWith(info.id, 0);
  });

  it('OpenCode crash destroys all local adapters and emits non-zero session-exit per session (drives session-died banner)', async () => {
    const exitSpy = vi.fn();
    sm.on('session-exit', exitSpy);
    const a = sm.createSession({ name: 'A', cwd: '', skipPermissions: false, provider: 'local' });
    const b = sm.createSession({ name: 'B', cwd: '', skipPermissions: false, provider: 'local' });
    await new Promise((r) => setImmediate(r));
    // Simulate OpenCode daemon crash
    svc.emit('crashed', { exitCode: 137 });
    expect(exitSpy).toHaveBeenCalledWith(a.id, 137);
    expect(exitSpy).toHaveBeenCalledWith(b.id, 137);
    expect(sm.getSession(a.id)).toBeUndefined();
    expect(sm.getSession(b.id)).toBeUndefined();
  });
});
```

Run:

```bash
npx vitest run tests/session-manager-local.test.ts 2>&1 | tail -10
```

Expected: 5 passing.

- [ ] **Step 6: Wire the OpenCodeService into `ipc-handlers.ts`** (alongside `TranscriptWatcher`)

The existing `TranscriptWatcher` is constructed and wired at `ipc-handlers.ts:1639–1646`. Wire OpenCode similarly. Add immediately after the `transcriptWatcher.on('transcript-event', ...)` block:

```ts
import { OpenCodeService } from './opencode-service';

// Started lazily in the LOCAL_INSTALL_OPENCODE handler / first-run flow
// once the binary is known to exist. For now, construct lazily — the binary
// path is determined by the prerequisite-installer step.
let opencodeService: OpenCodeService | null = null;

async function ensureOpenCodeService(): Promise<OpenCodeService> {
  if (opencodeService && opencodeService.isRunning()) return opencodeService;
  const binaryPath = await locateOpenCodeBinary(); // helper from prerequisite-installer
  if (!binaryPath) throw new Error('OpenCode binary not installed');
  opencodeService = new OpenCodeService({ binaryPath });
  await opencodeService.start();
  sessionManager.setOpenCodeService(opencodeService);
  // Re-emit transcript events from the harness side via SessionManager
  // (already happens because SessionManager.createSession's local branch
  // attaches the adapter and re-emits its events).
  opencodeService.on('crashed', (info) => {
    log('ERROR', 'OpenCodeService', 'opencode serve crashed', info);
    // Future: surface a UI banner; for MVP, log and let next session create restart.
  });
  return opencodeService;
}
```

The function `locateOpenCodeBinary()` returns the absolute path written by the prerequisite-installer in Task 8. For now it can be a stub that returns the result of `which opencode` or a hardcoded `~/.local/bin/opencode` — refined in Task 8.

`SessionManager` already re-emits adapter events as `transcript-event`. Add the parallel subscription (mirrors the existing TranscriptWatcher wire at line 1641):

```ts
sessionManager.on('transcript-event', (event: any) => {
  sendForSession(event.sessionId, IPC.TRANSCRIPT_EVENT, event);
  if (remoteServer) {
    remoteServer.broadcast({ type: 'transcript:event', payload: event });
  }
});
```

- [ ] **Step 7: Type-check and commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors. (If `ManagedSession.worker` rejects `null as any`, change its type to `worker: ChildProcess | null`.)

```bash
git add desktop/src/main/session-manager.ts desktop/src/main/ipc-handlers.ts desktop/tests/session-manager-local.test.ts
git commit -m "feat(opencode): SessionManager delegates local provider to OpenCodeService + adapter; tests"
```

---

## Task 7: IPC Wiring (preload + ipc-handlers + remote-shim)

**Files:**
- Modify: `youcoded/desktop/src/main/preload.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

Expose `window.claude.local.*` so the renderer's new-session form, settings panel, ResumeBrowser, and first-run modal can drive the install/config/list operations.

- [ ] **Step 1: Add the channels and exposed methods to `preload.ts`**

Locate the `IPC` constant in `preload.ts`. Mirror the additions from `shared/types.ts` Task 1 Step 2.

In the `contextBridge.exposeInMainWorld('claude', { ... })` block, add the `local` namespace:

```ts
local: {
  /** Capability flag — true on Electron desktop, false on Android/remote-shim */
  supported: true,
  // Ollama
  isOllamaInstalled: (endpoint?: string) => ipcRenderer.invoke(IPC.LOCAL_IS_OLLAMA_INSTALLED, endpoint),
  listOllamaModels: (endpoint?: string) => ipcRenderer.invoke(IPC.LOCAL_LIST_OLLAMA_MODELS, endpoint),
  installOllama: () => ipcRenderer.invoke(IPC.LOCAL_INSTALL_OLLAMA),
  onInstallOllamaProgress: (cb: (ev: any) => void) => {
    const handler = (_e: any, ev: any) => cb(ev);
    ipcRenderer.on(IPC.LOCAL_INSTALL_OLLAMA_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.LOCAL_INSTALL_OLLAMA_PROGRESS, handler);
  },
  pullModel: (name: string, endpoint?: string) => ipcRenderer.invoke(IPC.LOCAL_PULL_MODEL, name, endpoint),
  onPullModelProgress: (cb: (ev: any) => void) => {
    const handler = (_e: any, ev: any) => cb(ev);
    ipcRenderer.on(IPC.LOCAL_PULL_MODEL_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.LOCAL_PULL_MODEL_PROGRESS, handler);
  },
  // OpenCode setup
  isOpenCodeInstalled: () => ipcRenderer.invoke(IPC.LOCAL_IS_OPENCODE_INSTALLED),
  installOpenCode: () => ipcRenderer.invoke(IPC.LOCAL_INSTALL_OPENCODE),
  onInstallOpenCodeProgress: (cb: (ev: any) => void) => {
    const handler = (_e: any, ev: any) => cb(ev);
    ipcRenderer.on(IPC.LOCAL_INSTALL_OPENCODE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.LOCAL_INSTALL_OPENCODE_PROGRESS, handler);
  },
  writeOpenCodeConfig: (opts: { ollamaBaseUrl: string }) => ipcRenderer.invoke(IPC.LOCAL_WRITE_OPENCODE_CONFIG, opts),
  // Session ops
  listSessions: () => ipcRenderer.invoke(IPC.LOCAL_LIST_SESSIONS),
},
```

- [ ] **Step 2: Implement the IPC handlers in `ipc-handlers.ts`**

```ts
import { OllamaDetector } from './ollama-detector';
import { OpenCodeConfigWriter } from './opencode-config-writer';
import { IPC } from '../shared/types';

function detectorFor(rawEndpoint?: string): OllamaDetector {
  const ep = rawEndpoint || 'http://localhost:11434';
  // Strip any trailing /v1 or slash; OllamaDetector probes Ollama's native /api/* paths.
  const root = ep.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  return new OllamaDetector(root);
}

ipcMain.handle(IPC.LOCAL_IS_OLLAMA_INSTALLED, async (_e, endpoint?: string) => {
  return await detectorFor(endpoint).isReachable();
});

ipcMain.handle(IPC.LOCAL_LIST_OLLAMA_MODELS, async (_e, endpoint?: string) => {
  const d = detectorFor(endpoint);
  const reachable = await d.isReachable();
  if (!reachable) return { reachable: false, models: [] };
  return { reachable: true, models: await d.listModels() };
});

ipcMain.handle(IPC.LOCAL_INSTALL_OLLAMA, async (event) => {
  const { installOllama } = await import('./prerequisite-installer');
  return await installOllama((ev) => event.sender.send(IPC.LOCAL_INSTALL_OLLAMA_PROGRESS, ev));
});

ipcMain.handle(IPC.LOCAL_PULL_MODEL, async (event, name: string, endpoint?: string) => {
  if (typeof name !== 'string' || !name) return { ok: false, error: 'name required' };
  const d = detectorFor(endpoint);
  await d.pullModel(name, (ev) => {
    if (ev.kind === 'progress') {
      event.sender.send(IPC.LOCAL_PULL_MODEL_PROGRESS, {
        name, phase: ev.status,
        pct: ev.totalBytes > 0 ? Math.round((ev.completedBytes / ev.totalBytes) * 100) : undefined,
      });
    } else if (ev.kind === 'status') {
      event.sender.send(IPC.LOCAL_PULL_MODEL_PROGRESS, { name, phase: ev.status });
    } else if (ev.kind === 'done') {
      event.sender.send(IPC.LOCAL_PULL_MODEL_PROGRESS, { name, phase: 'done', pct: 100 });
    } else {
      event.sender.send(IPC.LOCAL_PULL_MODEL_PROGRESS, { name, phase: 'error', message: ev.message });
    }
  });
  return { ok: true };
});

ipcMain.handle(IPC.LOCAL_IS_OPENCODE_INSTALLED, async () => {
  const { isOpenCodeInstalled } = await import('./prerequisite-installer');
  return await isOpenCodeInstalled();
});

ipcMain.handle(IPC.LOCAL_INSTALL_OPENCODE, async (event) => {
  const { installOpenCode } = await import('./prerequisite-installer');
  return await installOpenCode((ev) => event.sender.send(IPC.LOCAL_INSTALL_OPENCODE_PROGRESS, ev));
});

ipcMain.handle(IPC.LOCAL_WRITE_OPENCODE_CONFIG, async (_e, opts: { ollamaBaseUrl: string }) => {
  const writer = new OpenCodeConfigWriter(os.homedir());
  await writer.writeOllamaConfig(opts);
  return { ok: true };
});

ipcMain.handle(IPC.LOCAL_LIST_SESSIONS, async () => {
  if (!opencodeService || !opencodeService.isRunning()) return [];
  return await opencodeService.listSessions();
});
```

- [ ] **Step 3: Add no-op shims to `remote-shim.ts`**

```ts
local: {
  supported: false,
  isOllamaInstalled: async () => false,
  listOllamaModels: async () => ({ reachable: false, models: [] }),
  installOllama: async () => ({ ok: false, error: 'local mode not supported on this platform' }),
  onInstallOllamaProgress: () => () => {},
  pullModel: async () => ({ ok: false, error: 'local mode not supported on this platform' }),
  onPullModelProgress: () => () => {},
  isOpenCodeInstalled: async () => false,
  installOpenCode: async () => ({ ok: false, error: 'local mode not supported on this platform' }),
  onInstallOpenCodeProgress: () => () => {},
  writeOpenCodeConfig: async () => ({ ok: false, error: 'local mode not supported on this platform' }),
  listSessions: async () => [],
},
```

- [ ] **Step 4: Verify IPC parity test still passes**

```bash
npx vitest run tests/ipc-channels.test.ts 2>&1 | tail -10
```

Expected: pass (or just `console.warn`s about drift). Hard fails mean the keys in `shared/types.ts` (Task 1 Step 2) and `preload.ts` here disagree — fix them.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/renderer/remote-shim.ts
git commit -m "feat(opencode): wire window.claude.local.* IPC + remote-shim no-ops"
```

---

## Task 8: Ollama + OpenCode Installation (`prerequisite-installer.ts`)

**Files:**
- Modify: `youcoded/desktop/src/main/prerequisite-installer.ts`

- [ ] **Step 1: Add `installOllama`**

Open `src/main/prerequisite-installer.ts`. Reference the existing `installClaude` function as the pattern. Add:

```ts
export async function installOllama(
  onProgress: (ev: { phase: string; message?: string; pct?: number }) => void,
): Promise<{ ok: boolean; error?: string }> {
  onProgress({ phase: 'starting', message: 'Downloading Ollama installer…' });
  try {
    if (process.platform === 'win32') {
      const installerPath = path.join(os.tmpdir(), 'OllamaSetup.exe');
      await downloadFile('https://ollama.com/download/OllamaSetup.exe', installerPath, (pct) => {
        onProgress({ phase: 'downloading', pct, message: 'Downloading Ollama (~300 MB)' });
      });
      onProgress({ phase: 'installing', message: 'Running Ollama installer…' });
      await runCommand(installerPath, ['/S'], { shell: false });
    } else if (process.platform === 'darwin') {
      shell.openExternal('https://ollama.com/download/Ollama-darwin.zip');
      return { ok: false, error: 'macOS silent install not yet supported — Ollama install opened in browser.' };
    } else if (process.platform === 'linux') {
      await runCommand('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], { shell: false });
    } else {
      return { ok: false, error: `unsupported platform: ${process.platform}` };
    }
    onProgress({ phase: 'verifying', message: 'Checking Ollama is running…' });
    const { OllamaDetector } = await import('./ollama-detector');
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await new OllamaDetector().isReachable()) {
        onProgress({ phase: 'done', pct: 100 });
        return { ok: true };
      }
    }
    return { ok: false, error: 'Ollama installed but daemon did not start within 10 s' };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
```

If `downloadFile` and `runCommand` aren't already in this file, look at `installClaude` for either the existing helpers or add small ones at the top of the file (the Vercel-AI-SDK roadmap plan has reference implementations).

- [ ] **Step 2: Add `installOpenCode` + `isOpenCodeInstalled` + `locateOpenCodeBinary`**

```ts
const OPENCODE_INSTALL_DIR = path.join(os.homedir(), '.local', 'bin');
const OPENCODE_BINARY_NAME = process.platform === 'win32' ? 'opencode.exe' : 'opencode';

export async function locateOpenCodeBinary(): Promise<string | null> {
  // Try our managed install location first
  const managed = path.join(OPENCODE_INSTALL_DIR, OPENCODE_BINARY_NAME);
  try {
    await fs.promises.access(managed, fs.constants.X_OK);
    return managed;
  } catch { /* not there */ }
  // Then try the system PATH (which package may resolve it)
  try {
    const which = await import('which');
    return which.sync('opencode');
  } catch { /* not on PATH */ }
  return null;
}

export async function isOpenCodeInstalled(): Promise<boolean> {
  return (await locateOpenCodeBinary()) !== null;
}

export async function installOpenCode(
  onProgress: (ev: { phase: string; message?: string; pct?: number }) => void,
): Promise<{ ok: boolean; error?: string }> {
  onProgress({ phase: 'starting', message: 'Installing OpenCode…' });
  try {
    if (process.platform === 'win32') {
      // Direct binary download from GitHub Releases.
      // VERIFY during impl: the actual asset name on the canonical OpenCode
      // GitHub release. As of writing the repo split (sst/opencode vs
      // anomalyco/opencode) is in flux — verify which is canonical and the
      // asset naming convention before pinning a URL.
      const binaryUrl = 'https://github.com/sst/opencode/releases/latest/download/opencode-windows-x64.exe';
      await fs.promises.mkdir(OPENCODE_INSTALL_DIR, { recursive: true });
      const dest = path.join(OPENCODE_INSTALL_DIR, OPENCODE_BINARY_NAME);
      await downloadFile(binaryUrl, dest, (pct) => {
        onProgress({ phase: 'downloading', pct, message: 'Downloading OpenCode' });
      });
    } else {
      // POSIX: use the official install script
      await runCommand('sh', ['-c', 'curl -fsSL https://opencode.ai/install | bash'], { shell: false });
    }
    onProgress({ phase: 'verifying', message: 'Checking OpenCode binary…' });
    if (!(await isOpenCodeInstalled())) {
      return { ok: false, error: 'OpenCode binary not found after install — restart YouCoded to refresh PATH or check install location' };
    }
    onProgress({ phase: 'done', pct: 100 });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
```

- [ ] **Step 3: Add an `oc-dependencies.md` entry for the install URLs**

Append to `youcoded/docs/oc-dependencies.md`:

```markdown
## Native installer bootstrap script (Local — OpenCode)

**Touchpoint:** `src/main/prerequisite-installer.ts → installOpenCode`
**Coupling:** Depends on the canonical OpenCode repo publishing release assets at predictable URLs (currently `github.com/sst/opencode/releases/latest/download/opencode-<platform>.<ext>`) and the Linux install script at `https://opencode.ai/install`. If OpenCode moves these or changes asset naming, `installOpenCode` breaks.
**Fork awareness:** `sst/opencode` vs `anomalyco/opencode` — verify canonical before each release.
**Mitigation:** First-run failure surfaces a clear error; user can install OpenCode manually from opencode.ai.
```

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/main/prerequisite-installer.ts docs/oc-dependencies.md
git commit -m "feat(opencode): prerequisite-installer — installOllama + installOpenCode + locateOpenCodeBinary"
```

---

## Task 9: SessionStrip Runtime Selector

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx`
- Modify: `youcoded/desktop/src/renderer/components/HeaderBar.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx`

Replace `isGemini: boolean` with a three-way Runtime selector (Claude / Local / Gemini) gated by platform support and existing flags.

- [ ] **Step 1: Add `runtime` state in SessionStrip and gate Local on platform**

Open `src/renderer/components/SessionStrip.tsx`. Add the platform import:

```tsx
import { isAndroid, isRemoteMode } from '../platform';
```

Find the local state at the top of the new-session form (`const [isGemini, setIsGemini] = useState(false);`, around line 166). Replace with:

```tsx
type Runtime = 'claude' | 'local' | 'gemini';
const [runtime, setRuntime] = useState<Runtime>('claude');
const [localModels, setLocalModels] = useState<Array<{ name: string; sizeBytes: number }>>([]);
const [localReachable, setLocalReachable] = useState<boolean | null>(null);

// Local runtime is desktop-only (no Ollama/OpenCode runtime on Android/remote).
const localSupported = !isAndroid() && !isRemoteMode() && !!(window.claude as any).local?.supported;

useEffect(() => {
  if (runtime !== 'local' || !localSupported) return;
  let cancelled = false;
  const endpoint = defaultLocalEndpoint || undefined;
  (window.claude as any).local.listOllamaModels(endpoint).then((res: any) => {
    if (cancelled) return;
    setLocalReachable(res.reachable);
    setLocalModels(res.models);
  });
  return () => { cancelled = true; };
}, [runtime, localSupported, defaultLocalEndpoint]);
```

- [ ] **Step 2: Add `defaultLocalEndpoint` to Props and add Runtime control**

Add to the `Props` interface (top of file):

```tsx
defaultLocalEndpoint?: string;
```

Inside the expanded new-session form JSX, just before the existing folder picker, insert:

```tsx
<div className="mb-3">
  <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Runtime</label>
  <div className="inline-flex rounded border border-edge overflow-hidden">
    {([
      'claude' as Runtime,
      ...(localSupported ? ['local' as Runtime] : []),
      ...(geminiEnabled ? ['gemini' as Runtime] : []),
    ]).map(r => (
      <button
        key={r} type="button"
        onClick={() => setRuntime(r)}
        className={`px-3 py-1 text-xs ${runtime === r ? 'bg-accent text-on-accent' : 'bg-panel text-fg hover:bg-inset'}`}
      >
        {r === 'claude' ? 'Claude' : r === 'local' ? 'Local' : 'Gemini'}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Replace the model selector body with runtime-aware version**

Find the existing Model selector block (search for `{/* Model selector — grayed out when Gemini is selected */}`). Replace the body with:

```tsx
<div style={{ opacity: runtime === 'gemini' ? 0.4 : 1, pointerEvents: runtime === 'gemini' ? 'none' : 'auto', transition: 'opacity 200ms' }}>
  <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Model</label>
  {runtime === 'claude' && (
    <div className="flex gap-1">
      {/* Existing Claude variant buttons (Sonnet/Opus/Haiku) — keep their JSX,
          confined inside this conditional. */}
    </div>
  )}
  {runtime === 'local' && (
    <>
      {localReachable === null && <div className="text-xs text-fg-muted">Checking…</div>}
      {localReachable === false && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-accent text-on-accent"
          onClick={() => {
            setShowNewForm(false);
            window.dispatchEvent(new CustomEvent('youcoded:open-local-setup'));
          }}
        >
          Set up local models →
        </button>
      )}
      {localReachable === true && localModels.length === 0 && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-accent text-on-accent"
          onClick={() => {
            setShowNewForm(false);
            window.dispatchEvent(new CustomEvent('youcoded:open-local-setup'));
          }}
        >
          Set up local models →
        </button>
      )}
      {localReachable === true && localModels.length > 0 && (
        <select
          className="bg-panel border border-edge rounded text-fg text-xs px-2 py-1"
          value={newModel}
          onChange={(e) => setNewModel(e.target.value)}
        >
          {localModels.map(m => (
            <option key={m.name} value={m.name}>{m.name} ({(m.sizeBytes / 1e9).toFixed(1)} GB)</option>
          ))}
        </select>
      )}
    </>
  )}
  {runtime === 'gemini' && <div className="text-xs text-fg-muted">Gemini chooses its own model.</div>}
</div>
```

- [ ] **Step 4: Update `handleCreate` to pass runtime as provider**

Find `handleCreate` (around line 336). Replace with:

```tsx
const handleCreate = useCallback(() => {
  onCreateSession(newCwd, dangerous, newModel, runtime, launchInNewWindow);
  setMenuOpen(false);
  setShowNewForm(false);
  setDangerous(defaultSkipPermissions || false);
  setNewModel(defaultModel || 'sonnet');
  setRuntime('claude');
  setLaunchInNewWindow(false);
}, [newCwd, dangerous, newModel, runtime, launchInNewWindow, onCreateSession, defaultSkipPermissions, defaultModel]);
```

- [ ] **Step 5: Update the `onCreateSession` Props type**

In the same file's `Props` interface, change `provider?: 'claude' | 'gemini'` to `provider?: 'claude' | 'gemini' | 'local'` everywhere it appears.

- [ ] **Step 6: Update HeaderBar Props + plumb `defaultLocalEndpoint`**

Open `src/renderer/components/HeaderBar.tsx`. In the `Props` interface (around line 153):
- Change every `provider?: 'claude' | 'gemini'` → `provider?: 'claude' | 'gemini' | 'local'`
- Add `defaultLocalEndpoint?: string;`

In the `<SessionStrip ... />` render call (around line 504), pass:

```tsx
defaultLocalEndpoint={defaultLocalEndpoint}
```

- [ ] **Step 7: Update App.tsx's `createSession` callback and pass `defaultLocalEndpoint`**

In `src/renderer/App.tsx`, find the `createSession` useCallback (around line 1562). Update signature and add the local-specific fields:

```tsx
const createSession = useCallback(async (
  cwd: string,
  dangerous: boolean,
  sessionModel?: string,
  provider?: 'claude' | 'gemini' | 'local',
  launchInNewWindow?: boolean,
) => {
  const m = sessionModel || currentModel;
  const info = await (window.claude.session.create as any)({
    name: provider === 'gemini' ? 'Gemini Session'
        : provider === 'local'  ? 'Local Session'
        : 'New Session',
    cwd,
    skipPermissions: dangerous,
    model: m,
    provider,
    ...(provider === 'local' ? {
      systemPrompt: sessionDefaults.localSystemPrompt || undefined,
    } : {}),
    // ... rest unchanged
  });
  // ...
```

Find `<HeaderBar ... />` and add:

```tsx
defaultLocalEndpoint={sessionDefaults.localEndpoint}
```

(`sessionDefaults.localEndpoint` is added to the defaults shape in Task 11.)

- [ ] **Step 8: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/renderer/components/SessionStrip.tsx desktop/src/renderer/components/HeaderBar.tsx desktop/src/renderer/App.tsx
git commit -m "feat(opencode): three-way Runtime selector in new-session form, gated by platform"
```

---

## Task 10: HeaderBar / ModelPicker / Classifier — runtime-aware UI

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/HeaderBar.tsx`
- Modify: `youcoded/desktop/src/renderer/components/ModelPickerPopup.tsx`
- Modify: `youcoded/desktop/src/renderer/hooks/useAttentionClassifier.ts`
- Modify: `youcoded/desktop/src/renderer/components/ChatView.tsx`

Hide chat/terminal toggle and permission-mode badge for local sessions; runtime-scope the mid-session model picker; gate the attention classifier so it only ticks for Claude sessions.

- [ ] **Step 1: Hide chat/terminal toggle for local sessions**

Open `src/renderer/components/HeaderBar.tsx`. Find the chat/terminal toggle JSX. Wrap:

```tsx
{currentSession?.provider !== 'local' && (
  <ChatTerminalToggle viewMode={viewMode} onToggleView={onToggleView} />
)}
```

If `HeaderBar` doesn't already receive the active session, plumb it from App.tsx.

- [ ] **Step 2: Hide permission-mode badge for local sessions**

Same file:

```tsx
{currentSession?.provider !== 'local' && <PermissionModeBadge ... />}
```

- [ ] **Step 3: ModelPickerPopup runtime-scoped list**

Open `src/renderer/components/ModelPickerPopup.tsx`. Add a `provider` and `endpoint` prop:

```tsx
interface ModelPickerPopupProps {
  // ... existing
  provider?: SessionProvider;
  endpoint?: string;
}

const [localModels, setLocalModels] = useState<Array<{ name: string; sizeBytes: number }>>([]);
useEffect(() => {
  if (provider !== 'local') return;
  let cancelled = false;
  (window.claude as any).local.listOllamaModels(endpoint).then((res: any) => {
    if (!cancelled) setLocalModels(res.models);
  });
  return () => { cancelled = true; };
}, [provider, endpoint]);

if (provider === 'local') {
  return (
    <div className="...">
      <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 px-2 pt-2">Local Models</div>
      {localModels.map(m => (
        <button key={m.name} onClick={() => onSelect(m.name)} className="w-full text-left px-2 py-1 hover:bg-inset">
          {m.name} <span className="text-fg-muted text-xs">({(m.sizeBytes / 1e9).toFixed(1)} GB)</span>
        </button>
      ))}
      {localModels.length === 0 && <div className="px-2 py-1 text-xs text-fg-muted">No local models installed.</div>}
    </div>
  );
}
// ... existing Claude render below
```

In `App.tsx`, pass the active session's provider/endpoint to `ModelPickerPopup`.

- [ ] **Step 4: Gate `useAttentionClassifier` on `provider === 'claude'`**

Open `src/renderer/hooks/useAttentionClassifier.ts`. Find the hook signature. Add `provider?: SessionProvider` to the options. At the top of the hook body, after destructuring options:

```ts
if (provider !== undefined && provider !== 'claude') {
  return;
}
```

Open `src/renderer/components/ChatView.tsx` (line 107). Pass `provider`:

```tsx
useAttentionClassifier(sessionId, {
  isThinking: state.isThinking,
  hasRunningTools,
  hasAwaitingApproval,
  visible,
  currentAttentionState: state.attentionState,
  provider: session?.provider,
});
```

(`session` is whatever variable already holds the active SessionInfo in ChatView.)

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/renderer/components/HeaderBar.tsx desktop/src/renderer/components/ModelPickerPopup.tsx desktop/src/renderer/hooks/useAttentionClassifier.ts desktop/src/renderer/components/ChatView.tsx desktop/src/renderer/App.tsx
git commit -m "feat(opencode): runtime-aware UI — hide toggle/permission for local; scope ModelPicker; gate classifier"
```

---

## Task 11: Settings — Local Models Section

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Add the Local Models section**

Open `src/renderer/components/SettingsPanel.tsx`. Add after the most-related existing section (Defaults area):

```tsx
<SettingsSection title="Local Models">
  <div className="space-y-3">
    <div>
      <label className="text-xs text-fg-muted">Ollama Endpoint URL</label>
      <input
        type="text"
        className="w-full bg-panel border border-edge rounded px-2 py-1 text-sm"
        value={defaults.localEndpoint || 'http://localhost:11434'}
        onChange={(e) => onDefaultsChange({ localEndpoint: e.target.value })}
      />
      <div className="text-[10px] text-fg-muted mt-1">
        Defaults to Ollama on localhost. Point at LM Studio (typically <code>http://localhost:1234</code>) or any other OpenAI-compatible endpoint.
      </div>
    </div>
    <div>
      <label className="text-xs text-fg-muted">Default Model</label>
      <select
        className="w-full bg-panel border border-edge rounded px-2 py-1 text-sm"
        value={defaults.localDefaultModel || ''}
        onChange={(e) => onDefaultsChange({ localDefaultModel: e.target.value })}
      >
        <option value="">(use first installed)</option>
        {localModelsForSettings.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
      </select>
    </div>
    <div>
      <label className="text-xs text-fg-muted">System Prompt</label>
      <textarea
        rows={3}
        className="w-full bg-panel border border-edge rounded px-2 py-1 text-sm font-mono"
        value={defaults.localSystemPrompt || ''}
        placeholder="You are a helpful assistant. The user is using YouCoded..."
        onChange={(e) => onDefaultsChange({ localSystemPrompt: e.target.value })}
      />
    </div>
  </div>
</SettingsSection>
```

Add the `localModelsForSettings` state with a `useEffect` that calls `window.claude.local.listOllamaModels(defaults.localEndpoint)` and re-runs when the endpoint changes:

```tsx
const [localModelsForSettings, setLocalModelsForSettings] = useState<Array<{ name: string; sizeBytes: number }>>([]);
useEffect(() => {
  let cancelled = false;
  (window.claude as any).local.listOllamaModels(defaults.localEndpoint).then((res: any) => {
    if (!cancelled) setLocalModelsForSettings(res.models);
  });
  return () => { cancelled = true; };
}, [defaults.localEndpoint]);
```

When the endpoint changes, also rewrite OpenCode's config file. **Debounce** so each keystroke doesn't trigger a JSON read+write to disk:

```tsx
useEffect(() => {
  if (!defaults.localEndpoint) return;
  const handle = setTimeout(() => {
    (window.claude as any).local.writeOpenCodeConfig({ ollamaBaseUrl: defaults.localEndpoint });
    // (Future: signal OpenCode to reload its config — for MVP, the change takes
    // effect on next OpenCode daemon restart, i.e. next app launch.)
  }, 600);
  return () => clearTimeout(handle);
}, [defaults.localEndpoint]);
```

- [ ] **Step 2: Extend the defaults shape**

In `App.tsx` find the `sessionDefaults` state shape. Add:

```ts
localEndpoint: 'http://localhost:11434',
localDefaultModel: '',
localSystemPrompt: '',
```

Update `DefaultsButtonProps` and other places that type the defaults to include the three optional fields.

Persist via the same store the existing defaults use.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/renderer/components/SettingsPanel.tsx desktop/src/renderer/App.tsx
git commit -m "feat(opencode): Local Models settings section (endpoint, default model, system prompt)"
```

---

## Task 12: First-Run Modal (LocalSetupModal)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/LocalSetupModal.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx`

Multi-stage setup: Ollama → model → OpenCode → config. Triggered by the inline CTAs in SessionStrip (Task 9).

- [ ] **Step 1: Create the modal component**

Create `src/renderer/components/LocalSetupModal.tsx`:

```tsx
import { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
  endpoint?: string;   // configured Ollama endpoint
}

type Phase =
  | 'check'
  | 'install-ollama'
  | 'pull-model'
  | 'install-opencode'
  | 'write-config'
  | 'done'
  | 'error'
  | 'cancelled';

export function LocalSetupModal({ onClose, endpoint }: Props) {
  const [phase, setPhase] = useState<Phase>('check');
  const [progress, setProgress] = useState<{ pct?: number; message?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cancel-on-unmount so close-mid-install stops the runaway promise chain.
    // installOllama / installOpenCode / pullModel each take seconds-to-minutes
    // and would otherwise keep firing onProgress callbacks against a dead
    // component — and worse, leave a half-installed state.
    const ac = new AbortController();
      // 1. Ollama
      const ollamaUp = await (window.claude as any).local.isOllamaInstalled(endpoint);
      if (cancelled()) { setPhase('cancelled'); return; }
      if (!ollamaUp) {
        setPhase('install-ollama');
        const off = (window.claude as any).local.onInstallOllamaProgress((ev: any) => { if (!cancelled()) setProgress(ev); });
        const r = await (window.claude as any).local.installOllama();
        off();
        if (cancelled()) { setPhase('cancelled'); return; }
        if (!r.ok) { setError(r.error || 'Ollama install failed'); setPhase('error'); return; }
      }

      // 2. Model
      const ml = await (window.claude as any).local.listOllamaModels(endpoint);
      if (cancelled()) { setPhase('cancelled'); return; }
      if (!ml.reachable || ml.models.length === 0) {
        setPhase('pull-model');
        const off = (window.claude as any).local.onPullModelProgress((ev: any) => { if (!cancelled()) setProgress(ev); });
        const r = await (window.claude as any).local.pullModel('qwen3:8b', endpoint);
        off();
        if (cancelled()) { setPhase('cancelled'); return; }
        if (!r.ok) { setError(r.error || 'model pull failed'); setPhase('error'); return; }
      }

      // 3. OpenCode binary
      const ocUp = await (window.claude as any).local.isOpenCodeInstalled();
      if (cancelled()) { setPhase('cancelled'); return; }
      if (!ocUp) {
        setPhase('install-opencode');
        const off = (window.claude as any).local.onInstallOpenCodeProgress((ev: any) => { if (!cancelled()) setProgress(ev); });
        const r = await (window.claude as any).local.installOpenCode();
        off();
        if (cancelled()) { setPhase('cancelled'); return; }
        if (!r.ok) { setError(r.error || 'OpenCode install failed'); setPhase('error'); return; }
      }

      // 4. Config
      setPhase('write-config');
      const r = await (window.claude as any).local.writeOpenCodeConfig({
        ollamaBaseUrl: endpoint || 'http://localhost:11434',
      });
      if (cancelled()) { setPhase('cancelled'); return; }
      if (!r.ok) { setError(r.error || 'config write failed'); setPhase('error'); return; }

      if (cancelled()) { setPhase('cancelled'); return; }
      setPhase('done');
    })();
    return () => { ac.abort(); };
  }, [endpoint]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-panel rounded-lg p-6 w-[28rem] max-w-[90vw]">
        <h2 className="text-lg font-semibold mb-3">Local Mode Setup</h2>
        {phase === 'check'           && <div>Checking prerequisites…</div>}
        {phase === 'install-ollama'  && <div>Installing Ollama: {progress.message ?? ''} {progress.pct != null && `(${progress.pct}%)`}</div>}
        {phase === 'pull-model'      && <div>Downloading Qwen 3 8B: {progress.message ?? ''} {progress.pct != null && `(${progress.pct}%)`}</div>}
        {phase === 'install-opencode'&& <div>Installing OpenCode: {progress.message ?? ''} {progress.pct != null && `(${progress.pct}%)`}</div>}
        {phase === 'write-config'    && <div>Writing OpenCode config…</div>}
        {phase === 'done'            && <div>Ready! Restart YouCoded once to start the OpenCode daemon, then create a Local session.</div>}
        {phase === 'cancelled'       && <div className="text-fg-muted">Setup cancelled.</div>}
        {phase === 'error'           && <div className="text-red-500">Error: {error}</div>}
        <button onClick={onClose} className="mt-4 px-3 py-1 bg-accent text-on-accent rounded">
          {phase === 'done' || phase === 'error' ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
```

(MVP simplification: the daemon is started lazily inside `ipc-handlers.ts` on the first local-session create, OR at app startup if config indicates Local has been set up. Either approach is fine; pick during implementation. The "Restart YouCoded" message above is the safe option.)

- [ ] **Step 2: Wire the modal trigger in `App.tsx`**

```tsx
const [localSetupOpen, setLocalSetupOpen] = useState(false);
useEffect(() => {
  const handler = () => setLocalSetupOpen(true);
  window.addEventListener('youcoded:open-local-setup', handler);
  return () => window.removeEventListener('youcoded:open-local-setup', handler);
}, []);

// In JSX:
{localSetupOpen && (
  <LocalSetupModal
    endpoint={sessionDefaults.localEndpoint}
    onClose={() => setLocalSetupOpen(false)}
  />
)}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/renderer/components/LocalSetupModal.tsx desktop/src/renderer/App.tsx
git commit -m "feat(opencode): LocalSetupModal — Ollama install + model pull + OpenCode install + config write"
```

---

## Task 13: ResumeBrowser Local Tab

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/restore/ResumeBrowser.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Add a Local tab to `ResumeBrowser`**

Open `src/renderer/components/restore/ResumeBrowser.tsx`. Add tab state + queries:

```tsx
const [tab, setTab] = useState<'claude' | 'local'>('claude');
const [localSessions, setLocalSessions] = useState<any[]>([]);

useEffect(() => {
  if (tab !== 'local') return;
  (window.claude as any).local.listSessions().then(setLocalSessions);
}, [tab]);

// Tab bar:
<div className="flex gap-2 border-b border-edge mb-3">
  <button className={`px-3 py-1 ${tab === 'claude' ? 'border-b-2 border-accent' : ''}`} onClick={() => setTab('claude')}>Claude</button>
  <button className={`px-3 py-1 ${tab === 'local' ? 'border-b-2 border-accent' : ''}`} onClick={() => setTab('local')}>Local</button>
</div>

{tab === 'claude' && (/* existing JSX */)}

{tab === 'local' && (
  <div className="space-y-1">
    {localSessions.length === 0 && <div className="text-fg-muted text-sm">No local sessions yet.</div>}
    {localSessions.map(s => (
      <button key={s.id} className="w-full text-left px-2 py-2 rounded hover:bg-inset" onClick={() => onResumeLocal(s.id)}>
        <div className="font-medium">{s.title}</div>
        <div className="text-xs text-fg-muted">{new Date(s.updatedAt).toLocaleString()}</div>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 2: Wire `onResumeLocal` in `App.tsx`**

```tsx
const onResumeLocal = useCallback(async (sessionId: string) => {
  const info = await (window.claude.session.create as any)({
    name: 'Local Session',
    cwd: '',
    skipPermissions: false,
    provider: 'local',
    resumeSessionId: sessionId,
  });
  // ... existing post-create wiring
}, []);
```

The local-branch resume code in `SessionManager.createSession` (Task 6 Step 2) already handles this: `localId = opts.resumeSessionId || id` ensures the renderer holds the same id the OpenCode session uses. The adapter mounts on the existing OpenCode session and OpenCode replays its message history over SSE — chat reducer hydrates from empty.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

```bash
git add desktop/src/renderer/components/restore/ResumeBrowser.tsx desktop/src/renderer/App.tsx
git commit -m "feat(opencode): ResumeBrowser shows local sessions; resume hydrates via OpenCode SSE replay"
```

---

## Task 14: End-to-End Smoke Test

**Files:** None modified — manual verification in dev mode.

- [ ] **Step 1: Pre-flight — Ollama + Qwen 3 8B installed**

```bash
curl -s http://localhost:11434/api/version
curl -s http://localhost:11434/api/tags | grep qwen3
```

If neither, install via the in-app first-run flow as part of this test. Otherwise install manually first to keep the test focused on harness behavior.

- [ ] **Step 2: Verify OpenCode binary accessible**

```bash
which opencode
opencode --version
```

If missing, install via in-app flow.

- [ ] **Step 3: Verify OpenCode config points at Ollama**

```bash
cat ~/.config/opencode/opencode.json
```

Expected: `provider.ollama.options.baseURL` set to `http://localhost:11434/v1`.

- [ ] **Step 4: Launch dev mode**

```bash
cd /c/Users/desti/youcoded-dev
YOUCODED_WT=youcoded.wt/opencode-mvp bash scripts/run-dev.sh
```

A "YouCoded Dev" window opens. (If `run-dev.sh` doesn't accept that env var, run `cd youcoded.wt/opencode-mvp/desktop && npx vite & npx electron .` from the worktree.)

- [ ] **Step 5: Verify OpenCode daemon started**

In another terminal — **bash**:

```bash
ps aux | grep "opencode serve"
```

Or — **PowerShell**:

```powershell
Get-Process opencode -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, StartTime
```

Expected: an `opencode serve --port <something>` process. If absent, check the dev console (Ctrl+Shift+I) for OpenCode startup errors.

- [ ] **Step 6: Create a Local session**

In the dev window: click "+" → choose **Local** runtime → select `qwen3:8b` from the model dropdown → leave folder default → Create.

Verify:
- New session appears in the strip with `qwen3:8b` in the model pill
- Chat view (not terminal) is shown — view-mode toggle hidden in the header
- Permission-mode badge hidden

- [ ] **Step 7: Send a message and verify streaming**

Type "Hello, what is 2+2?" → Enter.

Verify:
- User bubble appears immediately
- Assistant reply streams in chunk-by-chunk
- Markdown renders correctly

- [ ] **Step 8: Trigger a tool call**

Send "Read the README in this folder and summarize it" (the cwd should be a folder with a README).

Verify:
- A tool card appears for the file read
- Tool result shows the file contents
- Assistant produces a follow-up message summarizing
- Multiple tool/text alternations render correctly

- [ ] **Step 9: Test cancel mid-stream**

Send "Write a 500-word essay about cats." During streaming, click Stop.

Verify:
- Stream halts within ~1 second
- Partial assistant message preserved
- New message can be sent

- [ ] **Step 10: Test persistence across restart**

Close the dev window. Re-launch. Open Resume Browser → Local tab.

Verify:
- The prior session appears with its title
- Click it; full conversation re-loads in chat view (including tool cards)
- Send another message; model has context

- [ ] **Step 11: Verify Claude sessions still work unchanged**

In the same dev window, "+" → Claude runtime → create. Send a message. Verify Claude session experience is unchanged.

- [ ] **Step 12: Shut down**

Close dev window. Verify OpenCode daemon child process is killed (no orphan).

**Bash:**
```bash
ps aux | grep "opencode serve"
```

**PowerShell:**
```powershell
Get-Process opencode -ErrorAction SilentlyContinue
```

Expected: no output / no process. If `opencodeService` doesn't shut down on app quit, hook into Electron's `before-quit` event in `main.ts` to call `opencodeService.stop()`.

- [ ] **Step 13: Commit a final marker**

```bash
git commit --allow-empty -m "chore(opencode): MVP smoke test passed"
```

---

## After Completion

```bash
# Push the feature branch
cd /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp
git push -u origin feat/opencode-mvp

# Open a PR
gh pr create --title "feat: OpenCode-as-provider MVP — local-model coding via Ollama" --body "$(cat <<'EOF'
## Summary
- Adds 'local' SessionProvider backed by OpenCode running headlessly against Ollama
- OpenCode's structured Part events translated to existing TRANSCRIPT_* actions; chat view + tool cards work without modification
- First-run modal installs Ollama, pulls Qwen 3 8B, installs OpenCode binary, writes OpenCode config
- Resume works via OpenCode's SQLite/REST; Local tab in ResumeBrowser

Spec: docs/superpowers/specs/2026-05-04-multi-model-harness-design.md
Plan: docs/superpowers/plans/2026-05-04-opencode-provider-mvp.md
Roadmap alternative (deferred): docs/superpowers/plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md

## Test plan
- [x] Unit tests pass (OllamaDetector, OpenCodeConfigWriter, OpenCodeService, OpenCodeSessionAdapter, SessionManager local branch)
- [x] tsc clean
- [x] End-to-end smoke (Task 14) passed manually
- [ ] Existing Claude session creation unchanged (verified in smoke step 11)
EOF
)"
```

After merge:

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/opencode-mvp/desktop
cmd //c "rmdir node_modules"   # FIRST — git worktree remove follows junctions
cd /c/Users/desti/youcoded-dev/youcoded
git worktree remove ../youcoded.wt/opencode-mvp
git branch -D feat/opencode-mvp
```

---

## Out of MVP Scope (future specs)

- Permission UI integration with OpenCode's permission events (Stage B)
- Skills / MCP UI surfaced in YouCoded settings (Stage C)
- Android local mode (Stage D)
- Vercel AI SDK in-process harness (alternative path: see `docs/superpowers/plans/2026-05-04-vercel-ai-sdk-harness-roadmap.md`)
