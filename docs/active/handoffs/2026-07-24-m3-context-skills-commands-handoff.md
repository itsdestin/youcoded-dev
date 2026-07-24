---
status: active
date: 2026-07-24
milestone: M3 (Native Runtime Parity Program §4)
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md
repos: [youcoded]
verified_against: youcoded master `b0f990b9` (2026-07-24)
---

# Handoff: M3 — Context, skills & commands (the ecosystem works in native)

**You are picking up the next milestone of the Native Runtime Parity Program.** M1 (session
control) shipped 2026-07-22 as youcoded#204; M2 (conversations & sync) shipped 2026-07-23 as
youcoded#212 and satisfies the v1.3.0 gate. M3 is the third and last milestone of the near-term
tranche, and it is the one that makes **YouCoded's own ecosystem** — skills, slash commands,
project rules, MCP — work in a native session instead of only in a Claude Code session.

**Do not implement from this document.** Program §9 requires a plan doc at
`docs/active/plans/2026-07-24-m3-context-skills-commands-plan.md` (writing-plans granularity:
numbered tasks, exact code, test-first) before any code, with program §4 + this handoff as the
spec. Several design questions below need Destin's answer *first* — §6 lists them.

---

## 1. Read these, in this order

1. `docs/active/plans/2026-07-22-native-runtime-parity-program.md` — §4 is M3's scope; §1 is
   where the runtime stood at program start; §9 is sequencing + per-milestone exit criteria.
2. `.claude/rules/native-runtime.md` — the harness contract. **Note the NOT-ON-MASTER banner**
   on the "Native local reliability (Plan C)" section: everything under it describes the unmerged
   branch `origin/feat/native-local-reliability`, not master (verified 2026-07-24). Do not plan
   against it.
3. `.claude/rules/conversations.md` — M2's store contract; you will touch conversation state if
   `/clear` or `/compact` writes anything the store reads.
4. `youcoded/docs/native-runtime.md` — depth doc for the harness.
5. `docs/archive/plans/2026-07-22-m2-conversations-sync-plan.md` — the shape of a good plan doc
   for this program, and the reviewer expectations that come with it.
6. `docs/PITFALLS.md` → IPC parity + chat reducer sections, before touching either.

---

## 2. Where the code actually stands (verified 2026-07-24 against master `b0f990b9`)

Every claim here was checked against the tree, not inferred. File:line references are master.

### 2.1 The native system prompt is small, and byte-stable by construction

`desktop/src/main/harness/prompt-assembly.ts` assembles ONCE per session:
the app preamble → the preset body (`prompts/assistant-default.ts` / `coder-default.ts`) →
an `<env>` snapshot (cwd, platform, date, git branch/dirty, app version) → the **first**
`AGENTS.md`-or-`CLAUDE.md` found walking cwd up to the git root, truncated at 20 000 chars,
wrapped in `<project-instructions source="…">` → a "prefer dedicated tools" line.

Its header comment is a standing instruction: *"Byte-stable by construction; do NOT add anything
that changes between turns."* That is the load-bearing constraint of this whole milestone — local
models reuse the KV cache across turns, and a prompt that changes mid-session throws that away.
**Everything M3 injects must arrive as a message, exactly as Claude Code does it.**

### 2.2 There is no Skill tool, and the manifest fields for it are dead

`desktop/src/main/harness/tools/` = `read, write, edit, bash, glob, grep, web-fetch, web-search,
todo-write, ask-user-question` (+ `guards, net-guard, registry, subject-glob, truncate, types`).
`NATIVE_TOOL_NAMES` in `desktop/src/shared/harness-manifest.ts:27` lists exactly those ten.
No `Skill` tool exists anywhere in the harness.

`HarnessManifest` already declares `skills?: string[]; mcp?: string[]`
(`harness-manifest.ts:23`) — **both fields have zero consumers in `src/main/harness/`.** They are
placeholders from the Phase 2 design awaiting this milestone. Decide deliberately whether they
become real (per-preset skill/MCP allowlists) or get deleted.

Every tool goes through `defineTool()` (`tools/registry.ts:9`): uniform output truncation
(30 000-char default cap), abort-aware error labeling, actionable never-bare error strings.
A Skill tool must ride that pipeline, not bypass it. Interactive tools are driver-routed and skip
guards/decide — `AskUserQuestion` is the precedent to copy if a skill needs to ask something.

### 2.3 Slash commands in native sessions are dead ends — and two of the three paths are SILENT

The dispatcher `desktop/src/renderer/state/slash-command-dispatcher.ts` is provider-agnostic.
It returns `{handled, alsoSendToPty, rewritten}`. `/compact` dispatches `COMPACTION_PENDING` then
forwards `/compact` to the PTY (`:100`); `/clear` dispatches `CLEAR_TIMELINE` then forwards
`/clear` (`:123`). Both rely on Claude Code doing the real work — the reducer actions are pure UI.

Three call sites consume `alsoSendToPty`, and they behave differently for native:

| Path | Code | Native behavior today |
|---|---|---|
| Typed into the input bar | `InputBar.tsx:369-379` | **Honest toast:** "Slash commands aren't available for YouCoded-runtime sessions yet." |
| Chosen from the command drawer | `App.tsx:2073-2077` | `guardedPtySend` returns `false`, return value **ignored → silence** |
| Chosen as a skill whose prompt starts with `/` | `App.tsx:2126-2128` | same — **silence** |

`guardedPtySend` (`App.tsx:551`) refuses natively via `canPtySend`
(`state/pty-input-gate.ts:96`: `if (session.provider === 'native') return false`), and the toast
inside `notifyIfPtyBlocked` is only reached for the *pending-interaction* case — so a native user
clicking a drawer command gets **no feedback at all**.

**Verified dead button worth fixing early:** ThemeScreen's "✦ Build New Theme with Claude"
(`ThemeScreen.tsx:234`) calls `onSendInput('/theme-builder ')`, which App wires straight to
`guardedPtySend` (`App.tsx:3092-3096`). In a native session that returns false and nothing
happens — no toast, no message, no session. This is the single most visible instance of the gap
M3 closes (and it is why program §4 item 1 names `ThemeScreen.tsx` explicitly). Note the existing
code comment there: a follow-up intends this to launch a **new** session rather than pipe into
the current one — see §6 Q5.

### 2.4 Skills exist, but only as Claude-Code-shaped artifacts

`desktop/src/main/skill-scanner.ts:21` `scanSkills()` reads three sources: bundled
`~/.claude/plugins/youcoded-core/skills/`, marketplace plugins via `installed_plugins.json`
(`skills/` under each `installPath`), and user skills at `~/.claude/skills/`.
`skill-provider.ts` (`LocalSkillProvider`) owns discovery/search/install/uninstall/overrides for
both IPC and the remote server; `skill-config-store.ts` owns favorites/chips/overrides/private
prompt skills in `~/.claude/youcoded-skills.json`.

`command-provider.ts` merges three command sources for the drawer: YouCoded-dispatcher commands
(`youcoded-commands.ts`), filesystem-scanned user/project/plugin commands (`command-scanner.ts`),
and hand-maintained CC built-ins (`cc-builtin-commands.ts` — those render as non-clickable in the
drawer). So **discovery is already solved**; what is missing is a native *execution* path — the
step CC currently performs by reading the skill's `SKILL.md` and following it.

### 2.5 MCP exists in the app, but nowhere near the harness

`desktop/src/main/mcp-reconciler.ts` scans `~/.claude/plugins/*/mcp-manifest.json` and writes
Claude Code's `~/.claude.json` `mcpServers` section (only `auto: true` entries, platform-filtered,
never removes user entries, expands `{{plugin_root}}`). That is **plumbing for CC**, not for the
native harness: no MCP client, no transport, no tool bridging exists in `src/main/harness/`.
`SessionContext.mcpServers`/`hasMcpConfig` in `src/shared/types.ts:669-671` are CC-derived status
fields. M3 item 4 is genuinely greenfield and is the largest unscoped piece — treat it as its own
design pass inside the plan doc.

### 2.6 Context management on master is one function, not a system

`HarnessSession.fitToContext` (`harness/harness-session.ts:231`, called at `:458`) is the whole
of it: a floor that trims to fit before each model call. `history-rebuild.ts` replays the session
JSONL into `ModelMessage[]` on resume. `model-step-budget.ts` maps a model-family regex to 50-vs-25
steps and is the only place a raw modelId is inspected — a stopgap M6 item 4 deletes.

**There is no capability profile, no two-stage compaction and no real-context-window enforcement
on master.** `resolveProfile`, `effectiveContextWindow` and `autoCompaction` appear nowhere in
master's `src/`; 8 of the 9 tests the rule's Plan C section names do not exist there. Program §4
item 5 (capability-gated injection) therefore has **no profile to gate on yet** — see §6 Q3.

### 2.7 What M1/M2 leave in place that M3 must not break

- **Session JSONL is single-writer and append-only**, one file per session at
  `~/.youcoded/sessions/<cwdToProjectSlug(cwd)>/<id>.jsonl`; **line 1 is the header
  (`NativeSessionHeader`, `session-store.ts:21`) and is written once, never rewritten.** The
  header carries `binding`, `cwd`, `createdAt`, optional `title` — *not* the system prompt. Any
  `/clear` design has to say what it appends, because it cannot rewrite history.
- **Queue + interrupt semantics are pinned** (M1): `interrupt()` cancels the current turn and the
  queue still drains; `quiesce()` (M2) is strictly stronger — queue-clear → macrotask →
  cancel+interrupt → await running → drain. Don't add a third half-stop.
- **Four-surface IPC parity** — `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`,
  `SessionService.kt` — pinned by `desktop/tests/ipc-channels.test.ts`. Any new `native:*` or
  `skills:*` channel needs all four, with Android stubs honest (Android's native runtime is M8).
- **The remote web client is in scope for every milestone** (§9 exit criteria (c)): whatever you
  build must work, or degrade honestly, over remote access — not silently no-op like §2.3 does.
- **No interim "not available yet" shims** (Destin, 2026-07-22). M3's job is to delete the two
  shims that exist, not add more.

---

## 3. The five M3 items

Program §4 is the authority; this is the implementer's view of each.

**1. Skill tool + skill surfaces.** A `Skill` tool that loads a skill's instructions **as
messages**, plus the drawer / ThemeScreen entry points invoking it for native sessions. Starting
points: `defineTool` (§2.2) for the tool; `scanSkills()` + `LocalSkillProvider` (§2.4) for
discovery — reuse them, don't invent a second registry; §2.3's table for the three call sites that
must stop being silent. Model-invoked vs user-invoked is Q1.

**2. `/clear` and `/compact` as real context operations.** Wire `CLEAR_TIMELINE` and
`COMPACTION_PENDING` (already dispatched, `slash-command-dispatcher.ts:94`/`:118`) to real harness
operations under the byte-stable prompt. `/clear` = reset the message history; `/compact` =
summarize-then-reset. Persistence design is Q2; compaction implementation is Q3.

**3. Path-scoped rules + nested CLAUDE.md.** A path matcher that injects a rule message after a
tool touches a matching path (the `paths:` frontmatter in `.claude/rules/*.md` — same mechanism
this workspace uses on Claude Code), plus nested/subdirectory CLAUDE.md discovery. Already in:
the root-walk snapshot in `prompt-assembly.ts` (§2.1) — which takes only the **first** file found
and truncates at 20 000 chars, so nested discovery is genuinely absent, and the truncation
interacts with Q3.

**4. MCP in native sessions.** Greenfield (§2.5). Program §4 requires the plan doc to resolve at
minimum: config source (reuse projects' `.mcp.json` + app settings — do not invent a registry),
transport order (stdio first), tool namespacing (CC's `mcp__server__tool` so names can't collide
with the ten native tools), and how MCP tools map to permission-engine subjects. That last point
is sharp: `permission-engine.ts` is last-match-wins and remembered rules outrank the destructive
deny list — read `.claude/rules/native-runtime.md`'s permission bullets before designing it.

**5. Capability-gated injection.** A 600-word rule can blow a small model's window. No profile
exists on master (§2.6) → Q3.

---

## 4. Constraints (non-negotiable)

1. **Byte-stable system prompt.** Injection is messages, never mid-session prompt mutation.
2. **Append-only session JSONL, header written once.** Every new persisted concept is a new event
   type on lines 2+.
3. **Four-surface IPC parity**, Android stubs honest, `ipc-channels.test.ts` green.
4. **Fakes must be able to express failure** — the #177 lesson. `holder-takeover.test.ts` passed
   for weeks while native takeover was a no-op because its fakes could not fail. If you write a
   fake skill store or fake MCP transport, make failure representable and test it.
5. **Every user-facing error follows `docs/error-message-standards.md`** — specific and accurate,
   or general and non-committal with Report-bug / Diagnose-with-Claude. Never a guessed cause.
6. **WHY comments on non-trivial edits** (Destin is a non-developer and reads them).
7. **Never touch the live built app** — `.claude/rules/live-app-safety.md`. Dev testing only via
   `bash scripts/run-dev.sh <branch> --label "M3 Skills" --offset N --profile m3`. Destin now runs
   `1.3.0-beta.9` as his production install; other sessions may hold ports 5223/5273.
8. **Flag interactive/visual verification for Destin** instead of building a CDP rig.

---

## 5. Process

1. **Sync first** (`git fetch origin && git pull origin master` in `youcoded/`), then plan doc,
   then implementation — in a **worktree** (`worktrees/m3-skills-commands`), never the main checkout.
   Deps: symlink `desktop/node_modules` from the main checkout rather than `npm ci`
   (`npm ci` inside a worktree rimrafs through the link — see workspace CLAUDE.md), and remove
   the link before `git worktree remove`.
2. **Subagent-driven implementation** with per-task review packages and a progress ledger, then a
   **final whole-branch review**, then the PR. M2's ledger honesty matters: I once recorded a
   fixed test that wasn't fixed, and the final review caught it — verify claims against the tree
   before writing them down.
3. **Mutation-verify every guard** you add (break the code, watch the test fail, restore).
4. **Close-out is part of the work:** merge AND push AND move the plan/handoff to `docs/archive/`
   AND flip the program §4 status AND the ROADMAP item, in the same session.

---

## 6. Open design questions — get Destin's answer before planning

**Q1 — Skill invocation model.** Claude Code has two paths: a model-invoked `Skill` tool and a
user-invoked `/skill-name` command. Does native ship both (parity), or user-invoked first? This
decides whether skill *selection* is a model decision (needs skill descriptions in the tool
schema, which costs prompt tokens on every turn) or a UI decision.

**Q2 — What `/clear` means for a native session.** The JSONL is append-only with a
write-once header, so "clear" cannot erase history. Three candidate semantics: (a) append a
`clear` event and have `history-rebuild` treat it as a barrier — history stays on disk, the model
sees nothing before it; (b) start a *new* session (new id, new file) and leave the old one
resumable; (c) both, with (a) as `/clear` and (b) as `/new`. Note the dispatcher already treats
`/clear`, `/reset` and `/new` as one case (`:104`), and (a) has a knock-on for M2: the
conversation record's title/lastActive semantics after a barrier.

**Q3 — `/compact` implementation, and its dependency on Plan C.** The unmerged branch
`origin/feat/native-local-reliability` already has two-stage compaction (prune tool output →
summarize on a user-message boundary, abort-raced, fail-safe) plus the capability profile that
item 5 wants to gate on. Options: (a) merge/rebase Plan C first (that is M6 item 1 — pulls it
earlier in the sequence, and it needs its own review since it has never been merged);
(b) implement compaction fresh in M3 and reconcile later (duplicated work, likely divergence);
(c) ship M3 items 1/3/4 now and defer 2's `/compact` half until Plan C lands. **This is the
biggest sequencing decision in the milestone** — it also decides whether item 5 has a real
profile to gate on or a placeholder.

**Q4 — MCP v1 scope.** Stdio-only for v1? Which config sources are honored (project `.mcp.json`,
app settings, CC's `~/.claude.json` that `mcp-reconciler.ts` already writes)? Do MCP tools inherit
the same permission prompts as native tools (recommended) or get their own posture?

**Q5 — ThemeScreen "Build New Theme with Claude".** Fix it in place (invoke the skill in the
current session) or implement the existing code comment's intent (launch a **new** session for the
theme build)? The second is better UX and more work; it also intersects M9's onboarding thinking.

**Q6 — Do `skills`/`mcp` manifest fields become real?** `harness-manifest.ts:23` declares them
with zero consumers. Per-preset allowlists (Assistant gets fewer skills than Coder), or delete?

---

## 7. Adjacent state you should know about

- **PR #248 is open** (`fix/sync-health-primary-system`, worktree `worktrees/sync-health`): the
  health check called GitHub-synced machines "No sync configured". Unrelated to M3, but it is
  in-flight work on master's doorstep.
- **beta.9 two-device dogfood is in progress** (Z13 + Intel macOS VM). It is the last v1.3.0
  gate. If it turns up M2 bugs they take priority over starting M3.
- **M2 residue** (ROADMAP, 2026-07-23): remote WS set-tag/set-note don't broadcast
  `SESSION_META_CHANGED`; no `quiescing` refuse-flag; `SESSION_CREATE` refusal-branch untested;
  holder can't detect lease loss while the hub is down; Android meta = M8.
- **Rule word budgets are over** across the workspace (`native-runtime.md` 2140 vs 600 is the
  worst). If M3 adds contract text to that rule, migrate overflow into
  `youcoded/docs/native-runtime.md` rather than growing it further.
- **The macOS CI flake** in `sync-spaces-engine.test.ts` ("debounces") is escalated and
  roadmap-tracked; it can redden a PR without being your fault.

---

## 8. Definition of done for M3

- The five items shipped with tests, per program §9's exit criteria (a).
- `.claude/rules/native-runtime.md` (+ `conversations.md` if touched), `youcoded/docs/native-runtime.md`
  and `docs/MAP.md` updated **in the same PR** — criterion (b). MAP maps master only: do not add
  files that live on an unmerged branch (that exact mistake was cleaned up 2026-07-24).
- A dogfood pass over M3's surfaces on **both** clients — desktop renderer and remote web client —
  criterion (c). Flag the interactive parts for Destin rather than scripting them.
- No new "not available yet" shims, and the two in §2.3 are gone.
- Plan + this handoff archived, program §4 flipped, ROADMAP updated, worktree and branch cleaned up.
