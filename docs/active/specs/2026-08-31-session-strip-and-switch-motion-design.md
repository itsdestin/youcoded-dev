---
status: active
created: 2026-08-31
revised: 2026-09-01
tags: [ui, motion, session-strip, chat-view, desktop]
supersedes: youcoded PR #192 (feat/session-switch-animation) — still OPEN as of 2026-08-31; close it unmerged
verified_against: youcoded@2af35eff (re-verified 2026-08-31; none of the cited files have moved since)
---

# Session strip and session-switch motion

Four motion surfaces, one shared vocabulary. Every line reference below was read off
`origin/master` at `2af35eff`.

## 1. What this replaces

Draft PR [youcoded#192](https://github.com/itsdestin/youcoded/pull/192) animated two of
these four surfaces in July. It is 1,509 commits behind, conflicts in `ChatView.tsx`, and
its bubble mechanism was disabled by a performance fix that landed on 2026-08-06 (§4.1).
**It is still open. Close it unmerged; do not rebase it.** Its two diagnoses of the pill
(§5.1) are still correct and are carried forward here; nothing else survives.

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

No motion tokens exist today. `globals.css` has zero `--ease*` / `--duration*` variables and
zero `cubic-bezier`; every curve in the app is inline in a `.tsx` file or in `buddy.css`.
Across the renderer there are **five distinct curves**, three of them the same overshoot
with drifted numbers:

| curve | uses | family |
|---|---|---|
| `cubic-bezier(0.34, 1.56, 0.64, 1)` | 8 | overshoot |
| `cubic-bezier(0.16, 1, 0.3, 1)` | 3 | expo-out |
| `cubic-bezier(0.34, 1.5, 0.5, 1)` | 2 | overshoot (drift) |
| `cubic-bezier(0.34, 1.62, 0.64, 1)` | 1 | overshoot (drift) |
| `cubic-bezier(0.28, 0.84, 0.42, 1)` | 1 | ease-out |

(A sixth string, `cubic-bezier(…1.56…)`, appears in a code comment and is not CSS.)

The design guide states a rule — 150ms hover/press, 200ms drawers and sheets, everything
behind `prefers-reduced-motion` and the app's Reduce Visual Effects toggle
(`docs/active/design/2026-08-25-ui-design-guide.md` §2.4) — and nothing enforces it.

**Define three curves and three durations as CSS custom properties in `globals.css`, and use
them for this work only.** Destin picked "Soft" from three live candidates on 2026-09-02:
`--ease-reveal` (`0.25, 0.1, 0.25, 1`, a plain ease) for things that open — a name, a badge, a
hover, a colour; `--ease-out` (`0.16, 1, 0.3, 1`, fast deceleration) for things that must
lead — the dots stepping aside for a dragged pill (on the gentle ease they started too slowly
and the pill sat over them); `--ease-settle` for a released pill gliding home.
`--dur-hover: 180ms`, `--dur-reveal: 260ms`, `--dur-switch: 300ms`. None of the three
overshoots: the first cut used the app's spring curve on the pill and Destin's verdict was
*"much too bouncy/aggressive"*, and a spring on a width-like property sends every pill to the
right of it past its destination and back. Overshoot is allowed in exactly one place — the
switch arrival (§4.2), which is one element's transform.

Existing call sites elsewhere in the app are **not** converted. Destin, 2026-08-31: a sweep
means visual changes in surfaces unrelated to this work, which is the thing that costs
trust. The stray curves are a separate cleanup with its own before/after deck. **The files
this work edits are the exception** — inside them, every curve moves onto the tokens,
because §11's guard cannot distinguish a line this work wrote from one it merely sat next
to.

Gating is unchanged and applies to all four surfaces: `prefers-reduced-motion` **and**
`reducedEffects` from `useTheme()`.

### 3.1 Smooth curves are for transient motion only — `steps()` stays

This app has already measured what smooth motion costs and written the answer into a test.
`globals.css:853` and `tests/animation-frame-budget.test.ts` record the 2026-07-30 finding:
on a 180Hz panel, **any** smoothly-animating element makes Chromium present at the full
refresh rate, ~1.5–1.9ms of CPU per frame — ~29% of one core for a single pulsing dot. It
is per-frame, not per-element, and not app-specific. `steps()` timing was the only lever
that worked (28.75% → 9.33% at `steps(8)`).

That policy is already enforced **inside `SessionStrip.tsx`**: the test pins
`transition: 'opacity 150ms steps(4), background 150ms steps(4)'` at `:1014`, the breathing
dot to `steps(8)` at `:98`, and `.stepped-hover` / `.hover-lift` / `.card-interactive` to
`steps()` in `globals.css`.

The line this spec draws:

- **Perpetual or idle-state motion keeps `steps()`.** The `steps(4)` pin at `:1014` and the
  `steps(8)` breathing dot are untouched. The vocabulary does not replace them.
- **Transient, gesture-triggered motion gets the smooth curves.** A 150–200ms transition
  fired by a click, a hover-in, or a session switch presents frames for a fifth of a second
  on a gesture the user initiated. That is worth paying for; a dot that breathes forever is
  not.
- **Drag costs nothing new.** The dragged pill already updates its transform on every
  `pointermove` — that is what today's floating ghost does. Moving the real pill instead of
  a copy presents the same number of frames.

The one place to actually measure is §4's incoming-bubble animation, because it is the only
proposal that animates many elements at once (§10).

### 3.2 Enforcement

An ast-grep rule (`scripts/ast-grep/`) fails the build on a raw `cubic-bezier(` in any file
this work touches, so the drift cannot restart here. It must allow `steps(` — the rule bans
hand-written bezier curves, not hand-written timing functions.

## 4. Chat bubbles on session switch

Today: no animation. The transcript is replaced instantly.

### 4.1 Why the July mechanism is unusable

`81c9562d` (2026-08-06, *"take inactive sessions out of layout during resize"*) added to the
ChatView root, now `ChatView.tsx:836`:

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

**Do not reintroduce a dependency on `in-view` for this.** It carries two unrelated jobs
already — wallpaper glass (`[data-wallpaper] .in-view .bg-inset`, `theme-engine.ts:600`) and
pausing off-screen keyword shimmer (`globals.css:1680`) — it is observer-driven and
therefore async, and it is now coupled to `content-visibility`.

### 4.2 The animation, and the one choice inside it

**The outgoing conversation does not animate.** The app has already stopped drawing it, and
Chrome does not animate the page you are leaving either. This deletes the 120ms hold that
was PR #192's largest open question: the incoming conversation appears immediately.

**Picked 2026-09-02: spring up.** The conversation fades in while rising 14px on an
overshooting curve (`cubic-bezier(0.34, 1.56, 0.64, 1)`, `--dur-switch: 380ms`) — one
element, `.switch-arrival`. Overshoot is fine here because it is on the transform of one
element that moves nothing but itself; the strip's no-overshoot rule is about width-like
properties. Chosen over fade-and-lift (the first baseline), grow-in and slide-in in round 2
of the live deck; the `[data-arrival]` review scaffold and the `?arrival=` reader are deleted.

How the incoming conversation arrives was a **choice step** in the review deck (§8), with two
options that differ in cost by two orders of magnitude:

- **A — whole-pane arrival.** The transcript container fades and lifts as one element, on
  the vocabulary. One animated element regardless of transcript length. No measurement, no
  per-entry state, no perf risk, and it is closer to what Chrome literally does on a tab
  switch: it swaps the page, it does not stagger the paragraphs.
- **B — per-bubble stagger.** On-screen bubbles animate in individually with a small
  stagger, capped so a full screen does not become a long cascade. Livelier; requires §4.3
  and carries the frame-cost risk in §10.

**Build A first.** It is a handful of lines and it is the fallback if B is rejected or
measures badly. Record both for the same clip step; §4.3 is only built if Destin picks B.

### 4.3 Measuring which bubbles are on screen — only if §4.2 lands on B

At the instant of a switch, in a `useLayoutEffect` on the incoming pane, **measure which
entries are on screen** and animate only those.

Entries are in document order inside one scroll container with no `position: sticky` and no
column-reverse, so `offsetTop` increases monotonically. **Binary-search it** for the first
and last entry inside the viewport, comparing `offsetTop` against `scrollTop` and
`scrollTop + clientHeight` in that same coordinate space. That is ~14 property reads,
bounded regardless of transcript length — which matters, because a scrolled-back
conversation can hold 12,100 messages and ~1.44M DOM nodes
(`docs/active/handoffs/2026-08-28-perf-cycle-3-handoff.md` §2).

Two caveats to hold onto:

- **The reads are bounded; the layout they force is not.** The first `offsetTop` read
  forces layout of a subtree `content-visibility` had been skipping. That layout has to
  happen before the frame paints either way, so this reorders work rather than adding it —
  but it makes the switch block on it.
- **The 0.5ms median in the `:824` comment was measured on a six-pane fixture, not on a
  12,100-message transcript.** Do not carry that number over to this. §10 says measure.

This keeps Destin's July constraint — *only actually-visible bubbles animate* — and makes
it stronger: it is measured at the moment it is used, rather than inherited from an
observer that may not have run yet.

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

**The name is laid out once; only a clipping box around it animates, between two measured
numbers.** The label is a box with `overflow: hidden` whose `max-width` transitions between
`0` and `ceil(nameWidth) + 12px tail + 2px slack`; inside it the name sits at
`width: max-content`. Two things follow:

- The text never re-wraps or re-ellipsises mid-animation. The first cut animated the text's
  own width with `calc-size()`, and the browser re-fitted the name on every frame — *"theme
  …", "theme cont…", "theme contra…"* — a shimmering ellipsis for a fifth of a second on every
  click. That was most of what read as jank.
- Both ends are plain pixel values, so there is always a pair to interpolate (the original
  snap was `maxWidth: undefined`).

**What does not fit fades out, it is not cut with "…".** A 12px `mask-image` fade on the box,
the way Chrome fades a tab title — so a squeezed active pill and a pill mid-reveal are the
same treatment at two moments. The active pill still flex-shrinks with `min-width: 0` when
the strip itself is narrow; the box's `max-width` is a ceiling, not a size.

**The width comes from the same canvas measurement the packer budgets with, in the label's
REAL computed font.** The packer had always measured with `system-ui`; the UI font is a
monospace (`--font-sans` is Cascadia Mono), ~15% wider, which is why names cut short and
why the packer expanded pills that did not fit. `SessionStrip` reads `getComputedStyle(…).font`
off its own label after each commit and re-measures only when it changes.

**A pill is its dot and its name — the runtime tag is gone (2026-09-02).** Until round 3 a
native session's pill also carried a "YouCoded · Coder" badge that opened after the name on
every switch. It was ~96px the strip had no room for and a second motion to wait for; Destin:
*"eliminate the 'youcoded - coder' tags in session names entirely. they still cause a bit of
visual jank."* The runtime and the model now sit under the name in the All Sessions menu —
"Claude Code · Sonnet", "YouCoded Coder · Qwen3 Coder", "YouCoded Assistant · Grok 3" — with
the brand mark the status bar's model chip uses, in the brand colour; the text stays muted
like the folder beside it (`header/session-runtime-label.ts`). The packer measures the name
alone (`pill-metrics.ts`).

The `'none'` kill-switch for repack churn stays, and is lifted for every pill inside a
window armed by a change of active id — `--dur-reveal` plus slack, read off the stylesheet
(`motionWindowMs`), never a literal tuned to one vocabulary. The
window opens **in the same render as the change** (`useOneShotWindow` derives it during
render, not in an effect), so the first painted frame already carries the transition; the
effect-based version painted one un-animated frame first when the switch was not a click.

## 6. Hover

Today this is the closest to right: the pill scales to `1.02` over 150ms on the canonical
bounce, with border, background and glow on the same curve (`SessionStrip.tsx:872-880`).
Three things undercut it.

1. **The name reveals to a fixed 120px** (`:892`), not to its own width. Every reveal runs
   the same distance regardless of the name's length: a short name reaches its full size
   early and then sits still while the animation keeps running, a long one is cut off. Fix
   with the §5.2 mechanism — `calc-size(max-content, min(size, 120px))` expresses "your own
   width, but never past 120px" in one value, keeping the cap the non-active pill needs.
2. **Two curves in one gesture** — the pill uses the bounce, the name uses plain `ease`
   (`:896`). Both move onto the vocabulary.
3. **A pill collapsed by the packer under a stationary cursor never reveals.** The hover
   handlers are attached only to non-pack-expanded pills (`:852-853`). If a repack turns a
   pill into a dot while the cursor is already on it, `mouseenter` has already fired and
   will not fire again — the pill sits as a dot until the user moves off and back on. Fix
   by attaching the handlers unconditionally and gating on `pack.expanded` inside the
   handler, or by deriving hover from a `:hover`-driven CSS state instead of React state.

4. **Mouse-down collapsed the peek.** Pointer-down cleared the hover state, so the peek you
   had open shut to a dot, and the click then re-opened the same pill as the active one:
   open → shut → open on every click of a dot — Destin: *"clicking is weird and jumpy."*
   Hover is no longer touched at pointer-down. The peek simply stays open and becomes the
   active label: its box un-caps from 120px to the full name.

**Not a cause:** the `'none'` kill-switch at `:896` does *not* suppress the hover reveal.
Pack-expanded pills have no hover handlers at all (`:852-853`) and their name is already
showing, so there is no reveal for it to silence. It bites only the active pill, which §5.1
already covers. Recorded here because it looks like a second cause and is not.

**Known trade-off, deliberately kept:** a peek pushes the dots to its right, so sweeping
across a row of dots moves the row under the cursor. Chrome's rule is never to change layout
under the pointer, and an overlay peek (the name floating over its neighbours, nothing else
moving) would honour it — at the cost of hiding the dots you are sweeping towards. Not
built; a candidate for a later round if the push reads as jitter in use.

### 6.1 When the switch happens — press (picked 2026-09-02)

Destin, on the rebuilt round: *"I want this to work a little more like chrome, where the new
session is selected right when I click the new session pill and begin to drag … the old
session would collapse to status dot and new session would expand right as drag begins."*
Three modes were built and offered as round 2 of the live deck; Destin picked **press**, and
it is now the only behaviour (the modes and their reader are deleted):

- **press** (default) — the session switches the instant you press, as a Chrome tab does:
  the old name collapses, the pressed one opens, the conversation changes underneath; drag
  it and you drag the open name.
- **press-dot** — switches on press too, but the pill in hand stays a dot from press to
  drop; the name opens where you let go.
- **release** — nothing changes until you let go; what round 1 had.

Selecting on press is what forced §7.4's floating-twin model: it reshapes the row while a
drag may be starting on it. The pack for the drag is computed at pointer-down for the row it
is about to become, with the pressed session as active. Menu rows never select on press.
The winner becomes the only behaviour and the reader goes.

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

### 7.3 A correctness fix that has to land first

`dragIdx` is resolved against the **full** `sessions` array (`:492`, deliberately — see its
comment), but `data-session-idx` on each pill is its index into the **visible** subset
(`:847`). `visibleSessions` (`:813`) drops every session in `packSessions`' `overflow`
bucket — that is what the "+N" chip at `:920` counts — so the two index spaces diverge the
moment the strip runs out of room.

When they diverge: `isBeingDragged` (`:842`) marks the wrong pill, and
`onReorderSessions(releasedDragIdx, releasedOverIdx)` (`:724`) is called with a canonical
"from" and a visible "to", dropping the session in the wrong slot.

Today this is nearly invisible, because the thing tracking the cursor is a separate floating
copy that always looks correct. **Under §7.4's moving-pill model the wrong pill would
visibly slide**, so this is a prerequisite, not a nice-to-have.

**Fix:** hold drag state by session **id**, not index. `dragId` / `overId` replace
`dragIdx` / `overIdx`; `data-session-idx` becomes `data-session-id`; the only place indices
are needed is the `onReorderSessions(from, to)` call, which converts both ids to canonical
indices at the call site. Ids are unique (`pack-sessions.ts` says the caller guarantees it),
so no index space can drift out from under them again.

### 7.4 The change

Replace the ghost model with a moving-pill model.

- **The dots flow around the pill in hand (2026-09-03).** Destin: *"the dragged session
  kept visibly overlapping dots before they appeared to begin to move. it would be fine if
  they teleport or fade in/fade out as long as they dont visually touch the dragged pill"*
  — and then, on a cut that hid any dot near the pill, *"too much empty space on either side
  of the dragged chip"*. Both are honoured at once: any dot the pill is over shrinks towards
  its own far edge (`--flow`, written per frame by the twin's rAF loop), keeping
  `FLOW_GAP_PX` clear of the pill; the dot ahead in the direction of travel also gets a ghost
  (`[data-ghost]`, a clone with no data attributes) growing behind the pill at the spot it
  will land; the yield fires at the dot's far edge (`DRAG_TUNE.margin = −28`), when it is at
  scale 0, and the real dot takes over from the ghost at full size. Nothing touches; the
  row never shows a hole (2–4px mean gap both sides, measured). Wide neighbours are never
  flowed — they slide on `--ease-out`. A 1px veil remains as a safety net for geometry the
  flow does not shape. The twin is anchored to its in-flow box plus the cursor's
  displacement since drag start (never a grab fraction — a drag starts while the row is
  still reflowing from the press), React writes its `left`/`width` once at mount and the
  rAF loop owns them after (React re-applied a stale `left` a frame late), and the dot's
  centre is mapped from the row AS DRAWN into settled coordinates (`mapToSettled`) before
  the yield rule runs. The twin is clamped to the row of pills (first pill's left to last
  pill's right) in that same loop, and a dot is passed 1px before its far edge (`margin`
  −27) so the clamped pill can still take the first or last slot.
- **A drop disturbs nothing but the pill (2026-09-03).** The flow keeps running through the
  settle, fed the real pill's rect, so a mid-flow dot regrows as the pill glides off it; the
  row keeps the drag's pack (`postDropHold`) until the cursor leaves the strip, the next
  press, or the session list changes — a live repack at the drop opened a different second
  pill and re-centred the row 60px; and no hover peek opens after a drop until the pointer
  has moved 8px or left the strip (`hoverLock`) — the dropped pill glides out from under the
  cursor onto its neighbour.
- **The pill moves, 1:1 — as a floating twin.** Its in-flow box stays in the row, invisible,
  holding its slot and still animating its own width; a twin with the same markup and styles
  floats absolutely inside the bar at the cursor (`clampFloatLeft`, **no transition on its
  position** — an ease there makes it trail the pointer like a rubber band). The twin lifts
  (shadow, `z-index`), carries no data attributes (tear-off placement and the perf lab walk
  the row by `[data-session-id]` and must find one node per session), and takes no pointer
  events. The grab point is kept as a **fraction** of the pill's width, so a pill that grows
  from a dot to a name in hand stays under the same part of the cursor.
- **The row can reshape underneath.** The slot is judged against **synthetic settled
  geometry** — `layoutRects` over the pack the row is settling into, with each pill at its
  measured full width or a dot — never against the DOM, which on a select-on-press is still
  mid-animation when the drag starts.
- **The neighbour ahead yields early; nothing behind is touched.** Only the neighbour in the
  direction of travel (a 4px dead-band before a reversal counts) steps aside, `DRAG_TUNE.margin`
  px before the pill's leading edge reaches it, so the pill never sits over a dot that has not
  moved. A wide neighbour waits for its centre minus `early`, or a dot would send a 290px pill
  sliding aside on touch. Because the rule only ever moves what is ahead, it cannot oscillate
  while the direction holds; a reversal makes the dot just passed the one ahead again, and it
  steps back at the same early point. (`nextSlotId`; the nearest-slot rule below survives only
  as the fallback for a drag from the All Sessions menu.)
- **Nearest slot, the fallback.** A slot is where the pill
  would sit if dropped between a given pair of neighbours — a pure function of the frozen
  widths and the order (`slotCentres` / `nearestSlotId` in `drag-order.ts`), never of where
  the neighbours are drawn right now. Nearest-neighbour is only the same question when every
  pill is the same width: with a ~180px pill among 24px dots it needed the cursor at a dot's
  centre before that dot stepped aside, so the pill overlapped three dots before its gap
  opened — then the review cut positioned the pill by its slot instead, which put the gap
  right and took the pill out from under the pointer (it hopped 26px per slot while the
  cursor travelled 130px). Nearest slot keeps the pill under the cursor **and** the gap under
  the pill: it is never more than half a neighbour-width from its hole. Dots flow under a
  wide pill one at a time.
- **Neighbours step aside by the dragged pill's width plus one gap** (`neighbourOffsets`,
  unchanged), so the row keeps its total width and the gap **is** the indicator. A dot does
  it as a jump while veiled (above); a wide neighbour slides on `--ease-out`. (A timed blink
  — `pill-hop-a/b`, 2026-09-02 — preceded the veil and was replaced by it: its fade-out
  still let the pill reach the dot.) Delete the floating copy, the insertion line and
  `ghostTarget`.
- **Release glides; nothing springs back.** The reorder, the release of the drag visuals and
  the arming of a settle all land in **one render**, so the DOM order changes in the same
  commit the transforms drop: the neighbours are already exactly where they were drawn, and
  only the pill in hand has anywhere left to go. A two-render FLIP (`settle` state: `hold`
  with the pill at its release position and no transition, then `glide` to zero on
  `--ease-settle`) moves it the last few px. The first cut cleared the visuals at pointer-up
  and reordered after the cross-window drop resolution returned, so the pill sprang to its
  origin and then jumped to its slot.
- **Vertical is tear-off only.** The pill rides the strip line; downward motion past the
  existing threshold fires the existing live tear-off, **unchanged**.

### 7.5 Everything freezes for the duration of a drag — including the pill in hand

Chrome's tabs are uniform width and compress evenly. Ours are not, and this is where an
"exactly like Chrome" drag can go wrong.

1. **Pill widths freeze.** Dragging *over* a pill must not trigger its hover reveal (the enter
   handler ignores the drag). **And the pill in hand keeps its peek.** A fast drag leaves the
   pill's own box, `mouseleave` fires, and letting the peek collapse then shrank the thing
   under the cursor by the width its neighbours had already stepped aside for — the ~150px
   void Destin photographed on 2026-09-01. The leave handler ignores the drag too; hover is
   released at the drop, where the pill becomes the active one and its name stays open anyway.
2. **Packing freezes.** The pack the drag is judged against is computed once at pointer-down
   (for the row it is about to become) and held in a ref until release; a resize cannot
   repack under the cursor.
3. **Geometry is synthetic.** Pill rects are laid out once at pointer-down from that pack's
   settled widths (`layoutRects`); the DOM is never re-measured mid-drag, because it is
   animating towards exactly those widths.

Whatever the row looked like when you pressed down is what it looks like until you let go.

## 8. How this gets reviewed

Every visual decision reaches Destin as a **live pane in a review deck** — the running
strip itself, in the workbench's live-candidate route, that he hovers, clicks and drags.
Clip steps were tried first and rejected (*"the videos are just rough to compare"*); the
deck side of live panes shipped 2026-09-01 (`docs/archive/specs/2026-08-31-live-review-panes-design.md`).

The candidates are the real `SessionStrip` in a demo host
(`dev/workbench/mockups/SessionStripMotion.tsx`, registered as `session-strip-motion` and
`session-switch-arrival` in `compare/registry.tsx`). They differ **only** in the
`data-motion` / `data-arrival` attribute the host sets — the review scaffold in
`globals.css` — never in code, so the winner is a value swap into `:root` and the deletion
of the scaffold blocks, nothing more.

Deck: `docs/active/design/2026-08-31-session-motion/session-motion-live.json` — three steps:
**feel** (pick one of Settled / Crisp / Soft), **switch-when** (pick one of Press /
Press-name-on-drop / Release, §6.1), **arrival** (pick one of Fade-and-lift / Fade / Cut). Per the review-deck rules, several designs of one thing
are ONE choice step, never a yes/no each.

## 9. Out of scope

- **Android.** `forceSingle` (`SessionStrip.tsx:812-815`) filters the strip to the active
  session alone, and pills are keyed by session id, so the strip remounts on every switch —
  there is no before-state to transition from and no expansion to show. Not faked.
- **The buddy window's `SessionPill`** — a plain dropdown with always-visible labels.
  `buddy.css`'s six stray curves stay where they are.
- **Ctrl+` (chat↔terminal)** — §4.4.
- **The outgoing conversation's bubbles** — §4.2.
- **Converting call sites outside the files this work edits** — §3.
- **Replacing the `steps()` transitions** — §3.1.
- **Ghost lag/tilt.** Chrome's tab tracks the cursor 1:1; the carried feel comes from
  elevation and from the neighbours moving, not from lag. Nothing to add.

## 10. Risks

| Risk | Why it matters | How it is caught |
|---|---|---|
| Many bubbles animating at once burns CPU | 2026-07-30 measured ~1.5–1.9ms/frame for *one* smoothly-animating element at 180Hz; §4.2 option B animates a screenful | Measure option B in the dev window on a high-refresh panel before the clip is recorded; option A is the escape hatch and is built first |
| Index-space mismatch under overflow | Wrong pill drags and wrong reorder slot — invisible today, glaring once the real pill moves (§7.3) | Pinning test on the id-keyed drag state with an overflow fixture; fix lands before §7.4 |
| The width/pack freeze is wrong | Pills change size mid-drag — worse than today's jump | Its own clip, at a window width narrow enough to force packing |
| The measured name width disagrees with the rendered one | The label box opens to a number; one px short fades the last letter, one px long is invisible | Fonts are read off the real label (§5.2); 2px slack; `pill-metrics.test.ts` pins that the handed-in font is the one measured |
| The on-screen measurement is slow | It runs on the critical path of a session switch; the 0.5ms median in `ChatView.tsx:824` was a six-pane fixture, not a 12,100-message one | Measure against `perf-reports/2026-08-28-0803-8935c28-cycle3-baseline.json`, do not assume |
| Narrow viewport and remote access pack differently | The strip is a different shape there and neither is covered by the desktop clips | Its own clip per surface |
| Drag interacts with live tear-off | Tear-off is shipping behaviour and must not regress | Exercised in the drag clip, past the threshold |
| `SessionStrip` is never rendered in a test | Five suites read it as source text; none mount it, so behaviour changes are unguarded | Add the first render-level test for the freeze rule, the armed-window override and the id-keyed drag state |

## 11. Guards

Per the workspace knowledge ladder, each of these is a test, not prose. All live in
`tests/animation-frame-budget.test.ts` (source-text pins on `SessionStrip.tsx` and
`globals.css`) unless named otherwise.

1. **Drag state is keyed by session id, not index** — `drag-order.test.ts` reproduces the
   overflow divergence with the real packer.
2. **The pill in hand is a twin that follows the cursor with no transition on its
   position; the slot is nearest-slot over synthetic geometry** — `clampFloatLeft` /
   `layoutRects` / `nearestSlotId` present, `draggedSlotOffset` / `nearestPillId` absent, the
   twin carries no data attributes; `drag-order.test.ts` pins the half-a-dot bound and the
   menu-drag fallback.
3. **Hover survives pointer-down and the drag** — no `setHoveredId(null)` in the down
   handler; the leave handler bails during a drag.
4. **Two curves, no overshoot** — every `--ease-*` control point ≤ 1; `--ease-bounce` gone.
5. **No review scaffold survives, and `:root` still holds `--bottom-chrome-total`** — no
   `data-motion` / `data-select` / `data-arrival` anywhere (each was picked and deleted);
   the first scaffold was pasted inside `:root` and swallowed the rest of the block.
6. **The name is laid out once; the tail is one number in three places** — `LABEL_TAIL_PX`
   equals the mask stop and the name's padding; `pill-label-style.test.ts` pins numeric
   ends and the ease-out curve on `max-width`.
7. **Nothing but the dot and the name is on a pill; the runtime lives in the menu** — no
   `session-pill__badge` in the strip or the stylesheet; `sessionRuntimeLabel(s)` and a
   `ProviderIcon` in the menu row; `session-runtime-label.test.ts` pins the wording per
   runtime, the brand mark, and the no-guess rule for an unknown model.
7a. **No dot is drawn touching the pill in hand, and no hole** — `VEIL_PX`, the proximity
   test in the rAF loop, `.session-pill--veiled` with both `!important`s, a dot's `0s`
   transform during a drag, `scale(var(--flow, 1))` on a dot's drag transform, the far-edge
   margin (−28); and the name stays in hand (no `id === sessionId` dot width).
8. **Widths are measured in the font handed in** — `pill-metrics.test.ts`.
9. **The one-shot window opens in the first committed render** — `use-one-shot-window.test.tsx`
   records committed values with a layout effect: `[false, true]`.
10. **`sessionActive`, not `visible`, gates the switch animation**; the arrival keyframes
    are finite and gated on reduced motion AND Reduce Visual Effects; the arrival
    is spring (14px lift, the overshooting curve inline, `--dur-switch: 380ms`).
11. **The existing `steps()` pins survive** — the `steps(4)` menu-row transition and the
    `steps(8)` breathing dot are still asserted (§3.1).
