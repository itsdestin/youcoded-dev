---
status: shipped
---
# CI follow-ups A — protect master, fix the three product races

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a red check block a merge (Destin's deck answer Q-1, 2026-09-16), and fix the three product races that the CI/test health review found hiding behind "flaky" tests (Q-6).

**Architecture:** Branch protection is one GitHub API call, verified with a throwaway pull request. The three races each get a failing test first, a small change at one named site, and the strict assertion restored. Nothing here touches the renderer.

**Tech Stack:** GitHub CLI (`gh`), Node 22, vitest 4, TypeScript. App repo `itsdestin/youcoded` (`desktop/`), workspace repo `itsdestin/youcoded-dev`.

## Global Constraints

- **Start with** `node scripts/workspace-start.mjs --session ci-followups-a youcoded` from `/home/destin/youcoded-dev`. Every path below is relative to the returned worktree unless it starts with `/`. Never edit `/home/destin/youcoded-dev/youcoded` (the shared checkout).
- **Prerequisite:** `session/ci-test-health` is merged in BOTH repos. Check: `git -C <worktree>/youcoded log --oneline origin/master | grep -c 'make master green'` prints `1`, and `git -C <worktree> log --oneline origin/master | grep -c 'CI/test health'` prints at least `1`. If either prints `0`, stop and tell Destin: "Plan A needs session/ci-test-health merged first (youcoded, then youcoded-dev)."
- **Never touch Destin's running YouCoded app** (`.claude/rules/live-app-safety.md`). Everything here is tests, main-process source and repo settings.
- **Stage by explicit path**, never `git add -A`. Every non-trivial code edit carries a `// WHY` comment. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the model in use).
- **Before claiming a desktop change done:** `bash scripts/verify.sh <worktree>/youcoded` from `/home/destin/youcoded-dev/worktrees/sessions/ci-followups-a` (types, related tests, knip, lint, ast-grep). `--full` for the whole suite.
- **Prove Windows and macOS on CI without a PR:** `gh workflow run desktop-ci.yml --ref <branch>` in the app repo, then `gh run list --workflow desktop-ci.yml --branch <branch> --limit 1`, wait for `completed`, and read `gh run view <id> --log-failed` — the verdict alone is not evidence.
- **Push every branch once it has a commit.** Opening the pull requests named in this plan is authorised (Destin, 2026-09-16: "work through it autonomously without my input"). **Merging is not**: the last step of this plan asks him "ready to merge?" once, and stops.
- **Roadmap grammar** (`ROADMAP.md`): an entry ends with tokens `\`<surface>\` \`<seen-on>\` \`<status>\` \`checked YYYY-MM-DD\``; run `node scripts/roadmap-check.mjs --quiet` after every roadmap edit. Closing an entry = delete it from its area file and append one line to `docs/roadmap/shipped.md` in that file's existing format.

---

### Task 1: Protect master on the app repo

**Files:**
- Modify (workspace): `docs/workspace-workflows.md:34` (the paragraph that starts "**A red check on the PR: run `bash scripts/ci-red-vs-master.sh`")
- Delete (workspace): `scripts/ci-red-vs-master.sh`
- Modify (workspace): `docs/roadmap/dev-workspace.md` (two mentions of `ci-red-vs-master.sh`, lines ~51 and ~82 — leave the roadmap text alone, it is history; only the workflows doc changes)

**Interfaces:**
- Produces: the required status check name `build (ubuntu-latest)` on `master` of `itsdestin/youcoded`. Every later plan assumes a red Linux check blocks a merge.

- [ ] **Step 1: Confirm the check exists on master with the new workflow**

Run:
```bash
gh run list -R itsdestin/youcoded --workflow desktop-ci.yml --branch master --limit 1 --json databaseId,conclusion --jq '.[0]'
gh run view -R itsdestin/youcoded $(gh run list -R itsdestin/youcoded --workflow desktop-ci.yml --branch master --limit 1 --json databaseId --jq '.[0].databaseId') --json jobs --jq '.jobs[].name'
```
Expected: the job names include `changes` and `build (ubuntu-latest)`. If `changes` is missing, the merge prerequisite is not met — stop (see Global Constraints).

- [ ] **Step 2: Apply branch protection**

Run:
```bash
gh api -X PUT repos/itsdestin/youcoded/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["build (ubuntu-latest)"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
gh api repos/itsdestin/youcoded/branches/master/protection --jq '.required_status_checks.contexts'
```
Expected: the second command prints `["build (ubuntu-latest)"]`. `enforce_admins: false` is deliberate: Destin keeps a way through if the runners are down.

- [ ] **Step 3: Prove a docs-only change still merges (skipped check counts as passing)**

Run, in the app worktree:
```bash
git switch -c probe/docs-only-check origin/master
printf '\n<!-- branch-protection probe %s -->\n' "$(date -u +%FT%TZ)" >> docs/CNAME.md 2>/dev/null || printf '\n<!-- branch-protection probe -->\n' >> docs/index.html
git add docs && git commit -q -m "probe: docs-only change for the required check" && git push -q -u origin probe/docs-only-check
gh pr create -R itsdestin/youcoded --title "probe: docs-only change (do not merge)" --body "Verifies the skipped build check satisfies branch protection. Close without merging." --head probe/docs-only-check
sleep 90
gh pr view -R itsdestin/youcoded probe/docs-only-check --json statusCheckRollup,mergeStateStatus --jq '{merge: .mergeStateStatus, checks: [.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}]}'
```
Expected: `checks` contains `build (ubuntu-latest)` with `conclusion: "SKIPPED"` and `merge` is `"CLEAN"` (or `"UNSTABLE"` only if some OTHER check is pending — wait and re-run). If `merge` is `"BLOCKED"`, the skipped job is not being counted: read `gh pr checks`, and if the required context never appears, the fix is to give the `changes` job's docs-only branch a real completed status by adding to `desktop-ci.yml` a job `docs-only` with `if: needs.changes.outputs.code == 'false'`, `runs-on: ubuntu-latest`, one step `run: echo "docs only"`, and changing the required context to `docs-only`? No — keep one context. Instead add the same-named job: matrix `os: [ubuntu-latest]`, name `build`, `if: needs.changes.outputs.code == 'false'`, one echo step. Then re-run this step.

- [ ] **Step 4: Prove a code change is blocked while red, then close the probe**

Run:
```bash
gh pr close -R itsdestin/youcoded probe/docs-only-check --delete-branch
git switch -c probe/red-check origin/master
printf 'it("probe: must be red", () => { expect(1).toBe(2); });\n' > desktop/tests/zz-probe-red.test.ts
sed -i '1i import { it, expect } from "vitest";' desktop/tests/zz-probe-red.test.ts
git add desktop/tests/zz-probe-red.test.ts && git commit -q -m "probe: a red test (do not merge)" && git push -q -u origin probe/red-check
gh pr create -R itsdestin/youcoded --title "probe: red check (do not merge)" --body "Verifies a red Linux check blocks the merge. Close without merging." --head probe/red-check
```
Wait for the Linux job to finish (about 12 minutes): `gh pr checks -R itsdestin/youcoded probe/red-check --watch`. Then:
```bash
gh pr view -R itsdestin/youcoded probe/red-check --json mergeStateStatus --jq .mergeStateStatus
gh pr close -R itsdestin/youcoded probe/red-check --delete-branch
git switch - && git branch -D probe/docs-only-check probe/red-check 2>/dev/null; true
```
Expected: `BLOCKED`. Both probe PRs closed, both branches gone (`gh api repos/itsdestin/youcoded/branches/probe/red-check` returns 404).

- [ ] **Step 5: Retire the script that excused red**

In the workspace worktree:
```bash
git rm -q scripts/ci-red-vs-master.sh
```
Edit `docs/workspace-workflows.md`: replace the paragraph beginning `**A red check on the PR: run \`bash scripts/ci-red-vs-master.sh\`` with:

```markdown
**A red check on the PR is yours until proven otherwise.** Master is protected on
`build (ubuntu-latest)` (2026-09-16), so a red Linux check stops the merge: open the failed
job's log (`gh run view <id> --log-failed`), find the `FAIL` lines, and fix them on the branch.
Windows and macOS run on master and nightly, not on PRs; a red there after your merge is
still yours the same day. Never re-run a red job hoping it goes green without reading it.
```
Run `rg -n 'ci-red-vs-master' --glob '!docs/archive/**' --glob '!docs/roadmap/**' --glob '!docs/wrap-ups.md' .` — expected: only `docs/active/investigations/2026-09-16-ci-test-health.md` and this plan. Leave those (history).

- [ ] **Step 6: Commit and push (workspace repo)**

```bash
git add docs/workspace-workflows.md scripts/ci-red-vs-master.sh
git commit -q -m "ci: master is protected on the Linux check; retire the script that excused red

Branch protection applied <today's date> per the 2026-09-16 deck (Q-1). Docs-only PRs
report the build as skipped, which satisfies the required check; a red Linux
check blocks. ci-red-vs-master.sh existed to say 'already red on master, go
ahead' — with protection there is no such state to excuse.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -q -u origin session/ci-followups-a
```

---

### Task 2: The Bash tool must not drop output that arrives after `exit`

**Files:**
- Modify: `youcoded/desktop/src/main/harness/shell-registry.ts:334` (the line `spec.child.on('exit', (code, signal) => this.onExit(run, code, signal));`) and the export list near line 9 (`export const RING_LINES …` area — add `EXIT_DRAIN_GRACE_MS` beside the other exported constants)
- Test: `youcoded/desktop/tests/shell-registry.test.ts` (add two cases after the existing "a redrawing progress bar cannot grow the partial line without bound" case at line ~195)

**Interfaces:**
- Consumes: `ShellRegistry.start(spec)` returns `{ ok: true, run }` with `run.exited: Promise<void>`, `run.tail: string[]`, `run.partial: string` (already exported).
- Produces: `export const EXIT_DRAIN_GRACE_MS = 200` from `shell-registry.ts`. Task 4 (close-out) cites it.

Why this is a real bug: Node emits a child's `exit` when the process ends, and `close` only after its stdio pipes have drained. `onExit` runs on `exit`, so a final stdout chunk that arrives between the two is ingested into a run already marked `exited`, after `run.exited` resolved and after `BashOutput` may have read the tail. The test "a redrawing progress bar…" read `['p 1','p 2']` on macOS CI for exactly this reason.

Why not simply `close`: a command like `sleep 100 &` leaves a grandchild holding the pipe, and `close` then waits for the grandchild — the Bash tool would hang on every backgrounded process. So: settle on `close`, or `EXIT_DRAIN_GRACE_MS` after `exit`, whichever is first.

- [ ] **Step 1: Write the two failing tests**

In `tests/shell-registry.test.ts`, directly after the "a redrawing progress bar cannot grow the partial line without bound" case (inside the same `describe`, which already has `dir` and `reg` in scope and skips on Windows via `posix`), add:

```ts
  it('output written in the last instant before exit is never lost (settles on close, not exit)', async () => {
    // WHY twenty runs: the loss is a race between the child's `exit` event and the
    // last stdout chunk. One run passes most of the time; twenty make the old
    // exit-based settle fail reliably on a 2-core runner, and cost under a second.
    for (let i = 0; i < 20; i++) {
      const r = reg.start(startSpec(`printf 'p 1\\rp 2\\rp 3\\n'`, dir, `tu-drain-${i}`));
      if (!r.ok) throw new Error('start failed');
      await r.run.exited;
      expect(r.run.tail).toEqual(['p 1', 'p 2', 'p 3']);
      expect(r.run.partial).toBe('');
    }
  });

  it('a grandchild holding stdout open cannot hold the run open past the grace', async () => {
    // `sleep 2 &` inherits the pipe; with a pure `close` settle this would take 2 s.
    const r = reg.start(startSpec('sleep 2 & echo done', dir, 'tu-grace'));
    if (!r.ok) throw new Error('start failed');
    const t0 = Date.now();
    await r.run.exited;
    expect(r.run.tail).toEqual(['done']);
    // Not a wall-clock budget on the code under test — a ceiling that separates
    // "settled after the grace" (~200 ms) from "waited for the grandchild" (2 s).
    expect(Date.now() - t0).toBeLessThan(EXIT_DRAIN_GRACE_MS + 1_000);
  });
```
Add `EXIT_DRAIN_GRACE_MS` to the import list from `../src/main/harness/shell-registry` at the top of the file.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd <worktree>/youcoded/desktop && npx vitest run tests/shell-registry.test.ts -t 'never lost|grandchild'`
Expected: the file fails to load with `EXIT_DRAIN_GRACE_MS` not exported (TypeScript/ESM error), or after a temporary `export const EXIT_DRAIN_GRACE_MS = 200;` the first test fails on some iteration with `expected ['p 1','p 2'] to deeply equal ['p 1','p 2','p 3']` (it may take a few runs; run it 3 times — if it passes 3/3 on this 32-core machine that is expected, the race is a slow-runner race; proceed).

- [ ] **Step 3: Implement the drain grace**

In `shell-registry.ts`, next to the other exported constants (search `export const RING_LINES`), add:

```ts
/** After a child's `exit`, how long to wait for its stdio `close` before settling
 *  the run anyway. WHY: `exit` fires before the last stdout chunk is delivered, so
 *  settling on it lost the final line of output (macOS CI, 2026-09-16). Settling on
 *  `close` alone would hang on `sleep 100 &` — a grandchild keeps the pipe open. */
export const EXIT_DRAIN_GRACE_MS = 200;
```

Replace the line `spec.child.on('exit', (code, signal) => this.onExit(run, code, signal));` with:

```ts
    spec.child.on('exit', (code, signal) => {
      // WHY not onExit here directly: see EXIT_DRAIN_GRACE_MS. `close` arrives after
      // the pipes drain; the timer covers a grandchild that never lets them close.
      let settled = false;
      const settle = () => { if (settled) return; settled = true; this.onExit(run, code, signal); };
      if (!spec.child.stdout && !spec.child.stderr) { settle(); return; } // nothing to drain
      spec.child.once('close', settle);
      const t = setTimeout(settle, EXIT_DRAIN_GRACE_MS);
      t.unref();
    });
```
`onExit` already returns early when `run.status !== 'running'`, so the `error` path and the adopted-already-dead path (both call `onExit` directly) stay correct.

- [ ] **Step 4: Run the whole file**

Run: `npx vitest run tests/shell-registry.test.ts`
Expected: all cases pass, including the two new ones and the existing "still-running marks" cases. Then run the sibling files that drive the registry: `npx vitest run tests/bash-background.test.ts tests/bash-output-kill-shell.test.ts tests/harness-tools-core.test.ts` — expected all pass. If a test in those files asserts `exited` resolves synchronously with `exit` (search them for `'exit'`), it is asserting the bug; update it to await `run.exited` and note WHY.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/harness/shell-registry.ts desktop/tests/shell-registry.test.ts
git commit -q -m "fix(harness): a Bash run settles after its output drains, not on the exit event

Node fires a child's exit before its last stdout chunk is delivered; settling on
it dropped the final line of a command's output (the macOS CI flake 'a
redrawing progress bar…', 2026-09-16 review). Settle on close, or 200 ms after
exit for a grandchild that keeps the pipe open (sleep 100 &), whichever first.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `EngineManager.stopAll()` must cancel pending applies, not race them

**Files:**
- Modify: `youcoded/desktop/src/main/engine/engine-manager.ts` — the field block at lines 350–362 (`applyWaiter`, `pendingModelApplies`, `modelApplyWaiter`), `requestApply` (~line 755), `drainApplies` (~line 770), `drainModelApplies` (~line 950), `stopAll` (~line 1996)
- Test: `youcoded/desktop/tests/engine-model-settings.test.ts` — add one case at the end of the `describe` that contains `twoWedgedReplies` (search for it; the describe starts around line 515), and change `afterEach` at line ~67

**Interfaces:**
- Consumes: `makeManager(fetchImpl, extra)`, `plantInstall()`, `plantConfig()`, `makeFetch()`, `startStreamingReply(mgr, fetchImpl, modelId)`, `readPreset()`, `mockSpawn` — all defined at the top of the test file.
- Produces: `stopAll()` resolves only after every pending config/model apply has been abandoned; nothing in the manager writes or spawns after it resolves.

Why this is a real bug: `requestApply` and `setModelSettings` start waiters (`drainApplies`, `drainModelApplies`) that poll until the engine is idle or a deadline passes, then write `models.ini` (`writeModelPresets` → `writePresetFile` does `mkdirSync` + rename) and may restart the engine (`applySpeed` spawns). `stopAll()` only stops the supervisor. A waiter that is mid-poll keeps going, and after the deadline it re-creates `~/.youcoded/engine/` and can respawn `llama-server` after app quit. In the test it re-creates the temp root while `rmSync` is removing it: `ENOTEMPTY` (Ubuntu and macOS CI, 2026-09-07 and 09-16).

- [ ] **Step 1: Write the failing test**

At the end of the describe that owns `twoWedgedReplies` in `tests/engine-model-settings.test.ts`, add:

```ts
  it('stopAll() abandons a pending apply: nothing is written or spawned after it returns', async () => {
    plantInstall();
    await plantConfig();
    const fetchImpl = makeFetch();
    // A short bound, so the abandoned waiter's deadline passes INSIDE this test
    // and would land its write if stopAll had not cancelled it.
    mgr = makeManager(fetchImpl, { configApplyMaxWaitMs: 150 });
    await startStreamingReply(mgr, fetchImpl, 'alpha');      // alpha is busy: the save waits
    await mgr.setModelSettings('alpha', { contextLength: 4_096 });
    expect(mgr.status().configApplyPending).toBe(true);

    await mgr.stopAll();
    const presetAfterStop = readPreset();
    const spawnsAfterStop = mockSpawn.mock.calls.length;
    expect(mgr.status().configApplyPending).toBe(false);

    // Past the deadline: an un-cancelled waiter would write models.ini and reload here.
    await new Promise((r) => setTimeout(r, 400));
    expect(readPreset()).toBe(presetAfterStop);
    expect(mockSpawn.mock.calls.length).toBe(spawnsAfterStop);
    // And the temp root can be removed with NO retries — the ENOTEMPTY this file
    // carried a retry band-aid for cannot happen once nothing writes after stop.
    expect(() => fs.rmSync(root, { recursive: true })).not.toThrow();
    fs.mkdirSync(root, { recursive: true }); // afterEach removes it again
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/engine-model-settings.test.ts -t 'abandons a pending apply'`
Expected: FAIL — either `configApplyPending` is still `true` after `stopAll()`, or `readPreset()` changed after the 400 ms wait (the abandoned waiter wrote `[alpha]\nctx-size = 4096…`).

- [ ] **Step 3: Implement the cancellation**

In `engine-manager.ts`, in the field block after `private modelApplyWaiter: Promise<void> | null = null;` add:

```ts
  // WHY a one-way flag: stopAll() is app-quit teardown (see its doc comment). A
  // waiter that was polling for a quiet engine kept running past it, and after
  // its deadline re-created ~/.youcoded/engine/ and could respawn llama-server —
  // in tests, into a temp root being removed (ENOTEMPTY, CI 2026-09-07/09-16).
  private stopped = false;
```

In `requestApply`, as the first line of the method body:
```ts
    if (this.stopped) return;
```

In `drainApplies`, change the poll loop and add a bail-out right after it:
```ts
    while (!this.stopped && this.supervisor?.busy() && Date.now() < this.applyDeadline) {
      await new Promise((resolve) => { const t = setTimeout(resolve, pollMs); t.unref?.(); });
    }
    if (this.stopped) { this.needsReload = false; this.needsRestart = false; return; }
```

In `drainModelApplies`, change the loop header to `while (!this.stopped && this.pendingModelApplies.size > 0) {` and, immediately after the loop, add:
```ts
    if (this.stopped) this.pendingModelApplies.clear();
```

In `startModelApplyWaiter` (~line 937), as the first line: `if (this.stopped) return;`.

Replace `stopAll`:
```ts
  /** App-quit teardown — registered next to nativeHost.destroyAll(). Resolves
   *  only after every pending apply has been abandoned, so nothing writes or
   *  spawns after it (see `stopped`). */
  async stopAll(): Promise<void> {
    this.stopped = true;
    // Both waiters check the flag at their next poll tick (configApplyPollMs, 1 s
    // in production) and return; awaiting them here is what makes "nothing after"
    // true rather than likely.
    await Promise.all([this.applyWaiter, this.modelApplyWaiter].filter(Boolean));
    if (this.supervisor) await this.supervisor.stop();
  }
```

- [ ] **Step 4: Run the new test and the whole file, then drop the band-aid**

Run: `npx vitest run tests/engine-model-settings.test.ts`
Expected: all pass. Then edit `afterEach` (line ~67): replace
`fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });`
with
`fs.rmSync(root, { recursive: true, force: true });`
and delete the four-line `// WHY the retries (2026-09-07)…` comment above it, replacing it with:
`// No retries on purpose: stopAll() now abandons every pending apply, so nothing writes here after it (Plan A, Task 3). If ENOTEMPTY ever returns, the cancellation regressed — fix that, do not put the retries back.`
Run the file 5 times under load to prove it: in one terminal `npx vitest run` (full suite, ~70 s) and meanwhile `for i in 1 2 3 4 5; do npx vitest run tests/engine-model-settings.test.ts 2>&1 | grep -E 'Tests  '; done`.
Expected: five lines of `Tests  N passed`, no ENOTEMPTY. Also run `npx vitest run tests/engine-set-config.test.ts tests/engine-manager.test.ts tests/engine-supervisor.test.ts` — expected all pass (they share the manager; a test that calls `stopAll()` and then expects the SAME manager to apply a change afterwards is asserting the old behaviour — there should be none; if one exists, give it a fresh manager).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/engine/engine-manager.ts desktop/tests/engine-model-settings.test.ts
git commit -q -m "fix(engine): stopAll() abandons pending applies instead of racing them

A config or per-model apply waiter kept polling past stopAll(); after its
deadline it re-created ~/.youcoded/engine/ and could respawn llama-server after
app quit. In tests it wrote into a temp root mid-removal (ENOTEMPTY on Ubuntu and
macOS CI). stopAll now sets a one-way flag, awaits both waiters, then stops the
supervisor; the test teardown's retry band-aid is gone.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Find what re-creates the lease file after its delete, and restore the assertion

**Files:**
- Modify: `youcoded/desktop/src/main/conversations/lease-client.ts` — `enqueueFileOp` (line ~179), `writeLeaseFileBody` (~197), `deleteLeaseFile` (~231)
- Test: `youcoded/desktop/tests/lease-client.test.ts` — the case "lapsed renew whose re-acquire is rejected tears down with the new holder attributed" (line ~261)

**Interfaces:**
- Consumes: test helpers `leaseFilePath(tmpRoot, id)`, `okResult`, `lostResult`, `RENEW_MS`, the `hubRequest` and `takeoverSpy` fakes (top of the test file).
- Produces: the test's on-disk assertion `expect(fs.existsSync(leaseFilePath(tmpRoot, 's1'))).toBe(false)` back in place and green under load.

What is known (from `docs/roadmap/dev-workspace.md` → tests, "lease-client.test.ts"): on CI the client reported the lease dropped and `fs.promises.rm` was called with the right path and RESOLVED, yet the file existed afterwards. So either something writes it back after the delete, or the delete did not remove what the test reads. No code path in `lease-client.ts` was found that writes after the lost re-acquire; the answer has to be measured, not guessed.

- [ ] **Step 1: Instrument the file-op queue (debug-only, env-gated)**

In `lease-client.ts`, inside `enqueueFileOp` before `const prev = …`, add:
```ts
    // WHY env-gated logging: the 2026-09-16 CI runs showed the lease file present
    // after its delete resolved, with no writer in sight. This is how the writer
    // gets found. Off unless YOUCODED_LEASE_DEBUG is set; never on for users.
    const debug = process.env.YOUCODED_LEASE_DEBUG ? new Error().stack?.split('\n').slice(2, 5).join(' | ') : null;
```
and wrap `op` so its start/end are logged when `debug` is set:
```ts
    const traced = debug
      ? async () => { console.log(`[lease-debug] start ${sessionId} ${debug}`); try { await op(); } finally { console.log(`[lease-debug] end   ${sessionId} exists=${fs.existsSync(leaseFile(sessionId) ?? '')}`); } }
      : op;
    const next = prev.then(traced, traced).catch(() => { /* best-effort */ });
```
(`leaseFile` is defined below `enqueueFileOp` in the same closure; function hoisting makes it callable.) In `writeLeaseFileBody`, after the `writeFile`, add `if (process.env.YOUCODED_LEASE_DEBUG) console.log(`[lease-debug] wrote ${file}`);`. In `deleteLeaseFile`, log the same way after the `rm` resolves.

- [ ] **Step 2: Reproduce under load and read the order of operations**

Run, from `desktop/`:
```bash
(npx vitest run > /tmp/full-suite-load.txt 2>&1 &)      # background load, ~70 s on this machine
for i in $(seq 1 30); do YOUCODED_LEASE_DEBUG=1 npx vitest run tests/lease-client.test.ts -t 'lapsed renew whose re-acquire is rejected' 2>&1 | tee /tmp/lease-run-$i.txt | grep -E 'Tests  |×'; done
grep -l '×' /tmp/lease-run-*.txt
```
If no run fails on this machine (likely — it never did locally), constrain it: `taskset -c 0,1 …` on the loop above (2 cores, like the runner) and repeat; if still green, push the instrumentation on the branch and dispatch `gh workflow run desktop-ci.yml --ref <branch>` three times, then read the Ubuntu job log for `[lease-debug]` lines around the failing test (`gh run view <id> --log-failed | grep -A3 -B3 'lease-debug'`).
Expected: a sequence like `start s1 <stack> | wrote … | start s1 <stack> | end exists=false | wrote …`. The `<stack>` of the LAST `start` before the file reappears names the writer.

- [ ] **Step 3: Fix what the log names**

Decide from the log, and write a WHY comment naming the run id that proved it:
- If the writer is `writeLeaseFile` called from `renewTick` (line ~326 or ~333, the `void writeLeaseFile(…)` fire-and-forget calls): the tick that wrote is a SECOND tick. Guard it: in `renewTick`, right after `const r = await opts.hubRequest('renew', …)`, the existing `if (!held.has(sessionId)) return;` must also cover the lost path's `held.delete` — check that `stopTimer` clears the right timer (`held.get(sessionId)` is the timer; if `schedule()` was called twice, the first timer is orphaned). Fix = keep one timer per session in a separate `Map<string, NodeJS.Timeout>` and clear it in `stopTimer`, rather than storing the timer as the `held` value.
- If the writer is `acquire()`'s reserved slot (`slot.settle(() => writeLeaseFileBody(…))`): the slot from the test's initial `acquire` settled AFTER the delete because `await slot.done` resolved on the queue promise before `op` ran. Fix = in `reserveFileSlot`, resolve `done` only after `op()` completes (it already does — so this branch means `fileChain` lost the entry: check the `finally` that deletes the map entry; the delete must only run when `fileChain.get(sessionId) === next`, which it does — so look at `enqueueFileOp` being called with a `prev` that is NOT the write's promise because the write's `finally` already removed it… that is correct ordering, not a bug).
- If no `wrote` line follows the delete and the file still exists: the test's `tmpRoot` and the client's `leaseDir()` differ (a `realpath`/symlink or `os.tmpdir()` mismatch on the runner). Fix = in the test, `tmpRoot = fs.realpathSync(fs.mkdtempSync(…))`.
Whichever it is: implement, and keep the env-gated logging (it is silent unless asked for).

- [ ] **Step 4: Restore the on-disk assertion**

In the test, after the `vi.waitFor` that checks `isHeld` and the rm call, replace the `// FILED, not asserted:` comment block with:
```ts
    await Promise.all(rmSpy.mock.results.map((r) => r.value));
    expect(fs.existsSync(leaseFilePath(tmpRoot, 's1'))).toBe(false);
```
Run the Step 2 loop again (30 runs under load, or three CI dispatches). Expected: 30/30 green (or 3/3 CI runs green on Ubuntu). Update the roadmap entry in `docs/roadmap/dev-workspace.md` → tests (the `lease-client.test.ts` entry): delete it, and append to `docs/roadmap/shipped.md` one line naming the cause found.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/conversations/lease-client.ts desktop/tests/lease-client.test.ts
git commit -q -m "fix(lease): <one line naming the writer the log found>

<two or three lines: what re-created the file, the run id that proved it, and
what changed>. The on-disk assertion the 2026-09-16 review removed is back.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Verify, close out, hand over

**Files:**
- Modify (workspace): `docs/roadmap/native-harness.md` (delete the "A Bash tool call can lose the last lines" entry under `## tools`), `docs/roadmap/local-models.md` (delete the `EngineManager.stopAll()` entry), `docs/roadmap/dev-workspace.md` (delete the `lease-client.test.ts` entry if Task 4 finished it), `docs/roadmap/shipped.md` (append three closures)
- Modify (workspace): `docs/active/plans/2026-09-16-ci-test-health-followups.md` — set its `status:` to `superseded` and add one line at the top: `Superseded by the three plans 2026-09-16-ci-followups-{A,B,C}-*.md.`

- [ ] **Step 1: Full local verification**

Run: `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/ci-followups-a/youcoded --full`
Expected: `OK — all checks passed.` with `Tests (full suite)` PASS. A failure in a file this plan did not touch is still yours to read: run it alone; if it passes alone and fails in the full run, it is a load flake — fix it the way the test-hygiene rule says (wait on the signal) in this same branch, one commit per file.

- [ ] **Step 2: Prove all three operating systems**

Run, from the app worktree: `git push -q -u origin session/ci-followups-a && gh workflow run desktop-ci.yml --ref session/ci-followups-a`, wait for `completed` (`gh run list --workflow desktop-ci.yml --branch session/ci-followups-a --limit 1 --json status,conclusion`), and read `gh run view <id> --json jobs --jq '.jobs[]|"\(.name): \(.conclusion)"'`.
Expected: `build (ubuntu-latest): success`, `build (windows-latest): success`, `build (macos-latest): success`. Anything else: `gh run view <id> --log-failed`, fix, push, dispatch again. Do not open the PR on a red dispatch.

- [ ] **Step 3: Roadmap closures (workspace repo)**

Delete the three entries named in **Files** and append to `docs/roadmap/shipped.md`, matching its existing line format, one line each:
- the Bash tool settles after its output drains (Plan A Task 2, PR youcoded#<n>)
- `stopAll()` abandons pending applies (Plan A Task 3, PR youcoded#<n>)
- the lease file re-creation: <cause> (Plan A Task 4, PR youcoded#<n>)
Run `node scripts/roadmap-check.mjs --quiet` — expected: no output (or count-drift lines only, which do not fail). Run `node scripts/audit-anchors.mjs --no-diff` — expected: `MECHANICAL PASS: OK` (anchor lines that name the shared checkout being behind are not yours; a `budget violations` line is).

- [ ] **Step 4: Open the pull requests and stop**

```bash
cd <worktree>/youcoded && gh pr create --title "fix: the Bash tool keeps its last line, the engine stops cleanly, the lease file stays deleted" --body-file - <<'EOF2'
The three product races the 2026-09-16 CI/test health review found behind "flaky" tests (Plan A, Tasks 2–4). Each has a test that failed before the change and a WHY at the site.

- shell-registry: settle on `close` or 200 ms after `exit`, whichever first.
- engine-manager: `stopAll()` abandons pending applies before stopping the supervisor.
- lease-client: <the cause Task 4 found>.

Desktop CI dispatch on this branch: <run url>, green on all three legs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF2
cd /home/destin/youcoded-dev/worktrees/sessions/ci-followups-a && git push -q -u origin session/ci-followups-a && gh pr create --title "ci: master protected; retire ci-red-vs-master; close the three race entries" --body "Companion to youcoded PR #<n>. Plan A, Tasks 1 and 5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Then report to Destin in chat, in plain words: what each of the three fixes changes for a user, the CI run link, and end with exactly: **ready to merge?** Do not merge.
