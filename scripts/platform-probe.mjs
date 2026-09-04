#!/usr/bin/env node
// Measure what the WINDOWING SYSTEM will actually tell this app, on this machine.
//
//   node scripts/platform-probe.mjs [--json] [--keep-open <seconds>]
//
// Answers, with numbers rather than assumptions:
//   - can the app read the cursor's position on screen?
//   - can it read where its own windows are?
//   - can it MOVE a window, and does the answer it gets back tell the truth?
//   - what does the renderer see (window.screenX / screenY, devicePixelRatio)?
//
// WHY THIS EXISTS: these four questions have now been answered by throwaway
// scripts three times — 2026-07-22 (buddy floater, scale-probe.js, archived),
// 2026-07-23 (buddy overlay presentation), 2026-09-03 (session detach). Each
// time the conclusion was written into a document, and each time the next
// subsystem to need it was built against the opposite assumption anyway,
// because a paragraph in an archived investigation reaches nobody. On
// Linux/Wayland every one of these returns zero, and `setPosition` is a no-op
// that STILL REPORTS SUCCESS — which is why guessing is worse than useless
// here: the app is actively told the move worked.
//
// ui-probe.mjs cannot answer any of this. It drives a PAGE; these are questions
// about the main process and the compositor.
//
// Runs its own throwaway Electron. Never touches the built app.
//
// It BRIEFLY OPENS TWO SMALL WINDOWS, and has to: a window the compositor has
// never mapped reports whatever position you asked for, so a hidden probe
// measures Electron's own bookkeeping rather than the windowing system, and
// answers the opposite of the truth. Warn Destin before running it.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const ELECTRON = path.join(WORKSPACE, 'youcoded/desktop/node_modules/.bin/electron');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const keepIdx = args.indexOf('--keep-open');
const keepOpenMs = keepIdx !== -1 ? Number(args[keepIdx + 1] ?? 0) * 1000 : 0;

// The probe body runs INSIDE Electron's main process, so it is written to a
// temp file rather than imported — this file runs under plain node.
const MAIN = `
const { app, BrowserWindow, screen } = require('electron');
app.whenReady().then(async () => {
  const out = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    sessionType: process.env.XDG_SESSION_TYPE || null,
    waylandDisplay: !!process.env.WAYLAND_DISPLAY,
  };
  // Two windows at DIFFERENT requested positions: one window cannot show
  // whether positions are being honoured or quietly collapsed to the origin.
  //
  // show: true is NOT optional, and this probe measured its own wrong answer
  // before it was (2026-09-03). An unmapped window's bounds are just numbers
  // Electron is holding for you — the compositor has never seen the window, so
  // getBounds() echoes whatever you asked for and setPosition() "succeeds".
  // Hidden, this probe reported that positioning works on Wayland; shown, the
  // same code reports (0,0). The windows are small and close in a second.
  const mk = (x, y) => new BrowserWindow({
    x, y, width: 240, height: 160, show: true,
    webPreferences: { contextIsolation: true },
  });
  const a = mk(80, 80);
  const b = mk(700, 420);
  await Promise.all([
    a.loadURL('data:text/html,<title>probe A</title>A'),
    b.loadURL('data:text/html,<title>probe B</title>B'),
  ]);
  await new Promise((r) => setTimeout(r, 800));

  out.windows = [];
  for (const [name, w, req] of [['A', a, { x: 80, y: 80 }], ['B', b, { x: 700, y: 420 }]]) {
    const bounds = w.getBounds();
    const renderer = await w.webContents.executeJavaScript(
      '({ screenX: window.screenX, screenY: window.screenY, dpr: window.devicePixelRatio })'
    );
    out.windows.push({
      name, requested: req, reported: { x: bounds.x, y: bounds.y }, renderer,
      honoured: bounds.x === req.x && bounds.y === req.y,
    });
  }

  // setPosition, measured twice: immediately (some backends echo the request
  // straight back) and after a beat (what the compositor actually settled on).
  //
  // getBounds() is NOT the witness here, and using it alone is how this probe
  // first reported that moving works on Wayland: Electron echoes back the
  // position you asked for whether or not the compositor honoured it. The
  // renderer's window.screenX is read from the actual widget, so a
  // disagreement between the two IS the failure — the app being told a move
  // succeeded that never happened.
  const target = { x: 1200, y: 300 };
  b.setPosition(target.x, target.y);
  await new Promise((r) => setTimeout(r, 600));
  const settled = b.getBounds();
  const seen = await b.webContents.executeJavaScript(
    '({ screenX: window.screenX, screenY: window.screenY })'
  );
  out.setPosition = {
    asked: target,
    mainReports: { x: settled.x, y: settled.y },
    rendererSees: { x: seen.screenX, y: seen.screenY },
    // DELIBERATELY NOT a boolean. Measured 2026-09-03: after an explicit
    // setPosition BOTH witnesses echo the requested value on Wayland — the same
    // window that reported (0,0) at construction reports (1200,300) here,
    // without having moved. The app cannot witness its own move from inside;
    // only the placement rows above are decisive, and if the compositor ignores
    // where a window is BORN it ignores where it is moved to. Anything stronger
    // than this needs a human looking at the screen.
    selfReportedOnly: true,
  };

  // Sampled, not read once: on a backend that tracks the pointer this changes
  // between samples; on one that does not it is pinned at the same value.
  out.cursorSamples = [];
  for (let i = 0; i < 4; i++) {
    out.cursorSamples.push(screen.getCursorScreenPoint());
    await new Promise((r) => setTimeout(r, 250));
  }
  out.cursorMoves = new Set(out.cursorSamples.map((p) => p.x + ',' + p.y)).size > 1;
  out.displays = screen.getAllDisplays().map((d) => ({ bounds: d.bounds, scale: d.scaleFactor }));

  console.log('__PROBE__' + JSON.stringify(out));
  if (${keepOpenMs} > 0) await new Promise((r) => setTimeout(r, ${keepOpenMs}));
  app.quit();
});
app.on('window-all-closed', () => app.quit());
`;

const dir = mkdtempSync(path.join(tmpdir(), 'platform-probe-'));
const mainPath = path.join(dir, 'main.js');
writeFileSync(mainPath, MAIN);

const child = spawn(ELECTRON, [mainPath], { stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
child.stdout.on('data', (d) => { stdout += d; });
child.stderr.on('data', () => { /* Electron chatters on stderr; not our signal */ });

child.on('error', (err) => {
  console.error(`could not launch Electron at ${ELECTRON}\n${err.message}`);
  console.error('Run `npm ci` in youcoded/desktop first.');
  rmSync(dir, { recursive: true, force: true });
  process.exit(2);
});

child.on('close', () => {
  rmSync(dir, { recursive: true, force: true });
  const line = stdout.split('\n').find((l) => l.startsWith('__PROBE__'));
  if (!line) {
    console.error('probe produced no result — Electron may have failed to start.');
    process.exit(2);
  }
  const r = JSON.parse(line.slice('__PROBE__'.length));
  if (asJson) { console.log(JSON.stringify(r, null, 2)); return; }

  const yes = (b) => (b ? 'YES' : 'NO');
  console.log(`Electron ${r.electron} · Chrome ${r.chrome} · ${r.platform}`
    + ` · XDG_SESSION_TYPE=${r.sessionType ?? '(unset)'} · WAYLAND_DISPLAY=${yes(r.waylandDisplay)}`);
  console.log('');
  console.log('Can the app place its own windows?');
  for (const w of r.windows) {
    console.log(`  ${w.name}  asked (${w.requested.x},${w.requested.y})`
      + `  got (${w.reported.x},${w.reported.y})`
      + `  renderer screenX/Y (${w.renderer.screenX},${w.renderer.screenY})`
      + `  -> ${yes(w.honoured)}`);
  }
  console.log('');
  const placed = r.windows.every((w) => w.honoured);
  console.log('Can the app MOVE a window?');
  console.log(`  asked (${r.setPosition.asked.x},${r.setPosition.asked.y})`
    + `  main reports (${r.setPosition.mainReports.x},${r.setPosition.mainReports.y})`
    + `  renderer reports (${r.setPosition.rendererSees.x},${r.setPosition.rendererSees.y})`
    + `  -> ${placed ? 'YES' : 'NO (inferred)'}`);
  console.log('  Both numbers above are SELF-REPORTED and cannot be trusted alone: after an');
  console.log('  explicit setPosition they echo the request whether or not anything moved.');
  if (!placed) {
    console.log('  Inferred NO from the placement rows: a compositor that ignores where a');
    console.log('  window is born ignores where it is moved to. setPosition here is a no-op');
    console.log('  that reports success — the worst shape, and the one that hid this for months.');
  }
  console.log('');
  console.log('Can the app read the cursor on screen?');
  console.log(`  samples: ${r.cursorSamples.map((p) => `(${p.x},${p.y})`).join(' ')}  -> ${yes(r.cursorMoves)}`);
  if (!r.cursorMoves) {
    console.log('  (move the mouse while this runs — a pinned value with the mouse');
    console.log('   moving means the backend does not report it at all)');
  }
  console.log('');
  const blind = !r.cursorMoves || r.windows.some((w) => !w.honoured);
  console.log(blind
    ? 'VERDICT: screen coordinates are NOT usable here. Anything that hit-tests the\n'
      + '         cursor against another window, or positions a window, will silently\n'
      + '         do nothing. See .claude/rules/multi-window-detach.md.'
    : 'VERDICT: screen coordinates are usable on this backend.');
});
