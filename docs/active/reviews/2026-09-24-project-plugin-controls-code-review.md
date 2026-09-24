# Project skills/plugin controls — code review (fresh, whole branch)

Reviewed `session/plugin-project-controls` vs `origin/master` (merge-base `7247ad7e`), 17
commits, 74 files, +7891/-96. Read every file the diff touches in full for the main-process
spine (`project-extensions/{store,resolve,session-availability,project-key,candidates,
feature-first-run,import-skill,ipc-shell,view}.ts`), the wiring seams (`main.ts`,
`ipc-handlers.ts`, `remote-server.ts`, `preload.ts`, `remote-shim.ts`,
`native-session-host.ts`, `mcp-manager.ts`, `skill-catalog.ts`, `skill-provider.ts`,
`SessionService.kt`), and the renderer surfaces (`useProjectExtensionsController.ts`,
`useSessionAvailability.ts`, `SkillsToolsTab.tsx`, `ProjectSetupPanel.tsx`,
`MarketplaceDetailOverlay.tsx`, `CommandDrawer.tsx`, `ProjectView.tsx`, `artifact-actions.ts`,
`artifact-tracker.ts`). Cross-checked contract rows R1–R24 against the code (UI-shape rows
`checkedBy: deck` are not re-litigated here — only the ones a code path can falsify).

## Verify

```
verify: /home/destin/youcoded-dev/worktrees/sessions/plugin-project-controls/youcoded (base origin/master)
  tests: FULL suite (test infra changed: desktop/package.json)

PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (full suite)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

## Findings

No bugs, broken contract promises, dead/duplicated code, or performance-rule violations
were found. This is an unusually thorough implementation: every seam I checked (main ↔ IPC
↔ remote-server ↔ renderer payload shapes, Android's explicit not-implemented list, the
uninstall cascade, first-run ordering, hidden-means-idle on the new tab, chunked-reveal on
the setup panel's project list, knip/line-budget ratchets moved rather than gamed) already
carries a WHY comment explaining a prior review round's fix. I have no findings to number.

Two observations, below severity of a numbered finding (not bugs — noted for awareness):

- **O1 — `desktop/src/main/harness/native-session-host.ts` `createInner()`, `discoverSkillEntries(opts.cwd)`** — this is a synchronous directory scan (performance rule 1 territory) on the session-create path. It is **not a new blocking call this branch introduces**: `toolWiring()` already called the same synchronous scan via `createSkillCatalog(undefined, cwd)` before this branch (confirmed by reading `skill-catalog.ts`'s pre-existing `createSkillCatalog` and the diff, which only extracts `discoverSkillEntries` out of it and reuses the one scan for both availability resolution and tool wiring rather than scanning twice). The branch's own `ipc-shell.ts` correctly uses `discoverSkillEntriesAsync` for the hot `get`/`set`/`for-session` paths (T3 review F2), and its comment explicitly reasons about the sync/async split. Confirmed by reading `discoverSkillEntries`/`discoverSkillEntriesAsync` in `skill-catalog.ts:71-108`. PLAUSIBLE that a future session-create hot-path change could make this newly hot, but as landed it is no worse than before.
- **O2 — `desktop/flappy-bird.html`** — shown modified in this worktree's git status but is not part of any commit on this branch (`git log -p` for the branch touches no such file). Unrelated stray working-tree edit, out of scope for this review.

## Not covered

- Android build (`./gradlew test`) — not run; SDK/JDK presence wasn't checked this session (workspace rule: never read that off a doc, only a live `ls`). The Kotlin-side change is additive-only (a not-implemented channel list entry), low risk, and `bash scripts/verify.sh` doesn't cover it.
- Marketplace Worker — no changes in this branch touch it; not applicable.
- `scripts/ui-review/dom-size-sweep.mjs` (8,000-element stress pin) — needs a browser, not part of `verify.sh`; `ProjectSetupPanel`'s project list already uses `useChunkedReveal` per `renderer-lists.md`, but the pin itself wasn't run.
- Live manual click-through of the built dev app — not run (read-only review; also live-app-safety.md scope).
- The `permissions:list`/specialist-catalog and every other pre-existing IPC surface this branch's constructor-arg insertions touch positionally (`native-session-host.ts` gained two new constructor params) — verified by type-check + full test suite passing, not independently re-read line by line for every existing call site.
