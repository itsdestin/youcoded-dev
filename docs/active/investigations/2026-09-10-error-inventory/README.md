---
status: active
date: 2026-09-10
topic: Every user-visible failure in the app, re-audited against today's code — the evidence for unit B
---

# Error inventory, 2026-09-10 — start here for unit B

Five read-only reviewers audited today's code (`youcoded` at `a89b2cd9`), each tracing the
screen's call into the handler behind it. This **supersedes the line numbers and verdicts**
in `../2026-09-08-error-states-development-audit.md`: at least one of its findings (the
remote-shim timeout replay) was already fixed by `5b401d84`, and most cited lines have moved.

| Report | Scope | Sev 1 | Sev 2 | Sev 3 |
|---|---|---|---|---|
| `inventory-1-chat.md` | chat, sessions, composer, model picker, crash boundaries | 7 | 12 | 15 |
| `inventory-2-settings.md` | every Settings screen, backup & sync, updates, accounts | 2 | 15 | 31 |
| `inventory-3-marketplace.md` | marketplace, library, skills, tags, games, buddy | 4 | 18 | 13 |
| `inventory-4-projects.md` | projects, file viewers and editor, git review, menus | 3 | 12 | 21 |
| `inventory-5-backend.md` | preload, main handlers, remote server/shim, Android | 2 | 10 | 5 |

Severity: **1** tells the user something false about their data or work · **2** hides a
failure or dead-ends a task · **3** raw, vague or inconsistent only. ~170 rows; a handful
appear in two reports (noted below), so about 165 distinct problems.

## The seventeen that state something false

Severity 1 after de-duplication, plus the update-download row promoted from severity 2
because its label is false and it disables the recovery.

| # | What the user is told | Where | Report |
|---|---|---|---|
| 1 | Backup warning **Retry** says "Uploaded!" when the upload failed | `SyncPanel.tsx` `retry` fix-action | 2 |
| 2 | Adding a backup says "You're all set!" when nothing was saved | `SyncPanel.tsx` `onComplete` + `SyncSetupWizard.tsx` | 2, 5 |
| 3 | Approval card: "Permission request expired — socket closed…" when the answer may have arrived | `ToolCard.tsx` → `chat-reducer.ts` `PERMISSION_EXPIRED` | 1 |
| 4 | Same, in the buddy's compact tool strip | `buddy/CompactToolStrip.tsx` | 3 |
| 5 | "The message could not be sent" when, over remote, it may have sent | `InputBar.tsx` native send | 1 |
| 6 | Terminal touch box: Enter while disconnected deletes the typed text | `InputBar.tsx` minimal Enter path | 1 |
| 7 | "Copied to clipboard" whether or not it copied | `slash-command-dispatcher.ts` | 1 |
| 8 | "The file wasn't found in this project" for any failure at all | `hooks/useOpenFilepath.ts` | 1, 4 |
| 9 | "You have not set up any model providers" when loading them failed | `model/ModelPicker.tsx` | 1 |
| 10 | "No skills installed yet" when loading them failed (no retry until restart) | `state/skill-context.tsx` | 1, 3 |
| 11 | A file save can skip its "changed on disk" check, silently overwriting a newer edit | `artifact-views/ActiveArtifactView.tsx` + `write-authorization.ts` | 4 |
| 12 | Close prompt shows no note when loading failed; typing replaces the hidden note | `CloseSessionPrompt.tsx` + `ipc-handlers.ts` get-meta | 4 |
| 13 | Phone: a file it can't read is shown as "no longer on disk" | `SessionService.kt` artifact read | 5 |
| 14 | "Failed to install" for uninstall and update failures — and for installs that worked but whose refresh failed | `InstallingFooterStrip.tsx` + `marketplace-context.tsx` | 3 |
| 15 | Library: "Nothing installed yet" while loading or after a failed load | `library/LibraryScreen.tsx` | 3 |
| 16 | Tag manager: "No tags yet" when reading tags failed | `tags/TagManagerPopup.tsx` + `ipc-handlers.ts` tags:list | 3 |
| 17 | Update download failure reads "Launch failed" with Retry disabled | `UpdatePanel.tsx` code parsing | 2 |

### Batch 1 status — all seventeen fixed on `session/error-states-unit-b` (2026-09-11)

Each fix landed test-first: a test written against the old code, seen failing for the real
reason, then green. Not merged. A fresh code review found nine gaps in these fixes
(`docs/active/reviews/2026-09-11-error-states-batch-1-code-review.md`); all nine are fixed the
same way, listed under the table.

| # | Commit (youcoded) | Also fixed while there |
|---|---|---|
| 1, 2 | `7809ff46` | "Backups happen automatically every 15 minutes" was false too (hourly poll); a paused new destination was reported as syncing; `force()` blamed the new destination for an old one's failure |
| 3, 4 | `352c2bd7` | the compact strip left its buttons disabled forever after a rejection; the expiry text lost "socket" jargon |
| 5 | `d83ce662` | a host-confirmed failure with an unknown reason no longer guesses "no response" |
| 6 | `7a950efd` | — |
| 7 | `73d3bf35` | on an http remote browser `/copy` threw before any toast; it now uses the execCommand fallback |
| 8 | `1abb381d` | none of the four "wasn't found" branches checked the disk; each now says only what it knows |
| 9 | `69cd411d` | — |
| 10 | `cdca34b8` | — |
| 11 | `53884535` | a save with no token now reads the file first rather than writing blind |
| 12 | `008eedb4` | both hosts answered blanks for a missing store; `session:get-meta` now carries `unreadable` |
| 13 | `3f66cd72` | a SecurityException on that read would have crashed the whole bridge handler (Android unit tests: 41 pass, 0 skipped) |
| 14 | `db19d5b6` | install/update/uninstall RESOLVED their failures unread — failed installs posted telemetry and a failed theme install was starred |
| 15 | `1797c8f3` | — |
| 16 | `09f0b6d7` | main and remote-server both swallowed the read; a failed REFRESH also wiped tags already on screen |
| 17 | `7149d657` | busy / url-rejected download failures were also labelled "Launch failed"; `stripInvokeWrapper` now shared with `plainMessage` |

**Code review fixes (2026-09-11), youcoded:** F2/F3 `0e2700c6` (a real download failure still
read "Launch failed" — the test's error text had been wrong) · F4 `1f90c83e` (Library Themes) ·
F7 `9641c54d` (a backup that never started) · F8 `47a40975` · F9 `bde913e0` · F1 `20cca05e`
(the in-session tags chip and the drawer's preview sheet now lock on an unreadable note) · F5
`9981cf60` (tag picker, Resume Browser tag filter) · F6 `58d3048b` (Android, file over the size
cap). Review-deck switches: `5dee518f` (`?fail=`, `?update=available`).

**Left for later batches, found during batch 1:**
- The phone's `tags:list` still answers `[]` on purpose (tagging UI deferred on Android), so the tag manager can still say "No tags yet" on a phone — batch 2 (Android).
- Nothing listens for remote-shim's `OUTCOME_UNKNOWN_EVENT`, so "couldn't confirm" is never followed up with "it went through after all" — batch 2.
- The rarer permission rows (full-auto stop, always-allow confirm) got the same note but no test of their own.

## The seven repeated mistakes

Almost every row is one of these, which is why fixing by pattern beats fixing by screen:

1. **Success shown without reading the answer** — the handler returned failure, the screen never looked (rows 1, 2, 7, 14; preferences save; theme/skill install).
2. **"Couldn't load" rendered as "you have none"** — `.catch(() => [])` and friends (~40 sites).
3. **An action the user took fails with no message** — `catch {}` on a button's handler (~45 sites).
4. **Raw technical text** — `preload.ts` makes 343 bare `ipcRenderer.invoke` calls and only 4 strip Electron's "Error invoking remote method…" wrapper; also Node's "fetch failed" (`handler-utils.ts`) and the phone's "HTTP 409" (`MarketplaceApiClient.kt`).
5. **"Might have worked" shown as "failed"** — remote timeouts on permission answers and sends; `remote-shim.ts` dispatches `OUTCOME_UNKNOWN_EVENT` and **nothing listens**.
6. **Crashes that vanish** — worker exit and kill signal reported as code 0 (an idle crashed tab just disappears); phone session exit never reported; one unguarded phone request crashes the app; phone startup can wait forever; a throwing remote-server handler leaves the browser silent for 30 s.
7. **Report / Diagnose built by hand** — every call site duplicates the wiring, none attaches the error, and Remote access wires both buttons to one handler (Diagnose never diagnoses).

## Not covered

- `App.tsx` (29 catch sites) only partly, via the reports that follow its toasts; `index.tsx`,
  `voice-capture.ts`, `utils/sounds.ts` not at all.
- The marketplace **Worker**'s own messages (`wecoded-marketplace`) — not audited.
- Android beyond the leads listed in report 5; Windows exit-code semantics.
- Nothing was run. Every finding is a source reading; each fix starts with a test that fails on today's code.
