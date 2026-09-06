// Resident KWin helper: watches OUR window's caption and moves the window to the
// coordinates encoded in it.  Caption format:  YOUCODED-KWIN-PROBE@<x>,<y>
//
// WHY the caption: KWin scripts have no filesystem and no inbound DBus. They CAN
// react to compositor signals. The window title is a channel the app already
// controls, costs nothing to write, and changes are delivered to the compositor
// as an event — so a drag becomes "set title 60x/sec" with no per-move DBus call
// and no script reload.
const TAG = "KWINFOLLOW";
function say(s) { print(TAG + "|" + s); }

function isProbe(w) { return w.caption && w.caption.indexOf("YOUCODED-KWIN-PROBE") === 0; }

function apply(w) {
  const m = /@(-?\d+),(-?\d+)/.exec(w.caption);
  if (!m) return;
  const g = w.frameGeometry;
  const x = parseInt(m[1], 10), y = parseInt(m[2], 10);
  if (g.x === x && g.y === y) return;
  w.frameGeometry = { x: x, y: y, width: g.width, height: g.height };
  say("MOVED|" + x + "," + y + "|now=" + w.frameGeometry.x + "," + w.frameGeometry.y);
}

function attach(w) {
  if (!isProbe(w)) return;
  w.keepAbove = true;
  say("ATTACHED|" + w.caption + "|keepAbove=" + w.keepAbove);
  w.captionChanged.connect(function () { apply(w); });
  apply(w);
}

workspace.windowList().forEach(attach);
workspace.windowAdded.connect(attach);
say("READY");
