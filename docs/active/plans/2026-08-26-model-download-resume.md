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

**Architecture:** A manifest file written next to the download records where it came from, so resume survives a restart. **A manifest alone is a row** — it exists before the first byte, so every download has a row in the list from the moment it starts, including one that failed before any bytes arrived. One scan of the cache directory produces two views: every download in any state (Settings) and complete models only (everything else, including the conversation model picker) — so the "don't offer a broken model" rule cannot be forgotten at a call site. Resume runs entirely in the main process off the manifest, with no Hugging Face round trip.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React 18, Vitest, Vite. Kotlin only for a one-line channel stub.

## Global Constraints

- **Worktree required.** All work happens in a git worktree off `youcoded` master, per the workspace rule. `node_modules` is copied with `cp -al`, NEVER symlinked or junctioned.
- **`bash scripts/verify.sh <worktree>` must be green** before any task is claimed done. It runs `tsc --noEmit`, affected `vitest`, `knip`, `eslint`, and the ast-grep scan.
- **No live-app testing.** `bash scripts/run-dev.sh` and `bash scripts/run-workbench.sh` only. Never touch the installed YouCoded app (`.claude/rules/live-app-safety.md`).
- **Every non-trivial edit carries a WHY comment.** Destin is a non-developer and reads comments to understand the code.
- **Error messages follow `docs/error-message-standards.md`** — specific and accurate, or general and non-committal. Never a guessed cause.
- **Repo:** `youcoded`. Everything below is relative to `youcoded/desktop/` unless stated.
- **Spec:** `docs/active/specs/2026-08-26-model-download-resume-design.md` in the `youcoded-dev` workspace repo. Read it before Task 1.
- **Copy follows the spec's §3.2 wording** (Resume / Discard on an unfinished row, Delete elsewhere, `66% — 74.2 of 113.0 GB`). The workbench gate (Task 2, Step 13) is where Destin can change any of it; until he does, do not paraphrase.
- **"GB" in this app means 1024³ bytes.** `gb()` in `LocalModelsSection.tsx:24` divides by 1073741824, so Destin's 79,674,559,677-byte partial renders as **74.2 GB** and the 121,334,654,784-byte total as **113.0 GB** — not the 79.7 / 121.3 Hugging Face shows. Every number in this plan's tests and fixtures uses the app's convention. Changing the convention is an app-wide decision and out of scope.
- **`.tsx` tests need `// @vitest-environment jsdom` on line 1** (`vitest.config.ts:43`), and this repo has **no `@testing-library/user-event`** — use `fireEvent` + `act` like the existing row test does.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/model-manager-types.ts` | **Modify.** Add `DownloadManifest`, `LocalModelStatus`; extend `InstalledLocalModel`; delete `OrphanedPartial`. |
| `src/main/models/download-manifest.ts` | **Create.** Write / read / remove the manifest. The only module that knows the file's name and shape. |
| `src/main/models/model-downloader.ts` | **Modify.** Write the manifest before the first byte; refuse a same-file download from a different repo; remove the manifest on clean completion; delete `activePartialNames`. |
| `src/main/engine/cache-scan.ts` | **Modify.** Add `scanLocalDownloads` + `isComplete` (a manifest alone makes a row); derive `scanGgufCache` from them; delete `scanPartialFiles`. |
| `src/main/engine/engine-manager.ts` | **Modify.** `installedModels()` returns the three states; `deleteModel()` removes the manifest. |
| `src/main/models/model-manager.ts` | **Modify.** Delete `orphanedPartials()`; disk guard subtracts bytes already on disk; new `resume()` reads the manifest. |
| `src/main/models/fit-estimator.ts` | **Modify.** `checkDiskSpace` takes bytes already on disk. |
| `src/renderer/components/LocalModelsSection.tsx` | **Modify.** One row component for all three states plus live progress and the download's own failure message; retire `InstalledRow` and `PartialRow`. |
| `src/renderer/dev/workbench/mock-shim.ts` | **Modify.** Fixture data for the three row states and a fake live download so the mid-resume state can be photographed. |
| `scripts/ui-review/plans/overlays.json` (in `youcoded-dev`) | **Modify.** Three rig steps: discard confirmation, delete confirmation, mid-resume. |
| Channel surfaces | **Modify.** `src/shared/types.ts`, `src/main/preload.ts`, `src/main/ipc-handlers.ts`, `src/main/remote-server.ts`, `src/renderer/remote-shim.ts`, `src/renderer/hooks/useIpc.ts`, `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. |
| Tests | `tests/download-manifest.test.ts` (create), `tests/model-manager.test.ts` (create), `tests/local-models-row.test.tsx` (renamed from `local-models-partial-row.test.tsx`), plus additions to `cache-scan`, `model-downloader`, `engine-manager`, `fit-estimator`, `ipc-channels`. |

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
- Modify: `src/shared/model-manager-types.ts:65-86`

**Interfaces:**
- Consumes: nothing.
- Produces: `DownloadManifest`, `LocalModelStatus`, extended `InstalledLocalModel`. Every later task uses these names.

- [ ] **Step 1: Replace the `InstalledLocalModel` block and delete `OrphanedPartial`**

Replace lines 65–86 of `src/shared/model-manager-types.ts` (the `lastUsedAt` comment through the end of `OrphanedPartial`) with:

```ts
/** What state a download on disk is in. A model is only usable when every
 *  declared part is published — see docs/active/specs/2026-08-26-model-download-resume-design.md.
 *    complete    — every part present; the ordinary case
 *    unfinished  — short of parts (a .partial, or nothing but a manifest yet),
 *                  WITH a manifest → resumable
 *    untraceable — short of parts, NO manifest (downloaded before manifests
 *                  existed) → we cannot know where it came from, so no Resume */
export type LocalModelStatus = 'complete' | 'unfinished' | 'untraceable';

export interface InstalledLocalModel {
  id: string;                 // the router-served model id (filename minus .gguf)
  sizeBytes: number;          // bytes ON DISK: published parts, plus the .partial when unfinished
  // From the manifest when there is one (the exact string Hugging Face used,
  // which is what live download-progress events carry), else parsed from the
  // filename; null when unrecognized. WHY: the renderer matches a live download
  // to its row on repo + quant, so the row must carry the same quant string.
  quant: string | null;
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
  files: string[];                              // repo-relative paths, part 1 first
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
- Modify: `/home/destin/youcoded-dev/scripts/ui-review/plans/overlays.json` (after the `providers-local-scrolled` entry, `:296`)

**Interfaces:**
- Consumes: `InstalledLocalModel`, `LocalModelStatus` from Task 1.
- Produces: `LocalModelRow` (exported for tests), replacing `InstalledRow` and `PartialRow`.

- [ ] **Step 1: Give the workbench the three row states and a fake live download**

In `src/renderer/dev/workbench/mock-shim.ts`, replace the `models` namespace (currently `memoryCheck` only, line 518) with:

```ts
  // One fixture per row state, so a design review sees all three at once.
  // Byte counts are Destin's real 2026-08-26 interruption — a four-file split
  // GGUF stranded at part 3 — so the sheets show realistic numbers rather than
  // round ones that hide formatting bugs. NOTE the app's gb() divides by 1024³:
  // 79_674_559_677 renders as 74.2 GB, 121_334_654_784 as 113.0 GB.
  const LOCAL_MODELS: InstalledLocalModel[] = [
    {
      id: 'Qwen3.5-9B-Q8_0',
      sizeBytes: 9_527_502_048,
      quant: 'Q8_0', quantDescription: 'Highest quality quantization — near-original output',
      parts: 1, status: 'complete', partsPresent: 1,
      totalSizeBytes: null, repo: null,
    },
    {
      id: 'Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004',
      sizeBytes: 79_674_559_677,
      quant: 'UD-Q4_K_XL', quantDescription: 'Balanced quality and size — recommended',
      parts: 4, status: 'unfinished', partsPresent: 2,
      totalSizeBytes: 121_334_654_784, repo: 'unsloth/Qwen3.8-Flash-Next-GGUF',
    },
    {
      id: 'Older-Model-UD-Q4_K_XL-00001-of-00002',
      sizeBytes: 4_100_000_000,
      quant: 'UD-Q4_K_XL', quantDescription: 'Balanced quality and size — recommended',
      parts: 2, status: 'untraceable', partsPresent: 1,
      totalSizeBytes: null, repo: null,
    },
  ];

  // A fake progress stream so the MID-RESUME state (spec §4) can be photographed:
  // Resume emits a 'downloading' event at ~70% and then creeps, never finishing.
  const progressListeners = new Set<(p: DownloadProgress) => void>();
  const emitProgress = (p: DownloadProgress) => { for (const cb of progressListeners) cb(p); };
  let fakeTimer: ReturnType<typeof setInterval> | null = null;

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

    installed: async () => LOCAL_MODELS,
    curated: async () => [],
    delete: async () => true,
    onDownloadProgress: (cb: (p: DownloadProgress) => void) => {
      progressListeners.add(cb);
      return () => { progressListeners.delete(cb); };
    },
    resume: async (modelId: string) => {
      const m = LOCAL_MODELS.find((x) => x.id === modelId);
      if (!m || m.status !== 'unfinished' || !m.repo) throw new Error('Nothing to resume.');
      let received = 85_000_000_000;
      const base = {
        downloadId: 'wb-resume-1', repo: m.repo, quant: m.quant ?? '',
        totalBytes: m.totalSizeBytes ?? 0, parts: m.parts, currentPart: 3,
      };
      if (fakeTimer) clearInterval(fakeTimer);
      setTimeout(() => emitProgress({ ...base, state: 'downloading', receivedBytes: received }), 300);
      fakeTimer = setInterval(() => {
        received += 1_000_000_000;
        emitProgress({ ...base, state: 'downloading', receivedBytes: received });
      }, 400);
      return { downloadId: base.downloadId };
    },
    downloadCancel: async (downloadId: string) => {
      if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null; }
      const m = LOCAL_MODELS[1];
      emitProgress({
        downloadId, repo: m.repo ?? '', quant: m.quant ?? '', state: 'cancelled',
        receivedBytes: m.sizeBytes, totalBytes: m.totalSizeBytes ?? 0, parts: m.parts, currentPart: 3,
      });
      return true;
    },
  };
```

Add `InstalledLocalModel` and `DownloadProgress` to the file's type imports from `'../../../shared/model-manager-types'`.

- [ ] **Step 2: Register the new mock members in `HAND_WRITTEN`**

In the same file, add to the `HAND_WRITTEN` array (after `'providers.catalog', 'models.memoryCheck',`):

```ts
  'models.installed', 'models.curated', 'models.delete', 'models.resume',
  'models.onDownloadProgress', 'models.downloadCancel',
```

WHY: `tests/workbench-mock-contract.test.ts` only checks members listed here against `preload.ts`. A hand-written mock missing from this list escapes the check entirely.

- [ ] **Step 3: Verify the mock contract test fails on `models.resume`**

Run: `npx vitest run tests/workbench-mock-contract.test.ts`
Expected: FAIL — `models.resume` is not in `preload.ts` yet.

- [ ] **Step 4: Declare `models:resume` in the workbench-visible surfaces so the contract holds**

`src/shared/types.ts` — add after `MODELS_INSTALLED` (`:1384`):

```ts
  // Resume an interrupted download from its manifest (2026-08-26) — invoke(modelId)
  // → { downloadId }. Replaces MODELS_ORPHANED_PARTIALS, removed the same day.
  MODELS_RESUME: 'models:resume',
```

`src/main/preload.ts` — add the same constant to the `IPC` map next to `MODELS_INSTALLED`, and add to the `models` bridge object next to `installed`:

```ts
    resume: (modelId: string) => ipcRenderer.invoke(IPC.MODELS_RESUME, modelId),
```

`src/renderer/hooks/useIpc.ts` — in the `models` block (`:332-336`), replace the untyped `installed` line, the two-line orphan comment, and the `orphanedPartials` line with:

```ts
        installed: () => Promise<import('../../shared/model-manager-types').InstalledLocalModel[]>;
        // Resume an interrupted download (2026-08-26). Main reads the manifest
        // written beside the .partial — no Hugging Face round trip.
        resume: (modelId: string) => Promise<{ downloadId: string }>;
```

- [ ] **Step 5: Re-run the contract test**

Run: `npx vitest run tests/workbench-mock-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Replace `InstalledRow` and `PartialRow` with one row**

In `src/renderer/components/LocalModelsSection.tsx`, add below `gb()` (`:24-26`):

```ts
// The number alone, for "74.2 of 113.0 GB" — one unit at the end of the phrase.
function gbNum(bytes: number): string {
  return (bytes / 1073741824).toFixed(1);
}
```

Then replace the whole `InstalledRow` function (`:434-505`) and the whole `PartialRow` function (`:507-621`, including its "Exported (named)" comment) with the single component below. Keep the file's existing imports; add nothing new except what is used here.

```tsx
// ── Local model rows ─────────────────────────────────────────────────────────

/** Percent of a download that is on disk. Returns null when the total is
 *  unknown (an untraceable row) — the caller then shows NO percentage rather
 *  than inventing a denominator. */
function percentOf(onDisk: number, total: number | null): number | null {
  if (total == null || total <= 0) return null;
  return Math.min(100, Math.round((onDisk / total) * 100));
}

// Exported (named) so tests can pin each row state without booting the whole
// LocalModelsSection (which needs the full models API mocked).
export function LocalModelRow({
  model, progress, onRefresh,
}: {
  model: InstalledLocalModel;
  /** The NEWEST download-progress event for this model this session, in ANY
   *  state — matched on repo + quant by the parent (spec §3.5a). Undefined
   *  when nothing has been downloaded this session. */
  progress?: DownloadProgress;
  onRefresh: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Failures of the buttons on this row (resume refused, delete failed).
  const [actionError, setActionError] = useState<string | null>(null);

  const live = progress && (progress.state === 'downloading' || progress.state === 'verifying')
    ? progress : undefined;
  const onDisk = live ? live.receivedBytes : model.sizeBytes;
  const total = live ? live.totalBytes : model.totalSizeBytes;
  const pct = percentOf(onDisk, total);

  // WHY a download's own failure is read from the progress stream: resume()
  // returns the moment the download STARTS, so a click handler never sees an
  // HTTP error or an integrity failure — those arrive later as an 'error'
  // event, and this line is the only place that message reaches the user.
  const downloadError = progress?.state === 'error' ? (progress.message ?? 'Download failed') : null;
  const error = actionError ?? downloadError;

  const resume = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await window.claude.models.resume(model.id);
      await onRefresh();
    } catch (e) {
      // Surface the real refusal (disk guard, already downloading, no manifest).
      // A resume that silently did nothing was the original PartialRow bug.
      setActionError(e instanceof Error ? e.message : 'Could not resume the download.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setActionError(null);
    try {
      // If a download of this model is still live, cancel it and AWAIT the
      // 'cancelled' event FIRST — removing the .partial out from under an open
      // write stream races.
      if (live) {
        await new Promise<void>((resolve) => {
          const off = window.claude.models.onDownloadProgress((p: DownloadProgress) => {
            if (p.downloadId === live.downloadId && p.state === 'cancelled') { off(); resolve(); }
          });
          window.claude.models.downloadCancel(live.downloadId).catch(() => { off(); resolve(); });
          // Safety net so a lost cancelled event can't hang the button forever.
          setTimeout(() => { off(); resolve(); }, 5000);
        });
      }
      await window.claude.models.delete(model.id);
      setConfirming(false);
      await onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete the model.');
    } finally {
      setBusy(false);
    }
  };

  // Spec §3.2: an unfinished download is DISCARDED; a model (complete, or one
  // we can't resume) is DELETED. Destin decides at the workbench gate whether
  // one word should serve both.
  const removeLabel = model.status === 'unfinished' ? 'Discard' : 'Delete';

  const subtitle =
    live
      ? `${live.state === 'verifying' ? 'Verifying…' : 'Downloading…'} · ${pct ?? 0}% — ${gbNum(onDisk)} of ${gb(total ?? 0)}`
        + (live.parts > 1 ? ` · part ${live.currentPart} of ${live.parts}` : '')
    : model.status === 'complete'
      ? [gb(model.sizeBytes), model.quant, model.quantDescription].filter(Boolean).join(' · ')
    : model.status === 'unfinished' && pct != null
      ? `${pct}% — ${gbNum(onDisk)} of ${gb(total ?? 0)}`
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
            {model.status === 'unfinished' && !live && (
              <Button variant="secondary" size="sm" onClick={() => void resume()} disabled={busy}>
                Resume
              </Button>
            )}
            {live && (
              // Same word as the RepoCard's in-flight control (DownloadProgressRow):
              // one download, one verb wherever it appears.
              <Button variant="secondary" size="sm" onClick={() => void window.claude.models.downloadCancel(live.downloadId)}>
                Cancel
              </Button>
            )}
            <Button variant="danger-outline" size="sm" onClick={() => setConfirming(true)} disabled={busy} className="shrink-0">
              {removeLabel}
            </Button>
          </div>
        )}
      </div>

      {live && (
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

      {/* Consequence-gated removal — plain-language warning naming the real size. */}
      {confirming && (
        <div className="mt-2 space-y-2">
          <Callout tone="danger">
            {model.status === 'complete'
              ? `This removes the model file (${gb(model.sizeBytes)}) from this computer. Re-downloading it later will take a while.`
              : `${removeLabel} ${gb(model.sizeBytes)}? This removes every downloaded piece of this model.`}
          </Callout>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
              Keep
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={busy} className="flex-1">
              {busy ? 'Removing…' : model.status === 'complete' ? 'Delete model' : `${removeLabel} download`}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-3xs text-destructive-fg mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Point the list at the new row and attach live progress**

In `ModelBrowser` (`LocalModelsSection.tsx:179-247`), replace the `partials` line (`:181`) with:

```tsx
  // A download and its disk row are ONE row — matched on repo + quant, both of
  // which a resumable row carries from its manifest (spec §3.5a). The NEWEST
  // event wins, in any state: ulids sort by creation time, so after Resume the
  // fresh attempt's events replace the failed attempt's error line.
  const progressFor = (m: InstalledLocalModel): DownloadProgress | undefined =>
    m.repo
      ? Object.values(downloads)
        .filter((d) => d.repo === m.repo && d.quant === m.quant)
        .sort((a, b) => (a.downloadId < b.downloadId ? 1 : -1))[0]
      : undefined;
```

In the JSX, replace the Installed block (`:220-234`) with:

```tsx
          {installedFiltered.length > 0 && (
            <div className="space-y-2">
              <p className="text-3xs font-medium text-fg-muted tracking-wider uppercase">Installed</p>
              {installedFiltered.map((m) => (
                <LocalModelRow key={m.id} model={m} progress={progressFor(m)} onRefresh={onRefreshInstalled} />
              ))}
            </div>
          )}
```

Then in the `nothing` computation (`:192`) delete the `partials.length === 0 &&` term. There is no separate in-progress list any more: a download has a row from the moment it starts, because its manifest is written before its first byte (Task 4) and the scan lists manifests (Task 5).

- [ ] **Step 8: Refresh the list when a download starts, not only when it finishes**

In `LocalModelsSection`'s subscription effect (`:65-69`), replace the handler body with:

```tsx
    const seen = new Set<string>();
    const off = window.claude.models.onDownloadProgress((p: DownloadProgress) => {
      setDownloads((prev) => ({ ...prev, [p.downloadId]: p }));
      // Refresh on the FIRST event for a download (a brand-new one has no row in
      // the list yet) and on every terminal state (spec §3.5a). No race: the
      // manifest is written synchronously inside start(), before any event.
      const first = !seen.has(p.downloadId);
      seen.add(p.downloadId);
      if (first || p.state === 'done' || p.state === 'error' || p.state === 'cancelled') {
        void refreshInstalled();
      }
    });
    return off;
```

- [ ] **Step 9: Remove the now-unused prop threading**

`ModelBrowser` no longer passes `setDownloads` or `quantOptsByKeyRef` to a row. Delete the `setDownloads` prop from `ModelBrowser`'s props type, its destructuring, and its call site in `LocalModelsSection` (`:88`). Keep the `setDownloads` state itself — the subscription still writes to it. Keep `quantOptsByKeyRef` — `RepoCard` still uses it. Run `npx tsc --noEmit` and `npx eslint src/renderer/components/LocalModelsSection.tsx`; remove anything they report as unused (`QuantWithFit` may still be needed by `RepoCard`).

- [ ] **Step 10: Boot-check the workbench**

Run: `node scripts/workbench-boot-check.mjs`
Expected: PASS on all registered routes, zero console errors. (The unit suite has passed while the app crashed at boot three times — this check is not optional.)

- [ ] **Step 11: Teach the screenshot rig the states it must photograph**

The only rig step touching this panel today is `providers-local-scrolled` (`overlays.json:296`), which shows the rows at rest. Insert these three entries immediately after it. They use the rig's `clickText` action (matches visible text exactly) and a `js:` expect (must be truthy after the actions — a shot that fails it lands in `coverage.md` as a miss).

```json
  {
   "name": "local-models-discard-confirm",
   "actions": [
    { "click": "[title=Settings]", "settle": 700 },
    { "click": "js:[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(\"Model Providers\"))", "settle": 900 },
    { "scrollDialog": "bottom" },
    { "clickText": "Discard", "tag": "button", "settle": 500 }
   ],
   "expect": "js:document.body.textContent.includes('Discard 74.2 GB?')"
  },
  {
   "name": "local-models-delete-confirm",
   "actions": [
    { "click": "[title=Settings]", "settle": 700 },
    { "click": "js:[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(\"Model Providers\"))", "settle": 900 },
    { "scrollDialog": "bottom" },
    { "clickText": "Delete", "tag": "button", "settle": 500 }
   ],
   "expect": "js:document.body.textContent.includes('This removes the model file')"
  },
  {
   "name": "local-models-resuming",
   "actions": [
    { "click": "[title=Settings]", "settle": 700 },
    { "click": "js:[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(\"Model Providers\"))", "settle": 900 },
    { "scrollDialog": "bottom" },
    { "clickText": "Resume", "tag": "button", "settle": 1200 }
   ],
   "expect": "js:document.body.textContent.includes('Downloading…')"
  },
```

- [ ] **Step 12: Capture the sheets**

```bash
bash /home/destin/youcoded-dev/scripts/ui-review/run-review.sh /home/destin/youcoded-dev/worktrees/download-resume
```

Read `coverage.md` first. `providers-local-scrolled` and the three new shots must all be `covered`; a surface that is not covered is unreviewed, never "fine".

- [ ] **Step 13: STOP. Hand the sheets to Destin.**

Present the four shots in all six themes. Judge against `docs/active/design/2026-08-25-ui-design-guide.md` first and say what you found. Then put these decisions to him explicitly — each is a subjective call the spec made or left open, and none is final until he says so:

1. **Discard vs Delete.** The spec says *Discard* for an unfinished download and *Delete* for a model. One word for both would be simpler; the plan follows the spec until he chooses.
2. **Cancel vs Pause** on a row that is downloading right now. The plan says *Cancel* because the card above the list already says *Cancel* for the same download; *Pause* is more honest about what happens (the bytes stay) but would be a second word for one action.
3. **The progress line** reads `66% — 74.2 of 113.0 GB`. The numbers are the app's binary GB, not Hugging Face's decimal GB — he should know the row will never match the number on the HF page.
4. **The untraceable explanation** is a second line under the row, always visible. Alternative: only show it on hover / in an (i) popover.
5. **The confirmation copy** for an unfinished download: *"Discard 74.2 GB? This removes every downloaded piece of this model."* with a *Discard download* button.

**Do not proceed to Task 3 until Destin approves.** If he asks for changes, iterate in the workbench and re-capture.

- [ ] **Step 14: Commit**

```bash
git add src/renderer src/shared/types.ts src/main/preload.ts
git commit -m "feat(models): unified local-model row with the three download states (workbench design pass)"
cd /home/destin/youcoded-dev && git add scripts/ui-review/plans/overlays.json \
  && git commit -m "chore(ui-review): photograph the local-model discard/delete confirmations and the mid-resume state"
```

---

## Task 3: The download manifest module

**Files:**
- Create: `src/main/models/download-manifest.ts`
- Test: `tests/download-manifest.test.ts`

**Interfaces:**
- Consumes: `DownloadManifest`, `QuantOption`.
- Produces: `MANIFEST_SUFFIX`, `manifestPathFor(cacheDir, firstFileBasename)`, `writeManifest(cacheDir, repo, quant, startedAt)`, `readManifest(cacheDir, firstFileBasename)`, `removeManifest(cacheDir, firstFileBasename)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/download-manifest.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MANIFEST_SUFFIX, manifestPathFor, writeManifest, readManifest, removeManifest,
} from '../src/main/models/download-manifest';
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
    expect(MANIFEST_SUFFIX).toBe('.download.json');
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

/** `<first-file-basename>.gguf.download.json`. Exported so cache-scan can
 *  recognise a manifest without knowing anything else about it. */
export const MANIFEST_SUFFIX = '.download.json';

/** The manifest path for a download, keyed to its FIRST file's basename — the
 *  same id models:delete addresses a split model by. */
export function manifestPathFor(cacheDir: string, firstFileBasename: string): string {
  return path.join(cacheDir, `${firstFileBasename}${MANIFEST_SUFFIX}`);
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
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/models/download-manifest.ts tests/download-manifest.test.ts
git commit -m "feat(models): download manifest — records a download's source beside its files"
```

---

## Task 4: The downloader writes and removes the manifest

**Files:**
- Modify: `src/main/models/model-downloader.ts:36-51` (`start`), `:117` (the `done` line in `run`)
- Test: `tests/model-downloader.test.ts`

**Interfaces:**
- Consumes: `writeManifest`, `readManifest`, `removeManifest` from Task 3.
- Produces: no new exports. The behavioural contract: a manifest exists from `start()` until the whole set completes cleanly, and `start()` refuses to continue a file that another repo's download left behind.

- [ ] **Step 1: Write the failing tests**

Append to `tests/model-downloader.test.ts`, inside the existing `describe('ModelDownloader', …)`:

```ts
  // A fetch that drips bytes until the abort signal fires. Copied from the
  // cancel test above for the same reason it exists there: a fake that never
  // resolves cannot be cancelled, and the test hangs to timeout instead of
  // asserting anything.
  const dripUntilAbort = (async (_url: any, init?: any) => {
    const signal: AbortSignal = init.signal;
    return new Response(new ReadableStream({
      pull(c) {
        if (signal.aborted) { c.error(new DOMException('Aborted', 'AbortError')); return; }
        c.enqueue(new Uint8Array(4));
        return new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 20);
          signal.addEventListener('abort',
            () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); },
            { once: true });
        });
      },
    }), { status: 200, headers: { 'content-length': '99999' } });
  }) as typeof fetch;
  const MANIFEST = 'M-UD-Q4_K_XL-00001-of-00002.gguf.download.json';

  it('writes the manifest BEFORE the first byte, and removes it on clean completion', async () => {
    const seen: string[] = [];
    const watching: typeof fetch = (async (url: any, init?: any) => {
      // Record whether the manifest already exists at the moment of each fetch.
      seen.push(fs.existsSync(path.join(dir, MANIFEST)) ? 'yes' : 'no');
      return fetchServing(bodies)(url, init);
    }) as typeof fetch;
    const dl = new ModelDownloader(dir, watching);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id);
    expect(seen).toEqual(['yes', 'yes']);   // present for every part's fetch
    expect(fs.existsSync(path.join(dir, MANIFEST))).toBe(false);
  });

  it('keeps the manifest when the download is cancelled — that is what makes resume possible', async () => {
    const dl = new ModelDownloader(dir, dripUntilAbort);
    const id = dl.start('unsloth/M-GGUF', quantOpt(false), () => {});
    await new Promise((r) => setTimeout(r, 60));
    dl.cancel(id);
    await dl.wait(id).catch(() => {});
    expect(fs.existsSync(path.join(dir, MANIFEST))).toBe(true);
  });

  it('keeps the manifest when the download errors', async () => {
    const dead: typeof fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
    const dl = new ModelDownloader(dir, dead);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id).catch(() => {});
    expect(fs.existsSync(path.join(dir, MANIFEST))).toBe(true);
  });

  it('records the repo and the whole file set, so resume needs no network', async () => {
    const dead: typeof fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
    const dl = new ModelDownloader(dir, dead);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id).catch(() => {});
    const m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8'));
    expect(m.repo).toBe('unsloth/M-GGUF');
    expect(m.quant).toBe('UD-Q4_K_XL');
    expect(m.files).toEqual(quantOpt().files);
    expect(m.totalSizeBytes).toBe(quantOpt().totalSizeBytes);
  });

  it('refuses to continue a file that a DIFFERENT repo left behind', async () => {
    // Six+ Hugging Face accounts publish byte-identical filenames with different
    // builds (spec §1b). Range-continuing repo A's bytes with repo B's would
    // only be discovered when the integrity check fails at the very end.
    const dead: typeof fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
    const dl = new ModelDownloader(dir, dead);
    const id = dl.start('unsloth/M-GGUF', quantOpt(), () => {});
    await dl.wait(id).catch(() => {});
    expect(() => dl.start('bartowski/M-GGUF', quantOpt(), () => {}))
      .toThrow(/already partly downloaded from unsloth\/M-GGUF/);
    // The same repo may continue.
    expect(() => dl.start('unsloth/M-GGUF', quantOpt(), () => {})).not.toThrow();
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/model-downloader.test.ts -t manifest`
Expected: FAIL — the manifest file never exists.

- [ ] **Step 3: Write the manifest in `start()`**

In `src/main/models/model-downloader.ts`, add the import:

```ts
import { writeManifest, readManifest, removeManifest } from './download-manifest';
```

In `start()`, immediately after the "already downloading" loop and before `const downloadId = ulid();`, insert:

```ts
    const firstFile = path.basename(quant.files[0]);
    // The manifest is what makes this download resumable after a crash — write
    // it BEFORE any bytes, so a crash one second from now still leaves a trail.
    // mkdir here (not only in run()) because the manifest lands in the same dir.
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const prior = readManifest(this.cacheDir, firstFile);
    if (prior && prior.repo !== repo) {
      // Same filename, different publisher: the .partial on disk holds ANOTHER
      // build's bytes, and Range-continuing it would fail the integrity check
      // only after the whole remainder was fetched. The prior download has a
      // row in Local Models (its manifest alone makes one), so the user can
      // discard it there.
      throw new Error(
        `${firstFile} is already partly downloaded from ${prior.repo}. `
        + `Discard that download in Local Models before downloading it from ${repo}.`
      );
    }
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
Expected: PASS, all pre-existing tests plus the 5 new ones.

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
- Consumes: `MANIFEST_SUFFIX` (Task 3).
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
  hasManifest: boolean;    // a manifest file exists (not yet parsed — engine-manager does that)
}
```

`scanGgufCache` keeps its signature and is now derived. `scanPartialFiles` is **deleted**.

- [ ] **Step 1: Write the failing tests**

In `tests/cache-scan.test.ts`, delete the whole `describe('scanPartialFiles', …)` block and the comment above it (`:43-45`), then change the existing import line (`:5`) to:

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
      partsDeclared: 2, partsPresent: 2, bytesPublished: 30, bytesPartial: 0,
      hasPartial: false, hasManifest: false,
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

  it('a manifest ALONE is a download — one that stopped before its first byte', () => {
    // The manifest is written before any fetch (model-downloader.ts start()).
    // Without this row a download that failed on its first request would be
    // invisible, unresumable, and its manifest would never be cleaned up.
    touch('New-UD-Q4_K_XL-00001-of-00003.gguf.download.json', 100);
    const [d] = scanLocalDownloads(dir);
    expect(d).toMatchObject({
      modelId: 'New-UD-Q4_K_XL-00001-of-00003', firstFileName: 'New-UD-Q4_K_XL-00001-of-00003.gguf',
      partsDeclared: 3, partsPresent: 0, bytesPublished: 0, bytesPartial: 0,
      hasPartial: false, hasManifest: true,
    });
    expect(isComplete(d)).toBe(false);
  });

  it('a manifest beside its published parts is the SAME download, not a second one', () => {
    touch('M-Q4_K_M.gguf', 5);
    touch('M-Q4_K_M.gguf.download.json', 100);
    touch('notes.txt', 100);
    const downloads = scanLocalDownloads(dir);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ bytesPublished: 5, hasManifest: true });
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

  it('returns [] for a missing directory', () => {
    expect(scanLocalDownloads(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('scanGgufCache is scanLocalDownloads filtered to complete sets', () => {
  it('omits an incomplete split model entirely — the picker must never offer it', () => {
    touch('Whole-Q4_K_M.gguf', 5);
    touch('Half-UD-Q4_K_XL-00001-of-00004.gguf', 10);
    touch('Half-UD-Q4_K_XL-00003-of-00004.gguf.partial', 5);
    touch('New-Q4_K_M.gguf.download.json', 50);
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

Replace the body of `src/main/engine/cache-scan.ts` below the header comment (keep the header, updating its last paragraph) with:

```ts
import * as fs from 'fs';
import * as path from 'path';
import type { EngineModel } from '../../shared/engine-types';
import { MANIFEST_SUFFIX } from '../models/download-manifest';

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
  hasManifest: boolean;    // a manifest file exists (parsed by engine-manager, not here)
}

/** A download is usable only when every declared part is published. A stray
 *  .partial or manifest alongside a full set does NOT demote it — publication
 *  is an atomic rename, so the file count is the authority (spec §3.2). */
export function isComplete(d: LocalDownload): boolean {
  return d.partsPresent >= d.partsDeclared;
}

/** Every GGUF download in the cache dir, complete or not — the Settings view.
 *  Groups a split set under its first part and reports published vs in-flight
 *  bytes separately. A manifest with no bytes yet is a download too (it is
 *  written before the first fetch). This is the ONE scan; scanGgufCache is
 *  this filtered, so the two can never disagree about what is on disk. */
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
    const manifest = ent.name.endsWith(`.gguf${MANIFEST_SUFFIX}`);
    if (!published && !partial && !manifest) continue;   // notes, .tmp, anything else
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(path.join(cacheDir, ent.name)).size; } catch { continue; } // raced delete
    // The final filename this entry belongs to ('X.gguf.partial' → 'X.gguf',
    // 'X.gguf.download.json' → 'X.gguf').
    const finalName = partial ? ent.name.replace(/\.partial$/i, '')
      : manifest ? ent.name.slice(0, -MANIFEST_SUFFIX.length)
      : ent.name;
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
        hasManifest: false,
      };
      sets.set(firstFileName, set);
    }
    if (published) { set.partsPresent += 1; set.bytesPublished += sizeBytes; }
    else if (partial) { set.hasPartial = true; set.bytesPartial += sizeBytes; }
    else { set.hasManifest = true; }
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

## Task 6: `installedModels()` reports the three states; delete cleans up

**Files:**
- Modify: `src/main/engine/engine-manager.ts:17` (import), `:439-452` (`installedModels`), `:460-490` (`deleteModel`)
- Test: `tests/engine-manager.test.ts`

**Interfaces:**
- Consumes: `scanLocalDownloads`, `isComplete` (Task 5); `readManifest`, `removeManifest` (Task 3); `InstalledLocalModel` (Task 1).
- Produces: `EngineManager.installedModels(): Promise<InstalledLocalModel[]>` (extended shape). Resume itself lives in `ModelManager` (Task 7), which owns the cache dir and the downloader — `EngineManager` gains nothing for it.

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

  const manifest = (repo: string, files: string[], totalSizeBytes: number) => JSON.stringify({
    v: 1, repo, quant: 'UD-Q4_K_XL', files, totalSizeBytes, sha256ByFile: {}, startedAt: 1,
  });

  it('reports a complete model, an unfinished one with its manifest, and an untraceable one', async () => {
    // complete
    fs.writeFileSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf'), Buffer.alloc(50));
    // unfinished + manifest
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00004.gguf'), Buffer.alloc(10));
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00003-of-00004.gguf.partial'), Buffer.alloc(5));
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00004.gguf.download.json'),
      manifest('unsloth/Half-GGUF', ['Half-UD-Q4_K_XL-00001-of-00004.gguf'], 100));
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
      totalSizeBytes: 100, repo: 'unsloth/Half-GGUF', quant: 'UD-Q4_K_XL',
    });
    expect(byId['Old-UD-Q4_K_XL-00001-of-00002']).toMatchObject({
      status: 'untraceable', sizeBytes: 20, parts: 2, partsPresent: 1,
      totalSizeBytes: null, repo: null,
    });
  });

  it('a download that stopped before its first byte is an unfinished row at 0 bytes', async () => {
    fs.writeFileSync(path.join(cacheDir, 'New-Q4_K_M.gguf.download.json'),
      manifest('unsloth/New-GGUF', ['New-Q4_K_M.gguf'], 100));
    const rows = await manager.installedModels();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'New-Q4_K_M', status: 'unfinished', sizeBytes: 0, totalSizeBytes: 100, repo: 'unsloth/New-GGUF',
    });
  });

  it('an unreadable manifest with no bytes is nothing the user can act on — dropped and removed', async () => {
    fs.writeFileSync(path.join(cacheDir, 'Junk-Q4_K_M.gguf.download.json'), '{not json');
    expect(await manager.installedModels()).toEqual([]);
    expect(fs.existsSync(path.join(cacheDir, 'Junk-Q4_K_M.gguf.download.json'))).toBe(false);
  });

  it('removes a stale manifest left beside a COMPLETE set', async () => {
    fs.writeFileSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf'), Buffer.alloc(50));
    fs.writeFileSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf.download.json'),
      manifest('a/b', ['Whole-Q4_K_M.gguf'], 50));
    const rows = await manager.installedModels();
    expect(rows[0].status).toBe('complete');
    expect(fs.existsSync(path.join(cacheDir, 'Whole-Q4_K_M.gguf.download.json'))).toBe(false);
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

Run: `npx vitest run tests/engine-manager.test.ts -t 'local downloads'`
Expected: FAIL — `status` is undefined.

- [ ] **Step 3: Rewrite `installedModels()`**

In `src/main/engine/engine-manager.ts`, replace the `scanGgufCache` import (`:17`) with:

```ts
import { scanGgufCache, scanLocalDownloads, isComplete } from './cache-scan';
import { readManifest, removeManifest } from '../models/download-manifest';
```

and replace `installedModels()` with:

```ts
  /** Every download in the cache dir, complete or not, with the state the Local
   *  Models screen renders. Unlike liveModels() this deliberately does NOT
   *  filter incomplete sets — Settings is where you act on them. */
  async installedModels(): Promise<InstalledLocalModel[]> {
    const cacheDir = readEngineConfig(this.home).cacheDir;
    const rows: InstalledLocalModel[] = [];
    for (const d of scanLocalDownloads(cacheDir)) {
      const complete = isComplete(d);
      if (complete && d.hasManifest) {
        // The downloader removes the manifest on clean completion, so one here
        // outlived a crash between publish and cleanup. A complete set has
        // nothing to resume: best-effort cleanup, never a reason to fail the list.
        try { removeManifest(cacheDir, d.firstFileName); } catch { /* best-effort */ }
      }
      const manifest = !complete && d.hasManifest ? readManifest(cacheDir, d.firstFileName) : null;
      const bytesOnDisk = d.bytesPublished + d.bytesPartial;
      if (!complete && bytesOnDisk === 0 && !manifest) {
        // Only an unreadable manifest, no bytes: nothing to resume, nothing to
        // delete, nothing to show. Remove the fragment so it cannot accumulate.
        try { removeManifest(cacheDir, d.firstFileName); } catch { /* best-effort */ }
        continue;
      }
      const parsed = parseGgufName(d.firstFileName);
      rows.push({
        id: d.modelId,
        // Bytes on disk. For an unfinished set that includes the .partial, so
        // the discard confirmation names what the user actually gives up.
        sizeBytes: complete ? d.bytesPublished : bytesOnDisk,
        // The manifest's quant is the exact string Hugging Face used — the one
        // live progress events carry, so the renderer can match them to this row.
        quant: manifest?.quant ?? parsed?.quant ?? null,
        quantDescription: parsed ? quantDescription(parsed.quant) : null,
        parts: d.partsDeclared,
        status: complete ? 'complete' : manifest ? 'unfinished' : 'untraceable',
        partsPresent: d.partsPresent,
        totalSizeBytes: manifest?.totalSizeBytes ?? null,
        repo: manifest?.repo ?? null,
      });
    }
    return rows;
  }
```

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
git commit -m "feat(models): installed list reports complete/unfinished/untraceable; a manifest alone is a row"
```

---

## Task 7: `ModelManager` — resume from the manifest, and a disk guard that counts what is left

**Files:**
- Modify: `src/main/models/model-manager.ts:11` (import), `:17-19` (type import), `:120-152` (`download`, `orphanedPartials`)
- Modify: `src/main/models/fit-estimator.ts:99-106` (`checkDiskSpace`)
- Test: `tests/fit-estimator.test.ts`, `tests/model-manager.test.ts` (create — none exists today)

**Interfaces:**
- Consumes: `readManifest` (Task 3).
- Produces: `ModelManager.resume(modelId): Promise<{ downloadId: string }>`. `ModelManager.orphanedPartials()` is **deleted**.

- [ ] **Step 1: Write the failing disk-guard tests**

Append inside `describe('checkDiskSpace', …)` in `tests/fit-estimator.test.ts` (the file already defines `GB = 1024 ** 3`):

```ts
  it('a resume is judged on the bytes REMAINING, not the whole download', () => {
    // 100 GB download, 80 GB already on disk, 30 GB free: refusing this would
    // push the user to delete the very partial that makes it fit (spec §3.7).
    expect(checkDiskSpace(100 * GB, 30 * GB)).not.toBeNull();          // from scratch: refused
    expect(checkDiskSpace(100 * GB, 30 * GB, 80 * GB)).toBeNull();     // resuming: allowed
  });

  it('still refuses when even the remaining bytes do not fit', () => {
    expect(checkDiskSpace(100 * GB, 5 * GB, 80 * GB)).toMatch(/needs about 20\.0 GB/);
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/fit-estimator.test.ts -t remaining`
Expected: FAIL — `checkDiskSpace` takes two arguments.

- [ ] **Step 3: Teach the guard about bytes already on disk**

Replace `checkDiskSpace` in `src/main/models/fit-estimator.ts`:

```ts
/** Refusal message, or null when the download fits. 5% margin covers the
 *  in-flight .partial file.
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

- [ ] **Step 5: Write the failing `ModelManager` tests**

Create `tests/model-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NativeHome } from '../src/main/native-home';
import { EngineManager } from '../src/main/engine/engine-manager';
import { updateEngineConfig } from '../src/main/engine/engine-config';
import { ModelManager } from '../src/main/models/model-manager';
import type { DownloadProgress } from '../src/shared/model-manager-types';

let root: string;
let home: NativeHome;
let cacheDir: string;
let urls: string[];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-mgr-'));
  home = new NativeHome(root);
  cacheDir = path.join(root, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  // Point the manager at the tmp cache — never at ~/.cache/llama.cpp.
  await updateEngineConfig(home, { cacheDir });
  urls = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

// Records every URL the downloader asks for, then fails — the test only needs
// to see WHERE resume went, not to move bytes.
const recordingFetch = (async (url: any) => {
  urls.push(String(url));
  return new Response(null, { status: 500 });
}) as typeof fetch;

function manager(): ModelManager {
  const userData = path.join(root, 'userData');
  const engine = new EngineManager(home, userData, 9999);
  return new ModelManager(home, engine, userData, { fetchImpl: recordingFetch, totalVramBytes: null });
}

describe('ModelManager.resume', () => {
  it('starts a download of the manifest\'s repo and file set — with NO Hugging Face listing call', async () => {
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00002.gguf'), Buffer.alloc(10));
    fs.writeFileSync(path.join(cacheDir, 'Half-UD-Q4_K_XL-00001-of-00002.gguf.download.json'), JSON.stringify({
      v: 1, repo: 'unsloth/Half-GGUF', quant: 'UD-Q4_K_XL',
      files: ['a/Half-UD-Q4_K_XL-00001-of-00002.gguf', 'a/Half-UD-Q4_K_XL-00002-of-00002.gguf'],
      totalSizeBytes: 100, sha256ByFile: {}, startedAt: 1,
    }));
    const mm = manager();
    const settled = new Promise<DownloadProgress>((resolve) => {
      mm.on('download-progress', (p: DownloadProgress) => { if (p.state === 'error') resolve(p); });
    });
    const { downloadId } = await mm.resume('Half-UD-Q4_K_XL-00001-of-00002');
    expect(downloadId).toBeTruthy();
    await settled;
    // Part 1 is already published, so the ONLY request is part 2's resolve URL.
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('unsloth/Half-GGUF');
    expect(urls[0]).toContain('Half-UD-Q4_K_XL-00002-of-00002.gguf');
  });

  it('names the real problem when there is no manifest', async () => {
    fs.writeFileSync(path.join(cacheDir, 'Old-Q4_K_M.gguf.partial'), Buffer.alloc(10));
    await expect(manager().resume('Old-Q4_K_M')).rejects.toThrow(/where it came from/i);
    expect(urls).toEqual([]);
  });
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run tests/model-manager.test.ts`
Expected: FAIL — `resume` is not a function.

- [ ] **Step 7: Pass the on-disk bytes from `download`, add `resume`, delete `orphanedPartials`**

In `src/main/models/model-manager.ts`, replace the `scanPartialFiles` import (`:11`) with:

```ts
import { readManifest } from './download-manifest';
```

remove `OrphanedPartial` from the type import (`:17-19`), then replace the `download` method through the end of `orphanedPartials` (`:120-152`) with:

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
    // Outcome is delivered via progress events; swallow the rejection here so an
    // error can't become an unhandled rejection in main (the UI reads the
    // 'error' progress event). Clear the reservation once the download settles.
    void dl.wait(downloadId).catch(() => {}).finally(() => this.inflight.delete(downloadId));
    return { downloadId };
  }

  cancel(downloadId: string): void { this.getDownloader().cancel(downloadId); }

  /** Continue an interrupted download from the manifest beside it. Deliberately
   *  no network: the interruption that stranded the download is often the
   *  network itself. The downloader skips published parts and Range-continues
   *  the .partial, so this is the original download(repo, quant) call replayed. */
  async resume(modelId: string): Promise<{ downloadId: string }> {
    const manifest = readManifest(this.cacheDir(), `${modelId}.gguf`);
    if (!manifest) {
      // Specific and accurate, per docs/error-message-standards.md — this names
      // the real cause and what the user can do instead. The UI never offers
      // Resume on such a row; this guards the IPC and remote surfaces.
      throw new Error(
        "This download has no record of where it came from, so it can't be resumed automatically. "
        + 'Find the model in search and download it again — it will continue from where it stopped.'
      );
    }
    return this.download(manifest.repo, {
      quant: manifest.quant,
      description: '',
      files: manifest.files,
      totalSizeBytes: manifest.totalSizeBytes,
      sha256ByFile: manifest.sha256ByFile,
    });
  }
```

- [ ] **Step 8: Run the affected suites**

Run: `npx vitest run tests/fit-estimator.test.ts tests/model-manager.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main/models/model-manager.ts src/main/models/fit-estimator.ts tests/fit-estimator.test.ts tests/model-manager.test.ts
git commit -m "feat(models): resume from the manifest; the disk guard counts bytes remaining, not the whole download"
```

---

## Task 8: Channel surgery — `models:orphaned-partials` out, `models:resume` in

**Files (every one, enumerated 2026-08-26 by `rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials' desktop/src desktop/tests app/src`):**
- Modify: `src/shared/types.ts:1385-1387`
- Modify: `src/main/preload.ts:357`, `:1274`
- Modify: `src/main/ipc-handlers.ts:2696-2699`
- Modify: `src/main/remote-server.ts:1218-1227`
- Modify: `src/renderer/remote-shim.ts:1635`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3791`
- Modify: `src/main/models/model-downloader.ts:21-27`, `:66-75` (the `fileNames` field and `activePartialNames()` — their only caller was `orphanedPartials`)
- Test: `tests/ipc-channels.test.ts:894-896`

`src/shared/types.ts`, `preload.ts` and `useIpc.ts` were already edited in Task 2 Step 4 to ADD `models:resume`; this task REMOVES the old channel and wires the rest.

- [ ] **Step 1: Update the parity test first**

In `tests/ipc-channels.test.ts`, replace the `models:orphaned-partials` entry and its two comment lines (`:894-896`) with:

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

and update the comment above it (`:2696-2698`) to describe resume rather than the orphan scan.

`src/main/remote-server.ts` — replace the `case 'models:orphaned-partials'` block and its comment with:

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

This is the shape of the neighbouring `models:delete` case (`remote-server.ts:1201`, `payload.id ?? payload`), including the `{ ok: false, error }` failure reply — a resume that throws must reach a phone as a message, not a silent nothing.

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

`src/main/models/model-downloader.ts` — delete `activePartialNames()` and its comment (`:66-75`), the `fileNames` field and its comment in `ActiveDownload` (`:26`), and the `fileNames:` line in `start()`'s entry literal. Their only caller was `orphanedPartials`; the unified list does not subtract live downloads — it shows them as rows with live progress attached (spec §3.5a).

- [ ] **Step 4: Run the parity test**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Confirm nothing references the dead names**

Run: `rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials|OrphanedPartial|scanPartialFiles|activePartialNames' src tests ../app/src`
Expected: **no output.**

- [ ] **Step 6: Confirm knip sees no dead code**

Run: `npm run knip`
Expected: no new unused exports or class members. (`OrphanedPartial` was deleted in Task 1; this proves nothing else was orphaned by the surgery.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(models): replace models:orphaned-partials with models:resume across all five surfaces"
```

---

## Task 9: Renderer against the real backend

**Files:**
- Modify: `tests/local-models-partial-row.test.tsx` (rename to `tests/local-models-row.test.tsx`)
- Check: `src/renderer/dev/workbench/mock-only.ts` — `MOCK_ONLY` must still be empty of `models.*` (every mock member is now a real channel).

**Interfaces:**
- Consumes: `LocalModelRow` (Task 2), `models.resume` / `models.installed` (Tasks 6–8).
- Produces: nothing new.

- [ ] **Step 1: Rework the row test**

`git mv tests/local-models-partial-row.test.tsx tests/local-models-row.test.tsx`, then replace its body with the cases below. They keep the two regressions the old file guarded — a resume failure must be visible, and delete must cancel-then-await before unlinking — and add the download's own failure message, which the old row showed and the first draft of this plan lost.

```tsx
// @vitest-environment jsdom
// local-models-row.test.tsx — pins the unified Local Models row (spec §3.2,
// §3.5, §3.5a, §3.6). Same jsdom + fireEvent shape as the PartialRow test it
// replaced: this repo has no @testing-library/user-event.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen, waitFor } from '@testing-library/react';
import { LocalModelRow } from '../src/renderer/components/LocalModelsSection';
import type { DownloadProgress, InstalledLocalModel } from '../src/shared/model-manager-types';

function setupModelsMock(overrides: Record<string, any> = {}) {
  (globalThis as any).window.claude = {
    models: {
      resume: vi.fn().mockResolvedValue({ downloadId: 'd1' }),
      delete: vi.fn().mockResolvedValue(true),
      downloadCancel: vi.fn().mockResolvedValue(true),
      onDownloadProgress: vi.fn().mockReturnValue(() => {}),
      ...overrides,
    },
  };
  return (globalThis as any).window.claude.models;
}

// Destin's real 2026-08-26 interruption. The app's gb() is binary, so these
// render as 74.2 GB of 113.0 GB (66%), not Hugging Face's 79.7 of 121.3.
const unfinished: InstalledLocalModel = {
  id: 'Half-UD-Q4_K_XL-00001-of-00004', sizeBytes: 79_674_559_677,
  quant: 'UD-Q4_K_XL', quantDescription: 'Balanced', parts: 4, status: 'unfinished',
  partsPresent: 2, totalSizeBytes: 121_334_654_784, repo: 'unsloth/Half-GGUF',
};
const untraceable: InstalledLocalModel = {
  ...unfinished, id: 'Old-UD-Q4_K_XL-00001-of-00002', status: 'untraceable',
  totalSizeBytes: null, repo: null, parts: 2, partsPresent: 1,
};
const liveOf = (state: DownloadProgress['state'], extra: Partial<DownloadProgress> = {}): DownloadProgress => ({
  downloadId: 'live-1', repo: 'unsloth/Half-GGUF', quant: 'UD-Q4_K_XL', state,
  receivedBytes: 85_000_000_000, totalBytes: 121_334_654_784, parts: 4, currentPart: 3, ...extra,
});

beforeEach(() => { setupModelsMock(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('LocalModelRow', () => {
  it('an unfinished row shows real progress and resumes by model id', async () => {
    render(<LocalModelRow model={unfinished} onRefresh={async () => {}} />);
    expect(screen.getByText('66% — 74.2 of 113.0 GB')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText('Resume')); });
    expect(window.claude.models.resume).toHaveBeenCalledWith('Half-UD-Q4_K_XL-00001-of-00004');
  });

  it('a REFUSED resume says why instead of doing nothing visible', async () => {
    const models = setupModelsMock();
    models.resume.mockRejectedValue(new Error('Not enough free space: this download needs about 40.0 GB but only 5.0 GB is free.'));
    render(<LocalModelRow model={unfinished} onRefresh={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Resume')); });
    await waitFor(() => expect(screen.getByText(/Not enough free space/)).toBeTruthy());
  });

  it('a download that FAILED after it started shows the downloader\'s own message', () => {
    // resume() returns as soon as the download starts; an HTTP error or an
    // integrity failure arrives later as an 'error' progress event. This row is
    // the only place that message reaches the user.
    render(<LocalModelRow model={unfinished}
      progress={liveOf('error', { message: 'Hugging Face responded with HTTP 503.' })}
      onRefresh={async () => {}} />);
    expect(screen.getByText('Hugging Face responded with HTTP 503.')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();   // and it can be tried again
  });

  it('a live download shows a progress bar and Cancel in place of Resume', () => {
    render(<LocalModelRow model={unfinished} progress={liveOf('downloading')} onRefresh={async () => {}} />);
    expect(screen.getByText(/Downloading… · 70% — 79\.2 of 113\.0 GB · part 3 of 4/)).toBeTruthy();
    expect(screen.getByLabelText('Download progress')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('an untraceable row offers no Resume, shows no percentage, and says what to do', () => {
    render(<LocalModelRow model={untraceable} onRefresh={async () => {}} />);
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByText(/Unfinished — 74\.2 GB downloaded/)).toBeTruthy();
    expect(screen.getByText(/Find the model in search and download it again/)).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('the discard confirmation names the real number of bytes at stake', async () => {
    render(<LocalModelRow model={unfinished} onRefresh={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Discard')); });
    expect(screen.getByText(/Discard 74\.2 GB\? This removes every downloaded piece/)).toBeTruthy();
  });

  it('discarding a LIVE download cancels first and waits for the cancelled event', async () => {
    // WHY this ordering matters: removing the .partial out from under an open
    // write stream races. Recorded in a plain array — vitest has no
    // toHaveBeenCalledBefore without jest-extended, which this repo does not use.
    const models = setupModelsMock();
    const order: string[] = [];
    let emit: ((p: DownloadProgress) => void) | null = null;
    models.onDownloadProgress.mockImplementation((cb: (p: DownloadProgress) => void) => { emit = cb; return () => {}; });
    models.downloadCancel.mockImplementation(async () => {
      order.push('cancel');
      emit?.(liveOf('cancelled'));
      return true;
    });
    models.delete.mockImplementation(async () => { order.push('delete'); return true; });
    render(<LocalModelRow model={unfinished} progress={liveOf('downloading')} onRefresh={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Discard')); });
    await act(async () => { fireEvent.click(screen.getByText('Discard download')); });
    await waitFor(() => expect(order).toEqual(['cancel', 'delete']));
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/local-models-row.test.tsx`
Expected: PASS, 7 tests. Fix the component if a case fails — the tests encode the spec, not the other way round. (If the live-row percentage assertion is off by one, recompute from the fixture: 85,000,000,000 / 121,334,654,784 = 70.06% → 70; 85,000,000,000 / 1024³ = 79.16 → 79.2.)

- [ ] **Step 3: Boot-check the workbench again**

Run: `node scripts/workbench-boot-check.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests src/renderer
git commit -m "test(models): pin the three row states, the visible failure paths, and cancel-before-discard"
```

---

## Task 10: Verify, exercise, document, ship

- [ ] **Step 1: Full verify**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/worktrees/download-resume --full`
Expected: exit 0. Paste the output into the PR body — a claim of "done" without it is not evidence.

- [ ] **Step 2: Exercise it in a dev instance — read-only checks (agent)**

```bash
bash /home/destin/youcoded-dev/scripts/run-dev.sh /home/destin/youcoded-dev/worktrees/download-resume \
  --label "Download Resume" --offset 3 --profile dlresume
```

**Know what is shared.** The dev instance has its own window and `userData`, but `engine.cacheDir` is read from `~/.youcoded/` (`NativeHome` uses `os.homedir()`, `native-home.ts:31`), which the live app shares. So the dev window lists Destin's **real** model folder, and anything downloaded from the dev window lands in it. Reading is fine; writing is a consequence he must be told about.

In the dev window only (never the installed app):

1. Settings → Providers → Local Models lists the real cache. `Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004` must read **untraceable** (it predates manifests): `Unfinished — 74.2 GB downloaded`, the explanation line, **Delete** only, no Resume. Do not press Delete.
2. The conversation model picker does **not** list it.

Record both outcomes for the PR body.

- [ ] **Step 3: Hand the interactive checks to Destin**

Per CLAUDE.md, quit-and-relaunch verification is his, not a scripted rig's. Ask him to do the following in the dev window, and tell him plainly that the test model will appear in his live app's model list afterwards (he can keep it or delete it from there):

3. Start a small download (a ~2 GB Q4 model), quit the dev window mid-download, relaunch: the row reads **unfinished** with a percentage and a Resume button.
4. Press Resume: it continues rather than restarting — the received bytes start above zero.
5. Let it finish: the row becomes an ordinary complete row and the manifest file (`<name>.gguf.download.json`) is gone from the cache folder.

- [ ] **Step 4: Shut the dev instance down**

Kill it by pid, in a bare command — never `pkill -f` on a pattern that appears in your own command line.

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo itsdestin/youcoded --base master \
  --title "Interrupted model downloads: record the source, one honest list, manual Resume" \
  --body-file /tmp/claude-1000/pr-body.md
```

Write `/tmp/claude-1000/pr-body.md` with exactly these five sections, filled in from what
actually happened — no section may be omitted:

1. **What broke** — one paragraph, the 2026-08-26 interruption and the three stacked
   defects, linking `docs/active/specs/2026-08-26-model-download-resume-design.md`.
2. **What changed** — the manifest (and "a manifest alone is a row"), the single scan with two views, the three row states with the download's own failure message, the same-file-different-repo refusal, `models:orphaned-partials` → `models:resume`, the disk-guard fix. One line each.
3. **Dev-instance checks** — the five checks from Steps 2–3, each with its observed
   outcome. A check not run is written as "not run", never omitted.
4. **`verify.sh --full` output** — pasted verbatim in a fenced block.
5. **What is NOT covered** — auto-retry on network failure, Android (no local engine),
   and any check from Steps 2–3 that could not be exercised.

Close with the standard footer:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 6: After merge — archive and flip the roadmap**

In `youcoded-dev`:

```bash
git mv docs/active/specs/2026-08-26-model-download-resume-design.md docs/archive/specs/
git mv docs/active/plans/2026-08-26-model-download-resume.md docs/archive/plans/
```

Set both files' `status:` frontmatter to `shipped`, flip the ROADMAP bug entry (`ROADMAP.md:103`, "An interrupted model download is unresumable…") to `[x]` with the merge SHA, and update `docs/MAP.md`'s "Local engine & models" row to name `download-manifest.ts` and `scanLocalDownloads`. Commit and push. "Merge means merge AND push AND archive AND flip the roadmap item."

- [ ] **Step 7: Clean up**

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
| §3.2 One honest list (three states, copy, edge cases; a manifest alone is a row) | 1, 2, 5, 6 |
| §3.3 One list, not two (channel removal; `activePartialNames` gone with it) | 8 |
| §3.4 Unfinished models not offerable | 5 (by construction) |
| §3.5 Resume (no network; the download's own failure shown on the row) | 7, 2 |
| §3.5a Live download + disk row are one row | 2 (steps 7–8), 6 (manifest quant) |
| §3.6 Discard | 2 (step 6), 6 (step 4), 9 |
| §3.7 Space check counts what is left | 7 |
| §4 Sequencing (workbench gate, incl. the mid-resume state) | 2 (steps 11–13) |
| §5 Guards | 3, 4, 5, 6, 7, 8, 9 |
