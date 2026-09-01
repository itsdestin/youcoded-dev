import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseRuleFrontmatter, harvestDocAnchors, harvestMapPaths,
  globToRegex, countBodyWords, yamlUnsafeFrontmatter,
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

test('harvestMapPaths: on-disk runtime paths are not resolved against the repo', () => {
  // MAP's "On-disk state" table names locations on the user's MACHINE. Before this
  // skip they were harvested as repo paths and every one reported missing, which
  // would have buried the real failures the checker exists to surface.
  const paths = harvestMapPaths(`| Path | What's in it | Defined in |
|---|---|---|
| \`~/.youcoded/config.json\` | settings | \`youcoded/desktop/src/main/native-home.ts\` |
| \`<project>/.youcoded/artifacts.json\` | file history | \`youcoded/desktop/src/main/artifacts/artifact-store.ts\` |
| \`/opt/YouCoded/resources\` | the installed app | \`docs/build-and-release.md\` |`);
  assert.deepEqual(paths.sort(), [
    'docs/build-and-release.md',
    'youcoded/desktop/src/main/artifacts/artifact-store.ts',
    'youcoded/desktop/src/main/native-home.ts',
  ].sort(), 'only the repo-relative "Defined in" column is checkable');
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

test('harvestDocAnchors: example anchors inside code fences and inline spans are ignored', () => {
  // Regression: docs that TEACH the anchor syntax (plans/specs reproducing source)
  // must not have their example anchors harvested as live claims. Only the raw-prose
  // anchor below is a real claim.
  const anchors = harvestDocAnchors([
    'Prose mentions `<!-- verify: {"path": "inline.ts"} -->` as inline code.',
    '```js',
    'const s = `Broken: <!-- verify: {not json} -->`;',
    '<!-- verify: {"path": "youcoded/desktop/src/main/x.ts", "contains": "fooFn"} -->',
    '```',
    'A real claim. <!-- verify: {"path": "real.ts"} -->',
    '````markdown',
    '<!-- verify: {"test": "fenced.test.ts"} -->',
    '````',
  ].join('\n'));
  assert.deepEqual(anchors, [{ path: 'real.ts' }]);
});

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('parseRuleFrontmatter: inline-flow paths/verify collected as errors (fail-loud)', () => {
  const fm = parseRuleFrontmatter(`---
paths: ["a/**"]
last_verified: 2026-07-15
verify: [{path: gone.ts}]
---
body`);
  assert.equal(fm.errors.length, 2);
  assert.match(fm.errors[0], /off-schema paths/);
  assert.match(fm.errors[1], /off-schema verify/);
  // partial parse yields nothing usable — main() must skip the rule, not trust this
  assert.deepEqual(fm.paths, []);
  assert.deepEqual(fm.verify, []);
});

test('parseRuleFrontmatter: block-form rules have no errors; header comments allowed', () => {
  assert.deepEqual(parseRuleFrontmatter('---\npaths:\n  - "a/**"\n---\n').errors, []);
  // the README schema example puts a trailing # comment on the paths: header itself
  const fm = parseRuleFrontmatter('---\npaths:   # REQUIRED\n  - "a/**"\n---\n');
  assert.deepEqual(fm.errors, []);
  assert.deepEqual(fm.paths, ['a/**']);
});

test('parseRuleFrontmatter: quoted verify path/test values drop the quotes', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  - "a/**"
verify:
  - path: "a b.ts"
  - test: "tests/e.test.ts"
---
`);
  assert.deepEqual(fm.verify, [{ path: 'a b.ts' }, { test: 'tests/e.test.ts' }]);
});

test('main: an off-schema rule fails the whole run loudly (pinning)', () => {
  // Regression pin for the fail-loud guarantee: inline-flow YAML in a rule used to
  // parse as "no paths, no anchors" and exit 0 with every check for that rule skipped.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-badrule-'));
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'minimal fixture workspace');
  fs.writeFileSync(path.join(root, 'docs', 'MAP.md'), '# map\n');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'bad.md'),
    '---\npaths: ["a/**"]\n---\nbody');
  const script = fileURLToPath(new URL('./audit-anchors.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script, '--root', root, '--no-diff'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /off-schema paths/);
  assert.match(r.stdout, /0\/1 ok/); // parse failure counts toward total — no negative math
});

test('main: bad --root value and non-workspace dir produce one clear error, exit 1', () => {
  const script = fileURLToPath(new URL('./audit-anchors.mjs', import.meta.url));
  const noVal = spawnSync(process.execPath, [script, '--root'], { encoding: 'utf8' });
  assert.equal(noVal.status, 1);
  assert.match(noVal.stderr, /--root requires a directory argument/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-notws-'));
  const notWs = spawnSync(process.execPath, [script, '--root', empty], { encoding: 'utf8' });
  assert.equal(notWs.status, 1);
  assert.match(notWs.stderr, /rules dir not found/);
  assert.doesNotMatch(notWs.stderr, /ENOENT/);
});

test('parseRuleFrontmatter: typo-keyed verify item fails loudly, not silently dropped', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  - "a/**"
verify:
  - path: ok.ts
  - file: typo.ts
---
`);
  assert.deepEqual(fm.verify, [{ path: 'ok.ts' }]);
  assert.equal(fm.errors.length, 1);
  assert.match(fm.errors[0], /off-schema verify entry \("- file: typo\.ts"\)/);
});

test('parseRuleFrontmatter: orphaned contains (no preceding item) fails loudly', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  - "a/**"
verify:
  contains: orphaned-no-preceding-item
---
`);
  assert.deepEqual(fm.verify, []);
  assert.equal(fm.errors.length, 1);
  assert.match(fm.errors[0], /off-schema verify entry \("contains: orphaned-no-preceding-item"\)/);
});

test('parseRuleFrontmatter: indented inline-flow under paths fails loudly (no eager misclassification)', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  ["a/**"]
---
`);
  assert.deepEqual(fm.paths, []);
  assert.equal(fm.errors.length, 1);
  assert.match(fm.errors[0], /off-schema paths entry \("\[\"a\/\*\*\"\]"\)/);
});

test('parseRuleFrontmatter: full-line comments inside sections are not errors', () => {
  const fm = parseRuleFrontmatter(`---
paths:
  # a comment between entries
  - "a/**"
verify:
  # another comment
  - path: ok.ts
---
`);
  assert.deepEqual(fm.errors, []);
  assert.deepEqual(fm.paths, ['a/**']);
  assert.deepEqual(fm.verify, [{ path: 'ok.ts' }]);
});


// --- frontmatter must be YAML a STRICT parser accepts -------------------------
// Claude Code parses rule frontmatter as real YAML; parseRuleFrontmatter above is
// line-based and far more forgiving. When the two disagree the rule silently loses
// its paths: and loads EAGERLY on every session — measured 2026-08-31, see the
// function's comment in audit-anchors.mjs.

test('yamlUnsafeFrontmatter: an illegal escape in a double-quoted scalar is reported', () => {
  const bad = [{ name: 'r', file: '.claude/rules/r.md',
    text: '---\npaths:\n  - "a/**"\nverify:\n  - path: x.ts\n    contains: "specialist\\?: string"\n---\n' }];
  const out = yamlUnsafeFrontmatter(bad);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'r');
  assert.match(out[0].reason, /\\\?/);
});

test('yamlUnsafeFrontmatter: a regex written with character classes is fine', () => {
  const ok = [{ name: 'r', file: '.claude/rules/r.md',
    text: '---\npaths:\n  - "a/**"\nverify:\n  - path: x.ts\n    contains: "specialist[?]: string"\n---\n' }];
  assert.deepEqual(yamlUnsafeFrontmatter(ok), []);
});

test('yamlUnsafeFrontmatter: YAML-legal escapes are not flagged', () => {
  const ok = [{ name: 'r', file: '.claude/rules/r.md',
    text: '---\npaths:\n  - "a/**"\nverify:\n  - path: x.ts\n    contains: "a\\\\b\\tc\\"d"\n---\n' }];
  assert.deepEqual(yamlUnsafeFrontmatter(ok), []);
});

test('yamlUnsafeFrontmatter: a backslash OUTSIDE the frontmatter is ignored', () => {
  const ok = [{ name: 'r', file: '.claude/rules/r.md',
    text: '---\npaths:\n  - "a/**"\n---\nBody text with a \\? regex in it.\n' }];
  assert.deepEqual(yamlUnsafeFrontmatter(ok), []);
});


// --- worktree-blind rule globs ------------------------------------------------
import { worktreeBlindGlobs } from './audit-anchors.mjs';

const RULE = (name, paths, text = '') => ({ name, file: `.claude/rules/${name}.md`, fm: { paths }, text });

test('worktreeBlindGlobs: a repo-prefixed glob cannot match the worktree spelling', () => {
  const r = worktreeBlindGlobs(
    [RULE('test-suite-hygiene', ['youcoded/desktop/tests/**/*.test.ts'])],
    ['youcoded/desktop/tests/game-reducer.test.ts'],
  );
  assert.equal(r.blind.length, 1);
  assert.equal(r.blind[0].rule, 'test-suite-hygiene');
  assert.equal(r.blind[0].fix, '**/desktop/tests/**/*.test.ts');
  assert.deepEqual(r.exempt, []);
});

test('worktreeBlindGlobs: a "**/" glob matches both spellings and is not blind', () => {
  const r = worktreeBlindGlobs(
    [RULE('code-search', ['**/desktop/src/main/ipc-handlers.ts'])],
    ['youcoded/desktop/src/main/ipc-handlers.ts'],
  );
  assert.deepEqual(r.blind, []);
  assert.deepEqual(r.exempt, []);
});

test('worktreeBlindGlobs: the deliberate eager glob is exempt, with a reason', () => {
  const r = worktreeBlindGlobs([RULE('live-app-safety', ['**'])], ['anything.ts']);
  assert.deepEqual(r.blind, []);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /eager/);
});

test('worktreeBlindGlobs: a whole-repo glob is exempt — relaxing it would make it eager', () => {
  const r = worktreeBlindGlobs([RULE('registries', ['wecoded-themes/**'])], ['wecoded-themes/a.json']);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /whole-repo/);
});

test('worktreeBlindGlobs: a workspace-root glob is exempt — worktrees are of the SUB-repos', () => {
  const r = worktreeBlindGlobs([RULE('landing-page', ['scripts/ui-review/**'])], ['scripts/ui-review/run.sh']);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /workspace-root/);
});

// The escape hatch. NO RULE USES IT TODAY — it exists because `blind` fails the
// run, so a future glob that must keep its repo prefix needs a way to say so or
// the audit goes permanently red. This test is what keeps the hatch working
// while nothing in the tree exercises it.
test('worktreeBlindGlobs: a "# repo-pinned" glob is exempt, not blind', () => {
  const rule = RULE('some-future-rule', ['youcoded/desktop/only-here/**'],
    '---\npaths:\n  - "youcoded/desktop/only-here/**"   # repo-pinned\n---\n');
  const r = worktreeBlindGlobs([rule], ['youcoded/desktop/only-here/a.ts']);
  assert.deepEqual(r.blind, []);
  assert.equal(r.exempt.length, 1);
  assert.match(r.exempt[0].reason, /repo-pinned/);
});

test('worktreeBlindGlobs: reports what a relaxed glob picks up outside its own repo', () => {
  const r = worktreeBlindGlobs(
    [RULE('android-runtime', ['**/app/**'])],
    ['youcoded/app/src/Main.kt', 'wecoded-marketplace/worker/src/app/routes.ts'],
  );
  assert.deepEqual(r.blind, []);
  assert.equal(r.overmatch.length, 1);
  assert.deepEqual(r.overmatch[0].files, ['wecoded-marketplace/worker/src/app/routes.ts']);
});


// --- a .claude/rules dir inside a sub-repo is unreachable and silently forks ---
import { strayRuleDirs } from './audit-anchors.mjs';

test('strayRuleDirs: a .claude/rules directory inside a sub-repo is reported', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-stray-'));
  fs.mkdirSync(path.join(tmp, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'youcoded', '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'youcoded', '.claude', 'rules', 'x.md'), '---\npaths:\n  - "app/**"\n---\n');
  assert.deepEqual(strayRuleDirs(tmp), [{ repo: 'youcoded', files: ['x.md'] }]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('strayRuleDirs: no sub-repo rule dirs is the clean case', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-stray-'));
  fs.mkdirSync(path.join(tmp, '.claude', 'rules'), { recursive: true });
  assert.deepEqual(strayRuleDirs(tmp), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});


// --- the "no rule covers this" signal must be readable ------------------------

test('affectedSubsystems: archives, prototypes and fixtures are counted as expected-uncovered', () => {
  const rules = [{ name: 'r', globs: [globToRegex('**/desktop/src/**')] }];
  const r = affectedSubsystems(rules, [
    'youcoded/desktop/src/main/x.ts',
    'docs/archive/prototypes/2026-07-22-buddy/main.js',
    'scripts/ast-grep/fixtures/atomic-write.ts',
    'flappy-bird/game.js',
    'youcoded/desktop/src/main/brand-new-subsystem.ts',
  ]);
  assert.deepEqual(r.affected, ['r']);
  assert.equal(r.uncoveredExpected, 3);
  assert.deepEqual(r.uncovered, []);
});

test('affectedSubsystems: a real uncovered code file still shows up', () => {
  const rules = [{ name: 'r', globs: [globToRegex('**/desktop/src/**')] }];
  const r = affectedSubsystems(rules, ['youcoded/app/src/Brand.kt', 'docs/archive/x.md']);
  assert.deepEqual(r.uncovered, ['youcoded/app/src/Brand.kt']);
  assert.equal(r.uncoveredExpected, 1);
});
