"""Actual unprivileged sandbox controls, never submitted JS on the host."""
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch

import comparison_tasks as tasks
import comparison_reference as refs
from bwrap_executor import BwrapExecutor
from external_verification import VERSION, verify
from secure_evaluation import optimum

HERE=Path(__file__).resolve().parent

class SandboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'root';self.root.mkdir()
        self.executor=BwrapExecutor(timeout=3)
    def js(self,code,**kw):return self.executor.run(self.root,argv=['-e',code],**kw)
    def test_external_isolation_and_process_creation_denial(self):
        code=r'''const fs=require('fs'),cp=require('child_process');
const assert=require('assert/strict');
for(const p of ['/home/destin','/var/run/docker.sock','/tests','/proc/1/root/home/destin'])assert.equal(fs.existsSync(p),false);
assert.deepEqual(Object.keys(process.env).sort(),['HOME','NODE_NO_WARNINGS','PATH','PWD']);
for(const p of ['/work/x','/adapter/x','/inputs/x','/dev/evil','/evil','/proc/sys/kernel/hostname'])assert.throws(()=>fs.writeFileSync(p,'bad'));
const child=cp.spawnSync('/usr/bin/node',['-e','console.log(1)']);assert.ok(child.error);
const net=require('net');const s=net.connect({host:'1.1.1.1',port:80});s.on('error',()=>{console.log('ISOLATED');});'''
        result=self.js(code)
        self.assertEqual(result['status'],0,result['stderr']);self.assertEqual(result['stdout'],b'ISOLATED\n')
    def test_deadline_output_flood_memory_and_file_bounds(self):
        with self.assertRaisesRegex(ValueError,'deadline'):self.js('while(true){}',deadline=time.monotonic()+.5)
        with self.assertRaisesRegex(ValueError,'output bound'):self.js("const fs=require('fs');while(true)fs.writeSync(1,'x'.repeat(8192));")
        with self.assertRaisesRegex(ValueError,'entry limit'):self.js("const fs=require('fs');for(let i=0;i<500;i++)fs.writeFileSync('/output/'+i,'x');")
        with self.assertRaisesRegex(ValueError,'size limit'):self.js("const fs=require('fs');for(let i=0;i<4;i++)fs.writeFileSync('/output/'+i,Buffer.alloc(1048576));")
        result=self.js("const a=[];while(true)a.push(new Uint8Array(64*1024*1024));")
        self.assertNotEqual(result['status'],0)
    def test_oversize_input_rejected_before_launch(self):
        with (self.root/'large').open('wb') as f:f.truncate(129*1024*1024)
        with patch('bwrap_executor.subprocess.Popen',side_effect=AssertionError('must preflight before launch')):
            with self.assertRaisesRegex(ValueError,'size limit'):self.js('console.log(1)')
        self.assertEqual(self.executor.evidence,[])
    def test_closed_streams_and_unread_stdin_cannot_evade_deadline_cleanup(self):
        import subprocess
        owned=[];real=subprocess.Popen
        def spawn(*args,**kwargs):
            child=real(*args,**kwargs);owned.append(child);return child
        with patch('bwrap_executor.subprocess.Popen',side_effect=spawn):
            with self.assertRaisesRegex(ValueError,'deadline'):
                self.js("const fs=require('fs');fs.closeSync(1);fs.closeSync(2);while(true){}",request={'large':'x'*200000},deadline=time.monotonic()+.5)
        self.assertEqual(len(owned),1)
        self.assertIsNotNone(owned[0].poll(),'new test-owned sandbox process was not reaped')
    def test_tmpfs_is_bounded_and_symlink_output_is_rejected(self):
        result=self.js("const fs=require('fs');try{for(let i=0;i<30;i++)fs.writeFileSync('/tmp/'+i,Buffer.alloc(1048576));process.exit(3);}catch(e){if(e.code!=='ENOSPC')throw e;}")
        self.assertEqual(result['status'],0,result['stderr'])
        with self.assertRaisesRegex(ValueError,'symlink'):self.js("require('fs').symlinkSync('/proc/1/root','/output/escape')")

class FunctionalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='yc-v2-tests-');cls.base=Path(cls.tmp.name)
        cls.origin=cls.base/'source'
        tasks.snapshot(HERE.parents[1]/'youcoded',cls.origin)
        # Real pinned entry points and their dependency closure, without padding
        # every per-case isolated invocation with unrelated renderer sources.
        cls.original=cls.base/'original';cls.original.mkdir()
        selected=['desktop/src/main/update-manifest-verify.ts','desktop/src/main/update-signing-key.ts','desktop/src/main/update-release-status.ts','desktop/src/main/harness/context-settings-store.ts','desktop/src/main/providers/cloud-context.ts','desktop/src/shared/context-preferences.ts','desktop/src/shared/types.ts','desktop/src/shared/model-metadata.ts','desktop/scripts/generate-release-manifest.mjs']
        for name in selected:
            if (cls.origin/name).exists():
                p=cls.original/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cls.origin/name,p)
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    def fixture(self,task):
        root=self.base/('attempt-'+str(time.monotonic_ns()));shutil.copytree(self.original,root)
        tasks.fixture(root,task,contract_version=VERSION);baseline=tasks.hashes(root)
        if task!=tasks.IDS[2]:refs.apply(root,task)
        else:
            refs.write(root,'submission/planner.cjs',refs.PLANNER);refs.write(root,'submission/test.cjs',refs.TEST_C)
            refs.write(root,'submission/README.md','Frozen source enumeration; run node submission/test.cjs.')
            docs=[dict(document=n,quote=tasks.CORPUS[n]['body']) for n in ('catalog-current','billing-current','runtime-current','deprecation')]
            refs.write(root,'submission/evidence.json',json.dumps(docs));refs.write(root,'submission/plan.json',json.dumps(optimum(tasks.WORKLOAD)))
            receipts=[]
            for action in ('search','fetch'):
                receipts.append(dict(action=action,track='synthetic-controlled-retrieval-v1',query='catalog-current',results=[dict(id='catalog-current',bodySha256=tasks.sha(tasks.CORPUS['catalog-current']['body'].encode()))]))
            refs.write(root,'research-receipts.jsonl','\n'.join(json.dumps(r) for r in receipts)+'\n')
        return root,baseline
    def check(self,root,task,baseline):
        return tasks.verify_against(root,task,baseline,self.original,executor=BwrapExecutor(),backend='bwrap',contract_version=VERSION,deadline=time.monotonic()+120)
    def test_real_references_alternatives_unchanged_and_source_mutations(self):
        for task in tasks.IDS:
            with self.subTest(task=task):
                root,baseline=self.fixture(task)
                result=self.check(root,task,baseline);self.assertTrue(result['passed'],result)
                self.assertGreater(result['completedChecks'],15);self.assertFalse(result['matrixQualified'])
                # Independently written equivalent implementation choices.
                if task==tasks.IDS[0]:
                    p=root/'desktop/src/shared/release-validation.mts';p.write_text(p.read_text().replace('a.name<b.name?-1:a.name>b.name?1:0','a.name===b.name?0:(a.name>b.name?1:-1)'))
                elif task==tasks.IDS[1]:
                    p=root/'desktop/src/shared/context-migration.mts';p.write_text(p.read_text().replace("p.openrouter==='long'","['long'].includes(p.openrouter as string)"))
                else:
                    p=root/'submission/planner.cjs';p.write_text(p.read_text().replace('for(let n=0;n<=cap;n++)','for(let n=cap;n>=0;n--)'))
                self.assertTrue((r:=self.check(root,task,baseline))['passed'],r)
                for label in tasks.mutations(task):
                    changed=self.base/('mutant-'+str(time.monotonic_ns()));shutil.copytree(root,changed)
                    tasks.mutate(changed,task,label)
                    self.assertFalse((r:=self.check(changed,task,baseline))['passed'],(label,r))
                unchanged=self.base/('unchanged-'+str(time.monotonic_ns()));shutil.copytree(self.original,unchanged);tasks.fixture(unchanged,task,contract_version=VERSION)
                self.assertFalse(self.check(unchanged,task,tasks.hashes(unchanged))['passed'])
    def test_legacy_long_preferences_are_independently_verified(self):
        task=tasks.IDS[1];root,baseline=self.fixture(task)
        p=root/'desktop/src/main/providers/cloud-context.ts'
        original=p.read_text();needle="const isLong = readPreferences(preferences)[type] === 'long';"
        self.assertIn(needle,original)
        p.write_text(original.replace(needle,"const isLong = (preferences as any)?.version === 2 && readPreferences(preferences)[type] === 'long';"))
        result=self.check(root,task,baseline)
        self.assertFalse(result['passed'],result)
        self.assertIn('cloud consumer',result['reason'])

    def test_equivalent_export_list_migration_is_accepted(self):
        task=tasks.IDS[1];root,baseline=self.fixture(task)
        p=root/'desktop/src/shared/context-migration.mts'
        p.write_text(p.read_text().replace('export function','function')+'\nexport { preferences, migrateConfig };\n')
        result=self.check(root,task,baseline)
        self.assertTrue(result['passed'],result)

    def test_early_exit_fake_completion_and_valid_frame_cannot_skip_checks(self):
        task=tasks.IDS[1]
        for code in ["process.exit(0);", "console.log(JSON.stringify({passed:true,reward:1}));process.exit(0);", "process.stdout.write(JSON.stringify({ok:true,value:{}}));process.exit(0);"]:
            root,baseline=self.fixture(task)
            (root/'desktop/src/shared/context-migration.mts').write_text(code+'\n'+refs.MIGRATION)
            self.assertFalse((r:=self.check(root,task,baseline))['passed'],r)
    def test_forged_valid_store_frame_cannot_hide_persisted_bad_state(self):
        task=tasks.IDS[1];root,baseline=self.fixture(task)
        p=root/'desktop/src/main/harness/context-settings-store.ts'
        p.write_text(p.read_text()+r'''
// Hostile module forges the EXACT public API frame while corrupting persisted state.
const fs=require('fs');const old=JSON.stringify;
JSON.stringify=function(v,...rest){
 if(v&&v.ok===true&&v.value&&v.value.results){
  fs.writeFileSync('/output/config.json','{"corrupted":true}');
 }
 return old(v,...rest);
};
''')
        r=self.check(root,task,baseline);self.assertFalse(r['passed']);self.assertIn('persisted',r['reason'])
    def test_explicit_contract_and_backend_required(self):
        root,baseline=self.fixture(tasks.IDS[1])
        with self.assertRaisesRegex(ValueError,'v1'):tasks.verify_against(root,tasks.IDS[1],baseline,self.original,executor=BwrapExecutor(),backend='bwrap')
        self.assertFalse(tasks.verify_against(root,tasks.IDS[1],baseline,self.original)['passed'])

if __name__=='__main__':unittest.main()
