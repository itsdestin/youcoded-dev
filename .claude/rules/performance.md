---
paths:
  - "**/desktop/src/renderer/**"
  - "**/desktop/src/main/**"
last_verified: 2026-09-23
verify:
  - path: youcoded/desktop/src/renderer/state/chat-context.ts
    contains: "useSyncExternalStore"
  - path: youcoded/desktop/src/renderer/hooks/useSessionAttention.ts
    contains: "useSyncExternalStore"
  - test: youcoded/desktop/tests/root-selectors-skip-token-rerenders.test.tsx
  - test: youcoded/desktop/tests/chatview-skips-uninvolved-sessions.test.tsx
  - test: youcoded/desktop/tests/chat-reducer.test.ts
  - test: youcoded/desktop/tests/project-view-files-tab-stays-mounted.test.tsx
  - path: scripts/ast-grep/rules/filestab-mounted-with-hidden-prop.yml
  - path: scripts/ast-grep/rules/filestab-memoized.yml
  - path: scripts/ast-grep/rules/filestab-no-artifact-context.yml
  - path: scripts/ast-grep/rules/mascot-rig-pauses-when-hidden.yml
  - path: scripts/ast-grep/rules/no-unstepped-infinite-animation.yml
  - test: youcoded/desktop/tests/SessionStrip-layout-effects.test.ts
  - test: youcoded/desktop/tests/animation-frame-budget.test.ts
  - test: youcoded/desktop/tests/main-blocking-calls.test.ts
  # PENDING (2026-09-23) — uncomment each once its branch merges; audit-anchors fails on a
  # missing path, full-line comments are skipped. TODO(coordinator):
  #   session/perf-guard-busy-app  → - test: youcoded/desktop/tests/busy-app.test.tsx  (exact name: check the branch)
---
# Performance — every new app element

Each rule is a class that shipped and hurt: Destin's "freezes, stutter, worse over hours, worse
with more sessions". Evidence: `docs/active/investigations/2026-08-27-perf-defect-classes.md`,
`2026-09-16-smoothness-sweep.md`. Two general guards: **the busy-app test**
(`desktop/tests/busy-app*.test.tsx`, branch `session/perf-guard-busy-app`) and **the
main-process blocking-call ratchet** (`desktop/tests/main-blocking-calls.test.ts`).

1. **The main process never blocks.** No `*Sync` fs, `execFileSync`/`spawnSync` or whole-file
   parse on any path a click, IPC call, reply end or timer reaches. `async` with no `await` on
   the hot path is still blocking, and review misses it (`refreshTurns`, `conversation-store`
   `list()`). **Why:** one thread serves every window — a sync lease write froze the app 6+
   minutes (2026-09-08). **Guard:** `main-blocking-calls.test.ts` — every blocking call in
   `src/main` is banned unless listed in its allowlist, which may only shrink.

2. **Hidden means idle.** A mounted-but-hidden tab, pane or terminal does zero work: no
   timers, no `window`/`document` listeners, no drawing (xterm does not see `visibility:hidden`
   — pause it explicitly), no subscriptions to other sessions' events. A kept-mounted tab is
   `hidden` prop AND `React.memo` AND stable props AND no context read of its own — memo cannot
   stop a context reader, so the parent passes the one value down (FilesTab). **Why:** ten
   background sessions were ~40 React updates/s into invisible trees; hidden terminals kept
   uploading glyphs. **Guard:** `filestab-*` ast-grep + `project-view-files-tab-stays-mounted`;
   `mascot-rig-pauses-when-hidden`; the busy-app test.

3. **Subscribe to a slice, never the whole.** State read by many or per-session components is
   a `useSyncExternalStore` selector store, not a plain Context — memoise every Context value, but
   that is NOT enough (`ArtifactContext` was memoised and still redrew every tab). Chat state:
   `useChatState(id)` or a cached-selector hook; `useChatStateMap()` is banned on the render
   path; never `store.getState()` during render (tears). **Why:** the app root read the whole
   chat state for two booleans, redrawing the entire shell ~60×/s while a reply streamed.
   **Guard:** `root-selectors-skip-token-rerenders`, `chatview-skips-uninvolved-sessions`.

4. **Per-event work does not grow with history or session count.** Never copy a whole
   Map/Set per streamed word; check first, copy only what changes. The reducer preserves
   `toolCalls`/`toolGroups` Map refs — don't clone them. Polls, broadcasts and watchers
   coalesce and reach only subscribed windows/sessions. **Why:** per-word `seenUuids` copies
   made the end of every reply lurch; per-file watcher messages hit every window.
   **Guard:** `chat-reducer.test.ts` → "seen-uuid dedup appends in place"; `main-blocking-calls.test.ts` (per-session polls are protected functions).

5. **Keystroke-frequency state stays in the component that needs it.** Draft text, a search
   query, a caret never live in App or a shared parent; parents get the value on submit or
   debounced (or a tiny store only the reader subscribes to — the drawer's slash filter), and no
   effect re-subscribes per keystroke. **Why:** the file editor re-subscribed
   its watcher on every character. **Guard:** the busy-app test.

6. **Layout and paint stay cheap.** No read-after-write layout (`getComputedStyle`,
   `offsetWidth` after a style write) in per-frame or per-key paths, and no dependency-less
   `useLayoutEffect` that measures; animate `transform`/`opacity` only; a high-frequency style or
   custom-property write skips an unchanged value and coalesces to one `requestAnimationFrame`
   (not `@property` — it kills `var(--x, fallback)` fallbacks and visibly moves layout); an
   `infinite` animation carries `steps()`. **Why:** ~120 forced style recalcs/s in
   SessionStrip; root variables rewritten per keystroke recalc the whole document; one
   smooth pulsing dot cost ~29% of a core at 180 Hz. **Guard:** `SessionStrip-layout-effects`,
   `animation-frame-budget`, `no-unstepped-infinite-animation`.

7. **Lists of the user's things draw only what is visible** — `.claude/rules/renderer-lists.md`.

Depth: `youcoded/docs/renderer-chrome.md` → "Lists and render cost"; perf lab `scripts/perf-lab/`.
