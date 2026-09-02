---
date: 2026-09-01
status: active
type: investigation
topic: Sustained UI sluggishness — the transcript is rendered all at once, and every open session stays mounted
---

# Sustained UI sluggishness: hiccups, lagging animations, freezes

**Destin, 2026-08-27:** frequent freezes, stutter and sluggishness in daily use — on all four
surfaces (streaming, session switching, scrolling long conversations, opening panels);
noticeable from launch, worse over hours, worse with more open sessions; **equally present on
plain Midnight and on blur/glass themes.**

## Diagnosis

Theme-independence is the tell: compositing/`backdrop-filter` cost would track theme weight.
It does not, so this is **main-thread JavaScript / render cost, not paint.**

**Cause 1 — the whole transcript renders at once.** `ChatView` maps every timeline entry into
the DOM with no virtualization or paging, so opening or switching into a long conversation
is 98–99% renderer time (the file read is 0.1–0.3 s).
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ChatView.tsx", "contains": "return state\\.timeline\\.map\\(\\(entry, idx\\) =>"} -->

**Cause 2 — one mounted `ChatView` per open session.** Inactive panes are parked with
`content-visibility: hidden` (deliberately not `display:none`, for resize performance), so
cost scales with total open sessions — which matches "worse with more sessions" exactly.

## Measured (perf lab, trusted baseline `16ea12e`, 2026-08-27)

Open a 5,000-entry conversation **14.8 s**, 7,000 entries **22.0 s**; switch into the large
one with six sessions open **11.1 s**; switch into an *empty* session while two others stream
**1.7 s**; six sessions **7.0 GB** PSS. Calibrated against Destin's real screen the same day
(first messages immediately, then ~22 s unscrollable). Earlier numbers in the old roadmap
entry came from an empty-session fixture and are superseded.

## Plan and progress

Destin approved three cards 2026-08-27, in order: per-token streaming costs → paged history →
park hidden views.
- **Cycle 1 (per-token costs) SHIPPED** 2026-08-28 — youcoded #342 (`97600ddd`), on pinning
  tests; the rig is blind to the per-token path by construction (it streams whole turns).
- **Cycles 2 and 3** (paged history, park hidden views) are next:
  `docs/active/handoffs/2026-08-27-perf-cycle-1-handoff.md`,
  `docs/active/handoffs/2026-08-28-perf-cycle-3-handoff.md`. No branch open on 2026-09-01.

The rig still **understates** real use: fixtures are lighter than real transcripts (code
blocks, diffs, tool cards) and no scenario runs longer than ~45 s, so accumulation over hours
is unmeasured. Defect taxonomy: `docs/active/investigations/2026-08-27-perf-defect-classes.md`.

## History
Filed 2026-08-27 (Destin, during the perf-lab build). Re-verified against code 2026-09-01.
