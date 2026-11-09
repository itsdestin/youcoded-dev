"""Unprivileged containment tests: simulated frames, never hostile host JS."""
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch,Mock
import comparison_tasks as tasks
import secure_evaluation as secure

@unittest.skipUnless(os.name=='posix' and hasattr(os,'O_NOFOLLOW'),'POSIX descriptor boundary; other platforms fail closed')
class ResourceTests(unittest.TestCase):
    def test_sparse_oversize_refused_before_any_content_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'input';root.mkdir()
            with (root/'sparse').open('wb') as f:f.truncate(129*1024**2)
            for action in [lambda:tasks.hashes(root),lambda:secure.safe_copy(root,Path(tmp)/'copy')]:
                with patch('os.read',side_effect=AssertionError('content read before preflight')) as read,patch.object(Path,'read_bytes',side_effect=AssertionError('whole file read forbidden')):
                    with self.assertRaisesRegex(ValueError,'size|large|limit'):action()
                    read.assert_not_called()
            self.assertFalse((Path(tmp)/'copy').exists())

    def test_entry_count_includes_directories_before_content_read(self):
        from bounded_inputs import scan
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'a').mkdir();(root/'b').mkdir();(root/'file').write_text('x')
            with patch('os.read',side_effect=AssertionError('no preflight reads')):
                with self.assertRaisesRegex(ValueError,'entry'):scan(root,max_entries=2)

    def test_deadline_and_special_entries_fail_before_read(self):
        from bounded_inputs import scan
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with self.assertRaisesRegex(ValueError,'deadline'):scan(root,deadline=time.monotonic()-1)
            os.mkfifo(root/'pipe')
            with patch('os.read',side_effect=AssertionError('special read forbidden')):
                with self.assertRaisesRegex(ValueError,'ordinary|special'):scan(root)
            (root/'pipe').unlink();(root/'escape').symlink_to('/etc/passwd')
            with self.assertRaisesRegex(ValueError,'symlink|ordinary'):scan(root)

    def test_growth_and_symlink_swap_abort_copy_and_remove_partial(self):
        import bounded_inputs as b
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'input';root.mkdir();p=root/'file';p.write_bytes(b'abc')
            original=b.os.read;changed=False
            def grow(fd,n):
                nonlocal changed
                if not changed:
                    changed=True
                    with p.open('ab') as f:f.write(b'd')
                return original(fd,n)
            with patch.object(b.os,'read',side_effect=grow):
                with self.assertRaisesRegex(ValueError,'changed|size'):secure.safe_copy(root,Path(tmp)/'copy')
            self.assertFalse((Path(tmp)/'copy').exists())
            inventory=b.scan(root);p.unlink();p.symlink_to('/etc/passwd')
            with self.assertRaises((ValueError,OSError)):b.consume(root,inventory)

    def test_total_size_streamed_copy_and_shared_deadline(self):
        import bounded_inputs as b
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'input';root.mkdir();(root/'dir').mkdir();(root/'dir/a').write_bytes(b'abc');(root/'b').write_bytes(b'def')
            with patch('os.read',side_effect=AssertionError('no read before total bounds')):
                with self.assertRaisesRegex(ValueError,'total'):b.hashes(root,max_bytes=5)
            copied=Path(tmp)/'copy';values=secure.safe_copy(root,copied)
            self.assertEqual(values['dir/a']['sha256'],hashlib.sha256(b'abc').hexdigest())
            self.assertEqual((copied/'dir/a').read_bytes(),b'abc')
            inventory=b.scan(root)
            with patch.object(b.time,'monotonic',return_value=101),patch('os.read',side_effect=AssertionError('expired ingestion must not read')):
                with self.assertRaisesRegex(ValueError,'deadline'):b.consume(root,inventory,deadline=100,destination=Path(tmp)/'expired')
            self.assertFalse((Path(tmp)/'expired').exists())
            os.link(root/'b',root/'hardlink')
            with self.assertRaisesRegex(ValueError,'hardlink'):b.scan(root)

    def test_read_failure_has_no_partial_copy_or_descriptor_leak(self):
        import bounded_inputs as b
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'input';root.mkdir();(root/'a').write_bytes(b'abc')
            fd_directory=Path('/proc/self/fd')
            before=len(list(fd_directory.iterdir())) if fd_directory.is_dir() else None
            with patch.object(b.os,'read',side_effect=OSError('simulated read failure')):
                with self.assertRaisesRegex(OSError,'simulated'):secure.safe_copy(root,Path(tmp)/'partial')
            self.assertFalse((Path(tmp)/'partial').exists())
            if before is not None:self.assertEqual(len(list(fd_directory.iterdir())),before)

class UntrustedObservations(unittest.TestCase):
    def test_correct_return_and_forged_unchanged_is_not_acceptance(self):
        # Models the exact attack: migrateConfig mutates its argument while
        # patched JSON.stringify emits expected result + unchanged:true. No JS
        # is executed: the frame can match the independent output oracle fully.
        original={'native':{'context':{'chatgpt':'long'}}}
        pristine=json.loads(json.dumps(original));correct=secure.expected_migration(pristine)
        def simulated_compromised_migration(value):
            value['tampered']=True  # Correct return, forbidden input mutation.
            return correct
        returned=simulated_compromised_migration(original)
        forged_serializer=lambda _value:json.dumps({'id':'r','ok':True,'value':{'result':returned,'unchanged':True}})
        frame=json.loads(forged_serializer({'unchanged':original==pristine}))
        self.assertNotEqual(original,pristine)
        self.assertTrue(frame['value']['unchanged'])
        self.assertEqual(secure.decode(json.dumps(frame),{'id':'r'})['result'],correct)
        executor=Mock();executor.timeout=12;executor.call.return_value=frame['value']
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'submission').mkdir();(root/'submission/README.md').write_text('description '*10)
            with patch.object(secure,'functional',return_value=None),patch.object(secure.tasks,'hashes',return_value={}):
                result=secure.verify(root,tasks.IDS[1],{},root,executor)
        self.assertFalse(result['passed']);self.assertEqual(result['reward'],0)
        self.assertEqual(result['category'],'unverified-observation-boundary')
        executor.call.assert_not_called()

class UniversalAdmission(unittest.TestCase):
    def test_real_universal_guard_refuses_every_schema_before_probes(self):
        import evaluation_qualification as q
        import run_objective_comparison as serial
        import run_parallel_comparison as parallel
        for schema in (None,1,2,3,'2'):
            manifest={'schemaVersion':schema,'executionAuthorized':True}
            with patch.object(q,'qualify',side_effect=AssertionError('no runtime probe')),patch.object(serial,'run_scoped',side_effect=AssertionError('no runner')):
                with self.assertRaisesRegex(ValueError,'authority unqualified'):serial.execute(manifest,[])
                with self.assertRaisesRegex(ValueError,'authority unqualified'):parallel.execute(manifest)

    def test_cli_refusal_precedes_validation_of_tokens_and_budget(self):
        import run_objective_comparison as serial
        import run_parallel_comparison as parallel
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'manifest.json';path.write_text(json.dumps({'schemaVersion':1,'executionAuthorized':True}))
            for launcher in (serial,parallel):
                with patch.object(launcher,'validate',side_effect=AssertionError('token/ledger validation before admission')) as validate:
                    self.assertEqual(launcher.main(['--manifest',str(path),'--execute']),2)
                    validate.assert_not_called()

    def test_downgraded_serial_parallel_and_legacy_workflow_cannot_spend(self):
        import run_objective_comparison as serial
        import run_parallel_comparison as parallel
        import targeted_workflow as workflow
        manifest={'schemaVersion':1,'executionAuthorized':True,'config':{'sourceDir':'/frozen/source'},'nativeSettings':{'maxRequests':20,'timeoutSec':180},'trials':[{'arm':'candidate','tokenFile':'/opaque'}],'snapshotHashes':{'/opaque':'a'*64}}
        backend=Mock()
        with patch('evaluation_qualification.admit_execution',side_effect=ValueError('execution authority unqualified')) as admission,patch('evaluation_qualification.execution_authority',side_effect=ValueError('execution authority unqualified')) as lease,patch.object(serial,'run_scoped',backend.runner),patch.object(workflow,'read_json',return_value=manifest),patch.object(workflow,'check',return_value=manifest),patch.object(workflow,'private_key_metadata',backend.key):
            with self.assertRaisesRegex(ValueError,'unqualified'):serial.execute(manifest,[])
            with self.assertRaisesRegex(ValueError,'unqualified'):parallel.execute(manifest)
            with self.assertRaisesRegex(ValueError,'unqualified'):workflow.run('/frozen/prepared-manifest.json',True,'/approval','/key',backend)
            self.assertEqual(admission.call_count,2); lease.assert_called_once()
        backend.runner.assert_not_called();backend.command.assert_not_called();backend.key.assert_not_called()

if __name__=='__main__':unittest.main()
