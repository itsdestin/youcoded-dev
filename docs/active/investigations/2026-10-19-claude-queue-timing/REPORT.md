---
status: active
work_item: 169
---
# Claude mid-task queue delivery — CLI 2.1.303

## Decision evidence

**Plain PTY Enter reaches the next model request after the current two-tool batch, inside the SAME turn, before the original task finishes. `$.prompt.submit({text, asUser:true})` does not: it waits for idle and starts a separate turn.** Moving that API call into `PostToolBatch` is explicitly refused by the host.

Important qualification: **neither path satisfies both same-turn delivery AND a literal persisted `type:"user"` row.** Native mid-turn PTY messages are recorded once as a human `queued_command` **attachment**, not a normal user row. Their text reaches the API under the **user role**. The existing app parser already projects this exact native attachment into a `user-message` event; no invented transcript row is needed. If “as user” means a literal JSONL user row, the requested conjunction remains blocked. If it means authentic human provenance + user-role API content + one user timeline message, **native PTY delivery is the viable boundary path**, with the remaining input/queue lifecycle work still unverified.

No queue service, UI, engine changes, transcript fabrication, SDK, paid inference, dependency installation, or app runtime was used.

## Method and isolation

Actual executable: `/home/destin/.local/share/claude/versions/2.1.303`; `--version` returned `2.1.303 (Claude Code)` in the evidence events. SHA-256: `375988f457756524234695cf2d8f64ace99c5f68682e47ea24862a843c191450`.

`probe.mjs` launches `/usr/bin/bwrap --unshare-net --unshare-pid --clearenv --ro-bind / / --proc /proc --dev /dev --die-with-parent --new-session`, writable only in this new investigation directory, with `/tmp` backed by a directory inside it. Full commands and exits: `evidence/launch.json`, `context-recheck-evidence/launch.json`. Each case has a fresh HOME/config/project under sandbox `/tmp`, dummy `ANTHROPIC_AUTH_TOKEN`, explicit local `ANTHROPIC_BASE_URL`; no inherited environment/auth. Final cases use `--permission-mode default --setting-sources user`. The unmodified CLI's background marketplace network attempts fail in the disconnected namespace (debug logs); the fake API and probe control HTTP service share namespace loopback. No credential was supplied/read by the probe. The host filesystem is read-only to the CLI; this is not a general claim that a read-only mount hides host files.

The existing `youcoded/desktop/test-conpty/fake-anthropic.mjs` scripts replies, not assistant quality. `node-pty` is required read-only from sibling session 11 as authorized; no packages were installed or patched. Per-case plugin source, CLI debug output, terminal bytes, generated upstream types, fresh profiles and marker files are preserved in `runtime/` (and `context-recheck-runtime/`). Parsed evidence JSON retains complete main API message arrays, event order, and actual persisted JSONL contents.

The first scripted response has TWO Bash tools. Each writes a start marker, waits for an explicit release file, writes its own completion marker, and returns its completion text. Delivery is requested only after an actual start and while neither completion marker exists. PTY submission waits for the real `prompt.submit` hook before release; direct invocation is also confirmed in CLI debug at `06:53:46.143Z`, before release at `06:53:46.148Z`. At request 2 both completion markers exist and `original-done` does not. Request 2 tells the CLI to Write `original-done`; request 3 ends the original turn. Thus no guessed sleep controls the delivery boundary. A 250 ms drain only allows transcript IO to settle after completion. Both tools are members of one API tool batch; their processes need not overlap.

## Observed cases

`wire` below means the incoming marker is present in each successive actual main API request. It is retained in later requests as conversation history, not newly delivered twice.

| Case | Wire presence | Turns | Durable result / outcome |
|---|---|---:|---|
| Direct `$.prompt.submit`, `asUser:true`, called during gated tools | false, false, false, **true** | 2 | Exactly one normal user row, plugin origin with `asUser:true`; first original turn fully completes before incoming starts |
| Classic PTY short text + Enter during gated tools | false, **true**, true | **1** | Exactly one human `queued_command` attachment; **zero** normal user rows; incoming API text is user-role, merged alongside both tool results |
| `$.prompt.submit` called from `classic.PostToolBatch` | false, false, false | 1 | Explicit host rejection; no incoming delivery. Probe's fourth-request wait times out, intentionally preserved as failure, not success |
| `classic.PostToolBatch` additional context (correct contract recheck) | false, **true**, true | **1** | Exactly one `hook_additional_context` attachment; incoming API text is **system-role**, not a typed user message |

### Actual identities and provenance

- Direct original turn `9577c0d2-9c18-49d3-a6b8-ec4702fcc350`; incoming turn `08eeca46-bc0a-44b8-b5ad-75e0172195d2`. User row `11e26a4a-954e-4caf-bb22-88683fac2041`, origin `{kind:"plugin",name:"queue-timing-probe",asUser:true}`, `queuePriority:"later"`.
- PTY original AND incoming prompt hook turn `e714e29e-fd9e-4628-9af2-a452a21af28b`; incoming hook `{origin:{kind:"composer"},wait:false}`. Durable attachment `b222cd8d-2e8e-4191-a806-592c33fe72de`: `{type:"queued_command",commandMode:"prompt",origin:{kind:"human"},humanTurn:true}`. Queue removal reason `absorbed_mid_turn`; a `source_uuid` and `delivery_id` also survive. Enqueue/remove records, history display records and API-request-cache blobs are NOT additional user conversation rows.
- Hook context is explicitly `hook_additional_context`, `hookName:"PostToolBatch"`, `hookEvent:"PostToolBatch"`. It must not be relabeled as a user message.

Exact host diagnostic (`runtime/post-submit/debug.log:402`):

> prompt.submit: called from a classic.PostToolBatch hook, it would wait on the turn this hook may be holding; submit from a later event (turn.complete) (host check)

### Harness issues retained, not hidden

There were four principal cases plus one context-shape recheck. Before those, two setup launches were stopped: the first timed out waiting for a start marker because of bad nested Python shell quoting; the second was interrupted during the same setup approach. `initial-runtime/`, `initial-evidence/direct.json`, `initial-output.txt` preserve them. The revised harness encodes the tool script, pins default permissions rather than the new auto-mode default, and uses `/tmp` projects/user-only settings to avoid ancestor workspace instructions. The initial launcher was stopped by exact owned shell ID; its PID namespace ends its children.

The first principal context attempt accidentally returned a string rather than the documented `string[]`. Its lack of delivery is **invalid-shape evidence only**, not evidence that supported context fails (`evidence/post-context.json`, `runtime/post-context/`). The isolated `--context-recheck` uses the exact `string[]` contract and succeeds. The final `probe.mjs` contains that corrected shape; original generated plugin files preserve the source actually executed in the first run. No further cases were run.

## Supported contracts and limits

Primary exact contract: the actual CLI emitted `runtime/direct/plugin/.claude-plugin/types/claude-code/index.d.ts` (16,700 lines), not an invented API or SDK schema. The sibling upstream contract was consulted read-only before probing.

- **Prompt submission**: lines 3010–3020 explicitly say a plugin prompt starts its own turn once idle. `PromptSubmitArgs` (9371–9383) is the specified omission of engine-owned `origin`, `turnId`, `wait`, `context`, `command`, `isMeta`, plus optional `asUser:true`. `asUser` removes model-facing plugin framing, **not plugin provenance**. There is no supported force-current-turn/priority override among those arguments. Native `PromptSubmitInput.turnId` (9481–9489) records the currently running turn; a plugin's own submission lacks it. `wait` (9490–9498) distinguishes queue-submit key intent for hooks, not a way for plugins to force this path.
- **Files/media via direct submit**: `@file` mentions and pasted images are **not expanded** for a plugin's prompt, `asUser` or not (9376–9378). `attachments` metadata uses only engine-pinned handles/kinds, not arbitrary bytes (9390–9410). `prompt.media` (3033–3043) reads an existing submission's image/document, max **4 MiB per call**, only for a mod-managed settings install during its submit hook; that is a read capability, not an image injection method. No arbitrary file/audio/image submission was demonstrated. Plain text succeeds; maximum text length was not tested.
- **Native PTY**: tested one short ASCII single-line message with atomic Enter, below paste classification thresholds. File mentions, long/multiline text, pasted images, document/audio inputs, composition focus and permissions are **unverified in this probe**. No blanket claim that its media semantics equal the direct API. Existing PTY safety/echo/input-gate rules still apply; this evidence does not approve blindly sending Enter at an arbitrary menu.
- **PostToolBatch**: input at 8003–8017 includes the whole completed `tool_calls` array. `ClassicResult.additionalContext?: string[]` is exact at 1323–1327; `ClassicResultFields.PostToolBatch` permits only `additionalContext` beyond common result fields (1403). Correctly shaped context demonstrably reaches the next request before original completion, but as hook/system context, **not user provenance**. It can observe the batch boundary, not turn a plugin submit into native typed delivery.
- **`session.receive`**: `SessionReceiveInput` (11827–11918) is an inbound-delivery HOOK with engine-classified, pinned provenance, text, optional external event, optional pinned target agent. `next(e)` queues that existing delivery (11921–11944). This is **not** a public `$.session.receive` emitter: the actual `CoreEngineInterface.session` section (2791–2982) exposes no receive method. The similarly named `EventCalls.session.receive` at 4883 describes dispatch typing, not an extra method on `$`. No bridge connection, forged origin, mailbox writing, or peer/self-send architecture was attempted. `$.session.send` (2933–2945) is plain-text peer/agent delivery with plugin identity, not typed-user delivery; not tested here.
- **`turn.step`**: a streaming observation/interception HOOK; `TurnStepInput` (14114–14148) lets model/effort change but pins `turnId`, index, `messageCount`, agent identity. There is **no writable messages field**. `CoreEngineInterface.turn` (2986–3003) exposes `abort`, not a public `step` method. Its generic EventCalls entry at 4898 is not an invitation to invoke a second engine loop. Synthesizing chunks or altering model output would be outside this investigation and would not make a real typed user prompt.
- **`session.append`**: actual method takes `SessionAppendArgs` (10956–10973), text-only user-role note or system notice, optional running agent ID. Door `note`, plugin origin and UUID are engine-owned; `isMeta`/role/type stamps in observed append events are pinned. Its own docs say the person does not see the note as typed (2947–2955). Not used as a substitute for delivery or user transcript provenance.
- **Context limits**: `prompt.submit` hook context comments (9473–9478) describe head-and-path treatment past 100,000 characters per block / 200,000 combined. Those comments concern hook context, **not a measured typed-text limit**, and must not be transplanted into an attachment/upload contract. No size/load study was run.

Existing parser compatibility is a read-only source finding: `youcoded/desktop/src/main/transcript-watcher.ts:68–85,363–368` recognizes human `queued_command` prompt attachments and emits `user-message` using the attachment UUID; non-human origins are rejected. This was not a running-app test. No source changes were needed or made.

## Next boundary recommendation / remaining uncertainty

1. **Viable**: hand ordinary approved text to the existing native PTY/composer queue while work is active; let Claude absorb it after its current tool batch. Existing app transcript projection already understands the genuine durable representation. This is not equivalent to invoking direct `prompt.submit` at a later boundary.
2. **Not viable for this semantic contract**: plain direct submit, submit inside PostToolBatch, hook additional context as a typed user substitute, or `session.append` notes. Do not draw UI promising native batch-time direct delivery from these APIs.
3. **Unsupported by inspected public interface**: inventing `$.session.receive`, a writable `turn.step.messages`, caller-supplied `turnId`/wait/priority/origin, or fake normal user transcript rows.
4. **Unverified**: delivering strictly AFTER a batch by an external PTY write racing the next request (rather than enqueueing while busy); multiple pending FIFO items; long text/files/media; queue removal/ack races; Stop-only-current semantics with queued text already handed to CLI; Clear preservation; app-restart paused restore. Approved product decisions remain unchanged, but this timing probe does not prove their implementation. No service/UI was built.

## Commands and actual results

From this workspace:

```text
node --check docs/active/investigations/2026-10-19-claude-queue-timing/probe.mjs
(no output; proceeded to run)

node docs/active/investigations/2026-10-19-claude-queue-timing/probe.mjs
sandbox exit=1
```

Main command's wrapper printed `exit=1`; complete output is `run-output.txt`. Direct and PTY case errors are null; PostToolBatch-submit timed out after the explicit host rejection. Do NOT call the whole run green.

```text
node docs/active/investigations/2026-10-19-claude-queue-timing/probe.mjs --context-recheck
sandbox exit=0
```

Wrapper printed `exit=0`; complete output is `context-recheck-output.txt`.

```text
node docs/active/investigations/2026-10-19-claude-queue-timing/check-evidence.mjs
```

Exit 0. Actual final result string:

```text
PASS: evidence semantics checked; not a claim every capability meets the requested contract
```

Full checked counts/turns/provenance and host diagnostic: `checked-results.json`. This checker asserts live-marker ordering, original-task incomplete at request 2, turn identities, API roles, exactly-one native durable attachment, zero phantom ordinary PTY user rows, and the actual direct invocation log preceding batch release.

Mandatory startup command was `node scripts/workspace-start.mjs --session 169-claude-message-queues --item 169`. Its automatic machinery reported a card-link save to master (`e4bca95f`) and a shared-workspace fast-forward; no manual commit, staging, push, source edit, or dependency operation was performed by this investigation. That startup side effect is disclosed rather than claiming absolutely no commits occurred. All investigation-created files are under this new directory. Desktop verification was not run because no desktop production code was changed and this is a separately authorized offline capability probe.
