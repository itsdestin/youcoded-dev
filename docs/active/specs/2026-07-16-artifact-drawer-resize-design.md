---
status: active
---

# Artifact drawer: drag-to-resize width — design

**Issue:** youcoded#105 · **Approved:** 2026-07-16 (Destin, in-session) · **Scope:** desktop renderer only

## Goal

The artifact drawer is currently fixed at 480px (or expand-to-fill). Add a draggable
divider on the drawer's inner edge so the user can set any intermediate width, and
remember that width across app restarts **and app updates**.

## UX behavior

- A slim (~6px hit area) grab handle on the drawer's left edge. `col-resize` cursor on
  hover, subtle highlight while hovered/dragging. Width follows the pointer live.
- **Double-click the handle → reset to the 480px default.**
- Handle is hidden in expand-to-fill mode and does not exist on the games panel (the
  games panel keeps its fixed 400px).
- One **global** width preference — not per-session — matching `drawerExpanded`'s
  existing global semantics.
- Clamps: min **320px**; max **60% of the window width**. Re-clamp on window resize and
  at load, so restoring on a smaller window never overflows the chat pane.

## Persistence

`localStorage` key `youcoded-drawer-width`, following the house pattern for remembered
UI prefs (`youcoded-theme`, `youcoded-font`, … in `theme-context.tsx`). localStorage
lives in the Electron `userData` profile, which survives restarts and app updates.
Rejected alternatives: `settings.json` IPC or a main-process store — both also survive
updates but add plumbing for a preference that has no cross-device sync need.

## Implementation shape (from 2026-07-16 recon)

- Width is already centralized in the CSS var `--right-pane-width`
  (`App.tsx:2449` sets it; `globals.css:1186/1328/1478` consume it, including the
  chrome-glass cutout math, which therefore follows automatically).
  The drag updates this var (games-panel-open case keeps its 400px branch).
- The drawer's inner `w-[480px]` literal (`SessionDrawer.tsx:~424`) switches to read
  the same var so the two widths can't drift — per `.claude/rules/react-renderer.md`
  ("both read `var(--right-pane-width)`").
- New pref plumbed through `theme-context.tsx` alongside the other localStorage prefs.
- Drag implementation: pointer capture on the handle; no re-render per mousemove —
  write the CSS var directly during drag, commit to state/localStorage on pointer-up.
- A pure clamp helper (`clampDrawerWidth(width, windowWidth)`) with unit tests.

## Testing

- Unit: clamp helper (min/max/60%/NaN-fallback cases).
- Existing `artifact-tracker.test.ts` untouched (no reducer change needed — width is a
  theme-context pref, not reducer state).
- Live verification in the dev instance (`bash scripts/run-dev.sh`): drag, double-click
  reset, restart-persistence, expand-toggle interaction, games-panel exclusivity.

## Out of scope

- youcoded#104 (version timeline + restore) and youcoded#103 (AI quick actions) — the
  rest of Bundle D, separately designed.
- Per-session widths; syncing the width between devices; Android (drawer already
  degrades there); resizing the internal 210px artifact list column.
