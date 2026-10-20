# General input under a held Claude batch boundary

status: active

## What was checked

No-account real CLI2.1.303, local fake API, isolated network/PID namespaces, fresh HOME, actual source11 production pty-worker.js through its normal fork/IPC interface. No app source or user profile was changed by these experiments. `worker-fence-probe.mjs` records the variants; output folders are separate.

## Observations

- `worker-fence/`: an 1839-byte Unicode message went through the production worker's existing chunk/echo submission. Its tail was not recognized in terminal output; the worker correctly suppressed Enter after its12000ms echo timeout. No native acceptance occurred. This is not a successful long-input proof.
- `worker-fence-read/long-unicode`: after the actual suppressed-Enter signal, a fresh supported `$.prompt.read()` returned the exact complete expected text. A single explicit Enter then produced native acceptance while the fence was held, followed by same-turn model delivery. This narrow positive check worked; it is not a license for blind retries or arbitrary focus/media handling.
- `worker-fence-read/mention`: the59-byte @brief.md prompt was accepted while held and reached the next request, but the unique file-content marker was absent. Acceptance is not proof of file expansion.
- `worker-fence-media/`: the existing app-style path paste then600ms gap then caption+Enter did not yield native acceptance before the held fence was released.
- `worker-fence-media-release/`: after releasing on native queued-UI evidence instead of acceptance, the next model request did not contain the caption. The assertion correctly failed.
- `worker-fence-media-complete/`: the caption/path appeared only in request3, after the original turn's final response in request2. No image block was present. The fake model did not call Read in this case, so this is NOT evidence that ordinary Claude tool-based image reading is broken; it is evidence against assuming immediate image context or batch-boundary delivery from that paste sequence.
- `worker-fence-fill/`: supported `prompt.fill` and exact readback succeeded for the same path/caption, but native acceptance still did not happen while the batch fence was held. No claim of a successful image/fill delivery path is made.

All failing variants are retained as failed probes, not counted as successful queue tests. No paid calls were made.

## Consequence for the first test build

Short-text and narrow verified long-text delivery have positive evidence. File-bearing batch delivery does not yet meet the same contract. A scope-reopen question (`claude-queues.input-scope.json` Q5) asks whether the first test build may keep attachments and @ references queued until idle, with FIFO ordering and existing edit/remove controls retained. No answer is assumed.

Regardless of scope choice, the production design still needs revocable delivery transactions, native-side admission/correlation, durable uncertain-delivery states, stable aliases across Clear, and idempotent edit transfer. Those are backend correctness requirements, not a new UI design.
