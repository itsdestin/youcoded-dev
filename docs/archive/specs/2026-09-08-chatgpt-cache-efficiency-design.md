---
status: shipped
date: 2026-09-08
---

# ChatGPT cache efficiency: diagnostics and faithful continuation

## Authorization and scope

Destin approved all three approaches discussed in chat: privacy-preserving per-request diagnostics, append-only specialist status updates, and preservation of OpenAI continuation state. This document pins down the implementation contract for review. No status-bar redesign, cache-key strategy change, paid evaluation, production configuration change, release, commit, or merge is authorized by this document.

Implement in that order, with separately testable changes. This is a backend reliability change with no proposed UI surface. The existing cache-efficiency and ChatGPT reasoning roadmap entries remain the planning authorities; do not duplicate them or close the broader cloud/local backlog.

## Evidence and limits

The prior investigation traced correct cached-input / total-input accounting and measured low recorded reuse as well as high-reuse sessions. The chip is cumulative and specialist-inclusive. Low recorded reuse is not proof that every missing token was eligible for caching.

Current code removes and re-appends specialist status, reconstructs assistant history from text and parsed tool calls, and does not preserve encrypted reasoning or assistant phase. SessionStore persists display transcript events, not a faithful model-history checkpoint. A fresh isolated checkout at app commit 7b49e014 was established for this work; implementation must recheck the exact seams rather than copy prior line numbers.

Missing raw cache detail must be distinguishable from a real zero in new diagnostics. Do not claim missing reporting occurred in the investigated responses. Do not claim a cache-percentage improvement from reasoning preservation without measurement.

## 1. Request diagnostics

### Collection

Observe the final serialized ChatGPT Responses request at the provider boundary, after middleware and SDK conversion, and correlate it with its own response usage. Distinguish transport attempts, successful responses, failed attempts and aborted requests. Title generation, summary requests and specialists must not overwrite the normal conversation comparison baseline. Assign separate identities for conversation/request-purpose lane, logical model step, and transport attempt (including the authentication wrapper's internal 401 resend). IDs are local bookkeeping, not new wire fields. Observe each actual send inside the credential-owning wrapper without retaining headers or tokens.

Compare attempts to the last dispatched attempt in their lane, assigning dispatch sequence and advancing that baseline at dispatch, not completion. A separate last-successful-request reference is updated only by a newer dispatch sequence after success. Record which reference was used; neither reference proves the backend cached a prefix. Out-of-order responses cannot roll either baseline backward. Aborted and failed attempts retain their own outcome without inventing successful cache writes. Record auth-resend parentage so identical 401 retries are not mistaken for new logical steps.

Record only an allowlisted schema: version, opaque local session/request identifiers, timestamps and durations, model, request purpose where available, input/output/cache counts, explicit cache-detail presence, input-item counts, first differing input-item index, stable-prefix item count, and changed-component flags for instructions/tools/model/relevant generation settings/cache-key continuity. Item counts are not token-prefix counts and must not be labelled as such.

Keep per-item fingerprints in memory for comparison, using a per-process random HMAC key. Do not persist that key or raw item fingerprints. Persist only aggregate differences and counts. Restart creates an explicit new baseline, not an assertion of a cache miss. Fingerprint exact serialized item content and preserve ordering; classify legitimate appends separately from edits or removals.

Never log request bodies, message text, tool arguments/results, images, encrypted reasoning, authentication headers, tokens, account identifiers, raw cache keys, or raw provider error bodies. Diagnostics must not change request payloads or consume a response stream before the SDK can read it. Missing raw usage remains unknown; record partial/failed observations without inventing zero counts.

### Storage and failure behavior

Use an app-profile-local diagnostic file, separate from synced conversations and ordinary report-bug logs. Bound storage to two rotating files of at most 5 MiB each; keep serialization and writes off the generation-critical path with a bounded queue. Queue only sanitized metadata, never raw requests or response streams. Bound the queue to 1,000 records, retained fingerprint state to 8 MiB total, and unfinished observations to 256 with a 10-minute expiry. Evict least-recently-used inactive lanes first; if necessary drop an observation and mark its next comparison as a new baseline. Record aggregate dropped/evicted/expired counts so missing coverage is visible. Drop excess diagnostic records rather than delaying model output. Fingerprinting and request parsing still have CPU cost at the observation boundary: measure it with representative large requests and do not claim that asynchronous file writes make that cost disappear. Restrict file permissions on platforms supporting them. A logging failure never fails a conversation or recursively logs sensitive exceptions.

Tests inject a temporary directory and clock. No production reads or writes are needed for verification. The feature collects local metadata only; automatic uploads and new settings UI are out of scope.

## 2. Append-only specialist status

Keep prior status messages unchanged. Append a new compact snapshot only when the meaningful specialist status changes. New snapshots explicitly supersede previous snapshots; the newest snapshot is authoritative. Transition from an existing nonempty status to no reportable specialist state emits one clearing update. Completed or failed specialists with undelivered reports remain reportable; running-only filtering is forbidden. A status-read failure is unknown, not evidence that specialists finished, and must not clear prior state.

Compare structured snapshots keyed by stable task identity before formatting them. Equality includes lifecycle status, delivery state, stale state and meaningful report/failure changes; it excludes elapsed time. Sort by stable identity. Do not infer equality by stripping timestamps from rendered strings. A pure helper formats only changed snapshots. Repeated unchanged status produces no additional message. /clear resets the remembered snapshot so the next turn can append current reportable state without resurrecting pre-clear history.

Resume and compaction must either restore the last authoritative status from retained history or append a fresh authoritative snapshot without rewriting earlier messages. Old contradictory snapshots can be removed only as part of the existing explicit compaction boundary, not silently between normal turns.

Pin prefix equality, unchanged suppression, changed status, clearing status, callback failure, resume, and completion notice behavior. Preserve existing specialist delivery and tool-call/result pairing contracts.

## 3. Faithful OpenAI continuation

### In-memory history

Retain the SDK's ordered assistant response parts and their supported OpenAI continuation metadata on successful completed requests, rather than flattening them into text plus tool calls. Preserve encrypted reasoning, item identifiers, assistant phase, and original ordering. Use the SDK's completed assistant response.messages representation, not another stream assembler. Round-trip support in this branch's resolved SDK is a prerequisite: fake-stream tests must inspect the next outgoing Responses body and prove each promised field survives. If a pinned dependency lacks support, report a blocker rather than silently omitting the field. Use a small typed adapter and an allowlist, not unrestricted metadata spreading.

Only assistant response messages enter history from this path: locally executed tool results remain owned by the existing tool loop and must not be duplicated. Existing visible transcript events, permissions, tool execution and stream timing remain unchanged. A reasoning-only response must preserve existing empty-response recovery semantics rather than silently altering the turn termination policy.

Abandoned retry attempts never commit continuation. Interrupted partial responses retain existing visible partial-text semantics without replaying incomplete encrypted reasoning or dangling tool calls. Completed prior steps remain available. Pruning, fitting, and summarization must preserve valid item grouping and call/result pairs; removed turns lose their associated continuation as one unit.

### Durability and provider isolation

Keep continuation in a local, versioned accepted-history manifest owned by the session store, not in renderer transcript events, chatsearch, portable conversations, sync files, or bug-report attachments. The manifest defines ordered accepted messages, assistant-step boundaries, ordered part descriptors, exact transcript event/part references, allowlisted continuation metadata, and retained-history/compaction boundaries. Restore from this manifest, never by overlaying metadata onto array indices from rebuildHistory. Existing rebuild merges text parts, infers steps from adjacency, ignores compact-summary, and re-reads images; it is not an exact restoration authority.

Reference persisted text/tool content rather than duplicate a full conversation. Store small history-only injected messages where no transcript reference exists, plus transformation descriptors sufficient to reconstruct pruned content. Summary text can reference its persisted compact-summary event with an explicit retained suffix. Validate image content digests against the files actually re-read; a missing or changed image invalidates faithful restore rather than claiming the new pixels are identical. Do not duplicate image bytes. The manifest must also validate the original system/instructions and tool/configuration identity before claiming faithful restoration; a reassembled different prompt is a new baseline. Treat all sidecar content as private conversation data and opaque encrypted reasoning as sensitive even though the app cannot decrypt it.

Use atomic replacement and serialized session writes. Publish a checkpoint only after every referenced transcript part has been flushed and successfully persisted. Explicitly enumerate accepted response parts/ranges: existence on disk alone does not prove acceptance because abandoned attempts can have already flushed text. Reject abandoned-attempt ranges even when they remain in visible JSONL. A monotonic session generation/revision guards asynchronous publication; deletion, /clear, binding changes and checkpoint invalidation fence late writes. A checkpoint is eligible only when its accepted-history manifest, transcript anchors, revision and provider/model/account binding match. Persist a non-secret binding identifier; never an OAuth token. Reject stale, malformed, oversized, mismatched or orphaned checkpoints and fall back to ordinary transcript reconstruction. A checkpoint failure must never lose visible conversation content or prevent resume. Log only a non-sensitive fallback reason.

Local reopen with a valid checkpoint restores continuation. Cross-device takeover or an old session without one uses the existing text/tool transcript fallback; this pass does not sync private continuation. Explicit provider/model/account changes invalidate incompatible continuation rather than forwarding it to another backend. Session deletion removes its sidecar. Compaction invalidates removed anchors and keeps only compatible retained state.

Bound each sidecar to 16 MiB. If the bound is exceeded, preserve current in-memory continuation but skip durable continuation for that checkpoint, with an explicit local diagnostic reason. Do not truncate an encrypted item. Oversize or failed replacement invalidates eligibility of the older checkpoint; never silently revive it. Eligibility must also reject an older checkpoint when durable transcript state has advanced beyond its accepted revision. A failed unlink must not make a stale sidecar eligible. Tests must prove safe fallback and absence from all public transcript/export paths.

### Transformation and sizing policy

Request-only fitting creates a temporary outgoing projection and does not rewrite the accepted-history manifest. Persistent tool-result pruning updates its transformation descriptors and revision. Successful summarization replaces the manifest's old prefix with a summary reference and explicit retained suffix. Any transformation that cannot be reconstructed exactly invalidates durable restoration rather than approximating it. /clear is an explicit context-generation barrier for both continuation and remembered specialist status.

Opaque ciphertext length is a storage/network-size measure, not a token estimate. Exclude encrypted payload strings and provider identifiers from the ordinary chars/4 estimator. Preserve provider-reported reasoning-token counts per accepted step separately when available, and count the retained step's reasoning once conservatively; do not divide encrypted bytes by four or count both summary text and the same reasoning estimate. When reasoning usage is unavailable, mark the sizing estimate incomplete and prefer measured input/context usage for pressure decisions; do not represent unknown reasoning as a known zero. Pin the fallback and compaction behavior in tests, including a large ciphertext with a small reported reasoning count.

## Verification and measurement

Write failing tests before implementation. Use fake Responses streams through the actual SDK/provider boundary to verify final outgoing requests, raw missing-vs-zero cache detail, request correlation, append-only comparisons, and faithful continuation over multiple tool steps. Inject retries, aborts, malformed sidecars, stale anchors, account/model switches, and compaction. Test privacy with sentinel secrets and confirm no diagnostic or public export contains them.

Run related suites after each part and the workspace desktop verify.sh before claiming completion. Obtain a fresh independent code review. Check Android/remote consequences from actual touched boundaries; no new IPC or shared UI fields are intended. Report platform checks actually executed, not assumed parity.

Provide a local diagnostic summary command that compares token-weighted reuse, fresh input, output tokens, missing-report coverage, prefix-change categories and timing by session/model/request purpose. It must operate on allowlisted diagnostic records, not load prompt bodies. Compute token-weighted reuse as summed cached input divided by summed input only over successful requests with valid cache reporting. Fresh input uses that same subset. Report overall input/output separately and display both request-count and input-token reporting coverage; missing cache counts never enter the valid subset as zero. Compare a baseline and each fix separately when approved real observations exist. Offline tests establish correctness, not real cache savings.

Acceptance proceeds as four checkpoints without dropping any approved work: diagnostics, append-only status, in-memory continuation, then durable restoration. The final checkpoint includes crash-window tests (before transcript flush, after flush but before manifest publication, and after publication), flushed abandoned text followed by successful retry and reopen, late write after clear/deletion, oversized replacement with an older sidecar, changed images, compaction/pruning, and parallel tool-result round trips. Resolve branch dependencies before running SDK contract tests; the reviewed lockfile pins ai 7.0.89 and @ai-sdk/openai 4.0.55, but neither is installed in this worktree at review time. Tests against another checkout are not evidence of this branch passing.

Offer the existing harness evaluator for the instruction/continuation changes. Do not run paid evaluations or consume plan quota through synthetic model calls without explicit approval. No promised percentage target; success is preserved request history and measurable, privacy-safe evidence of what the backend reused.

## External review disposition

Source: final review handoff in local conversation d9c707a8-7862-4d8c-9c5d-c098fc09ccb4 (the reviewer did not write a review file). Reviewed against this isolated checkout; no runtime tests have been run for these design revisions.

1. **Accepted — defined restoration model.** history-rebuild.ts:65–78 merges text; :95–102 reloads images; :149–151 ignores compact-summary. Adopt the accepted-history manifest rather than index-based metadata overlays. Reject a duplicate full-history snapshot and do not narrow the promised durability to trivial histories merely to avoid the problem; exact reconstruction or explicit fallback is required.
2. **Accepted — acceptance and persistence barriers.** session-store.ts:94–108 documents already-flushed abandoned text. Add accepted ranges, flush-before-publication, revision fencing, stale/oversize handling, clear and crash tests.
3. **Accepted — distinct transformations and opaque sizing.** harness-session.ts:1338,1380,1487,1517 persistently changes history; fitToContext projects requests; clearHistory resets it. message-size.ts:25–39 recursively counts strings and would mis-size encrypted payloads. Separate these contracts and retain measured reasoning usage where available.
4. **Accepted — diagnostics identity, bounds and coverage.** chatgpt-auth.ts:883–898 resends inside the auth wrapper. Add actual-attempt identity, summary lanes, dispatch-ordered baselines, memory/observation bounds, drop counters and known-report-only ratios. Do not interpret client baseline matches as proof of server cache residency.
5. **Accepted — reportable status, not running status.** native-session-host.ts:2631–2645 includes undelivered completed/failed state and elapsed time. Compare structured state before rendering; clear only when no reportable state remains.
6. **Accepted — SDK contract is mandatory.** The lockfile pins the reported versions and this worktree has no installed SDK. Next-wire-body tests on resolved branch dependencies gate all promised continuation fields; splitting in-memory and durable acceptance is staging, not deferral.

No finding was rejected as technically unsound. The review's optional scope-reduction alternative was not selected because the accepted-history manifest better serves the approved local-resume goal. Real-world cache improvement remains unmeasured.

## Review checklist

- All three approved approaches covered; no chip redesign or broad cache backlog expansion.
- Diagnostics do not duplicate private content; bounded queues/files and failure isolation specified.
- Status updates handle unchanged, clearing, failed-read and resume cases.
- Continuation handles successful steps, retries, interruption, compaction, resume, binding changes and deletion.
- Cross-device fallback and local storage limits are explicit trade-offs.
- Tests and real-world measurements have separate acceptance meanings.
