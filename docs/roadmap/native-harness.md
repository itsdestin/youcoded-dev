# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist. Not here: a chat you already had (chat-data); getting a model onto disk
(local-models); Claude Code is doing the work (claude-code-integration).

## sessions
- [ ] **v1.3.1 release blocker.** The "No folder" choice on the new-session form (shipped
      2026-09-11) was never tested and not thought through (Destin, 2026-09-19: "we didn't
      really like think that through… I didn't test it at all"). Test that it works, then turn
      it into an incognito mode rather than just "no project folder". What incognito keeps and
      leaves out needs deciding. Goes with the "Your Assistant" project item below
      `all` `needs-verify` `checked 2026-09-19` `v1.3.1`

- [ ] **v1.3.1 release blocker.** Every install should come with a built-in project, "Your
      Assistant" (name not final), in the Projects list and managed by YouCoded. Destin,
      2026-09-19: the assistant itself is a project — "the rules it follows and the ways it
      behaves and the things it knows about you… is something that you get to build and design
      and change your way. It'll work fine if you don't change anything." It is the home folder
      for miscellaneous requests, and where the user's big-picture preferences, memory about
      them and global instruction files live and are edited. The first-run tour changes to
      point at it and frame it that way. Later it is the main assistant that takes a request
      from the phone ("hey, do this thing") and hands it to the right project — see YouCoded
      Mesh below. Replaces the 2026-09-10 "Home folder" idea from the first-run guide's review
      deck
      `projects` `all` `decision` `checked 2026-09-19` `v1.3.1`

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

- [ ] OpenRouter's remaining credit isn't shown anywhere in the app, and a refused OpenRouter
      key doesn't put a warning dot on the Settings gear (only on Assistant settings). Both
      designed in the connection-trust spec §3.4 (balance from `/credits`, the smaller of
      account balance and key limit; Rate Limits status-bar chip; gear red-dot third input),
      left out of youcoded#533
      `settings` `desktop` `parked` `checked 2026-09-18` → docs/archive/specs/2026-08-31-openrouter-connection-trust-design.md

- [ ] The ChatGPT provider card in Assistant settings → Cloud providers has no manual
      refresh — Destin upgraded his ChatGPT plan and the new models didn't show up until he
      thought to sign out and back in. A way for a plan change to be picked up without that
      workaround. (OpenRouter's card re-checks its key every time the page opens since
      youcoded#533.)
      `settings` `desktop` `confirmed` `checked 2026-09-18`

- [ ] Main-chat thinking bubble flickers — disappears and reappears with no visible tokens — during
      a very slow native stream (Destin, 2026-08-16, OpenRouter qwen3.8-27b streaming at ~6
      tokens/s; not specialist-related). Needs a slow provider to reproduce
      `chat` `desktop` `needs-verify` `checked 2026-08-16` `needs-repro`

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

- [ ] Every cloud model gets frontier-strength treatment (full tool presentation, parallel calls),
      so a small hosted model chokes the same way a small local one does; and an unknown local
      model is sized by its context window, a poor stand-in for capability. Capability and context
      budget want to be two separate axes
      `desktop` `parked` `checked 2026-09-01`

- [ ] **v1.3.1 release blocker.** The one object that runs a native conversation is 4,756 lines
      because it also orchestrates the helper agents (specialists), which already have their own
      home, and hosts the shell sessions. Wanted: the specialist block and the shells moved out
      along the seam the audit names, with the registry, lifecycle and reserve/bind/release kept
      on one object — simplification phase 5, D4. Nothing changes on screen. On hold since
      2026-09-18 (Destin): resumes after the native-session-host test split has merged and
      phase 4 is done, since phase 4 moves the runtime this touches
      `desktop` `blocked` `checked 2026-09-18` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] If a conversation moves to another device while it is being summarised to save space, the
      move does not wait for the summary to finish, and a summary cut off this way reports
      "interrupted" as if the user had pressed Stop (found 2026-09-23)
      `desktop` `confirmed` `checked 2026-09-23`

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
      `marketplace-screen` `desktop` `needs-verify` `checked 2026-09-05` `v1.3.1`

- [ ] The assistant's standing instructions grew about five times on 2026-09-05 (youcoded #423) and
      what that did to a small model is still unknown. Measured twice on 2026-09-05 at one run per
      arm and both runs were inconclusive — the same build scored 2-3 points apart on the judged
      items across runs, which is the size of the effect. Needs `--repeats` (the evaluator now warns
      when a comparison plan lacks them). Still unmeasured either way: the COMPACT prompt a small
      LOCAL model gets, which no OpenRouter arm exercises, and whether "keep going until it's done"
      makes a small model loop more
      `desktop` `needs-verify` `checked 2026-09-05` → docs/archive/investigations/2026-09-04-native-prompt-vs-competitors.md

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
- [ ] In Auto-edit, a hired specialist runs any shell command that isn't on the always-ask list
      with no prompt, although the main assistant itself would have to ask first — the launch
      "envelope" (`envelopeGranted: true`, `native-session-host.ts` buildSpecialistSession →
      `child-permissions.ts` step 6/7) turns every parent "ask" into "allow", and in Auto-edit
      no hire card is shown for built-in specialists. Direction discussed 2026-09-16: a helper
      asks whenever the main assistant would (drop the envelope; always-ask commands unchanged),
      optionally a "let it work without asking" choice on the hire card later. Unblocked since
      youcoded#489 (helper requests show at the bottom of the chat and wait with no timeout);
      Destin chose to leave it for now. Cost: more helper prompts, most in Ask first
      `desktop` `decision` `checked 2026-09-16`

- [ ] After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later
      command that looks covered still raises the permission card with no reason — it reads
      as the app forgetting the approval. Re-checked 2026-09-23: still true — the Always-allow menu now states its limits up front, but the card raised later still gives no reason
      `tool-cards` `desktop` `confirmed` `checked 2026-09-23` `v1.3.1` → docs/active/investigations/2026-09-01-permission-near-miss-silent.md

- [ ] Sessions on local/OpenRouter models have no "Skip Permissions" — the toggle is hidden on
      create and resume, and the permission chip stops at Full Auto
      `status-bar` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-native-no-bypass-mode.md

- [ ] Sandboxing vs. a "scratch workspace" (run risky sessions on a copy, show a diff to keep or
      discard) — pick one as its own design pass before any sandbox work; the existing write-up
      argues against OS sandboxing as a cross-platform promise. 2026-09-23: the new command
      checks (youcoded#562) catch the deletes and secret reads a model normally writes, but some
      shapes still run with no card, and only a sandbox closes them:
      - deletes: `find ~ -mindepth 1 -delete`, `echo ~ | xargs rm -rf`, `$(which rm)`,
        `git clean -fdx ~`, brace expansion like `rm -rf ~/{*,.*}`, and `~root`
      - secret reads: `ls -a | xargs cat`, paths built at run time, and script files
      - login files not on the file tools' secret list: `~/.npmrc`, `~/.pypirc`,
        `~/.docker/config.json`, `/etc/shadow`, a bare `id_rsa`, and `.ENV` on case-insensitive
        filesystems
      `desktop` `parked` `checked 2026-09-23` `security` → docs/active/investigations/2026-08-09-native-skip-permissions.md

## cost
- [ ] Cloud model context management and cache/token efficiency improvements — one item so the
      fixes below are specced together. Combined 2026-09-17 from three earlier entries (each kept
      below with its filing date) plus gaps found the same day comparing the app with Claude
      Code, Hermes Agent and Pi. Native compaction shipped 2026-09-23 (youcoded#559;
      docs/archive/specs/2026-09-22-native-compaction-design.md): near-limit triggering, one
      durable handoff, bounded recent context, overflow retry, restore on reopen. It closed the
      compaction sub-items that were listed here; the remaining ones below are still open. Competitor detail for the cache half:
      docs/active/investigations/2026-09-09-cache-efficiency-competitor-survey.md
      - Cache efficiency (filed 2026-09-10) — cloud and local sessions leave cache hits on the
        table, especially after reopening a conversation: OpenRouter turns can drift between
        endpoints, and both OpenRouter and ChatGPT-plan sessions can resend a changed opening
        prompt after restart instead of keeping the longest reusable prefix. Local models
        re-read the whole conversation every specialist turn, and long local sessions lose
        their cache to trimming (the ~50% "Reuse" reading on DeepSeek is NOT a bug —
        measurement artifact, documented). Improve resumed cloud-session affinity and prefix
        stability, then measure the first post-resume request rather than trusting historical
        totals. The idle-shutdown half is answered: turning on "Keep loaded" for a model stops
        both the per-model auto-sleep and the whole-engine idle shutdown, so that model's cache
        survives the gap between messages. Shipped so far: the ChatGPT-only diagnostics and
        faithful continuation (youcoded#461, 2026-09-09); six of the eight remaining breakers
        plus the backend half of the seventh (youcoded#464, 2026-09-10) — Anthropic caching
        switched on and OpenRouter sessions pinned, compaction firing before the trimmer on
        every window, pruning committed only on a prune decision, the summary reusing the
        conversation's warm prefix and reporting its cost, an `expectedRebuild` flag on every
        turn, llama.cpp's reuse count recorded per step, and the Task tool pinned
        byte-identical across catalog reloads. The ChatGPT summary key was dropped on purpose
        (the summary shares the chat's key now). Left: the Reuse chip's DISPLAY of expected vs
        surprise misses (four layouts in the survey, a deck for Destin), and a measurement pass
        in a dev instance — nothing reads the recorded local reuse count yet, and whether
        OpenRouter honours the top-level cache field and the session pin is asserted only
        against a stubbed network. 2026-09-23: the ChatGPT-plan measurement pass is done
        (live rig, docs/active/investigations/2026-09-23-chatgpt-cache-affinity.md): follow-up
        replies missed the cache a third of the time because one routing label was missing
        (fix on a branch, 13/20 → 18/20); with it, restart + resume and compaction kept the
        cache on every request. The date/git snapshot now sits last in the opening prompt so
        conversations in one folder share the rest (branch). OpenRouter and local remain
        unmeasured; llama.cpp's chunk reuse is unsupported by every offered local model
      - (2026-09-23) Fixed and removed from this list: the context chip keeping the old model's
        window after a model swap or a resume (youcoded#562)
      - (2026-09-17) Nothing is restored after compaction; Claude Code re-reads the files the
        assistant was recently working in
      - (2026-09-17) Tool output caps are fixed numbers (Read 100k characters, the others 30k)
        rather than a share of the model's window. The narrower Bash-output item under tools
        stays separate
      `desktop` `confirmed` `checked 2026-09-17` → docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md

- [ ] The per-reply length cap sent to cloud models (fixed 2026-09-05 at a flat 16,000 tokens, so
      OpenRouter stops reserving a frontier model's full 65k+ advertised max against the account
      balance on every message) should become a user-facing setting instead of a hardcoded
      number — some users may want shorter replies to stretch a small credit balance further,
      others may want a higher ceiling for very long single replies
      `settings/defaults` `desktop` `confirmed` `checked 2026-09-05`

## specialists
- [ ] Helpers start from scratch and pay full price for their whole opening every time the
      assistant hands off work, even though the main conversation's opening is already stored by
      the provider. Investigate letting a helper start from the main conversation's stored opening
      (Claude Code "forks" helpers this way); likely to be dropped — it changes what a helper sees,
      and on ChatGPT a helper can still miss the parent's copy
      `desktop` `needs-verify` `checked 2026-09-23` `performance` → docs/active/investigations/2026-09-23-chatgpt-cache-affinity.md

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
- [ ] Project skills & tools controls are built and accepted but NOT merged (draft PRs youcoded#571 and
      youcoded-dev#203, 2026-09-24): each project chooses
      which skills, plugins and tool connections the assistant uses on its own; new Marketplace
      downloads start off and open "choose your projects"; drawer chips show Automatic / Manual
      use / Unavailable. Destin wants to review every new screen himself before refinements and
      merge (2026-09-24: "i think i still want to review this ui further before we finalize").
      Start at docs/active/handoffs/2026-09-23-project-plugin-controls-START-HERE.md
      `desktop` `in-flight` `checked 2026-09-24`

- [ ] Your Assistant's four built-in plugins should show always-on, dimmed switches that can't be
      turned off, with a hover/focus explanation (approved design, deferred 2026-09-24 until the
      Your Assistant project exists; the project skills & tools controls ship for ordinary
      projects first)
      `projects` `desktop` `blocked` `checked 2026-09-24`

- [ ] MCP servers can only be set up by hand-editing a config file on disk — there is no
      settings screen to add, edit or remove one, and servers Claude Code already knows about
      stay invisible to the app's own agent (desktop; deferred from phase 1, 2026-08-05; still
      unbuilt 2026-09-01)
      `settings` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-native-mcp-phase-2.md

- [ ] **v1.3.1 release blocker — native-only users need a YouCoded-owned skills home.** Today the
      only project-skill convention is Claude Code's `.claude/skills/`, so a person using only
      YouCoded has no obvious place to put a personal or project workflow. Make `~/.youcoded/`
      and a project-owned `.youcoded/` location the native source of truth; treat `.claude/skills/`
      as optional import/export compatibility, never a prerequisite. The existing 2026-08-06 plan
      is Claude Code parity only and must be superseded or expanded before implementation.
      `all` `blocked` `checked 2026-09-05` `v1.3.1`

- [ ] Pasting a path like `/README.md` or `/My Files/notes.md` into the chat still gets eaten as a
      slash command and the text vanishes; the common `/home/…` shape was fixed 2026-08-10. Destin
      deprioritized the leftovers the same day
      `input-bar` `desktop` `parked` `checked 2026-08-10`
