---
status: active
date: 2026-08-16
spec: docs/active/specs/2026-08-16-native-specialists-plan-1c-design.md
parent_spec: docs/active/specs/2026-08-11-native-specialists-design.md
handoff: docs/active/handoffs/2026-08-16-specialists-1c-handoff.md   # review history and rejected alternatives live THERE, not here
repos: [youcoded]
sequence: plan 1c of 3 for spec stage one (1a SHIPPED 8db46236; 1b SHIPPED e5ec5b3c; 1c = chat UI backend + definitions from files + Settings)
ui_branch: youcoded feat/specialists-1c-ui (worktree worktrees/specialists-1c) — the approved renderer already lives here; this plan lands the backend on the SAME branch and closes the §7 renderer gaps
---

# Native Specialists Plan 1c — Implementation

> **Status 2026-08-26 (paused, mid-task — the checkboxes below are STALE):** All 82
> `- [ ]` boxes in this plan are still unchecked and **none of them reflects
> reality** — nobody ticked them as the work landed. Measured against
> `git log origin/master..feat/specialists-1c-ui` (47 commits, last one
> `6dd6a1a4`, 2026-08-16):
>
> - **Task 0 — SHIPPED.** Own branch `fix/permission-ask-replay`, youcoded **PR
>   #322**, merged to master as `bf55513e`. Do not redo it.
> - **Tasks 1–13 — BUILT on `feat/specialists-1c-ui`, unmerged.** Every task has
>   matching commits (`a02bd61c` ledger chokepoint, `ef3925d0` frontmatter +
>   loaders, `2bdca0b0` catalog, `077cf65b` per-cwd roster + hire subject,
>   `9b502808` notes/steer/stop, `c3a011f3` PermissionHeld, `9e11ecc5` thinking
>   rows, `c009ddf0` five-surface channels, `b3e8ae13`/`978e9cc7` replay + remote
>   buffer, `f9379ab9` renderer on the real bridge, `ba3da133` reducer note rows,
>   `afdeba5a` held-ask copy + note cap, `c19f9191` Settings states + tier errors),
>   and the branch adds 23 new files including 9 new test files.
> - **Task 14 — NOT DONE.** The checklist doc was written
>   (`docs/active/handoffs/2026-08-16-specialists-1c-testing-checklist.md`), but
>   **Step 3 was never performed**: all 15 Result cells are blank, so not one of
>   the nine agent-runnable checks (1, 2, 4, 5, 7, 8, 9, 9b, 9d) has been run.
> - **Task 15 Steps 1–2 — DONE** (workspace commit `de0d700` rule + MAP;
>   ROADMAP status text on the `#specialists` items). **Step 3 — impossible**
>   until the branch merges. Note the side effect: the rule/MAP anchors point at
>   branch-only files, so `node scripts/audit-anchors.mjs` has failed on the daily
>   workspace CI cron since 2026-08-16 (11 anchors + 14 MAP paths + 3 rule globs).
>
> **Also stale:** Global Constraints says line anchors were verified against master
> `b79db26a` and branch HEAD `5718d44d`. Master is now `dbbb9139` — **89 commits
> ahead of the branch's last master merge (`5222a66f`)** — and branch HEAD is
> `6dd6a1a4`. Re-locate every line anchor by symbol before editing.
>
> **Task 15's ROADMAP instruction is wrong on one point:** it says to flip the item
> at "line 34" to `[x]`. That item (consent-key canonicalization) was already `[x]`
> from plan **1b** and is genuinely on master (`f9fcd065` / `e5ec5b3c`, both
> verified with `git branch -r --contains`). Only the three `#specialists` UX items
> — consent-card copy, "reads complete while still working", and the background
> ask/report placement — are 1c's to flip, and only on merge.
>
> **Blocked on Destin before merge:** the auto-edit permission-mode question in the
> handoff's "Addendum 2026-08-26". Four uncommitted files also sit in the worktree.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the spec first; this plan assumes it.

**Goal:** Ship the backend the approved 1c renderer expects (a live run feed off the delegation ledger, notes on the run record, held asks, thinking rows, `specialists:*` channels), let users define specialists as files (personal folder + Claude Code's two `.claude/agents/` folders, re-read when they change, mapped through the strict tool table), finish Settings → Specialists, and close the renderer gaps in spec §7.

**Architecture:**
- The **delegation ledger** gets one private `mutate()` chokepoint that reports every changed record to a single listener; the host turns those into `specialists:event { kind:'run' }` pushes. The Task card's status IS the ledger record. **Notes ride on that record** (`run.notes`); there is no separate note message — the reducer rebuilds a card's note rows from `run.notes` on every update.
- A **`SpecialistCatalog`** replaces the module-load `BY_ID` map. It reads the three folders when a conversation opens, re-reads at each root turn start if any file's fingerprint (name + mtime + size) changed, and on Settings' Refresh. No file watchers. No teardown cleanup. The Task tool is **rebuilt at every turn start** from the in-memory roster.
- Definitions are **pure functions over `(path, raw text)`** — a tolerant frontmatter parser plus two loaders (personal format; Claude Code format with the §3.2 mapping table) — so every mapping rule is unit-tested without touching disk.
- **A file-defined helper's hire is never covered by a remembered grant:** its permission subject differs from a built-in's, and the hire card offers no Always-allow for it.
- Five request channels + one push channel ride the standard five surfaces. Renderer work is confined to spec §7 plus: a provenance line ("defined by …") on the hire card and Settings row, and the offered-cap warning.

**Tech Stack:** TypeScript (Electron main + shared + React renderer), vitest, existing seams only: `NativeHome`, `DelegationLedger`, `PermissionBroker`, `HarnessSession.syncTaskTool`, `defineTool`, the five-surface IPC pattern from `permissions:*`. No new dependencies (no chokidar, no YAML library).

## Global Constraints

- **Branch:** all work in the `youcoded` repo on the EXISTING branch `feat/specialists-1c-ui` in `worktrees/specialists-1c`. First step of Task 1: `git fetch origin && git rebase origin/master`. Never `cp -al`-copy `node_modules` from a symlink; the worktree already has its own.
- **Task 0 is a SEPARATE branch + PR** (`fix/permission-ask-replay` off master), merged before this branch is rebased for Task 6+. It must not share a PR with the file catalog (spec §0).
- **Spec values, verbatim:** note cap **2,000 characters**; run replay bounded by `SPECIALIST_SPAWN_BUDGET_PER_SESSION` (30); ask hold `SPECIALIST_ASK_HOLD_MS` (5 minutes — a plain constant, no override); load order **built-ins → personal → `~/.claude/agents/` → `<cwd>/.claude/agents/`**; **built-in ids reserved, any id collision = warning + skipped, no shadowing**; at most **`MAX_OFFERED_SPECIALISTS` = 20** non-built-in specialists offered to the model (load order; the rest listed in Settings with a warning, never silently cut); **`MAX_DESCRIPTION_CHARS` = 300** in the definition the Task tool interpolates (full text kept for Settings); omitted CC `tools:` → read-only set `Read, Glob, Grep` + warning; CC `Task`/`Agent` always stripped; `charter` is **derived** (`read-write` iff any of `Write`/`Edit`/`Bash`), never declared; personal folder `~/.youcoded/specialists/`, starter file `example.md`; Task tool rebuilt at every turn start, never mid-turn; a running helper keeps its spawn-time definition (R12); user copy says "specialists" / "helpers", never subagent/spawn.
- **Hire grants — do not simplify this into one mechanism.** (a) `permissionSubject` for a non-built-in specialist is `${charter}:${workDir}:file:${id}`; built-ins keep `${charter}:${workDir}` so existing grants stay valid. (b) The renderer suppresses Always-allow on a hire whose definition `source !== 'builtin'`, default-closed while the definition is unknown. **They close different halves:** `decide(toolName, subject)` runs BEFORE any card exists (`harness-session.ts:2250`) — a matching remembered rule answers `allow` and no card is rendered, so (b) cannot protect against an OLD grant; (a) is what stops the Worker's `read-write:/proj` grant from matching a repo's helper. (b) is what stops a NEW grant being minted for a file-defined id — an edit that widens that file's tools would still land under the same id. (The existing WHY at `harness-session.ts:40-45` is the same reasoning one level up.) Task 4 + Task 10.
- **`~/.youcoded/` is written ONLY through `NativeHome`** (ADR 008, `native-home.ts:1`). The starter file and personal folder go through a new `NativeHome.ensureTextFile`. **Never `mkdir` `.claude/agents/` inside a user's repo.**
- **One ledger write per related change** (the ledger's own house rule, `delegation-ledger.ts:154-168, 214, 271-299`): a note for a *parked* steer lands in the SAME `mutateJson` as the parked steer.
- **Frozen transcript emit surface still binds:** no new `TranscriptEventType`. Thinking rows reuse `assistant-thinking` display copies; the ONLY widening is "`assistant-thinking` **with `data.text`**" (payload-less heartbeats never re-emit).
- **Emit in the ledger, never in the host per method.** One `mutate()` chokepoint; the guard is a source-level test that `await this.home.mutateJson(` appears exactly once among the file's CODE lines (comments excluded).
- **New IPC channels are NOT gated on `native.supported`** (remote-shim hardcodes it false; a phone must be able to answer an ask). Five surfaces + `ipc-channels.test.ts` parity for every request channel; the push channel is exempt from the Kotlin/handler surfaces the same way `native:model-state` is.
- **Every non-trivial edit carries a WHY comment** (Destin is a non-developer). **Error copy:** specific-and-accurate or general-non-committal (`docs/error-message-standards.md`); `<ErrorState>` for renderer errors, never a hand-rolled box.
- **Verification:** `bash scripts/verify.sh worktrees/specialists-1c` green before any "done" claim; `node scripts/workbench-boot-check.mjs` after any mock-shim change; the branch's `workbench-mock-contract.test.ts` **fails the moment a real channel lands without its `MOCK_ONLY` row being deleted** — Task 10 removes all seven rows.
- **Read before you edit:** line anchors below were verified against youcoded master `b79db26a` and branch HEAD `5718d44d`. Re-locate by symbol if a range looks wrong (`mcp__serena__find_symbol` sees master only — branch truth is the worktree).

## Deferred-item ledger (NOT in this plan — spec §0 Out)

| Item | Home |
|---|---|
| Child-transcript GC | ROADMAP, depends on a future delete-conversation feature |
| Promote foreground → background; open a helper's transcript in a viewer; project-level *native* folder; per-helper tokens/cost; strict per-action toggle; live-updating Settings roster (file watchers) | ROADMAP `#specialists` ideas (Task 15 writes them) |
| Hidden utility specialists, CLI bridge, stage-two plans | Parent spec phasing |

---

### Task 0: Pending asks survive a renderer reload (SEPARATE branch + PR, before Task 6)

The ROADMAP `#permissions` bug (line 98): `TRANSCRIPT_REPLAY` rebuilds cards from the JSONL, but open asks live only in `PermissionBroker.pending` (memory) — nothing re-sends the `PermissionRequest`, so the card comes back `running` with no buttons. Own branch `fix/permission-ask-replay` off master, own PR, merged first.

**Files:**
- Modify: `desktop/src/main/harness/permission-broker.ts` (`PendingAsk` :137-144, `ask()` :161-206)
- Modify: `desktop/src/main/harness/native-session-host.ts` (new public `pendingAskEventsFor(sessionId)`)
- Modify: `desktop/src/main/ipc-handlers.ts` (`TRANSCRIPT_REPLAY` handler :2484-2500)
- Test: `desktop/tests/native-permission-broker.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Produces: `PermissionBroker.pendingEventsFor(sessionId: string): HookEvent[]` — one re-built `PermissionRequest` hook event per still-pending entry (including timed-out-but-answerable ones), byte-identical in payload shape to the original emit (`_requestId`, `tool_name`, `tool_input`, `denyListed`, `external`, `specialist?`, `permissionMode?`); `NativeSessionHost.pendingAskEventsFor(sessionId): HookEvent[]` delegates.

- [ ] **Step 1: Failing tests.** In `native-permission-broker.test.ts`: `it('pendingEventsFor re-emits every open ask for the session with the original requestId and payload', …)` — ask twice for `s1`, once for `s2`; expect two events for `s1`, ids equal to the ones the original `hook-event` emit carried, `tool_input` deep-equal. `it('pendingEventsFor includes a timed-out (held) ask — it is still answerable', …)` — `ask(..., { timeoutMs: 1, onTimeout })`, await the timeout, expect the entry still returned. In `native-session-host.test.ts`: `it('pendingAskEventsFor delegates to the broker for one session', …)`.
- [ ] **Step 2: Run** `npx vitest run tests/native-permission-broker.test.ts -t pendingEventsFor` → FAIL (method missing).
- [ ] **Step 3: Implement.** `PendingAsk` gains the fields needed to rebuild the payload: `toolInput`, `denyListed`, `external`, `permissionMode` (all already on `AskRequest`; store `req` fields on the entry at :164-171). `pendingEventsFor(sessionId)` maps `this.pending` entries whose `sessionId` matches into `{ sessionId, type: 'PermissionRequest', payload: {…same spread as :194-203…}, timestamp: Date.now() }`. WHY comment: "a replay rebuilds cards from disk, but an open ask lives only here — re-sending it is the only way the card gets its buttons back (ROADMAP #permissions, 2026-08-16)."
- [ ] **Step 4: Wire the replay.** In `ipc-handlers.ts` `TRANSCRIPT_REPLAY` handler, after the event loop and BEFORE `TRANSCRIPT_REPLAY_COMPLETE` is sent: `for (const ev of nativeHost.pendingAskEventsFor(sessionId)) evt.sender.send(IPC.HOOK_EVENT, ev);` — direct to `evt.sender` for the same ownership reason the handler already states. Guard: only when `nativeEvents !== null` (native sessions).
- [ ] **Step 5: Run** the two test files → PASS. `bash scripts/verify.sh <that worktree>` → green.
- [ ] **Step 6: Commit + PR** — `git commit -m "fix(permissions): re-send open native asks after a transcript replay so the card gets its buttons back"`; open the PR against master; merge; delete branch/worktree. Flip the ROADMAP item to `[x]` with the sha.

---

### Task 1: Ledger `mutate()` chokepoint + change listener + `notes` / `model` on the record + `toRunView`

**Files:**
- Modify: `desktop/src/main/harness/specialists/delegation-ledger.ts` (`DelegationRecord` :36-79; the 7 `mutateJson` sites :146, :176, :224, :258, :308, :351, :362; class :131; `appendMissedSteers` :256)
- Modify: `desktop/src/shared/types.ts` (branch: `SpecialistRunView` :414-430 — add `notes`; `model` stays `{ label: string; via?: …; fallback?: boolean }` exactly as the branch has it)
- Test: `desktop/tests/specialist-delegation-ledger.test.ts`

**Interfaces:**
- Consumes: `NativeHome.mutateJson(rel, fn): Promise<void>` (returns nothing — capture through the closure, as `claimUndelivered` already does).
- Produces (Tasks 5, 8, 9, 11 consume):

```ts
// shared/types.ts (next to SpecialistRunView; the ledger imports it from here)
export interface SpecialistNote { text: string; from: 'user' | 'assistant'; at: number }
SpecialistRunView.notes?: SpecialistNote[];
// delegation-ledger.ts — additive record fields
DelegationRecord.notes?: SpecialistNote[];                                                   // absent on 1b records → read as []
DelegationRecord.model?: { label: string; via?: 'budget' | 'frontier' | 'named' | 'parent'; fallback?: boolean };
export type LedgerChangeListener = (parentCwd: string, parentId: string, changed: DelegationRecord[]) => void;
export class DelegationLedger {
  constructor(private home: NativeHome, private onChange?: LedgerChangeListener) {}   // the ONLY way to set it — no setter
  async appendNote(parentCwd, parentId, childId, note: SpecialistNote): Promise<void>;                        // live-delivered steer
  async appendMissedSteers(parentCwd, parentId, childId, steers: string[], note?: SpecialistNote): Promise<void>;  // parked steer + its note, ONE write
  // every other public write keeps its signature
}
/** The renderer's view of one record: the record MINUS delivery bookkeeping
 *  (delivered, injectionAttempted, claimedBy, claimedAt, owner, missedSteers,
 *  rawReport, reportPath) — those are the host's business, never the card's. */
export function toRunView(rec: DelegationRecord): SpecialistRunView;
```

- [ ] **Step 1: Failing tests** in `specialist-delegation-ledger.test.ts` (temp-dir `NativeHome`, existing fixture style):

```ts
describe('change listener (plan 1c)', () => {
  it('recordStart fires with the new record; update / updateIfRunning / updateUnlessCompleted / appendMissedSteers / takeMissedSteers / claimUndelivered / markInjectionAttempted / confirmDelivered / releaseClaim / appendNote each fire with the touched record only', …);  // one it.each over a table of calls; seed c1 + c2; expect changed=[c1]
  it('listFor never fires', …);
  it('a write that changes nothing (update on an unknown childId) does not fire', …);
  it('THE GUARD: delegation-ledger.ts calls home.mutateJson exactly once (inside mutate())', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'harness', 'specialists', 'delegation-ledger.ts'), 'utf8');
    // Code lines only — the file's WHY comments name mutateJson freely; this guard is about CODE.
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code.match(/await this\.home\.mutateJson\(/g)?.length, 'every write must go through mutate() so the change listener sees it').toBe(1);
  });
});
it('appendNote appends in order; a 1b record with no notes reads as []', …);
it('appendMissedSteers with a note lands steer + note in ONE write (listener fires once, both present)', …);
it('toRunView strips delivery bookkeeping and carries notes/model/steps/stale', …);
```
- [ ] **Step 2: Run** `npx vitest run tests/specialist-delegation-ledger.test.ts` → FAIL.
- [ ] **Step 3: Implement `mutate()`** and route all seven direct sites through it:

```ts
/** THE chokepoint (plan 1c). Every write funnels through here so the change
 *  listener sees each of them — enumerating methods in the host would go stale
 *  the day a twelfth is added. Changed = records whose object identity differs
 *  from before (the map callbacks return the same `d` for untouched records;
 *  recordStart appends), so a no-op write reports nothing. */
private async mutate(parentCwd: string, parentId: string, fn: (data: LedgerFile) => LedgerFile): Promise<void> {
  let before: DelegationRecord[] = []; let after: DelegationRecord[] | undefined;
  await this.home.mutateJson(this.relPath(parentCwd, parentId), (cur) => {
    const data = this.coerce(cur); before = data.delegations;
    const next = fn(data); after = next.delegations; return next;
  });
  if (!after || !this.onChange) return;
  const changed = after.filter((d, i) => before[i] !== d);
  if (changed.length > 0) this.onChange(parentCwd, parentId, changed);
}
```
`appendNote` = `mutate` mapping the matching record to `{ ...d, notes: [...(d.notes ?? []), note] }`. `appendMissedSteers(..., steers, note?)` adds `notes` in the same map when `note` is given (WHY: the house rule at :154-168 — a parked steer and its note either both land or neither). `toRunView` picks fields explicitly (never `delete` from a spread — the omitted set is the WHY comment).
- [ ] **Step 4: Run** the ledger tests + `npx vitest run tests/specialist-run.test.ts tests/native-session-host.test.ts` → PASS (no behavior change for existing callers).
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): ledger mutate() chokepoint with a change listener; notes/model on the record; toRunView"`

---

### Task 2: Frontmatter parser + definition loaders (personal format, Claude Code mapping table)

Pure functions over `(filePath, rawText)` — no disk. This is where every §3.2 row becomes a test.

**Files:**
- Create: `desktop/src/main/harness/specialists/frontmatter.ts`
- Create: `desktop/src/main/harness/specialists/definition-files.ts`
- Modify: `desktop/src/main/harness/specialists/builtins.ts` (export `wrapSpecialistPrompt`; `SHARED_PREFIX` :14 / `SHARED_SUFFIX` :19 stay private; every built-in stamps `source: 'builtin'`)
- Modify: `desktop/src/main/harness/specialists/registry.ts` (`SpecialistDefinition` :3-13 gains `source: 'builtin' | 'personal' | 'claude-code'` — Task 4's `permissionSubject` needs it and has nothing but the definition in hand)
- Modify: `desktop/src/main/harness/specialists/limits.ts` (add `MAX_DESCRIPTION_CHARS = 300`)
- Test: Create `desktop/tests/specialist-frontmatter.test.ts`, `desktop/tests/specialist-definition-files.test.ts`

**Interfaces:**
- Consumes: `SpecialistDefinition` (`registry.ts:3-13`, now with `source`).
- Produces (Task 3 consumes):

```ts
// frontmatter.ts — deliberately tolerant; no YAML dependency exists in desktop (every reader here is hand-rolled)
export type FrontmatterValue = string | string[] | { nested: true };
export function parseFrontmatter(raw: string): { data: Record<string, FrontmatterValue>; body: string } | { error: string };
// Rules: file starts with a `---` line (CRLF ok); closes at the next `---` line (unterminated → error
// "frontmatter never closes (no second ---)"); `key: value` at column 0; `[a, b]` → string[];
// a bare `key:` followed by `  - item` lines → string[]; a bare `key:` followed by indented `sub: x`
// lines → { nested: true } (we only need to KNOW hooks/skills are present); `key: >`/`|` → following
// indented lines joined; surrounding quotes stripped; unknown shapes never throw — they become strings.

// definition-files.ts
export const NATIVE_CHILD_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite'] as const;
export const READ_ONLY_DEFAULT_TOOLS = ['Read', 'Glob', 'Grep'];
export const DEFAULT_STEP_CAP = 25;            // matches the built-ins' common value
export const DEFAULT_REPORT_BUDGET_TOKENS = 2000;
export type LoadedDefinition = { definition: SpecialistDefinition; warnings: string[]; fullDescription?: string };  // fullDescription only when the 300-char cap bit
export type DefinitionLoad = { ok: true; value: LoadedDefinition } | { ok: false; error: string };
export function loadPersonalDefinition(filePath: string, raw: string): DefinitionLoad;
export function loadClaudeCodeDefinition(filePath: string, raw: string): DefinitionLoad;
export function deriveCharter(tools: readonly string[]): 'read-only' | 'read-write';   // read-write iff Write|Edit|Bash
export function slugifyId(name: string): string;   // lowercase, [a-z0-9-], collapse runs, trim dashes
export const STARTER_FILE_NAME = 'example.md';
export const STARTER_FILE_CONTENTS: string;        // every field filled and explained in plain words (spec §3 "Starter file")
// builtins.ts
export function wrapSpecialistPrompt(body: string): string;   // `${SHARED_PREFIX}\n\n${body.trim()}\n\n${SHARED_SUFFIX}` — KV-cache prefix reuse
```

**Personal format** (spec §3): `name` (default: filename stem), `id` (default: filename stem, slugified), `description` (required — the model reads it; missing → error), `tools` (list; missing → `READ_ONLY_DEFAULT_TOOLS` + warning "no tools listed — read-only by default; add `tools:` to widen"; unknown names → stripped + warning "N tools this file asked for don’t exist here and were removed: X, Y"; `Task`/`Agent` → stripped + warning "specialists can’t hire specialists — Task was removed"), `model` (`budget|frontier|parent`, default `parent`; other → warning + parent), `stepCap` / `reportBudgetTokens` (numeric, else warning + default), `version`/`author` accepted and ignored. Body → `wrapSpecialistPrompt(body)`; empty body → error "no instructions below the frontmatter".

**Claude Code format** — the §3.2 table, row for row. `name` required (missing → error "Claude Code agent files need a `name:`"); id = `slugifyId(name)`; `tools:` is a **comma-separated string in CC** (`tools: Read, Grep, Bash`) — also accept a list; mapping: `Read/Write/Edit/Bash/Glob/Grep/WebFetch/WebSearch/TodoWrite` → same; `MultiEdit` → stripped, warning "MultiEdit was removed — Edit covers it"; `NotebookEdit/KillShell/BashOutput/SlashCommand/Skill/ExitPlanMode/AskUserQuestion/ListMcpResources/mcp__*` → stripped, one combined warning "N tools this file asked for aren’t available to helpers here and were removed: …"; `Task`/`Agent` → always stripped, warning; omitted `tools:` → `READ_ONLY_DEFAULT_TOOLS` + warning; `disallowedTools:` subtracted after mapping; `model:` `inherit|sonnet` → parent, `haiku` → budget, `opus` → frontier, other → parent + warning; `maxTurns` → stepCap; `permissionMode:` any value → ignored WITH a warning "permissionMode is ignored — helpers ask through the assistant, and approving the hire is the grant"; `color/memory` ignored silently; `hooks`/`skills` present → warning "hooks/skills in this file don’t run for helpers". Unrecognized keys never fail a load.

**Both formats:** the definition's `source` is stamped (`'personal'` / `'claude-code'`). A `description` longer than `MAX_DESCRIPTION_CHARS` is cut to 300 (with `…`) in the returned definition, kept whole in `fullDescription`, and warned: "description shortened to 300 characters for the assistant's tool list — the full text is here". WHY: every offered description is text in the Task tool on every turn, and a repo's file controls it.

- [ ] **Step 1: Failing tests.** `specialist-frontmatter.test.ts`: inline list, block list, nested map → `{nested:true}`, folded scalar, CRLF, quotes, unterminated fence → error, no frontmatter at all → error, body preserved verbatim. `specialist-definition-files.test.ts`, one `it` per rule above, at least: `'personal: omitted tools → read-only trio + warning'`, `'personal: unknown tool stripped with a warning naming it'`, `'personal: Task is always stripped'`, `'personal: charter is DERIVED — a file cannot claim read-only while holding Bash'` (frontmatter `charter: read-only` + `tools: [Bash]` → `read-write`, plus a warning "charter is not a setting — it follows the tools"), `'personal: empty body → error'`, `'personal: id defaults to the filename stem, slugified'`, `'cc: comma-separated tools parse'`, `'cc: MultiEdit → Edit warning'`, `'cc: mcp__* stripped'`, `'cc: omitted tools → read-only + warning'`, `'cc: disallowedTools subtracts after mapping'`, `'cc: model haiku→budget, opus→frontier, sonnet→parent, weird→parent+warning'`, `'cc: maxTurns → stepCap'`, `'cc: permissionMode → warning, never a failure'`, `'cc: hooks/skills → warning, never a failure'`, `'cc: missing name → error'`, `'both: prompt is wrapped in the shared prefix/suffix'` (assert `startsWith` the same prefix as `BUILTIN_SPECIALISTS[0].systemPrompt.split('\n\n')[0]`), `'both: a 2,000-char description is cut to 300 in the definition, kept whole in fullDescription, and warned'`, `'both: source is stamped'`, `'STARTER_FILE_CONTENTS parses as a valid personal definition with zero warnings'`.
- [ ] **Step 2: Run** both files → FAIL (modules missing).
- [ ] **Step 3: Implement** `frontmatter.ts` (~80 lines), `definition-files.ts` (~200 lines incl. the starter text), `wrapSpecialistPrompt`. WHY comments on: why hand-rolled (no YAML dep; every reader in this codebase is), why charter is derived (spec §3 — a file must not be able to claim read-only while holding a shell), why `Task` is stripped (depth-by-omission is the depth guard).
- [ ] **Step 4: Run** → PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): frontmatter parser + personal/Claude Code definition loaders with the §3.2 mapping table"`

---

### Task 3: `SpecialistCatalog` — sources, reserved ids, offered cap, re-read on change, snapshot, starter file

**No file watchers.** The Task tool is rebuilt from memory at every turn start, so re-reading when a conversation opens, at each root turn start *if any file changed*, and on Refresh delivers "drop a file in, the next thing you ask can hire it" with no lifecycle. **A folder's mtime does NOT change when a file inside is edited** — staleness is a per-file fingerprint (name + mtime + size over a handful of files, ~1 ms), never a directory stat. **Accepted blind spot:** an edit that keeps the byte size AND lands within the same millisecond as the previous mtime is invisible until something else in that folder changes; Refresh always re-reads, and the check must stay a handful of stats, not a content hash. **No teardown cleanup:** several conversations share one cwd; dropping a folder's entries when one of them closes would blank the others. Entries are a few small objects per folder — keep them for the process lifetime.

**Files:**
- Create: `desktop/src/main/harness/specialists/catalog.ts`
- Modify: `desktop/src/main/harness/specialists/registry.ts` (keep `resolveSpecialist`/`listSpecialists` as the built-in roster; add `BUILTIN_ROSTER`; export `SpecialistRoster`)
- Modify: `desktop/src/main/harness/specialists/limits.ts` (add `MAX_OFFERED_SPECIALISTS = 20`)
- Modify: `desktop/src/main/native-home.ts` (add `ensureTextFile`)
- Test: Create `desktop/tests/specialist-catalog.test.ts`; extend `desktop/tests/native-home.test.ts`

**Interfaces:**
- Consumes: Task 2 loaders.
- Produces (Tasks 4, 8 consume):

```ts
// registry.ts
export interface SpecialistRoster { list(): SpecialistDefinition[]; resolve(id: string): SpecialistDefinition | undefined }
export const BUILTIN_ROSTER: SpecialistRoster = { list: listSpecialists, resolve: resolveSpecialist };

// native-home.ts — creates parent dirs + file only if absent; returns true when it wrote. The ONE
// sanctioned way the personal folder and starter appear (ADR 008: NativeHome is the only ~/.youcoded writer).
async ensureTextFile(rel: string, contents: string): Promise<boolean>;

// catalog.ts
export type SpecialistSource = 'builtin' | 'personal' | 'claude-code';   // claude-code covers BOTH CC folders; `path` tells them apart
export interface CatalogEntry { definition: SpecialistDefinition; source: SpecialistSource; path?: string; warnings: string[]; offered: boolean; fullDescription?: string }   // source === definition.source
export interface SkippedFile { path: string; source: 'personal' | 'claude-code'; error: string }  // parse failure OR id collision — listed in Settings, never offered
export interface CatalogSnapshot { entries: CatalogEntry[]; skipped: SkippedFile[]; folders: { personal: string; claudeUser: string; project?: string } }
export interface SpecialistCatalogOpts {
  home?: NativeHome;                 // absent → no personal source (host tests)
  claudeUserDir?: string | null;     // default path.join(os.homedir(), '.claude', 'agents'); null → off
}
export class SpecialistCatalog {
  constructor(opts?: SpecialistCatalogOpts);
  async ensureFresh(cwd: string): Promise<boolean>;  // fingerprint the three folders; (re)read any that changed OR were never read; true if the roster changed.
                                                     // THE call for create/resume AND before every root turn — a never-seen cwd fingerprints as changed.
  async reload(cwd: string): Promise<void>;          // unconditional re-read of all three sources (Settings Refresh / specialists:list)
  roster(cwd: string): SpecialistRoster;             // SYNC, reads the in-memory arrays at call time — never called before ensureFresh(cwd) has resolved once
  snapshot(cwd?: string): CatalogSnapshot;           // for specialists:list
  async ensurePersonalFolder(): Promise<void>;       // home.ensureTextFile('specialists/example.md', STARTER_FILE_CONTENTS), then reload the personal source
}
```
**Load order and collisions:** built-ins → personal → `~/.claude/agents/` → `<cwd>/.claude/agents/`. Ids are unique; the first loaded wins and every later file with a taken id becomes a `SkippedFile` with error `` `"${id}" is already the name of ${where} — rename this file's name/id` `` where `where` = "a built-in specialist" / "a file in your specialists folder" / "another Claude Code agent file". WHY (spec §3): "later shadows earlier" would let a cloned repo's `.claude/agents/worker.md` silently replace the built-in Worker; personal beats CC because your own files should never lose to a repo you cloned. **Offered cap:** after collisions, the first `MAX_OFFERED_SPECIALISTS` non-built-in entries in load order get `offered: true`; the rest `offered: false` with warning `` `not offered to the assistant — more than ${MAX} specialists are defined for this folder; remove or move some` ``. `roster(cwd).list()` returns built-ins + offered entries only. **Fingerprint:** `Map<dir, string>` of `readdirSync` filtered to `.md` → `name:mtimeMs:size` joined; a missing dir fingerprints as `''`; a never-read dir has no map entry, which compares unequal to anything (so `ensureFresh` on a fresh cwd loads). `reload(cwd)` = drop that cwd's three fingerprints, then `ensureFresh(cwd)` — one read path.

- [ ] **Step 1: Failing tests** in `specialist-catalog.test.ts` (temp dirs; a `NativeHome(tmpRoot)` for the personal source):
  - `'built-ins load with no folders present'`; `'personal file appears in roster(cwd) with source personal and its path'`; `'CC user-level and project files both load as claude-code, told apart by path'`;
  - `'a personal file named worker.md is SKIPPED with a collision error — built-in ids are reserved'`; `'a project file colliding with a personal id is skipped; the personal one stays'`; `'a file that fails to parse is a SkippedFile and never in roster()'`;
  - `'the 21st non-built-in definition is offered:false with the cap warning and absent from roster().list()'`;
  - `'ensureFresh: editing a file’s CONTENT (same name, same folder) is detected — the fingerprint is per file, not the directory'` (write, ensureFresh, wait/utimes +1s, rewrite, expect true and the new tools); `'ensureFresh returns false and reads nothing when nothing changed'` (spy on the loader); `'ensureFresh on a never-seen cwd loads all three sources (returns true) — there is no separate first-load path'`;
  - `'two cwds loaded; nothing about cwd A changes when cwd B is loaded again'`; `'ensureFresh never creates <cwd>/.claude/agents'` (assert `!fs.existsSync`);
  - `'ensurePersonalFolder writes example.md once and never overwrites an edited one'`; `'snapshot().folders reports all three paths'`.
  - `native-home.test.ts`: `'ensureTextFile creates parents + file, returns true; second call returns false and leaves edits alone'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `catalog.ts` (~200 lines). Internal state: `globals: { personal, claudeUser }` each `{ entries, skipped, fingerprint }`, `projects: Map<cwd, { entries, skipped, fingerprint }>`. `roster(cwd)` returns closures over `this` (not a copied array). Collision + cap resolution is one pure function `resolveOffered(builtins, personal, claudeUser, project): { entries, skipped }` — unit-test it directly. Every fs read is wrapped in try/catch → `SkippedFile` with the real error message (never a guessed one). WHY block at the top: the no-watchers reasoning, the per-file-fingerprint gotcha and its accepted blind spot, and why there is no teardown cleanup.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): SpecialistCatalog — three sources, reserved ids, offered cap, re-read on file change, personal starter file"`

---

### Task 4: Wire the catalog into the host + a per-cwd Task tool rebuilt every turn + turn-start re-read + R12 + per-file hire subject

**Files:**
- Modify: `desktop/src/main/harness/tools/task.ts` (`schema` :85 built at module load — must move inside; `describeSpecialists` :143, `shortDescription` :185, `permissionSubject` :223-228, resume :287, spawn :366-369; `createTaskTool` :174)
- Modify: `desktop/src/main/harness/harness-session.ts` (`HarnessSessionOpts` :125 area — add `specialistRoster?`; `syncTaskTool` :794-799)
- Modify: `desktop/src/main/harness/native-session-host.ts` (ctor trailing params :1852-1859; `create` :2351/:2387; `resume` :2750/:2809; `toolWiring` :2075; the two `resolveSpecialist` sites :684 and :1368; the host's turn drainer `runTurns` — `ensureFresh` before each dispatched root turn)
- Modify: `desktop/src/main/ipc-handlers.ts` (`new NativeSessionHost(` :2276 — pass a real catalog)
- Test: `desktop/tests/task-tool.test.ts`, `desktop/tests/specialist-run.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: `SpecialistCatalog`, `SpecialistRoster`, `BUILTIN_ROSTER` (Task 3).
- Produces: `createTaskTool(roster: SpecialistRoster = BUILTIN_ROSTER): NativeTool<TaskArgs>`; `HarnessSessionOpts.specialistRoster?: SpecialistRoster`; `NativeSessionHost` ctor gains trailing `specialistCatalog: SpecialistCatalog = new SpecialistCatalog({ claudeUserDir: null })`.

- [ ] **Step 1: Failing tests.** `task-tool.test.ts`: `'createTaskTool(roster) enumerates THAT roster in the description, the schema enum text, and shortDescription'` (a fake roster with one `docs-writer`); `'permissionSubject uses the roster to find the charter'`; `'permissionSubject: a built-in hire is `${charter}:${workDir}` (unchanged — old grants still match); a file-defined hire is `${charter}:${workDir}:file:${id}` (a remembered read-write grant for the Worker does NOT cover it)'` (drive `ruleMatches` from `shared/subject-glob.ts` with a stored `read-write:/proj` rule against both subjects — expect match / no match); `'an unknown agent id is refused naming the roster’s ids'`. `native-session-host.test.ts`: `'create() loads the catalog for the cwd BEFORE the Task tool is built — a personal file present at create time is in the first turn’s Task description'`; `'a turn dispatched after a file changed sees the new roster (ensureFresh runs before the turn); an unchanged folder costs no re-read'` (spy on the loader across two turns); `'the Task tool is rebuilt at turn start: after the roster changes, the next turn’s tools list carries the new description'` (drive `buildAiTools` twice with the roster mutated between). `specialist-run.test.ts`: `'R12: a running child keeps its spawn-time definition when the roster changes mid-run'` (spawn with tools `[Read]`, swap the roster entry to `[Read, Bash]`, assert the child session's tool names are still `[Read]` and the NEXT Task description shows Bash).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: `task.ts`.** `createTaskTool(roster = BUILTIN_ROSTER)`; move `schema` construction into a `buildSchema(roster)` called inside (the `agent` description enumerates `roster.list()`); `describeSpecialists(roster)`, `shortDescription` from `roster`; `permissionSubject` closes over `roster.resolve` and returns `` specialist.source === 'builtin' ? `${charter}:${workDir}` : `${charter}:${workDir}:file:${specialist.id}` ``; :287 and :366 use `roster.resolve`. WHY on the enum: "the roster is per project folder now (plan 1c) — a module-level enum would show every session the same list." WHY on the subject: "a grant remembered for the built-in Worker must never auto-hire a helper some repo shipped — the file can say anything, and the provenance line only helps if the card is shown. Built-ins keep the old shape so no existing grant is lost."
- [ ] **Step 4: `harness-session.ts`.** `syncTaskTool`: when wanted, ALWAYS `this.toolByName.set('Task', createTaskTool(this.opts.specialistRoster ?? BUILTIN_ROSTER))` (drop the `has` guard for Task only; ModelSearch keeps it). WHY: "rebuilt at every turn start from the in-memory catalog — identical roster ⇒ identical description ⇒ no prompt-cache cost; changed roster ⇒ new one; no version counter to keep honest. buildAiTools runs at turn start, never mid-turn (spec §3)."
- [ ] **Step 5: `native-session-host.ts`.** ctor param. `create()`/`resume()`: `await this.specialistCatalog.ensureFresh(cwd)` **before** `toolWiring` (WHY: "no session ever ships the model an empty roster"). `toolWiring` returns `specialistRoster: this.specialistCatalog.roster(cwd)`. In the turn drainer, immediately before a ROOT session's turn is dispatched: `await this.specialistCatalog.ensureFresh(entry.cwd)` (WHY: "a file dropped in since the last turn is offered on THIS turn — the fingerprint check is a handful of stats; children never trigger it, their roster is fixed at spawn"). No teardown hook. :684 → `this.specialistCatalog.roster(parent.cwd).resolve(agentType)`; :1368 likewise with the parent's cwd. Existing error copy at :685 already says "no longer available (it may have been removed from the roster)" — keep. Known and accepted (say so in the WHY): Settings' Refresh mid-turn changes what `resolve` returns for a hire later in that same turn — the consent card renders the same fresh definition, so what is shown still equals what spawns; only the Task *description* the model read is one edit behind.
- [ ] **Step 6: `ipc-handlers.ts`.** `const specialistCatalog = new SpecialistCatalog({ home: nativeHome });` passed as the new trailing arg.
- [ ] **Step 7: Run** the three test files + `npx vitest run tests/tool-registry-manifest.test.ts tests/harness-session*.test.ts` → PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(specialists): per-cwd roster — catalog loaded before the Task tool exists, re-read at turn start on change, Task tool rebuilt each turn, per-file hire subject, R12 pinned"`

---

### Task 5: Notes and stops from the user (on the run record); the model on the record

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (`steerSpecialist` :590-606, `interruptSpecialist` :620-643, `recordDelegationStart` :846-871, ledger construction :1865)
- Modify: `desktop/src/main/harness/specialists/limits.ts` (add `SPECIALIST_NOTE_MAX_CHARS = 2000`)
- Modify: `desktop/src/main/harness/tools/types.ts` (`SpecialistSpawnOpts` :13-36 — add `model?`)
- Modify: `desktop/src/main/harness/tools/task.ts` (:395-435 — compute `model` from the resolution; pass in spawn opts)
- Modify: `desktop/src/shared/types.ts` (new `SpecialistsEvent`)
- Test: `desktop/tests/native-session-host.test.ts`, `desktop/tests/task-tool.test.ts`

**Interfaces:**

```ts
// shared/types.ts — ONE kind. Notes are on run.notes; there is no note message. `kind` stays so a future kind is additive.
export type SpecialistsEvent = { kind: 'run'; sessionId: string; run: SpecialistRunView };
// native-session-host.ts
steerSpecialist(parentId: string, childId: string, text: string, from: 'user' | 'assistant' = 'assistant'): SpecialistManageOutcome;
steerFromUser(parentId: string, childId: string, text: string): { ok: true } | { ok: false; error: string };
interruptFromUser(parentId: string, childId: string): { ok: true } | { ok: false; error: string };
// tools/types.ts
SpecialistSpawnOpts.model?: SpecialistRunView['model'];
```

- [ ] **Step 1: Failing tests.** `native-session-host.test.ts`: `'ledger changes surface as specialists-event {kind:run} with a SpecialistRunView (no delivery bookkeeping fields)'` (spawn a background child; collect host emits); `'steerSpecialist appends the note to the record for a LIVE delivery (one write) and for a PARKED steer (the same write as the parked steer) — the run event carries it either way'`; `'steerFromUser: empty → error, 2001 chars → error naming the limit and the length, foreign childId → error, ok → {ok:true}'`; `'interruptFromUser mirrors the outcome mapping'`; `'the spawn-time model lands on the record and in the run view'`. `task-tool.test.ts`: `'Task passes model {label: modelId, via: tier|named|parent, fallback} into spawn opts'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Host.** Ledger constructed with the listener: `new DelegationLedger(nativeHome, (cwd, parentId, changed) => { for (const rec of changed) this.emit('specialists-event', { kind: 'run', sessionId: parentId, run: toRunView(rec) }); })`. `steerSpecialist(..., from)`: `const note = { text, from, at: Date.now() }`; delivered branch → `void this.ledger.appendNote(...)` (fire-and-forget with the `.catch(log)` shape at :599); parked branch → `void this.ledger.appendMissedSteers(parentCwd, parentId, childId, [text], note)` (**one write**). WHY: "the note is recorded when it is ACCEPTED, whichever way it travels; the card learns of it from the run record the ledger emits (spec §2)." `steerFromUser`: `const t = text.trim(); if (!t) return { ok: false, error: 'The note is empty.' }; if (t.length > SPECIALIST_NOTE_MAX_CHARS) return { ok: false, error: `Notes are limited to ${SPECIALIST_NOTE_MAX_CHARS.toLocaleString()} characters — this one is ${t.length.toLocaleString()}.` };` then map `steerSpecialist(parentId, childId, t, 'user')`: `not-yours` → `'That helper isn’t part of this conversation.'`; `not-running` → `'This helper has already finished, so a note can’t reach it.'`; `ok` → `{ ok: true }`. `interruptFromUser` same mapping with `'This helper has already finished.'`. `recordDelegationStart` copies `model: opts.model`.
- [ ] **Step 4: `task.ts`.** After the resolution block (:435): `const model = { label: resolvedBinding?.modelId ?? ctx.binding.modelId, via: requestedModel === 'parent' ? 'parent' : typeof requestedModel === 'object' ? 'named' : requestedModel, fallback: !!resolution?.fellBack }` — `label` is the model id (the only honest label available here; Settings resolves pretty names from the catalog); pass `model` in both spawn opts sites (foreground + background). WHY comment names the honesty point.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(specialists): run feed off the ledger, notes on the record, user-facing steer/stop with the 2,000-char cap, model on the record"`

---

### Task 6: Broker — `PermissionHeld` on the 5-minute flip (live + replayed); `parentToolCallId` on the specialist ask

**Files:**
- Modify: `desktop/src/main/harness/permission-broker.ts` (`AskRequest.specialist` :47; `ask()` timer :177-182; Task 0's `pendingEventsFor`)
- Modify: `desktop/src/main/harness/specialists/child-ask-router.ts` (`ChildAskRouterDeps` :50-67; the `specialist:` object :87)
- Modify: `desktop/src/main/harness/native-session-host.ts` (the `childAskRouter({...})` wiring :2582-2586 — it is inside the builder that already receives `parentToolCallId`)
- Test: `desktop/tests/native-permission-broker.test.ts`, `desktop/tests/specialist-child-ask-router.test.ts`

**Interfaces:**
- Produces: `AskRequest.specialist?: { childId: string; agentType: string; title: string; parentToolCallId: string }`; a hook-event type `'PermissionHeld'` with `payload: { _requestId }` emitted exactly when `entry.timedOut` flips, and re-emitted by `pendingEventsFor` right after the `PermissionRequest` for an entry whose hold already flipped.

- [ ] **Step 1: Failing tests.** Broker: `'the hold timeout emits PermissionHeld with the requestId, keeps the entry pending, and a later respond() still routes to the late handler'` (`timeoutMs: 5`, `onTimeout` returning a deny; assert emit order: `PermissionRequest`, then `PermissionHeld`; assert `pending` still has it); `'pendingEventsFor re-emits PermissionHeld right after the PermissionRequest for an entry whose hold already flipped — a reload must not turn a held ask back into a fresh one'`. Router: `'the routed ask carries parentToolCallId on specialist'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** In the timer callback, after `entry.timedOut = true; resolve(onTimeout());` add `this.emit('hook-event', { sessionId: req.sessionId, type: 'PermissionHeld', payload: { _requestId: requestId }, timestamp: Date.now() });` WHY: "the renderer's nested row must SAY the helper carried on (spec R3) — before 1c the flip was silent and the card looked unchanged." In `pendingEventsFor`: for each entry push the rebuilt `PermissionRequest`, then, if `entry.timedOut`, a `PermissionHeld` for the same `_requestId` (WHY: "held is a state the row shows (R3); the replay has to restore the state, not just the buttons"). Router deps `+ parentToolCallId: string`, spread into `specialist`. Host wiring passes `parentToolCallId`. (`pendingEventsFor` automatically carries the new `specialist.parentToolCallId` via the stored `req`; the phone's connect-time `hookBuffers` already replays every recent hook event, so it gets `PermissionHeld` for free.)
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): PermissionHeld hook event on the hold flip and after a replay; parentToolCallId rides the routed ask"`

---

### Task 7: Thinking rows — `assistant-thinking` **with text** re-emits as a display copy (live + replay)

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (`SUBAGENT_DISPLAY_TYPES` :112 + WHY :96-111; `mergeChildEvents` filter :151; live copy guard :2645)
- Modify: `.claude/rules/native-specialists.md` (Task 15 rewrites the "Only tool-use/tool-result/assistant-text" line — noted here so the two land together)
- Test: `desktop/tests/specialist-run.test.ts`, `desktop/tests/native-session-host.test.ts` (wherever `mergeChildEvents` is pinned)

**Interfaces:**
- Produces: `export function isSubagentDisplayEvent(e: TranscriptEvent): boolean` = `SUBAGENT_DISPLAY_TYPES.has(e.type) || (e.type === 'assistant-thinking' && typeof e.data.text === 'string' && e.data.text.length > 0)`. The Set itself stays exactly three.

- [ ] **Step 1: Failing tests.** `'a child’s assistant-thinking WITH text reaches the parent as a stamped copy (parentAgentToolUseId + agentId)'`; `'a payload-less heartbeat, a stallWarning, and a toolPreparing thinking event never do'`; `'mergeChildEvents replays text-bearing thinking, never heartbeats'` (session-store drops payload-less ones from disk anyway — assert with an in-memory events array).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the predicate; use it at both sites; extend the WHY block: "plan 1c adds ONE more shape — assistant-thinking with text — because a helper's reasoning belongs in ITS card's Thinking row (R6), never in the parent's bubble. Heartbeats/stall/preparing payloads stay out: they would render as the parent's own status."
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): child reasoning re-emits as a stamped display copy — text-bearing thinking only"`

---

### Task 8: The `specialists:*` channels across five surfaces + the push channel + typed bridge

**Files:**
- Modify: `desktop/src/shared/types.ts` (`IPC` const near :1325 — add five request + one push)
- Modify: `desktop/src/main/ipc-handlers.ts` (handlers next to `PERMISSIONS_*` :2600-2610; push forwarding next to `hook-event` :2449-2457; `setNativeRuntime` :2470 — add `specialistCatalog`)
- Modify: `desktop/src/main/preload.ts` (`specialists: {…}` after `permissions` :1224; `on.specialistEvent` in the `on` block near :446 — return an unsubscribe)
- Modify: `desktop/src/renderer/remote-shim.ts` (`specialists` block after `permissions` :1578-1587, object payloads; push `case 'specialists:event'` in the switch at :833; `on.specialistEvent` at :836 area returning an unsubscribe)
- Modify: `desktop/src/main/remote-server.ts` (five `case`s after `permissions:remove-project` :981; forward the push via `broadcast`)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (not-implemented list :3737-3744 — five request channels + a comment that `specialists:event` is outbound-only, the `native:model-state` precedent)
- Modify: `desktop/src/renderer/hooks/useIpc.ts` (typed `specialists` member after `permissions` :299-305; `on.specialistEvent` at :53-62)
- Modify: `desktop/src/main/harness/native-session-host.ts` (`getDelegatedModels()`, `setDelegatedModel()`)
- Modify: `desktop/src/main/harness/specialists/delegated-models.ts` (`delegatedModelsView` helper)
- Test: `desktop/tests/ipc-channels.test.ts` (clone the `permissions:* channel parity` describe :1011-1042), `desktop/tests/specialist-delegated-models.test.ts`, `desktop/tests/native-session-host.test.ts`

**Interfaces:**

```ts
// IPC
SPECIALISTS_LIST: 'specialists:list',                 // (opts?: { cwd?: string; ensurePersonalFolder?: boolean }) → SpecialistsListResult — ALWAYS re-reads (catalog.reload)
SPECIALISTS_DELEGATED_GET: 'specialists:delegated-get',   // () → DelegatedModelsView
SPECIALISTS_DELEGATED_SET: 'specialists:delegated-set',   // (tier, binding | null) → { ok: true } | { ok: false; error: string }
SPECIALISTS_STEER: 'specialists:steer',               // (sessionId, childId, text) → { ok } | { ok: false; error }
SPECIALISTS_INTERRUPT: 'specialists:interrupt',       // (sessionId, childId) → same
SPECIALISTS_EVENT: 'specialists:event',               // push → SpecialistsEvent
// preload (positional) / remote-shim (object payload { cwd, ensurePersonalFolder } / { tier, binding } / { sessionId, childId, text })
window.claude.specialists: {
  list(opts?: { cwd?: string; ensurePersonalFolder?: boolean }): Promise<SpecialistsListResult>;
  getDelegatedModels(): Promise<DelegatedModelsView>;
  setDelegatedModel(tier: 'budget' | 'frontier', binding: { providerId: string; modelId: string } | null): Promise<{ ok: true } | { ok: false; error: string }>;
  steer(sessionId: string, childId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }>;
  interrupt(sessionId: string, childId: string): Promise<{ ok: true } | { ok: false; error: string }>;
}
window.claude.on.specialistEvent(cb: (e: SpecialistsEvent) => void): () => void;
// shared/types.ts
export interface SpecialistsListResult { definitions: SpecialistDefinitionView[]; skipped: { path: string; source: 'personal' | 'claude-code'; error: string }[]; folders: { personal: string; claudeUser: string; project?: string } }
// SpecialistDefinitionView: source narrows to 'builtin' | 'personal' | 'claude-code'; `shadows` REMOVED; add `offered: boolean`; add `fullDescription?: string`
// delegated-models.ts
export function delegatedModelsView(designated: DelegatedModels, catalog: CatalogModel[] | null): DelegatedModelsView;  // label = catalog row label ?? modelId
// host
async getDelegatedModels(): Promise<DelegatedModelsView>;    // uses this.toolServices?.modelCatalog for labels
async setDelegatedModel(tier, binding | null): Promise<{ ok: true } | { ok: false; error: string }>;  // binding must match a catalog row (providerId + id) — else { ok:false, error: `"${modelId}" isn’t in the model list right now — pick it from the list.` }; null clears
```
`specialists:list` = `await catalog.reload(cwd)` (or `ensurePersonalFolder()` first when asked) then `catalog.snapshot(cwd)` → `SpecialistDefinitionView[]` (`definition` fields + `source` + `path` + `warnings` + `offered` + `fullDescription`).

- [ ] **Step 1: Failing tests.** `ipc-channels.test.ts`: `describe('specialists:* channel parity', …)` — five request channels across all five surfaces (clone the permissions block verbatim, `NEW_TYPES` = the five request channels; a sixth `it` asserts `'specialists:event'` is in preload + remote-shim + ipc-handlers only). `specialist-delegated-models.test.ts`: `'delegatedModelsView resolves labels from the catalog and falls back to the model id'`. `native-session-host.test.ts`: `'setDelegatedModel refuses an id absent from the catalog and never writes'`, `'clears with null'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** all surfaces per the `permissions:*` precedent (handlers: `ipcMain.handle(IPC.SPECIALISTS_STEER, async (_e, sessionId, childId, text) => nativeHost.steerFromUser(sessionId, childId, text))` etc.; WS: `case 'specialists:steer': this.respond(ws, type, id, this.nativeRuntime ? this.nativeRuntime.nativeHost.steerFromUser(payload.sessionId, payload.childId, payload.text) : { ok: false, error: 'The assistant runtime isn’t connected.' })`; push: `nativeHost.on('specialists-event', (ev) => { sendForSession(ev.sessionId, IPC.SPECIALISTS_EVENT, ev); remoteServer?.broadcast({ type: 'specialists:event', payload: ev }); })`). Kotlin: five strings in the not-implemented list with a two-line WHY (desktop-only until M8, same as `permissions:*`).
- [ ] **Step 4: Run** the parity test + `npx tsc --noEmit` → PASS. `rg -n '"specialists:' app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` must show five lines.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): specialists:* channels on all five surfaces + the specialists:event push, typed bridge"`

---

### Task 9: Run replay on attach + remote late-join buffer

The phone client does NOT use the transcript-replay path (it hydrates through `session:history`), so run records reach it the way permission asks already do — the connect-time buffer (`hookBuffers`, `remote-server.ts:448-461`). Same mechanism, one more map.

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` (new `specialistRunsFor(sessionId): SpecialistRunView[]`)
- Modify: `desktop/src/main/ipc-handlers.ts` (`TRANSCRIPT_REPLAY` handler :2484-2500)
- Modify: `desktop/src/main/remote-server.ts` (buffer like `hookBuffers`; replay in `replayBuffers` :751-756)
- Test: `desktop/tests/native-session-host.test.ts`; `desktop/tests/remote-server*.test.ts` (whichever pins `replayBuffers`)

- [ ] **Step 1: Failing tests.** `'specialistRunsFor returns toRunView of every ledger record for the parent (max 30 by budget) and [] for an unknown session'`; remote: `'a new client receives the latest specialists:event {kind:run} per child, then live ones'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Host: `ledger.listFor(cwd, sessionId).map(toRunView)` (cwd from `this.live` — `getHistory` already returns null for a non-live session, so replay only happens when it IS live). Handler: after the history loop, before `TRANSCRIPT_REPLAY_COMPLETE`: `for (const run of nativeHost.specialistRunsFor(sessionId)) evt.sender.send(IPC.SPECIALISTS_EVENT, { kind: 'run', sessionId, run });` — notes ride on `run.notes`. WHY: "the card's status is its run record (R2); a reload must rebuild it from the ledger the same way it rebuilds tool cards from the JSONL." Remote-server: `specialistRunBuffers: Map<sessionId, Map<childId, SpecialistsEvent>>` filled from the broadcast hook, replayed per client in `replayBuffers` after the hook buffers.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): replay run records after a transcript replay; remote clients get the latest run per helper on connect"`

---

### Task 10: Renderer — typed bridge everywhere, `MOCK_ONLY` emptied, list shape, per-cwd definition lookup, Open folder via `shell.openPath`, provenance, no Always-allow on file-defined hires

**Files (branch):**
- Modify: `desktop/src/renderer/hooks/useSpecialists.ts` (`loadRoster` :115-135 — expects `SpecialistsListResult`; drop `(window as any)`; per-cwd cache; new `useSpecialistDefinition`)
- Modify: `desktop/src/renderer/components/SpecialistsSection.tsx` (Open folder :157 → `window.claude.shell.openPath(folders.personal)`; group labels; `list({ ensurePersonalFolder: true, cwd })` on mount; provenance + `offered` on rows)
- Modify: `desktop/src/renderer/components/SpecialistEnvelope.tsx` (`TaskConsentBlock` :8 passes the session's cwd — it is already computed a few lines down from `sessionCwd[sessionId]`, hoist it; provenance line — `source` + `path` are then in hand)
- Modify: `desktop/src/renderer/components/ToolCard.tsx` (:1181 `suppressAlwaysAllow` — add the file-defined-hire case; ToolCard calls `useSpecialistDefinition(sessionCwd, agent)` for a Task hire — the same hook `TaskConsentBlock` uses)
- Modify: `desktop/src/renderer/components/specialists/SpecialistActions.tsx` (:26, :35 typed calls)
- Modify: `desktop/src/renderer/App.tsx` :1042-1055 and `components/buddy/BubbleFeed.tsx` :294-310 (typed `on.specialistEvent`, unsubscribe function instead of `off`; delete the `kind === 'note'` branch)
- Modify: `desktop/src/renderer/state/chat-types.ts` (delete the `SPECIALIST_NOTE` action; fix the `specialists:run-changed` comment at :516) and `desktop/src/shared/types.ts` (comment at :411 — same stale channel name)
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` (:530-561 — `list` returns `{ definitions, skipped: [], folders }`; delete `openFolder`; `steer` appends to the RUN's `notes` and emits `{kind:'run'}` instead of a note event; `HAND_WRITTEN` :28-29), `mock-only.ts` (delete all seven specialists rows), `fixtures/specialists.ts` (drop `shadows`, add `offered: true`, sources `builtin|personal|claude-code`)
- Test: `desktop/tests/workbench-mock-contract.test.ts` (existing — must go green), `desktop/tests/workbench-fixture-actions.test.ts`; Create `desktop/tests/specialist-envelope.test.tsx` (RTL); `node scripts/workbench-boot-check.mjs`

- [ ] **Step 1: Run the contract test first** — `npx vitest run tests/workbench-mock-contract.test.ts` → FAIL on `'no MOCK_ONLY entry has since gained a real channel'` (Task 8 landed the preload members). This is the failing test for this task.
- [ ] **Step 2: Implement.**
  - **Cache shape:** `rosterCache` becomes `Map<cwdKey, { status: 'loading' } | { status: 'ready'; result: SpecialistsListResult } | { status: 'failed'; error: string } | { status: 'unavailable' }>` with `cwdKey = cwd ?? ''`; `unavailable` when the bridge rejects with the not-implemented shape the remote-shim/Kotlin path produces (pin the exact message the shim throws in a test). Export `useSpecialistRoster(cwd?: string)` and `refreshSpecialistRoster(cwd?: string)`.
  - **Who passes cwd:** `SpecialistsSection` gets it from the same place `SettingsPanel` already knows the active conversation (the active session's `cwd` in the chat store — `rg -n "activeSession|sessions.get\(active" src/renderer/components/SettingsPanel.tsx` to find the accessor; if Settings has no active session, omit `cwd` and the list shows global sources only). `TaskConsentBlock` and `ToolCard` pass the session's cwd.
  - **`useSpecialistDefinition(cwd, agentId)`:** wraps the lookup; when the cwd's cache is `ready` but does not contain `agentId`, calls `refreshSpecialistRoster(cwd)` **once per (cwd, agentId)** (a `Set` of misses already retried — a genuinely unknown id costs one extra list call, never a loop). WHY: "the backend re-reads files at every turn start; the card has no push telling it that happened, so a hire of a helper the card has never seen is the signal to re-read."
  - **Always-allow off for file-defined hires:** `ToolCard.tsx:1181` adds `|| (tool.toolName === 'Task' && !tool.input?.task_id && hireDefinition?.source !== 'builtin')` — **default-closed**: while the definition is unknown the button is hidden, and appears once the lookup says built-in (the built-ins are in the very first list result, so a Worker hire always shows it). WHY comment: the Global Constraint, verbatim.
  - Settings' first `list` call passes `{ ensurePersonalFolder: true, cwd }` (WHY: spec §2 — the ONE deliberate bend of the "~/.youcoded appears on first write" convention, so Open folder can use `shell.openPath`). Open folder → `void window.claude.shell.openPath(result.folders.personal)`. Group labels: `builtin` "Built in", `personal` "Your specialists", `claude-code` "Claude Code agents".
  - **Provenance:** a one-line `definedBy(view)` helper in `useSpecialists.ts` → `"Built in"` / `` `Your specialists folder · ${basename(path)}` `` / `` `This project's .claude/agents/${basename(path)}` `` / `` `Your ~/.claude/agents/${basename(path)}` `` (project vs user decided by whether `path` starts with `folders.project`); rendered as the row's subtitle in Settings AND as a line in `SpecialistEnvelope` under the name. `offered: false` rows render greyed with their warning; skipped files render under their group with the error, greyed, "not offered to the assistant".
- [ ] **Step 3: Run** `npx vitest run tests/workbench-mock-contract.test.ts tests/workbench-fixture-actions.test.ts tests/specialist-envelope.test.tsx && node scripts/workbench-boot-check.mjs` → PASS. `specialist-envelope.test.tsx` cases: `'a project-defined helper resolves when the card passes its cwd'`, `'an id missing from a ready cache triggers exactly one refresh, and a second miss for the same id does not'`, `'a built-in hire offers Always allow; a personal or claude-code hire never does; an unresolved hire does not either'`. `npx tsc --noEmit` clean (the typed bridge will surface every `(window as any)` leftover — remove them all: `rg -n "as any\).claude\?\.specialists" src/renderer` must be empty; `rg -n "run-changed|SPECIALIST_NOTE" src` must be empty).
- [ ] **Step 4: Commit** — `git commit -m "feat(specialists): renderer on the real bridge — MOCK_ONLY emptied, per-cwd definition lookup, provenance on card + Settings, no Always-allow on file-defined hires, Open folder via shell.openPath"`

---

### Task 11: Reducer — note rows rebuilt from `run.notes`; identical views short-circuit; pin the branch's ask plumbing

**Files (branch):**
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (`SPECIALIST_RUN_CHANGED` :1789-1811; delete `SPECIALIST_NOTE` :1813-1831)
- Test: `desktop/tests/chat-reducer-specialists.test.ts` (create — the branch has NO renderer specialist tests)

**Interfaces:**
- Produces: `function noteSegmentsFrom(run: SpecialistRunView): SubagentSegment[]` (module-private) — one `note` segment per `run.notes[i]`, id `` `sa-note-${run.childId}-${i}` `` (index, not timestamp — two notes in one millisecond stay two rows), in order. `SPECIALIST_RUN_CHANGED` **replaces** the card's existing note segments with this list (drop every `type === 'note'` segment, then splice the fresh ones in at their `timestamp` order among the others). No dedupe logic exists. **Short-circuit:** if the incoming `run` deep-equals the card's current `specialistRun`, return the state unchanged — delivery bookkeeping (claim / mark-attempted / confirm / release) legitimately changes the ledger record and fires the listener, but `toRunView` strips those fields, so a delivery cycle pushes up to four byte-identical views; the reducer, not the emit path, absorbs them.

- [ ] **Step 1: Failing tests** (`chat-reducer-specialists.test.ts`, seeding a session with one Task card + `specialistRun`): `'SPECIALIST_RUN_CHANGED with two notes yields two rows; the same event again yields two rows (idempotent by construction)'`; `'a run with a third note yields three rows in timestamp order'`; `'two notes with the same timestamp and text are TWO rows'`; `'PERMISSION_HELD sets askHeld on the nested row and nowhere else'` (pin the branch); `'the sa-perm- placeholder is reclaimed when the tool-use event lands after the ask'` (pin the branch's :430-440 reclaim); `'a run event for an unknown parentToolCallId is dropped, never a stray card'`; `'a run view identical to the card’s current one returns the SAME state object (no churn)'`; `'replay then live: a newer live run view lands after a replayed one and wins; the replayed one re-sent afterwards does not regress it or duplicate note rows'` (the main-process replay loop is synchronous, so a live event cannot interleave INSIDE it — this covers the window right after `TRANSCRIPT_REPLAY_COMPLETE`).
- [ ] **Step 2: Run** → FAIL on the first three and the last two.
- [ ] **Step 3: Implement.** WHY: "notes live on the run record and only there; rebuilding the rows from `run.notes` on every update is idempotent for free — no merge, no key to get wrong."
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): note rows rebuilt from run.notes; identical run views short-circuit; ask plumbing pinned by tests"`

---

### Task 12: Card copy — held ask on a finished helper (R3), note cap in `SpecialistActions`

**Files (branch):**
- Modify: `desktop/src/renderer/components/specialists/SpecialistAskBlock.tsx` (:75-79)
- Modify: `desktop/src/renderer/hooks/useSpecialists.ts` (classification :75-82 — a finished run with a held ask stays `needs-you`, but expose `run.status` to the ask block)
- Modify: `desktop/src/renderer/components/specialists/SpecialistActions.tsx` (:20-70)
- Test: Create `desktop/tests/specialist-ask-block.test.tsx`, `desktop/tests/specialist-actions.test.tsx` (RTL, same style as `permissions-section.test.tsx`)

- [ ] **Step 1: Failing tests.** Ask block: `'held + running: "No answer for 5 minutes, so {first} carried on without this. Yes still works — it lands as a follow-up."'`; `'held + finished: "{first} has finished; a Yes now tells the assistant, which can send them back."'` (spec R3 wording with a neutral pronoun — the name pool is mixed and the renderer cannot know; test uses `getByTestId('nested-ask-held')`); `'external (outside-the-folder) ask explains why there is no Always Allow'` (pin existing). Actions: `'the counter shows N / 2,000 and Send is disabled past 2,000'`; `'a backend {ok:false,error} shows the error text verbatim'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `SpecialistAskBlock` receives `runStatus` from the card's `specialistRun.status`; two copy branches. `SpecialistActions`: `const MAX = 2000;` counter `<span className="text-3xs text-fg-muted">{note.length.toLocaleString()} / {MAX.toLocaleString()}</span>`, `disabled={busy !== null || !note.trim() || note.length > MAX}`; **no `maxLength` on the textarea** (a `maxLength` silently truncates a paste — the counter would read "2,200 / 2,000" while the rest vanished; the counter + disabled Send already explain the cap). WHY comments on both.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): held-ask copy for a finished helper; note counter + 2,000-char Send gate"`

---

### Task 13: Settings → Specialists — loading / failed / not-available, tier pickers on the real channels

**Files (branch):**
- Modify: `desktop/src/renderer/components/SpecialistsSection.tsx` (tier load :54-81; roster render :129-166)
- Test: Create `desktop/tests/specialists-section.test.tsx`

No new component: the desktop-only look is `EmptyState` (`components/ui/states.tsx:61`, `{ message, action }`) with the message below.

- [ ] **Step 1: Failing tests** (RTL, mock `window.claude.specialists`): `'loading shows LoadingState("specialists"), never a bare "Loading…"'`; `'a rejected list shows ErrorState recoverable with the real error text and Retry re-calls list'`; `'a not-implemented list shows the desktop-only state (no spinner, no Retry)'`; `'a rejected getDelegatedModels shows the tier error, not "not set"'`; `'setDelegatedModel {ok:false} reverts the picker and shows the error'` (pin the branch's optimistic revert); `'roster groups render Built in / Your specialists / Claude Code agents with the definedBy line; skipped and not-offered files show their reason'`; `'the section contains no shadows text'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Roster: switch on `useSpecialistRoster(cwd).status` → `LoadingState what="specialists"` / `ErrorState mode="recoverable" message={error} onRetry={() => refreshSpecialistRoster(cwd)}` / `<EmptyState message="Specialists run on the desktop app. Open Settings there to add or edit them." />` / the list. Rows whose `fullDescription` is set show it (the description the assistant sees was shortened — the warning says so). Tiers: `loadTiers` catch → `setTierError(<real message>)` (never silently "unset"); on the not-implemented shape → the whole section is the desktop-only state (one check, top of the component). Footer copy: "Files are re-read each time you send a message; Refresh to re-read now." Copy per app convention: minimal, no jargon.
- [ ] **Step 4: Run** → PASS. Then `bash scripts/run-workbench.sh` — Settings → Specialists in scenarios `default` and `no-providers`; **stop and flag for Destin** to eyeball the three states (interactive verification is his, per CLAUDE.md).
- [ ] **Step 5: Commit** — `git commit -m "feat(specialists): Settings tells loading, failed, and desktop-only apart; tier errors are shown, never swallowed"`

---

### Task 14: End-to-end on a real hire (dev instance) + hands-on checklist for Destin

**Files:**
- Create: `docs/active/handoffs/2026-08-16-specialists-1c-testing-checklist.md` (workspace repo — mirrors 1b's checklist shape)

- [ ] **Step 1:** `bash scripts/verify.sh worktrees/specialists-1c` → green; `bash scripts/run-dev.sh worktrees/specialists-1c --label "Specialists 1c" --offset 2 --profile specialists-1c`.
- [ ] **Step 2: Author the checklist** — one numbered test per rule R1–R12 plus §3: (1) background hire → card spinner + "Working in the background · elapsed", chip "1 specialist"; (2) helper asks → nested row with buttons on the card AND in the popup; answer in the popup → both clear; (3) **a real five-minute wait** (the hold is a plain constant with no override — leave a helper mid-question and come back) → held copy; (4) Send a note from the card → note row; from the popup → same; 2,001 chars → refused with the limit; (5) Stop → Stopped + elapsed; (6) reload the window mid-run (Ctrl+R in the DEV window only) → card status and notes come back; pending ask comes back with buttons (Task 0); (7) drop `~/.youcoded/specialists/docs-writer.md` → Settings shows it (after Refresh), the very next message's Task can hire it, its consent card lists ITS tools AND says "Your specialists folder · docs-writer.md"; edit its `tools:` while it runs → running card unchanged, next hire changes; (8) drop `<cwd>/.claude/agents/code-reviewer.md` with `tools: Read, Grep, MultiEdit, mcp__x__y` and `permissionMode: bypassPermissions` → Settings warnings name the two removed tools and the ignored permissionMode; consent card says "This project's .claude/agents/code-reviewer.md"; (9) create `.claude/agents/worker.md` → Settings shows it skipped with the collision message; the built-in Worker still hires; (9b) **grants stay per helper:** Always-allow a built-in Worker hire in the folder → hire the project's `code-reviewer` (read-write) → the consent card STILL appears, with no Always-allow button, saying "This project's .claude/agents/code-reviewer.md"; then a second Worker hire is auto-approved as before; (9c) reload the DEV window with a held ask on screen → it comes back still saying the helper carried on (not as a fresh question); (9d) two conversations open in the same folder → close one → the other's next hire still lists the project's helpers; (10) Settings tier picker → set budget → a `model: budget` helper's card says "· on <id>"; (11) Thinking row on a helper using a reasoning model; parent bubble stays clean; (12) Android debug APK → Settings → Specialists shows the desktop-only state.
- [ ] **Step 3:** Run tests 1, 2, 4, 5, 7, 8, 9, 9b, 9d yourself in the dev window (they need no timing); record what you saw in the checklist's "agent-run" column; leave 3, 6, 9c, 10, 11, 12 for Destin with a note on why (five-minute wait / device / interactive).
- [ ] **Step 4:** Shut the dev instance down. Commit the checklist to the workspace repo: `git commit -m "docs(handoff): specialists 1c hands-on checklist"`.

---

### Task 15: Docs, rules, MAP, ROADMAP, spec/handoff lifecycle

**Files (workspace repo unless noted):**
- Modify: `.claude/rules/native-specialists.md` (add a "Specialists (plan 1c)" section: emit-in-the-ledger chokepoint (guard: the one-`mutateJson` source test); catalog loaded before the Task tool + re-read at turn start on file change + rebuilt per turn; no watchers, per-file fingerprint; no catalog teardown — cwds are shared; reserved ids / no shadowing; offered cap + description cap; provenance on the card; hire grants: built-in subject unchanged, file-defined subject carries `:file:<id>` and the card never offers Always-allow for it (guard: the `task-tool.test.ts` subject case + `specialist-envelope.test.tsx`); the card's definition lookup is per cwd with a one-shot refetch on miss; §3.2 mapping lives in `definition-files.ts` with its test as the guard; `isSubagentDisplayEvent` widening; `PermissionHeld` (emitted on the flip AND replayed by `pendingEventsFor`); notes on the run record only; popup = management surface; R12. Rewrite the 1a bullet "Only tool-use/tool-result/assistant-text re-emit…" to name the text-bearing-thinking exception. Add `verify:` anchors for `catalog.ts`, `definition-files.ts`, `frontmatter.ts`, the new tests.)
- Modify: `youcoded/docs/native-runtime.md` (new "Specialists (plan 1c)" section, ~40 lines: the channel contract table from spec §2 condensed, the file formats, the mapping table pointer)
- Modify: `docs/MAP.md` (Specialists row: add `catalog.ts`, `definition-files.ts`, `frontmatter.ts`, renderer `SpecialistsChip.tsx` / `SpecialistsSection.tsx` / `SpecialistEnvelope.tsx` / `hooks/useSpecialists.ts`, the new tests)
- Modify: `ROADMAP.md` (`#specialists` items at lines 31, 34, 36, 38: 34/36/38 → `[x]` with the merge sha; 31 → rewritten to depend on a delete-conversation feature; add ideas: promote fg→bg, transcript viewer, project native folder, per-helper tokens/cost, strict per-action toggle, live-updating Settings roster (watchers))
- Modify: `youcoded/desktop/CLAUDE.md` only if the workbench gained a verb (it did not in this plan — skip unless Task 10 added one)
- Move: `docs/active/specs/2026-08-16-native-specialists-plan-1c-design.md` → `docs/archive/specs/`, `status: shipped`; this plan → `docs/archive/plans/`; the 1c handoff → `docs/archive/handoffs/`; parent spec `2026-08-11-native-specialists-design.md` stays active only if stage two is still planned there — check its own status line and update `relates:` paths.

- [ ] **Step 1:** Write the rule + doc + MAP edits; `node scripts/audit-anchors.mjs` → 0 failures.
- [ ] **Step 2:** ROADMAP flips/rewrites (dated, with the sha once known).
- [ ] **Step 3:** After the youcoded PR merges: `git worktree remove worktrees/specialists-1c`, delete the branch locally + remotely, move the three docs, commit + push the workspace repo: `git commit -m "docs: specialists 1c shipped — rule/MAP/ROADMAP/native-runtime updated, spec+plan+handoff archived"`.

---

## Task ordering and parallelization

- **Task 0 first, on its own branch, merged before Task 6.**
- **Lane A (main, sequential):** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. (2 and 3 are pure and can run in parallel with 1; 6 and 7 are independent of each other; 8 depends on 4 + 5.)
- **Lane B (renderer, after 8 lands on the branch):** 10 → 11 → 12 → 13, sequential (they are small; a worktree per task would cost more than it saves).
- **14 after both lanes; 15 alongside 14, finished after merge.**
- One PR for the branch (backend + §7 renderer edits) — the UI was already approved in the workbench; the reviewer's job is the backend contract and the §6 tests.

## Spec coverage (traceability)

| Spec | Tasks |
|---|---|
| R1 nested ask + fold-in | 6, 9 (backend); renderer on branch, pinned in 11 |
| R2 status = run record | 1, 5, 9 |
| R3 held ask | 6, 12 |
| R4 consent envelope from the mapped definition + provenance | 2, 3, 4 (mapped def), 10 (per-cwd lookup, provenance, Always-allow gate) |
| R5 notes / stop, 2,000 cap | 5, 12 |
| R6 thinking rows | 7 |
| R7–R10 header labels, chip, popup | on branch; exercised in 14 |
| R11 Settings | 8, 10, 13 |
| R12 spawn-time definition | 4 |
| §2 contract rows | run → 1/5; notes on the record → 5 + 11; PermissionRequest.parentToolCallId / PermissionHeld → 6; thinking → 7; list / delegated-get / set → 8; steer / interrupt → 5 + 8; open-path → 10 |
| §3 catalog, formats, §3.2 table | 2, 3, 4 |
| §5 grants and safety | 4, 10 (hire subject + Always-allow), 5 (own-children via `locateOwnChild`), 6 |
| §6 tests | every task's Step 1 |
| §7 renderer gaps | 10, 11, 12, 13 (starter file → 3) |
| §8 docs | 15 |

**Type consistency:** `SpecialistNote` (Task 1, `shared/types.ts`) is what `appendNote`/`appendMissedSteers` (1), `steerSpecialist` (5), `noteSegmentsFrom` (11) use; `SpecialistDefinition.source` (2) is what `permissionSubject` (4), `CatalogEntry.source` (3, always equal to it) and `SpecialistDefinitionView.source` (8) carry; `SpecialistRoster` (3) is what `createTaskTool` (4) and `HarnessSessionOpts.specialistRoster` (4) take; `SpecialistsEvent` (5, one kind) is what Tasks 8/9/10 forward; `SpecialistsListResult` (8) is what `useSpecialists` (10) and `SpecialistsSection` (13) read; `model` fields match the branch (`via?`, `fallback?`).
