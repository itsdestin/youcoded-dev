---
status: draft
date: 2026-08-25
tags: [renderer, artifacts, ux, ipc, android, remote]
---

# Spec: The artifact pane stops refusing files it can display

> **Source:** Destin opened a 2.3 MB PNG and got "This file is 2.3 MB — too large to
> open in the artifact pane." Code-verified 2026-08-25: the message is false for that
> file. Decisions taken with Destin in-session are marked **D1–D5**.

## 1. Motivation

### 1.1 The observed bug

`useArtifactContent.ts:66` requests every artifact as **text** via `artifacts:get`,
unconditionally, before anything decides what kind of file it is. The handler's size
gate (`ipc-handlers.ts:3733`) refuses anything over `EDIT_MAX_BYTES` — 2 MB
(`shared/artifacts/editable-path-policy.ts:91`) — and `ActiveArtifactView.tsx:397`
renders the refusal **before** viewer routing at `:379`.

Images, PDFs, `.docx` and `.xlsx` never use that text at all. They render through
`BinaryContent` → `useArtifactBytes` → `artifacts:read-binary`, whose own ceiling is
`READ_BINARY_MAX_BYTES` = **50 MB** (`ipc-handlers.ts:3772`). A 2.3 MB PNG is
comfortably inside the limit that actually governs it, and is blocked by a limit
belonging to the text editor.

Corroborating tell: `ArtifactThumbnail.tsx` calls `read-binary` directly and skips
`artifacts:get` entirely, so the thumbnail of the same file renders while the full
view refuses.

Two smaller defects fall out of the same root cause:

- **Every binary file is read off disk twice.** `artifacts:get` reads the whole file,
  NUL-sniffs it (`ipc-handlers.ts:3742-3746`), discards the bytes and returns
  `content: null`; then `read-binary` reads it again for real.
- **The watcher writes `''` into a binary file's content.** `ActiveArtifactView.tsx:238`
  does `const disk = res.content ?? ''`, so an on-disk change to an image sets host
  content to the empty string. Currently masked by `contentInfo.binary` keeping
  `isEditable` false, but it is a live hazard sitting next to the save path.

### 1.2 The wider problem the bug exposes

Over the cap, a **text** file cannot be viewed either — only edited-or-nothing. Reading
is cheap and safe; the expense is the editor and its syntax colouring. The current
design refuses the safe operation because the expensive one would be costly.

And the single offered action, "Open in default app", ejects the user out of YouCoded —
the opposite of the Comprehensive Workspace pillar in `CLAUDE.md`.

### 1.3 What the limit is legitimately protecting

Not imaginary. A naked multi-MB `readFile(utf8)` blocks the main process, ships the
whole string through IPC as a structured clone, and then blocks the renderer while
CodeMirror highlights it. Over a remote connection it also crosses the network. The
protection stays; what changes is that it degrades into a readable view instead of a
wall, and that it stops applying to files that were never going to use the text path.

## 2. Measurement — why the number does not need to move

Destin's constraint: the first read should load the whole file for ~90% of opens.

Sampled 2026-08-25 across `/home/destin/youcoded-dev` (17,764 files; `md ts tsx js kt
json csv txt py html yml yaml log jsonl`; `node_modules`, `.git`, `dist`, `build`
excluded):

| percentile | size |
|---|---|
| p50 | 4.5 KB |
| p75 | 10.3 KB |
| p90 | 23.3 KB |
| p95 | 42.0 KB |
| p99 | 103.6 KB |
| p99.5 | 206.0 KB |

Only **16 files exceed 512 KB**. Only **4 exceed 2 MB** — three are the same bundled
`LICENSES.chromium.html` (19 MB) inside `release/linux-unpacked/` build output, the
fourth is YouCoded's own `.youcoded/artifacts.json` sidecar (5.4 MB). None is a file a
user would open in the pane.

**Therefore `EDIT_MAX_BYTES` stays at 2 MB** (**D1**). At that size the first read is
complete for 99.98% of text files — far past the 90% bar — and the number's *meaning*
changes from "we refuse above this" to "this much appears instantly". Sampling caveat:
this measures files on disk, not files actually opened in the pane, and the outliers
came from build folders — the bias runs toward overstating size, so the real figure is
if anything better.

## 3. Target experience

Stated as what the user feels, in the three cases the pane can be in.

**Photos, PDFs, spreadsheets, Word docs — nothing happens.** No notice, no byte count,
no exit link. They open the way a 200 KB one does. The 50 MB ceiling that genuinely
governs them is high enough that a screenshot, a scan, a phone photo or a deck export
never meets a wall. On a big one the only visible difference is a brief load.

**Big text — it opens, you just cannot type in it yet.** The beginning of the file is
on screen immediately, with a line that stays visible while scrolling: *"Showing the
first 2 MB of 8.4 MB."* plus an action to load the rest. It reads as "I can look at
this", not "the app will not let me". Editing stays off until the whole file is loaded.

**Genuinely un-showable — a handoff, not a failure.** A video, a database, a compiled
binary: say what it is and offer the one action that works. Deliberate delegation, not
an apology for an error.

Cross-cutting: a size is stated only where it is information the user can act on. It is
never the stated *reason* unless it is the true reason for that file.

## 4. Design

### 4.1 Route by file kind before requesting content

New pure export in `RendererRegistry.ts`:

```ts
/** Extensions whose viewer reads its own bytes (BinaryContent → read-binary)
 *  AND whose format is not text — the text fetch is pure waste for these.
 *  SVG is deliberately ABSENT: it renders through ImageView but is text, and
 *  is editable today; it keeps the text fetch so the pencil still appears. */
export function rendersFromBytesOnly(path: string): boolean
```

Members: `png jpg jpeg gif webp bmp ico avif pdf docx xlsx`.

`useArtifactContent` skips `artifacts.get` entirely when `rendersFromBytesOnly(path)`
and resolves to a new terminal state `{ phase: 'bytes' }` on `ArtifactContentState`,
meaning *"text content is not applicable; the viewer owns its own read"*.
`ActiveArtifactView`'s read-lifecycle gate (`:414-425`) passes `'bytes'` straight
through to viewer routing. `BinaryContent` already owns loading / orphan / not-allowed /
too-large for this path (`BinaryContent.tsx:14-28`), so no state is lost.

This alone fixes the reported bug, removes the duplicate disk read, and makes the
watcher's `res.content ?? ''` unreachable for these types.

**Unknown extensions still take the text path** — routing for them depends on the
handler's NUL sniff (`getViewer`'s `textHint`/`binaryHint`), which requires the read.

### 4.2 Above the cap, sniff the head before deciding what to say

`artifacts:get`, when `st.size > EDIT_MAX_BYTES`, currently returns immediately with
`tooLarge: true` and no knowledge of what the file is. Replace with: open a handle,
read the first 8 KB, `looksBinary()` on it, then branch.

- **Binary head** → `{ ok: true, content: null, binary: true, sizeBytes, mtimeMs }`.
  This is byte-for-byte the response an *under*-cap binary file already produces, so
  the existing `binaryHint` routing sends it to `BinaryFallback` — the §3 handoff —
  with no new renderer branch.
- **Text head** → read up to `EDIT_MAX_BYTES`, **trim back to the last newline** so no
  line is cut mid-way, and return
  `{ ok: true, content: <prefix>, truncated: true, sizeBytes, mtimeMs, binary: false }`.

Cost is bounded: at most one 8 KB read plus one 2 MB read, never the whole file.

**`tooLarge` is retired** (**D2**). Every state it expressed is now carried by
`binary` (handoff) or `truncated` (partial). Consumers to update:
`ipc-handlers.ts:3737`, `useArtifactContent.ts:43,71`, `ActiveArtifactView.tsx:70,138,260,397`,
`dev/workbench/mock-shim.ts:634,637`, `dev/workbench/fixtures/artifacts.ts:8`,
`SessionService.kt:3365-3369`. Keeping a vestigial flag that no longer means anything
is exactly the drift `CLAUDE.md` forbids.

`sizeBytes` is now returned on **every** `artifacts:get` response, not only the refusal,
so `BinaryFallback` can name the file it is handing off.

### 4.3 Partial text view

Rendered in `ActiveArtifactView`, above the viewer, so every text viewer
(Markdown / CodeEditor / Csv / Html) inherits it rather than each growing its own copy:

- A sticky banner — **not** scrolled away, since a partial view that looks complete
  after two screens of scrolling is the failure mode of this whole approach. Copy:
  *"Showing the first 2 MB of 8.4 MB. Editing is off until the whole file is loaded."*
- Action **"Load the whole file"**, offered only while `sizeBytes <= FULL_READ_MAX_BYTES`
  (new constant, **20 MB**, `editable-path-policy.ts`). It re-invokes
  `artifacts:get(projectRoot, id, { full: true })`, which bypasses the cap but still
  refuses above `FULL_READ_MAX_BYTES`.
- Above `FULL_READ_MAX_BYTES` the banner offers **"Open in default app"** instead —
  desktop only, since `BinaryFallback.tsx:6-8` already establishes that `shell.openPath`
  is a no-op on remote and absent on Android. On those two the banner carries **no
  action at all** and states only the fact; offering a button that silently does nothing
  is worse than offering none.

### 4.4 The edit lock — the one data-loss risk in this change

Saving a truncated buffer would write the 2 MB prefix over the whole 8 MB file. This is
the §2.2 empty-file guarantee from the 2026-07-20 editor spec in a new shape, and it
gets the same treatment: multiple independent guards, none of them cosmetic.

1. **Affordance** — `isEditable` (`ActiveArtifactView.tsx:138`) gains
   `&& !contentInfo?.truncated`. No pencil in the host header.
2. **Entry** — `handleStartEdit` returns early when `contentInfo?.truncated`, and its
   refetch (`:260`) treats `res.truncated` the way it currently treats `res.tooLarge`.
3. **Write** — `handleSave` gains `if (contentInfo?.truncated) return false;` directly
   beside the existing `if (content === null) return false;` guard.
4. **Draft store** — no draft is stashed or restored for a truncated artifact
   (`draft-store.ts`), so a stale draft cannot re-enter edit mode via the unmount stash.

A successful "Load the whole file" clears `truncated`, and all four guards release
together because they read the same flag.

Main-process note: `artifacts:save` cannot detect truncation on its own — it has no idea
the caller's string is a prefix, and a shrinking file is legitimate. This is honestly a
renderer-side guarantee, and §6 pins it with tests rather than prose.

### 4.5 The handoff state

`BinaryFallback.tsx` copy today is *"Cannot preview this file type."* — which is wrong
whenever the reason is size, and the string it replaces (*"too large to open in the
artifact pane"*) is wrong whenever the file is an image. Both go away.

New copy names the file and states only what is true:

- Under the byte ceiling, format unsupported → *"YouCoded can't display .mp4 files."*
  (the file's own extension, lower-cased, interpolated)
- Over `READ_BINARY_MAX_BYTES` → *"This file is 214 MB — larger than YouCoded can
  display."* (Here the size **is** the true reason, so it is stated.)

Both keep the `shell.openPath` action on desktop, gated as it already is.
`describeBytesError`'s `'too-large'` branch (`BinaryContent.tsx:20`) is rewritten to
match; the `'orphan'`, `'not-allowed'` and `'unavailable'` branches are already specific
and accurate and are left alone.

### 4.6 Remote: ask before a large byte read (**D3**)

The byte path sends one base64 blob in a single WS message (`remote-shim.ts:1232`), so
there is **no progress to report** — a progress bar here would be an invented number,
which `docs/error-message-standards.md` forbids. Ask-first is the honest shape.

- `artifacts:read-binary` takes an optional `{ maxBytes }`. Over it, the handler returns
  `{ ok: false, error: 'too-large', sizeBytes }` — note `sizeBytes` is **added** to that
  error response, which today carries only the code (`ipc-handlers.ts:3803`).
- `useArtifactBytes` passes `maxBytes: REMOTE_ASK_BYTES` (**5 MB**) when
  `isRemoteMode()` (`platform.ts:23`), and nothing otherwise. Desktop and
  Android-on-device never ask; the file is already local.
- On `too-large` + a `sizeBytes` under the 50 MB ceiling, `BinaryContent` renders
  *"This image is 12 MB. Load it?"* with a Load action that re-invokes without
  `maxBytes`. Over the ceiling it is the §4.5 handoff.
- Below the threshold, and on desktop, the load is silent apart from the spinner, which
  gains the size when known: *"Loading 12 MB image…"*.

5 MB is a judgment call — roughly a large phone photo — not a measurement, and is a
single constant to retune.

No new IPC channel: reusing `read-binary` with an argument keeps the three-surface
parity surface unchanged and avoids a stat round-trip in the common case.

### 4.7 Three surfaces, not one

Both caps exist independently in Kotlin — `EditablePathPolicy.kt:71`
(`EDIT_MAX_BYTES = 2 MB`) and `SessionService.kt:3416` (50 MB) — and the remote shim
proxies both. Every response-shape change in §4.2 and §4.6 lands in all three:
`ipc-handlers.ts`, `SessionService.kt`, and the workbench mock (`mock-shim.ts:634-637`).
Run `node scripts/workbench-boot-check.mjs` after the mock change — per `CLAUDE.md`, the
unit suite has passed three times while the workbench crashed at boot.

`ipc-channels.test.ts` guards channel *names*, not payload shapes, so it will stay green
through a half-finished port. §6 adds the shape assertions it cannot make.

## 5. Explicitly out of scope

- **Streaming / scroll-triggered loading of big text.** Rejected in-session (option C):
  best feel, most machinery, most subtle failure modes, for a case hit occasionally.
- **Raising `EDIT_MAX_BYTES`.** §2 shows it would buy nothing measurable, and under this
  design it is no longer a wall.
- **A progress bar for remote reads.** Impossible honestly with a single-message
  transport (§4.6).
- **Reworking the other `describeBytesError` branches.** Already accurate.
- **The v1.3.1 error-message audit.** This spec fixes only the strings it touches.

## 6. Guards

Prefer a test over prose, per `CLAUDE.md`'s knowledge ladder.

| Claim | Guard |
|---|---|
| A 2.3 MB PNG renders, and never requests text | new `artifact-size-routing.test.tsx`: mount `ActiveArtifactView` with a 2.3 MB `.png`; assert `artifacts.get` was **not** called and `ImageView` mounted |
| `rendersFromBytesOnly` excludes SVG | unit test in `renderer-registry.test.ts`; asserts `svg` false, `png`/`pdf`/`xlsx` true |
| Over-cap text returns a newline-trimmed prefix | main-side test on the `artifacts:get` handler: fixture > 2 MB, assert `truncated === true`, `content.endsWith('\n')`, `content.length <= EDIT_MAX_BYTES` |
| Over-cap **binary** with an unknown extension routes to the handoff | same suite: assert `binary === true`, `content === null` |
| **A truncated buffer can never be saved** | four assertions in `artifact-editing.test.tsx`: no pencil; `handleStartEdit` no-ops; `handleSave` returns false without invoking `artifacts:save`; no draft stashed |
| The partial banner survives scrolling | assert the banner element is outside the viewer's scroll container |
| Remote asks above 5 MB, desktop never does | `binary-content.test.tsx` with `isRemoteMode()` stubbed both ways |
| `tooLarge` is fully retired | `rg -n 'tooLarge' desktop/src app/src` returns nothing — run it in the PR body, per the programmatic-verification rule |
| Kotlin mirrors the response shape | extend the existing `EditablePathPolicy` Kotlin test with the truncation branch |

`bash scripts/verify.sh` covers the desktop side; Android needs `./gradlew test`
separately.

## 7. Decisions taken (2026-08-25, with Destin)

- **D1** — `EDIT_MAX_BYTES` stays 2 MB. It becomes "how much shows instantly", not a
  wall. Justified by the §2 measurement, not by preference.
- **D2** — big text degrades to a **read-only prefix with a load-the-rest action**
  (option A), not a full uncoloured read (B) and not scroll-streaming (C). A is the only
  option bounded by construction: a 500 MB file behaves like an 8 MB one.
- **D3** — on remote, **ask before loading a byte file over 5 MB**; below it, load
  silently. Desktop and Android-on-device never ask. (Destin first chose load-always,
  then reversed to ask-first in the same session; ask-first is the decision.)
- **D4** — the remote spinner names the size when known. No progress bar.
- **D5** — SVG stays on the text path so it remains editable, despite rendering through
  `ImageView`.

## 8. Open question for Destin

`REMOTE_ASK_BYTES` = 5 MB is the one number in this spec chosen by feel rather than
measured. Flag it on review if it should be higher or lower.
