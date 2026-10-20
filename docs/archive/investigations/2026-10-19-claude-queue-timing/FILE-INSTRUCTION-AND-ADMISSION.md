# Explicit file instructions and native admission — follow-up proofs

status: shipped

## User-proposed alternative (Q5 Other)

Instead of assuming @ expansion/preloaded attachments, stage ordinary user text beginning `Read this entire file: "<absolute path>"`, followed by the task. The user proposed this in `claude-queues.input-scope.answers.json`; the idle-only file option was not selected.

Command: `node worker-fence-probe.mjs --fill-check --file-instruction` (from this directory, or use its full workspace-relative path). It runs the real unmodified CLI2.1.303 with the existing worker, private no-network namespace, fake API and no credentials. Both cases returned `error:null`, three model requests, and exit0.

- **Text file:** the ordinary file-read instruction was accepted while the batch fence was held, before release. Request2 contained the instruction in the same running turn. A real Read tool then returned the unique UTF-8 file content in request3.
- **Image:** the same instruction shape reached request2 before release of the original turn. A real Read tool produced an image content block in request3.
- Parent independently checked `accepted < released < request2`, matching queued prompt/completion turn ID, actual request content and Read output.

Evidence: `worker-fence-instruction/{image-path,mention}/result.json` and private fixture files. This proves delivery and the tool-reading path. The fake model explicitly chose Read: it does NOT prove every model will obey the instruction, read a large file completely, avoid permission refusal, or support every file type. It is not automatic context preloading.

Compared with the earlier bare leading-path experiment, this changes input framing; no claim is made about the exact upstream cause of the earlier deferred delivery. The result supports the user's practical alternative without inventing engine fields or changing history.

## Native-side lease/admission proof

Command: `node admission-probe.mjs --single`.

One supported plugin module registers a batch fence, background poll/fill, prompt admission and completion callbacks. Its own versioned `$.state` holds the lease. The module remains reentrant while its batch hook awaits local HTTP.

- Valid lease: state is held, deadline valid; native `state.set(...,{ifVersion})` returns `isSet:true, version:2`; prompt is accepted before fence release and reaches request2 in the original turn. Exactly one genuine human queued transcript representation remains.
- Revoked lease: the native state is changed to revoked before the owned Enter. Admission returns drop before `next(e)`. Request2 contains no stale head, and zero queued/user transcript representations exist for it.
- Parent independently checked the order of admission decision, release and request2, plus actual transcript counts.

Evidence: `admission-single/{accept,revoke}/result.json` and generated module/CLI logs; both cases error:null and command exit0.

The earlier `admission-proof/` attempt used two entries in hooks.json.modules and was rejected at startup: this CLI permits one hooks module per plugin. No model task ran in that failed attempt. Production must not assume multiple module entries are supported.

## Production work still required

The queue adapter must implement bounded native leases tied to attempt/live incarnation/session/turn/wire hash, worker revocation/deadline checks, input ownership, fail-closed armed admission, and durable receipt/transcript correlation. Returning a fake rejection after `next(e)` already ran is forbidden: lost receipt is uncertain. Plugin crash/unload remains a failure boundary, not permission to replay. These proofs do not replace those regression tests or the actual app walkthrough.
