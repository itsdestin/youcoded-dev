// Can the app tell whether ITS OWN windows are native Wayland surfaces or
// XWayland? This decides whether the helper is "needed" here — and getting it
// wrong the wrong way takes a working buddy away from an X11/XWayland user.
const { app, screen, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const env = (k) => JSON.stringify(process.env[k]);
  console.log('ENV|XDG_SESSION_TYPE=' + env('XDG_SESSION_TYPE') +
              '|WAYLAND_DISPLAY=' + env('WAYLAND_DISPLAY') +
              '|DISPLAY=' + env('DISPLAY') +
              '|XDG_CURRENT_DESKTOP=' + env('XDG_CURRENT_DESKTOP'));
  for (const sw of ['ozone-platform', 'ozone-platform-hint', 'enable-features']) {
    console.log(`SWITCH|${sw}|has=${app.commandLine.hasSwitch(sw)}|value=${JSON.stringify(app.commandLine.getSwitchValue(sw))}`);
  }
  const w = new BrowserWindow({ width: 200, height: 150, show: true, frame: false, transparent: true });
  w.loadFile('holder.html');
  setTimeout(() => {
    // The measured Wayland tells: cursor point pinned at 0,0, and a handle that
    // is not an X11 window id.
    const c = screen.getCursorScreenPoint();
    const h = w.getNativeWindowHandle();
    console.log(`CURSOR|${c.x},${c.y}`);
    console.log(`HANDLE|len=${h.length}|hex=${h.toString('hex')}`);
    w.setPosition(456, 321);
    setTimeout(() => {
      const p = w.getPosition();
      console.log(`SETPOS|asked=456,321|getPosition=${p[0]},${p[1]}`);
      app.quit();
    }, 400);
  }, 1200);
});
app.on('window-all-closed', () => app.quit());
