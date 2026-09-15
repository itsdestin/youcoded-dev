---
status: draft
date: 2026-09-15
---

# Cloud download protection — engineering plan

## Authority, scope and readiness

Approved contract: `docs/active/design/2026-09-15-cloud-download-consent/cloud-download-consent.contract.json`; signature: `docs/active/design/2026-09-15-cloud-download-consent/cloud-download-consent.contract.answers.json` (C=yes). Current decisions: `docs/active/design/2026-09-15-cloud-download-consent/decisions.md`; final visual corrections: `docs/active/design/2026-09-15-cloud-download-consent/cloud-download-consent.review-3.answers.json`.

This is planning only, not a completed protection implementation. The worktree contains an approved workbench prototype; its passing checks reported by the parent do not establish backend protection. No app changes, platform experiments, paid evaluations, commits or live-app operations are authorized by this document-writing task. Workspace startup preserved the session branch; incoming model-picker lifecycle documents are unrelated and were not integrated.

**First executable slice: pure access policy + operation coordinator with an injected metadata/read adapter, including denial, deduplication and dismissal races.** It needs no Windows runtime or new dependency. Follow with a narrow artifact-read integration proving that *reported* online-only/partial/unknown files are not automatically read. Neither slice alone satisfies R1–R8 or proves absence of OneDrive hydration.

**Release blocker:** no documented, validated universal non-hydrating consumer read has been established. Metadata-check-then-Node-read is not atomic. Windows/OneDrive runtime verification is unavailable per the parent's current host check; Linux simulations establish attempted-access policy, not actual hydration. Do not publish “browsing cannot download content” as verified until the platform and transitive-reader gates below pass.

## Existing code and concrete integration points

Paths in this section are workspace-relative. These are focused source observations, not an exhaustive app-wide I/O inventory.

| Existing entry point | Observed behavior / required seam |
|---|---|
| `youcoded/desktop/src/renderer/components/ArtifactThumbnail.tsx` → `ArtifactThumbnail` | IntersectionObserver starts `artifacts.readBinary` / text requests without file selection. Its cancellation flag suppresses rendering, not backend reads. Cloud suppression belongs in backend policy as well as this caller. |
| `youcoded/desktop/src/main/artifacts/read-service.ts` → `readArtifactText`, `readArtifactBytes` | Text resolves sidecar/path and authorization, stats, then opens a prefix or reads the full file. Binary reads authorized resolved paths. All branches, including sniffing and full-read escalation, need the same service; a prefix can hydrate a whole file. |
| `youcoded/desktop/src/main/artifacts/write-authorization.ts`, `youcoded/desktop/src/main/artifacts/read-binary-access.ts` | Existing resolved-path containment/sensitive-path policy must remain authoritative. Cloud approval never bypasses it. Resolution and sidecar lookup themselves may perform I/O before the target read. |
| `youcoded/desktop/src/main/artifacts/project-file-discovery.ts` → `discoverProjectFiles`, `discoveredFileRecord` | `readdir`, nested `.git` access, per-file stat; 1.5-second budget checked between I/O, 10-second completed cache, no in-flight dedup. Preserve traversal limits, skipped symlinks and nested-repository boundary, but do not describe the budget as cancellation. |
| `youcoded/desktop/src/main/artifacts/projects-index.ts` | Existing all-files union and count authority; retain tracked files missed by discovery. Partial/unknown scan must not become a confident total or “empty folder.” |
| `youcoded/desktop/src/main/project-context.ts` → `listContext`, `readContextFile`, `discoverContextGroups`, `readRules`, `enrichContextFile` | Description/frontmatter enrichment reads whole files before slicing. Even `isAllowed` invokes rule-reading discovery. Synchronous `realpathSync.native` also occurs here. Separate metadata inventory from body loading and policy authorization. |
| `youcoded/desktop/src/main/project-repo.ts` → `getRepoInfo` | Automatically reads `.git/config`; passive project opening must not authorize this cloud content read. Missing/unavailable repo metadata is not proof of no repository. |
| `youcoded/desktop/src/main/artifacts/content-search.ts` → `searchProjectContent` | Spawns bundled rg recursively at `.` with hidden files and ignore handling. This app-owned search cannot remain an unrestricted tree reader on protected roots. |
| `youcoded/desktop/src/main/artifacts/project-watcher.ts` → `watchProject`, `isNestedRepoDir` | Chokidar ignore predicate calls synchronous `fs.accessSync(.git)`. Preserve subscription counts, parked-watcher cap and teardown while moving I/O out of main. Chokidar ready-await alone is not evidence of a freeze. |
| `youcoded/desktop/src/main/harness/prompt-assembly.ts` → `findProjectInstructions`, `gitSnapshot`, `assembleSystemPromptParts` | Walk-up AGENTS.md then CLAUDE.md, stop at `.git`; synchronous content reads; two synchronous Git commands. Current catch maps unreadable instructions to null and Git failure to “not a repository.” Those distinctions must survive preparation rather than silently omit required instructions. |
| `youcoded/desktop/src/main/harness/native-session-host.ts` → `create`/`createInner`, `resume`, `toolWiring`, `createChild`, `buildSessionContext`, `sessionContextText` | `toolWiring` synchronously builds triggers, skills and prompt. Context construction re-reads instructions after prompt assembly. Existing `beginStarting`/`endStarting` hold sends while construction proceeds. Children have a separate prompt construction path. |
| `youcoded/desktop/src/main/harness/injection/path-triggers.ts` → `buildTriggerIndex` | Sync recursive enumeration, nested instruction discovery and rule reads. Search with binary-tolerant `rg -a` if needed. Optional discovery must not trigger downloads merely to determine rule frontmatter. |
| `youcoded/desktop/src/main/harness/skills/skill-catalog.ts` → `createSkillCatalog`/`load`; `youcoded/desktop/src/main/skill-scanner.ts`; `youcoded/desktop/src/main/harness/specialists/catalog.ts` → `fingerprintDir`/`loadFolder` | Catalog construction and body loading have sync filesystem paths. Specialist `ensureFresh` being async does not make its inner sync reads nonblocking. Keep built-in roster and explicit skipped/unavailable records. |
| `youcoded/desktop/src/main/claude-code-context.ts` → `buildClaudeCodeContext`, `readWholeContextFile` | App-owned CC context display calls the same body-reading instruction finder and scans skill descriptions; explicit expansion reads whole files. Guard these without delaying/restricting Claude Code itself. |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Existing artifact handlers around `ARTIFACT_IPC.READ_BINARY` and `SEARCH_CONTENT`; CC context broadcast around `buildClaudeCodeContext`; context-text dispatch to `readWholeContextFile`. Wire service once, not independent policies per handler. |
| `youcoded/desktop/src/main/git/git-exec.ts` → `execGit`; `youcoded/desktop/src/main/git/git-watcher.ts` | Async, bounded Git runner already exists, unlike prompt Git. Git watcher still synchronously reads `.git` and `commondir` metadata files. Automatic app work requires isolation; external Git gets no new restriction. |
| `youcoded/desktop/src/renderer/components/project-view/CloudFileConsent.tsx`; `youcoded/desktop/src/renderer/components/CloudInstructionsCard.tsx`; `youcoded/desktop/src/renderer/components/project-view/ProjectView.tsx` | Prototype states are ask/denied/waiting and workbench-only `cloudPreview`; allow currently immediately means waiting. Preserve approved layout, replace mock transitions with real operation events. |

### Reuse before inventing a native addon

- **Existing native FFI:** `youcoded/desktop/src/main/window-exclude-capture.ts` lazy-loads `koffi`, binds Win32 `user32.dll` APIs and handles load failures. `youcoded/desktop/package.json` already declares koffi. This is a credible route to a small **metadata adapter**, not evidence that a residency helper already exists.
- **Existing process isolation:** `youcoded/desktop/src/main/voice/voice-handlers.ts` → `spawnVoiceWorker` uses Electron `utilityProcess.fork`, typed messages, stderr and exit listeners; `youcoded/desktop/src/main/voice/voice-service.ts` has a fakeable handle and deadline/lifecycle pattern. Reuse the pattern, not the speech worker or its resource limits. Prefer a separate process over `worker_threads` plus fs promises: libuv filesystem work can still share a process-wide pool.
- **Packaging:** `youcoded/desktop/tsconfig.json` compiles `src/**/*` to `dist`; `youcoded/desktop/package.json` runs tsc; `youcoded/desktop/electron-builder.yml` packages `dist/**/*` and `node_modules/**/*`, with `npmRebuild: false` and explicit unpack rules. A TS utility worker follows an existing path. Verify packaged koffi loading, native library resolution and any required unpack entry in a Windows build; do not assume success from the source layout.
- **PowerShell precedent:** `youcoded/desktop/src/main/models/gpu-detector.ts` invokes `powershell -NoProfile -NonInteractive -Command` for registry metadata. This proves launch precedent only. Its synchronous runner must NOT be copied for residency checks. A bounded batch metadata-only PowerShell helper is a fallback candidate, with structured stdin/JSON and no path interpolation, only if the parent finds it preferable. Do not assume PowerShell is installed on this host or start one process per file.
- No new C++/Rust addon/build chain is justified for the first slice. Parent platform investigation remains the authority for available host tools.

## Layer 1 — metadata probe and content-read service

Proposed modules (new, not existing): `youcoded/desktop/src/shared/cloud-file-types.ts` and `youcoded/desktop/src/main/cloud-files/` containing policy, adapter contract, worker protocol and supervisor.

1. Keep **display residency** separate from **permission to open without recall**. Probe result includes local/online-only/partial/unknown, file-vs-directory, reason/capability, optional known provider, metadata identity and freshness. Windows Node stat does not expose the necessary Win32 residency attributes. No size/mtime, filename, OneDrive path substring or successful stat heuristic establishes local content.
2. Candidate Windows probe: native attribute/tag query with no data stream open; classify OFFLINE, RECALL_ON_OPEN, RECALL_ON_DATA_ACCESS, partial placeholder and unrecognized reparse/provider cases conservatively. These classifications and API choices need Windows validation. Never “test availability” by reading one byte, hashing, parsing, generating a thumbnail or opening a PDF.
3. Probe **directories before enumeration**, including the root and metadata-path ancestors. Directory enumeration can fetch provider directory metadata. Skip recall/unknown subtrees for automatic scans; return incomplete/unavailable metadata with reason. Distinguish metadata population from file-content hydration; do not promise neither happens without evidence. Unknown required-instruction discovery blocks readiness; it is not “no instructions.” If filenames/identities cannot be established safely, show an accurate discovery-unavailable state with retry rather than inventing a list or asking for folder permission. Requiring folder enumeration authorization would be a new contract decision, not implicit approval.
4. Service modes: passive local-only (preview, description, count, search, optional catalog), substantive exact-file request (viewer/context expansion/required instructions), and metadata enumeration. Passive cloud/partial/unknown never prompts and never content-opens. Substantive uncertainty asks with neutral wording; not-found, denied OS access and probe failure stay distinct.
5. Target reads receive an operation-bound authorization produced by Layer 2, not a renderer boolean. Preserve size limits, secret checks, real-path containment and existing read ceilings. Move resolution/probing/reads and expensive parse work off main. Any authorization helper's implicit content reads must be routed too.
6. Separate check/read is only a best-effort suppression mechanism. Recheck identity/residency immediately before an allowed read, but do NOT describe that as closing the race. Parent's primary-doc research found `CfOpenFileWithOplock(EXCLUSIVE)` plus `CfReferenceProtectedHandle` can protect a referenced interval against properly coordinated dehydration; the initial open asks for read-data and has no documented no-hydration guarantee, and `CfUpdatePlaceholder` does not enforce dehydrator exclusiveness. **CfAPI is not a proven universal no-recall guard.** A same-handle identity/read design is useful but insufficient without a proven safe initial open.
7. If a platform adapter cannot provide a validated no-recall read, do not silently substitute ordinary reads in a mode advertised as protected. For development, expose this as an explicit unsupported capability and simulate safe-local reads. Suppressing local previews universally would contradict R1 and requires a one-question contract amendment if that becomes the only shippable fallback; it is not an implementation shortcut.

### Bounded supervision / responsiveness

Use a small fixed pool, initially two isolated I/O processes with bounded queues; reserve capacity for purposeful work rather than allowing thumbnails to starve startup. Batch metadata, cap returned bytes/records, deduplicate in-flight scans, and invalidate by generation. One hung operation must not stall main timers, event delivery, unrelated conversations or all local reads.

Deadline means the caller stops waiting and receives a truthful unavailable/error state. It does **not** mean a cloud driver canceled work. Remove unsent queued work on dismissal; suppress delivery for expired generations. Terminate only owned workers when policy requires it, await exit, and count retiring/not-yet-exited processes against the cap. Do not replace blocked processes indefinitely: once capacity is occupied, reject/defer new work with bounded retry/backoff and circuit-breaker status. Bound stderr, result caches and retained terminal operations; no automatic endless retry loop. Test teardown and late results, not just Promise timeouts.

## Layer 2 — operation consent coordinator

Main owns an ephemeral registry of operation id, requester identity (window/remote connection), conversation/start generation where applicable, purpose, exact named file identities, phase, and view-interest subscribers. Deduplication is strictly owner-local: separate owners never share prompt state, filenames or authority. Within one owner each subscriber has independent view interest; teardown of one subscriber must not revoke another's interest. Owner teardown invalidates all its operations. No folder grants, grants in permission-store, persisted approvals, or inherited native Always-allow behavior.

- Separate phases: probing → awaiting-consent → denied OR authorized/queued → downloading/read-in-progress → completed OR error. Backend start acknowledgement, not clicking Allow, enables approved downloading copy. Do not fake percentages or infer provider completion from a timer. Unknown-residency/local reads may need neutral “waiting” until there is evidence for downloading.
- Bind approval to the exact named set and metadata-resolved identity, preferably volume/file-id and final path from the adapter. Pure `canonicalize` is the path-equality convention, not proof of inode/file identity. Missing identity/changed target/reparse retarget before consumption invalidates consent or requires a fresh prompt; identity obtainable only through unsafe opening is a platform blocker, not permission to open first.
- Dedupe same pending file prompt/read **within an authorized audience**; attach multiple consumers to one operation, do not union additional files after approval. A batch names every required file before approval. Overlapping batches share per-file work only for the approved subset; a newly required file needs additional consent. Never leak another session's filenames via global dedup.
- Concurrent requests for an already approved identical read may join that pending read; this is reuse of current work, not permission for a later operation. Drop authority at completion/error/owner teardown. On a later click, freshly local content opens normally; newly online-only content asks again.
- Deny/Escape/close while asking causes **zero content reads** and restores focus. File popup dismissal during waiting invalidates that subscriber's automatic-open intent, not the authorized provider I/O. A later explicit click can attach fresh view intent to the same in-flight read.
- Completion may open only if operation id, active popup, selection generation and owning view still match. Navigating away, selecting a newer file, window closure or remote disconnect must suppress stale auto-open. Conversation continuation is independently scoped and does not steal focus.

## Layer 3 — IPC, state and native readiness

New channel names are proposed, not existing: `cloud-files:request`, `cloud-files:respond`, `cloud-files:dismiss`, `cloud-files:state`, `cloud-files:snapshot`. Prefer typed start/status responses over holding arbitrary renderer invokes for an unbounded download. The content service can return a pending operation id through existing reader result unions. Do not return an authorization bearer token that arbitrary paths can reuse.

Implement all five transport surfaces together: `youcoded/desktop/src/main/preload.ts`, `youcoded/desktop/src/main/ipc-handlers.ts`, `youcoded/desktop/src/main/remote-server.ts`, `youcoded/desktop/src/renderer/remote-shim.ts`, `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. Update shared types and workbench mock. Derive owner identity from transport, not payload; reject stale/foreign responses. Reconnect snapshots replay current consent/status only, never revive an answered prompt or closed popup. Keep native startup state separate from frozen transcript event vocabulary.

Android-local does not implement Windows probing. It must expose the same callable/JSON shape and honest unsupported results where appropriate, while preserving existing real text/binary read guards; unsupported is not “all files local.” Remote clients use the **desktop host's** availability and operation ownership, not the phone OS. Do not gate shared file-consent APIs on `native.supported` (remote currently hides native capability).

Native preparation becomes an awaited, per-conversation stage before constructing/running the model:

- Split prompt assembly into I/O preparation and pure composition of an immutable snapshot. Preserve AGENTS-before-CLAUDE precedence, walk boundary and profile-based instruction fitting. Record absent versus blocked/unreadable required instructions. Denial leaves the conversation paused with its approved compact card; never turn blocked into null then start anyway.
- Extend existing starting-send holding with explicit readiness/error/denied state and a generation fence. Do not globally block SessionManager or all conversations; do not re-send a held message twice. Approval resumes the same preparation. Destroy/quiesce/takeover invalidate pending preparation and release acquired resources. Prefer resolving required files before acquiring expensive MCP leases; otherwise retain existing release-on-failure behavior.
- Use the same prepared instruction bytes/metadata for prompt and `buildSessionContext`; it currently re-reads. `sessionContextText` uses a retained snapshot when describing what was supplied, or an explicit protected current-file read when that is the requested meaning. Do not silently show changed current content as the original prompt.
- Apply preparation to create, resume and the separate specialist-child construction path. Preserve a running child's spawn-time definition. Required nested instructions at actual injection time are not optional; discovery of rule/skill candidates is optional and can skip nonlocal bodies with an explicit unavailable inventory. Reading unknown frontmatter just to decide optionality is forbidden.
- CC context inventory is metadata/local-only and can remain incomplete without pausing Claude Code. Explicit expansion uses exact-file consent. Never claim to know which text the external CLI loaded.

## Bounded migration and remaining exposure

The implementation stages below cover project/file browsing and its automatic metadata/sidecar dependencies, selected text/binary/context viewing, app Files content search, project watchers, native startup/instruction preparation and optional startup discovery, and app-owned CC context display. These are more than a thumbnail fix.

Before calling that bounded surface protected, trace transitive sidecar reads: `youcoded/desktop/src/main/artifacts/artifact-store.ts`, `youcoded/desktop/src/main/artifacts/cas-write.ts`, `youcoded/desktop/src/main/artifacts/central-index.ts`, and `youcoded/desktop/src/main/artifacts/project-manager.ts`. A cloud `.youcoded` sidecar or `.gitignore` must not be hydrated incidentally by listing, authorization or migration. Do not convert “unavailable” into “missing” and overwrite it. Retain `readSidecarShared` coalescing and CAS safety; isolating its I/O must not create multiple unlocked cache/writer authorities.

**App-owned automatic Git:** replace prompt's `execFileSync` with bounded async/process-isolated collection, using `git/git-exec.ts` as the runner precedent. Timeout/unavailability is not “not a repository.” Address sync Git-watcher `.git`/`commondir` reads. Do not introduce any Git/CC/Bash/MCP consent wrapper or restriction; user explicitly excluded external-tool policing. Distinguish optional automatic app bookkeeping from user-launched Git: omit an optional app-started Git snapshot on protected/unknown roots rather than start incidental reads for display enrichment. Existing user-requested external commands remain unchanged. Source-audit that distinction before claiming R8; process-wide no-download protection is not promised.

**Content search:** unlike user-launched external tools, `searchProjectContent` is YouCoded's own Files search. On protected roots, enumerate safe metadata and read only permitted local bytes through the service. Search buffered bytes with the existing literal/case-insensitive semantics and caps, or feed already-read bytes to a matcher. Do not hand rg a prechecked path list and claim safety: reopen races and ignore-file reads remain. Return local-content-only/incomplete status and keep filename matching useful; do not prompt for every skipped result.

**Not fully designed in this bounded pass:** native `ReadTool` (`youcoded/desktop/src/main/harness/tools/read.ts`) still has synchronous stat/read and deferred image/PDF paths; direct skill invocation, edit/write pre-reads, delivered-image encoding, import/copy, conversation/transcript stores, sync-space transport/indexing, model files and other app-wide readers require separate consumer tracing before an app-wide R8 verdict. They are not magically covered by changing artifact IPC. Native app-owned readers belong under the eventual service; do not classify them as external simply to claim completion. Independent CC, user shell/Git and MCP processes are deliberately excluded, not implementation debt.

Consequently, **R8 cannot receive a complete-app pass from this bounded implementation alone**. Stage T6 must close the named transitive paths and produce a remaining-reader disposition. Any deferral affecting the approved claim goes back to contract review, not a quiet “done.”

## Staged TDD tasks (red → minimum implementation → targeted review)

All proposed new test names below are future files under `youcoded/desktop/tests/`; existing test references are real paths. Review technical design first, capped at three recorded rounds per feature-flow. Each build stage gets an independent reviewer. Do not write hundreds of speculative callsite edits before its failing tests identify the seam.

### T0 / FIRST — policy + coordinator, platform-free

Create proposed `cloud-file-policy.test.ts` and `cloud-file-operations.test.ts` with an injected fake adapter recording metadata/data calls and controllable deferred results. Start with failures for cloud/partial/unknown passive access causing zero data opens/no prompt; denied causing zero opens; exact-file approval permitting only that file; same pending identity dedup; batch additions requiring consent; changed identity refusing reuse; no authority after terminal completion/restart; dismiss-then-complete not opening; dismiss-then-click reattaching intent; owner mismatch and late events ignored. Implement only shared types, pure policy and coordinator. The injected read boundary must be capability-based: consume an exact identity under no-recall or explicit operation authorization, or report unsupported/identity-changed. Do not bake ordinary pathname probe-then-read into that boundary. Test that different owners with identical targets share neither prompts nor authority; same-owner subscribers deduplicate and dismiss independently. Keep adapter explicitly fake/unsupported; no claimed Windows backend.

Acceptance of this slice: deterministic passing tests and reviewed state contract. It can be completed without Windows proof and without enabling production claims.

### T1 — supervised adapter and narrow artifact integration

Add proposed `cloud-file-supervisor.test.ts` and `cloud-file-read-service.test.ts`. Test stalled probes/data reads, heartbeat responsiveness, queue/process caps, no replacement before exit, restart generation, cancellation of queued work, bounded payloads, and local-safe versus unsupported adapter behavior. Wire text/binary/prefix reads through injectable service preserving security/size semantics; tests report online-only files and assert no downstream Node opens. Cover sidecar-before-target exposure explicitly. Add metadata-only Windows koffi binding behind capability gating only after reviewing signatures; packaged load and real hydration tests remain blocked, not skipped-as-pass.

Run existing `youcoded/desktop/tests/artifacts/read-binary-access.test.ts` and related read-service/security tests discovered by the verifier. No general Windows enablement until the initial-open/race limitation is resolved or the contract is amended.

### T2 — transport + real file popup lifecycle

Add proposed `cloud-file-ipc.test.ts`; extend existing `youcoded/desktop/tests/cloud-file-consent.test.tsx`, `youcoded/desktop/tests/cloud-files-preview.test.tsx`, `youcoded/desktop/tests/cloud-instructions-card.test.tsx`. Cover real phase ordering, repeated Allow, deny/Escape/X, focus restoration, selection changes, route departure, close-before-ACK, completion after unmount, reconnect, two windows, file-vs-instruction continuation and neutral unknown wording. Replace production `cloudPreview` dependence with typed state; keep fixture adapter in workbench. Run IPC/remote parity suites listed below. R2–R5 can be simulated; R1 is still platform-gated.

### T3 — native readiness and CC context

Add proposed `cloud-startup-readiness.test.ts`. Simulate required instructions online-only, absent, unreadable, identity changes and incomplete directory discovery; assert no model construction/send before ready, no silent omission on deny, exactly one continuation, and conversation B usable while A waits. Cover create/resume/child, held-send queue, teardown during consent/read, failed resource acquisition and immutable prompt/context agreement. Split optional catalog/trigger discovery from required consumption, preserving budgets and explicit unavailable records. Existing `youcoded/desktop/tests/prompt-assembly.test.ts`, `youcoded/desktop/tests/native-session-host.test.ts`, `youcoded/desktop/tests/session-context.test.ts`, `youcoded/desktop/tests/claude-code-context.test.ts`, `youcoded/desktop/tests/skill-catalog.test.ts`, `youcoded/desktop/tests/path-triggers.test.ts` and `youcoded/desktop/tests/rule-injection.test.ts` pin regressions. Offer harness evaluation to Destin for native changes; no paid run without separate approval.

### T4 — browsing, counts, metadata and watchers

Extend `youcoded/desktop/tests/project-file-discovery.test.ts`, `youcoded/desktop/src/main/project-context.test.ts`, `youcoded/desktop/tests/project-watcher.test.ts`; add proposed `cloud-project-browsing.test.ts`. Mount/open Project/Files with cloud descriptions, thumbnails, `.git/config`, sidecars and directory placeholders; assert no data opens, no permission prompts, bounded scans, honest incomplete counts and local preview preservation where safe-local capability exists. Watch events invalidate availability/cache generations without launching content reads. Move sync predicate I/O off main (worker-owned watch or precomputed metadata snapshot; never await inside a synchronous predicate). Test subscribe/unsubscribe during worker startup and parked-watch capacity.

### T5 — app-owned search and automatic Git responsiveness

Extend `youcoded/desktop/tests/artifacts/content-search.test.ts` for local-only matches, skipped cloud/unknown content, no recursive rg on protected roots, preserved sensitive-path filtering, literal query semantics, bounded output and partial results. Extend `youcoded/desktop/tests/git/git-exec.test.ts` and `youcoded/desktop/tests/git/git-watcher.test.ts` for blocked commands/metadata and independent main responsiveness. Pin that no new consent gate wraps external CC/Git/Bash/MCP. Do not claim these external commands cannot hydrate.

### T6 — coverage gate, platform validation and acceptance

Search app-owned data-open primitives repo-wide (excluding dependencies/generated output), trace reachable paths from the migrated features, and record each as protected, external exclusion, or unresolved. Add source-scanning regression guards only for the explicitly migrated callsites, with positive match assertions and CRLF tolerance; no fake universal grep proof. Deep-read and scope the remaining native tool/deferred image/PDF/injection and app-store consumers before assigning R8 a verdict. Run a blocked-worker test with main timer/IPC traffic, not just mocked fs promises.

On an isolated Windows test installation with controlled OneDrive fixtures, verify local, online-only, partial, recall-on-open, unknown reparse, offline provider, inaccessible directories, rename/replacement/dehydration races, first-open behavior and repeated clicks. Observe provider/network/file state without opening test data in the observer. Measure directory metadata fetch separately. Verify only named approved file data is requested, popup closure never reopens content, helper count stays bounded, and local previews work. A successful static attribute test is not this test. Current environment cannot run it; R1/R7 actual hydration and the no-recall mechanism remain hard gates.

## R1–R8 evidence map

| Row | Required layers/tasks and pass evidence |
|---|---|
| R1 | T1/T4/T5: service refuses passive cloud/unknown content; safe directory discovery, sidecars/descriptions/counts/search included; DOM cloud icon/local-preview tests **plus Windows hydration evidence**. |
| R2 | T0/T2: exact named-file prompt, no read on denial/Escape/X, centered modal and focus restoration. |
| R3 | T2: approved exact waiting sentence; no Keep working button; real backend start acknowledgement, not optimistic allow. |
| R4 | T0/T2: subscriber generation/active-popup fence; dismissal, late completion, newer selection and explicit re-click tests. |
| R5 | T2/T3: compact conversation card with exact file list, known-provider-only wording, neutral unknown; no folder grant. |
| R6 | T1/T3: per-conversation readiness and held sends; B works while A waits; exactly-once continuation and supervised process caps. |
| R7 | T1/T3/T6: no required-file reads before consent, no omission/early model turn, real Windows validation before hydration claim. |
| R8 | T3–T6: app-owned CC display guarded without controlling CLI; broad remaining-reader disposition; external exclusions explicit. **Not satisfied by artifact-only integration.** |

## Verification commands and present evidence

After implementing each task, from `youcoded/desktop`, run `npx vitest run` with its named test paths (new tests must exist first). Cross-surface regression command:

```sh
cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts tests/remote-channel-parity.test.ts tests/workbench-mock-contract.test.ts tests/cloud-file-consent.test.tsx tests/cloud-instructions-card.test.tsx tests/cloud-files-preview.test.tsx
```

Before any desktop completion claim, from workspace root:

```sh
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/onedrive-no-auto-download/youcoded
```

Run Android's own tests when an SDK/JDK is confirmed by the parent, using the workspace-prescribed `./gradlew test -x bundleWebUi` with explicit JAVA_HOME/ANDROID_HOME; read actual test reports. This plan does not claim Android builds here. Unsupported local-phone responses and desktop-hosted remote behavior need separate tests. For workbench shim changes, run `node scripts/workbench-boot-check.mjs` against an isolated serving workbench. Runtime UI review uses an authorized isolated dev instance via `bash scripts/run-dev.sh`, never the live app, followed by fresh code reviewer/UX tester/grader and contract acceptance.

This planning pass ran source/path inspection only; it did not run application tests or Windows I/O. Validate this document's existing path references and whitespace before handoff. Carry forward the distinction: **policy tests can prove the app declined a reported nonlocal file; they cannot prove an ordinary read of a supposedly local file never recalls data.**
