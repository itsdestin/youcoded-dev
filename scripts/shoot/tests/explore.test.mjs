// explore's promises: it attaches only to a dev window run-dev.sh started; what it reads off
// the page (controls, layers, "is it still there") matches what a person sees; and a real
// session clicks, undoes and stops.
// Run: node --test scripts/shoot/tests/*.test.mjs
// Browser cases skip themselves when Chrome (or the app's node_modules) is absent (CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDevWindow, openBrowser } from '../engine.mjs';
import { hits, inPage, listControls, listLayers } from '../explore-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPLORE = resolve(HERE, '..', 'explore.mjs');
const CHECKOUT = resolve(HERE, '..', '..', '..', 'youcoded');
const hasChrome = spawnSync('google-chrome-stable', ['--version']).status === 0;

// ─── The dev-window marker ───────────────────────────────────────────────────
function fakeCheckout(markers) {
  const dir = mkdtempSync(join(tmpdir(), 'explore-marker-'));
  mkdirSync(join(dir, 'desktop', '.dev-instances'), { recursive: true });
  markers.forEach((m, i) => writeFileSync(join(dir, 'desktop', '.dev-instances', `${i}.json`), JSON.stringify(m)));
  return dir;
}

test('no marker, no attaching', () => {
  const dir = fakeCheckout([]);
  try { assert.throws(() => findDevWindow(dir), /no dev window is running/); } finally { rmSync(dir, { recursive: true }); }
});

test('a marker naming a finished process is ignored', () => {
  const gone = Number(spawnSync('bash', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim());
  const dir = fakeCheckout([{ pid: gone, devtoolsPort: 9272, vitePort: 5223 }]);
  try { assert.throws(() => findDevWindow(dir), /no dev window/); } finally { rmSync(dir, { recursive: true }); }
});

test('a marker naming a live process that is not run-dev.sh is ignored', { skip: !existsSync('/proc/self/cmdline') && 'needs /proc' }, () => {
  // This test runner is alive but is not run-dev.sh — as a reused pid would be.
  const dir = fakeCheckout([{ pid: process.pid, devtoolsPort: 9272, vitePort: 5223 }]);
  try { assert.throws(() => findDevWindow(dir), /no dev window/); } finally { rmSync(dir, { recursive: true }); }
});

test('a marker naming a live run-dev.sh is used', { skip: !existsSync('/proc/self/cmdline') && 'needs /proc' }, async () => {
  const fake = join(mkdtempSync(join(tmpdir(), 'explore-rundev-')), 'run-dev.sh');
  writeFileSync(fake, 'sleep 30\n');
  const p = spawn('bash', [fake], { stdio: 'ignore' });
  const dir = fakeCheckout([{ pid: p.pid, devtoolsPort: 9272, vitePort: 5223 }]);
  try { await new Promise((r) => setTimeout(r, 100)); assert.equal(findDevWindow(dir).devtoolsPort, 9272); }
  finally { p.kill(); rmSync(dir, { recursive: true }); rmSync(dirname(fake), { recursive: true }); }
});

// ─── Reading the page ────────────────────────────────────────────────────────
const PAGE = `<!doctype html><body style="margin:0;font:14px sans-serif">
  <button id=a>Open</button> <button aria-label="Settings" id=b>⚙</button>
  <div id=row style="cursor:pointer;width:200px;height:30px">A clickable row <span>inner</span></div>
  <input placeholder="Search" id=c>
  <button style="position:absolute;top:2000px">Far below</button>
  <div role=dialog aria-label="Rename" style="position:fixed;inset:100px;z-index:60;background:#fff">
    <button id=d>Save</button> <button id=e disabled>Cancel</button>
  </div>
  <div role=menu style="position:fixed;top:120px;left:300px;z-index:70;background:#eee;width:120px">
    <div role=menuitem>First item</div><div role=menuitem>Second item</div>
  </div></body>`;

test('controls: labels, roles, what is covered, and the top layer first', { skip: !hasChrome && 'needs Chrome' }, async () => {
  const b = await openBrowser({ width: 800, height: 600 });
  try {
    const tab = await b.newTab();
    await tab.prepare({ theme: 'light', width: 800, height: 600 });
    await tab.navigate(`data:text/html,${encodeURIComponent(PAGE)}`);
    await new Promise((r) => setTimeout(r, 300));
    const { layers } = await tab.evaluate(inPage(listLayers));
    assert.deepEqual(layers.map((l) => `${l.kind} ${l.name}`), ['menu First item / Second item', 'dialog Rename']);
    const { controls, covered, offscreen } = await tab.evaluate(inPage(listControls, {}));
    const names = controls.map((c) => `${c.role}:${c.label}`);
    // The menu's items first, then the dialog's; the dialog hides everything under it.
    assert.deepEqual(names.slice(0, 2), ['menuitem:First item', 'menuitem:Second item']);
    assert.ok(names.includes('button:Save'));
    assert.ok(controls.find((c) => c.label === 'Cancel').state.includes('disabled'));
    // Open, Settings, the row and Search sit at the top, clear of the dialog (inset 100px).
    assert.ok(names.includes('button:Open') && names.includes('button:Settings') && names.includes('textbox:Search'));
    assert.ok(names.includes('clickable:A clickable row inner'), 'a pointer-cursor row counts, its child does not');
    assert.equal(names.filter((n) => n.includes('inner') && !n.includes('row')).length, 0);
    assert.equal(offscreen, 1, '"Far below" is counted, not listed');
    assert.equal(covered, 0);
    // Something under the dialog is not reachable.
    await tab.evaluate(`document.getElementById('a').style.cssText = 'position:absolute;top:300px;left:300px'`);
    const again = await tab.evaluate(inPage(listControls, {}));
    assert.ok(!again.controls.some((c) => c.label === 'Open') && again.covered === 1, 'a control under the dialog is left out and counted');
    // hits(): the point really lands on the control.
    const save = again.controls.find((c) => c.label === 'Save');
    assert.equal(await tab.evaluate(inPage(hits, save.n, save.x, save.y)), true);
    assert.equal(await tab.evaluate(inPage(hits, save.n, 5, 590)), false);
  } finally { b.close(); }
});

// ─── A real session ─────────────────────────────────────────────────────────
const canRun = hasChrome && existsSync(join(CHECKOUT, 'desktop', 'node_modules', 'vite'));
const run = (...a) => spawnSync(process.execPath, [EXPLORE, ...a], { encoding: 'utf8', timeout: 180_000 });

test('start, click, back, stop on the practice app', { skip: !canRun && 'needs Chrome and the app\'s node_modules' }, () => {
  try {
    const first = run('start');
    assert.equal(first.status, 0, first.stderr);
    const n = first.stdout.match(/^\s+(\d+)\s+button "Settings"/m)?.[1];
    assert.ok(n, 'the Settings button is listed');
    const click = run('click', n);
    assert.equal(click.status, 0, click.stdout + click.stderr);
    assert.match(click.stdout, /^layers: .*"Settings".* › over the app/m);
    const back = run('back');
    assert.match(back.stdout, /^layers: the app/m, 'back returns to the app with Settings closed');
    assert.equal(run('click', '999').status, 1, 'a number not on the list fails');
  } finally {
    assert.match(run('stop').stdout, /stopped/);
  }
});
