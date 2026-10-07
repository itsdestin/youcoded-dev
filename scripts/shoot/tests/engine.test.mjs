// The engine's promises that a picture can't show: leftovers are swept without
// touching anything else, the pool size stays sane, and tabs never share a theme.
// Run: node --test scripts/shoot/tests/*.test.mjs
// The browser case skips itself when Chrome or the app's node_modules are absent (CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, openPool, poolSize, serve, setShotScale, sweepLeftovers } from '../engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = resolve(HERE, '..', '..', '..', 'youcoded');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('a crashed run\'s browsers are stopped, and a process that only shares the pid file is not', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'youcoded-shoot-test-'));
  // Stand-ins for a leftover Chrome: one names the profile on its command line, one does not.
  // (`; true` stops bash from exec-ing sleep, which would drop the profile from the command line.)
  const leftover = spawn('bash', ['-c', 'sleep 60; true', profile], { stdio: 'ignore' });
  const stranger = spawn('sleep', ['60'], { stdio: 'ignore' });
  // An owner that is certainly dead: a process that already exited.
  const gone = spawnSync('bash', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim();
  const pids = join(tmpdir(), 'youcoded-shoot', 'pids'); mkdirSync(pids, { recursive: true });
  const rec = join(pids, `test-${process.pid}.json`);
  writeFileSync(rec, JSON.stringify({ owner: Number(gone), browsers: [{ pid: leftover.pid, profile }, { pid: stranger.pid, profile: '/nonexistent-profile' }] }));
  try {
    // Our own child lingers as a zombie until reaped, so wait for its exit event
    // rather than probing the pid.
    const exited = new Promise((r) => { leftover.once('exit', (_code, signal) => r(signal)); setTimeout(() => r('still running'), 3000); });
    sweepLeftovers();
    assert.equal(await exited, 'SIGKILL', 'the leftover browser is stopped');
    assert.equal(alive(stranger.pid), true, 'a process whose command line does not name the profile is left alone');
    assert.equal(existsSync(rec), false, 'the record is removed');
    assert.equal(existsSync(profile), false, 'the leftover profile is removed');
  } finally { stranger.kill(); leftover.kill(); rmSync(rec, { force: true }); }
});

test('a record whose owner is still running is left alone', () => {
  const pids = join(tmpdir(), 'youcoded-shoot', 'pids'); mkdirSync(pids, { recursive: true });
  const rec = join(pids, `test-live-${process.pid}.json`);
  writeFileSync(rec, JSON.stringify({ owner: process.pid, browsers: [] }));
  try { sweepLeftovers(); assert.equal(existsSync(rec), true); } finally { rmSync(rec, { force: true }); }
});

test('the pool never has more tabs than jobs, or fewer than one browser', () => {
  assert.deepEqual(poolSize(1).tabs, 1);
  const big = poolSize(500);
  assert.ok(big.browsers >= 1 && big.browsers <= 8);
  assert.ok(big.tabs >= big.browsers && big.tabs <= big.browsers * 2);
});

const canBrowse = spawnSync('google-chrome-stable', ['--version']).status === 0 && existsSync(join(CHECKOUT, 'desktop', 'node_modules', 'vite'));
test('two tabs on the same address each keep their own theme', { skip: !canBrowse && 'needs Chrome and the app\'s node_modules' }, async () => {
  const dist = await ensureBuild(CHECKOUT);
  const server = await serve(dist);
  const pool = await openPool({ tabs: 2, browsers: 1 });
  try {
    const url = `http://127.0.0.1:${server.port}/index.html?mode=workbench&child=1&latency=0`;
    const [a, b] = pool.tabs;
    await a.prepare({ theme: 'dark', width: 800, height: 600 });
    await b.prepare({ theme: 'light', width: 800, height: 600 });
    // Load both at once: shared storage would let the second theme overwrite the first.
    await Promise.all([a.navigate(url), b.navigate(url)]);
    const themeOf = async (t) => {
      for (let i = 0; i < 200; i++) {
        const v = await t.evaluate("document.documentElement.getAttribute('data-theme')").catch(() => null);
        if (v) return v;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    };
    assert.equal(await themeOf(a), 'dark');
    assert.equal(await themeOf(b), 'light');
  } finally { pool.close(); server.close(); }
});

// WHY (project-switcher friction, proposal 8): at 1.5× a hover picture lit the row ABOVE the
// pointed one. Taking the picture made Chrome send a late, trusted `mouseover` at the hover's
// point divided by the scale (720,454 → 480,302), because the browser ran at a real density
// of 1 (`--force-device-scale-factor=1`) while the tab pretended 1.5 (emulation). It needs a
// hover that changes layout (the bin appearing; here a taller row). Every pointer
// event the page sees after a hover and a picture must be at the point the pointer was put.
const canChrome = spawnSync('google-chrome-stable', ['--version']).status === 0;
test('at 1.5× a picture never moves the pointer: no late event off the hovered point', { skip: !canChrome && 'needs Chrome' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'youcoded-shoot-ptr-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><style>body{margin:0}div{height:100px;border-bottom:1px solid #888}div:hover{background:#f0f}div:hover::after{content:'';display:block;height:20px}</style>
    ${Array.from({ length: 8 }, (_, i) => `<div id="r${i}">row ${i}</div>`).join('')}
    <script>window.log=[];for(const t of ['mouseover','mousemove'])addEventListener(t,e=>log.push([t,e.clientX,e.clientY]),true)</script>`);
  const server = await serve(dir);
  setShotScale(1.5);
  const pool = await openPool({ tabs: 1, browsers: 1, width: 800, height: 900 });
  try {
    const tab = pool.tabs[0];
    await tab.prepare({ theme: 'light', width: 800, height: 900 });
    await tab.navigate(`http://127.0.0.1:${server.port}/index.html`);
    for (let i = 0; i < 100 && !(await tab.evaluate('!!window.log').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 50));
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 450, pointerType: 'mouse' });
    await tab.png();
    await new Promise((r) => setTimeout(r, 400));
    const log = await tab.evaluate('log');
    const off = log.filter(([, x, y]) => x !== 600 || y !== 450);
    assert.deepEqual(off, [], `pointer events away from (600, 450): ${JSON.stringify(off)}`);
    assert.equal(await tab.evaluate("document.querySelector('div:hover')?.id"), 'r4', 'the hovered row is the one under the pointer');
  } finally { setShotScale(1); pool.close(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

// WHY (2026-10-07, shoot --check under verify's load): a screen opened a real window
// (window.open → github.com/login). It became the front tab of our tab's window, so our page went
// `hidden`; a hidden page runs no requestAnimationFrame, and every later screen on that tab hung
// for 20 s in the app's open step (measured: 0 frames in 20 s, timers still ticking, visibility
// hidden, the GitHub page listed among the browser's targets). The engine closes any page a tab opens.
test('a page a tab opens is closed, and the tab stays visible with frames running', { skip: !canChrome && 'needs Chrome' }, async () => {
  const pool = await openPool({ tabs: 1, browsers: 1, width: 800, height: 600 });
  try {
    const tab = pool.tabs[0];
    await tab.prepare({ theme: 'light', width: 800, height: 600 });
    await tab.navigate('data:text/html,<p>main');
    for (let i = 0; i < 100 && !(await tab.evaluate('document.readyState === "complete"').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 50));
    // userGesture: the app opens these from a click (a screen's open step), which the popup blocker allows.
    await tab.send('Runtime.evaluate', { expression: "window.open('about:blank#popup', '_blank'); 0", userGesture: true });
    await new Promise((r) => setTimeout(r, 300));
    let pages = [];
    for (let i = 0; i < 40; i++) {
      pages = (await tab.send('Target.getTargets', {})).targetInfos.filter((t) => t.type === 'page' && t.url.includes('#popup'));
      if (!pages.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.deepEqual(pages.map((t) => t.url), [], 'the opened page is closed');
    const frames = await tab.evaluate('new Promise((r) => { let f = 0; const go = () => { f++; requestAnimationFrame(go); }; requestAnimationFrame(go); setTimeout(() => r(document.visibilityState + ":" + (f > 2)), 500); })', 5000);
    assert.equal(frames, 'visible:true');
  } finally { pool.close(); }
});
