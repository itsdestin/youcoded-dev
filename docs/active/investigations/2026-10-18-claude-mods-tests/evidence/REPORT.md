# Installed CLI mod controls: isolated test evidence

## Result

**Actual unmodified installed Claude Code 2.1.302 successfully loaded a disposable user-tier mod through `--plugin-dir`.** No rollout override, managed-policy change, credential copying, Agent SDK, package install or app edit was used. This proves this inline path in this fresh offline profile, not marketplace-installed plugin availability or authenticated-profile rollout behavior.

`controls-debug.log` records `hooks module isolated-mod-contract@inline loaded (worker, environment 1, tier user)` (line 161), admission (172), generated type files (246), real compaction API request (517), and successful `$.turn.abort` (576). No rollout refusal occurred in these runs. Merely finding rollout-off strings in the binary is NOT evidence that this run was gated.

## Commands and exit codes actually observed

Work root: `/home/destin/youcoded-dev/worktrees/sessions/cc-reliability-options`.

1. `cd youcoded/desktop && node -e "const p=require('node-pty'); console.log('node-pty loaded; spawn='+typeof p.spawn)"` — exit 0, `node-pty loaded; spawn=function`. An earlier import-resolution check from the workspace root returned `ERR_MODULE_NOT_FOUND` (exit 1); component-scoped resolution and native loading succeeded. No dependency repair was needed.
2. `node docs/active/investigations/2026-10-18-claude-mods-tests/probe/mods-probe.mjs` — exit 0. Isolated `--version`, `plugin --help`, `plugin validate --help`, `plugin test --help`, `--help` all returned exit 0. Version output: `2.1.302 (Claude Code)`. See `discovery.json`.
3. Loading-only namespace run: `bwrap --ro-bind / / --bind "$sandbox" "$sandbox" --bind "$evidence" "$evidence" --dev /dev --proc /proc --unshare-net --die-with-parent --setenv TMPDIR "$sandbox" -- /usr/bin/node "$probe" --interactive` — exit 0. `$sandbox=/tmp/cc-mods-netns-Te9erZ`, `$evidence=<investigation>/evidence`, `$probe=<investigation>/probe/mods-probe.mjs`. Plugin validation exit 0. Initial intentionally empty test fixture exit 1: `it declares no test(): nothing ran`; it is not a mod-runtime failure. CLI loaded successfully and generated types; zero API requests. Preserved in `interactive.json` and `loading-debug.log`.
4. Controls namespace run used the same command plus `--controls`, `$sandbox=/tmp/cc-mods-controls-ICGXX8` — driver exit 0. Plugin validation exit 0; only warning was missing optional author metadata. `claude plugin test <temp-plugin>` exit 0, output:

   ```text
   (pass) offline test runner smoke only [3.73ms]
    1 pass
    0 fail
   Ran 1 test across 1 file. [0.19s]
   ```

   That test only asserts `2+2===4`: it establishes test-runner availability, **not** stubbed or actual command semantics. Actual semantics below come from the interactive CLI, not that test.
5. `node docs/active/investigations/2026-10-18-claude-mods-tests/probe/check-evidence.mjs` — exit 0:

   ```text
   PASS: actual CLI loading/control evidence; model, clear, compact, repeated/Unicode/busy sends, expected unknown-command refusal, abort, six dummy-auth requests, and server cleanup assertions.
   ```

Both interactive child exits were 129 because the driver deliberately stopped its exact disposable PTY child after collecting evidence. They were not normal CLI shutdowns. Server `.close()` completed; post-run `/proc` scan found no command argument starting with either probe's temporary root (`cleanup.json`).

## Actual live CLI outcomes (local scripted API only)

| Control | Outcome | Observed evidence |
|---|---|---|
| `$.command.run({command:'model',args:'sonnet'})` | PASS | Model changed from `claude-opus-5-5` to `claude-sonnet-5-5`; all six subsequent API requests used the latter. Result was `{}`, so getters/request evidence matter. |
| `$.command.run({command:'clear'})` | PASS | Session ID changed from `29da9fd2-b22e-4da2-8723-d8d9777daad5` to `756fd956-8200-4a1b-bf20-6cf80766220f`; separate synthetic JSONL files existed. New in-memory messages retained a `/clear` command row, not an empty array. |
| `$.command.run({command:'compact',args:'Keep the probe markers.'})` | PASS | Fake summary reply `LOCAL_SCRIPTED_REPLY_4` appeared in continued-conversation summary, terminal reported `Compacted`, on-disk `compact_boundary` recorded; session ID stayed unchanged. Result was `{}`. Summary quality is not tested. |
| `$.prompt.submit({text,asUser:true})` | PASS | Actual API and session messages contained two distinct `repeat exact` sends, multiline `line one\n第二行 café 🧪`, and `queued while busy`, in order; four answered turns. Two sends were queued while the delayed first turn ran. |
| `$.turn.abort({turnId})` | PASS | Successful cancellation log and `turn.complete` reason `aborted`; API request cancellation logged. |
| Unknown command | Expected rejection | `HooksError: isolated-mod-contract: $.command.run: no command named /does-not-exist-probe in this session`; CLI subsequently accepted and aborted another turn. |
| `$.command.list()` / `$.config.list()` | PASS, discovery only | 88 commands listed; configuration keys recorded. Listing is not proof the other controls execute. |

See `controls.json` for complete mod-returned values and bounded synthetic API bodies; `controls-summary.json` for command names, request models/auth checks and narrow transcript boundary facts. Alternatives discovered include `autocompact`, `context`, `config`, `effort`, `fast`, `rename`, `resume`, `rewind`, `permissions`, `plan`, `reload-plugins`, `reload-skills`, `status`, `usage`. They were **not executed**.

Not exercised: images/attachments, default framed sends without `asUser`, stale turn IDs, direct `$.session.compact`, direct `$.session.send` peer delivery, configuration mutation, ordinary hook failure, hot unload/recovery, resume/reconnect, real subscription/model behavior. No security or exactly-once guarantee follows from these happy paths.

## Current generated contracts (not guessed APIs)

CLI wrote these into **only the disposable plugin**, and evidence copies are preserved:

- `generated-claude-code.d.ts`: exact emitted core + testing declarations, starts `// Written by Claude Code 2.1.302.`
- `generated-claude-code-tools.d.ts`: this session's tool declarations.
- `generated-claude-code-mcp.d.ts`: this session's MCP declarations.

Key signatures from the core declarations:

```ts
Register = (on: On, options: PluginOptions) => unknown;
// Hooks: on('session.start', ($, e, next) => ...), similarly turn.start/turn.complete.
$.command.list: () => Promise<CommandInfo[]>;
$.command.run: (input: CommandRunArgs) => Promise<CommandRunResult>;
// CommandRunArgs = { command: string; args?: string }
// CommandRunResult = { text?: string; context?: readonly string[]; exitCode?: number; ref?: number }
$.prompt.submit: (input: PromptSubmitArgs) => Promise<PromptSubmitResult>;
// Required text: string; optional attachments: readonly PromptSubmitAttachment[]; asUser?: true.
// PromptSubmitResult: { text, context?, origin? } | { drop: string }.
$.turn.abort: (input: OpEventOf['turn.abort']) => Promise<void>; // { turnId: string }
$.session.compact: (input?: SessionCompactArgs) => Promise<SessionCompactResult>;
// { instructions?: string } => { messages, tokensBefore?, tokensAfter?, usage? } | { skip: string }
$.session.id: () => Promise<string>;
$.session.model: () => Promise<string>;
$.session.messages: SessionMessagesCall;
$.session.send: (input: SessionSendArgs) => Promise<SessionSendResult>; // peer delivery, NOT user prompt submission
$.config.list: () => Promise<ConfigRow[]>;
$.config.set: (input: ConfigSetArgs) => Promise<ConfigSetResult>;
// { key: string; value: ConfigValue } => { value: ConfigValue; deny?: undefined } | { deny: string; value?: undefined }
```

Exact definitions and detailed rejection/queue semantics remain in the emitted file: command args/results lines 1814–1905; session/prompt/turn methods 2791–3081; command/config methods 3139–3205; prompt args/results 9371–9544; Register 9713; compact args/results 11172–11275; session.start input/result 12159–12182. `$.session.compact` declarations say it rejects during a running turn. `$.command.run` is documented as queued until idle and rejected within a hook the turn waits on. Probe controls ran from a deferred `$.clock.after` callback instead, so no terminal send/menu automation or engine-blocking hook nesting was involved.

## Isolation and cost

- Reused `makeIsolatedRoot`, `resolveClaude`, `sleep`, `stripAnsi`, `startFakeApi` and `fakeApiEnv` from existing test-conpty helpers; deliberately did not call their credential-copy or broad environment inheritance helpers.
- Strict allowlisted CLI child environment is recorded verbatim: fixed PATH/TERM/locale; new HOME, CLAUDE_CONFIG_DIR, TMPDIR and XDG directories; updater/telemetry/error reporting disabled; nonessential-traffic opt-out; interactive runs add **only** localhost base URL and known dummy auth token. No inherited real provider credentials, app pipe/session identity or desktop IDs.
- Both fake server and CLI ran inside the same `bwrap --unshare-net` namespace, filesystem read-only except the new temporary sandbox and dedicated evidence directory. External marketplace bootstrap attempts failed (logged); no network-policy or rollout bypass was used.
- Six scripted `/v1/messages?beta=true` requests, all verified dummy auth, were recorded by the local fake server. No real model/subscription request was authorized or made by these runtime tests. CLI cost labels reflect fake usage, not billing.
- No app source, installed plugin, personal configuration, PLAN.md, RESULTS.md or card was changed; no commit or push. Temporary profiles remain available at the recorded roots, with no matching children/listeners left. Installed binary resolved to `/home/destin/.local/share/claude/versions/2.1.302`; SHA-256 in `cleanup.json`.
