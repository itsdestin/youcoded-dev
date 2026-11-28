import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { allocateTurns, assertSafeTargetHome, calibrate, generateHistory, measureTree, pickLaneSessions, planHistory, writeFixtureSettings } from '../history-gen.mjs';

const SMALL = { projects: 6, sessions: 30, targetMB: 3 };

const hashTree = (dir) => {
  const h = createHash('sha256');
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { h.update(relative(dir, p)).update('\0').update(readFileSync(p)).update('\0'); } } };
  walk(dir);
  return h.digest('hex');
};
const tmp = () => mkdtempSync(join(tmpdir(), 'hg-test-'));

test('the same options and seed give byte-identical history, a different seed does not', () => {
  const base = tmp();
  try {
    const home = join(base, 'home');
    const gen = (seed) => { rmSync(home, { recursive: true, force: true }); generateHistory(home, { ...SMALL, seed }); return hashTree(home); };
    const a1 = gen('s1'), a2 = gen('s1'), b = gen('s2');
    assert.equal(a1, a2);
    assert.notEqual(a1, b); // the hash is sensitive to content, so the equality above means something
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('sizes: file count, project count and total bytes land on the request', () => {
  const base = tmp();
  try {
    const home = join(base, 'home');
    const m = generateHistory(home, SMALL);
    assert.equal(m.totals.files, 30);
    assert.equal(m.totals.ccFiles + m.totals.nativeFiles, 30);
    assert.ok(m.totals.nativeFiles > 0 && m.totals.ccFiles > m.totals.nativeFiles);
    const onDisk = measureTree(join(home, '.claude', 'projects')).files + measureTree(join(home, '.youcoded', 'sessions')).files;
    assert.equal(onDisk, 30);
    assert.equal(readdirSync(join(home, 'projects')).length, 6);
    // every project folder has at least one Claude Code transcript directory
    assert.equal(readdirSync(join(home, '.claude', 'projects')).length, 6);
    const target = SMALL.targetMB * 1048576;
    assert.ok(m.totals.bytes > target * 0.75 && m.totals.bytes < target * 1.25, `bytes ${m.totals.bytes} vs target ${target}`);
    // log-normal spread: the biggest file is many times the median, not a flat distribution
    const sizes = m.files.filter((f) => f.kind === 'cc').map((f) => f.bytes).sort((a, b) => a - b);
    assert.ok(sizes.at(-1) > sizes[sizes.length >> 1] * 3);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('transcripts are in the shapes the app parses (user prompt id, end_turn assistant, native header)', () => {
  const base = tmp();
  try {
    const home = join(base, 'home');
    const m = generateHistory(home, { projects: 2, sessions: 8, targetMB: 0.5 });
    const cc = m.files.find((f) => f.kind === 'cc');
    const lines = readFileSync(cc.path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.type === 'user' && l.promptId && l.message?.content));
    assert.ok(lines.some((l) => l.type === 'assistant' && l.message?.stop_reason === 'end_turn'));
    assert.ok(lines.some((l) => l.type === 'assistant' && l.message?.stop_reason === 'tool_use'));
    const nat = m.files.find((f) => f.kind === 'native');
    const head = JSON.parse(readFileSync(nat.path, 'utf8').split('\n')[0]);
    assert.equal(head.sessionId, nat.id);
    assert.equal(head.cwd, nat.cwd);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('allocateTurns respects the minimum and maximum and spends the budget', () => {
  const t = allocateTurns([1, 1, 1, 100], 1000, 400);
  assert.ok(t.every((x) => x >= 1 && x <= 400));
  assert.equal(t[3], 400);
  assert.ok(Math.abs(t.reduce((a, b) => a + b, 0) - 1000) <= 5);
});

test('planHistory refuses a plan with fewer sessions than projects and without calibration', () => {
  assert.throws(() => planHistory({ projects: 10, sessions: 5 }, { cc: 1, native: 1 }), /one session per project/);
  assert.throws(() => planHistory(SMALL, undefined), /bytesPerTurn/);
  const p = planHistory(SMALL, calibrate(SMALL));
  assert.equal(p.files.length, 30);
});

test('refuses to write into the real home or the real app and Claude folders', () => {
  const real = '/home/someone';
  assert.throws(() => assertSafeTargetHome('/home/someone', real), /real home/);
  assert.throws(() => assertSafeTargetHome('/home', real), /contains it/);
  assert.throws(() => assertSafeTargetHome('/home/someone/.claude/x', real), /\.claude/);
  assert.throws(() => assertSafeTargetHome('/home/someone/.youcoded', real), /\.youcoded/);
  assert.throws(() => assertSafeTargetHome('/home/someone/.config/youcoded/p', real), /youcoded/);
  assert.equal(assertSafeTargetHome('/home/someone/perf-lab-runs/r/leg/home', real), '/home/someone/perf-lab-runs/r/leg/home');
});

test('lane sessions: the right count, mid-sized, spread over projects, same every time', () => {
  const base = tmp();
  try {
    const m = generateHistory(join(base, 'home'), { projects: 8, sessions: 60, targetMB: 12 });
    const opts = { minBytes: 20_000, maxBytes: 4_000_000 };
    const a = pickLaneSessions(m, 6, opts), b = pickLaneSessions(m, 6, opts);
    assert.deepEqual(a.map((f) => f.id), b.map((f) => f.id));
    assert.equal(new Set(a.map((f) => f.id)).size, 6);
    assert.ok(a.every((f) => f.kind === 'cc' && f.bytes >= 20_000 && f.bytes <= 4_000_000));
    assert.ok(new Set(a.map((f) => f.project)).size >= 4);
    assert.throws(() => pickLaneSessions(m, 500, opts), /need 500/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('fixture settings turn off sync, remote access and automatic update install, and keep setup finished', () => {
  const base = tmp();
  try {
    const home = join(base, 'home');
    const r = writeFixtureSettings(home);
    assert.equal(r.env.YOUCODED_NO_ANALYTICS, '1');
    const read = (p) => JSON.parse(readFileSync(join(home, p), 'utf8'));
    assert.equal(read('.claude/toolkit-state/config.json').setup_completed, true);
    assert.equal(read('.claude/youcoded-remote.json').enabled, false);
    assert.equal(read('.youcoded/config.json').updates.autoInstall, false);
    // an existing config (engine section) is merged, not replaced
    const again = writeFixtureSettings(home);
    assert.ok(again.settings);
    assert.equal(read('.youcoded/config.json').updates.autoInstall, false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
