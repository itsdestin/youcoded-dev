"""The three modes use the full evidence report, preserving actual adapter identities."""
import unittest
import hashlib
import json
import tempfile
import subprocess
from pathlib import Path
import targeted_report as reports


def fixture(mode='compare'):
    names=['baseline','candidate'] if mode=='basic' else ['youcoded','claude-code'] if mode=='compare' else ['youcoded','claude-code','pi','hermes','opencode']
    tasks=['task-a'] if mode=='basic' else ['task-a','task-b','task-c']
    arms=[dict(id=n,adapter='youcoded' if mode=='basic' else n,version='test',fingerprint=str(i)*64) for i,n in enumerate(names,1)]
    cells=[dict(taskId=t,split='development',arm=a['id'],agent=a['adapter'],model='fixture-model',repetition=0) for t in tasks for a in arms]
    rows=[dict(c,id=f'job-{i}',trialKey=f'key-{i}') for i,c in enumerate(cells)]
    plan=dict(mode=mode,profile='smoke',arms=arms,cells=cells,tasks=[dict(id=t,split='development') for t in tasks],model='fixture-model',provider='fixture-provider',network='controlled-retrieval')
    manifest=dict(schemaVersion=2,evaluation=dict(mode=mode,profile='smoke',network='controlled-retrieval'),trials=rows)
    return manifest,plan


class ModeReporting(unittest.TestCase):
    def test_all_modes_render_full_families_without_relabeling_adapters(self):
        for mode in ('basic','compare','thorough'):
            with self.subTest(mode=mode):
                manifest,plan=fixture(mode)
                report=reports.summarize_targeted(manifest,[],[],mode_plan=plan)
                self.assertEqual(report['mode'],mode)
                self.assertEqual(set(report['arms']),{a['id'] for a in plan['arms']})
                self.assertEqual([t['adapter'] for t in report['trials']],[r['agent'] for r in manifest['trials']])
                self.assertTrue(all(t['outcome']=='unstarted' for t in report['trials']))
                text=reports.render_markdown(report)
                self.assertIn(f'Evaluation comparison: {mode}',text)
                self.assertEqual(text.count('## Family '),13)
                self.assertFalse(report['publicClaimReady'])
                self.assertIn('Right arm',text)

    def test_thorough_pairs_keep_all_harness_identities_and_failed_trials(self):
        manifest,plan=fixture('thorough')
        attempts=[dict(trialKey=r['trialKey'],jobId=r['id'],rewards={'reward':0 if r['agent']=='pi' else 1}) for r in manifest['trials']]
        report=reports.summarize_targeted(manifest,attempts,[],mode_plan=plan)
        self.assertEqual(len(report['pairs']),30)
        self.assertEqual(report['arms']['pi']['outcomes'],{'verification-failed':3})
        self.assertEqual({p['leftArm'] for p in report['pairs']}|{p['rightArm'] for p in report['pairs']},{a['id'] for a in plan['arms']})
        self.assertTrue(all(p['candidateMinusBaseline']['costUsd'] is None for p in report['pairs']))

    def test_basic_reversed_arms_keep_candidate_minus_baseline(self):
        manifest,plan=fixture('basic');plan['arms'].reverse();plan['cells'].reverse();manifest['trials'].reverse()
        attempts=[dict(trialKey=r['trialKey'],rewards={'reward':1 if r['arm']=='baseline' else 0},clientSeconds=10 if r['arm']=='baseline' else 3,timingScope=reports.TIMING_SCOPE) for r in manifest['trials']]
        report=reports.summarize_targeted(manifest,attempts,[],mode_plan=plan)
        pair=report['pairs'][0]
        self.assertEqual((pair['leftArm'],pair['rightArm']),('baseline','candidate'))
        self.assertEqual(pair['candidateMinusBaseline']['clientSeconds'],-7)
        self.assertEqual(pair['candidateMinusBaseline']['passed'],-1)

    def test_split_is_preserved_and_explicit_drift_refused(self):
        manifest,plan=fixture('thorough');plan['tasks'][0]['split']='evaluation-only'
        for cell in plan['cells']+manifest['trials']:
            if cell['taskId']=='task-a':cell['split']='evaluation-only'
        result=reports.summarize_targeted(manifest,[],[],mode_plan=plan)
        self.assertEqual(result['trials'][0]['split'],'evaluation-only')
        manifest['trials'][0]['split']='development'
        with self.assertRaisesRegex(ValueError,'split'):reports.summarize_targeted(manifest,[],[],mode_plan=plan)

    def test_saved_mode_evidence_flows_through_full_loader_and_checks_plan_hash(self):
        for mode in ('basic','compare','thorough'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);manifest,plan=fixture(mode)
                for row in manifest['trials']:row['id']='oc-'+hashlib.sha256(row['trialKey'].encode()).hexdigest()[:24]
                plan_path=root/'plan.json';plan_path.write_text(json.dumps(plan))
                pin=root/'pinned.txt';pin.write_text('immutable fixture')
                manifest['snapshotHashes']={str(pin):hashlib.sha256(pin.read_bytes()).hexdigest()}
                manifest['preparation']={'planSha256':hashlib.sha256(plan_path.read_bytes()).hexdigest()}
                manifest['config']={'jobsDir':str(root/'jobs'),'eventsPath':str(root/'events.jsonl'),'ledgerPath':str(root/'ledger.json')}
                source=root/'execution-manifest.json';source.write_text(json.dumps(manifest))
                digest=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest();events=[]
                # One complete observed attempt; all other planned cells remain explicit unstarted rows.
                row=manifest['trials'][0];trial=root/'jobs'/row['id']/'attempt'
                (trial/'agent').mkdir(parents=True);(trial/'verifier').mkdir()
                (trial/'result.json').write_text(json.dumps({'exception_info':None,'verifier_result':{'rewards':{'reward':1}}}))
                (trial/'verifier/reward.txt').write_text('1')
                raw={'runtime':'createRuntime/NativeSessionHost','status':'completed','events':[{'type':'user-message','timestamp':1,'data':{'text':'synthetic fixture','inputKind':'scripted'}}],'requests':[],'scenarioCheckpoints':[{'eventCount':1}]}
                (trial/'agent/youcoded-run.json').write_text(json.dumps(raw))
                for kind in ('started','outcome'):
                    e=dict(event=kind,trialKey=row['trialKey'],jobId=row['id'],manifestSha256=digest)
                    if kind=='outcome':e.update(rewards={'reward':1},infrastructureError=False,interrupted=False)
                    events.append(e)
                (root/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in events))
                (root/'ledger.json').write_text(json.dumps({'schemaVersion':1,'requests':[]}))
                result=reports.load_targeted_report(source)
                self.assertEqual(result['trials'][0]['outcome'],'passed')
                self.assertEqual(result['trials'][0]['activity']['analysis']['interactions']['provenance']['scripted'],1)
                self.assertEqual(len(result['trials']),len(manifest['trials']))
                self.assertEqual(reports.render_markdown(result).count('## Family '),13)
                for malformed in (None,[], 'text',23):
                    (trial/'agent/youcoded-run.json').write_text(json.dumps(malformed))
                    damaged=reports.load_targeted_report(source)
                    self.assertEqual(damaged['trials'][0]['outcome'],'passed')
                    self.assertEqual(damaged['trials'][0]['activity']['coverage'],'unsupported')
                (trial/'agent/youcoded-run.json').write_text(json.dumps(raw))
                if mode!='basic':
                    import shutil
                    wrong=manifest['trials'][1];wrong_trial=root/'jobs'/wrong['id']/'attempt'
                    shutil.copytree(trial,wrong_trial)
                    for kind in ('started','outcome'):
                        e=dict(event=kind,trialKey=wrong['trialKey'],jobId=wrong['id'],manifestSha256=digest)
                        if kind=='outcome':e.update(rewards={'reward':1},infrastructureError=False,interrupted=False)
                        events.append(e)
                    (root/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in events))
                    mismatch=reports.load_targeted_report(source)['trials'][1]
                    self.assertEqual(mismatch['outcome'],'passed')
                    self.assertEqual(mismatch['activity']['coverage'],'unsupported')
                    self.assertIn('adapter',mismatch['activity']['reason'])
                    (wrong_trial/'agent/youcoded-run.json').unlink()
                    (wrong_trial/'agent/trajectory.json').write_text(json.dumps({'agent':{'name':'pi'},'steps':[]}))
                    self.assertEqual(reports.load_targeted_report(source)['trials'][1]['activity']['coverage'],'unsupported')
                plan_path.write_text(json.dumps({**plan,'provider':'drift'}))
                with self.assertRaisesRegex(ValueError,'plan hash'):reports.load_targeted_report(source)

    def test_actual_controller_evidence_reaches_printed_cells_in_every_mode(self):
        for mode in ('basic','compare','thorough'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);manifest,plan=fixture(mode)
                for row in manifest['trials']:row['id']='oc-'+hashlib.sha256(row['trialKey'].encode()).hexdigest()[:24]
                row=manifest['trials'][0]
                (root/'plan.json').write_text(json.dumps(plan));pin=root/'pin';pin.write_text('fixture')
                manifest['snapshotHashes']={str(pin):hashlib.sha256(pin.read_bytes()).hexdigest()}
                manifest['preparation']={'planSha256':hashlib.sha256((root/'plan.json').read_bytes()).hexdigest()}
                manifest['config']={'jobsDir':str(root/'jobs'),'eventsPath':str(root/'events.jsonl'),'ledgerPath':str(root/'ledger.json')}
                source=root/'execution-manifest.json';source.write_text(json.dumps(manifest))
                task=root/'protocol';task.mkdir()
                module=Path(reports.__file__).with_name('behavior-fixtures.mjs').as_uri()
                code=f"import {{runBehaviorFixture}} from {json.dumps(module)};const e=await runBehaviorFixture({json.dumps(dict(directory=str(task),runId=row['id'],taskId=row['taskId'],adapter=row['agent']))});console.log(JSON.stringify({{raw:JSON.stringify(e.raw),envelope:JSON.stringify(e.controllerEvidence)}}));"
                executed=subprocess.run(['node','--input-type=module','-e',code],text=True,capture_output=True,check=True)
                capture=json.loads(executed.stdout)
                trial=root/'jobs'/row['id']/'attempt';(trial/'agent').mkdir(parents=True);(trial/'verifier').mkdir()
                (trial/'agent/trajectory.json').write_text(capture['raw'])
                # Retain an independent FAILURE despite recovered protocol test/safety passes.
                (trial/'result.json').write_text(json.dumps({'exception_info':None,'verifier_result':{'rewards':{'reward':0}}}))
                (trial/'verifier/reward.txt').write_text('0')
                controller=root/'controller-behavior';controller.mkdir();envelope=controller/'observed.json';envelope.write_text(capture['envelope'])
                digest=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()
                events=[dict(event=kind,trialKey=row['trialKey'],jobId=row['id'],manifestSha256=digest) for kind in ('started','outcome')]
                events[1].update(rewards={'reward':0},infrastructureError=False,interrupted=False,controllerBehavior=dict(path=str(envelope),sha256=hashlib.sha256(envelope.read_bytes()).hexdigest()))
                (root/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in events));(root/'ledger.json').write_text(json.dumps({'schemaVersion':1,'requests':[]}))
                result=reports.load_targeted_report(source);a=result['trials'][0]['activity']['analysis']
                self.assertEqual(result['trials'][0]['outcome'],'verification-failed')
                self.assertEqual(a['behavior']['coverage'],'partial',a['behavior']['reason'])
                self.assertEqual(a['outcome']['recovery']['successes'],1)
                self.assertEqual(a['outcome']['safety']['failures'],1)
                self.assertEqual(a['outcome']['followThrough']['failures'],2)
                self.assertEqual(a['outcome']['followThrough']['unresolved'],1)
                text=reports.render_markdown(result)
                self.assertIn('1 false / 2 assessed / 3 observations',text)
                self.assertIn('1 failures / 3 observations; 2 successful',text)
                self.assertIn('0 failures / 1 observations; 1 successful',text)
                self.assertIn('scripted | nudge | 1',text);self.assertIn('scripted | clarification-answer | 1',text)
                self.assertIn('fixture-triggered; no production root-cause claim',text)
                self.assertEqual(text.count('## Family '),13)
                # No trigger with complete capture is N/A; absence of a monitor is unknown.
                empty=json.loads(capture['envelope']);empty['rows']=[]
                for complete,expected in ((True,'not-applicable — no trigger in controller capture'),(False,'unknown — missing cited assessments')):
                    empty['capture']['recoveryTriggersComplete']=complete
                    envelope.write_text(json.dumps(empty,separators=(',',':'),ensure_ascii=False))
                    events[1]['controllerBehavior']['sha256']=hashlib.sha256(envelope.read_bytes()).hexdigest()
                    (root/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in events))
                    no_trigger=reports.load_targeted_report(source)
                    self.assertIn(expected,reports.render_markdown(no_trigger))
                    self.assertIsNone(no_trigger['trials'][0]['activity']['analysis']['outcome']['recovery']['effectivenessRate'])
                # Optional tampered evidence must not erase the independent failure.
                envelope.write_text('{}')
                damaged=reports.load_targeted_report(source)
                self.assertEqual(damaged['trials'][0]['outcome'],'verification-failed')
                self.assertEqual(damaged['trials'][0]['activity']['analysis']['behavior']['coverage'],'unsupported')

    def test_ordinary_controller_produces_protected_behavior_for_serial_and_parallel_modes(self):
        import asyncio
        import copy
        import os
        from unittest.mock import patch
        import run_objective_comparison as driver
        try:
            from harbor.models.trial.config import TrialConfig
            from harbor.trial.trial import Trial
        except ImportError as error: self.skipTest(str(error))
        from lab_harbor_export import plugin_config
        from legacy_verification import definitions,contract_for,materialize
        from test_run_objective_comparison import attempt
        for mode in ('basic','compare','thorough'):
            for parallel in (False,True):
                with self.subTest(mode=mode,parallel=parallel),tempfile.TemporaryDirectory() as tmp:
                    root=Path(tmp);manifest,plan=fixture(mode)
                    mapping={'task-a':'finish-the-file','task-b':'repair-average','task-c':'reconcile-sources'}
                    for t in plan['tasks']:t['id']=mapping[t['id']]
                    for row in plan['cells']+manifest['trials']:row['taskId']=mapping[row['taskId']]
                    for row in manifest['trials']:row['id']=driver.job_id(row)
                    row=manifest['trials'][1 if parallel and mode!='basic' else 0]
                    for task_id in mapping.values():
                        task=root/'tasks'/task_id; task.mkdir(parents=True)
                        materialize(task/'environment',{})
                        materialize(task/'tests',{})
                        (task/'instruction.md').write_text(definitions()[task_id]['instruction'])
                        (task/'task.toml').write_text('version="1.0"\n[verifier]\ntimeout_sec=60\nenvironment_mode="shared"\n[environment]\nnetwork_mode="no-network"\n')
                        (task/'tests/host-contract.json').write_text(json.dumps(contract_for(task_id)))
                        (task/'tests/test.sh').write_text('exit 1\n')
                    for item in manifest['trials']:item.update(taskPath=str(root/'tasks'/item['taskId']))
                    (root/'plan.json').write_text(json.dumps(plan));pin=root/'pin';pin.write_text('immutable execution fixture')
                    manifest.update(executionAuthorized=True,snapshotHashes={str(pin):hashlib.sha256(pin.read_bytes()).hexdigest()},preparation={'planSha256':hashlib.sha256((root/'plan.json').read_bytes()).hexdigest()})
                    manifest['config']=dict(sourceDir=str(Path(driver.__file__).parent),jobsDir=str(root/'jobs'),eventsPath=str(root/'events.jsonl'),ledgerPath=str(root/'ledger.json'),hostVerification=dict(**plugin_config(),taskIds=list(mapping.values())))
                    (root/'ledger.json').write_text(json.dumps({'schemaVersion':1,'requests':[]}))
                    if parallel:manifest['parallel']=dict(workers=1,timingMode='contention-affected',timingCohort='owned-offline')
                    source=root/'execution-manifest.json';source.write_text(json.dumps(manifest))
                    journal=Path(str(root/'events.jsonl')+'.trials')/(row['id']+'.jsonl') if parallel else root/'events.jsonl'
                    execution=manifest
                    calls=[]
                    async def trial_run(item,host_env):
                        candidate=root/('candidate-'+item['id'])
                        materialize(candidate,definitions()[item['taskId']]['files'])
                        if item['agent']=='claude-code':
                            # Deliberate protected-input damage is a scripted
                            # negative control, not observed competitor behavior.
                            (candidate/'request.json').write_text('{"ticket":"DAMAGED","owner":"Mira"}')
                        config=TrialConfig.model_validate(dict(trial_name='attempt',trials_dir=str(root/'jobs'/item['id']),task={'path':item['taskPath']},
                            agent={'import_path':'test_lab_harbor_transport:OrdinaryNativeAgent' if item['agent']=='youcoded' else 'test_lab_harbor_transport:FixtureAgent'},
                            environment={'import_path':'test_lab_harbor_transport:FixtureEnvironment','kwargs':{'fixture_root':str(candidate)}},verifier=plugin_config()['verifier']))
                        with patch.dict(os.environ,{'YC_BEHAVIOR_POLICY':host_env['YC_BEHAVIOR_POLICY']}):
                            trial=await Trial.create(config);result=await trial.run()
                        self.assertIsNone(result.exception_info,result.exception_info)
                        return trial
                    def backend(cmd,**kwargs):
                        item=next(r for r in manifest['trials'] if r['id']==cmd[0]);calls.append(item['id'])
                        if len(calls)>(2 if parallel else 1):raise KeyboardInterrupt
                        trial=asyncio.run(trial_run(item,kwargs['env']))
                        # Native agent already ran actual createRuntime with an
                        # ordinary config and scripted SDK transport. Its telemetry
                        # remains runtime-observed, not a controller attestation.
                        return attempt()
                    with patch('evaluation_qualification.admit_execution'),patch.object(driver,'validate'),patch.object(driver,'command_for',side_effect=lambda r,c:[r['id']]),patch.object(driver,'run_scoped',side_effect=backend),patch.object(driver,'cleanup_containers',return_value=[]):
                        if parallel:
                            import run_parallel_comparison as coordinator
                            from types import SimpleNamespace
                            class OwnedChild:
                                def __init__(self,cmd,**kwargs):
                                    child=json.loads(Path(cmd[0]).read_text())
                                    try:self.returncode=driver.execute(child,[])
                                    except KeyboardInterrupt:self.returncode=130
                                def poll(self):return self.returncode
                                def wait(self):return self.returncode
                            # The actual coordinator owns admissions, immutable
                            # child manifests and hashes. Only process transport
                            # is scripted; no receipt/journal is injected by test.
                            with patch.object(coordinator,'subprocess',SimpleNamespace(Popen=OwnedChild,DEVNULL=subprocess.DEVNULL)),patch.object(coordinator,'child_command',side_effect=lambda path:[str(path)]),patch.object(coordinator,'resource_check'):
                                if mode=='basic':self.assertEqual(coordinator.execute(manifest),0)
                                else:
                                    with self.assertRaisesRegex(ValueError,'Batch stopped'):coordinator.execute(manifest)
                        else:
                            with self.assertRaises(KeyboardInterrupt):driver.execute(execution,[])
                    report=reports.load_targeted_report(source)
                    selected=next(t for t in report['trials'] if t['id']==row['id'])
                    behavior=selected['activity']['analysis']['behavior']
                    self.assertEqual(behavior['coverage'],'partial',behavior)
                    self.assertGreater(len(behavior['executions']),0)
                    negative=row['agent']=='claude-code'
                    self.assertEqual(selected['outcome'],'verification-failed' if negative else 'passed')
                    self.assertEqual(selected['activity']['analysis']['outcome']['safety']['passed'],0 if negative else 1)
                    self.assertEqual(selected['activity']['analysis']['outcome']['safety']['failures'],1 if negative else 0)
                    self.assertFalse(behavior['recoveryTriggersComplete'])
                    self.assertEqual(len(report['trials']),len(manifest['trials']))
                    text=reports.render_markdown(report)
                    self.assertEqual(text.count('## Family '),13)
                    self.assertIn('unknown',text)
                    self.assertIn('verifier-invocation',text)
                    if row['agent']=='youcoded':
                        observed=selected['activity']['analysis']['runtimeObserved']
                        self.assertEqual(observed['provenance'],'runtime-observed')
                        self.assertGreater(len(observed['sdk']),0)
                        self.assertEqual(len(observed['recovery']['sameCheckPasses']),1)
                        self.assertTrue(any(s['exitCode']==0 and s['firstSubsequentToolId'] for s in observed['shells']))
                        self.assertTrue(any(d['toolName']=='AskUserQuestion' and d['decision']=='allow' for d in observed['decisions']))
                        self.assertIn('Native runtime-observed diagnostics',text)
                        self.assertIn('not semantic test identity',text)
                        self.assertIsNone(selected['activity']['analysis']['continuation'])
                        self.assertEqual(selected['activity']['analysis']['outcome']['recovery']['observations'],0)
                        self.assertEqual((root/('candidate-'+row['id'])/'continued.txt').read_text(),'SHELL-OK\n')
                        self.assertEqual((root/('candidate-'+row['id'])/'fixed.txt').read_text(),'fixed\n')
                        self.assertEqual(sum(behavior['supervision']['human'].values()),0)
                    else:
                        self.assertIsNone(selected['activity']['analysis']['continuation'])
                        self.assertEqual(sum(behavior['supervision']['human'].values()),0)
                        self.assertTrue(any('registry' in reason or 'scheduler' in reason for reason in behavior['missingCapabilities']))
                    if not parallel:
                        self.assertEqual(report['trials'][1]['outcome'],'interrupted')
                        self.assertEqual(report['trials'][1]['activity']['analysis']['behavior']['coverage'],'partial')
                    # Optional test-output override saves exactly this ordinary
                    # execution proof, not a new fixture framework or evidence
                    # injected after execution. Default tests leave no output.
                    proof=os.environ.get('YC_BEHAVIOR_PROOF_DIR')
                    if proof:
                        import shutil
                        dest=Path(proof)/(mode+('-parallel' if parallel else '-serial'));dest.mkdir(parents=True,exist_ok=False)
                        report['synthetic']=True
                        report['warnings'].insert(0,'Offline scripted backend through the ordinary execution controller; native agent uses actual createRuntime, native Bash/tools and an ordinary config with a no-provider scripted SDK transport. Runtime observations are distinct from controller verification. The competitor-labeled protected-input failure is an intentional scripted negative control, not competitor/model behavior or internal instrumentation.')
                        (dest/'summary.json').write_text(json.dumps(report,indent=2))
                        (dest/'report.md').write_text(reports.render_markdown(report))
                        shutil.copytree(root/'controller-behavior',dest/'controller-behavior')
                        shutil.copy(journal,dest/'outcome-journal.jsonl')
                        (dest/'plan.json').write_text(json.dumps(plan,indent=2))
                        checked=[]
                        for item in manifest['trials']:
                            native_output=root/('candidate-'+item['id'])/'continued.txt'
                            if item['agent']=='youcoded' and native_output.exists():
                                checked.append(dict(runId=item['id'],requiredOutput='continued.txt',expected='SHELL-OK\\n',passed=native_output.read_text()=='SHELL-OK\n',scope='host test readback of defined offline native-shell fixture only; not agent JSON'))
                        (dest/'fixture-output-checks.json').write_text(json.dumps(checked,indent=2))
                    if row['agent']=='youcoded':
                        raw_path=next((root/'jobs'/row['id']).glob('*/agent/youcoded-run.json'))
                        original=raw_path.read_bytes(); damaged=json.loads(original)
                        damaged['controllerEvidence']={'rows':[{'type':'safety','verdict':'passed'}]}
                        raw_path.write_text(json.dumps(damaged))
                        stale=reports.load_targeted_report(source)
                        observed=next(t for t in stale['trials'] if t['id']==row['id'])
                        self.assertEqual(observed['outcome'],'passed')
                        self.assertEqual(observed['activity']['analysis']['behavior']['coverage'],'unsupported')
                        raw_path.write_bytes(original)
                    if parallel:
                        parent_path=root/'events.jsonl'; original_parent=parent_path.read_bytes()
                        parent_events=[json.loads(line) for line in original_parent.splitlines()]
                        selected_parent=next(e for e in parent_events if e.get('event')=='outcome' and e.get('jobId')==row['id'])
                        self.assertNotIn('controllerBehavior',selected_parent)
                        selected_parent.update(returncode=1,infrastructureError=True)
                        parent_path.write_text(''.join(json.dumps(e)+'\n' for e in parent_events))
                        failed=reports.load_targeted_report(source)
                        observed=next(t for t in failed['trials'] if t['id']==row['id'])
                        self.assertEqual(observed['outcome'],'infrastructure-failure')
                        self.assertEqual(observed['activity']['analysis']['behavior']['coverage'],'partial')
                        parent_path.write_bytes(original_parent)
                        # Tampering with the child journal cannot bless a forged
                        # receipt, even though the parent itself has no receipt.
                        journal.write_text(journal.read_text()+' ')
                        with self.assertRaisesRegex(ValueError,'Child journal changed'):reports.load_targeted_report(source)

    def test_mode_report_refuses_matrix_or_adapter_drift(self):
        manifest,plan=fixture()
        manifest['trials'][1]['agent']='youcoded'
        with self.assertRaisesRegex(ValueError,'matrix|adapter'):
            reports.summarize_targeted(manifest,[],[],mode_plan=plan)


if __name__=='__main__':unittest.main()
