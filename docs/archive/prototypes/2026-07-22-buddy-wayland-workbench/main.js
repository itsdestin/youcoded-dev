// Buddy floater — Wayland primitive probe workbench.
//
// WHY this exists: the one-window floater rewrite (docs/active/handoffs/
// 2026-07-22-handoff-buddy-floater-wayland-rewrite.md) assumes a set of OS
// primitives are available on native Wayland. Before writing a spec against
// those assumptions we verify each one against the real compositor. A failed
// primitive here changes the whole architecture, so this runs FIRST.
//
// Two modes:
//   electron .              -> auto probes, prints a table, quits after itself.
//   electron . --interactive -> opens the overlay for the eyeball/cursor tests.
//
// The auto mode deliberately self-terminates so a bad always-on-top window can
// never strand the desktop.

const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');

const INTERACTIVE = process.argv.includes('--interactive');
const results = [];

function record(id, question, verdict, detail) {
  results.push({ id, question, verdict, detail });
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad(id, 5)} ${pad(verdict, 12)} ${pad(question, 52)} ${detail}`);
}

function makeOverlayWindow(opts = {}) {
  // Mirrors the real buddy window flags (main.ts createAppWindow buddyExtras)
  // so the probe measures the same surface configuration the app would use.
  return new BrowserWindow({
    width: opts.width ?? 400,
    height: opts.height ?? 300,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    thickFrame: false,
    roundedCorners: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

// Definitive ozone-backend detection. Electron's getPosition() ECHOES the last
// requested value on Wayland, so you cannot tell from Electron's own API whether
// a call really took effect. The open socket does not lie: a native Wayland
// client holds an fd on wayland-N; an XWayland client holds one on /tmp/.X11-unix.
// (Connected unix sockets show as socket:[inode] in /proc/self/fd, with no path,
// so fd inspection can't answer this. The loaded shared libraries can: Chromium
// only maps libwayland-client when the Wayland ozone backend is actually live.)
function detectDisplayBackend() {
  const fs = require('fs');
  let maps = '';
  try {
    maps = fs.readFileSync('/proc/self/maps', 'utf8');
  } catch { return { wayland: false, x11: false, source: 'unavailable' }; }
  return {
    wayland: /libwayland-client\.so/.test(maps),
    x11: /libX11\.so/.test(maps) || /libX11-xcb\.so/.test(maps),
    source: '/proc/self/maps',
  };
}

async function runAutoProbes() {
  const display = screen.getPrimaryDisplay();
  console.log('');
  console.log('=== Buddy floater :: Wayland primitive probe ===');
  console.log(`Electron ${process.versions.electron} | Chromium ${process.versions.chrome}`);
  console.log(`session=${process.env.XDG_SESSION_TYPE} desktop=${process.env.XDG_CURRENT_DESKTOP}`);
  console.log(`primary display: bounds=${JSON.stringify(display.bounds)} workArea=${JSON.stringify(display.workArea)} scale=${display.scaleFactor}`);
  console.log('');
  console.log('ID    VERDICT      QUESTION                                             DETAIL');
  console.log('-'.repeat(120));

  const win = makeOverlayWindow();
  // Load real content: an unmapped/blank surface can report misleading geometry.
  win.loadFile(path.join(__dirname, 'blank.html'));
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  win.showInactive();
  await new Promise((r) => setTimeout(r, 900));

  // A0 gates everything below it.
  const backend = detectDisplayBackend();
  const nativeWayland = backend.wayland && !backend.x11;
  record(
    'A0',
    'Which display backend did Electron actually pick?',
    nativeWayland ? 'WAYLAND' : backend.x11 ? 'XWAYLAND' : 'UNKNOWN',
    `open sockets: wayland=${backend.wayland} x11=${backend.x11}` +
      (nativeWayland ? '  <-- native Wayland; A1 "WORKS" below would be an ECHO, not a real move' : '')
  );

  // A1 — the load-bearing failure. If setPosition works we are NOT on native
  // Wayland (Electron fell back to XWayland) and every other result is suspect.
  const before = win.getPosition();
  win.setPosition(317, 211);
  await new Promise((r) => setTimeout(r, 250));
  const after = win.getPosition();
  const moved = after[0] === 317 && after[1] === 211;
  record(
    'A1',
    'setPosition() actually moves the window?',
    moved ? 'WORKS' : 'NO-OP',
    `asked (317,211); before=${JSON.stringify(before)} after=${JSON.stringify(after)}${moved ? '  <-- XWayland fallback, not native Wayland!' : '  <-- confirms native Wayland'}`
  );

  // A2 — global cursor position. This is the fallback mechanism for
  // click-through hover tracking if setIgnoreMouseEvents(forward) is unavailable.
  const c1 = screen.getCursorScreenPoint();
  await new Promise((r) => setTimeout(r, 900));
  const c2 = screen.getCursorScreenPoint();
  const zero = c1.x === 0 && c1.y === 0 && c2.x === 0 && c2.y === 0;
  record(
    'A2',
    'screen.getCursorScreenPoint() returns real coords?',
    zero ? 'DEAD-0,0' : 'RETURNS',
    `sample1=${JSON.stringify(c1)} sample2=${JSON.stringify(c2)}${zero ? '  <-- unusable as a hover fallback' : '  (verify it TRACKS in --interactive)'}`
  );

  // A3 — can we get a surface that covers the whole work area without
  // positioning it? maximize() is compositor-driven, so it may succeed where
  // setPosition fails.
  win.setSize(400, 300);
  win.maximize();
  await new Promise((r) => setTimeout(r, 600));
  const maxB = win.getBounds();
  const wa = display.workArea;
  const coversWorkArea = maxB.width >= wa.width - 4 && maxB.height >= wa.height - 4;
  record(
    'A3',
    'maximize() covers the work area on a frameless window?',
    coversWorkArea ? 'COVERS' : 'PARTIAL',
    `bounds=${JSON.stringify(maxB)} vs workArea=${JSON.stringify(wa)}`
  );
  win.unmaximize();
  await new Promise((r) => setTimeout(r, 300));

  // A4 — real fullscreen. Covers the panel too, but on KWin may relocate the
  // window to its own virtual desktop, which would be wrong for a floater.
  win.setFullScreen(true);
  await new Promise((r) => setTimeout(r, 800));
  const fsB = win.getBounds();
  const isFs = win.isFullScreen();
  const coversScreen = fsB.width >= display.bounds.width - 4 && fsB.height >= display.bounds.height - 4;
  record(
    'A4',
    'setFullScreen() covers the whole screen incl. panel?',
    isFs && coversScreen ? 'COVERS' : 'PARTIAL',
    `isFullScreen=${isFs} bounds=${JSON.stringify(fsB)} vs screen=${JSON.stringify(display.bounds)}`
  );
  win.setFullScreen(false);
  await new Promise((r) => setTimeout(r, 400));

  // A5 — setShape is the ideal primitive: it would let one window declare
  // exactly which rectangles accept input, which is precisely the one-window
  // model's need, with no polling and no forward-events dependency.
  let shapeVerdict = 'MISSING';
  let shapeDetail = 'win.setShape is not a function on this build';
  if (typeof win.setShape === 'function') {
    try {
      win.setShape([{ x: 0, y: 0, width: 120, height: 120 }]);
      await new Promise((r) => setTimeout(r, 250));
      shapeVerdict = 'ACCEPTED';
      shapeDetail = 'call did not throw — whether it BINDS input needs the interactive test (I3)';
      win.setShape([]);
    } catch (err) {
      shapeVerdict = 'THREW';
      shapeDetail = String(err && err.message ? err.message : err);
    }
  }
  record('A5', 'setShape() available to bind an input region?', shapeVerdict, shapeDetail);

  // A6 — does the forward option even get accepted? Electron documents
  // options.forward as Windows/macOS only; confirm what Linux does with it.
  let fwdVerdict = 'ACCEPTED';
  let fwdDetail = 'no throw — whether it DELIVERS mousemove is the I2 interactive test';
  try {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setIgnoreMouseEvents(false);
  } catch (err) {
    fwdVerdict = 'THREW';
    fwdDetail = String(err && err.message ? err.message : err);
  }
  record('A6', 'setIgnoreMouseEvents(true,{forward:true}) accepted?', fwdVerdict, fwdDetail);

  // A7 — alwaysOnTop at screen-saver level, as the real buddy windows use.
  let aotVerdict = 'ACCEPTED';
  let aotDetail = '';
  try {
    win.setAlwaysOnTop(true, 'screen-saver');
    aotDetail = `isAlwaysOnTop=${win.isAlwaysOnTop()} — whether it STAYS above other windows is the I4 eyeball test`;
  } catch (err) {
    aotVerdict = 'THREW';
    aotDetail = String(err && err.message ? err.message : err);
  }
  record('A7', "setAlwaysOnTop(true,'screen-saver') accepted?", aotVerdict, aotDetail);

  console.log('-'.repeat(120));
  console.log('');
  console.log('Auto probes done. Interactive tests (I1-I5) need a human cursor:');
  console.log('  electron . --interactive');
  console.log('');

  // A8/A9 — can a screen-COVERING surface exist at all? This is the load-bearing
  // requirement of the one-window model. Two candidate routes, since maximize()
  // was refused (KWin reports maximizable=false for resizable:false windows):
  //   A8: construct the window already at exactly screen size. We can't position
  //       it, but a surface the size of the screen has nowhere to go but 0,0.
  //   A9: make it resizable so maximize() is permitted.
  if (process.argv.includes('--coverage')) {
    const b = display.bounds;

    const sized = makeOverlayWindow({ width: b.width, height: b.height });
    // Never let a screen-sized overlay eat the user's clicks while we measure it.
    sized.setIgnoreMouseEvents(true);
    sized.loadFile(path.join(__dirname, 'blank.html'));
    await new Promise((resolve) => sized.webContents.once('did-finish-load', resolve));
    sized.showInactive();
    sized.setAlwaysOnTop(true, 'screen-saver');
    await new Promise((r) => setTimeout(r, 800));
    record('A8', 'screen-sized window at construction covers screen?', 'SEE-KWIN',
      `asked ${b.width}x${b.height}; electron reports ${JSON.stringify(sized.getBounds())} (caption "probe-sized")`);
    sized.setTitle('probe-sized');

    const resizableWin = new BrowserWindow({
      width: 400, height: 300, transparent: true, frame: false,
      resizable: true, alwaysOnTop: true, hasShadow: false, skipTaskbar: true,
      backgroundColor: '#00000000', show: false, title: 'probe-resizable',
      webPreferences: { sandbox: true },
    });
    resizableWin.setIgnoreMouseEvents(true);
    resizableWin.loadFile(path.join(__dirname, 'blank.html'));
    await new Promise((resolve) => resizableWin.webContents.once('did-finish-load', resolve));
    resizableWin.showInactive();
    resizableWin.setAlwaysOnTop(true, 'screen-saver');
    await new Promise((r) => setTimeout(r, 500));
    resizableWin.maximize();
    await new Promise((r) => setTimeout(r, 800));
    resizableWin.setTitle('probe-resizable');
    record('A9', 'resizable window CAN be maximized by KWin?', 'SEE-KWIN',
      `electron reports ${JSON.stringify(resizableWin.getBounds())} (caption "probe-resizable")`);

    console.log('COVERAGE: two windows mapped — query the compositor now, 25s.');
    await new Promise((r) => setTimeout(r, 25000));
    sized.destroy();
    resizableWin.destroy();
  }

  // --hold keeps the (small, harmless) probe window mapped so the compositor can
  // be queried from outside for GROUND TRUTH geometry. Electron's own getBounds()
  // proved unreliable here, so we cross-check against KWin rather than trust it.
  if (process.argv.includes('--hold')) {
    const holdMs = 25000;
    win.setSize(400, 300);
    win.maximize();
    console.log(`HOLD: window mapped and maximize() requested. Electron reports ${JSON.stringify(win.getBounds())}.`);
    console.log(`HOLD: query the compositor now — ${holdMs / 1000}s.`);
    await new Promise((r) => setTimeout(r, holdMs));
  }

  win.destroy();
  app.quit();
}

// ---- interactive mode ----------------------------------------------------

let overlay = null;

function runInteractive() {
  const display = screen.getPrimaryDisplay();
  // Deliberately NOT screen-sized. A8 already proved full coverage is achievable;
  // re-proving it here would mean a transparent surface over the entire desktop
  // that captures every click while the test runs. 1000x700 exercises drag,
  // click-through and hover just as well and leaves the desktop usable.
  overlay = makeOverlayWindow({ width: 1000, height: 700 });

  overlay.loadFile(path.join(__dirname, 'index.html'));
  overlay.once('ready-to-show', () => {
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.showInactive();
    overlay.webContents.send('probe:init', {
      electron: process.versions.electron,
      sessionType: process.env.XDG_SESSION_TYPE,
      desktop: process.env.XDG_CURRENT_DESKTOP,
      workArea: display.workArea,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      hasSetShape: typeof overlay.setShape === 'function',
    });
  });

  // The renderer drives the ignore-state so we can test each strategy live.
  ipcMain.on('probe:set-ignore', (_e, { ignore, forward }) => {
    if (!overlay || overlay.isDestroyed()) return;
    if (ignore) overlay.setIgnoreMouseEvents(true, { forward: !!forward });
    else overlay.setIgnoreMouseEvents(false);
  });

  ipcMain.on('probe:set-shape', (_e, { rects }) => {
    if (!overlay || overlay.isDestroyed()) return;
    if (typeof overlay.setShape !== 'function') return;
    try {
      overlay.setShape(rects || []);
    } catch (err) {
      overlay.webContents.send('probe:error', String(err));
    }
  });

  // Main-process cursor polling — the fallback hover strategy if forward-events
  // don't deliver. The renderer asks for samples so we can see whether the
  // numbers actually TRACK the cursor rather than merely being non-zero.
  ipcMain.handle('probe:cursor', () => {
    const p = screen.getCursorScreenPoint();
    const w = overlay && !overlay.isDestroyed() ? overlay.getBounds() : null;
    return { cursor: p, windowBounds: w };
  });

  ipcMain.on('probe:quit', () => app.quit());

  // Escape hatch. NOTE: Chromium global shortcuts are themselves unreliable on
  // Wayland (no protocol for global grabs), so we report whether the grab took
  // rather than assuming it — the in-window quit button is the real way out.
  const grabbed = globalShortcut.register('Control+Alt+Q', () => app.quit());
  console.log(`escape hatch: Ctrl+Alt+Q registered=${grabbed}${grabbed ? '' : '  <-- use the in-window quit button'}`);

  // Hard backstop: the overlay tears itself down after 15 minutes no matter what.
  setTimeout(() => app.quit(), 15 * 60 * 1000);
}

// --smear: a transparent window containing a constantly-moving element and NO
// interactive surface. Input is ignored throughout, so it cannot disturb the
// desktop while it sits there being screenshotted. Objective repro for the
// transparent-window smear that Destin observed live on 2026-07-22.
function runSmear() {
  const labelArg = (process.argv.find((a) => a.startsWith('--label=')) || '--label=baseline').slice(8);
  const win = makeOverlayWindow({ width: 1000, height: 700 });
  win.setIgnoreMouseEvents(true);
  const damage = process.argv.includes('--force-damage') ? '&damage=1' : '';
  win.loadFile(path.join(__dirname, 'smear.html'), { search: `label=${encodeURIComponent(labelArg)}${damage}` });
  win.once('ready-to-show', () => {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
    console.log(`SMEAR: window up (label=${labelArg}) — screenshot now.`);
  });
  setTimeout(() => app.quit(), 22000);
}

// --sharp: is Electron under XWayland actually blurry on this machine?
// kwinrc has [Xwayland] Scale=1.5, meaning KWin does NOT upscale X11 clients —
// it hands them native resolution and expects them to scale themselves. An
// Electron run without --force-device-scale-factor therefore renders 1:1 and
// looks wrong, which is a very different failure from "XWayland is blurry".
// Opaque window: this measures rendering only, never transparency.
function runSharp() {
  const labelArg = (process.argv.find((a) => a.startsWith('--label=')) || '--label=baseline').slice(8);
  const win = new BrowserWindow({
    width: 1000, height: 700, frame: false, resizable: false, skipTaskbar: true,
    backgroundColor: '#ffffff', show: false, title: `sharp-${labelArg}`,
    webPreferences: { sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'sharp.html'), { search: `label=${encodeURIComponent(labelArg)}` });
  win.once('ready-to-show', async () => {
    win.showInactive();
    win.setTitle(`sharp-${labelArg}`);
    const info = await win.webContents.executeJavaScript(
      '({dpr: window.devicePixelRatio, css: [innerWidth, innerHeight], screen: [screen.width, screen.height]})'
    );
    console.log(`SHARP[${labelArg}] dPR=${info.dpr} css=${info.css.join('x')} screen=${info.screen.join('x')}`);
  });
  setTimeout(() => app.quit(), 20000);
}

app.whenReady().then(() => {
  if (process.argv.includes('--sharp')) runSharp();
  else if (process.argv.includes('--smear')) runSmear();
  else if (INTERACTIVE) runInteractive();
  else runAutoProbes();
});

app.on('window-all-closed', () => app.quit());
