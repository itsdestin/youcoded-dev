// Drives the caption channel: sweeps the window along a path by renaming itself,
// and logs the wall time so we can compare against the DBus path.
const { app, BrowserWindow } = require('electron');
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 420, height: 300, frame: false, transparent: true, resizable: false,
    title: 'YOUCODED-KWIN-PROBE@700,400',
    webPreferences: { contextIsolation: true },
  });
  win.loadFile('holder.html');
  win.on('page-title-updated', (e) => e.preventDefault()); // page must never clobber the channel

  setTimeout(() => {
    const N = 120;
    const t0 = Date.now();
    let i = 0;
    const step = () => {
      const x = Math.round(700 + 380 * Math.cos(i * 0.105));
      const y = Math.round(430 + 260 * Math.sin(i * 0.105));
      win.setTitle(`YOUCODED-KWIN-PROBE@${x},${y}`);
      if (++i < N) setTimeout(step, 16);        // 60fps cadence
      else {
        console.log(`SWEEP_DONE|${N} title writes in ${Date.now() - t0}ms`);
        setTimeout(() => app.quit(), 3000);
      }
    };
    step();
  }, 5000);
});
app.on('window-all-closed', () => app.quit());
