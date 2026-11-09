"""Trusted-controller tests; injected observations are NOT Docker qualification."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import secure_evaluation as secure

class ProtocolTests(unittest.TestCase):
    def test_early_exit_success_sentinel_and_duplicate_frames_are_not_completion(self):
        request={'id':'unpredictable','op':'parse','value':{}}
        for output in ['', '{"passed":true}', '{"id":"unpredictable","value":1}\n{}', '{"id":"other","ok":true,"value":1}']:
            with self.subTest(output=output), self.assertRaises(ValueError):secure.decode(output,request)
        self.assertEqual(secure.decode(json.dumps({'id':'unpredictable','ok':True,'value':7}),request),7)

    def test_symlink_and_escape_refused_before_executor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'root';root.mkdir();(root/'escape').symlink_to('/etc/passwd')
            with self.assertRaises(ValueError):secure.safe_copy(root,Path(tmp)/'copy')
            with self.assertRaises(ValueError):secure.relative('../oracle')
            with self.assertRaises(ValueError):secure.relative('/oracle')

    def test_runtime_uses_no_host_write_mount_secrets_or_oracle(self):
        args=secure.container_args('sha256:'+'a'*64,'yc-test',Path('/tmp/input'),Path('/tmp/adapter'))
        text=' '.join(args)
        for flag in ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65534:65534','--pull=never','--pids-limit=64']:
            self.assertIn(flag,args)
        for mount in [args[i+1] for i,x in enumerate(args) if x=='--mount']:
            self.assertTrue(mount.endswith(',readonly'));self.assertNotIn('oracle',mount)
        self.assertNotIn('--env-file',text);self.assertNotIn('docker.sock',text)

class OracleTests(unittest.TestCase):
    def test_research_independent_optimum_accepts_ties_rejects_bad_cost(self):
        import comparison_tasks as tasks
        w=tasks.WORKLOAD
        p=secure.optimum(w)
        secure.check_plan(p,w)
        with self.assertRaises(ValueError):secure.check_plan({**p,'costCents':0},w)

class AdmissionTests(unittest.TestCase):
    def test_whole_matrix_collects_second_adapter_failure_without_spending(self):
        import evaluation_qualification as q
        class Probe:
            def image(self,pin):return {'Id':'sha256:'+'a'*64,'RepoDigests':[pin]}
            def arm(self,arm,build):return {'qualified':arm['id']!='second','reason':'missing executable' if arm['id']=='second' else None}
            def acceptance(self,task):return {'qualified':True}
            def lifecycle(self):return {'qualified':False,'reason':'no controller result transport'}
        plan={'image':'local@sha256:'+'a'*64,'arms':[{'id':'first','adapter':'youcoded'},{'id':'second','adapter':'pi'}],'builds':{},'tasks':[{'id':'research-failover-planner'}],'cells':[], 'blockers':[]}
        result=q.inspect_matrix(plan,Probe())
        self.assertFalse(result['qualified']);self.assertEqual(len(result['arms']),2)
        self.assertFalse(result['arms'][1]['qualified'])
        self.assertEqual(result['providerCalls'],0)

    def test_each_native_lock_key_and_task_cell_is_retained(self):
        import evaluation_qualification as q
        seen=[]
        class Probe:
            def image(self,pin):return {'Id':'sha256:'+'a'*64}
            def arm(self,arm,build):
                seen.append(build['files']['package-lock.json'])
                return {'qualified':False,'reason':'lock dependencies missing'}
            def acceptance(self,task):return {'qualified':False,'reason':'unsupported capability'}
            def lifecycle(self):return {'qualified':False,'reason':'shared verifier mount'}
        plan={'mode':'basic','image':'local@sha256:'+'a'*64,'arms':[{'id':n,'adapter':'youcoded'} for n in ('baseline','candidate')],'builds':{n:{'files':{'package-lock.json':key*64}} for n,key in [('baseline','b'),('candidate','c')]},'tasks':[{'id':'t'}],'cells':[{'taskId':'t','arm':n,'repetition':0} for n in ('baseline','candidate')],'blockers':[]}
        result=q.inspect_matrix(plan,Probe())
        self.assertEqual(seen,['b'*64,'c'*64]);self.assertEqual(len(result['cellVerdicts']),2)
        self.assertTrue(all(not cell['qualified'] for cell in result['cellVerdicts']))
        self.assertEqual([a['dependencyLockKey'] for a in result['arms']],seen)

    def test_an_unrelated_local_image_cannot_satisfy_pin(self):
        import evaluation_qualification as q
        from types import SimpleNamespace
        probe=q.LocalProbe('/tmp')
        with patch.object(probe,'command',return_value=SimpleNamespace(returncode=0,stderr='',stdout=json.dumps([{'Id':'sha256:'+'b'*64,'RepoDigests':[]}]))):
            with self.assertRaisesRegex(ValueError,'identity mismatch'):probe.image('local@sha256:'+'a'*64)

    def test_direct_serial_and_parallel_execution_cannot_bypass_qualification(self):
        import run_objective_comparison as serial
        import run_parallel_comparison as parallel
        manifest={'schemaVersion':2,'executionAuthorized':True}
        with patch('evaluation_qualification.admit_execution',side_effect=ValueError('current matrix unqualified')) as guard:
            with self.assertRaisesRegex(ValueError,'unqualified'):serial.execute(manifest,[])
            with self.assertRaisesRegex(ValueError,'unqualified'):parallel.execute(manifest)
            self.assertEqual(guard.call_count,2)

    def test_caller_boolean_or_receipt_does_not_replace_current_preflight(self):
        import evaluation_workflow as workflow
        with patch.object(workflow,'check',return_value={'schemaVersion':2,'evaluation':{'blockers':[]}}), patch('evaluation_qualification.execution_authority',side_effect=ValueError('second adapter missing')) as admission:
            with self.assertRaisesRegex(ValueError,'second adapter missing'):
                workflow.run('/tmp/prepared-manifest.json',True,'/tmp/verified-true.json','/tmp/must-not-read')
            admission.assert_called_once()

if __name__=='__main__':unittest.main()
