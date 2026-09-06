// Round 5 — the two measurements that need Destin:
//   (a) MULTI-MONITOR: does a caption-channel move address a second screen, and
//       do Electron's display bounds agree with KWin's? (§9, §10)
//   (b) CAPTION LEAKS: does the caption show in Overview / the screen-share
//       picker mid-drag, despite the helper's skip flags? (§2)
// Uses the real shipping grammar YC:mascot@x,y so what he sees is what a user
// would see.
const { app, BrowserWindow, ipcMain, screen } = require('electron');

const SIZE = { w: 340, h: 300 };
let win, pos = { x: 0, y: 0 };

function publish() {
  win.setTitle(`YC:mascot@${Math.round(pos.x)},${Math.round(pos.y)}`);
}

app.whenReady().then(() => {
  const displays = screen.getAllDisplays().map((d, i) => ({
    i, id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor,
  }));
  displays.forEach((d) => console.log(
    `ELECTRON_SCREEN|${d.i}|label=${d.label}|bounds=${JSON.stringify(d.bounds)}` +
    `|workArea=${JSON.stringify(d.workArea)}|scale=${d.scale}`));

  const primary = screen.getPrimaryDisplay().workArea;
  pos = { x: primary.x + 120, y: primary.y + 120 };

  win = new BrowserWindow({
    width: SIZE.w, height: SIZE.h, frame: false, transparent: true, resizable: false,
    skipTaskbar: true,
    title: `YC:mascot@${pos.x},${pos.y}`,
    webPreferences: { preload: `${__dirname}/preload.js`, contextIsolation: true },
  });
  win.on('page-title-updated', (e) => e.preventDefault()); // the caption IS the channel
  win.loadFile('round5.html');
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('probe:init', { start: pos, win: { w: SIZE.w, h: SIZE.h }, displays });
  });

  ipcMain.on('probe:move', (_e, { x, y }) => { pos.x = x; pos.y = y; publish(); });
  ipcMain.on('probe:log', (_e, m) => console.log('RENDERER|' + m));
  ipcMain.on('probe:quit', () => app.quit());
});
app.on('window-all-closed', () => app.quit());
