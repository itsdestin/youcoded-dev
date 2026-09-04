// Probe 3 — does a drag that the PAGE starts (HTML5 dragstart + setDragImage)
// escape the 138px ceiling? The ceiling was traced to Electron's Linux
// startDrag helper (button_drag_utils::SetDragImage, kLinkDragImageMaxWidth=150),
// which a renderer-initiated drag never touches. Also measures: the scale the
// picture is drawn at (1x vs 1.5x), whether `move` is accepted, whether the
// payload arrives via dataTransfer, and how fast `dragover` fires in the bar.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const LOG = path.join(__dirname, 'probe3.log');
try { fs.unlinkSync(LOG); } catch {}
const rec = (m) => { fs.appendFileSync(LOG, m + '\n'); console.log('[P3]', m); };
app.commandLine.appendSwitch('touch-drag-drop');
app.whenReady().then(() => {
  const mk = (who, x) => {
    const w = new BrowserWindow({ x, y: 140, width: 620, height: 400, title: 'Window ' + who,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
    w.loadFile(path.join(__dirname, 'page.html'), { query: { who } });
  };
  mk('A', 60); mk('B', 760);
  ipcMain.on('report', (_e, m) => rec(m));
});
app.on('window-all-closed', () => app.quit());
