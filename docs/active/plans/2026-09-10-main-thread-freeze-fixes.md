---
date: 2026-09-10
status: active
type: plan
topic: Five contained fixes that stop the app's coordinating thread from being blocked by disk work or by animation nobody asked for — no visible behaviour change, each proven with tests and the perf rig
---

# Main-thread freeze fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use `- [ ]` syntax for tracking. Read `.claude/rules/conversations.md`, `.claude/rules/sync-spaces.md`, `.claude/rules/chat-reducer.md`, `.claude/rules/react-renderer.md`, `.claude/rules/pty-io.md` and `.claude/rules/test-suite-hygiene.md` before the first edit — they govern every file below.

**Goal:** remove the five source-verified ways the Electron main thread or renderer can stall on work the user never sees, without changing anything the user sees.

**Architecture:** Tasks 1–3 convert blocking `fs.*Sync` calls on hot main-process paths to `fs.promises`, preserving every ordering guarantee the callers rely on (temp-then-rename atomicity, mirror-before-release, per-session serialization). Task 4 adds a companion stylesheet that neutralises theme-authored animation only while Reduced Effects is on. Task 5 first measures the terminal glyph-atlas heal with a new rig scenario, then throttles it only if the numbers justify it.

**Tech stack:** Electron main (Node `fs.promises`), React renderer, vitest (`npx vitest run tests/<file>` from `youcoded/desktop`), `bash scripts/verify.sh <worktree>`, perf rig `scripts/perf-lab/bg-run.sh`.

**Provenance:** the 2026-09-10 review of the motion & responsiveness audit (this session), `docs/active/investigations/2026-09-08-lease-acquire-blocking-write-freeze.md`, `docs/active/investigations/2026-09-01-theme-css-animation-unsanitized.md`, `docs/archive/investigations/2026-08-27-terminal-black-glyphs-mipmap-driver.md`.

## Overlap check (done 2026-09-10, all clear)

Every local and remote branch of `youcoded` and `youcoded-dev`, every worktree, every open PR and every session transcript from the last five days was checked for the files this plan touches. **No branch or PR changes any of them.** Two things to know:

- `worktrees/sessions/sync-safety-audit-20260908/youcoded` has an **uncommitted** rewrite of `conversations/conversation-store.ts` (its heal path, still using `readFileSync`/`renameSync`). That file is therefore **out of scope here** — see Task 1's deferred list. Do not touch it.
- The only "perf lab session" that existed (`perf/rig-instruments`) merged; the rig instruments (renderer detection, layouts-per-token, late-content) are on master. No terminal scenario exists on any branch.

## Global constraints

- **Zero visible change.** Every task's acceptance includes "nothing on screen differs". A frozen spinner, a missing theme colour, a lease that resurrects, or a file that opens a beat later all count as UX changes and fail the task.
- **WHY comment at every non-trivial edit** (project rule; Destin reads code through them).
- **Never touch the running built app.** Runtime checks use `bash scripts/run-dev.sh --label "<task>"` from the worktree, announced before launch.
- **Preserve every ordering guarantee named below.** Async conversion is only safe where the caller's next step does not depend on the write having landed — or where the caller now awaits it. Each task lists those callers.
- Stage by explicit path. One app branch per task so each can be reviewed and merged alone. Push every branch once it has a commit.
- Workspace: `node scripts/workspace-start.mjs --session perf-freeze-fixes youcoded`; use the returned absolute worktree path with file tools. Run `bash scripts/verify.sh <that worktree>` before calling any task done and paste the six-line result.
- Roadmap edits: `node scripts/roadmap-check.mjs --fix --root <worktree>` and **diff before committing** — `--fix` is known to downgrade two unrelated items (`docs/roadmap/dev-workspace.md` "rewrites items the session never touched").

## Recommended order

1 → 3 → 4 → 2 → 5. Task 1 is the confirmed freeze mechanism and is small. Task 3 is one function. Task 4 is renderer-only. Task 2 is the widest signature change. Task 5 begins with a measurement and may end without a code change.

---

## Task 1 — Lease file, transcript mirror and sync size scan stop blocking the main thread

**Branch:** `perf/main-thread-async-io` in the `youcoded` worktree.

**Files:**
- Modify: `desktop/src/main/conversations/lease-client.ts:151-200, 280-320, 356-372`
- Modify: `desktop/src/main/conversations/transcript-mirror.ts` (whole file, 100 lines)
- Modify: `desktop/src/main/conversations/service.ts:430-434, 719-724, 823-826, 859, 895-901`
- Modify: `desktop/src/main/sync-spaces/git-transport.ts:724-750`
- Test: `desktop/tests/lease-client.test.ts`, `desktop/tests/transcript-mirror.test.ts`, `desktop/tests/sync-spaces-git-transport.test.ts`, new `desktop/tests/main-hot-path-no-sync-fs.test.ts`

**Deferred on purpose (say so in the PR):**
- `conversations/conversation-store.ts` — being rewritten uncommitted in another session's worktree (see Overlap check). Converting it now guarantees a merge conflict with work Destin has not reviewed.
- `sync-spaces/project-registry.ts`, `sync-spaces/device-registry.ts` — written only when a project or device is added; not on any per-turn or timer path. Same recipe applies later if wanted.
- `lease-client.ts` `sweepExpiredLeases` / `sweepLegacyLeaseDir` — run once at startup, before any window exists; leave synchronous.
- `git-transport.ts` repo init, exclude-file and backup-rename calls — one-time or corrupt-repo-heal paths, not the 120 s poll.

### 1A — lease-client

The three helpers become async and are **serialized per session** so a delete can never overtake the write that preceded it (with sync calls this ordering was free; with promises it must be explicit).

- [ ] **Step 1: Write the failing tests** — add to `desktop/tests/lease-client.test.ts`. That file already builds `client` in `beforeEach` against a real temp dir **and turns on fake timers** (`vi.useFakeTimers()`), so the liveness case must switch to real timers for its own body:

```ts
it('acquire then release in the same tick leaves no lease file (write/delete stay ordered)', async () => {
  hubRequest.mockResolvedValue({ ok: true, op: 'acquire', sessionId: 's1', holder: { deviceId: DEVICE_ID, device: DEVICE_NAME, expiresAt: Date.now() + 100_000 } });
  const p1 = client.acquire('s1');
  const p2 = client.release('s1');
  await Promise.all([p1, p2]);
  expect(fs.existsSync(leaseFilePath(tmpRoot, 's1'))).toBe(false);
});

it('a hung lease-file write does not hang the event loop', async () => {
  // WHY: this is the 2026-09-08 freeze shape — a disk stall inside the lease
  // write. The write must be off the event loop, so a real timer still fires
  // while the write is pending.
  vi.useRealTimers(); // afterEach re-enables fake timers for the next case
  hubRequest.mockResolvedValue({ ok: true, op: 'acquire', sessionId: 's1', holder: { deviceId: DEVICE_ID, device: DEVICE_NAME, expiresAt: Date.now() + 100_000 } });
  const never = new Promise<void>(() => {});
  const spy = vi.spyOn(fs.promises, 'writeFile').mockReturnValue(never as any);
  try {
    void client.acquire('s1');
    const ticked = await new Promise<boolean>((r) => setTimeout(() => r(true), 20));
    expect(ticked).toBe(true);
  } finally { spy.mockRestore(); }
});
```
(Check the file's other cases for the exact `hubRequest.mockResolvedValue` shape they use for a successful acquire and copy it.)

- [ ] **Step 2: Run to verify they fail**

Run (cwd `youcoded/desktop`): `npx vitest run tests/lease-client.test.ts`
Expected: the first passes by accident today (sync), the second FAILS because `writeFileSync` is what runs. That is fine — the second is the guard; the first pins ordering for after the change.

- [ ] **Step 3: Implement** — replace the three helpers inside `createLeaseClient`:

```ts
  // ---- lease-file helpers (all best-effort, all try/caught, all OFF the event loop) ----
  //
  // WHY async: on 2026-09-08 the whole app froze for 6+ minutes right after a
  // `[lease] acquire` log line. writeLeaseFile used fs.mkdirSync/writeFileSync —
  // the only blocking calls in a module whose contract is "never block". A disk
  // stall inside a blocking write halts every timer and every IPC handler in the
  // main process at once. fs.promises moves the wait onto libuv's threadpool.
  //
  // WHY a per-session chain: sync calls were implicitly ordered. Now
  // acquire()'s write and release()'s delete could race, and a delete that
  // finishes before the write would resurrect the lease file. Each session's
  // file ops run strictly one after another.
  const fileChain = new Map<string, Promise<void>>();
  function enqueueFileOp(sessionId: string, op: () => Promise<void>): Promise<void> {
    const prev = fileChain.get(sessionId) ?? Promise.resolve();
    const next = prev.then(op, op).catch(() => { /* best-effort */ });
    fileChain.set(sessionId, next);
    // Drop the entry once this op is the last one, so the map cannot grow forever.
    void next.finally(() => { if (fileChain.get(sessionId) === next) fileChain.delete(sessionId); });
    return next;
  }

  function writeLeaseFile(sessionId: string, expiresAt: number): Promise<void> {
    const file = leaseFile(sessionId);
    if (!file) return Promise.resolve();
    const body: LeaseFileContent = { deviceId: opts.deviceId, device: opts.deviceName, expiresAt };
    return enqueueFileOp(sessionId, async () => {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, JSON.stringify(body));
    });
  }

  function deleteLeaseFile(sessionId: string): Promise<void> {
    const file = leaseFile(sessionId);
    if (!file) return Promise.resolve();
    return enqueueFileOp(sessionId, () => fs.promises.rm(file, { force: true }));
  }

  async function readLeaseFile(sessionId: string): Promise<LeaseFileContent | null> {
    const file = leaseFile(sessionId);
    if (!file) return null;
    try {
      const parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      if (parsed && typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)) {
        return { deviceId: String(parsed.deviceId ?? ''), device: String(parsed.device ?? ''), expiresAt: parsed.expiresAt };
      }
      return null;
    } catch { return null; } // missing / malformed -> treat as no lease
  }
```

Then the call sites:
- `acquire()`: `await writeLeaseFile(sessionId, expiresAt);` (awaited so the existing "writes the lease file" test and the hub-down fallback stay true; awaiting a promise does not block the loop).
- `release()`: `await deleteLeaseFile(sessionId);` before the hub request (the existing test asserts the file is gone after `await release()`).
- renew tick (both `writeLeaseFile(...)` calls in the timer): `void writeLeaseFile(...)` — fire-and-forget, already inside try/catch, errors swallowed by the chain.
- the renew teardown paths that call `deleteLeaseFile(sessionId)`: `void deleteLeaseFile(sessionId)`.
- `query()`: `const file = await readLeaseFile(sessionId);`

- [ ] **Step 4: Run** `npx vitest run tests/lease-client.test.ts tests/lease-sweep.test.ts tests/resume-lease-gate.test.ts` — Expected: PASS, every existing case included. If "renew failure … deletes the file" fails, the test asserts too early: add `await vi.waitFor(() => expect(fs.existsSync(...)).toBe(false))` — that is the signal-not-sleep form `test-suite-hygiene.md` requires.

- [ ] **Step 5: Commit** — `git add desktop/src/main/conversations/lease-client.ts desktop/tests/lease-client.test.ts` · `perf(lease): move lease-file writes off the main thread, serialized per session`

### 1B — transcript-mirror

`mirrorIn` / `materializeOut` become `Promise<MirrorResult>`. Same behaviour, same grow-only and shrink-guard rules, same temp-then-rename atomicity.

- [ ] **Step 1: Update the tests** — in `desktop/tests/transcript-mirror.test.ts` every `mirrorIn(...)` / `materializeOut(...)` call becomes `await mirrorIn(...)` and each `it(` becomes `async`. Add one new case:

```ts
it('two overlapping mirrors of the same dest never collide on the tmp name', async () => {
  const a = mirrorIn({ localJsonlPath: local, spaceTranscriptPath: space });
  const b = mirrorIn({ localJsonlPath: local, spaceTranscriptPath: space });
  await Promise.all([a, b]);
  expect(fs.readFileSync(space, 'utf8')).toBe(fs.readFileSync(local, 'utf8'));
  expect(fs.readdirSync(path.dirname(space)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/transcript-mirror.test.ts` — Expected: type errors / FAIL (functions are sync).

- [ ] **Step 3: Implement** — replace the helpers:

```ts
// WHY async (2026-09-10): mirrorIn runs on EVERY turn-complete of every session
// (conversations/service.ts) and copies a transcript that can be tens of MB.
// copyFileSync + renameSync held the main thread for the whole copy; a slow
// disk there stalls every window at once (the 2026-09-08 freeze class).
// fs.promises does the same copy on the threadpool. Atomicity is unchanged:
// still unique tmp + rename.
const fsp = fs.promises;

async function sizeOf(p: string): Promise<number | null> {
  try { return (await fsp.stat(p)).size; } catch { return null; }
}

async function sweepStaleTmp(dir: string, destBase: string): Promise<void> {
  try {
    const prefix = `${destBase}.`;
    const now = Date.now();
    for (const name of await fsp.readdir(dir)) {
      if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
      const full = path.join(dir, name);
      try {
        if (now - (await fsp.stat(full)).mtimeMs > STALE_TMP_MS) await fsp.unlink(full);
      } catch { /* vanished or unreadable — nothing to sweep */ }
    }
  } catch { /* dir unreadable — skip the sweep entirely */ }
}

// WHY the counter: two async copies of the same dest can start in the same
// millisecond (turn-complete + the reconciler), and pid+Date.now() alone would
// then name the same tmp file. The pid stays in the name — the ast-grep rule
// atomic-tmp-name-per-process depends on it.
let tmpSeq = 0;
async function copyInto(src: string, dest: string): Promise<void> {
  const dir = path.dirname(dest);
  await fsp.mkdir(dir, { recursive: true });
  await sweepStaleTmp(dir, path.basename(dest));
  const tmp = `${dest}.${process.pid}.${Date.now()}.${tmpSeq++}.tmp`;
  await fsp.copyFile(src, tmp);
  await fsp.rename(tmp, dest);
}

export async function mirrorIn(opts: { localJsonlPath: string; spaceTranscriptPath: string }): Promise<MirrorResult> {
  const localSize = await sizeOf(opts.localJsonlPath);
  if (localSize === null) return { copied: false };
  const spaceSize = await sizeOf(opts.spaceTranscriptPath);
  if (spaceSize !== null && localSize < spaceSize) return { copied: false, shrunk: true };
  if (spaceSize !== null && localSize === spaceSize) return { copied: false };
  await copyInto(opts.localJsonlPath, opts.spaceTranscriptPath);
  return { copied: true };
}

export async function materializeOut(opts: { spaceTranscriptPath: string; localJsonlPath: string }): Promise<MirrorResult> {
  const spaceSize = await sizeOf(opts.spaceTranscriptPath);
  if (spaceSize === null) return { copied: false };
  const localSize = await sizeOf(opts.localJsonlPath);
  if (localSize !== null && localSize >= spaceSize) return { copied: false };
  await copyInto(opts.spaceTranscriptPath, opts.localJsonlPath);
  return { copied: true };
}
```
Keep every existing comment block above each function; only the bodies change.

- [ ] **Step 4: Update the five callers in `conversations/service.ts`** — each one's guarantee decides its form:

| line | today | change | why |
|---|---|---|---|
| ~430 turn-complete | `mirrorIn(...)` then `syncSpacesSyncNow('personal')` nudge | `mirrorIn(...).catch(() => {}).then(() => { Promise.resolve(syncSpacesSyncNow('personal')).catch(() => {}); });` | the nudge must run after the copy lands, or the sync can push the previous size; the engine's 120 s poll still covers a miss |
| ~720 materialize sweep | `try { materializeOut(...) } catch {}` | `try { await materializeOut(...) } catch {}` | already inside an async loop; keeps per-record isolation |
| ~824 materializeOne | same | same | same |
| ~859 flushSessionToSpace | `try { mirrorIn(...) } catch {}` | `try { await mirrorIn(...) } catch {}` | **MIRROR-BEFORE-RELEASE is load-bearing** (comment right below it): the awaited sync must see the copy |
| ~899 reconciler `mirror` closure | `mirrorIn(...)` inside try | `mirrorIn(...).catch(() => {})` | the closure's type is `=> void`; the reconciler never depended on completion |

Check `desktop/src/main/conversations/reconciler.ts` for any other place that calls the `mirror` option and expects a return value: `rg -n "mirror\(" desktop/src/main/conversations/reconciler.ts`. Expected: void call sites only.

- [ ] **Step 5: Run** `npx vitest run tests/transcript-mirror.test.ts tests/conversation-transcript.test.tsx` plus `npx vitest related --run src/main/conversations/service.ts` — Expected: PASS.

- [ ] **Step 6: Commit** — `git add desktop/src/main/conversations/transcript-mirror.ts desktop/src/main/conversations/service.ts desktop/tests/transcript-mirror.test.ts` · `perf(mirror): copy transcripts off the main thread; nudge sync only after the copy lands`

### 1C — git-transport size walk

`gitDirSizeBytes` is already declared `async` but walks with `readdirSync`/`statSync` every 120 s per space. Make the walk async, keep the entry cap, depth cap and symlink skip exactly.

- [ ] **Step 1: Test** — in `desktop/tests/sync-spaces-git-transport.test.ts` find the existing `gitDirSizeBytes` case (`rg -n gitDirSizeBytes desktop/tests/sync-spaces-git-transport.test.ts`). If none exists, add:

```ts
it('gitDirSizeBytes sums files, skips symlinks, and honours the entry cap', async () => {
  // build <root>/.youcoded/sync.git with two files and one symlink to a file
  ...write 100 and 200 byte files, symlink one of them...
  expect(await transport.gitDirSizeBytes(space)).toBe(300);
});
```

- [ ] **Step 2: Implement** — replace the body of `gitDirSizeBytes`:

```ts
  async gitDirSizeBytes(space: SyncSpace): Promise<number> {
    // WHY async walk (2026-09-10): this runs from the engine's 120 s poll for
    // every space; readdirSync/statSync over a large .git held the main thread
    // for the whole walk. Same caps, same symlink rule, off the event loop.
    const root = this.gitDir(space);
    let total = 0;
    let visited = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (visited >= SIZE_WALK_MAX_ENTRIES || depth > SIZE_WALK_MAX_DEPTH) return;
      let entries: fs.Dirent[];
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (visited >= SIZE_WALK_MAX_ENTRIES) return;
        visited++;
        const full = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) await walk(full, depth + 1);
        else if (e.isFile()) { try { total += (await fs.promises.stat(full)).size; } catch { /* raced away */ } }
      }
    };
    try {
      try { await fs.promises.access(root); } catch { return 0; }
      await walk(root, 0);
    } catch { return 0; }
    return total;
  }
```

- [ ] **Step 3: Run** `npx vitest run tests/sync-spaces-git-transport.test.ts tests/sync-transport-contract.ts` — Expected: PASS.

- [ ] **Step 4: Commit** — `perf(sync): walk the repo size off the main thread`

### 1D — the guard, then verify

- [ ] **Step 1: Add `desktop/tests/main-hot-path-no-sync-fs.test.ts`** — a source-scanning guard (same shape as `tests/animation-frame-budget.test.ts`: strip comments, normalise CRLF):

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

// Guard: hot main-process paths never call blocking fs.
// WHY: a blocking fs call on the main thread stalls every window's IPC at once.
// 2026-09-08: the app froze 6+ minutes on a synchronous lease write. Each entry
// here is a path that runs per turn, per timer tick, or per user action.
const MAIN = join(__dirname, '..', 'src', 'main');
const read = (p: string) => readFileSync(join(MAIN, p), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SYNC_FS = /\bfs\.\w+Sync\s*\(/;

describe('hot main-process paths use fs.promises', () => {
  it('lease client (createLeaseClient body)', () => {
    const src = read('conversations/lease-client.ts');
    const body = src.slice(src.indexOf('export function createLeaseClient'));
    expect(body).not.toMatch(SYNC_FS);
  });
  it('transcript mirror (whole file)', () => {
    expect(read('conversations/transcript-mirror.ts')).not.toMatch(SYNC_FS);
  });
  it('git-transport gitDirSizeBytes', () => {
    const src = read('sync-spaces/git-transport.ts');
    const start = src.indexOf('async gitDirSizeBytes(');
    const body = src.slice(start, src.indexOf('\n  }\n', start));
    expect(start).toBeGreaterThan(0);
    expect(body).not.toMatch(SYNC_FS);
  });
});
```
Prove the guard bites: temporarily change one `fs.promises.rm` back to `fs.rmSync`, run it, watch it go red, revert. Paste that run in the PR.

- [ ] **Step 2: `bash scripts/verify.sh <worktree>`** — all six lines green. Then the rig regression check (no new measurement is expected to move; this proves nothing got slower): `bash scripts/perf-lab/bg-run.sh --only workload --checkout <worktree> --label async-io` and compare against the newest `perf-reports/*file-pane-after.json` with `node scripts/perf-lab/compare.mjs`.

- [ ] **Step 3: Runtime sanity in a dev instance** (announce the window first): `bash scripts/run-dev.sh --label "async io"`; open a conversation, send one message, wait for the reply, confirm `[lease] acquire … ok=true` in the log and that `<userData>/Leases/<id>.json` exists; close the session and confirm the file is gone. Kill the dev instance by pid.

- [ ] **Step 4: Roadmap** — the `sync.md` lease-freeze item: move to `shipped.md` as `- [x] 2026-09-XX sync — The whole app froze solid for 6+ minutes after a lease acquire (PENDING MERGE OF perf/main-thread-async-io …)`, noting in the line that the cause was never caught live and this removes the only blocking write on that path. Archive the investigation. In the same line name the deferred siblings so nobody thinks they were converted.

**Edge cases and consequences (Task 1):**
- *Quit mid-write.* `before-quit` (main.ts:2510) is the single teardown path and awaits its work; `release()` awaits the delete, so a clean quit still removes the file. A crash still leaks a file — as today; `sweepExpiredLeases` cleans it at next launch.
- *Hub down.* Unchanged: optimistic hold, file written, renew keeps it fresh.
- *libuv threadpool saturation.* Four threads by default; a stalled disk now stalls those threads, not the event loop. If four writes hang, later fs.promises work queues behind them — still no freeze, and the hub path does not use the threadpool.
- *Mirror ordering with sync.* The turn-complete nudge is chained after the copy. The 15 s engine debounce plus chokidar's `awaitWriteFinish` (500 ms) already made this robust; the chain makes it explicit.
- *User-visible:* nothing. No copy, timing or layout change anywhere.

---

## Task 2 — Marketplace, theme preview and Resume Browser read from disk without blocking

**Branch:** `perf/main-thread-async-reads`.

**Files:**
- Modify: `desktop/src/main/marketplace-file-reader.ts:33-78, 107-125`
- Modify: `desktop/src/main/theme-preview-generator.ts:126-200` (`buildPreviewHTML` becomes async) and its one internal caller inside `generateThemePreview`
- Modify: `desktop/src/main/session-browser.ts:43-60, 118-215, 418, 438, 612-650`
- Modify: `desktop/src/main/transcript-cwd.ts:36-95`
- Modify: `desktop/src/main/conversations/slug-repair.ts` (calls `firstCwd`)
- Test: `desktop/tests/session-browser.test.ts`, `desktop/tests/transcript-cwd.test.ts`, `desktop/tests/slug-path-resolution.test.ts`, `desktop/tests/theme-preview-sync.test.ts`, extend `desktop/tests/main-hot-path-no-sync-fs.test.ts`

**Interfaces produced:** `walkSlugParts(base, parts): Promise<string>`, `forwardResolveSlug(slug, roots?): Promise<string | null>`, `firstCwd(file, platform?): Promise<string | null>`, `allCwds(file, platform?): Promise<string[]>`, `r1CwdForDir(dir, platform?): Promise<string | null>`. Every exported signature keeps its parameters; only the return becomes a Promise.

Add one tiny helper at the top of each of the three main files (do not create a shared module for four lines):
```ts
// WHY: fs.existsSync blocks the main thread; access() answers the same question off it.
const exists = (p: string) => fs.promises.access(p).then(() => true, () => false);
```

- [ ] **Step 1: Tests first** — in `transcript-cwd.test.ts` and `slug-path-resolution.test.ts` make every call `await` and every `it` async (the runner reports the exact lines). Add to `session-browser.test.ts`:

```ts
it('listPastSessions does not block on the projects walk (a timer fires while it runs)', async () => {
  // Seed ~200 slug dirs so the walk is non-trivial; the existing seedSession helper works.
  const p = listPastSessions();
  const ticked = await new Promise<boolean>((r) => setTimeout(() => r(true), 5));
  expect(ticked).toBe(true);
  await p;
});
```
(This is a liveness smoke, not the guard; the guard is the source scan in Step 5.)

- [ ] **Step 2: marketplace-file-reader** — convert:

```ts
async function resolvePluginDir(id: string): Promise<string | null> {
  const topLevel = path.join(CLAUDE_PLUGINS_ROOT, id);
  if (await exists(topLevel)) return topLevel;
  const marketplace = path.join(YOUCODED_PLUGINS_DIR, id);
  if (await exists(marketplace)) return marketplace;
  return null;
}

async function findLocalFile(rootDir: string, relative: string, maxDepth = 4): Promise<string | null> {
  const direct = path.join(rootDir, relative);
  if (await exists(direct)) return direct;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const sub = path.join(dir, entry.name);
      const candidate = path.join(sub, relative);
      if (await exists(candidate)) return candidate;
      queue.push({ dir: sub, depth: depth + 1 });
    }
  }
  return null;
}
```
and in `readComponent`: `const installDir = await resolvePluginDir(pluginId);` … `const hit = await findLocalFile(installDir, rel);` … `const content = await fs.promises.readFile(hit, 'utf8');`. The IPC handler (`ipc-handlers.ts:1731`) already awaits.

- [ ] **Step 3: theme-preview-generator** — `async function buildPreviewHTML(...)`; the two blocks become:
```ts
    if (await exists(wallpaperPath)) {
      ...
      const b64 = (await fs.promises.readFile(wallpaperPath)).toString('base64');
```
```ts
    if (await exists(patternFullPath)) {
      const svgB64 = (await fs.promises.readFile(patternFullPath)).toString('base64');
```
and `const html = await buildPreviewHTML(manifest, themeDir);` at its call. Note in a WHY comment that the base64 encode itself still runs on main (single-digit ms for a wallpaper) — only the disk wait moves.

- [ ] **Step 4: session-browser + transcript-cwd** — mechanical, in this order so types guide you:
  1. `transcript-cwd.ts`: `headText` → open/read/close via `fs.promises.open` + `handle.read(buf, 0, HEAD_BYTES, 0)` in a `try/finally { await handle.close() }`; `firstCwd`, `allCwds` (`await fs.promises.readFile`), `r1CwdForDir` (`await fs.promises.readdir`, then the same two loops with `await`). Keep the `platform` seam.
  2. `slug-repair.ts`: `await firstCwd(...)` — confirm the enclosing function is async (`rg -n "firstCwd" desktop/src/main/conversations/slug-repair.ts`); if not, make it async and follow its callers up (expected: one, already async).
  3. `session-browser.ts`: `readIndexMeta` → `await fs.promises.readFile`; `walkSlugParts` → async with `const st = await fs.promises.stat(candidate).catch(() => null); const isDir = !!st && st.isDirectory();`; `walkForward` → async recursion with `await fs.promises.readdir`; `forwardResolveSlug` → `await walkForward`; `resolveSlugToPath` → async, awaiting `r1CwdForDir`, `forwardResolveSlug`, `walkSlugParts`; line 418 `const indexMeta = await readIndexMeta();`; line 438 `const projectPath = await resolveSlugToPath(slug);`; the four `fs.existsSync(...)` in the store overlay loop (612–650) → `await exists(...)`. The loop is inside an async function; keep it sequential so ordering of `result.push` is unchanged.
  4. Any other importer of the five exports: `rg -n "walkSlugParts|forwardResolveSlug|firstCwd|allCwds|r1CwdForDir" desktop/src` — every call gets `await`.

- [ ] **Step 5: Extend the guard** — add to `main-hot-path-no-sync-fs.test.ts`:
```ts
  it('marketplace-file-reader (whole file)', () => { expect(read('marketplace-file-reader.ts')).not.toMatch(SYNC_FS); });
  it('theme-preview-generator buildPreviewHTML', () => { /* slice as in the git-transport case */ });
  it('transcript-cwd (whole file)', () => { expect(read('transcript-cwd.ts')).not.toMatch(SYNC_FS); });
  it('session-browser listing path', () => { /* slice from 'function readIndexMeta' to 'export async function listPastSessions' plus the overlay block */ });
```

- [ ] **Step 6: Run** `npx vitest run tests/session-browser.test.ts tests/transcript-cwd.test.ts tests/slug-path-resolution.test.ts tests/theme-preview-sync.test.ts tests/main-hot-path-no-sync-fs.test.ts` then `bash scripts/verify.sh <worktree>`. Expected: PASS ×6.

- [ ] **Step 7: Runtime check in a dev instance** — open the Resume Browser: same rows, same order, same names as before (compare a screenshot from the same profile before the change); open Marketplace, open a skill's detail, read a skill file; open Library, change a theme's wallpaper so a preview regenerates. Nothing should look different.

- [ ] **Step 8: Commit** per file group (`perf(marketplace): …`, `perf(themes): …`, `perf(resume): …`) and push.

**Edge cases and consequences (Task 2):**
- *Ordering in the Resume Browser.* Results were sequential before; keep `for…of` with `await`, not `Promise.all`, in the store overlay loop so the list order is byte-identical.
- *`walkSlugParts` longest-first.* The `.claude/rules/conversations.md` invariant "MUST try the LONGEST leading segment first" is a loop order, unchanged by awaiting inside it.
- *Windows.* `fs.promises.access` behaves like `existsSync` for the existence question; the `[A-Z]--` slug branch is untouched.
- *Latency.* Individual awaits add microseconds each; on a big `~/.claude/projects` the list may complete a few ms later but the window keeps painting throughout, which is the point.
- *User-visible:* nothing.

---

## Task 3 — Cap how much transcript the tailer swallows per read

**Branch:** `perf/tailer-read-cap`. **Rule:** `.claude/rules/chat-reducer.md` — `readNewLines` stays serialized per session; the carry stays bytes.

**Files:** Modify `desktop/src/main/transcript-watcher.ts:735-737` (and the constants block near the top); Test `desktop/tests/transcript-watcher.test.ts`.

- [ ] **Step 1: Failing test** — add under `describe('TranscriptWatcher read integrity')`:

```ts
it('delivers every line of a burst larger than one read cap, in order', async () => {
  const watcher = new TranscriptWatcher(configDir, 20);
  const events: any[] = [];
  watcher.on('transcript-event', (e) => events.push(e));
  await watcher.startWatching(...existing fixture args...);
  // 300 assistant-text lines of ~10 KB each ≈ 3 MB, appended in ONE write.
  const line = (i: number) => JSON.stringify({ uuid: `u${i}`, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `${i}:` + 'x'.repeat(10_000) }] }, timestamp: new Date().toISOString() }) + '\n';
  fs.appendFileSync(jsonlPath, Array.from({ length: 300 }, (_, i) => line(i)).join(''));
  await vi.waitFor(() => expect(events.filter((e) => e.type === 'assistant-text')).toHaveLength(300), { timeout: 5000 });
  const texts = events.filter((e) => e.type === 'assistant-text').map((e) => e.data.text.split(':')[0]);
  expect(texts).toEqual(Array.from({ length: 300 }, (_, i) => String(i)));
  watcher.stopWatching(...);
});
```
(Use the file's existing fixture helpers for `startWatching` arguments; the 5 s timeout is explicit because `vi.waitFor` has a separate 1 s default — `tests/setup-waitfor.ts`.)

- [ ] **Step 2: Run** `npx vitest run tests/transcript-watcher.test.ts -t "burst"` — Expected: PASS today (it reads the whole 3 MB in one go). Keep it: it is the correctness pin for the change.

- [ ] **Step 3: Implement** — near the other constants:
```ts
// WHY (2026-09-10): a /compact rewrite, a paste of a huge tool result, or a
// transcript that grew while the app was suspended arrives as ONE delta.
// Buffer.alloc(delta) + one decode + one synchronous parse loop over the whole
// thing is a single long task on the main thread. Cap each read; the
// serialized runner below loops immediately until the file is drained, and
// every await in between lets timers and IPC run.
const MAX_TAIL_READ_BYTES = 1024 * 1024;
```
and in `readNewLinesOnce`:
```ts
    const remaining = fileSize - session.offset;
    const bytesToRead = Math.min(remaining, MAX_TAIL_READ_BYTES);
    const buffer = Buffer.alloc(bytesToRead);
    // Ask the serialized runner for another pass if this read cannot reach EOF.
    // Set BEFORE any early return below (a capped read may end mid-line and
    // return through the "no complete line yet" branch).
    if (remaining > bytesToRead) session.rerunQueued = true;
```
Nothing else changes: `readNewLines`' `do … while (session.rerunQueued)` already loops, and each pass awaits `fs.promises.open`/`read`, which yields the event loop between passes.

- [ ] **Step 4: Add the cap pin** — in the same describe:
```ts
it('never allocates more than the read cap per pass', async () => {
  const sizes: number[] = [];
  const orig = Buffer.alloc;
  const spy = vi.spyOn(Buffer, 'alloc').mockImplementation((n: number, ...rest: any[]) => { sizes.push(n); return orig.call(Buffer, n, ...rest); });
  try {
    ...same 3 MB burst as above, await the 300 events...
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1024 * 1024);
  } finally { spy.mockRestore(); }
});
```

- [ ] **Step 5: Run the whole file** `npx vitest run tests/transcript-watcher.test.ts` — Expected: PASS, including "handles partial lines across reads", "preserves a multi-byte UTF-8 character split across two reads" and "does not double-emit when two reads are triggered concurrently".

- [ ] **Step 6: verify.sh, then rig** `--only workload --checkout <worktree> --label tailer-cap`; compare `workload.median.probe.longtaskMaxMs` and `switchPaintedMedianMs` against the baseline. Expected: within run-to-run spread (the rig's fixtures do not produce >1 MB deltas; this task is protection, not a measured win — say so in the PR).

- [ ] **Step 7: Commit + push** · `perf(tailer): cap each transcript read at 1 MiB and drain in serialized passes`

**Edge cases and consequences (Task 3):**
- *A single line longer than 1 MiB* (a giant tool result): the carry (`partialBytes`) accumulates across passes until its newline; memory bound = that line's length, as today. `rerunQueued` is set before the "no complete line yet" return, so draining does not wait for the 2 s poll.
- *File shrinks between passes* (`/clear` during a burst): every pass re-stats; the existing shrink branch resets offset and emits `transcript-shrink`. Unchanged.
- *Double-emit risk:* none — the runner is still single-flight per session; passes are sequential.
- *Renderer side:* events arrive in the same order, batched per animation frame as before. A user watching a huge paste stream in sees it fill in over a few frames instead of after one long hitch. That is the only perceptible difference and it is the intended one.

---

## Task 4 — Reduced Effects also switches off theme-authored animation

**Branch:** `perf/reduced-effects-theme-animation`. **Rule:** `.claude/rules/react-renderer.md` (no Node in the renderer; theme-engine is shared with Android/remote).

**Decision (final):** do **not** change `sanitizeCSS` and do **not** stop Tailwind `animate-spin`/`animate-pulse`. Banning or slowing animation for every user changes what theme authors shipped, and a frozen spinner reads as "hung" — `tests/reduced-effects-animations.test.ts` pins that spinners keep spinning on purpose. The fix is scoped to the setting whose promise is currently broken: when Reduced Effects is on, animation the theme injected stops; when it is off, nothing changes.

**Files:** Modify `desktop/src/renderer/themes/theme-engine.ts:605-616`; Test: new `desktop/tests/theme-engine-reduced-custom-css.test.tsx` and `desktop/tests/reduced-effects-animations.test.ts`.

- [ ] **Step 1: Failing test** — the existing `tests/theme-engine.test.ts` is a pure-function suite with no DOM, so create `tests/theme-engine-reduced-custom-css.test.tsx` starting with `// @vitest-environment jsdom`, importing `applyThemeToDom` from `../src/renderer/themes/theme-engine`, and a `minimalTheme` built the way `tests/theme-validator.test.ts`'s "accepts a minimal valid theme" case builds one (all 15 required tokens, `slug`, `name`). Reset `document.head.innerHTML = ''` in `beforeEach` so the style elements do not leak between cases (`test-suite-hygiene.md`).

```ts
describe('Reduced Effects neutralises theme-injected animation', () => {
  const theme = { ...minimalTheme, custom_css: `
    .header-bar { animation: theme-glow 2s linear infinite; }
    @media (min-width: 1px) { .assistant-bubble { animation-name: theme-bob; animation-duration: 3s; } }
    .input-bar-container { color: red; }
    @keyframes theme-glow { to { opacity: .5 } }` };

  it('emits an animation:none override for every selector the theme animates', () => {
    applyThemeToDom(theme as any, true);
    const css = document.getElementById('theme-custom-reduced')!.textContent!;
    expect(css).toContain('.header-bar { animation: none !important; }');
    expect(css).toContain('.assistant-bubble { animation: none !important; }');
    expect(css).not.toContain('.input-bar-container');
  });

  it('is empty when Reduced Effects is off, and the theme CSS is untouched', () => {
    applyThemeToDom(theme as any, false);
    expect(document.getElementById('theme-custom-reduced')!.textContent).toBe('');
    expect(document.getElementById('theme-custom')!.textContent).toContain('theme-glow 2s linear infinite');
  });

  it('survives a theme with no custom_css', () => {
    applyThemeToDom({ ...minimalTheme, custom_css: undefined } as any, true);
    expect(document.getElementById('theme-custom-reduced')?.textContent ?? '').toBe('');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/theme-engine.test.ts` — Expected: FAIL (`theme-custom-reduced` does not exist).

- [ ] **Step 3: Implement** — after step 7 in `applyThemeToDom` (right after `customEl.textContent = theme.custom_css;` / the else branch):

```ts
  // 7a. Reduced Effects for theme-injected animation.
  //
  // WHY: the app's own [data-reduced-effects] rules are selector-specific, so a
  // community theme's custom_css can keep a forever animation running on
  // permanent chrome (.header-bar etc.) with Reduced Effects ON — the one
  // setting a user reaches for to make the app stop moving. Instead of banning
  // animation for everyone (a change to what theme authors shipped), we read
  // the selectors the theme animates and cancel exactly those, only while the
  // setting is on. Off → this sheet is empty and the theme is byte-identical.
  //
  // Detection uses each rule's cssText, not the animationName longhand, because
  // jsdom's CSSOM does not expand shorthands and Chromium does — cssText is
  // stable in both. Nested @media/@supports blocks are walked.
  const reducedCSSId = 'theme-custom-reduced';
  let reducedEl = document.getElementById(reducedCSSId) as HTMLStyleElement | null;
  if (!reducedEl) {
    reducedEl = document.createElement('style');
    reducedEl.id = reducedCSSId;
    // Must come AFTER #theme-custom so equal-specificity rules win by order.
    (customEl ?? document.head).insertAdjacentElement(customEl ? 'afterend' : 'beforeend', reducedEl);
  }
  reducedEl.textContent = reducedEffects && customEl ? buildReducedOverrides(customEl) : '';
```
and, at module level:
```ts
const ANIMATION_DECL = /(^|[\s;{])animation(-name)?\s*:\s*(?!none\b)/;

export function buildReducedOverrides(styleEl: HTMLStyleElement): string {
  const sheet = styleEl.sheet as CSSStyleSheet | null;
  if (!sheet) return '';
  const selectors = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) { walk(nested); continue; }
      const style = rule as CSSStyleRule;
      if (!style.selectorText) continue; // @keyframes, @font-face, …
      if (ANIMATION_DECL.test(style.cssText)) selectors.add(style.selectorText);
    }
  };
  try { walk(sheet.cssRules); } catch { return ''; } // a cross-origin sheet would throw; ours never is
  return Array.from(selectors).map((s) => `${s} { animation: none !important; }`).join('\n');
}
```

- [ ] **Step 4: Run** `npx vitest run tests/theme-engine.test.ts tests/reduced-effects-animations.test.ts tests/theme-effects-mask.test.ts tests/animation-frame-budget.test.ts` — Expected: PASS.

- [ ] **Step 5: Extend the pin** — in `reduced-effects-animations.test.ts` add a source-scan case that `theme-engine.ts` contains `theme-custom-reduced` and `buildReducedOverrides` (so a refactor of step 7 cannot silently drop it), and that the spinner case still holds.

- [ ] **Step 6: Runtime check** — dev instance, install Golden Sunbreak (or any wallpaper theme), toggle Reduced Effects on and off in Settings → Themes: colours, wallpaper, blur behaviour must be exactly as before in both states. Then, in the dev instance only, add `.header-bar { animation: spin 1s linear infinite }` to a local theme's `custom_css`, confirm the header spins with the setting off and holds still with it on, remove the test CSS.

- [ ] **Step 7: Roadmap** — narrow the `docs/roadmap/themes.md` item rather than delete it: the "not even Reduced Effects turns it off" half is fixed; what remains is a decision item — whether to cap always-on theme animation for users who never touch the setting (options in the investigation's "Fix shape"). Add a shipped line for the half that landed.

- [ ] **Step 8: verify.sh → commit → push** · `perf(themes): Reduced Effects now stops theme-injected animation, and nothing else`

**Edge cases and consequences (Task 4):**
- *A theme selector the app also uses* (e.g. `.header-bar`): our override cancels animation on that element only under Reduced Effects. The app has no animation on the blessed theme hooks, so nothing of ours is lost.
- *`!important` in theme CSS:* equal specificity, later in source order → ours wins.
- *`animation: none` in the theme:* excluded by the negative lookahead; no useless override.
- *Themes with `transition`:* untouched (finite by nature).
- *Android / remote:* theme-engine is shared, so the same behaviour ships everywhere; Reduced Effects defaults off there, so nothing changes for phone users by default.
- *Cost:* a CSSOM walk on theme apply only; zero per-frame work.
- *User-visible:* only with Reduced Effects on, and only if a theme animates — today no shipped theme does.

---

## Task 5 — Terminal glyph-atlas heal: measure it, then throttle it if it costs

**Branch:** rig scenario in `youcoded-dev` (`session/perf-freeze-fixes`); app change, if any, on `perf/terminal-atlas-heal-throttle`.

**Why this is a measure-first task.** The heal (`TerminalView.tsx:472-516`) clears the glyph atlas **shared by every open terminal** each time one terminal goes hidden → visible, so every session switch in terminal view re-rasterises glyphs for all of them. It was added on 2026-07-30 for the black-box glyph bug, and the root-cause record (`2026-08-27-terminal-black-glyphs-mipmap-driver.md`) proves it could not fix that bug — the mipmap patch shipped in PR #333 did. What is left is a defence against transient GPU texture corruption with no context-loss event (sleep/resume, VRAM reclaim). That is worth keeping, but not at "every switch" frequency if the switch cost shows up. Nothing measures it today. `pty-io.md` and `tests/terminal-glyph-atlas-heal.test.tsx` pin the heal's existence and its resize dedup; both stay.

### 5A — a `terminal` rig scenario

- [ ] **Step 1: Instrument the app (tiny, renderer-only).** In `desktop/src/renderer/hooks/terminal-registry.ts` add a counter the rig can read: `atlasClears: number` on the registry object, incremented from both heal sites in `TerminalView.tsx` (visibility and debounced resize) via a `noteAtlasClear()` export. WHY comment: "rig instrument; the heal costs every open terminal a re-rasterize, so the rig counts clears per switch". Extend `tests/terminal-glyph-atlas-heal.test.tsx` to assert the counter moves with the spy.

- [ ] **Step 2: Write `scripts/perf-lab/scenario-terminal.mjs`** by analogy with `scenario-projects.mjs` (same header: what journey, WHY (Destin's freeze reports, 2026-08-27), the suspects — 1. the shared atlas clear on hide→show, 2. `FitAddon.fit()` per size change, 3. the DOM-renderer fallback path — and what it is blind to). Journey: with the six workload sessions open, switch the view to terminal, run `seq 1 2000` in each so every terminal has glyph coverage, then 40 switches between sessions in terminal view. Per step: `installIpcStallProbe` / `readProbeWindow` / `attributeStall`, plus `window.__terminalRegistry.atlasClears` before/after. Report `terminal.median.switchPaintedMedianMs`, `switchPaintedP95Ms`, `longtaskMaxMs`, `atlasClearsPerSwitch`, `ipc.totalStallMs`. **`blindTo` must say:** the rig runs on llvmpipe under Xvfb (`report.machine.renderer`), so WebGL may not initialise and `clearTextureAtlas` then only forces a full DOM repaint — the GPU re-upload cost on real hardware is NOT measured here; and no wallpaper theme.

- [ ] **Step 3: Wire it** into `run.mjs` (`PHASES`, `--only` validation, report skeleton, path router, `buildTerminalSection`, owed-numbers gate that proves the probe replied, markdown rows, `terminal-repeats` flag, lazy loader, run block) — the exact line list is in `scenario-projects.mjs`'s integration, mirror it. Add `scripts/perf-lab/tests/scenario-terminal.test.mjs` (fixture builder + `medianRun` unit tests; run with `node --test scripts/perf-lab/tests/scenario-terminal.test.mjs`). Update `scripts/perf-lab/README.md`'s coverage table: `| terminal (six sessions, 40 switches in terminal view, atlas clears per switch) | scenario-terminal.mjs | **covered** since 2026-09-XX — software GL only, GPU upload cost NOT measured |`.

- [ ] **Step 4: Baseline** `bash scripts/perf-lab/bg-run.sh --only terminal --terminal-repeats 3 --checkout <worktree> --label atlas-baseline`. Read the `.md` report. Expected finding: `atlasClearsPerSwitch ≈ 1` (proves the mechanism), with switch time and long tasks as the numbers to beat.

### 5B — throttle, only if 5A justifies it

**Gate:** proceed if the baseline shows `longtaskMaxMs` or `switchPaintedMedianMs` in terminal view meaningfully above the chat-view workload numbers (~110 ms painted median today) **or** the A/B below returns `VERDICT: KEEP`. If both are flat, stop here, keep the scenario, and record "measured, no change warranted (software GL)" in the roadmap — the GPU half stays an open question for a real-hardware check Destin can feel in a dev instance.

- [ ] **Step 1: Failing test** — in `tests/terminal-glyph-atlas-heal.test.tsx` replace "clears again on every return to visible" with:

```ts
it('clears again on return to visible only after the heal interval', () => {
  vi.useFakeTimers();
  try {
    const { rerender } = render(<TerminalView {...props} visible={true} />);
    rerender(<TerminalView {...props} visible={false} />);
    rerender(<TerminalView {...props} visible={true} />);
    const afterFirst = clearTextureAtlasSpy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    rerender(<TerminalView {...props} visible={false} />);
    rerender(<TerminalView {...props} visible={true} />);
    expect(clearTextureAtlasSpy.mock.calls.length).toBe(afterFirst); // within the interval: skipped
    vi.advanceTimersByTime(ATLAS_HEAL_MIN_INTERVAL_MS + 1);
    rerender(<TerminalView {...props} visible={false} />);
    rerender(<TerminalView {...props} visible={true} />);
    expect(clearTextureAtlasSpy.mock.calls.length).toBeGreaterThan(afterFirst);
  } finally { vi.useRealTimers(); }
});

it('the resize heal is not throttled (a user resizing to fix glyphs must always win)', () => { /* existing resize case, unchanged */ });
```
Export `ATLAS_HEAL_MIN_INTERVAL_MS` from `TerminalView.tsx` for the test.

- [ ] **Step 2: Implement** — module level in `TerminalView.tsx`:
```ts
// WHY (2026-09-10): the atlas is shared by every open terminal, so this heal
// re-rasterises ALL of them on EVERY session switch in terminal view. The bug it
// was written for (black glyph boxes) is fixed at the root by
// scripts/patch-xterm-webgl-mipmap.js; what remains is a defence against a
// transient bad GPU texture, which does not need to run 40 times a minute.
// One clear per interval, app-wide (the atlas is app-wide). The resize heal
// below is deliberately NOT throttled: it is the user's manual fix.
export const ATLAS_HEAL_MIN_INTERVAL_MS = 60_000;
let lastVisibilityHealAt = 0;
```
and in the visibility effect:
```ts
      if (wasVisible === false && Date.now() - lastVisibilityHealAt >= ATLAS_HEAL_MIN_INTERVAL_MS) {
        lastVisibilityHealAt = Date.now();
        terminalRef.current.clearTextureAtlas();
        noteAtlasClear();
      }
```

- [ ] **Step 3: Run** `npx vitest run tests/terminal-glyph-atlas-heal.test.tsx tests/terminal-view-touch-mode.test.tsx tests/terminal-view-workbench-screen.test.tsx tests/xterm-webgl-mipmap-patch.test.ts` — Expected: PASS.

- [ ] **Step 4: A/B** `bash scripts/perf-lab/bg-run.sh --only terminal --terminal-repeats 3 --checkout <worktree> --label atlas-throttle` and `node scripts/perf-lab/compare.mjs <baseline>.json <new>.json --target terminal.median.switchPaintedMedianMs`. Add the terminal targets to `PRIMARY` in `compare.mjs` when you add the phase.

- [ ] **Step 5: Real-hardware check** (announce first): dev instance, six sessions with busy terminals, switch rapidly in terminal view, then sleep/resume the laptop and switch once more — text must render correctly after resume. Ask Destin whether rapid switching feels different; do not claim a GPU win the rig cannot see.

- [ ] **Step 6: verify.sh → commit → push.** Roadmap: file the outcome either way under `docs/roadmap/user-interface.md` (terminal), citing the report path.

**Edge cases and consequences (Task 5):**
- *Glyphs corrupt within 60 s of the last heal:* toggling view will not heal until the interval passes; resizing the window or the pane heals immediately (untouched path). Say this in the PR.
- *New terminal joins the atlas:* still skipped on mount (`wasVisible === false` guard), as today.
- *WebGL fell back to DOM renderer:* `clearTextureAtlas` was already only a full repaint there; throttling removes 39 of 40 repaints per burst of switches.
- *User-visible:* none in normal use. The only observable difference is the 60 s rule above.

---

## Not in this plan (deliberately)

- Closing the two stale roadmap items the audit tripped over (buddy per-token reflow, remote replay buffer — both already fixed in code) and deleting the unreachable legacy whole-transcript replay. Housekeeping, separate branch, no risk, but not what this plan was asked for.
- Any container transition or motion polish. That is design work and needs a deck.
- Stopping utility spinners under Reduced Effects (see Task 4's decision).

## Self-review notes

- Every task has a failing test, an implementation with real code, a run command, a commit, and a rig or runtime check.
- Signatures used across tasks: `exists()` is defined per file (three copies, four lines each — chosen over a shared module to keep each PR independent); `noteAtlasClear()` (Task 5A) is the only symbol Task 5B consumes from 5A; `ATLAS_HEAL_MIN_INTERVAL_MS` is exported for the test only.
- The overlap check is a snapshot from 2026-09-10 15:45. Re-run `git fetch --all` and `git worktree list` for both repos before starting; if `conversation-store.ts` has landed by then, it may be added to Task 1 with the same recipe.
