---
status: draft
---

# Conversation Recall — design

A token-efficient search layer over every past YouCoded conversation, reachable
from both Claude Code and native harness sessions. It answers "I vaguely
remember working on X — did we finish it, and do the docs reflect the latest
conversation about it?" and supports bulk tag/note management through
conversation.

**This is a backstop, not the primary knowledge mechanism.** `ROADMAP.md`,
`docs/`, the rules ladder, and pinning tests remain the system of record. Recall
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

The second half is answerable by the *asking* agent once Recall names the
conversation and its date — it can then read the repo itself. Recall's job is
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

The two slug encodings differ deliberately (`ccProjectSlug` uppercases a
lowercase Windows drive letter; `cwdToProjectSlug` does not). The builder reads
paths from the store record's `transcriptRef` where available and only falls
back to slug derivation for records that predate it.

---

## Architecture

### Where the logic lives

`youcoded/desktop/src/main/conversation-index/`, split pure-core / IO-shell in
the same shape as `conversations/`:

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

A new bundled plugin, `wecoded-marketplace/youcoded-recall/`, containing:

- `skills/recall/SKILL.md` — when to use it, the command surface, the output
  format, and the token discipline (start with `find`, expand only what you
  need).
- `bin/recall.mjs` — a thin Node client. Reads the denormalized index files
  directly for queries; sends writes to the app.

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
the same roots; native ships a `bash` tool. Android runs Claude Code in a
Termux-derived environment with Node, so the CLI runs there too.

### Why not MCP (yet)

| | Skill + CLI | MCP server |
|---|---|---|
| Reaches native today | Yes | No — `feat/native-mcp-phase1` is unmerged |
| Per-turn context cost, CC | ~20 tokens (one skill description line) | Small — CC defers MCP schemas, name-only until used |
| Per-turn context cost, native | ~20 tokens | Full schemas every turn — `harness/tools/registry.ts` has no deferral, and `capability-profile.ts` marks weak models `maxToolPresentation: 'simplified'` precisely because extra schemas hurt their tool-calling |
| Argument safety | Shell quoting is a foot-gun — mitigated by taking the request on stdin as JSON | Typed, free |
| Failure mode | Fresh process per call; cannot wedge a session | Long-lived process; can hang |
| Testing | Golden-output tests over a fixture directory | Needs a client harness |

The decisive asymmetry: MCP is nearly free on CC and expensive on native, and
native is where the small, context-constrained models run.

**This is not a lock-in.** Transport is orthogonal to logic. If native MCP
lands and typed arguments prove worth it, an MCP server becomes a second thin
shell over the same `conversation-index/` core. Ship the CLI first.

---

## The index

Three tiers, each usable without the one above it.

### Tier 1 — metadata

Read from the Conversation Store, not re-derived: id, provider, project name,
original path, title, `lastActive`, `createdAt`, the `flags` map (`complete`,
`priority`, and `tag:<id>` entries), `note`, `lastUsedModel`. Plus cheap
per-transcript stats: byte size, turn count, first/last turn timestamps.

Free, no model, no staleness beyond the store's own.

The app writes this **denormalized** to `~/.youcoded/index/<provider>-meta.json`
— a flat map of conversation id to a metadata snapshot. Two fields are resolved
at write time specifically so the CLI never needs store knowledge:

- **`tags`** carries tag *labels*, already resolved through the tag registry,
  not raw `tag:<id>` flag keys.
- **`transcriptPath`** carries the resolved absolute local path, so `show
  --turns` reads raw bytes without touching slug derivation, the `ccProjectSlug`
  / `cwdToProjectSlug` divergence, or the symlink hazard.

### Tier 2 — user turns only

A derived file per provider at
`~/.youcoded/index/<provider>-turns.jsonl`, one line per user message:

```json
{"c":"<conversationId>","t":142,"ts":"2026-07-26T18:04:11Z","x":"the actual message text"}
```

**Why user turns only:** your messages are a small fraction of transcript bytes
but carry all the intent — the ask, the correction, the "actually let's do Y."
Assistant output and tool results are where the bulk sits (a 44MB transcript
was observed in the wild) and where the noise sits. Indexing your turns makes
"I vaguely remember working on X" both precise and cheap, and keeps the whole
index small enough to rebuild from scratch without ceremony.

**Search mechanism:** `@vscode/ripgrep` is already a dependency. Search is
ripgrep over the derived file — no SQLite, no FTS engine, no native module to
rebuild against Electron's ABI. The file is plain JSONL, so it stays readable
by the agent's own Grep tool if the CLI is ever unavailable.

**Freshness:** rebuilt incrementally. Each provider file carries a sidecar
`~/.youcoded/index/<provider>-turns.state.json` recording, per conversation,
the byte offset consumed and the transcript size at that point. A transcript
that grew is appended from its offset; one that shrank (CC `/clear` rewrites,
`cleanupPeriodDays` deletion) is re-read from zero. Refresh runs at app start
and on the same quiescence signal the digest uses.

### Tier 3 — digests

Per conversation, at `~/.youcoded/index/digests/<provider>/<id>.json`:

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

---

## Digest generation

**Off by default.** Nothing runs until the Preferences toggle is on.

### Triggers (all lazy — no bulk pass ever runs unasked)

1. **Re-open / resume.** A conversation resumed on this device digests its new
   turns.
2. **Session quiesce.** A session that goes quiet digests its delta, on the
   same quiescence gate `noteSessionEnded` uses (poll until transcript size is
   stable across one 750ms probe, max 6s; skip on timeout).
3. **On demand from a query.** When `find` narrows to a small candidate set and
   the caller passes `--verdicts`, up to N (default 5) undigested candidates are
   digested inline. The response states which ones it digested, so the cost is
   never silent.
4. **Explicit backfill.** `recall backfill --since <date> [--project <p>]`
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
(read from the provider registry, with `known-models.ts` caps for local
models), the digest chunks by turn window and merges item lists across chunks.

### Incrementality

A resumed conversation re-digests only turns after `digestedThroughTurn`, and
the merge step may revise the status of existing items — a work item marked
`open` last week becomes `resolved` when later turns finish it. Item identity
across passes is by title match, falling back to turn-range overlap.

**Why this matters:** without revision, a stale `open` sticks around after the
work is done, and the tool starts lying in exactly the direction that wastes
your time.

### Model selection

A picker over configured providers, same mechanism as `NativeModelSelect`. The
list is **not** filtered to cheap models — restricting it would be guessing at
Destin's cost tolerance. Default is unset; with the toggle on and no model
selected, the digest does not run and `recall status` says so plainly.

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
| `--state resolved\|open\|unknown\|any` | `complete` flag first, digest second, `unknown` when neither exists. Default `any`. |
| `--since` / `--until` | Dates or relative (`30d`). |
| `--limit` | Default 20. |

Output — one line per hit, roughly 15 tokens each:

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
recall tag a3f2 9c14 1b07 --add sync --remove wip
recall note a3f2 "superseded by the M2 work"
recall flag a3f2 --complete
```

### `status`

Index freshness per provider, digest coverage (`412 conversations, 38
digested`), whether digesting is on, which model, and whether the app is
reachable.

---

## Writes

All writes route through the running app over the existing
`remote-server.ts` channel, reusing its token.

**Why not write the store JSON directly:** direct writes bypass the app's
`SESSION_META_CHANGED` broadcast, so an open window shows stale tags until
something refreshes it, and they would duplicate the tag-registry merge
semantics — which already exist (`conversations/tag-registry-core.ts`,
`src/shared/tags.ts`, `tags:*` / `session:set-tag` / `session:set-note` IPC)
and which exist in their current form because convergent-merge bugs bit twice.

Read paths (`find`, `show`, `status`) work against the denormalized index files
directly and do **not** require the app, so recall degrades to read-only rather
than to nothing when the app is down. `status` reports index age in that case,
since a long-closed app means a stale index.

**When the app is down**, writes fail with a specific, accurate message naming
the real condition — per `docs/error-message-standards.md`, never a guessed
cause:

```
Cannot write tags: YouCoded is not running (no listener on 127.0.0.1:<port>).
Open YouCoded and retry.
```

---

## Settings

The Defaults tab is renamed **Preferences** (`SettingsPanel.tsx`,
`DefaultsButton` at ~:1626). A new section:

- **Summarize conversations for search** — toggle, **off by default**.
- **Model** — provider/model picker, shown only when the toggle is on.
- An (i) explainer, per the accessibility pillar: what gets sent to the model
  (your messages plus how each stretch ended), what it is used for, that it is
  stored locally and never synced, and that it costs tokens.

Open question: whether the inner "Session Defaults" heading keeps its name or
follows the tab rename.

---

## Testing and guards

| Guard | What it pins |
|---|---|
| `tests/conversation-index-core.test.ts` | Turn extraction from both lanes' JSONL shapes; index line round-trip; query parsing; ranking. |
| `tests/conversation-index-store.test.ts` | Incremental refresh: grown transcript appends from offset, shrunk transcript re-reads from zero, **symlinked transcript is skipped**, lane-prefix violation is refused. |
| `tests/recall-cli-output.test.ts` | Golden output for `find` / `show` / `status` against a fixture transcript directory. Pins the format the skill documents — the thing most likely to drift. |
| `tests/digest-incremental.test.ts` | A resumed-session fixture: only new turns are sent; an `open` item flips to `resolved`; item identity survives the merge. |
| `tests/bundled-plugins.test.ts` (extend) | The plugin id appears in both `BUNDLED_PLUGIN_IDS` and `BundledPlugins.kt`. |

The digest tests use a fake model client; no test makes a network call.

---

## Phasing

Each phase is independently useful and independently shippable.

1. **Index + read-only CLI.** Tiers 1 and 2, `find` / `show` / `status`, the
   plugin, the skill, both bundled lists. No model, no settings, no writes.
   This alone answers "did we talk about X, when, in what project, is it
   flagged complete."
2. **Writes.** `tag` / `untag` / `note` / `flag` through the app.
3. **Digest.** Tier 3, the four lazy triggers, the Preferences section, the
   model picker.

Building in this order keeps the digest an enhancement rather than a
dependency — which matters, because it ships off by default.

---

## Open questions

1. **Name.** `recall` is the working name for the plugin, CLI, and skill.
   Alternatives worth considering: `history`, `sessions`, `lookback`.
2. **"Session Defaults" heading** — rename with the tab or leave it.
3. **Retention.** Should digests and index entries be pruned for conversations
   whose transcripts CC has deleted, or kept as tombstones? Keeping them means
   recall can answer about a conversation whose bytes are gone — arguably the
   most valuable case for a backstop, and arguably a source of dead pointers.
   Leaning tombstone, marked clearly as such in output.
4. **Remote sessions.** A session running against a remote YouCoded instance
   reaches a different machine's index. Out of scope for phase 1; worth
   confirming the CLI fails clearly rather than silently searching the wrong
   corpus.
