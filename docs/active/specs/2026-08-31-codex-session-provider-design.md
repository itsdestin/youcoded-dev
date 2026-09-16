---
status: draft
date: 2026-08-31
updated: 2026-08-31
tags: [codex, openai, chatgpt, sessions, providers, permissions, native-runtime, marketplace]
roadmap: ROADMAP.md:1280 ("Third-party agent CLIs as session providers")
supersedes_cost_shape: ROADMAP.md:1280 (the terminal-wrap cost estimate, for Codex only)
---

# Codex as a session provider

> **Parked 2026-09-04.** The ChatGPT-plan goal this spec was written for is now met the
> direct way — OpenAI publicly welcomed plans inside third-party apps in July 2026, which
> removes §1's "must not be re-proposed" ban on that path. See
> `docs/archive/investigations/2026-09-04-chatgpt-subscription-paths.md`. This spec stays
> for the separate feature "Codex-the-agent inside YouCoded"; §1's table, Phase 0 Q4/Q5 and
> the sign-in screens are partly stale (the app-server now has `account/login/start` and
> `account/rateLimits/read`).

Let a user with a **ChatGPT subscription** run OpenAI's Codex agent inside YouCoded's own
chat view — real message bubbles, real permission cards, real themes — by driving the
`codex app-server` protocol as a child process. No terminal wrap, no log scraping, no
reading the user's login token.

All file paths and counts below verified against `youcoded@master` on 2026-08-31.

---

## 1. Scope

### Why Codex when Gemini was deleted

On 2026-07-10 the Gemini provider was removed and the runtime selector fixed at
`Claude Code | YouCoded` (`docs/archive/specs/2026-07-09-platform-vision-roadmap.md:320`).
The principle was **reach the MODEL, don't wrap the HARNESS**. Codex is the one case
where that principle points the other way, and the distinguishing fact is billing:

| Provider | Reachable via native runtime? | Wrapping the harness buys… |
|---|---|---|
| Gemini | Yes (OpenRouter, direct key) | Nothing. Correctly deleted. |
| Any OpenRouter model | Yes | Nothing. |
| Codex on a ChatGPT plan | **No** — subscription billing has no API surface | The user's already-paid capacity |

**The rule this sets:** wrap a third-party harness only when it is the sole path to
capacity the user has already paid for. "It has a nice agent loop" is not a reason.
(§9 Q6 asks whether this becomes a standing ROADMAP rule.)

### Three approaches that must not be re-proposed

| Approach | Why not |
|---|---|
| Terminal wrap + log tailing + injected hooks (how we wrap Claude Code) | Codex's session logs are an internal format with no published shape and there is no hook system to relay permission prompts. `youcoded/docs/cc-dependencies.md` records **39** undocumented Claude Code behaviours we already maintain by hand; a supported interface exists, so doing that twice is indefensible. |
| The Codex SDK (`@openai/codex-sdk`) | **It cannot ask the user anything.** `ThreadOptions` exposes an `approvalPolicy` and a `sandboxMode` but no callback to receive an approval request and answer it. The only shippable setting would be `never` — full-auto for everyone, permanently. Permission cards are structurally impossible on this path. |
| Read `~/.codex/auth.json` and call OpenAI directly | The shape Anthropic banned outright on 2026-02-20 for Claude subscriptions. Fails months later, all at once, possibly taking user accounts with it. |

**Prior art:** T3 Code (`pingdotgg/t3code`, read 2026-08-31) drives five agents and uses
each vendor's official structured interface for all five — Codex via app-server, Claude
via `@anthropic-ai/claude-agent-sdk`, Cursor and Grok via ACP, OpenCode via its local HTTP
server. Zero terminal scraping in their provider layer.

### What ships and what does not

**Works free** (already provider-agnostic): chat bubbles, streaming text, tool cards,
thinking indicators, themes, the artifact/file panel.

**Works once §4.3 is built:** conversation history, resume, session naming, Chat Search.

**Works once §4.6 is built — and it MUST be built:** the user's installed skills and MCP
connections. Codex adopted our skill format; this is an export adapter, not an impossibility.

**Needs its own wiring, NOT free** (see §4.5): interrupt. Stopping a native session calls
`nativeHost.interrupt(sessionId)` (`ipc-handlers.ts:2771`); stopping a Claude Code session
sends an ESC byte down the PTY (`ipc-handlers.ts:2214`). Codex needs a third arm calling
`turn/interrupt`.

**Does NOT work — must be stated in the UI, not discovered:**

| Absent | Reason | UI state to design (Phase 1) |
|---|---|---|
| Marketplace **hooks** and **sub-agents** | Codex's hook engine is marked under development and its sub-agents sit behind an experimental feature picker — both are pre-release on OpenAI's side. **Skills and MCP servers DO port — §4.6.** | A line naming what is and is not active in this session, never silence |
| The terminal tab | There is no PTY behind a Codex session. The tab must be **absent, not empty**. | Tab hidden |
| Android | `Bootstrap.kt:27` hard-gates app startup on Claude Code's npm layout (`PINNED_CLAUDE_CODE_VERSION = "2.1.112"`). Desktop only. | n/a — out of scope |
| Codex not installed | We detect, we do not install (§9 Q5) | "Not installed" screen |
| Not signed in | `codex login` is a browser round-trip we do not control | "Sign in" screen |
| Version outside the supported range | §5.3 | Refusal naming the detected version and the range |
| Usage limit exhausted | §7 | Phase 0 Q4 supplies the real wire message |

---

## 2. Where it plugs in

| Seam | File | Change |
|---|---|---|
| Provider identity | `desktop/src/shared/types.ts:35` (`SessionProvider`) | `'claude' \| 'native'` → add `'codex'`. **See §4.5 — the widening is not free.** |
| Session creation | `desktop/src/main/session-manager.ts:56` (`createSession`), native branch at `:82` | Third branch. Like `native`, spawns **no PTY worker** — `ManagedSession.worker` is already optional (`:45`) |
| Chat view feed | `desktop/src/shared/types.ts:98` (`TranscriptEventType`) | **No change.** Emit the existing union — the renderer cannot tell which agent produced it. Pattern: `harness-session.ts:874` (`this.emit('transcript-event', …)`) |
| Persistence | `desktop/src/main/harness/session-store.ts`, `conversations/service.ts` | §4.3 |
| Permission asks | `desktop/src/main/harness/permission-broker.ts` (`AskRequest` / `AskDecision`) | **Shapes unchanged.** But answers route back by an **id prefix** — ids are `'native-'`-prefixed and `permission:respond` "tries the broker first, and a non-native id falls through to hookRelay" (`ipc-handlers.ts:2563`). Codex asks must either take the `native-` prefix or add a route. Pick one and comment it. |
| Remembered rules | `desktop/src/main/harness/permission-store.ts`, `shared/subject-glob.ts` | Reuse `ruleMatches` unchanged |
| Approval card copy | `renderer/components/ToolCard.tsx:83` **and** `renderer/components/permissions/describe-rule.ts` | **Four** entries, not three — §4.1 |
| Sign-in / install detect | `desktop/src/main/prerequisite-installer.ts` | New detect + login-status + version functions. **This file is 1,141 lines of Claude-only logic with no provider seam** — introducing one is part of the work |
| Kill switch | `desktop/src/main/preload.ts:1212` | Mirror the native gate: `codex: { supported: process.env.YOUCODED_CODEX !== '0', … }` (native's is `YOUCODED_NATIVE !== '0'`, `preload.ts:1213`) |

**New code** under `desktop/src/main/codex/`:

- `app-server-client.ts` — spawn and supervise `codex app-server`, JSON-RPC framing over
  stdin/stdout, request/response correlation, server-initiated request handling. Process
  model: §5.2.
- `protocol.gen.ts` — generated from OpenAI's schemas (§5.1). **Never hand-edited.**
- `codex-session.ts` — one conversation: `thread/start` / `thread/resume`, `turn/start`,
  `turn/interrupt`, and translation of Codex notifications into `TranscriptEvent`s.
- `approval-bridge.ts` — Codex approval request → `AskRequest` → `AskDecision` → Codex
  response. Owns §4.1 and §4.2.
- `codex-install.ts` — is `codex` present, is it signed in, what version, is that version
  supported (§5.3).
- `codex-export.ts` — the marketplace bridge (§4.6): enabled skills into
  `$HOME/.agents/skills`, owned MCP entries into `~/.codex/config.toml`. Sibling of
  `claude-code-registry.ts` / `mcp-reconciler.ts`, **not a second registry layer.**

---

## 3. Phase 0 — answer these before writing production code

Seven questions, no production code, about a day and a half. Deliverable: a findings note,
plus the generator and its output **in the spike folder** — checked into `master` only after
Phase 1 signs off.

1. **Does the sign-in survive our environment?** Run `codex login` in a terminal, then
   spawn `codex app-server` from a throwaway script *with the environment Electron gives
   a child process* and complete one turn. This is the whole feature's load-bearing
   assumption. If `CODEX_HOME`/PATH handling breaks under a packaged build, everything
   below changes.

2. **Verify §5.1's method names against the actual schema files.** They come from prose
   documentation, not from the schema. Do not write a client against unverified names.

3. **Is the thread model process-scoped or persistent?** Can one process host several
   threads? Does a thread id survive the process dying? Do two threads' turns run
   concurrently or queue? The answers decide the supervision shape (§5.2), whether resume
   needs `thread/resume` at all (§4.3), and whether opening a second Codex tab makes the
   first look frozen.

4. **What does an exhausted usage limit look like on the wire?** We cannot write the error
   state until we have seen the real message (§7).

5. **Does the user's own `~/.codex/config.toml` override the `approvalPolicy` we pass?**
   Set `approval_policy = "never"` in that file, then start a session passing
   `on-request`, and see which wins. **All of §4.2's safety reasoning is void if the file
   wins** — a user who set that months ago for the Codex CLI would silently lose every
   permission card, with nothing in our UI to say so. If the file wins, we need either a
   startup override we control or a detect-and-refuse.

6. **What working directory does a Codex thread get, and does it accept ours?** Codex is
   folder-scoped. A YouCoded session has a `cwd`. Confirm `thread/start` takes one and
   that Codex's file access roots there. This decides whether Codex can see the user's
   project at all; it is separate from the `sandboxMode` mapping deferred to Phase 4.

7. **Where does the installed Codex build actually read skills and MCP from (§4.6)?** Drop a
   two-line `SKILL.md` into `$HOME/.agents/skills/` and into `~/.codex/skills/`, and see which
   one a session picks up (the documented path and an earlier published path disagree).
   Confirm the frontmatter fields it requires, that a **symlinked** skill directory is
   followed, that `${CLAUDE_PLUGIN_ROOT}` is passed through literally, and that adding an
   `[mcp_servers.<id>]` block leaves the rest of a commented `config.toml` intact.

---

## 4. The six things with no existing answer

### 4.1 Network-access approval has no card today

Codex asks three kinds of question: run this command, make this file change, and **access
this network host**. We have cards for the first two and no concept of the third.

**Approach:** reuse the existing rail rather than invent a fourth card shape. Raise it as
an `AskRequest` with a synthetic `toolName` (`CodexNetwork`) and the host as the permission
subject, so `permission-broker.ts`, `permission-store.ts` and `ruleMatches` all work
unchanged.

**Four tool-name-keyed tables must each learn the new name.** The first is the one the
user actually reads:

| Table | File | Fallback today | What the user would see |
|---|---|---|---|
| `friendlyToolDisplay` (`switch (toolName)`) | `renderer/components/ToolCard.tsx:83` | `default: return { label: toolName, detail: '' }` | The **live approval card in chat** headed "CodexNetwork" with a blank detail line |
| `VERBS` | `permissions/describe-rule.ts:25` | `` `Use ${rule.tool}` `` | "Use CodexNetwork — api.github.com" in Settings |
| `KIND_BY_TOOL` (`ruleKind`) | `permissions/describe-rule.ts:203` | `'other'` | Filed under "other" instead of "connections" |
| `broadNote(tool)` | `permissions/describe-rule.ts:232` | generic sentence | "Covers every use of this tool" |

Missing the first row means the polished sentence appears in Settings and the log line
appears in the conversation — exactly backwards. `describe-rule.ts:22` states the standard:
*"YouCoded is built for non-developers — 'Create or overwrite src/a.ts' is a sentence,
'Write: src/a.ts' is a log line."*

**Needs Destin's sign-off on the copy** — "Codex wants to reach `api.github.com`" is a
question our users have never been asked before (Phase 1).

### 4.2 Permissions stay entirely on our side; `approvalPolicy` is pinned at `on-request`

Codex's approval responses are `accept`, `acceptForSession`, `decline`, `cancel`.
`acceptForSession` dies with the session; our remembered rules persist to
`~/.youcoded/permissions.json` and must survive restarts.

**Approach:** enforce persisted grants on *our* side. When a Codex approval request
arrives, check `PermissionStore` first via the existing `ruleMatches`; if a remembered
rule covers it, answer `accept` without showing a card. Only unmatched requests reach the
user. One permissions screen for the whole app.

**`approvalPolicy` is therefore pinned at `on-request` in every YouCoded mode — it is not
a mapping axis.**

> **Do not map full-auto to `approvalPolicy: never`.** Under `never`, Codex never asks us
> anything, so our store is never consulted and the safety stop can never fire —
> `permission-broker.ts:31` records that *"Full-auto + denyListed is the renderer's cue to
> swap the generic row for the safety-stop footer."* A user in full-auto would silently
> lose a protection they have in every other session.

**`sandboxMode`** (what Codex may touch on disk) is the one dial that still needs a
mapping. It is a **Phase 4 output measured against real Codex behaviour, not a Phase 0
input** — a guessed table gets implemented; an absent one gets measured.

**Two consequences to state plainly:**

- A grant made in a Codex session and one made in a native session land in the same store
  and the same Settings list. That is the right outcome, but revoking there affects both.
- Codex uses the **native** three-mode vocabulary (`NativePermissionMode = 'ask' |
  'auto-edit' | 'full-auto'`, `shared/permission-types.ts:7` — note `shared/types.ts:489`
  and `:654` carry inline literal copies of the same three strings). Claude Code sessions
  use `PermissionMode = 'normal' | 'auto-accept' | 'plan' | 'auto' | 'bypass'`
  (`shared/types.ts:6`). Whether the status-bar chip says which is a Phase 1 UI question.

### 4.3 Where a Codex conversation is stored

**Nothing writes it today, and four features quietly depend on it.** Native sessions
persist through `harness/session-store.ts` (line 1 = header, lines 2+ = transcript events,
streaming deltas coalesced per `partId`), indexed by `conversations/service.ts`, which
carries a `provider: SessionProvider` field (`:48`) and a `localJsonlPath` (`:355`) that
already branches per provider. Skip this and there is no resume, no history pagination,
no session naming, and Chat Search silently omits every Codex conversation
(`chatsearch-index/refs-service.ts` and `outbox-drain.ts` both branch on provider).

**Approach: reuse `SessionStore`'s event format and file layout.** Codex conversations are
already being translated into the same `TranscriptEvent` union, which is the only thing
that store writes. Favourable precedent: `ConversationRecord.provider` is already typed
`SessionProvider | string`, commented **"string-open for future providers"**
(`conversations/store-core.ts`) — the record layer was designed for this.

**Four things it does need:**

1. **A header field for the Codex thread id, which means the header is not unchanged.**
   `NativeSessionHeader` is `v: 1` (`session-store.ts:20`) with no such field. Add it as
   an optional field (additive, so v1 files need no migration — same treatment
   `parentSessionId`/`sessionKind` got) or bump to `v: 2`. Resume is Codex's
   `thread/resume`, not ours: our store is what the *chat view* replays, Codex keeps its
   own thread state, so resuming means reopening our transcript for display **and**
   calling `thread/resume` with that id.

2. **A real answer for `binding: ModelBinding`.** `ModelBinding` is
   `{ providerId: string; modelId: string }` (`shared/provider-types.ts:20`), but
   `providerId` is a **device-local ULID that only resolves via this device's
   `~/.youcoded/providers.json`** (`shared/types.ts:38-40`). A literal `'codex'` is a
   sentinel nothing can look up, so every consumer that resolves `providerId` — the
   status-bar model chip (`model-chip.ts`), the resume screen's pre-fill, the model
   catalog, `ModelPickerPopup.tsx` — needs a branch. Decide in Phase 2 whether Codex gets
   a synthetic providers.json entry (resolves everywhere, costs a fake provider row) or a
   sentinel plus explicit branches (honest, costs ~4 call sites). **Do not assume it fits
   as-is.**

3. **A `provider: 'codex'` record in the conversation index, plus the `localJsonlPath`
   branch.**

4. **A fix at `conversations/service.ts:368`** — see §4.5.

### 4.4 Model selection

Codex exposes models. `ModelPickerPopup.tsx` and `model-chip.ts` both branch on provider
today. Decide in Phase 1 whether a Codex session shows a model picker at all (Codex's
own model list, via whatever the app-server reports) or a fixed label. This is the second
half of §4.3's binding problem and should be answered with it.

### 4.5 The union widening, and what the compiler will NOT catch

Adding a third value to `SessionProvider` turns every two-way question into a three-way
one. Measured:

```
rg -o "provider === 'claude'|provider === 'native'|provider !== 'native'|provider !== 'claude'" src
  → 54 occurrences across 23 files (16 of them in renderer/App.tsx alone)
rg -o "isNativeSessionId" src
  → 10 further call sites — a boolean "is this native?" that now has a third answer
```

Most are one-line changes. `App.tsx` (16), `ResumeBrowser.tsx` (8) and `InputBar.tsx` (3)
are real decisions about what a Codex session shows.

**The dangerous sites are the ones TypeScript stays silent about — the "default to
Claude" ternaries.** These compile clean forever and fail silently at runtime. Audit at
least these, and grep for the shape before Phase 3 ships:

| Site | Shape | Silent failure |
|---|---|---|
| `conversations/service.ts:368` (`asSessionProvider`) | `provider === 'native' ? 'native' : 'claude'` | A Codex transcript is filed into **Claude Code's** project folders under `ccProjectSlug` |
| `ipc-handlers.ts:3283` | `if (nativeHost.isNativeSessionId(id)) return 'native';` implicit else `'claude'` | Session metadata (tags, notes) written against the wrong provider |
| `remote-server.ts:179` | `rt ? rt.nativeHost.isNativeSessionId(…) : false` | Remote/phone access treats a Codex session as Claude Code |

Budget for this audit explicitly. The risk is not any single site — it is missing one, so
a Codex session quietly takes the Claude-shaped path somewhere in `App.tsx`.

### 4.6 The marketplace must reach Codex — skills and MCP, through an export adapter

**Requirement, not a nice-to-have.** The app's promise is that a user's setup follows them;
a Codex session that cannot see their installed skills is a different product bolted to the
side of this one. This section is why §8 no longer defers marketplace compatibility.

**What changed, verified 2026-08-31.** OpenAI adopted the same skill format we ship. Codex
reads `SKILL.md` with `name` / `description` frontmatter from **`.agents/skills`** (repo,
walking up from cwd), **`$HOME/.agents/skills`** (user), `/etc/codex/skills` (admin) and its
built-ins, and supports MCP servers as `[mcp_servers.<id>]` in `~/.codex/config.toml`. The
format is ours; only the address differs. An earlier public description put skills at
`~/.codex/skills`, so **the path has already moved once — Phase 0 Q7 verifies both against
the installed build before any code depends on them.**

Measured against `wecoded-marketplace/index.json` on 2026-08-31 — 339 items (325 plugins,
14 prompts):

| Component | Items carrying it | Codex's equivalent | Verdict |
|---|---|---|---|
| Skills | 252 | `SKILL.md` under `.agents/skills` — identical format | **Port** |
| MCP servers | 134 | `[mcp_servers.<id>]` in `config.toml` | **Port** |
| Slash commands | 63 | `~/.codex/prompts/*.md`, **deprecated by OpenAI in favour of skills** | Fold into skills, or skip |
| Hooks | 17 (+1 manifest) | `PreToolUse`/`PostToolUse` via `~/.codex/hooks.json`, under development | Wait |
| Sub-agents | 42 | behind an experimental feature picker | Wait |

Four items in five are portable today, and the two portable kinds are the two that carry the
catalog.

**Approach: `desktop/src/main/codex/codex-export.ts`, the same shape as
`claude-code-registry.ts` and `mcp-reconciler.ts`** — it runs on install / update /
uninstall / enable / disable and writes exactly two things: one skill directory per **enabled**
skill under `$HOME/.agents/skills`, and our owned MCP entries into `~/.codex/config.toml`.

**Four things that are not obvious:**

1. **Link where possible, copy where not.** A symlink is the right primitive — one file, two
   addresses, no staleness. It breaks on one class: a `SKILL.md` containing
   `${CLAUDE_PLUGIN_ROOT}`. Claude Code substitutes that token and so does
   `harness/skills/skill-catalog.ts`; **Codex would hand the model the literal token.** Those
   must be materialised as a copy with the token already resolved, which reintroduces
   staleness and therefore must re-run on update. Measured in `wecoded-marketplace`,
   2026-08-31: **5 of 61 `SKILL.md` files** carry the token; **12 of 61** name Claude Code,
   the Task tool, sub-agents or `.claude/` paths in their instructions. ~80% link clean; the
   rest need the copy path or an explicit incompatibility flag on the registry entry.

2. **Export only ENABLED items, never everything installed.** Codex auto-selects skills by
   description match, so a global directory holding every installed skill degrades its
   selection and misfires — the same failure the injection budget exists to prevent on our
   own side.

3. **`~/.codex/config.toml` is another vendor's hand-edited file, and it is TOML.** The
   never-overwrite-an-unowned-entry discipline (`harness-tools.md`, MCP projection) applies
   verbatim, plus one hazard the JSON reconciler never had: **a naive read-modify-write
   destroys the user's comments and key ordering.** Splice or round-trip; never re-serialise
   the whole file.

4. **Codex is the third consumer, not the second.** `skill-scanner.ts` already scans three
   roots for the native harness. Once an export adapter exists, Gemini CLI / OpenCode /
   Cursor each cost days rather than a week — ADR 008's argument arriving early.

**Relationship to ADR 008.** The full inversion (`~/.youcoded` as source of truth, every
vendor directory an export target) is the correct end state and is **not** a prerequisite
here. Build the Codex export against today's install location, behind the interface the
inversion will later feed. What must not happen is a second bespoke registry writer.

**Phase 1 owes this a UI state:** a Codex session states which of the user's installed things
are live in it and which are not (hooks and sub-agents are not). Silence reads as breakage.

---

## 5. Protocol, process, and version floor

### 5.1 Types are generated, never hand-written

OpenAI publishes the app-server protocol as JSON Schema in the Codex repository at
`codex-rs/app-server-protocol/schema/json/` (versioned `v1` and `v2`). T3 Code's generated
client is `"private": true` and unpublished, so we write our own generator against the
same published source of truth.

**This is the single biggest difference from the Claude Code wrap: when OpenAI changes the
protocol, we regenerate and the compiler tells us what broke, instead of a user
discovering it.**

Protocol surface we depend on (from OpenAI's prose documentation — **Phase 0 Q2 verifies
these names against the schema before any client code is written**):

- **Handshake:** `initialize` request, then an `initialized` notification. Anything sent
  before this errors; initializing twice is rejected.
- **Conversations:** `thread/start`, `thread/resume`.
- **Turns:** `turn/start`, `turn/steer`, `turn/interrupt`.
- **Streaming notifications:** `turn/started`, `turn/completed`, `item/started`,
  `item/completed`, plus deltas for assistant text, reasoning, command output and file
  changes.
- **Server-initiated approval requests** for command execution, file change and network
  access; client answers `accept` / `acceptForSession` / `decline` / `cancel`.

**Use the default stdio transport.** OpenAI marks WebSocket experimental and unsupported;
the `process/*` APIs are experimental and run outside Codex's sandbox. Neither belongs in
a shipped build.

### 5.2 Process model

**Default: one shared `app-server` process per app launch, one Codex thread per YouCoded
session.** A per-session process multiplies memory and startup latency by the number of
open Codex tabs, and Codex's own clients use the shared shape. **Phase 0 Q3 confirms this
against the schema — if threads turn out to be process-scoped, this flips to
one-process-per-session, so do not build supervision until Q3 is answered.**

If the shared shape holds, its cost is that a crash takes down every Codex session at
once. `app-server-client.ts` owns supervision: detect exit, surface it as `session-error`
on every affected session (that event type exists and is display-only — `session-store.ts`
never persists it), and restart on the next turn rather than silently.

### 5.3 A version floor and a kill switch

Generated types protect us from the *message format* changing. They do not protect us from
the *program* changing — a renamed binary, a repackaged distribution, a moved `~/.codex`,
a changed `codex login` flow. That already happened once, to the other vendor:
`Bootstrap.kt:27` pins `PINNED_CLAUDE_CODE_VERSION = "2.1.112"` because *"2.1.113+
repackaged the npm distribution as a native-binary launcher with no cli.js"*, which broke
both the Android self-test and the PTY bridge. Assume OpenAI does the equivalent.

`codex-install.ts` reports a **version**; the app carries a known-good floor and ceiling.
Outside that range the session is refused with a specific, accurate message naming the
detected version and the supported range — per `docs/error-message-standards.md`, never a
guessed cause. Phase 1 designs this screen.

Ship behind `YOUCODED_CODEX=0` (mirroring `preload.ts:1213`'s `YOUCODED_NATIVE !== '0'`)
so a regression has a one-env-var revert that does not need a release.

---

## 6. Phases

Per the workspace rule that user-facing work is designed before it is built, the UI is
settled before the protocol layer is finished. Sizing is rough and should be re-estimated
after Phase 0.

| Phase | Work | Done when | Rough size |
|---|---|---|---|
| **0** | The seven questions in §3. Generator + output live in the spike folder only. | A findings note answers all six; the generator produces compiling types. | ~1 day |
| **1** | UI design and Destin's sign-off, built in `run-workbench.sh` against mock channels, reviewed as a deck via `scripts/ui-review/review-cards.py`. Covers: the network-approval card (§4.1) and its Settings row copy; how a Codex session is created and labelled (§9 Q1–2); model selection (§4.4); **the line stating which installed skills, connections, hooks and sub-agents are live in a Codex session (§4.6)**; and every row of §1's "does NOT work" table — not-installed, not-signed-in, wrong-version, usage-limit, absent terminal tab. | Destin signs off on the deck. **Backend is designed around the approved UI, not the reverse.** | ~3 days |
| **2** | `app-server-client.ts` + `codex-session.ts` + the supervision shape from §5.2. The `SessionProvider` widening and the §4.5 audit. Resolve §4.3's binding question. | A real prompt streams into the real chat view in a dev instance; `bash scripts/verify.sh` is green. | ~1 week |
| **3** | `approval-bridge.ts` (§4.1, §4.2) and the `SessionStore` wiring (§4.3). | A Codex command approval renders as a YouCoded permission card; "Always allow" persists; the grant is honoured on the next launch without a card; the conversation is still there after a restart. | ~3–5 days |
| **4** | Interrupt (`turn/interrupt`), `thread/resume`, Resume Browser listing, Chat Search indexing, error and limit states, and the `sandboxMode` mapping — measured against real Codex behaviour. | Every row of §1's table has a screen; a Codex conversation is findable in Chat Search. | ~3–5 days |
| **5** | The marketplace bridge (§4.6). `codex-export.ts`: enabled skills into `$HOME/.agents/skills` (symlinked, or copied where `${CLAUDE_PLUGIN_ROOT}` forces it), owned MCP entries spliced into `~/.codex/config.toml`, re-run on install / update / uninstall / enable / disable. | A marketplace skill installed in the app runs in a Codex session; disabling it removes it; an MCP connection works in both session kinds; a hand-written `config.toml` keeps its comments across a write. | ~1 week |

---

## 7. Risks

- **Usage limits are invisible to us.** Codex meters a 5-hour rolling window plus an
  undocumented weekly cap, and has metered by tokens rather than messages since April 2026.
  We cannot show a budget we cannot see. Per `docs/error-message-standards.md` the
  exhausted state must be specific-and-accurate (surface Codex's own message) or
  general-and-non-committal with the two actions — **never a guessed cause**. Phase 0 Q4
  exists to make the first option possible.
- **The user's own `~/.codex/config.toml` may defeat §4.2.** Phase 0 Q5. This is the
  highest-consequence unknown in the document: if that file wins, every permission card
  can be silently disabled by a setting we never read.
- **Codex is a coding agent.** It is built to read and edit files in a folder; YouCoded is
  for students and professionals writing documents and doing research. A menu item called
  "ChatGPT" that behaves like a code reviewer will mislead people who expect
  chatgpt.com. Labelling and scoping is a Phase 1 decision, not a copy tweak (§9 Q1–2).
- **The provider union widens by one and 64 branch sites become three-way** (§4.5). The
  risk is the three sites that stay type-correct while being wrong.
- **`prerequisite-installer.ts` grows a seam.** Every provider added after this one is
  cheaper; this one pays to build the seam.
- **The marketplace bridge writes into a directory and a config file OpenAI owns (§4.6).**
  Skills may move again (they already moved once), and `~/.codex/config.toml` is hand-edited
  by users — a careless write eats their comments. Same class of exposure as the Claude Code
  registry, which is the documented source of jank ADR 008 exists to escape; the mitigation
  is that the export is one adapter behind one interface, not a second registry layer.
- **Marketplace parity will look partial to users.** Skills and connections carry; hooks and
  sub-agents do not, because OpenAI has not shipped them. A user whose favourite plugin is a
  hook will experience that as YouCoded being broken unless Phase 1's UI says otherwise.
- **A second agent runtime is a permanent maintenance line.** Smaller and better-founded
  than the Claude Code wrap, but not free — and §5.3 says the CLI will move under us at
  least once.
- **Policy risk is low but non-zero.** We drive OpenAI's own program with OpenAI's own
  documented embedding interface, which is the most defensible position available. When
  asked directly (openai/codex discussion #8338) OpenAI confirmed forking is fine and
  **declined to answer the third-party-client question**. That silence is not permission,
  and it is not a written guarantee either.

---

## 8. Out of scope

Android. The full ADR 008 conventions inversion
(`docs/decisions/008-conventions-inversion-native-home.md`) — §4.6 ships an export adapter
shaped to be fed by it later, not the inversion itself. Marketplace **hooks** and
**sub-agents** inside Codex sessions (§4.6 — both are pre-release on OpenAI's side; revisit
when they leave their feature flags). Migrating the Claude Code wrap
to the Claude Agent SDK — worth revisiting someday, but it would cost the terminal view and
the Claude Code plugin ecosystem, and must not ride along with this.

---

## 9. Open questions for Destin

1. **Name.** `Codex`, `Codex (coding)`, or `ChatGPT`? Recommendation: not `ChatGPT` — it
   sets an expectation the agent will not meet.
2. **Placement.** Same picker as Claude Code and the native assistant, or a separate
   "coding agents" grouping?
3. **Shared permission store (§4.2)?** Recommendation: yes, one screen for the whole app.
4. **Network approval (§4.1)** — reuse the existing card rail, or design a distinct one?
   Recommendation: reuse, plus the four copy-table entries.
5. **Not-installed behaviour** — does YouCoded install Codex, or detect it and hand the
   user off? Recommendation: detect and hand off. Installing another vendor's CLI is a
   support burden we take on permanently, and `codex login` needs a browser round-trip we
   do not control anyway.
6. **Does §1's test become a standing rule?** "Wrap a third-party harness only when it is
   the sole path to capacity the user already paid for." If yes, it belongs in the ROADMAP
   entry so the next CLI request is answered before it is written up.
7. **Marketplace bridge now, or after the ADR 008 inversion?** Recommendation: now, as the
   §4.6 adapter. One week puts four catalog items in five into Codex; the inversion later
   changes what feeds the adapter, not the adapter. Waiting means shipping a Codex session
   with none of the user's setup in it.
8. **Does a Codex session get every enabled skill, or its own opt-in list?** Recommendation:
   every enabled one, matching what a Claude Code session gets — a second enable/disable
   surface per provider is a settings screen nobody asked for. The counter-argument is
   Codex's description-matching skill selection degrading with volume (§4.6 item 2), which
   argues for a cap or a per-session picker if Phase 0 Q7 shows it selecting badly.
