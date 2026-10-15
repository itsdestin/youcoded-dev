// Tests for scripts/cards.mjs. Run: node --test scripts/cards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCard, renderCard, createCard, loadCards, check, neededBy, slug, index } from './cards.mjs';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cards-')); }

test('a card round-trips through render and parse', () => {
  const c = { id: 3, title: 'Agents that run overnight', stage: 'planning', tags: ['agents'], needs: ['1', '2'], body: 'Progress' };
  const back = parseCard(renderCard(c), 'cards/3-agents.md');
  assert.deepEqual(back.errors, []);
  assert.equal(back.title, c.title);
  assert.deepEqual(back.needs, ['1', '2']);
});

test('only the four stages are accepted', () => {
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

test('index lists cards and works with no roadmap folder', () => {
  const root = tmp();
  createCard(root, { title: 'Saved agent setups', stage: 'build' });
  const out = index(root);
  assert.match(out, /#1 \[Agentic buildout\] Saved agent setups/);
  assert.match(out, /Open roadmap entries \(0\)/);
});

test('slug keeps names short and plain', () => {
  assert.equal(slug('Project skills & tools: per-project control of what the assistant uses'), 'project-skills-and-tools-per');
});
