---
status: active
---

# Chat Search — design

A token-efficient search layer over every past YouCoded conversation, reachable
from both Claude Code and native harness sessions. It answers "I vaguely
remember working on X — did we finish it, and do the docs reflect the latest
conversation about it?" and supports bulk tag/note management through
conversation.

**This is a backstop, not the primary knowledge mechanism.** `ROADMAP.md`,
`docs/`, the rules ladder, and pinning tests remain the system of record. Chat Search
exists for what those miss: work the assistant forgot to record, and sessions
that were interrupted before anything got written down.

---

## Problem

Knowledge capture in this workspace is deliberate — a session is supposed to
land its outcome in `ROADMAP.md`, a doc, a rule, or a test. Two failure modes
escape that:

1. **The assistant forgets to record.** Nothing in the repo reflects the work.
2. **The session is interrupted.** The work happened; the recording step never
   ran.

Today the only recovery is the Resume Browser — a list of titles ordered by
recency. It cannot answer "which conversations touched X," and it cannot tell
finished work from abandoned work beyond the manually-set `complete` flag.

Destin's stated question shape:

> "Hey, I vaguely remember working on X. Did we finish that? Do docs reflect the
> most recent conversation on that topic?"

The second half is answerable by the *asking* agent once Chat Search names the
conversation and its date — it can then read the repo itself. Chat Search's job is
the first half plus the pointer.

## Non-goals

- **Not a replacement for `ROADMAP.md` or the docs.** No feature here should
  make it more attractive to skip recording an outcome.
- **Not an in-app UI.** The index could later back a Resume Browser search box;
  that is out of scope. This ships agent-facing only.
- **Not a semantic/embedding search.** Lexical search over the user's own turns
  plus metadata filters is the scope. Embeddings would add a model dependency
  to the *find* path, which the design deliberately keeps free.
- **Not cross-device index sync.** The index is derived data, rebuilt per
  device. Syncing it would drag it into the conflict-merge machinery for zero
  gain.

---

## Prior art (surveyed 2026-08-05)

The design's two bets — lexical search over raw transcripts, plus an optional
digest layer — match what shipped and what's published:

- **Anthropic's claude.ai chat search is the same architecture.** Two model-visible
  tools (`conversation_search` for keyword queries, `recent_chats` for
  time-based browsing — the same split as `find <query>` vs bare `find`),
  searching **raw transcripts, no pre-computed summaries**, with an optional
  editable memory layer added later. Their published context-engineering
  guidance explicitly favors just-in-time lexical/agentic retrieval over
  pre-computed embedding indexes for agent memory.
- **ChatGPT's memory is the opposite bet and shows the failure mode.** Its
  "reference chat history" injects a pre-computed dossier (summaries of recent
  conversations, inferred preferences) rather than searching, and demonstrably
  cannot recall old specifics. This is why `show` reads raw bytes and digests
  are pointers into transcripts, never replacements.
- **The OSS ecosystem validates demand but nothing is reusable.** claude-mem
  (~72k stars) is the category giant — hooks + SQLite FTS5 + Chroma + MCP, the
  heavyweight pipeline this design deliberately avoids; its progressive
  disclosure contract (compact hits ~50–100 tokens, expand by id) is the shape
  `find` → `show` already has. raine/claude-history proves lexical-only search
  over CC JSONL works well in practice. The agent-memory frameworks (Mem0,
  Letta, Zep, Cognee) are all embedding/graph extraction pipelines with a
  model in the write path — a different problem. **None of them has per-work-
  item status (`resolved | open | abandoned`); Tier 3 is the differentiator.**

---

## Corpus

Two provider lanes, both already modelled by the Conversation Store:

| Lane | Local transcript | Store record |
|---|---|---|
| `claude` | `~/.claude/projects/<ccProjectSlug>/<id>.jsonl` | `~/YouCoded/Personal/Conversations/claude/<id>.json` |
| `native` | `~/.youcoded/sessions/<cwdToProjectSlug(cwd)>/<id>.jsonl` | `~/YouCoded/Personal/Conversations/native/<id>.json` |

Both mirror into the synced space under
`<provider>/transcripts/<key>/<id>.jsonl`.

Three existing invariants the index builder inherits and must not violate
(`youcoded/docs/conversations.md`):

- **`lstat` + symlink skip.** The legacy sync system symlinked every
  conversation into the home-directory slug — 687 such 73-byte symlinks were
  found in the wild. Following them mis-attributes every linked conversation to
  the home basename. The builder uses `lstatSync` and skips symlinks, exactly
  as the reconciler does.
- **Lane prefix assertion.** A record whose provider is `native` must not carry
  a `transcriptRef` pointing into the `claude/` lane (or vice versa). The
  builder refuses such records rather than indexing them under the wrong
  provider.
- **`Untitled` is a placeholder.** Literal `Untitled`, blank, and `New Session`
  all fall through to the derived-title chain rather than being treated as real
  titles.

These guards live today only in the CC lane — `reconciler.ts` is CC-only by
design, the native lane has no reconciler at all, and `NativeHome.listSessionFiles()`
enumerates `~/.youcoded/sessions/` with a plain `readdirSync`, no symlink
skip. The index builder is therefore the **first thing ever to cold-scan the
native lane**, so it cannot inherit the invariants by imitation. Phase 1
**extracts** the lstat/symlink-skip and lane-prefix guards into shared pure
helpers — one implementation, one pinning test. Shipped 2026-08-05 as
`conversations/lane-guards.ts` with **six** importing modules (measured, not
estimated: `rg -l lane-guards desktop/src/` → `reconciler.ts`, `service.ts`,
`native-home.ts`, `chatsearch-index/{index-store,index-service,meta-builder}.ts`).
An earlier draft of this line said "three call sites"; that was an undercount.
Note also that the builder does **not** consume `NativeHome.listSessionFiles()` —
it resolves native transcript paths itself from store records.

The two slug encodings differ deliberately (`ccProjectSlug` uppercases a
lowercase Windows drive letter; `cwdToProjectSlug` does not). The builder reads
paths from the store record's `transcriptRef` and never derives slugs itself.
No records predate the field (verified 2026-08-05: 0 of 1690 on-disk records
lack the key; `RECORD_SCHEMA_VERSION` has only ever been 1). Records with an
*empty* ref do exist, but they are phantom metadata-only seeds — epoch
`lastActive`, blank title, the shape `pruneNativePhantomRecords`
(`conversations/service.ts`) exists to clean up — and the builder skips them
rather than inventing a path for them.

---

## Architecture

### Where the logic lives

`youcoded/desktop/src/main/chatsearch-index/`, split pure-core / IO-shell in
the same shape as `conversations/`.

**Why not `conversation-index/`:** that name is taken. The retired legacy
`~/.claude/conversation-index.json` still has live residual readers on both
platforms — `session-browser.ts` `readIndexMeta`; on Android, `SyncService.kt`
pushes/pulls it and `SessionService.kt` both reads it and **writes** user-set
flags through it (`SessionBrowser.kt` mentions it only in comments) — and the
name appears across ~19 source files plus several docs.
Sessions navigate this workspace by grep; giving the new system the old
system's name invites exactly the confusion the rules exist to prevent.
`chatsearch` names the module, the plugin, the CLI, and the derived-data
directory (`~/.youcoded/chatsearch/`) consistently.

- `index-core.ts` — pure. Turn extraction from a JSONL buffer, index line
  encode/decode, query parsing, result ranking, digest input assembly, digest
  output parsing. No `fs`/`path`/`os`.
- `index-store.ts` — IO shell. Builds and refreshes the derived index files,
  reads raw transcripts for `show`.
- `digest.ts` — the model pass: input construction, call, parse, incremental
  merge.
- `index-service.ts` — module singleton, lifecycle, the quiescence hook.

**Why in the app rather than in the plugin:** the path rules, slug divergence,
symlink hazard, lane assertions, and tag-merge semantics all already live in
`src/main/`. A second implementation in a plugin would drift from them
silently, and two of those rules exist because drift already caused incidents.

### How agents reach it

A new bundled plugin, `wecoded-marketplace/youcoded-chatsearch/`, containing:

- `skills/chatsearch/SKILL.md` — when to use it, the command surface, the output
  format, and the token discipline (start with `find`, expand only what you
  need).
- `skills/chatsearch/scripts/chatsearch.js` — a thin Node client. Reads the
  denormalized index files directly for queries; writes go to the outbox (see
  Writes). No bundled plugin ships a `bin/`-style Node CLI. Two script layouts
  are live in the marketplace — theme-builder keeps its Node scripts
  (`.js`/`.cjs`) under `skills/theme-builder/scripts/`, marketplace-publisher
  uses a top-level `scripts/` — and chat search uses `skills/chatsearch/scripts/`
  because the script belongs to the skill that documents it.

**The split is denormalization, not duplicated logic.** The app is the only
thing that knows store semantics, slug encodings, symlink hazards, and lane
rules — it bakes their results into the index files. The CLI's read path is
then genuinely dumb: ripgrep a JSONL file, join against a flat metadata map,
format. It contains no knowledge of the Conversation Store at all, so there is
nothing for it to drift from beyond the file format, which golden tests pin.

Added to `BUNDLED_PLUGIN_IDS` (`desktop/src/shared/bundled-plugins.ts`) and its
required Kotlin mirror (`app/.../skills/BundledPlugins.kt`).

**Why this reaches both harnesses today:** `skill-scanner.ts` scans
`~/.claude/plugins/<id>/skills/`; the native harness's `skill-catalog.ts` reads
the same roots; native ships a `bash` tool. One caveat: models running with
`maxToolPresentation: 'simplified'` never get autonomous skill selection
(`capability-profile.ts`), so weak local models use chat search only when the user
asks for it — capable models pick it up on their own.

**Android is out of scope for phase 1.** The index producer is desktop
main-process code, and Android has no Conversation Store mirror (verified: no
Kotlin reader or writer of `Personal/Conversations` exists), so the index
files would have no producer there. The CLI detects the missing index
directory and says exactly that — "no chat search index exists on this device" —
rather than returning empty results. A Kotlin producer is future work.

### Why not MCP (yet)

| | Skill + CLI | MCP server |
|---|---|---|
| Reaches native today | Yes | No — `feat/native-mcp-phase1` is unmerged |
| Per-turn context cost, CC | ~20 tokens (one skill description line) | Small — CC defers MCP schemas, name-only until used |
| Per-turn context cost, native | ~20 tokens | Full schemas every turn — `buildAiTools()` (`harness/harness-session.ts`) re-emits every attached tool's full schema each turn with no deferral mechanism (`harness/tools/registry.ts` is only the `defineTool` execution wrapper), and `capability-profile.ts` marks weak models `maxToolPresentation: 'simplified'` precisely because extra schemas hurt their tool-calling |
| Argument safety | Shell quoting is a foot-gun — mitigated by taking the request on stdin as JSON | Typed, free |
| Failure mode | Fresh process per call; cannot wedge a session | Long-lived process; can hang |
| Testing | Golden-output tests over a fixture directory | Needs a client harness |

The decisive asymmetry: MCP is nearly free on CC and expensive on native, and
native is where the small, context-constrained models run.

**This is not a lock-in.** Transport is orthogonal to logic. If native MCP
lands and typed arguments prove worth it, an MCP server becomes a second thin
shell over the same `chatsearch-index/` core. Ship the CLI first.

### Why not no index at all

The cheapest alternative is a skill that greps raw transcripts under
`~/.claude/projects/` directly — zero build cost, works today. Rejected as the
baseline rather than the design: it cannot see the native lane at all (slugs,
symlinks, store metadata), CC transcripts are mostly injected boilerplate and
tool output so matches drown in noise, a 44MB transcript makes both the grep
and the follow-up reads token-expensive, and there is nowhere to hang tags,
flags, or digest state. Tier 2's derived file is exactly that grep with each of
those problems removed.

---

## The index

Three tiers, each usable without the one above it.

### Tier 1 — metadata

Read from the Conversation Store, not re-derived: id, provider, project name,
original path, title, `lastActive`, `createdAt`, `complete` and `priority` as
plain booleans, tags, `note`, `lastUsedModel`. Plus cheap per-transcript
stats: byte size, turn count, first/last turn timestamps. The snapshot never
exposes raw flag-map internals (`tag:<id>` keys) — only resolved values.

Free, no model, no staleness beyond the store's own.

The app writes this **denormalized** to `~/.youcoded/chatsearch/<provider>-meta.json`
— a flat map of conversation id to a metadata snapshot. Two fields are resolved
at write time specifically so the CLI never needs store knowledge:

- **`tags`** carries tag *labels*, already resolved through the tag registry,
  not raw `tag:<id>` flag keys.
- **`transcriptPath`** carries the resolved absolute local path, so `show
  --turns` reads raw bytes without touching slug derivation, the `ccProjectSlug`
  / `cwdToProjectSlug` divergence, or the symlink hazard.

The meta file is rewritten at app start, on the quiescence signal, and
(debounced) on every `SESSION_META_CHANGED` broadcast. The last trigger is
load-bearing: without it, a tag applied in the app UI — or through the outbox
itself — would be invisible to `find` until the next launch, and the outbox
could ack a write whose result the CLI's own next read cannot see.

### Tier 2 — user turns only

A derived file per provider at
`~/.youcoded/chatsearch/<provider>-turns.jsonl`, one line per user message:

```json
{"c":"<conversationId>","t":142,"ts":"2026-07-26T18:04:11Z","x":"the actual message text"}
```

**Why user turns only:** your messages are a small fraction of transcript bytes
but carry all the intent — the ask, the correction, the "actually let's do Y."
Assistant output and tool results are where the bulk sits (a 44MB transcript
was observed in the wild) and where the noise sits. Indexing your turns makes
"I vaguely remember working on X" both precise and cheap, and keeps the whole
index small enough to rebuild from scratch without ceremony.

**What counts as a user turn:** CC transcripts are full of user-*role*
messages that are not the user — system reminders, hook output, CLAUDE.md
injections. `session-browser.ts` already solved this for title derivation:
the "real conversational prompt" gate (`type === 'user' && !isMeta &&
promptId`, skip `<`-prefixed injected wrappers). That gate moves into
`index-core.ts` as the single definition of a user turn, and
`session-browser.ts` consumes it from there. Without it the index bloats
with the same injected boilerplate on every conversation and `find` hits
garbage.

**Search mechanism:** `@vscode/ripgrep` is already a dependency. Search is
ripgrep over the derived file — no SQLite, no FTS engine, no native module to
rebuild against Electron's ABI. The file is plain JSONL, so it stays readable
by the agent's own Grep tool if the CLI is ever unavailable.

**Freshness:** rebuilt incrementally. Each provider file carries a sidecar
`~/.youcoded/chatsearch/<provider>-turns.state.json` recording, per conversation,
the byte offset consumed and the transcript size at that point. A transcript
that grew is appended from its offset; one that shrank (CC `/clear` rewrites,
`cleanupPeriodDays` deletion) is re-read from zero — and the shrink path also
marks that conversation's digest stale (see Tier 3), since the digest's turn
numbers now point into a transcript that no longer matches. Refresh runs at
app start and on the same quiescence signal the digest uses.

Refreshes only happen while the app runs, but Claude Code sessions happen
whether or not it does — so staleness is surfaced where the agent will
actually see it: `find` itself prints a one-line banner when the index is
older than 24 hours (see Command surface), rather than relying on the agent
to run `status` first.

### Tier 3 — digests

Per conversation, at `~/.youcoded/chatsearch/digests/<provider>/<id>.json`:

```json
{
  "conversationId": "...",
  "provider": "native",
  "digestedThroughTurn": 187,
  "digestedThroughBytes": 4210338,
  "model": "deepseek/deepseek-v4-flash",
  "items": [
    {
      "title": "Permission ask timeout",
      "status": "resolved",
      "evidence": "merged to master as youcoded#284",
      "turns": [12, 96]
    },
    {
      "title": "Comparison view for session diffs",
      "status": "open",
      "evidence": "sketched the reducer shape, never implemented",
      "turns": [97, 187]
    }
  ]
}
```

`status` is one of `resolved | open | abandoned | unclear`.

**Why per work item rather than per conversation:** a long session covers
several tasks, and its tail only reflects the last one. A conversation-level
verdict reads "complete" whenever the final task finished, which is exactly the
failure Destin identified. Resolution has to attach to threads of work inside
the conversation.

**The `complete` flag always wins.** `SessionFlagName = 'complete' | 'priority'`
(`src/shared/types.ts:737`). When `complete` is set, the conversation reports
resolved regardless of digest contents; item-level statuses remain visible but
are advisory. The manual flag is the user's assertion and is never overridden
by inference.

**Staleness:** when the Tier 2 shrink path fires for a conversation, its
digest gets `"stale": true`. A stale digest still shows in `find` / `show`,
clearly marked, but its turn ranges are untrusted — `show` will not resolve
`--turns` through them — and the next lazy trigger re-digests from zero.

---

## Digest generation

**Off by default.** Nothing runs until the Preferences toggle is on.

### Triggers (all lazy — no bulk pass ever runs unasked)

1. **Re-open / resume.** A conversation resumed on this device digests its new
   turns.
2. **Session quiesce.** A session that goes quiet digests its delta, on the
   same quiescence gate `noteSessionEnded` uses (poll until transcript size is
   stable across one 750ms probe, max 6s; skip on timeout). `waitForQuiescence`
   has two callers with opposite timeout policies — chat search inherits
   `materializeOne`'s skip-on-timeout contract, not `flushSessionToSpace`'s
   push-anyway variant.
3. **On demand from a query.** When `find` narrows to a small candidate set and
   the caller passes `--verdicts`, up to N (default 5) undigested candidates are
   digested inline. The response states which ones it digested, so the cost is
   never silent.
4. **Explicit backfill.** `chatsearch backfill --since <date> [--project <p>]`
   estimates the number of conversations and total input tokens, and requires
   `--yes` to proceed. Never automatic.

### Input construction

Per conversation, the digest sees: every user turn, plus the final two
assistant messages of each turn window. Tool calls, tool results, and
intermediate assistant text are excluded.

**Why:** this is a few percent of transcript bytes and preserves the task
sequence — what was asked, what was corrected, and how each stretch concluded.
It also bounds the input so a 44MB transcript remains digestible.

If the assembled input still exceeds the selected model's context window
(runtime discovery first; `known-models.ts` `maxContextWindow` is only a
documented sanity ceiling, per `capability-profile.ts`), the digest chunks by
turn window and merges item lists across chunks.

### The call

Shaped like the native auto-title feeder — the one existing background model
call in the main process (`ipc-handlers.ts` / `native-title-feeder.ts`):
`providerRegistry.languageModel(binding)` → `generateText` with a bounded
`AbortSignal.timeout`, and the feeder's contract of "unresolvable = skip
silently, never an error event." A digest that fails or times out leaves no
partial state; the trigger simply fires again later.

### Incrementality

A resumed conversation re-digests only turns after `digestedThroughTurn`. The
incremental pass's input includes the existing item list, with the
instruction to reuse titles for continuing items and revise statuses — a work
item marked `open` last week becomes `resolved` when later turns finish it.
Feeding the prior items in is what makes title-match identity actually hold;
a model re-summarizing new turns cold would never reproduce last week's
titles verbatim. Turn-range overlap stays as the fallback, not the common
path.

**Why this matters:** without revision, a stale `open` sticks around after the
work is done, and the tool starts lying in exactly the direction that wastes
your time.

### Model selection

A picker over configured providers, reusing `ModelPicker`
(`components/model/ModelPicker.tsx` — `NativeModelSelect` no longer exists;
ModelPicker is the unification that replaced it). The
list is **not** filtered to cheap models — restricting it would be guessing at
Destin's cost tolerance. Default is unset; with the toggle on and no model
selected, the digest does not run and `chatsearch status` says so plainly.

---

## Command surface

The CLI takes its request on **stdin as JSON**, not argv, so quotes, newlines,
and `$` in a query can never be mangled by the shell. Argv flags are accepted
for simple cases; the skill teaches the stdin form for anything with
punctuation.

### `find`

Filters, all combinable, all optional. With no query at all, `find` is a pure
browse.

| Filter | Notes |
|---|---|
| `query` | Lexical, over user turns. Absent = browse. |
| `--project <p>` | Matches folder basename or full path. |
| `--tag <label>` | By **label**, not internal id — the agent never sees `tag_` ids unless it asks. Repeatable (AND). |
| `--provider claude\|native` | |
| `--state resolved\|open\|unknown\|any` | `resolved` = `complete` flag set, or every digest item resolved. `open` = any item `open` **or `abandoned`** — unfinished is what's being hunted. `unknown` = no flag and no digest, or only `unclear` items. Default `any`. |
| `--since` / `--until` | Dates or relative (`30d`). |
| `--limit` | Default 20. |

Output — one line per hit, roughly 15 tokens each. When the index is older
than 24 hours, the first line is a staleness banner (`index last refreshed 3d
ago — open YouCoded to refresh`), so a stale answer is never silent:

```
a3f2  2026-07-26  youcoded      ✓  Permission ask timeout          #perm #ui
9c14  2026-07-22  youcoded-dev  ○  Native runtime parity program   #native
1b07  2026-07-19  youcoded      ?  Remote hydration hardening
```

`✓` complete flag or all items resolved · `○` has open items · `?` no digest.
Ids are shortened to the first unambiguous prefix. `--verdicts` adds a
one-line reason per row and may trigger inline digesting (see above).

### `show <id>`

Default: title, project, dates, flags, tags, note, digest items, first user
message, last exchange.

- `--turns A-B` — raw transcript for that range, **including assistant output
  and tool calls**.
- `--around <turn>` — a window centred on a hit.
- `--tail [n]` — how the session ended.

**Why raw access matters:** summaries are for *finding*; knowing what was
actually implemented or how a session ended must come from real bytes. The
index deliberately does not store assistant text, so `show` reads it from the
transcript on demand.

### `tag` / `untag` / `note`

Accept multiple ids for bulk work:

```
chatsearch tag a3f2 9c14 1b07 --add sync --remove wip
chatsearch note a3f2 "superseded by the M2 work"
chatsearch flag a3f2 --complete
```

### `status`

Index freshness per provider, digest coverage (`412 conversations, 38
digested`), whether digesting is on, which model, and whether the app is
reachable.

---

## Writes

Writes go through a **file outbox**, not the remote server.

The CLI drops a mutation file at `~/.youcoded/chatsearch/outbox/<uuid>.json`
(`{op: "tag" | "note" | "flag", ids, payload}`). The running app watches the
directory, applies each mutation through the real `tag-registry-service` /
store path — so `SESSION_META_CHANGED` fires and the merge semantics stay in
exactly one place — then writes `<uuid>.ack.json` with the result. The CLI
waits ~2s for the ack and reports it. The app also drains the outbox at
launch.

**Why not `remote-server.ts`:** an earlier draft routed writes there, but
that only works in an uncommon configuration — remote access is off by
default (`remote-config.ts`), auth hard-fails with `no-password-configured`
when no password is set, and the server binds all interfaces rather than
loopback, so lowering its auth bar for a local CLI is not an option. The
outbox has no auth surface at all: filesystem permissions are the auth,
which is the right trust model for a same-user local process. It also
matches how the app already ingests external signals (topic files, hook
outputs, transcript watching).

**Why not write the store JSON directly:** direct writes bypass the app's
`SESSION_META_CHANGED` broadcast, so an open window shows stale tags until
something refreshes it, and they would duplicate the tag-registry merge
semantics — which already exist (`conversations/tag-registry-core.ts`,
`src/shared/tags.ts`, `tags:*` / `session:set-tag` / `session:set-note` IPC)
and which exist in their current form because convergent-merge bugs bit twice.

**When the app is down**, a mutation queues instead of failing — the launch
drain applies it, and the tag registry's convergent merge was built to absorb
exactly this. The CLI reports the true state, per
`docs/error-message-standards.md`:

```
Queued: YouCoded is not running. The change applies the next time it opens.
```

Read paths (`find`, `show`, `status`) work against the denormalized index
files directly and do **not** require the app, so chat search degrades to
read-only-plus-queued-writes rather than to nothing when the app is down.
`status` reports index age in that case, since a long-closed app means a
stale index.

---

## Concurrency and atomicity

`~/.youcoded/` is shared by **every** app instance. `run-dev.sh` isolates
`userData` and ports only; `~/.youcoded/` and `~/YouCoded/` are resolved
straight from `os.homedir()` (`native-home.ts`, `sync-spaces/managed-roots.ts`)
with no profile component, so the live app and any dev instance all see the
same `chatsearch/` directory and the same outbox. This workspace routinely runs
both at once — multi-writer is the normal case, not an edge case.

Four rules:

- **All writes route through `NativeHome`.** It is the declared single writer
  for `~/.youcoded/` (ADR 008, `native-home.ts` header) and its mkdir-based
  file lock (`mutateFileUnderLock`, the same primitive the tag registry uses)
  exists precisely because "dev instance + built app can both be running
  against the same home dir." Chat Search's meta snapshots, state sidecars, and
  acks are written under it.
- **One builder at a time.** The refresh cycle takes a `chatsearch/.build-lock`
  (mkdir lock with stale-lock takeover); an instance that fails to acquire
  skips the cycle instead of double-appending to `turns.jsonl`. Digest
  triggers sit behind the same lock — otherwise two instances pay the model
  twice for the same conversation.
- **Outbox claims are atomic renames.** A consumer claims a mutation by
  renaming it into `outbox/processing/`; rename is atomic on one filesystem,
  so exactly one instance wins even with several watchers. Claim → apply →
  ack → delete. The CLI deletes the ack after reading it; the launch-time
  drain also sweeps acks and orphaned `processing/` files older than a day,
  so the directory cannot accumulate.
- **Every JSON file lands via temp-then-rename** — outbox mutations (written
  by the CLI), acks, meta snapshots, state sidecars. A watcher never observes
  a half-written file, so the "malformed file → error ack" path fires only on
  genuinely malformed input, never on a slow flush. The one append-in-place
  file, `turns.jsonl`, is single-writer under the build lock, and the CLI
  tolerates a torn final line by dropping any line that fails to parse.

---

## Settings

Settings has no tab bar — `DefaultsButton` (`components/SettingsPanel.tsx:1631`)
is a `SettingRow` that opens the **Session Defaults** dialog (default model,
skip-permissions, project folder, close-session prompt). That row and dialog
are renamed **Preferences**, and a new section lands inside the dialog:

- **Summarize conversations for search** — toggle, **off by default**.
- **Model** — provider/model picker, shown only when the toggle is on.
- An (i) explainer, per the accessibility pillar: what gets sent to the model
  (your messages plus how each stretch ended), what it is used for, that it is
  stored locally and never synced, and that it costs tokens.

Open question: whether the existing defaults controls get their own "Session
defaults" group heading inside the renamed dialog, or stay flat alongside the
new section.

---

## Testing and guards

| Guard | What it pins |
|---|---|
| `tests/chatsearch-index-core.test.ts` | Turn extraction from both lanes' JSONL shapes, **including the injected-content gate** (`isMeta` / `<`-wrapped turns excluded); index line round-trip; query parsing; ranking. |
| `tests/chatsearch-index-store.test.ts` | Incremental refresh: grown transcript appends from offset, shrunk transcript re-reads from zero **and marks the digest stale**, **symlinked transcript is skipped**, lane-prefix violation is refused, phantom record (empty `transcriptRef`) is skipped, **a second builder skips the cycle while the build lock is held** — exercised via the shared lane-guard helpers, so the reconciler and `NativeHome.listSessionFiles()` are pinned by the same code path. |
| `tests/chatsearch-cli-output.test.ts` | Golden output for `find` / `show` / `status` against a fixture transcript directory, including the staleness banner. Pins the format the skill documents — the thing most likely to drift. Also: a torn final `turns.jsonl` line is dropped, not crashed on. |
| `tests/chatsearch-outbox.test.ts` | Mutation file → applied through `tag-registry-service` → ack written; malformed outbox file gets an error ack, not a crash; launch-time drain applies queued mutations; **two concurrent consumers race one mutation and exactly one applies it** (atomic-rename claim). |
| `tests/digest-incremental.test.ts` | A resumed-session fixture: only new turns are sent, **with the prior item list in the input**; an `open` item flips to `resolved`; item identity survives the merge. |
| `tests/bundled-plugins-parity.test.ts` (**new**) | `BUNDLED_PLUGIN_IDS` matches the ids parsed out of `BundledPlugins.kt`. No such check exists today — `skill-provider-bundled.test.ts` never reads the Kotlin file, so parity is comment-enforced only; adding chat search to both lists is the moment to close that gap. |

The digest tests use a fake model client; no test makes a network call.

---

## Phasing

Each phase is independently useful and independently shippable.

1. **Index + read-only CLI.** Tiers 1 and 2, `find` / `show` / `status`, the
   plugin, the skill, both bundled lists. No model, no settings, no writes.
   This alone answers "did we talk about X, when, in what project, is it
   flagged complete." Includes extracting the shared lane guards
   (symlink-skip, lane-prefix) consumed by the builder, the reconciler, and
   `NativeHome.listSessionFiles()`.

   **Release-ordering constraint:** bundled plugins install from the
   marketplace repo over the network (`skill-provider.ts` fetches
   raw.githubusercontent.com and fails for unpublished ids), so
   `youcoded-chatsearch` must be merged into `wecoded-marketplace` **before** the
   app release that adds it to `BUNDLED_PLUGIN_IDS` / `BundledPlugins.kt` —
   otherwise first-launch install fails silently.
2. **Writes.** `tag` / `untag` / `note` / `flag` through the outbox.
3. **Digest.** Tier 3, the four lazy triggers, the Preferences section, the
   model picker.

Desktop-only in all three phases; Android needs a Kotlin index producer that
does not exist yet (see Architecture).

Building in this order keeps the digest an enhancement rather than a
dependency — which matters, because it ships off by default.

---

## Decided

- **Name — `chatsearch`** (2026-08-05). Names the plugin (`youcoded-chatsearch`),
  the CLI, the skill, the module (`chatsearch-index/`), and the derived-data
  directory (`~/.youcoded/chatsearch/`). Verified collision-free across
  `youcoded/desktop/src`, `youcoded/app/src`, and `wecoded-marketplace`.
  Says what it is in words a non-developer reads correctly, per the
  accessibility pillar.
- **Retention — tombstones** (2026-08-05). When a transcript is gone (CC's
  `cleanupPeriodDays` deletion, manual removal), the metadata row and any
  digest are **kept and marked `tombstone: true`**, not pruned. Answering about
  a conversation whose bytes are gone is the backstop's most valuable case.
  Requirements that follow: `find` marks tombstoned rows (`†`) so a dead
  pointer is never mistaken for a live one; `show` on a tombstone prints the
  metadata and digest and states plainly that the transcript no longer exists,
  rather than failing on the missing file; `--turns` / `--around` / `--tail`
  refuse with that same message; the Tier 2 refresh never deletes a
  conversation's turn lines just because the source file vanished.

## Open questions

1. **"Session Defaults" grouping** — whether the existing defaults controls
   get their own group heading inside the renamed Preferences dialog.
2. **Remote sessions.** A session running against a remote YouCoded instance
   reaches a different machine's index. Out of scope for phase 1; worth
   confirming the CLI fails clearly rather than silently searching the wrong
   corpus.
3. **Digest editability.** claude.ai's memory summary is user-viewable and
   editable; chat search's digests are model-written JSON the user can only
   regenerate. A correction channel (edit an item's status, delete a bogus
   item) may matter once digests inform `--state` filtering — phase 3 call.
