---
status: draft
date: 2026-09-04
revision: 9
feature: linux-buddy-helper
contract: linux-buddy-helper.contract.json (13 rows, signed 2026-09-04; R2/R10 amended by decide-uninstall#D-1)
branch: feat/linux-buddy-kwin-helper
review: rounds 1-3 (36 findings, 36 accepted) + round 4 narrow, scoped to the new work-area material (12 findings, 12 accepted) — docs/active/reviews/
measurements: probe rounds 3-7 (2026-09-04) closed §3, §2's caption leak and R11, and REVERSED R3-F7's work-area decision
---

# Linux buddy helper — technical design (revision 9)

Revision 1 was reviewed adversarially and every one of its thirteen findings was
accepted, three of them severe: a security hole, a dev-instance/production
collision, and a false claim about what users would see. This revision is written
against those findings; each section names the finding it answers.

## The problem

On native Wayland an application may not position its own windows, ask where they
are, or raise itself — and `setPosition` fails **silently**, because
`getPosition` echoes back whatever was last requested. So the buddy appears
wherever the compositor drops it and cannot be dragged. A KWin script runs inside
the compositor and is not bound by any of this. Probed 2026-09-04: position,
raise and readback all work at 60 fps
(`docs/active/prototypes/2026-09-04-buddy-kwin-helper-probe/FINDINGS.md`).

## 0 · Identity — the security foundation (R1-2, R1-3, R2-F1, R2-F4)

**A window caption is a string any program can choose. It is a data channel,
never an identity.** Revision 1 gated on a caption prefix alone, which would have
granted always-on-top and arbitrary repositioning to any window that named itself
correctly — including any **web page**, since a browser puts the page's own title
in its caption.

Revision 2 proposed gating on `resourceClass`, "the WM_CLASS Electron derives
from `appId`". **Measured 2026-09-04: that is false in both halves.** WM_CLASS
comes from `package.json`'s `name` (a probe named `buddy-kwin-helper-probe`
reported exactly that; the same binary run against a bare script file reported
`electron`), and `appId` is the Windows/macOS identifier, unused here. Since a
dev instance and production both run `desktop/package.json` with `name:
youcoded`, **`resourceClass` cannot tell them apart.** The dev/production
separation revision 2 claimed was an accident of how dev happens to be launched.

**Revision 3's own fix was then measured and is also false (R3-F1).** Chromium's
`--class=` switch does not reach Electron: the same binary, same session, six
launches — `--class`, `--name`, `--app-id`, `appendSwitch('class')`,
`app.setName()` (which moved `app.getName()` but not the window) — all reported
`resourceClass youcoded`. Only `package.json`'s `name` moved it. The switch lives
in a Chromium file Electron does not build.

So identity splits in two, because it was never one problem:

1. **Against a hostile window** — `resourceClass`. A web page cannot change its
   browser's `app_id`, which is R1-2's real case. Stated honestly: a hostile
   *native app* can set `app_id` to `youcoded` in one line, so this raises the
   bar rather than sealing it. `window.h:169` making it read-only *to scripts* is
   reassurance about the wrong actor — a script already has compositor privilege.
2. **Against our own other instance** — **`window.pid`**, which KWin exposes and
   which is correct (measured: the probe reported the exact pid the shell
   launched). A dev instance and production never share a pid, and one instance's
   mascot, chat and bar always do. **This is the discriminator the design needed
   and the previous two revisions never considered.** The helper groups by pid.
3. **The install** is owned by a per-install token in the plugin id — see §1,
   where the token is defined and orphans are cleaned. That governs *packages*.
   Windows are governed by pid. Revision 3 conflated the two.

Coordinates are validated before assignment, and `keepAbove` is never set on a
window that failed the identity check.

**Which rectangle is authoritative — revision 5 reverses R3-F7's answer, which
was measured false (probe Round 6).** R3-F7 chose Electron's `display.workArea`
*because* it excludes the Plasma panel. On Wayland it does not: measured
2026-09-04, `workArea` came back `{0,0 1707x1067}`, byte-identical to `bounds`,
while KWin reserved 52 px for the panel (`WorkArea = 1707x1015`). There is no
Wayland protocol that tells a client about panel struts, so this is not a bug to
wait out.

Left uncorrected, the buddy's default position
(`workArea.height - MASCOT_SIZE.height - 24`) and every dock and snap put the
mascot **52 px too low, sitting on the taskbar** — and `keepAbove` guarantees it
covers the clock and tray rather than slipping behind them.

**And the correction must happen in the app, not the helper.** The app gets no
readback of a compositor-side move — measured in the same round: four moves via
the caption channel, `getBounds()` stayed `0,0` every time, and `move` fired
exactly once, at creation. So a clamp applied inside the helper would be
invisible: the app's position would keep travelling past the panel while the
window stopped, and dragging back would feel stuck until the app's number caught
up.

**So `workArea` becomes a resolved value, not a raw Electron read.** Revision 5
named the DBus call and left everything around it to the build. Round 4's review
found two ways that silently produces the exact bug this section exists to
remove, on the developer's own machine, with no error anywhere — so the
invocation, the parse, the await point and the failure semantics are all
specified here.

**1 · The call, the exact invocation, and the exact parse (R4-F2).** The repo's
only qdbus wrapper (`kwin-keep-above.ts`) runs `execFile` with no flags and
treats exit 0 as success. That is unsafe here: `qdbus6` cannot render a D-Bus
struct without `--literal`, and it writes its complaint **to stdout** and
**exits 0**. Measured 2026-09-04:

```
$ out=$(qdbus6 … availableScreenRect eDP-1 2>/dev/null); echo "exit=$? stdout=[$out]"
exit=0 stdout=[qdbus: I don't know how to display an argument of type '(iiii)', run with --literal.]
```

So the resolver would parse `NaN`, fall through, and hand every user the 52 px
bug. Use one of these two, and treat **any** unparseable stdout as failure —
never as an empty or zero rect:

```
qdbus6 --literal … availableScreenRect <name>   →  [Argument: (iiii) 0, 0, 1707, 1015]
                                                   /^\[Argument: \(iiii\) (-?\d+), (-?\d+), (\d+), (\d+)\]/
dbus-send --session --print-reply --dest=org.kde.plasmashell /StrutManager \
  org.kde.PlasmaShell.StrutManager.availableScreenRect string:<name>
                                                →  struct { int32 0 / int32 0 / int32 1707 / int32 1015 }
```

Both formats verified 2026-09-04.

**2 · Matching Electron displays to KDE screens.** The screen *name* is not
something Electron exposes (`display.label` is `"Built-in Screen"`, not
`"eDP-1"`). It comes free from `supportInformation()` — the call §4 already
makes for the version and Wayland gates — whose `Screens` block carries `Name:`,
`Enabled:`, `Geometry:`, `Physical size:` and `Scale:` per screen. Match **by
bounds**, with three rules Round 4 added:

- **Skip any screen whose `Enabled:` is `0` (R4-F11).** The field exists because
  KWin expects to print screens where it is `0`; a disabled output with a stale
  or zeroed `Geometry` can otherwise shadow the real primary. **A screen with no
  `Enabled:` field at all counts as enabled** — revision 6 said "not `1`", which
  would have turned the whole feature off on any KWin that formats the block
  differently, and silently. The residual exposure is R4-F11's own case, which
  the ±2 px bounds match and the containment check both still have to pass.
  KWin 6.7.3 always emits the field (measured).
- **Match within ±2 px, not exactly (R4-F8).** Electron reports scale
  `1.4997071027755737` where KWin reports `1.5`. Both round *this* screen to
  `1707x1067`, which is why the origin screen agrees; whether both round a
  second screen's **origin** identically is untested and untestable without the
  hardware. An exact match would fail every non-primary display on a one-pixel
  disagreement.
- **Duplicate `Geometry` means ambiguous (R4-F11).** Plasma mirrors by placing
  two outputs at the same position and size — a projector in presentation mode
  is exactly this. Use the **intersection** of the candidates'
  `availableScreenRect`s: never larger than any candidate, so the mascot cannot
  land on a panel either one reserves.

**3 · The containment check — the single most important line in this section
(R4-F1).** `availableScreenRect` returns a rect in the **global** coordinate
space, and on a one-screen desktop at the origin that is indistinguishable from
screen-local, so the probe could not have caught a mistake here. If the match
resolves Electron display A to KDE screen B, the app hands **another monitor's**
x-range to `clampToWorkArea` — which runs inside `place()` on every drag frame,
against an owned position that is already clamped, with no readback to notice
(§3). The mascot is yanked to the other screen and pinned there, and the user
cannot drag it back: **the exact "appears but is stuck" symptom this feature was
commissioned to remove.**

So: **a resolved rect that is not contained within that Electron display's own
`bounds` is discarded.** One check, pure logic, unit-testable without hardware,
and it converts every class of mis-match — wrong screen, wrong coordinate space,
stale answer — from "buddy pinned to the wrong monitor" into "buddy sits 52 px
low on the right monitor".

**4 · Failure is the pre-fix behaviour, not a fix (R4-F3).** Revision 5 called
the fallback "the correct fail-safe". It is only the *safe direction*: falling
back to the display's own `bounds` is precisely the value Round 6 measured
Electron already giving, whose consequence is the 52 px bug. It is also
numerically **indistinguishable** from a legitimate answer (a screen with no
panel, or an auto-hidden one), so the resolver carries **`resolved: boolean`**
alongside the rect — otherwise nothing downstream, and no test, can tell
"resolved" from "gave up". Note also that revision 5's "an unknown name returns
the full rect (measured)" repeats R3-F7's own error: with one screen at the
origin, every plausible fallback collapses onto the same four numbers. What an
unknown name returns on a **multi-screen** system is unmeasured, and goes on
§9's list.

**5 · plasmashell can be absent permanently or momentarily (R4-F12).**
`org.kde.plasmashell` has **no** DBus service-activation file — it is a systemd
user unit (`plasma-plasmashell.service`), verified 2026-09-04 — so a crash, a
systemd restart or `plasmashell --replace` leaves the name unclaimed for
seconds. And at login, plasmashell may hold the bus name before it has created
its panels, so the full rect is a *legitimate* answer at that instant. Two
different states, two different responses:

- **No such service on this session** (KWin-only): fall back once, permanently.
- **The call failed right now**: retry with backoff, and **keep the last
  successfully resolved rect rather than overwriting it with a fallback.** The
  first successful resolve wins over an earlier failure, and re-places the buddy.

**6 · When it is resolved — and it must be awaited before the first window
(R4-F5).** `show()` is `show(): void` and places the mascot in the
`BrowserWindow` constructor synchronously (`buddy-window-manager.ts:296-320`),
while resolving is two async subprocess calls. Left unstated, the build would
place the very first buddy a user ever sees against an unresolved rect — 52 px
low, `keepAbove` over the clock — and §3's measured "no readback, no `move`
event" guarantees nothing ever corrects it. If the user never drags, it is wrong
for the whole session, and the persisted-dock branch at `:318` restores a
bottom-docked buddy flush to the panel.

**The resolve is awaited once, during the same startup step that already runs
`supportInformation()` for §4's version and Wayland gates** — one call, 2-4 ms,
whose answer is needed before `BUDDY_SHOW` can be granted anyway. No buddy window
is constructed before it settles.

**7 · Re-resolving, and the signal that does not exist (R4-F4).** Revision 5
justified its trigger with "a panel can be moved, resized or set to auto-hide at
any time" — a case that trigger is definitionally blind to, because Round 6
established Electron cannot see struts at all, so a panel change fires no display
event. **And there is nothing to subscribe to instead:**
`org.kde.PlasmaShell.StrutManager` introspects to three methods, **zero signals
and zero properties** (verified 2026-09-04). Stated plainly here so a later
session does not go looking. So:

- Wire **all three** Electron display events — `display-metrics-changed`,
  `display-added`, `display-removed` — debounced. `buddy-overlay-manager.ts:157-168`
  already carries the WHY for exactly this trio (hotplug is the case that
  invalidates a screen-name map), and `:110` records that on KWin Wayland
  `display-metrics-changed` fires three times within 200 ms of `showInactive()`
  with `changedMetrics=[]`, so debouncing is mandatory rather than tidy.
- Panel changes have **no** event. They are picked up on buddy-show plus a cheap
  re-resolve at the **start of each drag and dock** — 2 ms, once per gesture,
  never per frame. **A drag runs on the rect cached at its start**, stated so it
  is not discovered later.

**Two deviations from this section are deliberate and were reviewed.** The
work-area *fallback* is the display's `workArea`, not its `bounds`: on KDE
Wayland they are byte-identical (Round 6 W1), and on every other platform
`workArea` is the value that is already correct there, so the fallback is never
worse and sometimes right. **Containment is still tested against `bounds`** —
that basis is not negotiable, and a review confirmed the deviation did not leak
into it. The second is the `Enabled:` reading above.

**8 · The call sites (R4-F10).** §3 lists its nine writes by line; this change is
the same shape and gets the same treatment. Twelve live `.workArea` reads in
`buddy-window-manager.ts` — **129, 162, 171, 302, 308, 318, 435, 440, 504, 578,
624, 631** — of which **302, 435 and 624** are `screen.getPrimaryDisplay().workArea`
and bypass `getDisplayMatching` entirely, so the resolver must serve both shapes.
The pure helpers all take `workArea` as a parameter (`buddy-geometry.ts:9`,
`buddy-dock.ts:56/70`), so nothing below the call sites changes signature.

**The source scan is scoped to `buddy-window-manager.ts`.** It must **exempt**
5 reads in `buddy-overlay-manager.ts` and 14 in
`renderer/components/buddy/overlay-state.ts`: those are the dormant overlay
strategy, which `chooseBuddyStrategy` never selects (`buddy-manager.ts:38-46`
returns `'windows'` on every path but an explicit env override). Counts verified
2026-09-04. Without the exemption the guard fails the moment it is written.

On KDE **X11** this whole path is skipped with everything else (§4's Wayland
gate), where Electron's `workArea` is correct and already in use.

## 1 · The helper package

Bundled at `desktop/assets/kwin-helper/`, installed to
`~/.local/share/kwin/scripts/youcodedbuddyhelper/`. Verified 2026-09-04: KWin
loads it from config alone after `kwriteconfig6 … Enabled true` +
`org.kde.KWin.reconfigure`, with no KWin restart.

**asar (R1-13.1):** `assets/**` is packaged *inside* `app.asar`, and recursive
copy helpers are not asar-aware. Either add `assets/kwin-helper/**` to
`asarUnpack` or copy file-by-file with `readFileSync`/`writeFileSync`. **Verify
against a built artifact**, not against the `files:` rule.

**The token, defined (R3-F3).** Revision 3 said "a per-install token" and never
said where it comes from, so nothing derived it, stored it, or cleaned it up. It
is derived from the userData profile path and stored in the app's own settings,
**and orphans are actively removed**: on install *and* on every launch, scan
`~/.local/share/kwin/scripts/` for `youcodedbuddyhelper-*` and, for each package
that is not this install's, run §6's ordering — **`unloadScript <id>` →
`kwriteconfig6 --delete` its key → delete the directory**, with a single
`reconfigure` at the end of the batch. (Removal must delete the key, not merely
set it false, or `[Plugins]` accrues one dead entry per token forever.)

**The `unloadScript` is not optional, and revision 5 omitted it (R4-F7).**
Revision 5 deleted an orphan's files and stopped, which contradicts §6's own
stated reason for ordering removal the way it does. Round 4's U1 measured that
deleting or overwriting a script's files does **not** stop KWin executing the
copy it already parsed — so every orphan the cleanup "removed" kept running
inside the compositor until logout, which is precisely the hazard the next
paragraph describes. U3 measured `unloadScript` on a not-loaded id as harmless
(returns `false`, exit 0), so the extra call is free when the orphan was never
loaded.

This matters because **an orphan is not inert**: it still matches our
`resourceClass` and a `YC:` caption, so N orphans mean N compositor handlers
writing geometry on every drag frame, and an orphan built against an older
caption grammar mis-parses the new one. A fresh or reset profile mints a new
token, which is exactly how orphans appear.

**But "not this install's" is not the same as "dead", and revision 7 got that
wrong — badly (B2 review, F1).** A dev instance gets its own userData directory
(`main.ts:286`, from `YOUCODED_PROFILE`, which `scripts/run-dev.sh` always
exports), so its plugin id differs from production's. With the sweep as
specified, **production and every dev instance are permanently each other's
orphan**: launching a dev instance — the workspace's mandated way to test
anything — would unload the real app's helper from KWin and delete its files
mid-session. Destin's buddy would stop moving with no message anywhere, and it
would never repair itself, because `syncOnLaunch` returns early when its own
package directory is gone. That is `live-app-safety.md` violated by **shipped
product code**, not by a session.

So ownership must be recoverable, not merely derivable. `copyPackage` already
rewrites `metadata.json` to stamp the per-install plugin id; it also stamps
**`X-YouCoded-Profile: <userDataDir>`**, and the sweep **skips any package whose
recorded profile directory still exists on disk**. A package with no such field
— a pre-fix install, or the probe's old un-suffixed package — stays sweepable,
because nothing is running it. Unreadable metadata is left alone: a stale
package is inert once unloaded, a deleted live one is not.

**Half-install rollback (R1-13.6):** if files copy but `kwriteconfig6` or
`reconfigure` fails, remove what was written and report failure. Never leave
files on disk with `installed: false`, which would re-copy on every retry.

## 2 · The caption channel

**Contract:** `YC:<role>@<x>,<y>`, role ∈ `mascot`|`chat`|`bar`.

The token is deliberately **not** in the caption (R2-F5). Identity lives in the
plugin id and WM_CLASS (§0), so the caption carries only what it must — and the
caption is user-visible in places `skipTaskbar` does not reach, where a token
would leak.

Measured: 120 title writes at a 60 fps cadence → 120 applied moves, zero dropped,
each landing on the exact pixel. A rename is *much cheaper* than a DBus round
trip (6–10 ms), not free (R1-13.5).

**Attach ordering (R1-4) — this would have broken the feature outright.** Buddy
windows are created with `title: undefined` and adopt `"YouCoded"` on load, so at
`windowAdded` the caption does not match and a one-shot `attach()` never wires
`captionChanged`. The buddy would appear and refuse to move — the exact symptom
this feature exists to fix. Two changes, both required:

- **App:** pass the caption in the BrowserWindow **constructor**, and apply
  `page-title-updated` `preventDefault()` to buddy windows in production. Today
  that guard is gated `if (DEV_WINDOW_TITLE && !opts?.buddy)` — dev-only, and
  explicitly *not* for buddy windows. `buddy-overlay-manager.ts:203–209` already
  documents the required ordering (preventDefault **before** setTitle).
- **Helper:** attachment is not a one-shot decision — but it is not universal
  either (R3-F9). Connecting `captionChanged` on *every* window would run helper
  JS **inside the compositor** on every title change in the session: browser
  tabs, video clocks, terminal cwds. `resourceClass` is available at
  `windowAdded` and cannot change afterwards, so filter there and connect only
  our own windows; the caption test stays the handler's first line, which is all
  R1-4 actually needed. Disconnect on `windowRemoved` (R1-13.4).

**Taskbar captions (R1-8) — revision 1 was wrong.** It claimed the captions were
invisible because buddy windows set `skipTaskbar: true`. **`skipTaskbar` is a
no-op on Wayland** — this repo's own verified comment
(`buddy-overlay-manager.ts:386`) says so. Uncorrected, the user's task manager and
Alt-Tab would show the caption with its numbers changing 60×/second during a
drag. **The helper sets `skipTaskbar`, `skipSwitcher` and `skipPager` on the
matched window itself** — **measured 2026-09-04 (Round 5 smoke test): all three
accept the write and read back `true`**, where the app's own `skipTaskbar` is a
no-op on Wayland. (Revision 4 cited `window.h:364/369/374` for this; it is now a
result, not a reading of the API.)

**Those three flags do not cover KWin's Overview, KRunner's window search, the
screen-share window picker, or panel title widgets (R2-F5) — so the two that a
user actually passes through were checked, and the caption does not leak.**
Destin, live 2026-09-04, dragging the real `YC:mascot@<x>,<y>` grammar with the
three flags set: *"the buddy is not listed."* The grammar stands as written and
§2's open eyeball item is closed.

Two surfaces on R2-F5's list were **not** checked — KRunner's window search and
panel title widgets. Both are opt-in searches rather than something a user walks
into, so they are accepted as a known gap rather than a blocker. The caption
stays short and tokenless regardless: that is what keeps the gap cheap.

## 3 · Position becomes app-owned (R1-1, R1-5)

Revision 1 converted the *writes* and forgot the *reads*. There are **nine**
`getPosition`/`getBounds` reads in `buddy-window-manager.ts` (212, 501, 127, 152,
316, 433, 622, 575, 676) and every one is load-bearing: the start point of every
snap glide, how the chat follows the mascot, dock flush, peek, and persistence.
On Wayland those reads only ever echo the last `setPosition`, so under a caption
channel they freeze at **constructor** values — the snap would animate from the
wrong corner and the chat would open where the mascot used to be.

So:

- `BuddyWindowManager` owns `pos: Record<role, Point>`, written by `place()`.
- **`rectOf(win)`** — not a point (R2-F6). Six of the nine reads pass a full rect
  to `screen.getDisplayMatching`, `dockPosition` and `computeBarPosition`, and
  `getBounds` is legitimate for width/height even on Wayland. `rectOf` returns
  the owned position spread with the size constants that already exist
  (`MASCOT_SIZE`, `CHAT_SIZE`, `BAR_SIZE`).
- **Persistence moves off `win.on('move')`.** Revision 4 asserted it never fires
  for a compositor-side move; **measured 2026-09-04 (Round 6) and confirmed** —
  four caption-channel moves produced zero `move` events and `getBounds()` stayed
  at `0,0` throughout, so today the buddy's position is silently never saved on
  Linux. Persistence moves into `place()`, debounced.
- Guard: a source scan requiring `rectOf` instead of `getBounds`/`getPosition`
  on a buddy window.

**Write sites are nine `setPosition` calls, not eleven** (two matches were
comments) — **plus three BrowserWindow constructor placements** (309, 599, 654)
that revision 1 missed entirely. Constructor `x`/`y` is ignored on Wayland just
as `setPosition` is, so all three windows would still have appeared wherever KWin
dropped them. They resolve with §2's fix: the caption *is* the constructor title,
so creation and placement become one act.

Dragging needs no global cursor (`getCursorScreenPoint` is `{0,0}` on Wayland):
cursor-in-screen = windowPos + cursor-in-window, self-correcting each frame.

**Per-role captions, one grammar (R3-F6 — reverses R2-F10's fix).** Revision 3
had the mascot's caption carry all three roles' targets. That was wrong twice
over: it contradicted §2's stated grammar with no format written for the group,
it did not remove the need for single-window moves (`showBar()` at 609 and
`layout()`'s chat move at 409 move one window without the mascot), and it made
one window's caption name *other* windows — which, before pid grouping existed,
would have let a dev instance move the live app's chat. It also rested on an
unmeasured premise: nobody has shown that 180 renames/sec is a problem.

**Measured 2026-09-04 (probe Round 3), and it holds.** Three windows at the real
buddy sizes, each renamed every 16 ms: 363 renames, 363 applied, every one landing
on the exact pixel, 188 renames/sec sustained, zero drops. So the per-role channel
stays — one grammar, one handler, no cross-window references, and no group format
to write.

## 4 · Detection and IPC (R1-10, R1-11, R1-12)

| Channel | Meaning |
|---|---|
| `buddy:helper-status` | `{ needed, supported, installed, reason? }` |
| `buddy:install-helper` | `{ ok }` |
| `buddy:remove-helper` | `{ ok }` — new, per decide-uninstall#D-1. Add to `MOCK_ONLY` with the other two, and remove all three when the real backend lands. |

**`needed` — added in revision 7, and without it this feature takes a working
buddy away from real users.** Revisions 1-6 carried a single gate, and R5 then
turns the whole control read-only whenever that gate says no. On **KDE X11 the
buddy works today**, so those users would have been shown "Not yet supported on
this desktop" and lost it. §4 already said X11 must be a no-op; the payload could
not express it.

**And the Wayland gate was wrong on Wayland too (probe Round 7).** KWin reports
`Operation Mode: Wayland` whether or not *our* windows are native Wayland
surfaces. Same binary, same session, forced to XWayland with
`--ozone-platform=x11`: `XDG_SESSION_TYPE`, `WAYLAND_DISPLAY`, `DISPLAY` and
`XDG_CURRENT_DESKTOP` are **byte-identical** to the native run, KWin still says
Wayland — but `getCursorScreenPoint()` returns real coordinates, the native
handle is an XID, and `setPosition` genuinely moves the window. **`setPosition`
works; no helper is needed; the design as written would have installed one and
blocked the buddy behind a consent card.** This repo has already been burned by
exactly this ambiguity — `main.ts:1310-1320`, 2026-07-23: *"the probe was
silently running XWayland."*

So the two facts are separate and both are required:

- **`needed`** — *the app cannot position its own windows here*:
  `process.platform === 'linux' && app.commandLine.getSwitchValue('ozone-platform') === 'wayland'`.
  Electron resolves that switch itself; we never pass it (measured: `wayland` on
  the native run, `x11` on the forced one). **No environment variable can
  substitute** — all four are identical across the two runs.
- **`supported`** — *a helper exists for this desktop*: the version + session
  gate below.

The three states the renderer must render, and nothing else:

| `needed` | `supported` | `installed` | What the user sees |
|---|---|---|---|
| false | — | false | **No helper UI at all.** Windows, macOS, Linux X11, and Linux Wayland running XWayland. The toggle behaves exactly as it does today. |
| false | — | **true** | **The Remove helper action, and nothing else** — see below. |
| true | false | — | R5's row: "Not yet supported on this desktop", disabled. GNOME, wlroots, Plasma 5. |
| true | true | — | The consent flow (R1-R3), then R8-R10. |

**Why the second row exists (raised by the B2 builder, and it is an R10
violation).** A user can install the helper on Wayland and then log into X11 —
or get an XWayland-backed build after an update. `needed` is now false, so a
plain reading hides the whole helper UI **including Remove helper**, while the
script is still installed and still loaded inside KWin. R10 promises *"you can
remove it again any time, from the buddy's own settings"*, and in that state the
settings are gone.

It is not harmful — the helper only ever touches windows carrying our caption
grammar, and on X11 the app positions its own windows so no such caption is ever
written — but a promise the product made is unkeepable, which is enough.

So **`installed` is reported truthfully whatever `needed` says**, and the Remove
helper action is rendered whenever `installed` is true. It needs no new copy: the
button already says what it does, and R6's one-row state for a *new* user is
untouched, because a new user has nothing installed.

`needed` also gates §5's `BUDDY_SHOW` refusal and §6's R12 migration — a user who
never needed a helper must never be refused a buddy or have one hidden.

**Failing safe.** If the two facts disagree or either is unknown, prefer
`needed: false`: the cost is the status quo (a buddy that cannot be dragged,
which is today's behaviour), where the opposite error takes away a buddy that
works.

- **`installed`** is `isScriptLoaded youcodedbuddyhelper` over DBus — what the
  probe recommended. Files-plus-config-key is a proxy that reports true when KWin
  has not reconfigured, when the script threw on load, or when a restart is
  pending. Files+config remain the input to the *install* decision only.
  **Re-checked on window-show**, not once at panel mount, so disabling the script
  in System Settings mid-session is noticed — **and reacted to.** Noticing alone
  was a bug (B4 review, F1): §3's owned-position model requires that the caption
  channel never flip live→dead while buddy windows exist, because after the flip
  moves take the `setPosition` branch (a silent no-op on Wayland) and `rectOf`
  returns a frozen `getBounds()`, so the chat and bar re-anchor to the screen
  corner while the mascot sits still and undraggable. Revision 7 named removal as
  the guarantee, but removal is not the only writer — this re-check and a
  momentary DBus failure flip it too. **A live→dead transition forces the buddy
  off**, the same response R4 already gives to a declined helper.
- **`supported`** is not "`org.kde.KWin` is reachable" — that is also true on
  Plasma **5**, whose scripting API is `clientList`/`clientAdded`, which this
  helper does not use. Install would succeed and the buddy would never move,
  while R5's honest "not yet supported" never showed.

  Revision 2 proposed a capability probe — load a trivial script and see whether
  it ran. **That cannot be built (R2-F2): KWin's scripting DBus interface has no
  return path for script execution.** `loadScript` returns an id and `run()`
  returns void, which is exactly why the shipping `kwin-keep-above.ts` returns
  `true` the moment `run()` resolves whether or not the script did anything. The
  probe's own success channel was `print()` scraped out of journald — not a
  shippable API.

  **And a Wayland gate (R3-F4, corrected by Round 7).** There is no Wayland/X11
  detection anywhere in the desktop source today, and `chooseBuddyStrategy`
  treats all of Linux alike. R3-F4 identified the regression — a KDE user whose
  buddy works would get a consent card they do not need — and proposed KWin's
  `Operation Mode: Wayland` as the gate. **Measured Round 7: that gate does not
  detect the case it was written for.** It is retained here as half of
  `supported` (a helper needs a Wayland compositor to be worth installing), but
  the X11 no-op is delivered by **`needed`** above, which is the only signal that
  actually flips.

  So `supported` is a **version + session gate**, measured 2026-09-04:
  `org.kde.KWin.supportInformation()` returns a block whose first fields include
  `KWin version: 6.7.3` and `Operation Mode: Wayland`. Require major ≥ 6 AND
  Wayland. **Anchor the parse to `^KWin version:`** — a bare `Version` section
  header appears two lines earlier and a loose match returns it (R3-F10). `kwriteconfig6` is
  an explicit dependency (Plasma 5 ships `kwriteconfig5`) but is not itself a
  Plasma-6 test, since kf6-kconfig installs alongside Plasma 5. "KDE, but too
  old" is the R5 state.

**Four files get edits (R3-F8)**: `shared/types.ts` (the IPC constant map, which
is duplicated in `preload.ts:278` — both copies), `preload.ts` (map **and** the
`buddy:` API object at 1090), `ipc-handlers.ts`, `remote-shim.ts`. The
`native:retry` block asserts six surfaces, but its extra two are a
`SessionService.kt` not-implemented stub and a `remote-server.ts` entry, and
buddy has **no** Kotlin or remote-server presence today. Adding them would grow
this feature into an Android parity sweep, so they are deliberately omitted and
the new block says so.

`ipc-channels.test.ts` does **not** pick new channels up for free — it is
hand-written per family. A `buddy:*` parity block is a build task, shaped like
`terminal:get-screen-text`. **`SessionService.kt` has zero `buddy` references
today**, so "stub like the other families" would be a new claim, not a match:
`buddy:show`/`buddy:hide` are already unstubbed there. **Decision: the new block
covers only the three helper channels**, leaving the pre-existing buddy gap
exactly as it is rather than growing this feature into an Android parity sweep.

## 5 · Consent must be enforced in main, not the renderer (R1-7)

R4 ("decline → no buddy at all") and R1 ("asks before anything is added") are not
delivered by a renderer-side `if`. Three holes today: `helper` starts `null` and
a failed status call leaves it `null` forever, so an early click enables the
buddy with no ask; `App.tsx`'s boot path calls `buddy.show()` straight from
`localStorage` with no helper check; and the main handler is unconditional.

**`BUDDY_SHOW` refuses when `needed` and the helper is not live, and returns the
reason** — `needed`, not "on Linux": an X11 or XWayland user never needed a
helper and must never be refused a buddy (§4).

**Two sentences of revision 6 are withdrawn here, both superseded by §4's
`needed` gate (B5b build):**

- *"The renderer disables the toggle while status is unknown."* **No.** That
  predates `needed`, and it would give Windows, macOS and Linux-X11 users a
  momentarily dead switch during a lookup whose answer cannot affect them —
  a change to the row-one promise that nothing changes for them. Enforcement
  belongs in main, which is where §5 puts it, and main refuses on its own if a
  helper does turn out to be needed.
- *"…and renders a distinct state when the status call failed."* Deliberately
  unbuilt: it needs words that do not exist, and a failed call already
  fail-safes to `needed: false`, which is row one. **If it should say something,
  that is a copy question for Destin, not a build task.**

**Removal forcing the buddy off is scoped to `needed` too.** §6's sequence ends
"force the buddy off (R4: no helper, no buddy)" — but in §4's second row the
buddy moves perfectly well without a helper, so switching it off when a user
removes one they were not using would take away something that was working. That
is the same regression `needed` exists to prevent. The renderer disables the toggle while status is unknown and renders a
distinct state when the status call *failed*, rather than falling through to the
non-Linux path.

## 6 · Lifecycle

| Row | Behaviour | Mechanism |
|---|---|---|
| R9 | Buddy off leaves the helper | nothing on toggle-off |
| R10 | *(amended)* the user can remove the helper | **Remove helper** action in the buddy popup, shown only when installed (decide-uninstall#D-1) |
| R2 | *(amended)* consent copy | must no longer promise removal on uninstall |
| R11 | Updates replace the helper quietly | at launch, bundled `Version` ≠ `helperLoadedVersion` → copy files, `unloadScript`, `reconfigure`, *then* record the version |
| R12 | Existing users get the buddy hidden once | one-shot migration, **gated on `needed` and not-installed** — an X11 user's working buddy is never hidden (§4) |

**R10 was re-opened with Destin** because the approved consent card promised
"removed when you uninstall YouCoded", which is false: AppImage — the first
format shipped — has no uninstall step, and a root post-removal hook cannot
safely edit a per-user `kwinrc`. He chose a user-owned Remove helper control plus
honest wording. The packaging hook is **not** built: it is fragile where it is
possible and impossible where it is not.

**The replacement sentence (R2-F7)** — the false one is still live on the branch,
and copy in this popup is Destin's own approved wording, so a build task cannot
be left to invent it:

> It only ever touches the buddy's own window. You can remove it again any time
> from this menu.

**R6 is amended too (R2-F8).** R6 says "the popup is one row"; a Remove helper
action is a second control. It appears **only when the helper is installed**, so
the one-row state R6 was signed against is still what a new user sees. R6's
acceptance card is re-shot from both states.

**The removal sequence, in order** — anything else looks like a silent failure:
`unloadScript` → `kwriteconfig6 … Enabled false` → `reconfigure` → delete the
package directory → **`kwriteconfig6 --delete` the key** → force the buddy off
(R4: no helper, no buddy) → status reads "not installed".

The final `--delete` reconciles this list with §1, which requires removal to
delete the key rather than leave it false — otherwise `[Plugins]` accrues one
dead entry per token forever. It comes last and is best-effort: KWin has already
re-read the config as disabled, so it needs no second `reconfigure`, and its
failure must not fail the removal. **`unloadScript` failing, however, aborts the
whole sequence** — Round 4 measured that deleting the files does not stop KWin
running the parsed copy, so "removed" plus a buddy that still moves is the exact
outcome this ordering exists to prevent. Without the `unloadScript` first, KWin keeps running the deleted
script until logout and the buddy keeps moving, so the user believes removal
failed.

**R13 (R2-F12)** — "the offer waits in the buddy's settings; no dialog interrupts
you after an update" — is a consequence of R12's migration rather than its own
mechanism: the migration only flips a stored preference, and nothing shows a
dialog at launch. Covered by a case in `buddy-linux-migration.test.ts`.

**R12 runs in the renderer (R1-13.2)** — `youcoded-buddy-enabled` is renderer
`localStorage`, so a main-process one-shot cannot clear it. It runs before
`App.tsx`'s boot effect, guarded against firing in the three buddy renderers or
on remote/Android.

**R11's update sequence, measured 2026-09-04 (probe Round 4) — and it is not the
obvious one.** Overwriting a loaded script's file and calling `reconfigure`
**does not reload it**: the file was replaced, `isScriptLoaded` stayed true, and
KWin went on running the copy it had already parsed. `unloadScript` first, then
`reconfigure`, does reload it — same session, no logout. So the update path is
**copy files → `unloadScript` → `reconfigure`**, the same order removal uses, and
it is a required order rather than an implementation detail: with `reconfigure`
alone the promise silently degrades to "at next login" and a user who updated the
app keeps running the previous helper, including one built against an older
caption grammar. `unloadScript` on an id that is not loaded returns `false`
harmlessly, so the install and update paths can share one sequence.

**The version marker must not be the file the update overwrites (R4-F6).**
Revision 5 compared the bundled `Version` against the installed package's
`metadata.json` — which step 1 has already replaced by the time steps 2 and 3
run. Two crash windows follow, and neither self-heals:

- **`unloadScript` fails, or the app dies after step 1.** New files on disk, old
  script still parsed and running (U1). Next launch sees equal versions and skips
  the update, `isScriptLoaded` says `true`, the status card says "installed" — so
  the user runs the previous helper **forever**, possibly against an older caption
  grammar. That is the exact failure Round 4 was run to prevent, re-entered
  through the back door.
- **`reconfigure` fails, or the app dies between steps 2 and 3.** The script is
  unloaded, so §4's `installed` (which *is* `isScriptLoaded`) flips to false and
  §5's gate kills the buddy. Next launch: versions equal, so no update; files and
  config key both present, so no install either. Nothing calls `reconfigure`. The
  buddy stays dead until logout or a manual Remove-then-Add.

So the app persists **`helperLoadedVersion` in its own settings, written only
after `reconfigure` resolves successfully**, and the launch check is
`bundled !== helperLoadedVersion`. The full sequence then re-runs unconditionally
whenever they differ, which repairs both windows on the very next launch at no
cost (U3). §1's half-install rollback does not cover this: it is written for
install, and on update there is nothing to roll back *to* — the previous
package's files are already gone.

**Nothing can verify the reload happened**, and the design must not pretend
otherwise: `isScriptLoaded` is `true` for the old and new script alike, and no
loaded script reports its version over DBus (§4 — `run()` is void). The version
marker records *what we did*, not what KWin is running.

## 7 · Keep-above (R1-6)

The helper sets `keepAbove = true` on attach and **re-asserts on restore** —
Wayland gives a restored window a new surface, the same class of bug
`buddy-overlay-manager.ts:380–388` documents for the input region.

`kwin-keep-above.ts` is **dead on this path**: its two call sites both pass
`OVERLAY_TITLE`, the caption of the overlay strategy that `chooseBuddyStrategy`
never selects on Linux, and its exact-match cannot hit a captioned buddy window.
Keep it for the dormant overlay strategy, and **fix the `SettingsPanel.tsx`
comment that claims the helper drives it** — it is wrong and will mislead.
`App.tsx:3838-3841` carries the same class of stale claim (that Linux Wayland
mounts the buddy as one screen-sized overlay; `chooseBuddyStrategy` returns
`'windows'` there) and is corrected in the same task (R2-F13).

Its qdbus discovery and exec wrapper are extracted to a shared module and reused
by the helper installer. Not re-implemented.

## 8 · Tests

The contract has zero mechanical rows. Minimum to fix that:

- `kwin-helper.test.ts` — caption build/parse incl. hostile input, **identity
  gating (a foreign `resourceClass` and a wrong token are both refused)**,
  version comparison, install plan, rollback, **and that install/update emits
  `unloadScript` before `reconfigure`** (Round 4: `reconfigure` alone does not
  reload an overwritten script). Plus R4-F6's two crash windows: `unloadScript`
  rejects → `helperLoadedVersion` is **not** written and the next launch re-runs
  the sequence; `reconfigure` rejects → same. And R4-F7: orphan cleanup emits
  `unloadScript` for each orphan id **before** deleting its directory.
- `buddy-caption-channel.test.ts` — `place()` picks caption vs `setPosition` per
  platform × helper state; all nine write sites and three constructor sites route
  through it.
- `buddy-position-source.test.ts` — no `getBounds`/`getPosition` on a buddy window
  outside `rectOf`.
- `buddy-title-guard.test.ts` — no buddy renderer sets `document.title`; every
  buddy window preventDefaults `page-title-updated`.
- `buddy-linux-migration.test.ts` — R12 runs exactly once.
- `buddy-consent-gate.test.ts` — `BUDDY_SHOW` refuses on Linux without a live
  helper, including when status is unknown.
- `buddy-remove-helper.test.ts` — the removal order above, and that removal
  targets only this install's plugin id.
- `buddy-work-area.test.ts` — the resolved work area. **The parse** (R4-F2): the
  `--literal` success line; the "I don't know how to display" line that arrives
  on *stdout* with exit 0; empty stdout; non-zero exit — each must be a failure,
  never a zero rect. **The match**: a matched screen uses `availableScreenRect`;
  `Enabled: 0` screens are skipped; bounds within ±2 px still match; two screens
  sharing a `Geometry` intersect; an Electron display matching nothing KDE
  reports, *and* the reverse. **The containment check** (R4-F1): a rect outside
  the display's own bounds is discarded and `resolved` is false. **The
  lifecycle**: `org.kde.plasmashell` absent → fall back and mark unresolved; a
  later successful resolve replaces the fallback and re-places the buddy; with
  the resolve unsettled, `show()` must not construct a buddy window (R4-F5).
  **The scan**: nothing in `buddy-window-manager.ts` reads `display.workArea`
  raw, with `buddy-overlay-manager.ts` and `renderer/.../overlay-state.ts`
  exempt (§0.8).

  Run against **synthetic** multi-screen inventories (§9): two and three screens,
  a negative-offset screen left of the primary, differing per-screen scales, the
  two systems listing screens in different orders. **What this does and does not
  prove is stated in §9** — it is not a substitute for the hardware run.
- Source scan: the pin switch stays gone (R6).
- `ipc-channels.test.ts` — a hand-written `buddy:*` parity block.

## 9 · Out of scope, stated

- GNOME and wlroots: no lever exists; the buddy is unavailable and says so.
- **Multi-monitor is unproven on hardware, and Destin deferred the test**
  (2026-09-04: "we will skip tv for now"). One screen was connected for every
  probe round. KWin exposes every screen in one coordinate space with per-screen
  scale, so a second screen is reachable by construction — but that is reasoning.

  **Revision 5 undersold this risk and Round 4 corrected it (R4-F8, R4-F1,
  R4-F9).** Revision 5 said the untested half was "pure logic with no hardware in
  it". It is not: the match is an assertion that **two independent number sources
  agree**, and a unit test that authors *both* inventories has made them agree by
  construction. It proves the mapping is correct *given* agreement, which was
  never the doubt. What it cannot catch, and each of these breaks the feature
  rather than degrading it:

  1. A ±1 px disagreement in a non-primary screen's logical **origin**. Electron
     reports scale `1.4997071027755737` where KWin reports `1.5`; both round
     *this* screen identically, which is why the origin screen agrees.
  2. The coordinate space and the multi-screen fallback of `availableScreenRect`.
  3. Whether `supportInformation()` lists mirrored or disabled outputs, and how.
  4. Whether `frameGeometry` assignment lands exactly at a **non-zero screen
     offset** — every "landed on the exact pixel" result so far was on the origin
     screen.
  5. Whether Chromium/Ozone reports a second display's bounds at all under
     fractional scaling, versus collapsing or duplicating it.

  **What makes the deferral acceptable is §0.3's containment check, not the unit
  test.** Without it, a mis-match hands `clampToWorkArea` another monitor's global
  rect, which re-clamps every drag frame against an already-clamped owned
  position, with no readback to notice — a buddy **pinned to the wrong screen and
  undraggable**, which is the very symptom this feature exists to remove. With
  it, every mis-match degrades to "52 px low on the right screen". The containment
  check *is* pure logic and *is* synthetically testable.

  Revision 5's off-screen reassurance was also circular (R4-F9): it rested on the
  clamp at `:308` "unchanged by this feature", when §8's source scan requires
  changing exactly that line. Restated correctly: the clamp moves to the resolved
  rect, which the containment check guarantees is inside the display's bounds, so
  it still pulls an unreachable position back on-screen.

  **Do the real two-screen run before release**, not before build — roadmap item
  filed. Add to it: what an **unknown screen name** returns on a multi-screen
  system (§0.4).
- Surviving a KWin restart is untested.
- The deb/rpm/pacman uninstall hook, deliberately (§6).

## 10 · Measured, not assumed

Two of revision 2's load-bearing claims were assertions. Both were checked
headlessly on 2026-09-04 before this revision was written.

| Claim | Result |
|---|---|
| Electron's `screen` API and KWin's `frameGeometry` describe the same space (R2-F9) | **On one screen at the origin, they do not disagree** — Electron `bounds {0,0 1707×1067}` scale 1.4997, KWin `0,0 1707×1067` dpr 1.5, and a window asked for `300,200` landed at `300,200`. **Claim narrowed (R3-F7):** with a single screen whose origin is `0,0`, any two systems agreeing on size agree everywhere, so this is the configuration in which the claim could not have failed. It does **not** establish that the maths is safe — the risks are a second screen's offset and the two scale factors already differing (1.4997 vs 1.5). |
| `resourceClass` distinguishes a dev instance from production (R2-F4) | **False.** WM_CLASS comes from `package.json` `name`, and both run `name: youcoded`. Hence §0's explicit `--class` and the token-in-plugin-id. |

Also measured: **KWin 6 geometry is fractional** — a readback gave
`{x:733, y:463.666…, width:119.999…}` at 1.5× scale. Integers survive a round
trip; anything the helper computes *from* a readback will not.

**Two more of revision 4's open questions were closed on 2026-09-04**, both
headless, machine left byte-identical (`kwinrc` diffed against a pre-probe backup):

| Claim | Result |
|---|---|
| The per-role caption channel survives three windows at once (§3) | **Holds.** 363/363 renames applied, all exact, 188/sec |
| Overwrite + `reconfigure` reloads a loaded script (§6, R11) | **False.** `unloadScript` must come first; see §6 |
| Electron's `workArea` excludes the Plasma panel (§0, R3-F7) | **False on Wayland.** Identical to `bounds`; KWin reserves 52 px. §0 rewritten around `StrutManager` |
| The app gets no readback of a compositor-side move (§3) | **Confirmed.** `getBounds()` frozen at `0,0`; one `move` event, at creation |
| The helper can set `skipTaskbar`/`skipSwitcher`/`skipPager` (§2) | **Yes** — all three read back `true`; previously cited from a header file, now measured |

**Overview and the screen-share picker were then checked by Destin (Round 5) and
show nothing** — §2. Still unmeasured, and named as such: multi-monitor (§9,
**deferred by Destin**, with a unit-test substitute for the half that is logic),
KWin-restart survival (§9), and KRunner's window search and panel title widgets
(§2, accepted as a known gap).

## 11 · Pre-existing defects to fix in passing

Found during review, already on the branch, each a one-liner:

- `SettingsPanel.tsx` `addHelper` sets `setInstalling(true)` and never clears it
  on failure — the button stays on "Adding…" until the popup is reopened.
- The false consent sentence is live at `SettingsPanel.tsx:944` (§6 carries its
  replacement).
- `ipc-channels.test.ts`'s first test `console.warn`s on a missing preload entry
  instead of failing, so it will not catch one.
