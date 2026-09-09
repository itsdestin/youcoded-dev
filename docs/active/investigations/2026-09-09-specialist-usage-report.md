# Specialist usage report — YouCoded native sessions modified since 2026-09-06

Source: `~/.youcoded/sessions/*/*.jsonl` with mtime >= 2026-09-06: **254 files**. 
Classification: a file is a **child (specialist) session** when its header carries `parentSessionId` (these headers also carry `sessionKind:"specialist"`, `agentType` and `title`, e.g. "Sage the Elusive Explorer"); files whose header has only `v,sessionId,harnessId,binding,cwd,createdAt` are **parent sessions**. Cross-check: every child's first user message is a delegated brief ("Read-only investigation in ...", "Implement Task 1 ...") and no child contains a Task call.

- Parent sessions: **59**; child sessions: **195** ({'explorer': 43, 'reviewer': 71, 'worker': 78, 'researcher': 3}); Task calls inside children: 0.
- Children whose parent file is not in the set (parent older than 09-06 or missing): 0.
- Parent header models: {'openai/gpt-5.6-sol': 1, 'openai/gpt-6-astra': 2, 'Qwen3.8-27B-UD-Q8_K_XL': 3, '~deepseek/deepseek-v4-flash-latest': 8, 'openai/gpt-5.6-terra': 4, 'Qwen3.6-35B-A3B-UD-Q6_K_XL': 1, 'openai/gpt-5.6-luna': 2, 'moonshotai/kimi-k3': 2, 'gpt-5.6-luna': 8, 'gpt-5.6-terra': 8, 'gpt-6-astra': 13, 'gpt-5.6-sol': 7}. (Several sessions switched model mid-way; the per-session table uses the model recorded on `turn-complete` records, majority wins.)

## How the Task tool is used (one tool, four verbs)

`Task` input keys are always `agent, background, description, interrupt, model, prompt, task_id, work_dir`. The tool-result text tells which verb ran:

| verb | how to recognise | result text starts with |
|---|---|---|
| spawn | `agent`+`description`+`prompt`, empty `task_id` | "X (type) is now working in the background (task_id: …)" or "## Report from X" (foreground) |
| steer | `task_id` + `prompt`, child still running | "Steer delivered to X." |
| resume | `task_id` + `prompt`, child already finished | "## Report from X" / "X is now working in the background" / "failed to resume" |
| interrupt | `task_id` + `interrupt:true` | "Interrupted X — it was: …" |

## 1. Per parent session

Only sessions with at least one Task call are listed in the main table; the rest are summarised after it. "Task calls" = all four verbs. "spawn bg/fg" = new specialists started in background / foreground. "human msgs (short)" = human messages, and how many of them are under 12 characters ("continue", "resume", "fix pls"). "max conc true all/bg" = most specialists actually running at once, measured from the child session files themselves (each child turn = its user-message to its turn-complete), for all children / for background-started children. "naive (open)" = the method asked for: background tool-use time to the matching `[Background specialist finished/failed]` injection (or to a later `task_id` call that returned the child's report, which proves it had finished); runs with neither are counted as running until the session's last record, and `open` counts those — in the heavy sessions the parent pulled reports by re-calling `Task` with the `task_id` instead of waiting for the injection, so that channel rarely fired and the naive figure is inflated. "Task/turn" counts every Task call (incl. steers) between consecutive human messages.

| session | cwd | model | start | dur min | human msgs (short) | injected | Task calls (no result) | spawn bg/fg | steer | resume | intr | max conc true all/bg | naive (open) | agent types | Task/turn max | mean | parallel clusters |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c33eecb0 | youcoded-dev | gpt-6-astra | 09-08 22:19:54 | 283 | 3 (1) | 12 | 127 (0) | 29/1 | 63 | 34 | 0 | 4/4 | 9 (0) | reviewer:18,worker:12 | 105 | 42.3 | - |
| 8bfe04cd | youcoded-dev | gpt-6-astra | 09-08 17:12:27 | 368 | 15 (7) | 10 | 113 (0) | 22/5 | 51 | 35 | 0 | 2/2 | 7 (0) | worker:12,reviewer:9,explorer:6 | 53 | 7.5 | - |
| 1cb09652 | youcoded-dev | gpt-5.6-sol | 09-08 15:33:33 | 689 | 6 (5) | 2 | 53 (0) | 0/16 | 0 | 35 | 0 | 2/0 | 0 (0) | worker:10,reviewer:6 | 38 | 8.8 | - |
| 3e99f07a | youcoded-dev | gpt-6-astra | 09-08 22:22:29 | 396 | 10 (4) | 15 | 49 (0) | 6/12 | 23 | 7 | 0 | 3/2 | 4 (0) | explorer:8,worker:8,reviewer:2 | 21 | 4.9 | - |
| c24f5856 | youcoded-dev | gpt-6-astra | 09-09 01:15:46 | 254 | 1 (0) | 4 | 36 (0) | 2/10 | 2 | 22 | 0 | 2/2 | 2 (0) | worker:5,reviewer:4,explorer:3 | 36 | 36.0 | - |
| 99b69e57 | youcoded-dev | gpt-6-astra | 09-09 01:20:06 | 102 | 5 (0) | 10 | 28 (0) | 9/0 | 17 | 2 | 0 | 2/2 | 6 (1) | worker:4,reviewer:3,researcher:1,explorer:1 | 23 | 5.6 | - |
| 8e54e559 | youcoded-dev | gpt-5.6-sol | 09-07 23:39:55 | 212 | 3 (1) | 3 | 27 (2) | 2/17 | 4 | 3 | 1 | 1/1 | 2 (0) | reviewer:10,worker:8,explorer:1 | 19 | 9.0 | - |
| c286f8cb | youcoded-dev | gpt-6-astra | 09-08 19:06:13 | 445 | 6 (4) | 23 | 20 (0) | 12/0 | 0 | 8 | 0 | 4/4 | 5 (0) | worker:6,explorer:4,researcher:1,reviewer:1 | 7 | 3.3 | - |
| 0c1b3f88 | youcoded-dev | gpt-6-astra | 09-07 23:41:33 | 91 | 11 (1) | 4 | 18 (0) | 6/0 | 6 | 3 | 3 | 4/4 | 5 (0) | explorer:3,worker:2,reviewer:1 | 11 | 1.6 | - |
| 8e8ee3f6 | youcoded-dev | gpt-6-astra | 09-08 03:07:23 | 710 | 6 (2) | 2 | 14 (0) | 2/1 | 5 | 6 | 0 | 2/2 | 6 (0) | worker:2,reviewer:1 | 10 | 2.3 | - |
| 84fd1804 | youcoded-dev | gpt-5.6-sol | 09-08 01:02:03 | 852 | 9 (4) | 10 | 13 (0) | 8/0 | 1 | 4 | 0 | 2/2 | 4 (0) | worker:6,reviewer:2 | 7 | 1.4 | 2 |
| ba4a80a9 | youcoded-dev | gpt-5.6-terra | 09-08 01:45:09 | 87 | 8 (4) | 9 | 11 (0) | 9/0 | 0 | 2 | 0 | 1/1 | 2 (2) | reviewer:5,worker:4 | 7 | 1.4 | - |
| 31b22d40 | youcoded-dev | gpt-5.6-terra | 09-08 01:41:02 | 54 | 9 (2) | 5 | 9 (0) | 6/0 | 0 | 3 | 0 | 3/3 | 6 (0) | explorer:4,reviewer:1,researcher:1 | 6 | 1.0 | 2,3 |
| 7042d51d | youcoded-dev | gpt-5.6-terra | 09-07 21:48:58 | 91 | 5 (2) | 0 | 7 (0) | 0/5 | 0 | 2 | 0 | 1/0 | 0 (0) | reviewer:4,worker:1 | 7 | 1.4 | - |
| 1085ad2a | youcoded-dev | gpt-6-astra | 09-08 22:18:29 | 163 | 5 (0) | 0 | 7 (0) | 2/0 | 2 | 3 | 0 | 2/2 | 3 (0) | explorer:2 | 7 | 1.4 | - |
| 30ccd17d | youcoded-dev | gpt-6-astra | 09-08 22:34:59 | 159 | 8 (1) | 0 | 7 (0) | 2/1 | 0 | 4 | 0 | 2/2 | 4 (0) | explorer:3 | 6 | 0.9 | - |
| a0d52c4c | youcoded-dev | gpt-5.6-sol | 09-08 22:39:57 | 66 | 4 (1) | 2 | 6 (0) | 1/2 | 2 | 1 | 0 | 1/1 | 1 (0) | reviewer:2,explorer:1 | 5 | 1.5 | - |
| d9c707a8 | youcoded-dev | gpt-6-astra | 09-08 23:29:15 | 8 | 2 (0) | 1 | 4 (0) | 2/0 | 2 | 0 | 0 | 1/1 | 1 (0) | explorer:2 | 4 | 2.0 | - |
| b232265b | youcoded-dev | gpt-5.6-terra | 09-08 01:35:51 | 61 | 2 (1) | 1 | 3 (0) | 1/2 | 0 | 0 | 0 | 1/1 | 1 (0) | reviewer:2,explorer:1 | 3 | 1.5 | - |
| 593e7e14 | youcoded-dev | gpt-6-astra | 09-08 03:06:28 | 7 | 1 (0) | 0 | 3 (0) | 1/0 | 1 | 1 | 0 | 1/1 | 1 (0) | explorer:1 | 3 | 3.0 | - |
| c2b1d933 | youcoded-dev | gpt-5.6-terra | 09-08 22:47:57 | 163 | 4 (1) | 3 | 3 (0) | 3/0 | 0 | 0 | 0 | 3/3 | 3 (0) | explorer:3 | 3 | 0.8 | 3 |
| 4c701956 | youcoded-dev | openai/gpt-5.6-sol | 09-06 00:07:56 | 21 | 5 (0) | 0 | 2 (0) | 1/0 | 0 | 1 | 0 | 1/1 | 1 (0) | explorer:1 | 2 | 0.4 | - |
| 47f5fcb5 | youcoded-dev | gpt-5.6-terra | 09-08 00:18:25 | 43 | 9 (4) | 1 | 2 (0) | 1/0 | 0 | 0 | 0 | 1/1 | 1 (0) | explorer:1 | 2 | 0.2 | - |
| e031e696 | youcoded-dev | openai/gpt-5.6-luna | 09-06 03:28:14 | 446 | 16 (7) | 0 | 1 (0) | 0/1 | 0 | 0 | 0 | 1/0 | 0 (0) | reviewer:1 | 1 | 0.1 | - |
| 644d91dd | youcoded-dev | gpt-5.6-sol | 09-08 03:17:11 | 20 | 6 (1) | 1 | 1 (0) | 1/0 | 0 | 0 | 0 | 1/1 | 1 (0) | explorer:1 | 1 | 0.2 | - |
| 68f3fa7e | youcoded-dev | gpt-5.6-luna | 09-08 15:14:28 | 137 | 11 (4) | 2 | 1 (0) | 0/1 | 0 | 0 | 0 | 1/0 | 0 (0) | worker:1 | 1 | 0.1 | - |

Sessions with zero Task calls: 30 — 5eae6884 (openai/gpt-5.6-terra, 25 human msgs), 3156f415 (moonshotai/kimi-k3, 16 human msgs), a159c3a2 (~deepseek/deepseek-v4-flash-latest, 9 human msgs), 3fd07f96 (openai/gpt-5.6-terra, 8 human msgs), 1c39e546 (moonshotai/kimi-k3, 7 human msgs), e804b7d7 (gpt-5.6-terra, 7 human msgs), 7bfbfe17 (gpt-5.6-terra, 6 human msgs), d51e963a (gpt-5.6-terra, 5 human msgs), 84444fac (gpt-6-astra, 5 human msgs), 668b719d (~deepseek/deepseek-v4-flash-latest, 4 human msgs), 670517e2 (Qwen3.8-27B-UD-Q8_K_XL, 4 human msgs), 90518b26 (~deepseek/deepseek-v4-flash-latest, 4 human msgs), ac4b42c1 (gpt-5.6-luna, 4 human msgs), 398f600f (gpt-5.6-luna, 4 human msgs), a4e03260 (openai/gpt-5.6-luna, 4 human msgs), 66e94356 (~deepseek/deepseek-v4-flash-latest, 3 human msgs), a71cf0c1 (Qwen3.6-35B-A3B-UD-Q6_K_XL, 3 human msgs), 56426c96 (gpt-5.6-luna, 3 human msgs), 1b4515a0 (~deepseek/deepseek-v4-flash-latest, 2 human msgs), b565ccad (openai/gpt-6-astra, 2 human msgs), 61d34d88 (openai/gpt-5.6-luna, 2 human msgs), d59e6f15 (gpt-5.6-luna, 2 human msgs), 2aded1eb (gpt-5.6-terra, 2 human msgs), 51874175 (~deepseek/deepseek-v4-flash-latest, 2 human msgs), 50f08d44 (gpt-5.6-sol, 2 human msgs), ad7cc381 (openai/gpt-5.6-terra, 1 human msgs), 513e25a4 (gpt-5.6-luna, 1 human msgs), 95f2fe2a (Qwen3.8-27B-UD-Q8_K_XL, 1 human msgs), 62534cdc (gpt-5.6-sol, 1 human msgs), 10566cb4 (gpt-5.6-terra, 1 human msgs).

Totals across parents: Task calls 565 = {'spawn': 202, 'resume': 176, 'steer': 179, 'interrupt': 4, 'steer-refused': 4}; spawns bg 128 / fg 74; agent types {'explorer': 46, 'reviewer': 72, 'worker': 81, 'researcher': 3}.
Parallel issuance (several Task calls in one assistant step, no tool-result between): 4 clusters, sizes {2: 2, 3: 2}. Every other Task call was issued alone (one call, wait for its result).

True max-concurrency distribution over sessions with Tasks (all children): {1: 12, 2: 8, 3: 3, 4: 3}. The harness cap is 4 concurrent specialists (one refusal quotes it) and one writer at a time (4 refusals quote it).

## 2. Specialist failures

| where seen | reason | count | example (session, time, quote) |
|---|---|---|---|
| Task tool-result isError | child hit its step limit (no report) | 11 | 8e54e559 09-08 01:34:37: `The Worker specialist failed: the specialist hit its step limit without producing a report (specialist session a21a0a88-bcaf-4767-aa71-fd7ec` |
| Task tool-result isError | network: cannot connect / DNS / timeout | 5 | 1cb09652 09-08 17:45:57: `The Worker specialist failed: Cannot connect to API: Connect Timeout Error (attempted addresses: 2606:4700:4408::ac40:9bd1:443, timeout: 100` |
| Task tool-result isError | refused: another writer specialist running | 4 | 8bfe04cd 09-08 17:15:59: `Refused: another specialist with write access is running under this session. Wait for it to finish, or delegate to a read-only specialist (e` |
| Task tool-result isError | refused: unknown task_id | 3 | 47f5fcb5 09-08 00:29:00: `Refused: that task_id does not belong to a specialist of this session.` |
| Task tool-result isError | refused: malformed model arg (JSON garbage) | 2 | 31b22d40 09-08 01:43:31: `Refused: "budget}},{" is not an available model. Use ModelSearch to find the exact id, or use "budget"/"frontier".` |
| Task tool-result isError | harness: "Failed to process successful response" | 2 | 1cb09652 09-08 22:26:59: `The Worker specialist failed to resume: Failed to process successful response (specialist session 6a9a9c5d-56e8-4f22-9ac5-7bf02f2c37f2)` |
| Task tool-result isError | ChatGPT weekly session limit | 2 | 8bfe04cd 09-08 18:10:18: `The Worker specialist failed: You have reached ChatGPT's weekly session limit (Resets Monday @ 9:49pm). (specialist session 8099776e-d782-4e` |
| Task tool-result isError | provider 503 overloaded | 1 | 8e54e559 09-08 00:52:57: `The Worker specialist failed: Our servers are currently overloaded. Please try again later. (provider error 503) (specialist session 26f01c7` |
| Task tool-result isError | interrupt on a finished child | 1 | 0c1b3f88 09-08 00:21:34: `task_id ceb4201a-0097-4328-8c9c-e967752023ea is not currently running — there is nothing to interrupt. Call Task again with the same task_id` |
| Task tool-result isError | malformed spawn (missing args) | 1 | b232265b 09-08 01:44:13: `Starting a new specialist needs "agent", "work_dir", "description", and "prompt". Omit all four and pass "task_id" instead to steer, resume,` |
| Task tool-result isError | provider stalled (75 s no data) | 1 | 1cb09652 09-08 15:53:41: `The Reviewer specialist failed: The model stopped responding — no data received for 75 seconds. The provider may be stalled; send your messa` |
| Task tool-result isError | refused: 4-specialist cap | 1 | c286f8cb 09-08 19:34:24: `Refused: this session is at capacity (max 4 concurrent specialists). Wait for one of the running specialists to finish before starting anoth` |
| injected follow-up | blocked max_steps approved after child finished (follow-up) | 10 | 8e54e559 09-08 01:53:47: `[Specialist follow-up] The user approved Kai the Watchful Worker's blocked max_steps request after the specialist finished. Use task_id a21a` |
| injected status=failed | child hit its step limit (no report) | 5 | 0c1b3f88 09-08 00:43:51: `[Background specialist failed] Marlowe the Willing Worker (worker): the specialist hit its step limit without producing a report (specialist` |
| injected status=failed | harness: "Failed to process successful response" | 5 | 8bfe04cd 09-08 19:05:19: `[Background specialist failed] Sage the Worthy Worker (worker): Failed to process successful response (specialist session e7445003-870b-4951` |
| injected status=failed | network: cannot connect / DNS / timeout | 2 | c286f8cb 09-08 19:48:02: `[Background specialist failed] Kai the Earnest Explorer (explorer): Cannot connect to API: (specialist session 93dbcc72-7190-48d0-8635-516cc` |
| injected status=failed | image too large for provider (400) | 2 | c286f8cb 09-08 22:05:09: `[Background specialist failed] Ellis the Willing Worker (worker): The image you provided requires 49868 patches after processing, exceeding ` |

Total distinct failure events: 58 (Task tool-results with isError: 34; injected `status=failed`: 14; follow-ups: 10). Task calls that never received a tool-result at all (turn cut off): 2.

Keyword mentions in parent sessions (assistant-text and Task tool-results). Plain "budget" is excluded: its 61 raw hits are the `model:"budget"` tier, `animation-frame-budget.test.ts`, and the Arizona-budget project, not specialist budgets; only "step/token/context budget" is counted.

| keyword | count | example |
|---|---|---|
| interrupted | 30 | 8e54e559 09-08 00:04:51 (Task tool-result): `…ltimodal units, reasoning tokens, cache writes, SDK/provider retries, interrupted streams, and auxiliary model calls. Disable SDK retries and the harn…` |
| step limit | 16 | 8e54e559 09-08 01:51:41 (Task tool-result): `…The Worker specialist failed: the specialist hit its step limit without producing a report (specialist session a21a0a88-bcaf-4767-aa7…` |
| stall | 7 | 1b4515a0 09-05 20:15:02 (assistant-text): `… to 0 per turn (a switch makes the next turn a full prefill), and the stall watchdog already knows local prefills legitimately take minutes.  ## …` |
| step budget | 7 | 84fd1804 09-08 01:41:25 (assistant-text): `…The worker exhausted its step budget rather than reporting a code failure. I’m inspecting the worktree and…` |
| timed out | 5 | 1cb09652 09-08 19:02:38 (assistant-text): `…The Task 2 worker’s provider timed out twice, so I’m changing approach rather than retrying it again: a fres…` |
| stalled | 4 | 8e54e559 09-08 00:04:51 (Task tool-result): `…in/harness/harness-session.ts:1906-1912`, `:2260-2281`), so failed or stalled attempts may incur provider charges without a final usage record. Thi…` |
| max_steps | 4 | 47f5fcb5 09-08 00:38:36 (assistant-text): `…for that child; after that many tool-loop steps, it reaches the same `max_steps` path. This protects delegated/background work even if ordinary nativ…` |
| stalls | 4 | ba4a80a9 09-08 01:50:53 (assistant-text): `…til it completes, is interrupted/canceled, hits doom-loop protection, stalls, or is torn down. - Remove specialist-specific `max_steps` routing/re…` |
| aborted | 3 | 8e54e559 09-08 02:20:00 (Task tool-result): `…nd injected `ToolServices.plans.propose`.   - Refuses invalid and pre-aborted proposals without crossing the persistence callback. - Added structur…` |

More `stall` examples:
- 1b4515a0 09-05 20:15:02 (assistant-text): `… to 0 per turn (a switch makes the next turn a full prefill), and the stall watchdog already knows local prefills legitimately take minutes.  ## …`
- 1c39e546 09-07 19:06:00 (assistant-text): `….  **Precedent for exactly this** already exists in the codebase: the stall watchdog emits a stage-1 *warning* at 60s of silence before stage-2 a…`
- 30ccd17d 09-09 01:12:25 (assistant-text): `…osed limits are in the spec. - Diagnostics failures must not break or stall conversations. - Measure parsing/hashing overhead; asynchronous file …`
- c2b1d933 09-08 22:52:56 (assistant-text): `…process; the existing measurement recorded **7–14 seconds of renderer stall for 5,000 entries**.  For the final list and recommendations, should …`

More `stalled` examples:
- 8e54e559 09-08 00:04:51 (Task tool-result): `…in/harness/harness-session.ts:1906-1912`, `:2260-2281`), so failed or stalled attempts may incur provider charges without a final usage record. Thi…`
- 1cb09652 09-08 15:55:11 (Task tool-result): `…ped responding — no data received for 75 seconds. The provider may be stalled; send your message again to retry. (specialist session 8734e4e1-96af-…`
- c33eecb0 09-09 01:40:31 (Task tool-result): `…e history grows. Bound memory through streaming/pagination and detect stalled transfers instead of treating every long transfer as failure. - **`:1…`
- c2b1d933 09-08 23:01:57 (assistant-text): `…ith six sessions open. / **Measured** / Frozen input, delayed clicks, stalled animations, blank or unresponsive conversation while React/Markdown w…`

More `timed out` examples:
- 1cb09652 09-08 19:02:38 (assistant-text): `…The Task 2 worker’s provider timed out twice, so I’m changing approach rather than retrying it again: a fres…`
- a159c3a2 09-08 20:35:13 (assistant-text): `…The `--wait` timed out only because `.framed-shell` exists immediately (probe waits for **fa…`
- a159c3a2 09-08 20:35:30 (assistant-text): `…The `--wait` timed out last time and this probe started before render. Let me wait for the b…`
- a159c3a2 09-08 20:40:16 (assistant-text): `…The `--wait` timed out (30s) — page didn't reach the button this probe run. The HMR edit may…`

More `aborted` examples:
- 8e54e559 09-08 02:20:00 (Task tool-result): `…nd injected `ToolServices.plans.propose`.   - Refuses invalid and pre-aborted proposals without crossing the persistence callback. - Added structur…`
- 8e54e559 09-08 02:29:01 (Task tool-result): `…ead of terminating it.**      Missing plan-service wiring, an already-aborted execution, or any exception thrown by `plans.propose` returns an erro…`
- 8e54e559 09-08 02:42:52 (Task tool-result): `…ve failures included:  ```text expected undefined to be AbortSignal { aborted: false } expected [] to have a length of 1 but got +0 expected 1 to b…`

More `interrupted` examples:
- 8e54e559 09-08 00:04:51 (Task tool-result): `…ltimodal units, reasoning tokens, cache writes, SDK/provider retries, interrupted streams, and auxiliary model calls. Disable SDK retries and the harn…`
- 8e54e559 09-08 00:04:51 (Task tool-result): `…n plan children. Providers that cannot return authoritative usage for interrupted/error requests must fail closed or charge the entire reserved allowa…`
- 8e54e559 09-08 00:04:51 (Task tool-result): `…anceId}` and says a `running` record owned by another process becomes interrupted; it does not require proof that the other owner is dead. `NativeHome…`
- 8e54e559 09-08 00:04:51 (Task tool-result): `…eloads existing plan cards from disk, despite signed R9 requiring the interrupted card and completed steps to return after restart (`specialists-plans…`

## 3. Steering, resuming, interrupting

There is no separate steering tool; steering is `Task` with `task_id` (+ `prompt`) while the child runs. Counts across parents: steer **179**, resume 176, interrupt 4, steer refused 4. Sessions that steered at all: 13. Steers sent with `background:true` (fire and forget): 110; with `background:false` (waits for the child to finish and returns its report): 69.

Cadence: 129 of the 179 steers (72%) are hurry-up messages ("return now", "finish now", "conclude immediately", "stop tool use", "status check"). Consecutive steers to the same child arrive a median 52 s apart (mean 96 s, n=134 gaps). 45 children were steered; 15 got one steer, but 11 children got 6 or more and the worst got 14 (8bfe04cd child 0141250d), 13 (8bfe04cd 24e9b5bb) and 12 (c33eecb0 e25522dd and 9cd48a5e, 99b69e57 0cf238f8). The pattern in the heavy gpt-6-astra sessions is: spawn in background, send a correction 20-40 s later, then nag every minute until a foreground `task_id` call returns the report.

Example steers:
- 8e54e559 09-08 00:41:18 (bg): `One clarification before production edits: use the probe's exact field names and recursive `$ref` JSON shape, then app-side semantic validat`
- 8e54e559 09-08 00:41:38 (fg): `Please continue Task 1. Keep scope bounded; if the writing transient cannot be correctly built in this task, complete schema/validator/eligi`
- 8e54e559 09-08 00:41:49 (fg): `Return your current status now if you have finished; otherwise continue through commit and then report.`
- 8e54e559 09-08 00:42:44 (bg): `If you are blocked from editing or commands, stop and report BLOCKED with the exact reason. Otherwise begin with the RED tests now and compl`
- 0c1b3f88 09-08 00:11:23 (bg): `Read-only spotcheck found existing hydration tests under desktop/src/renderer/state/__tests__/chat-hydration.test.ts (not desktop/tests). Se`
- 0c1b3f88 09-08 00:13:09 (bg): `Workspace audit run /tmp/correctness-batch-audit.log failed due absent unrelated component checkouts plus BASELINE active/archive duplicates`
- 0c1b3f88 09-08 00:15:49 (bg): `One small test hygiene point spotted in touched conversation-store.test.ts: existing teardown fs.rmSync(tmp...) at line 65 violates loaded t`
- 0c1b3f88 09-08 00:16:36 (bg): `Minor consistency review: migrated porcelain.test.ts test names/comments still describe brace-rename collapsing and old unit/record separato`
- 0c1b3f88 09-08 00:17:35 (bg): `Please finish the three-fix batch without expanding test matrix further; preserve focus on broad verify and roadmap evidence. We have focuse`
- 0c1b3f88 09-08 00:20:13 (bg): `Need a concise status checkpoint: current blocker or command running? Last visible files/logs unchanged since focused green. Avoid broad/dep`
- 84fd1804 09-08 02:05:59 (bg): `Reviewer finished with concrete findings. Address all before final verification: 1) Add native:get-step-guard and native:set-step-guard to r`
- 593e7e14 09-08 03:09:16 (bg): `Please conclude concise findings now if enough gathered; parent verified provider semantics: Codex default context_window intentional, max i`

Re-spawns after a failure (new spawn whose description is >=60% similar to an earlier failed specialist's description in the same session): **19**.
- 8e54e559 09-08 00:54:53: failed "Fix schema review findings" -> new "Fix schema review findings" (sim 1.0)
- 8e54e559 09-08 01:32:13: failed "Fix schema review findings" -> new "Final schema task review" (sim 0.64)
- 8e54e559 09-08 02:20:27: failed "Build propose plan tool" -> new "Review propose plan integration" (sim 0.63)
- 8e54e559 09-08 02:29:15: failed "Build propose plan tool" -> new "Fix propose plan lifecycle" (sim 0.65)
- 8e54e559 09-08 02:43:15: failed "Build propose plan tool" -> new "Rereview propose plan tool" (sim 0.78)
- 84fd1804 09-08 02:41:27: failed "Finish step guard feature" -> new "Verify step guard UI" (sim 0.62)
- 84fd1804 09-08 03:19:55: failed "Finish step guard feature" -> new "Final step guard review" (sim 0.71)
- 31b22d40 09-08 01:44:00: failed "Map public documentation" -> new "Map public documentation" (sim 1.0)
- ba4a80a9 09-08 02:42:52: failed "Remove child runtime step cap" -> new "Review child runtime cap removal" (sim 0.72)
- 1cb09652 09-08 20:26:24: failed "Build guarded updates" -> new "Finish guarded updates" (sim 0.79)
- 1cb09652 09-08 20:54:55: failed "Build guarded updates" -> new "Review guarded updates" (sim 0.79)
- 1cb09652 09-08 22:23:51: failed "Review sync inventory" -> new "Review sync candidates" (sim 0.65)
- 1cb09652 09-09 00:16:06: failed "Review sync inventory" -> new "Review sync documentation" (sim 0.7)
- 8bfe04cd 09-08 18:10:18: failed "Reproduce buddy zoom clipping" -> new "Fix confirmed buddy zoom clipping" (sim 0.74)
- 8bfe04cd 09-08 19:01:25: failed "Reproduce buddy zoom clipping" -> new "Fix confirmed buddy zoom clipping" (sim 0.74)
- 8bfe04cd 09-08 19:02:36: failed "Reproduce buddy zoom clipping" -> new "Review buddy zoom options" (sim 0.63)
- d9c707a8 09-08 23:30:26: failed "Review continuation contract" -> new "Review continuation contract" (sim 1.0)
- c24f5856 09-09 04:34:08: failed "Implement SDK-native continuation history" -> new "Implement durable accepted history" (sim 0.64)
- 99b69e57 09-09 01:57:36: failed "Test remote setup user experience" -> new "Test remote setup user experience" (sim 1.0)

## 4. Interrupt sequences

user-interrupt records in parent sessions: 23 raw, 15 after collapsing bursts under 5 s apart (the app writes 2-3 records per stop). Interrupt bursts followed by an injected message within 60 s: **10**. Injected message as the very next message within 60 s after a turn-complete (model finished, then immediately re-triggered by a specialist/shell finishing): **52** of 326 turn-completes.

**670517e2 09-06 03:14:24** (+s: type: text)
- (nothing within 60 s)

**3156f415 09-07 17:11:00** (+s: type: text)
- +0.0s user-message: INJ:[Background command sh-49cd finished · exit 0 · 11m 45s] $ while true; do   n=$(gh api repos/itsdestin/youcoded/actions/
- +17.1s assistant-text: The desktop beta run **failed**. Let me see which job failed and why:
- +18.3s tool-use: Bash
- +30.1s tool-result

**3156f415 09-07 18:06:17** (+s: type: text)
- +0.0s user-message: INJ:[Background command sh-5b9d finished · exit 0 · 23m 50s] $ while true; do   out=$(gh run view 34171381993 --repo itsdest
- +2.6s user-interrupt
- +10.8s user-message: HUMAN:whatcha doing buddy. seem to be in a loop.

**3156f415 09-07 18:57:46** (+s: type: text)
- +16.7s user-message: HUMAN:stop using the bash output tool. as it says, you will be notified automatically when it finishes.
- +19.3s assistant-text: Understood — no more polling. The beta build is running in the background and I'll be notified automatically when it fin
- +19.8s turn-complete: end_turn

**3156f415 09-07 19:22:55** (+s: type: text)
- +0.0s user-message: INJ:[Background command sh-db1c finished · exit 0 · 1m 56s] $ cd /tmp/youcoded-beta75 && gh release upload 1.3.0-beta.75 --r
- +0.9s user-interrupt
- +6.9s user-message: HUMAN:stop using bashoutput to poll
- +27.6s assistant-text: Upload finished (exit 0). Verifying all 8 assets landed, then publishing:
- +31.4s tool-use: Bash
- +33.8s tool-result
- +40.7s assistant-text: All 8 assets uploaded, target correct, prerelease flag set. Publishing:
- +43.4s tool-use: Bash

**ac4b42c1 09-07 20:54:17** (+s: type: text)
- +18.5s user-message: HUMAN:.]

**8e54e559 09-08 01:53:20** (+s: type: text)
- +7.3s user-message: HUMAN:continue
- +13.4s assistant-text: Continuing from the partial `propose_plan` implementation. I’ll preserve its edits, have a fresh worker inspect and fini
- +27.3s user-interrupt
- +27.3s user-message: INJ:[Specialist follow-up] The user approved Kai the Watchful Worker's blocked max_steps request after the specialist finish
- +29.2s user-interrupt
- +42.6s user-message: HUMAN:just resume the old worker
- +50.0s tool-use: Skill
- +50.0s tool-result
- +52.5s assistant-text: Resuming Kai’s existing worker now.
- +58.6s tool-use: Task:Continue the same Task 1 `propose_plan` 

**8e54e559 09-08 01:53:47** (+s: type: text)
- +0.0s user-message: INJ:[Specialist follow-up] The user approved Kai the Watchful Worker's blocked max_steps request after the specialist finish
- +1.9s user-interrupt
- +15.3s user-message: HUMAN:just resume the old worker
- +22.7s tool-use: Skill
- +22.7s tool-result
- +25.3s assistant-text: Resuming Kai’s existing worker now.
- +31.3s tool-use: Task:Continue the same Task 1 `propose_plan` 

**0c1b3f88 09-07 23:55:58** (+s: type: text)
- +0.0s user-message: HUMAN:don't use any more specialistss yet, pause rq
- +7.0s tool-use: Task:
- +7.0s tool-result
- +15.0s tool-use: Task:
- +15.0s tool-result
- +19.0s assistant-text: Paused. I stopped the two still-running specialists and won’t start any more or make further changes until you say to co
- +21.0s turn-complete: end_turn
- +21.1s user-message: INJ:[Background specialist finished] Adrian the Efficient Explorer (explorer) completed the task you delegated ("Triage Git 
- +25.0s assistant-text: Still paused. One correction from the completed review: **ordinary accented Git filenames already have a fix and regress
- +27.5s turn-complete: end_turn
- +27.5s user-message: INJ:[Background specialist finished] Sage the Exuberant Explorer (explorer) completed the task you delegated ("Triage chat m
- +32.0s assistant-text: Received the remaining review. Still paused—no further tools, specialists, or edits.
- +32.9s turn-complete: end_turn

**0c1b3f88 09-08 01:10:49** (+s: type: text)
- +0.0s user-message: HUMAN:we can also mark the linux buddy in packaged build test as done
- +8.4s tool-use: Read
- +8.4s tool-result
- +26.5s tool-use: Edit
- +26.5s tool-result
- +35.9s tool-use: Read
- +35.9s tool-result
- +42.8s tool-use: Edit
- +42.8s tool-result
- +50.2s tool-use: Edit
- +50.2s tool-result

**2aded1eb 09-08 02:33:50** (+s: type: text)
- +35.8s user-message: HUMAN:this should go as a roadmap item
- +40.9s tool-use: Skill
- +40.9s tool-result
- +44.8s assistant-text: Using brainstorming to frame this clearly enough for the roadmap, without starting any implementation.
- +47.8s tool-use: TodoWrite
- +47.8s tool-result
- +53.5s tool-use: Bash

**1cb09652 09-08 17:27:38** (+s: type: text)
- +0.0s user-message: INJ:[Specialist follow-up] The user approved Fenn the Wandering Worker's blocked max_steps request after the specialist fini
- +1.3s user-interrupt
- +5.1s user-message: HUMAN:continue
- +17.9s tool-use: Task:Continue and finish the regression-first

**1cb09652 09-09 03:02:39** (+s: type: text)
- +0.0s user-message: INJ:[Specialist follow-up] The user approved Worker 15's blocked max_steps request after the specialist finished. Use task_i
- +0.5s user-interrupt

**c33eecb0 09-09 03:02:35** (+s: type: text)
- +0.0s user-message: INJ:[Background command sh-ebaa finished · exit 0 · 14s] $ bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessio
- +0.6s user-interrupt
- +0.6s user-message: INJ:[Background specialist finished] Worker 29 (worker) completed the task you delegated ("Plan project identity collision g
- +1.0s user-interrupt

**99b69e57 09-09 03:02:22** (+s: type: text)
- +0.0s user-message: INJ:[Background specialist finished] Sage the Resolute Reviewer (reviewer) completed the task you delegated ("Check UI revis
- +0.6s user-interrupt

## 5. Multi-turn-after-final chains

A chain = turn-complete -> injected user-message -> (assistant work) -> turn-complete, repeated, with no human message. Chains found: **45**, total injected-triggered turns in chains: 105, longest chain: **9** (['c286f8cb']).
Chain length distribution: {1: 26, 2: 6, 3: 5, 5: 2, 6: 3, 7: 1, 8: 1, 9: 1}.

| session | chains (length each) |
|---|---|
| c286f8cb | [9, 2, 6] |
| 3e99f07a | [1, 1, 3, 2, 5] |
| 84fd1804 | [1, 6, 3] |
| ba4a80a9 | [3, 6] |
| 99b69e57 | [8, 1] |
| 8bfe04cd | [1, 1, 5] |
| c33eecb0 | [7] |
| 3156f415 | [2, 1, 1, 1] |
| 31b22d40 | [2, 3] |
| a159c3a2 | [1, 1, 1, 1, 1] |
| 0c1b3f88 | [2, 2] |
| c2b1d933 | [3] |
| 68f3fa7e | [1, 1] |
| a0d52c4c | [1, 1] |
| 90518b26 | [1] |
| 8e54e559 | [1] |
| 47f5fcb5 | [1] |
| b232265b | [1] |
| 8e8ee3f6 | [1] |
| 644d91dd | [1] |
| 7bfbfe17 | [1] |
| d9c707a8 | [1] |

## 6. Cost / context: parent vs specialists

`turn-complete.usage.inputTokens` is the parent's per-turn total (every model call in that turn, cache reads included); `subagent-usage` is emitted once per child turn and its sum equals the child's own turn totals (verified on 6 children), so summing is correct. 18 child sessions have no `subagent-usage` record (failed/aborted children), so specialist share is a lower bound.

| session | model | parent in | parent out | spec in | spec out | spec share of input | parent $ | spec $ | max ctx |
|---|---|---|---|---|---|---|---|---|---|
| 8bfe04cd | gpt-6-astra | 54.2M | 48k | 30.1M | 94k | 36% | 0.00 | 0.00 | 196k |
| c33eecb0 | gpt-6-astra | 41.0M | 39k | 19.9M | 132k | 33% | 0.00 | 0.00 | 203k |
| 1cb09652 | gpt-5.6-sol | (no turn-complete records; parent usage unrecorded) | | 54.1M | 262k | n/a | | | |
| 3e99f07a | gpt-6-astra | 20.8M | 20k | 27.8M | 99k | 57% | 0.00 | 0.00 | 197k |
| c24f5856 | gpt-6-astra | (no turn-complete records; parent usage unrecorded) | | 45.2M | 171k | n/a | | | |
| c286f8cb | gpt-6-astra | 15.4M | 17k | 26.5M | 95k | 63% | 0.00 | 0.00 | 204k |
| 99b69e57 | gpt-6-astra | 28.6M | 32k | 11.6M | 39k | 29% | 0.00 | 0.00 | 143k |
| 8e54e559 | gpt-5.6-sol | 0.4M | 0k | 23.7M | 127k | 99% | 0.00 | 0.00 | 120k |
| 0c1b3f88 | gpt-6-astra | 22.1M | 21k | 1.4M | 13k | 6% | 0.00 | 0.00 | 205k |
| 5eae6884 | openai/gpt-5.6-terra | 23.2M | 38k | 0.0M | 0k | 0% | 5.37 | 0.00 | 244k |
| ba4a80a9 | gpt-5.6-terra | 12.7M | 25k | 9.5M | 46k | 43% | 0.00 | 0.00 | 184k |
| 31b22d40 | gpt-5.6-terra | 19.9M | 41k | 1.9M | 31k | 9% | 0.00 | 0.00 | 203k |
| a159c3a2 | ~deepseek/deepseek-v4-flash-latest | 19.9M | 42k | 0.0M | 0k | 0% | 0.33 | 0.00 | 187k |
| 3156f415 | moonshotai/kimi-k3 | 18.7M | 27k | 0.0M | 0k | 0% | 7.88 | 0.00 | 208k |
| 84fd1804 | gpt-5.6-sol | 9.4M | 22k | 7.0M | 43k | 43% | 0.00 | 0.00 | 193k |
| 668b719d | ~deepseek/deepseek-v4-flash-latest | 16.4M | 117k | 0.0M | 0k | 0% | 0.26 | 0.00 | 159k |
| 7bfbfe17 | gpt-5.6-terra | 14.1M | 30k | 0.0M | 0k | 0% | 0.00 | 0.00 | 192k |
| a0d52c4c | gpt-5.6-sol | 11.7M | 24k | 0.5M | 13k | 4% | 0.00 | 0.00 | 171k |
| b232265b | gpt-5.6-terra | 9.7M | 17k | 0.6M | 8k | 6% | 0.00 | 0.00 | 183k |
| 1c39e546 | moonshotai/kimi-k3 | 10.0M | 26k | 0.0M | 0k | 0% | 3.73 | 0.00 | 132k |
| 68f3fa7e | gpt-5.6-luna | 8.8M | 15k | 0.7M | 8k | 7% | 0.00 | 0.00 | 141k |
| 90518b26 | ~deepseek/deepseek-v4-flash-latest | 9.4M | 26k | 0.0M | 0k | 0% | 0.14 | 0.00 | 130k |
| 30ccd17d | gpt-6-astra | 8.2M | 19k | 1.0M | 11k | 11% | 0.00 | 0.00 | 165k |
| e031e696 | openai/gpt-5.6-luna | 8.9M | 23k | 0.2M | 3k | 2% | 1.49 | 0.18 | 160k |
| 7042d51d | gpt-5.6-terra | 6.8M | 18k | 2.3M | 22k | 25% | 0.00 | 0.00 | 145k |
| 1b4515a0 | ~deepseek/deepseek-v4-flash-latest | 7.2M | 21k | 0.0M | 0k | 0% | 0.09 | 0.00 | 130k |
| 644d91dd | gpt-5.6-sol | 6.4M | 16k | 0.7M | 7k | 10% | 0.00 | 0.00 | 185k |
| 8e8ee3f6 | gpt-6-astra | 3.1M | 6k | 3.9M | 15k | 56% | 0.00 | 0.00 | 91k |
| 1085ad2a | gpt-6-astra | 6.1M | 15k | 0.7M | 11k | 11% | 0.00 | 0.00 | 148k |
| e804b7d7 | gpt-5.6-terra | 5.2M | 10k | 0.0M | 0k | 0% | 0.00 | 0.00 | 174k |
| 47f5fcb5 | gpt-5.6-terra | 3.5M | 19k | 0.4M | 6k | 11% | 0.00 | 0.00 | 172k |
| c2b1d933 | gpt-5.6-terra | 1.2M | 13k | 1.9M | 24k | 61% | 0.00 | 0.00 | 131k |
| 3fd07f96 | openai/gpt-5.6-terra | 3.0M | 5k | 0.0M | 0k | 0% | 0.91 | 0.00 | 134k |
| 593e7e14 | gpt-6-astra | 1.9M | 5k | 0.4M | 4k | 17% | 0.00 | 0.00 | 77k |
| 84444fac | gpt-6-astra | 1.8M | 14k | 0.0M | 0k | 0% | 0.00 | 0.00 | 69k |
| d9c707a8 | gpt-6-astra | 1.5M | 6k | 0.3M | 4k | 16% | 0.00 | 0.00 | 79k |
| 4c701956 | openai/gpt-5.6-sol | 1.1M | 13k | 0.6M | 9k | 34% | 0.48 | 0.46 | 78k |
| a4e03260 | openai/gpt-5.6-luna | 1.6M | 7k | 0.0M | 0k | 0% | 0.07 | 0.00 | 154k |
| a71cf0c1 | Qwen3.6-35B-A3B-UD-Q6_K_XL | 1.2M | 13k | 0.0M | 0k | 0% | 0.00 | 0.00 | 84k |
| 51874175 | ~deepseek/deepseek-v4-flash-latest | 1.1M | 27k | 0.0M | 0k | 0% | 0.03 | 0.00 | 64k |
| 56426c96 | gpt-5.6-luna | 1.1M | 7k | 0.0M | 0k | 0% | 0.00 | 0.00 | 108k |
| d51e963a | gpt-5.6-terra | 0.9M | 8k | 0.0M | 0k | 0% | 0.28 | 0.00 | 74k |
| 2aded1eb | gpt-5.6-terra | 0.8M | 4k | 0.0M | 0k | 0% | 0.00 | 0.00 | 63k |
| 62534cdc | gpt-5.6-sol | 0.2M | 4k | 0.0M | 0k | 0% | 0.00 | 0.00 | 22k |
| 10566cb4 | gpt-5.6-terra | 0.2M | 3k | 0.0M | 0k | 0% | 0.00 | 0.00 | 22k |
| 398f600f | gpt-5.6-luna | 0.1M | 1k | 0.0M | 0k | 0% | 0.00 | 0.00 | 28k |
| 513e25a4 | gpt-5.6-luna | 0.0M | 0k | 0.0M | 0k | 0% | 0.00 | 0.00 | 17k |
| 670517e2 | Qwen3.8-27B-UD-Q8_K_XL | 0.0M | 0k | 0.0M | 0k | 0% | 0.00 | 0.00 | 9k |
| 61d34d88 | openai/gpt-5.6-luna | 0.0M | 0k | 0.0M | 0k | 0% | 0.00 | 0.00 | 10k |
| b565ccad | openai/gpt-6-astra | 0.0M | 0k | 0.0M | 0k | 0% | 0.11 | 0.00 | 9k |

Totals: parent input 439.5M, specialist input 272.8M -> specialists = 38% of all recorded input tokens (excluding the two sessions with no parent turn records, which add 99.3M specialist input on their own). (ChatGPT-plan models report costUsd 0 for the parent; only OpenRouter-billed sessions show dollars.)

## 7. Five most egregious sessions (Task calls per human turn)

### c33eecb0 — youcoded-dev — gpt-6-astra — 127 Task calls / 3 human msgs = 42.3 per turn

Destin asked once ("look for ways to simplify sync system code and improve reliability") and twice said "continue"/"work through these". The model turned that into a 127-call specialist storm across 30 children: it never investigated the sync code itself. Phase 1: three background reviewers ("Audit transport deletion and repair", "Audit cleanup and conversation resurrect", "Audit sync user expectations") plus a worker to "Verify sync tests in isolation", each steered 2-4 times within minutes with "please also verify ...", then pulled in with "Return final report now, no new investigation." Phase 2 spawned "challenge" reviewers to re-check the first reviewers, then for every tiny batch (paused-backup guard, immutable-backup design, conflict-notice wording, evidence-preserving heal, project-identity guard) it started a worker plus one or two reviewers, and fired 4-12 steers per child a minute apart ("Need completion now", "Hard checkpoint: report now", "Final verdict required now, no more tool calls", "Please report concrete status NOW: tests done? capture running? blocked?"). One spawn was refused because a writer was already running. 63 steers and 34 resumes against 30 spawns: the parent spent its turn babysitting rather than waiting, and its own context still reached 203k tokens. True concurrency peaked at 4 (the cap); the naive figure is inflated because only 12 of 30 children reported through the injection channel, the rest were pulled by re-calling Task.

### c24f5856 — youcoded-dev — gpt-6-astra — 36 Task calls / 1 human msgs = 36.0 per turn

A single long handoff prompt ("Implement the approved ChatGPT cache-efficiency improvements ... all six stages"), then no human input for 4 h 14 min. The model ran a strict worker-then-reviewer assembly line for four stages: spawn a frontier worker in the foreground ("Implement private request diagnostics", "Implement append-only specialist snapshots", "Implement SDK-native continuation history", "Implement durable accepted history"), spawn a frontier reviewer, then resume the worker with the reviewer's findings, resume the reviewer to re-check, repeat 2-3 rounds per stage; budget explorers were used for read-only seam mapping. 22 of the 36 calls are resumes. Stage 3's worker hit its step limit three times (spawn, two resumes) before a replacement worker also hit it; Stage 4's worker then died on "You have reached ChatGPT's weekly session limit". The session has no turn-complete record at all, so the parent's own token usage is unrecorded, while its children consumed 45.2M input tokens. Nothing was ever shown to Destin between stages.

### 8e54e559 — youcoded-dev — gpt-5.6-sol — 27 Task calls / 3 human msgs = 9.0 per turn

Handoff to "build the plans backend (specialists stage two)"; Destin's only later inputs were "continue" and "just resume the old worker" (after the app asked him to approve a blocked max_steps request). The model first ran three sequential "adversarial design review" reviewers (rounds one, two, three) before any code, then a background worker for Task 1 which it steered four times in 90 seconds ("Please continue Task 1", "Return your current status now", "If you are blocked ... report BLOCKED") and interrupted 2.5 minutes after starting it, replacing it with a smaller foreground worker. From there it alternated worker -> reviewer -> fix-worker -> re-reviewer for the schema validator (5 calls), the propose_plan tool (6 calls) and the lifecycle fixes. Failures: a 503, then "Build propose plan tool" hit the step limit, the resume failed on the step limit again, and the follow-up injection ("user approved ... max_steps") arrived while Destin was interrupting, producing the double interrupt sequence in section 4. Two Task calls never got a result because the turn was cut off. 99% of the session's recorded tokens went to children.

### 1cb09652 — youcoded-dev — gpt-5.6-sol — 53 Task calls / 6 human msgs = 8.8 per turn

"implement in-line" of a six-task workspace-sync plan, then five one-word messages ("continue" x4, "resume") over 11.5 hours. Every one of the 53 calls is foreground: worker implements Task N, reviewer reviews, worker resumed with findings, reviewer resumed to re-verify, up to four rounds each ("Final Task 1 re-review after the second fix", "Fix the final Task 3 nested-untracked collision evidence gap regression-first"). 35 of 53 calls are resumes. Two of the "refused: unknown task_id" errors are here: the model passed a truncated or guessed id, then corrected itself 10 seconds later. It lost about 3 hours to provider failures: a 75-second stall on the first reviewer, "Cannot connect to API" on the Task 2 worker (spawn and two resumes), "Failed to process successful response" on Task 3, and step-limit failures on the final fix wave. Because the turn was interrupted four times (the "continue" messages resume it), the session has no turn-complete records; its children consumed 54.1M input tokens, the largest specialist bill in the set.

### 8bfe04cd — youcoded-dev — gpt-6-astra — 113 Task calls / 15 human msgs = 7.5 per turn

The most interactive of the five: Destin reported the buddy-floater regression and then kept adding real requests ("still getting the yellow default floater", "just installed devils garden but i cant apply it", "the mascots in light and creme themes look terrifying", "buddy animations wigging out", "merge/push"). The model answered each with a background worker plus a reviewer and then steered them relentlessly: the theme-sync worker got 10 steers/resumes in 20 minutes ("Status needed now: how far tests/fix? Return interim textual update rather than defer delivery"), and the mascot-comparison worker got 14 ("Need own verified workbench URL+screenshots now", "Review deck G-1 missing words:true"). The first worker spawn was refused because a writer was already running; a fix-worker died on the ChatGPT weekly limit and was re-spawned 50 minutes later under the same description; two background children failed with "Failed to process successful response". 51 steers + 35 resumes against 27 spawns, seven human messages were just "continue". Context reached 196k and the parent alone used 54.2M input tokens, the largest parent bill in the set.


## Headline observations

1. **Steering is the dominant Task verb.** 565 Task calls = 202 spawns, 179 steers, 176 resumes, 4 interrupts, 4 refused. In the three gpt-6-astra sessions with 100+ calls, spawns are under a quarter of the calls; the rest is the parent nagging children a minute apart.
2. **Parallel issuance is rare (4 clusters in 565 calls).** The model starts specialists one call at a time, then floods them with steers; genuine fan-out never exceeded the 4-child cap and was mostly 1-2.
3. **Reports are pulled, not delivered.** In the heavy sessions the parent re-calls `Task` with the `task_id` ("Return final report now") instead of waiting for the `[Background specialist finished]` injection; c33eecb0 got 12 injections for 30 children.
4. **Step-limit failures are the biggest failure class** (16 events incl. injections) and every one was answered by a resume or a re-spawn with a near-identical description (19 re-spawns after failure); network and "Failed to process successful response" errors come next, and two sessions ended on the ChatGPT weekly limit.
5. **Interrupts rarely stop the specialists.** 10 of 15 interrupt bursts were followed within 60 s by an injected completion/follow-up, and 52 of 326 turn-completes were immediately followed by an injected message that re-triggered the model; 45 chains of injected-only turns exist, the longest 9 turns (c286f8cb) without a human message.
6. **Two long sessions (1cb09652, c24f5856) have no `turn-complete` records at all**, so their parent usage and context are unrecorded; their children alone consumed 99M input tokens.
7. All 09-09 03:02 interrupts (sessions 1cb09652, c33eecb0, 99b69e57 within 15 s of each other) look like one app-wide stop, not three separate user actions.
