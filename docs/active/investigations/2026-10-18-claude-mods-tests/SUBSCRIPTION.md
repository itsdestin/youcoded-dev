# Real subscription smoke test — blocked by weekly quota

status: active

## Authorization and isolation

The user authorized at most **three short Haiku prompts** through their Claude subscription. A fresh private test HOME/config/XDG was created. The user completed `claude auth login --claudeai` directly in a separate native terminal; authorization codes did not pass through chat. Claude's own auth-status command confirmed `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`, `subscriptionType: max`. No credential file was read/copied by the investigation scripts; no API key or Agent SDK was used.

The real test intentionally allowed network access for official Claude authentication/inference. Filesystem/PID isolation, a cleared allowlisted environment and a private runtime directory remained. Model tools were disabled, MCP configuration empty/strict, prompt suggestions disabled. A local controller reserved prompt tickets before submission and enforced a total cap of three; submitted prompts were not automatically retried.

## Actual outcome

CLI **2.1.302** loaded the inline user-tier mod in the authenticated profile. The mod handshake succeeded, reported `claude-haiku-5-5` for the requested Haiku alias, and verified an empty tool list. Exactly **one** direct prompt submission started a turn.

The turn ended with `reason: error`, empty answer and no reported model usage. Claude recorded a synthetic assistant message:

> You've hit your weekly limit · resets Oct 21, 7am (America/Phoenix)

The driver stopped. **The remaining two prompts and resume phase were not attempted.** This establishes authenticated mod loading/direct submission and handling of the native quota refusal—not a successful real-model response, billing result or subscription resume test.

## Verification and cleanup

- `node probe/subscription-probe.mjs --launch` (full workspace-relative prefix as other probes): exit 1, expected unsuccessful smoke outcome preserved.
- `node probe/subscription-cleanup.mjs`: exit 0; verified one attempted prompt, two not sent, controller closed, no remaining profile processes and removal of the temporary signed-in profile.
- App checkout status remained clean. No global logout/revocation or real-profile modification was performed.

Evidence: `evidence/subscription/run.json`, `launch.json`, `prompt-budget.json`, `cleanup.json`. These hold redacted auth status and synthetic test content, not credentials. The profile marker records its now-deleted location. No additional run is scheduled; finishing requires available quota and another official sign-in to a fresh isolated profile.
