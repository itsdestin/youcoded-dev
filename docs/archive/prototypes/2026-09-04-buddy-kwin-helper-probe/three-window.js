// Round 3 — the measurement §3 of the technical design says must happen before
// any code is written: does the per-role caption channel still deliver every
// frame when THREE windows are driven at 60fps at once (180 renames/sec)?
//
// If it holds, the per-role grammar stays and there is one handler and no
// cross-window references. If it drops frames, a group grammar has to be
// written in full.
const { app, BrowserWindow } = require('electron');

const P = 'YOUCODED-KWIN-PROBE';
// Real buddy sizes, so the compositor is doing the same work it would in the app.
const ROLES = [
  { role: 'mascot', w: 112, h: 112, cx: 700, cy: 430, r: 300 },
  { role: 'chat',   w: 320, h: 480, cx: 500, cy: 300, r: 180 },
  { role: 'bar',    w: 300, h: 60,  cx: 900, cy: 700, r: 140 },
];
const FRAMES = Number(process.env.FRAMES || 120);
const wins = {};

app.whenReady().then(() => {
  for (const r of ROLES) {
    const win = new BrowserWindow({
      width: r.w, height: r.h, frame: false, transparent: true, resizable: false,
      skipTaskbar: true,
      title: `${P}:${r.role}@${Math.round(r.cx)},${Math.round(r.cy)}`,
      webPreferences: { contextIsolation: true },
    });
    win.on('page-title-updated', (e) => e.preventDefault()); // caption IS the channel
    win.loadFile('holder.html');
    wins[r.role] = win;
  }

  setTimeout(() => {
    let i = 0;
    const t0 = Date.now();
    const step = () => {
      const last = i === FRAMES - 1;
      for (const r of ROLES) {
        // Distinct integer coords every frame per role, so a skipped frame can
        // never hide behind a repeated value.
        const a = i * 0.105 + (r.role.length);
        const x = Math.round(r.cx + r.r * Math.cos(a));
        const y = Math.round(r.cy + (r.r * 0.7) * Math.sin(a));
        wins[r.role].setTitle(`${P}:${r.role}@${x},${y}` + (last ? '!REPORT' : ''));
      }
      if (++i < FRAMES) setTimeout(step, 16);
      else {
        const ms = Date.now() - t0;
        console.log(`SWEEP_DONE|${FRAMES} frames x 3 windows = ${FRAMES * 3} renames in ${ms}ms ` +
                    `(${Math.round((FRAMES * 3 * 1000) / ms)} renames/sec)`);
        setTimeout(() => app.quit(), 4000);
      }
    };
    step();
  }, 5000);
});
app.on('window-all-closed', () => app.quit());
