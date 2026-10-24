// Acceptance A5: a rerun in the same minute must not overwrite an earlier report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishReportJson, uniqueStem } from '../atomic-report.mjs';
import { stemFor } from '../run.mjs';

test('uniqueStem returns the plain stem when free and -2, -3 when json, md or shots already use it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stem-'));
  try {
    const stem = stemFor({ timestamp: '2026-10-21T10:15:00.000Z', sha: 'abcdef1234', label: 'x' });
    assert.equal(stem, '2026-10-21-1015-abcdef1-x');
    assert.equal(uniqueStem(dir, stem), stem);
    publishReportJson(dir, stem, { first: true });
    assert.equal(uniqueStem(dir, stem), `${stem}-2`);
    mkdirSync(join(dir, 'shots', `${stem}-2`), { recursive: true });
    assert.equal(uniqueStem(dir, stem), `${stem}-3`);
    publishReportJson(dir, uniqueStem(dir, stem), { second: true });
    assert.deepEqual(JSON.parse(readFileSync(join(dir, `${stem}.json`), 'utf8')), { first: true }, 'the earlier report is untouched');
    assert.ok(existsSync(join(dir, `${stem}-3.json`)));
    assert.equal(uniqueStem(dir, stem, { extraTaken: (s) => s === `${stem}-4` }), `${stem}-5`, 'a free-looking -4 taken by logs is skipped');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('extraTaken (archived logs) also forces a new suffix', () => {
  assert.equal(uniqueStem('/nonexistent-dir', 's', { exists: () => false, extraTaken: (x) => x === 's' }), 's-2');
});
