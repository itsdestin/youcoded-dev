// Offline: the ladder plan and the per-rung generation options of stall-fixtures.mjs. Uses only dependency-free case kinds (CSV, HTML,
// path list), so it passes with no app checkout or installed packages and from any working directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSV_FULLREAD_BYTES, buildStallFixtures, stallCasePlan } from '../stall-fixtures.mjs';

test('plans: smoke is unchanged (20 cases), stress adds rungs, ladder adds only the CSV full-read file', () => {
  const smoke = stallCasePlan('smoke'), stress = stallCasePlan('stress'), ladder = stallCasePlan('ladder');
  assert.equal(smoke.length, 20); assert.equal(stress.length, 32); assert.equal(ladder.length, 33);
  assert.deepEqual(ladder.filter((c) => !stress.some((s) => s.id === c.id)).map((c) => c.id), ['csv-fullread-5120kib']);
  assert.ok(smoke.every((c) => stress.some((s) => s.id === c.id)));
  assert.equal(new Set(ladder.map((c) => c.id)).size, ladder.length);
  assert.throws(() => stallCasePlan('huge'), /Unknown fixture profile/);
  assert.equal(CSV_FULLREAD_BYTES, 5 * 1024 * 1024);
});

test('only + reuseRoot: separate children can fill one root, collisions are refused, unknown ids and non-empty roots are refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ladder-fx-')), root = join(dir, 'r');
  try {
    const a = await buildStallFixtures(root, { checkout: '/none', profile: 'ladder', only: ['csv-rows-64kib'], reuseRoot: true });
    const b = await buildStallFixtures(root, { checkout: '/none', profile: 'ladder', only: ['path-list-1000', 'html-script-250ms'], reuseRoot: true });
    assert.deepEqual(a.cases.map((c) => c.id), ['csv-rows-64kib']); assert.deepEqual(b.cases.map((c) => c.id), ['html-script-250ms', 'path-list-1000'], 'cases come out in plan order');
    assert.deepEqual((await readdir(root)).sort(), ['csv-rows-64kib.csv', 'html-script-250ms.html', 'path-list-1000.txt']);
    await assert.rejects(buildStallFixtures(root, { checkout: '/none', profile: 'ladder', only: ['csv-rows-64kib'], reuseRoot: true }), /EEXIST/);
    await assert.rejects(buildStallFixtures(root, { checkout: '/none', profile: 'ladder', only: ['csv-rows-64kib'] }), /empty directory/);
    await assert.rejects(buildStallFixtures(join(dir, 'x'), { checkout: '/none', profile: 'ladder', only: ['nope'] }), /Unknown fixture case nope/);
    assert.equal(a.cases[0].sha256, (await buildStallFixtures(join(dir, 'again'), { checkout: '/none', profile: 'smoke', only: ['csv-rows-64kib'] })).cases[0].sha256, 'same bytes whichever profile built it');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('csv-fullread: over the 3 MiB partial-view cap, under the 12 MiB full-read cap; partial view < 2000 rows, whole file > 2000', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ladder-fx-'));
  try {
    const { cases: [c] } = await buildStallFixtures(join(dir, 'r'), { checkout: '/none', profile: 'ladder', only: ['csv-fullread-5120kib'] });
    const EDIT_MAX = 3 * 1024 * 1024, FULL_MAX = 12 * 1024 * 1024;
    assert.ok(c.bytes > EDIT_MAX && c.bytes < FULL_MAX);
    const rowBytes = c.bytes / c.shape.rows;
    assert.ok(EDIT_MAX / rowBytes < 2000, 'first 3 MiB shows no "Large sheet" note'); assert.ok(c.shape.rows > 2000, 'the whole file does');
    assert.equal(c.shape.columns, 4);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
