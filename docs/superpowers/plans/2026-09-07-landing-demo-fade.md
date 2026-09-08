# Landing Demo Activation and Fade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing-page demo fully visible and vertically centered when activated, and make its scroll-driven fade clear sooner.

**Architecture:** Keep all behavior in the landing page’s inline script. A small activation helper becomes the one owner for enabling the iframe, forcing the mask stop to 100%, and—on a wide viewport—centering the embed once. The existing requestAnimationFrame scroll path remains intact, but uses a named shorter reveal span constant.

**Tech Stack:** Static HTML/CSS/vanilla JavaScript in `youcoded/docs/index.html`; Vitest source-contract test; isolated Vite workbench/Chrome recording.

## Global Constraints

- Modify only `youcoded/docs/index.html` and one focused source-contract test under `youcoded/desktop/tests/`.
- Keep the SVG rounded-rectangle mask plus CSS-gradient mask; do not introduce an iframe clipping ancestor, `overflow: hidden`, `clip-path`, or a painted overlay.
- Keep scroll work limited to one requestAnimationFrame and do not rebuild the SVG mask on scrolling.
- A first activation clears the mask immediately, hides the existing floating controls through the current revealed state, and centers the embed only on wide screens.
- Honor `prefers-reduced-motion: reduce` with an instant page scroll; do not re-center after the first activation.
- Phone/narrow behavior remains unmasked and must not force recentering.
- Do not modify iframe fixtures, generated media, source URL, or renderer code.
- Comments explaining non-obvious behavior must include WHY.

---

## File structure

| File | Responsibility |
|---|---|
| `youcoded/docs/index.html` | Owns the live-embed mask, activation controls, page-scroll behavior, and faster scroll reveal. |
| `youcoded/desktop/tests/landing-demo-fade.test.ts` | Pins source-level landing-page behavior and guards against reintroducing the unsafe mask alternatives. |

### Task 1: Pin the landing demo behavior

**Files:**
- Create: `youcoded/desktop/tests/landing-demo-fade.test.ts`
- Read: `youcoded/docs/index.html:2403-2714`

**Interfaces:**
- Consumes: the inline live-demo script in `docs/index.html`.
- Produces: a deterministic source contract that later edits must satisfy.

- [ ] **Step 1: Write the failing source-contract test**

Create `desktop/tests/landing-demo-fade.test.ts` with this exact test body. It reads only source text, so it does not depend on a browser, page timing, or a live app.

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const site = fs.readFileSync(path.resolve(__dirname, '../../docs/index.html'), 'utf8');

describe('landing demo fade', () => {
  it('clears and centers the demo exactly once on wide-screen activation', () => {
    expect(site).toContain('var demoActivated = false');
    expect(site).toContain('function activateDemo(){');
    expect(site).toContain('embedFade = 1; setFadeStop(1);');
    expect(site).toContain("embed.classList.add('interactive')");
    expect(site).toContain("document.querySelector('.hero-app').classList.add('revealed')");
    expect(site).toContain("if (!wideMQ.matches || demoActivated) return;");
    expect(site).toContain("behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'");
    expect(site).toContain("top: scrollY + er.top + er.height / 2 - innerHeight / 2");
  });

  it('uses a named shorter scroll reveal span and retains the safe mask technique', () => {
    expect(site).toContain('var FADE_REVEAL_SPAN = 0.5;');
    expect(site).toContain('var revealSpan = Math.max(120, band * FADE_REVEAL_SPAN);');
    expect(site).toContain('/ revealSpan');
    expect(site).toContain("embed.style.maskComposite = 'intersect'");
    expect(site).not.toContain('.frame.embed{overflow:hidden');
    expect(site).not.toContain('.frame.embed{clip-path:');
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded/desktop
npx vitest run tests/landing-demo-fade.test.ts
```

Expected: FAIL because `demoActivated`, `activateDemo`, and `FADE_REVEAL_SPAN` do not yet exist.

- [ ] **Step 3: Commit the failing test**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded
git add desktop/tests/landing-demo-fade.test.ts
git diff --cached --check
git commit -m "test(site): pin landing demo activation behavior" -m "Submitted via YouCoded Assistant"
```

### Task 2: Implement activation and accelerated scroll reveal

**Files:**
- Modify: `youcoded/docs/index.html:2537-2714`
- Test: `youcoded/desktop/tests/landing-demo-fade.test.ts`

**Interfaces:**
- Consumes: `bootEmbed()`, `setFadeStop(fz)`, `wideMQ`, `placeFloat()`, `embed`, and the current `.hero-app.revealed` CSS behavior.
- Produces: `activateDemo()` as the sole first-activation path, `demoActivated` one-shot state, and `FADE_REVEAL_SPAN` for the scroll path.

- [ ] **Step 1: Add the named faster reveal span**

Immediately after the current `DOCK_GAP` declaration, add the following declaration and comment. This preserves the old lower bound while shortening only the interpolation distance.

```js
var DOCK_GAP = 34;
// WHY: a full dissolved-band traversal left the live demo partially invisible
// after visitors had scrolled past it; half that distance restores it promptly
// without moving mask construction back into the scroll path.
var FADE_REVEAL_SPAN = 0.5;
var demoRevealed = false, lastFz = null;
```

Replace the existing calculation in `placeFloat()`:

```js
var k = Math.max(0, Math.min(1, ((innerHeight - DOCK_GAP - h) - er.bottom) / band));
```

with:

```js
var revealSpan = Math.max(120, band * FADE_REVEAL_SPAN);
var k = Math.max(0, Math.min(1, ((innerHeight - DOCK_GAP - h) - er.bottom) / revealSpan));
```

- [ ] **Step 2: Replace duplicated activation listeners with one helper**

Replace the current `tryPill` listener and the two direct click listeners near the end of the live-demo script with the following. Keep the existing auto-boot observer immediately after this block unchanged.

```js
var demoActivated = false;
function activateDemo(){
  bootEmbed();
  embed.classList.add('interactive');
  document.querySelector('.hero-app').classList.add('revealed');
  demoRevealed = true;
  // WHY: after a visitor chooses the app, the decorative dissolve must not hide
  // any part of the surface they are about to use.
  embedFade = 1; setFadeStop(1); placeFloat();
  if (!wideMQ.matches || demoActivated) return;
  demoActivated = true;
  var er = embed.getBoundingClientRect();
  scrollTo({
    top: scrollY + er.top + er.height / 2 - innerHeight / 2,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
  });
}
var tryPill = document.querySelector('.trypill');
if (tryPill && embed) tryPill.addEventListener('click', activateDemo);
if (embed) {
  embed.querySelector('.embed-start').addEventListener('click', activateDemo);
  embed.querySelector('.embed-interact').addEventListener('click', activateDemo);
```

The replacement must retain the existing `if (embed) {` block around the auto-boot `IntersectionObserver`, and its matching closing brace.

- [ ] **Step 3: Run the focused test to verify it passes**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded/desktop
npx vitest run tests/landing-demo-fade.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 4: Prove the source-contract test detects regressions**

Temporarily change `var FADE_REVEAL_SPAN = 0.5;` to `var FADE_REVEAL_SPAN = 1;`, run the focused test, and restore `0.5` immediately afterward.

Run:

```bash
npx vitest run tests/landing-demo-fade.test.ts
```

Expected: FAIL because the test requires the shorter `0.5` span. Restore the exact implementation and rerun the focused test; expected PASS.

- [ ] **Step 5: Commit the implementation**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded
git add docs/index.html desktop/tests/landing-demo-fade.test.ts
git diff --cached --check
git diff --cached -- docs/index.html desktop/tests/landing-demo-fade.test.ts
git commit -m "fix(site): reveal and center activated live demo" -m "Submitted via YouCoded Assistant"
```

### Task 3: Verify the rendered landing page safely

**Files:**
- Read: `scripts/ui-review/README.md:102-159`
- Read: `youcoded/docs/index.html` in the running isolated site only

**Interfaces:**
- Consumes: the committed Task 2 behavior and the isolated workbench build.
- Produces: inspected visual proof that activation clears the fade, centers the wide demo, and normal scrolling reveals it sooner.

- [ ] **Step 1: Build the isolated embed**

Run the website build from the component worktree, which writes only that worktree’s generated `docs/site/` directory:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded/desktop
npm run build:site
```

Expected: Vite completes successfully and writes the workbench embed under `../docs/site/`.

- [ ] **Step 2: Serve the landing page from the isolated worktree**

Run a static server rooted at the component worktree’s `docs/` directory on an unused local port. Do not attach to or interact with the running production application.

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded/docs
python3 -m http.server 4180 --bind 127.0.0.1
```

Expected: the isolated page is reachable at `http://127.0.0.1:4180/`.

- [ ] **Step 3: Capture activation and scroll behavior in isolated Chrome**

Use the existing `scripts/ui-probe.mjs` or an equivalent local CDP capture to open `http://127.0.0.1:4180/`, set a wide viewport, click the Try Demo button, and capture the resulting centered demo. Then reload, scroll downward through the demo, and capture that it reaches fully visible before the former full-band reveal distance. Use deterministic DOM conditions rather than a fixed sleep wherever the tool supports them.

Expected: in the activation capture, the demo’s vertical midpoint is within a few pixels of the viewport midpoint and the lower dissolve is gone. In the scroll capture, `--fade-stop` reaches `100%` after approximately half the previous band distance.

- [ ] **Step 4: Inspect the captures before presenting them**

Open the generated screenshots/clip with the available file viewer. Check that the iframe is fully opaque after activation, centered vertically, and remains visually intact (no glass blur smear or rectangular clipping). If the capture is not clear, correct the probe setup rather than changing product behavior blindly.

- [ ] **Step 5: Run the focused guard and desktop verification**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded/desktop
npx vitest run tests/landing-demo-fade.test.ts
cd /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded
```

Expected: focused landing-demo test passes. Record the actual `verify.sh` result; if an unrelated existing/environmental check fails, identify it precisely and do not describe the overall verification as passing.

- [ ] **Step 6: Stop the static server and preserve only intentional changes**

Stop only the exact static-server process started in Step 2. Confirm `git -C /home/destin/youcoded-dev/worktrees/sessions/landing-demo-fade/youcoded status --short` shows only the Task 2 source/test changes or generated files deliberately intended for this task. Do not commit generated `docs/site/` unless the project’s existing deployment flow requires it for this source-only landing-page update.

## Plan self-review

- **Spec coverage:** Task 2 implements immediate unmasking, wide-only one-time vertical centering, reduced-motion behavior, existing controls’ revealed state, and the faster rAF scroll reveal. It retains the safe two-layer mask and does not touch content/fixtures. Task 3 covers isolated visual validation and full desktop verification.
- **Placeholder scan:** No TBD/TODO or unspecified test/code steps remain.
- **Consistency:** `activateDemo`, `demoActivated`, and `FADE_REVEAL_SPAN` are defined in Task 2 and asserted by Task 1. All named paths point to the session’s isolated worktrees.
