---
status: active
date: 2026-08-26
plan: docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md
---

# Perf-lab plan corrections found during execution

Running list of places where `docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md`
turned out to be wrong about the machine or the current app source. Each one is
verified, not assumed. These must land in `scripts/perf-lab/README.md` (Task 12)
and the operating manual (Task 16).

## 1. `node --test <dir>/` does not work on Node 26.4.0

The plan says `node --test scripts/perf-lab/tests/` everywhere. On this Node that
fails — it tries to `require()` the directory as a module:

    ✖ scripts/perf-lab/tests (32.7ms) 'test failed'

Use the glob instead (verified, 14/14 pass):

    node --test scripts/perf-lab/tests/*.test.mjs

Bare `node --test` from the workspace root recurses into sub-repo `node_modules`
and hangs — never use it here.

## 2. The two "already downloaded" rig assets did not exist

The plan assumed `/home/destin/.config/youcoded-dev/engine/b9992-cpu/` and a
`stories260K.gguf` under a HuggingFace hub cache. Neither existed (no engine had
ever been downloaded, no HF cache at all). Both are now provisioned reproducibly
under `scratch/perf-lab/assets/` (gitignored), and `fixture.mjs` re-provisions
them on a fresh machine:

- `stories260K.gguf` — 1,185,376 bytes, GGUF v3, from
  `https://huggingface.co/ggml-org/models/resolve/main/tinyllamas/stories260K.gguf`
- `engine-b9992-cpu/` — unpacked from
  `https://github.com/ggml-org/llama.cpp/releases/download/b9992/llama-b9992-bin-ubuntu-x64.tar.gz`,
  sha256 verified equal to `a56a9c6c...19165d9`, the exact value pinned in the app's own
  `youcoded/desktop/src/main/engine/engine-pin.ts`. `.complete` marker written as
  `{"version":"b9992","backend":"cpu","binaryRelPath":"llama-b9992/llama-server"}`
  (shape from `engine-acquisition.ts:35`). Binary verified runnable: `version: 9992 (6eddde06a)`.

Note the plan's `cp -al` from a dev-profile dir was never reproducible; deriving
from the app's own pin is.

## 3. Message-bubble selector: the plan's guess does not exist

Task 9's `MESSAGE_COUNT_EXPR` proposes `.chat-scroll [data-message-id]`. There is
**no `data-message-id` anywhere in ChatView** — that selector would count 0 forever
and silently zero every history measurement.

Real markup (`youcoded/desktop/src/renderer/components/ChatView.tsx`):
- `:749` scroll container really is `.chat-scroll`
- `:877-884` every timeline entry is `<div class="timeline-entry in-view">`
- `UserMessage.tsx:72` → `.user-bubble`; `AssistantTurnBubble.tsx:421` → `.assistant-bubble`
  (one assistant TURN can render MULTIPLE `.assistant-bubble` elements — `:412` maps over `bubbles`)

Use:

    document.querySelectorAll('.chat-scroll .timeline-entry').length

Caveat to check at smoke time: `BubbleFeed.tsx` is a parallel renderer referenced at
`ChatView.tsx:756-758` — confirm which one is mounted for the layout under test.

## 4. Session pill selector collides with the overflow menu

`data-session-idx` is on the pill button (`SessionStrip.tsx:782`) **and** on the
overflow dropdown's rows (`:921`), and that dropdown lists *all* sessions, not just
overflowed ones (`:915`). An unscoped `[data-session-idx="i"]` can match a hidden
menu row. Scope it:

    document.querySelector('.session-strip [data-session-idx="0"]')

Overflow is **width-driven, not count-driven** (`SessionStrip.tsx:709-729`,
`header/pack-sessions.ts:33-101`): the active pill stays expanded, others pack as
24px dots, and anything that doesn't fit leaves the bar entirely. So "6 sessions"
does not imply overflow — it depends on the 1600px window and the session names.

## 5. `window.claude.native.listModels` does not exist

Task 10's troubleshooting note suggests inspecting `window.claude.native.listModels`.
The native surface (`preload.ts:1170-1204`) has no such member. Model listing is:
- `window.claude.providers.catalog()` — `preload.ts:1216`
- `window.claude.engine.models()` — `preload.ts:1254`
- `window.claude.models.installed()` — `preload.ts:1262`

`modelId` **is** the GGUF basename without `.gguf` (`engine/cache-scan.ts:22-24`,
`engine-manager.ts:314-327`), so the plan's `modelId: 'stories260K'` is correct.
`session.create` for native needs `{ provider: 'native', binding: { providerId: 'local',
modelId } }` — `binding`/`preset` are absent from preload's TS type (`preload.ts:376-377`)
but are forwarded verbatim and are what main reads (`ipc-handlers.ts:685`);
`session-manager.ts:85-86` throws without a binding on a fresh native session.

Linux default engine backend is **vulkan** (`engine-pin.ts:56`), not cpu — the fixture
gets `-cpu` only because it writes `engine.backend: 'cpu'` into `~/.youcoded/config.json`.

## 6. The shared `node_modules` was stale (pre-existing, fixed in the worktree only)

`youcoded/desktop/node_modules` was missing `zod`, `ulid`, `diff`, `@codemirror/*`,
`@lezer/*` and more, so `npx tsc --noEmit` reported 135 errors on **master** as well
as in the worktree. `npm ci` in `worktrees/perf-lab/desktop` fixed it there (tsc now
exits 0). **The main checkout is still stale** — anything that typechecks or builds
`youcoded/desktop` directly needs its own `npm ci` first.

## 7. Both `*-start` marks fire at module END, not module start (found in review)

`index.tsx`'s `performance.mark('yc:index-start')` is written between two imports —
but **ESM hoists every import declaration above every statement in the module body**,
so it fires only after React, react-dom, the CSS and the whole component graph have
evaluated. `main.ts`'s `perfMark('main:module-start')` sits after the import block and
`tsconfig.json` sets `"module": "commonjs"`, so TS emits all 46 `require()` calls above
it in source order.

Consequence: bundle/module evaluation — plausibly the single largest renderer startup
cost — sat entirely OUTSIDE the instrumented window while the mark names claimed the
opposite. A future report would have shown `indexStart → rootRender` as a few ms and a
reader would conclude "renderer module load is free". The rig could not detect this.

Fixed by renaming to what they measure (`yc:modules-evaluated`, `main:imports-done`) and
recovering the lost window for free: `performance.timeOrigin` IS the page's navigation
start and the rig already receives it, so `documentStart = rel(timeOrigin)` makes
`modulesEvaluated − documentStart` the bundle-evaluation cost with zero product change.

## 8. Three chore durations included work belonging to no chore (found in review)

The rig derives each chore as `mark[n] − mark[n−1]`, so everything between two marks is
attributed to the LATER chore. Three gaps carried substantial foreign work:

- `installHooks` also spanned `runAnalyticsOnLaunch()` (sync read + device-id hash),
  `app.getGPUInfo('complete')`, and first-run detection (two `readFileSync` + parse)
- `themeProtocol` also spanned `FAVORITES_PATH` setup, four `ipcMain.handle` calls and
  `Menu.setApplicationMenu(null)`
- `authStore` named one of four account registrations

This is the one error class the source-pinning tests structurally cannot catch, and it
yields numbers that are wrong but believable. Fixed by adding `main:chore:prelude:done`
and `main:chore:ipc-prefs:done`, and renaming `auth-store` → `accounts`.

## 9. `cdp.mjs` hung forever when its target died (found in review)

No `close` handler meant a CDP target dying mid-request left every pending promise
unsettled — the rig hung with no error rather than failing. Reproduced: killing the
browser during a 30 s in-page sleep produced an unsettled top-level await. Fixed;
verified the same request now rejects in 810 ms, and send-after-close rejects immediately.

## 10. The pixel diff passed a resized window (found in review)

`diffPngs` padded mismatched dimensions with **transparent** pixels but compared RGB
only — so a black 100×100 vs 100×120 pair measured `0% differing`. A resized window would
have passed the "zero visible change" gate. Fixed by comparing alpha and returning
`sizeMatch`. Also: a shared headless-Chrome profile made a second concurrent diff silently
attach to the first browser and then hang forever when it was killed — each launch now
gets its own port and profile.

Known and accepted: `pct` rounds to 2 dp, so anything under ~0.0128% of the frame
(≈205 px at 1600×1000) reports `0.00` and passes. `differing` rides along in the result
so a "0%" pass stays auditable.

## 11. Xvfb needed no sudo after all

The plan's Task 0 Step 1 makes a `sudo pacman -S --needed xorg-server-xvfb` by
Destin a hard prerequisite for the whole rig. On this machine that install failed:
every mirror 404'd because the local package DB still listed `21.1.23-1.1` while
the repos had moved to `21.1.24-1.1` (a plain `-Sy` refresh, or a full `-Syu`,
would fix it — but a partial upgrade on a rolling distro is its own hazard).

Not needed. Extracting the same distro package into a user prefix requires no
root, and every shared library it wants was already present:

    scratch/perf-lab/assets/xvfb-prefix/usr/bin/Xvfb

Verified running: `:99` at `1600x1000x24`, X.Org 21.1.24, `xdpyinfo` answering.
`launch.mjs`'s `resolveXvfbBin()` prefers `$XVFB_BIN`, then `Xvfb` on PATH, then
this vendored copy — so a proper system install silently takes over if one ever
lands, and no code changes when it does.
