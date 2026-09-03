---
status: active
created: 2026-08-31
revised: 2026-09-01
tags: [ui, motion, session-strip, chat-view, desktop, handoff]
plan: docs/active/plans/2026-08-31-session-strip-and-switch-motion.md
spec: docs/active/specs/2026-08-31-session-strip-and-switch-motion-design.md
deck: docs/active/design/2026-08-31-session-motion/session-motion-live.json
---

# Session strip & switch motion — handoff

**State (2026-09-03, night): the flow is in ("this is MUCH better"). Round 6 came back with
two bugs ("i still cant drag a session into the leftmost position, and they still bug out a
little on release"); both were measured to causes OUTSIDE the motion — the packer fitting a
row wider than the strip (the active name squeezed 25px, so a drag planned with the wrong
widths and the row snapped back at the drop) and the tear-off firing when the hand left the
pane sideways. Fixed in youcoded `7bcf75cf`; served as the round-7 live deck (one try-this
step). Waiting on that answer; then merge.**

Destin's round-1 answers (`session-motion-live.answers.json`): **feel → Soft** (*"i like soft,
but it will need to be tuned/repaired a bit. it's jank"*), **switch-when → Press** (*"further
refinement/tuning on the merged soft/press variant"*), **arrival → Other** (*"i want to try a few
slightly more interesting/bouncy options"*). Done since:

- Soft's values are `:root`; the `[data-motion]` presets, the `[data-select]` modes and their
  `?motion=` / `?select=` readers are deleted. Three curves now: `--ease-reveal` (plain ease,
  for things that open), `--ease-out` (fast deceleration, for the dots that must LEAD a
  dragged pill), `--ease-settle`. Rounds 1–2 stay in the registry as the record; their losing
  candidates render what shipped and say so.
- The "jank" in Soft had two measured causes: the label-arming window was a fixed 360ms and
  closed before Soft's badge (260 + 180ms) finished opening, so it popped — it now reads the
  durations off the stylesheet (`motionWindowMs`); and the step-aside was on Soft's gentle
  ease, leaving the dragged pill over a dot — the step-aside keeps the fast curve.
- Pickup after a press: the header re-centres the strip (~40px over 260ms) while the row
  reshapes, so geometry laid out at press drifted from where the dots settled. The drag now
  shifts its geometry by however far the bar has moved since press. Probes: 0px sustained
  overlap ahead of the pill in right, left and fast drags.
- Round 2 deck: `session-motion-live-2.json` — a try-this on the tuned strip and a pick-one on
  four arrivals (lift / spring / grow / slide).

Destin's round-2 answers (`session-motion-live-2.answers.json`): **strip → Other** (*"eliminate
the 'youcoded - coder' tags in session names entirely. they still cause a bit of visual jank.
we should instead have labels next to the project folder label in the session switcher
dropdown that shows a 'Claude Code · Sonnet' or 'YouCoded Coder · Deepseek' … keep the
model/brand icons used on other model surfaces. also dots still keep sliding under the
selected pill"*), **arrival → spring**. Done since (commit on `feat/session-strip-motion`):

- The badge is gone from the pill, the stylesheet, the packer's measurement and the arming
  window (`motionWindowMs` is now `--dur-reveal` + slack). `header/session-runtime-label.ts`
  builds the menu line — "Claude Code · Sonnet" / "YouCoded Coder · Qwen3 Coder" — from
  `provider`, `harnessId` and `model` (the `model` field was added to both `SessionEntry`
  types; `SessionInfo` already carried it), with `resolveModelBrand` for the mark and colour
  and `nativeModelLabel` for the name, so it matches the status-bar chip letter for letter
  ("Deepseek R1" is that helper's casing). Mark in brand colour, text muted like the folder,
  capped at 55% of the row so a long local file name never pushes the folder out.
- Dots hop: `hopGen` in `SessionStrip` bumps a per-pill generation on every CHANGE of its
  step-aside offset (seeded at 0, so the yield on the very render the twin appears blinks
  too — the first cut seeded with the yielded offset and the pickup dots jumped in full view);
  the class alternates `session-pill--hop-a` / `-b`; during a drag the neighbour's transform
  transition is `0s` delayed by half the blink. Keyframes invisible 25–75%. The probe now
  records opacity and ignores a dot below 0.5 (`~` suffix in its rows): 0px sustained overlap
  in right, left and fast drags.
- Spring is the arrival: the keyframes' own values (14px, the overshooting curve inline on
  `.switch-arrival`, `--dur-switch: 380ms`); `[data-arrival]`, `?arrival=` and the demo's
  `arrival` prop are deleted. Registry: session-strip-motion R4 (`soft-press-hop`, the one
  candidate) and the arrival rounds annotated with the picks.
- Round 3 deck: `session-motion-live-3.json` — one try-this step on R4.

Destin's round-3 answer (in chat, not the answers file): *"this is better, but the interaction
between the selected moving pill and the other dots/sessions still feels janky."* Diagnosis
and what was built (commit `8a03d554` on `feat/session-strip-motion`):

- **The jank was structural.** The open name in hand (~180px) among 28px dots meant every
  dot crossed the whole pill to get out of its way, and no treatment of the crossing — a
  slide, then a blink — could look right. Chrome never has this: a dragged tab is the width
  of its neighbours. **So the pill in hand is a dot**: the name closes the moment the pointer
  moves far enough to be a drag (a click still opens it on press) and opens again at the
  drop; `widthOf(dragId)` is `COLLAPSED_PILL_PX` in the drag's settled geometry, so a
  neighbour steps exactly one dot-width.
- **Two pickup defects the probe found once the dot was in hand.** (1) The grab fraction
  was measured at the PRESS; by the time the drag started the row had slid ~60px under the
  stationary cursor, so the twin appeared ~150px from its box. Now measured at drag start,
  against the box as it is; the rAF loop that syncs the twin's width also re-anchors its
  left, so it shrinks around the cursor. (2) Yields were judged against SETTLED geometry
  while the row was still sliding for 260ms: seven dots yielded at once, far ahead of the
  visible pill. A first fix interpolated each pill's rect toward settled — useless, because
  `slotCentres` positions slots from `rects[0].left` and cumulative widths, not each
  pill's left. What works: `mapToSettled` (drag-order.ts) maps the dot's centre from the row
  AS DRAWN (every pill's left, its in-flight transform read off `getComputedStyle` and
  taken back out) into settled coordinates, then `nextSlotId` runs on settled rects. Frame
  log after: dots yield one at a time as the pill reaches them, slot always under the pill.
- **The probe's metric changed.** It measured the OVERLAP width, which scores the same-size
  swap (the yielded dot sits under the pill until passed — Chrome's swap) as 22px of jank.
  It now measures how far a neighbour STICKS OUT ahead of the pill's leading edge, ignores
  a dot below half opacity (`~` in its rows), and logs the bar's left (`BAR`). Residual:
  0–16px sustained, which is the fade time of a hop or the slide of a same-width swap.
- **One scaffold**: `[data-yield="slide"]` (globals.css) turns the hop back into a slide for
  the deck; the demo's `yieldAs` prop sets it. Registry R5: `dot-slide` / `dot-hop`.
- ~~Round 4 deck: a pick-one on dot-slide vs dot-hop with a dot in hand~~ — **withdrawn**
  before it was answered. Destin, on seeing it: *"no you got this wrong. i want to keep the
  fully expanded name. the problem is that the dragged session kept visibly overlapping dots
  before they appeared to begin to move. it would be fine if they teleport or fade in/fade
  out as long as they dont visually touch the dragged pill."*

**What was built on that (commit `0af19851`):** the pill's settled width is its full width
again and the name never closes. The rule is now **geometric**: a dot within `VEIL_PX` (10px)
of the twin, where it is drawn this frame, gets `.session-pill--veiled` (opacity 0,
`transition-duration: 0s`, both `!important` against the inline transition list) — hidden at
once; its step-aside is a plain jump (`transform … 0s` for dots during a drag) while hidden;
and it fades back in (the pill's own 180ms opacity transition) only once clear. Two writers
keep `veiledRef` in step: the twin's rAF loop (proximity, read off the DOM each frame; the
only thing that ever unveils) and the render (a dot whose offset changes is veiled in the
same commit that moves it). Wide neighbours are never veiled — they still slide on
`--ease-out`. The hop keyframes, `hopGen` and `[data-yield]` are deleted. Kept from the
withdrawn round: grab point at drag start, the rAF re-anchoring the twin's left,
`mapToSettled`. Probes: **0.0px single-frame** visible stick-out in right, left, fast, long
and short-left drags (the probe ignores dots below half opacity, so this is exactly
"nothing visible touches the pill").

- Round 4 deck (rewritten): `session-motion-live-4.json` — one try-this step on the veil.

Destin's round-4 answer (`session-motion-live-4.answers.json`): **Other** — *"too much empty
space on either side of the dragged chip."* Measured (the probe now reports the gap from
the pill's edges to the nearest VISIBLE pill): ~25px mean on each side, 40px peaks. And a
hidden dot is a conserved hole — the pill is always over one dot, hidden, and its width is
empty on one side or the other whatever the jump timing (tried: yield at the far edge,
veil at 1px — it moved the hole, it did not shrink it). Chrome has no hole because tabs
slide; sliding is what was rejected.

**What was built (commit `abe32266`): the dot FLOWS around the pill.** Per frame, in the
twin's rAF loop: any dot the pill is over shrinks towards its own far edge (`--flow` scale,
`--flow-origin`), keeping `FLOW_GAP_PX` clear of the pill; the dot AHEAD in the direction of
travel also gets a ghost (`[data-ghost]`, a `cloneNode` stripped of every data attribute)
growing at its landing spot behind the pill, the same gap from the trailing edge; the yield
fires at the far edge (`DRAG_TUNE.margin = −28`), when the dot is at scale 0, and the real
dot takes over from the ghost at full size. Three fixes on the way: React re-applied a stale
`left` to the twin a frame late (continuous-event commit after rAF) — it now writes
`left`/`width` once at mount (`twinMount`), the rAF loop owns them; the twin is anchored to
its in-flow box plus the cursor's displacement since drag start (`dragStartX`), not to a
grab fraction — a cursor-anchored twin parted from its box by the rest of the press's reflow
and sat on the dot behind; the veil exempts flowed dots (a dot scaled to nothing inside the
pill's footprint was being veiled and faded in after its jump). Probe: 2–4px mean gap both
sides, 0px contact every frame, no veiled frames, in right/left/fast/long/short drags. The
probe samples AFTER paint (a 0ms timeout from rAF) — in-rAF reads saw pre-write state.

- Round 5 deck: `session-motion-live-5.json` — one try-this step on R5 (`name-flow`).

Destin's round-5 answer: **Other** — *"this is MUCH better. you're doing a good job. however,
it still bugs out a bit when the chip is released, and i cant seem to drag it to be the
leftmost or rightmost session. it should also stop moving at the left/right boundaries of
the outer container rather than sliding past."* Built (commit `9fff1095`):

- **Sliding past:** the handler's `clampFloatLeft` never reached the screen once React
  stopped writing the twin's `left` (`twinMount`). The rAF loop now clamps to the row of
  pills (first pill's left, last pill's right, from layout positions).
- **Never first/last:** the far-edge yield needed the pill's edge PAST the end dot's far
  edge, and the clamped pill reaches it but never passes it. `DRAG_TUNE.margin` is −27: a
  dot is passed 1px before its far edge. Probed with `OVERSHOOT_PX` (a new probe env: carry
  the cursor past the target's centre, the way a hand does): a session lands first or last.
- **The release, three things in the drop frames:** the flow stopped at the drop, so a
  mid-flow dot popped to full size under the gliding pill (the rAF loop now runs through
  the settle, `flowActive`, feeding the flow the REAL pill's rect); the live packer re-run
  on the new order opened a different second pill — a 151px bloom at the drop and a 60px
  re-centre (`postDropHold`: the row keeps the drag's pack until the cursor leaves the
  strip, the next press, or the session list changes — never a timer); the dropped pill
  glided out from under the cursor onto the next dot, whose hover peek opened (`hoverLock`:
  no peek after a drop until the pointer has moved 8px or left the strip). Frames after:
  the pill glides ~20px home, the ghost shrinks away, the dot regrows, nothing else moves.
- Round 6 deck: `session-motion-live-6.json` — one try-this step on R6 (`name-flow-2`).

**Round-6 answer (chat, 2026-09-03):** *"alright so a few bugs. i still cant drag a session
into the leftmost position, and they still bug out a little on release."* Reproduced with the
probe at the deck pane's width (`PROBE_W=460`, a new probe env — every earlier probe ran at
1440, where neither bug shows the same way):
- **The release:** the packer was handed the wrapper's full width (the strip's own 12px of
  padding included) and never knew about the "+N" chip, so a full row was packed ~37px too
  wide; the active pill is the one flex item allowed to shrink, so it rendered 169.5px for
  a name the packer had reserved 194px for. A drag freezes the RESERVED widths: every dot
  yielded 25px too far (one overlapped its neighbour by 8px at the first slot) and all of
  them snapped back on release. A smaller copy of the same mismatch: `pillMetrics` reserved
  ceil(text) + tail + slack, but the label box's max-width is a ceiling, not a size, and the
  pill renders at text + tail + chrome — 2–3px less — so even an unsqueezed row nudged every
  dot 2.2px at the drop (r18). Now `stripBudget()` subtracts the padding, `packSessions`
  takes `overflowChipWidth` and re-packs with the chip reserved once anything overflows,
  `PackResult.pillBudget` caps the held pill's settled width, and `expandedWidth` is exactly
  text + tail + chrome (fractional). Measured after: a dot lands exactly one gap from the
  dropped pill; nothing else moves (0px), at 460 and 1440.
- **The first slot:** the live tear-off (and the drop routing) fired on the cursor leaving
  the window SIDEWAYS. Reaching for the first slot overshoots past the edge — the pane's
  strip starts 15px from it — which spawned a window and snapped the pill home (probe `a`:
  the twin vanished the frame `clientX` went negative). Sideways never tears off now, as in
  Chrome; only above or below the window does.
- Round 7 deck: `session-motion-live-7.json` — one try-this step on R7 (`name-flow-3`).

**Later on 2026-09-01:** Destin saw the rebuild in the workbench (*"I think this is better"*)
and asked for Chrome's select-on-press: the old session collapsing to a dot and the new one
opening the moment you press, before any drag. That forced a second drag model — the pill in
hand is now a floating twin over a row that is free to reshape underneath it (spec §6.1,
§7.4) — and the deck's second step is now a pick-one on WHEN the switch happens (press /
press-with-name-on-drop / release) instead of the drag yes/no. Three modes are read from
`[data-select]`; the winner becomes the only behaviour. **Destin picked press in the
workbench (*"press looks pretty good actually"*) and asked for the release to be refined.**

**The release, refined by numbers, not by eye.** `scripts/ui-review/drag-probe.mjs` logs
every pill's left edge per animation frame around a scripted drop. It found two things a
recording cannot show: the header re-centres the strip as the row reshapes after a press, so
the floating pill was positioned against where the strip *was* (11px off at release, then a
glide from the wrong spot); and the dots step aside by a computed width 3.4px narrower than
the real one, so all of them hopped 3px at the drop. Now the float tracks the strip's current
edge, and on the drop *every* pill glides from exactly where it was drawn (read off the DOM,
the held one via its twin) to where it lands. Three probes (right, left, and a 150ms drag
started while the name was still opening) show the real pill picking up at the twin's exact
pixel and no jump anywhere. Also corrected: a collapsed pill renders at 28px, and the packer
had budgeted 24 since it was written.

**Then the pickup and the yield (Destin: *"tune when the dots move just a smidge so the dragged
pill doesn't overlap the dots before they move"*).** Two causes again. (1) The floating twin is
a fresh element, so its label opened to full width the instant a drag started — while the
in-flow box it stands in for was still mid-reveal after the press, and the dots beyond had not
been pushed yet: 14px of overlap for the first ~40ms of every drag started right after a
press. The twin's width now follows the in-flow box frame by frame (a rAF loop writing
straight to the DOM). (2) The slot rule was Chrome's — a dot yields when the pill's edge passes
its centre — and the dot then slides *through* the pill. Now only the neighbour AHEAD (in the
direction of travel, with a 4px dead-band before a reversal counts) yields, `margin` px before
contact (`DRAG_TUNE` in `drag-order.ts`; a wide neighbour still waits for its centre minus
`early`, or a dot would send a 290px pill sliding aside on touch). Nothing behind the pill is
ever touched, so the rule cannot flap while the direction holds. The probe's summary is now
"sustained overlap ahead of the pill": 0px in all four probed drags (right, left, fast, long).

The first cut (14 commits, 2026-08-31) was rejected in use: *"much too bouncy/aggressive"*,
*"clicking is weird and jumpy"*, *"drag spacing is still really odd"*. This session recorded
each gesture frame by frame in the workbench, found a mechanical cause for every complaint,
and rebuilt the motion on top of the first cut's correctness work (id-keyed drag, the packer
measuring the badge, the frozen pack). The spec's §3, §5.2, §6, §7.4–7.5, §8 and §11 are
rewritten to describe what is built now; the plan is history.

## Where the work lives

| | |
|---|---|
| Branch | `feat/session-strip-motion` (youcoded), merged up to `origin/master` at `57a8efc0` |
| Worktree | `worktrees/session-motion` — clean, committed, **not pushed** at the time of writing |
| Review deck | `docs/active/design/2026-08-31-session-motion/session-motion-live.json` — three live steps |
| Deck branch | `feat/session-motion-review` (youcoded-dev), worktree `worktrees/motion-docs` — see "Why a workspace worktree" |
| Verification | `bash scripts/verify.sh worktrees/session-motion` → exit 0 (types, FULL suite, knip, eslint, ast-grep); `node scripts/workbench-boot-check.mjs <port>` → 15/15 routes |

## What was wrong, by frame, and what replaced it

| Destin's words | Cause (measured) | Now |
|---|---|---|
| "clicking is weird and jumpy" | Pointer-down cleared hover, so the peek collapsed to a dot and the click re-opened it: open → shut → open | Hover untouched at pointer-down; the peek becomes the active label |
| "still seeing … truncated names" | The badge sat at full width while the name was still opening; and widths were measured in `system-ui` while the UI font is a ~15% wider monospace | Badge opened after the name (`badge-in`), then removed outright in R3; font read off the real label |
| "tags … still cause a bit of visual jank" (R2) | The badge was a second motion after every name reveal, and ~96px of strip | No badge; runtime · model under the name in the All Sessions menu with the brand mark |
| "dots still keep sliding under the selected pill" (R2) | A sliding dot is under the pill for as long as it moves, on any curve | Dots hop: fade out, jump while invisible, fade in (`pill-hop-a/b`); probe ignores dots below half opacity |
| jank on every click | The label animated the text's own width, so the ellipsis re-fitted every frame ("theme …", "theme cont…") | Name laid out once at `max-content`; only a clipping box's `max-width` animates, between two measured numbers; overflow fades |
| "too bouncy/aggressive" | Spring curve on a width-like property; the whole row overshot and came back | No overshoot anywhere: `--ease-out` and `--ease-settle` only |
| "drag spacing is still really odd" | (a) the pill was positioned by its SLOT with an ease: it hopped 26px per slot while the cursor moved 130px; (b) a dot picked up while its peek was open collapsed mid-drag, opening a ~150px void | Pill rides under the cursor 1:1, clamped to the row; target = nearest **slot** centre; hover held through the drag |
| release jumped | Visuals cleared at pointer-up, reorder landed after the cross-window IPC | Reorder + release + settle in one render; the pill glides home (two-render FLIP) |
| (found, not reported) | The review presets had been pasted **inside `:root`**, so `[data-motion=crisp]` swallowed `--bottom-chrome-total` and the drawer width for every normal page | Presets outside `:root`; a test pins `:root` still holds both |
| (found, not reported) | The switch window opened from `useEffect` — one un-animated frame first on any non-click switch | Derived during render; test pins committed sequence `[false, true]` |

## How Destin reviews it

The deck is **live**: each pane is the real strip in the workbench's live route. He clicks,
hovers and drags in the pane itself.

```bash
cd worktrees/motion-docs   # or the main checkout once it has pulled origin/master
python3 scripts/ui-review/review-cards.py serve docs/active/design/2026-08-31-session-motion/session-motion-live.json
# prints  [deck] http://127.0.0.1:<port>/deck-live.html   — quote that line to Destin
```

`serve` boots the `session-motion` worktree's workbench on :5513 itself. Three steps:

1. **feel** — pick one of Settled / Crisp / Soft (`[data-motion]`, speed and curve only).
2. **switch-when** — pick one of Press / Press-name-on-drop / Release (`[data-select]`).
3. **arrival** — pick one of Fade-and-lift / Fade / Cut (`[data-arrival]`).

Answers land in `session-motion-live.answers.json` beside the spec on Submit.

## The deck's fit rule (2026-09-01, evening)

Destin, looking at the deck: three strips abreast at a third of their width, both ends cut off,
two thirds of the stage empty — *"need some rules/guidelines/tooling for better fitting things
to the page."* Built as the general fix, not a flag for this one deck:

- **A pane is never wider than the stage and the row never scrolls sideways** — `fitPanes` in
  `deck/page.js` tries every count per row and keeps the widest panes; fixed panes wrap.
- **A wide, short surface declares a width range and stacks** — `paneWidth: { min, max }` in
  the registry; the deck tells the pane its width by message. The strip is `{ 460, 1400 }`.
- **The stage takes only the height its panes need**; the question follows directly beneath.

Both rules are in `scripts/ui-review/README.md` → Live panes. Pinned by `deck-render.test.mjs`
(wrap, no sideways scroll) and `test_live.py` (a row of wide panes no longer warns; one pane
wider than any screen still does).

## After the round-7 answer

1. "Yes": merge and push `feat/session-strip-motion`; then `feat/session-motion-review`
   (deck + docs). Archive the spec, plan and this handoff; flip ROADMAP items 1067 and 1374.
2. "No"/"Other": the note says what. The flow has one number, `FLOW_GAP_PX` (the gap kept
   clear of the pill); a "squeeze looks odd" note means swapping the scale for an opacity
   ramp at the same positions (`--flow` → opacity), not a return to hiding. The post-drop
   holds (`postDropHold`, `hoverLock`) release on leave/press/8px — if he wants peeks back
   sooner, shorten the 8px, never add a timer. Do not close the name in hand (withdrawn),
   and do not go back to slot positioning (§7.4 replaced it). If a drop still moves
   something other than the pill and the dot it was over, probe at `PROBE_W=460` FIRST and
   compare the twin's width to `widthOf` — every "release" jank so far was a width the
   geometry believed and the DOM did not.
3. Clean up: `worktrees/session-motion`, `worktrees/motion-docs` (and its `worktrees`
   symlink), `worktrees/session-switch-animation` (PR youcoded#192 — close unmerged).

## Why a workspace worktree, and the symlink in it

The main `youcoded-dev` checkout is 29 commits behind and cannot pull: other sessions have
uncommitted edits to `CLAUDE.md` / `ROADMAP.md` / two rules, and untracked files that
`origin/master` now tracks. The live-deck tooling (`deck/live.py`, `?view=live`) is only on
`origin/master`, so this session's docs and deck live in `worktrees/motion-docs`, a worktree
of `youcoded-dev` at `origin/master`. The deck's `serve` resolves `live.worktree` under its
own root's `worktrees/`, so that worktree holds an **untracked symlink** `worktrees →
../../worktrees`. Once the main checkout has pulled, the deck runs from there unchanged and
both the worktree and the symlink go.

## Things the next session should not re-learn

- Measuring text: **read the label's computed font**; never assume `system-ui`. The packer
  had under-measured every name since it was written.
- The twin must have **no transition on its position**, and the neighbours must have
  `transition: none` for the one render in which the DOM order changes (`reorderQuiet`).
- A drop reorders the row and React **re-inserts the moved node, which restarts any CSS
  animation on it** — that is why the badge's opening is armed by the switch alone
  (`badgeArmed`), not by the drag.
- Drag geometry is **synthetic** (`layoutRects` from the pack computed at press), never the
  DOM: on a select-on-press the row is mid-animation when the drag starts. It is a few px off
  the real widths; the all-pill settle at the drop is what absorbs that. Do not remove it.
- The strip's own left edge MOVES during a drag (the header re-centres it), so anything
  bar-local must be measured against the bar's rect at that moment, not one taken at press.
- To judge a drop, run the probe (`scripts/ui-review/drag-probe.mjs`, header has the usage)
  and read the table; do not record a clip and squint.
- `useLayoutEffect` with no deps in `SessionStrip` is the settle FLIP; it does a cheap null
  check every render on purpose.
- `data-session-idx` is a cross-process contract (main.ts tear-off placement, perf-lab).
  Never rename it; `data-session-id` sits beside it.
- Recording scenes need `?mode=workbench&child=1&…`; run `record.mjs` from the workspace
  root (paths are relative); a Vite server started before a dependency was linked caches
  the failed resolution — restart it.
- A youcoded worktree from before the games branch lacks `chess.js`; `cp -al` it from a
  sibling worktree that has it, never `npm ci` in a hardlinked tree.
- The old clip deck (`session-motion.json`, 8 clips) is kept as the record of what was
  rejected as a medium; it is not the review.
