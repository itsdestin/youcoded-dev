// scripts/roadmap-check.test.mjs
// Tests for roadmap-check.mjs. Every fixture-based case copies scripts/fixtures/roadmap/
// into a temp dir and mutates ONE thing, so there is exactly one fixture to keep true.
// Run: node --test scripts/roadmap-check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  SEEN_ON, STATUS, FLAGS, SURFACES, SUBLEVELS, classifyToken, parseMetadata,
  vocabHelp, tokenVocabLine, suggestToken,
} from './roadmap-check.mjs';

test('vocabularies are disjoint — a token can belong to exactly one', () => {
  const all = [...SEEN_ON, ...STATUS, ...FLAGS, ...SURFACES];
  assert.equal(new Set(all).size, all.length);
});

test('classifyToken: one kind per vocabulary, null for strangers', () => {
  assert.equal(classifyToken('settings/sync'), 'surface');
  assert.equal(classifyToken('android'), 'seen-on');
  assert.equal(classifyToken('needs-verify'), 'status');
  assert.equal(classifyToken('checked 2026-08-28'), 'checked');
  assert.equal(classifyToken('urgent'), 'flag');
  assert.equal(classifyToken('v1.3.1'), 'flag');
  assert.equal(classifyToken('v1'), null);
  assert.equal(classifyToken('setings'), null);
});

test('parseMetadata: full line with link', () => {
  const m = parseMetadata('`settings` `android` `needs-verify` `checked 2026-08-28` `v1.3.1` `urgent` → docs/active/investigations/2026-08-28-x.md');
  assert.deepEqual(m.errors, []);
  assert.equal(m.surface, 'settings');
  assert.equal(m.seenOn, 'android');
  assert.equal(m.status, 'needs-verify');
  assert.equal(m.checked, '2026-08-28');
  assert.deepEqual(m.flags, ['urgent']);
  assert.equal(m.release, 'v1.3.1');
  assert.equal(m.link, 'docs/active/investigations/2026-08-28-x.md');
});

test('parseMetadata: minimal line, no surface, no link', () => {
  const m = parseMetadata('`all` `confirmed` `checked 2026-07-01`');
  assert.deepEqual(m.errors, []);
  assert.equal(m.surface, null);
  assert.equal(m.link, null);
});

test('parseMetadata: unknown token is an error, never a surface', () => {
  const m = parseMetadata('`setings` `all` `confirmed` `checked 2026-07-01`');
  assert.equal(m.errors.length, 1);
  assert.match(m.errors[0], /unknown token `setings`/);
});

// The whole point of the 2026-09-03 change: a rejection has to say what IS accepted,
// or the next session goes reading an archived spec to find out.
test('parseMetadata: a rejection spells out every short vocabulary and how to get the surfaces', () => {
  const [err] = parseMetadata('`release-methods` `all` `confirmed` `checked 2026-07-01`').errors;
  for (const v of [...SEEN_ON, ...STATUS, ...FLAGS]) assert.ok(err.includes(v), `rejection omits \`${v}\``);
  assert.match(err, /--vocab/);
  assert.match(err, /v1\.3\.1/);
});

test('parseMetadata: a near-miss token gets a suggestion, a made-up one does not', () => {
  assert.match(parseMetadata('`all` `needs-verif` `checked 2026-07-01`').errors[0], /did you mean `needs-verify`/);
  assert.ok(!/did you mean/.test(parseMetadata('`release-methods` `all` `confirmed` `checked 2026-07-01`').errors[0]));
  assert.equal(suggestToken('settings/sink'), 'settings/sync');
  assert.equal(suggestToken('release-methods'), null);
});

test('parseMetadata: two strangers on one line spell the vocabulary out only once', () => {
  const errs = parseMetadata('`foo` `bar` `all` `confirmed` `checked 2026-07-01`').errors;
  assert.equal(errs.filter(e => e.includes('--vocab')).length, 1);
  assert.match(errs[1], /same vocabulary as above/);
});

test('--vocab prints every closed list, including the sublevels', () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--vocab'], { encoding: 'utf8' });
  for (const v of [...SURFACES, ...SEEN_ON, ...STATUS, ...FLAGS]) assert.ok(out.includes(v), `--vocab omits ${v}`);
  for (const [area, subs] of Object.entries(SUBLEVELS)) {
    assert.ok(out.includes(area));
    for (const sub of subs) assert.ok(out.includes(sub), `--vocab omits sublevel ${sub}`);
  }
});

// Drift guard: ROADMAP.md's "Filing an item" table is the copy a session reads FIRST.
// If it and the validator ever disagree, the table is the one that misleads.
test('ROADMAP.md "Filing an item" lists exactly the vocabularies the validator enforces', () => {
  const md = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ROADMAP.md'), 'utf8');
  const section = md.slice(md.indexOf('## Filing an item'));
  assert.ok(section.length > 0, 'ROADMAP.md has no "## Filing an item" section');
  const row = label => {
    const m = section.split('\n').find(l => l.startsWith(`| ${label} `));
    assert.ok(m, `Filing an item has no \`${label}\` row`);
    return m;
  };
  for (const v of SEEN_ON) assert.ok(row('seen-on').includes(`\`${v}\``), `seen-on row omits ${v}`);
  for (const v of STATUS) assert.ok(row('status').includes(`\`${v}\``), `status row omits ${v}`);
  for (const v of FLAGS) assert.ok(row('flags').includes(`\`${v}\``), `flags row omits ${v}`);
  assert.ok(row('surface').includes('--vocab'), 'surface row must point at --vocab, not list 29 names twice');
  assert.ok(row('checked').includes('checked YYYY-MM-DD'));
  // And the rows must not name a word the validator would reject.
  for (const label of ['seen-on', 'status', 'flags']) {
    for (const tok of [...row(label).matchAll(/`([^`]+)`/g)].map(m => m[1])) {
      assert.ok(classifyToken(tok) !== null, `Filing an item's ${label} row names \`${tok}\`, which classifyToken rejects`);
    }
  }
});

test('tokenVocabLine and vocabHelp are built from the constants, not a hand-typed copy', () => {
  assert.ok(tokenVocabLine().includes(STATUS.join(' · ')));
  assert.ok(vocabHelp().includes(SURFACES.join(' · ')));
});

test('parseMetadata: missing status and missing checked are separate errors', () => {
  const m = parseMetadata('`all`');
  assert.ok(m.errors.some(e => /missing status/.test(e)));
  assert.ok(m.errors.some(e => /missing `checked/.test(e)));
});

test('parseMetadata: out-of-order tokens are an error', () => {
  const m = parseMetadata('`confirmed` `all` `checked 2026-07-01`');
  assert.ok(m.errors.some(e => /out of order/.test(e)));
});

test('parseMetadata: text outside backticks means this is not a metadata line', () => {
  const m = parseMetadata('and it also happens on `android` `confirmed` `checked 2026-07-01`');
  assert.ok(m.errors.some(e => /outside backticks/.test(e)));
});

test('parseMetadata: impossible date is an error', () => {
  const m = parseMetadata('`all` `confirmed` `checked 2026-13-40`');
  assert.ok(m.errors.some(e => /not a real date/.test(e)));
});

import { parseAreaFile, parseIndex, parseShipped, OLD_FORMAT_HEADING } from './roadmap-check.mjs';

const AREA_OK = `# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.
Not here: nothing.

- [ ] Sync dead-ends on any machine without gh — the setup screen shows a spinner
      forever and never says what it is waiting for
      \`settings/sync\` \`desktop\` \`confirmed\` \`checked 2026-08-20\` \`v1.3\` → docs/active/investigations/2026-08-20-sync-gh-missing.md
- [ ] Android says "Synced" while the last push failed
      \`android\` \`needs-verify\` \`checked 2026-06-01\`
`;

test('parseAreaFile: heading, filing test, two entries with sections null', () => {
  const a = parseAreaFile(AREA_OK, 'sync.md');
  assert.deepEqual(a.errors, []);
  assert.equal(a.area, 'sync');
  assert.equal(a.heading, 'moving your stuff between devices');
  assert.equal(a.entries.length, 2);
  const [e1, e2] = a.entries;
  assert.equal(e1.line, 5);
  assert.equal(e1.metaLineNo, 7);
  assert.equal(e1.firstLine, 'Sync dead-ends on any machine without gh — the setup screen shows a spinner');
  assert.match(e1.symptom, /forever and never says/);
  assert.equal(e1.status, 'confirmed');
  assert.equal(e1.release, 'v1.3');
  assert.equal(e1.link, 'docs/active/investigations/2026-08-20-sync-gh-missing.md');
  assert.equal(e1.section, null);
  assert.equal(e2.status, 'needs-verify');
  assert.equal(e2.link, null);
});

test('parseAreaFile: wrong heading shape and missing Filing test are line 1 / line 2 errors', () => {
  const a = parseAreaFile('# sync\nsomething else\n', 'sync.md');
  assert.ok(a.errors.some(e => e.line === 1 && /# <area> — <one line>/.test(e.message)));
  assert.ok(a.errors.some(e => e.line === 2 && /Filing test:/.test(e.message)));
});

test('parseAreaFile: heading naming another area is an error', () => {
  const a = parseAreaFile('# themes — how it looks\nFiling test: x\n', 'sync.md');
  assert.ok(a.errors.some(e => /heading names themes but the file is sync\.md/.test(e.message)));
});

test('parseAreaFile: [x] in an area file is an error and is not an entry', () => {
  const a = parseAreaFile(AREA_OK + '- [x] fixed thing\n      `all` `confirmed` `checked 2026-08-01`\n', 'sync.md');
  assert.ok(a.errors.some(e => /\[x\]/.test(e.message) && /shipped\.md/.test(e.message)));
  assert.equal(a.entries.length, 2);
});

test('parseAreaFile: sublevel headings only where allowed, and only known ones', () => {
  const flat = parseAreaFile('# sync — x\nFiling test: x\n\n## sessions\n', 'sync.md');
  assert.ok(flat.errors.some(e => e.line === 4 && /has no sublevels/.test(e.message)));
  const bad = parseAreaFile('# native-harness — x\nFiling test: x\n\n## turns\n', 'native-harness.md');
  assert.ok(bad.errors.some(e => /unknown sublevel `turns`/.test(e.message)));
  const ok = parseAreaFile('# native-harness — x\nFiling test: x\n\n## tools\n- [ ] Bash output is cut mid-line\n      `all` `confirmed` `checked 2026-08-01`\n', 'native-harness.md');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.entries[0].section, 'tools');
});

test('parseAreaFile: an entry with one line has no metadata line — error carries the entry line', () => {
  const a = parseAreaFile('# sync — x\nFiling test: x\n\n- [ ] just a symptom\n', 'sync.md');
  assert.ok(a.errors.some(e => e.line === 4 && /no metadata line/.test(e.message)));
});

test('parseAreaFile: text after the filing-test block that is not an entry is an error', () => {
  const a = parseAreaFile('# sync — x\nFiling test: x\n\nSome paragraph.\n', 'sync.md');
  assert.ok(a.errors.some(e => e.line === 4 && /stray text/.test(e.message)));
});

const INDEX_OK = `# YouCoded roadmap

## Where the app stands
Prose Destin owns.

## Next release
Target: \`v1.3\`
- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 2 | 1 | 0 | 0 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 1 | 0 | 0 | 0 |

## Filing an item
Pick the file whose Filing test says yes.
`;

test('parseIndex: target, next-release lines, rows with line spans', () => {
  const ix = parseIndex(INDEX_OK);
  assert.deepEqual(ix.errors, []);
  assert.equal(ix.target, 'v1.3');
  assert.deepEqual(ix.nextRelease, ['- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner']);
  assert.equal(ix.nrStart, 7); assert.equal(ix.nrEnd, 7);
  assert.equal(ix.rows.length, 2);
  assert.deepEqual(ix.rows[0], { area: 'sync', heading: 'moving your stuff between devices', open: 2, needsVerify: 1, decisions: 0, parked: 0, line: 12 });
  assert.equal(ix.tableStart, 12); assert.equal(ix.tableEnd, 13);
});

test('parseIndex: missing Target line, entry in the index, closed item in the index', () => {
  const ix = parseIndex(INDEX_OK.replace('Target: `v1.3`\n', '') + '- [ ] filed in the wrong place\n- [x] closed in the wrong place\n');
  assert.ok(ix.errors.some(e => /no `Target:` line/.test(e.message)));
  assert.ok(ix.errors.some(e => /the index holds no entries/.test(e.message) && /docs\/roadmap\/<area>\.md/.test(e.message)));
  assert.ok(ix.errors.some(e => /closed items go to docs\/roadmap\/shipped\.md/.test(e.message)));
});

test('parseIndex: Target must be one release token', () => {
  const ix = parseIndex(INDEX_OK.replace('Target: `v1.3`', 'Target: soon'));
  assert.ok(ix.errors.some(e => /Target: must name one release token/.test(e.message)));
  assert.equal(ix.target, null);
});

const SHIPPED_OK = `# Shipped

- [x] 2026-09-02 sync — Sync no longer dead-ends without gh (youcoded#380)

${OLD_FORMAT_HEADING}
- [x] \`bug\` \`#sync\` **anything at all** — FIXED 2026-08-01
- [ ] this line is under the old-format heading and is skipped
`;

test('parseShipped: new-format lines validated, old-format block skipped entirely', () => {
  assert.deepEqual(parseShipped(SHIPPED_OK).errors, []);
  const bad = parseShipped('# Shipped\n\n- [x] sync fixed it\n- [ ] still open\n');
  assert.ok(bad.errors.some(e => e.line === 3 && /- \[x\] YYYY-MM-DD <area> — <headline>/.test(e.message)));
  assert.ok(bad.errors.some(e => e.line === 4 && /open items do not belong in shipped\.md/.test(e.message)));
});

import { loadRoadmap, checkStructure } from './roadmap-check.mjs';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'roadmap');

// Copies the fixture to a temp dir, marks `youcoded/` as a present repo (a nested .git
// cannot be committed, so it is created here), applies one mutation, returns the root.
function withFixture(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-check-'));
  fs.cpSync(FIXTURE, root, { recursive: true });
  fs.mkdirSync(path.join(root, 'youcoded', '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'youcoded', '.git', 'HEAD'), 'ref: refs/heads/master\n');
  mutate(root);
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const edit = (root, rel, from, to) => { const t = read(root, rel); assert.ok(t.includes(from), `fixture lacks "${from}"`); write(root, rel, t.replace(from, to)); };

test('loadRoadmap: null when docs/roadmap is absent (pre-migration master)', () => {
  const root = withFixture(r => fs.rmSync(path.join(r, 'docs', 'roadmap'), { recursive: true }));
  assert.equal(loadRoadmap(root), null);
});

test('loadRoadmap: areas are the files on disk minus shipped.md, sorted', () => {
  const rm = loadRoadmap(withFixture());
  assert.deepEqual(rm.areas.map(a => a.area), ['native-harness', 'sync']);
  assert.equal(rm.index.target, 'v1.3');
  assert.deepEqual(rm.shipped.errors, []);
});

test('checkStructure: the valid fixture is clean', () => {
  assert.deepEqual(checkStructure(loadRoadmap(withFixture())), []);
});

test('checkStructure: dead link', () => {
  const root = withFixture(r => edit(r, 'docs/roadmap/sync.md', '2026-08-20-sync-gh-missing.md', '2026-08-20-gone.md'));
  const errs = checkStructure(loadRoadmap(root));
  assert.equal(errs.length, 1);
  assert.equal(errs[0].file, 'docs/roadmap/sync.md');
  assert.equal(errs[0].line, 4);
  assert.match(errs[0].message, /link does not resolve: docs\/active\/investigations\/2026-08-20-gone\.md/);
});

test('checkStructure: index row for a file that does not exist, and a file with no row', () => {
  const root = withFixture(r => edit(r, 'ROADMAP.md', '[native-harness](docs/roadmap/native-harness.md)', '[themes](docs/roadmap/themes.md)'));
  const msgs = checkStructure(loadRoadmap(root)).map(e => e.message);
  assert.ok(msgs.some(m => /index row for themes but docs\/roadmap\/themes\.md does not exist/.test(m)));
  assert.ok(msgs.some(m => /docs\/roadmap\/native-harness\.md has no row in the index/.test(m)));
});

test('checkStructure: missing index, missing shipped.md', () => {
  const root = withFixture(r => { fs.rmSync(path.join(r, 'ROADMAP.md')); fs.rmSync(path.join(r, 'docs/roadmap/shipped.md')); });
  const msgs = checkStructure(loadRoadmap(root)).map(e => e.message);
  assert.ok(msgs.some(m => /ROADMAP\.md is missing/.test(m)));
  assert.ok(msgs.some(m => /docs\/roadmap\/shipped\.md is missing/.test(m)));
});

test('checkStructure: area-file and index parse errors carry file and line', () => {
  const root = withFixture(r => {
    edit(r, 'docs/roadmap/sync.md', '`android` `needs-verify`', '`android` `needs-verifyy`');
    edit(r, 'ROADMAP.md', '## Filing an item', '- [ ] stray entry\n\n## Filing an item');
  });
  const errs = checkStructure(loadRoadmap(root));
  assert.ok(errs.some(e => e.file === 'docs/roadmap/sync.md' && e.line === 7 && /unknown token `needs-verifyy`/.test(e.message)));
  assert.ok(errs.some(e => e.file === 'ROADMAP.md' && /holds no entries/.test(e.message)));
});

import { checkClaims, applyClaimFixes, countMatches } from './roadmap-check.mjs';

test('countMatches: number of places the contains regex matches, null without contains', () => {
  const root = withFixture();
  assert.equal(countMatches(root, { path: 'youcoded/desktop/src/main/sync-service.ts', contains: "execFile\\('gh'" }), 1);
  assert.equal(countMatches(root, { path: 'youcoded/desktop/src/main/sync-service.ts', contains: 'e' }) > 1, true);
  assert.equal(countMatches(root, { path: 'youcoded/desktop/src/main/sync-service.ts' }), null);
});

test('checkClaims: the fixture claim holds, one match, no warnings', () => {
  const c = checkClaims(loadRoadmap(withFixture()));
  assert.equal(c.results.length, 1);
  assert.equal(c.results[0].ok, true);
  assert.equal(c.results[0].matches, 1);
  assert.deepEqual(c.warnings, []);
  assert.equal(typeof c.shas, 'object');
});

test('checkClaims: a rotted claim is reported broken with the checkAnchor reason', () => {
  const root = withFixture(r => edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']"));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results[0].ok, false);
  assert.match(c.results[0].reason, /not found in youcoded\/desktop\/src\/main\/sync-service\.ts/);
});

test('checkClaims: a claim matching in two places is a warning', () => {
  const root = withFixture(r => write(r, 'youcoded/desktop/src/main/sync-service.ts', read(r, 'youcoded/desktop/src/main/sync-service.ts').repeat(2)));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results[0].ok, true);
  assert.equal(c.results[0].matches, 2);
  assert.ok(c.warnings.some(w => /matches 2 places/.test(w.message)));
});

test('checkClaims: confirmed entry whose report has no claim anchor is a warning', () => {
  const root = withFixture(r => edit(r, 'docs/active/investigations/2026-08-20-sync-gh-missing.md', '<!-- claim:', '<!-- note:'));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results.length, 0);
  assert.ok(c.warnings.some(w => w.area === 'sync' && w.line === 4 && /confirmed but .* has no claim: anchor/.test(w.message)));
});

test('checkClaims: a claim into a repo that is not on disk is skipped, not broken', () => {
  const root = withFixture(r => fs.rmSync(path.join(r, 'youcoded', '.git'), { recursive: true }));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results[0].skipped, 'repo youcoded not on disk');
  assert.equal(c.results[0].ok, undefined);
});

test('applyClaimFixes: flips exactly the broken confirmed item, leaves checked alone', () => {
  const root = withFixture(r => edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']"));
  const rm = loadRoadmap(root);
  const flipped = applyClaimFixes(rm, checkClaims(rm));
  assert.deepEqual(flipped, [{ area: 'sync', line: 4 }]);
  const after = read(root, 'docs/roadmap/sync.md');
  assert.match(after, /`settings\/sync` `desktop` `needs-verify` `checked 2026-08-20` `v1\.3`/);
  assert.equal((after.match(/needs-verify/g) || []).length, 2);   // the flipped one + the Android one
  // a second run finds nothing left to flip
  const rm2 = loadRoadmap(root);
  assert.deepEqual(applyClaimFixes(rm2, checkClaims(rm2)), []);
});

test('applyClaimFixes: a needs-verify item with a broken claim is only listed', () => {
  const root = withFixture(r => {
    edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']");
    edit(r, 'docs/roadmap/sync.md', '`desktop` `confirmed`', '`desktop` `needs-verify`');
  });
  const rm = loadRoadmap(root);
  const claims = checkClaims(rm);
  assert.equal(claims.results[0].ok, false);
  assert.deepEqual(applyClaimFixes(rm, claims), []);
});

import { symptomPass, expectedIndex, renderRow, diffIndex, rewriteIndex } from './roadmap-check.mjs';

test('symptomPass: decisions always; confirmed/needs-verify older than 60 days; parked never', () => {
  const rm = loadRoadmap(withFixture());
  const sp = symptomPass(rm, '2026-09-01');
  assert.deepEqual(sp.decisions.map(e => e.area), ['native-harness']);
  // Android item checked 2026-06-01 is 92 days old; the confirmed one (08-20) is 12 days old;
  // the parked one (01-15) is 229 days old and must NOT appear.
  assert.deepEqual(sp.stale.map(e => e.firstLine), ['Android says "Synced" while the last push failed']);
  const later = symptomPass(rm, '2026-11-01');
  assert.equal(later.stale.length, 2);
  assert.ok(later.stale.every(e => e.status !== 'parked'));
});

test('symptomPass: exactly 60 days is not stale; 61 is', () => {
  const rm = loadRoadmap(withFixture());
  assert.equal(symptomPass(rm, '2026-07-31').stale.length, 0);   // 06-01 + 60 days
  assert.equal(symptomPass(rm, '2026-08-01').stale.length, 1);
});

test('expectedIndex: counts, headings, order by Open desc then name, next-release from flags', () => {
  const ex = expectedIndex(loadRoadmap(withFixture()));
  assert.deepEqual(ex.rows, [
    { area: 'sync', heading: 'moving your stuff between devices', open: 3, needsVerify: 1, decisions: 0, parked: 1 },
    { area: 'native-harness', heading: "the app's own agent doing work", open: 1, needsVerify: 0, decisions: 1, parked: 0 },
  ]);
  assert.deepEqual(ex.nextRelease, ['- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner']);
  assert.equal(renderRow(ex.rows[0]), '| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 3 | 1 | 0 | 1 |');
});

test('diffIndex: clean fixture has no drift', () => {
  assert.deepEqual(diffIndex(loadRoadmap(withFixture())), []);
});

test('diffIndex: a wrong count, a changed heading, a stale next-release list', () => {
  const root = withFixture(r => {
    edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 2 | 1 | 0 | 1 |');
    edit(r, 'docs/roadmap/native-harness.md', "the app's own agent doing work", 'the native agent');
    edit(r, 'docs/roadmap/sync.md', '`checked 2026-08-20` `v1.3`', '`checked 2026-08-20` `v1.3.1`');
  });
  const msgs = diffIndex(loadRoadmap(root)).map(d => d.message);
  assert.ok(msgs.some(m => /row sync:/.test(m)));
  assert.ok(msgs.some(m => /row native-harness:/.test(m)));
  assert.ok(msgs.some(m => /Next release list/.test(m)));
});

test('rewriteIndex: touches only the table rows and the next-release lines', () => {
  const root = withFixture(r => {
    edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 9 | 9 | 9 | 9 |');
    edit(r, 'docs/roadmap/sync.md', '`checked 2026-08-20` `v1.3`', '`checked 2026-08-20` `v1.3.1`');
  });
  const before = read(root, 'ROADMAP.md');
  const after = rewriteIndex(loadRoadmap(root));
  assert.equal(after.includes('| 9 | 9 | 9 | 9 |'), false);
  assert.ok(after.includes('| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 3 | 1 | 0 | 1 |'));
  assert.equal(after.includes('- sync: Sync dead-ends'), false);   // no v1.3 items any more
  // everything outside those two regions is byte-identical
  const strip = t => t.split('\n').filter(l => !/^\| \[/.test(l) && !/^- /.test(l)).join('\n');
  assert.equal(strip(after), strip(before));
  fs.writeFileSync(path.join(root, 'ROADMAP.md'), after);
  assert.deepEqual(diffIndex(loadRoadmap(root)), []);
});

test('rewriteIndex: an index with no next-release lines yet gets them inserted after Target:', () => {
  const root = withFixture(r => edit(r, 'ROADMAP.md', '- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner\n', ''));
  const after = rewriteIndex(loadRoadmap(root));
  assert.match(after, /Target: `v1\.3`\n- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner\n/);
});

import { spawnSync } from 'node:child_process';
import { run } from './roadmap-check.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'roadmap-check.mjs');
const cli = (root, ...args) => spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

test('run: dormant when docs/roadmap is absent — one line, exit 0', () => {
  const root = withFixture(r => fs.rmSync(path.join(r, 'docs', 'roadmap'), { recursive: true }));
  const r = cli(root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /docs\/roadmap\/ not found .* nothing to check/);
});

test('run: clean fixture — all four sections, exit 0', () => {
  const r = run({ root: withFixture(), today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /### Structure — clean/);
  assert.match(r.text, /### Claims — 1 checked, 0 broken/);
  assert.match(r.text, /### For Destin/);
  assert.match(r.text, /native-harness:6 .*Should Bash keep/);     // decision first
  assert.match(r.text, /sync:7 .*Android says "Synced"/);            // 92 days old
  assert.match(r.text, /### Index — matches the area files/);
});

test('run: structure errors → exit 1, later jobs do not run, --quiet prints only them', () => {
  const root = withFixture(r => edit(r, 'docs/roadmap/sync.md', '`android` `needs-verify`', '`android` `needs-verifyy`'));
  const r = cli(root, '--quiet');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /docs\/roadmap\/sync\.md:7 unknown token `needs-verifyy`/);
  assert.doesNotMatch(r.stdout, /### Claims/);
  assert.doesNotMatch(r.stdout, /For Destin/);
});

test('run: --structure runs job 1 alone', () => {
  const r = run({ root: withFixture(), structureOnly: true, today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /### Structure — clean/);
  assert.doesNotMatch(r.text, /### Claims/);
});

test('run: broken claim is listed with the sha it was checked against, exit 0, no flip without --fix', () => {
  const root = withFixture(r => edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']"));
  const r = run({ root, today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /### Claims — 1 checked, 1 broken/);
  assert.match(r.text, /sync:4 .*not found in youcoded\/desktop\/src\/main\/sync-service\.ts/);
  assert.match(r.text, /checked against: /);   // the temp fixture is not a git repo, so this reads "(no git)"
  assert.match(read(root, 'docs/roadmap/sync.md'), /`desktop` `confirmed`/);
});

test('run: --fix flips the broken claim, rewrites the index, and says what it did', () => {
  const root = withFixture(r => {
    edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']");
    edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 3 | 0 | 0 | 1 |');
  });
  const r = run({ root, fix: true, today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /flipped to needs-verify: sync:4/);
  assert.match(r.text, /index rewritten/);
  assert.match(read(root, 'docs/roadmap/sync.md'), /`desktop` `needs-verify` `checked 2026-08-20`/);
  assert.match(read(root, 'ROADMAP.md'), /\| 3 \| 2 \| 0 \| 1 \|/);   // needs-verify went 1 → 2 after the flip
  assert.deepEqual(diffIndex(loadRoadmap(root)), []);
});

test('run: index drift without --fix is a warning, exit 0', () => {
  const root = withFixture(r => edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 4 | 1 | 0 | 1 |'));
  const r = cli(root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /### Index — drift \(run --fix\)/);
});

test('run: --today is validated; --root needs an argument', () => {
  assert.equal(cli(withFixture(), '--today', 'yesterday').status, 1);
  const r = spawnSync(process.execPath, [SCRIPT, '--root'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--root requires an argument/);
});
