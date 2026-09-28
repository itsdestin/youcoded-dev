---
status: active
feature: office
review-round: 1
design: docs/active/specs/2026-09-28-office-build-design.md
---

# Office — build design, review 1

R1-1 accepted — §3a adds the RPC route (bridge invoke → postMessage to the renderer → `office:invoke` → main) and a per-document `ascdesktop://` media scheme. **Blocker.** The one mechanism the whole architecture depends on — getting a document's
bytes from the main process, across the renderer, into the sealed cross-origin `office://app`
iframe — is never specified, and the reference implementation it is borrowed from cannot be
adapted the way §2/§6 imply. §5 says only "`EditorFrame`: bytes in (`office:open`), `Editor.bin`
out (`office:save`)"; §3 says office-files.ts will "hand the bytes + media to the editor" with no
transport named. I fetched euro-office-lite's real `bridge.js`
(github.com/delmarguillen/euro-office-lite, `src/bridge.js`, commit on `main` fetched 2026-09-28):
its open path is `var b64data = await invoke('open_file', {path}); _loadEditorBin(b64data, ...)`
(lines 1908-1910), and `_loadEditorBin` (line 932) reaches directly into `ref.editor` and
`ref.ew.AscCommon`/`ref.ew.document` — live JS object references in the **same window** as the
editor, not a message. Save is the same shape in reverse: `ref.editor.asc_nativeGetFile()` called
directly (line ~1927), base64-encoded, then `invoke('write_editor_bin', {data: b64})` (line 1946).
`invoke` is Tauri's same-process native bridge; `bridge.js` and `sdkjs`/`web-apps` run in one
window with no origin boundary between them at all. YouCoded's design puts `office://app` in a
**sandboxed cross-origin iframe** on purpose (`EditorFrame.tsx:102`,
`sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"`, and the
`iframe-sandbox-no-allow-same-origin.yml` exception comment: "the editor add-on's OWN origin …
never the app's"). That means every one of `bridge.js`'s dozens of `invoke(...)` call sites
(`open_file`, `write_editor_bin`, `save_file_as`, `get_current_path`, `recovery_begin`,
`recovery_mark_saved`, `recent_files_state`, `create_new`, `convert_for_insert`,
`list_user_dictionaries`, `read_clipboard_*`, `print_document`, …) has to be rewritten as an
async postMessage round-trip through the parent frame — a request/reply protocol with
correlation IDs and timeouts that doesn't exist yet (today's `yc-bridge.js`, the actual evidence
cited, only handles fire-and-forget `yc:office-theme`/`yc:office-mode`/`yc:office-cmd` — nothing
receives document bytes). And even if that RPC layer is built, `office-protocol.ts` (§3) is
scoped to "serving the add-on folder only" with traversal explicitly refused outside the add-on
root — it has no described way to serve a translated `Editor.bin` sitting in
`os.tmpdir()/youcoded-office/<job>` back into the iframe's own origin, so a `document:open-url`-
style same-origin fetch (the trial's actual working mechanism — `serve-euro.py`'s CORS'd
`/samples/`) isn't available either without contradicting that confinement rule. **Fix:** design
section needs to pick one mechanism explicitly and spell it out: (a) extend the confined
`office://` handler with a second, per-open-job root (e.g. `office://app/session/<job>/…`) the
iframe can same-origin-fetch, invalidated per job; or (b) define the actual postMessage bytes
protocol (chunking/transfer semantics for the 21 MB workbook case, request IDs, error surfacing)
and enumerate which `bridge.js` `invoke()` call sites it replaces. Either way this is exactly the
"largest unknown" §9 already names — it belongs in the design body, not left implicit.

R1-2 accepted — §5 one editor per file: a registry in office-store; Edit on a file already open in Office focuses its tab instead. **Blocker.** The same file can be opened live in two independent editor instances at once —
the Office page tab and the file-viewer's inline Edit — with no de-duplication between them, and
the design says nothing about what happens when both exist. `office-store.ts`'s `openDoc()`
dedupes by path only within its own tab list (`office-store.ts:32-38`). The file viewer's
`OfficeInlineEditor.tsx` never imports or reads `office-store.ts` — it builds its own
`EditorFrame` from `officeFileFor(absolutePath)` independently (`OfficeInlineEditor.tsx:28-32,76`).
The only guard that exists is one-directional: `use-office-edit-screen.tsx`'s
`officeHeaderAction`, comment "One editor per file: an in-place edit closes before the file moves
to a full tab" (`use-office-edit-screen.tsx:45-47`) — that only fires when the user presses "Open
in Office" *from* the inline editor. Nothing stops opening a file in the Office page first, then
separately pressing Edit on the same file in the session drawer or Project View files tab: two
live Euro-Office document models, each autosaving independently 3 s after its own last change
(§4), each writing through `casWrite`'s CAS token (`cas-write.ts`). The design's own CAS machinery
prevents a *silent* clobber (a stale-token write returns `conflict`, §4's "a failed write shows …
Retry"), but the design never says what the losing editor's retry actually does: if it just
re-reads the current mtime and pushes CAS_REPLACE_ANY-style, the first editor's changes are
silently discarded; if it just keeps retrying with the stale token, that tab is stuck showing an
error banner indefinitely while the user keeps typing into a document that can never save. Either
outcome is bad and neither is chosen. **Fix:** either block the second open (route "Edit" on an
already-open-in-Office file straight to that tab, the way "Open in Office" already reroutes the
inline editor), or explicitly design the reconciliation UX for two live editors on one path —
don't leave it to `casWrite`'s generic conflict return.

R1-3 accepted — §2 spike criteria now include the Euro-Office UI running from office:// in Electron, the theme bridge, and saving through the editor. **Major.** The spike's stated pass condition doesn't gate on the part that's actually
unproven. §2 sets: "Pass = the trial's fidelity checks (`compare.py`) on Destin's six sample
files." But neither 2026-09-27 trial nor 2026-09-28 Euro-Office trial ever ran Euro-Office's real
editor UI (sdkjs + web-apps) inside YouCoded's `office://` scheme at all. The 2026-09-27 run used
**ranuts' OnlyOffice 9.3 WASM build** over a plain HTTP origin with `document:open-url` (a
same-origin URL fetch, not the design's cross-origin bytes plan) — proves the theming/slim-mode
CSS-variable approach and the compact-toolbar command forwarding work, but for OnlyOffice, not
Euro-Office, and not through the eventual transport. The 2026-09-28 Euro-Office trial only ran
**Euro-Office's `x2t` CLI binary** — file-in/file-out via `roundtrip.py`/`compare.py`, no browser,
no editor UI, no bridge — proving format fidelity, nothing about the editor. The investigation
says this outright: "Its server package's editors do not run offline as-is … Swapping
server-build editors under ranuts' guards is therefore not a valid test of the editor UI"
(`2026-09-24-office-suite.md`, "Euro-Office trial" section). So the combination the build actually
needs — Euro-Office's sdkjs/web-apps + an adapted `euro-office-lite` bridge + native `x2t` +
YouCoded's `office://` + whatever cross-origin transport R1-1 resolves — has never been run once,
and §2's table entry "Proven on Euro-Office: yes (euro-office-lite, alpha, Win/Mac/Linux)" reads
as stronger than the evidence: euro-office-lite proves the *concept* runs somewhere, not that
YouCoded's adaptation of it will. **Fix:** name the actual pass condition for task 0 as "Euro-
Office's real editor opens and saves the three fixtures through the real `office://` scheme and
the real cross-origin transport, themed and in slim mode" — fidelity alone is the easy 90%; the
UI/bridge/transport is the risky 10% and isn't in the stated gate.

R1-4 accepted — §4a watch the open file; unchanged documents reload, changed ones get the existing conflict choice. **Major.** Nothing addresses a file changing on disk while it's open in Office — from outside
the app (git checkout, a sync client, another program) or from *inside* it (the assistant's own
Edit/Write/Bash tools operate on the same filesystem path with no relation to
`window.claude.office`, so Claude editing a `.docx` directly while the user has it open in Office
is the same case). `casWrite`'s CAS token means the next autosave attempt after such a change
returns `conflict` rather than silently overwriting the external edit — but, as in R1-2, the
design never says what UX that surfaces for Office specifically: §4 only promises "a failed write
shows the `<ErrorState>`-style specific message … with Retry" — Retry-forever isn't a resolution
when the on-disk content has genuinely diverged from what the open editor's in-memory model holds
(unlike a text file, there's no diff/merge view possible for a binary Office document). **Fix:**
decide and document the Office-specific conflict UX (offer to save-as, or overwrite-with-warning,
or reload-losing-local-edits) rather than relying on the generic Retry copy inherited from the
text-artifact save path.

R1-5 accepted — §5 a tab with unsaved changes or a failed save never sleeps. **Major.** The sleep policy (R8: "A document tab left idle for a while sleeps … with no
unsaved change") has no path out for a tab that can never *clear* its unsaved-change flag — which
is exactly the state R1-2/R1-4 put a losing editor into. §5's `office-store.ts` sleep logic (not
yet built, but per the design: "a tab not shown for 20 minutes, with no unsaved change, unmounts
its editor") means a tab stuck retrying a failed autosave keeps its ~300 MB-1 GB Euro-Office
editor instance alive indefinitely (memory figures: investigation "Trial results", PSS-corrected
section — "Word memo ≈580 MB, 7-slide deck ≈980 MB, 9.5 MB spreadsheet ≈1.0 GB"). A workday with
even two or three tabs in that state defeats R8's entire memory rationale. **Fix:** sleep (or at
minimum warn-and-offer-to-close) a tab with a *stuck* failed save the same as an idle clean one,
rather than gating sleep on "no unsaved change" with no timeout on the failure itself.

R1-6 accepted — §4 recovery copies kept by main (the recovery_* commands), not in the editor origin. **Minor.** "Its crash recovery stays on (it writes to the add-on's own storage)" (§4) glosses
over that euro-office-lite's crash recovery is implemented as native filesystem writes through
Tauri (`invoke('recovery_begin', …)`, `invoke('recovery_mark_saved', …)` — `bridge.js` lines
685-762, backed by `src-tauri/src/recovery.rs`). Inside YouCoded's sandboxed `office://app` iframe
there is no native filesystem access at all — "the add-on's own storage" can only mean the
frame's own IndexedDB/localStorage (which `allow-same-origin` does grant it), a different
mechanism than the one being borrowed, with different persistence/eviction behavior (subject to
Chromium's storage quota and clearing rules) that the design never discusses.

R1-7 accepted — §3 size cap and one save in flight per document, later saves coalesce. **Minor.** The binary save path is left underspecified where an existing, directly relevant
precedent exists. §3 says only "a higher size cap for office files" with no number. The codebase
already has `READ_BINARY_MAX_BYTES = 50 * 1024 * 1024` (`editable-path-policy.ts:151`), whose own
comment says it's "the limit that actually governs images, PDFs and Office docs" today — the
design should say explicitly whether it reuses this constant (the trial's largest file, the 21 MB
workbook, fits comfortably under it) or defines a separate one, and why. Separately, `x2t.ts`'s
"one concurrent job per file" (§3) doesn't say what happens to a second autosave request that
arrives while a translation is still running for that file — queued, coalesced, or dropped —
which matters specifically for a large spreadsheet under continuous editing where `x2t` alone
takes ~2 s (investigation, native-translator table, 21 MB workbook row).

R1-8 accepted — §2 spike runs ODF round trips too. **Minor.** ODF fidelity (contract R23: "in the first version, not added later") was never
tested by either trial. All six fidelity samples in "Trial results (2026-09-27)" and the
2026-09-28 Euro-Office `roundtrip.py`/`compare.py` run are docx/xlsx/pptx; none is `.odt`/`.ods`/
`.odp`. The design's only mention of ODF is the one-word task-list bullet "8. Formats: legacy
prompt, ODF, CSV warning (R21-R24)" (§8) — no x2t format-code handling, no note on whether ODF
opens/saves without the legacy-format prompt R22 describes for `.doc`/`.xls`/`.ppt`, and no
fidelity evidence at all for the format class the contract calls out as launch-blocking.

R1-9 accepted — §3 minimal privilege set, pinned by office-protocol.test.ts. **Minor.** The `office://` protocol's proposed privilege set is new ground the design
presents as routine. §3: "Registered privileged `standard, secure, supportFetchAPI, corsEnabled,
stream` (+ service workers off)." The only existing custom scheme in this codebase,
`theme-asset://` (`main.ts:438`), is registered with a materially different set —
`{ bypassCSP: true, supportFetchAPI: true, corsEnabled: true, stream: true }`, with neither
`standard` nor `secure`, and it only ever serves static images, not a full web app with relative
script/worker/wasm loading. There's no precedent in this codebase for `standard: true` +
`secure: true` without `bypassCSP`, serving a multi-hundred-file bundle with workers and a
non-brotli WASM translator — plausible, but a genuinely first-of-its-kind protocol handler for
this app, worth calling out as more test surface (MIME table completeness, worker/service-worker
boundary behavior, spell-check dictionary fetches) than the single bullet implies.
