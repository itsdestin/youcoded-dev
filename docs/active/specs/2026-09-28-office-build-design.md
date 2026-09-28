---
date: 2026-09-28
status: draft
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
 renderer: OfficeView, EditorFrame,     postMessage   office://app/editor.html
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
  (electron-builder), verifies its checksum, and serves it at `office://app/`.
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

**Spike first (task 0, before anything else is built).** Pass requires ALL of (review 1, R1-3,
R1-8): (a) Euro-Office's own editor UI (built in desktop mode from source) loads from `office://`
inside Electron 41 with the unmodified `bridge.js`; (b) it opens and saves Destin's six sample
files **through the editor's own save path** (not x2t alone), and `compare.py` finds nothing
lost; (c) an `.odt`, `.ods` and `.odp` round-trip the same way; (d) the theme bridge restyles it
in Midnight and Meadow Mist. The spike runs the editor top-level in its own window first
(`scratch/spike/app/`), then framed from a second origin with the §3a relay. If desktop mode
cannot be made to work within the spike's budget, fall back to the WASM route on Euro-Office
(its x2t WASM build exists — CryptPad's), and say so on a reopen deck, since speed differs.

## 3a. How requests and bytes cross the frame (review 1, R1-1)

The whole of euro-office-lite's `bridge.js` runs INSIDE the `office://app` page, where it reaches
the editor objects directly (same origin as the web-apps frames it creates). Its only way out is
Tauri's JS API: `__TAURI__.core.invoke(cmd, args)`, `.event.listen`, `.dialog.confirm/message`,
`.window.getCurrentWindow` (~25 commands, listed in `scratch/spike/app/main.cjs`). The add-on
defines `window.__TAURI__` as a relay, so `bridge.js` stays unmodified:

```
bridge.js ─invoke(cmd,args)─▶ __TAURI__ relay (add-on) ─postMessage {yc:'rpc',id,cmd,args}─▶
YouCoded EditorFrame (checks origin === office://app, source === this frame, cmd ∈ allow-list)
─▶ window.claude.office.invoke(docId, cmd, args) ─IPC─▶ main office/commands.ts
◀── result/error, same id, back down the same path; host → editor events use {yc:'event',name,payload}
```

- Bytes cross as ArrayBuffers (structured clone, transferred — no base64 inflation on our
  side; the relay base64-encodes only where `bridge.js` expects a string).
- Every request carries the frame's `docId`, issued by main when the tab opened the file; main
  keeps one session per docId (current path, temp dir, modified flag), so two open documents
  never share `Editor.bin` the way euro-office-lite's single-window state does.
- **Document media** (pictures inside a document) are served by a second scheme,
  `ascdesktop://docmedia/<docId>/…`, answering only from that docId's temp folder (the name
  `bridge.js` already uses). Dictionaries come from the add-on through the same scheme.
- The allow-list of commands is a const shared by main and the renderer; an unknown command is
  refused and logged. The editor origin cannot reach `window.claude` or any other channel.

## 3. Main process — `desktop/src/main/office/`

All I/O async (performance rule 1; `main-blocking-calls.test.ts` ratchet).

- **`office-protocol.ts`** — `protocol.handle('office', …)` serving the add-on folder only:
  path canonicalised and confined to the add-on root (traversal refused, symlinks resolved),
  correct MIME for `.wasm`/`.js`, no brotli (the bundle stores files unpacked). Privileges are
  the minimum the spike proves necessary (review 1, R1-9): start from `standard, secure,
  supportFetchAPI` (workers, fetch, storage need a standard secure origin); add `stream` only if
  media playback needs it; never `bypassCSP` or service workers. The same set applies to
  `ascdesktop`. `office-protocol.test.ts` pins the final set.
  The scheme is **not** in the renderer's own origin: the editor frame stays a separate origin
  (the ast-grep exception for EditorFrame's `allow-same-origin` depends on this — a test pins it).
- **`x2t.ts`** — runs the bundled native `x2t` with an XML task in a per-job temp dir
  (`os.tmpdir()/youcoded-office/<job>`), async spawn, 60 s timeout, one concurrent job per
  file, stderr kept for the error. Formats: file ⇄ `Editor.bin` (8193/8194/8195 and back), PDF
  export. The trial's `roundtrip.py` is the reference invocation.
- **`office-files.ts`** — open: authorize the path through the existing artifacts write
  boundary (`write-authorization.ts`, same rules as `artifacts:save`; `.git`, credentials never;
  confirm-tier paths ask), translate to `Editor.bin`, hand the bytes + media to the editor.
  Save: editor posts `Editor.bin` → translate back → write via **`casWrite`** (mkdir lock,
  mtime token — the existing conflict machinery) → version snapshot rules (§4). Legacy
  `.doc/.xls/.ppt` save as the modern type after a prompt (R22); CSV save checks for loss (R24)
  and offers `.xlsx` instead. Files over 200 MB are refused with a specific message (review 1,
  R1-7). One save in flight per document; a save requested meanwhile coalesces into one
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
change lands between our read and our write.

## 5. Renderer changes

- **One editor per file** (review 1, R1-2): `office-store` keeps a registry by canonical path
  across the Office page and the file viewers. Opening a file already open elsewhere brings
  that editor forward instead (Edit in a file viewer on a file open in Office focuses its Office
  tab; Open in Office from an in-place edit closes the in-place editor first, as built).
- `office-store.ts`: sleep (R8) — a tab not shown for 20 minutes, with no unsaved change and no
  failed save (review 1, R1-5),
  unmounts its editor; state keeps file + scroll position (the bridge reports and restores
  the caret/scroll on wake).
- `EditorFrame`: bytes in (`office:open`), `Editor.bin` out (`office:save`), save status to
  the strip; message origin checks stay (origin === `office://app`, source === frame).
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
