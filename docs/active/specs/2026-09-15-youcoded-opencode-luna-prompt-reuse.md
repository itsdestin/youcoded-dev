---
status: active
date: 2026-09-15
type: spec
tags: [native-harness, chatgpt, prompt-cache, continuation, evaluation, opencode, luna]
---

# YouCoded vs OpenCode: GPT-5.6 Luna prompt-reuse experiment

> Reconstructed 2026-09-22 from the approved design in this conversation. The original uncommitted file and its worktree disappeared; this is a reconstruction, not a byte-for-byte recovery. This worktree was created as `prompt-reuse-luna-recovery` from current fetched master. Reconfirm baseline versions before testing.

## Decision and authorization

Destin approved a controlled real-account comparison of YouCoded and OpenCode using ChatGPT-plan `gpt-5.6-luna`. The first experiment covers ordinary multi-turn agentic work followed by a clean process restart and continuation of the *same* session; it does not force compaction. Choose the provider-usage approach, not HTTPS interception or a UI-only smoke test. Use an isolated OpenCode **1.18.31**, not the installed **1.17.10**; never modify the installed OpenCode or the running built YouCoded app. Three repetitions per client were approved in the design discussion. The subsequent request to rebuild the missing worktree does not by itself authorize launching the live experiment.

No OpenRouter spending, production-app access, commit, push, merge, release or product-behavior change is included. ChatGPT-plan quota has no dollar cap; quota safeguards must be enforced before live runs. The initial design allowed one compatibility probe per client and a single retry only for identified infrastructure failures, not for disappointing agent results.

## Question and scope

> During an equivalent multi-turn Luna coding task, how efficiently does each client reuse prior prompt input, and does that reuse and provider-native continuation survive a full client-process restart?

Compare real ChatGPT OAuth routes, not API-key or OpenRouter approximations. Since clients have different system prompts, tools and agent trajectories, judge reuse of *each client's own previous prefix*, not raw prompt size alone. In scope: root chat requests, cache reads/writes where reported, fresh input, warm turns before restart, first and later turns after restart, accepted reasoning/item metadata survival, correctness and task-state retention, timing, coverage and limitations. Exclude forced compaction, specialists, model-quality ranking beyond fixture checks, UI changes, traffic interception, undocumented backend TTL claims, and clients other than YouCoded and OpenCode.

## Arms and isolation

**YouCoded:** run the native harness from this session's isolated app worktree and dedicated dev profile using the supported dev launcher. Do not attach to, message, reload, signal, or inspect held-open state of the built app. Read only the dedicated profile's privacy-safe ChatGPT request diagnostics: input/output/cached input, outcome, duration, purpose, item-prefix classification (`baseline`, `identical`, `append`, `edit`, `remove`), and component-change flags. The restart must destroy the experiment process and reconstruct the same session from persisted transcript and accepted-history state; an object reset is not a restart.

**OpenCode:** use an isolated 1.18.31 installation and dedicated XDG config/data/cache roots, never the machine's existing OpenCode installation or its auth directories. Authenticate this isolated profile through supported ChatGPT Plus/Pro OAuth. Collect only documented output and stored usage fields (input/output/reasoning/cache reads/writes and, if available, duration); inspect metadata only for allowlisted evidence that continuation fields are present and restored, without copying ciphertext. Restart the process and resume the same session ID.

**Both:** exact model `gpt-5.6-luna`, independently authenticated on the same ChatGPT account, comparable reasoning effort and text verbosity wherever both expose them, default first-party tools only, optional plugins/extensions disabled, identical disposable fixtures and ordered user turns. Run sequentially and alternate order over three repetitions: YouCoded/OpenCode, OpenCode/YouCoded, YouCoded/OpenCode. Record short restart gaps and actual settings. One unscored one-line Luna compatibility probe per client confirms routing. On failure, report compatibility failure, not a cache score; never substitute models.

## Fixture and six-turn workload

Create an immutable template, cloned byte-for-byte into six disposable roots. It contains a small deterministic application, identical project instructions, a seeded configuration disagreement with one intended fix, a second independent mechanically checkable change, local tests with meaningful initial/final states, and stable marker facts for the restart check. No secrets, network dependency, package installation, or shared-checkout dependency. Keep it big enough for realistic reads/tool outputs, small enough to avoid compaction. Offline tests must prove identical initial clones and that the verifier distinguishes required final states.

Send exactly the same six user prompts per repetition:

1. Read project instructions, inspect the app, and report structure and marker facts.
2. Diagnose the seeded configuration disagreement without changing files.
3. Apply the specified fix and run relevant tests.
4. Recall two earlier facts, make the second independent change, and run its focused check.
5. **After a full process restart**, inspect state, say what was completed before restart, and recover both facts without being retold.
6. Run the full fixture verifier and summarize both changes and test outcomes.

Prompts constrain outcomes, not exact tool calls; the real agent path matters. Mechanical checks, not polished prose, determine correctness.

## Normalized observations

Record arm, repetition, client/version/model, opaque experiment-local session label, phase (`compatibility`, `pre-restart`, `post-restart`), user turn and request sequence, purpose when known, outcome, nullable input/output/reasoning/cache-read/cache-write counts, nullable duration, nullable expected-rebuild flag, optional item-prefix classification/counts, and provenance of each field. Preserve failed/aborted attempts separately. Missing cache counts are **null**, never zero. No raw request content, real session ID or provider-native opaque material belongs in the normalized report.

The primary comparable subset consists of successful root-chat requests with valid input and cache-read counts. Exclude the unscored probe, each scored session's cold first request, auxiliary title/naming/summary lanes, failed/aborted attempts, and records lacking cache detail. Show excluded requests and auxiliary usage separately to prevent a falsely efficient result.

## Metrics and verdict

Report all three repetitions, then their median:

1. **Warm reuse rate:** `sum(cacheReadTokens) / sum(inputTokens)` on comparable requests.
2. **Fresh-input burden per completed turn:** `sum(inputTokens - cacheReadTokens) / completedScoredTurns`, using successful requests with valid cache detail.
3. **Restart retention:** first valid request after restart versus the last before restart and the pre-restart warm median; show the absolute value and percentage-point change.
4. **Unexpected misses:** substantial input with zero or materially low reads absent a *known* expected prefix change. YouCoded's direct prefix diagnostics and OpenCode's limited reporting are asymmetrical; OpenCode's unknown is not `false`.
5. **Correctness:** verifier result, final file state, tests, and turn 5's recovery of both pre-restart facts and work state. Reuse cannot win if context was dropped or task correctness is worse.

Also report total input/output/reasoning, cache writes where reported, request and token reporting coverage, requests per turn, latency/elapsed time, retries and errors, continuation-metadata presence before/after restart as booleans/counts, and YouCoded prefix-change distribution. Raw prompt size is context, not a reuse score.

Correctness gates the efficiency verdict: a client with fewer correct repetitions cannot be named the winner. With equal correctness, call YouCoded **clearly better** if median warm reuse is at least 10 percentage points higher *or* median fresh-input burden at least 20% lower, and the other efficiency metric is not materially worse; call it **clearly worse** for the inverse, or repeated restart-continuation loss while OpenCode retains it. **Roughly equivalent** means below both thresholds or opposing effects without consistent practical advantage. **Inconclusive** means fewer than two valid repetitions per arm, cache-detail request coverage below 70% in either arm, incompatible token semantics, or inconsistent run direction. **Compatibility failure** is separate: the arm cannot complete the Luna probe. Thresholds apply to this experiment only.

## Repetition and quota safeguards

Three scored repetitions per client, fresh session identity per repetition. Do not intentionally reuse another run's provider cache lineage. Preserve and report every attempt. Retry a repetition **once at most**, solely for identified infrastructure failure such as launcher crash before scored dispatch or OAuth expiry before dispatch; wrong edits, tool choices, excess exploration, and failed tests are outcomes, not grounds for rerun.

Enforce six user turns per repetition and a hard per-turn wall-clock deadline and per-repetition provider-request ceiling **specified numerically in the implementation plan before any live run**, identically for both clients where observable. Stop immediately on repeated transport failures, `model_not_found`, authentication refusal or an apparent agent loop. Hitting a ceiling yields an incomplete/failed repetition, not permission to extend quota. No automatic compaction/specialists/additional models. Unlike the OpenRouter evaluator, ChatGPT-plan quota cannot be protected by a dollar cap.

## Privacy and failure handling

Permitted report material: synthetic fixture content/diffs and the authored six prompts, sanitized errors, settings/versions, normalized token/timing/outcome records, opaque session labels, and booleans/counts for metadata restoration. Forbidden: access/refresh tokens, account IDs, auth headers, raw backend request/response bodies, raw cache keys or session IDs in the final report, encrypted reasoning or its fingerprints, non-fixture conversation data, and files from live or existing profiles. Use private isolated directories. Retain raw working data only locally and reduce it to allowlisted records; do not commit auth stores.

If Luna is unavailable, stop the arm without fallback. If OAuth is needed, pause for browser authorization, never ask for credentials in chat or copy existing profiles. Treat missing detail as unknown and lower coverage. If restart cannot resume the same session, score a continuation failure, not a substitute fresh chat. Preserve fixture divergence and score correctness failure. Report diagnostic writer losses instead of fabricating counts. If private data appears in collected output, stop, quarantine that output and correct the collector before live work. If client modification is required, report a blocker; never patch one arm after scoring starts.

## Implementation and verification contract

Before consuming quota: implement fixture, normalizer, scorer, report generator and isolated launchers; write offline tests for cloning and verifier discrimination, nullable usage parsing, subset selection, medians and thresholds, restart labeling, retry classification, redaction and ceilings. Run a no-network dry run with fabricated client streams through the complete report path. Confirm isolated OpenCode resolves to exactly 1.18.31 while system OpenCode remains untouched; confirm YouCoded launcher uses only this worktree and dedicated dev profile. Search dry-run outputs for credential/account/session/ciphertext sentinels. Run relevant tests and `bash scripts/verify.sh` if YouCoded desktop code changes. Obtain a fresh read-only review of the controller/privacy boundary before live runs.

Only after both isolated profiles authenticate and the compatibility probes succeed does the scored sequence start. The final Markdown report lists actual commands, versions, run order, normalized per-request/per-run tables, aggregates, correctness evidence, exclusions, coverage, limitations and plain-language verdict; separate observed backend usage from code-inferred behavior. No product fix is in scope. Evidence-backed follow-ups require a separate decision.

## Recovery note

Original design approval happened in three sections in this conversation (structure, scoring, execution), but the original written spec had not yet received a separate written-spec review. The loss occurred while it was uncommitted. This reconstruction preserves those approved decisions; request review of the recovered file before moving on to implementation planning.
