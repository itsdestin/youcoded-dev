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
import { ensureBuild, openPool, poolSize, serve, sweepLeftovers } from '../engine.mjs';

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
