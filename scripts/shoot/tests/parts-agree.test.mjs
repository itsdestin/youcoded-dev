// The "parts agree" rules on measured rows (no browser): the two defects they exist for.
// Run: node --test scripts/shoot/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partsFindings } from '../parts-agree.mjs';

const chip = (label, top, height) => ({ label, top, bottom: top + height, height });

test('chips of different heights in one row are reported (detail pages, round 2: "install is tiny")', () => {
  const rows = [{ row: 'detail chips', clips: false, clip: { top: 0, bottom: 22 }, children: [chip('Likely safe', 0, 22), chip('412 installs', 2, 18)] }];
  const out = partsFindings(rows);
  assert.equal(out.length, 1);
  assert.match(out[0], /differ in height/);
});

test('a half-pixel height difference is not a finding', () => {
  const rows = [{ row: 'detail chips', clips: false, clip: { top: 0, bottom: 22 }, children: [chip('a', 0, 22), chip('b', 0, 21.5)] }];
  assert.deepEqual(partsFindings(rows), []);
});

test('a child touching a clipping row\'s edge is reported (round 5: border cut at 1.5×)', () => {
  const rows = [{ row: 'detail chips', clips: true, clip: { top: 10, bottom: 32 }, children: [chip('claude', 10, 22)] }];
  assert.match(partsFindings(rows)[0], /clip edge/);
});

test('the same row with room inside its clip passes', () => {
  const rows = [{ row: 'detail chips', clips: true, clip: { top: 6, bottom: 36 }, children: [chip('claude', 10, 22)] }];
  assert.deepEqual(partsFindings(rows), []);
});

test('a row that does not clip may touch its edges', () => {
  const rows = [{ row: 'detail buttons', clips: false, clip: { top: 10, bottom: 32 }, children: [chip('Install', 10, 22)] }];
  assert.deepEqual(partsFindings(rows), []);
});
