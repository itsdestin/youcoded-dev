# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist. Not here: a chat you already had (chat-data); getting a model onto disk
(local-models); Claude Code is doing the work (claude-code-integration).

## sessions
- [ ] A "Home" folder every install starts with, holding overarching assistant settings that
      apply everywhere (Destin's note on the first-run guide's review deck, 2026-09-10). The
      zero-context "No folder" choice on the new-session form shipped 2026-09-11 as the first
      half; this is the fuller idea
      `all` `decision` `checked 2026-09-11`

- [ ] Idea (Destin, 2026-09-08): "YouCoded Mesh" automatically chooses an available, suitable
      device of yours for remote requests and scheduled/autonomous duties, without making you
      manage which device runs each request. Build on Agents & Automations and secure remote
      access; account-based access is tracked in remote-access. Around v1.4, not a release promise.
      Suitability, required files/tools, permissions and avoiding duplicate runs need design.
      `all` `parked` `checked 2026-09-08` `v1.4`

- [ ] Idea (Destin, 2026-09-08): "YouCoded Cloud" could run an automation when none of your
      devices is online, as an optional, possibly paid fallback after YouCoded Mesh. Around v1.4
      or later, not a release promise or agreed pricing. Consent, spending limits, required data
      and credentials, privacy and safe handoff need design; do not assume offline-only files
      are available to the cloud or treat device/cloud retries as permission to run work twice.
      `all` `parked` `checked 2026-09-08` `v1.4`
- [ ] Rework how things are cut down to fit a small model. Project rules are handled well (every
      heading survives, the file is named); skills and triggered rules are still tail-cut. Since
      2026-09-10 (youcoded `aa6091f1`) a cut skill at least names the file that holds the rest and
      is cut on a line boundary, and the model's own skill tool is now window-aware — the two
      correctness fixes; the redesign (how skills and rules should be shortened rather than
      tail-cut) is what remains. Seven decisions are written up with options and how other tools
      handle each one — deck ready to serve, nothing answered. Parked 2026-09-09 to finish the
      session-context panel first
      `desktop` `parked` `checked 2026-09-16` → docs/active/investigations/2026-09-09-small-model-context-truncation.md

- [ ] Project startup reminders and before/after-action checks should work in native chats too,
      with approval before scripts run and clear reports when a check fails or times out
      `desktop` `parked` `checked 2026-09-05` `security` → docs/active/investigations/2026-09-05-native-guidance-followups.md

- [ ] The assistant can receive a file's instructions only after its first edit has already
      happened; it should see them and reconsider before changing the file
      `desktop` `parked` `checked 2026-09-05` → docs/active/investigations/2026-09-05-native-guidance-followups.md

- [ ] The assistant should know which tools, instructions and automatic checks are actually
      active in this chat, rather than guessing from setup instructions
      `desktop` `parked` `checked 2026-09-05` → docs/active/investigations/2026-09-05-native-guidance-followups.md

- [ ] Settings says OpenRouter is "Connected" and its Test button comes back green, while every
      turn is being rejected with a 401 — Destin hit it live 2026-08-31 (key created 2026-07-15,
      dead 2026-08-31). Approved design exists; held by Destin, not yet built
      `settings` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-openrouter-connected-never-validated.md

- [ ] The ChatGPT and OpenRouter provider cards in Model Providers settings have no manual
      refresh — Destin upgraded his ChatGPT plan and the new models didn't show up until he
      thought to sign out and back in. A refresh button on each card so a plan or key change
      is picked up without that workaround
      `settings` `desktop` `confirmed` `checked 2026-09-07`

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
      shareable knowledge packs via the marketplace; provenance + revocation as the gate on sharing.
      Destin's 2026-09-05 ask — explain which instructions loaded, why, and what was skipped or
      shortened — shipped 2026-09-10 as the "What the assistant was given" panel; the five ideas
      above are what this item still holds
      `desktop` `parked` `checked 2026-09-16` → docs/active/investigations/2026-09-05-native-guidance-followups.md

- [ ] Third-party agent CLIs as session providers (Codex first, then OpenCode / Cursor) — cuts
      against the standing "one first-party harness, every model" direction, kept as a deliberate
      what-if. Codex was scoped for real 2026-08-31 via its official app-server interface (draft
      spec; nothing committed to build). Superseded for the ChatGPT-plan goal on 2026-09-04:
      OpenAI publicly welcomes the plan inside third-party apps, so the plan's models are
      reached directly (shipped 2026-09-05); this stays for Codex-the-agent only
      `desktop` `parked` `checked 2026-09-04` → docs/archive/investigations/2026-09-04-chatgpt-subscription-paths.md

- [ ] Native Runtime Parity Program — everything that still separates a native session from a Claude
      Code one (context truncation notice, M6 onward, cwd contract, MCP phase 2, M7–M9). The single
      doc is `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md` §5.1
      `all` `in-flight` `checked 2026-09-01` `v1.3.1`

- [ ] Custom harness builder — pick a preset, edit the prompt, toggle tools, set the permission policy,
      bind a model, save it as a shareable manifest. No design yet; the preset tool lists are still
      decorative, so the manifest must become load-bearing first
      `desktop` `parked` `checked 2026-09-01`

- [ ] The exact request sent to the model each step (system prompt, tool schemas) is never kept, so a
      resumed session cannot reproduce what produced a turn. Since youcoded#461 (2026-09-09) a
      checkpoint IS written at every turn boundary, but it carries only a fingerprint of the
      system text and tool names, never the prompt or schemas themselves
      `desktop` `needs-verify` `checked 2026-09-16`

- [ ] The native agent has no memory of past chats — chat search as a tool it can call, plus a small
      index it maintains and a flush before compaction. Sequenced after the eval CI gate and the
      request log above
      `desktop` `parked` `checked 2026-08-26`

- [ ] When a reply fails, the red error card says to send the message again but offers no
      Try again button — the button exists but is only ever connected on the "may have stalled"
      card — and the Stop button is gone too. Needs a decision: here "try again" would mean
      re-sending the message, not re-running a paused step
      `chat` `desktop` `confirmed` `checked 2026-09-16`

- [ ] While the assistant is quiet, the amber "Still waiting" card and the "Retrying in 15s…"
      countdown may flicker back and forth, because an unrelated update resets the chat to
      "fine" without clearing the stall warning. Reported by a code read, never seen live
      `chat` `desktop` `needs-verify` `checked 2026-09-16`

- [ ] Every cloud model gets frontier-strength treatment (full tool presentation, parallel calls),
      so a small hosted model chokes the same way a small local one does; and an unknown local
      model is sized by its context window, a poor stand-in for capability. Capability and context
      budget want to be two separate axes
      `desktop` `parked` `checked 2026-09-01`

## tools
- [ ] The assistant cannot explain the app it lives in: asked "how do I tag a session" or "where
      are the model settings" it guesses. Wanted (Destin, 2026-09-10 guide deck): a line in the
      system prompt or an info-desk tool it reaches for whenever a user asks how YouCoded or its
      settings work, answering from a maintained description of the app rather than from memory
      `all` `parked` `checked 2026-09-10`

- [ ] The assistant cannot search the WeCoded marketplace, so when it needs a capability it does
      not have it reaches straight for a script or an outside service instead of the plugin that
      already does the job. Wanted: a tool it can call to search plugins and integrations, so
      "check what we already have" comes before "build something new". Destin, 2026-09-05: a 1.3
      blocker, and the partner to the new "assume you can do it, find a way" rule in the prompt
      `marketplace-screen` `desktop` `needs-verify` `checked 2026-09-05` `v1.3`

- [ ] The assistant's standing instructions grew about five times on 2026-09-05 (youcoded #423) and
      what that did to a small model is still unknown. Measured twice on 2026-09-05 at one run per
      arm and both runs were inconclusive — the same build scored 2-3 points apart on the judged
      items across runs, which is the size of the effect. Needs `--repeats` (the evaluator now warns
      when a comparison plan lacks them). Still unmeasured either way: the COMPACT prompt a small
      LOCAL model gets, which no OpenRouter arm exercises, and whether "keep going until it's done"
      makes a small model loop more
      `desktop` `needs-verify` `checked 2026-09-05` → docs/archive/investigations/2026-09-04-native-prompt-vs-competitors.md

- [ ] One Grep from a conversation whose folder is your home directory can hang the turn for
      hours — on 2026-08-26 a background Explorer's search sat 4 h in Google Drive before Stop killed it
      `desktop` `confirmed` `checked 2026-09-01` `urgent` → docs/active/investigations/2026-09-01-grep-glob-no-deadline.md

- [ ] On a small local vision model the assistant is told an image is "already visible earlier in
      this conversation" and gets no picture, even though it can no longer see it, until the file changes.
      **Now genuinely reachable** — measured 2026-09-05 while building the local-engine upgrades: no
      `KNOWN_MODELS` entry has ever declared `supportsVision`, and local bindings always resolved to
      "don't know", so no local model could reach the buggy path at all. Once the engine reports a
      paired vision file, any downloaded local vision model resolves true, and the only remaining
      precondition is a context under ~8,500 tokens — which is exactly the small vision models this
      feature makes easy to install.
      `desktop` `confirmed` `checked 2026-09-05` → docs/active/investigations/2026-09-01-trimmed-image-dedupe-cache.md

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
- [ ] An explicitly authorized git push / branch-deletion cleanup was blocked with "user has not
      responded yet — the request is still pending on their screen" even though no approval prompt
      existed (paste-attachments merge close-out, 2026-09-15). This stops close-out and falsely tells
      the user to approve something absent; only claim a pending approval when a real request exists,
      and let authorized push and deletion commands proceed.
      Likely cause (2026-09-16, from code + saved transcripts, not reproduced live): that message
      is only ever sent to a SPECIALIST whose routed ask went unanswered for 5 minutes
      (`child-ask-router.ts`). The ask renders only inside the helper's Task card — often in an
      earlier, scrolled-past turn for a background helper — and the red session dot / attention
      summary count only top-level tools in the active turn (`useSessionAttention.ts`,
      `ChatView.tsx` awaitingTools), so nothing tells the user it exists; the only signal is the
      Specialists chip turning amber. Workers hit it on deny-listed `git push --force-with-lease`
      and `rm -rf` (2026-09-08 sessions). Fix changes what the user sees → options first
      `tool-cards` `desktop` `confirmed` `checked 2026-09-16`

- [ ] In Auto-edit, a hired specialist runs any shell command that isn't on the always-ask list
      with no prompt, although the main assistant itself would have to ask first — the launch
      "envelope" (`envelopeGranted: true`, `native-session-host.ts` buildSpecialistSession →
      `child-permissions.ts` step 6/7) turns every parent "ask" into "allow", and in Auto-edit
      no hire card is shown for built-in specialists. Agreed fix (2026-09-16): grant the envelope
      only when the session was on Ask first at hire time. Blocked on the phantom-approval item
      above, because it routes more helper asks through that hidden path
      `desktop` `confirmed` `checked 2026-09-16`

- [ ] After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later
      command that looks covered still raises the permission card with no reason — it reads
      as the app forgetting the approval
      `tool-cards` `desktop` `needs-verify` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-permission-near-miss-silent.md

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

- [ ] The context chip keeps the OLD model's window after a model swap or a resume — swap a
      1M model for a small local one and the chip can read "97% remaining" on a window the very
      next message overflows; it only corrects once a turn finishes. The session-context panel's
      "Context window" row and its small-window warning have the same lag
      `status-bar` `desktop` `confirmed` `checked 2026-09-16`

- [ ] Reopening a compacted conversation the next day can silently restore the whole
      pre-compaction history — the saved checkpoint is rejected because the system prompt carries
      today's date and a live git snapshot, so the conversation is rebuilt from the raw record
      while the chip still shows the post-compaction figure
      `desktop` `confirmed` `checked 2026-09-16`

## cost
- [ ] A specialist that is stopped or hits an error reports zero spend — press Stop while a
      helper is working, or let one fail after several turns, and its whole bill goes uncounted
      `status-bar` `desktop` `confirmed` `checked 2026-09-16`

- [ ] Cache efficiency — cloud and local sessions leave cache hits on the table, especially after
      reopening a conversation: OpenRouter turns can drift between endpoints, and both OpenRouter
      and ChatGPT-plan sessions can resend a changed opening prompt after restart instead of keeping
      the longest reusable prefix. Local models re-read the whole conversation every specialist
      turn, and long local sessions lose their cache to trimming (the ~50% "Reuse" reading on
      DeepSeek is NOT a bug — measurement artifact, documented). Improve resumed cloud-session
      affinity and prefix stability, then measure the first post-resume request rather than trusting
      historical totals. The idle-shutdown half is answered: turning on "Keep loaded" for a model
      stops both the per-model auto-sleep and the whole-engine idle shutdown, so that model's cache
      survives the gap between messages. The ChatGPT-only diagnostics and faithful continuation
      shipped in youcoded#461 (2026-09-09). Of the eight remaining breakers, youcoded#464
      (2026-09-10) shipped six plus the backend half of the seventh: Anthropic caching switched on
      and OpenRouter sessions pinned, compaction firing before the trimmer on every window,
      pruning committed only on a prune decision, the summary reusing the conversation's warm
      prefix and reporting its cost, an `expectedRebuild` flag on every turn, llama.cpp's reuse
      count recorded per step, and the Task tool pinned byte-identical across catalog reloads.
      The ChatGPT summary key was dropped on purpose (the summary shares the chat's key now).
      What is left: the Reuse chip's DISPLAY of expected vs surprise misses (four layouts in the
      survey, a deck for Destin), and a measurement pass in a dev instance — nothing reads the
      recorded local reuse count yet, and whether OpenRouter honours the top-level cache field
      and the session pin is asserted only against a stubbed network
      `desktop` `confirmed` `checked 2026-09-10` → docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md

- [ ] The per-reply length cap sent to cloud models (fixed 2026-09-05 at a flat 16,000 tokens, so
      OpenRouter stops reserving a frontier model's full 65k+ advertised max against the account
      balance on every message) should become a user-facing setting instead of a hardcoded
      number — some users may want shorter replies to stretch a small credit balance further,
      others may want a higher ceiling for very long single replies
      `settings/defaults` `desktop` `confirmed` `checked 2026-09-05`

## specialists
- [ ] Audit every place YouCoded recommends or automatically chooses a model, then build one
      maintained recommendation system so those choices do not go stale as model generations change
      `settings/defaults` `all` `confirmed` `checked 2026-09-15`

- [ ] Specialist operating limits should be adjustable in Settings: how many helpers may run at
      once and how often the assistant may send a running helper a note. Today both are fixed
      numbers; the 2026-09-09 transcript audit showed the assistant nagging one helper 14 times
      `settings` `desktop` `decision` `checked 2026-09-15`

- [ ] After the assistant uses 30 specialists in one session, let the user approve just the next
      helper or waive the limit for that session instead of refusing every additional helper
      `tool-cards` `desktop` `in-flight` `checked 2026-09-15` → docs/active/specs/2026-09-15-specialist-budget-permission-design.md

- [ ] A finished helper's report should be able to arrive quietly — read with your next message
      instead of starting a reply on its own — unless the assistant asked to be woken for that
      helper. Codex works this way (a mailbox read at the next turn); after a Stop the app now
      holds reports until you speak again, but after a normal answer a report still starts a turn.
      Needs a decision on the default and on how the assistant asks to be woken
      `desktop` `decision` `checked 2026-09-09`

- [ ] Helper (specialist) transcripts pile up in the sessions folder forever — there is no way
      to delete one, and closing the parent conversation leaves its helpers' files behind.
      Blocked on a general delete-conversation feature existing at all (none does today)
      `desktop` `blocked` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-specialist-child-transcript-gc.md

- [ ] After a reload, a helper's card can come back with no notes on it: the reload sends the
      conversation's history and the helper records separately, and if the helper record arrives
      before the card exists on screen it is dropped rather than parked, so the next live update
      is the first thing the card shows. Found by the 2026-09-04 code review of the note-order fix
      `tool-cards` `desktop` `needs-verify` `checked 2026-09-04`

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

- [ ] In the helpers popup, the amber "Needs you" label on a helper waiting for permission is
      close to unreadable on the three pale themes — measured 1.52:1 on light, 1.41:1 on creme
      and 1.19:1 on meadow-mist, against a 4.5:1 floor. The fix is the one the working pill took
      on 2026-09-05: colour the ring and tint, leave the word on the theme's own text colour.
      Left alone there because it is the consent affordance and the branch that measured it was
      about a different chip
      `tool-cards` `desktop` `confirmed` `checked 2026-09-05`

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

- [ ] **v1.3 release blocker — native-only users need a YouCoded-owned skills home.** Today the
      only project-skill convention is Claude Code's `.claude/skills/`, so a person using only
      YouCoded has no obvious place to put a personal or project workflow. Make `~/.youcoded/`
      and a project-owned `.youcoded/` location the native source of truth; treat `.claude/skills/`
      as optional import/export compatibility, never a prerequisite. The existing 2026-08-06 plan
      is Claude Code parity only and must be superseded or expanded before implementation.
      `all` `blocked` `checked 2026-09-05` `v1.3`

- [ ] Pasting a path like `/README.md` or `/My Files/notes.md` into the chat still gets eaten as a
      slash command and the text vanishes; the common `/home/…` shape was fixed 2026-08-10. Destin
      deprioritized the leftovers the same day
      `input-bar` `desktop` `parked` `checked 2026-08-10`
