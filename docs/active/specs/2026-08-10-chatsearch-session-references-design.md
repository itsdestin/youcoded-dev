---
status: draft
created: 2026-08-10
supersedes: none
related:
  - docs/active/specs/2026-08-05-chat-search-design.md
---

# Chat Search — session references in chat

## Objective

Chat Search can find a past conversation, but the model can only *talk about* it.
There is no way to go from "we discussed that on July 22" to actually looking at
that conversation. This spec adds two destinations from a search hit:

- **Preview** — read the conversation, read-only, in the artifact pane.
- **Resume** — pick it back up as a live session.

Both must work for the `claude` and `native` lanes.

## What already exists

Findings below were verified against the tree at `63e2351c`, not assumed.

**Ids already line up — in the index.** A chatsearch entry's `id` is the same
identifier the Resume Browser uses as `PastSession.sessionId`. Measured against
disk: 599 of 600 local Claude JSONL filenames match a chatsearch id; 62 of 64
native. So no id *translation* is needed anywhere in this design.

That is a fact about the index, not about the CLI's output. `find`'s table
prints a shortened id prefix and no paths at all, which is why component A adds
a machine-readable channel — see below. Do not read this paragraph as saying the
card can work from the table.

**A conversation renderer already exists.**
`renderer/components/project-view/ConversationPreview.tsx` loads a session's
history and renders it as chat bubbles — user right in accent, assistant left in
inset — with a header carrying **Resume in Claude** and **Open full transcript**.
It is the app's established "read a past conversation" surface.

**A per-tool card renderer already exists.**
`renderer/components/tool-views/ToolBody.tsx` switches on `toolName` with cases
for `Edit`, `Write`, `Bash`, `Read`, `Grep`, `WebFetch` and others. Custom
rendering of a tool's result is a solved pattern here.

**Two transcript readers already exist.** `loadHistory()` in
`main/session-browser.ts` returns `HistoryMessage[]` — prose only, which is what
this design uses. `parseTranscriptLine(line, sessionId)` in
`main/transcript-watcher.ts` is exported and pure, and emits full tool events;
it is not used in v1, but it is the path Open question 1 would take.

**The artifact viewer is registry-driven.**
`renderer/components/artifact-views/RendererRegistry.ts` maps file extension →
React view. `jsonl` is unmapped today.

## The constraint that shapes the design

The two actions have different prerequisites, and that — not how much data
exists — is what separates them.

**Preview needs the transcript bytes.** Those are always present. Every
conversation transcript is mirrored to the synced space at
`~/YouCoded/Personal/Conversations/<provider>/transcripts/<key>/<id>.jsonl`, a
real local directory. Measured: all 1,697 Claude entries carry a
`transcriptPath`, and 1,694 point at a file that exists — the 3 exceptions are
exactly the tombstones.

**Resume needs the bytes *and* a working directory to launch into.** The
transcript half is solvable: the materialize sweep already copies from the space
into `~/.claude/projects/`, where `claude --resume` expects it. The directory
half often is not — a conversation recorded on another machine names a folder
that does not exist here, and a session cannot start in a directory that isn't
there.

Measured on this device:

| | count |
|---|---|
| Claude conversations chatsearch can find | 1,697 |
| Resumable — project folder present locally | 557 |
| Not resumable — **project folder absent** | 1,137 |
| Not resumable — transcript merely unmaterialized | **0** |

That last row is the important one. No conversation is blocked by the
recoverable condition; every blocked one is blocked because its working
directory is missing. Native is not affected the same way (62 of 64 local).

(The 1,137 is a slight over-count: the measurement mirrors
`resolveLocalProject` but reads only saved folders, not the managed-projects
map. Directionally sound, not exact. The ratio is also specific to this
device — a machine where most of the work was done locally would invert it.)

**Design consequence:** both actions are first-class. Preview must work for
every conversation, including every one resume cannot reach. Resume must state
which prerequisite is missing rather than presenting a dead control, reusing the
Resume Browser's existing distinction between an absent project folder and an
unsynced transcript.

## Architecture

The two card renderers (A, A2) are the only genuinely new UI. Everything else
extracts, widens, or guards something that already exists.

### A. Chatsearch result card (`tool-views/`)

When the model runs `chatsearch find`, render the result as a list of session
rows instead of raw text. Each row: title, date, project, state marker, tags,
and two buttons — **Preview** and **Resume**.

The affordance therefore requires no cooperation from the model beyond using the
tool. This is deliberate, and it is why this and not link-parsing: prose parsing
only fires when the model happens to write an id, and models usually write a
title instead.

Dispatch is by `toolName`, and on the `claude` lane chatsearch runs as `Bash`.
So the card is selected by matching the command string against
`chatsearch.js`. This is still parsing — but of a command *we* emit, not of model
prose. The `native` lane may expose chatsearch as a real harness tool later; the
card must key off a normalized descriptor, not the raw command, so both lanes
converge on one renderer.

**The card cannot be built from the human-readable table.** `formatRows`
(`chatsearch.js:341`) emits a *short id prefix*, day, project **name**, marker,
title, and tags — and nothing else. It carries no full session id, no
`transcriptPath`, no `provider`, no `originalPath`. But `readConversation` (C)
needs two of those and `handleResumeSession` (E) needs three more. The earlier
claim that "ids already line up, so no translation layer is needed" is true of
the *index* and false of *the surface the card reads*.

(`show` is different: `metadataBlock` at `chatsearch.js:761` already prints the
full id, `provider`, `originalPath`, and `transcriptPath`. A2 is parseable
today; A is not.)

**So the CLI gains a machine-readable channel** — a `"format":"json"` request,
or a labeled sentinel block appended after the human table. The card reads that;
the model keeps reading the table. This deletes the malformed-parse failure class
rather than handling it.

This makes `wecoded-marketplace/youcoded-chatsearch` a change target of this
design, not just its consumer — see Phasing.

**Fallback is mandatory, not defensive.** Render as plain `Bash` whenever the
machine-readable block is absent or unparseable. Three real paths reach that
state:

1. **Version skew.** chatsearch is a bundled plugin on its own release cadence,
   so an app carrying the card will meet older installed plugins that emit no
   block. This is the common case on any upgrade, not an edge.
2. **Pipes and redirects.** A command like `… chatsearch.js '{"cmd":"show"}' |
   head -40` both defeats the command match and truncates the stdout the card
   needs. Any pipe or redirect in the command string disqualifies the card.
3. **Implicit `find`.** `cmd` defaults to `'find'` when absent
   (`chatsearch.js:982`), and the request may arrive on **stdin** rather than
   `argv[2]` (`:1017-1018`), so the command string alone does not always reveal
   the subcommand. Read the subcommand from the emitted block, never infer it
   from the command line.

### A2. `show` renders a presented conversation card

`find` answers "what's out there"; `show <id>` answers "this one". Both render as
cards, with different layouts: `find` a list of rows, **`show` a single
conversation presented prominently, with Preview and Resume**.

This is the intentional-display primitive — the model presents a conversation by
running `show` on it. It needs no signalling channel back into the app, which is
what made a dedicated spotlight tool expensive on the `claude` lane: the tool
call and its output already land in the transcript, carrying full session
context, and the card is simply how they render. Identical on both lanes.

The skill must state it directly: **when you name a specific past conversation
to the user, run `show` on it.** That turns presentation into a tool call the
model has independent reason to make — it is already told to verify before
asserting — rather than a formatting convention it may not follow.

This closes the gap the `find` card cannot: a follow-up like *"which one had
X?"* is answered from results already in hand, so no `find` runs, and without
this the answer would arrive as unadorned prose.

**Grouping.** `show` cards must not be pooled with unrelated tool cards. Today
`TRANSCRIPT_TOOL_USE` appends every call to `currentGroupId`, a single pointer
that only resets on assistant text (`chat-reducer.ts:747`) — so a `show`
immediately after a `Read` would share that `Read`'s group.

The requirement is:

```
Read → show → Read     ⇒ 2 groups: [Read, Read] and [show]
```

Two, not three. The surrounding run of ordinary tools must survive the
interruption.

**Mechanism: a segment, not a group.** `ExitPlanMode` already solves this shape.
`injectPlanSegment` (`chat-reducer.ts:95`, called at `:891` and `:928`) pushes a
`{type:'plan'}` segment into the turn at the right position, and the
`TurnSegment` union (`chat-types.ts:41-45`) already carries non-group segments.

So a `show` call pushes a `{type:'session-card'}` segment at its sequential
position and **skips the group append entirely**. `currentGroupId` is never
read or written on that path, so the trailing `Read` finds the same group still
current and joins it.

This is deliberately *not* a per-affinity map keyed off `currentGroupId`. That
was the first design and it costs more than it buys: `currentGroupId` is
serialized state (`chat-types.ts:163`, `:631`, `:677`, `:708`) crossing the
remote WebSocket and pinned by `chat-serialization.test.ts`, so widening
`string | null` to a map is a wire-format change — a remote browser on an older
bundle could not hydrate from a newer host. It would also touch all seven reset
sites. The segment approach changes no serialized shape.

- Consecutive `show` calls each get their own segment, in order — they stack,
  never replace.
- A `show` is never inside a tool group, in either direction.
- Ordinary tools separated by a `show` stay in one group.

**Consequence to accept:** the trailing `Read` renders *above* the `show` card,
because it joins a group whose segment was already positioned earlier in the
turn. Live, that means a tool card appears above a card already on screen.

This is inherent to the requirement, not to the mechanism — the per-affinity map
produces exactly the same ordering. Coalescing across an interruption means a
later member joins an earlier-positioned group; the only alternative is three
groups, which the requirement rejects. The `show` card itself always sits
where it ran, and timestamps inside a group remain truthful.

The subcommand that selects the card also decides the segment, so grouping and
rendering can never disagree about what a call is. One function, two consumers.

### B. Conversation renderer (extracted)

Extract the message list out of `ConversationPreview.tsx` into a standalone
component. What stays behind in `ConversationPreview` is the
`ProjectDetailOverlay` chrome and the Project View wiring; what moves out is the
bubble list and its scroll-to-latest behavior.

Two hosts then share one renderer — the same relationship `ActiveArtifactView`
already has with the Session Drawer and Project View.

**Change from today's behavior: render markdown.** The current component renders
plain text on purpose, and that reasoning holds for a 20-message preview of your
own recent work. It does not hold for "open this to remember what we decided" —
a conversation of code blocks and lists rendering as raw text is materially
worse. Route content through `MarkdownContent`. Project View inherits the
improvement.

**Pass no `sessionId`.** `MarkdownContent` enables `rehypeFilepathTokens` only
when a `sessionId` is supplied (`MarkdownContent.tsx:233-235`). Supplying one
for a historical transcript would render clickable file chips that resolve
against the *current* session's project — frequently a folder that does not
exist on this device at all, since most previewable conversations were recorded
elsewhere. Markdown formatting is wanted; filepath resolution is not.

### C. Transcript reader (main process)

Today's path is project-scoped and local-only:
`project.conversationHistory(projectPath, sessionId)` →
`ccProjectSlug(projectPath)` → `loadHistory` → reads
`~/.claude/projects/<slug>/<id>.jsonl`.

A chatsearch hit is not necessarily in a saved project, and two thirds of hits
have no transcript in `~/.claude/projects/` — their bytes live only in the
synced mirror. So this component adds a **path-based** reader:

```
readConversation(transcriptPath, provider, { tail, before }) -> HistoryMessage[]
```

Requirements:

1. Accepts the synced-space mirror path, not just `~/.claude/projects`. Prefer
   the local transcript when present (it is authoritative and current), fall
   back to the mirror.
2. Handles both formats. `loadHistory` parses Claude JSONL only; native
   transcripts have their own shape. Both readers return `HistoryMessage[]` —
   that shared shape is the seam, and the renderer never learns there were two
   formats.
3. Enforces a path boundary. The existing reader gates slug and id with
   `SAFE_ID_RE` before touching disk. A path-based reader is a wider surface and
   must contain resolved paths to the two legal roots and refuse anything else.
   Reachable over the remote WebSocket, so this is a real boundary, not a
   formality. Two details that decide whether it holds:
   **`realpath` the candidate before comparing** — a symlink inside a legal root
   otherwise walks straight out of it, and the conversation space is exactly
   where the legacy symlink population lived. And **resolve the space root at
   call time**, not from a module constant, since its location is
   user-configurable.
4. **Refuses subagent transcripts explicitly** — see below. Root containment
   alone does not cover this: a subagent transcript sits *inside* a legal root.
5. **Is always bounded — there is no `all`.** The caller asks for a tail of N
   and may page backwards with `before`. An unbounded read means a 42 MB worst
   case crossing IPC and then a `react-markdown` + `rehype-highlight` pass per
   bubble, inside a 480px drawer pane, on Android. Bounding at the reader bounds
   both the payload and the paint; "load older" is an explicit user action.

### C2. Subagent transcripts must never surface as conversations

Claude Code writes each subagent's transcript to its own file, nested under the
parent session:

```
~/.claude/projects/<slug>/<parent-session-id>/subagents/agent-<hash>.jsonl
```

Measured on this device: 1,134 of 1,743 transcript files are subagent files.
They are cleanly separated — 1,131 are entirely `isSidechain: true`, the 606
session transcripts contain none, and no file mixes the two.

None of them currently reach the store, the synced space, or the chatsearch
index (verified: zero entries on either lane with an `agent-` id, a
`/subagents/` path, or a non-UUID id; no `subagents/` directory exists anywhere
in the space). **But that is incidental, not guarded.** Both enumerators —
`conversations/reconciler.ts:126` and `session-browser.ts:351` — do a flat
`readdir` filtered on `.endsWith('.jsonl')`, so subagent files are missed only
because they are one directory deeper. A secondary accident is that store index
keys are UUID-shaped and `agent-<hash>` is not. Nothing in the store, mirror, or
reconciler references subagents by name.

This design widens the exposure, because the reader accepts a transcript path
rather than a slug plus id. So the exclusion becomes explicit:

- Reject any path with a `subagents` path segment.
- Reject any id not matching the session-UUID shape.
- Reject a transcript whose message lines are entirely `isSidechain: true`
  — a content check that survives a future layout change.

A subagent transcript is not a conversation the user had. Surfacing one as a
past session would be a fabrication, not merely noise.

### C3. Keep every assistant message — do not inherit `loadHistory`'s filter

`loadHistory` keeps assistant messages only where `stop_reason === 'end_turn'`,
i.e. the closing text of a turn. Measured on the largest local transcript
(42.2 MB, 15,554 lines): 351 user messages kept, and of 1,405 assistant text
messages, **270 kept and 1,135 dropped** — about four fifths of what the
assistant said. Separately, 2,717 tool calls and 2,717 tool results are absent,
because `HistoryMessage[]` has no representation for them.

The `end_turn` filter is a heuristic, not a property of the data. It is right
for its current job — a 20-message preview of your own recent project work —
and wrong for "open this to remember what we decided," where the reasoning
between tool calls is often the part worth reading.

**C is writing a new reader anyway, so it does not inherit that filter.** Keep
every assistant text block; drop only tool-use and tool-result blocks. That is a
filter change, not new architecture, and it removes the larger half of the
fidelity gap in v1 rather than deferring it.

What remains deferred is tool *activity* (Open question 1). Because something is
still omitted, **the renderer must say so**: where tool calls were dropped
between two messages, show a count marker rather than a seamless join. A preview
that silently omits work should never be presented as "the conversation" — and a
marker assigned to no phase is a marker that never ships.

### D. Session references (Session Drawer)

Sessions surfaced during a chat accumulate in a **Referenced conversations**
list in the Session Drawer, so they remain reachable after the search scrolls
away. Clicking one opens it in the artifact pane.

**This deliberately does not use `ArtifactRecord`.** `ArtifactKind` is
`'internal' | 'external'` — inside vs. outside the project root, not a content
type — and an artifact carries `versions[]`, `status`, and edit/save
affordances that are meaningless for a read-only transcript. Forcing sessions
into that model would also put `.jsonl` files into the Files list, and the
artifacts rule records that an "External Artifacts" section was tried and
removed the same day as ~95% incidental noise.

So: a sibling concept that reuses the artifact **pane** (the viewer host) and
not the artifact **record model**.

**One pane state, discriminated — not two parallel fields.** `SessionDrawer`
resolves its viewer today via `allArtifacts.find(a => a.id === activeArtifactId)`.
Adding a second "active reference" field beside `activeArtifactId` makes
*both set at once* representable, and every consumer would then need a
precedence rule that nothing enforces. Replace it with a single discriminated
field:

```
activePaneItem: { kind: 'artifact' | 'session'; id: string } | null
```

Same branch count at the render site, and the illegal state cannot be
constructed. This touches existing `activeArtifactId` readers, so it belongs in
D's scope rather than being discovered during it.

References are per-session, live in reducer state, and are not persisted in v1.

### E. Resume

Routes to the existing `handleResumeSession` in `App.tsx` — sessions are already
tabs, so "resume in a new tab" is the current flow.

**It is not a one-step call, and it is not independent of the rest.**
`handleResumeSession` needs `claudeSessionId`, `projectSlug`, and `projectPath`,
plus `provider` — none of which the `find` table carries, so E depends on the
machine-readable channel from A. And the two lanes differ: the native branch
deliberately does **not** auto-launch. `App.tsx:2917` threads `provider`
precisely so a native session lands in the pre-resume model picker, and
`App.tsx:3503` shows that path completing only once a `ModelBinding` exists. So
native Resume from a card is a two-step flow — card → model picker → launch —
and the card must carry `provider` to know which flow it is starting.

Where resume is not possible, the button is disabled and says which of the two
reasons applies, reusing the Resume Browser's existing distinction: *"Project
folder not on this device"* vs *"Not synced to this device yet"*. Preview stays
enabled in both cases. Never imply the conversation does not exist — it does;
only its local prerequisites are missing.

### Deferred: catching a bare id in prose

If the model answers without running `show`, no card appears. The skill
instruction makes that less likely, not impossible.

The fallback would be detecting a conversation id written in prose and rendering
an inline chip — the rehype-plugin approach `rehypeFilepathTokens` already
establishes. It is deliberately **not** in v1: it only fires when the model
happens to write an id, and models tend to write titles instead, so it is a weak
primary and an acceptable secondary. Add it only if cards are observably missing
in practice.

## Data flow

```
model runs `chatsearch find` (or `show <id>`)
  → Bash tool call + stdout land in the transcript
  → stdout carries the human table AND a machine-readable block  [A, phase 0]
  → ToolBash card selected; block absent/unparseable → plain Bash
  → rows (find) or one conversation (show) built from the block  [A, A2]
  → `show` renders as its own turn segment, never inside a group

user clicks Preview
  → reference added to the drawer's list           [D]
  → artifact pane opens the conversation renderer  [B]
  → readConversation(transcriptPath, provider)     [C]
  → HistoryMessage[] → bubbles

user clicks Resume
  → handleResumeSession(session)                   [E]
  → new tab, or disabled with a specific reason
```

## Error handling

Per `docs/error-message-standards.md`, and per the honesty rules the chatsearch
CLI already follows:

- **Transcript unreadable** — say the transcript could not be read and surface
  the real reason. Never render an empty bubble list as though the conversation
  were empty.
- **Tombstoned conversation** (metadata kept, bytes gone) — Preview is disabled
  and says the transcript is no longer on disk. The conversation happened; only
  its bytes are missing.
- **No machine-readable block, or an unparseable one** — silently fall back to
  plain `Bash` rendering. No error surface; the text output is still correct and
  readable. This is the expected state against an older bundled plugin, not a
  failure.
- **Piped or redirected invocation** — same fallback. The stdout the card needs
  may have been truncated before it was ever captured.
- **Path outside the legal roots** — refuse in main and log. The renderer must
  not be the boundary.

## Interaction details

- **Dismissing a preview** returns the pane to whatever it showed before, or
  closes it if it was closed. Opening a preview while a real artifact is open
  swaps the pane and is reversible — it must not silently discard an unsaved
  edit in the artifact editor, which already has `guardUnsaved` for exactly
  this.
- **Narrow viewport.** The conversation renderer becomes a new child of
  `.drawer-pane`, and `.claude/rules/narrow-viewport.md` records that the pane
  collapsing to 100% does **not** resize its children — a child pinned to
  `--right-pane-width` (480px) hangs outside an `overflow:hidden` box on a
  390px screen. The renderer must size to its parent, and it must be checked at
  narrow width, not only in the drawer at desktop width.

## Cross-platform parity

The cards, the extracted renderer, and the drawer list are renderer-only, so
**Android inherits them through the shared React bundle** at no extra cost.

The path-based reader is new IPC and therefore three-surface work — `preload.ts`,
`remote-shim.ts`, `ipc-handlers.ts`, plus `SessionService.kt` — pinned by
`tests/ipc-channels.test.ts`. Keeping the new surface to exactly one channel is
a design goal, not an accident: everything else was deliberately arranged to
avoid crossing that boundary.

The chat state shape is deliberately **unchanged**. The `session-card` segment
is additive to a union the serializer already round-trips, and no serialized
scalar changes type — so a remote browser on an older bundle degrades to an
unknown segment rather than failing to hydrate.

The CLI change lands in a **different repository** on its own release cadence,
which is why the app can never assume the machine-readable block is present.

## Testing

| Area | Guard |
|---|---|
| Machine-readable block → card model | Unit, in the plugin repo and the app: every field the card and E consume is present |
| Card fallback | Unit — absent block, unparseable block, piped command, stdin-delivered request → plain `Bash` |
| **`show` segment placement** | **Reducer unit, with `Read → show → Read` ⇒ exactly 2 groups as the load-bearing case; plus consecutive `show`s each getting their own segment, and `currentGroupId` never being written on the `show` path. Regression risk is silent — a wrong grouping renders plausibly.** |
| Serialized chat shape | `chat-serialization.test.ts` stays green — this design must not change the wire format |
| Native transcript → `HistoryMessage[]` | Unit, fixture-based |
| Claude transcript → `HistoryMessage[]` | Unit — **intermediate assistant text is kept**, tool blocks dropped, dropped-count marker emitted |
| Path containment | Unit — traversal, foreign-root refusal, **and a symlink inside a legal root pointing out of it** |
| Bounded reads | Unit — no unbounded path exists; `before` pages backwards |
| **Subagent exclusion** | **Fixture with a nested `<session>/subagents/agent-x.jsonl`: the reader refuses it, and neither the reconciler nor `listPastSessions` enumerates it. This is the pinning test the current implicit behavior lacks.** |
| Local-vs-mirror preference | Unit — both present, mirror only, neither |
| New IPC channel parity | `ipc-channels.test.ts` |
| Renderer extraction | `ConversationPreview` keeps its current behavior |

The two readers should share one fixture-driven contract test, in the spirit of
`sync-transport-contract.ts` — one shape, two producers.

## Phasing

0. **CLI machine-readable channel** (`wecoded-marketplace/youcoded-chatsearch`)
   — the emitted block, plus the SKILL.md instruction to run `show` when naming
   a conversation. **Separate repo, separate release cadence**, so it ships
   first and the app must tolerate its absence regardless.
1. **Reader + IPC** (C, C2, C3) — path-based, both formats, bounded, contained,
   subagent-refusing, keeping intermediate assistant text. Testable with no UI.
2. **Renderer extraction** (B) — plus markdown with no `sessionId`, and the
   dropped-tool-count marker. Project View regression-checked.
3. **Result cards** (A, A2) — `find` list, `show` presented conversation, and
   the `session-card` turn segment.
4. **Drawer references** (D) — including the `activePaneItem` consolidation.
5. **Resume wiring** (E) — both lanes, native via the model picker.

0, 1, and 2 are independent and can run in parallel. 3 depends on 0, 1 and 2.
5 depends on 0 and 3 for `provider`, so it is not the free-standing piece an
earlier draft claimed.

## Decisions

- **Cards over link-parsing.** Parsing prose only fires when the model writes an
  id, which it usually will not.
- **`show` is the spotlight primitive.** A dedicated "display this session" tool
  would need a signalling channel on the `claude` lane, where chatsearch is a
  bash script that cannot reach the UI. Rendering the `show` call it already has
  reason to make costs none of that.
- **The CLI emits a channel for the card.** The human table lacks the ids and
  paths both Preview and Resume need. Parsing it harder would not have produced
  them.
- **Both actions are first-class.** Preview works everywhere; resume works where
  the project folder exists and says which prerequisite is missing when it does
  not. An availability ratio is not a statement of importance, and this device's
  ratio is not every device's.
- **Reuse `ConversationPreview`'s renderer.** One way to read a conversation,
  not two.
- **Markdown on, `sessionId` off.** Formatting is wanted; filepath resolution
  against a foreign cwd is not.
- **Keep intermediate assistant text.** The `end_turn` filter is a preview
  heuristic, not a property of the data, and inheriting it would discard four
  fifths of the reasoning.
- **A turn segment, not a group-affinity map.** Same result for
  `Read → show → Read`, no change to serialized chat state.
- **Session references are not artifacts.** Reuse the pane, not the record model.
- **Reads are always bounded.** No `all`; tail plus explicit paging.

## Open questions

1. **Tool activity in the preview.** v1 shows none. The ~81% assistant-text
   drop is *not* deferred — C3 fixes it by not inheriting the `end_turn`
   filter — and what remains is tool calls and results, marked with a count so
   the omission is visible rather than silent. The next step would be collapsed
   one-line entries ("Edited `harness-session.ts`", "Ran `npm test`"),
   expandable to raw input/output: one more reader branch and one more renderer
   branch, no rewrite. Deferred, not foreclosed.
2. **Persisting references across restarts.** v1 keeps them in reducer state
   only. Persisting is a store decision, not a renderer one.
3. **Freshness of a mirrored transcript.** A conversation previewed from the
   synced mirror may be behind the originating device's latest turns — sync is
   not instantaneous. Whether the preview should say so, and how it would know,
   is unresolved.
