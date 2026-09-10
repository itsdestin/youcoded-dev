---
status: shipped
branch: session/context-truncation
---

# Backend for "What the assistant was given"

The panel is built and approved (contract `session-context-panel.contract.json`, 31 rows).
Nothing feeds it. This is the design for what does.

## What the code actually does — three surprises

The panel was designed against a mental model that the code does not match. All three were
found by reading the harness on 2026-09-10, before writing any of this.

### 1. Almost nothing is truncated at session start

Only ONE thing is cut when a chat begins: the root instruction file (`CLAUDE.md` /
`AGENTS.md`), outlined by `fitProjectInstructions` into the byte-stable system prompt.

Everything else is **on demand**:

| Thing | When it is loaded | When it is cut |
|---|---|---|
| Root `CLAUDE.md` | session start | session start (`fitProjectInstructions`) |
| Project rules (`.claude/rules/*.md`, nested `CLAUDE.md`) | the first time a tool touches a matching path | at that moment (`fitInjection`) |
| A skill | when the model calls `Skill`, or the user types `/name` | at that moment (`fitInjection`) |
| MCP servers | session start | session start (whole servers dropped from the end) |

So a panel that only reported "what was cut at session start" would report the instruction
file and the dropped servers, and nothing else — on most sessions, an empty list.

**Decision:** the panel reports what the assistant *has been given or can be given*, and
marks each item as either already cut or **would be shortened when used**. The distinction
is carried in each item's own note, in the future tense where it belongs. Predicting is
honest because the prediction runs the exact same `fitInjection` the real path runs, against
the same budget — it is not a guess.

### 2. On a small model the whole skill catalog is silently dropped

`exposeSkillCatalog` requires a window of at least 32,768 tokens. Below that the `Skill`
tool is never attached, so the model is **never told any skill exists**. The user can still
run one by typing `/name`, but the assistant cannot reach for one on its own and nothing
anywhere says so.

This is the single biggest thing the panel has to report, and it was not in any fixture.
It is exactly the roadmap item this feature was filed for.

### 3. Skill bodies are far too big to push

47 skills are installed on this machine, 619 KB of `SKILL.md` in total, largest 33 KB.
Pushing all of it (twice — the given text and the full text) at every session start, into
renderer state, and over a WebSocket to a phone on mobile data, is not acceptable.

**Decision:** two channels. The session-start push carries the **inventory** — names, paths,
sizes, and whether each was or would be cut. The text of one file is fetched when the user
opens that row. On disk that read is about a millisecond, so a row still opens to its text;
the deck's behaviour is unchanged.

## Data flow

    session create/resume
      → NativeSessionHost builds a SessionContext (inventory only)
      → emits 'session-context'
      → ipc-handlers: sendForSession + remoteServer.broadcast + buffer for reconnect
      → renderer: SESSION_CONTEXT reducer action (already exists)
      → strip renders; panel renders on Details

    user opens a row
      → window.claude.native.sessionContextText({ sessionId, kind, id })
      → main reads the file, runs the real fitter, returns { text, fullText }
      → the row shows the comparison

### Channel A — `native:session-context` (push)

Fired once per session, on create AND on resume, for every native session including ones
that started with everything intact (contract R28: a chat given nothing extra still shows
the line).

Payload is the existing `SessionContext`, moved from `chat-types.ts` to `shared/types.ts`
so main can build it. Bodies are omitted; each item carries what the list needs.

### Channel B — `native:session-context-text` (request)

`{ sessionId, kind: 'project' | 'rule' | 'skill', id }` → `{ text, fullText, path }`,
or a coded refusal. Runs the same fitter with the same budget the session was sized with,
so what it shows is what the model would actually receive.

## Where each field comes from

| Field | Source |
|---|---|
| `modelLabel`, `contextWindowTokens` | the session's `ModelBinding` + `contextLength` |
| `systemPromptSections` | `assembleSystemPrompt` returns them instead of only a string |
| `projectInstructions` | `fitProjectInstructions`, whose `truncated` flag is currently thrown away |
| `skills` | the session's scoped `SkillCatalog`, plus a size check per skill |
| `tools` | the session's own attached tool names |
| `droppedMcpServers` | `HarnessSession.droppedMcpServers`, which has had no consumer until now |

`assembleSystemPrompt` keeps its signature and its exact output. A new
`assembleSystemPromptParts` returns the same sections the string is joined from, and the
old function becomes the join of the new one — so the assembled prompt cannot drift from
what the panel claims it is.

## Claude Code sessions — open question

Contract R23 says **every** chat carries the line. But a Claude Code session's instructions
are assembled by the Claude Code CLI, not by YouCoded: the app does not build its system
prompt, does not read its skills, and does not cut anything for it. There is nothing
truthful for the panel to report beyond the model and its window.

Three ways to go, none of them free:

- **No line on Claude Code chats.** Truthful, but breaks R23 and means most of Destin's
  own chats never show it.
- **A line that says so** — "Claude Code manages its own instructions for this chat" — with
  a panel holding only the model, the window, and that sentence. Truthful and keeps R23,
  but it is new wording he has not approved, and four of the five tabs would be empty.
- **Report what YouCoded can see** (the instruction file on disk, the installed skills)
  without claiming Claude Code loaded it. Fullest, and the most likely to mislead.

Left for Destin. The native path does not depend on it and is built first.

## Not doing

- **Re-trimming on a model switch.** The system prompt is assembled once and never
  rewritten — that is what keeps the cached prefix stable for local models. Switching
  models mid-chat does not re-cut anything, so the panel keeps reporting the model the
  session started on, and must not imply otherwise.
- **Specialist children.** They get their own cold-start context; no strip, no panel.
