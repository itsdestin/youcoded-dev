---
status: active
created: 2026-08-10
updated: 2026-08-25
supersedes: none
related:
  - docs/active/specs/2026-08-05-chat-search-design.md
  - docs/active/plans/2026-08-25-chatsearch-session-references-plan.md
  - docs/active/handoffs/2026-08-10-chatsearch-state-of-play.md
---

# Chat Search — session references in chat

## Objective

Chat Search can find a past conversation, but the model can only *talk about*
it. There is no way to go from "we discussed that on July 22" to actually
looking at that conversation. This spec adds two destinations from a search hit:

- **Preview** — read the conversation, read-only, in the artifact pane.
- **Resume** — pick it back up as a live session.

Both must work for the `claude` and `native` lanes.

## What already exists

Verified against `youcoded` master at `df96b4a5` (2026-08-25); the 2026-08-10
measurements were taken at `63e2351c`. All paths are under
`youcoded/desktop/src/` unless stated.

**Ids already line up — in the index.** A chatsearch entry's `id` is the same
identifier the Resume Browser uses as `PastSession.sessionId`. Measured: 599 of
600 local Claude JSONL filenames match a chatsearch id; 62 of 64 native. No id
*translation* is needed anywhere.

**The app owns the index, and every field the cards need is already in it.**
`main/chatsearch-index/index-format.ts` (`ChatsearchMetaEntry`) carries `id`,
`provider`, `projectName`, `originalPath`, `title`, `lastActive`, `tags`,
`tombstone`, and an absolute `transcriptPath`. The CLI is a *consumer* of this
file; the app is its *producer*. This is what makes the design below possible
without touching the plugin.

**A conversation renderer already exists.**
`renderer/components/project-view/ConversationPreview.tsx` is its own module
(rendered by `ProjectView.tsx`) that loads a session's history over
`project:conversation-history` and renders chat bubbles — user right in accent,
assistant left in inset — with a header carrying **Resume in Claude** and
**Open full transcript**. It renders plain text on purpose (comment at
`:139-140`), a decision this spec reverses explicitly.

**A per-tool card renderer already exists.**
`renderer/components/tool-views/ToolBody.tsx:888` switches on `tool.toolName`.
`Bash` is not its own view — it returns `<ShellView commandField="command">`,
the same component the MCP PowerShell tool uses. A second, independent Bash
parser already exists: `renderer/components/ToolCard.tsx:36-51`
(`friendlyToolDisplay`) reads the command to build the collapsed header label.
Any new Bash-command matcher must be shared with it or the header and body will
disagree.

**Two transcript readers already exist.** `loadHistory()` in
`main/session-browser.ts:597` returns `HistoryMessage[]` — prose only, Claude
JSONL only, gated by `SAFE_ID_RE`, and keeps assistant messages only where
`stop_reason === 'end_turn'`. `parseTranscriptLine(line, sessionId)` in
`main/transcript-watcher.ts:40` is exported, emits full tool events, and is
pure except for a `Date.now()` at `:57`. Neither is used by this design as-is.

**The Resume Browser already distinguishes the two non-resumable states.**
`main/session-browser.ts:577-578` computes `missingProject` / `notSyncedYet`;
`renderer/components/ResumeBrowser.tsx:979` renders *"Not synced to this device
yet"* vs *"Project folder not on this device"*. This design reuses both the
computation and the copy.

**The artifact viewer is registry-driven.**
`renderer/components/artifact-views/RendererRegistry.ts` maps extension → view;
`jsonl` is unmapped and falls to the code editor.

**Markdown filepath chips are gated on `sessionId`.**
`renderer/components/MarkdownContent.tsx:272` enables `rehypeFilepathTokens`
only when a `sessionId` prop is supplied.

**Bundled plugins install once and are never upgraded automatically.**
`main/skill-provider.ts:803-812` — `ensureBundledPluginsInstalled` is
install-if-missing, so an existing install keeps its `chatsearch.js`
indefinitely. A manual `skills:update` path exists (`skill-provider.ts:284`,
driven only from the marketplace UI), but nothing invokes it for bundled
plugins, and the marketplace entry carries no version the app could compare.
**This is the finding that reshaped the design** (see A): anything the cards
depend on must not require a plugin change.

**Tool output can be truncated by three producers.** The native harness caps
Bash output (`main/harness/tools/truncate.ts`: by chars with a `[...]` marker,
by lines with `[... N lines omitted ...]`), and Claude Code truncates long tool
results in the transcript with `… [N characters truncated] …`. A `find` page at
the default limit of 20 is ~1.5k characters, far under any cap; a wide
`limit` is not, and any marker in the output disqualifies the card.

## The constraint that shapes the design

The two actions have different prerequisites, and that — not how much data
exists — is what separates them.

**Preview needs the transcript bytes.** Those are always present. Every
conversation transcript is mirrored to the synced space at
`~/YouCoded/Personal/Conversations/<provider>/transcripts/<key>/<id>.jsonl`.
Measured: all 1,697 Claude entries carry a `transcriptPath`, and 1,694 point
at a file that exists — the 3 exceptions are exactly the tombstones.

**Resume needs the bytes *and* a working directory to launch into.** The
transcript half is solvable: the materialize sweep already copies from the
space into `~/.claude/projects/`, where `claude --resume` expects it. The
directory half often is not — a conversation recorded on another machine names
a folder that does not exist here.

Measured on this device:

| | count |
|---|---|
| Claude conversations chatsearch can find | 1,697 |
| Resumable — project folder present locally | 557 |
| Not resumable — **project folder absent** | 1,137 |
| Not resumable — transcript merely unmaterialized | **0** |

No conversation is blocked by the recoverable condition; every blocked one is
blocked because its working directory is missing. Native is not affected the
same way (62 of 64 local). The ratio is specific to this device — a machine
where most work was done locally would invert it.

**Design consequence:** both actions are first-class. Preview must work for
every conversation, including every one resume cannot reach. Resume must state
which prerequisite is missing rather than presenting a dead control.

## Architecture

The two card renderers (A, A2) and the drawer list (D) are the only genuinely
new UI. Everything else extracts, widens, or guards something that exists.

### A. Chatsearch result card (`tool-views/`)

When the model runs `chatsearch find`, render the result as a list of session
rows instead of raw text. Each row: title, date, project, state marker, tags,
and two buttons — **Preview** and **Resume**.

The affordance requires no cooperation from the model beyond using the tool.
This is why cards and not link-parsing: prose parsing only fires when the model
happens to write an id, and models usually write a title instead.

**Selection.** Dispatch in `ToolBody` is by `toolName`, and on both lanes
chatsearch runs as `Bash` (the Claude lane's Bash tool and the native harness's
Bash tool both arrive as `toolName === 'Bash'`). So the card is selected by matching the command
string against `chatsearch.js` — parsing a command *we* emit, not model prose.
One shared helper (`describeChatsearchCall(tool)`) answers "is this a chatsearch
call, and which subcommand?" for **both** `ToolBody` (the body) and `ToolCard`
(the header label), so the two can never disagree. The subcommand is read from
the **output**, never inferred from the command line — `cmd` defaults to
`'find'` when absent (`chatsearch.js:982`) and the request may arrive on stdin
(`:1017-1018`).

**The card resolves short ids against the app's own index — the plugin does
not change.** The human table (`formatRows`, `chatsearch.js:341`) carries a
short id prefix, day, project name, marker, title, tags, and nothing else — no
full id, no `transcriptPath`, no `provider`. The 2026-08-10 draft solved this
by having the CLI emit a hidden machine-readable block. That design fails on
the finding above: bundled plugins never upgrade, so the block would never
reach an existing install and the cards would silently not exist for exactly
the users with the most history. Instead:

1. The card parses the rows it needs from the table: short id, and (for
   display only) the marker.
2. It calls **`chatsearch:resolve(shortIds[])`** — a new IPC channel — and main
   resolves each prefix against the index it wrote, returning the full entry
   plus resumability (`projectSlug`, `projectPath`, `missingProject`,
   `notSyncedYet`) computed by the same code the Resume Browser uses.
3. Title, date, project, and tags on the card come from the **resolved entry**,
   not the table — the table is only the list of *which* ids.

A short id is a unique prefix by construction (`shortIdMap`, `chatsearch.js:325`,
minimum 4 chars). Main resolves it the same way the CLI does — prefix match
over the same file — and reports `ambiguous` or `unknown` per id rather than
guessing. This works against every installed plugin version today, and it
keeps every path on the main-process side of IPC.

**Fallback is mandatory, not defensive.** Render as plain `Bash` whenever the
output cannot be parsed into rows. Three real paths reach that state:

1. **Table-format skew.** If a future plugin release changes the table, the
   parser fails cleanly and the text output is still correct and readable. The
   parser targets the format installed everywhere today.
2. **Pipes and redirects.** `… chatsearch.js '{"cmd":"show"}' | head -40`
   both defeats the command match and truncates the stdout the card needs. Any
   pipe or redirect in the command string disqualifies the card, as does the
   `[...]` truncation marker in the output.
3. **Non-table output** — the no-index message, the staleness-only response,
   an error. Plain `Bash`.

Unresolvable ids (`unknown` / `ambiguous` from `resolve`) keep their row but
render it inert with the reason; the rest of the list still works.

### A2. `show` renders a presented conversation card

`find` answers "what's out there"; `show <id>` answers "this one". Both render
as cards, with different layouts: `find` a list of rows, **`show` a single
conversation presented prominently, with Preview and Resume**.

`show`'s `metadataBlock` (`chatsearch.js:761`) already prints the full id,
`provider`, `originalPath`, and `transcriptPath`, so the full id parses
directly; the card still goes through `chatsearch:resolve` for resumability
and so both cards share one data path.

This is the intentional-display primitive — the model presents a conversation
by running `show` on it. No signalling channel back into the app is needed: the
tool call and its output already land in the transcript, and the card is simply
how they render. Identical on both lanes.

**The skill should say: when you name a specific past conversation to the
user, `show` it — one `show` per named conversation, never a page of them.**
That reconciles with the existing token-discipline text ("never `show` a whole
page of `find` results") rather than contradicting it. This instruction lives
in `wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/SKILL.md`, a
separate repo on its own cadence, and **because bundled plugins never upgrade
it will reach existing installs late or never**. The app therefore never
depends on it: the `find` card works regardless; the `show` card is the bonus
when the instruction is followed. Closing the upgrade gap is a ROADMAP item,
not this design's job.

**Cards open expanded.** Ordinary tool cards collapse to a one-line header
(`ToolCard.tsx:958`). A card whose whole point is two buttons must not hide
them, so chatsearch cards start expanded — decided from the command string, so
the card is open before the output arrives. Destin can reverse this at the
first look.

**Copy is centralized.** Every sentence the feature shows — button labels,
disabled reasons, gap markers, and the main-process error strings — lives in
one `COPY` table in `shared/chatsearch-refs.ts`, so the workbench can show all
of it at the gate, including errors the backend will not produce until later.
The lane is never shown raw: `providerLabel()` maps `claude` → "Claude Code"
and `native` → "YouCoded assistant".

**Grouping — designed, built only on request.** In v1 as planned, a `show`
call renders inside the tool group like any tool, expanded. The design pass
(plan Task 4) shows Destin exactly that: `Read → show → Read` in one group.
The mechanism below exists so that, if he wants `show` set apart, the answer
is already worked out — it is **not** built unless he asks. (An earlier draft
made it unconditional; the review found it also contradicted the
"subcommand from the output, never the command" rule, because at tool-use time
there is no output yet — placement would have to be guessed from the command,
which is acceptable only as an opt-in.)

`show` cards must not be pooled with unrelated tool cards. Today
`TRANSCRIPT_TOOL_USE` (`renderer/state/chat-reducer.ts:1143`) places every call
via `placeToolInCurrentGroup` (`:117`) into `currentGroupId`, a single pointer
that the reducer resets to `null` at **six** sites (`:533`, `:934`, `:973`,
`:1022`, `:1072`, `:1363` — end of turn, user prompt, user message, assistant
text, reasoning, skill invocation). A `show` immediately after a `Read` would share that `Read`'s group.

The requirement is:

```
Read → show → Read     ⇒ 2 groups: [Read, Read] and [show]
```

Two, not three. The surrounding run of ordinary tools must survive.

**Mechanism: a segment, not a group.** `ExitPlanMode` already solves this shape.
`injectPlanSegment` (`chat-reducer.ts:214`, called from both branches of the
`TRANSCRIPT_TOOL_USE` case) pushes a
`{type:'plan'}` segment into the turn at the right position, and the
`AssistantTurnSegment` union (`renderer/state/chat-types.ts:28-45`) already
carries `text`, `reasoning`, `tool-group`, and `plan`.

So a `show` call pushes a `{type:'session-card'}` segment at its sequential
position and **skips the group append entirely**. `currentGroupId` is never
read or written on that path — which is exactly why the six reset sites do not
matter to it — so the trailing `Read` finds the same group still current and
joins it. If built, this must be applied on **every** branch of
`TRANSCRIPT_TOOL_USE` that places a tool — including the permission-placeholder
branch (`chat-reducer.ts:1186-1250`), which is the one Bash takes in the
default "ask" mode; a reducer test that only exercises the normal path passes
while the common real path fails.

This is deliberately *not* a per-affinity map keyed off `currentGroupId`:
`currentGroupId` is serialized state (`chat-types.ts:193`, `:714`, `:766`,
`:798`) crossing the remote WebSocket, so widening it is a wire-format change.
The segment approach changes no serialized scalar.

- Consecutive `show` calls each get their own segment, in order.
- A `show` is never inside a tool group, in either direction.
- Ordinary tools separated by a `show` stay in one group.
- Only `show` gets a segment. `find` renders inside its group like any tool.

**Consequence to accept:** the trailing `Read` renders *above* the `show`
card, because it joins a group positioned earlier in the turn. Inherent to the
requirement, not the mechanism; the only alternative is three groups.

**Unknown segments must render as nothing, not crash.** The serializer
(`chat-types.ts:754`) passes `assistantTurns` through structurally, so a new
segment type crosses to remote clients automatically. The renderer does not
switch on `segment.type`; it folds segments into bubbles in `splitIntoBubbles`
(`AssistantTurnBubble.tsx:204`) with an `if reasoning / else if text / else if
plan / else` chain whose **final `else` assumes `tool-group`** and reads
`seg.groupId`. An older remote bundle meeting a `session-card` therefore pushes
`undefined` as a group id — not graceful degradation. This design gives the new
type its own branch *and* turns the trailing `else` into an explicit
`tool-group` check with an ignore-unknown fallback. It cannot fix bundles
already shipped; it makes the *next* skew safe. `chat-serialization.test.ts`
seeds `segments: []` and pins nothing about segment shapes — it gains a
populated-segments golden case as part of this work.

The helper that selects the card also decides the segment, so grouping and
rendering can never disagree about what a call is. One function, two consumers.

### B. Conversation renderer (extracted)

Extract the bubble list out of `ConversationPreview.tsx` into a standalone
component. `ConversationPreview` keeps the `ProjectDetailOverlay` chrome, the
Project View wiring, and its data loading; what moves out is the bubble list and
its scroll-to-latest behavior, taking `HistoryMessage[]` as a prop. Two hosts
then share one renderer.

**Change from today's behavior: render markdown.** The plain-text choice holds
for a 20-message preview of your own recent work. It does not hold for "open
this to remember what we decided" — code blocks and lists rendering as raw text
is materially worse. Route content through `MarkdownContent`. Project View
inherits the improvement.

**Pass no `sessionId`.** Supplying one for a historical transcript would render
clickable file chips that resolve against the *current* session's project —
frequently a folder that does not exist on this device. Formatting is wanted;
filepath resolution is not.

### C. Transcript reader (main process) — keyed by id, not path

Today's path is project-scoped and local-only:
`project.conversationHistory(projectPath, sessionId)` → slug → `loadHistory` →
`~/.claude/projects/<slug>/<id>.jsonl`. A chatsearch hit is not necessarily in
a saved project, and two thirds of hits have no transcript in
`~/.claude/projects/` — their bytes live only in the synced mirror.

The 2026-08-10 draft passed a `transcriptPath` over IPC and built a containment
boundary around it. **This revision keys the reader by id instead:**

```
chatsearch:read({ provider, id, tail, before? })
  -> { ok: true, messages: TranscriptMessage[], hasMore: boolean }
  where TranscriptMessage = HistoryMessage & { seq: number; droppedToolCalls: number }
```

`seq` is the message's ordinal in the full conversation (so `before: seq` pages
backwards); `droppedToolCalls` is how many tool-use events sat between the
previous kept message and this one — the count the renderer's marker shows.

Main looks the id up in the index it wrote. **No in-app reader of that index
exists today** — the only consumer is the CLI, which parses the JSON itself —
so a small `readMetaFile(dir, provider)` in `main/chatsearch-index/` is part of
this work. Main prefers the local transcript when present (authoritative and
current: `~/.claude/projects/<slug>/<id>.jsonl` for Claude,
`~/.youcoded/sessions/<slug>/<id>.jsonl` for native), and falls back to the
`transcriptPath` recorded in the entry. **The renderer never sends a path.** That shrinks the attack
surface from "any path the renderer names" to "any id that exists in our
index", which is the correct shape for a channel reachable over the remote
WebSocket.

Requirements:

1. **Both formats.** Claude JSONL and the native transcript shape both produce
   `HistoryMessage[]` — that shared shape is the seam; the renderer never learns
   there were two formats. Both parsers are new: `main/chatsearch-index/
   index-core.ts` extracts **user turns only** on both lanes, so nothing
   existing yields assistant text. The native file is line 1 = header
   (`NativeSessionHeader`), lines 2+ = `TranscriptEvent` — `user-message` and
   `assistant-text` carry `data.text`; `tool-use` / `tool-result` are the
   dropped (counted) events.
2. **Containment stays, as defense in depth.** Even though the path comes from
   our own index, `realpath` the candidate and require it to sit under one of
   the three legal roots — `~/.claude/projects` (Claude local),
   `~/.youcoded/sessions` (native local), or the conversation space root
   (`<personalRoot>/Conversations`, **resolved at call time** via
   `getManagedRoots().personalRoot` — its location is user-configurable). A
   tampered or stale index entry then fails closed. The legacy symlink
   population lived in exactly this space.
3. **Refuses subagent transcripts explicitly** — see C2.
4. **Always bounded — there is no `all`.** The caller asks for a tail of N and
   pages backwards with `before`. An unbounded read means a 42 MB worst case
   crossing IPC and then a `react-markdown` + `rehype-highlight` pass per
   bubble, inside a 480px pane, on Android. "Load older" is an explicit user
   action.
5. **Id shape is validated before disk** — session-UUID only, the same
   `SAFE_ID_RE` discipline `loadHistory` already has.

### C2. Subagent transcripts must never surface as conversations

Claude Code writes each subagent's transcript to its own file, nested under the
parent session:

```
~/.claude/projects/<slug>/<parent-session-id>/subagents/agent-<hash>.jsonl
```

Measured: 1,134 of 1,743 transcript files are subagent files; 1,131 are entirely
`isSidechain: true`, the 606 session transcripts contain none, and no file
mixes the two.

None currently reach the store, the space, or the index — but only because
both enumerators (`main/conversations/reconciler.ts:126`,
`main/session-browser.ts:351`) do a flat `readdir` filtered on `.jsonl`, and
subagent files are one directory deeper. **Incidental, not guarded.** The
exclusion becomes explicit:

- Reject any resolved path with a `subagents` segment.
- Reject any id not matching the session-UUID shape.
- Reject a transcript whose message lines are entirely `isSidechain: true` — a
  content check that survives a future layout change.

A subagent transcript is not a conversation the user had. Surfacing one as a
past session would be a fabrication, not merely noise.

### C3. Keep every assistant message — do not inherit `loadHistory`'s filter

`loadHistory` keeps assistant messages only where `stop_reason === 'end_turn'`.
Measured on the largest local transcript (42.2 MB, 15,554 lines): of 1,405
assistant text messages, **270 kept and 1,135 dropped** — about four fifths.
Separately, 2,717 tool calls and results are absent because `HistoryMessage[]`
cannot represent them.

The `end_turn` filter is a heuristic, right for a short preview of your own
recent work and wrong for "open this to remember what we decided," where the
reasoning between tool calls is often the part worth reading. **C is a new
reader, so it does not inherit the filter.** Keep every assistant text block;
drop only tool-use and tool-result blocks.

What remains omitted is tool *activity* (Open question 1). Because something is
still omitted, **the renderer must say so**: where tool calls were dropped
between two messages, show a count marker rather than a seamless join. The
reader returns the count per gap; a marker assigned to no phase never ships.

### D. Session references (Session Drawer)

Sessions previewed during a chat accumulate in a **Referenced conversations**
list in the Session Drawer, so they remain reachable after the search scrolls
away. Clicking one reopens it in the artifact pane.

**This deliberately does not use `ArtifactRecord`.** `ArtifactKind` is
`'internal' | 'external'` (`shared/artifacts/types.ts:4`) — inside vs outside
the project root, not a content type — and an artifact carries `versions[]`,
`status`, and edit/save affordances that are meaningless for a read-only
transcript. It would also put `.jsonl` files into the Files list, which the
artifacts rule records as tried and removed the same day.

So: a sibling concept that reuses the artifact **pane** and not the record
model.

**Two fields, one reducer invariant — not a consolidation.** The drawer
resolves its viewer via `allArtifacts.find(a => a.id === activeArtifactId)`
(`SessionDrawer.tsx:174`), and `activeArtifactId` is not drawer-local: it is
derived from the artifact reducer (`renderer/state/artifact-tracker.ts` —
`activeArtifactBySession`, `ACTIVE_ARTIFACT_SET` / `ACTIVE_ARTIFACT_CLEARED`),
read at eight sites in `SessionDrawer.tsx` and five more in
`project-view/tabs/FilesTab.tsx` under the reserved `PV_SESSION` key. The
2026-08-10 draft replaced it with one discriminated `activePaneItem` field so
"artifact and preview both set" is unrepresentable. That is the nicer type,
but it rewrites thirteen sites across two surfaces — one of them (Project
View) unrelated to this feature — for a property a three-line reducer rule
also delivers. So instead:

- a sibling field `activeSessionPreviewBySession: Record<string, { provider;
  id } | null>`, plus `referencedSessionsBySession` for the list;
- **the Referenced conversations list is a cut candidate.** It is the one
  surface with no evidence of need (the cards stay in the chat; the pane alone
  delivers the objective). It is built last in the design phase and Destin
  keeps or cuts it at the gate;
- `ACTIVE_ARTIFACT_SET` clears the preview, `SESSION_PREVIEW_SET` clears the
  artifact, `DRAWER_CLOSED` clears both — and a reducer test pins all three;
- the drawer renders the preview pane when the preview field is set, the
  artifact view otherwise. One new branch; no existing read site changes.

If a later feature adds a third kind of pane content, that is the moment to
consolidate.

References are per-session, live in reducer state, and are not persisted in v1.

### E. Resume

Routes to the existing `handleResumeSession` in `App.tsx:2301` — sessions are
already tabs, so "resume in a new tab" is the current flow. Its signature is
eight positional parameters (`claudeSessionId, projectSlug, projectPath,
resumeModel?, resumeDangerous?, launchInNewWindow?, provider?, nativeBinding?`);
this design calls it as-is and does not refactor the signature.

Everything E needs — `claudeSessionId`, `projectSlug`, `projectPath`,
`provider`, and the two resumability flags — comes back from
`chatsearch:resolve` (A), so E depends on A and on nothing in the plugin.

The two lanes differ: the native branch deliberately does **not** auto-launch.
`App.tsx:2917` threads `provider` so a native session lands in the pre-resume
model picker, and `App.tsx:3503` shows that path completing only once a
`ModelBinding` exists. Native Resume from a card is therefore card → model
picker → launch, and the card carries `provider` to know which flow it starts.

Where resume is not possible, the button is disabled and says which reason
applies, reusing the Resume Browser's copy: *"Project folder not on this
device"* vs *"Not synced to this device yet"*. Preview stays enabled in both
cases. Never imply the conversation does not exist.

### Deferred: catching a bare id in prose

If the model answers without running `show`, no card appears. The fallback
would be detecting a conversation id written in prose and rendering an inline
chip — the rehype-plugin approach `rehypeFilepathTokens` already establishes.
Deliberately **not** in v1: it only fires when the model writes an id, which it
usually does not. Add it only if cards are observably missing in practice.

## Data flow

```
model runs `chatsearch find` (or `show <id>`)
  → Bash tool call + stdout land in the transcript
  → describeChatsearchCall(tool): chatsearch? which subcommand? (from output)
  → not chatsearch / piped / unparseable → plain Bash            [A fallback]
  → short ids (find) or full id (show) parsed from the table      [A, A2]
  → chatsearch:resolve(ids) → entries + resumability             [A, IPC 1]
  → rows (find) or one presented conversation (show)
  → `show` renders as its own turn segment, never inside a group [A2]

user clicks Preview
  → reference added to the drawer's list                          [D]
  → SESSION_PREVIEW_SET { provider, id } (clears the artifact)  [D]
  → chatsearch:read({ provider, id, tail })                     [C, IPC 2]
  → HistoryMessage[] + dropped-tool counts → bubbles + markers    [B]

user clicks Resume
  → handleResumeSession(id, slug, path, …, provider)             [E]
  → new tab (claude) / model picker then tab (native)
  → or disabled with the specific reason
```

## Error handling

Per `docs/error-message-standards.md`, and the honesty rules the chatsearch CLI
already follows:

- **Transcript unreadable** — say the transcript could not be read and surface
  the real reason. Never render an empty bubble list as though the conversation
  were empty.
- **Tombstoned conversation** (metadata kept, bytes gone) — Preview is disabled
  and says the transcript is no longer on disk. The conversation happened.
- **Id unknown or ambiguous in the index** — the row stays, inert, saying so.
  Never drop the row: the model is talking about it.
- **Output not parseable as a table** — silently fall back to plain `Bash`.
  The text output is still correct and readable. Not a failure.
- **Piped or redirected invocation, or truncated output** — same fallback.
- **Resolved path outside the legal roots, or a subagent transcript** — refuse
  in main and log. The renderer is not the boundary.
- **`not-implemented-on-mobile`** (Android) — not a card; plain `Bash`. No
  error surface.

## Interaction details

- **Dismissing a preview** returns the pane to whatever it showed before, or
  closes it if it was closed. Opening a preview while an artifact is open swaps
  the pane and is reversible — it must not discard an unsaved edit. The
  existing `useUnsavedGuard` (`artifact-views/UnsavedChangesDialog.tsx:62`,
  destructured as `guardUnsaved` in `SessionDrawer.tsx:214`) covers this; note
  it also self-registers globally (`registerDirtyEditorGuard`), and two hosts
  already mount it — the pane-swap path must go through it, not around it.
- **Narrow viewport.** The conversation renderer becomes a new child of
  `.drawer-pane`, and `.claude/rules/narrow-viewport.md` records that the pane
  collapsing to 100% does **not** resize its children — a child pinned to
  `--right-pane-width` (480px) hangs outside an `overflow:hidden` box on a
  390px screen. The renderer sizes to its parent and is checked at narrow
  width.

## Cross-platform parity

The cards, the extracted renderer, and the drawer list are renderer-only, so
**Android inherits them through the shared React bundle**.

Two new IPC channels — `chatsearch:resolve` and `chatsearch:read` — are
four-surface work (`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`,
`SessionService.kt`) plus a `remote-server.ts` WS case, pinned by
`tests/ipc-channels.test.ts`.

**Android has no chatsearch index.** Verified 2026-08-25: the only mention of
chatsearch under `app/src` is the bundled-plugin id list — there is no Kotlin
index builder, so there is nothing for `resolve` or `read` to answer from.
Both channels therefore get the same `not-implemented-on-mobile` stub the
`project:*` family uses (`SessionService.kt:3686-3698`), and the card treats
that reply as "not a card": the search output renders as plain `Bash`, exactly
as today. That is an honest degradation, not a broken button. An Android index
is a separate feature (it would be the chatsearch spec's phase, not this one).

**A phone browsing a desktop session over the remote WebSocket** is the case
that does work: the WS case runs in desktop main, against desktop's index and
transcripts. The `remote-shim` sends an object payload; preload sends
positional args — both existing conventions, mirrored exactly.

The chat state shape is **unchanged**: `session-card` is additive to a union
the serializer already round-trips, no serialized scalar changes type, and the
new default branch means a future unknown segment renders as nothing.

## Testing

| Area | Guard |
|---|---|
| Visual design | Destin's sign-off in the workbench (Step 1) — no build phase starts without it |
| Table → ids | Unit — `find` rows and `show` metadata parse to ids; truncated, piped, non-table, no-index outputs all yield "not a card" |
| `describeChatsearchCall` | Unit — shared by `ToolCard` and `ToolBody`; one table of inputs |
| `chatsearch:resolve` | Unit — exact, prefix, ambiguous, unknown, tombstone; resumability flags match `session-browser`'s |
| **`show` segment placement** | **Reducer unit: `Read → show → Read` ⇒ exactly 2 groups; consecutive `show`s each get a segment; `currentGroupId` unchanged across the `show` path; `find` does NOT get a segment** |
| Unknown segment | Renderer unit — a segment with an unrecognized `type` renders nothing and does not throw |
| Serialized chat shape | `chat-serialization.test.ts` gains a populated-segments case including `session-card` and `plan` |
| Claude transcript → `HistoryMessage[]` | Unit — intermediate assistant text kept, tool blocks dropped, per-gap dropped count emitted |
| Native transcript → `HistoryMessage[]` | Unit, fixture-based |
| Path containment | Unit — traversal, foreign root, symlink inside a legal root pointing out |
| Bounded reads | Unit — no unbounded path exists; `before` pages backwards; `hasMore` truthful |
| **Subagent exclusion** | **Fixture with nested `<session>/subagents/agent-x.jsonl`: the reader refuses it, and neither the reconciler nor `listPastSessions` enumerates it** |
| Local-vs-mirror preference | Unit — both present, mirror only, neither |
| New IPC channel parity | `ipc-channels.test.ts` |
| Renderer extraction | `ConversationPreview` keeps its behavior (now with markdown) |
| Pane exclusivity | Reducer unit — `SESSION_PREVIEW_SET` clears the artifact, `ACTIVE_ARTIFACT_SET` clears the preview, `DRAWER_CLOSED` clears both |
| Narrow viewport | Workbench at 390px: preview pane fully inside the drawer |

The two transcript readers share one fixture-driven contract test — one shape,
two producers.

## Phasing

### Step 0 — go / no-go: use phase 1 by hand

The handoff records that phase 1 search has never been exercised by a person
and lists six checks (recall, cross-device rows, tombstone honesty, drill-down
cost, unprompted use, freshness). ~20 minutes in a dev instance, Destin decides.
If recall is poor, this feature builds a better frame around the wrong picture
and the fix is chatsearch work, not this spec.

### Step 1 — visual design with Destin, in the UI Workbench

**Nothing else starts until this is signed off.** There are two looks: a short
one after the cards alone exist (before any pane or drawer state is built on
their layout), and the full gate. Both happen in the workbench against a fake
`chatsearch` namespace whose fixture index has one entry per state — resumable,
folder-missing, not-synced, tombstone, assistant-lane, untitled, unreadable —
and a scenario conversation that replays `Read → show → Read` through the real
reducer, so `show`'s placement is seen, not described. Every new surface is built
against fake data in the workbench (`bash scripts/run-workbench.sh`) and
iterated back-and-forth with Destin until the look and feel are approved:

- the `find` result rows (title, date, project, state marker, tags, Preview /
  Resume);
- the `show` spotlight card, and how it reads differently from a row;
- the read-only conversation preview in the artifact pane — bubbles, markdown,
  the "N tool calls omitted" marker, the load-older control, and the disabled
  / tombstone / unreadable states;
- the **Referenced conversations** list in the Session Drawer;
- Resume's two disabled reasons, and the native lane's model-picker step.

This is deliberately iterative and deliberately first. The rest of this spec
describes *behavior*, not *appearance*; appearance is decided by looking, not
by prose. The reader, the IPC channels, and the reducer segment are **not
built until the UI they serve has been seen and approved** — a backend built
first locks in assumptions the design pass would have changed (what the card
needs to carry, how much of a transcript a preview shows, what the drawer list
is for).

Workbench mechanics: channels the mockup needs that have no backend yet go in
`MOCK_ONLY`, which then *is* the backend to-do list for the build phases; check
the preview pane at narrow width, not only in the drawer at desktop width; run
`node scripts/workbench-boot-check.mjs` after any change to the mock shim.

### Build phases (after Step 1 sign-off)

1. **Resolve + reader + IPC** (A's `chatsearch:resolve`, C, C2, C3) —
   id-keyed, both formats, bounded, contained, subagent-refusing, keeping
   intermediate assistant text. Testable with no UI.
2. **Renderer extraction** (B) — markdown with no `sessionId`, and the
   dropped-tool-count marker. Project View regression-checked.
3. **Result cards** (A, A2) — built in Step 1 against the fake namespace;
   nothing to add here beyond the unknown-segment ignore branch and the
   serialization golden case.
4. **Drawer references** (D) — built in Step 1; the list survives only if
   Destin kept it.
5. **Resume wiring** (E) — both lanes, native via the model picker.
5b. **`show` as its own segment** — only if Destin asked for it at Step 1.
6. **Skill instruction** (`wecoded-marketplace/youcoded-chatsearch/SKILL.md`)
   — "show the conversation you name". Separate repo, separate cadence, reaches
   existing installs late or never; the app never depends on it. Can land any
   time after Step 1.

All depend on Step 1. Within them, 1 and 2 are independent and can run in
parallel; 3 depends on 1 and 2; 4 depends on 2 and 3; 5 depends on 3. 6 is
free-standing.

## Decisions

- **Cards over link-parsing.** Prose parsing only fires when the model writes
  an id, which it usually will not.
- **`show` is the spotlight primitive.** A dedicated "display this session"
  tool would need a signalling channel on the `claude` lane, where chatsearch
  is a bash script that cannot reach the UI.
- **Resolve ids in the app; do not change the plugin.** Bundled plugins never
  upgrade, so a plugin-side channel would never reach existing installs. The
  app owns the index; resolving a short id against it is one IPC call and
  works against every installed version today. (Reverses the 2026-08-10 draft.)
- **Reader keyed by id, not path.** The renderer never names a path; main
  looks it up in its own index. Containment stays as defense in depth.
- **One shared matcher** for the card body and the header label.
- **Both actions are first-class.** Preview works everywhere; resume says
  which prerequisite is missing when it cannot.
- **Reuse `ConversationPreview`'s renderer.** One way to read a conversation.
- **Markdown on, `sessionId` off.**
- **Keep intermediate assistant text.** The `end_turn` filter is a preview
  heuristic; inheriting it would discard four fifths of the reasoning.
- **A turn segment, not a group-affinity map — and only on request.** In v1
  `show` renders inside the group, expanded; the segment is built if Destin,
  having seen that, wants it set apart. No change to serialized state either way.
- **Cards open expanded.** Two buttons behind a collapsed header is no card.
- **Copy centralized; lanes labelled for humans.** One `COPY` table; never a
  raw `native`.
- **Step 0 is a go/no-go on phase 1 recall.** The handoff's own precondition.
- **Give unknown segments an explicit ignore branch now.** It cannot repair shipped
  bundles; it makes the next skew safe.
- **Session references are not artifacts.** Reuse the pane, not the record.
- **Two pane fields with a reducer rule, not one discriminated field.** Same
  guarantee, thirteen fewer call sites touched. (Reverses the 2026-08-10 draft.)
- **Reads are always bounded.** No `all`; tail plus explicit paging.
- **`handleResumeSession` is called as-is.** Its eight-parameter signature is
  a separate cleanup, not this design's.
- **Tool activity in v1 = a count marker only.** Collapsed one-line entries
  are the next step, not this one.

## Open questions

1. **Tool activity in the preview.** v1 shows a per-gap count. The next step
   would be collapsed one-line entries ("Edited `harness-session.ts`", "Ran
   `npm test`"), expandable to raw input/output: one more reader branch and one
   more renderer branch. Deferred, not foreclosed.
2. **Persisting references across restarts.** v1 keeps them in reducer state
   only. A store decision, not a renderer one.
3. **Freshness of a mirrored transcript.** A conversation previewed from the
   synced mirror may be behind the originating device's latest turns. Whether
   the preview should say so, and how it would know, is unresolved.
4. **Bundled-plugin upgrades.** Out of scope here and tracked in ROADMAP; until
   it exists, any plugin-side change (including phase 6) reaches existing
   installs only on a fresh install.
