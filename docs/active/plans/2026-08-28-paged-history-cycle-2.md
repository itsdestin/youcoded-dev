# Paged Conversation History (Cycle 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open, resume, re-dock and reload a conversation by rendering only its most recent ~30 turns, fetching older turns on scroll-to-top — so a 22-second open of a huge conversation becomes near-instant, with no change to a live session the user is reading.

**Architecture:** The JSONL transcript on disk stays the single source of truth. One new main-process request, `transcript:page(sessionId, beforeCursor?) → { events, cursor, hasMore }`, replaces the "replay the whole file" path: it scans the file backward to a user-prompt boundary, streams that slice forward through the *existing* `parseTranscriptLine`, and returns an opaque cursor. The renderer keeps per-session `history` state (`cursor`/`hasMore`/`loading`), prepends each older page through the existing per-event reducer handlers, and requests the next page when a top-of-list sentinel scrolls into view. The live tailer starts at end-of-file on resume (today it re-reads from byte 0), so the first page and the live stream never overlap. Reducer ids stay counter-based; idempotency comes from cursor discipline (one in-flight page per session, monotonic cursor), not from id identity. **Eviction and on-device Android are explicitly out of scope this cycle** (Destin's decisions 1a/2a — they are cycle 3 / a later cycle).

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React, a WebSocket remote bridge, Node `fs` streaming (`readline`/`createReadStream`), Vitest + jsdom, the perf-lab rig (Node, CDP).

**Spec:** `docs/active/specs/2026-08-27-paged-history-and-read-hardening-design.md` (reviewed 2026-08-28 — read its `## Spec review` section first; this plan implements §2 for desktop only, with the 12 corrections applied).

**Repo:** all app code is in `/home/destin/youcoded-dev/youcoded/` (`desktop/`). Rig code is in `/home/destin/youcoded-dev/scripts/perf-lab/`. Work in the worktree `worktrees/perf-lab/` on branch `perf/paged-history` (already created off master `97600ddd`). Run `bash scripts/verify.sh worktrees/perf-lab` from the workspace root after each task group.

---

## Constants (from the spec, Destin 2026-08-27)

| Constant | Value | Where it lives |
|---|---|---|
| `PAGE_TURNS` | 30 | `desktop/src/main/transcript-page.ts` (exported) + rig `scenario-workload.mjs` |
| `PAGE_MAX_BYTES` | 2 MB (`2 * 1024 * 1024`) | `desktop/src/main/transcript-page.ts` |

No eviction constants this cycle (`EVICT_AFTER_MS`, eviction threshold) — they belong to cycle 3.

---

## File structure

**Create:**
- `desktop/src/main/transcript-page.ts` — the tail-page reader (CC transcripts + subagents). One responsibility: given a file path and an optional end offset, return the last ≤`PAGE_TURNS` turns (≤`PAGE_MAX_BYTES`) as `TranscriptEvent[]` plus a next cursor.
- `desktop/tests/transcript-page.test.ts` — unit tests for the reader.
- `desktop/tests/history-paging-reducer.test.ts` — reducer tests for `HISTORY_PAGE_LOADED` + `history` state.
- `desktop/tests/transcript-page-channel-parity.test.ts` — the three-surface parity block for `transcript:page` (mirrors the per-channel blocks in `ipc-channels.test.ts`).

**Modify:**
- `desktop/src/shared/types.ts` — add `TRANSCRIPT_PAGE` channel const; add `PageCursor` + `TranscriptPageResult` types; add optional `data.offset` to `TranscriptEvent`.
- `desktop/src/main/transcript-watcher.ts` — `startWatching` starts at EOF for an existing file and records the start offset; a `getStartOffset(sessionId)` accessor; `parseTranscriptLine` unchanged but the page reader shares it.
- `desktop/src/main/native-home.ts` / `harness/session-store.ts` — a tail-page reader for native session files (reuse the CC boundary logic).
- `desktop/src/main/ipc-handlers.ts` — add the `transcript:page` handler; retire the `transcript:replay-from-start` handler's role in the first-load path (kept only for the ownership-handoff re-send of asks/runs, see Task 8).
- `desktop/src/main/preload.ts` — add `requestTranscriptPage`; keep `requestTranscriptReplay` (still used by handoff).
- `desktop/src/main/remote-server.ts` — add a `transcript:page` WS case.
- `desktop/src/renderer/remote-shim.ts` — add `requestTranscriptPage` (real WS call, not a stub).
- `desktop/src/renderer/hooks/useIpc.ts` — type the new method.
- `desktop/src/renderer/state/chat-types.ts` — add `history` to `SessionChatState` (+ serializer round-trip + defaults); add `HISTORY_PAGE_LOADED` / `HISTORY_PAGE_REQUESTED` / `HISTORY_PAGE_FAILED` actions; retire `HISTORY_LOADED`.
- `desktop/src/renderer/state/chat-reducer.ts` — add the `HISTORY_PAGE_*` cases; retire `HISTORY_LOADED`.
- `desktop/src/renderer/App.tsx` — replace the four `requestTranscriptReplay` first-load call sites with a first-page request; retire `resumeInfo`, the CC-resume `loadHistory(…,10)` block.
- `desktop/src/renderer/components/buddy/BubbleFeed.tsx` — request the first page (buddy runs its own reducer).
- `desktop/src/renderer/components/ChatView.tsx` — top-of-list sentinel + scroll anchoring on prepend; delete `HistoryExpandButton`.
- `desktop/src/renderer/state/pty-input-gate.ts` — re-key off the first page's arrival, not `HISTORY_EXPAND_PROMPT_ID`.
- `.claude/rules/chat-reducer.md` — note `history` state + that paging never clears `toolCalls` (eviction, which would, is cycle 3).
- Rig: `scripts/perf-lab/scenario-workload.mjs`, `scenario-history.mjs`, `scenario-replay-stall.mjs` + their tests under `scripts/perf-lab/tests/`.

---

## Task 1: The tail-page reader — boundary + forward parse (CC transcripts)

**Files:**
- Create: `desktop/src/main/transcript-page.ts`
- Create: `desktop/tests/transcript-page.test.ts`

The reader answers one question: *"give me the last N turns of this file ending before byte `endOffset`."* A "turn boundary" is a `type:"user"` JSONL line that is a real prompt (`promptId` present, `isMeta` not true) — snapping there keeps every `tool_use` with its `tool_result`. It scans backward in 64 KB chunks (the `transcript-utils.ts:41` pattern) to find the start byte, then streams forward line-by-line from that byte through `parseTranscriptLine`, applying the same replay dedupe as `getHistory` (repeated uuid ⇒ skip `assistant-text`, keep tool events).

- [ ] **Step 1: Write the failing test for boundary + basic paging**

Create `desktop/tests/transcript-page.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readTranscriptPage, PAGE_TURNS, PAGE_MAX_BYTES } from '../src/main/transcript-page';

// A minimal CC-shaped transcript: one user prompt line + one assistant end_turn
// line per turn, each with a unique uuid. Mirrors fixture.mjs transcriptLines
// (two JSONL lines per turn), which the rig already trusts.
function turnLines(i: number): string {
  const user = JSON.stringify({
    type: 'user', uuid: `u-${i}`, promptId: `p-${i}`, isMeta: false,
    timestamp: 1000 + i, message: { role: 'user', content: `prompt ${i}` },
  });
  const asst = JSON.stringify({
    type: 'assistant', uuid: `a-${i}`, timestamp: 1001 + i,
    message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: `reply ${i}` }] },
  });
  return user + '\n' + asst + '\n';
}

function writeTranscript(turns: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-test-'));
  const p = path.join(dir, 'session.jsonl');
  let body = '';
  for (let i = 0; i < turns; i++) body += turnLines(i);
  fs.writeFileSync(p, body);
  return p;
}

describe('readTranscriptPage — CC transcript', () => {
  let jsonlPath: string;
  afterEach(() => { try { fs.rmSync(path.dirname(jsonlPath), { recursive: true, force: true }); } catch {} });

  it('a short file (< PAGE_TURNS) returns every turn and hasMore=false', async () => {
    jsonlPath = writeTranscript(5);
    const page = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: null });
    // 5 turns × 2 renderable events (user-message + assistant-text)
    expect(page.events.filter((e) => e.type === 'user-message')).toHaveLength(5);
    expect(page.events.filter((e) => e.type === 'assistant-text')).toHaveLength(5);
    expect(page.hasMore).toBe(false);
    // Order preserved oldest→newest within the page.
    const firstUser = page.events.find((e) => e.type === 'user-message');
    expect(firstUser?.data.text).toBe('prompt 0');
  });

  it('a long file returns only the last PAGE_TURNS turns and hasMore=true', async () => {
    jsonlPath = writeTranscript(PAGE_TURNS + 20);
    const page = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: null });
    const users = page.events.filter((e) => e.type === 'user-message');
    expect(users).toHaveLength(PAGE_TURNS);
    // The newest turn is present; the oldest 20 are not.
    expect(users[0].data.text).toBe(`prompt 20`);
    expect(users[users.length - 1].data.text).toBe(`prompt ${PAGE_TURNS + 19}`);
    expect(page.hasMore).toBe(true);
    expect(page.cursor).not.toBeNull();
  });

  it('the cursor pages backward to the beginning, then stops', async () => {
    jsonlPath = writeTranscript(PAGE_TURNS + 20);
    const first = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: null });
    const second = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: first.cursor!.offset });
    const users2 = second.events.filter((e) => e.type === 'user-message');
    expect(users2).toHaveLength(20); // the remaining older turns
    expect(users2[0].data.text).toBe('prompt 0');
    expect(second.hasMore).toBe(false);
  });

  it('PAGE_MAX_BYTES stops a heavy page early (fewer than PAGE_TURNS turns)', async () => {
    // Turns padded past 2 MB in far fewer than PAGE_TURNS turns.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-test-'));
    jsonlPath = path.join(dir, 'session.jsonl');
    const bigText = 'x'.repeat(300 * 1024); // 300 KB per assistant line
    let body = '';
    for (let i = 0; i < PAGE_TURNS; i++) {
      body += JSON.stringify({ type: 'user', uuid: `u-${i}`, promptId: `p-${i}`, isMeta: false, timestamp: i, message: { role: 'user', content: `q${i}` } }) + '\n';
      body += JSON.stringify({ type: 'assistant', uuid: `a-${i}`, timestamp: i, message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: bigText }] } }) + '\n';
    }
    fs.writeFileSync(jsonlPath, body);
    const page = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: null });
    const users = page.events.filter((e) => e.type === 'user-message');
    expect(users.length).toBeLessThan(PAGE_TURNS); // capped by bytes, not turns
    expect(users.length).toBeGreaterThan(0);
    expect(page.hasMore).toBe(true);
  });

  it('a missing file returns an empty page, not a throw', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-test-'));
    jsonlPath = path.join(dir, 'nope.jsonl');
    const page = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: null });
    expect(page.events).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.cursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page.test.ts`
Expected: FAIL — `Cannot find module '../src/main/transcript-page'`.

- [ ] **Step 3: Implement the reader**

Create `desktop/src/main/transcript-page.ts`:

```ts
import * as fs from 'node:fs';
import { parseTranscriptLine } from './transcript-watcher';
import type { TranscriptEvent } from '../shared/types';

/** User turns per page (Destin 2026-08-27). */
export const PAGE_TURNS = 30;
/** Hard byte cap per page; a turn-heavy page stops early (Destin 2026-08-27). */
export const PAGE_MAX_BYTES = 2 * 1024 * 1024;

const CHUNK = 65536; // mirrors transcript-utils.ts readTranscriptMeta

/** Opaque to the renderer. `offset` is the byte at which this page STARTS —
 *  the next (older) page reads with endOffset = this. */
export interface PageCursor {
  path: string;
  offset: number;
  sizeAtRead: number;
}

export interface TranscriptPageResult {
  events: TranscriptEvent[];
  cursor: PageCursor | null; // null when hasMore is false
  hasMore: boolean;
}

interface PageArgs {
  jsonlPath: string;
  sessionId: string;
  /** Read the turns ending strictly before this byte. null = end of file. */
  endOffset: number | null;
}

/** True for a JSONL line that starts a user turn (a real prompt, not a
 *  tool_result carrier or a meta line). Cheap string checks first, then a
 *  parse only for candidate lines. */
function isTurnBoundary(line: string): boolean {
  if (!line.includes('"type":"user"') && !line.includes('"type": "user"')) return false;
  let obj: any;
  try { obj = JSON.parse(line); } catch { return false; }
  if (obj.type !== 'user') return false;
  if (obj.isMeta === true) return false;
  if (obj.promptId == null) return false;
  return true;
}

/**
 * The last ≤PAGE_TURNS turns (≤PAGE_MAX_BYTES) of `jsonlPath` ending before
 * `endOffset`. Scans backward in 64 KB chunks to find the start byte snapped to
 * a user-prompt boundary, then reads that slice forward and parses it with the
 * SAME parseTranscriptLine the live path uses, so cards/groups/markers are
 * byte-for-byte identical.
 */
export async function readTranscriptPage(args: PageArgs): Promise<TranscriptPageResult> {
  const { jsonlPath, sessionId } = args;
  let handle: fs.promises.FileHandle;
  try { handle = await fs.promises.open(jsonlPath, 'r'); }
  catch { return { events: [], cursor: null, hasMore: false }; }

  try {
    const stat = await handle.stat();
    const size = stat.size;
    const end = args.endOffset == null ? size : Math.min(args.endOffset, size);
    if (end <= 0) return { events: [], cursor: null, hasMore: false };

    // --- 1. Scan backward for the page's start byte ------------------------
    // We keep a rolling buffer of the tail we've seen and count user-prompt
    // boundaries. The start byte is the offset of the PAGE_TURNS-th boundary
    // from the end, or the byte at which the running total crosses
    // PAGE_MAX_BYTES, or 0 (whole remaining file).
    let pos = end;
    let carry = ''; // bytes read but not yet consumed (spans a chunk edge)
    const boundaryOffsets: number[] = []; // absolute byte offsets of boundaries, newest first
    let scannedBytes = 0;
    let reachedStart = false;
    let startByte = 0;

    while (pos > 0) {
      const readSize = Math.min(CHUNK, pos);
      const from = pos - readSize;
      const buf = Buffer.alloc(readSize);
      await handle.read(buf, 0, readSize, from);
      scannedBytes += readSize;
      const text = buf.toString('utf8') + carry;
      // Split into lines with their absolute start offsets. `from` is the byte
      // offset of text[0] MINUS the carry length (carry came from a later read),
      // so compute offsets relative to `from` for the freshly-read prefix only.
      // Simplest correct approach: re-split the whole `text` and map each line
      // to its offset by walking lengths from `from`.
      const lines = text.split('\n');
      // The first element may be a partial line whose head is in an earlier
      // (older) chunk — carry it to the next iteration.
      carry = lines.shift() ?? '';
      // Walk lines newest→oldest is unnecessary; compute each line's absolute
      // offset from `from + carry.length` forward.
      let cursorByte = from + Buffer.byteLength(carry, 'utf8') + 1; // +1 for the '\n' after carry
      const lineOffsets: Array<{ line: string; offset: number }> = [];
      for (const line of lines) {
        lineOffsets.push({ line, offset: cursorByte });
        cursorByte += Buffer.byteLength(line, 'utf8') + 1;
      }
      // Record boundaries in this chunk (they are already in ascending offset).
      for (let i = lineOffsets.length - 1; i >= 0; i--) {
        const { line, offset } = lineOffsets[i];
        if (offset >= end) continue;
        if (isTurnBoundary(line)) {
          boundaryOffsets.push(offset);
          if (boundaryOffsets.length >= PAGE_TURNS + 1) {
            // The (PAGE_TURNS+1)-th boundary from the end is the START of the
            // page BEFORE this one; the page we return begins at the
            // PAGE_TURNS-th boundary.
            startByte = boundaryOffsets[PAGE_TURNS - 1];
            reachedStart = true;
            break;
          }
        }
      }
      if (reachedStart) break;
      if (scannedBytes >= PAGE_MAX_BYTES) {
        // Byte cap: start at the oldest boundary we have seen so far (never
        // mid-turn); if we have none yet, start at this chunk's front.
        startByte = boundaryOffsets.length ? boundaryOffsets[boundaryOffsets.length - 1] : from;
        reachedStart = true;
        break;
      }
      pos = from;
    }

    if (!reachedStart) {
      // Fewer than PAGE_TURNS turns before `end`: the page is the whole span
      // [0, end).
      startByte = 0;
    }

    const hasMore = startByte > 0;

    // --- 2. Read [startByte, end) forward and parse ------------------------
    const span = end - startByte;
    const buf = Buffer.alloc(span);
    await handle.read(buf, 0, span, startByte);
    const events: TranscriptEvent[] = [];
    const seenUuids = new Set<string>();
    let lineStart = startByte;
    for (const rawLine of buf.toString('utf8').split('\n')) {
      const lineBytes = Buffer.byteLength(rawLine, 'utf8') + 1;
      const thisOffset = lineStart;
      lineStart += lineBytes;
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = parseTranscriptLine(line, sessionId);
      if (parsed.length === 0) continue;
      const lineUuid = parsed[0].uuid;
      const isRepeat = !!lineUuid && seenUuids.has(lineUuid);
      if (lineUuid) seenUuids.add(lineUuid);
      for (const ev of parsed) {
        if (isRepeat && ev.type === 'assistant-text') continue;
        // Stamp the byte offset on user-message events only — this is what a
        // future eviction cursor (cycle 3) is minted from; harmless now.
        if (ev.type === 'user-message') ev.data.offset = thisOffset;
        events.push(ev);
      }
    }

    return {
      events,
      cursor: hasMore ? { path: jsonlPath, offset: startByte, sizeAtRead: size } : null,
      hasMore,
    };
  } finally {
    await handle.close();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page.test.ts`
Expected: PASS (5 tests). If the byte-offset arithmetic is off (a boundary landing mid-turn), fix the offset walk in Step 3 — the invariant the tests pin is *user-message count per page* and *oldest/newest text*, so a boundary error surfaces as a wrong count.

- [ ] **Step 5: Add `data.offset` to the event type and commit**

In `desktop/src/shared/types.ts`, inside the `TranscriptEvent['data']` object (near `recordedAt?`), add:

```ts
    /** Byte offset of this line's start in the transcript, stamped by the page
     *  reader on user-message events. The seed for a future eviction cursor
     *  (cycle 3); unused today. Absent on live-tailer events. */
    offset?: number;
```

Run: `cd youcoded/desktop && npx tsc --noEmit` → PASS.

```bash
git add desktop/src/main/transcript-page.ts desktop/tests/transcript-page.test.ts desktop/src/shared/types.ts
git commit -m "feat(history): tail-page reader for CC transcripts (Task 1)

Reads the last <=PAGE_TURNS turns (<=PAGE_MAX_BYTES) ending before a byte
offset, snapping page boundaries to user prompts and parsing forward through
the existing parseTranscriptLine so cards/groups/markers are identical to the
live path. Cursor is opaque {path, offset, sizeAtRead}. Cycle 2 of the perf
programme; no wiring yet.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 2: Cursor invalidation on a shrunk file

**Files:**
- Modify: `desktop/src/main/transcript-page.ts`
- Modify: `desktop/tests/transcript-page.test.ts`

`/clear` and `/compact` rewrite the file shorter. A cursor minted before the rewrite points past the new end. The reader must answer `hasMore:false` with an empty page so the renderer drops the cursor (spec §2.2).

- [ ] **Step 1: Write the failing test**

Append to `desktop/tests/transcript-page.test.ts` inside the describe:

```ts
  it('a cursor whose offset is past the current file size yields an empty final page', async () => {
    jsonlPath = writeTranscript(PAGE_TURNS + 20);
    const first = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: null });
    // Simulate a /clear: truncate the file well below the cursor's offset.
    fs.truncateSync(jsonlPath, 10);
    const stale = await readTranscriptPage({ jsonlPath, sessionId: 's1', endOffset: first.cursor!.offset });
    expect(stale.events).toEqual([]);
    expect(stale.hasMore).toBe(false);
    expect(stale.cursor).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page.test.ts -t "past the current file size"`
Expected: FAIL — the `Math.min(args.endOffset, size)` clamp reads a small valid span instead of returning empty.

- [ ] **Step 3: Implement the guard**

In `readTranscriptPage`, right after computing `size`, before the backward scan:

```ts
    // A cursor minted before a /clear or /compact rewrite points past the new
    // end. Treat it as "history is over" so the renderer drops the cursor,
    // exactly as the live tailer resets on a shrink (transcript-watcher.ts).
    if (args.endOffset != null && args.endOffset > size) {
      return { events: [], cursor: null, hasMore: false };
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/transcript-page.ts desktop/tests/transcript-page.test.ts
git commit -m "feat(history): a stale cursor (file shrank below it) ends paging cleanly (Task 2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 3: Subagent events for in-page Agent tool_uses

**Files:**
- Modify: `desktop/src/main/transcript-page.ts`
- Modify: `desktop/src/main/subagent-watcher.ts` (add a bounded, replay-only reader keyed on a set of parent tool ids)
- Modify: `desktop/tests/transcript-page.test.ts`

Today `SubagentWatcher.getHistory` reads *every* `agent-*.jsonl` in the dir. A page must include subagent events only for `Agent` tool_uses that fall inside it (spec §2.2). The existing `getHistory(index)` already binds via a `SubagentIndex` primed with parent tool_uses — the page reader primes that index with only the in-page `Agent` tool_uses, then reuses `getHistory`, which naturally skips agents whose parent isn't in the index (`bindSubagent` returns null → `continue`).

- [ ] **Step 1: Write the failing test**

Add to `desktop/tests/transcript-page.test.ts`. Build a transcript where turn 40 (in-page) and turn 5 (out-of-page) each contain an `Agent` tool_use, with matching `agent-<id>.jsonl` + `.meta.json` files, and assert the page carries the in-page subagent's events and not the out-of-page one. (Follow the fixture shape in `desktop/tests/subagent-watcher.test.ts` for the `agent-*.jsonl` + meta files.)

```ts
  it('includes subagent events only for Agent tool_uses inside the page', async () => {
    // See tests/subagent-watcher.test.ts for the agent-*.jsonl + meta shape.
    // Build: PAGE_TURNS+20 turns; turn 45 has an Agent tool_use (in the last
    // PAGE_TURNS), turn 3 has one (out of page). Write both agent files.
    // Assert page.events has a subagent-stamped event for agent-45 and none
    // for agent-3.
    // (Full fixture body written by the implementer against the real shapes.)
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page.test.ts -t "subagent events only"`
Expected: FAIL — the page has no subagent events at all yet.

- [ ] **Step 3: Implement**

In `subagent-watcher.ts`, extract the per-file read loop of `getHistory(index)` so it can be called with a pre-primed index and a `subagentsDir` (it already takes the index). Confirm `getHistory` already `continue`s when `bindSubagent` returns null (it does — line ~110). In `transcript-page.ts`, after parsing the page's events, build a throwaway `SubagentIndex`, record every in-page `Agent` `tool-use`, construct a `SubagentWatcher` pointed at `path.dirname(jsonlPath)/<claudeSessionId>/subagents`, and append `watcher.getHistory(index)`:

```ts
// inside readTranscriptPage, after the forward-parse loop, before `return`:
// Subagent files: only for Agent tool_uses that landed inside this page.
import { SubagentIndex } from './subagent-index';
import { SubagentWatcher } from './subagent-watcher';
// ...
const replayIndex = new SubagentIndex();
for (const ev of events) {
  if (ev.type === 'tool-use' && ev.data.toolName === 'Agent') {
    replayIndex.recordParentAgentToolUse(
      ev.data.toolUseId!,
      (ev.data.toolInput?.description as string) || '',
      (ev.data.toolInput?.subagent_type as string) || '',
    );
  }
}
if (subagentsDir) {
  const sw = new SubagentWatcher({ sessionId, subagentsDir, index: replayIndex, emit: () => {} });
  for (const ev of sw.getHistory(replayIndex)) events.push(ev);
}
```

Thread `subagentsDir` into `PageArgs` (the caller in Task 5 passes `path.join(path.dirname(jsonlPath), claudeSessionId, 'subagents')`, matching `transcript-watcher.ts:379`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/transcript-page.ts desktop/src/main/subagent-watcher.ts desktop/tests/transcript-page.test.ts
git commit -m "feat(history): page carries subagent events only for in-page Agent tool_uses (Task 3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 4: Live tailer starts at end-of-file on resume (no double delivery)

**Files:**
- Modify: `desktop/src/main/transcript-watcher.ts`
- Modify: `desktop/tests/transcript-watcher.test.ts`

Today `startWatching` sets `offset: 0` (line ~390), so a resumed session re-reads the whole file through the live path — the documented double-delivery (spec review, verified). Change it to start at the current file size for a pre-existing file, and expose that start offset so the first page request can use it as its end boundary. Overlap is then structurally impossible: page = `[boundary, startOffset)`, live = `[startOffset, ∞)`.

- [ ] **Step 1: Write the failing test**

In `desktop/tests/transcript-watcher.test.ts`, add a test that: writes a transcript with 3 turns, calls `startWatching`, and asserts NO `transcript-event` fires for the pre-existing content (only appends after `startWatching` fire), and that `getStartOffset(sessionId)` equals the file size at watch start.

```ts
  it('startWatching on an existing file starts at EOF and emits nothing for old content', async () => {
    fs.writeFileSync(jsonlPath, makeLine('old-1') + '\n' + makeLine('old-2') + '\n');
    const startSize = fs.statSync(jsonlPath).size;
    const events: any[] = [];
    watcher.on('transcript-event', (e) => events.push(e));
    watcher.startWatching('desk-1', 'cc-1', tmpDir, jsonlPath);
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toHaveLength(0); // old content is the page reader's job, not the tailer's
    expect(watcher.getStartOffset('desk-1')).toBe(startSize);
    // A NEW append still streams live.
    fs.appendFileSync(jsonlPath, makeLine('new-1') + '\n');
    await new Promise((r) => setTimeout(r, 200));
    expect(events.some((e) => e.type === 'user-message')).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-watcher.test.ts -t "starts at EOF"`
Expected: FAIL — old content emits (offset 0) and `getStartOffset` doesn't exist.

- [ ] **Step 3: Implement**

In `startWatching` (`transcript-watcher.ts`), replace `offset: 0` in the `WatchedSession` literal with a computed start size, and store it:

```ts
    // Perf (cycle 2): start at END of an existing file. History is delivered by
    // the page reader (transcript-page.ts); the tailer only carries genuinely
    // new lines. This removes the double-delivery that re-read the whole file
    // on every resume (docs/artifacts.md:10). A fresh session's file does not
    // exist yet → 0, unchanged.
    let startOffset = 0;
    try { startOffset = fs.statSync(jsonlPath).size; } catch { startOffset = 0; }
    const session: WatchedSession = {
      // ...
      offset: startOffset,
      startOffset, // NEW field on WatchedSession
      // ...
    };
```

Add `startOffset: number;` to the `WatchedSession` interface and a public accessor:

```ts
  /** The byte offset the live tailer started at for this session — the END
   *  boundary the first history page reads up to, so page and live never
   *  overlap. */
  getStartOffset(desktopSessionId: string): number {
    return this.sessions.get(desktopSessionId)?.startOffset ?? 0;
  }
```

Note: the shrink-reset logic in `readNewLinesOnce` already handles `/clear` correctly (it resets `offset` to 0 on shrink); leave it. `startOffset` is only read once, for the first page's boundary.

- [ ] **Step 4: Run to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-watcher.test.ts`
Expected: PASS. Watch for other tests in that file that assumed offset-0 replay on start — if any break, they were asserting the double-delivery behaviour; update them to the new contract (history comes from the page reader) and note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/transcript-watcher.ts desktop/tests/transcript-watcher.test.ts
git commit -m "feat(history): live tailer starts at EOF on resume; expose the start offset (Task 4)

Removes the whole-file re-read through the live path on every resume — the
first history page now supplies history and the tailer only carries new lines.
getStartOffset() is the page's end boundary, so page and live never overlap.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 5: IPC channel `transcript:page` (main handler + preload + native)

**Files:**
- Modify: `desktop/src/shared/types.ts`, `desktop/src/main/preload.ts`, `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/main/harness/session-store.ts` (native tail-page reader)
- Create: `desktop/tests/transcript-page-channel-parity.test.ts`

`transcript:page` is request/response (`ipcMain.handle`), unlike the fire-and-forget `transcript:replay-from-start`. Native sessions read from `SessionStore` (its `readEvents` reads all lines — add a `readEventsPage` that applies the same last-N-turns window over the parsed lines; native files are ≤3 MB so a parse-then-window is acceptable this cycle, matching the spec's "native grows the same tail-page reader" at a lower priority).

- [ ] **Step 1: Add the channel const and types**

In `desktop/src/shared/types.ts`: next to `TRANSCRIPT_REPLAY`, add `TRANSCRIPT_PAGE: 'transcript:page',` (in BOTH the `IPC` const object here and in `preload.ts`'s copy — they are asserted equal by `ipc-channels.test.ts`). Export:

```ts
export interface TranscriptPageRequest { sessionId: string; beforeCursor: PageCursor | null; }
```
and re-export `PageCursor` / `TranscriptPageResult` from `transcript-page.ts` (or duplicate the `PageCursor` shape here and import in the reader — keep ONE definition; put it in `shared/types.ts` and import it into `transcript-page.ts`).

- [ ] **Step 2: Write the failing parity test**

Create `desktop/tests/transcript-page-channel-parity.test.ts` mirroring the per-channel blocks in `ipc-channels.test.ts` (the report showed the shape). Assert `'transcript:page'` appears in `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, and (single-quoted TS / not required for Android this cycle — Android on-device paging is a later cycle, so assert its ABSENCE is intentional with a comment, OR skip the Kotlin surface). Since Android on-device is out of scope (decision 1a), the parity block covers the three desktop/remote TS surfaces only, and documents that Android intentionally lacks it:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
describe('transcript:page channel parity (desktop + remote; Android is a later cycle)', () => {
  const CHANNEL = 'transcript:page';
  it('declared in shared/types.ts and preload.ts', () => {
    expect(read('src/shared/types.ts')).toContain(`'${CHANNEL}'`);
    expect(read('src/main/preload.ts')).toContain(`'${CHANNEL}'`);
  });
  it('handled in ipc-handlers.ts', () => { expect(read('src/main/ipc-handlers.ts')).toContain(CHANNEL); });
  it('sent by remote-shim.ts (real call, not a stub)', () => {
    const shim = read('src/renderer/remote-shim.ts');
    expect(shim).toContain(CHANNEL);
    expect(shim).not.toMatch(/requestTranscriptPage:\s*\([^)]*\)\s*=>\s*\{\s*\}/); // not a no-op stub
  });
  it('answered by a remote-server.ts WS case', () => { expect(read('src/main/remote-server.ts')).toContain(CHANNEL); });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page-channel-parity.test.ts`
Expected: FAIL on every surface.

- [ ] **Step 4: Implement the main handler + preload + native reader**

Native tail-page reader — in `desktop/src/main/harness/session-store.ts`, add:

```ts
  /** The last <=PAGE_TURNS turns of a native session, windowed over the parsed
   *  lines. Native files are small (<=3 MB) so a parse-then-slice is fine this
   *  cycle; a true byte-tail reader is a later optimisation. Returns the same
   *  shape as the CC page reader. */
  readEventsPage(sessionId: string, cwd: string, beforeIndex: number | null): {
    events: TranscriptEvent[]; nextIndex: number | null; hasMore: boolean;
  } {
    const all = this.readEvents(sessionId, cwd); // existing full read + dedup
    const end = beforeIndex == null ? all.length : Math.min(beforeIndex, all.length);
    // Count PAGE_TURNS user-message boundaries backward from `end`.
    let boundaries = 0, start = 0;
    for (let i = end - 1; i >= 0; i--) {
      if (all[i].type === 'user-message') { boundaries++; if (boundaries === PAGE_TURNS) { start = i; break; } }
    }
    const events = all.slice(start, end);
    const hasMore = start > 0;
    return { events, nextIndex: hasMore ? start : null, hasMore };
  }
```

(For native, the cursor's `offset` field carries the array index; the renderer treats it opaquely, so this is fine.)

In `ipc-handlers.ts`, add near the `TRANSCRIPT_REPLAY` handler:

```ts
  ipcMain.handle(IPC.TRANSCRIPT_PAGE, async (_evt, req: TranscriptPageRequest): Promise<TranscriptPageResult> => {
    const { sessionId, beforeCursor } = req;
    // Native sessions: window over SessionStore lines. getHistory returns null
    // for non-live/non-native ids, so a native id is detected the same way the
    // replay handler detects it.
    const nativeCwd = nativeHost.cwdForLiveSession?.(sessionId);
    if (nativeCwd != null) {
      const beforeIndex = beforeCursor ? beforeCursor.offset : null; // offset = array index for native
      const p = nativeHost.readEventsPageFor(sessionId, beforeIndex); // thin wrapper over store.readEventsPage
      return {
        events: p.events,
        cursor: p.hasMore ? { path: `native:${sessionId}`, offset: p.nextIndex!, sizeAtRead: 0 } : null,
        hasMore: p.hasMore,
      };
    }
    // CC: read from the transcript file. The first page's END boundary is the
    // tailer's start offset so page and live never overlap.
    const jsonlPath = transcriptWatcher.jsonlPathFor(sessionId); // add a tiny accessor
    if (!jsonlPath) return { events: [], cursor: null, hasMore: false };
    const endOffset = beforeCursor ? beforeCursor.offset : transcriptWatcher.getStartOffset(sessionId) || null;
    const claudeSessionId = transcriptWatcher.claudeSessionIdFor(sessionId); // accessor
    const subagentsDir = claudeSessionId
      ? require('node:path').join(require('node:path').dirname(jsonlPath), claudeSessionId, 'subagents')
      : undefined;
    return readTranscriptPage({ jsonlPath, sessionId, endOffset, subagentsDir });
  });
```

Add the small accessors `jsonlPathFor` / `claudeSessionIdFor` to `TranscriptWatcher` (both read `this.sessions.get(id)`). Add `cwdForLiveSession` / `readEventsPageFor` to `NativeSessionHost` (thin wrappers over the live entry + `store.readEventsPage`).

In `preload.ts`, add to the `detach` (or `session`) block:

```ts
    requestTranscriptPage: (req: { sessionId: string; beforeCursor: unknown }) =>
      ipcRenderer.invoke(IPC.TRANSCRIPT_PAGE, req),
```

- [ ] **Step 5: Run to verify parity passes + tsc**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-page-channel-parity.test.ts && npx tsc --noEmit`
Expected: the remote-shim and remote-server assertions still fail (done in Task 6); the preload/handler/types assertions pass; tsc clean. Split the parity test so Task 5 covers preload+handler and Task 6 covers the remote surfaces, OR mark the two remote `it`s `.todo` here and un-todo them in Task 6.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/main/harness/session-store.ts desktop/src/main/harness/native-session-host.ts desktop/src/main/transcript-watcher.ts desktop/tests/transcript-page-channel-parity.test.ts
git commit -m "feat(history): transcript:page IPC handler + preload + native page reader (Task 5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 6: Remote surfaces (`remote-server` WS case + `remote-shim`)

**Files:**
- Modify: `desktop/src/main/remote-server.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/renderer/hooks/useIpc.ts`
- Modify: `desktop/tests/transcript-page-channel-parity.test.ts` (un-todo the two remote `it`s)

The phone hydrates via `chat:hydrate` on connect (unchanged); scrolling up sends `transcript:page` over the WS. `remote-shim.requestTranscriptPage` is a REAL call (the report flagged `requestTranscriptReplay` being a no-op stub as a correctness issue — do not repeat it).

- [ ] **Step 1: Un-todo the remote parity assertions** (they currently fail).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/transcript-page-channel-parity.test.ts`.

- [ ] **Step 3: Implement**

`remote-server.ts` — add a case mirroring `session:history` (validate `sessionId` with `SAFE_ID_RE`, resolve the jsonl path, call `readTranscriptPage`, `this.respond(...)`):

```ts
      case 'transcript:page': {
        const { sessionId: sid, beforeCursor } = payload;
        if (typeof sid !== 'string' || !SAFE_ID_RE.test(sid)) { this.respond(client.ws, type, id, { events: [], cursor: null, hasMore: false }); break; }
        // Resolve the same way session:history does, then page.
        const result = await this.pageTranscript(sid, beforeCursor ?? null); // small private helper reusing readTranscriptPage
        this.respond(client.ws, type, id, result);
        break;
      }
```

`remote-shim.ts` — add next to `loadHistory`:

```ts
      requestTranscriptPage: (req: { sessionId: string; beforeCursor?: unknown }) =>
        invoke('transcript:page', { sessionId: req.sessionId, beforeCursor: req.beforeCursor ?? null }),
```

`useIpc.ts` — add `requestTranscriptPage: (req: { sessionId: string; beforeCursor: unknown }) => Promise<import('../../shared/types').TranscriptPageResult>;` to the typed surface (both the `detach`/`session` block where preload put it).

- [ ] **Step 4: Run to verify** — `npx vitest run tests/transcript-page-channel-parity.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/remote-server.ts desktop/src/renderer/remote-shim.ts desktop/src/renderer/hooks/useIpc.ts desktop/tests/transcript-page-channel-parity.test.ts
git commit -m "feat(history): transcript:page over the remote bridge (WS case + real shim call) (Task 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 7: Reducer — `history` state + `HISTORY_PAGE_*` actions

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts`, `desktop/src/renderer/state/chat-reducer.ts`
- Create: `desktop/tests/history-paging-reducer.test.ts`

Add `history: { cursor: PageCursor | null; hasMore: boolean; loading: boolean }` to `SessionChatState`, with serializer round-trip and a `?? default`. `HISTORY_PAGE_REQUESTED` sets `loading:true`. `HISTORY_PAGE_LOADED` runs the page's events through the existing per-event handlers on a scratch session state, then **prepends** the resulting timeline and unions the maps, and updates `history`. `HISTORY_PAGE_FAILED` clears `loading`. Ids stay counter-based (prepend cannot collide — counters only grow). Retire `HISTORY_LOADED`.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/history-paging-reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chatReducer } from '../src/renderer/state/chat-reducer';
import { createSessionChatState } from '../src/renderer/state/chat-types';
import type { ChatState } from '../src/renderer/state/chat-types';

function withSession(id: string): ChatState {
  const m: ChatState = new Map();
  m.set(id, createSessionChatState());
  return m;
}
// A page as the main handler would return it: parsed TranscriptEvents.
function userEvent(sid: string, uuid: string, text: string) {
  return { type: 'user-message', sessionId: sid, uuid, timestamp: 1, data: { text } };
}
function asstEvent(sid: string, uuid: string, text: string) {
  return { type: 'assistant-text', sessionId: sid, uuid, timestamp: 2, data: { text } };
}

describe('history paging reducer', () => {
  it('createSessionChatState seeds an empty history block', () => {
    const s = createSessionChatState();
    expect(s.history).toEqual({ cursor: null, hasMore: false, loading: false });
  });

  it('HISTORY_PAGE_REQUESTED sets loading', () => {
    const next = chatReducer(withSession('s'), { type: 'HISTORY_PAGE_REQUESTED', sessionId: 's' });
    expect(next.get('s')!.history.loading).toBe(true);
  });

  it('a first page builds the timeline and records the cursor', () => {
    let st = withSession('s');
    st = chatReducer(st, { type: 'HISTORY_PAGE_REQUESTED', sessionId: 's' });
    st = chatReducer(st, {
      type: 'HISTORY_PAGE_LOADED', sessionId: 's',
      events: [userEvent('s','u1','hello'), asstEvent('s','a1','hi')] as any,
      cursor: { path: 'p', offset: 100, sizeAtRead: 500 }, hasMore: true,
    });
    const sess = st.get('s')!;
    expect(sess.timeline.filter((e) => e.kind === 'user')).toHaveLength(1);
    expect(sess.history).toEqual({ cursor: { path: 'p', offset: 100, sizeAtRead: 500 }, hasMore: true, loading: false });
  });

  it('a second (older) page PREPENDS before the first', () => {
    let st = withSession('s');
    st = chatReducer(st, { type: 'HISTORY_PAGE_LOADED', sessionId: 's',
      events: [userEvent('s','u2','newer')] as any, cursor: { path:'p', offset: 50, sizeAtRead: 500 }, hasMore: true });
    st = chatReducer(st, { type: 'HISTORY_PAGE_LOADED', sessionId: 's',
      events: [userEvent('s','u1','older')] as any, cursor: { path:'p', offset: 0, sizeAtRead: 500 }, hasMore: false });
    const users = st.get('s')!.timeline.filter((e) => e.kind === 'user') as any[];
    expect(users.map((u) => u.message.content)).toEqual(['older', 'newer']);
    expect(st.get('s')!.history.hasMore).toBe(false);
  });

  it('HISTORY_PAGE_FAILED clears loading and keeps the cursor', () => {
    let st = withSession('s');
    st = chatReducer(st, { type: 'HISTORY_PAGE_REQUESTED', sessionId: 's' });
    st = chatReducer(st, { type: 'HISTORY_PAGE_FAILED', sessionId: 's' });
    expect(st.get('s')!.history.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/history-paging-reducer.test.ts` → FAIL (`history` undefined, actions unknown).

- [ ] **Step 3: Implement**

`chat-types.ts`: import `PageCursor`; add to `SessionChatState`:
```ts
  /** Cycle 2 paged history. `cursor` is the opaque handle for the NEXT (older)
   *  page; `hasMore` false = beginning of conversation reached; `loading`
   *  guards against overlapping fetches. */
  history: { cursor: PageCursor | null; hasMore: boolean; loading: boolean };
```
Seed it in `createSessionChatState` (`history: { cursor: null, hasMore: false, loading: false }`), serialize it in `serializeChatState`, and default it in `deserializeChatState` (`history: ser.history ?? { cursor: null, hasMore: false, loading: false }`). Add the three actions to `ChatAction`; DELETE the `HISTORY_LOADED` action.

`chat-reducer.ts`: DELETE the `HISTORY_LOADED` case. Add:
```ts
    case 'HISTORY_PAGE_REQUESTED': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      next.set(action.sessionId, { ...session, history: { ...session.history, loading: true } });
      return next;
    }
    case 'HISTORY_PAGE_FAILED': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      next.set(action.sessionId, { ...session, history: { ...session.history, loading: false } });
      return next;
    }
    case 'HISTORY_PAGE_LOADED': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      // Build the page's own timeline on a SCRATCH state by replaying its
      // events through the very same per-event handlers the live path uses, so
      // a paged card is byte-for-byte a live card. Then prepend.
      let scratch: ChatState = new Map();
      scratch.set(action.sessionId, createSessionChatState());
      for (const ev of action.events) {
        scratch = applyTranscriptEvent(scratch, action.sessionId, ev); // see below
      }
      const pageSess = scratch.get(action.sessionId)!;
      next.set(action.sessionId, {
        ...session,
        timeline: [...pageSess.timeline, ...session.timeline],
        toolCalls: new Map([...pageSess.toolCalls, ...session.toolCalls]),
        toolGroups: new Map([...pageSess.toolGroups, ...session.toolGroups]),
        assistantTurns: new Map([...pageSess.assistantTurns, ...session.assistantTurns]),
        seenUuids: new Set([...session.seenUuids, ...pageSess.seenUuids]),
        history: { cursor: action.cursor, hasMore: action.hasMore, loading: false },
      });
      return next;
    }
```
`applyTranscriptEvent(state, sessionId, ev)` is a helper that maps ONE `TranscriptEvent` to the existing action and runs `chatReducer` — factor it out of App.tsx's event→action `switch` (lines ~1140-1210) so the reducer and App share one mapping. If factoring is too invasive for this task, inline a minimal mapper covering the event types a page can contain (`user-message`, `assistant-text`, `assistant-thinking`, `tool-use`, `tool-result`, `turn-complete`, `skill-invoked`, `compact-summary`, `context-clear`, `user-interrupt`) — the SAME cases App's switch already has.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/history-paging-reducer.test.ts` → PASS (5 tests). Then run the existing reducer suite to catch `HISTORY_LOADED` removal fallout: `npx vitest run tests/transcript-reducer.test.ts src/renderer/state/__tests__/chat-reducer.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/chat-types.ts desktop/src/renderer/state/chat-reducer.ts desktop/tests/history-paging-reducer.test.ts
git commit -m "feat(history): history state + HISTORY_PAGE_* reducer actions; retire HISTORY_LOADED (Task 7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 8: App.tsx wiring — first page replaces first-load replay; retire resumeInfo

**Files:**
- Modify: `desktop/src/renderer/App.tsx`, `desktop/src/renderer/state/pty-input-gate.ts`

Replace the four first-load `requestTranscriptReplay` call sites (mount loop `~1715`, native resume `~2425`, CC resume `~2456`, and the CC-resume `loadHistory(…,10)`/`HISTORY_LOADED` block `~2455-2470`) with a first-page request: `dispatch(HISTORY_PAGE_REQUESTED)` then `await requestTranscriptPage({sessionId, beforeCursor:null})` → `dispatch(HISTORY_PAGE_LOADED …)`. **Keep** `requestTranscriptReplay` for the ownership-handoff path at `~1787` ONLY IF it still needs the broker-ask / specialist-run re-send (Task 8b) — otherwise convert it too. Retire the `resumeInfo` state and its prop.

- [ ] **Step 1** (test-first via the rig + an App smoke test): Add a factored `applyTranscriptEvent` export (from Task 7) and a small unit test that a `HISTORY_PAGE_LOADED` dispatched from a helper produces a non-empty timeline — already covered by Task 7. For App.tsx wiring, the guard is the integration behaviour measured by the rig (Task 11) plus tsc; there is no cheap unit test for App's effects, so this task's verification is `tsc` + `verify.sh` + the rig.

- [ ] **Step 2: Implement the first-page helper** in App.tsx (near the transcript listener):

```ts
// Cycle 2: load a session's most recent page. Replaces requestTranscriptReplay
// for first load — the live tailer (started at EOF) carries new events, the
// page carries history, and there is no overlap to dedupe.
const loadFirstPage = useCallback(async (sid: string) => {
  dispatch({ type: 'HISTORY_PAGE_REQUESTED', sessionId: sid });
  try {
    const page = await (window as any).claude?.detach?.requestTranscriptPage?.({ sessionId: sid, beforeCursor: null });
    if (page) dispatch({ type: 'HISTORY_PAGE_LOADED', sessionId: sid, events: page.events, cursor: page.cursor, hasMore: page.hasMore });
    else dispatch({ type: 'HISTORY_PAGE_FAILED', sessionId: sid });
  } catch { dispatch({ type: 'HISTORY_PAGE_FAILED', sessionId: sid }); }
}, [dispatch]);
```
Replace the mount loop `requestTranscriptReplay(s.id)` with `loadFirstPage(s.id)`; the native-resume and CC-resume `requestTranscriptReplay(...)` with `loadFirstPage(...)`; DELETE the CC-resume `loadHistory(…,10)` + `HISTORY_LOADED` block and the `setResumeInfo(...)` call; DELETE the `resumeInfo` state and the `resumeInfo={resumeInfo}` prop on `<ChatView>`.

- [ ] **Step 2b (ownership handoff)**: The `TRANSCRIPT_REPLAY` handler also re-sends broker-held permission asks and specialist run records for NATIVE sessions (verified: `ipc-handlers.ts:2578,2596`). Those must survive. Options: (a) keep `requestTranscriptReplay` for the handoff path only, so a re-docked native session still gets its asks/runs; OR (b) add the ask/run re-send into the `transcript:page` first-page response. Choose (a) this cycle — smaller — and leave a WHY comment that the handoff path is the last remaining `requestTranscriptReplay` caller and why.

- [ ] **Step 3: Re-key the input gate** — `pty-input-gate.ts`: the `HISTORY_EXPAND_PROMPT_ID` special-case in `hasPendingInteraction` becomes dead once the expand button is gone (Task 9). Leave the skip in place (harmless) but add a comment that the id is retired; OR remove the id and its import once Task 9 deletes the button. Verify nothing else keys on `HISTORY_LOADED` (report flagged `pty-input-gate.ts:37`): it keys on the `_history_expand` timeline entry, which the new path never creates, so the gate is simply never tripped by history now — correct behaviour.

- [ ] **Step 4: Verify** — `cd youcoded/desktop && npx tsc --noEmit`. Expected: errors only where `resumeInfo` / `HISTORY_LOADED` are still referenced; fix each. Then `npx vitest run` for any App-touching suite.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/App.tsx desktop/src/renderer/state/pty-input-gate.ts
git commit -m "feat(history): App requests the first page on load/resume; retire resumeInfo + HISTORY_LOADED path (Task 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 9: ChatView — top sentinel + scroll anchoring; delete HistoryExpandButton

**Files:**
- Modify: `desktop/src/renderer/components/ChatView.tsx`
- Create: `desktop/tests/chatview-history-sentinel.test.tsx`

A `h-px` sentinel as the first child of `contentRef`, observed by an `IntersectionObserver` rooted on `.chat-scroll` with `rootMargin: '400px 0px'` (the exact pattern `ResumeBrowser.tsx:525-538` uses). When it intersects and `history.hasMore && !history.loading`, dispatch `HISTORY_PAGE_REQUESTED` and call the page loader. On prepend, preserve scroll position: capture `scrollHeight` before the commit and restore `scrollTop += (newHeight - oldHeight)` in a `useLayoutEffect` keyed on the prepended count. Delete `HistoryExpandButton` and its `HISTORY_EXPAND_PROMPT_ID` render branch. **Scroll feel is Destin's to eyeball — flag it, do not script it** (CLAUDE.md rule).

- [ ] **Step 1: Write the failing test** (jsdom, mirrors `chatview-empty-response-gate.test.tsx` scaffolding): mount `ChatView` with a session state whose `history.hasMore = true`, stub `IntersectionObserver` to fire immediately, and assert a `requestTranscriptPage` (mocked on `window.claude`) is called once. Also assert that when `history.hasMore = false` the sentinel is not rendered.

```tsx
// @vitest-environment jsdom
// scaffolding per chatview-empty-response-gate.test.tsx: mock chat-context,
// ArtifactContext, MarkdownContent; stub IntersectionObserver to fire on observe.
// Assert window.claude.detach.requestTranscriptPage called once when hasMore.
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/chatview-history-sentinel.test.tsx`.

- [ ] **Step 3: Implement** the sentinel, observer, page-loader call, scroll anchoring, and delete the button + its render branch (`ChatView.tsx:855-863` and the `HistoryExpandButton` component + its `resumeInfo` prop).

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/chatview-history-sentinel.test.tsx`.

- [ ] **Step 5: Commit**, and in the commit body write: "SCROLL ANCHORING NEEDS DESTIN'S EYES in a dev instance — flagged, not scripted (CLAUDE.md). Run `bash scripts/run-dev.sh worktrees/perf-lab --label 'Paged History'` and scroll up through a huge conversation; confirm no jump on prepend."

```bash
git add desktop/src/renderer/components/ChatView.tsx desktop/tests/chatview-history-sentinel.test.tsx
git commit -m "feat(history): ChatView top-sentinel auto-fetch + scroll anchoring; delete HistoryExpandButton (Task 9)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 10: Buddy window first-page request + docs

**Files:**
- Modify: `desktop/src/renderer/components/buddy/BubbleFeed.tsx`
- Modify: `.claude/rules/chat-reducer.md`

The buddy window runs its own `chatReducer` (verified: `BubbleFeed.tsx:265`). Its `requestTranscriptReplay(sessionId)` at `~285` must become the same first-page request, dispatched into the buddy's reducer.

- [ ] **Step 1**: no separate unit (the reducer path is covered by Task 7); verification is tsc + the buddy render path.
- [ ] **Step 2: Implement** — replace the buddy's `requestTranscriptReplay(sessionId)` with a `HISTORY_PAGE_REQUESTED` + `requestTranscriptPage` + `HISTORY_PAGE_LOADED` sequence dispatched via the buddy's `batchDispatch`/`dispatch`. (BubbleFeed does not have a scroll sentinel this cycle — the buddy window shows recent history only; add a ROADMAP note if scroll-up in the buddy is wanted later.)
- [ ] **Step 3: Update the rule** — `.claude/rules/chat-reducer.md`: add a line that `SessionChatState.history` holds the paging cursor, that `HISTORY_PAGE_LOADED` PREPENDS through the shared per-event handlers, and that paging never clears `toolCalls` (eviction, which would, is cycle 3 and will amend `toolcalls-never-cleared`).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`.
- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/buddy/BubbleFeed.tsx .claude/rules/chat-reducer.md
git commit -m "feat(history): buddy window requests the first page too; document history state (Task 10)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 11: Teach the rig about pages (so the gate stays honest)

**Files:**
- Modify: `scripts/perf-lab/scenario-workload.mjs`, `scenario-history.mjs`, `scenario-replay-stall.mjs`
- Modify: `scripts/perf-lab/tests/scenario-workload.test.mjs`, `scenario-history.test.mjs`, `scenario-replay-stall.test.mjs`, `run-report.test.mjs`

Without this, the workload settle rule pins every switch at its 20 s cap (a false regression) and the history clock silently accepts a first-page render as done (a false win). Add `PAGE_TURNS = 30` and `renderedEntries(turns, streamedTurns=0) = ENTRIES_PER_TURN × min(turns + streamedTurns, PAGE_TURNS)`; keep `expectedEntries` exported and unchanged (its tests pin the raw constant). Swap `renderedEntries` in at the workload settle call site. Give the history and stall watches the expectation they lack (`n >= renderedEntries(turns)`).

- [ ] **Step 1: Update the workload test first** — in `scripts/perf-lab/tests/scenario-workload.test.mjs`, add cases: `renderedEntries(50) === 100` (50 < 30? no — 50 turns clamps to 30 → 60), fix to reality: `renderedEntries(50) === ENTRIES_PER_TURN * 30` and `renderedEntries(10) === 20`. Keep the existing `expectedEntries(50)===100`, `expectedEntries(3500)===7000` cases.

- [ ] **Step 2: Run to verify it fails** — `cd scripts/perf-lab && node --test tests/scenario-workload.test.mjs`.

- [ ] **Step 3: Implement** in `scenario-workload.mjs` (beside `ENTRIES_PER_TURN`/`expectedEntries` at `:483-488`):

```js
/** Turns the app KEEPS RENDERED after a paged open (cycle 2). Kept in sync with
 *  transcript-page.ts PAGE_TURNS by the assertion in scenario-workload.test.mjs. */
export const PAGE_TURNS = 30;
/** Entries a paged resume actually renders: the last PAGE_TURNS turns, plus
 *  whatever streamed in since. Replaces expectedEntries at the settle call site
 *  now that the app no longer renders the whole transcript. */
export function renderedEntries(turns, streamedTurns = 0) {
  return ENTRIES_PER_TURN * (Math.min(turns, PAGE_TURNS) + streamedTurns);
}
```
At the call site (`:883-886`) swap `expectedEntries(t.turns, …)` → `renderedEntries(t.turns, streamer.state.turnsBySize[size] ?? 0)`. (Streamed turns are all in-page — they are the newest — so they are NOT clamped; only the resumed base is.)

In `scenario-history.mjs`, pass `renderedEntries(t.turns)` (import it from workload, or duplicate the tiny function) into the resume watch and require `n >= expected` alongside the 1 s stability rule (`:331`). In `scenario-replay-stall.mjs`, add the same `n >= renderedEntries(t.turns)` requirement to the stability loop at `:443` (its `expectedEntries` context at `:550` becomes `renderedEntries`).

- [ ] **Step 4: Run to verify** — `cd scripts/perf-lab && node --test tests/*.test.mjs`. Update `run-report.test.mjs` fixtures (`:100-112` hardcode 7000/5000/100) to the paged expectations (`min(turns,30)*2`), and `scenario-history.test.mjs:85` (the size-mismatch test still uses `loadHistory(all)` — that IPC is unchanged, so it stays 2×turns; the DOM expectation is what changed). Expected: all rig tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev
git add scripts/perf-lab/scenario-workload.mjs scripts/perf-lab/scenario-history.mjs scripts/perf-lab/scenario-replay-stall.mjs scripts/perf-lab/tests/
git commit -m "perf-lab: teach history/workload/stall settle rules about paged rendering (Task 11)

PAGE_TURNS + renderedEntries(turns)=ENTRIES_PER_TURN*min(turns,PAGE_TURNS).
Without this the workload pins every switch at its 20s cap (false regression)
and the history clock accepts a first-page render as done (false win). Baselines
before this change stop being comparable for resume/switch metrics — re-baseline.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016B1AweDaR2e32sVV1Xxged"
```

---

## Task 12: Full verify, re-baseline, measure, gate

**Files:** none (measurement + report).

- [ ] **Step 1: Green the whole checkout** — `bash scripts/verify.sh worktrees/perf-lab` → all five checks PASS. Fix any knip (dead `HISTORY_LOADED`, `HistoryExpandButton`, `resumeInfo` leftovers) / eslint / ast-grep findings.

- [ ] **Step 2: Fresh baseline on the paged rig against UNCHANGED app code is impossible** (the app and rig changed together). Instead, the A/B is: **before** = master `97600ddd` measured with the NEW rig would fail (old app renders all entries → never reaches `renderedEntries`? no — old app renders MORE than renderedEntries, and the settle rule is `n >= expected`, which an all-entries render satisfies immediately then keeps growing). Resolve this in the plan-executor's judgement: the honest comparison is **master app + old rig** (the cycle-1 baseline `2026-08-27-2330`) for the user-facing `resumeStableMs`/`switchPaintedBySize` numbers, versus **paged app + new rig**. Because the rig's settle definition changed, annotate the compare output that these metrics had a definitional change (like the 25k→3.5k turn recalibration) — the KEEP decision rests on the absolute `resumeStableMs` for huge dropping from ~21 s toward the first-page render time, which is directly meaningful regardless of the settle-rule change.

Run, detached (harness gotcha — never `run_in_background` the rig; see the cycle-1 handoff §4):
```bash
setsid nohup bash -c "node scripts/perf-lab/run.mjs --label cycle2-paged > scratch/perf-lab/logs/cycle2-paged.console.log 2>&1; echo EXIT \$? >> scratch/perf-lab/logs/cycle2-paged.console.log" >/dev/null 2>&1 </dev/null &
```
Watch with `Monitor` for `^EXIT `.

- [ ] **Step 3: Gate** — `node scripts/perf-lab/compare.mjs perf-reports/2026-08-27-2330-16ea12e-cycle1-baseline.json perf-reports/<cycle2-paged>.json --target history.huge.median.resumeStableMs`. KEEP requires `history.huge.median.resumeStableMs` and `history.medium.median.resumeStableMs` to drop far beyond spread, `switchPaintedBySize.huge.medianMs` to drop (or at least not rise), and no PRIMARY regression beyond spread. This cycle the rig CAN see the change (unlike cycle 1), so a REJECT would be real.

- [ ] **Step 4: Eyeball** — flag Destin to run `bash scripts/run-dev.sh worktrees/perf-lab --label "Paged History"`, open a huge conversation, and (a) confirm it opens near-instantly, (b) scroll up and confirm older messages stream in holding scroll position with no jump. His feel is the final gate on scroll anchoring.

- [ ] **Step 5: On KEEP** — ask Destin before pushing / opening the PR (standing rule). PR from `perf/paged-history` → `youcoded` master with both report stems + the compare output. Then archive the spec + this plan to `docs/archive/`, flip the ROADMAP paged-history item to `[x]`, update `now.md`, and note the deferred items (eviction → cycle 3; Android on-device paging; the §4 smaller readers) stay open.

---

## Self-review notes (for the executor)

- **Spec coverage:** §2.2 main reader (T1–T3), resume/tailer (T4), IPC three-surface minus Android (T5–T6), reducer prepend + state (T7), the five renderer load paths + input gate + retire HISTORY_LOADED/resumeInfo (T8), sentinel + anchoring (T9), buddy + rule doc (T10), rig (T11), verify/measure/gate (T12). **Deferred by decision:** eviction (§2.2 eviction block), Android on-device (§2.2 Android), §3 Android store, §4 smaller readers — all remain ROADMAP items, NOT this plan.
- **The one soft spot** is T12 Step 2's baseline comparability — called out honestly rather than papered over, exactly as the rig sweep warned. The absolute `resumeStableMs` for huge is the meaningful number and does not depend on the settle-rule change.
- **Idempotency** rests on cursor discipline (one in-flight page per session via `history.loading`, monotonic cursor), NOT on uuid ids — the report confirmed ids are global counters and prepend cannot collide.
- **No overlap to dedupe:** T4 makes the tailer start at EOF and T5 makes the first page end there.

---

## Results (2026-08-28)

**Built:** Tasks 1–11 complete on `perf/paged-history` (worktree `worktrees/perf-lab/`),
tip `984b11af`. `bash scripts/verify.sh worktrees/perf-lab` passes all five checks. Full
desktop suite: 6,613 pass / 2 fail — both `xterm-webgl-mipmap-patch.test.ts`, which fails
identically on untouched master (`node_modules` predates PR #333's postinstall patch;
verified by grepping both checkouts). Not related to this work.

### Three defects the rig found that 6,600 passing tests did not

All three are the SAME shape: a feature had come to depend on the whole-file replay as a
side effect, and paging removed it. This is the cost of the change nobody could have
predicted from the code alone, and it is the entire justification for measuring.

1. **History was requested from three call sites, not from "a session appeared."**
   (`9fa2c0fa`) The rig resumes with a direct `window.claude.session.create`, bypassing
   App's resume handler — nothing asked for a page, so every history repeat sat at its
   240 s timeout with an empty timeline. Real fragility: any entry point other than the
   three (a session adopted from the directory, one created through the session API)
   rendered EMPTY. Now a session-list effect covers every route, guarded by
   `firstPageAsked`, with a 3×400 ms retry for the window before CC's hook reports the
   transcript path.
2. **The session Files drawer showed a stale list.** (`e7bea8c0`) Its list was loaded once
   by ChatView at mount and then refreshed only because the artifact tool-use tracker
   listens to transcript events — so re-streaming history happened to re-list the files.
   The drawer now lists its own session on open, against the RESOLVED `projectRoot`.
   Deliberately NOT routed through the tool-use tracker: that appends a version per tool
   call and would re-append every historical version (the 2026-08-15 OOM incident).
3. **A page re-rendered what was already on screen.** (`984b11af`) `HISTORY_PAGE_LOADED`
   replays onto a scratch state; the scratch started with an EMPTY `seenUuids`, so the
   uuid dedup the per-event handlers already carry never fired, and a just-sent prompt
   came back from the transcript as a second identical bubble. Caught by the `native-chat`
   screenshot at 14.04% DIFF; 0.2% after the fix. Seeding the scratch with the live
   session's `seenUuids` reuses the existing dedup instead of adding a second one.

### Measurement

`perf-reports/2026-08-28-0325-984b11a-cycle2-paged.json` vs baseline
`perf-reports/2026-08-28-0001-047da49-cycle1-n1n2n3.json` (shipped cycle-1 code).

| metric | before | after |
|---|---|---|
| `history.huge.median.resumeStableMs` | 21550 | **614** (−97.2%) |
| `history.medium.median.resumeStableMs` | 14049 | **644** (−95.4%) |
| `workload.median.switchP95Ms` | 10052 | **233** (−97.7%) |
| `workload.median.switchPaintedBySize.huge.medianMs` | 11112 | **194** (−98.3%) |
| `workload.median.probe.longtaskTotalMs` | 227376 | **4521** (−98%) |
| `workload.median.pssAfterMb` | 7004 | **1721** (−75.4%) |
| `replayStall.medium.median.ipcTotalStallMs` | 14491 | **0** (−100%) |
| `replayStall.huge.median.rendererLongtaskMaxMs` | 5366 | **155** (−97.1%) |

Reproduced across three consecutive full runs (huge resume 615 / 614 / 617 ms), 5/5
stabilized every time. `chat-medium`, `settings-open` and `six-sessions` screenshots are
byte-identical to the baseline.

`history.small.resumeStableMs` went 405 → 643 ms: a genuine ~240 ms cost, the IPC
round-trip a small conversation now pays where the tailer used to stream it. Not a PRIMARY
metric; sub-second either way.

### Gate verdict: REJECT — and every reason accounted for

`compare.mjs … --target history.huge.median.resumeStableMs` reports REJECT on four items.
None of them is the change being bad:

- **`workload.median.cpuDuringPct` +65.9%** — a RATE, not a total. `cpuWindowSeconds` fell
  195 → 40 for the same 40 `verifiedSwitches` (and `unsettledSwitches` 3 → 0). Total CPU
  work: **358 → 122 CPU-seconds, −66%**. The rig records both numbers, which is the only
  reason this was checkable rather than arguable. *Rig gap: `cpuDuringPct` is a PRIMARY
  metric that cannot be compared across runs of different duration — it should be a total,
  or paired with one, in the gate.*
- **`artifacts.median.ipcSumOfSteps.totalStallMs` 0 → 58 ms** — REAL and deliberate: the
  drawer's new list-on-open IPC (defect 2). Baseline's own runs were 0/0/70, so this metric
  is noisy, but the cost is real and is the price of the drawer showing correct data.
- **`screen welcome` 2.21%** — NOT this change: `79fe9f73 feat(ui): welcome screen gets the
  bare frame (P-6)` is on master but not in the baseline commit `047da49`. Verified by
  `git show 047da493:…App.tsx | grep -c chrome-glass--bare` → 0, HEAD → 2. The welcome shot
  is byte-stable across 5 master-era runs and byte-stable across 4 of this branch's runs —
  a deterministic difference owned by another PR.
- **`screen native-chat` 0.2%** — the known cycle-1 rig defect (photographs a real local
  model's non-deterministic reply). It was 14.04% before defect 3 was fixed.

### Open

- **Destin's eyeball on scroll feel is the final gate** and has NOT been done:
  `bash scripts/run-dev.sh worktrees/perf-lab --label "Paged History"` → open a huge
  conversation → scroll up → confirm no jump as older turns prepend.
- A master-baseline re-measurement with the CURRENT rig would remove the welcome-screen
  difference from the comparison and put both sides on identical footing. Offered, not yet
  run.
- Task 12 remains: PR (ask first), archive spec + plan, flip the ROADMAP item, update
  `now.md`. Deferred by decision: eviction → cycle 3; Android on-device paging; §4 smaller
  readers.
