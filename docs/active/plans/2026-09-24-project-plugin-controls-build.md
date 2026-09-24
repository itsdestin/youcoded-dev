---
status: active
date: 2026-09-24
---

# Project skills & tools — build plan

Contract (signed 2026-09-24): `docs/active/design/2026-09-23-project-plugin-controls/project-plugin-controls.contract.json`.
Design: `docs/active/specs/2026-09-24-project-plugin-controls-technical-design.md` (three review
rounds applied). App branch: `session/plugin-project-controls` in `youcoded/`.

Tasks run one at a time; each is built by one agent and checked by a fresh reviewer before the
next starts. Every task ends with `bash scripts/verify.sh <app worktree>` green and a commit on the
app branch (explicit paths), pushed.

| # | Task | Main files | Contract rows |
|---|---|---|---|
| T1 | Settings store + `resolveAvailability` + seeding + uninstall cascade, with unit tables | `desktop/src/main/project-extensions/{store,resolve,project-key}.ts` | R2 R4 R24 |
| T2 | Enforcement: per-session skill list + `McpManager.acquire(allowIds)` + frozen set in the native session header, reused on resume | `harness/native-session-host.ts`, `harness/harness-session.ts`, `harness/mcp/mcp-manager.ts`, `harness/session-store.ts` | R1 R7 R15 R24 |
| T3 | IPC: `project-extensions:get/set/for-session` + `project-extensions:import-skill` on all five surfaces; Android stubs; parity tests | `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `remote-server.ts`, `SessionService.kt` | — |
| T4 | Skills & tools tab (production), risk popup, needs-setup popup with Ask assistant / Choose skill file | `renderer/components/project-view/SkillsToolsTab.tsx` (+ ProjectView wiring) | R3 R5 R6 R8–R12 R16 R21–R23 |
| T5 | Drawer chips, missing cards, `useSessionAvailability`, Q-2 line | `CommandDrawer.tsx`, `SkillCard.tsx`, `App.tsx` (prop only) | R13 R14 R15 R18 |
| T6 | Post-install `ProjectSetupPanel` in the Marketplace overlay | `marketplace/MarketplaceDetailOverlay.tsx`, new `marketplace/ProjectSetupPanel.tsx` | R19 R20 |
| T7 | Retire the workbench-only prototype from production components; mock-shim answers the new channels so the workbench still renders the real screens; boot check | `dev/workbench/*`, the components above | — |

After T7: code reviewer + UX tester (second run) in parallel, triage, contract re-check,
grader, acceptance deck.
