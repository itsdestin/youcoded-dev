// Round 8 helper — same grammar as the shipping script, plus it REPORTS the
// geometry it actually applied, so the probe can compare KWin's truth against
// what the renderer believes (window.screenX).
const TAG = "YC8";
function say(s) { print(TAG + "|" + s); }
function roleOf(w) { var m = /^YC:(mascot|chat|bar)@/.exec(w.caption || ""); return m ? m[1] : null; }
function apply(w) {
  if (!roleOf(w)) return;
  var m = /@(-?\d+),(-?\d+)/.exec(w.caption);
  if (!m) return;
  var g = w.frameGeometry;
  var x = parseInt(m[1], 10), y = parseInt(m[2], 10);
  if (g.x === x && g.y === y) return;
  w.frameGeometry = { x: x, y: y, width: g.width, height: g.height };
  var n = w.frameGeometry;
  say("APPLIED|asked=" + x + "," + y + "|now=" + n.x + "," + n.y);
}
function attach(w) {
  if (!roleOf(w)) return;
  w.keepAbove = true;
  say("ATTACHED|" + w.caption);
  w.captionChanged.connect(function () { apply(w); });
  apply(w);
}
workspace.windowList().forEach(attach);
workspace.windowAdded.connect(attach);
say("READY");
