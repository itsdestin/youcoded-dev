// scripts/ui-review/tests/coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const run = (...dirs) => spawnSync('node', [join(HERE, '..', 'coverage.mjs'), ...dirs], { encoding: 'utf8' }).stdout;
const entry = (name, theme, verified, run) => ({ name, theme, verified, reasons: verified ? [] : ['MISSING x'], run });

test('an older run cannot leave a MISSED row behind once the plan re-ran — even when its manifest landed on disk later', () => {
  // Gap 6 exactly: under load the FIRST sweep's shard finished after the SECOND sweep wrote its manifest,
  // so the newest file on disk carried the stale miss. Run id must decide, not file time.
  const d = join(mkdtempSync(join(tmpdir(), 'cov-')), 'shots-main'); mkdirSync(d);
  const fresh = join(d, 'manifest-new.json'); writeFileSync(fresh, JSON.stringify([entry('home', 'light', true, '200'), entry('settings', 'light', true, '200')]));
  utimesSync(fresh, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  writeFileSync(join(d, 'manifest-old-but-late.json'), JSON.stringify([entry('home', 'light', false, '100'), entry('settings', 'light', true, '100')]));
  assert.match(run(d), /2 covered · 0 partial · 0 missed/);
});

test('a surface only an older run captured is still listed (a crashed shard must not erase it)', () => {
  const d = join(mkdtempSync(join(tmpdir(), 'cov-')), 'shots-main'); mkdirSync(d);
  writeFileSync(join(d, 'manifest-a.json'), JSON.stringify([entry('home', 'light', true, '100'), entry('settings', 'light', false, '100')]));
  writeFileSync(join(d, 'manifest-b.json'), JSON.stringify([entry('home', 'light', true, '200')]));   // the re-run's settings shard died
  const out = run(d);
  assert.match(out, /1 covered · 0 partial · 1 missed/); assert.match(out, /shots-main\/settings \| MISSED/);
});

test('legacy manifests without a run id still merge newest-file-wins', () => {
  const d = join(mkdtempSync(join(tmpdir(), 'cov-')), 'shots-main'); mkdirSync(d);
  const old = join(d, 'manifest-a.json'); writeFileSync(old, JSON.stringify([entry('home', 'light', false, undefined)]));
  utimesSync(old, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  writeFileSync(join(d, 'manifest-b.json'), JSON.stringify([entry('home', 'light', true, undefined)]));
  assert.match(run(d), /1 covered · 0 partial · 0 missed/);
});

test('runs are compared per plan directory, so a re-run of one plan keeps the others', () => {
  const root = mkdtempSync(join(tmpdir(), 'cov-')); const a = join(root, 'shots-main'), b = join(root, 'shots-overlays'); mkdirSync(a); mkdirSync(b);
  writeFileSync(join(a, 'manifest-1.json'), JSON.stringify([entry('home', 'light', true, '100')]));
  writeFileSync(join(b, 'manifest-2.json'), JSON.stringify([entry('menu', 'light', true, '900')]));
  assert.match(run(a, b), /2 covered · 0 partial · 0 missed/);
});
