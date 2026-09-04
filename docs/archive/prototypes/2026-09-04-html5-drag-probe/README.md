# Two-window drag probe — a page-started drag on Electron/Wayland (2026-09-04)

The probe that unblocked session drag between windows on Linux/Wayland. It answers, on
the machine it runs on: does a drag the PAGE starts (`draggable` + `dragstart` +
`setDragImage`) carry a full-size picture, a `dataTransfer` payload and a `move`
effect between two Electron windows — and how do Escape, a release over the desktop,
touch and in-bar `dragover` behave.

```
cd docs/archive/prototypes/2026-09-04-html5-drag-probe
../../../../youcoded/desktop/node_modules/.bin/electron --ozone-platform=wayland main.js
```

Two windows open. Drag the pill as the page says; every event is appended to
`probe3.log` next to `main.js`, so nothing has to be read off the screen. The picture
is a 330×160 CSS px ruler with a gridline every 40 px: whatever slice appears tells you
the crop AND the scale in one screenshot (60 screen px between lines = 1.5×).

What it measured on the Z13 (KDE Plasma / Wayland, Electron 41.10.7):

| Question | Answer |
|---|---|
| Picture | 330 px whole, crisp at 1.5× — no 138 px ceiling (that ceiling is `webContents.startDrag`'s link-drag helper, not the compositor) |
| Payload | Arrives through `dataTransfer` under a private MIME type |
| `move` | Accepted |
| Drops | Both directions between the windows |
| In-bar `dragover` | ~190 events/s with working `clientX` |
| Escape vs release over the desktop | Indistinguishable: both `dropEffect 'none'`, coordinates unusable |
| Touch | Never starts a browser drag, with or without `--touch-drag-drop` (`main.js` still carries the switch) |

Where the results went: `.claude/rules/multi-window-detach.md` and
`docs/archive/handoffs/2026-09-04-session-drag-START-HERE.md`. The window-API probe
(`screen.getCursorScreenPoint` etc.) is `scripts/platform-probe.mjs`.
