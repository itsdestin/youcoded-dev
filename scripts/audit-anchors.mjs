#!/usr/bin/env node
// audit-anchors.mjs — the deterministic mechanical pass for /audit.
//
// Harvests machine-checkable anchors from three places and verifies each
// against the working tree:
//   1. `verify:` blocks in .claude/rules/*.md frontmatter (schema: .claude/rules/README.md)
//   2. `<!-- verify: {"path": "...", "contains": "..."} -->` HTML comments in depth docs
//   3. every backtick path in docs/MAP.md's table
// Also enforces the knowledge-mgmt store budgets (spec principle 5), checks that
// every rule's `paths:` glob still matches at least one git-tracked file, and
// computes the diff scope: which subsystems changed since the last audit report's
// verified_shas frontmatter.
//
// Usage:
//   node scripts/audit-anchors.mjs                 human-readable; exit 1 on any failure
//   node scripts/audit-anchors.mjs --json          machine-readable (for the /audit agent)
//   node scripts/audit-anchors.mjs --no-diff       skip the git diff-scope computation
//   node scripts/audit-anchors.mjs --root <dir>    workspace root (default: this script's parent
//                                                  dir — pass explicitly when running from a
//                                                  worktree, which has no sub-repo clones)
//
// Tests: node --test scripts/audit-anchors.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPOS = ['youcoded', 'youcoded-core', 'youcoded-admin', 'wecoded-themes', 'wecoded-marketplace'];
// Dirs swept for <!-- verify: --> doc anchors. docs/archive is excluded (dead docs
// carry no live claims); node_modules is skipped by the walker.
export const DOC_DIRS = ['docs', 'youcoded/docs', 'wecoded-marketplace/docs'];
// Store budgets from the knowledge-mgmt spec, principle 5.
export const BUDGETS = { ruleBodyWords: 600, pitfallsWords: 2500, eagerTokens: 10000 };

// ---------- parsers (pure, no I/O) ----------

// Minimal parser for the exact rule-frontmatter shape pinned in .claude/rules/README.md.
// Deliberately NOT a general YAML parser: unknown top-level keys are ignored, and only
// the pinned shapes parse — a creatively-formatted rule surfaces as missing anchors
// (visible in the totals) rather than silently passing.
export function parseRuleFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = { paths: [], last_verified: null, verify: [] };
  let section = null; // 'paths' | 'verify' | null
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (/^paths:\s*$/.test(line)) { section = 'paths'; continue; }
    if (/^verify:\s*$/.test(line)) { section = 'verify'; continue; }
    const lv = line.match(/^last_verified:\s*(\S+)/);
    if (lv) { out.last_verified = lv[1]; section = null; continue; }
    if (/^\S/.test(line)) { section = null; continue; } // any other top-level key
    if (section === 'paths') {
      // quoted value (comment-safe) or first bare token
      const pm = line.match(/^\s+-\s+(?:"([^"]+)"|(\S+))/);
      if (pm) out.paths.push(pm[1] ?? pm[2]);
      continue;
    }
    if (section === 'verify') {
      const item = line.match(/^\s+-\s+(path|test):\s*(\S+)/);
      if (item) { out.verify.push({ [item[1]]: item[2] }); continue; }
      const cont = line.match(/^\s+contains:\s*(?:"(.*)"|(.+))$/);
      if (cont && out.verify.length) {
        out.verify[out.verify.length - 1].contains = cont[1] ?? cont[2];
      }
    }
  }
  return out;
}

// Depth docs pin individual claims with a trailing HTML comment:
//   <!-- verify: {"path": "x.ts", "contains": "regex"} -->  or  {"test": "x.test.ts"}
// JSON on purpose — deterministic to parse, impossible to half-match. A comment that
// LOOKS like an anchor but fails JSON.parse is returned as {malformed} so the checker
// fails it loudly instead of dropping the claim.
export function harvestDocAnchors(text) {
  const anchors = [];
  for (const m of text.matchAll(/<!--\s*verify:\s*(\{[\s\S]*?\})\s*-->/g)) {
    try { anchors.push(JSON.parse(m[1])); }
    catch { anchors.push({ malformed: m[1] }); }
  }
  return anchors;
}

// Every backtick-quoted path inside MAP's table rows (lines starting with '|').
// Cells with prose ("manual (visual)") have no backticks; rule names have no '/';
// paths with spaces are not paths.
export function harvestMapPaths(text) {
  const paths = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const p = m[1];
      if (p.includes('/') && !p.includes(' ')) paths.add(p);
    }
  }
  return [...paths];
}

// Just enough glob for the rules' paths: frontmatter: ** crosses slashes, * doesn't.
export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if ('.+?^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

export function countBodyWords(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return (body.match(/\S+/g) || []).length;
}

// ---------- checks (filesystem / git I/O) ----------

// One anchor → {ok, reason}. `test:` anchors are existence-checked here; the
// /audit FULL mode additionally RUNS them via each repo's test runner (the
// script stays fast and dependency-free — seconds, not minutes).
export function checkAnchor(root, anchor) {
  if (anchor.malformed !== undefined) {
    return { ok: false, reason: `unparseable doc-anchor JSON: ${anchor.malformed}` };
  }
  const rel = anchor.path ?? anchor.test;
  if (!rel) return { ok: false, reason: `anchor has neither path nor test: ${JSON.stringify(anchor)}` };
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return { ok: false, reason: `missing: ${rel}` };
  if (anchor.contains !== undefined) {
    let re;
    try { re = new RegExp(anchor.contains); }
    catch (e) { return { ok: false, reason: `invalid contains regex /${anchor.contains}/: ${e.message}` }; }
    if (!re.test(fs.readFileSync(abs, 'utf8'))) {
      return { ok: false, reason: `/${anchor.contains}/ not found in ${rel}` };
    }
  }
  return { ok: true };
}

// git-tracked files across workspace + sub-repos, sub-repo paths prefixed with
// their dir. git ls-files (not a tree walk) so node_modules/build output never
// appear and the whole sweep stays sub-second.
export function listTrackedFiles(root) {
  const files = [];
  const ls = (dir, prefix) => {
    try {
      const out = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      for (const f of out.split('\n')) if (f) files.push(prefix + f);
    } catch { /* repo missing (setup.sh not run) — its globs will visibly match nothing */ }
  };
  ls(root, '');
  for (const r of REPOS) {
    if (fs.existsSync(path.join(root, r, '.git'))) ls(path.join(root, r), r + '/');
  }
  return files;
}

export function currentShas(root) {
  const shas = {};
  const get = (name, dir) => {
    try { shas[name] = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
    catch { /* leave absent */ }
  };
  get('workspace', root);
  for (const r of REPOS) if (fs.existsSync(path.join(root, r, '.git'))) get(r, path.join(root, r));
  return shas;
}

export function* walkMarkdown(dir, skipDirs = []) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || skipDirs.some(s => path.resolve(full) === path.resolve(s))) continue;
      yield* walkMarkdown(full, skipDirs);
    } else if (entry.name.endsWith('.md')) {
      yield full;
    }
  }
}
