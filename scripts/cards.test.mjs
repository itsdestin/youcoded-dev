// Tests for scripts/cards.mjs. Run: node --test scripts/cards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCard, renderCard, createCard, loadCards, check, neededBy, slug, index, closeCard, SHIPPED } from './cards.mjs';
import { setStage, deleteCards, combineCards } from './cards.mjs';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cards-')); }

test('a card round-trips through render and parse', () => {
  const c = { id: 3, title: 'Agents that run overnight', stage: 'planning', tags: ['agents'], needs: ['1', '2'], body: 'Progress' };
  const back = parseCard(renderCard(c), 'cards/3-agents.md');
  assert.deepEqual(back.errors, []);
  assert.equal(back.title, c.title);
  assert.deepEqual(back.needs, ['1', '2']);
});

test('only the known stages are accepted', () => {
  const bad = parseCard('---\nid: 1\ntitle: x\nstage: ready\n---\n', 'cards/1-x.md');
  assert.match(bad.errors.join(), /stage "ready"/);
});

test('new cards take the next number and a branch named after them', () => {
  const root = tmp();
  const a = createCard(root, { title: 'A scheduler for agents' }, '2026-10-14');
  const b = createCard(root, { title: 'Agents that run overnight', needs: '1' }, '2026-10-14');
  assert.equal(a, path.join('cards', '1-a-scheduler-for-agents.md'));
  assert.equal(b, path.join('cards', '2-agents-that-run-overnight.md'));
  const cards = loadCards(root);
  assert.deepEqual(check(cards), []);
  assert.deepEqual(neededBy(cards).get('1'), [2]);
  assert.match(fs.readFileSync(path.join(root, b), 'utf8'), /Blocked: waits on #1\./);
});

test('a card that needs a missing card is refused', () => {
  const root = tmp();
  assert.throws(() => createCard(root, { title: 'x', needs: '9' }), /needs 9/);
});

test('check catches a reused id and a needs loop to itself', () => {
  const one = parseCard('---\nid: 1\ntitle: a\nstage: build\nneeds: 1\n---\n', 'cards/1-a.md');
  const dup = parseCard('---\nid: 1\ntitle: b\nstage: build\n---\n', 'cards/1-b.md');
  const errs = check([one, dup]).join('\n');
  assert.match(errs, /also used by/);
  assert.match(errs, /needs itself/);
});

test('index lists cards and nothing about the retired roadmap', () => {
  const root = tmp();
  createCard(root, { title: 'Saved agent setups', stage: 'build' });
  const out = index(root);
  assert.match(out, /#1 \[Agentic buildout\] Saved agent setups/);
  assert.doesNotMatch(out, /roadmap/i);
});

test('slug keeps names short and plain', () => {
  assert.equal(slug('Project skills & tools: per-project control of what the assistant uses'), 'project-skills-and-tools-per');
});

test('exploration items may overlap; planning items may not', () => {
  const root = tmp();
  createCard(root, { title: 'Assistants made of duties' });
  createCard(root, { title: 'Office assistant with duties', related: '1' });
  assert.deepEqual(check(loadCards(root)), []);
  assert.equal(loadCards(root)[0].stage, 'explore');
  const a = parseCard('---\nid: 1\ntitle: a\nstage: planning\n---\n', 'cards/1-a.md');
  const b = parseCard('---\nid: 2\ntitle: b\nstage: planning\nrelated: 1\n---\n', 'cards/2-b.md');
  assert.match(check([a, b]).join(), /consolidate them into one card/);
});

test('close moves a card to merged and adds one shipped line, header included the first time', () => {
  const root = tmp();
  createCard(root, { title: 'Saved agent setups', stage: 'polish' }, '2026-10-14');
  const { file, line } = closeCard(root, '#1', 'youcoded#400', '2026-10-15');
  assert.equal(file, path.join('cards', '1-saved-agent-setups.md'));
  assert.equal(loadCards(root)[0].stage, 'merged');
  assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /Progress\nDone: nothing yet\./);  // free text untouched
  const shipped = fs.readFileSync(path.join(root, SHIPPED), 'utf8');
  assert.match(shipped, /^# Shipped\n/);
  assert.ok(shipped.endsWith('- [x] 2026-10-15 #1 Saved agent setups (youcoded#400)\n'));
  assert.equal(line, '- [x] 2026-10-15 #1 Saved agent setups (youcoded#400)');
});

test('close appends to an existing shipped file and keeps its history', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, SHIPPED), '# Shipped\n\n- [x] 2026-09-01 sync — old line (abc)');  // no trailing newline
  createCard(root, { title: 'A' });
  createCard(root, { title: 'B' });
  closeCard(root, 2, 'abc1234', '2026-10-15');
  assert.equal(fs.readFileSync(path.join(root, SHIPPED), 'utf8'),
    '# Shipped\n\n- [x] 2026-09-01 sync — old line (abc)\n- [x] 2026-10-15 #2 B (abc1234)\n');
  assert.equal(loadCards(root)[0].stage, 'explore');
});

test('close refuses a missing ref, an unknown card and an already-merged card', () => {
  const root = tmp();
  createCard(root, { title: 'A' });
  assert.throws(() => closeCard(root, 1, undefined), /--ref/);
  assert.throws(() => closeCard(root, 9, 'x'), /no card has id 9/);
  closeCard(root, 1, 'x');
  assert.throws(() => closeCard(root, 1, 'y'), /already merged/);
  assert.equal(fs.readFileSync(path.join(root, SHIPPED), 'utf8').match(/#1 /g).length, 1);
});

test('setStage moves several cards and refuses overlapping planning cards, changing nothing', () => {
  const root = tmp();
  createCard(root, { title: 'A' }); createCard(root, { title: 'B', related: '1' }); createCard(root, { title: 'C' });
  setStage(root, [1, 3], 'planning');
  assert.deepEqual(loadCards(root).map(c => c.stage), ['planning', 'explore', 'planning']);
  const before = loadCards(root).map(c => c.stage);
  assert.throws(() => setStage(root, [2], 'planning'), /consolidate/);
  assert.deepEqual(loadCards(root).map(c => c.stage), before);
  assert.throws(() => setStage(root, [1], 'merged'), /closes a card/);
});

test('deleteCards removes cards and the links pointing at them', () => {
  const root = tmp();
  createCard(root, { title: 'A' }); createCard(root, { title: 'B', needs: '1' });
  deleteCards(root, [1]);
  const cards = loadCards(root);
  assert.equal(cards.length, 1); assert.deepEqual(cards[0].needs, []);
  assert.deepEqual(check(cards), []);
});

test('combineCards keeps one, folds the rest in, and repoints links', () => {
  const root = tmp();
  createCard(root, { title: 'Speed tag', tags: 'models', stage: 'planning', priority: 'P2' });
  createCard(root, { title: 'Cost tag', tags: 'pricing', priority: 'P1' });
  createCard(root, { title: 'Needs both', needs: '2' });
  const r = combineCards(root, [1, 2], 1, 'Model row tags');
  assert.deepEqual(r, { kept: 1, merged: [2], stage: 'planning' });
  const cards = loadCards(root);
  assert.equal(cards.length, 2);
  const a = cards.find(c => c.id === 1);
  assert.equal(a.title, 'Model row tags'); assert.equal(a.priority, 'P1');
  assert.deepEqual(a.tags, ['models', 'pricing']);
  assert.match(a.body, /Merged in #2 "Cost tag"/);
  assert.deepEqual(cards.find(c => c.id === 3).needs, ['1']);
  assert.deepEqual(check(cards), []);
});

test('combineCards keeps every branch the folded-in cards were linked to', () => {
  const root = tmp();
  createCard(root, { title: 'A' }); createCard(root, { title: 'B' });
  for (const [id, w] of [[1, 'session/a'], [2, 'session/b, session/a']]) {
    const f = path.join(root, loadCards(root).find(c => c.id === id).file);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n---\n/, `\nwork: ${w}\n---\n`));
  }
  combineCards(root, [1, 2], 1);
  assert.deepEqual(loadCards(root)[0].work, ['session/a', 'session/b']);
});
