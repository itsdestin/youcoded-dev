// scripts/self-spawn-guard.mjs — finds test files that start a copy of THEMSELVES (or a whole test suite)
// as a child process.
//
// WHY (2026-11-27): scripts/lib/lock.test.mjs re-ran its own file as a "child", and every child re-ran
// the whole suite and started 8+ more children: a fork bomb that filled 121 GB of RAM and crashed
// Destin's computer three times. A test that needs a helper process must put the helper in its own file
// that contains no tests (see scripts/lib/lock-child.mjs). This check fails any test file that:
//   * hands its own path to spawn/fork/exec (directly, through a variable, or by its own file name), or
//   * passes process.argv through to a child (except flags from argv[2] on), or
//   * starts a test runner (`node --test`, `npm test`, `npx vitest`, …): the same bomb without the path.
// Folder-relative helpers are allowed: dirname(fileURLToPath(import.meta.url)), new URL('.', …),
// new URL('./helper.mjs', import.meta.url).
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CALL_NAMES = ['spawn', 'spawnSync', 'fork', 'execFile', 'execFileSync', 'exec', 'execSync'];
const ident = (s) => s.replace(/\$/g, '\\$');
// Expressions whose value is THIS file's path (or URL).
const SELF_EXPR = String.raw`(?:fileURLToPath\(\s*import\.meta\.url\s*\)|new URL\(\s*import\.meta\.url\s*\)(?:\.pathname|\.href)?|import\.meta\.filename|import\.meta\.url|__filename|process\.argv\[1\]|process\.argv\.at\(\s*1\s*\))`;
const SELF_VAR = new RegExp(String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*${SELF_EXPR}\s*[;,\n]`, 'g');
// const { pathname: me } = new URL(import.meta.url)   /   const { pathname } = new URL(import.meta.url)
const SELF_DESTRUCTURE = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*new URL\(\s*import\.meta\.url\s*\)/g;
const DIRECT = new RegExp(SELF_EXPR);
// process.argv passed on, other than flags from index 2: argv.slice(2) / argv[2+] are fine.
// argv[0] / argv0 are the node binary itself, not this file, so they are fine too.
const ARGV_PASSED = /process\.argv(?!\s*\.slice\(\s*[2-9]|\s*\[\s*[02-9]|\s*\.at\(\s*[02-9]|0)/;
// A test runner started from inside a test: the whole-suite bomb without naming this file.
const RUNNER = /['"`]--test\b|['"`](?:npm|pnpm|yarn)['"`]\s*,\s*\[\s*['"`](?:run\s+)?test|['"`](?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|\bvitest\b|\bnode\s+--test\b/;

/** The text of a call's arguments, from just after "(" to its matching ")". */
function argsAt(src, open) {
  let depth = 1, i = open;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
  }
  return src.slice(open, i - 1);
}

/** Folder-relative forms are safe: replace them before looking for this file's own path. */
function stripFolderForms(args) {
  return args
    // keep the name: new URL('./<this file>', import.meta.url) must still be caught by the own-name test
    .replace(/new URL\(\s*(['"`])([^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g, (_, q, name) => `URL_NEXT_TO_ME(${q}${name}${q})`)
    .replace(/dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/g, 'MY_FOLDER')
    .replace(/import\.meta\.dirname|__dirname/g, 'MY_FOLDER');
}

/** Names this file calls spawn/fork/exec by, including aliases (import { spawn as sp }, const s = spawn). */
function callNames(src) {
  const names = new Set(CALL_NAMES);
  for (const m of src.matchAll(/\b(spawn|spawnSync|fork|execFile|execFileSync|exec|execSync)\s+as\s+([A-Za-z_$][\w$]*)/g)) names.add(m[2]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$.]+\.)?(spawn|spawnSync|fork|execFile|execFileSync|exec|execSync)\s*[;,\n]/g)) names.add(m[1]);
  return [...names];
}

/** Returns a list of { line, call, why } for every child-process call that could re-run this file or a suite. */
export function findSelfSpawns(src, fileName) {
  const own = path.basename(fileName);
  const selfVars = [...src.matchAll(SELF_VAR)].map(m => m[1]);
  for (const m of src.matchAll(SELF_DESTRUCTURE)) {
    for (const part of m[1].split(',')) {
      const [key, alias] = part.split(':').map(s => s.trim());
      if (/^(pathname|href)$/.test(key)) selfVars.push(alias || key);
    }
  }
  const call = new RegExp(String.raw`(?<![\w$])(${callNames(src).map(ident).join('|')})\s*\(`, 'g');
  const hits = [];
  for (const m of src.matchAll(call)) {
    const args = stripFolderForms(argsAt(src, m.index + m[0].length));
    let why = null;
    if (DIRECT.test(args) || args.includes(own)
      || selfVars.some(v => new RegExp(String.raw`(?<![\w$.])${ident(v)}(?![\w$])`).test(args))) why = 'its own path';
    else if (ARGV_PASSED.test(args)) why = 'process.argv passed on';
    else if (RUNNER.test(args)) why = 'starts a test runner';
    if (why) hits.push({ line: src.slice(0, m.index).split('\n').length, call: m[1], why });
  }
  return hits;
}

/** Every tracked test file in this workspace repo (component repos have their own checks). */
export function workspaceTestFiles(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.test.mjs', '*.test.js', '*.test.cjs', '*.spec.mjs', '*.spec.js', '*.spec.cjs'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean).map(f => path.join(root, f));
}
