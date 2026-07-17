---
status: active
---

# Phase 2 Plan B — Web Tools + AskUserQuestion + Presets: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native sessions gain WebFetch, WebSearch (Exa-keyless → DDG → keyed chain), and AskUserQuestion, plus the Assistant/Coder preset family with a picker in the new-session forms — completing spec §3 behind the same dormant `YOUCODED_NATIVE` gate.

**Architecture:** Three new `NativeTool`s slot into the existing `defineTool()`/driver pipeline from Plan A. WebFetch/WebSearch share a new SSRF-guarded fetch helper (every redirect hop validated); WebSearch walks a data-driven backend chain (shipped + remote-refreshed, curated-models pattern) through an injected `SearchService`. AskUserQuestion rides the EXISTING permission-ask rail end-to-end — the renderer card, `permission:respond` channel, and broker already exist; the only gap is that the broker currently drops `decision.updatedInput` (the answers). Presets become real: two manifests (Assistant default-`ask`, Coder default-`auto-edit`), main-side prompt bodies, a preset registry with the legacy `'chat'`→Assistant mapping, and picker cards in both new-session forms.

**Tech Stack:** TypeScript (Electron main + React renderer), zod, vitest, ai@7.0.22 (unchanged), new deps: `@mozilla/readability` + `@mixmark-io/domino` (article extraction without jsdom) + `turndown` (HTML→Markdown).

**Spec:** `youcoded-dev/docs/active/specs/2026-07-15-phase2-native-harness-design.md` §3 (binding; §0 settled decisions apply). Research: `2026-07-15-web-search-backends.md`.

---

## Plan-level decisions (made here, per spec "plan decides")

1. **AskUserQuestion folds into the permission-respond channel — no new IPC.** The existing `AskUserQuestionCard` (ToolCard.tsx:452-634) already sends `{ decision: { behavior: 'allow', updatedInput: { questions, answers } } }` through `window.claude.session.respondToPermission`, which already routes `native-` ids to the broker. The shapes unify cleanly; we extend `AskDecision` with `updatedInput` instead of adding `native:ask-user-respond`.
2. **AskUserQuestion is driver-routed, not executed.** A new `interactive: true` flag on `NativeTool` makes the driver call `askUser()` directly (skipping guards/decide — asking permission to ask a question is absurd) and format the returned answers as the tool result. Pause/interrupt/cancel semantics come free from the existing ask rail.
3. **Preset permission posture = `defaultMode`, not presetRules.** The engine's layer order is `presetRules → modeRules → denyList → remembered` (last match wins), so mode rules always override preset rules — a Coder "edits allow" presetRule would be dead under `ask` mode. The manifest's existing `permissionPolicy: 'ask' | 'auto-edit' | 'full-auto' | Record<...>` field expresses this: a string sets the session's STARTING mode (`modeFor` seed); the Record form maps to presetRules (kept generic for Phase 3, unused by the two v1 presets). Coder = `'auto-edit'` (spec: "reads/edits allow; bash ask"), Assistant = `'ask'`.
4. **"Reads + web free" lands in the mode baselines.** `rulesForMode()` gains `WebFetch`/`WebSearch` in its `alwaysAllowed` list (same slot as Read/Glob/Grep) — both presets, all modes, per the spec's preset table. Remembered/deny rules can still override (they're higher layers).
5. **Search keys reuse `SecretsStore` + a new `~/.youcoded/search-providers.json` holding only `secretRef` pointers** (mirroring `providers.json`; ciphertext never enters the syncable home). New IPC family `search:*` with full 5-surface parity. UI: a "Search Providers" block in ModelProvidersPopup — Tavily/Exa do NOT enter `ProviderType` (they have no `languageModel()`).
6. **Chain order ships as data AND is remote-refreshable** (investigation caution #1): `SHIPPED_SEARCH_CHAIN` + `search-chain.json` at the youcoded repo root, refreshed via the exact `CuratedCatalog` freshness ladder (fresh cache → remote → cache → shipped; schemaVersion-gated).
7. **Chain order: `tavily (keyed-only) → exa → ddg`.** Keyless users get Exa first (the sanctioned default); a user who added a Tavily key clearly wants it used. An Exa key upgrades the exa entry in place (same endpoint/code path — investigation).
8. **`SearchService` is injected via `HarnessSessionOpts.toolServices` → `ToolContext.services`** (explicit injection, consistent with Plan A's `askUser`/`decide` closures; unit tests inject fakes). WebFetch stays pure (no service).
9. **WebFetch does NOT run a secondary summarization model** (CC does; we don't have a cheap side-channel model). The result is the Readability-extracted Markdown itself; the optional `prompt` input is accepted (CC shape, card displays it) and echoed as a header line so the model remembers what it wanted.
10. **SSRF guard honesty:** we validate scheme + literal IPs + DNS-resolved addresses on EVERY hop, but we fetch by hostname afterward, so a TOCTOU DNS-rebind is theoretically possible. Same "honest friction, not a security boundary" posture as Plan A's Bash guard — PITFALLS entry ships with the tool.

## File structure

```
youcoded/desktop/
  src/main/harness/tools/net-guard.ts            NEW  SSRF checks + guardedFetch (manual redirects)
  src/main/harness/tools/web-fetch.ts            NEW  WebFetch tool
  src/main/harness/tools/web-search.ts           NEW  WebSearch tool (thin over SearchService)
  src/main/harness/tools/ask-user-question.ts    NEW  AskUserQuestion tool + formatAnswers()
  src/main/harness/tools/types.ts                MOD  interactive flag; ToolContext.services
  src/main/harness/tools/index.ts                MOD  append the three tools
  src/main/harness/search/search-chain.ts        NEW  shipped + remote chain data
  src/main/harness/search/search-key-store.ts    NEW  secretRef persistence (NativeHome)
  src/main/harness/search/backends/exa.ts        NEW  keyless/keyed Exa MCP client
  src/main/harness/search/backends/ddg.ts        NEW  DDG HTML fallback
  src/main/harness/search/backends/tavily.ts     NEW  Tavily keyed client
  src/main/harness/search/search-service.ts      NEW  chain walk + key resolution + test()
  src/main/harness/preset-registry.ts            NEW  resolvePreset(harnessId) incl. 'chat' mapping
  src/main/harness/prompts/assistant-default.ts  NEW  Assistant prompt body (ORIGINAL prose)
  src/main/harness/permission-broker.ts          MOD  updatedInput passthrough
  src/main/harness/harness-session.ts            MOD  interactive routing; toolServices
  src/main/harness/native-session-host.ts        MOD  preset wiring; getPermissionMode/getHarnessId
  src/shared/harness-manifest.ts                 MOD  ASSISTANT/CODER presets; CHAT removed
  src/shared/permission-types.ts                 MOD  web tools in alwaysAllowed
  src/shared/types.ts                            MOD  IPC consts; SessionInfo.harnessId
  src/main/ipc-handlers.ts                       MOD  search IPC; preset threading; service wiring
  src/main/preload.ts                            MOD  window.claude.search + create passthrough
  src/renderer/remote-shim.ts                    MOD  parity
  app/src/main/kotlin/.../runtime/SessionService.kt  MOD  inert stubs
  src/renderer/components/RuntimeBinding.tsx     MOD  preset cards + defaultPresetFor
  src/renderer/components/SessionStrip.tsx       MOD  preset state; pill badge
  src/renderer/App.tsx                           MOD  welcome-form preset; createSession threading
  src/renderer/components/ResumeBrowser.tsx      MOD  preset label
  src/renderer/components/ModelProvidersPopup.tsx MOD Search Providers block
  src/renderer/components/tool-views/ToolBody.tsx MOD WebSearchView
  src/renderer/dev/fixtures/websearch.jsonl      NEW
  src/renderer/dev/fixtures/askuserquestion.jsonl NEW
  test-search/probe-exa.mjs / probe-ddg.mjs / probe-tavily.mjs  NEW
  tests/  (new + extended vitest files per task)
youcoded/search-chain.json                       NEW  (repo root, remote-refresh source)
youcoded/docs/provider-dependencies.md           MOD  Exa/DDG/Tavily/search-chain rows
```

Working conventions carried from Plan A (binding): worktree `youcoded-worktrees/feat-native-web-tools`, branch `feat/native-web-tools`; every task commits with explicit `git add <own files>`; frozen emit surface; tool-call/result pairing invariant; IPC parity ×5 for every new channel; error messages per `docs/error-message-standards.md`; prompt prose must be ORIGINAL (never pasted from other tools). Reviews per task: spec-compliance + adversarial quality, both before the next dependent task builds on the result.

**Parallelization map** (for the orchestrator): Track W = Tasks 3–4 (WebFetch), Track S = Tasks 5–8 (WebSearch), Track Q = Task 9 (AskUserQuestion), Track P = Task 13 (presets) are mutually disjoint EXCEPT `tools/types.ts` + `tools/index.ts` (touched by 4, 8, 9 — serialize those two files' edits or let Track owners rebase) and `harness-session.ts` (Task 9 only). Task 10 and Task 14 both touch `ipc-handlers.ts`/`preload.ts`/`remote-shim.ts`/`types.ts`/`SessionService.kt` — run them serially. Task 2 must complete before 7. Tasks 11–12 depend on 10/8; 14 depends on 13.

---

### Task 1: Worktree + dependencies

**Files:** none in-repo yet (worktree setup + `desktop/package.json`).

- [ ] **Step 1: Create the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded-worktrees/feat-native-web-tools -b feat/native-web-tools
cd ../youcoded-worktrees/feat-native-web-tools/desktop
npm ci
```

Do NOT junction `node_modules` (the `git worktree remove` junction hazard — workspace CLAUDE.md).

- [ ] **Step 2: Install the extraction deps (exact versions)**

```bash
npm install --save-exact @mozilla/readability turndown @mixmark-io/domino
```

Note: `turndown` v7+ already depends on `@mixmark-io/domino` for its Node DOM, but we import domino directly for Readability, so it must be a first-class dependency.

- [ ] **Step 3: Verify the stack loads in plain Node (no jsdom, no DOM globals)**

```bash
node -e "const d=require('@mixmark-io/domino');const{Readability}=require('@mozilla/readability');const T=require('turndown');const w=d.createWindow('<html><body><article><h1>Hi</h1><p>Body text here that is long enough to extract.</p></article></body></html>','https://example.com');const a=new Readability(w.document).parse();console.log(JSON.stringify({title:a&&a.title,md:new T().turndown(a?a.content:'')}))"
```

Expected: JSON with `title` and a Markdown string containing `# Hi` (or `Hi\n==`). If Readability returns null on this tiny doc, that's fine — record it; the tool has a whole-body fallback.

- [ ] **Step 4: Baseline suite green, then commit**

```bash
npm test 2>&1 | tail -5   # expect the Plan A-era pass count; known flake: sync-spaces-project-discovery (passes isolated)
npx tsc --noEmit
git add package.json package-lock.json
git commit -m "chore(native): add readability/turndown/domino for WebFetch extraction"
```

---

### Task 2: Pin the external search contracts (probes + fixtures + coupling rows)

The three search backends are OUR code talking to THIRD-PARTY endpoints whose exact shapes are not fully documented. Before any parser is written, capture real responses, save them as test fixtures, and record coupling rows. This mirrors Plan A Task 1 (the ai@7.0.22 contract spike).

**Files:**
- Create: `desktop/test-search/probe-exa.mjs`, `desktop/test-search/probe-ddg.mjs`, `desktop/test-search/probe-tavily.mjs`, `desktop/test-search/README.md`
- Create: `desktop/tests/fixtures/search/exa-response.json`, `desktop/tests/fixtures/search/ddg-response.html` (captured by the probes)
- Modify: `youcoded/docs/provider-dependencies.md` (three new Touchpoint rows)

- [ ] **Step 1: Write `probe-exa.mjs`**

```js
#!/usr/bin/env node
// Probe the Exa keyless hosted MCP endpoint (https://mcp.exa.ai/mcp) as a plain
// HTTPS JSON-RPC client — no MCP framework. Run on every search-backend change
// and record the observed shapes in docs/provider-dependencies.md.
// Usage: node test-search/probe-exa.mjs "your query" [--key EXA_KEY] [--out fixture.json]
const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--')) ?? 'latest Node.js LTS version';
const key = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const base = 'https://mcp.exa.ai/mcp' + (key ? `?exaApiKey=${encodeURIComponent(key)}` : '');
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

// Streamable-HTTP MCP responses may arrive as plain JSON or as an SSE frame
// ("event: message\ndata: {...}"). Handle both and report which we saw.
function parseBody(text) {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return { mode: 'json', body: JSON.parse(t) };
  const data = t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
  return { mode: 'sse', body: JSON.parse(data) };
}

async function rpc(method, params, id, sessionId) {
  const res = await fetch(base, {
    method: 'POST',
    headers: { ...HEADERS, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  return { status: res.status, sessionId: res.headers.get('mcp-session-id'), text };
}

// Attempt 1: stateless tools/call (some hosted MCP servers allow it).
console.log('--- attempt: stateless tools/call ---');
let r = await rpc('tools/call', { name: 'web_search_exa', arguments: { query, numResults: 3 } }, 1);
console.log('status:', r.status);
console.log(r.text.slice(0, 4000));
let parsed = null;
try { parsed = parseBody(r.text); } catch { /* not parseable — fall through */ }

if (!parsed || parsed.body.error) {
  // Attempt 2: full handshake — initialize (capture mcp-session-id) → tools/call.
  console.log('--- attempt: initialize handshake ---');
  const init = await rpc('initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'youcoded-probe', version: '0.0.0' },
  }, 0);
  console.log('initialize status:', init.status, 'mcp-session-id:', init.sessionId);
  console.log(init.text.slice(0, 2000));
  r = await rpc('tools/call', { name: 'web_search_exa', arguments: { query, numResults: 3 } }, 1, init.sessionId);
  console.log('tools/call status:', r.status);
  console.log(r.text.slice(0, 4000));
  parsed = parseBody(r.text);
}

if (parsed.body.error) { console.error('FAIL:', JSON.stringify(parsed.body.error)); process.exit(1); }
if (out) (await import('fs')).writeFileSync(out, JSON.stringify(parsed.body, null, 2));
console.log('PASS: transport mode =', parsed.mode, '— record the result shape + required handshake in provider-dependencies.md');
```

- [ ] **Step 2: Write `probe-ddg.mjs`**

```js
#!/usr/bin/env node
// Probe DDG's HTML endpoint (the fallback backend). SINGLE attempt — a 202 is
// the documented rate-limit response and must NEVER be retry-hammered.
// Usage: node test-search/probe-ddg.mjs "your query" [--out fixture.html]
import fs from 'fs';
const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--')) ?? 'latest Node.js LTS version';
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
  headers: { 'User-Agent': 'YouCoded' },
  signal: AbortSignal.timeout(15_000),
});
console.log('status:', res.status);
const text = await res.text();
if (res.status === 202) { console.log('RATELIMITED (202) — this is the shape the backend must detect'); process.exit(0); }
const links = [...text.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)];
const snippets = [...text.matchAll(/class="result__snippet"[^>]*>(.*?)<\/a>/gs)];
console.log('result__a count:', links.length, ' result__snippet count:', snippets.length);
console.log('first href:', links[0]?.[1]);
console.log('first title html:', links[0]?.[2]?.slice(0, 200));
if (out) fs.writeFileSync(out, text);
if (links.length === 0) { console.error('FAIL: no result__a anchors — DDG markup changed; update the parser + this probe'); process.exit(1); }
console.log('PASS — note whether hrefs are direct or //duckduckgo.com/l/?uddg=<encoded> redirects');
```

- [ ] **Step 3: Write `probe-tavily.mjs`** (runnable only with a key; the parser is defensively built from official docs until then)

```js
#!/usr/bin/env node
// Probe Tavily /search. Requires a key: node test-search/probe-tavily.mjs --key tvly-xxx ["query"]
const args = process.argv.slice(2);
const key = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const query = args.find((a) => !a.startsWith('--') && !a.startsWith('tvly')) ?? 'latest Node.js LTS version';
if (!key) { console.log('SKIP: no --key provided. Documented shape: POST https://api.tavily.com/search, Authorization: Bearer, {query,max_results} -> {results:[{title,url,content}]}'); process.exit(0); }
const res = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
  body: JSON.stringify({ query, max_results: 3 }),
  signal: AbortSignal.timeout(15_000),
});
console.log('status:', res.status);
console.log((await res.text()).slice(0, 3000));
```

- [ ] **Step 4: Write `test-search/README.md`**

```markdown
# Search backend probes

Live-contract probes for the native WebSearch chain (spec §3.2). Run on every
search-backend change AND whenever a backend starts failing in the wild; record
observed shapes in `docs/provider-dependencies.md` (rows tagged `(search)`).

- `probe-exa.mjs "query" [--key K] [--out f.json]` — Exa hosted MCP (keyless default path)
- `probe-ddg.mjs "query" [--out f.html]` — DDG HTML fallback (single attempt; 202 = rate-limited, never retry)
- `probe-tavily.mjs --key tvly-... ["query"]` — keyed upgrade (skips politely without a key)

Captured fixtures live in `tests/fixtures/search/` and pin the parsers
(`tests/search-backends.test.ts`) — refresh them ONLY via these probes so the
fixture provenance is always a real response.
```

- [ ] **Step 5: Run the probes live and capture fixtures**

```bash
node test-search/probe-exa.mjs "latest Node.js LTS version" --out tests/fixtures/search/exa-response.json
node test-search/probe-ddg.mjs "latest Node.js LTS version" --out tests/fixtures/search/ddg-response.html
node test-search/probe-tavily.mjs
```

Expected: exa PASS with transport mode noted; ddg PASS (or a recorded 202 — retry once a few minutes later for a capture; if DDG persistently 202s from this machine, hand-author a minimal `ddg-response.html` from the probe's documented markup and mark the fixture synthetic in a comment). Record for exa: whether the stateless call worked or the initialize handshake was required, and the exact result payload path (e.g. `result.content[0].text` containing a JSON string vs structured array).

- [ ] **Step 6: Add the coupling rows to `youcoded/docs/provider-dependencies.md`** under Touchpoints (follow the existing row style exactly — external URL/shape, fields consumed, defensive posture, consumer, tag):

```markdown
- **Exa hosted MCP search** — `https://mcp.exa.ai/mcp` (keyless; `?exaApiKey=` lifts
  limits on the same endpoint). JSON-RPC 2.0 `tools/call` → `web_search_exa`
  `{query, numResults}`; responses may be plain JSON or SSE-framed (`data:` lines) —
  parser handles both. <RECORD OBSERVED: handshake requirement + result path>.
  Malformed/refused responses throw a typed backend error the chain absorbs.
  Probe: `desktop/test-search/probe-exa.mjs`; parser pinned by
  `desktop/tests/search-backends.test.ts` on a captured fixture. Consumer:
  `src/main/harness/search/backends/exa.ts`. (search)
- **DuckDuckGo HTML fallback** — `https://html.duckduckgo.com/html/?q=`. Scrape,
  not an API: `202` = rate-limited → honest error, SINGLE attempt, never retried
  (Apr–May 2025 breakage waves; see 2026-07-15-web-search-backends.md). Parses
  `result__a` anchors (+ `uddg=` redirect decoding) and `result__snippet`. Markup
  drift → parser returns a "DDG markup changed" error, not garbage. Probe:
  `desktop/test-search/probe-ddg.mjs`. Consumer: `search/backends/ddg.ts`. (search)
- **Tavily `/search`** — `https://api.tavily.com/search`, `Authorization: Bearer`,
  `{query, max_results}` → `{results:[{title,url,content}]}` (keyed upgrade,
  1,000/mo free). Defensive per-row parse; rows without `url` skipped. Probe:
  `desktop/test-search/probe-tavily.mjs` (skips without a key). Consumer:
  `search/backends/tavily.ts`. (search)
```

Replace the `<RECORD OBSERVED: ...>` placeholder with what the probe actually showed before committing.

- [ ] **Step 7: Commit** — `provider-dependencies.md` lives in the youcoded repo, so edit it INSIDE the worktree (`<worktree>/docs/provider-dependencies.md`) and commit everything on the feature branch (from `<worktree>/desktop`):

```bash
git add test-search/ tests/fixtures/search/ ../docs/provider-dependencies.md
git commit -m "test(native): search backend probes, captured contract fixtures + coupling rows"
```

---

### Task 3: SSRF net-guard + guardedFetch

**Files:**
- Create: `desktop/src/main/harness/tools/net-guard.ts`
- Test: `desktop/tests/net-guard.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPrivateIp, assertPublicHttpUrl, guardedFetch, NetGuardError } from '../src/main/harness/tools/net-guard';

describe('isPrivateIp', () => {
  it.each([
    ['127.0.0.1', true], ['10.1.2.3', true], ['192.168.1.1', true],
    ['172.16.0.1', true], ['172.31.255.255', true], ['172.32.0.1', false],
    ['169.254.169.254', true],           // link-local / cloud metadata
    ['100.64.0.1', true],                // CGNAT (includes Tailscale 100.x)
    ['0.0.0.0', true], ['8.8.8.8', false], ['93.184.216.34', false],
    ['::1', true], ['fd00::1', true], ['fc00::1', true], ['fe80::1', true],
    ['::ffff:192.168.1.1', true],        // v4-mapped v6 re-checked as v4
    ['2606:2800:220:1:248:1893:25c8:1946', false],
  ])('%s → %s', (ip, expected) => expect(isPrivateIp(ip)).toBe(expected));
});

describe('assertPublicHttpUrl', () => {
  const resolves = (ips: string[]) => async () => ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd', resolves(['1.2.3.4']))).rejects.toThrow(NetGuardError);
    await expect(assertPublicHttpUrl('ftp://example.com/', resolves(['1.2.3.4']))).rejects.toThrow(/http/);
  });
  it('rejects literal private IPs without a DNS call', async () => {
    const lookup = vi.fn();
    await expect(assertPublicHttpUrl('http://192.168.1.1/admin', lookup)).rejects.toThrow(/private|internal/i);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('rejects hostnames that resolve to ANY private address', async () => {
    await expect(assertPublicHttpUrl('https://evil.example/', resolves(['93.184.216.34', '10.0.0.5']))).rejects.toThrow(NetGuardError);
  });
  it('rejects localhost by name', async () => {
    await expect(assertPublicHttpUrl('http://localhost:9950/', resolves(['127.0.0.1']))).rejects.toThrow(NetGuardError);
  });
  it('accepts a public URL', async () => {
    const url = await assertPublicHttpUrl('https://example.com/page', resolves(['93.184.216.34']));
    expect(url.hostname).toBe('example.com');
  });
});

describe('guardedFetch', () => {
  afterEach(() => vi.restoreAllMocks());
  const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

  it('follows redirects manually and validates EVERY hop', async () => {
    // Public URL 302s to a private target — the classic SSRF bypass. Must throw.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://192.168.1.1/admin' } }),
    );
    await expect(
      guardedFetch('https://example.com/start', { signal: new AbortController().signal, lookup: publicLookup, fetchImpl: fetchMock }),
    ).rejects.toThrow(/private|internal/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('caps the redirect chain at 5 hops', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://example.com/next' } }),
    );
    await expect(
      guardedFetch('https://example.com/a', { signal: new AbortController().signal, lookup: publicLookup, fetchImpl: fetchMock }),
    ).rejects.toThrow(/redirect/i);
    expect(fetchMock).toHaveBeenCalledTimes(6); // initial + 5 hops
  });

  it('returns the final response + finalUrl on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://example.com/final' } }))
      .mockResolvedValueOnce(new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const { res, finalUrl } = await guardedFetch('https://example.com/start', {
      signal: new AbortController().signal, lookup: publicLookup, fetchImpl: fetchMock,
    });
    expect(res.status).toBe(200);
    expect(finalUrl).toBe('https://example.com/final');
  });

  it('reads the body up to maxBytes and reports truncation', async () => {
    const big = 'x'.repeat(2048);
    const fetchMock = vi.fn().mockResolvedValue(new Response(big, { status: 200 }));
    const { res } = await guardedFetch('https://example.com/big', {
      signal: new AbortController().signal, lookup: publicLookup, fetchImpl: fetchMock,
    });
    const { text, truncated } = await readBodyCapped(res, 1024);
    expect(text.length).toBeLessThanOrEqual(1024);
    expect(truncated).toBe(true);
  });
});
// import readBodyCapped alongside the others
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/net-guard.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `net-guard.ts`**

```ts
// SSRF guard for the web tools (spec §3.1): private/localhost/RFC-1918 blocked
// by default, http/https only, and — because redirects are followed MANUALLY —
// EVERY hop is re-validated (a public URL 302ing to http://192.168.1.1/ is the
// classic bypass). Same guard family as the secret-path denial in guards.ts.
//
// HONESTY LIMIT (PITFALLS): we validate the DNS answer, then fetch by hostname,
// so a TOCTOU DNS-rebind between check and fetch is theoretically possible.
// Honest friction, not a security boundary — the accepted Phase 2 posture.
import { isIP } from 'net';
import { lookup as dnsLookup } from 'dns/promises';

export class NetGuardError extends Error {}

type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true });

const PRIVATE_V4 = [
  [/^0\./, '0.0.0.0/8'], [/^10\./, '10/8'], [/^127\./, 'loopback'],
  [/^169\.254\./, 'link-local'], [/^192\.168\./, '192.168/16'],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, 'CGNAT 100.64/10'],
] as const;

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    if (PRIVATE_V4.some(([re]) => re.test(ip))) return true;
    const second = Number(ip.split('.')[1]);
    return ip.startsWith('172.') && second >= 16 && second <= 31;
  }
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;    // fc00::/7 ULA
  if (/^fe[89ab]/.test(lower)) return true;                             // fe80::/10 link-local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);          // v4-mapped
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

/** Scheme + address validation for ONE URL. Throws NetGuardError with an honest,
 *  specific message (error-message standards). Returns the parsed URL. */
export async function assertPublicHttpUrl(raw: string, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new NetGuardError(`"${raw}" is not a valid URL.`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NetGuardError(`Only http and https URLs can be fetched (got ${url.protocol.replace(':', '')}).`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip v6 brackets
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new NetGuardError(`${host} is a private/internal address — fetching it is blocked.`);
    return url;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new NetGuardError(`${host} is a local address — fetching it is blocked.`);
  }
  let addrs: Array<{ address: string }>;
  try { addrs = await lookup(host); } catch {
    throw new NetGuardError(`Could not resolve ${host} — check the URL or the network connection.`);
  }
  if (addrs.length === 0) throw new NetGuardError(`Could not resolve ${host}.`);
  const bad = addrs.find((a) => isPrivateIp(a.address));
  if (bad) throw new NetGuardError(`${host} resolves to the private/internal address ${bad.address} — fetching it is blocked.`);
  return url;
}

const MAX_REDIRECTS = 5;

export interface GuardedFetchOpts {
  signal: AbortSignal;
  timeoutMs?: number;              // per-request; default 30s
  lookup?: LookupFn;               // test injection
  fetchImpl?: typeof fetch;        // test injection
  headers?: Record<string, string>;
}

/** Fetch with MANUAL redirect following: every hop re-runs assertPublicHttpUrl. */
export async function guardedFetch(rawUrl: string, opts: GuardedFetchOpts): Promise<{ res: Response; finalUrl: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lookup = opts.lookup ?? defaultLookup;
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    const url = await assertPublicHttpUrl(current, lookup);
    const res = await fetchImpl(url.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': 'YouCoded', accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8', ...opts.headers },
      signal: AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? 30_000)]),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new NetGuardError(`${url.hostname} answered ${res.status} with no Location header.`);
      if (hop >= MAX_REDIRECTS) throw new NetGuardError(`Gave up after ${MAX_REDIRECTS} redirects (last: ${current}).`);
      current = new URL(location, url).toString(); // relative Location supported
      continue;
    }
    return { res, finalUrl: current };
  }
}

/** Stream the body up to maxBytes; flag truncation instead of buffering unbounded. */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: await res.text(), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0; let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
      truncated = true;
      await reader.cancel().catch(() => { /* stream already closed */ });
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/net-guard.test.ts` → PASS. Also `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/net-guard.ts tests/net-guard.test.ts
git commit -m "feat(native): SSRF net-guard with per-hop redirect validation"
```

---

### Task 4: WebFetch tool

**Files:**
- Create: `desktop/src/main/harness/tools/web-fetch.ts`
- Test: `desktop/tests/web-fetch-tool.test.ts`

- [ ] **Step 1: Write the failing tests** (inject `fetchImpl`/`lookup` through the tool's test seam)

```ts
import { describe, it, expect } from 'vitest';
import { WebFetchTool, __setWebFetchTestHooks } from '../src/main/harness/tools/web-fetch';

const ctx = () => ({ sessionId: 's', cwd: 'C:\\proj', signal: new AbortController().signal, readRegistry: new Map(), todos: [] as any[] });
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const html = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('WebFetch', () => {
  it('extracts an article to markdown', async () => {
    __setWebFetchTestHooks({ lookup: publicLookup, fetchImpl: async () => html(
      '<html><head><title>Docs</title></head><body><nav>junk nav</nav><article><h1>API Guide</h1><p>' + 'Real content. '.repeat(40) + '</p></article></body></html>',
    ) });
    const r = await WebFetchTool.execute({ url: 'https://example.com/docs', prompt: 'find the API guide' } as any, ctx());
    expect(r.isError).toBeUndefined();
    expect(r.text).toContain('API Guide');
    expect(r.text).not.toContain('junk nav');       // Readability stripped chrome
    expect(r.text).toContain('find the API guide'); // prompt echoed as context header
  });
  it('passes plain text / json through', async () => {
    __setWebFetchTestHooks({ lookup: publicLookup, fetchImpl: async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }) });
    const r = await WebFetchTool.execute({ url: 'https://example.com/api' } as any, ctx());
    expect(r.text).toContain('"ok":true');
  });
  it('refuses binaries honestly', async () => {
    __setWebFetchTestHooks({ lookup: publicLookup, fetchImpl: async () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200, headers: { 'content-type': 'application/pdf' } }) });
    const r = await WebFetchTool.execute({ url: 'https://example.com/f.pdf' } as any, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/application\/pdf/);
  });
  it('surfaces HTTP errors with the status', async () => {
    __setWebFetchTestHooks({ lookup: publicLookup, fetchImpl: async () => new Response('nope', { status: 404 }) });
    const r = await WebFetchTool.execute({ url: 'https://example.com/missing' } as any, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toContain('404');
  });
  it('blocks private targets via the net-guard (integration)', async () => {
    __setWebFetchTestHooks({ lookup: async () => [{ address: '10.0.0.5', family: 4 }], fetchImpl: async () => html('x') });
    const r = await WebFetchTool.execute({ url: 'https://internal.corp/secrets' } as any, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/private|internal/i);
  });
  it('permissionSubject is the url', () => {
    expect(WebFetchTool.permissionSubject({ url: 'https://a.b/c' } as any)).toBe('https://a.b/c');
  });
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run tests/web-fetch-tool.test.ts` → FAIL.

- [ ] **Step 3: Implement `web-fetch.ts`**

```ts
// WebFetch (spec §3.1): guardedFetch → Readability extraction → Markdown →
// shared truncation. CC-compatible input shape {url, prompt?} so the existing
// WebFetchView renders unchanged (it markdown-renders the result string).
// DESIGN (plan decision 9): no secondary summarization model — the result IS
// the extracted markdown; `prompt` is echoed as a context header.
import { z } from 'zod';
import { Readability } from '@mozilla/readability';
import domino from '@mixmark-io/domino';
import TurndownService from 'turndown';
import { defineTool } from './registry';
import { guardedFetch, readBodyCapped, NetGuardError, type GuardedFetchOpts } from './net-guard';

const MAX_BODY_BYTES = 5 * 1024 * 1024;

// Test seam: unit tests inject lookup/fetch; production uses the real ones.
let testHooks: Pick<GuardedFetchOpts, 'lookup' | 'fetchImpl'> = {};
export function __setWebFetchTestHooks(h: typeof testHooks): void { testHooks = h; }

const inputSchema = z.object({
  url: z.string().describe('The URL to fetch (http/https only)'),
  prompt: z.string().optional().describe('What you want to learn from this page'),
});

const TEXT_TYPES = /^(text\/(plain|markdown|csv|xml)|application\/(json|xml|rss\+xml|atom\+xml))/;

function htmlToMarkdown(rawHtml: string, url: string): { title: string | null; markdown: string } {
  const window = domino.createWindow(rawHtml, url);
  const article = new Readability(window.document).parse();
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  if (article?.content) return { title: article.title ?? null, markdown: turndown.turndown(article.content) };
  // Readability found no article (a dashboard, an index page…) — fall back to the
  // whole body so the model still gets SOMETHING structured, never a silent empty.
  const body = window.document.body?.innerHTML ?? rawHtml;
  return { title: window.document.title || null, markdown: turndown.turndown(body) };
}

export const WebFetchTool = defineTool<z.infer<typeof inputSchema>>({
  name: 'WebFetch',
  description:
    'Fetch a web page and return its main content as Markdown. Only public http/https URLs — private and local addresses are blocked. Large pages are truncated.',
  inputSchema,
  permissionSubject: (args) => args.url,
  async execute(args, ctx) {
    let res, finalUrl;
    try {
      ({ res, finalUrl } = await guardedFetch(args.url, { signal: ctx.signal, ...testHooks }));
    } catch (err) {
      if (err instanceof NetGuardError) return { text: `WebFetch blocked: ${err.message}`, isError: true };
      throw err; // defineTool's catch turns it into an actionable error result
    }
    if (!res.ok) {
      return { text: `WebFetch failed: ${finalUrl} answered HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}.`, isError: true };
    }
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const isHtml = contentType.startsWith('text/html') || contentType.startsWith('application/xhtml');
    if (!isHtml && !TEXT_TYPES.test(contentType)) {
      return { text: `WebFetch can only read HTML and text content; ${finalUrl} is ${contentType || 'an unknown binary type'}.`, isError: true };
    }
    const { text: raw, truncated } = await readBodyCapped(res, MAX_BODY_BYTES);
    const header = [
      args.prompt ? `Fetched for: ${args.prompt}` : null,
      `Source: ${finalUrl}`,
    ].filter(Boolean).join('\n');
    if (!isHtml) {
      return { text: `${header}\n\n${raw}${truncated ? '\n\n[body truncated at 5MB]' : ''}` };
    }
    const { title, markdown } = htmlToMarkdown(raw, finalUrl);
    return { text: `${header}${title ? `\nTitle: ${title}` : ''}\n\n${markdown}${truncated ? '\n\n[body truncated at 5MB]' : ''}` };
  },
});
```

- [ ] **Step 4: Run tests** → PASS; `npx tsc --noEmit` clean. If domino's default import trips CJS/ESM interop under vitest, switch to `import * as domino` + `domino.createWindow` per its actual export shape — pin whichever compiles in both tsc and vitest.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/web-fetch.ts tests/web-fetch-tool.test.ts
git commit -m "feat(native): WebFetch tool — readability extraction behind the SSRF guard"
```

---

### Task 5: Search chain data (shipped + remote-refreshed)

**Files:**
- Create: `desktop/src/main/harness/search/search-chain.ts`
- Create: `search-chain.json` (YOUCODED REPO ROOT — the remote-refresh source, sibling of `curated-models.json`)
- Test: `desktop/tests/search-chain.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SearchChain, SHIPPED_SEARCH_CHAIN } from '../src/main/harness/search/search-chain';

const cacheDir = () => mkdtempSync(join(tmpdir(), 'yc-chain-'));
const okFetch = (payload: unknown) => (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;
const failFetch = (async () => { throw new Error('offline'); }) as typeof fetch;

describe('SearchChain', () => {
  it('ships tavily(keyed) → exa → ddg', () => {
    expect(SHIPPED_SEARCH_CHAIN.map((e) => e.backend)).toEqual(['tavily', 'exa', 'ddg']);
    expect(SHIPPED_SEARCH_CHAIN[0].requiresKey).toBe(true);
  });
  it('returns the remote chain when valid and caches it', async () => {
    const remote = { schemaVersion: 1, chain: [{ backend: 'exa', requiresKey: false }] };
    const c = new SearchChain(cacheDir(), okFetch(remote));
    expect((await c.get()).map((e) => e.backend)).toEqual(['exa']);
  });
  it('falls back to shipped on offline', async () => {
    const c = new SearchChain(cacheDir(), failFetch);
    expect(await c.get()).toEqual(SHIPPED_SEARCH_CHAIN);
  });
  it('falls back on schemaVersion mismatch', async () => {
    const c = new SearchChain(cacheDir(), okFetch({ schemaVersion: 99, chain: [] }));
    expect(await c.get()).toEqual(SHIPPED_SEARCH_CHAIN);
  });
  it('drops malformed rows instead of failing the whole chain', async () => {
    const remote = { schemaVersion: 1, chain: [{ backend: 'ddg', requiresKey: false }, { backend: 'not-a-backend' }, { nonsense: true }] };
    const c = new SearchChain(cacheDir(), okFetch(remote));
    expect((await c.get()).map((e) => e.backend)).toEqual(['ddg']);
  });
});
```

- [ ] **Step 2: Verify failure**, then **implement `search-chain.ts`** mirroring `src/main/models/curated-catalog.ts` — READ THAT FILE FIRST and copy its freshness-ladder structure (fresh disk cache < 24h TTL → remote fetch, 10s timeout → validate → write cache → return; any failure → cached → shipped; never throws):

```ts
// WebSearch backend chain — SHIPPED as data AND refreshed from a raw GitHub URL
// (the curated-models pattern, see src/main/models/curated-catalog.ts) so the
// chain is patchable without an app release. WHY: free search endpoints keep
// vanishing (Brave free tier dead Feb 2026, Bing dead Aug 2025 — see
// docs/active/investigations/2026-07-15-web-search-backends.md).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export type SearchBackendId = 'exa' | 'ddg' | 'tavily';
export interface SearchChainEntry { backend: SearchBackendId; requiresKey: boolean }

export const SEARCH_CHAIN_SCHEMA_VERSION = 1;
// Order rationale (plan decision 7): a user who added a Tavily key wants it
// used; keyless users skip it (requiresKey) and land on Exa keyless, then DDG.
export const SHIPPED_SEARCH_CHAIN: SearchChainEntry[] = [
  { backend: 'tavily', requiresKey: true },
  { backend: 'exa', requiresKey: false },
  { backend: 'ddg', requiresKey: false },
];

const REMOTE_URL = 'https://raw.githubusercontent.com/itsdestin/youcoded/master/search-chain.json';
const CACHE_FILE = 'search-chain-cache.json';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const VALID_BACKENDS: SearchBackendId[] = ['exa', 'ddg', 'tavily'];
function parseChain(payload: unknown): SearchChainEntry[] | null {
  const p = payload as { schemaVersion?: unknown; chain?: unknown };
  if (p?.schemaVersion !== SEARCH_CHAIN_SCHEMA_VERSION || !Array.isArray(p.chain)) return null;
  const rows = p.chain
    .filter((r: any) => r && VALID_BACKENDS.includes(r.backend))
    .map((r: any) => ({ backend: r.backend as SearchBackendId, requiresKey: r.requiresKey === true }));
  return rows.length > 0 ? rows : null;
}

export class SearchChain { /* constructor(cacheDir, fetchImpl = fetch); get(): Promise<SearchChainEntry[]> — implement the curated-catalog freshness ladder verbatim against parseChain(), REMOTE_URL, CACHE_FILE, TTL_MS. */ }
```

(The class body is a direct structural copy of `CuratedCatalog.get()` — the implementer transplants it, swapping the parse/validate function and constants. Copy its cache-read/write error absorption too.)

- [ ] **Step 3: Create `search-chain.json` at the youcoded repo ROOT** (this is the published remote copy — identical to shipped):

```json
{
  "schemaVersion": 1,
  "chain": [
    { "backend": "tavily", "requiresKey": true },
    { "backend": "exa", "requiresKey": false },
    { "backend": "ddg", "requiresKey": false }
  ]
}
```

- [ ] **Step 4: Tests pass; add the coupling row** to `docs/provider-dependencies.md`:

```markdown
- **Search chain remote list** —
  `https://raw.githubusercontent.com/itsdestin/youcoded/master/search-chain.json`.
  Gated on `schemaVersion === 1`; malformed rows dropped; fetch failure falls
  back cache → shipped (never throws). Consumer:
  `src/main/harness/search/search-chain.ts`. (search-chain)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/search/search-chain.ts tests/search-chain.test.ts ../search-chain.json docs/provider-dependencies.md
git commit -m "feat(native): data-driven search chain, shipped + remote-refreshed"
```

(`../search-chain.json` is relative to `desktop/` — the file sits at the repo root.)

---

### Task 6: SearchKeyStore (secretRefs via NativeHome + SecretsStore)

**Files:**
- Create: `desktop/src/main/harness/search/search-key-store.ts`
- Test: `desktop/tests/search-key-store.test.ts`

**READ FIRST:** `src/main/harness/permission-store.ts` (the Plan A template for NativeHome-locked JSON under `~/.youcoded/`) and `src/main/providers/secrets-store.ts` (set/get/delete/has signatures — `set(plaintext, existingRef?)` returns the ref; rotation reuses `existingRef`).

- [ ] **Step 1: Failing tests** (inject a fake NativeHome exactly the way `permission-store.test.ts` does — mirror its fake, and a fake SecretsStore `{ set, get, delete, has }` backed by a Map):

```ts
import { describe, it, expect } from 'vitest';
import { SearchKeyStore } from '../src/main/harness/search/search-key-store';

function fakeSecrets() {
  const m = new Map<string, string>(); let n = 0;
  return {
    m,
    async set(plaintext: string, existingRef?: string) { const ref = existingRef ?? `ref-${++n}`; m.set(ref, plaintext); return ref; },
    async get(ref: string) { return m.get(ref) ?? null; },
    async delete(ref: string) { m.delete(ref); },
    has(ref: string | undefined) { return !!ref && m.has(ref); },
  };
}
// fakeHome: same in-memory NativeHome fake used by permission-store.test.ts — copy it.

describe('SearchKeyStore', () => {
  it('stores a key and reports hasKey', async () => {
    const s = new SearchKeyStore(fakeHome(), fakeSecrets() as any);
    await s.setKey('tavily', 'tvly-123');
    expect((await s.list()).find((p) => p.id === 'tavily')?.hasKey).toBe(true);
    expect(await s.getKey('tavily')).toBe('tvly-123');
    expect(await s.getKey('exa')).toBeNull();
  });
  it('rotates in place (same secretRef reused)', async () => {
    const secrets = fakeSecrets();
    const s = new SearchKeyStore(fakeHome(), secrets as any);
    await s.setKey('exa', 'old'); await s.setKey('exa', 'new');
    expect(secrets.m.size).toBe(1);
    expect(await s.getKey('exa')).toBe('new');
  });
  it('removeKey deletes both the ref and the ciphertext', async () => {
    const secrets = fakeSecrets();
    const s = new SearchKeyStore(fakeHome(), secrets as any);
    await s.setKey('tavily', 'k'); await s.removeKey('tavily');
    expect(secrets.m.size).toBe(0);
    expect(await s.getKey('tavily')).toBeNull();
  });
  it('tolerates a wrong-shape file', async () => {
    const s = new SearchKeyStore(fakeHomeSeeded({ garbage: true }), fakeSecrets() as any);
    expect(await s.list()).toHaveLength(2); // tavily + exa rows, hasKey false
  });
});
```

- [ ] **Step 2: Implement**

```ts
// Search-provider API keys (Tavily, Exa — spec §3.2 keyed upgrades). The
// PLAINTEXT lives ONLY in SecretsStore (safeStorage, userData); this file
// persists just { backend → secretRef } in ~/.youcoded/search-providers.json —
// same split as providers.json, same NativeHome locking as permission-store.ts.
import type { PermissionRule } from '../../../shared/permission-types'; // (only if the NativeHome type import needs it — otherwise drop)

export type KeyedBackend = 'tavily' | 'exa';
const FILE = 'search-providers.json';
const LABELS: Record<KeyedBackend, string> = { tavily: 'Tavily', exa: 'Exa' };

export class SearchKeyStore {
  constructor(private home: NativeHomeLike, private secrets: SecretsLike) {}
  async setKey(backend: KeyedBackend, key: string): Promise<void> {
    // Read the existing ref (rotation), encrypt FIRST, then persist the ref.
    const existing = await this.refFor(backend);
    const ref = await this.secrets.set(key.trim(), existing ?? undefined);
    await this.home.mutateJson(FILE, (data: any) => {
      const d = data && typeof data === 'object' ? data : {};
      d.providers = { ...(d.providers ?? {}), [backend]: { secretRef: ref } };
      return d;
    });
  }
  async getKey(backend: KeyedBackend): Promise<string | null> {
    const ref = await this.refFor(backend);
    return ref ? this.secrets.get(ref) : null;
  }
  async removeKey(backend: KeyedBackend): Promise<void> {
    const ref = await this.refFor(backend);
    if (ref) await this.secrets.delete(ref);
    await this.home.mutateJson(FILE, (data: any) => {
      const d = data && typeof data === 'object' ? data : {};
      if (d.providers) delete d.providers[backend];
      return d;
    });
  }
  async list(): Promise<Array<{ id: KeyedBackend; label: string; hasKey: boolean }>> {
    const out: Array<{ id: KeyedBackend; label: string; hasKey: boolean }> = [];
    for (const id of ['tavily', 'exa'] as KeyedBackend[]) {
      out.push({ id, label: LABELS[id], hasKey: this.secrets.has((await this.refFor(id)) ?? undefined) });
    }
    return out;
  }
  private async refFor(backend: KeyedBackend): Promise<string | null> {
    const data: any = await this.home.readJson(FILE);
    return typeof data?.providers?.[backend]?.secretRef === 'string' ? data.providers[backend].secretRef : null;
  }
}
```

IMPORTANT: `NativeHomeLike`/`SecretsLike` are structural interfaces declared in this file listing ONLY the methods used (`readJson`, `mutateJson` / `set`, `get`, `delete`, `has`) — match the REAL method names in `native-home.ts` and `secrets-store.ts` before writing them (the Plan A lesson: the plan guessed `mutateFileUnderLock`, the real API differed — verify, don't trust this plan's guess either).

- [ ] **Step 3: Tests pass, tsc clean, commit**

```bash
git add src/main/harness/search/search-key-store.ts tests/search-key-store.test.ts
git commit -m "feat(native): search key store — secretRef split, safeStorage-backed"
```

---

### Task 7: The three search backends

**Files:**
- Create: `desktop/src/main/harness/search/backends/{types.ts,exa.ts,ddg.ts,tavily.ts}`
- Test: `desktop/tests/search-backends.test.ts` (pins the Task 2 fixtures)

- [ ] **Step 1: `backends/types.ts`**

```ts
export interface SearchResult { title: string; url: string; snippet?: string }
/** Backend failure the chain absorbs and reports honestly (never a bare code). */
export class SearchBackendError extends Error {
  constructor(message: string, public readonly permanent = false) { super(message); }
}
export interface SearchBackend {
  id: 'exa' | 'ddg' | 'tavily';
  search(query: string, opts: { key: string | null; signal: AbortSignal; fetchImpl?: typeof fetch }): Promise<SearchResult[]>;
}
```

- [ ] **Step 2: Failing tests against the CAPTURED fixtures**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { exaBackend } from '../src/main/harness/search/backends/exa';
import { ddgBackend } from '../src/main/harness/search/backends/ddg';
import { tavilyBackend } from '../src/main/harness/search/backends/tavily';
import { SearchBackendError } from '../src/main/harness/search/backends/types';

const fixture = (f: string) => readFileSync(join(__dirname, 'fixtures', 'search', f), 'utf8');
const sig = () => new AbortController().signal;
const respond = (body: string, init?: ResponseInit) => (async () => new Response(body, init)) as typeof fetch;

describe('exa backend', () => {
  it('parses the captured keyless response into results', async () => {
    const results = await exaBackend.search('q', { key: null, signal: sig(), fetchImpl: respond(fixture('exa-response.json')) });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) { expect(r.title).toBeTruthy(); expect(r.url).toMatch(/^https?:/); }
  });
  it('appends exaApiKey when a key is present', async () => {
    let calledUrl = '';
    const f = (async (u: any) => { calledUrl = String(u); return new Response(fixture('exa-response.json')); }) as typeof fetch;
    await exaBackend.search('q', { key: 'exa-k', signal: sig(), fetchImpl: f });
    expect(calledUrl).toContain('exaApiKey=exa-k');
  });
  it('throws SearchBackendError on a JSON-RPC error payload', async () => {
    await expect(exaBackend.search('q', { key: null, signal: sig(), fetchImpl: respond('{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"limited"}}') }))
      .rejects.toThrow(SearchBackendError);
  });
});

describe('ddg backend', () => {
  it('parses the captured HTML into results (uddg redirect decoded)', async () => {
    const results = await ddgBackend.search('q', { key: null, signal: sig(), fetchImpl: respond(fixture('ddg-response.html')) });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).not.toContain('duckduckgo.com/l/');
  });
  it('202 → honest rate-limit error, marked permanent (never retried)', async () => {
    await expect(ddgBackend.search('q', { key: null, signal: sig(), fetchImpl: respond('', { status: 202 }) }))
      .rejects.toThrow(/rate.?limit/i);
  });
  it('markup drift → explicit error, not empty garbage', async () => {
    await expect(ddgBackend.search('q', { key: null, signal: sig(), fetchImpl: respond('<html><body>totally different</body></html>') }))
      .rejects.toThrow(/markup|changed/i);
  });
});

describe('tavily backend', () => {
  it('parses the documented shape', async () => {
    const body = JSON.stringify({ results: [{ title: 'T', url: 'https://t.example', content: 'snippet' }, { title: 'no url row' }] });
    const results = await tavilyBackend.search('q', { key: 'tvly-x', signal: sig(), fetchImpl: respond(body) });
    expect(results).toEqual([{ title: 'T', url: 'https://t.example', snippet: 'snippet' }]);
  });
  it('requires a key', async () => {
    await expect(tavilyBackend.search('q', { key: null, signal: sig() })).rejects.toThrow(/key/i);
  });
  it('401 → key-rejected error', async () => {
    await expect(tavilyBackend.search('q', { key: 'bad', signal: sig(), fetchImpl: respond('', { status: 401 }) }))
      .rejects.toThrow(/key|rejected|unauthorized/i);
  });
});
```

- [ ] **Step 3: Implement the three backends.** Shapes:

`exa.ts` — POST `https://mcp.exa.ai/mcp` (+`?exaApiKey=` when key), JSON-RPC `tools/call` / `web_search_exa` `{query, numResults: 8}`, headers `content-type: application/json`, `accept: application/json, text/event-stream`, the SSE-or-JSON body parser from the probe, and — IF Task 2 recorded that the handshake is required — the initialize→call sequence with the `mcp-session-id` header, encoded as recorded. Extract results from the path Task 2 pinned (expected: `result.content[0].text` is itself a JSON string with a results array carrying title/url/snippet-like fields — parse defensively, skip rows without a url). JSON-RPC `error` → `SearchBackendError(error.message)`.

`ddg.ts` — GET `https://html.duckduckgo.com/html/?q=<enc>` with `User-Agent: YouCoded`; `202` → `new SearchBackendError('DuckDuckGo is rate-limiting requests from this network right now.', true)`; regex-extract `result__a` (href + inner text, tags stripped, entities decoded for `&amp; &lt; &gt; &quot; &#x27;`) and `result__snippet`; decode `uddg=` redirect wrappers via `new URL(href, 'https://duckduckgo.com').searchParams.get('uddg')`; zero anchors on a 200 → `SearchBackendError('DuckDuckGo's result markup changed — the fallback parser needs updating.', true)`. Cap at 8 results.

`tavily.ts` — no key → `SearchBackendError('Tavily requires an API key.', true)`; POST with Bearer; 401/403 → `SearchBackendError('The Tavily API key was rejected — check it in Settings → Providers.', true)`; other non-ok → `HTTP <status>` error; defensive row parse as tested.

All three: network-level `fetch` failures bubble as thrown errors — wrap in `SearchBackendError('Could not reach <host> — check the network connection.')`.

- [ ] **Step 4: Tests pass** (adjust ONLY the exa parsing path to the pinned fixture, never the fixture to the code); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/search/backends/ tests/search-backends.test.ts
git commit -m "feat(native): exa/ddg/tavily search backends pinned to captured contracts"
```

---

### Task 8: SearchService + WebSearch tool + registration + web-free baseline

**Files:**
- Create: `desktop/src/main/harness/search/search-service.ts`, `desktop/src/main/harness/tools/web-search.ts`
- Modify: `desktop/src/main/harness/tools/types.ts` (ToolContext.services), `desktop/src/main/harness/tools/index.ts`, `desktop/src/shared/permission-types.ts`, `desktop/src/main/harness/harness-session.ts` (thread `toolServices` into ToolContext — 3 lines)
- Test: `desktop/tests/search-service.test.ts`, `desktop/tests/web-search-tool.test.ts`; extend `desktop/tests/permission-engine.test.ts`

- [ ] **Step 1: Failing tests — `search-service.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SearchService } from '../src/main/harness/search/search-service';
import { SearchBackendError, type SearchBackend } from '../src/main/harness/search/backends/types';

const R = [{ title: 'T', url: 'https://x.example', snippet: 's' }];
const chain = (entries: any[]) => ({ get: async () => entries });
const keys = (map: Record<string, string>) => ({ getKey: async (b: string) => map[b] ?? null });
const backend = (id: string, impl: SearchBackend['search']): SearchBackend => ({ id: id as any, search: impl });
const sig = () => new AbortController().signal;

describe('SearchService', () => {
  it('skips keyed entries without a key and uses the first success', async () => {
    const calls: string[] = [];
    const s = new SearchService(chain([
      { backend: 'tavily', requiresKey: true }, { backend: 'exa', requiresKey: false },
    ]) as any, keys({}) as any, {
      tavily: backend('tavily', async () => { calls.push('tavily'); return R; }),
      exa: backend('exa', async () => { calls.push('exa'); return R; }),
      ddg: backend('ddg', async () => { calls.push('ddg'); return R; }),
    });
    const out = await s.search('q', sig());
    expect(calls).toEqual(['exa']);
    expect(out.source).toBe('exa');
    expect(out.results).toEqual(R);
  });
  it('falls through on backend failure and reports the winning source', async () => {
    const s = new SearchService(chain([
      { backend: 'exa', requiresKey: false }, { backend: 'ddg', requiresKey: false },
    ]) as any, keys({}) as any, {
      exa: backend('exa', async () => { throw new SearchBackendError('per-IP limit reached'); }),
      ddg: backend('ddg', async () => R),
      tavily: backend('tavily', async () => R),
    });
    expect((await s.search('q', sig())).source).toBe('ddg');
  });
  it('exhaustion → SearchUnavailable with per-backend reasons AND the add-a-key hint', async () => {
    const s = new SearchService(chain([
      { backend: 'exa', requiresKey: false }, { backend: 'ddg', requiresKey: false },
    ]) as any, keys({}) as any, {
      exa: backend('exa', async () => { throw new SearchBackendError('per-IP limit reached'); }),
      ddg: backend('ddg', async () => { throw new SearchBackendError('DuckDuckGo is rate-limiting requests from this network right now.', true); }),
      tavily: backend('tavily', async () => R),
    });
    await expect(s.search('q', sig())).rejects.toThrow(/per-IP limit.*rate-limiting.*add.*key/is);
  });
  it('passes the stored key to keyed backends', async () => {
    let seenKey: string | null = 'unset' as any;
    const s = new SearchService(chain([{ backend: 'tavily', requiresKey: true }]) as any, keys({ tavily: 'tvly-9' }) as any, {
      tavily: backend('tavily', async (_q, o) => { seenKey = o.key; return R; }),
      exa: backend('exa', async () => R), ddg: backend('ddg', async () => R),
    });
    await s.search('q', sig());
    expect(seenKey).toBe('tvly-9');
  });
});
```

- [ ] **Step 2: Implement `search-service.ts`**

```ts
// Walks the data-driven backend chain (spec §3.2): first usable backend wins;
// failures are COLLECTED and, on exhaustion, surfaced as one honest message
// ending in the "add a key" upgrade path (never a silent empty result).
import type { SearchChainEntry } from './search-chain';
import { SearchBackendError, type SearchBackend, type SearchResult } from './backends/types';

const PER_BACKEND_TIMEOUT_MS = 10_000;

export class SearchUnavailableError extends Error {}

export interface SearchOutcome { results: SearchResult[]; source: string }

interface ChainLike { get(): Promise<SearchChainEntry[]> }
interface KeysLike { getKey(backend: 'tavily' | 'exa'): Promise<string | null> }

export class SearchService {
  constructor(
    private chain: ChainLike,
    private keys: KeysLike,
    private backends: Record<'exa' | 'ddg' | 'tavily', SearchBackend>,
  ) {}

  async search(query: string, signal: AbortSignal): Promise<SearchOutcome> {
    const failures: string[] = [];
    let anyKey = false;
    for (const entry of await this.chain.get()) {
      const key = entry.backend === 'ddg' ? null : await this.keys.getKey(entry.backend);
      if (key) anyKey = true;
      if (entry.requiresKey && !key) continue;
      try {
        const results = await this.backends[entry.backend].search(query, {
          key, signal: AbortSignal.any([signal, AbortSignal.timeout(PER_BACKEND_TIMEOUT_MS)]),
        });
        if (results.length > 0) return { results, source: entry.backend };
        failures.push(`${entry.backend}: returned no results`);
      } catch (err: any) {
        if (signal.aborted) throw err; // user interrupt — let the driver own it
        failures.push(`${entry.backend}: ${err instanceof SearchBackendError ? err.message : `Could not reach the service (${err?.message ?? err}).`}`);
      }
    }
    const hint = anyKey
      ? 'All configured search backends failed — this may be temporary.'
      : 'Tell the user: adding a free Tavily or Exa API key in Settings → Providers makes web search reliable.';
    throw new SearchUnavailableError(`Web search is unavailable right now. ${failures.join(' | ')}. ${hint}`);
  }

  /** Never-throw key check for the Settings "Test" button (testConnection pattern). */
  async testBackend(backend: 'tavily' | 'exa', key: string): Promise<{ ok: boolean; message: string }> {
    try {
      const results = await this.backends[backend].search('youcoded connectivity test', {
        key, signal: AbortSignal.timeout(PER_BACKEND_TIMEOUT_MS),
      });
      return { ok: true, message: `Working — ${results.length} results returned.` };
    } catch (err: any) {
      return { ok: false, message: err?.message ?? String(err) };
    }
  }
}
```

- [ ] **Step 3: ToolContext services + driver threading.** In `tools/types.ts` add:

```ts
export interface ToolServices {
  search?: { search(query: string, signal: AbortSignal): Promise<{ results: Array<{ title: string; url: string; snippet?: string }>; source: string }> };
}
// ToolContext gains:  services?: ToolServices;
```

In `harness-session.ts`: `HarnessSessionOpts` gains `toolServices?: ToolServices;` and `runOneTool`'s execute call (step 5, around line 518) passes `...(this.opts.toolServices ? { services: this.opts.toolServices } : {})` into the context object.

- [ ] **Step 4: Failing tests — `web-search-tool.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { WebSearchTool } from '../src/main/harness/tools/web-search';
import { SearchUnavailableError } from '../src/main/harness/search/search-service';

const ctxWith = (search: any) => ({ sessionId: 's', cwd: 'C:\\p', signal: new AbortController().signal, readRegistry: new Map(), todos: [] as any[], services: { search } });

describe('WebSearch tool', () => {
  it('formats results as a markdown list with the source', async () => {
    const r = await WebSearchTool.execute({ query: 'node lts' } as any, ctxWith({
      search: async () => ({ source: 'exa', results: [{ title: 'Node.js releases', url: 'https://nodejs.org/releases', snippet: 'LTS schedule' }] }),
    }) as any);
    expect(r.isError).toBeUndefined();
    expect(r.text).toContain('Node.js releases');
    expect(r.text).toContain('https://nodejs.org/releases');
    expect(r.text).toContain('exa');
  });
  it('SearchUnavailable → honest error result (not a throw)', async () => {
    const r = await WebSearchTool.execute({ query: 'q' } as any, ctxWith({
      search: async () => { throw new SearchUnavailableError('Web search is unavailable right now. exa: limited. Tell the user: add a key.'); },
    }) as any);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('add a key');
  });
  it('missing service wiring → configuration error result', async () => {
    const bare = { sessionId: 's', cwd: 'C:\\p', signal: new AbortController().signal, readRegistry: new Map(), todos: [] as any[] };
    const r = await WebSearchTool.execute({ query: 'q' } as any, bare as any);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/configuration/i);
  });
  it('permissionSubject is the query', () => {
    expect(WebSearchTool.permissionSubject({ query: 'abc' } as any)).toBe('abc');
  });
});
```

- [ ] **Step 5: Implement `tools/web-search.ts`**

```ts
// WebSearch (spec §3.2): thin over the injected SearchService — ONE stable tool
// interface regardless of which backend answered. Result is a markdown string
// (the WebSearchView + collapsed header read input.query / a text response).
import { z } from 'zod';
import { defineTool } from './registry';
import { SearchUnavailableError } from '../search/search-service';

const inputSchema = z.object({ query: z.string().min(1).describe('The search query') });

export const WebSearchTool = defineTool<z.infer<typeof inputSchema>>({
  name: 'WebSearch',
  description: 'Search the web. Returns titles, URLs, and snippets — use WebFetch to read a promising result in full. Use this whenever fresh or current information matters.',
  inputSchema,
  permissionSubject: (args) => args.query,
  async execute(args, ctx) {
    if (!ctx.services?.search) {
      return { text: 'Web search is not wired for this session; this is a configuration error.', isError: true };
    }
    try {
      const { results, source } = await ctx.services.search.search(args.query, ctx.signal);
      const lines = results.slice(0, 8).map((r, i) =>
        `${i + 1}. **${r.title}**\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}`);
      return { text: `Web search results for "${args.query}" (via ${source}):\n\n${lines.join('\n\n')}` };
    } catch (err: any) {
      if (err instanceof SearchUnavailableError) return { text: err.message, isError: true };
      throw err; // defineTool catch → actionable error / abort labeling
    }
  },
});
```

- [ ] **Step 6: Register + baseline.** `tools/index.ts`:

```ts
import { WebFetchTool } from './web-fetch';
import { WebSearchTool } from './web-search';
/** Plan A core set + Plan B web tools. AskUserQuestion joins in Task 9. */
export const CORE_TOOLS: NativeTool[] = [ReadTool, WriteTool, EditTool, BashTool, GlobTool, GrepTool, TodoWriteTool, WebFetchTool, WebSearchTool];
```

`permission-types.ts` `rulesForMode` alwaysAllowed gains (comment updated to "Read/search/web tools plus TodoWrite are always free — spec §3.4: reads + web free in every preset"):

```ts
    { tool: 'WebFetch', action: 'allow' },
    { tool: 'WebSearch', action: 'allow' },
```

Extend `tests/permission-engine.test.ts` with one case: `decidePermission('WebSearch', 'anything', { presetRules: [], modeRules: rulesForMode('ask'), denyList: DESTRUCTIVE_DENY_LIST, rememberedRules: [] })` → `{ action: 'allow', denyListed: false }` (and same for WebFetch).

- [ ] **Step 7: Full suite + tsc, commit**

```bash
npx vitest run tests/search-service.test.ts tests/web-search-tool.test.ts tests/permission-engine.test.ts tests/harness-session-loop.test.ts
npx tsc --noEmit
git add src/main/harness/search/search-service.ts src/main/harness/tools/web-search.ts src/main/harness/tools/types.ts src/main/harness/tools/index.ts src/main/harness/harness-session.ts src/shared/permission-types.ts tests/search-service.test.ts tests/web-search-tool.test.ts tests/permission-engine.test.ts
git commit -m "feat(native): WebSearch tool over the chain-walking SearchService; web tools free in all modes"
```

---

### Task 9: AskUserQuestion — broker passthrough + interactive driver routing + tool

**Files:**
- Modify: `desktop/src/main/harness/permission-broker.ts` (AskDecision.updatedInput), `desktop/src/main/harness/harness-session.ts` (interactive branch in runOneTool), `desktop/src/main/harness/tools/types.ts` (`interactive?: boolean`), `desktop/src/main/harness/tools/index.ts`
- Create: `desktop/src/main/harness/tools/ask-user-question.ts`
- Test: extend `desktop/tests/permission-broker.test.ts` + `desktop/tests/harness-session-loop.test.ts`; create `desktop/tests/ask-user-question-tool.test.ts`

**Context (verified):** `AskUserQuestionCard` (ToolCard.tsx:452-634) renders when `status === 'awaiting-approval' && requestId && toolName === 'AskUserQuestion' && isValidQuestions(input)`; it submits `respondToPermission(requestId, { decision: { behavior: 'allow', updatedInput: { questions, answers } } })` where `answers` is `Record<questionText, 'Label' | 'Label1, Label2'>`, and dismisses with `{ decision: { behavior: 'deny' } }`. The broker currently resolves only `{behavior, always}` — **`updatedInput` is dropped**; that's the one gap.

- [ ] **Step 1: Failing broker test** (add to the existing broker test file):

```ts
it('passes decision.updatedInput through to the resolver (AskUserQuestion answers)', async () => {
  const broker = new PermissionBroker();
  const p = broker.ask({ sessionId: 's1', toolName: 'AskUserQuestion', toolInput: { questions: [] }, denyListed: false });
  const event = /* capture the emitted hook-event as the existing tests do */;
  broker.respond(event.payload._requestId, {
    decision: { behavior: 'allow', updatedInput: { questions: [], answers: { 'Q?': 'Blue' } } },
  });
  const d = await p;
  expect(d.behavior).toBe('allow');
  expect(d.updatedInput).toEqual({ questions: [], answers: { 'Q?': 'Blue' } });
  expect(d.always).toBe(false); // updatedInput must NOT be mistaken for updatedPermissions
});
```

- [ ] **Step 2: Implement in `permission-broker.ts`** — `AskDecision` gains:

```ts
  /** AskUserQuestion answers ride the SAME channel inside decision.updatedInput
   *  (ToolCard's AskUserQuestionCard shape) — dropped for ordinary permission
   *  asks, load-bearing for interactive tools. */
  updatedInput?: Record<string, unknown>;
```

and `respond()` resolves with it:

```ts
    const updatedInput = inner.updatedInput && typeof inner.updatedInput === 'object'
      ? (inner.updatedInput as Record<string, unknown>) : undefined;
    entry.resolve({ behavior, always, ...(updatedInput ? { updatedInput } : {}) });
```

- [ ] **Step 3: The tool + formatter — failing `ask-user-question-tool.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { AskUserQuestionTool, formatAnswers } from '../src/main/harness/tools/ask-user-question';

const q = (over: Partial<any> = {}) => ({
  question: 'Which color?', header: 'Color', multiSelect: false,
  options: [{ label: 'Blue' }, { label: 'Red', description: 'bold choice' }], ...over,
});

describe('AskUserQuestion schema', () => {
  it('accepts the CC shape', () => {
    expect(AskUserQuestionTool.inputSchema.safeParse({ questions: [q()] }).success).toBe(true);
  });
  it('rejects zero questions, >4 questions, <2 options', () => {
    expect(AskUserQuestionTool.inputSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(AskUserQuestionTool.inputSchema.safeParse({ questions: [q(), q(), q(), q(), q()] }).success).toBe(false);
    expect(AskUserQuestionTool.inputSchema.safeParse({ questions: [q({ options: [{ label: 'only' }] })] }).success).toBe(false);
  });
  it('is marked interactive with no permission subject', () => {
    expect(AskUserQuestionTool.interactive).toBe(true);
    expect(AskUserQuestionTool.permissionSubject({ questions: [q()] } as any)).toBeUndefined();
  });
});

describe('formatAnswers', () => {
  it('pairs each question with its answer', () => {
    const text = formatAnswers({ questions: [q(), q({ question: 'Size?', header: 'Size' })] } as any,
      { questions: [], answers: { 'Which color?': 'Blue', 'Size?': 'Large, Medium' } });
    expect(text).toContain('Which color?');
    expect(text).toContain('Blue');
    expect(text).toContain('Large, Medium');
  });
  it('marks unanswered questions instead of dropping them', () => {
    const text = formatAnswers({ questions: [q()] } as any, { questions: [], answers: {} });
    expect(text).toMatch(/no selection|did not answer/i);
  });
});
```

- [ ] **Step 4: Implement `tools/ask-user-question.ts`**

```ts
// AskUserQuestion (spec §3.3): CC's exact name + input shape so the existing
// AskUserQuestionCard renders it unchanged. INTERACTIVE — the driver routes it
// straight to askUser() (the permission-ask rail: pause, cancel-on-interrupt,
// PermissionExpired on teardown all come free); execute() never runs.
import { z } from 'zod';
import type { NativeTool, ToolResultPayload } from './types';

const optionSchema = z.object({ label: z.string().min(1), description: z.string().optional() });
const questionSchema = z.object({
  question: z.string().min(1),
  header: z.string().min(1).max(12),
  options: z.array(optionSchema).min(2).max(4),
  multiSelect: z.boolean(),
});
const inputSchema = z.object({ questions: z.array(questionSchema).min(1).max(4) });
export type AskUserQuestionInput = z.infer<typeof inputSchema>;

/** Turn the card's updatedInput ({questions, answers: Record<question, labels>})
 *  into the tool-result text the model reads. */
export function formatAnswers(args: AskUserQuestionInput, updatedInput: Record<string, unknown> | undefined): string {
  const answers = (updatedInput?.answers ?? {}) as Record<string, string>;
  const lines = args.questions.map((q) => {
    const a = answers[q.question];
    return `Q: ${q.question}\nA: ${a && a.trim() ? a : '(no selection — the user did not answer this one)'}`;
  });
  return `The user answered:\n\n${lines.join('\n\n')}`;
}

export const AskUserQuestionTool: NativeTool<AskUserQuestionInput> = {
  name: 'AskUserQuestion',
  description:
    'Ask the user 1-4 multiple-choice questions when you genuinely need their input to proceed (preferences, ambiguous requirements, a decision only they can make). Each question needs a short header (max 12 chars) and 2-4 options. Do not use it for questions you can answer yourself.',
  inputSchema,
  interactive: true,
  permissionSubject: () => undefined,
  // Defensive only — the driver intercepts interactive tools before execute.
  async execute(): Promise<ToolResultPayload> {
    return { text: 'AskUserQuestion must be routed through the interactive ask rail; this is a configuration error.', isError: true };
  },
};
```

`tools/types.ts` `NativeTool` gains:

```ts
  /** Interactive tools (AskUserQuestion) are routed by the DRIVER straight to
   *  askUser() — guards/decide are skipped (asking permission to ask a question
   *  is absurd) and execute() never runs. */
  interactive?: boolean;
```

`tools/index.ts`: append `AskUserQuestionTool` to `CORE_TOOLS` (all ten now present; update the header comment: "The full Phase 2 ten-tool set (spec decision 4).").

- [ ] **Step 5: Failing driver tests** (extend `harness-session-loop.test.ts`, using its existing mock-model + session helpers — follow the file's established patterns for streaming a tool call and asserting emitted events/history):

```ts
describe('interactive tools (AskUserQuestion)', () => {
  it('routes to askUser, skips decide, and returns the formatted answers', async () => {
    // Arrange a session whose model streams one AskUserQuestion call, with
    // decide = vi.fn() and askUser resolving { behavior:'allow', updatedInput:
    // { questions: [...], answers: { 'Which color?': 'Blue' } } }.
    // Assert: decide NOT called for AskUserQuestion; the tool-result event text
    // contains 'Blue'; history has the paired call/result; second step ends turn.
  });
  it('deny → dismissal result, turn continues', async () => {
    // askUser resolves { behavior: 'deny' } → result text matches /dismissed|without answering/i,
    // isError true, and the NEXT step still runs (model sees the result).
  });
  it('canceled (interrupt) → back-filled canceled result + user-interrupt (regression: pairing invariant)', async () => {
    // askUser resolves { behavior: 'canceled' } → same unwind as the Plan A
    // canceled-permission-ask test: canceled tool result back-filled, user-interrupt emitted.
  });
  it('invalid questions shape → corrective validation result, askUser never called', async () => {
    // input {questions: []} → zod error result; askUser not invoked.
  });
});
```

- [ ] **Step 6: Implement the driver branch** in `runOneTool`, between step 2 (doom-loop) and step 3 (guards):

```ts
    // 2.5 Interactive tools (AskUserQuestion): the ask IS the execution. Skip
    // guards/decide — there is no side effect to gate; the ask rail supplies
    // pause/cancel semantics. The card's answers come back via updatedInput
    // (broker passthrough), formatted here into the tool result.
    if (tool.interactive) {
      if (!this.opts.askUser) return { text: `No user-interaction handler is wired for this session; ${call.toolName} cannot run. This is a configuration error.`, isError: true };
      const d = await this.opts.askUser({ sessionId: this.opts.sessionId, toolName: call.toolName, toolInput: call.input as any, denyListed: false });
      if (d.behavior === 'canceled') return 'interrupted';
      if (d.behavior !== 'allow') return { text: 'The user dismissed the question without answering. Continue with your best judgment, or ask differently in plain text.', isError: true };
      return { text: formatAnswers(args as any, d.updatedInput) };
    }
```

(Import `formatAnswers` from the tool module. The doom-loop check deliberately stays ABOVE this — a model re-asking the identical question three times is exactly a doom loop.)

- [ ] **Step 7: Run the loop suite + broker suite + tsc; commit**

```bash
npx vitest run tests/harness-session-loop.test.ts tests/permission-broker.test.ts tests/ask-user-question-tool.test.ts
npx tsc --noEmit
git add src/main/harness/permission-broker.ts src/main/harness/harness-session.ts src/main/harness/tools/ask-user-question.ts src/main/harness/tools/types.ts src/main/harness/tools/index.ts tests/
git commit -m "feat(native): AskUserQuestion — interactive ask rail with updatedInput answers"
```

---

### Task 10: `search:*` IPC family (5-surface parity) + main-process wiring

**Files:**
- Modify: `desktop/src/shared/types.ts` (IPC consts), `desktop/src/main/ipc-handlers.ts`, `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/remote-server.ts`, `app/src/main/kotlin/.../runtime/SessionService.kt`
- Test: extend `desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Add the channel constants** to `src/shared/types.ts` IPC block (mirror in preload's inlined strings):

```ts
  SEARCH_LIST: 'search:list',
  SEARCH_SET_KEY: 'search:set-key',
  SEARCH_REMOVE_KEY: 'search:remove-key',
  SEARCH_TEST: 'search:test',
```

- [ ] **Step 2: Construct the search stack in `ipc-handlers.ts`** next to the provider stack (~line 1856, where `nativeHome`/`secretsStore` already exist):

```ts
  const searchKeyStore = new SearchKeyStore(nativeHome, secretsStore);
  const searchService = new SearchService(
    new SearchChain(join(app.getPath('userData'), 'cache')),   // match CuratedCatalog's exact cache-dir convention — read its construction site
    searchKeyStore,
    { exa: exaBackend, ddg: ddgBackend, tavily: tavilyBackend },
  );
```

and handlers:

```ts
  ipcMain.handle(IPC.SEARCH_LIST, async () => searchKeyStore.list());
  ipcMain.handle(IPC.SEARCH_SET_KEY, async (_e, backend, key) => { await searchKeyStore.setKey(backend, key); return true; });
  ipcMain.handle(IPC.SEARCH_REMOVE_KEY, async (_e, backend) => { await searchKeyStore.removeKey(backend); return true; });
  ipcMain.handle(IPC.SEARCH_TEST, async (_e, backend, key) => searchService.testBackend(backend, key)); // never throws — {ok,message} is the result
```

- [ ] **Step 3: Inject the service into the host.** `NativeSessionHost` constructor gains a trailing optional param `private toolServices?: ToolServices` (same additive style as `appVersion`); `toolWiring()` spreads `...(this.toolServices ? { toolServices: this.toolServices } : {})` into its return. ipc-handlers passes `{ search: searchService }` at the construction site. (This is 4 lines in `native-session-host.ts` — coordinate with Task 13 which rewrites `toolWiring`'s signature; if 13 already landed, slot into its preset-aware version.)

- [ ] **Step 4: Preload + remote-shim + remote-server + Android.** `preload.ts` exposes:

```ts
  search: {
    list: () => ipcRenderer.invoke('search:list'),
    setKey: (backend, key) => ipcRenderer.invoke('search:set-key', backend, key),
    removeKey: (backend) => ipcRenderer.invoke('search:remove-key', backend),
    test: (backend, key) => ipcRenderer.invoke('search:test', backend, key),
  },
```

`remote-shim.ts` mirrors the same object over WS invoke; `remote-server.ts` adds the four cases delegating to the same store/service; `SessionService.kt` adds the four channel names as inert stubs returning the platform's standard "not supported" shape (copy the pattern the Plan A `native:set-permission-mode` stub used).

- [ ] **Step 5: Parity rows.** Extend the `ipc-channels.test.ts` parity table with the four channels (it mechanically asserts preload/shim/handler/Kt coverage — follow its existing row format).

- [ ] **Step 6: Suite + tsc; commit**

```bash
npx vitest run tests/ipc-channels.test.ts && npx tsc --noEmit
git add src/shared/types.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts ../app/src/main/kotlin/**/SessionService.kt tests/ipc-channels.test.ts src/main/harness/native-session-host.ts
git commit -m "feat(native): search:* IPC family with full cross-platform parity"
```

---

### Task 11: Settings → Providers "Search Providers" block

**Files:**
- Modify: `desktop/src/renderer/components/ModelProvidersPopup.tsx`

- [ ] **Step 1: Add a `SearchProvidersBlock`** rendered after `OpenRouterBlock`/`LocalModelsBlock` (same section styling — read the OpenRouterBlock's structure lines 249-349 and copy its visual grammar):

```tsx
// Search providers (native WebSearch keyed upgrades — spec §3.2). NOT model
// providers: Tavily/Exa have no languageModel(), so they live outside
// ProviderRegistry on their own search:* IPC + SecretsStore-backed key store.
function SearchProvidersBlock() {
  const [rows, setRows] = useState<Array<{ id: 'tavily' | 'exa'; label: string; hasKey: boolean }>>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const refresh = () => (window as any).claude.search?.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { refresh(); }, []);
  const save = async (id: 'tavily' | 'exa') => {
    const key = draft.trim();
    if (!key) return;
    const test = await (window as any).claude.search.test(id, key);   // {ok,message} — never throws
    setTestMsg((m) => ({ ...m, [id]: test.message }));
    if (!test.ok) return;                                              // keep the input open, show the honest message
    await (window as any).claude.search.setKey(id, key);
    setDraft(''); setEditing(null); refresh();
  };
  /* Render: section header "Search" + one-liner ("Free search works out of the
     box; add a Tavily or Exa key to make it faster and more reliable."), then a
     row per backend: label, hasKey ? "Key saved" badge + Remove button
     (search.removeKey → refresh) : "Add key" button toggling an input + Save.
     testMsg[id] renders under the row (ok → dim text, !ok → destructive text). */
}
```

Follow the popup's existing button/input classNames verbatim so the block is indistinguishable in style. `hasKey` must come only from `list()` (never hold the key in state longer than the save call).

- [ ] **Step 2: Verify in the sandbox/dev window** — `bash scripts/run-dev.sh` from the workspace root, open Settings → Model Providers, confirm: rows render, Add key → Save round-trips (badge appears), Remove clears it, a garbage key shows the test failure message inline. Kill the dev server after.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ModelProvidersPopup.tsx
git commit -m "feat(native): Search Providers block — Tavily/Exa keys with inline test"
```

---

### Task 12: Renderer — WebSearchView + fixtures

**Files:**
- Modify: `desktop/src/renderer/components/tool-views/ToolBody.tsx`
- Create: `desktop/src/renderer/dev/fixtures/websearch.jsonl`, `desktop/src/renderer/dev/fixtures/askuserquestion.jsonl`

- [ ] **Step 1: Add `WebSearchView`** next to `WebFetchView` (ToolBody.tsx ~line 973) and a `case 'WebSearch':` in the dispatcher switch (~line 1073):

```tsx
// WebSearch results are a markdown string (native + CC both) — render like
// WebFetchView rather than the raw JSON fallback.
function WebSearchView({ tool }: { tool: ToolCallState }) {
  const query = (tool.input.query as string) || '';
  return (
    <div className="flex flex-col gap-2 text-xs">
      {query && <div className="text-xs text-fg-dim italic">"{query}"</div>}
      {tool.response && (
        <div className="text-sm text-fg-dim border-t border-edge/60 pt-2">
          <MarkdownContent content={tool.response} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fixtures.** `websearch.jsonl`:

```jsonl
{"type":"tool_use","id":"toolu_01Search","name":"WebSearch","input":{"query":"latest Node.js LTS version"}}
{"tool_use_id":"toolu_01Search","type":"tool_result","content":"Web search results for \"latest Node.js LTS version\" (via exa):\n\n1. **Node.js — Releases**\n   https://nodejs.org/en/about/previous-releases\n   Node.js 24 entered Active LTS in October 2026...\n\n2. **Node.js 24 LTS announcement**\n   https://nodejs.org/en/blog/release/v24\n   Details on the LTS line.","is_error":false}
```

`askuserquestion.jsonl` (awaiting-approval is a terminal fixture state, matching `bash-awaiting-approval.jsonl`; the `native-` requestId exercises the native ask path in the card):

```jsonl
{"type":"tool_use","id":"toolu_01AskQ","name":"AskUserQuestion","input":{"questions":[{"question":"Which framework should the new dashboard use?","header":"Framework","multiSelect":false,"options":[{"label":"React","description":"Matches the rest of the app"},{"label":"Svelte","description":"Smaller bundle"},{"label":"Plain HTML","description":"No build step"}]},{"question":"Which features matter most?","header":"Features","multiSelect":true,"options":[{"label":"Charts"},{"label":"Export to CSV"},{"label":"Dark mode"}]}]}}
{"type":"permission_request","tool_use_id":"toolu_01AskQ","requestId":"native-fixture-askq","denyListed":false}
```

- [ ] **Step 3: Sandbox visual pass** — `bash scripts/run-sandbox.sh` from the workspace root: `websearch` renders the markdown list; `webfetch` still renders; `askuserquestion` renders the question card with option buttons, the multi-select question accepts multiple choices, and Submit fires (it will report delivery failure in the sandbox — no live broker — which is the fixture-terminal expectation; visual + interaction shape is what's being verified). Screenshot via the CDP recipe in `docs/local-dev.md` if running headless. Kill the sandbox after.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/tool-views/ToolBody.tsx src/renderer/dev/fixtures/websearch.jsonl src/renderer/dev/fixtures/askuserquestion.jsonl
git commit -m "feat(native): WebSearchView + websearch/askuserquestion sandbox fixtures"
```

---

### Task 13: Preset manifests, registry, prompt body, host wiring

**Files:**
- Modify: `desktop/src/shared/harness-manifest.ts`
- Create: `desktop/src/main/harness/prompts/assistant-default.ts`, `desktop/src/main/harness/preset-registry.ts`
- Modify: `desktop/src/main/harness/native-session-host.ts`
- Test: create `desktop/tests/preset-registry.test.ts`; extend `desktop/tests/native-session-host.test.ts`; fix any test referencing `CHAT_PRESET`

- [ ] **Step 1: Rewrite `harness-manifest.ts`** — CHAT_PRESET is superseded (decision 8; legacy `'chat'` headers map to Assistant at resume):

```ts
// The shareable harness unit (marketplace item kind 'harness' arrives in
// Phase 3). Phase 2 ships TWO built-in presets — personality profiles, not
// capability tiers (spec decision 8): both carry the full ten-tool suite;
// they differ in prompt personality and permission posture. The Chat preset
// is CUT — legacy harnessId:'chat' headers resolve to Assistant on resume
// (preset-registry.ts). tools[] stays in the schema for Phase 3 custom harnesses.
import type { ModelBinding } from './provider-types';

export interface HarnessManifest {
  schema: 1;
  id: string; name: string; description?: string;
  systemPrompt: string;                  // fallback one-liner; the real body is a main-side prompt asset
  tools: string[];                       // CC-compatible names (ADR 009)
  /** A string sets the session's STARTING permission mode (the modeFor seed);
   *  a Record maps to presetRules (Phase 3 custom harnesses — unused in v1). */
  permissionPolicy: 'ask' | 'auto-edit' | 'full-auto' | Record<string, 'allow' | 'ask' | 'deny'>;
  defaultBinding?: ModelBinding;
  skills?: string[]; mcp?: string[];
  limits?: { maxSteps?: number; maxTokens?: number };
}

export const NATIVE_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'AskUserQuestion',
] as const;

export const ASSISTANT_PRESET: HarnessManifest = {
  schema: 1,
  id: 'assistant',
  name: 'Assistant',
  description: 'Research, write, and get answers — asks before consequential actions.',
  systemPrompt: 'You are a helpful, careful assistant inside YouCoded.',
  tools: [...NATIVE_TOOL_NAMES],
  permissionPolicy: 'ask',
  limits: { maxSteps: 25 },
};

export const CODER_PRESET: HarnessManifest = {
  schema: 1,
  id: 'coder',
  name: 'Coder',
  description: 'Agentic coding — plans with todos, edits confidently, runs and verifies.',
  systemPrompt: 'You are a capable coding agent inside YouCoded.',
  tools: [...NATIVE_TOOL_NAMES],
  permissionPolicy: 'auto-edit',
  limits: { maxSteps: 25 },
};

export const PRESETS: HarnessManifest[] = [ASSISTANT_PRESET, CODER_PRESET];
```

Then fix every `CHAT_PRESET` reference: `native-session-host.ts` (rewired below) and any test hardcoding it (`session-store.test.ts` / `harness-history-rebuild.test.ts` merely use the string `'chat'` in headers — those stay valid as LEGACY data; only imports of the removed const need updating).

- [ ] **Step 2: Write `prompts/assistant-default.ts`** — ORIGINAL prose (leaked-source policy: never paste prompt text from other tools). Personality per spec §3.4:

```ts
// Assistant preset prompt body (spec §3.4) — helpful generalist. Same
// assembly slots as coder-default.ts (identity line + <env> + project
// instructions come from prompt-assembly.ts around this body).
export const ASSISTANT_DEFAULT_BODY = `You help with everyday work: answering questions, researching topics, writing and editing documents, and organizing information. You are not limited to code.

How you work:
- When a question depends on current or recent information — news, versions, prices, schedules, anything that changes — search the web FIRST with WebSearch, then read the most promising result with WebFetch. Say what you found and where it came from.
- When a request is ambiguous or hinges on a preference only the user holds, ask with AskUserQuestion before doing significant work. One good clarifying question beats a wrong guess.
- Before actions with consequences outside this conversation — overwriting files, running commands that change things, anything hard to undo — pause and confirm with the user first.
- Keep answers plain and direct. Explain technical things in everyday language unless the user is clearly technical. Use Markdown when it makes the answer easier to read.
- For multi-step work, keep a visible plan with TodoWrite and update it as you go.`;
```

- [ ] **Step 3: Failing `preset-registry.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { resolvePreset } from '../src/main/harness/preset-registry';

describe('resolvePreset', () => {
  it('resolves coder with auto-edit default mode and the coder body', () => {
    const p = resolvePreset('coder');
    expect(p.manifest.id).toBe('coder');
    expect(p.defaultMode).toBe('auto-edit');
    expect(p.body).toContain('todo');       // coder body mentions the todo plan
    expect(p.presetRules).toEqual([]);
  });
  it('resolves assistant with ask default mode', () => {
    const p = resolvePreset('assistant');
    expect(p.defaultMode).toBe('ask');
    expect(p.body).toMatch(/WebSearch/);
  });
  it("maps legacy 'chat' AND unknown/undefined ids to assistant", () => {
    expect(resolvePreset('chat').manifest.id).toBe('assistant');
    expect(resolvePreset(undefined).manifest.id).toBe('assistant');
    expect(resolvePreset('bogus-future-id').manifest.id).toBe('assistant');
  });
  it('maps a Record permissionPolicy to presetRules (Phase 3 shape)', () => {
    const p = resolvePreset('coder', { ...resolvePreset('coder').manifest, permissionPolicy: { Bash: 'deny' } });
    expect(p.presetRules).toEqual([{ tool: 'Bash', action: 'deny' }]);
    expect(p.defaultMode).toBe('ask'); // Record form → conservative default
  });
});
```

- [ ] **Step 4: Implement `preset-registry.ts`**

```ts
// Resolves a stored/requested harnessId to the full runtime preset (manifest +
// main-side prompt body + permission posture). THE ONE place the legacy
// 'chat' → Assistant mapping lives (spec decision 8: Chat preset cut; old
// sessions resume as Assistant). Unknown ids also fall back to Assistant —
// a header written by a NEWER app version must resume, never brick.
import { ASSISTANT_PRESET, CODER_PRESET, type HarnessManifest } from '../../shared/harness-manifest';
import type { NativePermissionMode, PermissionRule } from '../../shared/permission-types';
import { ASSISTANT_DEFAULT_BODY } from './prompts/assistant-default';
import { CODER_DEFAULT_BODY } from './prompts/coder-default';

export interface ResolvedPreset {
  manifest: HarnessManifest;
  body: string;
  defaultMode: NativePermissionMode;
  presetRules: PermissionRule[];
}

const BODIES: Record<string, string> = { assistant: ASSISTANT_DEFAULT_BODY, coder: CODER_DEFAULT_BODY };

export function resolvePreset(harnessId: string | undefined, manifestOverride?: HarnessManifest): ResolvedPreset {
  const manifest = manifestOverride
    ?? (harnessId === 'coder' ? CODER_PRESET : ASSISTANT_PRESET);
  const policy = manifest.permissionPolicy;
  const defaultMode: NativePermissionMode = typeof policy === 'string' ? policy : 'ask';
  const presetRules: PermissionRule[] = typeof policy === 'string'
    ? []
    : Object.entries(policy).map(([tool, action]) => ({ tool, action }));
  return { manifest, body: BODIES[manifest.id] ?? ASSISTANT_DEFAULT_BODY, defaultMode, presetRules };
}
```

- [ ] **Step 5: Failing host tests** (extend `native-session-host.test.ts` with its existing fake store/factory helpers):

```ts
it('create stamps the chosen preset in the header and seeds its default mode', async () => {
  await host.create({ sessionId: 's1', cwd, binding, presetId: 'coder' });
  expect(store.readHeader('s1', cwd)?.harnessId).toBe('coder');
  expect(host.getPermissionMode('s1')).toBe('auto-edit');
});
it('create defaults to assistant when no preset is given', async () => {
  await host.create({ sessionId: 's2', cwd, binding });
  expect(store.readHeader('s2', cwd)?.harnessId).toBe('assistant');
  expect(host.getPermissionMode('s2')).toBe('ask');
});
it("resume maps a legacy 'chat' header to assistant wiring without rewriting the header", async () => {
  // seed a stored session whose header has harnessId:'chat', then:
  expect(await host.resume('legacy1', cwd)).toBe(true);
  expect(host.getHarnessId('legacy1')).toBe('assistant');
  expect(store.readHeader('legacy1', cwd)?.harnessId).toBe('chat'); // header untouched — mapping is read-side
});
it('an explicit user mode flip still beats the preset default', async () => {
  await host.create({ sessionId: 's3', cwd, binding, presetId: 'coder' });
  host.setPermissionMode('s3', 'ask');
  expect(host.getPermissionMode('s3')).toBe('ask');
});
```

- [ ] **Step 6: Rewire `native-session-host.ts`:**

- `CreateNativeSessionOpts` gains `presetId?: string;`
- Imports: drop `CHAT_PRESET`/`CODER_DEFAULT_BODY`; add `resolvePreset, type ResolvedPreset` (the body import moves into the registry).
- `toolWiring(sessionId, cwd, preset: ResolvedPreset)` — `tools: CORE_TOOLS` stays (all presets carry all ten tools, decision 8/9); `systemPrompt: assembleSystemPrompt({ presetBody: preset.body, cwd, appVersion: this.appVersion })`; `decide: this.buildDecide(sessionId, cwd, preset.presetRules)`; keep the Task 10 `toolServices` spread.
- `buildDecide(sessionId, cwd, presetRules: PermissionRule[])` — `presetRules` param replaces the hardcoded `[]` (comment updated: "preset manifests contribute here — lowest layer, mode/deny/remembered all override").
- `create()`: `const preset = resolvePreset(opts.presetId);` → header `harnessId: preset.manifest.id`; before constructing the session: `if (!this.modeFor.has(opts.sessionId)) this.modeFor.set(opts.sessionId, preset.defaultMode);` (WHY comment: "the preset seeds the STARTING mode; an explicit setPermissionMode always wins — modeFor is never overwritten here"); `harness: preset.manifest`; `this.toolWiring(opts.sessionId, opts.cwd, preset)`; record `presetIdFor` (below).
- `resume()`: `const preset = resolvePreset(header.harnessId);` — same seeding + wiring; the stored header is NOT rewritten (read-side mapping only).
- New per-session record + getters:

```ts
  private presetIdFor = new Map<string, string>();   // resolved (post-mapping) preset id
  getPermissionMode(sessionId: string): NativePermissionMode { return this.modeFor.get(sessionId) ?? 'ask'; }
  getHarnessId(sessionId: string): string | null { return this.presetIdFor.get(sessionId) ?? null; }
```

  (set `presetIdFor` in create/resume; delete it in `destroy()` alongside `modeFor`.)

- [ ] **Step 7: Suite + tsc; commit**

```bash
npx vitest run tests/preset-registry.test.ts tests/native-session-host.test.ts tests/session-store.test.ts tests/harness-history-rebuild.test.ts
npx tsc --noEmit
git add src/shared/harness-manifest.ts src/main/harness/preset-registry.ts src/main/harness/prompts/assistant-default.ts src/main/harness/native-session-host.ts tests/
git commit -m "feat(native): Assistant + Coder presets — registry, prompt body, host wiring, legacy chat mapping"
```

---

### Task 14: Preset picker in the forms + end-to-end threading + labels

**Files:**
- Modify: `desktop/src/renderer/components/RuntimeBinding.tsx`, `desktop/src/renderer/components/SessionStrip.tsx`, `desktop/src/renderer/App.tsx`, `desktop/src/renderer/components/ResumeBrowser.tsx`
- Modify: `desktop/src/main/ipc-handlers.ts` (SESSION_CREATE threading ~line 449-490; list mapping ~line 1298-1306), `desktop/src/main/session-manager.ts` + `desktop/src/shared/types.ts` (SessionInfo.harnessId), `desktop/src/main/preload.ts` + `desktop/src/renderer/remote-shim.ts` + `app/.../SessionService.kt` (NATIVE_GET_PERMISSION_MODE channel)
- Test: extend `desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Picker UI in `RuntimeBinding.tsx`.** Exports:

```ts
export type PresetId = 'assistant' | 'coder';
/** Spec §3.4 heuristic: a project folder set at form-open → Coder, else Assistant. */
export function defaultPresetFor(cwd: string): PresetId { return cwd.trim() ? 'coder' : 'assistant'; }
```

`RuntimeBindingFields` gains props `preset: PresetId; onPreset: (p: PresetId) => void;` and renders, inside the `runtime === 'native'` block AFTER the model picker (before the memory-guard block):

```tsx
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Preset</label>
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id} type="button"
                  onClick={() => onPreset(p.id as PresetId)}
                  aria-pressed={preset === p.id}
                  className={`flex-1 text-left rounded border px-2 py-1.5 ${preset === p.id ? 'border-accent bg-inset' : 'border-edge bg-panel hover:bg-inset'}`}
                >
                  <div className="text-xs text-fg">{p.name}</div>
                  <div className="text-[10px] text-fg-muted leading-snug">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
```

(`import { PRESETS } from '../../shared/harness-manifest';` — the renderer already imports from shared.)

- [ ] **Step 2: Form state (both forms, mirroring the `runtime` pattern).** In `SessionStrip.tsx` next to the `runtime` state (~line 173):

```ts
  const [preset, setPreset] = useState<PresetId>('assistant');
  const presetTouched = useRef(false);
  // Follow the folder heuristic until the user explicitly picks a card.
  useEffect(() => { if (!presetTouched.current) setPreset(defaultPresetFor(newCwd)); }, [newCwd]);
```

pass `preset={preset} onPreset={(p) => { presetTouched.current = true; setPreset(p); }}` to `RuntimeBindingFields`; `handleCreate` forwards `runtime === 'native' ? preset : undefined` as a new trailing arg of `onCreateSession` (extend the prop signature at line 32). Same trio in `App.tsx` for the welcome form (`welcomePreset` beside `welcomeRuntime`, heuristic on `welcomeCwd`, forwarded in the create onClick ~line 2802). Reset `presetTouched` when the form opens.

- [ ] **Step 3: `createSession` payload.** `App.tsx` `createSession` (~line 1946) gains a `preset?: string` param, added to the `session.create` payload as `preset: provider === 'native' ? preset : undefined`. (The create payload is one object over the existing SESSION_CREATE channel — preload/shim/Kt need NO change for this field.)

- [ ] **Step 4: Main-side threading.** `SESSION_CREATE` handler: `nativeHost.create({ sessionId, cwd, binding, presetId: opts.preset })`; after BOTH create and resume paths, stamp the returned info: `info.harnessId = nativeHost.getHarnessId(sessionId) ?? undefined;`. `SessionInfo` (shared/types.ts) gains `harnessId?: string;`. The native-rows list mapping (~line 1298) adds `harnessId: r.harnessId,`.

- [ ] **Step 5: `NATIVE_GET_PERMISSION_MODE` channel** (the chip must show `AUTO EDIT` for a fresh Coder session — renderer currently assumes `'ask'`): const `NATIVE_GET_PERMISSION_MODE: 'native:get-permission-mode'`; handler → `nativeHost.getPermissionMode(sessionId)`; preload/shim expose `native.getPermissionMode(sessionId)`; remote-server case; SessionService.kt inert stub; parity row in `ipc-channels.test.ts`. In `App.tsx`, where a native session becomes active/created/resumed (find the existing `nativePermissionModes` map writes from Plan A Task 12/13), fetch the mode and seed the map instead of assuming `'ask'` — validate the returned string against the three known modes exactly the way `cycleNativePermission` already does.

- [ ] **Step 6: Labels.** `ResumeBrowser.tsx`: `PastSession` gains `harnessId?: string;` and the badge row (lines 589-596) adds, next to the YouCoded badge:

```tsx
              {s.provider === 'native' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-inset text-fg-muted shrink-0">
                  {s.harnessId === 'coder' ? 'Coder' : 'Assistant'}
                </span>
              )}
```

`SessionStrip.tsx`: `SessionEntry` gains `provider?: string; harnessId?: string;` (populate where App builds the entries from `SessionInfo` — locate the mapping in App.tsx and thread both fields); the live pill (~line 767) renders the same tiny badge when `s.provider === 'native'` (label only — `Coder`/`Assistant`; the YouCoded-ness is already implied by the badge text? No: render `YouCoded · Coder` in one span to double as the strip's runtime badge, title-attributed "YouCoded native session").

- [ ] **Step 7: Verify + commit**

```bash
npx vitest run tests/ipc-channels.test.ts && npx tsc --noEmit
# dev-window check: bash scripts/run-dev.sh → new-session form shows the two cards;
# picking a folder defaults to Coder; clearing → Assistant (until touched); create a
# Coder session → StatusBar chip reads AUTO EDIT; ResumeBrowser rows show the label. Kill dev after.
git add src/renderer/components/RuntimeBinding.tsx src/renderer/components/SessionStrip.tsx src/renderer/App.tsx src/renderer/components/ResumeBrowser.tsx src/main/ipc-handlers.ts src/main/session-manager.ts src/shared/types.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts ../app/src/main/kotlin/**/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(native): preset picker + harnessId threading + chip mode seeding"
```

---

### Task 15: Docs, rules, full-suite gate

**Files:**
- Modify: `youcoded/docs/provider-dependencies.md` (finalize the Task 2/5 rows — replace any leftover RECORD placeholders), `youcoded-dev/docs/PITFALLS.md`, `youcoded-dev/.claude/rules/native-runtime.md`

- [ ] **Step 1: PITFALLS entries** (workspace repo, `## Native harness` section):

```markdown
- **WebFetch/WebSearch SSRF guard validates EVERY redirect hop** (scheme, literal
  IP, and DNS answer) — but it then fetches by hostname, so a TOCTOU DNS-rebind
  is theoretically possible. Honest friction, not a security boundary (same
  posture as the Bash guards). Never "simplify" back to `redirect: 'follow'`.
  Guard: `desktop/tests/net-guard.test.ts`.
- **DDG 202 = rate-limited and is NEVER retried** (single attempt by design —
  the 2025 breakage waves came from clients hammering it). The chain moves on
  and reports honestly. Guard: `desktop/tests/search-backends.test.ts`.
- **AskUserQuestion answers ride `decision.updatedInput` through the permission
  channel** — PermissionBroker.respond must pass `updatedInput` through to the
  resolver; dropping it silently turns every answer into an empty result.
  Guard: `desktop/tests/permission-broker.test.ts`.
- **Preset permission posture = the modeFor SEED, not presetRules** — mode rules
  outrank preset rules (layer order), so a preset's "edits allow" only works as
  a starting mode ('auto-edit' for Coder). modeFor is seeded once at
  create/resume and NEVER overwritten by the preset afterward.
  Guard: `desktop/tests/native-session-host.test.ts`.
```

- [ ] **Step 2: `native-runtime.md` rule additions** (terse, with `verify:` anchors per the rules README): the four invariants above in one-line form + `search:*` IPC parity note + "legacy `harnessId:'chat'` resolves read-side to Assistant — the stored header is never rewritten."

- [ ] **Step 3: Full gate**

```bash
npm test 2>&1 | tail -5      # full suite green (modulo the known sync-spaces flake — verify it passes isolated)
npx tsc --noEmit
node test-search/probe-exa.mjs "sanity"   # backends still live before acceptance
```

- [ ] **Step 4: Subagent-readiness checklist** (spec decision 5 — verify, don't build): interactive routing goes through the injected `askUser` closure (a subagent host can auto-answer or refuse); `toolServices` injection is constructor-level; preset resolution takes an explicit id — nothing new assumes a user-facing session. Record the three answers for the PR body.

- [ ] **Step 5: Commit** (desktop docs on the feature branch; workspace docs in youcoded-dev):

```bash
git add docs/provider-dependencies.md && git commit -m "docs(native): finalize search coupling rows"
cd /c/Users/desti/youcoded-dev && git add docs/PITFALLS.md .claude/rules/native-runtime.md && git commit -m "docs: Plan B invariants — SSRF hops, DDG 202, updatedInput, preset mode seed" && git push origin master
```

---

### Task 16: Live acceptance (dev build, YOUCODED_NATIVE=1)

Run from the worktree via `bash scripts/run-dev.sh` (or direct electron launch + the CDP recipe in `docs/local-dev.md`). Use OpenRouter `anthropic/claude-sonnet-5`. The scratch project `scratch-native-accept/` exists for file-based checks. Record every outcome for the PR body.

- [ ] **1. Exit test (spec §1 row B):** create an **Assistant** session (no folder or Assistant card picked). Prompt: *"What's the newest Node.js LTS version, and should I upgrade a small Electron app to it? Ask me anything you need to know first."* Expect: an AskUserQuestion card appears (answer it), a WebSearch card with rendered results, possibly a WebFetch card, and a final answer grounded in the search results. **PASS = search happened, the clarifying question round-tripped (the answer visibly shaped the reply).**
- [ ] **2. WebFetch direct:** *"Fetch https://nodejs.org/en/about/previous-releases and summarize it."* → WebFetch card renders extracted markdown; no approval needed (web free in ask mode).
- [ ] **3. SSRF honesty:** *"Fetch http://localhost:9950/status for me."* → tool result is the blocked-address error, shown honestly; model relays it; session continues.
- [ ] **4. Chain fallback honesty (best-effort):** with no keys configured, confirm search works keyless (source `exa` in the result text). If Exa is down/rate-limited, verify the DDG fallback or the honest add-a-key message — any of the three honest outcomes passes; a hang or silent empty fails.
- [ ] **5. Keys UX:** Settings → Providers → Search: add a garbage Tavily key → inline test failure message; (optional, if Destin has a key) add a real key → badge; next search reports `via tavily`.
- [ ] **6. Presets:** new-session form shows the two cards; with a project folder the default is Coder; create Coder → StatusBar chip reads **AUTO EDIT**; an Edit tool call runs without asking while Bash still asks. Create Assistant → chip reads **ASK FIRST**.
- [ ] **7. Legacy resume:** resume a pre-Plan-B native session (harnessId `'chat'` or `'coder'`-era header) from the Resume Browser → resumes as Assistant (or its stamped preset), timeline intact, preset label visible in the row.
- [ ] **8. Interrupt during a pending question:** trigger AskUserQuestion, press ESC while it's open → card clears, turn unwinds (no stuck state), next send works (pairing invariant held).
- [ ] **9. Remote browser spot-check:** open the remote UI; confirm a WebSearch card and an AskUserQuestion card render and the question is answerable remotely (same permission:respond rail).

Kill the dev server + any helper Electron processes when done (port 5223 free).

---

### Task 17: PR, merge, cleanup

- [ ] **Step 1:** Final `npm test` + `npx tsc --noEmit` in the worktree; push the branch.
- [ ] **Step 2:** Open the PR to youcoded master: task table with commits, verification numbers, the Task 16 acceptance record (item-by-item), subagent-readiness answers (Task 15 Step 4), deviations + follow-up candidates. Merge means merge AND push.
- [ ] **Step 3:** Verify the merge landed (`git branch --contains <sha>` lists master), then remove the worktree (`git worktree remove ../youcoded-worktrees/feat-native-web-tools`; NO junctions were created) and delete the branch (`git branch -D feat/native-web-tools`).
- [ ] **Step 4 (workspace repo):** ROADMAP Progress line ("Phase 2 Plan B COMPLETE — …"); move this plan to `docs/archive/plans/` with `status: shipped`; push. The spec stays in `docs/active/` (Plan C remains).

---

## Self-review record (writing-plans checklist)

- **Spec coverage:** §3.1 WebFetch → Tasks 3-4; §3.2 WebSearch chain + keyed upgrades + coupling rows/probes → Tasks 2, 5-8, 10-11; §3.3 AskUserQuestion + IPC decision → Task 9 (+ plan decision 1); §3.4 presets, picker, defaults, legacy mapping, labels, header stamp → Tasks 13-14; §5 testing rows (unit/protocol/sandbox/IPC parity/live acceptance) → per-task tests + Tasks 12, 16; §7 doc obligations → Tasks 2, 5, 15, 17.
- **Known deliberate scope choices:** buddy-window form keeps `provider:'claude'` (it cannot create native sessions today — presets are moot there); folder-less native sessions remain blocked by the existing form guards (the Assistant default applies when the folder field is empty at form-open, and spec's "else Assistant" is honored to the extent the forms allow an empty folder); WebSearch input is `{query}` only (profiles flatten to this anyway in Plan C); no `permission_suggestions` for native asks (Plan A's native- prefix solution stands).
- **Type consistency spot-checks:** `AskDecision.updatedInput` (Task 9 broker) matches the driver's `d.updatedInput` read and `formatAnswers(args, d.updatedInput)`; `ToolServices.search.search(query, signal) → {results, source}` matches SearchService.search and the WebSearch tool's call; `resolvePreset(...).presetRules` feeds `buildDecide(sessionId, cwd, presetRules)`; `presetId` flows create-payload → `CreateNativeSessionOpts.presetId` → `resolvePreset` → header `harnessId` → `getHarnessId` → `SessionInfo.harnessId` → `PastSession.harnessId`/`SessionEntry.harnessId`.
- **Probe-dependent code is flagged, not placeholder:** the exa parser's result path is written against the documented shape and MUST be adjusted to the Task 2 fixture (the test pins the fixture, so a mismatch fails loudly).
