---
status: draft
created: 2026-08-07
repo: youcoded (desktop)
branch: perf/transcript-hover-frames
worktree: /home/destin/youcoded-dev/worktrees/hover-paint
---

# Animation Frame-Budget Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining unbudgeted continuous-animation and hover-sweep CPU costs in the desktop renderer, without any noticeable change to how the UI looks.

**Architecture:** The 2026-07-30 investigation established that on a high-refresh display any smoothly-animating element makes Chromium present a frame at the full refresh rate (~29–33% of one core at 180 Hz), that the cost is per-frame rather than per-element, and that layer promotion does not help. Three levers reduce it, and this plan applies whichever is visually free for each case: **(1) change the mechanism** — animate a compositable property instead of a layout one, or narrow `transition: all` to the properties that actually change; **(2) stop presenting when nobody can see it** — pause on `visibilitychange`; **(3) `steps()` quantization** — used only on short, subtle, non-motion transitions where the quantization is imperceptible. Motion animations (mascot character loops) are deliberately *not* quantized; they get lever 2 instead.

**Tech Stack:** React 19 + Tailwind v4 (`@import "tailwindcss"`, no config file), hand-written unlayered CSS in `src/renderer/styles/`, Vitest for source-text guard tests.

## Global Constraints

- **Every rule added to `globals.css` must be unlayered** (not inside `@layer`). Tailwind emits all utilities inside `@layer utilities`, and unlayered CSS beats layered CSS regardless of specificity. This is how a plain `.stepped-hover` rule overrides `transition-colors`'s timing function without `!important`. The inverse trap — a Tailwind `hover:` utility silently losing to unlayered `.layer-surface` — is documented at `globals.css:1072-1082`.
- **`steps(N)` applies per keyframe segment**, not per animation. A `0% / 50% / 100%` keyframe set at `steps(8)` yields 8 changes per segment.
- **Never quantize motion.** `steps()` on translate/rotate/scale reads as juddering. It is only acceptable here on `background-color`, `border-color`, `color`, `opacity`, and `box-shadow`, and on the one 2% scale in `.hover-lift` (verified by eye in Task 8).
- **Do not touch `buddy.css`'s `buddy-breathe`.** It is an `alwaysOnTop` window, so `visibilitychange` never fires for it, and quantizing character breathing is visible. It is an accepted cost, recorded in Task 1's exceptions map.
- **Verification command for every task:** `bash scripts/verify.sh worktrees/hover-paint` from `/home/destin/youcoded-dev`. It runs tsc, affected vitest, knip, eslint, and the ast-grep scan.
- **Known pre-existing failure:** `bash scripts/verify.sh` currently reports `FAIL invariants (ast-grep)` with two `tool-bounds-not-hand-rolled` errors in `src/main/harness/tools/web-fetch.ts:160,169`. This is present on `master` and unrelated to this plan. Treat verify as green if that is the *only* failure and the count is still exactly 2.
- **Prior art already on this branch:** the transcript hover fix (`globals.css`, `.timeline-entry .transition-colors, .timeline-entry .transition-opacity { transition-timing-function: steps(4); }`) is already committed. Tasks below extend the same idea; do not duplicate that rule.

---

### Task 1: Close the guard-test blind spots

The existing guard (`tests/animation-frame-budget.test.ts`) is thorough about *inline TSX* animations but has two holes: it cannot see Tailwind arbitrary-value classes like `animate-[version-glow_2s_ease-in-out_infinite]`, and it spot-checks only three CSS animations by name rather than sweeping the stylesheets. A real violation is sitting in the first hole right now.

This task is written test-first and is **expected to fail at the end of Step 2** — Task 2 makes it pass.

**Files:**
- Modify: `desktop/tests/animation-frame-budget.test.ts` (append two `it` blocks inside the existing `describe`, after the `bans NEW inline infinite animations` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ANIMATION_EXCEPTIONS`, a `Record<string, string>` mapping animation-name → written reason. Tasks 2 and 6 both edit this map.

- [ ] **Step 1: Write the failing assertions**

Append inside the `describe('perpetual animations are frame-budgeted', ...)` block in `desktop/tests/animation-frame-budget.test.ts`, immediately before the closing `});`:

```typescript
  // ── Blind spots closed 2026-08-07 ──
  // The two assertions below exist because a real violation
  // (`animate-[version-glow_2s_ease-in-out_infinite]`, StatusBar.tsx) sat
  // undetected in a suite written specifically to catch it. The inline-style
  // sweep above only matches `animation: '...'` string literals, so a Tailwind
  // arbitrary-value class is invisible to it, and CSS keyframes were asserted
  // three-by-name rather than swept.

  // Infinite CSS animations that deliberately do NOT carry steps(), each with
  // the reason. An entry here is a decision, not an oversight — adding one
  // should require the same thought as quantizing the animation instead.
  const ANIMATION_EXCEPTIONS: Record<string, string> = {
    'rig-breathe': 'character motion — steps() reads as juddering; gated on visibilitychange instead (MascotRig)',
    'rig-bounce-loop': 'character motion — see rig-breathe',
    'rig-float-loop': 'character motion — see rig-breathe',
    'rig-sleep-loop': 'character motion — see rig-breathe',
    'rig-dizzy-sway': 'character motion — see rig-breathe',
    'comp-twinkle': 'theme companion SVG — visibility-gated with the scene',
    'comp-spin': 'theme companion SVG — 26s period, visibility-gated with the scene',
    'comp-pulse': 'theme companion SVG — visibility-gated with the scene',
    'comp-bob': 'theme companion SVG — visibility-gated with the scene',
    'mascot-comp-float': 'theme companion float — visibility-gated with the scene',
    'buddy-breathe': 'buddy window is alwaysOnTop so visibilitychange never fires, and quantizing breathing is visible; accepted cost of an opt-in feature',
    'model-load-sweep': 'bounded by the model load, and already disabled by Reduced Effects + prefers-reduced-motion',
  };

  it('bans Tailwind arbitrary-value infinite animations without steps()', () => {
    // `animate-[name_2s_ease-in-out_infinite]` — Tailwind arbitrary value, so
    // it never appears as an `animation:` property in TSX and the inline sweep
    // above cannot see it.
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e: string) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
      });
    const offenders: string[] = [];
    for (const f of walk(join(RENDERER, 'components'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/animate-\[([^\]]*infinite[^\]]*)\]/g)) {
        const name = m[1].split('_')[0];
        if (!/steps\(/.test(m[1]) && !(name in ANIMATION_EXCEPTIONS)) {
          offenders.push(`${f.split('/components/')[1]}: ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sweeps every stylesheet for unbudgeted infinite animations', () => {
    // Replaces three-by-name spot checks with an actual sweep, so a NEW
    // infinite keyframe in any stylesheet has to be a deliberate decision.
    const sheets = ['globals.css', 'mascot.css', 'buddy.css'];
    const offenders: string[] = [];
    for (const sheet of sheets) {
      const css = read('styles', sheet);
      for (const m of css.matchAll(/animation:\s*([\w-]+)([^;]*infinite[^;]*);/g)) {
        const [, name, rest] = m;
        if (!/steps\(/.test(rest) && !(name in ANIMATION_EXCEPTIONS)) {
          offenders.push(`${sheet}: ${name}${rest}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail on the real violation**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npx vitest run tests/animation-frame-budget.test.ts`

Expected: the Tailwind assertion FAILS with an offender line containing `StatusBar.tsx: version-glow_2s_ease-in-out_infinite`. The stylesheet sweep should PASS (every infinite CSS animation is either steps()-timed or in the exceptions map). If the sweep also fails, read the offender — it is a real finding; add it to this plan rather than silently adding it to the exceptions map.

- [ ] **Step 3: Commit the failing guard**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint
git add desktop/tests/animation-frame-budget.test.ts
git commit -m "test(perf): guard Tailwind arbitrary + stylesheet-wide infinite animations

The suite was written to catch unbudgeted perpetual animations but only
swept inline \`animation: '...'\` strings, so a Tailwind arbitrary-value
class (animate-[version-glow_2s_ease-in-out_infinite]) sat undetected in
it. Adds an arbitrary-value sweep and replaces three-by-name CSS spot
checks with a stylesheet sweep plus a documented exceptions map.

Fails on version-glow, which the next commit fixes."
```

---

### Task 2: Budget the `version-glow` update pill

The only fully unmitigated infinite animation in the main window: smooth `ease-in-out` on `box-shadow` (a main-thread paint property), in always-visible chrome, running from update-detection until the user updates — days to weeks. Not covered by Reduced Effects.

`steps(16)` over a 2 s period is 8 shadow changes per second on a slow glow — below the threshold where a soft blur-radius change reads as stepped.

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx:1237`

**Interfaces:**
- Consumes: `ANIMATION_EXCEPTIONS` from Task 1 (only to confirm `version-glow` is deliberately *not* in it).
- Produces: nothing consumed later.

- [ ] **Step 1: Replace the timing function**

In `desktop/src/renderer/components/StatusBar.tsx`, line 1237, change:

```tsx
              ? 'bg-[rgba(234,179,8,0.12)] border-[rgba(234,179,8,0.5)] hover:bg-[rgba(234,179,8,0.22)] animate-[version-glow_2s_ease-in-out_infinite]'
```

to:

```tsx
              // steps(16): this glow runs from update-detection until the user
              // actually updates — days to weeks — in always-visible chrome, and
              // Reduced Effects does not gate it. Smooth ease-in-out here means
              // presenting at the panel's full refresh rate for that whole
              // period (~29-33% of a core at 180Hz). 8 shadow changes/sec on a
              // soft 4->10px blur radius is imperceptible. See
              // globals.css "Perf: frame-budget" note.
              ? 'bg-[rgba(234,179,8,0.12)] border-[rgba(234,179,8,0.5)] hover:bg-[rgba(234,179,8,0.22)] animate-[version-glow_2s_steps(16)_infinite]'
```

- [ ] **Step 2: Run the guard to verify it now passes**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npx vitest run tests/animation-frame-budget.test.ts`

Expected: PASS, all tests green.

- [ ] **Step 3: Verify Tailwind emits the arbitrary value**

Tailwind arbitrary values cannot contain unescaped spaces; underscores become spaces. `steps(16)` has no space, so `animate-[version-glow_2s_steps(16)_infinite]` is valid. Confirm the generated CSS actually contains it:

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npm run build 2>&1 | tail -5 && grep -ro 'steps(16)' dist/renderer/assets/*.css | head -3`

Expected: at least one `steps(16)` hit in the built CSS. If there are zero hits, Tailwind rejected the arbitrary value — fall back to a named class: add `.version-glow-anim { animation: version-glow 2s steps(16) infinite; }` (unlayered) to `globals.css` next to the `@keyframes version-glow` block at `globals.css:1391`, and use `'... version-glow-anim'` in the TSX instead.

- [ ] **Step 4: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint
git add desktop/src/renderer/components/StatusBar.tsx
git commit -m "perf(status-bar): frame-budget the version-glow update pill

Smooth ease-in-out on box-shadow, infinite, in always-visible chrome,
for as long as an update is pending — days to weeks of presenting at the
panel's full refresh rate. steps(16) over 2s is 8 changes/sec on a soft
blur-radius pulse: no visible difference, ~1/8 the frames."
```

---

### Task 3: Stop the model-load bar animating a layout property

`model-load-sweep` animates `left`, which is not compositable and forces a **layout pass every frame** — the most expensive per-frame animation in the app. `transform: translateX()` produces an identical visual and skips layout entirely. This is a pure mechanism swap with no quantization and no visual change.

The track is `width: 35%` positioned at `left: -35%`. In transform terms it starts at `translateX(0)` from a `left: 0` origin offset by its own width, and ends past the right edge of the container. Because the element is `width: 35%` of the track, `100%` in `translateX` equals 35% of the track — so the end position must be expressed relative to the *container*, which `translateX` cannot do directly. The fix is to keep the element at `left: 0` and translate from `-100%` (fully off the left edge, i.e. its own width) to the container width expressed as a multiple of the element width: `100/35 ≈ 2.857`, so `translateX(285.7%)`.

**Files:**
- Modify: `desktop/src/renderer/styles/globals.css:609-612` (the `@keyframes model-load-sweep` block)
- Modify: `desktop/src/renderer/styles/globals.css:617-626` (the `.model-load-track::after` rule)
- Modify: `desktop/src/renderer/styles/globals.css` — both static-fallback bodies (`[data-reduced-effects] .model-load-track::after` and the `prefers-reduced-motion` block), which currently set `left: 0`
- Check: `desktop/src/renderer/styles/globals.css` — the `.model-load-finalize::after` rule near line 675 uses the same keyframes; update it the same way if it also sets `left`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Rewrite the keyframes**

Replace the block at `globals.css:609-612`:

```css
@keyframes model-load-sweep {
  0%   { left: -35%; }
  100% { left: 100%; }
}
```

with:

```css
/* translateX, not `left` — `left` is not compositable and forces a layout pass
   on every presented frame, which on a 180Hz panel is the most expensive
   per-frame animation shape in the app. The element is width:35% of the track,
   so translateX percentages are relative to 35% of the container: -100% parks
   it fully off the left edge and 285.7% (100/35) clears the right edge.
   Visually identical to the old `left` sweep. */
@keyframes model-load-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(285.7%); }
}
```

- [ ] **Step 2: Move the element's resting position off `left`**

In the `.model-load-track::after` rule (`globals.css:617-626`), change `left: -35%;` to `left: 0;` so the transform origin is the track's left edge. The rule becomes:

```css
.model-load-track::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 35%;
  left: 0;
  border-radius: 9999px;
  background: var(--accent);
  animation: model-load-sweep 1.1s ease-in-out infinite;
}
```

- [ ] **Step 3: Fix both static fallbacks**

The two reduced-motion bodies set `left: 0; width: 100%` to render a static filled track. With the element now at `left: 0` by default they must also clear any transform, or a paused animation could leave it translated. In **both** the `[data-reduced-effects] .model-load-track::after` body and the `@media (prefers-reduced-motion: reduce) .model-load-track::after` body, change:

```css
  animation: none;
  left: 0;
  width: 100%;
  opacity: 0.5;
```

to:

```css
  animation: none;
  left: 0;
  transform: none;
  width: 100%;
  opacity: 0.5;
```

The file's own comment at `globals.css:640-643` warns these two bodies must stay identical — keep them so.

- [ ] **Step 4: Apply the same treatment to `.model-load-finalize::after`**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && grep -n 'model-load-finalize' -A 14 src/renderer/styles/globals.css`

If that rule sets `left: -35%` (or any `left` other than `0`) and uses `model-load-sweep`, apply the identical edit: `left: 0`, and add `transform: none` to its reduced-motion fallback. If it uses its own keyframes, convert those to `translateX` the same way. Record what you found in the commit message.

- [ ] **Step 5: Verify visually in the workbench**

Run: `cd /home/destin/youcoded-dev && bash scripts/run-workbench.sh`

Open the scenario that shows the local-model loading bar. Expected: the highlight sweeps left-to-right across the full track exactly as before, entering fully off-screen-left and exiting fully off-screen-right. If the sweep starts or ends visibly inside the track, the `285.7%` needs adjusting — recompute as `100 / <element width percent>`.

- [ ] **Step 6: Run verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/hover-paint
cd worktrees/hover-paint
git add desktop/src/renderer/styles/globals.css
git commit -m "perf(model-load): sweep with transform instead of left

Animating \`left\` is not compositable and forces a layout pass on every
presented frame — the most expensive per-frame animation shape in the
app, running for the whole duration of a local model load (minutes for a
large GGUF). translateX is compositor-only and pixel-identical here.
Both reduced-motion fallbacks gain \`transform: none\` so a disabled
animation cannot leave the bar translated."
```

---

### Task 4: Narrow the session pill's `transition: all`

`SessionStrip.tsx:801` animates `all` with a springy overshoot curve. `all` animates every animatable property that changes — including layout properties — when only three actually change: `transform` (the hover scale), `border-color`, and `background-color`. Narrowing the list is visually identical and strictly cheaper. The springy cubic-bezier is preserved, so the character of the interaction does not change.

**Files:**
- Modify: `desktop/src/renderer/components/SessionStrip.tsx:800-802`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Replace the shorthand with an explicit property list**

In `desktop/src/renderer/components/SessionStrip.tsx`, change:

```tsx
                style={{
                  transition: isBeingDragged
                    ? 'opacity 150ms, transform 150ms'
                    : 'all 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
```

to:

```tsx
                style={{
                  // Explicit property list, not `all`: `all` animates every
                  // animatable property that changes, including layout ones,
                  // and each animating property is presented at the panel's
                  // full refresh rate. Only these three actually change on
                  // hover/active. The springy overshoot curve is unchanged, so
                  // this is visually identical.
                  transition: isBeingDragged
                    ? 'opacity 150ms, transform 150ms'
                    : 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
```

- [ ] **Step 2: Confirm nothing else on the pill relied on `all`**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && sed -n '780,815p' src/renderer/components/SessionStrip.tsx`

Read the `className` and `style` on that element. Expected: the only properties that differ between states are the border colour class, the background colour class, `transform`, `opacity` (drag only, already handled by the drag branch), and `boxShadow`. **If `boxShadow` changes between active and inactive states**, add `, box-shadow 150ms cubic-bezier(0.34, 1.56, 0.64, 1)` to the list — otherwise the active pill's glow will snap on instead of easing.

- [ ] **Step 3: Verify by eye in the dev instance**

Run: `cd /home/destin/youcoded-dev && bash scripts/run-dev.sh hover-paint --label "Hover Paint Fix"`

Hover across the session pills in the header. Expected: identical springy scale-up, identical border/background fade, identical active-pill glow behaviour. This is a *visual equivalence* check — ask Destin to confirm rather than asserting it yourself.

- [ ] **Step 4: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint
git add desktop/src/renderer/components/SessionStrip.tsx
git commit -m "perf(session-strip): transition explicit properties, not all

\`transition: all\` animates every animatable property that changes,
layout properties included, and every animating property presents at the
panel's full refresh rate. Only transform/border-color/background-color
change on these pills. Same springy curve, same look, fewer properties
driving frames."
```

---

### Task 5: Add a `.stepped-hover` utility and apply it to the dense hover surfaces

The transcript fix already on this branch is scoped with `.timeline-entry` descendant selectors. That does not generalise to surfaces whose hover lives in a component's Tailwind classes or an inline style. This task introduces one named utility so every dense-list surface opts in the same way and the choice is greppable.

Density is the criterion. A one-off button hovers once; a 30-tile drawer grid gets swept.

**Files:**
- Modify: `desktop/src/renderer/styles/globals.css` (add `.stepped-hover` next to `.card-interactive`, around line 1083; edit `.hover-lift` at 1063 and `.card-interactive` at 1084)
- Modify: `desktop/src/renderer/components/ui/SettingRow.tsx:51`
- Modify: `desktop/src/renderer/components/SessionStrip.tsx:921-926` (dropdown row inline style)
- Modify: `desktop/tests/animation-frame-budget.test.ts` (add a guard for the utility)

**Interfaces:**
- Consumes: `ANIMATION_EXCEPTIONS` from Task 1 (unchanged here).
- Produces: the class name `stepped-hover`, referenced by Task 8's verification.

- [ ] **Step 1: Write the failing guard**

Append inside the `describe` block in `desktop/tests/animation-frame-budget.test.ts`:

```typescript
  it('defines .stepped-hover and applies it to the dense hover surfaces', () => {
    // The transcript hover fix (steps(4) scoped to .timeline-entry) generalises
    // to any surface where many hover targets are swept by one pointer motion.
    // These four are the app's dense lists; a one-off button is deliberately
    // NOT in scope — it animates once, and a smooth fade there is free.
    const globals = read('styles', 'globals.css');
    expect(globals).toMatch(/\.stepped-hover\s*\{[^}]*transition-timing-function:\s*steps\(/);
    expect(globals).toMatch(/\.hover-lift\s*\{[^}]*steps\(/);
    expect(globals).toMatch(/\.card-interactive\s*\{[^}]*steps\(/);

    const settingRow = readFileSync(join(RENDERER, 'components', 'ui', 'SettingRow.tsx'), 'utf8');
    expect(settingRow).toMatch(/ROW_BASE\s*=\s*'[^']*stepped-hover/);

    const strip = readFileSync(join(RENDERER, 'components', 'SessionStrip.tsx'), 'utf8');
    expect(strip).toMatch(/transition:\s*'opacity 150ms steps\(4\), background 150ms steps\(4\)'/);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'stepped-hover'`

Expected: FAIL on the first assertion — `.stepped-hover` does not exist yet.

- [ ] **Step 3: Define the utility and quantize the two shared rules**

In `desktop/src/renderer/styles/globals.css`, change `.hover-lift` (line 1063) from:

```css
.hover-lift {
  transition: transform 200ms ease;
}
```

to:

```css
.hover-lift {
  transition: transform 200ms steps(5);
}
```

Change `.card-interactive` (line 1084) from:

```css
.card-interactive {
  transition: background-color 120ms ease;
}
```

to:

```css
.card-interactive {
  transition: background-color 120ms steps(4);
}
```

Then add immediately after the `.card-interactive:hover` media block:

```css
/* Perf: frame-budget hover transitions on DENSE surfaces — lists and grids
   where one pointer sweep crosses many targets at once, keeping a dozen
   overlapping transitions alive continuously. Measured 2026-08-07 at ~33% of
   one core while circling the cursor over a tool-heavy transcript, with the
   compositor presenting a full 180Hz and the GPU at 13% — i.e. paint driven by
   frame count, not load. Layer promotion does NOT help (see the steps() note
   above: measured useless, 29.8% -> 27.8%); presenting fewer frames is the only
   lever that works.
   Deliberately NOT global: a one-off button animates once and its smooth fade
   costs nothing worth reclaiming. Applied only where density x sweep is real —
   the drawer tile grid, the file/marketplace grids, settings rows, and the
   session dropdown. Unlayered so it beats Tailwind's `transition-*` utilities
   (which live in @layer utilities) without !important.
   steps(4) over 120-200ms is 4 discrete steps on a subtle tint: imperceptible
   at these contrast levels, ~7x fewer presented frames. */
.stepped-hover {
  transition-timing-function: steps(4);
}
```

- [ ] **Step 4: Apply the utility to settings rows**

In `desktop/src/renderer/components/ui/SettingRow.tsx`, line 51, change:

```typescript
const ROW_BASE = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50 text-left transition-colors';
```

to:

```typescript
// `stepped-hover` frame-budgets the hover fade — SettingsPanel renders 33 of
// these rows inside the app's largest backdrop-filter region, so a pointer
// sweep down the list keeps many fades alive at once. See globals.css.
const ROW_BASE = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50 text-left transition-colors stepped-hover';
```

- [ ] **Step 5: Apply to the session dropdown rows**

These use an inline `transition`, which no stylesheet rule can override without `!important`, so the timing goes in the inline value. In `desktop/src/renderer/components/SessionStrip.tsx`, change:

```tsx
                    style={{
                      animation: `row-fade-in 100ms ease both`,
                      animationDelay: `${idx * 20}ms`,
                      transition: 'opacity 150ms, background 150ms',
                      cursor: 'default',
                    }}
```

to:

```tsx
                    style={{
                      animation: `row-fade-in 100ms ease both`,
                      animationDelay: `${idx * 20}ms`,
                      // steps(4) inline, not via .stepped-hover: an inline
                      // transition cannot be overridden by a stylesheet rule
                      // without !important. Users scan this list top-to-bottom
                      // to pick a session, so every row's fade fires in one
                      // sweep, inside a .glass-overlay backdrop-filter.
                      transition: 'opacity 150ms steps(4), background 150ms steps(4)',
                      cursor: 'default',
                    }}
```

- [ ] **Step 6: Confirm the drawer tiles and grids are covered**

`.card-interactive` and `.hover-lift` are shared rules; verify which components actually wear them rather than assuming:

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && rg -n 'card-interactive|hover-lift' src/renderer --type tsx`

Expected: hits in the skill/command drawer tiles (`SkillCard.tsx`, `CommandDrawer.tsx`), the project file grid (`project-view/tabs/FilesTab.tsx`), and the marketplace grid (`marketplace/MarketplaceCard.tsx`). Record the actual list in the commit message. If a dense grid appears that wears *neither* class, add `stepped-hover` to its item className.

- [ ] **Step 7: Run the guard and verify**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npx vitest run tests/animation-frame-budget.test.ts
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/hover-paint
```

Expected: all animation-frame-budget tests PASS. verify.sh green except the known 2 pre-existing ast-grep errors.

- [ ] **Step 8: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint
git add desktop/src/renderer/styles/globals.css desktop/src/renderer/components/ui/SettingRow.tsx desktop/src/renderer/components/SessionStrip.tsx desktop/tests/animation-frame-budget.test.ts
git commit -m "perf(hover): frame-budget hover fades on the dense list surfaces

Generalises the transcript fix to the other surfaces where one pointer
sweep crosses many hover targets: drawer tile grid, file grid,
marketplace grid, settings rows, session dropdown. Adds a .stepped-hover
utility so the choice is greppable, and quantizes the two shared rules
(.hover-lift, .card-interactive) that already cover the three grids.

Deliberately not global — a one-off button animates once."
```

---

### Task 6: Pause mascot animation when the window is not visible

The mascot runs two concurrent per-frame drivers: one of five infinite CSS keyframe loops on the rig SVG, and a 33 ms `setInterval` writing limb transforms. Neither stops when the window is hidden. `steps()` is the wrong lever here — quantizing character motion is visible — so this uses the visibility lever, which is free by construction: you cannot notice an animation you cannot see.

`ThemeEffects.tsx:243-250` is the established pattern in this codebase and its comment explains why `visibilityState` is the right gate rather than focus (it stays `visible` on a secondary monitor).

**Critical correctness detail:** `stepSpring` integrates real elapsed time via `dt`. If the interval is paused for ten minutes and resumed without resetting the timestamp, the first tick computes `dt ≈ 600000` and the springs explode. The `last` reference **must** be reset on resume.

**Files:**
- Modify: `desktop/src/renderer/components/mascot/MascotRig.tsx` (the `useEffect` beginning at line 257)
- Modify: `desktop/src/renderer/styles/mascot.css` (add a paused-state rule)
- Modify: `desktop/tests/animation-frame-budget.test.ts` (add a guard)

**Interfaces:**
- Consumes: `ANIMATION_EXCEPTIONS` from Task 1 — the five `rig-*` names are already listed there with "gated on visibilitychange instead", which this task makes true.
- Produces: the attribute `data-doc-hidden` on `<html>`, and the CSS rule that keys off it.

- [ ] **Step 1: Write the failing guard**

Append inside the `describe` block in `desktop/tests/animation-frame-budget.test.ts`:

```typescript
  it('pauses mascot motion when the document is hidden', () => {
    // The rig loops are character motion, so they are exempt from steps() in
    // ANIMATION_EXCEPTIONS above. That exemption is only honest if they stop
    // when nobody can see them — otherwise they present at full refresh rate
    // forever. The interval must also reset its timestamp on resume, or
    // stepSpring integrates the entire hidden period as one dt and the springs
    // explode on the first visible frame.
    const rig = read('components', 'mascot', 'MascotRig.tsx');
    expect(rig).toMatch(/visibilitychange/);
    expect(rig).toMatch(/last\s*=\s*performance\.now\(\)/);

    const mascotCss = read('styles', 'mascot.css');
    expect(mascotCss).toMatch(/data-doc-hidden[^{]*\{[^}]*animation-play-state:\s*paused/);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'pauses mascot'`

Expected: FAIL — `MascotRig.tsx` contains no `visibilitychange`.

- [ ] **Step 3: Gate the interval on visibility**

In `desktop/src/renderer/components/mascot/MascotRig.tsx`, inside the `useEffect` that starts at line 257 (`if (reducedEffects) return;`), locate where the idle interval is created. Replace the single `setInterval(...)` creation and the effect's cleanup with a start/stop pair driven by `visibilitychange`:

```typescript
    // Pause idle motion while the document is hidden. The rig loops are
    // character motion, so they are deliberately exempt from steps()
    // quantization (juddery breathing is worse than the CPU) — which makes
    // this gate the thing that keeps that exemption honest. Without it, a
    // minimized window still presents ambient sway at the panel's full refresh
    // rate forever. visibilityState, not focus: it stays 'visible' on a
    // secondary monitor, where the user CAN still see the mascot.
    // Matches the ThemeEffects pattern (ThemeEffects.tsx:243).
    let idleTimer: ReturnType<typeof setInterval> | null = null;
    const startIdle = () => {
      if (idleTimer !== null) return;
      // Reset the clock BEFORE the first tick. stepSpring integrates real
      // elapsed time, so resuming after a 10-minute hide would otherwise feed
      // it dt = 600000ms in one step and fling every spring off-model.
      last = performance.now();
      idleTimer = setInterval(() => step(performance.now()), IDLE_TICK_MS);
    };
    const stopIdle = () => {
      if (idleTimer === null) return;
      clearInterval(idleTimer);
      idleTimer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') startIdle();
      else stopIdle();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') startIdle();
```

and in the effect's cleanup return, ensure both the listener and the timer are released:

```typescript
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopIdle();
      if (raf) cancelAnimationFrame(raf);
    };
```

**Before writing this, read the existing effect body in full** (`sed -n '257,400p' src/renderer/components/mascot/MascotRig.tsx`) and adapt to the real variable names — `step`, `last`, `raf`, and `IDLE_TICK_MS` are the names visible at the time of writing, and the existing cleanup may already cancel the rAF. Do not delete the rAF drag chain; it is correct and the guard test asserts it stays rAF-driven.

The existing comment block at `MascotRig.tsx:250-256` states "the interval never stops" as a freeze-safety property — that reasoning is about the drag→idle handoff, not about hidden windows. **Update that comment** to say the interval now also stops while the document is hidden, and that drag cannot be in flight while hidden.

- [ ] **Step 4: Pause the CSS loops too**

The interval is only one of the two drivers; the five `rig-*` keyframe loops run in CSS and must pause independently. Add to `desktop/src/renderer/styles/mascot.css`, immediately after the `[data-effects-off='1']` block at line 85:

```css
/* Hidden document: stop the rig and companion keyframe loops. These are
   character motion and so are exempt from steps() budgeting — this rule is
   what makes that exemption honest, since an unpaused smooth loop presents at
   the panel's full refresh rate whether or not anyone is looking.
   Set by index.tsx on visibilitychange. */
html[data-doc-hidden='1'] svg #rig-root,
html[data-doc-hidden='1'] .mascot-comp,
html[data-doc-hidden='1'] .mascot-comp * {
  animation-play-state: paused;
}
```

- [ ] **Step 5: Set the attribute from the app entry point**

In `desktop/src/renderer/index.tsx`, after the existing pre-mount theme/font application, add:

```typescript
// Mirror document visibility onto <html> so CSS keyframe loops can pause.
// JS drivers gate themselves on visibilitychange directly; CSS animations have
// no equivalent hook, so they key off this attribute (see mascot.css).
const syncDocHidden = () => {
  document.documentElement.setAttribute(
    'data-doc-hidden',
    document.visibilityState === 'visible' ? '0' : '1',
  );
};
document.addEventListener('visibilitychange', syncDocHidden);
syncDocHidden();
```

- [ ] **Step 6: Run the guard and the full animation suite**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && npx vitest run tests/animation-frame-budget.test.ts
```

Expected: all PASS, including the pre-existing `MascotRig runs rAF only for the drag chain, idle from an interval` assertion — that one requires `setInterval(` to still be present and every `requestAnimationFrame(` call to target `rafTick`. If your edit renamed the interval callback, that test may fail; keep `setInterval(` in the source.

- [ ] **Step 7: Verify the resume behaviour by hand**

Run: `cd /home/destin/youcoded-dev && bash scripts/run-dev.sh hover-paint --label "Hover Paint Fix"`

With a rig mascot visible (the "No Active Session" welcome screen renders one), minimize the window, wait ~60 seconds, restore it. Expected: the mascot resumes breathing smoothly from its current pose. **A visible snap, jolt, or limbs flying off-model means the `last = performance.now()` reset is missing or is being applied after the first tick.** This is the one behaviour in this plan that a unit test cannot catch — ask Destin to confirm it.

- [ ] **Step 8: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/hover-paint
git add desktop/src/renderer/components/mascot/MascotRig.tsx desktop/src/renderer/styles/mascot.css desktop/src/renderer/index.tsx desktop/tests/animation-frame-budget.test.ts
git commit -m "perf(mascot): pause idle motion while the document is hidden

The rig ran two per-frame drivers — five infinite CSS loops and a 33ms
interval writing limb transforms — neither of which stopped when the
window was hidden, so a minimized window presented ambient sway at the
panel's full refresh rate indefinitely.

steps() is the wrong lever for character motion (juddery breathing is
worse than the CPU), so this uses the visibility lever instead, which is
free by construction. The interval resets its timestamp on resume:
stepSpring integrates real dt, so a 10-minute hide would otherwise
arrive as a single 600000ms step and fling the springs off-model."
```

---

### Task 7: Suppress redundant nested blur under wallpaper themes

**Staged separately — this one changes rendering and needs Destin's eye before it lands.**

`theme-engine.ts:534-551` injects `backdrop-filter: blur(Npx) saturate(1.1)` onto `[data-wallpaper] .in-view .bg-inset`. Grouped tool cards carry `bg-inset` (`ToolCard.tsx:773`) and so does the assistant bubble that contains them (`AssistantTurnBubble.tsx:375`) — so every card becomes its own blur layer *nested inside* an already-blurred parent. Blurring an already-blurred backdrop adds very little visually while costing a full blur re-rasterisation on every repaint inside the card, including each frame of a hover fade.

This is the same shape as a bug this repo has already shipped twice (`globals.css:1095-1129`, guard `tests/drawer-card-glass.test.ts`).

**Files:**
- Modify: `desktop/src/renderer/themes/theme-engine.ts` (the `bubbleRule` template literal, ~line 537)
- Modify: `desktop/tests/drawer-card-glass.test.ts` (extend the existing guard)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Read the existing guard first**

Run: `cd /home/destin/youcoded-dev/worktrees/hover-paint/desktop && cat tests/drawer-card-glass.test.ts`

This test already encodes the "no nested per-card blur" invariant for the drawer. Extend it rather than writing a parallel test; match its assertion style.

- [ ] **Step 2: Add the carve-out**

In `desktop/src/renderer/themes/theme-engine.ts`, inside the `bubbleRule` template literal, append a rule after the existing blur declaration block:

```typescript
    /* A .bg-inset card INSIDE an already-blurred assistant bubble is a
       redundant blur layer: it samples a backdrop that is already blurred, so
       it adds almost nothing visually while costing a full blur
       re-rasterisation on every repaint inside the card — including each frame
       of a hover fade. Same shape as the drawer-tile bug this repo shipped
       twice (globals.css:1095-1129). The bubble keeps its blur; only the
       nested layers drop out. */
    [data-wallpaper] .in-view .assistant-bubble .bg-inset {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
```

- [ ] **Step 3: Extend the guard**

Add to `desktop/tests/drawer-card-glass.test.ts`, matching the file's existing style:

```typescript
  it('does not nest per-card blur inside an already-blurred assistant bubble', () => {
    const engine = readFileSync(
      join(__dirname, '..', 'src', 'renderer', 'themes', 'theme-engine.ts'),
      'utf8',
    );
    expect(engine).toMatch(/\.assistant-bubble \.bg-inset\s*\{[^}]*backdrop-filter:\s*none/);
  });
```

- [ ] **Step 4: Verify by eye on a wallpaper theme — Destin only**

Run: `cd /home/destin/youcoded-dev && bash scripts/run-dev.sh hover-paint --label "Hover Paint Fix"`

Switch to a theme with a wallpaper and a non-zero bubble blur — `golden-sunbreak` (`bubble-blur: 16`) is the shipped one. Open a conversation with several tool cards.

Expected: the assistant bubble still reads as frosted glass over the wallpaper; the cards inside it look essentially unchanged, because the bubble behind them is already blurring the wallpaper. **If the cards visibly flatten or lose separation from the bubble, revert this task** — the cost saving is not worth a visible regression, and Tasks 1–6 already carry most of the win.

- [ ] **Step 5: Run verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/hover-paint
cd worktrees/hover-paint
git add desktop/src/renderer/themes/theme-engine.ts desktop/tests/drawer-card-glass.test.ts
git commit -m "perf(themes): drop redundant nested blur on cards inside bubbles

Under a wallpaper theme every .bg-inset tool card became its own
backdrop-filter layer nested inside the assistant bubble's blur, so each
repaint inside a card — including every frame of a hover fade — forced a
full blur re-rasterisation. A blur sampling an already-blurred backdrop
adds almost nothing visually. Same shape as the drawer-tile bug shipped
twice before; extends that guard to cover the transcript."
```

---

### Task 8: Confirm the two eyeball items and measure the result

Tasks 1–6 are visually free by construction. Two changes are *probably* imperceptible but involve motion or rendering, so they get an explicit sign-off rather than an assertion: `.hover-lift`'s `steps(5)` (Task 5) and the nested-blur removal (Task 7).

**Files:**
- Modify: `/home/destin/youcoded-dev/docs/active/plans/2026-08-07-animation-frame-budget-fixes.md` (record the measured result, flip `status:` to `shipped`)

**Interfaces:**
- Consumes: everything above.
- Produces: the measurement recorded for the ROADMAP entry.

- [ ] **Step 1: Ask Destin to judge the two motion changes**

In the dev window: hover across the skill/command drawer tiles and the project file grid, where `.hover-lift`'s `scale(1.02)` now runs at `steps(5)` over 200 ms. Expected: the lift still reads as a smooth grow. If it looks steppy, raise to `steps(8)` — still ~3× fewer frames than smooth — and re-check.

- [ ] **Step 2: Measure the transcript case against the original number**

The baseline is ~33% of one core while circling the pointer over a tool-heavy conversation, with the compositor presenting at a full 180 Hz and the GPU at 13%.

Re-run the probe used to establish that number, with the pointer circling over the **dev** window's transcript:

Run: `python3 /tmp/claude-1000/-home-destin-youcoded-dev/2bdba310-cf90-468a-91b8-39ca8aba3527/scratchpad/dragprobe.py`

Read the `youcoded` rows in the DRAGGING section. Expected: materially below the ~33%-of-a-core baseline. **Record the actual number** — if it has not moved, the diagnosis was incomplete and the remaining cost needs re-investigating rather than more `steps()`.

Note the probe reports every process named `youcoded`, so Destin's live app is in the same list. Identify the dev instance's PIDs first: `pgrep -f 'worktrees/hover-paint'`.

- [ ] **Step 3: Record the outcome and flip status**

Add a `## Result` section to this plan file with the measured before/after, the `steps()` value settled on for `.hover-lift`, and whether Task 7 landed or was reverted. Change `status: draft` to `status: shipped` in the frontmatter.

- [ ] **Step 4: Capture the deferred items in the ROADMAP**

These were found during the audit and are deliberately **out of scope** here. Add them to `/home/destin/youcoded-dev/ROADMAP.md`, typed and dated 2026-08-07, deduping against existing entries first:

- `bug #perf` — Community themes can inject arbitrary `@keyframes`; `sanitizeCSS` (`theme-validator.ts:152-174`) strips five constructs and never inspects `animation`. The blessed theme hooks (`.assistant-bubble`, `.header-bar`, `.input-bar-container`) are permanently-mounted chrome, and Reduced Effects would not disable a theme's animation because those rules are selector-specific. No shipped theme does this today.
- `bug #perf #android` — The same shared CSS ships in the Android APK (verified: `build-web-ui.sh:19-26` → `app/src/main/assets/web`, `bundleWebUi` Gradle task, CI). No frame-rate cap exists in the Kotlin (`rg 'setFrameRate|refreshRate'` → zero hits), phones are commonly 120 Hz, always on battery, Reduced Effects defaults off. The per-frame cost on mobile ARM is **unmeasured** — the 29–33% figure is one Linux/amdgpu machine.
- `bug #perf` — Remote browser clients inherit the same CSS (`remote-server.ts:251` serves `dist/renderer`) and pay their *own* display's refresh rate, with no reduced-effects treatment; the host desktop renders simultaneously.
- `bug #docs` — `globals.css:1117` claims the marketplace grid "avoids the same cost by pre-blurring ONE backdrop element". No rule implementing that could be found; `MarketplaceScreen.tsx:281` renders `<WallpaperBackdrop/>` but the theme-engine `.layer-surface` rule still matches the cards. Verify and either fix the comment or add the missing rule.
- `bug` (unrelated, found in passing) — `bash scripts/ast-grep/check.sh` fails on `master` with two `tool-bounds-not-hand-rolled` errors at `src/main/harness/tools/web-fetch.ts:160,169`. The rule was broadened in `2fdbbd1` and now fires on the fragment-resolution note that its own comment says is legitimate.

- [ ] **Step 5: Commit the plan updates**

```bash
cd /home/destin/youcoded-dev
git add docs/active/plans/2026-08-07-animation-frame-budget-fixes.md ROADMAP.md
git commit -m "docs(perf): record animation frame-budget results and deferred items"
```

---

## Out of scope, deliberately

- **`buddy-breathe`** — the buddy window is `alwaysOnTop`, so `visibilitychange` never fires; `steps()` on breathing is visible, and pausing it makes the character look dead. Genuine cost-vs-charm tradeoff on an opt-in feature. Recorded in `ANIMATION_EXCEPTIONS`.
- **Mascot motion while genuinely visible and focused** — that is the feature working as intended.
- **Android and remote surfaces** — same root cause, different scoping and unmeasured cost coefficients. Captured in the ROADMAP by Task 8 Step 4.
- **Making Reduced Effects an "all animations off" switch** — currently it is mostly a blur/glass + particles + mascot switch. Expanding it is a product decision, not a perf fix, and the 2026-07-30 investigation deliberately kept spinners running ("a frozen spinner reads as a hung app").
