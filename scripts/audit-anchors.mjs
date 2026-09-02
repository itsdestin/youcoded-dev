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

// A workspace WORKTREE holds no sub-repo clones — `youcoded/` and friends are gitignored
// directories of the MAIN checkout — so every `youcoded/...` anchor and MAP path read
// "missing" there, and sessions worked around it by symlinking the clones in. That is
// how a symlink got committed and clobbered the real clone on 2026-08-28
// (docs/PITFALLS.md). Resolve sub-repos from the main checkout instead:
// `git rev-parse --git-common-dir` names the main checkout's .git from any worktree.
const subRepoRootCache = new Map();
export function subRepoRoot(root) {
  if (subRepoRootCache.has(root)) return subRepoRootCache.get(root);
  let resolved = root;
  if (!REPOS.some(r => fs.existsSync(path.join(root, r, '.git')))) {
    try {
      const common = execFileSync('git', ['-C', root, 'rev-parse', '--git-common-dir'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const main = path.resolve(root, common, '..');
      if (main !== root && REPOS.some(r => fs.existsSync(path.join(main, r, '.git')))) resolved = main;
    } catch { /* not a git checkout — keep root; the globs will visibly match nothing */ }
  }
  subRepoRootCache.set(root, resolved);
  return resolved;
}
// The directory a workspace-relative path resolves against: sub-repo paths against the
// clone location, everything else (docs/, .claude/, ROADMAP.md) against the checkout itself.
export function baseFor(root, rel) {
  return REPOS.includes(rel.split('/')[0]) ? subRepoRoot(root) : root;
}
// Dirs swept for <!-- verify: --> doc anchors. docs/archive is excluded (dead docs
// carry no live claims); node_modules is skipped by the walker.
export const DOC_DIRS = ['docs', 'youcoded/docs', 'wecoded-marketplace/docs'];
// Store budgets from the knowledge-mgmt spec, principle 5.
export const BUDGETS = { ruleBodyWords: 600, pitfallsWords: 2500, eagerTokens: 10000 };

// ---------- parsers (pure, no I/O) ----------

// Minimal parser for the exact rule-frontmatter shape pinned in .claude/rules/README.md.
// Deliberately NOT a general YAML parser: unknown top-level keys are ignored. Fail-loud
// guarantee: an off-schema `paths:`/`verify:` line (e.g. inline-flow YAML like
// `paths: ["a/**"]`) is collected in `errors` — main() reports each as a failed anchor
// and skips the rule, so a creatively-formatted rule can never silently pass with its
// anchors unchecked or get misclassified as eager.
export function parseRuleFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = { paths: [], last_verified: null, verify: [], errors: [] };
  let section = null; // 'paths' | 'verify' | null
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (/^\s*#/.test(line)) continue; // full-line YAML comments are fine anywhere
    // section headers may carry a trailing # comment (the README's schema example does)
    if (/^paths:\s*(#.*)?$/.test(line)) { section = 'paths'; continue; }
    if (/^verify:\s*(#.*)?$/.test(line)) { section = 'verify'; continue; }
    // Fail loud on inline-flow YAML (`paths: ["a/**"]`, `verify: [{...}]`): silently
    // parsing it as "no paths, no anchors" would skip every check for the rule with exit 0.
    const inline = line.match(/^(paths|verify):\s*(\S.*)$/);
    if (inline) {
      out.errors.push(`off-schema ${inline[1]}: line ("${line}") — use the block-list form pinned in .claude/rules/README.md`);
      section = null;
      continue;
    }
    const lv = line.match(/^last_verified:\s*(\S+)/);
    if (lv) { out.last_verified = lv[1]; section = null; continue; }
    if (/^\S/.test(line)) { section = null; continue; } // any other top-level key
    if (section === 'paths') {
      // quoted value (comment-safe) or first bare token
      const pm = line.match(/^\s+-\s+(?:"([^"]+)"|(\S+))/);
      if (pm) { out.paths.push(pm[1] ?? pm[2]); continue; }
      // anything else indented here (e.g. inline-flow `  ["a/**"]`) would silently
      // yield zero paths and misclassify the rule as eager — fail loudly instead
      out.errors.push(`off-schema paths entry ("${line.trim()}") — use the "- <glob>" block-list form pinned in .claude/rules/README.md`);
      continue;
    }
    if (section === 'verify') {
      // quoted value (allows spaces in the path) or first bare token
      const item = line.match(/^\s+-\s+(path|test):\s*(?:"([^"]+)"|(\S+))/);
      if (item) { out.verify.push({ [item[1]]: item[2] ?? item[3] }); continue; }
      const cont = line.match(/^\s+contains:\s*(?:"(.*)"|(.+))$/);
      if (cont && out.verify.length) {
        out.verify[out.verify.length - 1].contains = cont[1] ?? cont[2];
        continue;
      }
      // a typo'd key (`- file: x.ts`) or an orphaned `contains:` would silently drop
      // the anchor — the exact fail-loud hole, one level down. Fail loudly instead.
      out.errors.push(`off-schema verify entry ("${line.trim()}") — expected "- path:", "- test:", or a "contains:" continuation (schema: .claude/rules/README.md)`);
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
// `marker` is the word before the colon: 'verify' (depth docs, this script) or 'claim'
// (roadmap reports, scripts/roadmap-check.mjs). The default keeps every existing caller as is.
// A broken verify: is doc drift and fails CI; a broken claim: is a roadmap item to re-verify
// and must NOT — which is why they are different words (spec §4).
export function harvestDocAnchors(text, marker = 'verify') {
  const anchors = [];
  const re = new RegExp(`<!--\\s*${marker}:\\s*(\\{[\\s\\S]*?\\})\\s*-->`, 'g');
  for (const m of stripMarkdownCode(text).matchAll(re)) {
    try { anchors.push(JSON.parse(m[1])); }
    catch { anchors.push({ malformed: m[1] }); }
  }
  return anchors;
}

// Every backtick-quoted path inside MAP's table rows (lines starting with '|').
// Cells with prose ("manual (visual)") have no backticks; rule names have no '/';
// paths with spaces are not paths.
//
// Skipped: anything that isn't repo-relative. MAP's "On-disk state" table names
// runtime locations the app writes on a user's machine (`~/.youcoded/config.json`,
// `<project>/.youcoded/artifacts.json`) — resolving those against the workspace root
// would report every one of them missing and drown the real failures. Their drift
// protection is the table's "Defined in" column, which IS a repo path and is checked.
const REPO_RELATIVE = (p) => !/^[~/<]/.test(p);

export function harvestMapPaths(text) {
  const paths = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const p = m[1];
      if (p.includes('/') && !p.includes(' ') && REPO_RELATIVE(p)) paths.add(p);
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

// Claude Code parses rule frontmatter as REAL YAML. `parseRuleFrontmatter` above is
// line-based and much more forgiving, so the two can disagree — and when the strict
// parser throws, the rule loses its `paths:` and Claude Code loads it EAGERLY on
// every session, which is the opposite of what a path-scoped rule is for.
//
// WHY this guard exists, measured 2026-08-31 with .claude/hooks/instructions-log.sh:
// harness-tools.md and native-permissions.md had been loading at turn zero of every
// session for months (four separate sightings, "cause unexplained" in two
// retrospectives). Cause: `contains: "specialist\?: string"` — a regex escape inside
// a DOUBLE-QUOTED YAML scalar. YAML allows only a fixed escape set there, so `\?`,
// `\(`, `\|` are parse errors that take the whole frontmatter down. The audit never
// noticed because its own parser read the paths fine. ~1,400 words rode every
// session, and the eager-token budget under-reported by that much.
//
// The fix at the edit site is a character class — `[?]`, `[(]`, `[|]` — which is
// backslash-free, valid YAML, and the same regex. This stays dependency-free by
// checking exactly that failure class rather than parsing YAML.
const YAML_LEGAL_ESCAPE = /[0abtnvfre "\/\\N_LP\tx]/;   // the escapes YAML allows in "..."
export function yamlUnsafeFrontmatter(rules) {
  const out = [];
  for (const rule of rules) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(rule.text || '');
    if (!fm) continue;
    for (const line of fm[1].split('\n')) {
      for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        for (const esc of m[1].matchAll(/\\(.)/g)) {
          if (!YAML_LEGAL_ESCAPE.test(esc[1])) {
            out.push({
              rule: rule.name, file: rule.file,
              reason: `illegal YAML escape \\${esc[1]} in a double-quoted scalar `
                + `(${line.trim()}) — use a character class like [${esc[1]}] instead; `
                + 'a frontmatter YAML error makes Claude Code load this rule EAGERLY',
            });
          }
        }
      }
    }
  }
  return out;
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
  const abs = path.join(baseFor(root, rel), rel);
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
      // stderr ignored: a missing repo prints "fatal: not a git repository" otherwise
      const out = execFileSync('git', ['-C', dir, 'ls-files'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      for (const f of out.split('\n')) if (f) files.push(prefix + f);
    } catch { /* repo missing (setup.sh not run) — its globs will visibly match nothing */ }
  };
  ls(root, '');
  const base = subRepoRoot(root);
  for (const r of REPOS) {
    if (fs.existsSync(path.join(base, r, '.git'))) ls(path.join(base, r), r + '/');
  }
  return files;
}

export function currentShas(root) {
  const shas = {};
  const get = (name, dir) => {
    try {
      shas[name] = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch { /* leave absent */ }
  };
  get('workspace', root);
  const base = subRepoRoot(root);
  for (const r of REPOS) if (fs.existsSync(path.join(base, r, '.git'))) get(r, path.join(base, r));
  return shas;
}

export function* walkMarkdown(dir, skipDirs = []) {
  if (!fs.existsSync(dir)) return;
  // sorted so anchor ordering (and thus report output) is deterministic across filesystems
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
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
  for (const r of REPOS) dirs[r] = path.join(subRepoRoot(root), r);
  for (const [name, sha] of Object.entries(shas)) {
    const dir = dirs[name];
    if (!dir || !fs.existsSync(path.join(dir, '.git'))) { notes.push(`repo ${name} not found on disk`); continue; }
    const prefix = name === 'workspace' ? '' : name + '/';
    try {
      const out = execFileSync('git', ['-C', dir, 'diff', '--name-only', `${sha}..HEAD`],
        // stderr ignored: an unknown base SHA prints "fatal: bad revision" otherwise
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      for (const f of out.split('\n')) if (f) changed.push(prefix + f);
    } catch {
      notes.push(`repo ${name}: base SHA ${sha} unknown — run /audit full`);
    }
  }
  return { changed, notes };
}

// changed files × rule globs → which subsystems need semantic re-verification,
// plus the files matching NO rule (the "new subsystem without a rule" signal).
// Paths that legitimately match no rule. Counted and reported, never silently
// dropped — the whole point of the "files matching NO rule" signal is that a
// shipped subsystem with no rule shows up in it, and 607 rows of archived
// prototypes is how that signal got ignored.
//
// NOT listed here on purpose: .claude/hooks/**. Those are real, tested code
// (context-inject.test.mjs, glob-guard.test.mjs, both run by CI) and belong in
// the signal.
export const NO_RULE_EXPECTED = [
  /^docs\/archive\//,
  /^docs\/active\/prototypes\//,
  /^scripts\/ast-grep\/fixtures\//,
  /^flappy-bird\//,
];

export function affectedSubsystems(rules, changedFiles) {
  const affected = new Set();
  const covered = new Set();
  for (const f of changedFiles) {
    for (const rule of rules) {
      if (rule.globs.some(g => g.test(f))) { affected.add(rule.name); covered.add(f); }
    }
  }
  const uncoveredAll = changedFiles.filter(f => !covered.has(f));
  const uncovered = uncoveredAll.filter(f => !NO_RULE_EXPECTED.some(re => re.test(f)));
  return {
    affected: [...affected].sort(),
    uncovered,
    uncoveredExpected: uncoveredAll.length - uncovered.length,
  };
}

// A rule glob is "worktree-blind" when it names a sub-repo by its workspace path
// (`youcoded/desktop/...`) and therefore cannot match the same file inside a
// worktree (`worktrees/<name>/desktop/...`).
//
// WHY this exists: CLAUDE.md sends all non-trivial work into worktrees/<name>/,
// and Claude Code matches rule globs relative to the PROJECT ROOT. So on
// 2026-08-31, 115 of 138 glob entries were silently dead for exactly the work the
// workspace mandates. `.claude/rules/code-search.md` had already found the fix (a
// leading `**/`) on 2026-08-05 and nobody generalised it.
//
// MEASURED, not assumed: two scratch rules differing only in glob shape, aimed at
// one file at a worktree-shaped path, in one session — `**/desktop/tests/**`
// loaded and `youcoded/desktop/tests/**` did not. A glob also fires fine on a path
// under the gitignored worktrees/ dir, so the relaxation reaches real worktrees.
//
// SCOPE, so a later reader does not over-trust this: it checks the SHAPE of a glob
// against tracked files using this file's deliberately-simple globToRegex. It
// cannot tell you what Claude Code's matcher actually loaded — that is
// .claude/hooks/instructions-log.sh.
//
// Exemptions are NAMED AND COUNTED, never silent, and there are four kinds. The
// last — an explicit `# repo-pinned` comment — is an ESCAPE HATCH THAT NO RULE
// CURRENTLY USES: `blind` FAILS THE RUN, so a glob that must keep its repo prefix
// needs a way to say so or the audit stays red forever. It is here for the first
// rule that needs it, not for any that exist. (Two drafts of the plan pinned four
// globs believing they needed it; measured, relaxing all four reached one extra
// file in the whole workspace.)
//
// `fix` is the exact replacement string, so the migration has no second table of
// prefixes to drift out of sync with this function.
export function worktreeBlindGlobs(rules, trackedFiles) {
  const blind = [], exempt = [], overmatch = [];
  for (const rule of rules) {
    for (const glob of rule.fm.paths) {
      if (glob === '**') {
        exempt.push({ rule: rule.name, glob, reason: 'the deliberate eager glob' });
        continue;
      }
      const [head, ...rest] = glob.split('/');
      if (head === '**') {
        // Already worktree-safe. Report anything it reaches outside its own repo
        // so a relaxation's blast radius is a visible number, not a surprise.
        const re = globToRegex(glob);
        const hits = trackedFiles.filter(f => re.test(f));
        const repos = new Set(hits.map(f => f.split('/')[0]));
        if (repos.size > 1) {
          const count = r => hits.filter(f => f.startsWith(r + '/')).length;
          const main = [...repos].sort((a, b) => count(b) - count(a))[0];
          overmatch.push({ rule: rule.name, glob, files: hits.filter(f => !f.startsWith(main + '/')) });
        }
        continue;
      }
      if (!REPOS.includes(head)) {
        exempt.push({ rule: rule.name, glob, reason: 'workspace-root path — worktrees are of the sub-repos' });
        continue;
      }
      if (rest.length === 1 && rest[0] === '**') {
        exempt.push({ rule: rule.name, glob, reason: 'whole-repo glob — relaxing it would make the rule eager' });
        continue;
      }
      // An explicit opt-out, read from the rule's own source line.
      const pinned = new RegExp(`^\\s*-\\s*"${glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*#.*repo-pinned`, 'm');
      if (rule.text && pinned.test(rule.text)) {
        exempt.push({ rule: rule.name, glob, reason: 'repo-pinned by an explicit comment in the rule' });
        continue;
      }
      blind.push({ rule: rule.name, glob, fix: ['**', ...rest].join('/') });
    }
  }
  return { blind, exempt, overmatch };
}

// A .claude/rules/ directory inside a sub-repo is never loaded by a session rooted
// at the workspace, so it cannot be reached, cannot be audited from here, and
// silently forks whatever it duplicates.
//
// WHY: youcoded/.claude/rules/android-runtime.md sat at last_verified 2026-04-29
// with no verify: block for four months, diverging in both directions from the
// workspace copy of the same rule. Nothing could have noticed. Confirmed by
// measurement 2026-08-31: Claude Code discovers .claude/rules/ at the PROJECT root,
// so that copy only ever fired for a session rooted inside youcoded/.
export function strayRuleDirs(root) {
  const out = [];
  for (const repo of REPOS) {
    const dir = path.join(subRepoRoot(root), repo, '.claude', 'rules');
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    if (files.length) out.push({ repo, files });
  }
  return out;
}

// ---------- main ----------

const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|kt|kts|java|sh|ps1|sql|toml|gradle)$/;

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const noDiff = args.includes('--no-diff');
  const rootIdx = args.indexOf('--root');
  // Guard the CLI surface: a bad --root or a non-workspace dir must produce one specific
  // error line, not a raw ENOENT stack (workspace error-message standard).
  if (rootIdx !== -1 && (args[rootIdx + 1] === undefined || args[rootIdx + 1].startsWith('--'))) {
    console.error('audit-anchors: --root requires a directory argument (e.g. --root /c/Users/desti/youcoded-dev)');
    process.exit(1);
  }
  const root = rootIdx !== -1
    ? path.resolve(args[rootIdx + 1])
    : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  for (const [what, p] of [
    ['workspace root', root],
    ['rules dir', path.join(root, '.claude', 'rules')],
    ['CLAUDE.md', path.join(root, 'CLAUDE.md')],
  ]) {
    if (!fs.existsSync(p)) {
      console.error(`audit-anchors: ${what} not found at ${p} — is --root pointing at the youcoded-dev workspace?`);
      process.exit(1);
    }
  }

  // Say so when sub-repos come from the main checkout: a worktree audit then checks
  // THIS branch's docs against code that may be older than the branch expects.
  if (subRepoRoot(root) !== root && !asJson) {
    console.log(`note: sub-repos resolved from the main checkout ${subRepoRoot(root)} (this is a worktree)`);
  }
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
    // Parse failures count toward total too, so the summary math stays non-negative
    // (failed ⊆ total) and the failure is visible in the printed ratio.
    if (!fm) {
      result.anchors.total++;
      result.anchors.failed.push({ source: `.claude/rules/${f}`, reason: 'no frontmatter block' });
      continue;
    }
    if (fm.errors.length) {
      // Off-schema frontmatter: don't trust the partial parse (no paths would misclassify
      // the rule as eager; no verify would silently skip its anchors). Fail each error loudly.
      for (const e of fm.errors) {
        result.anchors.total++;
        result.anchors.failed.push({ source: `.claude/rules/${f}`, reason: e });
      }
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
      if (!fs.existsSync(path.join(baseFor(root, p), p))) result.mapPaths.missing.push(p);
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

  // 4b. every rule glob must ALSO match its file inside a worktree — see
  // worktreeBlindGlobs above for why that is not optional in this workspace.
  result.worktreeGlobs = worktreeBlindGlobs(rules, tracked);

  // 4d. no sub-repo may carry its own .claude/rules/ — see strayRuleDirs.
  result.strayRules = strayRuleDirs(root);

  // 4c. frontmatter must survive a STRICT YAML parser — a rule whose frontmatter
  // throws loses its paths: and loads eagerly on every session (see the function).
  result.yamlUnsafe = yamlUnsafeFrontmatter(rules);

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
      const { affected, uncovered, uncoveredExpected } = affectedSubsystems(compiled, changed);
      result.diffScope = {
        baseReport: path.relative(root, report.file).replaceAll('\\', '/'),
        changedCount: changed.length,
        affected,
        uncoveredCode: uncovered.filter(f => CODE_EXT.test(f)),
        uncoveredExpected,
        notes,
      };
    } else {
      result.diffScope = { baseReport: null, notes: ['no prior report with verified_shas — run /audit full'] };
    }
  }

  result.ok = !result.anchors.failed.length && !result.mapPaths.missing.length
    && !result.ruleGlobs.failed.length && !result.budgets.violations.length
    && !result.yamlUnsafe.length && !result.worktreeGlobs.blind.length
    && !(result.strayRules || []).length;

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
  const warn = (label, arr) => {
    if (!arr.length) return;
    console.log(`WARN ${label}:`);
    for (const x of arr) console.log('  ' + (typeof x === 'string' ? x : JSON.stringify(x)));
  };
  dump('anchors', r.anchors.failed);
  dump('MAP paths missing', r.mapPaths.missing);
  dump('rule globs matching nothing', r.ruleGlobs.failed);
  // A FAILURE since 2026-09-02: the one stray fork (youcoded/.claude/rules/android-runtime.md)
  // was deleted in youcoded PR #378, so a sub-repo rules dir can only be a new mistake now.
  dump('rule files in a sub-repo — never loaded from the workspace, and a silent fork (delete it; the workspace rule owns it)',
       (r.strayRules || []).flatMap(x => x.files.map(f => `${x.repo}/.claude/rules/${f}`)));
  dump('worktree-blind rule globs (these never fire on work done in worktrees/)',
       (r.worktreeGlobs?.blind || []).map(x => `${x.rule}: ${x.glob}  ->  ${x.fix}`));
  if (r.worktreeGlobs) {
    console.log(`worktree-safe globs: ${r.worktreeGlobs.blind.length} blind · `
      + `${r.worktreeGlobs.exempt.length} exempt (named) · `
      + `${r.worktreeGlobs.overmatch.length} reaching outside their repo`);
  }
  dump('rule frontmatter a strict YAML parser rejects (these load EAGERLY, every session)',
       (r.yamlUnsafe || []).map(u => `${u.file}: ${u.reason}`));
  dump('budget violations', r.budgets.violations);
  if (r.diffScope) {
    console.log(r.diffScope.baseReport
      ? `diff scope vs ${r.diffScope.baseReport}: ${r.diffScope.changedCount} changed files → `
        + `affected subsystems: ${r.diffScope.affected.join(', ') || '(none)'}`
      : 'diff scope: no base report with verified_shas — run /audit full');
    for (const n of r.diffScope.notes || []) console.log('  note: ' + n);
    if (r.diffScope.uncoveredCode?.length) {
      console.log(`  changed code files matching NO rule (${r.diffScope.uncoveredCode.length}`
        + `, plus ${r.diffScope.uncoveredExpected ?? 0} in archives/prototypes/fixtures — expected):`);
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
