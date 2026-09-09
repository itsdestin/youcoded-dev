// Round 3 helper: same caption channel as resident-follow.js, but PER ROLE and
// self-counting, so we can answer "does the channel still deliver every frame
// when three windows are being renamed at once?".
//
// WHY counting inside the compositor: printing one line per move would push ~360
// lines into journald in two seconds, which journald rate-limits — dropped LOG
// lines would look exactly like dropped MOVES. So the script counts in memory and
// prints once, when the app writes the !REPORT sentinel on its last frame.
//
// Caption grammar (probe only):  YOUCODED-KWIN-PROBE:<role>@<x>,<y>[!REPORT]
const TAG = "KWIN3";
function say(s) { print(TAG + "|" + s); }

var stats = {};   // role -> { seen, applied, last }

function roleOf(w) {
  var m = /^YOUCODED-KWIN-PROBE:([a-z]+)@/.exec(w.caption || "");
  return m ? m[1] : null;
}

function apply(w) {
  var role = roleOf(w);
  if (!role) return;
  var s = stats[role] || (stats[role] = { seen: 0, applied: 0, last: "" });
  s.seen++;
  var m = /@(-?\d+),(-?\d+)/.exec(w.caption);
  if (!m) return;
  var g = w.frameGeometry;
  var x = parseInt(m[1], 10), y = parseInt(m[2], 10);
  if (g.x !== x || g.y !== y) {
    w.frameGeometry = { x: x, y: y, width: g.width, height: g.height };
    s.applied++;
  }
  s.last = x + "," + y;

  if (w.caption.indexOf("!REPORT") !== -1) {
    var f = w.frameGeometry;
    say("REPORT|" + role + "|seen=" + s.seen + "|applied=" + s.applied +
        "|asked=" + s.last + "|final=" + Math.round(f.x) + "," + Math.round(f.y) +
        "|exact=" + ((Math.round(f.x) + "," + Math.round(f.y)) === s.last));
  }
}

function attach(w) {
  if (!roleOf(w)) return;
  w.keepAbove = true;
  w.captionChanged.connect(function () { apply(w); });
  apply(w);
  say("ATTACHED|" + w.caption);
}

workspace.windowList().forEach(attach);
workspace.windowAdded.connect(attach);
say("READY|three-follow");
