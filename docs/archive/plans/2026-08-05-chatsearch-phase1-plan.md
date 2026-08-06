---
status: shipped
---

> **OUTCOME (2026-08-06):** All 7 tasks shipped. youcoded#282 (merge `2f8b5671`)
> and wecoded-marketplace#66, preceded by wecoded-marketplace#65 which absorbed
> a 152-entry index backlog so the feature PR stayed reviewable.
> Final: 386 test files / 4256 tests, 0 failures; `verify.sh` green.
>
> Corrections to this plan found during execution — the example code here was
> NOT pre-verified, and reviews found real bugs in it:
> - The expected ISO literal for epoch `1785990913428` is WRONG in Task 2
>   (correct: `2026-08-06T04:35:13.428Z`). Do not copy it forward.
> - Task 4's `refreshTurns` had a crash window between the turns write and the
>   state write that silently duplicated turns forever; shipped with a
>   `turnsBytes` self-heal.
> - Task 4's `acquireBuildLock` used `statSync` where the project requires
>   `lstatSync`, and its stale-lock takeover was a non-atomic
>   rm-then-mkdir race; shipped with an atomic rename claim.
> - The whole-branch review found a CRITICAL the per-task reviews could not:
>   the store's `list()` is already fail-soft, so an unreadable sync space
>   would overwrite a good index with zero conversations AND stamp a fresh
>   timestamp, suppressing the staleness banner.
> - Task 3's test fixture had an illegal unquoted object key (`9c14bbbb:`).
> - "three call sites" for the shared lane guards was an undercount; six.

# Chat Search (chatsearch) Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a token-efficient, read-only lexical search over every past YouCoded conversation, reachable from Claude Code and native harness sessions via a bundled-plugin CLI.

**Architecture:** The Electron main process builds two denormalized derived files per provider lane under `~/.youcoded/chatsearch/` — a metadata snapshot (`<provider>-meta.json`) and a user-turns index (`<provider>-turns.jsonl`). A thin Node CLI shipped in a bundled marketplace plugin reads those files directly (ripgrep + a flat map join) and never needs Conversation Store knowledge. Logic splits pure-core / IO-shell exactly like `conversations/`.

**Tech Stack:** TypeScript, Electron main process, Vitest, `@vscode/ripgrep` (already a dependency), plain JSONL (no SQLite, no embeddings, no native modules).

**Spec:** `docs/active/specs/2026-08-05-chat-search-design.md` — read the Corpus, Architecture, The index, and Concurrency and atomicity sections before Task 1.

## Global Constraints

- **Phase 1 is read-only.** No model calls, no Settings UI, no write path. The outbox is Phase 2; digests are Phase 3. Do not build them.
- **Name is `chatsearch`** everywhere: module `src/main/chatsearch-index/`, data dir `~/.youcoded/chatsearch/`, plugin id `youcoded-chatsearch`, CLI + skill `chatsearch`. Never `recall`, never `conversation-index` (that name belongs to the retired legacy index and still has live readers).
- **`~/.youcoded/` is multi-writer.** The live app and every `run-dev.sh` instance share it (`run-dev.sh` isolates only `userData` and ports). Every write goes through `NativeHome.mutateJson`, whose `cas-write` primitive already does mkdir-lock + temp + fsync + rename. Never `fs.writeFileSync` into `~/.youcoded/`.
- **`NativeHome` is the ONE writer for `~/.youcoded/`** (ADR 008, `native-home.ts` header). New files under it route through that class, not through ad-hoc `fs` calls.
- **Never follow symlinks when scanning a transcript lane.** 687 legacy home-slug symlinks were found in the wild; following them mis-attributes conversations. Use `lstatSync`.
- **A record's `transcriptRef` must start with its own `provider` + `/`.** Refuse mismatches rather than indexing under the wrong lane.
- **Tombstones, not pruning.** When a transcript is gone, keep the metadata row and mark it `tombstone: true`. Never delete indexed turn lines because a source file vanished.
- **No records predate `transcriptRef`** (0 of 1690 verified). Records with an *empty* ref are phantom metadata-only seeds — skip them; never derive a slug as a fallback.
- **WHY comments on non-trivial edits.** Destin is a non-developer and relies on them. State the constraint the code cannot show.
- **Tests use the real filesystem**, `fs.mkdtempSync` temp dirs, and explicit named imports from `vitest`. No `vi.mock` of `fs` — the conversations suite treats that as deliberate policy.
- **Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`** before claiming any task done (tsc + affected vitest + knip + ast-grep).

**Worktree:** `/home/destin/youcoded-dev/worktrees/chatsearch` (branch `feat/chatsearch-phase1`, base `8db3d675`). Desktop code is under `desktop/`. Baseline at branch point: 368 test files / 4081 tests passing.

---

### Task 1: Shared lane + symlink guards

Extract the two incident-derived guards into one pure module and route every existing call site through it. The chatsearch builder will be the first thing ever to cold-scan the native lane, so it cannot inherit these by imitation.

**Files:**
- Create: `desktop/src/main/conversations/lane-guards.ts`
- Create: `desktop/tests/conversations-lane-guards.test.ts`
- Modify: `desktop/src/main/conversations/reconciler.ts` (symlink + size skip, ~line 147)
- Modify: `desktop/src/main/conversations/service.ts` (lane assertion, two sites: `materializeSweep` ~line 510, `materializeOne` ~line 605)
- Modify: `desktop/src/main/native-home.ts` (`listSessionFiles`, ~line 245 — add the symlink skip it currently lacks)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `MIN_TRANSCRIPT_BYTES: number`, `type TranscriptSkipReason = 'symlink' | 'too-small'`, `interface StatLike { isSymbolicLink(): boolean; size: number }`, `transcriptSkipReason(st: StatLike, minBytes?: number): TranscriptSkipReason | null`, `laneMatches(provider: string, transcriptRef: string): boolean`. Tasks 4 and 5 consume all of these.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/conversations-lane-guards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  MIN_TRANSCRIPT_BYTES,
  transcriptSkipReason,
  laneMatches,
} from '../src/main/conversations/lane-guards';

// A stat double: the guards only ever need these two members, which is why
// StatLike is narrower than fs.Stats (keeps the module pure + trivially testable).
const stat = (over: { symlink?: boolean; size?: number } = {}) => ({
  isSymbolicLink: () => over.symlink ?? false,
  size: over.size ?? 10_000,
});

describe('transcriptSkipReason', () => {
  // The 687-symlink incident: following a home-slug symlink mis-attributes
  // every linked conversation to the home basename.
  it('skips a symlink regardless of size', () => {
    expect(transcriptSkipReason(stat({ symlink: true }))).toBe('symlink');
    expect(transcriptSkipReason(stat({ symlink: true, size: 0 }))).toBe('symlink');
  });

  it('returns null for a normal file when no size floor is given', () => {
    expect(transcriptSkipReason(stat({ size: 1 }))).toBeNull();
  });

  // Default minBytes is 0 so callers OPT IN to the junk-size gate. listSessionFiles
  // must not start dropping small native sessions when it adopts this helper.
  it('applies the size floor only when one is passed', () => {
    expect(transcriptSkipReason(stat({ size: 100 }))).toBeNull();
    expect(transcriptSkipReason(stat({ size: 100 }), MIN_TRANSCRIPT_BYTES)).toBe('too-small');
    expect(transcriptSkipReason(stat({ size: 10_000 }), MIN_TRANSCRIPT_BYTES)).toBeNull();
  });

  it('checks symlink before size', () => {
    expect(transcriptSkipReason(stat({ symlink: true, size: 1 }), MIN_TRANSCRIPT_BYTES)).toBe('symlink');
  });

  it('exposes the junk threshold used by listPastSessions', () => {
    expect(MIN_TRANSCRIPT_BYTES).toBe(500);
  });
});

describe('laneMatches', () => {
  it('accepts a ref under its own provider lane', () => {
    expect(laneMatches('claude', 'claude/transcripts/proj/abc.jsonl')).toBe(true);
    expect(laneMatches('native', 'native/transcripts/proj/abc.jsonl')).toBe(true);
  });

  // D5, never cross-materialize: a native record pointing into the claude lane
  // must be refused, not indexed under the wrong provider.
  it('rejects a cross-lane ref', () => {
    expect(laneMatches('native', 'claude/transcripts/proj/abc.jsonl')).toBe(false);
    expect(laneMatches('claude', 'native/transcripts/proj/abc.jsonl')).toBe(false);
  });

  // Phantom metadata-only seed records carry an empty ref. They must not pass
  // the lane check — Task 4 skips them explicitly rather than deriving a path.
  it('rejects an empty ref', () => {
    expect(laneMatches('claude', '')).toBe(false);
  });

  // Prefix must be the whole lane segment, not a string prefix.
  it('rejects a lane that is only a string prefix of another', () => {
    expect(laneMatches('native', 'native-other/transcripts/p/a.jsonl')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/conversations-lane-guards.test.ts`
Expected: FAIL — cannot resolve `../src/main/conversations/lane-guards`.

- [ ] **Step 3: Write the implementation**

Create `desktop/src/main/conversations/lane-guards.ts`:

```ts
/**
 * Shared guards for anything that cold-scans a transcript lane.
 *
 * WHY one implementation: both guards encode incidents, and both used to live in
 * exactly one place each — so a new scanner could not inherit them by imitation.
 *  - Symlink skip: the LEGACY sync system symlinked every conversation into the
 *    home-dir project slug (687 found on a real machine). Following them tags
 *    every linked conversation with the home basename. lstat does not follow the
 *    link, so the symlink is detected and skipped; the real transcript is
 *    processed normally in its true slug. Lived only in reconciler.ts (CC-only).
 *  - Lane assertion: a record's transcriptRef must live under its OWN provider's
 *    lane, or a native record could be materialized through the claude lane.
 *    Was duplicated at two service.ts sites.
 * The chatsearch index builder is the first thing to cold-scan the NATIVE lane,
 * which is why these moved here rather than being copied a third time.
 */

/** Junk threshold: below this a transcript is startup noise, not a conversation. */
export const MIN_TRANSCRIPT_BYTES = 500;

export type TranscriptSkipReason = 'symlink' | 'too-small';

/** The only stat members these guards need — fs.Stats satisfies it structurally. */
export interface StatLike {
  isSymbolicLink(): boolean;
  size: number;
}

/**
 * Why a transcript entry must be skipped, or null to process it.
 *
 * `minBytes` defaults to 0 so the size gate is OPT-IN: NativeHome.listSessionFiles
 * enumerates every native session regardless of size and must not start dropping
 * small ones by adopting this helper. Callers that want the junk gate pass
 * MIN_TRANSCRIPT_BYTES explicitly.
 *
 * Pass an `fs.lstatSync()` result — never `statSync`, which follows the symlink
 * and defeats the first check.
 */
export function transcriptSkipReason(
  st: StatLike,
  minBytes: number = 0
): TranscriptSkipReason | null {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.size < minBytes) return 'too-small';
  return null;
}

/**
 * Does this record's transcriptRef live under its own provider's lane?
 *
 * Pure string check on the record's own fields (no IO), so it runs before any
 * path resolution. An empty ref (phantom metadata-only seed) fails by design.
 * The trailing slash matters: 'native' must not match 'native-other/...'.
 */
export function laneMatches(provider: string, transcriptRef: string): boolean {
  return transcriptRef.startsWith(`${provider}/`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/conversations-lane-guards.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Route reconciler.ts through the helper**

In `desktop/src/main/conversations/reconciler.ts`, add to the imports:

```ts
import { transcriptSkipReason, MIN_TRANSCRIPT_BYTES } from './lane-guards';
```

Delete the local `const MIN_TRANSCRIPT_BYTES = 500;` declaration (it now comes from `lane-guards`). Then replace these two lines (inside the per-file `try`, after `const jsonlPath = ...`):

```ts
        const st = fs.lstatSync(jsonlPath);
        if (st.isSymbolicLink()) continue;
        if (st.size < MIN_TRANSCRIPT_BYTES) continue;
```

with:

```ts
        // Symlink + junk-size gate now lives in lane-guards.ts so the chatsearch
        // index builder and NativeHome share ONE implementation. lstat (not stat)
        // is load-bearing: it does not follow the link.
        const st = fs.lstatSync(jsonlPath);
        if (transcriptSkipReason(st, MIN_TRANSCRIPT_BYTES)) continue;
```

Keep the existing long comment block above it — it documents the incident and should stay at the call site.

- [ ] **Step 6: Route service.ts's two lane assertions through the helper**

In `desktop/src/main/conversations/service.ts`, add to the imports:

```ts
import { laneMatches } from './lane-guards';
```

At **both** sites (in `materializeSweep`, and in `materializeOne`), replace:

```ts
    if (!rec.transcriptRef.startsWith(`${sessionProvider}/`)) {
```

with:

```ts
    if (!laneMatches(sessionProvider, rec.transcriptRef)) {
```

Leave the surrounding comment, the `console.warn`, and the differing control-flow keyword (`continue` in the sweep, `return` in `materializeOne`) exactly as they are.

- [ ] **Step 7: Add the symlink skip to NativeHome.listSessionFiles**

In `desktop/src/main/native-home.ts`, add to the imports:

```ts
import { transcriptSkipReason } from './conversations/lane-guards';
```

In `listSessionFiles()`, replace:

```ts
        try {
          const st = fs.statSync(full);
```

with:

```ts
        try {
          // lstat, NOT stat: a symlinked session file must be skipped, not
          // followed. The native lane has no symlinks today (verified: 0 of 128
          // on a real machine), so this is defensive — but the chatsearch builder
          // consumes this listing, and the CC lane proved what following a
          // symlink costs. No size floor here: listSessionFiles must keep
          // enumerating small native sessions.
          const st = fs.lstatSync(full);
          if (transcriptSkipReason(st)) continue;
```

- [ ] **Step 8: Add the NativeHome symlink regression test**

Append to `desktop/tests/native-home.test.ts`, inside the existing top-level `describe`:

```ts
  // The guard NativeHome gained from lane-guards.ts. Native sessions are real
  // files today, so this pins the defensive behavior against a future regression
  // (and against the CC lane's 687-symlink incident repeating here).
  const canSymlinkNh = (() => {
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-nh-symlink-probe-'));
    try {
      fs.writeFileSync(path.join(probeDir, 'target'), 'x');
      fs.symlinkSync('target', path.join(probeDir, 'link'), 'file');
      return true;
    } catch { return false; }
    finally { try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch {} }
  })();

  it.skipIf(!canSymlinkNh)('listSessionFiles skips a symlinked session file', () => {
    const slugDir = path.join(root, '.youcoded', 'sessions', 'proj-a');
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, 'real.jsonl'), '{"v":1}\n');
    fs.symlinkSync('real.jsonl', path.join(slugDir, 'linked.jsonl'), 'file');

    const ids = home.listSessionFiles().map((f) => f.sessionId).sort();
    expect(ids).toEqual(['real']);
  });

  it('listSessionFiles still enumerates a session smaller than the junk threshold', () => {
    const slugDir = path.join(root, '.youcoded', 'sessions', 'proj-b');
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, 'tiny.jsonl'), '{"v":1}\n'); // ~8 bytes

    const ids = home.listSessionFiles().map((f) => f.sessionId);
    expect(ids).toContain('tiny');
  });
```

If `os` or `path` are not already imported in that file, add them. Match the file's existing import style.

- [ ] **Step 9: Run the full affected suites**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/conversations-lane-guards.test.ts tests/native-home.test.ts tests/conversation-reconciler.test.ts tests/conversation-store-core.test.ts tests/session-meta-parity.test.ts`
Expected: PASS, no regressions. The reconciler suite's existing symlink test must still pass — it now exercises the shared helper.

- [ ] **Step 10: Run the verify gate**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`
Expected: exit 0 (tsc clean, affected tests pass, knip clean, ast-grep clean).

- [ ] **Step 11: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/chatsearch
git add desktop/src/main/conversations/lane-guards.ts desktop/tests/conversations-lane-guards.test.ts desktop/src/main/conversations/reconciler.ts desktop/src/main/conversations/service.ts desktop/src/main/native-home.ts desktop/tests/native-home.test.ts
git commit -m "$(cat <<'EOF'
refactor(conversations): extract lane + symlink guards to one module

Both guards encode incidents and each lived in exactly one place: the symlink
skip in reconciler.ts (CC-only), the lane assertion duplicated at two service.ts
sites. The chatsearch index builder is the first thing to cold-scan the native
lane, so it could not inherit either by imitation.

NativeHome.listSessionFiles gains the symlink skip it never had (lstat, not
stat). No size floor there — it must keep enumerating small native sessions, so
the helper's size gate is opt-in.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Turn extraction (pure core)

The single definition of "a user turn worth indexing," for both lane formats. This is the most subtle task in the plan — read the notes below before writing code.

**What the existing gate actually does.** `session-browser.ts` has two copies of a "real conversational prompt" gate and they diverge. Measured on a real 101-user-line CC transcript: **every** line had a `promptId`, and only one had `isMeta`. Tool-result carrier lines are `type: 'user'` **with** a `promptId` — they are excluded not by the gate but because their `content` array holds `tool_result` blocks and no `text` blocks, so text extraction yields `''` and the empty check drops them. The `<`-prefix skip (which removes injected `<system-reminder>` / `<command-name>` wrappers) exists in the **title head-scan copy only**, not in `loadHistory`. That divergence is correct and must be preserved: chat rendering must not drop a real prompt that starts with `<`, but the index must.

**Files:**
- Create: `desktop/src/main/chatsearch-index/index-core.ts`
- Create: `desktop/tests/chatsearch-index-core.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `interface IndexTurn { conversationId: string; turn: number; ts: string; text: string }`, `isRealUserTurn(parsed: unknown): boolean`, `userTurnText(parsed: unknown, joiner?: string): string`, `isIndexableText(text: string): boolean`, `normalizeTimestamp(v: unknown): string`, `extractCcUserTurns(chunk: string, conversationId: string, startTurn: number): { turns: IndexTurn[]; consumedBytes: number }`, `extractNativeUserTurns(chunk: string, conversationId: string, startTurn: number, isStartOfFile: boolean): { turns: IndexTurn[]; consumedBytes: number }`. Task 3 adds more exports to the same file; Task 5 consumes the two extractors and `consumedBytes`.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/chatsearch-index-core.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isRealUserTurn,
  userTurnText,
  isIndexableText,
  normalizeTimestamp,
  extractCcUserTurns,
  extractNativeUserTurns,
} from '../src/main/chatsearch-index/index-core';

// Real CC line shapes, trimmed to the fields the gate reads. Verified against
// ~/.claude/projects/*.jsonl on 2026-08-05.
const ccPrompt = (over: Record<string, unknown> = {}) => JSON.stringify({
  type: 'user',
  promptId: 'p1',
  uuid: 'u1',
  timestamp: '2026-07-26T18:04:11.000Z',
  message: { role: 'user', content: 'the actual message text' },
  ...over,
});

const ccToolResult = () => JSON.stringify({
  type: 'user',
  promptId: 'p1',
  uuid: 'u2',
  timestamp: '2026-07-26T18:04:24.000Z',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'output' }] },
});

const ccInjected = () => JSON.stringify({
  type: 'user',
  promptId: 'p1',
  uuid: 'u3',
  isMeta: true,
  timestamp: '2026-07-26T18:05:00.000Z',
  message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /x' }] },
});

const ccWrapped = () => JSON.stringify({
  type: 'user',
  promptId: 'p1',
  uuid: 'u4',
  timestamp: '2026-07-26T18:06:00.000Z',
  message: { role: 'user', content: '<system-reminder>plumbing</system-reminder>' },
});

describe('isRealUserTurn', () => {
  it('accepts a typed user prompt', () => {
    expect(isRealUserTurn(JSON.parse(ccPrompt()))).toBe(true);
  });

  it('rejects assistant lines', () => {
    expect(isRealUserTurn({ type: 'assistant', promptId: 'p', message: {} })).toBe(false);
  });

  it('rejects isMeta lines', () => {
    expect(isRealUserTurn(JSON.parse(ccInjected()))).toBe(false);
  });

  it('rejects lines with no promptId or no message', () => {
    expect(isRealUserTurn({ type: 'user', message: {} })).toBe(false);
    expect(isRealUserTurn({ type: 'user', promptId: 'p' })).toBe(false);
  });

  it('rejects non-objects without throwing', () => {
    expect(isRealUserTurn(null)).toBe(false);
    expect(isRealUserTurn('string')).toBe(false);
  });

  // The gate alone does NOT exclude tool results — they carry a promptId. This
  // pins that fact so nobody "simplifies" the text-block filter away later.
  it('accepts a tool-result carrier (text extraction is what excludes it)', () => {
    expect(isRealUserTurn(JSON.parse(ccToolResult()))).toBe(true);
  });
});

describe('userTurnText', () => {
  it('returns string content as-is', () => {
    expect(userTurnText(JSON.parse(ccPrompt()))).toBe('the actual message text');
  });

  it('joins only text blocks from array content', () => {
    const parsed = { message: { content: [
      { type: 'text', text: 'one' },
      { type: 'tool_result', content: 'ignored' },
      { type: 'text', text: 'two' },
    ] } };
    expect(userTurnText(parsed)).toBe('one\ntwo');
    expect(userTurnText(parsed, ' ')).toBe('one two');
  });

  // This is the real mechanism that drops tool results from the index.
  it('yields empty string for a tool-result-only line', () => {
    expect(userTurnText(JSON.parse(ccToolResult()))).toBe('');
  });

  it('yields empty string for missing or odd content', () => {
    expect(userTurnText({})).toBe('');
    expect(userTurnText({ message: { content: 42 } })).toBe('');
  });
});

describe('isIndexableText', () => {
  it('accepts ordinary prose', () => {
    expect(isIndexableText('did we finish the timeout work?')).toBe(true);
  });

  it('rejects empty and whitespace-only', () => {
    expect(isIndexableText('')).toBe(false);
    expect(isIndexableText('   \n ')).toBe(false);
  });

  // Injected wrappers. Deliberately lossy: a real prompt starting with '<'
  // is dropped too. loadHistory does NOT apply this — chat rendering must keep
  // such a prompt — which is why this lives here and not in a shared gate.
  it('rejects <-wrapped injected content', () => {
    expect(isIndexableText('<system-reminder>x</system-reminder>')).toBe(false);
    expect(isIndexableText('  <command-name>/foo</command-name>')).toBe(false);
  });
});

describe('normalizeTimestamp', () => {
  it('passes through an ISO string', () => {
    expect(normalizeTimestamp('2026-07-26T18:04:11.000Z')).toBe('2026-07-26T18:04:11.000Z');
  });

  // CC writes ISO strings, the native harness writes epoch ms numbers. The index
  // stores one format so ranges and sorting work across both lanes.
  it('converts epoch milliseconds to ISO', () => {
    expect(normalizeTimestamp(1785990913428)).toBe('2026-08-05T21:55:13.428Z');
  });

  it('returns empty string for unparseable input', () => {
    expect(normalizeTimestamp(undefined)).toBe('');
    expect(normalizeTimestamp('not a date')).toBe('');
  });
});

describe('extractCcUserTurns', () => {
  it('extracts prompts and skips tool results, injected, and wrapped lines', () => {
    const chunk = [ccPrompt(), ccToolResult(), ccInjected(), ccWrapped()].join('\n') + '\n';
    const { turns } = extractCcUserTurns(chunk, 'conv-1', 1);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({
      conversationId: 'conv-1',
      turn: 1,
      ts: '2026-07-26T18:04:11.000Z',
      text: 'the actual message text',
    });
  });

  it('numbers turns from startTurn', () => {
    const chunk = [ccPrompt({ uuid: 'a' }), ccPrompt({ uuid: 'b' })].join('\n') + '\n';
    const { turns } = extractCcUserTurns(chunk, 'c', 7);
    expect(turns.map((t) => t.turn)).toEqual([7, 8]);
  });

  it('skips blank lines, null-byte lines, and unparseable JSON', () => {
    const chunk = ['', '{ not json', `{"type":"user" }`, ccPrompt()].join('\n') + '\n';
    const { turns } = extractCcUserTurns(chunk, 'c', 1);
    expect(turns).toHaveLength(1);
  });

  // consumedBytes is what makes incremental refresh safe: the next read starts
  // on a line boundary, so a half-written trailing line is never parsed.
  it('reports consumedBytes up to the last complete line', () => {
    const complete = ccPrompt() + '\n';
    const chunk = complete + '{"type":"user","promptId":"p","mess';
    const { turns, consumedBytes } = extractCcUserTurns(chunk, 'c', 1);
    expect(turns).toHaveLength(1);
    expect(consumedBytes).toBe(Buffer.byteLength(complete, 'utf8'));
  });

  it('reports zero consumedBytes when no line is complete', () => {
    const { turns, consumedBytes } = extractCcUserTurns('{"partial', 'c', 1);
    expect(turns).toEqual([]);
    expect(consumedBytes).toBe(0);
  });

  // Multi-byte safety: consumedBytes is a BYTE offset, and the caller seeks by
  // bytes. A character count would desync the offset on any non-ASCII prompt.
  it('counts consumedBytes in bytes, not characters', () => {
    const line = JSON.stringify({
      type: 'user', promptId: 'p', uuid: 'u',
      timestamp: '2026-07-26T18:04:11.000Z',
      message: { role: 'user', content: 'héllo wörld — em dash' },
    }) + '\n';
    const { consumedBytes } = extractCcUserTurns(line, 'c', 1);
    expect(consumedBytes).toBe(Buffer.byteLength(line, 'utf8'));
    expect(consumedBytes).toBeGreaterThan(line.length);
  });
});

describe('extractNativeUserTurns', () => {
  const header = () => JSON.stringify({
    v: 1, sessionId: 's1', harnessId: 'assistant',
    binding: { providerId: 'openrouter', modelId: 'qwen/qwen3.8-max' },
    cwd: '/home/destin/youcoded-dev', createdAt: 1785990907536,
  });

  const userMsg = (text: string, ts = 1785990913428) => JSON.stringify({
    type: 'user-message', sessionId: 's1', uuid: 'u1', timestamp: ts, data: { text },
  });

  const assistantMsg = () => JSON.stringify({
    type: 'assistant-text', sessionId: 's1', uuid: 'u2', timestamp: 1785990914000,
    data: { text: 'assistant reply' },
  });

  it('skips the header line at the start of the file', () => {
    const chunk = [header(), userMsg('echo something')].join('\n') + '\n';
    const { turns } = extractNativeUserTurns(chunk, 'conv-n', 1, true);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({
      conversationId: 'conv-n',
      turn: 1,
      ts: '2026-08-05T21:55:13.428Z',
      text: 'echo something',
    });
  });

  // Mid-file resume: byte offset is past the header, so nothing may be dropped.
  it('does not skip a line when resuming mid-file', () => {
    const chunk = userMsg('resumed message') + '\n';
    const { turns } = extractNativeUserTurns(chunk, 'conv-n', 5, false);
    expect(turns).toHaveLength(1);
    expect(turns[0].turn).toBe(5);
  });

  it('indexes only user-message events', () => {
    const chunk = [userMsg('mine'), assistantMsg()].join('\n') + '\n';
    const { turns } = extractNativeUserTurns(chunk, 'c', 1, false);
    expect(turns.map((t) => t.text)).toEqual(['mine']);
  });

  it('skips a user-message with no text', () => {
    const chunk = JSON.stringify({ type: 'user-message', uuid: 'u', timestamp: 1, data: {} }) + '\n';
    const { turns } = extractNativeUserTurns(chunk, 'c', 1, false);
    expect(turns).toEqual([]);
  });

  it('applies the same <-wrapped skip as the CC lane', () => {
    const chunk = userMsg('<system-reminder>x</system-reminder>') + '\n';
    const { turns } = extractNativeUserTurns(chunk, 'c', 1, false);
    expect(turns).toEqual([]);
  });

  it('reports consumedBytes up to the last complete line', () => {
    const complete = userMsg('done') + '\n';
    const { consumedBytes } = extractNativeUserTurns(complete + '{"type":"user-mess', 'c', 1, false);
    expect(consumedBytes).toBe(Buffer.byteLength(complete, 'utf8'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-core.test.ts`
Expected: FAIL — cannot resolve `../src/main/chatsearch-index/index-core`.

- [ ] **Step 3: Write the implementation**

Create `desktop/src/main/chatsearch-index/index-core.ts`:

```ts
/**
 * chatsearch index — PURE core. No fs/path/os imports, ever.
 *
 * Turn extraction for both provider lanes. The two lanes store user messages in
 * completely different shapes (CC: raw Claude Code JSONL with string-or-block
 * content and ISO timestamps; native: TranscriptEvent with data.text and epoch-ms
 * timestamps), so each gets its own extractor and both emit the same IndexTurn.
 */

/** One indexed user turn. Serialized to <provider>-turns.jsonl by index-store. */
export interface IndexTurn {
  conversationId: string;
  /** 1-based ordinal among INDEXED turns (not among all JSONL lines). */
  turn: number;
  /** ISO-8601. Normalized across both lanes so date filters work uniformly. */
  ts: string;
  text: string;
}

export interface ExtractResult {
  turns: IndexTurn[];
  /**
   * Byte offset just past the last COMPLETE line in `chunk`. The caller stores
   * this and resumes there, so a half-written trailing line is never parsed and
   * never double-counted once it is finished.
   */
  consumedBytes: number;
}

/**
 * The "real conversational prompt" gate, matching session-browser.ts.
 *
 * NOTE what this does NOT do: it does not exclude tool-result carrier lines.
 * Those are type 'user' AND carry a promptId (verified: all 101 user lines in a
 * real transcript had one). They are excluded downstream because their content
 * holds no `text` blocks, so userTurnText returns '' and isIndexableText drops
 * it. Do not "optimize" that second filter away.
 */
export function isRealUserTurn(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  return p.type === 'user' && !p.isMeta && !!p.promptId && !!p.message;
}

/**
 * Text of a CC user line. Content is a string OR an array of blocks; only `text`
 * blocks contribute, which is what collapses tool-result lines to ''.
 *
 * `joiner` defaults to '\n' (loadHistory's behavior). The title head-scan uses
 * ' '. The index uses the default.
 */
export function userTurnText(parsed: unknown, joiner: string = '\n'): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const message = (parsed as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') return '';
  const c = (message as Record<string, unknown>).content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((b) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text')
      .map((b) => String((b as Record<string, unknown>).text ?? ''))
      .join(joiner);
  }
  return '';
}

/**
 * Is this text worth putting in the index?
 *
 * The '<' skip removes injected wrappers (<system-reminder>, <command-name>,
 * <local-command-stdout>) that are plumbing, not what the user said. Deliberately
 * lossy: a real prompt that starts with '<' (pasted HTML/XML) is dropped too.
 *
 * WHY this is not shared with loadHistory: chat rendering MUST keep such a
 * prompt — dropping it would blank a real message in the UI. Only the index and
 * the title scan want it gone.
 */
export function isIndexableText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !t.startsWith('<');
}

/** ISO-8601 from either lane's timestamp format; '' when unparseable. */
export function normalizeTimestamp(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return '';
}

/**
 * Split a chunk into complete lines plus the byte offset just past the last one.
 * A chunk with no trailing newline yields consumedBytes for only the complete
 * prefix, so the unfinished tail is re-read next cycle.
 */
function completeLines(chunk: string): { lines: string[]; consumedBytes: number } {
  const lastNewline = chunk.lastIndexOf('\n');
  if (lastNewline === -1) return { lines: [], consumedBytes: 0 };
  const complete = chunk.slice(0, lastNewline + 1);
  return {
    lines: complete.split('\n'),
    // BYTE length, not character length — the caller seeks by bytes, and a
    // character count desyncs the offset on any non-ASCII prompt.
    consumedBytes: Buffer.byteLength(complete, 'utf8'),
  };
}

/** Blank or null-byte-corrupt lines (NTFS pre-allocation gaps) are never parsed. */
function isParseableLine(line: string): boolean {
  return !!line.trim() && !line.includes(' ');
}

/** Extract indexable user turns from a Claude Code transcript chunk. */
export function extractCcUserTurns(
  chunk: string,
  conversationId: string,
  startTurn: number
): ExtractResult {
  const { lines, consumedBytes } = completeLines(chunk);
  const turns: IndexTurn[] = [];
  let turn = startTurn;

  for (const line of lines) {
    if (!isParseableLine(line)) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!isRealUserTurn(parsed)) continue;
    const text = userTurnText(parsed);
    if (!isIndexableText(text)) continue;
    turns.push({
      conversationId,
      turn: turn++,
      ts: normalizeTimestamp((parsed as Record<string, unknown>).timestamp),
      text: text.trim(),
    });
  }

  return { turns, consumedBytes };
}

/**
 * Extract indexable user turns from a native harness session chunk.
 *
 * `isStartOfFile` must be true only when reading from byte 0: line 1 is the
 * NativeSessionHeader, not an event. On an incremental resume the offset is
 * already past it, so skipping a line there would silently drop a real message.
 */
export function extractNativeUserTurns(
  chunk: string,
  conversationId: string,
  startTurn: number,
  isStartOfFile: boolean
): ExtractResult {
  const { lines, consumedBytes } = completeLines(chunk);
  const turns: IndexTurn[] = [];
  let turn = startTurn;
  let skipHeader = isStartOfFile;

  for (const line of lines) {
    if (!isParseableLine(line)) continue;
    if (skipHeader) { skipHeader = false; continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!parsed || typeof parsed !== 'object') continue;
    const ev = parsed as Record<string, unknown>;
    if (ev.type !== 'user-message') continue;
    const data = ev.data as Record<string, unknown> | undefined;
    const text = typeof data?.text === 'string' ? data.text : '';
    if (!isIndexableText(text)) continue;
    turns.push({
      conversationId,
      turn: turn++,
      ts: normalizeTimestamp(ev.timestamp),
      text: text.trim(),
    });
  }

  return { turns, consumedBytes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-core.test.ts`
Expected: PASS (all describes green).

If `normalizeTimestamp(1785990913428)` does not equal `'2026-08-05T21:55:13.428Z'`, do **not** change the implementation — recompute the expected string with `node -e "console.log(new Date(1785990913428).toISOString())"` and correct the test's expected value. The conversion is the contract; the literal is just an example.

- [ ] **Step 5: Run the verify gate**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`
Expected: exit 0. Note: `knip` may flag the new exports as unused until Task 5 consumes them — if it does, note it in your report rather than deleting exports the plan requires.

- [ ] **Step 6: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/chatsearch
git add desktop/src/main/chatsearch-index/index-core.ts desktop/tests/chatsearch-index-core.test.ts
git commit -m "$(cat <<'EOF'
feat(chatsearch): pure turn extraction for both provider lanes

One definition of "a user turn worth indexing", covering CC's string-or-block
content with ISO timestamps and the native harness's TranscriptEvent with
data.text and epoch-ms timestamps.

Two things pinned by test because they are easy to get wrong:
- The promptId gate does NOT exclude tool results (they carry one). The text-
  block filter is what excludes them, so it must not be optimized away.
- consumedBytes is a BYTE offset up to the last complete line, so incremental
  refresh never parses a half-written tail and never desyncs on non-ASCII text.

The '<'-wrapped skip lives here and NOT in a gate shared with loadHistory: chat
rendering must keep a real prompt that starts with '<'; the index must not.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Index file formats + Tier 1 metadata builder

**Architecture note that shapes this task:** the CLI is a standalone Node script in a *different repo* and cannot import this TypeScript. So the app owns the **producer** side (encode, denormalize) and the CLI owns the **consumer** side (decode, query, rank, format). The shared contract is the **file format**, pinned by golden tests on both sides. Do not build query parsing or ranking here.

**Files:**
- Create: `desktop/src/main/chatsearch-index/index-format.ts`
- Create: `desktop/src/main/chatsearch-index/meta-builder.ts`
- Create: `desktop/tests/chatsearch-meta-builder.test.ts`

**Interfaces:**
- Consumes: `laneMatches` (Task 1); `IndexTurn` (Task 2).
- Produces: from `index-format.ts` — `CHATSEARCH_FORMAT_VERSION`, `ChatsearchMetaEntry`, `ChatsearchMetaFile`, `TurnsStateFile`, `ConversationStats`, `encodeTurnLine(t: IndexTurn): string`, `decodeTurnLine(line: string): IndexTurn | null`. From `meta-builder.ts` — `buildMetaFile(input: BuildMetaInput): ChatsearchMetaFile`. Task 4 consumes `encodeTurnLine` + `TurnsStateFile`; Task 5 consumes `buildMetaFile`.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/chatsearch-meta-builder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeTurnLine, decodeTurnLine, CHATSEARCH_FORMAT_VERSION } from '../src/main/chatsearch-index/index-format';
import { buildMetaFile } from '../src/main/chatsearch-index/meta-builder';
import type { ConversationRecord } from '../src/main/conversations/store-core';

const rec = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
  schema: 1,
  id: 'c1',
  provider: 'claude',
  projectName: 'youcoded',
  originalPath: '/home/destin/youcoded-dev',
  title: 'Permission ask timeout',
  lastActive: '2026-07-26T18:04:11.000Z',
  device: 'dev1',
  flags: {},
  transcriptRef: 'claude/transcripts/youcoded/c1.jsonl',
  createdAt: '2026-07-26T17:00:00.000Z',
  note: '',
  noteUpdatedAt: '',
  ...over,
});

describe('turn line format', () => {
  it('round-trips a turn', () => {
    const t = { conversationId: 'c1', turn: 142, ts: '2026-07-26T18:04:11.000Z', text: 'the actual message' };
    const line = encodeTurnLine(t);
    // Short keys are the wire format the CLI greps — pin them, not just the round-trip.
    expect(JSON.parse(line)).toEqual({ c: 'c1', t: 142, ts: '2026-07-26T18:04:11.000Z', x: 'the actual message' });
    expect(decodeTurnLine(line)).toEqual(t);
  });

  // The CLI reads this file line-by-line; one torn or malformed line must never
  // crash a search. decode returns null and the caller drops it.
  it('returns null for malformed lines instead of throwing', () => {
    expect(decodeTurnLine('')).toBeNull();
    expect(decodeTurnLine('{"c":"x"')).toBeNull();
    expect(decodeTurnLine('{"c":"x","t":"not-a-number","ts":"","x":"y"}')).toBeNull();
    expect(decodeTurnLine('{"nope":1}')).toBeNull();
  });

  it('encodes newlines safely (one JSON object per physical line)', () => {
    const line = encodeTurnLine({ conversationId: 'c', turn: 1, ts: '2026-01-01T00:00:00.000Z', text: 'a\nb' });
    expect(line.includes('\n')).toBe(false);
    expect(decodeTurnLine(line)!.text).toBe('a\nb');
  });
});

describe('buildMetaFile', () => {
  const base = {
    provider: 'claude' as const,
    refreshedAt: '2026-08-05T12:00:00.000Z',
    tagLabels: new Map<string, string>(),
    stats: new Map(),
    resolveTranscriptPath: (r: ConversationRecord) => `/local/${r.id}.jsonl`,
    transcriptExists: () => true,
  };

  it('denormalizes a record into a metadata entry', () => {
    const out = buildMetaFile({ ...base, records: [rec()] });
    expect(out.v).toBe(CHATSEARCH_FORMAT_VERSION);
    expect(out.provider).toBe('claude');
    expect(out.conversations.c1).toMatchObject({
      id: 'c1',
      provider: 'claude',
      projectName: 'youcoded',
      title: 'Permission ask timeout',
      complete: false,
      priority: false,
      tags: [],
      transcriptPath: '/local/c1.jsonl',
      tombstone: false,
    });
  });

  // Flags are stored as an open-keyed FlagState map holding BOTH reserved names
  // and tag: keys. The snapshot must expose resolved values only — the CLI never
  // sees raw flag-map internals.
  it('resolves complete/priority to plain booleans and tags to LABELS', () => {
    const tagLabels = new Map([['tag_a', 'sync'], ['tag_b', 'ui']]);
    const r = rec({
      flags: {
        complete: { value: true, updatedAt: 'x' },
        priority: { value: false, updatedAt: 'x' },
        'tag:tag_a': { value: true, updatedAt: 'x' },
        'tag:tag_b': { value: false, updatedAt: 'x' },
        'tag:tag_missing': { value: true, updatedAt: 'x' },
      },
    });
    const out = buildMetaFile({ ...base, records: [r], tagLabels });
    expect(out.conversations.c1.complete).toBe(true);
    expect(out.conversations.c1.priority).toBe(false);
    // Only applied tags, only resolvable ones, labels not ids.
    expect(out.conversations.c1.tags).toEqual(['sync']);
  });

  // Phantom metadata-only seeds: epoch lastActive, blank title, EMPTY ref.
  // pruneNativePhantomRecords exists to clean these up; the builder must not
  // invent a path for them.
  it('skips phantom records with an empty transcriptRef', () => {
    const out = buildMetaFile({ ...base, records: [rec({ id: 'ph', transcriptRef: '' })] });
    expect(out.conversations.ph).toBeUndefined();
  });

  // D5, never cross-materialize.
  it('refuses a record whose ref is in another provider lane', () => {
    const r = rec({ id: 'x', provider: 'native', transcriptRef: 'claude/transcripts/p/x.jsonl' });
    const out = buildMetaFile({ ...base, provider: 'native', records: [r] });
    expect(out.conversations.x).toBeUndefined();
  });

  // Tombstones (decided 2026-08-05): a deleted transcript keeps its row.
  it('marks a record whose transcript is gone as a tombstone, and keeps it', () => {
    const out = buildMetaFile({ ...base, records: [rec()], transcriptExists: () => false });
    expect(out.conversations.c1).toBeDefined();
    expect(out.conversations.c1.tombstone).toBe(true);
  });

  it('folds in per-conversation stats when present', () => {
    const stats = new Map([['c1', {
      sizeBytes: 4210338, turnCount: 187,
      firstTurnTs: '2026-07-26T17:01:00.000Z', lastTurnTs: '2026-07-26T18:04:11.000Z',
    }]]);
    const out = buildMetaFile({ ...base, records: [rec()], stats });
    expect(out.conversations.c1).toMatchObject({ sizeBytes: 4210338, turnCount: 187 });
  });

  it('defaults stats to zero when the turns builder has not seen it yet', () => {
    const out = buildMetaFile({ ...base, records: [rec()] });
    expect(out.conversations.c1).toMatchObject({ turnCount: 0, sizeBytes: 0, firstTurnTs: '', lastTurnTs: '' });
  });

  // 'Untitled' is a placeholder, not a title (store-core's realTitle rule).
  it('normalizes placeholder titles to empty string', () => {
    for (const t of ['Untitled', '', 'New Session']) {
      const out = buildMetaFile({ ...base, records: [rec({ title: t })] });
      expect(out.conversations.c1.title).toBe('');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chatsearch-meta-builder.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write index-format.ts**

Create `desktop/src/main/chatsearch-index/index-format.ts`:

```ts
/**
 * chatsearch — the ON-DISK FORMAT contract. Pure; no fs.
 *
 * WHY this is its own module: the CLI that reads these files is a standalone
 * Node script in the wecoded-marketplace repo and CANNOT import this TypeScript.
 * The app owns the producer side, the CLI owns the consumer side, and the FILE
 * FORMAT is the only thing between them. Golden tests on both sides pin it.
 * Any change here is a breaking change for the CLI — bump the version.
 */

import type { IndexTurn } from './index-core';

export const CHATSEARCH_FORMAT_VERSION = 1;

/** Per-conversation stats derived from the turns index (Task 4 produces these). */
export interface ConversationStats {
  sizeBytes: number;
  turnCount: number;
  firstTurnTs: string;
  lastTurnTs: string;
}

/** One conversation's denormalized metadata. The CLI needs NO store knowledge. */
export interface ChatsearchMetaEntry extends ConversationStats {
  id: string;
  provider: string;
  projectName: string;
  originalPath: string;
  /** '' when untitled — placeholders ('Untitled', 'New Session') normalize to ''. */
  title: string;
  lastActive: string;
  createdAt: string;
  /** Resolved from the flag map, never raw FlagState. */
  complete: boolean;
  priority: boolean;
  /** Tag LABELS resolved through the registry — never raw `tag:<id>` keys. */
  tags: string[];
  note: string;
  /** Absolute local path, so `show --turns` never derives a slug. */
  transcriptPath: string;
  /** True when the transcript is gone. The row is KEPT — see the spec's Decided. */
  tombstone: boolean;
}

export interface ChatsearchMetaFile {
  v: number;
  provider: string;
  refreshedAt: string;
  conversations: Record<string, ChatsearchMetaEntry>;
}

/** Incremental-refresh bookkeeping, one entry per conversation. */
export interface TurnsStateFile {
  v: number;
  provider: string;
  conversations: Record<string, {
    /** Byte offset consumed so far. */
    offset: number;
    /** Transcript size at that point — a smaller size means it was rewritten. */
    size: number;
    turnCount: number;
    firstTurnTs: string;
    lastTurnTs: string;
  }>;
}

/**
 * One turn as a single physical line. Keys are short because this file is the
 * bulk of the index and the CLI greps it.
 */
export function encodeTurnLine(t: IndexTurn): string {
  // JSON.stringify escapes newlines, so one turn is always exactly one line.
  return JSON.stringify({ c: t.conversationId, t: t.turn, ts: t.ts, x: t.text });
}

/** Inverse of encodeTurnLine. Returns null for anything malformed — never throws. */
export function decodeTurnLine(line: string): IndexTurn | null {
  if (!line.trim()) return null;
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.c !== 'string' || typeof o.t !== 'number') return null;
  if (typeof o.ts !== 'string' || typeof o.x !== 'string') return null;
  return { conversationId: o.c, turn: o.t, ts: o.ts, text: o.x };
}
```

- [ ] **Step 4: Write meta-builder.ts**

Create `desktop/src/main/chatsearch-index/meta-builder.ts`:

```ts
/**
 * chatsearch Tier 1 — the metadata snapshot. Pure: takes records + lookups in,
 * returns the file contents. All IO lives in index-store.
 *
 * Everything the CLI would otherwise need store knowledge for is resolved HERE:
 * tag ids -> labels, flag map -> booleans, transcriptRef -> absolute local path.
 */

import type { ConversationRecord } from '../conversations/store-core';
import { laneMatches } from '../conversations/lane-guards';
import {
  CHATSEARCH_FORMAT_VERSION,
  type ChatsearchMetaEntry,
  type ChatsearchMetaFile,
  type ConversationStats,
} from './index-format';

export interface BuildMetaInput {
  provider: string;
  records: ConversationRecord[];
  refreshedAt: string;
  /** tag id -> label, from the tag registry's list(). Empty map when unavailable. */
  tagLabels: Map<string, string>;
  /** conversation id -> stats, from the turns state file. */
  stats: Map<string, ConversationStats>;
  resolveTranscriptPath: (rec: ConversationRecord) => string;
  transcriptExists: (absPath: string) => boolean;
}

const EMPTY_STATS: ConversationStats = {
  sizeBytes: 0, turnCount: 0, firstTurnTs: '', lastTurnTs: '',
};

/** 'Untitled' and 'New Session' are placeholders, not titles (store-core's rule). */
function realTitle(title: string): string {
  const t = (title || '').trim();
  return t === 'Untitled' || t === 'New Session' ? '' : t;
}

export function buildMetaFile(input: BuildMetaInput): ChatsearchMetaFile {
  const conversations: Record<string, ChatsearchMetaEntry> = {};

  for (const rec of input.records) {
    // Phantom metadata-only seed: no ref to resolve. Skip rather than derive a
    // slug — no record predates transcriptRef, so an empty one is always this.
    if (!rec.transcriptRef) continue;
    // D5, never cross-materialize.
    if (!laneMatches(input.provider, rec.transcriptRef)) continue;

    const flags = rec.flags || {};
    const tags: string[] = [];
    for (const [key, state] of Object.entries(flags)) {
      if (!state?.value) continue;
      if (!key.startsWith('tag:')) continue;
      const label = input.tagLabels.get(key.slice(4));
      // An unresolvable id means a deleted tag or an unavailable registry —
      // omit it rather than leaking a raw id into CLI output.
      if (label) tags.push(label);
    }
    tags.sort();

    const transcriptPath = input.resolveTranscriptPath(rec);

    conversations[rec.id] = {
      ...(input.stats.get(rec.id) ?? EMPTY_STATS),
      id: rec.id,
      provider: input.provider,
      projectName: rec.projectName,
      originalPath: rec.originalPath,
      title: realTitle(rec.title),
      lastActive: rec.lastActive,
      createdAt: rec.createdAt,
      complete: !!flags.complete?.value,
      priority: !!flags.priority?.value,
      tags,
      note: rec.note || '',
      transcriptPath,
      // Tombstone, never prune: answering about a conversation whose bytes are
      // gone is the backstop's most valuable case.
      tombstone: !input.transcriptExists(transcriptPath),
    };
  }

  return {
    v: CHATSEARCH_FORMAT_VERSION,
    provider: input.provider,
    refreshedAt: input.refreshedAt,
    conversations,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-meta-builder.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the verify gate and commit**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`

```bash
cd /home/destin/youcoded-dev/worktrees/chatsearch
git add desktop/src/main/chatsearch-index/index-format.ts desktop/src/main/chatsearch-index/meta-builder.ts desktop/tests/chatsearch-meta-builder.test.ts
git commit -m "$(cat <<'EOF'
feat(chatsearch): on-disk format contract + Tier 1 metadata builder

index-format.ts is the ONLY thing shared with the CLI, which lives in another
repo and cannot import this TypeScript. The app is the producer, the CLI is the
consumer, the file format is the contract.

The metadata snapshot resolves everything the CLI would otherwise need store
knowledge for: tag ids to labels, the open-keyed flag map to plain booleans,
transcriptRef to an absolute local path. Phantom records (empty ref) and
cross-lane refs are refused; a deleted transcript is kept as a tombstone.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tier 2 turns index + incremental refresh + build lock

**Files:**
- Create: `desktop/src/main/chatsearch-index/index-store.ts`
- Create: `desktop/tests/chatsearch-index-store.test.ts`

**Interfaces:**
- Consumes: `transcriptSkipReason` (Task 1); `extractCcUserTurns`, `extractNativeUserTurns`, `IndexTurn` (Task 2); `encodeTurnLine`, `TurnsStateFile`, `ConversationStats`, `CHATSEARCH_FORMAT_VERSION` (Task 3).
- Produces: `chatsearchDir(homeRoot: string): string`, `turnsPath(dir, provider)`, `statePath(dir, provider)`, `metaPath(dir, provider)`, `acquireBuildLock(dir): Promise<(() => void) | null>`, `refreshTurns(opts: RefreshTurnsOpts): Promise<Map<string, ConversationStats>>`, `readState(dir, provider): TurnsStateFile`. Task 5 consumes `refreshTurns` and `acquireBuildLock`.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/chatsearch-index-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  chatsearchDir, turnsPath, statePath, acquireBuildLock, refreshTurns, readState,
} from '../src/main/chatsearch-index/index-store';
import { decodeTurnLine } from '../src/main/chatsearch-index/index-format';

let tmp: string;
let dir: string;

const ccLine = (text: string, ts = '2026-07-26T18:04:11.000Z') => JSON.stringify({
  type: 'user', promptId: 'p', uuid: `u-${text}`, timestamp: ts,
  message: { role: 'user', content: text },
}) + '\n';

// Transcripts must clear MIN_TRANSCRIPT_BYTES-free scanning; the turns builder
// applies no size floor, so short fixtures are fine.
function writeTranscript(rel: string, body: string): string {
  const p = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}

const readTurns = () =>
  fs.readFileSync(turnsPath(dir, 'claude'), 'utf8')
    .split('\n').filter(Boolean).map(decodeTurnLine);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-chatsearch-'));
  dir = chatsearchDir(tmp);
  fs.mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

describe('refreshTurns', () => {
  it('indexes a new transcript from zero', async () => {
    const p = writeTranscript('t/a.jsonl', ccLine('first') + ccLine('second'));
    const stats = await refreshTurns({
      dir, provider: 'claude',
      conversations: [{ id: 'a', transcriptPath: p }],
    });

    const turns = readTurns();
    expect(turns.map((t) => t!.text)).toEqual(['first', 'second']);
    expect(turns.map((t) => t!.turn)).toEqual([1, 2]);
    expect(stats.get('a')).toMatchObject({ turnCount: 2 });
  });

  // The whole point of the state sidecar: a grown transcript is appended from
  // its recorded offset, not re-read whole.
  it('appends only new turns when a transcript grows', async () => {
    const p = writeTranscript('t/a.jsonl', ccLine('first'));
    const conversations = [{ id: 'a', transcriptPath: p }];
    await refreshTurns({ dir, provider: 'claude', conversations });

    fs.appendFileSync(p, ccLine('second'));
    const stats = await refreshTurns({ dir, provider: 'claude', conversations });

    const turns = readTurns();
    expect(turns.map((t) => t!.text)).toEqual(['first', 'second']);
    expect(turns.map((t) => t!.turn)).toEqual([1, 2]);
    expect(stats.get('a')!.turnCount).toBe(2);
  });

  it('is a no-op when nothing changed', async () => {
    const p = writeTranscript('t/a.jsonl', ccLine('only'));
    const conversations = [{ id: 'a', transcriptPath: p }];
    await refreshTurns({ dir, provider: 'claude', conversations });
    const before = fs.readFileSync(turnsPath(dir, 'claude'), 'utf8');

    await refreshTurns({ dir, provider: 'claude', conversations });
    expect(fs.readFileSync(turnsPath(dir, 'claude'), 'utf8')).toBe(before);
  });

  // /clear rewrites and compaction shrink the file. Resuming from the old offset
  // would splice unrelated bytes together, so a shrunk transcript re-reads whole.
  it('re-reads from zero when a transcript shrinks', async () => {
    const p = writeTranscript('t/a.jsonl', ccLine('old-one') + ccLine('old-two'));
    const conversations = [{ id: 'a', transcriptPath: p }];
    await refreshTurns({ dir, provider: 'claude', conversations });

    fs.writeFileSync(p, ccLine('rewritten'));
    await refreshTurns({ dir, provider: 'claude', conversations });

    const turns = readTurns().filter((t) => t!.conversationId === 'a');
    expect(turns.map((t) => t!.text)).toEqual(['rewritten']);
    expect(turns.map((t) => t!.turn)).toEqual([1]);
  });

  // Tombstone rule: the transcript is gone, but its indexed turns are the whole
  // reason the backstop is valuable. Never delete them.
  it('keeps indexed turns when the transcript disappears', async () => {
    const p = writeTranscript('t/a.jsonl', ccLine('remembered'));
    const conversations = [{ id: 'a', transcriptPath: p }];
    await refreshTurns({ dir, provider: 'claude', conversations });

    fs.rmSync(p);
    const stats = await refreshTurns({ dir, provider: 'claude', conversations });

    expect(readTurns().map((t) => t!.text)).toEqual(['remembered']);
    expect(stats.get('a')!.turnCount).toBe(1);
  });

  // The 687-symlink incident, applied to the index: a symlinked transcript is
  // skipped entirely rather than indexed under the wrong conversation.
  it('skips a symlinked transcript', async () => {
    writeTranscript('t/real.jsonl', ccLine('real'));
    const link = path.join(tmp, 't', 'link.jsonl');
    try { fs.symlinkSync('real.jsonl', link, 'file'); } catch { return; } // no symlink support

    await refreshTurns({
      dir, provider: 'claude',
      conversations: [{ id: 'linked', transcriptPath: link }],
    });

    const indexed = fs.existsSync(turnsPath(dir, 'claude'))
      ? readTurns().filter((t) => t!.conversationId === 'linked')
      : [];
    expect(indexed).toEqual([]);
  });

  it('records first/last turn timestamps in the state file', async () => {
    const p = writeTranscript('t/a.jsonl',
      ccLine('one', '2026-07-01T00:00:00.000Z') + ccLine('two', '2026-07-09T00:00:00.000Z'));
    await refreshTurns({ dir, provider: 'claude', conversations: [{ id: 'a', transcriptPath: p }] });

    const st = readState(dir, 'claude');
    expect(st.conversations.a.firstTurnTs).toBe('2026-07-01T00:00:00.000Z');
    expect(st.conversations.a.lastTurnTs).toBe('2026-07-09T00:00:00.000Z');
  });

  it('indexes a native session, skipping its header line', async () => {
    const header = JSON.stringify({ v: 1, sessionId: 'n1', harnessId: 'assistant', cwd: '/x', createdAt: 1 }) + '\n';
    const msg = JSON.stringify({
      type: 'user-message', sessionId: 'n1', uuid: 'u', timestamp: 1785990913428, data: { text: 'native hello' },
    }) + '\n';
    const p = writeTranscript('n/n1.jsonl', header + msg);

    await refreshTurns({
      dir, provider: 'native', lane: 'native',
      conversations: [{ id: 'n1', transcriptPath: p }],
    });

    const lines = fs.readFileSync(turnsPath(dir, 'native'), 'utf8').split('\n').filter(Boolean);
    expect(lines.map((l) => decodeTurnLine(l)!.text)).toEqual(['native hello']);
  });
});

describe('acquireBuildLock', () => {
  // ~/.youcoded/ is shared by the live app and every dev instance. Two builders
  // appending to the same turns file would double-index or corrupt it.
  it('grants the lock once and refuses a second holder', async () => {
    const release = await acquireBuildLock(dir);
    expect(release).not.toBeNull();

    const second = await acquireBuildLock(dir);
    expect(second).toBeNull();

    release!();
    const third = await acquireBuildLock(dir);
    expect(third).not.toBeNull();
    third!();
  });

  it('takes over a stale lock', async () => {
    const lock = path.join(dir, '.build-lock');
    fs.mkdirSync(lock, { recursive: true });
    const old = Date.now() - 10 * 60_000;
    fs.utimesSync(lock, new Date(old), new Date(old));

    const release = await acquireBuildLock(dir);
    expect(release).not.toBeNull();
    release!();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-store.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `desktop/src/main/chatsearch-index/index-store.ts`:

```ts
/**
 * chatsearch — the IO shell. Builds and refreshes the derived index files.
 *
 * CONCURRENCY: ~/.youcoded/ is shared by the live app AND every run-dev.sh
 * instance (run-dev isolates only userData and ports). Two builders appending to
 * the same turns file would double-index it, so every refresh cycle runs under a
 * mkdir-based build lock. Every file lands via temp-then-rename.
 */

import fs from 'node:fs';
import path from 'node:path';
import { transcriptSkipReason } from '../conversations/lane-guards';
import { extractCcUserTurns, extractNativeUserTurns, type IndexTurn } from './index-core';
import {
  CHATSEARCH_FORMAT_VERSION,
  encodeTurnLine,
  type ConversationStats,
  type TurnsStateFile,
} from './index-format';

/** A lock older than this is assumed abandoned (crashed builder). */
const BUILD_LOCK_STALE_MS = 5 * 60_000;
/** Read this much per conversation per cycle; the rest catches up next cycle. */
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export function chatsearchDir(homeRoot: string): string {
  return path.join(homeRoot, '.youcoded', 'chatsearch');
}

export const turnsPath = (dir: string, provider: string) => path.join(dir, `${provider}-turns.jsonl`);
export const statePath = (dir: string, provider: string) => path.join(dir, `${provider}-turns.state.json`);
export const metaPath = (dir: string, provider: string) => path.join(dir, `${provider}-meta.json`);

/**
 * Atomic write: temp + rename. A reader (the CLI, or another instance) must
 * never observe a half-written file.
 */
export function atomicWriteFileSync(target: string, content: string): void {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

/**
 * One builder at a time, across processes. Returns a release fn, or null when
 * another instance holds it — in which case the caller SKIPS this cycle rather
 * than waiting, since the next tick will catch up anyway.
 */
export async function acquireBuildLock(dir: string): Promise<(() => void) | null> {
  const lock = path.join(dir, '.build-lock');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.mkdirSync(lock);
  } catch {
    try {
      const st = fs.statSync(lock);
      if (Date.now() - st.mtimeMs <= BUILD_LOCK_STALE_MS) return null;
      // Stale: a builder crashed without releasing. Take it over.
      fs.rmSync(lock, { recursive: true, force: true });
      fs.mkdirSync(lock);
    } catch {
      return null;
    }
  }
  return () => { try { fs.rmSync(lock, { recursive: true, force: true }); } catch {} };
}

export function readState(dir: string, provider: string): TurnsStateFile {
  const empty: TurnsStateFile = { v: CHATSEARCH_FORMAT_VERSION, provider, conversations: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(dir, provider), 'utf8')) as TurnsStateFile;
    if (!parsed || parsed.v !== CHATSEARCH_FORMAT_VERSION) return empty;
    return { ...empty, ...parsed, conversations: parsed.conversations || {} };
  } catch {
    return empty;
  }
}

export interface RefreshTurnsOpts {
  dir: string;
  provider: string;
  /** Which extractor to use. Defaults to the CC one. */
  lane?: 'claude' | 'native';
  conversations: Array<{ id: string; transcriptPath: string }>;
}

/** Read `[from, from+max)` bytes of a file as UTF-8. */
function readChunk(p: string, from: number, max: number): string {
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(max);
    const bytes = fs.readSync(fd, buf, 0, max, from);
    return buf.subarray(0, bytes).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Bring the turns index up to date and return per-conversation stats.
 *
 * Growth is appended from the recorded offset. A SHRUNK transcript (CC /clear
 * rewrite, compaction, retention deletion) is re-read from zero — resuming from
 * the old offset would splice unrelated bytes together. A transcript that has
 * VANISHED keeps its already-indexed turns: tombstones, never prune.
 */
export async function refreshTurns(opts: RefreshTurnsOpts): Promise<Map<string, ConversationStats>> {
  const { dir, provider } = opts;
  const state = readState(dir, provider);
  const stats = new Map<string, ConversationStats>();

  // Conversations needing a full re-read have their existing lines dropped.
  const rewrite = new Set<string>();
  const appended: IndexTurn[] = [];

  for (const conv of opts.conversations) {
    const prev = state.conversations[conv.id];

    let st: fs.Stats;
    try {
      st = fs.lstatSync(conv.transcriptPath);
    } catch {
      // Gone. Keep whatever we already indexed — that is the tombstone case.
      if (prev) stats.set(conv.id, statsOf(prev));
      continue;
    }
    if (transcriptSkipReason(st)) continue; // symlink — never follow

    let from = prev?.offset ?? 0;
    let startTurn = (prev?.turnCount ?? 0) + 1;
    let firstTurnTs = prev?.firstTurnTs ?? '';
    let lastTurnTs = prev?.lastTurnTs ?? '';

    if (prev && st.size < prev.size) {
      // Rewritten under us — start over for this conversation.
      rewrite.add(conv.id);
      from = 0;
      startTurn = 1;
      firstTurnTs = '';
      lastTurnTs = '';
    }

    if (st.size === from && prev && !rewrite.has(conv.id)) {
      stats.set(conv.id, statsOf(prev));
      continue;
    }

    const chunk = readChunk(conv.transcriptPath, from, Math.min(MAX_CHUNK_BYTES, Math.max(0, st.size - from)));
    const isStartOfFile = from === 0;
    const { turns, consumedBytes } =
      opts.lane === 'native'
        ? extractNativeUserTurns(chunk, conv.id, startTurn, isStartOfFile)
        : extractCcUserTurns(chunk, conv.id, startTurn);

    appended.push(...turns);
    for (const t of turns) {
      if (!firstTurnTs) firstTurnTs = t.ts;
      lastTurnTs = t.ts;
    }

    const next = {
      offset: from + consumedBytes,
      size: st.size,
      turnCount: startTurn - 1 + turns.length,
      firstTurnTs,
      lastTurnTs,
    };
    state.conversations[conv.id] = next;
    stats.set(conv.id, statsOf(next));
  }

  if (appended.length === 0 && rewrite.size === 0) return stats;

  // Rewrite the whole turns file when any conversation was re-read from zero;
  // otherwise append. Appending is the common path — a full rewrite only happens
  // when a transcript was truncated under us.
  const file = turnsPath(dir, provider);
  const newLines = appended.map(encodeTurnLine);

  if (rewrite.size > 0) {
    let kept: string[] = [];
    try {
      kept = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).filter((line) => {
        // Cheap prefix test avoids parsing every line just to check ownership.
        const m = line.match(/^\{"c":"([^"]+)"/);
        return !(m && rewrite.has(m[1]));
      });
    } catch { kept = []; }
    atomicWriteFileSync(file, [...kept, ...newLines].join('\n') + '\n');
  } else {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, newLines.join('\n') + '\n', 'utf8');
  }

  atomicWriteFileSync(statePath(dir, provider), JSON.stringify(state, null, 2));
  return stats;
}

function statsOf(s: { size: number; turnCount: number; firstTurnTs: string; lastTurnTs: string }): ConversationStats {
  return {
    sizeBytes: s.size,
    turnCount: s.turnCount,
    firstTurnTs: s.firstTurnTs,
    lastTurnTs: s.lastTurnTs,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the verify gate and commit**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`

```bash
cd /home/destin/youcoded-dev/worktrees/chatsearch
git add desktop/src/main/chatsearch-index/index-store.ts desktop/tests/chatsearch-index-store.test.ts
git commit -m "$(cat <<'EOF'
feat(chatsearch): incremental turns index with a cross-process build lock

Growth appends from the recorded byte offset. A shrunk transcript (CC /clear
rewrite, compaction, retention deletion) re-reads from zero, because resuming
from the old offset would splice unrelated bytes together. A VANISHED transcript
keeps its already-indexed turns — tombstones, never prune.

The build lock is not optional: ~/.youcoded/ is shared by the live app and every
run-dev.sh instance, so two builders would otherwise double-index the same file.
A second holder skips the cycle rather than waiting; the next tick catches up.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Meta-change notifications + index service + startup wiring

`SESSION_META_CHANGED` today is **only** a `webContents.send` to the renderer — there is no main-process listener registry, so nothing in main can react to a tag/flag/note change. This task adds a small Set-based bus (the same shape as `onSyncSpacesEvent`) and hangs the index refresh off it, plus app start and session quiesce.

**Files:**
- Create: `desktop/src/main/chatsearch-index/index-service.ts`
- Create: `desktop/tests/chatsearch-index-service.test.ts`
- Modify: `desktop/src/main/conversations/service.ts` (add the bus + fire it)
- Modify: `desktop/src/main/ipc-handlers.ts` (fire the bus at the three meta-write sites)
- Modify: `desktop/src/main/main.ts` (start/stop the service)

**Interfaces:**
- Consumes: `buildMetaFile` (Task 3); `refreshTurns`, `acquireBuildLock`, `chatsearchDir`, `metaPath`, `atomicWriteFileSync`, `readState` (Task 4).
- Produces: `onConversationMetaChanged(cb: () => void): () => void` and `emitConversationMetaChanged(): void` in `conversations/service.ts`; `startChatsearchIndex(opts?)`, `stopChatsearchIndex()`, `refreshChatsearchIndex()` in `index-service.ts`.

- [ ] **Step 1: Add the meta-changed bus to conversations/service.ts**

Add near the other module-level state in `desktop/src/main/conversations/service.ts`:

```ts
// In-main notification that a conversation's user-visible metadata changed
// (flag, tag, or note). SESSION_META_CHANGED is a webContents.send to the
// RENDERER only — nothing in main could react to it, which the chatsearch index
// needs so a tag applied in-app is visible to the CLI before the next launch.
// Same Set-based shape as onSyncSpacesEvent.
const metaChangedListeners = new Set<() => void>();

export function onConversationMetaChanged(cb: () => void): () => void {
  metaChangedListeners.add(cb);
  return () => { metaChangedListeners.delete(cb); };
}

export function emitConversationMetaChanged(): void {
  for (const cb of metaChangedListeners) {
    // One bad listener must never break a metadata write.
    try { cb(); } catch { /* listener errors are not the writer's problem */ }
  }
}
```

- [ ] **Step 2: Fire the bus at the three meta-write sites**

In `desktop/src/main/ipc-handlers.ts`, add `emitConversationMetaChanged` to the existing import from `./conversations/service`. Then at each of the three sites — the `SESSION_SET_FLAG`, `SESSION_SET_TAG`, and `SESSION_SET_NOTE` handlers — add one line immediately **after** the existing `remoteServer?.broadcast({ ... })` call:

```ts
      emitConversationMetaChanged();
```

Preserve the existing broadcast-after-persist ordering: every site already awaits the store write and returns early on `!res.ok` before emitting. The new call goes last.

- [ ] **Step 3: Write the failing service test**

Create `desktop/tests/chatsearch-index-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { onConversationMetaChanged, emitConversationMetaChanged } from '../src/main/conversations/service';
import { refreshChatsearchIndex } from '../src/main/chatsearch-index/index-service';
import { chatsearchDir, metaPath, turnsPath } from '../src/main/chatsearch-index/index-store';
import type { ConversationRecord } from '../src/main/conversations/store-core';

let tmp: string;

const rec = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
  schema: 1, id: 'c1', provider: 'claude', projectName: 'youcoded',
  originalPath: '/p', title: 'A conversation',
  lastActive: '2026-07-26T18:04:11.000Z', device: 'd', flags: {},
  transcriptRef: 'claude/transcripts/youcoded/c1.jsonl',
  createdAt: '2026-07-26T17:00:00.000Z', note: '', noteUpdatedAt: '',
  ...over,
});

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-cs-svc-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

describe('onConversationMetaChanged', () => {
  it('notifies subscribers and unsubscribes cleanly', () => {
    let count = 0;
    const off = onConversationMetaChanged(() => { count++; });
    emitConversationMetaChanged();
    expect(count).toBe(1);
    off();
    emitConversationMetaChanged();
    expect(count).toBe(1);
  });

  it('a throwing listener does not break the emit', () => {
    let reached = false;
    const offBad = onConversationMetaChanged(() => { throw new Error('boom'); });
    const offGood = onConversationMetaChanged(() => { reached = true; });
    expect(() => emitConversationMetaChanged()).not.toThrow();
    expect(reached).toBe(true);
    offBad(); offGood();
  });
});

describe('refreshChatsearchIndex', () => {
  it('writes both index files for a provider', async () => {
    const transcript = path.join(tmp, 'c1.jsonl');
    fs.writeFileSync(transcript, JSON.stringify({
      type: 'user', promptId: 'p', uuid: 'u', timestamp: '2026-07-26T18:04:11.000Z',
      message: { role: 'user', content: 'the indexed message' },
    }) + '\n');

    await refreshChatsearchIndex({
      homeRoot: tmp,
      lanes: [{
        provider: 'claude',
        lane: 'claude',
        records: [rec()],
        resolveTranscriptPath: () => transcript,
      }],
      tagLabels: new Map(),
    });

    const dir = chatsearchDir(tmp);
    const meta = JSON.parse(fs.readFileSync(metaPath(dir, 'claude'), 'utf8'));
    expect(meta.conversations.c1.title).toBe('A conversation');
    expect(meta.conversations.c1.turnCount).toBe(1);
    expect(meta.conversations.c1.tombstone).toBe(false);
    expect(fs.readFileSync(turnsPath(dir, 'claude'), 'utf8')).toContain('the indexed message');
  });

  it('marks a conversation whose transcript never existed as a tombstone', async () => {
    await refreshChatsearchIndex({
      homeRoot: tmp,
      lanes: [{
        provider: 'claude', lane: 'claude', records: [rec()],
        resolveTranscriptPath: () => path.join(tmp, 'missing.jsonl'),
      }],
      tagLabels: new Map(),
    });

    const meta = JSON.parse(fs.readFileSync(metaPath(chatsearchDir(tmp), 'claude'), 'utf8'));
    expect(meta.conversations.c1.tombstone).toBe(true);
  });

  it('skips the cycle when another builder holds the lock', async () => {
    fs.mkdirSync(path.join(chatsearchDir(tmp), '.build-lock'), { recursive: true });

    const ran = await refreshChatsearchIndex({
      homeRoot: tmp,
      lanes: [{ provider: 'claude', lane: 'claude', records: [rec()], resolveTranscriptPath: () => '/nope' }],
      tagLabels: new Map(),
    });

    expect(ran).toBe(false);
    expect(fs.existsSync(metaPath(chatsearchDir(tmp), 'claude'))).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-service.test.ts`
Expected: FAIL — `index-service` does not exist (the bus tests should already pass from Step 1).

- [ ] **Step 5: Write index-service.ts**

Create `desktop/src/main/chatsearch-index/index-service.ts`:

```ts
/**
 * chatsearch — module singleton + lifecycle, matching tag-registry-service.ts's
 * shape (module-level state, start/stop free functions, no class).
 *
 * Refresh triggers: app start, session quiesce, and any in-app metadata change.
 * The last one is load-bearing — without it a tag applied in the app UI would be
 * invisible to the CLI until the next launch.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConversationRecord } from '../conversations/store-core';
import {
  getConversationStore,
  onConversationMetaChanged,
} from '../conversations/service';
import { getTagRegistry } from '../conversations/tag-registry-service';
import { NativeHome } from '../native-home';
import { cwdToProjectSlug } from '../transcript-watcher';
import { ccProjectSlug } from '../project-conversations';
import { buildMetaFile } from './meta-builder';
import {
  acquireBuildLock, atomicWriteFileSync, chatsearchDir, metaPath, refreshTurns,
} from './index-store';

/** Coalesce bursts of metadata changes into one refresh. */
const META_DEBOUNCE_MS = 3_000;

let started = false;
let debounceTimer: NodeJS.Timeout | null = null;
let unsubscribeMeta: (() => void) | null = null;
let inFlight = false;

export interface LaneInput {
  provider: string;
  lane: 'claude' | 'native';
  records: ConversationRecord[];
  resolveTranscriptPath: (rec: ConversationRecord) => string;
}

export interface RefreshInput {
  homeRoot: string;
  lanes: LaneInput[];
  tagLabels: Map<string, string>;
}

/**
 * One full refresh cycle. Returns false when another instance holds the build
 * lock (this cycle is skipped; the next tick catches up).
 */
export async function refreshChatsearchIndex(input: RefreshInput): Promise<boolean> {
  const dir = chatsearchDir(input.homeRoot);
  const release = await acquireBuildLock(dir);
  if (!release) return false;

  try {
    for (const lane of input.lanes) {
      const conversations = lane.records
        .filter((r) => !!r.transcriptRef)
        .map((r) => ({ id: r.id, transcriptPath: lane.resolveTranscriptPath(r) }));

      const stats = await refreshTurns({
        dir, provider: lane.provider, lane: lane.lane, conversations,
      });

      const meta = buildMetaFile({
        provider: lane.provider,
        records: lane.records,
        refreshedAt: new Date().toISOString(),
        tagLabels: input.tagLabels,
        stats,
        resolveTranscriptPath: lane.resolveTranscriptPath,
        transcriptExists: (p) => { try { return fs.lstatSync(p).size >= 0; } catch { return false; } },
      });

      atomicWriteFileSync(metaPath(dir, lane.provider), JSON.stringify(meta, null, 2));
    }
    return true;
  } finally {
    release();
  }
}

/** Gather live inputs from the store + tag registry and run one cycle. */
async function refreshFromLiveState(): Promise<void> {
  if (inFlight) return; // a cycle is already running; its result will be current enough
  const store = getConversationStore();
  if (!store) return; // store unavailable this launch — nothing to index

  inFlight = true;
  try {
    const tagLabels = new Map<string, string>();
    try {
      const reg = getTagRegistry();
      // Null registry (managed roots unavailable) degrades to unlabeled tags,
      // never to a crash — same posture as the tags:list IPC handler.
      for (const t of (await reg?.list()) ?? []) tagLabels.set(t.id, t.label);
    } catch { /* unlabeled is acceptable; an empty index is not */ }

    const home = new NativeHome();
    const homeRoot = os.homedir();

    const [claudeRecords, nativeRecords] = await Promise.all([
      store.list('claude').catch(() => [] as ConversationRecord[]),
      store.list('native').catch(() => [] as ConversationRecord[]),
    ]);

    await refreshChatsearchIndex({
      homeRoot,
      tagLabels,
      lanes: [
        {
          provider: 'claude',
          lane: 'claude',
          records: claudeRecords,
          resolveTranscriptPath: (r) =>
            path.join(homeRoot, '.claude', 'projects', ccProjectSlug(r.originalPath), `${r.id}.jsonl`),
        },
        {
          provider: 'native',
          lane: 'native',
          records: nativeRecords,
          // RAW slug, not ccProjectSlug — the two encodings diverge deliberately
          // (ccProjectSlug uppercases a lowercase Windows drive letter).
          resolveTranscriptPath: (r) =>
            path.join(home.root, 'sessions', cwdToProjectSlug(r.originalPath), `${r.id}.jsonl`),
        },
      ],
    });
  } catch {
    // A failed refresh leaves the previous index in place. The next trigger
    // retries; a stale index is surfaced by the CLI's own age banner.
  } finally {
    inFlight = false;
  }
}

/** Public trigger — safe to call from anywhere in main. Never throws. */
export function requestChatsearchRefresh(): void {
  if (!started) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { void refreshFromLiveState(); }, META_DEBOUNCE_MS);
  debounceTimer.unref?.();
}

export function startChatsearchIndex(): void {
  stopChatsearchIndex();
  started = true;
  unsubscribeMeta = onConversationMetaChanged(() => { requestChatsearchRefresh(); });
  // Startup scan is the load-bearing one: Claude Code sessions happen whether or
  // not the app is running, so the index is usually behind at launch.
  void refreshFromLiveState();
}

export function stopChatsearchIndex(): void {
  started = false;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  unsubscribeMeta?.();
  unsubscribeMeta = null;
}
```

If `cwdToProjectSlug` is not exported from `transcript-watcher.ts`, export it there (it is already used cross-module by `session-browser.ts`; if that import reaches it another way, follow the same route rather than adding a second export).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire into main.ts**

In `desktop/src/main/main.ts`, add the import next to the existing conversations imports:

```ts
import { startChatsearchIndex, stopChatsearchIndex, requestChatsearchRefresh } from './chatsearch-index/index-service';
```

Immediately after the existing `startTagRegistry();` line, add:

```ts
    // After the store AND tag registry — the index denormalizes both.
    startChatsearchIndex();
```

In the `window-all-closed` handler, next to `stopConversationStore()`, add:

```ts
    try { stopChatsearchIndex(); } catch {}
```

- [ ] **Step 8: Hang a refresh off session quiesce**

In `desktop/src/main/ipc-handlers.ts`, add `requestChatsearchRefresh` to the `chatsearch-index/index-service` import. In the `session-exit` listener, immediately after the existing `noteSessionEnded(claudeId);` line, add:

```ts
      // A session that just ended has new turns to index. Debounced, and it runs
      // after noteSessionEnded's own quiescence-gated materialize.
      requestChatsearchRefresh();
```

- [ ] **Step 9: Run the affected suites, verify gate, and commit**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/chatsearch-index-service.test.ts tests/ipc-channels.test.ts tests/session-meta-parity.test.ts`
Then: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`

```bash
cd /home/destin/youcoded-dev/worktrees/chatsearch
git add desktop/src/main/chatsearch-index/index-service.ts desktop/tests/chatsearch-index-service.test.ts desktop/src/main/conversations/service.ts desktop/src/main/ipc-handlers.ts desktop/src/main/main.ts
git commit -m "$(cat <<'EOF'
feat(chatsearch): index service, startup wiring, and an in-main meta-change bus

SESSION_META_CHANGED was a webContents.send to the renderer only — nothing in
main could react to it. The index needs that hook, or a tag applied in the app
UI stays invisible to the CLI until the next launch. Added a Set-based bus in
conversations/service.ts (same shape as onSyncSpacesEvent) fired from the three
metadata write sites.

Refresh triggers: app start (load-bearing, since CC sessions happen whether or
not the app runs), session quiesce, and debounced metadata changes. A failed
refresh leaves the previous index in place rather than clearing it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The chatsearch plugin — CLI, skill, and marketplace registration

Different repo: `/home/destin/youcoded-dev/wecoded-marketplace`. Work on a branch there.

**Files (all under `/home/destin/youcoded-dev/wecoded-marketplace/`):**
- Create: `youcoded-chatsearch/plugin.json`
- Create: `youcoded-chatsearch/package.json`
- Create: `youcoded-chatsearch/skills/chatsearch/SKILL.md`
- Create: `youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js`
- Create: `youcoded-chatsearch/tests/chatsearch.test.js`
- Create: `overrides/youcoded-chatsearch.json`
- Modify: `marketplace.json` (append to `plugins[]`)

**Do NOT touch** `.claude-plugin/marketplace.json` — CI regenerates it from `marketplace.json` on merge.

**Interfaces:**
- Consumes: the on-disk format from Task 3 — `~/.youcoded/chatsearch/<provider>-meta.json` (`{v, provider, refreshedAt, conversations: {id -> entry}}`) and `<provider>-turns.jsonl` (`{"c","t","ts","x"}` per line). The CLI cannot import the app's TypeScript; this format is the entire contract.
- Produces: the `find` / `show` / `status` output format that Task 7's golden test pins.

**Conventions to follow** (from the sibling plugins): ESM (`"type": "module"`), no shebang, **zero dependencies** (Node stdlib only), `node --test` for tests, `engines: { node: ">=20" }`. Input is a JSON blob in `process.argv[2]`; add stdin support because the spec requires quote-safe queries.

- [ ] **Step 1: Write the failing test**

Create `youcoded-chatsearch/tests/chatsearch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runChatsearch } from '../skills/chatsearch/scripts/chatsearch.js';

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cli-'));
  const dir = path.join(home, '.youcoded', 'chatsearch');
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'claude-meta.json'), JSON.stringify({
    v: 1, provider: 'claude', refreshedAt: new Date().toISOString(),
    conversations: {
      a3f2aaaa: {
        id: 'a3f2aaaa', provider: 'claude', projectName: 'youcoded', originalPath: '/p',
        title: 'Permission ask timeout', lastActive: '2026-07-26T18:04:11.000Z',
        createdAt: '2026-07-26T17:00:00.000Z', complete: true, priority: false,
        tags: ['perm', 'ui'], note: '', transcriptPath: '/tmp/a3f2.jsonl',
        tombstone: false, sizeBytes: 100, turnCount: 2,
        firstTurnTs: '2026-07-26T17:01:00.000Z', lastTurnTs: '2026-07-26T18:04:11.000Z',
      },
      9c14bbbb: {
        id: '9c14bbbb', provider: 'claude', projectName: 'youcoded-dev', originalPath: '/q',
        title: 'Native runtime parity', lastActive: '2026-07-22T10:00:00.000Z',
        createdAt: '2026-07-22T09:00:00.000Z', complete: false, priority: false,
        tags: ['native'], note: 'superseded', transcriptPath: '/tmp/gone.jsonl',
        tombstone: true, sizeBytes: 0, turnCount: 1,
        firstTurnTs: '2026-07-22T09:30:00.000Z', lastTurnTs: '2026-07-22T09:30:00.000Z',
      },
    },
  }));

  fs.writeFileSync(path.join(dir, 'claude-turns.jsonl'),
    JSON.stringify({ c: 'a3f2aaaa', t: 1, ts: '2026-07-26T17:01:00.000Z', x: 'the permission ask keeps timing out' }) + '\n' +
    JSON.stringify({ c: 'a3f2aaaa', t: 2, ts: '2026-07-26T18:04:11.000Z', x: 'fixed it, merged as 284' }) + '\n' +
    JSON.stringify({ c: '9c14bbbb', t: 1, ts: '2026-07-22T09:30:00.000Z', x: 'native runtime parity program' }) + '\n' +
    '{"torn":' + '\n');

  return home;
}

test('find with no query browses everything, newest first', async () => {
  const out = await runChatsearch({ cmd: 'find' }, { home: fixture() });
  assert.match(out, /a3f2/);
  assert.match(out, /9c14/);
  assert.ok(out.indexOf('a3f2') < out.indexOf('9c14'), 'newest first');
});

test('find matches user turn text case-insensitively', async () => {
  const out = await runChatsearch({ cmd: 'find', query: 'PERMISSION' }, { home: fixture() });
  assert.match(out, /a3f2/);
  assert.doesNotMatch(out, /9c14/);
});

test('a torn final line does not crash the search', async () => {
  const out = await runChatsearch({ cmd: 'find', query: 'parity' }, { home: fixture() });
  assert.match(out, /9c14/);
});

test('status markers: complete, open, tombstone', async () => {
  const out = await runChatsearch({ cmd: 'find' }, { home: fixture() });
  const rows = out.split('\n').filter((l) => /^[0-9a-f]{4}/.test(l));
  assert.match(rows.find((r) => r.startsWith('a3f2')), /✓/);
  // Tombstoned rows carry † so a dead pointer is never mistaken for a live one.
  assert.match(rows.find((r) => r.startsWith('9c14')), /†/);
});

test('--project filters by folder name', async () => {
  const out = await runChatsearch({ cmd: 'find', project: 'youcoded-dev' }, { home: fixture() });
  assert.match(out, /9c14/);
  assert.doesNotMatch(out, /a3f2/);
});

test('--tag filters by label', async () => {
  const out = await runChatsearch({ cmd: 'find', tag: ['native'] }, { home: fixture() });
  assert.match(out, /9c14/);
  assert.doesNotMatch(out, /a3f2/);
});

test('show prints metadata for a short id prefix', async () => {
  const out = await runChatsearch({ cmd: 'show', id: 'a3f2' }, { home: fixture() });
  assert.match(out, /Permission ask timeout/);
  assert.match(out, /youcoded/);
});

test('show on a tombstone says the transcript is gone rather than failing', async () => {
  const out = await runChatsearch({ cmd: 'show', id: '9c14' }, { home: fixture() });
  assert.match(out, /Native runtime parity/);
  assert.match(out, /no longer exists|transcript is gone/i);
});

test('show --turns on a tombstone refuses with the same message', async () => {
  const out = await runChatsearch({ cmd: 'show', id: '9c14', turns: '1-2' }, { home: fixture() });
  assert.match(out, /no longer exists|transcript is gone/i);
});

test('an unknown id says so rather than printing an empty record', async () => {
  const out = await runChatsearch({ cmd: 'show', id: 'ffff' }, { home: fixture() });
  assert.match(out, /no conversation|not found/i);
});

test('an ambiguous id prefix lists the candidates instead of guessing', async () => {
  const home = fixture();
  // Both fixture ids are 8 hex chars; a prefix shared by neither is unambiguous,
  // so add a second conversation sharing 'a3f2' to force the collision.
  const metaPath = path.join(home, '.youcoded', 'chatsearch', 'claude-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.conversations.a3f2cccc = { ...meta.conversations.a3f2aaaa, id: 'a3f2cccc', title: 'Another one' };
  fs.writeFileSync(metaPath, JSON.stringify(meta));

  const out = await runChatsearch({ cmd: 'show', id: 'a3f2' }, { home });
  assert.match(out, /ambiguous|matches/i);
  assert.match(out, /a3f2aaaa/);
  assert.match(out, /a3f2cccc/);
});

test('status reports per-provider freshness and counts', async () => {
  const out = await runChatsearch({ cmd: 'status' }, { home: fixture() });
  assert.match(out, /claude/);
  assert.match(out, /2/);
});

test('a stale index prints a banner on find', async () => {
  const home = fixture();
  const metaPath = path.join(home, '.youcoded', 'chatsearch', 'claude-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.refreshedAt = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta));

  const out = await runChatsearch({ cmd: 'find' }, { home });
  assert.match(out, /last refreshed/i);
});

test('a missing index directory says so plainly, not empty results', async () => {
  const out = await runChatsearch({ cmd: 'find' }, { home: fs.mkdtempSync(path.join(os.tmpdir(), 'cs-empty-')) });
  assert.match(out, /no chatsearch index/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/destin/youcoded-dev/wecoded-marketplace/youcoded-chatsearch && node --test tests/*.test.js`
Expected: FAIL — cannot resolve the script.

- [ ] **Step 3: Write the CLI**

Create `youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js`. Implement `runChatsearch(req, env)` exported for tests, plus the argv/stdin main-module guard matching `inventory.js`'s pattern. Requirements, all pinned by the tests above:

- Read `<home>/.youcoded/chatsearch/<provider>-meta.json` and `<provider>-turns.jsonl` for providers `claude` and `native`. A missing directory prints `no chatsearch index exists on this device — open YouCoded to build it` and exits 0.
- `find`: optional `query` (case-insensitive substring over turn text), filters `project` (basename or full path), `tag` (repeatable, AND, by label), `provider`, `state` (`resolved` = complete or no open items; `open`; `unknown`; `any`, default), `since`/`until` (ISO date or relative like `30d`), `limit` (default 20). Sort by `lastActive` descending.
- Row format, one line per hit, id shortened to the first unambiguous prefix (4 chars minimum):
  `<id>  <YYYY-MM-DD>  <project>  <marker>  <title>  <#tags>`
  Markers: `✓` complete, `○` open, `?` unknown, and `†` appended for a tombstone.
- Skip any turns line that fails to parse — a torn final line must never crash a search.
- When the newest `refreshedAt` across loaded providers is older than 24h, print a first-line banner: `index last refreshed <N>d ago — open YouCoded to refresh`.
- `show <id>`: resolve by unique prefix; print title, project, dates, flags, tags, note, and the first user turn. `--turns A-B`, `--around N`, `--tail [n]` read the raw transcript at `transcriptPath`. On a tombstone (or an unreadable path) print the metadata and `the transcript no longer exists on this device`, and refuse `--turns`/`--around`/`--tail` with that same message rather than throwing.
- `status`: per provider — index age, conversation count, total indexed turns, and whether the directory exists.
- No dependencies. Node stdlib only. Do not import anything from the youcoded repo.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/wecoded-marketplace/youcoded-chatsearch && node --test tests/*.test.js`
Expected: all tests pass.

- [ ] **Step 5: Write the manifests and the skill**

`youcoded-chatsearch/package.json`:

```json
{
  "name": "youcoded-chatsearch",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

`youcoded-chatsearch/plugin.json`:

```json
{
  "name": "youcoded-chatsearch",
  "version": "0.1.0",
  "description": "Search your past YouCoded and Claude Code conversations — find what you worked on, when, and whether it got finished.",
  "author": { "name": "@destin" },
  "homepage": "https://github.com/itsdestin/wecoded-marketplace/tree/master/youcoded-chatsearch",
  "keywords": ["search", "history", "conversations", "memory"]
}
```

`youcoded-chatsearch/skills/chatsearch/SKILL.md` — frontmatter is `name` + `description` only (matching the sibling plugins). The body must teach: when to use it (the user vaguely remembers past work, or asks whether something got finished), the token discipline (**start with `find`, expand with `show` only for the one or two conversations that matter** — never dump whole transcripts), the exact command surface, how to pass a query safely (JSON on stdin for anything with quotes, `$`, or newlines; argv for simple cases), that `†` means the transcript is gone but the metadata survives, and that a staleness banner means the app has not run recently. Invoke as `node "${CLAUDE_PLUGIN_ROOT}/skills/chatsearch/scripts/chatsearch.js" '<json>'`.

- [ ] **Step 6: Register in the marketplace**

Append to `plugins[]` in `/home/destin/youcoded-dev/wecoded-marketplace/marketplace.json`:

```json
    {
      "name": "youcoded-chatsearch",
      "displayName": "Chat Search",
      "description": "Search your past conversations — find what you worked on and whether it got finished.",
      "author": { "name": "@destin", "github": "destinationunknown" },
      "category": "productivity",
      "source": { "source": "local", "path": "youcoded-chatsearch" }
    }
```

Create `overrides/youcoded-chatsearch.json`:

```json
{
  "tagline": "Find that thing you half-remember working on.",
  "longDescription": "Searches every past YouCoded and Claude Code conversation on this device by what you actually typed, then points you at the one that matters. Answers \"did we ever finish that?\" without reopening a dozen sessions.",
  "tags": ["productivity", "reference"],
  "lifeArea": ["work"],
  "audience": "general"
}
```

Every tag/lifeArea/audience value above is drawn from the CI-enforced enums in `scripts/schema.js` — do not invent new ones, the PR validation workflow rejects them.

Then regenerate the indexes: `cd /home/destin/youcoded-dev/wecoded-marketplace && node scripts/sync.js`

- [ ] **Step 7: Commit and open the PR**

The marketplace merge must land **before** the app release that adds the id to the bundled lists — `skill-provider.ts` fetches from raw.githubusercontent.com and an unpublished id fails to install, silently (`ensureBundledPluginsInstalled` discards the result array).

```bash
cd /home/destin/youcoded-dev/wecoded-marketplace
git checkout -b feat/youcoded-chatsearch
git add youcoded-chatsearch overrides/youcoded-chatsearch.json marketplace.json index.json skills/index.json .claude-plugin/marketplace.json
git commit -m "$(cat <<'EOF'
feat(chatsearch): add the youcoded-chatsearch bundled plugin

A read-only CLI over the chatsearch index the app writes to
~/.youcoded/chatsearch/. Zero dependencies, Node stdlib only; it reads the
denormalized index files directly and holds no Conversation Store knowledge, so
the only thing it can drift from is the file format — which golden tests pin on
both sides.

Must merge BEFORE the app release that adds this id to BUNDLED_PLUGIN_IDS:
bundled plugins install over the network and an unpublished id fails silently.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
gh pr create --title "feat(chatsearch): add the youcoded-chatsearch bundled plugin" --body "Adds the read-only chatsearch CLI plugin. Companion to youcoded's feat/chatsearch-phase1. Must merge before the app release that bundles this id."
```

---

### Task 7: Bundle registration + cross-platform parity test

**Files:**
- Modify: `desktop/src/shared/bundled-plugins.ts`
- Modify: `/home/destin/youcoded-dev/youcoded/app/src/main/kotlin/com/youcoded/app/skills/BundledPlugins.kt`
- Create: `desktop/tests/bundled-plugins-parity.test.ts`

**Interfaces:**
- Consumes: the plugin id `youcoded-chatsearch` from Task 6.
- Produces: nothing downstream.

**Context:** no test today checks that the TypeScript and Kotlin lists match — `skill-provider-bundled.test.ts` never reads the Kotlin file, so parity is comment-enforced only. Adding a third entry is the moment to close that gap.

- [ ] **Step 1: Write the failing parity test**

Create `desktop/tests/bundled-plugins-parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUNDLED_PLUGIN_IDS } from '../src/shared/bundled-plugins';

// Both platforms auto-install bundled plugins from their own list. Until now the
// two lists were kept in sync by a comment only — a plugin added to one and not
// the other silently ships on one platform. This is the guard.
const KOTLIN_MIRROR = path.resolve(
  __dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'skills', 'BundledPlugins.kt'
);

describe('bundled plugin parity', () => {
  it('the Kotlin mirror exists where the parity comment says it does', () => {
    expect(fs.existsSync(KOTLIN_MIRROR)).toBe(true);
  });

  it('BundledPlugins.kt lists exactly the same ids in the same order', () => {
    const src = fs.readFileSync(KOTLIN_MIRROR, 'utf8');
    const block = src.match(/val\s+IDS\s*=\s*listOf\(([\s\S]*?)\)/);
    expect(block, 'could not find `val IDS = listOf(...)` in BundledPlugins.kt').not.toBeNull();

    const kotlinIds = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(kotlinIds).toEqual([...BUNDLED_PLUGIN_IDS]);
  });

  it('includes chatsearch on both platforms', () => {
    expect([...BUNDLED_PLUGIN_IDS]).toContain('youcoded-chatsearch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/bundled-plugins-parity.test.ts`
Expected: the first two tests PASS (the mirror exists and currently matches), the third FAILS — `youcoded-chatsearch` is in neither list. That is the correct starting state.

- [ ] **Step 3: Add the id to both lists**

In `desktop/src/shared/bundled-plugins.ts`:

```ts
export const BUNDLED_PLUGIN_IDS = [
  'wecoded-themes-plugin',
  'wecoded-marketplace-publisher',
  'youcoded-chatsearch',
] as const;
```

Update `BUNDLED_REASON` to stay accurate:

```ts
export const BUNDLED_REASON =
  'Bundled with YouCoded — required for theme customization, publishing, and conversation search.';
```

In `app/src/main/kotlin/com/youcoded/app/skills/BundledPlugins.kt`:

```kotlin
    val IDS = listOf(
        "wecoded-themes-plugin",
        "wecoded-marketplace-publisher",
        "youcoded-chatsearch",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run tests/bundled-plugins-parity.test.ts tests/skill-provider-bundled.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and verify gate**

Run: `cd /home/destin/youcoded-dev/worktrees/chatsearch/desktop && npx vitest run --reporter=dot`
Expected: no regressions against the 4081-test baseline.

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/chatsearch`

- [ ] **Step 6: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/chatsearch
git add desktop/src/shared/bundled-plugins.ts app/src/main/kotlin/com/youcoded/app/skills/BundledPlugins.kt desktop/tests/bundled-plugins-parity.test.ts
git commit -m "$(cat <<'EOF'
feat(chatsearch): bundle youcoded-chatsearch on both platforms

Adds a parity test that did not exist: skill-provider-bundled.test.ts never read
BundledPlugins.kt, so the two lists were kept in sync by a comment only and a
plugin added to one would silently ship on one platform.

RELEASE ORDER: the marketplace PR must merge before the release carrying this
commit — an unpublished id fails to install, silently.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan checklist

- [ ] All 7 tasks complete, each reviewed clean.
- [ ] Full desktop suite green against the 4081-test baseline.
- [ ] Marketplace PR merged **before** the app PR is released.
- [ ] Spec `docs/active/specs/2026-08-05-chat-search-design.md` phase-1 items reflect what shipped.
- [ ] `docs/MAP.md` gains a Chat Search row (entry points, rule, depth doc, guard tests).
- [ ] ROADMAP item for Phase 2 (writes/outbox) and Phase 3 (digests) captured.
