---
date: 2026-09-28
status: active
type: spec
topic: Office — technical design for the build (backend, add-on, data, reuse), under the signed contract
---

# Office — build design

**Contract (the definition of done, signed 2026-09-28):**
`docs/active/design/2026-09-27-office/office.contract.json` (31 rows). Approved UI: the three
review decks beside it; the workbench mockups on app branch `session/office-suite-investigation`
are the UI's contract. Evidence for every technical claim below: the investigation
`docs/active/investigations/2026-09-24-office-suite.md` and the trial rig
`docs/active/prototypes/2026-09-27-office-trial/`.

This document is for reviewers and builders. It decides *how*, never *what* — a conflict with
the approved UI is a reopen deck, not a change here.

## 1. Shape

```
 YouCoded (MIT)                                   Office add-on (AGPL, separate repo)
 ─────────────────────────────────────            ──────────────────────────────────────
 renderer: OfficeView, EditorFrame,     postMessage   office://<docToken>/editor.html
   OfficeInlineEditor, office-store  ◀──────────▶     Euro-Office sdkjs + web-apps (desktop mode)
        │  window.claude.office.*                     yc-bridge.js (theme, slim, cmds, esc, save)
        ▼                                             AscDesktopEditor shim (from euro-office-lite)
 main: office/ — protocol, x2t runner,
   file pipeline, versions, recent,     spawn         x2t (native, per platform)  ◀── bundled in
   templates, IPC                   ─────────────▶    fonts subset + AllFonts.js      the add-on
```

- **The add-on** is its own public repository, AGPL (contract R2: a separate program shipped
  inside the installer with notices and a code link). It holds the Euro-Office editor build, the
  bridge, the desktop-mode shim, fonts and the native `x2t` per platform, and a CI job that
  publishes one pinned, checksummed bundle per platform.
- **YouCoded** pulls a pinned add-on version at build time into `extraResources/office/`
  (electron-builder), verifies its checksum, and serves it at `office://<docToken>/` — one origin per open document (§3a).
- Only files and small messages cross between them: no shared JS, no imports. This keeps the
  separate-program arrangement clean (investigation, "The one real decision").

## 2. Why desktop mode + native x2t (not the trial's WASM build)

| | ranuts WASM (trial) | Desktop mode + native x2t (euro-office-lite) |
|---|---|---|
| Base | OnlyOffice 9.3 offline build, 16 runtime patches | Unmodified Euro-Office sdkjs/web-apps |
| Open 9.5 MB xlsx | 3.8 s translate, 340 MB kept | 0.85 s, freed on exit (measured 2026-09-27) |
| Proven on Euro-Office | no (server build does not run offline) | yes (euro-office-lite, alpha, Win/Mac/Linux) |

Desktop mode is how OnlyOffice's own desktop app runs the same editors: the page talks to a
host object `window.AscDesktopEditor` instead of a document server. euro-office-lite ships an
AGPL `bridge.js` (~120 KB) implementing that object for a Tauri host. The add-on adapts it to
talk to YouCoded's renderer over postMessage (to `office-host`), and YouCoded's main does what
its Rust side does (open, save, convert, recover). WASM stays a fallback for phones later
(contract R28: desktop first).

**Spike first (task 0, before anything else is built).** Go only if ALL of these pass; any
failure is a no-go for desktop mode (review 1, R1-3, R1-8; review 2, R2-9): (a) Euro-Office's own editor UI (built in desktop mode from source) loads from `office://`
inside Electron 41 with the unmodified `bridge.js`; (b) it opens and saves Destin's six sample
files **through the editor's own save path** (not x2t alone), and `compare.py` finds nothing
lost; (c) an `.odt`, `.ods` and `.odp` round-trip the same way; (d) the theme bridge restyles it
in Midnight and Meadow Mist; (e) the same, with the editor FRAMED from a second origin through
the §3a relay and per-document origins, two documents open at once; (f) the relay moves the
21 MB workbook's bytes in under 300 ms each way. The spike first runs the editor top-level
(`scratch/spike/app/`) to isolate Euro-Office problems from relay problems. If desktop mode
cannot be made to work within the spike's budget, fall back to the WASM route on Euro-Office
(its x2t WASM build exists — CryptPad's), and say so on a reopen deck, since speed differs.

**Spike result (2026-09-28): GO.** Code and how to rerun it:
`docs/active/prototypes/2026-09-28-office-spike/`. Euro-Office desktop build, Electron 41, Linux.
- (a) pass. Changes needed: `get_system_fonts` must return `''`, not `[]` (an empty array
  crashes font loading with NeedStyles). The only `bridge.js` edit is the one-line
  `ASC_PROTO_BASE` patch (§3a).
- (b) pass, framed, through the editor's own save (`write_editor_bin` → x2t). `compare.py`
  finds only the known false alarms: an empty footnotes part appears; conditional formats are
  rewritten in the x14 form; 3 CHECK cells round differently.
- (c) pass for opening; `.odp` is identical. The `.odt` save spreads bold (an upstream x2t
  bug), which Destin's save-as-word answer handles (`office-odf#Q-odf-save`). The large
  workbook written as `.ods` runs out of memory in x2t (§3).
- (d) pass. Meadow Mist turns the panels, buttons and dialog green and hides the title row.
  Test with a light theme: Euro-Office already defaults to dark on a dark desktop, so a dark
  theme can pass without the bridge doing anything. Two leftovers for the build:
  - Theme fonts from Google are blocked by the no-internet policy. Serve them from the add-on
    origin, or fall back.
  - Euro-Office's "New feature" tips and the spreadsheet "links to external sources" warning
    still appear. The bridge must dismiss them; the editor cannot reach the internet anyway.
- (e) pass: two documents, each on its own origin. Neither can read the other's storage or
  media, and neither can reach the internet.
- (f) pass. The relay adds about 210–230 ms to opening the 21 MB workbook (x2t itself: 3.4 s;
  drawn at 6.0 s). The 9.5 MB workbook adds about 110 ms, and its save adds 191 ms.

## 3a. How requests and bytes cross the frame (review 1, R1-1)

The whole of euro-office-lite's `bridge.js` runs INSIDE the document's `office://<docToken>` page, where it reaches
the editor objects directly (same origin as the web-apps frames it creates). Its only way out is
Tauri's JS API: `__TAURI__.core.invoke(cmd, args)`, `.event.listen`, `.dialog.confirm/message`,
`.window.getCurrentWindow` (~25 commands, listed in `scratch/spike/app/main.cjs`). The add-on
defines `window.__TAURI__` as a relay, so `bridge.js` stays unmodified:

```
bridge.js ─invoke(cmd,args)─▶ __TAURI__ relay (add-on) ─postMessage {yc:'rpc',id,cmd,args}─▶
YouCoded EditorFrame (checks origin === this document's office://<docToken>, source === this frame, cmd ∈ allow-list)
─▶ window.claude.office.invoke(docId, cmd, args) ─IPC─▶ main office/commands.ts
◀── result/error, same id, back down the same path; host → editor events use {yc:'event',name,payload}
```

- Bytes cross as ArrayBuffers (structured clone, transferred — no base64 inflation on our
  side; the relay base64-encodes only where `bridge.js` expects a string).
- **One origin per document** (review 2, R2-1, R2-2). Main issues each opened document an
  unguessable 128-bit `docToken`; its editor loads from `office://<docToken>/editor.html`, so
  every open document is its own origin. That separates what `bridge.js` keeps in
  `localStorage` (`eo-pending-open-path`, `eo-pending-recover-id` — it assumes one document per
  page) and every other per-origin state. Main keeps one session per token (path, temp dir,
  modified flag); two documents never share an `Editor.bin`.
- **Document media** (pictures inside a document) and dictionaries are served under the same
  per-document origin: the add-on sets `bridge.js`'s protocol base (`ASC_PROTO_BASE`, one line
  in the add-on's small patch set) to `office://<docToken>/asc/`; the handler answers
  `/asc/docmedia/…` only from that token's temp folder. Another document cannot name the folder
  without its token.
- **Main re-checks everything** (review 2, R2-7): each `office:invoke` is refused unless the
  command is on the allow-list AND the token belongs to a document opened by the sending
  window (`event.sender`). The renderer's own check is a convenience, not the guard.
- **Bytes** travel as ArrayBuffers end to end (transferred, not copied); where `bridge.js`
  expects base64 the add-on patch hands it bytes instead (review 2, R2-8). Budget: the 21 MB
  workbook under 300 ms each way, measured in the spike.
  - **Task 3 update:** base64 strings cross unchanged instead — euro-office-lite's `bridge.js`
    passes them as base64 itself, and there is no bytes-instead patch. The spike measured them
    within budget: +110 ms for the 9.5 MB workbook, +210–230 ms for the 21 MB one, 191 ms to
    save the 9.5 MB one. So review 2's R2-8 ("hand it bytes instead") is not needed, and
    `bridge.js` stays unmodified apart from `ASC_PROTO_BASE`.
- The editor origin cannot reach `window.claude` or any other channel.

## 3. Main process — `desktop/src/main/office/`

All I/O async (performance rule 1; `main-blocking-calls.test.ts` ratchet).

- **`office-protocol.ts`** — `protocol.handle('office', …)` serving the add-on folder only:
  path canonicalised and confined to the add-on root (traversal refused, symlinks resolved),
  correct MIME for `.wasm`/`.js`, no brotli (the bundle stores files unpacked). Privileges are
  the minimum the spike proves necessary (review 1, R1-9): start from `standard, secure,
  supportFetchAPI` (workers, fetch, storage need a standard secure origin); add `stream` only if
  media playback needs it; never `bypassCSP` or service workers. The same set applies to
  per-document origin. `office-protocol.test.ts` pins the final set. Every response carries a
  CSP with no network egress (`default-src office: data: blob:`, no `connect-src` beyond
  `office:`), so a compromised editor cannot send a document anywhere; the editor's external
  links (help, about) open through the app's window-open handler (review 2, R2-6).
  - **Fix round 1 deviation:** the scheme-source `office:` alone would let one document's page
    load resources from every OTHER open document's `office://<other-token>` origin too — the
    per-document confinement `office-protocol.ts` enforces server-side was not mirrored at the
    CSP layer. Every directive now scopes to `'self'` instead — `default-src 'self' data: blob:
    'unsafe-inline' 'unsafe-eval'; connect-src 'self' data: blob:; img-src 'self' data: blob:;
    font-src 'self' data:` — plus `form-action 'none'; base-uri 'none'`. `data:`/`blob:` and the
    `unsafe-*` keywords are unchanged. CSP still cannot stop a script from navigating the frame
    itself (`location = 'https://...'`); that needs the editor frame's own navigation guard, a
    later task.
  The scheme is **not** in the renderer's own origin: the editor frame stays a separate origin
  (the ast-grep exception for EditorFrame's `allow-same-origin` depends on this — a test pins it).
- **`x2t.ts`** — runs the bundled native `x2t` with an XML task in a per-job temp dir
  (`os.tmpdir()/youcoded-office/<job>`), async spawn, 60 s timeout, one concurrent job per
  file, stderr kept for the error. **The temp dir is fresh per job, never shared between the
  open and the save** — measured in the spike (2026-09-28): saving with the dir the open had
  used (it leaves `xlsx_unpacked/` behind) made x2t merge the old drawing parts in, and a
  workbook's 5 charts came back on two sheets; a clean dir is correct. Pinned by a test that
  round-trips a charted fixture. Also measured: x2t runs out of memory (`std::bad_alloc`)
  writing the 9.5 MB model as `.ods` — a very large spreadsheet saved as OpenDocument fails
  with a specific message instead of a crash (R23). Formats: file ⇄ `Editor.bin` (8193/8194/8195 and back), PDF
  export. The trial's `roundtrip.py` is the reference invocation.
- **`office-files.ts`** — open: authorize the path through the existing artifacts write
  boundary (`write-authorization.ts`, same rules as `artifacts:save`; `.git`, credentials never;
  confirm-tier paths ask), translate to `Editor.bin`, hand the bytes + media to the editor.
  Save: editor posts `Editor.bin` → translate back → write via **`casWrite`** (mkdir lock,
  mtime token — the existing conflict machinery) → version snapshot rules (§4). Legacy
  `.doc/.xls/.ppt` save as the modern type after a prompt (R22); CSV save checks for loss (R24)
  and offers `.xlsx` instead. Files over 200 MB are refused with a specific message (review 1,
  R1-7; review 2, R2-10): the translated form plus the editor's model run to several times the
  file's size in memory (the 21 MB workbook used ~1 GB), so 200 MB is where a laptop would
  start to swap. The limit is `OFFICE_MAX_BYTES` in `shared/office-types.ts`, enforced by
  office-files' own reader — not the artifacts preview reader, whose 50 MB
  `READ_BINARY_MAX_BYTES` (editable-path-policy.ts) stays for previews. A 50–200 MB file shows
  the viewer's existing too-large-to-preview state, with Edit and Open in Office still offered
  (review 3, R3-2). One save in flight per document; a save requested meanwhile coalesces into one
  follow-up save with the newest bytes.
- **`versions.ts`** — snapshots under `userData/office-versions/<sha1(canonical path)>/`:
  `index.json` + one copy per version. Taken on open and at most every 10 minutes while
  changing; before a restore. Pruning (R11): keep all from the last 24 h, then the newest per
  day for 30 days, max 50 per file, 1 GB across all files (oldest first). Pruning runs after
  each snapshot and once at startup, off the hot path. Restore = snapshot current, then write
  the chosen copy through `casWrite`.
- **`recent.ts`** — `userData/office-recent.json`, 12 entries, opened time (R5).
- **`templates/`** — three blank files (docx/xlsx/pptx) in the add-on; `create(kind)` copies
  one into the focused project (or `~/Documents`) with a free name.
- **IPC** — `office:status|create|pick|open|save|versions|restore` +
  `office:changed` push. Handlers in `ipc-handlers.ts` via a small `registerOfficeIpc()`;
  `preload.ts` gains `window.claude.office`. **Desktop only** for this version (R28):
  `remote-shim.ts` and `SessionService.kt` answer `not-implemented` and the renderer gates on the
  bridge being present (already how `office` is detected). `ipc-channels.test.ts`
  `DESKTOP_ONLY` lists them.

The mock bridge's shape (`shared/office-types.ts`) changes in one place: `source()` (a URL, for
the workbench) is replaced by `open()` returning bytes for the editor; the workbench fake keeps
serving the fixtures through the same new call.

## 4. Autosave and versions in detail

- The editor raises "changed" (`onDocumentStateChange`); the bridge relays it. The renderer
  asks for a save 3 s after the last change (debounced, per document), and on tab close,
  sleep, window close and app quit (the quit path waits up to 5 s, then keeps the editor's
  own recovery copy).
- "Saved" in the tab strip reflects the last successful write; a failed write shows the
  `<ErrorState>`-style specific message in the strip with Retry, never a silent loss.
- The editor's own history menu is hidden via `customization` + the bridge (R12). Crash
  recovery is main's job (review 1, R1-6): `bridge.js`'s `recovery_*` commands write recovery
  copies to `userData/office-recovery/<docId>/`; on reopen after a crash, the tab offers them.

### 4a. The file changes on disk while open (review 1, R1-4)

Main watches each open file (the existing artifacts watcher). On an outside change — another
program, or the assistant's own file tools: an unmodified document reloads in place (keeping
its tab and scroll); a modified one shows the file viewer's existing conflict choice ("This
file changed on disk while you were editing" — keep mine / use the file on disk), and autosave
pauses for that document until answered. `casWrite`'s mtime token catches the race where the
change lands between our read and our write. "Reload" remounts the frame on the fresh file;
the caret and scroll position come back best-effort from what the bridge last reported
(review 2, R2-4). An asleep tab needs nothing: it opens the newest file when woken, unless it
holds a recovery copy, in which case waking shows the same conflict choice (review 2, R2-5).

## 5. Renderer changes

- **One editor per file** (review 1, R1-2): `office-store` keeps a registry by canonical path
  across the Office page and the file viewers. Opening a file already open elsewhere brings
  that editor forward instead (Edit in a file viewer on a file open in Office focuses its Office
  tab; Open in Office from an in-place edit closes the in-place editor first, as built).
- `office-store.ts`: sleep (R8) — a tab not shown for 20 minutes goes to sleep. If it still
  holds unsaved changes (its save keeps failing), it first writes a recovery copy through main
  and sleeps anyway, so a stuck tab never holds its memory (review 1, R1-5; review 2, R2-3);
  waking restores from the recovery copy and retries the save;
  unmounts its editor; state keeps file + scroll position (the bridge reports and restores
  the caret/scroll on wake).
- `EditorFrame`: bytes in (`office:open`), `Editor.bin` out (`office:save`), save status to
  the strip; message origin checks stay (origin === this document's `office://<docToken>`, which
  office-store threads into EditorFrame's `origin` prop; source === frame — review 3, R3-1).
- Theme: unchanged from the mockups (`office-theme.ts` + the bridge), plus roundness (R26)
  already mapped; a pinning test compares the bridge's token list to `office-theme.ts`.
- Escape (R20), focus on tab switch, the header briefcase, slim overscan: as built in the
  mockups.
- `mock-only.ts` rows come off as each real channel lands.

## 6. The add-on repository

- Contents: `vendor/` (Euro-Office web-apps + sdkjs at a pinned tag, built with their grunt
  tasks in CI — never committed build output), `bridge/` (yc-bridge.js + adapted desktop shim),
  `fonts/` (the ~25-family set, R3, plus generated `AllFonts.js` — the Calibri entry must carry
  Carlito's faces; a test asserts every family with a bold file maps it), `x2t/` fetched from
  the matching Euro-Office core release per platform, `templates/`, `LICENSE` (AGPL) and
  `NOTICE` (Euro-Office + OnlyOffice attributions, font licences).
- CI builds `youcoded-office-<version>-<platform>.tar.zst` + `SHA256SUMS`; YouCoded's
  `scripts/fetch-office.mjs` downloads the pinned version at build and in dev.
- User fonts: the add-on's font generator runs once per machine at first Office open (main
  process, off-thread) over the system font folders, writing a user `AllFonts.js` overlay into
  `userData/office-fonts/` (R3 "plus the fonts on your computer").

## 7. Tests (turn contract rows mechanical where possible)

- `office-protocol.test.ts` — traversal, symlink escape, MIME, origin isolation.
- `office-versions.test.ts` — the R11 pruning policy on synthetic histories (day/30/50/1 GB).
- `office-x2t.test.ts` — task XML, timeout, error surfacing (fake binary).
- `office-files.test.ts` — write boundary applied, casWrite conflict path, CSV-loss check,
  legacy prompt path.
- `office-bridge-contract.test.ts` — the message names/fields the renderer sends equal the
  bridge's handlers (reads both files).
- Renderer: `OfficeView.test.tsx` (tabs, sleep, versions dialog), shoot screens as now,
  journey `open-office-document.json`.
- Fidelity check in CI of the add-on repo: `roundtrip.py` + `compare.py` over committed
  neutral fixtures.

## 8. Order of work (tasks)

0. Spike (§2) — go/no-go.
1. Add-on repo skeleton + CI bundle (Linux first) + fetch script + electron-builder wiring.
2. Main: protocol + x2t runner + open/save pipeline + IPC; renderer switches from the mock.
3. Autosave + versions + pruning; Versions dialog on real data.
4. Recent, create, pick; start screen on real data.
5. Theme/roundness/slim wiring against Euro-Office (re-verify the four themes).
6. **Demo point** (Q-first-demo): Office page + tabs + theme, open/edit/save real files — Destin tries it in a dev window.
7. File-viewer editing on the real backend (R14–R20).
8. Formats: legacy prompt, ODF, CSV warning (R21–R24).
9. Sleep (R8), user fonts overlay, Windows + macOS bundles.
10. Reviews → grader → acceptance deck.

## 9. Risks

- Desktop-mode shim adaptation is the largest unknown (spike).
- Euro-Office lags OnlyOffice by a minor version; pin and update deliberately.
- Memory: each awake editor ~300 MB+; sleep (R8) is the mitigation.
- The separate-program arrangement gets its lawyer check before launch (R2 risk).
- Mac: the native x2t must be signed with the app; Windows antivirus first-run scan delay.
