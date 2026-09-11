# Handoff: Write tool result echo garbling (investigate + fix)

## The problem

During the beta.75 pre-release session (2026-09-07), the `Write` tool's **result echo** — the text the assistant sees immediately after a Write — showed garbled content that did NOT match what was on disk. A stray paragraph was injected into the echoed text. Reading the file back with `Read` confirmed the file itself was clean; the corruption was only in the tool result.

This matters because the assistant trusts the tool result to decide what to do next. A garbled echo triggers unnecessary rewrites and Read-back cycles, costing tokens and time.

## Where it happens

`youcoded/desktop/src/main/harness/tools/write.ts`, line 142:

```ts
return {
  text: `${exists ? 'Overwrote' : 'Created'} ${args.file_path} (${args.content.length} chars). `
    + 'This counts as having Read it — you can Edit it now without reading it first.',
  structuredPatch: toHunks(lf(old), lf(args.content), args.file_path),
};
```

**Suspected root cause:** For a **new file**, `old` is `''` (empty string), so `toHunks('', content, path)` produces a diff of the entire file content against nothing. The `structuredPatch` is then serialized into the tool result alongside the `text` field. When the file is large (the session's `/tmp/youcoded-beta-notes.md` was ~1,300 chars), the diff is large enough that the tool-result serializer may corrupt the boundary between `text` and `structuredPatch` — or the renderer re-inserts diff content into the `text` display.

## The fix (two options, pick one)

**Option A (recommended):** Skip `structuredPatch` for new files — the entire content is new, so a diff is meaningless:

```ts
structuredPatch: exists ? toHunks(lf(old), lf(args.content), args.file_path) : undefined,
```

**Option B:** Keep `structuredPatch` but investigate why the serializer corrupts the `text` field on large diffs. The bug is likely in the tool-result rendering pipeline (`defineTool` → `composeNotice` → the IPC boundary → the renderer's ToolCard), not in `write.ts` itself.

## Where to look

- `youcoded/desktop/src/main/harness/tools/registry.ts` — `defineTool`, which wraps the raw result
- `youcoded/desktop/src/main/harness/tools/registry.ts` or wherever `composeNotice` lives — how `text` and `structuredPatch` are combined into the wire payload
- `youcoded/desktop/src/renderer/components/ToolCard.tsx` — how the tool result is rendered (the echo Destin sees)
- `youcoded/desktop/src/shared/types.ts` — `ToolResultPayload` shape

## How to reproduce

1. Start a dev instance: `bash scripts/run-dev.sh --label "Write Echo Test"`
2. In the dev instance, run a Write for a new file with moderately long content (~1,000+ chars, multiple paragraphs)
3. Check the tool result card in the dev UI — compare it against the actual file on disk
4. If the echo shows garbled content, you've reproduced it

## What to verify after fixing

- `npx vitest --run tests/write.test.ts` (if it exists; otherwise find the Write tests)
- `npx vitest --run tests/native-tools-polish.test.ts` (the wording pin)
- The dev instance repro: the tool result card should show only the "Created X (N chars)" sentence, no file content
- The renderer card should NOT show a diff for a new file (there's nothing to diff against)

## Context

- The Write tool's mtime guard and read-gate are at `write.ts:64-108`
- The `structuredPatch` is used by the renderer's ToolCard to show a diff; it's imported from `./edit.ts`
- The `preserveFormat` call (line 127) handles CRLF/BOM preservation — unrelated to this issue
- The omission-placeholder guard (lines 28-47) is also unrelated

## Session state

The session worktree is at `/home/destin/youcoded-dev/worktrees/sessions/prerelease-sep07/youcoded` (branch: `master`, latest: `8fbaea92`). The `bash.ts` changes from this session (hand-off message + timeout guidance) are in this worktree, uncommitted.
