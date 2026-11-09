"""Offline-only modes, clean Git export, reset and verifier controls."""
import sys
sys.dont_write_bytecode=True
import json
import tempfile
import unittest
from pathlib import Path
import subprocess
import evaluation_workflow as w
import comparison_tasks as tasks

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]/'youcoded'

class TaskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='yc-mode-tests-',dir=HERE.parents[1]/'scratch')
        cls.root=Path(cls.temp.name)
        cls.snapshot=cls.root/'snapshot'
        cls.identity=tasks.snapshot(REPO,cls.snapshot)
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def attempt(self,task,label):
        root=self.root/(task+'-'+label)
        return tasks.reset(self.snapshot,root,task)

    def test_measured_clean_git_source_and_license(self):
        self.assertEqual(self.identity['commit'],tasks.PIN)
        self.assertGreater(self.identity['sourceFiles'],1000)
        self.assertGreater(self.identity['sourceBytes'],1_000_000)
        self.assertEqual(self.identity['license'],'MIT (selected desktop source; full license retained)')
        names=w.tree(self.snapshot)
        self.assertFalse(any('.git/' in p or '.env' in Path(p).name or 'comparison_reference' in p or 'comparison-verify' in p for p in names))
        self.assertIn('LICENSE',names)

    def test_fresh_reset_identical_and_existing_or_contaminated_rejected(self):
        a=self.attempt('repo-release-integrity','reset1');b=self.attempt('repo-release-integrity','reset2')
        self.assertEqual(w.tree(a),w.tree(b))
        (a/'note.txt').write_text('prior attempt evidence')
        with self.assertRaises(ValueError):tasks.reset(self.snapshot,a,'repo-release-integrity')
        self.assertEqual((a/'note.txt').read_text(),'prior attempt evidence')
        (self.snapshot/'unexpected.txt').write_text('contaminated')
        try:
            with self.assertRaises(ValueError):self.attempt('repo-release-integrity','contaminated')
        finally:(self.snapshot/'unexpected.txt').unlink()

    def test_three_reference_solutions_and_negative_mutations(self):
        for task in tasks.IDS:
            with self.subTest(task=task):
                root=self.attempt(task,'reference')
                self.assertFalse(tasks.verify(root,task)['passed'])
                tasks.reference(root,task)
                result=tasks.verify(root,task)
                self.assertTrue(result['passed'],result)
                for label in tasks.mutations(task):
                    bad=self.attempt(task,'negative-'+label)
                    tasks.reference(bad,task);tasks.mutate(bad,task,label)
                    result=tasks.verify(bad,task)
                    self.assertFalse(result['passed'],(task,label,result))

    def test_alternative_function_style_and_import_names_are_accepted(self):
        for task in tasks.IDS[:2]:
            root=self.attempt(task,'alternative');tasks.reference(root,task)
            if task==tasks.IDS[0]:
                p=root/'desktop/src/main/update-manifest-verify.ts';p.write_text(p.read_text().replace('export function parseReleaseManifest(bytes: Buffer | string): ReleaseManifest {','export const parseReleaseManifest = (bytes: Buffer | string): ReleaseManifest => {'))
            else:
                for name in ('desktop/src/main/harness/context-settings-store.ts','desktop/src/main/providers/cloud-context.ts'):
                    p=root/name;p.write_text(p.read_text().replace('readPreferences','decodeContext'))
            self.assertTrue(tasks.verify(root,task)['passed'])

    def test_hidden_controls_excluded_from_agent_export(self):
        out=self.root/'exports';tasks.export_suite(self.snapshot,out,'local@sha256:'+'a'*64,dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90))
        for task in tasks.IDS:
            base=out/task
            self.assertTrue((base/'tests/test.sh').is_file())
            names=w.tree(base/'environment/fixtures')
            self.assertFalse(any('comparison_reference' in p or 'comparison-verify' in p or 'baseline-manifest' in p or Path(p).name in ('authorization-template.json','gateway-config.json') or 'token'==Path(p).name for p in names))
            self.assertNotIn('reference', (base/'environment/Dockerfile').read_text())

class WorkflowTests(unittest.TestCase):
    def test_registry_covers_actual_supported_adapter_versions(self):
        import ast
        import run_objective_comparison as serial
        versions={}
        for node in ast.parse((HERE/'router_agents.py').read_text()).body:
            if isinstance(node,ast.ClassDef):
                for item in node.body:
                    if isinstance(item,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='pinned_version' for t in item.targets):versions[node.name]=ast.literal_eval(item.value)
        registry=w.node_json("import {registry} from './evaluation-modes.mjs';console.log(JSON.stringify(registry));",[])
        self.assertEqual(set(registry),set(serial.AGENTS))
        for name,adapter in serial.AGENTS.items():
            if name!='youcoded':self.assertEqual(registry[name]['version'],versions[adapter])

    def test_mode_native_adapter_passes_limits_and_never_installs_dependencies(self):
        import asyncio
        import importlib.util
        from types import SimpleNamespace
        from unittest.mock import patch
        class Base:
            def __init__(self,*args,**kwargs):self.config=kwargs;self.desktop=Path(kwargs['desktop_dir']);self.runtime_dir='/opt/youcoded-lab'
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'package-lock.json').write_text('{}');(root/'test-engine').mkdir();(root/'test-engine/lab-runner.mjs').write_text('// fixture')
            router=SimpleNamespace(panel_model=lambda *a,**k:None,gate_credentials=lambda *a:None,TimedEnvironment=lambda *a:None)
            with patch.dict(sys.modules,{'router_agents':router,'harbor_adapter':SimpleNamespace(YouCodedAgent=Base)}):
                spec=importlib.util.spec_from_file_location('offline_mode_adapter',HERE/'mode_agents.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            agent=module.ModeYouCoded(gate_url='http://gateway:1',gate_token_file='/opaque',max_requests='60',timeout_sec='720',desktop_dir=root,model_name='anthropic/claude-haiku-5.5')
            self.assertEqual(agent.config['max_requests'],60);self.assertEqual(agent.config['timeout_sec'],720)
            class Environment:
                def __init__(self):self.commands=[];self.uploads=[]
                async def exec(self,command,**kwargs):self.commands.append(command);return SimpleNamespace(return_code=0)
                async def upload_dir(self,*args):self.uploads.append(args)
                async def upload_file(self,*args):self.uploads.append(args)
            env=Environment();asyncio.run(agent.setup(env))
            self.assertNotIn('npm',' '.join(env.commands));self.assertIn('/opt/youcoded-deps/',' '.join(env.commands));self.assertTrue(env.uploads)
            for requests,seconds in [('20.5','720'),('60','1800'),('0','720')]:
                with self.assertRaises(ValueError):module.ModeYouCoded(gate_url='http://gateway:1',gate_token_file='/opaque',max_requests=requests,timeout_sec=seconds,desktop_dir=root,model_name='anthropic/claude-haiku-5.5')
    def test_no_provider_cli_plan_prepare_check_run_report_and_scope_tamper(self):
        import os
        import run_objective_comparison as s
        with tempfile.TemporaryDirectory(prefix='yc-mode-cli-',dir=HERE.parents[1]/'scratch') as tmp:
            root=Path(tmp);build=root/'build';(build/'dist/main').mkdir(parents=True);(build/'test-engine').mkdir()
            (build/'dist/main/create-runtime.js').write_text('// OFFLINE FIXTURE: not a runtime\n')
            for name in ('package.json','package-lock.json'):(build/name).write_text('{}')
            for name in ('runner','worker','observer','state','scenario','faults','clarifications','io'):(build/'test-engine'/('lab-'+name+'.mjs')).write_text('// OFFLINE FIXTURE\n')
            fingerprint=w.desktop_snapshot(build)['sha256'];image='fixture@sha256:'+'a'*64
            ledgerdir=root/'ledger';ledgerdir.mkdir(mode=0o700);ledger=ledgerdir/'ledger.json'
            w.write_new(ledger,dict(schemaVersion=1,closed=False,requests=[],limitUsd=15,priorUpperUsd=0,chargedUsd=0,reservedUsd=0))
            settings=root/'settings.json';w.write_new(settings,dict(harbor=str(Path(sys.executable).resolve()),sharedLedgerPath=str(ledger),gatePolicy=dict(model='anthropic/claude-haiku-5.5',provider='Anthropic',maxContextTokens=32768,maxOutputTokens=8192,maxPromptUsdPerMillion=1,maxCacheWriteUsdPerMillion=1,maxCompletionUsdPerMillion=5,reservationUsd=.2),stopMarginUsd=.01))
            def cli(*args):
                proc=subprocess.run([sys.executable,'-B',str(HERE/'evaluation_workflow.py'),*map(str,args)],capture_output=True,text=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
                self.assertEqual(proc.returncode,0,proc.stderr);self.assertIn('"providerCalls": 0',proc.stdout)
            for mode in ('basic','compare','thorough'):
                arm=lambda adapter,id=None:dict(id=id or adapter,adapter=adapter,version='build:'+fingerprint if adapter=='youcoded' else {'claude-code':'2.1.302','pi':'1.3.0','hermes':'v0.22.2','opencode':'1.19.3'}[adapter],fingerprint=fingerprint if adapter=='youcoded' else 'a'*64,**({'desktopDir':str(build)} if adapter=='youcoded' else {}))
                arms=[arm('youcoded','baseline'),arm('youcoded','candidate')] if mode=='basic' else [arm('youcoded'),arm('claude-code')] if mode=='compare' else [arm(x) for x in s.AGENTS]
                request=dict(mode=mode,profile='smoke',arms=arms,model='anthropic/claude-haiku-5.5',provider='Anthropic',network='controlled-retrieval',limits=dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90),budgetUsd=1,image=image)
                if mode=='basic':request['taskIds']=['finish-the-file']
                req=root/(mode+'-request.json');w.write_new(req,request)
                plan=root/(mode+'-plan');prepared=root/(mode+'-prepared');dry=root/(mode+'-commands.json');report=root/(mode+'-report')
                cli('plan','--request',req,'--out',plan)
                cli('prepare','--plan',plan/'plan.json','--settings',settings,'--out',prepared)
                manifest=prepared/'prepared-manifest.json'
                cli('check','--manifest',manifest);cli('run','--manifest',manifest,'--dry-out',dry);cli('report','--manifest',manifest,'--out',report)
                commands=json.loads(dry.read_text())['commands'];self.assertEqual(len(commands),len(w.check(manifest)['trials']))
                self.assertTrue(any('mode_agents:ModeYouCoded' in cmd for cmd in commands))
                if mode!='basic':self.assertTrue(any('router_agents:RouterClaudeCode' in cmd for cmd in commands))
                self.assertFalse(json.loads((report/'inventory.json').read_text())['marketingReady'])
                full=json.loads((report/'summary.json').read_text())
                self.assertEqual(full['mode'],mode)
                self.assertEqual([t['adapter'] for t in full['trials']],[r['agent'] for r in w.check(manifest)['trials']])
                self.assertTrue(all(t['outcome']=='unstarted' for t in full['trials']))
                self.assertEqual((report/'report.md').read_text().count('## Family '),13)
                with self.assertRaises(ValueError):w.run(manifest,True,prepared/'authorization-template.json',root/'nonexistent-key')
                # Reporting is original-evidence-only, even while paid admission is
                # blocked and the current planner/runtime cannot be called.
                from unittest.mock import patch
                with patch.object(w,'check',side_effect=AssertionError('current planner forbidden')),patch('evaluation_qualification.admit',side_effect=AssertionError('runtime forbidden')):
                    w.report(manifest,root/(mode+'-blocked-full-report'))
                self.assertEqual((root/(mode+'-blocked-full-report')/'report.md').read_text().count('## Family '),13)
                poison=prepared/'source/evaluation-modes.mjs';before=poison.read_text();marker=root/(mode+'-unexpected-execution')
                poison.write_text("import fs from 'node:fs';fs.writeFileSync("+json.dumps(str(marker))+",'executed');")
                try:
                    with self.assertRaises(ValueError):w.check(manifest)
                    self.assertFalse(marker.exists(),'check must not execute an unvalidated copied planner')
                finally:poison.write_text(before)
                if mode=='compare':
                    from types import SimpleNamespace
                    class FakeBackend:
                        def __init__(self):self.commands=[];self.runners=[]
                        def command(self,args,**kwargs):
                            self.commands.append(args)
                            if args[:3]==['docker','image','inspect']:return SimpleNamespace(returncode=0,stdout=json.dumps([dict(Id='sha256:'+'a'*64,RepoDigests=[image])]))
                            return SimpleNamespace(returncode=1 if len(args)>2 and args[2]=='inspect' else 0,stdout='')
                        def health(self,name):return True
                        def runner(self,args,env):self.runners.append(args);return 0
                    backend=FakeBackend();approval=root/'offline-fake-approval.json';w.write_new(approval,w.legacy.receipt_for(w.check(manifest),manifest))
                    key=root/'offline-placeholder-key';key.write_text('offline-placeholder-never-provider');key.chmod(0o600)
                    # Approval and an image digest cannot waive missing whole-matrix qualification.
                    with self.assertRaisesRegex(ValueError,'qualification'):w.run(manifest,True,approval,key,backend)
                    self.assertEqual(backend.runners,[])
                    self.assertEqual(backend.commands,[])
                    self.assertTrue(all(str(key) not in ' '.join(cmd) for cmd in commands))
                m=json.loads(manifest.read_text());m['trials'][0]['agent']='pi';manifest.write_text(json.dumps(m))
                with self.assertRaises(ValueError):w.check(manifest)

    def test_unapproved_run_refuses_before_backend_or_credentials(self):
        with self.assertRaises(ValueError):w.run('/nonexistent/prepared-manifest.json')
    def test_legacy_limits_unchanged_and_v2_command_uses_real_adapter(self):
        import run_objective_comparison as s
        c=dict(harbor='/harbor',sourceDir='/source',gateUrl='http://gateway:1',jobsDir='/jobs',desktopDir='/build',comparisonKey='x')
        row=dict(agent='youcoded',taskPath='/task',model='anthropic/claude-haiku-5.5',tokenFile='/token',taskId='x',trialKey='x')
        old=s.command_for(row,c);self.assertIn('router_agents:RouterYouCoded',old)
        c['evaluationLimits']=dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90)
        new=s.command_for(row,c);self.assertIn('mode_agents:ModeYouCoded',new)
        self.assertIn('max_requests=60',new);self.assertIn('timeout_sec=720',new)
        row['agent']='claude-code';new=s.command_for(row,c)
        self.assertIn('router_agents:RouterClaudeCode',new);self.assertIn('max_turns=60',new)

if __name__=='__main__':unittest.main()
