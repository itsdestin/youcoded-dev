---
status: shipped
---

# Phase 1 Plan A — Providers + Native Chat Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end native (non-PTY) chat sessions against cloud providers — ProviderRegistry + safeStorage keys + Providers settings panel + HarnessSession v0 (`streamText`, no tools) + `~/.youcoded/sessions/` store with resume — all dormant behind `YOUCODED_NATIVE=1`.

**Architecture:** A new main-process provider layer (`providers/`) wraps the Vercel AI SDK; `NativeSessionHost` (`harness/`) owns `HarnessSession` instances that emit the SAME `transcript-event` protocol the chat reducer already consumes, forwarded through the existing `sendForSession` + remote-broadcast pipe. `SessionManager.createSession` branches on `provider === 'native'` before the PTY worker spawn. Renderer send paths branch per provider: native sessions use `native:send`/`native:interrupt` IPC instead of PTY bytes.

**Tech Stack:** TypeScript (Electron main + React renderer), Vercel AI SDK v7 (`ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`), Electron `safeStorage`, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-10-phase1-engine-providers-design.md` §2 (+ §0–1, §5). Roadmap: `2026-07-09-platform-vision-roadmap.md` Phase 1.

---

## Context primer (read once before any task)

Repo: the `youcoded` sub-repo (`youcoded-dev/youcoded`). Desktop app lives in `desktop/`. **Work in a worktree:**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded.wt/native-sessions -b feat/native-sessions
cd ../youcoded.wt/native-sessions/desktop
cmd //c "mklink /J node_modules ..\\..\\..\\youcoded\\desktop\\node_modules"   # share deps; REMOVE junction (cmd //c "rmdir node_modules") BEFORE any git worktree remove
```

Run tests from `desktop/`: `npx vitest run tests/<file>.test.ts` (single file), `npm test -- --run` (all). Electron is aliased to a mock at `tests/__mocks__/electron.ts` via `vitest.config.ts`.

**Codebase facts every task relies on** (verified 2026-07-10 against master `29ca27a0`+):

1. `desktop/src/shared/types.ts:35` — `export type SessionProvider = 'claude' | 'native';`. `SessionInfo` (lines 37-53) already carries `provider`, `model?`, `initialInput?`. `TranscriptEvent` (85-139) already has `data.partId?` ("emitted by the native harness"), `data.usage?` (`{inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens}`), `data.stopReason?`, `data.model?`. `TranscriptEventType` union at 64-83. The `IPC` constants object is at ~615-860; it already has `NATIVE_SUPPORTED: 'native:supported'` (a reserved constant, no handler — leave it).
2. `desktop/src/main/preload.ts` **inlines its own `const IPC = {...}` copy** — `tests/ipc-channels.test.ts:9-91` regex-extracts both blocks and hard-asserts value equality for shared keys. **Every new constant goes in BOTH files with identical values.** Preload namespace convention (see `syncSpaces` at preload.ts:732-748): `method: (...) => ipcRenderer.invoke(IPC.CONST, ...args)`; push subscriptions return an unsubscribe function.
3. `desktop/src/main/session-manager.ts:44-66` — `createSession(opts: CreateSessionOpts): SessionInfo` is synchronous; the native guard `if (provider !== 'claude') throw` sits right before PTY arg building. Sessions live in `private sessions = new Map<string, ManagedSession>()` where `ManagedSession = { info: SessionInfo; worker: ChildProcess }`. `destroySession` (174) emits `'session-exit', id, 0` and messages the worker. `CreateSessionOpts` at 15-29.
4. Transcript pipe (`ipc-handlers.ts:1688-1713`): `transcriptWatcher.on('transcript-event', e => { sendForSession(e.sessionId, IPC.TRANSCRIPT_EVENT, e); remoteServer?.broadcast({ type: 'transcript:event', payload: e }); })`. Replay: `ipcMain.on(IPC.TRANSCRIPT_REPLAY, (evt, {sessionId}) => { for (const ev of transcriptWatcher.getHistory(sessionId)) evt.sender.send(IPC.TRANSCRIPT_EVENT, ev); })`. `sendForSession` is defined at ipc-handlers.ts:103-128; broadcast-to-all helper `send` at 84-95.
5. Reuse, don't rebuild: `cwdToProjectSlug(cwd)` (exported, `transcript-watcher.ts:24-30`); `mutateFileUnderLock(target, mutate)` and `casWrite` (exported, `src/main/artifacts/cas-write.ts:96,118` — mkdir-lock + atomic tmp-write+rename).
6. Reducer (`src/renderer/state/chat-reducer.ts`): `endTurn(session, errorMessage?)` helper at 163-185 returns a `Partial<SessionChatState>` that resets `attentionState: 'ok'` — `SESSION_PROCESS_EXITED` (378-390) spreads it THEN overrides. `TRANSCRIPT_ASSISTANT_TEXT` (493-521) appends a whole `{type:'text'}` segment per event. `TRANSCRIPT_ASSISTANT_REASONING` (523-559) merges same-`partId` deltas into the LAST segment. `AttentionState` union lives in `shared/types.ts:477-480` (`'ok' | 'stuck' | 'session-died'`).
7. App.tsx transcript switch: `assistant-text` dispatch at 843-856, `assistant-thinking` split on `event.data?.text` at 903-923. `components/buddy/BubbleFeed.tsx` mirrors both (106-124, 178-198). **Any dispatch change lands in BOTH files in the same commit** (documented predicate-parity rule).
8. Send paths are 100% PTY-coupled today: `InputBar.tsx:265-307` (`window.claude.session.sendInput(sessionId, outgoing.ptyText + '\r')`, file-attach `FILE_GAP_MS` timers), `useSubmitConfirmation.ts:131-155` (bare `'\r'` retry), `ModelPickerPopup.tsx` (`/model`, `/fast`, `/effort` slash-command writes; native guard `if (provider === 'native') return null` at 208-213). `buildOutgoingMessage(rawText, filePaths)` in `components/outgoing-message.ts` returns `{ content, ptyText } | null`.
9. SessionStrip (`components/SessionStrip.tsx`): `nativeSupported` computed at 173-176; `Runtime` state exists but `handleCreate` (352-359) hardcodes `'claude'`; the YouCoded selector button is `disabled` (973-995). `onCreateSession(cwd, dangerous, model, provider?, launchInNewWindow?)` prop at line 31.
10. ResumeBrowser lists via `window.claude.session.browse()` → `PastSession[]` (`{sessionId, name, projectSlug, projectPath, lastModified, size, flags?}`); no tabs — filter pills + `renderSessionRow`.
11. Parity test templates in `tests/ipc-channels.test.ts`: mirror `describe('project:* channel parity')` (lines 494-525) for new channels; Android stub template is the combined `when` case in `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3514-3526` (`JSONObject().put("ok", false).put("error", "not-implemented-on-mobile")`, guarded `msg.id?.let`). Kotlin assertions are double-quoted `"chan"`; TS single-quoted.
12. `safeStorage` is NOT yet used anywhere; no `ai`/`@ai-sdk/*` deps installed. Vitest electron mock (`tests/__mocks__/electron.ts`) must gain `safeStorage` + any `app.getPath` your test touches.
13. AI SDK v7 facts (VERIFIED against the installed ai@7.0.22 by Task 1): `fullStream` yields `text-delta`/`reasoning-delta` parts carrying the chunk in **`part.text`** (`{type:'text-delta'; id: string; text: string}`); the `delta` field name belongs to the UIMessageChunk stream and raw provider-level parts — do not conflate. Mock model: `MockLanguageModelV4` from `ai/test` (v7's LanguageModel accepts V2/V3/V4; V4 is current). Usage totals: `result.usage` (`result.totalUsage` is @deprecated in v7). Keep the `deltaText()` accessor from Task 8 anyway so future churn stays in one place.
14. Every non-trivial edit gets a WHY comment (Destin is a non-developer). Commit messages: conventional prefixes, end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**File map (created →/modified ✎):**

| File | Role |
|---|---|
| → `desktop/src/shared/provider-types.ts` | ProviderType/ProviderConfig/ModelBinding/CatalogModel (shared: main + renderer both import) |
| → `desktop/src/shared/harness-manifest.ts` | HarnessManifest type + CHAT_PRESET |
| → `desktop/src/main/native-home.ts` | `~/.youcoded/` paths + locked JSON read/write + JSONL append/read |
| → `desktop/src/main/providers/secrets-store.ts` | safeStorage-encrypted key store in userData |
| → `desktop/src/main/providers/provider-registry.ts` | provider CRUD + `languageModel(binding)` + connection test |
| → `desktop/src/main/providers/model-catalog.ts` | models.dev + OpenRouter merged cached catalog |
| → `desktop/src/main/harness/session-store.ts` | header+events JSONL store, delta coalescing, list/read |
| → `desktop/src/main/harness/harness-session.ts` | streamText loop → transcript-events |
| → `desktop/src/main/harness/native-session-host.ts` | sessionId→HarnessSession registry, persistence, history, browse list |
| → `desktop/src/renderer/components/ProvidersSection.tsx` | Settings → Providers panel |
| ✎ `desktop/src/shared/types.ts` | IPC constants, `'session-error'` event type, `'error'` AttentionState, `usage.tokensPerSecond` |
| ✎ `desktop/src/main/{session-manager,ipc-handlers,preload,remote-server}.ts` | native branch, handlers, namespaces, WS rows |
| ✎ `desktop/src/renderer/{remote-shim.ts,hooks/useIpc.ts}` | shim namespaces + Window types |
| ✎ `desktop/src/renderer/state/{chat-types,chat-reducer}.ts` | text partId merge, NATIVE_SESSION_ERROR, errorMessage |
| ✎ `desktop/src/renderer/App.tsx`, `components/buddy/BubbleFeed.tsx` | partId forward + session-error dispatch (same commit) |
| ✎ `desktop/src/renderer/components/{AttentionBanner,InputBar,SessionStrip,ModelPickerPopup,ResumeBrowser,SettingsPanel}.tsx`, `hooks/useSubmitConfirmation.ts` | native-aware UI + send routing |
| ✎ `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | combined not-implemented stub case |
| ✎ `desktop/tests/ipc-channels.test.ts` | `native:*/provider:*` parity describe |

---

### Task 1: Dependencies + shared types + IPC constants

**Files:**
- Modify: `desktop/package.json` (deps)
- Create: `desktop/src/shared/provider-types.ts`
- Modify: `desktop/src/shared/types.ts` (IPC constants, `session-error`, `error` state, `tokensPerSecond`, `CreateSessionOpts` feed-through comes in Task 9)
- Modify: `desktop/src/main/preload.ts` (inline IPC copy — constants only in this task)
- Test: `desktop/tests/ipc-channels.test.ts` (existing cross-check must stay green)

- [ ] **Step 1: Install deps** (run in the worktree's `desktop/`; junctioned node_modules writes through to the main checkout — that is fine, deps are additive)

```bash
npm install ai @ai-sdk/openai-compatible @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

Expected: `ai@^7`, `@ai-sdk/openai-compatible@^3` land in `package.json`. Then open `node_modules/ai/dist/index.d.ts` and note (in a scratch note for Task 8): the exact `TextStreamPart` delta field name (`text` vs `delta`), the mock helper name exported from `ai/test` (`MockLanguageModelV4` as of ai@7), and whether usage totals come from `result.totalUsage` or `result.usage`.

- [ ] **Step 2: Create `desktop/src/shared/provider-types.ts`** (shared because renderer components type against these too)

```ts
// Provider-layer shapes — Phase 1 Plan A (spec 2026-07-10-phase1-engine-providers-design.md §2.2).
// Shared between main and renderer; keep free of Node/Electron imports.

export type ProviderType =
  | 'local-engine'        // supervised llama-server (registered in Plan B; entry exists from day one)
  | 'openai-compatible'   // Ollama, LM Studio, custom endpoints
  | 'openrouter'
  | 'anthropic' | 'openai' | 'google';

export interface ProviderConfig {
  id: string;             // 'local' | 'openrouter' | ulid for user-created entries
  type: ProviderType;
  label: string;
  baseUrl?: string;       // openai-compatible + overrides
  secretRef?: string;     // pointer into the userData secrets store; never the key itself
  enabled: boolean;
}

/** What a native session is bound to: one model on one provider. */
export interface ModelBinding { providerId: string; modelId: string; }

export interface CatalogModel {
  id: string;             // provider-native model id (what the API expects)
  providerId: string;
  label: string;
  contextLength?: number;
  supportsTools?: boolean;
  supportsReasoning?: boolean;
  pricing?: { in: number; out: number };  // USD per 1M tokens
}

/** provider:list row — config + derived status, never the key. */
export interface ProviderStatus extends ProviderConfig {
  builtIn: boolean;       // 'local' and 'openrouter' cannot be removed
  hasKey: boolean;        // a secret exists for secretRef
  ready: boolean;         // enabled AND (keyless type OR hasKey); 'local' stays false until Plan B
}
```

- [ ] **Step 3: Extend `desktop/src/shared/types.ts`** — four edits:

(a) `TranscriptEventType` union (lines 64-83): add one member with a WHY comment:

```ts
  | 'user-interrupt'
  // Native-runtime only: a provider/stream failure ended the turn. Carries the
  // human-readable message in data.text. Never emitted by CC's transcript
  // watcher and never persisted to the native session store (stale on resume).
  | 'session-error';
```

(b) `AttentionState` union (lines 477-480): add `'error'` WITH its writer documented (the PITFALLS rule — a state may only exist if something dispatches it; the writer is Task 11's `NATIVE_SESSION_ERROR`):

```ts
export type AttentionState =
  | 'ok'              // Default — indicator renders if isThinking
  | 'stuck'           // Spinner glyph stale ≥ 10s OR no spinner ≥ 20s while thinking
  | 'session-died'    // Process exited mid-turn
  // Native-runtime provider/stream failure (dispatcher: NATIVE_SESSION_ERROR,
  // fed by the 'session-error' transcript event). CC sessions never enter it.
  | 'error';
```

(c) `TranscriptEvent.data.usage` (around line 123): widen with the optional native-only field:

```ts
    usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      /** Native runtime only: output tokens / stream seconds. CC never reports this. */
      tokensPerSecond?: number; };
```

(d) `IPC` constants object (after `NATIVE_SUPPORTED: 'native:supported',` at ~line 859):

```ts
  // ---- Native runtime Plan A (Phase 1): session I/O + provider management ----
  NATIVE_SEND: 'native:send',
  NATIVE_INTERRUPT: 'native:interrupt',
  NATIVE_SET_BINDING: 'native:set-binding',
  NATIVE_SESSIONS_LIST: 'native:sessions-list',
  PROVIDER_LIST: 'provider:list',
  PROVIDER_UPSERT: 'provider:upsert',
  PROVIDER_REMOVE: 'provider:remove',
  PROVIDER_TEST: 'provider:test',
  PROVIDER_SET_KEY: 'provider:set-key',
  PROVIDER_CATALOG: 'provider:catalog',
```

- [ ] **Step 4: Mirror the same ten constants into `desktop/src/main/preload.ts`'s inline `const IPC = {...}` block** (same keys, same values, same comment — the ipc-channels test asserts value equality between the two blocks).

- [ ] **Step 5: Verify green**

```bash
npx tsc --noEmit -p .          # from desktop/
npx vitest run tests/ipc-channels.test.ts
```

Expected: PASS (constants exist in both blocks with equal values; no channel assertions exist yet for the new names).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/shared/provider-types.ts src/shared/types.ts src/main/preload.ts
git commit -m "feat(native): AI SDK deps + provider types + native/provider IPC constants"
```

---

### Task 2: NativeHome — `~/.youcoded/` module

**Files:**
- Create: `desktop/src/main/native-home.ts`
- Test: `desktop/tests/native-home.test.ts`

All `~/.youcoded/` I/O goes through this ONE module (spec §2.1 write discipline). It reuses `mutateFileUnderLock` from `artifacts/cas-write.ts` for JSON files and provides plain append for session JSONL (single-writer per session — the host — so no lock needed on append; a WHY comment says so).

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/native-home.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NativeHome } from '../src/main/native-home';

describe('NativeHome', () => {
  let root: string;
  let home: NativeHome;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-native-home-'));
    home = new NativeHome(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('does not create the directory until first write (lazy)', () => {
    expect(fs.existsSync(path.join(root, '.youcoded'))).toBe(false);
    expect(home.readJson('providers.json')).toBeNull();          // read of nothing is null, still no dir
    expect(fs.existsSync(path.join(root, '.youcoded'))).toBe(false);
  });

  it('writeJson round-trips and creates the dir', async () => {
    await home.writeJson('providers.json', { v: 1, providers: [] });
    expect(home.readJson('providers.json')).toEqual({ v: 1, providers: [] });
    expect(fs.existsSync(path.join(root, '.youcoded', 'providers.json'))).toBe(true);
  });

  it('mutateJson applies read-modify-write under the lock', async () => {
    await home.writeJson('providers.json', { v: 1, providers: [] });
    await home.mutateJson('providers.json', (cur: any) => ({ ...cur, providers: [{ id: 'x' }] }));
    expect((home.readJson('providers.json') as any).providers).toHaveLength(1);
  });

  it('appendSessionLine + readSessionLines round-trip under sessions/<slug>/<id>.jsonl', async () => {
    await home.appendSessionLine('my-slug', 'abc', { v: 1, sessionId: 'abc' });
    await home.appendSessionLine('my-slug', 'abc', { type: 'user-message' });
    const lines = home.readSessionLines('my-slug', 'abc');
    expect(lines).toEqual([{ v: 1, sessionId: 'abc' }, { type: 'user-message' }]);
    expect(home.readSessionLines('my-slug', 'missing')).toEqual([]);
  });

  it('listSessionFiles enumerates slug dirs with mtimes', async () => {
    await home.appendSessionLine('slug-a', 's1', { v: 1 });
    const files = home.listSessionFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ slug: 'slug-a', sessionId: 's1' });
    expect(typeof files[0].mtimeMs).toBe('number');
    expect(typeof files[0].sizeBytes).toBe('number');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../src/main/native-home'`): `npx vitest run tests/native-home.test.ts`

- [ ] **Step 3: Implement `desktop/src/main/native-home.ts`**

```ts
// NativeHome — the ONE writer for ~/.youcoded/ (platform roadmap ADR 008).
// All JSON files go through mutateFileUnderLock (dev instance + built app can
// both be running — same cross-process risk the artifact index has). Session
// JSONL appends are single-writer (only NativeSessionHost appends, one process
// owns a live session), so appendFile is safe there.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { mutateFileUnderLock } from './artifacts/cas-write';

export interface SessionFileInfo { slug: string; sessionId: string; mtimeMs: number; sizeBytes: number; path: string; }

export class NativeHome {
  private readonly dir: string;

  /** homeRoot overridable for tests; production callers pass nothing. */
  constructor(homeRoot: string = os.homedir()) {
    this.dir = path.join(homeRoot, '.youcoded');
  }

  get root(): string { return this.dir; }

  readJson(rel: string): unknown | null {
    const p = path.join(this.dir, rel);
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  }

  async writeJson(rel: string, value: unknown): Promise<void> {
    await this.mutateJson(rel, () => value);
  }

  /** Read-modify-write inside the file lock. mutate receives the parsed current value (null if absent). */
  async mutateJson(rel: string, mutate: (current: unknown | null) => unknown): Promise<void> {
    const p = path.join(this.dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true }); // lazy dir creation on first WRITE
    await mutateFileUnderLock(p, (onDisk) => {
      let current: unknown | null = null;
      if (onDisk !== null) { try { current = JSON.parse(onDisk); } catch { current = null; } }
      return JSON.stringify(mutate(current), null, 2);
    });
  }

  private sessionPath(slug: string, sessionId: string): string {
    return path.join(this.dir, 'sessions', slug, `${sessionId}.jsonl`);
  }

  async appendSessionLine(slug: string, sessionId: string, obj: unknown): Promise<void> {
    const p = this.sessionPath(slug, sessionId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await fs.promises.appendFile(p, JSON.stringify(obj) + '\n', 'utf8');
  }

  readSessionLines(slug: string, sessionId: string): unknown[] {
    const p = this.sessionPath(slug, sessionId);
    let raw: string;
    try { raw = fs.readFileSync(p, 'utf8'); } catch { return []; }
    const out: unknown[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* torn tail line mid-write — skip, next append completes it */ }
    }
    return out;
  }

  listSessionFiles(): SessionFileInfo[] {
    const base = path.join(this.dir, 'sessions');
    const out: SessionFileInfo[] = [];
    let slugs: string[] = [];
    try { slugs = fs.readdirSync(base); } catch { return out; }
    for (const slug of slugs) {
      let files: string[] = [];
      try { files = fs.readdirSync(path.join(base, slug)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const full = path.join(base, slug, f);
        try {
          const st = fs.statSync(full);
          out.push({ slug, sessionId: f.slice(0, -'.jsonl'.length), mtimeMs: st.mtimeMs, sizeBytes: st.size, path: full });
        } catch { /* deleted between readdir and stat */ }
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run tests/native-home.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/native-home.ts tests/native-home.test.ts
git commit -m "feat(native): NativeHome — locked ~/.youcoded JSON + session JSONL primitives"
```

---

### Task 3: SecretsStore (safeStorage)

**Files:**
- Create: `desktop/src/main/providers/secrets-store.ts`
- Modify: `desktop/tests/__mocks__/electron.ts` (add `safeStorage` mock)
- Test: `desktop/tests/secrets-store.test.ts`

- [ ] **Step 1: Extend the electron mock.** Open `tests/__mocks__/electron.ts` and add (keeping everything already exported):

```ts
export const safeStorage = {
  isEncryptionAvailable: () => true,
  // Reversible fake "encryption" so tests can assert the plaintext never
  // appears on disk while decrypt still round-trips.
  encryptString: (s: string) => Buffer.from('enc:' + Buffer.from(s, 'utf8').toString('base64'), 'utf8'),
  decryptString: (b: Buffer) => {
    const raw = b.toString('utf8');
    if (!raw.startsWith('enc:')) throw new Error('not encrypted');
    return Buffer.from(raw.slice(4), 'base64').toString('utf8');
  },
};
```

- [ ] **Step 2: Write the failing test**

```ts
// desktop/tests/secrets-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretsStore } from '../src/main/providers/secrets-store';

describe('SecretsStore', () => {
  let dir: string; let store: SecretsStore;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-secrets-')); store = new SecretsStore(dir); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('set/get round-trips a key', async () => {
    const ref = await store.set('sk-test-12345');
    expect(await store.get(ref)).toBe('sk-test-12345');
  });

  it('NEVER writes the plaintext key to disk', async () => {
    await store.set('sk-super-secret-value');
    const raw = fs.readFileSync(path.join(dir, 'native-secrets.json'), 'utf8');
    expect(raw).not.toContain('sk-super-secret-value');
  });

  it('delete removes the entry; get of missing ref is null', async () => {
    const ref = await store.set('sk-x');
    await store.delete(ref);
    expect(await store.get(ref)).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (module not found): `npx vitest run tests/secrets-store.test.ts`

- [ ] **Step 4: Implement `desktop/src/main/providers/secrets-store.ts`**

```ts
// API keys at rest: safeStorage(OS keychain)-encrypted blobs in userData —
// NOT in ~/.youcoded (machine-bound ciphertext must never enter a syncable
// home; spec §2.1). providers.json only ever holds the secretRef pointer.
import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';
import { ulid } from 'ulid';
import { mutateFileUnderLock } from '../artifacts/cas-write';

const FILE = 'native-secrets.json';

export class SecretsStore {
  private readonly file: string;
  constructor(userDataDir: string) { this.file = path.join(userDataDir, FILE); }

  /** Throws with a user-showable message when the OS keychain is unavailable
   *  (rare Linux setups) — we refuse plaintext fallback by design. */
  private assertAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure key storage is not available on this system, so YouCoded cannot save API keys. (Your OS keychain/libsecret is required.)');
    }
  }

  private read(): Record<string, string> {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }

  async set(plaintext: string, existingRef?: string): Promise<string> {
    this.assertAvailable();
    const ref = existingRef ?? ulid();
    const blob = safeStorage.encryptString(plaintext).toString('base64');
    await mutateFileUnderLock(this.file, (onDisk) => {
      let cur: Record<string, string> = {};
      if (onDisk) { try { cur = JSON.parse(onDisk); } catch { cur = {}; } }
      cur[ref] = blob;
      return JSON.stringify(cur, null, 2);
    });
    return ref;
  }

  async get(ref: string): Promise<string | null> {
    const blob = this.read()[ref];
    if (!blob) return null;
    try { return safeStorage.decryptString(Buffer.from(blob, 'base64')); } catch { return null; }
  }

  async delete(ref: string): Promise<void> {
    await mutateFileUnderLock(this.file, (onDisk) => {
      let cur: Record<string, string> = {};
      if (onDisk) { try { cur = JSON.parse(onDisk); } catch { cur = {}; } }
      delete cur[ref];
      return JSON.stringify(cur, null, 2);
    });
  }

  has(ref: string | undefined): boolean { return !!ref && !!this.read()[ref]; }
}
```

- [ ] **Step 5: Run — expect PASS**, then commit:

```bash
git add src/main/providers/secrets-store.ts tests/secrets-store.test.ts tests/__mocks__/electron.ts
git commit -m "feat(native): SecretsStore — safeStorage-encrypted API keys in userData"
```

---

### Task 4: ProviderRegistry

**Files:**
- Create: `desktop/src/main/providers/provider-registry.ts`
- Test: `desktop/tests/provider-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/provider-registry.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs'; import * as path from 'path'; import * as os from 'os';
import { NativeHome } from '../src/main/native-home';
import { SecretsStore } from '../src/main/providers/secrets-store';
import { ProviderRegistry } from '../src/main/providers/provider-registry';

describe('ProviderRegistry', () => {
  let root: string; let reg: ProviderRegistry;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-provreg-'));
    reg = new ProviderRegistry(new NativeHome(root), new SecretsStore(root));
    await reg.init();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('seeds the two built-ins on first init and is idempotent', async () => {
    const list = await reg.list();
    expect(list.map((p) => p.id).sort()).toEqual(['local', 'openrouter']);
    expect(list.every((p) => p.builtIn)).toBe(true);
    await reg.init(); // second init must not duplicate
    expect((await reg.list())).toHaveLength(2);
  });

  it('local is not ready in Plan A; openrouter becomes ready once a key is set', async () => {
    let list = await reg.list();
    expect(list.find((p) => p.id === 'local')!.ready).toBe(false);
    expect(list.find((p) => p.id === 'openrouter')!.ready).toBe(false);
    await reg.setKey('openrouter', 'sk-or-abc');
    list = await reg.list();
    expect(list.find((p) => p.id === 'openrouter')!.ready).toBe(true);
  });

  it('refuses to remove built-ins; removes user entries and their secret', async () => {
    await expect(reg.remove('openrouter')).rejects.toThrow(/built-in/);
    const id = await reg.upsert({ type: 'openai-compatible', label: 'My LM Studio', baseUrl: 'http://localhost:1234/v1', enabled: true });
    await reg.setKey(id, 'whatever');
    await reg.remove(id);
    expect((await reg.list()).find((p) => p.id === id)).toBeUndefined();
  });

  it('list() never exposes key material', async () => {
    await reg.setKey('openrouter', 'sk-or-secret');
    const json = JSON.stringify(await reg.list());
    expect(json).not.toContain('sk-or-secret');
  });

  it('languageModel() throws a plain-language error for an unready provider', async () => {
    await expect(reg.languageModel({ providerId: 'openrouter', modelId: 'meta-llama/llama-3-8b' }))
      .rejects.toThrow(/key/i);
    await expect(reg.languageModel({ providerId: 'local', modelId: 'x' }))
      .rejects.toThrow(/not available yet/i);
  });

  it('languageModel() returns an AI SDK handle for a keyed openrouter binding', async () => {
    await reg.setKey('openrouter', 'sk-or-abc');
    const model = await reg.languageModel({ providerId: 'openrouter', modelId: 'meta-llama/llama-3-8b' });
    expect(model).toBeTruthy();
    expect(typeof (model as any).modelId).toBe('string');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run tests/provider-registry.test.ts`

- [ ] **Step 3: Implement `desktop/src/main/providers/provider-registry.ts`**

```ts
// ProviderRegistry — CRUD over ~/.youcoded/providers.json + key management +
// the ONE factory the harness calls: languageModel(binding) -> AI SDK handle.
// (Spec §2.2. providers.json never holds keys — only secretRef pointers.)
import { ulid } from 'ulid';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderConfig, ProviderStatus, ModelBinding } from '../../shared/provider-types';
import { NativeHome } from '../native-home';
import { SecretsStore } from './secrets-store';

const FILE = 'providers.json';
const BUILT_INS: ProviderConfig[] = [
  // 'local' exists from day one so the Providers panel can show it as
  // "coming with the local engine" — Plan B flips it ready.
  { id: 'local', type: 'local-engine', label: 'Local models (llama.cpp)', enabled: true },
  { id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true },
];
// OpenRouter asks apps to identify themselves (provider-dependencies.md entry).
const OPENROUTER_HEADERS = { 'HTTP-Referer': 'https://youcoded.app', 'X-Title': 'YouCoded' };

interface ProvidersFile { v: 1; providers: ProviderConfig[]; }

export class ProviderRegistry {
  constructor(private home: NativeHome, private secrets: SecretsStore,
              /** Plan B injects the engine's baseUrl here; Plan A leaves it null. */
              private localBaseUrl: () => string | null = () => null) {}

  async init(): Promise<void> {
    await this.home.mutateJson(FILE, (cur) => {
      const file = (cur as ProvidersFile | null) ?? { v: 1 as const, providers: [] };
      for (const b of BUILT_INS) {
        if (!file.providers.some((p) => p.id === b.id)) file.providers.push({ ...b });
      }
      return file;
    });
  }

  private readAll(): ProviderConfig[] {
    return ((this.home.readJson(FILE) as ProvidersFile | null)?.providers) ?? [];
  }

  async list(): Promise<ProviderStatus[]> {
    return this.readAll().map((p) => {
      const builtIn = BUILT_INS.some((b) => b.id === p.id);
      const hasKey = this.secrets.has(p.secretRef);
      const keyless = p.type === 'local-engine' || (p.type === 'openai-compatible' && !p.secretRef);
      const ready = p.enabled && (p.type === 'local-engine' ? this.localBaseUrl() !== null : (keyless || hasKey));
      return { ...p, builtIn, hasKey, ready };
    });
  }

  async upsert(input: Omit<ProviderConfig, 'id'> & { id?: string }): Promise<string> {
    const id = input.id ?? ulid();
    await this.home.mutateJson(FILE, (cur) => {
      const file = (cur as ProvidersFile | null) ?? { v: 1 as const, providers: [] };
      const idx = file.providers.findIndex((p) => p.id === id);
      const existing = idx >= 0 ? file.providers[idx] : undefined;
      const next: ProviderConfig = { ...existing, ...input, id } as ProviderConfig;
      if (idx >= 0) file.providers[idx] = next; else file.providers.push(next);
      return file;
    });
    return id;
  }

  async remove(id: string): Promise<void> {
    if (BUILT_INS.some((b) => b.id === id)) throw new Error(`'${id}' is a built-in provider and cannot be removed.`);
    const entry = this.readAll().find((p) => p.id === id);
    if (entry?.secretRef) await this.secrets.delete(entry.secretRef);
    await this.home.mutateJson(FILE, (cur) => {
      const file = (cur as ProvidersFile | null) ?? { v: 1 as const, providers: [] };
      file.providers = file.providers.filter((p) => p.id !== id);
      return file;
    });
  }

  async setKey(id: string, plaintext: string): Promise<void> {
    const entry = this.readAll().find((p) => p.id === id);
    if (!entry) throw new Error(`Unknown provider '${id}'.`);
    const ref = await this.secrets.set(plaintext, entry.secretRef);
    await this.upsert({ ...entry, secretRef: ref });
  }

  private async keyFor(p: ProviderConfig): Promise<string | undefined> {
    if (!p.secretRef) return undefined;
    return (await this.secrets.get(p.secretRef)) ?? undefined;
  }

  /** THE factory (spec §2.2). Throws plain-language errors — they surface in the error banner. */
  async languageModel(binding: ModelBinding): Promise<LanguageModel> {
    const p = this.readAll().find((x) => x.id === binding.providerId);
    if (!p) throw new Error(`Provider '${binding.providerId}' is not configured.`);
    if (!p.enabled) throw new Error(`${p.label} is disabled in Settings → Providers.`);
    switch (p.type) {
      case 'local-engine': {
        const base = this.localBaseUrl();
        if (!base) throw new Error('Local models are not available yet — the local engine ships in a later update.');
        return createOpenAICompatible({ name: 'local', baseURL: base })(binding.modelId);
      }
      case 'openrouter': {
        const apiKey = await this.keyFor(p);
        if (!apiKey) throw new Error('OpenRouter needs an API key — add one in Settings → Providers.');
        return createOpenAICompatible({ name: 'openrouter', baseURL: p.baseUrl ?? 'https://openrouter.ai/api/v1', apiKey, headers: OPENROUTER_HEADERS })(binding.modelId);
      }
      case 'openai-compatible': {
        if (!p.baseUrl) throw new Error(`${p.label} has no endpoint URL configured.`);
        return createOpenAICompatible({ name: p.id, baseURL: p.baseUrl, apiKey: await this.keyFor(p) })(binding.modelId);
      }
      case 'anthropic': {
        const apiKey = await this.keyFor(p);
        if (!apiKey) throw new Error(`${p.label} needs an API key — add one in Settings → Providers.`);
        return createAnthropic({ apiKey })(binding.modelId);
      }
      case 'openai': {
        const apiKey = await this.keyFor(p);
        if (!apiKey) throw new Error(`${p.label} needs an API key — add one in Settings → Providers.`);
        return createOpenAI({ apiKey })(binding.modelId);
      }
      case 'google': {
        const apiKey = await this.keyFor(p);
        if (!apiKey) throw new Error(`${p.label} needs an API key — add one in Settings → Providers.`);
        return createGoogleGenerativeAI({ apiKey })(binding.modelId);
      }
    }
  }

  /** Connection test: cheapest real call per type (spec §2.2) — a models-list
   *  fetch where the API has one, else a 1-token completion via streamText is
   *  overkill; we use fetch directly to keep this dependency-light. */
  async testConnection(id: string): Promise<{ ok: boolean; message: string }> {
    const p = this.readAll().find((x) => x.id === id);
    if (!p) return { ok: false, message: 'Provider not found.' };
    try {
      switch (p.type) {
        case 'local-engine': {
          const base = this.localBaseUrl();
          if (!base) return { ok: false, message: 'The local engine is not installed yet.' };
          return await this.probe(`${base}/models`, {});
        }
        case 'openrouter':
          return await this.probe(`${p.baseUrl ?? 'https://openrouter.ai/api/v1'}/models`, { Authorization: `Bearer ${await this.keyFor(p) ?? ''}` });
        case 'openai-compatible':
          return await this.probe(`${p.baseUrl}/models`, p.secretRef ? { Authorization: `Bearer ${await this.keyFor(p) ?? ''}` } : {});
        case 'anthropic':
          return await this.probe('https://api.anthropic.com/v1/models', { 'x-api-key': await this.keyFor(p) ?? '', 'anthropic-version': '2023-06-01' });
        case 'openai':
          return await this.probe('https://api.openai.com/v1/models', { Authorization: `Bearer ${await this.keyFor(p) ?? ''}` });
        case 'google':
          return await this.probe(`https://generativelanguage.googleapis.com/v1beta/models?key=${await this.keyFor(p) ?? ''}`, {});
      }
    } catch (e: any) {
      return { ok: false, message: `Could not reach ${p.label}: ${e?.message ?? 'network error'}` };
    }
  }

  private async probe(url: string, headers: Record<string, string>): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true, message: 'Connected.' };
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'The API key was rejected — check it and try again.' };
    return { ok: false, message: `The provider responded with HTTP ${res.status}.` };
  }
}
```

- [ ] **Step 4: Run — expect PASS**, then commit:

```bash
git add src/main/providers/provider-registry.ts tests/provider-registry.test.ts
git commit -m "feat(native): ProviderRegistry — CRUD, keys, connection tests, languageModel factory"
```

---

### Task 5: ModelCatalog (models.dev + OpenRouter, cached)

**Files:**
- Create: `desktop/src/main/providers/model-catalog.ts`
- Test: `desktop/tests/model-catalog.test.ts`

- [ ] **Step 1: Write the failing test** (fetch injected — no network in tests)

```ts
// desktop/tests/model-catalog.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs'; import * as path from 'path'; import * as os from 'os';
import { ModelCatalog } from '../src/main/providers/model-catalog';

const OPENROUTER_PAYLOAD = { data: [
  { id: 'meta-llama/llama-3-8b', name: 'Llama 3 8B', context_length: 8192, pricing: { prompt: '0.00000005', completion: '0.0000001' } },
] };
// models.dev api.json: { [providerKey]: { models: { [modelKey]: {...} } } } —
// exact schema recorded in provider-dependencies.md; parse defensively.
const MODELSDEV_PAYLOAD = { anthropic: { models: {
  'claude-sonnet-5': { name: 'Claude Sonnet 5', limit: { context: 200000 }, tool_call: true, reasoning: true,
    cost: { input: 3, output: 15 } },
} } };

describe('ModelCatalog', () => {
  let dir: string; let fetchMock: any; let cat: ModelCatalog;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-'));
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('openrouter') ? OPENROUTER_PAYLOAD : MODELSDEV_PAYLOAD,
    }));
    cat = new ModelCatalog(dir, fetchMock);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('merges OpenRouter + models.dev into CatalogModel rows scoped to enabled providers', async () => {
    const models = await cat.get([
      { id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true, builtIn: true, hasKey: true, ready: true },
      { id: 'anth1', type: 'anthropic', label: 'Anthropic', enabled: true, builtIn: false, hasKey: true, ready: true },
    ] as any);
    const or = models.find((m) => m.providerId === 'openrouter');
    expect(or).toMatchObject({ id: 'meta-llama/llama-3-8b', contextLength: 8192 });
    const an = models.find((m) => m.providerId === 'anth1');
    expect(an).toMatchObject({ id: 'claude-sonnet-5', contextLength: 200000, supportsTools: true });
  });

  it('serves from disk cache within TTL (single fetch pair across two calls)', async () => {
    const providers = [{ id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true, builtIn: true, hasKey: true, ready: true }] as any;
    await cat.get(providers);
    const callsAfterFirst = fetchMock.mock.calls.length;
    await cat.get(providers);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // cache hit — no new fetches
  });

  it('a failed fetch falls back to stale cache instead of throwing', async () => {
    const providers = [{ id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true, builtIn: true, hasKey: true, ready: true }] as any;
    await cat.get(providers);                    // primes cache
    (cat as any).ttlMs = -1;                     // force expiry
    fetchMock.mockRejectedValue(new Error('offline'));
    const models = await cat.get(providers);
    expect(models.length).toBeGreaterThan(0);    // stale data served
  });

  it('contextLengthFor answers from the merged catalog', async () => {
    const providers = [{ id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true, builtIn: true, hasKey: true, ready: true }] as any;
    await cat.get(providers);
    expect(await cat.contextLengthFor({ providerId: 'openrouter', modelId: 'meta-llama/llama-3-8b' }, providers)).toBe(8192);
    expect(await cat.contextLengthFor({ providerId: 'openrouter', modelId: 'unknown' }, providers)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `desktop/src/main/providers/model-catalog.ts`:

```ts
// Merged, disk-cached model catalog (spec §2.2): OpenRouter /api/v1/models for
// the openrouter provider; models.dev api.json metadata for direct-key
// providers (anthropic/openai/google). openai-compatible custom endpoints get
// no catalog in Plan A (users type a model id). External schemas are recorded
// in docs/provider-dependencies.md — parse DEFENSIVELY; absent fields are
// omitted, never guessed.
import * as fs from 'fs';
import * as path from 'path';
import type { CatalogModel, ModelBinding, ProviderStatus } from '../../shared/provider-types';

const CACHE_FILE = 'provider-catalog-cache.json';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h, marketplace-cache precedent

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;
interface CacheShape { fetchedAt: number; openrouter: any | null; modelsdev: any | null; }

// models.dev provider keys for our direct-key ProviderTypes.
const MODELSDEV_KEY: Record<string, string> = { anthropic: 'anthropic', openai: 'openai', google: 'google' };

export class ModelCatalog {
  private ttlMs = TTL_MS;
  private readonly cachePath: string;
  constructor(cacheDir: string, private fetchImpl: FetchLike = fetch as any) {
    this.cachePath = path.join(cacheDir, CACHE_FILE);
  }

  private readCache(): CacheShape | null {
    try { return JSON.parse(fs.readFileSync(this.cachePath, 'utf8')); } catch { return null; }
  }

  private async ensureFresh(): Promise<CacheShape> {
    const cached = this.readCache();
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) return cached;
    try {
      const [orRes, mdRes] = await Promise.all([
        this.fetchImpl('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15_000) }),
        this.fetchImpl('https://models.dev/api.json', { signal: AbortSignal.timeout(15_000) }),
      ]);
      const fresh: CacheShape = {
        fetchedAt: Date.now(),
        openrouter: orRes.ok ? await orRes.json() : cached?.openrouter ?? null,
        modelsdev: mdRes.ok ? await mdRes.json() : cached?.modelsdev ?? null,
      };
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(fresh));
      return fresh;
    } catch {
      // Offline: stale beats empty — the picker keeps working from old data.
      if (cached) return cached;
      return { fetchedAt: 0, openrouter: null, modelsdev: null };
    }
  }

  async get(providers: ProviderStatus[]): Promise<CatalogModel[]> {
    const data = await this.ensureFresh();
    const out: CatalogModel[] = [];
    for (const p of providers) {
      if (!p.enabled) continue;
      if (p.type === 'openrouter' && data.openrouter?.data) {
        for (const m of data.openrouter.data) {
          if (!m?.id) continue;
          out.push({
            id: m.id, providerId: p.id, label: m.name ?? m.id,
            contextLength: typeof m.context_length === 'number' ? m.context_length : undefined,
            supportsTools: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('tools') : undefined,
            pricing: m.pricing ? { in: Number(m.pricing.prompt) * 1_000_000, out: Number(m.pricing.completion) * 1_000_000 } : undefined,
          });
        }
      }
      const mdKey = MODELSDEV_KEY[p.type];
      if (mdKey && data.modelsdev?.[mdKey]?.models) {
        for (const [modelId, m] of Object.entries<any>(data.modelsdev[mdKey].models)) {
          out.push({
            id: modelId, providerId: p.id, label: m?.name ?? modelId,
            contextLength: typeof m?.limit?.context === 'number' ? m.limit.context : undefined,
            supportsTools: typeof m?.tool_call === 'boolean' ? m.tool_call : undefined,
            supportsReasoning: typeof m?.reasoning === 'boolean' ? m.reasoning : undefined,
            pricing: (m?.cost && typeof m.cost.input === 'number') ? { in: m.cost.input, out: m.cost.output } : undefined,
          });
        }
      }
    }
    return out;
  }

  async contextLengthFor(binding: ModelBinding, providers: ProviderStatus[]): Promise<number | null> {
    const models = await this.get(providers);
    return models.find((m) => m.providerId === binding.providerId && m.id === binding.modelId)?.contextLength ?? null;
  }
}
```

- [ ] **Step 3: Run — expect PASS**, then commit:

```bash
git add src/main/providers/model-catalog.ts tests/model-catalog.test.ts
git commit -m "feat(native): ModelCatalog — models.dev + OpenRouter merge with 24h disk cache"
```

---

### Task 6: HarnessManifest + Chat preset

**Files:**
- Create: `desktop/src/shared/harness-manifest.ts`
- Test: covered by tsc + Task 8's session tests (no standalone behavior)

- [ ] **Step 1: Create `desktop/src/shared/harness-manifest.ts`** (Phase 0 spec §2 shape, verbatim; plus the one preset Plan A ships)

```ts
// The shareable harness unit (Phase 0 spec §2; marketplace item kind 'harness'
// arrives in Phase 3). Plan A ships exactly ONE built-in preset (Chat) and no
// preset picker — the picker appears in Phase 2 when the preset family exists.
import type { ModelBinding } from './provider-types';

export interface HarnessManifest {
  schema: 1;
  id: string; name: string; description?: string;
  systemPrompt: string;
  tools: string[];                       // CC-compatible names (ADR 009); empty in Plan A
  permissionPolicy: 'ask' | 'auto-edit' | 'full-auto' | Record<string, 'allow' | 'ask' | 'deny'>;
  defaultBinding?: ModelBinding;
  skills?: string[]; mcp?: string[];     // opt-in subsets; empty = none
  limits?: { maxSteps?: number; maxTokens?: number };
}

export const CHAT_PRESET: HarnessManifest = {
  schema: 1,
  id: 'chat',
  name: 'Chat',
  description: 'Plain conversation — no tools or file access. Tools arrive in a later update.',
  systemPrompt:
    'You are a helpful assistant inside YouCoded, a personal AI app. '
    + 'Answer conversationally and format with Markdown when it helps. '
    + 'You cannot read files, run commands, or browse — if asked, say those abilities are coming in a later update.',
  tools: [],
  permissionPolicy: 'ask',
  limits: { maxTokens: 4096 },
};
```

- [ ] **Step 2: `npx tsc --noEmit -p .` — expect PASS. Commit:**

```bash
git add src/shared/harness-manifest.ts
git commit -m "feat(native): HarnessManifest type + built-in Chat preset"
```

---

### Task 7: Session store (JSONL header + coalesced events)

**Files:**
- Create: `desktop/src/main/harness/session-store.ts`
- Test: `desktop/tests/session-store.test.ts`

**Design note (deviation worth its comment):** the spec says events persist "exactly as emitted," but persisting every per-token delta line would bloat files ~50×. The store therefore COALESCES same-`partId` `assistant-text` / `assistant-thinking` deltas into one event per part at flush time — replaying the coalesced event through the reducer produces the identical merged segment (same content, same partId), which the round-trip test pins. `session-error` events are never persisted (a stale error banner on resume would be wrong).

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/session-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs'; import * as path from 'path'; import * as os from 'os';
import { NativeHome } from '../src/main/native-home';
import { SessionStore, type NativeSessionHeader } from '../src/main/harness/session-store';

const HEADER: NativeSessionHeader = {
  v: 1, sessionId: 's-1', harnessId: 'chat',
  binding: { providerId: 'openrouter', modelId: 'meta-llama/llama-3-8b' },
  cwd: 'C:/Users/x/proj', createdAt: 1720600000000,
};
const ev = (type: string, data: any, uuid: string) => ({ type, sessionId: 's-1', uuid, timestamp: 1720600001000, data });

describe('SessionStore', () => {
  let root: string; let store: SessionStore;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-sstore-')); store = new SessionStore(new NativeHome(root)); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('create writes the header as line 1; readHeader round-trips', async () => {
    await store.create(HEADER);
    expect(store.readHeader('s-1', HEADER.cwd)).toEqual(HEADER);
  });

  it('coalesces same-partId text deltas into ONE persisted event with concatenated text', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('user-message', { text: 'hi' }, 'u1'));
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'Hel', partId: 'p1' }, 'a1'));
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'lo!', partId: 'p1' }, 'a2'));
    await store.append(HEADER.cwd, ev('turn-complete', { stopReason: 'end_turn' }, 't1'));  // flushes the open part
    const events = store.readEvents('s-1', HEADER.cwd);
    expect(events.map((e: any) => e.type)).toEqual(['user-message', 'assistant-text', 'turn-complete']);
    expect((events[1] as any).data).toMatchObject({ text: 'Hello!', partId: 'p1' });
  });

  it('never persists session-error events', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('session-error', { text: 'boom' }, 'e1'));
    expect(store.readEvents('s-1', HEADER.cwd)).toEqual([]);
  });

  it('a new partId flushes the previous open part', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('assistant-thinking', { text: 'thi', partId: 'r1' }, 'r1a'));
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'Answer', partId: 'p1' }, 'a1'));
    await store.append(HEADER.cwd, ev('turn-complete', {}, 't1'));
    const types = store.readEvents('s-1', HEADER.cwd).map((e: any) => e.type);
    expect(types).toEqual(['assistant-thinking', 'assistant-text', 'turn-complete']);
  });

  it('list surfaces sessions with header metadata for the Resume Browser', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('user-message', { text: 'hi' }, 'u1'));
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sessionId: 's-1', cwd: 'C:/Users/x/proj', harnessId: 'chat' });
  });

  it('derives a title from the first user message when the header has none', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('user-message', { text: 'explain quantum tunneling to me' }, 'u1'));
    expect(store.list()[0].title).toBe('explain quantum tunneling to me');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `desktop/src/main/harness/session-store.ts`:

```ts
// Native session persistence (Phase 0 spec §3): line 1 = header, lines 2+ =
// transcript events. Streaming deltas are coalesced per partId before hitting
// disk (one event per part — identical reducer state on replay, ~50x smaller
// files). 'session-error' is display-only and never persisted.
import type { TranscriptEvent } from '../../shared/types';
import type { ModelBinding } from '../../shared/provider-types';
import { cwdToProjectSlug } from '../transcript-watcher';
import { NativeHome, type SessionFileInfo } from '../native-home';

export interface NativeSessionHeader {
  v: 1; sessionId: string; harnessId: string; binding: ModelBinding;
  cwd: string; createdAt: number; title?: string;
}
export interface NativeSessionListEntry extends NativeSessionHeader { mtimeMs: number; sizeBytes: number; slug: string; }

const COALESCED_TYPES = new Set(['assistant-text', 'assistant-thinking']);

export class SessionStore {
  // One open (still-streaming) part per session, buffered until flushed by a
  // different partId, a non-delta event, or a turn boundary.
  private open = new Map<string, TranscriptEvent>();

  constructor(private home: NativeHome) {}

  async create(header: NativeSessionHeader): Promise<void> {
    await this.home.appendSessionLine(cwdToProjectSlug(header.cwd), header.sessionId, header);
  }

  async append(cwd: string, event: TranscriptEvent): Promise<void> {
    if (event.type === 'session-error') return; // display-only
    const slug = cwdToProjectSlug(cwd);
    const key = event.sessionId;
    const openPart = this.open.get(key);

    if (COALESCED_TYPES.has(event.type) && event.data.partId) {
      if (openPart && openPart.type === event.type && openPart.data.partId === event.data.partId) {
        openPart.data.text = (openPart.data.text ?? '') + (event.data.text ?? '');
        return;
      }
      if (openPart) await this.flush(slug, key);
      // Clone so the caller's object stays untouched while we accumulate.
      this.open.set(key, { ...event, data: { ...event.data } });
      return;
    }

    if (openPart) await this.flush(slug, key);
    await this.home.appendSessionLine(slug, key, event);
  }

  private async flush(slug: string, sessionId: string): Promise<void> {
    const part = this.open.get(sessionId);
    if (!part) return;
    this.open.delete(sessionId);
    await this.home.appendSessionLine(slug, sessionId, part);
  }

  readHeader(sessionId: string, cwd: string): NativeSessionHeader | null {
    const lines = this.home.readSessionLines(cwdToProjectSlug(cwd), sessionId);
    const head = lines[0] as NativeSessionHeader | undefined;
    return head && head.v === 1 && head.sessionId ? head : null;
  }

  readEvents(sessionId: string, cwd: string): TranscriptEvent[] {
    const lines = this.home.readSessionLines(cwdToProjectSlug(cwd), sessionId);
    // uuid-dedup on read: torn writes or a future double-append never produce
    // duplicate reducer entries (the reducer itself does NOT dedup).
    const seen = new Set<string>();
    const out: TranscriptEvent[] = [];
    for (const line of lines.slice(1)) {
      const ev = line as TranscriptEvent;
      if (!ev?.type || (ev.uuid && seen.has(ev.uuid))) continue;
      if (ev.uuid) seen.add(ev.uuid);
      out.push(ev);
    }
    return out;
  }

  list(): NativeSessionListEntry[] {
    const out: NativeSessionListEntry[] = [];
    for (const f of this.home.listSessionFiles()) {
      const lines = this.home.readSessionLines(f.slug, f.sessionId);
      const head = lines[0] as NativeSessionHeader | undefined;
      if (!head || head.v !== 1) continue;
      // Title precedence (spec §2.6): explicit header title, else derive from
      // the first user message — native sessions have no CC auto-title hook.
      let title = head.title;
      if (!title) {
        const firstUser = lines.slice(1).find((l: any) => l?.type === 'user-message' && l?.data?.text) as any;
        if (firstUser) title = String(firstUser.data.text).slice(0, 60);
      }
      out.push({ ...head, title, mtimeMs: f.mtimeMs, sizeBytes: f.sizeBytes, slug: f.slug });
    }
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }
}
```

- [ ] **Step 3: Run — expect PASS.** Note: importing `cwdToProjectSlug` from `transcript-watcher` pulls that module into the test graph; if its import-time side effects break the test, move `cwdToProjectSlug` into a new tiny `src/main/cwd-slug.ts` and re-export from transcript-watcher (keeping all existing imports working) — do that refactor rather than duplicating the function.

- [ ] **Step 4: Commit**

```bash
git add src/main/harness/session-store.ts tests/session-store.test.ts
git commit -m "feat(native): SessionStore — header+events JSONL with partId coalescing"
```

---

### Task 8: HarnessSession v0 (streamText loop)

**Files:**
- Create: `desktop/src/main/harness/harness-session.ts`
- Test: `desktop/tests/harness-session.test.ts`

**AI SDK note (Context primer #13):** before coding, open `node_modules/ai/dist/index.d.ts` and confirm (a) the delta field on `text-delta`/`reasoning-delta` stream parts, (b) the mock model class exported from `ai/test`, (c) usage totals accessor. The code below targets the VERIFIED v7 shape (`part.text` on fullStream parts, `MockLanguageModelV4`, `result.usage`) — re-confirm against the installed reality, keep the `deltaText()` accessor so churn stays in one place.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/harness-session.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HarnessSession } from '../src/main/harness/harness-session';
import { CHAT_PRESET } from '../src/shared/harness-manifest';
import type { TranscriptEvent } from '../src/shared/types';

// Minimal fake AI-SDK model: emits reasoning + text deltas then finishes.
// Uses the ai/test mock helper — adapt the class name to the installed SDK
// (check node_modules/ai/test.d.ts): MockLanguageModelV4 as of ai@7.
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

function mockModel(parts: any[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: parts }),
    }),
  });
}

const TEXT_FINISH = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 'p1' },
  { type: 'text-delta', id: 'p1', delta: 'Hel' },
  { type: 'text-delta', id: 'p1', delta: 'lo!' },
  { type: 'text-end', id: 'p1' },
  { type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 } },
];

function collect(session: HarnessSession): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  session.on('transcript-event', (e: TranscriptEvent) => events.push(e));
  return events;
}

describe('HarnessSession', () => {
  const opts = { sessionId: 's-1', cwd: 'C:/x', harness: CHAT_PRESET, binding: { providerId: 'openrouter', modelId: 'm' } };

  it('send() emits user-message, merged-partId assistant-text deltas, and turn-complete with usage', async () => {
    const session = new HarnessSession(opts, async () => mockModel(TEXT_FINISH) as any);
    const events = collect(session);
    await session.send('hi');
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('user-message');
    expect(events[0].data.text).toBe('hi');
    const textEvents = events.filter((e) => e.type === 'assistant-text');
    expect(textEvents.length).toBeGreaterThanOrEqual(2);            // streamed as deltas, not one block
    expect(textEvents.every((e) => e.data.partId)).toBe(true);      // every delta carries the partId
    expect(textEvents.map((e) => e.data.text).join('')).toBe('Hello!');
    const done = events.find((e) => e.type === 'turn-complete')!;
    expect(done.data.usage).toMatchObject({ inputTokens: 12, outputTokens: 4 });
    expect(done.data.model).toBe('m');
    expect(typeof done.data.usage!.tokensPerSecond).toBe('number');
    expect(done.data.stopReason).toBe('end_turn');                  // 'stop' maps to CC's normal-completion name
  });

  it('a factory/stream failure emits session-error (never a hang) and ends the turn', async () => {
    const session = new HarnessSession(opts, async () => { throw new Error('OpenRouter needs an API key — add one in Settings → Providers.'); });
    const events = collect(session);
    await session.send('hi');
    const err = events.find((e) => e.type === 'session-error')!;
    expect(err.data.text).toMatch(/API key/);
    expect(events.find((e) => e.type === 'turn-complete')).toBeUndefined();
  });

  it('interrupt() aborts and emits user-interrupt instead of session-error', async () => {
    // A stream that never finishes until aborted.
    const never = new ReadableStream({ start() { /* never enqueues, never closes */ } });
    const model = new MockLanguageModelV4({ doStream: async () => ({ stream: never as any }) });
    const session = new HarnessSession(opts, async () => model as any);
    const events = collect(session);
    const sendP = session.send('hi');
    await new Promise((r) => setTimeout(r, 30));
    session.interrupt();
    await sendP;
    expect(events.some((e) => e.type === 'user-interrupt')).toBe(true);
    expect(events.some((e) => e.type === 'session-error')).toBe(false);
  });

  it('conversation history accumulates across turns (second call sees first exchange)', async () => {
    const seen: any[] = [];
    const factory = async () => new MockLanguageModelV4({
      doStream: async (req: any) => { seen.push(req.prompt); return { stream: simulateReadableStream({ chunks: TEXT_FINISH }) }; },
    }) as any;
    const session = new HarnessSession(opts, factory);
    collect(session);
    await session.send('first');
    await session.send('second');
    // Second request's prompt must contain the first user message AND the first assistant reply.
    const secondPrompt = JSON.stringify(seen[1]);
    expect(secondPrompt).toContain('first');
    expect(secondPrompt).toContain('Hello!');
    expect(secondPrompt).toContain('second');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `desktop/src/main/harness/harness-session.ts`:

```ts
// HarnessSession v0 — the native runtime's turn loop (spec §2.3): plain
// streamText, NO tools, emitting the exact transcript-event protocol the chat
// reducer already consumes. Phase 2 replaces the inner loop with the tool
// agent; the emit surface is the contract that must not move.
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { streamText, type LanguageModel, type ModelMessage } from 'ai';
import type { TranscriptEvent } from '../../shared/types';
import type { ModelBinding } from '../../shared/provider-types';
import type { HarnessManifest } from '../../shared/harness-manifest';

export interface HarnessSessionOpts {
  sessionId: string; cwd: string; harness: HarnessManifest; binding: ModelBinding;
  /** Model context window (from the catalog); null → conservative 32k default. */
  contextLength?: number | null;
}
export type ModelFactory = (binding: ModelBinding) => Promise<LanguageModel>;

// v6 stream parts renamed the delta field across minor releases
// (vercel/ai#8335) — read it through ONE accessor so churn stays here.
function deltaText(part: any): string { return part.text ?? part.delta ?? ''; }

// AI SDK finishReason -> CC transcript stopReason names (the bubble footer
// gate filters 'end_turn' as the normal case).
function mapStopReason(finishReason: string | undefined): string {
  switch (finishReason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    case 'content-filter': return 'refusal';
    default: return finishReason ?? 'unknown';
  }
}
const APPROX_CHARS_PER_TOKEN = 4;

export class HarnessSession extends EventEmitter {
  private history: ModelMessage[] = [];
  private abort: AbortController | null = null;
  private interrupted = false;
  binding: ModelBinding;

  constructor(private opts: HarnessSessionOpts, private modelFactory: ModelFactory) {
    super();
    this.binding = opts.binding;
  }

  /** Resume path: NativeSessionHost rebuilds history from stored events. */
  seedHistory(messages: ModelMessage[]): void { this.history = messages; }

  /** Mid-session model swap (next turn uses the new binding). */
  setBinding(binding: ModelBinding, contextLength?: number | null): void {
    this.binding = binding;
    if (contextLength !== undefined) this.opts.contextLength = contextLength;
  }

  private emitEvent(type: TranscriptEvent['type'], data: TranscriptEvent['data']): void {
    const event: TranscriptEvent = { type, sessionId: this.opts.sessionId, uuid: randomUUID(), timestamp: Date.now(), data };
    this.emit('transcript-event', event);
  }

  /** Oldest-first truncation to fit the context window. Always keeps the
   *  newest user message; chars/4 is a deliberate estimate, not a tokenizer. */
  private fitToContext(messages: ModelMessage[]): ModelMessage[] {
    const ctx = this.opts.contextLength ?? 32_768;
    const budgetTokens = ctx - (this.opts.harness.limits?.maxTokens ?? 4096) - 1024; // output + margin
    let total = Math.ceil(this.opts.harness.systemPrompt.length / APPROX_CHARS_PER_TOKEN);
    const kept: ModelMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const size = Math.ceil(JSON.stringify(messages[i].content).length / APPROX_CHARS_PER_TOKEN);
      if (kept.length > 0 && total + size > budgetTokens) break;
      kept.unshift(messages[i]);
      total += size;
    }
    return kept;
  }

  async send(text: string): Promise<void> {
    this.interrupted = false;
    this.emitEvent('user-message', { text });
    this.history.push({ role: 'user', content: text });
    this.abort = new AbortController();

    const startedAt = Date.now();
    let outputChars = 0;
    let assistantText = '';

    try {
      const model = await this.modelFactory(this.binding);
      const result = streamText({
        model,
        system: this.opts.harness.systemPrompt,
        messages: this.fitToContext(this.history),
        maxOutputTokens: this.opts.harness.limits?.maxTokens,
        abortSignal: this.abort.signal,
      });

      for await (const part of result.fullStream as AsyncIterable<any>) {
        switch (part.type) {
          case 'text-delta': {
            const t = deltaText(part);
            if (!t) break;
            assistantText += t; outputChars += t.length;
            this.emitEvent('assistant-text', { text: t, partId: part.id ?? 'text-0' });
            break;
          }
          case 'reasoning-delta': {
            const t = deltaText(part);
            if (!t) break;
            outputChars += t.length;
            // assistant-thinking WITH data.text → the reducer's reasoning path
            // (the PR #115 disclosure); payload-less stays a heartbeat.
            this.emitEvent('assistant-thinking', { text: t, partId: part.id ?? 'reasoning-0' });
            break;
          }
          case 'error':
            throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
      }

      const usage = await result.usage; // v7: totalUsage is deprecated in favor of usage
      const finishReason = await result.finishReason;
      if (assistantText) this.history.push({ role: 'assistant', content: assistantText });

      const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
      const outputTokens = usage?.outputTokens ?? Math.ceil(outputChars / APPROX_CHARS_PER_TOKEN);
      this.emitEvent('turn-complete', {
        model: this.binding.modelId,
        stopReason: mapStopReason(finishReason),
        usage: {
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          tokensPerSecond: Math.round(outputTokens / seconds),
        },
      });
    } catch (err: any) {
      if (assistantText) this.history.push({ role: 'assistant', content: assistantText });
      if (this.interrupted || err?.name === 'AbortError' || this.abort?.signal.aborted) {
        // CC's interrupt marker path: TRANSCRIPT_INTERRUPT ends the turn with
        // stopReason 'interrupted' — same event, same reducer behavior.
        this.emitEvent('user-interrupt', {});
      } else {
        this.emitEvent('session-error', { text: err?.message ?? 'The model request failed.' });
      }
    } finally {
      this.abort = null;
    }
  }

  interrupt(): void {
    this.interrupted = true;
    this.abort?.abort();
  }

  destroy(): void { this.abort?.abort(); this.removeAllListeners(); }
}
```

- [ ] **Step 3: Run — expect PASS** (adapt mock class/usage-accessor names per Step 1's SDK check if needed): `npx vitest run tests/harness-session.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/main/harness/harness-session.ts tests/harness-session.test.ts
git commit -m "feat(native): HarnessSession v0 — streamText loop emitting transcript-events"
```

---

### Task 9: NativeSessionHost + SessionManager branch + IPC handlers

**Files:**
- Create: `desktop/src/main/harness/native-session-host.ts`
- Modify: `desktop/src/main/session-manager.ts` (native branch)
- Modify: `desktop/src/main/ipc-handlers.ts` (handlers + transcript pipe + replay + browse merge)
- Modify: `desktop/src/main/remote-server.ts` (WS rows for the new channels)
- Test: `desktop/tests/native-session-host.test.ts`

- [ ] **Step 1: Write the failing host test**

```ts
// desktop/tests/native-session-host.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs'; import * as path from 'path'; import * as os from 'os';
import { NativeHome } from '../src/main/native-home';
import { SessionStore } from '../src/main/harness/session-store';
import { NativeSessionHost } from '../src/main/harness/native-session-host';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

const CHUNKS = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 'p1' },
  { type: 'text-delta', id: 'p1', delta: 'Hi there' },
  { type: 'text-end', id: 'p1' },
  { type: 'finish', finishReason: 'stop', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
];
const factory = async () => new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: CHUNKS }) }) }) as any;

describe('NativeSessionHost', () => {
  let root: string; let host: NativeSessionHost;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-host-'));
    host = new NativeSessionHost(new SessionStore(new NativeHome(root)), factory, async () => null);
  });
  afterEach(async () => { await host.destroyAll(); fs.rmSync(root, { recursive: true, force: true }); });

  it('create → send → events forwarded AND persisted; getHistory replays them', async () => {
    const seen: any[] = [];
    host.on('transcript-event', (e) => seen.push(e));
    await host.create({ sessionId: 's-1', cwd: root, binding: { providerId: 'openrouter', modelId: 'm' } });
    await host.send('s-1', 'hello');
    expect(seen.map((e) => e.type)).toContain('turn-complete');
    const history = host.getHistory('s-1');
    expect(history).not.toBeNull();
    expect(history!.map((e) => e.type)).toEqual(['user-message', 'assistant-text', 'turn-complete']);
    expect(history![1].data.text).toBe('Hi there');   // coalesced on disk
  });

  it('resume rebuilds a live session whose history includes the stored exchange', async () => {
    await host.create({ sessionId: 's-1', cwd: root, binding: { providerId: 'openrouter', modelId: 'm' } });
    await host.send('s-1', 'hello');
    await host.destroyAll();

    const host2 = new NativeSessionHost(new SessionStore(new NativeHome(root)), factory, async () => null);
    const resumed = await host2.resume('s-1', root);
    expect(resumed).toBe(true);
    expect(host2.getHistory('s-1')!.length).toBe(3);
    await host2.send('s-1', 'again');                 // must not throw; history seeded
    await host2.destroyAll();
  });

  it('list() surfaces sessions for the Resume Browser with provider tag', async () => {
    await host.create({ sessionId: 's-1', cwd: root, binding: { providerId: 'openrouter', modelId: 'm' } });
    const rows = host.list();
    expect(rows[0]).toMatchObject({ sessionId: 's-1', provider: 'native' });
  });

  it('getHistory returns null for unknown/non-native sessions (replay falls through to CC)', () => {
    expect(host.getHistory('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `desktop/src/main/harness/native-session-host.ts`:

```ts
// NativeSessionHost — registry of live HarnessSessions + the persistence glue.
// Mirrors TranscriptWatcher's contract outward: one 'transcript-event'
// EventEmitter surface that ipc-handlers pipes through sendForSession +
// remote broadcast, and getHistory() for the replay path.
import { EventEmitter } from 'events';
import type { TranscriptEvent } from '../../shared/types';
import type { ModelBinding } from '../../shared/provider-types';
import type { ModelMessage } from 'ai';
import { CHAT_PRESET } from '../../shared/harness-manifest';
import { HarnessSession, type ModelFactory } from './harness-session';
import { SessionStore, type NativeSessionListEntry } from './session-store';

export interface NativeCreateOpts { sessionId: string; cwd: string; binding: ModelBinding; }
export interface NativeBrowseRow extends NativeSessionListEntry { provider: 'native'; }

type ContextLengthLookup = (binding: ModelBinding) => Promise<number | null>;

export class NativeSessionHost extends EventEmitter {
  private live = new Map<string, { session: HarnessSession; cwd: string }>();

  constructor(private store: SessionStore, private modelFactory: ModelFactory,
              private contextLengthFor: ContextLengthLookup) { super(); }

  private wire(sessionId: string, cwd: string, session: HarnessSession): void {
    session.on('transcript-event', (e: TranscriptEvent) => {
      // Persist first (coalescing store), then forward — a renderer crash can
      // never lose an event that was already shown.
      void this.store.append(cwd, e);
      this.emit('transcript-event', e);
    });
    this.live.set(sessionId, { session, cwd });
  }

  async create(opts: NativeCreateOpts): Promise<void> {
    const contextLength = await this.contextLengthFor(opts.binding);
    await this.store.create({ v: 1, sessionId: opts.sessionId, harnessId: CHAT_PRESET.id, binding: opts.binding, cwd: opts.cwd, createdAt: Date.now() });
    this.wire(opts.sessionId, opts.cwd, new HarnessSession(
      { sessionId: opts.sessionId, cwd: opts.cwd, harness: CHAT_PRESET, binding: opts.binding, contextLength }, this.modelFactory));
  }

  /** Rebuild a live session from the store. Returns false when no file exists. */
  async resume(sessionId: string, cwd: string): Promise<boolean> {
    const header = this.store.readHeader(sessionId, cwd);
    if (!header) return false;
    const contextLength = await this.contextLengthFor(header.binding);
    const session = new HarnessSession(
      { sessionId, cwd, harness: CHAT_PRESET, binding: header.binding, contextLength }, this.modelFactory);
    session.seedHistory(this.eventsToMessages(this.store.readEvents(sessionId, cwd)));
    this.wire(sessionId, cwd, session);
    return true;
  }

  private eventsToMessages(events: TranscriptEvent[]): ModelMessage[] {
    const out: ModelMessage[] = [];
    for (const e of events) {
      if (e.type === 'user-message' && e.data.text) out.push({ role: 'user', content: e.data.text });
      // Coalesced text events are whole blocks; consecutive parts of one turn
      // merge into a single assistant message.
      if (e.type === 'assistant-text' && e.data.text) {
        const last = out[out.length - 1];
        if (last?.role === 'assistant' && typeof last.content === 'string') last.content += e.data.text;
        else out.push({ role: 'assistant', content: e.data.text });
      }
    }
    return out;
  }

  isNative(sessionId: string): boolean { return this.live.has(sessionId); }

  async send(sessionId: string, text: string): Promise<boolean> {
    const entry = this.live.get(sessionId);
    if (!entry) return false;
    await entry.session.send(text);
    return true;
  }

  interrupt(sessionId: string): boolean {
    const entry = this.live.get(sessionId);
    if (!entry) return false;
    entry.session.interrupt();
    return true;
  }

  async setBinding(sessionId: string, binding: ModelBinding): Promise<boolean> {
    const entry = this.live.get(sessionId);
    if (!entry) return false;
    entry.session.setBinding(binding, await this.contextLengthFor(binding));
    return true;
  }

  getBinding(sessionId: string): ModelBinding | null { return this.live.get(sessionId)?.session.binding ?? null; }

  /** Replay source for IPC.TRANSCRIPT_REPLAY. null → not a native session; caller falls through to the CC watcher. */
  getHistory(sessionId: string): TranscriptEvent[] | null {
    const entry = this.live.get(sessionId);
    if (!entry) return null;
    return this.store.readEvents(sessionId, entry.cwd);
  }

  list(): NativeBrowseRow[] { return this.store.list().map((r) => ({ ...r, provider: 'native' as const })); }

  destroy(sessionId: string): void {
    this.live.get(sessionId)?.session.destroy();
    this.live.delete(sessionId);
  }
  async destroyAll(): Promise<void> { for (const id of [...this.live.keys()]) this.destroy(id); }
}
```

- [ ] **Step 3: Run — expect PASS**: `npx vitest run tests/native-session-host.test.ts`

- [ ] **Step 4: SessionManager native branch.** In `session-manager.ts`:

(a) Add to `CreateSessionOpts` (after `provider?`):

```ts
  /** Native runtime only: which provider+model the session is bound to. */
  binding?: { providerId: string; modelId: string };
```

(b) Make `ManagedSession.worker` optional and add the native marker:

```ts
interface ManagedSession {
  info: SessionInfo;
  worker?: ChildProcess;   // absent for provider 'native' — no PTY exists
}
```

(c) Replace the throw guard in `createSession` with the branch (keep everything below it untouched for the claude path):

```ts
    // Native runtime (Phase 1 Plan A): no PTY, no worker. The session is
    // registered here so session:list / session:destroy / the window registry
    // see one uniform registry; the actual model loop lives in
    // NativeSessionHost, started by ipc-handlers after this returns.
    if (provider === 'native') {
      if (!opts.binding) throw new Error('Native sessions need a model binding (provider + model).');
      const info: SessionInfo = {
        id, name: opts.name, cwd: resolvedCwd, permissionMode: 'default',
        skipPermissions: false, status: 'active', createdAt: Date.now(),
        provider, model: opts.binding.modelId, initialInput: opts.initialInput,
      };
      this.sessions.set(id, { info });
      this.emit('session-created', info);
      return info;
    }
```

(d) Guard the worker-messaging methods — in `destroySession`, `sendInput`, `resizeSession`, wrap the `session.worker.send(...)` calls in `if (session.worker)` (destroy still emits `'session-exit', id, 0` for native so the renderer's `SESSION_PROCESS_EXITED` path stays uniform — with exitCode 0 and no in-flight turn it's a no-op in the reducer). Audit any other `session.worker` accesses in the file (e.g. `destroyAll`, exit listeners are attached only in the claude path) and guard the same way.

(e) tsc check: `npx tsc --noEmit -p .`

- [ ] **Step 5: ipc-handlers wiring.** In `ipc-handlers.ts` (all inside `registerIpcHandlers`, near the transcriptWatcher setup at ~1686):

(a) Construct the stack (imports at top of file):

```ts
import { NativeHome } from './native-home';
import { SecretsStore } from './providers/secrets-store';
import { ProviderRegistry } from './providers/provider-registry';
import { ModelCatalog } from './providers/model-catalog';
import { SessionStore } from './harness/session-store';
import { NativeSessionHost } from './harness/native-session-host';
```

```ts
  // ---- Native runtime Plan A: provider layer + session host ----
  const nativeHome = new NativeHome();
  const secretsStore = new SecretsStore(app.getPath('userData'));
  const providerRegistry = new ProviderRegistry(nativeHome, secretsStore);
  void providerRegistry.init();
  const modelCatalog = new ModelCatalog(app.getPath('userData'));
  const nativeHost = new NativeSessionHost(
    new SessionStore(nativeHome),
    (binding) => providerRegistry.languageModel(binding),
    async (binding) => modelCatalog.contextLengthFor(binding, await providerRegistry.list()),
  );
  // Same pipe as the CC transcript watcher: owner window ∪ buddy subscribers + remote.
  nativeHost.on('transcript-event', (event: any) => {
    sendForSession(event.sessionId, IPC.TRANSCRIPT_EVENT, event);
    if (remoteServer) remoteServer.broadcast({ type: 'transcript:event', payload: event });
  });
```

(b) Start the host when a native session is created — in the `SESSION_CREATE` handler, after `sessionManager.createSession(opts)` returns, add:

```ts
    if (info.provider === 'native') {
      if (opts.resumeSessionId) {
        // Resume: point the host at the stored JSONL (the renderer replays via TRANSCRIPT_REPLAY).
        const ok = await nativeHost.resume(opts.resumeSessionId, info.cwd);
        if (!ok) await nativeHost.create({ sessionId: info.id, cwd: info.cwd, binding: opts.binding! });
        else (info as any).id = opts.resumeSessionId; // reuse the stored id so history/replay line up
      } else {
        await nativeHost.create({ sessionId: info.id, cwd: info.cwd, binding: opts.binding! });
      }
    }
```

**Check the actual SESSION_CREATE handler shape first** — if `createSession` is called with a spread/rebuilt opts object, thread `binding` and `provider` through it; the handler is async so the awaits are fine. On resume, the SessionInfo id must equal the stored session id BEFORE `session-created` is emitted — if the emit happens inside `createSession`, pass `opts.resumeSessionId` through `CreateSessionOpts` and set `const id = (provider === 'native' && opts.resumeSessionId) ? opts.resumeSessionId : randomUUID();` in the native branch instead of mutating after the fact (cleaner — do it that way).

(c) Session destroy: in the `SESSION_DESTROY` handler add `nativeHost.destroy(sessionId);` before/after `sessionManager.destroySession(sessionId)` (idempotent for non-native ids).

(d) Replay fall-through — change the `TRANSCRIPT_REPLAY` handler body to:

```ts
    const events = nativeHost.getHistory(sessionId) ?? transcriptWatcher.getHistory(sessionId);
```

(e) New handlers (fire-and-forget send so a long turn never blocks the renderer's invoke pool):

```ts
  ipcMain.on(IPC.NATIVE_SEND, (_evt, { sessionId, text }: { sessionId: string; text: string }) => {
    void nativeHost.send(sessionId, text);   // events stream back via the transcript pipe
  });
  ipcMain.on(IPC.NATIVE_INTERRUPT, (_evt, { sessionId }: { sessionId: string }) => {
    nativeHost.interrupt(sessionId);
  });
  ipcMain.handle(IPC.NATIVE_SET_BINDING, async (_evt, sessionId: string, binding: any) => nativeHost.setBinding(sessionId, binding));
  ipcMain.handle(IPC.NATIVE_SESSIONS_LIST, async () => nativeHost.list());
  ipcMain.handle(IPC.PROVIDER_LIST, async () => providerRegistry.list());
  ipcMain.handle(IPC.PROVIDER_UPSERT, async (_evt, config: any) => providerRegistry.upsert(config));
  ipcMain.handle(IPC.PROVIDER_REMOVE, async (_evt, id: string) => { await providerRegistry.remove(id); return true; });
  ipcMain.handle(IPC.PROVIDER_TEST, async (_evt, id: string) => providerRegistry.testConnection(id));
  ipcMain.handle(IPC.PROVIDER_SET_KEY, async (_evt, id: string, key: string) => { await providerRegistry.setKey(id, key); return true; });
  ipcMain.handle(IPC.PROVIDER_CATALOG, async () => modelCatalog.get(await providerRegistry.list()));
```

(f) Browse merge — find the `session:browse` handler (`SESSION_BROWSE` constant or literal) and append native rows to its result, mapped into the `PastSession` shape:

```ts
    // Native sessions ride the same browse list with a provider tag (spec §2.6).
    const nativeRows = nativeHost.list().map((r) => ({
      sessionId: r.sessionId, name: r.title ?? 'Untitled', projectSlug: r.slug, projectPath: r.cwd,
      lastModified: r.mtimeMs, size: r.sizeBytes, provider: 'native' as const,
    }));
    return [...existingResult, ...nativeRows];
```

- [ ] **Step 6: remote-server rows.** In `remote-server.ts`, find the inbound WS message dispatch (the big switch/if-chain mapping `msg.type` to handlers — grep `'skills:list'` for a template). Add cases for the ten channels calling the same registry/host instances (they must be passed into or importable by RemoteServer the same way other services are — follow how `skillProvider` or session handlers reach it). `native:send`/`native:interrupt` are fire-and-forget (no respond); the `provider:*` + `native:sessions-list`/`native:set-binding` rows respond with the handler result. Transcript events already reach remote clients via the broadcast added in Step 5(a).

- [ ] **Step 7: Full check + commit**

```bash
npx tsc --noEmit -p . && npx vitest run tests/native-session-host.test.ts tests/ipc-channels.test.ts
git add src/main/harness/native-session-host.ts src/main/session-manager.ts src/main/ipc-handlers.ts src/main/remote-server.ts tests/native-session-host.test.ts
git commit -m "feat(native): NativeSessionHost + SessionManager native branch + IPC/WS handlers"
```

---

### Task 10: preload + remote-shim namespaces, Window types, Kotlin stubs, parity tests

**Files:**
- Modify: `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/renderer/hooks/useIpc.ts`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`
- Test: `desktop/tests/ipc-channels.test.ts` (new describe — write it FIRST)

- [ ] **Step 1: Write the failing parity describe** — append to `tests/ipc-channels.test.ts`, mirroring the `project:* channel parity` block (lines 494-525):

```ts
// Native runtime Plan A channels: desktop-authoritative, Android-stubbed.
describe('native:*/provider:* channel parity', () => {
  const NEW_TYPES = [
    'native:send', 'native:interrupt', 'native:set-binding', 'native:sessions-list',
    'provider:list', 'provider:upsert', 'provider:remove', 'provider:test', 'provider:set-key', 'provider:catalog',
  ];
  const CHANNEL_TO_CONST: Record<string, string> = {
    'native:send': 'IPC.NATIVE_SEND', 'native:interrupt': 'IPC.NATIVE_INTERRUPT',
    'native:set-binding': 'IPC.NATIVE_SET_BINDING', 'native:sessions-list': 'IPC.NATIVE_SESSIONS_LIST',
    'provider:list': 'IPC.PROVIDER_LIST', 'provider:upsert': 'IPC.PROVIDER_UPSERT',
    'provider:remove': 'IPC.PROVIDER_REMOVE', 'provider:test': 'IPC.PROVIDER_TEST',
    'provider:set-key': 'IPC.PROVIDER_SET_KEY', 'provider:catalog': 'IPC.PROVIDER_CATALOG',
  };
  it('exposed in preload.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src, `${t} missing from preload.ts`).toContain(`'${t}'`);
  });
  it('exposed in remote-shim.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'remote-shim.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src, `${t} missing from remote-shim.ts`).toContain(`'${t}'`);
  });
  it('registered in ipc-handlers.ts (literal or IPC constant)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'ipc-handlers.ts'), 'utf8');
    for (const t of NEW_TYPES) {
      expect(src.includes(`'${t}'`) || src.includes(CHANNEL_TO_CONST[t]), `${t} missing from ipc-handlers.ts`).toBe(true);
    }
  });
  it('stubbed in SessionService.kt (Android)', () => {
    const kt = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'runtime', 'SessionService.kt'), 'utf8');
    for (const t of NEW_TYPES) expect(kt, `${t} missing from SessionService.kt`).toContain(`"${t}"`);
  });
});
```

Run: `npx vitest run tests/ipc-channels.test.ts` — expect the new describe FAILS on preload/shim/Kotlin (ipc-handlers may already pass from Task 9).

- [ ] **Step 2: preload namespaces** — in `preload.ts`, next to the existing `native: { supported: ... }` block (~line 952), extend it and add `providers`:

```ts
  native: {
    supported: process.env.YOUCODED_NATIVE === '1',
    // Session I/O for the native runtime. Fire-and-forget like session:input —
    // replies stream back as transcript events, so no invoke round-trip.
    send: (sessionId: string, text: string) => ipcRenderer.send(IPC.NATIVE_SEND, { sessionId, text }),
    interrupt: (sessionId: string) => ipcRenderer.send(IPC.NATIVE_INTERRUPT, { sessionId }),
    setBinding: (sessionId: string, binding: unknown) => ipcRenderer.invoke(IPC.NATIVE_SET_BINDING, sessionId, binding),
    sessionsList: () => ipcRenderer.invoke(IPC.NATIVE_SESSIONS_LIST),
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC.PROVIDER_LIST),
    upsert: (config: unknown) => ipcRenderer.invoke(IPC.PROVIDER_UPSERT, config),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROVIDER_REMOVE, id),
    test: (id: string) => ipcRenderer.invoke(IPC.PROVIDER_TEST, id),
    setKey: (id: string, key: string) => ipcRenderer.invoke(IPC.PROVIDER_SET_KEY, id, key),
    catalog: () => ipcRenderer.invoke(IPC.PROVIDER_CATALOG),
  },
```

(The parity test greps single-quoted literals; `IPC.NATIVE_SEND` etc. resolve because Task 1 put the literals in preload's inline IPC block — the literals appear there, satisfying `toContain("'native:send'")`.)

- [ ] **Step 3: remote-shim namespaces** — replace the `native: { supported: false }` stub (remote-shim.ts:1341-1345) with methods that go over the WS bridge (they work when the desktop host serves a remote browser; Android's stubs reject fast):

```ts
    // Native runtime — capability stays FALSE off-desktop (the selector never
    // renders), but the methods exist for window.claude shape parity and for
    // remote browsers attached to a desktop host running native sessions.
    native: {
      supported: false,
      send: (sessionId: string, text: string) => fire('native:send', { sessionId, text }),
      interrupt: (sessionId: string) => fire('native:interrupt', { sessionId }),
      setBinding: (sessionId: string, binding: unknown) => invoke('native:set-binding', { sessionId, binding }),
      sessionsList: () => invoke('native:sessions-list'),
    },
    providers: {
      list: () => invoke('provider:list'),
      upsert: (config: unknown) => invoke('provider:upsert', config),
      remove: (id: string) => invoke('provider:remove', { id }),
      test: (id: string) => invoke('provider:test', { id }),
      setKey: (id: string, key: string) => invoke('provider:set-key', { id, key }),
      catalog: () => invoke('provider:catalog'),
    },
```

**Payload-shape note:** remote-shim `invoke` sends a single `payload` object; the desktop `ipcMain.handle` signatures take positional args. The bridge that unwraps WS messages into handler calls is `remote-server.ts` — Task 9 Step 6's rows must destructure the payload (`{ id }`, `{ sessionId, binding }`, `{ id, key }`) when calling the registry/host. Keep the two shapes reconciled there, matching how existing channels do it.

- [ ] **Step 4: Window types** — in `hooks/useIpc.ts`, extend the `native` declaration (lines 243-248) and add `providers`:

```ts
      native: {
        supported: boolean;
        send: (sessionId: string, text: string) => void;
        interrupt: (sessionId: string) => void;
        setBinding: (sessionId: string, binding: { providerId: string; modelId: string }) => Promise<boolean>;
        sessionsList: () => Promise<any[]>;
      };
      providers: {
        list: () => Promise<any[]>;
        upsert: (config: any) => Promise<string>;
        remove: (id: string) => Promise<boolean>;
        test: (id: string) => Promise<{ ok: boolean; message: string }>;
        setKey: (id: string, key: string) => Promise<boolean>;
        catalog: () => Promise<any[]>;
      };
```

- [ ] **Step 5: Kotlin stubs** — in `SessionService.kt`, add a combined case adjacent to the `project:*` stub block (lines ~3514-3526):

```kotlin
            // Native runtime (Phase 1) is desktop-only. Reply not-implemented so
            // the shared React UI degrades instead of timing out (30s invoke).
            "native:send",
            "native:interrupt",
            "native:set-binding",
            "native:sessions-list",
            "provider:list",
            "provider:upsert",
            "provider:remove",
            "provider:test",
            "provider:set-key",
            "provider:catalog" -> {
                msg.id?.let { bridgeServer.respond(ws, msg.type, it,
                    org.json.JSONObject().put("ok", false).put("error", "not-implemented-on-mobile")) }
            }
```

- [ ] **Step 6: Run parity + full sweep — expect PASS**

```bash
npx vitest run tests/ipc-channels.test.ts && npx tsc --noEmit -p .
```

- [ ] **Step 7: Commit**

```bash
git add src/main/preload.ts src/renderer/remote-shim.ts src/renderer/hooks/useIpc.ts tests/ipc-channels.test.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(native): native/providers window.claude namespaces + Android stubs + parity tests"
```

---

### Task 11: Reducer — text partId merge, NATIVE_SESSION_ERROR, `error` banner (App + BubbleFeed same commit)

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts`, `state/chat-reducer.ts`
- Modify: `desktop/src/renderer/App.tsx`, `components/buddy/BubbleFeed.tsx` (BOTH, same commit)
- Modify: `desktop/src/renderer/components/AttentionBanner.tsx`
- Test: `desktop/tests/chat-reducer.test.ts` (additions)

- [ ] **Step 1: Write the failing reducer tests** (append to the existing `chat-reducer.test.ts`, matching its established helpers for creating a session state):

```ts
describe('native runtime reducer paths', () => {
  it('TRANSCRIPT_ASSISTANT_TEXT with partId merges same-part deltas into one segment', () => {
    let state = init();                                    // use the file's existing session-bootstrap helper
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, uuid: 'u1', text: 'Hel', timestamp: 1, partId: 'p1' });
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, uuid: 'u2', text: 'lo!', timestamp: 2, partId: 'p1' });
    const turn = currentTurn(state);
    const textSegs = turn.segments.filter((s: any) => s.type === 'text');
    expect(textSegs).toHaveLength(1);
    expect(textSegs[0].content).toBe('Hello!');
    expect(textSegs[0].partId).toBe('p1');
  });

  it('does NOT over-merge: a new partId or an interleaved reasoning segment starts a new text segment', () => {
    let state = init();
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, uuid: 'u1', text: 'A', timestamp: 1, partId: 'p1' });
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_REASONING', sessionId: SID, uuid: 'r1', text: 'think', timestamp: 2, partId: 'r1' });
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, uuid: 'u2', text: 'B', timestamp: 3, partId: 'p2' });
    const segs = currentTurn(state).segments;
    expect(segs.map((s: any) => s.type)).toEqual(['text', 'reasoning', 'text']);
  });

  it('events WITHOUT partId keep the whole-block append (CC path untouched)', () => {
    let state = init();
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, uuid: 'u1', text: 'block one', timestamp: 1 });
    state = reduce(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, uuid: 'u2', text: 'block two', timestamp: 2 });
    expect(currentTurn(state).segments.filter((s: any) => s.type === 'text')).toHaveLength(2);
  });

  it('NATIVE_SESSION_ERROR ends the turn and surfaces attentionState error + message', () => {
    let state = init();
    state = reduce(state, { type: 'USER_PROMPT', sessionId: SID, content: 'hi', timestamp: 1 });
    state = reduce(state, { type: 'NATIVE_SESSION_ERROR', sessionId: SID, message: 'OpenRouter needs an API key.' });
    const s = state.get(SID)!;
    expect(s.isThinking).toBe(false);
    expect(s.attentionState).toBe('error');
    expect(s.errorMessage).toBe('OpenRouter needs an API key.');
  });

  it('the next user prompt clears the error state', () => {
    let state = init();
    state = reduce(state, { type: 'NATIVE_SESSION_ERROR', sessionId: SID, message: 'x' });
    state = reduce(state, { type: 'USER_PROMPT', sessionId: SID, content: 'retry', timestamp: 2 });
    expect(state.get(SID)!.attentionState).toBe('ok');
  });
});
```

Run — expect FAIL.

- [ ] **Step 2: `chat-types.ts` changes:**

(a) Text segment gains `partId?` (mirror the reasoning comment style):

```ts
  | { type: 'text'; content: string; messageId: string;
      // Native runtime streams text as per-token deltas merged by partId
      // (same semantics as reasoning). CC's transcript path sends whole
      // blocks with no partId — those keep appending as separate segments.
      partId?: string }
```

(b) `SessionChatState` gains `errorMessage: string | null` (default `null` in the initial-state factory; document: "Human-readable provider error backing the 'error' AttentionBanner — native sessions only").

(c) `ChatAction` union gains:

```ts
  | { type: 'NATIVE_SESSION_ERROR'; sessionId: string; message: string }
```

(d) `TRANSCRIPT_ASSISTANT_TEXT` action gains `partId?: string`.

(e) If `chat-types.ts` has `serializeChatState`/`deserializeChatState` (remote `chat:hydrate` path — it does, per PITFALLS "Remote Access State Sync"), add `errorMessage` to both in the same edit.

- [ ] **Step 3: Reducer changes in `chat-reducer.ts`:**

(a) `TRANSCRIPT_ASSISTANT_TEXT` — insert the merge branch before the append (mirroring the reasoning case at 523-559):

```ts
      // Native runtime: same-partId deltas merge into the last text segment
      // (identical semantics to the reasoning path below). No partId → CC's
      // whole-block append, unchanged.
      let segments = turn.segments;
      const lastIdx = segments.length - 1;
      const last = lastIdx >= 0 ? segments[lastIdx] : null;
      if (action.partId && last && last.type === 'text' && last.partId === action.partId) {
        segments = [...segments.slice(0, lastIdx), { ...last, content: last.content + action.text }];
      } else {
        segments = [...segments, { type: 'text', content: action.text, messageId: nextMessageId(), partId: action.partId }];
      }
      assistantTurns.set(currentTurnId, { ...turn, segments, model: action.model ?? turn.model });
```

(b) New case (place near `SESSION_PROCESS_EXITED`):

```ts
    // Native runtime: a provider/stream failure ended the turn. endTurn()
    // resets attentionState to 'ok'; we override with 'error' — same
    // spread-then-override pattern SESSION_PROCESS_EXITED uses.
    case 'NATIVE_SESSION_ERROR': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      next.set(action.sessionId, {
        ...session,
        ...endTurn(session, action.message),
        attentionState: 'error',
        errorMessage: action.message,
      });
      return next;
    }
```

(c) `USER_PROMPT` (and `endTurn()` itself) must clear `errorMessage`: add `errorMessage: null` to `endTurn()`'s returned object — then the NATIVE_SESSION_ERROR case's override order (spread endTurn first, then set both fields) keeps the message. Verify the USER_PROMPT case resets `attentionState` to `'ok'` (it sets `isThinking: true`; if it doesn't touch attentionState today, add `attentionState: 'ok', errorMessage: null` with a WHY comment: "typing again after a provider error is the retry — clear the banner").

- [ ] **Step 4: App.tsx + BubbleFeed.tsx (SAME COMMIT).** In BOTH transcript switches:

(a) forward `partId` in the `assistant-text` dispatch: add `partId: event.data.partId,` to the existing action object (App.tsx ~849, BubbleFeed ~110).

(b) add the new case beside `assistant-thinking`:

```ts
        case 'session-error':
          batchTranscriptDispatch({   // BubbleFeed: batchDispatch
            type: 'NATIVE_SESSION_ERROR',
            sessionId: event.sessionId,
            message: event.data.text ?? 'The model request failed.',
          });
          break;
```

- [ ] **Step 5: AttentionBanner.** In `AttentionBanner.tsx`: widen `Props['state']` (it's `Exclude<AttentionState, 'ok'>`, so it widens automatically), add the COPY row and message prop:

```ts
const COPY: Record<Props['state'], string> = {
  'stuck': 'Still waiting on Claude — check Terminal view if this persists.',
  'session-died': 'Session ended unexpectedly.',
  // Native runtime provider failure — the specific message arrives via the
  // errorMessage prop and takes precedence over this generic line.
  'error': 'The model request failed.',
};
const DESTRUCTIVE: Props['state'][] = ['session-died', 'error'];
```

Add `errorMessage?: string | null` to Props; render `errorMessage ?? COPY[state]` as the line when `state === 'error'`; `showSpinner` must exclude `'error'`. Then find where ChatView renders `<AttentionBanner state={...}>` and pass `errorMessage={session.errorMessage}`. Retry affordance: inside the banner, when `state === 'error'` and an `onRetry` prop is provided, render a small "Try again" button (`className="text-xs underline text-fg-dim hover:text-fg"`) calling it; in ChatView, wire `onRetry` to re-send the LAST user timeline entry through the provider-aware send used in Task 12 (find the last `timeline` entry with `kind === 'user'` and call the same send helper InputBar uses — if that helper isn't cleanly reachable from ChatView, lift it to a small exported function in Task 12 and import it here).

- [ ] **Step 6: Update the PITFALLS bullet in the SAME commit.** In `youcoded-dev/docs/PITFALLS.md`, the Chat Reducer section's bullet "**`AttentionState` is `'ok' | 'stuck' | 'session-died'` — three reachable states only.**" — rewrite to four reachable states, naming the new writer (`NATIVE_SESSION_ERROR` ← `session-error` events, native sessions only) and noting CC sessions can never enter it. (This is the workspace repo, not the youcoded worktree — commit it separately there.)

- [ ] **Step 7: Run + commit**

```bash
npx vitest run tests/chat-reducer.test.ts && npx tsc --noEmit -p .
git add src/renderer/state/chat-types.ts src/renderer/state/chat-reducer.ts src/renderer/App.tsx src/renderer/components/buddy/BubbleFeed.tsx src/renderer/components/AttentionBanner.tsx tests/chat-reducer.test.ts
git commit -m "feat(native): text partId streaming merge + error attention state with retry"
```

---

### Task 12: Send-path routing (InputBar, useSubmitConfirmation, SessionStrip, ModelPickerPopup)

**Files:**
- Modify: `desktop/src/renderer/components/InputBar.tsx`, `hooks/useSubmitConfirmation.ts`, `components/SessionStrip.tsx`, `components/ModelPickerPopup.tsx`
- Create: `desktop/src/renderer/components/native-send.ts` (tiny shared helper so ChatView's retry can reuse it)
- Test: `desktop/tests/native-send.test.ts` + manual dev-instance checks in Task 14

- [ ] **Step 1: Create the shared send helper + test.**

```ts
// desktop/src/renderer/components/native-send.ts
// One provider-aware send for chat-view surfaces (InputBar, error-banner retry).
// Native sessions: plain string over native:send — none of the PTY machinery
// (56-byte chunking, echo waits, \r submit, paste timing) applies or may run.
export function sendChatMessage(provider: 'claude' | 'native' | undefined, sessionId: string, ptyText: string, filePaths: string[] = []): void {
  if (provider === 'native') {
    const text = [...filePaths, ptyText].filter(Boolean).join(' ');
    window.claude.native.send(sessionId, text);
    return;
  }
  // Claude/PTY path — preserved exactly: file paths first (Ink paste timing),
  // then body + \r. Caller keeps its existing FILE_GAP_MS scheduling for PTY.
  window.claude.session.sendInput(sessionId, ptyText + '\r');
}
```

```ts
// desktop/tests/native-send.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendChatMessage } from '../src/renderer/components/native-send';

describe('sendChatMessage', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      claude: { native: { send: vi.fn() }, session: { sendInput: vi.fn() } },
    };
  });
  it('routes native sessions to native:send with NO trailing \\r', () => {
    sendChatMessage('native', 's1', 'hello world', ['C:/a b.txt']);
    expect((window as any).claude.native.send).toHaveBeenCalledWith('s1', 'C:/a b.txt hello world');
    expect((window as any).claude.session.sendInput).not.toHaveBeenCalled();
  });
  it('routes claude/undefined sessions to the PTY with \\r', () => {
    sendChatMessage('claude', 's1', 'hi');
    expect((window as any).claude.session.sendInput).toHaveBeenCalledWith('s1', 'hi\r');
    sendChatMessage(undefined, 's2', 'yo');
    expect((window as any).claude.session.sendInput).toHaveBeenCalledWith('s2', 'yo\r');
  });
});
```

Run (FAIL → implement → PASS).

- [ ] **Step 2: InputBar.** InputBar needs the active session's provider — check its props; if not present, thread `provider` down from ChatView (which has the session info) as a new optional prop `provider?: 'claude' | 'native'`. Then in the send callback (lines ~265-307):

- Native branch FIRST: `if (provider === 'native') { dispatch USER_PROMPT (same as today, attachments included); sendChatMessage('native', sessionId, outgoing.ptyText, files.map(f => f.path)); return true; }` — skipping the `FILE_GAP_MS` timers and the `hasPendingInteraction` PTY gate (no Ink menu can exist; keep the gate for claude). The optimistic-bubble dedup contract holds: `USER_PROMPT` uses `outgoing.content`, and HarnessSession echoes the same joined string via `user-message` (`[...filePaths, sanitized].join(' ')` — the helper's join order matches `buildOutgoingMessage.content` exactly; ADD a test assertion for that equality in `native-send.test.ts` if `buildOutgoingMessage` changes).
- ESC/interrupt: find where InputBar or ChatView forwards ESC (`sendInput(sessionId, '\x1b')` per the keyboard-routing docs) and branch: native → `window.claude.native.interrupt(sessionId)`.
- The slash-command PTY forward (`alsoSendToPty`, line ~253): for native sessions, slash commands don't exist — show the existing toast pattern with "Slash commands aren't available for YouCoded-runtime sessions yet."

- [ ] **Step 3: useSubmitConfirmation.** The retry mechanism is a PTY `'\r'` — meaningless and dangerous for native. Gate it at registration: the hook receives session context (check its args — `activeSessionId`); thread the provider in (new arg or look up via the session-state getter it already uses) and `if (provider === 'native') return;` before tracking a message, with a WHY comment ("native sends are an in-process function call — no lost-byte failure mode; the error banner covers provider failures").

- [ ] **Step 4: SessionStrip.** Wire the dormant selector (lines 973-995):

- Enable the YouCoded button: `onClick={() => setRuntime('native')}`, remove `disabled` + the "coming soon" line, styling mirrors the Claude Code button's selected state.
- When `runtime === 'native'`, render a **binding picker** under the Runtime row in the new-session form: provider dropdown (from `window.claude.providers.list()`, filtered to `ready`) + model dropdown (from `window.claude.providers.catalog()`, filtered to the chosen provider, with a text-input fallback for `openai-compatible` providers that have no catalog). Local state: `const [binding, setBinding] = useState<{providerId: string; modelId: string} | null>(null)`; remember the last-used binding in `localStorage['youcoded-last-binding']` and preseed from it. When no provider is `ready`, show "Add a provider key in Settings → Providers first" and disable Create.
- `handleCreate` passes the runtime + binding through: `onCreateSession(newCwd, dangerous, newModel, runtime, launchInNewWindow, runtime === 'native' ? binding ?? undefined : undefined)`. Extend the `onCreateSession` prop signature (line 31) with the trailing `binding?: { providerId: string; modelId: string }`, and follow it up the chain: App's create handler must put `provider` and `binding` into the `session.create` opts (check `useIpc.ts` create signature — widen its opts type with `provider?` and `binding?`).

- [ ] **Step 5: ModelPickerPopup.** Replace `if (provider === 'native') return null;` (lines 208-213) with a native variant of the popup: fetch `window.claude.providers.catalog()` on open, group rows by provider label, filter with the existing search field, mark the session's current binding (new prop `currentBinding?: {providerId: string; modelId: string} | null` passed from where ChatView/App opens the popup — obtainable from the session info's `model` + a `native:sessions-list` lookup, or thread the binding through SessionInfo. Simplest correct route: `window.claude.native.setBinding` on select and display current from a `useEffect` that finds this session in `native.sessionsList()`). On select: `await window.claude.native.setBinding(sessionId, {providerId, modelId})`, close, and rely on the next turn using it. Hide the `/fast` + `/effort` PTY-slash-command sections for native (those are CC concepts; guard their render on `provider !== 'native'`).

- [ ] **Step 6: tsc + targeted tests + commit**

```bash
npx tsc --noEmit -p . && npx vitest run tests/native-send.test.ts tests/ipc-channels.test.ts
git add src/renderer/components/native-send.ts src/renderer/components/InputBar.tsx src/renderer/hooks/useSubmitConfirmation.ts src/renderer/components/SessionStrip.tsx src/renderer/components/ModelPickerPopup.tsx tests/native-send.test.ts
git commit -m "feat(native): provider-aware send paths, runtime selector wiring, native model picker"
```

(Include any ChatView/App files touched for prop threading in the add.)

---

### Task 13: Providers settings panel + ResumeBrowser integration

**Files:**
- Create: `desktop/src/renderer/components/ProvidersSection.tsx`
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` (desktop stack only)
- Modify: `desktop/src/renderer/components/ResumeBrowser.tsx`
- Modify: `desktop/src/main/ipc-handlers.ts` only if browse-merge from Task 9 needs the `provider` field threaded (verify)

- [ ] **Step 1: ProvidersSection.** New self-contained section component (the `SyncSection` model — Context primer #11(b) shows the row/heading idioms). Gate the whole section on `window.claude?.native?.supported === true` so production builds show nothing until Phase 2 ungates. Behavior:

- On mount + after any mutation: `const rows = await window.claude.providers.list()` → render each as a row: label, plain-language state ("Connected" when `ready`, "Needs API key" when enabled && !ready && type !== 'local-engine', "Coming with the local engine" for `local`, "Disabled" when !enabled). **Plain words, no status glyphs** (standing UX rule).
- Row actions: "Add key / Replace key" (password `<input>`, save → `providers.setKey(id, value)`, then `providers.test(id)` and show the returned `message` inline), "Test" button (shows `message` inline, `ok` in fg / failure in the destructive text color), enable/disable toggle (`providers.upsert({...row, enabled: !row.enabled})`), and for non-`builtIn` rows a Remove button behind an inline confirm ("Remove {label}? Its API key is deleted from this computer." — consequence-gated per the standing preference, `OverlayPanel` not required for an inline confirm row).
- "Add provider" flow: a small form — type select (`Anthropic (API key) | OpenAI | Google | Custom endpoint (OpenAI-compatible)`), label, baseUrl (custom only), optional key → `providers.upsert(...)` then `setKey` when a key was entered.
- Follow the section idioms exactly: `<section>` + the `h3` heading classes; rows `bg-inset/50 hover:bg-inset rounded-lg px-3 py-2.5`.

Mount it in `DesktopSettings`'s stack (SettingsPanel.tsx ~2276-2318) after `<SyncSection …/>`: `<ProvidersSection />`. Do NOT add it to `AndroidSettings` (desktop-authoritative feature; Android invokes would stub out).

- [ ] **Step 2: ResumeBrowser.** Changes:

- `PastSession` type gains `provider?: 'native'` (Task 9's browse merge already returns it).
- `renderSessionRow`: when `s.provider === 'native'`, render a small runtime badge (`<span className="text-[9px] px-1.5 py-0.5 rounded bg-inset text-fg-muted shrink-0">YouCoded</span>`) next to the name, and hide/ignore the CC-specific resume options for that row (model select + dangerous toggle are CC concepts; a native resume reuses the stored binding).
- `onResume` for native rows must signal the provider: extend the `onResume` prop signature with a trailing `provider?: 'claude' | 'native'` and pass `'native'`; in App's resume handler, when provider is `'native'`, call session create with `{ provider: 'native', resumeSessionId: s.sessionId, cwd: s.projectPath, name: s.name }` and NO binding (the host reads it from the stored header — Task 9 Step 5(b) resume path; make the SessionManager native branch tolerate a missing binding when `resumeSessionId` is set, since the host supplies it: adjust the guard to `if (!opts.binding && !opts.resumeSessionId) throw`).
- After create, the renderer's existing replay call (`transcript:replay-from-start`) hydrates the chat — verify App triggers replay for newly created native sessions the same way it does after CC resume; if replay is gated on something PTY-specific, add the native trigger where sessions mount.

- [ ] **Step 3: tsc + run the full suite + commit**

```bash
npx tsc --noEmit -p . && npm test -- --run
git add src/renderer/components/ProvidersSection.tsx src/renderer/components/SettingsPanel.tsx src/renderer/components/ResumeBrowser.tsx
git commit -m "feat(native): Providers settings panel + Resume Browser native sessions"
```

(`sync-warnings-lifecycle.test.ts` is a known intermittent flake under full-suite parallelism — rerun it in isolation before treating it as a regression.)

---

### Task 14: Live acceptance on the dev instance + docs + PR

**Files:**
- Modify: `youcoded/docs/provider-dependencies.md` (fill the skeleton), `youcoded/docs/cc-dependencies.md` (no change expected — verify), `youcoded-dev/docs/PITFALLS.md` (new invariants), `youcoded-dev/docs/chat-reducer.md` (text partId merge)
- No code beyond fixes found during acceptance

- [ ] **Step 1: Build + boot the dev instance**

```bash
cd <worktree>/desktop && npm run build && cd <workspace-root>
YOUCODED_NATIVE=1 bash scripts/run-dev.sh   # dev worktree instance; NEVER the live app
```

- [ ] **Step 2: Acceptance script (spec §1 Plan A exit test)** — in the dev window:
1. Settings → Providers renders; add an OpenRouter key (Destin has one; otherwise create a free-tier key); Test shows "Connected."
2. New session → Runtime "YouCoded" → pick a cheap OpenRouter model (e.g. a free `:free`-suffixed model) → Create.
3. Send a message → streaming text appears token-by-token in the chat view; the per-turn metadata strip shows tokens + tok/s when `showTurnMetadata` is on. **KNOWN GAP (`native-statusbar-usage`, deferred):** the StatusBar *chips* (context/tokens/speed pills) stay empty for native sessions — they read CC-hook files (`~/.claude/.session-stats-<id>.json`) native sessions don't write. The per-turn strip is the working surface; bridging reducer usage → `buildStatusData` for the StatusBar chips is a Phase-2 follow-up (tracked in `docs/knowledge-debt.md`).
4. ESC mid-stream → turn ends with the interrupted marker, no stuck thinking.
5. Remove the API key → send → error banner with the plain-language message; "Try again" after re-adding the key works.
6. Quit the dev app; relaunch; Resume Browser lists the session with the YouCoded badge; resume; prior messages render; continue chatting.
7. A regular Claude Code session in the same instance still works end-to-end (spawn, chat, terminal view).

- [ ] **Step 3: Docs.**
- `youcoded/docs/provider-dependencies.md`: record every external coupling now real — AI SDK v7 surface used (`streamText`, `fullStream` part types + the delta-name churn note, mock helpers), models.dev `api.json` schema fields consumed, OpenRouter `/api/v1/models` fields + attribution headers, per-vendor key-validation endpoints used by `testConnection`. Each entry names the consuming file.
- `youcoded-dev/docs/PITFALLS.md`: append to the "Multi-Model Provider Seam" section: `native:send` is fire-and-forget by design; SessionStore coalescing invariant (replay ≡ live merge — change both together); secrets never plaintext / never in `~/.youcoded`; `errorMessage`+`'error'` state writer; ManagedSession.worker optional (guard before `.send`).
- `youcoded-dev/docs/chat-reducer.md`: document the text-segment partId merge beside the reasoning paragraph.
- [ ] **Step 4: Shut down the dev instance** (kill the run-dev process tree; verify ports 5223/9950 freed — orphaned Vite/Electron trip the next session).
- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/native-sessions
gh pr create --repo itsdestin/youcoded --base master --title "feat: Phase 1 Plan A — provider layer + native chat sessions (dormant)" --body "<summary + spec link + acceptance evidence>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Only behavior change for production users: none (everything is gated on `YOUCODED_NATIVE=1` / dormant UI). State that explicitly in the PR body, plus the follow-ups: Plan B (engine), Plan C (model manager).

---

## Self-review checklist results (author-verified)

- **Spec coverage:** §2.1→Tasks 2-3; §2.2→Tasks 4-5; §2.3→Tasks 6,8; §2.4→Tasks 8,11; §2.5→Task 12; §2.6→Tasks 7,9,13; §2.7→Tasks 8,11; §2.8→Tasks 12,13; §2.9→Tasks 1,9,10; §5 unit/protocol/parity→each task's tests; §5 live acceptance→Task 14. Status-bar tok/s (settled decision 4)→Tasks 1(c),8, verified in Task 14 step 3.
- **Known judgment points for the implementer** (not placeholders — decisions already made, execution requires reading current code): SESSION_CREATE handler shape (Task 9 Step 5b), remote-server dispatch pattern (Task 9 Step 6), InputBar provider prop threading (Task 12 Step 2), replay trigger verification (Task 13 Step 2). Each names the file, the pattern to copy, and the decision.
- **Type consistency:** `ModelBinding`/`ProviderStatus`/`CatalogModel` defined once in Task 1, imported everywhere after; `sendChatMessage(provider, sessionId, ptyText, filePaths)` used by Tasks 12; `NativeSessionHeader` defined Task 7, consumed Task 9.
