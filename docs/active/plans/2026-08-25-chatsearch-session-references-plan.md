---
status: active
created: 2026-08-25
spec: docs/active/specs/2026-08-10-chatsearch-session-references-design.md
handoff: docs/active/handoffs/2026-08-10-chatsearch-state-of-play.md
---

# Chat Search — Session References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the assistant searches past conversations, the results become cards with **Preview** (read the old chat in the artifact pane) and **Resume** (reopen it as a tab) — on both the Claude and native lanes, without changing the chatsearch plugin.

**Architecture:** Renderer-first. Phase A builds every new UI surface in the UI Workbench against a fake `chatsearch` namespace, with a **first look after the cards alone** (Task 4) and a **sign-off gate before any backend** (Task 7). Phase B then builds the two main-process pieces the UI was designed against (`chatsearch:resolve` — short id → index entry + resumability; `chatsearch:read` — id → bounded transcript slice for both lanes), wires four IPC surfaces, and connects Resume to the existing `handleResumeSession`. Rendering `show` as its own turn segment is **designed but conditional** (Task 14): it is built only if Destin, having seen `show` inside an ordinary tool group, wants it set apart.

**Tech Stack:** TypeScript, React 18, Vitest, Electron IPC (preload / remote-shim / ipc-handlers / remote-server WS / SessionService.kt stub), the app-owned chatsearch index at `~/.youcoded/chatsearch/<provider>-meta.json`.

## Global Constraints

- All app paths are relative to `youcoded/desktop/` unless prefixed. Line numbers are against `youcoded` master `df96b4a5` (2026-08-25) — re-check with `rg` if the file has moved. Work in a worktree (`superpowers:using-git-worktrees`); copy `node_modules` with `cp -al`, never symlink.
- **Task 0 is a go/no-go.** Phase 1 search has never been exercised by a human; the handoff says to do that before building on it. Destin decides.
- **Phase A stops at Task 7 (sign-off gate). Phase B does not start until Destin has approved the workbench UI.** Task 4 is an earlier, shorter look at the cards alone.
- **The plugin does not change** in Phases A–B. Ids are resolved in-app. The only plugin edit (Task 17) is a `SKILL.md` sentence in a separate repo; nothing in the app depends on it.
- New IPC channels are exactly two: `chatsearch:resolve`, `chatsearch:read`. Each appears in `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts` (via constant), `remote-server.ts` (WS case), `SessionService.kt` (stub), and `tests/ipc-channels.test.ts`.
- **Android answers both with `not-implemented-on-mobile`** (it has no chatsearch index). The renderer treats that reply as "not a card" and falls back to plain Bash.
- `ToolCallStatus` is `'running' | 'complete' | 'failed' | 'awaiting-approval'` (`src/shared/types.ts:351`). The finished state is **`'complete'`**, not `'completed'`. Never cast a test fixture `as ToolCallState` — build it as the real type so a wrong string fails to compile.
- Reads are always bounded: `tail` is required, capped at 200; there is no `all`.
- The reader keeps every assistant text block (no `stop_reason === 'end_turn'` filter). Tool-use events are dropped and **counted** per gap.
- `MarkdownContent` is rendered **without** `sessionId` for transcript bubbles.
- **All user-facing copy lives in `src/shared/chatsearch-refs.ts` `COPY`** so the workbench can show every sentence — including Phase B's error strings — at the gate. Disabled-Resume reasons are verbatim from `ResumeBrowser.tsx:978`. Provider is never shown raw (`claude` / `native`); `providerLabel()` maps it.
- Chatsearch cards are **expanded by default** (ordinary tool cards collapse; a card whose whole point is two buttons must not hide them). Destin can reverse this at Task 4.
- Every non-trivial edit carries a WHY comment (Destin reads code through comments).
- Before claiming any task done: `bash scripts/verify.sh <worktree>` from the workspace root, green. After any mock-shim or fixture change: `node scripts/workbench-boot-check.mjs` (it loads eleven routes headless).
- Commit after every task; message prefix `feat(chatsearch-refs):`.
- Known, accepted: a session reopened with `claude --resume` rebuilds history text-only (`HISTORY_LOADED`, `chat-reducer.ts:1739`), so cards from before the resume do not survive it. Pre-existing for every tool card; not a regression to file.

---

## File map

**Create**
- `src/shared/chatsearch-refs.ts` — shared types, `COPY`, `providerLabel`, the pure output parser, `describeChatsearchCall`, `isChatsearchCommand`.
- `src/main/chatsearch-index/ipc-channels.ts` — `CHATSEARCH_IPC`.
- `src/main/chatsearch-index/meta-reader.ts` — `readMetaFile`, `resolveShortIds`.
- `src/main/chatsearch-index/transcript-reader.ts` — parsers, `sliceMessages`, containment, `readTranscriptSlice`, per-file parse cache.
- `src/main/chatsearch-index/refs-service.ts` — binds the readers to this device's folders; used by IPC and WS.
- `src/renderer/components/tool-views/ChatsearchFindCard.tsx`, `ChatsearchShowCard.tsx`, `SessionRefActions.tsx`.
- `src/renderer/hooks/useResolvedConversations.ts`, `src/renderer/hooks/useSessionPreviewListener.ts`.
- `src/renderer/components/project-view/ConversationTranscript.tsx` — bubble list extracted from `ConversationPreview` (markdown, gap markers).
- `src/renderer/components/SessionPreviewPane.tsx`.
- `src/renderer/dev/workbench/fixtures/chatsearch.ts` — the fake index (hex uuids, every state).
- `src/renderer/dev/workbench/fixtures/tools/chatsearch-find.jsonl`, `chatsearch-show.jsonl`, `chatsearch-find-piped.jsonl`.
- Tests: `tests/chatsearch-refs-parser.test.ts`, `tests/chatsearch-cards.test.tsx`, `tests/conversation-transcript.test.tsx`, `tests/session-preview-pane.test.tsx`, `tests/artifact-tracker-preview.test.ts`, `tests/session-preview-listener.test.tsx`, `tests/chatsearch-meta-reader.test.ts`, `tests/chatsearch-transcript-reader.test.ts`, `tests/subagent-exclusion.test.ts`, fixtures under `tests/fixtures/chatsearch/`.

**Modify**
- `src/renderer/components/tool-views/ToolBody.tsx:937` (`case 'Bash'`), `src/renderer/components/ToolCard.tsx:60` (Bash label) and `:958` (expanded default).
- `src/renderer/state/artifact-tracker.ts`, `src/renderer/components/SessionDrawer.tsx` (`:607` early return, `:728` viewer, list column), `src/renderer/components/ChatView.tsx:107-113`.
- `src/renderer/components/project-view/ConversationPreview.tsx`.
- `src/renderer/components/AssistantTurnBubble.tsx:204` (`splitIntoBubbles` unknown-segment guard), `src/renderer/state/__tests__/chat-serialization.test.ts`.
- `src/renderer/App.tsx` (~`:224`, next to the `youcoded:open-model-providers` listener; `handleResumeSession` is at `:2282`).
- `src/renderer/dev/workbench/mock-shim.ts`, `mock-only.ts`, `fixtures/conversations/claude-code.jsonl`.
- `src/main/preload.ts:1393`, `src/renderer/remote-shim.ts:1303`, `src/main/ipc-handlers.ts:3581`, `src/main/remote-server.ts:798`, `../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3686-3698`, `tests/ipc-channels.test.ts:552`.
- Conditional (Task 14): `src/renderer/state/chat-types.ts:28-45`, `src/renderer/state/chat-reducer.ts:1143-1312`, `AssistantTurnBubble.tsx`.
- `wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/SKILL.md` (Task 17).

---

### Task 0: Go / no-go — exercise phase 1 by hand (Destin, ~20 minutes)

The handoff (`docs/active/handoffs/2026-08-10-chatsearch-state-of-play.md`, "The gap") says phase 1 has never been used by a person and lists six checks. If recall is poor, cards would be "a better frame around the wrong picture."

- [ ] `cd /home/destin/youcoded-dev && bash scripts/run-dev.sh master --label "Chat Search check"` (never the installed app).
- [ ] Destin asks the assistant, in his own words, about three things he genuinely remembers working on — at least one done on another device — **without** saying "search". Note: did it reach for chatsearch unprompted? Did the right conversation appear? Did a `†` row still show a real title and date? Did `show` alone answer, or did it need `turns`/`tail`?
- [ ] Record the answers as a dated paragraph under "The gap" in the handoff. **Destin says go or no-go.** No-go means: fix recall first (that is chatsearch phase work, not this plan).

---

# Phase A — UI in the workbench (ends at the sign-off gate)

### Task 1: Shared types, copy, and the pure parser

**Files:**
- Create: `src/shared/chatsearch-refs.ts`
- Test: `tests/chatsearch-refs-parser.test.ts`

**Interfaces:**
- Produces: every type and constant below; `describeChatsearchCall(tool): ChatsearchCall | null`; `isChatsearchCommand(command): boolean`; `parseFindShortIds(output): string[]`; `parseShowId(output): { id; provider } | null`; `providerLabel(p): string`; `COPY`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/chatsearch-refs-parser.test.ts
import { describe, it, expect } from 'vitest';
import {
  describeChatsearchCall, isChatsearchCommand, parseFindShortIds, parseShowId, providerLabel, TRUNCATION_MARKERS,
} from '../src/shared/chatsearch-refs';
import type { ToolCallState } from '../src/shared/types';

const CMD = `node "/home/x/.claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js" '{"cmd":"find","query":"sync"}'`;
const FIND_OUT = [
  'index last refreshed 3d ago — open YouCoded to refresh',
  'a3f2  2026-07-26  youcoded      ✓   Permission ask timeout          #perm #ui',
  '9c14  2026-07-22  youcoded-dev  ?†  Native runtime parity program   #native',
  '1b07f ----------  my project    ○   Row with no known date',
  'showing 3 of 41 — raise limit or narrow the filters',
].join('\n');
const SHOW_OUT = [
  '773634bb-621e-4d84-8d51-903093478ee8  Chat Search Workstream Status',
  'project:    youcoded-dev  (/home/destin/youcoded-dev)',
  'provider:   claude',
  'created:    2026-08-06T04:53:34.394Z',
].join('\n');

// Built as the REAL type on purpose: a wrong status string must fail to compile.
function bash(command: string, response?: string, status: ToolCallState['status'] = 'complete'): ToolCallState {
  return { toolUseId: 't1', toolName: 'Bash', input: { command }, status, response };
}

describe('parseFindShortIds', () => {
  it('returns one id per table row, ignoring banner and trailer, including a dateless row', () => {
    expect(parseFindShortIds(FIND_OUT)).toEqual(['a3f2', '9c14', '1b07f']);
  });
  it('returns [] for the no-index and no-match messages', () => {
    expect(parseFindShortIds('no chatsearch index exists on this device — open YouCoded to build it')).toEqual([]);
    expect(parseFindShortIds('no conversations matched (40 indexed). Try dropping a filter.')).toEqual([]);
  });
});

describe('parseShowId', () => {
  it('reads the full uuid and provider from the metadata block', () => {
    expect(parseShowId(SHOW_OUT)).toEqual({ id: '773634bb-621e-4d84-8d51-903093478ee8', provider: 'claude' });
  });
  it('returns null when the first line is not a uuid', () => {
    expect(parseShowId('unknown id a3f2')).toBeNull();
  });
});

describe('isChatsearchCommand', () => {
  it('is true for argv and stdin-heredoc forms, and with a harmless 2>&1', () => {
    expect(isChatsearchCommand(CMD)).toBe(true);
    expect(isChatsearchCommand(`cat <<'JSON' | node "/x/chatsearch.js"\n{"cmd":"show","id":"7736"}\nJSON`)).toBe(true);
    expect(isChatsearchCommand(`${CMD} 2>&1`)).toBe(true);
  });
  it('is false for pipes or redirects AFTER the script, and for non-chatsearch commands', () => {
    expect(isChatsearchCommand(`${CMD} | head -40`)).toBe(false);
    expect(isChatsearchCommand(`${CMD} > /tmp/out.txt`)).toBe(false);
    expect(isChatsearchCommand('ls -la')).toBe(false);
  });
});

describe('describeChatsearchCall', () => {
  it('describes a find call from its output', () => {
    expect(describeChatsearchCall(bash(CMD, FIND_OUT))).toEqual({ cmd: 'find', shortIds: ['a3f2', '9c14', '1b07f'] });
  });
  it('describes a show call from its output, even when the command says nothing about show', () => {
    const stdinCmd = `cat <<'JSON' | node "/x/chatsearch.js"\n{"cmd":"show","id":"7736"}\nJSON`;
    expect(describeChatsearchCall(bash(stdinCmd, SHOW_OUT))).toEqual({ cmd: 'show', id: '773634bb-621e-4d84-8d51-903093478ee8', provider: 'claude' });
  });
  it('is null for non-Bash tools and non-chatsearch commands', () => {
    expect(describeChatsearchCall({ ...bash(CMD, FIND_OUT), toolName: 'Read' })).toBeNull();
    expect(describeChatsearchCall(bash('ls -la', 'a3f2  2026-07-26  x  ✓  t'))).toBeNull();
  });
  it('is null while running, failed, awaiting approval, or without output', () => {
    expect(describeChatsearchCall(bash(CMD, undefined, 'running'))).toBeNull();
    expect(describeChatsearchCall(bash(CMD, FIND_OUT, 'failed'))).toBeNull();
    expect(describeChatsearchCall(bash(CMD, undefined, 'awaiting-approval'))).toBeNull();
    expect(describeChatsearchCall(bash(CMD, ''))).toBeNull();
  });
  it('is null when the output carries ANY known truncation marker', () => {
    for (const m of TRUNCATION_MARKERS) expect(describeChatsearchCall(bash(CMD, `${FIND_OUT}\n${m}\nmore`))).toBeNull();
  });
  it('is null for chatsearch output that is not a table (no index, empty result)', () => {
    expect(describeChatsearchCall(bash(CMD, 'no chatsearch index exists on this device — open YouCoded to build it'))).toBeNull();
    expect(describeChatsearchCall(bash(CMD, 'no conversations matched (40 indexed).'))).toBeNull();
  });
});

describe('providerLabel', () => {
  it('never shows the raw lane name', () => {
    expect(providerLabel('claude')).toBe('Claude Code');
    expect(providerLabel('native')).toBe('YouCoded assistant');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/chatsearch-refs-parser.test.ts`
Expected: FAIL — `Cannot find module '../src/shared/chatsearch-refs'`.

- [ ] **Step 3: Write the module**

```ts
// src/shared/chatsearch-refs.ts
//
// Shared contract for "session references": the two IPC channels the renderer
// uses to turn a chatsearch tool call into Preview / Resume cards, every piece
// of user-facing copy the feature shows, and the PURE parser that decides
// whether a Bash call is a chatsearch call at all.
//
// WHY the parser lives in shared/ and not the renderer: ToolCard (header label,
// expanded default) and ToolBody (card body) both need the same answer, and a
// unit test must run it without React. One function, two consumers — they can
// never disagree about what a call is.
import type { ToolCallState } from './types';

export type ChatsearchProvider = 'claude' | 'native';

/** Lane names are developer jargon; users see these. */
export function providerLabel(p: string): string {
  return p === 'native' ? 'YouCoded assistant' : 'Claude Code';
}

/** Every sentence this feature shows. Rendered in the workbench at the gate. */
export const COPY = {
  preview: 'Preview',
  resume: 'Resume',
  resumeNative: 'Resume…',
  previewHint: 'Read this conversation in the side pane',
  resumeHint: 'Continue this conversation in a new tab',
  resumeNativeHint: 'Pick a model, then continue this conversation in a new tab',
  // Verbatim from ResumeBrowser.tsx:978 — the Resume Browser already teaches
  // users these two sentences; the card must not invent a third.
  resumeMissingProject: 'Project folder not on this device',
  resumeNotSynced: 'Not synced to this device yet',
  previewTombstone: 'Transcript is no longer on this device',
  unknownId: 'Not in the index on this device',
  ambiguousId: (n: number) => `Matches ${n} conversations`,
  lookingUp: (n: number) => `Looking up ${n} conversation${n === 1 ? '' : 's'}…`,
  headerFind: (n: number) => `Found ${n} past conversation${n === 1 ? '' : 's'}`,
  headerShow: 'Past conversation',
  paneSubtitle: (p: string) => `Past conversation · read-only · ${providerLabel(p)}`,
  untitled: 'Untitled conversation',
  toolsNotShown: (n: number) => `${n} tool call${n === 1 ? '' : 's'} not shown`,
  startOfConversation: 'start of conversation',
  loadOlder: 'Load older',
  rawOutput: 'Raw output',
  referencedHeading: 'Referenced conversations',
  // Phase B error strings (main process). Listed here so the gate can show them.
  errNotAnId: 'Not a conversation id',
  errNotIndexed: 'This conversation is not in the index on this device',
  errNotAConversation: 'This file is a helper transcript, not a conversation',
  errOutsideRoots: 'Transcript is stored outside the folders YouCoded may read',
  errReadPrefix: "Couldn't read this transcript: ",
} as const;

/** What `chatsearch:resolve` returns per requested id. */
export type ResolvedConversation =
  | {
      status: 'ok';
      id: string;
      provider: ChatsearchProvider;
      /** '' when untitled. */
      title: string;
      projectName: string;
      originalPath: string;
      lastActive: string;
      createdAt: string;
      tags: string[];
      complete: boolean;
      tombstone: boolean;
      /** Resume prerequisites — same computation as the Resume Browser. */
      projectSlug: string;
      projectPath: string;
      missingProject: boolean;
      notSyncedYet: boolean;
    }
  | { status: 'unknown'; query: string }
  | { status: 'ambiguous'; query: string; candidates: string[] };

export type ChatsearchResolveResponse =
  | { ok: true; results: ResolvedConversation[] }
  | { ok: false; error: string };

/** One transcript message as the preview renders it. */
export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Ordinal in the FULL conversation — `before: seq` pages backwards. */
  seq: number;
  /** Tool calls that ran between the previous kept message and this one. */
  droppedToolCalls: number;
}

export interface ChatsearchReadRequest {
  provider: ChatsearchProvider;
  id: string;
  /** Messages to return, counted back from the end (or from `before`). 1..200. */
  tail: number;
  /** Return messages with seq < before. Omit for the newest slice. */
  before?: number;
}

export type ChatsearchReadResponse =
  | { ok: true; messages: TranscriptMessage[]; hasMore: boolean }
  | { ok: false; error: string };

export const READ_TAIL_MAX = 200;
export const READ_TAIL_DEFAULT = 40;

/**
 * Output that reached us may be partial. Three producers, three markers:
 * the native harness (main/harness/tools/truncate.ts) by chars and by lines,
 * and Claude Code, which truncates long tool results in the transcript.
 */
export const TRUNCATION_MARKERS = ['[...]', '[... ', 'characters truncated]'] as const;

export type ChatsearchCall =
  | { cmd: 'find'; shortIds: string[] }
  | { cmd: 'show'; id: string; provider: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A find row: <short id>  <yyyy-mm-dd | ---------->  … — the id is a uuid
// prefix (hex and dashes, ≥4 chars, chatsearch.js MIN_SHORT_ID); the CLI prints
// ten dashes when the date is unknown (chatsearch.js:63).
const FIND_ROW_RE = /^([0-9a-f-]{4,36})\s{2,}(?:\d{4}-\d{2}-\d{2}|-{10})\s{2,}/;

export function parseFindShortIds(output: string): string[] {
  const ids: string[] = [];
  for (const line of output.split('\n')) {
    const m = FIND_ROW_RE.exec(line);
    if (m) ids.push(m[1]);
  }
  return ids;
}

export function parseShowId(output: string): { id: string; provider: string } | null {
  const lines = output.split('\n');
  const id = (lines[0] ?? '').trim().split(/\s+/)[0] ?? '';
  if (!UUID_RE.test(id)) return null;
  const provLine = lines.find((l) => l.startsWith('provider:'));
  return { id, provider: provLine ? provLine.slice('provider:'.length).trim() : '' };
}

/** Does this command run chatsearch with its stdout intact? Decidable from the
 *  command alone, so ToolCard can expand the card before the output exists. */
export function isChatsearchCommand(command: string): boolean {
  const idx = command.indexOf('chatsearch.js');
  if (idx < 0) return false;
  // Anything after the script that pipes or redirects stdout means the output
  // we hold may be partial — never build a card on it. `2>&1` loses nothing.
  // The stdin heredoc form (`cat <<'JSON' | node …chatsearch.js`) pipes INTO
  // the script, which is fine, so only the text AFTER the script is inspected.
  const after = command.slice(idx + 'chatsearch.js'.length).replace(/2>&1/g, '');
  return !/[|>]/.test(after);
}

/**
 * Is this tool call a finished chatsearch invocation whose output can be
 * turned into a card? Returns null for "render it as plain Bash".
 */
export function describeChatsearchCall(tool: ToolCallState): ChatsearchCall | null {
  if (tool.toolName !== 'Bash') return null;
  const command = typeof tool.input?.command === 'string' ? tool.input.command : '';
  if (!isChatsearchCommand(command)) return null;
  if (tool.status !== 'complete') return null;
  const output = tool.response ?? '';
  if (!output.trim()) return null;
  if (TRUNCATION_MARKERS.some((m) => output.includes(m))) return null;
  // The subcommand is read from the OUTPUT, never the command line: `cmd`
  // defaults to find when absent and the request may arrive on stdin.
  const show = parseShowId(output);
  if (show) return { cmd: 'show', ...show };
  const shortIds = parseFindShortIds(output);
  return shortIds.length ? { cmd: 'find', shortIds } : null;
}
```

- [ ] **Step 4: Run the tests** — `npx vitest run tests/chatsearch-refs-parser.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/chatsearch-refs.ts tests/chatsearch-refs-parser.test.ts
git commit -m "feat(chatsearch-refs): shared types, copy, and pure parser for chatsearch tool output"
```

---

### Task 2: Workbench fake backend + fixtures (every state reachable)

**Files:**
- Create: `src/renderer/dev/workbench/fixtures/chatsearch.ts`
- Modify: `src/renderer/dev/workbench/mock-only.ts`, `mock-shim.ts` (`HAND_WRITTEN` ~`:9-44`; namespaces ~`:550`)
- Create: `fixtures/tools/chatsearch-find.jsonl`, `chatsearch-show.jsonl`, `chatsearch-find-piped.jsonl`
- Modify: `fixtures/conversations/claude-code.jsonl` (append a Read → show → Read run)
- Test: `tests/workbench-mock-contract.test.ts` (existing — stays green)

**Why a separate fixture table:** seeded past sessions have ids like `wb-past-0` (`scenarios.ts:76`), which the hex-only parser rejects, and none carry `missingProject` / `notSyncedYet` / tombstone. The cards need every state on the Task 7 checklist to be reachable, so the fake index is its own table with real uuids.

- [ ] **Step 1: The fake index**

```ts
// src/renderer/dev/workbench/fixtures/chatsearch.ts
// Fake chatsearch index for designing the session-reference cards. One entry
// per STATE the UI must show, keyed by uuid so the real parser accepts the
// short ids in the tool fixtures. Special id: CS_ERR_READ makes chatsearch.read
// fail with a real-looking error.
import type { ResolvedConversation } from '../../../../shared/chatsearch-refs';

type Ok = Extract<ResolvedConversation, { status: 'ok' }>;
const base = (over: Partial<Ok>): Ok => ({
  status: 'ok', id: '', provider: 'claude', title: '', projectName: 'youcoded', originalPath: '/home/destin/youcoded-dev/youcoded',
  lastActive: '2026-07-26T03:14:09.000Z', createdAt: '2026-07-25T18:02:11.000Z', tags: [], complete: false, tombstone: false,
  projectSlug: '-home-destin-youcoded-dev-youcoded', projectPath: '/home/destin/youcoded-dev/youcoded', missingProject: false, notSyncedYet: false, ...over,
});

export const CS_RESUMABLE = 'a3f2aaaa-1111-4111-8111-111111111111';
export const CS_MISSING_PROJECT = '9c14bbbb-2222-4222-8222-222222222222';
export const CS_NOT_SYNCED = '1b07cccc-3333-4333-8333-333333333333';
export const CS_TOMBSTONE = '5e11dddd-4444-4444-8444-444444444444';
export const CS_NATIVE = '7a21eeee-5555-4555-8555-555555555555';
export const CS_UNTITLED = 'c0deffff-6666-4666-8666-666666666666';
export const CS_ERR_READ = 'ee0011aa-7777-4777-8777-777777777777';

export const CHATSEARCH_FIXTURE: Ok[] = [
  base({ id: CS_RESUMABLE, title: 'Permission ask timeout', tags: ['perm', 'ui'], complete: true }),
  base({ id: CS_MISSING_PROJECT, title: 'Native runtime parity program', projectName: 'youcoded-dev', originalPath: '/Users/destin/youcoded-dev', lastActive: '2026-07-22T10:00:00.000Z', tags: ['native'], missingProject: true, projectSlug: '', projectPath: '' }),
  base({ id: CS_NOT_SYNCED, title: 'Remote hydration hardening', lastActive: '2026-07-19T10:00:00.000Z', notSyncedYet: true }),
  base({ id: CS_TOMBSTONE, title: 'Old theme experiment', lastActive: '2026-05-02T10:00:00.000Z', tombstone: true }),
  base({ id: CS_NATIVE, title: 'Draft the newsletter', provider: 'native', projectName: 'writing', lastActive: '2026-08-01T10:00:00.000Z' }),
  base({ id: CS_UNTITLED, title: '', lastActive: '2026-08-10T10:00:00.000Z' }),
  base({ id: CS_ERR_READ, title: 'Conversation whose file is unreadable', lastActive: '2026-08-12T10:00:00.000Z' }),
];

export function resolveFixture(q: string): ResolvedConversation {
  const hits = CHATSEARCH_FIXTURE.filter((c) => c.id.startsWith(q));
  if (hits.length === 0) return { status: 'unknown', query: q };
  if (hits.length > 1) return { status: 'ambiguous', query: q, candidates: hits.map((h) => h.id) };
  return hits[0];
}
```

- [ ] **Step 2: Register mock-only channels and the fake namespace**

`mock-only.ts` — replace the empty array body:

```ts
export const MOCK_ONLY: ReadonlyArray<{ channel: string; feature: string }> = [
  // Session references (spec 2026-08-10): designed in the workbench first.
  // These come OFF the list in Phase B when the real IPC lands — the contract
  // test fails if they stay here after preload.ts gains the channel.
  { channel: 'chatsearch.resolve', feature: 'chatsearch session references — Preview/Resume cards' },
  { channel: 'chatsearch.read', feature: 'chatsearch session references — transcript preview pane' },
];
```

`mock-shim.ts` — add `'chatsearch.resolve', 'chatsearch.read',` to `HAND_WRITTEN`; import `{ resolveFixture, CS_ERR_READ } from './fixtures/chatsearch'`; add beside the `project` namespace and include `chatsearch,` in the returned object:

```ts
  const chatsearch = {
    resolve: async (shortIds: string[]) => ({ ok: true as const, results: shortIds.map(resolveFixture) }),
    read: async (req: { provider: string; id: string; tail: number; before?: number }) => {
      if (req.id === CS_ERR_READ) return { ok: false as const, error: "EACCES: permission denied, open '/home/destin/YouCoded/Personal/Conversations/claude/transcripts/youcoded/ee0011aa.jsonl'" };
      // 60 fake messages; every 4th assistant message follows a "tool gap".
      const total = 60;
      const end = Math.min(req.before ?? total, total);
      const start = Math.max(0, end - Math.min(req.tail, 200));
      const messages = [];
      for (let seq = start; seq < end; seq++) {
        const assistant = seq % 2 === 1;
        messages.push({
          role: assistant ? 'assistant' : 'user',
          content: assistant
            ? `Here is what I found for step ${seq}:\n\n\`\`\`ts\nconst x = ${seq};\n\`\`\`\n\n- one\n- two`
            : `User question number ${seq}`,
          timestamp: Date.now() - (total - seq) * 60_000,
          seq,
          droppedToolCalls: assistant && seq % 4 === 3 ? 3 : 0,
        });
      }
      return { ok: true as const, messages, hasMore: start > 0 };
    },
  };
```

- [ ] **Step 3: Tool-gallery fixtures (cards in isolation)**

`fixtures/tools/chatsearch-find.jsonl` — the seven fixture ids' first four characters, plus one unknown:

```
{"type":"tool_use","id":"toolu_01ChatsearchFind","name":"Bash","input":{"command":"node \"/home/destin/.claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js\" '{\"cmd\":\"find\",\"query\":\"sync\",\"limit\":8}'","description":"Search past conversations about sync"}}
{"tool_use_id":"toolu_01ChatsearchFind","type":"tool_result","content":"a3f2  2026-07-26  youcoded      ✓   Permission ask timeout          #perm #ui\n9c14  2026-07-22  youcoded-dev  ?   Native runtime parity program   #native\n1b07  2026-07-19  youcoded      ○   Remote hydration hardening\n5e11  2026-05-02  youcoded      ?†  Old theme experiment\n7a21  2026-08-01  writing       ?   Draft the newsletter\nc0de  2026-08-10  youcoded      ?   (untitled)\nee00  2026-08-12  youcoded      ?   Conversation whose file is unreadable\nzzzz  ----------  nowhere       ?   Row whose id resolves to nothing\nshowing 8 of 41 — raise limit or narrow the filters","is_error":false}
```

`chatsearch-show.jsonl`:

```
{"type":"tool_use","id":"toolu_01ChatsearchShow","name":"Bash","input":{"command":"cat <<'JSON' | node \"/home/destin/.claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js\"\n{\"cmd\":\"show\",\"id\":\"a3f2\"}\nJSON","description":"Open the permission-timeout conversation"}}
{"tool_use_id":"toolu_01ChatsearchShow","type":"tool_result","content":"a3f2aaaa-1111-4111-8111-111111111111  Permission ask timeout\nproject:    youcoded  (/home/destin/youcoded-dev/youcoded)\nprovider:   claude\ncreated:    2026-07-25T18:02:11.000Z\nlastActive: 2026-07-26T03:14:09.000Z\nstate:      resolved\ntags:       perm, ui\nnote:       (none)\nindexed:    31 user turns, 4864681 bytes of transcript\ntranscript: /home/destin/.claude/projects/-home-destin-youcoded-dev/a3f2aaaa-1111-4111-8111-111111111111.jsonl\n\nfirst message:\n  the permission prompt never times out — can we add a timeout?","is_error":false}
```

`chatsearch-find-piped.jsonl` — identical to `chatsearch-find.jsonl` but the command ends in ` | head -3`. Must render as plain Bash.

- [ ] **Step 4: Scenario conversation (cards in context — this is what the gate looks at)**

Append to `fixtures/conversations/claude-code.jsonl`, matching its existing line shapes (`assistant_text`, `tool_use`, `tool_result`):

```
{"type":"assistant_text","text":"Let me check whether we discussed that before."}
{"type":"tool_use","id":"cs-find","name":"Bash","input":{"command":"node \"/home/destin/.claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js\" '{\"cmd\":\"find\",\"query\":\"permission timeout\"}'","description":"Search past conversations"}}
{"type":"tool_result","tool_use_id":"cs-find","content":"a3f2  2026-07-26  youcoded      ✓   Permission ask timeout          #perm #ui\n9c14  2026-07-22  youcoded-dev  ?   Native runtime parity program   #native\nshowing 2 of 2"}
{"type":"tool_use","id":"cs-read1","name":"Read","input":{"file_path":"/home/destin/youcoded-dev/youcoded/desktop/src/main/permissions.ts"}}
{"type":"tool_result","tool_use_id":"cs-read1","content":"1  // permissions"}
{"type":"tool_use","id":"cs-show","name":"Bash","input":{"command":"node \"/home/destin/.claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js\" '{\"cmd\":\"show\",\"id\":\"a3f2\"}'","description":"Open the July 26 conversation"}}
{"type":"tool_result","tool_use_id":"cs-show","content":"a3f2aaaa-1111-4111-8111-111111111111  Permission ask timeout\nproject:    youcoded  (/home/destin/youcoded-dev/youcoded)\nprovider:   claude\ncreated:    2026-07-25T18:02:11.000Z\nlastActive: 2026-07-26T03:14:09.000Z\nstate:      resolved\ntags:       perm, ui\nnote:       (none)\nindexed:    31 user turns, 4864681 bytes of transcript\ntranscript: /home/destin/.claude/projects/-home-destin-youcoded-dev/a3f2aaaa-1111-4111-8111-111111111111.jsonl"}
{"type":"tool_use","id":"cs-read2","name":"Read","input":{"file_path":"/home/destin/youcoded-dev/youcoded/desktop/src/main/permission-store.ts"}}
{"type":"tool_result","tool_use_id":"cs-read2","content":"1  // store"}
{"type":"assistant_text","text":"Yes — on July 26 we added the timeout. That's the conversation above."}
```

This replays through the real reducer and real turn renderer, so Destin sees `show` **inside a tool group between two Reads** — the thing Task 14 exists to change if he dislikes it — and Preview works because `ChatView` is mounted.

- [ ] **Step 5: Verify** — `npx vitest run tests/workbench-mock-contract.test.ts tests/workbench-fixture-actions.test.ts && cd /home/destin/youcoded-dev && node scripts/workbench-boot-check.mjs` → PASS, eleven routes OK.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/dev/workbench
git commit -m "feat(chatsearch-refs): workbench fake chatsearch index, gallery fixtures, and a scenario conversation"
```

---

### Task 3: The two cards, shared actions, resolve hook, ToolBody/ToolCard wiring

**Files:**
- Create: `src/renderer/components/tool-views/SessionRefActions.tsx`, `ChatsearchFindCard.tsx`, `ChatsearchShowCard.tsx`
- Create: `src/renderer/hooks/useResolvedConversations.ts`
- Modify: `src/renderer/components/tool-views/ToolBody.tsx:937`
- Modify: `src/renderer/components/ToolCard.tsx:60` (Bash label) and `:958` (expanded default)
- Test: `tests/chatsearch-cards.test.tsx`

**Interfaces:**
- Consumes: Task 1; `window.claude.chatsearch.resolve` (Task 2 fake / Task 11 real).
- Produces: `<SessionRefActions conversation size? />`; `useResolvedConversations(ids)`; events `youcoded:preview-session` `{ provider, id, title }` and `youcoded:resume-session` `{ claudeSessionId, projectSlug, projectPath, provider }` (consumed by Tasks 6, 12).

- [ ] **Step 1: Failing tests**

```tsx
// tests/chatsearch-cards.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ChatsearchFindCard from '../src/renderer/components/tool-views/ChatsearchFindCard';
import ChatsearchShowCard from '../src/renderer/components/tool-views/ChatsearchShowCard';
import { COPY, type ResolvedConversation } from '../src/shared/chatsearch-refs';

const ok = (over: Partial<Extract<ResolvedConversation, { status: 'ok' }>> = {}): ResolvedConversation => ({
  status: 'ok', id: 'a3f2aaaa-0000-4000-8000-000000000000', provider: 'claude', title: 'Permission ask timeout',
  projectName: 'youcoded', originalPath: '/p/youcoded', lastActive: '2026-07-26T03:14:09.000Z', createdAt: '2026-07-25T18:02:11.000Z',
  tags: ['perm'], complete: true, tombstone: false, projectSlug: '-p-youcoded', projectPath: '/p/youcoded', missingProject: false, notSyncedYet: false, ...over,
});

beforeEach(() => { (window as any).claude = { chatsearch: { resolve: vi.fn() } }; });

describe('ChatsearchFindCard', () => {
  it('resolves ONCE even when the parent re-renders with a fresh ids array', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok()] });
    const { rerender } = render(<ChatsearchFindCard shortIds={['a3f2']} />);
    rerender(<ChatsearchFindCard shortIds={['a3f2']} />);
    rerender(<ChatsearchFindCard shortIds={['a3f2']} />);
    await screen.findByText('Permission ask timeout');
    expect((window as any).claude.chatsearch.resolve).toHaveBeenCalledTimes(1);
  });
  it('renders one row per resolved id with Preview and Resume', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok(), ok({ id: '9c14bbbb-0000-4000-8000-000000000000', title: 'Second' })] });
    render(<ChatsearchFindCard shortIds={['a3f2', '9c14']} />);
    await screen.findByText('Permission ask timeout');
    expect(screen.getAllByRole('button', { name: COPY.preview })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Resume/ })).toHaveLength(2);
  });
  it('disables Resume with the exact Resume Browser wording; Preview stays enabled', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok({ missingProject: true, projectSlug: '', projectPath: '' }), ok({ id: 'x', notSyncedYet: true })] });
    render(<ChatsearchFindCard shortIds={['a3f2', 'x']} />);
    const [a, b] = (await screen.findAllByRole('button', { name: /Resume/ })) as HTMLButtonElement[];
    expect(a.disabled).toBe(true); expect(a.title).toBe(COPY.resumeMissingProject);
    expect(b.disabled).toBe(true); expect(b.title).toBe(COPY.resumeNotSynced);
    for (const p of screen.getAllByRole('button', { name: COPY.preview }) as HTMLButtonElement[]) expect(p.disabled).toBe(false);
  });
  it('disables Preview for a tombstone and says why', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok({ tombstone: true })] });
    render(<ChatsearchFindCard shortIds={['a3f2']} />);
    const p = (await screen.findByRole('button', { name: COPY.preview })) as HTMLButtonElement;
    expect(p.disabled).toBe(true); expect(p.title).toBe(COPY.previewTombstone);
  });
  it('keeps an unknown id as an inert row that says so', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [{ status: 'unknown', query: 'zzzz' }] });
    render(<ChatsearchFindCard shortIds={['zzzz']} />);
    expect(await screen.findByText(/zzzz/)).toBeTruthy();
    expect(screen.getByText(COPY.unknownId)).toBeTruthy();
  });
  it('never shows the raw lane name', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok({ provider: 'native' })] });
    render(<ChatsearchFindCard shortIds={['a3f2']} />);
    await screen.findByText('Permission ask timeout');
    expect(screen.queryByText(/\bnative\b/)).toBeNull();
  });
  it('reports "unavailable" when resolve answers not-implemented (Android)', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: false, error: 'not-implemented-on-mobile' });
    const onUnavailable = vi.fn();
    render(<ChatsearchFindCard shortIds={['a3f2']} onUnavailable={onUnavailable} />);
    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });
  it('Preview dispatches youcoded:preview-session; Resume dispatches youcoded:resume-session', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok({ provider: 'native' })] });
    const prev = vi.fn(); const res = vi.fn();
    window.addEventListener('youcoded:preview-session', prev); window.addEventListener('youcoded:resume-session', res);
    render(<ChatsearchFindCard shortIds={['a3f2']} />);
    fireEvent.click(await screen.findByRole('button', { name: COPY.preview }));
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect((prev.mock.calls[0][0] as CustomEvent).detail).toEqual({ provider: 'native', id: 'a3f2aaaa-0000-4000-8000-000000000000', title: 'Permission ask timeout' });
    expect((res.mock.calls[0][0] as CustomEvent).detail).toEqual({ claudeSessionId: 'a3f2aaaa-0000-4000-8000-000000000000', projectSlug: '-p-youcoded', projectPath: '/p/youcoded', provider: 'native' });
  });
});

describe('ChatsearchShowCard', () => {
  it('renders the one conversation prominently with both actions', async () => {
    (window as any).claude.chatsearch.resolve.mockResolvedValue({ ok: true, results: [ok()] });
    render(<ChatsearchShowCard id="a3f2aaaa-0000-4000-8000-000000000000" provider="claude" />);
    expect(await screen.findByRole('heading', { name: 'Permission ask timeout' })).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.preview })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Resume/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run** — FAIL (modules missing).

- [ ] **Step 3: The resolve hook (depends on the joined key only)**

```ts
// src/renderer/hooks/useResolvedConversations.ts
import { useEffect, useState } from 'react';
import type { ResolvedConversation } from '../../shared/chatsearch-refs';

export interface ResolvedState {
  results: ResolvedConversation[];
  loading: boolean;
  /** true when the backend cannot answer at all (Android stub, IPC error). */
  unavailable: boolean;
}

/**
 * Resolve short ids against the app-owned chatsearch index. The effect keys on
 * the JOINED ids, never the array: the caller re-parses the tool output on
 * every render, so the array identity changes each time — depending on it
 * would cancel the in-flight lookup on every re-render and spin forever.
 */
export function useResolvedConversations(ids: string[]): ResolvedState {
  const key = ids.join(' ');
  const [state, setState] = useState<ResolvedState>({ results: [], loading: true, unavailable: false });
  useEffect(() => {
    let cancelled = false;
    setState({ results: [], loading: true, unavailable: false });
    (async () => {
      try {
        const res = await (window.claude as any).chatsearch.resolve(key ? key.split(' ') : []);
        if (cancelled) return;
        setState(res?.ok ? { results: res.results, loading: false, unavailable: false } : { results: [], loading: false, unavailable: true });
      } catch {
        if (!cancelled) setState({ results: [], loading: false, unavailable: true });
      }
    })();
    return () => { cancelled = true; };
  }, [key]);
  return state;
}
```

- [ ] **Step 4: Shared actions**

```tsx
// src/renderer/components/tool-views/SessionRefActions.tsx
// The Preview / Resume pair, shared by the find rows, the show card, and the
// drawer's Referenced list, so no surface can word a disabled state differently.
import { COPY, type ResolvedConversation } from '../../../shared/chatsearch-refs';

type Ok = Extract<ResolvedConversation, { status: 'ok' }>;

export function resumeBlockedReason(c: Ok): string | null {
  if (c.missingProject) return COPY.resumeMissingProject;
  if (c.notSyncedYet) return COPY.resumeNotSynced;
  return null;
}
export function requestPreview(c: Ok): void {
  window.dispatchEvent(new CustomEvent('youcoded:preview-session', { detail: { provider: c.provider, id: c.id, title: c.title } }));
}
export function requestResume(c: Ok): void {
  // App.tsx listens and calls handleResumeSession with exactly these four;
  // the native lane lands in the model picker because provider is threaded.
  window.dispatchEvent(new CustomEvent('youcoded:resume-session', { detail: { claudeSessionId: c.id, projectSlug: c.projectSlug, projectPath: c.projectPath, provider: c.provider } }));
}

export default function SessionRefActions({ conversation, size = 'sm' }: { conversation: Ok; size?: 'sm' | 'md' }) {
  const blocked = resumeBlockedReason(conversation);
  const native = conversation.provider === 'native';
  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs';
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button type="button" className={`rounded-md border border-edge bg-well text-fg hover:bg-inset disabled:opacity-50 disabled:cursor-not-allowed ${pad}`}
        disabled={conversation.tombstone} title={conversation.tombstone ? COPY.previewTombstone : COPY.previewHint} onClick={() => requestPreview(conversation)}>
        {COPY.preview}
      </button>
      <button type="button" className={`rounded-md bg-accent text-on-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${pad}`}
        disabled={!!blocked} title={blocked ?? (native ? COPY.resumeNativeHint : COPY.resumeHint)} onClick={() => requestResume(conversation)}>
        {native ? COPY.resumeNative : COPY.resume}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: The two cards**

```tsx
// src/renderer/components/tool-views/ChatsearchFindCard.tsx
import { useEffect } from 'react';
import { useResolvedConversations } from '../../hooks/useResolvedConversations';
import SessionRefActions from './SessionRefActions';
import { formatRelativeTime } from '../../utils/format-time';
import { COPY } from '../../../shared/chatsearch-refs';

export default function ChatsearchFindCard({ shortIds, onUnavailable }: { shortIds: string[]; onUnavailable?: () => void }) {
  const { results, loading, unavailable } = useResolvedConversations(shortIds);
  useEffect(() => { if (unavailable) onUnavailable?.(); }, [unavailable, onUnavailable]);
  if (unavailable) return null; // ToolBody swaps to plain Bash
  if (loading) return <div className="px-1 py-2 text-xs text-fg-muted">{COPY.lookingUp(shortIds.length)}</div>;
  return (
    <ul className="divide-y divide-edge rounded-md border border-edge">
      {results.map((r, i) => (
        <li key={shortIds[i] ?? i} className="flex items-center gap-3 px-3 py-2">
          {r.status === 'ok' ? (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">
                  {r.title || <span className="italic text-fg-muted">{COPY.untitled}</span>}
                  {r.tombstone && <span className="ml-1 text-fg-muted" title={COPY.previewTombstone}>†</span>}
                </div>
                <div className="truncate text-xs text-fg-muted">
                  {formatRelativeTime(r.lastActive)} · {r.projectName || '(no project)'}
                  {r.tags.length > 0 && <> · {r.tags.map((t) => `#${t}`).join(' ')}</>}
                </div>
              </div>
              <SessionRefActions conversation={r} />
            </>
          ) : (
            <div className="min-w-0 flex-1 text-xs text-fg-muted">
              <span className="font-mono">{r.query}</span> — {r.status === 'ambiguous' ? COPY.ambiguousId(r.candidates.length) : COPY.unknownId}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// src/renderer/components/tool-views/ChatsearchShowCard.tsx
import { useEffect } from 'react';
import { useResolvedConversations } from '../../hooks/useResolvedConversations';
import SessionRefActions from './SessionRefActions';
import { formatRelativeTime } from '../../utils/format-time';
import { COPY, providerLabel } from '../../../shared/chatsearch-refs';

export default function ChatsearchShowCard({ id, provider, onUnavailable }: { id: string; provider: string; onUnavailable?: () => void }) {
  const { results, loading, unavailable } = useResolvedConversations([id]);
  useEffect(() => { if (unavailable) onUnavailable?.(); }, [unavailable, onUnavailable]);
  if (unavailable) return null;
  if (loading) return <div className="px-1 py-2 text-xs text-fg-muted">{COPY.lookingUp(1)}</div>;
  const r = results[0];
  if (!r || r.status !== 'ok') return <div className="px-1 py-2 text-xs text-fg-muted"><span className="font-mono">{id.slice(0, 8)}</span> — {COPY.unknownId}</div>;
  return (
    <div className="rounded-lg border border-edge bg-well px-4 py-3">
      <div className="text-2xs uppercase tracking-wider text-fg-muted mb-1">{COPY.headerShow} · {providerLabel(provider)}</div>
      <h4 className="text-base font-medium text-fg mb-0.5">{r.title || <span className="italic text-fg-muted">{COPY.untitled}</span>}</h4>
      <div className="text-xs text-fg-muted mb-3">
        {formatRelativeTime(r.lastActive)} · {r.projectName || '(no project)'}
        {r.tags.length > 0 && <> · {r.tags.map((t) => `#${t}`).join(' ')}</>}
        {r.tombstone && <> · {COPY.previewTombstone}</>}
      </div>
      <SessionRefActions conversation={r} size="md" />
    </div>
  );
}
```

- [ ] **Step 6: ToolBody + ToolCard**

`ToolBody.tsx`: add `useState` to the React import, `import { describeChatsearchCall, COPY } from '../../../shared/chatsearch-refs';` and the two card imports. Declare `const [chatsearchUnavailable, setChatsearchUnavailable] = useState(false);` **before** the `inner` IIFE (hooks are unconditional). Replace the `Bash` case:

```tsx
      case 'Bash': {
        // chatsearch calls render as session cards; anything else — and any
        // chatsearch call whose output can't be parsed, was piped, or was
        // truncated — stays the plain shell view. Android answers resolve with
        // not-implemented; the card reports that back and we swap to shell.
        const cs = describeChatsearchCall(tool);
        if (cs && !chatsearchUnavailable) {
          return (
            <div className="space-y-2">
              {cs.cmd === 'find'
                ? <ChatsearchFindCard shortIds={cs.shortIds} onUnavailable={() => setChatsearchUnavailable(true)} />
                : <ChatsearchShowCard id={cs.id} provider={cs.provider} onUnavailable={() => setChatsearchUnavailable(true)} />}
              <details className="text-xs text-fg-muted"><summary className="cursor-pointer">{COPY.rawOutput}</summary><ShellView tool={tool} commandField="command" /></details>
            </div>
          );
        }
        return <ShellView tool={tool} commandField="command" />;
      }
```

`ToolCard.tsx`: import `{ describeChatsearchCall, isChatsearchCommand, COPY }`. In `friendlyToolDisplay`'s `case 'Bash':` (`:60`), before the `desc` logic:

```ts
      // Same helper ToolBody uses to pick the card, so header and body agree.
      const cs = describeChatsearchCall(tool);
      if (cs) return { label: cs.cmd === 'find' ? COPY.headerFind(cs.shortIds.length) : COPY.headerShow, detail: '' };
```

At `:958`, change the expanded default:

```ts
  // Chatsearch cards open expanded: their whole point is the Preview/Resume
  // buttons, which a collapsed header would hide. Decided from the command so
  // the card is already open when the output arrives. (Task 4 lets Destin
  // reverse this.)
  const [expanded, setExpanded] = useState(() => getInitialExpanded() || (tool.toolName === 'Bash' && isChatsearchCommand(asString(tool.input.command))));
```

- [ ] **Step 7: Run** — `npx vitest run tests/chatsearch-cards.test.tsx tests/tool-card-preparing.test.tsx tests/tool-card-grant-width.test.tsx` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/tool-views src/renderer/hooks/useResolvedConversations.ts src/renderer/components/ToolCard.tsx tests/chatsearch-cards.test.tsx
git commit -m "feat(chatsearch-refs): find/show cards with Preview + Resume, expanded by default, wired into ToolBody and ToolCard"
```

---

### Task 4: 👀 First look — cards only (Destin, short)

Nothing after this task should be built on a card layout Destin has not seen.

- [ ] `cd /home/destin/youcoded-dev && bash scripts/run-workbench.sh`. Show Destin: tool gallery → `chatsearch-find` (eight rows: resumable, folder-missing, not-synced, tombstone, native, untitled, unreadable-later, unknown), `chatsearch-show`, `chatsearch-find-piped` (plain shell); then the `default` scenario's conversation where `show` sits **inside a tool group between two Reads**.
- [ ] Decisions to confirm or change, in plain language: expanded by default? row density and what each row shows? "Resume…" with an ellipsis for the assistant lane? "Found N past conversations" / "Past conversation" as header labels? relative time ("3 weeks ago") vs the date? the `†` glyph? the "Raw output" disclosure? **Is `show` inside the group fine, or should it stand apart (Task 14)?**
- [ ] Iterate; commit each round `feat(chatsearch-refs): design round N — <what changed>`. Report and stop between rounds; do not propose merge or backend work.

---

### Task 5: Extract `ConversationTranscript` and build the preview pane

**Files:**
- Create: `src/renderer/components/project-view/ConversationTranscript.tsx`, `src/renderer/components/SessionPreviewPane.tsx`
- Modify: `src/renderer/components/project-view/ConversationPreview.tsx`
- Test: `tests/conversation-transcript.test.tsx`, `tests/session-preview-pane.test.tsx`

**Interfaces:**
- Consumes: `TranscriptMessage`, `ChatsearchReadRequest/Response`, `COPY`, `providerLabel` (Task 1); `window.claude.chatsearch.read`.
- Produces: `<ConversationTranscript messages olderHint? scrollToEndKey? />` (accepts `HistoryMessage[]` — `seq`/`droppedToolCalls` optional); `<SessionPreviewPane provider id title onClose />`.

- [ ] **Step 1: Failing tests**

```tsx
// tests/conversation-transcript.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationTranscript from '../src/renderer/components/project-view/ConversationTranscript';
import MarkdownContent from '../src/renderer/components/MarkdownContent';
import { COPY } from '../src/shared/chatsearch-refs';

describe('ConversationTranscript', () => {
  it('renders markdown', () => {
    render(<ConversationTranscript messages={[{ role: 'assistant', content: '```ts\nconst a = 1;\n```', timestamp: 1 }]} />);
    expect(document.querySelector('code')).toBeTruthy();
  });
  it('renders NO filepath chips — positive control: the same text WITH a sessionId does render one', () => {
    const text = 'see src/renderer/App.tsx for details';
    const { unmount } = render(<MarkdownContent content={text} sessionId="s1" />);
    expect(document.querySelector('filepath-token, [data-filepath-token], .filepath-token')).toBeTruthy(); // control
    unmount();
    render(<ConversationTranscript messages={[{ role: 'assistant', content: text, timestamp: 1 }]} />);
    expect(document.querySelector('filepath-token, [data-filepath-token], .filepath-token')).toBeNull();
  });
  it('shows a gap marker with the dropped count, singular and plural', () => {
    render(<ConversationTranscript messages={[
      { role: 'user', content: 'q', timestamp: 1, seq: 0, droppedToolCalls: 0 },
      { role: 'assistant', content: 'a', timestamp: 2, seq: 1, droppedToolCalls: 3 },
      { role: 'assistant', content: 'b', timestamp: 3, seq: 2, droppedToolCalls: 1 },
    ]} />);
    expect(screen.getByText(new RegExp(COPY.toolsNotShown(3)))).toBeTruthy();
    expect(screen.getByText(new RegExp(COPY.toolsNotShown(1)))).toBeTruthy();
  });
});
```

If the positive control fails because the chip's element/class differs, read `MarkdownContent.tsx:60-100` (`FilepathToken`) and adjust the selector — the point is that the control must PASS before the negative assertion means anything.

```tsx
// tests/session-preview-pane.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionPreviewPane from '../src/renderer/components/SessionPreviewPane';
import { COPY } from '../src/shared/chatsearch-refs';

const msg = (seq: number) => ({ role: seq % 2 ? 'assistant' : 'user', content: `m${seq}`, timestamp: seq, seq, droppedToolCalls: 0 });
beforeEach(() => { (window as any).claude = { chatsearch: { read: vi.fn() } }; });

describe('SessionPreviewPane', () => {
  it('loads the newest slice and offers Load older while hasMore', async () => {
    (window as any).claude.chatsearch.read.mockResolvedValueOnce({ ok: true, messages: [msg(58), msg(59)], hasMore: true });
    render(<SessionPreviewPane provider="claude" id="abc" title="T" onClose={() => {}} />);
    expect(await screen.findByText('m59')).toBeTruthy();
    expect((window as any).claude.chatsearch.read).toHaveBeenCalledWith({ provider: 'claude', id: 'abc', tail: 40 });
    (window as any).claude.chatsearch.read.mockResolvedValueOnce({ ok: true, messages: [msg(56), msg(57)], hasMore: false });
    fireEvent.click(screen.getByRole('button', { name: COPY.loadOlder }));
    await waitFor(() => expect(screen.getByText('m56')).toBeTruthy());
    expect((window as any).claude.chatsearch.read).toHaveBeenLastCalledWith({ provider: 'claude', id: 'abc', tail: 40, before: 58 });
    expect(screen.queryByRole('button', { name: COPY.loadOlder })).toBeNull();
    expect(screen.getByText(new RegExp(COPY.startOfConversation))).toBeTruthy();
  });
  it('surfaces the real error and never renders an empty list as an empty conversation', async () => {
    (window as any).claude.chatsearch.read.mockResolvedValueOnce({ ok: false, error: 'EACCES: permission denied, open /x.jsonl' });
    render(<SessionPreviewPane provider="claude" id="abc" title="T" onClose={() => {}} />);
    expect(await screen.findByText(/EACCES: permission denied/)).toBeTruthy();
  });
  it('labels the lane for humans', async () => {
    (window as any).claude.chatsearch.read.mockResolvedValueOnce({ ok: true, messages: [msg(1)], hasMore: false });
    render(<SessionPreviewPane provider="native" id="abc" title="T" onClose={() => {}} />);
    expect(await screen.findByText(/YouCoded assistant/)).toBeTruthy();
    expect(screen.queryByText(/\bnative\b/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL (modules missing).

- [ ] **Step 3: The transcript component**

```tsx
// src/renderer/components/project-view/ConversationTranscript.tsx
//
// The read-only bubble list, shared by Project View's ConversationPreview and
// the Session Drawer's SessionPreviewPane. Markdown ON (code blocks and lists
// in a past conversation are unreadable as raw text); sessionId OFF (file
// chips would resolve against the CURRENT session's folder, which is usually
// not where this conversation happened).
import { useEffect, useRef } from 'react';
import MarkdownContent from '../MarkdownContent';
import type { HistoryMessage } from '../../../shared/types';
import { COPY } from '../../../shared/chatsearch-refs';

export type TranscriptRow = HistoryMessage & { seq?: number; droppedToolCalls?: number };

export default function ConversationTranscript({ messages, olderHint, scrollToEndKey }: {
  messages: TranscriptRow[];
  /** Rendered above the first message, e.g. a Load older button. */
  olderHint?: React.ReactNode;
  /** Change this value to jump to the newest message (initial load). */
  scrollToEndKey?: unknown;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [scrollToEndKey]);
  return (
    // w-full + min-w-0: this sits inside .drawer-pane, which collapses to 100%
    // on narrow screens WITHOUT resizing children (.claude/rules/narrow-viewport.md).
    <div className="w-full min-w-0 max-w-[680px] mx-auto">
      {olderHint}
      {messages.map((m, i) => (
        <div key={m.seq ?? i}>
          {!!m.droppedToolCalls && (
            // The reader dropped tool activity here. Say so — a seamless join
            // would present an edited conversation as the whole one.
            <div className="my-2 text-center text-[11.5px] text-fg-muted">— {COPY.toolsNotShown(m.droppedToolCalls)} —</div>
          )}
          <div className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`min-w-0 break-words rounded-2xl px-5 py-3 text-sm ${m.role === 'user' ? 'max-w-[80%] rounded-br-sm bg-accent text-on-accent' : 'max-w-[85%] rounded-bl-sm bg-inset text-fg'}`}>
              <MarkdownContent content={m.content} />
            </div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

In `ConversationPreview.tsx`, replace the `messages.map(...)` block and the `showOlderHint` div with `<ConversationTranscript messages={messages} scrollToEndKey={loading} olderHint={showOlderHint ? <div className="text-center text-[11.5px] text-fg-muted py-2">— showing the last {shownCount} messages — use "Open full transcript" for everything —</div> : null} />`; delete the now-unused `endRef` effect; update the header comment (no longer "plain-text"). Existing Project View tests (`rg -l ConversationPreview tests`) stay green.

- [ ] **Step 4: The preview pane**

```tsx
// src/renderer/components/SessionPreviewPane.tsx
//
// Drawer host for a previewed past conversation. Reads bounded slices through
// chatsearch:read and pages backwards on demand — there is deliberately no
// "load everything" (a 42 MB transcript would cross IPC and be markdown-
// rendered bubble by bubble, inside a 480px pane, on a phone).
import { useCallback, useEffect, useState } from 'react';
import ConversationTranscript from './project-view/ConversationTranscript';
import { ErrorState } from './ui/states';
import { COPY, READ_TAIL_DEFAULT, type TranscriptMessage, type ChatsearchProvider } from '../../shared/chatsearch-refs';

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

export default function SessionPreviewPane({ provider, id, title, onClose }: { provider: ChatsearchProvider; id: string; title: string; onClose: () => void }) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [scrollKey, setScrollKey] = useState(0);

  const load = useCallback(async (before?: number) => {
    const req = before === undefined ? { provider, id, tail: READ_TAIL_DEFAULT } : { provider, id, tail: READ_TAIL_DEFAULT, before };
    const res = await (window.claude as any).chatsearch.read(req);
    if (!res?.ok) throw new Error(res?.error || 'Unknown error reading the transcript');
    return res as { messages: TranscriptMessage[]; hasMore: boolean };
  }, [provider, id]);

  const loadNewest = useCallback(() => {
    setPhase({ kind: 'loading' }); setMessages([]);
    return load().then((r) => { setMessages(r.messages); setHasMore(r.hasMore); setPhase({ kind: 'ready' }); setScrollKey((k) => k + 1); })
      .catch((e) => setPhase({ kind: 'error', message: e?.message || String(e) }));
  }, [load]);

  useEffect(() => { void loadNewest(); }, [loadNewest]);

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    try { const r = await load(messages[0].seq); setMessages((m) => [...r.messages, ...m]); setHasMore(r.hasMore); }
    catch (e: any) { setPhase({ kind: 'error', message: e?.message || String(e) }); }
    finally { setLoadingOlder(false); }
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">{title || COPY.untitled}</div>
          <div className="text-xs text-fg-muted">{COPY.paneSubtitle(provider)}</div>
        </div>
        <button type="button" className="rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-well" onClick={onClose} aria-label="Close preview">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {phase.kind === 'loading' && <p className="text-sm text-fg-muted">Loading…</p>}
        {phase.kind === 'error' && <ErrorState mode="recoverable" message={`${COPY.errReadPrefix}${phase.message}`} onRetry={() => void loadNewest()} />}
        {phase.kind === 'ready' && (
          <ConversationTranscript messages={messages} scrollToEndKey={scrollKey}
            olderHint={hasMore
              ? <div className="py-2 text-center"><button type="button" className="rounded-md border border-edge bg-well px-3 py-1 text-xs text-fg hover:bg-inset disabled:opacity-50" disabled={loadingOlder} onClick={loadOlder}>{COPY.loadOlder}</button></div>
              : <div className="py-2 text-center text-[11.5px] text-fg-muted">— {COPY.startOfConversation} —</div>} />
        )}
      </div>
    </div>
  );
}
```

`ErrorState` (`src/renderer/components/ui/states.tsx:119`) takes `mode="recoverable"`, `message: React.ReactNode`, `onRetry: () => void` — as used.

- [ ] **Step 5: Run** — `npx vitest run tests/conversation-transcript.test.tsx tests/session-preview-pane.test.tsx && npx vitest related src/renderer/components/project-view/ConversationPreview.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/project-view/ConversationTranscript.tsx src/renderer/components/project-view/ConversationPreview.tsx src/renderer/components/SessionPreviewPane.tsx tests/conversation-transcript.test.tsx tests/session-preview-pane.test.tsx
git commit -m "feat(chatsearch-refs): shared ConversationTranscript (markdown, gap markers) + SessionPreviewPane with bounded paging"
```

---

### Task 6: Drawer state, the ChatView listener, and the drawer branches

**Files:**
- Modify: `src/renderer/state/artifact-tracker.ts` (state `:4-36`, `DRAWER_CLOSED` `:57-70`, `ACTIVE_ARTIFACT_SET` `:74`, action union)
- Create: `src/renderer/hooks/useSessionPreviewListener.ts`
- Modify: `src/renderer/components/ChatView.tsx:107-113`
- Modify: `src/renderer/components/SessionDrawer.tsx` (`:607` early return, `:728` viewer, list column, `handleBack` ~`:400`)
- Test: `tests/artifact-tracker-preview.test.ts`, `tests/session-preview-listener.test.tsx`

**Interfaces:**
- Produces: state `activeSessionPreviewBySession`, `referencedSessionsBySession`; actions `SESSION_PREVIEW_SET { sessionId, provider, id, title }`, `SESSION_PREVIEW_CLEARED { sessionId }`, `SESSION_REFERENCED { sessionId, ref }`.

**6a — required: preview state + listener + pane branch. 6b — cut candidate: the Referenced list** (Destin decides at Task 7; the spec keeps it, the reviewer flagged it as the one surface with no evidence of need).

- [ ] **Step 1: Failing tests**

```ts
// tests/artifact-tracker-preview.test.ts
import { describe, it, expect } from 'vitest';
import { artifactReducer, initialArtifactState } from '../src/renderer/state/artifact-tracker';

const S = 'sess';
const ref = { provider: 'claude' as const, id: 'abc', title: 'T', lastActive: '2026-07-26T00:00:00Z' };

describe('session preview exclusivity', () => {
  it('SESSION_PREVIEW_SET clears the active artifact and opens the drawer', () => {
    let s = artifactReducer(initialArtifactState, { type: 'ACTIVE_ARTIFACT_SET', sessionId: S, artifactId: 'art1' });
    s = artifactReducer(s, { type: 'SESSION_PREVIEW_SET', sessionId: S, provider: 'claude', id: 'abc', title: 'T' });
    expect(s.activeArtifactBySession[S]).toBeNull();
    expect(s.activeSessionPreviewBySession[S]).toEqual({ provider: 'claude', id: 'abc', title: 'T' });
    expect(s.drawerOpenBySession[S]).toBe(true);
  });
  it('ACTIVE_ARTIFACT_SET clears the preview', () => {
    let s = artifactReducer(initialArtifactState, { type: 'SESSION_PREVIEW_SET', sessionId: S, provider: 'claude', id: 'abc', title: 'T' });
    s = artifactReducer(s, { type: 'ACTIVE_ARTIFACT_SET', sessionId: S, artifactId: 'art1' });
    expect(s.activeSessionPreviewBySession[S]).toBeNull();
    expect(s.activeArtifactBySession[S]).toBe('art1');
  });
  it('DRAWER_CLOSED clears both', () => {
    let s = artifactReducer(initialArtifactState, { type: 'SESSION_PREVIEW_SET', sessionId: S, provider: 'claude', id: 'abc', title: 'T' });
    s = artifactReducer(s, { type: 'DRAWER_CLOSED', sessionId: S });
    expect(s.activeSessionPreviewBySession[S]).toBeNull();
    expect(s.activeArtifactBySession[S]).toBeNull();
  });
  it('SESSION_REFERENCED dedupes by provider+id, newest first', () => {
    let s = artifactReducer(initialArtifactState, { type: 'SESSION_REFERENCED', sessionId: S, ref });
    s = artifactReducer(s, { type: 'SESSION_REFERENCED', sessionId: S, ref: { ...ref, id: 'def' } });
    s = artifactReducer(s, { type: 'SESSION_REFERENCED', sessionId: S, ref });
    expect(s.referencedSessionsBySession[S].map((r) => r.id)).toEqual(['abc', 'def']);
  });
});
```

```tsx
// tests/session-preview-listener.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionPreviewListener } from '../src/renderer/hooks/useSessionPreviewListener';

vi.mock('../src/renderer/components/artifact-views/dirty-editor-guard', () => ({ guardDirtyEditor: (a: () => void) => a() }));

describe('useSessionPreviewListener', () => {
  it('turns the preview event into SESSION_REFERENCED + SESSION_PREVIEW_SET for its session', () => {
    const dispatch = vi.fn();
    renderHook(() => useSessionPreviewListener('s1', dispatch));
    window.dispatchEvent(new CustomEvent('youcoded:preview-session', { detail: { provider: 'claude', id: 'abc', title: 'T' } }));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'SESSION_REFERENCED', sessionId: 's1', ref: { provider: 'claude', id: 'abc', title: 'T' } });
    expect(dispatch.mock.calls[1][0]).toEqual({ type: 'SESSION_PREVIEW_SET', sessionId: 's1', provider: 'claude', id: 'abc', title: 'T' });
  });
  it('stops listening on unmount', () => {
    const dispatch = vi.fn();
    const { unmount } = renderHook(() => useSessionPreviewListener('s1', dispatch));
    unmount();
    window.dispatchEvent(new CustomEvent('youcoded:preview-session', { detail: { provider: 'claude', id: 'abc', title: 'T' } }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Reducer**

Add to `ArtifactState` and `initialArtifactState` (`{}` for both):

```ts
  // Session references (spec 2026-08-10 §D). A previewed past conversation
  // occupies the drawer's content pane INSTEAD of an artifact. Two fields, one
  // rule: setting either clears the other (pinned by artifact-tracker-preview
  // test), so the pane never has two things to show.
  activeSessionPreviewBySession: Record<string, { provider: 'claude' | 'native'; id: string; title: string } | null>;
  // Every conversation previewed during this session, newest first — the
  // drawer's "Referenced conversations" list. Not persisted (v1).
  referencedSessionsBySession: Record<string, Array<{ provider: 'claude' | 'native'; id: string; title: string; lastActive: string }>>;
```

Cases (and the three action shapes in the union):

```ts
    case 'SESSION_PREVIEW_SET':
      return {
        ...s,
        drawerOpenBySession: { ...s.drawerOpenBySession, [a.sessionId]: true },
        activeArtifactBySession: { ...s.activeArtifactBySession, [a.sessionId]: null },
        activeSessionPreviewBySession: { ...s.activeSessionPreviewBySession, [a.sessionId]: { provider: a.provider, id: a.id, title: a.title } },
        gitReviewBySession: { ...s.gitReviewBySession, [a.sessionId]: false },
      };
    case 'SESSION_PREVIEW_CLEARED':
      return { ...s, activeSessionPreviewBySession: { ...s.activeSessionPreviewBySession, [a.sessionId]: null } };
    case 'SESSION_REFERENCED': {
      const prev = s.referencedSessionsBySession[a.sessionId] ?? [];
      const rest = prev.filter((r) => !(r.provider === a.ref.provider && r.id === a.ref.id));
      return { ...s, referencedSessionsBySession: { ...s.referencedSessionsBySession, [a.sessionId]: [a.ref, ...rest] } };
    }
```

In `ACTIVE_ARTIFACT_SET` and `DRAWER_CLOSED` add `activeSessionPreviewBySession: { ...s.activeSessionPreviewBySession, [a.sessionId]: null },`.

- [ ] **Step 4: The listener hook, mounted in ChatView**

Verified: `SessionDrawer` is rendered by `ChatView.tsx:1030` **only while `drawerOpen` is true**, so a listener inside the drawer would never hear the first Preview click. `ChatView` (`:107`) is mounted for the active session, has `sessionId`, and `useArtifact()`'s `artifactDispatch` (`:113`). The artifact editor's unsaved-changes guard is reachable from outside the drawer through `guardDirtyEditor()` (`artifact-views/dirty-editor-guard.ts` — what HeaderBar and OverflowMenu use).

```ts
// src/renderer/hooks/useSessionPreviewListener.ts
import { useEffect } from 'react';
import { guardDirtyEditor } from '../components/artifact-views/dirty-editor-guard';

/**
 * Cards deep in the chat tree ask for a preview by event (the same
 * deep-component→destination pattern as youcoded:open-library). Lives in
 * ChatView, not the drawer, because the drawer is unmounted until it opens.
 * guardDirtyEditor: opening a preview must never silently discard an unsaved
 * artifact edit.
 */
export function useSessionPreviewListener(sessionId: string, dispatch: (a: any) => void): void {
  useEffect(() => {
    const onPreview = (e: Event) => {
      const d = (e as CustomEvent).detail as { provider: 'claude' | 'native'; id: string; title: string };
      if (!d?.id) return;
      guardDirtyEditor(() => {
        dispatch({ type: 'SESSION_REFERENCED', sessionId, ref: { ...d, lastActive: new Date().toISOString() } });
        dispatch({ type: 'SESSION_PREVIEW_SET', sessionId, provider: d.provider, id: d.id, title: d.title });
      });
    };
    window.addEventListener('youcoded:preview-session', onPreview);
    return () => window.removeEventListener('youcoded:preview-session', onPreview);
  }, [sessionId, dispatch]);
}
```

In `ChatView.tsx`, after line 113: `useSessionPreviewListener(sessionId, artifactDispatch);`. `SESSION_PREVIEW_SET` sets `drawerOpenBySession[sessionId] = true`, which mounts the drawer.

- [ ] **Step 5: Drawer**

1. Next to `activeArtifactId` (`:127`): `const activePreview = state.activeSessionPreviewBySession[sessionId] ?? null;` and `const referenced = state.referencedSessionsBySession[sessionId] ?? [];`.
2. **The early return at `:607`** — `if (!active) { return <aside …>{listInner}</aside>; }` — must become `if (!active && !activePreview)`, or the pane branch below is unreachable (the preview clears `active`).
3. `showList`: `const showList = !active && !activePreview ? true : listOpen;`.
4. `handleBack`, before the `activeArtifactId` line: `if (activePreview) { dispatch({ type: 'SESSION_PREVIEW_CLEARED', sessionId }); return; }`.
5. Viewer (`:728`): branch before `ActiveArtifactView`:
   ```tsx
   {activePreview ? (
     <SessionPreviewPane provider={activePreview.provider} id={activePreview.id} title={activePreview.title} onClose={() => dispatch({ type: 'SESSION_PREVIEW_CLEARED', sessionId })} />
   ) : active ? ( /* existing ActiveArtifactView block, unchanged */ ) : null}
   ```
   Read the surrounding JSX first — the footer/toolbar below the viewer references `active.path`; guard those with `active &&` where the preview branch would otherwise render them.
6. **6b (cut candidate)** — in the list column, after the artifacts list, when `referenced.length > 0`:
   ```tsx
   <div className="mt-3 border-t border-edge pt-2">
     <div className="px-3 pb-1 text-2xs uppercase tracking-wider text-fg-muted">{COPY.referencedHeading}</div>
     {referenced.map((r) => (
       <button key={`${r.provider}:${r.id}`} type="button"
         className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-well ${activePreview?.id === r.id ? 'bg-well text-fg' : 'text-fg-dim'}`}
         onClick={() => guardUnsaved(() => dispatch({ type: 'SESSION_PREVIEW_SET', sessionId, provider: r.provider, id: r.id, title: r.title }))}>
         <span className="truncate flex-1">{r.title || COPY.untitled}</span>
         <span className="text-2xs text-fg-muted">{providerLabel(r.provider)}</span>
       </button>
     ))}
   </div>
   ```

- [ ] **Step 6: Run + look** — `npx vitest run tests/artifact-tracker-preview.test.ts tests/session-preview-listener.test.tsx && npx vitest related src/renderer/components/SessionDrawer.tsx src/renderer/components/ChatView.tsx src/renderer/state/artifact-tracker.ts` → PASS. Workbench `default` scenario: click Preview on the find card → drawer opens with the pane; Load older pages; Esc closes the preview before the drawer; the `ee00` row's Preview shows the EACCES error card with Retry; narrow viewport: pane inside the drawer at 390px.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/artifact-tracker.ts src/renderer/hooks/useSessionPreviewListener.ts src/renderer/components/ChatView.tsx src/renderer/components/SessionDrawer.tsx tests/artifact-tracker-preview.test.ts tests/session-preview-listener.test.tsx
git commit -m "feat(chatsearch-refs): drawer preview pane + Referenced conversations list, listener in ChatView, exclusivity rule"
```

---

### Task 7: 🛑 DESIGN SIGN-OFF GATE — iterate with Destin in the workbench

This is the spec's Step 1. Do not start Task 8 without an explicit "approved" from Destin.

- [ ] **Launch:** `cd /home/destin/youcoded-dev && bash scripts/run-workbench.sh`. Walk Destin through, in plain language:
  - the `default` scenario conversation (find card → rows; `show` in a tool group between two Reads);
  - tool gallery: `chatsearch-find` (all eight row states), `chatsearch-show`, `chatsearch-find-piped`;
  - Preview → the pane: bubbles, code formatting, the "N tool calls not shown" marker, Load older, "start of conversation", the ✕; the `ee00` row → the error card and Retry;
  - the Referenced conversations list (**keep or cut?**);
  - narrow viewport for all of the above; `empty` and `stress` scenarios; two themes.
- [ ] **Decisions Destin confirms or changes** (each is a `COPY` entry or a one-line default; none has been approved yet): expanded-by-default cards; "Resume…" for the assistant lane; "Claude Code" / "YouCoded assistant" as lane labels; "Found N past conversations" / "Past conversation" headers; relative time vs date; the `†` glyph; the "Raw output" disclosure; "— N tool calls not shown —" and "— start of conversation —" wording; tail 40 / max 200; the pane subtitle; **the Phase B error sentences** (`COPY.errNotAnId`, `errNotIndexed`, `errNotAConversation`, `errOutsideRoots`, `errReadPrefix`) — read them aloud; and whether `show` needs to stand apart (→ Task 14).
- [ ] **Iterate:** each round → edit → `node scripts/workbench-boot-check.mjs` → commit `feat(chatsearch-refs): design round N — <what changed>`. Report and stop between rounds.
- [ ] **Record the sign-off:** append a dated line to `docs/active/handoffs/2026-08-10-chatsearch-state-of-play.md` — *"Design signed off by Destin on <date> after N rounds; approved commit <sha>; Referenced list: kept/cut; show segment: yes/no."* Commit in the workspace repo. Only then continue.

---

# Phase B — backend (after the gate)

### Task 8: `readMetaFile` + `resolveShortIds` (main process)

**Files:**
- Create: `src/main/chatsearch-index/meta-reader.ts`, `src/main/chatsearch-index/ipc-channels.ts`
- Test: `tests/chatsearch-meta-reader.test.ts`

**Interfaces:**
- Consumes: `ChatsearchMetaFile`, `ChatsearchMetaEntry` (`index-format.ts:16-46`); `metaPath` (`index-store.ts:38`); the `missingProject` / `notSyncedYet` rule from `session-browser.ts:638-641`.
- Produces: `readMetaFile(dir, provider): ChatsearchMetaFile | null`; `resolveShortIds(queries, deps): ResolvedConversation[]`; `CHATSEARCH_IPC`.

- [ ] **Step 1: Failing tests**

```ts
// tests/chatsearch-meta-reader.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { readMetaFile, resolveShortIds } from '../src/main/chatsearch-index/meta-reader';

const A = 'a3f2aaaa-0000-4000-8000-000000000000';
const B = 'a3f2bbbb-0000-4000-8000-000000000000';
const C = 'c0ffee00-0000-4000-8000-000000000000';
function entry(id: string, over: Record<string, unknown> = {}) {
  return { id, provider: 'claude', projectName: 'youcoded', originalPath: '/nope/youcoded', title: 'T ' + id.slice(0, 4), lastActive: '2026-07-26T00:00:00Z', createdAt: '2026-07-25T00:00:00Z', complete: false, priority: false, tags: ['x'], note: '', transcriptPath: `/space/claude/transcripts/youcoded/${id}.jsonl`, tombstone: false, sizeBytes: 1, turnCount: 1, firstTurnTs: '', lastTurnTs: '', ...over };
}
function tmpIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-meta-'));
  fs.writeFileSync(path.join(dir, 'claude-meta.json'), JSON.stringify({ v: 1, provider: 'claude', refreshedAt: '', conversations: { [A]: entry(A), [B]: entry(B), [C]: entry(C, { tombstone: true }) } }));
  fs.writeFileSync(path.join(dir, 'native-meta.json'), JSON.stringify({ v: 1, provider: 'native', refreshedAt: '', conversations: {} }));
  return dir;
}
const deps = {
  resolveLocal: (rec: { projectName: string; originalPath: string }) => (rec.projectName === 'youcoded' ? '/local/youcoded' : null),
  transcriptExistsLocally: (_p: string, localPath: string, id: string) => id === A && localPath === '/local/youcoded',
  slugFor: (provider: string, localPath: string) => `${provider}:${localPath}`,
};

describe('readMetaFile', () => {
  it('returns null for a missing or unparseable file, never throws', () => {
    expect(readMetaFile('/nonexistent', 'claude')).toBeNull();
    const dir = tmpIndex(); fs.writeFileSync(path.join(dir, 'claude-meta.json'), '{not json');
    expect(readMetaFile(dir, 'claude')).toBeNull();
  });
});

describe('resolveShortIds', () => {
  it('resolves exact, unique-prefix, ambiguous, and unknown', () => {
    const r = resolveShortIds([A, 'c0ff', 'a3f2', 'zzzz'], { dir: tmpIndex(), ...deps });
    expect(r[0]).toMatchObject({ status: 'ok', id: A, projectSlug: 'claude:/local/youcoded', projectPath: '/local/youcoded', missingProject: false, notSyncedYet: false });
    expect(r[1]).toMatchObject({ status: 'ok', id: C, tombstone: true });
    expect(r[2]).toEqual({ status: 'ambiguous', query: 'a3f2', candidates: [A, B] });
    expect(r[3]).toEqual({ status: 'unknown', query: 'zzzz' });
  });
  it('reports notSyncedYet when the folder exists but the transcript is not materialized', () => {
    expect(resolveShortIds([B], { dir: tmpIndex(), ...deps })[0]).toMatchObject({ status: 'ok', missingProject: false, notSyncedYet: true });
  });
  it('reports missingProject with empty slug/path when the folder is absent', () => {
    expect(resolveShortIds([A], { dir: tmpIndex(), ...deps, resolveLocal: () => null })[0]).toMatchObject({ status: 'ok', missingProject: true, notSyncedYet: false, projectSlug: '', projectPath: '' });
  });
  it('refuses non-hex queries', () => {
    expect(resolveShortIds(['../etc'], { dir: tmpIndex(), ...deps })[0]).toEqual({ status: 'unknown', query: '../etc' });
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/chatsearch-index/ipc-channels.ts
// Keep every value in sync with preload.ts, remote-shim.ts, ipc-handlers.ts,
// remote-server.ts and SessionService.kt (stub). (No apostrophes in comments —
// the ipc parity test scans single-quoted strings.)
export const CHATSEARCH_IPC = {
  RESOLVE: 'chatsearch:resolve',
  READ: 'chatsearch:read',
} as const;
```

```ts
// src/main/chatsearch-index/meta-reader.ts
//
// The app-side READER of the meta index the app writes. Until now the only
// consumer was the standalone CLI (which parses the JSON itself); the
// session-reference cards need the same lookup in-process, keyed by the short
// id prefixes the CLI prints.
import fs from 'node:fs';
import { metaPath } from './index-store';
import type { ChatsearchMetaEntry, ChatsearchMetaFile } from './index-format';
import type { ResolvedConversation, ChatsearchProvider } from '../../shared/chatsearch-refs';

const PROVIDERS: ChatsearchProvider[] = ['claude', 'native'];
const QUERY_RE = /^[0-9a-f-]{4,36}$/;

export function readMetaFile(dir: string, provider: string): ChatsearchMetaFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath(dir, provider), 'utf8')) as ChatsearchMetaFile;
    return parsed && typeof parsed === 'object' && parsed.conversations && typeof parsed.conversations === 'object' ? parsed : null;
  } catch {
    return null; // no index yet, or unreadable — the caller reports "unknown"
  }
}

export interface ResolveDeps {
  dir: string;
  /** buildLocalProjectResolver() from conversations/service — bound per call. */
  resolveLocal: (rec: { projectName: string; originalPath: string }) => string | null;
  /** Is the transcript materialized on THIS device under the local root? */
  transcriptExistsLocally: (provider: ChatsearchProvider, localPath: string, id: string) => boolean;
  /** ccProjectSlug for claude, nativeStoreSlug for native. */
  slugFor: (provider: ChatsearchProvider, localPath: string) => string;
}

export function resolveShortIds(queries: string[], deps: ResolveDeps): ResolvedConversation[] {
  const all: Array<{ provider: ChatsearchProvider; entry: ChatsearchMetaEntry }> = [];
  for (const provider of PROVIDERS) {
    const file = readMetaFile(deps.dir, provider);
    if (!file) continue;
    for (const [id, entry] of Object.entries(file.conversations)) all.push({ provider, entry: { ...entry, id: String(entry.id || id) } });
  }
  return queries.map((q) => {
    if (!QUERY_RE.test(q)) return { status: 'unknown', query: q };
    // Same rule as the CLI: exact match wins, else unique prefix.
    const exact = all.filter((c) => c.entry.id === q);
    const hits = exact.length ? exact : all.filter((c) => c.entry.id.startsWith(q));
    if (hits.length === 0) return { status: 'unknown', query: q };
    if (hits.length > 1) return { status: 'ambiguous', query: q, candidates: hits.map((h) => h.entry.id).sort() };
    const { provider, entry } = hits[0];
    const localPath = deps.resolveLocal({ projectName: entry.projectName, originalPath: entry.originalPath });
    const here = localPath ? deps.transcriptExistsLocally(provider, localPath, entry.id) : false;
    return {
      status: 'ok', id: entry.id, provider,
      title: entry.title || '', projectName: entry.projectName || '', originalPath: entry.originalPath || '',
      lastActive: entry.lastActive || '', createdAt: entry.createdAt || '',
      tags: Array.isArray(entry.tags) ? entry.tags : [], complete: !!entry.complete, tombstone: !!entry.tombstone,
      projectSlug: localPath ? deps.slugFor(provider, localPath) : '', projectPath: localPath ?? '',
      // Two distinct blocked states, worded by the renderer exactly as the
      // Resume Browser words them (session-browser.ts:638-641 is the source).
      missingProject: !localPath, notSyncedYet: !!localPath && !here,
    };
  });
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit**

```bash
git add src/main/chatsearch-index/meta-reader.ts src/main/chatsearch-index/ipc-channels.ts tests/chatsearch-meta-reader.test.ts
git commit -m "feat(chatsearch-refs): in-app meta index reader + short-id resolution with resumability"
```

---

### Task 9: Transcript reader — both lanes, bounded, contained, subagent-refusing, cached

**Files:**
- Create: `src/main/chatsearch-index/transcript-reader.ts`
- Create: `tests/fixtures/chatsearch/claude-session.jsonl`, `native-session.jsonl`, `subagent.jsonl`
- Test: `tests/chatsearch-transcript-reader.test.ts`

**Interfaces:**
- Consumes: `TranscriptEvent` shape (`shared/types.ts:149-160`), native header (`harness/session-store.ts:19-33`), `COPY` error strings.
- Produces: `parseClaudeTranscript(text): { messages: TranscriptMessage[]; allSidechain: boolean }`, `parseNativeTranscript(text): TranscriptMessage[]`, `sliceMessages(all, tail, before?)`, `containedTranscriptPath(candidate, roots): string | null`, `readTranscriptSlice(req, deps): Promise<ChatsearchReadResponse>`, `ParsedCacheEntry`.

- [ ] **Step 1: Fixtures**

`tests/fixtures/chatsearch/claude-session.jsonl` (one object per line; the `stop_reason: "tool_use"` assistant text must be KEPT):

```
{"type":"user","uuid":"u1","promptId":"p1","timestamp":"2026-07-26T00:00:01Z","message":{"role":"user","content":"Fix the timeout"}}
{"type":"assistant","uuid":"a1","timestamp":"2026-07-26T00:00:02Z","message":{"role":"assistant","stop_reason":"tool_use","content":[{"type":"text","text":"Looking at it."},{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/x"}}]}}
{"type":"user","uuid":"u2","timestamp":"2026-07-26T00:00:03Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"..."}]}}
{"type":"assistant","uuid":"a2","timestamp":"2026-07-26T00:00:04Z","message":{"role":"assistant","stop_reason":"tool_use","content":[{"type":"tool_use","id":"t2","name":"Edit","input":{}}]}}
{"type":"user","uuid":"u3","timestamp":"2026-07-26T00:00:05Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t2","content":"ok"}]}}
{"type":"assistant","uuid":"a3","timestamp":"2026-07-26T00:00:06Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"Done — **fixed**."}]}}
{"type":"user","uuid":"u4","isMeta":true,"timestamp":"2026-07-26T00:00:07Z","message":{"role":"user","content":"<meta>"}}
{"type":"user","uuid":"u5","promptId":"p2","timestamp":"2026-07-26T00:00:08Z","message":{"role":"user","content":"thanks"}}
```

Expected: `user "Fix the timeout" (0)`, `assistant "Looking at it." (0)` — its own `t1` counts toward the NEXT gap — `assistant "Done — **fixed**." (2: t1, t2)`, `user "thanks" (0)`.

`native-session.jsonl`:

```
{"v":1,"sessionId":"n1","harnessId":"assistant","binding":{"providerId":"openrouter","modelId":"m"},"cwd":"/p","createdAt":1}
{"type":"user-message","sessionId":"n1","uuid":"nu1","timestamp":1000,"data":{"text":"hello"}}
{"type":"assistant-text","sessionId":"n1","uuid":"na1","timestamp":2000,"data":{"text":"hi, checking"}}
{"type":"tool-use","sessionId":"n1","uuid":"nt1","timestamp":3000,"data":{"toolUseId":"x","toolName":"Bash","toolInput":{}}}
{"type":"tool-result","sessionId":"n1","uuid":"nr1","timestamp":4000,"data":{"toolUseId":"x","toolResult":"out"}}
{"type":"assistant-text","sessionId":"n1","uuid":"na2","timestamp":5000,"data":{"text":"done"}}
{"type":"turn-complete","sessionId":"n1","uuid":"nc1","timestamp":6000,"data":{}}
```

Expected: `user "hello" (0)`, `assistant "hi, checking" (0)`, `assistant "done" (1)`.

`subagent.jsonl` — the claude fixture's `u1` and `a3` lines, each with `"isSidechain":true` added.

- [ ] **Step 2: Failing tests**

```ts
// tests/chatsearch-transcript-reader.test.ts
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { parseClaudeTranscript, parseNativeTranscript, sliceMessages, containedTranscriptPath, readTranscriptSlice } from '../src/main/chatsearch-index/transcript-reader';
import { COPY } from '../src/shared/chatsearch-refs';

const FX = path.join(__dirname, 'fixtures', 'chatsearch');
const read = (n: string) => fs.readFileSync(path.join(FX, n), 'utf8');
const ID = 'a3f2aaaa-0000-4000-8000-000000000000';
const MIRROR_LINE = '{"type":"user","uuid":"z","promptId":"p","timestamp":"2026-01-01T00:00:00Z","message":{"role":"user","content":"MIRROR"}}';

describe('parseClaudeTranscript', () => {
  it('keeps every assistant text block, drops tool blocks, counts each gap correctly', () => {
    const { messages, allSidechain } = parseClaudeTranscript(read('claude-session.jsonl'));
    expect(allSidechain).toBe(false);
    expect(messages.map((x) => [x.role, x.content, x.droppedToolCalls])).toEqual([
      ['user', 'Fix the timeout', 0], ['assistant', 'Looking at it.', 0], ['assistant', 'Done — **fixed**.', 2], ['user', 'thanks', 0],
    ]);
    expect(messages.map((x) => x.seq)).toEqual([0, 1, 2, 3]);
  });
  it('dedupes by uuid (last wins) and ignores unparseable lines', () => {
    const text = read('claude-session.jsonl') + '\n{"type":"user","uuid":"u5","promptId":"p2","timestamp":"2026-07-26T00:00:09Z","message":{"role":"user","content":"thanks again"}}\n garbage';
    const { messages } = parseClaudeTranscript(text);
    expect(messages[messages.length - 1].content).toBe('thanks again');
  });
  it('flags a transcript whose lines are all sidechain', () => {
    expect(parseClaudeTranscript(read('subagent.jsonl')).allSidechain).toBe(true);
  });
});

describe('parseNativeTranscript', () => {
  it('skips the header, keeps user + assistant text, counts tool-use gaps', () => {
    expect(parseNativeTranscript(read('native-session.jsonl')).map((x) => [x.role, x.content, x.droppedToolCalls]))
      .toEqual([['user', 'hello', 0], ['assistant', 'hi, checking', 0], ['assistant', 'done', 1]]);
  });
});

describe('sliceMessages', () => {
  const all = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, content: String(i), timestamp: i, seq: i, droppedToolCalls: 0 }));
  it('returns the newest tail with hasMore', () => { expect(sliceMessages(all, 3)).toEqual({ messages: all.slice(7), hasMore: true }); });
  it('pages backwards with before and reports the end', () => { expect(sliceMessages(all, 4, 3)).toEqual({ messages: all.slice(0, 3), hasMore: false }); });
  it('clamps tail to 1..200', () => { expect(sliceMessages(all, 0).messages).toHaveLength(1); expect(sliceMessages(all, 9999).messages).toHaveLength(10); });
});

describe('containedTranscriptPath', () => {
  it('accepts a real file under a root; refuses traversal, foreign roots, a look-alike root, and a symlink escaping the root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-out-'));
    fs.writeFileSync(path.join(root, 'ok.jsonl'), ''); fs.writeFileSync(path.join(outside, 'secret.jsonl'), '');
    fs.symlinkSync(path.join(outside, 'secret.jsonl'), path.join(root, 'link.jsonl'));
    expect(containedTranscriptPath(path.join(root, 'ok.jsonl'), [root])).toBe(fs.realpathSync(path.join(root, 'ok.jsonl')));
    expect(containedTranscriptPath(path.join(root, '..', path.basename(outside), 'secret.jsonl'), [root])).toBeNull();
    expect(containedTranscriptPath(path.join(outside, 'secret.jsonl'), [root])).toBeNull();
    expect(containedTranscriptPath(path.join(root, 'link.jsonl'), [root])).toBeNull();
    expect(containedTranscriptPath(root + '-evil/x.jsonl', [root])).toBeNull();
  });
});

describe('readTranscriptSlice', () => {
  function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-read-'));
    const local = path.join(root, 'local'); const space = path.join(root, 'space');
    fs.mkdirSync(path.join(local, 'slug'), { recursive: true }); fs.mkdirSync(space, { recursive: true });
    return { local, space };
  }
  const depsFor = (local: string, space: string, entry: { transcriptPath: string; tombstone: boolean } | null, localPath: string | null) => ({
    entryFor: () => entry, localPathFor: () => localPath, roots: [local, space], cache: new Map(),
  });
  it('refuses an id that is not a session uuid', async () => {
    const { local, space } = setup();
    expect(await readTranscriptSlice({ provider: 'claude', id: '../x', tail: 5 }, depsFor(local, space, null, null))).toEqual({ ok: false, error: COPY.errNotAnId });
  });
  it('prefers the local transcript over the mirror', async () => {
    const { local, space } = setup();
    fs.writeFileSync(path.join(local, 'slug', `${ID}.jsonl`), read('claude-session.jsonl')); fs.writeFileSync(path.join(space, `${ID}.jsonl`), MIRROR_LINE);
    const r = await readTranscriptSlice({ provider: 'claude', id: ID, tail: 50 }, depsFor(local, space, { transcriptPath: path.join(space, `${ID}.jsonl`), tombstone: false }, path.join(local, 'slug', `${ID}.jsonl`)));
    expect(r.ok && r.messages[0].content).toBe('Fix the timeout');
  });
  it('falls back to the mirror when local is absent', async () => {
    const { local, space } = setup();
    fs.writeFileSync(path.join(space, `${ID}.jsonl`), MIRROR_LINE);
    const r = await readTranscriptSlice({ provider: 'claude', id: ID, tail: 50 }, depsFor(local, space, { transcriptPath: path.join(space, `${ID}.jsonl`), tombstone: false }, path.join(local, 'slug', `${ID}.jsonl`)));
    expect(r.ok && r.messages[0].content).toBe('MIRROR');
  });
  it('says the transcript is gone for a tombstone, and surfaces the real fs error otherwise', async () => {
    const { local, space } = setup();
    expect(await readTranscriptSlice({ provider: 'claude', id: ID, tail: 5 }, depsFor(local, space, { transcriptPath: path.join(space, 'x.jsonl'), tombstone: true }, null))).toEqual({ ok: false, error: COPY.previewTombstone });
    const missing = await readTranscriptSlice({ provider: 'claude', id: ID, tail: 5 }, depsFor(local, space, { transcriptPath: path.join(space, 'nope.jsonl'), tombstone: false }, null));
    expect(!missing.ok && missing.error).toMatch(/ENOENT/);
  });
  it('refuses a subagent transcript by path segment and by content', async () => {
    const { local, space } = setup();
    fs.mkdirSync(path.join(local, 'slug', ID, 'subagents'), { recursive: true });
    const p = path.join(local, 'slug', ID, 'subagents', 'agent-1.jsonl'); fs.writeFileSync(p, read('subagent.jsonl'));
    expect(await readTranscriptSlice({ provider: 'claude', id: ID, tail: 5 }, depsFor(local, space, { transcriptPath: p, tombstone: false }, null))).toEqual({ ok: false, error: COPY.errNotAConversation });
    const flat = path.join(space, `${ID}.jsonl`); fs.writeFileSync(flat, read('subagent.jsonl'));
    expect(await readTranscriptSlice({ provider: 'claude', id: ID, tail: 5 }, depsFor(local, space, { transcriptPath: flat, tombstone: false }, null))).toEqual({ ok: false, error: COPY.errNotAConversation });
  });
  it('refuses a path outside every root even when the index names it', async () => {
    const { local, space } = setup();
    expect(await readTranscriptSlice({ provider: 'claude', id: ID, tail: 5 }, depsFor(local, space, { transcriptPath: '/etc/hostname', tombstone: false }, null))).toEqual({ ok: false, error: COPY.errOutsideRoots });
  });
  it('parses once per (path, mtime, size) — Load older does not re-read the file', async () => {
    const { local, space } = setup();
    const p = path.join(space, `${ID}.jsonl`); fs.writeFileSync(p, read('claude-session.jsonl'));
    const deps = depsFor(local, space, { transcriptPath: p, tombstone: false }, null);
    await readTranscriptSlice({ provider: 'claude', id: ID, tail: 2 }, deps);
    const spy = vi.spyOn(fs.promises, 'readFile');
    await readTranscriptSlice({ provider: 'claude', id: ID, tail: 2, before: 2 }, deps);
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement**

```ts
// src/main/chatsearch-index/transcript-reader.ts
//
// Reads a BOUNDED slice of a past conversation for the preview pane, on both
// lanes. Keyed by id: the renderer never names a path; main looks it up in the
// index it wrote, prefers the local transcript, and falls back to the mirror.
//
// Deliberately NOT loadHistory (session-browser.ts:660): that keeps assistant
// text only where stop_reason === 'end_turn', which on a real 42 MB transcript
// discarded 1,135 of 1,405 assistant messages. A preview meant for "remember
// what we decided" needs the reasoning between tool calls, so every assistant
// text block is kept and only tool-use activity is dropped — and COUNTED, so
// the renderer can say it was dropped.
//
// The OUTPUT is bounded; the INPUT is not (the whole file must be parsed to
// know the ordinals). So parsed messages are cached per file identity
// (path + mtime + size) for the pane's lifetime: Load older is a slice of the
// cached array, not a second 42 MB parse.
import fs from 'node:fs';
import path from 'node:path';
import type { ChatsearchReadRequest, ChatsearchReadResponse, TranscriptMessage } from '../../shared/chatsearch-refs';
import { COPY, READ_TAIL_MAX } from '../../shared/chatsearch-refs';

const SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NUL = String.fromCharCode(0);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b: any) => b && b.type === 'text' && typeof b.text === 'string').map((b: any) => b.text).join('\n');
  return '';
}
function toolUsesIn(content: unknown): number {
  return Array.isArray(content) ? content.filter((b: any) => b && b.type === 'tool_use').length : 0;
}
function splitLines(text: string): string[] {
  // Null-byte lines are NTFS pre-allocation gaps from process kills — skip.
  return text.split('\n').filter((l) => l.trim() && !l.includes(NUL));
}

/** Claude Code JSONL → messages (+ whether every line was a subagent sidechain). */
export function parseClaudeTranscript(text: string): { messages: TranscriptMessage[]; allSidechain: boolean } {
  const byUuid = new Map<string, any>(); // last occurrence wins (loadHistory's rule)
  for (const line of splitLines(text)) {
    try { const p = JSON.parse(line); if (p && p.uuid && (p.type === 'user' || p.type === 'assistant')) byUuid.set(p.uuid, p); } catch { /* torn line */ }
  }
  const out: TranscriptMessage[] = [];
  let dropped = 0, seen = 0, sidechain = 0;
  for (const p of byUuid.values()) {
    seen++; if (p.isSidechain) sidechain++;
    const m = p.message; if (!m) continue;
    if (p.type === 'user') {
      if (p.isMeta || !p.promptId) continue; // tool results and meta lines
      const t = textOf(m.content).trim(); if (!t) continue;
      out.push({ role: 'user', content: t, timestamp: Date.parse(p.timestamp) || 0, seq: out.length, droppedToolCalls: dropped });
      dropped = 0;
    } else {
      // Push this message's TEXT first (it closes the gap before it), THEN
      // count its own tool calls toward the gap before the next message.
      const t = textOf(m.content).trim();
      if (t) { out.push({ role: 'assistant', content: t, timestamp: Date.parse(p.timestamp) || 0, seq: out.length, droppedToolCalls: dropped }); dropped = 0; }
      dropped += toolUsesIn(m.content);
    }
  }
  return { messages: out, allSidechain: seen > 0 && sidechain === seen };
}

/** Native session JSONL (header line + TranscriptEvent lines) → messages. */
export function parseNativeTranscript(text: string): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  let dropped = 0;
  for (const line of splitLines(text)) {
    let ev: any; try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || typeof ev.type !== 'string') continue; // the header has no type
    if (ev.type === 'tool-use') { dropped += 1; continue; }
    if (ev.type !== 'user-message' && ev.type !== 'assistant-text') continue;
    const t = typeof ev.data?.text === 'string' ? ev.data.text.trim() : ''; if (!t) continue;
    out.push({ role: ev.type === 'user-message' ? 'user' : 'assistant', content: t, timestamp: Number(ev.timestamp) || 0, seq: out.length, droppedToolCalls: dropped });
    dropped = 0;
  }
  return out;
}

export function sliceMessages(all: TranscriptMessage[], tail: number, before?: number): { messages: TranscriptMessage[]; hasMore: boolean } {
  const n = Math.min(Math.max(1, Math.floor(tail) || 1), READ_TAIL_MAX);
  const end = before === undefined ? all.length : Math.max(0, Math.min(before, all.length));
  const start = Math.max(0, end - n);
  return { messages: all.slice(start, end), hasMore: start > 0 };
}

/** realpath the candidate and require it under one of the roots, with a
 *  trailing separator so `root-evil/` cannot pass. Null = refuse. */
export function containedTranscriptPath(candidate: string, roots: string[]): string | null {
  let real: string; try { real = fs.realpathSync(candidate); } catch { return null; }
  for (const root of roots) {
    let realRoot: string; try { realRoot = fs.realpathSync(root); } catch { continue; }
    if (real.startsWith(realRoot + path.sep)) return real;
  }
  return null;
}

const isSubagentPath = (p: string) => p.split(/[\\/]/).includes('subagents');

export interface ParsedCacheEntry { key: string; messages: TranscriptMessage[] }

export interface ReadDeps {
  entryFor: (provider: 'claude' | 'native', id: string) => { transcriptPath: string; tombstone: boolean } | null;
  localPathFor: (provider: 'claude' | 'native', id: string) => string | null;
  /** Legal roots, resolved at call time (the space root is user-configurable). */
  roots: string[];
  /** Per-file parse cache, keyed by real path; value key = `${mtimeMs}:${size}`. */
  cache: Map<string, ParsedCacheEntry>;
}

export async function readTranscriptSlice(req: ChatsearchReadRequest, deps: ReadDeps): Promise<ChatsearchReadResponse> {
  if (!SESSION_UUID_RE.test(req.id)) return { ok: false, error: COPY.errNotAnId };
  const entry = deps.entryFor(req.provider, req.id);
  if (!entry) return { ok: false, error: COPY.errNotIndexed };
  if (entry.tombstone) return { ok: false, error: COPY.previewTombstone };
  // Local first (authoritative and current), then the mirror the index recorded.
  const candidates = [deps.localPathFor(req.provider, req.id), entry.transcriptPath].filter((p): p is string => !!p);
  let chosen: string | null = null;
  for (const c of candidates) {
    if (isSubagentPath(c)) return { ok: false, error: COPY.errNotAConversation };
    const contained = containedTranscriptPath(c, deps.roots);
    if (contained) { chosen = contained; break; }
    if (fs.existsSync(c)) return { ok: false, error: COPY.errOutsideRoots };
  }
  if (!chosen) {
    try { fs.statSync(entry.transcriptPath); } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
    return { ok: false, error: COPY.errOutsideRoots };
  }
  let st: fs.Stats; try { st = fs.statSync(chosen); } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
  const key = `${st.mtimeMs}:${st.size}`;
  let cached = deps.cache.get(chosen);
  if (!cached || cached.key !== key) {
    let text: string; try { text = await fs.promises.readFile(chosen, 'utf8'); } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
    let messages: TranscriptMessage[];
    if (req.provider === 'native') messages = parseNativeTranscript(text);
    else { const r = parseClaudeTranscript(text); if (r.allSidechain) return { ok: false, error: COPY.errNotAConversation }; messages = r.messages; }
    cached = { key, messages };
    // Bound the cache: the pane looks at one or two conversations at a time.
    if (deps.cache.size >= 4) deps.cache.delete(deps.cache.keys().next().value as string);
    deps.cache.set(chosen, cached);
  }
  return { ok: true, ...sliceMessages(cached.messages, req.tail, req.before) };
}
```

- [ ] **Step 5: Run** — PASS. **Step 6: Commit**

```bash
git add src/main/chatsearch-index/transcript-reader.ts tests/chatsearch-transcript-reader.test.ts tests/fixtures/chatsearch
git commit -m "feat(chatsearch-refs): bounded two-lane transcript reader with containment, subagent refusal, and a parse cache"
```

---

### Task 10: Subagent-exclusion pinning test for the two enumerators

**Files:** Test: `tests/subagent-exclusion.test.ts`

- [ ] Build a temp `projects/<slug>/` holding `<id>.jsonl` (copy of `tests/fixtures/chatsearch/claude-session.jsonl`) and `<id>/subagents/agent-1.jsonl` (the subagent fixture). Call `listPastSessions` (`session-browser.ts`) and the reconciler's scan (`rg -n "^export" src/main/conversations/reconciler.ts`) pointed at that directory — use whatever injection their existing tests use (`rg -l "listPastSessions\|reconcile" tests`) — and assert `ids` equals `[ID]` and nothing starts with `agent-`. If an enumerator has no injectable root, add an optional `projectsDir` parameter defaulting to the current constant.
- [ ] Run → PASS (pins the current accident as a rule). Commit: `test(chatsearch-refs): pin that subagent transcripts are never enumerated as sessions`.

---

### Task 11: IPC on all surfaces + retire the workbench mock-only entries

**Files:**
- Create: `src/main/chatsearch-index/refs-service.ts`
- Modify: `src/main/ipc-handlers.ts:3581`, `src/main/preload.ts:1393`, `src/renderer/remote-shim.ts:1303`, `src/main/remote-server.ts` (a `case` beside `'session:list'` at `:798`; shape as `'syncspaces:lease-query'` at `:1907`), `../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3690-3695`, `tests/ipc-channels.test.ts:552` (copy the `project:*` describe), `src/renderer/dev/workbench/mock-only.ts` (remove both entries; the fake namespace in `mock-shim.ts` STAYS).

**Interfaces:**
- Consumes: Tasks 8, 9; `chatsearchDir` (`index-store.ts:32`), `buildLocalProjectResolver` (`conversations/service.ts:531`), `getManagedRoots` (`sync-spaces/service.ts:645`), `ccProjectSlug` / `nativeStoreSlug` (`slug-encoding.ts:44, :54`), `NativeHome` (`native-home.ts:27`, ctor defaults to `os.homedir()`).

- [ ] **Step 1: The glue**

```ts
// src/main/chatsearch-index/refs-service.ts
// Binds the pure readers to THIS device's folders. One place, so the IPC
// handler and the remote WS case cannot drift.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { chatsearchDir } from './index-store';
import { readMetaFile, resolveShortIds } from './meta-reader';
import { readTranscriptSlice, type ParsedCacheEntry } from './transcript-reader';
import { buildLocalProjectResolver } from '../conversations/service';   // :531
import { getManagedRoots } from '../sync-spaces/service';               // :645
import { ccProjectSlug, nativeStoreSlug } from '../slug-encoding';      // :44, :54
import { NativeHome } from '../native-home';
import type { ChatsearchReadRequest, ChatsearchReadResponse, ChatsearchResolveResponse } from '../../shared/chatsearch-refs';

const CLAUDE_PROJECTS = () => path.join(os.homedir(), '.claude', 'projects');
const NATIVE_SESSIONS = () => path.join(new NativeHome().root, 'sessions');
const parseCache = new Map<string, ParsedCacheEntry>();

function localTranscriptPath(provider: 'claude' | 'native', localPath: string, id: string): string {
  return provider === 'native'
    ? path.join(NATIVE_SESSIONS(), nativeStoreSlug(localPath), `${id}.jsonl`)
    : path.join(CLAUDE_PROJECTS(), ccProjectSlug(localPath), `${id}.jsonl`);
}

export function resolveConversations(shortIds: unknown): ChatsearchResolveResponse {
  if (!Array.isArray(shortIds) || shortIds.length > 100) return { ok: false, error: 'Expected up to 100 ids' };
  const resolveLocal = buildLocalProjectResolver();
  return {
    ok: true,
    results: resolveShortIds(shortIds.map(String), {
      dir: chatsearchDir(os.homedir()), resolveLocal,
      transcriptExistsLocally: (p, local, id) => fs.existsSync(localTranscriptPath(p, local, id)),
      slugFor: (p, local) => (p === 'native' ? nativeStoreSlug(local) : ccProjectSlug(local)),
    }),
  };
}

export async function readConversation(req: ChatsearchReadRequest): Promise<ChatsearchReadResponse> {
  if (!req || (req.provider !== 'claude' && req.provider !== 'native') || typeof req.id !== 'string') return { ok: false, error: 'Bad request' };
  const dir = chatsearchDir(os.homedir());
  const resolveLocal = buildLocalProjectResolver();
  // The space root is user-configurable — resolve it NOW, not at module load.
  const personalRoot = getManagedRoots()?.personalRoot;
  const roots = [CLAUDE_PROJECTS(), NATIVE_SESSIONS(), ...(personalRoot ? [path.join(personalRoot, 'Conversations')] : [])];
  const entryOf = (p: 'claude' | 'native', id: string) => readMetaFile(dir, p)?.conversations[id];
  return readTranscriptSlice(
    { provider: req.provider, id: req.id, tail: Number(req.tail) || 40, ...(req.before !== undefined ? { before: Number(req.before) } : {}) },
    {
      entryFor: (p, id) => { const e = entryOf(p, id); return e ? { transcriptPath: e.transcriptPath, tombstone: !!e.tombstone } : null; },
      localPathFor: (p, id) => { const e = entryOf(p, id); const local = e ? resolveLocal({ projectName: e.projectName, originalPath: e.originalPath }) : null; return local ? localTranscriptPath(p, local, id) : null; },
      roots, cache: parseCache,
    },
  );
}
```

- [ ] **Step 2: The surfaces**

`ipc-handlers.ts` (after the `PROJECT_IPC` handlers; import `CHATSEARCH_IPC`, `resolveConversations`, `readConversation`):
```ts
  // Session references (spec 2026-08-10): resolve chatsearch short ids against
  // the index the app writes, and read bounded transcript slices by id.
  ipcMain.handle(CHATSEARCH_IPC.RESOLVE, async (_e, shortIds: string[]) => resolveConversations(shortIds));
  ipcMain.handle(CHATSEARCH_IPC.READ, async (_e, req: ChatsearchReadRequest) => readConversation(req));
```
`preload.ts`:
```ts
  chatsearch: {
    resolve: (shortIds: string[]) => ipcRenderer.invoke('chatsearch:resolve', shortIds),
    read: (req: { provider: string; id: string; tail: number; before?: number }) => ipcRenderer.invoke('chatsearch:read', req),
  },
```
`remote-shim.ts` (object payload, like `project.*`):
```ts
    chatsearch: {
      resolve: (shortIds: string[]) => invoke('chatsearch:resolve', { shortIds }),
      read: (req: { provider: string; id: string; tail: number; before?: number }) => invoke('chatsearch:read', req),
    },
```
`remote-server.ts`:
```ts
      case 'chatsearch:resolve': { this.respond(client.ws, type, id, resolveConversations(payload?.shortIds)); break; }
      case 'chatsearch:read': { this.respond(client.ws, type, id, await readConversation(payload)); break; }
```
`SessionService.kt` — add `"chatsearch:resolve",` and `"chatsearch:read",` to the not-implemented block with `// Android has no chatsearch index; the shared UI falls back to plain shell output.`

- [ ] **Step 3: Parity + retire mock-only** — add `describe('chatsearch:* channel parity')` with `CHANNEL_TO_CONST = { 'chatsearch:resolve': 'CHATSEARCH_IPC.RESOLVE', 'chatsearch:read': 'CHATSEARCH_IPC.READ' }`; empty the `MOCK_ONLY` array (keep the comment).

- [ ] **Step 4: Verify** — `npx vitest run tests/ipc-channels.test.ts tests/workbench-mock-contract.test.ts && npx tsc --noEmit && cd /home/destin/youcoded-dev && node scripts/workbench-boot-check.mjs` → PASS. Then `bash scripts/run-dev.sh <worktree> --label "Chat Search Refs"`, ask *"search my past conversations for permission timeout"*: cards; Preview with real bubbles and gap markers; Load older without a re-read (watch main's CPU); Resume on a local-folder conversation opens a tab; a foreign one is disabled with the right sentence.

- [ ] **Step 5: Commit**

```bash
git add src/main/chatsearch-index/refs-service.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts src/renderer/dev/workbench/mock-only.ts
git commit -m "feat(chatsearch-refs): chatsearch:resolve + chatsearch:read on all surfaces; Android stub; mock-only retired"
```

---

### Task 12: Resume wiring in App

**Files:** Modify `src/renderer/App.tsx` (~`:224`, beside the `youcoded:open-model-providers` listener; `handleResumeSession` at `:2282`). Test: extend the test that covers `youcoded:open-model-providers` (`rg -l "open-model-providers" tests src/renderer`) or add `tests/app-resume-event.test.tsx`.

- [ ] **Step 1: Listener**

```ts
  // Session-reference cards (deep in the chat tree) ask to resume by event —
  // same deep-component→destination pattern as youcoded:open-library. Provider
  // is threaded so a native conversation lands in the pre-resume model picker
  // (handleResumeSession opens it when called without a binding) instead of
  // auto-launching; a claude conversation opens as a new tab directly.
  useEffect(() => {
    const onResume = (e: Event) => {
      const d = (e as CustomEvent).detail as { claudeSessionId: string; projectSlug: string; projectPath: string; provider?: string };
      if (!d?.claudeSessionId || !d.projectSlug || !d.projectPath) return;
      void handleResumeSession(d.claudeSessionId, d.projectSlug, d.projectPath, undefined, undefined, undefined, d.provider);
    };
    window.addEventListener('youcoded:resume-session', onResume);
    return () => window.removeEventListener('youcoded:resume-session', onResume);
  }, [handleResumeSession]);
```

- [ ] **Step 2: Test** — dispatch with `provider: 'native'` → the model-picker state the existing native-resume tests inspect opens; with `provider: 'claude'` → the claude path's IPC is invoked (mock it as those tests do).
- [ ] **Step 3: Commit** — `feat(chatsearch-refs): Resume from a card routes through handleResumeSession (native → model picker)`.

---

### Task 13: Unknown-segment guard + serialization golden case (unconditional, small)

**Files:** `src/renderer/components/AssistantTurnBubble.tsx:204` (`splitIntoBubbles`), `src/renderer/components/AssistantTurnBubble.test.tsx`, `src/renderer/state/__tests__/chat-serialization.test.ts`.

- [ ] In `splitIntoBubbles`, turn the trailing `else` into `else if (seg.type === 'tool-group') { …existing body… } else { /* A segment type this bundle does not know — a NEWER host sent it over the remote socket. Render nothing rather than misfile it as a tool group (which would push undefined as a group id). */ }`. Test: `{ type: 'from-the-future' } as any` yields no bubble and does not throw.
- [ ] Append to `chat-serialization.test.ts` a round-trip with a turn holding `text`, `reasoning`, `tool-group`, `plan` segments, asserting the JSON contains `"type":"plan"` and `deserialize(serialize(x))` equals `x`. (Add `session-card` to it only if Task 14 is built.)
- [ ] Commit: `fix(chat): unknown assistant segments render as nothing; serialization pins populated segments`.

---

### Task 14 (CONDITIONAL — only if Destin asked for it at Task 4/7): `show` as its own turn segment

Skip entirely if Destin was fine with `show` inside the tool group. If built, the spec's A2 "Grouping" section is the design; the requirements that matter:

- [ ] Add `| { type: 'session-card'; messageId: string; toolUseId: string }` to `AssistantTurnSegment` (`chat-types.ts:28-45`).
- [ ] In `chat-reducer.ts` `TRANSCRIPT_TOOL_USE` (`:1143`), the decision must come from the **command** (`isChatsearchCommand` + `/"cmd"\s*:\s*"show"/` — the output has not arrived yet; a wrong guess only changes placement, never correctness) and must be applied on **every branch that places a tool**: the normal path (`:1262-1312`, before `placeToolInCurrentGroup`) AND the permission-placeholder path (`:1186-1250`), which is the branch Bash takes in the default "ask" mode. Use `getOrCreateTurn(session)` (`:78`) and never read or write `currentGroupId`.
- [ ] `splitIntoBubbles`: a `session-card` branch above the `tool-group` one, producing its own bubble; render it via `<ToolCard tool={toolCalls.get(toolUseId)} />`.
- [ ] Tests: `Read → show → Read` ⇒ segments `['text','tool-group','session-card']` and ONE group `['r1','r2']`; same result when the show arrives through the permission-placeholder branch (mirror `stateWithInFlightTurn` and the perm-merge fixtures in `src/renderer/state/__tests__/chat-reducer.test.ts`); consecutive shows → two segments; re-emit → no duplicate; a `find` stays in the group; `currentGroupId` unchanged across the show; `session-card` added to the Task 13 golden case.
- [ ] Commit: `feat(chatsearch-refs): show renders as its own turn segment`.

---

### Task 15: Full verification

- [ ] `cd /home/destin/youcoded-dev && bash scripts/verify.sh <worktree> --full` → green.
- [ ] `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test` (never in a linked worktree) → green; the Kotlin stub compiles.
- [ ] Dev instance at 390px (DevTools device toolbar in the **dev** window only): preview pane inside the drawer, no horizontal overflow.
- [ ] Ask Destin to eyeball the real dev instance once — the "launch and look" handoff; do not script it.

---

### Task 16: Finish the branch and the docs

- [ ] `superpowers:finishing-a-development-branch`: PR against `youcoded` master titled `feat(chatsearch): session references — Preview/Resume cards from search results`; body lists the two channels, the Android stub, whether Task 14 was built. Merge means merge AND push; remove the worktree and branch after.
- [ ] Workspace repo: move the spec and this plan to `docs/archive/` with `status: shipped`; update the handoff (shipped, PR number, what Destin cut/kept); flip the "unbuilt" wording in the ROADMAP "Chat Search phases 2 + 3" entry to shipped with the merge sha.

---

### Task 17 (separate repo, any time after Task 7): the skill sentence

- [ ] In `wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/SKILL.md`, after item 3 of "Token discipline":

```
4. **When you name one specific past conversation to the user, `show` it** —
   one `show` per conversation you name, never a page of them. In YouCoded the
   `show` output renders as a card with Preview and Resume, so the user can open
   what you are talking about. (`find` results render as cards too.)
```

- [ ] PR to `wecoded-marketplace` master; CI deploys. Note in the PR body that existing installs will not pick this up until bundled-plugin upgrades exist (ROADMAP, 2026-08-25).

---

## Self-review against the spec

- **A** (find card, selection, in-app resolve, fallbacks incl. Android): Tasks 1, 3, 8, 11. **A2** (show card; segment conditional; unknown-segment guard; golden case; skill sentence): Tasks 3, 13, 14, 17. **B** (extracted renderer, markdown, no sessionId, gap marker): Task 5. **C/C2/C3** (id-keyed reader, three roots at call time, realpath, subagent refusal, bounded, keep assistant text, parse cache): Tasks 9, 11. **D** (preview field, list as cut candidate, exclusivity): Task 6. **E** (resume, native picker, disabled reasons): Tasks 3, 12. **Step 1 gate**: Tasks 4 and 7. **Task 0**: the handoff's precondition. **Narrow viewport**: Tasks 5, 6, 15. **Parity + Android stub**: Task 11. **Enumerator pin**: Task 10.
- **Names used consistently:** `ResolvedConversation`, `TranscriptMessage`, `ChatsearchReadRequest/Response`, `COPY`, `providerLabel`, `describeChatsearchCall`, `isChatsearchCommand` (Task 1) → Tasks 3, 5, 6, 8, 9, 11, 14. Events `youcoded:preview-session` / `youcoded:resume-session` (Task 3) → Tasks 6, 12. Actions `SESSION_PREVIEW_SET/CLEARED`, `SESSION_REFERENCED` (Task 6). `ReadDeps.cache` / `ParsedCacheEntry` (Task 9) → Task 11.
- **Judgement calls an implementer must not silently change:** `status === 'complete'`; expanded-by-default until Destin says otherwise; the listener lives in `ChatView`; the drawer's `:607` early return includes the preview; Task 14 is conditional and, if built, must cover the permission-placeholder branch.
