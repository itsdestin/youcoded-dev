---
title: Deliverables card — SendUserFile in chat, natively mirrored
status: draft
date: 2026-08-25
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
   local and OpenRouter models can hand files over the same way — with one extra rule
   (one *displayed* file per turn) that Claude Code's version doesn't have.

The card is deliberately **not** called "Files": files already appear in chat as
filepath pills and Write/Edit/Read tool cards without being deliverables, and a card
named "Files" would blur that line.

## 2. The card (approved in the workbench, 2026-08-25)

Built in the UI Workbench against the real renderer and signed off through two
compare rounds (`dev/workbench/compare/registry.tsx` → surface `sent-files-card`,
pick R1·A → R2·D + fades + collapse). The approved UI is final; the backend is
designed around it.

### 2.1 Placement and identity

- **One card per bubble, last in the bubble**, after that bubble's tool cards and
  before the Skill-annotation footer. `SendUserFile` calls are removed from their
  tool group and hoisted into the card, the same mechanism Skill cards use
  (`AssistantTurnBubble` → `ToolGroupInline` filter + `collectBubbleSentFiles`).
- Several `SendUserFile` calls in one bubble merge into one card: files concatenate
  in call order, each keeping its own call's status.
- **Lifted card** (`bg-well`, hairline `border-edge`) with a header line:
  document glyph · **Deliverables** · count · caption (right-aligned, truncated) ·
  chevron. The lifted background, the bold label and the previews are what keep it
  distinct from a collapsed tool group, which sits flat on the bubble with a
  status glyph and a "N tools (…)" line.
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

- Header click toggles the body. **Open by default** — the files are the reply —
  but Ctrl+O expand/collapse-all applies, so the card behaves like the tool cards
  around it once the user starts managing space. Collapsed it is one line:
  "Deliverables 4 · caption ▾".
- Collapse state is local to the card (not persisted), like a tool card.

### 2.4 States

- **Sending** (tool still running / awaiting approval): preview dimmed with
  "Sending…" — a finished-looking card must not appear before the file is
  confirmed.
- **Failed** (tool returned an error): tile dimmed at 70% with
  "Couldn't send — not found" over the preview. The tile stays clickable so the
  user can still try the path.
- Caption: one caption rides the header; if merged calls carry several, they
  stack under the strip so none is lost.

### 2.5 Click = open

A tile opens the file panel through `useOpenFilepath(sessionId)` — the logic
extracted from `FilepathToken` so a pill and a tile can never disagree: session
artifact list → whole project (tracked + on-disk) → artifactify. Untracked files
(a scratchpad chart) therefore still open. Invariant kept: **a file clicked in chat
always opens the artifact viewer, never Project View.**

### 2.6 `display: "render"` → auto-open

When a successful `SendUserFile` result arrives whose effective display is `render`:

- open the file panel to the **last** file of that call, **only** if all hold:
  desktop (not `isAndroid()`, not a narrow viewport), the event belongs to the
  **focused** conversation, and the event is **live** (never during a transcript
  replay / history load);
- otherwise do nothing beyond showing the card. `attach` (or no hint) never opens
  anything.

Opening goes through the same `useOpenFilepath` path as a click. "Effective
display" is `input.display` for Claude Code sessions; for native sessions it is
what the harness actually honored (§3.3), carried on the tool-result event as
`deliverableRendered: boolean` so a downgraded call cannot auto-open.

### 2.7 File panel tracking

`artifact-tool-use-tracker.ts` adds `SendUserFile` to its watched tools and records
every file in the call as a session artifact the moment the call arrives (internal
or external per `resolveTrackedPath`, deduped on `(sessionId, toolUseId)` like the
others). The recorded version type is a new **`delivered`** (author `agent`):

- it is **non-read**, so a chart a Bash script produced and then delivered shows up
  in Project View's Files tab, which hides read-only internals;
- the Session Drawer labels it "Delivered";
- `VersionEvent.type` gains the value in `shared/artifacts/types.ts` **and** the
  Kotlin mirror, and every site that special-cases `'read'` is swept (`rg
  "'read'" desktop/src app/src` at plan time, count recorded in the plan) so none
  silently treats `delivered` as a read.

Without this, the card's tiles for untracked files show only the extension glyph
until clicked (the thumbnail needs a tracked record to fetch text/HTML content).

### 2.8 Fallback surfaces

`friendlyToolDisplay` gains a `SendUserFile` case ("Sent a file" / "Sent N files" +
basenames) and `ToolBody` renders the card for a bare `SendUserFile` ToolCard, so
the buddy window's compact strip and the workbench tool gallery never show raw
JSON for it.

## 3. Native mirror tool

### 3.1 Registration

- `main/harness/tools/send-user-file.ts`, wrapped with `defineTool`, added to
  `CORE_TOOLS` (`tools/index.ts`) and `NATIVE_TOOL_NAMES`
  (`shared/harness-manifest.ts`). `tests/tool-registry-manifest.test.ts` enforces
  the pair.
- Name and inputs are Claude Code's exactly, so the renderer needs one card:
  `files: string[]` (≥1), `caption?: string`, `status?: 'normal' | 'proactive'`
  (accepted, ignored), `display?: 'render' | 'attach'`.
- Permission: allowed in every mode (`rulesForMode` always-allowed list, next to
  Read/Glob/Grep). It only shows the user their own files; `permissionSubject`
  returns `undefined`.
- Gating: none beyond `supportsTools` — on for every native session.

### 3.2 Behaviour

- Resolve each path against the session cwd; `~` is not expanded (same as the
  renderer's artifactify rule). Each file must exist and be a regular file:
  a directory or missing path fails the **whole call** with an error naming every
  bad path (`SendUserFile failed: /x/y does not exist`), so the model fixes it
  rather than half-delivering. Symlinks resolve; nothing is read into the result.
- Success text: `Sent N file(s) to the user.` with ` (displayed)` appended when a
  `render` was honored, or a trailing note when it was downgraded (§3.3).
- No size cap in the tool — the preview and viewer have their own.

### 3.3 One displayed file per turn (Destin's rule, native only)

- A **turn** is one full assistant response from `beginTurn` until it hands back
  to the user, across all its tool rounds. The flag lives in `beginTurn`-scoped
  state (like `budget`) and reaches the tool through `ToolContext`
  (`deliverables: { renderUsed: boolean }`).
- `display: 'render'` is honored only when the call has **exactly one** file and
  no earlier call this turn was honored. Otherwise the files are still sent
  (nothing is lost) and the call is treated as `attach`; the result text says why
  ("already displayed a file this turn" / "render takes exactly one file").
- The tool-result event carries `deliverableRendered` (§2.6) so the renderer never
  auto-opens a downgraded call.
- Tool description (what the model reads): send finished deliverables the user
  will want to look at — reports, mockups, screenshots, built pages — not scratch
  or intermediate files; don't re-send an unchanged file; you may pick **one**
  file per turn to display immediately with `display: 'render'`; everything else
  attaches. The full text lives in the tool file; no description-budget test
  exists today (verified 2026-08-25), so its length is a review item.

## 4. Claude Code guidance

Destin's global `~/.claude/CLAUDE.md` "Environment Notes" line changes from
"providing the full filepath in chat is sufficient to create a viewable artifact"
to: **hand finished deliverables to the user with `SendUserFile`** (they render as
a Deliverables card with previews); mention paths in prose for everything else.
The line is Destin's to edit; the exact wording is proposed in the plan.

## 5. Known limits (accepted)

- **Remote access** (phone browser → desktop host): neither `artifacts:get` nor
  `artifacts:read-binary` is bridged (ROADMAP "Most `window.claude` channels are
  not bridged to remote access"), so tiles show the extension glyph and Open
  shows the existing "not available via remote access yet" notice. Pre-existing
  gap; not this feature's to fix.
- PDF / DOCX / XLSX / code previews are the extension glyph, as in the file
  panel's own grid.
- Claude Code's `SendUserFile` has no one-render-per-turn rule; the renderer
  honors every `render` it sends (desktop, focused, live).

## 6. Testing

Renderer (vitest, jsdom):
- card renders last in the bubble; its calls are absent from the tool group;
  bubble-only-card gets prose padding;
- merge of two calls (files concatenated, captions stacked);
- narrow vs wide tile width; fades track `scrollLeft`/`scrollWidth`;
- collapse toggle, open by default, Ctrl+O applies;
- running / failed tile states;
- auto-open fires only for desktop + focused + live + effective `render`, opens the
  last file, and never for `attach`;
- `friendlyToolDisplay` and `ToolBody` cases;
- tracker records `delivered` versions for every file, deduped on toolUseId.

Harness:
- registry/manifest parity (existing test);
- missing file, directory, `~` path → error naming the path, nothing sent;
- success text; render honored once per turn; multi-file render downgraded;
  `deliverableRendered` on the event;
- allowed in every permission mode.

Workbench: `node scripts/workbench-boot-check.mjs` after the mock changes (done —
12 routes mount); `tests/workbench-mock-contract.test.ts` covers the added
`artifacts.readBinary` mirror.

**Harness evaluator:** this adds a native tool, so a paid eval run
(`test-engine/harness-eval.mjs`, ~$0.25/cell) is *offered*, not run — Destin
decides.

## 7. Out of scope

- Bridging `artifacts:*` over remote access.
- Richer previews for PDF/office/code.
- A "Deliverables" section in Project View or the session drawer — the
  `delivered` version type makes that possible later without new tracking.

## 8. Change ledger (workbench review)

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
