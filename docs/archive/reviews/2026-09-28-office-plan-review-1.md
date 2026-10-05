# Office build plan — review 1

## P1-1 Task 4 ports COMMANDS from the wrong spike file
**Severity:** major
**Where:** plan Task 4, Step 4 ("Implement `office-commands.ts`")
**Problem:** Step 4 says "Port `COMMANDS` from the spike `main.cjs`". But
`docs/archive/prototypes/2026-09-28-office-spike/main.cjs` is the SINGLE-document,
top-level spike (part a): it keeps one module-level `state.current` and one shared
`TEMP` directory (`main.cjs:19,31,75`) with no session/token concept at all — its
`COMMANDS` object closes over globals, e.g. `open_file({path:p}) { ... const out =
path.join(TEMP, 'Editor.bin'); ...}` (`main.cjs:73-83`).
The per-document, per-token session model Task 3/4 actually need — a `commands(s)`
factory that closes over `s.path`/`s.temp`/`s.token`, checks `s.sender !== e.sender.id`,
and keeps completely separate `Editor.bin`/media per open document — exists only in
`main2.cjs` ("the framed version", `main2.cjs:49-70`, `main2.cjs:72-77`), the file this
review's brief explicitly identifies as the one the plan is supposed to port. An
implementer following Step 4's literal instruction would copy single-document logic
incompatible with multiple simultaneous tabs (contract R7) and with Task 3's
`createSessions`/token design that the rest of Task 4's own bullets correctly describe.
**Fix:** Change Step 4's file reference from `main.cjs` to `main2.cjs`, and note that
`main.cjs`'s `COMMANDS` is the wrong shape (single global session) to port from at all.
**Triage:** accepted — Task 4 Step 4 now ports main2.cjs:49 commands(s).

## P1-2 No main-process serialization for save; the only coalescing test can't catch a real race
**Severity:** major
**Where:** plan Task 4 Step 4 (`office-commands.ts`); Task 6 Step 1 test 9 and Step 2
**Problem:** Design §3 assigns this safety property to main: "One save in flight per
document; a save requested meanwhile coalesces into one follow-up save with the newest
bytes" (`docs/archive/specs/2026-09-28-office-build-design.md` §3, office-files.ts bullet).
The plan's Task 4 Step 4 `save_file`/`save_changes`/`write_editor_bin` implementation has
no single-flight guard at all — two concurrenct IPC calls for the same token would both
read/translate/rename `Editor.bin` independently, with `write_editor_bin`'s plain
`fsp.writeFile` able to race a `save_file` that is mid-read of the same file. The plan
instead puts all coalescing logic in the renderer (`EditorFrame.tsx`, Task 6 Step 2:
"A change during a save marks unsaved again and triggers exactly ONE follow-up save"),
and the only test for this behavior (Task 6 Step 1, test 9) is a jsdom test against a
**mocked** bridge — it exercises EditorFrame's own bookkeeping, not `office-commands.ts`,
so it would stay green even if the real main-process handler allowed two concurrent
`save_file`/`write_editor_bin` calls to race. This codebase already has an established
main-process idiom for exactly this class of problem (`sharedInFlight` Map in
`src/main/artifacts/artifact-store.ts:75`, "Single-job invariant" in
`src/main/update-installer.ts:214`), which office-commands.ts doesn't use.
**Fix:** Add a per-token in-flight guard in `office-commands.ts` (e.g. a
`Map<token, Promise>` single-flight around `save_file`/`save_changes`, queuing/coalescing
a call that arrives while one is running) and a test that calls `save_file` twice
concurrently on a real session and asserts only one x2t translation ran / the file ends
consistent.
**Triage:** accepted — per-session command queue in main, save collapsing, real-x2t race test (Task 4 tests 7).

## P1-3 `write_editor_bin` has no `OFFICE_MAX_BYTES` check
**Severity:** major
**Where:** plan Task 4 Step 4 ("`write_editor_bin` stores `Buffer.from(data, 'base64')`
as `temp/Editor.bin`")
**Problem:** Task 4's size check ("Size check before translating: `stat.size >
OFFICE_MAX_BYTES`") is described only for the read/open path (Step 3 test 3, Step 4's
"Authorization" bullet), matching design's own wording ("enforced by office-files' own
**reader**"). But the same design paragraph justifies the 200 MB limit by memory
pressure from the translated form plus the editor's in-memory model ("the 21 MB workbook
used ~1 GB") — a risk that exists just as much on save, when `write_editor_bin` decodes
an arbitrary-length base64 string from the editor into a `Buffer` and writes it
unconditionally, then `save_file` translates it with x2t. A malformed or runaway editor
state (or simply a document that grew large mid-session by pasting large media) hits no
size guard at all on the write path, unlike the stated protection on open.
**Fix:** Apply the `OFFICE_MAX_BYTES` check to the decoded buffer in `write_editor_bin`
too (refuse with the same "This file is larger than 200 MB…" message), and add a test.
**Triage:** accepted — EDITOR_BIN_MAX_BYTES (1 GB decoded; Editor.bin runs ~5x the file) checked before decoding, test 8.

## P1-4 Files list gives the wrong directory for remote-shim.ts / remote-unsupported.ts
**Severity:** minor
**Where:** plan Task 5, Files section ("Modify: ... `src/main/remote-shim.ts` /
`remote-unsupported.ts`")
**Problem:** Both files actually live under `src/renderer/`, not `src/main/`:
confirmed with `find . -iname remote-shim.ts` / `remote-unsupported.ts` →
`./src/renderer/remote-shim.ts`, `./src/renderer/remote-unsupported.ts`. `remote-shim.ts`
is loaded only via dynamic `import()` on the remote/browser path (its own top comment:
"Deliberately its own module with NO imports... pulling these constants directly from it
would drag the whole shim into the main bundle"). Step 4's body text just says
"`remote-shim.ts`" / "`remote-unsupported.ts`" without a path, so the wrong prefix is
confined to the Files list header, but a zero-context implementer skimming that header
first would look in `src/main/`.
**Fix:** Correct the Files list to `src/renderer/remote-shim.ts` /
`src/renderer/remote-unsupported.ts`.
**Triage:** accepted — paths corrected to src/renderer/.

## P1-5 The scheme-privilege minimality experiment can never change what's shipped
**Severity:** minor
**Where:** plan Task 3 Step 5; Task 6 Step 6 point 4
**Problem:** Design review 1's R1-9 asks for "the minimum [privileges] the spike
proves necessary" for the `office` scheme, explicitly naming `corsEnabled`/`stream` as
candidates to drop if unneeded (design §3: "add `stream` only if media playback needs
it"). The plan's Task 3 Step 5 already commits code with the FULL permissive set
(`standard, secure, supportFetchAPI, corsEnabled, stream`) and, in the same step, writes
a test that "pins this exact privilege set" — before the actual minimality experiment
runs. That experiment is deferred to Task 6 Step 6 point 4 ("Try dropping `corsEnabled`,
then `stream` ... and record the result"), but nothing in Task 6 instructs updating
`office-protocol.ts` or the Task 3 pinning test based on that experiment's outcome. As
written, the experiment's result is only ever "recorded" — the shipped scheme keeps the
full set regardless of what Task 6 finds, so R1-9 can never actually narrow anything.
**Fix:** Either run the minimality experiment before Task 3 Step 5's pinning test is
written, or make Task 6 Step 6 point 4 explicitly say to update `office-protocol.ts`'s
privileges and the Task 3 pin if `corsEnabled`/`stream` prove unnecessary.
**Triage:** accepted — Task 6 Step 6 ships the smallest passing set and updates the pin test and WHY.

## P1-6 Version history keys on `s.path` without specifying canonicalization
**Severity:** moderate
**Where:** plan Task 4 Step 4 (authorization); Task 7 (`versionsDir`/`snapshot`/`list`/`restore`)
**Problem:** Task 7's `versionsDir(userData, filePath)` buckets a file's version
history by `sha1(canonical path)`. Task 4 Step 4's authorization call —
`authorizeArtifactWrite({ projectRoot: path.dirname(s.path), fullPath: s.path,
mustStayInRoot: false })` — resolves and returns a `realPath` internally
(`write-authorization.ts`'s `authorizeArtifactWrite` calls `fs.promises.realpath` and
returns `{ok:true, realPath}`), but the plan never says to replace `s.path` (or the path
passed to `versions.ts`) with that resolved `realPath`. If the raw, un-canonicalized path
the user/dialog supplied differs from its `realpath` (a symlink, or case difference on a
case-insensitive filesystem), `open`/`snapshot`/`restore`/`list` calls that differ only in
that respect would silently land in different `sha1` buckets — the Versions dialog could
show an empty or wrong history for a file that does have kept versions.
**Fix:** Have Task 4's `open_file`/session creation store the `WriteResolution.realPath`
(or an equivalent realpath'd form) as `s.path`, and have Task 7 hash that same canonical
form consistently across snapshot/list/restore. Add a test opening the same file via two
different (but equivalent) path strings and asserting the version history is shared.
**Triage:** accepted — session.path is authorizeArtifactWrite realPath; symlink test in Task 5.

## P1-7 Workbench x2t path left ambiguous, risking a review deck that doesn't match production behavior
**Severity:** minor
**Where:** plan Task 6, Step 4 ("Workbench fake host")
**Problem:** The step says the workbench server runs x2t "via `convert()` compiled from
Task 4, or its own copy of the XML" — an explicit either/or left to the implementer.
Task 6 Step 5 then reshoots the Office screens with this same server and has Destin
review those screenshots (via the try-it/approve deck in Task 10). If the workbench ends
up with its own hand-rolled XML/job-temp logic instead of reusing Task 4's `convert()`,
the screenshots Destin approves could reflect different translation behavior (job-temp
handling, error surfacing) than what actually ships in `office-commands.ts`, silently
undermining "reviewed pictures reflect the real editor with real content" (the step's own
stated WHY).
**Fix:** Make Step 4 require reusing Task 4's `convert()` directly (import it), not an
independent copy, so the reviewed screenshots are provably the shipped code path.
**Triage:** accepted — workbench server imports the compiled convert().
