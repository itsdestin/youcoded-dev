// YouCoded buddy helper — installed form of kwin/resident-follow.js.
//
// The app cannot position or raise its own windows on Wayland. This script runs
// inside KWin, which can. The app asks by RENAMING its window; nothing else.
//
// Caption contract:  YOUCODED-BUDDY@<x>,<y>
// Anything not matching that prefix is ignored, so this can never move a window
// the app does not own.
const PREFIX = "YOUCODED-BUDDY";
const TAG = "YOUCODEDBUDDY";
function say(s) { print(TAG + "|" + s); }

function owned(w) { return !!w.caption && w.caption.indexOf(PREFIX) === 0; }

function apply(w) {
  const m = /@(-?\d+),(-?\d+)/.exec(w.caption);
  if (!m) return;
  const g = w.frameGeometry;
  const x = parseInt(m[1], 10), y = parseInt(m[2], 10);
  if (g.x === x && g.y === y) return;
  w.frameGeometry = { x: x, y: y, width: g.width, height: g.height };
}

function attach(w) {
  if (!owned(w)) return;
  w.keepAbove = true;                       // the primitive Electron no-ops on Wayland
  w.captionChanged.connect(function () { apply(w); });
  apply(w);
  say("ATTACHED|" + w.caption);
}

// Windows that already exist, plus every one created later — the app's floater
// is created long after KWin loads this at session start.
workspace.windowList().forEach(attach);
workspace.windowAdded.connect(attach);

// Screen inventory, for the multi-monitor question. Logged once at load.
try {
  const s = workspace.screens || [];
  for (let i = 0; i < s.length; i++) {
    const g = s[i].geometry;
    say("SCREEN|" + i + "|name=" + s[i].name + "|x=" + g.x + ",y=" + g.y +
        ",w=" + g.width + ",h=" + g.height + "|scale=" + s[i].devicePixelRatio);
  }
  const wa = workspace.workspaceSize;
  say("WORKSPACE|w=" + (wa ? wa.width : "?") + ",h=" + (wa ? wa.height : "?") +
      "|screens=" + s.length);
} catch (e) { say("SCREENPROBE_THREW|" + e); }

say("READY|installed-package");
