---
status: superseded-in-part
date: 2026-08-23
superseded_by: docs/active/handoffs/2026-08-27-perf-lab-session-status.md
spec: docs/active/specs/2026-08-23-perf-lab-and-optimization-loop-design.md
corrections: docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md
---

> ## ⚠️ SUPERSEDED IN PART — read the status doc first
>
> **`docs/active/handoffs/2026-08-27-perf-lab-session-status.md` is the current truth.**
> This plan records what we set out to build on 2026-08-23. All 16 tasks were
> implemented, but two things changed:
>
> 1. **The objective changed.** On 2026-08-27 Destin redirected the work: the
>    deliverable is a **repeatable per-surface stress suite** to cycle on, not a
>    one-time optimization pass. Two scenarios the plan never imagined
>    (`scenario-replay-stall`, `scenario-artifacts`) exist because of that.
> 2. **Several specifics in this plan are factually wrong about this machine and
>    this app** — eighteen verified corrections are logged in
>    `docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md`. Among
>    them: a selector that matches nothing, a toy model that could never answer,
>    a `node --test` invocation that fails, and assets the plan assumed existed.
>
> **Do not follow this plan's Task 16 experiment cards.** Measurement killed E1,
> E2 and E3 (startup is ~1s with 29ms of chores). The replacement list is in the
> status doc §4.
>
> Task checkboxes below are left unticked as written; treat the status doc's
> "what is built" table as the record of completion.

# Perf Lab & Autonomous Optimization Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-command, headless, reproducible performance-measurement rig for the desktop app, add permanent startup timing marks to the app, capture a baseline, then run an autonomous measure → change → re-measure loop whose kept wins ship as one `perf/optimization-pass` PR.

**Architecture:** Two repos, two commit streams. (1) `youcoded` branch `perf/optimization-pass` gets the in-app timing marks and every optimization. (2) The workspace repo `youcoded-dev` gets the rig under `scripts/perf-lab/` (dependency-free Node 26 scripts: Xvfb + Chrome DevTools Protocol over Node's built-in `WebSocket`, `/proc` sampling) and every report under `perf-reports/`. The rig builds the app production-style (`electron-builder --linux dir`), launches it under Xvfb against a **fixture HOME** (fake `~/.claude`, `~/.youcoded`, userData — never Destin's real ones), drives it over CDP, and emits one JSON report per run. A fake `claude` command in the fixture PATH stands in for Claude Code (sends the one hook message the app needs, then idles) so the rig can stream conversation lines into transcript files at zero API cost; native sessions use the already-downloaded CPU llama-server build and a 260K-parameter toy model.

**Tech Stack:** Node 26 (built-in `WebSocket`, `node:test`), Xvfb (`xorg-server-xvfb`), Electron 41 packaged with electron-builder 26, CDP (`Runtime.evaluate`, `Page.captureScreenshot`, `Input.dispatchMouseEvent`), `google-chrome-stable --headless` as a dependency-free pixel-diff engine, vitest for the app-side tests.

## Global Constraints

- **Live-app safety (overrides everything):** the rig NEVER touches the real `~/.config/youcoded`, `~/.claude`, `~/.youcoded`, or any running YouCoded process. Every launch uses `HOME=<fixture>` and `YOUCODED_PORT_OFFSET=100` (remote 10000, engine 10020 — clear of built 9900/9920 and dev 9950/9970). Process discovery is by fixture path, never by app name.
- **No `YOUCODED_PROFILE`.** A profile makes `main.ts:1339` skip the install-hooks chore that every real launch runs, so the rig would measure a boot no user gets. `HOME` alone isolates userData (`<fixture>/.config/youcoded`), the hook socket is per-process (`main.ts:191`), and the port offset moves every port — the profile adds nothing but a blind spot.
- **Measure what the user gets:** the fixture turns remote access ON (`<fixture>/.claude/youcoded-remote.json`, default is off) so the remote-server chore is real, not ~0.
- **Network-bound phases are flagged, never ranked as code cost:** `announcements` (GitHub fetch at boot, `announcement-service.ts:76`) and the release check (`ipc-handlers.ts:1716`) vary with WiFi. Reports carry them; the findings doc marks them `network`.
- **Xvfb has no GPU.** Anything paint-heavy is measured on a slow software path, so rankings of renderer-paint work can be backwards. Any experiment touching paint/blur/animation/compositing REQUIRES an on-screen spot-check by Destin before it counts — flag it, don't script it (CLAUDE.md: final-stage visual verification is his).
- **Blank window is a hard-reject metric:** `startup.blankWindowMs` = first contentful paint − window creation. The window is created visible today (`main.ts:612`); an experiment that shows it earlier but paints later makes the user stare at a blank box longer, and settled screenshots can't see that.
- **Repetition everywhere a number can veto:** cold start ×5 (7 for baseline), history ×5 inside one boot, workload ×3 inside one boot. `compare.mjs` reads the spread from those runs for every PRIMARY metric.
- **Budget:** a rig run aborts after `--max-minutes 45`; an autonomous session runs at most 8 experiments before reporting; the loop ends when Destin's approved card list is exhausted.
- **No official numbers from dev mode.** Every reported number comes from `release/linux-unpacked/youcoded` (packaged; `app.isPackaged === true`).
- **Zero visible UX/UI change** in product code. Screenshot parity gate rejects any pixel diff > 0.05% unless the ledger entry is tagged `ux-bugfix` for Destin's review.
- **Product changes stay cross-platform** (Windows/macOS/Linux). Rig may be Linux-only.
- **One PR.** All product work on `youcoded` branch `perf/optimization-pass`, worktree `worktrees/perf-lab/`. One commit per kept experiment, before/after numbers in the message.
- **Ship gates per experiment:** `bash scripts/verify.sh perf-lab` green → rig run → keep only if target metric median improves ≥ 5% AND beyond baseline spread AND no other primary metric regresses > 3% AND screenshots match. (Thresholds are Destin's to change; defaults chosen at plan time.)
- **Two human gates:** (1) after Round 0, the ranked findings + proposed experiment cards go to Destin, who approves/vetoes/reorders before any product code changes; (2) any `ux-bugfix` PAUSES the loop — the session reports the diff PNGs and waits, it does not carry the branch forward on top of a visible change.
- **Reports are JSON; screenshots are not committed** except the baseline set and any `ux-bugfix` pair under `perf-reports/review/`. `perf-reports/shots/` is gitignored.
- **Every non-trivial product edit carries a WHY comment** (Destin reads code through comments).
- **Node built-ins only** in `scripts/perf-lab/` — the workspace root has no `package.json` and must not gain one.
- Fixed constants (use exactly): profile `perf`, CDP port `9555`, diff-engine Chrome CDP port `9556`, Xvfb display `:99` at `1600x1000x24`, fixture root `<workspace>/scratch/perf-lab/` (gitignored via `scratch/`), perf log `<fixture>/perf-marks.jsonl`.

---

## Phase 0 — Prerequisites (Destin + one session)

### Task 0: Environment prerequisites and worktree

**Files:**
- Create: `worktrees/perf-lab/` (git worktree of `youcoded`, branch `perf/optimization-pass`)

- [ ] **Step 1: Destin installs Xvfb** (needs sudo; the session cannot). In the YouCoded chat prompt type:

```
! sudo pacman -S --needed xorg-server-xvfb
```

Verify: `which Xvfb xvfb-run` prints both paths.

- [ ] **Step 2: Sync and create the worktree**

```bash
cd /home/destin/youcoded-dev && bash setup.sh
cd /home/destin/youcoded-dev/youcoded && git fetch origin && git pull origin master
git worktree add ../worktrees/perf-lab -b perf/optimization-pass origin/master
cp -al /home/destin/youcoded-dev/youcoded/desktop/node_modules /home/destin/youcoded-dev/worktrees/perf-lab/desktop/node_modules
```

Expected: `git -C ../worktrees/perf-lab branch --show-current` → `perf/optimization-pass`. **Never symlink node_modules** (see CLAUDE.md — a symlink makes `verify.sh` lie and lets Gradle wipe the shared copy).

- [ ] **Step 3: Confirm the packaged build works once by hand**

```bash
cd /home/destin/youcoded-dev/worktrees/perf-lab/desktop
npx tsc && node -e "require('fs').cpSync('src/main/pty-worker.js','dist/main/pty-worker.js')" \
  && node -e "require('fs').mkdirSync('dist/renderer/data',{recursive:true})" \
  && node -e "require('fs').cpSync('src/renderer/data/skill-registry.json','dist/renderer/data/skill-registry.json')" \
  && npx vite build && npx electron-builder --linux dir
ls release/linux-unpacked/youcoded
```

Expected: the binary exists. If electron-builder complains about missing Linux deps for `deb/rpm/pacman`, that is fine — `dir` target does not need them; if it refuses entirely, pass `--config.linux.target=dir`.

- [ ] **Step 4: Confirm CDP is honored by the packaged binary** (the in-app `YOUCODED_DEVTOOLS_PORT` gate is dev-only; the Chromium argv switch is not):

```bash
mkdir -p /home/destin/youcoded-dev/scratch/perf-lab/probe-home
HOME=/home/destin/youcoded-dev/scratch/perf-lab/probe-home YOUCODED_PORT_OFFSET=100 \
  xvfb-run -n 99 -s "-screen 0 1600x1000x24" ./release/linux-unpacked/youcoded --remote-debugging-port=9555 --no-sandbox &
sleep 8; curl -s http://127.0.0.1:9555/json/list | head -c 600; kill %1
```

Expected: JSON with a `page` target whose `url` starts with `file://` and ends in `index.html`. If the list is empty, the switch is being filtered — fall back to adding `if (process.env.YOUCODED_DEVTOOLS_PORT)` (drop the `!app.isPackaged` condition) at `main.ts:1263` and record that in the ledger as rig-enabling, not an optimization.

- [ ] **Step 5: Commit nothing yet** — this task only proves the environment. Delete `scratch/perf-lab/probe-home`.

---

## Phase 1 — In-app timing marks (product code, `worktrees/perf-lab`)

### Task 1: Main-process perf marks module

**Files:**
- Create: `worktrees/perf-lab/desktop/src/main/perf-marks.ts`
- Test: `worktrees/perf-lab/desktop/tests/perf-marks.test.ts`

**Interfaces:**
- Produces: `perfMark(name: string): void` — appends `{"name","t","pid"}` JSON line to `$YOUCODED_PERF_LOG` when set; no-op otherwise. `t` is epoch ms (`Date.now()`), so the rig can align main-process marks with renderer `performance.timeOrigin` and its own spawn timestamp.

- [ ] **Step 1: Write the failing test**

```ts
// tests/perf-marks.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('perfMark', () => {
  let dir: string;
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('appends one JSON line per mark when YOUCODED_PERF_LOG is set', async () => {
    dir = mkdtempSync(join(tmpdir(), 'perf-marks-'));
    const file = join(dir, 'marks.jsonl');
    vi.stubEnv('YOUCODED_PERF_LOG', file);
    const { perfMark } = await import('../src/main/perf-marks');
    perfMark('main:a'); perfMark('main:b');
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.name)).toEqual(['main:a', 'main:b']);
    expect(typeof lines[0].t).toBe('number');
    expect(lines[0].pid).toBe(process.pid);
  });

  it('is a no-op when the env var is unset', async () => {
    vi.stubEnv('YOUCODED_PERF_LOG', '');
    const { perfMark } = await import('../src/main/perf-marks');
    expect(() => perfMark('main:x')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd /home/destin/youcoded-dev/worktrees/perf-lab/desktop && npx vitest run tests/perf-marks.test.ts`
Expected: FAIL — cannot find module `../src/main/perf-marks`.

- [ ] **Step 3: Implement**

```ts
// src/main/perf-marks.ts
// Startup timing marks for the perf lab (docs/active/specs/2026-08-23-perf-lab-*.md).
// WHY: the app had zero startup instrumentation, so nobody could say which boot
// chore was slow. Marks are written ONLY when YOUCODED_PERF_LOG names a file —
// in normal use this module costs one env read and nothing else.
// Sync append on purpose: a mark must survive a crash a millisecond later, and
// ~20 tiny writes per boot are far below anything a user could feel.
import fs from 'fs';

const PERF_LOG = process.env.YOUCODED_PERF_LOG || '';

export function perfMark(name: string): void {
  if (!PERF_LOG) return;
  try {
    fs.appendFileSync(PERF_LOG, JSON.stringify({ name, t: Date.now(), pid: process.pid }) + '\n');
  } catch { /* never let instrumentation break boot */ }
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run tests/perf-marks.test.ts` → 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/perf-lab && git add desktop/src/main/perf-marks.ts desktop/tests/perf-marks.test.ts && git commit -m "perf(instrumentation): opt-in main-process startup marks (YOUCODED_PERF_LOG)"
```

### Task 2: Place marks in the main-process boot chain

**Files:**
- Modify: `worktrees/perf-lab/desktop/src/main/main.ts` (module top after imports; `whenReady` block `~1281-1528`; `createWindow` `~786`; main-window `did-finish-load` `~703`)
- Test: `worktrees/perf-lab/desktop/tests/perf-marks-placement.test.ts`

**Interfaces:**
- Produces mark names (exact, the rig parses them): `main:module-start`, `main:when-ready`, `main:chore:<name>:done` for each of `rotate-log`, `install-hooks`, `hook-relay`, `legacy-cleanup`, `hook-reconcile`, `prompt-suggestion`, `retention-default`, `symlink-cleanup`, `stale-downloads`, `reconcile-mcp`, `announcements`, `remote-server`, `theme-protocol`, `auth-store`; then `main:create-window:start`, `main:create-window:done`, `main:main-window:did-finish-load`, `main:post-window:done` (end of the `whenReady` block).

- [ ] **Step 1: Write the failing source-pinning test** (same pattern as `tests/animation-frame-budget.test.ts`)

```ts
// tests/perf-marks-placement.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

// The perf lab (youcoded-dev/scripts/perf-lab) parses these names verbatim.
// Renaming or dropping one silently blanks a column in every future report.
const src = readFileSync(join(__dirname, '..', 'src', 'main', 'main.ts'), 'utf8');
const REQUIRED = [
  'main:module-start', 'main:when-ready',
  'main:chore:rotate-log:done', 'main:chore:install-hooks:done', 'main:chore:hook-relay:done',
  'main:chore:legacy-cleanup:done', 'main:chore:hook-reconcile:done', 'main:chore:prompt-suggestion:done',
  'main:chore:retention-default:done', 'main:chore:symlink-cleanup:done', 'main:chore:stale-downloads:done',
  'main:chore:reconcile-mcp:done', 'main:chore:announcements:done', 'main:chore:remote-server:done',
  'main:chore:theme-protocol:done', 'main:chore:auth-store:done',
  'main:create-window:start', 'main:create-window:done', 'main:main-window:did-finish-load', 'main:post-window:done',
];

describe('main-process perf marks are all present', () => {
  for (const name of REQUIRED) {
    it(name, () => { expect(src).toContain(`perfMark('${name}')`); });
  }
  it('create-window:start precedes the createWindow call in whenReady', () => {
    const a = src.indexOf(`perfMark('main:create-window:start')`);
    const b = src.indexOf('createWindow(isFirstRun ? firstRunManager : undefined)');
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a);
  });
});
```

- [ ] **Step 2: Run — expect 21 failures.** `npx vitest run tests/perf-marks-placement.test.ts`

- [ ] **Step 3: Add the marks.** Add `import { perfMark } from './perf-marks';` with the other local imports, then `perfMark('main:module-start');` as the first statement after the import block. In the `whenReady` block insert marks after each chore exactly like this (line numbers are from master; find by the code, not the number):

```ts
void app.whenReady().then(async () => {
  perfMark('main:when-ready');
  await rotateLog();
  perfMark('main:chore:rotate-log:done');
  // ...existing code...
  // after the `if (!process.env.YOUCODED_PROFILE) { ... install-hooks ... }` block:
  perfMark('main:chore:install-hooks:done');
  await hookRelay.start();
  perfMark('main:chore:hook-relay:done');
  // after cleanupLegacyYoucodedCore():
  perfMark('main:chore:legacy-cleanup:done');
  // after reconcileHooks():
  perfMark('main:chore:hook-reconcile:done');
  // after enforcePromptSuggestionDisabled():
  perfMark('main:chore:prompt-suggestion:done');
  // after seedCleanupPeriodDefault():
  perfMark('main:chore:retention-default:done');
  // after cleanupOrphanSymlinks():
  perfMark('main:chore:symlink-cleanup:done');
  // after cleanupStaleDownloads(...):
  perfMark('main:chore:stale-downloads:done');
  await reconcileMcp();
  perfMark('main:chore:reconcile-mcp:done');
  // after startAnnouncementService():
  perfMark('main:chore:announcements:done');
  await remoteServer.start();
  perfMark('main:chore:remote-server:done');
  // after registerThemeProtocol():
  perfMark('main:chore:theme-protocol:done');
  // after createAuthStore/registerMarketplaceApiHandlers/registerSocialHandlers:
  perfMark('main:chore:auth-store:done');
  perfMark('main:create-window:start');
  createWindow(isFirstRun ? firstRunManager : undefined);
  perfMark('main:create-window:done');
  // ...existing post-window setup...
  perfMark('main:post-window:done');   // last statement of the async block
});
```

In `createAppWindow` (where the existing main-window `did-finish-load` listener opens DevTools in dev, `~main.ts:703`), add for the main window only (`!opts?.buddy`):

```ts
    // Perf lab: when the renderer bundle has finished loading (not yet mounted).
    win.webContents.once('did-finish-load', () => perfMark('main:main-window:did-finish-load'));
```

Each mark goes AFTER the chore it names; keep the chore's `try/catch` intact (put the mark after the whole try/catch so a failed chore still gets timed).

- [ ] **Step 4: Run — expect pass.** `npx vitest run tests/perf-marks-placement.test.ts tests/perf-marks.test.ts`, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/main.ts desktop/tests/perf-marks-placement.test.ts && git commit -m "perf(instrumentation): mark every boot chore, window creation and first load"
```

### Task 3: Renderer marks

**Files:**
- Modify: `worktrees/perf-lab/desktop/src/renderer/index.tsx` (top, and just before `__mount.render(<Root />)`)
- Modify: `worktrees/perf-lab/desktop/src/renderer/App.tsx` (a mount effect near the top of `App`; inside the `session.list().then(...)` at `~App.tsx:1618`)
- Test: `worktrees/perf-lab/desktop/tests/perf-marks-renderer.test.ts`

**Interfaces:**
- Produces `performance.mark` names the rig reads via CDP: `yc:index-start`, `yc:root-render`, `yc:app-mounted`, `yc:sessions-listed`.

- [ ] **Step 1: Failing source-pinning test**

```ts
// tests/perf-marks-renderer.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
const R = join(__dirname, '..', 'src', 'renderer');
const index = readFileSync(join(R, 'index.tsx'), 'utf8');
const app = readFileSync(join(R, 'App.tsx'), 'utf8');
describe('renderer perf marks (read by youcoded-dev/scripts/perf-lab)', () => {
  it('index.tsx marks start and root render, in that order', () => {
    const a = index.indexOf(`performance.mark('yc:index-start')`);
    const b = index.indexOf(`performance.mark('yc:root-render')`);
    expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a);
  });
  it('App.tsx marks mount and sessions-listed', () => {
    expect(app).toContain(`performance.mark('yc:app-mounted')`);
    expect(app).toContain(`performance.mark('yc:sessions-listed')`);
  });
});
```

- [ ] **Step 2: Run — expect fail.** `npx vitest run tests/perf-marks-renderer.test.ts`

- [ ] **Step 3: Implement.** `index.tsx`: right after `import './platform-bootstrap';` add

```ts
// Perf lab startup marks (read over CDP by youcoded-dev/scripts/perf-lab). Free.
performance.mark('yc:index-start');
```

and immediately before the `__mount.render(<Root />)` line add `performance.mark('yc:root-render');`.

`App.tsx`: inside the `App` component body, next to its other top-level hooks, add

```tsx
  // Perf lab: React has mounted the app shell (first commit).
  useEffect(() => { performance.mark('yc:app-mounted'); }, []);
```

and inside the boot-time `window.claude.session.list().then((list: any[]) => {` callback at `~1618`, as its first statement: `performance.mark('yc:sessions-listed');`.

- [ ] **Step 4: Run tests + types.** `npx vitest run tests/perf-marks-renderer.test.ts && npx tsc --noEmit` → pass.

- [ ] **Step 5: Verify + commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh perf-lab
cd worktrees/perf-lab && git add desktop/src/renderer/index.tsx desktop/src/renderer/App.tsx desktop/tests/perf-marks-renderer.test.ts && git commit -m "perf(instrumentation): renderer boot marks (index-start, root-render, app-mounted, sessions-listed)"
```

---

## Phase 2 — The perf lab rig (`youcoded-dev/scripts/perf-lab/`)

File layout (all created in this phase):

```
scripts/perf-lab/
  README.md            usage + what each number means
  run.mjs              orchestrator (CLI entry)
  build.mjs            production build of a checkout → release/linux-unpacked
  fixture.mjs          generates the fixture HOME (idempotent, timestamp-relative)
  fake-claude.cjs      the stand-in `claude` binary copied into <fixture>/bin/claude
  launch.mjs           Xvfb + app spawn + CDP wait + process-family + kill
  cdp.mjs              tiny CDP client on Node's global WebSocket
  procs.mjs            /proc CPU + PSS sampling + noise gate
  metrics-startup.mjs  parse perf-marks.jsonl + renderer marks → phase table
  scenario-history.mjs history-reload measurements
  scenario-workload.mjs multi-session journey + in-page probe
  screenshots.mjs      capture + pixel diff (headless Chrome as diff engine)
  compare.mjs          keep/reject verdict between two reports
  tests/*.test.mjs     node:test unit tests for the pure parts
perf-reports/          committed JSON + md reports, LEDGER.md, review/ (baseline + ux-bugfix PNGs only)
perf-reports/shots/    gitignored working screenshots
scratch/perf-lab/      gitignored fixture HOME + copied desktop.log per boot
```

Run all rig tests with: `node --test scripts/perf-lab/tests/`.

### Task 4: CDP client + process sampling (pure helpers)

**Files:**
- Create: `scripts/perf-lab/cdp.mjs`, `scripts/perf-lab/procs.mjs`
- Test: `scripts/perf-lab/tests/procs.test.mjs`

**Interfaces:**
- Produces `cdp.mjs`: `listTargets(port) → Promise<Target[]>`; `waitForMainTarget(port, {timeoutMs=60000}) → Promise<Target>` (page whose `url` starts with `file://` and does NOT contain `mode=`); `connect(wsUrl) → Promise<Cdp>` where `Cdp = { send(method, params?) → Promise<result>, on(method, cb), evaluate(expr) → Promise<value>, close() }`. `evaluate` uses `Runtime.evaluate` with `{ returnByValue: true, awaitPromise: true }` and throws on `exceptionDetails`.
- Produces `procs.mjs`: `findFamily(needles: string[]) → number[]` (pids whose `/proc/<pid>/cmdline` contains any needle); `cpuSnapshot(pids) → Map<pid, ticks>`; `cpuPercent(before, after, seconds) → { totalPct, perPid }` (% of ONE core, HZ=100); `pssMb(pids) → { totalMb, perPid: {pid, type, mb}[] }` (type from `--type=` in cmdline, `main` if absent, `llama-server`/`node`/`other` by basename); `loadAvg1() → number`; `parseStatTicks(statLine) → number` (utime+stime, split after the LAST `)`); `parseSmapsPssKb(text) → number`.

- [ ] **Step 1: Failing tests for the pure parsers**

```js
// scripts/perf-lab/tests/procs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatTicks, parseSmapsPssKb, cpuPercent } from '../procs.mjs';

test('parseStatTicks sums utime+stime after the last paren', () => {
  const line = '1234 (you coded) helper) S 1 1 1 0 -1 4194560 100 0 0 0 250 75 0 0 20 0 30 0 5000 1 1 1';
  assert.equal(parseStatTicks(line), 325);
});
test('parseSmapsPssKb reads the Pss line', () => {
  assert.equal(parseSmapsPssKb('Rss:  10 kB\nPss:   4321 kB\nPss_Anon: 1 kB\n'), 4321);
});
test('cpuPercent is % of one core over the window', () => {
  const before = new Map([[1, 100], [2, 200]]);
  const after  = new Map([[1, 150], [2, 300]]);   // 150 ticks = 1.5 s of CPU over 10 s
  const r = cpuPercent(before, after, 10);
  assert.equal(r.totalPct, 15);
  assert.equal(r.perPid.get(2), 10);
});
```

- [ ] **Step 2: Run — expect fail.** `node --test scripts/perf-lab/tests/` (module not found).

- [ ] **Step 3: Implement `procs.mjs`**

```js
// scripts/perf-lab/procs.mjs — /proc-based CPU + memory sampling for the perf lab.
// Linux-only by design (the rig runs on Destin's Z13). HZ=100 matches
// scripts/measure-idle-cpu.mjs, whose parsing this mirrors.
import { readdirSync, readFileSync } from 'node:fs';
const HZ = 100;

export function parseStatTicks(line) {
  const rest = line.slice(line.lastIndexOf(')') + 2).split(' ');
  // after ")" the fields are: state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt utime stime
  return Number(rest[11]) + Number(rest[12]);
}
export function parseSmapsPssKb(text) {
  const m = /^Pss:\s+(\d+) kB/m.exec(text);
  return m ? Number(m[1]) : 0;
}
function cmdline(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'latin1').replace(/\0/g, ' '); } catch { return ''; }
}
/** pids whose cmdline contains ANY needle (fixture HOME or the unpacked app dir). */
export function findFamily(needles) {
  const out = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const c = cmdline(d);
    if (c && needles.some((n) => c.includes(n))) out.push(Number(d));
  }
  return out;
}
export function cpuSnapshot(pids) {
  const m = new Map();
  for (const pid of pids) {
    try { m.set(pid, parseStatTicks(readFileSync(`/proc/${pid}/stat`, 'utf8'))); } catch { /* exited */ }
  }
  return m;
}
export function cpuPercent(before, after, seconds) {
  const perPid = new Map(); let total = 0;
  for (const [pid, b] of before) {
    const a = after.get(pid); if (a === undefined) continue;
    const pct = ((a - b) / HZ / seconds) * 100;
    perPid.set(pid, pct); total += pct;
  }
  return { totalPct: total, perPid };
}
function procType(pid) {
  const c = cmdline(pid);
  const t = /--type=([a-z-]+)/.exec(c);
  if (t) return t[1];
  const exe = (c.split(' ')[0] || '').split('/').pop();
  if (exe === 'llama-server') return 'llama-server';
  if (exe === 'node') return c.includes('pty-worker') ? 'pty-worker' : c.includes('bin/claude') ? 'fake-claude' : 'node';
  return c.includes('linux-unpacked/youcoded') ? 'main' : 'other';
}
export function pssMb(pids) {
  const perPid = []; let total = 0;
  for (const pid of pids) {
    try {
      const kb = parseSmapsPssKb(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'));
      const mb = kb / 1024; total += mb;
      perPid.push({ pid, type: procType(pid), mb: Math.round(mb * 10) / 10 });
    } catch { /* exited */ }
  }
  return { totalMb: Math.round(total * 10) / 10, perPid };
}
export function loadAvg1() {
  return Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
}
/** Whole-machine CPU busy % over `seconds` (from /proc/stat), for the noise gate. */
export async function machineBusyPct(seconds) {
  const read = () => { const f = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number); const idle = f[3] + f[4]; const total = f.reduce((a, b) => a + b, 0); return { idle, total }; };
  const a = read(); await new Promise((r) => setTimeout(r, seconds * 1000)); const b = read();
  return 100 * (1 - (b.idle - a.idle) / (b.total - a.total));
}
```

- [ ] **Step 4: Implement `cdp.mjs`**

```js
// scripts/perf-lab/cdp.mjs — minimal Chrome DevTools Protocol client on Node 26's
// built-in WebSocket (no `ws` dependency — the workspace root has no package.json).
export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}
export async function waitForMainTarget(port, { timeoutMs = 60000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const targets = await listTargets(port);
      // Packaged app loads file://.../index.html; buddy windows add ?mode=… — exclude them.
      const main = targets.find((t) => t.type === 'page' && t.url.startsWith('file://') && !t.url.includes('mode='));
      if (main) return main;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`CDP main target not found on :${port} within ${timeoutMs}ms`);
}
export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const listeners = new Map();
    ws.addEventListener('open', () => resolve(api));
    ws.addEventListener('error', (e) => reject(new Error(`ws error: ${e.message || e}`)));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        for (const cb of listeners.get(msg.method)) cb(msg.params);
      }
    });
    const api = {
      send(method, params = {}) {
        return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
      },
      on(method, cb) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(cb); },
      async evaluate(expression) {
        const r = await api.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('evaluate threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result?.value;
      },
      close() { ws.close(); },
    };
  });
}
/** Poll `expr` (must return truthy when done) every `everyMs` until `timeoutMs`. */
export async function waitFor(cdp, expr, { timeoutMs = 30000, everyMs = 100 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await cdp.evaluate(expr);
    if (v) return v;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`waitFor timed out: ${expr.slice(0, 80)}`);
}
```

- [ ] **Step 5: Run tests — pass.** `node --test scripts/perf-lab/tests/` → 3 pass.

- [ ] **Step 6: Commit**

```bash
cd /home/destin/youcoded-dev && git add scripts/perf-lab/cdp.mjs scripts/perf-lab/procs.mjs scripts/perf-lab/tests/procs.test.mjs && git commit -m "perf-lab: CDP client + /proc CPU/PSS sampling helpers"
```

### Task 5: Production build step

**Files:**
- Create: `scripts/perf-lab/build.mjs`

**Interfaces:**
- Produces: `buildApp(checkoutDir, { skipIfFresh = true }) → Promise<{ binary, appDir, sha, branch, builtAt }>`; CLI `node scripts/perf-lab/build.mjs [<checkout>]` (default `worktrees/perf-lab`). `appDir` = `<checkout>/desktop/release/linux-unpacked`. "Fresh" = a `.perf-lab-build.json` in `release/` records `sha` + `dirty` hash equal to the current tree (`git rev-parse HEAD` + `git status --porcelain` hash).

- [ ] **Step 1: Implement**

```js
// scripts/perf-lab/build.mjs — production-style build of a youcoded checkout.
// WHY packaged: main.ts picks loadFile vs the Vite dev URL by app.isPackaged, and
// dev mode loads hundreds of unbundled modules — its startup numbers are fiction.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();

export function treeFingerprint(checkout) {
  const sha = sh('git', ['rev-parse', 'HEAD'], checkout);
  const dirty = sh('git', ['status', '--porcelain'], checkout);
  const diff = dirty ? sh('git', ['diff', 'HEAD'], checkout) : '';
  return { sha, branch: sh('git', ['branch', '--show-current'], checkout), dirty: createHash('sha1').update(dirty + diff).digest('hex').slice(0, 12) };
}
export async function buildApp(checkout = join(ROOT, 'worktrees', 'perf-lab'), { skipIfFresh = true } = {}) {
  const desktop = join(checkout, 'desktop');
  const appDir = join(desktop, 'release', 'linux-unpacked');
  const binary = join(appDir, 'youcoded');
  const stamp = join(desktop, 'release', '.perf-lab-build.json');
  const fp = treeFingerprint(checkout);
  if (skipIfFresh && existsSync(binary) && existsSync(stamp)) {
    const prev = JSON.parse(readFileSync(stamp, 'utf8'));
    if (prev.sha === fp.sha && prev.dirty === fp.dirty) return { binary, appDir, ...prev };
  }
  const t0 = Date.now();
  const node = (js) => sh('node', ['-e', js], desktop);
  sh('npx', ['tsc'], desktop);
  node("require('fs').cpSync('src/main/pty-worker.js','dist/main/pty-worker.js')");
  node("require('fs').mkdirSync('dist/renderer/data',{recursive:true})");
  node("require('fs').cpSync('src/renderer/data/skill-registry.json','dist/renderer/data/skill-registry.json')");
  sh('npx', ['vite', 'build'], desktop);
  sh('npx', ['electron-builder', '--linux', 'dir'], desktop);
  if (!existsSync(binary)) throw new Error(`build finished but ${binary} is missing`);
  const info = { ...fp, builtAt: new Date().toISOString(), buildMs: Date.now() - t0 };
  writeFileSync(stamp, JSON.stringify(info, null, 2));
  return { binary, appDir, ...info };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildApp(process.argv[2] ? resolve(process.argv[2]) : undefined, { skipIfFresh: !process.argv.includes('--force') });
  console.log(JSON.stringify(r, null, 2));
}
```

- [ ] **Step 2: Run it once** — `node scripts/perf-lab/build.mjs` → prints JSON with `binary` path; second run returns instantly (fresh). Expected build time 1–3 min.

- [ ] **Step 3: Commit** `git add scripts/perf-lab/build.mjs && git commit -m "perf-lab: production build step with tree-fingerprint freshness"`

### Task 6: Fixture HOME generator + fake `claude`

**Files:**
- Create: `scripts/perf-lab/fixture.mjs`, `scripts/perf-lab/fake-claude.cjs`
- Test: `scripts/perf-lab/tests/fixture.test.mjs`

**Interfaces:**
- Produces `fixture.mjs`: `ccProjectSlug(cwd)` (copy of `youcoded/desktop/src/main/slug-encoding.ts:44-48` — non-alphanumerics → `-`; paths here are < 200 chars so no hash tail); `transcriptLines({ sessionId, cwd, turns, startedAt }) → string[]`; `buildFixture(root, { engineSrc, ggufSrc }) → FixtureInfo` where `FixtureInfo = { home, bin, projects: { alpha, beta }, transcripts: { small, medium, huge }: { sessionId, slug, path, turns }, perfLog, userData, modelId }`. Idempotent: wipes and rebuilds `root/home` each call (fast; huge file ~30 MB).
- Produces `fake-claude.cjs`: copied to `<home>/bin/claude`, mode 755.

Fixture contents (exact):
- `home/.claude/toolkit-state/config.json` = `{"setup_completed": true}` (skips the first-run wizard, `first-run.ts:45-60`).
- `home/.claude/settings.json` = `{}`; `home/.claude/projects/<slug(alpha)>/{small,medium,huge}.jsonl` (`turns` 50 / 2,500 / 25,000 → lines = 2×turns).
- `home/.claude/youcoded-remote.json` = `{"enabled":true,"port":10000,"passwordHash":null,"trustTailscale":false,"keepAwakeHours":0,"everPaired":false}` — remote access defaults to OFF (`remote-config.ts:51`), which would zero the remote-server chore. Verify in the Task 7 smoke that `chore.remoteServer` is non-zero; if `remoteServer.start()` refuses without a password, note that in the README and leave it — a refused start is what a real never-paired install does too.
- `home/.youcoded/config.json` = `{"v":1,"engine":{"backend":"cpu","contextSize":4096,"cacheDir":"<home>/models"}}`; `home/.youcoded/providers.json` = the two built-ins (`local` + `openrouter`, no secretRef).
- `home/models/stories260K.gguf` — copied (not symlinked) from `/home/destin/.cache/huggingface/hub/models--ggml-org--models/snapshots/*/tinyllamas/stories260K.gguf` (follow the symlink; `fs.copyFileSync` does).
- `home/.config/youcoded/engine/b9992-cpu/` — `cp -al` of `/home/destin/.config/youcoded-dev/engine/b9992-cpu/` (includes `.complete`), so the app never downloads an engine. Read-only use of a dev-profile dir — allowed. (`<home>/.config/youcoded` is the app's userData under the fixture HOME — no profile, see Global Constraints.)
- `home/projects/alpha/README.md`, `home/projects/beta/README.md` — session cwds.
- `home/bin/claude` — the fake; `home/perf-marks.jsonl` — truncated to empty.

- [ ] **Step 1: Failing tests**

```js
// scripts/perf-lab/tests/fixture.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ccProjectSlug, transcriptLines } from '../fixture.mjs';

test('ccProjectSlug matches slug-encoding.ts for a Linux path', () => {
  assert.equal(ccProjectSlug('/home/destin/x/perf lab'), '-home-destin-x-perf-lab');
});
test('transcriptLines yields loadHistory-visible user+assistant pairs', () => {
  const lines = transcriptLines({ sessionId: 's1', cwd: '/p', turns: 3, startedAt: Date.UTC(2026, 0, 1) });
  assert.equal(lines.length, 6);
  const objs = lines.map((l) => JSON.parse(l));
  assert.equal(objs[0].type, 'user'); assert.ok(objs[0].promptId); assert.equal(objs[0].isMeta, false);
  assert.equal(objs[1].type, 'assistant'); assert.equal(objs[1].message.stop_reason, 'end_turn');
  assert.equal(new Set(objs.map((o) => o.uuid)).size, 6, 'uuids unique');
  assert.equal(objs[1].parentUuid, objs[0].uuid);
});
```

- [ ] **Step 2: Run — fail.** `node --test scripts/perf-lab/tests/`

- [ ] **Step 3: Implement `fixture.mjs`**

```js
// scripts/perf-lab/fixture.mjs — builds the frozen fake HOME the perf lab runs against.
// Everything the app touches under ~ (.claude, .youcoded, .config/youcoded)
// lives here, so a run can never reach Destin's real data (live-app-safety rule).
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));

export function ccProjectSlug(cwd) { return cwd.replace(/[^a-zA-Z0-9]/g, '-'); }

const WORDS = 'the quick brown fox jumps over the lazy dog while the perf lab measures every millisecond of the boot path and the history reload'.split(' ');
function prose(seed, words) {
  let s = seed; const out = [];
  for (let i = 0; i < words; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out.push(WORDS[s % WORDS.length]); }
  return out.join(' ');
}
/** Shapes match what session-browser.ts loadHistory() and the transcript watcher accept. */
export function transcriptLines({ sessionId, cwd, turns, startedAt }) {
  const lines = []; let parent = null;
  for (let i = 0; i < turns; i++) {
    const ts = new Date(startedAt + i * 60000);
    const u = randomUUID();
    lines.push(JSON.stringify({ type: 'user', uuid: u, parentUuid: parent, promptId: randomUUID(), isMeta: false, sessionId, cwd, timestamp: ts.toISOString(), message: { role: 'user', content: `Turn ${i + 1}: ${prose(i, 24)}` } }));
    const a = randomUUID();
    lines.push(JSON.stringify({ type: 'assistant', uuid: a, parentUuid: u, sessionId, cwd, timestamp: new Date(ts.getTime() + 5000).toISOString(), message: { role: 'assistant', model: 'claude-sonnet-4-5', stop_reason: 'end_turn', content: [{ type: 'text', text: prose(i + 7, 80) }] } }));
    parent = a;
  }
  return lines;
}

const SIZES = { small: 50, medium: 2500, huge: 25000 };
const ENGINE_SRC = '/home/destin/.config/youcoded-dev/engine/b9992-cpu';
const GGUF_GLOB_DIR = '/home/destin/.cache/huggingface/hub/models--ggml-org--models/snapshots';
function findGguf() {
  for (const snap of readdirSync(GGUF_GLOB_DIR)) { const p = join(GGUF_GLOB_DIR, snap, 'tinyllamas', 'stories260K.gguf'); if (existsSync(p)) return p; }
  throw new Error('stories260K.gguf not found under ' + GGUF_GLOB_DIR);
}

export function buildFixture(root, { engineSrc = ENGINE_SRC, ggufSrc = findGguf() } = {}) {
  const home = join(root, 'home');
  rmSync(home, { recursive: true, force: true });
  const mk = (...p) => { const d = join(home, ...p); mkdirSync(d, { recursive: true }); return d; };
  const w = (p, s) => writeFileSync(join(home, p), s);

  mk('.claude', 'toolkit-state'); w('.claude/toolkit-state/config.json', JSON.stringify({ setup_completed: true }));
  w('.claude/settings.json', '{}');
  // Remote access is OFF by default (remote-config.ts:51); turn it on so the remote-server chore is measured.
  w('.claude/youcoded-remote.json', JSON.stringify({ enabled: true, port: 10000, passwordHash: null, trustTailscale: false, keepAwakeHours: 0, everPaired: false }));
  const projects = { alpha: join(mk('projects', 'alpha')), beta: join(mk('projects', 'beta')) };
  w('projects/alpha/README.md', '# alpha\n'); w('projects/beta/README.md', '# beta\n');

  const slug = ccProjectSlug(projects.alpha);
  mk('.claude', 'projects', slug);
  const transcripts = {}; const now = Date.now();
  for (const [name, turns] of Object.entries(SIZES)) {
    const sessionId = randomUUID();
    const path = join(home, '.claude', 'projects', slug, `${sessionId}.jsonl`);
    // Timestamps relative to generation time, so "N days ago" labels are identical run-to-run.
    writeFileSync(path, transcriptLines({ sessionId, cwd: projects.alpha, turns, startedAt: now - 3 * 86400000 }).join('\n') + '\n');
    transcripts[name] = { sessionId, slug, path, turns };
  }

  mk('.youcoded'); const models = mk('models');
  w('.youcoded/config.json', JSON.stringify({ v: 1, engine: { backend: 'cpu', contextSize: 4096, cacheDir: models } }));
  w('.youcoded/providers.json', JSON.stringify({ v: 1, providers: [
    { id: 'local', type: 'local-engine', label: 'Local models (llama.cpp)', enabled: true },
    { id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true },
  ] }));
  copyFileSync(ggufSrc, join(models, 'stories260K.gguf'));

  const userData = mk('.config', 'youcoded');   // Electron userData for app name "youcoded" under this HOME
  mkdirSync(join(userData, 'engine'), { recursive: true });
  execFileSync('cp', ['-al', engineSrc, join(userData, 'engine', 'b9992-cpu')]);

  const bin = mk('bin');
  copyFileSync(join(HERE, 'fake-claude.cjs'), join(bin, 'claude'));
  chmodSync(join(bin, 'claude'), 0o755);
  const perfLog = join(home, 'perf-marks.jsonl'); writeFileSync(perfLog, '');
  return { home, bin, projects, transcripts, perfLog, userData, modelId: 'stories260K' };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildFixture(resolve(process.argv[2] || join(HERE, '..', '..', 'scratch', 'perf-lab'))), null, 2));
}
```

- [ ] **Step 4: Implement `fake-claude.cjs`** (CommonJS on purpose — it runs as a plain script from the fixture PATH) (must run as a plain script via `#!/usr/bin/env node`; the app resolves `claude` on PATH — `pty-worker.js:50-64` — and passes `CLAUDE_DESKTOP_SESSION_ID` + `CLAUDE_DESKTOP_PIPE` in env — `pty-worker.js:247-262`)

```js
#!/usr/bin/env node
// perf-lab fake `claude`: stands in for Claude Code so the app can be exercised
// with zero API spend. It does exactly what the app needs from CC at startup —
// one SessionStart hook message on the desktop pipe (what hook-scripts/relay.js
// would send) carrying session_id + transcript_path — then idles until killed.
// The rig streams "conversation" by appending JSONL lines to transcript_path;
// the app's transcript watcher tails it exactly as it would a real CC session.
const net = require('node:net'); const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const args = process.argv.slice(2);
const ri = args.indexOf('--resume');
const sessionId = ri >= 0 ? args[ri + 1] : crypto.randomUUID();
const cwd = process.cwd();
const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');            // ccProjectSlug, slug-encoding.ts:44
const dir = path.join(process.env.HOME, '.claude', 'projects', slug);
fs.mkdirSync(dir, { recursive: true });
const transcript = path.join(dir, `${sessionId}.jsonl`);
if (!fs.existsSync(transcript)) fs.writeFileSync(transcript, '');
const payload = {
  hook_event_name: 'SessionStart', session_id: sessionId, source: ri >= 0 ? 'resume' : 'startup',
  transcript_path: transcript, cwd, _desktop_session_id: process.env.CLAUDE_DESKTOP_SESSION_ID || '',
};
if (process.env.CLAUDE_DESKTOP_PIPE) {
  const c = net.createConnection(process.env.CLAUDE_DESKTOP_PIPE, () => c.end(JSON.stringify(payload) + '\n'));
  c.on('error', () => {});
}
process.stdout.write(`\x1b[2Jfake claude ${sessionId.slice(0, 8)} ready\r\n> `);
process.stdin.resume();                       // swallow typed input like a TUI would
process.stdin.on('data', () => {});
for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(sig, () => process.exit(0));
setInterval(() => {}, 1 << 30);               // stay alive
```

- [ ] **Step 5: Run tests — pass;** then build the fixture for real: `node scripts/perf-lab/fixture.mjs` → prints `FixtureInfo`; check `ls -la scratch/perf-lab/home/.claude/projects/*/` shows three `.jsonl` (≈60 KB / 3 MB / 30 MB) and `scratch/perf-lab/home/.config/youcoded/engine/b9992-cpu/.complete` exists.

- [ ] **Step 6: Hand-check the fake claude protocol** (5 min, prevents a day of confusion later): `printf '{"hook_event_name":"x"}' | CLAUDE_DESKTOP_PIPE=/tmp/nope node scripts/perf-lab/fake-claude.cjs & sleep 1; kill %1` must not crash (socket error swallowed).

- [ ] **Step 7: Commit** `git add scripts/perf-lab/fixture.mjs scripts/perf-lab/fake-claude.cjs scripts/perf-lab/tests/fixture.test.mjs && git commit -m "perf-lab: fixture HOME generator + fake claude stand-in"`

### Task 7: Launcher (Xvfb + app + CDP + kill)

**Files:**
- Create: `scripts/perf-lab/launch.mjs`

**Interfaces:**
- Produces: `startXvfb() → { proc, display: ':99' }` (idempotent — reuses a listening `:99`); `launchApp({ binary, appDir, fixture, cdpPort=9555 }) → Promise<App>` where `App = { proc, spawnedAt, pid, cdpPort, familyNeedles: [appDir, fixture.home], cdp: Cdp (connected to main window), target, kill(): Promise<void> }`. `kill` sends SIGTERM to the whole family (`findFamily(needles)`), waits 3 s, SIGKILLs stragglers, and removes `<fixture.userData>/SingletonLock` so the next launch is clean.
- Env for the app (exact): `HOME=fixture.home`, `XDG_CONFIG_HOME` **unset**, `WAYLAND_DISPLAY` **unset**, `YOUCODED_PROFILE` **unset** (see Global Constraints), `DISPLAY=:99`, `PATH=fixture.bin:process.env.PATH`, `YOUCODED_PORT_OFFSET='100'`, `YOUCODED_PERF_LOG=fixture.perfLog`, `YOUCODED_NATIVE='1'`, `ELECTRON_DISABLE_SECURITY_WARNINGS='1'`, and delete `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_EFFORT`. Args: `--remote-debugging-port=<cdpPort> --no-sandbox`.
- Produces `sweep(needles)`: SIGTERM then SIGKILL every process whose cmdline matches (`findFamily`), and remove `SingletonLock`. `launchApp` calls it BEFORE spawning, so a hung app from a crashed previous run can never be silently re-attached to.

- [ ] **Step 1: Implement**

```js
// scripts/perf-lab/launch.mjs — starts Xvfb (:99) and the packaged app against the fixture HOME.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { connect, waitForMainTarget } from './cdp.mjs';
import { findFamily } from './procs.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startXvfb(display = ':99') {
  // If a server is already on :99 (previous run), reuse it.
  const probe = spawn('xdpyinfo', ['-display', display], { stdio: 'ignore' });
  const ok = await new Promise((r) => probe.on('exit', (c) => r(c === 0)).on('error', () => r(false)));
  if (ok) return { proc: null, display };
  const proc = spawn('Xvfb', [display, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  await sleep(700);
  return { proc, display };
}

/** Kill anything left over from a previous run that matches the fixture/app paths. */
export async function sweep(needles, userData) {
  for (const p of findFamily(needles)) { try { process.kill(p, 'SIGTERM'); } catch {} }
  if (findFamily(needles).length) { await sleep(2000); for (const p of findFamily(needles)) { try { process.kill(p, 'SIGKILL'); } catch {} } }
  if (userData) rmSync(join(userData, 'SingletonLock'), { force: true });
}

export async function launchApp({ binary, appDir, fixture, cdpPort = 9555, display = ':99' }) {
  const env = { ...process.env };
  // No YOUCODED_PROFILE: a profile skips the install-hooks chore (main.ts:1339) and we must measure the boot users get.
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_EFFORT', 'XDG_CONFIG_HOME', 'WAYLAND_DISPLAY', 'YOUCODED_PROFILE']) delete env[k];
  Object.assign(env, {
    HOME: fixture.home, DISPLAY: display, PATH: `${fixture.bin}:${process.env.PATH}`,
    YOUCODED_PORT_OFFSET: '100', YOUCODED_PERF_LOG: fixture.perfLog,
    YOUCODED_NATIVE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  });
  await sweep([appDir, fixture.home], fixture.userData);   // never attach to a stale app from a crashed run
  const spawnedAt = Date.now();
  const proc = spawn(binary, [`--remote-debugging-port=${cdpPort}`, '--no-sandbox'], { env, cwd: fixture.home, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
  const target = await waitForMainTarget(cdpPort, { timeoutMs: 90000 });
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  const familyNeedles = [appDir, fixture.home];
  return {
    proc, spawnedAt, pid: proc.pid, cdpPort, target, cdp, familyNeedles,
    family: () => findFamily(familyNeedles),
    async kill() {
      try { cdp.close(); } catch {}
      const pids = findFamily(familyNeedles);
      for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch {} }
      await sleep(3000);
      for (const p of findFamily(familyNeedles)) { try { process.kill(p, 'SIGKILL'); } catch {} }
      rmSync(join(fixture.userData, 'SingletonLock'), { force: true });
    },
  };
}
```

- [ ] **Step 2: Smoke it** with a throwaway script (do not commit):

```bash
cd /home/destin/youcoded-dev && node -e "
import('./scripts/perf-lab/build.mjs').then(async ({buildApp}) => {
  const { buildFixture } = await import('./scripts/perf-lab/fixture.mjs');
  const { startXvfb, launchApp } = await import('./scripts/perf-lab/launch.mjs');
  const b = await buildApp(); const f = buildFixture('scratch/perf-lab'); await startXvfb();
  const app = await launchApp({ binary: b.binary, appDir: b.appDir, fixture: f });
  console.log('title:', await app.cdp.evaluate('document.title'), 'marks:', await app.cdp.evaluate('performance.getEntriesByType(\"mark\").map(m=>m.name)'));
  console.log('family:', app.family().length, 'pids');
  await app.kill();
});"
cat scratch/perf-lab/home/perf-marks.jsonl | head -30
```

Expected: title printed, marks include `yc:index-start … yc:sessions-listed`, family ≥ 5 pids, perf log has `main:module-start` … `main:post-window:done`. **If the first-run wizard shows instead** (marks fine but `document.body.innerText` contains "Welcome"/setup copy), the toolkit-state path differs — `rg -n toolkit-state youcoded/desktop/src/main/first-run.ts` and fix the fixture.

- [ ] **Step 3: Commit** `git add scripts/perf-lab/launch.mjs && git commit -m "perf-lab: Xvfb + packaged-app launcher with CDP attach and family kill"`

### Task 8: Startup metrics

**Files:**
- Create: `scripts/perf-lab/metrics-startup.mjs`
- Test: `scripts/perf-lab/tests/metrics-startup.test.mjs`

**Interfaces:**
- Produces: `parsePerfLog(text) → Map<name, epochMs>` (last occurrence wins); `startupTable({ spawnedAt, mainMarks, rendererMarks, timeOrigin, paint }) → StartupMetrics` where `rendererMarks` = `[{name, startTime}]` (ms since `timeOrigin`), `paint` = `[{name, startTime}]`. `StartupMetrics` (all ms from spawn): `{ whenReady, chores: {rotateLog, installHooks, hookRelay, legacyCleanup, hookReconcile, promptSuggestion, retentionDefault, symlinkCleanup, staleDownloads, reconcileMcp, announcements, remoteServer, themeProtocol, authStore} (each = duration of that chore), createWindow, didFinishLoad, indexStart, rootRender, firstPaint, firstContentfulPaint, appMounted, sessionsListed, postWindowDone }`; `collectStartup(app) → Promise<StartupMetrics>` reads the perf log + evaluates `({ timeOrigin: performance.timeOrigin, marks: performance.getEntriesByType('mark').map(m=>({name:m.name,startTime:m.startTime})), paint: performance.getEntriesByType('paint').map(p=>({name:p.name,startTime:p.startTime})) })`.

- [ ] **Step 1: Failing test**

```js
// scripts/perf-lab/tests/metrics-startup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePerfLog, startupTable } from '../metrics-startup.mjs';
test('startupTable converts marks to ms-from-spawn and chore durations', () => {
  const log = ['main:module-start', 'main:when-ready', 'main:chore:rotate-log:done', 'main:chore:install-hooks:done', 'main:create-window:start', 'main:create-window:done', 'main:main-window:did-finish-load', 'main:post-window:done']
    .map((name, i) => JSON.stringify({ name, t: 1000 + i * 100, pid: 1 })).join('\n');
  const m = startupTable({ spawnedAt: 900, mainMarks: parsePerfLog(log), timeOrigin: 1500,
    rendererMarks: [{ name: 'yc:index-start', startTime: 50 }, { name: 'yc:root-render', startTime: 60 }, { name: 'yc:app-mounted', startTime: 120 }, { name: 'yc:sessions-listed', startTime: 200 }],
    paint: [{ name: 'first-paint', startTime: 130 }, { name: 'first-contentful-paint', startTime: 140 }] });
  assert.equal(m.whenReady, 200);
  assert.equal(m.chores.rotateLog, 100);
  assert.equal(m.chores.installHooks, 100);
  assert.equal(m.createWindow, 100);            // start→done
  assert.equal(m.didFinishLoad, 800);
  assert.equal(m.appMounted, 720);              // 1500+120-900
  assert.equal(m.firstContentfulPaint, 740);
  assert.equal(m.sessionsListed, 800);
  assert.equal(m.blankWindowMs, 240);           // FCP 740 − createWindowAt 500: how long the user stares at an empty window
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement**

```js
// scripts/perf-lab/metrics-startup.mjs
import { readFileSync } from 'node:fs';
export function parsePerfLog(text) {
  const m = new Map();
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { const o = JSON.parse(line); m.set(o.name, o.t); } catch {} }
  return m;
}
const CHORES = [['rotateLog', 'rotate-log'], ['installHooks', 'install-hooks'], ['hookRelay', 'hook-relay'], ['legacyCleanup', 'legacy-cleanup'], ['hookReconcile', 'hook-reconcile'], ['promptSuggestion', 'prompt-suggestion'], ['retentionDefault', 'retention-default'], ['symlinkCleanup', 'symlink-cleanup'], ['staleDownloads', 'stale-downloads'], ['reconcileMcp', 'reconcile-mcp'], ['announcements', 'announcements'], ['remoteServer', 'remote-server'], ['themeProtocol', 'theme-protocol'], ['authStore', 'auth-store']];
export function startupTable({ spawnedAt, mainMarks, rendererMarks, timeOrigin, paint }) {
  const rel = (t) => (t === undefined ? null : Math.round(t - spawnedAt));
  const main = (n) => mainMarks.get(n);
  const r = (n) => { const e = rendererMarks.find((x) => x.name === n); return e ? rel(timeOrigin + e.startTime) : null; };
  const p = (n) => { const e = paint.find((x) => x.name === n); return e ? rel(timeOrigin + e.startTime) : null; };
  const chores = {}; let prev = main('main:when-ready');
  for (const [key, mark] of CHORES) { const t = main(`main:chore:${mark}:done`); chores[key] = t === undefined || prev === undefined ? null : Math.round(t - prev); if (t !== undefined) prev = t; }
  const cwStart = main('main:create-window:start'), cwDone = main('main:create-window:done');
  const fcp = p('first-contentful-paint'), cwAt = rel(cwStart);
  return {
    whenReady: rel(main('main:when-ready')), chores,
    createWindow: cwStart !== undefined && cwDone !== undefined ? Math.round(cwDone - cwStart) : null,
    createWindowAt: cwAt, didFinishLoad: rel(main('main:main-window:did-finish-load')), postWindowDone: rel(main('main:post-window:done')),
    indexStart: r('yc:index-start'), rootRender: r('yc:root-render'), firstPaint: p('first-paint'), firstContentfulPaint: fcp,
    appMounted: r('yc:app-mounted'), sessionsListed: r('yc:sessions-listed'),
    // The window is created visible (main.ts:612). This is the blank-box time — a hard-reject
    // metric because settled screenshots cannot see an experiment that lengthens it (e.g. E1).
    blankWindowMs: fcp !== null && cwAt !== null ? fcp - cwAt : null,
  };
}
export async function collectStartup(app, fixture) {
  const page = await app.cdp.evaluate(`({ timeOrigin: performance.timeOrigin, marks: performance.getEntriesByType('mark').map(m=>({name:m.name,startTime:m.startTime})), paint: performance.getEntriesByType('paint').map(p=>({name:p.name,startTime:p.startTime})) })`);
  return startupTable({ spawnedAt: app.spawnedAt, mainMarks: parsePerfLog(readFileSync(fixture.perfLog, 'utf8')), rendererMarks: page.marks, timeOrigin: page.timeOrigin, paint: page.paint });
}
```

- [ ] **Step 4: Run — pass. Commit** `git add scripts/perf-lab/metrics-startup.mjs scripts/perf-lab/tests/metrics-startup.test.mjs && git commit -m "perf-lab: startup phase table from main + renderer marks"`

### Task 9: History-reload scenario

**Files:**
- Create: `scripts/perf-lab/scenario-history.mjs`

**Interfaces:**
- Produces: `runHistoryScenario(app, fixture, { repeats = 5 }) → Promise<HistoryMetrics>`: for each size `small|medium|huge` → `{ runs: HistoryRun[], median: HistoryRun }` where `HistoryRun = { ipcLast10Ms, ipcAllMs, ipcAllCount, resumeFirstMessageMs, resumeStableMs, resumeMessageCount }`. Each size is measured `repeats` times inside the one boot (seconds each) so `compare.mjs` has a spread to judge against — a single sample cannot veto anything. Uses `window.claude.session.loadHistory(sessionId, slug, 10, false)` and `(…, 0, true)` timed in-page with `performance.now()`; then `window.claude.session.create({ name, cwd, skipPermissions: true, resumeSessionId })` (the fake claude reads `--resume <id>` and reports that id, so the app maps the session to the fixture transcript and replays it), then polls `document.querySelectorAll('.chat-scroll [data-message-id], .chat-scroll .message, .chat-scroll > div > div').length` — **the implementer must open `ChatView.tsx` around line 749 and pick the selector that counts rendered message bubbles**; stable = count unchanged for 1,000 ms. After each size, `window.claude.session.destroy(id)`.

- [ ] **Step 1: Implement**

```js
// scripts/perf-lab/scenario-history.mjs — how long does history take to come back?
import { waitFor } from './cdp.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Count rendered message bubbles. VERIFY this selector against ChatView.tsx (~line 749) before trusting numbers.
export const MESSAGE_COUNT_EXPR = `document.querySelectorAll('.chat-scroll [data-message-id]').length`;

const median = (a) => { const s = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const medianRun = (runs) => Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((r) => r[k]))]));

export async function runHistoryScenario(app, fixture, { repeats = 5 } = {}) {
  const out = {};
  for (const size of ['small', 'medium', 'huge']) {
    const runs = [];
    for (let rep = 0; rep < repeats; rep++) runs.push(await measureOnce(app, fixture, size));
    out[size] = { runs, median: medianRun(runs) };
  }
  return out;
}

async function measureOnce(app, fixture, size) {
  {
    const t = fixture.transcripts[size];
    const ipc = await app.cdp.evaluate(`(async () => {
      const t0 = performance.now(); const last = await window.claude.session.loadHistory(${JSON.stringify(t.sessionId)}, ${JSON.stringify(t.slug)}, 10, false); const t1 = performance.now();
      const all = await window.claude.session.loadHistory(${JSON.stringify(t.sessionId)}, ${JSON.stringify(t.slug)}, 0, true); const t2 = performance.now();
      return { ipcLast10Ms: Math.round(t1 - t0), ipcAllMs: Math.round(t2 - t1), ipcAllCount: all.length, last10: last.length };
    })()`);
    if (ipc.last10 === 0) throw new Error(`loadHistory returned 0 messages for ${size} — fixture line shape or slug is wrong`);
    const res = await app.cdp.evaluate(`(async () => {
      const t0 = performance.now();
      const s = await window.claude.session.create({ name: 'resume-${size}', cwd: ${JSON.stringify(fixture.projects.alpha)}, skipPermissions: true, resumeSessionId: ${JSON.stringify(t.sessionId)} });
      window.__perfResume = { id: s.id, t0 };
      return s.id;
    })()`);
    const first = await waitFor(app.cdp, `(${MESSAGE_COUNT_EXPR}) > 0 ? Math.round(performance.now() - window.__perfResume.t0) : 0`, { timeoutMs: 60000, everyMs: 25 });
    let lastCount = -1, stableSince = 0, stableAt = 0;
    for (let i = 0; i < 2400; i++) {
      const { n, now } = await app.cdp.evaluate(`({ n: ${MESSAGE_COUNT_EXPR}, now: Math.round(performance.now() - window.__perfResume.t0) })`);
      if (n !== lastCount) { lastCount = n; stableSince = now; } else if (now - stableSince >= 1000) { stableAt = stableSince; break; }
      await sleep(25);
    }
    await app.cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(res)})`);
    await sleep(500);
    return { ...ipc, resumeFirstMessageMs: first, resumeStableMs: stableAt, resumeMessageCount: lastCount };
  }
}
```

- [ ] **Step 2: Smoke it** (extend the Task 7 throwaway: after launch, `console.log(await runHistoryScenario(app, f))`). Expected: `ipcAllCount` = 100 / 5000 / 50000; `resumeMessageCount` > 0 for all three. If `resumeMessageCount` stays 0 while `ipc` works, the fake claude's SessionStart is not being adopted — check `<fixture>/.claude/desktop.log` for `session-id-mapping` lines and confirm `CLAUDE_DESKTOP_PIPE` is set in the fake's env (`cat /proc/<fake pid>/environ | tr '\0' '\n' | grep CLAUDE_DESKTOP`).

- [ ] **Step 3: Commit** `git add scripts/perf-lab/scenario-history.mjs && git commit -m "perf-lab: history reload scenario (IPC + visible resume timings)"`

### Task 10: Multi-session workload scenario + responsiveness probe

**Files:**
- Create: `scripts/perf-lab/scenario-workload.mjs`

**Interfaces:**
- Produces: `installProbe(cdp)` — installs `window.__perfProbe = { log: [] }` recording `['longtask', tRel, durationMs]` via `PerformanceObserver({entryTypes:['longtask']})` and `['frame-gap', tRel, gapMs]` from an rAF loop with a 40 ms threshold (lifted from `scripts/resize-bench.mjs`), plus `mark(label)`; `readProbe(cdp) → { longtaskCount, longtaskTotalMs, longtaskMaxMs, frameGapCount, frameGapMaxMs }`; `runWorkloadScenario(app, fixture, { cpuSampleSeconds = 40, keepSessions = false }) → Promise<WorkloadMetrics>` = `{ sessionsCreated, ccCreateMedianMs, nativeCreateMs, nativeFirstTokenMs, switchMedianMs, switchP95Ms, clickSwitches, ipcSwitches, streamedLines, probe: <readProbe>, cpuDuringPct, pssAfterMb, sessionIds? }`. Switch timing measures the **click** (in-page `el.click()` → double rAF); the bare IPC `switch` is the fallback only for pills hidden in the overflow menu, and the report says how many of each happened.
- Journey (exact): create 4 CC sessions (`alpha`,`beta` cwds alternating, `skipPermissions:true`) + 2 native sessions (`provider:'native', binding:{providerId:'local', modelId: fixture.modelId}, preset:'coder', skipPermissions:false`); wait for each CC session's "Initializing" overlay to clear (`!document.body.innerText.includes('Initializing session')`); send `window.claude.native.send(id, 'Once upon a time')` to one native session and time until `.chat-scroll` text grows (`nativeFirstTokenMs`); start a streamer that appends one assistant-turn JSONL line every 150 ms to **three** of the CC transcripts (paths: `<home>/.claude/projects/<slug(cwd)>/<claudeId>.jsonl` — the claude ids are what the fake generated; read them from `readdirSync` of that dir, newest files) for 40 s; meanwhile perform 40 switches round-robin through all 6 sessions by **clicking** the pill `[data-session-idx="i"]` in-page (`el.click()`; timed `performance.now()` before → double `requestAnimationFrame` after), falling back to `window.claude.session.switch(id)` only when the pill is not in the strip; sample family CPU over the 40 s; then open Settings (`[title="Settings"]`) and close it (click again), read PSS, and destroy the sessions unless `keepSessions`.

- [ ] **Step 1: Implement**

```js
// scripts/perf-lab/scenario-workload.mjs — the "real use" journey: 6 mixed sessions,
// concurrent streaming, repeated switching, responsiveness probe (long tasks / frame gaps).
import { appendFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from './cdp.mjs';
import { cpuSnapshot, cpuPercent, pssMb } from './procs.mjs';
import { ccProjectSlug, transcriptLines } from './fixture.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null; };

export async function installProbe(cdp) {
  await cdp.evaluate(`(() => { const t0 = performance.now(), log = []; window.__perfProbe = { t0, log, mark: (l) => log.push(['mark', Math.round(performance.now() - t0), l]) };
    let last = performance.now(); const tick = () => { const n = performance.now(); if (n - last > 40) log.push(['frame-gap', Math.round(n - t0), Math.round(n - last)]); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) log.push(['longtask', Math.round(e.startTime - t0), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] });
    return true; })()`);
}
export async function readProbe(cdp) {
  return cdp.evaluate(`(() => { const L = window.__perfProbe.log; const lt = L.filter(e => e[0] === 'longtask').map(e => e[2]); const fg = L.filter(e => e[0] === 'frame-gap').map(e => e[2]);
    return { longtaskCount: lt.length, longtaskTotalMs: lt.reduce((a, b) => a + b, 0), longtaskMaxMs: Math.max(0, ...lt), frameGapCount: fg.length, frameGapMaxMs: Math.max(0, ...fg) }; })()`);
}
async function clickSelector(cdp, selector) {
  const box = await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`selector not found: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function createSession(cdp, opts) {
  return cdp.evaluate(`(async () => { const t0 = performance.now(); const s = await window.claude.session.create(${JSON.stringify(opts)}); return { id: s.id, ms: Math.round(performance.now() - t0) }; })()`);
}

export async function runWorkloadScenario(app, fixture, { cpuSampleSeconds = 40, keepSessions = false } = {}) {
  await installProbe(app.cdp);
  const ids = [], ccMs = [];
  for (let i = 0; i < 4; i++) {
    const cwd = i % 2 ? fixture.projects.beta : fixture.projects.alpha;
    const r = await createSession(app.cdp, { name: `cc-${i}`, cwd, skipPermissions: true });
    ids.push(r.id); ccMs.push(r.ms);
    await waitFor(app.cdp, `!document.body.innerText.includes('Initializing session')`, { timeoutMs: 30000 });
  }
  const nat = [];
  for (let i = 0; i < 2; i++) {
    const r = await createSession(app.cdp, { name: `native-${i}`, cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native', binding: { providerId: 'local', modelId: fixture.modelId }, preset: 'coder' });
    ids.push(r.id); nat.push(r);
  }
  // First native token: engine spawn + model load + first stream chunk.
  const before = await app.cdp.evaluate(`document.querySelector('.chat-scroll')?.innerText.length ?? 0`);
  await app.cdp.evaluate(`window.claude.session.switch(${JSON.stringify(nat[0].id)})`);
  const tNat = Date.now();
  await app.cdp.evaluate(`window.claude.native.send(${JSON.stringify(nat[0].id)}, 'Once upon a time')`);
  await waitFor(app.cdp, `(document.querySelector('.chat-scroll')?.innerText.length ?? 0) > ${before + 20}`, { timeoutMs: 120000 });
  const nativeFirstTokenMs = Date.now() - tNat;

  // Streamer: append to the 3 newest CC transcripts (the fake claude created them).
  const files = [fixture.projects.alpha, fixture.projects.beta].flatMap((cwd) => { const d = join(fixture.home, '.claude', 'projects', ccProjectSlug(cwd)); return readdirSync(d).filter((f) => f.endsWith('.jsonl')).map((f) => ({ p: join(d, f), m: statSync(join(d, f)).mtimeMs, cwd })); })
    .sort((a, b) => b.m - a.m).slice(0, 3);
  let streamed = 0; const t0 = Date.now();
  const streamer = setInterval(() => { for (const f of files) { const [, line] = transcriptLines({ sessionId: 'live', cwd: f.cwd, turns: 1, startedAt: Date.now() }); appendFileSync(f.p, line + '\n'); streamed++; } }, 150);

  const pids = app.family(); const c0 = cpuSnapshot(pids);
  const switchMs = []; let clickSwitches = 0, ipcSwitches = 0;
  for (let i = 0; i < 40; i++) {
    const idx = i % ids.length;
    // Time the CLICK path (what the user does — React handlers, reducer, re-render), in-page so
    // CDP round-trip latency is not inside the number. Fall back to the IPC switch only when the
    // pill is not in the strip (overflow menu, SessionStrip.tsx:860-872) and say so in the report.
    const r = await app.cdp.evaluate(`(async () => {
      const el = document.querySelector('[data-session-idx="${idx}"]');
      const t0 = performance.now();
      if (el) el.click(); else await window.claude.session.switch(${JSON.stringify(ids[idx])});
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { ms: Math.round((performance.now() - t0) * 10) / 10, clicked: !!el };
    })()`);
    switchMs.push(r.ms); r.clicked ? clickSwitches++ : ipcSwitches++;
    await sleep(Math.max(0, 1000 - r.ms));
  }
  while (Date.now() - t0 < cpuSampleSeconds * 1000) await sleep(100);
  clearInterval(streamer);
  const cpu = cpuPercent(c0, cpuSnapshot(pids), (Date.now() - t0) / 1000);
  await clickSelector(app.cdp, '[title="Settings"]'); await sleep(800); await clickSelector(app.cdp, '[title="Settings"]'); await sleep(500);
  const probe = await readProbe(app.cdp);
  const pss = pssMb(app.family());
  if (!keepSessions) for (const id of ids) await app.cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`).catch(() => {});
  return { sessionsCreated: ids.length, ccCreateMedianMs: median(ccMs), nativeCreateMs: nat[0].ms, nativeFirstTokenMs, switchMedianMs: median(switchMs), switchP95Ms: p95(switchMs), clickSwitches, ipcSwitches, streamedLines: streamed, probe, cpuDuringPct: Math.round(cpu.totalPct * 10) / 10, pssAfterMb: pss.totalMb, pssBreakdown: pss.perPid, sessionIds: keepSessions ? ids : undefined };
}
```

The orchestrator runs this journey **3×** per report (sessions are destroyed at the end of each pass so passes are comparable) and reports `workload.runs` + `workload.median`. The `six-sessions` / `native-chat` screenshots are taken by the orchestrator during a separate, final pass that leaves its sessions open.

- [ ] **Step 2: Smoke it** (extend the throwaway). Expected: `sessionsCreated: 6`, `nativeFirstTokenMs` in the 2–30 s range (engine cold start on CPU; stories260K loads instantly), `streamedLines` ≈ 800, `switchMedianMs` single-digit, probe numbers present. Two likely snags, each with its check: (a) the native `modelId` may need the `.gguf` suffix or a different id — inspect `await app.cdp.evaluate('window.claude.native.listModels ? window.claude.native.listModels() : Object.keys(window.claude.native)')` and match what the catalog reports; (b) `data-session-idx` pills may be inside an overflow menu once 6 sessions are open (`SessionStrip.tsx:860-872`) — if the click fails for idx ≥ N, keep the IPC switch (already measured) and log the click as skipped; do not fake it.

- [ ] **Step 3: Commit** `git add scripts/perf-lab/scenario-workload.mjs && git commit -m "perf-lab: multi-session workload journey with responsiveness probe"`

### Task 11: Screenshot parity

**Files:**
- Create: `scripts/perf-lab/screenshots.mjs`
- Test: `scripts/perf-lab/tests/screenshots.test.mjs` (tests the diff engine against two synthetic PNGs it generates itself via headless Chrome)

**Interfaces:**
- Produces: `captureScreens(app, fixture, outDir) → Promise<{ [name]: pngPath }>` for names `welcome` (fresh boot, no sessions), `chat-medium` (after `session.create({resumeSessionId: medium})` and stable), `settings-open`, `native-chat`, `six-sessions` (taken by the orchestrator after the workload); before each capture, inject `const s=document.createElement('style'); s.id='__perf-freeze'; s.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(s)` and wait 300 ms; capture via `Page.captureScreenshot({format:'png'})`; remove the style after.
- Produces: `diffPngs(aPath, bPath) → Promise<{ total, differing, pct }>` using `google-chrome-stable --headless=new --remote-debugging-port=9556 about:blank`; in-page: two `Image`s from base64 data URLs → canvases → `getImageData` → count pixels where any channel differs by > 16. `pct = differing / total * 100`.
- Produces: `compareScreens(baselineDir, candidateDir) → { [name]: { pct, pass: pct <= 0.05 } }`.

- [ ] **Step 1: Failing test**

```js
// scripts/perf-lab/tests/screenshots.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffPngs, renderTestPng } from '../screenshots.mjs';
test('diffPngs counts changed pixels (needs google-chrome-stable)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'pl-shots-'));
  const a = join(d, 'a.png'), b = join(d, 'b.png');
  writeFileSync(a, await renderTestPng(100, 100, [{ x: 0, y: 0, w: 100, h: 100, color: '#fff' }]));
  writeFileSync(b, await renderTestPng(100, 100, [{ x: 0, y: 0, w: 100, h: 100, color: '#fff' }, { x: 0, y: 0, w: 10, h: 10, color: '#000' }]));
  const r = await diffPngs(a, b);
  assert.equal(r.total, 10000); assert.equal(r.differing, 100); assert.equal(r.pct, 1);
  assert.equal((await diffPngs(a, a)).differing, 0);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement**

```js
// scripts/perf-lab/screenshots.mjs — "the user must notice nothing" made mechanical.
// Pixel diff runs inside headless Chrome (canvas + getImageData) so the rig needs no PNG library.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, waitFor } from './cdp.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIFF_PORT = 9556;

async function withHeadlessChrome(fn) {
  const proc = spawn('google-chrome-stable', ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DIFF_PORT}`, '--user-data-dir=/tmp/perf-lab-diff-profile', 'about:blank'], { stdio: 'ignore' });
  try {
    let target; for (let i = 0; i < 60 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${DIFF_PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} if (!target) await sleep(250); }
    const cdp = await connect(target.webSocketDebuggerUrl); await cdp.send('Runtime.enable');
    try { return await fn(cdp); } finally { cdp.close(); }
  } finally { proc.kill('SIGKILL'); }
}
const b64 = (p) => readFileSync(p).toString('base64');
const DIFF_EXPR = (aB64, bB64) => `(async () => {
    const load = (b) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b; });
    const [A, B] = await Promise.all([load(${JSON.stringify(aB64)}), load(${JSON.stringify(bB64)})]);
    const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const a = px(A), b = px(B); let differing = 0;
    for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i]-b[i]) > 16 || Math.abs(a[i+1]-b[i+1]) > 16 || Math.abs(a[i+2]-b[i+2]) > 16) differing++; }
    const total = w * h; return { total, differing, pct: Math.round(differing / total * 10000) / 100 };
  })()`;
export async function diffPngs(aPath, bPath) {
  return withHeadlessChrome((cdp) => cdp.evaluate(DIFF_EXPR(b64(aPath), b64(bPath))));
}
/** Test helper: render rectangles to a PNG (base64→Buffer) in headless Chrome. */
export async function renderTestPng(w, h, rects) {
  const b = await withHeadlessChrome((cdp) => cdp.evaluate(`(() => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const g = c.getContext('2d');
    for (const r of ${JSON.stringify(rects)}) { g.fillStyle = r.color; g.fillRect(r.x, r.y, r.w, r.h); } return c.toDataURL('image/png').split(',')[1]; })()`));
  return Buffer.from(b, 'base64');
}
const FREEZE = `(() => { const s = document.createElement('style'); s.id = '__perf-freeze'; s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(s); return true; })()`;
const UNFREEZE = `(() => { document.getElementById('__perf-freeze')?.remove(); return true; })()`;
export async function capture(app, outDir, name) {
  mkdirSync(outDir, { recursive: true });
  await app.cdp.evaluate(FREEZE); await sleep(300);
  const { data } = await app.cdp.send('Page.captureScreenshot', { format: 'png' });
  await app.cdp.evaluate(UNFREEZE);
  const p = join(outDir, `${name}.png`); writeFileSync(p, Buffer.from(data, 'base64')); return p;
}
/** All screens in ONE headless-Chrome session (spawning it per screen was 5× the cost). */
export async function compareScreens(baselineDir, candidateDir, names) {
  return withHeadlessChrome(async (cdp) => {
    const out = {};
    for (const n of names) {
      const r = await cdp.evaluate(DIFF_EXPR(b64(join(baselineDir, `${n}.png`)), b64(join(candidateDir, `${n}.png`))));
      out[n] = { ...r, pass: r.pct <= 0.05 };
    }
    return out;
  });
}
export const SCREEN_NAMES = ['welcome', 'chat-medium', 'settings-open', 'native-chat', 'six-sessions'];
```

The orchestrator (Task 12) decides *when* each named screen is captured; this module only knows how.

- [ ] **Step 4: Run — pass. Commit** `git add scripts/perf-lab/screenshots.mjs scripts/perf-lab/tests/screenshots.test.mjs && git commit -m "perf-lab: screenshot capture + dependency-free pixel diff"`

### Task 12: Orchestrator + report

**Files:**
- Create: `scripts/perf-lab/run.mjs`, `scripts/perf-lab/README.md`
- Modify: `.gitignore` — add `perf-reports/shots/` (screenshots are working files; `scratch/` already covers the fixture). `perf-reports/*.json`, `*.md`, and `perf-reports/review/` stay tracked.

**Interfaces:**
- CLI: `node scripts/perf-lab/run.mjs [--checkout <dir>] [--runs 5] [--history-repeats 5] [--workload-repeats 3] [--only startup,history,workload,shots] [--force-build] [--label <text>] [--out perf-reports/] [--max-minutes 45]`. Writes `perf-reports/<YYYY-MM-DD>-<HHMM>-<sha7>[-label].json` and a sibling `.md` summary, plus screenshots under `perf-reports/shots/<same-stem>/` (gitignored). Exceeding `--max-minutes` aborts with exit 3 after killing the app family. Every exit path (success, error, Ctrl-C, timeout) runs the kill — `try/finally` around each boot plus `process.on('SIGINT')`.
- Per boot the report also records `errors: { desktopLogErrorLines }` — the count of `"level":"ERROR"` lines in `<fixture>/.claude/desktop.log` — and copies that log to `scratch/perf-lab/logs/<stem>-<boot>.log`. A boot that logged errors is not a clean measurement; `compare.mjs` prints the count and the findings doc must not rank a phase from an erroring boot.
- Report schema v1:

```json
{ "schemaVersion": 1, "label": "", "sha": "", "branch": "", "dirty": "", "timestamp": "", "machine": { "cpu": "", "ramGb": 0, "kernel": "", "node": "" },
  "noise": { "loadAvgBefore": 0, "machineBusyPctBefore": 0, "discardedRuns": 0 },
  "startup": { "runs": [ /* StartupMetrics + idle + errors */ ], "median": { /* every StartupMetrics key incl. blankWindowMs + chores.* */ } },
  "idle": { "pssMb": { "median": 0, "runs": [] }, "cpuPct": { "median": 0, "runs": [] }, "breakdownMedianRun": [] },
  "history": { "small": { "runs": [], "median": {} }, "medium": { "runs": [], "median": {} }, "huge": { "runs": [], "median": {} } },
  "workload": { "runs": [ /* WorkloadMetrics ×3 */ ], "median": { /* WorkloadMetrics incl. probe.* */ } },
  "network": ["chores.announcements", "releaseCheck"],
  "errors": { "coldStarts": [0], "scenarioBoot": 0 },
  "screens": { "dir": "", "names": [] } }
```

- Cold-start loop (per run, `--runs` times): noise gate (`loadAvg1() < 4` and `machineBusyPct(3) < 10`, else wait 30 s and retry up to 5×, counting discards) → `buildFixture` → `launchApp` → `waitFor` `yc:sessions-listed` mark → `collectStartup` → 10 s settle → CPU over 15 s (`cpuSnapshot` before/after on `app.family()`) → `pssMb` → count ERROR lines + copy `desktop.log` → `kill` (in `finally`). Record `{ ...startup, idlePssMb, idleCpuPct, errorLines }`.
- Scenario boot (once): fresh fixture → launch → capture `welcome` → `runHistoryScenario(app, fixture, { repeats })` (×5 inside) → resume `medium` once more and capture `chat-medium` → open settings, capture `settings-open`, close → `runWorkloadScenario` ×`--workload-repeats` (median + runs) → one more `runWorkloadScenario(…, { keepSessions: true })` for the `six-sessions` and `native-chat` captures (its numbers are NOT included in the median — screenshots perturb it) → error count + log copy → kill (in `finally`).
- Median helper for nested objects: `medianTree(runs)` (recursive over plain-object keys, `null` when no numeric samples).
- `network`: a constant list of report paths that are network-bound (`chores.announcements`; the release check is inside `postWindowDone`). The findings doc marks these `network` instead of ranking them.

- [ ] **Step 1: Implement `run.mjs`**

```js
#!/usr/bin/env node
// scripts/perf-lab/run.mjs — one command, one JSON report. See README.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { buildFixture } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { waitFor } from './cdp.mjs';
import { cpuSnapshot, cpuPercent, pssMb, loadAvg1, machineBusyPct } from './procs.mjs';
import { collectStartup } from './metrics-startup.mjs';
import { runHistoryScenario, MESSAGE_COUNT_EXPR } from './scenario-history.mjs';
import { runWorkloadScenario } from './scenario-workload.mjs';
import { capture, SCREEN_NAMES } from './screenshots.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes(`--${name}`);
const RUNS = Number(opt('runs', 5));
const ONLY = new Set((opt('only', 'startup,history,workload,shots')).split(','));
const CHECKOUT = resolve(opt('checkout', join(ROOT, 'worktrees', 'perf-lab')));
const OUT = resolve(opt('out', join(ROOT, 'perf-reports')));
const LABEL = opt('label', '');
const HISTORY_REPEATS = Number(opt('history-repeats', 5));
const WORKLOAD_REPEATS = Number(opt('workload-repeats', 3));
const MAX_MINUTES = Number(opt('max-minutes', 45));
const SCRATCH = join(ROOT, 'scratch', 'perf-lab');
const DEADLINE = Date.now() + MAX_MINUTES * 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checkDeadline = () => { if (Date.now() > DEADLINE) throw Object.assign(new Error(`--max-minutes ${MAX_MINUTES} exceeded`), { exitCode: 3 }); };
let liveApp = null;                                   // whatever is running right now, for the finally/SIGINT paths
const killLive = async () => { if (liveApp) { const a = liveApp; liveApp = null; await a.kill().catch(() => {}); } };
process.on('SIGINT', async () => { await killLive(); process.exit(130); });
function errorLines(fixture, stem, boot) {
  let text = ''; try { text = readFileSync(join(fixture.home, '.claude', 'desktop.log'), 'utf8'); } catch {}
  mkdirSync(join(SCRATCH, 'logs'), { recursive: true }); writeFileSync(join(SCRATCH, 'logs', `${stem}-${boot}.log`), text);
  return text.split('\n').filter((l) => l.includes('"level":"ERROR"')).length;
}
const log = (...a) => console.error(`[perf-lab ${new Date().toISOString().slice(11, 19)}]`, ...a);
const median = (a) => { const s = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
function medianTree(runs) {
  const out = {}; const keys = new Set(runs.flatMap((r) => Object.keys(r)));
  for (const k of keys) { const vals = runs.map((r) => r[k]); out[k] = typeof vals.find((v) => v !== null && v !== undefined) === 'object' ? medianTree(vals.filter(Boolean)) : median(vals); }
  return out;
}
async function noiseGate(noise) {
  for (let i = 0; i < 5; i++) {
    const la = loadAvg1(); const busy = await machineBusyPct(3);
    noise.loadAvgBefore = la; noise.machineBusyPctBefore = Math.round(busy * 10) / 10;
    if (la < 4 && busy < 10) return;
    log(`machine busy (load ${la}, ${busy.toFixed(1)}% cpu) — waiting 30s`); noise.discardedRuns++; await sleep(30000);
  }
  throw new Error('machine never went idle; refusing to take official numbers');
}
async function bootAndWait(build, fixture) {
  const app = await launchApp({ binary: build.binary, appDir: build.appDir, fixture });
  await waitFor(app.cdp, `performance.getEntriesByType('mark').some(m => m.name === 'yc:sessions-listed')`, { timeoutMs: 90000 });
  return app;
}
async function resumeAndSettle(app, fixture, size) {
  const t = fixture.transcripts[size];
  const id = await app.cdp.evaluate(`window.claude.session.create({ name: 'shot-${size}', cwd: ${JSON.stringify(fixture.projects.alpha)}, skipPermissions: true, resumeSessionId: ${JSON.stringify(t.sessionId)} }).then(s => s.id)`);
  await waitFor(app.cdp, `(${MESSAGE_COUNT_EXPR}) > 0`, { timeoutMs: 60000 }); await sleep(1500); return id;
}
async function clickTitle(app, title) {
  const box = await app.cdp.evaluate(`(() => { const el = document.querySelector('[title=${JSON.stringify(title)}]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`no element with title ${title}`);
  for (const type of ['mousePressed', 'mouseReleased']) await app.cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(800);
}

const report = { schemaVersion: 1, label: LABEL, timestamp: new Date().toISOString(),
  machine: { cpu: cpus()[0]?.model ?? '', ramGb: Math.round(totalmem() / 2 ** 30), kernel: release(), node: process.version },
  noise: { loadAvgBefore: 0, machineBusyPctBefore: 0, discardedRuns: 0 }, startup: null, idle: null, history: null, workload: null, screens: null };

log('building', CHECKOUT);
const build = await buildApp(CHECKOUT, { skipIfFresh: !has('force-build') });
Object.assign(report, { sha: build.sha, branch: build.branch, dirty: build.dirty });
const stem = `${report.timestamp.slice(0, 10)}-${report.timestamp.slice(11, 16).replace(':', '')}-${build.sha.slice(0, 7)}${LABEL ? '-' + LABEL.replace(/[^a-z0-9-]/gi, '-') : ''}`;
mkdirSync(OUT, { recursive: true });
await startXvfb();

report.network = ['chores.announcements', 'postWindowDone(releaseCheck)'];
report.errors = { coldStarts: [], scenarioBoot: null };
try {
if (ONLY.has('startup')) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    checkDeadline();
    await noiseGate(report.noise);
    const fixture = buildFixture(SCRATCH);
    const app = liveApp = await bootAndWait(build, fixture);
    try {
      const startup = await collectStartup(app, fixture);
      await sleep(10000);
      const pids = app.family(); const c0 = cpuSnapshot(pids); await sleep(15000); const cpu = cpuPercent(c0, cpuSnapshot(pids), 15);
      const pss = pssMb(app.family());
      const errs = errorLines(fixture, stem, `cold-${i + 1}`); report.errors.coldStarts.push(errs);
      runs.push({ ...startup, idlePssMb: pss.totalMb, idleCpuPct: Math.round(cpu.totalPct * 10) / 10, errorLines: errs, breakdown: pss.perPid });
      log(`cold start ${i + 1}/${RUNS}: sessionsListed ${startup.sessionsListed}ms, blank ${startup.blankWindowMs}ms, idle ${pss.totalMb}MB, ${cpu.totalPct.toFixed(1)}% cpu, ${errs} error lines`);
    } finally { await killLive(); await sleep(1500); }
  }
  const { breakdown: _b, ...rest } = medianTree(runs.map(({ breakdown, ...r }) => r));
  report.startup = { runs, median: rest };
  report.idle = { pssMb: { median: median(runs.map((r) => r.idlePssMb)), runs: runs.map((r) => r.idlePssMb) }, cpuPct: { median: median(runs.map((r) => r.idleCpuPct)), runs: runs.map((r) => r.idleCpuPct) }, breakdownMedianRun: runs[Math.floor(runs.length / 2)].breakdown };
}

if (ONLY.has('history') || ONLY.has('workload') || ONLY.has('shots')) {
  checkDeadline();
  await noiseGate(report.noise);
  const fixture = buildFixture(SCRATCH);
  const app = liveApp = await bootAndWait(build, fixture);
  try {
    const shotDir = join(OUT, 'shots', stem); const shots = {};
    const shot = async (name) => { if (ONLY.has('shots')) shots[name] = await capture(app, shotDir, name); };
    await shot('welcome');
    if (ONLY.has('history')) { report.history = await runHistoryScenario(app, fixture, { repeats: HISTORY_REPEATS }); log('history medians', JSON.stringify(Object.fromEntries(Object.entries(report.history).map(([k, v]) => [k, v.median])))); }
    if (ONLY.has('shots')) {
      const id = await resumeAndSettle(app, fixture, 'medium'); await shot('chat-medium');
      await clickTitle(app, 'Settings'); await shot('settings-open'); await clickTitle(app, 'Settings');
      await app.cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`); await sleep(500);
    }
    if (ONLY.has('workload')) {
      const runs = [];
      for (let i = 0; i < WORKLOAD_REPEATS; i++) { checkDeadline(); runs.push(await runWorkloadScenario(app, fixture)); log(`workload ${i + 1}/${WORKLOAD_REPEATS}: switch p95 ${runs[i].switchP95Ms}ms, long tasks ${runs[i].probe.longtaskTotalMs}ms`); }
      report.workload = { runs: runs.map(({ pssBreakdown, ...r }) => r), median: medianTree(runs.map(({ pssBreakdown, sessionIds, ...r }) => r)), pssBreakdownFirstRun: runs[0].pssBreakdown };
      if (ONLY.has('shots')) {
        // Separate pass whose numbers are NOT in the median: screenshots perturb timing.
        const shotPass = await runWorkloadScenario(app, fixture, { keepSessions: true });
        await shot('six-sessions');
        await app.cdp.evaluate(`window.claude.session.switch(${JSON.stringify(shotPass.sessionIds[4])})`); await sleep(800); await shot('native-chat');
      }
    }
    report.screens = { dir: shotDir, names: Object.keys(shots) };
    report.errors.scenarioBoot = errorLines(fixture, stem, 'scenario');
  } finally { await killLive(); }
}
} catch (e) {
  await killLive();
  console.error('[perf-lab] aborted:', e.message);
  process.exit(e.exitCode ?? 2);
}

const jsonPath = join(OUT, `${stem}.json`); writeFileSync(jsonPath, JSON.stringify(report, null, 2));
const m = report.startup?.median ?? {};
const md = [`# perf-lab ${stem}`, '', `sha ${report.sha} (${report.branch}${report.dirty ? ', dirty ' + report.dirty : ''}) — ${report.timestamp}`, '',
  '| metric | median |', '|---|---|',
  ...['whenReady', 'createWindowAt', 'blankWindowMs', 'didFinishLoad', 'firstContentfulPaint', 'appMounted', 'sessionsListed', 'postWindowDone'].map((k) => `| startup.${k} | ${m[k] ?? '—'} ms |`),
  ...Object.entries(m.chores ?? {}).map(([k, v]) => `| chore.${k}${k === 'announcements' ? ' (network)' : ''} | ${v ?? '—'} ms |`),
  `| idle PSS | ${report.idle?.pssMb.median ?? '—'} MB |`, `| idle CPU | ${report.idle?.cpuPct.median ?? '—'} % |`,
  ...Object.entries(report.history ?? {}).map(([s, h]) => `| history.${s} (median of ${h.runs.length}) | last10 ${h.median.ipcLast10Ms} ms · all ${h.median.ipcAllMs} ms · resume first ${h.median.resumeFirstMessageMs} ms · stable ${h.median.resumeStableMs} ms |`),
  ...(report.workload ? (({ median: w }) => [`| switch median / p95 (median of ${report.workload.runs.length}) | ${w.switchMedianMs} / ${w.switchP95Ms} ms |`, `| long tasks | ${w.probe.longtaskCount} (${w.probe.longtaskTotalMs} ms, max ${w.probe.longtaskMaxMs}) |`, `| frame gaps > 40ms | ${w.probe.frameGapCount} (max ${w.probe.frameGapMaxMs} ms) |`, `| native first token | ${w.nativeFirstTokenMs} ms |`, `| CPU during workload | ${w.cpuDuringPct} % |`, `| PSS after workload | ${w.pssAfterMb} MB |`])(report.workload) : []),
  '', `noise: load ${report.noise.loadAvgBefore}, busy ${report.noise.machineBusyPctBefore}%, discarded ${report.noise.discardedRuns}`,
  `errors (desktop.log ERROR lines): cold starts ${JSON.stringify(report.errors.coldStarts)}, scenario boot ${report.errors.scenarioBoot ?? '—'}`, ''].join('\n');
writeFileSync(join(OUT, `${stem}.md`), md);
console.log(jsonPath);
```

- [ ] **Step 2: Write `scripts/perf-lab/README.md`** — usage (the CLI line above), the env/port table from Global Constraints, what each metric means in one line each (copy from the report schema), the "never dev mode / never the live app" rule, and the troubleshooting notes from Tasks 7, 9, 10 (first-run wizard, session not adopted, native modelId, overflow pills).

- [ ] **Step 3: Full smoke run** `node scripts/perf-lab/run.mjs --runs 2 --label smoke` → prints a JSON path; open the `.md` beside it and confirm every row has a number. Fix whatever is `—` before continuing (that is the point of the smoke).

- [ ] **Step 4: Commit** (the smoke report is NOT committed — it means nothing; delete it) `rm perf-reports/*smoke*; printf '\nperf-reports/shots/\n' >> .gitignore; git add .gitignore scripts/perf-lab/run.mjs scripts/perf-lab/README.md && git commit -m "perf-lab: orchestrator, report writer, README"`

### Task 13: Keep/reject verdict

**Files:**
- Create: `scripts/perf-lab/compare.mjs`
- Test: `scripts/perf-lab/tests/compare.test.mjs`

**Interfaces:**
- Produces: `PRIMARY = ['startup.median.sessionsListed', 'startup.median.firstContentfulPaint', 'startup.median.blankWindowMs', 'idle.pssMb.median', 'idle.cpuPct.median', 'history.medium.median.resumeStableMs', 'history.huge.median.ipcLast10Ms', 'history.huge.median.resumeStableMs', 'workload.median.switchP95Ms', 'workload.median.probe.longtaskTotalMs', 'workload.median.pssAfterMb', 'workload.median.cpuDuringPct']` (all lower-is-better; every one has repeated runs behind it); `get(obj, path)`; `runsFor(report, path) → number[]` resolves the sibling `runs` array for any `…median.<key>` path (`startup.median.X` → `startup.runs[].X`; `history.<size>.median.X` → `history.<size>.runs[].X`; `workload.median.a.b` → `workload.runs[].a.b`; `idle.<k>.median` → `idle.<k>.runs`); `spreadPct(report, path)` = `(max-min)/median*100` over those runs (`0` if fewer than 2); `verdict(baseline, candidate, { target, improveMinPct=5, regressMaxPct=3, screens, uxBugfix }) → { keep, target: { path, base, cand, deltaPct, beyondSpread }, regressions: [{path, base, cand, deltaPct}], screens, errors: { base, cand }, reasons: string[] }`. Keep iff target `deltaPct <= -improveMinPct` AND `|deltaPct| > spreadPct(baseline,target)` AND no other PRIMARY path has `deltaPct > regressMaxPct + spreadPct` AND every screen `pass` (or `uxBugfix`). Also REJECT if the candidate's error-line counts exceed the baseline's (a boot that logs new errors is not a clean win). CLI: `node scripts/perf-lab/compare.mjs <baseline.json> <candidate.json> --target <path> [--ux-bugfix]`, prints a table and exits 0 on keep / 1 on reject.

- [ ] **Step 1: Failing test**

```js
// scripts/perf-lab/tests/compare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from '../compare.mjs';
const base = {
  startup: { runs: [{ sessionsListed: 1000, blankWindowMs: 200 }, { sessionsListed: 1050, blankWindowMs: 210 }, { sessionsListed: 980, blankWindowMs: 190 }], median: { sessionsListed: 1000, firstContentfulPaint: 500, blankWindowMs: 200 } },
  idle: { pssMb: { median: 400, runs: [400, 405] }, cpuPct: { median: 2, runs: [2, 2.1] } },
  history: { medium: { runs: [{ resumeStableMs: 300 }, { resumeStableMs: 310 }], median: { resumeStableMs: 300 } }, huge: { runs: [{ ipcLast10Ms: 200, resumeStableMs: 2000 }, { ipcLast10Ms: 210, resumeStableMs: 2100 }], median: { ipcLast10Ms: 200, resumeStableMs: 2000 } } },
  workload: { runs: [{ switchP95Ms: 20, probe: { longtaskTotalMs: 100 }, pssAfterMb: 600, cpuDuringPct: 30 }, { switchP95Ms: 24, probe: { longtaskTotalMs: 130 }, pssAfterMb: 605, cpuDuringPct: 31 }], median: { switchP95Ms: 20, probe: { longtaskTotalMs: 100 }, pssAfterMb: 600, cpuDuringPct: 30 } },
  errors: { coldStarts: [0, 0, 0], scenarioBoot: 0 },
};
const clone = () => JSON.parse(JSON.stringify(base));
test('a jittery workload metric does not veto inside its own spread', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.workload.median.probe.longtaskTotalMs = 125;   // +25%, but base spread is 30%
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).keep, true);
});
test('a longer blank window rejects an otherwise-faster boot', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.startup.median.blankWindowMs = 260;   // +30% blank box (E1 failure mode)
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false); assert.ok(v.regressions.some((r) => r.path === 'startup.median.blankWindowMs'));
});
test('new error lines reject', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.errors.coldStarts = [2, 0, 0];
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).keep, false);
});
test('keeps a real win with no regressions', () => {
  const c = clone(); c.startup.median.sessionsListed = 850;
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: { welcome: { pass: true } } });
  assert.equal(v.keep, true); assert.equal(v.target.deltaPct, -15);
});
test('rejects a win inside the baseline spread', () => {
  const c = clone(); c.startup.median.sessionsListed = 945;   // -5.5%, but spread is 7%
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} }).keep, false);
});
test('rejects when another primary metric regresses', () => {
  const c = clone(); c.startup.median.sessionsListed = 800; c.idle.pssMb.median = 460;
  const v = verdict(base, c, { target: 'startup.median.sessionsListed', screens: {} });
  assert.equal(v.keep, false); assert.equal(v.regressions[0].path, 'idle.pssMb.median');
});
test('rejects on a screenshot diff unless ux-bugfix', () => {
  const c = clone(); c.startup.median.sessionsListed = 800;
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: { welcome: { pass: false, pct: 2 } } }).keep, false);
  assert.equal(verdict(base, c, { target: 'startup.median.sessionsListed', screens: { welcome: { pass: false, pct: 2 } }, uxBugfix: true }).keep, true);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement**

```js
// scripts/perf-lab/compare.mjs — the keep/reject rule from the spec, as code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const PRIMARY = ['startup.median.sessionsListed', 'startup.median.firstContentfulPaint', 'startup.median.blankWindowMs', 'idle.pssMb.median', 'idle.cpuPct.median', 'history.medium.median.resumeStableMs', 'history.huge.median.ipcLast10Ms', 'history.huge.median.resumeStableMs', 'workload.median.switchP95Ms', 'workload.median.probe.longtaskTotalMs', 'workload.median.pssAfterMb', 'workload.median.cpuDuringPct'];
export const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
/** The per-run samples behind any `…median…` path: `<prefix>.median.<rest>` → `<prefix>.runs[].<rest>`; `idle.<k>.median` → `idle.<k>.runs`. */
export function runsFor(report, path) {
  const i = path.indexOf('.median');
  if (i < 0) return [];
  const prefix = path.slice(0, i), rest = path.slice(i + '.median'.length + 1);
  const runs = get(report, `${prefix}.runs`) ?? [];
  return (rest ? runs.map((r) => get(r, rest)) : runs).filter((x) => typeof x === 'number');
}
export function spreadPct(report, path) {
  const runs = runsFor(report, path); if (runs.length < 2) return 0;
  const med = get(report, path); return med ? ((Math.max(...runs) - Math.min(...runs)) / med) * 100 : 0;
}
const delta = (b, c) => (typeof b === 'number' && typeof c === 'number' && b !== 0 ? Math.round(((c - b) / b) * 1000) / 10 : null);
const errorTotal = (r) => (r.errors?.coldStarts ?? []).reduce((a, b) => a + b, 0) + (r.errors?.scenarioBoot ?? 0);
export function verdict(baseline, candidate, { target, improveMinPct = 5, regressMaxPct = 3, screens = {}, uxBugfix = false }) {
  const reasons = [];
  const errors = { base: errorTotal(baseline), cand: errorTotal(candidate) };
  if (errors.cand > errors.base) reasons.push(`candidate logged ${errors.cand} ERROR lines (baseline ${errors.base})`);
  const tb = get(baseline, target), tc = get(candidate, target), td = delta(tb, tc), ts = spreadPct(baseline, target);
  const beyondSpread = td !== null && Math.abs(td) > ts;
  if (td === null) reasons.push(`target ${target} missing in a report`);
  else if (td > -improveMinPct) reasons.push(`target improved only ${-td}% (< ${improveMinPct}%)`);
  else if (!beyondSpread) reasons.push(`target delta ${td}% is inside baseline spread ${ts.toFixed(1)}%`);
  const regressions = [];
  for (const p of PRIMARY) { if (p === target) continue; const d = delta(get(baseline, p), get(candidate, p)); if (d !== null && d > regressMaxPct + spreadPct(baseline, p)) regressions.push({ path: p, base: get(baseline, p), cand: get(candidate, p), deltaPct: d }); }
  if (regressions.length) reasons.push(`regressions: ${regressions.map((r) => `${r.path} +${r.deltaPct}%`).join(', ')}`);
  const failedScreens = Object.entries(screens).filter(([, s]) => s && s.pass === false);
  if (failedScreens.length && !uxBugfix) reasons.push(`screens differ: ${failedScreens.map(([n, s]) => `${n} ${s.pct}%`).join(', ')}`);
  return { keep: reasons.length === 0, target: { path: target, base: tb, cand: tc, deltaPct: td, beyondSpread }, regressions, screens, errors, reasons };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [b, c] = process.argv.slice(2, 4).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const i = process.argv.indexOf('--target'); const target = i > 0 ? process.argv[i + 1] : PRIMARY[0];
  let screens = {};
  if (b.screens?.dir && c.screens?.dir) { const { compareScreens } = await import('./screenshots.mjs'); screens = await compareScreens(b.screens.dir, c.screens.dir, c.screens.names); }
  const v = verdict(b, c, { target, screens, uxBugfix: process.argv.includes('--ux-bugfix') });
  console.log(`target ${target}: ${v.target.base} → ${v.target.cand} (${v.target.deltaPct}%)`);
  for (const p of PRIMARY) console.log(`  ${p.padEnd(40)} ${String(get(b, p)).padStart(9)} → ${String(get(c, p)).padStart(9)}  ${delta(get(b, p), get(c, p)) ?? '—'}%`);
  for (const [n, s] of Object.entries(screens)) console.log(`  screen ${n}: ${s.pct}% ${s.pass ? 'ok' : 'DIFF'}`);
  console.log(v.keep ? 'VERDICT: KEEP' : `VERDICT: REJECT — ${v.reasons.join('; ')}`);
  process.exit(v.keep ? 0 : 1);
}
```

- [ ] **Step 4: Run — pass. Commit** `git add scripts/perf-lab/compare.mjs scripts/perf-lab/tests/compare.test.mjs && git commit -m "perf-lab: keep/reject verdict with spread-aware thresholds"`

### Task 14: Repeatability check

- [ ] **Step 1:** With the machine idle, run `node scripts/perf-lab/run.mjs --runs 5 --label repeat-a` then `--label repeat-b`.
- [ ] **Step 2:** `node scripts/perf-lab/compare.mjs perf-reports/*repeat-a.json perf-reports/*repeat-b.json --target startup.median.sessionsListed` → expect `REJECT` with reason "improved only ~0%" and **no** regressions and all screens `ok`. If a screen differs between two identical builds, the screen is non-deterministic (a clock, a random tip, a blinking element) — find it in the PNG, then either mask it (add a selector list to `FREEZE` that sets `visibility:hidden`) or capture at a moment it is stable. If any PRIMARY metric's spread exceeds 10%, raise `--runs` to 7 for that metric class and note it in the README.
- [ ] **Step 3: Commit** the two reports (JSON + md only — shots are gitignored) + any fixes: `git add perf-reports/*.json perf-reports/*.md scripts/perf-lab .gitignore && git commit -m "perf-lab: repeatability verified (two identical-build runs agree)"` and **push** `git push origin master`.

---

## Phase 3 — Round 0 baseline and the loop handoff

### Task 15: Baseline + ranked findings

- [ ] **Step 1:** `node scripts/perf-lab/run.mjs --runs 7 --label baseline` (machine idle).
- [ ] **Step 2:** Write `perf-reports/2026-MM-DD-baseline-findings.md`: the `.md` summary table, then a ranked list "where the time goes" — for startup, sort `chores.*` + `createWindow` + (`didFinishLoad − createWindowAt`) + (`appMounted − didFinishLoad`) + (`sessionsListed − appMounted`) descending, **marking `announcements` and the release check as `network` (excluded from the ranking — WiFi, not code)** and noting the baseline's error-line counts (must be 0; if not, the erroring phase is unranked until the error is understood); for history, the three sizes' `resumeStableMs` vs `ipcAllMs` (a large gap = renderer cost, not disk); for workload, `longtaskTotalMs` and `switchP95Ms`; for memory, `breakdownMedianRun` by type. Each line ends with the file the spec's Part 3 points at for that phase. Finish with a **proposed experiment list** (from the Task 16 cards, reordered by the measured ranking; paint-related cards flagged "needs on-screen check").
- [ ] **Step 3:** Create `perf-reports/LEDGER.md` with the header below and a first row for the baseline. Copy the baseline screenshots to `perf-reports/review/baseline/`. Commit + push.
- [ ] **Step 4: STOP — human gate.** Present the findings doc and the proposed experiment list to Destin. He approves, vetoes, or reorders cards (E1 changes what the app shows during boot; E6/E7 touch the Settings drawer — product calls, not the session's). No product code changes until he answers. Record his approved list at the top of `LEDGER.md`.

```markdown
# Perf loop ledger
| # | date | experiment | target metric | hypothesis | base → cand (Δ%) | screens | verdict | commit |
|---|---|---|---|---|---|---|---|---|
| 0 | 2026-MM-DD | baseline | — | — | — | — | — | <sha7> |
```

### Task 16: Operating manual for the autonomous session

**Files:**
- Create: `docs/active/handoffs/2026-MM-DD-perf-loop-operating-manual.md`

- [ ] **Step 1: Write the manual** with exactly these sections:

1. **Non-negotiables** — copy the Global Constraints verbatim.
2. **Per-experiment procedure** (the loop):
   ```
   a. Take the next card from Destin's APPROVED list at the top of LEDGER.md (never an unapproved one). Write the hypothesis + target metric path into LEDGER.md as a new row with verdict "running".
   b. In worktrees/perf-lab, make the change. Every non-trivial edit gets a WHY comment. Product code must stay cross-platform.
   c. bash scripts/verify.sh perf-lab   → must be green (fix or abandon; never skip).
   d. node scripts/perf-lab/run.mjs --runs 5 --label exp-<n>        (aborts itself after --max-minutes 45)
   e. node scripts/perf-lab/compare.mjs perf-reports/<baseline>.json perf-reports/<exp-n>.json --target <path>
   f. KEEP → git commit (message: "perf(<area>): <what> — <target> <base>→<cand> (<Δ%>), screens ok"); this report becomes the new baseline for the next experiment. Update the ledger row. Delete perf-reports/shots/<older stems> you no longer need (they are untracked working files).
      REJECT → git checkout -- . && git clean -fd (revert fully), record numbers + reason in the ledger. Never retry the same idea with a tweak more than once.
   g. If a screenshot differs and you believe it is an OBVIOUS bug fix: tag the ledger row `ux-bugfix`, copy the baseline+candidate PNG pair to perf-reports/review/exp-<n>/, commit ONLY the ledger + review PNGs, and STOP THE LOOP — report to Destin with the two images and wait for his answer. Do not run the next card on top of a visible change. Never silently keep one.
   h. Paint-related cards (anything touching blur, animation, compositing, CSS effects): the rig's numbers are from a no-GPU virtual screen and may rank backwards. Before KEEP, stop and ask Destin for a 30-second on-screen look (bash scripts/run-dev.sh perf-lab --label "Perf: <card>"); his eyes decide.
   i. Budget: at most 8 experiments per session. After the 8th (or when the approved list is exhausted), write a session summary at the bottom of LEDGER.md and stop.
   ```
3. **When numbers look wrong** — noise gate refused (leave the machine idle), a `—` cell (a mark disappeared: run `npx vitest run tests/perf-marks-*.test.ts`), non-zero error lines (read `scratch/perf-lab/logs/<stem>-*.log` — an erroring boot is not a baseline), native first-token timeout (check the same log for engine errors), build stale (`--force-build`), a stale app holding :9555 (`launch.mjs` sweeps it, but `ss -ltnp | grep 9555` tells you what's there).
4. **Experiment cards** (seeded from the spec's Part 3; the baseline decides order — attack the largest measured phase first):
   - **E1 Window before chores.** Target `startup.median.firstContentfulPaint`. Move `createWindow(...)` (main.ts `whenReady`) ahead of `install-hooks`/`legacy-cleanup`/`hook-reconcile`/`prompt-suggestion`/`retention-default`/`symlink-cleanup`/`stale-downloads`/`reconcile-mcp`/`remote-server` — anything the window's first paint does not need; keep `hookRelay.start()` and `registerThemeProtocol()` before it (sessions and theme URLs need them). Risk: IPC handlers registered inside `createWindow` may reference services started later — run the full test suite (`bash scripts/verify.sh perf-lab --full`) and check `desktop.log` for errors after boot. UX risk: an earlier window must not mean a longer blank box — `startup.median.blankWindowMs` is a PRIMARY metric and will reject exactly that outcome; the `welcome` screenshot only proves the settled state. If the honest fix is to create the window early but keep it hidden until first paint (`show: false` + `ready-to-show`), that is a behavior change Destin must approve at the Round-0 gate.
   - **E2 Parallelize independent chores.** Target `startup.median.sessionsListed`. `Promise.all` over `reconcileMcp()`, `remoteServer.start()`, `startAnnouncementService()` and the sync cleanups wrapped in `setImmediate`. Keep `rotateLog` first (it truncates the file others append to).
   - **E3 Defer chatsearch startup scan.** Target `idle.cpuPct.median` / `startup.median.postWindowDone`. `chatsearch-index/index-service.ts:271` — start the scan on `powerMonitor`/idle or 5 s after `sessions-listed`, not in the boot path.
   - **E4 Tail-read `loadHistory` for small counts.** Target `history.huge.ipcLast10Ms`. `session-browser.ts:660` reads the whole file for `count=10`; read the last ~256 KB, parse lines from the last full newline, extend backwards until `count` messages found. Dedup-by-uuid semantics must hold (add a vitest with a duplicated uuid at the boundary).
   - **E5 Async + cached transcript replay.** Target `history.huge.resumeStableMs`. `transcript-watcher.ts:451-489` `getHistory` does a sync `readFileSync` + full parse per replay; make it async and cache the parsed result keyed by `(path, size, mtimeMs)`, invalidated by the existing incremental tail.
   - **E6 Renderer code-splitting.** Target `startup.median.appMounted` and `idle.pssMb.median`. `React.lazy` for Settings, Marketplace, Projects, games, resume browser with `manualChunks` in `vite.config.ts`; **preload the chunks during idle after `sessions-listed`** so first open never shows a spinner (the `settings-open` screenshot must be identical).
   - **E7 Unmount the always-mounted settings drawer** (ROADMAP:409). Target `idle.pssMb.median`. Render it only when open; keep its open-state transition identical.
   - **E8 Window-switch long tasks.** Target `workload.probe.longtaskTotalMs`. Use the probe's `longtask` timestamps against `mark` entries to find which switch step blocks; typical fixes are memoizing the session list derivation in `App.tsx` and batching reducer dispatches.
5. **Finishing** — when Destin's approved list is exhausted (or he says stop): rebase `perf/optimization-pass` on `origin/master`, re-run the full rig once more (`--runs 7`) and confirm the final report still beats the Round-0 baseline on every kept target with no PRIMARY regression, generate the PR body from `LEDGER.md` (kept rows → "Changes", rejected rows → "Tried and reverted", `ux-bugfix` rows → "Needs Destin's eyes", the two baseline/final report filenames → "Evidence"), open the PR, and stop. Do not merge.

- [ ] **Step 2: Commit + push** the manual. Flip the spec's `status:` to `active` in the same commit.

---

## Self-review (done while writing)

- **Spec coverage:** vehicle (T0, T5, T7) · isolation (T6, T7) · fixture sizes (T6) · startup marks (T1–T3, T8) · memory/CPU (T4, T12) · GPU caveat (README, T12 records none — spot-checks stay manual, per spec) · history reload both paths (T9) · workload journey + hiccups (T10) · zero-cost simulation (T6 fake claude, T10 streamer, native via stories260K) · statistics + noise gate (T12) · screenshot gate (T11, T13) · loop protocol + ledger + single PR (T13, T15, T16) · seeded targets (T16 cards) · cross-platform constraint (Global) · live-app safety (Global, T4 discovery by path, T7 env).
- **Placeholders:** the two spots where the implementer must verify against the current tree (message-bubble selector in T9, native `modelId` form in T10) are stated as explicit verification steps with the check to run, not left blank.
- **Type consistency:** `FixtureInfo` fields (`home, bin, projects, transcripts, perfLog, userData, profile, modelId`) are used identically in T7, T9, T10, T12; `App` (`cdp, spawnedAt, family(), kill()`) likewise; `StartupMetrics` keys in T8 match what T12/T13 read (`sessionsListed`, `firstContentfulPaint`, `createWindowAt`, `chores.*`).
