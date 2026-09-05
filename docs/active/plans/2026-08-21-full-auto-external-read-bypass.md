---
status: superseded
date: 2026-08-21
spec: docs/active/specs/2026-08-18-full-auto-external-directory-permissions-design.md
---

# Full-Auto External Read Bypass + Web-Subject Guard Fix — Implementation Plan

> **SUPERSEDED 2026-09-05 — DO NOT EXECUTE.** The behaviour shipped on branch
> `session/reads-always-allowed`, under a broader decision than this plan was written for:
> reads outside the workspace no longer ask in ANY mode, not just Full Auto (Destin,
> 2026-09-05). That deletes most of this plan rather than completing it — Task 2 (the human
> gate on card copy) is moot because no read card survives, and Task 3's `isWalkAwayRead`
> probe and its host/specialist wiring are unnecessary because there is no mode to consult.
> Task 4 (the WebSearch/WebFetch subject fix) shipped as specified. Kept only as the record of
> how the decision was reached; the amended spec is the live document.
>
> Original state, for the record:
> **EXECUTION STATE (verified 2026-08-26): NOT STARTED. 0 of 37 steps done; no code exists.**
> - `git grep -n isWalkAwayRead origin/master -- desktop/src` → no hits. Same on the feature branch:
>   `git grep -n isWalkAwayRead feat/full-auto-read-bypass -- desktop/src` → no hits.
> - `NON_PATH_SUBJECT_TOOLS` on master is still `new Set(['Bash', 'Skill', 'Task'])`
>   (`harness-session.ts:48`) — WebSearch/WebFetch were never added, so the Task 4 web fix is unbuilt.
> - Worktree `worktrees/full-auto-reads` (branch `feat/full-auto-read-bypass`) EXISTS but is empty
>   work: `git rev-list --left-right --count origin/master...feat/full-auto-read-bypass` → `24  0`
>   (24 behind, **0 ahead**), and `git status --porcelain` in the worktree is empty. It is a
>   provisioned-but-unused worktree, 24 commits stale.
> - **The Task 2 HUMAN GATE was never reached.** The last session on this plan
>   (`a1929f41…`, "Full-Auto Read Bypass Plan") ended 2026-08-23 19:11 having only finished
>   *rewriting* the plan; the next session in this workspace started 7 minutes later on the perf lab.
>   No workbench approval-card session ever ran, so Destin has not seen or signed off on the copy.
> - Next action is Task 2 (blocked on Destin), which may run in parallel with Tasks 3–4 (build work).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Full Auto, stop forcing approval asks when Read/Grep/Glob touch paths outside the session jail; stop WebSearch/WebFetch queries/URLs from ever tripping the path guard. Spec: `docs/active/specs/2026-08-18-full-auto-external-directory-permissions-design.md` (ratified by Destin 2026-08-21).

**Architecture:** One new optional `HarnessSessionOpts` callback (`isWalkAwayRead`) lets `runOneTool`'s external-directory branch fall through to the normal configured decision for three read-only tools when the session's *live* mode is full-auto. Everything else about the guard (secret hard-denies, spill exemptions, invented-path interception, write asks) is untouched and repinned by tests. The web fix **adds** WebSearch/WebFetch to `NON_PATH_SUBJECT_TOOLS` — the "subject is not a filesystem path" set — which removes them from the path-*guarded* population.

**Tech Stack:** TypeScript, Electron main process (`youcoded/desktop/src/main/harness/`), vitest (scripted AI SDK mock models), no new dependencies.

## Global Constraints

- **Never touch Destin's live built app.** All runtime verification through `bash scripts/run-dev.sh <branch-or-worktree> --label "<Feature Name>"` (isolated ports + userData). Rule: `.claude/rules/live-app-safety.md`.
- **Worktree, not main checkout.** Create via superpowers:using-git-worktrees. Copy deps with `cp -al youcoded/desktop/node_modules <worktree>/youcoded/desktop/node_modules` — NEVER symlink (Gradle/npm/verify all follow links and wipe the main checkout; see `docs/PITFALLS.md`). Desktop-only change: do not run Gradle or `build-web-ui.sh` in the worktree.
- **Anchor edits by the quoted snippets, not line numbers.** Line numbers below were re-measured against `master` on 2026-08-23 and are approximate; master moves. If a quoted snippet isn't at the stated line, `rg` for the snippet.
- **Guard-order contract (from spec Decision ¶3, non-negotiable):** secret/credential hard-denies and the `internalReadRoots`/spill exemptions live inside `checkPathGuard` (`src/main/harness/tools/guards.ts:171–221`) and resolve BEFORE `runOneTool` ever sees an `'external'` verdict; then, in `harness-session.ts`: `'deny'` verdict → immediate refusal → invented-path interception → **[NEW] full-auto read bypass** → external ask. The bypass may never fire ahead of the secret denies and never for a write tool.
- **Deny semantics (spec Decision ¶4):** the bypass lifts only the *synthetic forced ask*; the configured decision (`decide()`) still runs afterward, so a remembered/explicit deny or ask still governs. Nothing may convert a deny into an allow, and nothing is upgraded past an ask.
- **Emit surface is FROZEN** (`.claude/rules/native-runtime.md`): no new `TranscriptEventType`s; asks ride the existing broker `PERMISSION_REQUEST` payload.
- **Task 2 is a HUMAN GATE:** Destin signs off on the surviving approval cards' copy/layout in the workbench (spec "UI checkpoint", ratified 2026-08-21). It may run in parallel with Tasks 3–4 but MUST be complete before Task 8 (merge).
- **WHY comment on every non-trivial edit** — Destin is a non-developer and reads these.
- **Every user-facing string**: plain language, no jargon (workspace CLAUDE.md accessibility pillar). Any card copy change follows `docs/error-message-standards.md`.
- Verify with `bash scripts/verify.sh [<worktree>]` before claiming any task done (tsc + related vitest + knip + eslint + ast-grep; covers desktop only — Android untouched by this plan).
- Do not run the paid harness evaluator (`harness-eval.mjs` real-key path) unasked.

---

### Task 1: Confirm the reported bug on today's code (non-blocking, informs Task 2)

Spec's Confirmation table says these checks are **regression-hunting, not option-picking**: the ratified decision ships regardless of the outcome. A failed check is filed as a SEPARATE bug and work continues — it never blocks this plan. Rows 1 and 3 of the spec's matrix are already pinned by unit tests (`permission-engine.test.ts` always-allow rules; the invented-path describe in `harness-session-loop.test.ts`), so only the two checks that need eyes run here.

**Files:**
- Modify: none (observation only). Findings recorded in this task's checkboxes.

**Interfaces:**
- Consumes: unmodified `master` behavior in a dev instance.
- Produces: confirmation that an external READ asks in Full Auto today (spec matrix row 2), plus a screenshot of today's external-WRITE ask card (input to Task 2's copy review).

- [ ] **Step 1: Launch a dev instance from the worktree**

```bash
cd /home/destin/youcoded-dev
bash scripts/run-dev.sh <worktree-name> --label "Full-Auto Reads"
```

Expected: a "YouCoded Dev" Electron window opens on shifted ports alongside the live app.

- [ ] **Step 2: External READ asks in Full Auto (spec row 2 + chip coupling)**

Create a native session whose cwd is a scratch repo. Set the status-bar chip to Full Auto. Ask the model to Read a file that exists OUTSIDE the session cwd (e.g. a file in a sibling repo).

Expected: generic Yes/No approval card appears while the chip reads FULL AUTO — this is the reported bug, and seeing the ask *while the chip shows Full Auto* also confirms the spec's check 4 (chip and backend mode agree) behaviorally. Screenshot it. If NO card appears → the bug doesn't reproduce as specced; file a note, continue (the bypass is still the ratified posture change).

- [ ] **Step 3: External WRITE ask in Full Auto (Task 2 input)**

Ask the model to Write a small file OUTSIDE the session cwd; answer Yes.

Expected: approval card appears (stays correct post-change). Screenshot the card's exact wording for Task 2.

- [ ] **Step 4: Record results**

Tick the sub-steps; paste anomalies into the PR description later. Close the dev instance (`Ctrl+C` the launcher) — Task 8's demo relaunches it on the finished branch.

---

### Task 2: UI checkpoint — Destin steers the surviving cards in the workbench (HUMAN GATE)

The spec's ratified UI checkpoint: **before the backend amendment merges**, mock the surviving Full-Auto cards in the workbench and get Destin's sign-off on wording/layout. The workbench needs no backend, so this runs BEFORE or alongside the code tasks — Destin steers the design before real code is committed to it. Two surfaces survive every option and both get reviewed:

1. **External WRITE ask in Full Auto** (Write/Edit outside the project) — currently the generic Yes/No row; spec calls it a "prime candidate for plainer copy" (e.g. "wants to modify a file outside this project").
2. **Deny-listed safety-stop** — exists today; confirm it reads correctly next to any new copy.

**Files:**
- Possibly modify: `youcoded/desktop/src/renderer/components/ToolCard.tsx` (copy strings only, if Destin requests changes)
- Test (existing, rerun if copy changes): `youcoded/desktop/tests/tool-card-external-ask.test.tsx`, `youcoded/desktop/tests/tool-card-full-auto-stop.test.tsx`

**Interfaces:**
- Consumes: `bash scripts/run-workbench.sh` (real renderer, fake `window.claude`, port 5233). The fake IPC payload already carries `external: true` and `permissionMode` (spec fact 7 / UI-checkpoint section), so both cards render without any backend change.
- Produces: Destin's approved copy/layout for both surviving cards; a commit if copy changed.

- [ ] **Step 1:** Invoke the `ui-mockup` skill to drive the workbench session (it owns the show-Destin-and-iterate loop). Boot with `bash scripts/run-workbench.sh` and bring up both cards: an external-directory Write ask with `permissionMode: 'full-auto'`, and a deny-listed ask in full-auto (the safety-stop footer). Show them beside the Task 1 screenshot of today's live card.
- [ ] **Step 2:** Destin approves the current copy/layout or dictates changes. Both outcomes are valid — the gate is his *decision*, not a presumption either way.
- [ ] **Step 3 (only if changes dictated):** Edit only the card's copy strings in `ToolCard.tsx`. Run: `npx vitest run tests/tool-card-external-ask.test.tsx tests/tool-card-full-auto-stop.test.tsx` — expected PASS (they pin button suppression and footer gating, not prose; if a prose assertion does trip, update it to the approved copy in the same commit). Commit: `chore(ui): Destin-approved copy for surviving full-auto external cards`.
- [ ] **Step 4:** Checkbox: **Destin approved the surviving cards** ☐ — Task 8 (merge) is blocked until this is ticked.

---

### Task 3: Full-auto read bypass (TDD)

**Files:**
- Modify: `youcoded/desktop/src/main/harness/harness-session.ts` (constants near line 48–61; `HarnessSessionOpts` ending ~line 222; external branch ~line 2555)
- Modify: `youcoded/desktop/src/main/harness/native-session-host.ts` (`toolWiring` ~line 2072; `buildSpecialistSession` ~line 2509)
- Modify: `youcoded/desktop/tests/helpers/harness-fakes.ts` (forward the new opt in the `MakeSessionOver` interface / `makeSession`)
- Test: `youcoded/desktop/tests/harness-session-loop.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: existing `checkPathGuard` verdict `'external'` (`tools/guards.ts:171`); existing `fakeTool`/`makeOpts`/`scriptedModel` helpers (note: `scriptedModel` from `helpers/scripted-model` takes pre-built streams; the similarly named `scriptModel` from `harness-fakes` is a different helper — use `scriptedModel`); existing `NativeSessionHost.getPermissionMode(sessionId)` (public, ~line 1767) and private `modeFor` map (~line 279).
- Produces: `HarnessSessionOpts.isWalkAwayRead?: () => boolean` (live probe, called fresh per guard hit); module-level `const FULL_AUTO_READ_TOOLS = new Set(['Read', 'Grep', 'Glob'])` in harness-session.ts. Host wiring: root sessions get `() => this.getPermissionMode(sessionId) === 'full-auto'`; specialist children get the SAME expression keyed on `parentId` (a child's effective mode is its parent's — `buildDecide` already keys the parent's id/cwd).

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness-session-loop.test.ts` (inside the top-level `describe('HarnessSession — multi-step turn driver')`, after the `an invented outside path that is really a workspace file` describe). `fakeTool`'s default schema is `z.object({ file_path: z.string() })` and its default `permissionSubject` returns `undefined` (guards skipped) — so Read uses the default schema, Grep/Glob override it, and every case passes an explicit `permissionSubject`:

```ts
  // Spec 2026-08-18 (ratified 2026-08-21): in Full Auto the terminal can already
  // read any file silently (Bash is exempt from the path guard), so forcing the
  // polite read tools to ask is friction with zero safety gained. The bypass
  // lifts ONLY the synthetic forced ask — decide() still runs, so a remembered
  // deny/ask still governs. Secrets hard-deny inside checkPathGuard, above this
  // point; writes never covered (FULL_AUTO_READ_TOOLS).
  describe('full-auto external read bypass (spec 2026-08-18)', () => {
    // Outside the default makeOpts cwd ('C:/x'), and named so no workspace twin
    // exists — otherwise the invented-path interception answers first (pinned
    // separately above) and the bypass never gets exercised.
    const OUTSIDE = 'C:/other/walkaway-solo.md';

    const readCases = [
      { name: 'Read', input: { file_path: OUTSIDE }, subject: (a: any) => a.file_path },
      { name: 'Grep', input: { path: OUTSIDE }, subject: (a: any) => a.path },
      { name: 'Glob', input: { path: OUTSIDE }, subject: (a: any) => a.path },
    ] as const;

    for (const c of readCases) {
      it(`${c.name}: external path executes with NO ask under a live full-auto probe`, async () => {
        const tool = fakeTool(c.name, {
          ...(c.name === 'Read' ? {} : { schema: z.object({ path: z.string() }) }),
          permissionSubject: c.subject,
        });
        const decide = vi.fn(async (): Promise<PermissionDecision> => ALLOW);
        const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
        const model = scriptedModel([
          stream(toolCallChunk('c1', c.name, c.input), finishChunk('tool-calls')),
          stream(...textChunks('b', 'ok'), finishChunk('stop')),
        ]);
        const session = new HarnessSession(
          makeOpts({ tools: [tool], decide, askUser, isWalkAwayRead: () => true }),
          async () => model as any,
        );
        collect(session);
        await session.send('go');
        expect(askUser).not.toHaveBeenCalled();     // the whole point
        expect(decide).toHaveBeenCalledTimes(1);    // configured decision STILL consulted (deny semantics)
        expect((tool as any).calls).toHaveLength(1);
      });

      it(`${c.name}: without the probe the external ask fires and carries external:true (pre-existing behavior, unchanged)`, async () => {
        const tool = fakeTool(c.name, {
          ...(c.name === 'Read' ? {} : { schema: z.object({ path: z.string() }) }),
          permissionSubject: c.subject,
        });
        const decide = vi.fn(async (): Promise<PermissionDecision> => ALLOW);
        const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
        const model = scriptedModel([
          stream(toolCallChunk('c1', c.name, c.input), finishChunk('tool-calls')),
          stream(...textChunks('b', 'ok'), finishChunk('stop')),
        ]);
        const session = new HarnessSession(makeOpts({ tools: [tool], decide, askUser }), async () => model as any);
        collect(session);
        await session.send('go');
        expect(askUser).toHaveBeenCalledTimes(1);
        expect(askUser.mock.calls[0][0].external).toBe(true);
        expect(decide).not.toHaveBeenCalled();      // short-circuit preserved in other modes
      });
    }

    it('Write is NEVER bypassed, even under a live full-auto probe', async () => {
      const write = fakeTool('Write', { permissionSubject: (a: any) => a.file_path });
      const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
      const model = scriptedModel([
        stream(toolCallChunk('c1', 'Write', { file_path: OUTSIDE }), finishChunk('tool-calls')),
        stream(...textChunks('b', 'ok'), finishChunk('stop')),
      ]);
      const session = new HarnessSession(
        makeOpts({ tools: [write], decide: async () => ALLOW, askUser, isWalkAwayRead: () => true }),
        async () => model as any,
      );
      collect(session);
      await session.send('go');
      expect(askUser).toHaveBeenCalledTimes(1);               // still asks
      expect(askUser.mock.calls[0][0].external).toBe(true);
      expect((write as any).calls).toHaveLength(1);           // allowed → executed
    });

    it('a credential path still hard-denies ahead of the bypass', async () => {
      const read = fakeTool('Read', { permissionSubject: (a: any) => a.file_path });
      const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
      const model = scriptedModel([
        stream(toolCallChunk('c1', 'Read', { file_path: '~/.ssh/id_rsa' }), finishChunk('tool-calls')),
        stream(...textChunks('b', 'x'), finishChunk('stop')),
      ]);
      const session = new HarnessSession(
        makeOpts({ tools: [read], decide: async () => ALLOW, askUser, isWalkAwayRead: () => true }),
        async () => model as any,
      );
      const events = collect(session);
      await session.send('go');
      expect(askUser).not.toHaveBeenCalled();                 // denied, not asked
      expect((read as any).calls).toHaveLength(0);            // and never executed
      const res = events.find((e) => e.type === 'tool-result')!;
      expect(res.data.isError).toBe(true);                    // guard denial, not silent success
    });

    it('a configured DENY on an external path still refuses under full-auto (deny never becomes allow)', async () => {
      const read = fakeTool('Read', { permissionSubject: (a: any) => a.file_path });
      const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
      const model = scriptedModel([
        stream(toolCallChunk('c1', 'Read', { file_path: OUTSIDE }), finishChunk('tool-calls')),
        stream(...textChunks('b', 'ok'), finishChunk('stop')),
      ]);
      const session = new HarnessSession(
        makeOpts({
          tools: [read], askUser, isWalkAwayRead: () => true,
          decide: async (): Promise<PermissionDecision> => ({ action: 'deny', denyListed: false }),
        }),
        async () => model as any,
      );
      const events = collect(session);
      await session.send('go');
      expect(askUser).not.toHaveBeenCalled();
      expect((read as any).calls).toHaveLength(0);
      const res = events.find((e) => e.type === 'tool-result')!;
      expect(res.data.isError).toBe(true);
      // The decide()-deny copy (harness-session.ts renders `blocked by a
      // permission rule` when the decision carries no message). NOT "user
      // declined" — that string belongs to a human answering No on an ask card.
      expect(res.data.toolResult).toMatch(/blocked by a permission rule/i);
    });

    it('a configured ASK on an external path still asks under full-auto (nothing upgraded past an ask)', async () => {
      const read = fakeTool('Read', { permissionSubject: (a: any) => a.file_path });
      const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
      const model = scriptedModel([
        stream(toolCallChunk('c1', 'Read', { file_path: OUTSIDE }), finishChunk('tool-calls')),
        stream(...textChunks('b', 'ok'), finishChunk('stop')),
      ]);
      const session = new HarnessSession(
        makeOpts({
          tools: [read], askUser, isWalkAwayRead: () => true,
          decide: async (): Promise<PermissionDecision> => ({ action: 'ask', denyListed: false }),
        }),
        async () => model as any,
      );
      collect(session);
      await session.send('go');
      expect(askUser).toHaveBeenCalledTimes(1);               // an ask rule still asks
      // This ask came from decide(), NOT the forced external branch, so the
      // payload's `external` is false — the normal configured-ask card renders.
      expect(askUser.mock.calls[0][0].external).toBe(false);
      expect((read as any).calls).toHaveLength(1);            // allowed → executed
    });

    it('the probe is consulted LIVE — a mid-session flip from ask-mode to full-auto stops the asks', async () => {
      const read = fakeTool('Read', { permissionSubject: (a: any) => a.file_path });
      const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
      let fullAuto = false;
      const model = scriptedModel([
        stream(toolCallChunk('t1', 'Read', { file_path: OUTSIDE }), finishChunk('tool-calls')),
        stream(finishChunk('stop')),                          // end turn 1
        stream(toolCallChunk('t2', 'Read', { file_path: OUTSIDE }), finishChunk('tool-calls')),
        stream(...textChunks('z', 'done'), finishChunk('stop')),
      ]);
      const session = new HarnessSession(
        makeOpts({ tools: [read], decide: async () => ALLOW, askUser, isWalkAwayRead: () => fullAuto }),
        async () => model as any,
      );
      collect(session);
      await session.send('first');
      expect(askUser).toHaveBeenCalledTimes(1);               // ask-mode: asked
      fullAuto = true;                                        // user flips the chip between turns
      await session.send('second');
      expect(askUser).toHaveBeenCalledTimes(1);               // full-auto: silent
      expect((read as any).calls).toHaveLength(2);
    });
  });
```

- [ ] **Step 2: Forward the new opt in the shared helper**

In `tests/helpers/harness-fakes.ts`, add to the `MakeSessionOver` interface (after `decide?:`, ~line 182):

```ts
  // Spec 2026-08-18: live walk-away probe consumed by the external-path guard.
  isWalkAwayRead?: () => boolean;
```

and in `makeSession`'s `opts` literal (after the `decide:` line, ~line 235):

```ts
    ...(over.isWalkAwayRead ? { isWalkAwayRead: over.isWalkAwayRead } : {}),
```

(`makeOpts` takes `Partial<HarnessSessionOpts>` and already spreads `...over`, so it needs nothing.)

- [ ] **Step 3: Run the new tests, verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/harness-session-loop.test.ts -t "full-auto external read bypass"`
Expected: FAIL — TS error on unknown opt `isWalkAwayRead` (and/or the bypass tests failing because the ask still fires). The two "without the probe" controls may already pass; that is fine — they pin existing behavior.

- [ ] **Step 4: Implement the opt + bypass**

In `src/main/harness/harness-session.ts`:

(a) Next to `REQUIRES_EXISTING_TARGET` (~line 61) add:

```ts
// Spec 2026-08-18 (ratified 2026-08-21): in full-auto, external READS stop
// forcing the ask — the terminal can already read anything silently in this
// mode (Bash ∈ NON_PATH_SUBJECT_TOOLS), so the ask is friction with no safety.
// Deliberately NOT Edit/Write: a model writing outside the project is a real
// consent question in every mode. The bypass clears only the SYNTHETIC ask;
// decide() still runs afterward, so remembered deny/ask rules keep working.
const FULL_AUTO_READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);
```

(b) In `HarnessSessionOpts`, after its last member `internalReadRoots?: string[];` (~line 222, immediately before the interface's closing brace) add:

```ts
  /** Live walk-away probe (spec 2026-08-18), consulted FRESH on every external
   *  path-guard hit — never snapshotted, so a mid-session chip flip applies to
   *  the very next call. True when the session's CURRENT permission mode is
   *  full-auto. Root sessions are wired with their own id; specialist CHILDREN
   *  with the PARENT's — a child's effective mode is its parent's, exactly like
   *  buildDecide keying the parent's id/cwd. Absent → never bypass (CC-path
   *  sessions, unit tests). */
  isWalkAwayRead?: () => boolean;
```

(c) Replace the single line `externalAsk = true;   // external_directory → force an ask` (~line 2555) with:

```ts
        // Order matters: checkPathGuard's secret hard-denies already returned
        // above ('deny' verdict → refusal), and the invented-path interception
        // directly above already answered — so neither can be routed around.
        if (FULL_AUTO_READ_TOOLS.has(call.toolName) && this.opts.isWalkAwayRead?.()) {
          externalAsk = false;   // full-auto walk-away read → fall through to decide()
        } else {
          externalAsk = true;    // external_directory → force an ask
        }
```

- [ ] **Step 5: Wire the host**

In `src/main/harness/native-session-host.ts`:

(a) `toolWiring()` (~line 2072) — inside the returned object, next to the conditional `internalReadRoots` spread (~line 2095):

```ts
      // Spec 2026-08-18: full-auto external READS bypass the forced ask. Read
      // LIVE per call so a mid-session chip flip takes effect immediately.
      isWalkAwayRead: () => this.getPermissionMode(sessionId) === 'full-auto',
```

(b) `buildSpecialistSession()` (~line 2509; its opts literal builds `decide:` around line 2557 keyed on `parentId`) — beside `decide:`:

```ts
        // Spec 2026-08-18, child half: a child's effective mode is the PARENT'S
        // (same keying as buildDecide directly above) — a specialist spawned by
        // a full-auto parent walks away too.
        isWalkAwayRead: () => this.getPermissionMode(parentId) === 'full-auto',
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `npx vitest run tests/harness-session-loop.test.ts tests/native-session-host.test.ts`
Expected: PASS (new describe green; host suite untouched-green).

- [ ] **Step 7: Child-wiring pin**

Add to `tests/native-session-host.test.ts`, inside the `describe('specialist children (Task 5)')` block (~line 1389). Notes for the implementer: `withParent()` (~line 1401) returns `{ store, h }` — destructure only `h` to avoid an unused-variable lint; `setPermissionMode` exists on the host (`native-session-host.ts` ~line 1926) but no test inside this describe has called it before — that's fine, it takes any session id; the `(h as any).live.get(id).session` internals cast is the suite's existing pattern (see its `childSession` helper ~line 1421); `EXPLORER` (~line 1390) and the suite-scoped `root` tmpdir already exist.

```ts
    // Spec 2026-08-18: a child spawned by a full-auto parent inherits the
    // walk-away READ posture (its effective mode is the parent's), while the
    // parent sitting in ask-mode leaves the child's external reads asking.
    it("wires the child's walk-away probe to the PARENT's live mode", async () => {
      const { h } = await withParent();
      await h.setPermissionMode('root-1', 'full-auto');
      const { childId } = await h.createChild('root-1', {
        specialist: EXPLORER, prompt: 'p', workDir: root, parentToolCallId: 'tc-1',
      });
      const probe = ((h as any).live.get(childId).session.opts as any).isWalkAwayRead;
      expect(probe()).toBe(true);
      await h.setPermissionMode('root-1', 'ask');
      expect(probe()).toBe(false);              // LIVE — follows the flip
      await h.destroyAll();
    });
```

(The constructor is `constructor(private opts: HarnessSessionOpts, …)`, so the property is present on every instance.) Run the host suite; expected PASS.

- [ ] **Step 8: Commit**

```bash
git add youcoded/desktop/src/main/harness/harness-session.ts \
        youcoded/desktop/src/main/harness/native-session-host.ts \
        youcoded/desktop/tests/helpers/harness-fakes.ts \
        youcoded/desktop/tests/harness-session-loop.test.ts \
        youcoded/desktop/tests/native-session-host.test.ts
git commit -m "feat(harness): full-auto walk-away bypass for external READ guards (spec 2026-08-18)"
```

---

### Task 4: WebSearch/WebFetch leave the path-guarded population (TDD)

The spec's Decision ¶2 required checking remembered-rule implications before choosing the mechanism. **Checked 2026-08-23, on `master`:** (a) `NON_PATH_SUBJECT_TOOLS` has exactly two consumer sites — guard eligibility (`harness-session.ts` ~line 2531) and the trigger-injection skip inside `injectPathTriggers` (~line 772) — so set membership cannot affect remembered-rule matching, which never consults this set; (b) WebFetch/WebSearch are baseline-allowed in EVERY mode (`src/shared/permission-types.ts` ~lines 131–140: "the web pair (WebFetch/WebSearch) never prompt at the baseline"), so subject-keyed grants for them are moot. Extending the set is therefore safe and is the chosen mechanism.

**Files:**
- Modify: `youcoded/desktop/src/main/harness/harness-session.ts` (line 48 set + its comment; `injectPathTriggers` comment ~line 766–772; guard comment ~line 2526)
- Test: `youcoded/desktop/tests/harness-session-loop.test.ts` (new `describe`)

**Interfaces:**
- Consumes: `NON_PATH_SUBJECT_TOOLS` (current members exactly `['Bash', 'Skill', 'Task']`).
- Produces: membership change only — no signature changes. Side effect (intended): web tools also skip path-trigger injection, correct for the same reason — their subjects aren't paths.

- [ ] **Step 1: Write the failing tests**

Append (after Task 3's describe):

```ts
  // Spec 2026-08-18 (folded in 2026-08-21): WebSearch/WebFetch subjects are a
  // QUERY STRING and a URL, not filesystem paths — yet canonicalize() resolved
  // e.g. "../etc/passwd" against the cwd into a REAL outside directory and
  // forced an external_directory ask on an ordinary web search. Their subjects
  // are exactly the "not a path" category the NON_PATH_SUBJECT_TOOLS set exists
  // for. (eval/assertions.ts documents the same category error for grading.)
  describe('web tools have non-path subjects (never an external_directory ask)', () => {
    function webTool(name: string, argKey: string) {
      return fakeTool(name, {
        schema: z.object({ [argKey]: z.string() }),
        permissionSubject: (a: any) => a[argKey],
      });
    }
    const ESCAPEY = '../../../../etc/passwd';
    for (const [name, key] of [['WebSearch', 'query'], ['WebFetch', 'url']] as const) {
      it(`${name}: a ${key} that LOOKS like an escaping path never forces an ask`, async () => {
        const tool = webTool(name, key);
        const decide = vi.fn(async (): Promise<PermissionDecision> => ALLOW);
        const askUser = vi.fn(async (_r: AskRequest): Promise<AskDecision> => ({ behavior: 'allow' }));
        const model = scriptedModel([
          stream(toolCallChunk('c1', name, { [key]: ESCAPEY }), finishChunk('tool-calls')),
          stream(...textChunks('b', 'ok'), finishChunk('stop')),
        ]);
        const session = new HarnessSession(makeOpts({ tools: [tool], decide, askUser }), async () => model as any);
        collect(session);
        await session.send('go');
        expect(askUser).not.toHaveBeenCalled();       // THE fix
        expect(decide).toHaveBeenCalledTimes(1);      // normal configured decision ran
        expect((tool as any).calls).toHaveLength(1);
      });
    }
  });
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/harness-session-loop.test.ts -t "non-path subjects"`
Expected: both FAIL (askUser was called — the guard treated the query/URL as a path).

- [ ] **Step 3: Implement — extend the set, update all three comments**

(a) Replace line 48 and its preceding comment block (currently the "Fix 4 (review round 1)" block explaining Bash/Skill/Task):

```ts
// Tools whose permission SUBJECT is not a filesystem path — the path guard and
// path-trigger injection must never treat it as one (a glob matched against a
// command string, skill id, delegated charter key, SEARCH QUERY, or URL is a
// category error, not a near-miss). WebSearch/WebFetch joined 2026-08-21 (spec
// 2026-08-18): their subjects are a query string / URL, and canonicalize() was
// resolving query text like "../etc/passwd" into a real outside directory,
// forcing an absurd external_directory ask on ordinary web searches.
const NON_PATH_SUBJECT_TOOLS = new Set(['Bash', 'Skill', 'Task', 'WebSearch', 'WebFetch']);
```

Preserve the existing block's Task-subject explanation (`${charter}:${work_dir}` consent key from `tools/task.ts`) by folding it into the rewritten comment rather than deleting the information.

(b) At the guard site (~line 2526 comment) and `injectPathTriggers` (~line 766–772), extend the existing comments' enumerations to include "search query / URL" alongside "command string / skill id" (one-line comment edits; no logic change — both sites already iterate the set).

- [ ] **Step 4: Run, verify pass + no regressions**

Run: `npx vitest run tests/harness-session-loop.test.ts tests/harness-tool-guards.test.ts tests/web-search-tool.test.ts tests/web-fetch-tool.test.ts tests/task-tool.test.ts`
Expected: ALL PASS (guards suite proves the pure guard is untouched; task-tool proves Task's set-membership behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/main/harness/harness-session.ts youcoded/desktop/tests/harness-session-loop.test.ts
git commit -m "fix(harness): web search/fetch subjects are not paths — never trip the external guard"
```

---

### Task 5: Full verification gate

**Files:** none modified (unless a finding requires a fix-up commit).

- [ ] **Step 1:** Explicitly re-run the spec's named regression suites (verify.sh's *related* pass may skip some):

```bash
cd youcoded/desktop && npx vitest run tests/permission-engine.test.ts \
  tests/harness-tool-guards.test.ts \
  tests/specialist-child-permissions.test.ts \
  tests/specialist-child-ask-router.test.ts \
  tests/tool-card-external-ask.test.tsx \
  tests/task-tool.test.ts
```

Expected: ALL PASS — rule layer untouched, pure guard untouched, envelope logic untouched, card suppression untouched.

- [ ] **Step 2:** `bash scripts/verify.sh <worktree>` from the workspace root. Expected: exit 0 (tsc, related vitest, knip, eslint, ast-grep invariant scan).
- [ ] **Step 3:** If knip flags the new opt/helper as unused in any surface (it shouldn't — both call sites wire it), resolve per knip's output before proceeding.
- [ ] **Step 4:** Commit any fix-ups with a `chore:` prefix explaining what the gate caught.

---

### Task 6: Ratify the parent-spec amendment (workspace repo — separate commit, NOT the code branch)

The parent spec lives in the **workspace repo** (`youcoded-dev`), while the code branch lives in **youcoded** — two different repositories, so this is its own commit pushed to `youcoded-dev`, landed in the same session as the code merge.

**Files:**
- Modify: `docs/archive/specs/2026-07-15-phase2-native-harness-design.md` (§2.3 jail sentence, ~line 62; §2.4 "BELOW all configuration" sentence, ~line 81)

- [ ] **Step 1: Amend §2.3.** After the sentence ending:

> …and the **workspace jail** (`external_directory` synthetic permission: any path outside session cwd → ask, regardless of mode).

append:

> **Amended 2026-08-21** (spec `2026-08-18-full-auto-external-directory-permissions-design.md`): in **full-auto**, an `external` verdict on a read-only path tool (`Read`/`Grep`/`Glob`) falls through to the configured decision instead of forcing the ask — a remembered deny/ask still governs, secrets hard-deny first as ever, write tools and every other mode keep the unconditional ask. WebSearch/WebFetch left the guarded population entirely (their subjects are not paths).

- [ ] **Step 2: Amend §2.4.** After the sentence containing "sit BELOW all configuration — no preset, mode, or remembered rule overrides them", append:

> Sole ratified exception (2026-08-21): the full-auto walk-away READ bypass above — an explicit amendment, tested in `harness-session-loop.test.ts`, not an override path.

- [ ] **Step 3: Commit (in `youcoded-dev`, on its master)**

```bash
cd /home/destin/youcoded-dev
git add docs/archive/specs/2026-07-15-phase2-native-harness-design.md
git commit -m "docs(spec): ratify full-auto read bypass amendment into §2.3/§2.4"
```

(Push together with Task 8's workspace bookkeeping commit.)

---

### Task 7: Before/after demo for Destin (dev instance, feature branch)

- [ ] **Step 1:** Relaunch on the finished branch: `bash scripts/run-dev.sh <worktree> --label "Full-Auto Reads"`.
- [ ] **Step 2:** Demonstrate in the DEV window: (a) a Full-Auto session reads across repos with ZERO asks (the Task 1 Step 2 repro, now silent); (b) an external WRITE still asks, showing the Task 2-approved card.
- [ ] **Step 3:** Destin confirms the behavior matches what he approved. Any surprise here → fix before merge, not after.

---

### Task 8: Merge, ship, archive

Blocked until Task 2's **Destin approved** box is ticked.

- [ ] **Step 1:** Final `bash scripts/verify.sh <worktree>` → exit 0.
- [ ] **Step 2:** Merge the branch to `master` in `youcoded/` AND PUSH ("merge means merge AND push"). CI builds/releases handle the rest.
- [ ] **Step 3:** Shut down the dev instance (orphaned Vite servers hold port 5223).
- [ ] **Step 4:** Workspace bookkeeping, same session, in `youcoded-dev`: `git mv docs/active/specs/2026-08-18-full-auto-external-directory-permissions-design.md docs/archive/specs/` AND `git mv docs/active/plans/2026-08-21-full-auto-external-read-bypass.md docs/archive/plans/` (this plan archives with its spec); add/update the ROADMAP entry as `[x]` (dated one-liner, dedupe first); commit + push `youcoded-dev` (includes Task 6's spec-amendment commit).
- [ ] **Step 5:** Worktree cleanup (only after `git branch --contains <sha>` lists master): `git worktree remove <path>`; delete the branch remotely and locally.
- [ ] **Step 6: Post-ship verification (spec requirement).** Permission asks are NEVER persisted to the native session transcripts (`~/.youcoded/sessions/<slug>/<sessionId>.jsonl`) — verified 2026-08-23: `TranscriptEventType` (`src/shared/types.ts:98`) has no permission member; asks ride the live broker channel only. So the check is observational: after Destin has used a real Full-Auto session across external paths, he confirms (a) zero approval cards appeared for Read/Grep/Glob, and (b) any card that DID appear was a write or safety-stop card. Record his confirmation in the archived spec's tail — converts "we think it's fixed" into an observed claim. Any resurgence of read asks feeds the parked Option B decision.
