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

**Ids already line up.** A chatsearch entry's `id` is the same identifier the
Resume Browser uses as `PastSession.sessionId`. Measured against disk: 599 of
600 local Claude JSONL filenames match a chatsearch id; 62 of 64 native. No
translation layer is needed.

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

Five components. Only the first is genuinely new UI.

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

The CLI's stdout stays human-readable. The card parses the same rows the model
reads. If parsing fails, fall back to the existing plain `Bash` rendering — a
search that displays as text is degraded, not broken.

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

### C. Transcript reader (main process)

Today's path is project-scoped and local-only:
`project.conversationHistory(projectPath, sessionId)` →
`ccProjectSlug(projectPath)` → `loadHistory` → reads
`~/.claude/projects/<slug>/<id>.jsonl`.

A chatsearch hit is not necessarily in a saved project, and two thirds of hits
have no transcript in `~/.claude/projects/` — their bytes live only in the
synced mirror. So this component adds a **path-based** reader:

```
readConversation(transcriptPath, provider, { count, all }) -> HistoryMessage[]
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
   must contain resolved paths to the two legal roots (`~/.claude/projects`,
   the conversation space) and refuse anything else. Reachable over the remote
   WebSocket, so this is a real boundary, not a formality.
4. **Refuses subagent transcripts explicitly** — see below. Root containment
   alone does not cover this: a subagent transcript sits *inside* a legal root.

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

**Known fidelity limit.** `HistoryMessage[]` carries no tool activity, and
`loadHistory` keeps assistant messages only where `stop_reason === 'end_turn'`.
Measured on the largest local transcript (42.2 MB, 15,554 lines): 351 user
messages kept; 1,405 assistant text messages present but **270 kept, 1,135
dropped**; 2,717 tool calls and 2,717 tool results **not shown at all**.

That is acceptable for v1 — the common question is "what did we decide", which
lives in the prose. It is recorded here because it is invisible in the UI: a
preview that silently omits four fifths of what the assistant said should not be
described to the user as "the conversation". See Open questions.

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
not the artifact **record model**. Concretely, `SessionDrawer` resolves its
viewer today via `allArtifacts.find(a => a.id === activeArtifactId)`; this adds
a parallel active-reference state and a branch in the render, rather than
synthesizing fake artifact records.

References are per-session, live in reducer state, and are not persisted in v1.

### E. Resume

Routes to the existing `handleResumeSession` in `App.tsx` — sessions are already
tabs, so "resume in a new tab" is the current flow.

Where resume is not possible, the button is disabled and says which of the two
reasons applies, reusing the Resume Browser's existing distinction: *"Project
folder not on this device"* vs *"Not synced to this device yet"*. Preview stays
enabled in both cases. Never imply the conversation does not exist — it does;
only its local prerequisites are missing.

### Deferred: intentional spotlight

An explicit "show this session" tool the model calls on purpose is a real
addition, but not the foundation, and is out of scope for v1.

On the `native` lane it is clean — a harness tool via `buildAiTools()`. On the
`claude` lane chatsearch is a bash script that **cannot touch the app's UI**; it
would need a signalling channel back in (remote server, hook-relay pipe, or a
watched file). That asymmetry is real work and a place the lanes would drift.
The result card gets the same affordance with none of it, so build that first
and add the spotlight only if it is missed.

## Data flow

```
model runs `chatsearch find`
  → Bash tool call + stdout land in the transcript
  → ToolBody selects the chatsearch card
  → rows parsed from stdout                        [A]

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
- **Card parse failure** — silently fall back to plain `Bash` rendering. No
  error surface; the text output is still correct and readable.
- **Path outside the legal roots** — refuse in main and log. The renderer must
  not be the boundary.

## Cross-platform parity

The result card, the extracted renderer, and the drawer list are renderer-only,
so **Android inherits them through the shared React bundle** at no extra cost.

The path-based reader is new IPC and therefore three-surface work — `preload.ts`,
`remote-shim.ts`, `ipc-handlers.ts`, plus `SessionService.kt` — pinned by
`tests/ipc-channels.test.ts`. Keeping the new surface to exactly one channel is
a design goal, not an accident: everything else was deliberately arranged to
avoid crossing that boundary.

## Testing

| Area | Guard |
|---|---|
| Row parsing from CLI stdout | Unit, incl. malformed input → fallback |
| Native transcript → `HistoryMessage[]` | Unit, fixture-based |
| Claude transcript → `HistoryMessage[]` | Unit, pinning the existing filters |
| Path containment | Unit — traversal + foreign-root refusal |
| **Subagent exclusion** | **Fixture with a nested `<session>/subagents/agent-x.jsonl`: the reader refuses it, and neither the reconciler nor `listPastSessions` enumerates it. This is the pinning test the current implicit behavior lacks.** |
| Local-vs-mirror preference | Unit — both present, mirror only, neither |
| New IPC channel parity | `ipc-channels.test.ts` |
| Renderer extraction | `ConversationPreview` keeps its current behavior |

The two readers should share one fixture-driven contract test, in the spirit of
`sync-transport-contract.ts` — one shape, two producers.

## Phasing

1. **Reader + IPC** (C) — path-based, both formats, contained. Testable with no UI.
2. **Renderer extraction** (B) — plus the markdown change. Project View regression-checked.
3. **Result card** (A) — the visible feature.
4. **Drawer references** (D) — accumulate and re-open.
5. **Resume wiring** (E) — smallest piece; depends on nothing above.

1 and 2 are independent and can run in parallel. 3 depends on both.

## Decisions

- **Result card over link-parsing.** Parsing prose only fires when the model
  writes an id, which it usually will not.
- **Preview is primary, resume secondary.** Two thirds of hits are not
  resumable on this device; preview covers all of them.
- **Reuse `ConversationPreview`'s renderer.** One way to read a conversation,
  not two.
- **Markdown on.** Reverses a deliberate plain-text choice whose rationale does
  not extend to this use case.
- **Session references are not artifacts.** Reuse the pane, not the record model.
- **Spotlight tool deferred.** Costs a lane-asymmetric signalling channel for an
  affordance the card already provides.

## Open questions

1. **Tool activity in the preview.** v1 shows none, and drops ~81% of assistant
   text on tool-heavy sessions. The likely next step is collapsed one-line tool
   entries ("Edited `harness-session.ts`", "Ran `npm test`"), expandable to
   raw input/output. That is a change to the *reader's* filters plus one
   renderer branch — same component, no rewrite. Deferred, not foreclosed.
2. **Persisting references across restarts.** v1 keeps them in reducer state
   only. Persisting is a store decision, not a renderer one.
3. **Freshness of a mirrored transcript.** A conversation previewed from the
   synced mirror may be behind the originating device's latest turns — sync is
   not instantaneous. Whether the preview should say so, and how it would know,
   is unresolved.
