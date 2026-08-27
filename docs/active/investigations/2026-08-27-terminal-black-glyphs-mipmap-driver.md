---
title: Terminal text renders as solid black boxes — xterm's atlas mipmap upload is rejected by the GPU driver
date: 2026-08-27
status: active
tags: [terminal, xterm, webgl, linux, renderer]
related:
  - youcoded 619d064a (2026-07-30 — the "heal on toggle/resize" fix; IS in the installed build, and is NOT enough)
  - xtermjs/xterm.js PR #5987 (2026-06-03, "fix(webgl): avoid glyph atlas mipmaps") — the upstream root-cause fix, unreleased
  - xtermjs/xterm.js issue #5986
  - ROADMAP.md → Bugs → "Terminal text goes solid black (glyph atlas mipmap)"
---

# Terminal text renders as solid black boxes

Reported 2026-08-27 ~01:00 by Destin (screenshot: every line of terminal text drawn as black
rectangles; "everything blacking out in terminal view … which I thought we had fixed").
Same failure class as the 2026-07-29 report ("black rectangles over characters"), now total
instead of partial.

## Environment that reproduced it

| | |
|---|---|
| Installed app | `youcoded 1.3.0_beta.16-1` (pacman), binary dated 2026-08-15, built from youcoded `ebf00c81` (Desktop Test Build run 31923281751) |
| Contains | `619d064a` glyph-atlas heal — **yes**; `81c9562d` inactive-session content-visibility — yes; `a1f82f8b` resize black-bars fix — **no** (never pushed) |
| xterm | `@xterm/xterm` 6.0.0, `@xterm/addon-webgl` 0.19.0 (published 2025-12-22) |
| Electron | ^41.10.3, WebGL via ANGLE on desktop GL |
| GPU / driver | AMD Radeon 8060S (Strix Halo), **mesa-git 26.2.0-devel (a982deee39)**, installed 2026-07-16 |
| Kernel | 7.1.3-2-cachyos, KDE Plasma 6 Wayland |

Note the timing: mesa-git was upgraded 2026-07-16; the first "black rectangles" report was
2026-07-29. No mesa/kernel upgrades since 2026-08-10 (pacman.log).

## Evidence (all read-only, from outside the live app)

**1. The GPU process logs a driver rejection every time the atlas is uploaded.**
`journalctl --user` for the app's GPU process (pid 185683, launched 2026-08-26 12:31):

```
[.WebGL-0x1cbc00157400] GL_INVALID_OPERATION: Error: 0x00000502, in
  ../../third_party/angle/src/libANGLE/renderer/gl/TextureGL.cpp,
  allocateMipmapLevelsForGeneration:1593. Internal error: 0x00000502: Unexpected driver error.
renderergl_utils.cpp:3121 (HandleError): GL call functions->texImage2D(...) generated error 0x00000502
```

- 106 such errors between **2026-08-26 17:06:32** (first) and **2026-08-27 00:58:45** (last, ≈2 min
  before the report). None before 17:06 in the 4.5 h the app had been running.
- Histogram: 88 in the 17:00 hour, 8 at 22:00, 4 at 23:00, 6 at 00:00.
- Five distinct WebGL contexts (`0x…14f000` ×89, `0x…200c600` ×11, `0x…157400` ×3, `0x…200f000` ×2,
  `0x…2010800` ×1) — i.e. several sessions' terminals, not one broken context.
- **The error recurs in the instance Destin relaunched at ~01:56** (new GPU pid 2371580: three
  errors at 02:30:01, and two more in an intermediate instance at 01:55:52). So it is not stale
  app state; the driver rejects the call in a fresh process too.
- No kernel `amdgpu` faults/resets, no suspend/resume, no crash dumps, no renderer or GPU process
  restarts in that window. VRAM 2.5 GB / 4 GB, GTT 0.3 GB / 80 GB — not memory pressure.
- Only other GPU-process errors: benign "Frame latency is negative" lines and two
  `SharedImageManager::ProduceSkia … non-existent mailbox` at 00:17:16.

**2. The rejected call is xterm's own mipmap generation.**
`@xterm/addon-webgl` 0.19.0, `src/GlyphRenderer.ts:379-384` (`_bindAtlasPageTexture`):

```ts
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.pages[i].canvas);
gl.generateMipmap(gl.TEXTURE_2D);
```

ANGLE implements `generateMipmap` by allocating each mip level with `texImage2D(null)` —
`allocateMipmapLevelsForGeneration` — which is exactly where the driver says
"Unexpected driver error". The addon never sets `TEXTURE_MIN_FILTER`, so it stays at WebGL's
default `NEAREST_MIPMAP_LINEAR`, which **requires** a complete mip chain. A texture whose
mip chain failed is "incomplete", and WebGL samples an incomplete texture as opaque black
`(0,0,0,1)`. Result: every glyph quad is drawn as a solid black rectangle the size of the glyph
— the exact screenshot. The addon never calls `gl.getError()`, and no context-loss event fires,
so nothing in xterm notices.

**3. Why the July fix could not fix it.**
`619d064a` calls `Terminal.clearTextureAtlas()` on hide→show and after a debounced resize.
That forces a *re-upload* — which runs the same `generateMipmap` and fails again. The 88 errors
in the 17:00 hour are consistent with a window-drag session re-triggering the heal on every
settled resize. The heal was designed for a *transiently* bad texture; here the upload path
itself is broken, so healing is a no-op (and the errors at 00:58:39/00:58:45 line up with
Destin toggling views to try to clear it).

**4. Upstream has already diagnosed and fixed this — unreleased.**
xtermjs/xterm.js PR #5987 (merged 2026-06-03, fixes #5986): "dense terminal text can turn into
black cell blocks, smears, or corrupted glyphs on Linux + Wayland GPU stacks when the WebGL
addon is active … Electron/ANGLE logged GL_INVALID_OPERATION while allocating mipmaps for
generation. Removing `gl.generateMipmap` and using explicit non-mipmapped filters resolved the
corruption." Diff:

```diff
+    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
+    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.pages[i].canvas);
-    gl.generateMipmap(gl.TEXTURE_2D);
```

Two other downstream Electron terminals (Orca, Hermes Agent) hit the same bug and applied the
same two-line change. Mipmaps buy nothing here: the atlas is rasterized at device pixel ratio
and sampled 1:1.

Release status (npm, checked 2026-08-27): `0.19.0` (2025-12-22) is the latest stable and does
NOT contain it; `0.20.0-beta.299` (2026-08-24) does (verified: 0 `generateMipmap` in its
`lib/addon-webgl.js`, `TEXTURE_MIN_FILTER,LINEAR` present) but peer-depends on
`@xterm/xterm ^6.1.0-beta.303`, i.e. a beta core.

Upstream commits after #5987 also worth knowing about: `6fe6fe1a` "Fix shared atlas page
invalidation per renderer" and `2b982bc3` "Prevent WebGL atlas page overflow" (both 2026-07)
— they overlap the problem `619d064a` worked around by hand.

## Root cause (one sentence)

The GPU driver on this machine (mesa-git radeonsi) fails `generateMipmap` on the glyph atlas;
xterm 0.19.0 both requires mipmaps (default min filter) and never checks for the failure, so the
atlas texture is incomplete and every glyph samples as black; the app's July heal re-runs the
same failing upload, so it cannot recover.

## Solution options

**A. Ship upstream's two-line fix into the installed 0.19.0 via a postinstall patch (recommended).**
Same pattern as `desktop/scripts/patch-node-pty.js`: a script that rewrites the one call site in
`node_modules/@xterm/addon-webgl/lib/addon-webgl.js` (minified text is
`…t.pages[i].canvas),e.generateMipmap(e.TEXTURE_2D),…`), plus a pinning test that fails if the
string is ever absent after install (so a future `npm ci` or xterm bump can't silently drop it),
and removed the day `@xterm/addon-webgl` ≥ 0.20.0 stable ships. Pros: exact upstream fix, tiny,
no behaviour change for anyone whose driver works (LINEAR at 1:1 is what mipmap level 0 already
gives). Cons: patching a dependency is a maintenance smell — which the pinning test and the
removal condition bound.

**B. Move to `@xterm/xterm` 6.1.0-beta + `addon-webgl` 0.20.0-beta.**
Gets #5987 plus the two atlas-invalidation fixes (and could retire the `619d064a` heal). Cons:
beta core in a shipping app; the 6.1 betas carry other unreviewed changes; would need the full
terminal test suite and a real-app pass on all three surfaces. Not recommended as the *first*
move — but worth a follow-up once 0.20.0 goes stable.

**C. Detect-and-fall-back (defence in depth, optional, on top of A).**
After an atlas upload, call `gl.getError()` on xterm's WebGL context (the driver error is
surfaced to the renderer as `INVALID_OPERATION`); on error, dispose the WebGL addon and let xterm
use its DOM renderer — the same path `onContextLoss` already takes after 3 retries in
`TerminalView.tsx:179-199`. Pros: covers *any* future driver failure, not just this one. Cons:
more code in the app, and the DOM renderer is noticeably slower on big scrollback — it should
be a fallback, never the default.

**D. Do nothing in the app; treat it as Destin's dev-driver problem.**
It is genuinely a driver bug — but upstream's issue lists three other apps on Linux + Wayland
hitting it, so real users on stable Mesa are exposed too. Rejected.

## What was ruled out

- App-state corruption (recurs in a fresh process); GPU reset / suspend (none in kernel log);
  VRAM/GTT exhaustion (2.5/4 GB, 0.3/80 GB); a missing fix in the build (`619d064a` is in
  `ebf00c81`).
- The unpushed `a1f82f8b` resize black-bars fix is a *different* symptom (black strips at the
  window edge during drag, painted by the compositor, not by xterm) and is unrelated.

## Open: the chat panel

Destin also reported that the same live session "lost all of its chat view" and that new
sessions show no "Start a conversation with Claude" text. The chat panel uses no WebGL (only
`ThemeEffects`/`SessionStrip` 2D canvases), the Chat `ErrorBoundary` would print "Chat crashed"
rather than vanish, and `visible` / `sessionActive` are the same `s.id === sessionId` compare —
so none of the code paths I can inspect explain a silent blank panel. Not diagnosed; needs a
screenshot of the chat view (any session) and whether it persisted across the ~01:56 relaunch.
