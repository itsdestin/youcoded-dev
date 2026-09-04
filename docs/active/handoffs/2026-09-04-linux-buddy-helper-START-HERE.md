---
status: active
date: 2026-09-04
feature: linux-buddy-helper
branch: feat/linux-buddy-kwin-helper (youcoded)
worktree: worktrees/linux-buddy-helper
stage: design complete, build not started
---

# Linux buddy helper — START HERE

The buddy appears on Linux Wayland but is **stuck** — it cannot be dragged,
because an app may not move its own window there. A KWin helper script can.
Everything up to the build is finished, reviewed and signed. **No backend exists
yet.**

## Do this first

1. Read `docs/active/design/2026-09-04-linux-buddy-helper/technical-design.md`
   (revision 4). It is the build spec.
2. Read the contract — `linux-buddy-helper.contract.json` in the same folder.
   13 rows, signed. It is the definition of done.
3. Skim the three review files in `docs/active/reviews/2026-09-04-linux-buddy-helper-design-review-{1,2,3}.md`.
   36 findings, all accepted. **Most of them are things a fresh session would
   otherwise redo.**

## Where it stands

| Stage | State |
|---|---|
| Probe (does the mechanism work?) | done — `docs/active/prototypes/2026-09-04-buddy-kwin-helper-probe/` |
| Questions decks | answered, committed |
| UI, built in the workbench | **merged on the branch, approved** (review round 2, B-1/B-2/B-3 all yes) |
| Contract | signed 2026-09-04 21:10; R2/R6/R10 amended by the decide deck |
| Technical design | revision 4, three review rounds, cap reached |
| **Build** | **not started** |
| Acceptance | not started |

`bash scripts/verify.sh worktrees/linux-buddy-helper` passes all six checks.

## Next steps, in order

### 0 · Four measurements before writing code
All cheap; the probe rig is on disk and all of them are currently *assumptions*
in the design.

- **Three windows at 60 fps** (§3). Decides whether the per-role caption channel
  holds or a group grammar is needed. Extend `follow-holder.js`.
- **Multi-monitor** (§9). Needs Destin's TV connected — ask him. Does
  `frameGeometry` address the second screen, and does per-screen scale survive?
- **Does overwrite + `reconfigure` reload a loaded script?** (§6, row R11). If
  not, "updates replace the helper quietly" means "at next login", a different
  promise.
- **Eyeball Overview and a screen-share picker mid-drag** (§2). `skipTaskbar`
  etc. do not cover them. Destin's eyes, not a script.

### 1 · Task breakdown
Descriptions, not pre-written code (feature-flow default; pre-written code only
for cross-repo, stored-data or strict-order work). Rough shape:

1. Shared qdbus module extracted from `kwin-keep-above.ts` (do not re-implement).
2. `kwin-helper.ts` — status (version + Wayland gate), install, remove, orphan
   sweep, half-install rollback.
3. The bundled helper package + asar handling.
4. `place()` / `rectOf()` in `buddy-window-manager.ts` — 9 writes, 9 reads,
   3 constructor placements, persistence off `win.on('move')`.
5. Caption guard: constructor title + `page-title-updated` preventDefault for
   buddy windows in production.
6. Three IPC channels across four files.
7. Main-side consent gate on `BUDDY_SHOW`.
8. Remove helper UI + the replacement consent sentence (§6 carries the exact
   wording — do not invent it).
9. The R12 renderer migration.
10. The eight tests in §8.

Then subagent build, **a reviewer per task**.

### 2 · Acceptance
Write `linux-buddy-helper.contract.verdicts.json`, run
`review-cards.py acceptance`, serve the acceptance deck. R6 needs both states
re-shot (one row for a new user, two once the helper is installed).

## Traps that already cost a round each

- **`--class=` does not work.** Measured six ways. Only `package.json` `name`
  moves `resourceClass`. Do not try it again.
- **Identity is two problems.** `resourceClass` against a hostile window (raises
  the bar, does not seal it); **`window.pid`** against our own other instance.
  Never one mechanism for both.
- **KDE X11 must be a no-op.** Those users' buddy works today. Gate on
  `Operation Mode: Wayland`.
- **`skipTaskbar` is a no-op on Wayland.** The helper sets it, from inside KWin.
- **KWin's scripting DBus cannot tell you whether a script ran.** `run()` is
  void. Do not design a capability probe.
- **`win.on('move')` never fires for a compositor-side move** — position is
  never saved unless persistence moves into `place()`.
- Dev instances share a `resourceClass` with production. Assume collision.

## Open, needs Destin

- Whether "not yet supported on this desktop" should become a real roadmap item
  for GNOME support, or the wording should be flattened. Asked, not answered.
- Three roadmap candidates from the contract agent, unfiled: GNOME gets no
  buddy; an unpinned buddy is no longer possible; guards for the install
  lifecycle.
