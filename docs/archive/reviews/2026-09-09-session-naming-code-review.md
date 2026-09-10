---
status: shipped
---
# Session naming — code review (fresh reviewer)

Branch `session/session-naming` in `youcoded`, diffed against `origin/master`.
Inputs: the branch diff, `session-naming.contract.json`, `.claude/rules/conversations.md`,
`.claude/rules/live-app-safety.md`, `.claude/rules/feature-flow.md`, `docs/PITFALLS.md`.
No spec, plan, deck or handoff was read.

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/sessions/session-naming/youcoded (base origin/master)
  tests: related to 31 changed file(s) + 44 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

Note: the contract has **no `mechanical` rows** — every row is `human` or `deck` — so there
are no named guards to check for "the test exists but tests something else". Findings below
are correctness, dead code and lying-name/comment classes only.

## Findings

- F1 accepted — `desktop/src/renderer/components/assistant-settings/use-renamed-sessions.ts:22` — renaming a **saved** session in the Resume Browser never repaints the row, because nothing in the shipping app ever dispatches `youcoded:session-renamed`; the only dispatcher is the workbench fake — `rg -n "youcoded:session-renamed" desktop/src desktop/tests` returns exactly `dev/workbench/mock-shim.ts:374`, the listener itself, and the test that fires the event by hand. `SessionRenameDialog.save()` calls `api.rename()` and then `onClose()` and dispatches nothing; `preload.ts` `sessionNaming.rename` and `remote-shim.ts` `rename` both just `unwrap(invoke(...))`. The parent list is only refetched by `session.browse()` in the `[open]` effect (`ResumeBrowser.tsx:373`), and the `sessionMetaChanged` subscription at `ResumeBrowser.tsx:653` handles `flag`/`note` only — never `title`. So the old name stays on screen until the browser is closed and reopened. This is exactly what R8 and R12 promise works. The hook's own WHY comment ("the rename call dispatches this event instead") describes only the workbench, which is why the workbench review would have looked correct.
- F2 accepted — `desktop/src/main/ipc-handlers.ts:3966` — renaming a **live Claude Code** session from the session strip broadcasts the wrong id, so the pill does not repaint either. `namingRename` computes `resolved = sessionIdMap.get(sessionId) || sessionId` and then sends `sendForSession(resolved, IPC.SESSION_RENAMED, resolved, res.name)`. `sessionIdMap` is keyed **desktopId → claudeId** (`ipc-handlers.ts:1857`, `2267`), so for a CC session `resolved` is the Claude UUID. `App.tsx:1516` matches on `s.id === sid`, where `s.id` is the *desktop* id — no match, no repaint. The automatic path gets this right (`applyAutomaticTitle` at `ipc-handlers.ts:2777` passes `desktopId` for both the routing key and the payload); only the manual rename path uses `resolved`. Native sessions are unaffected because their ids are identity-mapped. Same for `broadcastRename(resolved, …)` on the remote channel. Confirmed by reading the call chain end to end.
- F3 accepted — `desktop/src/main/conversations/naming-store.ts:128` — a read that discovers conflict copies can **clobber a concurrent write**. `get()` folds copies into `rec` outside any lock, then persists with `mutate(provider, id, () => rec)` — the callback throws away the `merged` record the lock handed it and writes the stale pre-lock value. Any field another process wrote between the unlocked read and the lock is lost. Everywhere else in this module the merge is a lattice join; here it is a blind overwrite. `() => mergeNamingRecords(merged, rec)` is what the surrounding comments describe. This is the data-loss class the whole sidecar exists to prevent (`.claude/rules/conversations.md` → "Merges are convergent (lattice join), not positional"). Confirmed by reading; not reproduced under concurrency.
- F4 accepted — `desktop/src/main/ipc-handlers.ts:3999` — the whole "hand the name back to automatic naming" path is dead product surface. R11 removed the reset action from the dialog, and `rg -n '\.automatic\(' desktop/src desktop/tests app/src` finds no caller outside the remote-server relay and `session-naming-preview.test.ts` (which exercises the workbench fake, not the app). Still shipped: `SESSION_NAMING_AUTOMATIC` in `types.ts`/`preload.ts`, the preload and remote-shim members, `namingAutomatic` + its handler, `clearManualSessionName` in `conversations/service.ts:561`, the `session-naming:automatic` case in `remote-server.ts:1418`, and the Android not-implemented entry. knip cannot see it because it is reachable through IPC registration. It is also a write endpoint exposed over the remote WebSocket that no UI can reach.
- F5 accepted — `desktop/src/main/session-namer.ts:143` — a completed reply that lands while a review is in flight is **not counted at all**, not merely deferred. `review()` returns at the `state.inFlight` guard before the `mutateNaming` that increments `replies`, so during a slow AI generation (up to the 15 s `AbortSignal.timeout` in `ipc-handlers.ts`, x3 attempts on failure) every `turn-complete` in that window is dropped from the schedule. R2's cadence therefore drifts long on exactly the sessions that reply fastest. The comment justifies the guard as double-naming prevention, which it is; the lost count is unremarked. Confirmed by reading; the increment is the only writer of `replies`.
- F6 accepted — `desktop/src/main/conversations/naming-store.ts:112` — `mutate` deletes only the conflict copies found by the **pre-lock** fold. The in-lock re-fold (line 104) merges any copy that arrived in between into the written record but leaves it on disk, so the next `get()`/`mutate()` re-folds and re-persists it. Harmless (the merge is idempotent) but it makes the "then the copies are deleted" claim in the file header untrue for that case, and a copy that keeps arriving keeps costing a write.
- F7 accepted — `desktop/src/renderer/components/assistant-settings/use-renamed-sessions.ts:25` and `:8` — two WHY comments describe behaviour that does not exist on this branch: "the rename call dispatches this event instead" (nothing does — F1) and "including after Use automatic name puts the generated name back" (R11 removed that action — F4). `SessionRenameDialog.tsx`'s own comment ("it never clears ownership") is correct; these two are not.
- F8 accepted — `desktop/tests/session-naming-preview.test.ts:1` — this file tests `dev/workbench/naming-preview.ts`, the fake backend, end to end and nothing in `src/main` or the shipping renderer path. It asserts `automatic()` semantics no product code can reach (F4). It cannot fail on a product regression, so it should not be read as coverage of R1/R6/R11.
- F9 accepted — `desktop/src/main/ipc-handlers.ts:2760` — `publishNamingMode()` writes `~/.claude/topics/naming-mode`, a single file shared by every YouCoded process on the machine. A `run-dev.sh` instance and Destin's installed app both write it at startup and on every settings change, so a dev instance set to Off silently disables the Auto-Title hook for the live app's Claude Code sessions (and vice versa). Every other dev/live split on this branch is isolated (shifted ports, separate `userData`, `~/.youcoded/config.json` is locked but still shared for the preference itself). Confirmed by reading `topicDir = path.join(os.homedir(), '.claude', 'topics')` at `ipc-handlers.ts:2361` — no dev suffix, no profile scoping. Not verified against a running instance (live-app-safety).
- F10 accepted — `desktop/src/main/ipc-handlers.ts:3448` — when `applyAutomaticTitle` refuses a topic because the user owns the name, `applyTopic` returns without setting `lastTopics`, by design. In the **polling** fallback (`startPolling`, used when `fs.watch` fails) that means the `topic !== lastTopics.get(desktopId)` test is true forever, so every 2 s the app re-runs `applyTopic` → `isSessionNameOwned` → a naming-store read + conflict-directory `readdirSync`, per manually-named session, for the life of the session. The `fs.watch` path is unaffected (it only fires on writes). Confirmed by reading; not measured.
- F11 accepted — `desktop/src/renderer/components/ResumeBrowser.tsx:984` — the row's main resume `<button>` lost the `<div>{s.name}</div>` that was its accessible name; the title now lives in a sibling `<Button>` above it whose activation opens the rename dialog. The resume control is left announcing only the metadata line. R12 asked for the name to be clickable-to-rename, which this does; the resume button's own label was collateral. Confirmed by reading the diff; not verified with a screen reader.
- F12 accepted — `desktop/src/main/remote-server.ts:778` and `:830` — the identical eight-line capability comment is pasted twice with broken indentation in the second copy (the `ws.send` sits at a different indent than its `case` body). Cosmetic; lint does not cover it. Flagged only because the two `auth:ok` sites now have to be kept in step by hand — a single helper would make the capability flag impossible to add to one and not the other. [PLAUSIBLE as a future-drift risk; both copies are correct today.]

## Contract rows nothing on the branch implements

None outright. R8 and R12 are implemented but do not visibly work in the shipping app (F1);
R5, R6, R9, R10, R11 are implemented as written. R2's cadence is implemented correctly in
`nextReviewAt` (1, 3, 28, 53 …) and "tool steps do not count" holds — `transcript-watcher.ts:283`
emits `turn-complete` only when `stop_reason !== 'tool_use'`.

## Notes that are not findings

- Desktop and Android `title-update.sh` are byte-identical (`diff` returns nothing). Good.
- Android correctly answers all five channels not-implemented, and Android reaches the UI
  through `remote-shim` (`index.tsx:182`, `connect('android-local')`), so the handshake's
  missing `sessionNaming` flag leaves `available: false` and hides every naming control.
  The desktop preload deliberately omits `available`; `namingApi()` only rejects an explicit
  `false`, so desktop is unaffected. Parity is coherent.
- The prompt builder ships only the user's own messages, truncated, which is what the
  settings explainer promises.

## Not covered (budget)

- No runtime verification of any kind (no dev instance launched — live-app-safety).
- Did not run the Android build or Kotlin compile (no SDK on this machine per CLAUDE.md).
- Did not audit `SessionNaming.tsx` / `ModelPicker` interaction, `naming-settings` config
  concurrency against `native.stepGuard`/`engine.*` writers, or the `SegmentedTabs`/
  `AnchorTip` copy against R3/R4/R7 wording.
- Did not test the `/clear`-truncation path where `transcript-watcher.ts:726` resets the
  read offset to 0 and re-emits historical `turn-complete` lines; `seenTurns` dedups within
  a run but is capped at 200/trimmed to 100, so a long session could re-count. Unconfirmed.
- Did not review `desktop/tests/naming-*.test.ts`, `session-namer.test.ts` or
  `session-naming-ownership.test.ts` for assertion quality beyond confirming they run.

## Disposition — all twelve accepted, all fixed on the branch

Re-verified after the fixes: `bash scripts/verify.sh youcoded --full` green (types,
FULL desktop suite, knip, lint, ast-grep); Android `./gradlew test` 741 passed, 0 failed.

- **F1** — `SessionRenameDialog` now dispatches `youcoded:session-renamed` on a
  successful save, and only on a successful one. Two new cases in
  `session-naming-races.test.tsx` pin both halves. The reviewer is right that the
  workbench masked this: the fake dispatched the event the product never did.
- **F2** — `namingRename` now derives a `desktopId` (`sessionIdMap.has(sessionId) ?
  sessionId : resolved`) and routes the broadcast under it, matching
  `applyAutomaticTitle`. The WHY comment names both id spaces so the next reader
  does not have to rediscover the split.
- **F3** — `get()`'s persist is `(cur) => mergeNamingRecords(cur, rec)`. Blind
  overwrite in the one module whose whole job is convergent merge was the worst
  finding here.
- **F4** — removed, not documented away: the channel constant, the preload and
  shim members, the handler, the remote-server case, the Android entry,
  `clearManualSessionName`, the `NamingApi` member and the workbench fake's
  implementation are all gone. The record still REMEMBERS the displaced automatic
  name (two ownership tests pin that) so a future action can offer it back without
  another model call. Product consequence, stated plainly: with R11's reset action
  removed, a manually named conversation cannot be returned to automatic naming at
  all. That follows from the approved contract; it is Destin's call whether it
  wants a different affordance, and it is filed rather than quietly built.
- **F5** — the reply counter moved OUT of the in-flight guard; only the generation
  is exclusive now. The guard release is tracked per call (`acquired`), because a
  concurrent early return would otherwise clear the running review's flag — a
  second bug the fix would have introduced. New test: three replies inside one slow
  generation count three, and ask the model once.
- **F6** — the folded-copy list is now collected INSIDE the lock, so every copy
  merged into the written record is the copy deleted afterwards.
- **F7** — both comments rewritten to describe what the code does.
- **F8** — the file now opens by saying it pins the workbench fake and is not
  coverage of any contract row; its `automatic()` assertions are gone with F4.
- **F9** — the mode file moved to `<userData>/naming-mode`, named by
  `YOUCODED_NAMING_MODE_FILE`, which main sets before any session spawns and the
  pty worker passes down. run-dev.sh isolates userData, so a dev instance can no
  longer retune the installed app's naming. The hook falls back to the old shared
  path, and then to its own timer.
- **F10** — `lastTopics` records a refused topic too; the map answers "have I dealt
  with this string", not "did I paint it".
- **F11** — the resume button carries `aria-label={s.name}`.
- **F12** — the second `auth:ok` site keeps a one-line pointer instead of a second
  copy of the paragraph.

Not re-checked after the fixes, same as the review: no runtime verification, and
the `/clear`-truncation re-count path the reviewer flagged as unconfirmed. That
last one is filed on the roadmap rather than guessed at.
