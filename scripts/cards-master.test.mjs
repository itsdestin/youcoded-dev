// Tests for scripts/cards-master.mjs. Run: node --test scripts/cards-master.test.mjs
// Every test builds its own throwaway remote and workspace in the temp folder; nothing real is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { onMaster, masterHasCards, MASTER_COPY } from './cards-master.mjs';
import { createCard, setStage, loadCards } from './cards.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function rig({ withCards = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-master-'));
  const remote = path.join(base, 'remote.git');
  const ws = path.join(base, 'ws');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', remote]);
  execFileSync('git', ['init', '-q', '-b', 'master', ws]);
  git(ws, 'config', 'user.email', 't@t'); git(ws, 'config', 'user.name', 't');
  git(ws, 'config', 'core.hooksPath', '/dev/null');
  fs.writeFileSync(path.join(ws, 'README.md'), 'x\n');
  if (withCards) createCard(ws, { title: 'First item', stage: 'planning' }, '2026-10-16');
  git(ws, 'add', '-A'); git(ws, 'commit', '-q', '-m', 'start');
  git(ws, 'remote', 'add', 'origin', remote); git(ws, 'push', '-q', 'origin', 'master');
  git(ws, 'fetch', '-q', 'origin');
  return { base, remote, ws };
}

function remoteCards(remote) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cards-check-')), 'c');
  execFileSync('git', ['clone', '-q', remote, out]);
  return loadCards(out);
}

test('an item change lands on master at once, from the dedicated copy', () => {
  const { ws, remote } = rig();
  const r = onMaster(ws, 'cards: new item', (dir) => createCard(dir, { title: 'Second item' }, '2026-10-16'));
  assert.equal(r.pushed, true);
  assert.ok(fs.existsSync(path.join(ws, MASTER_COPY, '.git')));
  assert.deepEqual(remoteCards(remote).map((c) => c.title), ['First item', 'Second item']);
  assert.ok(git(remote, 'log', '-1', '--format=%B').endsWith('Submitted via YouCoded Assistant'));
});

test('a change that breaks a rule reaches nothing', () => {
  const { ws, remote } = rig();
  assert.throws(() => onMaster(ws, 'bad', (dir) => createCard(dir, { title: 'Overlaps', stage: 'planning', related: '1' }, '2026-10-16')), /consolidate|overlap/);
  assert.deepEqual(remoteCards(remote).map((c) => c.title), ['First item']);
});

test('losing a race to another chat retries from the new master, keeping both changes', () => {
  const { ws, remote, base } = rig();
  // Another computer saves first, after our copy last looked.
  const other = path.join(base, 'other');
  execFileSync('git', ['clone', '-q', remote, other]);
  git(other, 'config', 'user.email', 'o@o'); git(other, 'config', 'user.name', 'o');
  let raced = false;
  const r = onMaster(ws, 'cards: move', (dir) => {
    if (!raced) {
      raced = true;
      createCard(other, { title: 'From the other chat' }, '2026-10-16');
      git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'other'); git(other, 'push', '-q', 'origin', 'master');
    }
    return setStage(dir, [1], 'build');
  });
  assert.equal(r.pushed, true);
  const cards = remoteCards(remote);
  assert.deepEqual(cards.map((c) => c.title), ['First item', 'From the other chat']);
  assert.equal(cards[0].stage, 'build');
});

test('before the items are on master, nothing is sent there', () => {
  const { ws } = rig({ withCards: false });
  assert.equal(masterHasCards(ws), false);
  assert.equal(masterHasCards(rig().ws), true);
});
