// Repro: does setPosition inflate a frameless resizable:false window under
// XWayland 1.5x scaling? And do (a) setBounds-with-size or (b) min==max clamp it?
const { app, BrowserWindow, screen } = require('electron');

// Force XWayland (real argv flag is set by the launcher too, belt-and-suspenders)
app.commandLine.appendSwitch('ozone-platform', 'x11');

const CHAT = { width: 333, height: 488 };

function report(tag, win) {
  const b = win.getBounds();
  console.log(`PROBE ${tag}: ${b.width}x${b.height} @${b.x},${b.y}`);
}

app.whenReady().then(async () => {
  const sf = screen.getPrimaryDisplay().scaleFactor;
  console.log('PROBE scaleFactor=' + sf);

  // --- Window A: plain setPosition (mimics current buddy code) ---
  const a = new BrowserWindow({
    ...CHAT, x: 200, y: 200, transparent: true, frame: false,
    resizable: false, hasShadow: false, backgroundColor: '#00000000', show: true,
  });
  await a.loadURL('data:text/html,<body style="background:transparent">A</body>');
  report('A-init', a);
  for (let i = 0; i < 40; i++) a.setPosition(200 + (i % 20), 200 + (i % 20));
  await new Promise(r => setTimeout(r, 300));
  report('A-after-40x-setPosition', a);

  // --- Window B: setBounds with fixed size every move ---
  const b = new BrowserWindow({
    ...CHAT, x: 600, y: 200, transparent: true, frame: false,
    resizable: false, hasShadow: false, backgroundColor: '#00000000', show: true,
  });
  await b.loadURL('data:text/html,<body style="background:transparent">B</body>');
  report('B-init', b);
  for (let i = 0; i < 40; i++) b.setBounds({ x: 600 + (i % 20), y: 200 + (i % 20), width: CHAT.width, height: CHAT.height });
  await new Promise(r => setTimeout(r, 300));
  report('B-after-40x-setBounds', b);

  // --- Window C: min==max==size, then plain setPosition ---
  const c = new BrowserWindow({
    ...CHAT, x: 1000, y: 200, transparent: true, frame: false,
    resizable: false, hasShadow: false, backgroundColor: '#00000000', show: true,
  });
  c.setMinimumSize(CHAT.width, CHAT.height);
  c.setMaximumSize(CHAT.width, CHAT.height);
  await c.loadURL('data:text/html,<body style="background:transparent">C</body>');
  report('C-init', c);
  for (let i = 0; i < 40; i++) c.setPosition(1000 + (i % 20), 200 + (i % 20));
  await new Promise(r => setTimeout(r, 300));
  report('C-after-40x-setPosition-minmax', c);

  console.log('PROBE DONE');
  setTimeout(() => app.quit(), 200);
});
