// scripts/self-spawn-guard.mjs — finds test files that start a copy of THEMSELVES as a child process.
//
// WHY (2026-11-27): scripts/lib/lock.test.mjs re-ran its own file as a "child", and every child re-ran
// the whole suite and started 8+ more children: a fork bomb that filled 121 GB of RAM and crashed
// Destin's computer three times. A test that needs a helper process must put the helper in its own file
// that contains no tests (see scripts/lib/lock-child.mjs). This check fails any test file that hands its
// own path to spawn/fork/exec, so the pattern cannot come back in another file.
//
// What counts as "its own path" inside a spawn/fork/exec call's arguments:
//   import.meta.url, import.meta.filename, __filename, process.argv[1]  (used directly),
//   a variable assigned exactly one of those (e.g. const here = fileURLToPath(import.meta.url)),
//   or the file's own name as text (e.g. join(HERE, 'lock.test.mjs')).
// dirname(fileURLToPath(import.meta.url)) is NOT its own path (that is the folder), so it is allowed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CALL = /\b(spawn|spawnSync|fork|execFile|execFileSync|exec|execSync)\s*\(/g;
const DIRECT = /import\.meta\.url|import\.meta\.filename|__filename|process\.argv\[1\]/;
// A variable whose whole value is the file's own path (not wrapped in dirname/join/new URL('./x', …)).
const SELF_VAR = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:fileURLToPath\(\s*import\.meta\.url\s*\)|import\.meta\.filename|__filename|process\.argv\[1\]|import\.meta\.url)\s*[;,\n]/g;

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

/** Returns a list of { line, call } for every spawn/fork/exec call that points at this file itself. */
export function findSelfSpawns(src, fileName) {
  const selfVars = [...src.matchAll(SELF_VAR)].map(m => m[1]);
  const own = path.basename(fileName);
  const hits = [];
  for (const m of src.matchAll(CALL)) {
    // WHY strip new URL('<name>', import.meta.url): that names ANOTHER file (or '.' = the folder) next to this
    // one, the safe helper pattern. If <name> is this file's own name, the own-name test below still catches it.
    const args = argsAt(src, m.index + m[0].length).replace(/new URL\(\s*(['"`])[^'"`]*\1\s*,\s*import\.meta\.url\s*\)/g, (u) => u.replace('import.meta.url', 'BASE'));
    const pointsAtSelf = DIRECT.test(args)
      || selfVars.some(v => new RegExp(`(?<![\\w$.])${v.replace(/\$/g, '\\$')}(?![\\w$])`).test(args))
      || args.includes(own);
    if (pointsAtSelf) hits.push({ line: src.slice(0, m.index).split('\n').length, call: m[1] });
  }
  return hits;
}

/** Every tracked test file in this workspace repo (component repos have their own checks). */
export function workspaceTestFiles(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.test.mjs', '*.test.js', '*.test.cjs'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean).map(f => path.join(root, f));
}
