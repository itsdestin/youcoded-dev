---
status: shipped
---

# Native harness tools and connections implementation plan

> **For agentic workers:** use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement one task at a time after the contract is signed. Checkboxes record actual execution, not intentions.

**Goal:** repair the approved specialist/process/MCP/file/web/question boundaries without broadening tool authority or changing the denied credential-cleanup policy.

**Architecture:** retain the existing host, tool wrappers, connection leases and shared renderer. Derive child tools and child permission caps from one effective allowlist; retain subprocess ownership across handoff; give changed MCP configurations distinct in-memory connection generations. Keep changes at existing module boundaries rather than refactoring the harness wholesale.

**Tech stack:** TypeScript, Node/Electron, React shared renderer, Vitest and existing Zod schemas.

## Scope and inputs

Workspace: `/home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926`; app: `youcoded/`; source baseline: `6c4411faa66fcf000b0d5e711ba095c0aa20be6d`.

Authority: `docs/archive/design/2026-09-26-native-harness/native-harness.decisions.md` and its named submitted decks/direct-user amendments. This batch covers Q-7, Q-9, Q-11, Q-14, Q-15, Q-20 and Q-21. **Do not change `mcp-reconciler.ts` to implement denied Q-10.** Do not add the unapproved comma-label provenance or nested-button repairs as incidental work.

Production edits wait for the implementation contract. Commands below run from `youcoded/desktop`. Existing audit-only probes assert defects; they are evidence to convert into established behavior suites, not shipping correctness tests. No real credentials or active integrations are used.

## Task C1 — Bash-enabled specialists can use their own companions

**Files:** `src/main/harness/native-session-host.ts` (`buildSpecialistSession`); `src/main/harness/specialists/child-permissions.ts`; tests `specialist-child-permissions.test.ts`, `native-session-host.test.ts`, `specialist-run.test.ts`.

**Interfaces:** preserve `buildChildDecide(inputs)` and existing tool-service signatures. The same effective tool-name array supplies both `CORE_TOOLS.filter` and `allowedTools` in the child permission inputs. Start from the immutable spawn-time definition; if it contains Bash, add BashOutput and KillShell. Do not mutate the catalog definition or add Bash to any charter.

- [ ] Add a child-permission case using the built-in Worker: parent allow produces allow for Bash, BashOutput and KillShell. Add read-only/no-Bash negative cases and retain parent-deny precedence.
- [ ] Add a host integration case proving the advertised companions and authorization use the same effective list; test that the child's shell ID cannot address the parent's or another child's registry.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/specialist-child-permissions.test.ts tests/native-session-host.test.ts tests/specialist-run.test.ts`; observe the new positive case fail before implementation.
- [ ] Compute the effective list once in child construction and thread it into both consumers. Keep the original definition fingerprint and grant scope unchanged: these companions are already exposed by the existing policy, not a new arbitrary capability.
- [ ] Rerun the suites and record the before/after results.

## Task C2 — Escalate termination against the owned process group

**Files:** `src/main/harness/shell-registry.ts` (`spawnDetached`, `killTree`); relevant call sites in `tools/bash.ts`; tests `shell-registry.test.ts`, `bash-background.test.ts`.

**Interfaces:** preserve `killTree(child, { graceMs? })` unless an explicit ownership argument proves necessary after enumerating its callers. Default grace remains two seconds. Retain an ownership record for the spawned group, not merely its numeric group ID: capture verifiable process-instance identities for its original members before graceful termination and revalidate identity plus membership at escalation. A platform-owned stable group/process reference is preferable where supported. Numeric group existence alone never authorizes a delayed force-stop; group IDs can be recycled too. If continuous ownership cannot be established, skip escalation rather than signal a potentially unrelated group, and report that cleanup was not confirmed. Do not silently weaken this check on platforms lacking sufficient identity information. Delayed signals must not fall back to a recycled positive leader PID. Windows remains a separate tree-termination implementation.

- [ ] Move the surviving-descendant scenario from `shell-audit-disposable.test.ts` into the existing shell-registry suite, changing the assertion to require termination. Wait for a child readiness signal, then leader exit; advance a controlled escalation timer rather than relying on fixed timing sleeps. Always clean up only the exact test group/PID in `finally`.
- [ ] Add cases for a group already gone; leader gone with a verifiably original member surviving; the original group gone and its numeric ID reused by unrelated processes; reused member PID with different process-instance identity; unreadable/unsupported identity; no PID; and no signaling of the harness's own/unowned group. Require zero delayed signals when ownership is ambiguous, including an identity change during the verification sequence. Pin the unchanged two-second default with fake timers.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/shell-registry.test.ts tests/bash-background.test.ts`; show the surviving-descendant case red.
- [ ] Make delayed escalation depend on freshly verified ownership of the retained group, not `child.exitCode`/`signalCode` or a negative-PID existence probe alone. Use bounded off-main-thread identity/membership collection where needed and retain the original ownership evidence. Handle the verification-to-signal race explicitly: prefer stable platform references; if the chosen mechanism cannot establish that it still targets the original work, skip the delayed signal and return/report unconfirmed cleanup. Never substitute process-name search or a stale positive PID. Require fresh process-safety review of this implementation before calling C2 complete.
- [ ] Rerun tests. Verify Windows behavior on Windows CI or state clearly that it was not executed locally; do not call the Linux probe cross-platform proof.

## Task C3 — Background handoff retains ownership on setup failure

**Files:** `src/main/harness/tools/bash.ts` (foreground deadline/handoff); `src/main/harness/shell-registry.ts` (`start`, `adopt`, `register`); tests `bash-background.test.ts`, `shell-registry.test.ts`.

**Interfaces:** preserve the public Bash input/result contract. Existing `adopt` may throw during setup; its caller must settle with a specific tool error while retaining control of the child. If a structured adoption result is introduced, update all callers in the same task. Do not report a successful background log path before registration succeeds.

- [ ] Transfer `bash-adopt-audit-disposable.test.ts` into the established Bash suite and invert its expected failure: injected log-directory EACCES must produce a settled error, not an escaping timer exception. Verify both explicit background start and timed handoff.
- [ ] Test child close/error racing setup, setup failure after output has arrived, and asynchronous log-stream failure. A failed handoff must not leave an untracked live child or duplicate completion notice.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/bash-background.test.ts tests/shell-registry.test.ts` and record the red cases.
- [ ] Retain foreground listeners until registration succeeds, or restore/replace them in a guarded failure path. Put timer-owned adoption inside its own exception boundary. On failed setup, stop work that cannot remain tracked and settle once with the actual setup error. Explicit background startup also must clean up a child spawned before registration fails.
- [ ] Preserve normal handoff behavior, no foreground-cwd/env persistence after background handoff, and the existing bounded in-memory tail fallback for an already-registered stream error.
- [ ] Rerun the suites and inspect error/exit callback counts.

## Task D1 — Changed MCP settings create a new lease generation

**Files:** `src/main/harness/mcp/mcp-manager.ts`; `src/main/harness/mcp/types.ts` only if a private type is needed; tests `mcp-manager.test.ts`, `mcp-keychain-recovery.test.ts`, `native-session-host-mcp-leak.test.ts`.

**Interfaces:** keep `McpLease`, `ReadyServer` and `status()`'s outward shapes. Maintain a current entry per server ID plus retained retired generations until their holders release. Compare effective resolved connection settings in memory: transport type/command/arguments or URL, resolved environment/headers, and setup/credential error state. Do not persist/log plaintext or credential-derived identifiers. A label-only change need not reconnect.

- [ ] Convert the mutable-registry case in `mcp-audit-disposable.test.ts` to require: first lease keeps OLD; change command or credential; second lease uses NEW; releasing OLD does not close NEW; each closes after its own last holder.
- [ ] Add unchanged-config concurrent acquisition (one connect), A→B→A changes, missing-secret/error-to-ready recovery, connect failure, acquire during old close, and destroyAll with multiple generations.
- [ ] Verify a disabled/removed server is absent from new leases while existing leases stay usable. This is intentional snapshot behavior, not a revocation feature.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/mcp-manager.test.ts tests/mcp-keychain-recovery.test.ts tests/native-session-host-mcp-leak.test.ts`; observe the changed-config case red.
- [ ] Create/reuse entries by effective configuration generation. Keep holder registration synchronous before connection awaits. Release scans the entries actually held by that lease; deleting an old generation must not remove the current generation's map entry. `destroyAll` closes current and retired generations. Keep `status()` one current row per public ID, not duplicated UI rows.
- [ ] Rerun the suites and `tests/mcp-gating.test.ts`, `tests/mcp-startup-wiring.test.ts`.
- [ ] Confirm no edits to denied `mcp-reconciler.ts` behavior and no active registry/credential files touched.

## Task D2 — Cancellation/deadline includes DNS

**Files:** `src/main/harness/tools/net-guard.ts`; `src/main/harness/tools/web-fetch.ts` only if error translation needs adjustment; tests `net-guard.test.ts`, `web-fetch-tool.test.ts`.

**Interfaces:** retain `GuardedFetchOpts` and the single total deadline. Extend `assertPublicHttpUrl` internally with cancellation support, or race its promise at `guardedFetch`, while preserving all existing callers' default behavior. Abort must stay an abort/deadline outcome, not be relabeled as an unresolved-host error.

- [ ] Add controlled never-settling lookup cases for caller abort and request deadline. Require the tool wait to settle before lookup is released; assert no HTTP fetch is dispatched afterward, and a late resolve/reject is consumed without unhandled rejection.
- [ ] Cover redirected-host DNS under the same original deadline and already-aborted input. Preserve private-address rejection on every hop.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/net-guard.test.ts tests/web-fetch-tool.test.ts`; observe the cancellation case red.
- [ ] Bound the DNS await with the composed signal; remove listeners when settled and suppress late lookup delivery. Cancel underlying resolution only where supported; do not claim OS resolver cancellation merely because the wait settled.
- [ ] Rerun the suites and any search/page-fetch consumers identified by import search. No new permission, restriction, retry policy or timeout setting.

## Task D3 — Read verifies bytes before reusing prior content

**Files:** `src/main/harness/tools/read.ts`; existing `tools/file-fingerprint.ts`; tests `native-tools-polish.test.ts`, `harness-tools-core.test.ts` and the file-guard suites.

**Interfaces:** keep `ToolContext.servedReads` and `readRegistry` formats where possible; content fingerprint is already available. Use one asynchronously-read buffer for binary detection, fingerprint and text output. Do not read/hash twice or introduce synchronous filesystem work.

- [ ] Add changed bytes with identical mtime and size; require current content to be served. Add unchanged bytes with changed mtime; a short notice is allowed only after content identity is established.
- [ ] Test binary replacement, unreadable replacement, changed offset/limit, and clear/compaction reset. A rejected read must not restore an old fingerprint as authorization to write.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/native-tools-polish.test.ts tests/harness-tools-core.test.ts tests/harness-tool-guards.test.ts`; show the preserved-mtime case red.
- [ ] Move the repeat-read shortcut after reading/validating the current bytes and computing `fingerprintOf(buf)`. Return the short unchanged notice only when the prior served-slice fingerprint agrees. Otherwise serve and stamp the current content.
- [ ] Keep image/PDF behavior unchanged in this task; their separate identity and output paths are not the demonstrated text-read defect.
- [ ] Rerun suites and confirm stale Edit/Write refusals remain intact.

## Task D4 — Independent question identity without breaking legacy transport

**Files:** `src/renderer/components/ToolCard.tsx` (`AskUserQuestionCard`); `src/main/harness/tools/ask-user-question.ts` (`formatAnswers`); any existing shared question types only if needed; tests `ask-user-question-card-other.test.tsx`, `ask-user-question-tool.test.ts`, `native-permission-broker.test.ts`, `ToolCard.test.tsx`.

**Interfaces:** renderer state is keyed by stable question position/identity within one pending request, not displayed wording. Native answer delivery gains an ordered per-question answer representation tied to the original question order. Keep the legacy `answers`, `notes`, `annotations` spelling for Claude Code and old/native clients; the native formatter prefers a validated ordered representation when present and falls back to the old map otherwise. Do not send an invented protocol extension to Claude Code without verifying its accepted input shape.

- [ ] Add a mounted native card with two identical question texts and different headings/options. Select different choices, type independent notes/Other text, navigate by keyboard and submit; require separate values in the native result. Cover per-question refs and React keys, not just `formatAnswers`.
- [ ] Add old-client fallback, malformed ordered input, mismatched length, non-string values and missing answers. The formatter remains total and uses the original tool-call questions as authority, not renderer-supplied replacement prompts.
- [ ] Add a unique-wording Claude Code fixture requiring byte-equivalent legacy answer/notes/annotations payload semantics. Preserve remote/Desktop/Android forwarding of the existing permission-response envelope.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/ask-user-question-card-other.test.tsx tests/ask-user-question-tool.test.ts tests/native-permission-broker.test.ts tests/ToolCard.test.tsx`; show duplicate-question failures red.
- [ ] Replace wording-keyed UI state with request-local stable question identities. Add the native ordered-answer path and preserve legacy transport selection using the established native request distinction, not a guessed platform property.
- [ ] If the legacy Claude Code protocol cannot represent duplicate-worded questions, do not silently display independently submitted answers while collapsing them on transport. Establish its actual contract before claiming the duplicate case fixed on that backend; surface any necessary scope/UI contradiction through the approved review procedure. The approved native fix must not regress ordinary Claude Code cards.
- [ ] Do not bundle F14 comma-provenance or F15 nested-button changes. Reuse existing label/text formatting unless the approved identity fix strictly requires a shared primitive; document any unavoidable consequence before expanding scope.
- [ ] Rerun suites, IPC parity tests and shared-renderer checks. Verify the unchanged-looking native/Claude Code cards visually in isolated tooling before acceptance.

## Batch completion evidence

- [ ] Each task's new desired-behavior regression is observed red on the baseline, then green after its fix.
- [ ] Audit-only observation files superseded by genuine regressions are removed from this session's uncommitted scratch additions, with their output retained in audit evidence. Do not delete a reproduction until its replacement is demonstrated.
- [ ] A fresh reviewer checks capability width, cleanup ownership, credential handling and shared-question compatibility. Fix accepted findings within approved scope.
- [ ] Run the full desktop verification from the workspace: `bash scripts/verify.sh --full /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded`, and retain its actual output. No release or live-app test is implied by green unit tests.
