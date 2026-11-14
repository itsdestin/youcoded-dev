// Tests for release-lines.mjs: the "what users will notice" lines written when a change lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changeKey, parseLines, loadLines, setLines, setReviewed, LINES_FILE, NOTHING } from './release-lines.mjs';
import { describeChange, changelogDraft } from './release-view.mjs';
import { shippedLines } from './manage.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rel-lines-'));

test('a change is named by its pull request or its commit, in one stored form', () => {
  assert.equal(changeKey('725'), 'youcoded#725');
  assert.equal(changeKey('#725'), 'youcoded#725');
  assert.equal(changeKey('youcoded#725'), 'youcoded#725');
  assert.equal(changeKey('youcoded@0123456789abcdef'), 'youcoded@012345678');
  assert.throws(() => changeKey('the paste fix'), /pull request/);
});

test('lines are saved unread, replace the change\'s earlier lines, and a tick marks them read', () => {
  const root = tmp();
  setLines(root, '725', 'fixes', ['Long messages now send.']);
  setLines(root, '709', 'new', ['The buddy holds your main chat.', 'It comes in two sizes.']);
  setLines(root, '725', 'fixes', ['Long messages now send instead of being cut off.']);
  let rows = loadLines(root);
  assert.deepEqual(rows.filter((r) => r.change === 'youcoded#725').map((r) => r.text), ['Long messages now send instead of being cut off.']);
  assert.ok(rows.every((r) => !r.reviewed));
  assert.equal(setReviewed(root, '709'), 2);
  rows = loadLines(root);
  assert.ok(rows.filter((r) => r.change === 'youcoded#709').every((r) => r.reviewed));
  assert.ok(!rows.find((r) => r.change === 'youcoded#725').reviewed);
  // WHY: the file must stay readable by the same parser after every write
  assert.deepEqual(parseLines(fs.readFileSync(path.join(root, LINES_FILE), 'utf8')), rows);
  assert.throws(() => setReviewed(root, '1'), /no line is written/);
});

test('a change nobody will see is recorded as such, behind the scenes', () => {
  const root = tmp();
  const r = setLines(root, '701', 'new', [], { nothing: true });
  assert.deepEqual([r.group, r.lines], ['behind', [NOTHING]]);
});

test('refusals: no line, four lines, an over-long line, an unknown group', () => {
  const root = tmp();
  assert.throws(() => setLines(root, '1', 'new', []), /one to three/);
  assert.throws(() => setLines(root, '1', 'new', ['a', 'b', 'c', 'd']), /at most three/);
  assert.throws(() => setLines(root, '1', 'new', ['x'.repeat(161)]), /under 160/);
  assert.throws(() => setLines(root, '1', 'shiny', ['a']), /--group/);
});

test('a written line leads the release entry and decides its group; without one the working title is kept', () => {
  const merge = { sha: 'abcdef0123456', subject: 'Merge pull request #725 from itsdestin/session/paste', body: 'Release safety batch (wave 2)' };
  const plain = describeChange(merge, [], []);
  assert.deepEqual([plain.notice, plain.reviewed, plain.key], [[], false, 'youcoded#725']);
  const withLine = describeChange(merge, [], [{ change: 'youcoded#725', group: 'fixes', text: 'Long messages now send.', reviewed: true }]);
  assert.deepEqual([withLine.notice, withLine.group, withLine.reviewed, withLine.text], [['Long messages now send.'], 'fixes', true, 'Release safety batch (wave 2)']);
  // a commit made straight on master has no pull request: it is named by its commit
  assert.equal(describeChange({ sha: 'abcdef0123456', subject: 'Set announcement' }, [], []).key, 'youcoded@abcdef012');
});

test('the changelog draft uses written lines, marks changes that have none, and leaves unseen work out', () => {
  const c = (text, notice = []) => ({ text, notice });
  const { text, missing } = changelogDraft([
    { key: 'new', changes: [c('Buddy rebuild', ['The buddy holds your main chat.', 'It comes in two sizes.']), c('Wave 2 batch')] },
    { key: 'fixes', changes: [c('Paste', ['Long messages now send.'])] },
    { key: 'behind', changes: [c('Bump gradle', [NOTHING]), c('Tests')] },
  ]);
  assert.match(text, /^## \[Unreleased\]\n\n### New and improved\n- The buddy holds your main chat\.\n- It comes in two sizes\.\n- Wave 2 batch \(no user line yet\)\n\n### Fixed\n- Long messages now send\.\n/);
  assert.match(text, /_2 more changes behind the scenes/);
  assert.ok(!text.includes('Bump gradle') && !text.includes(NOTHING));
  assert.equal(missing, 2);
});

test('Big picture\'s Shipped list is read from the dated lines the close command writes', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'shipped.md'), '# Shipped\n\nsome words\n- [x] 2026-11-10 #246 Long paste never sent (itsdestin/youcoded#725 (36d973f))\n- [x] 2026-11-11 #178 Demo chats show a wrong date (youcoded PR #727)\n- [x] an older undated line\n');
  assert.deepEqual(shippedLines(root), [
    { date: '2026-11-11', id: 178, title: 'Demo chats show a wrong date', ref: 'youcoded PR #727' },
    { date: '2026-11-10', id: 246, title: 'Long paste never sent', ref: 'itsdestin/youcoded#725 (36d973f)' },
  ]);
  assert.deepEqual(shippedLines(tmp()), []);
});
