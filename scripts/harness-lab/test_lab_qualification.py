"""Current external-v2 qualification and private launch authority; no providers."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import comparison_tasks as tasks
import evaluation_qualification as q
import evaluation_workflow as workflow

HERE=Path(__file__).resolve().parent


class QualificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='yc-current-qualification-'); cls.root=Path(cls.tmp.name)
        tasks.snapshot(HERE.parents[1]/'youcoded',cls.root/'repo-snapshot')
    @classmethod
    def tearDownClass(cls): cls.tmp.cleanup()
    def test_current_bwrap_reference_and_negatives_can_qualify(self):
        probe=q.LocalProbe(self.root)
        result=probe.acceptance({'id':tasks.IDS[1],'contractVersion':'substantial-development-external-v2'})
        self.assertTrue(result['qualified'],result)
        self.assertTrue(result['reference']['passed'])
        self.assertTrue(all(not c['verdict']['passed'] for c in result['negativeControls']))
        self.assertEqual(result['backend'],'bwrap')
    def test_private_umask_preserves_protected_modes_through_real_bwrap_verification(self):
        from bounded_inputs import copy as safe_copy,hashes
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'source'; source.mkdir()
            for name,mode in (('private',0o600),('executable',0o755)):
                (source/name).write_text('unchanged'); (source/name).chmod(mode)
            target=Path(tmp)/'copy'; safe_copy(source,target,preserve_modes=True)
            self.assertEqual(hashes(source),hashes(target),'staging cannot rewrite protected permission bits')
        old=os.umask(0o077)
        try: result=q.LocalProbe(self.root).acceptance({'id':tasks.IDS[1],'contractVersion':'substantial-development-external-v2'})
        finally: os.umask(old)
        self.assertTrue(result['qualified'],result)
        self.assertGreater(result['invocations'],0)
        self.assertEqual(result['negativeControls'][0]['verdict']['reason'],'protected-state')
        from external_verification import verify,VERSION
        from bwrap_executor import BwrapExecutor
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'candidate'; tasks.reset(self.root/'repo-snapshot',root,tasks.IDS[1],contract_version=VERSION)
            baseline=tasks.hashes(root); tasks.reference(root,tasks.IDS[1])
            (root/'TASK.md').chmod(0o700)
            executor=BwrapExecutor(); verdict=verify(root,tasks.IDS[1],baseline,self.root/'repo-snapshot',executor)
            self.assertFalse(verdict['passed']); self.assertEqual(verdict['reason'],'protected-state')
            self.assertEqual(executor.evidence,[],'real unauthorized mode changes must still fail before execution')
    def test_real_gateway_stub_route_runs_without_listen_fetch_or_provider(self):
        import subprocess
        with tempfile.TemporaryDirectory(prefix='yc-gateway-memory-') as tmp:
            root=Path(tmp); key=root/'dummy-key'; key.write_text('dummy-not-provider'); key.chmod(0o600)
            module=json.dumps((HERE/'openrouter-gateway.mjs').as_uri()); stub=json.dumps((HERE/'qualification-gateway.mjs').as_uri())
            script='import {createGateway} from '+module+'; import {qualificationTransport,qualificationUsageTransport} from '+stub+';'+r'''
import {Readable,Writable} from 'node:stream'; import {once} from 'node:events';
globalThis.fetch=()=>{throw Error('active network forbidden')};
const root=process.argv[1],token='qualification-opaque-token-1234567890';let upstream=0;
const policy={model:'anthropic/claude-haiku-5.5',provider:'Anthropic',maxContextTokens:1024,maxOutputTokens:4,maxPromptUsdPerMillion:1,maxCacheWriteUsdPerMillion:1,maxCompletionUsdPerMillion:5,reservationUsd:.01};
const config={host:'0.0.0.0',port:18766,allowNetworkBind:true,ledgerPath:root+'/ledger.json',limitUsd:1,priorUpperUsd:0,tokens:{[token]:{trialId:'qualification',maxRequests:2,policy,budgetScope:{id:'qualification',limitUsd:1}}}};
const gateway=await createGateway({config,keyFile:root+'/dummy-key',transport:async args=>{upstream++;return qualificationTransport(args)},usageTransport:qualificationUsageTransport});
async function request(method,path,credential){
 const req=Readable.from([Buffer.from(JSON.stringify({model:policy.model,messages:[{role:'user',content:'qualification-only'}],max_tokens:4}))]);Object.assign(req,{method,url:path,headers:{authorization:'Bearer '+credential,'content-type':'application/json'}});
 const chunks=[];const res=new Writable({write(chunk,enc,done){chunks.push(Buffer.from(chunk));done()}});res.headersSent=false;res.statusCode=200;res.writeHead=(status)=>{res.statusCode=status;res.headersSent=true};
 const finished=once(res,'finish');gateway.server.emit('request',req,res);await finished;await gateway.drain();return {status:res.statusCode,body:Buffer.concat(chunks).toString()};
}
const health=await request('GET','/health',token);const good=await request('POST','/v1/chat/completions',token);const denied=await request('POST','/v1/chat/completions','unknown');
await gateway.close();console.log(JSON.stringify({listening:gateway.server.listening,health:health.status,good:good.status,denied:denied.status,upstream,content:JSON.parse(good.body).choices[0].message.content}));
'''
            proc=subprocess.run(['node','--input-type=module','-e',script,str(root)],capture_output=True,text=True,timeout=20)
            self.assertEqual(proc.returncode,0,proc.stderr)
            self.assertEqual(json.loads(proc.stdout),dict(listening=False,health=404,good=200,denied=401,upstream=1,content='qualification-only'))
    def test_legacy_acceptance_qualifies_but_cannot_qualify_runtime_or_missing_cells(self):
        from legacy_verification import contract_for, definitions
        probe=q.LocalProbe(self.root)
        selected=[dict(id=name,legacy=True,legacyVerification=contract_for(name)) for name in definitions()]
        plan=dict(mode='thorough',image='offline@sha256:'+'a'*64,arms=[dict(id='native',adapter='youcoded')],
            tasks=selected,cells=[dict(arm='native',taskId=t['id'],repetition=0) for t in selected],blockers=[])
        # Runtime is deliberately absent, but acceptance still evaluates every
        # selected task; failed image/arm cells must not disappear from receipts.
        probe.image=lambda pin: {'qualified':False,'reason':'runtime pending'}
        probe.arm=lambda arm,build: {'qualified':False,'reason':'adapter pending'}
        result=q.inspect_matrix(plan,probe)
        self.assertEqual(len(result['tasks']),19)
        self.assertTrue(all(t['qualified'] for t in result['tasks']),result)
        self.assertEqual(len(result['cellVerdicts']),19)
        self.assertTrue(all(not c['qualified'] for c in result['cellVerdicts']))
        self.assertFalse(result['qualified'])
        self.assertFalse(result['lifecycle']['qualified'])
        self.assertFalse(any(t['runtimeQualified'] for t in result['tasks']))


class AuthorityTests(unittest.TestCase):
    def setUp(self):
        import sys
        self.tmp=tempfile.TemporaryDirectory(prefix='yc-authority-test-'); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); build=self.root/'build'; (build/'dist/main').mkdir(parents=True); (build/'test-engine').mkdir()
        (build/'dist/main/create-runtime.js').write_text('exports.createRuntime=()=>({});')
        for name in ('package.json','package-lock.json'): (build/name).write_text('{}')
        for name in ('runner','worker','observer','state','scenario','faults','clarifications','io'): (build/'test-engine'/('lab-'+name+'.mjs')).write_text('// fixture')
        import shutil
        candidate=self.root/'candidate-build'; shutil.copytree(build,candidate)
        (candidate/'package-lock.json').write_text('{"lockfileVersion":3}')
        arms=[]
        for name,directory in (('baseline',build),('candidate',candidate)):
            fingerprint=workflow.desktop_snapshot(directory)['sha256']
            arms.append(dict(id=name,adapter='youcoded',version='build:'+fingerprint,fingerprint=fingerprint,desktopDir=str(directory)))
        from test_engine_fixture import PIN
        request=dict(mode='basic',profile='smoke',arms=arms,taskIds=[tasks.IDS[1]],model='anthropic/claude-haiku-5.5',provider='Anthropic',network='controlled-retrieval',limits=dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90),budgetUsd=1,image=PIN)
        workflow.write_new(self.root/'request.json',request)
        ledger=self.root/'ledger'; ledger.mkdir(mode=0o700)
        workflow.write_new(ledger/'ledger.json',dict(schemaVersion=1,closed=False,requests=[],limitUsd=15,priorUpperUsd=0,chargedUsd=0,reservedUsd=0))
        policy=dict(model=request['model'],provider='Anthropic',maxContextTokens=32768,maxOutputTokens=8192,maxPromptUsdPerMillion=1,maxCacheWriteUsdPerMillion=1,maxCompletionUsdPerMillion=5,reservationUsd=.2)
        workflow.write_new(self.root/'settings.json',dict(harbor=str(Path(sys.executable).resolve()),sharedLedgerPath=str(ledger/'ledger.json'),gatePolicy=policy,stopMarginUsd=.01))
        workflow.plan(self.root/'request.json',self.root/'plan')
        self.manifest=workflow.prepare(self.root/'plan/plan.json',self.root/'settings.json',self.root/'prepared')
        self.path=self.root/'prepared/prepared-manifest.json'; self.approval=self.root/'approval.json'
        workflow.write_new(self.approval,workflow.legacy.receipt_for(self.manifest,self.path))
    def test_lifecycle_retains_primary_error_even_when_gateway_cleanup_fails(self):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from lab_harbor_qualification import run_lifecycle
        probe=SimpleNamespace(root=self.path.parent,engine=SimpleNamespace(socket='/fake-not-opened'))
        with patch('lab_harbor_qualification.GatewaySession.acquire',new=AsyncMock(side_effect=ValueError('gateway config/mount registry mismatch'))),patch('lab_harbor_qualification.GatewaySession.close',new=AsyncMock(return_value=['gateway registry changed before cleanup'])):
            with self.assertRaisesRegex(ValueError,'primary operation failed: ValueError: gateway config/mount registry mismatch; qualification gateway cleanup unresolved'):
                asyncio.run(run_lifecycle(probe))
        invocation=next(self.path.parent.glob('qualification-lifecycle-*'))
        self.assertEqual(json.loads((invocation/'primary-error.json').read_text())['error'],'gateway config/mount registry mismatch')
        result=json.loads((invocation/'cleanup-result.json').read_text())
        self.assertEqual(result['primaryError']['error'],'gateway config/mount registry mismatch')
        self.assertEqual(result['cleanupErrors'],['gateway registry changed before cleanup'])
    def test_all_five_existing_adapters_run_actual_setup_without_model_requests(self):
        from test_engine_fixture import FakeEngine,PIN
        from lab_engine_qualification import EngineProbe
        plan=json.loads((self.root/'prepared/plan.json').read_text())
        with FakeEngine() as engine:
            probe=EngineProbe(self.path.parent,engine.socket); probe.image(PIN)
            native=plan['arms'][0]
            result=probe.arm(native,plan['builds'][native['id']]); self.assertTrue(result['setupQualified'])
            for adapter,version in (('claude-code','2.1.302'),('pi','1.3.0'),('opencode','1.19.3'),('hermes','v0.22.2')):
                result=probe.arm(dict(id=adapter,adapter=adapter,version=version),None)
                self.assertTrue(result['qualified']); self.assertTrue(result['setupQualified'])
            self.assertFalse(engine.containers); self.assertFalse(engine.networks)
    def test_private_mode_fixture_runs_actual_harbor_lifecycle(self):
        from lab_engine_qualification import EngineProbe
        from lab_harbor_qualification import run_lifecycle
        from test_engine_fixture import FakeEngine
        import asyncio
        task=tasks.IDS[1]
        baseline_path=self.path.parent/'tasks'/task/'tests/baseline-manifest.json'
        baseline=json.loads(baseline_path.read_bytes())
        for name in ('TASK.md','comparison-loader.cjs'):
            (self.path.parent/'tasks'/task/'environment/fixtures'/name).chmod(0o600)
            baseline[name]['mode']=0o600
        baseline_path.write_text(json.dumps(baseline))
        with FakeEngine() as engine:
            probe=EngineProbe(self.path.parent,engine.socket)
            result=asyncio.run(run_lifecycle(probe))
            self.assertTrue(result['qualified'],result)
            self.assertEqual([c['reward'] for c in result['controls']],[1,0])
            self.assertFalse(engine.containers);self.assertFalse(engine.networks)
    def test_real_fake_unix_matrix_and_bwrap_lifecycle_can_reach_one_approved_launch(self):
        from test_engine_fixture import FakeEngine
        from lab_authority import execution_authority,CHANNEL,private_json
        with FakeEngine() as engine, patch.dict(os.environ,{'YC_HARBOR_ENGINE_SOCKET':engine.socket}):
            with execution_authority(self.path,self.approval) as result:
                self.assertTrue(result['qualified'],result)
                self.assertTrue(result['lifecycle']['realGatewayStubTransport'])
                calls=len(engine.calls)
                with execution_authority(self.path,self.approval) as joined: self.assertTrue(joined['qualified'])
                self.assertEqual(len(engine.calls),calls,'nested public APIs must not duplicate the Engine qualification batch')
                execution={**self.manifest,'executionAuthorized':True,'authorizationReceiptSha256':workflow.sha(self.approval.read_bytes())}
                self.assertTrue(q.admit_execution(execution)['qualified'])
                from lab_engine_gateway import run_matrix
                from types import SimpleNamespace
                admitted=[]
                backend=SimpleNamespace(runner=lambda *args: admitted.append(args) or 0)
                self.assertEqual(run_matrix(execution,self.root/'dummy-not-provider-key',engine.socket,backend,self.root/'execution.json'),0)
                with self.assertRaises(FileExistsError): run_matrix(execution,self.root/'dummy-not-provider-key',engine.socket,backend,self.root/'execution.json')
                self.assertEqual(len(admitted),1)
                authority=os.environ[CHANNEL]
                self.assertFalse(private_json(authority)['closed'])
                original=self.approval.read_bytes(); changed=json.loads(original); changed['experimentLimitUsd']=9
                self.approval.write_text(json.dumps(changed))
                with self.assertRaisesRegex(ValueError,'receipt'): q.admit_execution(execution)
                self.approval.write_bytes(original)
                foreign=copy.deepcopy(execution); foreign['config']['sourceDir']='/foreign/source'
                with self.assertRaisesRegex(ValueError,'differs'): q.admit_execution(foreign)
                source=Path(execution['config']['sourceDir'])/'lab_engine.py'; original=source.read_bytes()
                source.write_bytes(original+b'\n# altered frozen source\n')
                with self.assertRaises(ValueError): q.admit_execution(execution)
                source.write_bytes(original)
            self.assertTrue(private_json(authority)['closed'])
            self.assertFalse(engine.containers); self.assertFalse(engine.networks)
            with self.assertRaisesRegex(ValueError,'authority'): q.admit_execution(execution)
    def test_missing_second_native_dependencies_refuses_before_key_or_routed_gateway(self):
        from test_engine_fixture import FakeEngine
        with FakeEngine() as engine, patch.dict(os.environ,{'YC_HARBOR_ENGINE_SOCKET':engine.socket}), patch('lab_engine_gateway.GatewaySession.acquire',side_effect=AssertionError('no routed gateway before all native locks')) as gateway, patch('targeted_workflow.private_key_metadata',side_effect=AssertionError('must not inspect provider key')) as key:
            engine.bad_adapter='second-native'
            with self.assertRaisesRegex(ValueError,'not qualified') as refusal:
                workflow.run(self.path,True,self.approval,self.root/'must-not-read-provider-key')
            gateway.assert_not_called(); key.assert_not_called()
            result=json.loads(str(refusal.exception).split(': ',1)[1])
            self.assertTrue(result['arms'][0]['qualified']); self.assertFalse(result['arms'][1]['qualified'])
            self.assertNotEqual(result['arms'][0]['dependencyLockKey'],result['arms'][1]['dependencyLockKey'])
            self.assertFalse(engine.containers); self.assertFalse(engine.networks)
    def test_known_orphan_journal_blocks_scope_reuse_before_any_probe(self):
        from lab_authority import execution_authority
        from lab_engine_registry import event
        journal=self.path.parent/'oc-orphan.ownership.jsonl'
        event(journal,action='acquired',kind='container',id='f'*64,image='sha256:'+'c'*64,labels={})
        with patch.dict(os.environ,{'YC_HARBOR_ENGINE_SOCKET':'/not-a-real-engine.sock'}),patch('evaluation_qualification.qualify',side_effect=AssertionError('must not open any Engine')) as probe:
            with self.assertRaisesRegex(ValueError,'unresolved owned'):
                with execution_authority(self.path,self.approval): self.fail('must not reuse orphaned scope')
            probe.assert_not_called()
    def test_changed_receipt_wrong_source_and_schema_downgrade_never_probe_or_read_key(self):
        from lab_authority import execution_authority,bound_scope
        with patch('evaluation_qualification.qualify',side_effect=AssertionError('preflight must not start')):
            receipt=json.loads(self.approval.read_text()); receipt['experimentLimitUsd']=9
            self.approval.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError,'receipt'):
                with execution_authority(self.path,self.approval): self.fail('must refuse')
            self.approval.write_text(json.dumps(workflow.legacy.receipt_for(self.manifest,self.path)))
            changed=copy.deepcopy(self.manifest); changed['schemaVersion']=1
            self.path.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError,'schema 2'): bound_scope(self.path,self.approval)
            for version in (0,1,2):
                with self.assertRaises(ValueError): q.admit_execution(dict(schemaVersion=version,executionAuthorized=True,config={'sourceDir':'/foreign/source'}))


if __name__=='__main__': unittest.main()
