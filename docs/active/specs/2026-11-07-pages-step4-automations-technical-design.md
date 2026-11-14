---
status: draft
---
# Pages step 4 — automations: technical design

**Status 2026-11-13: draft. Nothing here is built** — only the screens exist, in the workbench
against `renderer/dev/workbench/automations-mock.ts`. Every decision below is answered on a deck or
in chat. Do not build until the screens under "Still to settle" are drawn and approved and one
design-review round has run. Route (review deck `Q-route`): finish steps 4, 5 and 6, then ship once.
The 2026-11-08 "fence" proposal (deck `plan-g`, never submitted) is DROPPED: Destin called it
overcomplicated, and it made Claude, other models and Windows/phones behave differently, against
his "the underlying engine for any automation should be easily interchangeable".

Sources, in order (later wins): `pages-finish-step4.questions` → `step4.review` → `step4b.review` →
`step4c.review` (screens approved) → `step4-plan.questions` → `step4-plan-b.review` →
`step4-plan-c.review` → `step4-plan-d.review` → `step4-plan-e.review` (skipped: no before pictures) → `step4-plan-f.review` → `pages-finish-review.questions` (2026-11-10) → chat 2026-11-12 (commands, below) → `step4d.review` → `step4e.review` → `step4f.review` (screens approved 2026-11-12/13), all in `docs/active/design/2026-10-24-pages-finish/`. The step 4 contract
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
       never reach a job and nothing a job is allowed reaches a chat (`plan-c#C-apart` yes).
     - Permission checks are NOT free reuse (code read 2026-11-10): the hook relay drops asks from
       anything that is not a chat (`hook-relay.ts:237-255`), the relay scripts need two environment
       values only the chat terminal sets (`pty-worker.js:556`), and `--restricted` ignores the
       hooks in `~/.claude/settings.json`. New work: the run settings file carries a hook that
       sends every tool call to the runner, which decides with the same rule matching as the native
       lane. Verify at build time that `--restricted` honours hooks given through `--settings`
       (sandbox settings given that way were honoured in the 2026-11-10 tests).
     - YouCoded's chat list, Resume, reconciler and chat search skip that work folder (one filter on
       the folder prefix, pinned by a test). Old run files go with the last-50 rule.
     - Rules (`plan-b#E-tos`, understood): the user signs in inside Claude Code; YouCoded never
       touches the login, never modifies the binary, never resells usage. Runs count toward the
       plan's normal limits. Grey area noted to Destin: general terms discourage automated use.
     - Every flag is checked against `claude --help` at build time and recorded in
       `youcoded/docs/cc-dependencies.md`; a missing flag fails the run with a clear reason, never
       runs unprotected (`plan#Q-unprotected` yes).
3. **Permissions** — each added permission compiles to one exact rule for that job only
   (`plan-c#C-perm`; how the list is built settled on `plan-d`, below): a folder → read/write inside it; one command → that exact command;
   one website → that host; this page → that page's data tools. (What "one command" means is the
   open Commands bullet below — the wording-based version was rejected on `plan-f`.) A tool the job may never use is
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
   - **Practice runs: after the first version** (review deck `Q-practice` → later). The earlier
     "works on copies" design (`plan-d#Q-tryrun`, `plan-f#Q-practice`) is kept for then, not built now.
   - **Commands** (`plan-d#Q-changing` "case-by-case"; `plan-f#Q-width` rejected three fixed widths
     as "contrived"; fence dropped; agreed in chat 2026-11-12): one kind of command permission,
     written per job. The assistant writes each as narrow or wide as that job needs and shows it in
     plain words ("Run whisper on files in Recordings"); the person can edit it; each is Always
     allowed or Asks first. Matching is the app's existing rule engine
     (`harness/permission-engine.ts`: exact, pattern, folder), run by the app for BOTH lanes, so a
     job behaves the same on every model and device. No fence, no width menu. A command that
     matches nothing falls to "Other commands and files" (Never / Asks first). Known limit, told to
     Destin: an allowed script can do whatever is written inside it; the guard is the
     ask-again-when-the-script-changes rule (`plan-d#Q-scripts`). Use cases:
     `docs/active/design/2026-10-24-pages-finish/step4-command-use-cases.md`.
   - **Adding one by hand** (`step4d`/`step4e`, approved): the Add menu (as wide as its button) lists
     Read / Change its information, See / Change the files in a folder…, Run a command…, Visit a
     website…, Describe it…. Each opens ONE control in the button's place with × on its label line:
     a folder uses Page settings' `FolderField` (choosing adds at once), a command or website is one
     box with Add inside, Describe it… is one box with Write it inside and shows the result as a
     permission line with Edit and Add. A hand-typed command is listed as "Run a command" with the
     command under it; only assistant-written permissions get a plain-words name. The `*` hint goes
     in the (i) by the title.
   - **Answers carry a note** (`plan-b#N-answer`): `answer(jobId, allow, note?)`; Don't allow needs
     one. The note goes back to the run as the tool result's message, so it doesn't retry.
   - Service permissions (Gmail etc.) need step 5's sign-ins; until then the Add menu lists this
     page, your computer and the internet only.
4. **Links, not owners** (`plan#Q-pagejobs`, `plan#Q-deletepage`, `plan-b#N-links`): a job has
   `links: {kind: page|project, id, name}[]`; any linked page may run it from a button and shows its
   dot. Deleting a page asks per linked automation: Keep (link removed, it carries on) or Delete
   (`plan-b#E-deletepage`). Deleting a page also removes its saved versions and its chats, behind a
   danger confirmation that says so (review deck `Q-deletepage`). An automation has a Delete button
   (review deck `S-delete`; screen `step4d#D-delete`). **Delete page is a button at the foot of Page
   settings** (`step4d#Q-deletepage`; screens `step4f#F-button`, `#F-warning`, design stage
   `PageSettings.tsx` `DeletePage`, `pages.deletePage(id, deleteAutomations)` in `mock-only.ts`): the
   red notice lists each linked automation with Keep / Delete — Delete by default when only this
   page uses it, Keep when another page does. The page's assistant and the page-builder skill send
   the person to that button instead of deleting. Main must delete page folder, versions, chat
   records, approvals/folders/open sites and unlink or delete the automations as one step.
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
   - Only while YouCoded is open. A run cut off by closing the app picks up where it stopped on
     the next open (review deck `Q-closed`).
7. **Starts:** schedule; page button (`youcoded.automations.run(id)` from the page kit, allowed for
   jobs linked to that page; the kit draws the spinner and dot, `step4.review#Q-button`); page event
   (`youcoded.automations.event(name, data)`). Service events ("an email arrives") wait for step 5.
8. **Money:** native lane adds each step's `costForUsage` (`harness/harness-session.ts:3270`) to the
   run and month and checks the limit before the next step (finish the step, then stop — a few cents
   over is possible and shown; `questions#Q-limit-hit`). Claude lane: subscription, tokens only.
   New jobs on a paid model start at $5 (`questions#Q-limit` note).
   - **Runs-per-day cap** (review deck `Q-cap`, with his note "only … where it makes sense. a job
     set to only run every 12h doesnt need a runs per day cap"): offered only on jobs a page
     button or page event can start; a schedule-only job shows no cap. Screen (`step4e#E-cap`): its
     own "Runs per day" group using `TypeableSelect` (No limit, 5, 10, 20, 50, 100, or typed). Per
     automation only; no page-level limit (`step4d#Q-pagelimit`).
   - **Every model** (review deck `Q-models`): any model the app can chat with can run a job.
     `model` must be a real model binding, not a label (today's mock stores a label, and treats
     ChatGPT as a subscription at `AutomationDetails.tsx:103`).
9. **Advanced settings** (`plan-c#C-rules`): the lower settings are fold-out cards, all closed,
   titled with what the job does now; open, one line on what it covers and each choice with a pro
   and a con. **New automation starts pre-filled** (`plan-b#E-prefill`): Wait for me (until its next run, then
   skip that step), missed → run once on wake, due while running → skip the new run, unlisted →
   Never, this device on.
10. **Devices** (`plan-b#Q-devices` → ride on the mesh): each job stores `devices: {id, name, runs}`
    and shows only this device until the mesh sync's "one list everywhere" step
    (`worktrees/sessions/mesh-sync-design`, spec `2026-11-06-youcoded-mesh-sync-design.md` §10)
    carries automations; the mesh's exactly-once run claims come later. Nothing syncs in step 4
    (`step4d#Q-devices`: wait for syncing).
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

- Draw: what a page's Run button and the popup's Run now say once the daily limit is reached.
- Settled 2026-11-12/13 (`step4d`): "Run with other instructions" is enough for a missed run
  (`Q-rundiff`); limits are per automation only (`Q-pagelimit`); other devices wait for syncing
  (`Q-devices`).
- The context-free UX tester has not run on these screens (skipped earlier at Destin's word);
  offer it before the build.
- One design-review round against this document and the decks.
