# Float chrome — code review

`bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/theme-minimal-chrome/youcoded`:

```
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
FAIL  invariants (ast-grep) — 3 violations, all in TimelineEntryHint.tsx and App.tsx
1 check(s) failed.
```

The `invariants` failure is **pre-existing on `origin/master` and unrelated to this branch**:
`git diff origin/master...HEAD --stat` touches no line of `TimelineEntryHint.tsx` or
`App.tsx` (confirmed — neither file appears in the diff stat). Every other check is green.

## Findings

- F1 — `desktop/src/renderer/hooks/use-wallpaper-header-ink.ts:60` (called from `HeaderBar.tsx:395` and `ScreenBand.tsx:39`) — while a Projects/Pages screen is open in float chrome, two full-cost sampler instances run at once: the chat `HeaderBar`'s instance keeps its `ResizeObserver`/`MutationObserver`s live and keeps re-sampling because `App.tsx:3700` hides that column with `visibility: hidden` (not unmount) via `data-screen-open`, while `ScreenBand`'s own instance (mounted only for that same open-screen state — `ProjectView.tsx:574` and `PageHost.tsx:280` return `null` when closed) samples too. `eligible()` (`use-wallpaper-header-ink.ts:92`) checks only `document.body.dataset.chromeStyle === 'float'`, never whether its own header is actually visible, so the hidden instance keeps decoding images and reading the full canvas exactly as if it were shown. This doubles the branch's heaviest per-trigger cost for as long as the screen stays open, violating `performance.md` rule 2 ("Hidden means idle... no drawing"). — confirmed by reading `App.tsx:3691-3700` (visibility, not unmount), `HeaderBar.tsx:393-395`, `ScreenBand.tsx:36-39`, `ProjectView.tsx:574`, `PageHost.tsx:280`, and the hook's `eligible()`/effect body.
- F2 — `desktop/src/renderer/hooks/use-wallpaper-header-ink.ts:223-237` — `sample()` is wired to fire from both `window.addEventListener('resize', resize)` (line 237) and a `ResizeObserver` on the header element (lines 225-226); since `.header-bar` spans (and resizes with) the window width, an ordinary window resize/drag fires both, running the full decode+draw+`getImageData` pass twice per frame of resize. The same file already has a working example of the fix one function up (`MacTrafficLights`, `HeaderBar.tsx:161-174`), whose own comment explains exactly why: "`window.resize` is not frame-batched... each call measured + setState'd in the window where the compositor is waiting" — and rAF-coalesces its window-resize handler for that reason. This hook copies neither the coalescing nor the reasoning. — confirmed by reading both effects side by side.
- F3 — `desktop/src/renderer/hooks/use-wallpaper-header-ink.ts:135` — `ctx.getImageData(0, 0, width, stripHeight)` reads the *entire* viewport (`width = window.innerWidth`, `stripHeight = window.innerHeight`, line 115/123) into a JS-visible pixel array on every `sample()` call, even though every actual read afterward is a bounded ~13×13-pixel neighborhood around a handful of control/dot centers (the file's own comment at line ~127 promises "at most 13 x 13 reads per element, independent of viewport size" — true for the *reads*, but the *capture* it reads from is not bounded at all). On a 4K/hi-DPI monitor this is an ~8M-pixel synchronous main-thread copy, repeated on every resize (doubled by F2), every `data-chrome-style` mutation, and every session-strip DOM change. — confirmed by reading the size computation and the `getImageData` call.
- F4 — `desktop/src/renderer/hooks/use-wallpaper-header-ink.ts:103-113` — a brand-new `Image` is constructed and `.decode()`d from scratch on every `sample()` call; nothing caches the decoded bitmap across resamples of the same unchanged `src`. Combined with F1-F3, every resize/mutation while float chrome is active re-decodes the wallpaper image in addition to re-reading the full viewport. — confirmed by reading `sample()`'s body (no cache keyed on `src` outside the `Image` object itself, which is discarded each call).
- F5 — `desktop/src/renderer/hooks/use-wallpaper-header-ink.ts:213-237` — the `ResizeObserver`, the two `MutationObserver`s (`data-chrome-style` on `<body>`, and the header's own subtree for session-strip membership) and the `window` resize listener are constructed and torn down on **every** mount/dependency change of every `useWallpaperHeaderInk` caller (three call sites: two in `HeaderBar.tsx`, one in `ScreenBand.tsx`), for every theme and every chrome style — not only `float`. The write side is correctly gated (`eligible()` bails before doing anything), but the sessions observer's predicate (`records.some(...)`, line ~232-234) still runs on every session-strip DOM mutation app-wide regardless of chrome style, and the observer machinery itself exists for chrome styles the branch's own header comment says should see "no effect" from this hook. Low severity — no visible/behavioural leak, just always-on bookkeeping the branch's stated design (comment at line 91-92: "only the float chrome style is see-through enough to need this; every other theme and chrome style never runs the sampler at all") doesn't quite deliver: the *sampler* doesn't run, but its *scaffolding* does. — confirmed by reading the effect body; not measured for actual CPU cost.

## Not covered

- `desktop/tests/wallpaper-header-ink.test.ts` (pure `deriveWallpaperHeaderInk`/`tuneDot` unit tests) was read only in passing via the source file it targets, not line-by-line against `wallpaper-header-ink.ts`'s contrast math.
- No independent measurement (profiler, `dom-size-sweep.mjs`, or a live run) of how much F1-F4 actually cost in frame time; all four are confirmed by code reading (call graph + the hook's own numbers: viewport dimensions, call sites, effect deps), not by a captured trace.
- Android WebView and remote-browser behavior were reasoned about (same browser APIs, same shared bundle, no `window.claude`-only calls in the new hook) but not run on either platform.
- Did not audit `desktop/tests/float-chrome-pops.test.ts` and `wallpaper-header-runtime.test.tsx` assertion-by-assertion beyond confirming they exist and exercise CSS gating and the sampler's basic eligibility/decode/resize/unmount paths — they do not appear to cover F1 (concurrent instances) or F2 (duplicate resize firing).

## Triage (implementing session, 2026-09-24)

- F1 accepted — fixed in youcoded `e720e771e`: a header whose computed visibility is hidden skips sampling; a `data-screen-open` change reschedules. Pinned: `wallpaper-header-runtime.test.tsx` "does not sample while its header is hidden under a screen" (seen red with the check removed).
- F2 accepted — fixed in `e720e771e`: resize, ResizeObserver and strip changes coalesce to one trailing sample (120 ms / 16 ms). Pinned: "discards stale decode, resamples on resize…" (a three-event burst is one sample).
- F3 accepted — fixed in `e720e771e`: only the header band and the bottom-controls band are read, cached by viewport size and band edges. Measured in the workbench: 30 resize events went from 30 full-viewport reads (~194 ms of canvas work) to none.
- F4 accepted — fixed in `e720e771e`: the decoded image is kept per effect run (theme/image change re-runs it); a failed decode is retried next time.
- F5 accepted — fixed in `e720e771e`: the resize/session/screen triggers attach only while float is active; other styles keep one attribute watch on `<body>`. Pinned: "sets up no resize or session triggers outside the float style" (seen red with the gate removed).
- verify.sh `invariants` failure — already handled: the workspace branch was 135 commits behind; its two stale ast-grep rules had been removed/updated on workspace master. After rebasing the workspace branch, invariants pass.
