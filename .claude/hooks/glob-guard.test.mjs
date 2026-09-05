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

// Guard 3: `rg` with -r clustered. Observed 2026-09-03 — a session typed
// `rg -rn "cacheReadTokens" ...` out of grep muscle memory, got every match
// with the text replaced by the literal "n", exit 0, and nearly read it as
// real output. Its sibling `rg -nr` prints nothing at all and exits 1, which
// is worse: a manufactured clean negative for a string that is present.
test('blocks rg -rn (grep muscle memory; silently replaces matches with "n")', () => {
  const { blocked, message } = run('rg -rn "cacheReadTokens" src');
  assert.ok(blocked);
  assert.match(message, /--replace/);
});

test('blocks rg -nr (r eats the pattern; prints nothing, exits 1 — a fake negative)', () => {
  assert.ok(run('rg -nr alpha src').blocked);
});

test('blocks the cluster wherever it sits in the argument list', () => {
  assert.ok(run('rg --hidden -rl TODO .').blocked);
});

test('blocks it after a pipe too', () => {
  assert.ok(run('cat x | rg -rn foo').blocked);
});

test('ALLOWS a genuine unclustered replace', () => {
  assert.equal(run("rg -r X alpha g.txt").blocked, false);
});

test('ALLOWS ordinary rg flags with no r in the cluster', () => {
  assert.equal(run('rg -n "cacheReadTokens" src').blocked, false);
  assert.equal(run("rg -ln 'TODO' src").blocked, false);
  assert.equal(run("rg -o -a 'total_input_tokens' bin").blocked, false);
  assert.equal(run("rg -A 4 -B 2 'pat' src").blocked, false);
});

test('ALLOWS -r clusters on OTHER tools — this is a ripgrep-only trap', () => {
  assert.equal(run("sed -rn 's/a/b/p' file").blocked, false);
  assert.equal(run('ls -lr').blocked, false);
});

test('ALLOWS it inside a heredoc body, which is data not a command', () => {
  assert.equal(run("cat <<'EOF'\nrg -rn example\nEOF").blocked, false);
});

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

// ---------------------------------------------------------------------------
// Guard 2 — `pkill -f`, which in this harness always kills the calling shell
// ---------------------------------------------------------------------------
// Verified 2026-09-03: `pkill -f "zzz-unique-marker-qq7"` (matching nothing else on the
// machine) exited 144 and the following `echo` never ran — the pattern matched the
// `zsh -c '<whole command>'` wrapper Claude Code runs every Bash call through.

for (const cmd of [
  'pkill -f deck-render-',
  'pkill -f "some pattern"',
  'pkill -9 -f node',
  'pkill -fe node',
  'ls && pkill -f vite',
  'foo; pkill -f bar',
]) {
  test(`blocks: ${cmd}`, () => {
    const { blocked, message } = run(cmd);
    assert.equal(blocked, true, `should have blocked: ${cmd}`);
    assert.match(message, /kills the shell running your command|cannot work here/);
    assert.match(message, /pgrep -af/, 'must name the safe alternative');
  });
}

// A heredoc BODY is data, but the shell after the heredoc is still shell: this exact shape
// slipped through the blanket `<<` exemption on 2026-09-04 and killed the shell.
test('blocks: pkill -f after a heredoc', () => {
  const { blocked } = run("cat > /tmp/x <<'EOF'\nhello\nEOF\npkill -f script-editor; echo survived");
  assert.equal(blocked, true);
});
test('allows: pkill -f inside a heredoc body', () => {
  const { blocked } = run("cat <<'EOF'\npkill -f node is the trap\nEOF");
  assert.equal(blocked, false);
});

// ---------------------------------------------------------------------------
// Guard 4 — `pgrep -f` as a loop/if condition: it always matches the wrapper, so it never ends
// ---------------------------------------------------------------------------
for (const cmd of [
  'until ! pgrep -f "remotion render" >/dev/null; do sleep 3; done; echo done',
  'while pgrep -f vite; do sleep 1; done',
  'if pgrep -af "python3 serve.py" >/dev/null; then echo running; fi',
]) {
  test(`blocks: ${cmd}`, () => {
    const { blocked, message } = run(cmd);
    assert.equal(blocked, true, `should have blocked: ${cmd}`);
    assert.match(message, /never turns false|never ends/);
    assert.match(message, /run_in_background|flock/, 'must name the way to wait');
  });
}
for (const cmd of [
  'until [ -f out/done ]; do sleep 2; done',
  'pgrep -af node | rg -v pgrep',
  'while read -r l; do echo "$l"; done < list',
]) {
  test(`allows: ${cmd}`, () => {
    assert.equal(run(cmd).blocked, false, `should have allowed: ${cmd}`);
  });
}

for (const cmd of [
  'pgrep -af node',            // read-only: signals nothing
  'pgrep -f node | head',
  'pkill node',                // matches process NAMES, not command lines — safe
  'pkill -9 chrome',
  'kill 1234 5678',
  'echo "pkill -f is the trap"',
  'rg -n "pkill -f" docs/',
]) {
  test(`allows: ${cmd}`, () => {
    const { blocked, message } = run(cmd);
    assert.equal(blocked, false, `false positive on: ${cmd}\nhook said: ${message}`);
  });
}

// Guard 5: `kill <pid>` aimed at the live app. Observed 2026-09-04 — a session killed the
// live app's llama-server with a pid remembered from an earlier listing. The tests point the
// hook at a fake /proc so they never depend on what is running on this machine.
const PROC = mkdtempSync(path.join(tmpdir(), 'glob-guard-proc-'));
process.on('exit', () => rmSync(PROC, { recursive: true, force: true }));
function fakeProc(pid, argv) {
  mkdirSync(path.join(PROC, String(pid)), { recursive: true });
  writeFileSync(path.join(PROC, String(pid), 'cmdline'), argv.join('\0') + '\0');
}
fakeProc(4101, ['/home/destin/.config/youcoded/engine/b10665-vulkan/llama-b10665/llama-server', '--port', '9920']);
fakeProc(4102, ['/opt/YouCoded/youcoded', '--type=zygote']);
fakeProc(4103, ['/home/destin/.config/youcoded-dev/engine/b10665-vulkan/llama-b10665/llama-server', '--port', '8199']);
fakeProc(4104, ['node', 'scripts/ui-review/shot.mjs']);
function runProc(command) {
  const r = spawnSync('python3', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: CWD }),
    encoding: 'utf8', env: { ...process.env, GLOB_GUARD_PROC: PROC },
  });
  return { blocked: r.status === 2, message: (r.stderr || '').trim() };
}
test('blocks kill of the live app engine (its cmdline is under /.config/youcoded/)', () => {
  const { blocked, message } = runProc('kill 4101');
  assert.ok(blocked);
  assert.match(message, /LIVE YouCoded app/);
  assert.match(message, /4101/);
});
test('blocks kill of the built app binary, with a signal, and after a semicolon', () => {
  assert.ok(runProc('kill -9 4102').blocked);
  assert.ok(runProc('echo x; kill -TERM 4102').blocked);
  assert.ok(runProc('kill 4104 4102').blocked);
});
test('ALLOWS kill of a dev-profile engine (youcoded-dev/ is not youcoded/) and of unrelated processes', () => {
  assert.equal(runProc('kill 4103').blocked, false);
  assert.equal(runProc('kill 4104').blocked, false);
  assert.equal(runProc('kill 4103 4104').blocked, false);
});
test('ALLOWS kill -0 (a liveness probe) even on the live app, and pids /proc does not know', () => {
  assert.equal(runProc('kill -0 4101').blocked, false);
  assert.equal(runProc('kill 999999').blocked, false);
});
test('ALLOWS kill with a shell variable or job spec — nothing numeric to look up', () => {
  assert.equal(runProc('P=$(ss -ltnp | rg ":8199" | rg -o "pid=[0-9]+" | cut -d= -f2); kill "$P"').blocked, false);
  assert.equal(runProc('kill %1').blocked, false);
});
