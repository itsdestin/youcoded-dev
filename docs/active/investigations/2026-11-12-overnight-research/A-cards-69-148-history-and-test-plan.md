---
status: active
date: 2026-11-12
cards: [69, 148]
---
# Cards #69 (cloud costs) and #148 (sessions stop early): what was already done, and how a test would work

Read-only research, written overnight 2026-11-12. Nothing in the app was changed, nothing paid was run.
Destin asked (wave-2 deck, 2026-11-12) to review earlier chats and commits first, and to understand how a test would run.

## 1. Is his memory right? Yes, for both

### Card #69 (cloud model costs): a lot of real work happened

| When | What | Evidence |
|---|---|---|
| 2026-08-17 | First four-provider cache study and "stable-prefix playbook" | `docs/archive/investigations/2026-08-17-cache-efficiency.md` |
| 2026-09-08 | Destin asks "how does youcoded handle caching/token reuse on ChatGPT plans and OpenRouter after a restart?" (chat 644d); ends with a roadmap item merged (commit `1a149df1`) | chatsearch 644d |
| 2026-09-09 | ChatGPT cache fixes: dropped reasoning data, per-turn status rewrite | app PR #461 (`05149b01b`) |
| 2026-09-10 | Cache follow-ups: Anthropic cache markers, OpenRouter `session_id` (keeps a chat on the same server), summary reuses the warm start, local-model counters | app PR #464 (`517e6253e`); `docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md`; survey of ten other apps `docs/active/investigations/2026-09-09-cache-efficiency-competitor-survey.md` |
| 2026-09-15 to 22 | Destin: "test youcoded's prompt reuse for chatgpt plan models ... compared to opencode/hermes/pi" (chat 85c5). A real paid-plan test rig (`scripts/luna/`) ran the same chat 10 times in each app | `docs/archive/investigations/2026-09-23-chatgpt-cache-affinity.md` |
| 2026-09-23 | Finding: ChatGPT misses were routing (a missing header). Fix: reuse went 13/20 to 18/20 follow-ups, first-message reuse 3/10 to 9/10 | app PRs #553 (`b6f94e1dc`), #554 (`4acd6d7c0`) |
| 2026-09-23 | Native compaction (summaries) with restore | app PR #559 |
| 2026-09-29 | Destin: "native harness eats ChatGPT plan usage and OpenRouter credits very fast. Are we missing something?" (chat 5f31) | chatsearch 5f31 |
| 2026-10-19 / 21 | 500k cloud context option (#652); per-provider output caps (#670); custom-provider cache fixes (`60344edcc`) | `git log` |
| 2026-11-11 | Free measurement from his saved chats (numbers only) | `docs/active/investigations/2026-11-11-cache-reuse-measured/README.md` and `tables.md`, commit `91434157a` |
| 2026-11-12 | Today's cost audit of other apps (chat 83e0), report at `~/Documents/research/reports/AI harness cost optimizations.md` | chatsearch 83e0 |

What it found for OpenRouter (the card's 18%):
- Before the Sept 11 fix reached the app: 38% of follow-ups re-read the whole chat at full price (590 follow-ups, 124 chats). After: 33% overall, 18% of quick follow-ups with no visible reason (16 of 89, 27 chats, mostly one DeepSeek model). So the fix helped, but the "after" sample is small. 16 misses is not enough to call 18% precise: it could plausibly be anywhere from about 10% to 28%.
- Pauses over 5 minutes miss about 60% of the time on OpenRouter. That is the provider's short memory, not a bug.
- The app does not record which company served each OpenRouter request, so "we got sent to a different company" cannot be told apart from other causes. I confirmed this in the code: no field for it exists in `providers/` or `harness/`.
- Compared with ChatGPT (4%) and Anthropic direct (1%), OpenRouter is the only provider with an unexplained gap.

### Card #148 (sessions stop early): a big lab was built, but the fix never landed

Source: worktree `worktrees/sessions/148-harness-performance-lab` (branch `session/148-harness-performance-lab`, pushed, backed up 2026-11-09 as `9bffe1cc9` workspace and `d6819233c` app). Its own index: `docs/active/plans/148-current-state.md` in that worktree.

- Original trigger: Destin, 2026-10-16, chat b55a ("Improving ASTRA Architectural 3D Models", GPT 6 Astra): assistant said a fix was "still underway"; nothing was running.
- 2026-10-17 to 22: about 90 helper chats in that worktree built an offline test lab for YouCoded's own engine (22 `lab-*.mjs` files, a `NativeSessionHost` runner, a fake model provider, 59 lab tests).
- Benchmarks run (paid, small): YouCoded vs Claude Code, Pi, OpenCode, Hermes, 90 attempts (87 passed), confirmed cost about 0.33 USD, plus estimated 0.71 USD for 19 requests where cost was not reported (`148-heldout-harness-baseline.md`). A 2-trial live calibration cost 0.0036 USD. The lab's own ledger said 5.20 of a 15 USD ceiling was used; the card and the work-inventory say 0.27 USD headroom under a 10 USD cap. These two numbers disagree and I did not open the ledger file (it sits next to credential files). Treat spending status as unknown until Destin or the lab session re-checks.
- The cause was found offline, not in the live app. Reproduced with fakes (`148-native-delivery-offline-reproduction.md`): a finished helper's or background command's report could reach the assistant only after later user messages, or be lost in a narrow timing window when a turn was ending (it then sat "idle with a report pending" until Destin typed again). That matches the symptom.
- The fix was built and passes its tests: the report now arrives at the next safe moment in the turn. 19 new always-on tests; 6 failed before the fix, 19 passed after, three repeats (`148-safe-boundary-delivery-fix.md`).
- Not done: it is not on master, is on a branch 785 commits behind (merge base `c6a18be4e`), nothing was shipped, and the lab notes say "live-incident attribution remains unproven". Nobody has watched a real model go from "helper finished" to "keeps working without a nudge" with the fix in.
- I checked master: no lab file (`lab-*.mjs`, `native-session-host-delivery.test.ts`) exists there. Master's later changes to `native-session-host.ts` (for example `8d2689881` background commands after restart, card #220) are different fixes. PR #716 (stuck "Running" labels) was for Claude Code chats, not native. So the early-stop problem is unchanged on master since Oct 16, as the card says.

### What is done, unknown

| | Done | Unknown |
|---|---|---|
| #69 | ChatGPT fixed and measured; Anthropic fixed and measured; OpenRouter fix shipped and measured on a small sample; summaries cheap; switch-model cost explained | Why OpenRouter misses 1 in 5 quick follow-ups (routing vs. the model's own host); local models with helpers |
| #148 | Cause found offline; fix built with tests; free detector for "stalled after helpers finish" built; one cheap live calibration | Whether this cause is what Destin saw live; whether the fix keeps a real model working; the fix is not on today's master; spend ledger status |

## 2. How a test would actually work

### OpenRouter cache test (card #69)
Plain version: we send the same short conversation to OpenRouter again and again, as the app would, and each time ask OpenRouter who answered and how much of the earlier text it re-used at the cheap price.

1. A throwaway copy of the app (a "dev copy", own folder, not Destin's live app) or a small script sends 4-message chats, using an OpenRouter key Destin lends for the run (the evaluator's rule: key handed over in a file, deleted after).
2. Each chat: message 1, wait a few seconds, message 2, 3, 4. Same wording style as real work and a realistic length (long enough that the cache matters; I suggest about 20,000 tokens of earlier text, not the 50,000+ of his real chats, to keep cost down).
3. Per reply, record: which company OpenRouter used (its reply includes this), how many input tokens were billed at the cheap rate, and whether the first answer's server equals the next one's.
4. Run on 2 or 3 cheap models (the one his chats use, DeepSeek flash, plus one more) with 20 to 40 chats each.
5. Good result: misses are rare (under about 5%) or every miss lines up with a change of serving company. That means fixable by telling OpenRouter to stay with one company (a visible-to-cost-only change). Bad result: misses with the same company each time. That is OpenRouter's own limit and not ours to fix.

Cost estimate (basis shown, prices are my estimate and must be checked on OpenRouter's public price list, which is free):
- Size from the earlier note: about 500 requests. At 20,000 tokens each that is 10 million input tokens.
- A cheap model at roughly 0.1 to 0.3 USD per million fresh input tokens: about 1 to 3 USD if nothing were cached, less with cache working. Likely 0.5 to 2 USD total.
- If the second model were a premium one (about 3 USD per million): 10 to 30 USD. So: cheap models only.
- Proposed cap: 5 USD, enforced by the run stopping itself (the evaluator already has `--max-spend`, re-checked against OpenRouter's own billing between runs). Dry run first (free) prints the number of requests and the estimate.

What can be learned free first:
1. Destin's OpenRouter account Activity page (openrouter.ai/activity) lists recent requests; I believe it names the company that answered and the cached share. He could look at the last 20 DeepSeek requests; if the company varies, that settles most of the 18% for 0 USD. Not verified by me.
2. A small app change (no visible effect) that writes the serving company next to each OpenRouter reply into the app's private diagnostics, like the ChatGPT cache log already does (`requests.jsonl`, summarised by `desktop/scripts/chatgpt-cache-summary.mjs`). A week or two of ordinary use then answers the routing question for free, with a much bigger sample than 132 follow-ups. This is the option I recommend.
3. Replaying recorded chats cannot answer it: a recording has the app's side only, and the cache lives on OpenRouter's servers.

### Early-stop test (card #148)
Plain version: ask a real model to do a job that needs a helper, then make sure the assistant keeps going by itself after the helper finishes, and count how often it does, with and without the fix.

1. Free, already built: the 19 delivery tests plus the lab's "no-nudge continuation" detector. They use a fake model, prove the report arrives, and flag it automatically when the assistant goes idle after a helper finishes. This part needs only bringing the work onto today's master (a rebase of a branch 785 commits behind; the notes warn not to rebase silently).
2. Paid, small: run a cheap real model in the lab's isolated copy on a scripted job ("start a helper to read X, then write Y into a file"). After the helper reports, a file must appear with no further user message. Do it 20 times on today's master and 20 times with the fix.
3. Measured: did the file appear without a nudge; seconds from helper finished to the next request; number of "still running" messages. Good: fix arm near 20 of 20, master arm shows the stalls. Bad: master also passes 20 of 20 (then the cause lies elsewhere, for example that one model), or the fix arm also stalls.
4. Cost basis from the lab's own records: a 2-trial real run cost 0.0036 USD; 90 five-app attempts cost about 1 USD together. Forty short trials on a cheap model: likely under 1 USD, at most 3 USD with helpers. Cap: 3 USD, stop on first overrun. The lab notes also say the original model (GPT 6 Astra) is not reproduced by a different model, so a clean result does not prove the live case is cured.
5. Also free and independent of the paid run: add a one-line record in the app when a turn ends while helpers or background commands are still pending. Then the next live occurrence leaves a trace.

## 3. Decisions this leaves for Destin
1. #69: OK the invisible diagnostics change (record which company served each OpenRouter reply) and wait 1 to 2 weeks, instead of paying for a run? Recommend yes. It answers the real question for 0 USD with a bigger sample; the paid run can still follow if the gap stays.
2. #148: land the already-tested safe-boundary fix onto current master (free engine work, own commits so it can be dropped), then decide on the 3 USD live check. Recommend yes to landing and the dev-copy check; hold the live check until the fix is on master.
