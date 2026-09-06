---
status: shipped
date: 2026-09-04
feature: linux-buddy-helper
scope: narrow — only the work-area material added in revision 5
against: technical-design.md revision 5
outcome: 12 findings, 12 accepted, 0 rejected → revision 6
---

# Round 4 (narrow) — the work-area resolver

Rounds 1-3 reviewed the whole design (36 findings, all accepted, cap reached).
Round 5 then added an entirely new mechanism — the work-area resolver — in
response to probe Round 6, and that material had never been reviewed. Destin's
call, 2026-09-04: *"what are the review questions? trust your judgement for
those."* So this round is deliberately **narrow**: §0's resolver, §9's
multi-monitor deferral, §8's new test, §6's revised R11 sequence, and §3's
now-measured no-readback claim. Nothing else was re-reviewed.

**12 findings, 12 accepted, 0 rejected.** Three severe enough to have shipped
the bug the section was written to remove.

## Verification of the reviewer's own claims

Every mechanically checkable claim was re-run in the main session before
acceptance, because a reviewer's numbers are worth exactly as much as the
command behind them:

| Claim | Re-verified |
|---|---|
| Plain `qdbus6` writes its struct error to **stdout** and exits **0** | yes — `exit=0`, `stdout=[qdbus: I don't know how to display an argument of type '(iiii)'…]`, `stderr=[]` |
| `org.kde.plasmashell` has no DBus activation file; it is a systemd user unit | yes — only `org.kde.plasma.Notifications.service` exists; `/usr/lib/systemd/user/plasma-plasmashell.service` |
| 12 `.workArea` reads in `buddy-window-manager.ts` at 129/162/171/302/308/318/435/440/504/578/624/631 | yes, exactly |
| Three of them are `getPrimaryDisplay().workArea` (302, 435, 624) | yes |
| 5 exempt reads in `buddy-overlay-manager.ts`, 14 in `overlay-state.ts` | yes |
| `chooseBuddyStrategy` never returns `'overlay'` without an env override | yes — `buddy-manager.ts:38-46` |
| `buddy-overlay-manager.ts:157-168` already argues for all three display events; `:110` records the 3-in-200 ms burst | yes |
| `StrutManager` introspects to three methods, zero signals, zero properties | yes |
| `dbus-send` and `qdbus6 --literal` output shapes | yes, both captured |

Nothing the reviewer asserted failed re-verification. Two claims it explicitly
marked **unverified** — the coordinate space of `availableScreenRect` on a
non-primary screen, and multi-screen behaviour of an unknown name — remain
unverified and are now on §9's list for the hardware run.

## The findings

| ID | Severity | One line | Where it landed |
|---|---|---|---|
| R4-F1 | SEVERE | A mis-matched screen hands `clampToWorkArea` another monitor's global rect; it re-clamps every drag frame and the buddy cannot be dragged back | §0.3 — containment check |
| R4-F2 | SEVERE | The repo's qdbus wrapper cannot read a `(iiii)`; plain `qdbus6` errors on **stdout** at exit 0, so the resolver silently parses garbage | §0.1 — exact invocation + parse |
| R4-F3 | SEVERE | "Falls back to the full rect, the correct fail-safe" is R3-F7's origin-screen over-claim again, and the fallback *is* the bug | §0.4 — `resolved: boolean`, honest wording |
| R4-F5 | SEVERE | `show()` is synchronous and places in the constructor; the resolve is async, so the first buddy of every session is placed wrong and nothing corrects it | §0.6 — awaited before the first window |
| R4-F4 | MODERATE | The re-resolve triggers are blind to panel changes, no `StrutManager` signal exists, and two of three display events were omitted | §0.7 |
| R4-F6 | MODERATE | R11's version marker is the file the update overwrites; two crash windows leave a user permanently on a stale helper that reports itself up to date | §6 — `helperLoadedVersion` |
| R4-F7 | MODERATE | Orphan cleanup deletes files without `unloadScript`, contradicting §6's own stated reason | §1 |
| R4-F8 | MODERATE | The synthetic test authors both sides of the comparison, so it cannot test whether the two number sources agree | §9 — five named blind spots |
| R4-F12 | MODERATE | plasmashell is not DBus-activatable; a restart or the login race silently yields the fallback | §0.5 — retry, last good wins |
| R4-F9 | MINOR | §9's off-screen reassurance rested on a line §8 requires changing | §9 — re-derived from containment |
| R4-F10 | MINOR | §8 asserted a source scan with no inventory and no exemptions; it would fail the moment it was written | §0.8 — twelve lines, exemptions named |
| R4-F11 | MINOR | The `Screens` parse omits `Enabled:` and says nothing about duplicate geometries (Plasma mirroring) | §0.2 |

## Why this round was worth running

Two of the three severe findings would have broken the feature **on a
single-screen machine, silently, with no error anywhere** — R4-F2 (the qdbus
error arriving on stdout at exit 0) and R4-F5 (a synchronous `show()` racing an
async resolve). Both would have shipped the exact 52 px taskbar bug that §0 was
written to remove, and probe Round 6 could not have caught either, because both
live in code that did not exist when the probe ran.

The third, R4-F1, changes what the deferred two-screen test *costs*. Revision 5
told Destin the worst case was cosmetic and draggable. It was not: a mis-matched
screen produces a buddy pinned to the wrong monitor and undraggable — the very
symptom the feature was commissioned to remove. The containment check restores
the claim revision 5 made prematurely.

## Verdict

Not buildable as revision 5; buildable as revision 6. This was a page of
corrections, not a redesign — every finding landed as a specified invocation, a
named await point, one containment check, or an honest sentence replacing an
over-claim.
