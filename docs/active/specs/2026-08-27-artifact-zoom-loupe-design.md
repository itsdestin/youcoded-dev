---
status: draft
date: 2026-08-27
topic: Artifact viewer — zoom pill and hover loupe
repos: [youcoded]
---

# Artifact viewer: zoom pill + hover loupe

## Problem

Images and PDFs in the artifact pane are display-only. `ImageView.tsx` renders a
single `<img className="max-w-full max-h-full">` — a large screenshot is shrunk
to fit the pane with no way to inspect it. `PdfView.tsx` rasterizes every page at
a fixed `scale: 1.5` and caps each canvas at `maxWidth: 100%`, so a dense PDF is
unreadable in a narrow pane. Neither surface offers zoom, pan, or magnification.

The user's ask: a hover magnifier for images "and similar file types", plus a
simple `+`/`−` zoom pill at the top left.

## Scope

| Included | Excluded |
|---|---|
| `ImageView` (png, jpg, jpeg, gif, webp, bmp, ico, avif, **svg**) | `DocxView`, `XlsxView`, `CsvView` — live DOM, not pictures |
| `PdfView` (canvas pages) | `HtmlView` — cross-document iframe; can't be sampled |
| Desktop + remote (pointer devices) | `CodeEditorView`, `MarkdownView` — text, has its own sizing |
| Android: pill only, no loupe | New keyboard-shortcut surface beyond `Escape` |

Rationale for the exclusions: the loupe works by drawing a second, magnified copy
of a bitmap. Documents and HTML previews have no bitmap to copy — magnifying them
would require screenshotting the DOM, which is slow, blurry, and worse than the
text-sizing those viewers already have.

## Behaviour

### The pill

A floating control in the **top-left** of the viewer pane, above the content.

```
[ −  |  100%  |  +  |  ⌕ ]
```

- **`−` / `+`** step through a fixed ladder: `fit → 50 → 75 → 100 → 150 → 200 →
  400 → 800%`. `fit` is the entry point and the ladder's floor; a step down from
  the smallest ladder rung that exceeds `fit` returns to `fit`. No arbitrary
  intermediate values from the buttons (Ctrl+wheel may land between rungs; the
  label rounds to a whole percent).
- **The percentage label is a button** — click resets to `fit`. Tooltip:
  "Reset to fit". This is the single escape hatch from any zoom/pan state.
- **`⌕` toggles loupe mode.** Rendered in the pressed/active state while on.
  Tooltip: "Magnify on hover".
- Disabled states: `+` disabled at the ladder ceiling (or the PDF memory
  ceiling, below); `−` disabled at `fit`.

**Visibility.** The pill fades in (150 ms) when the pointer enters the viewer
pane and out when it leaves. It is **pinned visible** whenever zoom ≠ `fit` or
loupe mode is on, because at that point it reports state, not just affordances.
Rationale: a permanently-visible pill covers most of a 16×16 favicon.

Styling follows `docs/active/design/2026-08-25-ui-design-guide.md` — the app's
existing translucent surface token, `rounded-full`, existing icon-button sizing.
No new colour values; must be legible over both light and dark image content, so
the pill carries its own surface background rather than floating bare over pixels.

### The loupe

Active only while loupe mode is on and the pointer is over the content.

- A circle ~180 px across, centred on the cursor, following it with no lag
  (transform-driven, no React state per mousemove — see Architecture).
- Shows the content under the cursor at **2.5× the current display scale**,
  clamped so the effective magnification never exceeds 8× the source's native
  resolution (beyond that there is no more detail to show, only larger pixels).
- Soft border + shadow so it reads as a lens over the image.
- **Edge behaviour:** the lens samples only within the content bounds. Near an
  edge the magnified view shows the edge with the pane backdrop beyond it — it
  never samples blank space and never jumps to stay inside.
- Disappears immediately when the pointer leaves the content, and on `Escape`
  (which also switches loupe mode off).

### Pan and gestures

- **Drag to pan** whenever the content is larger than the pane. Cursor is `grab`
  / `grabbing`. At `fit` the content isn't larger than the pane, so dragging is
  inert (no accidental nudge).
- **Ctrl + wheel** zooms toward the pointer position. Plain wheel keeps its
  current behaviour (scrolling the pane). Trackpad pinch arrives as Ctrl+wheel,
  so pinch-to-zoom works on a laptop for free.
- Not included (explicitly declined): plain-wheel zoom (would hijack pane
  scrolling), double-click to toggle fit/100%.

### State and reset

Zoom level, pan offset, and loupe mode are **per-file and reset on file switch**.
`BinaryContent` already keys its child by `absolutePath`, so a hook owning this
state inside the viewer resets naturally — no explicit teardown needed.

Rationale: loupe mode is a mode. Persisting it across files produces the
"why is this image behaving strangely?" failure a week later, with no visible
cause. Every file opens plainly at fit-size.

## PDF specifics

A PDF is text, not pixels: CSS-scaling a page canvas past 100% turns glyphs to
mush, which is the opposite of the reason to zoom a PDF.

- The pill's zoom sets the pdf.js **render scale** (`page.getViewport({ scale })`),
  so text is resampled crisp at every rung.
- **Immediate feedback, deferred sharpness:** on a zoom change the existing
  canvases are CSS-transformed instantly, then re-rendered at the new scale after
  a short debounce (~150 ms). The user sees soft-then-crisp, as in every PDF
  reader.
- **Only visible pages re-render.** Off-screen pages are re-rendered when they
  scroll into view.
- **Memory ceiling.** Canvas area is capped at ~16 megapixels per page — at
  4 bytes a pixel that is ~64 MB of backing store per visible page, which is the
  most a handful of on-screen pages can carry without risking the renderer.
  At the ceiling the `+` button is disabled rather than allowing the user to
  wedge the renderer. The ceiling is expressed as a max effective scale computed
  from the page's intrinsic size, so a huge poster PDF caps sooner than a letter
  page.
- Re-render must respect the existing cancellation discipline in `PdfPages`
  (the `cancelled` flag and `loadingTask.destroy()`): a zoom change mid-render
  cancels the in-flight page render before starting the new one, or the two race
  and paint over each other.
- The **loupe on a PDF samples the already-rendered canvas** — no re-render, no
  delay. It therefore reveals detail only up to the canvas's current resolution,
  which at `scale: 1.5` displayed at ≤ 100% width is real extra detail.

## Android / touch

The renderer is shared with the Android WebView, so this ships to Android too.

- **The loupe button is hidden on coarse-pointer / hover-less devices**
  (`matchMedia('(hover: hover) and (pointer: fine)')`). A magnifier that follows
  a cursor is meaningless without a cursor; rendering a control that can do
  nothing is worse than omitting it.
- The `−` / `+` / reset pill **does** ship to Android.
- `ImageView` currently sets `style={{ touchAction: 'pinch-zoom' }}`. Native
  pinch-zoom is preserved at `fit`; our own `touch-action` handling only engages
  once our zoom is above `fit` (so drag-to-pan works with a finger). This must be
  verified on a device — silently killing native pinch on Android is the main
  regression risk of this change.

## Architecture

One shared unit, consumed by both viewers. Rejected alternatives: a third-party
zoom library (new dependency, styles itself against six themes, and PDFs still
need bespoke work) and per-viewer implementations (guaranteed drift).

```
components/artifact-views/zoom/
  useZoomPan.ts     — state machine: scale ladder, fit computation, pan offset,
                      clamping, Ctrl+wheel, pointer drag. Pure, unit-testable.
  ZoomPill.tsx      — the control. Props: scale, canZoomIn/Out, loupeOn,
                      loupeSupported, handlers. No knowledge of what it zooms.
  Loupe.tsx         — the lens overlay. Props: a source (HTMLImageElement |
                      HTMLCanvasElement), magnification, bounds. Renders into a
                      canvas positioned by transform.
  index.ts
```

Boundaries:

- `useZoomPan` knows nothing about images or PDFs — it is given an intrinsic
  content size and a container size, and returns scale/offset plus handlers.
- `ZoomPill` is presentational.
- `Loupe` takes a *source element* to sample. `<img>` and `<canvas>` are both
  valid `drawImage` sources, which is exactly why both viewers can share it.
- `ImageView` composes all three directly. `PdfView` composes them and feeds
  `scale` into its render loop instead of into a CSS transform.

**Performance discipline:** cursor tracking for the loupe writes a CSS transform
via a ref on `pointermove` — it does **not** set React state per move. Pan
dragging follows the same pattern, committing to state only on pointer-up.
A state-per-move implementation re-renders the whole viewer on every pixel of
cursor travel and will visibly stutter on a large image — treat it as a defect,
not a style preference.

## Testing

Unit / DOM (vitest, `desktop/tests/`):

- `useZoomPan`: ladder stepping in both directions, `fit` floor, ceiling clamp,
  pan clamped to content bounds, Ctrl+wheel zooms toward the pointer, plain wheel
  ignored.
- `ZoomPill`: `−` disabled at fit, `+` disabled at ceiling, label click resets,
  loupe button absent when `loupeSupported` is false.
- `ImageView`: loupe overlay absent until toggled; removed on pointer-leave and
  on `Escape`; state resets when `absolutePath` changes.
- `PdfView`: a zoom change cancels the in-flight render before starting the next;
  `+` disabled once the computed scale hits the memory ceiling.

Not automated (per workspace rule on interactive verification): the feel of
dragging, trackpad pinch, and the loupe tracking the cursor. Destin eyeballs
those in a dev window.

Sign-off: workbench mockup → `scripts/ui-review/review-cards.py` deck (before /
after per point) → Destin approves before the PDF work starts.

## Risks and accepted trade-offs

1. **The pill overlaps the top-left of the content** while the pointer is in the
   pane. Accepted; mitigated by fade-out and by the pill being small.
2. **Trackpad pinch now zooms images.** Desirable, but it means content can zoom
   from a gesture not consciously aimed at it.
3. **Low-resolution sources reveal nothing under the loupe** — magnification
   shows large soft pixels. No fix; inherent to the file.
4. **Android native pinch could regress.** Highest-severity risk in this spec;
   gated on device verification before merge.
5. **PDF re-render cost.** Mitigated by debounce, visible-page-only rendering,
   and the memory ceiling.

## Out of scope (possible follow-ups)

- Fullscreen / lightbox view of an image.
- Rotate, flip, or copy-region.
- Zoom for docx / xlsx / html previews.
- Remembering zoom per file across sessions.
