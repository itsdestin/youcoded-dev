---
status: draft
date: 2026-07-20
kind: plan
---

# Plan — Mockup browser renderer (dev-only UI iteration without Electron)

A dev-only way to open the **full current app renderer** in a plain browser tab —
no Electron main process, no PTY, no WebSocket server — pre-loaded with two fake
resumable conversations (one fake Claude Code convo, one fake local-model convo)
that support a **live fake play-through** so we can test tool UI and permission
flows back and forth. This **replaces the ToolCard sandbox** (`?mode=tool-sandbox`)
as the primary UI-iteration surface.

**Repo:** `youcoded/` — desktop renderer only. No main-process, Android, or Kotlin
changes. The only main-process file touched is `preload.ts` *read-only* as the
contract source for the parity test.

**Goal (scope discipline):** this is **utilitarian dev tooling for fast visual
iteration** — building new UI surfaces, editing existing ones, playing with theme
tokens (rounding/color/border rules). It is NOT a feature, NOT a test framework,
NOT a playback/timeline editor. Every design decision below is biased toward
**lowest maintenance burden**; see "Maintenance contract" before adding anything.

---

## Why this is low-maintenance (the core bet)

The naive version of this idea is a maintenance sink: 90 renderer files touch
`window.claude`, the preload bridge exposes ~236 IPC channels across ~25
namespaces. Hand-stubbing all of that rots immediately.

Three properties of the codebase let us avoid that tax:

1. **The entire live conversation UI is driven by ~6 discrete event types** through
   one push channel (`transcript:event`) plus the prompt channel
   (`prompt:show`/`dismiss`/`complete`). Everything else is peripheral chrome that
   can be answered with static canned data or safe no-ops. Verified in
   `App.tsx:982-1312` — the transcript handler switches on `user-message`,
   `assistant-text`, `user-interrupt`, tool events; prompts are just
   `{sessionId, promptId, title, description, buttons[]}`.

2. **The app already has a bulk state-injection path.** `chat:hydrate` →
   `HYDRATE_CHAT_STATE` pre-populates full session timelines in one shot (remote
   browsers use it to render a complete conversation instantly, no event replay).
   So the *resumable* state of each fake conversation is a **static JSON snapshot
   in the hydrate shape** — declarative data, not an event log. When a transcript
   event shape changes, a snapshot breaks loudly and greppably (it *is* the state),
   unlike an event script which breaks subtly.

3. **A Proxy catch-all kills the 236-channel stub burden in one stroke.** Anything
   the mock doesn't explicitly implement gets a logged, safe-empty resolve instead
   of a 30s timeout. We only hand-implement the ~15–20 channels that chat +
   permissions + themes actually exercise.

The split that keeps this cheap: **the bulk of the visible UI is data (hydrate
snapshot); only the interactive back-and-forth is logic (a thin replayer).**

---

## What we are explicitly NOT building

Hard scope walls. If a future task wants one of these, it crosses into "feature"
territory and needs its own plan — do not bolt it on here.

- **No script/timeline editor, no playback speed controls, no branching dialogue
  trees.** The live play-through is a *fixed canned exchange*: user sends anything
  → the shim replays one scripted assistant response (text + tool events + a
  permission prompt). Stepping through "different turns" is out of scope for v1.
- **No PTY / terminal emulation.** Anything backed by a real byte stream (xterm
  canvas, raw PTY) has no renderer-side fallback and is simply absent in mockup
  mode. Fake conversations live in the chat-bubble / tool-card layer — which is
  exactly where iteration is wanted.
- **No network.** The mock never opens a WebSocket, never fetches the marketplace
  or theme registry. Marketplace/sync/social namespaces resolve to canned empty.
- **No production reachability.** Dev-gated and tree-shaken exactly like
  `tool-sandbox` (see gating below). The mock shim must never install when a real
  `window.claude` exists.

---

## Architecture

Three new pieces under `src/renderer/dev/mockup/`, plus a launcher script and a
Vite-only route. Follows the existing `dev/` precedent (`ToolSandbox.tsx`,
`fixture-loader.ts`, `fixtures/`).

```
src/renderer/dev/mockup/
  mock-shim.ts          # Proxy catch-all + ~15-20 hand-written channels
  install-mock.ts       # installs mock-shim as window.claude (mockup mode only)
  conversations/
    claude-code.json      # hydrate snapshot: fake Claude Code convo
    local-model.json      # hydrate snapshot: fake local-model convo
  replayer.ts           # input -> canned transcript/prompt events (the only logic)
  mock-shim.test.ts     # channel parity contract test vs preload.ts
  snapshot.test.ts      # hydrate snapshots conform to reducer's expected shape
scripts/
  run-mockup.sh         # Vite-only launcher (workspace scripts/, mirrors run-sandbox.sh)
```

### 1. `mock-shim.ts` — the IPC bridge substitute

Implements the `window.claude` surface as two layers:

- **Hand-written channels (the ~15–20 that matter).** Return canned data:
  - `session.list` → the two fake sessions (id, name, cwd, provider:
    `claude-code` vs `native`).
  - `session.create` → stub: returns a fake session object and feeds the
    "new session" script (this is the stubbed new-session flow).
  - `session.sendInput` → hands the text to `replayer.ts`.
  - `session.respondToPermission` (`permission:respond`) → resolves the pending
    prompt and lets the replayer continue.
  - `theme.list` / `theme.readFile` → **serve the real builtin themes** so theme
    work is faithful (see "Theme iteration" below).
  - `on.*` listener registration for `transcript:event`, `prompt:show/dismiss/
    complete`, `session:created/destroyed/renamed`, `status:data`, `chat:hydrate`.
  - `skills.list`, `tags.list`, `commands.list`, `account.*` → static canned
    values so the surrounding panels render non-empty but inert.
- **Proxy catch-all (everything else).** A `Proxy` on each namespace returns a
  function that `console.warn`s once per channel (mirroring `remote-unsupported.ts`'s
  announce-once pattern) and resolves a safe empty value (`[]`, `{}`, `null`, or
  resolved Promise). This is what makes the mock resilient to renderer changes that
  call new channels — they degrade to empty instead of hanging 30s.

The hand-written surface must match preload's **call signatures** (positional args
vs object-wrapped). The parity test (below) pins this.

### 2. `conversations/*.json` — resumable state as data

Each file is a **hydrate snapshot** in the exact `HYDRATE_CHAT_STATE` payload
shape the reducer expects (the same shape `remote-server.ts` sends on connect).
On mockup boot, `install-mock.ts` fires `chat:hydrate` with both snapshots, so
both conversations render their full history instantly — no replay.

- `claude-code.json` — a fake Claude Code session: a couple of user/assistant
  turns, a few tool calls (Read/Edit/Bash) in various statuses, so tool cards
  render in their real layout.
- `local-model.json` — a fake `native` provider session with a distinct model
  stamp, so the local-model UI surface (model chip, native permission mode) is
  visible.

Keep these **small and hand-authored** (a few turns each). They are fixtures, not
corpora. When the reducer's hydrate shape changes, update these two files — the
`snapshot.test.ts` guard fails CI until you do.

### 3. `replayer.ts` — the live play-through (the only logic)

Deliberately dumb. A single canned exchange:

1. User types anything into the active fake session and hits send →
   `session.sendInput` routes here.
2. Replayer emits a fixed sequence on that session's id, with small `setTimeout`
   gaps so streaming/loading states are visible:
   - `transcript:event` `user-message` (echo what the user typed)
   - `transcript:event` `assistant-text` (a canned reply)
   - `transcript:event` tool-use for one tool (e.g. an `Edit`), status running
   - `prompt:show` — a realistic permission prompt (title/description/buttons)
3. The user's approve/deny click goes through the real `permission:respond`
   channel → replayer emits `prompt:complete`, then the tool-result
   `transcript:event` (status complete or failed per the decision).

Two scripted variants ship (one per conversation), selected by which fake session
is active: the Claude Code convo replays a tool+permission exchange; the
local-model convo replays a native-provider exchange. No branching, no randomness,
no timeline scrubber. This is the piece most likely to be tempted to grow — the
maintenance contract below exists to stop that.

### 4. Theme iteration (real data, not stubs)

Theme work is a primary use case (rounding/color/border rules), so the mock must
render **real themes**, not `theme:list → []`.

- `theme.list` returns the **builtin** themes. `theme-context.tsx` already imports
  `builtin/light.json`, `dark.json`, `midnight.json`, `creme.json` directly — the
  mock reuses those same JSON modules (or `import.meta.glob` over `themes/builtin/`
  and `themes/community/`) so the appearance picker shows real themes and switching
  applies real tokens via `applyThemeToDom`.
- `theme.readFile(slug)` returns the real theme JSON so an edited theme re-renders.
- `theme.writeFile` is a **no-op that re-fires `theme:reload`** so in-mockup theme
  edits reflect live without touching disk (mockup never writes real theme files).
- Editing a theme's tokens and seeing the result = edit the JSON in the repo,
  Vite HMR re-imports it, `theme:reload` refires. That is the fast iteration loop.

### 5. Route + boot gating

- `index.tsx`: add a mockup branch alongside the existing sandbox logic. When
  `?mode=mockup` **and** `import.meta.env.DEV`, call `installMock()` (which sets
  `window.claude = mockShim`) *before* `installShim()` would run, and skip the
  remote `connect()`/login path entirely. The `isElectron` guard already treats a
  present `window.claude` as "ready", so installing the mock first makes `Root`
  render `<App/>` immediately.
- `App.tsx`: the mockup reuses the **normal `<App/>` provider tree** (unlike
  tool-sandbox's bare route) — that's the point, we want the real chrome. No new
  top-level route needed beyond the index.tsx boot branch.
- **Gating (prod-safety, mirrors tool-sandbox exactly):** the entire mockup branch
  is gated on `import.meta.env.DEV` so it is statically dead code and tree-shaken
  out of production builds. `install-mock.ts` additionally refuses to install if
  `window.claude` already exists (real Electron preload / real remote shim), so it
  can never shadow a live bridge.

### 6. `scripts/run-mockup.sh` (workspace `scripts/`)

Mirrors `run-sandbox.sh` / `run-dev.sh` conventions:

- Exports `YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-50}"` (same shifted-port
  isolation so it coexists with a running dev/built app; Vite lands on 5223).
- **Runs only `vite`** (`npm run dev:renderer`), not the Electron `dev` script —
  no main process, no PTY. This is what makes startup fast and HMR ~1s.
- Prints the URL: `http://localhost:5223/?mode=mockup`. Destin opens it in any
  browser. (Optionally `xdg-open`/`start` it; keep it opt-in, not forced.)
- A comment header explaining when to use this vs `run-sandbox.sh` vs `run-dev.sh`.

---

## The maintenance contract (read before extending)

This tooling stays cheap only if these hold. Pin them as WHY comments at the
relevant edit sites, and restate them in the doc updates (below):

1. **Conversations are hydrate snapshots (data), never event scripts.** If you
   find yourself writing a sequence of timed events to set up *static* state, put
   it in the snapshot instead.
2. **The replayer stays a single fixed canned exchange per conversation.** No
   conditionals keyed on user text, no turn counters, no playback UI. Want richer
   interaction → that's a feature, write a plan.
3. **New channels degrade via the Proxy; only hand-write a channel when chat /
   permissions / themes visibly break without it.** Resist stubbing namespaces
   "for completeness."
4. **The parity and snapshot tests are the drift detectors.** When they fail, the
   fix is updating the mock to match preload/reducer — not loosening the test.

---

## Guard tests

Follows existing vitest conventions (`fixture-loader.test.ts`, `tests/` dir).

- **`mock-shim.test.ts` — channel parity contract.** Assert every hand-written
  channel on the mock exists in `preload.ts`'s exposed surface with a compatible
  signature (positional vs object-wrapped). This is the test that fails CI when
  preload gains/changes a channel the mock hand-writes, forcing the mock back into
  sync. (No such parity test exists today for remote-shim; this adds the first one,
  scoped to the mock's much smaller hand-written surface.)
- **`snapshot.test.ts` — hydrate shape conformance.** Assert both conversation
  JSON files conform to the `HYDRATE_CHAT_STATE` payload shape the reducer
  consumes (required session fields, turn/tool structure). Fails loudly when the
  reducer's hydrate contract changes, pointing at the fixture to update.
- Reuse the reducer's own type as the source of truth where possible (import the
  hydrate payload type) rather than re-declaring it, so the test tracks drift
  automatically.

---

## Doc updates (so future Claude sessions find and use this)

Per the workspace knowledge taxonomy, discoverable guidance lives in **path-scoped
rules** (auto-injected when editing matching files) catalogued in **`docs/MAP.md`** —
NOT in a new always-loaded doc, and NOT in `docs/archive/` (the old tool-sandbox
plan is archived and therefore invisible; that's the discoverability bug this
avoids repeating).

1. **`.claude/rules/react-renderer.md`** — add a short "UI iteration tooling"
   section: when you're doing visual/layout/theme iteration on the renderer, use
   `bash scripts/run-mockup.sh` (full app, fake conversations, no Electron) for the
   fastest loop; use `run-sandbox.sh` only for isolated ToolCard fixtures; use
   `run-dev.sh` when you need real event ordering / PTY / main-process behavior.
   This rule already auto-injects whenever any `src/renderer/` file is edited, so
   it's the highest-leverage place.
2. **`docs/MAP.md`** — add a row for the mockup tooling: entry points
   (`src/renderer/dev/mockup/`, `scripts/run-mockup.sh`), the react-renderer rule,
   guard tests (`mock-shim.test.ts`, `snapshot.test.ts`). `/audit` then verifies
   these paths mechanically.
3. **`scripts/run-mockup.sh` header comment** — self-documenting when-to-use at
   the script itself.
4. **`CLAUDE.md` "ToolCard sandbox" subsection** — update the existing
   `### ToolCard sandbox` block to note the mockup renderer is the primary
   UI-iteration surface and the sandbox is for isolated ToolCard fixtures only.
   (CLAUDE.md is always loaded; keep this to 2–3 lines pointing at the rule.)
5. **Archive note** — when this ships, the old tool-sandbox plan
   (`docs/archive/plans/2026-04-24-tool-card-sandbox.md`) needs no change (it's
   already archived), but the mockup plan itself moves to `docs/archive/` and any
   ROADMAP item flips `[x]` in the same session.

---

## Build order

Single PR against `youcoded/`, worktree per workspace rules. Suggested commit
splits (each independently testable):

1. **`mock-shim.ts` + `install-mock.ts` + Proxy catch-all** — renderer boots in
   mockup mode with empty conversations; Proxy proves the catch-all keeps panels
   from hanging. Parity test lands here.
2. **`conversations/*.json` + hydrate injection** — two fake conversations render
   full history on boot. Snapshot test lands here.
3. **`replayer.ts` + permission round-trip** — live play-through works: send →
   assistant reply → tool running → permission prompt → approve/deny → tool
   result.
4. **Theme real-data wiring + `run-mockup.sh` + doc updates** — theme switching/
   editing works, launcher + rule/MAP/CLAUDE.md updates.

## Verification

- `cd youcoded/desktop && npm test` (parity + snapshot tests pass).
- `npm run build` to confirm the mockup branch is tree-shaken from prod (no
  `mock-shim` in the bundle; `import.meta.env.DEV` gate holds).
- `bash scripts/run-mockup.sh`, open `http://localhost:5223/?mode=mockup`:
  - both fake conversations render history on boot,
  - sending a message in each drives its canned play-through incl. the permission
    prompt round-trip,
  - switching themes re-renders with real tokens; editing a builtin theme JSON +
    HMR reflects live,
  - no 30s hangs from unimplemented channels (Proxy catch-all logs + resolves).
- **Final visual/interactive pass flagged for Destin** per workspace rules — this
  is cursor/timing-sensitive UI; automated verification covers the DOM/test
  assertions, Destin eyeballs the actual play-through feel.

## Open questions (resolve in Commit 1)

- **Exact `HYDRATE_CHAT_STATE` payload shape** — confirm against
  `remote-server.ts`'s sender and the reducer's `HYDRATE_CHAT_STATE` handler; the
  snapshot fixtures must match field-for-field. (If remote-server's shape is the
  canonical one, reuse its TypeScript type for the snapshot test.)
- **Native (local-model) session distinguishing fields** — confirm what marks a
  session as `provider: 'native'` in the hydrate payload so the local-model convo
  surfaces the right UI (model chip, native permission mode).
