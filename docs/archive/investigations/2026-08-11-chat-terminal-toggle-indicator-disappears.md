---
status: shipped
date: 2026-08-11
kind: investigation
scope: youcoded/desktop — HeaderBar chat/terminal toggle
---

# Chat/terminal toggle: sliding indicator disappears

**The ask:** explain a minor, intermittent visual bug Destin keeps hitting — the dark "selector"
pill behind the active Chat/Terminal option vanishes, leaving only the outer pill container and
the icon/label visible (screenshots showed a tan/beige pill with "Chat" text and a terminal icon,
no accent-colored highlight behind either option).

## Where the toggle lives

`youcoded/desktop/src/renderer/components/HeaderBar.tsx`. The wide-layout toggle
(`wideToggleElement`, lines 501-558) renders a pill container with an absolutely-positioned
sliding indicator `<div>` behind whichever button is active:

```tsx
<div ref={containerRef} className="relative flex bg-inset rounded-md p-0.5 gap-0.5">
  <div
    className="absolute top-0.5 bottom-0.5 bg-accent rounded-[var(--radius-toggle)] transition-[left,width] duration-300 ease-in-out"
    style={{
      left:  viewMode === 'chat' ? 'var(--pill-chat-left)'  : 'var(--pill-term-left)',
      width: viewMode === 'chat' ? 'var(--pill-chat-width)' : 'var(--pill-term-width)',
      opacity: measured ? 1 : 0,
    }}
  />
  <button ref={chatBtnRef} ...>...</button>
  <button ref={termBtnRef} ...>...</button>
</div>
```

The indicator's position/size come from four CSS custom properties
(`--pill-chat-left/width`, `--pill-term-left/width`), set imperatively via `container.style
.setProperty(...)` inside `measureEndpoints()` (lines 415-472) — not tracked in React state. This
is deliberate: earlier attempts (commits `ae5776ee`, `68462e9b`, `a0103014`, per the code comment)
tried to live-track the active button's rect and produced a "teleport" artifact. The current
design measures both endpoints once and CSS-transitions between the two cached values.

`measureEndpoints()` re-runs, and sets `measured = true`, on:
- mount (`useLayoutEffect`)
- `showToggleLabels` changing (icon-only vs. icon+label breakpoint, 560px)
- web font load
- `window` `resize`

Below 640px viewport width, `HeaderBar` swaps the whole toggle for a different component:

```tsx
const toggleElement = narrow
  ? <NarrowViewToggle viewMode={viewMode} onToggleView={onToggleView} />
  : wideToggleElement;
```

(`narrow` comes from `useNarrowViewport()`, a separate `matchMedia('(max-width: 639.98px)')`
listener — unrelated to the `window resize` listener `measureEndpoints()` uses.)

## Root cause

Because `narrow ? <NarrowViewToggle/> : wideToggleElement` swaps between **different element
types**, React doesn't resize the wide pill when the window crosses 640px and back — it unmounts
the old subtree and mounts a brand-new `<div ref={containerRef}>`. The new node has none of the
`--pill-*` custom properties on it; those were set on the discarded node.

`measured` is `HeaderBar` component state, not scoped to that DOM node's lifecycle, and it is only
ever set to `true` — never reset. So after a narrow→wide round trip, `measured` is still `true`
from before the remount, and the `opacity: measured ? 1 : 0` guard (meant to hide the indicator
until it has a real position) is bypassed for a node that hasn't been measured yet.

With the custom properties unset, `left: var(--pill-chat-left)` / `width: var(--pill-chat-width)`
are "guaranteed-invalid" at computed-value time and fall back to their initial values (`auto`/
`auto`). An absolutely-positioned, empty `<div>` with only `top`/`bottom` set and `left`/`width`
both `auto` collapses to effectively zero size — invisible, while the pill container and the two
buttons render normally. That matches the reported symptom exactly.

**Why it reads as intermittent rather than reliably broken:** any of the four re-measure triggers
(resize, label-breakpoint change, font load, remount-then-another-resize) fixes it silently by
recomputing and re-setting the custom properties on the current node. So the indicator is only
missing in the window between "crossed 640px and back" and "next trigger fires" — which, on a
desktop app where the window is rarely narrowed below 640px on purpose, might be a monitor swap,
a window snap, or a quick resize drag that overshoots and corrects.

No conditional-rendering / bad-index issue exists — the indicator `<div>` always renders once
`!narrow`; the failure mode is "renders with degenerate `left`/`width`," not "doesn't render."

## Broader finding: why theme switches make the control feel janky

The disappearing indicator is one symptom of a broader ownership problem: endpoint geometry is
cached on a DOM node, but no single lifecycle owns every event that can invalidate that geometry.
The current code attempts to enumerate invalidation events instead:

- initial mount;
- the header-width-driven `showToggleLabels` change;
- the one-shot `document.fonts.ready` promise; and
- `window.resize`.

That list is incomplete for theme changes. `ThemeProvider` applies a theme's `--font-sans`
immediately, then `applyThemeFont()` may replace the Google Fonts stylesheet. Two timing windows
follow:

1. The CSS variable can switch before the requested web font has loaded, so measurement records
   fallback-font dimensions.
2. `document.fonts.ready` describes current pending font work; it is not a subscription to every
   stylesheet/font introduced by later theme switches. `HeaderBar` registers it once because
   `measureEndpoints` has a stable identity.

A theme swap is also not specified to emit `window.resize`. The existing comment that it
"typically" causes a resize-like layout pass is not a correctness guarantee. The visible buttons
can adopt new glyph widths while the cached pill endpoints retain the previous font's values. This
explains the reported failure to resize properly during theme switching.

The measurement itself adds avoidable instability. `measureEndpoints()` temporarily rewrites the
*visible* labels into both completed states, forces layout after each state, restores the labels,
forces layout again, and then updates four CSS variables. Later calls can run while the control or
its containing header cluster is already transitioning. The result is a layout feedback chain:

`label width -> toggle width -> cluster ResizeObserver -> reservedWidth state -> cluster width transition`.

The cluster observer has a 2 px dedup guard, but it still intentionally reacts to the toggle's
300 ms label rollout. A stale endpoint correction during that period adds another moving target.

## Alternatives considered

### A. Add the missing invalidation triggers

Reset `measured` when `narrow` changes, re-measure when the active theme changes, and subscribe to
`document.fonts` `loadingdone` in addition to the current resize handling.

**Advantages:** smallest production diff; directly closes the known narrow remount and theme-font
holes.

**Rejected as the final architecture:** it preserves the forced-reflow sandwich and requires every
future geometry-changing input to be remembered as another trigger. React state would still claim
that an indicator is measured independently of the DOM node that holds the values. This is an
acceptable emergency patch, but not a robust answer to the general jank report.

### B. Continuously follow the visible active button

Observe both visible buttons with `ResizeObserver` and update the indicator as their widths animate.

**Advantages:** naturally sees theme, font, zoom, and layout changes.

**Rejected:** this is the architecture already tried in commits `ae5776ee` and `68462e9b`.
Observer callbacks changed the indicator target throughout the 300 ms label animation; combining
those updates with a CSS transition repeatedly restarted the transition and stuttered. Removing
the indicator transition made it track intermediate geometry, but a subsequent implementation
still encountered a teleport when it measured a transitional starting rect. The git history is
direct evidence against returning to live tracking of animated elements.

### C. Measure stable, non-animating endpoint copies (selected)

Keep the active label rollout, but separate **what animates** from **what is measured**. Render an
inert sizing layer containing the two completed layouts—Chat active and Terminal active—and observe
those stable endpoint elements. The visible buttons never need to be mutated for measurement, and
the observer does not fire on every frame of their rollout.

**Advantages:** event-complete for geometry changes without live-following an animation; preserves
the current visual design; removes forced layout writes against visible UI; scopes readiness to
the mounted wide toggle.

**Cost:** the sizing layer must share the visible control's layout primitives exactly. Structural
drift between visible and measuring markup would produce incorrect endpoints, so that parity must
be explicit and tested.

## Approved fix specification

### Goals

1. Preserve the current wide control: only the active option exposes its label, and the label rolls
   out while the accent indicator slides over 300 ms.
2. Make initial mount, wide/narrow remounts, theme/font changes, header label-mode changes, browser
   zoom, and container resizing converge on correct geometry without an enumerated list of theme
   events.
3. Never measure an element whose dimensions are currently animating.
4. Never mutate visible label styles to discover hypothetical layouts.
5. Keep the narrow `NarrowViewToggle` behavior and the 640 px source-of-truth breakpoint unchanged.

### Component boundary

Extract the wide control from `HeaderBar.tsx` into a focused `WideViewToggle` component. It accepts:

```ts
interface WideViewToggleProps {
  viewMode: 'chat' | 'terminal';
  onToggleView: (view: 'chat' | 'terminal') => void;
  showLabels: boolean;
}
```

`HeaderBar` continues to decide:

- whether the control is available for the active provider;
- whether narrow or wide markup is rendered;
- whether labels fit, using the existing measured 560 px header threshold; and
- which platform cluster receives the control.

`WideViewToggle` owns all indicator refs, endpoint geometry, readiness, observation, and animation
suppression. This is lifecycle isolation, not a generic segmented-control primitive; no other call
site currently needs this asymmetric rollout behavior.

### Visible control

The visible markup keeps the present interaction and styling:

- two native buttons with Chat and Terminal icons;
- only the active label has a nonzero `max-width` and full opacity;
- visible labels transition `max-width` and opacity over 300 ms;
- the accent indicator transitions between cached `left` and `width` endpoints over the same
  duration; and
- semantic colors and `--radius-toggle` remain theme-driven.

Add `aria-pressed={viewMode === ...}` to the two visible buttons so the segmented state is conveyed
without relying on color. The hidden sizing layer must not be the accessible representation.

### Stable sizing layer

Inside the same positioned container, render an absolutely positioned, invisible sizing layer
with two non-animating endpoint rows:

- **Chat endpoint:** Chat label fully expanded; Terminal label collapsed.
- **Terminal endpoint:** Chat label collapsed; Terminal label fully expanded.

Each row must use the same icon dimensions, button padding, gap, typography, font weight, and label
maximums as the visible row. Share class constants or a small internal button-layout helper so
these values cannot silently diverge. Do not duplicate independent class strings and rely on a
comment for parity.

The sizing layer requirements are:

- `aria-hidden="true"`;
- no buttons, handlers, tab stops, IDs, or duplicated accessible names—use inert `div`/`span`
  geometry boxes;
- `position: absolute`, `visibility: hidden`, `pointer-events: none`, and no contribution to the
  container's intrinsic size;
- no transitions or animations; and
- the same inherited font and theme context as the visible row.

`display: none` is forbidden because it has no measurable geometry. `opacity: 0` alone is also
insufficient because it still paints and can receive events unless separately disabled.

When `showLabels` is false, both endpoint rows represent the icon-only layout. The current visible
`hidden` label behavior is retained; the sizing layer mirrors that state without a transition.

### Geometry model and observer

Store both endpoints together:

```ts
type ToggleEndpoints = {
  chat: { left: number; width: number };
  terminal: { left: number; width: number };
};
```

One `ResizeObserver` observes the stable endpoint rows (and the shared container if relative offsets
require it). Its callback schedules at most one `requestAnimationFrame`; that frame reads all
rectangles first, derives both endpoint pairs relative to the visible container, validates them,
and then commits one endpoint update. Cancel a pending frame and disconnect the observer on
unmount.

An endpoint set is valid only when all values are finite, both widths are greater than zero, and
the container has a nonzero rendered box. Before the first valid set, invalid or temporarily
detached geometry leaves the indicator hidden. After readiness, an invalid sample is ignored so it
cannot overwrite the last valid values with zeros or make a correctly placed indicator disappear.

Deduplicate updates with a 0.5 px tolerance so harmless fractional jitter does not create React
renders or restart transitions. React state is appropriate because updates occur only when stable
environmental geometry changes—not every animation frame—and because the state belongs to the
mounted `WideViewToggle` instance. Do not store authoritative values solely as custom properties
on a replaceable DOM node.

A layout effect performs the first synchronous measurement after mount. The observer then owns
future invalidation. No `window.resize`, `document.fonts.ready`, theme-context dependency, or
`loadingdone` listener is needed: any event that actually changes layout changes the observed
stable boxes. Rendered geometry, rather than an incomplete event list, becomes the source of truth.

### Readiness and remount behavior

Readiness is derived from the current component instance having one valid `ToggleEndpoints` value.
The indicator remains `opacity: 0` until that value exists. Because narrow layout unmounts
`WideViewToggle`, a later wide mount starts with no endpoints and cannot inherit a stale `true`
boolean from `HeaderBar`.

On first valid measurement, place the indicator at the currently active endpoint with transitions
suppressed. It appears in the correct place rather than animating from `left: 0`, `auto`, or an
endpoint from a prior node.

### Interaction animation versus environmental correction

A view-mode change and a geometry correction are different operations:

- **View-mode change:** keep transitions enabled and move from the cached old endpoint to the cached
  new endpoint. The visible label rollout occurs in parallel.
- **Endpoint correction:** suppress the indicator's `left`/`width` transition for that commit, apply
  the corrected current endpoint, and re-enable transitions on the following animation frame. A
  theme/font/zoom correction must not look like an unintended selection animation.

Implement this with an explicit `data-geometry-syncing` attribute or class, not by rewriting the
indicator's inline `transition` string. Track and cancel the re-enable frame on unmount. A
correction detected during a user selection must converge to the latest `viewMode`; it must not
replay an obsolete destination captured by a callback closure.

### Motion preferences

The toggle must honor both YouCoded's `[data-reduced-effects]` setting and
`@media (prefers-reduced-motion: reduce)`. Under either condition, indicator movement and label
max-width/opacity changes are immediate. Color changes may remain immediate or retain a non-spatial
transition if the global policy permits it.

### Header cluster interaction

Do not alter the existing symmetric cluster reservation algorithm in this fix. The visible toggle
still changes intrinsic width during rollout, so the cluster observer and its 2 px dedup continue
to smooth the side reservation. The important change is that endpoint discovery no longer mutates
visible content or injects additional forced layouts into that chain.

A future design could reserve the larger endpoint width and animate only internal content to make
the entire header perfectly stationary, but that permanently consumes more session-strip space and
changes the approved layout behavior. It is outside this fix.

### Cross-platform constraints

The renderer is shared by Electron, remote browsers, and Android WebView. The component may use only
browser APIs already available there: React, DOM geometry, `ResizeObserver`, and
`requestAnimationFrame`. It must not use Electron IPC, Node APIs, platform-specific font events, or
`window.innerWidth`. `HeaderBar` remains responsible for the narrow source-of-truth hook.

### Same-bug-class audit

A repository-wide source search on 2026-08-11 found this toggle to be the only renderer component
that combines all three risky traits: cached `left`/`width` geometry, CSS transition between those
cached values, and one-shot font readiness. Other search hits have different ownership models:

- `ChatView` and `useChromeMeasurements` continuously publish observed current heights.
- Drawer width is authoritative persisted/user state, not a measurement cache.
- Terminal scrollbar geometry is continuously recalculated from its scroll model.
- Menus read geometry when they position/open rather than retaining animated endpoints.
- `MacTrafficLights` writes pill geometry imperatively, but its own observer follows the mounted
  header and it has no separate sticky React readiness flag.
- `SessionStrip` drag position is transient pointer-driven state, not font-dependent cached layout.

Do not introduce a generic geometry framework or refactor those components in this work. The
reusable lesson is narrower: measurement state must share a lifecycle with the DOM that consumes
it, and animated elements must not also be endpoint authorities.

## Test and verification contract

### Component tests

Create focused `WideViewToggle` tests with a controllable `ResizeObserver` and rectangle stubs.
Verify:

1. The indicator is hidden before any valid measurement.
2. Initial measurement places it at the active endpoint without a transition from a default value.
3. Chat -> Terminal and Terminal -> Chat select the cached destination and retain the 300 ms rollout
   classes when motion is allowed.
4. An observed endpoint resize updates both endpoints and snaps the active indicator under
   geometry-sync mode rather than playing a selection transition.
5. Multiple observer callbacks before the next frame produce one measurement/commit.
6. A zero-sized or detached measurement does not mark the component ready or replace valid data.
7. Unmount cancels pending frames and disconnects the observer.
8. Unmount/remount starts unready and cannot reuse old endpoints (the narrow -> wide regression).
9. `showLabels` false measures and renders icon-only endpoints; switching label mode recalibrates.
10. Rapid mode changes resolve to the latest `viewMode`, including when an environmental correction
    arrives in the same frame.
11. The sizing layer is `aria-hidden`, has no interactive descendants, and does not duplicate the
    visible labels in role/name queries.
12. Visible buttons expose correct `aria-pressed` values.
13. App reduced-effects and OS reduced-motion rules disable spatial transitions.

Do not assert real pixel layout in jsdom; drive deterministic rectangle values through stubs and
assert geometry selection, lifecycle, and scheduling. A small pure `measureToggleEndpoints()`
helper may be extracted if it makes finite/nonzero validation independently testable.

### Existing guards

Run:

```bash
bash scripts/verify.sh <worktree>
```

This is the required desktop verdict and covers type checking, related Vitest tests, knip, ESLint,
and ast-grep invariants. Also run the existing `NarrowViewToggle.test.tsx` explicitly if it is not
selected as related, because the wide/narrow branch must retain target-view behavior.

Because the React renderer is shared, build the web UI after desktop checks:

```bash
cd youcoded
./scripts/build-web-ui.sh
```

No Kotlin behavior changes are expected. An Android Gradle build is not required solely for this
component extraction unless the web UI build exposes a platform issue or implementation changes a
shared bridge surface.

### Final interactive verification

Use an isolated development instance only:

```bash
bash scripts/run-dev.sh <worktree> --label "Toggle Geometry"
```

Destin should visually verify:

- repeated rapid Chat/Terminal switching;
- switching between the default font and community themes using Comfortaa, Nunito, and Space
  Grotesk, including the first switch before a font is cached;
- resizing across the 560 px label threshold;
- resizing below 640 px and back above it;
- non-100% zoom;
- reduced-effects on/off; and
- no session-strip jump, indicator disappearance, stale width, teleport, or late corrective slide.

Interactive cursor/timing verification should not be replaced with a scripted multi-window rig
unless Destin asks for one.

## Acceptance criteria

The fix is complete when:

- the active label rollout remains visually equivalent to the current design;
- the indicator always initializes against the currently mounted wide control;
- theme/font/zoom/layout changes self-correct from observed stable geometry;
- environmental corrections do not animate as user selections;
- no visible element is temporarily mutated or synchronously reflowed to calculate endpoints;
- the previous live-follow stutter/teleport architecture is not reintroduced;
- narrow behavior and header reservation remain unchanged;
- reduced-motion settings are respected; and
- automated checks pass, followed by Destin's isolated-dev visual approval.

Design approved by Destin on 2026-08-11. **Shipped the same day** in youcoded
`a39e287d` (plan: `docs/archive/plans/2026-08-11-chat-terminal-toggle-geometry.md`).
All 13 component-test contract items are pinned by
`desktop/src/renderer/components/WideViewToggle.test.tsx` and
`desktop/tests/toggle-motion-policy.test.ts`.
