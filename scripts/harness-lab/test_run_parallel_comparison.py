"""Offline coordinator tests. Real local children; no gateway, Docker or paid calls."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch

import run_objective_comparison as serial
import test_run_objective_comparison as serial_tests
import run_parallel_comparison as parallel

REAL_HOST_CAPACITY = parallel.host_capacity


# Children handshake through files, not assumed startup delays. Deadlines only bound
# a broken test; overlap/cap assertions use observed admission and release state.
FAKE = '''import hashlib,json,os,signal,sys,time
from pathlib import Path
m=json.loads(Path(sys.argv[1]).read_text())
r=m['trials'][0]; root=Path(sys.argv[2]); key=r['trialKey']
p=root/(key+'.started')
interrupted=False
def stop(s,f):
 global interrupted
 interrupted=True
signal.signal(signal.SIGINT,stop); signal.signal(signal.SIGTERM,stop)
tmp=p.with_suffix('.tmp'); tmp.write_text(json.dumps(dict(pid=os.getpid(),env=dict(os.environ),manifest=m))); tmp.rename(p)
while not interrupted and not (root/(key+'.release')).exists(): time.sleep(.01)
fingerprint=hashlib.sha256(json.dumps(m,sort_keys=True).encode()).hexdigest()
infra=interrupted or (root/(key+'.infra')).exists()
events=[dict(event='started',trialKey=key,manifestSha256=fingerprint),dict(event='outcome',trialKey=key,manifestSha256=fingerprint,infrastructureError=infra,interrupted=interrupted,cleanupErrors=[],returncode=0,rewards={'reward':0})]
Path(m['config']['eventsPath']).write_text(''.join(json.dumps(e)+'\\n' for e in events))
(root/(key+'.cleaned')).write_text('done')
sys.exit(2 if infra else 0)
'''


def wait_for(predicate):
    deadline = time.monotonic() + 15
    while not predicate():
        if time.monotonic() >= deadline:
            raise AssertionError('Local child handshake did not arrive')
        time.sleep(.01)


class ParallelTests(unittest.TestCase):
    def setUp(self):
        fixture = serial_tests.ObjectiveLauncherTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.root, self.m = fixture.root, fixture.m
        capacity = patch.object(parallel, 'host_capacity', return_value=dict(cpus=32, memoryBytes=2**40))
        capacity.start()
        self.addCleanup(capacity.stop)
        self.m['parallel'] = dict(workers=2, timingMode='contention-affected',
                                  timingCohort='parallel-two', reserveMemoryBytes=1024)
        self.m['config']['minFreeBytes'] = 1
        source = Path(self.m['config']['sourceDir'])
        (source/'run_objective_comparison.py').write_bytes(Path(serial.__file__).read_bytes())
        for row in self.m['trials']:
            (Path(row['taskPath'])/'task.toml').write_text(
                '[environment]\ncpus=1\nmemory_mb=1\nstorage_mb=1\n')
        fixture.hash_inputs()
        self.fake = self.root/'fake.py'
        self.fake.write_text(FAKE)
        self.manifest = self.root/'manifest.json'
        self.errors = []

    def command(self, manifest):
        return [sys.executable, '-B', str(self.fake), str(manifest), str(self.root)]

    def run_cli(self, *flags):
        self.manifest.write_text(json.dumps(self.m))
        with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()):
            rc = parallel.main(['--manifest', str(self.manifest), *flags])
        return rc, out.getvalue()

    def controller(self, fn):
        def run():
            try:
                fn()
            except BaseException as exc:
                self.errors.append(exc)
                # Release sleepers even when an assertion fails.
                for row in self.m['trials']:
                    (self.root/(row['trialKey']+'.release')).touch()
        thread = threading.Thread(target=run)
        thread.start()
        self.addCleanup(thread.join, 20)
        return thread

    def started(self, key):
        return (self.root/(key+'.started')).exists()

    def release(self, key):
        (self.root/(key+'.release')).touch()

    def events(self):
        return [json.loads(s) for s in Path(self.m['config']['eventsPath']).read_text().splitlines()]

    def test_dry_run_validates_offline_no_writes_and_explicit_output(self):
        self.manifest.write_text(json.dumps(self.m))
        before = set(self.root.rglob('*'))
        with patch.object(parallel.subprocess, 'Popen') as launch:
            rc, out = self.run_cli('--dry-run')
        self.assertEqual(rc, 0)
        self.assertEqual(set(self.root.rglob('*')), before)
        launch.assert_not_called()
        report = json.loads(out)
        self.assertEqual(report['workers'], 2)
        self.assertEqual(report['timingMode'], 'contention-affected')
        self.assertEqual(len(report['children']), 2)
        target = self.root/'preview.json'
        self.assertEqual(self.run_cli('--dry-run', '--output', str(target))[0], 0)
        self.assertTrue(target.is_file())
        self.assertEqual(self.run_cli('--dry-run', '--output', str(target))[0], 2)

    def test_cli_dry_run_without_bytecode_flag_does_not_write_import_caches(self):
        launcher = self.root/'launcher'
        launcher.mkdir()
        script = launcher/'run_parallel_comparison.py'
        script.write_bytes(Path(parallel.__file__).read_bytes())
        (launcher/'run_objective_comparison.py').write_bytes(Path(serial.__file__).read_bytes())
        self.m['parallel']['workers'] = 1
        for row in self.m['trials']:
            (Path(row['taskPath'])/'task.toml').write_text(
                '[environment]\ncpus=0.001\nmemory_mb=0.001\nstorage_mb=0.001\n')
        self.fixture.hash_inputs()
        self.manifest.write_text(json.dumps(self.m))
        env = serial.child_env(self.m['config'])
        env.pop('PYTHONDONTWRITEBYTECODE')
        env.pop('PYTHONPATH')
        before = set(self.root.rglob('*'))
        result = subprocess.run([sys.executable, str(script), '--manifest', str(self.manifest), '--dry-run'],
                                env=env, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(self.root.rglob('*')), before)

    def test_real_overlap_out_of_order_resume_and_secret_free_children(self):
        ledger_before = self.fixture.ledger.read_bytes()
        def control():
            wait_for(lambda: self.started('key-0') and self.started('key-1'))
            self.release('key-1')
            wait_for(lambda: any(e.get('trialKey') == 'key-1' and e['event'] == 'outcome' for e in self.events()))
            self.release('key-0')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command), patch.dict(os.environ, {'OPENROUTER_API_KEY':'sk-private'}):
            self.assertEqual(self.run_cli('--execute')[0], 0)
            thread.join(20)
            before = self.events()
            self.assertEqual(self.run_cli('--execute')[0], 0)
            self.assertEqual(self.events(), before)
        self.assertFalse(self.errors, self.errors)
        self.assertEqual(self.fixture.ledger.read_bytes(), ledger_before)
        self.assertEqual([e['trialKey'] for e in before if e['event'] == 'outcome'], ['key-1','key-0'])
        for row in self.m['trials']:
            info = json.loads((self.root/(row['trialKey']+'.started')).read_text())
            self.assertNotIn('OPENROUTER_API_KEY', info['env'])
            child = info['manifest']
            self.assertEqual(child['trials'], [row])
            self.assertEqual(child['config']['ledgerPath'], self.m['config']['ledgerPath'])
            self.assertEqual(child['snapshotHashes'], self.m['snapshotHashes'])
            self.assertNotEqual(child['config']['eventsPath'], self.m['config']['eventsPath'])

    def test_worker_one_cap_and_durable_partial_resume(self):
        self.m['parallel']['workers'] = 1
        def control():
            wait_for(lambda: self.started('key-0'))
            self.assertFalse(self.started('key-1'))
            self.release('key-0')
            wait_for(lambda: self.started('key-1'))
            self.release('key-1')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command):
            self.assertEqual(self.run_cli('--execute')[0], 0)
        thread.join(20)
        self.assertFalse(self.errors, self.errors)
        # Simulate a graceful coordinator exit between admissions. A completed set
        # is reusable even when it is not an ordered prefix.
        events = self.events()
        keep = [e for e in events if e.get('trialKey') != 'key-0']
        Path(self.m['config']['eventsPath']).write_text(''.join(json.dumps(e)+'\n' for e in keep))
        for path in parallel.child_paths(self.m, self.m['trials'][0]):
            if path.exists(): path.unlink()
        with patch.object(parallel, 'child_command', side_effect=self.command) as launch:
            self.assertEqual(self.run_cli('--execute')[0], 0)
            self.assertEqual(launch.call_count, 1)

    def test_infrastructure_stops_and_interrupts_all_without_retry(self):
        # A third row proves a freed worker slot is not refilled after failure.
        self.add_third_row()
        def control():
            wait_for(lambda: self.started('key-0') and self.started('key-1'))
            (self.root/'key-1.infra').touch()
            self.release('key-1')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command) as launch:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            thread.join(20)
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(launch.call_count, 2)
        self.assertFalse(self.errors, self.errors)
        self.assertFalse(self.started('key-2'))
        self.assertTrue((self.root/'key-0.cleaned').exists())
        self.assertTrue(any(e.get('interrupted') for e in self.events()))

    def add_third_row(self):
        row = copy.deepcopy(self.m['trials'][1])
        row.update(id='third', trialKey='key-2', tokenFile=str(self.root/'token2'))
        Path(row['tokenFile']).write_text('third-token-'+'z'*32)
        Path(row['tokenFile']).chmod(0o600)
        self.m['trials'].append(row)

    def test_two_worker_cap_is_not_exceeded_when_slot_frees(self):
        self.add_third_row()
        def control():
            wait_for(lambda: self.started('key-0') and self.started('key-1'))
            self.assertFalse(self.started('key-2'))
            self.release('key-1')
            wait_for(lambda: self.started('key-2'))
            self.assertFalse((self.root/'key-0.cleaned').exists())
            self.assertTrue((self.root/'key-1.cleaned').exists())
            self.release('key-0')
            self.release('key-2')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command):
            self.assertEqual(self.run_cli('--execute')[0], 0)
        thread.join(20)
        self.assertFalse(self.errors, self.errors)

    def test_budget_exhaustion_during_overlap_cancels_active_and_never_admits_third(self):
        self.add_third_row()
        def control():
            wait_for(lambda: self.started('key-0') and self.started('key-1'))
            self.fixture.state['reservedUsd'] = 14
            self.fixture.save_ledger()
            self.release('key-1')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command) as launch:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            thread.join(20)
            self.fixture.state['reservedUsd'] = 0
            self.fixture.save_ledger()
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(launch.call_count, 2)
        self.assertFalse(self.errors, self.errors)
        self.assertTrue((self.root/'key-0.cleaned').exists())
        self.assertFalse(self.started('key-2'))

    def test_storage_failure_during_overlap_cancels_all_and_preserves_evidence(self):
        self.add_third_row()
        storage_check = serial.storage_check
        def storage(c):
            if (self.root/'storage-failed').exists():
                raise serial.Refusal('Insufficient free storage')
            storage_check(c)
        def control():
            wait_for(lambda: self.started('key-0') and self.started('key-1'))
            (self.root/'storage-failed').touch()
            self.release('key-1')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command), patch.object(serial, 'storage_check', side_effect=storage):
            self.assertEqual(self.run_cli('--execute')[0], 2)
        thread.join(20)
        self.assertFalse(self.errors, self.errors)
        self.assertTrue((self.root/'key-0.cleaned').exists())
        self.assertFalse(self.started('key-2'))
        self.assertEqual(self.events()[-1]['event'], 'stopped')

    def test_interrupted_admission_and_changed_fingerprint_are_never_replayed(self):
        self.release('key-0')
        self.release('key-1')
        with patch.object(parallel, 'child_command', side_effect=self.command):
            self.assertEqual(self.run_cli('--execute')[0], 0)
        original = Path(self.m['config']['eventsPath']).read_text()
        self.m['parallel']['timingCohort'] = 'changed'
        with patch.object(parallel.subprocess, 'Popen') as launch:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            launch.assert_not_called()
        self.m['parallel']['timingCohort'] = 'parallel-two'
        entries = original.splitlines()
        admitted_only = [line for line in entries if json.loads(line)['event'] != 'outcome']
        Path(self.m['config']['eventsPath']).write_text('\n'.join(admitted_only)+'\n')
        with patch.object(parallel.subprocess, 'Popen') as launch:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            launch.assert_not_called()

    def test_missing_child_cleanup_confirmation_is_failed_closed(self):
        self.release('key-0')
        self.release('key-1')
        with patch.object(parallel, 'child_command', side_effect=self.command):
            self.assertEqual(self.run_cli('--execute')[0], 0)
        _, journal = parallel.child_paths(self.m, self.m['trials'][1])
        saved = journal.read_text()
        journal.write_text('not json')
        self.assertEqual(self.run_cli('--execute')[0], 2)
        entries = [json.loads(line) for line in saved.splitlines()]
        entries[1]['rewards']['reward'] = 1
        journal.write_text(''.join(json.dumps(e)+'\n' for e in entries))
        self.assertEqual(self.run_cli('--execute')[0], 2)

    def test_resources_workers_and_task_caps_refuse_before_writes(self):
        original = copy.deepcopy(self.m)
        for workers in (0, 9, True, 1.5):
            self.m['parallel']['workers'] = workers
            self.assertEqual(self.run_cli('--dry-run')[0], 2)
        self.m = copy.deepcopy(original)
        for capacity in (dict(cpus=1, memoryBytes=10**12), dict(cpus=32, memoryBytes=1)):
            with patch.object(parallel, 'host_capacity', return_value=capacity):
                self.assertEqual(self.run_cli('--execute')[0], 2)
        self.assertFalse(Path(self.m['config']['eventsPath']).exists())
        self.m['parallel']['timingMode'] = 'uncontended'
        self.assertEqual(self.run_cli('--dry-run')[0], 2)
        self.m = original
        (Path(self.m['trials'][0]['taskPath'])/'task.toml').write_text('[environment]\ncpus=0\nmemory_mb=1\nstorage_mb=1\n')
        self.fixture.m = self.m
        self.fixture.hash_inputs()
        self.assertEqual(self.run_cli('--dry-run')[0], 2)

    def test_available_capacity_honors_affinity_and_nested_cgroup_headroom(self):
        parent, child = self.root/'cgroup', self.root/'cgroup'/'child'
        child.mkdir(parents=True)
        for directory, cpu, memory, used in ((parent, '400000 100000', 100, 70),
                                             (child, '200000 100000', 200, 10)):
            (directory/'cpu.max').write_text(cpu)
            (directory/'memory.max').write_text(str(memory))
            (directory/'memory.current').write_text(str(used))
        read_text = Path.read_text
        def read(path, *args, **kwargs):
            return 'MemAvailable: 1024 kB\n' if str(path) == '/proc/meminfo' else read_text(path, *args, **kwargs)
        with patch.object(parallel, 'cgroup_limits', return_value=[child, parent]), patch.object(
                os, 'sched_getaffinity', return_value=set(range(32))), patch.object(
                Path, 'read_text', autospec=True, side_effect=read):
            self.assertEqual(REAL_HOST_CAPACITY(), dict(cpus=2, memoryBytes=30))
            (child/'cpu.max').write_text('max 100000')
            (parent/'cpu.max').write_text('max 100000')
            (parent/'memory.max').write_text('max')
            self.assertEqual(REAL_HOST_CAPACITY(), dict(cpus=32, memoryBytes=190))

    def decreasing_capacity_cohort(self, kind, remaining_gib=6, expected=0):
        gib = 1024**3
        self.m['parallel']['reserveMemoryBytes'] = gib
        for row in self.m['trials']:
            (Path(row['taskPath'])/'task.toml').write_text(
                '[environment]\ncpus=1\nmemory_mb=4096\nstorage_mb=4096\n')
        self.fixture.hash_inputs()
        checked, done = threading.Event(), threading.Event()
        consumed = [False]
        original = parallel.resource_check
        def check(m, rows=None):
            if rows is not None and len(rows) == 2:
                wait_for(lambda: self.started('key-0'))
                consumed[0] = True
                try:
                    return original(m, rows)
                finally:
                    checked.set()
            return original(m, rows)
        def remaining():
            # Keep measured headroom at six even after completion: do not assume
            # artifacts or caches are reclaimed to make the next admission fit.
            return remaining_gib*gib if consumed[0] else 10*gib
        def capacity():
            return dict(cpus=32, memoryBytes=remaining() if kind == 'memory' else 10*gib)
        def disk(path):
            return type('Disk', (), {'free': remaining() if kind == 'disk' else 10*gib})()
        def control():
            wait_for(checked.is_set)
            self.assertFalse(self.started('key-1'))
            self.release('key-0')
            wait_for(lambda: self.started('key-1') or done.is_set())
            if self.started('key-1'): self.release('key-1')
        thread = self.controller(control)
        with patch.object(parallel, 'child_command', side_effect=self.command), patch.object(
                parallel, 'host_capacity', side_effect=capacity), patch.object(
                parallel.shutil, 'disk_usage', side_effect=disk), patch.object(
                parallel, 'resource_check', side_effect=check):
            try:
                rc, _ = self.run_cli('--execute')
            finally:
                done.set()
        thread.join(20)
        self.assertFalse(self.errors, self.errors)
        self.assertEqual(rc, expected, 'Capacity drain must remeasure without crediting consumed allocations')
        outcomes = [e for e in self.events() if e['event'] == 'outcome']
        self.assertEqual(len(outcomes), 2 if expected == 0 else 1)
        self.assertTrue(all(e['infrastructureError'] is False for e in outcomes))
        self.assertEqual([e['event'] for e in self.events()],
                         ['batch', 'admitted', 'outcome', 'admitted', 'outcome'] if expected == 0 else
                         ['batch', 'admitted', 'outcome', 'stopped'])
        if expected != 0:
            self.assertFalse(self.started('key-1'))

    def test_decreasing_available_memory_drains_then_admits_without_trial_retry(self):
        self.decreasing_capacity_cohort('memory')

    def test_decreasing_free_disk_drains_then_admits_without_trial_retry(self):
        self.decreasing_capacity_cohort('disk')

    def test_memory_still_insufficient_after_drain_refuses_candidate_without_retry(self):
        self.decreasing_capacity_cohort('memory', remaining_gib=3, expected=2)

    def test_disk_still_insufficient_after_drain_refuses_candidate_without_retry(self):
        self.decreasing_capacity_cohort('disk', remaining_gib=3, expected=2)

    def test_initial_aggregate_envelope_does_not_count_only_candidate(self):
        gib = 1024**3
        self.m['parallel']['reserveMemoryBytes'] = gib
        for row in self.m['trials']:
            (Path(row['taskPath'])/'task.toml').write_text(
                '[environment]\ncpus=1\nmemory_mb=4096\nstorage_mb=4096\n')
        self.fixture.hash_inputs()
        with patch.object(parallel, 'host_capacity', return_value=dict(cpus=32, memoryBytes=8*gib)), patch.object(
                parallel.subprocess, 'Popen') as launch:
            self.assertEqual(self.run_cli('--execute')[0], 2)  # 4 + 4 + 1 > 8
            launch.assert_not_called()
        self.assertFalse(Path(self.m['config']['eventsPath']).exists())

    def test_coordinator_signal_between_spawn_and_registration_reaps_owned_runner(self):
        self.m['parallel']['workers'] = 1
        original = subprocess.Popen
        def spawn(*args, **kwargs):
            proc = original(*args, **kwargs)
            wait_for(lambda: self.started('key-0'))
            os.kill(os.getpid(), signal.SIGINT)
            return proc
        with patch.object(parallel, 'child_command', side_effect=self.command), patch.object(
                parallel.subprocess, 'Popen', side_effect=spawn) as launches:
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.assertEqual(launches.call_count, 1)
        self.assertTrue((self.root/'key-0.cleaned').exists())
        pid = json.loads((self.root/'key-0.started').read_text())['pid']
        with self.assertRaises(ProcessLookupError): os.kill(pid, 0)
        self.assertFalse(self.started('key-1'))

    def test_budget_storage_and_snapshot_refusal(self):
        with patch.object(parallel.subprocess, 'Popen') as launch:
            self.fixture.state['reservedUsd'] = 14
            self.fixture.save_ledger()
            self.assertEqual(self.run_cli('--execute')[0], 2)
            self.fixture.state['reservedUsd'] = 0
            self.fixture.save_ledger()
            with patch.object(parallel.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 1})()):
                self.assertEqual(self.run_cli('--execute')[0], 2)
            self.m['snapshotHashes'].clear()
            self.assertEqual(self.run_cli('--execute')[0], 2)
            launch.assert_not_called()
        self.assertFalse(Path(self.m['config']['eventsPath']).exists())

    def test_journal_lock_changed_manifest_corruption_and_no_retry(self):
        import fcntl
        events = Path(self.m['config']['eventsPath'])
        with events.open('w') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.run_cli('--execute')[0], 2)
        for text in ('{broken\n', json.dumps(dict(event='admitted', trialKey='key-0', manifestSha256='changed'))+'\n'):
            events.write_text(text)
            with patch.object(parallel.subprocess, 'Popen') as launch:
                self.assertEqual(self.run_cli('--execute')[0], 2)
                launch.assert_not_called()

    def test_sigterm_real_coordinator_cleans_owned_children(self):
        # Separate coordinator process owns its main-thread signal handlers.
        bootstrap = self.root/'bootstrap.py'
        bootstrap.write_text('import sys\nsys.path.insert(0, '+repr(str(Path(parallel.__file__).parent))+')\n'
                             'import run_parallel_comparison as p\n'
                             # Explicit child fixture injection, never real admission.
                             'import evaluation_qualification as q\nq.admit_execution=lambda m: None\n'
                             'p.host_capacity=lambda: dict(cpus=32,memoryBytes=2**40)\n'
                             'p.child_command=lambda m: [sys.executable,"-B",'+repr(str(self.fake))+',str(m),'+repr(str(self.root))+']\n'
                             'sys.exit(p.main())\n')
        self.manifest.write_text(json.dumps(self.m))
        proc = subprocess.Popen([sys.executable, '-B', str(bootstrap), '--manifest', str(self.manifest), '--execute'],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            wait_for(lambda: self.started('key-0') and self.started('key-1'))
            proc.send_signal(signal.SIGTERM)
            self.assertEqual(proc.wait(timeout=20), 2)
            for key in ('key-0', 'key-1'):
                self.assertTrue((self.root/(key+'.cleaned')).exists())
                pid = json.loads((self.root/(key+'.started')).read_text())['pid']
                with self.assertRaises(ProcessLookupError): os.kill(pid, 0)
            self.assertEqual(self.run_cli('--execute')[0], 2)
        finally:
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                for row in self.m['trials']: self.release(row['trialKey'])
                proc.wait(timeout=20)


if __name__ == '__main__':
    unittest.main()
