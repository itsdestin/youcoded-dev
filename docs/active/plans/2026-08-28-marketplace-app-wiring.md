---
status: active
created: 2026-08-28
spec: docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
part: 3 of 3 (app wiring) — needs 2026-08-28-marketplace-catalog-service.md deployed first; 2026-08-28-marketplace-feedback-worker.md is independent
---

# Marketplace App Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The approved marketplace UI runs on real data — desktop and Android read the Worker's `/catalog` (with the static `index.json` as the fallback), installs pin to the catalog's upstream commit, installing a member installs its bundle, and the mockup branch merges.

**Architecture:** `skill-provider.ts` (desktop main) and `MarketplaceFetcher.kt` (Android) gain a catalog fetch in front of the existing `index.json` fetch, same on-disk cache envelope, 1-hour TTL, three-step fallback (Worker → raw GitHub → stale cache). `plugin-installer.ts` / `PluginInstaller.kt` accept `sourceCommit` and check it out after the shallow clone. The renderer needs no change: it already renders `entry.catalog`. The workbench keeps its fixture catalog (it never talks to the network).

**Tech Stack:** Electron main (Node 22, `fetch`, `child_process` git), Kotlin (`java.net.URL`, ProcessBuilder git), React renderer (unchanged), vitest, Gradle unit tests.

## Global Constraints

- Catalog contract (produced by Plan 2, consumed here — the two plans must agree): `GET https://wecoded-marketplace-api.destinj101.workers.dev/catalog` → `200 { generated_at: number, entries: SkillEntry[] }` where every entry has the `index.json` fields **plus** `catalog: CatalogMeta` (`desktop/src/shared/catalog-types.ts`), members carry `catalog.partOf`, deprecated rows are omitted. `Cache-Control: public, max-age=300`. Any origin allowed.
- Desktop cache dir stays `~/.claude/youcoded-marketplace-cache/` (five code sites name it; the docs are wrong — `docs/registries.md:12` — fix that line in Task 6, not the code).
- **Conflict warning:** `desktop/src/main/skill-provider.ts` and `plugin-installer.ts` are also edited on the in-flight branch `fix/bundled-plugin-upgrade` (worktree `worktrees/bundled-upgrade`). Merge that branch to master **before** starting Task 1, then rebase `feat/marketplace-overhaul-ui` onto master (`git rebase master` in `worktrees/marketplace-ui`) and re-run `bash scripts/verify.sh marketplace-ui`. Do not start this plan while both branches are unmerged.
- Every desktop change: `bash scripts/verify.sh marketplace-ui` from the workspace root before "done". Android: `cd worktrees/marketplace-ui && ./gradlew test -x bundleWebUi` (the `-x` is mandatory in a hardlinked worktree — see CLAUDE.md).
- Never guess in error strings: git failures surface `output.slice(0, 200)` verbatim, as the installer already does.
- App work is on `youcoded` branch `feat/marketplace-overhaul-ui`, worktree `/home/destin/youcoded-dev/worktrees/marketplace-ui`.

---

## File structure

- Modify `desktop/src/main/skill-provider.ts` — `fetchIndex()` tries the catalog first; `install()` resolves members to bundles and passes `sourceCommit`.
- Modify `desktop/src/main/plugin-installer.ts` — `MarketplaceEntry.sourceCommit?`, `pinToCommit()` after clone in `installFromUrl` / `installFromGitSubdir`.
- Create `desktop/tests/skill-provider-catalog.test.ts`, `desktop/tests/plugin-installer-pin.test.ts`.
- Modify `app/src/main/kotlin/com/youcoded/app/skills/MarketplaceFetcher.kt` — `fetchIndex()` catalog-first.
- Modify `app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt` — pin after clone; `app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt` — member → bundle, pass the commit.
- Create `app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt`.
- Modify `desktop/src/renderer/dev/workbench/fixtures/marketplace/catalog.ts` header comment only (it now mirrors a real contract).
- Modify `docs/registries.md`, `.claude/rules/registries.md` (workspace) — the catalog is the source; `index.json` is the fallback.

---

### Task 1: Desktop — `fetchIndex()` reads the catalog first

**Files:**
- Modify: `desktop/src/main/skill-provider.ts` (constants lines 45–56; `fetchIndex` lines 654–670; `invalidateCache` lines 607–611)
- Test: `desktop/tests/skill-provider-catalog.test.ts`

**Interfaces:**
- Consumes: `MARKETPLACE_API_HOST` from `desktop/src/renderer/state/marketplace-api-client.ts` (main already imports from that module in `marketplace-api-handlers.ts:9`).
- Produces: `LocalSkillProvider.fetchIndex(): Promise<SkillEntry[]>` unchanged signature; entries now carry `catalog` when the Worker answered. Env override `YOUCODED_CATALOG_URL` (tests) — empty string disables the catalog step.

- [ ] **Step 1: Find how existing provider tests build a provider and stub fetch**

Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui/desktop && rg -n "new LocalSkillProvider|globalThis.fetch|vi.stubGlobal\('fetch'" tests | head`
Use the constructor call you find (it needs a config store and paths — copy the arrange block from the test that has it) in the test below; the fetch stub pattern is `globalThis.fetch = vi.fn(...)` as in `tests/review-list.test.tsx` history.

- [ ] **Step 2: Write the failing test**

Create `desktop/tests/skill-provider-catalog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The provider writes its cache under ~/.claude — point HOME at a scratch dir
// so the test never touches the real cache.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-catalog-'));
vi.stubEnv('HOME', home);
vi.stubEnv('USERPROFILE', home);
vi.stubEnv('YOUCODED_CATALOG_URL', 'https://catalog.test/catalog');

import { LocalSkillProvider } from '../src/main/skill-provider';

const CATALOG_ROW = {
  id: 'superpowers', type: 'plugin', displayName: 'Superpowers', description: 'x', category: 'development',
  author: 'Anthropic', tags: [], version: '1.0.1', publishedAt: '2026-01-01T00:00:00Z',
  sourceMarketplace: 'anthropic', sourceType: 'url', sourceRef: 'https://github.com/obra/superpowers.git',
  catalog: { itemType: 'plugin', origin: { tier: 'verified' }, scan: { status: 'checked' }, capabilities: [], sourceCommit: 'e91a6c0' },
};
const INDEX_ROW = { ...CATALOG_ROW, catalog: undefined };

function makeProvider() {
  // Copy the constructor arrange block from the existing provider test found in Step 1.
  return new LocalSkillProvider(/* … */);
}

// Module-scope so the second describe (Task 3) can reuse it.
let fetchMock: ReturnType<typeof vi.fn>;

describe('fetchIndex — catalog first, index.json fallback', () => {
  beforeEach(() => {
    fs.rmSync(path.join(home, '.claude', 'youcoded-marketplace-cache'), { recursive: true, force: true });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns catalog rows (with the catalog block) when the Worker answers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200 }));
    const entries = await makeProvider().listMarketplace();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://catalog.test/catalog');
    expect(entries[0].catalog?.sourceCommit).toBe('e91a6c0');
  });

  it('falls back to raw index.json when the Worker fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([INDEX_ROW]), { status: 200 }));
    const entries = await makeProvider().listMarketplace();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/raw\.githubusercontent\.com.*\/index\.json$/);
    expect(entries[0].id).toBe('superpowers');
    expect(entries[0].catalog).toBeUndefined();
  });

  it('serves the catalog from cache within the TTL', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200 }));
    const p = makeProvider();
    await p.listMarketplace();
    await p.listMarketplace();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a stale catalog cache when both network paths fail', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW] }), { status: 200 }));
    const p = makeProvider();
    await p.listMarketplace();
    // Age the cache past the TTL, then make every fetch fail.
    const file = path.join(home, '.claude', 'youcoded-marketplace-cache', 'catalog.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...raw, fetchedAt: 0 }));
    fetchMock.mockRejectedValue(new Error('offline'));
    const entries = await p.listMarketplace();
    expect(entries[0].id).toBe('superpowers');
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/skill-provider-catalog.test.ts`
Expected: FAIL — first call goes to `raw.githubusercontent.com/...index.json`, not the catalog.

- [ ] **Step 4: Implement**

In `desktop/src/main/skill-provider.ts`, next to the other constants (after `INDEX_TTL`, line ~54):

```ts
import { MARKETPLACE_API_HOST } from '../renderer/state/marketplace-api-client';
// Marketplace overhaul (Plan 3): the Worker's catalog is the source of truth —
// it carries the type / origin / scan / capabilities block the UI renders and is
// refreshed hourly by CI. index.json on GitHub stays as the fallback so an
// outage (or an old Worker) degrades to today's behaviour, not to an empty grid.
// YOUCODED_CATALOG_URL: tests point it at a fake; "" disables the catalog step.
const CATALOG_URL = process.env.YOUCODED_CATALOG_URL ?? `${MARKETPLACE_API_HOST}/catalog`;
const CATALOG_CACHE = path.join(CACHE_DIR, 'catalog.json');
// 1h, not 24h: the Worker already caches 5 min and CI refreshes hourly, so a
// newly published plugin shows up within the hour instead of the next day.
const CATALOG_TTL = 60 * 60 * 1000;
```

Replace `fetchIndex()` (lines 654–670) with:

```ts
  private async fetchIndex(): Promise<SkillEntry[]> {
    // 1. Fresh catalog cache.
    const cachedCatalog = this.readCache<SkillEntry[]>(CATALOG_CACHE, CATALOG_TTL);
    if (cachedCatalog) return cachedCatalog;
    // 2. The Worker's catalog.
    if (CATALOG_URL) {
      try {
        const resp = await fetch(CATALOG_URL);
        if (resp.ok) {
          const body = await resp.json() as { entries?: SkillEntry[] };
          if (Array.isArray(body.entries)) {
            this.writeCache(CATALOG_CACHE, body.entries);
            return body.entries;
          }
        }
      } catch { /* fall through to index.json */ }
    }
    // 3. Raw index.json on GitHub (pre-overhaul path, unchanged).
    const cachedIndex = this.readCache<SkillEntry[]>(INDEX_CACHE, INDEX_TTL);
    if (cachedIndex) return cachedIndex;
    try {
      const resp = await fetch(`${REGISTRY_BASE}/index.json`);
      if (resp.ok) {
        const data = await resp.json() as SkillEntry[];
        this.writeCache(INDEX_CACHE, data);
        return data;
      }
    } catch { /* fall through to stale caches */ }
    // 4. Anything stale, newest source first.
    return this.readCache<SkillEntry[]>(CATALOG_CACHE, Infinity)
      ?? this.readCache<SkillEntry[]>(INDEX_CACHE, Infinity)
      ?? [];
  }
```

In `invalidateCache()` add `CATALOG_CACHE` to the file list:

```ts
    for (const file of [CATALOG_CACHE, INDEX_CACHE, DEFAULTS_CACHE, FEATURED_CACHE]) {
```

- [ ] **Step 5: Run to see it pass, then the gate**

Run: `npx vitest run tests/skill-provider-catalog.test.ts` → PASS (4).
Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK. (`knip` may flag the renderer import from main — `marketplace-api-handlers.ts` already does the same import, so it is allowed; if knip complains, it lists the exact rule.)

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/skill-provider.ts desktop/tests/skill-provider-catalog.test.ts
git commit -m "feat(marketplace): desktop reads the Worker catalog first, index.json as fallback"
```

---

### Task 2: Desktop — installs pin to `sourceCommit`

**Files:**
- Modify: `desktop/src/main/plugin-installer.ts` (`MarketplaceEntry` lines 85–104; `installFromUrl` 300–311; `installFromGitSubdir` 313–340; the switch 367–382)
- Modify: `desktop/src/main/skill-provider.ts` (the `installPlugin({...})` call, lines 232–244)
- Test: `desktop/tests/plugin-installer-pin.test.ts`

**Interfaces:**
- Produces: `MarketplaceEntry.sourceCommit?: string`; `pinToCommit(dir: string, commit: string): Promise<{ ok: boolean; output: string }>`; the provider passes `sourceCommit: entry.catalog?.sourceCommit ?? entry.sourceSha`.

- [ ] **Step 1: Find how installer tests stub git**

Run: `rg -n "runGit|child_process|spawn" tests/plugin-installer*.test.ts tests/*installer*.test.ts | head`
Copy that mocking arrangement (likely `vi.mock('child_process', …)` capturing argv) into the test below.

- [ ] **Step 2: Write the failing test**

Create `desktop/tests/plugin-installer-pin.test.ts` — arrange git mocking as found in Step 1, then:

```ts
import { describe, it, expect } from 'vitest';
import { pinToCommit } from '../src/main/plugin-installer';

describe('pinToCommit', () => {
  it('fetches the commit shallowly and checks it out, in that order', async () => {
    const calls: string[][] = [];
    // (use the git stub from Step 1 to push every argv into `calls` and succeed)
    const r = await pinToCommit('/tmp/x', 'e91a6c0');
    expect(r.ok).toBe(true);
    expect(calls).toEqual([
      ['-C', '/tmp/x', 'fetch', '--depth', '1', 'origin', 'e91a6c0'],
      ['-C', '/tmp/x', 'checkout', '--detach', 'e91a6c0'],
    ]);
  });

  it('returns git output verbatim when the fetch fails (no guessed cause)', async () => {
    // (make the stub fail the fetch with output "fatal: couldn't find remote ref")
    const r = await pinToCommit('/tmp/x', 'deadbeef');
    expect(r.ok).toBe(false);
    expect(r.output).toContain("couldn't find remote ref");
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/plugin-installer-pin.test.ts`
Expected: FAIL — `pinToCommit` is not exported.

- [ ] **Step 4: Implement**

`plugin-installer.ts` — add to `MarketplaceEntry`:

```ts
  // Marketplace overhaul (Plan 3): the exact upstream commit the catalog
  // listed — the checked files. Absent for local (our own repo) sources.
  sourceCommit?: string;
```

Add the helper next to `installFromUrl`:

```ts
// After a `--depth 1` clone HEAD is whatever the branch is today; the catalog
// listed (and scanned) a specific commit. GitHub serves any reachable sha to
// a shallow fetch, so fetch it and detach onto it. On failure the git output
// is returned untouched — an "unknown sha" and a network error read differently
// and the user must see which.
export async function pinToCommit(dir: string, commit: string): Promise<{ ok: boolean; output: string }> {
  const fetched = await runGit('-C', dir, 'fetch', '--depth', '1', 'origin', commit);
  if (!fetched.ok) return fetched;
  return runGit('-C', dir, 'checkout', '--detach', commit);
}
```

Change the two clone paths to take and use the commit:

```ts
async function installFromUrl(id: string, url: string, commit?: string): Promise<InstallResult> {
  if (!url.startsWith('https://')) {
    return { status: 'failed', error: 'Only HTTPS git URLs are supported' };
  }
  const targetDir = path.join(PLUGINS_DIR, id);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

  const { ok, output } = await runGit('clone', '--depth', '1', url, targetDir);
  if (!ok) return { status: 'failed', error: `git clone failed: ${output.slice(0, 200)}` };
  if (commit) {
    const pinned = await pinToCommit(targetDir, commit);
    if (!pinned.ok) return { status: 'failed', error: `could not check out the listed version ${commit}: ${pinned.output.slice(0, 200)}` };
  }
  return { status: 'installed' };
}
```

and in `installFromGitSubdir(id, repoUrl, subdir, commit?)`, right after the sparse clone succeeds and before `sparse-checkout set`:

```ts
    if (commit) {
      const pinned = await pinToCommit(tmpDir, commit);
      if (!pinned.ok) return { status: 'failed', error: `could not check out the listed version ${commit}: ${pinned.output.slice(0, 200)}` };
    }
```

In the switch:

```ts
      case 'url':
        result = await installFromUrl(id, sourceRef, entry.sourceCommit);
        break;
      case 'git-subdir':
        result = await installFromGitSubdir(id, sourceRef, entry.sourceSubdir || '', entry.sourceCommit);
        break;
```

`skill-provider.ts` — in the `installPlugin({ … })` call add:

```ts
      // Plan 3: pin to the commit the catalog checked; sourceSha is sync.js's
      // older name for the same fact on url/git-subdir entries.
      sourceCommit: marketplaceEntry.catalog?.sourceCommit ?? marketplaceEntry.sourceSha,
```

- [ ] **Step 5: Run to see it pass, then the gate; commit**

Run: `npx vitest run tests/plugin-installer-pin.test.ts` → PASS (2). `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/main/plugin-installer.ts desktop/src/main/skill-provider.ts desktop/tests/plugin-installer-pin.test.ts
git commit -m "feat(marketplace): installs check out the catalog's pinned commit"
```

---

### Task 3: Desktop — installing a member installs its bundle

**Files:**
- Modify: `desktop/src/main/skill-provider.ts` (the `install(id)` method — find with `rg -n "async install\(" src/main/skill-provider.ts`)
- Test: `desktop/tests/skill-provider-catalog.test.ts` (append)

**Interfaces:**
- Produces: `install('<bundle>/<name>')` behaves exactly like `install('<bundle>')` and returns its result.

- [ ] **Step 1: Write the failing test**

Append to `desktop/tests/skill-provider-catalog.test.ts`:

```ts
describe('install — a member row installs its bundle', () => {
  it('resolves catalog.partOf and installs the bundle id', async () => {
    const member = { ...CATALOG_ROW, id: 'superpowers/brainstorming', displayName: 'Brainstorming',
      catalog: { ...CATALOG_ROW.catalog, itemType: 'skill', partOf: { id: 'superpowers', displayName: 'Superpowers' } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ generated_at: 1, entries: [CATALOG_ROW, member] }), { status: 200 }));
    const p = makeProvider();
    const spy = vi.spyOn(p, 'install');
    await p.install('superpowers/brainstorming').catch(() => undefined);
    // Second call is the recursion onto the bundle.
    expect(spy).toHaveBeenNthCalledWith(2, 'superpowers');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/skill-provider-catalog.test.ts -t "member row"`
Expected: FAIL — `install` called once.

- [ ] **Step 3: Implement**

At the top of `install(id)` in `skill-provider.ts`, after the entry lookup:

```ts
    // Marketplace overhaul (spec §1.4): a skill/specialist/connection that lives
    // inside a bundle is installed by installing the bundle — per-item install
    // is a ROADMAP follow-up. The UI already shows a member as installed when
    // its bundle is.
    if (entry.catalog?.partOf) return this.install(entry.catalog.partOf.id);
```

- [ ] **Step 4: Pass, gate, commit**

Run: `npx vitest run tests/skill-provider-catalog.test.ts` → PASS. `bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/main/skill-provider.ts desktop/tests/skill-provider-catalog.test.ts
git commit -m "feat(marketplace): installing a bundle member installs the bundle"
```

---

### Task 4: Android — catalog first, pinned installs, member → bundle

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/MarketplaceFetcher.kt` (`fetchIndex()` lines 27–43; constants 14–21)
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt` (`installFromUrl` 265–272, `installFromGitSubdir` 274–…, the `when (sourceType)` at 115–124)
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt` (the install path — find with `rg -n "fun install" app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt`)
- Test: `app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt`

**Interfaces:**
- Produces: `MarketplaceFetcher.fetchIndex()` returns catalog rows (each a `JSONObject` with a `catalog` object) when the Worker answers; otherwise index.json; otherwise stale cache. `PluginInstaller` reads `entry.optJSONObject("catalog")?.optString("sourceCommit")` and pins.

- [ ] **Step 1: Write the failing unit test**

Create `app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt` (JVM unit test; the fetcher takes `homeDir` so the cache lands in a temp dir. To stub the network, add a constructor parameter `private val readUrl: (String) -> String = { URL(it).readText() }` to `MarketplaceFetcher` — Step 3 — and inject a fake here):

```kotlin
package com.youcoded.app.skills

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class MarketplaceFetcherCatalogTest {
    private fun home() = Files.createTempDirectory("yc-catalog").toFile()

    private val catalogBody = """{"generated_at":1,"entries":[{"id":"superpowers","type":"plugin","displayName":"Superpowers",
        "description":"x","category":"development","catalog":{"itemType":"plugin","origin":{"tier":"verified"},
        "scan":{"status":"checked"},"capabilities":[],"sourceCommit":"e91a6c0"}}]}"""
    private val indexBody = """[{"id":"superpowers","type":"plugin","displayName":"Superpowers","description":"x","category":"development"}]"""

    @Test
    fun `prefers the Worker catalog and keeps the catalog block`() {
        val hits = mutableListOf<String>()
        val f = MarketplaceFetcher(home(), readUrl = { url -> hits += url; if (url.endsWith("/catalog")) catalogBody else error("unexpected $url") })
        val arr = f.fetchIndex()
        assertEquals(1, hits.size)
        assertTrue(hits[0].endsWith("/catalog"))
        assertEquals("e91a6c0", arr.getJSONObject(0).getJSONObject("catalog").getString("sourceCommit"))
    }

    @Test
    fun `falls back to index json when the Worker fails`() {
        val hits = mutableListOf<String>()
        val f = MarketplaceFetcher(home(), readUrl = { url -> hits += url; if (url.endsWith("/catalog")) error("503") else indexBody })
        val arr = f.fetchIndex()
        assertEquals(2, hits.size)
        assertTrue(hits[1].endsWith("/index.json"))
        assertEquals("superpowers", arr.getJSONObject(0).getString("id"))
        assertTrue(arr.getJSONObject(0).optJSONObject("catalog") == null)
    }

    @Test
    fun `serves the catalog from cache within the TTL`() {
        var n = 0
        val h = home()
        val f = MarketplaceFetcher(h, readUrl = { n++; catalogBody })
        f.fetchIndex(); f.fetchIndex()
        assertEquals(1, n)
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui && ./gradlew test -x bundleWebUi --tests '*MarketplaceFetcherCatalogTest*'`
Expected: compilation FAIL — no `readUrl` parameter.

- [ ] **Step 3: Implement the fetcher**

`MarketplaceFetcher.kt` — constructor gains the injectable reader; constants gain the catalog URL:

```kotlin
class MarketplaceFetcher(
    private val homeDir: File,
    private val bundledIndexProvider: (() -> JSONArray)? = null,
    // Injectable for unit tests; production reads the URL directly.
    private val readUrl: (String) -> String = { URL(it).readText() },
) {
    private val cacheDir = File(homeDir, ".claude/youcoded-marketplace-cache")
    private val registryBase = "https://raw.githubusercontent.com/itsdestin/wecoded-marketplace/master"
    // Marketplace overhaul (Plan 3): the Worker's catalog carries the
    // type / origin / scan / capabilities block; index.json is the fallback.
    // Same host as MarketplaceApiClient — keep the two in sync.
    private val catalogUrl = "https://wecoded-marketplace-api.destinj101.workers.dev/catalog"
    private val statsTtl = 60 * 60 * 1000L       // 1 hour
    private val indexTtl = 24 * 60 * 60 * 1000L   // 24 hours
    private val catalogTtl = 60 * 60 * 1000L      // 1 hour — CI refreshes hourly
```

Replace `fetchIndex()`:

```kotlin
    fun fetchIndex(): JSONArray {
        val catalogFile = File(cacheDir, "catalog.json")
        val indexFile = File(cacheDir, "index.json")
        fun parseArray(s: String): JSONArray? = try { JSONArray(s) } catch (_: Exception) { null }

        // 1. Fresh catalog cache.
        readCache(catalogFile, catalogTtl)?.let { parseArray(it) }?.let { return it }
        // 2. The Worker's catalog: { generated_at, entries: [...] } — cache only the array.
        try {
            val entries = JSONObject(readUrl(catalogUrl)).getJSONArray("entries")
            writeCache(catalogFile, entries.toString())
            return entries
        } catch (e: Exception) {
            Log.w("MarketplaceFetcher", "Catalog fetch failed, trying index.json", e)
        }
        // 3. Raw index.json (pre-overhaul path).
        readCache(indexFile, indexTtl)?.let { parseArray(it) }?.let { return it }
        try {
            val data = readUrl("$registryBase/index.json")
            val arr = JSONArray(data)
            writeCache(indexFile, data)
            return arr
        } catch (e: Exception) {
            Log.w("MarketplaceFetcher", "Failed to fetch index", e)
        }
        // 4. Anything stale, newest source first, then the bundled copy.
        return readCache(catalogFile, Long.MAX_VALUE)?.let { parseArray(it) }
            ?: readCache(indexFile, Long.MAX_VALUE)?.let { parseArray(it) }
            ?: bundledIndexProvider?.invoke()
            ?: JSONArray()
    }
```

(`Log.w` in a JVM unit test: if `android.util.Log` is not stubbed in this module's test config, check `app/build.gradle.kts` for `unitTests.isReturnDefaultValues = true`; add it if absent — the existing fetcher tests, if any, already rely on it.)

- [ ] **Step 4: Run the fetcher test to see it pass**

Run: `./gradlew test -x bundleWebUi --tests '*MarketplaceFetcherCatalogTest*'` → BUILD SUCCESSFUL.

- [ ] **Step 5: Pin installs and route members (no new test — mirrors Task 2/3; Gradle's existing installer tests must stay green)**

`PluginInstaller.kt` — add next to `installFromUrl`:

```kotlin
    // After a --depth 1 clone HEAD is today's branch tip; the catalog listed a
    // specific commit. GitHub serves any reachable sha to a shallow fetch.
    private suspend fun pinToCommit(dir: File, commit: String): Boolean {
        if (!runGit("-C", dir.absolutePath, "fetch", "--depth", "1", "origin", commit)) return false
        return runGit("-C", dir.absolutePath, "checkout", "--detach", commit)
    }
```

Change the signatures and bodies:

```kotlin
    private suspend fun installFromUrl(id: String, url: String, commit: String?): InstallResult {
        val targetDir = File(pluginsDir, id)
        if (targetDir.exists()) targetDir.deleteRecursively()
        val ok = runGit("clone", "--depth", "1", url, targetDir.absolutePath)
        if (!ok) return InstallResult.Failed("git clone failed for $url")
        if (!commit.isNullOrEmpty() && !pinToCommit(targetDir, commit)) {
            return InstallResult.Failed("could not check out the listed version $commit")
        }
        return InstallResult.Success
    }
```

and in `installFromGitSubdir(id, repoUrl, subdir, commit: String?)`, after the sparse clone succeeds:

```kotlin
            if (!commit.isNullOrEmpty() && !pinToCommit(tmpDir, commit)) {
                return InstallResult.Failed("could not check out the listed version $commit")
            }
```

In the `when (sourceType)` block (lines 115–124), read the commit once above it and pass it:

```kotlin
            // Plan 3: the catalog's pinned commit; sourceSha is sync.js's older name.
            val commit = entry.optJSONObject("catalog")?.optString("sourceCommit", "")
                ?.ifEmpty { null } ?: entry.optString("sourceSha", "").ifEmpty { null }
            val result = when (sourceType) {
                "local" -> installFromLocal(id, sourceRef, sourceMarketplace)
                "url" -> installFromUrl(id, sourceRef, commit)
                "git-subdir" -> installFromGitSubdir(id, sourceRef, entry.optString("sourceSubdir"), commit)
                else -> InstallResult.Failed("Unknown source type: $sourceType")
            }
```

`LocalSkillProvider.kt` — at the top of its install function, after the entry lookup:

```kotlin
        // Marketplace overhaul (spec §1.4): a member of a bundle installs the bundle.
        entry.optJSONObject("catalog")?.optJSONObject("partOf")?.optString("id", "")
            ?.takeIf { it.isNotEmpty() }?.let { return install(it) }
```

(Match the real function name and return type you find; keep the recursion on the same entry point the WebView calls.)

- [ ] **Step 6: Run Android tests and commit**

Run: `./gradlew test -x bundleWebUi` → BUILD SUCCESSFUL.

```bash
git add app/src/main/kotlin/com/youcoded/app/skills/MarketplaceFetcher.kt app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt app/src/test/kotlin/com/youcoded/app/skills/MarketplaceFetcherCatalogTest.kt
git commit -m "feat(android): catalog-first index, pinned installs, member installs its bundle"
```

---

### Task 5: Workbench fixture note + docs

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/fixtures/marketplace/catalog.ts` (header comment, lines 1–9)
- Modify (workspace repo): `docs/registries.md` line 3 and line 12; `.claude/rules/registries.md`

- [ ] **Step 1: Update the fixture header**

Replace the header's "nothing in this file ships" paragraph with:

```ts
// Shapes mirror the Worker's GET /catalog contract (Plan 2) — `{ generated_at,
// entries }` where each entry is an index row plus `catalog`. The VALUES are
// still invented; the workbench never talks to the network.
```

- [ ] **Step 2: Fix the registry docs** (workspace repo `/home/destin/youcoded-dev`)

`docs/registries.md`: line 3 — replace the "No CI rebuild on either" sentence with "The app reads the Worker's `/catalog` (rebuilt hourly by `catalog-ingest.yml` in wecoded-marketplace) and falls back to `index.json` on GitHub; `index.json` is rebuilt by `validate-plugin-pr.yml` on plugin merges." Line 12 — the cache dir is `~/.claude/youcoded-marketplace-cache/` (five code sites; the doc said `wecoded-`). Apply the same two corrections to `.claude/rules/registries.md`.

- [ ] **Step 3: Commit (two repos)**

```bash
cd /home/destin/youcoded-dev/worktrees/marketplace-ui && git add desktop/src/renderer/dev/workbench/fixtures/marketplace/catalog.ts && git commit -m "docs(workbench): catalog fixture mirrors the /catalog contract"
cd /home/destin/youcoded-dev && git add docs/registries.md .claude/rules/registries.md && git commit -m "docs(registries): catalog is the source, index.json the fallback; correct cache dir" && git push origin master
```

---

### Task 6: Rows the installer cannot install — hide Install, show the source

Plan 2 emits rows with `sourceType: "mcp-registry"` (Connections from the MCP Registry / Docker — installed through the MCP settings, not as a plugin) and `sourceType: "file"` (a single markdown file: awesome-copilot agents/instructions). Today's installer answers both with `Unknown source type`, and the UI would show a green Install that fails. Prompt rows (`type: "prompt"` with inline `prompt` text, from awesome-cursorrules) already install through the provider's prompt path.

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx` (the Install/Uninstall block in `SkillBody`'s header)
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` (the `corner` element)
- Test: `desktop/tests/marketplace-not-installable.test.tsx`

**Interfaces:**
- Produces: `isInstallableSource(entry: SkillEntry): boolean` exported from `desktop/src/shared/catalog-types.ts` — `true` for `local | url | git-subdir`, or `type === 'prompt'`; `false` for `mcp-registry`, `file`, unknown.

- [ ] **Step 1: Failing test** — `desktop/tests/marketplace-not-installable.test.tsx` (arrange providers the way `tests/marketplace-card-compact.test.tsx` does):

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { isInstallableSource } from '../src/shared/catalog-types';
import MarketplaceCard from '../src/renderer/components/marketplace/MarketplaceCard';
// …the same provider wrappers / mocks tests/marketplace-card-compact.test.tsx uses…

afterEach(cleanup);

const row = (sourceType: string, type: 'plugin' | 'prompt' = 'plugin') => ({
  id: 'x', type, displayName: 'X', description: 'd', category: 'development', prompt: '/x', source: 'marketplace', visibility: 'published',
  sourceType, sourceRef: 'mcp:x', repoUrl: 'https://github.com/o/r',
  catalog: { itemType: 'tool', origin: { tier: 'community' }, scan: { status: 'unchecked' }, capabilities: [] },
} as any);

describe('rows the installer cannot install', () => {
  it('isInstallableSource', () => {
    expect(isInstallableSource(row('url'))).toBe(true);
    expect(isInstallableSource(row('git-subdir'))).toBe(true);
    expect(isInstallableSource(row('local'))).toBe(true);
    expect(isInstallableSource(row('file', 'prompt'))).toBe(true);
    expect(isInstallableSource(row('mcp-registry'))).toBe(false);
    expect(isInstallableSource(row('file'))).toBe(false);
  });

  it('the card shows no install button for an mcp-registry row', () => {
    render(<MarketplaceCard item={{ kind: 'skill', entry: row('mcp-registry') }} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/marketplace-not-installable.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`desktop/src/shared/catalog-types.ts` — append:
```ts
/** Can the app's installer take this row? Plugins from git, and prompt rows
 *  (installed as a private prompt). Connections from the MCP Registry and
 *  single-file rows are listed but not installable yet (ROADMAP). */
export function isInstallableSource(entry: { type?: string; sourceType?: string }): boolean {
  if (entry.type === 'prompt') return true;
  return entry.sourceType === 'local' || entry.sourceType === 'url' || entry.sourceType === 'git-subdir';
}
```

`MarketplaceCard.tsx` — the `corner` element: `const corner = suppressCorner || (kind === "skill" && !isInstallableSource(item.entry)) ? null : …` (import `isInstallableSource`).

`MarketplaceDetailOverlay.tsx` — in `SkillBody`'s header, wrap the Install/Uninstall branch: when `!isInstallableSource(entry)` render instead

```tsx
            <Button variant="secondary" size="lg" onClick={() => entry.repoUrl && window.open(entry.repoUrl, '_blank', 'noopener')} disabled={!entry.repoUrl}>
              Open source
            </Button>
```
and above `MetadataChips` a `Callout` (`tone="info"`): "This connection isn't installable from here yet. What this can do lists how it runs (as a package or a remote service); add it from the source page." — one sentence, no jargon beyond "package".

- [ ] **Step 4: Run** the test → PASS; `bash scripts/verify.sh marketplace-ui` → OK; **Step 5: Commit** `git add desktop/src/shared/catalog-types.ts desktop/src/renderer/components/marketplace/MarketplaceCard.tsx desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx desktop/tests/marketplace-not-installable.test.tsx && git commit -m "feat(marketplace): rows the installer cannot take show Open source instead of Install"`.

---

### Task 7: Verify end-to-end, merge, close out

- [ ] **Step 1: Full desktop gate + a real-data smoke**

Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui --full` → OK.
Run: `curl -s https://wecoded-marketplace-api.destinj101.workers.dev/catalog | python3 -c "import json,sys; d=json.load(sys.stdin); e=d['entries']; print(len(e), sum(1 for x in e if x.get('catalog')), sum(1 for x in e if (x.get('catalog') or {}).get('partOf')))"`
Expected: three numbers — total rows, rows with a catalog block (must equal total), member rows (> 0).

- [ ] **Step 2: Hand it to Destin for the interactive pass — do not script it**

Say before launching: `bash scripts/run-dev.sh marketplace-ui --label "Marketplace overhaul"` opens a window. He checks: the type switch counts, a Skills-tab card with "Part of …", a detail page's badges and "What this can do" showing REAL values (compare one against its GitHub repo), install a `url`-sourced plugin and confirm `git -C ~/.claude/plugins/marketplaces/youcoded/plugins/<id> rev-parse HEAD` equals its `sourceCommit`. Then kill the dev window.

- [ ] **Step 3: Merge and clean up**

```bash
cd /home/destin/youcoded-dev/worktrees/marketplace-ui
git fetch origin && git rebase origin/master && bash /home/destin/youcoded-dev/scripts/verify.sh marketplace-ui
git push --force-with-lease origin feat/marketplace-overhaul-ui
gh pr create --repo itsdestin/youcoded --title "feat(marketplace): overhaul — catalog-backed cards, trust badges, What this can do, feedback" --body "$(cat <<'EOF'
Spec: youcoded-dev docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md (20/20 approved). Backend: wecoded-marketplace feedback routes + catalog service (both deployed).

- type switch (Plugins · Skills · Specialists · Connections · Prompts · Themes), grouped/split rule
- Likely safe / origin / author chips, "What this can do", thumbs + comments
- desktop + Android read /catalog first, index.json fallback; installs pin to the catalog's commit; member installs its bundle

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01HcBwbvXqiaWA7M46NP3h7L
EOF
)"
```

After merge (squash or merge per repo habit) and CI green:

```bash
cd /home/destin/youcoded-dev/youcoded && git pull origin master && git branch --contains $(git rev-parse origin/master) | grep -q master
git worktree remove /home/destin/youcoded-dev/worktrees/marketplace-ui
git push origin --delete feat/marketplace-overhaul-ui; git branch -D feat/marketplace-overhaul-ui
```

- [ ] **Step 4: Archive + ROADMAP (workspace repo)**

Move `docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md`, the three plans, and `docs/active/investigations/2026-08-27-marketplace-strategy.md` to `docs/archive/` with `status: shipped`; flip the ROADMAP overhaul entry to `[x]` with the merge SHAs; leave the "public sub-registry" entry open. Commit by explicit path; push.
