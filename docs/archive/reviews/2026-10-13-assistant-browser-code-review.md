# Assistant Browser — code review (fresh reviewer)

Branch `session/browser-automation-20261013` (youcoded) against `origin/master`. No source edited, nothing committed.

## verify.sh summary

`bash scripts/verify.sh <worktree>` run once (full suite, because desktop/package.json changed):

```
PASS  types (tsgo --noEmit)
FAIL  types in tests/  — tests/assistant-browser-native.test.ts(88,45)(88,50)(88,56)(88,62)(89,22)(89,28)(90,23): TS7006 implicit any (7 errors)
PASS  tests (full suite)   (the assistant-browser-*.test.ts files launched the installed Chrome and passed)
FAIL  dead code (knip)     — knip exports: 133 unused, baseline allows 132 (this branch adds one)
PASS  lint (oxlint)
PASS  design lint
PASS  invariants (ast-grep)
```

Android: the branch's only Kotlin change is one capabilities line (`assistantBrowser: false`, MessageRouter.kt); not built here.

Severity tags below: HIGH = breaks a stated promise in normal use or security; MED = wrong behaviour a person can hit; LOW = edge, hygiene, or defence in depth.

## Findings (most severe first)

- F1 — desktop/src/main/assistant-browser/browser-tool-runners.ts:541 — HIGH: the "never open metadata/link-local" and "home-network asks first" checks only cover the MAIN frame (`ev.frameId !== mainId` → `cont()`), so any public page can embed `<iframe src="http://169.254.169.254/latest/meta-data/...">` or an iframe to the router and the browser loads it with no ask, and the assistant then reads its text — confirmed: ran `page.ariaSnapshot({mode:'ai'})` (the call `pageReport` uses) against a page with a cross-site iframe and the iframe's heading came back in the outline (`- iframe [ref=e3]: - heading "SECRET-…" [ref=f1e2]`); the code comment says only "main-frame navigations", the spec/promise 3 says "never open".
- F2 — desktop/src/main/assistant-browser/browser-service.ts:458 + browser-host.ts:76 — HIGH (PLAUSIBLE): the navigation guard is installed asynchronously AFTER a tab exists (`emit('page-adopted')` → `void installNavigationGuard`, which needs three CDP round trips), and popups are adopted only after `await page.opener()` (service.ts:466), so a popup opened with `window.open('http://169.254.169.254/…')` (or a first-load redirect) can send its Document request before `Fetch.enable` is live and then be adopted and readable by the assistant — read the call order; not reproduced (timing race).
- F3 — desktop/src/main/assistant-browser/browser-tool-runners.ts:482 — HIGH: `BrowserWait` with `text`/`textGone` computes `cap = Math.max(0, min(30000, remaining-15000))`; when 5–15 s of the call budget are left (a second call queued behind a long one, e.g. Claude Code issuing parallel calls while a prior call holds the per-chat queue) `cap` is 0, and Playwright treats `timeout: 0` as NO timeout, so the call never returns and promise 3 ("every wait returns within ~100 s") breaks — confirmed: ran `getByText('never there').first().waitFor({state:'visible', timeout:0})` on the installed Chrome; still waiting after 4 s. Same pattern at :320 (`goto` timeout `remaining-15000` can be exactly 0); the abort signal is also ignored by these waits.
- F4 — desktop/src/main/assistant-browser/browser-service.ts:324-326 — HIGH: `startMyChrome` sets `this.connected = browser` and then throws "Chrome is connected but has no open window" without closing it or clearing `connected`; every later start (including My Chrome switched OFF) sees a stale `connected`, attaches the 'disconnected' listener instead of ctx 'close' (:255), and `stop()` takes the My Chrome branch (:368) that never calls `ctx.close()`, so the assistant's own launched Chrome keeps running (until the worker is killed) while the person's Chrome connection also stays open — confirmed by reading start()/stop(); the catch in `start()` (:260) does not reset `connected`.
- F5 — desktop/src/main/assistant-browser/browser-service.ts:413-421 and browser-tool-runners.ts:511 — MED: the hand-off "window shown" override is cleared only when `BrowserAskUser` returns `done`/`cant`; if the card is withdrawn (conversation ended, tabs closed, browser stopped → 'cancelled'), or the person presses "I'm done" while no call is waiting, `windowOverride` stays `true` forever, so the panel's "Hide window" and Settings → "Show a browser window" off restart the browser and it comes back shown (`launchOwn(this.windowOverride ?? cfg.showWindow)` at :249) — confirmed by reading; the person gets a restart (losing unsent typing) and no change.
- F6 — desktop/src/renderer/components/browser/BrowserPanel.tsx (the `ErrorState` line, `onRetry={() => { void bridge().stop(); }}`) with browser-service.ts:361 — MED: Retry on a failed browser start calls `stop()`, which returns immediately when there is no context (`if (!ctx) return;`) and emits nothing, so `run` stays `'error'` and the same red error stays on screen; nothing retries until the assistant makes another call — confirmed by reading (stop() has no path that resets `run`).
- F7 — desktop/tests/assistant-browser-native.test.ts:88-90 and desktop/src/renderer/state/browser-store.ts:113 — MED: `verify.sh` fails twice on this branch: seven implicit-`any` parameters in the test's callbacks, and `primeBrowserState` is exported but only used inside its own file (knip baseline 132 → 133); CLAUDE.md says a failing check is fixed when found — ran verify.sh.
- F8 — desktop/src/main/assistant-browser/browser-tool-runners.ts:257-262 (with desktop/src/main/ipc/browser.ts ANSWERS list) — LOW: `askOutcome` treats every answer that is not 'timeout'/'cancelled'/'no' as approval, and the IPC accepts any of seven answers for any prompt kind, so e.g. `done`, `cant` or `download` sent for a final-step or home-network prompt counts as "allowed" (fail-open); the shipped card only sends the right ones — read both; a per-kind allow-list in `answerPrompt` would close it.
- F9 — desktop/src/main/assistant-browser/browser-tool-runners.ts:259-261, 248, 326 — LOW: promise 4 says page text is wrapped, but several error results put page-derived text outside `<untrusted-content>`: the declined/unanswered/withdrawn messages embed `verb` (the element's aria-label/innerText, up to 80 chars, chosen by the page), and `mapActionError`/"Couldn't open" embed Playwright's first line, which can echo element text — read `act()` building `label` from `info.name`.
- F10 — desktop/src/renderer/components/browser/browser-tool-display.ts:~38 — LOW: the chat tool card hides typed text only when the MODEL-written `element` label looks like a secret (`/pass|pin|cvv…/` on `input.element`); the runner already knows the field is a password (`info.isPassword`, tool-runners.ts:415) but the card never learns it, so a password typed into a field the model labelled "Search"/"Value" is shown in the card — read both.
- F11 — desktop/src/main/assistant-browser/browser-tool-runners.ts:133 and :352-391 — LOW (PLAUSIBLE): final-step detection reads the element's label once BEFORE the ask (which can wait up to 90 s) and prefers `aria-label` over visible text, so a hostile page can show "Buy now" under `aria-label="Next"` (button outside a form) or swap the element's text while the card is up; only the host is re-checked after the ask (:391), not the element — read; not reproduced. The spec calls this friction, not a sandbox, so this is a note.
- F12 — desktop/src/main/assistant-browser/browser-service.ts:556-568 and :578 — LOW: pages can trigger downloads on their own and every one is saved into `downloads/<chat>/` with no size cap, count cap or cleanup (`pruneShots` handles pictures only, and only once per worker start), so a hostile page can fill the disk — confirmed by reading; no pruning of `downloads` anywhere (`rg pruneShots|downloads`).
- F13 — desktop/src/renderer/components/browser/BrowserSettingsButton.tsx (Toggle `onChange` → `setShowWindow`, and the radio → `updateSettings({useMyChrome})`) — LOW: Settings restarts the browser for ALL chats with no confirmation, whereas the panel's Show/Hide asks first and names how many other chats are affected; switching to/from My Chrome closes every chat's tabs silently (`stop()` in browser-host.ts:119) — read both paths; two different behaviours for the same action.
- F14 — desktop/src/main/assistant-browser/browser-host.ts:126-133 — LOW (PLAUSIBLE): "Clear saved sign-ins" does `stop()` then deletes `profile/` with no guard against a tool call starting the browser in between (`ensureContext` has no lock against it), which would launch Chrome on a folder being removed — read.
- F15 — desktop/src/main/assistant-browser/browser-service.ts:84,110,251 (+ `lastCall` :82) — LOW: dead state: `seenGeneration`, `generation` (bumped, never read) and `lastCall` are written but nothing uses them, and the comments at :19 and :532 ("the next result can say element refs went stale", "Includes the stale-refs note…") describe behaviour `takeNotes` does not have (the note is added only in `restart()`); also `forgetBrowserSession` (browser-store.ts:75) is called only from a test, so ended chats' state is never dropped from the renderer store — `rg` repo-wide.
- F16 — .claude/rules/assistant-browser.md, browser-tool-runners.ts:27 and the CLAUDE.md rule "CC-coupled code gets an entry in docs/cc-dependencies.md" — LOW: the rule file and the runner cite `youcoded/docs/cc-dependencies.md` for the 120 s auto-background limit, but that file has no Browser entry (`rg -i "youcoded-browser|auto-background" docs/` finds nothing) and the branch does not touch it, though it adds `--mcp-config`/`--allowedTools mcp__<id>__Browser*` coupling to the Claude Code CLI — dangling reference.
- F17 — desktop/tests/assistant-browser*.test.ts — LOW (broken promises, no contract file): three stated promises have no test that exercises them — (a) "unanswered asks block the same step for 2 minutes" is tested only at the `BrowserPolicy` object level, never through `BrowserAct` with a timeout answer; (b) "every wait returns within ~100 s" is tested only as `CALL_DEADLINE_MS < 120_000` (which is why F3 slipped through); (c) "tabs close on idle / browser closes on idle" has the `sessionIdleMs`/`browserIdleMs` seams but no test uses them — `rg "sessionIdleMs|browserIdleMs" tests` is empty.
- F18 — desktop/src/renderer/components/ChatView.tsx (`browserSupported() && <BrowserAskCard/>`) with capabilities.ts:107 — LOW (PLAUSIBLE): a native or Claude Code chat the person is driving from the phone still runs browser tools on the computer and asks there; the phone shows no card (capability false), so every site/final ask sits 90 s and then is recorded as unanswered and blocked for 2 minutes with no signal to the phone user — read; matches the spec's "not on phones this release" but the assistant's result text tells it to "ask them in chat" with no hint the person cannot see the card.

Counts: HIGH 4 (F1–F4), MED 3 (F5–F7), LOW 11 (F8–F18), of which PLAUSIBLE (not reproduced): F2, F11, F14, F18.

## Checked and found sound (no finding)

- Engine placement: playwright-core is imported only by `browser-host.ts`/`browser-service.ts` (type imports elsewhere); main holds `BrowserClient` only; client kills the old worker before respawn and caps respawns. Matches promise 2.
- Both session kinds go through the same `runBrowserTool`; native adapter and relay add no behaviour; relay checks token (timingSafeEqual) and `provider === 'claude'`; socket dir 0700, config 0600, token not on argv.
- `wrapUntrusted` neutralises the closing tag case-insensitively; `registry.ts` now uses it too.
- My Chrome: `state()` and `tabs` only list owned pages; `stop()` closes only owned pages (live test asserts the person's tab survives); no fallback to the own browser on error (live test).
- All 19 `browser:*` channels are `desktopOnly`; preload/remote-shim mirror each other; Android capability line present. Frames go only to watching windows; the panel stops watching when unmounted or the window is hidden.
- Full test suite is green (including the live-Chrome files).

## Not covered

- Whole-file read of `SettingsPanel.tsx`, `ToolCard.tsx`, `App.tsx` beyond the diff hunks; `menu-icons.tsx`, workbench mock files and `browser-protocol.ts` were only skimmed.
- Android build/tests (no Kotlin logic changed).
- Performance rule check by measurement: I did not measure main-thread cost of relaying ~10 frames/s of base64 JPEG through `ipc/browser.ts` while a panel watches; by reading it is bounded (ack-paced, only watching windows).
- The real "remote debugging" toggle in the person's own Chrome (the code and tests use a stand-in Chrome; the file itself says this is unverified).
- Windows/macOS paths in discovery, version reading and the named pipe.
- Reproducing F2 (timing race) and F14; they are read-only conclusions.

## Disagreement with the approved design (one line)

Home-network and metadata protection is described as covering navigation, yet only top-level navigation is guarded (F1); the spec's "stated" limit mentions scripts and images, not iframes, which can carry readable page content.

## Triage (implementing session, 2026-10-13)

- F1 accepted — every Document request (page AND iframe) is checked before it is sent: a context-wide `route` in the assistant's own browser (`installRequestGuard`), CDP Fetch for all frames in My Chrome; live test "embedded pages are checked too" (seen red with the guard off).
- F2 accepted — the context-wide check exists before any page loads, so popups and first-load redirects are covered; a tab no conversation owns yet gets no home address. My Chrome's per-tab guard is now awaited before the tab loads anything; a My Chrome popup's first request remains a stated limit.
- F3 accepted — every wait/goto timeout is at least 1000 ms; live test "a wait never runs past the call budget".
- F4 accepted — `start()`'s catch closes and clears a half-made My Chrome connection.
- F5 accepted — the service ends the sign-in window override whenever a hand-off ends (done, can't, withdrawn, answered with no call waiting).
- F6 accepted — `stop()` with no browser clears a start error, so Retry works.
- F7 accepted — test callbacks typed; `primeBrowserState` no longer exported.
- F8 accepted — `answerPrompt` accepts only the answers each card kind offers.
- F9 accepted — ask outcomes and action errors that can carry page text are framed as untrusted.
- F10 rejected — the card renders the model's own arguments, which the transcript stores either way; the runner's knowledge of a password field can't reach a card that is drawn from the call, not the result. The label heuristic stays; the tool description tells the model never to type passwords it wasn't given.
- F11 accepted — the element is read again right before acting; a step that turned into a final step while the card was up is refused; final-step words are read from the label AND the visible text.
- F12 accepted — at most 20 downloads per conversation (oldest go), and downloads older than 7 days are deleted at start like screenshots.
- F13 accepted — Settings asks first, naming the chats, when showing/hiding the window or switching browsers would restart or close pages.
- F14 accepted — clearing sign-ins blocks every start until the folder is gone.
- F15 accepted — dead state removed, comments corrected; the renderer store forgets a conversation when it ends.
- F16 accepted — `youcoded/docs/cc-dependencies.md` entry added (verified against CLI 2.1.296).
- F17 accepted — tests added for an unanswered ask through BrowserAct, the wait budget, and idle close.
- F18 accepted — the unanswered-ask result now says the Browser's questions show only on the computer.
