---
status: draft
date: 2026-09-04
revision: 2
feature: linux-buddy-helper
contract: linux-buddy-helper.contract.json (13 rows, signed 2026-09-04; R2/R10 amended by decide-uninstall#D-1)
branch: feat/linux-buddy-kwin-helper
review: docs/active/reviews/2026-09-04-linux-buddy-helper-design-review-1.md (13 findings, 13 accepted)
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

## 0 · Identity — the security foundation (R1-2, R1-3)

**A window caption is a string any program can choose. It is a data channel, never
an identity.** Revision 1 gated the helper on a caption prefix alone, which would
have granted always-on-top and arbitrary repositioning to any window that named
itself correctly — including any **web page**, since a browser puts the page's
own title into its caption. A site could have pinned the user's browser above
everything and moved it at 60 fps.

The helper therefore matches on two things, in this order:

1. **`w.resourceClass`** — the WM_CLASS Electron derives from `appId`. A web page
   cannot forge it; a local program would have to impersonate the application.
2. **A per-install token** baked into the helper package at install time and into
   the caption the app writes: `YOUCODED-BUDDY-<token>:<role>@<x>,<y>`.

The token also solves R1-3: **a dev instance and Destin's production app would
otherwise emit identical captions and share one helper, so dragging the buddy in
a dev window would physically move the buddy in his real app.** That is the
hazard `.claude/rules/live-app-safety.md` exists to prevent, arriving through a
door the rule does not cover. The token is derived from the userData profile, so
a dev instance either drives its own helper or drives nothing. Never production.

Coordinates are validated against `workspace` bounds before assignment, and
`keepAbove` is never set on a window that failed the identity check.

## 1 · The helper package

Bundled at `desktop/assets/kwin-helper/`, installed to
`~/.local/share/kwin/scripts/youcodedbuddyhelper/`. Verified 2026-09-04: KWin
loads it from config alone after `kwriteconfig6 … Enabled true` +
`org.kde.KWin.reconfigure`, with no KWin restart.

**asar (R1-13.1):** `assets/**` is packaged *inside* `app.asar`, and recursive
copy helpers are not asar-aware. Either add `assets/kwin-helper/**` to
`asarUnpack` or copy file-by-file with `readFileSync`/`writeFileSync`. **Verify
against a built artifact**, not against the `files:` rule.

**Half-install rollback (R1-13.6):** if files copy but `kwriteconfig6` or
`reconfigure` fails, remove what was written and report failure. Never leave
files on disk with `installed: false`, which would re-copy on every retry.

## 2 · The caption channel

**Contract:** `YOUCODED-BUDDY-<token>:<role>@<x>,<y>`, role ∈ `mascot`|`chat`|`bar`.

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
- **Helper:** attachment is not a one-shot decision. Wire `captionChanged` on
  every window and make the identity test the handler's first line, so a window
  that becomes ours later is still picked up. Disconnect on `windowRemoved`
  (R1-13.4).

**Taskbar captions (R1-8) — revision 1 was wrong.** It claimed the captions were
invisible because buddy windows set `skipTaskbar: true`. **`skipTaskbar` is a
no-op on Wayland** — this repo's own verified comment
(`buddy-overlay-manager.ts:386`) says so. Uncorrected, the user's task manager and
Alt-Tab would show `YOUCODED-BUDDY-…:mascot@1079,411` with the numbers changing
60×/second during a drag. **The helper sets `skipTaskbar`, `skipSwitcher` and
`skipPager` on the matched window itself** — it can, from inside the compositor,
where the app cannot. That is a better fix than the app's no-op, and it removes
the user-visible consequence entirely. **Verify by eye in a dev instance before
trusting it.**

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
- A `positionOf(win)` helper replaces all nine reads.
- **Persistence moves off `win.on('move')`**, which never fires for a
  compositor-side move — today that silently means the buddy's position is never
  saved on Linux. It moves into `place()`, debounced.
- Guard: a source scan forbidding `getBounds`/`getPosition` on a buddy window
  outside `positionOf`.

**Write sites are nine `setPosition` calls, not eleven** (two matches were
comments) — **plus three BrowserWindow constructor placements** (309, 599, 654)
that revision 1 missed entirely. Constructor `x`/`y` is ignored on Wayland just
as `setPosition` is, so all three windows would still have appeared wherever KWin
dropped them. They resolve with §2's fix: the caption *is* the constructor title,
so creation and placement become one act.

Dragging needs no global cursor (`getCursorScreenPoint` is `{0,0}` on Wayland):
cursor-in-screen = windowPos + cursor-in-window, self-correcting each frame.

## 4 · Detection and IPC (R1-10, R1-11, R1-12)

| Channel | Meaning |
|---|---|
| `buddy:helper-status` | `{ supported, installed }` |
| `buddy:install-helper` | `{ ok }` |
| `buddy:remove-helper` | `{ ok }` — new, per decide-uninstall#D-1 |

- **`installed`** is `isScriptLoaded youcodedbuddyhelper` over DBus — what the
  probe recommended. Files-plus-config-key is a proxy that reports true when KWin
  has not reconfigured, when the script threw on load, or when a restart is
  pending. Files+config remain the input to the *install* decision only.
  **Re-checked on window-show**, not once at panel mount, so disabling the script
  in System Settings mid-session is noticed.
- **`supported`** is not "`org.kde.KWin` is reachable" — that is also true on
  Plasma **5**, whose scripting API is `clientList`/`clientAdded`, which this
  helper does not use. Install would succeed and the buddy would never move,
  while R5's honest "not yet supported" never showed. `supported` is a capability
  probe: load a trivial script that calls `workspace.windowList` and report
  whether it ran. `kwriteconfig6` is an explicit dependency (Plasma 5 ships
  `kwriteconfig5`); "KDE, but too old" is the R5 state.

**Four surfaces, not three** — `preload.ts`, `remote-shim.ts`, the main handler,
and `SessionService.kt`, plus the `IPC` constant. And
`ipc-channels.test.ts` does **not** pick new channels up for free: it is
hand-written per channel family. A `buddy:* channel parity` block is a build
task, shaped like the existing `terminal:get-screen-text` one. Android stubs
rather than being omitted, matching the other families.

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
  outside `positionOf`.
- `buddy-title-guard.test.ts` — no buddy renderer sets `document.title`; every
  buddy window preventDefaults `page-title-updated`.
- `buddy-linux-migration.test.ts` — R12 runs exactly once.
- `buddy-consent-gate.test.ts` — `BUDDY_SHOW` refuses on Linux without a live
  helper, including when status is unknown.
- Source scan: the pin switch stays gone (R6).
- `ipc-channels.test.ts` — a hand-written `buddy:*` parity block.

## 9 · Out of scope, stated

- GNOME and wlroots: no lever exists; the buddy is unavailable and says so.
- **Multi-monitor is unproven** — one screen was connected during the probe. KWin
  exposes every screen in one coordinate space with per-screen scale, so it is
  reachable by construction, but it needs a real two-screen run.
- Surviving a KWin restart is untested.
- The deb/rpm/pacman uninstall hook, deliberately (§6).
