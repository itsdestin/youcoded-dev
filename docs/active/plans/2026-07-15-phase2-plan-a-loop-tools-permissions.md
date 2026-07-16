---
status: active
---

# Phase 2 Plan A — Agent Loop + Core Tools + Permissions: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HarnessSession v0's tool-less loop with a multi-step agentic turn driver + seven core tools (Read, Write, Edit, Bash, Glob, Grep, TodoWrite) + the permission engine, so "fix this bug in my project" works end-to-end on an OpenRouter frontier model in a dev build.

**Spec:** `docs/active/specs/2026-07-15-phase2-native-harness-design.md` (§2 is this plan's contract — read it first, especially the settled decisions and the review rulings). Research vocabulary: `docs/active/investigations/2026-07-10-harness-design-ideas.md`.

**Architecture:** One turn = a loop of steps; one step = one `streamText` call with tool schemas attached but NO execute functions — the driver collects `tool-call` stream parts, runs the permission gate, executes tools itself, appends results to history, and loops. All UI flows through the frozen transcript-event contract (`tool-use`/`tool-result` events → existing ToolCards; permission asks → the existing hook-event → `PERMISSION_REQUEST` path). Persistence rides the existing SessionStore untouched; resume gains a history-rebuild step.

**Tech Stack:** TypeScript, Electron main process, AI SDK v7 (`ai@^7.0.22`, already pinned), zod v4 (present), `ai/test` mocks (existing pattern), vitest, `@vscode/ripgrep` (new dep), `diff` (new dep, for structuredPatch).

**Working rules that bind every task:** worktree required (Task 0); WHY comments on non-trivial edits; never touch the live app — runtime checks go through `bash scripts/run-dev.sh`; every new IPC channel gets preload + remote-shim + SessionService.kt stub + `ipc-channels.test.ts` rows; the transcript-event emit surface is FROZEN (emit only existing `TranscriptEventType` values with existing data fields).

---

### Task 0: Worktree + dependencies

**Files:** none (setup)

- [ ] **Step 1: Create the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded-worktrees/feat-native-tools -b feat/native-tools
cd ../youcoded-worktrees/feat-native-tools/desktop
```

- [ ] **Step 2: Install deps (fresh install, NOT a junction — remember `git worktree remove` follows junctions on Windows and would wipe the main checkout's node_modules)**

```bash
npm ci
npm install @vscode/ripgrep diff
npm install --save-dev @types/diff
```

- [ ] **Step 3: Baseline test run**

Run: `npm test -- --run`
Expected: full suite green (1771+ tests). If not, STOP — fix master first.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(native): add ripgrep + diff deps for Phase 2 tool suite"
```

---

### Task 1: Verify AI SDK v7 tool-streaming shapes (spike, throwaway test → coupling row)

The whole loop hangs off exact v7 behavior. Pin it BEFORE building on it, exactly like Phase 1 pinned `part.text`.

**Files:**
- Test: `tests/harness-sdk-toolcall-contract.test.ts` (permanent — this is the coupling's pinning test)
- Modify: `../../youcoded/docs/provider-dependencies.md` (from the worktree: `docs/provider-dependencies.md` at repo root)

- [ ] **Step 1: Write the contract test using `ai/test` mocks**

```ts
// tests/harness-sdk-toolcall-contract.test.ts
// Pins the ai@7 behaviors the Phase 2 turn driver depends on:
//  1. tools WITHOUT execute => fullStream emits a 'tool-call' part and the
//     step finishes with finishReason 'tool-calls' (the SDK does NOT loop).
//  2. the 'tool-call' part carries { toolCallId, toolName, input }.
//  3. an assistant message with tool-call parts + a tool message with
//     tool-result parts round-trip through streamText messages.
// If an SDK bump breaks THIS test, fix the driver before anything else.
import { describe, it, expect } from 'vitest';
import { streamText, tool, zodSchema } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

const toolCallChunk = {
  type: 'tool-call' as const,
  toolCallId: 'call-1',
  toolName: 'Read',
  // NOTE: verify against node_modules/ai — v7 raw chunks may carry `input`
  // as a JSON string (`args`) or object. The test asserts what the
  // TRANSFORMED fullStream exposes; adjust the mock chunk shape until the
  // test compiles against the real types, then freeze it.
  input: JSON.stringify({ file_path: '/tmp/x.ts' }),
};

describe('ai@7 tool-call stream contract (provider-dependencies row)', () => {
  it('emits tool-call part and finishReason tool-calls when tool has no execute', async () => {
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-delta', id: 't1', text: 'Let me read that.' },
              toolCallChunk,
              { type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 10, outputTokens: 5 } },
            ],
          }),
        }),
      }),
      tools: { Read: tool({ description: 'read', inputSchema: zodSchema(z.object({ file_path: z.string() })) }) },
      prompt: 'read /tmp/x.ts',
    });
    const parts: any[] = [];
    for await (const p of result.fullStream) parts.push(p);
    const call = parts.find((p) => p.type === 'tool-call');
    expect(call).toBeTruthy();
    expect(call.toolName).toBe('Read');
    expect(call.toolCallId).toBe('call-1');
    expect(call.input).toEqual({ file_path: '/tmp/x.ts' });
    expect(await result.finishReason).toBe('tool-calls');
  });
});
```

- [ ] **Step 2: Run it; iterate the mock chunk shape until it passes against the REAL installed types** (open `node_modules/ai/dist/index.d.ts`, search `ToolCallPart`, `LanguageModelV4StreamPart`). Record what you had to change.

Run: `npx vitest run tests/harness-sdk-toolcall-contract.test.ts`
Expected: PASS

- [ ] **Step 3: Also assert the message shapes the driver will append** (add to the same file):

```ts
  it('accepts assistant tool-call + tool-result messages in history', async () => {
    const messages = [
      { role: 'user' as const, content: 'read it' },
      { role: 'assistant' as const, content: [
        { type: 'text' as const, text: 'Reading.' },
        { type: 'tool-call' as const, toolCallId: 'call-1', toolName: 'Read', input: { file_path: '/tmp/x.ts' } },
      ] },
      { role: 'tool' as const, content: [
        // Verify the v7 field name: output vs result. Freeze whichever compiles.
        { type: 'tool-result' as const, toolCallId: 'call-1', toolName: 'Read', output: { type: 'text' as const, value: '1: hello' } },
      ] },
    ];
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({ chunks: [
            { type: 'text-delta', id: 't1', text: 'done' },
            { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } },
          ] }),
        }),
      }),
      tools: { Read: tool({ description: 'read', inputSchema: zodSchema(z.object({ file_path: z.string() })) }) },
      messages,
    });
    expect(await result.text).toBe('done');
  });
```

Run: `npx vitest run tests/harness-sdk-toolcall-contract.test.ts` → PASS

- [ ] **Step 4: Add the coupling row** to `docs/provider-dependencies.md` under Touchpoints:

```markdown
- **AI SDK v7 tool-call loop surface** — tools passed WITHOUT `execute` make
  `streamText` emit `tool-call` fullStream parts ({toolCallId, toolName,
  input:object}) and finish the step with finishReason `'tool-calls'`; the
  driver executes tools itself and appends assistant tool-call parts + tool
  role messages with `{type:'tool-result', toolCallId, toolName, output:
  {type:'text', value}}`. Field names verified against ai@7.0.22 and PINNED
  by `tests/harness-sdk-toolcall-contract.test.ts` — run it first on any ai
  bump. (harness-session)
```

Adjust the row to what Step 2/3 actually verified.

- [ ] **Step 5: Commit**

```bash
git add tests/harness-sdk-toolcall-contract.test.ts ../docs/provider-dependencies.md
git commit -m "test(native): pin ai@7 tool-call stream + message contract"
```

---

### Task 2: Shared types + IPC channel constants

**Files:**
- Modify: `src/shared/types.ts` (IPC constants block, ~line 919, next to NATIVE_SEND)
- Create: `src/shared/permission-types.ts`

- [ ] **Step 1: Create `src/shared/permission-types.ts`**

```ts
// Phase 2 permission model (spec §2.4). Shared: main evaluates, renderer
// displays mode labels and the deny-listed Always-allow warning.
export type PermissionAction = 'allow' | 'ask' | 'deny';

// Session-level mode for NATIVE sessions (distinct from CC's PermissionMode —
// CC's is PTY-scraped; this is real state owned by NativeSessionHost).
export type NativePermissionMode = 'ask' | 'auto-edit' | 'full-auto';

export interface PermissionRule {
  /** Tool name or '*'; also the synthetic subjects 'doom_loop' | 'max_steps' | 'external_directory'. */
  tool: string;
  /** Glob over the SUBJECT (Bash: command string; file tools: relative path). Absent = matches any. */
  pattern?: string;
  action: PermissionAction;
}

export interface PermissionDecision {
  action: PermissionAction;
  /** True when the winning rule came from the destructive deny-list — drives
   *  the consequence-gated "Always allow" warning (spec §2.4 precedence ruling). */
  denyListed: boolean;
}

// The destructive deny-list: CONFIGURATION, not a tool-layer guard. Ships in
// every mode baseline (Full-auto included). An explicit remembered user rule
// wins over it (spec review ruling #2) — that's why these are 'ask', not 'deny':
// the user stays sovereign, the model never proceeds silently.
export const DESTRUCTIVE_DENY_LIST: PermissionRule[] = [
  { tool: 'Bash', pattern: 'rm *', action: 'ask' },
  { tool: 'Bash', pattern: '* rm *', action: 'ask' },
  { tool: 'Bash', pattern: 'rmdir *', action: 'ask' },
  { tool: 'Bash', pattern: 'del *', action: 'ask' },
  { tool: 'Bash', pattern: 'git push*', action: 'ask' },
  { tool: 'Bash', pattern: 'git reset --hard*', action: 'ask' },
  { tool: 'Bash', pattern: 'sudo *', action: 'ask' },
  { tool: 'Bash', pattern: 'format *', action: 'ask' },
];

/** Mode baselines (spec §2.4 layer 2). Read/search tools are always free. */
export function rulesForMode(mode: NativePermissionMode): PermissionRule[] {
  const readOnly: PermissionRule[] = [
    { tool: 'Read', action: 'allow' },
    { tool: 'Glob', action: 'allow' },
    { tool: 'Grep', action: 'allow' },
    { tool: 'TodoWrite', action: 'allow' },
  ];
  switch (mode) {
    case 'ask':
      return [{ tool: '*', action: 'ask' }, ...readOnly];
    case 'auto-edit':
      return [{ tool: '*', action: 'ask' }, ...readOnly,
        { tool: 'Edit', action: 'allow' }, { tool: 'Write', action: 'allow' }];
    case 'full-auto':
      return [{ tool: '*', action: 'allow' }];
  }
}
```

- [ ] **Step 2: Add the one new IPC constant** in `src/shared/types.ts` next to `NATIVE_SET_BINDING` (line ~921):

```ts
  NATIVE_SET_PERMISSION_MODE: 'native:set-permission-mode',
```

(No new respond channel: native permission responses ride the EXISTING `IPC.PERMISSION_RESPOND` — Task 8 routes it.)

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → clean

```bash
git add src/shared/permission-types.ts src/shared/types.ts
git commit -m "feat(native): permission types, mode baselines, destructive deny-list"
```

---

### Task 3: Truncation service + glob matcher (pure helpers)

**Files:**
- Create: `src/main/harness/tools/truncate.ts`
- Create: `src/main/harness/tools/subject-glob.ts`
- Test: `tests/harness-truncate.test.ts`, `tests/subject-glob.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/harness-truncate.test.ts
import { describe, it, expect } from 'vitest';
import { truncateOutput } from '../src/main/harness/tools/truncate';

describe('truncateOutput', () => {
  it('passes short output through untouched', () => {
    const r = truncateOutput('hello', { maxChars: 100 });
    expect(r.text).toBe('hello');
    expect(r.truncated).toBe(false);
  });
  it('keeps head + tail and appends an actionable trailer', () => {
    const big = 'x'.repeat(50_000);
    const r = truncateOutput(big, { maxChars: 10_000 });
    expect(r.text.length).toBeLessThan(11_000);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('[truncated');
    expect(r.text).toContain('50000 chars total');
  });
  it('caps line count too', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const r = truncateOutput(many, { maxChars: 1_000_000, maxLines: 100 });
    expect(r.text.split('\n').length).toBeLessThanOrEqual(102); // 100 + trailer
    expect(r.text).toContain('[truncated');
  });
});
```

```ts
// tests/subject-glob.test.ts
import { describe, it, expect } from 'vitest';
import { subjectMatches } from '../src/main/harness/tools/subject-glob';

describe('subjectMatches', () => {
  it('matches * within a segmentless subject (command strings)', () => {
    expect(subjectMatches('git push origin master', 'git push*')).toBe(true);
    expect(subjectMatches('git pull', 'git push*')).toBe(false);
    expect(subjectMatches('npm rm cache', '* rm *')).toBe(true);
  });
  it('matches ? and literal dots', () => {
    expect(subjectMatches('a.txt', '?.txt')).toBe(true);
    expect(subjectMatches('ab.txt', '?.txt')).toBe(false);
    expect(subjectMatches('aXtxt', 'a.txt')).toBe(false);
  });
  it('is case-insensitive on the subject (Windows paths, casual commands)', () => {
    expect(subjectMatches('Git Push origin', 'git push*')).toBe(true);
  });
  it('undefined pattern matches everything', () => {
    expect(subjectMatches('anything', undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/harness-truncate.test.ts tests/subject-glob.test.ts` → FAIL (modules missing)

- [ ] **Step 3: Implement**

```ts
// src/main/harness/tools/truncate.ts
// ONE truncation policy for every tool (spec §2.3): head+tail preservation and
// an explicit trailer telling the model HOW to get more — never silent cuts.
export interface TruncateOpts { maxChars: number; maxLines?: number }
export interface TruncateResult { text: string; truncated: boolean }

export function truncateOutput(text: string, opts: TruncateOpts): TruncateResult {
  let out = text;
  let truncated = false;
  if (opts.maxLines) {
    const lines = out.split('\n');
    if (lines.length > opts.maxLines) {
      const head = lines.slice(0, Math.ceil(opts.maxLines * 0.8));
      const tail = lines.slice(-Math.floor(opts.maxLines * 0.2));
      out = [...head, `[... ${lines.length - opts.maxLines} lines omitted ...]`, ...tail].join('\n');
      truncated = true;
    }
  }
  if (out.length > opts.maxChars) {
    const head = out.slice(0, Math.ceil(opts.maxChars * 0.8));
    const tail = out.slice(-Math.floor(opts.maxChars * 0.2));
    out = `${head}\n[...]\n${tail}`;
    truncated = true;
  }
  if (truncated) {
    out += `\n[truncated — ${text.length} chars total. Use offset/limit or a narrower query to see more.]`;
  }
  return { text: out, truncated };
}
```

```ts
// src/main/harness/tools/subject-glob.ts
// Tiny glob for permission SUBJECTS (bash command strings, relative paths).
// Homegrown on purpose: no new dep, and `*` must cross path separators here
// ("git push*" must match "git push origin x") — unlike file globbing.
export function subjectMatches(subject: string, pattern?: string): boolean {
  if (pattern === undefined) return true;
  const rx = new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars EXCEPT * and ?
      .replace(/\*/g, '[\\s\\S]*')
      .replace(/\?/g, '.') + '$',
    'i',
  );
  return rx.test(subject);
}
```

- [ ] **Step 4: Run tests** → PASS
- [ ] **Step 5: Commit** — `git add src/main/harness/tools tests/harness-truncate.test.ts tests/subject-glob.test.ts && git commit -m "feat(native): shared truncation service + permission subject glob"`

---

### Task 4: Permission engine (pure)

**Files:**
- Create: `src/main/harness/permission-engine.ts`
- Test: `tests/permission-engine.test.ts`

- [ ] **Step 1: Write the failing rule-table torture test**

```ts
// tests/permission-engine.test.ts
import { describe, it, expect } from 'vitest';
import { decidePermission } from '../src/main/harness/permission-engine';
import { rulesForMode, DESTRUCTIVE_DENY_LIST } from '../src/shared/permission-types';

const layers = (mode: 'ask' | 'auto-edit' | 'full-auto', remembered = [] as any[]) => ({
  presetRules: [],
  modeRules: rulesForMode(mode),
  denyList: DESTRUCTIVE_DENY_LIST,
  rememberedRules: remembered,
});

describe('decidePermission', () => {
  it('ask mode: reads allow, edits ask', () => {
    expect(decidePermission('Read', 'src/a.ts', layers('ask')).action).toBe('allow');
    expect(decidePermission('Edit', 'src/a.ts', layers('ask')).action).toBe('ask');
    expect(decidePermission('Bash', 'ls', layers('ask')).action).toBe('ask');
  });
  it('auto-edit: edits allow, bash still asks', () => {
    expect(decidePermission('Edit', 'src/a.ts', layers('auto-edit')).action).toBe('allow');
    expect(decidePermission('Bash', 'npm test', layers('auto-edit')).action).toBe('ask');
  });
  it('full-auto allows bash but the deny-list still asks — and flags denyListed', () => {
    expect(decidePermission('Bash', 'npm test', layers('full-auto')).action).toBe('allow');
    const d = decidePermission('Bash', 'git push origin master', layers('full-auto'));
    expect(d.action).toBe('ask');
    expect(d.denyListed).toBe(true);
  });
  it('an explicit remembered rule beats the deny-list (spec ruling #2)', () => {
    const d = decidePermission('Bash', 'git push origin master',
      layers('full-auto', [{ tool: 'Bash', pattern: 'git push*', action: 'allow' }]));
    expect(d.action).toBe('allow');
  });
  it('last matching rule wins WITHIN a layer', () => {
    const d = decidePermission('Edit', 'docs/readme.md', {
      presetRules: [], modeRules: [
        { tool: 'Edit', action: 'ask' },
        { tool: 'Edit', pattern: 'docs/*', action: 'allow' },
      ], denyList: [], rememberedRules: [],
    });
    expect(d.action).toBe('allow');
  });
  it('unknown tool with no matching rule defaults to ask (never silent-allow)', () => {
    expect(decidePermission('Mystery', undefined, { presetRules: [], modeRules: [], denyList: [], rememberedRules: [] }).action).toBe('ask');
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
// src/main/harness/permission-engine.ts
// The spec's ONE pure decision function (§2.4). Layer precedence, lowest → highest:
//   presetRules → modeRules → denyList → rememberedRules
// Within the concatenation the LAST matching rule wins, so a later layer's
// match always beats an earlier layer's (remembered user decisions are the
// final word — including over the deny-list, per the review-ruling tier split).
// Tool-layer guards (secret paths, external_directory) are NOT here — they run
// in defineTool() below all configuration and cannot be expressed as rules.
import { subjectMatches } from './tools/subject-glob';
import type { PermissionDecision, PermissionRule } from '../../shared/permission-types';

export interface PermissionLayers {
  presetRules: PermissionRule[];
  modeRules: PermissionRule[];
  denyList: PermissionRule[];
  rememberedRules: PermissionRule[];
}

export function decidePermission(
  tool: string,
  subject: string | undefined,
  layers: PermissionLayers,
): PermissionDecision {
  const ordered = [
    ...layers.presetRules.map((r) => ({ r, deny: false })),
    ...layers.modeRules.map((r) => ({ r, deny: false })),
    ...layers.denyList.map((r) => ({ r, deny: true })),
    ...layers.rememberedRules.map((r) => ({ r, deny: false })),
  ];
  let winner: { r: PermissionRule; deny: boolean } | null = null;
  for (const entry of ordered) {
    if (entry.r.tool !== '*' && entry.r.tool !== tool) continue;
    if (!subjectMatches(subject ?? '', entry.r.pattern)) continue;
    winner = entry; // last match wins
  }
  if (!winner) return { action: 'ask', denyListed: false }; // safe default
  return { action: winner.r.action, denyListed: winner.deny };
}
```

- [ ] **Step 4: Run tests** → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(native): pure permission decision engine with layered last-match-wins"`

---

### Task 5: Tool framework — `defineTool()`, guards, registry

**Files:**
- Create: `src/main/harness/tools/types.ts`
- Create: `src/main/harness/tools/guards.ts`
- Create: `src/main/harness/tools/registry.ts`
- Test: `tests/harness-tool-guards.test.ts`

- [ ] **Step 1: Types first**

```ts
// src/main/harness/tools/types.ts
import type { z } from 'zod';
import type { StructuredPatchHunk } from '../../../shared/types';

export interface ToolContext {
  sessionId: string;
  cwd: string;
  signal: AbortSignal;
  /** read-before-edit registry: canonical path → mtimeMs at last Read. RESETS on resume (spec §2.5). */
  readRegistry: Map<string, number>;
  /** per-session todo list (TodoWrite state) */
  todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }>;
}

export interface ToolResultPayload {
  /** What the model sees (post-truncation). */
  text: string;
  isError?: boolean;
  /** Edit/Write attach jsdiff hunks so the existing diff card renders. */
  structuredPatch?: StructuredPatchHunk[];
}

export interface NativeTool<A = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<A>;
  /** The permission SUBJECT for rule matching: Bash → command string; file
   *  tools → the file path; undefined → tool-name-only matching. */
  permissionSubject(args: A): string | undefined;
  execute(args: A, ctx: ToolContext): Promise<ToolResultPayload>;
}
```

- [ ] **Step 2: Guards (the non-negotiable tier — spec §2.3/§2.4: below ALL configuration)**

```ts
// src/main/harness/tools/guards.ts
// Tool-layer guards. These are NOT permission rules and no mode/preset/
// remembered decision reaches them: secret paths hard-deny; paths outside the
// session cwd force an 'ask' (the external_directory synthetic permission).
// KNOWN LIMITATION (spec §2.3, accepted): Bash can still `cat .env` — these
// guards are honest friction on the file tools, not a sandbox. PITFALLS entry
// ships with this file (Task 13).
import * as path from 'path';
import * as os from 'os';
import { isSensitivePath, isUnderRoot } from '../../artifacts/read-binary-access';

/** Canonicalize to forward slashes + lowercase drive, matching read-binary-access conventions. */
export function canonicalize(p: string, cwd: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
  let c = abs.replace(/\\/g, '/');
  if (/^[A-Z]:\//.test(c)) c = c[0].toLowerCase() + c.slice(1);
  return c;
}

export type GuardVerdict =
  | { kind: 'ok' }
  | { kind: 'deny'; reason: string }
  | { kind: 'external'; canonicalPath: string };

export function checkPathGuard(rawPath: string, cwd: string): GuardVerdict {
  const canonical = canonicalize(rawPath, cwd);
  if (isSensitivePath(canonical)) {
    return { kind: 'deny', reason: `Access to ${rawPath} is blocked: it looks like a credential or secret file. This cannot be overridden.` };
  }
  // ~/.ssh and friends even when addressed relatively
  const home = canonicalize(os.homedir(), cwd);
  for (const secretDir of [`${home}/.ssh`, `${home}/.gnupg`, `${home}/.aws`]) {
    if (isUnderRoot(canonical, secretDir)) {
      return { kind: 'deny', reason: `Access to ${rawPath} is blocked: it is under a credential directory. This cannot be overridden.` };
    }
  }
  if (!isUnderRoot(canonical, canonicalize(cwd, cwd))) {
    return { kind: 'external', canonicalPath: canonical }; // → external_directory ask
  }
  return { kind: 'ok' };
}
```

- [ ] **Step 3: Registry**

```ts
// src/main/harness/tools/registry.ts
// defineTool(): the ONE pipeline every tool runs through (spec §2.3) —
// validation and permission gating happen in the DRIVER (it owns pause/resume);
// this wrapper owns execution + uniform truncation + actionable errors.
import { truncateOutput, type TruncateOpts } from './truncate';
import type { NativeTool, ToolContext, ToolResultPayload } from './types';

const DEFAULT_CAPS: TruncateOpts = { maxChars: 30_000 };

export function defineTool<A>(
  def: NativeTool<A> & { caps?: TruncateOpts },
): NativeTool<A> {
  const caps = def.caps ?? DEFAULT_CAPS;
  return {
    ...def,
    async execute(args: A, ctx: ToolContext): Promise<ToolResultPayload> {
      try {
        const raw = await def.execute(args, ctx);
        return { ...raw, text: truncateOutput(raw.text, caps).text };
      } catch (err: any) {
        if (ctx.signal.aborted) return { text: 'Canceled: the user interrupted this operation.', isError: true };
        // Actionable error string, never a bare code (research R§3).
        return { text: `${def.name} failed: ${err?.message ?? String(err)}`, isError: true };
      }
    },
  };
}
```

- [ ] **Step 4: Guard tests**

```ts
// tests/harness-tool-guards.test.ts
import { describe, it, expect } from 'vitest';
import { checkPathGuard } from '../src/main/harness/tools/guards';
import * as os from 'os';
import * as path from 'path';

const CWD = path.join(os.tmpdir(), 'guard-test-workspace');

describe('checkPathGuard', () => {
  it('allows paths inside the workspace', () => {
    expect(checkPathGuard(path.join(CWD, 'src/a.ts'), CWD).kind).toBe('ok');
    expect(checkPathGuard('src/a.ts', CWD).kind).toBe('ok'); // relative resolves against cwd
  });
  it('hard-denies secret files regardless of location', () => {
    expect(checkPathGuard(path.join(CWD, '.env'), CWD).kind).toBe('deny');
    expect(checkPathGuard(path.join(os.homedir(), '.ssh', 'id_rsa'), CWD).kind).toBe('deny');
  });
  it('flags outside-workspace paths as external (→ ask), not deny', () => {
    const v = checkPathGuard(path.join(os.tmpdir(), 'elsewhere', 'x.txt'), CWD);
    expect(v.kind).toBe('external');
  });
});
```

Run: `npx vitest run tests/harness-tool-guards.test.ts` → PASS (fix `.env` handling in `isSensitivePath` expectations if its basename set differs — check `SENSITIVE_BASENAMES` in `src/main/artifacts/read-binary-access.ts:~20` and extend it there if `.env` is missing, with its own WHY comment).

- [ ] **Step 5: Typecheck + commit** — `npx tsc --noEmit` then `git add -A src/main/harness/tools tests/harness-tool-guards.test.ts && git commit -m "feat(native): tool framework — defineTool pipeline, path guards, types"`

---

### Task 6: The seven core tools

**Files:**
- Create: `src/main/harness/tools/read.ts`, `write.ts`, `edit.ts`, `bash.ts`, `glob.ts`, `grep.ts`, `todo-write.ts`, `index.ts`
- Test: `tests/harness-tools-core.test.ts`

Input shapes are CC's exactly (the fixture files in `src/renderer/dev/fixtures/*.jsonl` are the reference — `read.jsonl` shows `{file_path}`, etc.). Before coding each tool, open its fixture and match field names.

- [ ] **Step 1: Read**

```ts
// src/main/harness/tools/read.ts
import * as fs from 'fs';
import { z } from 'zod';
import { defineTool } from './registry';
import { canonicalize, resolveP } from './guards';

const BINARY_SNIFF_BYTES = 8000;

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export const ReadTool = defineTool({
  name: 'Read',
  description:
    'Read a file from the filesystem. Returns numbered lines. Use offset and limit for large files — output is capped at 2000 lines.',
  inputSchema: z.object({
    file_path: z.string().describe('Absolute or workspace-relative path'),
    offset: z.number().int().min(1).optional().describe('1-based first line to read'),
    limit: z.number().int().min(1).optional().describe('Max lines to return'),
  }),
  caps: { maxChars: 100_000 },
  permissionSubject: (a) => a.file_path,
  async execute(args, ctx) {
    const abs = resolveP(args.file_path, ctx.cwd);
    const buf = fs.readFileSync(abs);
    if (looksBinary(buf)) return { text: `Cannot read ${args.file_path}: it is a binary file.`, isError: true };
    const all = buf.toString('utf8').split('\n');
    const offset = args.offset ?? 1;
    const limit = Math.min(args.limit ?? 2000, 2000);
    const slice = all.slice(offset - 1, offset - 1 + limit);
    const MAX_LINE = 2000;
    const numbered = slice
      .map((l, i) => `${String(offset + i).padStart(6)}\t${l.length > MAX_LINE ? l.slice(0, MAX_LINE) + '…[line truncated]' : l}`)
      .join('\n');
    // Record for the read-before-edit gate (mtime so a later external change invalidates it).
    ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), fs.statSync(abs).mtimeMs);
    const trailer = offset - 1 + limit < all.length
      ? `\n[showing lines ${offset}-${offset + slice.length - 1} of ${all.length} — use offset=${offset + limit} to continue]`
      : '';
    return { text: numbered + trailer };
  },
});
```

`resolveP` lives in `guards.ts` alongside `canonicalize` (every file tool imports both from there):

```ts
// add to src/main/harness/tools/guards.ts
export function resolveP(p: string, cwd: string): string {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}
```

- [ ] **Step 2: Edit + Write (share the patch helper)**

```ts
// src/main/harness/tools/edit.ts
import * as fs from 'fs';
import { z } from 'zod';
import { structuredPatch } from 'diff';
import { defineTool } from './registry';
import { canonicalize, resolveP } from './guards';
import type { StructuredPatchHunk } from '../../../shared/types';

/** jsdiff → the reducer's StructuredPatchHunk shape (same fields; keep explicit). */
export function toHunks(oldText: string, newText: string, filePath: string): StructuredPatchHunk[] {
  return structuredPatch(filePath, filePath, oldText, newText).hunks.map((h) => ({
    oldStart: h.oldStart, oldLines: h.oldLines, newStart: h.newStart, newLines: h.newLines, lines: h.lines,
  }));
}

/** Detect and preserve line endings + BOM (Windows repos — spec §2.3). */
export function preserveFormat(original: string, edited: string): string {
  const hasBom = original.charCodeAt(0) === 0xfeff;
  const crlf = original.includes('\r\n');
  let out = edited;
  if (crlf && !out.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  if (hasBom && out.charCodeAt(0) !== 0xfeff) out = '﻿' + out;
  return out;
}

export const EditTool = defineTool({
  name: 'Edit',
  description:
    'Replace an exact string in a file. old_string must match exactly once (or pass replace_all). You must Read the file first.',
  inputSchema: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  }),
  permissionSubject: (a) => a.file_path,
  async execute(args, ctx) {
    const abs = resolveP(args.file_path, ctx.cwd);
    const canonical = canonicalize(args.file_path, ctx.cwd);
    // Read-before-edit gate (spec §2.3): the single rule that prevents blind overwrites.
    const readMtime = ctx.readRegistry.get(canonical);
    if (readMtime === undefined) {
      return { text: `Edit rejected: read ${args.file_path} with the Read tool first, then retry.`, isError: true };
    }
    if (fs.statSync(abs).mtimeMs !== readMtime) {
      return { text: `Edit rejected: ${args.file_path} changed since you read it. Read it again, then retry.`, isError: true };
    }
    const original = fs.readFileSync(abs, 'utf8');
    // Strip a BOM for matching so old_string anchors don't mysteriously miss at byte 0.
    const body = original.charCodeAt(0) === 0xfeff ? original.slice(1) : original;
    const count = body.split(args.old_string).length - 1;
    if (count === 0) return { text: 'Edit failed: old_string not found. Re-Read the file and copy the exact text, including whitespace.', isError: true };
    if (count > 1 && !args.replace_all) {
      return { text: `Edit failed: old_string matches ${count} times. Add surrounding context to make it unique, or pass replace_all: true.`, isError: true };
    }
    const edited = args.replace_all ? body.split(args.old_string).join(args.new_string) : body.replace(args.old_string, args.new_string);
    const final = preserveFormat(original, edited);
    fs.writeFileSync(abs, final);
    ctx.readRegistry.set(canonical, fs.statSync(abs).mtimeMs); // our own write stays "read"
    return { text: `Edited ${args.file_path}.`, structuredPatch: toHunks(body, edited, args.file_path) };
  },
});
```

```ts
// src/main/harness/tools/write.ts
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { defineTool } from './registry';
import { canonicalize, resolveP } from './guards';
import { toHunks } from './edit';

export const WriteTool = defineTool({
  name: 'Write',
  description: 'Create a new file or fully overwrite an existing one. To overwrite, you must Read the file first.',
  inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  permissionSubject: (a) => a.file_path,
  async execute(args, ctx) {
    const abs = resolveP(args.file_path, ctx.cwd);
    const canonical = canonicalize(args.file_path, ctx.cwd);
    const exists = fs.existsSync(abs);
    if (exists && !ctx.readRegistry.has(canonical)) {
      return { text: `Write rejected: ${args.file_path} already exists. Read it first so you know what you are replacing.`, isError: true };
    }
    const old = exists ? fs.readFileSync(abs, 'utf8') : '';
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, args.content);
    ctx.readRegistry.set(canonical, fs.statSync(abs).mtimeMs);
    return {
      text: `${exists ? 'Overwrote' : 'Created'} ${args.file_path} (${args.content.length} chars).`,
      structuredPatch: toHunks(old, args.content, args.file_path),
    };
  },
});
```

- [ ] **Step 3: Bash**

```ts
// src/main/harness/tools/bash.ts
// PTY-less exec (spec §2.3): none of the ConPTY 56-byte machinery applies —
// that is a CC-TUI constraint, not an exec constraint.
import { spawn } from 'child_process';
import * as fs from 'fs';
import { z } from 'zod';
import { defineTool } from './registry';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

/** Windows shell preference (spec §2.3): Git Bash when present (models write
 *  bash), else PowerShell — and the tool DESCRIPTION states which is live. */
export function detectShell(): { cmd: string; args: string[]; label: string } {
  if (process.platform !== 'win32') return { cmd: '/bin/bash', args: ['-c'], label: 'bash' };
  const gitBash = ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe']
    .find((p) => fs.existsSync(p));
  if (gitBash) return { cmd: gitBash, args: ['-c'], label: 'bash (Git Bash)' };
  return { cmd: 'powershell.exe', args: ['-NoProfile', '-Command'], label: 'PowerShell' };
}

const shell = detectShell();

export const BashTool = defineTool({
  name: 'Bash',
  description:
    `Run a shell command (${shell.label} on this machine) in the workspace directory. ` +
    'Output is capped; long-running commands time out (default 2 minutes, max 10 via timeout).',
  inputSchema: z.object({
    command: z.string(),
    timeout: z.number().int().optional().describe('Timeout in milliseconds'),
    description: z.string().optional().describe('One line: what this command does'),
  }),
  caps: { maxChars: 30_000 },
  permissionSubject: (a) => a.command,
  async execute(args, ctx) {
    const timeout = Math.min(args.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    return new Promise((resolve) => {
      const child = spawn(shell.cmd, [...shell.args, args.command], {
        cwd: ctx.cwd, windowsHide: true, env: process.env,
      });
      let out = '';
      const cap = (s: string) => { if (out.length < 200_000) out += s; };
      child.stdout.on('data', (d) => cap(String(d)));
      child.stderr.on('data', (d) => cap(String(d)));
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish(`Command timed out after ${timeout}ms.\n`, true); }, timeout);
      // Interrupt kills the child (spec §2.1 interrupt-mid-tool ruling).
      const onAbort = () => { child.kill('SIGKILL'); };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      let done = false;
      const finish = (prefix: string, isError: boolean, code?: number | null) => {
        if (done) return; done = true;
        clearTimeout(timer); ctx.signal.removeEventListener('abort', onAbort);
        resolve({ text: `${prefix}${out}`.trim() || `(no output, exit ${code ?? '?'})`, isError });
      };
      child.on('error', (err) => finish(`Failed to start shell: ${err.message}\n`, true));
      child.on('close', (code) => finish(code === 0 ? '' : `(exit code ${code})\n`, code !== 0, code));
    });
  },
});
```

- [ ] **Step 4: Glob + Grep**

```ts
// src/main/harness/tools/glob.ts
// Dedicated tool, not shell (research R§3: small models butcher quoting).
// Recursive walk + subjectMatches-style file glob; mtime-sorted like CC's.
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { defineTool } from './registry';
import { resolveP } from './guards';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

function fileGlobToRegex(glob: string): RegExp {
  // '**' crosses separators, '*' does not, '?' single char.
  const rx = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${rx}$`, 'i');
}

export const GlobTool = defineTool({
  name: 'Glob',
  description: 'Find files by glob pattern (e.g. "src/**/*.ts"). Returns paths sorted by modification time, newest first.',
  inputSchema: z.object({ pattern: z.string(), path: z.string().optional() }),
  permissionSubject: (a) => a.path ?? '.',
  async execute(args, ctx) {
    const root = resolveP(args.path ?? '.', ctx.cwd);
    const rx = fileGlobToRegex(args.pattern);
    const hits: Array<{ rel: string; mtime: number }> = [];
    const walk = (dir: string, rel: string) => {
      if (ctx.signal.aborted || hits.length >= 2000) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name); continue; }
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (rx.test(r)) { try { hits.push({ rel: r, mtime: fs.statSync(path.join(dir, e.name)).mtimeMs }); } catch { /* raced delete */ } }
      }
    };
    walk(root, '');
    hits.sort((a, b) => b.mtime - a.mtime);
    return { text: hits.length ? hits.map((h) => h.rel).join('\n') : 'No files matched.' };
  },
});
```

```ts
// src/main/harness/tools/grep.ts
// Bundled ripgrep (@vscode/ripgrep) — deterministic cross-platform search.
import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { z } from 'zod';
import { defineTool } from './registry';
import { resolveP } from './guards';

export const GrepTool = defineTool({
  name: 'Grep',
  description: 'Search file contents with a regex (ripgrep). output_mode: "content" (matching lines), "files_with_matches" (default), or "count".',
  inputSchema: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    glob: z.string().optional().describe('Filter files, e.g. "*.ts"'),
    output_mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
  }),
  caps: { maxChars: 30_000, maxLines: 250 },
  permissionSubject: (a) => a.path ?? '.',
  async execute(args, ctx) {
    const mode = args.output_mode ?? 'files_with_matches';
    const rgArgs = ['--no-config', '--hidden', '--glob', '!.git', '--max-count', '500'];
    if (mode === 'files_with_matches') rgArgs.push('-l');
    if (mode === 'count') rgArgs.push('--count');
    if (mode === 'content') rgArgs.push('-n');
    if (args.glob) rgArgs.push('--glob', args.glob);
    rgArgs.push('--', args.pattern, resolveP(args.path ?? '.', ctx.cwd));
    return new Promise((resolve) => {
      const child = spawn(rgPath, rgArgs, { windowsHide: true });
      let out = ''; let err = '';
      child.stdout.on('data', (d) => { if (out.length < 200_000) out += String(d); });
      child.stderr.on('data', (d) => { err += String(d); });
      const onAbort = () => child.kill('SIGKILL');
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      child.on('close', (code) => {
        ctx.signal.removeEventListener('abort', onAbort);
        // rg exit 1 = no matches (not an error); 2 = real error.
        if (code === 2) resolve({ text: `Grep failed: ${err.trim() || 'ripgrep error'}. Check the regex syntax.`, isError: true });
        else resolve({ text: out.trim() || 'No matches found.' });
      });
    });
  },
});
```

- [ ] **Step 5: TodoWrite + registry index**

```ts
// src/main/harness/tools/todo-write.ts
import { z } from 'zod';
import { defineTool } from './registry';

export const TodoWriteTool = defineTool({
  name: 'TodoWrite',
  description: 'Replace your task list. Use it to plan multi-step work and mark progress (pending / in_progress / completed).',
  inputSchema: z.object({
    todos: z.array(z.object({
      content: z.string(),
      status: z.enum(['pending', 'in_progress', 'completed']),
      activeForm: z.string(),
    })),
  }),
  permissionSubject: () => undefined,
  async execute(args, ctx) {
    ctx.todos.length = 0;
    ctx.todos.push(...args.todos);
    const done = args.todos.filter((t) => t.status === 'completed').length;
    return { text: `Todo list updated: ${args.todos.length} items, ${done} completed.` };
  },
});
```

```ts
// src/main/harness/tools/index.ts
import type { NativeTool } from './types';
import { ReadTool } from './read';
import { WriteTool } from './write';
import { EditTool } from './edit';
import { BashTool } from './bash';
import { GlobTool } from './glob';
import { GrepTool } from './grep';
import { TodoWriteTool } from './todo-write';

/** Plan A core set. Plan B appends WebFetch/WebSearch/AskUserQuestion. */
export const CORE_TOOLS: NativeTool[] = [ReadTool, WriteTool, EditTool, BashTool, GlobTool, GrepTool, TodoWriteTool];
export const toolByName = new Map(CORE_TOOLS.map((t) => [t.name, t]));
```

- [ ] **Step 6: Tests** — write `tests/harness-tools-core.test.ts` in a tmp-dir sandbox (`fs.mkdtempSync(path.join(os.tmpdir(), 'native-tools-'))` per test, `AbortController().signal`, fresh `readRegistry`/`todos`). Cover at minimum, as separate `it` cases:
  - Read: numbered lines; offset/limit paging trailer; binary refusal; registers in readRegistry.
  - Edit: rejects without prior Read; rejects when mtime changed (touch the file between Read and Edit via `fs.utimesSync`); non-unique old_string message includes count; CRLF file stays CRLF after edit (write a `a\r\nb\r\n` fixture, edit `b`→`c`, assert `\r\n` survives); returns non-empty structuredPatch hunks.
  - Write: rejects overwrite without Read; creates parent dirs; structuredPatch present.
  - Bash: echo round-trip; non-zero exit → isError + `(exit code N)`; timeout fires (50ms timeout on a sleep — use `node -e "setTimeout(()=>{},10000)"` for cross-platform sleep); abort kills child.
  - Glob: matches `**/*.ts` in nested dirs; skips node_modules.
  - Grep: content mode returns line numbers; no matches → friendly text, not error.
  - TodoWrite: replaces list in ctx.

Run: `npx vitest run tests/harness-tools-core.test.ts` → PASS

- [ ] **Step 7: Fixture cross-check** — open each of `src/renderer/dev/fixtures/{read,edit,write,bash,glob,grep,todowrite}.jsonl` and confirm the `input` field names there match each tool's schema exactly (`file_path`, `old_string`, `command`, `pattern`, `todos[].activeForm`, …). Any mismatch = fix the TOOL (fixtures mirror CC, which is the compat target). Then run the sandbox visually later in Task 12's live pass.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(native): seven core tools behind defineTool (CC-compatible names/shapes)"`

---

### Task 7: Remembered decisions store (`~/.youcoded/permissions.json`)

**Files:**
- Create: `src/main/harness/permission-store.ts`
- Test: `tests/permission-store.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/permission-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path';
import { NativeHome } from '../src/main/native-home';
import { PermissionStore } from '../src/main/harness/permission-store';

let home: NativeHome; let store: PermissionStore;
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-store-'));
  home = new NativeHome(dir);           // match NativeHome's real constructor — see native-home.test.ts
  store = new PermissionStore(home);
});

describe('PermissionStore', () => {
  it('returns [] for an unknown project', async () => {
    expect(await store.rulesFor('/some/project')).toEqual([]);
  });
  it('persists a remembered rule per project slug and reads it back', async () => {
    await store.remember('/some/project', { tool: 'Bash', pattern: 'npm test*', action: 'allow' });
    const rules = await store.rulesFor('/some/project');
    expect(rules).toEqual([{ tool: 'Bash', pattern: 'npm test*', action: 'allow' }]);
    expect(await store.rulesFor('/other/project')).toEqual([]); // scoped
  });
  it('dedups identical rules', async () => {
    await store.remember('/p', { tool: 'Edit', pattern: 'src/*', action: 'allow' });
    await store.remember('/p', { tool: 'Edit', pattern: 'src/*', action: 'allow' });
    expect((await store.rulesFor('/p')).length).toBe(1);
  });
});
```

(Check `tests/native-home.test.ts` for NativeHome's real constructor signature and mirror it — if it takes no args and derives the home dir itself, use whatever injection seam that test uses.)

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implement**

```ts
// src/main/harness/permission-store.ts
// Remembered "Always allow" decisions (spec §2.4 layer 3), scoped per project
// slug, stored in ~/.youcoded/permissions.json. ALL writes go through
// NativeHome.mutateFileUnderLock — the dev instance and built app share this
// home (native-runtime rule).
import { cwdToProjectSlug } from '../transcript-watcher';
import type { NativeHome } from '../native-home';
import type { PermissionRule } from '../../shared/permission-types';

const FILE = 'permissions.json';
type PermFile = { v: 1; projects: Record<string, { rules: PermissionRule[] }> };
const EMPTY: PermFile = { v: 1, projects: {} };

export class PermissionStore {
  constructor(private home: NativeHome) {}

  async rulesFor(cwd: string): Promise<PermissionRule[]> {
    const data = (await this.home.readJson<PermFile>(FILE)) ?? EMPTY;
    return data.projects[cwdToProjectSlug(cwd)]?.rules ?? [];
  }

  async remember(cwd: string, rule: PermissionRule): Promise<void> {
    const slug = cwdToProjectSlug(cwd);
    await this.home.mutateFileUnderLock<PermFile>(FILE, (cur) => {
      const data = cur ?? EMPTY;
      const rules = data.projects[slug]?.rules ?? [];
      const dup = rules.some((r) => r.tool === rule.tool && r.pattern === rule.pattern && r.action === rule.action);
      if (!dup) rules.push(rule);
      return { ...data, projects: { ...data.projects, [slug]: { rules } } };
    });
  }
}
```

(Match `readJson`/`mutateFileUnderLock` to NativeHome's REAL method names/signatures — open `src/main/native-home.ts` first; the rule file documents `mutateFileUnderLock` and `readJson` exist. Adjust generics/return shape to compile, keep the lock discipline.)

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `git commit -am "feat(native): remembered permission decisions store (per-project, NativeHome-locked)"`

---

### Task 8: Permission broker in NativeSessionHost + PERMISSION_RESPOND routing

The broker owns pending asks: emits the hook-shaped `PermissionRequest` the existing UI already renders, and resolves when the renderer responds on the EXISTING `permission:respond` channel.

**Files:**
- Modify: `src/main/harness/native-session-host.ts`
- Modify: `src/main/ipc-handlers.ts` (~line 2482, the PERMISSION_RESPOND handler; ~line 1874, hook-event forwarding)
- Test: `tests/native-permission-broker.test.ts`

- [ ] **Step 1: Read first** — `src/renderer/state/hook-dispatcher.ts` (lines 1–40) for the exact payload fields the renderer extracts (`requestId`, `toolName`, `toolInput` observed at lines 17–25 — confirm), and how CC's hook events reach the renderer (grep `hook:event` in `ipc-handlers.ts` / `hook-relay.ts`) so native events ride the identical channel + remote broadcast. Also read the ToolCard approval component (grep `PERMISSION_RESPOND` / `permissions.respond` under `src/renderer/`) and record the exact `decision` object it sends — the broker must accept THAT shape.

- [ ] **Step 2: Failing test**

```ts
// tests/native-permission-broker.test.ts
import { describe, it, expect } from 'vitest';
import { PermissionBroker } from '../src/main/harness/permission-broker';

describe('PermissionBroker', () => {
  it('emits a hook-shaped request and resolves on respond()', async () => {
    const broker = new PermissionBroker();
    const emitted: any[] = [];
    broker.on('hook-event', (e) => emitted.push(e));
    const p = broker.ask({ sessionId: 's1', toolName: 'Bash', toolInput: { command: 'npm test' }, denyListed: false });
    expect(emitted[0].type).toBe('PermissionRequest');
    expect(emitted[0].sessionId).toBe('s1');
    const requestId = emitted[0].payload.requestId as string;
    expect(requestId).toMatch(/^native-/); // MUST NOT collide with CC hook ids
    expect(broker.respond(requestId, { behavior: 'allow' })).toBe(true);
    await expect(p).resolves.toMatchObject({ behavior: 'allow' });
  });
  it('respond() returns false for unknown ids (lets ipc-handlers fall through to hookRelay)', () => {
    expect(new PermissionBroker().respond('hook-123', { behavior: 'allow' })).toBe(false);
  });
  it('cancel() resolves pending asks as canceled and emits PermissionExpired', async () => {
    const broker = new PermissionBroker();
    const emitted: any[] = [];
    broker.on('hook-event', (e) => emitted.push(e));
    const p = broker.ask({ sessionId: 's1', toolName: 'Edit', toolInput: {}, denyListed: false });
    broker.cancelSession('s1');
    await expect(p).resolves.toMatchObject({ behavior: 'canceled' });
    expect(emitted.some((e) => e.type === 'PermissionExpired')).toBe(true); // clears the card
  });
});
```

- [ ] **Step 3: Implement `src/main/harness/permission-broker.ts`**

```ts
// PermissionBroker (spec §2.4): pending native asks. Emits 'hook-event' with
// the SAME shape hook-relay produces so hook-dispatcher/ToolCard render it
// unchanged; ids are 'native-' prefixed so the shared permission:respond
// channel can route by id. Interrupt → cancelSession resolves everything as
// 'canceled' (spec pending-ask ruling) and expires the cards.
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface AskRequest {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  /** Winning rule came from the destructive deny-list → renderer shows the consequence warning on Always-allow. */
  denyListed: boolean;
}
export interface AskDecision {
  behavior: 'allow' | 'deny' | 'canceled';
  /** True when the user chose "Always allow" — caller persists the remembered rule. */
  always?: boolean;
}

export class PermissionBroker extends EventEmitter {
  private pending = new Map<string, { sessionId: string; resolve: (d: AskDecision) => void }>();

  ask(req: AskRequest): Promise<AskDecision> {
    const requestId = `native-${randomUUID()}`;
    return new Promise<AskDecision>((resolve) => {
      this.pending.set(requestId, { sessionId: req.sessionId, resolve });
      this.emit('hook-event', {
        sessionId: req.sessionId,
        type: 'PermissionRequest',
        payload: { requestId, toolName: req.toolName, toolInput: req.toolInput, denyListed: req.denyListed },
        timestamp: Date.now(),
      });
    });
  }

  /** Returns false when the id isn't ours — caller falls through to hookRelay. */
  respond(requestId: string, decision: Record<string, unknown>): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    // Normalize the ToolCard's decision object (verify exact fields in Step 1;
    // CC's shape is behavior-based — adjust here, nowhere else).
    const behavior = decision.behavior === 'allow' ? 'allow' : 'deny';
    entry.resolve({ behavior, always: decision.always === true || decision.behavior === 'allow-always' });
    return true;
  }

  cancelSession(sessionId: string): void {
    for (const [id, entry] of [...this.pending]) {
      if (entry.sessionId !== sessionId) continue;
      this.pending.delete(id);
      this.emit('hook-event', { sessionId, type: 'PermissionExpired', payload: { requestId: id }, timestamp: Date.now() });
      entry.resolve({ behavior: 'canceled' });
    }
  }
}
```

- [ ] **Step 4: Wire into NativeSessionHost** — the host constructs one broker, re-emits its `hook-event`, exposes `respondPermission(requestId, decision)` and calls `broker.cancelSession(sessionId)` inside `interrupt()` BEFORE aborting the stream (so a paused loop resolves and can unwind). In `ipc-handlers.ts`: forward host `hook-event` exactly like transcript events (send on the same channel CC hook events use + `remoteServer.broadcast`), and change the PERMISSION_RESPOND handler (line ~2484) to route:

```ts
  // Native asks share the channel; ids are 'native-'-prefixed so routing is exact.
  ipcMain.handle(IPC.PERMISSION_RESPOND, async (_event, requestId: string, decision: object) => {
    if (nativeHost.respondPermission(requestId, decision)) return true;
    return hookRelay ? hookRelay.respond(requestId, decision) : false;
  });
```

(The existing handler is inside `if (hookRelay)` — lift it out so native works when hookRelay is absent, preserving the hookRelay call only when defined. Mirror the same routing in `remote-server.ts`'s permission-respond path — grep `PERMISSION_RESPOND` there; remote clients approve tools too.)

- [ ] **Step 5: Run tests** (`npx vitest run tests/native-permission-broker.test.ts` → PASS), then the full suite (`npm test -- --run`) to catch the ipc-handlers signature drift. **Commit** — `git commit -am "feat(native): permission broker riding the existing hook-event/permission:respond channels"`

---

### Task 9: The turn driver — HarnessSession multi-step loop

The core task. The v0 outer shell (re-entrancy guard, abort-race iterator, event emission) survives; the inner "one streamText call" becomes a step loop. **The emit surface is FROZEN** — emit only existing event types/fields.

**Files:**
- Modify: `src/main/harness/harness-session.ts`
- Test: `tests/harness-session-loop.test.ts` (new file; keep the existing `harness-session.test.ts` green — it pins v0 behaviors like interrupt/delta merge that must survive)

- [ ] **Step 1: Extend the constructor surface.** `HarnessSessionOpts` gains:

```ts
export interface HarnessSessionOpts {
  sessionId: string; cwd: string; harness: HarnessManifest; binding: ModelBinding;
  contextLength?: number | null;
  /** Plan A additions — all injected by NativeSessionHost: */
  tools?: NativeTool[];                                  // absent/[] = v0 chat behavior (Chat-preset compat)
  decide?: (tool: string, subject: string | undefined) => Promise<PermissionDecision>;
  askUser?: (req: AskRequest) => Promise<AskDecision>;   // broker.ask bound to this session
  systemPrompt?: string;                                 // assembled ONCE at init (Task 11); falls back to harness.systemPrompt
}
```

- [ ] **Step 2: Write the loop tests FIRST** (they define the contract). Use `MockLanguageModelV4` with a `doStream` that returns different scripted streams per call (closure over a call counter) — mirroring `harness-sdk-toolcall-contract.test.ts` chunk shapes:

```ts
// tests/harness-session-loop.test.ts — the driver contract. Scripted model:
// step 1 streams text + a Read tool-call (finish 'tool-calls'), step 2 streams
// closing text (finish 'stop'). A fake Read tool records executions.
// Assert, in ORDER, the emitted transcript events:
//   user-message → assistant-text(step1, partId A) → tool-use(Read)
//   → tool-result(Read) → assistant-text(step2, partId B ≠ A) → turn-complete
// Plus:
//  - history after the turn: user / assistant(text+tool-call) / tool(result) / assistant(text)
//  - decide() returning 'deny' → tool-result isError with "declined", model got the refusal text, loop CONTINUED
//  - askUser called on 'ask'; resolve allow → executes; resolve deny → refusal result
//  - askUser resolve {behavior:'canceled'} → user-interrupt emitted, turn ends, NO turn-complete
//  - invalid args (schema mismatch) → tool-result isError with corrective text, tool NOT executed
//  - doom loop: 3 identical calls → askUser called with toolName 'doom_loop'
//  - maxSteps: manifest limits.maxSteps=2, model always tool-calls → askUser('max_steps');
//    allow → loop continues; deny → turn-complete with stopReason 'max_steps'
//  - usage: per-step usages SUM into turn-complete usage
//  - interrupt mid-execute: tool receives aborted signal; user-interrupt emitted
```

Write each of those as a real `it(...)` with explicit chunk scripts and assertions — the bullet list above is the required case inventory, and each becomes its own test. Run → FAIL (driver not implemented).

- [ ] **Step 3: Implement the loop inside `send()`.** Shape (preserving v0's abort-race consumption per step):

```ts
async send(text: string): Promise<void> {
  if (this.abort) throw new Error('HarnessSession.send() called while a turn is already in flight — callers must serialize sends per session.');
  this.interrupted = false;
  this.emitEvent('user-message', { text });
  this.history.push({ role: 'user', content: text });
  this.abort = new AbortController();
  const startedAt = Date.now();
  const turnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let outputChars = 0;
  const recentCalls: string[] = [];               // doom-loop window
  const maxSteps = this.opts.harness.limits?.maxSteps ?? 25;
  let stepsSinceApproval = 0;
  let stopReason = 'end_turn';

  try {
    const model = await this.modelFactory(this.binding);
    const aiTools = this.buildAiTools();          // ai `tool({description, inputSchema})` WITHOUT execute, keyed by name

    turnLoop: while (true) {
      // ---- one step ----
      const result = await this.withRetry(() => streamText({
        model,
        system: this.opts.systemPrompt ?? this.opts.harness.systemPrompt,
        messages: this.fitToContext(this.history),
        ...(this.tools.length ? { tools: aiTools } : {}),
        maxOutputTokens: this.opts.harness.limits?.maxTokens,
        abortSignal: this.abort.signal,
      }));

      const stepText: string[] = [];
      const toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
      // v0's abort-race iterator, verbatim, plus a 'tool-call' case that
      // pushes into toolCalls (and keeps emitting text/reasoning deltas with
      // the SDK part id — fresh per step, so each step's text is its own bubble).
      /* ... existing while(true)/Promise.race body with the added case ... */

      if (this.interrupted || this.abort.signal.aborted) { /* push partial, emit user-interrupt, return (v0 semantics) */ }

      const stepUsage = await result.usage;       // accumulate into turnUsage
      const finishReason = await result.finishReason;
      // append the assistant message for this step (text + tool-call parts)
      this.history.push(assistantMessage(stepText, toolCalls));

      if (toolCalls.length === 0) {
        if (finishReason === 'length') stopReason = 'max_tokens'; // truncated-call class collapses here when no complete call arrived
        break; // normal end of turn
      }

      // ---- execute this step's calls, serially ----
      const resultParts: ToolResultPart[] = [];
      for (const call of toolCalls) {
        this.emitEvent('tool-use', { toolUseId: call.toolCallId, toolName: call.toolName, toolInput: call.input as Record<string, unknown> });
        const payload = await this.runOneTool(call, recentCalls);   // validate → guards → decide → (ask) → execute; NEVER throws
        if (payload === 'interrupted') { /* REVIEW CORRECTION (2026-07-15): do NOT bare-return here — that leaves a dangling assistant tool-call in history and the NEXT send() 400s on real providers (dangling tool_call). Back-fill first: synthesize isError "Canceled" tool-results for this call and every remaining call in the step, push the complete role:'tool' message, emit matching tool-result events, THEN emit user-interrupt and return. */ }
        this.emitEvent('tool-result', {
          toolUseId: call.toolCallId, toolName: call.toolName,
          toolResult: payload.text, isError: payload.isError ?? false,
          ...(payload.structuredPatch ? { structuredPatch: payload.structuredPatch } : {}),
        });
        resultParts.push(toolResultPart(call, payload.text));
      }
      this.history.push({ role: 'tool', content: resultParts });

      // ---- budgets ----
      stepsSinceApproval++;
      if (stepsSinceApproval >= maxSteps) {
        const d = await this.opts.askUser?.({ sessionId: this.opts.sessionId, toolName: 'max_steps',
          toolInput: { steps: stepsSinceApproval }, denyListed: false });
        if (d?.behavior === 'canceled') { this.emitEvent('user-interrupt', {}); return; }
        if (d?.behavior !== 'allow') { stopReason = 'max_steps'; break turnLoop; }
        stepsSinceApproval = 0; // user said keep going
      }
    }

    const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
    this.emitEvent('turn-complete', {
      model: this.binding.modelId, stopReason,
      usage: { ...turnUsage, tokensPerSecond: Math.round(turnUsage.outputTokens / seconds) },
    });
  } catch (err) { /* v0's catch: user-interrupt vs session-error, unchanged */ }
  finally { this.abort = null; }
}
```

`runOneTool` (private) is where spec §2.1/§2.4 sequencing lives — implement exactly:

```ts
private async runOneTool(call, recentCalls): Promise<ToolResultPayload | 'interrupted'> {
  const tool = this.toolByName.get(call.toolName);
  if (!tool) return { text: `Unknown tool ${call.toolName}. Available: ${[...this.toolByName.keys()].join(', ')}.`, isError: true };
  // 1. validate (zod) — invalid args are a RESULT the model can repair from
  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) return { text: `Invalid arguments for ${call.toolName}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}. Fix the arguments and call again.`, isError: true };
  const args = parsed.data;
  // 2. doom loop (BEFORE permissions — a stuck model shouldn't spam asks)
  const sig = `${call.toolName}:${JSON.stringify(args)}`;
  recentCalls.push(sig); if (recentCalls.length > 3) recentCalls.shift();
  if (recentCalls.length === 3 && recentCalls.every((s) => s === sig)) {
    const d = await this.opts.askUser?.({ sessionId: this.opts.sessionId, toolName: 'doom_loop', toolInput: { repeated: call.toolName }, denyListed: false });
    if (d?.behavior === 'canceled') return 'interrupted';
    if (d?.behavior !== 'allow') return { text: 'Stopped: this exact call has been repeated three times. Try a different approach.', isError: true };
    recentCalls.length = 0;
  }
  // 3. tool-layer guards (below ALL configuration) — file tools only
  const subject = tool.permissionSubject(args);
  let externalAsk = false;
  if (subject !== undefined && call.toolName !== 'Bash') {
    const verdict = checkPathGuard(subject, this.opts.cwd);
    if (verdict.kind === 'deny') return { text: verdict.reason, isError: true };
    if (verdict.kind === 'external') externalAsk = true;
  }
  // 4. configured decision
  const decision = externalAsk
    ? { action: 'ask' as const, denyListed: false }
    : await (this.opts.decide?.(call.toolName, subject) ?? Promise.resolve({ action: 'ask' as const, denyListed: false }));
  if (decision.action === 'deny') return { text: `The ${call.toolName} call was blocked by a permission rule.`, isError: true };
  if (decision.action === 'ask') {
    const d = await this.opts.askUser?.({ sessionId: this.opts.sessionId, toolName: call.toolName, toolInput: call.input as any, denyListed: decision.denyListed });
    if (!d || d.behavior === 'canceled') return 'interrupted';
    if (d.behavior !== 'allow') return { text: 'The user declined this action. Ask what they would like instead, or try a different approach.', isError: true };
    if (d.always) this.emit('remember-rule', { tool: call.toolName, ...(subject !== undefined ? { pattern: subject } : {}), action: 'allow' }); // host persists via PermissionStore
  }
  // 5. execute (defineTool owns truncation + catch)
  return tool.execute(args, { sessionId: this.opts.sessionId, cwd: this.opts.cwd, signal: this.abort!.signal, readRegistry: this.readRegistry, todos: this.todos });
}
```

Plus the small private helpers this sketch names: `buildAiTools()` (map `NativeTool` → `tool({ description, inputSchema: zodSchema(schema) })`), `assistantMessage()`, `toolResultPart()` (the Task-1-verified shape), `withRetry()`:

```ts
/** Exponential backoff for transient provider errors (429/5xx/network),
 *  honoring retry-after when present. Exhaustion rethrows → session-error path. */
private async withRetry<T>(fn: () => T): Promise<T> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    try { return fn(); } catch (err: any) {
      const status = err?.statusCode ?? err?.status;
      const retryable = status === 429 || (status >= 500 && status < 600) || err?.code === 'ECONNRESET';
      if (!retryable || attempt >= delays.length || this.abort?.signal.aborted) throw err;
      const ra = Number(err?.responseHeaders?.['retry-after']) * 1000;
      await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra : delays[attempt]));
    }
  }
}
```

NOTE: `streamText` returns synchronously and errors surface in the stream — if so, retry must wrap the STREAM CONSUMPTION of a step, not just the call. Task 1's contract test tells you which; restructure the step body accordingly (`withRetry(async () => { const r = streamText(...); return await consumeStep(r); })`) and keep already-emitted partIds stable across a retry by only emitting after the first chunk arrives — verify with a test where attempt 1 errors immediately and attempt 2 streams clean.

Also: `readRegistry` and `todos` become HarnessSession fields, cleared in `seedHistory()`'s resume path per the reset-on-resume ruling (Task 10 wires that).

- [ ] **Step 4: Run the new loop tests + the OLD v0 tests** — both files green:

`npx vitest run tests/harness-session-loop.test.ts tests/harness-session.test.ts` → PASS

- [ ] **Step 5: Full suite** — `npm test -- --run` → green. **Step 6: Commit** — `git commit -am "feat(native): multi-step agentic turn driver (tools, permissions, doom-loop, budgets, retry)"`

---

### Task 10: Persistence + resume rebuild

**Files:**
- Modify: `src/main/harness/native-session-host.ts` (resume path)
- Create: `src/main/harness/history-rebuild.ts`
- Test: `tests/harness-history-rebuild.test.ts`

- [ ] **Step 1: Confirm store passthrough** — `tool-use`/`tool-result` are non-delta events, so `SessionStore.append` already persists them verbatim (no store change). Add one store test to `tests/session-store.test.ts` (or its existing file) pinning that a tool-use/tool-result pair round-trips through append→readEvents unchanged, including `structuredPatch`.

- [ ] **Step 2: Failing rebuild test** — the deep-equal pin from the spec:

```ts
// tests/harness-history-rebuild.test.ts
// THE resume contract (spec §2.5): rebuild(eventsPersistedDuringLiveTurn)
// deep-equals the live session's history. Run a scripted two-step tool turn
// through HarnessSession (Task 9's mock harness), capture (a) live history via
// a test accessor, (b) the emitted events; feed (b) to rebuildHistory; assert
// deepEqual(a, b-rebuilt). Plus: unknown event types are skipped; a turn with
// only text rebuilds exactly like v0; readRegistry is NOT reconstructed.
```

Write it concretely by importing the Task 9 test's scripted-model helper (extract that helper into `tests/helpers/scripted-model.ts` now, used by both files).

- [ ] **Step 3: Implement `history-rebuild.ts`** — a pure function:

```ts
// Rebuild ModelMessages from persisted transcript events (spec §2.5). Grouping
// MUST mirror the driver's live pushes exactly (the deep-equal test is the
// contract): consecutive assistant-text events + the tool-use events that
// follow them form ONE assistant message; the tool-results that follow form
// ONE tool message; a user-message flushes everything before it.
import type { TranscriptEvent } from '../../shared/types';
import type { ModelMessage } from 'ai';

export function rebuildHistory(events: TranscriptEvent[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  let assistantParts: any[] = [];   // text + tool-call parts of the step being grouped
  let toolResults: any[] = [];      // tool-result parts of the step being grouped

  const flushAssistant = () => {
    if (assistantParts.length) { out.push({ role: 'assistant', content: assistantParts }); assistantParts = []; }
  };
  const flushResults = () => {
    if (toolResults.length) { out.push({ role: 'tool', content: toolResults }); toolResults = []; }
  };

  for (const e of events) {
    switch (e.type) {
      case 'user-message':
        flushAssistant(); flushResults();
        out.push({ role: 'user', content: String(e.data?.text ?? '') });
        break;
      case 'assistant-text':
        // A new text after tool-results means a NEW step started — flush the
        // previous step's results first so grouping mirrors the live pushes.
        flushResults();
        assistantParts.push({ type: 'text', text: String(e.data?.text ?? '') });
        break;
      case 'tool-use':
        flushResults();
        assistantParts.push({ type: 'tool-call', toolCallId: e.data?.toolUseId, toolName: e.data?.toolName, input: e.data?.toolInput ?? {} });
        break;
      case 'tool-result':
        flushAssistant(); // the step's assistant message precedes its results
        toolResults.push({ type: 'tool-result', toolCallId: e.data?.toolUseId, toolName: e.data?.toolName,
          output: { type: 'text', value: String(e.data?.toolResult ?? '') } }); // field name per Task 1's verified shape
        break;
      case 'turn-complete':
      case 'user-interrupt':
        flushAssistant(); flushResults();
        break;
      default:
        break; // assistant-thinking, compact-summary, etc. don't enter model history in Plan A
    }
  }
  flushAssistant(); flushResults();
  return out;
}
```

The deep-equal test is the arbiter of every grouping choice — if live pushes differ (e.g. text-only assistant messages are plain strings, not part arrays), adjust EITHER side until `rebuildHistory(emitted) deep-equals liveHistory`, and keep whichever representation the Task 1 contract test proved streamText accepts.

- [ ] **Step 4: Wire into `NativeSessionHost.resume`** — replace the current text-only history seeding (read `native-session-host.ts`'s existing resume; it seeds via `seedHistory`) with `session.seedHistory(rebuildHistory(events))`. `seedHistory` also clears `readRegistry` + `todos` (reset-on-resume ruling) — add that to its body with a WHY comment.

- [ ] **Step 5: Tests + full suite green; commit** — `git commit -am "feat(native): resume rebuilds tool-call history; read-registry resets on resume"`

---

### Task 11: System prompt assembly + Coder-shaped default prompt

**Files:**
- Create: `src/main/harness/prompt-assembly.ts`
- Create: `src/main/harness/prompts/coder-default.ts`
- Modify: `src/main/harness/native-session-host.ts` (assemble at create/resume, pass into HarnessSessionOpts)
- Test: `tests/prompt-assembly.test.ts`

- [ ] **Step 1: Failing tests** — pin the order and the snapshot semantics:

```ts
// tests/prompt-assembly.test.ts
// Pins (spec §2.2): section ORDER (identity → preset body → <env> → project
// instructions → tool guidance); the env block carries the "as of session
// start" label; AGENTS.md wins over CLAUDE.md; walk-up stops at the git root;
// assembling twice with the same inputs is byte-identical (KV-cache pin).
```

Cover: tmp dir with nested `sub/dir/`, an `AGENTS.md` at root → included; both files present → AGENTS.md only; neither → section omitted entirely (not an empty header); two calls → `expect(a).toBe(b)`.

- [ ] **Step 2: Implement**

```ts
// src/main/harness/prompt-assembly.ts
// Assembled ONCE per session (spec §2.2): the <env> values are a SNAPSHOT at
// session start, labeled as such — the model uses tools for current state.
// Byte-stable by construction; do NOT add anything that changes between turns.
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface PromptInputs { presetBody: string; cwd: string; appVersion: string }

function gitSnapshot(cwd: string): string {
  try {
    const branch = execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 3000 }).toString().trim();
    const dirty = execFileSync('git', ['-C', cwd, 'status', '--porcelain'], { timeout: 3000 }).toString().trim();
    return `Git branch: ${branch}${dirty ? ` (${dirty.split('\n').length} uncommitted change(s))` : ' (clean)'}`;
  } catch { return 'Git: not a repository'; }
}

function projectInstructions(cwd: string): string | null {
  // Walk up from cwd to the git root (or filesystem root), first hit wins:
  // AGENTS.md is the cross-tool standard; CLAUDE.md read as fallback (§3.4).
  let dir = cwd;
  while (true) {
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        const body = fs.readFileSync(p, 'utf8').slice(0, 20_000);
        return `<project-instructions source="${name}">\n${body}\n</project-instructions>`;
      }
    }
    if (fs.existsSync(path.join(dir, '.git'))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function assembleSystemPrompt(i: PromptInputs): string {
  const sections = [
    'You are the YouCoded assistant, an agentic AI running inside the YouCoded app.',
    i.presetBody,
    [
      '<env note="snapshot at session start — use tools (Bash, Read) for current state">',
      `Working directory: ${i.cwd}`,
      `Platform: ${process.platform} (${process.arch})`,
      `Date: ${new Date().toDateString()}`,
      gitSnapshot(i.cwd),
      `YouCoded version: ${i.appVersion}`,
      '</env>',
    ].join('\n'),
    projectInstructions(i.cwd),
    'Prefer dedicated tools over shell: Read/Glob/Grep instead of cat/find/grep. Keep edits minimal and verify your work by running relevant commands after changing code.',
  ].filter((s): s is string => s !== null && s !== '');
  return sections.join('\n\n');
}
```

- [ ] **Step 3: The Coder-shaped default body** (`prompts/coder-default.ts`). Kept as its own module = diffable like an asset; raw `.txt` would need main-bundler asset config — revisit when Plan C's variant family lands (note this in the module comment). Write ORIGINAL text (leaked-source policy: our own words, informed only by public patterns):

```ts
// Plan A's single preset body (Coder-shaped). Plans B/C add the preset family
// + per-provider variants. Module-not-.txt is deliberate: main-process bundling
// of loose assets is Plan C scope. POLICY: this text is original — never paste
// prompt text from other tools.
export const CODER_DEFAULT_BODY = `You help the user work on their software project through conversation.

How you work:
- Understand before changing: read the relevant files (Read, Glob, Grep) before editing them.
- Plan multi-step work with TodoWrite and keep item statuses current as you go.
- Make focused edits with Edit or Write; prefer small, reviewable changes over rewrites.
- Verify your work: after changing code, run the project's tests or a relevant command with Bash and report what actually happened — never claim success you haven't observed.
- When a command or approach fails twice, stop and reconsider instead of repeating it.
- Explain what you did in plain language when you finish; the user may not be a developer.

Boundaries:
- Ask before anything destructive or hard to reverse.
- If the user's request is ambiguous, ask one clarifying question rather than guessing.`;
```

- [ ] **Step 4: Wire in host** — in `NativeSessionHost.create`/`resume`, build `systemPrompt: assembleSystemPrompt({ presetBody: CODER_DEFAULT_BODY, cwd, appVersion: app.getVersion() })` and pass through opts (get `appVersion` injected via the host constructor — `app` isn't importable in tests; follow how the host already receives injected functions). The Chat preset's `harness.systemPrompt` remains the fallback when `tools` is empty (v0 compat until Plan B's preset family).

- [ ] **Step 5: Tests + commit** — `git commit -am "feat(native): session-start prompt assembly (env snapshot, AGENTS.md walk-up) + coder default body"`

---

### Task 12: Host wiring — mode state, decide(), remember-rule, IPC + parity

**Files:**
- Modify: `src/main/harness/native-session-host.ts`
- Modify: `src/main/ipc-handlers.ts` (native block, ~line 1913)
- Modify: `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `app/src/main/kotlin/**/runtime/SessionService.kt`
- Modify: `tests/ipc-channels.test.ts`
- Test: extend `tests/native-session-host.test.ts`

- [ ] **Step 1: Host state.** Per-session `NativePermissionMode` (default `'ask'`), `PermissionStore` + `PermissionBroker` construction, and the decide closure passed into each HarnessSession:

```ts
private modeFor = new Map<string, NativePermissionMode>();

private buildDecide(sessionId: string, cwd: string) {
  return async (tool: string, subject: string | undefined) => decidePermission(tool, subject, {
    presetRules: [],                       // Plan B: preset manifests contribute here
    modeRules: rulesForMode(this.modeFor.get(sessionId) ?? 'ask'),
    denyList: DESTRUCTIVE_DENY_LIST,
    rememberedRules: await this.permissionStore.rulesFor(cwd),
  });
}
```

Session construction passes `tools: CORE_TOOLS`, `decide`, `askUser: (req) => this.broker.ask(req)`, `systemPrompt`. Subscribe each session's `remember-rule` → `permissionStore.remember(cwd, rule)`. `interrupt(sessionId)` calls `broker.cancelSession(sessionId)` FIRST, then the session's `interrupt()`.

- [ ] **Step 2: IPC.** In `ipc-handlers.ts` next to NATIVE_SET_BINDING:

```ts
  ipcMain.handle(IPC.NATIVE_SET_PERMISSION_MODE, async (_e, sessionId: string, mode: NativePermissionMode) =>
    nativeHost.setPermissionMode(sessionId, mode));
```

`setPermissionMode` validates the mode string (reject unknowns loudly), stores it, and returns the applied mode. Host test: set → decide reflects new mode on the NEXT call; pending asks are untouched (spec pending-ask ruling — assert a pending broker promise stays pending across a mode flip).

- [ ] **Step 3: Parity rows.** Follow the ipc-bridge rule exactly: preload row (inline channel string!), remote-shim `invoke('native:set-permission-mode', …)`, SessionService.kt `when` case returning the standard `{ok:false, error:'not-implemented-on-mobile'}` stub, and the `ipc-channels.test.ts` entry. Grep NATIVE_SET_BINDING in all four files and mirror each occurrence.

- [ ] **Step 4: Run** `npx vitest run tests/ipc-channels.test.ts tests/native-session-host.test.ts` → PASS; full suite green.

- [ ] **Step 5: Commit** — `git commit -am "feat(native): host wiring — per-session permission mode, remembered rules, IPC parity"`

---

### Task 13: Renderer — StatusBar chip for native modes + deny-listed Always-allow warning

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx` (PERMISSION_DISPLAY map ~line 72, chip ~line 692)
- Modify: the ToolCard approval component found in Task 8 Step 1
- Test: `tests/` — extend the nearest existing renderer test for StatusBar if present; otherwise reducer-level only (renderer visuals verified in Task 14's live pass)

- [ ] **Step 1: Chip.** Add native entries to `PERMISSION_DISPLAY` (plain words, no glyphs — standing preference): `ask: 'ASK FIRST'`, `'auto-edit': 'AUTO EDIT'`, `'full-auto': 'FULL AUTO'` with distinct colors reusing the existing palette conventions. Where the chip renders, branch on the active session's provider: native sessions read mode from session state and `onCyclePermission` calls `window.claude.native.setPermissionMode(sessionId, nextMode)` (ask → auto-edit → full-auto → ask) instead of the Shift+Tab PTY send; the applied mode returned by the IPC is authoritative (no screen-scrape correction needed — that's the point). Thread the native mode into StatusBar the same way `permissionMode` already arrives for CC sessions (trace its prop source and mirror).

- [ ] **Step 2: Consequence-gated Always-allow.** In the ToolCard approval UI, when the pending request's payload carries `denyListed: true`, the "Always allow" action first shows a plain-language inline confirm (reuse the existing destructive-confirm pattern from Settings — grep `consequence` or the delete-model confirm in the Local Models panel and reuse that component/pattern): "This lets the assistant run commands like this without asking, including ones that can delete files or push code. You can undo this later in Settings." Confirm → send the normal always-allow decision; cancel → back to the card.

- [ ] **Step 3: Verify hook-dispatcher passthrough** — `denyListed` must survive hook-dispatcher into the PERMISSION_REQUEST action (extend the action type + dispatcher mapping; `permissionSuggestions` shows the existing pattern for optional passthrough fields).

- [ ] **Step 4: Typecheck + suite + commit** — `git commit -am "feat(native): StatusBar native mode chip + consequence-gated always-allow"`

---

### Task 14: Docs, PITFALLS, fixtures sandbox pass, live acceptance

**Files:**
- Modify: `../../docs/PITFALLS.md` (workspace repo — commit separately there)
- Modify: `.claude/rules/native-runtime.md` (workspace repo)
- Create: `src/renderer/dev/fixtures/bash-awaiting-approval.jsonl`
- Modify: `../../docs/active/specs/2026-07-09-platform-vision-roadmap.md` Progress line (workspace repo, at merge time)

- [ ] **Step 1: Sandbox fixture for the approval state** (the one state no existing fixture covers):

```jsonl
{"type":"tool_use","id":"toolu_01BashAsk","name":"Bash","input":{"command":"npm test","description":"Run the test suite"}}
{"type":"permission_request","tool_use_id":"toolu_01BashAsk","requestId":"native-fixture-1","denyListed":false}
```

(Match the sandbox's actual fixture-line schema — open `src/renderer/dev/` sandbox loader first; if it only replays tool_use/tool_result lines, extend the loader to synthesize a PERMISSION_REQUEST for a `permission_request` line, with a WHY comment.)

- [ ] **Step 2: Sandbox visual pass** — `bash ../../scripts/run-sandbox.sh` (from the worktree root; confirm the script accepts the worktree path or run it with cwd set there). Every core-tool fixture renders; the awaiting-approval card shows Yes/No/Always.

- [ ] **Step 3: PITFALLS entries** (workspace repo, one commit):

```markdown
### Native harness (Phase 2 Plan A)
- **The Bash tool bypasses the file-tool guards** — secret-path denial and the
  cwd jail live in the file tools; `cat .env` through Bash defeats them, and the
  command-glob deny-list can't catch every phrasing. ACCEPTED limitation (CC has
  the same hole); the guards are honest friction, not a sandbox. Don't present
  them as a security boundary, and don't try to glob your way to one.
- **Permission precedence is two-tier:** tool-layer guards (secret paths,
  external_directory) sit BELOW all configuration and never yield; the
  destructive deny-list is CONFIG — an explicit remembered Always-allow beats
  it (by design, consequence-gated in UI). Guard: `permission-engine.test.ts`.
- **The read-before-edit registry resets on resume** (files change while a
  session is closed). Don't "optimize" it back from stored Read events.
- **HarnessSession's emit surface is FROZEN** — the tool loop only emits
  existing TranscriptEventType values. New loop states must map onto existing
  events (max_steps/doom_loop are permission asks, not new event types).
  Guard: `harness-session-loop.test.ts` + `tests/harness-sdk-toolcall-contract.test.ts`.
```

- [ ] **Step 4: Update `.claude/rules/native-runtime.md`** — add a "Native tools (Plan A)" section: the frozen-emit rule, the two-tier permission precedence, PERMISSION_RESPOND routing by `native-` prefix, the serialization contract now also covering ask-pauses, with `verify:` anchors pointing at the new test files.

- [ ] **Step 5: LIVE ACCEPTANCE (the plan exit test).** Dev build:

```bash
cd /c/Users/desti/youcoded-dev && YOUCODED_NATIVE=1 bash scripts/run-dev.sh
```

In the dev window: create a YouCoded-runtime session against an OpenRouter frontier model (key already configured from Phase 1) in a scratch project containing a seeded, findable bug (prepare `../scratch-native-accept/` with a small Node project + one obvious bug + a failing test). Then verify, in one session:
  1. "Fix the failing test in this project" → model greps/reads, TodoWrite plan card renders, Edit shows a diff card, Bash asks permission (mode `ask`) → approve → test run streams → turn completes with usage in the per-turn strip.
  2. Deny a Bash ask → model adapts (visible refusal-result handling), no crash, turn continues.
  3. Flip the chip to full-auto mid-session → next Bash runs without asking; `git push` phrasing still asks + Always-allow shows the warning.
  4. ESC during a running Bash → command dies, turn ends with the interrupt marker, no stuck `isThinking`.
  5. Restart the dev app → resume the session → history intact (tool cards render from replay) → "what did you change?" answers correctly (history rebuild worked) → an immediate Edit without a fresh Read is rejected (registry reset).
  6. Remote browser (`http://localhost:9950`): open the same session; tool cards + a permission ask render and the ask is answerable remotely.

Record each item's result in the PR description. Any failure → fix before merge, re-run the failed item.

- [ ] **Step 6: Shut the dev server down** (port 5223 must be free for the next session), commit remaining changes.

---

### Task 15: Final review, PR, merge hygiene

- [ ] **Step 1: Subagent-readiness review checklist** (spec decision 5 — verify, don't build): the driver takes emit sink + identity via constructor ✓/✗; nothing in loop/store assumes a user-facing session ✓/✗; store header could gain a parent pointer additively ✓/✗. Note the answers in the PR body.
- [ ] **Step 2: Self-review the diff against the spec §2** (each §2.x maps to a merged task — list the mapping in the PR body). Run `/code-review` on the branch.
- [ ] **Step 3: Full suite + typecheck one last time** (`npm test -- --run && npx tsc --noEmit`).
- [ ] **Step 4: PR** — `gh pr create` in youcoded: title "Phase 2 Plan A: native harness tool loop + permissions", body = task list, live-acceptance results, subagent-readiness answers, PITFALLS/rules cross-repo commits linked. Merge = merge AND push.
- [ ] **Step 5: After merge:** update the roadmap Progress line + flip nothing in ROADMAP yet (StatusBar chips item is Plan C; subagents item stays open). Remove the worktree (junction warning applies if you junctioned node_modules — you didn't, Task 0 used `npm ci`): `git worktree remove ../youcoded-worktrees/feat-native-tools && git branch -D feat/native-tools` after confirming the merge commit is on master.

---

## Self-review notes (spec §2 → task mapping)

| Spec section | Task(s) |
|---|---|
| §2.1 turn driver (steps, doom-loop, retry, truncated-call, interrupt, maxSteps-ask) | 9 |
| §2.2 prompt assembly (snapshot env, walk-up, byte-stable) | 11 |
| §2.3 defineTool + 7 tools + guards + known-limitation | 3, 5, 6, 14 |
| §2.4 permission engine + layers + broker + pending-ask rulings + chip + warning | 2, 4, 7, 8, 12, 13 |
| §2.5 persistence + rebuild + registry reset | 10 |
| §2.6 IPC + parity + remote | 2, 8, 12, 14(step 5.6) |
| Testing pyramid (§5, Plan-A slice) | 1, 3–13 test steps |
| Docs obligations (§7) | 1 (provider-deps), 14 |

Known deliberate deviations from the spec, called out for the record: prompt bodies ship as TS modules rather than `.txt` assets (main-process bundler asset config deferred to Plan C's variant family — noted in the module comment); Grep ships a CC-compatible subset of flags (pattern/path/glob/output_mode) rather than the full CC surface.
