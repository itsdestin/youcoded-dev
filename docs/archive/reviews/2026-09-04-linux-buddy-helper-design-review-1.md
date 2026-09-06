---
status: active
date: 2026-09-04
feature: linux-buddy-helper
round: 1
design: docs/active/design/2026-09-04-linux-buddy-helper/technical-design.md
---

# Linux buddy helper — design review, round 1

Adversarial review by a fresh agent against the branch. **13 findings, 13
accepted, 0 rejected.** A round where nothing is accepted stops the cycle; this
is not that round, so a round 2 follows.

Three of these are severe enough to have shipped real harm.

| # | Finding | Verdict |
|---|---|---|
| R1-1 | The design converts position WRITES but not READS. Nine `getPosition`/`getBounds` sites in `buddy-window-manager.ts` would freeze at constructor values, breaking snap, dock, chat-follow and persistence. `win.on('move')` never fires for a compositor-side move, so the buddy's position is never saved. | accepted |
| R1-2 | **Security.** A caption prefix is not an identity — every app, and every *web page* (browser captions are `<document.title> — Firefox`), can name itself `YOUCODED-BUDDY:…` and be granted always-on-top plus teleport by a compositor-privileged script. | accepted |
| R1-3 | A dev instance and the production app emit identical captions and share one installed helper, so dragging the buddy in dev moves the buddy in Destin's real app. `main.ts:638` deliberately excludes buddy windows from the dev title marker. | accepted |
| R1-4 | Attach-ordering race: buddy windows are created with `title: undefined` and adopt `"YouCoded"` on load, so `windowAdded` sees a non-matching caption and the helper never attaches. The probe missed it because its rig set the title at construction. | accepted |
| R1-5 | "Eleven `setPosition` sites" is false — nine (two matches were comments). Worse, three windows are placed by the BrowserWindow **constructor**, which the design does not route at all. | accepted |
| R1-6 | R7 (stays above other windows) has no mechanism in the design. And the merged `SettingsPanel.tsx` comment claiming `kwin-keep-above.ts` is "what the helper drives" is wrong: it exact-matches a caption this feature never produces. | accepted |
| R1-7 | R4 is not delivered. The consent gate is renderer-only; `helper` starts `null` and a failed status check leaves it `null`, so an early click enables the buddy with no ask. The boot path and the main-side handler check nothing. | accepted |
| R1-8 | `skipTaskbar` is a **no-op on Wayland** — this repo's own verified comment says so. Buddy captions therefore appear in the task manager and Alt-Tab, flickering coordinates 60×/second during a drag. The design's "invisible to users" is false. | accepted |
| R1-9 | The approved consent copy promises "removed when you uninstall YouCoded". AppImage has no uninstall step, and a root post-removal hook cannot safely edit a per-user `kwinrc`. **Approved copy makes a promise the design cannot keep.** | accepted — needs Destin |
| R1-10 | "`ipc-channels.test.ts` picks up the channels for free" is false: the suite is hand-written per channel family. The surface count is four (incl. Android), not three. | accepted |
| R1-11 | `installed` = files + config key is a proxy. The probe's own recommendation is `isScriptLoaded` over DBus. No live re-check if the user disables the script mid-session. | accepted |
| R1-12 | `supported` = "org.kde.KWin reachable" is true on Plasma **5**, whose scripting API (`clientList`) the helper does not use — install succeeds, buddy never moves, and R5's honest "not yet supported" never shows. | accepted |
| R1-13 | Six smaller gaps: `assets/**` is inside `app.asar` and recursive copy is not asar-aware; R12's migration reads renderer `localStorage` so it cannot run in main; R11's overwrite-and-reconfigure reload is untested; the helper leaks signal connections; "a rename is free" is overstated; no rollback for a half-install. | accepted |

## What the reviewer confirmed as sound

The core mechanism. The probe drove `setTitle` on a real Electron window using
the app's own Electron binary, so the 60 fps / zero-drop measurement transfers.
Reusing `kwin-keep-above.ts`'s qdbus discovery is correct and that file contains
what the design claims. §7's scope exclusions are honestly hedged. The
MOCK_ONLY → real transition is already enforced by a test.

## Consequence

R1-9 contradicts approved UI, so it goes back to Destin as a decide deck rather
than being reinterpreted here. Everything else is folded into design round 2.
