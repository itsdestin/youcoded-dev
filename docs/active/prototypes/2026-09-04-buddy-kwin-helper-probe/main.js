// Interactive rig for the KWin-helper route.
//
// THE WHOLE IDEA: the app never calls setPosition (a proven no-op on Wayland).
// It moves itself by RENAMING ITS OWN WINDOW to "YOUCODED-KWIN-PROBE@x,y".
// A resident KWin script — running inside the compositor, which is allowed to
// move windows — watches the caption and applies the coordinates. Round 0
// measured 120/120 title writes landing at a 60fps cadence with zero drops.
const { app, BrowserWindow, ipcMain, screen } = require('electron');

const START = { x: 640, y: 380, w: 300, h: 300 };
let win;
let pos = { x: START.x, y: START.y };

function publish() {
  // The move channel. One string write; no IPC to the compositor, no script reload.
  win.setTitle(`YOUCODED-KWIN-PROBE@${Math.round(pos.x)},${Math.round(pos.y)}`);
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: START.w, height: START.h,
    frame: false, transparent: true, resizable: false, skipTaskbar: true,
    title: `YOUCODED-KWIN-PROBE@${START.x},${START.y}`,
    webPreferences: { preload: `${__dirname}/preload.js`, contextIsolation: true },
  });
  // The page must never clobber the caption — it IS the control channel now.
  win.on('page-title-updated', (e) => e.preventDefault());
  win.loadFile('index.html');

  const disp = screen.getPrimaryDisplay().workAreaSize;
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('probe:init', { start: pos, win: { w: START.w, h: START.h }, screen: disp });
  });

  ipcMain.on('probe:move', (_e, { x, y }) => {
    // Clamp to the screen so the rig can never strand itself off-display.
    pos.x = Math.max(0, Math.min(disp.width - START.w, x));
    pos.y = Math.max(0, Math.min(disp.height - START.h, y));
    publish();
  });
  ipcMain.handle('probe:size', () => ({ w: START.w, h: START.h, screen: disp }));
  ipcMain.on('probe:log', (_e, m) => console.log('RENDERER|' + m));
  ipcMain.on('probe:quit', () => app.quit());
});
app.on('window-all-closed', () => app.quit());
