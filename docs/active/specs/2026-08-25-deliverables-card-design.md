---
title: Deliverables card — SendUserFile in chat, natively mirrored
status: active
date: 2026-08-25
reviewed: 2026-08-25
plan: docs/active/plans/2026-08-25-deliverables-card.md
owner: Destin
branch: youcoded feat/send-user-file-card (worktree `worktrees/send-user-file`)
---

# Deliverables card

## 1. What this is

Claude Code ships a built-in tool, `SendUserFile`, whose job is to hand the user a
finished file — a report, a screenshot, a built page — instead of mentioning its path
in prose. YouCoded did not know the tool existed: the call fell through to the raw
JSON tool card, and the file never reached the file panel.

This feature does two things:

1. **Renders `SendUserFile` as a "Deliverables" card** inside the assistant's bubble —
   previews you can look at and click, kept visually separate from the tool cards.
2. **Adds the same tool to the native harness**, under the same name and inputs, so
   local and OpenRouter models can hand files over the same way.

The card is deliberately **not** called "Files": files already appear in chat as
filepath pills and Write/Edit/Read tool cards without being deliverables, and a card
named "Files" would blur that line.

## 2. The card (approved in the workbench, 2026-08-25)

Built in the UI Workbench against the real renderer and signed off through two
compare rounds (`dev/workbench/compare/registry.tsx` → surface `sent-files-card`,
pick R1·A → R2·D + fades + collapse). The approved UI is final; the backend is
designed around it. Everything in §2 is already implemented on the branch
(`DeliverablesCard.tsx`, `useOpenFilepath.ts`, the `AssistantTurnBubble` hoist)
except the two items marked **fix**.

### 2.1 Placement and identity

- **One card per bubble, last in the bubble**, after that bubble's tool cards and
  before the Skill-annotation footer. `SendUserFile` calls are removed from their
  tool group and hoisted into the card, the same mechanism Skill cards use
  (`AssistantTurnBubble` → `ToolGroupInline` filter + `collectBubbleSentFiles`).
- Several `SendUserFile` calls in one bubble merge into one card: files concatenate
  in call order, each keeping its own call's status.
- **Lifted card** (`bg-well`, hairline `border-edge`) with a header line:
  document glyph · `|` separator · **Deliverables** · count · caption
  (right-aligned, truncated) · chevron. The separator is the SAME element a tool
  card header uses between its status icon and label
  (`<span className="text-fg-faint text-xs select-none">|</span>`, `ToolCard.tsx`)
  — Destin asked for it on 2026-08-25 so the two headers read alike. The lifted
  background, the bold label and the previews are what keep it distinct from a
  collapsed tool group, which sits flat on the bubble with a status glyph and a
  "N tools (…)" line.
- A bubble containing only a Deliverables card gets prose padding, not the tight
  tools-only padding (`hasContent` counts the card).

### 2.2 Body — filmstrip

- One row of fixed-width preview tiles that scrolls sideways: **224px** tiles on
  wide viewports, **176px** with shorter previews on narrow ones
  (`useNarrowViewport`, the app's single 640px boundary). No column grid; the
  same strip is used on phones, where a sideways swipe is natural.
- **Tile** = preview (112px tall wide / 64px narrow) over filename + folder + an
  arrow-only Open glyph. Project files show the project-relative folder
  (`docs/reports/`); external files show the absolute folder (`/tmp/scratch/`).
  The whole tile is the click target; `data-file-path` (absolute) feeds the
  existing chat right-click menu.
- **Preview is `ArtifactThumbnail`** — the one preview mechanism app-wide: image
  bytes over `artifacts:read-binary`, first ~8 lines of markdown/text, a scaled-down
  render of an HTML page, and a large extension glyph (PDF, DOCX, code…) for
  everything else. Nothing in the card re-implements a thumbnail.
- **Scroll-aware fades**: a right-edge fade only while something is hidden past
  the right edge; a left-edge fade only once a tile has slid under the left edge.
  A strip that fits shows neither. Measured on scroll and on resize
  (`useEdgeOverflow`), painted with the card's own `--well` so it reads as the
  card in every theme.

### 2.3 Collapse

- Header click toggles the body. **Collapsed by default** — Destin's call on
  2026-08-25, made after seeing the card on a real screen during Checkpoint 2.5.
  This supersedes the earlier draft decision of open-by-default (whose argument
  was "the files ARE the reply"); the card now sits like the tool cards around
  it until the user opens it. Collapsed it is one line:
  "Deliverables 4 · caption ▾".
- Collapse state is local to the card (not persisted), like a tool card.
- The initial state is seeded from the current Ctrl+O mode
  (`useState(() => getInitialExpanded(false))`), exactly as `ToolCard` does, so a
  card mounting during an active expand-all still comes up open and one mounting
  after a collapse-all stays closed. Ctrl+O keeps working in both directions.

### 2.4 States

- **Sending** (tool still running): preview dimmed with "Sending…" — a
  finished-looking card must not appear before the file is confirmed.
- **Failed** (tool returned an error): tile dimmed at 70% with "Couldn't send" over
  the preview. The tile stays clickable so the user can still try the path.
  **Fix:** the reason is the tool's own error text, never a guess — the branch
  hard-codes "not found", which is a lie when the path is a folder or unreadable
  (`docs/error-message-standards.md`). The tool's text is the tile's tooltip and,
  for each failed call, one line under the strip in the same slot the stacked
  captions use.
- Caption: one caption rides the header; if merged calls carry several, they
  stack under the strip so none is lost.

### 2.5 Click = open

A tile opens the file panel through `useOpenFilepath(sessionId)` — the logic
extracted from `FilepathToken` so a pill and a tile can never disagree: session
artifact list → whole project (tracked + on-disk) → artifactify. Untracked files
(a scratchpad chart) therefore still open. Invariant kept: **a file clicked in chat
always opens the artifact viewer, never Project View.**

## 3. Auto-open (`display: "render"`)

Auto-open is the one behaviour that changes what is on screen without a click, so
it is the most conservative part of the design. It lives entirely in the renderer
and applies identically to Claude Code and native sessions.

### 3.1 When it fires

A successful `SendUserFile` result opens the file panel to the call's **first**
file only if **all** of these hold:

1. `input.display === 'render'` — explicit. An omitted `display` is treated as
   `attach`. This deliberately deviates from Claude Code's own contract (omitted =
   "client decides by type"), because a panel opening unbidden is the failure
   mode that costs trust and a card the user can click is the low-regret default.
   Practical consequence to decide knowingly: Claude Code's own tool text tells
   Claude to *leave `display` unset* and let the client pick by file type, so
   under this rule most Claude Code deliveries show the card and never open the
   panel. Revisit after living with it (ROADMAP); Checkpoint 2.5 is the place.
2. Electron desktop only (`getPlatform() === 'electron'` — not Android, not a
   remote browser) and not a narrow viewport.
3. The event belongs to the **focused** conversation (`sessionId` state in
   `App.tsx`).
4. The result is **fresh** — recorded less than 60 seconds ago. This is the
   live-vs-history gate. The renderer has no per-event "replayed" flag. It does
   have a `replay-complete` barrier after an explicit history load
   (`ipc-handlers.ts:2519`), but that does not cover the Claude Code watcher's
   own re-read of the whole transcript from offset 0 on every start
   (`transcript-watcher.ts:385`), which is emitted as live events; and the
   session's thinking flag toggles during replay too. What *is* reliable is
   when the result was recorded: native events keep their original `timestamp`
   through replay, and Claude Code results carry the JSONL line's own time as
   `data.recordedAt` (the watcher's `timestamp` is stamped at parse time, so it
   cannot be used). A result with no recorded time is treated as history.
5. **First honored render this assistant turn.** One auto-open per turn, both
   runtimes: later `render` calls in the same reply still show in the card, they
   just don't move the panel. This is the rule the native harness was going to
   enforce with per-turn state and a flag on the result event; doing it here
   means one rule in one place, and it also stops a Claude Code reply with three
   `render` calls from yanking the panel between files.
6. The dirty-editor guard passes (`guardDirtyEditor`, the same guard a session
   switch goes through): the file pane is an editor, and auto-open must never
   switch away from unsaved edits.
7. **Never twice for the same result.** The module remembers every `toolUseId`
   it has honored (bounded, for the life of the renderer). A session switch
   replays the whole conversation — including the turn boundary that resets
   rule 5 — so without this, switching away and back within a minute of a
   render would open the panel again. With it, only an app *relaunch* inside
   the window can re-open a result, once (§8).

Opening goes through the same `useOpenFilepath` path as a click.

### 3.2 Where it lives

A small React-free module next to the tracker (`state/deliverable-auto-open.ts`),
fed tool-result transcript events by `App.tsx` the way `createArtifactToolUseTracker`
is, with the seven conditions as injected predicates so every one is unit-testable.
It dispatches nothing itself; it calls the injected open function.

## 4. File panel tracking

`artifact-tool-use-tracker.ts` adds `SendUserFile` to its watched tools.

### 4.1 Record on success, not on call

The tracker today reacts to `tool-use` events only. For `SendUserFile` it holds the
call's file list keyed by `toolUseId` and appends when the **non-error**
`tool-result` arrives; an error result drops the pending entry. Without this, a
typo'd path becomes a tracked "delivered" artifact of a file that does not exist
(the tracker cannot check disk). During "Sending…" the tile is dimmed anyway, so
nothing visible is lost by waiting.

Every file in the call is appended separately (one `appendVersion` per path,
same `toolUseId`). Main's replay dedupe is per artifact record on
`(sessionId, toolUseId)`, so a four-file call yields four records, and a
replayed transcript adds nothing (verified: `artifact-store.ts` dedupe loop).

### 4.2 The `delivered` version type

The recorded version type is a new **`delivered`** (author `agent`):

- `VersionType` in `shared/artifacts/types.ts` gains it; the Kotlin mirror is a
  `String` typealias (`SidecarSchema.kt`, `ArtifactStore.kt`) — no enum, no
  parse risk. **But Android is not comment-only:** the renderer tracker runs on
  the phone too and reaches Kotlin `appendVersion` via `artifacts:append-version`
  (`SessionService.kt:3552`), and `ArtifactStore.kt:216` bumps `lastModified`
  for *every* type — it never mirrored desktop's `read` exemption (verified
  2026-08-25). The guard becomes `type != "read" && type != "delivered"` on
  both platforms; otherwise a delivery from the phone jumps an old file to the
  top of "recently modified" and the synced sidecar disagrees across devices.
  An app version without the change labels a delivered-only file "created" in
  the drawer; cosmetic, accepted.
- The `'read'` sweep (`rg -n "'read'" desktop/src app/src` + the `"read"` form,
  2026-08-25): **28 hits, 7 of them live logic or type unions** — the union
  itself, the tracker's two unions and its ternary, `ipc-handlers.ts` and
  `artifact-store.ts` `AppendVersionInput`, the drawer's `statusInfo`, and
  `visible-artifacts.ts` rule 3. Each gets an explicit `delivered` branch; the
  remaining 21 are comments, artifactify literals and the pin path, untouched.
- **Does not bump `lastModified`** (`artifact-store.ts:269` treats it like
  `read`): handing over an old file is not a modification and must not jump it
  to the top of "recently modified".
- **Session Drawer** labels a delivered-only file "delivered" (the plain-word
  status, like viewed/edited/created).
- **Visibility:** `delivered` is non-read, so an **in-project** file that only a
  script produced (never Write/Edit) becomes visible in Project View's Files
  tab. **External** files (a `/tmp` chart) stay Session-Drawer-only, exactly as
  every other external does — the artifacts rule, not this feature's to change.
- Thumbnails: without a tracked record the tile shows only the extension glyph
  for text/HTML (the thumbnail fetches content by record). Recording at result
  time is what gives untracked deliverables a real preview.

## 5. Fallback surfaces

- `friendlyToolDisplay` gains a `SendUserFile` case ("Sent a file" / "Sent N
  files" + basenames) — reaches the main chat, the specialist timeline and the
  workbench tool gallery.
- `ToolBody` renders the card for a bare `SendUserFile` ToolCard, so the tool
  gallery never shows raw JSON for it.
- The buddy window's `CompactToolStrip` prints the raw tool name for **every**
  tool today and does not use `friendlyToolDisplay`; it will say `SendUserFile`
  like it says `Bash`. Unchanged here (ROADMAP note); the buddy window's bubble
  feed does render the card via `AssistantTurnBubble` (click is a no-op there —
  no `ArtifactProvider`).

## 6. Native mirror tool

### 6.1 Registration

- `main/harness/tools/send-user-file.ts`, wrapped with `defineTool`, added to
  `CORE_TOOLS` (`tools/index.ts`) and `NATIVE_TOOL_NAMES`
  (`shared/harness-manifest.ts`; its header comment says "ten-tool suite" →
  eleven). `tests/tool-registry-manifest.test.ts` enforces the pair **and** sweeps
  every core tool for a static `moreHint`; `SendUserFile` joins `BOUNDS_EXEMPT`
  there with the Write/Edit reason (one-line confirmation, never file output).
- Name and inputs are Claude Code's: `files: string[]` (≥1), `caption?: string`,
  `status?: 'normal' | 'proactive'` (accepted, ignored), `display?: 'render' |
  'attach'` (accepted, passed through — the renderer decides, §3).
- Permission: allowed in every mode (`rulesForMode` always-allowed list). It
  reads nothing and writes nothing — it only tells the renderer which files the
  user should look at, and the viewer's own read guards apply when they open.
  `permissionSubject` returns `undefined`, which skips the cwd path jail; that
  is what lets a `/tmp` chart through, and is deliberate.
- Gating: none beyond `supportsTools` — on for every native session.
- **Specialists do not get it.** Builtin rosters list their tools explicitly
  (`specialists/builtins.ts`) and none names it; a specialist reports to its
  parent, not to the user. Leave it that way.
- **Android:** native tools execute only in the Electron main process; `app/src`
  has no tool executor (verified `rg` 2026-08-25). Nothing to mirror.

### 6.2 Behaviour (stateless)

- Resolve each path against the session cwd (`resolveP`). Each must exist and be a
  regular file. Any bad path fails the **whole call** with one error naming every
  bad path **and its reason** — `does not exist`, `is a directory`, or, for a
  leading `~`, `"~" is not expanded here; use an absolute path` — so the model
  fixes it rather than half-delivering, and never reads "does not exist" about a
  file that exists. Symlinks resolve; nothing is read into the result.
- Success text: `Sent N file(s) to the user.` No per-turn state, no flag on the
  result event; the one-per-turn rule is the renderer's (§3.1 #5).
- No size cap in the tool — the preview and viewer have their own.
- Tool description (what the model reads): send finished deliverables the user
  will want to look at — reports, mockups, screenshots, built pages — not scratch
  or intermediate files; don't re-send an unchanged file; `display: 'render'`
  asks to show one file immediately and **only the first such request in a reply
  is honored**; everything else attaches. The text lives in the tool file; no
  description-budget test exists (verified 2026-08-25), so its length is a
  review item.

## 7. Claude Code guidance

Destin's global `~/.claude/CLAUDE.md` "Environment Notes" line currently says
"providing the full filepath in chat is sufficient to create a viewable artifact".
Proposed replacement, to be applied **when the feature merges** (earlier would
tell Claude to use a tool the app still renders as raw JSON):

> Hand finished deliverables to the user with `SendUserFile` — they render as a
> Deliverables card with previews in the app. Use `display: "render"` only for
> the one file the user should look at right now. Mention paths in prose for
> everything else.

The line is Destin's to edit.

## 8. Known limits (accepted)

- **Remote access** (phone browser → desktop host): neither `artifacts:get` nor
  `artifacts:read-binary` is bridged (ROADMAP "Most `window.claude` channels are
  not bridged to remote access"), so tiles show the extension glyph and Open
  shows the existing "not available via remote access yet" notice. Pre-existing
  gap; not this feature's to fix.
- PDF / DOCX / XLSX / code previews are the extension glyph, as in the file
  panel's own grid.
- `status: "proactive"` is ignored. It could later drive the app's existing
  needs-attention signal (ROADMAP).
- An app **relaunch** within a minute of a `render` result opens it once more
  (the honored-`toolUseId` memory, §3.1 #7, does not survive the process). A
  session switch or re-dock never re-opens.

## 9. Testing

Renderer (vitest, jsdom; `useNarrowViewport` needs a `matchMedia` stub, see
`ProjectHero.test.tsx`):
- card renders last in the bubble; its calls are absent from the tool group;
  bubble-only-card gets prose padding;
- merge of two calls (files concatenated, captions stacked);
- narrow vs wide tile width; fades track `scrollLeft`/`scrollWidth`;
- collapse toggle, open by default, seeds from Ctrl+O mode, Ctrl+O applies;
- running / failed tile states; failed tile shows the tool's error text, never a
  fixed string;
- auto-open: each of the seven conditions blocks alone; fires once per reply; opens
  the first file; never for `attach` or omitted `display`; **a replayed result
  (old `recordedAt`, old native `timestamp`, or none) never opens; the same
  `toolUseId` never opens twice even while fresh**;
- transcript watcher: `tool-result` events carry the JSONL line's `recordedAt`,
  `0` when the line has none;
- `friendlyToolDisplay` and `ToolBody` cases;
- tracker: appends one `delivered` version per file on a successful result,
  nothing on an error result, nothing while pending;
- store: `delivered` does not bump `lastModified` — desktop test **and** the
  Kotlin `ArtifactStoreTest` mirror; `visible-artifacts` shows a
  delivered-only internal, hides a delivered-only external; drawer says
  "delivered".

Harness:
- registry/manifest parity + `BOUNDS_EXEMPT` (existing test);
- missing file, directory, `~` path → one error naming each path with its
  reason, nothing sent;
- success text; `display` passed through untouched;
- allowed in every permission mode; no builtin specialist lists it.

Workbench: `node scripts/workbench-boot-check.mjs` after the mock changes (done —
12 routes mount); `tests/workbench-mock-contract.test.ts` covers the added
`artifacts.readBinary` mirror.

**Harness evaluator:** this adds a native tool, so a paid eval run
(`test-engine/harness-eval.mjs`, ~$0.25/cell) is *offered*, not run — Destin
decides.

## 10. Checkpoints for Destin

The card is approved; these are the things he will *see* that no compare round
showed. Each is a workbench sheet or a 30-second look, before the backend task
that depends on it:

1. **Narrow width** (176px tiles) — workbench, narrow toggle.
2. **Failed tile with real error text** (§2.4 fix) — workbench fixture
   `senduserfile-failed.jsonl`.
3. **Session Drawer "delivered" label** and the Files-tab consequence — workbench
   fixture with a `delivered` version.
4. **Auto-open** — **cannot** be mocked in the workbench: its fixtures feed the
   chat reducer directly (`dev/workbench/fixture-loader.ts`) and never emit
   `transcript:event`, so nothing hanging off that channel runs there. Instead,
   as soon as the renderer side lands (plan Task 7, *before* the native tool),
   Destin eyeballs it in a dev instance (`run-dev.sh`) with a **Claude Code**
   session — Claude Code's `SendUserFile` exists today. This is the steering
   point for the §12 calls (first file, omitted = attach, 60 s). Repeated with a
   native session after the tool lands. Timing and focus are interactive, not
   a rig's job.

## 11. Out of scope

- Bridging `artifacts:*` over remote access.
- Richer previews for PDF/office/code.
- A "Deliverables" section in Project View or the session drawer — the
  `delivered` version type makes that possible later without new tracking.
- Friendly labels in the buddy window's compact strip (all tools).
- `proactive` → needs-attention signal.

## 12. Decisions from the 2026-08-25 review

Calls made without a separate sign-off; each is one line to veto. **These are
not approved UI** — the card (§2) is. They stay vetoable until plan Task 6
starts, and Checkpoint 2.5 (§10 item 4) is where they are first felt on a real
screen. R2, R3, R4 and R6 differ from the reviewed draft (which said *last*
file, "effective display", and record-on-call).

| # | Decision | Why |
|---|---|---|
| R1 | One-render-per-turn is enforced in the **renderer**, for both runtimes; the native tool is stateless | one rule in one place; the harness version needed per-turn state plus a result-event flag threaded through five files; also fixes CC multi-render panel-yanking |
| R2 | Omitted `display` = attach (not "render by type") | a click is low-regret; an unbidden panel is not; consequence: most Claude Code deliveries won't auto-open (§3.1 #1); revisit |
| R3 | Auto-open opens the **first** file, not the last (draft said last) | "the report, then appendices" |
| R4 | Live-vs-history gate is "result recorded < 60 s ago" (`recordedAt` on CC events; native keeps its `timestamp`) | no per-event replay flag exists; the `replay-complete` barrier misses the watcher's offset-0 re-read; `isThinking` toggles during replay — verified at plan time; recorded time is the one honest signal |
| R5 | Auto-open reuses the dirty-editor guard | the pane is an editor |
| R6 | Tracker records on the successful result, not the call | no ghost records for typo'd paths |
| R7 | `delivered` kept; does not bump `lastModified` | drawer label + Files-tab visibility for script-made files; delivery ≠ modification |
| R8 | Failed tile shows the tool's own error text | no-misleading-errors rule |
| R9 | Specialists excluded; Android has no *tool* to mirror — but its artifact store needs the `lastModified` guard (§4.2) | verified rosters / `rg`; the tracker runs on Android |
| R10 | Buddy strip left showing raw names | pre-existing for every tool |
| R11 | Auto-open remembers honored `toolUseId`s (review 2026-08-25) | a session switch replays the turn boundary and the result; without memory the panel re-opened on every switch-back inside the window |

## 13. Change ledger (workbench review)

| # | Change | Decision |
|---|---|---|
| 1 | Card inside the bubble; calls hoisted out of the tool group | approved (placement revised by 9) |
| 2 | 2-col / 1-col grid | superseded by 11 |
| 3 | Tile = preview + name + folder + Open | approved; Open reduced to arrow (11) |
| 4 | Preview = `ArtifactThumbnail` | approved |
| 5 | Caption under the grid | superseded by 10 (header) |
| 6 | Click opens via the shared pill path | approved |
| 7 | Sending / failed tile states | approved |
| 8 | External folders show the absolute path | approved |
| 9 | Card is **last** in the bubble, after tool cards | approved |
| 10 | Lifted "Deliverables · N" card, caption in header; multi-call merge | approved (label renamed from "Files" — Destin) |
| 11 | Filmstrip body, 224/176px tiles, arrow-only Open | approved (R2·D) |
| 12 | Scroll-aware left/right fades | approved (Destin's addition) |
| 13 | Collapsible like a tool card, open by default, Ctrl+O applies | approved (Destin's addition) |
| — | R1·B accent-edge collapsible, R1·C bare filmstrip, R2·E wrapped names, R2·F no fade | rejected — decision: A then D |
