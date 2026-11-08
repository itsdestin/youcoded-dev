---
status: draft
---
# Pages step 4 — automations: technical design

Contract: `docs/active/design/2026-10-24-pages-finish/pages-finish-step4.contract.json` (27 rows).
Approved UI: rounds 2–3 (`pages-finish-step4b/c.review`), already built in the workbench against
`window.claude.automations` (`shared/automation-types.ts`, mock `renderer/dev/workbench/automations-mock.ts`).
This design is the real backend behind that bridge. Paths are `youcoded/desktop/src/` unless noted.

## What the person gets

Their automations actually run: on a schedule, from a page button, or when a page says something
happened. Each run is a conversation nobody sees open, kept as a read-only run; when it wants to do
something set to Asks first, it waits or skips as the job says, and a notification and the orange dots
tell them. Paid models stop at the job's monthly limit; subscription models show the tokens used.

## Decisions

1. **Runs never become chats — structurally, not by filters.** A run is not created through
   `SessionManager` or the `ipc-handlers.ts` `startSession` closure (`:607-898`), so it never emits
   `SESSION_CREATED` and never reaches the strip, phone list (`ipc/session.ts:221`), phone restore
   (`remote-server.ts:1129`), welcome-back, the namer, conversation feeders or sync. This mirrors how
   specialist children are kept out (`harness/native-session-host.ts:3764-3770`: not `wire()`d).
   The survey listed nine consumers; going around all of them beats adding a filter to each.
   - Cost: the runner owns its own small session loop per lane (below) instead of reusing the closure.
     No factory extraction from `ipc-handlers.ts` is needed for step 4.
2. **Two lanes behind one runner; the job never knows which.** (R16: "Any automation can run on
   Claude, ChatGPT or OpenRouter … with nothing else about the job changing.")
   - **Native lane** (OpenRouter, ChatGPT and any native provider): a `HarnessSession` built
     directly with `providerRegistry.languageModel(binding)` (`providers/provider-registry.ts:316`),
     the job's rules as its permission layer, `sessionKind: 'automation'` in its header.
   - **Claude lane** (Claude subscription): `claude -p --output-format stream-json --verbose
     --no-session-persistence --model <m> --allowedTools <allow-mode tools>
     --permission-prompt-tool mcp__youcoded-automations__ask`, cwd = the job's folder.
     `--no-session-persistence` keeps the run out of `~/.claude/projects`, so chat search
     (`chatsearch-index/transcript-reader.ts`) and the reconciler (`conversations/reconciler.ts:138`)
     never see it; the runner saves the stream itself as the run's conversation.
     Each flag is checked against the installed CLI's `--help` at build time and recorded in
     `youcoded/docs/cc-dependencies.md`; a missing flag fails the run with a specific error, never
     silently runs unprotected.
3. **One permission model, two enforcements.** A job's `tools` (`AutomationTool {mode allow|ask, exact}`)
   plus its two "anything not listed" settings compile to one rule list:
   - native: passed in as the session's preset-style rules (the `presetRules` input of `buildDecide`,
     `native-session-host.ts:2715`), with `DESTRUCTIVE_DENY_LIST` still on top. "Never" for unlisted
     = deny rule last.
   - Claude lane: allow-mode tools → `--allowedTools`; everything else reaches the permission prompt
     tool, which the runner answers from the same rule list (deny unlisted when set to Never; ask when
     Asks first).
   - **An ask** goes to the runner, never to a chat's permission card. `whenAsk: 'skip'` → denied with
     the message "Skipped: needs your OK", recorded on the run (`skipped`). `whenAsk: 'wait'` → the run
     pauses, the job gets `waiting {action, detail, asked, until}`, a notification fires (if
     `notify.needs`), and `answer(jobId, allow)` resumes it. At `waitHours` expiry (`null` = until the
     next scheduled run) `noAnswer` applies: skip that step / stop the run / continue with `fallback`
     text sent as the tool result.
   - A pause survives the app closing: the waiting state and the run's conversation are on disk; on
     launch a waiting native run resumes from its transcript, a Claude-lane run is re-asked with the
     conversation so far (the CLI has no resume without persistence). Stated in the run as "Picked up
     after restart".
4. **Store** — `main/automations/automation-store.ts`, under `~/.youcoded/automations/`:
   - `jobs.json`: the job definitions (atomic write, version field).
   - `runs/<jobId>/<runId>.json` (summary: outcome, when, dollars, tokens per model/harness, seconds,
     summary text) and `<runId>.jsonl` (the conversation, shown read-only). **Last 50 per job kept**;
     older pruned on each new run.
   - `usage.json`: per job, per calendar month, per `{model, harness}`: dollars and tokens (R10: "track
     tokens used per job by each model/harness").
   - A page-owned job also lives in that page's folder? **No** — one store; `owner.pageId` links it.
     Deleting a page asks whether to delete its automations (its Settings lists them, R12).
5. **Schedule** — `main/automations/scheduler.ts`: one 30-second tick computing each enabled job's
   `nextDue` from `start` (pattern: `DailyBackup.runIfDue`, `sync-spaces/service.ts:268`).
   - Missed runs (R25): on launch, on `powerMonitor` resume, and when a tick sees the clock jump more
     than two minutes (the only wake signal the Android backend has — its powerMonitor is a stub,
     `headless/electron-headless.ts:14`), each job with a missed time applies `late`: run once now,
     skip (recorded as `missed`), or run with `lateFallback` added to the instruction. Several missed
     times collapse to one run.
   - One run per job at a time; a due time while running is recorded as skipped.
   - Jobs run only while YouCoded runs, as the (i) already says. No OS-level wake timers.
6. **Starts:**
   - `schedule`: the scheduler.
   - `button`: the page kit gets `youcoded.automations.run(jobName)`, allowed only for jobs that page
     owns; the button's spinner and waiting dot are drawn by the kit (R14) from a pushed status.
   - `event`: a page reports one with `youcoded.automations.event(name, data)`; jobs of that page
     listening for the name start, with `data` appended to the instruction. **Service events (e.g. "An
     email arrives in Gmail") need step 5's accounts**; until then the editor offers only page events,
     and the mock's Gmail example stays a mock. (Not a contract row; flagged on the post-build deck.)
7. **Money** (R9, R11, R17):
   - Native lane: an `onStepCost(costUsd, usage)` callback beside `costForUsage` at
     `harness/harness-session.ts:3270`. The runner adds it to the run and the month; **before each
     next model step** it checks the month total against `limit` — over it, the run stops with
     outcome `limit` (the step already in flight finishes, so a few cents over is possible and shown).
   - Claude lane: subscription, so no limit (R10); tokens from the stream's `usage` per message.
   - New jobs on a pay-per-use model default `limit = 5` (R9, Destin's Q-limit note).
8. **Notifications** (R4, R26): `main/automations/notify.ts` — Electron `Notification` on desktop
   (first use in main), the existing headless `notify` host call on Android (`Notifier.kt`). Per job:
   `notify.needs / news / fails`; never for a plain Done. Clicking opens Automations at that job.
   Phone over remote access: the desktop shows it; the phone's dot comes from the pushed state.
9. **Bridge:** real channels `automations:list|runs|save|setEnabled|runNow|answer` + push
   `automations:changed` in `preload.ts`, `remote-shim.ts` and the IPC table; the six `MOCK_ONLY`
   rows go away (`ipc-channels.test.ts` and the mock contract test enforce both sides). Android gets
   them free: its node backend runs the same `registerIpcHandlers` (`headless/headless-boot.ts:210`).
   Words the UI shows (`when`, `next`, `until`) are worded in main as today's mock does, with the
   app's existing relative-time helper.
10. **From a chat** (R6, R18): an assistant tool `ProposeAutomation {name, instruction, start, model,
    tools}` — native tool in the harness, and the same on the app's MCP server for Claude Code chats
    (pattern: `claude-code-pages-mcp.ts`). It opens the approved check popup
    (`AutomationCheckDialog`); nothing is saved until Turn on.
11. **Run conversation, read-only:** "Open conversation" renders the run's `.jsonl` with the existing
    transcript view in read-only mode (step 3's earlier-chats viewer), never a live session.

## Not in step 4

Chains of jobs (waits on card #74 plans); service events (step 5); running while YouCoded is closed;
syncing automations between devices (each device runs its own; a job shows on the device that has it).

## Risks

- `claude -p` flags are an outside dependency; the build pins them in `cc-dependencies.md` and a test
  asserts the runner refuses to start without them.
- A native run outside `SessionManager` must still get the same tool set and guards as a chat; the
  build reuses the host's tool assembly function rather than a copy, and a test compares the two lists.
- Many jobs due at once: runs are queued, at most two at a time.

## Build order (tasks)

1. Store + types (shared `automation-types.ts` becomes the stored shape plus worded view).
2. Native lane runner with permission rules, waiting, money stop; tests for skip / wait / expiry /
   limit.
3. Claude lane runner + MCP ask tool; flag check.
4. Scheduler with missed-run handling; tests with a fake clock.
5. Bridge (IPC, preload, remote-shim), notifications, push; remove MOCK_ONLY rows.
6. Page kit `run` / `event` + button status; PageSettings and dots read real state.
7. `ProposeAutomation` tool (native + MCP) → the check popup.
