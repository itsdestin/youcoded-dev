#!/usr/bin/env node
// scripts/check-doc-commands.mjs — run the commands the docs tell you to run.
//
// WHY THIS EXISTS: the README and docs/MAP.md both told you to run the review deck's
// tests as `python3 -m unittest discover -s scripts/ui-review/tests -p 'test_*.py' -t .`.
// That command CANNOT START — `-t .` cannot import a directory with no __init__.py, so it
// dies before running a single test. It sat wrong in two docs for months, which is exactly
// why nobody ran that suite and why eight theme colours drifted unnoticed.
//
// A command in a document is a promise nobody checks. This turns the ones that matter into
// a test: mark a fenced block `<!-- runnable -->` and it gets executed, from the workspace
// root, on every CI run. A command that rots then fails a build instead of quietly
// discouraging whoever tried it.
//
// HOW TO MARK A BLOCK — put the comment on the line before the fence:
//
//     <!-- runnable -->
//     ```bash
//     cd scripts/ui-review/tests && python3 -m unittest test_spec test_tokens test_live
//     ```
//
//     <!-- runnable: local -->        needs magick / ffmpeg / Chrome / a device — skipped in CI
//     <!-- runnable: 300 -->          a longer timeout, in seconds (default 120)
//
// Every non-blank, non-comment line in a marked block is one command, run with `bash -c`
// from the workspace root. So only mark blocks that are CHEAP, SAFE and HERMETIC — a
// marked block is a thing CI will really do. Nothing here is marked by default; marking is
// opt-in, one block at a time.
//
// Usage:
//   node scripts/check-doc-commands.mjs [--list] [--local] [--only <substring>]
//
//   --list     show what is marked and where, run nothing
//   --local    also run the `runnable: local` blocks (CI does not)
//   --only     restrict to docs whose path contains this substring
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const LIST = args.includes('--list');
const LOCAL = args.includes('--local');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// Where docs live. `docs/archive/` is deliberately excluded — an archived document is a
// record of what was true then, and its commands are allowed to have rotted.
const SEARCH = ['docs', 'scripts', '.claude'];
const SKIP = new Set(['node_modules', '.git', 'archive', '__pycache__', 'scratch']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = [join(ROOT, 'CLAUDE.md'), join(ROOT, 'README.md'), ...SEARCH.flatMap((d) => walk(join(ROOT, d)))]
  .filter((f) => statSync(f, { throwIfNoEntry: false }))
  .filter((f) => !ONLY || f.includes(ONLY));

// <!-- runnable --> / <!-- runnable: local --> / <!-- runnable: 300 -->, then a fenced block.
const MARK = /<!--\s*runnable(?::\s*([\w]+))?\s*-->\s*\n\s*```[\w]*\n([\s\S]*?)```/g;

const blocks = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(MARK)) {
    const arg = (m[1] || '').trim();
    const line = text.slice(0, m.index).split('\n').length;
    const commands = m[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    blocks.push({
      file: relative(ROOT, f), line,
      local: arg === 'local',
      timeout: /^\d+$/.test(arg) ? Number(arg) * 1000 : 120000,
      commands,
    });
  }
}

if (!blocks.length) {
  console.log('check-doc-commands: no <!-- runnable --> blocks found.');
  console.log('  Mark a block by putting `<!-- runnable -->` on the line before its fence.');
  process.exit(0);
}

if (LIST) {
  for (const b of blocks) {
    console.log(`${b.file}:${b.line}${b.local ? '  [local-only]' : ''}`);
    for (const c of b.commands) console.log(`    $ ${c}`);
  }
  console.log(`\n${blocks.length} runnable block(s), ${blocks.reduce((n, b) => n + b.commands.length, 0)} command(s).`);
  process.exit(0);
}

let failed = 0, ran = 0, skipped = 0;
for (const b of blocks) {
  if (b.local && !LOCAL) {
    console.log(`SKIP  ${b.file}:${b.line} (marked local — needs a binary CI does not have)`);
    skipped += b.commands.length;
    continue;
  }
  for (const cmd of b.commands) {
    const r = spawnSync('bash', ['-c', cmd], { cwd: ROOT, encoding: 'utf8', timeout: b.timeout });
    ran++;
    if (r.status === 0) { console.log(`OK    ${b.file}:${b.line}  $ ${cmd}`); continue; }
    failed++;
    console.log(`FAIL  ${b.file}:${b.line}  $ ${cmd}`);
    console.log(`      exit ${r.status ?? `signal ${r.signal}`}`);
    // The first lines of stderr are what tells you the command cannot start, which is the
    // whole failure mode this exists for.
    const why = (r.stderr || r.stdout || '').trim().split('\n').slice(-6);
    for (const l of why) console.log(`      ${l}`);
  }
}

console.log(`\n${ran} command(s) run, ${failed} failed, ${skipped} skipped as local-only.`);
process.exit(failed ? 1 : 0);
