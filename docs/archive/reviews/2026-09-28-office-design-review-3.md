---
status: shipped
feature: office
review-round: 3
design: docs/archive/specs/2026-09-28-office-build-design.md
---

# Office — build design, review 3

R3-1 accepted — §1, §3, §3a, §5 say office://<docToken>; office-store threads each document's origin into EditorFrame. — **Blocker. `incomplete: R2-1, R2-2`.** The per-document-origin fix that resolved R2-1/R2-2
(each editor now loads from `office://<docToken>/editor.html`, "so every open document is its own
origin", §3a) was never threaded through the design's own description of the postMessage gate that
the whole RPC relay depends on — and that description still names the OLD fixed origin, in two
places written or touched in this same revision. §3a's own diagram, two paragraphs above the
per-document-origin bullet, reads: "`YouCoded EditorFrame (checks origin === office://app, source
=== this frame, cmd ∈ allow-list)`". §5 repeats it: "message origin checks stay (origin ===
`office://app`, source === frame)." §1's Shape diagram still labels the add-on's editor page
`office://app/editor.html`, and its own prose says YouCoded "serves it at `office://app/`" — none of
these three spots were updated when §3a introduced `office://<docToken>/`. Taken literally, this is
self-contradicting within §3a alone: a real editor instance never runs at `office://app` (only at its
own `office://<docToken>`), so a check that requires `origin === office://app` would reject every
legitimate RPC message from every real document, breaking the bytes-in/bytes-out transport that R1-1
exists to specify and R2-1/R2-2 depend on. The underlying code already supports the correct fix
without new work — `EditorFrame.tsx:40,55,72` already takes `origin` as a per-instance prop and checks
`e.origin !== origin` dynamically, not a hardcoded literal — so a builder who follows the existing
component pattern (pass the real per-document origin in) gets it right by construction; a builder who
follows the design's own prose literally does not. **Fix:** in §1, §3, §3a and §5, replace every
"`office://app`" reference to the editor's own address with "`office://<docToken>` (per document)",
and say explicitly that `office-store` (not yet built) is responsible for constructing and passing
that per-document origin into `EditorFrame`'s `origin` prop when it opens a document — matching what
the component already does, so the postMessage origin check actually matches a real running editor.

R3-2 accepted — §3 names OFFICE_MAX_BYTES (shared/office-types.ts, 200 MB) on office-files' own reader; 50–200 MB files show the viewer's existing too-large-to-preview state with Edit / Open in Office still offered. — **Minor. `incomplete: R2-10`.** R2-10 asked the design to "name where in the code the existing
constant's write-boundary check needs a size-cap override for office paths specifically." §3's current
text gives the reasoning for 200 MB (memory multiplication, laptop swap point) and repeats "the
viewers' 50 MB preview cap is a different limit for a different path," but still never names the code
location, and the claim that Office's open/save reuses "the existing artifacts write boundary
(`write-authorization.ts`, same rules as `artifacts:save`)" (§3, `office-files.ts` bullet) doesn't
actually answer it: I read `desktop/src/main/artifacts/write-authorization.ts` and it contains no size
logic at all (it's purely path/confirm-tier authorization — `.git`, credentials, confirm-tier paths).
The 50 MB figure the design keeps distinguishing itself from lives entirely elsewhere:
`READ_BINARY_MAX_BYTES` in `shared/artifacts/editable-path-policy.ts`, consumed only by
`desktop/src/main/artifacts/read-service.ts:541` — the artifacts *read/preview* path, a different
subsystem than the write boundary the design names. So it's still genuinely unresolved whether
`office-files.ts`'s open path reuses `read-service.ts` (in which case it's still capped at 50 MB today,
contradicting the stated 200 MB limit) or bypasses it entirely with its own raw read — and, if the
latter, whether a file between 50 MB and 200 MB can be *edited* (R21) without ever being *previewable*
first, which R15 requires ("Opening an Office file in the file viewer shows an instant preview first;
editing starts only after you press Edit") for every Office file, not just ones under 50 MB. **Fix:**
add one sentence naming the actual code path office-files.ts's open/save will use for its byte-size
check (a new, separate check, since `write-authorization.ts` has none to override), and say whether
files between 50 MB and 200 MB get a real preview in the file viewer or a distinct "too large to
preview, but you can still open it in Office" state.

No further findings. The other round-2 fixes hold up under scrutiny: per-document `office://<docToken>`
origins are a legitimate Electron mechanism for separating `localStorage`/IndexedDB by origin (standard,
host-based custom schemes registered once via `registerSchemesAsPrivileged` apply their privileges to
every host under that scheme automatically, and Chromium partitions storage by origin without needing
`<webview>` or a `partition` attribute) — this also resolves R2-2's media-confidentiality gap as a side
effect, since a frame that never learns another document's unguessable token cannot address its media,
without needing a second capability-token mechanism. `ASC_PROTO_BASE` (`bridge.js:254`) is assigned once
and read by every other call site (944, 947, 1235, 2058, 2143, 2148, 2443), so overriding it really is a
one-line patch, now needing to read the frame's own `location.host` (the docToken) rather than a
platform check — the design's "one line" claim is accurate. The CSP fix (§3, "every response carries a
CSP") does cover workers and same-scheme nested frames: because `office-protocol.ts` attaches the header
to every response it serves — not just the top-level HTML via a `<meta>` tag — a worker script fetched
through the same protocol inherits its own matching CSP, and any nested frame or `blob:` document created
from an `office://` page inherits the creating document's CSP per spec. The sleep/wake, external-change-
reload, and asleep-tab-conflict fixes (R2-3, R2-4, R2-5) each state an explicit, checkable rule now,
closing the ambiguities review 2 raised without reopening them.
