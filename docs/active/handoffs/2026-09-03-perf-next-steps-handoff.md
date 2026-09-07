---
status: active
created: 2026-09-03
supersedes: docs/archive/handoffs/2026-08-28-perf-cycle-3-handoff.md
baseline: perf-reports/2026-09-03-2023-f39c742-ab-folding-rootfix.json
---

# Perf — what's next after cycle 3

Cycle 3 shipped (youcoded PR #398, merge `b246a57a`). This is everything that did
NOT ship, why it is worth doing, and what it will cost. Nothing here is started.

## 0. Read this before planning anything

**Every item below is already a roadmap entry.** This document exists to rank them
and to carry the reasoning that does not fit in a roadmap line — it is not a second
source of truth. If the two disagree, the roadmap wins.

**Two of the three rig items below exist because measurement failed us this cycle,
not because someone thought they'd be nice.** Cycle 3 shipped a 59% win whose most
user-visible defect — messages popping in as you scrolled — survived three clean
measurement runs and was found by Destin scrolling slowly for thirty seconds. Read
§3 before trusting any perf number about smoothness.

**And check the roadmap's `performance` tag before starting.** On 2026-09-03 this
session independently rediscovered a rig defect that had been filed with an
investigation doc two days earlier. `rg '`performance`' docs/roadmap/*.md`.

## 1. The state of the rig

| phase | measures | trustworthy? |
|---|---|---|
| `startup` | cold boot, idle PSS/CPU | yes |
| `history` | conversation open time, per size | yes |
| `workload` | six sessions, 40 switches, streaming | yes |
| `scrollback` | the memory CEILING once conversations are read back | yes — added cycle 3 |
| `stall` | app-wide freeze during replay | yes, but both its metrics now read 0 |
| `artifacts` | files pane, editor, HTML preview | yes |
| `shots` | 5 parity screenshots | 4 of 5. `native-chat` is NOT reproducible |

**Three instruments were added on 2026-09-03** (workspace branch `perf/rig-instruments`,
**not yet merged**) — §3 below, all three built, tested and run against the real app:

| instrument | reads | first real answer |
|---|---|---|
| `report.machine.renderer` | which renderer Chromium actually used | **llvmpipe, software** — the "blind to GPU" claim is now MEASURED and correct |
| `workload.median.nativeLayoutCost` | layouts per streamed token | `stream-too-slow` — the local model emits 35 deltas per 3 s, too few to conclude |
| `scrollback.median.lateContent` | blank entries in view WHILE scrolling | see §3.3 — its first three readings were all artefacts of the rig |

Current baseline for any A/B:
`perf-reports/2026-09-03-2023-f39c742-ab-folding-rootfix.json` (3 repeats, every
phase clean). Re-run the baseline whenever you change the instrument — perf-lab
README → "Two rules for measuring a LAZY change".

## 2. Ready to build — confirmed, investigated, no new rig capability needed

These three are the recommended next autonomous run. All are bounded accumulation
or per-event waste, all have an investigation written, none needs the rig to learn
a new trick — which is what makes them finishable unattended.

1. **The buddy window forces one layout reflow per streamed token.** The exact twin
   of cycle 1's main-chat defect, left in on purpose because nothing measures buddy
   windows. Fix already written once, for the other surface.
   → `docs/roadmap/other-features.md` · investigation `2026-09-01-buddy-bubblefeed-reflow-per-token.md`
2. **Artifact version history grows without bound.** `<project>/.youcoded/artifacts.json`
   was 4.4 MB on 2026-08-15 and 6.4 MB / 21,311 versions on 2026-08-27 — it is still
   growing. Every save AND every listing pays. Same shape as the problem cycle 3
   fixed (unbounded accumulation nobody watches), except on disk.
   → `docs/roadmap/files.md` · investigation `2026-09-01-sidecar-versions-unbounded.md`
3. **The remote server copies a 4 MB buffer per PTY chunk with zero clients connected.**
   It is always on, so the cost scales with terminal output whether or not anyone is
   attached remotely.
   → `docs/roadmap/remote-access.md` · investigation `2026-09-01-remote-pty-replay-buffer-copy-per-chunk.md`

## 3. Rig instruments — BUILT 2026-09-03, on branch `perf/rig-instruments`

Small, additive, and each closes a hole that actually cost us. Do these before any
cycle that depends on the answers.

1. **Record which RENDERER the rig got.** "The rig is blind to GPU" appears in five
   scenarios' `blindTo` lists and is used to dismiss whole classes of finding — and
   has never been verified. The app already resolves it (`main.ts`,
   `app.getGPUInfo('complete')` → `auxAttributes.glRenderer`) and the rig discards
   it. `/dev/dri/renderD128` is world-readable on this machine, so runs may already
   have hardware acceleration. **Do this first: it may delete the blind spot rather
   than confirm it**, and it is a few lines.
2. **Count layouts per streamed token, not milliseconds.** Cycle 1's defect was one
   forced layout per token. Measuring TIME requires a native stream and is hostage to
   local-model speed; measuring WORK is not — the CDP `Performance` domain the rig
   already calls exposes layout and style-recalc counters, so the defect class becomes
   an exact integer. Re-gates cycle 1 (currently ungateable) and gives item 2.1 above
   its detector. Confirm the counter names on first use.
3. **Count content that arrives LATE.** While scrolling, entries inside the viewport
   still rendering as a spacer must always be zero. This is the class that hid cycle
   3's pop-in. Generalises past folding to any lazy render.

All three: `docs/roadmap/dev-workspace.md` — close these items when the branch merges.

**What they actually said, first time out.**

1. **The renderer.** llvmpipe, `gpu_compositing=disabled_software`. So the blind spot is
   real and the claim was right — it is now a measurement in every report rather than an
   assumption. Chromium *sees* the NVIDIA device and declines it: Xvfb offers no
   hardware GL, and a world-readable render node is not sufficient on its own. Also
   corrected: the claim appears in **three** scenarios' `blindTo` lists, not five.
2. **Layouts per token.** `stream-too-slow`, not a pass. The native leg produced 35
   deltas across 181 frames; at that rate one layout per commit is both the defect's
   signature and what a healthy renderer does. A conclusive reading needs a faster
   local model or a longer window. Cycle 1 is therefore **still not re-gated** — the
   instrument exists, the stream is too thin to use it.
3. **Late content.** Its first three readings were all the rig measuring itself —
   scrolling 500× faster than a human, sampling one frame after a seek, and counting a
   frame where the app pinned itself to the bottom. Each is now excluded and each has a
   pinning test. `scripts/perf-lab/README.md` has the table. **The lesson, which
   generalises past this instrument: a measurement instrument's first finding is
   usually about the instrument.**

## 4. Bigger, and genuinely harder
- **Terminal / PTY has no perf coverage at all** — the largest wholly unmeasured
  surface, and where output volume is highest. Needs a new scenario built from
  scratch (drive a high-output command, measure render + main-process cost).
- **Real GPU fidelity** needs a real display with a compositor. It would put windows
  on Destin's screen and compete with his work. Do not attempt before §3.1 answers
  whether the rig is already accelerated.
- **Android on-device paging** and its Kotlin tail reader — deferred by Destin's
  decision 1a in cycle 2; the phone still pages over the remote bridge.
- **Cycle 2's §4 smaller readers**: `listPastSessions` concurrency cap + memoised
  old-encoding dir resolution (25 MB re-read per list open), tail reads for
  `model:read-last`/`loadHistory`, catalog single-flight, `artifact-tracker.ts`
  session cleanup.

## 5. Left behind by cycle 3, on purpose
- **Find-in-chat only searches loaded messages.** TRUE ON MASTER since cycle 2's
  paging: `ContentFindBar` walks the DOM, so anything not loaded is unfindable and
  the counter reads `0/0` for text the user can see. Fails silently, which is why
  nobody reported it. → `docs/roadmap/chat-data.md`
- **A manually collapsed tool card returns expanded** after folding and unfolding,
  since that state is per-card `useState`. Accepted on review: lifting it into the
  reducer would add per-card state to the very object cycle 3 shrank.
- **Parking hidden views** (the original cycle-3 card (a)) — folding removed most of
  its prize, since a background session's content now folds. Re-measure before
  planning it; do not inherit the old sizing.

## 6. Two open questions only Destin can close
- **Does real use feel better over hours?** The sustained-sluggishness roadmap item
  is deliberately still open. Cycles 1–3 addressed the render-cost half of its
  investigation; the symptom is lived, not measured.
- **`~/.claude/settings.json` had 12 dangling hook paths** on 2026-09-03, which hangs
  every session on "Initializing session" in chat view. Launching the INSTALLED app
  repairs them (`main.ts` runs `install-hooks.js` when no `YOUCODED_PROFILE` is set;
  dev profiles deliberately skip it). If sessions hang again, check this first —
  it cost this session two dev-testing rounds and produced a wrong hypothesis.

## 7. Traps, carried forward because they keep being true
- **"Removing a broadcast is still removing a broadcast."** Cycle 2 broke four
  features that depended on whole-file replay as a side effect; none of ~7,000 tests
  noticed. `docs/PITFALLS.md`.
- **A mechanism that cannot prove it ran is unproven, not ineffective.** Three
  different cycle-3 bugs all presented as the identical number (~730 of 12,100). Only
  a per-pane count separated them.
- **An observer ref must release its element.** Now enforced by
  `scripts/ast-grep/rules/observer-ref-returns-cleanup.yml`.
- **Do not delete from the chat reducer.** The rejected eviction design and its six
  blocking defects are recorded in
  `docs/archive/specs/2026-08-28-cycle-3-bounding-the-conversation-window.md` §2(b).
  Re-read it before anyone proposes eviction again.
