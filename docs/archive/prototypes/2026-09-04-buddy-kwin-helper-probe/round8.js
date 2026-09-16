// Round 8 — the drag-flicker measurement.
//
// QUESTION: on native Wayland, when the helper moves a buddy window, does the
// RENDERER's idea of where its window sits on screen (window.screenX/Y, which
// is exactly what a pointer event's e.screenX is measured from) follow the move?
//
// It matters because the drag is anchor-based: every pointermove sends
// (e.screenX - grabOffset) as the new window position. If e.screenX is measured
// from a window origin that never updates, then moving the window changes the
// reported cursor position by the same amount — a feedback loop.
const { app, BrowserWindow, screen } = require('electron');
const SIZE = { w: 200, h: 200 };
let win;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const wa = screen.getPrimaryDisplay().workArea;
  const start = { x: wa.x + 100, y: wa.y + 100 };
  win = new BrowserWindow({
    width: SIZE.w, height: SIZE.h, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, title: `YC:mascot@${start.x},${start.y}`,
    webPreferences: { contextIsolation: true },
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  await win.loadURL('data:text/html,<body style="background:#3a7">round8</body>');
  await sleep(1200);

  const ask = async (label) => {
    const r = await win.webContents.executeJavaScript(
      '({sx: window.screenX, sy: window.screenY, sl: window.screenLeft, st: window.screenTop, aw: window.screen.availWidth})');
    const b = win.getBounds();
    console.log(`MEASURE|${label}|renderer.screenX=${r.sx} screenY=${r.sy}` +
      `|main.getBounds=${b.x},${b.y}`);
  };

  await ask('after-create');
  for (const p of [{x: wa.x + 500, y: wa.y + 300}, {x: wa.x + 900, y: wa.y + 600}, {x: wa.x + 200, y: wa.y + 150}]) {
    win.setTitle(`YC:mascot@${p.x},${p.y}`);
    await sleep(500);
    await ask(`after-caption-move-to-${p.x},${p.y}`);
  }
  await sleep(300);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
