import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireDiskHeadroom } from '../disk-budget.mjs';

test('requires room for the operation without consuming the safety reserve', () => {
  assert.throws(() => requireDiskHeadroom('/fixture', { reserveBytes: 100, additionalBytes: 51,
    statfs: () => ({ bavail: 15, bsize: 10 }) }), /Insufficient disk headroom/);
  const measured = requireDiskHeadroom('/fixture', { reserveBytes: 100, additionalBytes: 50,
    statfs: () => ({ bavail: 15, bsize: 10 }) });
  assert.equal(measured.availableBytes, 150);
  assert.equal(measured.requiredBytes, 150);
});

test('unknown capacity cannot be treated as sufficient capacity', () => {
  assert.throws(() => requireDiskHeadroom('/fixture', { statfs: () => { throw new Error('denied'); } }), /denied/);
  assert.throws(() => requireDiskHeadroom('/fixture', { statfs: () => ({ bavail: NaN, bsize: 10 }) }), /Invalid disk/);
});

test('checks the existing parent when an output directory does not exist yet', () => {
  const visited = [];
  const result = requireDiskHeadroom('/fixture/new', { reserveBytes: 10, additionalBytes: 0, statfs: path => {
    visited.push(path);
    if (visited.length === 1) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { bavail: 100, bsize: 1 };
  } });
  assert.equal(visited.length, 2);
  assert.equal(result.availableBytes, 100);
});

test('invalid budgets fail before reading capacity', () => {
  for (const additionalBytes of [-1, NaN, Infinity]) {
    assert.throws(() => requireDiskHeadroom('/fixture', { additionalBytes, statfs: () => assert.fail('must not inspect') }), /Invalid disk budget/);
  }
});
