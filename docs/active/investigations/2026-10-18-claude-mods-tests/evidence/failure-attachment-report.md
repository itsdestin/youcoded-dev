# Second no-cost batch: ordinary failures and attachment boundary

## Actual results

Unmodified installed Claude Code **2.1.302**, disposable inline user-tier mods, actual CLI against the existing local scripted API; **not stubbed mod tests**.

| Case | Actual observation |
|---|---|
| `tool.call` observer throws **before next**, without `.catch` | **Fails open in this tested case.** The real CLI executed the fake model's Write into the disposable project. `failure-open.txt` exists, exactly `SYNTHETIC_failure-open\n`. Debug log explicitly says hook skipped and what is below it ran. |
| Same ordinary throw with explicit `.catch(() => ({deny: ...}))` | **Blocked.** Catch recorded `next.called:false`, `next.error.kind:'throw'`, grace budget 1000 ms. `failure-deny.txt` does not exist. Fake model received an error tool result containing the exact deny reason. |
| Observer cooperatively waits `next.budget.ms + 1000` using `$.clock.sleep(...,{signal:next.signal})`, explicit catch deny | **Timed out and blocked.** Runtime budget was 10000 ms; catch saw `kind:'timeout'`, `called:false`, grace 1000 ms. Turn took **10120 ms** total. `failure-timeout.txt` does not exist; fake model received timeout denial. Code after the cancelled wait was not reached. |
| CLI continues after ordinary failures | All three prompts finished with `turn.complete.reason:'answer'`, each followed by a separate scripted completion. No worker crash, infinite loop or forced unload was used. |
| Explicit image metadata submission | **NEGATIVE capability result, not successful pixel transport.** A real generated 70-byte 1x1 RGBA PNG existed. `$.prompt.submit` accepted `{text,asUser:true,attachments:[{type:'image',mediaType:'image/png',filename:<existing absolute PNG filename>}]}`, but the fake API received **zero image blocks**. Only text arrived. |
| Text/transcript origin for image-metadata attempt | User text remained `attachment metadata transport probe`; returned origin and on-disk user row retained `{kind:'plugin',name:'isolated-attachment-probe',asUser:true}`. |

### Contract boundary

Read first-batch `generated-claude-code.d.ts` before testing: failure semantics at 4036–4055; `HookBudget` 5230–5266; `HookFailure` 5277–5288; `.catch`/`Caught` 1197–1225 and 9739–9750; `ToolCallResult` 13340 onward.

Attachment input at 9371–9411 is metadata only: `type`, optional `mediaType`, `filename`, `id`. There is **no declared bytes/base64/path import property** there, and the attachment ID is engine-owned. `asUser` does not expand pasted image syntax or `@file`. The probe invented no extra fields and used no private API. Thus **actual image import through a documented user-tier API remains unestablished**; metadata alone did not upload the PNG. This does not claim that the CLI in general cannot accept images by its other surfaces, nor test vision quality.

The registration's own `prompt.submit` observer did not fire for its own deferred submission (the call skips its calling hook); origin is verified from the actual returned value and synthetic on-disk row, not an invented observation event.

### Limits

This is ordinary handler failure, not proof of a security boundary. Explicit denial was tested only before `next`; no claim of undoing a tool that already ran. The timeout test is a cooperative own-budget `$.clock` wait, **not** a measurement of a long host/API call excluded from the budget. Hot unload, worker death, reconnect and external-wait exemption remain **unverified**.

## Files

All relative to this investigation:

- `probe/failure-fixture.ts`, `probe/attachment-fixture.ts`: minimal ordinary-failure and metadata fixtures.
- `probe/failure-attachment-probe.mjs`: new driver; reuses existing `makeIsolatedRoot`, `resolveClaude`, `sleep`, `stripAnsi`, `startFakeApi`, `fakeApiEnv`, node-pty. First-batch scripts were not edited.
- `probe/failure-attachment-check.mjs`: assertions against actual recorded results, actual local files, first-batch SHA-256 baseline and process cleanup.
- `evidence/failure-run.json`, `failure-debug.log`: failures, actual tool results, file existence/content and lifecycle events. Relevant debug lines: 226–227 skipped throw; 301–303 caught denial; 364–366 caught timeout denial.
- `evidence/attachment-run.json`, `attachment-debug.log`, `attachment-tiny.png`: metadata input, API blocks, transcript origin, generated PNG; image signature/dimensions/decoded scanline were checked and image opened.
- `evidence/failure-attachment-assertions.json`: compact verdict, preservation and cleanup evidence.

Temp roots retained for inspection, with no matching children remaining:
`/tmp/cc-mods-second-TLiCmv/cc-mods-failure-S4wcuc` and `/tmp/cc-mods-second-TLiCmv/cc-mods-attachment-mSPUtb`.

## Commands, actual output and exits

From `/home/destin/youcoded-dev/worktrees/sessions/cc-reliability-options`:

```sh
sandbox=/tmp/cc-mods-second-TLiCmv
# $evidence and $probe are the absolute evidence directory and new driver path above.
bwrap --ro-bind / / --bind "$sandbox" "$sandbox" --bind "$evidence" "$evidence" \
  --dev /dev --proc /proc --unshare-net --die-with-parent \
  --setenv TMPDIR "$sandbox" --setenv CC_PROBE_NETNS 1 -- \
  /usr/bin/node "$probe" failure
# Same command, final argument attachment, for the separate image-metadata session.
```

Both driver exits **0**. Both version checks **0**, `2.1.302 (Claude Code)`; both `claude plugin validate <temp-plugin> --json` checks **0**. Runtime tool effects, not validation, establish the results above. Both actual PTY CLI children exited **129**, deliberately stopped by the driver after collection; not normal CLI shutdown.

```sh
node docs/active/investigations/2026-10-18-claude-mods-tests/probe/failure-attachment-check.mjs /tmp/cc-mods-second-TLiCmv/first-evidence-hashes.json
```

Exit **0**, actual output:

```text
PASS failure: throw-before-next executed Write; explicit catch deny blocked Write; 10000ms own-budget timeout reached catch and blocked Write; CLI completed all three turns.
PASS attachment NEGATIVE capability: real 70-byte PNG exists, metadata submission delivered text with plugin origin, but fake API received ZERO image blocks. No pixel transport established.
PASS isolation/preservation: seven dummy-auth localhost API requests, both servers closed, no matching temporary children, 13 existing evidence files unchanged.
```

`file evidence/attachment-tiny.png`: exit **0**, `PNG image data, 1 x 1, 8-bit/color RGBA, non-interlaced`.

## Isolation, preservation and no-cost evidence

- Both fake API and CLI in the same bubblewrap network namespace; read-only filesystem except new temp sandbox and dedicated evidence directory. CLI's attempted official marketplace bootstrap connections failed under network isolation.
- Strict recorded allowlist: fixed PATH/TERM/locale, new HOME/CLAUDE_CONFIG_DIR/TMPDIR/XDG directories, updater/telemetry/error reporting/nonessential traffic disabled, only localhost base URL and known dummy auth. No inherited provider credentials, application pipes/desktop IDs, SDK, rollout override or managed-policy edit.
- Only ordinary **Write allow permission in the temp profile**, with default/manual mode, to exercise the harmless fake tool. No bypass permission mode or app permission changes. Fake model requests only Write into that disposable project.
- **Six failure requests plus one attachment request**, all verified dummy-auth localhost scripted responses; no real model or subscription request. Cost labels, if displayed, derive from the fake usage, not billing.
- Both local fake servers' close operations completed. `/proc` command-argument scan found no child referencing either temporary root.
- SHA-256 comparison verified **all 13 existing first-batch evidence files unchanged**, including controls, generated declarations and REPORT.md. No first-batch script, PLAN.md, RESULTS.md, LIVE-HISTORY.md, app source, personal file or card was edited. Installed binary hash still matches first-batch evidence: `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`. No commits or pushes.
