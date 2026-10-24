---
status: shipped
card: 90
branch: session/page-custom-icons
shipped: youcoded#645, wecoded-marketplace#111
---

# Custom Page Icons Implementation Plan

> **For agentic workers:** Execute inline with the existing test-driven-development procedure. Quick route approved in chat: one visual review, then complete implementation/testing; no extra questions/contract rounds. Do not commit, merge, deploy or release without a new instruction.

**Goal:** Every newly built Page carries a purpose-designed outline icon; Home uses a house in the app and website demo, and Page Builder teaches agents to author icons rather than select stock glyphs.

**Architecture:** Retain `icon` as a legacy named fallback. Add optional `customIcon: { version: 1, paths: string[] }` to Page metadata. A pure shared validator accepts bounded SVG path geometry; PageGlyph creates React `<path>` elements under the app’s existing fixed 24×24/currentColor/2px/round-cap/round-join wrapper. No SVG markup, images, styles, scripts or external resources are accepted. Old app versions ignore the new property and keep the existing fallback.

**Tech Stack:** TypeScript, React, Vitest; Markdown skill instructions; existing Vite site build and screenshot tools.

## Constraints

- Existing built-in icon names continue to work unchanged.
- Unsupported versions, malformed geometry, nonfinite/oversized values, more than 12 paths, paths over 2,048 characters or over 8,192 total characters fall back without dropping the Page.
- Validate SVG command arities (M/L/H/V/C/S/Q/T/A/Z, absolute or relative), initial move, finite bounded numbers and arc flags; do not rely on a loose character allowlist.
- All caller locations (pin, Page host/rail, library, connections) use the same metadata and renderer. Android and remote reuse the existing shared Page summary payload; no new IPC channel.
- Do not experiment on the running app or modify the installed plugin. During development leave the installed Home manifest unchanged. After visual approval and implementation verification, apply only the user-requested icon metadata with a backup, leaving HTML/data/connections intact; the older installed app keeps its fallback until updated.
- New instructions require a fresh semantic design for each Page in the app’s outline style, readable at 16px, distinguishable from unrelated nearby Pages, no emoji/text/brand-colour artwork. Draw geometry on a 24×24 grid, normally inside 2–22.
- Home is the requested house example. Do not redesign unrelated existing Pages or add unrequested demo Pages.

## Task 1 — UI preview and safe shared geometry

Files: create `youcoded/desktop/src/shared/page-custom-icon.ts` and `youcoded/desktop/tests/page-custom-icon.test.ts`; extend `src/shared/pages-types.ts`; extend `src/renderer/components/pages/page-icons.tsx` and add `tests/page-icons.test.tsx`; update PageGlyph callsites in PageHost, PagesView, PagesButton and page-connections; update Home workbench manifest/summary.

Interface:
```ts
export interface PageCustomIcon { version: 1; paths: string[] }
export function parsePageCustomIcon(value: unknown): PageCustomIcon | undefined;
// PageSummary: customIcon?: PageCustomIcon
// PageGlyph props: icon: PageIcon; customIcon?: PageCustomIcon; className?: string
```

- [x] Write failing validator tests for valid house geometry, legacy absence, unsupported version, script/tag text, URL/style text, wrong arity, missing initial move, nonfinite/huge numbers, invalid arc flags and bounded payloads.
- [x] Implement the shared validator and prove red→green.
- [x] Write failing renderer tests that accepted custom paths replace the stock path while keeping the existing wrapper/style; absent or invalid custom data still uses the named fallback.
- [x] Implement PageGlyph and thread the optional field through all PageGlyph callsites.
- [x] Give the existing Home workbench manifest and summary this house artwork:
```json
{"version":1,"paths":["M3 10 L12 3 L21 10","M5 9 L5 21 L10 21 L10 15 L14 15 L14 21 L19 21 L19 9"]}
```
- [x] Capture Home’s pinned/header, Pages list and focused view against current master. Show a small before/after review using the actual renderer; light and wallpaper/dark themes, desktop and phone. Review at the real 16px size, not only enlarged artwork.

## Task 2 — Persist and deliver metadata after visual approval

Files: `youcoded/desktop/src/main/pages/pages-store.ts`, `desktop/tests/pages-store.test.ts`; Home fixture/template metadata where needed. Existing `pages:list`/`pages:changed` payloads already carry PageSummary.

- [x] Add failing store tests proving a valid custom icon survives list/get, missing/custom-invalid data falls back without hiding the Page, and legacy icon behavior stays unchanged.
- [x] Normalize `customIcon` with `parsePageCustomIcon` in readManifest and carry it into both summary and document results; do not forward arbitrary manifest properties.
- [x] Run store, service, renderer, workbench and existing IPC parity tests. Inspect any exact-shape assertions rather than weakening them.

## Task 3 — Builder instructions and verification

Files: `wecoded-marketplace/wecoded-pages-plugin/skills/page-builder/SKILL.md`, a short `reference/icons.md`, plugin source tests and `plugin.json` version. Update the relevant Page authoring reference in the app if it duplicates the manifest shape.

- [x] Read the existing plugin validation/build commands. Update source only, not installed plugin files.
- [x] Add the new manifest example with the legacy fallback and versioned custom geometry. Require agents to design and check a new purpose-specific icon for every newly created Page, in the fixed app iconography style; do not instruct choosing from a stock list.
- [x] Document limits, safe path-only format, 16px inspection and old-app fallback. Preserve existing icons during unrelated edits unless the user requests a redesign.
- [x] Bump the plugin version when preparing publication, rebuild using existing tooling, and run its relevant validation/tests. Offer the optional model evaluator; no paid evaluations without approval.
- [x] Rebuild the website embed/posters after approved integration. Run `bash scripts/verify.sh <app-worktree>`, plugin checks and actual browser checks for the Home icon in the pinned button/list/header. Report what ran and what still requires an app update.

## Approval and delivery

The user approved custom-designed icons and the quick review route. The previous website deployment (#166) is closed; this work joins existing #90’s Page-icons follow-up. The user approved both visual steps (I-1/I-2). The requested icon-only Home manifest metadata addition was applied after implementation checks with a private backup; no HTML, data or connections changed. The user subsequently authorized merge/close. App PR #645 and marketplace PR #111 are merged; the live website house icon and public Page Builder 0.3.0 instructions were verified after successful deployment/registry rebuild. Final local verification passed 4,462 related tests and all other gates; required Linux/Android and plugin CI passed. No app release or manual installed-plugin update was performed.
