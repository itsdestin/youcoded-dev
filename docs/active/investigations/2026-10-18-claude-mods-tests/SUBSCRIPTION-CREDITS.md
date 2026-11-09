# Real subscription/credits smoke — two remaining prompts passed

status: active

## Authorization

After the initial weekly-limit refusal, the user added $5 in Claude usage credits and authorized continuing the **two remaining short Haiku prompts**. The $5 was not treated as a test spending allowance. Total authorized prompt attempts remained three across both runs: one quota-blocked attempt, then these two completed turns.

The user signed in again through `claude auth login --claudeai` in a separate native terminal and fresh private profile. Claude's own status reported `claude.ai`, `firstParty`, `max`. No credential file was read/copied by the scripts; no Agent SDK, API key, account billing setting change or auto-reload configuration was used.

## Actual results — CLI 2.1.302, real Haiku

1. Inline mod loaded in the authenticated profile and directly submitted the first short prompt. Actual `claude-haiku-5-5` returned exactly `SUBSCRIPTION_PROBE_TWO_73`.
2. The owned CLI was stopped, then reopened with supported `--resume` and the **same conversation ID**. The mod loaded again and submitted the second prompt. Actual Haiku returned exactly `café 第二行 🧪`.
3. Each phase reported one successful answer, model usage and an empty tool list. No model tools or subagents were available; MCP config was empty/strict and prompt suggestions disabled.
4. Both prompts and both assistant replies appeared **once each** in the saved transcript after process exit. The resumed session's messages contained the same four entries; no duplicate history was observed in this short smoke.
5. The controller issued exactly two prompt grants. Combined with the previous blocked attempt, the three-attempt authorization was fully consumed. There were no automated retries of submitted prompts.

**Durability detail:** the resumed phase's immediate snapshot contained the new user message but not yet the final assistant row. A separate post-exit read confirmed all four rows. This reinforces that completion/live visibility is not the same as observing disk persistence; no extra model call was made for that check.

## Cost and limits

The CLI's final cumulative session estimate was **$0.00065598**, under one cent. This is the CLI estimate, **not a verified debit from the user's credit balance**. The account's weekly-usage report remained at 100% while the real replies succeeded after the user's credit top-up.

This proves a narrow real authenticated inline-mod send/response/resume path on Linux, not ordinary included-quota behavior before exhaustion, marketplace-installed mod loading under this account, image transport, real approvals/plans, crash recovery, other platforms or production-app integration. Earlier fake-API findings retain their stated limits.

## Verification and cleanup

Executed:

- `node .../probe/subscription-probe.mjs --launch --credits` → exit 0, both phases completed.
- `node .../probe/subscription-credits-check.mjs --capture` → exit 0; persisted synthetic chat rows saved separately before cleanup.
- `node .../probe/subscription-cleanup.mjs --credits` → exit 0; controller closed, no remaining test-profile processes, signed-in temporary profile removed without reading credentials or global logout/revocation.
- `node .../probe/subscription-credits-check.mjs` → exit 0 after cleanup; repeatable saved-evidence verification.
- App checkout status stayed clean.

The command prefix is `docs/active/investigations/2026-10-18-claude-mods-tests/` from the session workspace. Evidence is under `evidence/subscription-credits/`: `run.json`, `launch.json`, `prompt-budget.json`, `post-exit-messages.json`, `cleanup.json`. Only redacted auth status and synthetic test messages are retained. No further credit-funded run is authorized by this completed allowance, and no app implementation has been approved.
