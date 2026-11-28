---
status: active
created: 2026-09-05
design: docs/active/design/2026-09-05-dev-dashboard/2026-09-05-dev-dashboard-design.md
repo: youcoded
---

# Dev Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One browser page that lists every branch copy of YouCoded on this machine, launches and stops a dev instance from any of them, runs the check suites against them, and says which ones hold work that exists nowhere else.

**Architecture:** Three pieces. A **real renderer screen** (`src/renderer/dev/dashboard/`) reached by a `?mode=dev-dashboard` branch in the existing `index.tsx` dispatcher — no `vite.config.ts` change. A **dev-only Node helper** (`dev-dashboard/`, beside `test-engine/`, excluded from packaging) that runs every command and serves the page's data. The helper also **proxies Vite**, so there is exactly one address to open. The screen never touches a shell; it asks the helper.

**Tech Stack:** Node 20 ESM (`.mjs`, no dependencies beyond node builtins), React 18 + TypeScript for the screen, Vitest for all tests, the app's existing `components/ui` primitives, `ThemeProvider` + `ThemeBg` for theming.

## Global Constraints

- **Repo:** all code lands in `youcoded` (the app repo), on a worktree branched from `origin/master`. Nothing in this plan touches `youcoded-dev`.
- **Never touch the live app.** The helper reads `~/.claude/youcoded-appearance.json` and `~/.claude/wecoded-themes/` **read-only**. `appearance.set` is a logged no-op. Every dev instance launches with its own port offset and Electron profile.
- **WHY comments are required** at every non-trivial edit. Destin does not read code; the comment is how he follows what changed.
- **No shell strings.** Every subprocess uses `execFile`/`spawn` with an argument array. No request value is ever interpolated into a command.
- **Checkouts are addressed by id**, never by a path taken from a request.
- **`knip` runs with `"files": "error"`** — a new file no entry point references fails the build. `dev-dashboard/**/*.mjs` must be added to `knip.jsonc` `entry` (Task 2).
- **Vitest only collects `tests/**/*.{test,spec}.{ts,tsx}` and `src/**/*.{test,spec}.{ts,tsx}`.** Helper tests are therefore `.ts` files under `tests/` that import the `.mjs` modules. A `.test.mjs` beside the helper would never run.
- **Ports:** helper **5240** (the only address Destin opens), Vite **5241** behind it (`YOUCODED_PORT_OFFSET=68`). Clear of the app (5173), dev instances (5223), the workbench (5233), question decks (5411), live panes (5513).
- **Verification:** `bash scripts/verify.sh <worktree>` from the workspace root must pass before any task is called done.

## File Structure

| File | Responsibility |
|---|---|
| `desktop/dev-dashboard/checkouts.mjs` | Enumerate worktrees; measure dirty/ahead/pushed/merged; classify into one pill |
| `desktop/dev-dashboard/server.mjs` | HTTP server, loopback guard, route table, Vite proxy |
| `desktop/dev-dashboard/theme.mjs` | Read appearance + theme manifests, rewrite asset paths, serve theme assets |
| `desktop/dev-dashboard/instances.mjs` | Spawn/track/stop dev instances; offset + profile pool |
| `desktop/dev-dashboard/suites.mjs` | Suite registry (command, weight, paid flag) and run/poll bookkeeping |
| `desktop/dev-dashboard/run.sh` | Boot Vite + helper together; print the one URL |
| `desktop/src/renderer/dev/dashboard/DevDashboard.tsx` | The screen: header, rows, selection bar |
| `desktop/src/renderer/dev/dashboard/CheckoutRow.tsx` | One row: name, pill, launch control, suite menu, checkbox |
| `desktop/src/renderer/dev/dashboard/StatusPill.tsx` | The four pills |
| `desktop/src/renderer/dev/dashboard/Disclosure.tsx` | Local "show details" collapsible |
| `desktop/src/renderer/dev/dashboard/ConfirmDialog.tsx` | Local confirm wrapper over the shared `Dialog` |
| `desktop/src/renderer/dev/dashboard/cleanup-prompt.ts` | Pure: selected rows → copyable prompt text |
| `desktop/src/renderer/dev/dashboard/api.ts` | Typed fetch wrappers for the helper's routes |
| `desktop/src/renderer/dev/dashboard/http-bridge.ts` | Installs the five-method `window.claude` shim |

---

### Task 1: Checkout enumeration and the four pills

The status column is the reason this page earns its place, and it reverses an ordering that is
wrong in our existing tooling today: `context-inject.sh` reads `ahead == 0` as "merged or empty,
candidate for cleanup" **before** consulting the dirty count, so a branch with zero commits and
forty uncommitted files — the most fragile state on the machine — is labelled safe. Dirty is
checked first here and outranks everything.

**Files:**
- Create: `desktop/dev-dashboard/checkouts.mjs`
- Test: `desktop/tests/dev-dashboard-checkouts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `classify({ dirty, ahead, pushed, merged }): 'unsaved' | 'unpushed' | 'pushed' | 'safe'`
  - `listCheckouts(repoDir, opts?): Promise<Checkout[]>` where
    `Checkout = { id: string, path: string, name: string, branch: string | null, dirty: number, ahead: number, pushed: boolean, merged: boolean, status: Status, missing: boolean }`
    and `opts = { base?: string }` (default `'origin/master'`).
  - `id` is a stable slug derived from the path (`path.replace(/[^a-zA-Z0-9]+/g, '-')`), used everywhere as the address for a checkout. Requests never carry paths.

- [ ] **Step 1: Write the failing test for `classify`**

Create `desktop/tests/dev-dashboard-checkouts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classify } from '../dev-dashboard/checkouts.mjs';

describe('classify', () => {
  it('calls uncommitted files unsaved even when nothing is ahead', () => {
    // The bug this replaces: context-inject.sh reads ahead===0 as "candidate for
    // cleanup" before looking at the dirty count, so the site-themes worktree —
    // 40 uncommitted files, 0 commits, no remote — was labelled safe to delete.
    expect(classify({ dirty: 40, ahead: 0, pushed: false, merged: false })).toBe('unsaved');
  });

  it('calls uncommitted files unsaved even on a fully merged branch', () => {
    expect(classify({ dirty: 1, ahead: 0, pushed: true, merged: true })).toBe('unsaved');
  });

  it('calls clean unpushed commits unpushed', () => {
    expect(classify({ dirty: 0, ahead: 2, pushed: false, merged: false })).toBe('unpushed');
  });

  it('calls pushed-but-unmerged work pushed', () => {
    expect(classify({ dirty: 0, ahead: 2, pushed: true, merged: false })).toBe('pushed');
  });

  it('calls merged clean work safe', () => {
    expect(classify({ dirty: 0, ahead: 0, pushed: true, merged: true })).toBe('safe');
  });

  it('calls an empty clean worktree safe', () => {
    expect(classify({ dirty: 0, ahead: 0, pushed: false, merged: false })).toBe('safe');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-checkouts.test.ts
```

Expected: FAIL — `Cannot find module '../dev-dashboard/checkouts.mjs'`.

- [ ] **Step 3: Write `classify` and the git measurements**

Create `desktop/dev-dashboard/checkouts.mjs`:

```js
// Enumerates every checkout of a repo (main + worktrees) and says, for each,
// whether deleting it would lose work. Read-only: nothing here writes to a repo.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);

/** Run a git command in `dir`, returning trimmed stdout, or `null` if git failed.
 *  WHY swallow the error: a worktree whose directory was deleted, or a branch with
 *  no remote, makes git exit non-zero. That is information, not a crash — every
 *  caller below turns a null into a defined default. */
async function git(dir, args) {
  try {
    const { stdout } = await run('git', ['-C', dir, ...args], { maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** One checkout, one pill. Order is the whole point: uncommitted files outrank
 *  everything, because they are the only state git itself has no copy of. */
export function classify({ dirty, ahead, pushed, merged }) {
  if (dirty > 0) return 'unsaved';
  if (ahead > 0 && !pushed) return 'unpushed';
  if (pushed && !merged) return 'pushed';
  return 'safe';
}

/** Stable, path-derived address for a checkout. Requests name this, never a path,
 *  so nothing from the network is ever used to build a filesystem path. */
export function checkoutId(p) {
  return p.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function measure(dir, branch, base) {
  const dirtyOut = await git(dir, ['status', '--porcelain']);
  const dirty = dirtyOut ? dirtyOut.split('\n').filter(Boolean).length : 0;

  const aheadOut = await git(dir, ['rev-list', '--count', `${base}..HEAD`]);
  const ahead = aheadOut === null ? 0 : Number(aheadOut) || 0;

  // Pushed means the branch exists on the remote AND the remote is at our tip.
  // A branch pushed once and committed to since is NOT pushed.
  let pushed = false;
  if (branch) {
    const local = await git(dir, ['rev-parse', 'HEAD']);
    const remote = await git(dir, ['rev-parse', `origin/${branch}`]);
    pushed = Boolean(local && remote && local === remote);
  }

  const merged = (await git(dir, ['merge-base', '--is-ancestor', 'HEAD', base])) !== null;

  return { dirty, ahead, pushed, merged };
}

/** Every checkout of `repoDir`: the main one plus every registered worktree. */
export async function listCheckouts(repoDir, opts = {}) {
  const base = opts.base ?? 'origin/master';
  const porcelain = await git(repoDir, ['worktree', 'list', '--porcelain']);
  if (porcelain === null) return [];

  // Parse git's own registry rather than scanning directories: worktrees live in
  // four different places on this machine and a name-pattern scan has silently
  // missed all of them before.
  const entries = [];
  let current = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null };
      entries.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '');
    }
  }

  const out = await Promise.all(entries.map(async (e) => {
    const common = {
      id: checkoutId(e.path),
      path: e.path,
      name: path.basename(e.path),
      branch: e.branch,
    };
    // A worktree still registered against a deleted directory: report it rather
    // than letting every git call below fail one at a time.
    if (!fs.existsSync(path.join(e.path, '.git'))) {
      return { ...common, dirty: 0, ahead: 0, pushed: false, merged: false, status: 'safe', missing: true };
    }
    const m = await measure(e.path, e.branch, base);
    return { ...common, ...m, status: classify(m), missing: false };
  }));

  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-checkouts.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Add the integration test against a real repo**

Append to `desktop/tests/dev-dashboard-checkouts.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { listCheckouts } from '../dev-dashboard/checkouts.mjs';

describe('listCheckouts against a real repo', () => {
  let root: string;
  let repo: string;

  const g = (dir: string, ...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' }).toString().trim();

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-'));
    const origin = path.join(root, 'origin.git');
    repo = path.join(root, 'repo');
    execFileSync('git', ['init', '--bare', '-b', 'master', origin]);
    execFileSync('git', ['clone', origin, repo], { stdio: 'pipe' });
    g(repo, 'config', 'user.email', 't@t.t');
    g(repo, 'config', 'user.name', 'T');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    g(repo, 'add', 'a.txt');
    g(repo, 'commit', '-m', 'base');
    g(repo, 'push', 'origin', 'master');

    // unsaved: a branch with NO commits and one uncommitted file.
    const wtUnsaved = path.join(root, 'wt-unsaved');
    g(repo, 'worktree', 'add', '-b', 'only-copy', wtUnsaved, 'master');
    fs.writeFileSync(path.join(wtUnsaved, 'scratch.txt'), 'the only copy\n');

    // unpushed: one local commit, never pushed, clean.
    const wtUnpushed = path.join(root, 'wt-unpushed');
    g(repo, 'worktree', 'add', '-b', 'local-only', wtUnpushed, 'master');
    fs.writeFileSync(path.join(wtUnpushed, 'b.txt'), 'two\n');
    g(wtUnpushed, 'add', 'b.txt');
    g(wtUnpushed, 'commit', '-m', 'local');

    // safe: a branch at master, clean, nothing ahead.
    g(repo, 'worktree', 'add', '-b', 'done', path.join(root, 'wt-done'), 'master');
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('gives each worktree the right pill', async () => {
    const list = await listCheckouts(repo, { base: 'origin/master' });
    const by = (n: string) => list.find((c) => c.name === n)!;
    expect(by('wt-unsaved').status).toBe('unsaved');
    expect(by('wt-unsaved').dirty).toBe(1);
    expect(by('wt-unpushed').status).toBe('unpushed');
    expect(by('wt-unpushed').ahead).toBe(1);
    expect(by('wt-done').status).toBe('safe');
  });

  it('gives every checkout a stable id and never leaks a path into it', async () => {
    const list = await listCheckouts(repo, { base: 'origin/master' });
    expect(list.every((c) => /^[a-zA-Z0-9-]+$/.test(c.id))).toBe(true);
  });
});
```

- [ ] **Step 6: Run both suites**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-checkouts.test.ts
```

Expected: PASS, 8 tests. If the integration block fails on `git clone` needing a name/email, the
`config` lines above cover the clone's own repo only — add the same two `config` calls in each
worktree if a commit there complains.

- [ ] **Step 7: Commit**

```bash
git add dev-dashboard/checkouts.mjs tests/dev-dashboard-checkouts.test.ts
git commit -m "feat(dev-dashboard): enumerate checkouts and say which hold the only copy

Dirty outranks every other measure. context-inject.sh reads ahead==0 as
'candidate for cleanup' before consulting the dirty count, which labelled a
worktree holding 40 uncommitted files on a zero-commit branch safe to delete."
```

---

### Task 2: The helper's HTTP skeleton and its loopback guard

The helper runs commands, so the page driving it is an attack surface. This task builds the
server with the guard in place before a single route can do anything.

**Files:**
- Create: `desktop/dev-dashboard/server.mjs`
- Modify: `desktop/knip.jsonc` (add the `dev-dashboard` entry glob)
- Test: `desktop/tests/dev-dashboard-server.test.ts`

**Interfaces:**
- Consumes: `listCheckouts`, `checkoutId` from Task 1.
- Produces:
  - `guardRequest(req): string | null` — a refusal reason, or `null` to allow.
  - `createServer(opts): http.Server` where `opts = { repoDir, workspaceRoot, vitePort }`.
  - Route `GET /api/checkouts` → `{ checkouts: Checkout[] }`.

- [ ] **Step 1: Write the failing guard test**

Create `desktop/tests/dev-dashboard-server.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { guardRequest } from '../dev-dashboard/server.mjs';

const req = (headers: Record<string, string>) => ({ headers });

describe('guardRequest', () => {
  it('allows a loopback host with no origin', () => {
    expect(guardRequest(req({ host: '127.0.0.1:5240' }))).toBeNull();
  });

  it('allows an origin that matches its own host', () => {
    expect(guardRequest(req({ host: '127.0.0.1:5240', origin: 'http://127.0.0.1:5240' }))).toBeNull();
  });

  it('refuses a non-loopback host', () => {
    // A DNS name resolving to 127.0.0.1 would otherwise let any site on the
    // internet drive a server that runs commands on this machine.
    expect(guardRequest(req({ host: 'evil.example.com' }))).toMatch(/host/i);
  });

  it('refuses a cross-origin request', () => {
    expect(guardRequest(req({ host: '127.0.0.1:5240', origin: 'http://evil.example.com' })))
      .toMatch(/origin/i);
  });

  it('refuses a missing host', () => {
    expect(guardRequest(req({}))).toMatch(/host/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-server.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the server skeleton**

Create `desktop/dev-dashboard/server.mjs`:

```js
// The dev dashboard's helper. It is the only piece that runs commands; the page
// asks it and never touches a shell itself. Dev-only: electron-builder.yml's
// `files:` allowlist excludes this folder, the same way it excludes test-engine/.
import http from 'node:http';
import { listCheckouts } from './checkouts.mjs';

/** Returns a refusal reason, or null to allow.
 *  WHY both checks: a Host header naming a domain that resolves to 127.0.0.1 would
 *  otherwise let any page on the internet drive a server that runs commands here.
 *  The Origin check stops a cross-site form post doing the same. This is the guard
 *  scripts/questions/serve.py already runs, for the same reason. */
export function guardRequest(req) {
  const host = req.headers.host;
  if (!host) return 'refused: no Host header';
  const hostname = host.replace(/:\d+$/, '');
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    return `refused: Host ${hostname} is not loopback`;
  }
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) {
    return `refused: Origin ${origin} does not match this server`;
  }
  return null;
}

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

export function createServer(opts) {
  const { repoDir } = opts;

  const server = http.createServer(async (req, res) => {
    const refusal = guardRequest(req);
    if (refusal) { json(res, 403, { error: refusal }); return; }

    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (url.pathname === '/api/checkouts' && req.method === 'GET') {
        json(res, 200, { checkouts: await listCheckouts(repoDir) });
        return;
      }
      json(res, 404, { error: `no route for ${url.pathname}` });
    } catch (err) {
      // Surface the real error. A hardcoded guess here would be a misleading
      // error message, which docs/error-message-standards.md forbids.
      json(res, 500, { error: String(err && err.message ? err.message : err) });
    }
  });

  return server;
}
```

- [ ] **Step 4: Run the guard test and watch it pass**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-server.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add a live route test**

Append to `desktop/tests/dev-dashboard-server.test.ts`:

```ts
import { createServer } from '../dev-dashboard/server.mjs';
import type { AddressInfo } from 'node:net';

describe('the server over a real socket', () => {
  it('serves checkouts, and refuses a forged Host', async () => {
    const server = createServer({ repoDir: process.cwd(), workspaceRoot: process.cwd(), vitePort: 0 });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const ok = await fetch(`http://127.0.0.1:${port}/api/checkouts`);
      expect(ok.status).toBe(200);
      expect(Array.isArray((await ok.json()).checkouts)).toBe(true);

      const forged = await fetch(`http://127.0.0.1:${port}/api/checkouts`, {
        headers: { host: 'evil.example.com' },
      });
      expect(forged.status).toBe(403);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
```

Note: `fetch` will not let you override `host` in every runtime. If the forged-Host half is
rejected by undici as a forbidden header, drop that half of this test — `guardRequest` is already
covered directly by Step 1, which is the assertion that matters.

- [ ] **Step 6: Register the helper with knip**

`knip.jsonc` has `"files": "error"`, so a file no entry point references **fails the build**.
`test-engine/**/*.mjs` is already listed for exactly this reason. In `desktop/knip.jsonc`, change:

```jsonc
    "test-conpty/**/*.mjs",
    "test-engine/**/*.mjs"
```

to:

```jsonc
    "test-conpty/**/*.mjs",
    "test-engine/**/*.mjs",
    // The dev dashboard's helper — run by hand via dev-dashboard/run.sh, never
    // imported by the app. Same standing as test-engine/ above.
    "dev-dashboard/**/*.mjs"
```

- [ ] **Step 7: Verify knip is clean**

```bash
cd youcoded/desktop && npx knip
```

Expected: no `Unused files` entry naming anything under `dev-dashboard/`.

- [ ] **Step 8: Commit**

```bash
git add dev-dashboard/server.mjs tests/dev-dashboard-server.test.ts knip.jsonc
git commit -m "feat(dev-dashboard): helper server, loopback-only, cross-origin refused

A page that can run commands is the shape of a security problem, so the guard
lands before any route that does work."
```

---

### Task 3: The theme bridge

Full Golden Sunbreak — colours, radius, wallpaper, blur — with **no change to the app's theme
system**. `theme-asset-resolver.ts` passes any value already starting with `http://` through
untouched, so the helper rewrites the manifest's relative asset paths to loopback URLs and the
app's existing resolver leaves them alone.

**Files:**
- Create: `desktop/dev-dashboard/theme.mjs`
- Create: `desktop/src/renderer/dev/dashboard/http-bridge.ts`
- Modify: `desktop/dev-dashboard/server.mjs` (mount the theme routes)
- Test: `desktop/tests/dev-dashboard-theme.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `rewriteAssets(manifest, slug, baseUrl): object` — deep copy with every string starting `assets/` rewritten to `${baseUrl}/theme-asset/${slug}/${value}`.
  - `readAppearance(): Promise<object|null>` — `~/.claude/youcoded-appearance.json`, or null.
  - `listThemes(): Promise<string[]>` — directory names under `~/.claude/wecoded-themes/`.
  - `readTheme(slug, baseUrl): Promise<string>` — the rewritten manifest as JSON text (what `claude.theme.readFile` must return).
  - `resolveAssetFile(slug, relPath): string | null` — an absolute path inside the theme dir, or `null` if it escapes.
  - `installHttpBridge(): void` — sets `window.claude` with the five methods `ThemeProvider` uses.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/dev-dashboard-theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rewriteAssets, resolveAssetFile } from '../dev-dashboard/theme.mjs';

describe('rewriteAssets', () => {
  const base = 'http://127.0.0.1:5240';

  it('rewrites a wallpaper path to a loopback URL', () => {
    const out = rewriteAssets(
      { background: { type: 'image', value: 'assets/wallpaper.jpg' } },
      'golden-sunbreak', base,
    );
    expect(out.background.value).toBe(`${base}/theme-asset/golden-sunbreak/assets/wallpaper.jpg`);
  });

  it('rewrites nested arrays of assets', () => {
    const out = rewriteAssets(
      { companions: [{ asset: 'assets/companions/sun.svg', size: 0.4 }] },
      'golden-sunbreak', base,
    );
    expect(out.companions[0].asset).toBe(`${base}/theme-asset/golden-sunbreak/assets/companions/sun.svg`);
    expect(out.companions[0].size).toBe(0.4);
  });

  it('leaves colours, numbers and absolute URLs alone', () => {
    const out = rewriteAssets(
      { tokens: { accent: '#ffc030' }, background: { value: 'https://x/y.png', opacity: 0.98 } },
      's', base,
    );
    expect(out.tokens.accent).toBe('#ffc030');
    expect(out.background.value).toBe('https://x/y.png');
    expect(out.background.opacity).toBe(0.98);
  });

  it('does not mutate the input', () => {
    const input = { background: { value: 'assets/w.jpg' } };
    rewriteAssets(input, 's', base);
    expect(input.background.value).toBe('assets/w.jpg');
  });
});

describe('resolveAssetFile', () => {
  it('refuses a path that climbs out of the theme directory', () => {
    expect(resolveAssetFile('golden-sunbreak', '../../.ssh/id_rsa')).toBeNull();
    expect(resolveAssetFile('golden-sunbreak', 'assets/../../../etc/passwd')).toBeNull();
  });

  it('refuses a slug that climbs out of the themes directory', () => {
    expect(resolveAssetFile('../..', 'assets/x.png')).toBeNull();
  });

  it('accepts an ordinary asset path', () => {
    expect(resolveAssetFile('golden-sunbreak', 'assets/wallpaper.jpg'))
      .toMatch(/wecoded-themes\/golden-sunbreak\/assets\/wallpaper\.jpg$/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-theme.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `theme.mjs`**

Create `desktop/dev-dashboard/theme.mjs`:

```js
// Serves the live theme to a browser page. Strictly READ-ONLY against
// ~/.claude: writing youcoded-appearance.json would reach into Destin's running
// app, which .claude/rules/live-app-safety.md forbids.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const THEMES_DIR = path.join(os.homedir(), '.claude', 'wecoded-themes');
const APPEARANCE = path.join(os.homedir(), '.claude', 'youcoded-appearance.json');

/** Deep copy with every relative asset path rewritten to a loopback URL.
 *  WHY this works with no app change: theme-asset-resolver.ts returns any value
 *  already starting with http:// unchanged, so the renderer's own resolver leaves
 *  these alone instead of wrapping them in the Electron-only theme-asset:// scheme.
 *  WHY a generic walk rather than the resolver's field list: it is a superset, so a
 *  manifest field added later is covered without touching this. */
export function rewriteAssets(value, slug, baseUrl) {
  if (typeof value === 'string') {
    return value.startsWith('assets/') ? `${baseUrl}/theme-asset/${slug}/${value}` : value;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteAssets(v, slug, baseUrl));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteAssets(v, slug, baseUrl);
    return out;
  }
  return value;
}

export async function readAppearance() {
  try {
    return JSON.parse(await fs.readFile(APPEARANCE, 'utf-8'));
  } catch {
    return null; // No file yet is normal on a fresh machine.
  }
}

export async function listThemes() {
  try {
    const entries = await fs.readdir(THEMES_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function readTheme(slug, baseUrl) {
  const file = resolveAssetFile(slug, 'manifest.json');
  if (!file) throw new Error(`theme slug rejected: ${slug}`);
  const raw = JSON.parse(await fs.readFile(file, 'utf-8'));
  return JSON.stringify(rewriteAssets(raw, slug, baseUrl));
}

/** Absolute path inside the theme's own directory, or null if it escapes.
 *  Both the slug and the relative path are attacker-controlled in principle, so
 *  the containment check is done once, on the resolved result. */
export function resolveAssetFile(slug, relPath) {
  const themeDir = path.resolve(THEMES_DIR, slug);
  if (themeDir !== THEMES_DIR && !themeDir.startsWith(THEMES_DIR + path.sep)) return null;
  const full = path.resolve(themeDir, relPath);
  if (!full.startsWith(themeDir + path.sep)) return null;
  return full;
}

export const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css',
  '.json': 'application/json',
};

export function assetExists(p) { return fsSync.existsSync(p); }
```

- [ ] **Step 4: Run and watch it pass**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-theme.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Mount the theme routes in the server**

In `desktop/dev-dashboard/server.mjs`, add to the imports:

```js
import fs from 'node:fs';
import path from 'node:path';
import { readAppearance, listThemes, readTheme, resolveAssetFile, MIME, assetExists } from './theme.mjs';
```

and insert these routes inside the `try` block, before the 404:

```js
      const baseUrl = `http://${req.headers.host}`;

      if (url.pathname === '/api/theme/appearance') {
        json(res, 200, { appearance: await readAppearance() });
        return;
      }
      if (url.pathname === '/api/theme/list') {
        json(res, 200, { slugs: await listThemes() });
        return;
      }
      if (url.pathname.startsWith('/api/theme/read/')) {
        const slug = decodeURIComponent(url.pathname.slice('/api/theme/read/'.length));
        // readTheme returns manifest JSON as TEXT, because claude.theme.readFile's
        // contract is a string the renderer parses itself.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(await readTheme(slug, baseUrl));
        return;
      }
      if (url.pathname.startsWith('/theme-asset/')) {
        const rest = url.pathname.slice('/theme-asset/'.length);
        const slash = rest.indexOf('/');
        const slug = decodeURIComponent(rest.slice(0, slash));
        const rel = decodeURIComponent(rest.slice(slash + 1));
        const file = resolveAssetFile(slug, rel);
        if (!file || !assetExists(file)) { json(res, 404, { error: 'no such theme asset' }); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }
```

- [ ] **Step 6: Write the renderer's bridge**

Create `desktop/src/renderer/dev/dashboard/http-bridge.ts`:

```ts
// Stands in for Electron's preload bridge when the dashboard runs in a plain
// browser. ThemeProvider needs exactly five methods; every call site in
// theme-context.tsx is null-guarded, so anything missing degrades to the four
// built-in themes rather than crashing.
export function installHttpBridge(): void {
  if ((window as any).claude) return; // Never shadow a real bridge.

  (window as any).claude = {
    theme: {
      list: async (): Promise<string[]> => (await (await fetch('/api/theme/list')).json()).slugs,
      readFile: async (slug: string): Promise<string> =>
        await (await fetch(`/api/theme/read/${encodeURIComponent(slug)}`)).text(),
      // No file watcher behind the browser page — a reload picks up a theme edit.
      onReload: (_cb: () => void) => () => {},
    },
    appearance: {
      get: async () => (await (await fetch('/api/theme/appearance')).json()).appearance,
      // Deliberately a no-op. This writes ~/.claude/youcoded-appearance.json, the
      // same file Destin's LIVE app reads — writing it from a dev tool would reach
      // into his running app. The dashboard reads the active theme, never sets it.
      set: async () => { console.info('[dev-dashboard] appearance.set ignored: read-only by design'); },
    },
  };
}
```

- [ ] **Step 7: Run the full check and commit**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-theme.test.ts tests/dev-dashboard-server.test.ts && npx tsc --noEmit
```

Expected: tests PASS, `tsc` clean.

```bash
git add dev-dashboard/theme.mjs dev-dashboard/server.mjs src/renderer/dev/dashboard/http-bridge.ts tests/dev-dashboard-theme.test.ts
git commit -m "feat(dev-dashboard): serve the live theme, wallpaper included, with no app change

theme-asset-resolver.ts passes http:// values through untouched, so rewriting
the manifest's asset paths to loopback URLs is enough. appearance.set is a
no-op: that file belongs to Destin's live app."
```

---

### Task 4: One address — the Vite proxy and the launcher

Two ports would mean Destin has to know which one to open. The helper proxies everything that
is not `/api` or `/theme-asset` to Vite, including the WebSocket upgrade that hot reload needs.

**Files:**
- Modify: `desktop/dev-dashboard/server.mjs`
- Create: `desktop/dev-dashboard/run.sh`

**Interfaces:**
- Consumes: `createServer({ repoDir, workspaceRoot, vitePort })` from Task 2.
- Produces: `bash dev-dashboard/run.sh` boots Vite on 5241 and the helper on 5240 and prints one URL.

- [ ] **Step 1: Add the proxy to the server**

In `desktop/dev-dashboard/server.mjs`, replace the `json(res, 404, ...)` fallthrough with a proxy,
and add an `upgrade` handler. Add `import net from 'node:net';` to the imports.

```js
      // Anything not ours belongs to Vite, which serves the real renderer. WHY
      // proxy rather than tell Destin two ports: one address to open, and the page
      // and its data then share an origin, so the Origin guard above stays simple.
      if (url.pathname.startsWith('/api/')) { json(res, 404, { error: `no route for ${url.pathname}` }); return; }
      const proxied = http.request(
        { host: '127.0.0.1', port: opts.vitePort, path: req.url, method: req.method, headers: req.headers },
        (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
      );
      proxied.on('error', (e) => {
        // Name the real failure. "Vite is not running" is the common case and the
        // message says so rather than guessing at something more specific.
        json(res, 502, { error: `dev server on port ${opts.vitePort} did not answer: ${e.message}` });
      });
      req.pipe(proxied);
      return;
```

After `const server = http.createServer(...)`, add:

```js
  // Vite's hot reload runs over a WebSocket, which is an HTTP upgrade rather than
  // a normal request — without this the page loads but never live-reloads.
  server.on('upgrade', (req, socket, head) => {
    if (guardRequest(req)) { socket.destroy(); return; }
    const up = http.request({
      host: '127.0.0.1', port: opts.vitePort, path: req.url, method: req.method,
      headers: req.headers,
    });
    up.on('upgrade', (upRes, upSocket, upHead) => {
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        '\r\n\r\n',
      );
      if (upHead?.length) socket.unshift(upHead);
      upSocket.pipe(socket).pipe(upSocket);
    });
    up.on('error', () => socket.destroy());
    if (head?.length) up.write(head);
    up.end();
  });
```

- [ ] **Step 2: Write the launcher**

Create `desktop/dev-dashboard/run.sh`:

```bash
#!/usr/bin/env bash
# Boot the dev dashboard: Vite (the real renderer) behind the helper (the only
# address you open). Ctrl-C stops both.
#
#   bash dev-dashboard/run.sh
#
# Ports: helper 5240, Vite 5241. Clear of the app (5173), dev instances (5223),
# the workbench (5233), question decks (5411) and live panes (5513).
set -euo pipefail

DESKTOP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER_PORT="${DEV_DASHBOARD_PORT:-5240}"
VITE_OFFSET=68   # 5173 + 68 = 5241

cd "$DESKTOP"

# VITE_NO_WATCH is deliberately NOT set: this is an interactive tool and hot
# reload is the point. If Vite dies with ENOSPC, the machine is out of inotify
# watches (see the note in vite.config.ts) — close a dev instance and retry.
YOUCODED_PORT_OFFSET="$VITE_OFFSET" npm run dev:renderer -- --host 127.0.0.1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT

DEV_DASHBOARD_PORT="$HELPER_PORT" VITE_PORT=$((5173 + VITE_OFFSET)) node dev-dashboard/main.mjs
```

- [ ] **Step 3: Write the helper's entry point**

Create `desktop/dev-dashboard/main.mjs`:

```js
// Entry point for the helper. Resolves the repo and workspace from this file's
// own location, so it works from any working directory.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..', '..');          // <workspace>/youcoded
const workspaceRoot = path.resolve(repoDir, '..');        // <workspace>
const port = Number(process.env.DEV_DASHBOARD_PORT ?? 5240);
const vitePort = Number(process.env.VITE_PORT ?? 5241);

const server = createServer({ repoDir, workspaceRoot, vitePort });
server.listen(port, '127.0.0.1', () => {
  console.log(`[dev-dashboard] http://127.0.0.1:${port}/?mode=dev-dashboard`);
});
```

- [ ] **Step 4: Verify by hand**

```bash
cd youcoded/desktop && bash dev-dashboard/run.sh
```

Expected: Vite starts, then `[dev-dashboard] http://127.0.0.1:5240/?mode=dev-dashboard`. In another
shell:

```bash
curl -s http://127.0.0.1:5240/api/checkouts | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5240/
```

Expected: JSON with a `checkouts` array; `200` for the proxied page. Then Ctrl-C and confirm no
node or vite process is left holding 5240 or 5241:

```bash
ss -ltnp 2>/dev/null | grep -E ':(5240|5241)' || echo "both ports free"
```

- [ ] **Step 5: Commit**

```bash
chmod +x dev-dashboard/run.sh
git add dev-dashboard/server.mjs dev-dashboard/run.sh dev-dashboard/main.mjs
git commit -m "feat(dev-dashboard): one address — helper proxies Vite, hot reload included"
```

---

### Task 5: The screen — rows and pills, read-only

Mounts the real renderer screen at `?mode=dev-dashboard` and lists every checkout with its pill.
No actions yet; this task is done when the page is correct to look at.

**Files:**
- Modify: `desktop/src/renderer/index.tsx` (add the mode branch)
- Create: `desktop/src/renderer/dev/dashboard/DevDashboard.tsx`
- Create: `desktop/src/renderer/dev/dashboard/CheckoutRow.tsx`
- Create: `desktop/src/renderer/dev/dashboard/StatusPill.tsx`
- Create: `desktop/src/renderer/dev/dashboard/api.ts`
- Test: `desktop/tests/dev-dashboard-pill.test.tsx`

**Interfaces:**
- Consumes: `installHttpBridge` (Task 3), `/api/checkouts` (Task 2).
- Produces:
  - `type Checkout` in `api.ts`, mirroring Task 1's shape exactly.
  - `fetchCheckouts(): Promise<Checkout[]>`
  - `<StatusPill status={Status} />`
  - `<CheckoutRow checkout={Checkout} />`

- [ ] **Step 1: Write the failing pill test**

Create `desktop/tests/dev-dashboard-pill.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill, PILL_COPY } from '../src/renderer/dev/dashboard/StatusPill';

describe('StatusPill', () => {
  it('names the four states in words a non-developer can act on', () => {
    expect(PILL_COPY.unsaved.label).toBe('Unsaved work');
    expect(PILL_COPY.unpushed.label).toBe('Unpushed work');
    expect(PILL_COPY.pushed.label).toBe('Pushed');
    expect(PILL_COPY.safe.label).toBe('Safe to delete');
  });

  it('says out loud what deleting an unsaved checkout would cost', () => {
    // The pill is the whole point of the column; its title has to answer
    // "would I lose something", not just name a git state.
    expect(PILL_COPY.unsaved.hint).toMatch(/only copy|lose/i);
  });

  it('renders the label', () => {
    render(<StatusPill status="unsaved" />);
    expect(screen.getByText('Unsaved work')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-pill.test.tsx
```

Expected: FAIL — cannot resolve `StatusPill`.

- [ ] **Step 3: Write `StatusPill.tsx`**

Create `desktop/src/renderer/dev/dashboard/StatusPill.tsx`:

```tsx
import type { Status } from './api';

// The copy is the feature. A pill that says "0 ahead" makes the reader do the
// reasoning; these say what deleting the folder would cost.
export const PILL_COPY: Record<Status, { label: string; hint: string; cls: string }> = {
  unsaved: {
    label: 'Unsaved work',
    hint: 'Files here have never been saved to git. This is the only copy — deleting the folder loses them.',
    cls: 'border-danger/40 bg-danger/10 text-danger',
  },
  unpushed: {
    label: 'Unpushed work',
    hint: 'Saved to git, but not sent to GitHub. The commits exist only on this disk.',
    cls: 'border-warn/40 bg-warn/10 text-warn',
  },
  pushed: {
    label: 'Pushed',
    hint: 'On GitHub. Deleting this folder loses nothing permanent.',
    cls: 'border-edge-dim bg-inset text-fg-2',
  },
  safe: {
    label: 'Safe to delete',
    hint: 'Already merged, nothing uncommitted.',
    cls: 'border-edge-dim bg-inset text-fg-muted',
  },
};

export function StatusPill({ status }: { status: Status }) {
  const c = PILL_COPY[status];
  return (
    <span
      title={c.hint}
      className={`inline-flex items-center shrink-0 rounded-sm border px-1.5 py-0.5 text-3xs leading-none ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
```

If `text-danger` / `text-warn` are not real token classes in this codebase, run
`rg -n "danger|warn" src/renderer/index.css tailwind.config.* 2>/dev/null | head` and substitute
the names that exist. Do not invent tokens.

- [ ] **Step 4: Write `api.ts`**

Create `desktop/src/renderer/dev/dashboard/api.ts`:

```ts
// Typed wrappers over the helper's routes. Shapes mirror dev-dashboard/checkouts.mjs
// exactly — if one changes, change both.
export type Status = 'unsaved' | 'unpushed' | 'pushed' | 'safe';

export interface Checkout {
  id: string;
  path: string;
  name: string;
  branch: string | null;
  dirty: number;
  ahead: number;
  pushed: boolean;
  merged: boolean;
  status: Status;
  missing: boolean;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    // Surface the helper's own message rather than a guess about the cause.
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCheckouts(): Promise<Checkout[]> {
  return (await get<{ checkouts: Checkout[] }>('/api/checkouts')).checkouts;
}
```

- [ ] **Step 5: Write the row and the screen**

Create `desktop/src/renderer/dev/dashboard/CheckoutRow.tsx`:

```tsx
import type { Checkout } from './api';
import { StatusPill } from './StatusPill';

export function CheckoutRow({ checkout }: { checkout: Checkout }) {
  return (
    <div className="flex items-center gap-3 border-b border-edge-dim px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg">{checkout.name}</div>
        <div className="truncate text-3xs text-fg-muted">{checkout.branch ?? 'no branch (detached)'}</div>
      </div>
      <StatusPill status={checkout.status} />
    </div>
  );
}
```

Create `desktop/src/renderer/dev/dashboard/DevDashboard.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { fetchCheckouts, type Checkout } from './api';
import { CheckoutRow } from './CheckoutRow';

export function DevDashboard() {
  const [checkouts, setCheckouts] = useState<Checkout[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setCheckouts(await fetchCheckouts()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="flex-1 text-base text-fg">Dev dashboard</h1>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Refresh</Button>
        </header>

        <div className="layer-surface rounded-lg border border-edge-dim">
          {error && <ErrorState mode="recoverable" message={error} onRetry={() => void load()} />}
          {!error && checkouts === null && <LoadingState what="branch copies" />}
          {!error && checkouts?.map((c) => <CheckoutRow key={c.id} checkout={c} />)}
        </div>
      </div>
    </div>
  );
}
```

Check `ErrorState`'s real prop names in `src/renderer/components/ui/states.tsx:119` before
running — use whatever `ErrorStateProps` actually declares for the recoverable mode.

- [ ] **Step 6: Add the mode branch**

In `desktop/src/renderer/index.tsx`, immediately **before** the existing
`if ((import.meta.env.DEV || import.meta.env.VITE_WORKBENCH === '1') && __buddyMode === 'workbench') {`
line, insert:

```tsx
// Dev dashboard — a dev-only surface served in a plain browser by
// dev-dashboard/run.sh. Same shape as the workbench branch below: a URL-query
// fork inside the one real entry, which production builds tree-shake away
// because import.meta.env.DEV is statically false there.
if (import.meta.env.DEV && __buddyMode === 'dev-dashboard') {
  void (async () => {
    const [{ installHttpBridge }, { DevDashboard }, { ThemeProvider }, { ThemeBg }] = await Promise.all([
      import('./dev/dashboard/http-bridge'),
      import('./dev/dashboard/DevDashboard'),
      import('./state/theme-context'),
      import('./components/ThemeBg'),
    ]);
    // The bridge must install BEFORE ThemeProvider mounts: the provider reads
    // claude.appearance.get() on mount to learn the active theme.
    installHttpBridge();
    __mount.render(<ThemeProvider><ThemeBg /><DevDashboard /></ThemeProvider>);
  })();
} else
```

Confirm `ThemeBg`'s export name with `rg -n "^export" src/renderer/components/ThemeBg.tsx` and match it.

- [ ] **Step 7: Run the tests and look at the page**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-pill.test.tsx && npx tsc --noEmit
```

Then `bash dev-dashboard/run.sh` and open `http://127.0.0.1:5240/?mode=dev-dashboard`.

Expected: the page renders in Golden Sunbreak with the wallpaper behind it, and lists ~24 rows
with pills. **Stop here and show Destin** — this is the first look at the design, and the answers
to the remaining tasks assume this one is right.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/index.tsx src/renderer/dev/dashboard/ tests/dev-dashboard-pill.test.tsx
git commit -m "feat(dev-dashboard): the screen — every branch copy, with what deleting it would cost"
```

---

### Task 6: Launch and stop a dev instance

`scripts/run-dev.sh` ends in `npm run dev` in the **foreground** — it does not background itself.
So the helper spawns it as a child and keeps the handle, which makes "Running" exact rather than
inferred from a port probe, and makes Stop a kill of a pid the helper already owns.

**Files:**
- Create: `desktop/dev-dashboard/instances.mjs`
- Modify: `desktop/dev-dashboard/server.mjs` (three routes)
- Modify: `desktop/src/renderer/dev/dashboard/CheckoutRow.tsx`, `api.ts`
- Test: `desktop/tests/dev-dashboard-instances.test.ts`

**Interfaces:**
- Consumes: `checkoutId` (Task 1), `Checkout` (Task 5).
- Produces:
  - `takeOffset(taken: number[]): number` — lowest free offset from the pool `[50, 60, 70, 80, 90, 100, 110, 120]`.
  - `start(checkout, { workspaceRoot }): Instance` where `Instance = { id, offset, profile, pid, startedAt, status: 'starting'|'running'|'exited', exitCode: number|null }`
  - `stop(id): boolean`
  - `list(): Instance[]`
  - Routes `POST /api/dev/start` (body `{ id }`), `POST /api/dev/stop` (body `{ id }`), `GET /api/dev/instances`.
  - `api.ts` gains `startInstance(id)`, `stopInstance(id)`, `fetchInstances()`.

- [ ] **Step 1: Write the failing offset test**

Create `desktop/tests/dev-dashboard-instances.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { takeOffset, OFFSET_POOL } from '../dev-dashboard/instances.mjs';

describe('takeOffset', () => {
  it('gives the lowest free offset', () => {
    expect(takeOffset([])).toBe(OFFSET_POOL[0]);
    expect(takeOffset([50])).toBe(60);
    expect(takeOffset([50, 60, 70])).toBe(80);
  });

  it('never hands out an offset already in use', () => {
    // Two dev instances on the same offset SIGKILL each other's window — that
    // collision is possible by hand today and is the reason the pool exists.
    const taken = [50, 70];
    expect(taken).not.toContain(takeOffset(taken));
  });

  it('throws rather than colliding when the pool is exhausted', () => {
    expect(() => takeOffset([...OFFSET_POOL])).toThrow(/no free port offset/i);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-instances.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `instances.mjs`**

Create `desktop/dev-dashboard/instances.mjs`:

```js
// Owns every dev instance this helper started. WHY own the child rather than probe
// ports: run-dev.sh ends in `npm run dev` in the foreground, so the handle we get
// IS the instance. "Running" is then a fact, not an inference, and Stop kills a pid
// we already hold — never a pattern match, which has killed the wrong process on
// this machine before.
import { spawn } from 'node:child_process';
import path from 'node:path';

// Spaced by 10 so each instance's Vite / remote / debugger ports cannot overlap
// the next one's.
export const OFFSET_POOL = [50, 60, 70, 80, 90, 100, 110, 120];

export function takeOffset(taken) {
  const free = OFFSET_POOL.find((o) => !taken.includes(o));
  if (free === undefined) throw new Error('no free port offset: too many dev instances running');
  return free;
}

const instances = new Map(); // checkout id -> Instance

export function list() {
  return [...instances.values()];
}

export function start(checkout, { workspaceRoot }) {
  const existing = instances.get(checkout.id);
  if (existing && existing.status !== 'exited') return existing;

  const offset = takeOffset(list().filter((i) => i.status !== 'exited').map((i) => i.offset));
  const profile = `dash-${offset}`;

  // Argument array, never a shell string: nothing from a request is interpolated
  // into a command. The checkout was chosen by id from our own enumerated list, so
  // its path came from git, not from the network.
  const child = spawn(
    'bash',
    [
      path.join(workspaceRoot, 'scripts', 'run-dev.sh'),
      '--path', checkout.path,
      '--offset', String(offset),
      '--profile', profile,
      '--label', checkout.branch ?? checkout.name,
    ],
    { cwd: workspaceRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const inst = {
    id: checkout.id, offset, profile, pid: child.pid,
    startedAt: Date.now(), status: 'starting', exitCode: null, log: [],
  };

  const note = (buf) => {
    const text = String(buf);
    inst.log.push(text);
    if (inst.log.length > 200) inst.log.shift();
    // run-dev.sh prints this line once Electron is actually coming up.
    if (inst.status === 'starting' && /Starting YouCoded dev/.test(text)) inst.status = 'running';
  };
  child.stdout.on('data', note);
  child.stderr.on('data', note);
  child.on('exit', (code) => { inst.status = 'exited'; inst.exitCode = code; });

  instances.set(checkout.id, inst);
  return inst;
}

export function stop(id) {
  const inst = instances.get(id);
  if (!inst || inst.status === 'exited') return false;
  try {
    // Negative pid = the whole process group. run-dev.sh spawns Vite and Electron
    // as children; killing only the script would orphan both.
    process.kill(-inst.pid, 'SIGTERM');
  } catch {
    return false;
  }
  inst.status = 'exited';
  return true;
}

/** Kill everything we started. Called when the helper itself shuts down, so
 *  Ctrl-C does not leave orphaned Electron windows holding ports. */
export function stopAll() {
  for (const inst of list()) if (inst.status !== 'exited') stop(inst.id);
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-instances.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Mount the routes**

In `desktop/dev-dashboard/server.mjs`, add `import * as instances from './instances.mjs';` and a
JSON body reader:

```js
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 64 * 1024) reject(new Error('request body too large'));
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}
```

Then add these routes:

```js
      if (url.pathname === '/api/dev/instances' && req.method === 'GET') {
        json(res, 200, { instances: instances.list() });
        return;
      }
      if (url.pathname === '/api/dev/start' && req.method === 'POST') {
        const { id } = await readBody(req);
        // The id addresses a checkout in OUR list. A path from the request would
        // let a caller name any directory on the machine.
        const checkout = (await listCheckouts(repoDir)).find((c) => c.id === id);
        if (!checkout) { json(res, 404, { error: `no checkout with id ${id}` }); return; }
        json(res, 200, { instance: instances.start(checkout, { workspaceRoot: opts.workspaceRoot }) });
        return;
      }
      if (url.pathname === '/api/dev/stop' && req.method === 'POST') {
        const { id } = await readBody(req);
        json(res, 200, { stopped: instances.stop(id) });
        return;
      }
```

In `desktop/dev-dashboard/main.mjs`, add before `server.listen`:

```js
import * as instances from './instances.mjs';

// Ctrl-C must not leave orphaned dev instances holding ports — CLAUDE.md's
// "shut the dev server down" rule, enforced instead of remembered.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { instances.stopAll(); process.exit(0); });
}
```

- [ ] **Step 6: Wire the row's Launch/Stop control**

Add to `desktop/src/renderer/dev/dashboard/api.ts`:

```ts
export interface Instance {
  id: string; offset: number; profile: string; pid: number;
  startedAt: number; status: 'starting' | 'running' | 'exited'; exitCode: number | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(b.error ?? `request failed: ${res.status}`);
  }
  return res.json();
}

export const fetchInstances = async (): Promise<Instance[]> =>
  (await get<{ instances: Instance[] }>('/api/dev/instances')).instances;
export const startInstance = async (id: string): Promise<Instance> =>
  (await post<{ instance: Instance }>('/api/dev/start', { id })).instance;
export const stopInstance = async (id: string): Promise<boolean> =>
  (await post<{ stopped: boolean }>('/api/dev/stop', { id })).stopped;
```

In `CheckoutRow.tsx`, add an `instance` prop and the control:

```tsx
import { Button } from '../../components/ui';
import type { Checkout, Instance } from './api';
import { StatusPill } from './StatusPill';

export function CheckoutRow({ checkout, instance, onStart, onStop }: {
  checkout: Checkout;
  instance?: Instance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const live = instance && instance.status !== 'exited';
  return (
    <div className="flex items-center gap-3 border-b border-edge-dim px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg">{checkout.name}</div>
        <div className="truncate text-3xs text-fg-muted">{checkout.branch ?? 'no branch (detached)'}</div>
      </div>
      <StatusPill status={checkout.status} />
      {live ? (
        <div className="flex items-center gap-2">
          {/* The offset is shown because it is how Destin tells two open dev
              windows apart when both are on screen. */}
          <span className="text-3xs text-fg-muted">
            {instance!.status === 'starting' ? 'starting…' : `running · :${5173 + instance!.offset}`}
          </span>
          <Button variant="secondary" size="sm" onClick={() => onStop(checkout.id)}>Stop</Button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => onStart(checkout.id)}>Launch</Button>
      )}
    </div>
  );
}
```

In `DevDashboard.tsx`, poll instances every 2 seconds while any is live, and pass them down.
Add to the component:

```tsx
const [instances, setInstances] = useState<Instance[]>([]);

// Poll only while something is live: an idle page should be idle. The 2s cadence
// is fast enough that a window closed by hand updates before it is confusing.
useEffect(() => {
  let cancelled = false;
  const tick = async () => {
    try { const next = await fetchInstances(); if (!cancelled) setInstances(next); } catch { /* helper down; the row keeps its last state */ }
  };
  void tick();
  const live = instances.some((i) => i.status !== 'exited');
  if (!live) return () => { cancelled = true; };
  const t = setInterval(() => void tick(), 2000);
  return () => { cancelled = true; clearInterval(t); };
}, [instances.some((i) => i.status !== 'exited')]);
```

- [ ] **Step 7: Verify by hand**

Run `bash dev-dashboard/run.sh`, open the page, click **Launch** on one row.

Expected: the row says `starting…`, then `running · :5223`, and a **YouCoded Dev** window appears
titled with the branch name. Click **Stop**; the window closes and the row returns to Launch.
**Tell Destin before doing this** — it paints a real window on his desktop.

- [ ] **Step 8: Commit**

```bash
git add dev-dashboard/instances.mjs dev-dashboard/server.mjs dev-dashboard/main.mjs src/renderer/dev/dashboard/ tests/dev-dashboard-instances.test.ts
git commit -m "feat(dev-dashboard): launch and stop dev instances, ports assigned so they cannot collide"
```

---

### Task 7: The check suites

All six, with weight stated on the control rather than implied by position. The paid one is gated
three ways.

**Files:**
- Create: `desktop/dev-dashboard/suites.mjs`
- Create: `desktop/src/renderer/dev/dashboard/Disclosure.tsx`
- Create: `desktop/src/renderer/dev/dashboard/ConfirmDialog.tsx`
- Modify: `desktop/dev-dashboard/server.mjs`, `src/renderer/dev/dashboard/CheckoutRow.tsx`, `api.ts`
- Test: `desktop/tests/dev-dashboard-suites.test.ts`

**Interfaces:**
- Consumes: `Checkout` (Task 1), `readBody` (Task 6).
- Produces:
  - `SUITES: Suite[]` where `Suite = { key, label, weight, paid, argv(checkout, workspaceRoot): { cmd: string, args: string[], cwd: string, env?: object } }`
  - `runSuite(suiteKey, checkout, opts): Run` where `Run = { runId, suiteKey, checkoutId, status: 'running'|'passed'|'failed', exitCode: number|null, output: string, startedAt, endedAt }`
  - `getRun(runId): Run | undefined`, `listRuns(): Run[]`
  - Routes `GET /api/suites`, `POST /api/checks/run` (`{ id, suite, confirmSpend? }`), `GET /api/checks/runs`.

- [ ] **Step 1: Write the failing suite-registry test**

Create `desktop/tests/dev-dashboard-suites.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SUITES, suiteByKey, runSuite } from '../dev-dashboard/suites.mjs';

const checkout = { id: 'x', path: '/tmp/wt', name: 'wt', branch: 'feat/x' };

describe('the suite registry', () => {
  it('states every suite is weight so nothing looks equivalent to the 10-second one', () => {
    for (const s of SUITES) expect(s.weight).toBeTruthy();
  });

  it('marks exactly one suite paid', () => {
    expect(SUITES.filter((s) => s.paid).map((s) => s.key)).toEqual(['model-eval']);
  });

  it('builds every command as an argument array, never a shell string', () => {
    for (const s of SUITES) {
      const { cmd, args } = s.argv(checkout, '/ws');
      expect(typeof cmd).toBe('string');
      expect(Array.isArray(args)).toBe(true);
      // A shell metacharacter in a built argument means someone concatenated.
      expect(args.some((a: string) => /[;&|`$]/.test(a))).toBe(false);
    }
  });

  it('always passes a spend cap to the paid suite', () => {
    const { args } = suiteByKey('model-eval').argv(checkout, '/ws');
    expect(args).toContain('--max-spend');
  });
});

describe('runSuite', () => {
  it('refuses the paid suite without an explicit confirmation', async () => {
    await expect(runSuite('model-eval', checkout, { workspaceRoot: '/ws', confirmSpend: false }))
      .rejects.toThrow(/confirm/i);
  });

  it('refuses the paid suite when an API key is in the environment', async () => {
    // harness-eval.mjs refuses to start if OPENROUTER_API_KEY is readable by the
    // models it runs. The helper must not defeat that guard by passing one down.
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-test';
    try {
      await expect(runSuite('model-eval', checkout, { workspaceRoot: '/ws', confirmSpend: true }))
        .rejects.toThrow(/OPENROUTER_API_KEY/);
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-suites.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `suites.mjs`**

Create `desktop/dev-dashboard/suites.mjs`:

```js
// The check suites, each with its real weight on the label. WHY state the weight:
// the fast one is 10 seconds and the UI sweep is five minutes with several
// browsers running — side by side with no weight they look equivalent.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_SPEND_USD = '2.00';

export const SUITES = [
  {
    key: 'verify', label: 'Safety check', weight: '~10s', paid: false,
    argv: (c, ws) => ({ cmd: 'bash', args: [path.join(ws, 'scripts', 'verify.sh'), c.path], cwd: ws }),
  },
  {
    key: 'workbench-boot', label: 'Workbench boot check', weight: 'seconds', paid: false,
    argv: (c, ws) => ({ cmd: 'node', args: [path.join(ws, 'scripts', 'workbench-boot-check.mjs')], cwd: c.path }),
  },
  {
    key: 'docs-audit', label: 'Docs audit', weight: 'seconds', paid: false,
    argv: (c, ws) => ({ cmd: 'node', args: [path.join(ws, 'scripts', 'audit-anchors.mjs')], cwd: ws }),
  },
  {
    key: 'android', label: 'Android tests', weight: 'minutes', paid: false,
    // -x bundleWebUi is MANDATORY in a worktree: it transitively runs `npm ci`,
    // which is destructive against a hardlinked node_modules (CLAUDE.md).
    argv: (c) => ({
      cmd: './gradlew', args: ['test', '-x', 'bundleWebUi'], cwd: c.path,
      env: { JAVA_HOME: '/usr/lib/jvm/java-21-openjdk', ANDROID_HOME: `${process.env.HOME}/.android-sdk` },
    }),
  },
  {
    key: 'ui-sweep', label: 'UI screenshot sweep', weight: '~5 min · slows the machine', paid: false,
    argv: (c, ws) => ({ cmd: 'bash', args: [path.join(ws, 'scripts', 'ui-review', 'run-review.sh'), c.path], cwd: ws }),
  },
  {
    key: 'model-eval', label: 'Model evaluation', weight: 'minutes · ~$0.25 a cell', paid: true,
    argv: (c) => ({
      cmd: 'node',
      args: [
        path.join(c.path, 'desktop', 'test-engine', 'harness-eval.mjs'),
        '--plan', path.join(c.path, 'desktop', 'test-engine', 'eval-plans', 'prompt-doctrine.json'),
        '--max-spend', MAX_SPEND_USD,
      ],
      cwd: c.path,
    }),
  },
];

export const suiteByKey = (key) => {
  const s = SUITES.find((x) => x.key === key);
  if (!s) throw new Error(`no suite named ${key}`);
  return s;
};

const runs = new Map();
export const getRun = (id) => runs.get(id);
export const listRuns = () => [...runs.values()];

export async function runSuite(suiteKey, checkout, opts) {
  const suite = suiteByKey(suiteKey);
  const { workspaceRoot, confirmSpend } = opts;

  if (suite.paid) {
    if (!confirmSpend) throw new Error('this suite spends real money — confirm the spend first');
    // harness-eval.mjs refuses to start when OPENROUTER_API_KEY is in its
    // environment, because the models it runs can read it. Refuse here too rather
    // than letting the child fail confusingly.
    if (process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is set in this shell — the evaluator refuses to run with a key the models could read. Start the helper from a shell without it.');
    }
  }

  const { cmd, args, cwd, env } = suite.argv(checkout, workspaceRoot);
  const run = {
    runId: randomUUID(), suiteKey, checkoutId: checkout.id,
    status: 'running', exitCode: null, output: '', startedAt: Date.now(), endedAt: null,
  };
  runs.set(run.runId, run);

  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = (b) => {
    run.output += String(b);
    // Cap the buffer: the UI sweep prints a lot and this is held in memory.
    if (run.output.length > 512 * 1024) run.output = run.output.slice(-512 * 1024);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('exit', (code) => {
    run.exitCode = code;
    run.status = code === 0 ? 'passed' : 'failed';
    run.endedAt = Date.now();
  });
  child.on('error', (e) => {
    run.status = 'failed';
    run.exitCode = -1;
    // The real error, not a guess: a missing gradlew reads very differently
    // from a failing test and the message has to say which happened.
    run.output += `\ncould not start ${cmd}: ${e.message}\n`;
    run.endedAt = Date.now();
  });

  return run;
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-suites.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Mount the routes**

In `server.mjs`, add `import * as suites from './suites.mjs';` and:

```js
      if (url.pathname === '/api/suites' && req.method === 'GET') {
        json(res, 200, { suites: suites.SUITES.map(({ key, label, weight, paid }) => ({ key, label, weight, paid })) });
        return;
      }
      if (url.pathname === '/api/checks/runs' && req.method === 'GET') {
        json(res, 200, { runs: suites.listRuns() });
        return;
      }
      if (url.pathname === '/api/checks/run' && req.method === 'POST') {
        const { id, suite, confirmSpend } = await readBody(req);
        const checkout = (await listCheckouts(repoDir)).find((c) => c.id === id);
        if (!checkout) { json(res, 404, { error: `no checkout with id ${id}` }); return; }
        json(res, 200, { run: await suites.runSuite(suite, checkout, { workspaceRoot: opts.workspaceRoot, confirmSpend }) });
        return;
      }
```

- [ ] **Step 6: Write the local Disclosure and ConfirmDialog**

These are built **local to the dashboard**, not promoted to `components/ui/` — the app has no
shared version of either, and inventing an app-wide primitive from one call site sets a standard
on one example.

Create `desktop/src/renderer/dev/dashboard/Disclosure.tsx`:

```tsx
import { useState, type ReactNode } from 'react';

// Local to the dashboard on purpose. The app has no shared disclosure; existing
// code uses native <details> in two places and a bespoke CollapsibleBlock in a
// third. Promoting one is a decision for more than one call site.
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="text-3xs text-fg-muted underline decoration-dotted"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide details' : summary}
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-sm border border-edge-dim bg-well p-2 text-3xs text-fg-2">
          {children}
        </pre>
      )}
    </div>
  );
}
```

Create `desktop/src/renderer/dev/dashboard/ConfirmDialog.tsx`:

```tsx
import { Button, Dialog } from '../../components/ui';

// Wraps the shared Dialog shell, which is how every other confirm flow in this
// codebase does it (DiscardConfirmDialog, UnsavedChangesDialog, CloseSessionPrompt).
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="text-sm text-fg-2">{body}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
```

Check `Dialog`'s real props in `src/renderer/components/ui/Dialog.tsx` and match them — it may
take `isOpen`/`onDismiss` rather than the names above.

- [ ] **Step 7: Wire the suite menu and verdict into the row**

Add to `CheckoutRow.tsx` a `<select>` of suites plus a Run button, showing the latest run for this
checkout as one line — `Passed` / `2 checks failed` — with `<Disclosure summary="Show details">`
holding `run.output`. Clicking Run on the paid suite opens `<ConfirmDialog>` naming the estimate
before anything is spawned.

- [ ] **Step 8: Verify by hand and commit**

Run the page, run the safety check on one worktree, confirm the verdict line appears and details
expand. Then:

```bash
cd youcoded/desktop && npx tsc --noEmit && npx vitest run tests/dev-dashboard-suites.test.ts
git add dev-dashboard/suites.mjs dev-dashboard/server.mjs src/renderer/dev/dashboard/ tests/dev-dashboard-suites.test.ts
git commit -m "feat(dev-dashboard): the six check suites, weight on the label, spend confirmed before it is spent"
```

---

### Task 8: Multi-select and Request cleanup

Destin's addition to the `extras` answer, verbatim: *"i would like to be able to multi-select and
hit a 'request cleanup' button to start a new conversation with claude. fine if it just provides
a copyable prompt for now."* It copies. It does not delete, and it does not open anything.

**Files:**
- Create: `desktop/src/renderer/dev/dashboard/cleanup-prompt.ts`
- Modify: `desktop/src/renderer/dev/dashboard/DevDashboard.tsx`, `CheckoutRow.tsx`
- Test: `desktop/tests/dev-dashboard-cleanup-prompt.test.ts`

**Interfaces:**
- Consumes: `Checkout` (Task 5).
- Produces: `buildCleanupPrompt(selected: Checkout[]): string`

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/dev-dashboard-cleanup-prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCleanupPrompt } from '../src/renderer/dev/dashboard/cleanup-prompt';
import type { Checkout } from '../src/renderer/dev/dashboard/api';

const c = (over: Partial<Checkout>): Checkout => ({
  id: 'i', path: '/w/wt', name: 'wt', branch: 'feat/x', dirty: 0, ahead: 0,
  pushed: false, merged: false, status: 'safe', missing: false, ...over,
});

describe('buildCleanupPrompt', () => {
  it('names every selected checkout with its branch and path', () => {
    const out = buildCleanupPrompt([c({ name: 'alpha', branch: 'feat/a', path: '/w/alpha' })]);
    expect(out).toContain('alpha');
    expect(out).toContain('feat/a');
    expect(out).toContain('/w/alpha');
  });

  it('carries the measurements, not just the pill, so the reader can re-check them', () => {
    const out = buildCleanupPrompt([c({ status: 'unsaved', dirty: 40, ahead: 0 })]);
    expect(out).toMatch(/40/);
    expect(out).toMatch(/uncommitted/i);
  });

  it('warns explicitly when a selection would lose work', () => {
    const out = buildCleanupPrompt([c({ status: 'unsaved', dirty: 3 })]);
    expect(out).toMatch(/only copy|would lose/i);
  });

  it('does not warn when everything selected is safe', () => {
    const out = buildCleanupPrompt([c({ status: 'safe', merged: true, pushed: true })]);
    expect(out).not.toMatch(/only copy/i);
  });

  it('asks for a plan rather than instructing a deletion', () => {
    // A prompt that says "delete these" invites acting before checking.
    const out = buildCleanupPrompt([c({})]);
    expect(out).toMatch(/plan|check|review/i);
    expect(out).not.toMatch(/^delete /im);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-cleanup-prompt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `cleanup-prompt.ts`**

```ts
import type { Checkout } from './api';

const LINE: Record<Checkout['status'], (c: Checkout) => string> = {
  unsaved: (c) => `${c.dirty} uncommitted file(s) — git has no copy of these`,
  unpushed: (c) => `${c.ahead} commit(s) not on GitHub`,
  pushed: () => `pushed to GitHub, not yet merged`,
  safe: () => `merged and clean`,
};

/** The prompt a fresh conversation gets. It carries the MEASUREMENTS, not just the
 *  pill, so whoever reads it can re-check the conclusion rather than trusting it —
 *  and it asks for a plan, because a prompt that says "delete these" invites acting
 *  before checking. */
export function buildCleanupPrompt(selected: Checkout[]): string {
  const risky = selected.filter((c) => c.status === 'unsaved' || c.status === 'unpushed');
  const rows = selected
    .map((c) => `- ${c.name} (${c.branch ?? 'detached'}) at ${c.path} — ${LINE[c.status](c)}`)
    .join('\n');

  const warning = risky.length
    ? `\n${risky.length} of these hold the only copy of some work. Save or push that first; ` +
      `deleting them would lose it.\n`
    : '';

  return (
    `I want to clean up these ${selected.length} worktree(s) in the youcoded workspace:\n\n` +
    `${rows}\n${warning}\n` +
    `Please check each one yourself before doing anything — re-run the status rather than ` +
    `trusting the summary above — then give me a plan for which are safe to remove and what ` +
    `needs saving or pushing first. Don't delete anything until I say so.\n`
  );
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
cd youcoded/desktop && npx vitest run tests/dev-dashboard-cleanup-prompt.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the checkbox column and the selection bar**

In `CheckoutRow.tsx`, add `selected: boolean` and `onToggle: (id: string) => void` props and render
the shared `Checkbox` as the first cell. In `DevDashboard.tsx`, hold `selected: Set<string>` and
render a bar when it is non-empty:

```tsx
{selected.size > 0 && (
  <div className="mt-3 flex items-center gap-3 rounded-lg border border-edge-dim bg-panel px-3 py-2">
    <span className="flex-1 text-3xs text-fg-muted">{selected.size} selected</span>
    <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
    <Button
      variant="primary"
      size="sm"
      onClick={async () => {
        const prompt = buildCleanupPrompt(checkouts!.filter((c) => selected.has(c.id)));
        // Clipboard only. No delete button lives on this page: one click from a
        // red "unsaved work" pill is the most dangerous control it could carry.
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Copied' : 'Request cleanup'}
    </Button>
  </div>
)}
```

- [ ] **Step 6: Verify and commit**

```bash
cd youcoded/desktop && npx tsc --noEmit && npx vitest run tests/dev-dashboard-cleanup-prompt.test.ts
git add src/renderer/dev/dashboard/ tests/dev-dashboard-cleanup-prompt.test.ts
git commit -m "feat(dev-dashboard): multi-select and a copyable cleanup prompt — it copies, it never deletes"
```

---

### Task 9: Docs, MAP row, and the full verification

**Files:**
- Create: `desktop/dev-dashboard/README.md`
- Modify: `youcoded-dev/docs/MAP.md` (workspace repo — a separate commit on the workspace branch)

- [ ] **Step 1: Write the helper's README**

`desktop/dev-dashboard/README.md`: what it is, `bash dev-dashboard/run.sh`, the one URL, the port
table, the fact that it is read-only against `~/.claude`, and that `appearance.set` is a
deliberate no-op.

- [ ] **Step 2: Add the MAP row**

In the **workspace** repo (`youcoded-dev`, on the `design/dev-dashboard` branch), add to
`docs/MAP.md`:

| Subsystem | Entry points | Rule | Depth doc | Guard tests |
|---|---|---|---|---|
| Dev dashboard (dev-only) | `youcoded/desktop/dev-dashboard/run.sh`<br>`youcoded/desktop/dev-dashboard/server.mjs`<br>`youcoded/desktop/src/renderer/dev/dashboard/DevDashboard.tsx` | — | `youcoded/desktop/dev-dashboard/README.md` · `docs/active/design/2026-09-05-dev-dashboard/2026-09-05-dev-dashboard-design.md` | `youcoded/desktop/tests/dev-dashboard-*.test.{ts,tsx}` |

- [ ] **Step 3: Run the full verification**

```bash
bash scripts/verify.sh <worktree-path>
```

Expected: `OK — all checks passed.` If `knip` reports anything under `dev-dashboard/`, the entry
glob from Task 2 Step 6 is missing or misspelled.

- [ ] **Step 4: Commit and push both branches**

```bash
# in the youcoded worktree
git add dev-dashboard/README.md
git commit -m "docs(dev-dashboard): what it is, how to run it, and what it deliberately will not do"
git push -u origin feat/dev-dashboard
```

---

## Self-review notes

**Spec coverage.** Every section of the design maps to a task: three pieces → Tasks 2/4/5; theme
path → Task 3; four pills → Task 1; launching and tracking → Task 6; the suites → Task 7; request
cleanup → Task 8; security → Task 2 (guard) and Tasks 6/7 (id-addressing, argument arrays);
"what is being built new, and why locally" → Task 7 Step 6; knip consequence → Task 2 Step 6;
port → Global Constraints and Task 4.

**Names are consistent across tasks.** `classify`, `checkoutId`, `listCheckouts`, `guardRequest`,
`createServer`, `rewriteAssets`, `resolveAssetFile`, `installHttpBridge`, `takeOffset`, `start`,
`stop`, `stopAll`, `runSuite`, `suiteByKey`, `buildCleanupPrompt` are each defined once and used
under that exact name everywhere later.

**Three places the implementer must check the real code rather than trust this plan**, each
flagged inline: `ErrorState`'s prop names (Task 5 Step 5), `Dialog`'s prop names (Task 7 Step 6),
and whether `text-danger`/`text-warn` are real token classes (Task 5 Step 3). These are named
rather than guessed because inventing a prop or a token would compile in the plan and fail in the
tree.
