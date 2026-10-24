---
status: archived
card: 166
---

# Pre-preview review triage

Fresh reviewer: Ellis (reviewer), resumed with the completed theme, fixture and narrow-host changes.

- C1 accepted/applied — `PageHost.tsx` direct `openPage` initialization now also passes `focus: narrow`. A new PagesView test failed with `pageFocus: false`, then passed after the correction; ordinary rail and desktop behavior tests pass too.
- C2 already handled — the public Home connection’s `approved`/`savedKey` fields belong to the workbench-only fake bridge. `mock-shim-window.test.ts` stubs network fetch to throw, exercises read, light mutation, socket open/send/close, blocks arbitrary targets, bank actions and camera starts, and asserts network fetch was never called. A browser DOM check also operated the actual sandboxed page’s light and observed both UI and fake-house changes. No real credential or home connection is created.
- C3 rejected as a defect — website `radius: 24px` is a page-layout radius, not a token claimed by the YouCoded manifest (which has no shape section). It matches the current built-in Round popup radius (`globals.css --radius-xl: 24px`) and is visible in the review; palette, font, wallpaper, panel blur and opacity are pinned to the actual manifest.
- C4 accepted/applied — the site theme guard now checks the generated default mascot chip’s accent AND the generator’s YouCoded picker row against the canonical manifest accent.

Additional investigation: `npm run build:site` previously emitted into `desktop/src/docs/site`, because Vite resolves output paths relative to `src/renderer`, not the shell directory. The command now uses `../../../docs/site`. A red→green path test pins the served output location. The session’s accidentally generated wrong-target directory was removed; no shared or user files were touched.

The refreshed renderer no longer uses native `title` on caption buttons. Phone-only website CSS now targets `.caption-buttons`, retaining the existing no-window-controls-on-phone behavior. Its source coupling test was red→green; the real phone embed’s computed display is `none`.
