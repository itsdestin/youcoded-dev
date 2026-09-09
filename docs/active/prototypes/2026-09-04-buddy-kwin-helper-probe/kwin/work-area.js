// Does KWin reserve space for the Plasma panel, and does Electron's workArea
// agree? §0 of the technical design clamps the buddy to Electron's workArea
// "which excludes the Plasma panel" — that was never measured on Wayland.
const T = "YCAREA";
function say(s) { print(T + "|" + s); }
try {
  var s = workspace.screens || [];
  for (var i = 0; i < s.length; i++) {
    var g = s[i].geometry;
    say("SCREEN|" + i + "|" + s[i].name + "|geom=" + g.x + "," + g.y + " " + g.width + "x" + g.height);
  }
} catch (e) { say("SCREENS_THREW|" + e); }
var opts = { PlacementArea: 0, MovementArea: 1, MaximizeArea: 2, MaximizeFullArea: 3,
             FullScreenArea: 4, WorkArea: 5, FullArea: 6, ScreenArea: 7 };
for (var k in opts) {
  try {
    var r = workspace.clientArea(opts[k], workspace.screens[0], workspace.currentDesktop);
    say("AREA|" + k + "=" + Math.round(r.x) + "," + Math.round(r.y) + " " +
        Math.round(r.width) + "x" + Math.round(r.height));
  } catch (e) { say("AREA|" + k + "=THREW " + e); }
}
