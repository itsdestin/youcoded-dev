---
status: draft
date: 2026-09-04
revision: 4
feature: linux-buddy-helper
contract: linux-buddy-helper.contract.json (13 rows, signed 2026-09-04; R2/R10 amended by decide-uninstall#D-1)
branch: feat/linux-buddy-kwin-helper
review: round 1 (13 findings, 13 accepted), round 2 (13 findings, 13 accepted) — docs/active/reviews/
---

# Linux buddy helper — technical design (revision 2)

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
window that failed the identity check. **Which rectangle is authoritative
(R3-F7): Electron's `display.workArea`**, which excludes the Plasma panel — the
same rectangle §3's dock and snap maths already clamps to. KWin's `workspace`
bounds is the full screen and is NOT used for clamping; a buddy legal under one
is illegal under the other.

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
`~/.local/share/kwin/scripts/` for `youcodedbuddyhelper-*`, delete every package
that is not this install's, and `kwriteconfig6 --delete` its key (removal must
delete the key, not merely set it false, or `[Plugins]` accrues one dead entry
per token forever).

This matters because **an orphan is not inert**: it still matches our
`resourceClass` and a `YC:` caption, so N orphans mean N compositor handlers
writing geometry on every drag frame, and an orphan built against an older
caption grammar mis-parses the new one. A fresh or reset profile mints a new
token, which is exactly how orphans appear.

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
matched window itself** — verified writable in the KWin 6 API
(`window.h:364/369/374`), which the app's own `skipTaskbar` is not on Wayland.

**It does not remove the consequence entirely (R2-F5).** Those three flags do not
cover KWin's Overview, KRunner's window search, the screen-share window picker,
or panel title widgets. The caption is therefore kept short and tokenless, and
**Overview and a screen-share picker must be eyeballed mid-drag** before this is
called done.

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
- **Persistence moves off `win.on('move')`**, which never fires for a
  compositor-side move — today that silently means the buddy's position is never
  saved on Linux. It moves into `place()`, debounced.
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

**Measure three windows at 60 fps with the existing probe rig before building.**
If it holds — expected — the per-role channel stays and there is one grammar, one
handler, and no cross-window references. Only if it fails does a group grammar
get written, and it must then be specified in full.

## 4 · Detection and IPC (R1-10, R1-11, R1-12)

| Channel | Meaning |
|---|---|
| `buddy:helper-status` | `{ supported, installed }` |
| `buddy:install-helper` | `{ ok }` |
| `buddy:remove-helper` | `{ ok }` — new, per decide-uninstall#D-1. Add to `MOCK_ONLY` with the other two, and remove all three when the real backend lands. |

- **`installed`** is `isScriptLoaded youcodedbuddyhelper` over DBus — what the
  probe recommended. Files-plus-config-key is a proxy that reports true when KWin
  has not reconfigured, when the script threw on load, or when a restart is
  pending. Files+config remain the input to the *install* decision only.
  **Re-checked on window-show**, not once at panel mount, so disabling the script
  in System Settings mid-session is noticed.
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

  **And a Wayland gate (R3-F4).** There is no Wayland/X11 detection anywhere in
  the desktop source today, and `chooseBuddyStrategy` treats all of Linux alike.
  Without this, a KDE Plasma 6 user on an **X11** session — where `setPosition`
  works and the buddy is not broken — would get a consent card for a change to
  their desktop settings they do not need, and lose a working buddy if they
  declined. On KDE X11 this feature is a **no-op**: no consent, no gate, `place()`
  keeps using `setPosition`. The same response already carries
  `Operation Mode: Wayland`, so it costs nothing.

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

**`BUDDY_SHOW` refuses on Linux when the helper is not live, and returns the
reason.** The renderer disables the toggle while status is unknown and renders a
distinct state when the status call *failed*, rather than falling through to the
non-Linux path.

## 6 · Lifecycle

| Row | Behaviour | Mechanism |
|---|---|---|
| R9 | Buddy off leaves the helper | nothing on toggle-off |
| R10 | *(amended)* the user can remove the helper | **Remove helper** action in the buddy popup, shown only when installed (decide-uninstall#D-1) |
| R2 | *(amended)* consent copy | must no longer promise removal on uninstall |
| R11 | Updates replace the helper quietly | at launch, bundled `Version` > installed → reinstall silently |
| R12 | Existing users get the buddy hidden once | one-shot migration |

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
package directory → force the buddy off (R4: no helper, no buddy) → status reads
"not installed". Without the `unloadScript` first, KWin keeps running the deleted
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

**R11 needs a headless check before build (R1-13.3):** overwriting a loaded
script's file and calling `reconfigure` may not make KWin reload it. The probe
only ever tested a first enable. If it does not reload, "quietly" means "at next
login", which is a different promise.

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
  version comparison, install plan, rollback.
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
- Source scan: the pin switch stays gone (R6).
- `ipc-channels.test.ts` — a hand-written `buddy:*` parity block.

## 9 · Out of scope, stated

- GNOME and wlroots: no lever exists; the buddy is unavailable and says so.
- **Multi-monitor is unproven** — one screen was connected during the probe. KWin
  exposes every screen in one coordinate space with per-screen scale, so it is
  reachable by construction, but it needs a real two-screen run.
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

Still unmeasured, and named as such: multi-monitor (§9), KWin-restart survival
(§9), whether overwriting a loaded script and calling `reconfigure` actually
reloads it (§6, R11), and whether Overview and the screen-share picker show the
caption mid-drag (§2).

## 11 · Pre-existing defects to fix in passing

Found during review, already on the branch, each a one-liner:

- `SettingsPanel.tsx` `addHelper` sets `setInstalling(true)` and never clears it
  on failure — the button stays on "Adding…" until the popup is reopened.
- The false consent sentence is live at `SettingsPanel.tsx:944` (§6 carries its
  replacement).
- `ipc-channels.test.ts`'s first test `console.warn`s on a missing preload entry
  instead of failing, so it will not catch one.
