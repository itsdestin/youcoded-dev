# Full Auto Prompt Coherence (M5 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a native session in Full auto mode hits a destructive-command stop, the tool card renders a mode-aware "safety stop" footer (Run it / Skip it | Always Allow) instead of the generic permission row.

**Architecture:** The session's permission mode rides the existing broker ask payload (like `denyListed`/`external`) through hook-dispatcher → reducer → ToolCard. `PermissionButtons` branches on `permissionMode === 'full-auto' && denyListed` to render the settled card from the compare view (surface `full-auto-ask`, rounds 1–4). A new renderer copy module classifies the command into a deny-list family using the same shared list + matcher the engine used. Zero engine/behavior changes.

**Tech Stack:** TypeScript, React, vitest + @testing-library/react. Repo: `youcoded`, worktree `worktrees/full-auto-prompt` (branch `feat/full-auto-prompt-coherence`, already created; compare rounds committed).

**Spec:** `docs/active/specs/2026-08-12-full-auto-prompt-coherence.md` (workspace repo — read it first).

## Global Constraints

- **Presentation only.** Which asks fire, and what the engine decides, must not change. The Permissions screen promise ("will still ask before…") stays true with no copy edits there.
- New footer condition, exactly: `permissionMode === 'full-auto' && denyListed`. Ask/Auto-edit modes, external asks, budget gates, AskUserQuestion: pixel-identical to today.
- Settled subline: `YouCoded limits this action, even in Full Auto — it changes your published code.` (consequence clause varies per family; em dash, lowercase clause).
- New consequence-confirm body, **globally** (all modes, one component): `It may delete files or change published code, and you won't be asked again during future sessions in this project.`
- Button marks: Run it green (`bg-green-600/60` family), Skip it red, Always Allow orange (`bg-orange-600/60` family), `|` divider `text-fg-faint`. Status colors stay hardcoded (desktop/CLAUDE.md rule); band colors come from StatusBar's `PERMISSION_DISPLAY['full-auto']`, exported — not duplicated.
- Every non-trivial edit gets a WHY comment (workspace rule).
- Verification: `bash scripts/verify.sh full-auto-prompt` from `/home/destin/youcoded-dev`. It is Linux-only; the PR's three-platform matrix is the real gate, and master is already red on Windows (`persistent_env`, inherited) — attribute before assuming.
- All commits on `feat/full-auto-prompt-coherence`, message trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Move `subject-glob` to `shared/`

The renderer must classify commands with the *same* matcher the engine used, and renderer code cannot import from `src/main/`. The module is dependency-free — move it.

**Files:**
- Move: `desktop/src/main/harness/tools/subject-glob.ts` → `desktop/src/shared/subject-glob.ts`
- Modify: `desktop/src/main/harness/permission-engine.ts:12`, `desktop/src/main/harness/mcp/mcp-tools.ts`, `desktop/tests/subject-glob.test.ts`, `desktop/tests/path-triggers.test.ts` (imports only)

**Interfaces:**
- Produces: `subjectMatches(subject: string, pattern?: string): boolean` importable from `../../shared/subject-glob` (main) / `../../shared/subject-glob` (renderer components/permissions → `../../../shared/subject-glob`).

- [ ] **Step 1: Move the file**

```bash
cd /home/destin/youcoded-dev/worktrees/full-auto-prompt/desktop
git mv src/main/harness/tools/subject-glob.ts src/shared/subject-glob.ts
```

- [ ] **Step 2: Fix the four imports**

In `src/main/harness/permission-engine.ts`: `from './tools/subject-glob'` → `from '../../shared/subject-glob'`.
In `src/main/harness/mcp/mcp-tools.ts`: find the `subject-glob` import (`rg -n "subject-glob" src/main/harness/mcp/mcp-tools.ts`) and repoint to `'../../../shared/subject-glob'`.
In both test files: repoint to `'../src/shared/subject-glob'`.
Add a WHY line atop the moved file's header comment: `// Lives in shared/ because the renderer's deny-list copy module (deny-list-copy.ts) must classify with the SAME matcher the engine decided with.`

- [ ] **Step 3: Verify nothing else imported the old path, then type-check + affected tests**

```bash
rg -n "tools/subject-glob" src tests   # expect: no matches
npx tsc --noEmit
npx vitest run tests/subject-glob.test.ts tests/path-triggers.test.ts tests/permission-engine.test.ts
```
Expected: no matches, tsc exit 0, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(shared): move subject-glob to shared/ so the renderer can reuse the engine's matcher

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Deny-list family classifier + copy module (TDD)

**Files:**
- Create: `desktop/src/renderer/components/permissions/deny-list-copy.ts`
- Test: `desktop/tests/deny-list-copy.test.ts`

**Interfaces:**
- Consumes: `DESTRUCTIVE_DENY_LIST` from `src/shared/permission-types`, `subjectMatches` from `src/shared/subject-glob` (Task 1).
- Produces: `fullAutoStopCopy(command: string | undefined): { header: string; subline: string }` — Task 5 renders exactly these two strings.

- [ ] **Step 1: Write the failing tests**

```ts
// desktop/tests/deny-list-copy.test.ts
import { describe, it, expect } from 'vitest';
import { fullAutoStopCopy } from '../src/renderer/components/permissions/deny-list-copy';

describe('fullAutoStopCopy', () => {
  it('classifies each family, compounds included', () => {
    expect(fullAutoStopCopy('rm -rf build').header).toBe('Stopped before deleting files');
    expect(fullAutoStopCopy('cd repo && rm -rf build').header).toBe('Stopped before deleting files');
    expect(fullAutoStopCopy('rmdir old').header).toBe('Stopped before deleting files');
    expect(fullAutoStopCopy('del out.txt').header).toBe('Stopped before deleting files');
    expect(fullAutoStopCopy('git push origin master').header).toBe('Stopped before pushing code');
    expect(fullAutoStopCopy('git reset --hard HEAD~1').header).toBe('Stopped before undoing commits');
    expect(fullAutoStopCopy('sudo systemctl restart nginx').header).toBe('Stopped before an admin command');
    expect(fullAutoStopCopy('format D:').header).toBe('Stopped before formatting a drive');
  });

  it('builds the settled subline with the family clause', () => {
    expect(fullAutoStopCopy('git push origin master').subline).toBe(
      'YouCoded limits this action, even in Full Auto — it changes your published code.',
    );
    expect(fullAutoStopCopy('rm -rf build').subline).toBe(
      'YouCoded limits this action, even in Full Auto — it permanently removes files.',
    );
  });

  it('falls back when the command is deny-listed-adjacent but unclassified, or absent', () => {
    // A missing command (never expected, but the type allows it) must not crash the card.
    expect(fullAutoStopCopy(undefined)).toEqual({
      header: 'Stopped before a risky command',
      subline: 'YouCoded limits this action, even in Full Auto.',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/deny-list-copy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// desktop/src/renderer/components/permissions/deny-list-copy.ts
//
// Copy for the Full-auto safety-stop footer (spec 2026-08-12, M5 2b).
// Classifies a deny-listed Bash command into the family that stopped it by
// re-matching against the SAME shared list + matcher the engine decided with
// (DESTRUCTIVE_DENY_LIST + subjectMatches) — so the card can never name a
// different reason than the engine had. First match in list order wins,
// mirroring nothing: the engine's last-match-wins is across LAYERS; within
// the deny-list layer every entry has the same action, so order is free and
// we use the list's grouping.
import { DESTRUCTIVE_DENY_LIST } from '../../../shared/permission-types';
import { subjectMatches } from '../../../shared/subject-glob';

type DenyFamily = 'deleting' | 'pushing' | 'undoing' | 'admin' | 'formatting';

// Keyed on the deny-list pattern's base command. If a new family joins
// DESTRUCTIVE_DENY_LIST without a row here, the footer uses the fallback —
// honest, just less specific (guarded by the fallback test).
const FAMILY_TESTS: Array<{ family: DenyFamily; match: (pattern: string) => boolean }> = [
  { family: 'deleting', match: (p) => /(^|\* )(rm|rmdir|del) \*/.test(p) },
  { family: 'pushing', match: (p) => p.includes('git push') },
  { family: 'undoing', match: (p) => p.includes('git reset --hard') },
  { family: 'admin', match: (p) => p.includes('sudo ') },
  { family: 'formatting', match: (p) => p.includes('format ') },
];

const HEADERS: Record<DenyFamily, string> = {
  deleting: 'Stopped before deleting files',
  pushing: 'Stopped before pushing code',
  undoing: 'Stopped before undoing commits',
  admin: 'Stopped before an admin command',
  formatting: 'Stopped before formatting a drive',
};

const CLAUSES: Record<DenyFamily, string> = {
  deleting: 'it permanently removes files.',
  pushing: 'it changes your published code.',
  undoing: 'it permanently discards saved work.',
  admin: 'it runs with full control of this computer.',
  formatting: 'it erases everything on it.',
};

const SUBLINE_BASE = 'YouCoded limits this action, even in Full Auto';

export function fullAutoStopCopy(command: string | undefined): { header: string; subline: string } {
  if (command) {
    for (const rule of DESTRUCTIVE_DENY_LIST) {
      if (!subjectMatches(command, rule.pattern)) continue;
      const fam = FAMILY_TESTS.find((f) => f.match(rule.pattern ?? ''))?.family;
      if (fam) return { header: HEADERS[fam], subline: `${SUBLINE_BASE} — ${CLAUSES[fam]}` };
    }
  }
  // Deny-listed per the engine but unclassifiable here (or command missing):
  // generic header, no invented consequence.
  return { header: 'Stopped before a risky command', subline: `${SUBLINE_BASE}.` };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/deny-list-copy.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/permissions/deny-list-copy.ts tests/deny-list-copy.test.ts
git commit -m "feat(permissions): family classifier + copy for the full-auto safety stop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `permissionMode` rides the ask (main process, TDD)

**Files:**
- Modify: `desktop/src/main/harness/permission-broker.ts` (AskRequest + payload)
- Modify: `desktop/src/main/harness/native-session-host.ts:743` (askUser wiring)
- Test: `desktop/tests/native-permission-broker.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Produces: `PermissionRequest` hook-event payload gains `permissionMode?: 'ask' | 'auto-edit' | 'full-auto'`. Task 4 reads `payload.permissionMode`.

- [ ] **Step 1: Failing test — broker passes the field through**

Add to the existing ask-payload describe in `tests/native-permission-broker.test.ts` (match the file's local helper style when you open it):

```ts
it('rides permissionMode along the PermissionRequest payload', async () => {
  const broker = new PermissionBroker();
  const events: any[] = [];
  broker.on('hook-event', (e) => events.push(e));
  void broker.ask({ sessionId: 's1', toolName: 'Bash', toolInput: { command: 'git push' }, denyListed: true, permissionMode: 'full-auto' });
  expect(events[0].payload.permissionMode).toBe('full-auto');
});

it('omits permissionMode when the caller did not supply one (CC-path shape unchanged)', async () => {
  const broker = new PermissionBroker();
  const events: any[] = [];
  broker.on('hook-event', (e) => events.push(e));
  void broker.ask({ sessionId: 's1', toolName: 'Bash', toolInput: {}, denyListed: false });
  expect('permissionMode' in events[0].payload).toBe(false);
});
```

- [ ] **Step 2: Failing test — host reads the mode at ASK time**

Add to the askUser/broker describe in `tests/native-session-host.test.ts` (reuse that file's existing host construction helpers — it already builds hosts and fires asks for the revokeRule suites):

```ts
it('stamps the CURRENT permission mode on each ask, not the wiring-time mode', async () => {
  // ...construct host + session per the file's existing helper...
  host.setPermissionMode(sessionId, 'full-auto');
  const events: any[] = [];
  host.broker.on('hook-event', (e) => events.push(e));
  // trigger the wired askUser (the file's existing pattern for exercising toolWiring's askUser)
  void wiring.askUser!({ sessionId, toolName: 'Bash', toolInput: { command: 'git push' }, denyListed: true });
  expect(events[0].payload.permissionMode).toBe('full-auto');
});
```

Run both: `npx vitest run tests/native-permission-broker.test.ts tests/native-session-host.test.ts` — Expected: the two new cases FAIL.

- [ ] **Step 3: Implement**

`permission-broker.ts` — extend `AskRequest` and the emit:

```ts
  /** The session's permission mode at ask time. Full-auto + denyListed is the
   *  renderer's cue to swap the generic row for the safety-stop footer
   *  (spec 2026-08-12, M5 2b). Optional: CC-path asks never carry it. */
  permissionMode?: 'ask' | 'auto-edit' | 'full-auto';
```

and in `ask()`'s payload (after `external`):

```ts
          ...(req.permissionMode ? { permissionMode: req.permissionMode } : {}),
```

`native-session-host.ts:743` — the wrapper must read `modeFor` per call (a mode flip mid-session must show on the next ask):

```ts
      // Stamp the CURRENT mode on every ask (read at call time, not wiring
      // time) — the renderer's full-auto safety-stop footer keys on it.
      askUser: (req) => this.broker.ask({ ...req, permissionMode: this.modeFor.get(sessionId) ?? 'ask' }),
```

- [ ] **Step 4: Run to verify pass**

`npx vitest run tests/native-permission-broker.test.ts tests/native-session-host.test.ts` — Expected: PASS (whole files).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(harness): permission asks carry the session's mode at ask time

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Renderer state plumbing (dispatcher → reducer → tool entry, TDD)

**Files:**
- Modify: `desktop/src/renderer/state/hook-dispatcher.ts` (~line 20 block)
- Modify: `desktop/src/renderer/state/chat-types.ts` (~line 457 action fields + the `ToolCallState` fields nearby — follow where `denyListed?: boolean` appears in BOTH places)
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (three copy sites: ~880, ~1247, ~1273 — every place `denyListed` is copied)
- Test: `desktop/tests/chat-reducer.test.ts` (extend the `PERMISSION_REQUEST tool matching` describe at ~line 211)

**Interfaces:**
- Consumes: `payload.permissionMode` (Task 3).
- Produces: `ToolCallState.permissionMode?: NativePermissionMode` — Task 5 reads `tool.permissionMode`.

- [ ] **Step 1: Failing reducer test**

```ts
it('carries permissionMode onto the tool entry (and the synthetic-tool path)', () => {
  // Mirror the describe's existing PERMISSION_REQUEST action fixtures, adding:
  //   permissionMode: 'full-auto'
  // Assert on both paths the describe already exercises (matched running tool
  // AND permission-before-transcript synthetic tool):
  expect(tool.permissionMode).toBe('full-auto');
});
```

Run: `npx vitest run tests/chat-reducer.test.ts` — Expected: new case FAILS (field undefined).

- [ ] **Step 2: Implement**

`hook-dispatcher.ts`, next to the `external` extraction:

```ts
      // Validate against the union rather than trusting the wire — a remote
      // peer on an older/newer build must degrade to the generic row, never
      // to a mode-shaped string the footer misreads.
      const rawMode = payload.permissionMode;
      const permissionMode =
        rawMode === 'ask' || rawMode === 'auto-edit' || rawMode === 'full-auto' ? rawMode : undefined;
```

and add `permissionMode,` to the returned action beside `denyListed`/`external`.

`chat-types.ts`: add `permissionMode?: NativePermissionMode;` to BOTH the `PERMISSION_REQUEST` action shape (beside `denyListed?` at ~457) and `ToolCallState` (find it: `rg -n "denyListed" src/renderer/state/chat-types.ts`), importing the type from `'../../shared/permission-types'` if not already imported.

`chat-reducer.ts`: at each of the three `denyListed:` copy sites, add the sibling line `permissionMode: synTool.permissionMode,` / `permissionMode: action.permissionMode,` to match.

- [ ] **Step 3: Run to verify pass**

`npx vitest run tests/chat-reducer.test.ts` — Expected: PASS.

(No serialization work: `serializeChatState` copies whole `toolCalls` entries — `Array.from(s.toolCalls.entries())` at `chat-types.ts:685` — so the field flows to remote hydration automatically.)

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(renderer): permissionMode flows dispatcher -> reducer -> tool entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: The safety-stop footer in `PermissionButtons` (TDD)

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx:113` (`const PERMISSION_DISPLAY` → `export const PERMISSION_DISPLAY` + one WHY line: the full-auto footer reuses the chip colors)
- Modify: `desktop/src/renderer/components/ToolCard.tsx` (`PermissionButtons` ~285–475 and its call site ~885)
- Test: create `desktop/tests/tool-card-full-auto-stop.test.tsx`; update `desktop/tests/permission-confirm-card.test.tsx` (confirm copy)

**Interfaces:**
- Consumes: `tool.permissionMode` (Task 4), `fullAutoStopCopy` (Task 2), `PERMISSION_DISPLAY['full-auto']`.
- Produces: the shipped footer. No new exports.

- [ ] **Step 1: Failing tests**

Model the harness on `tests/tool-card-external-ask.test.tsx` (it already renders `ToolCard` with an awaiting-approval fixture — copy its setup, don't invent one):

```tsx
// desktop/tests/tool-card-full-auto-stop.test.tsx
describe('full-auto safety stop', () => {
  it('renders Run it / Skip it / Always Allow for full-auto + denyListed', () => {
    // fixture: toolName 'Bash', input { command: 'git push origin master' },
    // status 'awaiting-approval', requestId 'native-x', denyListed: true,
    // permissionMode: 'full-auto'
    expect(screen.getByText('Run it')).toBeTruthy();
    expect(screen.getByText('Skip it')).toBeTruthy();
    expect(screen.getByText('Always Allow')).toBeTruthy();
    expect(screen.queryByText('Yes')).toBeNull();
    expect(screen.getByText('Stopped before pushing code')).toBeTruthy();
    expect(screen.getByText(/YouCoded limits this action, even in Full Auto — it changes your published code\./)).toBeTruthy();
  });

  it('keeps the generic row for ask-mode + denyListed', () => {
    // same fixture, permissionMode: 'ask'
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('Always Allow')).toBeTruthy();
    expect(screen.queryByText('Run it')).toBeNull();
  });

  it('keeps the generic row when permissionMode is absent (CC asks)', () => {
    // fixture without permissionMode, denyListed: true
    expect(screen.getByText('Yes')).toBeTruthy();
  });

  it('Run it sends plain allow; Skip it sends deny', async () => {
    // spy on window.claude.session.respondToPermission (external-ask test shows the shim pattern)
    // click Run it  → { decision: { behavior: 'allow' } }
    // click Skip it → { decision: { behavior: 'deny' } }
  });

  it('Always Allow opens the consequence confirm with the new copy, echoing the command', async () => {
    // click Always Allow →
    expect(screen.getByText(/It may delete files or change published code, and you won't be asked again during future sessions in this project\./)).toBeTruthy();
    expect(screen.getByText('git push origin master')).toBeTruthy();
  });
});
```

In `tests/permission-confirm-card.test.tsx`: update the old consequence-line assertion (`It can delete files or change published code, and you won't be asked again.`) to the new sentence — the confirm is shared, so ask-mode shows it too.

Run: `npx vitest run tests/tool-card-full-auto-stop.test.tsx tests/permission-confirm-card.test.tsx`
Expected: new file FAILS everywhere; confirm test FAILS on the copy assertion.

- [ ] **Step 2: Implement in `ToolCard.tsx`**

1. Import `fullAutoStopCopy` and `PERMISSION_DISPLAY`; add `permissionMode` to `PermissionButtons` props (`permissionMode?: NativePermissionMode`) and pass `permissionMode={tool.permissionMode}` at the ~885 call site.
2. Inside `PermissionButtons`:

```tsx
  // Full-auto's ONLY rule-based ask is a deny-list stop, and the generic row
  // reads as noise there — swap the footer for the safety stop the compare
  // view settled (workbench surface 'full-auto-ask', R1-R4). Every other
  // combination keeps the row exactly as-is (spec 2026-08-12 scope guard).
  const fullAutoStop = permissionMode === 'full-auto' && !!denyListed;
```

3. Actions array must match the VISUAL order so arrow keys walk left-to-right (WHY comment required — red sits mid-row here, unlike every other row; owner-approved, R2):

```tsx
  actions.current = fullAutoStop
    ? [
        () => handleRespond({ decision: { behavior: 'allow' } }),
        () => handleRespond({ decision: { behavior: 'deny' } }),
        onAlwaysAllow,
      ]
    : [ /* existing three entries unchanged */ ];
```

Default focus: `useState(fullAutoStop ? 0 : canAlwaysAllow ? 1 : 0)` — Run it is the primary verb (generic row keeps its shipped default).

4. The footer, rendered when `fullAutoStop && !confirmingAlways` (the `confirmingAlways` branch is shared and untouched apart from the copy line). The settled markup — colors from the chip record, no duplicated hex:

```tsx
  const fa = PERMISSION_DISPLAY['full-auto'];
  const stop = fullAutoStopCopy(command);
  // ...
  if (fullAutoStop) {
    return (
      <div className="px-3 py-2 space-y-2 border-t" style={{ background: fa.bg, borderColor: fa.border }}>
        {/* Header + subheader as ONE tight block; the only real gap is before
            the buttons (owner spacing direction, R3). */}
        <div className="space-y-0.5">
          <p className="text-xs font-medium" style={{ color: fa.color }}>{stop.header}</p>
          <p className="text-2xs text-fg-dim leading-relaxed">{stop.subline}</p>
        </div>
        <div className="flex items-center gap-2">
          <button ref={el => { buttonsRef.current[0] = el; }} disabled={responding}
            onClick={() => handleRespond({ decision: { behavior: 'allow' } })}
            className={`px-3 ${pad} text-xs font-medium rounded-lg bg-green-600/60 hover:bg-green-600/80 text-green-100 transition-colors disabled:opacity-50 ${focusIdx === 0 ? ring : ''}`}>
            Run it
          </button>
          <button ref={el => { buttonsRef.current[1] = el; }} disabled={responding}
            onClick={() => handleRespond({ decision: { behavior: 'deny' } })}
            className={`px-3 ${pad} text-xs font-medium rounded-lg bg-red-600/60 hover:bg-red-600/80 text-red-100 transition-colors disabled:opacity-50 ${focusIdx === 1 ? ring : ''}`}>
            Skip it
          </button>
          <span className="text-fg-faint text-xs select-none">|</span>
          <button ref={el => { buttonsRef.current[2] = el; }} disabled={responding}
            onClick={onAlwaysAllow}
            className={`px-3 ${pad} text-xs font-medium rounded-lg bg-orange-600/60 hover:bg-orange-600/80 text-orange-100 transition-colors disabled:opacity-50 ${focusIdx === 2 ? ring : ''}`}>
            Always Allow
          </button>
        </div>
      </div>
    );
  }
```

(`fullAutoStop` implies a native deny-listed ask, so `canAlwaysAllow` is true and `onAlwaysAllow` opens the confirm — the deny-listed gate inside it is what we want.)

5. The shared confirm's body line becomes:

```tsx
          It may delete files or change published code, and you won't be asked again during future sessions in this project.
```

6. In `StatusBar.tsx`: `export const PERMISSION_DISPLAY ...` with the WHY line. Verify no import cycle: `rg -n "from './ToolCard'" src/renderer/components/StatusBar.tsx` must return nothing (verified during planning — keep it that way).

- [ ] **Step 3: Run to verify pass**

```bash
npx vitest run tests/tool-card-full-auto-stop.test.tsx tests/permission-confirm-card.test.tsx tests/tool-card-external-ask.test.tsx tests/tool-card-budget-gate.test.ts
```
Expected: ALL PASS (the last two prove the scope guard — external asks and budget gates untouched).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(permissions): full-auto safety-stop footer (M5 2b)

Run it / Skip it | Always Allow on the mode's amber band, per-family copy,
shared confirm copy updated globally. Condition: full-auto + denyListed only.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification + ship

- [ ] **Step 1: Full local gate**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh full-auto-prompt
```
Expected: exit 0 (tsc, affected vitest, knip, eslint, ast-grep). knip note: `deny-list-copy.ts` is imported by ToolCard so it won't flag; if `PERMISSION_DISPLAY` shows as an unused export knip warning, the ToolCard import satisfies it.

- [ ] **Step 2: Visual pass — Destin's, not scripted**

The workbench compare view already holds the approved look. For the real wiring, offer Destin a dev instance instead of scripting interaction:

```bash
bash scripts/run-dev.sh full-auto-prompt --label "Full Auto Stop"
```
Tell him: native session → status-bar chip to FULL AUTO → ask for a `git push`/`rm` → the safety stop should appear; Always Allow shows the new confirm copy. (Per the workspace rule, do NOT build an automated interactive rig.)

- [ ] **Step 3: PR**

```bash
cd /home/destin/youcoded-dev/worktrees/full-auto-prompt
git push -u origin feat/full-auto-prompt-coherence
gh pr create --repo itsdestin/youcoded --title "Full-auto safety-stop footer (M5 2b)" --body "$(cat <<'EOF'
Implements docs/active/specs/2026-08-12-full-auto-prompt-coherence.md (workspace repo).

- Full auto + deny-listed asks render the settled safety-stop footer (compare surface full-auto-ask, R1-R4)
- permissionMode rides the broker ask payload (no new IPC channel)
- subject-glob moved to shared/ so the renderer classifies with the engine's matcher
- Shared consequence-confirm copy updated globally (owner-approved)
- Zero engine/decision changes; Ask/Auto-edit/external/budget-gate UI pinned untouched by tests

Note: Windows matrix is already red on master (persistent_env, inherited from a2b0e35f) — attribute before assuming.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Watch the three-platform matrix; macOS `sync-warning-self-clear` flake re-runs clean (handoff note).

- [ ] **Step 4: Merge means merge AND push AND archive** (after Destin's sign-off)

Merge the PR; then in the workspace repo: move spec + this plan to `docs/archive/{specs,plans}/`, flip their `status:` to `shipped`, update the program doc (`2026-08-11-native-sessions-remaining-work.md` §2 — 2b done) and the 2bc handoff, commit + push. Remove the worktree + branch per the workspace rule, shut down the workbench/dev server (port 5233 frees up).

---

## Self-review record

- Spec coverage: settled card (T5), per-family copy (T2), button semantics incl. confirm copy global (T5), scope guard (T5 tests + external/budget-gate suites), plumbing (T3+T4), remote passthrough (verified: broadcast is wholesale, serialization copies entries — noted in T4), tests section (T2–T5). Permissions-screen no-op: no task touches it — correct.
- No placeholders: every code step carries real code; the two test snippets that lean on existing fixtures name the exact file whose setup to copy.
- Type consistency: `permissionMode?: 'ask' | 'auto-edit' | 'full-auto'` (= `NativePermissionMode`) end to end; `fullAutoStopCopy(command: string | undefined)` matches ToolCard's `command?: string`.
