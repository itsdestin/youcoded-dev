import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cases, exportSuite } from './suite.mjs';

test('scenario controls stay outside agent fixtures and unsafe fixture paths are refused before export',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yc-suite-controls-'));
 try{
  const scenario={...cases[0],steps:[{kind:'user',text:'inspect'},{kind:'user',text:'continue'}]};
  exportSuite(path.join(root,'scenario'),[scenario],{split:'behavior'});
  const dir=path.join(root,'scenario',scenario.id);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'scenario.json'),'utf8')).steps,scenario.steps);
  assert.equal(fs.existsSync(path.join(dir,'environment','fixtures','scenario.json')),false);
  assert.match(fs.readFileSync(path.join(dir,'task.toml'),'utf8'),/split = "behavior"/);
  assert.throws(()=>exportSuite(path.join(root,'bad'),[{...cases[0],files:{'../escape':'bad'}}]),/path/i);
  assert.equal(fs.existsSync(path.join(root,'bad')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('exports Harbor fixtures with private verifiers and refuses overwrites', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-suite-'));
  try {
    const out = path.join(root, 'suite');
    exportSuite(out);
    assert.equal(cases.length, 3);
    for (const c of cases) {
      const dir = path.join(out, c.id);
      assert.ok(fs.existsSync(path.join(dir, 'instruction.md')));
      assert.ok(fs.existsSync(path.join(dir, 'task.toml')));
      assert.ok(fs.existsSync(path.join(dir, 'tests', 'test.sh')));
      assert.equal(fs.existsSync(path.join(dir, 'environment', 'verify.py')), false);
      const fixture = path.join(dir, 'environment', 'fixtures');
      let result = spawnSync('python3', [path.join(dir, 'tests', 'verify.py'), fixture], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, `${c.id} must reject untouched input`);
      for (const [file, contents] of Object.entries(c.oracle)) fs.writeFileSync(path.join(fixture, file), contents);
      result = spawnSync('python3', [path.join(dir, 'tests', 'verify.py'), fixture], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${c.id}: ${result.stderr}`);
    }
    assert.throws(() => exportSuite(out), /exist/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
