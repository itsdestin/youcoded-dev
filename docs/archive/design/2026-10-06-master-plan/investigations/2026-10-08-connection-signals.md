---
status: draft
date: 2026-10-08
type: investigation
topic: master-plan
---
# Connection signals between app files

Tool: `scripts/command-center/derive-edges.mjs` (about 25 seconds). Output: `scratch/command-center/edges.json`. Only the desktop app's files were scanned (2,487 code files incl. tests).

## Edge counts

| Kind | Edges |
|---|---|
| import | 4,261 |
| test | 2,691 |
| channel (screen asks, backend answers) | 624 |
| android-channel | 896 |
| event | 233 |
| cochange (3+ shared commits) | 2,212 |
| doc | 785 |

## Channels (named requests between screen and backend)

- 494 channel names exist in the backend contract.
- 401 resolved to both a screen caller and a backend handler.
- 47 have a handler but no screen caller found; 39 have a caller but no handler found; 7 have neither. Total unresolved: 93.
- Examples with no screen caller: `clipboard:save-image`, `shell:open-path`, `first-run:start-auth`, `window:set-icon`, `buddy:get-status`. Many of these are called through paths this tool cannot see (the window shell, the buddy window, or main-to-main messages).
- Examples with no handler found: `handoff:wait`, `transcript:event`, `specialists:event`, `voice:event`. These are pushes from the backend to the screen, sent through helper code that does not name the channel on the same line.
- Android uses the SAME channel names as strings. 374 of the 494 channels appear in Kotlin files, so Android edges are real and exact.
- How it works: the contract lists names; `preload.ts` links a screen-side call such as `claude.tags.list` to a name; the tool matches those calls in screen files, and matches `IPC.NAME` or the quoted name next to handle/on/send/defineChannel in backend files.

## Events (announce and listen by name)

There is no single pattern. The code uses three:
1. Backend object events (`emit('name')` / `on('name')`): 32 names matched emitter to listener within the same process.
2. Window custom events (`youcoded:...` names, held in constants): 24 names matched.
3. State actions (`dispatch({ type: 'X' })` and `case 'X'` in the chat state files): 81 names matched.
Generic names like `data`, `close`, `error` and browser events like `click` are ignored. Events that cross between backend and screen go through channels, not here.

## Hidden coupling (edited together, no import between them)

The 40 strongest no-import pairs are dominated by one theme: the "same feature written in several places" files. Top ten:
1. `main/preload.ts` and `renderer/remote-shim.ts` — 147 commits (e.g. "feat(voice): add local custom vocabulary recognition hints").
2. `main/ipc-handlers.ts` and `main/preload.ts` — 111 ("feat(pages): live socket platform...").
3. `main/ipc-handlers.ts` and `renderer/remote-shim.ts` — 108 ("fix(host,phone): review fixes for R5-4b...").
4. `main/remote-server.ts` and `renderer/remote-shim.ts` — 101 ("fix(phone): a reconnecting phone no longer shows live sessions as 'initializing'...").
5. `main/preload.ts` and `main/remote-server.ts` — 82 ("feat(pages): camera video played by the app").
6. `main/preload.ts` and `renderer/dev/workbench/mock-shim.ts` — 61 ("Money page: Plaid bank connection...").
7. `main/preload.ts` and `renderer/hooks/useIpc.ts` — 58 ("refactor(desktop): backend contract...").
8. `renderer/hooks/useIpc.ts` and `renderer/remote-shim.ts` — 57.
9. `renderer/dev/workbench/mock-shim.ts` and `renderer/remote-shim.ts` — 53.
10. `main/ipc-handlers.ts` and `renderer/App.tsx` — 53 ("fix(live-facts): review fixes...").
Meaning: adding one backend feature still means touching the desktop bridge, the phone bridge, the test stand-in and the main handler file. The `App.tsx` / `chat-reducer.ts` pair (51) is the same kind of hidden tie inside the screen.
Method: commits since 2026-06-01 on `origin/master`: 4,658 total; 1,779 touched 2 to 30 source files and were counted; 12 touched more than 30 (bulk moves) and were skipped; the rest touched fewer than 2.

## Docs citing code

- 214 documents scanned (docs/active, roadmap, MAP, rules); 114 cite app paths.
- 871 distinct citations (per document); 77 point at folders, 785 at files that exist.
- 9 are stale (path no longer exists): `desktop/src/preload/` (native-mcp-phase-2), three in `plans/2026-07-31-permission-ask-timeout.md` (`ink-select-parser.ts`, an `__tests__` folder, a test file), `main/wallpaper-reader.ts` (floating-glass spec), `main/codex/` and `main/codex/codex-export.ts` (codex spec), `main/buddy` (buddy-floater rule) and `renderer/components/Specialists` (native-specialists rule). Some are plans describing files that were later renamed or never built, so each needs a human glance.

## Limits

- Channel callers are found by name matching, not by running the app; calls built from variables are missed.
- Cochange measures history, so renamed files lose their past.
- Android Kotlin files are linked only through channel names, not imports.
