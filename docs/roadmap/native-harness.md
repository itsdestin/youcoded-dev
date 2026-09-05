# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist. Not here: a chat you already had (chat-data); getting a model onto disk
(local-models); Claude Code is doing the work (claude-code-integration).

## sessions
- [ ] Memory the desktop app holds for each session is never let go when the session ends —
      six small per-session bookkeeping structures survive session exit (found 2026-08-27 while
      chasing the sidecar crash; not the crash cause, a few hundred bytes each)
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-per-session-maps-never-torn-down.md

- [ ] Settings says OpenRouter is "Connected" and its Test button comes back green, while every
      turn is being rejected with a 401 — Destin hit it live 2026-08-31 (key created 2026-07-15,
      dead 2026-08-31). Approved design exists; held by Destin, not yet built
      `settings` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-openrouter-connected-never-validated.md

- [ ] After a native session recovers from a step that produced only blank whitespace, the
      history the model sees on resume is not byte-identical to what it saw live (leading blank
      lines fold into the retry's text). Invisible to the user; leftover from the empty-step fix
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-rebuilt-history-whitespace-step-divergence.md

- [ ] Main-chat thinking bubble flickers — disappears and reappears with no visible tokens — during
      a very slow native stream (Destin, 2026-08-16, OpenRouter qwen3.8-27b streaming at ~6
      tokens/s; not specialist-related). Needs a slow provider to reproduce
      `chat` `desktop` `needs-verify` `checked 2026-08-16` `needs-repro`

- [ ] Resuming a native conversation that never got a title (predates the title feeder, or all
      title attempts failed offline) shows a real name in the Resume Browser row but `Resuming…`
      on the session pill until the next completed turn. Fix is known; held on Destin's copy
      call — should the pill show the raw first-message text the browser row already uses?
      Destin 2026-09-02: the pill shows the first message's opening words
      `session-drawer` `desktop` `confirmed` `checked 2026-09-02` → docs/active/investigations/2026-09-01-resumed-native-session-no-stored-title.md

- [ ] During a cross-device takeover of a native session, a message sent in exactly the wrong
      instant runs a whole turn on the old device before the handoff proceeds (found in the M2
      final review; the flush still happens after, so nothing is lost)
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-quiesce-takeover-send-window.md

- [ ] Editing a queued message that had files attached refills the composer with the raw file
      paths as text and drops the attachments (accepted-for-now limit from the M1 queue work);
      also the docked queue strip vanishes on an app reload even though the queue still drains
      `input-bar` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-queued-message-attachments-lost-on-edit.md

- [ ] Editing a queued message puts its text into the typing box; if the box already has text,
      the queued text silently replaces it today. Decided 2026-09-02: when the box is not empty,
      offer a small menu — Replace or Append — and skip the menu when it is empty (same rule for
      quick chips, user-interface)
      `input-bar` `desktop` `needs-verify` `checked 2026-09-02`

- [ ] Agents & Automations — a third top-level view beside Chat and Projects where work runs on a
      schedule or trigger without the user (cron / "run now", budgets as hard stops, an inbox of
      runs). Verified 2026-09-01: zero scheduling code exists in either app. Blocked on Destin's
      "Assistants made of Duties" ruling, plus cost accounting and the specialists durable journal
      `all` `blocked` `checked 2026-09-01` → docs/active/specs/2026-09-01-agent-platform-vision-and-state.md

- [ ] Goal layer — checkable goals and a goal queue on top of the existing step-budget and
      doom-loop machinery (super-agent roadmap step 8). Deliberately last in that program:
      autonomy amplifies whatever the harness already is, so it lands after containment and the
      eval gate
      `desktop` `parked` `checked 2026-08-26`

- [ ] Context & knowledge as product surfaces — five-idea outline, no design done: grow the
      context popup into a real surface (per-item token cost, "this rule loaded because…", session
      mutes); one-tap "remember this?" correction capture; work state as a first-class object;
      shareable knowledge packs via the marketplace; provenance + revocation as the gate on sharing
      `desktop` `parked` `checked 2026-07-28` → docs/archive/specs/2026-07-28-context-knowledge-app-features-outline.md

- [ ] Third-party agent CLIs as session providers (Codex first, then OpenCode / Cursor) — cuts
      against the standing "one first-party harness, every model" direction, kept as a deliberate
      what-if. Codex was scoped for real 2026-08-31 via its official app-server interface (draft
      spec; nothing committed to build)
      `desktop` `parked` `checked 2026-08-31` → docs/active/specs/2026-08-31-codex-session-provider-design.md

- [ ] Native Runtime Parity Program — everything that still separates a native session from a Claude
      Code one (context truncation notice, M6 onward, cwd contract, MCP phase 2, M7–M9). The single
      doc is `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md` §5.1
      `all` `in-flight` `checked 2026-09-01` `v1.3.1`

- [ ] Custom harness builder — pick a preset, edit the prompt, toggle tools, set the permission policy,
      bind a model, save it as a shareable manifest. No design yet; the preset tool lists are still
      decorative, so the manifest must become load-bearing first
      `desktop` `parked` `checked 2026-09-01`

- [ ] The exact request sent to the model each step (system prompt, tool schemas) is never kept, so a
      resumed session cannot reproduce what produced a turn, and nothing is flushed to disk at turn
      boundaries
      `desktop` `needs-verify` `checked 2026-08-26`

- [ ] The native agent has no memory of past chats — chat search as a tool it can call, plus a small
      index it maintains and a flush before compaction. Sequenced after the eval CI gate and the
      request log above
      `desktop` `parked` `checked 2026-08-26`

- [ ] When a small model's session has its project rules outlined, skills cut or MCP servers dropped
      to fit the context budget, only the model is told — nothing on screen says so. In progress on
      branch `feat/context-truncation-notice` (worktree `worktrees/context-truncation`)
      `chat` `desktop` `in-flight` `checked 2026-09-01`

- [ ] A future "Try again" retry that passes the provider as a variable would fail to compile — the
      send function only accepts the literal provider names. No live caller today; fix when the retry
      affordance lands
      `desktop` `parked` `checked 2026-07-23`

- [ ] Every cloud model gets frontier-strength treatment (full tool presentation, parallel calls),
      so a small hosted model chokes the same way a small local one does; and an unknown local
      model is sized by its context window, a poor stand-in for capability. Capability and context
      budget want to be two separate axes
      `desktop` `parked` `checked 2026-09-01`

## tools
- [ ] One Grep from a conversation whose folder is your home directory can hang the turn for
      hours — on 2026-08-26 a background Explorer's search sat 4 h in Google Drive before Stop killed it
      `desktop` `confirmed` `checked 2026-09-01` `urgent` → docs/active/investigations/2026-09-01-grep-glob-no-deadline.md

- [ ] On a small local vision model the assistant is told an image is "already visible earlier in
      this conversation" and gets no picture, even though it can no longer see it, until the file changes
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-trimmed-image-dedupe-cache.md

- [ ] Write and Edit refuse a file "modified since you read it" after a plain touch or git checkout
      that changed nothing, and can miss a real outside edit made in the same second
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-write-edit-mtime-staleness.md

- [ ] After the shell has cd'd elsewhere, Read and Bash can silently open two different files for the
      same relative name — Destin to decide: reject relative paths outright, or keep the hints and live with it
      Destin 2026-09-02: needs more investigation before deciding
      `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-multi-model-cwd-contract.md

- [ ] Background Bash follow-ups, deferred on purpose at the 2026-08-28 sizing: typing into a running
      command, a "Running commands" list outside the chat, and "tell me when the log says ready"
      `desktop` `parked` `checked 2026-09-04` → docs/archive/investigations/2026-08-26-native-tools-vs-other-harnesses.md

- [ ] Bash shows the model only ~4,000 chars / ~100 lines of output (7–12× less than peer harnesses,
      so every long result costs a second call); and the "prefer Read/Grep over cat/grep" wording
      should switch off in full-auto — decide both with the harness evaluator, not by argument
      `desktop` `parked` `checked 2026-09-04` → docs/archive/investigations/2026-08-26-native-tools-vs-other-harnesses.md

- [ ] WebFetch's "page was too thin to extract" thresholds were reasoned defaults, never measured
      against real pages the way the JS-render floor next to them was
      `desktop` `parked` `checked 2026-09-01`

- [ ] Glob refuses a nested brace pattern like `{a,{b,c}}` with an error; revisit only if a real use
      case shows up (ripgrep 15 lifted the same restriction)
      `desktop` `parked` `checked 2026-09-01`

- [ ] Small local models loop on Edit "old_string not found" over smart quotes, trailing spaces and
      Unicode dashes — wanted: one normalisation pass before matching. Gate: measure the not-found
      rate with the harness evaluator first, now that the 2026-08-28 wording change shipped
      `desktop` `needs-verify` `checked 2026-09-04` → docs/archive/investigations/2026-08-26-native-tools-vs-other-harnesses.md

- [ ] Idea: after Edit/Write in the Coder preset, append the file's syntax/type errors to the tool
      result (JSON/YAML check, tsc for TypeScript) the way OpenCode and Hermes do
      `desktop` `parked` `checked 2026-09-04` → docs/archive/investigations/2026-08-26-native-tools-vs-other-harnesses.md

- [ ] Nobody has read a PDF with the native agent in an installed build — the PDF reader's extra
      files are unpacked from the app archive on paper only, unverified outside a dev instance
      `desktop` `needs-verify` `checked 2026-08-12`

## permissions
- [ ] After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later
      command that looks covered still raises the permission card with no reason — it reads
      as the app forgetting the approval
      `tool-cards` `desktop` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-permission-near-miss-silent.md

- [ ] Full Auto still stops to ask before merely reading a file outside the project, and a web
      search or fetch can raise the same file-permission card. Blocked on Destin approving the
      approval-card copy in the workbench (plan Task 2); code tasks 3–4 can start in parallel
      `tool-cards` `desktop` `blocked` `checked 2026-09-01` → docs/active/investigations/2026-09-01-full-auto-external-read-ask.md

- [ ] Sessions on local/OpenRouter models have no "Skip Permissions" — the toggle is hidden on
      create and resume, and the permission chip stops at Full Auto
      `status-bar` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-native-no-bypass-mode.md

- [ ] Once a wide enough Bash approval is saved, a destructive `rm` on a workspace or system
      directory can run without asking — nothing sits below a remembered grant the way Claude
      Code's target check does
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remembered-grant-beats-deny-list.md

- [ ] The assistant refuses to open `~/.ssh` or `.env` with its file tools, but `cat` through a
      shell command reads the same file; there is no sandbox underneath either
      `desktop` `confirmed` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-bash-skips-secret-path-deny.md

- [ ] Sandboxing vs. a "scratch workspace" (run risky sessions on a copy, show a diff to keep or
      discard) — pick one as its own design pass before any sandbox work; the existing write-up
      argues against OS sandboxing as a cross-platform promise
      `desktop` `parked` `checked 2026-08-26` `security` → docs/active/investigations/2026-08-09-native-skip-permissions.md

## cost
- [ ] The cost self-check stays silent on a mis-priced cheap model whenever the same session
      also ran a correctly-priced model for most of its turns — the warning never fires
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-cost-self-check-dilutes-across-model-swap.md

- [ ] The session-cost chip reads low once a long session starts compacting — a step down at
      every compaction, ~25% low on a chip showing $5 after five of them; the self-check reports nothing
      `status-bar` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-session-cost-chip-low-after-compaction.md

- [ ] Changing models while an answer is still streaming bills that whole turn at the new
      model's rate and labels it with the new model's name (measured: a turn worth $7 reported as $70)
      `status-bar` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-mid-turn-model-swap-reprices-whole-turn.md

- [ ] Cache efficiency — cloud and local sessions leave cache hits on the table: OpenRouter turns
      can drift between endpoints, local models re-read the whole conversation every specialist
      turn, long local sessions lose their cache to trimming and idle shutdown (the ~50% "Reuse"
      reading on DeepSeek is NOT a bug — measurement artifact, documented)
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-08-17-cache-efficiency.md

## specialists
- [ ] Helper (specialist) transcripts pile up in the sessions folder forever — there is no way
      to delete one, and closing the parent conversation leaves its helpers' files behind.
      Blocked on a general delete-conversation feature existing at all (none does today)
      `desktop` `blocked` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-specialist-child-transcript-gc.md

- [ ] After a reload, a helper's card can come back with no notes on it: the reload sends the
      conversation's history and the helper records separately, and if the helper record arrives
      before the card exists on screen it is dropped rather than parked, so the next live update
      is the first thing the card shows. Found by the 2026-09-04 code review of the note-order fix
      `tool-cards` `desktop` `needs-verify` `checked 2026-09-04`

- [ ] A note sent to a background helper mid-run shows at the bottom of its Activity trail,
      after tool calls that actually happened later. Fix on youcoded `fix/specialists-ledger-bugs`
      (`f0ac766d`, unmerged; the same branch pins checklist 9b as a test, `e8ce8001`)
      `tool-cards` `desktop` `in-flight` `checked 2026-09-04` → docs/active/investigations/2026-09-01-specialist-notes-not-interleaved.md

- [ ] Specialists stage two — plans: the model proposes a multi-step fan-out as data, the user
      approves a card, the executor journals and resumes it. Approved in the 2026-08-11
      specialists spec (§4, §7, §8). The three live probes the spec requires were run on
      2026-09-04 on the pinned engine build (four helpers at once is the ceiling; the first
      fan-out pays most of its prompt cost again; plan authoring works from the 9B model class
      up and not below) — results in youcoded `docs/engine-dependencies.md` → "Stage-two probes".
      Still gated on Destin's decisions (the stage-two decisions prompt handoff). The Claude Code
      bridge (`youcoded agent run`) is unbuilt from the same spec
      `desktop` `decision` `checked 2026-09-04`

- [ ] "Assistants" made of "Duties" — Destin's unit of organisation for the future Agents &
      Automations view: an assistant groups duties, may be a coordinator, a sole agent, or no
      agent at all; "ping the user and wait" is a core competency. Captured, not designed —
      decision 1 in the agent-platform vision doc §9; Phase 4's agent model and inbox wait on it
      `all` `parked` `checked 2026-09-01`

- [ ] Specialists — six follow-on ideas from plan 1c, named but not designed: promote a
      foreground helper to background mid-run; open a helper's own transcript in a viewer; a
      project-level native specialists folder; per-helper token/cost on its own card; a strict
      per-action approval toggle; a live-updating Settings roster (no file watchers today)
      `desktop` `parked` `checked 2026-08-16`

## skills-mcp
- [ ] MCP servers can only be set up by hand-editing a config file on disk — there is no
      settings screen to add, edit or remove one, and servers Claude Code already knows about
      stay invisible to the app's own agent (desktop; deferred from phase 1, 2026-08-05; still
      unbuilt 2026-09-01)
      `settings` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-native-mcp-phase-2.md

- [ ] Open a native session on a repo and the repo's own `.claude/skills/` folder is never picked up —
      Claude Code in the same folder would see them. Plan written 2026-08-06
      (`docs/active/plans/2026-08-06-project-scoped-skills.md`), build work only
      `desktop` `needs-verify` `checked 2026-08-26` `v1.3.1`

- [ ] Pasting a path like `/README.md` or `/My Files/notes.md` into the chat still gets eaten as a
      slash command and the text vanishes; the common `/home/…` shape was fixed 2026-08-10. Destin
      deprioritized the leftovers the same day
      `input-bar` `desktop` `parked` `checked 2026-08-10`
