# Claude Code reliability experiments — results

status: active

Date: 2026-10-18. Scope: investigation only, no application implementation. App source inspected at `bc9e43752`; installed CLI exercised for plugin commands: **2.1.302**.

## Decisions preserved

The submitted deck approves tests for 1–3, 5–10, 12–13. Prioritize `/model`, `/clear`, `/compact`. Live-feed replacement (#4) remains held for consequence analysis. Cross-engine conversation continuity (#11) is separate exploration **#164**, related to #3 and #59; saved by the work-item tool to master at `c7075d4c`, with `cards: 111 ok`. **Agent SDK integration is rejected**, not a fallback for blocked mod tests.

## Item 7: official plugin management — ordinary lifecycle verified

Command:

```sh
python3 docs/active/investigations/2026-10-18-claude-mods-tests/plugin-management/check.py
```

Exit **0**. Evidence: `plugin-management/results.json`. The actual installed CLI ran against an inert skill in a local disposable marketplace; these were not mocked CLI results.

| Operation | Result |
|---|---|
| CLI version | 2.1.302, exit 0 |
| Validate local marketplace | Exit 0; two non-blocking fixture metadata warnings (description/author) |
| Add local marketplace, user scope | Exit 0, JSON `outcome: ok` |
| Install plugin | Exit 0, JSON identifies plugin and scope |
| List installed | One matching entry, `enabled: true`, version and paths reported |
| Disable then list | Exit 0; matching entry reports `enabled: false` |
| Enable then list | Exit 0; matching entry reports `enabled: true` |
| Uninstall then list | Exit 0; list is `[]` |
| Install nonexistent plugin | Expected exit 1; JSON `outcome: failed`, `failureCode: not_found` |

All six explicit result checks passed. This establishes a usable machine-readable happy-path management interface without writing Claude's four registration files ourselves.

**Isolation:** every CLI command used bubblewrap with network namespace disabled, host filesystem read-only and only the newly allocated temporary root writable. Environment was constructed from an allowlist, with new HOME/CLAUDE_CONFIG_DIR/XDG paths and no copied credentials. Temporary state was removed when the probe exited. No model requests were made.

### Follow-up: upgrade and scope handling

`python3 .../plugin-management/check.py --extended` subsequently exited 0 with **14 checks passed**. Evidence: `plugin-management/extended-results.json`; same network-disabled disposable-profile isolation.

- A local fixture upgrade from 1.0.0 to 1.1.0 returned `updateOutcome: updated`, old/new versions and an explicit restart-to-apply message. Listing confirmed 1.1.0.
- Project-scope installation in project A and local-scope installation in project B both succeeded, with their scope/path records preserved.
- Before installing in B, its listing included A's installed record but reported it disabled. After installing the same plugin locally in B, both records could report `enabled: true`: this is effective enablement of the plugin ID, not proof every displayed scope applies to the cwd. Preserve scope/projectPath semantics when building app discovery.
- Removing A's project installation preserved B's local registration **and its cached plugin manifest**. Removing the last scope yielded an empty list.

**Not established:** interruption recovery, concurrent installs, startup loading of installed code, hot application of updates, Windows/macOS/Android behavior, or compatibility with a different CLI build. These results support further testing, not app adoption approval.

## Item 4: history consequences — source analysis, not runtime proof

See `LIVE-HISTORY.md`. The narrow option keeps Claude's transcript and resume path untouched and changes only live observation. However, existing transcript events also drive naming, Welcome back tracking, metadata and durable mirroring; those are not renderer-only effects. In particular, a mod completion observed before disk persistence must not be mistaken for a durable resume checkpoint. Stable identity and catch-up comparisons are required before considering a switch.

No storage changes or cross-engine prototype were made.

## Current-build mod controls

Actual inline mod loading and control calls succeeded on CLI 2.1.302. Parent reviewed `evidence/REPORT.md`, the fixture, captured command/transcript evidence and cleanup record, then independently ran `node docs/active/investigations/2026-10-18-claude-mods-tests/probe/check-evidence.mjs`: exit 0, all captured-evidence assertions passed. This verification reads the recorded actual run; it is not a second runtime repetition.

| Operation | Observed result |
|---|---|
| Inline mod load | Worker loaded/admitted user-tier mod and emitted 2.1.302 type declarations |
| `/model sonnet` | Getter changed to `claude-sonnet-5-5`; every subsequent local API request used that model string |
| `/clear` | Conversation ID changed; separate synthetic transcript files existed |
| `/compact Keep the probe markers.` | Same conversation ID; scripted summary and on-disk `compact_boundary` |
| Direct sends | Repeated identical prompts, multiline Unicode and busy queued prompts reached the local scripted API / session history |
| Interrupt | Addressed turn abort produced completion reason `aborted` |
| Unknown command | Explicit rejection; CLI remained usable afterward |
| Discovery | 88 commands listed, including effort, fast, rename, resume, permissions, plan, rewind and reload-plugins; listing does not prove execution |

These are **actual CLI semantics against six scripted localhost API requests**, not a real model or subscription test. Compaction summary quality and model availability are not established. Both fake server and CLI ran inside the same network-disabled bubblewrap namespace. Child environment was allowlisted with dummy localhost authentication. Interactive children were deliberately stopped (exit 129); the driver and evidence checker exited 0. No matching temporary children remained in the recorded cleanup check. Profiles/logs are synthetic and preserved for inspection.

The standalone `claude plugin test` fixture was only a runner smoke (`2+2===4`), not evidence for these controls. The meaningful control evidence is the actual interactive run and its captured API/transcript outcomes.

**Important current-build distinctions:** `asUser: true` removes model-facing plugin framing but retains plugin provenance in transcript/hook data. It does not automatically expand pasted image/file syntax. Command results for model/compact were empty objects and clear returned `{text: ""}`, so success must be verified from resulting state, not a non-error return alone. Discovery also exposes internal/special-purpose commands such as `__remote-workflow` and `heapdump`; the list must not be treated as a ready-made safe app menu. Current completion events use a `reason` field, including `aborted`; do not copy older web examples as exact schemas.

### Compatibility replay: working CLI controls are not drop-in app replacements

`node docs/active/investigations/2026-10-18-claude-mods-tests/parser-check/check.mjs` exited 0 with assertions over the unchanged app parser and the actual synthetic CLI transcripts. The first attempt could not load absent `esbuild`; the probe was changed to use the already-installed TypeScript compiler in memory, without installing or editing dependencies.

- Both identical prompts and multiline Unicode were preserved as user-message events.
- The mod-issued `/model` transcript record had no `promptId`, so the current parser emitted **no command event** for it.
- The mod-issued `/compact Keep the probe markers.` was emitted as **ordinary user text**, not `slashCommand: true`. The summary itself was recognized.
- The `/model` output also said the model was saved as the default for new sessions. This command is therefore not established as a session-only setting change.

These are observed parser-level compatibility gaps, not a reproduced UI failure and not fixes to implement without review. They show why keeping existing history while adopting direct controls still requires explicit command-result/state integration. No app code was changed.

## Second batch: failure behavior and image boundary — completed

Evidence: `evidence/failure-attachment-report.md`, `failure-run.json`, `attachment-run.json`. Parent independently reran `probe/failure-attachment-check.mjs /tmp/cc-mods-second-TLiCmv/first-evidence-hashes.json --check-only`: exit 0. The worker had finished; no probe processes were still running when the user asked. This command verifies saved actual-run evidence, not a new runtime repetition.

- An observer throwing before `next` without `.catch` was skipped. The safe Write ran under the temporary profile's existing Write allowance. This did **not** bypass all Claude permissions: normal policy continued.
- An explicit catch returning deny blocked Write after an ordinary throw; no output file existed and the fake model received the denial.
- A cooperative own-budget wait timed out at 10 seconds; explicit catch deny blocked Write. The turn lasted about 10.12 seconds. This is not an external-call wait test.
- Image metadata pointing to an existing valid 70-byte PNG was accepted by prompt.submit, but the local model API received **zero image blocks**. No user-tier pixel-import path has been established. Do not call direct image sending supported.
- All three failure-test turns ended; both local servers closed; saved checks found no matching temporary children. Seven dummy-auth local API requests, no paid model calls. First-batch evidence hashes remained unchanged.

## Third batch: external approval waits — completed

Evidence: `evidence/approval-report.md`, `evidence/approval-batch2/`. Parent reviewed report/checker and independently ran `probe/approval-check.mjs`: exit 0.

- A real `tool.check` awaited a localhost approval-service response for **12 seconds**. Hook elapsed 12042 ms while 9997 ms of its 10000-ms own-execution budget remained. The safe Write then produced exact expected bytes.
- Explicit deny, connection refusal and accepted-then-reset connection all reached deny outcomes; corresponding files were absent and model-facing results carried the actual refusal.
- This run's underlying policy already allowed Write. It demonstrated an external veto/wait over that allowance, **not replacing an ordinary ask**. That gap is addressed separately below.
- Eight dummy-auth requests to the local scripted model API; both servers closed; exact CLI child deliberately stopped; no remaining sandbox processes. No production permissions changed.

## Fourth batch: more controls and underlying ask — completed

Evidence: `evidence/control-followup/REPORT.md`, `run.json`, `launch.json`. Parent read checker and ran `probe/control-followup-check.mjs`: exit 0, **35 checks passed**. App source remained clean and process inspection found no matching approval/control probes running.

| Case | Actual observation |
|---|---|
| `config.set(permissionMode=plan)` | Returned plan; config list confirmed; temporary settings persisted `permissions.defaultMode: plan` |
| Restore permission default | Returned/default list and temporary file agreed |
| `/effort low` | Per-model effort setting persisted; all four subsequent fake-model requests contained low effort |
| `/rename` | Synthetic title recorded in transcript `custom-title` rows with unchanged session ID |
| Underlying ask → external allow | Default mode, **no Write allow rule**. Actual underlying verdict was ask; path-specific synthetic external allow produced expected file and model success |
| Underlying ask → external deny | Actual underlying ask; explicit external denial left no file and reached model as error |

**Important mode caveat:** config exposes *Default permission mode*. These assertions establish persistent default configuration, not verified enforcement of a changed mode in the active session. No distinct active-main-loop mode/model setter was established by this inspection. `/plan` was listed but not exercised.

Four dummy-auth local model requests, same strict bubblewrap network/PID/filesystem isolation, no SDK or real credentials. All owned child processes/servers stopped. Low effort and synthetic rename persisted only in the disposable test profile.

## Fifth batch: questions, plans and stale approvals — completed

Evidence: `evidence/interaction-followup/REPORT.md` plus `interaction-batch/`, `interaction-batch2/`, `interaction-followup/`. Parent reviewed report/checker and ran `probe/interaction-check.mjs`: exit 0. Its assertion count varies with process-scan rows (3618 on parent verification); this is **11 actual isolated CLI sessions and 32 local scripted model requests**, not thousands of independent behavioral scenarios.

- **Questions:** permission allow alone leaves the native question menu pending. A documented tool.call interceptor can instead return explicit synthetic external answers in the built-in output shape. Single-select, multi-select, custom Unicode/multiline text and separate freeform response were verified in model-facing text and saved tool records. This replaces the interaction, not native dialog submission. A freeform `response` takes precedence over structured `answers` in model-facing text when both are supplied; do not accidentally combine them.
- **Plans:** actual EnterPlanMode plus engine-authorized plan Write/Read succeeded. External allow on ExitPlanMode left the native plan menu pending. Explicit exit denial retained plan-mode restrictions. Returning a valid-looking ExitPlanMode result without executing the engine transition told the model it was approved **while actual Write policy still reported plan mode**. This is a deliberately tested hypothetical replacement mismatch, not a production-app bug. No successful direct external plan approval was established.
- **Late replies:** abort addressed the actual pending turn. A new, distinct Write request then waited while the old service attempted a late allow. The old response connection had already closed; the new request received its own deny. Neither file existed and both actual tool results were errors. This verifies one cancellation/late-response case, not arbitrary reconnect or multi-client races.
- **Reload:** documented reload-plugins was requested while approval waited but returned only after the allowed Write and turn finished. It cannot be counted as a test of mid-flight mod unloading. Worker death/removal safety remains open.

All owned children/servers stopped; prior evidence and binary preserved; app source clean. No subscription calls, SDK, personal configuration changes or app implementation.

## Remaining gates before any app implementation decision

- Successful image/pixel transport (the tested metadata path failed to carry pixels).
- Genuine external engine plan approval; current allow/replacement attempts are not equivalent to the native plan decision.
- Real question-card integration, permission denial precedence across policies, two clients answering together and broader stale-reply/reconnect cases.
- Long approval waits beyond the HTTP ceiling, cancellation, bridge reconnect, worker unload/death, and catch failure. Twelve seconds is not an indefinite-wait guarantee.
- Active-session permission mode enforcement versus changing a default.
- Initial/reopened chat, compaction and resume parity with existing app readers; two concrete command-record compatibility gaps are already recorded above.
- Marketplace-installed mod loading versus inline loading, update interruption/concurrency and full skill discovery across scopes.
- Windows/macOS/Android and real subscription behavior.

No app changes are approved or implemented. Live-feed replacement remains held; cross-engine portability remains separate #164. All completed evidence is from source/types, parser replay or actual isolated CLI against local scripted replies—not subscription/model-quality proof.
