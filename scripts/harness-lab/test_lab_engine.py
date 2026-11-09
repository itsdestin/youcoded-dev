"""Real HTTP framing over an owned fake Unix socket; never a daemon/provider."""
import asyncio
import base64
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest

from lab_engine import Engine, Policy, DockerCapability, API, PRIVATE_OPTIONS

CID = 'a'*64
GID = 'b'*64
IMAGE = 'sha256:'+'c'*64
LABELS = {'io.youcoded.session':'session', 'io.youcoded.nonce':'d'*32,
          'io.youcoded.role':'trial'}


class EngineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.socket = str(Path(self.tmp.name)/'engine.sock')
        self.calls = []; self.payloads=[]; self.paused = False; self.pause_works = True; self.stall = False
        self.archive_data=b'hello'; self.archive_stat=None; self.chunked=False; self.version='27.5.1'; self.alias=True
        self.api_version=API; self.min_api_version='1.24'; self.platform=('linux','amd64'); self.version_overrides={}
        self.extra_length=0; self.pause_warning=False; self.stall_upload=False; self.upload_ready=asyncio.Event(); self.upload_release=asyncio.Event()
        self.gate = asyncio.Event(); self.connected = asyncio.Event(); self.disconnected = asyncio.Event()
        self.record = dict(Id=CID, Image=IMAGE, Config=dict(Labels=LABELS, Volumes=None),
                           Mounts=[], HostConfig=dict(Privileged=False, Binds=None, NetworkMode='private',
                           CapDrop=['ALL'], SecurityOpt=['no-new-privileges'], PidMode='', IpcMode='private',Dns=['127.0.0.1']),
                           NetworkSettings=dict(Networks={'private':{'NetworkID':'net'}}))
        self.peers = {CID:{},GID:{}}
        self.server = await asyncio.start_unix_server(self.handle, self.socket)
        self.policy = Policy(self.socket, 'session', 'd'*32, IMAGE, 'private', 'net', GID, IMAGE)
        self.backend = DockerCapability(self.policy, Engine(self.socket), CID)
    async def asyncTearDown(self):
        self.gate.set(); self.upload_release.set(); self.server.close(); await self.server.wait_closed(); self.tmp.cleanup()
    async def handle(self, reader, writer):
        try:
            line = await reader.readline(); method, path, _ = line.decode().strip().split(' ')
            headers = {}
            while (line := await reader.readline()) != b'\r\n':
                key, value = line.decode().split(':',1); headers[key.lower()] = value.strip()
            payload=await reader.readexactly(int(headers.get('content-length','0')))
            self.calls.append((method,path)); self.payloads.append(payload)
            status = 200; extra = {}; body = b'{}'
            if path == '/version':
                version=dict(ApiVersion=self.api_version, MinAPIVersion=self.min_api_version, Version=self.version, Os=self.platform[0], Arch=self.platform[1])
                version.update(self.version_overrides)
                if self.min_api_version is None: version.pop('MinAPIVersion')
                body=json.dumps(version).encode()
            elif path.endswith('/pause'):
                self.paused = self.pause_works; status = 200 if self.pause_warning else 204
                body = b'{"Warnings":["not frozen"]}' if self.pause_warning else b''
            elif path.endswith('/json') and '/containers/' in path:
                record = copy.deepcopy(self.record); record['State'] = dict(Paused=self.paused,Running=True)
                if GID in path:
                    record.update(Id=GID); record['Config']['Labels']={**LABELS,'io.youcoded.role':'gateway'}
                    record['NetworkSettings']['Networks']['private']['Aliases']=['yc-router-gateway'] if self.alias else ['foreign']
                body = json.dumps(record).encode()
            elif '/networks/' in path:
                body = json.dumps(dict(Id='net', Name='private', Internal=True, Driver='bridge',EnableIPv6=False,Options=PRIVATE_OPTIONS,
                        Labels={'io.youcoded.session':'session','io.youcoded.nonce':'d'*32},
                        Containers=self.peers)).encode()
            elif '/images/' in path:
                body=json.dumps(dict(Id=IMAGE,Os='linux',Architecture='amd64',Config={})).encode()
            elif path.split('?',1)[0].endswith('/containers/create'):
                created=json.loads(payload); self.assertEqual(created['Image'],IMAGE)
                self.assertNotIn('Mounts',created['HostConfig']); self.peers[CID]={}
                body=json.dumps(dict(Id=CID,Warnings=[])).encode(); status=201
            elif path.endswith('/start') and '/exec/' not in path: status=204; body=b''
            elif path.endswith('/exec'):
                body=json.dumps(dict(Id='e'*64)).encode(); status=201
            elif '/exec/' in path and path.endswith('/start'):
                body=b'\x01\0\0\0'+(2).to_bytes(4,'big')+b'ok'
            elif '/exec/' in path and path.endswith('/json'):
                body=json.dumps(dict(Running=False,ExitCode=0)).encode()
            elif '/archive?' in path and method=='GET':
                extra['Content-Type']='application/x-tar'
                extra['X-Docker-Container-Path-Stat'] = self.archive_stat or base64.b64encode(json.dumps(dict(name='app',mode=2147484141,size=0,linkTarget='')).encode()).decode()
                body = self.archive_data
            if method=='PUT' and self.stall_upload:
                self.upload_ready.set(); await self.upload_release.wait()
            framing='Transfer-Encoding: chunked\r\n' if self.chunked else f'Content-Length: {len(body)+self.extra_length}\r\n'
            payload = (f'HTTP/1.1 {status} OK\r\n'+framing+''.join(f'{k}: {v}\r\n' for k,v in extra.items())+'\r\n').encode()
            if self.chunked: body=f'{len(body):x}\r\n'.encode()+body+b'\r\n0\r\n\r\n'
            writer.write(payload); await writer.drain()
            if self.stall and '/archive?' in path:
                self.connected.set(); await reader.read(); self.disconnected.set()
            else: writer.write(body); await writer.drain()
        finally:
            writer.close(); await writer.wait_closed()
    async def test_foreign_identity_mounts_and_network_peers_refused_before_pause(self):
        for mutation in ('foreign','mount','peer','dns'):
            with self.subTest(mutation=mutation):
                self.backend=DockerCapability(self.policy,Engine(self.socket),CID)
                original = copy.deepcopy(self.record); peers = self.peers.copy()
                if mutation == 'foreign': self.record['Config']['Labels']={}
                if mutation == 'mount': self.record['Mounts']=[dict(Type='bind',Destination='/app',RW=True)]
                if mutation == 'peer': self.peers['e'*64]={}
                if mutation == 'dns': self.record['HostConfig']['Dns']=['8.8.8.8']
                with self.assertRaises(ValueError): await self.backend.seal_all()
                self.assertFalse(any(path.endswith('/pause') for _,path in self.calls))
                self.record = original; self.peers = peers
    async def test_pause_warning_is_not_a_successful_freeze(self):
        self.pause_warning=True
        with self.assertRaisesRegex(ValueError,'warning/body'): await self.backend.seal_all()
        self.assertTrue(self.backend.poisoned)
        with self.assertRaisesRegex(ValueError,'poisoned'): await self.backend.archive('/app')
        self.assertFalse(any('/archive?' in path for _,path in self.calls))
    async def test_pause_must_be_positively_inspected(self):
        self.pause_works = False
        with self.assertRaisesRegex(ValueError,'paused'): await self.backend.seal_all()
        self.assertFalse(any('/archive?' in path for _,path in self.calls))
    async def test_partial_and_oversized_http_archives_fail_closed(self):
        await self.backend.seal_all()
        with self.assertRaisesRegex(ValueError,'byte limit'):
            await self.backend.engine.request('GET','/containers/'+CID+'/archive?path=%2Fapp',raw=True,limit=4)
        self.extra_length=2
        _,stream=await self.backend.engine.request('GET','/containers/'+CID+'/archive?path=%2Fapp',raw=True)
        with self.assertRaises(asyncio.IncompleteReadError): await stream.read(8)
        self.assertTrue(stream.writer.is_closing())
    async def test_all_writer_seal_waits_for_host_side_upload_completion(self):
        source=Path(self.tmp.name)/'payload'; source.write_text('bounded')
        self.stall_upload=True
        backend=self.backend
        class ObservedLock:
            def __init__(self): self.lock=asyncio.Lock(); self.calls=0; self.second=asyncio.Event()
            async def __aenter__(self):
                self.calls+=1
                if self.calls==2: self.second.set()
                await self.lock.acquire()
            async def __aexit__(self,*args): self.lock.release()
        backend._writers=ObservedLock()
        upload=asyncio.create_task(backend.upload_file(source,'/app/payload'))
        await self.upload_ready.wait()
        seal=asyncio.create_task(backend.seal_all()); await backend._writers.second.wait()
        self.assertFalse(any(path.endswith('/pause') for _,path in self.calls))
        self.upload_release.set(); await upload; await seal
        self.assertTrue(await backend.confirm_sealed(CID))
    async def test_actual_archive_stat_and_bounded_http_reads(self):
        receipt = await self.backend.seal_all(); self.assertTrue(await self.backend.confirm_sealed(receipt))
        stream = await self.backend.archive('/app')
        self.assertEqual(await stream.read(2),b'he'); self.assertEqual(await stream.read(8),b'llo')
        self.assertEqual(await stream.read(8),b''); await stream.close()
    async def test_cancel_closes_partial_archive_connection(self):
        await self.backend.seal_all(); self.stall=True
        stream=await self.backend.archive('/app'); await self.connected.wait()
        reading=asyncio.Event(); wait=stream.wait
        async def observed(awaitable):
            reading.set(); return await wait(awaitable)
        stream.wait=observed
        task=asyncio.create_task(stream.read(8)); await reading.wait(); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertTrue(stream.writer.is_closing())
        await asyncio.wait_for(self.disconnected.wait(),2)
    async def test_policy_is_private_task_session_bound_and_never_submission_selected(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        from lab_engine import controller_backend
        from lab_engine_qualification import write_controller_policy
        directory=Path(self.tmp.name)/'environment'; (directory/'fixtures').mkdir(parents=True)
        file=Path(self.tmp.name)/'controller.json'
        write_controller_policy(file,self.policy,directory,session_id='exact-session')
        env=SimpleNamespace(environment_dir=directory,session_id='exact-session',controller_job_id=None)
        with patch.dict('os.environ',{'YC_HARBOR_CONTROLLER_POLICY':str(file)}):
            backend=controller_backend(env); self.assertEqual(backend.policy.socket,self.socket)
            env.session_id='foreign'
            with self.assertRaisesRegex(ValueError,'session mismatch'): controller_backend(env)
            env.session_id='exact-session'; file.chmod(0o644)
            with self.assertRaisesRegex(ValueError,'private controller'): controller_backend(env)
        self.assertEqual(self.calls,[])
    async def test_current_image_preflight_checks_version_before_any_owned_resources(self):
        from lab_engine_qualification import EngineProbe
        probe=EngineProbe(self.tmp.name,self.socket)
        result=await asyncio.to_thread(probe.image,'fixture@'+IMAGE)
        self.assertTrue(result['qualified'])
        self.calls.clear(); self.version='28.0.0'
        with self.assertRaisesRegex(ValueError,'version'):
            await asyncio.to_thread(probe.image,'fixture@'+IMAGE)
        self.assertEqual(self.calls,[('GET','/version')])
    async def test_reviewed_servers_accept_compatible_api_ranges_and_keep_wire_api(self):
        from lab_engine_qualification import EngineProbe
        for version,minimum,maximum in (('27.5.1','1.24','1.47'),('29.8.2','1.40','1.56'),('29.8.2','1.47','1.47')):
            with self.subTest(version=version,minimum=minimum,maximum=maximum):
                self.calls.clear(); self.version=version; self.min_api_version=minimum; self.api_version=maximum
                result=await asyncio.to_thread(EngineProbe(self.tmp.name,self.socket).image,'fixture@'+IMAGE)
                self.assertEqual(result['engine']['Version'],version)
                self.assertEqual(result['engine']['MinAPIVersion'],minimum)
                self.assertEqual(result['engine']['ApiVersion'],maximum)
                self.assertEqual(API,'1.47')
                self.assertEqual(self.calls,[('GET','/version'),('GET','/v1.47/images/fixture@'+IMAGE+'/json'),('GET','/version')])

    async def test_unsupported_versions_ranges_and_platforms_refuse_before_resources(self):
        cases=[dict(Version='28.0.0'),dict(Version='29.8.3'),dict(Version='29.8.2+custom'),
               dict(Version=None),dict(Version=[]),dict(Version={}),
               dict(MinAPIVersion='1.9',ApiVersion='1.10'),
               dict(MinAPIVersion='1.48',ApiVersion='1.56'),dict(MinAPIVersion='1.24',ApiVersion='1.46'),
               dict(MinAPIVersion='1.56',ApiVersion='1.40'),dict(Os='windows'),dict(Arch='arm64')]
        for field in ('MinAPIVersion','ApiVersion'):
            cases.extend({field:value} for value in ('','1.47.0','v1.47','1.47\n','01.47',1.47,False,None,[],{}))
        for overrides in cases:
            with self.subTest(overrides=overrides):
                self.calls.clear(); self.version_overrides=overrides
                with self.assertRaisesRegex(ValueError,'unsupported Engine'):
                    await self.backend.engine.preflight()
                self.assertEqual(self.calls,[('GET','/version')])
        self.calls.clear(); self.version_overrides={}; self.min_api_version=None
        with self.assertRaisesRegex(ValueError,'unsupported Engine'):
            await self.backend.engine.preflight()
        self.assertEqual(self.calls,[('GET','/version')])
    async def test_owned_creation_upload_and_existing_host_exec_contract(self):
        self.peers={GID:{}}
        backend=DockerCapability(self.policy,Engine(self.socket))
        await backend.start()
        source=Path(self.tmp.name)/'input'; source.write_text('bounded')
        await backend.upload_file(source,'/opt/youcoded-lab/config.json')
        result=await backend.exec('true',env={'TOKEN':'opaque'})
        self.assertEqual((result.return_code,result.stdout),(0,'ok'))
        self.assertTrue(any(m=='PUT' and '/archive?' in p for m,p in self.calls))
        self.assertFalse(any(self.socket.encode() in p for p in self.payloads))
        self.record['Config']['Labels']={}
        with self.assertRaisesRegex(ValueError,'foreign'): await backend.stop()
        self.assertFalse(any(m=='DELETE' for m,p in self.calls))
    async def test_chunked_framing_stat_context_and_absolute_timeout(self):
        await self.backend.seal_all(); self.chunked=True
        stream=await self.backend.archive('/app')
        self.assertEqual(await stream.read(8),b'hello'); self.assertEqual(await stream.read(8),b''); await stream.close()
        self.chunked=False
        self.archive_stat=base64.b64encode(json.dumps(dict(name='tests',mode=2147484141,linkTarget='')).encode()).decode()
        with self.assertRaisesRegex(ValueError,'stat context'): await self.backend.archive('/app')
        self.archive_stat=None; self.stall=True
        stream=await self.backend.archive('/app'); stream.deadline=0
        with self.assertRaises(TimeoutError): await stream.read(1)
        await asyncio.wait_for(self.disconnected.wait(),2)
    async def test_alias_and_directory_symlink_upload_fail_closed(self):
        self.alias=False
        with self.assertRaisesRegex(ValueError,'alias'): await self.backend.seal_all()
        self.alias=True; self.backend=DockerCapability(self.policy,Engine(self.socket),CID)
        source=Path(self.tmp.name)/'source'; source.mkdir(); (source/'secret').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError): await self.backend.upload_dir(source,'/app')
        self.assertFalse(any(m=='PUT' for m,p in self.calls))
    async def test_archive_top_directory_is_stripped_only_after_safe_inventory(self):
        import tarfile
        from lab_harbor_transport import inventory,materialize
        import time
        output=io.BytesIO()
        with tarfile.open(fileobj=output,mode='w',format=tarfile.USTAR_FORMAT) as tar:
            root=tarfile.TarInfo('app/'); root.type=tarfile.DIRTYPE; tar.addfile(root)
            entry=tarfile.TarInfo('app/file'); entry.size=2; tar.addfile(entry,io.BytesIO(b'ok'))
        output.seek(0); entries,_=inventory(output,time.monotonic()+5,'app')
        target=Path(self.tmp.name)/'snapshot'; materialize(output,entries,target,time.monotonic()+5)
        self.assertEqual((target/'file').read_bytes(),b'ok')
        output.seek(0)
        with self.assertRaisesRegex(ValueError,'top directory'): inventory(output,time.monotonic()+5,'other')
    async def test_unsafe_creation_policy_and_unsealed_reads(self):
        with self.assertRaises(ValueError): Policy('tcp://engine','session','d'*32,IMAGE,'private','net',GID,IMAGE)
        with self.assertRaisesRegex(ValueError,'sealed'): await self.backend.archive('/app')
        with self.assertRaises(ValueError): await self.backend.upload_file('/etc/passwd','/logs/verifier/forged')
        with self.assertRaises(ValueError): await self.backend.archive('/app/../tests')

class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.socket=str(Path(self.tmp.name)/'gateway.sock')
        self.networks={}; self.container=None; self.calls=[]; self.requests=[]
        self.server=await asyncio.start_unix_server(self.handle,self.socket)
    async def asyncTearDown(self):
        self.server.close(); await self.server.wait_closed(); self.tmp.cleanup()
    async def handle(self,reader,writer):
        try:
            method,path,_=(await reader.readline()).decode().strip().split(' '); headers={}
            while (line:=await reader.readline())!=b'\r\n':
                key,value=line.decode().split(':',1); headers[key.lower()]=value.strip()
            raw=await reader.readexactly(int(headers.get('content-length','0')))
            body=json.loads(raw) if raw else None; self.calls.append((method,path)); self.requests.append(body)
            path=path.removeprefix('/v'+API); status=200; result={}
            if path=='/version': result=dict(ApiVersion=API,MinAPIVersion='1.24',Version='27.5.1',Os='linux',Arch='amd64')
            elif path.startswith('/images/'): result=dict(Id=IMAGE,Os='linux',Architecture='amd64',Config={})
            elif path=='/networks/create':
                nid=str(len(self.networks)+1)*64; self.networks[nid]={**body,'Id':nid,'Containers':{}}
                result=dict(Id=nid,Warning=''); status=201
            elif path.split('?',1)[0]=='/containers/create':
                attached=next((nid for nid,n in self.networks.items() if n['Name']==body['HostConfig']['NetworkMode']))
                self.container={**body,'Id':GID,'Image':IMAGE,'Config':{k:v for k,v in body.items() if k not in ('HostConfig','NetworkingConfig')},
                    'Mounts':[dict(Type='bind',Source=m['Source'],Destination=m['Target'],RW=not m['ReadOnly']) for m in body['HostConfig']['Mounts']],'NetworkSettings':{'Networks':{self.networks[attached]['Name']:{'NetworkID':attached}}}}
                self.networks[attached]['Containers'][GID]={}; result=dict(Id=GID,Warnings=[]); status=201
            elif path.endswith('/connect'):
                nid=path.split('/')[2]; self.networks[nid]['Containers'][GID]={}
                self.container['NetworkSettings']['Networks'][self.networks[nid]['Name']]={'NetworkID':nid,**body['EndpointConfig']}
            elif path.startswith('/containers/') and method=='GET': result=self.container
            elif path.startswith('/networks/') and method=='GET': result=self.networks[path.split('/')[2]]
            elif path.endswith('/exec'): result=dict(Id='e'*64); status=201
            elif path.startswith('/exec/') and method=='GET': result=dict(Running=False,ExitCode=0)
            elif method=='DELETE' and path.startswith('/containers/'):
                for n in self.networks.values(): n['Containers'].clear()
                self.container=None; status=204; result=None
            elif method=='DELETE' and path.startswith('/networks/'):
                del self.networks[path.split('/')[2]]; status=204; result=None
            data=json.dumps(result).encode() if result is not None else b''
            writer.write(f'HTTP/1.1 {status} OK\r\nContent-Length: {len(data)}\r\n\r\n'.encode()+data); await writer.drain()
        finally: writer.close(); await writer.wait_closed()
    async def test_current_gateway_api_acquires_private_bridge_and_key_only_gateway(self):
        from lab_engine_gateway import GatewaySession
        manifest=dict(config=dict(sourceDir=self.tmp.name+'/source',ledgerPath=self.tmp.name+'/ledger/ledger.json'),
                      preparation=dict(cohort='modes-'+'f'*24,image='fixture@'+IMAGE))
        session=GatewaySession(manifest,Path(self.tmp.name)/'provider-key',self.socket)
        policy=await session.acquire()
        self.assertEqual(len(self.networks),2)
        self.assertTrue(self.networks[policy.network_id]['Internal'])
        self.assertFalse(self.networks[policy.gateway_outbound]['Internal'])
        self.assertEqual(set(self.networks[policy.network_id]['Containers']),{GID})
        self.assertFalse(any('PortBindings' in (r or {}).get('HostConfig',{}) for r in self.requests))
        mounts=self.container['HostConfig']['Mounts']; self.assertTrue(next(m for m in mounts if m['Target']=='/provider-key')['ReadOnly'])
        self.assertFalse(any(self.socket in str(m) for m in mounts))
        await session.close(); self.assertEqual(self.networks,{})
    async def test_direct_matrix_execution_is_universally_blocked_before_key_or_engine(self):
        from lab_engine_gateway import run_matrix
        from unittest.mock import patch
        for version in (1,2,0):
            with patch('lab_engine_gateway.Engine',side_effect=AssertionError('must not construct Engine')):
                with self.assertRaisesRegex(ValueError,'authority unqualified'):
                    run_matrix(dict(schemaVersion=version,executionAuthorized=True),'/not-a-key',self.socket,None,'/out')
        self.assertEqual(self.calls,[])


class OwnershipTests(unittest.TestCase):
    def gateway(self,engine):
        from lab_engine_gateway import GatewaySession
        from test_engine_fixture import PIN
        manifest=dict(config=dict(sourceDir=str(engine.root/'source'),ledgerPath=str(engine.root/'ledger/ledger.json')),
                      preparation=dict(cohort='modes-'+'f'*24,image=PIN))
        return GatewaySession(manifest,engine.root/'dummy-key',engine.socket)
    def test_pending_owned_start_failure_is_still_safely_deleted_and_journaled(self):
        from test_engine_fixture import FakeEngine
        from dataclasses import replace
        from lab_engine_registry import active
        with FakeEngine() as engine:
            gateway=self.gateway(engine); policy=asyncio.run(gateway.acquire())
            policy=replace(policy,registry_path=str(engine.root/'pending.ownership.jsonl'))
            backend=DockerCapability(policy); engine.fail_start=True
            with self.assertRaises(ValueError): asyncio.run(backend.start())
            cid=backend.cid; self.assertIn(('container',cid),active(policy.registry_path))
            asyncio.run(backend.stop()); self.assertNotIn(cid,engine.containers)
            self.assertEqual(active(policy.registry_path),{})
            self.assertEqual(asyncio.run(gateway.close()),[])
    def test_valid_warning_ids_are_registered_before_rejection_and_cleaned(self):
        from test_engine_fixture import FakeEngine,IMAGE
        from lab_engine_qualification import EngineProbe
        from lab_engine_registry import active
        async def unused(cap): raise AssertionError('warning must precede trial action')
        for owner in ('gateway','qualification'):
            for warning in ('network','gateway'):
                with self.subTest(owner=owner,warning=warning), FakeEngine() as engine:
                    setattr(engine,'warn_'+warning,True)
                    if owner=='gateway':
                        gateway=self.gateway(engine)
                        with self.assertRaisesRegex(ValueError,'warning'): asyncio.run(gateway.acquire())
                        self.assertTrue(active(gateway.registry_path))
                        self.assertEqual(asyncio.run(gateway.close()),[])
                    else:
                        probe=EngineProbe(engine.root,engine.socket); probe.image_id=IMAGE
                        with self.assertRaisesRegex(ValueError,'warning'): asyncio.run(probe.owned(unused))
                        journals=list(engine.root.glob('qualification-owned-*.jsonl')); self.assertEqual(len(journals),1)
                        self.assertEqual(active(journals[0]),{})
                    self.assertFalse(engine.containers); self.assertFalse(engine.networks)
    def test_crashed_trial_fallback_uses_only_durable_exact_ids_and_rejects_foreign(self):
        from test_engine_fixture import FakeEngine
        from dataclasses import replace,asdict
        from unittest.mock import patch
        from lab_engine_registry import active
        from lab_harbor_qualification import write_json
        import run_objective_comparison as serial
        with FakeEngine() as engine:
            gateway=self.gateway(engine); policy=asyncio.run(gateway.acquire())
            policy=replace(policy,registry_path=str(engine.root/'crashed.ownership.jsonl'))
            backend=DockerCapability(policy); asyncio.run(backend.start()); asyncio.run(backend.seal_all())
            cid=backend.cid; row=dict(trialKey='crash-fixture',taskId='task',taskPath=str(engine.root/'task'))
            config=dict(jobsDir=str(engine.root/'jobs'),hostVerification={'taskIds':['task']})
            file=engine.root/'policy.json'; write_json(file,{'jobs':{serial.job_id(row):dict(engine=asdict(policy),environmentDir=row['taskPath']+'/environment',jobDir=str(engine.root/'jobs'/serial.job_id(row)))}})
            engine.containers[cid]['Config']['Labels']={}
            with patch.dict('os.environ',{'YC_HARBOR_CONTROLLER_POLICY':str(file)}),patch('subprocess.run',side_effect=AssertionError('Compose discovery forbidden')):
                errors=serial.cleanup_containers(row,config); self.assertTrue(errors)
                self.assertIn(cid,engine.containers); self.assertTrue(active(policy.registry_path))
                engine.containers[cid]['Config']['Labels']=policy.labels()
                self.assertEqual(serial.cleanup_containers(row,config),[])
            self.assertNotIn(cid,engine.containers); self.assertEqual(active(policy.registry_path),{})
            self.assertEqual(asyncio.run(gateway.close()),[])
            self.assertFalse(any('/containers/json' in p for _,p in engine.calls))
    def test_gateway_delete_errors_do_not_skip_safe_remaining_network_cleanup(self):
        from test_engine_fixture import FakeEngine
        from lab_engine_registry import active
        with FakeEngine() as engine:
            gateway=self.gateway(engine); policy=asyncio.run(gateway.acquire())
            engine.fail_delete.add(policy.gateway_outbound)
            errors=asyncio.run(gateway.close())
            self.assertEqual(len(errors),1); self.assertIn(policy.gateway_outbound,errors[0])
            self.assertFalse(engine.containers); self.assertEqual(set(engine.networks),{policy.gateway_outbound})
            self.assertEqual(set(active(gateway.registry_path)),{('network',policy.gateway_outbound)})
    def test_failed_gateway_cleanup_publishes_unresolved_invocation_journal(self):
        from test_engine_fixture import FakeEngine,PIN
        from unittest.mock import patch
        from types import SimpleNamespace
        from lab_engine_gateway import run_matrix
        with FakeEngine() as engine:
            manifest=dict(config=dict(sourceDir=str(engine.root/'source'),ledgerPath=str(engine.root/'ledger/ledger.json'),jobsDir=str(engine.root/'jobs'),hostVerification={'taskIds':['task']}),
                          preparation=dict(cohort='modes-'+'f'*24,image=PIN),trials=[dict(trialKey='failure-fixture',taskId='task',taskPath=str(engine.root/'task'))])
            def runner(*args):
                engine.fail_delete.update(engine.containers); return 0
            # Explicit orchestration fixture injection, never a production receipt.
            with patch('evaluation_qualification.admit_execution'),patch('lab_authority.claim_launch'),patch.dict('os.environ',{'YC_HARBOR_ENGINE_SOCKET':engine.socket}):
                with self.assertRaisesRegex(ValueError,'cleanup failed'):
                    run_matrix(manifest,engine.root/'dummy-key',engine.socket,SimpleNamespace(runner=runner),engine.root/'execution.json')
            events=[json.loads(line) for line in (engine.root/'cleanup.jsonl').read_text().splitlines()]
            self.assertEqual(len(events),1); self.assertEqual(len(events[0]['cleanupErrors']),3)
            self.assertEqual(len(events[0]['unresolved']),3)
            from lab_engine_registry import ensure_clean
            with self.assertRaisesRegex(ValueError,'unresolved owned'): ensure_clean(engine.root)
            for nid in engine.networks:
                self.assertTrue(any(m=='GET' and p.endswith('/networks/'+nid) for m,p in engine.calls))


if __name__ == '__main__': unittest.main()
