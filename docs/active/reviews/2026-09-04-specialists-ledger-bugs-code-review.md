<!-- first run of the 2026-09-04 feature flow's code reviewer (scripts/ui-review/code-reviewer.md), on a pre-flow branch: data for the 'measure after three features' roadmap item -->

> **Triage (implementing session, 2026-09-04): F1 accepted · F2 accepted · F3 rejected for this branch — pre-existing replay race, filed on docs/roadmap/native-harness.md · F4 accepted · F5 accepted · F6 accepted (fixed with F2). Fixes: youcoded 7d3cc64d, 44b7d5e0. Merged 2026-09-05.**

# Code review — fix/specialists-ledger-bugs (2026-09-04)

Repo: /home/destin/youcoded-dev/worktrees/specialists-bugs — commits f0ac766d (note placement) + e8ce8001 (checklist 9b test), diffed against merge-base a4526b43 (`origin/master...HEAD`; the branch is behind master, a two-dot diff drags in unrelated master work).

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/specialists-bugs (base master)
  tests: related to 7 changed file(s) + 34 source-scanning guards
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.   Not covered: Android (./gradlew test), marketplace worker.
```

## Findings (most severe first)

- F1 — desktop/src/renderer/components/buddy/BubbleFeed.tsx:136-146 — the third dispatcher of child `TRANSCRIPT_TOOL_USE` was not updated: its `tool-use` case forwards no `timestamp`, yet the same file dispatches `SPECIALIST_RUN_CHANGED` (lines 348-351), so in the buddy window a helper's tool rows are unstamped and a mid-run note can only be ordered against text/thinking segments — against tool rows it falls to the tail exactly as before the fix. Confirmed by reading: App.tsx:1197 and transcript-page-actions.ts:76 were patched, BubbleFeed.tsx was not (`rg "type: 'TRANSCRIPT_TOOL_USE'" src` lists all three); the pre-existing comments in App.tsx's switch name BubbleFeed.tsx as the mirror ("mirror BubbleFeed.tsx, must stay identical"), while the new WHY at App.tsx:1203 names only transcript-page-actions.ts. The parity guard `tests/transcript-event-surface-parity.test.ts` compares handled event TYPES only (line 22, 51-54), not forwarded fields, so it cannot catch this. The reconcileNoteSegments comment "every child segment carries the transcript event's own time since this fix" is therefore false for buddy-mode rows.

- F2 — desktop/src/renderer/state/chat-reducer.ts:531 (`segments.push(next)`, and the text/thinking pushes at :448/:471) — placement is one-directional: a note is inserted by time among rows already present, but a row that reaches the reducer AFTER a note stamped later than it is still appended at the tail, below that note. Input that produces it: `SPECIALIST_RUN_CHANGED` with `note.at = 200` on a card whose rows have not landed, then `TRANSCRIPT_TOOL_USE` with `timestamp = 100` → trail reads `[note, tool]`. That input is reachable live: transcript events are rAF-batched (App.tsx:1121-1130, up to one frame / 16 ms) while `specialists:event` is dispatched synchronously (App.tsx:1068), so a child tool-use stamped in the frame before the user's note is written lands after it. The branch's test "a tool row arrives AFTER the note that precedes it" covers only a tool LATER than the note (t3 at 500 after 'after' at 350), not this inversion. Confirmed by reading the two dispatch paths and the push; not run in the app. Narrow window, so low frequency, but the same "trail lied as an audit log" class the fix targets. [PLAUSIBLE as to how often it fires; the reducer behaviour itself is certain]

- F3 — desktop/src/main/ipc-handlers.ts:2690-2717 vs App.tsx:1068/1121 — the reattach replay the fix's WHY leans on ("on a replay … every tool row is already on the card") is itself racy: TRANSCRIPT_REPLAY sends every transcript event (renderer rAF-batches them, card included) and THEN the run records (renderer dispatches those synchronously, `replay-complete` at :2741 is also batched and comes later). If the run record's IPC message is processed before the next animation frame, `findSpecialistCard` finds no card and the record is dropped (:2323 "dropped, not parked"), so no note is placed at all on that reload — the fix only gets exercised on the NEXT live push. Pre-existing and not introduced here, but it is the path the commit message says it fixes. [PLAUSIBLE — ordering across IPC and rAF not measured in a running app]

- F4 — desktop/tests/native-session-host.test.ts:2178-2224 — the test's "through memory" leg is not isolated from disk: `rememberRule` (native-session-host.ts:2689-2703) writes memory synchronously AND kicks off `permissionStore.remember(cwd, rule)` before the first `ask()`, and `buildDecide` (:2385-2390) awaits `rulesFor(cwd)` (disk) before unioning memory, so the first three `expect`s can be satisfied by the disk record alone. The disk leg (the `restarted` host with no memory) IS isolated and does pin what the title promises; the memory-only claim in the test's comment is asserted, not proven. To pin it, stall or fail the store's `remember` for that host. Confirmed by reading both functions and the test.

- F5 — desktop/src/renderer/dev/workbench/fixture-loader.ts:186, 267 — the workbench's two `TRANSCRIPT_TOOL_USE` dispatchers carry no `timestamp`, so a specialist card mocked in the workbench (where review decks are captured) can never show a note interleaved with tool rows — the fix is unreviewable there. No fixture carries `notes:` today (`rg -n "notes:" src/renderer/dev/workbench` → none), so nothing is currently wrong on screen; it is a "weird" for the next deck.

- F6 — desktop/src/renderer/state/chat-reducer.ts:687-690 — `findIndex(s => s.timestamp > note.at)` assumes the segment list is time-ordered; F2 shows it need not be (a later-stamped note ahead of an earlier row). Once one inversion exists, later notes are placed relative to the first later segment, which may sit before earlier rows, compounding the misorder. Consequence of F2, listed so the fix for F2 (order rows against stamped notes on insert, or sort stamped segments at insert) is scoped to cover it.

Checked and clean: units match (`SpecialistNote.at`, `TranscriptEvent.timestamp` both epoch ms — harness-session.ts:873 `Date.now()`, ledger note `at` from the same clock); the replay splice keeps each child event's original stamp (native-session-host.ts:181-186 spreads `...e`); the `sa-perm-*` placeholder reclaim and the awaiting-approval duplicate path both preserve a stamp; `serializeChatState` spreads `toolCalls` entries wholesale (chat-types.ts:880) so the remote browser's hydrate carries `timestamp`; index-based note ids and the `withoutSeq` short-circuit are untouched; the `:1620` reference in the 9b test is accurate (`{ ...rule, specialist: entry.specialist.agentType }`).

## Not covered
- Did not launch the app; F2/F3 timing is from reading the dispatch paths, not measured.
- Android/Kotlin has no chat reducer of its own (shared renderer), not separately checked; `./gradlew test` not run.
- Did not write the reproducing reducer test for F2 (brief: no edits outside this file) — it is four lines in `chat-reducer-specialists.test.ts`: `SPECIALIST_RUN_CHANGED` with `note('mid', 200)` on the seeded card, then `childTool('t1', 100)`, expect `['tool:t1', 'note:mid']`.

Design note (one line): placing notes by time while leaving rows append-only is half an ordering invariant; either both kinds insert by stamp or the trail should sort stamped segments once at render.
