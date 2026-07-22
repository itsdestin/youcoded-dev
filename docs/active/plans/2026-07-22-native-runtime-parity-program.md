---
status: active
created: 2026-07-22
type: program
supersedes:
  - docs/archive/plans/2026-07-22-native-session-control-plan.md
  - docs/archive/plans/2026-07-22-native-sync-parity-plan.md
  - 22 ROADMAP entries (full original texts: git history of ROADMAP.md before the 2026-07-22 consolidation commit; index in §9)
design-refs:
  - docs/active/specs/2026-07-15-phase2-native-harness-design.md
  - docs/active/specs/2026-07-18-native-sync-parity-design.md
  - docs/active/specs/2026-07-19-native-workflow-orchestration-design.md
  - docs/active/specs/2026-07-09-platform-vision-roadmap.md
  - docs/active/plans/2026-07-18-multi-model-cwd-contract.md
  - docs/active/plans/2026-07-16-phase2-plan-c-local-reliability.md
---

# Native Runtime Parity Program

The single plan for finishing the native (YouCoded-runtime) system. **North star (Destin, 2026-07-22): full parity with Claude Code sessions — a user should not feel any obvious distinction between how the two session types behave.** That means working send/interrupt/queue mechanics, working tags/flags/notes, working sync and takeover, working skills and commands, working status surfaces, mature permissions, informed model selection, subagents, and eventually Android.

**Standing rule for this program (Destin, 2026-07-22): build the real feature, not interim "not available yet" shims,** for anything scheduled inside this program. Plumbing that makes failures honest (send results, no phantom bubbles) is in scope because the real features need it; toast-only stopgap work for surfaces whose real implementation is a milestone away is not.

## §1 Where the runtime stands today (verified against master `b832e299`, 2026-07-22)

Shipped: provider seam (Phase 0, PR #115); native chat sessions (Plan A, #119); agent loop + ten tools + permission engine + presets Assistant/Coder (Phase 2 Plan A, #149); web tools + AskUser + presets polish (Plan B, #156); production flip `native.supported: true` (#160); scoped Bash-cwd persistence (#174); native lease/store safety fixes — single-writer guard, awaited `destroyNative` teardown, lease acquire reverted pending M2, phantom-record gate (#177, merge `fe8529ba`); model chip + `supportsAliasCycling` gate (#185); stall watchdog + `model-step-budget.ts` step-budget stopgap.

Partially landed: **Plan C local reliability** — the stall watchdog and step-budget stopgap are on master, but the capability registry (`known-models.ts` / `capability-profile.ts`) is **not** (verified absent 2026-07-22). Reconcile the Plan C branch state before starting M6.

Interrupt exists end-to-end (`NativeSessionHost.interrupt` → `NATIVE_INTERRUPT` → ESC handler native branch + remote shim) — but ESC is the only affordance. There is no send queue, no send-result feedback, no store/sync participation, no skills/commands, no usage/cost chips, no stuck detection, no Android.

## §2 Milestone M1 — Session control (chat mechanics feel identical)

Decisions (Destin 2026-07-22): sends during a live turn **queue**; stop is a **visible button**, not just ESC.

1. **Send queue (main process).** Per-session FIFO in `NativeSessionHost.send` (`native-session-host.ts:373` currently returns false on re-entrancy — `HarnessSession.send` hard-throws, host swallows); drain in order on turn end; bounded (~10) with honest refusal past the cap. Define + pin interrupt-vs-queue semantics (recommend: interrupt aborts the current turn only, queue still drains).
2. **Async send results.** `NATIVE_SEND` becomes an invoke returning `{status: 'sent'|'queued'|'failed', reason?}` — both callers today discard the promise (`void nativeHost.send(...)` at `ipc-handlers.ts:2081` and `remote-server.ts`; the remote shim must carry the same ack). Renderer marks queued bubbles; the existing exact-content transcript dedup confirms delivery.
3. **`guardedPtySend` honesty.** `App.tsx:520-524` returns true unconditionally while `SessionManager.sendInput` returns false for every worker-less session — so every `if (!guardedPtySend(...)) return;` bail is dead for native/destroyed ids and callers proceed to optimistic writes. Fix: consult provider + session existence from renderer state (no IPC change; the raw PTY keystroke path stays fire-and-forget for perf) and make each newly-reachable failure branch skip its optimistic writes. Full 9-site caller audit: 3 sites already gated (`cycleModel` via `supportsAliasCycling`; both ModelPickerPopup paths render a separate native branch); live breaks at command drawer `App.tsx:2003` (phantom bubble), skill drawer `:2059` (phantom bubble), dispatcher `alsoSendToPty` `:1991`/`:2044` + StatusBar onDispatch `:2782` (`/clear` clears the visible timeline while native context is untouched; `/compact` strands `compactionPending` for the 180s watchdog), StatusBar onRunSync `:2745` (phantom `/sync` bubble), SettingsPanel→ThemeScreen `:2962` (silent drop), PreferencesPopup Advanced `:3019` (flips a native session to terminal view + drops `/config`).
4. **Stop affordance.** Visible stop control while a turn streams, both providers (CC → ESC byte; native → `native.interrupt`) — gives touch/phone-remote interrupt for the first time. Placement is Destin's eyeball call (dev instance, no CDP rig).
5. **Remove genuinely-CC-only affordances for native:** the StatusBar `/sync` action and Preferences "Advanced" `/config` flow control Claude Code itself and have no native meaning ever — hide them for native sessions (a real fix, not a shim). The skills/commands surfaces (`/clear`, `/compact`, drawer, `/theme-builder`) are NOT touched here — M3 makes them real; until M3 the honest-send plumbing (item 3) at least stops the phantom bubbles.

## §3 Milestone M2 — Conversations & sync (tags, transcripts, browse, takeover)

The resolved design decision (was the month-long blocker): model bindings are device-local (per-device provider ULIDs; `providers.json` in never-synced `~/.youcoded`; machine-bound keys; multi-GB local GGUFs), so a synced transcript can't carry a usable binding. **Destin's ruling (2026-07-22): resuming a native session ALWAYS offers the model selector — on any device, same as CC resume offers alias choice.** Track a synced, *portable* `lastUsedModel` (model id + provider type/label, never the device-local ULID), pre-fill the selector with it, never auto-launch. This dissolves cross-device continuation: resume is device-local model selection by design.

Phases (design basis: `2026-07-18-native-sync-parity-design.md` Option C):
1. **Store provider-awareness (writes).** `provider:'native'` records; provider-aware `localJsonlPath`/`transcriptRef` (native transcripts: `~/.youcoded/sessions/<slug>/<id>.jsonl`, `native-home.ts:115`); route the native host's `transcript-event` into `noteTranscriptEvent` (today fed only by `TranscriptWatcher` over the CC projects dir, hardcoded `provider:'claude'`, `ipc-handlers.ts:1917-1927`); carry provider on the moved payload; write `lastUsedModel` on create/`setBinding`/turn-complete.
2. **Read-side unlock — three provider locks:** `session:get-meta` reads `store.get('claude', …)` (`ipc-handlers.ts:2606`); Resume overlay lists `store.list('claude')` only (`session-browser.ts:377`); `session:browse` maps `nativeHost.list()` to `PastSession` rows with no `flags`/`tags`/`note` (`ipc-handlers.ts:1412`). Retire the 2026-07-19 stopgap in the same pass: `nativeMetaRefusal` + `NATIVE_META_UNSUPPORTED` (`shared/types.ts`), `metaDisabled` in ResumeBrowser, `metaSupported`/`metaLoaded` in CloseSessionPrompt, and `session-meta-native-refusal.test.ts` (replace with parity tests).
3. **Resume picker + `lastUsedModel`.** ResumeBrowser native rows present the provider-scoped model selector (same data source as ModelPickerPopup's native branch), pre-filled; selection becomes the binding.
4. **Space sync + takeover.** Native branches in `flushSessionToSpace`/`mirrorIn`/`materializeOne` (materialize currently bails on missing `transcriptRef` — phase 1 makes the record exist); **re-enable the native lease acquire** (the reverted block at `ipc-handlers.ts:545-570` says "re-enable together with parity, NOT before"); substitute `nativeHost.interrupt` for the ESC byte in the holder's quiesce step; the requester's post-takeover resume lands in the phase-3 picker. `holder-takeover.test.ts` must gain real native flows — the #177 lesson: the suite previously *certified* the no-op.
5. **Store-availability fix (not native-specific).** `noteFlagChanged`/`noteSessionNote` (`conversations/service.ts:267-273`) are `store?.` optional-chains — null store (boot window at minimum) evaporates the write while `SESSION_SET_FLAG` still broadcasts META_CHANGED and returns `{ok:true}`. Bound the reachability first; then buffer meta writes until `startConversationStore()` and flush in order, honest `ok:false` + renderer revert if the store never comes up.

Desktop-only (shares the v1.3.1 window with Android sync). Android tag/note handlers are stubs — that gap belongs to M8.

## §4 Milestone M3 — Context, skills & commands (the ecosystem works in native)

Design constraints already settled (former "context management" entry + Phase 2 spec §6 deferrals): the native system prompt is **byte-stable** for the whole session (KV-cache reuse for local models), so rules/skills/context must arrive as **messages**, exactly as Claude Code does it — never as mid-session system-prompt mutation.

1. **Skill tool + skill surfaces.** A `Skill` tool loads skill instructions as messages; the command/skill drawer and ThemeScreen's `/theme-builder` entry point (`ThemeScreen.tsx:228`) invoke it for native sessions. This is what makes the drawer/theme surfaces real — no toast shims (Destin 2026-07-22).
2. **Native slash commands: `/clear` and `/compact` first.** They are context operations — reset, and summarize-then-reset, the message history under the byte-stable prompt. Wire the existing reducer actions (`CLEAR_TIMELINE`, `COMPACTION_PENDING`) to real harness operations.
3. **Path-scoped rules + nested CLAUDE.md.** A path-matcher in the tool loop injects a rule message after a tool touches a matching path (`.claude/rules/*.md` `paths:`); nested/subdirectory CLAUDE.md discovery. Already in: root-walk AGENTS.md/CLAUDE.md snapshot (`prompt-assembly.ts`).
4. **MCP in native sessions.**
5. **Capability-gated injection.** A 600-word rule can blow a small model's window — injection must scale with the capability profile (soft dependency on M6's tiering; current profiles suffice to start).
Also owned by this phase per the Phase 2 spec: custom harness builder, mid-session preset switching, `~/.claude` migration — sequence within M3 when designing it.

## §5 Milestone M4 — Status, reliability & tool-parity UX

1. **Usage chips** (former entry, 2026-07-13): native turn `usage` reaches the per-turn strip but not StatusBar chips — `buildStatusData()` reads CC-hook files native never writes. Add renderer→main IPC pushing reducer `turn.usage` (mirror `remote:attention-changed` → `lastAttentionBySession`), fold into `status:data`.
2. **Cost-estimate chip** (2026-07-18): running session cost for hosted native models = cumulative usage × per-model pricing. Depends on item 1 (usage bridge) + M6 pricing sourcing; gate on `provider==='native' && binding.providerId !== 'local'`.
3. **PTY-less stuck detection** (2026-05-19): `useAttentionClassifier` reads the xterm buffer native sessions don't have. Transcript-driven heuristic (`isThinking && idle>~90s && !hasRunningTools → 'stuck'`), gated on provider; don't reuse the CC-spinner regex.
4. **Stall observability for local models** (2026-07-22): the 75s "no data received — provider may be stalled" message is wrong for in-process GGUF inference. Separate local-vs-cloud stall messaging (surface the real failure: hung inference, OOM, engine died), a visible "currently loaded model / loading…" state (status bar or providers tab), and a tunable/provider-specific timeout — local CPU inference can legitimately exceed 75s.
5. **Local-model switcher races** (2026-07-22): session-switcher pill disappears mid-resume of a local-model session; `/model` during a model load/reload wedges a frozen menu until app restart. Likely a session-restore-broadcast × load-state race plus `/model` not checking provider readiness. Fix with item 4's load-state visibility.
6. **Multimodal input + binary Read** (2026-05-19 / 2026-07-22): no UI to attach images to a native prompt (InputBar builds text parts only), and the harness Read tool is UTF-8-only — images/PDF/binary silently fail or mojibake while the schema advertises any file. Ship together: image picker emitting file parts + user-bubble rendering; Read gains honest binary handling (reject with a clear error where unsupported, real image support for vision-capable models; decide whether `artifacts.readBinary` gets exposed to harness tools).
7. **Folderless native sessions** (2026-07-16, low priority per Destin): new-session forms require a folder, so `defaultPresetFor`'s Assistant heuristic never fires and everything defaults to Coder. Allow folderless (cwd → sensible default), letting the empty-folder path drive the Assistant default.

## §6 Milestone M5 — Permissions maturity

1. **Full-auto prompt coherence** (2026-07-21): in Full Auto, permission gates still surface a two-button "Nevermind, allow once / Allow Always" prompt — nonsensical when the mode already means approve-everything. Root cause likely the gate builder keying copy off the live mode at render time. Decide: skip the prompt entirely in full-auto (auto-approve + log), or a single acknowledge card. Current state prompts when it shouldn't AND misleads.
2. **Bash always-allow rule shape** (2026-07-18): `harness-session.ts:562` emits `pattern: subject` and Bash's subject is the *literal full command string* (anchored `^…$`, `tools/subject-glob.ts`) — "always allow `git push origin main`" grants nothing for `git push origin dev`; meanwhile tools with `undefined` subjects (TodoWrite) get tool-wide grants. Needs a deliberate design (prefix rules / argv-head matching / user-editable glob at confirm time). **Danger:** remembered rules are the LAST layer and outrank `DESTRUCTIVE_DENY_LIST` (`permission-engine.ts:26-41`) — the accidental narrowness is currently the only blast-radius limiter; don't widen grants before item 3 exists.
3. **Permissions management UI** (2026-07-18): no way to undo an "Always allow" — `PermissionStore` has only `rulesFor`/`remember` (no list/remove IPC, no renderer reader; store header documents unbounded growth pending exactly this UI). Scope: `list()`/`remove(cwd, rule)`, IPC pair, Settings surface grouped by project slug (worktrees are separate slugs). PR #173 already removed the false "you can undo this in Settings" copy — the gap is user-visible on the app's highest-stakes prompt. Sequence: 1 → 3 → 2 (revocation before widening).

## §7 Milestone M6 — Model intelligence (metadata, tiering, budgets, cwd contract)

1. **Reconcile Plan C.** Land/finish the capability registry (`known-models.ts`/`capability-profile.ts` — on the Plan C branch, not master).
2. **Ground-truth model metadata** (2026-07-16): per-model provider/context/pricing/benchmarks/tool-support for picker decision-support. Sourcing decided: local/open → HF Hub server-parsed GGUF headers (`context_length`, `chat_template`); hosted → OpenRouter `/api/v1/models` (+ models.dev cross-check, both parsed in `model-catalog.ts`); benchmarks → Artificial Analysis + BFCL. Make facts *discovered* not *curated* (shrink `known-models.ts` to behavioral tuning). Live-probe API shapes before building. UI surface deferred — Destin: "figure out the UI separately."
3. **Capability tiering rework** (2026-07-16): capability and context are orthogonal axes; today every cloud model resolves to `CLOUD_DEFAULT` (a Haiku-class model gets frontier treatment) and local fallback tiers by context window (poor proxy). Destin's four tiers: small-context local, big-context local, small cloud, frontier cloud. Signals: parameter count (local), cost+benchmarks (cloud — shares item 2's sourcing). **Near-term sub-fix, do before dogfooding small local models:** `prompt-assembly.ts` caps project instructions at 20k chars unscaled — on an 8k-window model that alone blows `fitToContext` and collapses history; scale the instruction budget via the profile.
4. **Step budget → CapabilityProfile** (2026-07-17): `model-step-budget.ts` (family regex → 50 vs 25 steps) is a stopgap and the only place a raw modelId is inspected for budget; fold `allowedSteps` into the profile's discovered-facts → family-registry → fallback layers, then delete the module.
5. **Multi-model cwd contract** — existing plan `2026-07-18-multi-model-cwd-contract.md`: Bash `workdir` param, file tools reject relative paths loudly, imperative per-tool description contract, one canonical `<cwd-rules>` block (byte-stable, not provider-branched).

## §8 Later milestones

- **M7 Subagents → orchestration.** Task tool as child sessions (parent-session pointer, condensed result up) — deferred from Phase 2 by decision but CORE/VITAL; the session store was designed so this lands without schema change. Then workflow orchestration (spec `2026-07-19-native-workflow-orchestration-design.md`; research done, **no design decision taken** — the pivotal choice is model-authored JS vs declarative DAG, and DAG is favored for four-unpredictable-models + sandbox elimination via schema validation; concurrency must derive from llama-server `--parallel` slots, not copied constants; KV-cache prefix stability must be live-probed; our resumption story via child sessions can beat CC/Codex/Kimi). M7 subagent cwd takes an explicit `work_dir` param (per the cwd-contract plan's non-goal note).
- **M8 Android native runtime.** SessionService.kt has no native provider branch, no engine detection, no `native:*`/`local:*` handlers — roughly the size of the original desktop work. Also owns Android parity for M2 meta (tag/note stubs) and M5's permission UI.
- **M9 Onboarding equality** (Destin 2026-07-20): remove the Claude Code gate from first-run — installer downloads prerequisites, lands on Crème, then a popup offers three *equal* options (Claude Code / OpenRouter key / local runner). No default provider — the open-platform stance applied to onboarding. Intersects the separate `Onboarding.tsx` roadmap entry (2026-04-12, predates this direction — check whether its spec still names CC as primary before building either). Unscoped: popup design, `prerequisite-installer.ts` rework, mapping the conversational wizard onto a three-choice model.

## §9 Sequencing, dependencies, release mapping

- **Near-term tranche: M1 → M2 → M3** (M1 and M2 are independent of each other; M3 depends on neither but its capability-gated injection prefers M6 item 3's tiers — start with current profiles). M2 is the v1.3.1-targeted piece (shares the milestone with Android sync).
- **M4** anytime after M1 (item 2 also needs M6 item 2's pricing). **M5** items 1+3 anytime; item 2 strictly after 3. **M6** before heavy small-local-model dogfooding (at minimum its item 3 sub-fix).
- **M7** after M3 (skills/MCP shape the subagent context model); orchestration strictly after Task tool. **M8** last among the feature milestones; **M9** independent, whenever onboarding is picked up.
- Every milestone ships its own tests; the #177 lesson applies everywhere: fakes must be able to express failure, or the suite certifies the bug.

## §10 Absorbed ROADMAP entries (index)

Folded 2026-07-22 (full original texts in ROADMAP.md git history before the consolidation commit): native sync parity plan line + native session control plan line (the two 2026-07-22 plans, now archived) · permission-mode full-auto prompt incoherence (M5.1) · Bash always-allow literal string (M5.2) · permissions management UI (M5.3) · local-model switcher/reload races (M4.5) · 75s stall unclear for native (M4.4) · Read tool binary filetypes (M4.6) · usage chips (M4.1) · cost chip (M4.2) · stuck detection (M4.3) · multimodal input (M4.6) · folderless sessions (M4.7) · step budget → CapabilityProfile (M6.4) · richer model metadata (M6.2) · capability tiering rework (M6.3) · multi-model cwd contract (M6.5, plan doc lives on) · context management / skills / MCP / slash commands (M3) · Task tool/subagents (M7) · workflow orchestration (M7) · Android native parity (M8) · first-run CC gate removal (M9).

Kept as separate ROADMAP entries (deliberately NOT absorbed): session names revert after renderer crash (CC topic-watcher durability, not native); "Ask about this" native compose idea (renderer/compose UX); third-party agent CLIs (explicit what-if, cuts against the platform direction); Onboarding.tsx screen (M9 intersects it but it predates and exceeds this program); shipped `[x]` records.
