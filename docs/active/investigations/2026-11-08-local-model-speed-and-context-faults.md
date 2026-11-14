---
date: 2026-11-08
status: active
type: investigation
topic: card #226 — making any one local model run as fast as it can on the user's own hardware, the five faults found on the desktop with a small model, and everything still open for the local engine
tags: [local-models, engine, performance, native-runtime, compaction]
---

# Local engine fixes and improvements (card #226) — status

**The one status page for card #226** (which absorbed #48, #49, #50 on 2026-11-09).
Branch `session/local-model-hardening` in both the workspace and the app repo. Destin's
goal: "get any individual model to run the best/fastest it possibly can on every youcoded
user's hardware", without changing the model, plus fixing the faults below. Engine facts
and measurements live in `youcoded/docs/engine-dependencies.md`; harness behaviour in
`youcoded/docs/native-runtime.md` → "Local reliability". Do not copy numbers from here into
code comments — those two files are the reference.

## Where it stands (2026-11-12) — read this section first

Destin answered two review decks (`docs/active/design/2026-11-09-local-models-review/`,
answers files beside them). Everything he decided is built on the branch and pushed. NOT
merged. His order (deck 1 Q-12): finish, test, **independent final code review, then ship**.

**2026-11-13:** wrap-up done; waits only for Destin's word to merge. Open: the desktop PC is
unreachable over SSH and still holds `~/yc-test-226` (remove when it is back).

**Decided and built on 2026-11-12** (app commits `dc37dd75f` … `12b89a417`):

| Decision | What a user gets | Where |
|---|---|---|
| Read-ahead stays always on (Q-1) | No change. | — |
| Default context 64k, was 32k (Q-2) | Three ordinary chats keep their place instead of two. Anyone who never set a size uses more memory after updating; a memory warning dismissed at 32k is asked once more. An unknown model on the default is still treated as small. | `engine-config.ts` `DEFAULT_CONTEXT_SIZE` |
| Helper agents never take a chat's place (Q-8) | Going back to another chat no longer re-reads everything because a helper ran. | `slot-pins.ts` |
| Read again when you return (Q-6) | Clicking back into a chat, or typing in it, after its model slept loads the model and re-reads the chat in the background. The chip works for a minute or more each time. | `hooks/use-return-warm.ts`, `models:load` + `sessionId` |
| Long results keep both ends and are saved whole (deck 2 Q-1) | A command's error on its last lines survives a nearly full chat; a cut search/web/tool result can be opened from a saved file instead of running the tool again. | `tool-result-room.ts` |
| The cut applies to every model (deck 2 Q-2) | No change (it already did); cloud chats only meet it when nearly full. | — |
| A chat always continues (deck 2 Q-3, replaces deck 1 Q-7) | When a full chat's model cannot summarise, the app removes the old part and leaves its own note listing what the user asked for. The assistant forgets details from the removed part; the chat on screen is unchanged. | `compaction.ts` `standInSummary` |
| Faster-writing safety net (deck 2 Q-4) | A model the trick stops from loading is loaded once more without it, and that is remembered. | `engine/mtp-fallback.ts` |
| Idle shutdown stays 25 minutes (Q-9) | No change. | — |

**Corrections to what Destin was told.** Deck 2 Q-1 said a cut result keeps "only the
beginning" and the rest is "gone unless the command is run again". That was true only of
the new room cut: commands already kept both ends and saved their full output
(`tools/bash.ts`), and every tool's own limit keeps both ends. The real gaps were that the
room cut could chop off a command's end, and that non-command results had no saved copy.

**Tested 2026-11-12:**
- Kept places at 32k vs 64k (small model, Z13): see `engine-dependencies.md`.
- Desktop (RTX 4070 SUPER, separate engine copy in `~/yc-test-226`, port 9990, the app's
  own 9B file read-only): 64k takes 8.2 GB of 12.3 GB (32k: 7.4); replies 54-65 tokens a
  second; forcing the faster-writing trick on a model without the heads fails the load,
  which is the failure the safety net catches.
- **The desktop stopped accepting SSH logins during the third run** (kept places, 9B,
  64k). It still answered pings and its own app still answered; cause unknown. A test
  engine may still be running there. `~/yc-test-226` is still on it and must be removed
  once it can be reached. Two read-only requests were also sent to the live app's ports
  (9920, 9900) by mistake during the look-around; reported to Destin.

**Independent final review (2026-11-12, fresh reviewer, whole branch against master):** no way
found to lose history or leave a tool call without its result. Six findings, all fixed in app
commit `b6ec48456`: Summarise after the engine's own refusal had no fallback; the 64k default
demoted people who chose their own size; an overlapping load could end the retry without the
trick early; a local model was reported "loaded" before it was; a retry that could not start
left the trick off and lost the error; a slow summary read was timed out. `verify.sh --full`
passes after the fixes. Left as known, not fixed: every restored local chat is read ahead one
after another at app start (chip busy for minutes with several chats); one stuck read-ahead
holds up the others; a cut-off summary is retried once unchanged.

**Engine check of the safety net (Z13, separate engine on port 9990, small model with the trick
forced):** the load answers HTTP 500 "failed to load" in under a second; after the settings
file is rewritten and `GET /models?reload=1`, the same load answers 200.

**Not done:**
- Destin's word to ship.
- Faster-writing speed on NVIDIA: needs a dense model with the heads that fits 12 GB.
- Windows on the desktop: not reachable (key expired); nothing measured there.
- The come-back re-read and the safety net are unit-tested only, not yet watched in a
  running dev app.
- Follow-up card to file after Destin's OK: real-world testing across model sizes,
  hardware and settings, and choosing the default context per device (his Q-2 note).

## Where it stood on 2026-11-09 (history)

Everything in the card's finish line is built and `bash scripts/verify.sh --full youcoded`
passed. NOT merged; awaiting Destin's review.

**Push state of the app branch:**
- On GitHub: the warm-up, per-chat slots, `--no-cache-idle-slots` and their docs (up to
  `78d838c8c`).
- **Six commits local only** (`b3b0b1e29` … `c83ab6ed1`, table below). The secrets scan
  flags a line in `desktop/tests/engine-manager.test.ts` (commit `efaa9558d`, rule
  generic-api-key) whose "key" is the model-file field name for the expert count — a
  false positive. Marking it (fingerprint in `.gitleaksignore`, or a `gitleaks:allow`
  comment) needs Destin's OK; nothing is pushed until he gives it. Never bypass the scan.
  (Commit `0dbaf88f7` on the workspace branch quoted that line and is held by the same
  scan; the quote is removed in the commit after it.)

**Built on the branch:**

| Item | Outcome | Commit |
|---|---|---|
| Warm-up | A new local chat's opening is read in the background; the first reply starts in about a second instead of after 1-3 minutes (`harness/local-prewarm.ts`). | pushed |
| Per-chat slots | Each chat keeps its own engine slot (`engine/slot-pins.ts`) and idle slots are no longer cleared (`--no-cache-idle-slots`): follow-ups in up to three open chats read ~20 tokens instead of ~22k. | pushed |
| Fault 3, engine left "busy" | The model-load "hi" and the model check read their answer only on failure, so every successful load left a request counted as running: settings waited 10 minutes to apply and idle shutdown never fired. Both read it now; an aborted request also stops counting. | `b3b0b1e29` |
| Fault 1, tool results vs the window | Cut to the room below the compaction trigger before history/transcript (`tool-result-room.ts`, 3 chars/token, floor 2,000). | `b3a125c1e` |
| Fault 2, junk summaries | `isJunkSummary` + one plain-prose retry; junk twice keeps history. | `b3a125c1e` |
| Fault 5, two too-long errors | `ContextCannotFitError` classified like the engine's refusal: one card, with Summarise. | `b3a125c1e` |
| Fault 4, cloud ids sent to the local engine | Already fixed earlier on this branch by `04c209dc3` (only `local-engine` bindings warm/load); the bug is in v1.3.3. Stale config entries are inert and left alone. | — |
| ROCm wording | "Try ROCm (AMD) — usually slower in real use". | `253a19b92` |
| MTP drafting | On per model for DENSE models whose file has the heads; mixture-of-experts models left out. 27B: replies 6.7 → 11.6-11.9 t/s, rewrites 42 → 57, opening read ~4% slower, works with a vision projector. A model without the heads refuses to load with it (9B), hence decided per file. | `efaa9558d` |
| Speculative decoding copy | "Faster replies, most of all when text repeats." | `1552bd6e0` |
| Too-long diagnostics | A too-long turn logs the refusal's token counts (digits only). | `c83ab6ed1` |
| Rule | `.claude/rules/engine-local-models.md`: every `trackedFetch` caller reads or cancels its body, success too. | workspace branch |

**Decided:**
- ROCm stays an optional build under Advanced, never chosen automatically. Fresh engine:
  it reads 20-25% faster; once other chats' readings are kept (which the app now does) it
  is slower than Vulkan (9B 173 s vs 144 s; 35B over 300 s vs 114 s). Writing about equal.
- Keeping three chats' readings stays: at real chat sizes it costs a new chat nothing on
  the 27B and 6% on the 35B MoE.
- Not adopted (measured on the 27B): separate per-slot memory (quadruples context memory)
  and `-ctk q8_0 -ctv q8_0` on the shared pool (92-96 s vs 99-111 s, but fatal with
  `-fa off` and unmeasured on the smaller models).

## End-to-end check (isolated dev app, Qwen3.5-9B, 32k window, the desktop's question)

Run 2 went through cleanly: the 52k-character file was cut to 35,727 characters with the
"read the rest" notice, two real summaries ("## Goal …"), 22 tool calls, ~20.9k of 32k at
the end (then paused on a permission ask for a command outside the project, by design).
Run 1 ended once with a too-long refusal right after the cut read (~22.6k real tokens by
the 9B tokenizer). The "reply allowance pushed it over" theory was tested on the engine and
is FALSE (21.4k prompt + 11.5k max_tokens is accepted). Not reproduced; the token-count
logging above is there to diagnose a recurrence.

## The five faults as found (desktop, YouCoded 1.3.3, Qwen3.5-9B-UD-Q4_K_XL, RTX 4070 SUPER)

Read-only from the desktop's saved conversations and settings (sessions `1e4e887b…` and
`888eb255…`).

1. One `Read` of `ModelPicker.tsx` (52,733 characters) filled a 32k window after an 11k
   opening; the next request failed the pre-check ("cannot fit this model's context window").
2. Auto-compaction's "summary" was only a `<tool_call>` block and was accepted; one more
   read later the ENGINE refused ("too long for this model").
3. A context change made at 15:13:11 applied at 15:23:11 — the 10-minute limit — with no
   reply running. Chat 2 started inside that wait and so still ran at 32k.
4. `~/.youcoded/config.json` held local-engine entries for cloud models (`gpt-5.6-sol`,
   `~deepseek/…`) with "model not found" errors.
5. Faults 1 and 2 ended with different words, and only the second offered Summarise.

## Still open (not in the finish line)

From this session:
- Windows and macOS: none of the speed work was measured there.
- 9B and 2B kept-reading cost (the 27B/35B result stands).
- Picking the context size from the hardware instead of the fixed 32,768 default (the
  desktop's 12 GB card could likely hold 64k for the 9B) — larger, riskier.
- Model sleep (15 min) drops every kept reading; the warm-up costs a slow model 2-3
  minutes of chip time per opened chat.

Carried in from the merged cards:
- (#48a) Two models that cannot both fit: Destin chose "warn and let me choose"; not built.
  `docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md`.
- (#48b) Engine builds upstream ships that we do not offer (Intel SYCL, newer CUDA,
  Android) — time both reading AND writing on the target machine first.
- (#48c) Parity with LM Studio / Ollama / Jan: unload a model by hand, embeddings for local
  search, a draft-model picker (MTP covers most of its point), a real hardware page.
  `docs/active/investigations/2026-09-04-local-model-runner-audit.md` §4.
- (#49) Engine install unpacks with a program the app does not ship; "Add vision" links
  missing until the screen is reopened; auto-sleep / shutdown times not settable.
- (#50, parked) "Run in background" serving other apps after the window closes; DiffusionGemma.

## Research leads not pursued (web research, 2026-11-08)

Ranked by likely payoff; each needs a measurement on our build before use.
- ~~`ROCBLAS_USE_HIPBLASLT=1` and `GGML_HIP_ROCWMMA_FATTN`~~ — **measured 2026-11-13, neither
  fixes ROCm's fade**; slot save-to-disk measured the same day (works on Qwen3-0.6B, silently
  re-reads on Qwen3.8-27B). Numbers: `youcoded/docs/engine-dependencies.md` → "ROCm vs Vulkan,
  measured". Scripts: `scripts/engine-bench/run.sh`. Follow-ups: cards #262, #263, #264.
  Still not tried: `-np 1` on ROCm.
- q8 K+V cache on the smaller models (measured on the 27B only).
- `--load-mode` / no-mmap on unified-memory machines; ubatch sweeps (RADV collapsed at
  ubatch 512 at 32k depth before PR #27703).
- Skipped: forks (ik_llama.cpp — no router mode, mixed results), the NPU path (FastFlowLM
  — proprietary kernels, few models), kernel parameters (`amd_iommu=off`,
  `amdgpu.lockup_timeout`) — admin changes an app cannot make.
- Sources: ggml-org/llama.cpp #19523, #30364, #22384, discussion #23659; Level1Techs
  "Strix Halo LLM inference notes"; llm-tracker.info Strix Halo; sleepingrobots.com MTP on
  Strix Halo; Phoronix ROCm 7 on Strix Halo.

## History worth keeping

MTP was first found to help on 2026-07-14 (+25% on the 35B) but the note lived only in
`knowledge-debt.md`, deleted 2026-07-15, and never reached a card — which is why it was
"rediscovered" here. Scripts and raw logs from this session were in the session scratchpad
and are not kept.
