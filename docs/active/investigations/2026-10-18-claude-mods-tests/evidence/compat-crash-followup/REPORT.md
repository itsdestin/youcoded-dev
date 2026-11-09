# Final free compatibility/failure sample

Investigation only. Linux x64; actual installed binaries, no Android runtime claim, SDK, credentials, paid calls, downloads, app changes or rollout overrides.

## Versions, launches and safety

- **2.1.300** SHA-256 `674deba0bba9aee479f4503c438b49303b6fdd304b9a471b14977aaec5215453`.
- **2.1.302** SHA-256 `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`.
- Exact binaries: `/home/destin/.local/share/claude/versions/<version>`; version strings were read from those binaries. CLI argv, PID, namespace, allowlisted environment and temporary paths are recorded per phase in JSON. Ordinary argv: `<binary> --plugin-dir <new-temp-plugin> --debug-file <new-temp-log>`; recovery adds supported `--resume <same-id>`.
- Every batch used bubblewrap `--ro-bind / / --clearenv --unshare-net --unshare-pid --die-with-parent`, with only its new temporary root and new evidence directory writable (plus namespace `/dev` and `/proc`). Fresh HOME/config/XDG; only dummy localhost API authentication. Services and CLI shared the isolated network namespace. No live app interaction.

Commands from investigation root's workspace (all foreground, exit **0**):

```sh
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/compat-probe.mjs --launch compat-batch1
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/compat-probe.mjs --launch compat-batch2
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/compat-probe.mjs --launch compat-crash-followup
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/compat-check.mjs
```

Driver exit 0 does not mean every scenario succeeded. Batch1's five sessions made **zero requests**: module validation rejected passing `$` to a nested helper. Logs/errors remain intact; the new fixture was corrected to use direct capability calls. No binary workaround was required.

## A — actual 2.1.300

`compat-batch2/controls300.json`: three scripted API requests. `/model sonnet` selected `claude-sonnet-5-5` in getter and all requests; `/clear` changed ID with separate transcript files; two identical multiline Unicode prompts survived exactly twice on disk; `/compact` retained the new ID and wrote a durable `compact_boundary` with scripted summary. Result objects match prior 302 captures (`{}`, clear `{text:""}`, compact `{}`). No drift observed in these sampled outcomes.

`gate300.json`: four requests. Default policy **without Write allowance** returned underlying **ask** for both calls. Explicit synthetic external allow created exact `SYNTHETIC compat allow\n`; explicit deny produced no file and a model-facing permission error.

Fresh generated declarations are saved for both versions. Ten key command/prompt/messages/tool-check types have identical comment-free signatures. Wider declaration drift exists: `HookFailure` drops `re-entry`/`cause`; `env.set` changes `Promise<void>` to `Promise<EnvSetResult>`; multiline input adds `rows`. Changed declaration containers: CoreEngineInterface, HookFailure, InputProps, OpValueOf, RenderElement, plus new EnvSetResult. This is a small sample, not compatibility certification.

## B — 302 process crash during external approval

Batch2 genuinely killed the exact owned CLI with SIGKILL while old Write awaited its service. Only 271 bytes of metadata had persisted; supported resume exited **1**, “No conversation found with session ID”. Preserved as a failure, not repaired.

One follow-up observed a durable tool row before SIGKILL, still during the external wait. Session `18674568-ac6c-4069-a77b-d4f024f206dd` resumed unchanged. Three total scripted requests. Old service attempted **late allow after old PID disappeared and while new distinct Write waited**; old socket was already destroyed. New call received its own explicit deny. Neither old/new file existed. Both user prompts appeared exactly once. CLI synthesized an error for the previous tool: “session ended before this call's result was recorded… outcome is unknown”; resumed API history included it. This is process-crash recovery, not worker-thread unload.

## C — catch itself throws

302 gate and catch both threw on actual temporary Write. With explicit profile Write allowance, normal policy resumed and exact file was written (two requests). Without allowance, underlying/check verdict remained **ask**, no file appeared, no second API request occurred, and the native interaction stayed pending until bounded cleanup. Thus failure does **not** establish a global permission bypass or fail-closed guard.

## Verification, preservation and limits

Read-only checker: **525 captured-evidence assertions passed**, including previous evidence/probe hashes, versions, effects, requests and state; these are not 525 independent scenarios. Batch2 had **11** requests; follow-up **3**. All services closed, owned CLIs exited; host `/proc` scan returned `remaining owned processes: []`. SIGKILL exits recorded signal 9; intentionally stopped interactive sessions recorded exit 129. Synthetic temp profiles remain for inspection; no history was manually rewritten. Parent-owned PLAN/RESULTS may evolve independently.

Unverified: unsupported in-flight worker unload, real model/subscription behavior, broader race matrix, Android/other platforms. No app adoption or implementation decision follows from this batch.
