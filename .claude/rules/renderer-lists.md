---
paths:
  - "**/desktop/src/renderer/**"
last_verified: 2026-09-23
verify:
  - path: youcoded/desktop/src/renderer/hooks/use-chunked-reveal.ts
    contains: "REVEAL_CHUNK = 50"
  - path: youcoded/desktop/src/renderer/hooks/use-entry-folding.ts
  - path: youcoded/desktop/src/renderer/hooks/useTagRegistry.ts
  - path: youcoded/desktop/src/renderer/components/diff/UnifiedDiff.tsx
    contains: "FILE_BOX_CHUNK = 200"
  - path: scripts/ui-review/dom-size-sweep.mjs
    contains: "NODE_BUDGET = 8000"
  - test: youcoded/desktop/src/renderer/hooks/use-chunked-reveal.test.tsx
  - test: youcoded/desktop/src/renderer/hooks/use-entry-folding.test.ts
  - test: youcoded/desktop/src/renderer/hooks/useTagRegistry.shared.test.tsx
  - test: youcoded/desktop/tests/ResumeBrowser.test.tsx
  - test: youcoded/desktop/tests/ConversationsTab.test.tsx
  - test: youcoded/desktop/tests/files-tab-list-view.test.tsx
  - test: youcoded/desktop/tests/session-preview-pane.test.tsx
  - test: youcoded/desktop/tests/BubbleFeed.test.tsx
  - test: youcoded/desktop/tests/MarketplaceScreen.test.tsx
  - test: youcoded/desktop/tests/ModelPicker.test.tsx
  - test: youcoded/desktop/tests/CsvView.test.tsx
  - test: youcoded/desktop/tests/game-reducer.test.ts
  - test: youcoded/desktop/tests/unified-diff-fill.test.tsx
  - test: youcoded/desktop/tests/tool-body.test.tsx
  - test: youcoded/desktop/tests/SessionDrawer-scripted-state.test.tsx
---
# Lists and timelines — draw only what can be seen

Nothing the user cannot see is built. Pick the technique by shape. Numbers, rejected alternatives and the lessons below in full: `youcoded/docs/renderer-chrome.md` → "Lists and render cost".

- **A card/row list of the user's own things uses `useChunkedReveal` (50 at a time) with memoised rows.** Why: Resume 804 → 96 ms at 1,642 conversations; Projects → Conversations 175 → 59 ms. **A new list of the user's own things ships with its own stress pin: 1,000+ items in, no more than one chunk drawn, seen red with the bound removed.** Guard: the hook test, each surface's pin (the `test:` lines above), and `scripts/ui-review/dom-size-sweep.mjs` (8,000 elements; every screen of the shoot list opened by name under `stress`; on request, not in `verify.sh` — it needs a browser).
- **`resetKey` holds every input that changes the list's contents (query, filter, sort, view), never item identity** — or each refresh throws the reader back to the top. A tab hidden and shown again passes `resetScrollOnActivate: false`. Guard: the hook test.
- **A memoised row gets stable props.** A fresh wrapper object (`{kind, entry}`) or inline closure per render silently defeats `React.memo` (Marketplace, caught in review). Handlers go through a latest-handlers ref (`SkillCard` `handlersRef`, SessionDrawer `rowActions`) so a skipped row never calls a stale one. Guard: `SessionDrawer-scripted-state.test.tsx`.
- **Hidden-but-mounted tabs and context readers: `performance.md` rules 2–3.** Accepted limit: `MarketplaceCard` reads `useMarketplace()`, so an install redraws the visible cards.
- **Timelines fold with `useEntryFolding`** (ChatView, SessionPreviewPane, BubbleFeed): far-off entries become spacers of their last height. It must observe entries registered before its observer existed (`8586a4fb`). Guard: `use-entry-folding.test.ts` + the preview and buddy pins.
- **A collapsed preview draws a real slice** — file boxes 15 lines collapsed, 200-line chunks in a capped scroller expanded. A host that already scrolls (conflict diff, context popup, git review) passes `fill` to `UnifiedDiff`, never a nested capped box. Guard: `unified-diff-fill.test.tsx`, `tool-body.test.tsx`.
- **Data several surfaces read is one store** (`useTagRegistry`), never a fetch per mount — a late answer redraws the whole list and tags pop in. Guard: `useTagRegistry.shared.test.tsx`.
- **`content-visibility: auto` only on glow-free self-contained blocks** (`.yc-code-block`); `hidden` for whole inactive views. Never on `.timeline-entry` or cards — its paint containment clips theme glows (`globals.css` `.timeline-entry`). `SubagentTimeline`'s is a recorded exception (render-cost plan, out of scope). Guard: none — candidate.
