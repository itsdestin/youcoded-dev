---
status: draft
date: 2026-07-29
owner: Destin (decisions) / Claude (spec)
supersedes: docs/active/plans/2026-07-20-mockup-browser-renderer.md
implements: ROADMAP.md — "UI Workbench — build every new surface against a mock backend before the backend exists"
---

# UI Workbench — design spec

A dev-only mode that boots the **real YouCoded renderer** in a plain browser tab against a
**fake `window.claude`**, so every menu is reachable, interactive, and stateful without an
Electron main process, a PTY, or a live Claude Code session.

It replaces two things: the `?mode=tool-sandbox` ToolCard sandbox (deleted), and the
hand-written-HTML half of the `ui-mockup` skill (rewritten).

**Repo:** `youcoded/` — desktop renderer only, plus one launcher script in the workspace
`scripts/`. No main-process, Android, or Kotlin changes. `preload.ts` is read *only* as the
contract source for a parity test.

---

## 1. Why

### 1.1 The problem with the current mockup workflow

`ui-mockup` produces a standalone HTML artifact that **hand-reimplements the app**: it
re-declares Tailwind utilities as escaped class names, re-types token values out of
`globals.css`, re-derives `computeOverlayTokens` math, and re-writes the glass cascade. Its
own non-negotiables list is six paragraphs of "copy these values exactly."

That makes fidelity a matter of discipline rather than mechanism. Three consequences:

- **It drifts.** Nothing fails when `globals.css` moves and the skill's value table doesn't.
- **It's expensive.** Every page re-pays the cost of reimplementing the CSS layer.
- **"Copy-paste back into the app" is a translation step**, and translation can silently
  change appearance — which is the one thing the whole workflow exists to prevent.

### 1.2 The new requirement

Destin's decision, 2026-07-29: **all future feature UI is built in the workbench before the
backend behind it exists.** The workbench is not a design-review tool bolted onto the side of
development; it is the front half of development.

That reframes the fidelity problem. If the workbench runs the real components, "the app takes
on the exact format of the mockup" is not a goal to aim at — it is structurally unavoidable,
because there was never a second copy.

### 1.3 What makes this cheap enough to be worth doing

Measured 2026-07-29 against `master` (commands in §10):

- **98 renderer files** reference `window.claude` (non-test).
- `preload.ts` makes **one** `contextBridge.exposeInMainWorld('claude', …)` call, and the
  file contains **345 distinct** `namespace:channel`-shaped string literals (a regex proxy —
  treat as "a few hundred", not an exact channel count).
- The **typed consumer contract already exists**: `renderer/hooks/useIpc.ts:17` declares
  `interface Window { claude: {...} }` with **21 namespaces** and roughly 160 method leaves.

That last fact is the load-bearing one. The mock is written as
`const claude: Window['claude'] = createMock(store)`, so **TypeScript refuses to compile a
mock whose shape doesn't match what the app consumes.** The data layer's fidelity is enforced
by the compiler.

Three caveats, stated rather than hidden:

- **The guarantee is forfeited if the mock is written as `any`.** A shim that returns `any` and
  routes everything through a `Proxy` gets no compiler check at all — the fidelity claim above
  becomes a claim about a test instead. So each hand-written namespace is declared
  `Partial<Window['claude'][ns]>` and only the assembled bridge is cast once at the boundary.
  The `Partial` is what lets the mock implement three of a namespace's twelve methods; the
  three it does implement still have to match.
- Many call sites bypass that type with `(window as any).claude.…` — `ResumeBrowser.tsx` does
  it for `session.browse`, `setFlag`, `setTag`, `setNote`; `App.tsx` does it for `firstRun`
  and `detach`. For those channels the mock is only as honest as its author. Fix them
  opportunistically as each surface is touched; not a big-bang pass.
- A few hundred channels is still too many to hand-stub. §3.2 solves that.

---

## 2. Goals and non-goals

### Goals

1. Every session/model/tag/settings surface is **reachable by clicking** and **stateful** —
   creating a session adds a row, toggling a tag persists, a refused write reverts.
2. Design alternatives coexist as **real components** behind a switcher, comparable at
   identical state, in any theme.
3. Shipping an approved design requires **no porting step**.
4. New UI can be built against channels **that do not exist yet**, and the set of such
   channels is the generated to-do list for the backend work.

### Non-goals (phase 1)

Named so they are deferred rather than forgotten. Each needs its own plan to enter scope.

- **Live conversation play-through.** The 2026-07-20 draft's replayer (send → scripted
  assistant turn → tool events → permission prompt → approve/deny) is a good design and is
  **phase 2**. Phase 1 chat is a frozen fixture transcript.
- **Multi-session background activity** — attention states, status dots changing, sync and
  device states.
- **PTY / terminal view.** Backed by a real byte stream with no renderer-side fallback.
  Genuinely absent, not deferred-cheaply.
- **Network.** Marketplace, theme registry, and social namespaces resolve to canned empties.
  The workbench never opens a socket.
- **Production reachability.** Dev-gated and tree-shaken.

---

## 3. Architecture

```
youcoded/desktop/src/renderer/dev/workbench/
  install-mock.ts        # boot gate; installs the mock as window.claude
  mock-shim.ts           # Proxy catch-all + hand-written channels
  mock-store.ts          # the stateful in-memory store
  mock-only.ts           # MOCK_ONLY registry (channels with no real backend yet)
  WorkbenchToolbar.tsx   # themes / scenarios / latency / viewport
                         # (variants.ts deferred — see §3.4)
  scenarios.ts           # named store seeds (default, empty, no-providers, refused, stress)
  fixtures/
    conversations/*.jsonl# replayed through the real reducer via fixture-loader
    tools/*.jsonl        # the 24 ported ToolSandbox fixtures
    themes/<slug>/       # vendored community packs + their assets
                         #   (Halftone Dimension, Meadow Mist)
    sessions.ts  providers.ts  models.ts  tags.ts  defaults.ts
  mock-contract.test.ts  # parity vs preload + MOCK_ONLY completeness
  fixture-actions.test.ts# every fixture replays into a well-formed timeline
youcoded-dev/scripts/
  run-workbench.sh       # Vite-only launcher
```

### 3.1 Boot and gating

`?mode=workbench`, gated on `import.meta.env.DEV` — the same idiom `tool-sandbox` uses today
(`App.tsx:134` parses `?mode=`, `App.tsx:3482` routes on it), so the whole branch is
statically dead code in production and tree-shakes out.

`index.tsx` already reads `?mode=` at `:24` for the anti-FOUC buddy-window handling. The mock
installs **there**, before React mounts — the same ordering constraint that apply already
respects.

The workbench then renders its frame **directly instead of `<Root/>`**, bypassing the
connection wrapper entirely. This is worth stating because the obvious alternative — install
the mock and let `Root` decide — costs a change to production boot code: `index.tsx:112`'s
`const isElectron = !!(window as any).claude` is captured at module-eval time, so an
asynchronously-installed mock would arrive too late and strand the app on the login screen,
and making it lazy means touching six readers (`:120,:121,:122,:126,:155,:163`) in the file
every launch goes through. Rendering the frame directly needs none of that. `Root` only owns
remote connection state, which the workbench does not have.

For the same reason the workbench frame is **not** a route inside `App.tsx`. Routing it there
would make `WorkbenchFrame` import `App` while `App` lazy-imports `WorkbenchFrame`, and since
the frame renders `<App/>` whose `buddyMode` is still `'workbench'`, it needs a
`workbenchChild` prop threaded through `App`'s signature purely to stop infinite recursion.
Mounting from `index.tsx` removes the cycle, the prop, and the lazy wrapper. `'workbench'`
matches none of `App.tsx`'s existing `buddyMode` branches, so `<App/>` falls through to the
main app unchanged.

`install-mock.ts` **refuses to install if `window.claude` already exists**, so it can never
shadow a real preload bridge or a live remote shim.

Unlike `tool-sandbox`'s bare route, the workbench renders the **normal `<App/>` provider
tree**. That is the point — we want the real chrome.

### 3.2 The mock shim

Two layers:

**Hand-written channels.** Only what the surfaces under design actually exercise. Each is
implemented against the store, so reads reflect writes, and each is typed `Partial<Window['claude'][ns]>`
per §1.3.

**Top-level members are not namespaces and need their own hand-written entries.** `window.claude`
carries callable members directly on the bridge — `getPlatform`, `getHomePath`, `getFavorites`,
`setFavorites`, `off`, `removeAllListeners` — plus the `devLabel` string. A catch-all that
assumes "unknown top-level property = namespace object" makes these uncallable:
`platform.ts:17` guards on `w.claude?.getPlatform` (a Proxy passes the guard), then `:23` calls
it and throws inside an async function, so platform detection never resolves and the rejection
is swallowed. These are hand-written, not caught.

**Proxy catch-all.** Every namespace is wrapped in a `Proxy`; an unimplemented member returns
a function that warns once (mirroring `remote-unsupported.ts`'s announce-once pattern) and
resolves a safe empty value. Unimplemented channels degrade to empty instead of hanging for
30s, and the renderer can call channels the mock has never heard of without breaking.

This is what keeps a few-hundred-channel surface from becoming a stubbing project. Three
details decide whether it helps or hurts:

- **The empty value is `[]`, not `null`.** The dominant consumer shape is
  `const rows = await claude.x.list(); rows.map(…)`, and `null` throws there. `[]` satisfies
  list consumers, reads as "no properties" to object consumers (same as `{}` would), and never
  trips a `res.ok === false` check.
- **No `has` trap.** A trap returning `true` for everything makes `'x' in claude.y` lie.
  Optional chaining does not consult `has`, so the trap buys nothing and costs correctness.
- **Symbols and `then` return `undefined`.** Otherwise a namespace looks thenable and
  `await claude.session` hangs forever instead of resolving to the object.

One consequence to accept knowingly: the catch-all returns a *function*, which is truthy, so
every `if (claude.foo)` capability gate passes. `HeaderBar.tsx:41` (`if (!claude?.window) return null`)
is one — the Proxy is what decides caption buttons render (see §11).

**Latency.** Every channel resolves through a shared delay knob (0ms / 150ms / 2s, set from the
toolbar), defaulting to 150ms. See §4 — this is the failure mode UI-first development actually
introduces, and a synchronous mock hides all of it.

**The `MOCK_ONLY` registry.** The 2026-07-20 draft's maintenance contract said "resist
stubbing namespaces for completeness." That rule was written for a tool whose purpose was
tool-card iteration; it is incompatible with building UI ahead of its backend. It is replaced
by a different principle:

> **The mock is a contract, not a decoration.** Every hand-written channel either mirrors a
> real channel in `preload.ts` (enforced by the parity test) **or** appears in `MOCK_ONLY`
> with the unbuilt feature it belongs to.

Growth is allowed; silent growth is not. A fake can never quietly ship as real, and the
registry doubles as the backend to-do list (§6.2).

### 3.3 The mock store

One in-memory store — sessions, past conversations, providers, model catalog, tags, flags,
notes, session defaults — seeded from a **scenario** (§3.6). Writes mutate it and notify
subscribers.

This matters more than "the list isn't empty." The real components' optimistic-update paths
only exist because writes can fail, and today those paths are invisible. `ResumeBrowser.tsx:428`
reverts an applied tag when `setTag` resolves `{ok:false}`; the `refused` scenario makes that
behaviour something you can watch.

**Writes must fire the real change events, not just mutate the store.** The renderer does not
poll — it re-fetches on `claude.on.sessionCreated`, `on.sessionDestroyed`, `on.sessionRenamed`
and `on.sessionMetaChanged`. A mock that mutates state without emitting those leaves the UI
showing stale data, and "created a session and nothing appeared" reads as a bug in the surface
under design rather than a hole in the mock. Every hand-written write emits its event.

The `refused` scenario applies to **all** writes, including `session.destroy` and
`defaults.set` — a write that quietly succeeds under `refused` is worse than no scenario,
because it teaches the reviewer that the revert path is fine when it was never exercised.

**Chat state is seeded by replaying real reducer actions.** `dev/fixture-loader.ts` already
does exactly this for ToolSandbox: it walks a JSONL fixture and runs each line through the
real `chatReducer` (`fixture-loader.ts:39-123`), so reducer drift surfaces automatically. It
is **extended and kept**, not deleted — it gains `user_message` / `assistant_text` line kinds
and returns the `ChatAction[]` it built, which the workbench dispatches in order on boot.

This supersedes an earlier draft of this section that specced hand-authored
`SerializedChatState` JSON fed through `deserializeChatState`. That shape is ~20 fields per
session including three `Map`s and two `Set`s (`chat-types.ts:606-637`) — not hand-authorable,
and it would have introduced a second state-construction path. Replaying actions is the same
path a live session takes, and the fixture stays a readable JSONL file. It also dissolves the
"confirm the exact `HYDRATE_CHAT_STATE` payload shape" open question the superseded 2026-07-20
draft carried: nothing needs to know that shape.

### 3.4 Variants

`variants.ts` holds `surface → [{ id, label, component }]`. The toolbar renders one switcher
per registered surface.

The rule that keeps it truthful: **the shipping component is never forked to make a variant.**
Variant `current` is a live `import` of the real file, so it cannot drift from what is in the
app. Alternatives are new sibling files (`ResumeBrowser.v2.tsx`).

Picking a winner: delete the losing files, move the winner over the real filename, drop the
registry entry. No porting, because it was always the real component.

**Deferred out of phase 1.** The design above is right; building it now is not. A registry
whose only entry is `current`, wired into no call site, is infrastructure with no user — and
the switcher only works if changing it actually re-renders the app, which means either a full
reload (like the scenario picker) or a context provider. Both decisions are easier to make
against a real second design than in the abstract. Build it the first time there are two
candidates to compare; until then the workbench compares *states*, not *variants*.

### 3.5 Toolbar

Chrome rendered **outside** the app frame so it never overlaps what is being reviewed:

- **Theme switcher** — applied through the real theme engine (`applyThemeToDom`,
  `themes/theme-engine.ts`), not a stylesheet swap. The four builtins are free: `theme-context.tsx:15-18`
  imports `builtin/{light,dark,midnight,creme}.json` directly, no IPC involved. Community packs
  are **not** free — `theme-context.tsx:238-243` loads them via `claude.theme.list()` +
  `claude.theme.readFile(slug)`, so the mock hand-implements those two channels and serves a
  **vendored copy** of the pack JSON from `fixtures/themes/`. No network, consistent with §2.
  Halftone Dimension is the vendored default and stays the standard stress theme: 2–3× radii,
  hot-pink accent, glass popups, `custom_css`, patterned background.
  Note `theme` is one of the namespaces absent from the `useIpc.ts` typed contract, so these
  two channels get no compiler check — they belong in the `(window as any)` caveat of §1.3.

  **Theme assets DO load** (closed 2026-07-29). A pack references its assets relatively, and
  `theme-asset-resolver.ts` turns those into `theme-asset://<slug>/<path>` — an Electron
  protocol a browser tab cannot fetch, so patterns, mascots and wallpapers rendered broken.
  Two changes fixed it. First, `resolveAssetPath` now passes through already-resolved values
  (`data:`, `http(s):`, root-absolute) as its docblock always claimed it did; previously only
  `theme-asset://` was handled, so any pack shipping a data URI or a remote image was silently
  broken **in the real app too**. Second, the mock rewrites each vendored pack's relative paths
  to Vite URLs before the resolver sees them. Both shapes matter: Vite inlines assets under 4KB
  as `data:` URIs and serves larger ones as paths, so a single manifest contains both.
  Two packs ship by default — **Halftone Dimension** (gradient background, SVG pattern, glass,
  hot-pink accent) and **Meadow Mist** (photographic wallpaper, light palette) — chosen to
  exercise different rendering paths rather than to pad the list. Guard:
  `tests/workbench-channels.test.ts`.
- **Scenario picker** — §3.6.
- **Latency picker** — 0ms / 150ms / 2s, applied to every mock channel. §4.
- **Viewport toggle** — pinned to the real 640px breakpoint from `use-narrow-viewport.ts`.
  Not a new number (see the narrow-viewport rule).
- **Variant switchers** — deferred with the registry itself (§3.4).

### 3.6 Scenarios

Named store seeds, selectable live:

| Scenario | What it seeds |
|---|---|
| `default` | A few sessions, two providers, a handful of tags — the happy path |
| `empty` | No sessions, no tags, no past conversations — first-run shape |
| `no-providers` | Native runtime supported but zero ready providers |
| `refused` | Every write resolves `{ok:false}` — exercises optimistic-revert paths |
| `stress` | 200 sessions, 80-character names, missing optional fields (slowness is the latency picker's job, not the seed's) |

`stress` is **first-class, not an afterthought**. See §4.

---

## 4. The fidelity contract

State plainly what the workbench does and does not guarantee, because UI-first development
fails in a specific way if this is left implicit.

**Guaranteed identical:** appearance. Same components, same `globals.css`, same theme engine,
same primitives. There is no second implementation that can disagree.

**NOT guaranteed identical:** behaviour under real data. Real data is longer, emptier, and
errors where a mock succeeds. A design that looks right against three sessions with tidy names
can fall apart at 200 sessions with 80-character names.

**NOT guaranteed identical, and this is the bigger one:** *timing*. Real IPC resolves a tick or
several after the call; a naive mock resolves effectively immediately. That difference is
invisible in the workbench and produces exactly the class of bug UI-first development
introduces — loading states that never render, empty-then-populated flicker, mount-order races,
spinners that were never seen because nothing ever took long enough to show one. Data realism
is a design problem you can spot by looking; timing realism is a correctness problem you
cannot. Hence the latency picker in §3.5, defaulting to 150ms rather than 0.

The mitigation is those two knobs plus a standing rule: **a surface is not approved until it
has been looked at under `stress` and `empty` as well as `default`, and at a non-zero
latency.**

---

## 5. Deleting the ToolCard sandbox

Destin's call, 2026-07-29: ToolSandbox goes away rather than coexisting.

Its job is rendering 24 `.jsonl` fixtures as real `<ToolCard>`s with `expanded: true` forced.
A hydrate snapshot can carry tool calls in every status, so the fixtures port into the
workbench as a **tool-gallery surface** — which is the "catalog on the side" as a phase-1
deliverable rather than a follow-up.

Deletion surface (measured 2026-07-29):

- `renderer/dev/ToolSandbox.tsx` — deleted
- `renderer/dev/fixture-loader.ts` + `fixture-loader.test.ts` — **kept and extended**, moved
  under `workbench/`. It is the reducer-replay engine (§3.3), not sandbox-specific scaffolding
- `renderer/dev/fixtures/*.jsonl` — 24 files (ported, not lost)
- `App.tsx:109–116` (lazy route) and `App.tsx:3480–3483` (the mode gate)
- Stale comments at `ToolCard.tsx:719` and `AssistantTurnBubble.tsx:109`
- `scripts/run-sandbox.sh`
- The `### ToolCard sandbox` block in workspace `CLAUDE.md`
- `main.ts:653–659`'s `YOUCODED_DEV_URL` comment mentions `?mode=tool-sandbox` — retarget,
  don't remove; the env var itself stays and is used by `run-workbench.sh`

Archived plans/specs referencing it are history and are left alone.

---

## 6. Workflow

### 6.1 Iteration

`bash scripts/run-workbench.sh` runs **only Vite** (`npm run dev:renderer`) — no Electron, no
main process. It uses **offset 60 → port 5233**, deliberately *not* `run-dev.sh`'s default
offset 50 → 5223 (`run-dev.sh:22,46`): the workbench has to coexist with a running dev
instance, and reusing that port guarantees it can't. It prints
`http://localhost:5233/?mode=workbench`; Destin opens it in a local browser. Binding beyond
localhost is out of scope — the workbench is not for phone or remote review.

Claude edits real components in a worktree; Vite HMR repaints in ~1s; Destin looks and
responds. Per the workspace rule, Claude does **not** script interactive verification — one-shot
screenshots via `scripts/cdp-eval.mjs` for layout self-checks are fine, but the interactive
pass is Destin's.

**Cost of browser-only:** Electron-only surfaces are absent. This bites immediately —
`detachAvailable` gates the "Launch in New Window" toggle in *both* `SessionStrip.tsx:1068`
and `ResumeBrowser.tsx:584`, and both forms are under redesign. The mock must therefore
expose `detach.openDetached` as a function deliberately, or that control silently vanishes
from the surfaces being designed.

### 6.2 Finalizing

1. **Pick the variant** — delete losers, winner takes the real filename, drop the registry entry.
2. **Promote the mock channels** — every `MOCK_ONLY` channel the winning UI depends on gets a
   real main handler + `preload.ts` + `remote-shim.ts` + `SessionService.kt`, guarded by
   `ipc-channels.test.ts`, then leaves the registry. **This list is the backend to-do,
   generated by the design rather than guessed at.**
3. **Merge.** Appearance cannot shift, because nothing was copied.

---

## 7. The `ui-mockup` skill

Rewritten in place, not deleted — roughly half of it is still correct.

**Removed** (the rendering half): hand-reimplemented Tailwind utilities, the token value
table, `computeOverlayTokens` recipes, the glass-cascade rules, artifact publishing. All of it
is now supplied by running the real CSS.

**Kept** (the process half — what actually worked across the 2026-07-16 sessions):

- Numbered changes with a one-line what/why, a change-ledger table, and approve-by-number.
  Never renumber an approved change; new feedback gets new numbers.
- Before/after staged on **real app surfaces**, not abstract component grids.
- Halftone Dimension as the standard stress theme.
- Explicit fidelity notes — never let an approximation pass silently.
- Decisions captured into a spec afterward, never left in chat.
- On ambiguous feedback, prefer the smallest literal reading and ask.

---

## 8. Guard tests

| Test | Asserts |
|---|---|
| `mock-contract.test.ts` | Every hand-written mock channel either exists in `preload.ts` **under its own namespace**, or is listed in `MOCK_ONLY`. Also fails on a `MOCK_ONLY` entry that has since gained a real preload channel (stale registry). Matching must be namespace-scoped — a bare `\blist\s*:` regex over the whole file matches `session`, `tags`, `providers` and `theme` alike, so a wrong namespace passes and the test reads green while proving nothing. `preload.ts` puts namespaces at indent 2 and leaves at indent 4, so scoping is a brace-scan, not a heuristic. |
| the compiler (`tsc --noEmit`) | The primary parity check for the 21 namespaces in `useIpc.ts`, via the `Partial<Window['claude'][ns]>` annotations (§1.3). The test above exists for what the compiler cannot see: `theme` and the other untyped namespaces, and `MOCK_ONLY` staleness. |
| `fixture-actions.test.ts` | Every conversation and tool fixture replays through the real `chatReducer` into a well-formed timeline — no dropped lines, no tool left in a non-terminal state unless the fixture says so. Inherits `fixture-loader.test.ts`'s existing cases. |
| existing `ipc-channels.test.ts` | Unchanged. The workbench is deliberately **not** added as a fourth parity surface — it is allowed to be a superset during design; `MOCK_ONLY` is what keeps that honest. |

When these fail, the fix is updating the mock — not loosening the test.

---

## 9. Phase 1 deliverables

1. `dev/workbench/` — `install-mock.ts`, `mock-shim.ts` (Proxy + hand-written), `mock-store.ts`,
   `mock-only.ts`
2. Fixtures — 2 conversation hydrate snapshots, sessions/providers/models/tags/defaults, the
   24 ported tool fixtures
3. `scenarios.ts` — the five scenarios in §3.6, including `stress`
4. `WorkbenchToolbar.tsx` — theme, scenario, latency, viewport. (`variants.ts` is deferred per §3.4.)
5. `scripts/run-workbench.sh`
6. The two guard tests in §8
7. ToolSandbox deletion per §5
8. Doc updates — a "UI iteration tooling" section in `.claude/rules/react-renderer.md` (it
   auto-injects on every `src/renderer/` edit, so it is the highest-leverage home), a
   `docs/MAP.md` row, and replacing `CLAUDE.md`'s `### ToolCard sandbox` block
9. Rewritten `.claude/skills/ui-mockup/SKILL.md` per §7
10. The ROADMAP entry, which does not exist today

---

## 10. Verification of the claims in this spec

Numbers in §1.3 and §5 were measured 2026-07-29 against `youcoded` `master`:

```bash
cd youcoded/desktop/src
rg -l "window\.claude|window as any\)\.claude" renderer/ --glob '!*.test.*' | wc -l   # 98
rg -c "^      [a-zA-Z]+: \{" renderer/hooks/useIpc.ts                                 # 21
rg -o "'[a-z][a-z0-9-]*:[a-z0-9:-]+'" main/preload.ts | sort -u | wc -l               # 345
rg -n "exposeInMainWorld" main/preload.ts                                             # 1 call
ls renderer/dev/fixtures/*.jsonl | wc -l                                              # 24
```

The 345 figure is a **regex proxy** for channel-shaped string literals, not a verified channel
count; it is cited only to establish "too many to hand-stub." The 21-namespace figure is
exact and is the number that matters, since it is the contract the mock implements.

The 2026-07-20 draft plan cited "~236 IPC channels across ~25 namespaces" and "90 renderer
files"; those numbers were not reproduced by the commands above and are superseded.

---

## 11. Open questions (resolve during implementation)

- ~~**Exact `HYDRATE_CHAT_STATE` payload shape.**~~ **RESOLVED 2026-07-29** — nothing needs
  it; fixtures replay actions instead (§3.3).
- ~~**Native-session distinguishing fields.**~~ **RESOLVED 2026-07-29** — it is not a chat-state
  concern at all. `SessionInfo.provider: SessionProvider` plus optional `harnessId`
  (`shared/types.ts:67-82`) is what marks a native session; that lives in the mock store's
  session list, not in the transcript.
- **Where the toolbar mounts.** It must sit outside the app frame, but `<App/>` fills the
  viewport and `chrome-glass` owns the frame chrome. Likely a fixed-position bar that shrinks
  the app's container rather than overlaying it — overlaying would falsify the space-aware
  header layout (`packSessions()` measures `clientWidth`). Confirm when the toolbar is built.
- ~~**Whether the workbench should render window caption buttons.**~~ **RESOLVED 2026-07-29 —
  yes, they render.** This was never going to stay open: `HeaderBar.tsx:41` gates on
  `if (!claude?.window) return null`, and the Proxy catch-all makes `claude.window` truthy, so
  the buttons render whether or not anyone decides they should. That is also the right answer —
  `packSessions()` is space-aware, so omitting them would change the measured width and
  falsify every header layout reviewed in the workbench. Clicking one warns and no-ops.
  Recorded here because a behaviour the Proxy decides by accident is exactly the kind that
  should be written down before someone "fixes" it.
