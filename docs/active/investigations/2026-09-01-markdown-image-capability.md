---
date: 2026-09-01
status: active
type: investigation
topic: A model can already show an image in chat by accident — what it would take to make that a real capability
---

# "The model can show you an image in chat" — accidental today

**Observed (2026-07-19):** Claude wrote a plain markdown image (`![alt](/tmp/…/final.png)`)
in a reply and the packaged app rendered it inline, full-bleed. Destin: nifty, worth having on
purpose — eventually tell models "you can show the user an image by X". Not now; parked.

## Why it works today (none of it designed)

`MarkdownContent.tsx` runs react-markdown with a module-scope `mdComponents` override table
that has **no `img` entry and no `urlTransform`** (still true 2026-09-01). react-markdown's
default transform only blocks dangerous *protocols*; `/tmp/…` has no colon, so it passes
through verbatim as `<img src="/tmp/…">`. Production loads the renderer with `win.loadFile`
(`main.ts`), so the origin is `file://` and a root-relative src resolves to a real path.

## Why it is unfit to advertise as-is

1. **Dev/prod inconsistent** — in dev the origin is `http://localhost`, so the same markdown
   404s. A capability that only works in the packaged build is a support nightmare.
2. **It bypasses the app's deliberate image path.** `ImageView.tsx` and
   `ArtifactThumbnail.tsx` explicitly avoid `file://` and read bytes over
   `window.claude.artifacts.readBinary()` into a same-origin `blob:` URL. Markdown images
   route around all of it.
3. **No width constraint.** The only `img` rule is scoped to the DOCX viewer, so a 1500 px
   screenshot overflows the chat bubble — which is exactly what happened.
   <!-- claim: {"path": "youcoded/desktop/src/renderer/styles/globals.css", "contains": "\\.doc-html img \\{ max-width: 100%"} -->

## Shape of the real thing

Give markdown images an `img` override that resolves local absolute paths through the same
`readBinary` → `blob:` path the artifact views use (fixes dev/prod parity, keeps one image
mechanism), add `max-width: 100%; height: auto`, then decide `urlTransform` deliberately —
today any local path the renderer can read will render, fine for trusted model output but a
live consideration for pasted/untrusted transcripts. Only then document it in the system
prompt. Pairs with the image right-click sub-menu item (it needs `data-artifact-path` on chat
images anyway, which this would provide).

## History
Filed 2026-07-19 as a someday idea. Mechanism re-verified 2026-09-01.
