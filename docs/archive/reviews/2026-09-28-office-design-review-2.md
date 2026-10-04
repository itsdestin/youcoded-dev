---
status: shipped
feature: office
review-round: 2
design: docs/archive/specs/2026-09-28-office-build-design.md
---

# Office — build design, review 2

R2-1 accepted — §3a each document gets its own origin (office://<docToken>/), so localStorage and every other per-origin state are per document. — **Blocker.** The docId session model in §3a claims two open documents "never share Editor.bin
the way euro-office-lite's single-window state does" — but every editor tab loads the SAME origin
(`office://app`), and euro-office-lite's own document-open/reopen/crash-recovery bootstrap runs
through `localStorage` keys on that shared origin, not through anything docId-scoped. I fetched and
read the actual code: `scratch/spike/eol/src/editor-patches.js:806-808` states outright "the editor
is mounted once, at startup, and which one to mount is only known after Rust answers" — a
single-instance-per-origin assumption baked into the reference implementation. `checkPendingOpenPath`
(`editor-patches.js:834-853`) reads `localStorage.getItem('eo-pending-open-path')` at page mount to
decide which file to load; it is SET, then followed by a bare `window.location.reload()`, at three
separate call sites: `bridge.js:852` (note-separator reopen), `bridge.js:1902` (`LocalFileOpen`
switching documents), and the crash-recovery path `_recoverDocument()` (`editor-patches.js:872-877`,
setting `eo-pending-recover-id` the same way). Since every open Office tab (R7: "several open Office
documents appear as tabs") is a separate `<iframe>` on the SAME `office://app` origin, they all read
and write the SAME `localStorage` object — there is no per-docId partition anywhere in this
mechanism. Two tabs reloading near the same time (§4a's own "an unmodified document reloads in
place" trigger, a document switch, or R1-6's now-main-driven crash recovery all funnel through this
exact primitive) race on the same keys: tab A can set `eo-pending-open-path` to its file, tab B's
reload can read it before A's own reload does, and the wrong file opens in the wrong tab. §3a's "two
open documents never share ... state" claim is true only for `Editor.bin` on the main-process side;
it is false for this client-side bootstrap, and the design never mentions it. **Fix:** either (a)
give each editor iframe its own storage partition (Electron's `partition`/`session` per docId is not
available to a plain `<iframe>` without moving to `<webview>` or out-of-process frames with distinct
storage keys — a real architecture change worth spelling out), or (b) accept that `bridge.js` and
`editor-patches.js` are NOT fully unmodified and patch the open/reopen/recovery bootstrap to key its
localStorage off a docId-namespaced key the relay injects before triggering `location.reload()`.
Either way, §3a's "bridge.js stays unmodified" claim needs to be corrected or the collision needs to
be closed; right now neither is true.

R2-2 accepted — §3a media under the same per-document origin, keyed by an unguessable 128-bit token; the handler answers only that token's folder. — **Blocker.** The `ascdesktop://docmedia/<docId>/…` scheme (§3a) is scoped only by folder path
on the SERVER side ("answering only from that docId's temp folder") — there is no check of WHICH
FRAME is asking. Electron's `protocol.handle(scheme, handler)` callback receives a plain Fetch API
`Request`; it carries no frame/webContents identity, so a global handler registered once in main (as
§3's `office-protocol.ts` describes) cannot distinguish "editor tab for docId A fetching its own
media" from "editor tab for docId A fetching docId B's media". Since every open editor tab shares the
SAME origin (`office://app`, confirmed by `EditorFrame.tsx:55`'s `src` construction and reinforced by
the spike registering `ascdesktop` with `corsEnabled: true` unconditionally,
`scratch/spike/app/main.cjs:25-28`), a compromised editor frame — plausible given the attack surface
is a document-parsing engine opening untrusted files, and the investigation itself found real bugs in
the borrowed package — can simply `fetch('ascdesktop://docmedia/<other-open-docId>/…')` for any OTHER
currently-open document and read its embedded images, entirely outside the postMessage RPC relay (so
the relay's origin/source/allow-list checks in EditorFrame never see this request at all). This
directly undermines the isolation §3a claims docId sessions provide. **Fix:** either mint a
per-docId, unguessable capability token that must appear in the `ascdesktop://` request path/query
(not derivable from the docId alone, and rotated per-session) so a frame that only knows its own
docId cannot address another's folder, or accept that document media confidentiality between
simultaneously-open documents is not enforced by this scheme and say so explicitly as a residual risk.

R2-3 accepted — §5 at the sleep deadline a tab with a failed save writes a recovery copy through main, then sleeps; waking restores from it. — **Blocker. `incomplete: R1-5`.** R1-5 (accepted) said the sleep policy needs a way out for a
tab stuck on a permanently-failing save, "rather than gating sleep on 'no unsaved change' with no
timeout on the failure itself." §5's revision cites R1-5 as handled but reproduces the exact gate
criticized, unchanged: "a tab not shown for 20 minutes, with **no unsaved change and no failed
save** (review 1, R1-5), unmounts its editor" (design doc, §5). A document whose autosave keeps
returning `conflict` (the exact case R1-2/R1-4 create) still never sleeps under this wording — its
~300 MB–1 GB Euro-Office instance (investigation, PSS-corrected memory table) stays resident
indefinitely, which is precisely what R1-5 said defeats R8's whole memory rationale. Citing the row
number does not resolve the finding when the rule text is identical. **Fix:** add the timeout R1-5
asked for — e.g. a tab whose save has been failing for N minutes sleeps (or warns-and-offers-to-close)
the same as an idle clean one, independent of the unsaved-change flag.

R2-4 accepted — §4a reload = remount the frame on the fresh file; scroll/caret restore is best-effort via the bridge, measured in the spike. — **Major.** §4a's user-facing promise — "an unmodified document reloads in place (keeping its
tab and scroll)" — doesn't match how euro-office-lite actually switches/reloads a document. There is
no in-place content-swap path in `bridge.js`: every document-open/reopen operation I could find
(`LocalFileOpen`, the note-separator reopen, crash recovery) goes through `_forceReload()`
(`bridge.js:752-764`), which tears down every iframe in the page and calls a bare
`window.location.reload()` — a full navigation of the editor origin, not an in-place update. Per the
investigation's own timing table this is not instant (1.6 s for a Word file, up to 8.9 s for the 21 MB
workbook) and a full reload does not preserve scroll/caret state by itself — the design only wires
scroll/caret restore for the SLEEP/WAKE path ("the bridge reports and restores the caret/scroll on
wake", §5), never for the external-change reload path in §4a. Whatever docId association the reloaded
page needs to re-request also has to survive that navigation, which §4a doesn't address. **Fix:**
either state that an external-change reload shows the same brief "Opening" loading state a fresh
open does (dropping the "in place" framing), or explicitly extend the sleep/wake scroll-restore
mechanism to cover this path too, and say how the reloaded page re-learns its docId.

R2-5 accepted — §4a an asleep tab simply opens the newest file on wake; if it holds a recovery copy, waking shows the conflict choice. — **Major.** The interaction between §4a's file watcher and §5's sleep is unspecified. §4a's
conflict UX ("keep mine / use the file on disk") and the "autosave pauses … until answered" behavior
both assume a live, mounted editor to show the choice in. A tab that's asleep (§5: unmounted after 20
idle minutes) has no editor to show anything in when its file changes on disk. Does the watched-file
list drop sleeping tabs (silently losing the conflict-detection property while asleep, so a mid-sleep
external edit is invisibly clobbered on next autosave or invisibly discarded on wake), or does main
queue the decision for when the tab wakes (in which case wake needs a new "this changed while you were
away" state the design never describes)? **Fix:** state explicitly what happens to watch/conflict
state for a document whose tab is asleep.

R2-6 accepted — §3 office:// responses carry a CSP with no network egress; external links open through the app's window-open handler. — **Major.** Nothing in §3/§3a restricts what a compromised editor page can reach over the open
internet. The `office://` protocol's privilege set includes `supportFetchAPI` and the sandboxed iframe
(`allow-scripts allow-same-origin allow-forms allow-downloads allow-modals`, `EditorFrame.tsx:102`)
does not block outbound network requests — sandboxing a frame restricts navigation/popups/pointer-lock,
not fetch/XHR/WebSocket reachability. Given the add-on is a large third-party document-parsing/editing
engine handling untrusted files (the exact class of software with a real history of exploit-via-malicious-document
bugs), and the design's own investigation already found real defects in the borrowed package, a
compromised editor instance could `fetch()` the open document's bytes (or anything else reachable from
that renderer process) straight out to an attacker's server, with no CSP or egress restriction
mentioned anywhere in §3, §3a, or §6. R1-9's privilege-set discussion is about Electron's `secure`/
`standard`/`stream` protocol registration flags, which are unrelated to a page's own
Content-Security-Policy. **Fix:** specify a `connect-src`/`img-src`/`default-src` CSP for the content
served at `office://app` (e.g. `connect-src 'self' ascdesktop:`) that blocks arbitrary outbound
requests from the editor origin, and confirm Euro-Office's own telemetry/update-check calls (if any)
are stripped or allow-listed explicitly rather than left open by omission.

R2-7 accepted — §3a main re-checks the command allow-list and that the docToken belongs to the sending window, independently of the renderer. — **Major.** §3a states the command allow-list is "a const shared by main and the renderer" but
never says whether **main** independently re-checks it (and docId ownership) on the `office:invoke`
IPC handler, or relies on EditorFrame's renderer-side `origin`/`source`/allow-list check as the only
gate. That check lives in first-party renderer JS (`EditorFrame.tsx`'s `onMessage` handler) — code
that shares a JS realm with the rest of the app's renderer, including any future XSS in an unrelated
surface (chat markdown rendering, a marketplace card, etc.), since `window.claude.office` is exposed
to the WHOLE renderer via contextBridge, not scoped to the office iframe. Electron's standard security
model treats the renderer as compromise-recoverable specifically so main independently validates IPC
arguments rather than trusting the renderer's own gate (the same reasoning `write-authorization.ts`
already applies to `artifacts:save`, re-resolving and re-checking paths in main rather than trusting
what the renderer sends). **Fix:** state explicitly that `office/commands.ts` re-validates `cmd`
against the shared allow-list and that `docId` resolves to a session main itself created, independent
of anything the renderer-side check already did.

R2-8 accepted — §3a ArrayBuffers end to end; the spike measures relay cost with the 21 MB workbook, budget 300 ms. — **Minor.** §3a's "no base64 inflation on our side; the relay base64-encodes only where
bridge.js expects a string" undersells the cost it still introduces on exactly the large-file path the
investigation spent a whole section optimizing. `bridge.js`'s own call sites expect base64:
`open_file` resolves to `b64data` consumed by `_loadEditorBin` (`bridge.js:1908-1910`), and
`write_editor_bin`/save paths similarly encode/decode base64. Even with a zero-copy `ArrayBuffer`
transfer from main to the relay, the relay must still base64-encode/decode that buffer inside the
iframe's own thread before handing it to `bridge.js` — for the 21 MB workbook case that's a
multi-ten-MB string operation on top of the native-x2t win the design otherwise banks on (investigation,
"native translator comparison" table). The design doesn't budget this cost or say whether the encode
uses a chunked/async approach (e.g. `Blob`+`FileReader`) instead of a synchronous loop. **Fix:** name
the encoding approach and note its cost in §3a or §9's risk list, since it sits on the same hot path
the rest of the design was built to speed up.

R2-9 accepted — §2 the spike gate is stated as a pass/fail list, framed + relay included. — **Minor. `incomplete: R1-3`.** R1-3 asked the spike's stated pass condition to explicitly
require "the real cross-origin transport" — not just fidelity — to succeed. §2's revision lists pass
items (a)-(d) and then separately notes "The spike runs the editor top-level in its own window first
(`scratch/spike/app/`), then framed from a second origin with the §3a relay" — but doesn't say that
items (a)-(d) must ALL be re-demonstrated in the framed-with-relay configuration to count as a pass,
only that the spike "runs" both configurations. Given R1-1/R1-3's whole point was that the cross-origin
relay is the actually-unproven part, leaving its success criteria as a procedural aside rather than a
listed gate risks the same ambiguity R1-3 flagged: a spike that passes top-level (which
`scratch/spike/app/main.cjs` already demonstrates working, single-window, no relay at all) could be
read as satisfying task 0 even if the framed+relay run never gets attempted or fails silently.
**Fix:** state plainly that (a)-(d) must pass in the framed, relay-mediated configuration specifically,
not just the top-level one.

R2-10 accepted — §3 200 MB cap with its reason. — **Minor. `incomplete: R1-7`.** R1-7 asked the design to say explicitly whether the office
size cap reuses the existing `READ_BINARY_MAX_BYTES` constant (50 MB, `editable-path-policy.ts:151`,
whose own comment calls it "the limit that actually governs images, PDFs and Office docs" today) or
defines a separate one, "and why." §3 now gives a number — "Files over 200 MB are refused" — but never
says why it's 4x the existing constant, nor whether office saves therefore need a distinct code path
from the write boundary `READ_BINARY_MAX_BYTES` currently governs (which would itself be a
cross-cutting change worth flagging under "Check cross-cutting consequences" per CLAUDE.md). **Fix:**
add one sentence: office files get their own cap because typical spreadsheets/decks legitimately
exceed 50 MB (the trial's own 21 MB workbook already comes close), and name where in the code the
existing constant's write-boundary check needs a size-cap override for office paths specifically.
