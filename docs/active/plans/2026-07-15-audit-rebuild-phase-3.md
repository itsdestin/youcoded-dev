---
status: active
---

# /audit Rebuild (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drift-prone `/audit` command with a two-layer system — a deterministic anchor-check script (`scripts/audit-anchors.mjs`) that harvests and verifies machine-checkable claims, plus a rebuilt fix-executing `.claude/commands/audit.md` that diff-scopes semantic verification and fixes findings in the same run.

**Architecture:** The script is the mechanical pass: it harvests `verify:` anchors from `.claude/rules/*.md` frontmatter, `<!-- verify: {...} -->` comments from depth docs, and every path in `docs/MAP.md`; checks each against the working tree; enforces the knowledge-mgmt store budgets; and computes diff scope (which subsystems changed since the last audit report's `verified_shas`). The command doc is the process: run the script, fix its failures, dispatch semantic-verification subagents only for diff-affected subsystems, verify the ROADMAP, run the gardening pass, write a dated audit-trail report. The command doc contains **zero subsystem-specific expectations** — claims live in the rules/docs themselves (hardcoded expectations are the exact failure mode that killed /audit v1).

**Tech Stack:** Node ≥18 ESM (`.mjs`, zero dependencies, `node --test` built-in runner), bash-invoked git plumbing (`ls-files`, `diff --name-only`, `rev-parse`), markdown command doc.

**Spec:** `docs/active/specs/2026-07-15-workspace-knowledge-management-design.md` § "`/audit` rebuild (manifest-driven, fix-executing, diff-scoped)". Phases 1–2 already shipped the anchors this consumes: 14 rules with `verify:` blocks, `docs/MAP.md`, ROADMAP.md, `docs/audits/` + `residue:` hook wiring.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/audit-anchors.mjs` (create) | Deterministic harvest + check + diff-scope + budgets. Pure parser functions exported for tests; `main()` guarded by entry check. |
| `scripts/audit-anchors.test.mjs` (create) | `node --test` suite: parsers on inline strings, filesystem checks on `mkdtemp` fixtures. Never touches the real workspace. |
| `.claude/commands/audit.md` (replace) | The fix-executing process doc. Derives scope from rules, never hardcodes claims. |
| `.claude/rules/README.md` (append) | One paragraph pinning the doc-anchor comment convention the harvester reads. |
| `CLAUDE.md` (edit) | "Keeping Documentation Accurate" section reflects the new mechanics. |
| `docs/audits/2026-07-15-phase3-baseline.md` (create, post-merge) | First report with `verified_shas:` frontmatter — seeds diff-scoping. |

**Report frontmatter contract** (the script parses this; the command doc writes it):

```yaml
---
date: YYYY-MM-DD
scope: full | diff-scoped | <subsystem> | baseline (mechanical only)
residue: 0
verified_shas:
  workspace: <full 40-char sha>
  youcoded: <sha>
  youcoded-core: <sha>
  youcoded-admin: <sha>
  wecoded-themes: <sha>
  wecoded-marketplace: <sha>
---
```

**Worktree note:** Tasks 1–6 happen in a workspace-repo worktree: `git worktree add youcoded-dev-worktrees/audit-rebuild -b feat/audit-rebuild` (dir matches the `*-worktree*/` gitignore glob). The worktree has **no sub-repos** (they're gitignored clones), so any real-workspace run of the script must pass `--root C:/Users/desti/youcoded-dev`. **Never run `git worktree remove` with cwd inside the worktree** — cd to the main checkout first.

---

### Task 1: Parser core of `scripts/audit-anchors.mjs`

**Files:**
- Create: `scripts/audit-anchors.mjs`
- Create: `scripts/audit-anchors.test.mjs`

- [ ] **Step 1: Create the worktree**

```bash
cd /c/Users/desti/youcoded-dev
git fetch origin && git pull origin master
git worktree add youcoded-dev-worktrees/audit-rebuild -b feat/audit-rebuild
cd youcoded-dev-worktrees/audit-rebuild
```

- [ ] **Step 2: Write the failing parser tests**

Create `scripts/audit-anchors.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseRuleFrontmatter, harvestDocAnchors, harvestMapPaths,
  globToRegex, countBodyWords,
} from './audit-anchors.mjs';

test('parseRuleFrontmatter: block paths, last_verified, verify with contains', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  - "youcoded/desktop/src/main/sync-spaces/**"
  - youcoded/desktop/src/main/sync-service.ts
last_verified: 2026-07-15
verify:
  - path: a/b.ts
  - path: c/d.ts
    contains: "GIT_DIR"
  - test: tests/e.test.ts
---
body text`);
  assert.deepEqual(fm.paths, [
    'youcoded/desktop/src/main/sync-spaces/**',
    'youcoded/desktop/src/main/sync-service.ts',
  ]);
  assert.equal(fm.last_verified, '2026-07-15');
  assert.deepEqual(fm.verify, [
    { path: 'a/b.ts' },
    { path: 'c/d.ts', contains: 'GIT_DIR' },
    { test: 'tests/e.test.ts' },
  ]);
});

test('parseRuleFrontmatter: eager rule with "**" block entry (live-app-safety shape)', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  - "**"
last_verified: 2026-05-04
---
body`);
  assert.deepEqual(fm.paths, ['**']);
  assert.deepEqual(fm.verify, []);
});

test('parseRuleFrontmatter: contains with spaces, unquoted contains, trailing comments', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  - "a/**"    # trailing comment survives
verify:
  - path: x.ts
    contains: "foo bar baz"
  - path: y.ts
    contains: extractStderr
---
`);
  assert.deepEqual(fm.paths, ['a/**']);
  assert.deepEqual(fm.verify, [
    { path: 'x.ts', contains: 'foo bar baz' },
    { path: 'y.ts', contains: 'extractStderr' },
  ]);
});

test('parseRuleFrontmatter: no frontmatter returns null', () => {
  assert.equal(parseRuleFrontmatter('# just a doc\nno frontmatter'), null);
});

test('harvestDocAnchors: JSON comments, including malformed flagged', () => {
  const anchors = harvestDocAnchors(`Some claim.
<!-- verify: {"path": "youcoded/desktop/src/main/x.ts", "contains": "fooFn"} -->
Another claim. <!-- verify: {"test": "youcoded/desktop/tests/x.test.ts"} -->
Broken: <!-- verify: {not json} -->`);
  assert.deepEqual(anchors[0], { path: 'youcoded/desktop/src/main/x.ts', contains: 'fooFn' });
  assert.deepEqual(anchors[1], { test: 'youcoded/desktop/tests/x.test.ts' });
  assert.equal(anchors[2].malformed, '{not json}');
});

test('harvestMapPaths: backtick paths from table rows only, no prose, no spaces', () => {
  const paths = harvestMapPaths(`# Workspace Map
Prose mentioning \`docs/never-harvested.md\` outside the table.
| Subsystem | Entry points | Rule | Depth doc | Guard tests |
|---|---|---|---|---|
| Chat | \`youcoded/desktop/src/renderer/state/chat-reducer.ts\`<br>\`youcoded/desktop/tests/chat-reducer.test.ts\` | chat-reducer | \`youcoded/docs/chat-reducer.md\` | manual (visual) |
| Android | \`youcoded/app/build.gradle.kts\` | — | \`docs/build-and-release.md\` | \`youcoded/.github/workflows/android-ci.yml\` (assembleReleaseTest) |`);
  assert.deepEqual(paths.sort(), [
    'docs/build-and-release.md',
    'youcoded/.github/workflows/android-ci.yml',
    'youcoded/app/build.gradle.kts',
    'youcoded/desktop/src/renderer/state/chat-reducer.ts',
    'youcoded/desktop/tests/chat-reducer.test.ts',
    'youcoded/docs/chat-reducer.md',
  ].sort());
});

test('globToRegex: ** crosses slashes, * does not', () => {
  assert.ok(globToRegex('a/**').test('a/b/c.ts'));
  assert.ok(!globToRegex('a/**').test('ab/c.ts'));
  assert.ok(globToRegex('a/*.ts').test('a/b.ts'));
  assert.ok(!globToRegex('a/*.ts').test('a/b/c.ts'));
  assert.ok(globToRegex('a/b.ts').test('a/b.ts'));
  assert.ok(!globToRegex('a/b.ts').test('a/bXts'));
});

test('countBodyWords: strips frontmatter before counting', () => {
  assert.equal(countBodyWords('---\npaths:\n  - "a"\n---\none two three'), 3);
  assert.equal(countBodyWords('one two'), 2);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: FAIL — `Cannot find module './audit-anchors.mjs'`

- [ ] **Step 4: Write the parser core**

Create `scripts/audit-anchors.mjs`:

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs
git commit -m "feat(audit): anchor-harvest parsers for the /audit mechanical pass"
```

---

### Task 2: Filesystem checks + budgets

**Files:**
- Modify: `scripts/audit-anchors.mjs` (append)
- Modify: `scripts/audit-anchors.test.mjs` (append)

- [ ] **Step 1: Append the failing checker tests**

Append to `scripts/audit-anchors.test.mjs`:

```js
import { checkAnchor } from './audit-anchors.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anchors-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function fooFn() {}\n');
  return root;
}

test('checkAnchor: path exists / missing', () => {
  const root = makeFixture();
  assert.equal(checkAnchor(root, { path: 'src/a.ts' }).ok, true);
  const miss = checkAnchor(root, { path: 'src/gone.ts' });
  assert.equal(miss.ok, false);
  assert.match(miss.reason, /missing/);
});

test('checkAnchor: contains regex found / not found / invalid', () => {
  const root = makeFixture();
  assert.equal(checkAnchor(root, { path: 'src/a.ts', contains: 'fooFn' }).ok, true);
  assert.equal(checkAnchor(root, { path: 'src/a.ts', contains: 'barFn' }).ok, false);
  const bad = checkAnchor(root, { path: 'src/a.ts', contains: '([unclosed' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /invalid/);
});

test('checkAnchor: test anchors are existence-checked; malformed and empty fail', () => {
  const root = makeFixture();
  assert.equal(checkAnchor(root, { test: 'src/a.ts' }).ok, true);
  assert.equal(checkAnchor(root, { test: 'tests/gone.test.ts' }).ok, false);
  assert.equal(checkAnchor(root, { malformed: '{not json}' }).ok, false);
  assert.equal(checkAnchor(root, {}).ok, false);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: FAIL — `checkAnchor` is not exported

- [ ] **Step 3: Append the checker + git-list + budget functions**

Append to `scripts/audit-anchors.mjs`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: PASS — 11 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs
git commit -m "feat(audit): anchor checker, tracked-file listing, markdown walker"
```

---

### Task 3: Diff scope + CLI assembly + real-workspace integration run

**Files:**
- Modify: `scripts/audit-anchors.mjs` (append)
- Modify: `scripts/audit-anchors.test.mjs` (append)

- [ ] **Step 1: Append the failing diff-scope tests**

Append to `scripts/audit-anchors.test.mjs`:

```js
import { parseReportShas, latestShaReport, affectedSubsystems } from './audit-anchors.mjs';

test('parseReportShas: reads the verified_shas map, tolerates other keys', () => {
  const shas = parseReportShas(`---
date: 2026-07-15
scope: full
residue: 0
verified_shas:
  workspace: f3a6e81aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  wecoded-marketplace: 558608a0000000000000000000000000000000aa
---
# Report`);
  assert.equal(shas.workspace, 'f3a6e81aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(shas['wecoded-marketplace'], '558608a0000000000000000000000000000000aa');
});

test('parseReportShas: null when no verified_shas (e.g. the knowledge-mgmt changelog)', () => {
  assert.equal(parseReportShas('---\nresidue: 0\n---\n# Changelog'), null);
  assert.equal(parseReportShas('# no frontmatter at all'), null);
});

test('latestShaReport: newest dated report that HAS shas wins; sha-less ones skipped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-reports-'));
  fs.mkdirSync(path.join(root, 'docs', 'audits'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'audits', '2026-07-01.md'),
    '---\nresidue: 0\nverified_shas:\n  workspace: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n---\n');
  fs.writeFileSync(path.join(root, 'docs', 'audits', '2026-07-15-changelog.md'),
    '---\nresidue: 0\n---\nno shas here');
  const r = latestShaReport(root);
  assert.match(r.file, /2026-07-01\.md$/);
  assert.equal(r.shas.workspace, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

test('affectedSubsystems: intersects changed files with rule globs; uncovered listed', () => {
  const rules = [
    { name: 'sync-spaces', globs: [globToRegex('youcoded/desktop/src/main/sync-spaces/**')] },
    { name: 'worker-backend', globs: [globToRegex('wecoded-marketplace/worker/**')] },
  ];
  const { affected, uncovered } = affectedSubsystems(rules, [
    'youcoded/desktop/src/main/sync-spaces/engine.ts',
    'youcoded/desktop/src/main/brand-new-subsystem/core.ts',
  ]);
  assert.deepEqual(affected, ['sync-spaces']);
  assert.deepEqual(uncovered, ['youcoded/desktop/src/main/brand-new-subsystem/core.ts']);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: FAIL — `parseReportShas` is not exported

- [ ] **Step 3: Append diff-scope functions and `main()`**

Append to `scripts/audit-anchors.mjs`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: PASS — 15 tests, 0 failures

- [ ] **Step 5: Integration run against the real workspace**

Run (from the worktree — note `--root` pointing at the main checkout, which has the sub-repos):

```bash
node scripts/audit-anchors.mjs --root /c/Users/desti/youcoded-dev
```

Expected: `anchors: ~119/~119 ok · MAP paths: ~45/~45 ok`, eager ≈3–5k tokens, `diff scope: no base report with verified_shas — run /audit full` (the baseline lands in Task 8), exit 0.

**If any anchor/MAP failure appears, it is genuine drift** (Phases 1–2 verified everything on 2026-07-15, so failures mean something moved since). Fix on sight per the working rules — correct the rule/MAP entry after verifying against code, cite the verification in the commit — do NOT weaken the script to make it pass. If a failure looks like a script bug instead (parser missed a valid shape), fix the script and add a regression test.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs
git commit -m "feat(audit): diff-scope vs last report SHAs + CLI for the mechanical pass"
```

---

### Task 4: Pin the doc-anchor convention in `.claude/rules/README.md`

**Files:**
- Modify: `.claude/rules/README.md` (append at end)

- [ ] **Step 1: Append the convention paragraph**

Append to `.claude/rules/README.md` (after the existing body-format paragraph, end of file):

```markdown

## Doc anchors (depth docs)

Depth docs may pin an individual claim with a trailing HTML comment on the line after it:

    The transport sets GIT_DIR explicitly.
    <!-- verify: {"path": "youcoded/desktop/src/main/sync-spaces/git-transport.ts", "contains": "GIT_DIR"} -->

JSON body: `path` (+ optional `contains` regex) or `test`. Harvested and checked by
`scripts/audit-anchors.mjs` (the /audit mechanical pass) from `docs/`, `youcoded/docs/`,
and `wecoded-marketplace/docs/` — `docs/archive/` is never scanned. Use sparingly: anchor
the claims whose silent drift would mislead a session, not every sentence.
```

- [ ] **Step 2: Verify the harvester accepts the example**

Run: `node scripts/audit-anchors.mjs --root /c/Users/desti/youcoded-dev`
Expected: still exit 0. (README.md in rules/ is skipped by the rules loop, and README isn't in DOC_DIRS, so the example itself is never harvested — this run just confirms nothing else broke.)

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/README.md
git commit -m "docs(rules): pin the <!-- verify: --> doc-anchor convention"
```

---

### Task 5: Rebuild `.claude/commands/audit.md`

**Files:**
- Replace entire contents of: `.claude/commands/audit.md`

- [ ] **Step 1: Replace the file with the new process doc**

Full new contents of `.claude/commands/audit.md`:

````markdown
---
description: Fix-executing workspace audit — mechanical anchor pass via scripts/audit-anchors.mjs, diff-scoped semantic re-verification, fixes applied in-run, dated audit-trail report in docs/audits/.
---

# /audit — fix-executing workspace audit

/audit is a maintenance PROCESS, not a report generator. It fixes what it finds in the
same run and leaves the workspace healthier than it found it. Dumping an unactioned
to-do list is a failure mode, not an output. The dated report is an audit TRAIL — what
was verified, what was fixed — plus a near-empty residue of items that genuinely need
Destin's decision.

**Ground truth is the code.** The rules, depth docs, MAP, and ROADMAP are the claims
under test. This command doc deliberately contains NO subsystem-specific expectations —
the claims live in the documents themselves and are harvested at run time. (The old
/audit hardcoded its expectations and became the stalest doc in the workspace.)

## Usage

- `/audit` — diff-scoped (default): the mechanical pass always runs in full; semantic
  re-verification covers only subsystems whose files changed since the last report's
  `verified_shas`.
- `/audit full` — semantic re-verification of every rule + depth doc, and every `test:`
  anchor is RUN, not just existence-checked. Quarterly-ish, or whenever the script notes
  a base SHA is unknown. Diff-scoping can't catch claims that were wrong from the start.
- `/audit <subsystem>` — one subsystem. Names are `.claude/rules/*.md` basenames
  (`/audit sync-spaces`, `/audit chat-reducer`, …) — the list comes from the rules dir,
  never from this doc.

## Process

### 0. Sync

Run `bash setup.sh` from the workspace root. Stale git state invalidates findings.

### 1. Mechanical pass (always full, always first)

```bash
node scripts/audit-anchors.mjs --json
```

Checks, deterministically: every `verify:` anchor in `.claude/rules/*.md` (path exists,
`contains` regex present, test file exists), every `<!-- verify: {...} -->` doc anchor,
every path in `docs/MAP.md`, every rule `paths:` glob still matches ≥1 tracked file, and
the store budgets (rule bodies ≤600 words, PITFALLS ≤2,500 words, eager load ≤10k tokens).
It also emits the diff scope: changed files since the last report's `verified_shas`,
which rules they intersect, and changed code files matching NO rule.

**Every failure is confirmed drift. Fix it now**, before anything else:
- missing path / failed regex → read the code, correct the rule/doc/MAP entry (or the
  anchor, if the invariant moved), commit with the verification cited
- budget violation → trim or migrate content per the taxonomy (rule overflow → its lazy
  doc or a pinning test)
- glob matching nothing → the subsystem moved; update the rule's `paths:` and MAP row

Re-run until exit 0.

### 2. Determine semantic scope

- `/audit full` → all rules. `/audit <name>` → that rule.
- Default → `diffScope.affected` from the script output. If `diffScope.notes` says a base
  SHA is unknown or there's no base report, escalate to full.
- `diffScope.uncoveredCode` (changed code matching no rule) → judge whether a new
  subsystem has formed; if so, draft a new rule + MAP row as part of this run (gardening
  finding, not residue).

### 3. Semantic verification (subagents)

For each in-scope subsystem, dispatch a read-only verification agent (Explore) with:
the full rule text, the depth doc it points to, and this instruction:

> Verify every factual claim in these documents against the current code. For each claim,
> find the code that proves or disproves it and report file:line evidence. Report drift
> only — do not fix anything. Flag claims you could not verify either way.

Run up to 3 in parallel. The agents receive the documents as the claims — never a
paraphrase or a cached expectation.

### 4. Fix, don't report

Work every finding in the same run:
- **Doc/rule/MAP/CLAUDE.md corrections** — fix inline, commit as you go (verify against
  code first; cite the verification in the commit message).
- **Missing pinning tests, rule restructures** — superpowers:subagent-driven-development.
- **Sub-repo code fixes** — normal working rules: worktree, tests, PR. The audit gets no
  bypass.
- **Decision-residue** (privacy copy, LICENSE text, deleting user-created content,
  product-behavior questions) — never auto-edit; goes to the report's `## Residue` with a
  recommendation.
- Drift genuinely unfixable this session → ROADMAP `bug` line tagged `#docs` AND a
  residue entry.

### 5. Roadmap verification

For every open `[ ]` item in `ROADMAP.md`: check whether it already shipped (git log
since its `(added YYYY-MM-DD)` date, or read the code it names). Shipped → flip to `[x]`,
note the commit/PR in the detail line, move to `## Shipped`. Stale `in-progress` tokens
get the same check. Dedup near-identical items (merge detail lines, keep the older date).

### 6. Gardening (the anti-rot pass)

- Budgets: already enforced by the script in step 1; migrate any overflow now.
- `docs/active/` sweep: any doc whose feature merged → `docs/archive/`, status flipped
  to `shipped`/`superseded`. Verify every doc there still has `status:` frontmatter.
- MAP: update rows for renamed/new entry points found in steps 2–3.
- Auto-memory (`~/.claude/projects/C--Users-desti-youcoded-dev/memory/`): delete or
  migrate duplicative/misplaced/drifted entries. Planning content moves to ROADMAP.md —
  memory is the last-resort store.
- Outward-facing docs: diff each repo since the last audit; review README, in-app
  privacy copy, landing-page FAQ, LICENSE, sub-repo CLAUDE.md against what changed.
  README/CLAUDE.md accuracy fixes apply on sight; privacy/license changes are
  decision-residue.

### 7. Report + last_verified

- Update `last_verified:` to today in every rule that was semantically verified (not
  merely mechanically checked).
- Write `docs/audits/YYYY-MM-DD.md` with the frontmatter contract below, a changelog of
  applied fixes (what, where, verification), and `## Residue` listing ONLY items needing
  a human decision — each with a concrete recommendation. Set `residue:` to that count.
  The session-start hook greps `residue:` and the report date every session.
- Commit + push (workspace repo, direct or via worktree per size).

```yaml
---
date: YYYY-MM-DD
scope: full | diff-scoped | <subsystem>
residue: 0
verified_shas:
  workspace: <full sha>
  youcoded: <full sha>
  youcoded-core: <full sha>
  youcoded-admin: <full sha>
  wecoded-themes: <full sha>
  wecoded-marketplace: <full sha>
---
```

Take `verified_shas` from the script's `currentShas` output at the END of the run (after
fixes are committed), so the next diff-scoped run starts from what this run verified.

In full mode, additionally run every `test:` anchor through its repo's runner before
writing the report (e.g. `cd youcoded/desktop && npx vitest run <files>`;
`cd wecoded-marketplace/worker && npm test`). A failing pinned test is drift in the code
or the pin — investigate, don't skip.

## When to run

- Before any release (prevents shipping with stale docs)
- After major refactors touching IPC, reducer, or runtime
- When Claude acts on outdated info or mentions files that don't exist
- `/audit full` quarterly, or when diff-scope notes demand it
- The session-start hook nags when the latest report is >60 days old or has residue
````

- [ ] **Step 2: Verify no stale self-claims**

Run: `grep -n -iE "knowledge-debt|AUDIT\.md|optimistic flag|thinking timeout|three-layer" .claude/commands/audit.md`
Expected: no matches (the old doc's stale expectations are gone).

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/audit.md
git commit -m "feat(audit): rebuild /audit as fix-executing, diff-scoped, anchor-driven"
```

---

### Task 6: Update CLAUDE.md's "Keeping Documentation Accurate" section

**Files:**
- Modify: `CLAUDE.md` (the "## Keeping Documentation Accurate" section)

- [ ] **Step 1: Replace the section's first paragraph**

Old text:

```markdown
This workspace's documentation is self-verifying. Run `/audit` to detect drift between docs and current code — produces a report with concrete fix instructions for each drift item. Scope it (`/audit ipc`, `/audit chat`, etc.) for a specific subsystem or run bare for a full sweep.
```

New text:

```markdown
This workspace's documentation is self-verifying. Run `/audit` — it verifies the machine-checkable anchors (`node scripts/audit-anchors.mjs`: rule `verify:` blocks, doc anchors, MAP paths, store budgets), diff-scopes semantic re-verification to what changed since the last report in `docs/audits/`, and **fixes what it finds in the same run** (the report is an audit trail, not a to-do list). `/audit full` re-verifies everything and runs every pinned test; `/audit <subsystem>` scopes to one rule (names = `.claude/rules/*.md` basenames).
```

The four bullets under it (run before release / after refactors / residue location / hook reminder) stay as they are — still accurate.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md reflects the rebuilt anchor-driven /audit"
```

---

### Task 7: Merge to master

- [ ] **Step 1: Full test run + final script check in the worktree**

```bash
node --test scripts/audit-anchors.test.mjs
node scripts/audit-anchors.mjs --root /c/Users/desti/youcoded-dev
```

Expected: 15 tests pass; mechanical pass exits 0.

- [ ] **Step 2: Merge and push — from the MAIN checkout, never from inside the worktree**

```bash
cd /c/Users/desti/youcoded-dev
git merge --no-ff feat/audit-rebuild -m "Merge feat/audit-rebuild: Phase 3 /audit rebuild (anchor script + fix-executing command)"
git push origin master
```

- [ ] **Step 3: Clean up worktree and branch**

```bash
git worktree remove youcoded-dev-worktrees/audit-rebuild
git branch -D feat/audit-rebuild
git branch --contains HEAD   # sanity: master listed
```

---

### Task 8: Baseline report (seeds diff-scoping) — on master

**Files:**
- Create: `docs/audits/2026-07-15-phase3-baseline.md`

- [ ] **Step 1: Capture current SHAs**

```bash
cd /c/Users/desti/youcoded-dev
node scripts/audit-anchors.mjs --json | python -c "import json,sys; print(json.load(sys.stdin)['currentShas'])"
```

(or read `currentShas` from the `--json` output directly). Expected: 6 repos, full SHAs, and the overall run exits 0.

- [ ] **Step 2: Write the baseline report**

Create `docs/audits/2026-07-15-phase3-baseline.md` (fill each `<sha>` from step 1; adjust the date in filename + frontmatter to the actual run date if it's no longer 2026-07-15 — keep the `-phase3-baseline` suffix, which also keeps it sorting after the same-day knowledge-mgmt changelog):

```markdown
---
date: 2026-07-15
scope: baseline (mechanical only)
residue: 0
verified_shas:
  workspace: <sha>
  youcoded: <sha>
  youcoded-core: <sha>
  youcoded-admin: <sha>
  wecoded-themes: <sha>
  wecoded-marketplace: <sha>
---

# Audit baseline — 2026-07-15

First report under the rebuilt /audit (Phase 3 of the knowledge-management redesign).
Mechanical pass only: all rule `verify:` anchors, MAP paths, rule globs, and store
budgets pass (`node scripts/audit-anchors.mjs` exit 0 at the SHAs above). Semantic
verification is deliberately omitted — Phases 1–2 verified every rule and depth doc
against code on this same date (see `2026-07-15-knowledge-mgmt-changelog.md`).

This report exists to seed diff-scoping: the next `/audit` diffs each repo from the
`verified_shas` above and re-verifies only what changed.
```

- [ ] **Step 3: Verify the hook and the script both pick it up**

```bash
bash .claude/hooks/context-inject.sh | tail -5        # no residue/staleness warning
node scripts/audit-anchors.mjs | tail -5              # diff scope vs the baseline, 0-1 changed files
```

Expected: hook prints no ⚠️ sections; script now reports `diff scope vs docs/audits/2026-07-15-phase3-baseline.md` (the workspace diff will show only this report's own uncommitted file or nothing after commit).

- [ ] **Step 4: Commit + push (single docs file — direct on master is fine)**

```bash
git add docs/audits/2026-07-15-phase3-baseline.md
git commit -m "docs(audit): baseline report with verified_shas — seeds diff-scoped /audit"
git push origin master
```

---

### Task 9: Close out the knowledge-management spec — on master

Phase 3 was the spec's last substantive phase (Phase 4's conventions already live in
CLAUDE.md's lifecycle section; its "periodic archive sweep" is /audit's gardening pass).
Per the lifecycle convention, shipping it archives its documents in the same session.

**Files:**
- Move: `docs/active/specs/2026-07-15-workspace-knowledge-management-design.md` → `docs/archive/specs/`
- Move: `docs/active/plans/2026-07-15-workspace-knowledge-mgmt-phases-1-2.md` → `docs/archive/plans/`
- Move: `docs/active/plans/2026-07-15-audit-rebuild-phase-3.md` → `docs/archive/plans/`
- Modify: `CLAUDE.md` (taxonomy pointer)

- [ ] **Step 1: Flip status frontmatter and move all three docs**

In each of the three files, change `status: active` → `status: shipped` and add a line below it: `shipped: Phase 3 merge (see docs/audits/2026-07-15-phase3-baseline.md)`. Then:

```bash
cd /c/Users/desti/youcoded-dev
git mv docs/active/specs/2026-07-15-workspace-knowledge-management-design.md docs/archive/specs/
git mv docs/active/plans/2026-07-15-workspace-knowledge-mgmt-phases-1-2.md docs/archive/plans/
git mv docs/active/plans/2026-07-15-audit-rebuild-phase-3.md docs/archive/plans/
```

- [ ] **Step 2: Repoint live references**

CLAUDE.md's "Where Knowledge Lives" section says `Full taxonomy: docs/active/specs/2026-07-15-workspace-knowledge-management-design.md` — change `docs/active/specs/` to `docs/archive/specs/` in that line. Then check for other live references:

```bash
grep -rn "active/specs/2026-07-15-workspace-knowledge-management\|active/plans/2026-07-15-workspace-knowledge-mgmt\|active/plans/2026-07-15-audit-rebuild" CLAUDE.md docs/MAP.md docs/PITFALLS.md .claude/ docs/active/ ROADMAP.md
```

Fix any hits the same way (historical mentions inside `docs/archive/` and `docs/audits/` stay as-is — they record where things were at the time).

- [ ] **Step 3: Verify the mechanical pass still passes, commit + push**

```bash
node scripts/audit-anchors.mjs
git add -A
git commit -m "docs: knowledge-mgmt spec + plans shipped and archived; taxonomy pointer follows"
git push origin master
```

Expected: exit 0 before committing; push lands on origin/master.
