// Tests for release-view.mjs: the Work board's "Since the last release" facts.
// Run: node --test scripts/release-view.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseFacts, lastRelease, parseOfficialTag, groupOf, cleanTitle, unreleasedBullets, describeChange } from './release-view.mjs';
import { buildPage } from './manage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'relview-'));

/** A pretend GitHub (bare) plus a working clone with its own origin/master, like the workspace's youcoded/. */
function fixture() {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'master', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'master');
  const merge = (n, branch, title) => { // a merge commit shaped like GitHub's
    git(work, 'commit', '-q', '--allow-empty', '-m', `Merge pull request #${n} from itsdestin/${branch}\n\n${title}`);
  };
  return { root, origin, work, merge };
}

test('the baseline is the highest official tag master contains; betas, no-v tags and tags outside master are ignored', () => {
  const f = fixture();
  git(f.work, 'commit', '-q', '--allow-empty', '-m', 'one'); git(f.work, 'tag', 'v1.2.9');
  git(f.work, 'commit', '-q', '--allow-empty', '-m', 'two'); git(f.work, 'tag', 'v1.3.3'); git(f.work, 'tag', '1.4.0-beta.30'); git(f.work, 'tag', 'v1.4.0-beta.1'); git(f.work, 'tag', '1.9.9');
  git(f.work, 'push', '-q', 'origin', 'master');
  // a newer tag on a side branch master does not contain
  git(f.work, 'checkout', '-q', '-b', 'side'); git(f.work, 'commit', '-q', '--allow-empty', '-m', 'side'); git(f.work, 'tag', 'v2.0.0'); git(f.work, 'checkout', '-q', 'master');
  assert.equal(lastRelease(f.work, 'master'), 'v1.3.3');
  assert.equal(parseOfficialTag('v1.10.0')[1], 10, 'versions compare as numbers, not text');
});

test('a new official tag moves the baseline and the list starts over', () => {
  const f = fixture();
  git(f.work, 'commit', '-q', '--allow-empty', '-m', 'base'); git(f.work, 'tag', 'v1.3.3');
  f.merge(1, 'session/a', 'Say when the microphone hears nothing');
  f.merge(2, 'session/b', 'fix(chat): messages no longer stick');
  git(f.work, 'push', '-q', 'origin', 'master', '--tags');
  git(f.work, 'fetch', '-q');
  let r = releaseFacts(f.work, [], { fetch: false });
  assert.equal(r.ok, true); assert.equal(r.version, 'v1.3.3'); assert.equal(r.count, 2);
  assert.deepEqual(r.groups.map((g) => g.key), ['new', 'fixes']);
  assert.equal(r.groups[0].changes[0].text, 'Say when the microphone hears nothing');
  assert.equal(r.groups[1].changes[0].text, 'Messages no longer stick');
  git(f.work, 'tag', 'v1.4.0'); git(f.work, 'push', '-q', 'origin', '--tags'); git(f.work, 'fetch', '-q');
  r = releaseFacts(f.work, [], { fetch: false });
  assert.equal(r.version, 'v1.4.0'); assert.equal(r.count, 0); assert.deepEqual(r.groups, []);
  f.merge(3, 'session/c', 'Docs: refresh the readme'); git(f.work, 'push', '-q', 'origin', 'master'); git(f.work, 'fetch', '-q');
  r = releaseFacts(f.work, [], { fetch: false });
  assert.equal(r.count, 1); assert.equal(r.groups[0].key, 'behind');
});

test('asking GitHub first finds changes this computer has not fetched, without touching the checkout', () => {
  const f = fixture();
  git(f.work, 'commit', '-q', '--allow-empty', '-m', 'base'); git(f.work, 'tag', 'v1.0.0'); git(f.work, 'push', '-q', 'origin', 'master', '--tags'); git(f.work, 'fetch', '-q');
  // someone else merges and releases on GitHub; the checkout never fetches
  const other = path.join(f.root, 'other'); git(f.root, 'clone', '-q', f.origin, other); git(other, 'checkout', '-q', 'master');
  git(other, 'commit', '-q', '--allow-empty', '-m', 'Merge pull request #7 from itsdestin/session/x\n\nA brand new thing'); git(other, 'tag', 'v1.0.1');
  git(other, 'commit', '-q', '--allow-empty', '-m', 'Merge pull request #8 from itsdestin/session/y\n\nAfter the release'); git(other, 'push', '-q', 'origin', 'master', '--tags');
  const before = git(f.work, 'rev-parse', 'origin/master');
  const stale = releaseFacts(f.work, [], { fetch: false });
  assert.equal(stale.version, 'v1.0.0'); assert.equal(stale.fresh, false);
  const fresh = releaseFacts(f.work, [], { fetch: true, cache: path.join(f.root, 'cache') });
  assert.equal(fresh.fresh, true); assert.equal(fresh.version, 'v1.0.1'); assert.equal(fresh.count, 1);
  assert.equal(fresh.groups[0].changes[0].text, 'After the release');
  assert.equal(git(f.work, 'rev-parse', 'origin/master'), before, 'the shared checkout is never fetched into');
});

test('when GitHub cannot be reached it falls back to the last copy and says so', () => {
  const f = fixture();
  git(f.work, 'commit', '-q', '--allow-empty', '-m', 'base'); git(f.work, 'tag', 'v1.0.0'); git(f.work, 'push', '-q', 'origin', 'master', '--tags'); git(f.work, 'fetch', '-q');
  git(f.work, 'remote', 'set-url', 'origin', path.join(f.root, 'gone.git'));
  const r = releaseFacts(f.work, [], { fetch: true, cache: path.join(f.root, 'cache') });
  assert.equal(r.ok, true); assert.equal(r.fresh, false); assert.equal(r.version, 'v1.0.0');
});

test('an unreadable repo gives an honest empty state, never numbers', () => {
  assert.equal(releaseFacts(path.join(tmp(), 'nope'), []).ok, false);
  assert.match(releaseFacts(null, []).reason, /not on this computer/);
  const f = fixture(); git(f.work, 'commit', '-q', '--allow-empty', '-m', 'x'); git(f.work, 'push', '-q', 'origin', 'master'); git(f.work, 'fetch', '-q');
  const none = releaseFacts(f.work, [], { fetch: false });
  assert.equal(none.ok, false); assert.match(none.reason, /No official release/);
  const nomaster = tmp(); git(nomaster, 'init', '-q');
  assert.match(releaseFacts(nomaster, []).reason, /origin\/master/);
});

test('the page says the facts could not be read instead of drawing a release', () => {
  const root = tmp(); git(root, 'init', '-q'); fs.mkdirSync(path.join(root, 'cards'));
  fs.writeFileSync(path.join(root, 'cards', '1-x.md'), '---\nid: 1\ntitle: X\nstage: planning\n---\nbody\n');
  const page = buildPage(root, { release: { ok: false, reason: 'No official release (a tag like v1.3.3) is on master in the app folder, so there is nothing to compare against.' } });
  assert.match(page, /Since the last release/); assert.match(page, /No official release/); assert.match(page, /Nothing is shown rather than guessing/);
});

test('the page shows the computed version, count, groups and chips', () => {
  const root = tmp(); git(root, 'init', '-q'); fs.mkdirSync(path.join(root, 'cards'));
  fs.writeFileSync(path.join(root, 'cards', '1-x.md'), '---\nid: 1\ntitle: X\nstage: planning\n---\nbody\n');
  const release = { ok: true, version: 'v7.8.9', date: '2026-01-02', count: 2, files: 3, written: [], fresh: true, asOf: '2026-01-03T10:00:00Z',
    groups: [{ key: 'new', title: 'New and improved', hint: 'h', changes: [{ text: 'Shiny thing', detail: 'Plain sentence.', items: [{ id: 1, title: 'X' }] }, { text: 'Other', detail: '', items: [] }] }] };
  const page = buildPage(root, { release });
  for (const want of ['v7.8.9 is the latest release', 'Jan 2', '2 changes would go out', 'Shiny thing', 'Plain sentence.', 'data-card-open="1"', 'New and improved', 'Checked with GitHub']) assert.ok(page.includes(want), want);
  assert.ok(!page.includes('v1.3.0'));
});

test('no release version or change count is typed into the board any more', () => {
  const dir = path.join(HERE, '..', 'pages', 'work-board', 'renderer');
  for (const f of ['build.py', 'release_tab.py', 'tooltips.py']) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/\bv\d+\.\d+\.\d+\b/.test(text), `${f} holds a typed version`);
    assert.ok(!/67 changes|RELEASE\s*=/.test(text), `${f} holds the old typed release`);
  }
});

test('wording helpers', () => {
  assert.equal(cleanTitle('fix(background): commands no longer stay Running (card #40)'), 'Commands no longer stay Running');
  assert.equal(groupOf('Fix three Windows test failures'), 'behind');
  assert.equal(groupOf('Android phone fixes: final review round, Flip test fixes'), 'fixes');
  assert.equal(groupOf('Buddy rebuild: the main chat in the buddy'), 'new');
  assert.equal(groupOf('Bump x', 'dependabot/gradle/x'), 'behind');
  assert.deepEqual(unreleasedBullets('# C\n\n## [Unreleased]\n\n### Chat\n- One thing\n- Two\n\n## [1.3.3] — 2026-10-23\n- old\n'), ['One thing', 'Two']);
  assert.deepEqual(unreleasedBullets('## [Unreleased]\n\n## [1.3.3]\n- old\n'), []);
  const cards = [{ id: 40, title: 'File chip', stage: 'merged', summary: 'Clicking a file chip opens the wrong folder.', work: ['session/40-x'], branch: '' }, { id: 5, title: 'Other', stage: 'planning', work: ['session/40-x'] }];
  const one = describeChange({ subject: 'Merge pull request #705 from itsdestin/session/40-x', body: 'File chips open short paths (card #40)\n' }, [cards[0]]);
  assert.equal(one.text, 'File chips open short paths'); assert.equal(one.detail, 'Clicking a file chip opens the wrong folder.'); assert.deepEqual(one.items, [{ id: 40, title: 'File chip' }]);
  const two = describeChange({ subject: 'Merge pull request #705 from itsdestin/session/40-x', body: 'Title\n' }, cards);
  assert.equal(two.detail, '', 'a batch of items is not described as just one of them'); assert.equal(two.items.length, 2);
  const direct = describeChange({ subject: 'chore: set announcement', body: '' }, []);
  assert.equal(direct.pr, null); assert.equal(direct.group, 'behind');
});
