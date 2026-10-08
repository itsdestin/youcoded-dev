# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist. Not here: a chat you already had (chat-data); getting a model onto disk
(local-models); Claude Code is doing the work (claude-code-integration).

## sessions
- [ ] **v1.3.1 release blocker.** The "No folder" choice on the new-session form (shipped
      2026-09-11) was never tested or thought through (Destin, 2026-09-19: "we didn't really
      like think that through… I didn't test it at all"). Test that it works, then turn it into
      an incognito mode; what incognito keeps and leaves out needs deciding. Goes with the "Your
      Assistant" item below
      `all` `needs-verify` `P1` `checked 2026-09-19` `v1.3.1`

- [ ] **v1.3.1 release blocker.** Every install should come with a built-in project, "Your
      Assistant" (name not final), in the Projects list and managed by YouCoded. Destin,
      2026-09-19: the assistant itself is a project — "the rules it follows and the ways it
      behaves and the things it knows about you… is something that you get to build and design
      and change your way. It'll work fine if you don't change anything." It is the home for
      miscellaneous requests and where big-picture preferences, memory about the user and global
      instruction files live. The first-run tour points at it. Later it is the main assistant
      that takes a phone request and hands it to the right project (see the Mesh item below).
      Replaces the 2026-09-10 "Home folder" idea
      `projects` `all` `decision` `P1` `checked 2026-09-19` `v1.3.1`

- [ ] **v1.3.1 release blocker.** Native Runtime Parity Program — everything that still separates
      a native session from a Claude Code one (context truncation notice, M6 onward, cwd
      contract, MCP phase 2, M7–M9). The single doc is §5.1 of the linked vision doc
      `all` `in-flight` `P1` `checked 2026-09-01` `v1.3.1` → docs/active/specs/2026-09-01-agent-platform-vision-and-state.md

- [ ] **v1.3.1 release blocker.** The one object that runs a native conversation is 4,756 lines
      because it also runs the helper agents (specialists), which have their own home, and hosts
      the shell sessions. Wanted: the helper block and the shells moved out along the seam the
      audit names, with registry, lifecycle and reserve/bind/release kept on one object (phase 5,
      D4). Nothing changes on screen. On hold since 2026-09-18 (Destin) until the session-host
      test split has merged and phase 4 of the one-core work is done
      `desktop` `blocked` `P1` `checked 2026-09-18` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] Agents & Automations — a third top-level view beside Chat and Projects where work runs on a
      schedule or trigger without the user (cron / "run now", budgets as hard stops, an inbox of
      runs). Verified 2026-09-01: no scheduling code exists in either app. Blocked on Destin's
      "Assistants made of Duties" ruling, cost accounting and the helpers' durable journal
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#12): postponed — "but significant for 1.3.2/1.3.3"
      `all` `blocked` `P2` `checked 2026-09-01` `v1.3.2` → docs/active/specs/2026-09-01-agent-platform-vision-and-state.md

- [ ] Native chat: small faults and polish — 8 things.
      (a) The ChatGPT card in Assistant settings has no refresh; after a plan upgrade the new
      models only appeared after signing out and back in.
      (b) The main-chat thinking bubble flickers on and off during a very slow stream (seen at ~6
      tokens/s on OpenRouter; needs a slow provider to reproduce).
      (c) Editing a queued message that had files attached puts the raw file paths in the box and
      drops the attachments; the docked queue strip also vanishes on reload (report:
      docs/active/investigations/2026-09-01-queued-message-attachments-lost-on-edit.md).
      (d) Editing a queued message silently replaces text already in the box; decided: show
      Replace or Append only when the box is not empty.
      (e) A failed reply's red card says to send again but has no Try again button, and Stop is
      gone too; needs a decision (try again means re-sending).
      (f) Moving a conversation to another device mid-summary does not wait for it, and the cut-off
      summary reads "interrupted" as if you pressed Stop.
      (g) The exact request sent to the model each step is never kept, so a resumed session cannot
      reproduce a turn; checkpoints hold only a fingerprint.
      (h) Pasting a path like `/README.md` or `/My Files/notes.md` is still eaten as a slash
      command and the text vanishes (deprioritized by Destin 2026-08-10).
      `desktop` `confirmed` `P3` `checked 2026-08-10` `needs-repro`

- [ ] Parked ideas: native sessions and helpers — 13 things.
      (a) Cutting skills and rules down for small models is still tail-cut; the redesign has seven
      decisions and a deck, nothing answered (report:
      docs/active/investigations/2026-09-09-small-model-context-truncation.md).
      (b) Project startup reminders and before/after-action checks should work in native chats,
      with approval before scripts run and clear failure reports.
      (c) A file's instructions arrive only after the first edit has happened; the assistant
      should see them and reconsider first.
      (d) The assistant should know which tools, instructions and checks are active in this chat
      (b–d report: docs/active/investigations/2026-09-05-native-guidance-followups.md).
      (e) OpenRouter's remaining credit is not shown, and a refused key gives no warning dot on
      the Settings gear.
      (f) Goal layer: checkable goals and a goal queue; deliberately last in the super-agent
      program.
      (g) Context and knowledge as product surfaces: a richer context popup, one-tap "remember
      this?", work state as an object, shareable knowledge packs, provenance and revocation.
      (h) Third-party agent CLIs (Codex first) as session providers; a deliberate what-if.
      (i) Custom harness builder: pick a preset, edit prompt, toggle tools, save a shareable
      manifest; no design yet.
      (j) The native agent has no memory of past chats; wanted: chat search as a tool.
      (k) Cloud models all get frontier-strength treatment, so small hosted models choke; capability
      and context budget should be separate.
      (l) "Assistants made of Duties": the unit of organisation for Agents & Automations; captured,
      not designed.
      (m) Six helper ideas: promote a helper to background mid-run, view a helper's transcript, a
      project-level helpers folder, per-helper cost on its card, a strict approval toggle, a live
      roster in Settings.
      `all` `parked` `P3` `checked 2026-08-16` `security`

- [ ] Parked ideas: YouCoded Mesh and Cloud — 2 things (v1.4, not a release promise).
      (a) "YouCoded Mesh" (Destin, 2026-09-08) picks a suitable device of yours for remote requests
      and scheduled duties without you managing which one; needs suitability, permissions and no
      duplicate runs designed.
      (b) "YouCoded Cloud" runs an automation when none of your devices is online, as an optional,
      possibly paid fallback after Mesh; needs consent, spending limits and privacy designed.
      `all` `parked` `P3` `checked 2026-09-08` `v1.4`

## tools
- [ ] **v1.3.1 release blocker.** The assistant cannot search the WeCoded marketplace, so when it
      lacks a capability it reaches for a script or outside service instead of a plugin that
      already does the job. Wanted: a tool to search plugins and integrations, so "check what we
      already have" comes before "build something new". Destin, 2026-09-05: a 1.3 blocker, partner
      to the "assume you can do it, find a way" prompt rule
      `marketplace-screen` `desktop` `needs-verify` `P1` `checked 2026-09-05` `v1.3.1`

- [ ] Tools and permissions: small faults and checks — 6 things.
      (a) The assistant's standing instructions grew about five times on 2026-09-05; the effect on
      a small model is unmeasured (two runs inconclusive); needs repeated runs, and the compact
      local prompt and "keep going" looping are untested.
      (b) After the shell has moved folders, Read and Bash can open two different files for one
      relative name; Destin to decide whether to reject relative paths (needs more investigation;
      report: docs/active/investigations/2026-09-01-multi-model-cwd-contract.md).
      (c) Small local models loop on Edit "old_string not found" over smart quotes, trailing
      spaces and Unicode dashes; wanted: one normalisation pass, after measuring.
      (d) Nobody has read a PDF with the native agent in an installed build; the reader's extra
      files are unverified outside a dev instance.
      (e) Local and OpenRouter sessions have no "Skip Permissions"; the toggle is hidden and the
      chip stops at Full Auto (report: docs/active/investigations/2026-09-01-native-no-bypass-mode.md).
      (f) Pictures too big for the model (2026-10-07): shrinking a very tall one briefly takes about
      0.6–1.2 GB of memory; the shrunk copies are never cleaned up — wanted: a sweep of the
      `image-cache` folder by size or age (each copy up to 10 MB, one per provider switch); after
      switching to a stricter model a shrunk picture becomes a note instead of being shrunk again;
      after sending a huge picture the desktop shows nothing for up to ~30 s — wanted: a "preparing"
      state; ChatGPT's exact rejection was never captured, so its wording is matched from a
      screenshot, and OpenAI's longest-edge limit (8192 px) is a guess — wanted: capture a real
      rejection for each; no host-level test covers the checkpoint's `image-oversized` fallback —
      wanted: seed a pre-gate history on a lax profile, publish, reopen with the real profile; a
      prepared picture the provider still rejects ends up with both a "downscaled" note and an
      "oversized" note in one message.
      `desktop` `confirmed` `P3` `checked 2026-08-12`

- [ ] Parked ideas: tools, secrets and sandboxing — 9 things.
      (a) The assistant cannot explain the app it lives in (Destin, 2026-09-10): it guesses where
      settings are; wanted a maintained description or info-desk tool.
      (b) Background Bash follow-ups: typing into a running command, a "Running commands" list,
      "tell me when the log says ready".
      (c) Bash shows the model only ~4,000 characters of output, so long results cost a second
      call; the "prefer Read/Grep" wording should switch off in full-auto; decide by measuring.
      (d) WebFetch's "page too thin" thresholds were never measured against real pages.
      (e) Glob refuses nested braces like `{a,{b,c}}`; revisit only if a real use shows up.
      (f) After Edit/Write in the Coder preset, append syntax/type errors to the result.
      (g) The assistant should ask for an API key or `.env` value in a secure box, not saved in chat
      or shown to it (Destin, 2026-09-25).
      (h) Commands that ask for a GitHub or SSH password mid-run fail from chat; deferred because a
      command could trick you into typing the wrong password.
      (i) Sandbox or "scratch workspace" (run risky sessions on a copy, show a diff): some delete
      and secret-read shapes still run with no card and only a sandbox closes them (report:
      docs/active/investigations/2026-08-09-native-skip-permissions.md).
      `all` `parked` `P3` `checked 2026-09-01` `security`

## permissions
- [ ] **v1.3.1 release blocker.** After picking a wide "Always allow" (any `npm run`, pushing to
      one branch), a later command that looks covered still raises the permission card with no
      reason — it reads as the app forgetting the approval. Re-checked 2026-09-23: the menu now
      states its limits up front, but the card raised later still gives no reason
      `tool-cards` `desktop` `confirmed` `P1` `checked 2026-09-23` `v1.3.1` → docs/active/investigations/2026-09-01-permission-near-miss-silent.md

## cost
- [ ] Cloud model context management and cache/token efficiency — one item so the fixes are
      specced together. Native compaction shipped 2026-09-23 (youcoded#559) and closed its
      sub-items. Still open:
      (a) Cache efficiency: resumed cloud sessions drift between OpenRouter endpoints or resend a
      changed opening prompt; local models re-read the whole conversation each helper turn. Most
      breakers shipped (youcoded#461, #464); left are the Reuse chip's display of expected versus
      surprise misses (deck for Destin) and a measurement pass. ChatGPT is measured (a missing
      routing label cost a third of follow-ups; fix on a branch, 13/20 → 18/20); OpenRouter and
      local are unmeasured.
      (b) Nothing is restored after compaction; Claude Code re-reads recently used files.
      (c) Tool output caps are fixed numbers (Read 100k characters, others 30k), not a share of
      the model's window.
      `desktop` `confirmed` `P2` `checked 2026-09-17` → docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md

- [ ] Settings the user cannot change yet — 3 things.
      (a) The per-reply length cap sent to cloud models is a flat 16,000 tokens; make it a setting
      so users can stretch a small credit balance or allow very long replies.
      (b) Audit every place YouCoded recommends or auto-chooses a model, then build one maintained
      recommendation system so choices do not go stale.
      (c) Specialist limits (how many helpers at once, how often the assistant may nudge a running
      one) are fixed; one transcript showed one helper nudged 14 times.
      `settings` `all` `confirmed` `P3` `checked 2026-09-05`

## specialists
- [ ] Helpers: permissions, reports and cost — 4 things.
      (a) In Auto-edit, a hired helper runs any shell command not on the always-ask list with no
      prompt, though the main assistant would ask; direction (2026-09-16): helpers ask whenever
      the main assistant would, at the cost of more prompts. Destin chose to leave it for now.
      (b) A finished helper's report should be able to arrive quietly, read with your next message,
      unless the assistant asked to be woken; needs a default decided.
      (c) Helpers pay full price for their opening each time; investigate starting from the main
      conversation's stored opening (likely to be dropped).
      (d) The amber "Needs you" label in the helpers popup is nearly unreadable on the three pale
      themes (1.52:1, 1.41:1, 1.19:1 against 4.5:1).
      `desktop` `confirmed` `P3` `checked 2026-09-05` `performance`

- [ ] After the assistant uses 30 specialists in one session, let the user approve just the next
      helper or waive the limit for that session instead of refusing every additional helper
      `tool-cards` `desktop` `in-flight` `P3` `checked 2026-09-15` → docs/active/specs/2026-09-15-specialist-budget-permission-design.md

- [ ] Helper (specialist) transcripts pile up in the sessions folder forever — no way to delete
      one, and closing the parent conversation leaves its helpers' files behind. Blocked on a
      general delete-conversation feature, which does not exist yet
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#17): postponed with the delete-a-conversation feature it waits on; no longer a 1.3.1 item
      `desktop` `blocked` `P2` `checked 2026-09-01` → docs/active/investigations/2026-09-01-specialist-child-transcript-gc.md

- [ ] Specialists stage two — plans: the model proposes a multi-step fan-out as data, the user
      approves a card, the executor journals and resumes it. Approved in the 2026-08-11 spec. The
      three required probes ran 2026-09-04 (four helpers at once is the ceiling; the first fan-out
      repays most of its prompt cost; plan authoring works from the 9B model class up). Gated on
      Destin's stage-two decisions. The Claude Code bridge (`youcoded agent run`) is unbuilt
      `desktop` `decision` `P2` `checked 2026-09-04`

## skills-mcp
- [ ] Per-project skills and tools: each project chooses which skills, plugins and tool connections
      the assistant uses there, with a risk warning before anything that reaches an outside service.
      Built and passing its checks as draft youcoded#571 since 2026-09-24; waiting on Destin's review of
      every new screen, and it must be brought up to date with the 2026-10-04 one-core merge first.
      Two behaviour changes to say in release notes: new Marketplace downloads start switched off until
      projects are chosen, and conversations outside any project get no automatic skills or tools.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#15): do next
      `projects` `desktop` `in-flight` `P1` `checked 2026-10-05`

- [ ] MCP servers can only be set up by hand-editing a config file — no settings screen to add,
      edit or remove one, and servers Claude Code already knows stay invisible to the app's own
      agent (deferred from phase 1, 2026-08-05; still unbuilt 2026-09-01)
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#10): postponed until after 1.3.1
      `settings` `desktop` `confirmed` `P2` `checked 2026-09-01` → docs/active/investigations/2026-09-01-native-mcp-phase-2.md

- [ ] **v1.3.1 release blocker — native-only users need a YouCoded-owned skills home.** The only
      project-skill convention today is Claude Code's `.claude/skills/`, so someone using only
      YouCoded has no obvious place for a personal or project workflow. Make `~/.youcoded/` and a
      project-owned `.youcoded/` the native source of truth, with `.claude/skills/` as optional
      import/export. The 2026-08-06 plan covers Claude Code parity only and must be expanded first
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#8): do next — "we can do with 15, but this should be a top priority i think" (15 = per-project skills and tools, youcoded#571)
      `all` `blocked` `P1` `checked 2026-09-05` `v1.3.1`
