---
status: active
date: 2026-09-04
feature: linux-buddy-helper
round: 2
design: docs/active/design/2026-09-04-linux-buddy-helper/technical-design.md (now revision 3)
---

# Linux buddy helper — design review, round 2

**13 findings, 13 accepted, 0 rejected.** Verdict on revision 2: *not yet
buildable as written*. Round 3 follows; it is the last the flow allows.

The round-1 follow-through was checked finding by finding: nine of the thirteen
were genuinely resolved, one was resolved with a defect (R1-1 → F6), one was
routed correctly but left incomplete (R1-9 → F7/F8), and **two were named but not
resolved** (R1-3 → F1, R1-12 → F2).

| # | Finding | Verdict |
|---|---|---|
| R2-F1 | One fixed plugin id means a dev instance's install replaces production's helper, a dev "Remove helper" deletes it, and R11's silent reinstall makes the two fight every launch. R1-3 is not closed; the design asserted it was. | accepted — token moved into the plugin **id** |
| R2-F2 | The `supported` capability probe **cannot be built**: KWin's scripting DBus has no return path for whether a script ran (`run()` is void). It would report success on exactly the Plasma 5 it was written to exclude. | accepted — replaced by a version gate off `supportInformation()`, measured |
| R2-F3 | `isScriptLoaded` proves a helper is loaded, not that it accepts *this* app. | accepted — dissolved by F1 |
| R2-F4 | §0's `resourceClass` claim is false and the value was never measured. | accepted — **measured**: WM_CLASS is `package.json` `name`, identical for dev and production. Explicit `--class` added |
| R2-F5 | The skipTaskbar/skipSwitcher/skipPager claim is **true** (verified writable in `window.h`), but those flags miss Overview, KRunner, the screen-share picker and panel title widgets — and the caption leaks the token there. | accepted — caption shortened to `YC:<role>@x,y`, tokenless; eyeball check added |
| R2-F6 | `positionOf` returning a Point is too narrow: six of the nine reads need a full rect, and `getBounds` is legitimate for size. | accepted — `rectOf` |
| R2-F7 | The replacement consent sentence does not exist; the false one is still on the branch. | accepted — sentence written into §6 |
| R2-F8 | Remove helper is a table row, not a flow, and it collides with contract row R6 ("the popup is one row"). | accepted — R6 named as amended, removal order specified, test added |
| R2-F9 | Electron/KWin coordinate-space equivalence is unproven and all of §3 depends on it. | accepted — **measured, and it holds** |
| R2-F10 | The 60 fps measurement was one window; the drag path renames three. | accepted — one caption carries the group |
| R2-F11 | "Four surfaces" is still short — the real parity set is six. `SessionService.kt` has no buddy references at all. | accepted — six listed; new block deliberately scoped to the three helper channels |
| R2-F12 | Contract row R13 appears nowhere in the design. | accepted |
| R2-F13 | A second stale comment of the kind §7 exists to fix (`App.tsx:3838-3841`). | accepted |

## What round 2 confirmed sound

§2's attach-ordering fix; §3's read/write inventory (every line number checked
and correct); §5's consent gate (one `show()` call site, so a main-side refusal
is sufficient); §7's kwin-keep-above analysis; §1's asar warning; and all six
R1-13 sub-items.

## The two measurements this round forced

Both were assertions in revision 2. Both were run headlessly before revision 3:
the coordinate spaces **match** (so §3 is safe), and `resourceClass` **does not**
separate dev from production (so §0's security foundation was rebuilt).
