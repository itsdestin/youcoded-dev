---
status: active
---

# Custom providers — backend implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development (one fresh implementer per task,
> review between tasks) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** make the approved Add provider / model picker screens real: custom endpoints get model lists
and context sizes, the provider search box lists real services, "Check for new models" refreshes, every
provider remembers its last key check, and unknown context windows get a sensible default.

**Architecture:** all model data stays in `ModelCatalog` (main process). Custom endpoints are matched to
models.dev by normalized base URL, else asked for their own `GET <base>/models`. Two new channels
(`provider:services`, `provider:refresh-catalog`) go through the one channel table. Key-check verdicts
reuse `OpenRouterHealth`'s store. The unknown-window default rides the `CapabilityProfile`, which is
already threaded to every session create / resume / swap.

**Tech stack:** Electron main (Node, TypeScript), React renderer, Vitest. Desktop app only — Android runs
the same desktop backend, so nothing in Kotlin changes.

**Spec:** `docs/active/specs/2026-10-20-custom-providers-and-catalog-refresh.md`. **Approved UI:** decks
`custom-providers-review-1..3` in `docs/active/design/2026-10-20-custom-providers/`. The UI is already
built on this branch against a fake backend; this plan only adds the real backend and unhooks the fakes.

## Global constraints

- Work only in `/home/destin/youcoded-dev/worktrees/sessions/custom-providers-catalog/youcoded` (branch
  `session/custom-providers-catalog`). All paths below are relative to `youcoded/desktop/` unless noted.
- Run tests with `npx vitest run <files>` from `youcoded/desktop/`. Before finishing any task run
  `npm run typecheck`. The final task runs `bash scripts/verify.sh youcoded` from the workspace root.
- Never touch the user's running YouCoded app. Runtime checks use `bash scripts/run-dev.sh` only.
- **Never-guess rule:** a field a source does not publish is left `undefined` — never 0, never invented.
- **Main process never blocks:** no new `*Sync` fs calls. `tests/main-blocking-calls.allowlist.json`
  is keyed by function name; the catalog's existing file writes must stay inside
  `ModelCatalog.ensureFresh` / `ModelCatalog.readCache`.
- **Line budgets** (`desktop/line-budgets.json`): `shared/backend-contract.ts` (1626),
  `renderer/remote-shim.ts` (3434), `main/preload.ts` (2630) are at their limit. Task 8 raises them by
  exactly what the two new channels cost and says so in its commit message.
- Every non-trivial edit carries a `WHY` comment. Commit messages end with
  `Submitted via YouCoded Assistant`. Stage explicit paths only.
- User-facing words: sentence case, plain language, no invented error causes
  (`docs/error-message-standards.md`).
- Approved numbers: unknown cloud window **250,000**; unknown window for an address on this computer
  **32,768**. Approved UI copy is already in the components — do not reword it.

## File map

| File | Change |
|---|---|
| `src/shared/endpoint-address.ts` (new) | `normalizeEndpoint`, `sameEndpoint` — one address rule for main + renderer |
| `src/main/providers/model-catalog.ts` | models.dev-by-address for custom endpoints; endpoint `/models` fallback; `services()`; `refresh()`; single-flight fetch |
| `src/main/providers/provider-registry.ts` | `endpointKey(id)`; verdicts recorded for every key type; `list()` returns them |
| `src/main/providers/openrouter-health.ts` | `recordCheck()` shared verdict-writing rule |
| `src/main/providers/context-overflow.ts` | custom-endpoint overflow envelope |
| `src/main/harness/capability-profile.ts` | `assumedContextWindow`, `providerType` on the profile |
| `src/main/harness/compaction.ts`, `harness-session.ts` | unknown-window fallback reads the profile |
| `src/main/harness/native-session-host.ts`, `src/main/create-runtime.ts` | pass "on this computer" into the profile; wire catalog deps |
| `src/main/ipc/provider.ts`, `src/shared/backend-contract.ts`, `src/shared/models-channel-types.ts`, `src/main/preload.ts`, `src/renderer/remote-shim.ts` | two channels |
| `src/renderer/components/ProvidersSection.tsx`, `model/ModelPicker.tsx`, `src/shared/provider-types.ts` | drop the stand-in `PendingProviderCalls`; model counts from the catalog |
| `src/renderer/dev/workbench/mock-only.ts`, `mock-shim.ts` | remove the two MOCK_ONLY rows; keep the fakes |
| `tests/…` | one test file per module (named in each task) |
| `youcoded/docs/provider-dependencies.md` | record the new upstream shapes |


## Review corrections (read before any task — these OVERRIDE the task text they name)

A fresh reviewer checked this plan against the code on 2026-10-21 (report:
`~/.youcoded/sessions/-home-destin-youcoded-dev/specialist-reports/530e85fa-9654-4f78-8232-b67de9da65bb.report.md`).
Each finding below was re-verified; the fix is binding. Tasks carry a "⚠ See correction C-n" line.

- **C-1 (Tasks 2, 3) — session start must never wait on the network for a custom endpoint.**
  `create-runtime.ts` asks the catalog during every native session create / resume / swap
  (`contextLengthFor` at ~line 300, the price closure at ~386). With Task 2's widened gate, an expired cache
  would make those awaits fetch OpenRouter + models.dev (15 s timeout each), and Task 3 would add the
  endpoint's own `/models` ask. Fix: add `get(providers, opts?: { cacheOnly?: boolean })`. With
  `cacheOnly: true`, `get()` uses `this.memo ?? EMPTY_CACHE` (never `readCache`, never fetch — see C-4) and
  `endpointModels` returns only an existing cache entry (never asks). In `create-runtime.ts`, the three
  session-path closures (context ~296, vision ~350, price ~375) pass `{ cacheOnly: true }` **only for
  `openai-compatible` providers** — leave every other type exactly as today. The Providers screen, the
  picker (`provider:catalog`) and `refresh()` keep warming the cache. Test: a cloud custom endpoint with an
  empty cache, `get([p], { cacheOnly: true })` resolves with `[]` and the fetch mock is never called.
  The cost is accepted: a custom endpoint's very first session may run with an unknown window (250k
  assumption, Task 7) until the picker or Providers screen has loaded its list once.
- **C-2 (Tasks 3, 4) — `endpointModels` returns `{ rows, ok }`.** `ok` is false when the ask failed
  (network, timeout, non-2xx, bad JSON). `get()` uses `.rows`; `refresh()` uses `.ok` to add the
  provider's `label` to `failed`. Add tests: (a) same key, cache past its TTL (construct with
  `{ ttlMs: -1 }`), ask fails → the previous rows are returned; (b) a forced refresh where the endpoint
  fails → `failed` contains its label.
- **C-3 (Task 4) — `fetchBoth` contract.** Signature
  `private async fetchBoth(stale: CacheShape | null): Promise<{ shape: CacheShape; write: boolean; failed: string[] }>`.
  Body = today's `ensureFresh` fetch logic unchanged: both succeed → `fetchedAt = Date.now()`; exactly one
  succeeds → the good payload replaces its half and `fetchedAt` stays the OLD stamp (`stale?.fetchedAt ?? 0`)
  so the next read retries both; `write: true` in both cases. Total failure → `{ shape: stale ?? EMPTY_CACHE,
  write: false }`. `failed` lists `'OpenRouter'` / `'models.dev'` for the sources that failed on THIS call
  (empty on full success). Drop the `this.lastFailed` field; `ensureFresh` returns the shape, and a private
  `forceFetch()` used only by `refresh()` returns `{ shape, failed }` through the same single-flight
  promise. Add a test: OpenRouter succeeds, models.dev fails → rows served now, and the NEXT normal `get()`
  calls fetch again.
- **C-4 (Task 6) — no new blocking reads.** The blocking-call allowlist is keyed by the ENCLOSING function
  (allowlist README), so `cachedCounts` calling `readCache()` is fine only because the `readFileSync` stays
  inside `readCache` — but `cachedCounts` runs on every Providers-screen open. Use `this.memo` only (no
  `readCache()`); with no memo, fall through to "unknown". Same for C-1's `cacheOnly`. Type the result
  with the real `ProviderModelInfo` from `provider-types.ts` (export it there).
- **C-5 (Task 7) — every budget call, enumerated.** Ignore "seven call sites". Run
  `rg -n "planContextBudget\(|contextBudget\(" src/main/harness/harness-session.ts` and give EVERY hit
  `assumedWindow: this.profile.assumedContextWindow`, including `fitForWindow`'s `planContextBudget(base)`
  calls (its `contextLength == null → 'fits'` early return stays), the summarize/switch planners and the
  pre-request plan. Add a second harness test on the pre-request path (a request with ~40k tokens of
  history on an unknown cloud window is sent untrimmed).
- **C-6 (Task 7) — set `assumedContextWindow` LAST on every return of `resolveProfile`**, after
  `...base`, `...known` overlays and `...sizing`, computed once at the top:
  `local-engine` → local; `openai-compatible` with `onThisComputer === true` → local; everything else →
  cloud. Add a test with a model id that matches a `KNOWN_MODELS` entry for `local-engine` and for
  `openrouter`, proving the derived value wins over any registry field.
- **C-7 (Task 7) — no setter.** `setOnThisComputer` would race sessions created before it is called.
  Instead, carry the fact on the call that already runs for every session: widen the host's
  `contextAndSlotsFor` return type (`native-session-host.ts` ~2233) to
  `{ contextLength: number | null; totalSlots: number | null; onThisComputer?: boolean }` — optional, so
  every existing test closure still type-checks — and read it in `resolveContextAndProfile`. In
  `create-runtime.ts` the context closure (~296) returns `onThisComputer: isLocalEndpoint(p.baseUrl)` for an
  `openai-compatible` provider with a `baseUrl`, and nothing extra for other types. No constructor change.
- **C-8 (Task 9) — the refresh must surface a failure on a phone.** Add `'provider:refresh-catalog'` to
  `REJECT_ON_NOT_OK` in `remote-shim.ts` with a one-line WHY, and pin it in
  `tests/remote-shim.test.ts` the way its existing cases are pinned. `provider:services` answers `[]` on
  failure, so it needs no entry. Update the `providers` comment in `backend-contract.ts` (~1447, "the
  Android/remote stubs reject…") to say the namespace is served to phones through the channel table.
- **C-9 (Task 10) — an older paired computer.** The shim always defines both methods, so `typeof` does
  not detect an old host; the call rejects with `REMOTE_UNSUPPORTED` instead. That is acceptable for
  `services()` (the form already catches and keeps the direct choices). For the picker, `refreshModelList`
  already catches and shows the error box — change its catch to recognise `code === 'REMOTE_UNSUPPORTED'`
  and then set a state that HIDES the button for the rest of the panel's life (no error box). Test it in
  `tests/ModelPicker.test.tsx` with a `refreshCatalog` that rejects with that code.
- **C-10 (Task 5) — constructor position.** Verified: `new ProviderRegistry(home, secrets, localEngine, chatgpt, health)`
  — health is the 5th argument (`tests/openrouter-health.test.ts:144` already does this). The plan's test
  is correct; reuse that file's imports.
- **C-11 (Task 3) — headers.** The implementation passes headers as a plain object
  (`{ Authorization: … }`), and the test asserts that plain object. Keep it that way; do not switch to
  `new Headers()`.
- **C-12 (Task 8) — the real error shape.** Before Step 1, capture the shape: write a throwaway test that
  sends a 400 `{ error: { code: 'context_length_exceeded' } }` through `createOpenAICompatible` against a
  stubbed `fetch` and logs which of `statusCode` / `responseBody` / `data` the thrown `APICallError`
  carries (and whether it is wrapped, i.e. `lastError`). Build the table rows from what you saw, keep the
  `lastError` unwrap the function already does, and delete the throwaway.
- **C-13 (Task 9) — channel types.** `Answer<'modelCatalog', 'services'>` resolves because
  `NativeRuntime.modelCatalog` is typed `ModelCatalog` (`create-runtime.ts:111`) and `Answer` reads the
  method's awaited return. If `npm run typecheck` disagrees, write the types out instead
  (`ServiceEntry[]` and `{ added: number; failed: string[] }`).

---

### Task 0: Bring the branch up to date

Two master commits (`bee0caeac`, `70a3ae925`) touch the same workbench files. Merge first so every
later task starts current.

- [ ] **Step 1:** from `youcoded/`: `git fetch origin && git merge origin/master`. Expected conflicts, if
  any, are only in `src/renderer/dev/workbench/mock-shim.ts` and `screens/settings.ts` /
  `screens/chat.ts`: keep BOTH sides (master's capability lines and screen entries, plus this branch's
  provider fakes and add-provider / model-picker entries).
- [ ] **Step 2:** `npm run typecheck` and
  `npx vitest run tests/shoot-screens.test.ts tests/mock-shim-window.test.ts` — both pass.
- [ ] **Step 3:** commit the merge (`git commit --no-edit`, then amend the message to end with
  `Submitted via YouCoded Assistant`).

---

### Task 1: One address rule, shared

**Why:** the catalog (main) and the Add provider form (renderer) must agree on when two addresses are
"the same service". Today the renderer has a private copy in `ProvidersSection.tsx` and the workbench
has another in `mock-shim.ts`.

**Files:**
- Create: `src/shared/endpoint-address.ts`
- Create: `tests/endpoint-address.test.ts`
- Modify: `src/renderer/components/ProvidersSection.tsx` (delete local `sameAddress`, import the shared one)
- Modify: `src/renderer/dev/workbench/mock-shim.ts` (delete local `norm`/`sameAddress`, import)

**Produces:** `normalizeEndpoint(url: string): string | null` and `sameEndpoint(a: string, b: string): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/endpoint-address.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeEndpoint, sameEndpoint } from '../src/shared/endpoint-address';

describe('normalizeEndpoint', () => {
  it('ignores case of the host, a trailing slash and a trailing /v1', () => {
    expect(normalizeEndpoint('https://API.InceptionLabs.ai/v1/')).toBe('https://api.inceptionlabs.ai');
    expect(normalizeEndpoint('https://api.inceptionlabs.ai')).toBe('https://api.inceptionlabs.ai');
  });
  it('keeps a meaningful path (a provider served below the root)', () => {
    expect(normalizeEndpoint('https://api.z.ai/api/paas/v4')).toBe('https://api.z.ai/api/paas/v4');
    expect(normalizeEndpoint('https://api.fireworks.ai/inference/v1/')).toBe('https://api.fireworks.ai/inference');
  });
  it('keeps the port and the scheme, so http and https are different services', () => {
    expect(normalizeEndpoint('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234');
    expect(sameEndpoint('http://api.example.com', 'https://api.example.com')).toBe(false);
  });
  it('drops a query string and fragment', () => {
    expect(normalizeEndpoint('https://api.example.com/v1?x=1#y')).toBe('https://api.example.com');
  });
  it('answers null for something that is not an http(s) address', () => {
    expect(normalizeEndpoint('')).toBeNull();
    expect(normalizeEndpoint('not a url')).toBeNull();
    expect(normalizeEndpoint('ftp://example.com')).toBeNull();
  });
  it('sameEndpoint is false when either side is not an address', () => {
    expect(sameEndpoint('not a url', 'not a url')).toBe(false);
    expect(sameEndpoint('https://a.com/v1', 'https://A.com/')).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/endpoint-address.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement** — `src/shared/endpoint-address.ts`:

```ts
// One rule for "is this the same service?" — used by the model catalog (main) to match a custom
// endpoint to a models.dev provider, and by Add provider (renderer) to show an edited endpoint as the
// service it is. WHY shared/: the two sides disagreeing would make the picker and the form name
// different services for one address. WHY these rules: models.dev publishes the same service both with
// and without "/v1" and with or without a trailing slash; hosts are case-insensitive; the scheme and
// port are kept because http://x and https://x, or :1234 and :8080, are different servers.

/** The comparable form of an address, or null when it is not an http(s) URL. */
export function normalizeEndpoint(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let path = u.pathname.replace(/\/+$/, '');
  if (path.toLowerCase().endsWith('/v1')) path = path.slice(0, -3);
  path = path.replace(/\/+$/, '');
  // URL already lowercases the host and drops a default port.
  return `${u.protocol}//${u.host}${path}`;
}

/** True when both are addresses and name the same service. */
export function sameEndpoint(a: string, b: string): boolean {
  const na = normalizeEndpoint(a);
  return na !== null && na === normalizeEndpoint(b);
}
```

- [ ] **Step 4:** run the test — PASS.
- [ ] **Step 5:** in `ProvidersSection.tsx`, delete the local `function sameAddress(...)` block (and its
  comment) near the top; add `import { sameEndpoint } from '../../shared/endpoint-address';` and replace
  every `sameAddress(` with `sameEndpoint(`. In `mock-shim.ts`, delete the `norm` and `sameAddress`
  consts inside the providers section, import `sameEndpoint` from `'../../../shared/endpoint-address'`,
  and replace `sameAddress(` with `sameEndpoint(`.
- [ ] **Step 6:** `npm run typecheck` and
  `npx vitest run tests/endpoint-address.test.ts tests/mock-shim-window.test.ts` — PASS.
- [ ] **Step 7: Commit**

```bash
git add src/shared/endpoint-address.ts tests/endpoint-address.test.ts src/renderer/components/ProvidersSection.tsx src/renderer/dev/workbench/mock-shim.ts
git commit -m "feat(providers): one shared rule for matching endpoint addresses

Submitted via YouCoded Assistant"
```

---

### Task 2: Custom endpoints get models.dev rows by address

> ⚠ **See review corrections C-1** at the top of this plan — they override this task's text where they differ.

**Why:** today `ModelCatalog.get()` gives an `openai-compatible` provider nothing (`model-catalog.ts`,
the comment "openai-compatible custom endpoints still have no catalog"). models.dev publishes an `api`
address for 206 providers, so an endpoint whose address matches gets that provider's models, context
sizes and prices for free.

**Files:**
- Modify: `src/main/providers/model-catalog.ts`
- Test: `tests/model-catalog.test.ts` (add a `describe`)

**Consumes:** `normalizeEndpoint` from Task 1.
**Produces:** private `modelsdevKeyForAddress(payload, baseUrl): string | null`; `get()` now returns
models.dev rows for a matched custom endpoint.

**Rules to implement exactly:**
- Only models.dev entries whose `npm` is `'@ai-sdk/openai-compatible'` and whose `api` is a string are
  candidates (other entries need a different wire format the app cannot speak to an arbitrary address).
- Two models.dev entries can share an address (measured 2026-10-20: `llmgateway` + `llmgateway-providers`,
  `umans-ai` + `umans-ai-coding-plan`). Pick the one with the **most models**; break a tie by key name
  ascending, so the result never depends on JSON key order.
- The network gate must include a custom endpoint now: `needsNetwork` is true for an enabled
  `openai-compatible` provider **whose address is not on this computer** (`isLocalEndpoint` from
  `src/shared/provider-types.ts`). A purely local user (Ollama) must still cost zero fetches — the
  existing "does not touch the network" tests pin this; keep them green and add the cloud case.

- [ ] **Step 1: Write the failing tests** — append to `tests/model-catalog.test.ts`:

```ts
describe('custom endpoints matched to models.dev by address', () => {
  let dir: string;
  const MD = {
    inception: { npm: '@ai-sdk/openai-compatible', api: 'https://api.inceptionlabs.ai/v1/', models: {
      'mercury-3': { name: 'Mercury 3', limit: { context: 1000000 }, tool_call: true, cost: { input: 0.1, output: 0.35, cache_read: 0.01 } },
    } },
    // Same address published twice: the larger list wins, whatever the key order.
    'gw-small': { npm: '@ai-sdk/openai-compatible', api: 'https://gw.example.com', models: { a: { name: 'A' } } },
    'gw-big': { npm: '@ai-sdk/openai-compatible', api: 'https://gw.example.com/v1', models: { a: { name: 'A' }, b: { name: 'B' } } },
    // Not OpenAI-compatible: never matched even though the address is listed.
    vendor: { npm: '@ai-sdk/anthropic', api: 'https://vendor.example.com', models: { x: { name: 'X' } } },
  };
  const custom = (baseUrl: string) => ({ id: 'c1', type: 'openai-compatible', label: 'Mine', baseUrl, enabled: true, builtIn: false, hasKey: true, ready: true });
  const make = () => new ModelCatalog(dir, vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('openrouter') ? { data: [] } : MD })) as any);
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-addr-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

  it('a custom endpoint whose address matches gets that service’s models, prices and context', async () => {
    const rows = await make().get([custom('https://API.inceptionlabs.ai')] as any);
    expect(rows).toEqual([expect.objectContaining({ id: 'mercury-3', providerId: 'c1', contextLength: 1000000, supportsTools: true,
      pricing: { in: 0.1, out: 0.35, cacheRead: 0.01 } })]);
  });
  it('two entries on one address: the one with more models wins', async () => {
    const rows = await make().get([custom('https://gw.example.com/')] as any);
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
  it('an entry that is not OpenAI-compatible is never matched', async () => {
    expect(await make().get([custom('https://vendor.example.com')] as any)).toEqual([]);
  });
  it('an unknown address gets no models.dev rows', async () => {
    expect(await make().get([custom('https://nobody.example.com/v1')] as any)).toEqual([]);
  });
});
```

Also, inside the existing `describe('does not touch the network ...')`, add:

```ts
    it('a cloud custom endpoint DOES fetch (it can now be matched by address)', async () => {
      const f = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
      await new ModelCatalog(dir, f as any).get([{ ...CUSTOM, baseUrl: 'https://api.example.com/v1' }] as any);
      expect(f).toHaveBeenCalled();
    });
```

(Check the existing `CUSTOM` fixture's `baseUrl` there is a localhost address, e.g.
`http://localhost:11434/v1`; if it has none, give it that so the existing zero-fetch test still means
"a local endpoint costs nothing".)

- [ ] **Step 2:** `npx vitest run tests/model-catalog.test.ts` — the new tests FAIL.

- [ ] **Step 3: Implement** in `src/main/providers/model-catalog.ts`:

1. Imports: add `import { normalizeEndpoint } from '../../shared/endpoint-address';` and
   `import { isLocalEndpoint } from '../../shared/provider-types';` (keep the existing type import).
2. Add, after `modelsdevModels`:

```ts
  /** The models.dev key whose published address is this endpoint's, or null.
   *  WHY only OpenAI-compatible entries: those are the ones this app can talk to at an arbitrary
   *  address. WHY "most models, then key name": models.dev publishes some addresses twice (a gateway
   *  and its "providers" view); the choice must not depend on JSON key order. */
  private modelsdevKeyForAddress(payload: any, baseUrl: string | undefined): string | null {
    const want = baseUrl ? normalizeEndpoint(baseUrl) : null;
    if (!want || !isObj(payload)) return null;
    let best: { key: string; count: number } | null = null;
    for (const [key, entry] of Object.entries(payload)) {
      if (!isObj(entry) || entry.npm !== '@ai-sdk/openai-compatible' || typeof entry.api !== 'string') continue;
      if (normalizeEndpoint(entry.api) !== want) continue;
      const count = isObj(entry.models) ? Object.keys(entry.models).length : 0;
      if (!best || count > best.count || (count === best.count && key < best.key)) best = { key, count };
    }
    return best?.key ?? null;
  }
```

3. In `get()`, change the gate to:

```ts
    const needsNetwork = providers.some((p) => p.enabled && (
      p.type === 'openrouter' || MODELSDEV_KEY[p.type]
      // A custom endpoint elsewhere can now be matched by address (models.dev). One on THIS computer
      // (Ollama, LM Studio) never is, so a purely local user still pays nothing — see the WHY above.
      || (p.type === 'openai-compatible' && !!p.baseUrl && !isLocalEndpoint(p.baseUrl))));
```

4. In the loop, replace the trailing comment line
   `// openai-compatible custom endpoints still have no catalog (user types a model id).` with:

```ts
      else if (p.type === 'openai-compatible') {
        // Matched by address to a models.dev provider. (Task 3 adds the endpoint's own /models list
        // for an address models.dev does not know.)
        const key = this.modelsdevKeyForAddress(cache.modelsdev, p.baseUrl);
        if (key) out.push(...this.modelsdevModels(cache.modelsdev, key, p.id));
      }
```

   It must be part of the same `if / else if` chain as the other provider types.
5. Update the file's header comment: custom endpoints now get catalog rows (models.dev by address).

- [ ] **Step 4:** `npx vitest run tests/model-catalog.test.ts` — all PASS (old and new).
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/providers/model-catalog.ts tests/model-catalog.test.ts
git commit -m "feat(catalog): custom endpoints get models.dev rows matched by address

Submitted via YouCoded Assistant"
```

---

### Task 3: An unmatched endpoint is asked for its own model list

> ⚠ **See review corrections C-1, C-2, C-11** at the top of this plan — they override this task's text where they differ.

**Why:** a home server, Ollama, a company proxy, or a service models.dev doesn't list gets nothing from
Task 2. Most such servers answer `GET <base>/models`. Some return only ids (Ollama cloud); some return
OpenRouter-shaped rows with `context_length` and `pricing` (Inception, verified 2026-10-20 without a key).

**Files:**
- Modify: `src/main/providers/model-catalog.ts`
- Modify: `src/main/providers/provider-registry.ts` (add `endpointKey`)
- Modify: `src/main/create-runtime.ts` (inject it)
- Test: `tests/model-catalog.test.ts`, `tests/provider-registry.test.ts`

**Consumes:** Task 2's `modelsdevKeyForAddress`.
**Produces:**
- `ProviderRegistry.endpointKey(id: string): Promise<string | undefined>` — the saved key for a provider
  id, never thrown (undefined on any failure).
- `ModelCatalog` option `endpointKey?: (providerId: string) => Promise<string | undefined>`.
- Private `ModelCatalog.endpointModels(p: ProviderStatus, opts?: { force?: boolean }): Promise<CatalogModel[]>`.

**Rules to implement exactly:**
- Asked only when Task 2 found no models.dev match. Local addresses (`isLocalEndpoint`) ARE asked here
  — this is how Ollama / LM Studio get a real model list. This is a request to the user's own computer,
  not the internet, so the "local user pays nothing" rule is about the internet fetches only.
- Request: `GET ${base without trailing slash}/models`, `Authorization: Bearer <key>` only when a key is
  saved, 8-second timeout (`AbortSignal.timeout(8_000)`).
- Parse `{ data: [...] }` (OpenAI shape) or a bare array. Each row needs a string `id`. Read `name` →
  label (else the id); `context_length` (number) → `contextLength`; `pricing.prompt`/`pricing.completion`
  as per-token strings (×1e6, same never-guess rules as `openrouterModels` — reuse that parser, see
  step 3); `supported_parameters` including `'tools'` → `supportsTools: true`. Anything else is left unset.
- Cache **in memory only**, keyed by `${providerId}\0${normalizeEndpoint(baseUrl)}\0${keyFingerprint}`,
  where `keyFingerprint` is the first 16 hex chars of SHA-256 of the key (or `'none'`). WHY: a replaced
  key or an edited address must never be served another key's list. TTL: same `this.ttlMs`. No file
  writes (main-blocking rule; the list is cheap to re-ask).
- A failed request (network error, timeout, non-2xx, bad JSON) returns the previous cached list for
  that cache key if any, else `[]`. It never throws (get()'s contract).
- At most one request in flight per cache key: keep a `Map<string, Promise<CatalogModel[]>>` of
  in-flight asks and return the same promise to concurrent callers; delete it in `finally`.

- [ ] **Step 1: Write the failing tests** — append to `tests/model-catalog.test.ts`:

```ts
describe("an unmatched custom endpoint is asked for its own /models", () => {
  let dir: string;
  const custom = (baseUrl: string, id = 'c1') => ({ id, type: 'openai-compatible', label: 'Mine', baseUrl, enabled: true, builtIn: false, hasKey: true, ready: true });
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-ep-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

  function rig(endpointBody: unknown, opts: { ok?: boolean; key?: string } = {}) {
    const calls: { url: string; auth?: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      calls.push({ url, auth: init?.headers?.Authorization });
      if (url.includes('openrouter') || url.includes('models.dev')) return { ok: true, json: async () => ({}) };
      return { ok: opts.ok ?? true, json: async () => endpointBody };
    });
    const cat = new ModelCatalog(dir, fetchImpl as any, { endpointKey: async () => opts.key });
    return { cat, calls };
  }

  it('reads an OpenRouter-shaped list: names, context and per-token prices', async () => {
    const { cat, calls } = rig({ data: [{ id: 'm3', name: 'Mercury 3', context_length: 1000000,
      pricing: { prompt: '0.0000001', completion: '0.00000035' }, supported_parameters: ['tools'] }] }, { key: 'sk-1' });
    const rows = await cat.get([custom('https://unknown.example.com/v1/')] as any);
    expect(rows).toEqual([{ id: 'm3', providerId: 'c1', label: 'Mercury 3', contextLength: 1000000, supportsTools: true, pricing: { in: 0.1, out: 0.35 } }]);
    expect(calls.find((c) => c.url === 'https://unknown.example.com/v1/models')?.auth).toBe('Bearer sk-1');
  });
  it('reads an id-only list and leaves every other fact unset', async () => {
    const { cat } = rig({ object: 'list', data: [{ id: 'kimi-k2.6', object: 'model' }] });
    expect(await cat.get([custom('https://ollama.example.com/v1')] as any)).toEqual([{ id: 'kimi-k2.6', providerId: 'c1', label: 'kimi-k2.6' }]);
  });
  it('sends no Authorization header when no key is saved', async () => {
    const { cat, calls } = rig({ data: [] });
    await cat.get([custom('http://localhost:11434/v1')] as any);
    expect(calls.find((c) => c.url === 'http://localhost:11434/v1/models')?.auth).toBeUndefined();
  });
  it('a local endpoint is asked, but no internet catalog is fetched', async () => {
    const { cat, calls } = rig({ data: [{ id: 'llama3' }] });
    expect((await cat.get([custom('http://localhost:11434/v1')] as any)).map((r) => r.id)).toEqual(['llama3']);
    expect(calls.some((c) => c.url.includes('openrouter') || c.url.includes('models.dev'))).toBe(false);
  });
  it('a failing endpoint gives no rows and never throws', async () => {
    const { cat } = rig(null, { ok: false });
    expect(await cat.get([custom('https://down.example.com')] as any)).toEqual([]);
  });
  it('asks once for two callers at the same time', async () => {
    const { cat, calls } = rig({ data: [{ id: 'a' }] });
    await Promise.all([cat.get([custom('https://one.example.com')] as any), cat.get([custom('https://one.example.com')] as any)]);
    expect(calls.filter((c) => c.url === 'https://one.example.com/models')).toHaveLength(1);
  });
  it('a new key is never served the old key’s list', async () => {
    let key = 'sk-old';
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      if (!url.endsWith('/models')) return { ok: true, json: async () => ({}) };
      seen.push(init?.headers?.Authorization);
      return { ok: true, json: async () => ({ data: [{ id: key }] }) };
    });
    const cat = new ModelCatalog(dir, fetchImpl as any, { endpointKey: async () => key });
    await cat.get([custom('https://k.example.com')] as any);
    key = 'sk-new';
    expect((await cat.get([custom('https://k.example.com')] as any)).map((r) => r.id)).toEqual(['sk-new']);
    expect(seen).toEqual(['Bearer sk-old', 'Bearer sk-new']);
  });
});
```

And to `tests/provider-registry.test.ts` (inside the main `describe`, using its existing `reg`):

```ts
  it('endpointKey answers the saved key, and undefined for a provider without one or an unknown id', async () => {
    const id = await reg.upsert({ type: 'openai-compatible', label: 'Mine', baseUrl: 'https://x.example.com/v1', enabled: true });
    expect(await reg.endpointKey(id)).toBeUndefined();
    await reg.setKey(id, 'sk-123');
    expect(await reg.endpointKey(id)).toBe('sk-123');
    expect(await reg.endpointKey('nope')).toBeUndefined();
  });
```

- [ ] **Step 2:** run both files — the new tests FAIL.

- [ ] **Step 3: Implement.**

`provider-registry.ts`, next to `keyFor`:

```ts
  /** The saved key for a provider id, for the model catalog's own /models request on a custom
   *  endpoint. Never throws: a missing provider, no key, or an undecryptable store all answer
   *  undefined, and the catalog then asks without a key. */
  async endpointKey(id: string): Promise<string | undefined> {
    try {
      const p = this.readAll().find((x) => x.id === id);
      return p ? await this.keyFor(p) : undefined;
    } catch { return undefined; }
  }
```

`model-catalog.ts`:
1. Imports: `import { createHash } from 'crypto';`.
2. Extract the per-row body of `openrouterModels` into
   `private openrouterRow(row: unknown, providerId: string): CatalogModel | null` (returns null for a
   malformed row), and make `openrouterModels` call it in its loop. No behaviour change — the existing
   OpenRouter tests prove it.
3. Add the option to the constructor's `opts` type: `endpointKey?: (providerId: string) => Promise<string | undefined>;`
   store it as `private readonly endpointKey: ((id: string) => Promise<string | undefined>) | null`.
4. Fields: `private endpointCache = new Map<string, { at: number; rows: CatalogModel[] }>();` and
   `private endpointInflight = new Map<string, Promise<CatalogModel[]>>();`.
5. The method:

```ts
  /** A custom endpoint's own GET /models, for an address models.dev does not know.
   *  WHY keyed by key fingerprint and normalized address: an edited address or a replaced key must
   *  never be served another one's list. WHY memory only: the list is cheap to re-ask, and a file write
   *  here would block the main process (rule: main never blocks). Never throws. */
  private async endpointModels(p: ProviderStatus, opts?: { force?: boolean }): Promise<CatalogModel[]> {
    const base = p.baseUrl ? normalizeEndpoint(p.baseUrl) : null;
    if (!base || !p.baseUrl) return [];
    let key: string | undefined;
    try { key = (await this.endpointKey?.(p.id)) || undefined; } catch { key = undefined; }
    const fp = key ? createHash('sha256').update(key).digest('hex').slice(0, 16) : 'none';
    const cacheKey = `${p.id}\0${base}\0${fp}`;
    const hit = this.endpointCache.get(cacheKey);
    if (hit && !opts?.force && Date.now() - hit.at < this.ttlMs) return hit.rows;
    const running = this.endpointInflight.get(cacheKey);
    if (running) return running;
    const ask = (async () => {
      try {
        const res = await this.fetchImpl(`${p.baseUrl!.replace(/\/+$/, '')}/models`, {
          headers: key ? { Authorization: `Bearer ${key}` } : undefined,
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error('not ok');
        const body = await res.json();
        const list = Array.isArray(body) ? body : isObj(body) && Array.isArray(body.data) ? body.data : null;
        if (!list) throw new Error('no list');
        const rows = list.map((r: unknown) => this.openrouterRow(r, p.id)).filter((r: CatalogModel | null): r is CatalogModel => r !== null);
        this.endpointCache.set(cacheKey, { at: Date.now(), rows });
        return rows;
      } catch {
        return hit?.rows ?? [];
      } finally {
        this.endpointInflight.delete(cacheKey);
      }
    })();
    this.endpointInflight.set(cacheKey, ask);
    return ask;
  }
```

   Note `openrouterRow` sets `supportsTools` to `true` OR `false` when `supported_parameters` is an
   array. For endpoint rows that is acceptable (the array is the endpoint's own claim). The id-only
   test passes because such rows have no `supported_parameters`.
6. In `get()`'s `openai-compatible` branch from Task 2, add the fallback:

```ts
        if (key) out.push(...this.modelsdevModels(cache.modelsdev, key, p.id));
        else out.push(...await this.endpointModels(p));
```

7. Because local endpoints are asked here but not internet-fetched, `needsNetwork` from Task 2 stays as
   is. Make sure `cache` for a local-only call is `EMPTY_CACHE` (it already is when `needsNetwork` is
   false), so `modelsdevKeyForAddress` returns null and the endpoint is asked.

`create-runtime.ts`, in the `new ModelCatalog(userDataDir, undefined, { ... })` options, add:

```ts
    // A custom endpoint's own /models list is asked with its saved key (model-catalog endpointModels).
    endpointKey: (id) => providerRegistry.endpointKey(id),
```

- [ ] **Step 4:** `npx vitest run tests/model-catalog.test.ts tests/provider-registry.test.ts` — PASS.
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/providers/model-catalog.ts src/main/providers/provider-registry.ts src/main/create-runtime.ts tests/model-catalog.test.ts tests/provider-registry.test.ts
git commit -m "feat(catalog): ask an unmatched custom endpoint for its own model list

Submitted via YouCoded Assistant"
```

---

### Task 4: The service list and the manual refresh (catalog side)

> ⚠ **See review corrections C-2, C-3** at the top of this plan — they override this task's text where they differ.

**Why:** the Add provider search box needs the real list of services (today only the workbench fakes
it), and "Check for new models" needs a refresh that skips the 24-hour cache.

**Files:**
- Modify: `src/main/providers/model-catalog.ts`
- Test: `tests/model-catalog.test.ts`

**Consumes:** Tasks 2–3 (`modelsdevKeyForAddress`, `endpointModels`).
**Produces:**
- `ModelCatalog.services(): Promise<ServiceEntry[]>` (`ServiceEntry` is already in
  `src/shared/provider-types.ts`).
- `ModelCatalog.refresh(providers: ProviderStatus[]): Promise<{ added: number; failed: string[] }>`.
- Constructor option `refreshChatgpt?: () => Promise<void>`.
- `ensureFresh` gains an optional `force` and becomes single-flight (concurrent callers share one fetch).

**Rules to implement exactly:**

`services()`:
- Uses the cached models.dev payload (`ensureFresh()`, not forced). Offline with no cache → `[]`.
- One entry per models.dev key with `npm === '@ai-sdk/openai-compatible'`, a string `api` that
  `normalizeEndpoint` accepts, and at least one model. **Skip addresses on this computer**
  (`isLocalEndpoint`) — LM Studio's `127.0.0.1:1234` is not something to "add with a key"; it stays
  reachable through "Other address…".
- When two keys share an address, keep only the one `modelsdevKeyForAddress` would pick (most models,
  then key name) — so the list never shows a service the catalog would not match.
- `label`: the entry's `name` if it is a non-empty string, else the key. `baseUrl`: the published `api`
  with trailing slashes removed. `modelCount`: number of models. `models`: up to **50** rows sorted by
  context length (largest first, missing last), each `{ id, label, contextLength?, priceIn?, priceOut?,
  tools? }` read with the same never-guess rules as `modelsdevModels` (`tools` from `tool_call`).
  WHY the cap: 190 services × up to 617 models would send ~MBs to a phone; the fold shows a handful.
- Sorted by `label`, case-insensitive (`localeCompare(b, undefined, { sensitivity: 'base' })`).
- Memoised per payload object (a `WeakMap<object, ServiceEntry[]>`), so repeated calls do not re-scan.

`ensureFresh(opts?: { force?: boolean })`:
- `force: true` skips both TTL checks (memo and disk) and always fetches.
- Single-flight: a field `private fetching: Promise<CacheShape> | null`. If a fetch is in flight, every
  caller (forced or not) awaits it. Implement by moving the existing fetch body into
  `private async fetchBoth(stale: CacheShape | null): Promise<CacheShape>` (unchanged logic) and:

```ts
  private async ensureFresh(opts?: { force?: boolean }): Promise<CacheShape> {
    if (!opts?.force && this.memo && Date.now() - this.memo.fetchedAt < this.ttlMs) return this.memo;
    if (this.fetching) return this.fetching;
    const stale = this.readCache();
    if (!opts?.force && stale && Date.now() - stale.fetchedAt < this.ttlMs) { this.memo = stale; return stale; }
    const p = this.fetchBoth(this.memo ?? stale).finally(() => { if (this.fetching === p) this.fetching = null; });
    this.fetching = p;
    return p;
  }
```

  Keep the `fs.mkdirSync` / `fs.writeFileSync` calls **inside `ensureFresh`** (the main-blocking
  allowlist names that function): `fetchBoth` returns `{ shape, write: boolean }` and `ensureFresh`
  does the write after awaiting. Simplest correct shape:

```ts
    const p = this.fetchBoth(this.memo ?? stale).then((r) => {
      if (r.write) {
        try {
          fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
          fs.writeFileSync(this.cachePath, JSON.stringify(r.shape));
        } catch { /* cache write is best-effort */ }
        this.memo = r.shape;
      }
      return r.shape;
    }).finally(() => { if (this.fetching === p) this.fetching = null; });
```

  `fetchBoth` returns `{ shape: stale ?? EMPTY_CACHE, write: false }` on total failure and
  `{ shape: fresh, write: true }` otherwise; it also records which sources failed in
  `this.lastFailed: string[]` (`'OpenRouter'`, `'models.dev'`) for `refresh()` to report.
  The memo must be passed as the `stale` base (`this.memo ?? stale`) so a forced refresh after a
  partial failure still keeps the good source's data.

`refresh(providers)`:
- Count `before = (await this.get(providers)).length` is NOT good enough (a renamed model looks like
  no change). Instead collect a `Set` of `${providerId}\0${id}` from `get(providers)` before, run the
  refresh, collect again after; `added` = entries in after not in before.
- Steps: `await this.ensureFresh({ force: true })` if any provider needs the network (same gate as
  `get()`); then for every enabled `openai-compatible` provider without a models.dev match, call
  `endpointModels(p, { force: true })`; then `await this.refreshChatgpt?.()` inside try/catch (its own
  retry spacing may make it a no-op — that is fine).
- `failed`: `this.lastFailed` from the forced fetch, plus the label of each custom endpoint whose forced
  ask failed (track success with a boolean returned alongside the rows — change `endpointModels` to
  record failures in a `Set<string>` of provider ids during a forced pass). De-duplicate.
- Concurrency: a field `private refreshing: Promise<…> | null`; a second `refresh()` while one runs
  returns the same promise.
- Never throws.

- [ ] **Step 1: Write the failing tests** — append to `tests/model-catalog.test.ts`:

```ts
describe('services() — the providers Add provider can search', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-svc-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const MD = {
    zeta: { name: 'Zeta', npm: '@ai-sdk/openai-compatible', api: 'https://zeta.example.com/v1/', models: {
      small: { name: 'Small', limit: { context: 8000 } }, big: { name: 'Big', limit: { context: 1000000 }, tool_call: false, cost: { input: 1, output: 2 } } } },
    alpha: { name: 'alpha', npm: '@ai-sdk/openai-compatible', api: 'https://alpha.example.com', models: { a: { name: 'A' } } },
    lmstudio: { name: 'LMStudio', npm: '@ai-sdk/openai-compatible', api: 'http://127.0.0.1:1234/v1', models: { l: { name: 'L' } } },
    empty: { name: 'Empty', npm: '@ai-sdk/openai-compatible', api: 'https://empty.example.com', models: {} },
    other: { name: 'Other', npm: '@ai-sdk/anthropic', api: 'https://other.example.com', models: { o: { name: 'O' } } },
    'gw-small': { name: 'GW small', npm: '@ai-sdk/openai-compatible', api: 'https://gw.example.com', models: { a: {} } },
    'gw-big': { name: 'GW big', npm: '@ai-sdk/openai-compatible', api: 'https://gw.example.com/v1', models: { a: {}, b: {} } },
  };
  const make = () => new ModelCatalog(dir, vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('openrouter') ? { data: [] } : MD })) as any);

  it('lists OpenAI-compatible, non-local services with models, sorted by name', async () => {
    expect((await make().services()).map((s) => s.label)).toEqual(['alpha', 'GW big', 'Zeta']);
  });
  it('carries the address, the count and the models largest-window first, never inventing facts', async () => {
    const zeta = (await make().services()).find((s) => s.id === 'zeta')!;
    expect(zeta).toMatchObject({ baseUrl: 'https://zeta.example.com/v1', modelCount: 2 });
    expect(zeta.models).toEqual([
      { id: 'big', label: 'Big', contextLength: 1000000, priceIn: 1, priceOut: 2, tools: false },
      { id: 'small', label: 'Small', contextLength: 8000 },
    ]);
  });
  it('is empty offline with nothing cached', async () => {
    const cat = new ModelCatalog(dir, vi.fn(async () => { throw new Error('offline'); }) as any);
    expect(await cat.services()).toEqual([]);
  });
});

describe('refresh() — "Check for new models"', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-refresh-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const OR = { id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true, builtIn: true, hasKey: true, ready: true };

  it('skips the 24-hour cache and reports what is new', async () => {
    let rows = [{ id: 'old' }];
    const f = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('openrouter') ? { data: rows } : {} }));
    const cat = new ModelCatalog(dir, f as any);
    await cat.get([OR] as any);
    rows = [{ id: 'old' }, { id: 'inception/mercury-3' }];
    expect(await cat.refresh([OR] as any)).toEqual({ added: 1, failed: [] });
    expect((await cat.get([OR] as any)).map((m) => m.id)).toContain('inception/mercury-3');
  });
  it('names a source that could not be reached and keeps its old list', async () => {
    let down = false;
    const f = vi.fn(async (url: string) => {
      if (down && url.includes('openrouter')) throw new Error('offline');
      return { ok: true, json: async () => url.includes('openrouter') ? { data: [{ id: 'kept' }] } : {} };
    });
    const cat = new ModelCatalog(dir, f as any);
    await cat.get([OR] as any);
    down = true;
    expect(await cat.refresh([OR] as any)).toEqual({ added: 0, failed: ['OpenRouter'] });
    expect((await cat.get([OR] as any)).map((m) => m.id)).toEqual(['kept']);
  });
  it('two presses at once share one fetch', async () => {
    const f = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('openrouter') ? { data: [] } : {} }));
    const cat = new ModelCatalog(dir, f as any);
    await Promise.all([cat.refresh([OR] as any), cat.refresh([OR] as any)]);
    expect(f.mock.calls.filter(([u]) => String(u).includes('openrouter'))).toHaveLength(1);
  });
  it('a normal read during a refresh waits for it instead of starting a second fetch', async () => {
    const f = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('openrouter') ? { data: [{ id: 'x' }] } : {} }));
    const cat = new ModelCatalog(dir, f as any);
    await Promise.all([cat.refresh([OR] as any), cat.get([OR] as any)]);
    expect(f.mock.calls.filter(([u]) => String(u).includes('openrouter'))).toHaveLength(1);
  });
  it('asks the ChatGPT plan to refresh, and survives it throwing', async () => {
    const refreshChatgpt = vi.fn(async () => { throw new Error('nope'); });
    const cat = new ModelCatalog(dir, vi.fn(async () => ({ ok: true, json: async () => ({}) })) as any, { refreshChatgpt });
    await expect(cat.refresh([OR] as any)).resolves.toMatchObject({ failed: [] });
    expect(refreshChatgpt).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** run — new tests FAIL.
- [ ] **Step 3:** implement per the rules above. Import `ServiceEntry` from `'../../shared/provider-types'`.
- [ ] **Step 4:** `npx vitest run tests/model-catalog.test.ts tests/main-blocking-calls.test.ts tests/harness-pricing.test.ts tests/cloud-context-lifecycle.test.ts` — all PASS. If `main-blocking-calls` fails, the file writes moved out of `ensureFresh`; move them back (do not edit the allowlist).
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/providers/model-catalog.ts tests/model-catalog.test.ts
git commit -m "feat(catalog): service list for Add provider and a forced, single-flight refresh

Submitted via YouCoded Assistant"
```

---

### Task 5: Every provider remembers its last key check

> ⚠ **See review corrections C-10** at the top of this plan — they override this task's text where they differ.

**Why:** the UX tester saw a refused OpenAI key read "Connected" again after reopening Settings. Only
OpenRouter's verdict is stored (`OpenRouterHealth`, file `provider-health.json`). The renderer row already
reads `provider.health` (`ProvidersSection.tsx` `savedRefusal`), so storing verdicts for the other key
types is all that is missing.

**Files:**
- Modify: `src/main/providers/openrouter-health.ts` (add `recordCheck`)
- Modify: `src/main/providers/provider-registry.ts` (`testConnection`, `setKey`, `list`)
- Test: `tests/provider-registry.test.ts`

**Produces:** `OpenRouterHealth.recordCheck(ref: string, key: string, verdict: ProviderHealth['verdict']): void`.

**Rules to implement exactly:**
- Applies to types `anthropic`, `openai`, `google`, `openai-compatible`, and **only** when a saved key
  was used for the check (`p.secretRef` with a readable key). A keyless custom endpoint has nothing to
  remember. `local-engine` and `chatgpt` are untouched. OpenRouter keeps its existing path unchanged.
- Verdict mapping in `testConnection` (the existing `res` handling at the end of the function):
  `res.ok` → `'verified'`; `401`/`403` → `'rejected'`; any other status → no record (the server answered
  but said nothing about the key); a thrown fetch (network, timeout) → `'unchecked'`.
- Same "an unreachable check never overwrites a real answer" rule OpenRouter already uses: `recordCheck`
  skips writing `'unchecked'` when a non-`'unchecked'` verdict is already stored for `ref`.
- No `reason` field for these types (the existing `reason` union is OpenRouter-specific). The UI words
  for a rejected non-OpenRouter key are already in `ProvidersSection.tsx`.
- `setKey`: a new key must clear the old key's verdict for these types too — call
  `this.health?.adoptOrClear(ref, plaintext)` for every type, not only `openrouter`. (`adoptOrClear`
  with no pending check simply deletes the record.)
- `list()`: return `health` for these types as it already does for OpenRouter, still only when `hasKey`.
  `ready` must keep ignoring it (same reason as the existing comment).
- Leave `testConnection`'s return value exactly as today, plus `verdict` where one was decided (the
  type already allows it).

- [ ] **Step 1: Write the failing tests** — append to `tests/provider-registry.test.ts`. Find how the
  file builds `reg` today; if its `ProviderRegistry` has no `OpenRouterHealth`, build a local one in this
  `describe` as below (the constructor's 5th argument):

```ts
describe('saved key checks for direct keys and custom endpoints', () => {
  let root: string; let reg: ProviderRegistry; let health: OpenRouterHealth;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-health-all-'));
    health = new OpenRouterHealth({ dir: root });
    reg = new ProviderRegistry(new NativeHome(root), new SecretsStore(root, getSecretStorage()), null, null, health);
    await reg.init();
  });
  afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });
  const answer = (status: number) => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));

  it('a refused key stays refused after the list is read again', async () => {
    const id = await reg.upsert({ type: 'openai', label: 'OpenAI', enabled: true });
    await reg.setKey(id, 'sk-bad');
    answer(401);
    expect(await reg.testConnection(id)).toMatchObject({ ok: false, verdict: 'rejected' });
    const row = (await reg.list()).find((p) => p.id === id)!;
    expect(row.health?.verdict).toBe('rejected');
    expect(row.ready).toBe(true);   // the words change, the user is not locked out
  });
  it('an unreachable check does not overwrite a real answer', async () => {
    const id = await reg.upsert({ type: 'openai-compatible', label: 'Mine', baseUrl: 'https://x.example.com/v1', enabled: true });
    await reg.setKey(id, 'sk-1');
    answer(200);
    await reg.testConnection(id);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await reg.testConnection(id)).toMatchObject({ ok: false, verdict: 'unchecked' });
    expect((await reg.list()).find((p) => p.id === id)!.health?.verdict).toBe('verified');
  });
  it('a new key forgets the old key’s verdict', async () => {
    const id = await reg.upsert({ type: 'anthropic', label: 'Anthropic', enabled: true });
    await reg.setKey(id, 'sk-bad');
    answer(401);
    await reg.testConnection(id);
    await reg.setKey(id, 'sk-good');
    expect((await reg.list()).find((p) => p.id === id)!.health).toBeUndefined();
  });
  it('a server error is not a verdict about the key', async () => {
    const id = await reg.upsert({ type: 'google', label: 'Google', enabled: true });
    await reg.setKey(id, 'k');
    answer(500);
    const r = await reg.testConnection(id);
    expect(r.verdict).toBeUndefined();
    expect((await reg.list()).find((p) => p.id === id)!.health).toBeUndefined();
  });
  it('a keyless custom endpoint records nothing', async () => {
    const id = await reg.upsert({ type: 'openai-compatible', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', enabled: true });
    answer(401);
    await reg.testConnection(id);
    expect((await reg.list()).find((p) => p.id === id)!.health).toBeUndefined();
  });
});
```

  Add any missing imports at the top of the file (`OpenRouterHealth` from
  `'../src/main/providers/openrouter-health'`, plus `NativeHome`, `SecretsStore`, `getSecretStorage`,
  `fs`, `path`, `os` if not already imported).

- [ ] **Step 2:** run — new tests FAIL.

- [ ] **Step 3: Implement.**

`openrouter-health.ts`, after `record`:

```ts
  /** Store a verdict from a plain models-list check (direct keys and custom endpoints). Same rule as
   *  check(): an unreachable check never overwrites a real answer already on file. No reason field —
   *  those reasons describe OpenRouter's own key endpoint. */
  recordCheck(ref: string, key: string, verdict: ProviderHealth['verdict']): void {
    const prior = this.get(ref);
    if (verdict === 'unchecked' && prior && prior.verdict !== 'unchecked') return;
    this.record(ref, key, { verdict, checkedAt: this.now() });
  }
```

`provider-registry.ts`:
1. In `setKey`, replace `if (entry.type === 'openrouter') this.health?.adoptOrClear(ref, plaintext);`
   with `this.health?.adoptOrClear(ref, plaintext);` and update its comment: every key type now has a
   stored verdict that a new key invalidates.
2. In `list()`, replace the `const health = p.type === 'openrouter' && hasKey ? ...` line with:

```ts
      const remembers = p.type === 'openrouter' || p.type === 'anthropic' || p.type === 'openai'
        || p.type === 'google' || p.type === 'openai-compatible';
      const health = remembers && hasKey ? this.health?.get(p.secretRef) : undefined;
```

3. In `testConnection`, track the key used. Declare `let usedKey: string | undefined;` next to
   `let p: ProviderConfig | undefined;`. In the `openai-compatible`, `anthropic`, `openai` and `google`
   cases, assign `usedKey = key;` right after the key is read and checked (for `openai-compatible`,
   inside the `if (p.secretRef)` block). Then replace the tail:

```ts
      // Remember the answer for a saved key (ux-review-1#U1): a refused key must still read refused
      // after Settings is reopened. A server error says nothing about the key, so it is not stored.
      const remember = (verdict: 'verified' | 'rejected') => {
        if (usedKey && p?.secretRef) this.health?.recordCheck(p.secretRef, usedKey, verdict);
        return verdict;
      };
      if (res.ok) return { ok: true, message: 'Connected.', verdict: remember('verified') };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'The API key was rejected — check it and try again.', verdict: remember('rejected') };
      }
      return { ok: false, message: `The provider responded with HTTP ${res.status}.` };
    } catch (e: any) {
      if (usedKey && p?.secretRef) this.health?.recordCheck(p.secretRef, usedKey, 'unchecked');
      return { ok: false, message: `Could not reach ${p?.label ?? id}: ${e?.message ?? String(e)}`,
        ...(usedKey ? { verdict: 'unchecked' as const } : {}) };
    }
```

   `local-engine` never sets `usedKey`, so its behaviour is unchanged.

- [ ] **Step 4:** `npx vitest run tests/provider-registry.test.ts tests/openrouter-health.test.ts tests/main-blocking-calls.test.ts` — PASS.
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/providers/openrouter-health.ts src/main/providers/provider-registry.ts tests/provider-registry.test.ts
git commit -m "feat(providers): remember the last key check for every key type

Submitted via YouCoded Assistant"
```

---

### Task 6: Model counts on provider cards ("Connected · 4 models")

> ⚠ **See review corrections C-4** at the top of this plan — they override this task's text where they differ.

**Why:** the approved card shows how many models a provider brings. `ProviderStatus.models` already
exists (`src/shared/provider-types.ts`) and the row already renders it (`ProvidersSection.tsx`
`modelsWord`). It must be filled without slowing anything else down.

**Do NOT compute it in `ProviderRegistry.list()`.** `list()` has 14 callers in `src/main`, including every
session create / resume / model swap; adding a catalog read there would put internet fetches in front
of every session start (the exact cost `ModelCatalog.get()`'s network gate exists to avoid).

**Files:**
- Modify: `src/main/ipc/provider.ts` (the `PROVIDER_LIST` entry only)
- Test: `tests/provider-list-models.test.ts` (new — the handler is small, test it directly)

**Rules to implement exactly:**
- The `provider:list` table entry (the Providers screen's own read) becomes: list the providers, then
  read `modelCatalog.get(list)` **only from cache** — never trigger a network fetch for this. Add a
  method to `ModelCatalog`: `async cachedCounts(providers: ProviderStatus[]): Promise<Map<string, { count: number; source: 'catalog' | 'endpoint' }>>`
  that uses `this.memo ?? this.readCache()` (no fetch) for the models.dev/OpenRouter rows and
  `this.endpointCache` entries for endpoint lists (no ask). A provider with no cached data is absent from
  the map (unknown — the card then shows no count, never "0 models").
- `source`: `'endpoint'` when the rows came from the endpoint's own `/models` (Task 3), else `'catalog'`.
- Only providers of types `openrouter`, `anthropic`, `openai`, `google`, `openai-compatible` get a
  count. ChatGPT and the local engine have their own cards and are skipped.
- Handler stays never-failing: if `cachedCounts` throws, return the plain list.

Move the catalog read into a small exported helper in `provider.ts` so it is testable without the
channel table:

```ts
/** The Providers screen's list: each row plus how many models it brings, from CACHED catalog data only.
 *  WHY not in ProviderRegistry.list(): that has 14 callers, including every session start, and a
 *  catalog read there would put network fetches in front of all of them. Never throws. */
export async function providerListWithCounts(rt: Pick<NativeRuntime, 'providerRegistry' | 'modelCatalog'>) {
  const list = await rt.providerRegistry.list();
  try {
    const counts = await rt.modelCatalog.cachedCounts(list);
    return list.map((p) => { const c = counts.get(p.id); return c ? { ...p, models: c } : p; });
  } catch { return list; }
}
```

and the entry: `handler: (_p, ctx) => ctx.runtime ? providerListWithCounts(ctx.runtime) : []`.
(Import `type NativeRuntime` from `'../create-runtime'` as a type only.)

- [ ] **Step 1: Write the failing test** — `tests/provider-list-models.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { providerListWithCounts } from '../src/main/ipc/provider';

const row = (id: string, type: string) => ({ id, type, label: id, enabled: true, builtIn: false, hasKey: true, ready: true });

describe('the Providers screen list carries model counts from cached data', () => {
  it('adds a count where the catalog has one and leaves the rest unknown', async () => {
    const rt = {
      providerRegistry: { list: async () => [row('a', 'openai'), row('b', 'openai-compatible')] },
      modelCatalog: { cachedCounts: vi.fn(async () => new Map([['a', { count: 17, source: 'catalog' as const }]])) },
    };
    const out = await providerListWithCounts(rt as any);
    expect(out[0]).toMatchObject({ id: 'a', models: { count: 17, source: 'catalog' } });
    expect(out[1].models).toBeUndefined();
  });
  it('a failing count read still returns the list', async () => {
    const rt = {
      providerRegistry: { list: async () => [row('a', 'openai')] },
      modelCatalog: { cachedCounts: async () => { throw new Error('boom'); } },
    };
    expect(await providerListWithCounts(rt as any)).toEqual([row('a', 'openai')]);
  });
});
```

And to `tests/model-catalog.test.ts`:

```ts
describe('cachedCounts never fetches', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-counts-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  it('counts from what is already cached, and fetches nothing', async () => {
    const f = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('openrouter')
      ? { data: [{ id: 'x' }, { id: 'y' }] } : { anthropic: { models: { c: { name: 'C' } } } } }));
    const cat = new ModelCatalog(dir, f as any);
    const providers = [
      { id: 'openrouter', type: 'openrouter', label: 'OR', enabled: true, builtIn: true, hasKey: true, ready: true },
      { id: 'an', type: 'anthropic', label: 'A', enabled: true, builtIn: false, hasKey: true, ready: true },
    ] as any;
    await cat.get(providers);
    f.mockClear();
    const counts = await cat.cachedCounts(providers);
    expect(counts.get('openrouter')).toEqual({ count: 2, source: 'catalog' });
    expect(counts.get('an')).toEqual({ count: 1, source: 'catalog' });
    expect(f).not.toHaveBeenCalled();
  });
  it('with nothing cached, every provider is unknown', async () => {
    const f = vi.fn();
    const counts = await new ModelCatalog(dir, f as any).cachedCounts([{ id: 'an', type: 'anthropic', label: 'A', enabled: true, builtIn: false, hasKey: true, ready: true }] as any);
    expect(counts.size).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** run both files — FAIL.
- [ ] **Step 3: Implement** `cachedCounts` in `model-catalog.ts`:

```ts
  /** How many models each provider brings, from data ALREADY in hand — no fetch, no ask. For the
   *  Providers screen's cards only (ipc/provider.ts providerListWithCounts). A provider with nothing
   *  cached is left out, so the card shows no number rather than "0 models". */
  async cachedCounts(providers: ProviderStatus[]): Promise<Map<string, { count: number; source: 'catalog' | 'endpoint' }>> {
    const out = new Map<string, { count: number; source: 'catalog' | 'endpoint' }>();
    const cache = this.memo ?? this.readCache();
    for (const p of providers) {
      if (!p.enabled) continue;
      let rows: CatalogModel[] = [];
      let source: 'catalog' | 'endpoint' = 'catalog';
      if (p.type === 'openrouter' && cache) rows = this.openrouterModels(cache.openrouter, p.id);
      else if (MODELSDEV_KEY[p.type] && cache) rows = this.modelsdevModels(cache.modelsdev, MODELSDEV_KEY[p.type], p.id);
      else if (p.type === 'openai-compatible') {
        const key = cache ? this.modelsdevKeyForAddress(cache.modelsdev, p.baseUrl) : null;
        if (key) rows = this.modelsdevModels(cache!.modelsdev, key, p.id);
        else {
          const base = p.baseUrl ? normalizeEndpoint(p.baseUrl) : null;
          // Any cached list for this provider and address, whichever key fingerprint it was asked with
          // — a count is not a secret, and the newest one is the best guess.
          const hit = base ? [...this.endpointCache.entries()].filter(([k]) => k.startsWith(`${p.id}\0${base}\0`))
            .sort((a, b) => b[1].at - a[1].at)[0]?.[1] : undefined;
          if (hit) { rows = hit.rows; source = 'endpoint'; }
        }
      }
      if (rows.length > 0) out.set(p.id, { count: rows.length, source });
    }
    return out;
  }
```

  Then add `providerListWithCounts` to `src/main/ipc/provider.ts` and point the `PROVIDER_LIST` entry
  at it, as shown above.
- [ ] **Step 4:** `npx vitest run tests/provider-list-models.test.ts tests/model-catalog.test.ts tests/ipc-channels.test.ts tests/main-blocking-calls.test.ts` — PASS. If `main-blocking-calls` flags `cachedCounts` (it calls `readCache`, which is already allowlisted by its own name), it will not — `readFileSync` stays inside `readCache`.
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/providers/model-catalog.ts src/main/ipc/provider.ts tests/provider-list-models.test.ts tests/model-catalog.test.ts
git commit -m "feat(providers): model counts on provider cards, from cached catalog data only

Submitted via YouCoded Assistant"
```

---

### Task 7: Unknown context window — 250,000 in the cloud, 32,768 on this computer

> ⚠ **See review corrections C-5, C-6, C-7** at the top of this plan — they override this task's text where they differ.

**Why (approved, custom-providers-questions#Q-2 + chat 2026-10-20):** when no source knows a model's
window, the harness assumes 32,768 everywhere (`compaction.ts` `planContextBudget` and `contextBudget`,
`harness-session.ts` `compactionConfig`). A cloud model is almost never that small, so long chats were
summarised ~30× too early. A server on this computer (Ollama, LM Studio) often IS that small, so it
keeps 32,768.

**Design — keep "unknown" as `null` everywhere it is stored.** Do NOT write 250,000 into
`opts.contextLength`: that value is shown in the context popup ("Unknown" today) and feeds
`fitForWindow`, which deliberately treats `null` as "don't block on a guess". Only the *budget math*
uses the assumption.

**Files:**
- Modify: `src/main/harness/compaction.ts` (`ContextBudgetInput.assumedWindow`, `contextBudget` option)
- Modify: `src/main/harness/capability-profile.ts` (`DiscoveredModel.onThisComputer`, profile field `assumedContextWindow`)
- Modify: `src/main/harness/harness-session.ts` (pass the profile's assumption into every budget call)
- Modify: `src/main/harness/native-session-host.ts` (fill `onThisComputer`)
- Modify: `src/main/create-runtime.ts` (a closure that says whether a binding's address is on this computer)
- Test: `tests/compaction-budget.test.ts`, `tests/capability-profile.test.ts`

**Produces:**
- `UNKNOWN_CLOUD_WINDOW = 250_000`, `UNKNOWN_LOCAL_WINDOW = 32_768` exported from `compaction.ts`.
- `ContextBudgetInput.assumedWindow?: number` and `contextBudget({ contextLength, maxTokens, assumedWindow? })`.
- `CapabilityProfile.assumedContextWindow: number`.
- `DiscoveredModel.onThisComputer?: boolean`.

**Rules to implement exactly:**
- `resolveProfile`: `assumedContextWindow` = `UNKNOWN_LOCAL_WINDOW` when `providerType === 'local-engine'`
  or (`providerType === 'openai-compatible'` and `onThisComputer === true`); otherwise
  `UNKNOWN_CLOUD_WINDOW`. It is a provider-type fact like `announcePrefill`: spread it onto **every**
  return in `resolveProfile`, after any registry overlay, so a known-model entry can never override it.
  `CLOUD_DEFAULT.assumedContextWindow = UNKNOWN_CLOUD_WINDOW`.
- `planContextBudget`: `const assumedWindow = input.contextLength ?? input.assumedWindow ?? UNKNOWN_LOCAL_WINDOW;`
  (the old literal 32_768 becomes the named constant; the default stays 32,768 so every existing caller
  and test is unchanged). Update its WHY comment.
- `contextBudget`: same — `const ctx = o.contextLength ?? o.assumedWindow ?? UNKNOWN_LOCAL_WINDOW;`. The
  `replyReserve` rule for an unknown window (`o.contextLength == null ? o.maxTokens : …`) is unchanged.
- `harness-session.ts`: every call to `planContextBudget(...)` and `contextBudget(...)` in this file
  passes `assumedWindow: this.profile.assumedContextWindow`. There are seven call sites today
  (`rg -n "planContextBudget\(|contextBudget\(" src/main/harness/harness-session.ts`); `compactionConfig`'s
  `this.opts.contextLength ?? 32_768` becomes `?? this.profile.assumedContextWindow`. `fitForWindow` keeps
  its `contextLength == null → 'fits'` early return.
- `native-session-host.ts`: the constructor gains no new parameter. Instead, extend the existing
  `providerTypeFor` closure's job: add a new optional constructor dependency at the END of the parameter
  list is risky (positional, 10+ params). Use this instead: in `create-runtime.ts`, change the
  `providerTypeFor` closure to return the type as today, and add a separate field on the host via a
  setter called right after construction: `nativeHost.setOnThisComputer(async (binding) => …)`. In the
  host: `private onThisComputerFor: (b: ModelBinding) => Promise<boolean> = async () => false;` plus
  `setOnThisComputer(fn) { this.onThisComputerFor = fn; }`, and in `resolveContextAndProfile` pass
  `onThisComputer: type === 'openai-compatible' ? await this.onThisComputerFor(binding) : undefined`
  into `resolveProfile`.
- `create-runtime.ts` closure: find the provider for `binding.providerId` in `providerRegistry.list()`;
  return `p?.type === 'openai-compatible' && !!p.baseUrl && isLocalEndpoint(p.baseUrl)` (import
  `isLocalEndpoint` from `'../shared/provider-types'`). Never throws (wrap in try/catch → false).

- [ ] **Step 1: Write the failing tests.**

`tests/compaction-budget.test.ts` (append):

```ts
import { UNKNOWN_CLOUD_WINDOW, UNKNOWN_LOCAL_WINDOW } from '../src/main/harness/compaction';

describe('an unknown window uses the assumption it is given', () => {
  const base = { contextLength: null, fixedCost: 2_000, summaryOverhead: 200, maxTokens: 4_096 };
  it('defaults to the local assumption, as before', () => {
    expect(planContextBudget(base).contextLength).toBe(UNKNOWN_LOCAL_WINDOW);
    expect(contextBudget({ contextLength: null, maxTokens: 4_096 }).trimBudget).toBe(UNKNOWN_LOCAL_WINDOW - 4_096 - 1024);
  });
  it('a cloud assumption plans a 250k window and still reports it as estimated', () => {
    const plan = planContextBudget({ ...base, assumedWindow: UNKNOWN_CLOUD_WINDOW });
    expect(plan.contextLength).toBe(250_000);
    expect(plan.estimatedWindow).toBe(true);
    expect(contextBudget({ contextLength: null, maxTokens: 4_096, assumedWindow: UNKNOWN_CLOUD_WINDOW }).trimBudget).toBe(250_000 - 4_096 - 1024);
  });
  it('a known window always wins over the assumption', () => {
    expect(planContextBudget({ ...base, contextLength: 128_000, assumedWindow: UNKNOWN_CLOUD_WINDOW }).contextLength).toBe(128_000);
  });
});
```

(Make sure `planContextBudget` and `contextBudget` are imported at the top of the file; add them to the
existing import if missing.)

Profile test file (append):

```ts
describe('the assumed window for an unknown model', () => {
  const d = (providerType: any, onThisComputer?: boolean) => ({ providerType, modelId: 'm', contextLength: null, onThisComputer });
  it('is 250k for cloud providers, including a custom endpoint elsewhere', () => {
    for (const t of ['openrouter', 'anthropic', 'openai', 'google', 'chatgpt', 'openai-compatible'] as const) {
      expect(resolveProfile(d(t, false)).assumedContextWindow, t).toBe(250_000);
    }
  });
  it('is 32k for the local engine and for a custom endpoint on this computer', () => {
    expect(resolveProfile(d('local-engine')).assumedContextWindow).toBe(32_768);
    expect(resolveProfile(d('openai-compatible', true)).assumedContextWindow).toBe(32_768);
  });
});
```

A harness-level pin — add to `tests/harness-compaction.test.ts` (it already builds `HarnessSession`s;
copy its existing helper for making one):

```ts
  it('an unknown cloud window does not compact a 40k conversation; an unknown local one does', async () => {
    // Build two sessions with contextLength: null, one with a profile whose assumedContextWindow is
    // 250_000 and one with 32_768 (spread CLOUD_DEFAULT and override the field). Seed ~40k tokens of
    // history (e.g. 'x'.repeat(160_000) as one user message), send a short message, and assert the
    // cloud session made ONE model call (no summary) while the local one made a summary call first.
  });
```

Write that test fully using the file's own helpers (`makeOpts`, the mock model pattern already there —
read the top 80 lines of the file first). It must fail before step 3 (both sessions compact at 32k).

- [ ] **Step 2:** run the three test files — new tests FAIL.
- [ ] **Step 3:** implement per the rules above.
- [ ] **Step 4:** `npx vitest run tests/compaction-budget.test.ts tests/compaction.test.ts tests/harness-compaction.test.ts tests/capability-profile.test.ts tests/native-session-host.test.ts tests/harness-session-loop.test.ts` — PASS. If an existing test asserted a profile with `toEqual(CLOUD_DEFAULT …)`, it may need `assumedContextWindow` added to its expectation — that is the only acceptable kind of change to an existing test here.
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/harness/compaction.ts src/main/harness/capability-profile.ts src/main/harness/harness-session.ts src/main/harness/native-session-host.ts src/main/create-runtime.ts tests/compaction-budget.test.ts tests/harness-compaction.test.ts tests/capability-profile.test.ts
git commit -m "feat(harness): unknown context windows assume 250k in the cloud, 32k on this computer

Submitted via YouCoded Assistant"
```

---

### Task 8: A custom endpoint that runs out of room recovers once

> ⚠ **See review corrections C-12** at the top of this plan — they override this task's text where they differ.

**Why:** with a 250k guess, a smaller cloud model may refuse a long request. The harness already
recovers from a recognised "context too long" error with one summary and a retry
(`harness-session.ts`, the `isContextOverflow(err, this.binding.providerId)` branch) — but
`context-overflow.ts` only recognises OpenRouter, the local engine, ChatGPT and an Anthropic key. A custom
endpoint's provider id is random, so it never matches.

**Files:**
- Modify: `src/main/harness/capability-profile.ts` (profile carries `providerType`)
- Modify: `src/main/providers/context-overflow.ts`
- Modify: `src/main/harness/harness-session.ts` (pass the type)
- Test: `tests/harness-session-loop.test.ts` (extend the existing `it.each` table)

**Produces:** `CapabilityProfile.providerType?: ProfileProviderType`; `isContextOverflow(error, providerId, providerType?)`.

**Rules to implement exactly:**
- `resolveProfile` spreads `providerType: d.providerType` onto every return (same place as
  `assumedContextWindow`). Optional on the interface so hand-built test profiles still compile.
- In `isContextOverflow`, after the existing checks and before the final `return false`:

```ts
  // A custom endpoint (OpenAI-compatible, user-chosen id): the standard OpenAI envelope only — a 400
  // whose body is { error: { code: 'context_length_exceeded' } }. WHY gated on the TYPE: the id is
  // random; WHY the exact code: this branch must never turn another 400 into a summary.
  if (providerType === 'openai-compatible') return (e.statusCode ?? e.status) === 400 && body.error?.code === 'context_length_exceeded';
```

- `harness-session.ts`: change the call to
  `isContextOverflow(err, this.binding.providerId, this.profile.providerType)`.
- 401/402/403/429 stay excluded (the function's first lines already do that).

- [ ] **Step 1: Write the failing test** — in `tests/harness-session-loop.test.ts`, extend the table so it
  passes a third argument. Change the `it.each` rows to `[provider, body, expected, type?]` and add:

```ts
    ['01HRANDOMID', { error: { code: 'context_length_exceeded', message: 'too long' } }, true, 'openai-compatible'],
    ['01HRANDOMID', { error: { code: 'invalid_request_error' } }, false, 'openai-compatible'],
    ['01HRANDOMID', { error: { code: 'context_length_exceeded' } }, false, undefined],
```

  and the body to `isContextOverflow({ statusCode: 400, … }, provider, type)` (and the 401 line the same).
  Existing rows get `undefined` as their 4th value implicitly.
- [ ] **Step 2:** run `npx vitest run tests/harness-session-loop.test.ts -t "classifies structured overflow"` — the first new row FAILS.
- [ ] **Step 3:** implement per the rules.
- [ ] **Step 4:** `npx vitest run tests/harness-session-loop.test.ts tests/capability-profile.test.ts` — PASS.
- [ ] **Step 5:** `npm run typecheck`, then commit:

```bash
git add src/main/providers/context-overflow.ts src/main/harness/capability-profile.ts src/main/harness/harness-session.ts tests/harness-session-loop.test.ts
git commit -m "feat(harness): recover from a custom endpoint's context-too-long error

Submitted via YouCoded Assistant"
```

---

### Task 9: Two channels — `provider:services` and `provider:refresh-catalog`

> ⚠ **See review corrections C-8, C-13** at the top of this plan — they override this task's text where they differ.

**Why:** the renderer already calls `window.claude.providers.services()` and `.refreshCatalog()`
(through the stand-in `PendingProviderCalls` type) and the workbench fakes them. This task serves them
for real on both doors (desktop window and phone socket).

> **STOP before Step 6 and ask Destin.** `tests/fixtures/phone-open-channels.json` says any change to
> what a phone may call is his decision. Recommendation to put to him: **open both** — they are reads (a
> public list, and a re-download of public model lists) and return no secrets. If he says no: mark both
> entries `remoteAllowed: false` and skip the fixture edit. A phone would then still SEE the button (the
> method exists on the shim; the host refuses it) and get the error box, so the button must also be
> hidden on a phone — ask him how; do not invent a new capability flag without his say.

**Files:**
- Modify: `src/shared/backend-contract.ts` (two `IPC` names; the two methods on `providers`)
- Modify: `src/shared/models-channel-types.ts` (two rows)
- Modify: `src/main/ipc/provider.ts` (two entries)
- Modify: `src/main/preload.ts` (two bridge methods; the channel-name block is regenerated)
- Modify: `src/renderer/remote-shim.ts` (two methods)
- Modify: `src/main/create-runtime.ts` (`refreshChatgpt` option for the catalog)
- Modify: `desktop/line-budgets.json` (raise exactly what the four at-limit files grew)
- Modify: `tests/ipc-channels.test.ts` (add both to the `native:*/provider:*` parity list)
- Modify: `tests/fixtures/phone-open-channels.json` (only if Destin approves)

**Produces (exact names):** `IPC.PROVIDER_SERVICES = 'provider:services'`,
`IPC.PROVIDER_REFRESH_CATALOG = 'provider:refresh-catalog'`; `providers.services()` and
`providers.refreshCatalog()` on `window.claude`.

- [ ] **Step 1: Write the failing test** — in `tests/ipc-channels.test.ts`, in
  `describe('native:*/provider:* channel parity')`, add `'provider:services', 'provider:refresh-catalog'`
  to `NEW_TYPES` and to `CHANNEL_TO_CONST`:
  `'provider:services': 'IPC.PROVIDER_SERVICES', 'provider:refresh-catalog': 'IPC.PROVIDER_REFRESH_CATALOG'`.
- [ ] **Step 2:** `npx vitest run tests/ipc-channels.test.ts -t "provider"` — FAIL.
- [ ] **Step 3: Contract.** In `backend-contract.ts`, after `PROVIDER_CATALOG: 'provider:catalog',` add:

```ts
  PROVIDER_SERVICES: 'provider:services',
  PROVIDER_REFRESH_CATALOG: 'provider:refresh-catalog',
```

  and in `Window['claude']['providers']` after `catalog: () => Promise<any[]>;` add:

```ts
    services: () => Promise<import('./provider-types').ServiceEntry[]>;
    refreshCatalog: () => Promise<{ added: number; failed: string[] }>;
```

  In `models-channel-types.ts`, after the `'provider:catalog'` row:

```ts
  'provider:services': { request: void; response: Answer<'modelCatalog', 'services'> };
  'provider:refresh-catalog': { request: void; response: Answer<'modelCatalog', 'refresh'> };
```

- [ ] **Step 4: Table entries** — `src/main/ipc/provider.ts`, after the `PROVIDER_CATALOG` entry:

```ts
  // The providers Add provider can search (models.dev, cached). Empty before the runtime exists.
  defineChannel({ name: IPC.PROVIDER_SERVICES, kind: 'handle', handler: (_p, ctx) => ctx.runtime ? ctx.runtime.modelCatalog.services() : [] }),
  // "Check for new models": re-download every model list now, skipping the daily cache.
  defineChannel({
    name: IPC.PROVIDER_REFRESH_CATALOG, kind: 'handle',
    handler: async (_p, ctx) => ctx.runtime
      ? ctx.runtime.modelCatalog.refresh(await ctx.runtime.providerRegistry.list())
      : { added: 0, failed: [] },
  }),
```

- [ ] **Step 5: Bridges.** `preload.ts`, inside `providers: { … }` after `catalog`:

```ts
    services: () => ipcRenderer.invoke(IPC.PROVIDER_SERVICES),
    refreshCatalog: () => ipcRenderer.invoke(IPC.PROVIDER_REFRESH_CATALOG),
```

  then run `node scripts/generate-preload-channels.mjs` (rewrites the generated name block).
  `remote-shim.ts`, inside `providers: { … }` after `catalog`:

```ts
      services: () => invoke('provider:services'),
      refreshCatalog: () => invoke('provider:refresh-catalog'),
```

  `create-runtime.ts`, in the `new ModelCatalog(...)` options next to `chatgptModels`:

```ts
    ...(chatgptForUi ? { refreshChatgpt: () => chatgptForUi.refreshModels() } : {}),
```

- [ ] **Step 6: (after Destin's answer)** if approved, add `"provider:refresh-catalog"` and
  `"provider:services"` to `tests/fixtures/phone-open-channels.json` → `open` (keep it sorted) and
  increase `total` by 2.
- [ ] **Step 7: Line budgets.** Run `npx vitest run tests/line-budgets.test.ts`. For each file it names
  (expected: `shared/backend-contract.ts`, `renderer/remote-shim.ts`, `main/preload.ts`), raise its number
  in `desktop/line-budgets.json` → `budgets` to the new `wc -l` and add a `notes` line:
  `"2026-10-21: +N for provider:services and provider:refresh-catalog (custom providers)."`
- [ ] **Step 8:** `npm run typecheck` (it also checks the generated block) and
  `npx vitest run tests/ipc-channels.test.ts tests/channel-table-complete.test.ts tests/channel-table-policy.test.ts tests/phone-open-set.test.ts tests/generate-preload-channels.test.ts tests/remote-channel-parity.test.ts tests/line-budgets.test.ts tests/mock-shim-window.test.ts`.
  `mock-shim-window` WILL fail now with "no MOCK_ONLY entry has since gained a real channel" — that is
  expected and Task 10 fixes it. Everything else must pass.
- [ ] **Step 9:** do not commit yet — Task 10 finishes this change so the tree is green at the commit.

---

### Task 10: Unhook the stand-ins in the renderer and the workbench

> ⚠ **See review corrections C-9** at the top of this plan — they override this task's text where they differ.

**Files:**
- Modify: `src/shared/provider-types.ts` (delete `PendingProviderCalls`)
- Modify: `src/renderer/components/ProvidersSection.tsx`, `src/renderer/components/model/ModelPicker.tsx`
- Modify: `src/renderer/dev/workbench/mock-only.ts` (delete the two rows and their comment)
- Modify: `src/renderer/dev/workbench/mock-shim.ts` (type the providers fake plainly)

- [ ] **Step 1:** delete the `PendingProviderCalls` interface and its comment from `provider-types.ts`.
- [ ] **Step 2:** in `ProvidersSection.tsx` and `ModelPicker.tsx`, delete the local
  `pendingProviderCalls()` helper and its import of `PendingProviderCalls`. Replace
  `pendingProviderCalls().services` with `window.claude.providers.services` and
  `pendingProviderCalls().refreshCatalog` with `window.claude.providers.refreshCatalog`. Keep the
  existing `typeof … === 'function'` / `if (!load) return;` guards — an older desktop a phone is paired to
  will not have them, and the guard is what hides the button there.
- [ ] **Step 3:** `mock-only.ts`: delete the two `providers.*` rows and the comment above them.
  `mock-shim.ts`: change `const providers: Ns<'providers'> & import('../../../shared/provider-types').PendingProviderCalls = {`
  to `const providers: Ns<'providers'> = {`. Keep the fakes themselves (the workbench still has no network).
- [ ] **Step 4:** `npm run typecheck`, then the Step 8 test list from Task 9 — all PASS now.
- [ ] **Step 5: Commit Tasks 9 + 10 together:**

```bash
git add src/shared/backend-contract.ts src/shared/models-channel-types.ts src/main/ipc/provider.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/create-runtime.ts line-budgets.json tests/ipc-channels.test.ts src/shared/provider-types.ts src/renderer/components/ProvidersSection.tsx src/renderer/components/model/ModelPicker.tsx src/renderer/dev/workbench/mock-only.ts src/renderer/dev/workbench/mock-shim.ts
# plus tests/fixtures/phone-open-channels.json only if Destin approved
git commit -m "feat(providers): serve provider:services and provider:refresh-catalog

Raises line budgets for the two channels: backend-contract.ts, remote-shim.ts, preload.ts.

Submitted via YouCoded Assistant"
```

---

### Task 11: Record the new upstream shapes, verify, and try it for real

**Files:**
- Modify: `youcoded/docs/provider-dependencies.md` (the models.dev entry, plus one new entry)
- Modify: `docs/active/specs/2026-10-20-custom-providers-and-catalog-refresh.md` (workspace repo — mark built)

- [ ] **Step 1: Docs.** In `youcoded/docs/provider-dependencies.md`, in the **models.dev `api.json` schema**
  entry, add after "Provider keys used: `anthropic`, `openai`, `google`.":

  > Custom endpoints also read each provider's top-level `npm` (only `'@ai-sdk/openai-compatible'` is
  > matched) and `api` (its published address, compared after `normalizeEndpoint` —
  > `src/shared/endpoint-address.ts`); two keys sharing an address resolve to the one with more models,
  > then the lower key name. The same fields build the Add provider service list (`ModelCatalog.services`,
  > addresses on this computer excluded, at most 50 models per service sent to the screen).

  And a new entry right after the OpenRouter one:

  > - **A custom endpoint's own `GET <base>/models`** — asked by `ModelCatalog.endpointModels` only when
  >   models.dev has no provider at that address. Accepts `{ data: [...] }` or a bare array; per row reads
  >   `id` (required), and when present `name`, `context_length`, `pricing.prompt`/`completion`
  >   (OpenRouter's per-token strings) and `supported_parameters`. Sent with `Authorization: Bearer <key>`
  >   only when a key is saved; 8 s timeout; cached in memory per provider + address + key fingerprint
  >   for 24 h; a failure keeps the previous list. Verified 2026-10-20: Inception answers with
  >   OpenRouter-shaped rows without a key; Ollama cloud answers ids only. (model-catalog)

- [ ] **Step 2: Full check.** From the workspace root:
  `bash scripts/verify.sh youcoded`. Every line must read PASS. A failing test is fixed now, whether or not
  this branch caused it (workspace rule) — read `.claude/rules/test-suite-hygiene.md` before calling
  anything "flaky".

- [ ] **Step 3: Pictures still match the approved screens.**
  `node scripts/shoot/shoot.mjs 'settings/assistant/cloud' 'settings/assistant/cloud/add-provider*' 'chat/model-picker#*' --themes light`
  — every picture taken. Compare by eye with the approved round-3 deck (its screenshot runs were removed 2026-10-21 to save 47 MB; reshoot `--before` master to compare);
  nothing should have moved (this plan changes no UI).

- [ ] **Step 4: Real run in a dev copy (never the user's app).** From the workspace root:
  `bash scripts/run-dev.sh youcoded --label "Custom providers"`. In the dev window:
  1. Settings → Assistant settings → Cloud providers → Add provider. Type "incep": "Inception
     (api.inceptionlabs.ai)" is listed (from the real models.dev list). Pick it; "4 supported models"
     shows Mercury 3 at 1M context.
  2. Paste an obviously wrong key (e.g. `sk-test-wrong`) → Add provider. The card shows the red
     "rejected" notice. Close and reopen Settings: it is still red (Task 5).
  3. Add a custom endpoint with "Other address…" = `https://api.inceptionlabs.ai/v1/` and no key: its
     card shows a model count (matched by address, Task 2).
  4. Open a chat on an assistant (native) session → model menu → search `zzzz-not-a-model` → "Check for
     new models": the button shows "Checking…", then "The model list is up to date. Nothing matches …".
  5. Close the dev window. Record what you saw (pass/fail per numbered step) in the commit message of
     Step 6. Steps that need a paid key (actually chatting with Mercury) are out of scope — say so.

- [ ] **Step 5:** in the workspace spec, change `status: draft` to `status: active` and add a line under
  the title: `Built on session/custom-providers-catalog (plan docs/active/plans/2026-10-21-custom-providers-backend.md).`

- [ ] **Step 6: Commit** (app repo, then workspace repo):

```bash
# from youcoded/
git add docs/provider-dependencies.md
git commit -m "docs(providers): record the models.dev address fields and custom endpoint /models

Dev-copy check: <one line per step 4.1–4.4, pass/fail>.

Submitted via YouCoded Assistant"
# from the workspace root (worktrees/sessions/custom-providers-catalog)
git add docs/active/specs/2026-10-20-custom-providers-and-catalog-refresh.md docs/active/plans/2026-10-21-custom-providers-backend.md
git commit -m "docs: custom providers spec marked built; implementation plan

Submitted via YouCoded Assistant"
```

Do NOT merge or push — Destin decides when this ships.

---

## Self-review notes (for the implementer)

- **Order matters:** 0 → 1 → 2 → 3 → 4 → 6 build on each other in `model-catalog.ts`; 5, 7, 8 are
  independent of the catalog and of each other; 9 + 10 need 4 (`services`, `refresh`) and ship together;
  11 is last. If several implementers work in parallel, only 5 / 7 / 8 can run alongside the catalog chain,
  and each must merge cleanly with `create-runtime.ts` edits from Tasks 3, 7 and 9 (all small, different
  lines).
- **Never-guess:** no count, price, window or verdict is ever written as 0 / "Connected" / 250k into
  stored data. The 250k is only ever a budget assumption (Task 7).
- **No new blocking calls in the main process**; no edits to `main-blocking-calls.allowlist.json`.
- **No UI changes.** If something on screen looks wrong after a task, stop and ask — the screens were
  approved through three review rounds.
