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
