---
status: active
date: 2026-09-04
feature: linux-buddy-helper
round: 3
design: docs/active/design/2026-09-04-linux-buddy-helper/technical-design.md (now revision 4)
---

# Linux buddy helper — design review, round 3 (final)

**10 findings, 10 accepted.** Verdict on revision 3: *not buildable as written* —
but "a page of corrections, not a redesign". Three rounds is the cap, so this is
the last review; revision 4 answers all ten.

The reviewer ran its own measurements against live KWin 6.7.3 rather than
reasoning, which is what caught the biggest one.

| # | Finding | Verdict |
|---|---|---|
| R3-F1 | **`--class=` does not work.** Six launches of the same Electron binary — `--class`, `--name`, `--app-id`, `appendSwitch('class')`, `app.setName()` — all reported `resourceClass youcoded`. Only `package.json` `name` moves it; the switch lives in a Chromium file Electron does not build. Revision 3's own fix for R2-F4 was false. | accepted — replaced by `window.pid` |
| R3-F2 | With F1 gone, §3's group caption would let a **dev instance move the live app's windows** — one window's caption naming another's target, resolved across instances that share a `resourceClass`. The R2-F10 fix reintroduced the live-app hazard. | accepted — group caption reversed (F6) and pid grouping added |
| R3-F3 | Nothing derived, stored or cleaned up the per-install token. A reset profile mints a new one and installs a **second** package while the first stays enabled; orphans are not inert (N orphans = N handlers writing geometry per frame); "Remove helper" only knows the current token; `[Plugins]` accrues a dead key per token. | accepted |
| R3-F4 | The version gate has **no Wayland test**, so KDE **X11** users — whose buddy works fine — would get a consent card they do not need and lose a working buddy if they declined. There is no Wayland/X11 detection anywhere in the desktop source. | accepted — `Operation Mode: Wayland` is already in the same response |
| R3-F5 | **Contract rows R2/R10 were never amended.** The design's frontmatter claimed they were; the JSON still carried the old statement and source, and `contract-check` reported green against a row the design refuses to build. | accepted — amended, re-checked |
| R3-F6 | §2 and §3 stated two different caption grammars and the group form was never written; single-window moves survive anyway (`showBar()`, `layout()`); and the premise was unmeasured. | accepted — reverses R2-F10; per-role grammar restored, measurement required first |
| R3-F7 | The coordinate measurement is real but over-claimed: one screen at the origin is the configuration in which the claim cannot fail. The real risks (a second screen's offset; 1.4997 vs 1.5) were excluded. Also: `workArea` and KWin's `workspace` are different rectangles and the design treated them as one. | accepted — claim narrowed, authoritative rectangle named |
| R3-F8 | "Six surfaces" plus "only three channels" left the edit set ambiguous; buddy has zero Kotlin and zero remote-server presence. | accepted — four files named, omissions stated |
| R3-F9 | "Wire `captionChanged` on every window" would run helper JS inside the compositor on every title change in the session. | accepted — filter at `windowAdded` |
| R3-F10 | Leftovers: a stale `positionOf` name in §8; `buddy:remove-helper` missing from MOCK_ONLY; `addHelper` never clears its loading state on failure; the version parse must anchor `^KWin version:`. | accepted |

## What survived three rounds of attack

The read/write inventory (every line number re-verified), the attach-ordering
fix, the skip-flag mechanism (re-confirmed at runtime: `skipTaskbar`,
`skipSwitcher`, `skipPager`, `keepAbove` all writable and all took effect on a
live window), the main-side consent gate, the `kwin-keep-above` analysis, the
asar warning, half-install rollback, and R12/R13.

## Measurements this review produced

- `--class`/`--name`/`--app-id`/`setName` do **not** change `resourceClass`;
  `package.json` `name` does.
- `window.pid` is exposed to KWin scripts and is correct.
- `supportInformation()` carries both `KWin version:` and `Operation Mode:`.
- KWin 6 geometry is **fractional** (`y:463.666…` at 1.5× scale).

## Standing before build

Four measurements remain open and are named in the design rather than assumed:
three windows at 60 fps (§3), multi-monitor (§9), KWin-restart survival (§9),
whether overwrite+reconfigure reloads a script (§6), plus an eyeball check of
Overview and the screen-share picker mid-drag (§2).
