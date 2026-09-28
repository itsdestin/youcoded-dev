---
status: active
---

# Native harness audit — 26 September 2026

## Executive assessment

**The overall architecture makes sense, but several lifecycle boundaries are unreliable.** The strongest defects are not missing basic features: they are disagreements between systems that individually have passing tests—permissions versus history pairing, context clearing versus rule deduplication, background delivery versus message queueing, and exposed specialist tools versus their permission caps.

This is an investigation, not a fix release. Production source, installed plugins, live configuration and the running app were not changed. No paid model evaluation was run. Audit-only test files were added in an isolated checkout; their passing assertions deliberately reproduce defective behavior, not certify that the product is correct.

**Audited app revision:** `6c4411faa66fcf000b0d5e711ba095c0aa20be6d`.

**Workspace:** `/home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926`.

All source locations below are relative to that workspace's `youcoded/desktop/`, unless otherwise indicated. Upstream comparisons are current documentation observations, not runtime certifications or revision-pinned audits of those projects.

## 1. Major behaviors: contract, implementation and judgment

### 1.1 Permission decisions and remembered grants

**Should work:** decide on the actual operation before it runs; separate one-time consent from durable grants; make grant scope understandable; apply revocation to active conversations as well as stored state; preserve a recoverable conversation when policy storage fails.

**Current logic:** arguments are validated, file guards and Bash safety floors apply, and the configured decision combines preset, conversation mode, destructive-list rules and remembered grants. Modes are Ask First, Auto Edit and Full Auto. Remembered grants intentionally override the configured destructive list, but not the two forced-ask Bash floors. File-secret refusals and external-write checks are separate. Reading outside the workspace is not itself an approval trigger. MCP grants are per tool rather than per server. Specialist charters impose additional caps.

**Judgment:** coherent as accidental-harm protection, not an operating-system sandbox. A model with approved Bash can construct operations that static command checks cannot understand. That is an acknowledged limitation, not a newly discovered security-boundary bypass. However, permission-store failure currently corrupts the tool-call/result contract (F01), and overlapping persistence and revocation need ordering protection (R03).

Sources: `src/main/harness/harness-session.ts:3858–4067`; `src/main/harness/permission-engine.ts:22–49`; `src/shared/permission-types.ts:159–227`; `src/main/harness/specialists/child-permissions.ts:62–114`.

### 1.2 Approval cards, questions and reconnect

**Should work:** a displayed request identifies one pending operation; only one response takes effect; stale/replayed cards cannot execute work again; Stop, dismissal and transport reconnection have explicit meanings. Multiple questions need independent answer identities.

**Current logic:** the broker uses unique request IDs, keeps requests pending without a timeout, re-announces pending cards and supports replay. Late answers return false. Resolution purges buffered remote requests. Denying an ordinary action lets the assistant try another approach; closing a human question ends the turn. A child's ask is routed to its parent conversation. Stop preserves background helpers, whereas closing the parent tears them down.

**Judgment:** the broker's normal lifecycle is deliberate and covered by existing tests. This audit did not reproduce a broker double-execution or reconnect failure. It did find answer-identity/provenance problems and invalid grant-width markup (F13–F15). No-timeout approval is an intentional product policy, not a stuck-card bug by itself.

Sources: `src/main/harness/permission-broker.ts:151–375`; `src/main/remote-server.ts:1061–1095,1578–1615`; `src/main/harness/harness-session.ts:3003–3052`; `src/renderer/components/ToolCard.tsx:993–1217`.

### 1.3 System instructions and CLAUDE.md / AGENTS.md

**Should work:** discover the intended instruction sources with predictable scope and precedence, identify where instructions came from, disclose shortened content, and never imply compatibility with sources the native harness does not load.

**Current logic:** the fixed system prompt contains identity, preset, selected project instructions, working doctrine, optional model steering and a session-start environment snapshot. Discovery walks upward from cwd, selecting the nearest directory's `AGENTS.md`, or its `CLAUDE.md` fallback, and stops at `.git`. It does not merge every ancestor instruction file. The selected root file is outlined to the starting profile's budget. The root prompt is not resized on model switch.

**Judgment:** selecting one nearest file is a valid simplification, but it is not hierarchical Claude Code compatibility. Opening a component worktree may therefore omit workspace-level instructions above its Git boundary. Personal/global instruction files are not loaded by this project-file discovery path. Do not describe all existing Claude Code instructions as automatically inherited.

Important distinction: **`AGENTS.md` is project guidance; `.claude/agents/*.md` defines specialists.** They are not interchangeable loaders.

Sources: `src/main/harness/prompt-assembly.ts:81–108,144–220`; `src/main/harness/injection/injection-budget.ts:175–219`; `src/main/harness/native-session-host.ts:2717–2731`.

### 1.4 Path-scoped rules and nested instructions

**Should work:** load only relevant rules; preserve directory/glob boundaries; ensure their delivery state agrees with what remains in model context; clearly explain whether a rule can govern the first operation.

**Current logic:** the session builds an index at creation/resume. Nested `AGENTS.md` / `CLAUDE.md` are discovered to a bounded depth, excluding hidden/skipped directories and directory symlinks. Only the cwd's immediate `.claude/rules/*.md` files are scanned. Rules without `paths:` are skipped, not treated as global/eager. Each matching rule is appended once as a bounded history message **after the entire tool step completes**. Bash does not activate path rules. Grep/Glob match their requested path, not every result filename. The index is a session snapshot.

**Judgment:** stable prompts and on-demand instructions are sensible for context and caching. Post-step delivery is advisory, not a pre-write safeguard: a first Write/Edit, or several calls in one step, can finish before the model receives the rule. Hermes uses a similar post-tool approach; that does not remove the limitation. Existing documentation already acknowledges this timing, so it is a design issue rather than a newly hidden execution-order bug. Rule loss after clear and parser mismatches are actual defects (F03, F10).

Narrowing a specialist's `work_dir` also narrows its rule-index root: it does not automatically import the parent's `.claude/rules` tree. A durable compatibility contract should say whether ancestor rules must be inherited.

Sources: `src/main/harness/injection/path-triggers.ts:37–74,112–185`; `src/main/harness/harness-session.ts:1369–1392,3070–3076`; `src/main/harness/native-session-host.ts:3524–3528`.

Inspection note: `path-triggers.ts` contains two literal NUL bytes used as glob-parser placeholders, causing the Read tool to classify it as binary. Its implementation was inspected through a temporary escaped text copy without changing the source.

### 1.5 Skills, slash commands and hooks

**Should work:** advertise skills that can actually load; pass their body and user arguments correctly; announce shortening; distinguish loaded instructions from executable lifecycle hooks.

**Current logic:** catalogs discover project-cwd skills, user skills and installed-plugin skills. The model-facing Skill tool is capability-gated; explicit slash skill invocation has a separate path for smaller models. Skill content is loaded on demand and repeat-load state is cleared on relevant context resets. Catalog discovery and the attached tool description are snapshots. Native slash routing is not the entire Claude Code command implementation.

**Judgment:** on-demand loading is coherent. Catalog changes during an open conversation need a documented refresh boundary; a newly installed skill should not be assumed immediately advertised. A permission `hook-event` is an app event shape, not proof that Claude Code's command hooks or lifecycle scripts ran. The inspected paths do not justify promising full Claude Code hook compatibility.

Sources: `src/main/harness/skills/skill-catalog.ts:71–110`; `src/main/harness/tools/skill.ts:64–89`; `src/main/harness/harness-session.ts:1416–1477`; `src/main/harness/native-session-host.ts:4478–4529`; `src/renderer/state/slash-command-dispatcher.ts:359–373`.

### 1.6 Built-in tools, output and background commands

**Should work:** validate arguments; keep file edits tied to a previously observed version; report omissions honestly; distinguish timeout/handoff from cancellation; retain ownership of subprocesses until their whole process group stops.

**Current logic:** common tool wrappers provide validation/error/bounds handling. File writes use fingerprints and path locks. Read deduplication uses modification time. PDF extraction is serialized. Grep/Glob have tool-local deadlines. Bash preserves cwd within the workspace, and can explicitly persist exported environment variables; file tools still resolve against the workspace root. Long foreground Bash calls normally hand off to the background registry. Web requests validate each redirect's destination.

**Judgment:** good separation of responsibilities, with concrete holes in handoff failure, process-group escalation, DNS cancellation and Read freshness (F05, F06, F11, F12). These are not fixed by stronger model instructions.

Sources: `src/main/harness/tools/registry.ts:13–116`; `src/main/harness/tools/read.ts:205–244`; `src/main/harness/tools/bash.ts:943–1012`; `src/main/harness/shell-registry.ts:151–175,231–305`; `src/main/harness/tools/net-guard.ts:127–178`.

### 1.7 MCP connections and integration state

**Should work:** distinguish configured, connected and exposed tools; keep secrets out of the syncable registry; avoid trusting server safety hints; respect connection generations and configuration changes; never orphan ownership of a projected credential.

**Current logic:** secrets are resolved from references; server connections are pooled under leases; complete server tool sets are attached within a schema budget. An open session holds a snapshot. Existing-session removal is not immediate revocation by design. Reconciliation to Claude Code preserves unowned collisions.

**Judgment:** leases and whole-server attachment are sound. However, an ID-only pool can give a *new* conversation stale configuration/credentials, and missing-secret reconciliation loses ownership of a stale credential-bearing entry (F07–F08). Existing-session snapshot behavior should be explained, not mislabeled as a fresh bug. Underlying transport cleanup after timeout remains a validation gap (R04).

Sources: `src/main/harness/mcp/mcp-manager.ts:143–275`; `src/main/harness/harness-session.ts:1563–1606`; `src/main/mcp-reconciler.ts:344–390`.

### 1.8 Turn execution, retry, queueing and Stop

**Should work:** pair every tool call with a result on every exit; never silently strand an accepted message; avoid repeating completed side effects; make visible output agree with accepted history after retry.

**Current logic:** a model step collects calls, then executes them serially. Unknown tools and invalid inputs become error results. Interruption and dismissed questions backfill remaining calls. Empty output gets one retry. Transient provider errors have another retry path. The host queues up to ten user messages. Stop ends the current turn but intentionally allows queued follow-ups to drain. A stalled root stream can remain parked for retry/late data; children must not park. Quiesce is stronger than Stop.

**Judgment:** normal pairing and cancellation are carefully designed, but their guarantees do not hold for all exceptions or background-delivery boundaries (F01–F02, F09). Closing has a separate send-acceptance window that deserves a regression test (R01).

Sources: `src/main/harness/harness-session.ts:2897–3052,3219–3245,3529–3603,4105–4116`; `src/main/harness/native-session-host.ts:3899–4072,4532–4575,4614–4638`.

### 1.9 Context, compaction, persistence and provider adaptation

**Should work:** size the actual outgoing request; preserve tool groups; adopt a summary only after durable commit; separate portable history from provider-private continuation; adapt images and capabilities to the selected model; serialize model changes with active work.

**Current logic:** compaction is validated and committed through a transcript marker. Resume prefers an identity-bound private accepted-history checkpoint, then validated portable state/rebuild. Images are adapted on the outgoing copy. ChatGPT continuation is tied to account/credential identity. The private checkpoint is profile-local and does not sync. Model changes fit-check the history; a smaller model can require a summary.

**Judgment:** this is a coherent architecture, not an obvious candidate for wholesale replacement. The audit did not prove every SDK conversion or accepted-history branch correct. Mutable profile/history during a model-switch race is a remaining source-supported concern (R02). Root-prompt sizing remaining fixed at session start is a documented limitation, not newly classified as corruption.

Sources: `src/main/harness/harness-session.ts:1864–1957,1057–1124`; `src/main/harness/native-session-host.ts:2945–3128,4657–4699`; `src/main/harness/wire-adapter.ts:105–235`; `src/main/providers/provider-registry.ts:493–515`.

### 1.10 Specialists and background reports

**Should work:** cold children receive the right project context, definition and bounded capabilities; consent matches the definition fingerprint; only the parent manages its children; reports survive restart without disappearing or causing duplicate work.

**Current logic:** built-ins take precedence over personal, Claude Code user and project definitions. Children cannot recursively delegate. Omitted Claude Code agent tools default to a read-only subset, while unmappable names generate warnings. There are concurrency, single-writer and lifetime spawn caps. Running children retain their spawn-time definition. Background completions are ledger-backed and delivered at an idle boundary. Stop preserves background children; destroy/quiesce does not.

**Judgment:** capability isolation and ownership are coherent. Worker Bash companions are incorrectly denied (F04). Report delivery deliberately stamps an at-most-once-attempt marker before injection, leaving a pre-injection loss window; claims of unconditional exactly-once delivery are too strong (D04).

Sources: `src/main/harness/specialists/catalog.ts:125–177`; `src/main/harness/specialists/definition-files.ts:287–396`; `src/main/harness/native-session-host.ts:605–664,3502–3549,4250–4317`; `src/main/harness/specialists/delegation-ledger.ts:493–535`.

## 2. Comparison with Hermes Agent, Pi and OpenClaw

These are agent harnesses, not inference providers. Their documentation shows different tradeoffs; none should be treated as a flawless reference implementation.

| Concern | Hermes Agent | Pi | OpenClaw | Implication for YouCoded |
|---|---|---|---|---|
| Permissions | Command approval modes; explicit deny/catastrophic blocks take precedence; separate write restrictions. | No built-in per-call approval or containment; project trust gates executable project resources, not tool access. | Separates tool policy, host exec approval and sandbox/session policy; stricter rules generally win, with documented elevated/full exceptions. | Keep consent, capability and containment distinct. YouCoded's remembered-allow precedence is a deliberate different policy, not automatically wrong. |
| Instructions | Git-root-to-cwd AGENTS chain; nested hints delivered after tool execution; global identity separate. | Startup ancestor/cwd context; project instruction files load even when executable project resources are not trusted. | Workspace bootstrap/project context; some native backends delegate project-file discovery to that backend. | YouCoded's nearest-file-only behavior is less hierarchical. Define compatibility rather than relying on familiar filenames. |
| MCP | Configured discovery, tool filters and optional catalog/setup. Saving configuration is not proof that its probe succeeded. | No first-party MCP-client contract established in the inspected coding-agent docs; extensions can add capabilities. | Registry distinguishes configuration, diagnostics and live probes; dynamic discovery and connection lifecycle are documented. | Separate saved, connected, exposed and approved state. Include configuration generation in connection reuse. |
| Skills/hooks | On-demand skill bodies; pre-tool plugin interception; gateway hooks are a distinct executable trust surface. | On-demand skills; trusted in-process extensions can register tools/hooks/providers. | On-demand skills plus distinct internal/plugin hook mechanisms. | A skill instruction is not a hook; a hook-named event is not executable-hook compatibility. |
| Delegation | Fresh child context and constrained tools; active children do not simply resume after owner crash. | No default built-in subagent contract established in the inspected core docs. | Separate child sessions and inherited/restricted policies; restart finalizes interrupted work rather than blindly replaying it. | Preserve the distinction between accepted, completed, persisted and delivered. |
| Compaction/recovery | Configurable compression/tail protection and provider routing. | JSONL history retained while model context uses summaries; ordered overflow recovery. | Tool pairing and settled-results recovery; cancellation does not roll back completed side effects. | Keep transcript/history separation, but test every failure boundary between them. |

Primary sources inspected on this audit date:

- Hermes: [repository](https://github.com/NousResearch/hermes-agent), [security](https://hermes-agent.nousresearch.com/docs/user-guide/security/), [context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files/), [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/), [skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/), [hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/), [delegation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/), [configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration/).
- Pi: the requested [badlogic/pi-mono](https://github.com/badlogic/pi-mono) address was observed redirecting to [earendil-works/pi](https://github.com/earendil-works/pi). Repository documentation: [security](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/security.md), [configuration](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/configuration.md), [extensions](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md), [skills](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md), [compaction](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/compaction.md), [models](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/models.md).
- OpenClaw: [repository](https://github.com/openclaw/openclaw), [exec approvals](https://docs.openclaw.ai/tools/exec-approvals), [permission modes](https://docs.openclaw.ai/gateway/permission-modes), [MCP registry](https://docs.openclaw.ai/cli/mcp/registry), [MCP connections](https://docs.openclaw.ai/tools/mcp), [system prompt](https://docs.openclaw.ai/concepts/system-prompt), [workspace](https://docs.openclaw.ai/concepts/agent-workspace), [compaction](https://docs.openclaw.ai/concepts/compaction), [subagent operations](https://docs.openclaw.ai/tools/subagents/operations).

Evidence limitation: the researcher's GitHub commits API request returned HTTP 403, so upstream revisions were not pinned. These are documentation comparisons, not executed upstream security audits. Pi unknowns are documentation-scope unknowns, not claims that an extension cannot implement the feature.

## 3. Confirmed findings

Priority reflects user impact, not a claim of remote exploitability. “Reproduced” means an offline controlled probe exercised the defective branch; it does not mean the running app was touched.

### F01 — High: a permission-store error poisons the next turn

- **Trigger:** the decision callback throws, as a permission-store EACCES/EIO can do.
- **Observed:** two tool-use events, no tool-result events, then a session error. The next send fails inside the SDK with **“Tool results are missing for tool calls c1, c2.”** It never reaches the fake model.
- **Cause:** `runOneTool` awaits `decide` without containing its exception; its caller has already accepted/emitted the tool calls. The outer turn catch does not backfill results.
- **Source:** `src/main/harness/harness-session.ts:2988–3071,3219–3241,4007–4009`; store route `src/main/harness/native-session-host.ts:2477–2495`.
- **Evidence:** `tests/native-permission-audit-probe.test.ts`; reproduction log contains both errors.
- **Repair direction:** guarantee paired results for every accepted call on exceptional exits; preserve the real storage error without leaving invalid history.

### F02 — High: queued messages can be stranded during background delivery

- **Trigger:** send a user message while a background-completion notice is running through the host's final delivery phase.
- **Observed:** acknowledgement says `queued`; after delivery finishes, the message remains in the queue, `inFlight` is false, and `isIdle` is false. No turn dispatched it.
- **Cause:** `runTurns` drains user messages before `drainDeliveries`, never after it. A send during that awaited tail has no remaining queue consumer.
- **Source:** `src/main/harness/native-session-host.ts:3923–3929,4030–4072`.
- **Evidence:** `tests/native-host-audit-probe.test.ts`, using real host queue/drain methods with a controlled session boundary.
- **Repair direction:** one scheduler must drain user input and host notices to a stable idle state while preserving ordering and Stop semantics.

### F03 — High: cleared rules remain marked as loaded

- **Trigger:** a rule is injected, the user clears the conversation, then the assistant touches the same governed path.
- **Observed:** the first request sequence contains the rule; the post-clear sequence does not reinject it.
- **Cause:** clearing history resets other content caches but not `injectedTriggerIds`. Compaction likewise does not clear this set; if the original rule message is retired, its exact body cannot reinject. Only the clear case was reproduced here.
- **Source:** `src/main/harness/harness-session.ts:832,1379–1389,1912–1933,2158–2164,2190–2213`.
- **Evidence:** `tests/native-instructions-audit-probe.test.ts`.
- **Repair direction:** tie injection deduplication to content actually retained across history barriers, not the lifetime of the session object.

### F04 — High: Worker cannot use its offered background-command controls

- **Trigger:** Worker starts a long/background Bash command, then tries BashOutput or KillShell.
- **Observed:** the real built-in Worker permission composition allows Bash but denies both companion tools as unavailable.
- **Cause:** child construction automatically exposes the companions but passes the unexpanded definition allowlist to `buildChildDecide`.
- **Source:** `src/main/harness/native-session-host.ts:3502–3509,3546–3549`; `src/main/harness/specialists/child-permissions.ts:62–74`.
- **Evidence:** `tests/native-boundaries-audit-probe.test.ts`; source tracing verifies automatic tool attachment.
- **Repair direction:** derive exposed tools and allowed tools from the same effective capability set.

### F05 — High: stopping a process group can leave a descendant running

- **Trigger:** the Bash leader exits on SIGTERM but a descendant ignores it.
- **Observed:** a disposable Linux descendant remained alive after the configured escalation grace period. The probe cleaned up its exact validated group/PID.
- **Cause:** escalation checks whether the leader exited before sending group SIGKILL. Leader exit does not establish group exit.
- **Source:** `src/main/harness/shell-registry.ts:151–175`.
- **Evidence:** `tests/shell-audit-disposable.test.ts`; uses a shortened configurable grace period, not the production app.
- **Repair direction:** track/escalate process-group ownership independently of the original leader's exit state.

### F06 — High: a failed Bash background handoff escapes error handling

- **Trigger:** a foreground command times out into background handoff, but log-directory creation fails.
- **Observed:** injected EACCES makes the captured deadline callback throw; the tool result remains unsettled after a simulated child close.
- **Cause:** output/close/error listeners are removed before `adopt`, whose registration can throw. That throw occurs in a timer callback outside the awaited tool wrapper's catch.
- **Source:** `src/main/harness/tools/bash.ts:959–979`; `src/main/harness/shell-registry.ts:287–305`.
- **Evidence:** `tests/bash-adopt-audit-disposable.test.ts`; controlled failure, not a live filesystem or app crash.
- **Repair direction:** make handoff transactional: on registration failure retain/restore ownership, settle the tool and clean up safely.

### F07 — High: missing MCP credentials orphan an old credential-bearing projection

- **Trigger:** an owned MCP entry was projected to Claude Code; its registry entry remains enabled but now reports missing secrets.
- **Observed:** the old configuration, including a sentinel old credential, survives; the ownership list becomes empty. A later registry deletion cannot prune it, and a later repaired entry is treated as an unowned collision.
- **Cause:** reconciliation skips the unresolved entry without removing its prior owned projection or preserving its ownership bookkeeping.
- **Source:** `src/main/mcp-reconciler.ts:344–390`.
- **Evidence:** `tests/mcp-audit-disposable.test.ts`; pure function only, no real secrets or `.claude.json` writes.
- **Repair direction:** fail closed for the previously owned projection while preserving ownership semantics; never orphan a stale credential.

### F08 — Medium: a new conversation can receive an old MCP command or credential

- **Trigger:** change a server's command/secret while another session still holds its pooled connection, then start another session.
- **Observed:** the new lease gets the old tool and old sentinel token. Only releasing all holders lets a later acquire create the new connection.
- **Cause:** the pool reuses by server ID, not effective configuration/credential generation.
- **Source:** `src/main/harness/mcp/mcp-manager.ts:212–275`.
- **Evidence:** `tests/mcp-audit-disposable.test.ts`, fake registry and connection factory.
- **Repair direction:** key or invalidate pooled connections by configuration generation while preserving old lease ownership until release.
- **Qualification:** existing sessions retaining their already-acquired server after disable/removal is a documented snapshot policy, not counted as an additional bug.

### F09 — Medium: automatic retry leaves abandoned text visible

- **Trigger:** a provider emits text, then a transient 503/429/reset; the automatic retry succeeds.
- **Observed:** transcript events contain `ABANDONED_ATTEMPTSUCCESSFUL_ATTEMPT`, with no drop event. Accepted model history contains only `SUCCESSFUL_ATTEMPT`.
- **Cause:** generic transient retry does not check emitted output or perform the coordinated retraction used by manual stalled-step Retry.
- **Source:** `src/main/harness/harness-session.ts:3634–3648,3727–3749,4105–4116`; contrast manual retraction `:3543–3573`.
- **Evidence:** `tests/native-retry-audit-probe.test.ts`.
- **Repair direction:** either stop automatic replay after visible output or retract the abandoned attempt consistently from display, persistence, history and provenance.

### F10 — Medium: rule matching silently misses valid syntax and crosses path boundaries

- **Trigger A:** valid YAML `- "src/**" # source files`.
- **Observed A:** the rule does not match `src/a.ts`; the line scanner treats the comment/quote tail as pattern content.
- **Trigger B:** glob `**/src/**` against `notsrc/a.ts`.
- **Observed B:** it incorrectly matches; the globstar replacement removes the directory boundary.
- **Source:** `src/main/harness/injection/path-triggers.ts:94–101,123–135`.
- **Evidence:** `tests/native-instructions-audit-probe.test.ts`, actual temporary rule files and actual index builder.
- **Repair direction:** use a clearly defined frontmatter grammar and segment-aware glob matching, with both positive and negative fixtures.
- **Scope:** the inline-comment case is a supported-format compatibility defect; this audit did not establish a current real rule missed for that exact spelling.

### F11 — Medium: cancellation does not settle a WebFetch waiting for DNS

- **Trigger:** DNS lookup stalls and the turn is canceled.
- **Observed:** caller signal is aborted, the fetch operation remains unsettled, and no HTTP fetch has begun. Releasing DNS finally allows the aborted request to settle.
- **Cause:** the deadline signal reaches fetch, but not the preceding awaited lookup. The same gap affects the intended total deadline.
- **Source:** `src/main/harness/tools/net-guard.ts:72–79,130–159`.
- **Evidence:** `tests/native-boundaries-audit-probe.test.ts`, controlled lookup and fetch implementation.
- **Repair direction:** bound/cancel the DNS stage as part of the whole operation, without claiming that aborting a wait necessarily cancels underlying resolver work.

### F12 — Medium: Read can insist stale content is current

- **Trigger:** replace file bytes while preserving modification time, then repeat the same Read slice.
- **Observed:** disk contains `NEW_CONTENT`, while Read says the prior content is current and serves no new bytes.
- **Cause:** repeated-read deduplication checks mtime alone and restores the earlier fingerprint.
- **Source:** `src/main/harness/tools/read.ts:205–226`.
- **Evidence:** `tests/native-boundaries-audit-probe.test.ts`, disposable file with a fixed mtime.
- **Qualification:** Write/Edit still compare actual bytes. This is a stale-read claim, not a demonstrated stale-write bypass.
- **Repair direction:** make the freshness claim match the evidence, or verify stronger file identity/content before suppressing the read.

### F13 — Medium: duplicate question wording shares an answer slot

- **Trigger:** two valid AskUserQuestion entries have identical question text but different headers/options.
- **Observed:** schema accepts them; serialization uses a single wording-keyed answer for both. The card also keys selection/free text by wording.
- **Source:** `src/main/harness/tools/ask-user-question.ts:11–18,42–64`; `src/renderer/components/ToolCard.tsx:993–1015,1048–1074,1159–1176`.
- **Evidence:** `tests/native-permission-audit-probe.test.ts` validates schema/formatter behavior; independent source audit traces the card state keys. No new mounted duplicate-question interaction test was run.
- **Repair direction:** stable per-question identity, or explicit schema rejection of ambiguity, while preserving the shared Claude Code transport contract.

### F14 — Low: a comma in an option label changes its reported provenance

- **Trigger:** choose the listed option `Design, then build`.
- **Observed:** the model is told “the user typed their own answer,” although this was a supplied option.
- **Cause:** selected labels are joined and then split using comma-space, which is also valid label text.
- **Source:** `src/main/harness/tools/ask-user-question.ts:51–60`; `src/renderer/components/ToolCard.tsx:1054–1059`.
- **Evidence:** `tests/native-permission-audit-probe.test.ts`.
- **Repair direction:** preserve structured option identity rather than reconstruct it by splitting presentation text.

### F15 — Low: grant-width choices render nested buttons

- **Trigger:** open an Always Allow card with more than one grant-width option.
- **Observed:** existing ToolCard and grant-width tests emit React's invalid `<button>` descendant warning, while their behavioral assertions pass.
- **Cause:** a button row wraps Radio, which is itself a button.
- **Source:** `src/renderer/components/ToolCard.tsx:778–799`; `src/renderer/components/ui/Radio.tsx:19–30`.
- **Evidence:** UI test log; source review.
- **Qualification:** invalid interactive markup/accessibility semantics are established. A broken real click or hydration failure is **not** established; the app is client-rendered.
- **Repair direction:** one focusable interactive control per option, with a non-button row-wide label/target.

## 4. Source-supported risks requiring targeted reproduction

These are not included in the reproduced-defect claims above.

### R01 — High: sends accepted during parent teardown

`destroyEntry` awaits child teardown while the parent remains sendable. Desktop IPC forwards sends and does not remove the SessionManager entry until teardown completes. A send can therefore be acknowledged while its parent is closing. Exact message disposition depends on timing.

Sources: `src/main/harness/native-session-host.ts:3899–3947,4962–5024`; `src/main/ipc-handlers.ts:1131–1167,3556–3557`.

Next check: hold child teardown at a promise barrier, close the parent, send, then inspect acknowledgement and durable transcript. Add a synchronous closing fence if the behavior is confirmed.

### R02 — Medium: model switching is not serialized with active turns

`switchModel` and `setBinding` await profile resolution without reserving the session's idle state. The turn's actual model object, displayed model label and pricing are snapshotted, but profile, context sizing, tool map and continuation-bearing history remain mutable. A fit check can predate a new message or a subsequent resolution. The concern is mixed live state, not retroactively changing already-snapshotted prices.

Sources: `src/main/harness/native-session-host.ts:4657–4699`; `src/main/harness/harness-session.ts:1057–1124,2624–2697`; picker `src/renderer/components/ModelPickerPopup.tsx:279–307`; desktop and remote routes `src/main/ipc-handlers.ts:3601–3614`, `src/main/remote-server.ts:1882–1892`.

Next check: pause a multi-step turn, switch to a smaller/non-equivalent profile, then inspect the next request, effective tool execution map and history. Serialize the switch or defer it coherently to a turn boundary.

### R03 — Medium: an overlapping grant write can follow revocation

Remembered grants enter memory synchronously and persist without awaiting. Revocation deletes disk state then clears live memory. The filesystem lock prevents simultaneous writes, but its asynchronous pre-lock directory creation does not guarantee invocation-order serialization. An earlier-started grant can reach the lock after revoke and reappear.

Sources: `src/main/harness/native-session-host.ts:2415–2427,2876–2889`; `src/main/harness/permission-store.ts:79–115,148–173`; `src/main/artifacts/cas-write.ts:189–205`.

Next check: hold the grant before lock acquisition, complete revoke, release it, inspect disk and the next decision. A fake delay after lock acquisition would not demonstrate this ordering.

### R04 — Unverified transport risk: MCP deadline versus resource cleanup

The connection path bounds the caller's wait and requests best-effort close. It has not been demonstrated that every stalled/late SDK transport is torn down, or that the call-tool backstop cancels underlying work if SDK timeout handling fails.

Sources: `src/main/harness/mcp/mcp-client.ts:161–193,274–310`.

Next check: controlled late connect/listTools/close completions, then a real disposable MCP server that stops responding. Do not classify caller settlement alone as cleanup proof.

### R05 — Lower-priority source edge: unreadable preferred instructions suppress fallback

If `AGENTS.md` exists but cannot be read, project discovery returns null instead of trying a readable adjacent `CLAUDE.md` or parent. This is source-established, not fault-injected in this audit. Whether to fail visibly or continue to fallback needs an explicit contract.

Source: `src/main/harness/prompt-assembly.ts:90–107`.

## 5. Design limitations and rejected findings

- **D01 — Instructions arriving after tools:** real and documented; not pre-action enforcement. If the product promise is “every first edit follows its rules,” the current design does not meet that promise. Preloading rules can remain a history-message operation without rewriting the system prefix.
- **D02 — Nearest-file, cwd-scoped discovery:** intentional but not full ancestor/global/Claude Code compatibility. Eager rules without `paths:` are skipped. New rule/skill files are not guaranteed to refresh in an already-open session. Clarify these boundaries before expanding them.
- **D03 — Open MCP sessions retain snapshots:** verified and intentional. New sessions excluding a removed server worked in the probe. F08 is different: new sessions reusing outdated configuration of an ID that still exists.
- **D04 — Background report delivery is not unconditionally exactly once:** `injectionAttempted` is committed before formatting/delivery, and marked rows cannot be reclaimed. A crash/formatting failure in that gap can lose automatic delivery even though the completed report may remain stored. Source explicitly chooses duplicate avoidance and logs the no-retry behavior. Ordinary provider failure is not the reproduction: `beginTurn` catches that error after the injected message is emitted. Decide whether to retain this tradeoff or add durable injection receipts.
- **Rejected — concurrent resume via two parallel Task calls:** the host method has an apparent race in isolation, but the actual tool driver serializes those calls and no second production caller was established. Not counted as a current bug.
- **Rejected — closed startup successfully resurrects in normal desktop flow:** the host can temporarily wire after an early destroy, but IPC's `nativeExited` tracking tears it down and rejects creation. No successful user-visible resurrection was established.
- **Not claimed — shell guards provide isolation, all upstream systems are safer, or passing unit tests prove real provider/card/transport behavior.** None follows from this evidence.

## 6. Verification, coverage and evidence

### Executed checks

| Check | Observed result | Meaning |
|---|---|---|
| Vitest `related --run --maxWorkers=4` over 135 harness/provider source files | **174 test files passed; 3,907 tests passed, 5 skipped** | Existing backend-related coverage, not a full desktop suite. |
| Selected native approval/session/specialist UI suites | **20 test files passed; 222 tests passed** | Component behavior; nested-button warnings remain. |
| Combined audit reproductions | **8 test files passed; 14 tests passed** | Probes assert the observed defects/qualifications; they do not mean defects are fixed. |
| Worker's combined tool/MCP regression and probe run | **7 files passed; 78 tests passed** | Overlaps the above; do not add these counts as unique coverage. |
| Typecheck | Parent independently reran `npm run typecheck`: source and test `tsgo --noEmit` checks exited **0** | Type correctness checked; does not establish runtime correctness. |

Audit probe files in `youcoded/desktop/tests/`:

- `native-host-audit-probe.test.ts`
- `native-instructions-audit-probe.test.ts`
- `native-permission-audit-probe.test.ts`
- `native-retry-audit-probe.test.ts`
- `native-boundaries-audit-probe.test.ts`
- `mcp-audit-disposable.test.ts`
- `shell-audit-disposable.test.ts`
- `bash-adopt-audit-disposable.test.ts`

Logs copied beside this report under `2026-09-26-native-harness-audit-evidence/` provide the backend baseline, UI run and combined reproduction output. The reproduction run was independently rerun by the parent after the worker's report. Early scratch-probe mistakes were corrected: one probe initially referenced a nonexistent `getHistory` method; one disposable process fixture initially failed its readiness signal. Neither was a production-test failure. Final combined reproduction output is green because it successfully demonstrates the current defects.

### Investigation coverage

Independent investigators covered permissions/cards, instructions/rules/skills, built-in tools/MCP, specialist lifecycle, context/providers, turn lifecycle and upstream designs. A fresh reviewer challenged reachability of the lifecycle/grant findings. Parent verification reproduced the highest-impact branches and removed unsupported claims.

**Not exercised:** live app; live permission clicks; actual provider accounts/network streaming; paid harness evaluation; real MCP authentication/reconnect; Windows/macOS process behavior; Android runtime builds; exhaustive provider SDK converters, accepted-history descriptors, or every web parser/backend. The UI checks were DOM/component tests, not a visual review deck. No claim is made that every line of every harness subsystem is bug-free or exhaustively explored.

### Existing tests' blind spots

The recurring gap is composition: successful permission decisions rather than decision-store exceptions; ordinary repeated rules rather than clear/compaction; queueing during user turns rather than during injected turns; attached tools separately from child authorization; leader termination rather than surviving descendants; successful handoff rather than registration failure; stable MCP definitions rather than updates under active leases. These should become behavior-level regression cases rather than additional source-string assertions.

## 7. Recommended repair order — not implemented

1. **Conversation/process integrity:** F01, F02, F05, F06; reproduce and close R01. Prevent poisoned history, accepted-but-stranded input and lost process ownership.
2. **Instructions and capability consistency:** F03, F04, F10. Then make an explicit product decision on first-action rule timing and ancestor/global compatibility.
3. **Integration lifecycle:** F07 and F08; reproduce R03 and review credential/configuration generations.
4. **Recovery and presentation:** F09, F11–F15; reproduce R02 and audit transport cleanup R04.
5. **Regression acceptance:** convert the probes into desired-behavior tests in the established feature suites, with deterministic signals, then run the full desktop verification and platform-specific process tests. If desired, follow with a separately approved, spending-capped harness evaluation across selected models. No paid run is necessary to establish the deterministic bugs already reproduced here.

No fixes, commits, pushes, roadmap edits or installed-state changes were made as part of this audit. Repair work and any change in intended permission/instruction policy require a separate decision.
