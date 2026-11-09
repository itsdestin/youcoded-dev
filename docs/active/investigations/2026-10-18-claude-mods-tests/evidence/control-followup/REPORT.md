# Control follow-up: actual isolated CLI 2.1.302

One actual run; no SDK, app implementation, paid service, credentials, installations, dependency modifications, rollout changes or managed-policy overrides. All controls originated in the mod; no PTY keys were sent.

## Results and exact contracts

- `await $.config.set({key:'permissionMode',value:'plan'})` returned `{value:'plan'}`. `(await $.config.list()).find(r => r.key === 'permissionMode')` returned value `plan`; the row label is **Default permission mode**. The temporary `CLAUDE_CONFIG_DIR/settings.json` persisted `permissions.defaultMode: 'plan'`. Setting `value:'default'` returned `{value:'default'}` and restored both list and file. This proves a persisted default setting, **not** active-session transition into plan mode or enforcement while in plan mode. Those were not separately exercised.
- `await $.command.run({command:'effort',args:'low'})` returned `{}`. The temporary settings persisted `modelSettings['claude-opus-5-5'].effortLevel: 'low'`. All four main fake-model requests then carried `output_config: {effort:'low'}`.
- `await $.command.run({command:'rename',args:'SYNTHETIC_CONTROL_control-state-PLiNx0'})` returned a context reminder naming that title. The same session id, `138f8800-7ea2-4af2-ac92-cf94774e323d`, gained `type:'custom-title'`, `customTitle:<title>`, `sessionId:<same id>` records in its actual JSONL file. Repeated title records are preserved, not deduplicated away.
- Emitted declaration sections for `session`, `config` and `command` were inspected. The verified read contracts are `$.session.model(): Promise<string>` and `$.config.list(): Promise<ConfigRow[]>`; config exposes list/set, not a separate get. No distinct direct main-loop model/mode setter was discovered in those sections. Do not infer one from subagent permission/model fields. `/plan` was discoverable in command.list but not exercised. Existing `/model` evidence remains separate and untouched.
- Under ordinary default mode and **no Write allow rule**, both real `tool.check` calls returned core `{decision:'ask', reason: ...haven't granted it yet}` from `await next(e)`. Only these exact two synthetic project paths could obtain an external response. Localhost returned allow for `external-allow.txt`: actual file contains `SYNTHETIC_external-allow\n`; model received `File created successfully at: .../external-allow.txt`. Localhost returned deny for `external-deny.txt`: file absent; model received `is_error:true` with `Permission to use Write denied by plugin isolated-control-followup: Explicit synthetic external deny for this one disposable file`. Both turns completed. This extends veto-of-allow evidence to ask→allow and ask→deny, not managed-policy bypass or a finished approval UI.

## Commands and verification

From the session workspace:

```sh
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/control-followup-probe.mjs --launch
```

Actual final output: `{"exit":0,"preserved":true,"remaining":[]}`. The full exact bwrap command and environment are in `launch.json`; exact CLI commands and child environment in `run.json`.

```sh
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/control-followup-check.mjs
```

Actual output: `PASS 35 checks: controls, persisted settings/title, core ask → external allow/deny, model results, isolation, cleanup, preservation.` This checker is read-only and repeatable. `node --check .../probe/control-followup-probe.mjs` also exited successfully without output. New-file diffs were read back; git diff --no-index exit 1 means differences, not test failure.

## Isolation, effects and cleanup

Sandbox `/tmp/cc-control-followup-UeqnRF`; isolated state `/tmp/cc-control-followup-UeqnRF/control-state-PLiNx0`. New HOME/config/project, strictly allowlisted env and dummy localhost auth. bwrap used read-only host, writable sandbox/evidence only, `--unshare-net --unshare-pid --clearenv --die-with-parent`. No credential files were copied/read by the probe. Host profiles were not modified. Prior investigation-file SHA256 checks all matched.

Exact owned PTY child was stopped (`childExit:{exitCode:129,signal:0}`); fake API and approval servers closed; PID namespace terminated remaining namespace children. Post-exit sandbox command-line process scan: `[]`. Disposable files are retained for inspection; mode restored to default, low effort and synthetic title intentionally remain only in the temporary profile/transcript. No cross-process resume, real-provider effort support, plan-mode enforcement, long external wait, concurrency or user/managed denial override claim is made here.
