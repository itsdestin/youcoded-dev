---
status: draft
created: 2026-08-31
tags: [ui, motion, session-strip, chat-view, desktop]
supersedes: youcoded PR #192 (feat/session-switch-animation) — closed unmerged, rebuilt from scratch
verified_against: youcoded@2af35eff
---

# Session strip and session-switch motion

Four motion surfaces, one shared vocabulary. Every line reference below was read off
`origin/master` at `2af35eff` on 2026-08-31.

## 1. What this replaces

Draft PR [youcoded#192](https://github.com/itsdestin/youcoded/pull/192) animated two of
these four surfaces in July. It is 1,509 commits behind, conflicts in `ChatView.tsx`, and
its bubble mechanism was disabled by a performance fix that landed on 2026-08-06 (§4.1).
**Close it; do not rebase it.** Its two diagnoses of the pill (§5.1) are still correct and
are carried forward here; nothing else survives.

The July handoff (`docs/active/handoffs/2026-07-20-session-switch-animation-handoff.md`)
remains useful as history and should be archived when this ships.

## 2. Success criterion

**Drag must feel like Chrome's tab dragging.** Destin, 2026-08-31: *"this should work
exactly like chrome. mostly locked to the switcher strip, with our existing tear-down to
split into a new window behavior."* That is the standard the drag work is judged against —
not "smoother".

The other three surfaces are judged against the shared vocabulary in §3: they should read
as one app making one decision, not four.

## 3. The motion vocabulary

No motion tokens exist today. `globals.css` has zero `--ease*` / `--duration*` variables,
and the renderer contains **six distinct cubic-beziers**, four of which are the same
overshoot with drifted numbers:

| curve | uses |
|---|---|
| `cubic-bezier(0.34, 1.56, 0.64, 1)` | 8 |
| `cubic-bezier(0.16, 1, 0.3, 1)` | 3 |
| `cubic-bezier(0.34, 1.5, 0.5, 1)` | 2 |
| `cubic-bezier(0.34, 1.62, 0.64, 1)` | 1 |
| `cubic-bezier(0.28, 0.84, 0.42, 1)` | 1 |

The design guide states a rule — 150ms hover/press, 200ms drawers and sheets, everything
behind `prefers-reduced-motion` and the app's Reduce Visual Effects toggle
(`docs/active/design/2026-08-25-ui-design-guide.md` §2.4) — and nothing enforces it.

**Define three curves and three durations as CSS custom properties in `globals.css`, and
use them for this work only.** The canonical bounce is the existing
`cubic-bezier(0.34, 1.56, 0.64, 1)`, which already has 8 uses, so the token is a rename
rather than a new value.

Existing call sites are **not** converted. Destin, 2026-08-31: a sweep means visual changes
in surfaces unrelated to this work, which is the thing that costs trust. The six stray
curves are a separate cleanup with its own before/after deck.

An ast-grep rule (`scripts/ast-grep/`) fails the build on a raw `cubic-bezier(` in any file
this work touches, so the drift cannot restart here.

Gating is unchanged and applies to all four surfaces: `prefers-reduced-motion` **and**
`reducedEffects` from `useTheme()`.

## 4. Chat bubbles on session switch

Today: no animation. The transcript is replaced instantly.

### 4.1 Why the July mechanism is unusable

`81c9562d` (2026-08-06) added to the ChatView root, now `ChatView.tsx:836`:

    contentVisibility: sessionActive ? 'visible' : 'hidden',

A non-selected pane's subtree is skipped entirely. Two consequences:

1. The `IntersectionObserver` at `ChatView.tsx:412` strips `in-view` from every entry in
   that pane, because nothing in it can be intersecting. The outgoing pane therefore has
   no `.in-view` elements at the moment of a switch — and could not be painted anyway.
2. Every entry ships with a **static** `in-view` in its className
   (`ChatView.tsx:1026`), which the observer removes asynchronously. So the *incoming*
   pane's off-screen entries carry a stale marker for a frame or two after it becomes
   visible.

Both of PR #192's selectors were `.timeline-entry.in-view`. On current master the exit half
animates nothing, and the enter half animates the wrong set and then corrects itself.

**Do not reintroduce a dependency on `in-view` for this.** It is a paint optimisation for
wallpaper glass (`[data-wallpaper] .in-view .bg-inset`), it is observer-driven and
therefore async, and it is now coupled to `content-visibility`.

### 4.2 What replaces it

At the instant of a switch, in a `useLayoutEffect` on the incoming pane, **measure which
entries are on screen** and animate only those.

Entries are in document order inside one scroll container, so `offsetTop` increases
monotonically. **Binary-search it** for the first and last entry inside the viewport. That
is ~14 property reads after one forced layout, bounded regardless of transcript length —
which matters, because a scrolled-back conversation can hold 12,100 entries and 1.44M DOM
nodes (`docs/archive/handoffs/2026-08-28-perf-cycle-3-handoff.md` §2).

This keeps Destin's July constraint — *only actually-visible bubbles animate* — and makes
it stronger: it is measured at the moment it is used, rather than inherited from an
observer that may not have run yet.

### 4.3 The animation

**The outgoing conversation does not animate.** The app has already stopped drawing it, and
Chrome does not animate the page you are leaving either. This deletes the 120ms hold that
was PR #192's largest open question: the incoming conversation appears immediately.

Incoming bubbles animate in on the vocabulary's bounce with a small stagger, capped so a
full screen of bubbles does not turn into a long cascade. **Exact curve, duration, stagger
and cap are a clip decision, not a spec decision** — §8.

### 4.4 Ctrl+` does not animate

A ChatView's `sessionId` never changes, so `visible` is the only edge available at that
layer and the chat↔terminal toggle is indistinguishable from a session switch there. Key
the animation on `sessionActive` (already a prop, `ChatView.tsx:45`, set by
`App.tsx:2986`), which is false for every non-selected pane and does not change when the
terminal is toggled inside the active one.

The toggle is frequent; a session switch is deliberate. Only the latter earns motion.

## 5. The active pill's name expanding

Today: snaps open. Two independent causes, both still present verbatim.

### 5.1 The two causes

1. `SessionStrip.tsx:892` — `maxWidth` is `undefined` when the pill is active, so there is
   no numeric pair for the browser to interpolate and the width snaps to intrinsic.
2. `SessionStrip.tsx:896` — `transition: pack.expanded.has(s.id) ? 'none' : …`, and
   `packSessions` guarantees the active pill is always expanded
   (`header/pack-sessions.ts:53` — *"Rule: the active pill is ALWAYS expanded (never
   collapsed to a dot)"*). **The transition is switched off for exactly the pill you just
   clicked.**

Either alone causes the snap. Fixing one looks like the fix failed.

### 5.2 The fix

Animate `grid-template-columns: 0fr → 1fr` on the label wrapper. This interpolates to the
label's **intrinsic** width, which `max-width` cannot do without imposing a hard cap — and
the active pill must stay uncapped so it flex-shrinks and ellipsises only when the strip
itself is narrow.

The `'none'` stays for repack churn (it exists so pills do not slide around every time the
packer runs) and is overridden only inside a short window armed by a change of active id.

Curve and duration come from §3.

## 6. Hover

Today this is the closest to right: the pill scales to `1.02` over 150ms on the canonical
bounce, with border, background and glow on the same curve (`SessionStrip.tsx:872-880`).
Three things undercut it.

1. **The name reveals to a fixed 120px** (`:892`), not to its own width. Every reveal runs
   the same distance regardless of the name's length: a short name finishes early and then
   sits still, a long one is cut off. Fix with the same `0fr → 1fr` mechanism as §5.2,
   keeping a `max-width` cap for the non-active hover reveal only.
2. **The same `'none'` kill-switch at `:896`** silences the reveal on any pack-expanded
   pill. Overridden here too, by the same armed window as §5.2 — the `'none'` itself stays,
   because it is what stops pills sliding around on every repack.
3. **Two curves in one gesture** — the pill uses the bounce, the name uses plain `ease`
   (`:896`). Both move onto the vocabulary.

## 7. Drag — Chrome's model

### 7.1 What we do today

- The dragged pill stays in place at `opacity-30 scale-95` (`SessionStrip.tsx:862`).
- A **separate floating copy** follows the cursor freely in **both axes**
  (`:1268`, positioned from `dragPos.x` / `dragPos.y`).
- A thin accent **insertion line** marks the target gap (`:1253`), sliding between slots on
  a 120ms bounce.
- **The other pills never move.** The line points at a gap that does not exist, and the row
  jumps into its new order in one frame on release.
- Live tear-off past a downward threshold already works and is already Chrome-shaped.

### 7.2 What Chrome does

The tab *itself* moves. It lifts, follows the cursor horizontally, stays locked to the
strip, and the other tabs slide aside in real time as it crosses their centres. There is no
ghost and no insertion line — the gap **is** the indicator. On release the tab settles into
the slot it is already occupying. Downward motion past a threshold tears it out.

### 7.3 The change

Replace the ghost model with a moving-pill model.

- **The pill moves.** Translate the real pill along the strip with the cursor. It lifts
  (elevation, on the vocabulary) and is clamped to the strip's horizontal bounds.
- **Delete the floating copy** (`:1268-1283`), the **insertion indicator** (`:1253-1266`)
  and the `ghostTarget` state that fed it. `dragPos` survives — it now positions the real
  pill's transform instead of a free-floating copy, and only its X is consumed (§7.3, last
  bullet).
- **Neighbours slide aside** as the dragged pill crosses their centres. `overIdx` and the
  per-pill rects that fed the insertion line (`:610-643`) already compute what is needed;
  they now drive transforms on the neighbours instead of a line position.
- **Release settles**, it does not jump — the pill is already where it is going.
- **Vertical is tear-off only.** The pill rides the strip line; it does not follow the
  cursor's Y. Downward motion past the existing threshold fires the existing live tear-off,
  **unchanged**.

### 7.4 Two things freeze for the duration of a drag

Chrome's tabs are uniform width and compress evenly. Ours are not, and this is where an
"exactly like Chrome" drag can go wrong.

1. **Pill widths freeze.** Ours are dots when collapsed, wider on hover, wider still when
   active with no cap. Without a freeze, dragging *over* a pill triggers its hover reveal
   and the row grows under the cursor.
2. **Packing freezes.** The strip collapses pills into dots when it runs out of room
   (`packSessions`). Opening a slot makes the row wider, which can trip a repack — pills
   turning into dots mid-drag would be worse than today's jump. Reserve the space rather
   than add it, and hold the pack result taken at pointer-down until release.

Whatever the row looked like when you pressed down is what it looks like until you let go.

## 8. How this gets reviewed

Every visual decision reaches Destin as a **review deck clip step** — a recording per
panel, played side by side with a shared replay (`scripts/ui-review/review-cards.py`,
recorded by `record-pair.sh`). Never a still, never a prose description.

Two-panel comparisons work today: run labels are overridable via the spec's `labels` field
(`deck/build.py:106`), so the two panels can read "Springy" and "Flat" rather than
"Before" and "After".

**Three-or-more options need one tooling change first.** A choice step's variants must each
name a still `crop` (`deck/spec.py` `_validate_choice`), the page only emits a `<video>`
when the whole step is a clip (`deck/page.js:24`), and a clip step explicitly refuses
`variants`. Only choice-step frames are pickable. The change is to **let a choice step's
variants carry a `clip` instead of a `crop`** — which also sidesteps the two-run cap
(`deck/spec.py:53-54`), because a choice step uses one run and variants are a separate axis.

Sequencing agreed with Destin 2026-08-31: **start the animation work now** on two-panel
clip steps, and **build variant clips when the first genuine three-way arrives** — most
likely on drag, where the options are not a spectrum.

Per the review-deck rules: several designs of one thing are ONE choice step, never a yes/no
each.

## 9. Out of scope

- **Android.** `forceSingle` filters the strip to one pill keyed by session id, so it
  remounts on every switch — there is no before-state to transition from and no expansion
  to show. Not faked.
- **The buddy window's `SessionPill`** — a plain dropdown with always-visible labels.
- **Ctrl+` (chat↔terminal)** — §4.4.
- **The outgoing conversation's bubbles** — §4.3.
- **Converting existing call sites to the new tokens** — §3.
- **Ghost lag/tilt.** Chrome's tab tracks the cursor 1:1; the carried feel comes from
  elevation and from the neighbours moving, not from lag. Nothing to add.

## 10. Risks

| Risk | Why it matters | How it is caught |
|---|---|---|
| The width/pack freeze is wrong | Pills change size mid-drag — worse than today's jump | Its own clip, at a window width narrow enough to force packing |
| The on-screen measurement is slow | It runs on the critical path of a session switch, which the perf programme measured at 0.5ms median | Measure it against `perf-reports/2026-08-28-0803-8935c28-cycle3-baseline.json`, do not assume |
| Narrow viewport and remote access pack differently | The strip is a different shape there and neither is covered by the desktop clips | Its own clip per surface |
| Drag interacts with live tear-off | Tear-off is shipping behaviour and must not regress | Exercised in the drag clip, past the threshold |
| `SessionStrip` has no test coverage | Nothing in the suite renders it; `pack-sessions.test.ts` pins 9 pure cases only | Add a pinning test for the freeze rule and for the armed-window override |

## 11. Guards

Per the workspace knowledge ladder, each of these is a test or an ast-grep rule, not prose:

1. **Only on-screen entries animate on switch** — the load-bearing perf property. A
   refactor would silently break it and nothing would fail.
2. **Widths and packing are frozen while `dragIdx !== null`.**
3. **No raw `cubic-bezier(` in the files this work touches** — ast-grep.
4. **`sessionActive`, not `visible`, gates the switch animation** — pins §4.4 against a
   later well-meaning change.
