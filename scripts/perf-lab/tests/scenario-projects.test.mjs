// Unit tests for scenario-projects.mjs — everything checkable without an app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildProjectTree, seedProjectsFixture, medianRun, NUMERIC_PATHS, MEASURES, PNG_1X1,
} from '../scenario-projects.mjs';

test('buildProjectTree is deterministic for a seed and different across seeds', () => {
  const a = buildProjectTree({ files: 200, dirs: 10, seed: 3 });
  const b = buildProjectTree({ files: 200, dirs: 10, seed: 3 });
  const c = buildProjectTree({ files: 200, dirs: 10, seed: 4 });
  assert.deepEqual(a, b, 'same seed must give the same tree — a baseline and a candidate must walk identical files');
  assert.notDeepEqual(a.entries, c.entries);
  assert.equal(a.entries.length, 200);
  assert.equal(a.folders.length, 10);
});

test('the tree stays under the app\'s 2,000-file discovery cap by default and mixes every preview kind', () => {
  const t = buildProjectTree();
  assert.ok(t.entries.length < 2000, 'default size must sit under MAX_FILES so the count is exact, not truncated');
  const kinds = new Set(t.entries.map((e) => e.kind));
  for (const k of ['ts', 'md', 'html', 'png', 'json']) assert.ok(kinds.has(k), `no ${k} files — that preview path would go unmeasured`);
  // Top-level files exist so the FIRST folder-view screen has file cards (previews).
  assert.ok(t.entries.some((e) => !e.rel.includes('/')), 'no top-level files');
  // Every folder path is depth 2 (area/sub), under the discovery depth cap of 6.
  for (const f of t.folders) assert.equal(f.split('/').length, 2, `${f} is not area/sub`);
});

test('seedProjectsFixture writes the tree and lists both projects in youcoded-folders.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'perf-lab-projects-'));
  try {
    const home = join(root, 'home');
    const fixture = { home, projects: { alpha: join(home, 'projects', 'alpha') } };
    const seeded = seedProjectsFixture(fixture, { files: 60, dirs: 6, topLevel: 5, seed: 1 });
    assert.equal(seeded.files, 60);
    assert.ok(seeded.bytes > 0);
    const folders = JSON.parse(readFileSync(join(home, '.claude', 'youcoded-folders.json'), 'utf8'));
    assert.ok(Array.isArray(folders), 'saved-folders.ts reads a bare JSON array');
    assert.deepEqual(folders.map((f) => f.nickname), ['gamma', 'alpha']);
    assert.equal(folders[0].path, seeded.root);
    // A png card must be a REAL image so the read-binary -> Blob path runs.
    const png = buildProjectTree({ files: 60, dirs: 6, topLevel: 5, seed: 1 }).entries.find((e) => e.kind === 'png');
    assert.ok(png, 'fixture has no png');
    assert.equal(statSync(join(seeded.root, png.rel)).size, PNG_1X1.length);
    assert.ok(existsSync(join(seeded.root, 'main')), 'area folders were not created');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('medianRun keeps a never-measured metric null rather than 0', () => {
  // Three runs so the median is a sample, not a convention about even counts.
  const runs = [
    { open: { openMs: 100, countsMs: 300 }, search: { firstKeyMs: null }, ipcSumOfSteps: { pings: 10, totalStallMs: 5, maxMs: 50, over250ms: 0 } },
    { open: { openMs: 120, countsMs: 280 }, search: { firstKeyMs: null }, ipcSumOfSteps: { pings: 12, totalStallMs: 7, maxMs: 60, over250ms: 0 } },
    { open: { openMs: 110, countsMs: 290 }, search: { firstKeyMs: null }, ipcSumOfSteps: { pings: 11, totalStallMs: 6, maxMs: 55, over250ms: 0 } },
  ];
  const m = medianRun(runs);
  assert.equal(m.open.openMs, 110);
  assert.equal(m.search.firstKeyMs, null, 'a step that never measured must not read as instant');
  assert.equal(m.scrollFlat.longtaskTotalMs, null);
  for (const p of NUMERIC_PATHS) {
    const v = p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), m);
    assert.ok(v === null || typeof v === 'number', `${p} is neither null nor a number`);
  }
});

test('MEASURES says what the scenario cannot see', () => {
  assert.equal(MEASURES.scenario, 'projects');
  assert.ok(MEASURES.question.endsWith('?'));
  assert.ok(MEASURES.blindTo.some((b) => /GPU|blur/.test(b)), 'the per-card backdrop blur cannot be measured under llvmpipe and the descriptor must say so');
});
