// .claude/hooks/cards-edit-check.test.mjs
// The hook must be SILENT for every write that is not a card — a hook that speaks on
// unrelated edits gets ignored within a week. Run: node --test .claude/hooks/cards-edit-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, 'cards-edit-check.mjs');

function cardsRoot(cards = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-hook-'));
  fs.mkdirSync(path.join(root, 'cards'));
  for (const [name, text] of Object.entries(cards)) fs.writeFileSync(path.join(root, 'cards', name), text);
  return root;
}

function runHook(root, toolInput, tool_name = 'Edit') {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input: toolInput }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

const GOOD = '---\nid: 1\ntitle: Saved agent setups\nstage: planning\n---\nProgress\n';

test('silent on a write outside cards/', () => {
  const root = cardsRoot({ '1-bad.md': '---\nid: 1\ntitle: x\nstage: ready\n---\n' });
  const r = runHook(root, { file_path: '/somewhere/else/App.tsx', content: 'x' }, 'Write');
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('silent on malformed or empty stdin', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cardsRoot() } });
  assert.equal(r.status, 0);
});

test('silent on a clean card edit', () => {
  const root = cardsRoot({ '1-saved-agent-setups.md': GOOD });
  const r = runHook(root, { file_path: path.join(root, 'cards', '1-saved-agent-setups.md') });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('exit 2 with the errors on stderr for a card with an unknown stage', () => {
  const root = cardsRoot({ '1-x.md': '---\nid: 1\ntitle: x\nstage: ready\n---\n' });
  const r = runHook(root, { file_path: 'cards/1-x.md' });   // relative path, as Edit sometimes passes
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cards\/1-x\.md: stage "ready"/);
  assert.match(r.stderr, /explore, planning, build, polish, merged/);
});

test('exit 2 when a card needs a card that does not exist', () => {
  const root = cardsRoot({ '1-x.md': '---\nid: 1\ntitle: x\nstage: build\nneeds: 9\n---\n' });
  const r = runHook(root, { file_path: path.join(root, 'cards', '1-x.md') }, 'Write');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /needs 9, but no card has that id/);
});
