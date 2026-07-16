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

// Strips markdown code — fenced blocks (``` / ~~~) and inline `code` spans — so that
// docs which TEACH the anchor syntax don't self-report as drift. A real anchor is an
// HTML comment in rendered prose; an anchor shown inside a code fence or `inline code`
// is documentation of the format, not a live claim. (Found via the Phase-3 integration
// run: the audit-rebuild plan reproduces this file's source, and every example anchor
// inside its ```js fences and `inline` spans was harvested as a bogus failing claim.)
function stripMarkdownCode(text) {
  const out = [];
  let fence = null; // { char, len } while inside a fenced block
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
      continue; // drop everything inside the fence, plus the fence lines themselves
    }
    const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (open) { fence = { char: open[1][0], len: open[1].length }; continue; }
    // remove inline code spans (matching backtick runs) from this prose line
    out.push(line.replace(/(`+)[\s\S]*?\1/g, ''));
  }
  return out.join('\n');
}

// Depth docs pin individual claims with a trailing HTML comment:
//   <!-- verify: {"path": "x.ts", "contains": "regex"} -->  or  {"test": "x.test.ts"}
// JSON on purpose — deterministic to parse, impossible to half-match. A comment that
// LOOKS like an anchor but fails JSON.parse is returned as {malformed} so the checker
// fails it loudly instead of dropping the claim. Code (fences/inline spans) is stripped
// first so example anchors in docs that document the format aren't mistaken for claims.
export function harvestDocAnchors(text) {
  const anchors = [];
  for (const m of stripMarkdownCode(text).matchAll(/<!--\s*verify:\s*(\{[\s\S]*?\})\s*-->/g)) {
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

// ---------- diff scope ----------

// Reads the verified_shas: map from a report's frontmatter. Returns null when the
// report has none (e.g. the 2026-07-15 knowledge-mgmt changelog) so callers skip it.
export function parseReportShas(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const shas = {};
  let inShas = false;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^verified_shas:\s*$/.test(line)) { inShas = true; continue; }
    if (inShas) {
      const kv = line.match(/^\s+([A-Za-z0-9_-]+):\s*([0-9a-f]{7,40})\s*$/);
      if (kv) { shas[kv[1]] = kv[2]; continue; }
      if (/^\S/.test(line)) inShas = false;
    }
  }
  return Object.keys(shas).length ? shas : null;
}

// Newest dated docs/audits report that carries verified_shas — the diff base.
export function latestShaReport(root) {
  const dir = path.join(root, 'docs', 'audits');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(f))
    .sort()
    .reverse();
  for (const f of files) {
    const shas = parseReportShas(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (shas) return { file: path.join(dir, f), shas };
  }
  return null;
}

// Per-repo `git diff --name-only <sha>..HEAD`, sub-repo paths prefixed. An unknown
// SHA (history rewritten, shallow clone) becomes a note telling the agent to run
// /audit full — never a silent empty diff.
export function changedFilesSince(root, shas) {
  const changed = [];
  const notes = [];
  const dirs = { workspace: root };
  for (const r of REPOS) dirs[r] = path.join(root, r);
  for (const [name, sha] of Object.entries(shas)) {
    const dir = dirs[name];
    if (!dir || !fs.existsSync(path.join(dir, '.git'))) { notes.push(`repo ${name} not found on disk`); continue; }
    const prefix = name === 'workspace' ? '' : name + '/';
    try {
      const out = execFileSync('git', ['-C', dir, 'diff', '--name-only', `${sha}..HEAD`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      for (const f of out.split('\n')) if (f) changed.push(prefix + f);
    } catch {
      notes.push(`repo ${name}: base SHA ${sha} unknown — run /audit full`);
    }
  }
  return { changed, notes };
}

// changed files × rule globs → which subsystems need semantic re-verification,
// plus the files matching NO rule (the "new subsystem without a rule" signal).
export function affectedSubsystems(rules, changedFiles) {
  const affected = new Set();
  const covered = new Set();
  for (const f of changedFiles) {
    for (const rule of rules) {
      if (rule.globs.some(g => g.test(f))) { affected.add(rule.name); covered.add(f); }
    }
  }
  return {
    affected: [...affected].sort(),
    uncovered: changedFiles.filter(f => !covered.has(f)),
  };
}

// ---------- main ----------

const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|kt|kts|java|sh|ps1|sql|toml|gradle)$/;

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const noDiff = args.includes('--no-diff');
  const rootIdx = args.indexOf('--root');
  const root = rootIdx !== -1
    ? path.resolve(args[rootIdx + 1])
    : path.resolve(fileURLToPath(new URL('..', import.meta.url)));

  const result = {
    ok: true,
    anchors: { total: 0, failed: [] },
    mapPaths: { total: 0, missing: [] },
    ruleGlobs: { failed: [] },
    budgets: { violations: [], eagerTokens: 0, eagerLimit: BUDGETS.eagerTokens },
    diffScope: null,
    currentShas: {},
  };

  // 1. rules: verify: anchors + per-rule body budget
  const rulesDir = path.join(root, '.claude', 'rules');
  const rules = [];
  for (const f of fs.readdirSync(rulesDir).filter(f => f.endsWith('.md') && f !== 'README.md').sort()) {
    const text = fs.readFileSync(path.join(rulesDir, f), 'utf8');
    const fm = parseRuleFrontmatter(text);
    if (!fm) {
      result.anchors.failed.push({ source: `.claude/rules/${f}`, reason: 'no frontmatter block' });
      continue;
    }
    rules.push({ name: f.replace(/\.md$/, ''), file: `.claude/rules/${f}`, fm, text });
    for (const anchor of fm.verify) {
      result.anchors.total++;
      const r = checkAnchor(root, anchor);
      if (!r.ok) result.anchors.failed.push({ source: `.claude/rules/${f}`, anchor, reason: r.reason });
    }
    const words = countBodyWords(text);
    if (words > BUDGETS.ruleBodyWords) {
      result.budgets.violations.push({ file: `.claude/rules/${f}`, words, limit: BUDGETS.ruleBodyWords });
    }
  }

  // 2. doc anchors (docs/archive excluded — dead docs carry no live claims)
  const skipDirs = [path.join(root, 'docs', 'archive')];
  for (const dir of DOC_DIRS) {
    for (const file of walkMarkdown(path.join(root, dir), skipDirs)) {
      const relFile = path.relative(root, file).replaceAll('\\', '/');
      for (const anchor of harvestDocAnchors(fs.readFileSync(file, 'utf8'))) {
        result.anchors.total++;
        const r = checkAnchor(root, anchor);
        if (!r.ok) result.anchors.failed.push({ source: relFile, anchor, reason: r.reason });
      }
    }
  }

  // 3. MAP: every path cell must exist
  const mapFile = path.join(root, 'docs', 'MAP.md');
  if (fs.existsSync(mapFile)) {
    const mapPaths = harvestMapPaths(fs.readFileSync(mapFile, 'utf8'));
    result.mapPaths.total = mapPaths.length;
    for (const p of mapPaths) {
      if (!fs.existsSync(path.join(root, p))) result.mapPaths.missing.push(p);
    }
  } else {
    result.mapPaths.missing.push('docs/MAP.md (the map itself is missing)');
  }

  // 4. every rule glob must still match >=1 tracked file (catches renamed dirs)
  const tracked = listTrackedFiles(root);
  for (const rule of rules) {
    for (const glob of rule.fm.paths) {
      if (glob === '**') continue; // the deliberate eager rule
      const re = globToRegex(glob);
      if (!tracked.some(f => re.test(f))) result.ruleGlobs.failed.push({ rule: rule.file, glob });
    }
  }

  // 5. budgets: slim PITFALLS + the eager-load set (CLAUDE.md + eager rules)
  const pitfallsFile = path.join(root, 'docs', 'PITFALLS.md');
  if (fs.existsSync(pitfallsFile)) {
    const words = countBodyWords(fs.readFileSync(pitfallsFile, 'utf8'));
    if (words > BUDGETS.pitfallsWords) {
      result.budgets.violations.push({ file: 'docs/PITFALLS.md', words, limit: BUDGETS.pitfallsWords });
    }
  }
  let eagerWords = countBodyWords(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'));
  for (const rule of rules) {
    if (!rule.fm.paths.length || rule.fm.paths.includes('**')) eagerWords += countBodyWords(rule.text);
  }
  result.budgets.eagerTokens = Math.ceil(eagerWords * 1.33); // rough words→tokens
  if (result.budgets.eagerTokens > BUDGETS.eagerTokens) {
    result.budgets.violations.push({
      file: 'CLAUDE.md + eager rules', words: eagerWords,
      limit: BUDGETS.eagerTokens, note: 'estimated tokens over the eager-load budget',
    });
  }

  // 6. diff scope vs the last report with verified_shas
  result.currentShas = currentShas(root);
  if (!noDiff) {
    const report = latestShaReport(root);
    if (report) {
      const { changed, notes } = changedFilesSince(root, report.shas);
      const compiled = rules.map(r => ({
        name: r.name,
        globs: r.fm.paths.filter(g => g !== '**').map(globToRegex),
      }));
      const { affected, uncovered } = affectedSubsystems(compiled, changed);
      result.diffScope = {
        baseReport: path.relative(root, report.file).replaceAll('\\', '/'),
        changedCount: changed.length,
        affected,
        uncoveredCode: uncovered.filter(f => CODE_EXT.test(f)),
        notes,
      };
    } else {
      result.diffScope = { baseReport: null, notes: ['no prior report with verified_shas — run /audit full'] };
    }
  }

  result.ok = !result.anchors.failed.length && !result.mapPaths.missing.length
    && !result.ruleGlobs.failed.length && !result.budgets.violations.length;

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  process.exit(result.ok ? 0 : 1);
}

function printHuman(r) {
  console.log(`anchors: ${r.anchors.total - r.anchors.failed.length}/${r.anchors.total} ok · `
    + `MAP paths: ${r.mapPaths.total - r.mapPaths.missing.length}/${r.mapPaths.total} ok · `
    + `eager ≈${r.budgets.eagerTokens} tokens (limit ${r.budgets.eagerLimit})`);
  const dump = (label, arr) => {
    if (!arr.length) return;
    console.log(`FAIL ${label}:`);
    for (const x of arr) console.log('  ' + (typeof x === 'string' ? x : JSON.stringify(x)));
  };
  dump('anchors', r.anchors.failed);
  dump('MAP paths missing', r.mapPaths.missing);
  dump('rule globs matching nothing', r.ruleGlobs.failed);
  dump('budget violations', r.budgets.violations);
  if (r.diffScope) {
    console.log(r.diffScope.baseReport
      ? `diff scope vs ${r.diffScope.baseReport}: ${r.diffScope.changedCount} changed files → `
        + `affected subsystems: ${r.diffScope.affected.join(', ') || '(none)'}`
      : 'diff scope: no base report with verified_shas — run /audit full');
    for (const n of r.diffScope.notes || []) console.log('  note: ' + n);
    if (r.diffScope.uncoveredCode?.length) {
      console.log(`  changed code files matching NO rule (${r.diffScope.uncoveredCode.length}, first 20):`);
      for (const f of r.diffScope.uncoveredCode.slice(0, 20)) console.log('    ' + f);
    }
  }
  console.log(r.ok
    ? 'MECHANICAL PASS: OK'
    : 'MECHANICAL PASS: FAILURES — every failure above is confirmed drift; fix now.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
