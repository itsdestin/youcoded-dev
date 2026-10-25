import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDomOptions, stressQuery } from '../dom-options.mjs';

test('growth opt-in is restricted to one named desktop surface and exactly 2000 rows', () => {
  assert.equal(parseDomOptions(['--growth', '--only', 'projects/conversations']).growth, true);
  for (const args of [[], ['--only', 'projects/*'], ['--only', 'projects/files'], ['--only', 'projects/conversations', '--rows', '1000'], ['--only', 'projects/conversations', '--width', '639'], ['--only', 'projects/conversations', '--budget', '9000']]) {
    assert.throws(() => parseDomOptions(['--growth', ...args]), /growth/);
  }
});

test('optional growth screenshot requires an absolute PNG destination and the growth lane', () => {
  const base = ['--growth', '--only', 'projects/conversations'];
  assert.equal(parseDomOptions([...base, '--growth-screenshot', '/tmp/reopened.png']).growthScreenshot, '/tmp/reopened.png');
  for (const path of ['relative.png', '/tmp/not-png.jpg']) assert.throws(() => parseDomOptions([...base, '--growth-screenshot', path]), /screenshot/);
  assert.throws(() => parseDomOptions(['--growth-screenshot', '/tmp/reopened.png']), /growth/);
});

test('DOM CLI defaults and effective workload match the fixture without fallback or clamp', () => {
  const opts = parseDomOptions([]);
  assert.equal(opts.rows, 2000); assert.equal(opts.budget, 8000);
  for (const rows of [1, 2000, 20000]) {
    const opt = parseDomOptions(['--rows', String(rows)]);
    const query = stressQuery({ params: { scenario: 'empty', stressRows: '220' } }, opt.rows);
    assert.equal(query.get('scenario'), 'stress');
    assert.equal(Number(query.get('stressRows')), rows);
    assert.equal(Math.min(Math.floor(Number(query.get('stressRows'))), 20000), rows);
  }
});

test('DOM CLI rejects nonfinite, fractional, empty, missing, nonpositive and over-fixture-cap values offline', () => {
  for (const flag of ['--rows', '--budget', '--width', '--height']) {
    for (const value of ['Infinity', 'NaN', '1.5', '', '0', '-1', '1e3', '9007199254740993']) assert.throws(() => parseDomOptions([flag, value]), /integer|value/);
    assert.throws(() => parseDomOptions([flag]), /value/);
    assert.throws(() => parseDomOptions([flag, '--dump']), /value/);
  }
  assert.throws(() => parseDomOptions(['--rows', '20001']), /20000/);
  assert.throws(() => parseDomOptions(['--width', '16385']), /16384/);
  assert.throws(() => parseDomOptions(['--budget', '1000001']), /1000000/);
  assert.throws(() => parseDomOptions(['--typo', '2']), /unknown/);
});
