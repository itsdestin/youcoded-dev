// Tests for the glob-guard PreToolUse hook.
//
// The dangerous failure here is a FALSE POSITIVE — a hook that blocks a working
// command costs far more than the wasted calls it exists to prevent. So the
// "must allow" list is deliberately much longer than the "must block" list, and
// every "must block" case is one actually observed in the 2026-08-26 → 08-28
// session transcripts.
//
// Run: node --test .claude/hooks/glob-guard.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'glob-guard.py');

// A fixture with known contents, so "matches something" is deterministic.
const CWD = mkdtempSync(path.join(tmpdir(), 'glob-guard-'));
mkdirSync(path.join(CWD, 'src'));
writeFileSync(path.join(CWD, 'src', 'a.ts'), '');
writeFileSync(path.join(CWD, 'notes.md'), '');
process.on('exit', () => rmSync(CWD, { recursive: true, force: true }));

/** @returns {{blocked: boolean, message: string}} */
function run(command, tool_name = 'Bash') {
  const r = spawnSync('python3', [HOOK], {
    input: JSON.stringify({ tool_name, tool_input: { command }, cwd: CWD }),
    encoding: 'utf8',
  });
  return { blocked: r.status === 2, message: (r.stderr || '').trim() };
}

// ---------------------------------------------------------------------------
// MUST BLOCK — every one of these was a real wasted call in the transcripts
// ---------------------------------------------------------------------------

const MUST_BLOCK = [
  // The 35-hit shape: pattern option, unquoted glob.
  'grep -rn "download" --include=*.ts --include=*.tsx desktop/src',
  'grep -rn "lastUsedModel" src/renderer --include=*.tsx',
  'grep -rn "structuredPatch" src/ --include=*.ts --include=*.tsx',
  // Same class, other tools.
  'find . -name *.ts',
  'rg -n foo -g *.ts src',
  'find . -iname *.gguf',
  'grep -rn foo --exclude=*.map src',
];

for (const cmd of MUST_BLOCK) {
  test(`blocks: ${cmd}`, () => {
    const { blocked, message } = run(cmd);
    assert.equal(blocked, true, `should have been blocked: ${cmd}`);
    assert.match(message, /zsh/, 'message must explain why');
  });
}

test('a pattern option is blocked even when the glob DOES match', () => {
  // src/a.ts exists, so zsh would silently substitute it and grep would search
  // for the wrong thing — worse than aborting, because it looks like it worked.
  assert.equal(run('grep -rn foo --include=*.ts src').blocked, true);
});

// ---------------------------------------------------------------------------
// Deliberately NOT checked: bare glob arguments.
//
// Whether these abort depends on the directory the glob resolves against, and
// nearly every command here `cd`s first — so the cwd the hook is handed is not
// the one that matters. Replaying all 5,086 real Bash calls from the 46 sessions,
// checking these would have caught 32 more aborts and wrongly blocked 263 working
// commands. CLAUDE.md covers this half instead. Pinned so nobody "improves" it back.
// ---------------------------------------------------------------------------

const OUT_OF_SCOPE = [
  'ls -d /home/destin/.config/YouCoded*',
  'cat src/main/remote-shim*',
  'curl -s http://127.0.0.1:5333/?mode=workbench',
];

for (const cmd of OUT_OF_SCOPE) {
  test(`out of scope (bare glob, cwd-dependent): ${cmd}`, () => {
    assert.equal(run(cmd).blocked, false);
  });
}

// ---------------------------------------------------------------------------
// MUST ALLOW — false positives are the expensive failure
// ---------------------------------------------------------------------------

const MUST_ALLOW = [
  // Correctly quoted globs, in every spelling.
  `rg -n "sessionId" -g '*.ts' src`,
  `grep -rn foo "--include=*.ts" src`,
  `grep -rn foo --include="*.ts" src`,
  `find . -name "*.ts"`,
  `rg -n foo --glob '!**/dist/**' src`,
  // Bare globs that DO match here — a working idiom, must pass through.
  'ls *.md',
  'ls -d src/*',
  'cat notes.m*',
  // No glob at all.
  'git log --oneline -5',
  'npm run build',
  'sed -n "1,80p" notes.md',
  `sed -n '1,5p' notes.md`,
  `awk '{print $1}' notes.md`,
  'wc -l notes.md',
  // Quoted text that merely contains glob characters.
  'echo "test * ? [a-z]"',
  `python3 -c "print('*.ts')"`,
  `git commit -m "fix: handle *.ts properly"`,
  // Shell syntax that is not a glob.
  '[ -f notes.md ] && echo yes',
  'ls notes.md 2>&1 | head -3',
  'test -d src && echo ok',
  // Heredocs: the body is data, and no tokenizer can tell otherwise.
  `cat > out.txt <<'EOF'\ngrep -rn x --include=*.ts src\nEOF`,
  `python3 - <<'PY'\nimport glob\nprint(glob.glob("*.ts"))\nPY`,
  // Command substitution and parameter expansion — not globs the shell resolves here.
  'echo $(ls)',
  'col=${pair%%:*}; echo $col',
  'for f in ${files}; do echo $f; done',
  // Malformed input must fail open, never block.
  `grep -rn "unbalanced src`,
];

for (const cmd of MUST_ALLOW) {
  test(`allows: ${cmd.split('\n')[0].slice(0, 60)}`, () => {
    const { blocked, message } = run(cmd);
    assert.equal(blocked, false, `false positive on: ${cmd}\nhook said: ${message}`);
  });
}

// ---------------------------------------------------------------------------
// The hook must never take a session down
// ---------------------------------------------------------------------------

test('ignores non-Bash tools', () => {
  assert.equal(run('grep -rn foo --include=*.ts src', 'Read').blocked, false);
});

test('survives a malformed payload', () => {
  const r = spawnSync('python3', [HOOK], { input: 'not json at all', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('survives an empty payload', () => {
  const r = spawnSync('python3', [HOOK], { input: '{}', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('survives a missing command field', () => {
  const r = spawnSync('python3', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: {} }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
});
