# Production Claude control bridge runtime smoke

status: active

## Scope and invocation

New standalone harness: `youcoded/desktop/test-conpty/test-claude-control-bridge.mjs`.
From `youcoded/desktop`:

```sh
node test-conpty/test-claude-control-bridge.mjs --no-auth --out /ABSOLUTE/NEW/DIRECTORY
```

The output directory must not exist and its parent must exist. Omitting `--out` chooses a unique temporary directory. Add `--cached-model` to positively verify pending native cost confirmation, explicit legacy-user ESC cancellation and subsequent direct-control recovery. No flags enable real authentication.

The runner imports `dist/main/claude-control-bridge.js` directly and launches the unmodified native CLI `/home/destin/.local/share/claude/versions/2.1.302` with the plugin arguments returned by production `prepare`. It uses `fake-anthropic.mjs` and only `stripAnsi`/`sleep` from `cc-capture-lib.mjs`; no credential-copying or broad-environment helpers.

Bubblewrap clears the environment and creates new network/PID namespaces. Host files are read-only; only this run's directory/private temporary directory are writable. HOME/config/project are fresh. API authentication is the dummy literal `localfakeAPI`. There are no terminal control writes, SDKs, installs, real account/model/subscription calls, or live-app interactions. Cached mode makes exactly one deliberate test-user ESC write to cancel the native confirmation; this is retained legacy user interaction, NOT fully structured approval. A tiny observer plugin only records engine `turn.complete`; it does not invoke controls.

## Final-code follow-up: baseline and cached cancellation both pass

Parent explicitly preserved native cost confirmation rather than bypassing it. The harness now verifies its pending state and dismisses it with exactly one explicit test-user ESC, then verifies the getter and subsequent API request remain on the previous model. A further direct model command and all remaining controls succeed. If this case fails, the harness stops rather than reporting seven cascading errors.

Rebuilt once successfully from `youcoded/desktop` with `npm run build:main` (output: `node scripts/generate-preload-channels.mjs && tsc`). An initial invocation from the workspace root exited 254 for missing package.json before any build ran; rerunning from desktop succeeded. No production sources/dependencies were edited by this worker.

Foreground commands (each smoke exited **0**, each with nine PASS cases):

```sh
node --check test-conpty/test-claude-control-bridge.mjs && node test-conpty/test-claude-control-bridge.mjs --no-auth --out /home/destin/youcoded-dev/worktrees/sessions/11-claude-direct-controls/docs/active/investigations/2026-10-18-claude-controls-build/bridge-smoke-run-6-final-baseline
node test-conpty/test-claude-control-bridge.mjs --no-auth --cached-model --out /home/destin/youcoded-dev/worktrees/sessions/11-claude-direct-controls/docs/active/investigations/2026-10-18-claude-controls-build/bridge-smoke-run-7-final-cached-cancel
```

New cached-specific output: `PASS cached model confirmation stays pending; explicit legacy ESC cancels and direct controls recover`. `cached-model-pending-screen.txt` records the actual headless terminal viewport with “Switch model?” and Yes/No options. Before ESC the operation is unresolved, the getter is unchanged and API count is unchanged. `cached-model-cancelled-screen.txt` records the dismissed viewport; `events.jsonl` records the one `legacy-user-interaction` and cancellation receipt; `api.jsonl` confirms subsequent text uses the prior model. Both directories retain standard raw evidence, build identity and harness snapshot. These results exercise rebuilt production bridge code, not Electron/UI integration or all individual safety edge cases.

Both delivered-script snapshots matched the executed harness. Final `/proc/*/ns/net` inspection exited 0 with zero remaining processes in either final run namespace; `runtime-smoke-final-cleanup-proof.json` preserves that result. The native accept case is intentionally untested. Parent owns app UI checks. Historical failed artifacts below are preserved without alteration; the earlier blocker is now an intentionally retained confirmation with verified cancellation/recovery, not an automatic-switch claim.

## Historical passing baseline

Final command (exit **0**):

```sh
node --check test-conpty/test-claude-control-bridge.mjs && node test-conpty/test-claude-control-bridge.mjs --no-auth --out /home/destin/youcoded-dev/worktrees/sessions/11-claude-direct-controls/docs/active/investigations/2026-10-18-claude-controls-build/bridge-smoke-run-4
```

Actual output: all nine `PASS` lines in `bridge-smoke-run-4/runner.log`; the outer command printed `EXIT 0`. Machine verdict is in `summary.json`.

Cases: absent/no-handshake unavailable; native production handshake/getters; **cold** model switch confirmed by getter and subsequent API model; text once with actual transcript/dedup; clear changes session ID and subsequent text works; actual compact transcript boundary followed by text; Stop addresses an active main turn and the same engine turn completes `aborted`, followed by text; dropped host receipt returns unknown and duplicate send ID yields one model prompt/transcript row with a later serial barrier; close settles a claimed pending operation as unknown and revokes bearer capability (401).

Raw evidence: `events.jsonl` (including outbound Stop turn ID), `api.jsonl`, `terminal.raw`, `terminal.txt`, `observer-events.json`, `proxy.json`, `transcript-index.json`, and actual transcripts under `tmp/home/.claude/projects/`. `smoke-source.mjs` freezes the harness; `build-identity.json` pins CLI version and source/compiled bridge/plugin hashes. All four production hashes were rechecked unchanged after the run.

## Historical finding: cached-history model switch without user dismissal

With existing conversation history, `/model haiku` displays a real CLI confirmation: **“Switch model? Your next response will be slower and use more tokens … Yes, switch to Haiku 5.5 / No, go back.”** The production command does not resolve without that interaction; host receipt times out as unknown. Later serialized text/clear/compact cannot execute. No automatic menu answer was injected. This is not a passing cached-model contract.

`bridge-smoke-run-2` first exposed it (exit 1). The final harness reproduced it with this exact command (exit **1**, outer output `EXIT 1`):

```sh
node test-conpty/test-claude-control-bridge.mjs --no-auth --cached-model --out /home/destin/youcoded-dev/worktrees/sessions/11-claude-direct-controls/docs/active/investigations/2026-10-18-claude-controls-build/bridge-smoke-run-5-cached-model
```

That run's `summary.json` records two passing readiness cases and seven failing control cases cascading from the unresolved model confirmation. `terminal.txt` preserves the confirmation; `events.jsonl` preserves the successful initial text and claimed model request followed by unknown. Production code remains untouched; parent must decide/fix the control contract.

## Other runs and limitations

`npm run build:main` exited 0 to create missing compiled output; output was `node scripts/generate-preload-channels.mjs && tsc`. `node scripts/generate-preload-channels.mjs --check` exited 0. No dependencies were changed. The first launch failed before execution because the evidence parent directory did not exist. Run 1 was stopped after discovering harness request matching needed to ignore a trailing system-role date message; its partial raw evidence is preserved. Run 3 passed all nine baseline cases before final evidence enhancements.

This is Linux/native CLI text-only runtime coverage, not Electron IPC/UI, Android, paid model behavior, legacy PTY submission, attachments, or plan/menu acceptance. Unavailable is tested at the bridge boundary. General application verification belongs to the parent. Each run has a 240-second outer watchdog, bounded operations/waits, exact PTY-child termination and explicit bridge/proxy/observer/fake-server closure; exiting the PID namespace removes descendants. After all runs, `/proc/*/ns/net` was checked against every recorded smoke namespace: zero remaining processes (exit 0), preserved in `runtime-smoke-cleanup-proof.json`.
