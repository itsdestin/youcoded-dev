---
status: shipped
date: 2026-11-08
topic: Should the phone run Claude Code in "fullscreen" display mode?
---

# Phone terminal view: Claude Code fullscreen mode

**Outcome (2026-11-09):** this investigation's recommendation was built in app commit 235042b1d on
`session/android-ux-test`. It seeds `tui: fullscreen` only when no display mode is set, and a swipe sends wheel
input (`terminal-swipe.ts`). Destin checked it on the Flip7: "fullscreen mode looks good". The status of card #213 is
in `2026-11-01-android-ux-test/report.md`. The text below is the investigation as written beforehand.

Investigation only. No app code changed. Everything marked TESTED was run against REAL Claude Code in a PTY with a
throwaway HOME and a local stand-in API (no login, no cost). Nothing touched `~/.claude`, the live app or a phone.

## Bottom line

- Fullscreen mode **does** end the duplicated-lines problem (tested: zero duplicates and zero lost lines across repeated rotations, including a rotation mid-reply).
- It is **not** a free switch. On the phone, the one-finger swipe in terminal view stops scrolling anything (the app scrolls xterm's own history, and fullscreen has none). That needs a small app change before this ships: translate a swipe into the mouse-wheel/PgUp input Claude Code accepts (both tested to work).
- Safest way to turn it on: seed `"tui": "fullscreen"` in the phone's `~/.claude/settings.json` only when the key is absent. Do not use the environment variable or a launch flag (they override a user's own choice, tested).

## Test setup (reproduce)

- Claude Code **2.1.300**, the version the phone ships: `youcoded/app/runtime/pins.env:6` (`CLAUDE_CODE_VERSION=2.1.300`). I installed the same release from npm into a scratch dir (`@anthropic-ai/claude-code@2.1.300`, linux-x64 build; the phone uses the arm64-musl build of the same release, untested here). The machine's own CLI is 2.1.319; it was only used for `--help` and string checks.
- Driver scripts: `/tmp/claude-1000/-home-destin-youcoded-dev/e9622357-5e27-456f-9083-aada39649800/scratchpad/t/` (`lib.mjs`, `a_precedence.mjs`, `b_resize.mjs`, `c_scroll.mjs`, `d_misc.mjs`, `e_more.mjs`). They use node-pty and `@xterm/headless` from `youcoded/desktop/node_modules` and the repo's own stand-in API `desktop/test-conpty/fake-anthropic.mjs`. Each run: fresh temp HOME, `CLAUDE*` env stripped, `.claude.json` pre-trusting the temp project.
- Phone size: 47 columns by 40 rows portrait, 109 by 18 landscape. Source: `desktop/tests/terminal-size-lock.test.ts:6` (`winW 360, winH 788, cellW 7.2, cellH 15, cols 47`), rows derived from 15 px cells less chrome (an estimate).
- Conversation: one reply of 100 numbered paragraphs (`L001`..`L100`), about 200 rows, longer than the screen.

## 1. How to turn it on for the phone only

What Claude Code supports (docs: code.claude.com/docs/en/fullscreen; behavior tested on 2.1.300):

| Method | Does it work | Respects a user's own choice? | Evidence |
|---|---|---|---|
| `"tui": "fullscreen"` in `~/.claude/settings.json` | Yes: alt screen on (`ESC[?1049h`) and mouse reporting on | **Yes**: user can change it | `a_precedence.mjs`: settings fullscreen -> alt screen true; settings `default` -> false |
| Env var `CLAUDE_CODE_NO_FLICKER=1` | Yes | **No**: beats a saved `"tui":"default"` | env=1 + settings default -> alt screen true |
| Same var inside settings.json `"env"` block | Yes | Partly (same file, user can edit) | `{env:{CLAUDE_CODE_NO_FLICKER:"1"}}` -> true |
| `claude --settings '{"tui":"fullscreen"}'` | Yes | **No**: beats the user's file (a later `--settings default` flips it back) | tested both directions |
| `CLAUDE_CODE_NO_FLICKER=0` | Forces classic, beats a saved fullscreen | n/a | env=0 + settings fullscreen -> false |
| No setting, no env (today's phone) | Classic in this test | n/a | first row of `a_precedence.mjs` |
| Dedicated CLI flag for the renderer | None found | n/a | `claude --help` (2.1.319) has no tui/fullscreen flag |

User escape hatch with the env var set: typing `/tui default` still worked (alt screen left, `settings.json` became `{"tui":"default"}`, child still running; `e_more.mjs` part 2). But the next new session would start fullscreen again because the env var wins. So the env route cannot be permanently opted out of.

**Recommended mechanism: seed-if-absent.**

- Who writes it: the phone backend at boot. The headless boot already runs settings chores for the phone only (`desktop/src/main/headless/headless-boot.ts:146-158`, `runSettingsChores`). A tiny chore modelled on `desktop/src/main/retention-default.ts` (`seedCleanupPeriodInto`: "only writes when the key is missing: an explicit user value is respected") would add `tui: "fullscreen"` when `settings.tui` is undefined. Goes in headless-boot only, so desktop is untouched (Destin's desktop already has his own value).
- When: every backend boot, idempotent. A user who later runs `/tui default` (Claude Code writes `"tui":"default"`, tested) keeps classic.
- Existing installs: have no `tui` key unless Claude Code's own startup dialog saved one, so after the app update they flip to fullscreen on their next NEW session. Sessions already running keep their renderer until restarted. They may see a changed terminal view with no warning (see section 2).
- Not tested: whether a real signed-in account on the phone already starts fullscreen by default. The docs' default table says Claude Code starts fullscreen when the account's first use was on or after 2026-05-06 and flags are fetched. With the stand-in API it started classic. Needs a real login on the device to know what existing users see today.
- Safety net in Claude Code: after two failed fullscreen starts on a machine it silently falls back to classic and ignores the setting (docs, "fullscreen renderer didn't finish starting"). Not tested.

## 2. What the user experiences at phone size

### Rotation / resize (the original bug)

TESTED (`b_resize.mjs`, `c_scroll.mjs`, `e_more.mjs`). Resizes were 47x40 -> 109x18 -> 47x40, repeated.

- **Classic** (reproduces the bug): extra copies of lines in scrollback after each cycle: 0, then 12 after the first return to portrait, 22 after the second. Lines also vanished while landscape (2 of 100 not present).
- **Fullscreen**: every one of the 100 lines was reachable by scrolling top to bottom before the resize, after rotating to landscape, after rotating back, and after a second cycle: 100/100 each time, no duplicates. Also 100/100 after a rotation done while the reply was still streaming.
- Caveat: that is xterm headless, not the phone's WebView, and it did not count anything the phone shows outside the PTY.

### Scrolling back

TESTED with raw bytes, as the app would send them.

- Claude Code turns on mouse reporting in fullscreen (`ESC[?1000/1002/1003h` seen; xterm reports `mouseTrackingMode: any`).
- Mouse wheel events (`ESC[<64;x;yM` up, `65` down) scroll the conversation. 20 wheel-ups moved the view from L077..L093 to L044..L059. Three wheel clicks moved only one line, so speed would need tuning (`CLAUDE_CODE_SCROLL_SPEED`, docs).
- PgUp `ESC[5~` / PgDn `ESC[6~` scroll about half a screen; Ctrl+Home `ESC[1;5H` jumps to the top (L001..L009), Ctrl+End `ESC[1;5F` back to the bottom. The message box and footer stay fixed at the bottom while scrolled.
- **One-finger swipe in terminal view will do nothing.** `TerminalView.tsx` touch handler (about lines 510-565) calls `terminal.scrollLines(...)`, which scrolls xterm's own history. In fullscreen xterm is on the alternate screen and holds exactly the 40 visible rows (`term.buffer.normal.length` = 40, active buffer type `alternate`). Nothing to scroll. The handler also stops touches reaching xterm, so no wheel reports are produced. Needs a code change: when the alternate screen is active, turn swipe distance into wheel reports or PgUp/PgDn (both tested to work). UNTESTED on a real WebView.
- **The floating up/down buttons do not scroll in either mode.** `TerminalToolbar.tsx:129,132` sends Up/Down arrow (`ESC[A`/`ESC[B`). TESTED: in classic, Up on an empty box recalls the last prompt; in fullscreen Up shows the "History 1/1" bar with the last prompt and Down clears it. The conversation does not move. So their behavior is unchanged by fullscreen; their label ("Scroll up") is already misleading outside menus.
- Toolbar keys Esc, Tab, Enter, Space, Left, Right are plain key bytes; no reason found for them to change. Not individually exercised.
- Wheel/PgUp scroll position: after scrolling up, new output does not pull the view down (docs: auto-follow pauses, "Jump to bottom" button). I did not capture that button.

### Selecting and copying text

- Today (both modes): the phone touch handler cancels selection on purpose (`TerminalView.tsx` comment: "Selection-on-touch is the trade-off"), so there is no touch selection in terminal view now. Fullscreen does not remove anything that exists.
- Fullscreen adds Claude Code's own mouse selection with copy-on-release. Touch drags never reach it because the touch handler swallows them. A tap that the WebView turns into a mouse click would be forwarded to Claude Code (clicks expand tool results, choose menu options per docs). UNTESTED on a device, could be a bonus or accidental taps.
- I sent a synthetic click and drag (SGR mouse bytes) and saw no clipboard escape sequence (OSC 52) come back. Inconclusive: my synthetic drag may not count as a selection. Docs say Claude Code copies through `wl-copy`/`xclip`/`xsel` locally and OSC 52 over SSH; the phone has neither tool, so copy from the terminal view is UNKNOWN. The copy path that works today is chat view.

### Things YouCoded reads from the terminal screen

- All screen readers use the active buffer, so they read whatever is on screen in either mode: `desktop/src/main/session-screens.ts:322,360` (`s.term.buffer.active`), `desktop/src/renderer/hooks/terminal-registry.ts:101` (`terminal.buffer.active`), shared reader `desktop/src/shared/terminal-screen-text.ts`.
- Fullscreen is already a first-class case for the pop-up/prompt detector: `desktop/test-conpty/popup-scenarios.mjs:651-672` records every scenario a second time as `fs-<name>` ("Destin's own Claude Code runs the FULLSCREEN renderer"), 54 `fs-*` fixtures exist in `desktop/tests/fixtures/popup-corpus/`. `docs/cc-dependencies.md:341,349` documents the fullscreen layout differences handled (a top-edge `▔` for pop-ups).
- TESTED: `npx vitest run tests/popup-detector-bench.test.ts tests/popup-corpus-replay.test.tsx tests/session-live-facts.test.ts` -> 3 files, 742 tests passed (these replay the recorded fullscreen captures; they do not run Claude Code live).
- Permission-mode reader: reads the footer text (`docs/cc-dependencies.md:150`). The footer `⏵⏵ auto mode on (shift+tab to cycle)` is visible at the bottom in my fullscreen captures (`b_resize.mjs` output) and stays visible while scrolled up (`c_scroll.mjs`). The phone's cursor-move-separated footer (`ESC[6G`) was seen on the phone in classic; not checked in fullscreen.
- "Started with"/version banner: no screen scraping found. `rg "Started with|Claude Code v"` over `desktop/src/{main,shared,renderer}` hit no reader of terminal text; the record comes from `session-record.ts` (sessionContext, published by the backend), not the terminal. Search-based negative, not run live.
- Attention/stuck classifier (`session-screens.ts`, `STUCK_TAIL_ROWS` tail read): works from the tail of the active buffer; in classic the tail is the live area, in fullscreen it is the whole 40-row screen. Not run live in fullscreen; desktop has run fullscreen for Destin, but I found no recorded statement about stuck-banner accuracy there. Treat as unverified.
- Reconnect replay: `desktop/src/shared/pty-trim.ts:7-32` already treats alternate-screen modes (47/1047/1049) as state to replay. Phone reconnect while in fullscreen: UNTESTED.

### What else changes for a user (from the docs and tests)

- Banner / old output no longer sit in scrollback; Ctrl+O transcript view with `/` search, `[` to dump to scrollback.
- No more flicker; steady memory in long chats (docs).
- Wheel/page keys, not the swipe, move through history until the swipe is rewired.
- The message box is fixed at the bottom (TESTED: stays put while scrolled).

## 3. Risks and unknowns

1. **Swipe scrolling breaks until reworked** (certain, from code + test). Highest-impact item. Fix is in `TerminalView.tsx`; also the thumb overlay (`updateThumb`, reads xterm buffer length) will show nothing in fullscreen.
2. **Existing users change renderer on update** without being asked, if seeded. Could be accepted, or ship behind a Settings choice. Not tested: what a real account sees today (it may already be fullscreen for newer accounts).
3. **Overriding a user's choice** only happens with env or `--settings`; avoid them.
4. **Copy from terminal view unknown** (no clipboard tool on the phone; touch selection already disabled).
5. **Taps may be forwarded as clicks** on a real device (accidental expand/select). Untested.
6. **Not run on a phone or in the phone WebView**: all results are from a desktop PTY + headless xterm. The phone's musl arm64 Claude Code build, performance/battery, keyboard lift (`--term-grid-lift`), and soft-keyboard resize interplay are unverified.
7. **Fullscreen auto-fallback**: Claude Code can silently drop to classic after failed starts and ignores the setting; app features that assume fullscreen (the new swipe translation) must tolerate classic. Check `ESC[?1049h` state in xterm rather than assuming from the setting.
8. **Version coupling**: the pinned version moves via `app/runtime/update-pins.py`; the daily `check-popup-drift` already covers fullscreen layouts on desktop (`docs/cc-dependencies.md:35`).
9. **Stale doc**: `docs/cc-dependencies.md:428` says alt-screen "would break our `terminal:get-screen-text` IPC if we relied on the main-screen buffer", but every reader uses `buffer.active` (above), so that warning no longer applies. Not edited (read-only task).

## Suggested next steps (if approved)

1. Prototype swipe-to-wheel for the alternate screen in `TerminalView.tsx` and verify it in the workbench/dev instance and then on the phone.
2. Add the seed-if-absent chore to `headless-boot.ts` with a unit test (key absent -> set; `"default"` present -> untouched).
3. On a real phone with a real login: record what Claude Code starts in with no setting; check copy, taps, rotation, keyboard open/close, reconnect.
