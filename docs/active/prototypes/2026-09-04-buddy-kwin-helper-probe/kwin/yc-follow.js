// Round 5 helper — the REAL shipping caption grammar, so what Destin sees in
// Overview and the screen-share picker is what a user would see.
//
//   YC:<role>@<x>,<y>       role in mascot|chat|bar
//
// Also sets the three "hide me" flags §2 of the technical design relies on
// (skipTaskbar/skipSwitcher/skipPager) — the app's own skipTaskbar is a no-op on
// Wayland, so if those flags work at all it is from in here. Whether they cover
// Overview and the screen-share picker is exactly what this round is checking.
const TAG = "YC5";
function say(s) { print(TAG + "|" + s); }

function roleOf(w) {
  var m = /^YC:(mascot|chat|bar)@/.exec(w.caption || "");
  return m ? m[1] : null;
}

function apply(w) {
  if (!roleOf(w)) return;
  var m = /@(-?\d+),(-?\d+)/.exec(w.caption);
  if (!m) return;
  var g = w.frameGeometry;
  var x = parseInt(m[1], 10), y = parseInt(m[2], 10);
  if (g.x === x && g.y === y) return;
  w.frameGeometry = { x: x, y: y, width: g.width, height: g.height };
}

function attach(w) {
  if (!roleOf(w)) return;
  w.keepAbove = true;
  var flags = "";
  try { w.skipTaskbar = true;  flags += "taskbar=" + w.skipTaskbar + " "; } catch (e) { flags += "taskbar=THREW "; }
  try { w.skipSwitcher = true; flags += "switcher=" + w.skipSwitcher + " "; } catch (e) { flags += "switcher=THREW "; }
  try { w.skipPager = true;    flags += "pager=" + w.skipPager; } catch (e) { flags += "pager=THREW"; }
  say("ATTACHED|" + w.caption + "|" + flags);
  w.captionChanged.connect(function () { apply(w); });
  apply(w);
}

workspace.windowList().forEach(attach);
workspace.windowAdded.connect(attach);

// Screen inventory as KWin sees it — compared against Electron's in the report.
try {
  var s = workspace.screens || [];
  for (var i = 0; i < s.length; i++) {
    var g = s[i].geometry;
    say("KWIN_SCREEN|" + i + "|name=" + s[i].name + "|x=" + g.x + ",y=" + g.y +
        ",w=" + g.width + ",h=" + g.height + "|scale=" + s[i].devicePixelRatio);
  }
} catch (e) { say("SCREENS_THREW|" + e); }
say("READY|yc-follow|screens=" + ((workspace.screens || []).length));
