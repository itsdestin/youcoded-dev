import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportSuite } from './suite.mjs';
import { efficiencyCases } from './efficiency-cases.mjs';

test('audit-derived coherent-work cases reject untouched and damaged fixtures, accept completed work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-efficiency-'));
  try {
    exportSuite(path.join(root, 'tasks'), efficiencyCases);
    for (const c of efficiencyCases) {
      const dir = path.join(root, 'tasks', c.id);
      const fixture = path.join(dir, 'environment', 'fixtures');
      const check = () => spawnSync('python3', [path.join(dir, 'tests', 'verify.py'), fixture], { encoding: 'utf8' });
      assert.notEqual(check().status, 0, `${c.id} must reject unfinished work`);
      for (const [file, contents] of Object.entries(c.oracle)) fs.writeFileSync(path.join(fixture, file), contents);
      const good = check();
      assert.equal(good.status, 0, `${c.id}: ${good.stderr}`);
      fs.writeFileSync(path.join(fixture, 'unrelated.txt'), 'overwritten');
      assert.notEqual(check().status, 0, `${c.id} must protect unrelated work`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
