// Tests for scripts/work-items-program.mjs and install-work-board.mjs. Run: node --test scripts/work-items-program.test.mjs
// Changes are made in throwaway repos in the temp folder; nothing real is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handle } from './work-items-program.mjs';
import { installWorkBoard } from './install-work-board.mjs';
import { createCard, loadCards } from './cards.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A workspace whose master already carries two items, pushed to a throwaway remote. */
function rig() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'work-items-'));
  const remote = path.join(base, 'remote.git'), ws = path.join(base, 'ws');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', remote]);
  execFileSync('git', ['init', '-q', '-b', 'master', ws]);
  git(ws, 'config', 'user.email', 't@t'); git(ws, 'config', 'user.name', 't'); git(ws, 'config', 'core.hooksPath', '/dev/null');
  createCard(ws, { title: 'First', stage: 'planning' }, '2026-10-16'); createCard(ws, { title: 'Second' }, '2026-10-16');
  git(ws, 'add', '-A'); git(ws, 'commit', '-q', '-m', 'start');
  git(ws, 'remote', 'add', 'origin', remote); git(ws, 'push', '-q', 'origin', 'master'); git(ws, 'fetch', '-q', 'origin');
  return { ws, remote };
}
const onRemote = (remote) => { const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wi-check-')), 'c'); execFileSync('git', ['clone', '-q', remote, d]); return loadCards(d); };

test('a move from the page lands on master', () => {
  const { ws, remote } = rig();
  const r = handle(ws, { op: 'stage', ids: [2], stage: 'planning' });
  assert.equal(r.ok, true); assert.match(r.message, /Moved 1 to Planning\. Saved to master\./);
  assert.equal(onRemote(remote)[1].stage, 'planning');
});

test('pause and unpause from the page', () => {
  const { ws, remote } = rig();
  handle(ws, { op: 'pause', id: 1, reason: 'waiting on a release' });
  assert.equal(onRemote(remote)[0].paused, 'waiting on a release');
  handle(ws, { op: 'pause', id: 1, reason: '' });
  assert.equal(onRemote(remote)[0].paused, undefined);
});

test('pictures come only from the page\'s own picture folders', () => {
  const { ws } = rig();
  const r = handle(ws, { op: 'pictures', names: ['../../../../../etc/passwd', 'thumbs/../build.py', 'thumbs/no-such.jpg'] });
  assert.deepEqual(r.pictures, {});
});

test('an unknown request is an error, not a guess', () => {
  assert.throws(() => handle(process.cwd(), { op: 'format-disk' }), /does not know/);
});

test('install writes the program with this workspace\'s path, and never guesses the folder', () => {
  assert.throws(() => installWorkBoard(undefined), /--pages/);
  const pages = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-'));
  const dir = installWorkBoard(pages, '/some/workspace');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['page.html', 'page.json', 'work-items.mjs']);
  assert.match(fs.readFileSync(path.join(dir, 'work-items.mjs'), 'utf8'), /file:\/\/\/some\/workspace\/scripts\/work-items-program\.mjs/);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'page.json'), 'utf8'));
  assert.deepEqual(manifest.connections.map((c) => c.kind), ['chats', 'program', 'session']);
});
