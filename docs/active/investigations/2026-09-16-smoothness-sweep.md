---
date: 2026-09-16
status: active
type: investigation
topic: Where the remaining hiccups and freezes come from — a five-angle code sweep after the Projects-view and file-pane fixes shipped, ranked into build batches
---

# Smoothness sweep — what still makes the app hitch, and what to build next

> **Status 2026-09-16 (late):** Batches A and C shipped (youcoded#501; record in
> `docs/archive/plans/2026-09-16-smoothness-batches-a-c.md`, with the rig numbers).
> Still open from this sweep: **Batch B** (background tabs), **D** (theme GPU cost),
> **E** (file opens), and A5 (streaming-bubble markdown re-parse throttle — a visible
> change that needs Destin's call on a clip). The rig now has `native-stream` and
> `native-resume` phases, so the next batch lands with a number in front of it.
>
> **Status 2026-09-23 — "many tabs" batch** (youcoded#561 + youcoded-dev#193, both
> repos). Built: all of **Batch B** (B1 hidden terminals stop drawing via
> `xterm-render-pause.ts`; B2 per-entry Tooltip → `TimelineEntryHint`; B3 permission-mode
> scan diffed + prefiltered; B4 thinking/seconds clocks pause in hidden chats; B5 window
> listeners only in the visible chat — which also fixed ArrowUp un-sticking every hidden
> chat), A3/A4 remainders (reducer copy-on-write in five cases; `useSessionAttention`
> per-session cache), **E4**, **E5**, C10 (reconciler async + unchanged-file skip; settled
> helpers release their watch), the ArtifactContext split into a selector store (+ closed
> sessions freed), the slash filter out of App state, unchanged root CSS-var writes
> skipped, and three things the new busy-app test found: hidden `ChatView` re-rendered per
> word (now `useChatState(id, { paused })`), `TerminalView` was unmemoised, and each
> terminal added its own resize listener. **Dropped, with reasons:** D3 `@property`
> registration (kills `var(--x, fallback)` fallbacks, which differ per call site — visible
> shift, no scoping gain with `inherits`); InputBar autosize caching (no measurable gain,
> identical-pixel proof impossible); `specialists/catalog.ts` async (made Stop ignorable
> before a turn starts; measured ~35 µs); draft-store cap (would silently discard unsaved
> typing). **Still open:** A5 (Destin's call on a clip), C7 (behind the conversation-store
> rewrite), D1/D2/D4/D5 (wallpaper themes only), E1–E3, the remote per-client broadcast,
> and the per-word redraw of every entry in the VISIBLE chat. General guards added in the
> same batch: `.claude/rules/performance.md`, `tests/busy-app-render-budget.test.tsx`,
> `tests/main-blocking-calls.test.ts` (replaced 14 per-file ast-grep rules).

Session key `perf-smoothness-20260916`. Read-only sweep of `origin/master` at `18cc8cbc` (workspace) /
the fetched app master, from five angles: main-process blocking work, renderer click paths, the
streaming path, styling and GPU, and background churn. Each finding below was reported by one
sweep and the headline ones were re-read in the code by the coordinating session. Nothing here is
measured yet; the perf rig's latest master baseline is the gate (`perf-reports/2026-09-11-0423-…`):
**55 long freezes totalling 5.9 s, worst 321 ms, and 96 dropped-frame gaps** during a 6-session
workload. That is the number these batches should move.

## 0. What already shipped (Destin asked)

Both halves of the 2026-09-09 plan merged on **2026-09-10**:

- `fix/projects-watcher-thrash` (merge `87fb080b`): eight rapid Files/Conversations clicks went from
  7.1 s of frozen main process to 0 ms; cold Projects open 2.1 s → ~0.8 s.
- `fix/file-pane-spawns-and-redraw` (merge `18ca9f7e`): the open file's drawer no longer redraws
  on every streamed word (40 → 0), and git stops re-running for files you are not looking at.
- The same week also shipped: lease/mirror/sync-walk off the main thread, marketplace/theme/
  Resume reads off the main thread, the transcript tailer read cap, Reduced Effects cancelling
  theme animation, and the terminal rig scenario.

**Left over from that plan, still open:** its "Branch 3" (cache the session scan, faster Files
search, virtualise the Files grid, send images as raw bytes) and the Markdown-open freeze. Both are
folded into the batches below.

## 1. The shape of what is left

Two themes run through all five sweeps:

1. **Every open tab costs you, even the ones you are not looking at.** Each session keeps a full
   chat view and a full terminal mounted. Hidden terminals keep drawing. Hidden chats keep
   ticking timers and re-building their element trees on every app redraw. Several background
   polls do work per open session every 2–10 seconds.
2. **A reply gets slower the longer the chat has been open.** Several per-word steps copy a
   structure that grows with the conversation (every word ever seen, every assistant turn, every
   tool ever run), and the whole app shell redraws about 60 times a second while a reply streams.

The main process still has a handful of "read the whole conversation file" moments on paths a
click reaches, which freeze **every** window at once when they hit.

## 2. Findings, grouped into build batches

Ranked by how much of what Destin feels they explain. "Where" is for the next session; the rest is
in plain terms.

### Batch A — the app shell redraws 60×/s while a reply streams, and per-word work grows with the chat

| # | What happens | What you feel | Where |
|---|---|---|---|
| A1 | The root of the app subscribes to the active chat's whole state three times, just to read two yes/no flags (is it thinking, is a trust prompt up). Every streamed word therefore re-renders the entire shell: header, session pills, status bar, input bar, settings drawer, and every session's chat and terminal. | Clicks land late or in a visible step while the assistant is answering; hover states feel sticky. | `App.tsx:461` (`useSessionTasks`), `:3303` (`useTrustGateActive`), `:3444` (`guideChatState`). A cached-boolean hook already exists for this: `hooks/useStreamingGate.ts`. |
| A2 | The session strip runs two layout effects with no dependency list, each forcing a style recalculation after every render. With A1 that is ~120 forced recalcs per second. | Same as A1, doubled. | `SessionStrip.tsx:717`, `:1763` |
| A3 | Per streamed word the reducer copies the set of every word-id ever seen in the session (grows forever), copies the map of every assistant turn before checking whether it needed to, and for helper (specialist) output copies the map of every tool ever run. | The first paragraph of a reply streams smoothly, the last one lurches; old chats feel heavy; helpers running makes typing lag. | `chat-reducer.ts:607, 1099, 1294, 1531, 2049…` (seenUuids); `:159` (assistantTurns copy before early return); `:601` (toolCalls copy per helper word). The main process already solved the first one with a two-generation set (`transcript-watcher.ts:875`). |
| A4 | The batcher coalesces renders to one per frame but still notifies all 12 app-wide subscribers once per word. One of them walks every open session's entire timeline per word, including chats from other tabs. Another builds a fresh map of all sessions per word and usually throws it away. | Everything slightly worse, proportional to how long the *other* tabs' conversations are; periodic single-frame hitches from garbage collection. | `chat-context.ts:85`; `useSubmitConfirmation.ts:166-199`; `useSessionAttention.ts:92-160` |
| A5 | The streaming bubble re-parses the whole message and re-colours every code block in it on every frame. No throttle, nothing incremental. | Frame drops that get worse as the reply grows; dramatic once a long code block starts. | `MarkdownContent.tsx:245-262, 586`; `AssistantTurnBubble.tsx:541` |
| A6 | Every expanded tool card subscribes to the whole session state directly, bypassing the memo that was written to stop exactly this. | A chat with several open tool cards is much jerkier than the same chat with them collapsed. | `tool-views/ToolBody.tsx:1126` |

### Batch B — background tabs cost you

| # | What happens | What you feel | Where |
|---|---|---|---|
| B1 | Hidden terminals are hidden with `visibility: hidden`, which the terminal library's own "pause when off-screen" check does not see. Every session that is printing keeps rendering rows and uploading glyphs to the GPU, including while you are in chat view. | Animations stutter and fans spin when several sessions work in the background. | `TerminalView.tsx:606` |
| B2 | Each session's chat view is not memoised, so every app redraw (see A1) rebuilds every open session's element tree. Each timeline entry is wrapped in a full tooltip component (3 states, 5 refs, 4 effects) whose text is empty almost always. | The more tabs open, the worse every click feels. | `App.tsx:3627`; `ChatView.tsx:102, 1249`; `ui/Tooltip.tsx:99` |
| B3 | Each PTY chunk from every session is lower-cased and scanned up to 9 times to spot a permission banner that appears a few times per session. The effect re-subscribes all sessions whenever the session list changes. | "A build is running" turns into "the UI is sticky". | `App.tsx:1993-2026` |
| B4 | Per-session timers in hidden chats keep firing (thinking indicator 250 ms/1 s/2.5 s; running shell cards 1 s), and the terminal buffer of every hidden session that printed is serialised each frame for the prompt detector. | Ten background sessions mid-reply = ~40 React updates a second into invisible subtrees. | `ThinkingIndicator.tsx:175-217`; `tool-views/ToolBody.tsx:320`; `terminal-registry.ts:31-47` + `usePromptDetector.ts:98-120` |
| B5 | Chat scrolling is re-implemented in JavaScript (non-passive wheel handler plus a friction loop), so it queues behind everything above; and each mounted session adds window-level capture listeners for pointer and key events. | Flick-scrolling judders while a reply streams; a click during a glide can feel swallowed; six tabs = six extra handlers per click and keystroke. | `ChatView.tsx:674-819` |

### Batch C — main-process freezes (every window at once)

| # | What happens | What you feel | Where |
|---|---|---|---|
| C1 | At the end of **every** native reply the whole transcript file is read from disk and parsed, synchronously, to publish the accepted-history manifest. Grows with the conversation. | A hitch at the end of each reply that gets worse the longer you stay in one chat. | `harness/accepted-history-store.ts:207, 400`; called from `native-session-host.ts:3073` (and specialist turns, compaction, /clear, model swap) |
| C2 | Tearing a tab out / re-docking reads the entire history (parent and every helper child) just to test whether it exists. Scrolling up in a native chat re-reads the whole transcript per page. | Dragging a tab out freezes the app for a beat; scrolling back through a long native chat stutters progressively. | `ipc-handlers.ts:3253`; `native-session-host.ts:4525, 4544` |
| C3 | Opening or resuming a chat, **and every helper the model spawns mid-turn**, runs two git commands synchronously (up to 3 s timeout each). | Opening a chat or delegating to a helper stalls everything for up to seconds on a big or dirty repo. | `harness/prompt-assembly.ts:43-70`; `native-session-host.ts:2749, 3393` |
| C4 | The model's own Glob tool is a synchronous recursive directory walk; Read/Edit/Write read whole files synchronously (Read allows 50 MB). | While the assistant "searches files", other windows' typing and streaming freeze in bursts. | `harness/tools/glob.ts:241`; `read.ts:227`; `edit.ts:98, 156`; `write.ts:97, 126` |
| C5 | Three polls do synchronous disk reads per open session, forever: the 10 s status push (6 + 3 per session), the 2 s transcript safety poll (one existence check per session), the 2 s topic-file poll (one read per session, never upgrading to a watcher). | A rhythmic micro-stutter that grows with the number of sessions opened this run. | `ipc-handlers.ts:2318-2411`; `transcript-watcher.ts:691`; `ipc-handlers.ts:3736` |
| C6 | The Resume browser reads 256 KB of every session file and every conversation record synchronously. | Clicking Resume locks the app for a second or more, scaling with history. | `harness/session-store.ts:345`; `native-home.ts:199-330`; `conversation-store.ts:331-355` |
| C7 | Every conversation record write and read first lists the whole conversations directory; starring/renaming a chat kicks off a synchronous full search-index rebuild 3 s later. | Starring a chat freezes the UI a moment later with no visible cause. | `conversation-store.ts:185, 265, 314`; `chatsearch-index/index-service.ts:220-267`, `index-store.ts:168-247` |
| C8 | The project watcher sends one message per changed file to **every** window (including buddy floaters), with no coalescing; a formatter or checkout touching 500 files is 500 × windows messages. Its own-writes map also grows without bound. | A hitch whenever the agent rewrites many files, exactly while you read its reply. | `artifacts/project-watcher.ts:135, 151, 265-283`; `ipc-handlers.ts:4855` |
| C9 | The default "Home" project watches `$HOME` six levels deep with no directory cap. This is the ~250,000 inotify watches the roadmap could not attribute. Live watchers are uncapped (one per session per project). | Inotify exhaustion → live refresh silently dies everywhere; a multi-hundred-ms freeze per cold start. | `artifacts/projects-index.ts:115`; `project-watcher.ts:224` |
| C10 | The 30-minute reconcile lists every transcript ever and tail-reads each; the sub-agent watcher keeps two 5 s timers per session and one file watch per helper ever run, never released until the session closes. | A stall every half hour that grows over months; inotify pressure on top of C9. | `conversations/service.ts:241`, `reconciler.ts:104-200`; `subagent-watcher.ts:72, 253, 312` |

### Batch D — wallpaper, glass and particle themes (GPU)

Destin runs a solid theme, so these mostly affect other users. They are real and they are on the
documented theme-author API.

| # | What happens | Where |
|---|---|---|
| D1 | `.layer-surface` is both the universal card class and the theme engine's blur target. Every marketplace, library and Files-grid card is its own live blur region (the command-drawer fix exempted only the drawer). Cards also scale on hover, which re-blurs. | `theme-engine.ts:787`; `MarketplaceCard.tsx:331`; `FilesTab.tsx:486`; `globals.css:1556` (the one exemption) |
| D2 | Every in-view user bubble is a blur region (the carve-out covers assistant bubbles only), and the particle canvas invalidates all of them 30×/s. | `theme-engine.ts:728-751`; `UserMessage.tsx:72`; `ThemeEffects.tsx:230` |
| D3 | A 40-point clip-path on the full-window glass is recomputed from root CSS variables that JavaScript rewrites on every textarea line grown and every drawer-drag frame; no `@property` registration, so each write is a whole-document style recalc. | `globals.css:2040-2140`; `useChromeMeasurements.ts:27`; `drawer-width.ts:41` |
| D4 | Both drawer scrims fade over a full-viewport blur; several panels animate width/max-width/margin (layout properties) rather than transform. | `CommandDrawer.tsx:195, 215`; `SessionDrawer.tsx:1097`; `WideViewToggle.tsx:224`; `globals.css:1782` |
| D5 | Timeline entries are `contain: layout style` without `paint`, so a full-page invalidation (D2) repaints every entry, not just the visible ones. | `globals.css:903` |

### Batch E — opening files

| # | What happens | What you feel | Where |
|---|---|---|---|
| E1 | A large Markdown file is parsed and syntax-coloured synchronously inside the commit, up to 3 MB. Already roadmapped in `files.md`. | The whole window freezes with no spinner. | `MarkdownView.tsx`; `MarkdownContent.tsx:543` |
| E2 | Images and PDFs arrive as base64 text and are decoded byte-by-byte in a JS loop, on open and per thumbnail. (Branch 3.4 of the shipped plan.) | A multi-MB image is a hard freeze; the Files grid freezes in bursts past big images. | `useArtifactBytes.ts:14-19`; `ArtifactThumbnail.tsx:118-124` |
| E3 | The Files grid draws up to 2,000 cards with 2,000 intersection observers on first paint; the marketplace "Explore everything" list is unbounded and re-filtered every render. (Branch 3.4.) | Long first paint after data lands, stuttery scroll. | `FilesTab.tsx:745-813`; `MarketplaceScreen.tsx:510` |
| E4 | The file editor unsubscribes and re-subscribes its change watcher on every keystroke. | Per-character input lag in the editor. | `ActiveArtifactView.tsx:289` |
| E5 | A theme switch that flips the terminal backing destroys and recreates every open terminal. | Picking a theme stalls for a beat per session and terminals flash empty. | `TerminalView.tsx:467` |

## 3. Recommended order, and why

1. **Batch A** — smallest code, biggest reach. A1 and A2 alone stop ~120 forced whole-app
   renders a second during every reply; A3 removes the "gets slower the longer you stay" curve.
   Provable with render-count tests like the file-pane work, and the rig's workload phase
   (long tasks, frame gaps) is the gate.
2. **Batch C, items C1–C5** — the remaining "everything freezes at once" moments on paths a click
   reaches. Each is one function; the main-process sync-fs guard (now `tests/main-blocking-calls.test.ts`, 2026-09-23) covers them.
   C9 is one line (cap the Home watcher) and answers a roadmap mystery.
3. **Batch B** — the per-tab tax. B1 (pause hidden terminals) is probably the single biggest GPU
   win for a user with several sessions running.
4. **Batch E** — file opens; E2/E3 are the shipped plan's Branch 3.
5. **Batch D** — themes; matters for the marketplace's users more than for Destin.

Risks worth saying up front: A5 (throttle the streaming markdown) changes what the eye sees while
a reply types out, so it needs a before/after clip. B1 must not break the prompt detector, which
reads hidden terminals' buffers on purpose. C3 must keep the git branch line correct for helpers.
Everything else is invisible when done right and is guarded by a count or a source scan.

## 4. Overlap with the roadmap

Already filed and now attributed: the ~250,000 inotify watches (`files.md`, cause = C9); "the main
shell is one 3,900-line component" (`user-interface.md`, mechanism = A1/B2); per-card blur on
grids (`user-interface.md`, confirmed = D1); the four smaller reads (`chat-data.md`, = C6/C7);
Markdown open (`files.md`, = E1); the sustained-sluggishness item (`user-interface.md`) — Batches
A and B are its second half ("every open session stays mounted"). New, not yet filed: C1, C2, C3,
C4, C5, C8, D2, D3, B1, B3, B5.
