---
title: Background Bash Execution Implementation Plan (ledger G-1)
date: 2026-08-28
status: shipped
spec: docs/archive/specs/2026-08-28-bash-background-execution-design.md
review: docs/archive/investigations/2026-08-28-bash-background-spec-review.md
branch: youcoded feat/bash-background-ui (worktree worktrees/bash-bg) — continues the renderer mockup commit 69d066a3
tags: [native-runtime, harness, harness-tools, renderer, ipc-bridge]
---

# Background Bash Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Bash command can outlive its call — started with `run_in_background`, or handed off when a foreground command reaches its time limit — with `BashOutput`/`KillShell` companions, the finished result injected at the next idle boundary, a card that shows the live state with a Stop button, and honest process-family kills on abort, close and quit.

**Architecture:** One `ShellRegistry` per session (new `harness/shell-registry.ts`) owns every background/handed-off child: group-spawned, logged to disk from the first byte, tail ring kept main-side, `'change'` (debounced) and `'exit'` events. `NativeSessionHost` owns the registries' LIFETIME in a `Map<sessionId, ShellRegistry>` (so a taken-over session's runs are still killable at app quit) and hands each `HarnessSession` its registry through `opts.shells` → `ToolContext.shells`. Finished notices ride the existing `queueHostNotice → drainDeliveries → runNotice` idle-boundary path with `injected: 'shell-complete'`. The card is already on the branch; this plan wires it to a real `native:shell-event` push and a real `native:kill-shell` request.

**Tech Stack:** TypeScript (Electron main + React renderer), zod, vitest (+ jsdom for renderer tests), Node `child_process`, Kotlin (one string in `SessionService.kt`).

## Global Constraints

- Cap **5** explicit background starts running at once (`MAX_EXPLICIT_RUNNING`); a hand-off is never counted and never refused (D5).
- **8** `BashOutput` reads per turn (`BASH_OUTPUT_READS_PER_TURN`); the 9th is `isError: true` (D7).
- Wire tail **40** lines (`WIRE_TAIL_LINES`); main-side ring **200** lines (`RING_LINES`); finished-notice tail **50** lines (`NOTICE_TAIL_LINES`); one `BashOutput` read returns at most **1 MB** (`READ_MAX_BYTES`), read positionally from the log — never the whole file.
- The 7-day spill sweep MOVES from `bash.ts` to `spill-paths.ts` and is called by the registry too — in `bash.ts` it only fired on a foreground spill, so a user whose long commands all ran in the background never swept anything.
- Kill = `SIGTERM` to the process group, `SIGKILL` after **2 s** (`TERM_GRACE_MS`); Windows `taskkill /PID <pid> /T /F`, falling back to `child.kill()`.
- `KillShell` waits at most **5 s** for the exit (`KILL_WAIT_MS`).
- `'change'` events debounced to ≤4 per second per run (`CHANGE_DEBOUNCE_MS = 250`).
- stdin **closed** for background starts (`stdio: ['ignore','pipe','pipe']`) and for handed-off runs (`child.stdin.end()` at hand-off); foreground stdin stays an open pipe.
- A leading `sleep` is **never** handed off — it times out and reports as today (exit 124).
- Desktop-only: Android answers `native:kill-shell` with `not-implemented-on-mobile`.
- Worktree `/home/destin/youcoded-dev/worktrees/bash-bg`, branch `feat/bash-background-ui` (already holds the renderer mockup — do NOT re-create `ShellRunView`, `SHELL_RUN_CHANGED`, `ShellView`, the header suffix, the five fixtures or the MOCK_ONLY row; this plan builds the backend and wires the card to it).
- Before EVERY commit: `cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/bash-bg` — expected last line `verify: OK` (it covers `youcoded/desktop` only; Task 7 also needs no Android build since the Kotlin change is one string).
- Every non-trivial edit carries a `// Why:` comment a non-developer can follow.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj`.
- Stage by explicit path, never `git add -A` (other sessions keep untracked files in the workspace).
- Every user-facing and model-facing string is specific and accurate (`docs/error-message-standards.md`) — never guess a cause.
- The tree must be green after every task (`verify.sh` passes), which is why the registry lands before anything uses it, the tools before the manifest lists them (same task), the IPC push before the renderer subscribes.
- Test commands below run from `/home/destin/youcoded-dev/worktrees/bash-bg/desktop`; the shell-process tests need `/bin/bash` and are `it.skipIf(process.platform === 'win32')`.

## File Structure

All paths under `/home/destin/youcoded-dev/worktrees/bash-bg/desktop/` unless marked *(workspace)* or *(android)*.

| File | Responsibility |
|---|---|
| `src/main/harness/tools/shell-text.ts` **(new)** | The two probe sentinels + `stripAnsi` + `stripSentinelLines` + `normalizeNewlines` — shared by `bash.ts` and the registry without a runtime import cycle |
| `src/main/harness/tools/spill-paths.ts` | The 7-day retention sweep MOVES here from `bash.ts` — the registry writes into the same tree and must sweep it too (its own module header already names "one definition, two importers" as the reason it exists) |
| `src/main/harness/shell-registry.ts` **(new)** | `ShellRegistry`: start / adopt / read / list / kill / killAll, group spawn + tree kill (`spawnDetached`, `killTree`), log-from-first-byte, 200-line ring, 40-line wire view, `'change'`/`'exit'` events, `formatElapsed`, `formatFinishedNotice`, `stateText` |
| `src/main/harness/tools/bash.ts` | `run_in_background`, hand-off at the time limit, detached foreground spawn + tree kill on abort, new description text |
| `src/main/harness/tools/bash-output.ts` **(new)** | `BashOutput` tool (id mode / list mode / unknown id) |
| `src/main/harness/tools/kill-shell.ts` **(new)** | `KillShell` tool |
| `src/main/harness/tools/index.ts` | Register the two tools in `CORE_TOOLS` |
| `src/main/harness/tools/types.ts` | `ToolContext.shells?: ShellRegistry` |
| `src/shared/harness-manifest.ts` | `NATIVE_TOOL_NAMES` gains `BashOutput`, `KillShell` |
| `src/shared/permission-types.ts` | Both companions always allowed (they never ask) |
| `src/shared/types.ts` | `injectedMeta` union (`SpecialistInjectedMeta \| ShellInjectedMeta`), `ShellEvent`, `IPC.NATIVE_KILL_SHELL`, `IPC.NATIVE_SHELL_EVENT` |
| `src/main/harness/harness-session.ts` | `opts.shells` → ctx, per-turn BashOutput cap, doom-loop exemption, `runNotice` discriminant |
| `src/main/harness/native-session-host.ts` | Registry lifetime map, `'shell-event'` emit, exit → notice, `pendingHostNotices` shape, one-turn batching, `destroy(…, {keepShells})`, `destroyAll` → app-quit, `killShell`, `shellRunsFor` |
| `src/main/ipc-handlers.ts` | `native:kill-shell` handler, `shell-event` listener, replay on `TRANSCRIPT_REPLAY`, `keepShells` on takeover + exit backstop |
| `src/main/preload.ts` / `src/renderer/remote-shim.ts` / `src/main/remote-server.ts` / `src/renderer/hooks/useIpc.ts` | `native.killShell`, `on.shellEvent`, WS case, buffer + replay |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` *(android)* | `"native:kill-shell"` → not-implemented-on-mobile |
| `src/renderer/App.tsx`, `src/renderer/components/buddy/BubbleFeed.tsx` | Subscribe `on.shellEvent` → `SHELL_RUN_CHANGED` |
| `src/renderer/state/chat-reducer.ts` | Fold the `'shell-complete'` turn into the card; resume rule on `TRANSCRIPT_REPLAY_COMPLETE` |
| `src/renderer/components/SpecialistReportCard.tsx` | Narrow the meta union |
| `src/renderer/components/tool-views/ToolBody.tsx` | Typed `killShell` call, hide empty log line, no `0s` on rebuilt cards |
| `src/renderer/dev/workbench/mock-shim.ts`, `mock-only.ts` | Real `native.killShell` + `on.shellEvent` fakes; MOCK_ONLY row removed |
| `tests/shell-registry.test.ts`, `tests/shell-registry-win-kill.test.ts`, `tests/bash-background.test.ts`, `tests/bash-output-kill-shell.test.ts`, `tests/chat-reducer-shell.test.ts`, `tests/tool-body-shell.test.tsx` **(new)**; `tests/native-tools-polish.test.ts`, `tests/tool-registry-manifest.test.ts`, `tests/harness-session-loop.test.ts`, `tests/native-session-host.test.ts`, `tests/ipc-channels.test.ts`, `tests/remote-server.test.ts`, `tests/workbench-mock-contract.test.ts` | Pins |
| `youcoded/docs/native-runtime.md`, `.claude/rules/harness-tools.md` *(workspace)*, `ROADMAP.md` *(workspace)* | Docs |

---

### Task 0: Make the branch green before building on it

`bash scripts/verify.sh worktrees/bash-bg` FAILS on the branch as it stands, before this plan
touches anything: 5 failures in `tests/workbench-fixture-actions.test.ts`, all
`expected [ 'shell_run' ] to deeply equal []`. The mockup commit `69d066a3` taught
`fixture-loader.ts` a new fixture line kind (`shell_run`, at `fixture-loader.ts:273`) but never
added it to the guard test's `KNOWN_KINDS` allowlist. The loader handles it correctly — only the
allowlist is stale.

This has to be fixed FIRST, or every "run to verify failure" step below is read against a tree
that is already red and no later `verify: OK` means anything.

**Files:** `tests/workbench-fixture-actions.test.ts`

- [ ] **Step 1: Confirm the failure is exactly this and nothing else** — `cd /home/destin/youcoded-dev/worktrees/bash-bg/desktop && npx vitest run tests/workbench-fixture-actions.test.ts` — Expected: 5 failed, all five `bash-background-*` fixtures, all reporting `shell_run`.

- [ ] **Step 2: Add the kind to the allowlist**, after the `'stalled',` line in `KNOWN_KINDS`:

```ts
  // G-1 background Bash: the live run record a Bash card renders from
  // (fixture-loader.ts dispatches it as SHELL_RUN_CHANGED). Landed with the
  // card mockup in 69d066a3; this allowlist was missed, leaving the branch red.
  'shell_run',
```

- [ ] **Step 3: Verify** — `cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/bash-bg` — Expected last line `verify: OK`. **Do not start Task 1 until this passes** — a green baseline is what makes every later run informative.

- [ ] **Step 4: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/tests/workbench-fixture-actions.test.ts && git commit -m "fix(tests): allow the shell_run fixture kind the card mockup added (G-1 Task 0)

69d066a3 taught fixture-loader.ts to dispatch SHELL_RUN_CHANGED from a
'shell_run' fixture line but never added the kind to this guard's allowlist,
so all five bash-background fixtures failed it and the branch was red.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```

---

### Task 1: `shell-text.ts` + `ShellRegistry`

**Files:**
- Create `src/main/harness/tools/shell-text.ts`
- Create `src/main/harness/shell-registry.ts`
- Modify `src/main/harness/tools/bash.ts` (sentinel constants + `stripAnsi` move to `shell-text.ts`, re-exported; the spill sweep moves to `spill-paths.ts`)
- Modify `src/main/harness/tools/spill-paths.ts` (receives the sweep)
- Test `tests/shell-registry.test.ts`, `tests/shell-registry-win-kill.test.ts`

**Interfaces:**
- Consumes: `spillDirFor(sessionId)` + `sweepOldSpillFilesOnce()` (`tools/spill-paths.ts`), `ShellRunView`/`ShellStopReason` (`shared/types.ts`, on the branch).
- Produces:
  - `export function spawnDetached(cmd: string, args: string[], opts: SpawnOptions): ChildProcess`
  - `export function killTree(child: ChildProcess, opts?: { graceMs?: number }): void`
  - `export function formatElapsed(ms: number): string` → `"3m 02s"`, `"11m 42s"`, `"40m"`, `"1h 5m"`, `"12s"`
  - `export function stateText(run: ShellRun, now?: number): string` → `running · 3m 02s` / `exited 0 · 3m 02s` / `stopped (by you) · 3m 02s`
  - `export function formatFinishedNotice(run: ShellRun, tail: string): string`
  - `export class ShellRegistry extends EventEmitter` with `start(spec: ShellStartSpec): ShellStartResult`, `adopt(spec: ShellAdoptSpec): ShellRun`, `get(id)`, `list(): ShellRun[]`, `runningExplicitIds(): string[]`, `read(id): Promise<{ run: ShellRun; text: string; truncated: boolean } | undefined>`, `tailText(run, lines): string`, `toView(run): ShellRunView`, `kill(id, reason, opts?): Promise<KillResult>`, `killAll(reason, opts?): Promise<void>`; events `'change'` (`ShellRunView`) and `'exit'` (`ShellRun`).

- [ ] **Step 1: Write the failing tests**

`tests/shell-registry.test.ts`:

```ts
// ShellRegistry (G-1 background Bash): the one owner of every command that
// outlives its call. Process tests need /bin/bash and skip on Windows; the
// Windows kill path is unit-mocked in shell-registry-win-kill.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  ShellRegistry, MAX_EXPLICIT_RUNNING, RING_LINES, WIRE_TAIL_LINES, READ_MAX_BYTES,
  formatElapsed, formatFinishedNotice, stateText, spawnDetached,
} from '../src/main/harness/shell-registry';
import { spillRoot, sweepOldSpillFiles } from '../src/main/harness/tools/spill-paths';
import { CWD_SENTINEL, ENV_SENTINEL, stripSentinelLines, normalizeNewlines } from '../src/main/harness/tools/shell-text';

const posix = process.platform !== 'win32';
const BASH = { shellCmd: '/bin/bash', shellArgs: ['-c'] };

function startSpec(command: string, cwd: string, toolUseId = 'tu-1') {
  return { toolUseId, command, cwd, ...BASH, env: { ...process.env, NO_COLOR: '1' } };
}
function waitFor(cond: () => boolean, ms = 5_000): Promise<void> {
  const start = Date.now();
  return new Promise((res, rej) => {
    const tick = () => { if (cond()) return res(); if (Date.now() - start > ms) return rej(new Error('waitFor timed out')); setTimeout(tick, 25); };
    tick();
  });
}
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

describe('formatElapsed / stateText / formatFinishedNotice', () => {
  it('formats the way the card does: seconds, m ss, whole minutes, hours', () => {
    expect(formatElapsed(12_000)).toBe('12s');
    expect(formatElapsed(182_000)).toBe('3m 02s');
    expect(formatElapsed(702_000)).toBe('11m 42s');
    expect(formatElapsed(2_400_000)).toBe('40m');
    expect(formatElapsed(3_900_000)).toBe('1h 5m');
  });
  it('stateText names running / exited N / stopped (by whom)', () => {
    const base: any = { startedAt: 1_000, endedAt: 183_000 };
    expect(stateText({ ...base, status: 'running', endedAt: undefined }, 183_000)).toBe('running · 3m 02s');
    expect(stateText({ ...base, status: 'exited', exitCode: 0 })).toBe('exited 0 · 3m 02s');
    expect(stateText({ ...base, status: 'stopped', stopReason: 'user' })).toBe('stopped (by you) · 3m 02s');
    expect(stateText({ ...base, status: 'stopped', stopReason: 'assistant' })).toBe('stopped (by KillShell) · 3m 02s');
  });
  it('the finished notice is the §4.4 block: header, $ command, tail, log path', () => {
    const run: any = { shellId: 'sh-9c10', command: './gradlew assembleDebug', status: 'exited', exitCode: 0, startedAt: 0, endedAt: 702_000, logPath: '/tmp/x/bash-1.txt' };
    expect(formatFinishedNotice(run, 'BUILD SUCCESSFUL')).toBe(
      '[Background command sh-9c10 finished · exit 0 · 11m 42s]\n$ ./gradlew assembleDebug\nBUILD SUCCESSFUL\nFull log: /tmp/x/bash-1.txt',
    );
    const stopped: any = { ...run, status: 'stopped', stopReason: 'user', endedAt: 192_000 };
    expect(formatFinishedNotice(stopped, '')).toBe(
      '[Background command sh-9c10 stopped by you · after 3m 12s]\n$ ./gradlew assembleDebug\n(no output)\nFull log: /tmp/x/bash-1.txt',
    );
  });
  it('stripSentinelLines drops only the probe lines', () => {
    expect(stripSentinelLines(`a\n${CWD_SENTINEL}/x\nb\n${ENV_SENTINEL}/tmp/e\n`)).toBe('a\nb\n');
    expect(stripSentinelLines('plain')).toBe('plain');
  });
  it('normalizeNewlines turns a redrawing progress bar into lines, and leaves CRLF alone', () => {
    // A \r-redrawn progress bar is ONE endless line otherwise — the ring never
    // trims it and `partial` grows without bound (review 2026-08-28).
    expect(normalizeNewlines('10%\r50%\r100%\n')).toBe('10%\n50%\n100%\n');
    expect(normalizeNewlines('a\r\nb\r\n')).toBe('a\nb\n');
  });
});

describe.skipIf(!posix)('ShellRegistry (POSIX processes)', () => {
  let dir: string;
  let reg: ShellRegistry;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-reg-')); reg = new ShellRegistry(`t-${path.basename(dir)}`); });
  afterEach(async () => { await reg.killAll('app-quit', { graceMs: 0 }); fs.rmSync(dir, { recursive: true, force: true }); });

  it('start: mints an sh- id, logs from the first byte, exits with the real code, emits exit once', async () => {
    const exits: any[] = [];
    reg.on('exit', (r) => exits.push(r));
    const r = reg.start(startSpec('echo hello; exit 3', dir));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.shellId).toMatch(/^sh-[0-9a-f]{4}$/);
    expect(r.run.explicit).toBe(true);
    expect(r.runningExplicit).toBe(1);
    await r.run.exited;
    expect(r.run.status).toBe('exited');
    expect(r.run.exitCode).toBe(3);
    expect(r.run.endedAt).toBeGreaterThanOrEqual(r.run.startedAt);
    await reg.read(r.run.shellId);   // flushes the log
    expect(fs.readFileSync(r.run.logPath, 'utf8')).toBe('hello\n');
    expect(exits).toHaveLength(1);
    expect(reg.list().map((x) => x.shellId)).toEqual([r.run.shellId]);
  });

  it('read: returns only what arrived since the last read', async () => {
    const r = reg.start(startSpec('echo one; sleep 0.5; echo two', dir));
    if (!r.ok) throw new Error('start failed');
    await waitFor(() => reg.tailText(r.run, 5).includes('one'));
    const first = await reg.read(r.run.shellId);
    expect(first!.text).toBe('one\n');
    await r.run.exited;
    const second = await reg.read(r.run.shellId);
    expect(second!.text).toBe('two\n');
    const third = await reg.read(r.run.shellId);
    expect(third!.text).toBe('');
  });

  it('cap: the 6th explicit start is refused naming the running ids; adopt still succeeds', async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_EXPLICIT_RUNNING; i++) {
      const r = reg.start(startSpec('sleep 5', dir, `tu-${i}`));
      if (!r.ok) throw new Error('start failed');
      ids.push(r.run.shellId);
    }
    const sixth = reg.start(startSpec('sleep 5', dir));
    expect(sixth).toEqual({ ok: false, reason: 'cap', running: ids });
    const child = spawnDetached('/bin/bash', ['-c', 'sleep 5'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const adopted = reg.adopt({ toolUseId: 'tu-h', command: 'sleep 5', cwd: dir, child, startedAt: Date.now(), seedLog: '', recent: '', logPath: null, logStream: null, captureEnv: false });
    expect(adopted.detached).toBe(true);
    expect(adopted.explicit).toBe(false);
    expect(reg.runningExplicitIds()).toEqual(ids);
    expect(reg.list()).toHaveLength(MAX_EXPLICIT_RUNNING + 1);
  });

  it('kill reaches the grandchild (sleep 30 & wait) and records the reason', async () => {
    const r = reg.start(startSpec('sleep 30 & echo "PID=$!"; wait', dir));
    if (!r.ok) throw new Error('start failed');
    await waitFor(() => /PID=\d+/.test(reg.tailText(r.run, 5)));
    const pid = Number(/PID=(\d+)/.exec(reg.tailText(r.run, 5))![1]);
    expect(alive(pid)).toBe(true);
    const killed = await reg.kill(r.run.shellId, 'assistant');
    expect(killed.ok).toBe(true);
    expect(r.run.status).toBe('stopped');
    expect(r.run.stopReason).toBe('assistant');
    await waitFor(() => !alive(pid), 4_000);
    expect(alive(pid)).toBe(false);
    // A second kill reports the current state instead of pretending.
    expect((await reg.kill(r.run.shellId, 'user')).ok).toBe(false);
    expect((await reg.kill('sh-nope', 'user')).ok).toBe(false);
  });

  it('killAll stops every running command with the given reason', async () => {
    const a = reg.start(startSpec('sleep 5', dir, 'a'));
    const b = reg.start(startSpec('sleep 5', dir, 'b'));
    if (!a.ok || !b.ok) throw new Error('start failed');
    await reg.killAll('conversation-closed');
    expect(a.run.status).toBe('stopped');
    expect(b.run.stopReason).toBe('conversation-closed');
  });

  it('ring keeps 200 lines, the wire view carries 40, change events are debounced', async () => {
    const views: any[] = [];
    reg.on('change', (v) => views.push(v));
    const r = reg.start(startSpec('seq 1 300', dir));
    if (!r.ok) throw new Error('start failed');
    await r.run.exited;
    await new Promise((res) => setTimeout(res, 300));   // let a trailing debounce fire
    expect(r.run.tail).toHaveLength(RING_LINES);
    expect(r.run.tail[0]).toBe('101');
    const last = views[views.length - 1];
    expect(last.status).toBe('exited');
    expect(last.tail.split('\n')).toHaveLength(WIRE_TAIL_LINES);
    expect(last.tail.endsWith('300')).toBe(true);
    expect(last.toolUseId).toBe('tu-1');
    expect(last.logPath).toBe(r.run.logPath);
    // 300 lines arrived in well under a second: far fewer than 300 events.
    expect(views.length).toBeLessThan(20);
  });

  it('sentinel lines are filtered on read and in the tail, kept in the raw log; the env file is unlinked', async () => {
    const envFile = path.join(dir, 'env-dump');
    fs.writeFileSync(envFile, 'FOO=1\0');
    const child = spawnDetached('/bin/bash', ['-c', `echo out; printf '\\n${CWD_SENTINEL}%s\\n' "$PWD"; printf '\\n${ENV_SENTINEL}%s\\n' "${envFile}"`], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const run = reg.adopt({ toolUseId: 'tu-h', command: 'echo out', cwd: dir, child, startedAt: Date.now(), seedLog: 'head\n', recent: 'head\n', logPath: null, logStream: null, captureEnv: true });
    await run.exited;
    const read = await reg.read(run.shellId);
    expect(read!.text).not.toContain(CWD_SENTINEL);
    expect(read!.text).not.toContain(ENV_SENTINEL);
    expect(read!.text).toContain('head\nout');
    expect(reg.tailText(run, 50)).not.toContain(ENV_SENTINEL);
    expect(fs.readFileSync(run.logPath, 'utf8')).toContain(CWD_SENTINEL);
    expect(fs.existsSync(envFile)).toBe(false);
  });

  it("an adopted run's seeded head is ANSI-stripped like everything that follows it", async () => {
    // bash.ts keeps headBuf RAW and strips only at write time (bash.ts's own
    // spill does `stripAnsi(headBuf)`), so the registry must strip it too —
    // otherwise the first half of a handed-off log is colour codes and the
    // second half is clean, and BashOutput hands the model `[1m[30m RUN`.
    const child = spawnDetached('/bin/bash', ['-c', 'echo tail-part'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const run = reg.adopt({ toolUseId: 'tu-a', command: 'x', cwd: dir, child, startedAt: Date.now(), seedLog: '[1mBOLD[0m head\n', recent: '', logPath: null, logStream: null, captureEnv: false });
    await run.exited;
    const read = await reg.read(run.shellId);
    expect(read!.text).toBe('BOLD head\ntail-part\n');
    expect(fs.readFileSync(run.logPath, 'utf8')).not.toContain('');
  });

  it('a redrawing progress bar cannot grow the partial line without bound', async () => {
    const r = reg.start(startSpec(`printf 'p 1\\rp 2\\rp 3\\n'`, dir));
    if (!r.ok) throw new Error('start failed');
    await r.run.exited;
    expect(r.run.tail).toEqual(['p 1', 'p 2', 'p 3']);
    expect(r.run.partial).toBe('');
  });

  it('read() is bounded: a huge log returns only the last READ_MAX_BYTES, and says nothing false about it', async () => {
    // 12 MB of output must not become a 12 MB string in the main process.
    const r = reg.start(startSpec(`for i in $(seq 1 200000); do echo "line-$i-padding-padding-padding"; done`, dir));
    if (!r.ok) throw new Error('start failed');
    await r.run.exited;
    const read = await reg.read(r.run.shellId);
    expect(read!.text.length).toBeLessThanOrEqual(READ_MAX_BYTES);
    expect(read!.truncated).toBe(true);
    expect(read!.text.endsWith('line-200000-padding-padding-padding\n')).toBe(true);
    // The cursor still advances to the END of the file, so the next read is
    // "since your last look" and not a replay of the same tail.
    expect((await reg.read(r.run.shellId))!.text).toBe('');
  }, 60_000);

  it('toView is the ShellRunView shape the card renders', async () => {
    const r = reg.start(startSpec('echo v', dir));
    if (!r.ok) throw new Error('start failed');
    await r.run.exited;
    const v = reg.toView(r.run);
    expect(Object.keys(v).sort()).toEqual(['detached', 'endedAt', 'exitCode', 'logPath', 'shellId', 'startedAt', 'status', 'stopReason', 'tail', 'toolUseId']);
    expect(v.detached).toBe(false);
  });
});

describe('spill retention sweep (moved out of bash.ts so background logs are swept too)', () => {
  it('deletes files past the TTL and leaves fresh ones, in any session folder', async () => {
    const sess = path.join(spillRoot(), `sweep-test-${process.pid}`);
    fs.mkdirSync(sess, { recursive: true });
    const old = path.join(sess, 'bash-old.txt');
    const fresh = path.join(sess, 'bash-fresh.txt');
    fs.writeFileSync(old, 'x');
    fs.writeFileSync(fresh, 'x');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
    await sweepOldSpillFiles();
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    fs.rmSync(sess, { recursive: true, force: true });
  });
});
```

`tests/shell-registry-win-kill.test.ts`:

```ts
// The Windows half of "honestly killed": no process group to signal, so the
// tree is torn down with taskkill /T /F, falling back to child.kill() when
// taskkill itself cannot start. Unit-mocked — this runs on every platform.
import { describe, it, expect, vi, afterEach } from 'vitest';

const spawnMock = vi.fn();
vi.mock('child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('child_process')>();
  return { ...real, spawn: (...args: any[]) => spawnMock(...args) };
});

describe('killTree on win32', () => {
  const realPlatform = process.platform;
  afterEach(() => { Object.defineProperty(process, 'platform', { value: realPlatform }); vi.resetModules(); spawnMock.mockReset(); });

  it('spawns taskkill /PID <pid> /T /F', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    spawnMock.mockReturnValue({ on: vi.fn() });
    const { killTree } = await import('../src/main/harness/shell-registry');
    const child: any = { pid: 4242, kill: vi.fn(), exitCode: null, signalCode: null };
    killTree(child);
    expect(spawnMock).toHaveBeenCalledWith('taskkill', ['/PID', '4242', '/T', '/F'], expect.objectContaining({ windowsHide: true }));
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('falls back to child.kill() when taskkill cannot start', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    let onError: ((e: Error) => void) | undefined;
    spawnMock.mockReturnValue({ on: (ev: string, cb: any) => { if (ev === 'error') onError = cb; } });
    const { killTree } = await import('../src/main/harness/shell-registry');
    const child: any = { pid: 4242, kill: vi.fn(), exitCode: null, signalCode: null };
    killTree(child);
    onError!(new Error('ENOENT'));
    expect(child.kill).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail** — `cd /home/destin/youcoded-dev/worktrees/bash-bg/desktop && npx vitest run tests/shell-registry.test.ts tests/shell-registry-win-kill.test.ts` — Expected: FAIL with `Failed to resolve import "../src/main/harness/shell-registry"`.

- [ ] **Step 3: Write the implementation**

`src/main/harness/tools/shell-text.ts`:

```ts
// Text helpers shared by the shell tools (Bash, BashOutput, KillShell) and the
// ShellRegistry. Why its own module: bash.ts imports the registry's types and
// the registry must strip the probe sentinels bash.ts prints — a runtime
// import in both directions would leave one side undefined at load time.

/** Marker the shell prints after the user's command so bash.ts can read the
 *  final $PWD back out of stdout (scoped cwd persistence, ROADMAP 2026-07-17). */
export const CWD_SENTINEL = '__YC_CWD__';

/** Marker for the opt-in env-persistence probe: announces the path of a
 *  bash-generated temp file holding the child's exported vars. */
export const ENV_SENTINEL = '__YC_ENVFILE__';

/** Strip CSI (colour, cursor) and OSC (window title, hyperlink) sequences.
 *  Why both an env hint AND a strip: NO_COLOR/FORCE_COLOR cover most tools,
 *  but not all honour them — a vitest run rendered as `[1m[30m[46m RUN` in
 *  the 2026-08-01 review, which looks like corruption to a non-developer. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/** Turn a redrawing progress bar into ordinary lines.
 *  Why: npm, gradle, pip and docker redraw one status line with a carriage
 *  return and NO newline. Left alone, the registry's line splitter never sees
 *  a break, so the whole run collects into one endless "unfinished line" that
 *  the 200-line ring can never trim and the log grows with — the 2026-08-28
 *  review's unbounded-memory case. CRLF collapses to LF first so Windows line
 *  endings do not double up. */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Drop the probe's own sentinel lines from text the model or the card sees.
 *  Why filter on READ and not in the file: a handed-off command prints its
 *  sentinels when it finally exits, minutes after adoption, by which time the
 *  on-disk log is already streaming — the raw log keeps them (review I6). */
export function stripSentinelLines(text: string): string {
  if (!text.includes(CWD_SENTINEL) && !text.includes(ENV_SENTINEL)) return text;
  return text
    .split('\n')
    .filter((line) => !line.startsWith(CWD_SENTINEL) && !line.startsWith(ENV_SENTINEL))
    .join('\n');
}
```

In `src/main/harness/tools/bash.ts`: delete the local `const CWD_SENTINEL = '__YC_CWD__';`, `const ENV_SENTINEL = '__YC_ENVFILE__';` and the whole `export function stripAnsi(...)` block (keep their doc comments' substance in shell-text.ts as above), and add after the `./types` import:

```ts
import { CWD_SENTINEL, ENV_SENTINEL, stripAnsi, stripSentinelLines } from './shell-text';
// Why re-exported: harness-tools-core.test.ts and prerequisite-installer-era
// callers import stripAnsi from here; moving the implementation must not move
// the import path out from under them.
export { stripAnsi };
```

**Move the retention sweep to `spill-paths.ts`.** Cut `SPILL_TTL_MS`, `sweepScheduled` and
`sweepOldSpillFilesOnce()` out of `bash.ts` (they sit above `export const BashTool`, with the
long "module-level once-flag, not a timer" comment — keep that comment verbatim) and paste them
into `src/main/harness/tools/spill-paths.ts`, adding `import * as fs from 'fs';` there. Split the
body into two exports and leave the `spillRoot()`/`cutoff` logic otherwise byte-identical:

```ts
/** The sweep itself, always runs. Exported so a test can drive it directly. */
export async function sweepOldSpillFiles(): Promise<void> { /* the existing body, awaited */ }

/** Once per process, on the first spill anything writes. G-1: the ShellRegistry
 *  writes into this same tree, so the sweep can no longer live in bash.ts —
 *  a user whose commands all run in the BACKGROUND would never have triggered
 *  it there, and the logs would accumulate forever (2026-08-28 review). */
export function sweepOldSpillFilesOnce(): void {
  if (sweepScheduled) return;
  sweepScheduled = true;
  void sweepOldSpillFiles().catch(() => { /* best-effort, retried next launch */ });
}
```

In `bash.ts`, change the import to `import { spillDirFor, spillRoot, sweepOldSpillFilesOnce } from './spill-paths';` — the one call site inside `startSpill()` is unchanged.

`src/main/harness/shell-registry.ts`:

```ts
// ShellRegistry (G-1 background Bash, spec §5.1–5.3): the ONE owner of every
// native Bash command that outlives its call — started with
// run_in_background, or handed off when a foreground call reached its time
// limit. One per session; NativeSessionHost owns its lifetime (see the
// shellRegistries map there) and HarnessSession hands it to tools as
// ctx.shells. Everything a run produces goes to an on-disk log from the
// first byte; a 200-line ring stays in memory for the finished notice and
// BashOutput; the card gets the last 40 lines over the wire.
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { ShellRunView, ShellStopReason } from '../../shared/types';
import { spillDirFor, sweepOldSpillFilesOnce } from './tools/spill-paths';
import { ENV_SENTINEL, normalizeNewlines, stripAnsi, stripSentinelLines } from './tools/shell-text';

/** Explicit background starts allowed at once (spec §3.6). Hand-offs never count (D5). */
export const MAX_EXPLICIT_RUNNING = 5;
/** Lines kept main-side per run — enough for the 50-line finished notice with margin. */
export const RING_LINES = 200;
/** Lines sent to the card per 'change' event (review G: the wire is a phone on cellular). */
export const WIRE_TAIL_LINES = 40;
/** Lines quoted in the finished notice (spec §4.4). */
export const NOTICE_TAIL_LINES = 50;
/** SIGTERM first, SIGKILL this long after (spec §5.2). */
export const TERM_GRACE_MS = 2_000;
/** How long KillShell waits for the exit before reporting (spec §4.3). */
export const KILL_WAIT_MS = 5_000;
/** ≤4 'change' events per second per run (spec §5.1). */
export const CHANGE_DEBOUNCE_MS = 250;
/** Most bytes one read() returns. A 20-minute build's log runs to hundreds of
 *  MB; reading all of it into the main process to slice off the tail is how you
 *  wedge the app (2026-08-28 review). 1 MB is far more than the 200 lines
 *  BashOutput shows, so nothing the model can see is lost by this bound. */
export const READ_MAX_BYTES = 1_000_000;
/** Hard ceiling on the unfinished last line, after \r normalization — a single
 *  genuinely enormous line (minified JSON, a base64 blob) is flushed rather
 *  than held in memory forever. */
const MAX_PARTIAL_CHARS = 64_000;

export interface ShellRun {
  shellId: string;
  toolUseId: string;
  command: string;
  cwd: string;
  child: ChildProcess;
  logPath: string;
  logStream: fs.WriteStream;
  /** Last RING_LINES complete lines (ANSI-stripped, sentinels included — filtered on read). */
  tail: string[];
  /** The unterminated final line, if any. */
  partial: string;
  /** Where the previous BashOutput read ended (byte offset into the log). */
  lastReadBytes: number;
  /** persistent_env was requested on the call that got handed off: unlink the
   *  env temp file the probe names when the command exits (D6). */
  captureEnv: boolean;
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'exited' | 'stopped';
  exitCode?: number;
  /** Set when the process died from a signal we did not send (exitCode stays unset). */
  signal?: string;
  stopReason?: ShellStopReason;
  /** Handed off at its time limit rather than started in the background. */
  detached: boolean;
  /** Counts toward the cap (D5). */
  explicit: boolean;
  /** The host queued the finished notice (set by the host, never here). */
  reported: boolean;
  /** Resolves when the process has exited. */
  exited: Promise<void>;
  // internals
  resolveExited: () => void;
  logPending: number;
  logWaiters: Array<() => void>;
  logDone: Promise<void> | null;
  changeTimer: NodeJS.Timeout | null;
}

export interface ShellStartSpec {
  toolUseId: string;
  command: string;
  cwd: string;
  shellCmd: string;
  shellArgs: string[];
  env: NodeJS.ProcessEnv;
}

export interface ShellAdoptSpec {
  toolUseId: string;
  command: string;
  cwd: string;
  /** The SAME process bash.ts spawned — never restarted. */
  child: ChildProcess;
  startedAt: number;
  /** Everything captured so far when no spill stream exists yet (bash.ts's headBuf). */
  seedLog: string | null;
  /** The most recent output (bash.ts's tailBuf) — seeds the tail ring. */
  recent: string;
  /** bash.ts's open spill stream + path, when the output already overflowed. */
  logPath: string | null;
  logStream: fs.WriteStream | null;
  captureEnv: boolean;
}

export type ShellStartResult =
  | { ok: true; run: ShellRun; runningExplicit: number }
  | { ok: false; reason: 'cap'; running: string[] }
  | { ok: false; reason: 'spawn-failed'; detail: string };

export type KillResult = { ok: true; run: ShellRun } | { ok: false; run?: ShellRun };

/** spawn() in its own process group on POSIX. Why: a plain spawn puts the
 *  shell in OUR group, so a kill reaches only the outer bash and a `node` it
 *  started lives on (spec §1 — today's Escape orphans grandchildren). Windows
 *  has no groups worth using here; killTree walks the tree with taskkill. */
export function spawnDetached(cmd: string, args: string[], opts: SpawnOptions): ChildProcess {
  return spawn(cmd, args, { ...opts, windowsHide: true, detached: process.platform !== 'win32' });
}

/** Kill the whole process family. POSIX: SIGTERM to the group, SIGKILL after
 *  `graceMs` (0 = SIGKILL at once). Windows: `taskkill /PID <pid> /T /F`,
 *  falling back to child.kill() if taskkill itself cannot start. Returns
 *  immediately — callers that need the exit await `run.exited`. */
export function killTree(child: ChildProcess, opts: { graceMs?: number } = {}): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      tk.on('error', () => { try { child.kill(); } catch { /* already gone */ } });
    } catch {
      try { child.kill(); } catch { /* already gone */ }
    }
    return;
  }
  const signal = (sig: NodeJS.Signals) => {
    // -pid = the whole group. ESRCH/EPERM (group already gone, or a child that
    // was not spawned detached) falls back to the single process.
    try { process.kill(-pid, sig); } catch { try { child.kill(sig); } catch { /* already gone */ } }
  };
  const grace = opts.graceMs ?? TERM_GRACE_MS;
  if (grace <= 0) { signal('SIGKILL'); return; }
  signal('SIGTERM');
  const t = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signal('SIGKILL');
  }, grace);
  t.unref();
}

/** "3m 02s" / "11m 42s" / "40m" / "1h 5m" / "12s" — the card's own format. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return sec ? `${m}m ${String(sec).padStart(2, '0')}s` : `${m}m`;
  return `${sec}s`;
}

const STOP_WORDS: Record<ShellStopReason, string> = {
  user: 'by you',
  assistant: 'by KillShell',
  'conversation-closed': 'when the conversation closed',
  'app-quit': 'when the app quit',
};

function elapsedOf(run: Pick<ShellRun, 'startedAt' | 'endedAt'>, now = Date.now()): string {
  return formatElapsed((run.endedAt ?? now) - run.startedAt);
}

/** `running · 3m 02s` / `exited 0 · 3m 02s` / `stopped (by you) · 3m 02s` — the
 *  model-facing state phrase BashOutput and KillShell both use. */
export function stateText(run: Pick<ShellRun, 'status' | 'exitCode' | 'signal' | 'stopReason' | 'startedAt' | 'endedAt'>, now = Date.now()): string {
  const elapsed = elapsedOf(run, now);
  if (run.status === 'running') return `running · ${elapsed}`;
  if (run.status === 'stopped') return `stopped (${STOP_WORDS[run.stopReason ?? 'user']}) · ${elapsed}`;
  const code = run.exitCode ?? (run.signal ? `? (killed by ${run.signal})` : '?');
  return `exited ${code} · ${elapsed}`;
}

/** The §4.4 finished notice. A user Stop is reported too (the model must know
 *  its server is gone); KillShell's own result is its notice, so the host never
 *  asks for one in that case. */
export function formatFinishedNotice(run: Pick<ShellRun, 'shellId' | 'command' | 'status' | 'exitCode' | 'signal' | 'stopReason' | 'startedAt' | 'endedAt' | 'logPath'>, tail: string): string {
  const elapsed = elapsedOf(run);
  const head = run.status === 'stopped'
    ? `[Background command ${run.shellId} stopped ${STOP_WORDS[run.stopReason ?? 'user']} · after ${elapsed}]`
    : `[Background command ${run.shellId} finished · exit ${run.exitCode ?? (run.signal ? `? (killed by ${run.signal})` : '?')} · ${elapsed}]`;
  return `${head}\n$ ${run.command}\n${tail.trim() || '(no output)'}\nFull log: ${run.logPath}`;
}

export class ShellRegistry extends EventEmitter {
  private runs = new Map<string, ShellRun>();

  constructor(private readonly sessionId: string) { super(); }

  get(shellId: string): ShellRun | undefined { return this.runs.get(shellId); }

  /** Every run this session has had, oldest first — finished ones INCLUDED and
   *  never evicted. Why no cap: a finished run holds at most 200 short lines
   *  (tens of KB), while evicting one would make BashOutput answer "No
   *  background command sh-abcd" about a command that plainly existed — a
   *  false statement, which docs/error-message-standards.md forbids. The
   *  registry dies with the conversation, so nothing accumulates across them. */
  list(): ShellRun[] { return [...this.runs.values()]; }

  runningExplicitIds(): string[] {
    return this.list().filter((r) => r.explicit && r.status === 'running').map((r) => r.shellId);
  }

  /** Explicit background start (run_in_background). stdin is 'ignore' so a
   *  command that waits for input fails fast with its own error instead of
   *  hanging forever with no way to answer it (D4). */
  start(spec: ShellStartSpec): ShellStartResult {
    const running = this.runningExplicitIds();
    if (running.length >= MAX_EXPLICIT_RUNNING) return { ok: false, reason: 'cap', running };
    let child: ChildProcess;
    try {
      child = spawnDetached(spec.shellCmd, [...spec.shellArgs, spec.command], {
        cwd: spec.cwd, env: spec.env, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      return { ok: false, reason: 'spawn-failed', detail: e?.message ?? String(e) };
    }
    const run = this.register({
      toolUseId: spec.toolUseId, command: spec.command, cwd: spec.cwd, child,
      startedAt: Date.now(), seedLog: null, recent: '', logPath: null, logStream: null, captureEnv: false,
    }, { detached: false, explicit: true });
    return { ok: true, run, runningExplicit: running.length + 1 };
  }

  /** Hand-off (spec §5.5): the same process bash.ts already spawned, adopted
   *  in place. Never refused — a working build is not killed over a
   *  bookkeeping number (D5). */
  adopt(spec: ShellAdoptSpec): ShellRun {
    return this.register(spec, { detached: true, explicit: false });
  }

  private register(spec: ShellAdoptSpec, flags: { detached: boolean; explicit: boolean }): ShellRun {
    const shellId = this.mintId();
    let { logPath, logStream } = spec;
    if (!logStream || !logPath) {
      // Open at spawn, not lazily at the 4,000-char mark like a foreground
      // call's spill (review I1): a background command's full output must
      // exist on disk from its first byte — the card's log path is promised
      // the moment the run starts.
      const dir = spillDirFor(this.sessionId);
      fs.mkdirSync(dir, { recursive: true });
      logPath = path.join(dir, `bash-${Date.now()}-${shellId}.txt`);
      logStream = fs.createWriteStream(logPath);
      // The 7-day sweep used to fire only from bash.ts's foreground spill; a
      // user whose long commands all run in the background would never have
      // triggered it, and these logs would pile up forever (2026-08-28 review).
      sweepOldSpillFilesOnce();
    }
    // A write error must never crash the main process — the run keeps going
    // and BashOutput/the notice fall back to the in-memory tail.
    logStream.on('error', () => { /* logged via the tail below on first failure */ });
    let resolveExited: () => void = () => {};
    const exited = new Promise<void>((res) => { resolveExited = res; });
    const run: ShellRun = {
      shellId, toolUseId: spec.toolUseId, command: spec.command, cwd: spec.cwd, child: spec.child,
      logPath, logStream, tail: [], partial: '', lastReadBytes: 0, captureEnv: spec.captureEnv,
      startedAt: spec.startedAt, status: 'running', detached: flags.detached, explicit: flags.explicit,
      reported: false, exited, resolveExited, logPending: 0, logWaiters: [], logDone: null, changeTimer: null,
    };
    // stripAnsi, because bash.ts keeps headBuf RAW and strips only at write
    // time (its own spill does `stripAnsi(headBuf)`). Without this the seeded
    // half of a handed-off log carries colour codes while everything after it
    // is clean, and the model's first BashOutput reads `[1m[30m RUN`.
    if (spec.seedLog && !spec.logStream) this.writeLog(run, stripAnsi(normalizeNewlines(spec.seedLog)));
    if (spec.recent) this.ingest(run, spec.recent, false);
    this.runs.set(shellId, run);
    spec.child.stdout?.on('data', (d) => this.ingest(run, String(d), true));
    spec.child.stderr?.on('data', (d) => this.ingest(run, String(d), true));
    spec.child.on('error', (err) => {
      this.ingest(run, `Failed to start shell: ${err.message}\n`, true);
      this.onExit(run, null, null);
    });
    spec.child.on('exit', (code, signal) => this.onExit(run, code, signal));
    // Adopted after it already died (a race with the time limit) — settle now.
    if (spec.child.exitCode !== null || spec.child.signalCode !== null) this.onExit(run, spec.child.exitCode, spec.child.signalCode);
    else this.emitChangeNow(run);
    return run;
  }

  private mintId(): string {
    let id: string;
    do { id = `sh-${randomBytes(2).toString('hex')}`; } while (this.runs.has(id));
    return id;
  }

  private writeLog(run: ShellRun, text: string): void {
    if (run.logDone || run.logStream.destroyed) return;
    run.logPending += 1;
    run.logStream.write(text, () => {
      run.logPending -= 1;
      if (run.logPending === 0) { const w = run.logWaiters.splice(0); for (const fn of w) fn(); }
    });
  }

  /** Resolves once every write issued so far is on disk — what makes a
   *  byte-offset read of the log honest while the stream is still open. */
  private flushLog(run: ShellRun): Promise<void> {
    if (run.logDone) return run.logDone;
    if (run.logPending === 0) return Promise.resolve();
    return new Promise((res) => run.logWaiters.push(res));
  }

  private ingest(run: ShellRun, raw: string, live: boolean): void {
    const text = stripAnsi(normalizeNewlines(raw));
    if (live) this.writeLog(run, text);
    const lines = (run.partial + text).split('\n');
    run.partial = lines.pop() ?? '';
    // A single line with no newline in sight (minified JSON, a base64 blob)
    // would otherwise sit in memory unbounded — flush it as a line instead.
    if (run.partial.length > MAX_PARTIAL_CHARS) { lines.push(run.partial); run.partial = ''; }
    for (const line of lines) run.tail.push(line);
    if (run.tail.length > RING_LINES) run.tail.splice(0, run.tail.length - RING_LINES);
    if (live) this.scheduleChange(run);
  }

  private onExit(run: ShellRun, code: number | null, signal: NodeJS.Signals | null): void {
    if (run.status !== 'running') return;
    run.endedAt = Date.now();
    if (run.stopReason) {
      run.status = 'stopped';
    } else {
      run.status = 'exited';
      if (code !== null) run.exitCode = code;
      else if (signal) run.signal = signal;
    }
    if (run.partial) { run.tail.push(run.partial); run.partial = ''; if (run.tail.length > RING_LINES) run.tail.shift(); }
    run.logDone = new Promise<void>((res) => {
      if (run.logStream.destroyed) return res();
      run.logStream.end(() => res());
    });
    if (run.captureEnv) this.unlinkEnvFile(run);
    this.emitChangeNow(run);
    run.resolveExited();
    this.emit('exit', run);
  }

  /** D6: the persistent_env temp file the probe wrote when the handed-off
   *  command finally exited — bash.ts's finish() never ran for this call, so
   *  nobody else will delete it. */
  private unlinkEnvFile(run: ShellRun): void {
    for (let i = run.tail.length - 1; i >= 0; i--) {
      const line = run.tail[i];
      if (!line.startsWith(ENV_SENTINEL)) continue;
      const file = line.slice(ENV_SENTINEL.length).trim();
      if (file) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
      return;
    }
  }

  private scheduleChange(run: ShellRun): void {
    if (run.changeTimer) return;
    run.changeTimer = setTimeout(() => { run.changeTimer = null; this.emit('change', this.toView(run)); }, CHANGE_DEBOUNCE_MS);
  }

  private emitChangeNow(run: ShellRun): void {
    if (run.changeTimer) { clearTimeout(run.changeTimer); run.changeTimer = null; }
    this.emit('change', this.toView(run));
  }

  /** The last `lines` lines, sentinel lines removed. */
  tailText(run: ShellRun, lines: number): string {
    const all = run.partial ? [...run.tail, run.partial] : run.tail;
    return stripSentinelLines(all.slice(-lines).join('\n'));
  }

  toView(run: ShellRun): ShellRunView {
    return {
      toolUseId: run.toolUseId, shellId: run.shellId, status: run.status,
      exitCode: run.exitCode, stopReason: run.stopReason, detached: run.detached,
      startedAt: run.startedAt, endedAt: run.endedAt,
      tail: this.tailText(run, WIRE_TAIL_LINES), logPath: run.logPath,
    };
  }

  /** New output since the last read (first read: everything so far). The log's
   *  byte length at the last read IS the cursor (review §5.2).
   *
   *  Reads POSITIONALLY and bounded: never load the whole log. A long build's
   *  log runs to hundreds of MB, and eight polls a turn would each have loaded
   *  all of it just to slice off the tail (2026-08-28 review). When more than
   *  READ_MAX_BYTES is new, the LAST READ_MAX_BYTES are returned, `truncated`
   *  says so, and the cursor still advances to the end of the file — so the
   *  next read is genuinely "since your last look" rather than a replay. */
  async read(shellId: string): Promise<{ run: ShellRun; text: string; truncated: boolean } | undefined> {
    const run = this.runs.get(shellId);
    if (!run) return undefined;
    await this.flushLog(run);
    let fd: number | undefined;
    let text = '';
    let truncated = false;
    let size = run.lastReadBytes;
    try {
      fd = fs.openSync(run.logPath, 'r');
      size = fs.fstatSync(fd).size;
      const pending = Math.max(0, size - run.lastReadBytes);
      const want = Math.min(pending, READ_MAX_BYTES);
      truncated = pending > want;
      if (want > 0) {
        const buf = Buffer.alloc(want);
        fs.readSync(fd, buf, 0, want, size - want);
        text = buf.toString('utf8');
        // A bounded read can start mid-line; drop the first partial line rather
        // than hand the model half a word it cannot place.
        if (truncated) text = text.slice(text.indexOf('\n') + 1);
      }
    } catch {
      // The log is best-effort (a write error, a swept file). Fall back to the
      // in-memory ring so a read still answers with the truth we do hold.
      text = run.lastReadBytes === 0 ? this.tailText(run, RING_LINES) : '';
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    }
    run.lastReadBytes = size;
    return { run, text: stripSentinelLines(text), truncated };
  }

  /** Kill the family and wait up to KILL_WAIT_MS for the exit. The reason is
   *  recorded BEFORE the signal so the exit handler labels it 'stopped'. */
  async kill(shellId: string, reason: ShellStopReason, opts: { graceMs?: number } = {}): Promise<KillResult> {
    const run = this.runs.get(shellId);
    if (!run) return { ok: false };
    if (run.status !== 'running') return { ok: false, run };
    run.stopReason = reason;
    killTree(run.child, opts);
    await Promise.race([run.exited, new Promise<void>((res) => setTimeout(res, KILL_WAIT_MS).unref())]);
    return { ok: true, run };
  }

  async killAll(reason: ShellStopReason, opts: { graceMs?: number } = {}): Promise<void> {
    await Promise.all(this.list().filter((r) => r.status === 'running').map((r) => this.kill(r.shellId, reason, opts)));
  }
}
```

- [ ] **Step 4: Run the tests** — `cd /home/destin/youcoded-dev/worktrees/bash-bg/desktop && npx vitest run tests/shell-registry.test.ts tests/shell-registry-win-kill.test.ts tests/harness-tools-core.test.ts` — Expected: PASS (the core suite proves the `stripAnsi` re-export and sentinel move changed nothing).

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/main/harness/shell-registry.ts desktop/src/main/harness/tools/shell-text.ts desktop/src/main/harness/tools/spill-paths.ts desktop/src/main/harness/tools/bash.ts desktop/tests/shell-registry.test.ts desktop/tests/shell-registry-win-kill.test.ts && git commit -m "feat(harness): ShellRegistry — process-group runs, log from first byte, tree kill (G-1 Task 1)

One registry per session owns every Bash command that outlives its call:
detached spawn, SIGTERM→SIGKILL group kill (taskkill /T on Windows), on-disk
log from the first byte, 200-line ring, 40-line wire view, debounced change
events, env-file cleanup on exit. Reads are positional and bounded so a huge
log is never loaded whole. The 7-day spill sweep moves to spill-paths.ts so
these logs are swept too. Nothing uses it yet.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```

---

### Task 2: Wire the registry into `HarnessSession`; foreground Bash spawns detached and kills the family on abort

**Files:**
- Modify `src/main/harness/tools/types.ts` (`ToolContext.shells`)
- Modify `src/main/harness/harness-session.ts` (`HarnessSessionOpts.shells`, ctx)
- Modify `src/main/harness/tools/bash.ts` (`spawnDetached`, `killTree` on abort and timeout)
- Test `tests/bash-background.test.ts` (new — Tasks 2–4 add to it), `tests/harness-session-loop.test.ts`

**Interfaces:**
- Consumes: `spawnDetached`, `killTree` (Task 1).
- Produces: `ToolContext.shells?: ShellRegistry`; `HarnessSessionOpts.shells?: ShellRegistry`.

- [ ] **Step 1: Write the failing tests**

`tests/bash-background.test.ts`:

```ts
// G-1 background Bash — the Bash tool's half: foreground family kill (Task 2),
// run_in_background (Task 3), hand-off at the time limit (Task 4).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BashTool } from '../src/main/harness/tools/bash';
import { ShellRegistry, MAX_EXPLICIT_RUNNING } from '../src/main/harness/shell-registry';
import type { ToolContext } from '../src/main/harness/tools/types';

const posix = process.platform !== 'win32';
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
function waitFor(cond: () => boolean, ms = 5_000): Promise<void> {
  const start = Date.now();
  return new Promise((res, rej) => {
    const tick = () => { if (cond()) return res(); if (Date.now() - start > ms) return rej(new Error('waitFor timed out')); setTimeout(tick, 25); };
    tick();
  });
}

let dir: string;
let reg: ShellRegistry;
function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return { sessionId: 'bg-test', cwd: dir, signal: new AbortController().signal, readRegistry: new Map(), todos: [], toolCallId: 'toolu_bg', shells: reg, ...over };
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bash-bg-')); reg = new ShellRegistry('bg-test'); });
afterEach(async () => { await reg.killAll('app-quit', { graceMs: 0 }); fs.rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(!posix)('Task 2: foreground interrupt kills the grandchild and still resolves immediately', () => {
  it('sleep 30 & wait — abort resolves at once, the grandchild is gone within the grace period', async () => {
    const ac = new AbortController();
    const pidFile = path.join(dir, 'pid');
    const promise = BashTool.execute({ command: `sleep 30 & echo $! > "${pidFile}"; wait` }, ctx({ signal: ac.signal, shells: undefined }));
    await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim() !== '');
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    expect(alive(pid)).toBe(true);
    const t0 = Date.now();
    ac.abort();
    const r = await promise;
    expect(Date.now() - t0).toBeLessThan(1_000);   // resolves NOW, never waits for 'close'
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Canceled: the user interrupted this operation/);
    await waitFor(() => !alive(pid), 4_000);
    expect(alive(pid)).toBe(false);
  }, 15_000);
});
```

Add to `tests/harness-session-loop.test.ts` (inside the top-level `describe('HarnessSession — multi-step turn driver'`):

```ts
  it('G-1: opts.shells reaches the tool as ctx.shells (absent when not wired)', async () => {
    let seen: unknown = 'unset';
    const probe = fakeTool('Read', { onExecute: (_a, c) => { seen = c.shells; return { text: 'ok' }; } });
    const model = scriptedModel([
      stream(toolCallChunk('c1', 'Read', { file_path: 'x.ts' }), finishChunk('tool-calls')),
      stream(...textChunks('b', 'done'), finishChunk('stop')),
    ]);
    const shells = { marker: 'registry' } as any;
    const session = new HarnessSession(makeOpts({ tools: [probe], decide: async () => ALLOW, shells }), async () => model as any);
    collect(session);
    await session.send('go');
    expect(seen).toBe(shells);
  });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/bash-background.test.ts tests/harness-session-loop.test.ts -t "G-1|Task 2"` — Expected: FAIL — the grandchild is still alive after the abort (`expected true to be false`), and `seen` is `undefined`.

- [ ] **Step 3: Implement**

`src/main/harness/tools/types.ts` — add the import at the top and the field at the end of `ToolContext` (after `supportsVision`):

```ts
import type { ShellRegistry } from '../shell-registry';
```
```ts
  /** G-1 background Bash: this session's shell registry — where a
   *  run_in_background start or a handed-off command lives, and what
   *  BashOutput/KillShell read. Absent in test/one-off contexts, in which
   *  case Bash refuses run_in_background and a time limit still kills. */
  shells?: ShellRegistry;
```

`src/main/harness/harness-session.ts` — add `import type { ShellRegistry } from './shell-registry';` next to the other harness imports; in `HarnessSessionOpts` add `shells?: ShellRegistry;` after `specialistRoster?`; in `runOneTool`'s `tool.execute(args, { … })` object add, after `supportsVision`:

```ts
      // G-1: the session's shell registry (host-owned — see NativeSessionHost.shellsFor).
      ...(this.opts.shells ? { shells: this.opts.shells } : {}),
```

`src/main/harness/tools/bash.ts`:
- Add `import { spawnDetached, killTree } from '../shell-registry';` (type-free runtime import is fine: shell-registry does not import bash.ts).
- Replace the `child = spawn(shell.cmd, [...], { cwd: startCwd, windowsHide: true, env: spawnEnv });` call with:

```ts
        // Why detached (G-1, a behaviour change): the command gets its own
        // process group, so an interrupt reaches everything it started — the
        // old child.kill('SIGKILL') reached only the outer bash and left a
        // `node` it started running (spec §1).
        child = spawnDetached(shell.cmd, [...shell.args, probe ? withCwdProbe(args.command, captureEnv) : args.command], {
          cwd: startCwd,
          env: spawnEnv,
        });
```
- Replace the two `child.kill('SIGKILL')` lines: in the timeout timer with `killTree(child, { graceMs: 0 });` (still a force-kill, so the "(SIGKILL)" prose stays true — Task 4 rewrites this timer), and in `onAbort` with:

```ts
        // Kill the FAMILY and resolve NOW (the comment above explains why we
        // cannot wait for 'close'); the SIGTERM→SIGKILL escalation runs on
        // after this call returns.
        killTree(child);
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/bash-background.test.ts tests/harness-session-loop.test.ts tests/harness-tools-core.test.ts tests/harness-hardening.test.ts` — Expected: PASS (the pre-existing abort and timeout tests still hold).

- [ ] **Step 5: Commit**

```bash
bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/main/harness/tools/types.ts desktop/src/main/harness/harness-session.ts desktop/src/main/harness/tools/bash.ts desktop/tests/bash-background.test.ts desktop/tests/harness-session-loop.test.ts && git commit -m "feat(harness): ctx.shells + foreground Bash spawns detached and kills the family on abort (G-1 Task 2)

Escape used to SIGKILL only the outer bash; a node it started lived on.
The registry rides HarnessSessionOpts.shells into ToolContext — still unset
by the host until Task 6.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```

---

### Task 3: `run_in_background` on Bash

**Files:**
- Modify `src/main/harness/tools/bash.ts` (schema, early branch, description)
- Test `tests/bash-background.test.ts`, `tests/native-tools-polish.test.ts`

**Interfaces:**
- Consumes: `ShellRegistry.start`, `MAX_EXPLICIT_RUNNING`.
- Produces: Bash param `run_in_background?: boolean`; start result text (§4.1); refusals.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bash-background.test.ts`:

```ts
describe.skipIf(!posix)('Task 3: run_in_background', () => {
  it('returns at once with the §4.1 text and a running registry entry; the tool result is not an error', async () => {
    const t0 = Date.now();
    const r = await BashTool.execute({ command: 'sleep 3', run_in_background: true }, ctx());
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/^Started in the background \(shell id sh-[0-9a-f]{4}\)\. You'll be told when it finishes\. BashOutput reads new output \(or lists runs\); KillShell stops it\. Running now: 1 of 5\.$/);
    const run = reg.list()[0];
    expect(run.status).toBe('running');
    expect(run.toolUseId).toBe('toolu_bg');
    expect(run.explicit).toBe(true);
  });

  it('a background start never changes the working directory or the env', async () => {
    let tracked: string | undefined;
    let env: unknown;
    fs.mkdirSync(path.join(dir, 'sub'));
    await BashTool.execute({ command: 'cd sub; export FOO=1' , run_in_background: true }, ctx({ setShellCwd: (n) => { tracked = n; }, setShellEnv: (e) => { env = e; } }));
    await reg.list()[0].exited;
    expect(tracked).toBeUndefined();
    expect(env).toBeUndefined();
  });

  it('stdin is closed: a command that waits for input fails fast instead of hanging', async () => {
    await BashTool.execute({ command: 'read line; echo "got=$line"; exit 7', run_in_background: true }, ctx());
    const run = reg.list()[0];
    await Promise.race([run.exited, new Promise((_, rej) => setTimeout(() => rej(new Error('hung on stdin')), 3_000))]);
    expect(run.exitCode).toBe(7);
  });

  it('persistent_env + run_in_background is refused in one sentence', async () => {
    const r = await BashTool.execute({ command: 'echo x', run_in_background: true, persistent_env: true }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toBe('Bash rejected: persistent_env cannot be combined with run_in_background — a background command never reports its environment back. Drop one of the two.');
    expect(reg.list()).toHaveLength(0);
  });

  it('with no registry in the context, run_in_background is refused (never silently foregrounded)', async () => {
    const r = await BashTool.execute({ command: 'echo x', run_in_background: true }, ctx({ shells: undefined }));
    expect(r.isError).toBe(true);
    expect(r.text).toBe('Bash rejected: background execution is not available in this session.');
  });

  it('the 6th explicit start is refused naming the running ids', async () => {
    for (let i = 0; i < MAX_EXPLICIT_RUNNING; i++) await BashTool.execute({ command: 'sleep 5', run_in_background: true }, ctx());
    const ids = reg.runningExplicitIds();
    const r = await BashTool.execute({ command: 'sleep 5', run_in_background: true }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toBe(`5 background commands are already running (${ids.join(', ')}). Stop one with KillShell before starting another.`);
  });
});
```

Add to `tests/native-tools-polish.test.ts` (new describe at the end; `ctx` is the file's existing context):

```ts
describe('G-1: Bash description — background execution', () => {
  it('names run_in_background, BashOutput, KillShell, the hand-off, and the cwd asymmetry; drops SIGKILL and exit 124', () => {
    const d = BashTool.description;
    expect(d).toMatch(/run_in_background/);
    expect(d).toMatch(/BashOutput/);
    expect(d).toMatch(/KillShell/);
    expect(d).toMatch(/handed off to the background/);
    expect(d).toMatch(/only a foreground command changes your working directory/i);
    expect(d).toMatch(/leading `sleep`/);
    expect(d).not.toMatch(/SIGKILL|force-kill/);
    expect(d).not.toMatch(/\b124\b/);
  });
  it('the schema accepts run_in_background and stays strict', () => {
    expect(BashTool.inputSchema.safeParse({ command: 'x', run_in_background: true }).success).toBe(true);
    expect(BashTool.inputSchema.safeParse({ command: 'x', background: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/bash-background.test.ts tests/native-tools-polish.test.ts -t "Task 3|G-1"` — Expected: FAIL — `unrecognized_keys` for `run_in_background`; description lacks `BashOutput`.

- [ ] **Step 3: Implement** in `src/main/harness/tools/bash.ts`

Import `MAX_EXPLICIT_RUNNING` alongside `spawnDetached, killTree` from `'../shell-registry'`.

Schema — add after `persistent_env`:

```ts
    // G-1 (2026-08-28): start the command and return at once with a shell id.
    run_in_background: z
      .boolean()
      .optional()
      .describe('Start the command and return at once with a shell id; you are told when it finishes. For servers, long builds, anything over a couple of minutes.'),
```

Execute — insert right before `return new Promise((resolve) => {` (after `envNotice` is computed):

```ts
    // G-1: an explicit background start (spec §4.1). No cwd probe, no env
    // capture (D6) — the registry runs the bare command; stdin is closed
    // there (D4). The call resolves with the launch acknowledgment; the
    // finished notice arrives on its own at the next idle boundary.
    if (args.run_in_background) {
      if (args.persistent_env) {
        return { text: 'Bash rejected: persistent_env cannot be combined with run_in_background — a background command never reports its environment back. Drop one of the two.', isError: true };
      }
      if (!ctx.shells) {
        return { text: 'Bash rejected: background execution is not available in this session.', isError: true };
      }
      const started = ctx.shells.start({
        toolUseId: ctx.toolCallId ?? 'unknown', command: args.command, cwd: startCwd,
        shellCmd: shell.cmd, shellArgs: shell.args, env: spawnEnv,
      });
      if (!started.ok) {
        if (started.reason === 'cap') {
          return { text: `${MAX_EXPLICIT_RUNNING} background commands are already running (${started.running.join(', ')}). Stop one with KillShell before starting another.`, isError: true };
        }
        return { text: `Failed to start shell: ${started.detail} (shell=${shell.cmd}; cwd=${startCwd})`, isError: true };
      }
      return {
        text: `Started in the background (shell id ${started.run.shellId}). You'll be told when it finishes. BashOutput reads new output (or lists runs); KillShell stops it. Running now: ${started.runningExplicit} of ${MAX_EXPLICIT_RUNNING}.`,
      };
    }
```

Description — in `bashDescription()`, replace the final two sentences (from the `// Fix (2026-08-10 review): 3 of 5 models found the old \`exit ?\` timeout marker` comment through `'... is reported as exit 124.'`) with:

```ts
    // G-1 (2026-08-28): a time limit is no longer a kill. The old "SIGKILL /
    // exit 124" sentence is gone on purpose — a foreground command that is
    // still running at its timeout is handed off to the background (Task 4);
    // only a leading `sleep` still simply times out.
    'Long commands: pass `run_in_background: true` to start a command and return at once with a ' +
    'shell id — for servers, long builds, anything over a couple of minutes. You are told when it ' +
    'finishes; BashOutput reads its new output (or lists your background commands); KillShell stops it. ' +
    'A foreground command still running at its timeout (default 2 minutes, max 10 via `timeout`) is ' +
    'handed off to the background the same way instead of being killed — except a leading `sleep`, ' +
    'which simply times out. Only a foreground command changes your working directory; a background ' +
    'or handed-off command never changes it and never carries `persistent_env`.'
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/bash-background.test.ts tests/native-tools-polish.test.ts tests/tool-registry-manifest.test.ts tests/harness-tools-core.test.ts` — Expected: PASS. (`tool-registry-manifest`'s "no tool advises a parameter its own schema does not accept" still holds: the new text names no `offset`/`limit`.)

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/main/harness/tools/bash.ts desktop/tests/bash-background.test.ts desktop/tests/native-tools-polish.test.ts && git commit -m "feat(harness): Bash run_in_background — start at once with a shell id (G-1 Task 3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```
---

### Task 4: Hand-off at the time limit

**Files:**
- Modify `src/main/harness/tools/bash.ts` (timer → `adopt`, `sleep` exemption, finish() handoff branch)
- Test `tests/bash-background.test.ts`

**Interfaces:**
- Consumes: `ShellRegistry.adopt`, `formatElapsed`.
- Produces: hand-off result text (§4.1); `ToolResultPayload & { handedOffTo?: string }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bash-background.test.ts`:

```ts
describe.skipIf(!posix)('Task 4: hand-off at the time limit', () => {
  it('a foreground command at its limit is adopted — no SIGKILL, no exit 124, text names the id', async () => {
    const r: any = await BashTool.execute({ command: 'echo early; node -e "setTimeout(()=>{}, 4000)"', timeout: 400 }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.timedOut).toBe(false);
    expect(r.text).toMatch(/^Still running after \d+s — handed off to the background \(shell id sh-[0-9a-f]{4}\)\. You'll be told when it finishes\./);
    expect(r.text).not.toMatch(/exit 124|SIGKILL|force-killed/);
    expect(r.text).toContain('early');                       // output so far, under the usual bounds
    const run = reg.list()[0];
    expect(run.status).toBe('running');
    expect(run.detached).toBe(true);
    expect(run.explicit).toBe(false);
    expect(r.handedOffTo).toBe(run.shellId);
    expect(r.text).toContain(`log: ${run.logPath}`);
    expect(alive(run.child.pid!)).toBe(true);                // the SAME process, never restarted
    await reg.kill(run.shellId, 'assistant');
  });

  it('a leading `sleep` is never handed off — it times out and reports as today', async () => {
    const r: any = await BashTool.execute({ command: 'sleep 5', timeout: 300 }, ctx());
    expect(r.isError).toBe(true);
    expect(r.timedOut).toBe(true);
    expect(r.text).toContain('· exit 124]');
    expect(reg.list()).toHaveLength(0);
  }, 10_000);

  it('a handed-off run applies neither cwd nor persistent_env; the env temp file is removed; the sentinel is filtered on read', async () => {
    let tracked: string | undefined;
    let env: unknown;
    fs.mkdirSync(path.join(dir, 'sub'));
    const r = await BashTool.execute(
      { command: 'cd sub && export FOO=bar && sleep 1', timeout: 200, persistent_env: true },
      ctx({ setShellCwd: (n) => { tracked = n; }, setShellEnv: (e) => { env = e; } }),
    );
    expect(r.text).toMatch(/handed off to the background/);
    const run = reg.list()[0];
    await run.exited;
    expect(run.exitCode).toBe(0);
    expect(tracked).toBeUndefined();
    expect(env).toBeUndefined();
    const raw = fs.readFileSync(run.logPath, 'utf8');
    expect(raw).toContain('__YC_CWD__');
    const envFile = /__YC_ENVFILE__(.+)/.exec(raw)![1].trim();
    expect(fs.existsSync(envFile)).toBe(false);
    const read = await reg.read(run.shellId);
    expect(read!.text).not.toContain('__YC_');
    expect(reg.tailText(run, 50)).not.toContain('__YC_');
  });

  it('hand-off at the cap still succeeds (D5)', async () => {
    for (let i = 0; i < MAX_EXPLICIT_RUNNING; i++) await BashTool.execute({ command: 'sleep 5', run_in_background: true }, ctx());
    const r = await BashTool.execute({ command: 'node -e "setTimeout(()=>{}, 4000)"', timeout: 200 }, ctx());
    expect(r.text).toMatch(/handed off to the background/);
    expect(reg.list()).toHaveLength(MAX_EXPLICIT_RUNNING + 1);
  });

  it('with no registry in the context the old kill still applies', async () => {
    const r: any = await BashTool.execute({ command: 'node -e "setTimeout(()=>{}, 4000)"', timeout: 200 }, ctx({ shells: undefined }));
    expect(r.isError).toBe(true);
    expect(r.text).toContain('· exit 124]');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/bash-background.test.ts -t "Task 4"` — Expected: FAIL — the first case gets `Command timed out after 400ms` / `exit 124`.

- [ ] **Step 3: Implement** in `src/main/harness/tools/bash.ts`

Import `formatElapsed` too: `import { spawnDetached, killTree, formatElapsed, MAX_EXPLICIT_RUNNING } from '../shell-registry';`

Add a module-level constant under `ENV_PERSIST_DENYLIST`:

```ts
/** A command whose first word is `sleep` is never handed off (spec §4.1):
 *  backgrounding a sleep is pure churn — it runs to its timeout and reports
 *  as before. Leading whitespace and `time`/`env` prefixes are not special-
 *  cased on purpose; only the plain case is exempt. */
const LEADING_SLEEP = /^\s*sleep\b/;
```

Inside `execute`'s Promise executor: capture `const startedAt = Date.now();` right before the `let child;` spawn block, and declare `let handedOffTo: string | null = null;` next to `let done = false;`.

In `finish()`:
- Guard the probe block. Change `if (probe) {` to the pair below, so a hand-off can never apply the
  cwd or env of a command that is still running. Today it "passes" only because a command that has
  not exited has not printed its sentinel yet — but the timer can fire in the same instant the
  command finishes, and then the sentinel IS in the buffer and the cwd WOULD be applied to a run
  the tool result calls handed off:

```ts
        // G-1: a handed-off call must not apply the probe's results — the cwd
        // and env belong to a command still running in the background (D6, and
        // the registry unlinks the env temp file when it finally exits). The
        // sentinels are stripped for display only.
        if (probe && handedOffTo) {
          headBuf = stripSentinelLines(headBuf);
          tailBuf = stripSentinelLines(tailBuf);
        } else if (probe) {
```
  (the existing block's body and its closing brace are untouched.)

- Change the meta line: replace `const meta = [\`cwd: ${effectiveCwd}\`, \`exit ${code ?? '?'}\`];` with
```ts
        // A handed-off call has no exit yet — say so, and name the log the
        // registry keeps growing (the model's way to the rest of the output).
        const meta = [`cwd: ${effectiveCwd}`, handedOffTo ? `still running in the background · log: ${spillPath}` : `exit ${code ?? '?'}`];
```
- In the `if (truncated)` block, change `if (spillStream && spillPath) { outputPath = spillPath; } else if (!spillError) {` to `if (spillPath && (spillStream || handedOffTo)) { outputPath = spillPath; } else if (!spillError) {`.
- Extend the payload type and value: `const payload: ToolResultPayload & { truncated: boolean; outputPath?: string; timedOut: boolean; handedOffTo?: string } = { …, timedOut: !!timedOut, ...(handedOffTo ? { handedOffTo } : {}), bounds: … };`
- Guard the flush: change `if (spillStream && !(spillStream as fs.WriteStream).destroyed) {` to `if (spillStream && !handedOffTo && !(spillStream as fs.WriteStream).destroyed) {` — the registry owns the stream after a hand-off and ends it when the command exits.

Replace the whole `const timer = setTimeout(() => { … }, timeout);` block with:

```ts
      const timer = setTimeout(() => {
        // G-1 (spec §5.5): the time limit is when to HAND OFF, not when to
        // kill. The same process is adopted by the session's registry — never
        // restarted — and this call resolves with the output so far. Two
        // cases keep the old kill: no registry in this context (tests,
        // one-off tools), and a leading `sleep` (backgrounding a sleep is churn).
        if (!ctx.shells || LEADING_SLEEP.test(args.command)) {
          killTree(child, { graceMs: 0 });
          finish(
            `Command timed out after ${timeout}ms. The process was force-killed (SIGKILL) — if it was mid-write to a file, that write may be incomplete.\n`,
            true,
            124,
            true,
          );
          return;
        }
        // From here the registry reads the pipes; this call must stop
        // listening or every byte would be counted twice.
        child.stdout.removeAllListeners('data');
        child.stderr.removeAllListeners('data');
        child.removeAllListeners('close');
        child.removeAllListeners('error');
        // D4: a handed-off command can no longer be answered — close stdin so
        // a prompt fails fast with its own error instead of hanging forever.
        try { child.stdin?.end(); } catch { /* already closed */ }
        const run = ctx.shells.adopt({
          toolUseId: ctx.toolCallId ?? 'unknown', command: args.command, cwd: startCwd, child, startedAt,
          // headBuf is complete when no spill has started (nothing dropped yet);
          // otherwise the spill stream already holds everything.
          seedLog: spillStream ? null : headBuf,
          recent: tailBuf,
          logPath: spillPath, logStream: spillStream,
          captureEnv,
        });
        handedOffTo = run.shellId;
        spillPath = run.logPath;
        finish(
          // Real elapsed, not the configured limit: the two differ (the timer
          // fires late under load), and "after 2m" must describe the command,
          // not the setting.
          `Still running after ${formatElapsed(Date.now() - startedAt)} — handed off to the background (shell id ${run.shellId}). You'll be told when it finishes. Output so far:\n`,
          false,
          undefined,
          false,
        );
      }, timeout);
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/bash-background.test.ts tests/harness-tools-core.test.ts tests/harness-tool-conformance.test.ts tests/native-tools-polish.test.ts` — Expected: PASS. `harness-tools-core`'s `'times out and reports it'` and the `'timeout representation'` cases still pass because their contexts carry no `shells`. The `probe && handedOffTo` guard is deliberately NOT pinned by a test: reproducing "the command exits in the same millisecond the timer fires" is not something a test can do reliably, and a defensive guard whose test is flaky is worse than none. Its reasoning lives in the comment at the edit site.

- [ ] **Step 5: Commit**

```bash
bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/main/harness/tools/bash.ts desktop/tests/bash-background.test.ts && git commit -m "feat(harness): a Bash time limit hands the command to the background instead of killing it (G-1 Task 4)

Same process, adopted by the registry; stdin closed; cwd/env not applied;
the env temp file is cleaned up on exit. A leading sleep still times out.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```

---

### Task 5: `BashOutput` + `KillShell` tools, manifest rows, per-turn cap, doom-loop exemption

**Files:**
- Create `src/main/harness/tools/bash-output.ts`, `src/main/harness/tools/kill-shell.ts`
- Modify `src/main/harness/tools/index.ts`, `src/shared/harness-manifest.ts`, `src/shared/permission-types.ts`, `src/main/harness/harness-session.ts`, `src/main/harness/native-session-host.ts` (child tool filter)
- Test `tests/bash-output-kill-shell.test.ts` (new), `tests/harness-session-loop.test.ts`, `tests/tool-registry-manifest.test.ts`

**Interfaces:**
- Consumes: `ShellRegistry.read/list/kill/get/tailText`, `stateText`, `formatElapsed`.
- Produces: `BashOutputTool` (`{ shell_id?: string }`), `KillShellTool` (`{ shell_id: string }`), `BASH_OUTPUT_READS_PER_TURN = 8`, `DOOM_LOOP_EXEMPT_TOOLS`, `BASH_OUTPUT_MAX_LINES = 200`.

- [ ] **Step 1: Write the failing tests**

`tests/bash-output-kill-shell.test.ts`:

```ts
// G-1 companions: BashOutput (new output since the last look / list mode) and
// KillShell. Registry-backed with real bash where a process is needed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BashOutputTool, BASH_OUTPUT_MAX_LINES } from '../src/main/harness/tools/bash-output';
import { KillShellTool } from '../src/main/harness/tools/kill-shell';
import { ShellRegistry } from '../src/main/harness/shell-registry';
import type { ToolContext } from '../src/main/harness/tools/types';

const posix = process.platform !== 'win32';
const BASH = { shellCmd: '/bin/bash', shellArgs: ['-c'] };
let dir: string;
let reg: ShellRegistry;
function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return { sessionId: 'bo-test', cwd: dir, signal: new AbortController().signal, readRegistry: new Map(), todos: [], shells: reg, ...over };
}
function start(command: string, toolUseId = 'tu') {
  const r = reg.start({ toolUseId, command, cwd: dir, ...BASH, env: { ...process.env, NO_COLOR: '1' } });
  if (!r.ok) throw new Error('start failed');
  return r.run;
}
function waitFor(cond: () => boolean, ms = 5_000): Promise<void> {
  const t0 = Date.now();
  return new Promise((res, rej) => { const tick = () => { if (cond()) return res(); if (Date.now() - t0 > ms) return rej(new Error('waitFor')); setTimeout(tick, 25); }; tick(); });
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bo-')); reg = new ShellRegistry('bo-test'); });
afterEach(async () => { await reg.killAll('app-quit', { graceMs: 0 }); fs.rmSync(dir, { recursive: true, force: true }); });

describe('schemas', () => {
  it('BashOutput: shell_id optional, strict; KillShell: shell_id required, strict; neither ever asks', () => {
    expect(BashOutputTool.inputSchema.safeParse({}).success).toBe(true);
    expect(BashOutputTool.inputSchema.safeParse({ shell_id: 'sh-1', extra: 1 }).success).toBe(false);
    expect(KillShellTool.inputSchema.safeParse({}).success).toBe(false);
    expect(KillShellTool.inputSchema.safeParse({ shell_id: 'sh-1' }).success).toBe(true);
    expect(BashOutputTool.permissionSubject({ shell_id: 'sh-1' })).toBeUndefined();
    expect(KillShellTool.permissionSubject({ shell_id: 'sh-1' })).toBeUndefined();
    expect(BashOutputTool.shortDescription).toBeTruthy();
    expect(KillShellTool.shortDescription).toBeTruthy();
  });
  it('without a registry: list mode says none, id mode says unknown', async () => {
    const r = await BashOutputTool.execute({}, ctx({ shells: undefined }));
    expect(r.text).toBe('No background commands in this conversation.');
    const k = await KillShellTool.execute({ shell_id: 'sh-1' }, ctx({ shells: undefined }));
    expect(k.isError).toBe(true);
    expect(k.text).toBe('No background command sh-1. Running: none.');
  });
});

describe.skipIf(!posix)('BashOutput', () => {
  it('id mode: header + new output since the last look; then the "nothing new" sentence', async () => {
    const run = start('echo one; sleep 0.5; echo two');
    await waitFor(() => reg.tailText(run, 5).includes('one'));
    const a = await BashOutputTool.execute({ shell_id: run.shellId }, ctx());
    expect(a.text).toMatch(new RegExp(`^${run.shellId} · running · \\d+s\\none$`));
    const b = await BashOutputTool.execute({ shell_id: run.shellId }, ctx());
    expect(b.text).toMatch(new RegExp(`^No new output from ${run.shellId} since your last look \\(still running · \\d+s\\)\\. You'll be told when it finishes\\.$`));
    await run.exited;
    const c = await BashOutputTool.execute({ shell_id: run.shellId }, ctx());
    expect(c.text).toMatch(new RegExp(`^${run.shellId} · exited 0 · \\d+s\\ntwo$`));
    const d = await BashOutputTool.execute({ shell_id: run.shellId }, ctx());
    expect(d.text).toMatch(new RegExp(`^No new output from ${run.shellId} since your last look \\(exited 0 · \\d+s\\)\\.$`));
  });
  it('id mode is bounded in lines, and the moreHint names the log path', async () => {
    const run = start('seq 1 500');
    await run.exited;
    const r = await BashOutputTool.execute({ shell_id: run.shellId }, ctx());
    expect(r.bounds).toEqual({ shown: BASH_OUTPUT_MAX_LINES, total: 500, unit: 'lines', moreHint: `the earlier lines are in the log: ${run.logPath}` });
    expect(r.text.split('\n')).toHaveLength(BASH_OUTPUT_MAX_LINES + 1);   // header + 200
    expect(r.text.endsWith('500')).toBe(true);
  });
  it('list mode: one line per run with state, elapsed, first 60 chars of the command', async () => {
    const a = start('sleep 5', 'a');
    const b = start(`echo ${'x'.repeat(80)}`, 'b');
    await b.exited;
    const r = await BashOutputTool.execute({}, ctx());
    const lines = r.text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(new RegExp(`^${a.shellId} · running · \\d+s · sleep 5$`));
    expect(lines[1]).toMatch(new RegExp(`^${b.shellId} · exited 0 · \\d+s · echo ${'x'.repeat(55)}…$`));
  });
  it('unknown id names the running ids', async () => {
    const a = start('sleep 5', 'a');
    const r = await BashOutputTool.execute({ shell_id: 'sh-zzzz' }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toBe(`No background command sh-zzzz. Running: ${a.shellId}.`);
  });
});

describe.skipIf(!posix)('KillShell', () => {
  it('stops the family, waits for the exit, returns the §4.3 sentence + last lines + log path', async () => {
    const run = start('echo starting; sleep 30 & wait');
    await waitFor(() => reg.tailText(run, 5).includes('starting'));
    const r = await KillShellTool.execute({ shell_id: run.shellId }, ctx());
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(new RegExp(`^Stopped ${run.shellId} after \\d+s \\(was: echo starting; sleep 30 & wait\\)\\. Last lines:\\n`));
    expect(r.text).toContain('\nstarting\n');
    expect(r.text.endsWith(`Full log: ${run.logPath}`)).toBe(true);
    expect(run.status).toBe('stopped');
    expect(run.stopReason).toBe('assistant');
  });
  it('an already-ended run gets its current state in one sentence, never a fake "stopped"', async () => {
    const run = start('exit 4');
    await run.exited;
    const r = await KillShellTool.execute({ shell_id: run.shellId }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(new RegExp(`^${run.shellId} is not running — exited 4 · \\d+s\\.$`));
  });
});
```

Add to `tests/harness-session-loop.test.ts`:

```ts
  it('G-1: BashOutput is exempt from the doom-loop window — nine identical polls raise no ask, the 9th hits the per-turn cap', async () => {
    const poll = fakeTool('BashOutput', { schema: z.object({ shell_id: z.string().optional() }).strict(), onExecute: () => ({ text: 'sh-1 · running · 1s\nline' }) });
    const calls = Array.from({ length: 9 }, (_, i) => stream(toolCallChunk(`c${i}`, 'BashOutput', { shell_id: 'sh-1' }), finishChunk('tool-calls')));
    const model = scriptedModel([...calls, stream(...textChunks('b', 'done'), finishChunk('stop'))]);
    const askUser = vi.fn(async () => ({ behavior: 'allow' as const }));
    const session = new HarnessSession(makeOpts({ tools: [poll], decide: async () => ALLOW, askUser }), async () => model as any);
    const events = collect(session);
    await session.send('go');
    expect(askUser.mock.calls.some((c) => (c[0] as any).toolName === 'doom_loop')).toBe(false);
    const results = events.filter((e) => e.type === 'tool-result');
    expect(results).toHaveLength(9);
    expect((poll as any).calls).toHaveLength(8);
    expect(results[8].data.isError).toBe(true);
    expect(results[8].data.toolResult).toBe('You have read background output 8 times this turn. Do other work; the finished notice will arrive.');
  });

  it('G-1: the BashOutput cap resets on the next turn', async () => {
    const poll = fakeTool('BashOutput', { schema: z.object({ shell_id: z.string().optional() }).strict(), onExecute: () => ({ text: 'x' }) });
    const nine = Array.from({ length: 9 }, (_, i) => stream(toolCallChunk(`c${i}`, 'BashOutput', {}), finishChunk('tool-calls')));
    const model = scriptedModel([
      ...nine, stream(...textChunks('a', 'done'), finishChunk('stop')),
      stream(toolCallChunk('d1', 'BashOutput', {}), finishChunk('tool-calls')), stream(...textChunks('b', 'done'), finishChunk('stop')),
    ]);
    const session = new HarnessSession(makeOpts({ tools: [poll], decide: async () => ALLOW, askUser: async () => ({ behavior: 'allow' as const }) }), async () => model as any);
    const events = collect(session);
    await session.send('one');
    await session.send('two');
    const results = events.filter((e) => e.type === 'tool-result');
    expect(results[9].data.isError).toBe(false);
  });
```

`tests/tool-registry-manifest.test.ts` — the parity sweep is data-driven, so it turns red the moment `NATIVE_TOOL_NAMES` and `CORE_TOOLS` disagree; add one explicit pin at the end of the first `describe`:

```ts
  it('G-1: BashOutput and KillShell are registered AND advertised', () => {
    expect(registered).toContain('BashOutput');
    expect(registered).toContain('KillShell');
    expect(advertised).toContain('BashOutput');
    expect(advertised).toContain('KillShell');
  });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/bash-output-kill-shell.test.ts tests/harness-session-loop.test.ts tests/tool-registry-manifest.test.ts -t "G-1|BashOutput|KillShell|schemas"` — Expected: FAIL — module not found for `bash-output`; the loop test sees a `doom_loop` ask on the 3rd identical call.

- [ ] **Step 3: Implement**

`src/main/harness/tools/bash-output.ts`:

```ts
// BashOutput (G-1, spec §4.2): what a background command printed since the
// last BashOutput for it — or, with no id, the list of this conversation's
// background commands. Never asks (permissionSubject undefined + always-allowed
// in permission-types.ts); the per-turn cap and the doom-loop exemption live
// in harness-session.ts, since polling is the one call that is SUPPOSED to repeat.
import { z } from 'zod';
import { defineTool } from './registry';
import { stateText } from '../shell-registry';

/** Lines returned per read; earlier ones stay in the log the moreHint names. */
export const BASH_OUTPUT_MAX_LINES = 200;

function unknownId(id: string, running: string[]): string {
  return `No background command ${id}. Running: ${running.length ? running.join(', ') : 'none'}.`;
}

export const BashOutputTool = defineTool({
  name: 'BashOutput',
  description:
    'Read NEW output from a background command since your last BashOutput for it (first call: everything so far). ' +
    'Without shell_id: list every background command in this conversation with its state. ' +
    'You are told when a command finishes without calling this — read a few times per turn at most.',
  shortDescription: 'Read new output from a background command, or list them.',
  inputSchema: z.object({
    shell_id: z.string().optional().describe('A shell id from Bash (sh-…). Omit to list every background command in this conversation.'),
  }).strict(), // .strict(): an unknown parameter is an error the model can fix (ledger D-2)
  moreHint: 'the earlier lines are in the log file named in the result — Read it',
  permissionSubject: () => undefined,
  async execute(args, ctx) {
    const reg = ctx.shells;
    if (!args.shell_id) {
      const runs = reg?.list() ?? [];
      if (runs.length === 0) return { text: 'No background commands in this conversation.' };
      const lines = runs.map((r) => {
        const cmd = r.command.length > 60 ? `${r.command.slice(0, 55)}…` : r.command;
        return `${r.shellId} · ${stateText(r)} · ${cmd}`;
      });
      return { text: lines.join('\n') };
    }
    const running = reg?.list().filter((r) => r.status === 'running').map((r) => r.shellId) ?? [];
    const read = reg ? await reg.read(args.shell_id) : undefined;
    if (!read) return { text: unknownId(args.shell_id, running), isError: true };
    const { run, text, truncated } = read;
    const state = stateText(run);
    if (!text.trim()) {
      return {
        text: run.status === 'running'
          ? `No new output from ${run.shellId} since your last look (still ${state}). You'll be told when it finishes.`
          : `No new output from ${run.shellId} since your last look (${state}).`,
      };
    }
    const all = text.replace(/\n$/, '').split('\n');
    const shown = all.slice(-BASH_OUTPUT_MAX_LINES);
    const body = `${run.shellId} · ${state}\n${shown.join('\n')}`;
    // `truncated` means the registry itself capped the read (the log grew by
    // more than READ_MAX_BYTES since the last look), so `all.length` is NOT the
    // true total — say "more than", never a count we did not measure. Bounds
    // reports null for an unknown total; the hint names the log either way.
    if (truncated) {
      return { text: body, bounds: { shown: shown.length, total: null, unit: 'lines' as const, moreHint: `more than this arrived since your last look — the full output is in the log: ${run.logPath}` } };
    }
    return all.length > BASH_OUTPUT_MAX_LINES
      ? { text: body, bounds: { shown: shown.length, total: all.length, unit: 'lines' as const, moreHint: `the earlier lines are in the log: ${run.logPath}` } }
      : { text: body };
  },
});
```

`src/main/harness/tools/kill-shell.ts`:

```ts
// KillShell (G-1, spec §4.3): stop a background command and everything it
// launched. Its result IS the notice — the host sends no finished notice for
// a run the model stopped itself (see NativeSessionHost.onShellExit).
import { z } from 'zod';
import { defineTool } from './registry';
import { formatElapsed, stateText } from '../shell-registry';

export const KillShellTool = defineTool({
  name: 'KillShell',
  description: 'Stop a background command (and every process it started) by shell id. Returns its last lines. Use it for a server you no longer need or a build that is going nowhere.',
  shortDescription: 'Stop a background command by shell id.',
  inputSchema: z.object({
    shell_id: z.string().describe('The shell id from Bash (sh-…).'),
  }).strict(), // .strict(): an unknown parameter is an error the model can fix (ledger D-2)
  moreHint: 'the full output is in the log file named in the result — Read it',
  permissionSubject: () => undefined,
  async execute(args, ctx) {
    const reg = ctx.shells;
    const run = reg?.get(args.shell_id);
    if (!reg || !run) {
      const running = reg?.list().filter((r) => r.status === 'running').map((r) => r.shellId) ?? [];
      return { text: `No background command ${args.shell_id}. Running: ${running.length ? running.join(', ') : 'none'}.`, isError: true };
    }
    if (run.status !== 'running') {
      return { text: `${run.shellId} is not running — ${stateText(run)}.`, isError: true };
    }
    await reg.kill(run.shellId, 'assistant');
    const elapsed = formatElapsed((run.endedAt ?? Date.now()) - run.startedAt);
    const tail = reg.tailText(run, 20).trim() || '(no output)';
    // Never open with "Stopped" for a process that is demonstrably still
    // alive — the old wording said "Stopped X" and then, one sentence later,
    // that it had not stopped. Two verbs, one true each time.
    const head = run.status === 'running'
      ? `Sent the stop signal to ${run.shellId} (was: ${run.command}), but it had not exited after 5 s — it should be gone shortly.`
      : `Stopped ${run.shellId} after ${elapsed} (was: ${run.command}).`;
    return { text: `${head} Last lines:\n${tail}\nFull log: ${run.logPath}` };
  },
});
```

`src/main/harness/tools/index.ts` — add the imports and the two entries after `BashTool`:

```ts
import { BashOutputTool } from './bash-output';
import { KillShellTool } from './kill-shell';
```
```ts
export const CORE_TOOLS: NativeTool[] = [ReadTool, WriteTool, EditTool, BashTool, BashOutputTool, KillShellTool, GlobTool, GrepTool, TodoWriteTool, WebFetchTool, WebSearchTool, SendUserFileTool, AskUserQuestionTool];
```

`src/shared/harness-manifest.ts`:

```ts
export const NATIVE_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Bash', 'BashOutput', 'KillShell', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'AskUserQuestion', 'SendUserFile',
] as const;
```

`src/shared/permission-types.ts` — in `rulesForMode`'s `alwaysAllowed`, after `SendUserFile`:

```ts
    // G-1 (2026-08-28): the Bash companions read a log the session already
    // owns, or stop a command the session itself started — nothing to ask
    // about; asking would train click-through (spec §4.2/4.3 "never asks").
    { tool: 'BashOutput', action: 'allow' },
    { tool: 'KillShell', action: 'allow' },
```

`src/main/harness/harness-session.ts`:
- Next to `const NON_PATH_SUBJECT_TOOLS = …` add:

```ts
/** G-1: a poll is SUPPOSED to repeat, so BashOutput is exempt from the
 *  doom-loop signature window (spec §4.2); BASH_OUTPUT_READS_PER_TURN is the
 *  guard instead. */
const DOOM_LOOP_EXEMPT_TOOLS = new Set(['BashOutput']);
/** D7: flat cap on BashOutput calls per turn, regardless of result — a chatty
 *  build returns new output on every poll, which no empty-result counter catches. */
export const BASH_OUTPUT_READS_PER_TURN = 8;
```
- Class field next to `private toolCallCount = 0;`: `private bashOutputReadsThisTurn = 0;   // G-1 per-turn cap, reset in beginTurn`
- In `beginTurn`, right after `this.interrupted = false;`: `this.bashOutputReadsThisTurn = 0;`
- In `runOneTool`, replace the doom-loop block (from `const sig = …` through `recentCalls.length = 0;   // allow resets the window\n    }`) with:

```ts
    // G-1: per-turn BashOutput cap (D7) — checked AFTER validation so a
    // malformed call never spends a read, BEFORE the doom loop it replaces.
    if (call.toolName === 'BashOutput') {
      this.bashOutputReadsThisTurn += 1;
      if (this.bashOutputReadsThisTurn > BASH_OUTPUT_READS_PER_TURN) {
        return { text: `You have read background output ${BASH_OUTPUT_READS_PER_TURN} times this turn. Do other work; the finished notice will arrive.`, isError: true };
      }
    }
    const sig = `${call.toolName}:${JSON.stringify(args)}`;
    // Window length = the profile's doom-loop threshold (Task 5): small local
    // models (threshold 2) trip sooner than cloud models (default 3). Trip when
    // the last `threshold` calls are all identical; an allow resets the window.
    // G-1: BashOutput never enters the window — see DOOM_LOOP_EXEMPT_TOOLS.
    const threshold = this.profile.doomLoopThreshold;
    if (!DOOM_LOOP_EXEMPT_TOOLS.has(call.toolName)) {
      recentCalls.push(sig);
      if (recentCalls.length > threshold) recentCalls.shift();
      if (recentCalls.length === threshold && recentCalls.every((s) => s === sig)) {
        const d = await this.opts.askUser?.({ sessionId: this.opts.sessionId, toolName: 'doom_loop', toolInput: { repeated: call.toolName }, denyListed: false });
        if (d?.behavior === 'canceled') return 'interrupted';
        // Threshold-accurate: the doom-loop window length varies by profile (2 for
        // small local models, 3 for cloud), so quote the ACTUAL threshold, not a
        // hardcoded "three". Model-facing corrective text, not a user-facing error.
        if (d?.behavior !== 'allow') return { text: `Stopped: this exact call has been repeated ${threshold} times. Try a different approach.`, isError: true };
        recentCalls.length = 0;   // allow resets the window
      }
    }
```

`src/main/harness/native-session-host.ts` — in the child-session builder (the `new HarnessSession(` inside the method that takes `specialist, childId, …` and has `const allowed = new Set(specialist.allowedTools);`), replace `tools: CORE_TOOLS.filter((t) => allowed.has(t.name)),` with:

```ts
        // G-1: a helper allowed Bash gets the companions too — its own
        // background command would otherwise be unreadable and unstoppable.
        tools: CORE_TOOLS.filter((t) => allowed.has(t.name) || (allowed.has('Bash') && (t.name === 'BashOutput' || t.name === 'KillShell'))),
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/bash-output-kill-shell.test.ts tests/harness-session-loop.test.ts tests/tool-registry-manifest.test.ts tests/harness-tool-conformance.test.ts tests/permission-engine.test.ts tests/native-session-host.test.ts` — Expected: PASS. If a child-tool-count pin in `native-session-host.test.ts` or `specialist-run.test.ts` fails on "expected N tools", update that expectation by exactly 2 with a comment naming this task — the count changed by design.

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/main/harness/tools/bash-output.ts desktop/src/main/harness/tools/kill-shell.ts desktop/src/main/harness/tools/index.ts desktop/src/shared/harness-manifest.ts desktop/src/shared/permission-types.ts desktop/src/main/harness/harness-session.ts desktop/src/main/harness/native-session-host.ts desktop/tests/bash-output-kill-shell.test.ts desktop/tests/harness-session-loop.test.ts desktop/tests/tool-registry-manifest.test.ts && git commit -m "feat(harness): BashOutput + KillShell; 8 reads/turn cap; polls exempt from the doom loop (G-1 Task 5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```
---

### Task 6: Host — registry lifetime, finished notices, one-turn batching, kill paths, `shell-event`

**Files:**
- Modify `src/shared/types.ts` (`injectedMeta` union, `ShellEvent`)
- Modify `src/main/harness/harness-session.ts` (`runNotice` discriminant)
- Modify `src/main/harness/native-session-host.ts`
- Modify `src/renderer/components/SpecialistReportCard.tsx` (narrow the union — keeps `tsc` green in this task)
- Test `tests/native-session-host.test.ts`

**Interfaces:**
- Produces in `shared/types.ts`:
  ```ts
  export interface SpecialistInjectedMeta { kind?: undefined; childId: string; title: string; agentType: string; description?: string; status: 'completed' | 'failed'; steps?: number; parentToolCallId?: string }
  export interface ShellInjectedMeta { kind: 'shell'; runs: Array<{ shellId: string; toolUseId: string; exitCode?: number; stopReason?: ShellStopReason; elapsedMs: number; logPath: string }> }
  export type InjectedMeta = SpecialistInjectedMeta | ShellInjectedMeta;   // TranscriptEvent.data.injectedMeta
  export type ShellEvent = { sessionId: string; run: ShellRunView };
  ```
- Host: `killShell(sessionId, shellId): Promise<{ ok: true } | { ok: false; reason: 'not-live' | 'unknown-shell' | 'not-running' }>`, `shellRunsFor(sessionId): ShellRunView[]`, `destroy(sessionId, opts?: { keepShells?: boolean })`, event `'shell-event'` (`ShellEvent`).
- `HarnessSession.runNotice(text, meta?: InjectedMeta)` emits `injected: 'shell-complete'` when `meta.kind === 'shell'`, else `'specialist-report'`.

- [ ] **Step 1: Write the failing tests** — append to `tests/native-session-host.test.ts` (uses the file's `NativeHome`, `SessionStore`, `NO_CONTEXT`, `waitForEvent`, `scriptedModel` helpers):

```ts
describe('G-1 background Bash — registry lifetime and finished notices', () => {
  const posix = process.platform !== 'win32';
  let root: string;
  let store: SessionStore;
  let host: NativeSessionHost;
  const BASH = { shellCmd: '/bin/bash', shellArgs: ['-c'] };
  // A parent whose every turn is one plain text step — the notice turn included.
  const chatty = async () => scriptedModel([stream(...textChunks('t', 'ok'), finishChunk('stop'))]) as any;
  const binding = { providerId: 'openrouter', modelId: 'm' };
  function reg(id: string) { return (host as any).shellRegistries.get(id); }
  function startIn(id: string, command: string, toolUseId = 'tu') {
    const r = reg(id).start({ toolUseId, command, cwd: root, ...BASH, env: { ...process.env } });
    if (!r.ok) throw new Error('start failed');
    return r.run;
  }

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-shell-host-'));
    store = new SessionStore(new NativeHome(root));
    host = new NativeSessionHost(store, chatty, NO_CONTEXT, async () => null, async () => null);
    await host.create({ sessionId: 'p1', cwd: root, binding });
  });
  afterEach(async () => { await host.destroyAll(); fs.rmSync(root, { recursive: true, force: true }); });

  it('every live session has a registry, reachable by the tool as ctx.shells', () => {
    expect(reg('p1')).toBeTruthy();
    expect((host as any).live.get('p1').session.opts.shells).toBe(reg('p1'));
  });

  it.skipIf(!posix)('a finished run is injected ONCE as a user turn with injected: shell-complete and shell meta', async () => {
    const notice = waitForEvent(host, (e) => e.type === 'user-message' && e.data.injected === 'shell-complete');
    const run = startIn('p1', 'echo done; exit 2', 'toolu_x');
    const e = await notice;
    expect(e.data.text).toMatch(new RegExp(`^\\[Background command ${run.shellId} finished · exit 2 · \\d+s\\]\\n\\$ echo done; exit 2\\ndone\\nFull log: `));
    expect(e.data.injectedMeta).toEqual({ kind: 'shell', runs: [{ shellId: run.shellId, toolUseId: 'toolu_x', exitCode: 2, stopReason: undefined, elapsedMs: expect.any(Number), logPath: run.logPath }] });
    expect(run.reported).toBe(true);
    await host.drain('p1');
    const all = store.readEvents('p1', root).filter((ev: any) => ev.type === 'user-message' && ev.data.injected === 'shell-complete');
    expect(all).toHaveLength(1);
  });

  it.skipIf(!posix)('several runs finishing while the parent is busy go out as ONE turn (D8)', async () => {
    // Hold the parent mid-turn so both exits queue before any delivery pass.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const factory = async () => new MockLanguageModelV4({
      doStream: async () => {
        if (first) { first = false; await gate; }
        return { stream: simulateReadableStream({ chunks: stream(...textChunks('t', 'ok'), finishChunk('stop')) }) };
      },
    }) as any;
    await host.destroyAll();
    host = new NativeSessionHost(store, factory, NO_CONTEXT, async () => null, async () => null);
    await host.create({ sessionId: 'p2', cwd: root, binding });
    host.send('p2', 'busy');
    const a = startIn('p2', 'echo a', 'ta');
    const b = startIn('p2', 'echo b', 'tb');
    await a.exited; await b.exited;
    await new Promise((r) => setTimeout(r, 50));
    const notices: any[] = [];
    host.on('transcript-event', (e: any) => { if (e.type === 'user-message' && e.data.injected === 'shell-complete') notices.push(e); });
    release();
    await host.drain('p2');
    await new Promise((r) => setTimeout(r, 50));
    await host.drain('p2');
    expect(notices).toHaveLength(1);
    expect(notices[0].data.injectedMeta.runs.map((r: any) => r.toolUseId).sort()).toEqual(['ta', 'tb']);
    expect(notices[0].data.text).toContain(`[Background command ${a.shellId} finished`);
    expect(notices[0].data.text).toContain(`[Background command ${b.shellId} finished`);
  });

  it.skipIf(!posix)('a run the model stopped (KillShell) sends no notice; a run the USER stopped does', async () => {
    const seen: any[] = [];
    host.on('transcript-event', (e: any) => { if (e.data?.injected === 'shell-complete') seen.push(e); });
    const a = startIn('p1', 'sleep 5', 'ta');
    await reg('p1').kill(a.shellId, 'assistant');
    const b = startIn('p1', 'sleep 5', 'tb');
    const r = await host.killShell('p1', b.shellId);
    expect(r).toEqual({ ok: true });
    await host.drain('p1');
    await new Promise((res) => setTimeout(res, 50));
    await host.drain('p1');
    expect(seen).toHaveLength(1);
    expect(seen[0].data.text).toMatch(new RegExp(`^\\[Background command ${b.shellId} stopped by you · after`));
    expect(await host.killShell('p1', b.shellId)).toEqual({ ok: false, reason: 'not-running' });
    expect(await host.killShell('p1', 'sh-nope')).toEqual({ ok: false, reason: 'unknown-shell' });
    expect(await host.killShell('nope', 'sh-1')).toEqual({ ok: false, reason: 'not-live' });
  });

  it.skipIf(!posix)("destroy() kills with 'conversation-closed'; destroy({keepShells}) leaves the run; destroyAll kills orphans with 'app-quit'", async () => {
    const a = startIn('p1', 'sleep 5', 'ta');
    await host.create({ sessionId: 'p3', cwd: root, binding });
    const b = startIn('p3', 'sleep 5', 'tb');
    await host.destroy('p1');
    expect(a.status).toBe('stopped');
    expect(a.stopReason).toBe('conversation-closed');
    expect(reg('p1')).toBeUndefined();
    await host.destroy('p3', { keepShells: true });
    expect(b.status).toBe('running');
    expect(reg('p3')).toBeTruthy();             // orphaned but still owned
    await host.destroyAll();
    await b.exited;
    expect(b.stopReason).toBe('app-quit');
  });

  it.skipIf(!posix)('interrupt() leaves background runs alone', async () => {
    const a = startIn('p1', 'sleep 5', 'ta');
    host.interrupt('p1');
    await new Promise((r) => setTimeout(r, 100));
    expect(a.status).toBe('running');
  });

  it.skipIf(!posix)("a run finishing after its session was destroyed is dropped with the shell log line, not the permission one", async () => {
    // logger.ts writes one JSON line per log() via fs.promises.appendFile —
    // spying there sees the message without touching ~/.claude/desktop.log.
    const spy = vi.spyOn(fs.promises, 'appendFile').mockResolvedValue(undefined);
    const a = startIn('p1', 'sleep 0.3', 'ta');
    await host.destroy('p1', { keepShells: true });
    await a.exited;
    await new Promise((r) => setTimeout(r, 50));
    const written = spy.mock.calls.map((c) => String(c[1]));
    expect(written.some((l) => l.includes('a background command finished after its conversation was closed'))).toBe(true);
    expect(written.some((l) => l.includes('late permission answer'))).toBe(false);
    spy.mockRestore();
  });

  it.skipIf(!posix)('END TO END: the model starts a background command and gets its finished notice on the right card', async () => {
    // The one test that crosses every seam at once. Every other test in this
    // plan builds one layer's input by hand — this one lets the real Bash tool
    // mint the run, so the chain that nothing else covers is exercised:
    // ctx.toolCallId -> run.toolUseId -> the toolUseId the card is keyed by,
    // and the ShellRunView the renderer receives. A break anywhere in it means
    // the card silently never updates, which no unit test would notice.
    await host.destroyAll();
    const bashThenStop = async () => scriptedModel([
      stream(toolCallChunk('c1', 'Bash', { command: 'echo hello-e2e; exit 5', run_in_background: true }), finishChunk('tool-calls')),
      stream(...textChunks('t', 'started'), finishChunk('stop')),
      stream(...textChunks('t2', 'noted'), finishChunk('stop')),   // the notice turn
    ]) as any;
    host = new NativeSessionHost(store, bashThenStop, NO_CONTEXT, async () => null, async () => null);
    await host.create({ sessionId: 'e2e', cwd: root, binding });
    host.setPermissionMode('e2e', 'full-auto');   // Bash is not deny-listed, so no ask

    const views: any[] = [];
    host.on('shell-event', (e: any) => views.push(e));
    const notice = waitForEvent(host, (e) => e.type === 'user-message' && e.data.injected === 'shell-complete');
    const startResult = waitForEvent(host, (e) => e.type === 'tool-result' && e.data.toolName === 'Bash');

    host.send('e2e', 'start it');
    const res = await startResult;
    expect(res.data.toolResult).toMatch(/^Started in the background \(shell id sh-[0-9a-f]{4}\)\./);
    const shellId = /shell id (sh-[0-9a-f]{4})/.exec(res.data.toolResult)![1];

    const e = await notice;
    expect(e.data.text).toContain(`[Background command ${shellId} finished · exit 5`);
    expect(e.data.text).toContain('hello-e2e');
    // The whole point: the meta's toolUseId is the id of the Bash tool-use
    // event, so the reducer can find the card this notice belongs to.
    const meta = e.data.injectedMeta;
    expect(meta.kind).toBe('shell');
    expect(meta.runs).toHaveLength(1);
    expect(meta.runs[0]).toMatchObject({ shellId, exitCode: 5 });
    expect(meta.runs[0].toolUseId).toBe(res.data.toolUseId);
    // And the live push carries the same id, on the same card.
    expect(views.some((v) => v.sessionId === 'e2e' && v.run.shellId === shellId && v.run.toolUseId === res.data.toolUseId)).toBe(true);
  }, 20_000);

  it.skipIf(!posix)("shell-event fires with the ShellRunView and shellRunsFor replays it", async () => {
    const views: any[] = [];
    host.on('shell-event', (e: any) => views.push(e));
    const a = startIn('p1', 'echo hi', 'ta');
    await a.exited;
    await new Promise((r) => setTimeout(r, 300));
    expect(views[views.length - 1]).toEqual({ sessionId: 'p1', run: expect.objectContaining({ shellId: a.shellId, status: 'exited', exitCode: 0, tail: 'hi' }) });
    expect(host.shellRunsFor('p1').map((v) => v.shellId)).toEqual([a.shellId]);
    expect(host.shellRunsFor('nope')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/native-session-host.test.ts -t "G-1"` — Expected: FAIL — `reg('p1')` is undefined (`shellRegistries` does not exist).

- [ ] **Step 3: Implement**

`src/shared/types.ts` — replace the inline `injectedMeta?: { … }` block in `TranscriptEvent.data` with `injectedMeta?: InjectedMeta;` and add, right after the `ShellRunView` interface (already on the branch):

```ts
/** Structured companion to `injected: 'specialist-report'` (2026-08-16): who
 *  finished, what they were asked, how it ended — so the card header is exact
 *  rather than parsed back out of the prose the model reads.
 *  `parentToolCallId` names the Task card that started this child. */
export interface SpecialistInjectedMeta {
  /** G-1: the union's discriminant, declared here as always-absent so every
   *  reader can write `meta.kind === 'shell'`. Without it TypeScript rejects
   *  reading `.kind` off the union at all, and the code has to alternate
   *  between `'kind' in meta` and `.kind` — which is exactly how the first
   *  draft of this plan shipped a compile error into drainDeliveries. Optional
   *  and undefined, so no persisted specialist record changes shape. */
  kind?: undefined;
  childId: string;
  title: string;
  agentType: string;
  description?: string;
  status: 'completed' | 'failed';
  steps?: number;
  parentToolCallId?: string;
}

/** Companion to `injected: 'shell-complete'` (G-1): the background commands
 *  this ONE injected turn reports. A list, not a single run, because every
 *  notice ready at the same idle boundary goes out as one turn (D8) and the
 *  renderer folds each entry into its own Bash card. */
export interface ShellInjectedMeta {
  kind: 'shell';
  runs: Array<{
    shellId: string;
    toolUseId: string;
    exitCode?: number;
    stopReason?: ShellStopReason;
    elapsedMs: number;
    logPath: string;
  }>;
}

export type InjectedMeta = SpecialistInjectedMeta | ShellInjectedMeta;

/** The push event `native:shell-event` carries (G-1): one run record changed. */
export type ShellEvent = { sessionId: string; run: ShellRunView };
```

Update the `injected?: string` doc comment's "Only value today is 'specialist-report'" sentence to: `Values today: 'specialist-report' (a background helper's report) and 'shell-complete' (G-1: a background command finished or was stopped by the user); a plain string so a future kind never needs a schema change.`

Also add `NATIVE_KILL_SHELL: 'native:kill-shell',` after `NATIVE_SESSIONS_LIST` and `NATIVE_SHELL_EVENT: 'native:shell-event',` after `NATIVE_MODEL_STATE` in the `IPC` const (both surfaces are wired in Task 7; the constants land here so `tsc` sees them — `ipc-channels.test.ts`'s preload↔types check only fires on strings PRESENT in preload, so adding them here first keeps it green).

`src/renderer/state/chat-types.ts` — `InjectedMeta` there is `NonNullable<…['injectedMeta']>`, which now resolves to the union automatically; no edit.

`src/renderer/components/SpecialistReportCard.tsx` — after `const [expanded, setExpanded] = useState(false);` add:

```tsx
  // G-1: `meta` is now a union; this card renders the specialist shape. A
  // shell-complete turn only reaches it when its Bash card is not on the
  // timeline (the reducer folds it otherwise) — then it degrades to prose.
  const spec = meta?.kind === 'shell' ? undefined : meta;
```
and replace every following `meta` read in the component body with `spec` (`failed`, `label`, `detailParts`, `body`).

`src/main/harness/harness-session.ts` — `runNotice`:

```ts
  async runNotice(text: string, meta?: InjectedMeta): Promise<void> {
    // G-1: the discriminant tells the renderer which card folds this turn —
    // a Task card (specialist report) or a Bash card (shell-complete).
    const injected = meta?.kind === 'shell' ? 'shell-complete' : 'specialist-report';
    return this.beginTurn(text, () => this.emitEvent('user-message', {
      text, injected,
      ...(meta ? { injectedMeta: meta } : {}),
    }));
  }
```
with `import type { InjectedMeta } from '../../shared/types';` added to the existing shared-types import.

`src/main/harness/native-session-host.ts`:

Imports: add `ShellEvent, ShellRunView, InjectedMeta` to the `'../../shared/types'` type import; add `import { ShellRegistry, formatFinishedNotice, NOTICE_TAIL_LINES, type ShellRun } from './shell-registry';`.

Fields — replace `private pendingHostNotices = new Map<string, string[]>();` with:

```ts
  // G-1: notices now carry the structured meta the renderer folds into a
  // card; shell notices ready in one drain are concatenated into ONE turn (D8).
  private pendingHostNotices = new Map<string, Array<{ text: string; meta?: InjectedMeta }>>();
  /** G-1: one ShellRegistry per session id, HOST-owned. Why not on the
   *  HarnessSession: a remote takeover and the session-exit backstop destroy
   *  the session but must leave its commands running (D2) — those runs still
   *  need an owner that can kill them at app quit and re-attach them if the
   *  same conversation is resumed in this process. */
  private shellRegistries = new Map<string, ShellRegistry>();
  /** G-1: registries whose conversation was closed and whose kill is still in
   *  flight. Why a second collection: a close sends SIGTERM and escalates to
   *  SIGKILL two seconds later, but the registry leaves shellRegistries at
   *  once — so quitting the app inside that window left a process that ignores
   *  SIGTERM alive with nothing left to reach it. destroyAll sweeps this too. */
  private drainingShellRegistries = new Set<ShellRegistry>();
```

Add methods (next to `queueHostNotice`):

```ts
  /** G-1: the registry for a session id — created on first use, kept across
   *  destroy({keepShells}) so a taken-over conversation's runs stay owned. */
  private shellsFor(sessionId: string): ShellRegistry {
    let reg = this.shellRegistries.get(sessionId);
    if (reg) return reg;
    reg = new ShellRegistry(sessionId);
    const registry = reg;
    // One event per change, straight to ipc-handlers' listener (same shape as
    // 'specialists-event'): sendForSession + remote buffer/broadcast live there.
    registry.on('change', (run: ShellRunView) => this.emit('shell-event', { sessionId, run } satisfies ShellEvent));
    registry.on('exit', (run: ShellRun) => this.onShellExit(sessionId, registry, run));
    this.shellRegistries.set(sessionId, reg);
    return reg;
  }

  /** G-1 (spec §4.4): a finished run becomes a notice at the next idle
   *  boundary. KillShell's own result is its notice (no second one);
   *  'conversation-closed' and 'app-quit' have no session left to tell. A
   *  user Stop IS reported — the model must learn its server is gone. */
  private onShellExit(sessionId: string, registry: ShellRegistry, run: ShellRun): void {
    if (run.reported) return;
    if (run.stopReason && run.stopReason !== 'user') return;
    run.reported = true;
    this.queueHostNotice(
      sessionId,
      formatFinishedNotice(run, registry.tailText(run, NOTICE_TAIL_LINES)),
      { kind: 'shell', runs: [{ shellId: run.shellId, toolUseId: run.toolUseId, exitCode: run.exitCode, stopReason: run.stopReason, elapsedMs: (run.endedAt ?? Date.now()) - run.startedAt, logPath: run.logPath }] },
      'a background command finished after its conversation was closed — the notice has nowhere left to be delivered',
    );
  }

  /** G-1: the card's Stop button (native:kill-shell). Not gated on a live
   *  session's turn state — a run outlives turns by design. */
  async killShell(sessionId: string, shellId: string): Promise<{ ok: true } | { ok: false; reason: 'not-live' | 'unknown-shell' | 'not-running' }> {
    const reg = this.shellRegistries.get(sessionId);
    if (!reg || !this.live.has(sessionId)) return { ok: false, reason: 'not-live' };
    const run = reg.get(shellId);
    if (!run) return { ok: false, reason: 'unknown-shell' };
    if (run.status !== 'running') return { ok: false, reason: 'not-running' };
    await reg.kill(shellId, 'user');
    return { ok: true };
  }

  /** G-1: every run record for a live session, for TRANSCRIPT_REPLAY — the
   *  transcript itself says nothing about a run's current state (same reason
   *  specialistRunsFor exists). */
  shellRunsFor(sessionId: string): ShellRunView[] {
    const reg = this.shellRegistries.get(sessionId);
    if (!reg || !this.live.has(sessionId)) return [];
    return reg.list().map((r) => reg.toView(r));
  }
```

`queueHostNotice` becomes:

```ts
  private queueHostNotice(
    parentId: string,
    text: string,
    meta?: InjectedMeta,
    // Why a caller-supplied message: this lane now carries shell completions
    // too, and "a late permission answer arrived" printed about a finished
    // build would be a false log line (review I5).
    whyDropped = 'a late permission answer arrived after its parent session was already destroyed — the notice has nowhere left to be delivered',
  ): void {
    if (!this.live.has(parentId)) {
      log('WARN', 'NativeSessionHost', whyDropped, { parentId });
      return;
    }
    const arr = this.pendingHostNotices.get(parentId) ?? [];
    arr.push({ text, meta });
    this.pendingHostNotices.set(parentId, arr);
    this.kickIdleDeliveryPass(parentId);
  }
```

`drainDeliveries` — replace the `if (notices) { while … }` loop body with:

```ts
      while (notices.length > 0) {
        if (this.live.get(sessionId) !== entry) break;
        // D8: every shell notice already queued goes out as ONE turn — each
        // runNotice is a full model turn over the whole conversation, so three
        // builds finishing during one busy turn must not cost three turns.
        // Specialist follow-ups keep their one-per-turn shape.
        const head = notices[0];
        const headIsShell = head.meta?.kind === 'shell';
        const batch = headIsShell ? notices.filter((n) => n.meta?.kind === 'shell') : [head];
        const text = batch.map((n) => n.text).join('\n\n');
        const meta: InjectedMeta | undefined = headIsShell
          ? { kind: 'shell', runs: batch.flatMap((n) => (n.meta?.kind === 'shell' ? n.meta.runs : [])) }
          : head.meta;
        try {
          await entry.session.runNotice(text, meta);
        } catch (err) {
          log('WARN', 'NativeSessionHost', 'host notice delivery failed — will retry at the next idle boundary', { sessionId, error: String((err as any)?.message ?? err) });
          break;
        }
        if (this.live.get(sessionId) !== entry) break; // destroy raced the notice itself
        for (const n of batch) { const i = notices.indexOf(n); if (i >= 0) notices.splice(i, 1); }
      }
```

`toolWiring` — extend its return type `Pick<HarnessSessionOpts, … | 'specialistRoster' | 'shells'>` and add `shells: this.shellsFor(sessionId),` as the first property of the returned object. In the child builder add `shells: this.shellsFor(childId),` after `sessionId: childId, …` (children get their own registry; their runs die with the child under 'conversation-closed').

`destroy` — change the signature to `async destroy(sessionId: string, opts: { keepShells?: boolean } = {}): Promise<void>` and insert right after `await this.destroyChildrenOf(sessionId);`:

```ts
    // G-1 (D2): closing the conversation kills its background commands and
    // says so on the card. The holder-takeover and session-exit paths pass
    // keepShells — the conversation is still open, just somewhere else — and
    // the registry stays in the map so destroyAll can still reach it.
    if (!opts.keepShells) {
      const reg = this.shellRegistries.get(sessionId);
      if (reg) {
        this.shellRegistries.delete(sessionId);
        // Held until the kill settles so app-quit can still reach a process
        // that is ignoring SIGTERM inside the 2 s escalation window.
        this.drainingShellRegistries.add(reg);
        // Signals are sent synchronously; only the exit wait is deferred —
        // closing a tab must not stall on a stubborn process.
        void reg.killAll('conversation-closed')
          .catch((err) => log('WARN', 'NativeSessionHost', 'killAll on destroy failed', { sessionId, error: String(err) }))
          .finally(() => this.drainingShellRegistries.delete(reg));
      }
    }
```
(before the `if (!entry) return;` line, so an orphaned registry is killed when its conversation is finally closed on this device).

`destroyAll` — change the loop to `await this.destroy(id, { keepShells: true });` and add right after it:

```ts
    // G-1 (D2): app quit stops EVERY background command — live sessions' and
    // orphaned (taken-over) ones — with the honest reason. SIGKILL at once:
    // the process is exiting and a deferred escalation timer would never fire.
    for (const [id, reg] of this.shellRegistries) {
      void reg.killAll('app-quit', { graceMs: 0 }).catch((err) => log('WARN', 'NativeSessionHost', 'killAll on quit failed', { sessionId: id, error: String(err) }));
    }
    this.shellRegistries.clear();
    // A conversation closed seconds ago is still escalating SIGTERM→SIGKILL;
    // finish the job now rather than let the escalation timer die with us.
    for (const reg of this.drainingShellRegistries) {
      void reg.killAll('app-quit', { graceMs: 0 }).catch(() => { /* already gone */ });
    }
    this.drainingShellRegistries.clear();
```

`interrupt` — untouched (the test pins it).

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/native-session-host.test.ts tests/specialist-run.test.ts tests/harness-session-loop.test.ts tests/harness-history-rebuild.test.ts src/renderer/components/SpecialistReportCard.test.tsx` — Expected: PASS (`specialist-run`'s existing "late permission answer" cases still see their default message).

- [ ] **Step 5: Commit**

```bash
bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/shared/types.ts desktop/src/main/harness/harness-session.ts desktop/src/main/harness/native-session-host.ts desktop/src/renderer/components/SpecialistReportCard.tsx desktop/tests/native-session-host.test.ts && git commit -m "feat(native): host owns shell registries — finished notices as one turn, kill on close/quit, shell-event (G-1 Task 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```
---

### Task 7: IPC — `native:kill-shell` request on every surface, `native:shell-event` push with remote replay

**Files:**
- Modify `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `src/main/ipc-handlers.ts`, `src/main/remote-server.ts`, `src/renderer/hooks/useIpc.ts`
- Modify *(android)* `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`
- Test `tests/ipc-channels.test.ts`, `tests/remote-server.test.ts`

**Interfaces:**
- `window.claude.native.killShell(sessionId: string, shellId: string): Promise<{ ok: true } | { ok: false; reason: string }>`
- `window.claude.on.shellEvent(cb: (e: ShellEvent) => void): () => void`
- WS request `native:kill-shell` `{ sessionId, shellId }`; WS push `native:shell-event` (`ShellEvent`).
- `RemoteServer.bufferShellRun(event: ShellEvent): void` (latest per shellId, replayed on connect).

- [ ] **Step 1: Write the failing tests**

`tests/ipc-channels.test.ts` — in `describe('native:* channel parity')`, add `'native:kill-shell',` to `NATIVE_CHANNELS` (after `'native:sessions-list'`).

`tests/remote-server.test.ts` — inside `describe('RemoteServer specialist run + native hook replay (Task 9)')` add:

```ts
  it('G-1: a new client receives the latest native:shell-event per shell id, and a destroyed session drops its buffer', async () => {
    const { RemoteServer } = await import('../src/main/remote-server');
    const server: any = new RemoteServer(mockSessionManager, mockHookRelay, mockConfig);
    const { frames, ws } = fakeWs();
    server.bufferShellRun({ sessionId: 's1', run: { toolUseId: 't1', shellId: 'sh-1', status: 'running', startedAt: 1, tail: 'a', logPath: '/l' } });
    server.bufferShellRun({ sessionId: 's1', run: { toolUseId: 't1', shellId: 'sh-1', status: 'exited', exitCode: 0, startedAt: 1, endedAt: 2, tail: 'ab', logPath: '/l' } });
    server.bufferShellRun({ sessionId: 's1', run: { toolUseId: 't2', shellId: 'sh-2', status: 'running', startedAt: 1, tail: '', logPath: '/m' } });
    await replayAndWait(server, ws);
    const events = frames.filter((m) => m.type === 'native:shell-event');
    expect(events).toHaveLength(2);
    expect(Object.fromEntries(events.map((e) => [e.payload.run.shellId, e.payload.run.status]))).toEqual({ 'sh-1': 'exited', 'sh-2': 'running' });
    server.onSessionExit('s1');
    const { frames: again, ws: ws2 } = fakeWs();
    await replayAndWait(server, ws2);
    expect(again.filter((m) => m.type === 'native:shell-event')).toHaveLength(0);
  });

  it('G-1: native:kill-shell over WS answers with the host result, and not-live without a runtime', async () => {
    const { RemoteServer } = await import('../src/main/remote-server');
    const server: any = new RemoteServer(mockSessionManager, mockHookRelay, mockConfig);
    const { frames, ws } = fakeWs();
    await server.handleMessage({ ws, authenticated: true }, JSON.stringify({ type: 'native:kill-shell', id: 'r1', payload: { sessionId: 's1', shellId: 'sh-1' } }));
    expect(frames.find((m) => m.id === 'r1')?.payload).toEqual({ ok: false, reason: 'not-live' });
    server.setNativeRuntime({ nativeHost: { killShell: vi.fn(async () => ({ ok: true })) } });
    await server.handleMessage({ ws, authenticated: true }, JSON.stringify({ type: 'native:kill-shell', id: 'r2', payload: { sessionId: 's1', shellId: 'sh-1' } }));
    expect(frames.find((m) => m.id === 'r2')?.payload).toEqual({ ok: true });
  });
```
(If `handleMessage`'s client argument shape differs in the file's other request tests, copy the shape those tests use — the method name and the `{ type, id, payload }` frame are what matter.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ipc-channels.test.ts tests/remote-server.test.ts -t "native|G-1"` — Expected: FAIL — `'native:kill-shell'` missing from `preload.ts`; `server.bufferShellRun is not a function`.

- [ ] **Step 3: Implement**

`src/main/preload.ts`:
- `IPC` const: `NATIVE_KILL_SHELL: 'native:kill-shell',` after `NATIVE_SESSIONS_LIST`; `NATIVE_SHELL_EVENT: 'native:shell-event',` after `NATIVE_MODEL_STATE`.
- In the `native: {` block after `sessionsList`:
```ts
    // G-1: the Bash card's Stop button. Request-response — the card needs
    // {ok, reason} to stop showing "Stopping…" when nothing was stopped.
    killShell: (sessionId: string, shellId: string) => ipcRenderer.invoke(IPC.NATIVE_KILL_SHELL, { sessionId, shellId }),
```
- In the `on: {` block after `specialistEvent`:
```ts
    // G-1: one background command's run record changed (status, tail, exit).
    // Fired by nativeHost's 'shell-event' listener in ipc-handlers.ts. Returns
    // the unsubscribe fn, same as specialistEvent.
    shellEvent: (cb: (e: any) => void) => {
      const handler = (_e: IpcRendererEvent, event: any) => cb(event);
      ipcRenderer.on('native:shell-event', handler);
      return () => ipcRenderer.removeListener('native:shell-event', handler);
    },
```

`src/renderer/remote-shim.ts`:
- `handleMessage` switch, after the `'specialists:event'` case:
```ts
    case 'native:shell-event':
      // G-1 — push-only (ipc-handlers.ts's nativeHost.on('shell-event', …)
      // forwarder). window.claude.on.shellEvent subscribers get the ShellEvent.
      dispatchEvent('native:shell-event', payload);
      break;
```
- `on` block after `specialistEvent`: `shellEvent: (cb: Callback) => { addListener('native:shell-event', cb); return () => removeListener('native:shell-event', cb); },`
- `native` block after `sessionsList`: `killShell: (sessionId: string, shellId: string) => invoke('native:kill-shell', { sessionId, shellId }),` — NOT gated on `supported` (the phone must Stop a desktop command over remote access).

`src/renderer/hooks/useIpc.ts` — in the `native` type after `sessionsList`: `killShell: (sessionId: string, shellId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;`; in the `on` type after `specialistEvent`: `shellEvent: (cb: (e: import('../../shared/types').ShellEvent) => void) => () => void;`.

`src/main/ipc-handlers.ts`:
- Add `type ShellEvent` to the `'../shared/types'` import.
- After the `nativeHost.on('specialists-event', …)` listener:
```ts
  // G-1: one background command's run record changed. Same four-surface push
  // shape as specialists:event — window + remote broadcast, buffered for a
  // reconnecting phone. Push-only; there is no request handler.
  nativeHost.on('shell-event', (event: ShellEvent) => {
    sendForSession(event.sessionId, IPC.NATIVE_SHELL_EVENT, event);
    if (remoteServer) {
      remoteServer.bufferShellRun(event);
      remoteServer.broadcast({ type: 'native:shell-event', payload: event });
    }
  });
```
- After the `NATIVE_SESSIONS_LIST` handler: `ipcMain.handle(IPC.NATIVE_KILL_SHELL, (_e, { sessionId, shellId }: { sessionId: string; shellId: string }) => nativeHost.killShell(sessionId, shellId));`
- In the `TRANSCRIPT_REPLAY` handler, after the `specialistRunsFor` loop:
```ts
    // G-1: a Bash card's background state IS its run record, which the
    // transcript never carries — replay it the way specialist runs are.
    if (nativeEvents !== null) {
      for (const run of nativeHost.shellRunsFor(sessionId)) {
        evt.sender.send(IPC.NATIVE_SHELL_EVENT, { sessionId, run } satisfies ShellEvent);
      }
    }
```
- Holder takeover: `destroyNative: (id) => nativeHost.destroy(id, { keepShells: true }),` with the comment `// G-1 (D2): the conversation is still open — on another device — so its background commands keep running here.`
- Session-exit backstop: `void nativeHost.destroy(sessionId, { keepShells: true }).catch(…)` with `// G-1: this path also fires for takeovers; a real close already ran SESSION_DESTROY's own destroy() (which kills) before session-exit.`

`src/main/remote-server.ts`:
- Import `ShellEvent` alongside `SpecialistsEvent`.
- Field: `private shellRunBuffers = new Map<string, Map<string, ShellEvent>>();   // G-1: sessionId → shellId → latest run view`
- Method after `bufferSpecialistRun`:
```ts
  /** G-1: connect-time catch-up for a background command's card — latest per
   *  shell id, never an append-only log (same reasoning as bufferSpecialistRun). */
  bufferShellRun(event: ShellEvent): void {
    let byShell = this.shellRunBuffers.get(event.sessionId);
    if (!byShell) { byShell = new Map(); this.shellRunBuffers.set(event.sessionId, byShell); }
    byShell.set(event.run.shellId, event);
  }
```
- `onSessionExit`: add `this.shellRunBuffers.delete(sessionId);` after the specialist line.
- `replayBuffers` (inside the `setTimeout`), after the specialist loop:
```ts
      // G-1: latest shell run per command, same position as the specialist replay.
      for (const [_sessionId, byShell] of this.shellRunBuffers) {
        for (const event of byShell.values()) {
          ws.send(JSON.stringify({ type: 'native:shell-event', payload: event }));
        }
      }
```
- WS case after `'native:sessions-list'`:
```ts
      case 'native:kill-shell': {
        // G-1: the phone's Stop button. Mirrors the desktop invoke's result shape.
        const result = this.nativeRuntime ? await this.nativeRuntime.nativeHost.killShell(payload.sessionId, payload.shellId) : { ok: false, reason: 'not-live' };
        this.respond(client.ws, type, id, result);
        break;
      }
```

**Android's copy of the shim is a tracked build artifact.** `app/src/main/assets/web/remote-shim.js`
is the compiled output of `remote-shim.ts` and IS committed. The phone's WebView reads `on.shellEvent`
out of that file, and Task 8 subscribes to it unguarded (`window.claude.on.shellEvent(...)`, matching
how `specialistEvent` is already called), so a stale bundle would be a TypeError at mount. Gradle's
`bundleWebUi` regenerates it on every Android build, so nothing breaks at runtime — but do NOT hand-edit
it, and expect the next Android build to produce a diff in it. That regeneration is why this task needs
no Android build of its own; the Kotlin change really is one string.

`SessionService.kt` — after the `"native:sessions-list",` line in the not-implemented `when` list:
```kotlin
            // G-1 background Bash: Stop a desktop command. Android has no
            // native harness, so this is the honest refusal; the phone stops a
            // DESKTOP command through the remote WebSocket path instead.
            "native:kill-shell",
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/ipc-channels.test.ts tests/remote-server.test.ts tests/workbench-mock-contract.test.ts` — Expected: PASS. (`workbench-mock-contract`'s "no MOCK_ONLY entry has since gained a real channel" now FAILS for `native.killShell` — that is Task 8's first red test; if it blocks this commit, do Task 8 Step 3's `mock-only.ts`/`mock-shim.ts` edits here and commit them together.)

- [ ] **Step 5: Commit**

```bash
bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/main/ipc-handlers.ts desktop/src/main/remote-server.ts desktop/src/renderer/hooks/useIpc.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt desktop/tests/ipc-channels.test.ts desktop/tests/remote-server.test.ts && git commit -m "feat(ipc): native:kill-shell on every surface; native:shell-event push with remote replay (G-1 Task 7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```
---

### Task 8: Renderer wiring — subscription, fold, resume rule, card tweaks, workbench

**Files:**
- Modify `src/renderer/App.tsx`, `src/renderer/components/buddy/BubbleFeed.tsx` (subscribe)
- Modify `src/renderer/state/chat-reducer.ts` (fold + resume rule)
- Modify `src/renderer/components/tool-views/ToolBody.tsx` (typed Stop, empty log line, no `0s`)
- Modify `src/renderer/dev/workbench/mock-shim.ts`, `src/renderer/dev/workbench/mock-only.ts`
- Test `tests/chat-reducer-shell.test.ts` (new), `tests/tool-body-shell.test.tsx` (new), `tests/workbench-mock-contract.test.ts` (existing, goes green again)

**Interfaces:**
- Consumes: `window.claude.on.shellEvent`, `window.claude.native.killShell`, `SHELL_RUN_CHANGED` (on the branch), `ShellInjectedMeta`.
- Produces: reducer helper `markOrphanedShellRuns(toolCalls: Map<string, ToolCallState>): Map<string, ToolCallState> | null` (exported for the test).

- [ ] **Step 1: Write the failing tests**

`tests/chat-reducer-shell.test.ts`:

```ts
// G-1 reducer half: the live run record lands on its Bash card, the
// shell-complete turn folds into the card instead of a bubble, and a resumed
// transcript's "running" card with no live record reads stopped/app-quit.
import { describe, it, expect } from 'vitest';
import { chatReducer, markOrphanedShellRuns } from '../src/renderer/state/chat-reducer';
import type { ChatState, ChatAction } from '../src/renderer/state/chat-types';
import type { ShellRunView } from '../src/shared/types';

const S = 'sess';
function init(): ChatState { return chatReducer(new Map(), { type: 'SESSION_INIT', sessionId: S }); }
function d(state: ChatState, a: ChatAction) { return chatReducer(state, a); }
function bashCard(state: ChatState, toolUseId: string, input: Record<string, unknown>, response?: string): ChatState {
  let s = d(state, { type: 'TRANSCRIPT_TOOL_USE', sessionId: S, uuid: `u-${toolUseId}`, toolUseId, toolName: 'Bash', toolInput: input });
  if (response !== undefined) s = d(s, { type: 'TRANSCRIPT_TOOL_RESULT', sessionId: S, uuid: `r-${toolUseId}`, toolUseId, toolName: 'Bash', toolResult: response, isError: false } as ChatAction);
  return s;
}
function run(over: Partial<ShellRunView> = {}): ShellRunView {
  return { toolUseId: 't1', shellId: 'sh-1', status: 'running', startedAt: 1_000, tail: 'a', logPath: '/log', ...over };
}
const card = (s: ChatState, id = 't1') => s.get(S)!.toolCalls.get(id)!;

describe('SHELL_RUN_CHANGED', () => {
  it('lands on the Bash card by toolUseId; an unknown card is dropped', () => {
    let s = bashCard(init(), 't1', { command: 'x', run_in_background: true });
    s = d(s, { type: 'SHELL_RUN_CHANGED', sessionId: S, run: run() });
    expect(card(s).shellRun?.shellId).toBe('sh-1');
    const before = s;
    s = d(s, { type: 'SHELL_RUN_CHANGED', sessionId: S, run: run({ toolUseId: 'nope' }) });
    expect(s).toBe(before);
  });
});

describe("TRANSCRIPT_USER_MESSAGE injected 'shell-complete'", () => {
  const meta = { kind: 'shell' as const, runs: [{ shellId: 'sh-1', toolUseId: 't1', exitCode: 0, elapsedMs: 5_000, logPath: '/log' }] };
  const msg = (over: Partial<Extract<ChatAction, { type: 'TRANSCRIPT_USER_MESSAGE' }>> = {}): ChatAction => ({
    type: 'TRANSCRIPT_USER_MESSAGE', sessionId: S, uuid: 'n1', text: '[Background command sh-1 finished · exit 0 · 5s]\n$ x\nout\nFull log: /log', timestamp: 10_000,
    injected: 'shell-complete', injectedMeta: meta, ...over,
  });
  it('folds into the card (no bubble) and fills a missing record from the meta', () => {
    let s = bashCard(init(), 't1', { command: 'x', run_in_background: true }, 'Started in the background (shell id sh-1).');
    const timelineBefore = s.get(S)!.timeline.length;
    s = d(s, msg());
    expect(s.get(S)!.timeline.length).toBe(timelineBefore);
    expect(card(s).shellRun).toEqual({ toolUseId: 't1', shellId: 'sh-1', status: 'exited', exitCode: 0, stopReason: undefined, detached: undefined, startedAt: 5_000, endedAt: 10_000, tail: '', logPath: '/log' });
    expect(s.get(S)!.isThinking).toBe(true);   // the model still reads this turn
  });
  it('never overwrites a live exited record (it has the real tail)', () => {
    let s = bashCard(init(), 't1', { command: 'x', run_in_background: true });
    s = d(s, { type: 'SHELL_RUN_CHANGED', sessionId: S, run: run({ status: 'exited', exitCode: 0, endedAt: 6_000, tail: 'real' }) });
    s = d(s, msg());
    expect(card(s).shellRun?.tail).toBe('real');
    expect(card(s).shellRun?.startedAt).toBe(1_000);
  });
  it('one turn, several runs → each card folds; a stopped-by-user run reads stopped', () => {
    let s = bashCard(bashCard(init(), 't1', { command: 'x' }), 't2', { command: 'y' });
    s = d(s, msg({ injectedMeta: { kind: 'shell', runs: [meta.runs[0], { shellId: 'sh-2', toolUseId: 't2', stopReason: 'user', elapsedMs: 100, logPath: '/l2' }] } }));
    expect(card(s, 't1').shellRun?.status).toBe('exited');
    expect(card(s, 't2').shellRun).toMatchObject({ status: 'stopped', stopReason: 'user' });
  });
  it('with no matching card the turn falls through to the timeline (older sessions)', () => {
    let s = init();
    s = d(s, msg());
    expect(s.get(S)!.timeline.some((e) => e.kind === 'user' && e.injected === 'shell-complete')).toBe(true);
  });
});

describe('resume rule (TRANSCRIPT_REPLAY_COMPLETE)', () => {
  it('a card whose result announced a shell id, with no live record, renders stopped / app-quit', () => {
    let s = bashCard(init(), 't1', { command: 'x', run_in_background: true }, 'Started in the background (shell id sh-4f2a). You\'ll be told when it finishes.');
    s = bashCard(s, 't2', { command: 'y' }, 'Still running after 2m — handed off to the background (shell id sh-9c10). You\'ll be told when it finishes.');
    s = bashCard(s, 't3', { command: 'z' }, 'plain output\n[cwd: /x · exit 0]');
    s = bashCard(s, 't4', { command: 'w', run_in_background: true }, 'Started in the background (shell id sh-live).');
    s = d(s, { type: 'SHELL_RUN_CHANGED', sessionId: S, run: run({ toolUseId: 't4', shellId: 'sh-live' }) });
    s = d(s, { type: 'TRANSCRIPT_REPLAY_COMPLETE', sessionId: S, sessionIdle: false } as ChatAction);
    expect(card(s, 't1').shellRun).toEqual({ toolUseId: 't1', shellId: 'sh-4f2a', status: 'stopped', stopReason: 'app-quit', detached: false, startedAt: 0, tail: '', logPath: '' });
    expect(card(s, 't2').shellRun).toMatchObject({ shellId: 'sh-9c10', status: 'stopped', stopReason: 'app-quit', detached: true });
    expect(card(s, 't3').shellRun).toBeUndefined();
    expect(card(s, 't4').shellRun?.status).toBe('running');
  });
  it('markOrphanedShellRuns returns null when nothing changes', () => {
    const s = bashCard(init(), 't3', { command: 'z' }, 'plain');
    expect(markOrphanedShellRuns(s.get(S)!.toolCalls)).toBeNull();
  });
});
```

`tests/tool-body-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
// G-1: the five card states from the workbench fixtures, plus the Stop wiring.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import ToolCard, { friendlyToolDisplay } from '../src/renderer/components/ToolCard';
import { ChatProvider } from '../src/renderer/state/chat-context';
import type { ToolCallState, ShellRunView } from '../src/shared/types';

afterEach(cleanup);
const base = (run?: ShellRunView, extra: Partial<ToolCallState> = {}): ToolCallState => ({
  id: 'x', toolUseId: 'toolu_1', toolName: 'Bash', status: 'complete',
  input: { command: 'npm run dev:renderer', description: 'Start the dev server', run_in_background: true },
  response: 'Started in the background (shell id sh-4f2a).', shellRun: run, ...extra,
} as ToolCallState);
const now = Date.now();
const running: ShellRunView = { toolUseId: 'toolu_1', shellId: 'sh-4f2a', status: 'running', startedAt: now - 134_000, tail: 'VITE ready', logPath: '/tmp/l.txt' };

function expand(t: ToolCallState) {
  const killShell = vi.fn(async () => ({ ok: true }));
  (window as any).claude = { native: { killShell }, on: {} };
  const { container } = render(<ChatProvider><ToolCard tool={t} sessionId="s1" /></ChatProvider>);
  fireEvent.click(screen.getByTestId('tool-card-chevron').closest('button')!);
  return { container, killShell };
}

describe('ShellView states', () => {
  it('running: strip with ticking elapsed, Stop, live output, log path; header suffix', () => {
    const { container, killShell } = expand(base(running));
    expect(container.textContent).toMatch(/Running in the background · 2m 1\ds/);
    expect(container.textContent).toContain('Live output');
    expect(container.textContent).toContain('Full log: /tmp/l.txt');
    expect(friendlyToolDisplay(base(running)).label).toContain('in the background');
    fireEvent.click(screen.getByText('Stop'));
    expect(killShell).toHaveBeenCalledWith('s1', 'sh-4f2a');
  });
  it('a refused Stop returns the button to "Stop"', async () => {
    (window as any).claude = { native: { killShell: async () => ({ ok: false, reason: 'not-running' }) }, on: {} };
    render(<ChatProvider><ToolCard tool={base(running)} sessionId="s1" /></ChatProvider>);
    fireEvent.click(screen.getByTestId('tool-card-chevron').closest('button')!);
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
  });
  it('finished: Background + green Exit 0 chip; failed: red Exit 1', () => {
    const a = expand(base({ ...running, status: 'exited', exitCode: 0, endedAt: running.startedAt + 702_000 }));
    expect(a.container.textContent).toContain('Exit 0 · 11m 42s');
    expect(a.container.textContent).toContain('Background');
    cleanup();
    const b = expand(base({ ...running, status: 'exited', exitCode: 1, endedAt: running.startedAt + 192_000 }));
    expect(b.container.textContent).toContain('Exit 1 · 3m 12s');
  });
  it('stopped: names the reason; detached: says it hit its time limit', () => {
    const a = expand(base({ ...running, status: 'stopped', stopReason: 'conversation-closed', endedAt: running.startedAt + 2_400_000 }));
    expect(a.container.textContent).toContain('Stopped when the conversation closed · after 40m');
    cleanup();
    const b = expand(base({ ...running, detached: true }));
    expect(b.container.textContent).toContain('Hit its time limit');
  });
  it('a rebuilt app-quit record shows no "0s" and no empty log line', () => {
    const { container } = expand(base({ toolUseId: 'toolu_1', shellId: 'sh-4f2a', status: 'stopped', stopReason: 'app-quit', detached: false, startedAt: 0, tail: '', logPath: '' }));
    expect(container.textContent).toContain('Stopped when the app quit');
    expect(container.textContent).not.toContain('after 0s');
    expect(container.textContent).not.toContain('Full log:');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/chat-reducer-shell.test.ts tests/tool-body-shell.test.tsx tests/workbench-mock-contract.test.ts` — Expected: FAIL — `markOrphanedShellRuns` is not exported; the fold test finds a timeline bubble; the mock-contract test reports `native.killShell` as a stale MOCK_ONLY entry.

- [ ] **Step 3: Implement**

`src/renderer/state/chat-reducer.ts`:
- Export the helper (near `findSpecialistCard`):

```ts
/** G-1 resume rule (spec §5.7): a Bash card whose result announced a shell id
 *  but that carries no live run record after replay was running when the app
 *  quit (a live registry would have replayed its record before this point).
 *  Returns null when no card changes so the reducer can keep its Map ref. */
export function markOrphanedShellRuns(toolCalls: Map<string, ToolCallState>): Map<string, ToolCallState> | null {
  let out: Map<string, ToolCallState> | null = null;
  for (const [id, card] of toolCalls) {
    if (card.toolName !== 'Bash' || card.shellRun || !card.response) continue;
    const m = /\(shell id (sh-[0-9a-f]+)\)/.exec(card.response);
    if (!m) continue;
    out ??= new Map(toolCalls);
    out.set(id, {
      ...card,
      shellRun: {
        toolUseId: card.toolUseId, shellId: m[1], status: 'stopped', stopReason: 'app-quit',
        detached: /^Still running after/.test(card.response),
        // Unknown after a restart: the card hides the timer and the log line
        // when these are empty rather than inventing "0s" or a blank path.
        startedAt: 0, tail: '', logPath: '',
      },
    });
  }
  return out;
}
```
- `TRANSCRIPT_USER_MESSAGE`: insert BEFORE the `// Specialists 1c: a BACKGROUND specialist's delivered report folds back` block (same locals `seenUuids`/`queuedMessages` are in scope):

```ts
      // G-1: a finished background command's notice folds into the Bash card
      // that started it — one turn may carry several (D8). The model still
      // reads this turn, so the turn boundary below is kept; only the bubble
      // is not appended. A record the live push already set is never
      // overwritten (it has the real tail); a missing or still-'running' one
      // is filled from the meta so a resumed transcript reads correctly.
      if (action.injected === 'shell-complete' && action.injectedMeta?.kind === 'shell') {
        const toolCalls = new Map(session.toolCalls);
        let folded = false;
        for (const r of action.injectedMeta.runs) {
          const card = toolCalls.get(r.toolUseId);
          if (!card) continue;
          folded = true;
          if (card.shellRun && card.shellRun.status !== 'running') continue;
          const startedAt = card.shellRun?.startedAt ?? action.timestamp - r.elapsedMs;
          toolCalls.set(r.toolUseId, {
            ...card,
            shellRun: {
              toolUseId: r.toolUseId, shellId: r.shellId,
              status: r.stopReason ? 'stopped' : 'exited', exitCode: r.exitCode, stopReason: r.stopReason,
              detached: card.shellRun?.detached, startedAt, endedAt: startedAt + r.elapsedMs,
              tail: card.shellRun?.tail ?? '', logPath: r.logPath,
            },
          });
        }
        if (folded) {
          next.set(action.sessionId, {
            ...session, toolCalls, seenUuids, queuedMessages,
            isThinking: true, currentGroupId: null, currentTurnId: null, attentionState: 'ok',
          });
          return next;
        }
      }
```
- Guard the existing specialist fold: change `if (action.injected && action.injectedMeta) {` to `if (action.injected && action.injectedMeta && action.injectedMeta.kind !== 'shell') {`.
- `TRANSCRIPT_REPLAY_COMPLETE`: replace the case body with:

```ts
      const session = next.get(action.sessionId);
      if (!session) return state;
      // G-1 (spec §5.7): applied whether or not the session is idle — it only
      // touches cards that got NO live record from the replay just before this.
      const orphaned = markOrphanedShellRuns(session.toolCalls);
      const withShells = orphaned ? { ...session, toolCalls: orphaned } : session;
      if (!action.sessionIdle) {
        if (!orphaned) return state;
        next.set(action.sessionId, withShells);
        return next;
      }
      next.set(action.sessionId, {
        ...withShells,
        ...endTurn(withShells, 'Session was closed while this was running'),
      });
      return next;
```
(keep the existing explanatory comments above the `endTurn` spread).

`src/renderer/App.tsx` — after the `specialistHandler` subscription:

```tsx
    // G-1: a background command's run record changed — lands on its Bash
    // card. MUST mirror BubbleFeed.tsx. on.shellEvent returns the unsubscribe fn.
    const shellHandler = window.claude.on.shellEvent((event) => {
      dispatch({ type: 'SHELL_RUN_CHANGED', sessionId: event.sessionId, run: event.run });
    });
```
and in the cleanup after `specialistHandler();` add `shellHandler();`.

`src/renderer/components/buddy/BubbleFeed.tsx` — after `unsubSpecialist`:

```tsx
    // G-1: background command records — MUST mirror App.tsx.
    const unsubShell = window.claude.on.shellEvent((event) => {
      if (event.sessionId !== sessionId) return;
      dispatch({ type: 'SHELL_RUN_CHANGED', sessionId, run: event.run });
    });
```
and `unsubShell();` in the cleanup.

`src/renderer/components/tool-views/ToolBody.tsx` (ShellView):
- `stop`: replace the `try { await (window as any).claude.native.killShell(…) } catch …` body with
```tsx
    try {
      const r = await window.claude.native.killShell(sessionId, run.shellId);
      // A refusal (already ended, unknown id) must not leave "Stopping…" up forever.
      if (!r.ok) setStopping(false);
    } catch (err) { console.error('KillShell failed:', err); setStopping(false); }
```
- `const elapsed = useElapsed(run?.startedAt, run?.endedAt);` → `const elapsed = useElapsed(run?.startedAt || undefined, run?.endedAt);` with the comment `// A rebuilt record (app quit) has no start time — no timer rather than "0s".`
- The log line: `{run && (` → `{run?.logPath && (` with the comment `// Empty on a record rebuilt after a restart — nothing honest to show.`

`src/renderer/dev/workbench/mock-only.ts` — back to `export const MOCK_ONLY: ReadonlyArray<{ channel: string; feature: string }> = [];` (delete the G-1 entry and its comment).

`src/renderer/dev/workbench/mock-shim.ts`:
- `HAND_WRITTEN`: add `'native.killShell', 'on.shellEvent',` after `'on.specialistEvent',` with the comment `// G-1 — real backend as of 2026-08-28; hand-written so the gallery's Bash cards keep their fixture state.`
- Replace the `const native = { supported: true, killShell: … } as unknown as Ns<'native'>;` line with:
```ts
  // G-1: the card's Stop just resolves — the gallery fixture stays in its state.
  const native: Ns<'native'> = { supported: true, killShell: async () => ({ ok: true }) };
```
- Next to `specialistSubs`: `const shellSubs = new Set<(e: any) => void>();` and after the `(on as any).specialistEvent = …` line: `(on as any).shellEvent = (cb: (e: any) => void) => { shellSubs.add(cb); return () => { shellSubs.delete(cb); }; };`

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/chat-reducer-shell.test.ts tests/tool-body-shell.test.tsx tests/workbench-mock-contract.test.ts tests/workbench-channels.test.ts tests/workbench-shim-semantics.test.ts tests/chat-reducer.test.ts tests/chat-reducer-specialists.test.ts` — Expected: PASS. Then the boot check (announce the browser tab to Destin first — it opens nothing visible when headless, but the workbench server prints a URL):

```bash
bash scripts/run-workbench.sh bash-bg &   # background; note the pid
node scripts/workbench-boot-check.mjs        # Expected: every registered route mounts with no console error
kill %1
```

- [ ] **Step 5: Commit**

```bash
bash scripts/verify.sh worktrees/bash-bg
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add desktop/src/renderer/App.tsx desktop/src/renderer/components/buddy/BubbleFeed.tsx desktop/src/renderer/state/chat-reducer.ts desktop/src/renderer/components/tool-views/ToolBody.tsx desktop/src/renderer/dev/workbench/mock-shim.ts desktop/src/renderer/dev/workbench/mock-only.ts desktop/tests/chat-reducer-shell.test.ts desktop/tests/tool-body-shell.test.tsx && git commit -m "feat(chat): background Bash card wired to the real push and Stop; notice folds into the card; resume rule (G-1 Task 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```
---

### Task 9: Depth doc — `youcoded/docs/native-runtime.md` (youcoded repo)

**Files:**
- Modify `/home/destin/youcoded-dev/worktrees/bash-bg/docs/native-runtime.md` (append a section at the end)

**Interfaces:** none (docs). Anchors below are checked by `node scripts/audit-anchors.mjs` from the workspace.

- [ ] **Step 1: Append the section** (after the "Specialists (plan 1c …)" section's final `Rule:` line):

```markdown
## Background Bash (ledger G-1, shipped 2026-08-28)

Design: workspace `docs/archive/specs/2026-08-28-bash-background-execution-design.md`; plan
`docs/archive/plans/2026-08-28-bash-background-execution.md`. A native Bash command can outlive its
call: `run_in_background: true` starts it and returns a shell id at once, and a foreground command
still running at its `timeout` is HANDED OFF to the background instead of SIGKILLed (the 10-minute
cap is gone). `BashOutput` reads new output since the last look (or lists this conversation's runs);
`KillShell` stops one. The finished result always arrives on its own.

- **`ShellRegistry` (`harness/shell-registry.ts`) is the one owner of every such run; the HOST
  owns its lifetime.** One per session id in `NativeSessionHost.shellRegistries`, handed to the
  `HarnessSession` as `opts.shells` → `ToolContext.shells`. Why host-owned and not session-owned:
  a remote takeover and the session-exit backstop destroy the session but must leave its commands
  running (D2 — the conversation is still open, elsewhere); those runs still need an owner that
  can kill them at app quit and re-attach them if the same conversation is resumed in this process.
  <!-- verify: {"path": "youcoded/desktop/src/main/harness/native-session-host.ts", "contains": "shellRegistries"} -->
- **Honest family kill, foreground too.** Every Bash child is spawned in its own process group
  (`spawnDetached`); a kill is `SIGTERM` to the group then `SIGKILL` after 2 s (`killTree`),
  `taskkill /PID <pid> /T /F` on Windows. Escape used to kill only the outer bash and orphan a
  `node` it started. `execute` still resolves IMMEDIATELY on abort — only the escalation runs on.
  Pinned by the `sleep 30 & wait` grandchild tests (`shell-registry`, `bash-background`).
  <!-- verify: {"path": "youcoded/desktop/src/main/harness/shell-registry.ts", "contains": "SIGTERM"} -->
- **A time limit hands off; it never kills — except a leading `sleep`.** The same process is
  adopted (`registry.adopt`), stdin is closed (D4: a prompt fails fast instead of hanging in a
  slot forever), no cwd probe or `persistent_env` result is applied (D6 — the registry unlinks the
  env temp file when the command finally exits), and the cwd/env sentinels it prints at exit are
  filtered ON READ (tail, BashOutput, notice) while the raw log keeps them. The cap (5) counts
  explicit starts only; a hand-off always succeeds (D5).
- **Output: on disk from the first byte, a 200-line ring in memory, 40 lines on the wire.**
  The log reuses the spill naming and the 7-day sweep, which MOVED to `spill-paths.ts` in this
  change so background logs are swept too (in `bash.ts` it only ever fired from a foreground
  spill). `lastReadBytes` (the log's byte length at the last BashOutput) is the read cursor, and
  the read is POSITIONAL and capped at `READ_MAX_BYTES` — never load a multi-hundred-MB build log
  into the main process to slice off its tail. Carriage-return redraws are normalized to newlines
  (`normalizeNewlines`) so a progress bar cannot grow one unfinished line without bound.
  `'change'` events are debounced to ≤4/s per run and carry a `ShellRunView` with the last 40
  lines — the phone on cellular is the reader.
  <!-- verify: {"path": "youcoded/desktop/src/main/harness/tools/spill-paths.ts", "contains": "sweepOldSpillFiles"} -->
- **Delivery reuses the specialists' idle-boundary path.** `queueHostNotice(parentId, text,
  meta, whyDropped)` → `drainDeliveries` → `runNotice(text, meta)` with `injected:
  'shell-complete'`; `injectedMeta` is the union `SpecialistInjectedMeta | ShellInjectedMeta`, the
  shell shape carrying a LIST of runs because every shell notice ready in one drain goes out as
  ONE turn (D8 — a `runNotice` is a full model turn). KillShell's own result is its notice (none
  sent); a user Stop IS reported; conversation-closed / app-quit have no session left to tell.
  <!-- verify: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "shell-complete"} -->
- **`BashOutput` is exempt from the doom-loop window and capped at 8 reads per turn (D7)** —
  a poll is supposed to repeat; the flat cap covers the chatty-build case the old
  "three empty checks" idea missed. Both companions are always-allowed (`rulesForMode`).
- **IPC.** `native:kill-shell` rides the request parity (preload, remote-shim, remote-server WS,
  `SessionService.kt` → not-implemented-on-mobile; pinned in `ipc-channels.test.ts`), NOT gated
  on `native.supported` so a phone can Stop a desktop command. `native:shell-event` is a push in
  the `specialists:event` shape (window + `remoteServer.bufferShellRun` + broadcast; replayed on
  connect, pinned in `remote-server.test.ts`) and re-sent on `TRANSCRIPT_REPLAY` via
  `nativeHost.shellRunsFor`.
- **Resume rule.** After replay, a Bash card whose result announced a shell id and got no live
  record renders "Stopped when the app quit" (`markOrphanedShellRuns`); a card with a
  `shell-complete` turn in the transcript rebuilds its exit from the turn's meta.

### Accepted limitations (declared, not bugs)

- **App crash (not quit) leaves commands running with no owner** — nothing in userland runs on
  SIGKILL or power loss.
- **After a restart, a run that was stopped by KillShell or by the Stop button before the quit
  also reads "Stopped when the app quit"** — the run's final state is never persisted; only the
  finished notice is. The same label appears on the OTHER device after a takeover while the
  command keeps running on the first one.
- **Concurrent writes** by a background command to files the assistant is editing are not detected.
- **Windows tree kill** relies on `taskkill /T`; the grandchild test is POSIX-only, the Windows
  path is unit-mocked.
- **The cap of 5 is per registry, and every specialist child gets its own** — a conversation running
  five helpers can therefore hold thirty background commands at once. Deliberate: a helper that
  cannot start its own build is a helper that cannot do its job, and every one of those runs still
  dies with its child under `conversation-closed`.
- **A read is capped at 1 MB per call** (`READ_MAX_BYTES`). A command that prints more than that
  between two `BashOutput` calls has its older lines skipped, not queued — `bounds.total` goes to
  `null` ("at least N") and the hint names the log, which holds everything.

Rule: `.claude/rules/harness-tools.md` → the "Background Bash" bullet.
```

- [ ] **Step 2: Check the anchors resolve** — `node scripts/audit-anchors.mjs` — Expected: no new failures (the three anchors above point at strings landed in Tasks 1 and 6; the script scans `youcoded/docs/` in the MAIN checkout, so this only goes fully green after merge — run it on the worktree copy instead: `grep -c "shellRegistries" worktrees/bash-bg/desktop/src/main/harness/native-session-host.ts` → `≥1`, same for `SIGTERM` in `shell-registry.ts` and `shell-complete` in `harness-session.ts`).

- [ ] **Step 3: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/bash-bg && git add docs/native-runtime.md && git commit -m "docs(native-runtime): background Bash — registry ownership, hand-off, delivery, IPC, resume, limitations (G-1 Task 9)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```

---

### Task 10: Workspace docs — rule bullet (600-word budget), ROADMAP flip, spec/plan/investigation status (youcoded-dev repo, separate commit)

**Files:**
- Modify `/home/destin/youcoded-dev/.claude/rules/harness-tools.md`
- Modify `/home/destin/youcoded-dev/ROADMAP.md`
- Modify `/home/destin/youcoded-dev/docs/active/specs/2026-08-28-bash-background-execution-design.md`, `/home/destin/youcoded-dev/docs/active/investigations/2026-08-28-bash-background-spec-review.md`, this plan (status), then `git mv` all three under `docs/archive/` **at merge time** (the "merge means archive the docs" rule).

**Interfaces:** none.

- [ ] **Step 1: Check for another session's hunks first** — `cd /home/destin/youcoded-dev && git status --short ROADMAP.md .claude/rules/harness-tools.md docs/active/` — if either file is already `M`, stage YOUR hunks only with `git add -p <file>` in Step 4 and say so in the report to the parent.

- [ ] **Step 2: Rule edits** in `.claude/rules/harness-tools.md`

Frontmatter `verify:` — add after the `bash.ts` entry:
```yaml
  - path: youcoded/desktop/src/main/harness/shell-registry.ts
    contains: "SIGTERM"
  - test: youcoded/desktop/tests/shell-registry.test.ts
  - test: youcoded/desktop/tests/bash-background.test.ts
```
and bump `last_verified: 2026-08-28` (already that date).

Body — the budget is 600 words and the body sits at 597 (`awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' .claude/rules/harness-tools.md | wc -w`). Make exactly these three edits:

1. Replace the intro line
   `Session lifecycle: \`native-runtime.md\`. **Depth + why for every bullet: \`youcoded/docs/native-runtime.md\` (Plan A/B rule-overflow, "Tool output honesty", M3 skills/injection, MCP sections).**`
   with
   `Session lifecycle: \`native-runtime.md\`. **Depth + why for every bullet: \`youcoded/docs/native-runtime.md\`.**`
2. Replace `- **A server's own annotations (\`readOnlyHint\`, \`destructiveHint\`) are IGNORED** — not trusted about its own danger.` with `- **A server's own \`readOnlyHint\`/\`destructiveHint\` are IGNORED.**`
3. Add, as the last bullet of `## Core tools`:
   `- **Background Bash lives in \`ShellRegistry\` (\`harness/shell-registry.ts\`), HOST-owned per session** — group/tree kill (\`SIGTERM\`→\`SIGKILL\` 2 s, \`taskkill /T\`), foreground too; a time limit HANDS OFF (never kills) except a leading \`sleep\`; stdin closed; cap 5 counts explicit starts only; \`BashOutput\` is doom-loop-exempt, 8 reads/turn — guards: \`shell-registry\`/\`bash-background\`/\`bash-output-kill-shell\` tests.`

Then re-count: `awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' .claude/rules/harness-tools.md | wc -w` — Expected: `≤ 600`. If over, shorten the new bullet's guard list to `guards: \`shell-registry\`/\`bash-background\` tests` and re-count.

- [ ] **Step 3: ROADMAP + status**

`ROADMAP.md` — flip the G-1 item:
`- [ ] **Bash: background execution instead of a 10-minute SIGKILL** \`feature\` \`#native-runtime\` \`#harness\` (added 2026-08-28 — ledger G-1)` → `- [x] **Bash: background execution instead of a 10-minute SIGKILL** \`feature\` \`#native-runtime\` \`#harness\` (added 2026-08-28 — ledger G-1; shipped 2026-08-28)` and replace the trailing `**Spec:** \`docs/active/specs/…\` (awaiting Destin's read → plan).` with `**Shipped** — spec \`docs/archive/specs/2026-08-28-bash-background-execution-design.md\`, plan \`docs/archive/plans/2026-08-28-bash-background-execution.md\`, depth \`youcoded/docs/native-runtime.md\` → "Background Bash". Also fixed in passing: the polls-vs-doom-loop guard is a flat 8-reads/turn cap (D7), not the 3-strike counter named above.` Leave the "Background Bash follow-ups" item open.

Spec, review and this plan: set `status: shipped` in their frontmatter.

- [ ] **Step 4: Commit (workspace repo)**

```bash
cd /home/destin/youcoded-dev && git add .claude/rules/harness-tools.md ROADMAP.md docs/active/specs/2026-08-28-bash-background-execution-design.md docs/active/investigations/2026-08-28-bash-background-spec-review.md docs/active/plans/2026-08-28-bash-background-execution.md && git commit -m "docs: background Bash shipped — rule bullet, ROADMAP G-1 flipped, spec/plan/review marked shipped

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FW77yMCvebQ79KQ9AQwGnj"
```

At merge time (after the youcoded PR lands on `origin/master`): `git mv` the three docs into `docs/archive/{specs,plans,investigations}/`, fix the two paths in the ROADMAP line and in `youcoded/docs/native-runtime.md`'s section header, commit, push; then `git worktree remove worktrees/bash-bg` and delete `feat/bash-background-ui` remotely and locally.

---

## Self-review (done while writing; fixes applied inline)

**1. Spec section → task coverage**

| Spec | Task |
|---|---|
| §4.1 `run_in_background`, start text, cap text, `persistent_env` refusal, cwd/env not applied, stdin closed | 3 (+ registry `stdio` in 1) |
| §4.1 timeout = hand-off, hand-off text, `sleep` exemption, 124/SIGKILL out of the description | 4 (+ description in 3) |
| §4.2 BashOutput id/list/nothing-new/unknown, bounds, per-turn cap, doom-loop exemption, never asks | 5 |
| §4.3 KillShell text, unknown/ended sentence, no notice | 5, 6 |
| §4.4 notice block, one turn for several | 1 (`formatFinishedNotice`), 6 |
| §4.5 tiers (shortDescription on both) | 5 |
| §5.1 registry fields/methods, wire tail 40, debounce, host ownership + destroy/destroyAll/interrupt paths, compaction survival | 1, 6 (compaction: the registry is host state, untouched by `maybeCompact` — no code needed; pinned indirectly by the "interrupt leaves runs" test) |
| §5.2 detached spawn, tree kill, foreground change, immediate resolve, grandchild tests | 1, 2 |
| §5.3 log from first byte, ANSI strip, seed on adopt, sentinels filtered on read | 1, 4 |
| §5.4 `pendingHostNotices` shape, parameterised liveness log, concatenation, `runNotice` discriminant, `injectedMeta` union, fold | 6, 8 |
| §5.5 hand-off via adopt, never at the cap, never for sleep | 4 |
| §5.6 `native:kill-shell` parity, `native:shell-event` push + replay | 7 |
| §5.7 resume rule | 8 |
| §6 renderer remaining items | 8 |
| §7 tests | every task's Step 1; `native-tools-polish` pins in 3 |
| §8 limitations, §10 files | 9, File Structure |
| §9 follow-ups | already filed in ROADMAP; untouched |

**2. Placeholder scan** — no "TBD", "add error handling", "similar to Task N"; every referenced test and code block is written out. One deliberate cross-reference: Task 7 Step 4 notes the mock-contract test goes red until Task 8's two mock edits — the plan says to fold those edits into Task 7 if the commit would otherwise be red.

**3. Name consistency** — `ShellRegistry.start/adopt/get/list/runningExplicitIds/read/tailText/toView/kill/killAll` (Task 1) match every caller in Tasks 3–6; `spawnDetached/killTree/formatElapsed/stateText/formatFinishedNotice/NOTICE_TAIL_LINES/MAX_EXPLICIT_RUNNING` imported by name where used; `ShellInjectedMeta.runs[]` is what `onShellExit` (6), `drainDeliveries` (6) and the reducer fold (8) all read; `killShell` result `{ ok, reason }` is the same on host (6), ipc/WS (7) and the card (8); `shellRunsFor` (6) is what `TRANSCRIPT_REPLAY` (7) replays; `markOrphanedShellRuns` is exported (8) for its test.

**Deviations from the spec, decided while planning (flag to Destin):**
- §5.1 says the registry is "owned by `HarnessSession`"; here the HOST owns its lifetime (map keyed by session id) and the session only holds the reference — otherwise a taken-over session's runs are unreachable at app quit, breaking D2's second half.
- §5.4's meta shape is a single run; D8 (several notices → one turn) forces a LIST (`runs[]`), and `logPath` is added so a resumed card can name its log.
- A user Stop (card button) sends a finished notice ("stopped by you") — the spec is silent; the model must not keep believing its server is up. KillShell still sends none.
- Finished runs are kept for the life of the conversation with no cap. An earlier draft evicted past 50, which saved tens of KB and bought a false "No background command sh-abcd" about a command that plainly existed.

---

## Review pass 2026-08-28 (second reader) — changes folded in above

Verified against the branch, not inferred. Eight fixes, all already applied in the tasks:

1. **A compile error in Task 6.** `drainDeliveries` read `.kind` off a union whose specialist half had no such field; `tsc` rejects that. Fixed by declaring `kind?: undefined` on `SpecialistInjectedMeta` and using `.kind === 'shell'` at all five sites, instead of alternating with `'kind' in meta`.
2. **A handed-off log was half colour codes.** `bash.ts` keeps `headBuf` RAW and strips ANSI only at write time (`bash.ts:633`); the seed write did not. The model's first `BashOutput` after a hand-off would have read `[1m[30m RUN`. Now `stripAnsi(normalizeNewlines(seedLog))`.
3. **Background logs were never swept.** The 7-day sweep only ever fired from `startSpill()` inside `bash.ts`; the registry opens its own log and never called it, so a user whose long commands all run in the background leaked every log forever. Sweep moved to `spill-paths.ts` (whose own header names "one definition, two importers" as its reason to exist) and called from `register()`.
4. **A hand-off could still apply the command's `cwd`.** The "never applies cwd" property held only because an unfinished command has not printed its sentinel yet — the timer can fire in the same instant it finishes. Now guarded explicitly on `handedOffTo`.
5. **`read()` loaded the entire log every call.** Hundreds of MB, up to eight times a turn. Now a positional read bounded by `READ_MAX_BYTES`, with `truncated` reported honestly (`bounds.total: null` → "at least N", never a count we did not measure).
6. **A redrawing progress bar grew one line without bound.** npm/gradle/pip/docker redraw with `\r` and no newline, so the line splitter never fired. `normalizeNewlines` + a `MAX_PARTIAL_CHARS` ceiling.
7. **Close-then-quit inside 2 s left a process alive.** A close removed the registry from the map immediately but escalated SIGTERM→SIGKILL two seconds later; quitting in that window left nothing able to reach a process ignoring SIGTERM. `drainingShellRegistries` holds it until the kill settles, and `destroyAll` sweeps that set too.
8. **`KillShell` said "Stopped X" and then that X had not stopped.** Two headline verbs now, one true in each case.

Also added: **Task 0** — `verify.sh` fails on the branch *before* this plan changes anything (5 failures; the mockup commit added a `shell_run` fixture kind the guard test's allowlist never learned). Every "expected: FAIL / expected: PASS" step below is only meaningful against a green baseline, so that goes first.

Also added: **one end-to-end test** (Task 6) — the only test in the plan that crosses every seam, letting the real Bash tool mint the run so the `ctx.toolCallId → run.toolUseId → card key` chain is actually exercised. Every other test builds one layer's input by hand, and a break in that chain means the card silently never updates.

Checked and found sound, no change needed: `ctx.toolCallId` is populated for every tool call (`harness-session.ts:2873`), so the card key is real; transcript events are forwarded to the renderer synchronously before the tool executes (`native-session-host.ts:2647`), so the first `shell-event` cannot beat its own card into existence; `SESSION_DESTROY` fires only on an explicit close (`ipc-handlers.ts:837`), so switching conversations does not kill background commands and the `keepShells` mapping in Task 7 is right; `recentCalls` is already a per-turn local, so the doom-loop edit needs no new reset; the rule body really is at 597 of 600 words, so Task 10's three trims are required.
