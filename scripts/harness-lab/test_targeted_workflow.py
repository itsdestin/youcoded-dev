"""Offline integration fixtures; never launch Docker or read a provider credential."""
import sys
import contextlib
sys.dont_write_bytecode = True
import hashlib
import json
import os
import signal
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import targeted_workflow as workflow


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        # Fake-backend lifecycle tests only: never evidence of real admission.
        # Historical orchestration fixtures explicitly bypass the new authority
        # context; current schema/scope/receipt gates have separate negative pins.
        lease=patch('evaluation_qualification.execution_authority',return_value=contextlib.nullcontext())
        lease.start(); self.addCleanup(lease.stop)
        authority=patch('evaluation_qualification.admit_execution',return_value=None)
        authority.start();self.addCleanup(authority.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = Path(__file__).resolve().parent
        self.desktop = self.root/'desktop'
        for name in ['dist/main/create-runtime.js', 'package.json', 'package-lock.json'] + [
                'test-engine/lab-'+n+'.mjs' for n in
                ('runner','worker','observer','state','scenario','faults','clarifications','io')]:
            p = self.desktop/name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('{}')
        self.harbor = self.root/'harbor'
        self.harbor.write_text('#!/bin/sh\nexit 0\n')
        self.harbor.chmod(0o700)
        (self.root/'ledger').mkdir(mode=0o700)
        self.ledger = self.root/'ledger/ledger.json'
        self.ledger.write_text(json.dumps(dict(schemaVersion=1, closed=False, limitUsd=15,
            priorUpperUsd=2, accountingMode='legacy', externalPriorUsd=2,
            chargedUsd=2, reservedUsd=0, providerUsageUsd=0, requests=[])))
        self.ledger.chmod(0o600)
        self.plan_dir = self.root/'plan'
        input_path = self.root/'input.json'
        input_path.write_text(json.dumps(dict(baselineDesktopDir=str(self.desktop),
            candidateDesktopDir=str(self.desktop), model='anthropic/claude-haiku-5.5',
            pinnedProvider='Anthropic', tasks=['csv-summary'], profile='smoke',
            assumedInputTokens=100, assumedOutputTokens=100, budgetUsd=1)))
        # Use an actual public task ID rather than maintaining a duplicate catalog.
        catalog = subprocess.run(['node','--input-type=module','-e',
            "import {developmentTasks} from './targeted-plan.mjs'; console.log(developmentTasks[0].id)"],
            cwd=self.source, check=True, capture_output=True, text=True).stdout.strip()
        data=json.loads(input_path.read_text());data['tasks']=[catalog];input_path.write_text(json.dumps(data))
        subprocess.run(['node',str(self.source/'targeted-plan.mjs'),str(input_path),str(self.plan_dir)],
                       check=True,capture_output=True)
        self.settings = dict(sourceDir=str(self.source), harbor=str(self.harbor),
            image='fixture@sha256:'+'a'*64, sharedLedgerPath=str(self.ledger), workers=1,
            stopMarginUsd=.01, gatePolicy=dict(model='anthropic/claude-haiku-5.5',
            provider='Anthropic', maxContextTokens=1000,maxOutputTokens=8192,
            maxPromptUsdPerMillion=1,maxCacheWriteUsdPerMillion=1,
            maxCompletionUsdPerMillion=1,reservationUsd=.02), synthetic=True)
        self.settings_path=self.root/'settings.json'
        self.settings_path.write_text(json.dumps(self.settings))
        self.out=self.root/'prepared'

    def prepare(self):
        return workflow.prepare(self.plan_dir/'plan.json',self.settings_path,self.out)

    def test_prepared_tokens_are_accepted_by_actual_router_adapter(self):
        from comparison_agents import gate_credentials
        from router_agents import RouterYouCoded
        m=self.prepare()
        for row in m['trials']:
            token=gate_credentials(m['config']['gateUrl'],row['tokenFile'])
            self.assertTrue(token.startswith('yc-gate-'))
            agent=RouterYouCoded(logs_dir=self.root/('adapter-'+row['buildVariant']),
                model_name=row['model'],gate_url=m['config']['gateUrl'],gate_token_file=row['tokenFile'],
                desktop_dir=m['config']['desktopVariants'][row['buildVariant']])
            self.assertEqual(agent.config['gatewayUrl'],m['config']['gateUrl'])

    def test_private_paired_snapshot_no_oracle_upload_and_partial_report(self):
        m=self.prepare()
        self.assertFalse(m['executionAuthorized'])
        self.assertTrue(m['targeted']['sameBuild'])
        self.assertEqual(self.out.stat().st_mode & 0o777,0o700)
        self.assertEqual({r['buildVariant'] for r in m['trials']},{'baseline','candidate'})
        for row in m['trials']:
            self.assertEqual(row['id'],workflow.serial.job_id(row))
            self.assertEqual(Path(row['tokenFile']).stat().st_mode & 0o777,0o600)
            docker=(Path(row['taskPath'])/'environment/Dockerfile').read_text()
            self.assertNotIn('tests',docker)
            self.assertIn(self.settings['image'],docker)
            self.assertEqual(workflow.serial.desktop_for(row,m['config']),Path(m['config']['desktopVariants'][row['buildVariant']]))
        workflow.check(self.out/'prepared-manifest.json')
        report=workflow.report(self.out/'prepared-manifest.json',self.ledger,self.root/'partial')
        self.assertTrue(report['synthetic'])
        with self.assertRaises((ValueError,FileExistsError)):
            workflow.report(self.out/'prepared-manifest.json',self.ledger,self.root/'partial')

    def test_drift_and_no_overwrite(self):
        (self.desktop/'package.json').write_text('changed')
        with self.assertRaises(ValueError):self.prepare()
        self.assertFalse(self.out.exists())

    def test_symlinks_and_unexpected_exports_refused(self):
        (self.plan_dir/'tasks/extra').symlink_to(self.ledger)
        with self.assertRaises(ValueError):self.prepare()
        self.assertFalse(self.out.exists())

    def test_authorization_before_key_or_backend_and_snapshot_drift(self):
        self.prepare()
        with patch.object(workflow,'private_key_metadata',side_effect=AssertionError('key accessed')):
            with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',False,None,'missing')
            receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
            receipt['experimentLimitUsd']=99
            path=self.root/'receipt.json';path.write_text(json.dumps(receipt))
            with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,path,'missing')
        (self.out/'builds/baseline/package.json').write_text('changed')
        with self.assertRaises(ValueError):workflow.check(self.out/'prepared-manifest.json')

    def test_full_synthetic_run_resume_and_report_preserves_failure(self):
        original_plan=workflow.tree(self.plan_dir);original_build=workflow.tree(self.desktop)
        original_ledger=self.ledger.read_bytes()
        m=self.prepare()
        self.assertEqual(self.ledger.read_bytes(),original_ledger)
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-PROVIDER-KEY');key.chmod(0o600)
        backend=FakeBackend()
        self.assertEqual(workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend),0)
        execution=self.out/'execution-manifest.json'
        saved=execution.read_bytes()
        self.assertEqual(workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend),0)
        self.assertEqual(execution.read_bytes(),saved)
        result=workflow.report(execution,self.ledger,self.root/'report')
        self.assertTrue(result['synthetic'])
        self.assertEqual(backend.admitted,2)
        self.assertEqual({r['outcome'] for r in result['trials']},{'passed','verification-failed'})
        self.assertTrue((self.out/'cleanup.jsonl').is_file())
        self.assertEqual(workflow.tree(self.plan_dir),original_plan)
        self.assertEqual(workflow.tree(self.desktop),original_build)
        self.assertIn('synthetic',(self.root/'report/report.md').read_text().lower())
        self.assertFalse(any('-p' in cmd or '--publish' in cmd for cmd in backend.commands))
        changed=auth.read_text()+'\n';auth.write_text(changed)
        with patch.object(workflow,'private_key_metadata',side_effect=AssertionError('key accessed')):
            with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)

    def test_interrupted_evidence_is_not_replayed(self):
        self.prepare()
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-KEY');key.chmod(0o600)
        backend=FakeBackend()
        workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
        journal=self.out/'events.jsonl'
        events=[json.loads(x) for x in journal.read_text().splitlines()]
        journal.write_text(json.dumps(events[0])+'\n')
        saved=journal.read_bytes()
        with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
        self.assertEqual(backend.admitted,2)
        self.assertEqual(journal.read_bytes(),saved)
        result=workflow.report(self.out/'execution-manifest.json',self.ledger,self.root/'interrupted-report')
        self.assertIn('in-progress-or-interrupted',{r['outcome'] for r in result['trials']})

    def test_runner_signal_forwarding_waits_for_scoped_child_cleanup(self):
        calls=[];previous=signal.getsignal(signal.SIGTERM)
        class Child:
            def poll(self):return None
            def send_signal(self,sig):calls.append(('forwarded',sig))
            def wait(self):
                signal.getsignal(signal.SIGTERM)(signal.SIGTERM,None)
                calls.append(('child-cleanup-complete',None))
                return 130
        with patch.object(workflow.subprocess,'Popen',return_value=Child()):
            self.assertEqual(workflow.Backend().runner(['never-executed'],{}),130)
        self.assertEqual(calls,[('forwarded',signal.SIGTERM),('child-cleanup-complete',None)])
        self.assertEqual(signal.getsignal(signal.SIGTERM),previous)

    def test_real_child_signal_between_popen_and_registration_is_reaped(self):
        real_popen=subprocess.Popen
        for sig in (signal.SIGINT,signal.SIGTERM):
            with self.subTest(signal=sig):
                children=[];old=signal.getsignal(sig)
                def interrupt(_sig,_frame):raise KeyboardInterrupt
                def spawn(*args,**kwargs):
                    child=real_popen(*args,**kwargs);children.append(child)
                    os.kill(os.getpid(),sig)  # OS child exists; caller has no owner yet.
                    return child
                signal.signal(sig,interrupt)
                try:
                    with patch.object(workflow.subprocess,'Popen',side_effect=spawn):
                        try:workflow.Backend().runner([sys.executable,'-B','-c','import time; time.sleep(60)'],{})
                        except KeyboardInterrupt:pass
                    self.assertIsNotNone(children[0].poll(),'acquisition-window child leaked')
                    self.assertEqual(signal.getsignal(sig),interrupt)
                finally:
                    signal.signal(sig,old)
                    for child in children:
                        if child.poll() is None:child.terminate()
                        child.wait(timeout=5)

    def test_docker_acquisition_window_signals_register_before_cleanup(self):
        self.prepare()
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-KEY');key.chmod(0o600)
        for kind,sig in [('network',signal.SIGINT),('container',signal.SIGTERM)]:
            with self.subTest(kind=kind):
                backend=FakeBackend();original=backend.command
                def acquire(args,**kwargs):
                    result=original(args,**kwargs)
                    if (kind=='network' and args[:3]==['docker','network','create']) or (
                            kind=='container' and args[:2]==['docker','create']):
                        os.kill(os.getpid(),sig)
                    return result
                backend.command=acquire
                with self.assertRaises((ValueError,KeyboardInterrupt)):
                    workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
                self.assertTrue(any(c[:3]==['docker','network','rm'] for c in backend.commands))
                if kind=='container':self.assertTrue(any(c[:2]==['docker','rm'] for c in backend.commands))
                self.assertEqual(backend.admitted,0)

    def test_docker_create_timeout_records_uncertainty_without_removing_unowned_name(self):
        self.prepare()
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-KEY');key.chmod(0o600)
        backend=FakeBackend();original=backend.command
        def timeout(args,**kwargs):
            result=original(args,**kwargs)
            if args[:3]==['docker','network','create']:raise subprocess.TimeoutExpired(args,30)
            return result
        backend.command=timeout
        with self.assertRaises((ValueError,subprocess.TimeoutExpired)):
            workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
        history=self.out/'cleanup.jsonl'
        self.assertTrue(history.exists(),'uncertain creation must leave durable refusal evidence')
        self.assertIn('uncertain',history.read_text())
        self.assertFalse(any('rm' in c or 'stop' in c for c in backend.commands))
        fresh=FakeBackend()
        with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,auth,key,fresh)
        self.assertEqual(fresh.commands,[])

    def test_container_timeout_never_stops_or_removes_unregistered_container(self):
        self.prepare()
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-KEY');key.chmod(0o600)
        backend=FakeBackend();original=backend.command
        def timeout(args,**kwargs):
            result=original(args,**kwargs)
            if args[:2]==['docker','create']:raise subprocess.TimeoutExpired(args,30)
            return result
        backend.command=timeout
        with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
        self.assertIn('uncertain container creation',(self.out/'cleanup.jsonl').read_text())
        self.assertFalse(any(c[:2] in (['docker','rm'],['docker','stop']) for c in backend.commands))
        self.assertTrue(any(c[:3]==['docker','network','rm'] for c in backend.commands))
        self.assertEqual(backend.admitted,0)

    def test_changed_definitions_refused_before_output(self):
        plan_path=self.plan_dir/'plan.json';p=json.loads(plan_path.read_text())
        p['taskDefinitionHashes'][p['taskIds'][0]]='0'*64
        plan_path.write_text(json.dumps(p))
        with self.assertRaises(ValueError):self.prepare()
        self.assertFalse(self.out.exists())

    def test_extra_cells_output_caps_and_public_ledger_refused(self):
        plan_path=self.plan_dir/'plan.json';p=json.loads(plan_path.read_text())
        p['cells'].append(p['cells'][0]);plan_path.write_text(json.dumps(p))
        with self.assertRaises(ValueError):self.prepare()
        p['cells'].pop();plan_path.write_text(json.dumps(p))
        self.settings['gatePolicy']['maxOutputTokens']=8193
        self.settings_path.write_text(json.dumps(self.settings))
        with self.assertRaises(ValueError):self.prepare()
        self.settings['gatePolicy']['maxOutputTokens']=8192
        self.settings_path.write_text(json.dumps(self.settings))
        self.ledger.chmod(0o644)
        with self.assertRaises(ValueError):self.prepare()
        self.assertFalse(self.out.exists())

    def test_no_overwrite_and_stored_scope_rebinding(self):
        m=self.prepare()
        with self.assertRaises(ValueError):self.prepare()
        ledger=json.loads(self.ledger.read_text())
        ledger['budgetScopes']={m['preparation']['scopeID']:2}
        self.ledger.write_text(json.dumps(ledger))
        with self.assertRaises(ValueError):workflow.check(self.out/'prepared-manifest.json')

    def test_unapproved_template_rejected_before_backend(self):
        self.prepare()
        with patch.object(workflow,'private_key_metadata',side_effect=AssertionError('key accessed')):
            with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,
                self.out/'authorization-template.json','missing',FakeBackend())

    def test_parallel_dispatch_preserves_children_and_partial_reports(self):
        self.settings['workers']=2;self.settings_path.write_text(json.dumps(self.settings))
        self.prepare()
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-KEY');key.chmod(0o600)
        backend=FakeBackend()
        self.assertEqual(workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend),0)
        result=workflow.report(self.out/'execution-manifest.json',self.ledger,self.root/'parallel-report')
        self.assertTrue(result['synthetic'])
        self.assertEqual(backend.admitted,2)
        self.assertTrue((self.out/'events.jsonl.trials').is_dir())

    def test_cleanup_failure_recorded_and_preexisting_names_never_removed(self):
        self.prepare()
        receipt=json.loads((self.out/'authorization-template.json').read_text());receipt['approved']=True
        auth=self.root/'receipt.json';auth.write_text(json.dumps(receipt))
        key=self.root/'dummy-key';key.write_text('NOT-A-KEY');key.chmod(0o600)
        backend=FakeBackend();original=backend.command
        def collision(args,**kwargs):
            if args[:3]==['docker','network','inspect']:
                return subprocess.CompletedProcess(args,0,'[]','')
            return original(args,**kwargs)
        backend.command=collision
        with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
        self.assertFalse(any('rm' in args for args in backend.commands))
        self.assertFalse((self.out/'execution-manifest.json').exists())
        backend=FakeBackend();original=backend.command
        def fail_stop(args,**kwargs):
            if args[:2]==['docker','stop']:return subprocess.CompletedProcess(args,1,'','failed')
            return original(args,**kwargs)
        backend.command=fail_stop
        with self.assertRaises(ValueError):workflow.run(self.out/'prepared-manifest.json',True,auth,key,backend)
        self.assertTrue(json.loads((self.out/'cleanup.jsonl').read_text())['cleanupErrors'])


class FakeBackend:
    def __init__(self):self.admitted=0;self.commands=[]
    def command(self,args,**kwargs):
        self.commands.append(args)
        if args[:3]==['docker','image','inspect']:
            return subprocess.CompletedProcess(args,0,json.dumps([dict(Id='sha256:'+'b'*64,RepoDigests=['fixture@sha256:'+'a'*64])]),'')
        if args[:3] in (['docker','network','inspect'],['docker','container','inspect']):
            return subprocess.CompletedProcess(args,1,'','not found')
        return subprocess.CompletedProcess(args,0,'','')
    def health(self,name):return True
    def runner(self,args,env):
        manifest=json.loads(Path(args[args.index('--manifest')+1]).read_text())
        events=Path(manifest['config']['eventsPath'])
        if 'parallel' in manifest:
            import run_parallel_comparison as parallel
            if events.exists():
                parallel.completed_trials([json.loads(x) for x in events.read_text().splitlines()],manifest)
                return 0
            with events.open('w') as stream:
                for row in manifest['trials']:
                    child=parallel.child_manifest(manifest,row)
                    child_path,journal=parallel.child_paths(manifest,row)
                    child_path.parent.mkdir(exist_ok=True)
                    child_path.write_text(json.dumps(child))
                    stream.write(json.dumps(dict(event='admitted',trialKey=row['trialKey'],jobId=row['id'],
                        manifestSha256=workflow.fingerprint(manifest),childManifestSha256=workflow.fingerprint(child)))+'\n')
                    self.runner([sys.executable,'-B',str(Path(manifest['config']['sourceDir'])/'run_objective_comparison.py'),
                        '--manifest',str(child_path),'--execute'],env)
                    stream.write(json.dumps(dict(event='outcome',trialKey=row['trialKey'],jobId=row['id'],
                        manifestSha256=workflow.fingerprint(manifest),returncode=0,infrastructureError=False,
                        interrupted=False,cleanupConfirmed=True,childJournalSha256=hashlib.sha256(journal.read_bytes()).hexdigest()))+'\n')
            return 0
        if events.exists():
            workflow.serial.completed_prefix([json.loads(x) for x in events.read_text().splitlines()],manifest['trials'])
            return 0
        with events.open('w') as stream:
            for index,row in enumerate(manifest['trials']):
                self.admitted+=1
                ledger_path=Path(manifest['config']['ledgerPath']);ledger=json.loads(ledger_path.read_text())
                ledger.setdefault('budgetScopes',{})[manifest['preparation']['scopeID']]=manifest['preparation']['experimentLimitUsd']
                ledger['requests'].append(dict(id='synthetic-'+row['id'],trialId=row['id'],model=row['model'],
                    provider=manifest['targeted']['provider'],budgetScopeId=manifest['preparation']['scopeID'],
                    status='settled',actualCostUsd=.001,reservationUsd=.02,
                    usage=dict(inputTokens=10,outputTokens=5,cacheReadTokens=0,cacheWriteTokens=0,reasoningTokens=0)))
                ledger['chargedUsd']+=.001;ledger_path.write_text(json.dumps(ledger))
                verifier=Path(manifest['config']['jobsDir'])/row['id']/'trial/verifier/reward.txt'
                verifier.parent.mkdir(parents=True);verifier.write_text(str(index))
                (verifier.parent.parent/'result.json').write_text(json.dumps(dict(
                    exception_info=None,verifier_result={'rewards':{'reward':index}})))
                for event in [dict(event='started',jobId=row['id']),dict(event='outcome',jobId=row['id'],
                    rewards={'reward':index},returncode=0,infrastructureError=False,interrupted=False,
                    cleanupErrors=[],artifactHashes={str(verifier):hashlib.sha256(verifier.read_bytes()).hexdigest()})]:
                    event.update(trialKey=row['trialKey'],manifestSha256=workflow.fingerprint(manifest))
                    stream.write(json.dumps(event)+'\n')
        return 0


if __name__=='__main__':unittest.main()
