---
status: draft
created: 2026-08-26
updated: 2026-08-26
tags: [local-models, engine, renderer, downloads, ux]
---

# Interrupted model downloads: one honest list, one Resume button

## 1. The problem

On 2026-08-26 Destin's machine died partway through downloading
`unsloth/Qwen3.8-Flash-Next-GGUF` / `UD-Q4_K_XL` — a four-file split GGUF, 121.3 GB.
After the restart, the model appeared in the Local Models list as installed, at
roughly half its real size. It was not installed. Loading it would have failed.

Measured on disk that day:

| File | Bytes | State |
|---|---|---|
| `…-00001-of-00004.gguf` | 10,946,624 | published |
| `…-00002-of-00004.gguf` | 49,859,583,136 | published |
| `…-00003-of-00004.gguf.partial` | 29,804,029,917 of 49,376,141,504 | half-written |
| `…-00004-of-00004.gguf` | 12,087,983,520 expected | never started |

79.7 of 121.3 GB. Every published byte count matches Hugging Face's `lfs.oid`-verified
sizes exactly, so **the bytes were sound — only the UI was wrong.**

Three defects stack into that one experience.

**(a) A leftover download is invisible after a relaunch.** The backend already finds
them (`ModelManager.orphanedPartials()` → `models:orphaned-partials`, live on five
surfaces) and the renderer already has the row that resumes one
(`LocalModelsSection.tsx` → `PartialRow`, Resume/Discard). Nothing connects them:
`rg -n 'orphanedPartials|OrphanedPartial' desktop/src/renderer desktop/src/shared`
returns zero hits (verified 2026-08-26). `PartialRow` is fed only from the live
`download-progress` subscription, which is empty on a fresh launch.

**(b) Resume cannot be reconstructed from disk anyway.** `OrphanedPartial`
(`shared/model-manager-types.ts:81`) carries `fileName / modelId / sizeBytes /
mtimeMs` — no repo. `models.download(repo, quant)` needs both, and a filename cannot
yield the repo: six or more Hugging Face accounts publish `Qwen3.8-Flash-Next-*-GGUF`
with byte-identical filenames and different builds.

**(c) A half-downloaded split model is reported as installed.** `scanGgufCache`
(`engine/cache-scan.ts`) registers part `00001` as a model and folds sibling part
sizes into it, with no check that parts 1..N are all present. That row is also
offerable in the conversation model picker, because `engine:models` →
`EngineManager.liveModels()` → `EngineSupervisor.listModels()` unions the same scan.

## 2. What this is not

- **No automatic resume.** Not at launch, not on reconnect, not ever. A leftover
  download waits behind a button the user presses. Destin's call, 2026-08-26: a
  surprise 40 GB on a tethered connection is a worse failure than an extra click.
- **No guessing a download's source.** An untraceable partial is labelled
  untraceable. Searching Hugging Face for the filename and picking the most-downloaded
  match would silently append bytes from a different build, discovered only after the
  full remaining download fails its integrity check.
- **No change to the download or resume machinery itself.** `ModelDownloader.run()`
  already skips files whose final path exists and continues a `.partial` with a `Range`
  request; `sha256` verification against `lfs.oid` already gates publication. That code
  is correct and stays as it is.

## 3. Design

### 3.1 Record the source at download start

`ModelDownloader.start()` writes a manifest into the cache dir **before** the first
byte is fetched, named for the download's first file:

```
<first-file-basename>.gguf.download.json
```

```jsonc
{
  "v": 1,
  "repo": "unsloth/Qwen3.8-Flash-Next-GGUF",
  "quant": "UD-Q4_K_XL",
  "files": ["UD-Q4_K_XL/Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004.gguf", "…"],
  "totalSizeBytes": 121334654784,
  "sha256ByFile": { "UD-Q4_K_XL/…-00001-of-00004.gguf": "4448186216b3…" },
  "startedAt": 1756…
}
```

This is exactly the `QuantOption` the resume call needs, plus the repo — so resume
reconstructs the original `models.download(repo, quant)` call with no network round
trip and no guessing.

Lifecycle:

- Written at `start()`, before any fetch. A crash one second later still leaves it.
- **Deleted only on clean completion** of every file in the set.
- Survives cancel, error, quit, and crash — those are precisely the states that need it.
- Removed by `models:delete` along with the parts and the `.partial`.
- One manifest per download, keyed to the first file's basename — the same id
  `models:delete` already addresses a split model by.

A manifest is chosen over a central registry (`~/.youcoded/downloads.json`) because it
travels with the files: it cannot drift out of sync with the cache dir, and it survives
the user moving or repointing `engine.cacheDir`.

### 3.2 One honest list

`scanGgufCache` learns to count. `PART_RE` already parses `-00002-of-00004.gguf`, so
the declared total is on hand; the scan counts how many sibling `.gguf` files are
actually present and marks the entry incomplete when the count is short. It also
reports downloads that have a `.partial` but no published file at all — today those are
invisible to every list — and downloads that have **only a manifest** (the manifest is
written before the first byte, so a download that failed on its very first request
still has a row: unfinished, 0 bytes, resumable, discardable).

`EngineManager.installedModels()` (the `models:installed` IPC behind the Local Models
screen) returns one row per download on disk, in one of three states:

| State | Condition | Row shows |
|---|---|---|
| `complete` | every declared part published | today's row, unchanged |
| `unfinished` | short of parts and/or a `.partial` present, manifest found | `66% — 79.7 of 121.3 GB`, **Resume**, **Discard** |
| `untraceable` | same, but no manifest | `Unfinished — 79.7 GB downloaded.` + explanation, **Delete** only |

The `untraceable` copy must say what to do, not just what is wrong: *"This download
started before the app kept track of where downloads come from. Find the model in
search and download it again — it will continue from where it stopped."* That sentence
is true today and is the workaround Destin used; it is not a dead end.

Two edge cases, stated so the implementation does not have to guess:

- **All declared parts published, but a stray `.partial` lingers.** The model is
  `complete`. Publication is an atomic rename, so this should not occur; if it does,
  the stray is ignored rather than demoting a working model, and `models:delete`
  removes it with the rest (the list is a read; it does not delete model bytes).
- **All parts published, but a manifest survives** (its deletion failed). Same — the
  model is `complete`, and the stale manifest is removed on the next scan. The manifest
  is a resume hint, never evidence of incompleteness; the file count is the authority.

Progress for `unfinished` is bytes on disk (published parts + `.partial` size) over
`totalSizeBytes` from the manifest. `untraceable` rows show bytes on disk and **no
percentage** — the total is genuinely unknown, and a fabricated denominator would be a
misleading number in a shipping UI.

### 3.3 One list, not two

`models:orphaned-partials` is folded into `models:installed` and the channel is
**deleted**; `models:resume` (§3.5) takes its place on the same surfaces. Enumerated 2026-08-26 (`rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials'
desktop/src desktop/tests app/src`), every site that must go or change:
`shared/types.ts:1387` and `preload.ts:357` (channel constant), `preload.ts:1274`
(bridge), `ipc-handlers.ts:2699` (handler), `remote-server.ts:1220` (WS case),
`renderer/remote-shim.ts:1635` (remote bridge), `renderer/hooks/useIpc.ts:336` (type),
`SessionService.kt:3791` (Android not-implemented list), `ipc-channels.test.ts:896`
(parity row), plus `ModelManager.orphanedPartials()`, the now-unused `OrphanedPartial`
type, and the comments referencing it in `model-downloader.ts:67` and
`cache-scan.test.ts:45`. `ModelDownloader.activePartialNames()` goes too — its only
caller was `orphanedPartials()`. The unified list does not subtract this session's live
downloads; it shows them as rows with live progress attached (§3.5a).

Wiring it up as a second renderer call would create two lists over the same directory
that can disagree — the exact failure mode this spec exists to fix. `ipc-channels.test.ts`
→ the `models:*` parity case is updated in the same commit.

### 3.4 An unfinished model is not offerable

Rather than filtering incomplete entries at each consumer, there is **one scan of the
cache dir and two views of it**. `scanLocalDownloads()` reports every download on disk
with its part counts and byte totals; `scanGgufCache()` becomes that scan filtered to
complete sets. Everything already downstream of `scanGgufCache` — `EngineSupervisor.listModels()`,
`EngineManager.liveModels()`, `engine:models`, the new-conversation picker, the
mid-session swap popup — is fixed by construction, with no change at those call sites
and no second place for the rule to be forgotten. Only the Settings list
(`installedModels()`) reads the unfiltered scan.

Settings is where you act on an unfinished download; the picker is where you choose
something that can load.

This is the same class as the 2026-08-16 "listed is not servable" bug and its fix
follows the same rule stated at `engine-supervisor.ts`: **a row the server cannot serve
must not be offered as a choice.** The `ensureServable` chokepoint in
`provider-registry.ts` stays as the backstop; this removes the trap one level earlier.

### 3.5 Resume

Resume is a new `models:resume` channel taking the model id. Main reads the manifest
and calls its own `download(repo, quant)` with the recorded file set. The renderer never
sees or reconstructs the manifest, and resume needs **no Hugging Face round trip** — it
works with the API unreachable, which matters because the interruption that stranded the
download is often the network itself.

This is why the manifest records the full file set and fingerprints rather than just the
repo name: the alternative is the renderer re-fetching the repo's file list and hoping it
still matches what was half-downloaded.

The row becomes a progress bar **in place** — it does not jump to the in-progress area
above. On completion it becomes an ordinary complete row.

Channel arithmetic: `models:orphaned-partials` goes, `models:resume` arrives. Net zero,
and the parity test covers the new one on the same five surfaces.

Resume failures use the existing inline error line on the row (already built, already
tested: `PartialRow`'s `resumeError`). No new error surface. Two kinds land there: a
refusal at the click (disk guard, already downloading, no manifest) and — because
`models:resume` returns as soon as the download *starts* — the download's own later
failure (HTTP status, integrity check), read from the `error` progress event. The
latter is what `PartialRow` shows today and must not be lost.

`PartialRow` is retired in favour of the unified list row — it exists only because
in-flight and leftover downloads render in two different places today.

### 3.5a How a live download and a disk row stay one row

The list rows come from `models:installed` (a disk read, refreshed on demand); live
progress comes from the `download-progress` event stream. They are matched on
`repo` + `quant`, both of which a resumable row carries from its manifest. While a
download is in flight its row shows the live byte count; otherwise it shows what is on
disk.

The list refreshes on the **first** progress event for a download id (a brand-new
download has no disk row yet) and on every terminal state (`done`, `error`, `cancelled`).
An `untraceable` row has no repo to match on and can never be live — it cannot be
resumed, which is the whole reason it is labelled that way.

### 3.6 Discard

A confirmation naming the real number — *"Delete 79.7 GB? This removes every downloaded
piece of this model."* — then `models:delete`, which already removes every sibling part
plus the `.partial`; the manifest is added to what it removes.

Discarding a partly-finished split model **does** throw away its published parts. An
incomplete set is unloadable and unfindable; leaving it behind would be dead weight the
user has no surface to act on. The confirmation states the size so the choice is
informed.

The existing cancel-then-delete race guard in `PartialRow.discard` (await the
`cancelled` event before unlinking, so nothing is removed out from under an open write
stream) carries over unchanged.

### 3.7 The space check counts what is left

`checkDiskSpace` currently charges `quant.totalSizeBytes` against free space with a 5%
margin, regardless of how much of that download is already on disk. Resuming Destin's
model asks for 127.4 GB of headroom to fetch 41.7 GB.

`ModelManager.download()` subtracts the bytes already present for this download's files
(published parts + `.partial`) before the check. Left alone, the guard tells a user with
a fuller disk "not enough space" for a resume that would comfortably fit — and the
obvious reaction is to delete the partial, destroying the very thing that made it fit.

The in-flight reservation (`reservedBytes()`, K5) is unaffected: it already tracks
`total - received` for live downloads.

## 4. Sequencing

**Step 1 is a workbench design pass, and no backend work starts before Destin signs
off on it.** `bash scripts/run-workbench.sh` renders the three row states — complete,
unfinished/resumable mid-resume, untraceable — with the confirmation dialog, across all
six themes, judged against `docs/active/design/2026-08-25-ui-design-guide.md`.

The mock shim gains the extended `models:installed` shape; `node scripts/workbench-boot-check.mjs`
must pass after that change.

Backend order after sign-off: manifest write → scan completeness → `installedModels`
shape → picker filter → disk guard → channel removal.

## 5. Guards

New or changed tests, all desktop:

- `cache-scan.test.ts` — a split model missing parts 3 and 4 is `unfinished`, not
  installed; a download with only a `.partial` and no published file produces a row; a
  complete split model is unchanged.
- `model-downloader.test.ts` — the manifest is written before the first fetch; it
  survives cancel and error; it is removed on clean completion of the whole set.
- `engine-manager.test.ts` — `installedModels()` returns the three states with correct
  byte counts; `liveModels()` omits incomplete entries.
- `fit-estimator.test.ts` — a resume passes on free space that would refuse the same
  download from scratch.
- `ipc-channels.test.ts` — `models:orphaned-partials` is gone from all five surfaces and
  `models:resume` is present on all of them; `models:installed` parity holds.
- `engine-manager.test.ts` — resume reads the manifest and starts a download with the
  recorded file set, with no Hugging Face call.
- `local-models-partial-row.test.tsx` — reworked for the unified row (it currently
  pins `PartialRow`, which this retires): Resume calls `download` with the manifest's
  repo and quant; an untraceable row offers no Resume; Discard's confirmation names the
  size. Keep its existing coverage of the resume-failure inline error and the
  cancel-before-delete race — both are real regressions it already guards.

`bash scripts/verify.sh <worktree>` green before any completion claim. No live-app
testing — `bash scripts/run-dev.sh` only.

## 6. Out of scope

- Android: does not run the local engine.
- Auto-retry on transient network failure mid-download (today the download errors and
  its row offers Resume; that is the intended behaviour).
- Reading trained context or other metadata out of the GGUF header
  (`trainedContextFor` is still `null` — unrelated, tracked separately).
