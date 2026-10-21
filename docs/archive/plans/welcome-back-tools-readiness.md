---
status: shipped
---
# Safe recovery while tool connections initialize

Completed task record for #163. App PR [#662](https://github.com/itsdestin/youcoded/pull/662) merged to remote master as `a6c47f79ae4120aea48e0e5c514a420ce81d5de7` on 2026-10-20; the merge tree exactly matches verified candidate `70a3ae925b21b7f8279cf712ab773936180d5dc6`. The first-stage concurrency plan is archived at `docs/archive/plans/welcome-back-recovery.md`; completed timing evidence is at `docs/archive/investigations/2026-10-18-welcome-back-runtime-measurements.md`. Neither historical record certifies the later integrated tree.

## Integration status (2026-10-20)

Destin first authorized integration-only preparation, then explicitly authorized merge/close on 2026-10-20. Publication, card closure and cleanup now proceed only after the final verified candidate and remote CI/ancestry gates. The isolated branches were fast-forwarded to app `2cbea2563` and workspace `a36a21b0`; source/document checkpoints and retained stashes preserve the pre-integration work. All conflicts are resolved and the combined tree is verified. No production app or real credentials were used.

- **Integrated desktop verification:** `verify.sh` exited 0: 10,606 tests passed, 36 skipped; types, test types, unchanged budgets, knip, lint/design lint, invariants, 422/422 screen checks, 8/8 journeys. Evidence: `/tmp/recovery-integrated-verify.log`, `scratch/verify-20261020-125542-212672/`.
- **Integrated Android:** shared backend compiled/packaged; rerun shell XML totals 108 tests, zero failures/errors/skips. Native-runtime and linked-web packaging were excluded; no APK/device claim. Evidence: `/tmp/recovery-integrated-android.log`.
- **Fresh integration reviews:** no outstanding actionable findings in the focused backend or renderer/state/record joins. Preserved upstream durable conversation queues, addressed Stop/direct transport, compaction boundaries, crash-draft authority, async skill preflight and controls alongside readiness/cancellation/exact-claim safeguards.
- **Current actual recovery:** one integrated 16-history stalled-connector run: Welcome back 2,961.5 ms, visible history 2,961.7 ms, first switch 273 ms; pending Retry close 70.3 ms/reopen 257.7 ms. Draft submission gate, explicit Continue, stale-choice refusal and zero unsolicited model calls passed. All 37 current copied transcript prefixes (240,216,080 bytes) remain hash-identical. This one sample meets the requested ceiling, not a universal latency guarantee. Evidence: `scratch/recovery-lab/result-1792528609708.json`, `integrated-prefix-integrity.json`.
- **Setup exclusions:** the offline hand-test offer had been cleared, and its two-day-expired fake-model catalog refreshed to real model metadata lacking the fixture model. The invalid trials did not reopen sessions and are not recovery timings. Only the private original fixture offer/catalog were reseeded before the valid sample; no original histories/credentials changed.
- **Cleanup:** obsolete first-stage plan and completed timing investigation archived; submitted blur approval retained. The duplicate Kit menu race correction is already on master, so its newer load-ready implementation/test were kept. Recovery-focused composer tests were extracted rather than raising the test-file ceiling. Temporary dev/profiler/provider services are stopped.
- **Publication:** app PR #662 merged after GitHub run `39496677806` passed its protected build/evidence gate, all four Linux test shards, all four Linux packages, Android JVM tests and debug/releaseTest APK builds. Remote ancestry and tested-tree equality were verified before closure/cleanup. No device-runtime or Windows/macOS execution claim; no release/tag or installed-app change. The stronger crash-durable report-acceptance limitation remains under existing helper/report card #71; no unsafe attempted-report reinjection was introduced.
- **Retained evidence:** aggregate verification, redacted scans, runtime timings and integrity results are privately preserved outside the disposable worktree at `/home/destin/.cache/youcoded-session-evidence/welcome-back-recovery-20261020/`. Raw copied conversation/profile data is not published.

User direction: implement the conservative version discussed in chat, make remaining useful fixes, then leave the copied-session dev window ready for hands-on testing. History and drafts open without waiting for optional tool connections; Send remains gated until initialization settles. Do not add a new early-message queue, silently omit failed tools, bypass ownership, or rerun historical commands.

Destin explicitly approved allowing both startup recovery choices on paired phones and remote browsers, using the same exact-attempt guards as desktop.

## Design

1. **Keep backend admission authoritative.** `createResumeAdmission` and its teardown/lease barriers remain unchanged. A native create/resume only returns after its actual HarnessSession exists, history is rebuilt, and its live entry is wired. MCP connection completion is no longer a precondition for that return.
2. **Separate tool readiness from history readiness.** Start MCP acquisition alongside native startup. Construct/rebuild/wire the session without waiting for network/stdio handshakes. Every native generation owns a tools-initialization controller with `opening`, `connecting`, `failed`, and `ready` states. Children with deliberately suppressed MCP initialize ready.
3. **Never accept an early user submission.** Native host send/skill/compact/summarizing model switches refuse before queuing, accepting user history, changing served-skill state, or starting a model call while startup is blocked. The shared driver has synchronous backstops at all model-call entry points. Existing in-flight-turn queue behavior is unchanged. Old pre-live holding is superseded by an accurate initializing refusal, so the composer retains text/attachments.
4. **Park automatic deliveries before claims.** Background specialist/shell notices remain in their existing durable/pending lanes while blocked. No ledger delivery claim/injectionAttempted stamp is consumed until the session is ready. On readiness, kick existing drains, not a second custom queue.
5. **Attach a stable tool set before unblocking.** Add an idle-only `HarnessSession.setMcpServers(servers)` method. Update its array identity, tools/context snapshot and continuation identity safely. When acquisition was pending during early history rebuild, reseed accepted history under the final tool inventory before publishing ready; no turn may mutate history in between.
6. **Explicit failure choices.** MCP leases report redacted unavailable-server issues in addition to successful servers. A failed attempt blocks model calls, preserves drafts, and offers existing ErrorState actions: Try again or Continue without unavailable tools. Continue applies only to the currently failed attempt. Retry acquires a fresh failed-connection generation without disturbing other sessions' leases; simultaneous explicit retries coalesce on the new connecting generation.
7. **Fence every asynchronous completion.** Startup tickets are installed before the first await and invalidated synchronously on close, replacement and shutdown. Check tickets after awaits/before wiring. Internal orphan teardown preserves the new startup ticket. MCP callbacks check exact live-entry and attempt identity; stale results release only their own lease and never publish ready, attach tools, wire a session, or start drains. Closing a tab must not await optional handshakes.
8. **One shared live fact.** Retain readiness in numbered `session:live` facts and apply it through the existing record/open/live-feed pipeline. A reload, torn-off window, Android/shared renderer or paired screen sees the same send gate and failure notice. Unknown legacy hosts retain previous behavior; the computer still refuses invalid submissions.
9. **Small, existing UI recipes.** References: ModelLoadingBar, QueuedMessagesStrip and ui/states.tsx. Use a StatusStrip above the composer for Opening chat / Connecting tools; ErrorState with folded redacted details and right-aligned choices for failures. History stays visible and the composer stays editable. Reuse the existing sendBlocked plumbing and protect every keyboard/voice/direct-submit path. No new standalone screen/menu.
10. **First-visit and miscellaneous safety.** Retain the already tested lazy-view/terminal Preview correction. Check first selection of a long recovered chat, not only Welcome back dismissal. Fix typed custom-endpoint model reuse if needed for a functional keyless manual test profile, without treating missing local models as installed or ambiguously choosing among endpoints.

## Implementation units and contracts

### A. MCP pool (bounded worker)
- `harness/mcp/mcp-manager.ts`, existing MCP manager tests.
- Extend McpLease with optional `unavailableServers: Array<{id:string;label:string;error:string}>`; errors must use the existing resolved-secret redactor.
- `acquire(sessionId, opts?: {retryFailed?: boolean})` preserves existing behavior by default. Explicit retry retires only error/needs-setup pool entries; connecting/ready entries remain coalesced. Old leases keep their exact generation.
- Fence acquire calls whose registry await spans `destroyAll` so they cannot spawn after shutdown.

### B. Native initialization/lifecycle (parent)
- New focused helper(s) under `harness/` for startup tickets/tool readiness, tested with deferred promises, no wall-clock sleeps.
- Integrate with native-session-host create/resume/wire/destroy and all model-entry/drain gates; retain protected file budgets by extracting responsibilities, not raising ceilings.
- Add driver readiness backstop and idle MCP attachment in harness-session, with tests for no history/skill/compaction mutation and safe final-inventory continuation restore.

### C. Shared facts, action and UI (parent)
- Shared startup-state type and `session:live` kind; record retention/open facts/reducer translation and a narrow selector.
- One typed `native:startup-action` invoke with `{sessionId, attemptId, action:'retry'|'continue'}` and `{ok:boolean,state?:NativeStartupState}` response. The current state repairs an action response that arrives before its live push. Exact attempt matching prevents stale consent. Table/preload/remote bridge parity tests.
- Focused StartupStatus component using existing StatusStrip/ErrorState, separate presentation tests; composer draft/attachment preservation and blocked submit tests; workbench fixture and named capture using shared renderer.

## Verification cases

- Deferred connector: native resume resolves/history opens before connector; Send/skills/compact/summary/direct turn calls do not accept or run, and no early queue/user event is created.
- Successful connection: attach tools + final history/context before unblocking; one transition and one drain per generation.
- Failure: redacted actionable issue; no automatic turn without tools; stale action refused; Retry and Continue do not send the draft.
- Closing/reopening/shutdown before header/history/connection completion: no ghost writer, late ready event, leaked lease or lost existing messages; retry generations cannot release each other.
- Background specialist report waiting during initialization: no premature ledger claim or lost report, delivers once after readiness.
- Reload/second screen sees the same state and blocked send; draft stays editable.
- Real 16-session tests with the deliberately unresponsive local MCP fixture: Welcome back/history below five seconds even while tool state remains connecting; then explicit failed state. Repeat copied real histories and mixed actual Claude CLI sessions. Check first-switch latency and integrity.
- `bash scripts/verify.sh <app-worktree>`, parity tests, fresh code/UX review, inspect actual screenshots, and only then launch the hand-test window without further source edits or load tests.

## Review findings addressed

- A replacement could scan a durable report before the outgoing pass cleared its unstarted injection marker. Successful cancellation now rearms the existing gated delivery lane; a deferred-marker close/resume regression failed before the fix and passes afterward, with one model call/delivery.
- Retry retains the prior MCP lease until replacement ownership exists, so healthy connections are not restarted. Deferred registry resolution can retire only the exact generation that was already a settled failure when the request began; concurrent retries join replacements even if those fail before lookup finishes. Both orderings have red/green tests and fresh review.
- Late refused drafts use a timeline-only retention action, preserving error/park/prefill state. Directly refused retained entries cannot be consumed by older identical transcript text; ordinary outcome notes remain correctable by real echoes. The bubble helper was extracted rather than raising the reducer's protected line budget.
- Pending Send-again requests are deduplicated per session/old send ID. Cross-chat late refusal preserves text/files without restoring them into the newly selected composer.
- Saved typed custom-endpoint models can resume without a catalog only when the saved endpoint name uniquely identifies an enabled, ready custom provider. Ambiguous/different names and missing local models still require a manual choice.
- Twenty-four actual renderer captures cover connecting/failed/ready at desktop and 390px in four themes. Context-free visual review found no concrete clipping/overlap blocker. Desktop recovery-action probes preserved drafts and sent zero messages; narrow touch interaction remains unverified.
- Final desktop verification passed: 7,954 selected tests, 36 skipped, all type/budget/lint/dead-code/invariant/screen checks and 7 journeys. The final Android shared backend compiled/packaged and rerun shell XML reports 108 tests, zero failures/errors/skips. Full native-runtime packaging stops at the missing Alpine `apk version -t` equivalent; no APK/device verification is claimed.
- Current actual runtime samples: 16 copied histories with a stalled connector open visible history in 1.56–1.68 seconds; mixed 13-native/3-real-CLI recovery opens visible history in 2.25–2.39 seconds. First unvisited-chat switches are 260–280 ms native and 413–428 ms mixed. The corrected full safety probe verifies pending Retry close/reopen without renderer failure; a separate scratch chat received one explicit composer message and returned the local scripted reply.
- All 35 original copied transcript prefixes (240,214,447 bytes) remain hash-identical, and temporary CLI auth is removed. The hands-on profile intentionally uses no real model credentials or sync account; do not enter real provider keys in its test-only basic-storage profile.

## Post-crash safety follow-up (2026-10-20)

The earlier verification/timing samples above precede this follow-up. They do not certify the current source or its integration with newer master.

- Known-unstarted report cancellation retains an exact claim-bound rollback intent across failed writes. A failed claim keeps the existing pending-delivery flag; it is not treated as an empty queue. Ordinary later idle boundaries retry, without a busy timer loop.
- Every delivery claim has a distinct token. Outgoing releases and dead-owner reconciliation compare current ownership/claim identity inside the write lock, so stale cleanup cannot clear a newer generation. Notification failures are logged separately from successful disk commits.
- Background specialist outcomes are retained without an unguarded immediate disk read. Before fallback injection, durable state is checked so a commit-then-throw cannot deliver the same outcome twice.
- Rejected specialist-resume takes restore only their captured instruction packet under its exact token, preserving concurrent appends rather than restoring an entire stale record. Failed rollback intent is retried on later mutations. Recovery obeys the existing newest-50/individual-length retention limits. Host before/after-commit and ledger repeated-failure tests pass; focused fresh durability review has no outstanding findings.
- Direct driver history-only splices now obey startup admission. Bash strips inherited admin-password helper variables before applying this call's own context; its regression test reproduces the formerly environment-dependent failure. Optional paid harness evaluation was offered but not authorized/run.
- These are same-process recovery safeguards, not crash-proof exactly-once delivery. A process dying while storage is unwritable can still lose memory-only recovery intent; a newer competing take token deliberately prevents stale restoration into that newer lifecycle.
- Renderer lifecycle/selection follow-up is verified: epoch checks run before late lease/consent callbacks create on a different host, connection reset clears host-specific starting/retry state, recovery replies preserve selection while explicit manual New/Resume requests still select their result. Local/remote reply adoption seeds before delayed creation announcements. Deferred-query/consent/provider-lookup, explicit-operation and delayed-announcement regressions pass; final focused review has no outstanding findings.
- Final post-crash `verify.sh` passed on 2026-10-20: 10,277 tests passed, 36 skipped; types, budgets, knip, lint/design lint, invariants, 400/400 screen checks and 7/7 journeys. Evidence: `/tmp/recovery-post-crash-verified-final.log`, `scratch/verify-20261020-123034-126989/`. Android shared backend compiled/packaged and rerun shell XML totals 108 tests with no failures/errors/skips; native-runtime/web packaging were excluded, so this is not device/APK verification.
- The first post-crash full check caught two test-only returned-assignment lint errors; both were corrected before the final green run. New app behavior has not been re-timed since the previously disclosed native/mixed runtime samples.
- Before the authorized integration pass, app origin/master `2cbea2563` was 95 commits ahead with 27 overlapping files and 11 textual conflicts. That pre-integration local green did not establish combined-tree safety. The current integration status is recorded at the top; private checkpoints remain under `scratch/recovery-checkpoints/` and `scratch/recovery-integration/`. A reachable base commit is not evidence that uncommitted work has shipped.

## Final safety scope

Verification used private HOME and copied histories only. No production app access, real model inference, paid evaluation or release/tag was performed. Temporary CLI auth was removed after its earlier confined resume tests; no refresh token was copied. Test dev/provider/profiler services are stopped. The app code is now on remote master as recorded above; this archived record preserves the dated evidence and its limitations rather than serving as an active launch procedure.
