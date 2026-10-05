---
date: 2026-09-24
status: active
type: handoff
supersedes: docs/archive/handoffs/2026-09-10-android-rebuild-START-HERE.md
topic: START HERE for the one-core work — the remote-access refactor (R0–R6, includes simplification Phase 4) and the Android rebuild (A0–A6) as one ordered list, what can start today, and where each piece's detail lives
---

# One core, every screen — START HERE

**What this is.** The computer's window, a phone browser and the Android app each have their
own hand-written copy of every feature. This work replaces the copies with one assistant core
and one feature list that every screen reaches. It runs as two plans that share phase ids:

| Plan | Phases | Holds |
|---|---|---|
| `docs/archive/plans/2026-09-24-remote-access-refactor-plan.md` | **R0–R6** | the core, the feature list, both doors, the computer-owned session record. **R1–R4 are simplification Phase 4** |
| `docs/active/plans/2026-09-24-android-rebuild-plan.md` | **A0–A6** | Play packaging, the core on the phone, deleting the Kotlin copies, phone-native product work, the Play listing |

Other docs keep their jobs and point here:
- `docs/active/plans/2026-09-16-simplification-phases.md` keeps the execution protocol that
  every run follows, and Phase 5.
- `docs/active/investigations/2026-09-10-android-parity-audit.md` keeps the Android findings,
  the bug appendix, and Destin's 2026-09-10 decisions (§8).
- `docs/active/investigations/2026-09-16-simplification-audit.md` keeps the evidence for D1,
  D2, D3, M5, D9 and D10.

## The order

Rows with the same **When** can run side by side (R0–R6 are built and land together; see Status); **Needs first** is the hard dependency.

| When | Phase | What | Needs first | Release |
|---|---|---|---|---|
| **Now** | A0 | Phone experiments: Node + harness from inside the app; `nodejs-mobile` compared; app size | — | — |
| **Now** | A1 | Play packaging: every program inside the app, no first-run download, consent screen, `specialUse` property | — | Play |
| **Now** | — | Skill-settings wipe fix on Android (destroys data; not worth waiting for A3) | — | — |
| Done | R0 | Edit-lock check in `close-out.sh` (lock retired 2026-10-04); the owed real-phone pass moved to after the merge (roadmap, remote-access). Branches editing the door files did NOT block — they are rewritten onto the new layout after the merge | — | — |
| Now, any time | A5 (design only) | Phone default-UI mockup round and other A5 design decks | — | — |
| After A1 | A6 | Google Play listing (Android decision 6: list right after A1, or wait for A4) | A1 | v1.3.1 roadmap item |
| Done | R1 | Hoist the runtime out of the desktop door; `Platform` interface; runtime loads with no Electron | R0 | v1.3.1 |
| Done | R2 | One contract; `window.claude` typed from it; object arguments | R1 | v1.3.1 |
| Done | R3 | Move feature families into the table, lowest risk first; native family group last | R2 | v1.3.1 |
| R4 done; A2 next | R4 + A2 | R4: capabilities + protocol version, one platform module, one translator (D3), typed events (M5). A2: the built-in assistant on the phone | R3 (A2 needs R3's last group and A1) | R4's D3/M5: v1.3.1 |
| R5 done; Phase 5, A3 next | R5 + Phase 5 + A3 | R5: computer keeps the record, per-session delivery, resume. Simplification Phase 5 (also needs the native-session-host test split). A3: delete the Kotlin copies family by family | R4 (R5, Phase 5); A2 (A3) | Phase 5: v1.3.1 |
| R6 done; A4 next | R6 · A4 | R6: native sessions from the phone, instant buttons, more features over remote. A4: Node owns the phone's socket | R5 (R6); A3 + R5 (A4) | — |
| 7 | A5 (build) | Phone-native features, each after its design round | A4 | — |

**The edit lock (retired 2026-10-04).** It froze the two door files during R1–R2 and then one
family at a time during R3. R0–R6 are complete and land together, so `docs/active/locks/phase4.json`
now has an empty `paths` list (an empty list means no lock; the file is kept as the schema example,
and the check in `scripts/close-out.sh` stays). Branches that still edit the old door files are
rewritten onto the new layout (`main/ipc/<family>.ts` and `shared/backend-contract.ts`) after the merge.

**Status (2026-10-04).** **R0–R6 are complete and ready to merge together as `feat/one-core` in
both repos** (app `itsdestin/youcoded`, workspace `youcoded-dev`), stacked from the `session/simplify-*`
branches through `simplify-sync-fix6`, with master merged in. **Nothing is merged until Destin says
so.** Each run's log is in the plan's R3/R4/R5/R6 sections.
- **Owed after the merge, not before:** Destin's real-phone pass; a real Android device check;
  re-recording the Claude Code capture corpus on the current version; the Phase 5 tidy-up the last
  run listed (all four are filed in `docs/roadmap/`). Parked by Destin: the shared blue "seen" dot;
  `folders:add` stays as it is.
- **Next:** the plan is archived (merged 2026-10-05, youcoded#604 and youcoded-dev#237); then the Android rebuild's A-phases (A0 and A1 can
  start any time; A2 is unblocked once this merge lands, since R3's last group is in it).
- **Release:** Phase 4 (R1–R4) is part of this merge. Phase 5 stays a v1.3.1 blocker and still
  waits on the native-session-host test split.

## Open decisions

Each plan ends with a decisions table. None blocks the "Now" rows. The ones that change the
order above:
- Remote decision 3: whether R5 is wanted as its own phase after Phase 4.
- Android decision 2: which Node goes on the phone. A0 settles it.
- Android decision 6: list on Play right after A1, or wait for the rebuilt app (A4).

## Where the old pieces went

| Was | Now |
|---|---|
| Android handoff 2026-09-10 "step 4" (`harness-host.ts` copying the remote dispatcher) | A2. Nothing is copied: the phone runs the shared door. Archived: `docs/archive/handoffs/2026-09-10-android-rebuild-START-HERE.md` |
| Audit §7a–7e step list | A2 (7a, 7b, 7c), A5 (7e), A6 (Play) |
| Simplification Phase 4 run list (D2, D1, D3, M5) | R1, R2 + R3, R4 |
| Remote roadmap "protocol" items (resume, per-session delivery, versioning, one-window state, instant buttons) | R4, R5, R6. Each roadmap entry names its phase |
