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
   (revision 6). It is the build spec.
2. Read the contract — `linux-buddy-helper.contract.json` in the same folder.
   13 rows, signed. It is the definition of done.
3. Skim the four review files in `docs/active/reviews/2026-09-04-linux-buddy-helper-design-review-{1,2,3,4}.md`.
   48 findings, all accepted. **Most of them are things a fresh session would
   otherwise redo.** Round 4 is narrow and the most load-bearing per word — it
   is the only review of §0's work-area resolver, and two of its findings would
   have shipped the bug §0 exists to remove, silently, on one screen.

## Where it stands

| Stage | State |
|---|---|
| Probe (does the mechanism work?) | done — `docs/active/prototypes/2026-09-04-buddy-kwin-helper-probe/` |
| Questions decks | answered, committed |
| UI, built in the workbench | **merged on the branch, approved** (review round 2, B-1/B-2/B-3 all yes) |
| Contract | signed 2026-09-04 21:10; R2/R6/R10 amended by the decide deck |
| Technical design | revision 6 — rounds 1-3 (36 findings) + a narrow round 4 on the work-area material (12 findings); probe rounds 3-6 folded in |
| **Build** | **not started** |
| Acceptance | not started |

`bash scripts/verify.sh worktrees/linux-buddy-helper` passes all six checks.

## Next steps, in order

### 0 · Measurements before writing code — **done**

All four resolved on 2026-09-04 — three measured, one deferred by Destin. Every
headless round left the machine byte-identical (`kwinrc` diffed against a
pre-probe backup) and nothing is installed. Probe FINDINGS rounds 3-6.

- ✅ **Three windows at 60 fps** (§3) — holds. 363/363 renames applied, all exact,
  188/sec. The per-role grammar stands; no group format to write.
- ✅ **Overwrite + `reconfigure`** (§6, R11) — **does NOT reload.** `unloadScript`
  must come first. The update sequence is now a required, testable order.
- ⚠️ **A defect fell out of this** (Round 6): Electron's `display.workArea` on
  Wayland is the *full screen*, panel included, so §0's authoritative rectangle
  was wrong and the buddy would have docked 52 px onto the taskbar. §0 is
  rewritten around plasmashell's `StrutManager`. **Read §0 before building.**

- ✅ **Caption leak** (§2) — Destin, live, dragging the real grammar with the
  three skip flags set: *"the buddy is not listed."* Overview and the
  screen-share picker show nothing. KRunner's window search and panel title
  widgets stay unchecked and are accepted as a known gap.
- ⏸️ **Multi-monitor** (§9) — **deferred by Destin** ("we will skip tv for now",
  2026-09-04). The half that is logic — matching Electron displays to KDE screen
  names by bounds — moves into unit tests against synthetic inventories (§8).
  Roadmap item filed for the real two-screen run before release. Do **not**
  re-open this as a blocker.

Rig for both, if it is ever needed again:
`bash docs/active/prototypes/2026-09-04-buddy-kwin-helper-probe/round5-live.sh`

### 1 · Task breakdown
Descriptions, not pre-written code (feature-flow default; pre-written code only
for cross-repo, stored-data or strict-order work). Rough shape:

1. Shared qdbus module extracted from `kwin-keep-above.ts` (do not re-implement).
   Also serves §0's `StrutManager` and `supportInformation` calls.
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
10. The work-area resolver (§0) — `supportInformation` screen map +
    `StrutManager`, with both fallbacks.
11. The nine tests in §8.

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
- **`win.on('move')` never fires for a compositor-side move** (measured, Round 6)
  — position is never saved unless persistence moves into `place()`. There is
  **no** readback of any kind: `getBounds()` stays at `0,0` forever.
- **Electron's `workArea` is a lie on Wayland** — equal to `bounds`, panel
  included. Never clamp to it; use §0's resolver.
- **Plain `qdbus6` cannot read the work-area struct** — it prints
  "I don't know how to display an argument of type '(iiii)'" **to stdout** and
  **exits 0**, so the repo's existing wrapper reports success with garbage. Use
  `--literal` or `dbus-send`, and treat unparseable stdout as failure (§0.1).
- **`show()` is synchronous** and places the window in its constructor. The
  work-area resolve is async and must be awaited **before the first buddy window
  exists** (§0.6) — there is no readback to correct it afterwards.
- **`StrutManager` has no signals.** Verified by introspection. A panel change
  fires no event anywhere; do not go looking (§0.7).
- Dev instances share a `resourceClass` with production. Assume collision.

## Open, needs Destin

- Whether "not yet supported on this desktop" should become a real roadmap item
  for GNOME support, or the wording should be flattened. Asked, not answered.
- Three roadmap candidates from the contract agent, unfiled: GNOME gets no
  buddy; an unpinned buddy is no longer possible; guards for the install
  lifecycle.
