// Round 0 holder: opens ONE small window with a distinctive caption and holds it
// open so KWin scripts can be run against it from outside.
//
// WHY a distinctive caption: KWin scripts match windows by caption/resourceClass,
// and the 2026-07 probe learned that document.title clobbers the caption. We set
// the title once and never let the page change it.
const { app, BrowserWindow } = require('electron');

const HOLD_MS = Number(process.env.HOLD_MS || 25000);
let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: false,
    title: 'YOUCODED-KWIN-PROBE',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver'); // known no-op on Wayland; here as the control
  win.loadFile('holder.html');

  // Electron's own view of the world, for the lie-detector column of the report.
  const report = () => {
    const b = win.getBounds();
    console.log(`ELECTRON_SAYS|x=${b.x},y=${b.y},w=${b.width},h=${b.height}|alwaysOnTop=${win.isAlwaysOnTop()}`);
  };
  report();
  const t = setInterval(report, 5000);
  setTimeout(() => { clearInterval(t); app.quit(); }, HOLD_MS);
});
app.on('window-all-closed', () => app.quit());
