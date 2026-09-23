---
status: active
date: 2026-09-23
---

# Resume project-level skills, plugins, and MCP controls

**Branch:** `session/plugin-project-controls` in both the workspace and app repositories. The session worktree key is `plugin-project-controls`. **Nothing is merged or production-wired.** These commits (once made) preserve decisions and a workbench-only visual prototype so the next session can continue, not ship a feature.

## Read first

1. `docs/active/specs/2026-09-23-project-extension-availability-decisions.md` — the durable record of Destin's confirmed behavior and outstanding decisions. This is **not** a final build contract.
2. `docs/active/design/2026-09-23-project-plugin-controls/project-plugin-controls.questions.answers.json` — four answered questions, plus the decision record for answers given in chat.
3. `docs/active/design/2026-09-23-project-plugin-controls/project-plugin-controls.review-6.answers.json` — **yes, “good enough for now”** on *card grouping/collapsing/styling only*. The second review's answer (`project-plugin-controls.review-2.answers.json`, P-2 yes) approves muted locked-on bundled switches with a hover explanation. Rounds 1–5 record rejected attempts, not implementation options.
4. `youcoded/desktop/src/renderer/dev/workbench/mockups/ProjectPluginControls.tsx` and the `project-plugin-controls` surface in `youcoded/desktop/src/renderer/dev/workbench/compare/registry.tsx` — UI-only, local state, sample Research Kit. **Do not treat mock data, toggle logic, headers, or placement as a product contract.** Only the approved visual directions above carry forward.

## Exact stopping point

- No real Projects tab, Marketplace download-to-config route, command-drawer status, storage/IPC policy, native MCP connection gating, Claude Code consent flow, Android path, or cross-device install flow was implemented.
- The final prototype (round 6) borrowed YouCoded's existing collapsible-group anatomy: project group → plugin group → setting-card leaves, with symmetric inset bodies. Destin accepted this **grouping direction**, not the overall page or install flow.
- The isolated workbench was stopped after review. Before reviewing again, reproduce the design **in the real Projects screen/context** using existing settings components, rather than drawing an isolated imitation and hoping it fits. Also review the command drawer and second-device states visually. The earlier five standalone layout revisions were rejected; do not reopen them as competing approved candidates.
- The old rounds in `compare/registry.tsx` all call the **same current mock component**, so their route names do **not** reconstruct historical screenshots. The answered JSON and prose record are the authority on what Destin saw and said. Do not cite an older live round as a preserved before image.
- This project's UX tester report is `docs/active/reviews/2026-09-23-project-plugin-controls-ux-review-1.md`. Its phone-width clipping finding was fixed in the workbench candidate by reducing the frame minimum to 320px. It did **not** fully verify toggle flows. Sample risk confirmation was separately inspected; neither proves production behavior.

## Next work, in order

1. Set up a review in the **actual Projects UI** using the confirmed grouping, not this standalone page. Keep the installed-plugin/across-project interaction and bundled exceptions faithful to the decision record. Get visual approval of the full configuration surface and the command drawer; include narrow viewport. Don't fill the unresolved behaviors without Destin's answer.
2. Resolve the remaining design boundaries explicitly: how all pre-existing project/item states map to controls without disabling what currently works (including bundled defaults); personal skills outside project sync; local-only MCP setup and missing plugin state; Claude Code opt-in effects. Mid-session MCP access is deliberately deferred.
3. Only then write a build/acceptance contract and implementation plan, and build/test native sessions and both platform surfaces. This branch's desktop `scripts/verify.sh` passed for **workbench-only** changes; it does not cover Android or validate the feature in a real session.

The decision record and workbench prototype live in **different repos** within this session worktree. Keep both branches when handing this off; no commit/push/merge is implicit in this document.
