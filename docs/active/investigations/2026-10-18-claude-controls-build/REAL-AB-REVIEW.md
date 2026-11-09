# Real Haiku comparison and mods-integration merge review

status: active

**Follow-up:** the user subsequently authorized fixing `@file` and double-checking Stop. The mention routing fix passed full verification; controlled, no-cost cross-over tests confirmed the Stop difference. See `STOP-RECHECK.md`. The findings below describe the original `.2` test build; Stop remains unresolved.

## Verdict — do not merge this build unchanged

The first real task comparison found **two behavior regressions that the prior full suite and fake-API smokes did not expose**: missing `@file` context and weaker cancellation of running Bash work. The earlier test-build delivery is still a valid runnable build, but its green checks are not evidence of semantic equivalence. This review supersedes any implication that the build is ready to merge.

No production code was changed during this review. Findings are recorded on existing work item #11; future investigations are on #12. No merge, push, release or SDK integration was performed.

## Method and limits

- Real Electron renderer and backend through isolated `run-dev.sh`; CLI pinned to **2.1.303**, actual model **claude-haiku-5-5**, ordinary Auto permissions (not bypass).
- Same implementation branch in both arms: **mods enabled** versus **`YOUCODED_CC_MODS=0`**. This isolates the control transport, not the entire old master commit. Shared parser/lifecycle fixes remain in both arms.
- Separate conversations and initially byte-identical fixture folders. The temporary signed-in profile was authorized by the user; no production/test-copy credentials were borrowed. No personal project data entered prompts.
- **Eight manually submitted prompts total: four per arm**, no automatic prompt retries. Tool calls caused additional model continuations within those tasks; eight prompts does not mean eight API requests.
- Tasks: `@file`-based visit checklist without tool reads; a tiny Python bug fix with tests plus document transformation; cancellation while a 30-second Bash command runs; a recovery/check task afterward.
- Independent checks: reran generated code tests, checked unchanged test-file hashes, inspected created files, compared native transcript events/timestamps, and checked actual model IDs and prompt uniqueness. Both renderers reported no page errors.
- Small sample, **not a statistical quality or latency benchmark**. No adversarial permission/deny, real plan-mode transition, image pixel transport, network interruption, remote reconnect, cross-platform run or real process-resume test was done in this batch. Earlier scripted tests cover some other cases, not real-model equivalence.

## Results

| Test | Legacy PTY | Mods | Interpretation |
|---|---|---|---|
| `@tasks/<arm>/brief.md`, no tool calls allowed | Correct time, room, Unicode contact and parking checklist | `FILE_CONTENT_NOT_PROVIDED` | **Confirmed context regression.** |
| Fix quantity bug in `totals.py` | Correct fix, four tests pass | Correct fix, four tests pass | Both perform ordinary multi-tool work. |
| Produce `visit-checklist.md` by explicit file reading | Correct four bullets | Identical correct four bullets | Explicit Read works; this does not restore automatic mention expansion. |
| Stop running Bash, then wait beyond its 30-second duration | Tool result says rejected/stopped; no follow-on file | Tool moved to background; completion notification caused a later Write | **Confirmed cancellation divergence in this matched case.** |
| Follow-up after Stop | Correct tests, budget code, file absent | Correct tests, budget code, acknowledges file already exists | Both remain usable; mods' eventual side effect is not erased by successful recovery. |
| Saved manual prompts | Four, each once | Four, each once | No duplicate manual submit observed in this sample. |

Both task folders retained identical test-file SHA-256 `8d881d94a1b60108989b80e5f3894539ce2569c788af43a84c1838b1186e9fe2`; independent `python3 -m unittest -v` passed all four tests in each.

### 1. `@file` is not semantically equivalent

Both prompts explicitly prohibited model tool calls, so a compensating Read could not hide the integration difference. The legacy reply correctly included `Tuesday at 14:30`, `Cedar 7`, `Anaïs 李`, and the south garage. The mods reply said the file was not supplied.

This agrees with the generated upstream contract: `PromptSubmitArgs` says `asUser:true` removes model-visible framing, but origin remains plugin for hooks/provenance, and `@file` mentions/pasted images are not expanded. Evidence: sibling `cc-reliability-options/.../evidence/generated-claude-code.d.ts:9320–9337,9365–9383`.

Current routing sends attachment-free, non-slash text directly (`desktop/src/renderer/state/submit-outgoing.ts`), so manually typed mentions are not exempted. Existing explicit attachments remain on PTY; that is a separate route.

**Before merge:** preserve legacy mention behavior before dispatch, or implement a separately verified file-import path. Do not silently rely on the model to notice the path and read it. Avoid automatic resend/fallback after an uncertain direct submission.

### 2. Stop can let work continue later

The same Bash command and description-only inputs were used in both arms—neither model supplied a timeout/background flag:

`python3 -c "import time; time.sleep(30)"`

Mods transcript:

- `05:11:19.206Z`: Bash tool starts.
- Chat Stop is pressed while the tool is visibly running; chat becomes idle/Interrupted.
- `05:11:32.385Z`: tool result becomes `Command running in background ...`.
- `05:11:49.569Z`: background completion notification arrives.
- `05:11:51.177Z`: Claude calls Write to create `tasks/mods/cancel-finished.txt`.
- The next manually submitted prompt was only at `05:12:07.173Z`, so it did **not** cause that Write.

Legacy transcript:

- `05:15:56.053Z`: identical Bash command starts.
- Chat Stop is pressed while the tool is visibly running.
- `05:16:09.043Z`: tool result says the user rejected the tool and to STOP/wait.
- After waiting beyond the command duration, `tasks/legacy/cancel-finished.txt` remains absent; the later check confirms that.

This is not just a cosmetic spinner issue. A user can reasonably assume Stop prevents the next edit, but the mods run produced one later. The generated abort contract claims running tools are stopped; this observed CLI behavior is stronger evidence than that promise. Exact upstream mechanism still needs a controlled fake-API tool-cancellation reproduction; do not generalize from one sample to every tool.

**Before merge:** prove cancellation parity for running tools and background-notification follow-ups, or retain the existing deliberate Stop path until it is proven. A broad blind Escape fallback after ambiguous direct execution is not the answer.

### 3. Closed-session retention grows

Source `claude-control-bridge.ts:317–330` retains closed session entries; existing send-ID tombstones remain attached to their Session object. A free compiled-class probe calling `closeSession` for 10,000 distinct IDs retained **10,000 session entries, zero active secrets**. This proves retention, not a measured real-world memory leak rate or resource exhaustion.

Lifetime memory is not globally bounded across sessions. Fix/soak-test bounded retirement while retaining protection against delayed prepare and duplicate writes; do not simply erase cancellation fences.

## What improves

- Ordinary supported text no longer depends on terminal paste classification, echo timing or an injected Enter.
- Addressed operations can distinguish definite refusal from uncertainty; send-ID deduplication prevents automatic double submission after a lost result.
- Stop names a main turn instead of a context-sensitive key—but the real tool case shows addressing alone is not cancellation equivalence.
- Model commands use the actual getter rather than assuming the requested alias won; clear/compact have explicit dispatch/receipt boundaries.
- Session-scoped deployment avoids a global plugin installation, and the bridge uses loopback, bearer authentication, strict Host/no-Origin checks and bounded per-session queues.

## Remaining risks and limits

1. **Plugin provenance:** other plugins/hooks may distinguish plugin-origin and human-origin prompts even when the model sees identical text. No tool-permission bypass was demonstrated; also no origin-sensitive policy equivalence was proved.
2. **Two event systems:** live receipts and transcript/classic hooks can arrive in different orders. The exact-UUID Stop fix addresses known UI races; missing state/receipts can still leave uncertain UI. Clear still needs classic SessionStart for identity/watcher remapping, and compact history remains file-authoritative.
3. **Recovery trades availability for no duplication:** a once-ready bridge disappearing does not automatically fall back to PTY. Some sealed/unknown states require reopening even when terminal view works. That is safer than replaying, but needs clear recovery UX.
4. **Compatibility gate:** the implementation accepts the 2.1 family at/above 300; sampled Linux builds are not proof of all future patches or Windows/macOS/Android behavior. Authentication handshake does not prove semantic compatibility.
5. **Local capability, not a sandbox:** the bearer protects the loopback endpoint from unrelated requests; same-user code able to read the child environment remains within its trust boundary. It is not attestation that every prompt came from a human.
6. **Old failure modes remain:** attachments, startup menus, approval/question/plan answers, arbitrary slash commands and terminal view still use the old mechanisms. No claim that mods removes all paste/menu/hook problems is justified.
7. **Independent pre-existing UX issues reproduced:** first-run theme/security screens still require terminal interaction, and the permissions chip initially shows Normal before detecting Auto. These are not established as new mods regressions.

## What is—and is not—obsolete

**Bypassed for the ready direct text route:** text paste splitting/echo timing and bare-Enter retry. They are not globally dead code.

**Must remain now:** PTY/worker/xterm (CLI hosting, startup, raw terminal, media/menu routes), TranscriptWatcher/history parser (durable and live conversation authority), HookRelay/classic SessionStart (permission and identity transitions), screen readers/menu drivers (retained interactions/fallback).

There is **no justified whole-component deletion** in this slice. The first simplification should be a clearer transport boundary: plain text, mention/media imports, supported commands, deliberate menu input, and raw terminal should be explicit distinct intents. Each migrated consumer needs its own parity test and retirement decision.

## Prioritized follow-ups / roadmap

Recorded on **#11**, retaining the existing item: mention parity and running-tool Stop are merge blockers; bounded closed-session retirement; semantic tests for project instructions/provenance, ask/deny, queues/resume/reconnect; actual platform coverage; initial permissions display.

Recorded on **#12**, retaining its existing exploration ideas: native first-run cards; structured read-only startup/model/permission/usage facts to replace individual terminal guesses; media/interaction API exploration only after parity proof. **#164** remains the separately approved cross-engine conversation investigation, not a consequence automatically unlocked by this bridge.

Recommended order: repair the two observed regressions → deterministic cancellation/context fixtures and bounded retention → structured live facts/startup UX → media and interaction parity → selectively remove redundant readers/drivers. Do not replace history or delete PTY first.

## Usage, evidence and cleanup

- Mods CLI estimate: **$0.00572709**.
- Legacy CLI estimate: **$0.006541870000000001**.
- Combined CLI estimate: **$0.01226896**. This is Claude Code's own estimate, **not an independently verified account debit**; not a reliable cost comparison from one run per arm.
- Actual assistant records name only `claude-haiku-5-5`; no extra manually submitted prompts or automatic prompt retries.
- Evidence: `real-ab-summary.json`, `real-ab-{mods,legacy}/transcript-evidence.json`, each arm's `after-stop.json`/`final-gui.json`, and numbered screenshot runs `scratch/explore/20261019-050913/` and `20261019-051327/`.
- Temporary dev sessions and explorer were stopped, and the comparison's signed-in temporary HOME was removed after checking that no processes still used it (`real-ab-cleanup.json`). Synthetic fixtures/evidence are retained without copying credential files or thinking signatures. The user's separate test application was not driven or stopped by this comparison.
