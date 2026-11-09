"""Offline tests: Harbor/Docker are mocked; local sleeper processes test cleanup.

No container, gateway, model call or provider credential is used.
"""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import signal
import tempfile
import unittest
from unittest.mock import patch

import run_objective_comparison as driver


def attempt(rc=0, output=b'output', error=None, interrupted=False):
    return dict(returncode=rc, output=output, runnerError=error,
                interrupted=interrupted, processCleanupErrors=[])


class ObjectiveLauncherTests(unittest.TestCase):
    def setUp(self):
        # These are injected orchestration tests, NOT execution authorization.
        # Universal real-admission refusal is pinned in test_security_corrections.
        authority=patch('evaluation_qualification.admit_execution',return_value=None)
        authority.start();self.addCleanup(authority.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        source = self.root/'source'
        source.mkdir()
        for name, value in {'router_agents.py': '# frozen\n', 'gate-network.yaml': 'services: {}',
                            'model-panel.json': json.dumps({'models': [{'id': 'qwen/qwen3.8-flash'},
                            {'id': 'anthropic/claude-haiku-5.5'}]})}.items():
            (source/name).write_text(value)
        harbor = self.root/'harbor'
        harbor.write_text('#!/bin/false\n'); harbor.chmod(0o700)
        self.ledger = self.root/'ledger.json'
        self.state = dict(schemaVersion=1, accountingMode='estimated', closed=False,
                          limitUsd=15, chargedUsd=1, reservedUsd=0,
                          externalPriorUsd=0.4, providerUsageUsd=0.7)
        self.save_ledger()
        rows = []
        for i in range(2):
            task = self.root/f'task{i}'
            for name in ('task.toml', 'instruction.md', 'environment/Dockerfile', 'tests/test.sh'):
                p = task/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('fixture')
            token = self.root/f'token{i}'
            token.write_text('opaque-trial-token-'+str(i)*32); token.chmod(0o600)
            rows.append(dict(id=f'heldout-{i}', trialKey=f'key-{i}', taskId=f'task{i}',
                             model='qwen/qwen3.8-flash', agent='pi', tokenFile=str(token), taskPath=str(task)))
        self.m = dict(schemaVersion=1, executionAuthorized=True,
                      nativeSettings=dict(maxRequests=20, timeoutSec=180,
                                          differences='Native production defaults; reasoning is not matched.'),
                      config=dict(sourceDir=str(source), harbor=str(harbor), gateUrl='http://gate:8080',
                                  comparisonKey='objective-v1', ledgerPath=str(self.ledger),
                                  jobsDir=str(self.root/'jobs'), eventsPath=str(self.root/'events.jsonl'),
                                  budgetCapUsd=15, stopMarginUsd=0.1), trials=rows, snapshotHashes={})
        self.hash_inputs()

    def save_ledger(self):
        self.ledger.write_text(json.dumps(self.state))

    def hash_inputs(self):
        paths = driver.files_under(Path(self.m['config']['sourceDir']))
        for row in self.m['trials']:
            paths |= driver.files_under(Path(row['taskPath']))
        self.m['snapshotHashes'] = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}

    def run_cli(self, *flags):
        path = self.root/'manifest.json'
        path.write_text(json.dumps(self.m))
        with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()):
            rc = driver.main(['--manifest', str(path), *flags])
        return rc, out.getvalue()

    def result(self, row, rewards=None, exception=None):
        path = Path(self.m['config']['jobsDir'])/driver.job_id(row)/'trial'/ 'result.json'
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(dict(verifier_result={'rewards': rewards}, exception_info=exception)))

    def events(self):
        return [json.loads(s) for s in Path(self.m['config']['eventsPath']).read_text().splitlines()]

    def test_dry_run_no_writes_launch_or_secrets(self):
        manifest_path = self.root/'manifest.json'
        manifest_path.write_text(json.dumps(self.m))
        before = set(self.root.rglob('*'))
        with patch.object(driver, 'run_scoped') as run:
            rc, out = self.run_cli('--dry-run')
        self.assertEqual(rc, 0)
        self.assertEqual(set(self.root.rglob('*')), before)
        run.assert_not_called()
        for row in self.m['trials']:
            self.assertNotIn(Path(row['tokenFile']).read_text(), out)
        self.assertEqual(len(json.loads(out)['commands']), 2)

    def test_native_snapshot_covers_runtime_and_exact_upload_inputs(self):
        desktop = self.root/'desktop'
        for name in ['dist/main/create-runtime.js', 'package.json', 'package-lock.json'] + [
                'test-engine/lab-'+n+'.mjs' for n in
                ('runner', 'worker', 'observer', 'state', 'scenario', 'faults', 'clarifications', 'io')]:
            p = desktop/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('frozen')
        self.m['config']['desktopDir'] = str(desktop)
        self.m['trials'][0]['agent'] = 'youcoded'
        self.assertEqual(self.run_cli('--dry-run')[0], 2)
        for p in desktop.rglob('*'):
            if p.is_file(): self.m['snapshotHashes'][str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
        self.assertEqual(self.run_cli('--dry-run')[0], 0)
        for directory in (desktop, desktop/'dist', desktop/'test-engine'):
            for name in ('__pycache__', 'crafted.pyc'):
                artifact = directory/name
                if name == '__pycache__': artifact.mkdir()
                else: artifact.write_bytes(b'bytecode')
                self.assertEqual(self.run_cli('--dry-run')[0], 2)
                self.assertTrue(artifact.exists())
                if artifact.is_dir(): artifact.rmdir()
                else: artifact.unlink()
        (desktop/'test-engine/lab-io.mjs').unlink()
        self.assertEqual(self.run_cli('--dry-run')[0], 2)

    def variant_fixture(self):
        variants = {}
        for variant in ('baseline', 'candidate'):
            desktop = self.root/variant
            for name in ['dist/main/create-runtime.js', 'package.json', 'package-lock.json'] + [
                    'test-engine/lab-'+n+'.mjs' for n in
                    ('runner', 'worker', 'observer', 'state', 'scenario', 'faults', 'clarifications', 'io')]:
                p = desktop/name; p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(variant+' '+name)
                self.m['snapshotHashes'][str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
            variants[variant] = str(desktop)
        self.m['config']['desktopVariants'] = variants
        for row, variant in zip(self.m['trials'], variants):
            row.update(agent='youcoded', buildVariant=variant)
        return variants

    def test_variants_select_distinct_hashed_builds_and_allow_single_row_children(self):
        variants = self.variant_fixture()
        self.assertEqual(self.run_cli('--dry-run')[0], 0)
        for row in self.m['trials']:
            self.assertIn('desktop_dir='+variants[row['buildVariant']],
                          driver.command_for(row, self.m['config']))
        candidate_runtime = str(Path(variants['candidate'])/'dist/main/create-runtime.js')
        digest = self.m['snapshotHashes'].pop(candidate_runtime)
        self.assertEqual(self.run_cli('--dry-run')[0], 2)
        self.m['snapshotHashes'][candidate_runtime] = digest
        Path(candidate_runtime).write_text('unreviewed candidate')
        self.assertEqual(self.run_cli('--dry-run')[0], 2)
        Path(candidate_runtime).write_text('candidate dist/main/create-runtime.js')
        self.m['trials'] = self.m['trials'][:1]
        self.assertEqual(self.run_cli('--dry-run')[0], 0)

    def test_variant_configuration_refuses_ambiguous_missing_and_non_native_selection(self):
        self.variant_fixture()
        original = copy.deepcopy(self.m)
        mutations = [lambda m: m['trials'][0].pop('buildVariant'),
                     lambda m: m['trials'][0].update(buildVariant='unknown'),
                     lambda m: m['trials'][0].update(agent='pi'),
                     lambda m: m['config']['desktopVariants'].pop('candidate'),
                     lambda m: m['config']['desktopVariants'].update(extra='/unused'),
                     lambda m: m['config'].update(desktopDir='/ambiguous'),
                     lambda m: m['config'].pop('desktopVariants')]
        for mutate in mutations:
            self.m = copy.deepcopy(original); mutate(self.m)
            self.assertEqual(self.run_cli('--dry-run')[0], 2)

    def test_command_models_and_native_metadata(self):
        for agent in driver.AGENTS:
            row = dict(self.m['trials'][0], agent=agent)
            cmd = driver.command_for(row, dict(self.m['config'], desktopDir='/frozen/desktop'))
            self.assertEqual(cmd[cmd.index('-m')+1], row['model'] if agent == 'youcoded' else 'openrouter/'+row['model'])
            self.assertIn('router_agents:'+driver.AGENTS[agent], cmd)
            self.assertEqual(cmd[cmd.index('--max-retries')+1], '0')
            self.assertEqual(cmd[cmd.index('-n')+1], '1')
            self.assertEqual(any(s.startswith('desktop_dir=') for s in cmd), agent == 'youcoded')
            if agent == 'youcoded':
                self.assertIn('comparison_key=objective-v1', cmd)
                self.assertIn('task_id=task0', cmd)
                self.assertIn('repetition=0', cmd)
        self.assertNotEqual(driver.job_id(self.m['trials'][0]), driver.job_id(self.m['trials'][1]))
        self.assertLess(len(driver.job_id(self.m['trials'][0])), 30)

    def test_quality_failure_continues_and_completed_prefix_never_replayed(self):
        calls = []
        def run(cmd, **kwargs):
            row = self.m['trials'][len(calls)]
            self.assertEqual(cmd[cmd.index('--job-name')+1], driver.job_id(row))
            self.assertEqual(kwargs['timeout'], 600)
            self.assertEqual(kwargs['env']['PYTHONPATH'], self.m['config']['sourceDir'])
            self.assertNotIn('OPENROUTER_API_KEY', kwargs['env'])
            calls.append(cmd)
            self.result(row, {'reward': 0 if len(calls) == 1 else 1})
            return attempt()
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': 'sk-provider-private'}), patch.object(driver, 'run_scoped', side_effect=run):
            self.assertEqual(self.run_cli('--execute')[0], 0)
            self.assertEqual(self.run_cli('--execute')[0], 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.events()[1]['rewards'], {'reward': 0})
        self.assertFalse(self.events()[1]['infrastructureError'])

    def test_ordinary_execution_seals_host_callbacks_before_outcome_not_agent_claims(self):
        from controller_behavior import record_host
        def run(cmd, **kwargs):
            row=next(r for r in self.m['trials'] if driver.job_id(r)==cmd[cmd.index('--job-name')+1])
            self.result(row,{'reward':0})
            agent=Path(self.m['config']['jobsDir'])/driver.job_id(row)/'trial/agent'; agent.mkdir()
            (agent/'trajectory.json').write_text(json.dumps({'agent':{'name':'pi'},'steps':[], 'controllerEvidence':{'forged':True}}))
            record_host('execution',dict(testId='named-check',exitCode=1),policy=kwargs['env']['YC_BEHAVIOR_POLICY'])
            record_host('safety',dict(kind='unrelated-preservation',verdict='failed',source='verifier'),policy=kwargs['env']['YC_BEHAVIOR_POLICY'])
            return attempt()
        with patch.object(driver,'run_scoped',side_effect=run):
            self.assertEqual(self.run_cli('--execute')[0],0)
        for event in self.events()[1::2]:
            receipt=event['controllerBehavior']; path=Path(receipt['path'])
            self.assertEqual(path.parent,self.root/'controller-behavior')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),receipt['sha256'])
            envelope=json.loads(path.read_text())
            self.assertEqual([r['type'] for r in envelope['rows']],['execution','safety'])
            self.assertEqual(envelope['rows'][0]['exitCode'],1)
            self.assertFalse(envelope['capture']['recoveryTriggersComplete'])
            self.assertNotIn('forged',json.dumps(envelope['rows']))

    def test_failure_and_interruption_still_publish_behavior_receipt(self):
        for interrupted in (False,True):
            with self.subTest(interrupted=interrupted):
                events=Path(self.m['config']['eventsPath'])
                if events.exists(): events.unlink()
                runner=patch.object(driver,'run_scoped',side_effect=KeyboardInterrupt) if interrupted else patch.object(driver,'run_scoped',return_value=attempt(1,error='failed'))
                with runner:
                    if interrupted:
                        with self.assertRaises(KeyboardInterrupt): self.run_cli('--execute')
                    else: self.assertEqual(self.run_cli('--execute')[0],2)
                event=self.events()[-1]; receipt=event['controllerBehavior']
                self.assertTrue(Path(receipt['path']).is_file())
                self.assertTrue(event['infrastructureError'])

    def test_timeout_partial_output_and_replay_refusal(self):
        secret = Path(self.m['trials'][0]['tokenFile']).read_text()
        result = attempt(None, ('partial '+secret+' sk-provider-private').encode(), 'Subprocess timeout')
        with patch.object(driver, 'run_scoped', return_value=result) as run:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(run.call_count, 1)
        text = Path(self.m['config']['eventsPath']).read_text()
        self.assertIn('partial', text)
        self.assertNotIn(secret, text)
        self.assertNotIn('sk-provider-private', text)
        self.assertTrue(self.events()[1]['infrastructureError'])

    def test_interruption_started_is_durable_and_cannot_replay(self):
        with patch.object(driver, 'run_scoped', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.run_cli('--execute')
        self.assertEqual(len(self.events()), 2)
        self.assertTrue(self.events()[1]['interrupted'])
        with patch.object(driver, 'run_scoped') as run:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            run.assert_not_called()

    def test_missing_rewards_exception_and_nonzero_exit_halt(self):
        for rewards, exception, rc in [(None, None, 0), ({'reward': 1}, {'exception_message': 'infra'}, 0),
                                       ({'reward': 1}, None, 1)]:
            with self.subTest(rewards=rewards, exception=exception, rc=rc):
                self.m['config']['eventsPath'] = str(self.root/f'events-{rc}-{bool(exception)}.jsonl')
                self.m['config']['jobsDir'] = str(self.root/f'jobs-{rc}-{bool(exception)}')
                def run(cmd, **kwargs):
                    self.result(self.m['trials'][0], rewards, exception)
                    return attempt(rc, b'partial')
                with patch.object(driver, 'run_scoped', side_effect=run) as mock:
                    self.assertEqual(self.run_cli('--execute')[0], 2)
                    self.assertEqual(mock.call_count, 1)

    def test_refusals(self):
        original = copy.deepcopy(self.m)
        mutations = [lambda m: m.update(executionAuthorized=False),
                     lambda m: m['snapshotHashes'].clear(),
                     lambda m: m['trials'].append(copy.deepcopy(m['trials'][0])),
                     lambda m: m['trials'][0].update(agent='hermes'),
                     lambda m: m['config'].update(gateUrl='http://user:password@gate:8080')]
        for mutate in mutations:
            self.m = copy.deepcopy(original); mutate(self.m)
            with patch.object(driver, 'run_scoped') as run:
                self.assertEqual(self.run_cli('--execute')[0], 2)
                run.assert_not_called()
        self.m = original
        token = Path(self.m['trials'][0]['tokenFile']); token.chmod(0o644)
        self.assertEqual(self.run_cli('--dry-run')[0], 2)
        token.chmod(0o600)
        Path(self.m['trials'][0]['taskPath'], 'instruction.md').write_text('changed')
        self.assertEqual(self.run_cli('--dry-run')[0], 2)

    def test_budget_floor_reserved_and_cap(self):
        self.state.update(chargedUsd=1, externalPriorUsd=0.4, providerUsageUsd=14.4, reservedUsd=0.1)
        self.save_ledger()
        self.assertEqual(self.run_cli('--dry-run')[0], 2)
        self.state.update(providerUsageUsd=1, closed=True); self.save_ledger()
        self.assertEqual(self.run_cli('--dry-run')[0], 2)

    def test_budget_rechecked_between_trials_without_ledger_mutation(self):
        def run(cmd, **kwargs):
            self.result(self.m['trials'][0], {'reward': 1})
            self.state['providerUsageUsd'] = 14.6; self.save_ledger()
            return attempt(output=b'ok')
        with patch.object(driver, 'run_scoped', side_effect=run) as mock:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(mock.call_count, 1)
        self.assertEqual(json.loads(self.ledger.read_text()), self.state)
        self.assertEqual(len(self.events()), 2)

    def test_concurrent_launcher_journal_lock_refused(self):
        path = Path(self.m['config']['eventsPath'])
        with path.open('a+') as stream:
            driver.fcntl.flock(stream, driver.fcntl.LOCK_EX | driver.fcntl.LOCK_NB)
            with patch.object(driver, 'run_scoped') as run:
                self.assertEqual(self.run_cli('--execute')[0], 2)
                run.assert_not_called()
        self.assertEqual(path.read_text(), '')

    def test_existing_evidence_and_changed_manifest_refused(self):
        job = Path(self.m['config']['jobsDir'])/driver.job_id(self.m['trials'][0]); job.mkdir(parents=True)
        with patch.object(driver, 'run_scoped') as run:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            run.assert_not_called()
        job.rmdir()
        with patch.object(driver, 'run_scoped', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt): self.run_cli('--execute')
        self.m['config']['comparisonKey'] = 'changed'
        with patch.object(driver, 'run_scoped') as run:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            run.assert_not_called()

    def test_storage_floor_stops_without_launch_or_deletion(self):
        with patch.object(driver.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 1024})()):
            with patch.object(driver, 'run_scoped') as run:
                self.assertEqual(self.run_cli('--execute')[0], 2)
                run.assert_not_called()
        self.assertTrue(self.ledger.is_file())
        self.assertFalse(Path(self.m['config']['eventsPath']).exists())
        self.m['config']['minFreeBytes'] = 512
        with patch.object(driver.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 1024})()):
            self.assertEqual(self.run_cli('--dry-run')[0], 0)

    def test_python_cache_artifacts_are_refused_without_deletion(self):
        for root in (Path(self.m['config']['sourceDir']), Path(self.m['trials'][0]['taskPath'])):
            for name in ('router_agents.pyc', '__pycache__'):
                with self.subTest(root=root, name=name):
                    artifact = root/name
                    if name == '__pycache__': artifact.mkdir()
                    else: artifact.write_bytes(b'crafted-bytecode')
                    self.assertEqual(self.run_cli('--dry-run')[0], 2)
                    self.assertTrue(artifact.exists())
                    if artifact.is_dir(): artifact.rmdir()
                    else: artifact.unlink()

    def test_cache_injected_between_trials_refuses_second_start(self):
        artifact = Path(self.m['config']['sourceDir'])/'router_agents.pyc'
        def run(cmd, **kwargs):
            self.result(self.m['trials'][0], {'reward': 1})
            artifact.write_bytes(b'crafted-bytecode')
            return attempt()
        with patch.object(driver, 'run_scoped', side_effect=run) as run:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(run.call_count, 1)
        self.assertEqual(len(self.events()), 2)
        self.assertTrue(artifact.exists())

    def test_cleanup_failure_recorded_and_never_retried(self):
        with patch.object(driver, 'run_scoped', return_value=attempt(1)) as run, \
             patch.object(driver, 'cleanup_containers', return_value=['Scoped cleanup failed']) as cleanup:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(run.call_count, 1)
            cleanup.assert_called_once_with(self.m['trials'][0], self.m['config'])
        self.assertEqual(self.events()[1]['cleanupErrors'], ['Scoped cleanup failed'])

    def test_real_local_timeout_kills_descendant_and_keeps_output(self):
        pidfile = self.root/'child.pid'
        script = ("import subprocess,sys,time; "
                  "p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
                  "print('partial-local',flush=True); open(sys.argv[1],'w').write(str(p.pid)); time.sleep(60)")
        result = driver.run_scoped([sys.executable, '-c', script, str(pidfile)], env=dict(os.environ), timeout=0.3)
        self.assertIsNotNone(result['runnerError'])
        self.assertIn(b'partial-local', result['output'])
        self.assertEqual(result['processCleanupErrors'], [])
        pid = int(pidfile.read_text())
        # A reparented zombie is stopped, even if PID 1 has not reaped it yet.
        status = Path(f'/proc/{pid}/stat')
        for _ in range(50):
            if not status.exists() or status.read_text().split(') ')[1].startswith('Z'): break
            time.sleep(0.02)
        else:
            os.kill(pid, signal.SIGKILL)
            self.fail('Trial descendant remained running after timeout cleanup')

    def test_real_local_sigterm_cleans_child_group(self):
        pidfile = self.root/'sigterm-child.pid'
        child = ("import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
                 "print('interrupted-partial',flush=True); open(sys.argv[1],'w').write(str(p.pid)); time.sleep(60)")
        script = ("import run_objective_comparison as d,sys,os,json\n"
                  "with d.stop_signals():\n"
                  " r=d.run_scoped([sys.executable,'-c',sys.argv[1],sys.argv[2]],env=dict(os.environ))\n"
                  "print(json.dumps({'interrupted':r['interrupted'],'errors':r['processCleanupErrors'],"
                  "'output':r['output'].decode()}))\n")
        env = dict(os.environ, PYTHONPATH=str(Path(driver.__file__).parent), PYTHONDONTWRITEBYTECODE='1')
        proc = subprocess.Popen([sys.executable, '-c', script, child, str(pidfile)],
                                env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            for _ in range(200):
                if pidfile.exists() and pidfile.read_text(): break
                time.sleep(0.01)
            else: self.fail('Local child did not become ready')
            proc.send_signal(signal.SIGTERM)
            output, stderr = proc.communicate(timeout=10)
            self.assertEqual(proc.returncode, 0, stderr)
            result = json.loads(output)
            self.assertTrue(result['interrupted'])
            self.assertEqual(result['errors'], [])
            self.assertIn('interrupted-partial', result['output'])
            pid = int(pidfile.read_text())
            status = Path(f'/proc/{pid}/stat')
            self.assertTrue(not status.exists() or status.read_text().split(') ')[1].startswith('Z'))
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate(timeout=5)

    def test_signal_between_spawn_and_registration_cannot_orphan_local_child(self):
        ready = self.root/'spawn-ready.json'
        report = self.root/'spawn-report.json'
        sleeper = ("import json,os,signal,sys; "
                   "m=signal.pthread_sigmask(signal.SIG_BLOCK,[]); "
                   "open(sys.argv[1],'w').write(json.dumps(dict(pid=os.getpid(),blocked=[int(s) for s in m],"
                   "termDefault=signal.getsignal(signal.SIGTERM)==signal.SIG_DFL,"
                   "intDefault=signal.getsignal(signal.SIGINT)==signal.default_int_handler))); signal.pause()")
        worker = '''import json,os,signal,subprocess,sys,time
from pathlib import Path
import run_objective_comparison as d
original=subprocess.Popen
ready=Path(sys.argv[1])
def spawn(*args,**kwargs):
 p=original(*args,**kwargs)
 deadline=time.monotonic()+10
 while not (ready.exists() and ready.read_text()):
  if time.monotonic()>deadline: raise RuntimeError('Child readiness missing')
  time.sleep(.01)
 os.kill(os.getpid(),signal.SIGINT)
 return p
d.subprocess.Popen=spawn
with d.stop_signals():
 result=d.run_scoped([sys.executable,'-c',sys.argv[3],str(ready)],env=dict(os.environ))
Path(sys.argv[2]).write_text(json.dumps(dict(interrupted=result['interrupted'],errors=result['processCleanupErrors'])))
'''
        env = dict(os.environ, PYTHONPATH=str(Path(driver.__file__).parent), PYTHONDONTWRITEBYTECODE='1')
        proc = subprocess.Popen([sys.executable, '-B', '-c', worker, str(ready), str(report), sleeper],
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        pid = None
        try:
            _, stderr = proc.communicate(timeout=20)
            self.assertEqual(proc.returncode, 0, stderr)
            child = json.loads(ready.read_text())
            pid = child['pid']
            self.assertNotIn(int(signal.SIGINT), child['blocked'])
            self.assertNotIn(int(signal.SIGTERM), child['blocked'])
            self.assertTrue(child['termDefault'])
            self.assertTrue(child['intDefault'])
            self.assertEqual(json.loads(report.read_text()), dict(interrupted=True, errors=[]))
            status = Path(f'/proc/{pid}/stat')
            self.assertTrue(not status.exists() or status.read_text().split(') ')[1].startswith('Z'),
                            'Child orphaned between launch and registration')
        finally:
            # Exact test-owned PIDs only; the red reproducer must not leak its sleeper.
            if pid is None and ready.exists():
                pid = json.loads(ready.read_text())['pid']
            if pid is not None:
                try: os.killpg(pid, signal.SIGKILL)
                except ProcessLookupError: pass
            if proc.poll() is None:
                proc.kill()
                proc.communicate(timeout=5)

    def test_exact_docker_cleanup_boundary(self):
        row = self.m['trials'][0]
        job = Path(self.m['config']['jobsDir'])/driver.job_id(row)
        trial = job/'task0__AbC1234'; trial.mkdir(parents=True)
        (trial/'config.json').write_text(json.dumps({'trial_name': trial.name,
             'task': {'path': row['taskPath']}, 'trials_dir': str(job)}))
        project = 'task0__abc1234__env'
        cid = 'a'*64
        calls = []
        def docker(cmd, **kwargs):
            calls.append(cmd)
            self.assertEqual(cmd[0], 'docker')
            if cmd[1] == 'ps':
                self.assertIn('label=com.docker.compose.project='+project, cmd)
                return subprocess.CompletedProcess(cmd, 0, (cid+'\n').encode())
            if cmd[1] == 'inspect':
                return subprocess.CompletedProcess(cmd, 0, json.dumps([{'Id': cid,
                    'Config': {'Labels': {'com.docker.compose.project': project,
                     'com.docker.compose.project.working_dir': row['taskPath']+'/environment'}},
                    'State': {'Running': not any(c[1] == 'stop' for c in calls)}}]).encode())
            self.assertEqual(cmd, ['docker', 'stop', '--time', '5', cid])
            return subprocess.CompletedProcess(cmd, 0, b'')
        with patch.object(driver.subprocess, 'run', side_effect=docker):
            self.assertEqual(driver.cleanup_containers(row, self.m['config']), [])
        self.assertTrue(any(c[1] == 'stop' for c in calls))

    def test_docker_mismatched_labels_or_task_never_stopped(self):
        row = self.m['trials'][0]
        job = Path(self.m['config']['jobsDir'])/driver.job_id(row)
        trial = job/'task0__AbC1234'; trial.mkdir(parents=True)
        config = {'trial_name': trial.name, 'task': {'path': row['taskPath']}, 'trials_dir': str(job)}
        path = trial/'config.json'; path.write_text(json.dumps(config))
        cid = 'b'*64
        for project, working in [('unrelated-project', row['taskPath']+'/environment'),
                                 ('task0__abc1234__env', '/unrelated/environment')]:
            calls = []
            def docker(cmd, **kwargs):
                calls.append(cmd)
                if cmd[1] == 'ps': return subprocess.CompletedProcess(cmd, 0, (cid+'\n').encode())
                self.assertEqual(cmd[1], 'inspect')
                return subprocess.CompletedProcess(cmd, 0, json.dumps([{'Id': cid, 'Config': {'Labels': {
                    'com.docker.compose.project': project,
                    'com.docker.compose.project.working_dir': working}}}]).encode())
            with patch.object(driver.subprocess, 'run', side_effect=docker):
                self.assertTrue(driver.cleanup_containers(row, self.m['config']))
            self.assertFalse(any(c[1] == 'stop' for c in calls))
        config['task']['path'] = '/unrelated/task'; path.write_text(json.dumps(config))
        with patch.object(driver.subprocess, 'run') as docker:
            self.assertTrue(driver.cleanup_containers(row, self.m['config']))
            docker.assert_not_called()

    def test_docker_failure_or_still_running_is_reported(self):
        row = self.m['trials'][0]
        job = Path(self.m['config']['jobsDir'])/driver.job_id(row)
        trial = job/'task0__AbC1234'; trial.mkdir(parents=True)
        (trial/'config.json').write_text(json.dumps({'trial_name': trial.name,
            'task': {'path': row['taskPath']}, 'trials_dir': str(job)}))
        cid = 'c'*64
        with patch.object(driver.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'failed')):
            self.assertTrue(driver.cleanup_containers(row, self.m['config']))
        def docker(cmd, **kwargs):
            if cmd[1] == 'ps': return subprocess.CompletedProcess(cmd, 0, (cid+'\n').encode())
            if cmd[1] == 'stop': return subprocess.CompletedProcess(cmd, 0, b'')
            return subprocess.CompletedProcess(cmd, 0, json.dumps([{'Id': cid, 'Config': {'Labels': {
                'com.docker.compose.project': 'task0__abc1234__env',
                'com.docker.compose.project.working_dir': row['taskPath']+'/environment'}},
                'State': {'Running': True}}]).encode())
        with patch.object(driver.subprocess, 'run', side_effect=docker):
            self.assertTrue(driver.cleanup_containers(row, self.m['config']))

    def test_explicit_modes_and_optional_output(self):
        out = self.root/'commands.json'
        self.assertEqual(self.run_cli('--dry-run', '--output', str(out))[0], 0)
        self.assertTrue(out.is_file())
        self.assertEqual(self.run_cli('--dry-run', '--output', str(out))[0], 2)
        with self.assertRaises(SystemExit): self.run_cli()


if __name__ == '__main__':
    unittest.main()
