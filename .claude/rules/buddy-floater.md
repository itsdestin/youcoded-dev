---
# WHY this rule exists: these are desktop-only invariants that lived in
# docs/PITFALLS.md — a file scoped to CROSS-REPO items and loaded on every task.
# They were ~900 words nobody editing buddy code was ever shown, and ~900 words
# every other task paid for. Moved 2026-08-31; depth stays inline because there
# is no youcoded/docs/buddy.md yet.
#
# Globs are "**/"-prefixed on purpose: rule paths resolve from the PROJECT ROOT,
# so a "youcoded/..." glob never fires on the same file inside worktrees/<name>/,
# which is where CLAUDE.md sends all non-trivial work.
paths:
  - "**/desktop/src/main/buddy-*.ts"
  - "**/desktop/src/shared/buddy-geometry.ts"
  - "**/desktop/src/renderer/components/buddy/**"
  - "**/desktop/src/renderer/components/mascot/**"
  - "**/desktop/src/renderer/styles/buddy.css"
last_verified: 2026-08-31
verify:
  - path: youcoded/desktop/src/shared/buddy-geometry.ts
    contains: "HANDS_CENTER_FRACTION"
  - path: youcoded/desktop/src/shared/buddy-geometry.ts
    contains: "computeGroupLayout"
  - path: youcoded/desktop/src/shared/buddy-geometry.ts
    contains: "mascotInkRect"
  - path: youcoded/desktop/src/main/buddy-window-manager.ts
    contains: "reconcilePeekPosition"
  - path: youcoded/desktop/src/main/buddy-bar-visibility.ts
  - path: youcoded/desktop/src/main/buddy-dock.ts
  - path: youcoded/desktop/src/renderer/components/mascot/sanitize-rig-svg.ts
  - path: youcoded/desktop/src/renderer/components/mascot/MascotRig.tsx
    contains: "ensureParts"
  - test: youcoded/desktop/tests/buddy-bar-geometry.test.ts
  - test: youcoded/desktop/tests/buddy-bar-visibility.test.ts
  - test: youcoded/desktop/tests/buddy-dock.test.ts
  - test: youcoded/desktop/tests/buddy-edge-clamp.test.ts
  - test: youcoded/desktop/tests/buddy-strategy.test.ts
  - test: youcoded/desktop/tests/buddy-overlay-state.test.ts
  - test: youcoded/desktop/tests/sanitize-rig-svg.test.tsx
---
# Buddy Floater (mascot, action bar, chat, overlay)

Geometry is pure (`shared/buddy-geometry.ts`); windows belong to `BuddyWindowManager`. Guards = frontmatter `verify:`.

## Windows and visibility
- **The action bar window stays Electron-shown; visibility is CSS + `setIgnoreMouseEvents`.** Reveal animates via the `buddy:bar-state` push; CSS-hidden sets `setIgnoreMouseEvents(true)` so the invisible window doesn't eat clicks. Never swap to show/hide, which kills the fade.
- **The bar opens with the chat and nothing else** (`buddy-bar-visibility.ts`) — its actions are useless without one, so the hover input and its IPC path went in 2026-07-16. Never re-add one without re-deriving the need.
- **The bar window is bigger than the row it draws** — 164×60 around 148×44 (`BAR_PADDING = 8` per side) so hover/pop has room; `main.ts` imports them. **Its position is recomputed from live mascot bounds before EVERY reveal**; computing it at creation stranded the bar after a hidden drag.
- **`buddy:dismiss` hides for the run only** — the `localStorage` preference stays `'1'`; the `dismissed` flag lives in BuddyWindowManager and every `show()` clears it. The hide button must never write the preference.

## Group layout
- **The mascot/chat/bar move as one rigid group, and the CHAT's fit constrains the MASCOT's position** — not the reverse. `computeGroupLayout` is a fixed point: chat x is mascot x plus a constant, so keeping the chat onscreen pins the mascot's x, and where neither above nor below fits, the chat pins to the work-area edge and the mascot is pushed to meet it. Stretching it instead buried him under the chat (2026-07-17). **Never clamp a buddy window independently.**
- **Because that can shove the mascot off his edge, returning to `peeking` must re-flush him** — `peeking` is positioned-flush only when `moveMascot`'s drag-peek enters it, so `syncEngagement` → `reconcilePeekPosition()` glides him back. Every engage/disengage path keeps it.
- **Gaps between buddy windows are measured to the ARTWORK, not the window edge** — the ink sits inside 5/30 headroom above and 2/30 below, so equal gaps look lopsided. `mascotInkRect` + `MASCOT_INK_*_INSET` carry it; `HANDS_CENTER_FRACTION` (0.583) aligns the bar to his hands.
- **Mascot motion is transforms inside fixed-size windows; the ONLY window-bounds animation is the edge-snap glide.** The side-peek lean MUST live on its own inner element — CSS resolves `rotate` BEFORE `transform`, so combining them swings the body out of frame. The dock/peek machine is pure.

## Rig SVGs
- **Rig SVGs are third-party code — `sanitize-rig-svg.ts` is the security boundary.** Theme SVGs are INLINED into renderer DOM; the sanitizer strips scripts, `foreignObject`, `<style>`, SMIL, `on*` and external URLs, leaving only `#refs` and `data:image/*`. No registry-side validation exists, so it carries the whole guarantee.
- **MascotRig indexes the rig DOM by ELEMENT IDENTITY (`ensureParts`), not effect timing** — React can recreate the host div with identical innerHTML without `svgHtml` changing, so a state-keyed effect styles a detached svg and the animations die silently.
- **Theme `companions` is a TOP-LEVEL manifest key, NOT inside `mascot`** — older versions crash in `resolveAllAssetPaths` on non-string mascot values.

## The dormant overlay
**`BuddyOverlayManager` is DORMANT — `chooseBuddyStrategy` returns `windows` everywhere, including Linux Wayland**, where `setIgnoreMouseEvents` is a probe-verified TOTAL no-op that turns a screen-sized overlay into an invisible click-eater. Wayland ships NO buddy; the overlay is reachable only via `YOUCODED_BUDDY_STRATEGY=overlay` (evidence: `docs/active/investigations/2026-07-23-buddy-overlay-wayland-presentation.md`). Binding on anyone editing it:
- **Never read `getPosition()`/`getBounds()`** (Wayland returns stale values) and **never persist state before the init pull resolves** (it writes placeholder `{0,0}` and poisons `buddy-positions.json` for later boots). Overlay math is window-local; the renderer PULLS the work area via `overlayReady()`.
- Interactive elements need a hover-counted wrapper (`overlaySetInteractive`); recreation on display change re-applies keep-above, input region, title.
