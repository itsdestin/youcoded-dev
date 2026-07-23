// Ground-truth geometry straight from KWin. Electron's getBounds() echoes
// client-side cached values on Wayland; the compositor knows what is real.
const wins = workspace.windowList();
for (const w of wins) {
  const g = w.frameGeometry;
  print("KWINPROBE|" + w.resourceClass + "|" + w.caption + "|x=" + g.x + ",y=" + g.y +
        ",w=" + g.width + ",h=" + g.height +
        "|keepAbove=" + w.keepAbove + "|fullScreen=" + w.fullScreen +
        "|maximizable=" + w.maximizable);
}
