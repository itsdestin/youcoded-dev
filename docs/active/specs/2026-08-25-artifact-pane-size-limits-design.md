---
status: active
date: 2026-08-25
tags: [renderer, artifacts, ux, ipc, android, remote]
---

# Spec: The artifact pane stops refusing files it can display

> **Source:** Destin opened a 2.3 MB PNG and got "This file is 2.3 MB — too large to
> open in the artifact pane." Code-verified 2026-08-25: the message is false for that
> file. Decisions taken with Destin in-session are marked **D1–D5**.
>
> **Revision 2 (2026-08-25)** after review. Changes: the watcher is now in scope (it
> re-opened the data-loss hole this spec claims to close — §4.1, §4.4); editability is
> derived from file size instead of a separate flag that could go stale (§4.4); the
> `'bytes'` content phase is gone in favour of reusing the response shape that already
> exists (§4.1); the no-newline case is handled (§4.2); the work is staged with a
> look-at-it checkpoint before any new copy is final (§5); and the label collision on
> **D2** is fixed — retiring `tooLarge` is a cleanup, not a decision.
>
> Revision 2 also **retires D3/D4 on evidence**: the remote work they describe would guard
> a channel that is not bridged over remote access at all (§4.6, verified three ways). The
> consequence — the artifact pane does not work over remote on a desktop host — belongs to
> the already-documented remote-bridging gap (`ROADMAP.md:526-529`), not to a new entry.

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

Corroborating tell: `ArtifactThumbnail.tsx:112` calls `read-binary` directly and skips
`artifacts:get` entirely, so the thumbnail of the same file renders while the full
view refuses.

Two smaller defects fall out of the same root cause:

- **Binary files under the cap are read off disk twice.** `artifacts:get` reads the
  whole file, NUL-sniffs it (`ipc-handlers.ts:3742-3746`), discards the bytes and
  returns `content: null`; then `read-binary` reads it again for real. (Over the cap
  the handler bails before reading, so the waste is bounded to sub-2-MB files.)
- **The watcher writes `''` into a binary file's content.** `ActiveArtifactView.tsx:238`
  does `const disk = res.content ?? ''`, so an on-disk change to an image sets host
  content to the empty string. Masked today by `contentInfo.binary` keeping `isEditable`
  false — and §4.1/§4.4 must keep it masked, because the obvious version of this fix
  removes the mask (see §4.1's watcher note).

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

**Therefore `EDIT_MAX_BYTES` does not need to move** to satisfy the 90% bar. At 2 MB the
first read is already complete for 99.98% of text files, and the number's *meaning* changes
from "we refuse above this" to "this much appears instantly".

**Set to 3 MB** (**D1**, revised 2026-08-25 by Destin). The measurement says any value in
this range serves ~100% of first reads whole, so the extra megabyte is headroom rather than
a fix for a measured miss — it costs one more megabyte on the rare over-cap read and buys
nothing measurable, which is a fine trade to make deliberately. It is a tuning knob, not a
load-bearing number. Note it also moves `FULL_READ_MAX_BYTES` to **12 MB**, since that is
defined as four times the cap.

Two sampling caveats, both stated rather than assumed away:

- It measures files **on disk in a source workspace**, not files actually opened in the
  pane, and the outliers came from build folders. For text the bias runs toward
  overstating size, so the real figure is if anything better.
- YouCoded's audience is not only developers. A student's Documents folder holds PDFs,
  spreadsheets and photos far larger than anything in this sample — but those are
  governed by the 50 MB byte ceiling, not by `EDIT_MAX_BYTES`, so the sample's blind
  spot does not bear on D1. It *does* mean §4.5's over-50-MB handoff is a real state
  users will meet, not a theoretical one.

## 3. Target experience

Stated as what the user feels, in the three cases the pane can be in.

**Photos, PDFs, spreadsheets, Word docs — nothing happens.** No notice, no byte count,
no exit link. They open the way a 200 KB one does. The 50 MB ceiling that genuinely
governs them is high enough that a screenshot, a scan, a phone photo or a deck export
never meets a wall. On a big one the only visible difference is a brief load.

**Big text — it opens, you just cannot type in it.** The beginning of the file is on
screen immediately, under a bar that stays visible while scrolling: *"Large File — Showing
3.0/8.4 MB"* plus an action to load the rest. It reads as "I can look at this", not
"the app will not let me". Editing is off for a file this large, and stays off — loading
the rest is for reading, not for unlocking the editor (§4.4).

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

`useArtifactContent` gains the artifact's `path` as an argument. When
`rendersFromBytesOnly(path)` it **never calls `artifacts.get`** and instead settles
synchronously into exactly the state an *under*-cap binary file already produces today:

```ts
content: null, contentInfo: { binary: true }, contentState: { phase: 'ready' }
```

**No new content phase is introduced.** The earlier draft added a `'bytes'` phase; it is
unnecessary — `phase: 'ready'` + `content: null` + `binary: true` is a shape every
consumer downstream already handles correctly (`getViewer` routes by extension to
`ImageView`/`PdfView`/`DocxView`/`XlsxView`, and `BinaryContent` owns loading / orphan /
not-allowed / too-large from there, `BinaryContent.tsx:14-28`). Reusing it means zero
changes to the read-lifecycle gate, zero new branches, and — critically — it keeps
`binary: true` recorded, which is the fact that holds the edit affordance shut.

**The watcher must be gated in the same change.** `ActiveArtifactView`'s on-disk-change
effect (`:236-244`) re-requests text on *every* change for *every* file type, with no
kind check. Left alone it would re-introduce `artifacts.get` for images through the back
door — and if `contentInfo` were ever absent it would hand the pane `content: ''` for a
photo, which reads downstream as a perfectly ordinary editable text file. The effect
gains an early `if (rendersFromBytesOnly(artifact.path)) return;`.

> Known gap, out of scope: an image edited on disk while open does not refresh, because
> `useArtifactBytes` keys only on the path. True today, unchanged by this spec. ROADMAP
> item, not a task here.

This section alone fixes the reported bug, removes the duplicate disk read, and closes
the `res.content ?? ''` hazard for these types.

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
- **Text head** → read up to `EDIT_MAX_BYTES` and return
  `{ ok: true, content: <prefix>, truncated: true, sizeBytes, mtimeMs, binary: false }`.

**Where the prefix is cut** — two rules, in order:

1. Trim back to the last newline in the buffer, so no line is shown cut in half.
2. **If the buffer contains no newline at all** — minified JS, a single-line JSON export,
   a one-line CSV — rule 1 would yield an empty string and a blank pane. Fall back to
   trimming back to the last complete UTF-8 character boundary instead (scan backwards
   past any `0b10xxxxxx` continuation bytes), so a multi-byte character is never split
   into replacement-character garbage. The prefix is then one very long line, which is
   correct: that is what the file is.

Cost is bounded: at most one 8 KB read plus one 2 MB read, never the whole file.

**`tooLarge` is retired.** This is a cleanup, not a decision — every state the flag
expressed is now carried by `binary` (handoff) or `truncated` (partial), and a vestigial
flag that no longer means anything is exactly the drift `CLAUDE.md` forbids. Consumers to
update: `ipc-handlers.ts:3737`, `useArtifactContent.ts:43,71`,
`ActiveArtifactView.tsx:70,138,260,397`, `dev/workbench/mock-shim.ts:634,637`,
`dev/workbench/fixtures/artifacts.ts:8`, `editable-path-policy.ts:88` (comment),
`SessionService.kt:3365-3369`, `EditablePathPolicy.kt:70` (comment).

`sizeBytes` is now returned on **every** `artifacts:get` response, not only the refusal.
Two consumers depend on that: `BinaryFallback` names the file it is handing off, and
§4.4 derives editability from it.

### 4.3 Partial text view

Rendered in `ActiveArtifactView`, above the viewer, so every text viewer
(Markdown / CodeEditor / Csv / Html) inherits it rather than each growing its own copy:

- A sticky banner — **not** scrolled away, since a partial view that looks complete
  after two screens of scrolling is the failure mode of this whole approach.
- Action **"Load the whole file"**, offered only while `sizeBytes <= FULL_READ_MAX_BYTES`.
  It re-invokes `artifacts:get(projectRoot, id, { full: true })`, which bypasses the cap
  but still refuses above `FULL_READ_MAX_BYTES`. It loads the file **for reading**;
  editing does not turn on (§4.4).
- Above `FULL_READ_MAX_BYTES` the banner offers **"Open in default app"** instead —
  desktop only, since `BinaryFallback.tsx:6-8` already establishes that `shell.openPath`
  is a no-op on remote and absent on Android. On those two the banner carries **no
  action at all** and states only the fact; offering a button that silently does nothing
  is worse than offering none.

**`FULL_READ_MAX_BYTES` is not yet a number.** The earlier draft asserted 20 MB by feel
while §8 simultaneously claimed only one number in the spec was unmeasured. Both were
wrong. This ceiling exists to stop the renderer freezing, so it is a *measurable*
quantity, and the plan measures it (load progressively larger text files in a dev
instance, time to interactive, pick the largest size that stays under ~1s) rather than
guessing. Until that measurement lands the constant is `TBD` and the action is built
behind it.

Banner copy is **not final in this spec** — see the §5 checkpoint.

### 4.4 The edit lock — the one data-loss risk in this change

Saving a truncated buffer would write the 2 MB prefix over the whole 8 MB file. This is
the §2.2 empty-file guarantee from the 2026-07-20 editor spec in a new shape.

The first draft guarded it with four checks that all read one flag (`truncated`) which
one code path — the watcher — never refreshes. That is four copies of one guard, and it
fails in the dangerous direction: a file that **grows past 2 MB while open** gets its
text quietly swapped for a prefix by the watcher, while `truncated` stays `false` and
every guard stays open. Saving then truncates the file. The revision fixes the shape,
not the count.

**Editability is derived from size, not from a flag:**

```ts
// One predicate, one source of truth. sizeBytes now rides EVERY get response,
// so this cannot disagree with itself. Absent info (legacy hosts, workbench
// fixtures) keeps today's behaviour.
export function canEditArtifact(info: ArtifactContentInfo | null, content: string | null,
                                tier: EditTier): boolean {
  if (content === null || tier === 'denied' || info?.binary) return false;
  return (info?.sizeBytes ?? 0) <= EDIT_MAX_BYTES;
}
```

`truncated` survives only as the banner's trigger. It no longer gates anything
destructive, so it going stale is cosmetic rather than lossy.

**The watcher updates content and its metadata together, always.** This is the
structural half of the fix. `useArtifactContent` exposes `applyDiskRead(res)`, which sets
`content`, `contentInfo` and `contentState` in one call; `ActiveArtifactView` takes it as
a new optional `onDiskRead` prop and the watcher effect calls it instead of
`onContentChange(disk)`. Both hosts wire it (`SessionDrawer.tsx:739`,
`FilesTab.tsx:832`). After this, no path in the renderer can update the text without
updating the facts about the text — which is what made the original four guards
untrustworthy.

`canEditArtifact` is then called at all three places that matter, for defence in depth
without divergence:

1. **Affordance** — `isEditable` (`ActiveArtifactView.tsx:138`). No pencil in the header.
2. **Entry** — `handleStartEdit` returns before `setEditing(true)`.
3. **Write** — `handleSave` returns `false` beside the existing `content === null` guard.

Plus one that is not about the predicate: **no draft is stashed or restored for an
over-cap artifact** (`draft-store.ts`), so a stale draft cannot re-enter edit mode via
the unmount stash.

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

`describeBytesError`'s `'too-large'` branch (`BinaryContent.tsx:20`) is rewritten to
match. Note that branch's current text — *"too large to preview — use 'Open externally'"*
— points at a control that **does not exist in that component**: `BinaryContent` renders
a bare `CenterNote` with no button, unlike `BinaryFallback`. So "both keep the openPath
action" is not a no-op: the desktop-gated action button must be **added** to
`BinaryContent`'s error branch, reusing `BinaryFallback`'s platform gate. The `'orphan'`,
`'not-allowed'` and `'unavailable'` branches are already specific and accurate and are
left alone.

Copy here is **not final in this spec** — see the §5 checkpoint.

### 4.6 Remote: ask before a large byte read (**D3**) — DEFERRED, premise was false

**Verified 2026-08-25, three ways: the desktop remote server does not bridge the artifact
read channels at all.**

```
$ grep -n "case 'artifacts" src/main/remote-server.ts
2144:      case 'artifacts:list-projects-index': {

$ grep -c "read-binary\|artifacts:get" src/main/remote-server.ts
0

$ grep -c "private async handleMessage" src/main/remote-server.ts   # only one switch
1
```

`artifacts:get` and `artifacts:read-binary` fall through to `remote-server.ts:2172`'s
`default:` case, which answers `{ ok: false, unsupported: true }` and logs
`[RemoteServer] unhandled channel`. So on a phone or browser connected to the desktop
app, the artifact pane cannot open **any** file today — not a big image, not a 4 KB
markdown note. The `remote-shim.ts:1229-1232` comment claiming "binary viewers work for
remote browsers too" is stale; Android's Kotlin handler is reachable only from its own
local WebView (`SessionService.kt`'s own comment: "the Android bridge is only reachable
from the local WebView (no remote server)"), so `isRemoteMode()` is never true there
either.

**Consequence:** every line of D3 — the `maxBytes` argument, the ask card, the sized
spinner, the thumbnail ceiling — would guard a size check that the request never reaches.
D3 was decided on the belief that remote users were pulling big images over the network.
They are not; they are getting "isn't available over remote access yet".

**Therefore §4.6 is deferred in full.** The gap itself is **already documented** —
`ROADMAP.md:526-529` lists "the rest of `artifacts:*`" among the channels still unbridged
over remote, and `:431` hits the same wall for file import. This is a consequence of a
known item, not a new discovery; the entry gains one concrete line rather than a duplicate.
A fourth witness the codebase already carries:
`RemoteUnsupportedNotice.test.tsx:20` asserts `remoteFeatureName('artifacts:get') ===
'Project files'` — the app already knows this channel is unsupported over remote.

- The stale `remote-shim.ts:1229-1230` comment is corrected in Stage 2 (a one-line fix on
  sight, per `CLAUDE.md`'s doc-contradicting-code rule).
- When that bridge is built, the ask-first design as written in revision 1 is the right
  shape for it and should be revived from git history — including the
  `ArtifactThumbnail.tsx:112` parity note, which is a real hole in that future design.

**D4** (sized spinner) is deferred with it: it exists only to soften the wait D3 guards.

### 4.7 Three surfaces, not one

Both caps exist independently in Kotlin — `EditablePathPolicy.kt:71`
(`EDIT_MAX_BYTES = 2 MB`) and `SessionService.kt:3416` (50 MB) — and the remote shim
proxies both. Every response-shape change in §4.2 and §4.6 lands in all three:
`ipc-handlers.ts`, `SessionService.kt`, and the workbench mock (`mock-shim.ts:634-637`).
Run `node scripts/workbench-boot-check.mjs` after the mock change — per `CLAUDE.md`, the
unit suite has passed three times while the workbench crashed at boot.

`ipc-channels.test.ts` guards channel *names*, not payload shapes, so it will stay green
through a half-finished port. §6 adds the shape assertions it cannot make.

## 5. Staging, and the checkpoint before copy is final

The reported bug and the large-text feature are separate pieces of work with very
different risk, and shipping them as one change delays the fix behind a five-section
design. They stage as:

**Stage 1 — the bug (§4.1).** No new UI, no new copy, no protocol change. Photos, PDFs,
spreadsheets and Word docs stop being refused. Small, testable, independently correct.

**Stage 2 — big text (§4.2–§4.5).** New response shape, new banner, new handoff copy,
Kotlin mirror.

**Stage 3 — remote byte reads (§4.6). Deferred**, and not for scheduling reasons: the
channels it would guard are not bridged over remote at all. See §4.6 for the verification
and for what gets logged instead.

**Checkpoint — Destin looks at Stage 2's UI in the Workbench before it is final.**
Every new state this spec introduces (the partial banner and the two handoff
messages) renders from the fake backend with **no** main-process
or Kotlin work: `mock-shim.ts` already returns exactly this response shape and
`fixtures/artifacts.ts` already holds the fixtures. The copy and layout written into
§4.3 and §4.5 are *proposals*, not decisions — they have never been seen on screen,
in a theme, at a real width. They are built in the Workbench, looked at, and revised
there before they are treated as settled.

## 6. Explicitly out of scope

- **Streaming / scroll-triggered loading of big text.** Rejected in-session (option C):
  best feel, most machinery, most subtle failure modes, for a case hit occasionally.
- **Raising `EDIT_MAX_BYTES` to solve a measured problem.** There is none (§2). It was
  nonetheless set to 3 MB as headroom (D1); the point stands that no value of it is what
  makes big files usable — the partial view is.
- **Editing a file larger than `EDIT_MAX_BYTES`, ever** — including after "Load the
  whole file". The cap's stated purpose (§1.3) is that CodeMirror on a multi-MB string
  blocks the renderer; a button that opts into exactly that would be the rejected
  option B wearing a hat.
- **Everything remote** (§4.6), including a progress bar — which would in any case be
  impossible honestly with a single-message transport.
- **Bridging `artifacts:get` / `artifacts:read-binary` over remote access.** A real gap
  found while writing this spec (§4.6), and a genuinely separate feature.
- **Refreshing an open image when its bytes change on disk** (§4.1 note). Pre-existing.
- **Reworking the other `describeBytesError` branches.** Already accurate.
- **The v1.3.1 error-message audit.** This spec fixes only the strings it touches.

## 7. Guards

Prefer a test over prose, per `CLAUDE.md`'s knowledge ladder.

| Claim | Guard |
|---|---|
| A 2.3 MB PNG renders, and never requests text | new `artifact-size-routing.test.tsx`: mount `ActiveArtifactView` with a 2.3 MB `.png`; assert `artifacts.get` was **not** called and `ImageView` mounted |
| An on-disk change to an image never requests text either | same suite: fire the `onChanged` watcher callback for a `.png`; assert `artifacts.get` call count stays 0 |
| `rendersFromBytesOnly` excludes SVG | unit test in `renderer-registry.test.ts`; asserts `svg` false, `png`/`pdf`/`xlsx` true |
| Over-cap text returns a line-trimmed prefix | main-side test on the `artifacts:get` handler: fixture > 2 MB, assert `truncated === true`, `content.endsWith('\n')`, `content.length <= EDIT_MAX_BYTES` |
| A newline-free over-cap file still returns readable text | same suite: 3 MB single-line fixture; assert `content.length > 0` and no `�` in the last 4 chars |
| Over-cap **binary** with an unknown extension routes to the handoff | same suite: assert `binary === true`, `content === null` |
| **An over-cap buffer can never be saved** | `artifact-editing.test.tsx`: no pencil; `handleStartEdit` no-ops; `handleSave` returns false without invoking `artifacts:save`; no draft stashed |
| **A file that grows past the cap while open locks editing** | same suite — the regression this revision exists for: mount under-cap and editable, fire the watcher with an over-cap `truncated` response, assert the pencil is gone and `handleSave` refuses |
| The partial banner survives scrolling | assert the banner element is outside the viewer's scroll container |
| `tooLarge` is fully retired | `rg -n 'tooLarge' desktop/src app/src` returns nothing — run it in the PR body, per the programmatic-verification rule |
| Kotlin mirrors the response shape | extend the existing `EditablePathPolicy` Kotlin test with the truncation branch |

`bash scripts/verify.sh` covers the desktop side; Android needs `./gradlew test`
separately.

## 8. Decisions taken (2026-08-25, with Destin)

- **D1** — `EDIT_MAX_BYTES` is **3 MB** (revised from 2 MB by Destin, 2026-08-25 review).
  Either value clears the 90% bar by a wide margin (§2); 3 MB is chosen headroom, not a
  measured requirement. What matters is the change in *meaning*: it is "how much shows
  instantly", not a wall.
- **D2** — big text degrades to a **read-only prefix with a load-the-rest action**
  (option A), not a full uncoloured read (B) and not scroll-streaming (C). A is the only
  option bounded by construction: a 500 MB file behaves like an 8 MB one.
- **D3** — on remote, **ask before loading a byte file over 5 MB**; below it, load
  silently. **Superseded 2026-08-25 by verification, not by preference:** the channel it
  guards is not reachable over remote (§4.6). Preserved verbatim because it is the right
  shape for the day the bridge exists.
- **D4** — the remote spinner names the size when known. No progress bar. Deferred with D3.
- **D5** — SVG stays on the text path so it remains editable, despite rendering through
  `ImageView`.

## 9. Answered at the 2026-08-25 Workbench review

All three of the questions this spec left open were put to Destin against the real UI
running on the fake backend, and answered:

1. **`REMOTE_ASK_BYTES`** — moot; the remote work is deferred (§4.6).
2. **`FULL_READ_MAX_BYTES`** — defined as `4 × EDIT_MAX_BYTES`, so **12 MB** at the
   revised cap. Not measured; a stated multiple rather than a magic number.
3. **New copy** — reviewed and revised in the Workbench. The partial-view notice is a
   panel-width bar at the *bottom* of the pane reading *"Large File — Showing 3.0/8.4 MB"*,
   with the action as a pressable pill on its right end.

Plus one question this spec had treated as settled and should not have:

4. **Editing above the cap** — confirmed **never**, including after "Load the whole file".

## 10. Superseded — the questions as originally posed

1. **The remote consequence (§4.6).** The artifact pane does not work at all over remote
   access on a desktop host. The underlying gap is already on the ROADMAP; what is new is
   how total it is for this pane. It means `REMOTE_ASK_BYTES` needs no number today.
2. **`FULL_READ_MAX_BYTES`** — deliberately left `TBD` (§4.3). The plan measures it in a
   dev instance rather than guessing; the measured recommendation comes back for sign-off.
3. **All new copy** (§4.3 banner, §4.5 handoffs, §4.6 ask) — proposals only, to be looked
   at in the Workbench per §5 before they are treated as settled.
