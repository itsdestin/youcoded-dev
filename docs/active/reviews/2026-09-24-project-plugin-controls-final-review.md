# Project plugin controls — final code review

Branch `session/plugin-project-controls` at `a1ddc4022`, diffed against merge-base
`7247ad7eb3a8ab8a8f045fac7028673e7ff6eb6e` with `origin/master` (`ab15a5858`, fetched fresh).
Fresh reviewer, no prior review/spec/plan context. Extra depth on the three commits after the
previously-reviewed `6ed6ae820`: `672b6a16f`, `f56817bc7`, `a1ddc4022`.

## verify.sh --full

```
verify: /home/destin/youcoded-dev/worktrees/sessions/plugin-project-controls/youcoded (base origin/master)
  tests: FULL suite (--full)

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

## Merge cleanliness

**Master has moved on substantially: 81 commits ahead of the merge-base**, and **this branch
does NOT merge cleanly.** `git merge-tree --write-tree HEAD origin/master` (no actual merge
performed) reports:

```
CONFLICT (content): Merge conflict in desktop/line-budgets.json
CONFLICT (content): Merge conflict in desktop/src/main/harness/native-session-host.ts
CONFLICT (content): Merge conflict in desktop/src/renderer/hooks/use-esc-close.tsx
```

- `desktop/line-budgets.json` — mechanical, both sides changed line-count numbers.
- `desktop/src/main/harness/native-session-host.ts` — both sides made substantial changes
  (this branch's T2/T3/T6 project-extensions wiring vs. master's `94e98593d` "per-turn disk
  reads off the main thread" perf fix). Needs a careful manual merge to avoid reintroducing a
  blocking main-process call while re-adding this branch's wiring.
- `desktop/src/renderer/hooks/use-esc-close.tsx` — see F1 below; this one is not mechanical,
  it's two different-sized fixes for the *same bug*.

## Findings

- F1 — `desktop/src/renderer/hooks/use-esc-close.tsx:161` — the branch's Esc-stack-race fix (`f56817bc7`) is a narrower version of master's independent fix for the identical race, and merging naively in the branch's favor silently drops the missing half — confirmed by diffing `f56817bc7` against `origin/master`'s `9aa307550` (both dated 2026-09-24, master's landed ~5.5h earlier), which independently diagnosed and fixed the exact same `ModelSwitchPrompt` "Esc closes only the question" race. Master's fix promotes **two** effects in `useEscClose` to `useLayoutEffect`: the Esc-stack push (line ~180 on this branch) *and* `useEffect(() => { ref.current = onClose; }, [onClose])` (line 161). This branch's fix promotes only the stack-push effect and leaves the `ref.current = onClose` assignment as a plain passive effect. That leaves a narrower version of the same class of bug: if an overlay's `onClose` callback identity changes on a re-render (e.g. it closes over updated component state, as `ModelSwitchPrompt`'s `onClose` does across its confirm/apply flow) and Escape is pressed in the gap between that render's paint and the passive effect actually running, `top.ref.current()` still invokes the **stale** `onClose` from the previous render — under the same "heavy CPU load stretches the macrotask gap" mechanism this commit's own message describes for the push effect. `git merge-tree` (see above) shows this exact file conflicts against master, so this isn't hypothetical: someone has to resolve it, and picking "ours" wholesale reintroduces the half master already fixed. — confirmed by reading both diffs side by side; no test in `use-esc-close.test.tsx` exercises a changing-`onClose`-identity-before-Escape scenario, so `verify.sh` passing does not cover this gap. [PLAUSIBLE: the practical window is small (must lose to CPU scheduling under real load, same as the bug this commit fixes), but the code difference itself — not the exploitability — is directly confirmed, not inferred.]
- F2 — `desktop/src/main/harness/native-session-host.ts` and `desktop/line-budgets.json` — real (non-mechanical for the first file) merge conflicts against `origin/master`, confirmed via `git merge-tree --write-tree HEAD origin/master`; master's `94e98593d` moved native-harness per-turn disk reads off the main thread in the same region this branch's T2/T3/T6 commits (`b24c53706`, `bf1eebb2d`, `6ed6ae820`) wired up project-extensions enforcement. Whoever merges needs to re-verify `main-blocking-calls.test.ts` stays green after resolving, not just that the conflict markers disappear.
- F3 — `desktop/src/renderer/components/project-view/ProjectView.tsx:252-297` (the R14 per-frame retry-scroll fix, `a1ddc4022`) — reviewed for the specific risks called out (infinite loop, rAF leak after unmount, fighting the user's own scroll): none found. It is bounded (`MAX_ATTEMPTS = 180`, ~3s), the cleanup sets `cancelled = true` and calls `cancelAnimationFrame(frame)` on every dependency change/unmount so no rAF outlives the effect, and it only calls `scrollIntoView` once (on the frame the target first exists) before clearing its own trigger flags, so it cannot repeatedly yank the viewport against a user who is actively scrolling. `activeProject` (an effect dependency) is `useState`-held and only changes identity when the project actually changes, so the effect does not restart every render. No issue found — confirmed by reading the full diff and the surrounding component state wiring.
- F4 — `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` / `MarketplaceScreen.tsx` / `MarketplaceDetailOverlay.tsx` (U2 fix, `672b6a16f`) — reviewed the install→setup-panel wiring: `pluginHasParts` is now a single shared predicate (`shared/catalog-types.ts`) used by both the card's own install button and the detail overlay's, `handleInstalledWithParts` is a stable `useCallback` (so it doesn't defeat `MarketplaceCard`'s memo per `renderer-lists.md`), and `MarketplaceDetailOverlay`'s two effects run in the documented order (reset-on-navigate, then apply-`openSetupFor`-on-top) so a stale `justInstalled` from a previous target can't leak forward. No issue found.
- F5 (Android/remote parity, both explicitly-scoped, not bugs) — `project-extensions:*` channels are present in `preload.ts` and `remote-shim.ts`/`remote-server.ts` (remote gets full `get`/`set`/`for-session`, and explicitly refuses `import-skill` over remote with `not-available-over-remote` — matches the "no OS file picker over remote" design constraint and directly answers the "does the remote path stay safe" question). Android's `SessionService.kt` answers all four `project-extensions:*` channels not-implemented, with a comment explaining this is B-2 "later" (no native harness on Android yet) — consistent with the existing pattern for `permissions:*` and `specialists:*`. Confirmed by reading `preload.ts:1634`, `remote-shim.ts:3075`, `remote-server.ts` (project-extensions WS cases), and `SessionService.kt:4310-4316`.
- F6 — `desktop/src/main/project-extensions/import-skill.ts` — reviewed the file-copy path for the "can anything block or slow the main process" and "does the remote path stay safe" questions: fully `fs.promises`-based (no `*Sync`, satisfying performance rule 1), symlink-refused via `lstat` on both the file and its containing dir, denylist-checked on both raw and `realpath`-resolved forms, source/destination overlap refused, and remote callers are refused before this function is ever reached (see F5). No issue found.

## Not covered

Budget spent on the flagged three commits plus a full-branch skim. Not independently re-reviewed
at this depth (previously covered by the earlier review up to `6ed6ae820`, and by `verify.sh
--full` passing, but not re-read line-by-line here): `desktop/src/main/project-extensions/store.ts`
(520 lines), `ipc-shell.ts`, `view.ts`, `session-availability.ts`, `feature-first-run.ts`,
`project-key.ts`, `ProjectSetupPanel.tsx`, `CommandDrawer.tsx`'s drawer-chip changes,
`harness/mcp/mcp-manager.ts`, `harness-session.ts`, `session-store.ts`, `skill-catalog.ts`,
`skill-scanner.ts`, `skill-provider.ts`, and the Kotlin `SessionService.kt` diff beyond the
not-implemented list. Did not attempt an actual trial merge/rebase to see how large the
`native-session-host.ts` conflict resolution would be beyond what `git merge-tree` printed.

## Triage (implementing session)
- F1 accepted — merged origin/master taking master's more complete use-esc-close fix (both effects layout-phase).
- F2 accepted — merge conflicts resolved (native-session-host keeps master's precomputed triggers + this branch's params; line budgets set to combined size); verify.sh --full green incl. main-blocking-calls; Android 1014/0.
- F3–F6 no change needed — reviewer confirmed no issue.
