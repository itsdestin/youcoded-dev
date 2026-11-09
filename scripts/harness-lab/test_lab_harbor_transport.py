"""Offline real Harbor factory/lifecycle + native bwrap; no Docker/provider calls."""
import asyncio
import io
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

try:
    from harbor.agents.base import BaseAgent
    from harbor.environments.base import ExecResult
    from harbor.models.trial.config import TrialConfig
    from harbor.trial.trial import Trial
except ImportError as error:
    raise unittest.SkipTest('Installed Harbor required for plugin lifecycle: '+str(error))

import comparison_tasks as tasks
import comparison_reference as refs
from external_verification import VERSION
from lab_harbor_transport import BoundedEnvironment, bounded_spool, inventory, materialize
from lab_harbor_export import export_suite, plugin_config, lifecycle_status
import run_objective_comparison as parent

HERE = Path(__file__).resolve().parent


def archive_bytes(entries):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for info, data in entries: tar.addfile(info, io.BytesIO(data))
    return out.getvalue()


class Reader:
    def __init__(self, data): self.data = io.BytesIO(data); self.closed = False
    async def read(self, n): return self.data.read(n)
    async def close(self): self.closed = True


class FixtureBackend:
    """Trusted injected backend only. Not a production isolation attestation."""
    def __init__(self, root, failure=None):
        self.root = Path(root); self.failure = failure; self.sealed = False; self.events = []
    async def start(self, force): self.events.append('start')
    async def stop(self, delete): self.events.append('stop')
    async def exec(self, *args, **kwargs):
        if self.sealed: raise ValueError('sealed writer')
        return ExecResult(return_code=0, stdout='')
    async def upload_file(self, *args): pass
    async def upload_dir(self, *args): pass
    async def seal_all(self):
        self.events.append('seal-all'); self.sealed = True
        return 'owned-fixture-seal'
    async def confirm_sealed(self, receipt):
        self.events.append('confirm-seal'); return self.failure != 'seal' and self.sealed
    async def archive(self, source):
        self.events.append('archive:'+source)
        if not self.sealed: raise AssertionError('unsealed download')
        if self.failure == 'archive':
            info = tarfile.TarInfo('../escape'); info.size = 1
            return Reader(archive_bytes([(info,b'x')]))
        out = io.BytesIO()
        with tarfile.open(fileobj=out, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            if source == '/app':
                for path in sorted(self.root.rglob('*')):
                    tar.add(path, arcname=path.relative_to(self.root).as_posix(), recursive=False)
            elif source == '/logs/agent':
                info=tarfile.TarInfo('fixture.log'); info.size=len(b'bounded diagnostic')
                tar.addfile(info,io.BytesIO(b'bounded diagnostic'))
        return Reader(out.getvalue())


class FixtureEnvironment(BoundedEnvironment):
    def __init__(self, *args, fixture_root, failure=None, **kwargs):
        self.fixture_root = fixture_root; self.failure = failure
        super().__init__(*args, **kwargs)
    def create_backend(self): return FixtureBackend(self.fixture_root, self.failure)


class FixtureAgent(BaseAgent):
    @staticmethod
    def name(): return 'offline-fixture-agent'
    def version(self): return '1'
    async def setup(self, environment): pass
    async def run(self, instruction, environment, context):
        # Fake agent edits only controller-created disposable fixtures. The real
        # submitted JS below is executed exclusively through BwrapExecutor.
        root = environment._backend.root
        task = environment.environment_name
        if environment.failure != 'forged':
            if task in tasks.IDS: refs.apply(root, task)
            else:
                from legacy_verification import definitions
                for name,text in definitions()[task]['oracle'].items():
                    path=root/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(text)
        (root/'reward.txt').write_text('1')
        # Forged reward is outside allowed changes; remove for the valid control.
        if environment.failure != 'forged': (root/'reward.txt').unlink()


class OrdinaryNativeAgent(FixtureAgent):
    """No-provider transport for the actual ordinary createRuntime/tool path.

    Only this injected fake backend is allowed. Not selectable as a paid adapter;
    no synthetic smoke profile or post-run forged controller attestation.
    """
    async def run(self,instruction,environment,context):
        import subprocess
        need_fixture=isinstance(environment._backend,FixtureBackend)
        if not need_fixture:raise ValueError('Ordinary native fixture requires injected backend')
        root=environment._backend.root
        command='test -f fixed.txt'
        responses=[dict(toolName='Bash',input=dict(command=command,description='Check fixture')),
            dict(toolName='Write',input=dict(file_path=str(root/'fixed.txt'),content='fixed\n')),
            dict(toolName='Bash',input=dict(command=command,description='Check fixture')),
            dict(toolName='AskUserQuestion',input=dict(questions=[dict(question='Choose a format',header='Format',options=[dict(label='Compact',description='Brief output'),dict(label='Detailed',description='Long output')],multiSelect=False)])),
            dict(toolName='Bash',input=dict(command='while [ ! -f .lab-shell-release ]; do sleep 0.01; done; printf finished',description='Native background command',run_in_background=True)),
            dict(text='Waiting for the background command notice.'),
            dict(toolName='Write',input=dict(file_path=str(root/'continued.txt'),content='SHELL-OK\n')),
            dict(toolName='Write',input=dict(file_path=str(root/'result.json'),content='{"ticket":"LAB-148","status":"ready"}\n'))]
        with tempfile.TemporaryDirectory(prefix='yc-ordinary-native-agent-') as tmp:
            private=Path(tmp); config=private/'config.json'
            config.write_text(json.dumps(dict(cwd=str(root),taskId=environment.environment_name,arm='offline-native',comparisonKey='ordinary-native-proof',repetition=0,provider='openrouter',model='offline-scripted',prompt=instruction,maxRequests=16,timeoutMs=15000,scriptedResponses=responses,offlineShellControl='release-after-terminal',clarificationOracle=[dict(question='Choose a format',answer='Compact')])) )
            self.logs_dir.mkdir(parents=True,exist_ok=True)
            runner=HERE.parents[1]/'youcoded/desktop/test-engine/lab-runner.mjs'
            proc=subprocess.run(['node',str(runner),'--offline-script','--config',str(config),'--out',str(self.logs_dir/'youcoded-run.json')],env={'PATH':os.environ.get('PATH',''),'HOME':str(private)},capture_output=True,timeout=30)
            if proc.returncode:raise ValueError('Ordinary native transport failed: '+proc.stderr.decode()[:500])
        if (root/'continued.txt').read_text()!='SHELL-OK\n':raise ValueError('Native shell useful followup missing')


class ArchiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_metadata_rejections_precede_any_extracted_write(self):
        cases = []
        for name in ('../escape','/absolute','a/../../escape','a\\b','a//b','a/./b','x/'*65+'z'):
            info = tarfile.TarInfo(name); info.size = 1; cases.append([(info,b'x')])
        for kind in (tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.FIFOTYPE,tarfile.CHRTYPE,tarfile.GNUTYPE_SPARSE,tarfile.XHDTYPE):
            info = tarfile.TarInfo('evil'); info.type = kind; info.linkname = 'outside' if kind in (tarfile.SYMTYPE,tarfile.LNKTYPE) else ''
            cases.append([(info,b'')])
        info = tarfile.TarInfo('same'); info.size = 1
        cases.append([(info,b'x'),(info,b'y')])
        parent_file = tarfile.TarInfo('a'); parent_file.size = 1
        child = tarfile.TarInfo('a/b'); child.size = 1
        cases.append([(child,b'x'),(parent_file,b'y')])
        for entries in cases:
            with self.subTest(name=entries[0][0].name,kind=entries[0][0].type), tempfile.TemporaryDirectory() as tmp:
                dest = Path(tmp)/'snapshot'
                with self.assertRaises((ValueError,UnicodeError)):
                    data = io.BytesIO(archive_bytes(entries))
                    records, _ = inventory(data,time.monotonic()+10)
                    materialize(data,records,dest,time.monotonic()+10)
                self.assertFalse(dest.exists())
    async def test_size_count_deadline_and_stream_bombs(self):
        info = tarfile.TarInfo('large'); info.size = 9*1024**2
        # Header alone is enough: no attacker payload needs to be read/extracted.
        with self.assertRaisesRegex(ValueError,'file size'):
            inventory(io.BytesIO(info.tobuf(format=tarfile.USTAR_FORMAT)),time.monotonic()+5)
        raw = archive_bytes([(tarfile.TarInfo('a'),b''),(tarfile.TarInfo('b'),b'')])
        with patch('lab_harbor_transport.MAX_ENTRIES',1):
            with self.assertRaisesRegex(ValueError,'entry limit'): inventory(io.BytesIO(raw),time.monotonic()+5)
        deep=tarfile.TarInfo('a/b/c');deep.size=1
        with patch('lab_harbor_transport.MAX_ENTRIES',2):
            with self.assertRaisesRegex(ValueError,'implicit entry limit'):
                inventory(io.BytesIO(archive_bytes([(deep,b'x')])),time.monotonic()+5)
        with patch('lab_harbor_transport.MAX_BYTES',0):
            with self.assertRaisesRegex(ValueError,'total size limit'):
                inventory(io.BytesIO(archive_bytes([(deep,b'x')])),time.monotonic()+5)
        for invalid in (raw[:-10240], raw[:-512]+b'x'*512):
            with self.assertRaisesRegex(ValueError,'truncated|trailing'):
                inventory(io.BytesIO(invalid),time.monotonic()+5)
        with tempfile.TemporaryFile() as spool:
            with self.assertRaisesRegex(ValueError,'byte limit'):
                await bounded_spool(Reader(raw),spool,time.monotonic()+5,100)
            with self.assertRaisesRegex(ValueError,'deadline'):
                await bounded_spool(Reader(raw),spool,time.monotonic()-1)
        class Stalled(Reader):
            async def read(self,n): await asyncio.Event().wait()
        with tempfile.TemporaryFile() as spool:
            with self.assertRaises(TimeoutError):
                await bounded_spool(Stalled(b''),spool,time.monotonic()+.02)
    async def test_no_follow_exclusive_creation_and_readonly_private_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); info = tarfile.TarInfo('dir/file'); info.size = 2
            data = io.BytesIO(archive_bytes([(info,b'ok')]))
            records,_ = inventory(data,time.monotonic()+5)
            materialize(data,records,root/'safe',time.monotonic()+5)
            self.assertEqual((root/'safe/dir/file').read_bytes(),b'ok')
            self.assertEqual((root/'safe/dir/file').stat().st_mode&0o222,0)
            (root/'link').symlink_to(root/'safe',target_is_directory=True)
            with self.assertRaises(FileExistsError): materialize(data,records,root/'link',time.monotonic()+5)


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='yc-harbor-test-'); cls.base = Path(cls.tmp.name)
        cls.origin = cls.base/'origin'; tasks.snapshot(HERE.parents[1]/'youcoded',cls.origin)
        # Restrict repeated real sandbox invocations to the same relevant pinned
        # dependency closure used by external-v2 acceptance's own native tests.
        cls.small = cls.base/'small'; cls.small.mkdir()
        for name in ['desktop/src/main/update-manifest-verify.ts','desktop/src/main/update-signing-key.ts','desktop/src/main/update-release-status.ts','desktop/src/main/harness/context-settings-store.ts','desktop/src/main/providers/cloud-context.ts','desktop/src/shared/context-preferences.ts','desktop/src/shared/types.ts','desktop/src/shared/model-metadata.ts','desktop/scripts/generate-release-manifest.mjs']:
            if (cls.origin/name).exists():
                target=cls.small/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cls.origin/name,target)
    @classmethod
    def tearDownClass(cls): cls.tmp.cleanup()

    async def trial(self, failure=None):
        run = self.base/('run-'+str(time.monotonic_ns())); run.mkdir()
        task_id = tasks.IDS[1]; task = run/task_id; (task/'environment').mkdir(parents=True); (task/'tests').mkdir()
        submitted = run/'submitted'; shutil.copytree(self.small,submitted); tasks.fixture(submitted,task_id,contract_version=VERSION)
        baseline = tasks.hashes(submitted)
        (task/'instruction.md').write_text('Apply the context migration fixture.')
        (task/'task.toml').write_text('version="1.0"\n[verifier]\ntimeout_sec=120\n[environment]\nnetwork_mode="no-network"\n')
        (task/'tests/test.sh').write_text('exit 1\n')
        (task/'tests/host-contract.json').write_text(json.dumps(dict(version=VERSION,task=task_id)))
        (task/'tests/baseline-manifest.json').write_text(json.dumps(baseline)); shutil.copytree(self.small,task/'tests/origin')
        config = TrialConfig.model_validate(dict(trial_name='offline',trials_dir=str(run/'jobs'),task={'path':str(task)},
            agent={'import_path':'test_lab_harbor_transport:FixtureAgent'},
            environment={'import_path':'test_lab_harbor_transport:FixtureEnvironment','kwargs':{'fixture_root':str(submitted),'failure':failure}},
            verifier=plugin_config()['verifier']))
        trial = await Trial.create(config)
        backend_mounts = trial.agent_environment._mounts
        self.assertEqual(backend_mounts,[]); self.assertFalse(trial.agent_environment.capabilities.mounted)
        result = await trial.run()
        return trial,result,run

    async def test_actual_factory_trial_bwrap_result_parent_journal(self):
        trial,result,run = await self.trial()
        self.assertIsNone(result.exception_info,result.exception_info)
        self.assertEqual(result.verifier_result.rewards,{'reward':1})
        observed = trial.agent_environment._backend.events
        self.assertLess(observed.index('confirm-seal'),next(i for i,e in enumerate(observed) if e.startswith('archive:')))
        self.assertEqual(observed.count('seal-all'),1)
        self.assertGreater(trial.agent_environment.stripped_mount_count,0)
        self.assertEqual((trial.paths.agent_dir/'fixture.log').read_bytes(),b'bounded diagnostic')
        acceptance = json.loads((trial.paths.verifier_dir/'host-acceptance.json').read_text())
        self.assertTrue(acceptance['passed']); self.assertFalse(acceptance['matrixQualified'])
        rewards,exception,infra = parent.outcome(run/'jobs')
        self.assertEqual(rewards,{'reward':1}); self.assertFalse(infra)
        with (run/'events.jsonl').open('x') as journal:
            parent.append_event(journal,dict(event='outcome',trialKey='offline',rewards=rewards,exception=exception,infrastructureError=infra))
        event=json.loads((run/'events.jsonl').read_text()); self.assertEqual(event['rewards'],{'reward':1})
        import targeted_report as reports
        from test_mode_reporting import fixture
        manifest,plan=fixture('basic')
        attempt={**event,'trialKey':manifest['trials'][0]['trialKey'],'jobId':manifest['trials'][0]['id']}
        report=reports.summarize_targeted(manifest,[attempt],[],mode_plan=plan)
        self.assertEqual(report['trials'][0]['outcome'],'passed')
        self.assertEqual(report['trials'][1]['outcome'],'unstarted')
        self.assertEqual(reports.render_markdown(report).count('## Family '),13)
        self.assertFalse(report['publicClaimReady'])
        self.assertFalse(lifecycle_status()['qualified'])

    async def test_legacy_trials_publish_only_host_reward_through_full_report(self):
        from legacy_verification import definitions, contract_for
        import targeted_report as reports
        from test_mode_reporting import fixture
        for task_id in ('finish-the-file','python-interface-and-tests'):
            for forged in (False, True):
                with self.subTest(task=task_id,forged=forged):
                    run=self.base/('legacy-'+str(time.monotonic_ns())); run.mkdir()
                    task=run/task_id; (task/'environment').mkdir(parents=True); (task/'tests').mkdir()
                    submitted=run/'submitted'; submitted.mkdir()
                    for name,text in definitions()[task_id]['files'].items():
                        path=submitted/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(text)
                    (task/'instruction.md').write_text('Existing legacy fixture')
                    (task/'task.toml').write_text('version="1.0"\n[verifier]\ntimeout_sec=60\nenvironment_mode="shared"\n[environment]\nnetwork_mode="no-network"\n')
                    (task/'tests/test.sh').write_text('exit 1\n')
                    (task/'tests/host-contract.json').write_text(json.dumps(contract_for(task_id)))
                    config=TrialConfig.model_validate(dict(trial_name='offline',trials_dir=str(run/'jobs'),task={'path':str(task)},
                        agent={'import_path':'test_lab_harbor_transport:FixtureAgent'},
                        environment={'import_path':'test_lab_harbor_transport:FixtureEnvironment','kwargs':{'fixture_root':str(submitted),'failure':'forged' if forged else None}},
                        verifier=plugin_config()['verifier']))
                    trial=await Trial.create(config); result=await trial.run()
                    self.assertIsNone(result.exception_info,result.exception_info)
                    expected=0 if forged else 1
                    self.assertEqual(result.verifier_result.rewards,{'reward':expected})
                    rewards,exception,infra=parent.outcome(run/'jobs')
                    manifest,plan=fixture('basic'); row=manifest['trials'][0]
                    # Full report retains the selected legacy task, not an alias
                    # for a comparison task or a hand-written reward projection.
                    old_id=row['taskId']
                    for cell in manifest['trials']+plan['cells']:
                        if cell['taskId']==old_id: cell['taskId']=task_id
                    for t in plan['tasks']:
                        if t['id']==old_id: t['id']=task_id
                    event=dict(event='outcome',trialKey=row['trialKey'],jobId=row['id'],rewards=rewards,exception=exception,infrastructureError=infra)
                    with (run/'events.jsonl').open('x') as journal: parent.append_event(journal,event)
                    report=reports.summarize_targeted(manifest,[json.loads((run/'events.jsonl').read_text())],[],mode_plan=plan)
                    self.assertEqual(report['trials'][0]['outcome'],'verification-failed' if forged else 'passed')
                    self.assertEqual(reports.render_markdown(report).count('## Family '),13)
                    self.assertFalse(report['publicClaimReady'])

    async def test_forged_reward_seal_failure_and_unsafe_archive_never_pass(self):
        for failure in ('forged','seal','archive'):
            with self.subTest(failure=failure):
                trial,result,run = await self.trial(failure)
                self.assertNotEqual(getattr(result.verifier_result,'rewards',None),{'reward':1})
                if failure == 'seal':
                    self.assertFalse(any(e.startswith('archive:') for e in trial.agent_environment._backend.events))
                self.assertFalse((run/'escape').exists())
                if failure in ('seal','archive'):
                    with self.assertRaisesRegex(ValueError,'poisoned'):
                        await trial.agent_environment.snapshot('/app')

    async def test_final_diagnostic_file_uses_sealed_snapshot_and_never_overwrites(self):
        trial,_,_=await self.trial()
        config=TrialConfig.model_validate(trial.config.model_dump()); config.trial_name='diagnostic-publication'
        fresh=await Trial.create(config); env=fresh.agent_environment
        await env.start()
        try:
            target=fresh.paths.agent_dir/'fixture.log'
            await env.download_file('/logs/agent/fixture.log',target)
            self.assertEqual(target.read_bytes(),b'bounded diagnostic'); self.assertTrue(env._sealed)
            await env.download_dir('/logs/agent',fresh.paths.agent_dir)
            target.write_text('host-owned different content')
            with self.assertRaisesRegex(ValueError,'conflict'):
                await env.download_dir('/logs/agent',fresh.paths.agent_dir)
            self.assertEqual(target.read_text(),'host-owned different content')
            with self.assertRaisesRegex(ValueError,'destination'):
                await env.download_file('/logs/agent/fixture.log',fresh.paths.verifier_dir/'fixture.log')
        finally: await env.stop()

    async def test_sealed_writers_refused_and_real_backend_fails_closed(self):
        trial,result,run = await self.trial()
        with self.assertRaisesRegex(ValueError,'sealed'): await trial.agent_environment.exec('write malicious')
        self.assertFalse(lifecycle_status()['runtimeQualified'])
        config=TrialConfig.model_validate(trial.config.model_dump())
        config.trial_name='production-refusal'
        config.environment.import_path=plugin_config()['environment']['import_path']
        config.environment.kwargs={}
        refused=await Trial.create(config)
        refused_result=await refused.run()
        self.assertIsNotNone(refused_result.exception_info)
        self.assertIn('trusted controller policy required',refused_result.exception_info.exception_message)
        self.assertIsNone(refused_result.verifier_result)


if __name__ == '__main__': unittest.main()
