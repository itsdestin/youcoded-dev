---
plan: docs/superpowers/plans/2026-07-15-workspace-knowledge-mgmt-phases-1-2.md
started: 2026-07-15
residue: 1
---

# Knowledge-management execution changelog

Running record of every disposition made while executing Phases 1+2. `residue:` above counts
open items awaiting Destin's decision (listed under ## Residue). Update the count whenever
the list changes — the session-start hook greps it.

## Dispositions

Task 3 — knowledge-debt triage → ROADMAP.md. Rows 1–36 are the 36 dated knowledge-debt
entries in file order; rows 37–40 are the extra deferred-work items swept in from PITFALLS.md
(Task Step 3) that had no knowledge-debt entry. `docs/knowledge-debt.md` is deleted in Task 4.

| # | Item | Disposition | Confidence | Notes |
|---|------|-------------|------------|-------|
| 1 | Restore-from-backup removed; redesign deferred (2026-07-14) | → ROADMAP (seeded) | High | Skeleton Someday "Restore-from-backup redesign" line captures it; the Android restore-backend demolition follow-up is folded into the v1.3.1 Android item. No duplicate added. |
| 2 | DiffusionGemma support deferred (2026-07-13) | → ROADMAP | High | Someday idea `#local-models`; upstream-gated on llama.cpp PR #24427 + llama-server diffusion support. |
| 3 | Misleading error messages — full audit + replacement (2026-07-14) | → ROADMAP (seeded) | High | Skeleton v1.3.1 line captures it; enriched detail with the shipped engine sub-fix (PR #123) + open scope (workspace audit + two-action fallback component). No duplicate. |
| 4 | StatusBar usage chips not fed for native sessions (2026-07-13) | → ROADMAP | High | Features `#native-runtime`; renderer→main IPC to feed status:data. Land with Phase 2 (youcoded PR #119). |
| 5 | Cross-device project auto-discovery (2026-07-12) ✅ RESOLVED | Drop (resolved) | High | Verified merged to youcoded master (1f397c87 + b5d29f34 + followups). Deferred residuals already tracked in handoff A01. |
| 6 | Onboarding.tsx screen deferred (2026-04-12) | → ROADMAP | High | Verified Onboarding.tsx absent in youcoded 2026-07-15; Features. |
| 7 | Icon override system is dead code (2026-04-12) | → ROADMAP | High | Verified no `theme.icons[slot]` consumers in components 2026-07-15; Features (wire-or-remove). |
| 8 | Sign + size-cap announcement payload (2026-04-21) | → ROADMAP | High | Features `#security` `#announcements`; defense-in-depth hardening. |
| 9 | CC-drift: Glob/Grep merge into Bash tool card verify (2026-04-21) | Drop (subsumed) | High | Pure CC-version regression verification — subsumed by the youcoded/docs/cc-dependencies.md CC-bump review flow (redesign's home for CC-version watch items). |
| 10 | CC-drift: CLAUDE_CODE_FORK_SUBAGENT toggle (2026-04-21) | → ROADMAP | High | Someday idea (dev-mode settings toggle); no coupling. |
| 11 | CC-drift: cleanupPeriodDays coverage audit (2026-04-21) RESOLVED 2026-07-15 | Drop (resolved) | High | Entry marked RESOLVED (Plan 2c; retention-default.ts seeds 365d correctly). |
| 12 | Legacy conversation-index READ-ONLY / full retirement (2026-07-15) | → ROADMAP | High | Features `#sync`; delete read path + on-disk file once residual legacy rows unneeded. Same item as PITFALLS-sweep "legacy conversation-index full retirement" — deduped to one ROADMAP line. |
| 13 | Document Go-binary exec trap in Android runtime docs (2026-04-23) | Fix now | High | Verified missing from docs/android-runtime.md; added a "Go binaries can't exec scripts in ~/.claude-mobile/" subsection under System Fundamentals (why/symptom/two safe paths, cites the rclone fix 6469e058). |
| 14 | Android Library doesn't show locally-built themes (2026-04-25) | → ROADMAP | High | Features `#android`; port synthesizer to Kotlin. Same as PITFALLS-sweep "Android local-theme synthesis parity gap" — deduped to one line. |
| 15 | Android integrations install/connect/uninstall (2026-04-28) | → ROADMAP | High | Features `#android` `youcoded#78`. |
| 16 | Analytics payload ↔ privacy copy must stay in sync (2026-04-24) | Drop (subsumed) | High | Subsumed by /audit's outward-facing-docs review (redesign) — the audit now checks copy/code sync; no standing ledger entry needed. |
| 17 | CC-drift: adopt PostToolUse updatedToolOutput (2026-04-29) | → ROADMAP | High | Someday idea `#hooks` (secret/PII redaction at tool-output boundary). |
| 18 | CC-drift: wrap claude ultrareview CLI in admin skill (2026-04-29) | → ROADMAP | High | Someday idea (headless review in release pipeline). |
| 19 | CC-verification: scrollback/orphan-spinner/MCP-spawn/TaskList (2026-04-29) | Drop (subsumed) | High | CC-version regression verification — subsumed by the cc-dependencies.md CC-bump review flow. (Its scrollback bullet's product angle lives in the ROADMAP "xterm scrollback duplicate-chrome mitigation" idea.) |
| 20 | CC-verification: install-prereq bash/curl + reg.exe (2026-04-29) | → ROADMAP | High | curl→wget fallback (v1.2.4) + dynamic reg.exe path (2026-05-22) already RESOLVED; only the optional `bash --version` probe carries → Someday idea `#install`. |
| 21 | CC-drift: surface CC /goal in the UI (2026-05-18) | → ROADMAP | High | Someday idea (status-bar widget/banner). |
| 22 | CC-drift: CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN for Android scrollback (2026-05-18) | → ROADMAP | High | Folded into the single "xterm scrollback duplicate-chrome mitigation" Someday idea (two approaches: bump scrollback 5000+, or the env var) — deduped with the PITFALLS-sweep scrollback item. |
| 23 | CC-drift: surface CC agent view / background sessions (2026-05-18) | → ROADMAP | High | Someday idea `#sessions`; large/speculative. |
| 24 | Local-mode tool views: list/patch render raw (2026-05-19) | Drop (subsumed) | High | OpenCode-adapter-specific tools with no native-harness equivalent; feat/opencode-mvp is archived. Nothing to carry forward. |
| 25 | Local-mode subagent (task) empty card (2026-05-19) | Drop (subsumed) | High | OpenCode AgentPart translation; native-harness subagent routing is already cataloged (PITFALLS Phase-0/1 / PR #115). Archived branch — no carry. |
| 26 | Local-mode: no Android parity (2026-05-19) | → ROADMAP | High | The desktop-only gap carries to the native harness → Features `#native-runtime` `#android`. |
| 27 | Local-mode: image input (FilePart) unhandled (2026-05-19) | → ROADMAP | High | Multimodal-input gap carries to the native harness → Features `#native-runtime`. |
| 28 | Local-mode: session.compacted event unhandled (2026-05-19) | Drop (subsumed) | High | OpenCode-specific event translation; no native-harness equivalent. Archived branch — no carry. |
| 29 | Roadmap: YouCoded Cloud sync transport (2026-07-03) | → ROADMAP | High | Explicit roadmap commitment → Someday idea `#sync` (spec §16). |
| 30 | Local-mode: stuck-detection inactive (2026-05-19) | → ROADMAP | High | PTY-less classifier gap carries to the native harness → Features `#native-runtime`. |
| 31 | Accounts Phase 1: dispositioned follow-ups (2026-07-08) | Drop (resolved) | High | Entry states ALL EIGHT items CLOSED (worker PR #20 + client 814365c4); soak-only. |
| 32 | Accounts Phase 1 plan docs show pre-hardening code (2026-07-08) | Drop (subsumed) | High | Documentation-only caveat; subsumed by the redesign's plan-archival (docs/archive + status markers). Merged worker code is source of truth. |
| 33 | ModelPickerPopup /fast + /effort bypass prompt gate (2026-07-09) | → ROADMAP | High | Bugs `#pty-writes`; thread a guarded sender. |
| 34 | Copilot/AI key buddy floater (2026-07-14) | → ROADMAP | High | Someday idea `#games` (globalShortcut binding). |
| 35 | Unified synced SystemState (2026-07-14) | → ROADMAP | High | Someday idea `#sync`; speculative multi-device state. |
| 36 | Accounts Phase 2: dispositioned follow-ups (2026-07-09) | → ROADMAP | High | Open items (two-person verification is the real risk) → Features `#accounts`. |
| 37 | Android artifact `not-implemented-on-mobile` stubs — mobile Project View v2 (PITFALLS sweep) | → ROADMAP | High | Features `#android`; cites PITFALLS "Artifact Viewer". No knowledge-debt entry. |
| 38 | `.partial` orphan scan IPC — local-models Plan C v1 gap (PITFALLS sweep) | → ROADMAP | High | Someday idea `#local-models`; cites PITFALLS "Phase 1 Plan C". No knowledge-debt entry. |
| 39 | Amendment K2 router hot-reload of --models-dir (PITFALLS sweep) | → ROADMAP | High | Features `#local-models`; cites PITFALLS "Phase 1 Plan C". No knowledge-debt entry. |
| 40 | Android PtyBridge echo-driven submit TODO (PITFALLS sweep) | → ROADMAP | High | Features `#android` `#pty-writes`; cites PITFALLS "PTY Writes → Android". No knowledge-debt entry. |
| 41 | `docs/knowledge-debt.md` | Deleted (triaged to ROADMAP in Task 3) | High | Every dated entry dispositioned in rows 1–36 above; file removed in Task 4. Session-start staleness detection repointed at `docs/audits/`. |
| 42 | `GEMINI.md` | Deleted (Gemini CLI discontinued June 2026) | High | Dead file — Google discontinued the Gemini CLI; the `gemini` provider was removed from the codebase (PITFALLS "Multi-Model Provider Seam"). |
| 43 | `docs/local-dev-vm.md` | Residue — awaiting Destin | Low | Is the VM flow still used? Recommend: archive (superseded by run-dev.sh isolation) unless still in use. File untouched pending the answer. |
| 44 | CLAUDE.md `@import` block → replaced with lazy pointer table | Done | High | Removed the 7 `@docs/...` eager imports; added "Where Knowledge Lives" taxonomy + document-lifecycle convention, a "read on demand" Subsystem References pointer table, the one-product principle, first-screen MAP.md navigation line, and repointed staleness bullets at `docs/audits/` residue. Swept dead refs (knowledge-debt/AUDIT.md/GEMINI — none remain). Eager load (CLAUDE.md + live-app-safety.md + ~/.claude/CLAUDE.md): 33,601 → 2,763 words. |

## Residue (needs Destin)

1. **docs/local-dev-vm.md** — is the VM dev flow still used? Recommendation: archive it (run-dev.sh's isolated dev instance superseded the VM approach) unless it's still part of your workflow.
