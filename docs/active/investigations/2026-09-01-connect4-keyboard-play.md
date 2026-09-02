---
date: 2026-09-01
status: active
type: investigation
topic: Connect 4 board cannot be played from the keyboard
---

# Connect 4's columns are plain `div`s — no keyboard route, nothing announced

**Roadmap entry:** `docs/roadmap/games.md`.
**History:** added 2026-08-31 (noticed while adding the review rig's `data-col` hook);
re-verified against today's code 2026-09-01.

Two games in the same arcade panel answer accessibility differently. `ChessBoard.tsx` renders
every square as a `<button>` with an `aria-label` (and the promotion picker likewise), so it
can be played without a mouse and a screen reader hears each square.

`ConnectFourBoard.tsx` renders each column as a `div` with only mouse handlers:

The column element is a `div` carrying `onMouseEnter` and `onClick={() => handleColClick(col)}` — no `button`, `role`, `tabIndex`, `aria-label` or `onKeyDown` anywhere in the file (`rg` for those tokens finds only the two `onClick`s).
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/game/ConnectFourBoard.tsx", "contains": "onClick=\\{\\(\\) => handleColClick\\(col\\)\\}"} -->

So there is nothing to Tab to, Enter/Space do nothing, and assistive tech has no name for a
column. Deliberately NOT fixed when the `data-col` hook went in: making the columns real
buttons (or one focusable board with arrow-key column selection, as chess does per square) is
a rework of the board's markup, not a one-line addition. The hover ghost-disc and the
`canMove` gating would need keyboard equivalents.
