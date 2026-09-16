// F9: does Electron's screen API describe the SAME coordinate space as KWin's
// frameGeometry? All of the snap/dock/clamp maths assumes it does. Nobody checked.
const { app, screen, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const d = screen.getPrimaryDisplay();
  console.log('ELECTRON_DISPLAY|bounds=' + JSON.stringify(d.bounds) +
              '|workArea=' + JSON.stringify(d.workArea) + '|scale=' + d.scaleFactor);
  // A window asked for a known spot, so KWin can be asked where it really is.
  const w = new BrowserWindow({ width: 400, height: 250, frame: false, transparent: true,
    title: 'YOUCODED-KWIN-PROBE@300,200', show: true });
  w.on('page-title-updated', (e) => e.preventDefault());
  w.loadFile('holder.html');
  console.log('ELECTRON_ASKED|300,200');
  setTimeout(() => app.quit(), 14000);
});
app.on('window-all-closed', () => app.quit());
