---
date: 2026-09-24
status: active
type: investigation
topic: Building a full office suite (documents, spreadsheets, slides, PDF) into YouCoded with as little new code as possible — which open-source engine to borrow, what we must write ourselves, and what it would look like
---

# An office suite inside YouCoded — investigation

**Read against:** app master at the time of writing (2026-09-24); outside research done the same day
(sources linked inline). Nothing here is built. Every number marked *measured* was checked in
this session; everything else is sourced research.

## For Destin, in plain words

**The short answer:** we can get a real, Word/Excel/PowerPoint-class office suite into YouCoded
while writing only a small fraction of it ourselves — **by borrowing OnlyOffice's own editors
whole.** OnlyOffice's editors are, underneath, a web page. Their desktop app (the one you use on
Linux) is literally that web page in a browser window, plus a small translator program that
turns .docx/.xlsx/.pptx files into the editor's format and back. YouCoded is also a web page
in a browser window. So the same trick works for us.

Other people have already done exactly this, which is why I'm confident:

- **CryptPad** (a privacy-focused online office) runs OnlyOffice's editors with no server at all,
  and maintains a version of the file translator that runs inside the browser.
- **ranuts/document** (≈1,950 GitHub stars, updated 12 days ago) is "edit DOCX/XLSX/PPTX in
  your browser, offline, no server" — OnlyOffice's editors, packaged the way we would.
- **euro-office-lite** is an offline desktop office app built on **Euro-Office**, a 2026 fork of
  OnlyOffice (see "The one real decision" below), wrapped in a desktop shell much like ours.

**How much we'd write vs. borrow:** roughly **95%+ of what you'd see and use is borrowed** —
every toolbar, menu, formula, chart, table, slide transition, track-changes, comments, print
and PDF-export. What we write is the "glue": opening and saving your files, the Office page
itself (recent files, new document, templates), making it match your theme, the smaller
built-in editor in the file viewers, letting the assistant read and edit the open document,
and getting it onto Android and the phone remote. I estimate that at **a few thousand lines**,
against the **millions** of lines we'd borrow.

**The hard parts are mostly not code — they're packaging and one licensing decision:**

1. **License (a business decision, yours).** OnlyOffice's editors are under a "share-alike"
   license (AGPL): if we build them *into* YouCoded, YouCoded's own license must become
   share-alike too. YouCoded is currently MIT (the most permissive kind). There are clean ways
   through this — see below — but you have to pick one before we write anything.
2. **Size.** The full editor package is about **440 MB unpacked** (*measured*; ~184 MB of that
   is fonts). That's far too big to put in every YouCoded download. The fix — which the app
   already uses for local AI models and voice — is to make Office a **one-time download the
   first time you open it**, and to trim the fonts.
3. **Looks.** OnlyOffice has its own toolbar style. It supports light/dark and custom colour
   themes, so we can get it *close* to each YouCoded theme's colours, but it will never be
   pixel-identical to the rest of the app (your wallpapers, glass effects and bubble shapes
   won't carry into the editor's toolbar). This is the biggest thing you will *notice*.

## What you'd experience (the imagined product)

**1. An "Office" page, pinned top-left like other pages.**
Opening it shows a home screen much like OnlyOffice Desktop's start page: *New document /
New spreadsheet / New presentation*, a *Recent* list, *Open file…*, and templates. The first
time ever, it says it needs a one-time download (with size and a progress bar), the same
pattern as downloading a local model today.

**2. Tabs across the top, one per open file** — like OnlyOffice Desktop, or browser tabs. Each tab
is the full OnlyOffice editor: the ribbon toolbar (Home / Insert / Layout / References / Review…),
the formula bar in sheets, the slide list in presentations. Everything you know from OnlyOffice
is there, because it *is* OnlyOffice.

**3. The file viewers (session drawer and Project View) get a lighter version.**
- Opening a .docx/.xlsx/.pptx shows it **instantly** as today — the current quick previews
  stay, because they open in a blink while the full editor takes a second or two to start.
- Pressing **Edit** swaps in the *same* OnlyOffice editor, but with a **compact toolbar** (one
  slim row: font, bold/italic, alignment, lists, undo — OnlyOffice has a built-in compact mode
  for exactly this). No second, weaker editor to build or maintain.
- An **"Open in Office"** button moves the file to a full tab on the Office page, keeping your
  unsaved edits and your place.
- This fixes the known complaint that spreadsheets in the file viewer are look-only
  (roadmap, files: "Spreadsheets in the files pane are look-only", 2026-09-03).

**4. The assistant can work *inside* the open document.** OnlyOffice has an official "plugin"
system that can read and change the document you're looking at, live — insert a paragraph,
fill a column, restyle a slide. We'd write one YouCoded plugin so that when you say "clean up
column C" or "tighten this paragraph", you watch it happen in the editor, and can undo it
like any edit. This is the feature that makes it *YouCoded's* office rather than just
OnlyOffice in a frame.

**5. Android and the phone remote.** OnlyOffice's editors include a separate **phone-sized
interface** (bigger buttons, bottom sheets), also borrowed. Android would download the
editors on first use like desktop. Over the phone remote, the phone's own browser runs the
editor and the desktop just hands it the file.

**6. PDF.** Keep today's PDF viewer for reading. OnlyOffice 8+ also opens PDFs for
annotation and form-filling, so "Edit" on a PDF would open it there. Full PDF *rewriting*
(changing the original text) is limited in every open-source option; don't expect Acrobat.

### Things you might not expect (risks to what you'd experience)

- **First open is slow-ish.** A one-time download (likely ~100–150 MB compressed after
  trimming fonts — estimate, not measured), then each editor tab takes ~1–3 seconds to start.
  The instant quick-preview stays so browsing files never gets slower than today.
- **Theme mismatch.** The editor's toolbar follows your theme's colours and light/dark, but
  not wallpapers, glass, fonts or custom shapes. Switching themes while a document is open
  may briefly repaint the editor.
- **Fonts.** If a document uses a font we didn't ship, it falls back to a look-alike, the same
  as in OnlyOffice. Trimming fonts to save download size makes this happen slightly more often.
- **Memory.** Each open office tab uses a few hundred MB of memory, like OnlyOffice Desktop
  does today. On Android, many open documents at once will be slow.
- **"Based on ONLYOFFICE"** (or Euro-Office) has to appear somewhere visible — an About line
  at minimum, possibly a logo, depending on which version we use (next section).
- **The app download does not grow** if Office is a separate download. If instead we bundled
  it, every YouCoded download would grow by several hundred MB.

## The one real decision: license

> **DECIDED 2026-09-24 (Destin): Option A — YouCoded stays MIT; the editors ship as a separate
> AGPL add-on (own public repo, downloaded on first use, sealed frame, files + messages only).**
> Theming is unaffected by this choice: our look changes live in the add-on's public copy.
> Target look: colours, fonts, corners, see-through/glass toolbars, OnlyOffice's own header and
> tabs hidden in favour of YouCoded's; the file-viewer compact editor gets a YouCoded-drawn
> toolbar that drives the editor through our in-editor plugin. Icons, dialog layouts and the
> canvas-drawn grid/page stay OnlyOffice's (recoloured only). Top ongoing risk: upstream updates
> breaking our styling/plugin hooks — pin the version and update deliberately with a test pass.

OnlyOffice's editors are AGPL — "you may use this, but anything you build it *into* must also
be shared under AGPL". YouCoded is MIT. Three ways through:

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Office as a separate, optional add-on** (recommended) | The editors live in their own open-source repo (e.g. `youcoded-office`, AGPL) and are downloaded on first use. YouCoded talks to them only by passing messages and files, the way it already talks to the downloaded local-AI engine. | YouCoded stays MIT. Download stays small. Matches the existing download-on-demand pattern. | "Separate program" is the widely used reading of the license for this set-up, but it is an interpretation, not a guarantee — worth a short lawyer check before launch. Slightly more plumbing. |
| **B. Relicense YouCoded as AGPL** | Everything becomes share-alike. | Simplest legally; no line-drawing. | Permanent and hard to undo. Anyone who modifies YouCoded and runs it as a service must share their changes. It could deter some contributors or companies. Any past outside contributors' code would need their agreement. |
| **C. Buy OnlyOffice's commercial "Developer" licence** | Paid licence removes the share-alike duty. | No licence questions at all. | Costs money (price not public; needs a sales quote). You depend on their pricing and relationship. |

**Which OnlyOffice: original or Euro-Office?** In March–April 2026, Nextcloud, IONOS and others
forked OnlyOffice as **Euro-Office**, because OnlyOffice's licence adds a "you must keep our
logo, but you have no right to use our logo" condition. The Software Freedom Conservancy (the
group that looks after the AGPL) sided with the fork, saying that condition can be dropped
([SFC](https://sfconservancy.org/blog/2026/apr/16/badgeware-onlyoffice-nextcloud-affero-gpl/)).
Euro-Office is active (repos updated this month) and an offline desktop wrapper of it already
exists. **Recommendation:** start from **Euro-Office** if its editors keep pace with
OnlyOffice's features, otherwise from OnlyOffice itself with its logo shown. Either way the
code is almost identical; we can switch later with little work. (One source says the dispute
was settled by June 2026; I could not confirm the terms, so treat that as unverified.)

## Why not LibreOffice (or Collabora, or the smaller libraries)?

| Option | Verdict | Why |
|---|---|---|
| **OnlyOffice / Euro-Office editors** | ✅ **Recommended** | Best Microsoft-format fidelity among open options; a UI you already like; runs as a web page (fits Electron, Android and the phone remote); proven serverless by CryptPad and ranuts/document; has a phone interface and an official live-editing plugin API. |
| LibreOffice in the browser (ZetaOffice) | ❌ Not yet | Still beta; the download and memory use are huge (hundreds of MB to ~1 GB working set); it draws LibreOffice's old desktop UI into a canvas, so it would look foreign in the app. Worth re-checking in 6–12 months. Licence (MPL) is friendlier. |
| Collabora Online | ❌ | Needs a server program running behind it by design. Its new desktop app (Nov 2025) is a separate application, not something we can embed. |
| LibreOffice engine driven directly | ❌ Too much new code | Proven (Collabora's Android app works this way), but we'd be writing our own Collabora — exactly what you wanted to avoid. |
| Univer (spreadsheets/docs library) | ❌ for full suite | The free part is good, but faithful .xlsx/.docx import/export needs their paid, closed server; slides are unfinished. |
| Small libraries (FortuneSheet, SheetJS, TipTap, PPTXjs, pdf.js…) | ❌ for full suite | Each does one thing; stitched together they'd still lose formatting when saving real Office files. We'd be writing an office suite. We already use some of them (mammoth, exceljs, pdf.js) for the quick previews — they stay for that. |

## What's borrowed vs. what we write

| Piece | Borrowed or new | Hard because of UI, backend, or packaging | Prior art |
|---|---|---|---|
| Word/Excel/PowerPoint editors, formulas, charts, comments, track changes, print, PDF export | **Borrowed** (OnlyOffice sdkjs + web-apps) | — | OnlyOffice itself |
| File translator (.docx ↔ editor format) | **Borrowed** (x2t, browser build) | Packaging | CryptPad's `onlyoffice-x2t-wasm` (~16 MB) |
| Phone-sized editor UI | **Borrowed** (web-apps mobile) | — | OnlyOffice mobile web |
| Serving the editors inside the app (their own private address, workers, fonts) | **New, small** | Backend | OnlyOffice Desktop, ranuts/document, euro-office-lite |
| Open / save real files (incl. a new "save binary file" path — today the app can only save text) | **New, medium** | Backend | The app's existing text save, with its conflict check and write-permission guard |
| One-time download, version pin, integrity check, update | **New, small** — copy of the local-AI engine download | Packaging | `engine-pin.ts`, `voice-pin.ts` |
| Office page: start screen, recents, templates, tabs | **New, medium** | **UI** — the main UI design work | OnlyOffice Desktop start page |
| Compact editor in the file viewers + "Open in Office" handoff | **New, small–medium** (settings on the same editor + handoff logic) | UI | OnlyOffice's `compactToolbar` / view-mode settings |
| Theme matching | **New, small–medium** | **UI** — never perfect | OnlyOffice's custom theme files |
| Assistant plugin (read/edit the live document) | **New, medium** | Backend + a little UI | OnlyOffice plugin API (`callCommand`, `executeMethod`) |
| Fonts: choose, trim, let the editor see your installed fonts | **New, small** but fiddly | Packaging | OnlyOffice's font-list generator |
| Spell check | **Borrowed** (dictionaries + engine), wiring new | Packaging | OnlyOffice web spell checker |
| Android: download editors, serve them to the WebView, open/save through the Android file layer | **New, medium** | Packaging + backend | The app's Android file bridge (`artifacts:get/save` are already real there) |
| Phone remote: send the editors and the file to the phone's browser | **New, small** | Backend | The remote server already serves the app's own files |
| Build pipeline for the add-on (fetch pinned editors + translator, trim, publish) | **New, small** | Packaging | CryptPad's and ranuts' build scripts |

**UI vs backend, overall:** the *difficult UI* is small in amount but decides whether it feels
right: the Office start page, the compact-editor handoff, and theme matching. The *difficult
backend* is mostly packaging: download-on-demand, binary saving, fonts, and Android. Almost
nothing is new invention; every piece has a working example to copy.

## How it fits the current app (facts, for whoever builds it)

- **One file viewer serves both surfaces:** `desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx`,
  used by `SessionDrawer.tsx` and `project-view/tabs/FilesTab.tsx`. Viewers are chosen in
  `RendererRegistry.ts:26-57` (docx→mammoth, xlsx→exceljs, pdf→pdf.js, no pptx today). The Office
  editor would register as the **edit** viewer for docx/xlsx/pptx/odt/ods/odp
  (`getEditViewer`, `RendererRegistry.ts:67-71`), leaving the quick previews as the read viewers.
- **Saving is text-only today:** `artifacts:save` (`ipc-handlers.ts:5129`) writes a UTF-8 string;
  `edit-permission.ts` refuses binary files and `EDIT_MAX_BYTES` is 3 MB. A binary save channel
  (desktop + Android Kotlin twin, same conflict and write-boundary guards) is required, with a
  higher size cap for office files.
- **Pages cannot host this as-is.** Pages run in a locked-down frame (`PageHost.tsx:385`, CSP in
  `page-theme.ts:155-173`): inline script only, no workers, no WebAssembly loading, no storage,
  no local file access, and Pages don't run on Android yet. So Office should be **a built-in
  page that looks like a pinned page** (same top-left button), not a user Page. The editors
  should be served from a **dedicated private address** (a new `office://`-style scheme like
  the existing `theme-asset://`, `main.ts:434`), loaded in a frame, so they get workers/WASM
  but stay walled off from the app's own powers.
- **Download-on-demand precedent:** `src/main/engine/engine-pin.ts` (llama-server) and
  `src/main/voice/voice-pin.ts` — pinned version, checksum-verified, stored outside the installer.
- **Android** loads the same React bundle from `file:///android_asset/web/` (`WebViewHost.kt:214`);
  the add-on would be served from app storage via a local asset loader. APK is arm64-only; no
  APK size budget exists.
- **Licence:** `youcoded/LICENSE` is MIT. There is no existing roadmap or doc mention of
  OnlyOffice/LibreOffice/Collabora (searched `docs/`, including the archive).

## Measured / sourced numbers

- ranuts/document's packaged editors (*measured* from its repo, 2026-09-24): fonts 184 MB (203 files),
  web-apps 130 MB (desktop UI 84 MB, phone UI 17 MB), sdkjs 124 MB, WASM ≈15 MB. ≈440 MB
  unpacked in total; compressed download size not measured.
- CryptPad x2t WASM release v9.3.0: 16.6 MB zip ([repo](https://github.com/cryptpad/onlyoffice-x2t-wasm)).
- OnlyOffice Docs 9.4 removed the old 20-connection limit; it wouldn't apply to us anyway (no server).
- Plugin API: [api.onlyoffice.com — interacting with editors](https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/overview/).

## Suggested order, if you go ahead

0. **Decide the licence route** (A/B/C above). Nothing else should start first.
1. **Spike (days, throwaway):** run ranuts/document's build in a dev YouCoded window, open and
   save a real .docx/.xlsx/.pptx from your files, measure download size, start time, memory, and
   check the phone UI. This proves or kills the plan cheaply.
2. **Design (the usual review decks):** Office start page, tabs, compact editor + "Open in
   Office" handoff, first-run download screen, theme matching Before/After.
3. **Desktop:** add-on packaging and download, private address, binary save, Office page,
   compact editor in the viewers.
4. **Assistant plugin.**
5. **Phone remote, then Android.**

## Open questions for Destin

1. ~~Licence route~~ — decided: A (see above).
2. Euro-Office or original OnlyOffice as the base?
3. Is "a one-time ~100–150 MB download the first time you open Office" acceptable, or should
   Office be in the main download?
4. For the file viewers: keep the instant quick preview and load the real editor only on
   *Edit* (recommended), or always open straight into the editor (slower to open, one less step)?
