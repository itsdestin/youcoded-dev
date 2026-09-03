// .claude/hooks/roadmap-edit-check.test.mjs
// The hook must be SILENT for every write that is not a roadmap file — a hook that
// speaks on unrelated edits gets ignored within a week. Run: node --test .claude/hooks/roadmap-edit-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, 'roadmap-edit-check.mjs');
const FIXTURE = path.join(HERE, '..', '..', 'scripts', 'fixtures', 'roadmap');

function fixtureRoot(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-hook-'));
  fs.cpSync(FIXTURE, root, { recursive: true });
  mutate(root);
  return root;
}

function runHook(root, toolInput, tool_name = 'Edit') {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input: toolInput }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

test('silent on a write outside the roadmap', () => {
  const r = runHook(fixtureRoot(), { file_path: '/somewhere/else/App.tsx', content: 'x' }, 'Write');
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('silent on malformed or empty stdin', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: fixtureRoot() } });
  assert.equal(r.status, 0);
});

test('silent on a clean roadmap edit', () => {
  const root = fixtureRoot();
  const r = runHook(root, { file_path: path.join(root, 'docs', 'roadmap', 'sync.md') });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('exit 2 with the errors on stderr for a malformed area file', () => {
  const root = fixtureRoot(r => {
    const p = path.join(r, 'docs', 'roadmap', 'sync.md');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('`android` `needs-verify`', '`android` `needs-verifyy`'));
  });
  const r = runHook(root, { file_path: path.join(root, 'docs', 'roadmap', 'sync.md') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /docs\/roadmap\/sync\.md:7 unknown token `needs-verifyy`/);
  // The hook must hand back BOTH ways to learn the vocabulary, not a pointer to an archived spec.
  assert.match(r.stderr, /--vocab/);
  assert.match(r.stderr, /ROADMAP\.md/);
  assert.match(r.stderr, /did you mean `needs-verify`/);
});

test('an entry filed in ROADMAP.md itself is caught too', () => {
  const root = fixtureRoot(r => {
    const p = path.join(r, 'ROADMAP.md');
    fs.appendFileSync(p, '- [ ] filed in the index by a stale session\n');
  });
  const r = runHook(root, { file_path: 'ROADMAP.md' });   // relative path, as Edit sometimes passes
  assert.equal(r.status, 2);
  assert.match(r.stderr, /the index holds no entries/);
});

test('silent (exit 0) when docs/roadmap does not exist yet', () => {
  const root = fixtureRoot(r => fs.rmSync(path.join(r, 'docs', 'roadmap'), { recursive: true }));
  const r = runHook(root, { file_path: 'ROADMAP.md' });
  assert.equal(r.status, 0);
});
