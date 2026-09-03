---
status: superseded
date: 2026-07-20
owner: Destin (decisions) / Claude (execution)
subject: Session-switch motion — draft PR youcoded#192, needs refinement before merge
---

# Handoff — session switch animation

**State: draft PR [youcoded#192](https://github.com/itsdestin/youcoded/pull/192), branch
`feat/session-switch-animation`, NOT merged and not ready to merge.** Opened deliberately as a
draft to capture the work and the reasoning while fresh. A future session finishes it.

Design was approved visually before any code — mockup at
`docs/active/prototypes/2026-07-20-session-switch-animation.html` (see below).

## What Destin asked for

Clicking between conversation tabs "feels jumpy/stuttery." Clarified in session to two specific
complaints, both pure animation gaps rather than perf problems:

1. Chat content pops in instantly on switch.
2. The session-switcher tab names expand instantly instead of rolling out.

Three constraints he set explicitly, all load-bearing:

- **No crossfade or slide for bubbles** — they should disappear and reappear in a *bouncy* way.
- **The strip should read like the existing hover reveal** over collapsed session dots.
- **Only actually-visible bubbles animate.** This is why the implementation keys off `.in-view`.

## The finding worth keeping

The pill had **two independent reasons** it could not animate. "Add a transition" was the wrong
diagnosis — one already existed and was being actively suppressed:

1. `maxWidth: undefined` when the pill is active (`SessionStrip.tsx:785-787`) — no numeric pair to
   interpolate, so width snapped to intrinsic.
2. `transition: pack.expanded.has(s.id) ? 'none' : …` (`:789`), and `packSessions` puts the active
   pill in `expanded` unconditionally (`pack-sessions.ts:53`). **The clicked pill was precisely the
   one with animation switched off.**

Either alone would have caused the snap. Fixing only one would have looked like the fix didn't work.

Second finding: **the "only visible bubbles" mechanism already existed.** `ChatView.tsx:273-291`
runs an IntersectionObserver toggling `in-view` on every `.timeline-entry`, built for the
backdrop-filter glass optimization. Reusing it meant no new observer.

## How it works

- **Pill** — `grid-template-columns: 0fr → 1fr` interpolates to *intrinsic* width, which
  `max-width` cannot do without a hard cap; the active pill must stay uncapped so it flex-shrinks
  and ellipsizes only when the strip is narrow. Non-active hover reveals keep their 120px cap. The
  `'none'` survives for repack churn and is overridden only inside a short window armed by an
  active-id change.
- **Bubbles** — `bubble-switch-out` / `bubble-switch-in` in `globals.css`, on the overshoot curve
  the pills already use, 30ms stagger capped at 8, applied only to `.timeline-entry.in-view`.
- **Sequencing** — panes stay mounted and stacked, so the outgoing pane is held 120ms to finish its
  exit while incoming bubbles wait out an equal `animation-delay` with `both` fill. That is what
  keeps it sequential rather than the crossfade Destin rejected.
- **Gating** — `prefers-reduced-motion` and the app's `reducedEffects`. The strip had no
  reduced-motion gate at all before this.

## Deliberately out of scope

- **Android.** `forceSingle` filters to one pill keyed by session id, so it remounts every switch —
  no before-state to transition from, and no expansion to show since its one pill is always named.
  Not faked, not broken.
- **Buddy `SessionPill`** — a plain dropdown with always-visible labels. The fix doesn't apply.

## Outstanding before merge

1. **The 120ms exit needs a lived-with verdict.** It buys a real "disappear" but delays the
   incoming conversation by 120ms. Eyeballed only. Deleting the exit half is a one-line change.
2. **It also fires on Ctrl+`** (chat↔terminal). A ChatView's `sessionId` never changes, so
   `visible` is the only available edge and the view toggle is indistinguishable from a session
   switch at this layer. Suppressing it needs a different signal threaded down from `App`.
3. **No test coverage.** Nothing in the suite renders `SessionStrip` or `ChatView` — only
   `packSessions`' 9 pure cases are pinned. Decide whether the `.in-view`-only rule (the
   load-bearing perf property) earns a pinning test; per the workspace knowledge rules it probably
   does, since it is exactly the kind of invariant a later refactor would silently break.
4. **Drag-reorder interaction unverified.** The pill drag path sets its own `transition` and
   `suppressClick`; the `activeSwap` window was never tested mid-drag.
5. **Narrow viewport / remote access unverified** — the strip packs differently there.

## Mockup

`docs/active/prototypes/2026-07-20-session-switch-animation.html` — real token values, real
`className` strings, five themes including Halftone Dimension. **Known divergence from the app:**
the mockup is one panel swapping content, whereas the app stacks two mounted panes. The sequential
feel Destin approved therefore needed the 120ms hold described above to reproduce; a naive port of
the mockup's timing produces the crossfade he rejected.

## Unrelated bug found en route

Halftone Dimension's `custom_css` targets `.chat-bubble.user` / `.chat-bubble.assistant`, which
match **nothing** in the live renderer (it uses `.user-bubble` / `.assistant-bubble`). That pack's
bubble glow and assistant border-left are dead in the shipping app. Logged to ROADMAP under Bugs.

---

## Status re-check — 2026-08-26 (no code touched)

Dormant 37 days. Everything above is still the plan; three claims in it have gone stale
and one new blocker appeared. Verified against `origin/master` at `73e2defe`.

**Branch / PR.** `feat/session-switch-animation` @ `5a9b37fa`, pushed to origin, worktree
`worktrees/session-switch-animation` (68 MB, clean). PR
[youcoded#192](https://github.com/itsdestin/youcoded/pull/192) is still **OPEN / DRAFT**,
zero comments, `updatedAt` unchanged since it was opened — nobody has touched it.
`git rev-list --count origin/master..feat/session-switch-animation` = **1**;
`…feat/session-switch-animation..origin/master` = **1076**.

**Now conflicts.** `git merge-tree --write-tree origin/master feat/session-switch-animation`
exits 1: `CONFLICT (content) desktop/src/renderer/components/ChatView.tsx`. `SessionStrip.tsx`
and `globals.css` still auto-merge. ChatView grew 887 → 1070 lines on master since the
branch point.

**NEW BLOCKER — `content-visibility` supersedes the mechanism.** `81c9562d` (2026-08-06,
"perf(renderer): take inactive sessions out of layout during resize") added to the ChatView
root, at `ChatView.tsx:707` on master:

    contentVisibility: sessionActive ? 'visible' : 'hidden',

with `sessionActive={s.id === sessionId}` (`App.tsx:2822`). A non-selected session's pane
subtree is now skipped entirely, so its `.timeline-entry` elements cannot be intersecting
and the IntersectionObserver strips `in-view` from them. Both of this branch's animation
selectors are `.session-leaving .timeline-entry.in-view` /
`.session-entering .timeline-entry.in-view`, and `ChatView`'s `useLayoutEffect` assigns the
`--switch-i` stagger by `root.querySelectorAll('.timeline-entry.in-view')`. On the current
master that query is expected to return **zero** elements at the moment of a switch, and the
outgoing pane's `paneShown` hold cannot paint a subtree master has taken out of rendering.
**Not yet measured in a running app** — but it must be resolved before the merge conflict is
worth touching, because it may change the design rather than the code.

**"No test coverage" is now FALSE for ChatView.** Three master test files import and render
it — `desktop/tests/chat-pane-layout-containment.test.tsx` (added by the same `81c9562d`),
`chatview-empty-response-gate.test.tsx` (2026-08-21), `compacting-status-singleness.test.tsx`
(2026-08-16). Still true for `SessionStrip` (no test renders it;
`desktop/tests/pack-sessions.test.ts` remains 9 pure cases). Master's ChatView also takes
three props the branch's copy does not (`sessionActive`, `onCancelQueued`, `onEditQueued`).

**Line citations above are stale; the substance survives.** On master `maxWidth` is
`SessionStrip.tsx:827-829` (was 785-787) and the `transition: … 'none'` is `:831` (was 789) —
both still exactly as described, and `pack-sessions.ts:53` still reads "the active pill is
ALWAYS expanded". The file moved to `desktop/src/renderer/components/header/pack-sessions.ts`.
`row-fade-in` is `globals.css:1550`, not 1168-1171. The `in-view` IntersectionObserver is
alive at `ChatView.tsx:287-294`. `reducedEffects` still ships (`theme-context.tsx:81`).

**Design approval confirmed**, not assumed: conversation `4ebc0e97` (2026-07-20) — Destin on
the mockup, *"okay that's much better. clear to implement"*, then after `run-dev.sh`, *"good.
create a pr, explicitly note it will need additional work/refinement in a future session
before merge."* The draft state is what he asked for, not a stall.

Outstanding items 1–5 above are all still open and unchanged. Item 3 should now be read as
"SessionStrip has no test coverage; ChatView does".
