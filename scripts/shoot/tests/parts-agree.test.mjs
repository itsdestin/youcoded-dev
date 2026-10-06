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

// "Centres agree" (games-social friction, proposal 7): a name and a pill are different heights
// on purpose, but must share one centre line.
const centres = (children) => [{ row: 'name and pill', centres: true, children }];

test('a pill riding low beside its name is reported (G2-7: "vertical alignment is a bit off")', () => {
  const out = partsFindings(centres([chip('Jake', 0, 20), chip('Online', 4, 16)]));   // centres 10 vs 12
  assert.equal(out.length, 1);
  assert.match(out[0], /not on one centre line/);
  assert.match(out[0], /2px/);
});

test('parts of different heights on one centre line pass', () => {
  assert.deepEqual(partsFindings(centres([chip('Jake', 0, 20), chip('Online', 2, 16), chip('Challenge', -4, 28)])), []);
});

test('a centre 1px off is not a finding', () => {
  assert.deepEqual(partsFindings(centres([chip('Jake', 0, 20), chip('Online', 3, 16)])), []);   // 10 vs 11
});

test('a part that wrapped onto the next line is not compared', () => {
  assert.deepEqual(partsFindings(centres([chip('A very long name', 0, 20), chip('Online', 24, 16)])), []);
});

test('different heights in a centres row are not a height finding', () => {
  const out = partsFindings(centres([chip('Two lines of text', 0, 36), chip('Accept', 4, 28)]));
  assert.deepEqual(out, []);
});
