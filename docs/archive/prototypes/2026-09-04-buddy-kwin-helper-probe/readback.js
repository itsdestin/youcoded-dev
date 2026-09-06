// Does the app get ANY readback of a compositor-side move?
//   R1: does win.on('move') fire when KWin moves the window?
//   R2: does getBounds() reflect the real position afterwards?
// §3 of the technical design asserts "never" for R1 and builds an app-owned
// position model on it. It was reasoned from Round 0, not measured on this path.
const { app, BrowserWindow, screen } = require('electron');
let win, moveEvents = 0;
app.whenReady().then(() => {
  const wa = screen.getPrimaryDisplay().workArea;
  console.log(`ELECTRON_WORKAREA|${JSON.stringify(wa)}|bounds=${JSON.stringify(screen.getPrimaryDisplay().bounds)}`);
  win = new BrowserWindow({
    width: 200, height: 160, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, title: 'YC:mascot@300,300',
    webPreferences: { contextIsolation: true },
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('move', () => {
    const b = win.getBounds();
    console.log(`MOVE_EVENT|#${++moveEvents}|getBounds=${b.x},${b.y}`);
  });
  win.loadFile('holder.html');

  const targets = [[300,300],[820,120],[1200,880],[40,40]];
  let i = 0;
  const step = () => {
    const [x,y] = targets[i];
    win.setTitle(`YC:mascot@${x},${y}`);
    setTimeout(() => {
      const b = win.getBounds();
      console.log(`POLL|asked=${x},${y}|getBounds=${b.x},${b.y}|match=${b.x===x&&b.y===y}`);
      if (++i < targets.length) step();
      else { console.log(`TOTAL_MOVE_EVENTS|${moveEvents}`); setTimeout(()=>app.quit(), 500); }
    }, 700);
  };
  setTimeout(step, 2500);
});
app.on('window-all-closed', () => app.quit());
