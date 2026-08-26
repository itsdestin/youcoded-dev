---
status: draft
date: 2026-08-25
spec: docs/active/specs/2026-08-25-artifact-pane-size-limits-design.md
tags: [renderer, artifacts, ux, ipc, android]
---

# Artifact Pane Size Limits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the artifact pane refusing files it can display, and turn the text-size
limit from a wall into a readable partial view that can never be saved over the original.

**Architecture:** Three stages, ordered so nothing expensive is built before Destin has
seen what it looks like. **Stage 1** routes by file kind *before* asking for text, so
images/PDFs/Office docs never touch the text-editor's size gate — renderer-only, no
protocol change, independently shippable. **Stage 2A** builds every new screen against the
Workbench's fake backend and stops at a checkpoint. **Stage 2B** then changes what
`artifacts:get` actually returns, derives editability from file size, and makes *every*
path that updates the pane's text update its metadata with it. **Stage 2C** mirrors the
protocol change on Android. The remote stage is cancelled — see spec §4.6.

**Tech Stack:** TypeScript, React 18, Electron (main + preload + renderer), Vitest +
Testing Library (jsdom opt-in per file), Kotlin (Android mirror), Vite (UI Workbench).

## Global Constraints

- **Worktree:** `worktrees/artifact-size-limits`, branch `feat/artifact-size-limits`,
  `node_modules` hardlinked with `cp -al` (already set up). Never symlink it.
- **`EDIT_MAX_BYTES` is 3 MB** (spec D1, revised by Destin 2026-08-25). `FULL_READ_MAX_BYTES` follows it at 4x = 12 MB.
- **Every new/edited test file needs three things** or it will not run:
  1. `// @vitest-environment jsdom` as **line 1** for any test touching the DOM —
     `vitest.config.ts` sets `environment: 'node'` and `environmentMatchGlobs` was removed
     in Vitest 4 and is silently ignored.
  2. Explicit imports — `globals` is **not** enabled:
     `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';`
  3. `import '@testing-library/jest-dom/vitest';` in any file using `toBeInTheDocument`.
- **No `tooLarge` anywhere at the end of Stage 2B.** The proof command is
  `rg -n 'tooLarge' desktop/src desktop/tests app/src` — note **`desktop/tests` is
  included**; `tests/active-artifact-view.test.tsx:70` asserts on it today.
- **Every user-facing string must be specific-and-accurate or general-and-non-committal**
  (`docs/error-message-standards.md`). Size is stated as the *reason* only when size is
  the true reason for that file.
- **Annotate every non-trivial edit with a WHY comment** — Destin is a non-developer and
  reads the comments to understand the code (`CLAUDE.md`).
- **Three surfaces.** Any change to the `artifacts:get` response shape lands in
  `ipc-handlers.ts`, `SessionService.kt`, **and** `dev/workbench/mock-shim.ts`.
- **After any mock-shim change run `node scripts/workbench-boot-check.mjs`** from the
  workspace root.
- **Before claiming a desktop task done run `bash scripts/verify.sh worktrees/artifact-size-limits`**
  from the workspace root.
- **Do not merge or push.** Stop at the checkpoint and at the end; Destin decides when
  work lands.

## Status — 2026-08-25 (ALL TASKS COMPLETE)

**Every task (1–9) is implemented and committed** on `feat/artifact-size-limits`
(worktree `worktrees/artifact-size-limits`). Nothing is merged or pushed.

Stage 1 + 2A were reviewed by Destin in the Workbench at the checkpoint; Stages 2B and 2C
landed after it. **Outstanding before merge: Destin has not yet looked at the finished
feature running against the REAL backend** (`bash scripts/run-dev.sh`) — up to now the
partial view has only ever been seen against the Workbench's fake one.

| Commit | What |
|---|---|
| `d1d10687` | `rendersFromBytesOnly` (Task 1) |
| `0aeb4d7a` | hook + watcher skip the text read for byte-only files (Task 2) |
| `69143023` | Workbench over-cap fixtures (Task 3) |
| `3aea7e76` | partial-view banner (Task 4) |
| `cc3537ed` | honest handoff copy (Task 5) |
| `94a05602` | checkpoint fixes: `truncated` plumbing, real footer size, mp4 fixture |
| `8c098c84` | checkpoint fixes: over-cap files read-only everywhere; banner moved to bottom bar |
| `e7f2d42b` | cap raised to 3 MB; banner copy shortened |
| `0b6707e2` | `textPrefix` + `decideOverCapRead`, pure and pinned (Task 6) |
| `42906ca1` | `artifacts:get` sniffs the head; `{ full }` through both transports (Task 7) |
| `7e14cca1` | every content update carries its metadata; `tooLarge` retired (Task 8) |
| `5c797056` | Android mirrors the head sniff and text prefix (Task 9) |
| `3619d93e` | the Workbench mock refuses a full read above the ceiling, like main |

**Four defects were found by *looking at it*, all of which passed every test that existed
at the time.** They are the argument for keeping the checkpoint before the backend:

1. `useArtifactContent` dropped `truncated` when copying the response into `contentInfo`,
   so the banner never rendered for any file. Nothing errored.
2. The drawer footer measured the string in memory, so an 8.4 MB file served as a prefix
   reported `400 B`.
3. The Workbench mock answered `orphan: true` for any fixture with no text body, so the
   `.mp4` fixture rendered "no longer on disk" instead of the format handoff.
4. **The Edit button still showed on a file served as a prefix** — the data-loss hole this
   design exists to close, sitting under a banner that said "Read-only". Task 8's
   editability half was pulled forward to fix it.

**Decisions Destin made at the checkpoint** (spec §9 questions, now answered):

- **Editing above the cap: never**, including after "Load the whole file".
- **`EDIT_MAX_BYTES` = 3 MB** (was 2 MB — revises spec D1, which had recorded 2 MB as
  settled by measurement). `FULL_READ_MAX_BYTES` follows at 4x = **12 MB**.
- **Banner**: a panel-width bar floating over the *bottom* of the pane, in the spot the
  Edit pill vacates, with the action as a pressable pill on its right end. Copy:
  *"Large File — Showing 3.0/8.4 MB"*.
- Sizes stay MiB-based; "Open in default app" stays the above-ceiling escape.

**Verification state**

- `bash scripts/verify.sh worktrees/artifact-size-limits` — all green.
- Android: `176 tests, 0 failures across 19 classes` on a forced rerun
  (`--rerun-tasks`), including all six mirrored `textPrefix` cases.
- `node scripts/workbench-boot-check.mjs 5243` — 12/12 routes clean.
- Every regression test added in this workstream was verified to **fail without its fix**.
- `tests/harness-eval-orchestrator.test.ts` fails identically on a clean `origin/master`
  worktree. **Pre-existing, verified, not this work.** Don't chase it.

**Android build-environment note** (nothing to do with this change): `./gradlew` here needs
`ANDROID_HOME=~/.android-sdk`, `JAVA_HOME=/usr/lib/jvm/java-21-openjdk` (AGP's jlink
transform rejects the machine's default JDK 26), and `-x bundleWebUi` (that task packages
the *desktop* app, which needs `rpmbuild`). `node_modules` in the worktree and the main
checkout were both confirmed intact at 640 entries afterwards.

## Verified facts this plan relies on

Checked against `youcoded@df96b4a5` by two independent passes:

- `EditTier` **is** exported (`editable-path-policy.ts:23`); `looksBinary` **does** exist
  in Kotlin (`EditablePathPolicy.kt:74`, takes `ByteArray`); `Button` accepts
  `size="sm"` (`Button.tsx:18`); `getPlatform()` reads `window.__PLATFORM__` live.
- `READ_BINARY_MAX_BYTES` is a **function-local const inside the main-process handler**
  (`ipc-handlers.ts:3772`) — not exported, not importable from the renderer. Task 5
  promotes it.
- `ArtifactViewProps` (`artifact-views/types.ts`) has **no** `contentInfo`, and
  `ActiveArtifactView.tsx:507-519` does **not** spread it into `<ViewerComponent>`.
- `tests/renderer-registry.test.ts` and `tests/artifact-editing.test.tsx` **do not exist**.
  The live harnesses are `tests/active-artifact-view.test.tsx` (`mountView` at `:19`) and
  `tests/artifact-content-loading.test.tsx` (`changedCb` watcher capture at `:53`,
  controllable `pending[]` reads at `:50`).
- The `tooLarge` early-return block is at `ActiveArtifactView.tsx:397-412`. Deleting it
  changes no other file kind's state precedence — it is fully guarded on the flag, which
  only ever arrives with `phase: 'ready'`.
- Adding an optional third argument to `artifacts.get` breaks **no** existing caller. The
  five call sites are `ArtifactThumbnail.tsx:141`, `ActiveArtifactView.tsx:234,259,297`,
  `useArtifactContent.ts:67`.
- `remote-shim.ts:1227` invokes `artifacts:get` with an **object** payload, not
  positional args.

---

## File Structure

**Stage 1**
| File | Responsibility |
|---|---|
| `.../artifact-views/RendererRegistry.ts` | `rendersFromBytesOnly(path)`, derived from the registry itself |
| `.../artifact-views/useArtifactContent.ts` | skip the text fetch for those files |
| `.../artifact-views/ActiveArtifactView.tsx` | gate the on-disk watcher on the same predicate |
| `SessionDrawer.tsx`, `.../tabs/FilesTab.tsx` | pass the artifact's `path` into the hook |

**Stage 2A (UI only — fake backend)**
| File | Responsibility |
|---|---|
| `dev/workbench/mock-shim.ts`, `dev/workbench/fixtures/artifacts.ts` | over-cap fixtures so the new states are visible |
| `.../artifact-views/PartialFileBanner.tsx` (new) | the partial-view notice, a flex sibling like the conflict banner |
| `.../artifact-views/types.ts`, `ActiveArtifactView.tsx` | thread `contentInfo` into viewers |
| `.../artifact-views/BinaryFallback.tsx`, `BinaryContent.tsx` | honest handoff copy + the action button that was only ever named |
| `shared/artifacts/editable-path-policy.ts` | promote `READ_BINARY_MAX_BYTES`, add `FULL_READ_MAX_BYTES` |

**Stage 2B (backend)**
| File | Responsibility |
|---|---|
| `shared/artifacts/over-cap-read.ts` (new) | `textPrefix()` + `decideOverCapRead()` — the real branch, pure and testable |
| `main/ipc-handlers.ts` | call `decideOverCapRead`; `sizeBytes` on every response; honour `{ full }` |
| `main/preload.ts`, `renderer/remote-shim.ts` | thread `opts` (shim uses an object payload) |
| `.../artifact-views/edit-permission.ts` (new) | `canEditArtifact()` — the one editability predicate |
| `.../artifact-views/useArtifactContent.ts`, `ActiveArtifactView.tsx` | `applyDiskRead` as the **only** way content changes |
| `ArtifactThumbnail.tsx` | slice over-cap text so a 2 MB string never lands in thumbnail state |

**Stage 2C** — `EditablePathPolicy.kt`, `SessionService.kt`.

---

# Stage 1 — the reported bug

## Task 1: `rendersFromBytesOnly`, derived from the registry

**Files:**
- Modify: `desktop/src/renderer/components/artifact-views/RendererRegistry.ts`
- Create: `desktop/tests/renderer-registry.test.ts` (the module has no coverage today)

**Interfaces:**
- Produces: `export function rendersFromBytesOnly(path: string): boolean`

- [x] **Step 1: Write the failing test**

Create `desktop/tests/renderer-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rendersFromBytesOnly } from '../src/renderer/components/artifact-views/RendererRegistry';

describe('rendersFromBytesOnly', () => {
  it('is true for formats whose viewer reads its own bytes', () => {
    for (const p of ['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'a.bmp',
                     'a.ico', 'a.avif', 'a.pdf', 'a.docx', 'a.xlsx']) {
      expect(rendersFromBytesOnly(p)).toBe(true);
    }
  });

  // SVG renders through ImageView but IS text and IS editable today — it must
  // keep the text fetch or the pencil disappears (spec D5).
  it('is false for svg', () => {
    expect(rendersFromBytesOnly('logo.svg')).toBe(false);
  });

  it('is false for text and unknown extensions', () => {
    for (const p of ['a.md', 'a.ts', 'a.csv', 'a.html', 'a.rs', 'Makefile', '']) {
      expect(rendersFromBytesOnly(p)).toBe(false);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd worktrees/artifact-size-limits/desktop && npx vitest run tests/renderer-registry.test.ts`
Expected: FAIL — `rendersFromBytesOnly is not a function`.

- [x] **Step 3: Implement, deriving from the registry rather than a second list**

Add to `RendererRegistry.ts` **after** the `TEXT_CONTENT_VIEWERS` declaration (`:78`), so
both references resolve:

```ts
// Files whose viewer fetches its OWN bytes (BinaryContent → artifacts:read-binary)
// and whose format is not text. For these the artifacts:get text fetch is pure
// waste — and worse, it applied the TEXT EDITOR's 2 MB cap to a 2.3 MB photo and
// refused it (spec §1.1).
//
// Derived from REGISTRY + TEXT_CONTENT_VIEWERS rather than a second hand-kept
// extension list, so the two can never drift and any future binary viewer is
// covered automatically.
//
// SVG is the one deliberate exception: it renders through ImageView but is text
// and is editable today, so it keeps the text fetch or the pencil vanishes (D5).
export function rendersFromBytesOnly(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'svg') return false;
  const hit = REGISTRY[ext];
  return !!hit && !TEXT_CONTENT_VIEWERS.has(hit);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer-registry.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/RendererRegistry.ts desktop/tests/renderer-registry.test.ts
git commit -m "feat(artifacts): add rendersFromBytesOnly — which viewers read their own bytes"
```

---

## Task 2: skip the text fetch, and stop the watcher re-opening it

**Files:**
- Modify: `.../artifact-views/useArtifactContent.ts` (signature + effect)
- Modify: `.../artifact-views/ActiveArtifactView.tsx:236-244` (watcher gate)
- Modify: `SessionDrawer.tsx:180`, `.../tabs/FilesTab.tsx:718`
- Test: extend `desktop/tests/artifact-content-loading.test.tsx` (has the `changedCb` and
  `pending[]` harness this needs — do **not** build a new one)

**Interfaces:**
- Consumes: `rendersFromBytesOnly(path)` from Task 1.
- Produces: `useArtifactContent(projectRoot, artifactId, artifactPath?)` — third argument
  optional so every existing caller and test keeps compiling.

*Folded together because they are one fix: the hook closes the front door and the watcher
closes the back door, and Stage 1 is not shippable with only one of them.*

- [x] **Step 1: Write the failing tests**

Append to `desktop/tests/artifact-content-loading.test.tsx` (its header already declares
jsdom and imports `vi`/`describe`/`it`/`expect`; add `renderHook`/`waitFor` to its
`@testing-library/react` import if absent):

```tsx
describe('byte-only files never take the text path', () => {
  // THE REPORTED BUG: a 2.3 MB PNG was refused by the TEXT editor's 2 MB cap,
  // even though images are governed by the 50 MB byte ceiling and never use the
  // text at all.
  it('does not call artifacts.get for a png', async () => {
    const { result } = renderHook(() => useArtifactContent('/proj', 'a1', 'shot.png'));
    await waitFor(() => expect(result.current.contentState.phase).toBe('ready'));
    expect(get).not.toHaveBeenCalled();
    expect(result.current.content).toBeNull();
    // binary:true is what holds the edit affordance shut downstream.
    expect(result.current.contentInfo?.binary).toBe(true);
  });

  it('still calls artifacts.get for svg, which is editable', async () => {
    renderHook(() => useArtifactContent('/proj', 'a2', 'logo.svg'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  });

  it('still calls artifacts.get when no path is supplied', async () => {
    renderHook(() => useArtifactContent('/proj', 'a3'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  });

  // The back door: the watcher re-requests text on EVERY on-disk change for
  // EVERY file type. Its `res.content ?? ''` would set an IMAGE's content to the
  // empty string, which downstream reads as an ordinary editable text file.
  it('does not call artifacts.get when an image changes on disk', () => {
    render(
      <ActiveArtifactView
        artifact={{ id: 'a1', kind: 'internal', path: 'shot.png' } as any}
        content={null}
        contentInfo={{ binary: true }}
        contentState={{ phase: 'ready' }}
        projectRoot="/proj" projectId="p1" projectName="Proj" sessionId="s1"
        onContentChange={vi.fn()}
      />
    );
    get.mockClear();
    changedCb!({ projectRoot: '/proj', artifactId: 'a1', kind: 'change' });
    expect(get).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/artifact-content-loading.test.tsx -t "byte-only"`
Expected: FAIL — `get` was called.

- [x] **Step 3: Implement the hook change**

In `useArtifactContent.ts` add `import { rendersFromBytesOnly } from './RendererRegistry';`
and change the signature:

```ts
export function useArtifactContent(
  projectRoot: string,
  artifactId: string | null | undefined,
  // The file's path — needed to answer "does this file's viewer read its own
  // bytes?" BEFORE we ask for text. Optional so older callers keep working.
  artifactPath?: string | null,
): UseArtifactContentResult {
```

Inside the effect, immediately after the `if (!artifactId) { … return; }` block:

```ts
    // Images/PDFs/Office docs render through BinaryContent → artifacts:read-binary,
    // which has its OWN 50 MB ceiling. Asking artifacts:get for their text was
    // pure waste AND applied the text editor's 2 MB cap to them — the reported
    // bug (spec §4.1). Settle straight into the exact shape an under-cap binary
    // read already produces, so every consumer downstream is unchanged: no new
    // content phase, and binary:true still holds the edit affordance shut.
    if (artifactPath && rendersFromBytesOnly(artifactPath)) {
      setContent(null);
      setContentInfo({ binary: true });
      setContentState({ phase: 'ready' });
      return;
    }
```

Add `artifactPath` to the effect deps: `[projectRoot, artifactId, artifactPath, retryToken]`.

- [x] **Step 4: Implement the watcher gate**

In `ActiveArtifactView.tsx` add `import { rendersFromBytesOnly } from './RendererRegistry';`
and, in the watcher effect immediately after `if (evt.kind === 'remove') return;`:

```ts
      // These files render from their own bytes, never from `content`. Asking
      // artifacts:get here would re-open the text path we just closed — and its
      // `res.content ?? ''` would set an IMAGE's content to the empty string
      // (spec §4.1).
      if (rendersFromBytesOnly(artifact.path)) return;
```

- [x] **Step 5: Wire both hosts**

`SessionDrawer.tsx:180` → `useArtifactContent(projectRoot, active?.id ?? null, active?.path ?? null);`
`FilesTab.tsx:718` → `useArtifactContent(project.path, artifact.id, artifact.path);`

- [x] **Step 6: Run tests and verify the whole desktop side**

Run: `npx vitest run tests/artifact-content-loading.test.tsx` → PASS.
Run from the workspace root: `bash scripts/verify.sh worktrees/artifact-size-limits` → all green.

- [x] **Step 7: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/useArtifactContent.ts \
        desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx \
        desktop/src/renderer/components/SessionDrawer.tsx \
        desktop/src/renderer/components/project-view/tabs/FilesTab.tsx \
        desktop/tests/artifact-content-loading.test.tsx
git commit -m "fix(artifacts): stop refusing images by the text editor's size cap"
```

**Stage 1 is now independently shippable.**

---

# Stage 2A — build the screens first, against the fake backend

Nothing in this stage touches the main process, the protocol, or Kotlin. It exists so the
checkpoint comes **before** the expensive work, not after it.

## Task 3: Workbench fixtures for the over-cap states

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts:626-639`
- Modify: `desktop/src/renderer/dev/workbench/fixtures/artifacts.ts:8` (shape comment) and
  its artifact list + `CONTENT` map

- [x] **Step 1: Add the fixtures**

Above the `get` entry in `mock-shim.ts`:

```ts
// artifactId → pretend on-disk size, for exercising the over-cap states in the
// Workbench without a real 8 MB file (spec §5 checkpoint).
const OVERSIZE_FIXTURES: Record<string, number> = {
  'big-log': 8_400_000,      // under FULL_READ_MAX_BYTES → offers "Load the whole file"
  'huge-dump': 500_000_000,  // above it → offers the default-app handoff
};
```

Replace `get`:

```ts
    get: async (_projectRoot: string, artifactId: string, opts?: { full?: boolean }) => {
      const content = ARTIFACT_CONTENT[artifactId];
      if (content === undefined) {
        return { ok: true, content: null, orphan: true, binary: false, sizeBytes: 0 };
      }
      const fake = OVERSIZE_FIXTURES[artifactId];
      if (fake && !opts?.full) {
        return { ok: true, content: content.slice(0, 400), orphan: false, binary: false,
                 truncated: true, sizeBytes: fake, mtimeMs: 1 };
      }
      return { ok: true, content, orphan: false, binary: false,
               truncated: false, sizeBytes: fake ?? content.length, mtimeMs: 1 };
    },
```

> `tooLarge` is **left in place here for now** — it is removed everywhere at once in
> Task 8, so no intermediate commit has half the codebase on each shape.

- [x] **Step 2: Add the matching artifacts**

In `fixtures/artifacts.ts` add three artifacts and their `CONTENT` entries:
`big-log` (`server.log`), `huge-dump` (`memory.txt`), and `clip-mp4` (`clip.mp4`, with no
`CONTENT` entry — it exercises the format handoff). Update the shape comment at `:8` to
`{ ok, content, binary?, truncated?, sizeBytes? }`.

- [x] **Step 3: Boot-check**

Run from the workspace root: `node scripts/workbench-boot-check.mjs`
Expected: all seven routes load, no console error.

- [x] **Step 4: Commit**

```bash
git add desktop/src/renderer/dev/workbench/
git commit -m "chore(workbench): fixtures for the over-cap artifact states"
```

---

## Task 4: the partial-view banner

**Files:**
- Create: `.../artifact-views/PartialFileBanner.tsx`
- Modify: `.../artifact-views/ActiveArtifactView.tsx` (`ArtifactContentInfo`, one JSX
  sibling, one hook)
- Modify: `shared/artifacts/editable-path-policy.ts` (add `FULL_READ_MAX_BYTES`)
- Test: `desktop/tests/partial-file-banner.test.tsx` (new)

**Interfaces:**
- Produces: `<PartialFileBanner sizeBytes onLoadFull onOpenExternally />`;
  `ArtifactContentInfo` gains `truncated?: boolean`;
  `export const FULL_READ_MAX_BYTES: number`.

**SHIPPED, then revised at the checkpoint.** The banner is NOT the top strip described
below: it is a panel-width bar floating over the *bottom* of the pane (`absolute bottom-4
left-4 right-4`), styled like the Edit/Save pills it stands in for, with the action as a
pressable pill on its right end. Copy is *"Large File — Showing 3.0/8.4 MB"*. See
`PartialFileBanner.tsx` for the shipped version; the code below is the superseded draft.

- [x] **Step 1: Add the constant**

In `shared/artifacts/editable-path-policy.ts`, beside `EDIT_MAX_BYTES`:

```ts
/** Ceiling on "Load the whole file" (spec §4.3). Deliberately expressed as a
 * multiple of the cap rather than an independent magic number: it means "we will
 * load at most four times what we promise to show instantly". A starting value,
 * not a measurement — flagged for Destin at the plan's checkpoint. Past this the
 * renderer blocks long enough to feel frozen, which is what EDIT_MAX_BYTES exists
 * to prevent in the first place. */
export const FULL_READ_MAX_BYTES = 4 * EDIT_MAX_BYTES; // 8 MB
```

- [x] **Step 2: Write the failing test**

Create `desktop/tests/partial-file-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PartialFileBanner } from '../src/renderer/components/artifact-views/PartialFileBanner';

afterEach(cleanup);

// Sizes are MiB-based, matching every existing size string in the app (the
// message Destin saw called his 2,411,724-byte file "2.3 MB").
describe('PartialFileBanner', () => {
  it('states both sizes so the notice is information, not a refusal', () => {
    render(<PartialFileBanner sizeBytes={8.4 * 1024 * 1024} onLoadFull={() => {}} onOpenExternally={() => {}} />);
    expect(screen.getByText(/first 2\.0 MB of 8\.4 MB/)).toBeInTheDocument();
  });

  it('offers to load the rest while the file is under the full-read ceiling', () => {
    render(<PartialFileBanner sizeBytes={4 * 1024 * 1024} onLoadFull={() => {}} onOpenExternally={() => {}} />);
    expect(screen.getByRole('button', { name: /load the whole file/i })).toBeInTheDocument();
  });

  it('offers no load action above the ceiling', () => {
    render(<PartialFileBanner sizeBytes={500 * 1024 * 1024} onLoadFull={() => {}} onOpenExternally={() => {}} />);
    expect(screen.queryByRole('button', { name: /load the whole file/i })).toBeNull();
  });

  // A button that silently does nothing is worse than no button (spec §4.3).
  it('offers no action at all on a platform without shell.openPath', () => {
    (window as any).__PLATFORM__ = 'browser';
    render(<PartialFileBanner sizeBytes={500 * 1024 * 1024} onLoadFull={() => {}} onOpenExternally={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    (window as any).__PLATFORM__ = 'electron';
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/partial-file-banner.test.tsx`
Expected: FAIL — module not found.

- [x] **Step 4: Implement the banner**

Create `PartialFileBanner.tsx`:

```tsx
import { getPlatform } from '../../platform';
import { Button } from '../ui';
import { EDIT_MAX_BYTES, FULL_READ_MAX_BYTES } from '../../../shared/artifacts/editable-path-policy';

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Shown above a text viewer holding only the first EDIT_MAX_BYTES of a larger
 * file. It is a flex SIBLING of the viewer box (shrink-0), exactly like the
 * conflict and save-error banners already are — NOT `sticky`, and NOT wrapped in
 * a new scroll container. The viewer box owns the only scroll context; a banner
 * outside it cannot scroll away, which is the whole requirement.
 *
 * States a size because the size is information the user can act on — never as
 * the reason the app "won't" do something (docs/error-message-standards.md).
 */
export function PartialFileBanner({ sizeBytes, onLoadFull, onOpenExternally }: {
  sizeBytes: number;
  onLoadFull: () => void;
  onOpenExternally: () => void;
}) {
  const canLoadFull = sizeBytes <= FULL_READ_MAX_BYTES;
  // shell.openPath is desktop-only — the remote shim stubs it as a no-op and
  // Android has no handler, so the button would silently do nothing there.
  const isElectron = getPlatform() === 'electron';
  return (
    <div className="shrink-0 flex items-center gap-3 p-3 text-sm border-b border-border bg-bg-2 text-fg-2">
      <span>Showing the first {mb(EDIT_MAX_BYTES)} of {mb(sizeBytes)}. Read-only.</span>
      {canLoadFull && <Button size="sm" onClick={onLoadFull}>Load the whole file</Button>}
      {!canLoadFull && isElectron && (
        <Button size="sm" onClick={onOpenExternally}>Open in default app</Button>
      )}
    </div>
  );
}
```

- [x] **Step 5: Render it, without adding containers**

In `ActiveArtifactView.tsx`:

Extend `ArtifactContentInfo` (`:68-72`) — **additive only; `tooLarge` stays until Task 8**:

```ts
  /** The content is only the first EDIT_MAX_BYTES of a larger file — drives the
   *  partial-view banner. Does NOT gate saving; size does (edit-permission.ts). */
  truncated?: boolean;
```

Add the prop `onDiskRead?: (res: any) => void;` to `ActiveArtifactViewProps` (Task 8 makes
it load-bearing; declaring it here keeps Task 4's `loadFull` honest).

Add `loadFull` **with the other hooks, above `:394`** — never below the early returns at
`:422/:431/:435`, which would make it a conditionally-called hook and fail lint:

```ts
  // Re-ask WITHOUT the cap. Main still refuses above FULL_READ_MAX_BYTES, so
  // this can never become an unbounded read (spec §4.3).
  const loadFull = useCallback(() => {
    (window.claude as any).artifacts.get(projectRoot, artifact.id, { full: true })
      .then((res: any) => { if (onDiskRead) onDiskRead(res); });
  }, [projectRoot, artifact.id, onDiskRead]);
```

Inside the existing root `<div ref={rootRef} className="h-full flex flex-col">` (`:446`),
immediately **before** the existing `<div className="flex-1 overflow-hidden">` (`:501`),
add the banner as a sibling — no new wrappers:

```tsx
      {showPartialBanner && (
        <PartialFileBanner
          sizeBytes={contentInfo!.sizeBytes!}
          onLoadFull={loadFull}
          onOpenExternally={() => (window.claude as any).shell?.openPath?.(absolutePath)}
        />
      )}
```

with, next to `ViewerComponent` (`:382`):

```ts
  // Only text viewers render from `content`, so only they can be showing a
  // PREFIX. An over-cap .svg or .html takes the text path (SVG is editable, D5)
  // but renders from its own bytes / a srcDoc — a banner there would announce a
  // partial view of something complete.
  const showPartialBanner = !editing
    && contentInfo?.truncated === true
    && typeof contentInfo.sizeBytes === 'number'
    && isTextContentViewer(ViewerComponent);
```

Export `isTextContentViewer` from `RendererRegistry.ts`:

```ts
/** True when this viewer renders from the `content` string (and can therefore
 *  be showing only a prefix), as opposed to reading its own bytes. */
export function isTextContentViewer(v: unknown): boolean {
  return TEXT_CONTENT_VIEWERS.has(v as any);
}
```

- [x] **Step 6: Run tests, and eyeball it in the Workbench**

Run: `npx vitest run tests/partial-file-banner.test.tsx` → PASS (4 tests).
Run from the workspace root: `bash scripts/run-workbench.sh`, open `big-log` and
`huge-dump`, confirm the banner renders and the viewer below it still scrolls.

- [x] **Step 7: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/PartialFileBanner.tsx \
        desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx \
        desktop/src/renderer/components/artifact-views/RendererRegistry.ts \
        desktop/src/shared/artifacts/editable-path-policy.ts \
        desktop/tests/partial-file-banner.test.tsx
git commit -m "feat(artifacts): partial-view banner for big text files"
```

---

## Task 5: honest handoff copy

**Files:**
- Modify: `shared/artifacts/editable-path-policy.ts` (promote `READ_BINARY_MAX_BYTES`)
- Modify: `main/ipc-handlers.ts:3772` (import it instead of declaring it)
- Modify: `.../artifact-views/types.ts` (add `contentInfo`)
- Modify: `ActiveArtifactView.tsx:507-519` (pass `contentInfo` to the viewer)
- Modify: `.../artifact-views/BinaryFallback.tsx`, `BinaryContent.tsx`
- Test: `desktop/tests/binary-handoff.test.tsx` (new)

**Why:** `BinaryFallback` says *"Cannot preview this file type"* even when the real reason
is size, and `BinaryContent`'s over-size branch tells the user to *"use 'Open externally'"*
next to a component that renders **no button at all**. Both are misleading strings.

- [x] **Step 1: Promote the constant**

Move `READ_BINARY_MAX_BYTES` out of the handler body into
`shared/artifacts/editable-path-policy.ts`:

```ts
/** Ceiling for artifacts:read-binary — base64 inflates 33% and it all transits
 *  IPC/WS. This is the limit that actually governs images, PDFs and Office docs;
 *  EDIT_MAX_BYTES governs only the text editor (spec §1.1). */
export const READ_BINARY_MAX_BYTES = 50 * 1024 * 1024;
```

and import it in `ipc-handlers.ts`, deleting the local `const`.

- [x] **Step 2: Thread `contentInfo` to the viewers**

In `artifact-views/types.ts` add to `ArtifactViewProps`:

```ts
  /** Read metadata from artifacts:get — BinaryFallback needs sizeBytes to say
   *  whether the reason is the format or the size. */
  contentInfo?: ArtifactContentInfo | null;
```

and in `ActiveArtifactView.tsx:507-519` add `contentInfo={contentInfo}` to the
`<ViewerComponent … />` spread. **Without this the new message can never fire.**

- [x] **Step 3: Write the failing tests**

Create `desktop/tests/binary-handoff.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BinaryFallback } from '../src/renderer/components/artifact-views/BinaryFallback';
import { describeBytesError } from '../src/renderer/components/artifact-views/BinaryContent';

afterEach(cleanup);

describe('handoff copy', () => {
  it('names the format, not a generic refusal', () => {
    render(<BinaryFallback path="clip.mp4" absolutePath="/root/clip.mp4"
                           content={null} isEditable={false} contentInfo={null} />);
    expect(screen.getByText(/can’t display \.mp4 files/i)).toBeInTheDocument();
  });

  it('states size only when size is the true reason', () => {
    render(<BinaryFallback path="raw.bin" absolutePath="/root/raw.bin"
                           content={null} isEditable={false}
                           contentInfo={{ sizeBytes: 214 * 1024 * 1024, binary: true }} />);
    expect(screen.getByText(/214\.0 MB — larger than YouCoded can display/)).toBeInTheDocument();
  });

  it('never points at a control that is not on screen', () => {
    expect(describeBytesError('too-large', 'image')).not.toMatch(/open externally/i);
  });
});
```

- [x] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/binary-handoff.test.tsx`
Expected: FAIL — old copy; `describeBytesError` not exported.

- [x] **Step 5: Implement**

`BinaryFallback.tsx` — replace `<p className="mb-4">Cannot preview this file type.</p>`:

```tsx
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const size = contentInfo?.sizeBytes;
  // State the TRUE reason. Size is the reason only when the file is genuinely
  // past what we can load; otherwise the reason is the format — and saying "too
  // large" about a 2.3 MB PNG was the bug that started all this (spec §4.5).
  const message = size && size > READ_BINARY_MAX_BYTES
    ? `This file is ${(size / (1024 * 1024)).toFixed(1)} MB — larger than YouCoded can display.`
    : ext && path.includes('.')
      ? `YouCoded can’t display .${ext} files.`
      : 'YouCoded can’t display this kind of file.';
```

`BinaryContent.tsx` — add `import { getPlatform } from '../../platform';` and
`import { Button } from '../ui';`, export `describeBytesError`, rewrite its `'too-large'`
branch, and render the action it always claimed to have:

```ts
export function describeBytesError(error: string, noun: string): string {
  switch (error) {
    case 'orphan': return `This ${noun} no longer exists on disk.`;
    // Was: "…use “Open externally”" — a control this component does not render.
    case 'too-large': return `This ${noun} is larger than YouCoded can display.`;
    case 'not-allowed': return `This ${noun} is outside your project folders and can’t be previewed.`;
    case 'unavailable': return `Preview isn’t available on this platform.`;
    default: return `Couldn’t open this ${noun}.`;
  }
}
```

```tsx
  if (error || !bytes) {
    // The action the old copy pointed at but never rendered. Desktop-only for the
    // same reason BinaryFallback gates it: shell.openPath is a no-op on remote
    // and absent on Android.
    const isElectron = getPlatform() === 'electron';
    return (
      <CenterNote>
        <div className="flex flex-col items-center gap-3">
          <span>{describeBytesError(error ?? 'read-failed', noun)}</span>
          {isElectron && (
            <Button size="sm" onClick={() => (window.claude as any).shell?.openPath?.(absolutePath)}>
              Open in default app
            </Button>
          )}
        </div>
      </CenterNote>
    );
  }
```

- [x] **Step 6: Run tests and verify**

Run: `npx vitest run tests/binary-handoff.test.tsx` → PASS.
Run from the workspace root: `bash scripts/verify.sh worktrees/artifact-size-limits` → green.

- [x] **Step 7: Commit**

```bash
git add desktop/src/shared/artifacts/editable-path-policy.ts desktop/src/main/ipc-handlers.ts \
        desktop/src/renderer/components/artifact-views/ desktop/tests/binary-handoff.test.tsx
git commit -m "fix(artifacts): handoff copy states the real reason and offers a real action"
```

---

## ✅ CHECKPOINT — DONE (2026-08-25)

Destin reviewed the four states in the Workbench and signed off. His answers are recorded
in the Status block at the top of this plan; the four defects the review surfaced are
recorded there too and are all fixed and pinned.

**Original instructions, kept for the record.** Stop here. Everything user-visible now renders from the fake backend. Nothing in the
main process, the protocol, or Kotlin has been touched, so redirecting the design costs
nothing but this stage.

- [ ] **Step 1:** `bash scripts/run-workbench.sh`
- [ ] **Step 2:** Give Destin the URL and the four states: `big-log` (banner + **Load the
      whole file**), `huge-dump` (banner + **Open in default app**), `clip.mp4` (format
      handoff), an over-50-MB fixture (size handoff).
- [ ] **Step 3:** Put the open questions below to him. Revise in the Workbench and amend
      Tasks 4/5 rather than piling fixups.

**Open questions for this checkpoint — none of these are decided:**

1. **Should a fully loaded big file be editable?** The plan says no (the cap exists because
   CodeMirror on a multi-MB string blocks the renderer). But once the whole file is in the
   renderer, that cost has already been paid — so "read-only forever" is a taste call, not
   a technical necessity. Cheap to flip; expensive to flip after Stage 2B.
2. **`FULL_READ_MAX_BYTES = 8 MB** (four times the cap). A starting value, not a
   measurement. It decides only whether the **Load the whole file** button appears.
3. **Sizes are MiB-based** ("8.4 MB" means 8.4 × 1024²), matching every existing size
   string in the app. Most file browsers use decimal, so YouCoded will read ~5% smaller
   than the OS for the same file.
4. **"Open in default app" is the only offer above the ceiling** — which is the app
   ejecting the user, the thing spec §1.2 calls the opposite of the Comprehensive
   Workspace pillar. Accepted here only because nothing better exists yet.
5. **Banner wording**: *"Showing the first 2.0 MB of 8.4 MB. Read-only."*

---

# Stage 2B — the backend

## ✅ Task 6 — DONE: `textPrefix` + `decideOverCapRead`

**Files:**
- Create: `desktop/src/shared/artifacts/over-cap-read.ts`
- Test: `desktop/tests/over-cap-read.test.ts` (new)

**Interfaces:**
- Produces:
  - `export function textPrefix(buf: Uint8Array, maxBytes: number): string`
  - `export function decideOverCapRead(head: Uint8Array, window: Uint8Array, sizeBytes: number):
    { content: string | null; binary: boolean; truncated: boolean }`

*The real branch lives here, and `ipc-handlers.ts` calls it — so the test exercises the
shipped decision rather than a copy of it re-implemented inside the test file.*

- [x] **Step 1: Write the failing test**

Create `desktop/tests/over-cap-read.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { textPrefix, decideOverCapRead } from '../src/shared/artifacts/over-cap-read';

const enc = new TextEncoder();

describe('textPrefix', () => {
  it('cuts back to the last newline so no line is shown half-written', () => {
    expect(textPrefix(enc.encode('alpha\nbravo\ncharlie-cut'), 20)).toBe('alpha\nbravo\n');
  });

  it('returns everything when the buffer already fits', () => {
    expect(textPrefix(enc.encode('alpha\nbravo\n'), 999)).toBe('alpha\nbravo\n');
  });

  // Minified JS and one-line JSON have NO newline. The newline rule alone would
  // return an empty string and a blank pane.
  it('falls back to a character boundary when there is no newline at all', () => {
    expect(textPrefix(enc.encode('x'.repeat(100)), 40)).toBe('x'.repeat(40));
  });

  // A short header line followed by one enormous line would otherwise yield a
  // five-byte pane under a banner claiming to show 2 MB.
  it('ignores a newline that would throw away most of the window', () => {
    const buf = enc.encode('head\n' + 'x'.repeat(200));
    expect(textPrefix(buf, 100).length).toBe(100);
  });

  it('never splits a multi-byte character', () => {
    const buf = enc.encode('x'.repeat(40) + 'é' + 'x'.repeat(40)); // é = C3 A9
    expect(textPrefix(buf, 41)).toBe('x'.repeat(40));
    expect(textPrefix(buf, 42)).toBe('x'.repeat(40) + 'é');
  });

  it('returns an empty string for an empty buffer', () => {
    expect(textPrefix(new Uint8Array(0), 10)).toBe('');
  });
});

describe('decideOverCapRead', () => {
  it('hands an over-cap binary file to the handoff, not the text path', () => {
    const head = new Uint8Array(64); head[10] = 0; // a NUL makes it binary
    const res = decideOverCapRead(head, head, 9_000_000);
    expect(res.binary).toBe(true);
    expect(res.content).toBeNull();
    expect(res.truncated).toBe(false);
  });

  it('returns a newline-trimmed prefix for over-cap text', () => {
    const buf = enc.encode(('a'.repeat(99) + '\n').repeat(2000));
    const res = decideOverCapRead(buf.subarray(0, 8192), buf, 9_000_000);
    expect(res.truncated).toBe(true);
    expect(res.binary).toBe(false);
    expect(res.content!.endsWith('\n')).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/over-cap-read.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Create `desktop/src/shared/artifacts/over-cap-read.ts`:

```ts
import { looksBinary, EDIT_MAX_BYTES } from './editable-path-policy';

/** How much of the window the newline rule must retain to be worth using. */
const NEWLINE_KEEP_RATIO = 0.5;

/**
 * Cut a byte buffer down to at most `maxBytes` of text for the partial view.
 *
 *  1. Prefer the last newline — a line shown cut in half looks like corruption.
 *  2. Unless that newline is so early it would throw away most of what we read
 *     (a short header line followed by one enormous minified line), or there is
 *     no newline at all. Then cut at the last complete UTF-8 character instead,
 *     so a multi-byte character is not split. The result is one very long line —
 *     which is what the file actually is.
 *
 * Honest limitation: a file that is not valid UTF-8 (Latin-1 with accents, say)
 * has no NUL bytes, so it passes the binary sniff and decodes with replacement
 * characters. That is true of the existing under-cap read too; this function
 * does not make it worse and does not claim to fix it.
 */
export function textPrefix(buf: Uint8Array, maxBytes: number): string {
  const win = buf.subarray(0, Math.min(buf.length, maxBytes));
  if (win.length === 0) return '';
  const dec = new TextDecoder('utf-8');
  const nl = win.lastIndexOf(0x0a);
  if (nl >= 0 && nl + 1 >= win.length * NEWLINE_KEEP_RATIO) {
    return dec.decode(win.subarray(0, nl + 1));
  }
  // Walk back to the START of the last character, then keep it only if all of
  // its bytes are present. (0b10xxxxxx is a UTF-8 continuation byte.)
  let start = win.length - 1;
  while (start > 0 && (win[start] & 0xc0) === 0x80) start--;
  const lead = win[start];
  const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  const end = start + need <= win.length ? win.length : start;
  return dec.decode(win.subarray(0, end));
}

/**
 * The decision `artifacts:get` makes above EDIT_MAX_BYTES (spec §4.2). Pure so
 * it can be tested without Electron — and called by the handler, so the test
 * exercises the shipped branch rather than a copy of it.
 */
export function decideOverCapRead(head: Uint8Array, window: Uint8Array, _sizeBytes: number):
  { content: string | null; binary: boolean; truncated: boolean } {
  // Sniff the HEAD before deciding what to say. The old code refused without
  // knowing what the file was, so an over-cap IMAGE got the text editor's error.
  if (looksBinary(head)) return { content: null, binary: true, truncated: false };
  return { content: textPrefix(window, EDIT_MAX_BYTES), binary: false, truncated: true };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/over-cap-read.test.ts`
Expected: PASS (8 tests).

- [x] **Step 5: Commit**

```bash
git add desktop/src/shared/artifacts/over-cap-read.ts desktop/tests/over-cap-read.test.ts
git commit -m "feat(artifacts): pure over-cap read decision — head sniff plus text prefix"
```

---

## ✅ Task 7 — DONE: the handler, the preload, the shim, the thumbnail

**Files:**
- Modify: `main/ipc-handlers.ts` (handler at `:3692`; size gate `:3734-3739`; return `:3757`)
- Modify: `main/preload.ts:1310-1311`
- Modify: `renderer/remote-shim.ts:1227-1232`
- Modify: `renderer/components/ArtifactThumbnail.tsx:141`

- [x] **Step 1: Rewrite the size gate**

Add `decideOverCapRead` and `FULL_READ_MAX_BYTES` to the imports, add `opts` to the
handler signature, and replace `:3734-3739`:

```ts
  ipcMain.handle(ARTIFACT_IPC.GET, async (
    _e, projectRoot: string, artifactId: string,
    // full: the user clicked "Load the whole file". Still refused above
    // FULL_READ_MAX_BYTES — the flag opts into a bigger read, not an unbounded one.
    opts?: { full?: boolean },
  ) => {
```

```ts
    const wantsFull = opts?.full === true && st.size <= FULL_READ_MAX_BYTES;
    if (st.size > EDIT_MAX_BYTES && !wantsFull) {
      const fh = await fs.promises.open(realPath, 'r');
      try {
        // readAtLeast-style loop: fs.read is only contractually required to
        // return SOME bytes, not to fill the buffer.
        const readFully = async (len: number) => {
          const buf = Buffer.allocUnsafe(len);
          let off = 0;
          while (off < len) {
            const { bytesRead } = await fh.read(buf, off, len - off, off);
            if (bytesRead === 0) break;
            off += bytesRead;
          }
          return buf.subarray(0, off);
        };
        const head = await readFully(8192);
        const win = st.size <= EDIT_MAX_BYTES ? head : await readFully(EDIT_MAX_BYTES);
        const d = decideOverCapRead(head, win, st.size);
        return {
          ok: true, artifact: artifact ?? null, orphan: false,
          content: d.content, binary: d.binary, truncated: d.truncated,
          sizeBytes: st.size, mtimeMs: st.mtimeMs,
        };
      } finally {
        await fh.close();
      }
    }
```

Extend the success return at `:3757` so `sizeBytes` and `truncated` ride **every**
response — the renderer now derives editability from the size, and a `full` read must
clear the banner:

```ts
    return { ok: true, artifact: artifact ?? null, content, orphan: false, binary,
             truncated: false, sizeBytes: st.size, mtimeMs: st.mtimeMs };
```

- [x] **Step 2: Thread `opts` through both transports**

`preload.ts:1310`:
```ts
    get: (projectRoot: string, artifactId: string, opts?: { full?: boolean }) =>
      ipcRenderer.invoke('artifacts:get', projectRoot, artifactId, opts),
```

`remote-shim.ts:1227` — this transport uses an **object** payload, not positional args, so
`full` is dropped silently without this:
```ts
      get: (projectRoot: string, artifactId: string, opts?: { full?: boolean }) =>
        invoke('artifacts:get', { projectRoot, artifactId, full: opts?.full }),
```

While here, fix the stale comment two lines below (`readBinary`), which claims binary
viewers work for remote browsers. They do not — `remote-server.ts` bridges only
`artifacts:list-projects-index`; everything else answers `{ unsupported: true }`:
```ts
      // NOT bridged by remote-server.ts — this and artifacts:get both fall to its
      // `default:` case. Kept wired for when that bridge lands (ROADMAP #remote).
```

- [x] **Step 3: Stop a 2 MB prefix landing in thumbnail state**

`ArtifactThumbnail.tsx:141` — it calls `artifacts.get` for text/html previews and now gets
a 2 MB string where it used to get `content: null` and fall back to the extension glyph:

```ts
      // A thumbnail needs a few lines. Without this an over-cap file parks a
      // 2 MB string in React state for every visible tile.
      .then((res: any) => setPreview(res?.content?.slice(0, 2000) ?? null))
```

- [x] **Step 4: Verify and commit**

Run from the workspace root: `bash scripts/verify.sh worktrees/artifact-size-limits`

```bash
git add desktop/src/main/ipc-handlers.ts desktop/src/main/preload.ts \
        desktop/src/renderer/remote-shim.ts desktop/src/renderer/components/ArtifactThumbnail.tsx
git commit -m "feat(artifacts): over-cap reads sniff the head instead of refusing blind"
```

---

## ✅ Task 8 — DONE: one content-update path, and retire `tooLarge`

> **HALF OF THIS TASK IS ALREADY DONE** (commit `8c098c84`). The editability predicate
> `canEditArtifact` exists at `artifact-views/edit-permission.ts`, is pinned by
> `tests/edit-permission.test.ts` (6 cases), and is enforced at all four entry points:
> the affordance (`isEditable`), `handleStartEdit`, `handleSave`, and BOTH draft-restore
> effects. It was pulled forward because the Edit button was visibly offered on a
> truncated file during the checkpoint review. **Skip Steps 1–3 below; they are kept for
> reference.** Two regression tests in `tests/active-artifact-view.test.tsx` cover it and
> were verified to fail without the fix.
>
> **What remains in this task:**
> 1. `applyDiskRead` in `useArtifactContent` + the `onDiskRead` prop wired by both hosts,
>    so content and its metadata always update together. The prop is already declared on
>    `ActiveArtifactViewProps` and already consumed by `loadFull`; it is not yet supplied
>    by `SessionDrawer.tsx` or `FilesTab.tsx`, and the watcher does not yet call it.
> 2. Route the five content-update paths through it (table below).
> 3. Retire `tooLarge` — 7 references remain: `ipc-handlers.ts:3737`,
>    `useArtifactContent.ts:90`, `ActiveArtifactView.tsx:72,285,451`,
>    `SessionService.kt:3369`, `EditablePathPolicy.kt:70` (comment). The
>    `ActiveArtifactView.tsx:451` block is the old full-pane refusal — deleting it is what
>    finally lets the real backend's over-cap response reach the new banner.
>
> **Why the remaining half still matters:** every guard reads `contentInfo`, and the
> watcher can swap the pane's text without refreshing it. A file that GROWS past the cap
> while open would keep its Edit button and saving would truncate it. The predicate cannot
> fix that alone — the metadata has to travel with the text.

- [x] **Step 1: Write the failing predicate test**

Create `desktop/tests/edit-permission.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canEditArtifact } from '../src/renderer/components/artifact-views/edit-permission';
import { EDIT_MAX_BYTES } from '../src/shared/artifacts/editable-path-policy';

describe('canEditArtifact', () => {
  it('allows an ordinary small text file', () => {
    expect(canEditArtifact({ sizeBytes: 1024 }, 'hi', 'allowed')).toBe(true);
  });
  it('refuses while content has not resolved', () => {
    expect(canEditArtifact({ sizeBytes: 1024 }, null, 'allowed')).toBe(false);
  });
  it('refuses a policy-denied path', () => {
    expect(canEditArtifact({ sizeBytes: 1024 }, 'hi', 'denied')).toBe(false);
  });
  it('refuses a binary file', () => {
    expect(canEditArtifact({ binary: true, sizeBytes: 10 }, '', 'allowed')).toBe(false);
  });
  // The whole point: a prefix must never be savable over the original.
  it('refuses anything larger than the cap, prefix or fully loaded', () => {
    expect(canEditArtifact({ sizeBytes: EDIT_MAX_BYTES + 1, truncated: true }, 'x', 'allowed')).toBe(false);
    expect(canEditArtifact({ sizeBytes: EDIT_MAX_BYTES + 1, truncated: false }, 'x', 'allowed')).toBe(false);
  });
  it('keeps working when size is unknown (legacy hosts, workbench fixtures)', () => {
    expect(canEditArtifact({}, 'hi', 'allowed')).toBe(true);
    expect(canEditArtifact(null, 'hi', 'allowed')).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit-permission.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the predicate**

Create `.../artifact-views/edit-permission.ts`:

```ts
import { EDIT_MAX_BYTES, type EditTier } from '../../../shared/artifacts/editable-path-policy';
import type { ArtifactContentInfo } from './ActiveArtifactView';

/**
 * The ONE answer to "may this artifact be edited?" — used by the pencil
 * affordance, by entering edit mode, by restoring a draft, and by the save call.
 *
 * Editability is derived from the file's SIZE, not from a separate "this is a
 * prefix" flag. Why: the on-disk watcher can swap a file's text underneath the
 * pane, and a flag it forgets to refresh fails OPEN — a file that grew past the
 * cap while open would still look editable, and saving would write the 2 MB
 * prefix over the whole file. `sizeBytes` rides every artifacts:get response, so
 * this predicate cannot disagree with itself (spec §4.4).
 */
export function canEditArtifact(
  info: ArtifactContentInfo | null | undefined,
  content: string | null,
  tier: EditTier,
): boolean {
  if (content === null || tier === 'denied' || info?.binary) return false;
  // Unknown size (legacy callers, workbench fixtures) keeps today's behaviour.
  return (info?.sizeBytes ?? 0) <= EDIT_MAX_BYTES;
}
```

- [x] **Step 4: Write the failing behaviour tests**

Append to `desktop/tests/active-artifact-view.test.tsx` (jsdom + `mountView` already
present). Also **fix `:70`**, which asserts on `tooLarge`, to use `sizeBytes: 5e6`.

```tsx
describe('content updates always carry their metadata', () => {
  // THE REGRESSION THIS TASK EXISTS FOR: a file that grows past the cap while
  // open used to keep its pencil, and saving wrote the prefix over the file.
  it('locks editing when the file grows past the cap while open', async () => {
    const onDiskRead = vi.fn();
    const view = mountView({
      content: 'small', contentInfo: { sizeBytes: 100, binary: false },
      contentState: { phase: 'ready' }, onDiskRead,
    });
    get.mockResolvedValue({ ok: true, content: 'PREFIX', binary: false,
                            truncated: true, sizeBytes: 9_000_000, mtimeMs: 2 });
    changedCb!({ projectRoot: '/proj', artifactId: 'a1', kind: 'change' });
    await waitFor(() => expect(onDiskRead).toHaveBeenCalled());
    const res = onDiskRead.mock.calls[0][0];
    expect(res.sizeBytes).toBe(9_000_000);
    expect(res.truncated).toBe(true);
    view.unmount();
  });

  // The watcher's `disk !== content` guard used to wrap the metadata update too,
  // so an append past the 2 MB mark left the prefix identical and the size stale.
  it('updates metadata even when the visible text is unchanged', async () => {
    const onDiskRead = vi.fn();
    mountView({ content: 'same', contentInfo: { sizeBytes: 100 },
                contentState: { phase: 'ready' }, onDiskRead });
    get.mockResolvedValue({ ok: true, content: 'same', binary: false,
                            truncated: true, sizeBytes: 9_000_000, mtimeMs: 2 });
    changedCb!({ projectRoot: '/proj', artifactId: 'a1', kind: 'change' });
    await waitFor(() => expect(onDiskRead).toHaveBeenCalled());
  });

  it('refuses to save an over-cap buffer', async () => {
    const view = mountView({ content: 'PREFIX', contentInfo: { sizeBytes: 9_000_000, truncated: true },
                             contentState: { phase: 'ready' } });
    const ok = await view.ref.current!.save();
    expect(ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 5: Implement `applyDiskRead` and route every path through it**

In `useArtifactContent.ts`:

```ts
  // Deliver a WHOLE artifacts:get response — text and the facts about the text
  // in one call. Callers used to hand back only `res.content`, leaving
  // contentInfo frozen at whatever the first read said; a file that grew past
  // the cap then kept its pencil and saving truncated it (spec §4.4).
  const applyDiskRead = useCallback((res: any) => {
    if (!res || !res.ok || res.orphan) return;
    setContent(res.content ?? null);
    setContentInfo({ binary: res.binary, truncated: res.truncated, sizeBytes: res.sizeBytes });
    setContentState({ phase: 'ready' });
  }, []);
```

Add it to `UseArtifactContentResult` and the returned object.

In `ActiveArtifactView.tsx`:

- `:70` — delete `tooLarge?: boolean;` from `ArtifactContentInfo`.
- `:138` — `const isEditable = canEditArtifact(contentInfo, content, tier);`
- `:173-179` and `:199-208` — the draft-restore effects call `setEditing(true)`
  unconditionally. Guard both:
  ```ts
    // A stashed draft must not re-enter edit mode on a file we could not save
    // (spec §4.4). Without this the unmount-stash is a way around the pencil.
    if (!canEditArtifact(contentInfo, content, tier)) return;
  ```
- `:234-244` — the watcher. Move the metadata update **outside** the `disk !== content`
  guard, and refresh metadata on the dirty branch too:
  ```ts
        // Metadata ALWAYS travels with the read, even when the visible text is
        // unchanged — an append past the cap leaves the prefix identical while
        // the file's size (and therefore its editability) has changed.
        if (onDiskRead) onDiskRead(res);
        const disk = res.content ?? '';
        if (dirty) {
          if (disk !== draft) setConflict({ disk });
        } else if (!onDiskRead && disk !== content) {
          onContentChange(disk);
        }
  ```
- `:259-263` — `handleStartEdit`'s refetch: change `!res.tooLarge` to `!res.truncated` and
  replace `onContentChange(res.content)` with `onDiskRead?.(res) ?? onContentChange(res.content)`.
  Add, before `setEditing(true)`:
  ```ts
    // Belt and braces: the affordance is already hidden, but a keyboard path or
    // a stale ref must not open an editor on a file we cannot save.
    if (!canEditArtifact(contentInfo, content, tier)) return;
  ```
- `:277` — `handleSave`, immediately after `if (content === null) return false;`:
  ```ts
    // Saving a PREFIX would write 2 MB over the whole 8 MB file. Hard-blocked
    // here as well as at the affordance — main cannot detect this on its own
    // (a shrinking file is legitimate), so it is honestly a renderer guarantee.
    if (!canEditArtifact(contentInfo, content, tier)) return false;
  ```
  and add `contentInfo` to its deps.
- `:288` — on save success, prefer `onDiskRead?.({ ok: true, content: draft, binary: false,
  truncated: false, sizeBytes: draft.length, mtimeMs: res.mtimeMs })` over the bare
  `onContentChange(draft)`.
- `:332` — `resolveUseDisk`: the conflict's disk string may itself be a prefix. Re-read
  through `artifacts.get` and apply via `onDiskRead` instead of `onContentChange(conflict.disk)`.
- `:397-412` — delete the whole `if (contentInfo?.tooLarge) { … }` block. Task 4's banner
  and Task 5's handoff already cover both of its jobs.

Wire both hosts: add `onDiskRead={applyDiskRead}` beside `onContentChange={setContent}` at
`SessionDrawer.tsx:739` and `FilesTab.tsx:832`, destructuring `applyDiskRead` from the hook.

Finally, drop `tooLarge` from `mock-shim.ts` and from `fixtures/artifacts.ts`'s comment.

- [x] **Step 6: Run the tests**

Run: `npx vitest run tests/edit-permission.test.ts tests/active-artifact-view.test.tsx tests/artifact-content-loading.test.tsx`
Expected: PASS.

- [x] **Step 7: Prove the flag is gone and the paths are closed**

```bash
cd worktrees/artifact-size-limits
rg -n 'tooLarge' desktop/src desktop/tests app/src        # expect NO output for desktop
rg -n 'onContentChange\(' desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx
```
The second command must show `onContentChange(` only inside the `!onDiskRead` fallback
branches — every other content update goes through `onDiskRead`. If a bare call survives,
it is an open data-loss path; close it before committing.

Run from the workspace root: `bash scripts/verify.sh worktrees/artifact-size-limits`
and `node scripts/workbench-boot-check.mjs`.

- [x] **Step 8: Commit**

```bash
git add desktop/src/renderer desktop/tests
git commit -m "fix(artifacts): derive editability from size; every content update carries its metadata"
```

---

# Stage 2C — Android

## ✅ Task 9 — DONE: mirror the response shape

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/artifacts/EditablePathPolicy.kt:70-74`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3304-3305,3365-3372,3416`
- Test: the existing `EditablePathPolicy` Kotlin test

> **Partly done:** `EDIT_MAX_BYTES` is already 3 MB in `EditablePathPolicy.kt:71`
> (commit `e7f2d42b`), mirroring the desktop constant. The head-sniff, `textPrefix`,
> `readFully`, `FULL_READ_MAX_BYTES`, `READ_BINARY_MAX_BYTES` and the `full` flag are all
> still outstanding.

- [x] **Step 1: Add the Kotlin helpers**

In `EditablePathPolicy.kt`, beside `EDIT_MAX_BYTES` (and fix its `tooLarge` comment):

```kotlin
        /** Mirrors desktop FULL_READ_MAX_BYTES — ceiling on "Load the whole file". */
        const val FULL_READ_MAX_BYTES: Long = 4L * EDIT_MAX_BYTES

        /** Mirrors desktop READ_BINARY_MAX_BYTES. */
        const val READ_BINARY_MAX_BYTES: Long = 50L * 1024 * 1024

        /**
         * Cut a byte array to at most maxBytes of text for the partial view.
         * Prefer the last newline so no line is shown cut in half — unless it
         * would throw away more than half the window (a short header line then
         * one enormous minified line), in which case cut at the last complete
         * UTF-8 character. Mirrors desktop textPrefix() in over-cap-read.ts.
         */
        fun textPrefix(buf: ByteArray, len: Int, maxBytes: Int): String {
            val n = minOf(len, maxBytes)
            if (n <= 0) return ""
            var nl = -1
            for (i in n - 1 downTo 0) if (buf[i] == 0x0A.toByte()) { nl = i; break }
            if (nl >= 0 && (nl + 1) >= n / 2) return String(buf, 0, nl + 1, Charsets.UTF_8)
            var start = n - 1
            while (start > 0 && (buf[start].toInt() and 0xC0) == 0x80) start--
            val lead = buf[start].toInt() and 0xFF
            val need = when { lead >= 0xF0 -> 4; lead >= 0xE0 -> 3; lead >= 0xC0 -> 2; else -> 1 }
            val end = if (start + need <= n) n else start
            return String(buf, 0, end, Charsets.UTF_8)
        }

        /** Fill `out` from the stream — read() is only required to return SOME
         *  bytes, not to fill the buffer. Returns how many were actually read. */
        fun readFully(f: java.io.File, out: ByteArray): Int {
            f.inputStream().use { s ->
                var off = 0
                while (off < out.size) {
                    val n = s.read(out, off, out.size - off)
                    if (n <= 0) break
                    off += n
                }
                return off
            }
        }
```

- [x] **Step 2: Replace the bridge's size gate**

`SessionService.kt:3365-3372` — read the `full` flag from the payload (`:3304-3305` is
where the other named keys are read) and replace the `tooLarge` block:

```kotlin
                val wantsFull = msg.payload?.optBoolean("full", false) == true &&
                    resolved.length() <= EditablePathPolicy.FULL_READ_MAX_BYTES
                // Above the cap, sniff the HEAD before deciding what to say: an
                // over-cap IMAGE must get the binary handoff, not the text
                // editor's refusal (spec §4.2). Mirrors desktop ipc-handlers.ts.
                if (resolved.length() > EditablePathPolicy.EDIT_MAX_BYTES && !wantsFull) {
                    val head = ByteArray(8192)
                    val headLen = EditablePathPolicy.readFully(resolved, head)
                    val out = org.json.JSONObject()
                        .put("ok", true).put("artifact", artifact.toJson()).put("orphan", false)
                        .put("sizeBytes", resolved.length())
                        .put("mtimeMs", resolved.lastModified().toDouble())
                    if (EditablePathPolicy.looksBinary(head.copyOf(headLen))) {
                        out.put("content", org.json.JSONObject.NULL)
                           .put("binary", true).put("truncated", false)
                    } else {
                        val cap = EditablePathPolicy.EDIT_MAX_BYTES.toInt()
                        val win = ByteArray(cap)
                        val winLen = EditablePathPolicy.readFully(resolved, win)
                        out.put("content", EditablePathPolicy.textPrefix(win, winLen, cap))
                           .put("binary", false).put("truncated", true)
                    }
                    msg.id?.let { bridgeServer.respond(ws, msg.type, it, out) }
                    return@handleBridgeMessage
                }
```

Add `.put("sizeBytes", resolved.length()).put("truncated", false)` to the under-cap success
response so `canEditArtifact` has a size on Android too, and replace the literal
`50L * 1024 * 1024` at `:3416` with `EditablePathPolicy.READ_BINARY_MAX_BYTES`.

- [x] **Step 3: Add the Kotlin test**

Extend the existing `EditablePathPolicy` test with the same four `textPrefix` cases the TS
suite pins (newline trim, no-newline fallback, early-newline floor, multi-byte boundary),
so the two implementations cannot drift.

- [x] **Step 4: Build and test Android**

```bash
cd worktrees/artifact-size-limits && ./scripts/build-web-ui.sh && ./gradlew test
```
Expected: PASS. (Safe here — this worktree's `node_modules` is a `cp -al` copy, not a
symlink; Gradle's `bundleWebUi` runs `npm ci` and would empty a shared symlinked copy.)

- [x] **Step 5: Final proof and commit**

```bash
rg -n 'tooLarge' desktop/src desktop/tests app/src   # expect NO output at all
bash ../../scripts/verify.sh worktrees/artifact-size-limits
git add app/src/main/kotlin/com/youcoded/app/
git commit -m "feat(android): mirror the over-cap head sniff and text prefix"
```

---

## Post-implementation

- [x] **Do not add a new ROADMAP entry for the remote gap** — `ROADMAP.md:526-529` already
      covers it and explicitly lists "the rest of `artifacts:*`" as unbridged. Append the
      one concrete consequence this work established: *the artifact pane cannot open any
      file at all over remote access on a desktop host, so anything size- or
      preview-related for remote is unreachable until that bridge exists.*
- [x] Report to Destin: the five checkpoint questions' outcomes, and the remote finding.
- [ ] **Destin looks at the finished feature against the REAL backend** —
      `bash scripts/run-dev.sh worktrees/artifact-size-limits --label "Artifact Size Limits"`,
      then open a >3 MB log (partial bar + **Load the whole file**), a >12 MB one (no load
      action, **Open externally**), a >3 MB non-text file (format handoff, not the text
      refusal), and the originally-reported 2.3 MB PNG. Everything shipped so far was seen
      only against the Workbench's fake backend; the checkpoint's four defects are the
      reason this step is not optional.
- [ ] **On merge, close the loop** (`CLAUDE.md` → Document lifecycle): move this plan and
      the spec from `docs/active/` to `docs/archive/`, and flip the ROADMAP item in the
      same session. "Merge means merge AND push AND archive the docs AND flip the item."
- [ ] Remove the worktree and delete the branch both remotely and locally once the commit
      is confirmed on `master` (`git branch --contains <sha>`).
- [ ] **Do not merge or push.** Destin decides when this lands.
