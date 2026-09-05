---
status: active
created: 2026-09-05
reviews: docs/active/plans/2026-09-05-voice-prompting-tasks.md
gate: feature-flow §8c — the one breakdown review before ten subagents are dispatched
---

# Voice prompting — work-breakdown review

**All 22 accepted**; the breakdown was rewritten from them (plan `revised:` 2026-09-05).
B1 (nothing registers the handlers) and B2 (the tree goes red for all of wave 2) were the two
that would have cost real build time; B5 is the "two subagents, two ways" failure this gate
exists for.

Findings only. Verified against the code on `worktrees/voice-prompting`
(`feat/voice-prompting`, tip `06885359`), the technical design, and the 23-row contract.

- B1 accepted — T5 — `voice-handlers.ts` would never be installed: handler modules are registered from `desktop/src/main/main.ts` (`registerSocialHandlers` / `registerArcadeHandlers`, main.ts:67-68), which no task names, so the six channels exist and are never wired and the design's `app.on('before-quit')` worker kill has no home — add `src/main/main.ts` to T5's files with an explicit `registerVoiceHandlers(...)` + before-quit step.
- B2 accepted — T5, T7, T10 — the tree goes red mid-build: `workbench-mock-contract.test.ts:122` ("no MOCK_ONLY entry has since gained a real channel") scans `preload.ts` and `remote-shim.ts`, so the moment T5 or T7 lands the six `voice.*` rows in `MOCK_ONLY` are stale and the plan's own "`verify.sh` after each task" fails for the whole of wave 2 — move the `MOCK_ONLY` deletion out of T10 into T5 (T10 keeps only the MAP row).
- B3 accepted — T1, T10 — T1 lists `mock-only.ts` among its files but its description never says what to change there; adding `voice.sendAudio` / `voice.micAccess` to `HAND_WRITTEN` (mock-shim.ts:104) without matching `MOCK_ONLY` rows fails "every hand-written channel is real or registered MOCK_ONLY" (test line 107) inside wave 1, and T10 then says "drop the **six** `voice.*` rows" when there would be eight — say explicitly that T1 adds two rows and T10 drops eight.
- B4 accepted — T7 — dependency error: T7 is declared "depends: T1" but its check is `ipc-channels.test.ts`, a source-scanning parity suite over `preload.ts` (T5) and `SessionService.kt` (T8), both parallel siblings in the same wave — make T7 depend on T5 and T8, or move it to wave 3.
- B5 accepted — T1, T4, T8, T9 — the same sentence-boundary split is specified four separate times with no owner (T4 in the worker, T1 in the workbench fake, T8 in Kotlin, and T9 "move the grey boundary" in the renderer, which today only renders the `committed`/`tail` the event already carries) — name one exported helper in `shared/voice-types.ts` that T1 writes and T4/T9 import, say plainly that T9 changes no boundary logic, and mark the Kotlin copy as a deliberate re-implementation.
- B6 accepted — T1, T5, T6 — T6's check names "the heartbeat-gated watchdog" but no heartbeat exists: `VoiceEvent` (voice-types.ts) has no such member, T1 is not told to add one, and T5's description never mentions pushing it — add the heartbeat/ack event to T1's type change and to T5's push list, or restate what actually arms T6's watchdog.
- B7 accepted — T4 — the check cannot be built as written: the "recorded real Parakeet ladder in review 3" is printed **elided** in that document (5 of the 11 lines, with a `…`), and no task, path or owner is given for committing it as a fixture — name the fixture file and say who regenerates the full ladder.
- B8 accepted — T2, T4 — the runtime layout constant is written twice: T2 pins the in-archive path in `voice-pin.ts` while T4 independently hardcodes `path.join(voiceRoot, 'runtime', 'package', 'sherpa-onnx.node')`, and no task says who owns or exports `voiceRoot` — have T2 export `voiceRoot` plus the resolved addon path and list `voice-pin.ts` as a read dependency of T4.
- B9 accepted — T1, T4, T5, T6 — the `voice:audio` wire format is left open: T6's worklet posts Int16 **and** its RMS, T5 forwards the message to the worker, and T4's hard cut needs "the quietest 100 ms frame in the last second" — but nothing says whether the RMS reaches the worker or is recomputed there, so two subagents will answer it two ways — fix the payload shape in T1's type change.
- B10 accepted — T5 — the silence stop has no guard: the design names `voice-silence.test.ts` (no stop before speech, stop 2 s after speech, a loud burst resets the clock), no task names that file, and T5's check list is only the terminal-event cases, leaving R3's "about two quiet seconds" unpinned — add `voice-silence.test.ts` to T5.
- B11 accepted — T9 — the download-failure card the design requires ("the existing card plus that reason plus Retry", R3-6) has no owner: `VoiceButton.tsx`'s four card branches have no Retry, T2 is main-side only, and T9's card work is limited to the `unpacking` branch and the copy — add the Retry branch to T9.
- B12 accepted — T9 — a check that does not check: T9's prose adds the "about 500 MB" line, the languages line and the `unpacking` branch, but its Rows line omits R22 and R23 and its only test is `InputBar.test.tsx`, whose listed cases are all composer behaviour — no test anywhere renders `VoiceButton` — claim R8/R22/R23 in T9 and add a `VoiceButton.test.tsx` covering the card copy and the unpacking branch.
- B13 accepted — T1, T9 — `sizeMb` is left undecided: the card renders `{readiness.sizeMb} MB` (VoiceButton.tsx), the fake emits `464`, and T9 is told to write "about 500 MB" **literally**, so the two tasks disagree about whether the field still drives copy and nobody is told to remove it (knip will flag it) — decide in T1 whether `sizeMb` stays on `VoiceReadiness` and what T2/the fake put in it. (The contract's R1 also still says "464 MB"; reopen V-10 replaced that with "about 500 MB".)
- B14 accepted — T1 — "extend the bridge with `sendAudio` and `micAccess` (desktop only)" does not say whether they are **optional** members of `VoiceBridge`; T6 gates on `typeof bridge.micAccess === 'function'`, which only typechecks if they are, and T7/T8 omit them entirely — write `sendAudio?` / `micAccess?` into T1.
- B15 accepted — T3, T5 — T3 claims R1, R6, R20, R21 but delivers only a plist key, an entitlement and two manifest strings: R1 is T2's work, R6's substance is T8's, R20's copy already ships in `VoiceButton.tsx`, and the macOS "system prompt comes first" half of R21 is `systemPreferences.askForMediaAccess('microphone')` in `voice-handlers.ts` — which T5 owns and never mentions — trim T3's rows and add the `askForMediaAccess` await to T5 explicitly.
- B16 accepted — T4 — R14 ("the ring grows with your loudness") is assigned to the worker, which never produces a `level` event; the design has the renderer's worklet emit RMS locally — move R14 to T6.
- B17 accepted — T1 — R16 ("typing while the mic is open ends dictation and keeps what you typed") is assigned to the types-and-fake task; it is `InputBar` behaviour and is already in T9's check list — move R16 to T9.
- B18 accepted — T2 — the pre-build check is not runnable as stated: it asks for "the design's cross-platform `tar -xf` check", which the design defines as Windows' System32 tar **and** a bzip2-less Linux image; this machine is Linux only — scope the check to what runs here and make "name the decompressor explicitly, with a checked failure message" the default rather than the fallback.
- B19 accepted — T3 — "a manifest guard test" names no path, no language and no runner; it could plausibly land as Kotlin under `app/src/test/kotlin/com/youcoded/app/runtime/` or as a Node test in `desktop/tests/` reading `../app/src/main/AndroidManifest.xml`, and T8 separately runs `gradlew test` — name the file and the runner.
- B20 accepted — T7 — the shim shape may defeat the contract scan: `existsInRemoteShim` looks for `^    voice: {` at indent 4 (workbench-mock-contract.test.ts:44), so a conditionally-spread namespace (`...(androidLocal ? { voice } : {})`) will not resolve there — harmless only because `preload.ts` will also carry it; say which shape T7 writes.
- B21 accepted — none — R4, R13 and R17 are claimed by no task; all three are already delivered on the UI branch (`InputBar.tsx:136-144` sets the caret at the end, the Listening strip is `InputBar.tsx:738`, the ring uses `var(--accent)`) — add a line to the plan naming them "delivered by the UI branch" so the grader is not handed a bare NONE.
- B22 accepted — T10 — the new `main/voice/` subsystem gets no `docs/MAP.md` subsystem row and no `.claude/rules/` entry; T10 adds only the on-disk-state row, so the next session finds the feature only by grep — extend T10.

## File overlap

| File | Tasks | Verdict |
|---|---|---|
| `desktop/src/renderer/dev/workbench/mock-only.ts` | T1, T10 | Safe sequence (waves 1 → 3) but **contradictory content** — see B2, B3 |
| `desktop/tests/workbench-mock-contract.test.ts` | T1 (edits), T10 (names as check) | Safe |
| `desktop/src/main/main.ts` | **no task** | Missing owner — B1 |
| `desktop/src/main/voice/voice-pin.ts` | T2 (writes), T4 (needs, unlisted) | Missing read dependency — B8 |
| `desktop/tests/ipc-channels.test.ts` | T7 (edits) | Single writer, but depends on T5's and T8's files — B4 |
| `app/src/main/AndroidManifest.xml` | T3 | Single writer; T8 correctly depends on it |
| `desktop/src/renderer/components/{InputBar,VoiceButton}.tsx` | T9 | Single writer |
| `desktop/src/main/preload.ts` | T5 | Single writer |
| `desktop/src/renderer/remote-shim.ts` | T7 | Single writer |

No two tasks write the same file in the same wave.

## Row coverage

- R1 → T3 claimed; really **T2** (B15)
- R2 → T1, T4, T9
- R3 → T5, T9 (silence half unguarded — B10)
- R4 → **NONE** (already built on the UI branch — B21)
- R5 → T2
- R6 → T8 (T3 partial)
- R7 → T7
- R8 → T9
- R9 → T2
- R10 → T2
- R11 → T6
- R12 → T5, T6
- R13 → **NONE** (already built — B21)
- R14 → T4 claimed; really **T6** (B16)
- R15 → T9
- R16 → T1 claimed; really **T9** (B17)
- R17 → **NONE** (already built — B21)
- R18 → T9
- R19 → T9
- R20 → T3, T6
- R21 → T3, T6 — the macOS prompt-first half has **NONE** (B15)
- R22 → **NONE** claimed (T9 prose only — B12)
- R23 → **NONE** claimed (T9 prose only — B12)

Nothing in the breakdown builds anything the design or a contract row did not ask for.
