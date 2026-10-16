// A partial re-shoot into an existing run folder keeps the folder's other pictures in its
// manifest (project-switcher friction, proposal 5). Run: node --test scripts/shoot/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeManifest, readManifest } from '../manifest.mjs';

test('a re-shot screen replaces its record; every other picture still on disk is kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shoot-manifest-'));
  try {
    const file = (n) => { const f = join(dir, `${n}.png`); writeFileSync(f, 'x'); return f; };
    const previous = [
      { name: 'projects/switcher', theme: 'midnight', ok: true, file: file('a'), scale: 1.5 },
      { name: 'projects/switcher', theme: 'youcoded', ok: true, file: file('b'), scale: 1.5 },
      { name: 'settings/sync', theme: 'midnight', ok: true, file: file('c'), scale: 1.5 },
      { name: 'settings/gone', theme: 'midnight', ok: true, file: join(dir, 'deleted.png') },
      { name: 'settings/failed', theme: 'midnight', ok: false, reason: 'not showing', file: null },
    ];
    const results = [{ name: 'projects/switcher', theme: 'midnight', ok: true, file: file('a2'), scale: 1.5 }];
    const { records, kept } = mergeManifest(previous, results);
    assert.equal(kept, 2);
    assert.deepEqual(records.map((r) => `${r.name}|${r.theme}|${r.file?.split('/').pop()}`), [
      'projects/switcher|youcoded|b.png', 'settings/sync|midnight|c.png', 'projects/switcher|midnight|a2.png',
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a fresh folder, or an unreadable manifest, gives just this run', () => {
  const results = [{ name: 'a/b', theme: 't', ok: true, file: '/nope.png' }];
  assert.deepEqual(mergeManifest([], results), { records: results, kept: 0 });
  assert.deepEqual(mergeManifest(null, results), { records: results, kept: 0 });
  assert.deepEqual(readManifest('/no/such/manifest.json'), []);
});
