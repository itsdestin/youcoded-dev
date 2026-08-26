---
status: draft
created: 2026-08-26
updated: 2026-08-26
spec: docs/active/specs/2026-08-26-model-download-resume-design.md
tags: [local-models, engine, renderer, downloads]
---

# Interrupted Model Downloads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A model download interrupted by a crash, quit, or cancel shows up in the Local Models list as unfinished, with a Resume button that continues it from the exact byte — and an incomplete model is never offered as something you can chat with.

**Architecture:** A manifest file written next to the download records where it came from, so resume survives a restart. One scan of the cache directory produces two views: every download in any state (Settings) and complete models only (everything else, including the conversation model picker) — so the "don't offer a broken model" rule cannot be forgotten at a call site. Resume runs entirely in the main process off the manifest, with no Hugging Face round trip.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React 18, Vitest, Vite. Kotlin only for a one-line channel stub.

## Global Constraints

- **Worktree required.** All work happens in a git worktree off `youcoded` master, per the workspace rule. `node_modules` is copied with `cp -al`, NEVER symlinked or junctioned.
- **`bash scripts/verify.sh <worktree>` must be green** before any task is claimed done. It runs `tsc --noEmit`, affected `vitest`, `knip`, `eslint`, and the ast-grep scan.
- **No live-app testing.** `bash scripts/run-dev.sh` and `bash scripts/run-workbench.sh` only. Never touch the installed YouCoded app (`.claude/rules/live-app-safety.md`).
- **Every non-trivial edit carries a WHY comment.** Destin is a non-developer and reads comments to understand the code.
- **Error messages follow `docs/error-message-standards.md`** — specific and accurate, or general and non-committal. Never a guessed cause.
- **Repo:** `youcoded`. Everything below is relative to `youcoded/desktop/` unless stated.
- **Spec:** `docs/active/specs/2026-08-26-model-download-resume-design.md` in the `youcoded-dev` workspace repo. Read it before Task 1.
- **Copy is fixed by the spec.** The three row states use the spec's §3.2 wording verbatim. Do not paraphrase user-facing strings.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/model-manager-types.ts` | **Modify.** Add `DownloadManifest`, `LocalModelStatus`; extend `InstalledLocalModel`; delete `OrphanedPartial`. |
| `src/main/models/download-manifest.ts` | **Create.** Write / read / remove the manifest. The only module that knows the file's name and shape. |
| `src/main/models/model-downloader.ts` | **Modify.** Write the manifest before the first byte; remove it on clean completion. |
| `src/main/engine/cache-scan.ts` | **Modify.** Add `scanLocalDownloads` + `isComplete`; derive `scanGgufCache` from them; delete `scanPartialFiles`. |
| `src/main/engine/engine-manager.ts` | **Modify.** `installedModels()` returns the three states; `deleteModel()` removes the manifest; new `resumeDownload()`. |
| `src/main/models/model-manager.ts` | **Modify.** Delete `orphanedPartials()`; disk guard subtracts bytes already on disk; expose `resume()`. |
| `src/renderer/components/LocalModelsSection.tsx` | **Modify.** One row component for all three states; retire `PartialRow`. |
| `src/renderer/dev/workbench/mock-shim.ts` | **Modify.** Fixture data for the three row states. |
| Channel surfaces | **Modify.** `src/shared/types.ts`, `src/main/preload.ts`, `src/main/ipc-handlers.ts`, `src/main/remote-server.ts`, `src/renderer/remote-shim.ts`, `src/renderer/hooks/useIpc.ts`, `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. |

---

## Task 0: Worktree

- [ ] **Step 1: Create the worktree**

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../worktrees/download-resume -b feat/model-download-resume origin/master
```

- [ ] **Step 2: Hardlink node_modules (NEVER symlink — see CLAUDE.md)**

```bash
cp -al /home/destin/youcoded-dev/youcoded/desktop/node_modules \
       /home/destin/youcoded-dev/worktrees/download-resume/desktop/node_modules
```

- [ ] **Step 3: Confirm the baseline is green**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/download-resume`
Expected: exit 0, "all checks passed".

---

## Task 1: Shared types for the three states

**Files:**
- Modify: `src/shared/model-manager-types.ts:66-86`

**Interfaces:**
- Consumes: nothing.
- Produces: `DownloadManifest`, `LocalModelStatus`, extended `InstalledLocalModel`. Every later task uses these names.

- [ ] **Step 1: Replace the `InstalledLocalModel` block and delete `OrphanedPartial`**

Replace lines 66–86 of `src/shared/model-manager-types.ts` with:

```ts
/** What state a download on disk is in. A model is only usable when every
 *  declared part is published — see docs/active/specs/2026-08-26-model-download-resume-design.md.
 *    complete    — every part present; the ordinary case
 *    unfinished  — missing parts and/or a .partial, WITH a manifest → resumable
 *    untraceable — missing parts, NO manifest (downloaded before manifests
 *                  existed) → we cannot know where it came from, so no Resume */
export type LocalModelStatus = 'complete' | 'unfinished' | 'untraceable';

export interface InstalledLocalModel {
  id: string;                 // the router-served model id (filename minus .gguf)
  sizeBytes: number;          // bytes ON DISK: published parts, plus the .partial when unfinished
  quant: string | null;       // parsed from filename; null when unrecognized
  quantDescription: string | null;
  parts: number;              // declared part count; 1 for single-file models
  status: LocalModelStatus;
  partsPresent: number;       // published .gguf files found for this set
  // From the manifest — null for 'complete' (not needed) and 'untraceable' (unknown).
  // WHY totalSizeBytes may be null: an untraceable row must show NO percentage.
  // A denominator we cannot know would be a fabricated number in a shipping UI.
  totalSizeBytes: number | null;
  repo: string | null;        // e.g. 'unsloth/Qwen3.8-Flash-Next-GGUF'
}

/** Written next to a download BEFORE its first byte, so a leftover .partial can
 *  still be resumed after a crash. Carries the whole QuantOption, not just the
 *  repo name, so resume needs no Hugging Face round trip — the interruption
 *  that stranded the download is often the network itself. */
export interface DownloadManifest {
  v: 1;
  repo: string;
  quant: string;
  files: string[];                              // repo-relative paths, in download order
  totalSizeBytes: number;
  sha256ByFile: Record<string, string | null>;
  startedAt: number;                            // epoch ms
}
```

- [ ] **Step 2: Verify the compiler now reports exactly the call sites to fix**

Run: `cd /home/destin/youcoded-dev/worktrees/download-resume/desktop && npx tsc --noEmit 2>&1 | head -30`
Expected: errors naming `OrphanedPartial` in `model-manager.ts`, `cache-scan.ts`, `useIpc.ts`, and missing-property errors for `status` in `engine-manager.ts`. These are the map for Tasks 5–8; do not fix them yet.

- [ ] **Step 3: Commit**

```bash
git add src/shared/model-manager-types.ts
git commit -m "feat(models): types for the three local-download states + the download manifest"
```

---

## Task 2: Workbench design pass — **STOPS FOR DESTIN'S SIGN-OFF**

This task builds the UI against fake data, in the real renderer, and ends at a human gate. **No backend work starts until Destin approves the sheets.** This is the workspace rule for any new user-facing surface (CLAUDE.md → New Features & UI/UX Changes).

**Files:**
- Modify: `src/renderer/dev/workbench/mock-shim.ts:518-528` (the `models` namespace)
- Modify: `src/renderer/dev/workbench/mock-shim.ts:27-45` (`HAND_WRITTEN`)
- Modify: `src/renderer/components/LocalModelsSection.tsx`

**Interfaces:**
- Consumes: `InstalledLocalModel`, `LocalModelStatus` from Task 1.
- Produces: `LocalModelRow` (exported for tests), replacing `InstalledRow` and `PartialRow`.

- [ ] **Step 1: Give the workbench the three row states**

In `src/renderer/dev/workbench/mock-shim.ts`, replace the `models` namespace (currently `memoryCheck` only, line 518) with:

```ts
  const models: Ns<'models'> = {
    // RuntimeBinding.tsx only calls this for the local-engine provider. The
    // verdict union is checked by the compiler — useIpc.ts:329.
    memoryCheck: async (modelId: string) => (modelId.includes('14b')
      ? {
        verdict: 'tight' as const,
        headline: 'This model is a tight fit.',
        detail: 'Loading it may evict another resident model.',
      }
      : { verdict: 'ok' as const, headline: '', detail: '' }),

    // One fixture per row state, so a design review sees all three at once.
    // Numbers are Destin's real 2026-08-26 interruption — a four-file split
    // GGUF stranded at part 3 — so the sheets show realistic byte counts
    // rather than round numbers that hide formatting bugs.
    installed: async () => [
      {
        id: 'Qwen3.5-9B-Q8_0',
        sizeBytes: 9_527_502_048,
        quant: 'Q8_0', quantDescription: 'Highest quality quantization — near-original output',
        parts: 1, status: 'complete' as const, partsPresent: 1,
        totalSizeBytes: null, repo: null,
      },
      {
        id: 'Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004',
        sizeBytes: 79_674_559_677,
        quant: 'UD-Q4_K_XL', quantDescription: 'Balanced quality and size — recommended',
        parts: 4, status: 'unfinished' as const, partsPresent: 2,
        totalSizeBytes: 121_334_654_784, repo: 'unsloth/Qwen3.8-Flash-Next-GGUF',
      },
      {
        id: 'Older-Model-UD-Q4_K_XL-00001-of-00002',
        sizeBytes: 4_100_000_000,
        quant: 'UD-Q4_K_XL', quantDescription: 'Balanced quality and size — recommended',
        parts: 2, status: 'untraceable' as const, partsPresent: 1,
        totalSizeBytes: null, repo: null,
      },
    ],
    resume: async () => ({ downloadId: 'wb-resume-1' }),
    delete: async () => true,
    curated: async () => [],
  };
```

- [ ] **Step 2: Register the new mock members in `HAND_WRITTEN`**

In the same file, add to the `HAND_WRITTEN` array (after `'providers.catalog', 'models.memoryCheck',`):

```ts
  'models.installed', 'models.resume', 'models.delete', 'models.curated',
```

WHY: `tests/workbench-mock-contract.test.ts` only checks members listed here against `preload.ts`. A hand-written mock missing from this list escapes the check entirely.

- [ ] **Step 3: Verify the mock contract test fails on `models.resume`**

Run: `npx vitest run tests/workbench-mock-contract.test.ts`
Expected: FAIL — `models.resume` is not in `preload.ts` yet.

- [ ] **Step 4: Declare `models:resume` in the workbench-visible surfaces so the contract holds**

`src/shared/types.ts` — add after `MODELS_INSTALLED`:

```ts
  // Resume an interrupted download from its manifest (2026-08-26) — invoke(modelId)
  // → { downloadId }. Replaces MODELS_ORPHANED_PARTIALS, removed the same day.
  MODELS_RESUME: 'models:resume',
```

`src/main/preload.ts` — add the same constant to the `IPC` map next to `MODELS_INSTALLED`, and add to the `models` bridge object next to `installed`:

```ts
    resume: (modelId: string) => ipcRenderer.invoke(IPC.MODELS_RESUME, modelId),
```

`src/renderer/hooks/useIpc.ts` — in the `models` block, replace the `orphanedPartials` line with:

```ts
        // Resume an interrupted download (2026-08-26). Main reads the manifest
        // written beside the .partial — no Hugging Face round trip.
        resume: (modelId: string) => Promise<{ downloadId: string }>;
        installed: () => Promise<import('../../shared/model-manager-types').InstalledLocalModel[]>;
```

and delete the existing untyped `installed: () => Promise<any[]>;` line.

- [ ] **Step 5: Re-run the contract test**

Run: `npx vitest run tests/workbench-mock-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Replace `InstalledRow` and `PartialRow` with one row**

In `src/renderer/components/LocalModelsSection.tsx`, replace the whole `InstalledRow` function (currently `:434-505`) and the whole `PartialRow` function (currently `:511-625`) with the single component below. Keep the file's existing imports; add nothing new except what is used here.

```tsx
// ── Local model rows ─────────────────────────────────────────────────────────

/** Percent of a download that is on disk. Returns null when the total is
 *  unknown (an untraceable row) — the caller then shows NO percentage rather
 *  than inventing a denominator. */
function percentOf(model: InstalledLocalModel): number | null {
  if (model.totalSizeBytes == null || model.totalSizeBytes <= 0) return null;
  return Math.min(100, Math.round((model.sizeBytes / model.totalSizeBytes) * 100));
}

// Exported (named) so tests can pin each row state without booting the whole
// LocalModelsSection (which needs the full models API mocked).
export function LocalModelRow({
  model, live, onRefresh,
}: {
  model: InstalledLocalModel;
  /** Live progress for THIS model, when a download of it is in flight. Matched
   *  on repo + quant by the parent — see the spec, §3.5a. */
  live?: DownloadProgress;
  onRefresh: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLive = live?.state === 'downloading' || live?.state === 'verifying';
  const pct = isLive && live!.totalBytes > 0
    ? Math.min(100, Math.round((live!.receivedBytes / live!.totalBytes) * 100))
    : percentOf(model);
  const onDisk = isLive ? live!.receivedBytes : model.sizeBytes;
  const total = isLive ? live!.totalBytes : model.totalSizeBytes;

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.claude.models.resume(model.id);
      await onRefresh();
    } catch (e) {
      // WHY: surface the real failure. A resume that silently does nothing was
      // the original bug in PartialRow (docs/error-message-standards.md).
      setError(e instanceof Error ? e.message : 'Could not resume the download.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      // If a download of this model is still live, cancel it and AWAIT the
      // 'cancelled' event FIRST — removing the .partial out from under an open
      // write stream races.
      if (isLive) {
        await new Promise<void>((resolve) => {
          const off = window.claude.models.onDownloadProgress((p: DownloadProgress) => {
            if (p.downloadId === live!.downloadId && p.state === 'cancelled') { off(); resolve(); }
          });
          window.claude.models.downloadCancel(live!.downloadId).catch(() => { off(); resolve(); });
          // Safety net so a lost cancelled event can't hang the button forever.
          setTimeout(() => { off(); resolve(); }, 5000);
        });
      }
      await window.claude.models.delete(model.id);
      setConfirming(false);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the model.');
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    isLive ? `${live!.state === 'verifying' ? 'Verifying…' : 'Downloading…'} · ${gb(onDisk)} of ${gb(total ?? 0)}`
    : model.status === 'complete' ? [gb(model.sizeBytes), model.quant, model.quantDescription].filter(Boolean).join(' · ')
    : model.status === 'unfinished' ? `Unfinished · ${pct}% — ${gb(onDisk)} of ${gb(total ?? 0)}`
    : `Unfinished — ${gb(model.sizeBytes)} downloaded`;

  return (
    <div className="bg-inset/50 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg font-medium truncate">{model.id}</p>
          <p className="text-3xs text-fg-muted">{subtitle}</p>
        </div>
        {!confirming && (
          <div className="flex items-center gap-1.5 shrink-0">
            {model.status === 'unfinished' && !isLive && (
              <Button variant="secondary" size="sm" onClick={() => void resume()} disabled={busy}>
                Resume
              </Button>
            )}
            {isLive && (
              <Button variant="secondary" size="sm" onClick={() => void window.claude.models.downloadCancel(live!.downloadId)}>
                Pause
              </Button>
            )}
            <Button variant="danger-outline" size="sm" onClick={() => setConfirming(true)} className="shrink-0">
              Delete
            </Button>
          </div>
        )}
      </div>

      {isLive && (
        <div className="mt-2">
          <ProgressBar percent={pct ?? 0} aria-label="Download progress" />
        </div>
      )}

      {/* An untraceable row is NOT a dead end — say what to do about it. */}
      {model.status === 'untraceable' && !confirming && (
        <p className="text-3xs text-fg-muted mt-1">
          This download started before the app kept track of where downloads come from.
          Find the model in search and download it again — it will continue from where it stopped.
        </p>
      )}

      {/* Consequence-gated delete — plain-language warning naming the real size. */}
      {confirming && (
        <div className="mt-2 space-y-2">
          <Callout tone="danger">
            {model.status === 'complete'
              ? `This removes the model file (${gb(model.sizeBytes)}) from this computer. Re-downloading it later will take a while.`
              : `Delete ${gb(model.sizeBytes)}? This removes every downloaded piece of this model.`}
          </Callout>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
              Keep
            </Button>
            <Button variant="danger" onClick={() => void doDelete()} disabled={busy} className="flex-1">
              {busy ? 'Deleting…' : 'Delete model'}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-3xs text-destructive-fg mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Point the list at the new row and merge live progress**

In `ModelBrowser` (`LocalModelsSection.tsx:179-247`), replace the `partials` computation and the Installed block with:

```tsx
  const installedFiltered = (installed ?? []).filter((m) => matches(m.id, m.quant, m.quantDescription));

  // A live download and its disk row are ONE row — matched on repo + quant,
  // both of which a resumable row carries from its manifest (spec §3.5a).
  const liveFor = (m: InstalledLocalModel): DownloadProgress | undefined =>
    m.repo ? activeDownload(downloads, m.repo, m.quant ?? '') : undefined;

  // Downloads with no disk row yet (started seconds ago, first bytes not
  // scanned): still show them, so a fresh download never renders nowhere.
  const knownRepoQuant = new Set(
    (installed ?? []).filter((m) => m.repo).map((m) => key(m.repo!, m.quant ?? ''))
  );
  const unlisted = Object.values(downloads).filter(
    (d) => d.state !== 'done' && !knownRepoQuant.has(key(d.repo, d.quant)) && matches(d.repo, d.quant)
  );
```

and in the JSX:

```tsx
          {(installedFiltered.length > 0 || unlisted.length > 0) && (
            <div className="space-y-2">
              <p className="text-3xs font-medium text-fg-muted tracking-wider uppercase">Installed</p>
              {installedFiltered.map((m) => (
                <LocalModelRow key={m.id} model={m} live={liveFor(m)} onRefresh={onRefreshInstalled} />
              ))}
              {unlisted.map((dl) => (
                <DownloadProgressRow key={dl.downloadId} dl={dl} />
              ))}
            </div>
          )}
```

Then update the `nothing` computation on line 192, replacing `partials.length === 0` with `unlisted.length === 0`.

- [ ] **Step 8: Refresh the list when a download starts, not only when it finishes**

In `LocalModelsSection`'s subscription effect (`:65-69`), replace the handler body with:

```tsx
    const seen = new Set<string>();
    const off = window.claude.models.onDownloadProgress((p: DownloadProgress) => {
      setDownloads((prev) => ({ ...prev, [p.downloadId]: p }));
      // Refresh on the FIRST event for a download (a brand-new one has no disk
      // row yet) and on every terminal state (spec §3.5a).
      const first = !seen.has(p.downloadId);
      seen.add(p.downloadId);
      if (first || p.state === 'done' || p.state === 'error' || p.state === 'cancelled') {
        void refreshInstalled();
      }
    });
    return off;
```

- [ ] **Step 9: Remove the now-unused `setDownloads` prop threading**

`ModelBrowser` no longer passes `setDownloads` to a row. Delete the `setDownloads` prop from `ModelBrowser`'s props type, its destructuring, and its call site in `LocalModelsSection`. Keep the `setDownloads` state itself — the subscription still writes to it.

- [ ] **Step 10: Boot-check the workbench**

Run: `node scripts/workbench-boot-check.mjs`
Expected: PASS on all registered routes, zero console errors. (The unit suite has passed while the app crashed at boot three times — this check is not optional.)

- [ ] **Step 11: Capture the sheets**

```bash
bash /home/destin/youcoded-dev/scripts/ui-review/run-review.sh /home/destin/youcoded-dev/worktrees/download-resume
```

Read `coverage.md` first. The Local Models panel must be `covered`; a surface that is not covered is unreviewed, never "fine".

- [ ] **Step 12: STOP. Hand the sheets to Destin.**

Present: the three row states side by side in all six themes, plus the delete confirmation for a complete model and for an unfinished one. Judge against `docs/active/design/2026-08-25-ui-design-guide.md` first and say what you found, then ask for sign-off.

**Do not proceed to Task 3 until Destin approves.** If he asks for changes, iterate in the workbench and re-capture.

- [ ] **Step 13: Commit**

```bash
git add src/renderer src/shared/types.ts src/main/preload.ts
git commit -m "feat(models): unified local-model row with the three download states (workbench design pass)"
```

---

## Task 3: The download manifest module

**Files:**
- Create: `src/main/models/download-manifest.ts`
- Test: `tests/download-manifest.test.ts`

**Interfaces:**
- Consumes: `DownloadManifest`, `QuantOption`.
- Produces: `manifestPathFor(cacheDir, firstFileBasename)`, `writeManifest(cacheDir, repo, quant, startedAt)`, `readManifest(cacheDir, firstFileBasename)`, `removeManifest(cacheDir, firstFileBasename)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/download-manifest.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { manifestPathFor, writeManifest, readManifest, removeManifest } from '../src/main/models/download-manifest';
import type { QuantOption } from '../src/shared/model-manager-types';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const quant: QuantOption = {
  quant: 'UD-Q4_K_XL',
  description: 'x',
  files: ['UD-Q4_K_XL/M-UD-Q4_K_XL-00001-of-00002.gguf', 'UD-Q4_K_XL/M-UD-Q4_K_XL-00002-of-00002.gguf'],
  totalSizeBytes: 1234,
  sha256ByFile: {
    'UD-Q4_K_XL/M-UD-Q4_K_XL-00001-of-00002.gguf': 'a'.repeat(64),
    'UD-Q4_K_XL/M-UD-Q4_K_XL-00002-of-00002.gguf': null,
  },
};

describe('download manifest', () => {
  it('is named for the FIRST file basename, beside the download', () => {
    expect(manifestPathFor(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf'))
      .toBe(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json'));
  });

  it('round-trips the whole quant option plus the repo', () => {
    writeManifest(dir, 'unsloth/M-GGUF', quant, 1700000000000);
    const got = readManifest(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf');
    expect(got).toEqual({
      v: 1,
      repo: 'unsloth/M-GGUF',
      quant: 'UD-Q4_K_XL',
      files: quant.files,
      totalSizeBytes: 1234,
      sha256ByFile: quant.sha256ByFile,
      startedAt: 1700000000000,
    });
  });

  it('returns null for an absent manifest', () => {
    expect(readManifest(dir, 'nope.gguf')).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', () => {
    fs.writeFileSync(path.join(dir, 'M-Q4_K_M.gguf.download.json'), '{not json');
    expect(readManifest(dir, 'M-Q4_K_M.gguf')).toBeNull();
  });

  it('returns null for a manifest from a future version', () => {
    fs.writeFileSync(path.join(dir, 'M-Q4_K_M.gguf.download.json'), JSON.stringify({ v: 2, repo: 'a/b' }));
    expect(readManifest(dir, 'M-Q4_K_M.gguf')).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    fs.writeFileSync(path.join(dir, 'M-Q4_K_M.gguf.download.json'), JSON.stringify({ v: 1, repo: 'a/b' }));
    expect(readManifest(dir, 'M-Q4_K_M.gguf')).toBeNull();
  });

  it('leaves no .tmp behind after a write', () => {
    writeManifest(dir, 'unsloth/M-GGUF', quant, 1);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('remove is a no-op when there is nothing to remove', () => {
    expect(() => removeManifest(dir, 'nope.gguf')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/download-manifest.test.ts`
Expected: FAIL — `Cannot find module '../src/main/models/download-manifest'`.

- [ ] **Step 3: Write the module**

Create `src/main/models/download-manifest.ts`:

```ts
// Records WHERE a download came from, so a leftover .partial can still be
// resumed after a crash or quit. Written BEFORE the first byte; removed only on
// clean completion of the whole file set.
//
// A sidecar beside the files rather than a central registry: it travels with
// the download, so it cannot drift out of sync with the cache dir, and it
// survives the user repointing engine.cacheDir.
//
// Spec: docs/active/specs/2026-08-26-model-download-resume-design.md §3.1
import * as fs from 'fs';
import * as path from 'path';
import type { DownloadManifest, QuantOption } from '../../shared/model-manager-types';

const SUFFIX = '.download.json';

/** The manifest path for a download, keyed to its FIRST file's basename — the
 *  same id models:delete addresses a split model by. */
export function manifestPathFor(cacheDir: string, firstFileBasename: string): string {
  return path.join(cacheDir, `${firstFileBasename}${SUFFIX}`);
}

export function writeManifest(cacheDir: string, repo: string, quant: QuantOption, startedAt: number): void {
  const manifest: DownloadManifest = {
    v: 1,
    repo,
    quant: quant.quant,
    files: quant.files,
    totalSizeBytes: quant.totalSizeBytes,
    sha256ByFile: quant.sha256ByFile,
    startedAt,
  };
  const target = manifestPathFor(cacheDir, path.basename(quant.files[0]));
  // Write-then-rename: a crash mid-write must leave NO manifest rather than half
  // of one. readManifest would reject the fragment, but "absent" is the honest
  // state and "present but unreadable" invites someone to try to repair it.
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, target);
}

/** The manifest for a download, or null. Absent, unreadable, malformed, and
 *  from-a-future-version all answer null — the caller's only question is
 *  "can I resume this?", and every one of those means no. */
export function readManifest(cacheDir: string, firstFileBasename: string): DownloadManifest | null {
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPathFor(cacheDir, firstFileBasename), 'utf8'));
  } catch {
    return null;
  }
  if (raw?.v !== 1) return null;
  if (typeof raw.repo !== 'string' || !raw.repo) return null;
  if (typeof raw.quant !== 'string' || !raw.quant) return null;
  if (!Array.isArray(raw.files) || raw.files.length === 0) return null;
  if (!raw.files.every((f: unknown) => typeof f === 'string')) return null;
  if (typeof raw.totalSizeBytes !== 'number' || !Number.isFinite(raw.totalSizeBytes)) return null;
  if (typeof raw.sha256ByFile !== 'object' || raw.sha256ByFile === null) return null;
  if (typeof raw.startedAt !== 'number') return null;
  return raw as DownloadManifest;
}

export function removeManifest(cacheDir: string, firstFileBasename: string): void {
  fs.rmSync(manifestPathFor(cacheDir, firstFileBasename), { force: true });
  fs.rmSync(`${manifestPathFor(cacheDir, firstFileBasename)}.tmp`, { force: true });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/download-manifest.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/models/download-manifest.ts tests/download-manifest.test.ts
git commit -m "feat(models): download manifest — records a download's source beside its files"
```

---

## Task 4: The downloader writes and removes the manifest

**Files:**
- Modify: `src/main/models/model-downloader.ts:38-52` (`start`), `:82-124` (`run`)
- Test: `tests/model-downloader.test.ts`

**Interfaces:**
- Consumes: `writeManifest`, `removeManifest` from Task 3.
- Produces: no new exports. The behavioural contract is: a manifest exists from `start()` until the whole set completes cleanly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/model-downloader.test.ts`, inside the existing `describe('ModelDownloader', …)`:

```ts
  it('writes the manifest BEFORE the first byte, and removes it on clean completion', async () => {
    const seen: string[] = [];
    const watching: typeof fetch = (async (url: any, init?: any) => {
      // Record whether the manifest already exists at the moment of each fetch.
      seen.push(fs.existsSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json')) ? 'yes' : 'no');
      return fetchServing(bodies)(url, init);
    }) as typeof fetch;
    const dl = new ModelDownloader(dir, watching);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id);
    expect(seen).toEqual(['yes', 'yes']);   // present for every part's fetch
    expect(fs.existsSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json'))).toBe(false);
  });

  it('keeps the manifest when the download is cancelled — that is what makes resume possible', async () => {
    const stall: typeof fetch = (async () => new Promise(() => {})) as typeof fetch;
    const dl = new ModelDownloader(dir, stall);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    dl.cancel(id);
    await dl.wait(id).catch(() => {});
    expect(fs.existsSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json'))).toBe(true);
  });

  it('keeps the manifest when the download errors', async () => {
    const dead: typeof fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
    const dl = new ModelDownloader(dir, dead);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id).catch(() => {});
    expect(fs.existsSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json'))).toBe(true);
  });

  it('records the repo and the whole file set, so resume needs no network', async () => {
    const stall: typeof fetch = (async () => new Promise(() => {})) as typeof fetch;
    const dl = new ModelDownloader(dir, stall);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    dl.cancel(id);
    await dl.wait(id).catch(() => {});
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json'), 'utf8'));
    expect(m.repo).toBe('unsloth/M-GGUF');
    expect(m.files).toEqual(quantOpt().files);
    expect(m.totalSizeBytes).toBe(quantOpt().totalSizeBytes);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/model-downloader.test.ts -t manifest`
Expected: FAIL — the manifest file never exists.

- [ ] **Step 3: Write the manifest in `start()`**

In `src/main/models/model-downloader.ts`, add the import:

```ts
import { writeManifest, removeManifest } from './download-manifest';
```

In `start()`, immediately after `const downloadId = ulid();` and before `entry.promise = …`, insert:

```ts
    // The manifest is what makes this download resumable after a crash — write
    // it BEFORE any bytes, so a crash one second from now still leaves a trail.
    // mkdir here (not only in run()) because the manifest lands in the same dir.
    fs.mkdirSync(this.cacheDir, { recursive: true });
    writeManifest(this.cacheDir, repo, quant, Date.now());
```

- [ ] **Step 4: Remove it on clean completion only**

In `run()`, replace the success line:

```ts
      onProgress({ ...base, state: 'done', receivedBytes: doneBytes, currentPart: parts });
```

with:

```ts
      // Clean completion of the WHOLE set — the trail is no longer needed.
      // Deliberately NOT in a finally: cancel and error must keep it, because
      // that is exactly when the user will want to resume.
      removeManifest(this.cacheDir, path.basename(quant.files[0]));
      onProgress({ ...base, state: 'done', receivedBytes: doneBytes, currentPart: parts });
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/model-downloader.test.ts`
Expected: PASS, all pre-existing tests plus the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/main/models/model-downloader.ts tests/model-downloader.test.ts
git commit -m "feat(models): downloader records its source in a manifest, kept on cancel/error"
```

---

## Task 5: One scan, two views

**Files:**
- Modify: `src/main/engine/cache-scan.ts` (whole file)
- Test: `tests/cache-scan.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `scanLocalDownloads(cacheDir): LocalDownload[]`, `isComplete(d: LocalDownload): boolean`, and the `LocalDownload` interface:

```ts
export interface LocalDownload {
  modelId: string;         // first-part id — what models:delete takes
  firstFileName: string;   // basename incl. .gguf — the manifest key
  partsDeclared: number;   // from the -of-000NN suffix; 1 for single-file
  partsPresent: number;    // published .gguf files found for this set
  bytesPublished: number;  // bytes in published parts
  bytesPartial: number;    // bytes in the .partial, if any
  hasPartial: boolean;
}
```

`scanGgufCache` keeps its signature and is now derived. `scanPartialFiles` is **deleted**.

- [ ] **Step 1: Write the failing tests**

In `tests/cache-scan.test.ts`, delete the whole `describe('scanPartialFiles', …)` block, then change the existing import line (`:5`) to:

```ts
import { scanGgufCache, scanLocalDownloads, isComplete, ggufIdFromFileName } from '../src/main/engine/cache-scan';
```

(`scanPartialFiles` goes; `scanLocalDownloads` and `isComplete` arrive. One import statement — a second one from the same module trips `no-duplicate-imports`.)

Then append:

```ts
describe('scanLocalDownloads', () => {
  it('counts a complete split set as complete', () => {
    touch('Big-UD-Q4_K_XL-00001-of-00002.gguf', 10);
    touch('Big-UD-Q4_K_XL-00002-of-00002.gguf', 20);
    const [d] = scanLocalDownloads(dir);
    expect(d).toMatchObject({
      modelId: 'Big-UD-Q4_K_XL-00001-of-00002',
      firstFileName: 'Big-UD-Q4_K_XL-00001-of-00002.gguf',
      partsDeclared: 2, partsPresent: 2, bytesPublished: 30, bytesPartial: 0, hasPartial: false,
    });
    expect(isComplete(d)).toBe(true);
  });

  it('a split set missing parts is NOT complete, and reports partial bytes separately', () => {
    // Destin's 2026-08-26 case in miniature: parts 1-2 published, part 3 half-written.
    touch('Big-UD-Q4_K_XL-00001-of-00004.gguf', 10);
    touch('Big-UD-Q4_K_XL-00002-of-00004.gguf', 20);
    touch('Big-UD-Q4_K_XL-00003-of-00004.gguf.partial', 5);
    const [d] = scanLocalDownloads(dir);
    expect(d).toMatchObject({
      modelId: 'Big-UD-Q4_K_XL-00001-of-00004',
      partsDeclared: 4, partsPresent: 2, bytesPublished: 30, bytesPartial: 5, hasPartial: true,
    });
    expect(isComplete(d)).toBe(false);
  });

  it('reports a download with ONLY a .partial and no published file', () => {
    touch('Solo-Q4_K_M.gguf.partial', 7);
    const [d] = scanLocalDownloads(dir);
    expect(d).toMatchObject({
      modelId: 'Solo-Q4_K_M', firstFileName: 'Solo-Q4_K_M.gguf',
      partsDeclared: 1, partsPresent: 0, bytesPublished: 0, bytesPartial: 7, hasPartial: true,
    });
    expect(isComplete(d)).toBe(false);
  });

  it('a complete set with a stray .partial is still complete', () => {
    // Publication is an atomic rename, so this should not happen — but if it
    // does, a stray file must not demote a working model (spec §3.2).
    touch('Big-UD-Q4_K_XL-00001-of-00002.gguf', 10);
    touch('Big-UD-Q4_K_XL-00002-of-00002.gguf', 20);
    touch('Big-UD-Q4_K_XL-00002-of-00002.gguf.partial', 3);
    const [d] = scanLocalDownloads(dir);
    expect(isComplete(d)).toBe(true);
    expect(d.bytesPublished).toBe(30);
  });

  it('ignores manifests and unrelated files', () => {
    touch('M-Q4_K_M.gguf', 5);
    touch('M-Q4_K_M.gguf.download.json', 100);
    touch('notes.txt', 100);
    const downloads = scanLocalDownloads(dir);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].bytesPublished).toBe(5);
  });

  it('returns [] for a missing directory', () => {
    expect(scanLocalDownloads(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('scanGgufCache is scanLocalDownloads filtered to complete sets', () => {
  it('omits an incomplete split model entirely — the picker must never offer it', () => {
    touch('Whole-Q4_K_M.gguf', 5);
    touch('Half-UD-Q4_K_XL-00001-of-00004.gguf', 10);
    touch('Half-UD-Q4_K_XL-00003-of-00004.gguf.partial', 5);
    expect(scanGgufCache(dir).map((m) => m.id)).toEqual(['Whole-Q4_K_M']);
  });

  it('a complete set reports published bytes only', () => {
    touch('Big-UD-Q4_K_XL-00001-of-00002.gguf', 10);
    touch('Big-UD-Q4_K_XL-00002-of-00002.gguf', 20);
    touch('Big-UD-Q4_K_XL-00002-of-00002.gguf.partial', 3);
    expect(scanGgufCache(dir)).toEqual([
      { id: 'Big-UD-Q4_K_XL-00001-of-00002', sizeBytes: 30, loaded: false, state: 'unloaded' },
    ]);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/cache-scan.test.ts`
Expected: FAIL — `scanLocalDownloads` is not exported.

- [ ] **Step 3: Rewrite `cache-scan.ts`**

Replace the body of `src/main/engine/cache-scan.ts` below the header comment (keep the header, updating the last paragraph) with:

```ts
import * as fs from 'fs';
import * as path from 'path';
import type { EngineModel } from '../../shared/engine-types';

// llama.cpp split-GGUF convention: <name>-00001-of-000NN.gguf. The model is
// addressed through its FIRST part; other parts are the same model's payload.
const PART_RE = /-(\d{5})-of-(\d{5})\.gguf$/i;

export function ggufIdFromFileName(fileName: string): string {
  return fileName.replace(/\.gguf$/i, '');
}

/** One download's footprint on disk, in whatever state it is in. */
export interface LocalDownload {
  modelId: string;         // first-part id — what models:delete takes
  firstFileName: string;   // basename incl. .gguf — the manifest key
  partsDeclared: number;   // from the -of-000NN suffix; 1 for single-file
  partsPresent: number;    // published .gguf files found for this set
  bytesPublished: number;
  bytesPartial: number;
  hasPartial: boolean;
}

/** A download is usable only when every declared part is published. A stray
 *  .partial alongside a full set does NOT demote it — publication is an atomic
 *  rename, so the file count is the authority (spec §3.2). */
export function isComplete(d: LocalDownload): boolean {
  return d.partsPresent >= d.partsDeclared;
}

/** Every GGUF download in the cache dir, complete or not — the Settings view.
 *  Groups a split set under its first part and reports published vs in-flight
 *  bytes separately. This is the ONE scan; scanGgufCache is this filtered, so
 *  the two can never disagree about what is on disk. */
export function scanLocalDownloads(cacheDir: string): LocalDownload[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return []; // cache dir not created yet — no downloads, not an error
  }
  const sets = new Map<string, LocalDownload>();
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const published = /\.gguf$/i.test(ent.name);
    const partial = /\.gguf\.partial$/i.test(ent.name);
    if (!published && !partial) continue;   // manifests, notes, anything else
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(path.join(cacheDir, ent.name)).size; } catch { continue; } // raced delete
    // The final filename this entry belongs to ('X.gguf.partial' → 'X.gguf').
    const finalName = partial ? ent.name.replace(/\.partial$/i, '') : ent.name;
    const part = PART_RE.exec(finalName);
    const firstFileName = part ? finalName.replace(PART_RE, `-00001-of-${part[2]}.gguf`) : finalName;
    let set = sets.get(firstFileName);
    if (!set) {
      set = {
        modelId: ggufIdFromFileName(firstFileName),
        firstFileName,
        partsDeclared: part ? Number(part[2]) : 1,
        partsPresent: 0,
        bytesPublished: 0,
        bytesPartial: 0,
        hasPartial: false,
      };
      sets.set(firstFileName, set);
    }
    if (published) { set.partsPresent += 1; set.bytesPublished += sizeBytes; }
    else { set.hasPartial = true; set.bytesPartial += sizeBytes; }
  }
  return [...sets.values()].sort((a, b) => a.modelId.localeCompare(b.modelId));
}

/** The engine-off view of "what local models exist" — complete downloads only.
 *  Router-mode llama-server discovers the same directory (--models-dir), so the
 *  ids derived here MUST match what GET /models reports once the engine runs;
 *  that equivalence is pinned by test-engine/probe-models.mjs and recorded in
 *  docs/engine-dependencies.md.
 *
 *  INCOMPLETE SETS ARE OMITTED BY CONSTRUCTION. Everything downstream of this
 *  function — listModels, liveModels, engine:models, the conversation model
 *  picker — inherits that, so there is no second place to remember the rule.
 *  A half-downloaded split model listed as installed was the 2026-08-26 bug. */
export function scanGgufCache(cacheDir: string): EngineModel[] {
  return scanLocalDownloads(cacheDir)
    .filter(isComplete)
    .map((d) => ({
      id: d.modelId,
      sizeBytes: d.bytesPublished,
      loaded: false,
      state: 'unloaded' as const, // cache scan = engine-off view; nothing is resident
    }));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/cache-scan.test.ts`
Expected: PASS. The pre-existing `scanGgufCache` tests still pass — a single `.gguf` is `partsDeclared: 1, partsPresent: 1`.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/cache-scan.ts tests/cache-scan.test.ts
git commit -m "feat(engine): one cache scan, two views — an incomplete split model is no longer listed as installed"
```

---

## Task 6: `installedModels()` reports the three states; resume; delete cleans up

**Files:**
- Modify: `src/main/engine/engine-manager.ts:439-452` (`installedModels`), `:460-490` (`deleteModel`)
- Test: `tests/engine-manager.test.ts`

**Interfaces:**
- Consumes: `scanLocalDownloads`, `isComplete` (Task 5); `readManifest`, `removeManifest` (Task 3); `InstalledLocalModel`, `LocalModelStatus` (Task 1).
- Produces: `EngineManager.installedModels(): Promise<InstalledLocalModel[]>` (extended shape), `EngineManager.resumeDownload(modelId): { repo: string; quant: QuantOption }` — it returns what to download rather than downloading, because the disk guard and the downloader live in `ModelManager` (Task 7).

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine-manager.test.ts`. Add `updateEngineConfig` to the file's imports:

```ts
import { updateEngineConfig } from '../src/main/engine/engine-config';
```

then append this whole describe block (the file's existing `root` / `userData` / `home`
fixtures from its top-level `beforeEach` are in scope):

```ts
describe('EngineManager — local downloads', () => {
  let cacheDir: string;
  let manager: EngineManager;

  beforeEach(async () => {
    // A real cache dir under the per-test tmp root. Without this the manager
    // reads ~/.cache/llama.cpp — the developer's actual models.
    cacheDir = path.join(root, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    await updateEngineConfig(home, { cacheDir });
    manager = new EngineManager(home, userData, 9999);
  });

  it('reports a complete model, an unfinished one with its manifest, and an untraceable one', async () => {
    // complete
    fs.writeFileSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf'), Buffer.alloc(50));
    // unfinished + manifest
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00004.gguf'), Buffer.alloc(10));
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00003-of-00004.gguf.partial'), Buffer.alloc(5));
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00004.gguf.download.json'), JSON.stringify({
      v: 1, repo: 'unsloth/Half-GGUF', quant: 'UD-Q4_K_XL',
      files: ['Half-UD-Q4_K_XL-00001-of-00004.gguf'], totalSizeBytes: 100,
      sha256ByFile: {}, startedAt: 1,
    }));
    // untraceable — same shape, no manifest
    fs.writeFileSync(path.join(cacheDir, 'Old-UD-Q4_K_XL-00001-of-00002.gguf'), Buffer.alloc(20));

    const rows = await manager.installedModels();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId['Whole-Q4_K_M']).toMatchObject({
      status: 'complete', sizeBytes: 50, parts: 1, partsPresent: 1,
      totalSizeBytes: null, repo: null,
    });
    expect(byId['Half-UD-Q4_K_XL-00001-of-00004']).toMatchObject({
      status: 'unfinished', sizeBytes: 15, parts: 4, partsPresent: 1,
      totalSizeBytes: 100, repo: 'unsloth/Half-GGUF',
    });
    expect(byId['Old-UD-Q4_K_XL-00001-of-00002']).toMatchObject({
      status: 'untraceable', sizeBytes: 20, parts: 2, partsPresent: 1,
      totalSizeBytes: null, repo: null,
    });
  });

  it('sweeps a stale manifest left beside a COMPLETE set', async () => {
    fs.writeFileSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf'), Buffer.alloc(50));
    fs.writeFileSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf.download.json'), JSON.stringify({
      v: 1, repo: 'a/b', quant: 'Q4_K_M', files: ['Whole-Q4_K_M.gguf'],
      totalSizeBytes: 50, sha256ByFile: {}, startedAt: 1,
    }));
    const rows = await manager.installedModels();
    expect(rows[0].status).toBe('complete');
    expect(fs.existsSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf.download.json'))).toBe(false);
  });

  it('resumeDownload returns the manifest\'s repo and file set — no network', () => {
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00002.gguf'), Buffer.alloc(10));
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00002.gguf.download.json'), JSON.stringify({
      v: 1, repo: 'unsloth/Half-GGUF', quant: 'UD-Q4_K_XL',
      files: ['a/Half-UD-Q4_K_XL-00001-of-00002.gguf', 'a/Half-UD-Q4_K_XL-00002-of-00002.gguf'],
      totalSizeBytes: 100, sha256ByFile: {}, startedAt: 1,
    }));
    const got = manager.resumeDownload('Half-UD-Q4_K_XL-00001-of-00002');
    expect(got.repo).toBe('unsloth/Half-GGUF');
    expect(got.quant.files).toHaveLength(2);
    expect(got.quant.totalSizeBytes).toBe(100);
  });

  it('resumeDownload names the real problem when there is no manifest', () => {
    fs.writeFileSync(path.join(cacheDir, 'Old-Q4_K_M.gguf.partial'), Buffer.alloc(10));
    expect(() => manager.resumeDownload('Old-Q4_K_M'))
      .toThrow(/where this download came from/i);
  });

  it('deleteModel removes the manifest along with the parts', async () => {
    fs.writeFileSync(path.join(cacheDir, 'M-Q4_K_M.gguf.partial'), Buffer.alloc(10));
    fs.writeFileSync(path.join(cacheDir, 'M-Q4_K_M.gguf.download.json'), '{}');
    // No supervisor is running in this fixture, so refreshModels() is a no-op
    // (engine-manager.ts:258 returns early) — deleteModel needs no engine.
    await manager.deleteModel('M-Q4_K_M');
    expect(fs.readdirSync(cacheDir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/engine-manager.test.ts -t 'unfinished'`
Expected: FAIL — `status` is undefined; `resumeDownload` is not a function.

- [ ] **Step 3: Rewrite `installedModels()` and add `resumeDownload()`**

In `src/main/engine/engine-manager.ts`, add imports:

```ts
import { scanGgufCache, scanLocalDownloads, isComplete, type LocalDownload } from './cache-scan';
import { readManifest, removeManifest, manifestPathFor } from '../models/download-manifest';
```

(replace the existing `scanGgufCache` import line), and replace `installedModels()` with:

```ts
  /** Every download in the cache dir, complete or not, with the state the Local
   *  Models screen renders. Unlike liveModels() this deliberately does NOT
   *  filter incomplete sets — Settings is where you act on them. */
  async installedModels(): Promise<InstalledLocalModel[]> {
    const cacheDir = readEngineConfig(this.home).cacheDir;
    return scanLocalDownloads(cacheDir).map((d) => {
      const parsed = parseGgufName(d.firstFileName);
      const complete = isComplete(d);
      if (complete) this.sweepCompletedArtifacts(cacheDir, d);
      // A complete set needs no manifest: there is nothing left to resume.
      const manifest = complete ? null : readManifest(cacheDir, d.firstFileName);
      return {
        id: d.modelId,
        // Bytes on disk. For an unfinished set that includes the .partial, so
        // the delete confirmation names what the user actually gives up.
        sizeBytes: complete ? d.bytesPublished : d.bytesPublished + d.bytesPartial,
        quant: parsed?.quant ?? null,
        quantDescription: parsed ? quantDescription(parsed.quant) : null,
        parts: d.partsDeclared,
        status: complete ? 'complete' : manifest ? 'unfinished' : 'untraceable',
        partsPresent: d.partsPresent,
        totalSizeBytes: manifest?.totalSizeBytes ?? null,
        repo: manifest?.repo ?? null,
      };
    });
  }

  /** Best-effort cleanup of artifacts that outlived a completed download: the
   *  manifest, and any stray .partial. The downloader removes both on clean
   *  completion, so these only exist after a crash between publish and cleanup.
   *  Safe here because a set with EVERY declared part published cannot be a
   *  download still in flight — an in-flight one is missing its last part. */
  private sweepCompletedArtifacts(cacheDir: string, d: LocalDownload): void {
    try {
      if (fs.existsSync(manifestPathFor(cacheDir, d.firstFileName))) {
        removeManifest(cacheDir, d.firstFileName);
      }
      if (d.hasPartial) {
        for (const name of fs.readdirSync(cacheDir)) {
          if (!name.endsWith('.gguf.partial')) continue;
          const final = name.replace(/\.partial$/i, '');
          const part = /-(\d{5})-of-(\d{5})\.gguf$/i.exec(final);
          const firstName = part ? final.replace(/-\d{5}-of-(\d{5})\.gguf$/i, `-00001-of-$1.gguf`) : final;
          if (firstName === d.firstFileName) fs.rmSync(path.join(cacheDir, name), { force: true });
        }
      }
    } catch { /* best-effort: a failed sweep must never break the list */ }
  }

  /** What to re-download to continue an interrupted download, read from the
   *  manifest beside it. Deliberately no network: the interruption that
   *  stranded the download is often the network itself. */
  resumeDownload(modelId: string): { repo: string; quant: QuantOption } {
    const cacheDir = readEngineConfig(this.home).cacheDir;
    const manifest = readManifest(cacheDir, `${modelId}.gguf`);
    if (!manifest) {
      // Specific and accurate, per docs/error-message-standards.md — this names
      // the real cause and what the user can do instead.
      throw new Error(
        "This download has no record of where it came from, so it can't be resumed automatically. "
        + 'Find the model in search and download it again — it will continue from where it stopped.'
      );
    }
    return {
      repo: manifest.repo,
      quant: {
        quant: manifest.quant,
        description: '',
        files: manifest.files,
        totalSizeBytes: manifest.totalSizeBytes,
        sha256ByFile: manifest.sha256ByFile,
      },
    };
  }
```

Add `import type { QuantOption } from '../../shared/model-manager-types';` to the file's type imports if not already present, plus `import * as fs from 'fs';` and `import * as path from 'path';` if absent.

- [ ] **Step 4: Make `deleteModel` remove the manifest**

In `deleteModel()`, after the loop that unlinks each part and its `.partial`, add:

```ts
    // The manifest outlives nothing — remove it with the files it describes.
    removeManifest(cfg.cacheDir, `${id}.gguf`);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/engine-manager.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/engine-manager.ts tests/engine-manager.test.ts
git commit -m "feat(models): installed list reports complete/unfinished/untraceable; resume reads the manifest"
```

---

## Task 7: `ModelManager` — resume, and a disk guard that counts what is left

**Files:**
- Modify: `src/main/models/model-manager.ts:120-152`
- Modify: `src/main/models/fit-estimator.ts:101-106`
- Test: `tests/fit-estimator.test.ts`, `tests/model-manager.test.ts` (create if absent)

**Interfaces:**
- Consumes: `EngineManager.resumeDownload` (Task 6), `scanLocalDownloads` (Task 5).
- Produces: `ModelManager.resume(modelId): Promise<{ downloadId: string }>`. `ModelManager.orphanedPartials()` is **deleted**.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fit-estimator.test.ts`:

```ts
  it('a resume is judged on the bytes REMAINING, not the whole download', () => {
    // 100 GB download, 80 GB already on disk, 30 GB free: refusing this would
    // push the user to delete the very partial that makes it fit (spec §3.7).
    const GB = 1024 ** 3;
    expect(checkDiskSpace(100 * GB, 30 * GB)).not.toBeNull();          // from scratch: refused
    expect(checkDiskSpace(100 * GB, 30 * GB, 80 * GB)).toBeNull();     // resuming: allowed
  });

  it('still refuses when even the remaining bytes do not fit', () => {
    const GB = 1024 ** 3;
    expect(checkDiskSpace(100 * GB, 5 * GB, 80 * GB)).toMatch(/needs about 20\.0 GB/);
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/fit-estimator.test.ts -t remaining`
Expected: FAIL — `checkDiskSpace` takes two arguments.

- [ ] **Step 3: Teach the guard about bytes already on disk**

Replace `checkDiskSpace` in `src/main/models/fit-estimator.ts`:

```ts
/** Refusal message, or null when the download fits.
 *  `alreadyOnDiskBytes` is what a resume has already fetched — charging the
 *  FULL size against a resume tells the user "not enough space" for something
 *  that fits, and the obvious reaction is to delete the partial, destroying
 *  the very thing that made it fit (2026-08-26). */
export function checkDiskSpace(downloadBytes: number, freeBytes: number, alreadyOnDiskBytes = 0): string | null {
  const needBytes = Math.max(0, downloadBytes - alreadyOnDiskBytes);
  if (freeBytes >= needBytes * 1.05) return null;
  const needGb = (needBytes / GB).toFixed(1);
  const freeGb = (freeBytes / GB).toFixed(1);
  return `Not enough free space: this download needs about ${needGb} GB but only ${freeGb} GB is free.`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/fit-estimator.test.ts`
Expected: PASS, including the pre-existing two-argument cases (the default keeps them unchanged).

- [ ] **Step 5: Pass the on-disk bytes from `ModelManager.download`, and add `resume`**

In `src/main/models/model-manager.ts`, replace the `download` method and delete `orphanedPartials`:

```ts
  /** Bytes of THIS download's file set already on disk — published parts plus
   *  the .partial. Feeds the disk guard so a resume is judged on what is left. */
  private bytesOnDiskFor(quant: QuantOption): number {
    const dir = this.cacheDir();
    let sum = 0;
    for (const filePath of quant.files) {
      const base = path.basename(filePath);
      for (const candidate of [base, `${base}.partial`]) {
        try { sum += fs.statSync(path.join(dir, candidate)).size; } catch { /* absent */ }
      }
    }
    return sum;
  }

  /** Disk guard (reserving in-flight downloads and crediting bytes already
   *  fetched), then start; progress fans out on 'download-progress'. */
  async download(repo: string, quant: QuantOption): Promise<{ downloadId: string }> {
    const free = this.freeBytesNear(this.cacheDir());
    if (free != null) {
      const refusal = checkDiskSpace(
        quant.totalSizeBytes,
        Math.max(0, free - this.reservedBytes()),
        this.bytesOnDiskFor(quant),
      );
      if (refusal) throw new Error(refusal);
    }
    const dl = this.getDownloader();
    const downloadId = dl.start(repo, quant, (p: DownloadProgress) => {
      this.inflight.set(downloadId, { total: p.totalBytes, received: p.receivedBytes });
      this.emit('download-progress', p);
    });
    void dl.wait(downloadId).catch(() => {}).finally(() => this.inflight.delete(downloadId));
    return { downloadId };
  }

  /** Continue an interrupted download from the manifest beside it. Throws with
   *  a specific message when there is no manifest (see EngineManager.resumeDownload). */
  async resume(modelId: string): Promise<{ downloadId: string }> {
    const { repo, quant } = this.engine.resumeDownload(modelId);
    return this.download(repo, quant);
  }
```

Delete the whole `orphanedPartials()` method and the `scanPartialFiles` / `OrphanedPartial` imports.

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run tests/fit-estimator.test.ts tests/model-manager.test.ts`
Expected: PASS. If `tests/model-manager.test.ts` does not exist, create it with one case: `resume('X')` on a cache dir with a manifest starts a download whose `repo` matches the manifest, using an injected `fetchImpl` that records the URL host.

- [ ] **Step 7: Commit**

```bash
git add src/main/models/model-manager.ts src/main/models/fit-estimator.ts tests/
git commit -m "feat(models): resume from the manifest; the disk guard counts bytes remaining, not the whole download"
```

---

## Task 8: Channel surgery — `models:orphaned-partials` out, `models:resume` in

**Files (every one, enumerated 2026-08-26 by `rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials' desktop/src desktop/tests app/src`):**
- Modify: `src/shared/types.ts:1385-1387`
- Modify: `src/main/preload.ts:357`, `:1274`
- Modify: `src/main/ipc-handlers.ts:2698-2699`
- Modify: `src/main/remote-server.ts:1220-1223`
- Modify: `src/renderer/remote-shim.ts:1635`
- Modify: `src/renderer/hooks/useIpc.ts:334-336`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3791`
- Modify: `src/main/models/model-downloader.ts:67` (stale comment)
- Test: `tests/ipc-channels.test.ts:896`

`src/shared/types.ts`, `preload.ts` and `useIpc.ts` were already edited in Task 2 Step 4 to ADD `models:resume`; this task REMOVES the old channel and wires the rest.

- [ ] **Step 1: Update the parity test first**

In `tests/ipc-channels.test.ts`, replace the `models:orphaned-partials` entry (line ~896) with:

```ts
    // Resume an interrupted download from its manifest (2026-08-26). Replaced
    // models:orphaned-partials, whose listing folded into models:installed —
    // two lists over one directory could disagree, which was the bug.
    ['models:resume', 'MODELS_RESUME'],
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ipc-channels.test.ts -t 'models'`
Expected: FAIL on `remote-shim`, `ipc-handlers`, and `SessionService.kt` — none mention `models:resume` yet.

- [ ] **Step 3: Delete the old channel and register the new one**

`src/shared/types.ts` — delete `MODELS_ORPHANED_PARTIALS` and its two comment lines.

`src/main/preload.ts` — delete the `MODELS_ORPHANED_PARTIALS` constant (`:357`) and the `orphanedPartials:` bridge line (`:1274`).

`src/main/ipc-handlers.ts` — replace:

```ts
  ipcMain.handle(IPC.MODELS_ORPHANED_PARTIALS, async () => modelManager.orphanedPartials());
```

with:

```ts
  // Resume an interrupted download (2026-08-26). Reads the manifest written
  // beside the .partial — no Hugging Face round trip, so it works when the
  // network is the reason the download stopped.
  ipcMain.handle(IPC.MODELS_RESUME, async (_e, modelId: string) => modelManager.resume(modelId));
```

and update the two-line comment above it (`:2696-2698`) to describe resume rather than the orphan scan.

`src/main/remote-server.ts` — replace the `case 'models:orphaned-partials'` block with:

```ts
      // Resume an interrupted download (2026-08-26) — mirrors the Electron IPC
      // handler. Replaces the orphaned-.partial scan, whose listing folded into
      // models:installed.
      case 'models:resume': {
        try {
          const res = this.nativeRuntime
            ? await this.nativeRuntime.modelManager.resume(payload.modelId ?? payload)
            : { downloadId: '' };
          this.respond(client.ws, type, id, res);
        } catch (err: any) {
          this.respond(client.ws, type, id, { ok: false, error: err?.message ?? String(err) });
        }
        break;
      }
```

This is byte-for-byte the shape of the neighbouring `models:installed` case (`remote-server.ts:1210`), including the `{ ok: false, error }` failure reply — a resume that throws must reach a phone as a message, not a silent nothing.

`src/renderer/remote-shim.ts` — replace:

```ts
      orphanedPartials: () => invoke('models:orphaned-partials'),
```

with:

```ts
      resume: (modelId: string) => invoke('models:resume', { modelId }),
```

`app/.../SessionService.kt:3791` — replace the string in the not-implemented list:

```kotlin
            "models:resume",  // resume an interrupted download (2026-08-26) — desktop-only
```

`src/main/models/model-downloader.ts:67` — the comment mentions `ModelManager.orphanedPartials`. Replace that sentence with: `The unified scan (EngineManager.installedModels) subtracts these —`.

- [ ] **Step 4: Run the parity test**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Confirm nothing references the dead name**

Run: `rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials|OrphanedPartial|scanPartialFiles' src tests ../app/src`
Expected: **no output.**

- [ ] **Step 6: Confirm knip sees no dead code**

Run: `npm run knip`
Expected: no new unused exports. (`OrphanedPartial` was deleted in Task 1; this proves nothing else was orphaned by the surgery.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(models): replace models:orphaned-partials with models:resume across all five surfaces"
```

---

## Task 9: Renderer against the real backend

**Files:**
- Modify: `tests/local-models-partial-row.test.tsx` (rename to `tests/local-models-row.test.tsx`)
- Modify: `src/renderer/dev/workbench/mock-shim.ts` (drop the now-real fixtures' MOCK_ONLY status — there is none to drop; confirm `MOCK_ONLY` stays empty)

**Interfaces:**
- Consumes: `LocalModelRow` (Task 2), `models.resume` / `models.installed` (Tasks 6–8).
- Produces: nothing new.

- [ ] **Step 1: Rework the row test**

`git mv tests/local-models-partial-row.test.tsx tests/local-models-row.test.tsx`, then replace its body with cases against `LocalModelRow`. Keep the two regressions the old file guarded — a resume failure must be visible, and delete must cancel-then-await before unlinking:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalModelRow } from '../src/renderer/components/LocalModelsSection';
import type { InstalledLocalModel } from '../src/shared/model-manager-types';

const unfinished: InstalledLocalModel = {
  id: 'Half-UD-Q4_K_XL-00001-of-00004', sizeBytes: 79_674_559_677,
  quant: 'UD-Q4_K_XL', quantDescription: 'Balanced', parts: 4, status: 'unfinished',
  partsPresent: 2, totalSizeBytes: 121_334_654_784, repo: 'unsloth/Half-GGUF',
};
const untraceable: InstalledLocalModel = {
  ...unfinished, id: 'Old-UD-Q4_K_XL-00001-of-00002', status: 'untraceable',
  totalSizeBytes: null, repo: null, parts: 2, partsPresent: 1,
};

beforeEach(() => {
  (window as any).claude = {
    models: {
      resume: vi.fn().mockResolvedValue({ downloadId: 'd1' }),
      delete: vi.fn().mockResolvedValue(true),
      downloadCancel: vi.fn().mockResolvedValue(true),
      onDownloadProgress: vi.fn().mockReturnValue(() => {}),
    },
  };
});

describe('LocalModelRow', () => {
  it('an unfinished row resumes by model id and shows real progress', async () => {
    render(<LocalModelRow model={unfinished} onRefresh={async () => {}} />);
    expect(screen.getByText(/66% — 79\.7 GB of 121\.3 GB/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(window.claude.models.resume).toHaveBeenCalledWith('Half-UD-Q4_K_XL-00001-of-00004');
  });

  it('a failed resume says why instead of doing nothing visible', async () => {
    (window.claude.models.resume as any).mockRejectedValue(new Error('Hugging Face is not reachable right now.'));
    render(<LocalModelRow model={unfinished} onRefresh={async () => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.getByText(/not reachable/)).toBeInTheDocument());
  });

  it('an untraceable row offers no Resume, shows no percentage, and says what to do', () => {
    render(<LocalModelRow model={untraceable} onRefresh={async () => {}} />);
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByText(/Find the model in search and download it again/)).toBeInTheDocument();
  });

  it('the delete confirmation names the real number of bytes at stake', async () => {
    render(<LocalModelRow model={unfinished} onRefresh={async () => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Delete 79\.7 GB\? This removes every downloaded piece/)).toBeInTheDocument();
  });

  it('deleting a LIVE download cancels first and waits for the cancelled event', async () => {
    // WHY this ordering matters: removing the .partial out from under an open
    // write stream races. Recorded in a plain array — vitest has no
    // toHaveBeenCalledBefore without jest-extended, which this repo does not use.
    const order: string[] = [];
    let emit: ((p: any) => void) | null = null;
    (window.claude.models.onDownloadProgress as any).mockImplementation((cb: any) => { emit = cb; return () => {}; });
    (window.claude.models.downloadCancel as any).mockImplementation(async () => {
      order.push('cancel');
      emit?.({ downloadId: 'live-1', state: 'cancelled' });
      return true;
    });
    (window.claude.models.delete as any).mockImplementation(async () => { order.push('delete'); return true; });
    const live = { downloadId: 'live-1', repo: 'unsloth/Half-GGUF', quant: 'UD-Q4_K_XL',
      state: 'downloading' as const, receivedBytes: 1, totalBytes: 2, parts: 4, currentPart: 3 };
    render(<LocalModelRow model={unfinished} live={live} onRefresh={async () => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete model' }));
    await waitFor(() => expect(order).toEqual(['cancel', 'delete']));
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/local-models-row.test.tsx`
Expected: PASS, 5 tests. Fix the component if a case fails — the tests encode the spec, not the other way round.

- [ ] **Step 3: Boot-check the workbench again**

Run: `node scripts/workbench-boot-check.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests src/renderer
git commit -m "test(models): pin the three row states, the visible resume failure, and cancel-before-delete"
```

---

## Task 10: Verify, exercise, document, ship

- [ ] **Step 1: Full verify**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/download-resume --full`
Expected: exit 0. Paste the output into the PR body — a claim of "done" without it is not evidence.

- [ ] **Step 2: Exercise it in a dev instance**

```bash
bash /home/destin/youcoded-dev/scripts/run-dev.sh /home/destin/youcoded-dev/worktrees/download-resume \
  --label "Download Resume" --offset 3 --profile dlresume
```

Check, in the dev window only (never the installed app):
1. Settings → Providers → Local Models lists Destin's real cache. `Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004` must read **untraceable** (it predates manifests) and offer no Resume.
2. Start a small download (a ~2 GB Q4 model), quit the dev app mid-download, relaunch: the row reads **unfinished** with a percentage and a Resume button.
3. Press Resume: it continues rather than restarting — watch the received bytes start above zero.
4. The conversation model picker does **not** list either unfinished model.

**Do not automate step 2's quit-and-relaunch loop into a rig.** Per CLAUDE.md, hand interactive verification to Destin rather than scripting it.

- [ ] **Step 3: Shut the dev instance down**

Kill it by pid, in a bare command — never `pkill -f` on a pattern that appears in your own command line.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --repo itsdestin/youcoded --base master \
  --title "Interrupted model downloads: record the source, one honest list, manual Resume" \
  --body-file /tmp/claude-1000/pr-body.md
```

Write `/tmp/claude-1000/pr-body.md` with exactly these five sections, filled in from what
actually happened — no section may be omitted:

1. **What broke** — one paragraph, the 2026-08-26 interruption and the three stacked
   defects, linking `docs/active/specs/2026-08-26-model-download-resume-design.md`.
2. **What changed** — the manifest, the single scan with two views, the three row states,
   `models:orphaned-partials` → `models:resume`, the disk-guard fix. One line each.
3. **Dev-instance checks** — the four checks from Step 2, each with its observed
   outcome. A check not run is written as "not run", never omitted.
4. **`verify.sh --full` output** — pasted verbatim in a fenced block.
5. **What is NOT covered** — auto-retry on network failure, Android (no local engine),
   and any check from Step 2 that could not be exercised.

Close with the standard footer:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 5: After merge — archive and flip the roadmap**

In `youcoded-dev`:

```bash
git mv docs/active/specs/2026-08-26-model-download-resume-design.md docs/archive/specs/
git mv docs/active/plans/2026-08-26-model-download-resume.md docs/archive/plans/
```

Set both files' `status:` frontmatter to `shipped`, flip the ROADMAP bug entry to `[x]` with the merge SHA, and update `docs/MAP.md`'s local-models row to name `download-manifest.ts` and `scanLocalDownloads`. Commit and push. "Merge means merge AND push AND archive AND flip the roadmap item."

- [ ] **Step 6: Clean up**

```bash
cd /home/destin/youcoded-dev/youcoded
git branch --contains <merge-sha>   # must list master before anything is deleted
git worktree remove ../worktrees/download-resume
git push origin --delete feat/model-download-resume
git branch -D feat/model-download-resume
```

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §3.1 Record the source at download start | 3, 4 |
| §3.2 One honest list (three states, copy, edge cases) | 1, 2, 5, 6 |
| §3.3 One list, not two (channel removal) | 8 |
| §3.4 Unfinished models not offerable | 5 (by construction) |
| §3.5 Resume | 6, 7, 2 |
| §3.5a Live download + disk row are one row | 2 (steps 7–8) |
| §3.6 Discard | 2 (step 6), 6 (step 4), 9 |
| §3.7 Space check counts what is left | 7 |
| §4 Sequencing (workbench gate) | 2 (step 12) |
| §5 Guards | 3, 4, 5, 6, 7, 8, 9 |
