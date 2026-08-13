---
status: active
created: 2026-08-11
---

# Super-agent roadmap — verified sequence for consolidating the best harness mechanisms into YouCoded

**Status:** ACTIVE plan, 2026-08-11. Ordered sequence agreed with Destin; step 1 is next up.
**Provenance:** produced by the Frontier-AI-Lab-Assistant workspace (`~/YouCoded/Projects/Frontier-AI-Lab-Assistant`) in three passes, all on 2026-08-11: (1) a competitive research pass over nine harnesses/agents (43 fetched sources; distilled in that workspace's `knowledge/engineering/harnesses.md`, snapshots in its `library/`), (2) an eval-infrastructure audit of this repo and ask-the-budget-az-dev, and (3) a three-agent **code verification pass against this repo at master** that corrected the doc-derived recommendations with file:line evidence. Claims below reflect the *corrected* picture.
**Re-check trigger:** any claim about "what exists today" is dated 2026-08-11 against master; re-verify entry points before building on one after significant harness changes. The landscape file it draws on has a 30-day freshness window.

## Where the native harness stands vs. the field (verified)

Already at or above field standard — do not rebuild:
- **Context overflow:** three layers — two-stage compaction (prune tool outputs → LLM summarize; `src/main/harness/compaction.ts`, `harness-session.ts:738-777`) on real provider token counts, pair-aware sliding-window floor (`harness-session.ts:640-686`), per-tool truncation (`tools/registry.ts:7`); local-window discovery + registry clamps (`capability-profile.ts:197-201`).
- **Permission policy:** 4-layer allow/ask/deny engine, 3 modes, destructive deny-list, hard credential-path denies, loop-enforced default-ask (`permission-engine.ts:22-43`, `harness-session.ts:1539-1638`, `shared/permission-types.ts`).
- **Instruction interop:** AGENTS.md/CLAUDE.md git-root walk-up with heading-preserving budget fitter (`prompt-assembly.ts:40-67`, `injection/injection-budget.ts:143-187`); path-triggered nested rules as messages (`injection/path-triggers.ts`).
- **Prompt/KV discipline:** byte-stable prompt assembly as a documented invariant (`prompt-assembly.ts:1-3`); cache-aware prefill accounting.
- **Replay foundation:** append-only session JSONL with intent-ordered writes and a real resume/replay path incl. crash-orphan healing (`session-store.ts`, `history-rebuild.ts:125-159`).
- **Remote drive:** token-authenticated HTTP+WS server can already run the harness externally, off by default (`remote-server.ts:262-339`; ops incl. `native:send`, permission responses).

Verified absences (the actual work):
- **No agent memory of any kind**; chatsearch not exposed to the agent (zero `chatsearch` refs under `harness/`).
- **No wire log**: model request payload (system prompt, tool schemas) never persisted; resume cannot reproduce the request. Persistence is persist-alongside, no fsync (`native-session-host.ts:12-15, 402-415`).
- **No OS sandboxing; Bash uncontained** — guards self-describe as "honest friction, not a sandbox" (`tools/guards.ts:1-11`); sensitive-path deny does not cover Bash.
- **No goal semantics** — only step/doom-loop gates (`harness-session.ts:1058, 1195-1204`, `model-step-budget.ts`).
- **No Anthropic cache breakpoints** — zero `cache_control` anywhere despite the stable prefix being done.
- **No prompt-regression evals** — the review battery tests tools, not shipped prompts, and produces prose, not scores (see eval audit).

## The sequence

Rule of ordering: **measurement before mutation, durability before memory, containment before autonomy.** Effort: S = a session, M = a few sessions, L = a real project.

1. **Error analysis on stored conversations (S–M).** Read 50–100 real traces from the conversation corpus; produce a failure taxonomy with counts + exemplar trace IDs. Method per Hamel Husain (see `templates/evals/README.md` step 1 in the assistant workspace): open-ended notes → cluster → first-upstream-failure annotation → single human owner of quality calls; stop at ~20-trace saturation. Output seeds step 2's test cases.
   **Accelerator (built 2026-08-11):** `youcoded/desktop/test-engine/conversation-triage.mjs` — free deterministic scan over the whole corpus (first run: 1,655 sessions parsed, 1,193 flagged; 3,302 tool errors, 669 user redirects, 621 assistant apologies, 489 user interrupts) + capped cheap-LLM classification of flagged excerpts into candidate categories. The triage output pre-ranks what the human pass reads; it does not replace it — Destin still owns the final taxonomy.
2. **Wire the eval suite (M).** ~~Promptfoo config + CI gate~~ — **shipped 2026-08-13 as a native evaluator instead** (`youcoded/desktop/src/main/harness/eval/`, CLI `test-engine/harness-eval.mjs`; spec + plan dated 2026-08-12). It runs any case across a matrix of code version × instruction file × model, grades each run with free mechanical checks read from the event stream *and* an LLM judge whose every grade must quote the text it scored, and refuses to spend without a printed estimate under a hard cap. **Promptfoo was considered and rejected:** its assertions read the provider's returned *string*, so every event-stream check — which tools were called, whether the model asked or guessed, whether it tried to leave the fixture — has to be smuggled through as JSON and asserted in `javascript:` blocks, and that is the half of the job we care most about. Its main draw is the CI gate, which is out of scope. Still open from this step: the **CI gate itself**, and driving case selection from step 1's taxonomy (the four shipped cases were hand-written). First real use (20 runs, $6.50) measured the cost estimator at ~8× high and settled a live `CLAUDE.md` guidance change. This is the seatbelt for steps 4–8. Completing it triggers the `eval-runner` skill (assistant workspace ADR-004/ADR-012).
3. **Hygiene (S).** (a) Merge or re-verify the two unmerged battery-runner branches (`feat/review-run-facts`, `feat/review-runner-resilience`) — today a 2-tool-call degenerate run appends its review silently; find out why the daily anchor check isn't failing on `harness-review-runner.md`. (b) ask-the-budget batch: pre-push hook (pytest + free Layer 1 eval), `--repeats 3` baseline standard, 3 README drift fixes.
4. **Anthropic cache breakpoints (S).** Add `cache_control` on the cloud path; prefix stability already guaranteed by design. Immediate cost savings; regression risk covered by step 2.
5. **Finish the event log (M).** Persist a per-step wire record (system-prompt hash/text + tool-schema set), await `tool-use` appends before execution, fsync at turn boundaries. Ground truth for battery scoring; prerequisite for faithful resume and step 6.
6. **Memory system (L — centerpiece).** Chatsearch as a native tool; bounded agent-maintained index file (Claude Code auto-memory design) + on-demand topic files; pre-compaction flush wired into `maybeCompact` (OpenClaw design). After 2 (behavior change needs eval coverage) and 5 (needs the durable log underneath).
7. **Bash containment (M).** Extend sensitive-path denies to shell commands; OS sandboxing (bubblewrap) behind the existing permission engine — the missing enforcement axis (Codex design). Before 8: no goal-driven autonomy while `cat ~/.ssh/id_rsa` works.
8. **Goal layer (M).** Checkable goals + goal queue on the existing `max_steps`/doom-loop machinery (Kimi Code design). Last of the harness features: autonomy amplifies whatever the harness is, so it lands on the safest, best-measured version.
9. **Formalize the remote protocol (L, background).** Version + document the existing WS API, add a lifecycle event bus, eventually reconcile Android's separate Kotlin runtime. Strategic consolidation milestone; nothing above depends on it.

## Cross-references

- Landscape + steal-list with citations: assistant workspace `knowledge/engineering/harnesses.md` (sources snapshotted in `library/`, accessed 2026-08-11).
- Eval audit findings + observable checks: assistant workspace `ops/changelog.md` entries dated 2026-08-11.
- Deepest single sources: `library/openclaw/memory-system.md`, `library/badlogic/context-compaction-research.md`, `library/moonshotai/kimi-code-docs-sessions-goals.md` (in the assistant workspace).
