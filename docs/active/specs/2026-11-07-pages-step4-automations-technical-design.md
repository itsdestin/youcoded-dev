---
status: draft
---
# Pages step 4 — automations: technical design

**Status 2026-11-08: draft, not yet reviewed.** Rewritten to match Destin's answers on the build-plan
decks; the first version (no saved Claude runs, one owning page, two jobs at a time, system
notifications) is superseded. `plan-c` answered 2026-11-08 (kept apart: clear; three places: clear;
two "not listed" rows kept; Rules → "Advanced settings" fold cards; the permission list's origin
not yet thought through). `plan-d`/`plan-f` answered 2026-11-08 (the fresh-reviewer popup redesign was dropped, "it kinda
sucked"; practice runs on copies). Open: deck `pages-finish-step4-plan-g` (commands).
Do not build from this until that deck is answered and one design-review round has run.

Sources, in order (later wins): `pages-finish-step4.questions` → `step4.review` → `step4b.review` →
`step4c.review` (screens approved) → `step4-plan.questions` → `step4-plan-b.review` →
`step4-plan-c.review` → `step4-plan-d.review` → `step4-plan-e.review` (skipped: no before pictures) → `step4-plan-f.review` → `step4-plan-g.questions`, all in `docs/active/design/2026-10-24-pages-finish/`. The step 4 contract
(`pages-finish-step4.contract.superseded.json`) is dropped (Destin, 2026-11-07: contracts don't
help him); the decks are the record. Paths are `youcoded/desktop/src/` unless noted.

## What the person gets

Automations that run on a schedule, from a page button, or when a page reports something happened.
Each run is a conversation nobody sees open, kept under its job (last 50). When it wants to do
something set to Asks first it waits or skips as the job says, and the orange dots on the Pages
button, the Automations row and each linked page show it. Paid models stop at the job's monthly
limit; subscription models show tokens used. No system notifications in this step.

## Decisions (with their deck answer)

1. **Runs never become chats.** A run does not go through `SessionManager` or the
   `ipc-handlers.ts` `startSession` closure, so it never emits `SESSION_CREATED` and never reaches
   the strip, phone list, phone restore, welcome-back, the namer, conversation feeders or sync
   (the nine consumers surveyed 2026-11-07). Same structural trick as specialist children
   (`harness/native-session-host.ts:3764`, not `wire()`d).
2. **Two lanes, one behaviour** (`step4b#B-sub`, plan `S-reused`).
   - **Native lane** (ChatGPT, OpenRouter, any native provider): a `HarnessSession` built with
     `providerRegistry.languageModel(binding)`; the job's rules replace a chat's rule layers.
   - **Claude lane** (`plan-b#E-claude` → "saved, kept apart"): the user's own unchanged Claude Code,
     `claude -p --output-format stream-json --session-id <uuid> --restricted --strict-mcp-config
     --settings <run settings file> --mcp-config <run mcp file> --tools <job tools>
     --add-dir <job folders>`, cwd = `~/.youcoded/automations/work/<jobId>/`.
     - Saved like any Claude Code session, so a paused run continues with `--resume <id>` after a
       restart (this is why "saved" won).
     - `--restricted` ignores the user's and project's settings files: chat "Always allow" rules
       never reach a job and nothing a job is allowed reaches a chat (`plan-c#C-apart`, pending).
     - The run settings file holds the job's allow/deny rules and YouCoded's permission hook, so
       Asks first reaches the app through the same hook relay Claude chats use; the relay routes a
       run's session id to the runner, never to a chat card.
     - YouCoded's chat list, Resume, reconciler and chat search skip that work folder (one filter on
       the folder prefix, pinned by a test). Old run files go with the last-50 rule.
     - Rules (`plan-b#E-tos`, understood): the user signs in inside Claude Code; YouCoded never
       touches the login, never modifies the binary, never resells usage. Runs count toward the
       plan's normal limits. Grey area noted to Destin: general terms discourage automated use.
     - Every flag is checked against `claude --help` at build time and recorded in
       `youcoded/docs/cc-dependencies.md`; a missing flag fails the run with a clear reason, never
       runs unprotected (`plan#Q-unprotected` yes).
3. **Permissions** — each added permission compiles to one exact rule for that job only
   (`plan-c#C-perm`, pending): a folder → read/write inside it; one command → that exact command;
   one website → that host; this page → that page's data tools. A tool the job may never use is
   removed from the model's tool list, not just refused (`plan#S-allowed` note).
   - Always allowed → runs. Asks first → the first Advanced setting: wait (up to a time, then skip
     that step / stop / do this instead) or skip. Not listed → "Other websites" / "Other commands
     and files", two rows kept (`plan-c#Q-unlisted-one` → two), each Never or Asks first.
   - **The run is told its rules** (`plan-c#Q-unlisted-one` note: "make sure whatever the user
     selects is accurately conveyed to the model"): the run's opening instructions list every
     permission and its mode and say, per "not listed" row, either "don't try; it will be refused"
     (Never) or "you may try; the run waits for the person" (Asks first). Pinned by a test on the
     generated text for each combination.
   - **Where the list comes from** (`plan-d`): the assistant drafts it when the automation is made
     and the check popup shows it (`D-source`: the Add menu lists kinds — folder, website, command,
     this page, "Describe it…" — only for adding one by hand). Decided: "Allow from now on" on a
     run's ask adds that exact permission (`Q-fromnow`); "Describe it…" in the Add menu, the
     assistant writes one exact permission and shows it back (`Q-describe` both); a script
     permission records the file's contents and asks again after it changes (`Q-scripts`).
   - **Practice runs** (`plan-d#Q-tryrun` yes; `plan-f#Q-practice` → copies): practice runs work on
     copies of the job's folders and page data; emails, posts and forms are held back and shown as
     "would send"; websites are read live; a website click that may buy or post asks during
     practice. Each ends with a report (read / would change / would send / permissions needed, each
     with Add). Users see: "Practice runs work on copies. Nothing real changes or gets sent."
   - **Commands** (`plan-d#Q-changing` "case-by-case"; `plan-f#Q-width` rejected the three wording
     widths as "contrived"): pending `plan-g`. Proposed: every command runs inside Claude Code's
     sandbox (the "fence") limited to the job's listed folders and websites; a command permission
     names a program, with an optional exact-only lock; reads fenced to listed folders; computers
     without the fence ask per command. Facts and limits: `sandboxing.md` (Mac/Linux/WSL2 only;
     Linux needs bubblewrap + socat; `failIfUnavailable`, `allowUnsandboxedCommands: false`; reads
     open by default; docker/ssh break). The native lane has no sandbox today (`shared/bash-risky-variants.ts`
     says its text checks are "a speed bump, not a sandbox"). Use cases:
     `docs/active/design/2026-10-24-pages-finish/step4-command-use-cases.md`.
   - **Answers carry a note** (`plan-b#N-answer`): `answer(jobId, allow, note?)`; Don't allow needs
     one. The note goes back to the run as the tool result's message, so it doesn't retry.
   - Service permissions (Gmail etc.) need step 5's sign-ins; until then the Add menu lists this
     page, your computer and the internet only.
4. **Links, not owners** (`plan#Q-pagejobs`, `plan#Q-deletepage`, `plan-b#N-links`): a job has
   `links: {kind: page|project, id, name}[]`; any linked page may run it from a button and shows its
   dot. Deleting a page asks per linked automation: Keep (link removed, it carries on) or Delete
   (`plan-b#E-deletepage`).
5. **Store** — `main/automations/automation-store.ts`, `~/.youcoded/automations/`: `jobs.json`
   (atomic write, version field, stable job ids for the mesh later), `runs/<jobId>/<runId>.json`
   (summary, outcome, dollars, tokens per model/harness, seconds) and the run's conversation
   (`.jsonl` native; Claude lane's own session file). Last 50 per job. `usage.json` per job / month /
   model+harness (`questions#Q-subscription` note).
6. **Schedule** — `main/automations/scheduler.ts`, a 30-second due check (pattern
   `DailyBackup.runIfDue`). Per job:
   - Missed while off (`plan#S-start` note): run once on wake / run at another time / run with other
     instructions / skip. Detected on launch, `powerMonitor` resume, and a tick that sees the clock
     jump (Android's backend has no powerMonitor). Several missed times → one run.
   - Due while still running (`plan#Q-overlap`): skip the new run / stop the old run / run both.
   - **No limit on runs at once** (`plan-b#E-parallel`).
   - Only while YouCoded is open.
7. **Starts:** schedule; page button (`youcoded.automations.run(id)` from the page kit, allowed for
   jobs linked to that page; the kit draws the spinner and dot, `step4.review#Q-button`); page event
   (`youcoded.automations.event(name, data)`). Service events ("an email arrives") wait for step 5.
8. **Money:** native lane adds each step's `costForUsage` (`harness/harness-session.ts:3270`) to the
   run and month and checks the limit before the next step (finish the step, then stop — a few cents
   over is possible and shown; `questions#Q-limit-hit`). Claude lane: subscription, tokens only.
   New jobs on a paid model start at $5 (`questions#Q-limit` note).
9. **Advanced settings** (`plan-c#C-rules`): the lower settings are fold-out cards, all closed,
   titled with what the job does now; open, one line on what it covers and each choice with a pro
   and a con. **New automation starts pre-filled** (`plan-b#E-prefill`): Wait for me (until its next run, then
   skip that step), missed → run once on wake, due while running → skip the new run, unlisted →
   Never, this device on.
10. **Devices** (`plan-b#Q-devices` → ride on the mesh): each job stores `devices: {id, name, runs}`
    and shows only this device until the mesh sync's "one list everywhere" step
    (`worktrees/sessions/mesh-sync-design`, spec `2026-11-06-youcoded-mesh-sync-design.md` §10)
    carries automations; the mesh's exactly-once run claims come later. Nothing syncs in step 4.
11. **No system notifications** (`plan-b#Q-notify-menu`: "all system notifications will be built
    together later … limited to the orange light"). The job keeps a `notify` field for that work;
    the details popup shows no Notifications card.
12. **Bridge:** `automations:list|runs|save|setEnabled|runNow|answer` + push `automations:changed`
    in `preload.ts`, `remote-shim.ts` and the IPC table; the `MOCK_ONLY` rows go away. Android gets
    it free (the same node backend).
13. **From a chat:** a `ProposeAutomation` tool (native, and on the app's MCP server for Claude
    chats) opens the approved check popup; nothing saves until Turn on.

## Not in step 4

Chains of jobs (card #74 plans); service events and service permissions (step 5); system
notifications (all built together later); syncing automations between devices (mesh); running
while YouCoded is closed.

## Still to settle before the build

- `plan-g` deck answers (what a command may reach).
- The "type which folder / website / command" step after Add a permission — not drawn; shown on the
  post-build deck.
- One design-review round against this document and the decks.
