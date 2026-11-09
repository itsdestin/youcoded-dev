# External approval waits — actual isolated CLI results

Unmodified installed Claude Code **2.1.302**, real CLI plus user-tier disposable mod, scripted localhost fake model API. No SDK, real credentials, paid requests, app implementation, live-app experiments, managed policies or rollout overrides.

## Verified results

The temporary profile used exactly `{"permissions":{"defaultMode":"default","allow":["Write"]}}`. Every real model Write's underlying `await next(e)` verdict was **`{decision:"allow",rule:"Write"}`**. The `tool.check` hook then awaited `$.http.fetch` and returned a separate external verdict. **No ordinary permission dialog was answered or needed.** Allowlisting this synthetic tool is ordinary temp-profile policy, not bypass mode. This setup establishes vetoing an underlying allow; it does not test replacing an underlying ask dialog.

| Case | Actual external decision / timing | Actual effect and model-facing result |
|---|---|---|
| Allow after 12 seconds | Local approval service held response **12000 ms**; hook elapsed **12042 ms**; hook own budget **10000 ms**, remaining **9997 ms** after response | Only `approval-allow12.txt` created, exact bytes `SYNTHETIC_approval-allow12\n`; fake model received successful Write tool result. Whole turn **12361 ms**. |
| Service deny | Hook returned `{decision:"deny",reason:"External approval-deny deny"}` after **34 ms** | File absent; model received `is_error:true`, permission denied by the mod, exact external deny reason. Whole turn **162 ms**. |
| Unreachable service | Fetch rejected with **ECONNREFUSED**; explicit registration `.catch` returned `{decision:"deny",...}` | File absent; model received explicit external approval error denial. Whole turn **170 ms**. |
| Service accepts then disconnects | Server destroyed accepted socket; fetch rejected with **ECONNRESET**; explicit `.catch` returned deny | File absent; model received explicit external approval error denial. Whole turn **284 ms**. |

Both catches recorded `next.called:true`, `next.error.kind:"throw"`, grace budget **1000 ms**. Here `next` had **only decided permission**, not executed the tool: `tool.check` permits a deny after that underlying verdict. This is distinct from trying to undo a completed `tool.call`.

Four `turn.complete` events had reason `answer`. Eight main fake-model requests consumed exactly eight scripted responses (Write + final completion per case); four distinct tool results were verified from actual follow-up API requests. All requests carried the known dummy localhost token.

### Permission-mode inspection

Actual `$.config.list()` exposed `permissionMode`, label **Default permission mode**, value **default**, unlocked, choices **default, plan, acceptEdits, auto, dontAsk**. This proves the getter/list surface in this session, not setting or persistence behavior. No `config.set`, effort or rename command was executed; optional controls were left out to keep the approval batch bounded. Temp `settings.json` was unchanged and re-read by the checker.

### Limits

- **12 seconds is not indefinite or two hours.** The host HTTP wait did not consume this hook's 10-second own-execution budget. This run stayed below the anticipated HTTP 30-second ceiling but neither measured that ceiling nor tested HTTP timeout/reconnection/polling.
- Ordinary fetch failure plus explicit catch-deny is not evidence of fail-closed behavior after worker unloading, process death, missing mod, or a catch that itself fails. None was induced.
- Fake API results do not establish subscription availability, real provider behavior, account entitlements or billing. No model request left the isolated network namespace.

## Evidence and reproduction

New files only:

- `probe/approval-fixture.ts`: generated-contract `tool.check` hook, external HTTP gate and explicit error-denial handler.
- `probe/approval-probe.mjs`: disposable launcher/driver; reuses existing node-pty and fake-Anthropic helper, installs nothing. `--launch <new-approval-name>` refuses existing evidence directories.
- `probe/approval-check.mjs`: **read-only repeatable checker**, no CLI launch and no evidence rewriting.
- `evidence/approval-batch2/approval-run.json`: full environment allowlist, exact CLI command, version/validation exit codes, real hook events, service timings, model requests/results, file hex bytes and paths, original/final policy, child exit, matching network-namespace IDs.
- `evidence/approval-batch2/approval-launch.json`: exact bubblewrap argv and environment, launch exit **0**, duration, before/after hashes, no remaining sandbox processes.
- `evidence/approval-batch2/approval-debug.log`: bounded actual CLI debug log.
- `evidence/approval-batch/approval-launch.json`: retained first failed launch, exit **1**. The strict allowlisted PATH lacked `claude`; no CLI/model ran. Second launch used the executable already observed in prior evidence, `/home/destin/.local/bin/claude`. No real HOME/config was used.

From the assigned work root, executed:

```sh
node --check docs/active/investigations/2026-10-18-claude-mods-tests/probe/approval-probe.mjs && node docs/active/investigations/2026-10-18-claude-mods-tests/probe/approval-probe.mjs --launch approval-batch2
```

Exit **0**. Output included four completed rows, the single allowed file with exact hex, all three denied files absent, eight requests, `childExit:{exitCode:129,signal:0}`, `serversClosed:true`, then:

```text
bwrap exit=0 signal=null; preserved=true
```

Both CLI version and plugin validation commands exited **0**; plugin validation reported the declared `tool.check{tool=Write}` gate with catch. The PTY child exit **129** was an intentional driver stop after collection, **not normal CLI shutdown**.

```sh
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/approval-check.mjs
```

Exit **0**, repeatedly. Actual verified output (final wording):

```text
PASS real CLI 2.1.302: allow after 12000ms service wait; hook elapsed 12042ms, own budget remaining 9997ms; exact temporary file bytes confirmed.
PASS deny/refused/disconnect: underlying allow(Write) overridden by deny; all three files absent; four distinct model-facing tool results verified.
PASS isolation/cleanup: 8 dummy-auth local requests, same network namespace, both servers closed, CLI deliberately stopped (129), no owned children; 30 prior files unchanged during launch; immutable probes/evidence still match.
PASS config inspection: permissionMode=default, unlocked, options=default,plan,acceptEdits,auto,dontAsk; no config set or effort/rename executed.
PASS failed attempt preserved: allowlisted PATH lacked CLI; explicit observed binary path used on second launch. Checker performed no writes.
NOTE lifecycle docs changed after completed launch (not immutable evidence): RESULTS.md. Before/after-launch hashes remain equal.
```

The first checker attempt exited **1** on a current-file hash assertion: `RESULTS.md` changed **after** the completed launch (its recorded before/after-launch hashes are equal). The checker was corrected to distinguish parent-owned mutable lifecycle docs from immutable old probes/evidence; it still asserts every captured before/after-launch hash and current old probe/evidence hashes. No old evidence was changed to make the assertion pass. This child did not edit `RESULTS.md` or any other lifecycle doc. A later combined diff-review/check command also exited **1** because its own parent shell named the temp path and was misidentified as an owned child. The checker now excludes only its own ancestor PIDs from the command-line scan (they cannot be descendants of the already completed separate launch); the namespace/child-exit/server-close evidence remains required. No arbitrary process environment or credential was inspected.

## Isolation and cleanup

The launcher created new `/tmp/cc-mods-approval-CAjh8T`; actual profile/project state is `/tmp/cc-mods-approval-CAjh8T/approval-state-LjY7n8`. Both are retained only for read-only checks. The failed-attempt temp root is recorded separately in its launch JSON.

Bubblewrap mounted the host **read-only**, with only the new temp sandbox and dedicated `evidence/approval-batch2/` writable, plus private `/dev` and `/proc`; used `--unshare-net`, `--unshare-pid`, `--die-with-parent`, `--clearenv`. Fake model API, approval service and CLI shared the same isolated network namespace. CLI environment was an explicit allowlist: fresh HOME/CLAUDE_CONFIG_DIR/TMPDIR/XDG paths, fixed PATH/locale/TERM, disabled telemetry/updater/nonessential traffic, and localhost dummy auth only. Full values are recorded, not inherited provider credentials.

The driver stopped its exact PTY child, awaited its exit, and closed both owned HTTP servers. PID-namespace exit additionally kills remaining namespace descendants; the host-side process scan found **no processes referencing the allocated sandbox** after either launch. Repeated checker scans confirmed no owned children. All 30 tracked preexisting probe/evidence/lifecycle files had matching before/after-launch SHA-256 hashes; current immutable probe/evidence files still match. No app-source edit, real policy modification, global installation, commit or push.
