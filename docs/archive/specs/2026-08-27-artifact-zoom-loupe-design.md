---
status: shipped
date: 2026-08-27
topic: Artifact viewer — zoom pill and hover loupe
repos: [youcoded]
revision: 2 (post-review; see Review corrections)
---

# Artifact viewer: zoom pill + hover loupe

## Problem

Images and PDFs in the artifact pane are display-only. `ImageView.tsx:38-39`
renders one `<img className="max-w-full max-h-full">` — a large screenshot is
shrunk to fit the pane with no way to inspect it. `PdfView.tsx:44` rasterizes
every page at a fixed `scale: 1.5` and caps each canvas at `maxWidth: 100%`, so
a dense PDF is unreadable in a narrow pane. Neither surface offers zoom, pan, or
magnification.

The ask: a hover magnifier for images "and similar file types", plus a `+`/`−`
zoom pill at the top left.

## Scope

| Included | Excluded |
|---|---|
| `ImageView` (png, jpg, jpeg, gif, webp, bmp, ico, avif, svg) | `DocxView`, `XlsxView`, `CsvView` — live DOM, not pictures |
| `PdfView` (canvas pages) | `HtmlView` — cross-document iframe, unsamplable |
| Desktop, remote browser, Android | `CodeEditorView`, `MarkdownView` — text, sizes itself |
| One guard change in `hooks/useZoomControls.ts` (§Gesture ownership) | New IPC channels — none needed (§Non-triggers) |

The loupe works by drawing a magnified copy of a bitmap. Documents and HTML
previews have no bitmap to copy; magnifying them would mean screenshotting the
DOM — slow, blurry, and worse than the text sizing those viewers already have.

## Review corrections

Revision 1 was reviewed against the code and contained five load-bearing errors.
Recorded here because each one changes the build:

1. **Ctrl+wheel is already owned app-wide.** `hooks/useZoomControls.ts:76-100`
   registers a **capture-phase** `wheel` listener on `window`, `preventDefault`s
   every `ctrlKey` wheel event and zooms the whole Electron frame. It does not
   `stopPropagation`, so an unguarded viewer handler double-fires: the app and
   the image both zoom. R1's "pinch works for free" was false. → §Gesture
   ownership.
2. **Android has no native pinch-zoom to protect.** `WebViewHost.kt:64-65` sets
   `setSupportZoom(false)` + `builtInZoomControls = false`, and both copies of
   `index.html` ship `user-scalable=no, maximum-scale=1.0`. `ImageView.tsx:39`'s
   `touchAction: 'pinch-zoom'` is dead code. R1's highest-severity risk was a
   phantom; the real finding is that phones have **no** image zoom today. →
   §Touch.
3. **A CSS transform creates no scroll extent**, and a `justify-center` child
   larger than its flex container has its top/left overflow unreachable. R1's
   "plain wheel still scrolls the pane" was false for images. → §Pan.
4. **`PdfPages` has no render cancellation.** The `cancelled` flag gates the
   loop only; the in-flight `page.render().promise` is never cancelled and
   `RenderTask.cancel()` is called nowhere. The `PDFDocumentProxy` is a local
   inside the effect and is discarded, and every page renders eagerly. Re-scaling
   requires restructuring `PdfPages`, not extending it. → §PDF.
5. **`fit` is not always the ladder floor.** `max-w-full` shrinks but never
   upscales, so for any image smaller than the pane `fit == 100%` and R1's
   rungs below it were undefined. → §The ladder.

Also corrected: an existing pill (`ZoomOverlay.tsx`) already implements
`[ − | % | + ]` with a reset-on-click label; a rendered `viewBox`-only SVG
reports `naturalWidth` 300×150 regardless of its real viewBox; jsdom has no
canvas 2D context, no `matchMedia`, no `elementFromPoint`, and all-zero
`getBoundingClientRect`.

## Gesture ownership

`useZoomControls` keeps every gesture it owns today, with one exception.

- **`Ctrl+wheel` / trackpad pinch:** the app-wide handler gains a single guard —
  bail out when the event originates inside a zoomable viewer:
  ```ts
  if ((e.target as Element | null)?.closest?.('[data-zoomable]')) return;
  ```
  The viewer's root carries `data-zoomable`. Inside the picture, pinch zooms the
  picture; anywhere else in the app, pinch zooms the app, exactly as now.
- **`Ctrl+=` / `Ctrl+-` / `Ctrl+0` stay app-wide, unchanged.** Rebinding them by
  focus would make the same keystroke mean two things depending on an invisible
  focus state. The pill is the viewer's zoom control; there is no viewer-local
  zoom shortcut.
- **`Escape`** turns loupe mode off, registered through the existing dismissal
  stack — `useEscClose(loupeOn, () => setLoupeOn(false))`
  (`hooks/use-esc-close.tsx:10-30`). A raw `keydown` listener is forbidden here:
  an unconsumed Escape forwards `\x1b` to the PTY and interrupts Claude, and the
  Android hardware back button routes through the same stack. Consequence to
  accept: with the loupe on, the first Escape (or Android back) turns it off
  instead of closing the file.
- **The two percentage readouts.** `ZoomOverlay` (`fixed top-16 right-4`, L4,
  auto-hides after 1.5 s) reports *app* zoom; the new pill reports *picture*
  zoom. With the guard above they can no longer be driven by the same gesture,
  so a user never sees both move at once.

## The pill

Top-left of the viewer's content area.

```
[ −  |  100%  |  +  |  ⌕ ]
```

- **Always rendered and always visible** whenever a zoomable file is displayed —
  no hover fade. R1's fade was wrong on three counts: Android has no
  pointer-enter (the pill would never appear), an `opacity-0` control stays in
  the tab order (the existing Edit cluster's bug, `SessionDrawer.tsx:755`), and
  it needed motion rules it didn't have. It also solves discoverability: the
  loupe is only findable because its button is on screen.
- The pill sits in the corner of the **pane**, not of the picture. A small image
  is centred, so the pill overlaps nothing; it only overlaps content that fills
  the pane.
- **Hidden entirely below a 260 px content width.** The pane can be ~107 px wide
  (`MIN_DRAWER_WIDTH = 320` minus the 210 px file list) — narrower than the pill.
- **`⌕` toggles loupe mode**, `aria-pressed` reflecting state, and is **absent**
  when `window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches !==
  true` (pattern: `InputBar.tsx:257`). Media query, not platform sniff — a
  remote browser on a desktop has a real cursor and gets the loupe.
- **The percentage label is a button** that resets to `fit`.
- **Disabled states carry their reason** in `title` (design guide §4.7):
  `−` at fit → "Already fitted to the pane"; `+` at the ladder ceiling →
  "Already at the largest size"; `+` at the PDF page-size ceiling → "This page
  can't be drawn any larger".

Primitives — no hand-rolled markup (`.claude/rules/react-renderer.md`, guards
`tests/primitive-adoption.test.ts`, `tests/overlay-layer-authority.test.ts`):

- Surface: `OverlayPanel` from `components/overlays/Overlay.tsx` with a layer.
  Never a hardcoded `z-`, blur, shadow, or radius.
- Buttons: `Button` with `size="icon"`, whose type **requires** `aria-label`
  (`components/ui/Button.tsx:89-90`) — accessible names come free.
- Hover hints: native `title=`. `AnchorTip` is explicitly not for this
  (`components/ui/AnchorTip.tsx` header).
- Coarse-pointer hit area ≥ 44 px (design guide §4.8); `size="icon"` is 28 px, so
  the pill needs a coarse-pointer size bump.
- New component `components/ui/ZoomPill.tsx`, so the app owns one zoom pill.
  `ZoomOverlay.tsx` is refactored to render it — **only if pixel-identical**;
  if it differs at all, leave `ZoomOverlay` alone and note the duplication.

## The ladder

`fit` is a rung, not a percentage. The reachable ladder for a given file is
`fit`, followed by every rung in `[50, 75, 100, 150, 200, 400, 800]` **strictly
greater than the fit scale**, ascending.

- A large screenshot fits at, say, 38 % → `+` goes 50 → 75 → 100 → …
- A 300 px image in a 900 px pane fits at 100 % (`max-w-full` never upscales) →
  `+` goes straight to 150 %. Rungs below fit are dropped, `−` bottoms out at
  `fit`.
- Ctrl+wheel may land between rungs; the label rounds to a whole percent and
  `+`/`−` jump to the next rung above/below the current scale.

## Pan

Zoom is a CSS `transform: scale()` on the content, so it produces **no scroll
extent** — dragging is the only pan mechanism, and the content is positioned by
`translate`, not by a centering flex box (whose overflow would be unreachable).

- Drag to pan whenever the content is larger than the content box. Cursor
  `grab` / `grabbing`; a pointer-down becomes a drag only after **4 px** of
  travel, so a shaky click is still a click.
- Translation is clamped so the content can never be dragged fully out of view.
- **Plain wheel:** over an image, pans vertically when zoomed in and does nothing
  at fit (the image container has never scrolled). Over a PDF, keeps scrolling
  the page list exactly as today — at `fit` a tall PDF is already taller than the
  pane, so scroll wins and drag-pan is inert there.
- **Pane resize:** the drawer's resize writes `--drawer-width` straight to
  `<html>` with no React re-render (`state/drawer-width.ts:27-29`), so
  `useZoomPan` must observe its container with a `ResizeObserver` or fit-scale
  goes stale mid-drag.

## The loupe

Active only while loupe mode is on and the pointer is over the content.

- A circle ~180 px across, centred on the cursor, moved by writing a CSS
  transform through a ref on `pointermove`. **No React state per move** — a
  state-per-move implementation re-renders the viewer on every pixel of cursor
  travel and will visibly stutter.
- Redraw runs on `requestAnimationFrame` while the lens is open, not only on
  pointer movement. Otherwise a stationary cursor over an animated GIF freezes
  the magnified copy while the picture underneath keeps playing.
- **Magnification: 2.5× the current display scale**, clamped for raster sources
  so the effective magnification never exceeds 8× the source's native pixel size.
  No clamp for SVG — vector content has no native resolution.
- **Draw with the destination-rect form of `drawImage`** — the whole source
  element scaled up and offset behind a circular clip — never the 9-argument
  source-sub-rect form. Two reasons, both measured: a `viewBox`-only SVG reports
  `naturalWidth` 300×150 whatever its real size, so source-rect maths is wrong
  for it; and sampling a source rect that extends past `naturalWidth` returns
  fully transparent pixels, which is exactly the "blank lens" this must avoid.
  The destination form also lets Chromium re-rasterize SVG at the drawn size, so
  a magnified SVG is genuinely sharp.
- **All cursor→source maths is done in normalized coordinates off
  `getBoundingClientRect()`** of the source element. On Android and remote the
  app zoom is a CSS transform on `<html>` (`remote-shim.ts:1407-1409`); rects are
  already scaled there, so ratios cancel the root scale out and absolute page
  coordinates would not.
- **Suppressed when the rendered content is smaller than the lens** — a 16 px
  favicon under a 180 px lens is four fat pixels and a broken-looking circle.
- **Never reads pixels back.** No `getImageData`, no `toDataURL`. A display-only
  draw is unaffected by canvas tainting (verified not tainted today for blob:
  images, SVG and pdf.js canvases); read-back is what tainting blocks, and
  Android sets `allowUniversalAccessFromFileURLs = false`
  (`WebViewHost.kt:59`).
- **`Loupe` resolves its own source** via a `resolveSource(clientX, clientY)`
  callback, because a PDF is one canvas *per page* and the source under the
  cursor changes as the user scrolls. (`document.elementFromPoint` is not an
  option — it doesn't exist in jsdom, so it would be untestable.)
- Hidden the moment the pointer leaves the content; off on Escape.
- `aria-hidden` — it is a decoration over content a screen reader already has.

## Touch

Android and touch-screen laptops, corrected for the fact that **there is no
native pinch to preserve**:

- The pill ships, with coarse-pointer hit areas.
- Drag-to-pan works with a finger (pointer events cover both).
- **Two-finger pinch zooms the picture**, implemented in `useZoomPan` from the
  same pointer stream. This is a *new* capability on Android, not a restoration —
  today a photo on a phone cannot be zoomed at all.
- The loupe button is absent (no hover).
- `ImageView.tsx:39`'s dead `touchAction: 'pinch-zoom'` is removed; the container
  sets `touch-action: none` only while our zoom is above `fit`, so page scrolling
  is untouched at rest.

## Architecture

One shared unit, both viewers. Rejected: a third-party zoom library (new
dependency, styles itself against six themes, PDFs still need bespoke work) and
per-viewer implementations (guaranteed drift — the app already has two zoom
pills for exactly this reason).

```
components/ui/ZoomPill.tsx          — the control (ui/, so the guards cover it)
components/artifact-views/zoom/
  useZoomPan.ts   — scale ladder, fit, pan offset, clamping, wheel, drag, pinch.
                    Takes container + content size as PLAIN ARGUMENTS.
  Loupe.tsx       — lens overlay; props: resolveSource, magnification, diameter.
  index.ts
```

- `useZoomPan` knows nothing about images or PDFs. Sizes are arguments, not
  measured internally, so it is unit-testable in jsdom (where every
  `getBoundingClientRect` is zero).
- `Loupe` no-ops when `getContext('2d')` returns `null` — a production defense
  and the only way it can be rendered in a jsdom test.
- `ImageView` composes all three. `PdfView` composes them but feeds `scale` into
  its render loop instead of into a transform.
- **State lives in `ImageContent` / `PdfPages`, not `ImageView` / `PdfView`** —
  `BinaryContent.tsx:65` keys the *inner* child by `absolutePath`, so only state
  held there resets on file switch.
- Each viewer owns **its own `relative` wrapper** carrying `data-zoomable`. The
  only `relative` ancestor today is `ActiveArtifactView.tsx:511`, and in Project
  View the scroller is the overlay body (`ProjectDetailOverlay.tsx:69`) — a pill
  anchored up there would scroll away.

## State and reset

Zoom level, pan offset and loupe mode are per-file and reset on file switch (free
via the `absolutePath` key above). Every file opens plainly at fit-size.

Rationale: loupe mode is a mode. Persisting it across files produces "why is this
picture behaving strangely?" a week later with no visible cause. Accepted cost:
someone comparing two screenshots at 200 % re-zooms on each switch.

## PDF

A PDF is text, not pixels: CSS-scaling a page past 100 % turns glyphs to mush,
which is the opposite of the reason to zoom a PDF. The pill therefore sets the
pdf.js **render scale** (`page.getViewport({ scale })`).

`PdfPages` cannot be extended to do this; it must be restructured
(§Review corrections #4):

- One React component per page, each owning `{ canvasRef, renderTask }`.
- The `PDFDocumentProxy` is retained in a ref so a scale change does not re-run
  `getDocument()` / `destroy()`.
- A scale change calls `renderTask.cancel()` before starting the next render.
  Rendering twice into one canvas without cancelling is the pdf.js
  "Cannot use the same canvas during multiple render() operations" error.
- Immediate feedback, deferred sharpness: existing canvases are CSS-transformed
  instantly, then re-rendered at the new scale after ~150 ms. Soft-then-crisp,
  as in every PDF reader.
- Only pages intersecting the viewport re-render (IntersectionObserver); the rest
  re-render as they scroll in. Today every page renders eagerly.
- **Size ceiling: ~16 megapixels per page and ≤ 16384 px per dimension.** This is
  the only defense available — measured, Chrome accepts an oversized canvas,
  reports the requested `width`, paints nothing, and throws no exception, so
  "catch and fall back" does not exist. Above the ceiling `+` is disabled with
  its reason.
- The loupe on a PDF samples the already-rendered canvas — no re-render, no
  delay — so it reveals detail up to that canvas's current resolution.

## Non-triggers

Stated so a reviewer need not re-derive them:

- **No new IPC channels.** `artifacts:read-binary` already exists on every
  surface; `.claude/rules/ipc-bridge.md` five-surface parity and
  `tests/ipc-channels.test.ts` are not engaged.
- **The workbench cannot render an image or a PDF today** —
  `artifacts.readBinary` has no mock implementation
  (`src/renderer/dev/workbench/`), so every image currently shows "Preview isn't
  available on this platform." The mock shim needs `readBinary` plus one image
  and one PDF fixture **before** the review deck can exist, and any shim change
  requires `node scripts/workbench-boot-check.mjs`
  (`.claude/rules/react-renderer.md`).

## Testing

Grounded in what jsdom actually supports (probed: no canvas 2D context, no
`matchMedia`, no `elementFromPoint`, `URL.createObjectURL` undefined, all rects
zero).

**Pure (the bulk of the coverage) — `useZoomPan` with sizes as arguments:**
ladder construction for fit-below-100 % and fit-at-100 %, stepping both ways,
ceiling clamp, pan clamped to bounds, wheel-zoom anchored to the pointer, 4 px
drag threshold, two-pointer pinch.

**DOM:**
- `ZoomPill`: `−` disabled at fit and `+` at ceiling *with reasons*, label click
  resets, loupe button absent when unsupported, `aria-pressed` tracks state,
  every button has an accessible name. `matchMedia` stubbed per
  `tests/use-narrow-viewport.test.tsx:11-33`.
- `ImageView`: needs `URL.createObjectURL`/`revokeObjectURL` **and**
  `window.claude.artifacts.readBinary` stubbed — no existing test gets `ImageView`
  past the byte read (`tests/artifact-content-loading.test.tsx:214` asserts the
  `'unavailable'` state instead). Assert: loupe absent until toggled, removed on
  pointer-leave and on Escape, all state reset when `absolutePath` changes.
- `Loupe`: renders and no-ops with a null 2D context.
- `PdfView`: requires `vi.mock('pdfjs-dist')`; assert a scale change calls
  `renderTask.cancel()` before the next render, and that `+` disables at the
  page-size ceiling.
- `useZoomControls`: a Ctrl+wheel inside `[data-zoomable]` does **not** zoom the
  app; outside it, still does.

**Not automated** (workspace rule on interactive verification): drag feel,
trackpad pinch, the lens tracking the cursor, Android touch.

**Sign-off:** workbench mock (readBinary + fixtures) → `review-cards.py` deck,
before/after per point → six-theme × `default`/`stress` × desktop/390 px sheet
per design-guide checklist #7, specifically the pill over a pure-white screenshot
in Meadow Mist and Halftone → Destin approves → PDF work starts.

## Risks and accepted trade-offs

1. **The pill permanently covers the top-left of content that fills the pane.**
   Accepted — it buys Android, keyboard access and discoverability.
2. **Escape gains a rung.** With the loupe on, Escape (and Android back) turns it
   off before closing the file.
3. **Pinch over a picture no longer zooms the app.** Intended, but it is a
   behaviour change to a gesture that works today.
4. **Low-resolution sources reveal nothing under the lens** — big soft pixels.
   Inherent to the file; the tiny-source suppression covers the worst case.
5. **The PDF restructure is the largest single piece of work here** and touches
   code with a live cancellation bug. It ships as its own reviewable phase, after
   images.
6. **Zoom resets on every file switch** — deliberate; costs repeat zooming when
   comparing two files.
7. **A fourth floating overlay in a narrow pane** (find bar top-right, Edit
   cluster bottom-right, large-file bar bottom). Mitigated by the 260 px cutoff.

## Out of scope

Fullscreen / lightbox view · rotate, flip, copy-region · zoom for docx/xlsx/html
· remembering zoom across sessions · replacing `ZoomOverlay`'s behaviour (only
its markup, and only if pixel-identical).
