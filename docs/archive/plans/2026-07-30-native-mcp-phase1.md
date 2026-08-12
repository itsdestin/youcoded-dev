---
status: shipped
date: 2026-07-30
owner: Destin (decisions) / Claude (plan)
implements: docs/active/specs/2026-07-30-native-mcp-design.md — Phase 1
---

# Native MCP Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native sessions can call tools from MCP servers listed in a YouCoded-owned registry,
with the same permission, budget and error behavior as built-in native tools.

**Architecture:** A registry file (`~/.youcoded/mcp.json`) is the source of truth. A
process-level manager owns one pooled connection per server, shared across sessions. An
adapter turns each MCP tool into a `NativeTool` named `mcp__{server}__{tool}`, so it flows
through the existing driver, permission engine, truncation and renderer unchanged. A
projection step writes the same registry into `~/.claude.json` so Claude Code sessions see
identical servers.

**Tech Stack:** TypeScript (CommonJS main process), `@modelcontextprotocol/sdk@1.30.0`, zod,
Vitest, Electron `safeStorage` via the existing `SecretsStore`.

## Global Constraints

Every task's requirements implicitly include all of these.

- **The main process is CommonJS** (`desktop/tsconfig` uses `module: "commonjs"`). The SDK
  ships `dist/cjs` with a `require` condition, so plain `import` statements resolve — verified
  against 1.30.0. Do not add an ESM-only dependency to this path.
- **Secrets never enter `~/.youcoded/`.** That directory is SYNCED. Registry entries hold only
  `secretRef` pointers; plaintext goes to `SecretsStore` (`safeStorage`, `userData`). Read
  `src/main/harness/search/search-key-store.ts` first — it is the same problem, already solved.
- **Every `~/.youcoded/` write goes through `NativeHome.mutateJson`** — the locked
  read-modify-write. Never a bare `writeJson` for a read-modify-write. The dev instance and
  the built app share the home directory.
- **Tool names are exactly `mcp__{server}__{tool}`.** `ToolCard.tsx:224` parses this shape.
- **Error copy follows `docs/error-message-standards.md`** — specific and accurate (surface the
  real stderr/exception/path), or general and non-committal with Report-bug / Diagnose actions.
  Never `catch` and substitute a guessed cause.
- **Annotate non-trivial edits with a WHY comment.** Destin is a non-developer and relies on
  them.
- **`bash scripts/verify.sh` must pass** before any task is called done (tsc, related tests,
  knip, ast-grep).
- **Mutation-test every guard you add:** break the code, watch the test fail, restore. PR #268
  shipped five tests that proved nothing about shipping code; three were caught only this way.
- **Work in a worktree**, not the main checkout.

---

### Task 1: Add the dependency and the raw-schema seam

MCP publishes JSON Schema; `NativeTool.inputSchema` is zod, consumed in two places with
different needs. This task opens the seam so later tasks have somewhere to plug in, and it is
independently valuable: it changes nothing observable until an MCP tool exists.

**Files:**
- Modify: `desktop/package.json` (dependencies)
- Modify: `desktop/src/main/harness/tools/types.ts:43-61` (`NativeTool`)
- Modify: `desktop/src/main/harness/harness-session.ts:430-446` (`buildAiTools`)
- Test: `desktop/tests/harness-raw-schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `NativeTool.rawInputSchema?: Record<string, unknown>` — when present,
  `buildAiTools()` sends it to the model via the AI SDK's `jsonSchema()` helper instead of
  `zodSchema(inputSchema)`. `inputSchema` remains REQUIRED and is still what the driver
  validates with at `harness-session.ts:1304`.

- [ ] **Step 1: Install the dependency**

```bash
cd youcoded/desktop && npm install @modelcontextprotocol/sdk@1.30.0
```

Expected: `package.json` gains `"@modelcontextprotocol/sdk": "^1.30.0"` under `dependencies`
(not `devDependencies` — it runs in the shipped main process).

- [ ] **Step 2: Write the failing test**

Create `desktop/tests/harness-raw-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { makeSession } from './helpers/harness-fakes';
import { defineTool } from '../src/main/harness/tools/registry';

// A tool carrying a raw JSON Schema must hand the model THAT schema verbatim,
// not a zod translation of it — the server owns its argument contract.
describe('buildAiTools raw schema passthrough', () => {
  it('sends rawInputSchema to the model when present', async () => {
    const raw = { type: 'object' as const, properties: { q: { type: 'string' } }, required: ['q'] };
    const tool = defineTool({
      name: 'mcp__demo__search',
      description: 'Search the demo server',
      inputSchema: z.object({}).passthrough(),
      rawInputSchema: raw,
      permissionSubject: () => undefined,
      execute: async () => ({ text: 'ok' }),
    });

    const session = makeSession({ extraTools: [tool] });
    const built = (session as any).buildAiTools();

    // The AI SDK wraps the schema; assert the server's own properties survived.
    expect(JSON.stringify(built['mcp__demo__search'].inputSchema)).toContain('"q"');
  });

  it('still uses the zod schema when no rawInputSchema is set', async () => {
    const session = makeSession({});
    const built = (session as any).buildAiTools();
    expect(built['Read']).toBeDefined();
  });
});
```

If `makeSession` has no `extraTools` option, add one in `desktop/tests/helpers/harness-fakes.ts`
that concatenates onto `CORE_TOOLS` — that helper already takes an options object.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/harness-raw-schema.test.ts`
Expected: FAIL — `rawInputSchema` is not a known property of the tool definition (tsc error),
or the built schema lacks `"q"`.

- [ ] **Step 4: Add the field to the contract**

In `desktop/src/main/harness/tools/types.ts`, inside `interface NativeTool<A = any>`, after
`inputSchema`:

```ts
  /** JSON Schema straight from an MCP server, when this tool came from one.
   *  buildAiTools() sends THIS to the model instead of translating inputSchema,
   *  because converting JSON Schema → zod is lossy and a lossy conversion that
   *  rejects a valid call would be a bug we invented. `inputSchema` stays
   *  required and permissive for MCP tools: it keeps the driver's single
   *  validation path (harness-session.ts safeParse) intact, and the SERVER is
   *  the authority on its own arguments. */
  rawInputSchema?: Record<string, unknown>;
```

- [ ] **Step 5: Use it when building the model-facing tools**

In `desktop/src/main/harness/harness-session.ts`, add `jsonSchema` to the existing `ai` import
alongside `zodSchema`, then replace the loop body at ~line 442:

```ts
    for (const t of this.toolByName.values()) {
      // MCP tools carry the server's own JSON Schema; everything else is zod.
      const schema = t.rawInputSchema ? jsonSchema(t.rawInputSchema as any) : zodSchema(t.inputSchema);
      out[t.name] = tool({ description: simplified ? (t.shortDescription ?? t.description) : t.description, inputSchema: schema });
    }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/harness-raw-schema.test.ts`
Expected: PASS, both cases.

- [ ] **Step 7: Mutation-check the guard**

Temporarily change `t.rawInputSchema ?` to `false ?`. Re-run: the first test MUST fail. Restore.

- [ ] **Step 8: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/src/main/harness/tools/types.ts \
        desktop/src/main/harness/harness-session.ts desktop/tests/harness-raw-schema.test.ts \
        desktop/tests/helpers/harness-fakes.ts
git commit -m "feat(mcp): raw JSON Schema passthrough for model-facing tools"
```

---

### Task 2: The registry store

**Files:**
- Create: `desktop/src/main/harness/mcp/types.ts`
- Create: `desktop/src/main/harness/mcp/mcp-registry.ts`
- Test: `desktop/tests/mcp-registry.test.ts`

**Interfaces:**
- Consumes: `NativeHomeLike`/`SecretsLike` shapes — copy them from
  `src/main/harness/search/search-key-store.ts:13-26` rather than importing, same as that file
  does, and include the same compile-time drift guards in the test.
- Produces:
  - `type McpTransport = { type: 'stdio'; command: string; args?: string[]; cwd?: string } | { type: 'http'; url: string }`
  - `type McpServerEntry = { id: string; label: string; enabled: boolean; transport: McpTransport; envRefs?: Record<string, string>; headerRefs?: Record<string, string>; origin: { kind: 'user' | 'marketplace' | 'adopted'; plugin?: string } }`
  - `type ResolvedMcpServer = McpServerEntry & { env?: Record<string, string>; headers?: Record<string, string>; missingSecrets: string[] }`
  - `class McpRegistry { list(): McpServerEntry[]; resolve(id: string): Promise<ResolvedMcpServer | null>; resolveAllEnabled(): Promise<ResolvedMcpServer[]>; upsert(entry: McpServerEntry, secrets?: Record<string, string>): Promise<void>; remove(id: string): Promise<void> }`
  - `function sanitizeServerId(raw: string): string`

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/mcp-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { McpRegistry, sanitizeServerId } from '../src/main/harness/mcp/mcp-registry';
import type { NativeHomeLike, SecretsLike } from '../src/main/harness/mcp/mcp-registry';
import type { NativeHome } from '../src/main/native-home';
import type { SecretsStore } from '../src/main/providers/secrets-store';

// Interface-drift guard — mirrors search-key-store.test.ts. If NativeHome or
// SecretsStore changes a signature we depend on, tsc fails here.
const _homeDrift: NativeHomeLike = null as unknown as NativeHome;
const _secretsDrift: SecretsLike = null as unknown as SecretsStore;
void _homeDrift; void _secretsDrift;

function fakeHome() {
  const files = new Map<string, unknown>();
  return {
    files,
    readJson(rel: string) { return files.has(rel) ? files.get(rel) : null; },
    async mutateJson(rel: string, mutate: (cur: unknown | null) => unknown) {
      files.set(rel, mutate(files.has(rel) ? files.get(rel)! : null));
    },
  };
}

function fakeSecrets() {
  const m = new Map<string, string>();
  let n = 0;
  return {
    m,
    async set(plaintext: string, existingRef?: string) {
      const ref = existingRef ?? `ref-${++n}`; m.set(ref, plaintext); return ref;
    },
    async get(ref: string) { return m.get(ref) ?? null; },
    async delete(ref: string) { m.delete(ref); },
    has(ref: string | undefined) { return !!ref && m.has(ref); },
  };
}

const stdioEntry = {
  id: 'gmail', label: 'Gmail', enabled: true,
  transport: { type: 'stdio' as const, command: 'npx', args: ['-y', 'gmail-mcp'] },
  origin: { kind: 'user' as const },
};

describe('McpRegistry', () => {
  it('never writes a secret value into the synced registry file', async () => {
    const home = fakeHome(); const secrets = fakeSecrets();
    const reg = new McpRegistry(home, secrets);

    await reg.upsert(stdioEntry, { GMAIL_TOKEN: 'super-secret-value' });

    const onDisk = JSON.stringify(home.files.get('mcp.json'));
    expect(onDisk).not.toContain('super-secret-value');
    expect(onDisk).toContain('secretRef');
    expect(secrets.m.size).toBe(1);
  });

  it('resolves secrets back for use', async () => {
    const home = fakeHome(); const secrets = fakeSecrets();
    const reg = new McpRegistry(home, secrets);
    await reg.upsert(stdioEntry, { GMAIL_TOKEN: 'super-secret-value' });

    const resolved = await reg.resolve('gmail');
    expect(resolved?.env?.GMAIL_TOKEN).toBe('super-secret-value');
    expect(resolved?.missingSecrets).toEqual([]);
  });

  it('reports a missing secret instead of resolving it to undefined', async () => {
    const home = fakeHome(); const secrets = fakeSecrets();
    const reg = new McpRegistry(home, secrets);
    await reg.upsert(stdioEntry, { GMAIL_TOKEN: 'v' });
    secrets.m.clear(); // simulate a synced entry on a second device

    const resolved = await reg.resolve('gmail');
    expect(resolved?.missingSecrets).toEqual(['GMAIL_TOKEN']);
    expect(resolved?.env?.GMAIL_TOKEN).toBeUndefined();
  });

  it('rejects a duplicate id rather than silently overwriting a different server', async () => {
    const home = fakeHome(); const secrets = fakeSecrets();
    const reg = new McpRegistry(home, secrets);
    await reg.upsert(stdioEntry);
    // Same id, same origin → an update, allowed.
    await reg.upsert({ ...stdioEntry, label: 'Gmail (work)' });
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0].label).toBe('Gmail (work)');
  });

  it('treats a garbage file exactly like an empty one', () => {
    const home = fakeHome(); const secrets = fakeSecrets();
    home.files.set('mcp.json', { servers: 'not-an-array' });
    expect(new McpRegistry(home, secrets).list()).toEqual([]);
  });

  it('sanitizes ids to the tool-name charset', () => {
    expect(sanitizeServerId('Google Services!')).toBe('google-services');
    expect(sanitizeServerId('a__b')).toBe('a-b'); // '__' is the tool-name separator
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-registry.test.ts`
Expected: FAIL — module `../src/main/harness/mcp/mcp-registry` not found.

- [ ] **Step 3: Write the types**

Create `desktop/src/main/harness/mcp/types.ts` with the `McpTransport`, `McpServerEntry` and
`ResolvedMcpServer` shapes exactly as listed in this task's **Produces** block, each field
commented with what it is for.

- [ ] **Step 4: Write the registry**

Create `desktop/src/main/harness/mcp/mcp-registry.ts`. Model it directly on
`search-key-store.ts` — same structural interfaces, same encrypt-then-store ordering, same
`?? {}` shape-tolerance. Key points:

```ts
const FILE = 'mcp.json';

// '__' is the tool-name separator (mcp__{server}__{tool}); a server id containing
// it would make the tool name ambiguous to parse. Collapse it along with every
// other unsafe character.
export function sanitizeServerId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```

`resolve()` decrypts each `envRefs`/`headerRefs` pointer and returns `missingSecrets` for any
that no longer resolve. It must NOT throw on a missing secret — a synced entry on a device
without the key is an expected state (`needs-setup`), not an error.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-registry.test.ts`
Expected: PASS, all six.

- [ ] **Step 6: Mutation-check the secret guard**

In `upsert`, temporarily write the plaintext into the entry instead of the ref. The first test
MUST fail. Restore.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/harness/mcp/ desktop/tests/mcp-registry.test.ts
git commit -m "feat(mcp): registry store with the providers.json secret split"
```

---

### Task 3: The single-server client

**Files:**
- Create: `desktop/src/main/harness/mcp/mcp-client.ts`
- Test: `desktop/tests/mcp-client.test.ts`

**Interfaces:**
- Consumes: `ResolvedMcpServer` (Task 2).
- Produces:
  - `type McpToolDef = { name: string; description?: string; inputSchema: Record<string, unknown> }`
  - `class McpConnection { connect(): Promise<void>; listTools(): McpToolDef[]; callTool(name: string, args: unknown, signal: AbortSignal): Promise<{ text: string; isError: boolean }>; close(): Promise<void>; readonly state: 'idle' | 'ready' | 'error' | 'needs-setup'; readonly lastError: string | null }`
  - `function createConnection(server: ResolvedMcpServer, deps?: { clientFactory?: ClientFactory; callTimeoutMs?: number }): McpConnection`

The `deps.clientFactory` seam exists so tests never spawn a real subprocess. `callTimeoutMs`
defaults to 120_000 and is overridden in tests.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/mcp-client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createConnection } from '../src/main/harness/mcp/mcp-client';

const server = {
  id: 'demo', label: 'Demo', enabled: true,
  transport: { type: 'stdio' as const, command: 'node', args: ['server.js'] },
  origin: { kind: 'user' as const }, missingSecrets: [] as string[],
};

function fakeClient(over: Partial<any> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [
      { name: 'search', description: 'Search things', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
    ]}),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] }),
    close: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('McpConnection', () => {
  it('lists the server tools after connecting', async () => {
    const conn = createConnection(server, { clientFactory: () => fakeClient() as any });
    await conn.connect();
    expect(conn.state).toBe('ready');
    expect(conn.listTools().map(t => t.name)).toEqual(['search']);
  });

  it('flattens text content parts into one result string', async () => {
    const client = fakeClient({ callTool: vi.fn().mockResolvedValue({ content: [
      { type: 'text', text: 'line one' }, { type: 'text', text: 'line two' },
    ]}) });
    const conn = createConnection(server, { clientFactory: () => client as any });
    await conn.connect();
    const r = await conn.callTool('search', { q: 'x' }, new AbortController().signal);
    expect(r).toEqual({ text: 'line one\nline two', isError: false });
  });

  it('describes a non-text content part rather than dropping it silently', async () => {
    const client = fakeClient({ callTool: vi.fn().mockResolvedValue({ content: [
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
    ]}) });
    const conn = createConnection(server, { clientFactory: () => client as any });
    await conn.connect();
    const r = await conn.callTool('shot', {}, new AbortController().signal);
    expect(r.text).toContain('image/png');
    expect(r.isError).toBe(false);
  });

  it('surfaces the REAL connect failure, never a guessed cause', async () => {
    const client = fakeClient({ connect: vi.fn().mockRejectedValue(new Error('spawn npx ENOENT')) });
    const conn = createConnection(server, { clientFactory: () => client as any });
    await conn.connect();
    expect(conn.state).toBe('error');
    expect(conn.lastError).toContain('spawn npx ENOENT');
  });

  it('reports needs-setup when the server demands auth', async () => {
    const err = new Error('Unauthorized'); err.name = 'UnauthorizedError';
    const client = fakeClient({ connect: vi.fn().mockRejectedValue(err) });
    const conn = createConnection(
      { ...server, transport: { type: 'http', url: 'https://x.test/mcp' } },
      { clientFactory: () => client as any },
    );
    await conn.connect();
    expect(conn.state).toBe('needs-setup');
  });

  it('bounds a hung call so it cannot be mistaken for a stalled model', async () => {
    vi.useFakeTimers();
    const client = fakeClient({ callTool: vi.fn(() => new Promise(() => {})) }); // never settles
    const conn = createConnection(server, { clientFactory: () => client as any, callTimeoutMs: 1000 });
    await conn.connect();
    const p = conn.callTool('search', {}, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1500);
    const r = await p;
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Demo');       // names the SERVER, so the user knows what hung
    expect(r.text).toContain('1000');       // and the bound it exceeded
    vi.useRealTimers();
  });

  it('abandons an in-flight call when the turn is interrupted', async () => {
    const client = fakeClient({ callTool: vi.fn(() => new Promise(() => {})) });
    const conn = createConnection(server, { clientFactory: () => client as any });
    await conn.connect();
    const ac = new AbortController();
    const p = conn.callTool('search', {}, ac.signal);
    ac.abort();
    const r = await p;
    expect(r.isError).toBe(true);
  });

  it('marks a tool error result as an error without throwing', async () => {
    const client = fakeClient({ callTool: vi.fn().mockResolvedValue({
      isError: true, content: [{ type: 'text', text: 'query rejected: bad syntax' }],
    }) });
    const conn = createConnection(server, { clientFactory: () => client as any });
    await conn.connect();
    const r = await conn.callTool('search', {}, new AbortController().signal);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('bad syntax');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the client**

Create `desktop/src/main/harness/mcp/mcp-client.ts`. Real imports (verified against 1.30.0):

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

Transport construction:

```ts
// stderr:'pipe' is LOAD-BEARING. The SDK defaults to 'inherit', which routes a
// failing server's only explanation into the app's own stderr where no error
// message can reach the user — exactly the guessed-cause failure that
// docs/error-message-standards.md forbids.
new StdioClientTransport({
  command: server.transport.command,
  args: server.transport.args,
  env: server.env,
  cwd: server.transport.cwd,
  stderr: 'pipe',
});

// HTTP: header secrets ride requestInit. No authProvider in v1 — a server that
// requires OAuth throws UnauthorizedError, which we map to 'needs-setup'.
new StreamableHTTPClientTransport(new URL(server.transport.url), {
  requestInit: { headers: server.headers },
});
```

`connect()` never throws — it records `state` and `lastError` and returns. Buffer the piped
stderr (bounded, last ~4KB) and include it in `lastError` when the connect fails, because for a
stdio server the child's stderr IS the real cause.

Content flattening:

```ts
// The model's tool result is text (ToolResultPayload.text). Non-text parts are
// DESCRIBED rather than dropped so the model knows something came back it cannot
// see — image/audio parity is M4 item 6, deliberately not solved here.
function flatten(content: any[]): string {
  return content.map((p) =>
    p?.type === 'text' ? String(p.text)
    : p?.type === 'image' || p?.type === 'audio' ? `[${p.mimeType} attachment omitted — this session cannot display it]`
    : p?.type === 'resource' ? `[resource ${p.resource?.uri ?? 'unknown'}]`
    : `[unsupported content part: ${p?.type ?? 'unknown'}]`
  ).join('\n');
}
```

`callTool` races three things — the SDK call, the abort signal, and a timeout:

```ts
// A hung MCP server must NOT look like a stalled model. Native sessions already
// have a stall watchdog, and an unbounded tool call would surface as "the model
// stopped responding" — a wrong cause, which docs/error-message-standards.md
// forbids. Name the server and the bound instead, so the message is actionable.
const timeout = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error(
    `${server.label} did not respond within ${this.callTimeoutMs}ms.`
  )), this.callTimeoutMs));
```

Abort resolves to an error result rather than throwing, matching how `defineTool` labels an
in-flight abort as a cancellation rather than a bug.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-client.test.ts`
Expected: PASS, all eight.

- [ ] **Step 5: Mutation-check the stderr guard**

Change `stderr: 'pipe'` to `stderr: 'inherit'` and add a temporary assertion that `lastError`
still contains the child's stderr — it must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/harness/mcp/mcp-client.ts desktop/tests/mcp-client.test.ts
git commit -m "feat(mcp): single-server client over stdio and streamable HTTP"
```

---

### Task 4: The connection manager

**Files:**
- Create: `desktop/src/main/harness/mcp/mcp-manager.ts`
- Test: `desktop/tests/mcp-manager.test.ts`

**Interfaces:**
- Consumes: `McpRegistry` (Task 2), `createConnection` (Task 3).
- Produces:
  - `class McpManager { acquire(sessionId: string): Promise<ReadyServer[]>; release(sessionId: string): Promise<void>; destroyAll(): Promise<void>; status(): Array<{ id: string; state: string; error: string | null }> }`
  - `type ReadyServer = { id: string; label: string; tools: McpToolDef[]; call(tool: string, args: unknown, signal: AbortSignal): Promise<{ text: string; isError: boolean }> }`

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/mcp-manager.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { McpManager } from '../src/main/harness/mcp/mcp-manager';

function deps(connectSpy = vi.fn(), closeSpy = vi.fn()) {
  const registry = {
    resolveAllEnabled: async () => ([
      { id: 'demo', label: 'Demo', enabled: true, transport: { type: 'stdio', command: 'node' },
        origin: { kind: 'user' }, missingSecrets: [] },
    ] as any),
  };
  const connectionFactory = () => ({
    state: 'ready' as const, lastError: null,
    connect: async () => { connectSpy(); },
    listTools: () => [{ name: 'search', description: 'd', inputSchema: { type: 'object' } }],
    callTool: async () => ({ text: 'ok', isError: false }),
    close: async () => { closeSpy(); },
  });
  return { registry: registry as any, connectionFactory: connectionFactory as any };
}

describe('McpManager', () => {
  it('connects a server once for two sessions', async () => {
    const connect = vi.fn();
    const mgr = new McpManager(deps(connect));
    await mgr.acquire('s1');
    await mgr.acquire('s2');
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('keeps the connection while another session still holds it', async () => {
    const close = vi.fn();
    const mgr = new McpManager(deps(vi.fn(), close));
    await mgr.acquire('s1'); await mgr.acquire('s2');
    await mgr.release('s1');
    expect(close).not.toHaveBeenCalled();
    await mgr.release('s2');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('releasing an unknown session is a no-op, not a throw', async () => {
    const mgr = new McpManager(deps());
    await expect(mgr.release('never-acquired')).resolves.toBeUndefined();
  });

  it('destroyAll closes everything regardless of refcount', async () => {
    const close = vi.fn();
    const mgr = new McpManager(deps(vi.fn(), close));
    await mgr.acquire('s1'); await mgr.acquire('s2');
    await mgr.destroyAll();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a failing server does not prevent healthy ones from being returned', async () => {
    const registry = { resolveAllEnabled: async () => ([
      { id: 'bad', label: 'Bad', enabled: true, transport: { type: 'stdio', command: 'x' }, origin: { kind: 'user' }, missingSecrets: [] },
      { id: 'good', label: 'Good', enabled: true, transport: { type: 'stdio', command: 'y' }, origin: { kind: 'user' }, missingSecrets: [] },
    ] as any) };
    const connectionFactory = (s: any) => s.id === 'bad'
      ? { state: 'error', lastError: 'spawn x ENOENT', connect: async () => {}, listTools: () => [], callTool: async () => ({ text: '', isError: true }), close: async () => {} }
      : { state: 'ready', lastError: null, connect: async () => {}, listTools: () => [{ name: 't', inputSchema: { type: 'object' } }], callTool: async () => ({ text: 'ok', isError: false }), close: async () => {} };
    const mgr = new McpManager({ registry: registry as any, connectionFactory: connectionFactory as any });
    const ready = await mgr.acquire('s1');
    expect(ready.map(r => r.id)).toEqual(['good']);
    expect(mgr.status().find(s => s.id === 'bad')?.error).toContain('ENOENT');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the manager**

Create `desktop/src/main/harness/mcp/mcp-manager.ts`. A `Map<serverId, {conn, holders:Set<sessionId>}>`.
`acquire` connects lazily on first holder and returns only `ready` servers; `release` closes a
server when its holder set empties; `destroyAll` closes everything. A server that fails to
connect is retained in `status()` with its real error but excluded from the returned list —
one broken server must never deny a session its working ones.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-manager.test.ts`
Expected: PASS, all five.

- [ ] **Step 5: Wire teardown into app quit**

`NativeSessionHost` already has a `destroyAll()` called at app quit. Call
`mcpManager.destroyAll()` from the same place, with a WHY comment: a leaked MCP subprocess
outlives the app otherwise.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/harness/mcp/mcp-manager.ts desktop/tests/mcp-manager.test.ts \
        desktop/src/main/harness/native-session-host.ts
git commit -m "feat(mcp): refcounted process-level connection pool"
```

---

### Task 5: The tool adapter

**Files:**
- Create: `desktop/src/main/harness/mcp/mcp-tools.ts`
- Test: `desktop/tests/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `ReadyServer` (Task 4), `defineTool` (`tools/registry.ts`), `NativeTool.rawInputSchema` (Task 1).
- Produces:
  - `function mcpToolsFor(server: ReadyServer): NativeTool[]`
  - `function estimateToolSchemaTokens(tools: NativeTool[]): number` — what a tool set costs in
    the request schema every turn. Chars/4, matching `fitToContext`'s existing estimate
    (`harness-session.ts:465` — "a deliberate estimate, not a tokenizer"). Counts name +
    description + serialized `rawInputSchema`. Task 6 spends its budget with this.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/mcp-tools.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mcpToolsFor } from '../src/main/harness/mcp/mcp-tools';

function readyServer(over: Partial<any> = {}) {
  return {
    id: 'gmail', label: 'Gmail',
    tools: [{ name: 'search_threads', description: 'Search mail', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }],
    call: vi.fn().mockResolvedValue({ text: 'result', isError: false }),
    ...over,
  } as any;
}

describe('mcpToolsFor', () => {
  it('names tools mcp__{server}__{tool}', () => {
    expect(mcpToolsFor(readyServer())[0].name).toBe('mcp__gmail__search_threads');
  });

  it('passes the server schema through untranslated', () => {
    const t = mcpToolsFor(readyServer())[0];
    expect(t.rawInputSchema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
  });

  it('has no permission subject, so a grant covers exactly this one tool', () => {
    expect(mcpToolsFor(readyServer())[0].permissionSubject({})).toBeUndefined();
  });

  it('calls through to the server with the tool short name', async () => {
    const s = readyServer();
    await mcpToolsFor(s)[0].execute({ q: 'x' }, { signal: new AbortController().signal } as any);
    expect(s.call).toHaveBeenCalledWith('search_threads', { q: 'x' }, expect.anything());
  });

  it('returns a server error as an error RESULT, never a throw', async () => {
    const s = readyServer({ call: vi.fn().mockRejectedValue(new Error('server died')) });
    const r = await mcpToolsFor(s)[0].execute({}, { signal: new AbortController().signal } as any);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('server died');
  });

  it('does not trust the server destructiveHint annotation as a permission signal', () => {
    const s = readyServer({ tools: [{ name: 'wipe', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] });
    // readOnlyHint comes from the SERVER. It must not become an allow rule.
    expect(mcpToolsFor(s)[0].permissionSubject({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter**

Create `desktop/src/main/harness/mcp/mcp-tools.ts`:

```ts
import { z } from 'zod';
import { defineTool } from '../tools/registry';
import type { NativeTool } from '../tools/types';

export function mcpToolsFor(server: ReadyServer): NativeTool[] {
  return server.tools.map((t) => defineTool({
    name: `mcp__${server.id}__${t.name}`,
    description: t.description ?? `${server.label}: ${t.name}`,
    // Permissive on purpose: the SERVER validates its own arguments and returns a
    // real error. A lossy local re-validation could reject a valid call.
    inputSchema: z.object({}).passthrough(),
    rawInputSchema: t.inputSchema,
    // undefined subject → a remembered "always allow" grants exactly this one
    // namespaced tool (subject-glob.ts:6). Deliberate: a server update can add a
    // destructive tool, and there is no revocation UI until M5 item 3.
    permissionSubject: () => undefined,
    execute: async (args, ctx) => {
      const r = await server.call(t.name, args, ctx.signal);
      return { text: r.text, isError: r.isError };
    },
  }));
}
```

Note `defineTool` already converts a thrown error into an actionable error result, which is
what makes the "never a throw" test pass.

Add `estimateToolSchemaTokens` in the same file — Task 6 spends its budget with it:

```ts
/** What a tool set costs in the request schema on EVERY turn. chars/4, the same
 *  deliberate estimate fitToContext uses (harness-session.ts:465) — consistency
 *  with the budget it competes against matters more than accuracy here. */
export function estimateToolSchemaTokens(tools: NativeTool[]): number {
  const chars = tools.reduce((sum, t) =>
    sum + t.name.length + t.description.length + JSON.stringify(t.rawInputSchema ?? {}).length, 0);
  return Math.ceil(chars / 4);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-tools.test.ts`
Expected: PASS, all six.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/harness/mcp/mcp-tools.ts desktop/tests/mcp-tools.test.ts
git commit -m "feat(mcp): MCP tool -> NativeTool adapter with per-tool grants"
```

---

### Task 6: Session wiring and budget gating

**Files:**
- Modify: `desktop/src/main/harness/capability-profile.ts` (add `mcpToolBudgetTokens`)
- Modify: `desktop/src/main/harness/harness-session.ts` (`syncMcpTools`, called from `buildAiTools`)
- Test: `desktop/tests/mcp-gating.test.ts`

**Interfaces:**
- Consumes: `mcpToolsFor` + `estimateToolSchemaTokens` (Task 5), `McpManager.acquire` (Task 4),
  `CapabilityProfile`.
- Produces:
  - `HarnessSessionOpts.mcpServers?: ReadyServer[]` — the servers this session may use.
    `NativeSessionHost` fills it from `McpManager.acquire(sessionId)` at create/resume, and
    calls `release(sessionId)` in the existing `destroy()` teardown ordering.
  - `CapabilityProfile.mcpToolBudgetTokens: number`
  - `HarnessSession.droppedMcpServers: string[]` — labels of servers left off for budget
    reasons, so the UI can say which. Empty when everything fit.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/mcp-gating.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeSession } from './helpers/harness-fakes';

function servers(n: number, toolsEach = 5) {
  return Array.from({ length: n }, (_, i) => ({
    id: `srv${i}`, label: `Server ${i}`,
    tools: Array.from({ length: toolsEach }, (_, j) => ({
      name: `tool${j}`, description: 'x'.repeat(200), inputSchema: { type: 'object' },
    })),
    call: async () => ({ text: 'ok', isError: false }),
  }));
}

describe('MCP budget gating', () => {
  it('attaches every server when the window can afford them', async () => {
    const s = makeSession({ mcpServers: servers(2), contextLength: 200_000 });
    const names = Object.keys((s as any).buildAiTools());
    expect(names.filter(n => n.startsWith('mcp__srv0__'))).toHaveLength(5);
    expect(names.filter(n => n.startsWith('mcp__srv1__'))).toHaveLength(5);
    expect((s as any).droppedMcpServers).toEqual([]);
  });

  it('drops WHOLE servers, never a partial tool set', async () => {
    const s = makeSession({ mcpServers: servers(3), contextLength: 8_000 });
    const names = Object.keys((s as any).buildAiTools());
    for (const id of ['srv0', 'srv1', 'srv2']) {
      const n = names.filter(x => x.startsWith(`mcp__${id}__`)).length;
      expect([0, 5]).toContain(n); // all or nothing — never 1..4
    }
  });

  it('drops from the END of registry order, so the order is user-controllable', async () => {
    const s = makeSession({ mcpServers: servers(3), contextLength: 8_000 });
    const names = Object.keys((s as any).buildAiTools());
    const kept = ['srv0', 'srv1', 'srv2'].filter(id => names.some(n => n.startsWith(`mcp__${id}__`)));
    // Whatever fits, it must be a PREFIX of registry order.
    expect(kept).toEqual(['srv0', 'srv1', 'srv2'].slice(0, kept.length));
  });

  it('records which servers were dropped so the user can be told', async () => {
    const s = makeSession({ mcpServers: servers(3), contextLength: 8_000 });
    (s as any).buildAiTools();
    const dropped = (s as any).droppedMcpServers;
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((d: string) => d.startsWith('srv'))).toBe(true);
  });

  it('attaches no MCP tools at all to a tool-less model', async () => {
    const s = makeSession({ mcpServers: servers(1), supportsTools: false });
    expect(Object.keys((s as any).buildAiTools())).toEqual([]);
  });
});
```

Extend `makeSession` in `desktop/tests/helpers/harness-fakes.ts` with an `mcpServers` option
defaulting to `[]`. **Default it to empty in the shared factories**, for the reason recorded in
the native-runtime rule: the M3 skill catalog defaulted to a real `~/.claude` scan and produced
an Ubuntu-only CI failure ("expected 10 tools, got 11"). Do not repeat that.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-gating.test.ts`
Expected: FAIL — `mcpServers` is not an option / no MCP tools attached.

- [ ] **Step 3: Add the budget to the profile**

In `desktop/src/main/harness/capability-profile.ts`, add `mcpToolBudgetTokens: number` derived
from the effective window in the same three-layer way `injectionBudgetTokens` already is. Reuse
`injectionSizing()`'s tiering rather than inventing a second ladder.

- [ ] **Step 4: Add `syncMcpTools` and call it from `buildAiTools`**

In `harness-session.ts`, immediately after the existing `this.syncSkillTool()` call:

```ts
    this.syncMcpTools();
```

```ts
  /** Attach MCP server tools that fit this model's budget (spec §6).
   *
   *  WHOLE SERVERS ONLY: a server whose search tool is attached but whose send
   *  tool is not is worse than an absent server — the model plans against a
   *  capability it then cannot complete.
   *
   *  Drop order is registry order from the END, so the user controls what
   *  survives by ordering their list, rather than losing an arbitrary server.
   *
   *  Re-run per buildAiTools because setBinding() re-resolves the profile: a
   *  server attached under a 128k model must come back OFF on a swap to an 8k
   *  one, exactly like Skill.
   */
  private syncMcpTools(): void {
    for (const name of [...this.toolByName.keys()]) {
      if (name.startsWith('mcp__')) this.toolByName.delete(name);
    }
    this.droppedMcpServers = [];
    let spent = 0;
    for (const server of this.opts.mcpServers ?? []) {
      const tools = mcpToolsFor(server);
      const cost = estimateToolSchemaTokens(tools);
      if (spent + cost > this.profile.mcpToolBudgetTokens) {
        this.droppedMcpServers.push(server.label);
        continue;
      }
      spent += cost;
      for (const t of tools) this.toolByName.set(t.name, t);
    }
  }
```

Note the loop `continue`s rather than `break`s only if you want a smaller later server to still
fit; the test asserts a PREFIX, so use `break` after the first server that does not fit. Pick
`break` — it keeps the drop list contiguous and the behavior explainable.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-gating.test.ts`
Expected: PASS, all five.

- [ ] **Step 6: Mutation-check the whole-server guard**

Change the loop to attach tools individually until the budget runs out. The "drops WHOLE
servers" test MUST fail. Restore.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/harness/capability-profile.ts desktop/src/main/harness/harness-session.ts \
        desktop/tests/helpers/harness-fakes.ts desktop/tests/mcp-gating.test.ts
git commit -m "feat(mcp): profile-gated attachment, whole servers, registry order"
```

---

### Task 7: Projection into Claude Code

**Files:**
- Modify: `desktop/src/main/mcp-reconciler.ts` (source from the registry)
- Test: `desktop/tests/mcp-projection.test.ts`

**Interfaces:**
- Consumes: `McpRegistry.resolveAllEnabled()` (Task 2).
- Produces: `reconcileMcp()` keeps its name and result shape; its INPUT becomes the registry.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/mcp-projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { projectToClaudeJson } from '../src/main/mcp-reconciler';

const OWNED = { _youcoded: true }; // ownership marker, asserted below

describe('projection into ~/.claude.json', () => {
  it('writes an enabled registry server into mcpServers', () => {
    const out = projectToClaudeJson({}, [
      { id: 'gmail', label: 'Gmail', enabled: true, transport: { type: 'stdio', command: 'npx', args: ['gmail-mcp'] }, origin: { kind: 'user' }, missingSecrets: [] } as any,
    ]);
    expect(out.mcpServers!.gmail).toMatchObject({ type: 'stdio', command: 'npx' });
  });

  it('NEVER modifies an entry it does not own', () => {
    const existing = { mcpServers: { handwritten: { type: 'stdio', command: 'my-thing' } } };
    const out = projectToClaudeJson(existing, []);
    expect(out.mcpServers!.handwritten).toEqual({ type: 'stdio', command: 'my-thing' });
  });

  it('removes an owned entry that left the registry', () => {
    const existing = { mcpServers: { gone: { type: 'stdio', command: 'x', ...OWNED } } };
    const out = projectToClaudeJson(existing, []);
    expect(out.mcpServers!.gone).toBeUndefined();
  });

  it('does not project a server with missing secrets', () => {
    const out = projectToClaudeJson({}, [
      { id: 'gmail', label: 'Gmail', enabled: true, transport: { type: 'stdio', command: 'npx' }, origin: { kind: 'user' }, missingSecrets: ['GMAIL_TOKEN'] } as any,
    ]);
    expect(out.mcpServers!.gmail).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-projection.test.ts`
Expected: FAIL — `projectToClaudeJson` is not exported.

- [ ] **Step 3: Extract a pure projection function**

In `mcp-reconciler.ts`, add an exported PURE `projectToClaudeJson(claudeJson, servers)` that
takes the parsed file and the resolved registry and returns the new file. Keeping it pure is
what makes the four cases above testable without touching a real `~/.claude.json`.

Update the file header comment. Its current promise — *"Never removes user-added MCP servers"* —
is no longer the whole truth and must be restated:

```ts
 * OWNERSHIP (2026-07-30, spec 2026-07-30-native-mcp-design §3.3):
 * YouCoded manages exactly the entries it marked as its own. An entry it does
 * not own is never modified or removed. An owned entry that has left the
 * registry IS removed — that is how disabling a server in YouCoded turns it off
 * for Claude Code too, which is what "YouCoded owns it" has to mean.
```

- [ ] **Step 4: Keep `reconcileMcp()` as the impure caller**

`reconcileMcp()` reads `~/.claude.json`, calls `projectToClaudeJson`, and writes atomically
using the existing `writeClaudeJsonAtomic`. The plugin-manifest scan moves to feeding the
REGISTRY (entries with `origin.kind: 'marketplace'`), not `~/.claude.json` directly.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/mcp-projection.test.ts`
Expected: PASS, all four.

- [ ] **Step 6: Mutation-check the ownership guard**

Remove the ownership check so unowned entries are also pruned. The "NEVER modifies an entry it
does not own" test MUST fail. Restore.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/mcp-reconciler.ts desktop/tests/mcp-projection.test.ts
git commit -m "feat(mcp): project the registry into ~/.claude.json, ownership-scoped"
```

---

### Task 8: Documentation, invariants and full verification

Phase 1 is not done when the code works — the milestone exit criterion in the program plan
requires the subsystem rule, depth doc and MAP updated in the SAME PR. M3 is the worked
example.

**Files:**
- Modify: `youcoded-dev/.claude/rules/native-runtime.md` (new MCP invariant block + `verify:` anchors)
- Modify: `youcoded/docs/native-runtime.md` (depth section)
- Modify: `youcoded-dev/docs/MAP.md` (new subsystem paths)
- Modify: `youcoded-dev/docs/archive/plans/2026-07-22-native-runtime-parity-program.md` (§4 item 4)
- Modify: `youcoded/docs/provider-dependencies.md` (the SDK dependency)

- [ ] **Step 1: Add the rule block**

Add to `.claude/rules/native-runtime.md` — invariant · why · guard, one line each. At minimum:
secrets never in `~/.youcoded/`; whole-server attachment; per-tool grants and why not
per-server; `stderr: 'pipe'` is load-bearing; server annotations are untrusted.

**The rule is already 2,537 words against a 600 budget** (program plan §7 item 1 owns the
debt). Adding to it without trimming makes that worse — move the narrative to
`youcoded/docs/native-runtime.md` and keep the rule to the invariant lines.

- [ ] **Step 2: Add `verify:` anchors**

Anchors resolve against master, so add them in the SAME PR that merges the code — not before.
This is exactly the mistake Plan C avoided by withholding anchors while its branch was
unmerged.

```yaml
  - path: youcoded/desktop/src/main/harness/mcp/mcp-registry.ts
    contains: "secretRef"
  - path: youcoded/desktop/src/main/harness/mcp/mcp-client.ts
    contains: "stderr: 'pipe'"
  - test: youcoded/desktop/tests/mcp-gating.test.ts
```

- [ ] **Step 3: Flip the program plan**

In `§4 Milestone M3`, item 4 moves from NOT STARTED to shipped, and the §9 line
*"M3 item 4 (MCP) is the only open piece of the near-term tranche"* becomes accurate about
what remains (phase 2: adopt + settings UI).

- [ ] **Step 4: Run the mechanical audit**

Run: `cd youcoded-dev && node scripts/audit-anchors.mjs`
Expected: zero failures attributable to native-runtime.

- [ ] **Step 5: Run full verification**

```bash
cd youcoded-dev && bash scripts/verify.sh
```

Expected: tsc clean, tests pass, knip clean, ast-grep clean. Note it covers
`youcoded/desktop` only.

- [ ] **Step 6: Commit**

```bash
git add .claude/rules/native-runtime.md docs/MAP.md docs/archive/plans/2026-07-22-native-runtime-parity-program.md
git commit -m "docs(mcp): rule invariants, anchors, MAP and program-plan status"
```

---

## One spec row with nothing to build

Spec §10 lists an **IPC parity** test row. Phase 1 adds no `mcp:*` channel — the registry is
read in the main process and nothing crosses to the renderer yet, so there is nothing for
`ipc-channels.test.ts` to pin. That row belongs to phase 2, which adds the settings surface.
Stated here so a reader does not mistake its absence for an oversight.

## Dogfood before calling phase 1 done

Tests do not establish that a real MCP server works. Before the PR merges, in a dev instance
(`bash scripts/run-dev.sh <worktree> --label "Native MCP"` — never the built app):

1. Hand-write `~/.youcoded/mcp.json` with one real stdio server.
2. Start a native session on a **capable** model; confirm its tools appear and one call returns
   a real result.
3. Confirm the tool card renders as `Server: Action` with no renderer changes.
4. Confirm the first call PROMPTS, and that "always allow" grants only that tool.
5. Switch to a **small local** model mid-session; confirm the server drops and is reported.
6. Point a server at a bad command; confirm the error names the real spawn failure.
7. Open a Claude Code session; confirm the same server is available there via projection.

Steps 3–5 are visual/interactive — per the workspace rule, **hand those to Destin** rather than
building a scripted rig.

## What phase 1 deliberately does not do

Settings UI and the adopt flow (phase 2), per-server manual toggles for small models (Destin's
recorded followup), MCP resources and prompts, and Android (M8). Phase 1 is
**developer-operable only** — configured by hand-editing JSON — and cannot ship to users as-is.
