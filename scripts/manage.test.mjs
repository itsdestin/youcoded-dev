// Tests for scripts/manage.mjs (the live management page's server). Run: node --test scripts/manage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeServer } from './manage.mjs';
import { createCard, loadCards } from './cards.mjs';

async function withServer(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manage-'));
  createCard(root, { title: 'Speed tag', stage: 'planning' });
  createCard(root, { title: 'Cost tag' });
  createCard(root, { title: 'Unrelated' });
  const srv = makeServer(root, { useGit: false });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, root); } finally { srv.close(); }
}
const post = (base, url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('serves the page and the cards', () => withServer(async base => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Big picture/); assert.match(html, /Speed tag/);   // the full page, with Today from the cards
  assert.equal((await fetch(base + '/../../../etc/passwd')).status, 404);
  const j = await (await fetch(base + '/api/cards')).json();
  assert.equal(j.cards.length, 3); assert.equal(j.stages.length, 5);
}));

test('combine, stage and delete change the files and answer with the new list', () => withServer(async (base, root) => {
  let r = await post(base, '/api/combine', { ids: [1, 2], keep: 1, title: 'Model row tags' });
  assert.equal(r.status, 200); assert.equal((await r.json()).cards.length, 2);
  r = await post(base, '/api/stage', { ids: [3], stage: 'build' }); assert.equal(r.status, 200);
  r = await post(base, '/api/delete', { ids: [3] }); assert.equal(r.status, 200);
  assert.deepEqual(loadCards(root).map(c => c.title), ['Model row tags']);
}));

test('a rule break comes back as a plain error and changes nothing', () => withServer(async (base, root) => {
  const before = loadCards(root).map(c => c.stage);
  const r = await post(base, '/api/stage', { ids: [1], stage: 'merged' });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /closes a card/);
  assert.deepEqual(loadCards(root).map(c => c.stage), before);
}));

test('a post from another page is refused', () => withServer(async (base, root) => {
  const r = await post(base, '/api/delete', { ids: [1] }, { origin: 'http://evil.example' });
  assert.equal(r.status, 403); assert.equal(loadCards(root).length, 3);
}));
