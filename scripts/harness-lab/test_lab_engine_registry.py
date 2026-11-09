"""Lost create responses leave durable uncertainty, never guessed ownership."""
import asyncio
import importlib
import json
import unittest
from unittest.mock import patch

import lab_engine_registry as registry
from lab_engine import Engine
from test_engine_fixture import FakeEngine,IMAGE,PIN


class IntentTests(unittest.TestCase):
    def test_private_modes_roundtrip_real_upload_ustar_sealed_snapshot_sidecar(self):
        import tempfile
        from pathlib import Path
        from dataclasses import replace
        from lab_engine_gateway import GatewaySession
        from lab_engine import DockerCapability
        from lab_harbor_transport import bounded_spool,inventory,materialize
        import time
        with FakeEngine() as server:
            manifest=dict(config=dict(sourceDir=str(server.root/'source'),ledgerPath=str(server.root/'ledger/ledger.json')),preparation=dict(cohort='modes-'+'f'*24,image=PIN))
            gateway=GatewaySession(manifest,server.root/'dummy',server.socket)
            policy=asyncio.run(gateway.acquire())
            backend=DockerCapability(replace(policy,registry_path=str(server.root/'trial.ownership.jsonl')))
            source=server.root/'input';source.mkdir()
            for name,mode in [('private',0o600),('public',0o644)]:
                (source/name).write_text('unchanged');(source/name).chmod(mode)
            async def run():
                await backend.start();await backend.upload_dir(source,'/app');await backend.seal_all()
                stream=await backend.archive('/app')
                try:
                    with tempfile.TemporaryFile() as spool:
                        deadline=time.monotonic()+10;await bounded_spool(stream,spool,deadline)
                        entries,_=inventory(spool,deadline,'app');modes={}
                        for parts,kind,_,offset in entries:
                            if kind==b'5':continue
                            spool.seek(offset-412);modes['/'.join(parts)]=int(spool.read(8).rstrip(b'\0 '),8)&0o777
                        target=server.root/'snapshot';materialize(spool,entries,target,deadline)
                        self.assertEqual(modes,{'private':0o600,'public':0o644})
                        self.assertEqual((target/'private').stat().st_mode&0o777,0o400)
                        self.assertEqual((target/'public').stat().st_mode&0o777,0o400)
                finally:await stream.close()
                await backend.stop();self.assertEqual(await gateway.close(),[])
            asyncio.run(run())

    def test_observed_oom_false_null_normalization_is_exact_and_input_immutable(self):
        import copy
        from lab_engine import gateway_signature
        before=dict(Config={'Labels':{'owner':'exact'}},HostConfig={'OomKillDisable':False,'Memory':536870912,'Privileged':False},Mounts=[])
        after=copy.deepcopy(before); after['HostConfig']['OomKillDisable']=None
        saved=copy.deepcopy((before,after))
        self.assertEqual(gateway_signature(before),gateway_signature(after))
        self.assertEqual((before,after),saved)
        for value in (True,0,'false'):
            bad=copy.deepcopy(after); bad['HostConfig']['OomKillDisable']=value
            with self.assertRaisesRegex(ValueError,'OOM'): gateway_signature(bad)
        bad=copy.deepcopy(after); bad['HostConfig']['Privileged']=True
        self.assertNotEqual(gateway_signature(before),gateway_signature(bad))
    def test_gateway_signature_canonicalizes_only_mount_order_not_authority(self):
        import copy
        from lab_engine import gateway_signature
        record=dict(Config={'Labels':{'owner':'exact'}},HostConfig={'Memory':536870912,'MemorySwap':536870912,'Runtime':'runc','Mounts':[
            {'Type':'bind','Source':'/source/a','Target':'/a','ReadOnly':True},
            {'Type':'bind','Source':'/source/b','Target':'/b','ReadOnly':False}]},Mounts=[
            {'Type':'bind','Source':'/source/a','Destination':'/a','RW':False,'Propagation':'rprivate'},
            {'Type':'bind','Source':'/source/b','Destination':'/b','RW':True,'Propagation':'rprivate'}])
        reordered=copy.deepcopy(record); reordered['Mounts'].reverse(); reordered['HostConfig']['Mounts'].reverse()
        self.assertEqual(gateway_signature(record),gateway_signature(reordered))
        for section,field,value in [('Mounts','RW',True),('Mounts','Source','/foreign'),('Mounts','Propagation','shared')]:
            bad=copy.deepcopy(record); bad[section][0][field]=value
            self.assertNotEqual(gateway_signature(record),gateway_signature(bad))
        for section in ('Mounts','HostConfig'):
            bad=copy.deepcopy(record)
            if section=='Mounts': bad['Mounts'].append(copy.deepcopy(bad['Mounts'][0]))
            else: bad['HostConfig']['Mounts'].append(copy.deepcopy(bad['HostConfig']['Mounts'][0]))
            with self.assertRaisesRegex(ValueError,'duplicate'): gateway_signature(bad)
        for field,value in [('MemorySwap',-1),('Runtime','untrusted'),('Privileged',True)]:
            bad=copy.deepcopy(record); bad['HostConfig'][field]=value
            self.assertNotEqual(gateway_signature(record),gateway_signature(bad))
    def test_start_signature_change_is_diagnosed_without_weakening_security_check(self):
        from lab_engine_gateway import GatewaySession
        with FakeEngine() as server:
            original=server.route
            def route(method,target,raw):
                result=original(method,target,raw)
                if method=='POST' and target.endswith('/start'):
                    for record in server.containers.values():
                        record['HostConfig']['Runtime']='runc-normalized'
                        record['Config']['Env']=['DO_NOT_DUMP=secret-value']
                return result
            server.route=route
            manifest=dict(config=dict(sourceDir=str(server.root/'source'),ledgerPath=str(server.root/'ledger/ledger.json')),preparation=dict(cohort='modes-'+'f'*24,image=PIN))
            gateway=GatewaySession(manifest,server.root/'dummy',server.socket)
            with self.assertRaisesRegex(ValueError,'resource/runtime policy mismatch'): asyncio.run(gateway.acquire())
            self.assertTrue(asyncio.run(gateway.close()))
            records=[json.loads(line) for line in __import__('pathlib').Path(gateway.registry_path).read_text().splitlines()]
            snapshots=[r for r in records if r['action']=='inspection']
            self.assertEqual([r['phase'] for r in snapshots],['prestart','poststart','cleanup'])
            self.assertEqual(snapshots[1]['observed']['HostConfig']['Runtime'],'runc-normalized')
            self.assertNotIn('secret-value',json.dumps(records))
            self.assertNotIn('Env',snapshots[1]['observed']['Config'])
    def test_inherited_image_labels_are_exact_bound_on_all_container_paths(self):
        from lab_engine_gateway import GatewaySession
        from lab_engine_qualification import EngineProbe
        from lab_engine import DockerCapability
        from dataclasses import replace
        inherited={'io.youcoded.cohort':'session148-basic-deps-v2','io.youcoded.lock':'8c53569be8e12cb7a1831fd5b90d5a7e8d86e3dec1086934e88e5188e8e91976',
                   'io.youcoded.session':'wrong-inherited-owner','io.youcoded.nonce':'wrong','io.youcoded.role':'wrong'}
        with FakeEngine() as server:
            original=server.route
            def route(method,target,raw):
                status,result,headers=original(method,target,raw)
                if '/images/' in target: result['Config']['Labels']=inherited.copy()
                if method=='POST' and '/containers/create' in target:
                    record=server.containers[result['Id']]
                    record['Config']['Labels']={**inherited,**record['Config']['Labels']}
                return status,result,headers
            server.route=route
            probe=EngineProbe(server.root,server.socket); probe.image(PIN)
            async def action(trial):
                await trial.seal_all(); self.assertTrue(await trial.confirm_sealed(trial.cid))
            asyncio.run(probe.owned(action))
            manifest=dict(config=dict(sourceDir=str(server.root/'source'),ledgerPath=str(server.root/'ledger/ledger.json')),preparation=dict(cohort='modes-'+'f'*24,image=PIN))
            gateway=GatewaySession(manifest,server.root/'dummy',server.socket)
            policy=asyncio.run(gateway.acquire())
            backend=DockerCapability(replace(policy,registry_path=str(server.root/'trial.ownership.jsonl')))
            asyncio.run(backend.start()); asyncio.run(backend.seal_all())
            trial=server.containers[backend.cid]
            expected=trial['Config']['Labels'].copy()
            self.assertEqual(expected['io.youcoded.cohort'],inherited['io.youcoded.cohort'])
            self.assertEqual(expected['io.youcoded.session'],policy.session)
            self.assertEqual(expected['io.youcoded.role'],'trial')
            for key,value in [('io.youcoded.nonce','foreign'),('io.youcoded.role','gateway'),('io.youcoded.lock','altered'),('unknown-extra','not-trusted')]:
                trial['Config']['Labels']={**expected,key:value}
                with self.assertRaisesRegex(ValueError,'foreign'): asyncio.run(backend.inspect())
            trial['Config']['Labels']=expected
            image=trial['Image']; trial['Image']='sha256:'+'f'*64
            with self.assertRaisesRegex(ValueError,'foreign'): asyncio.run(backend.stop())
            trial['Image']=image; asyncio.run(backend.stop())
            gate=server.containers[gateway.gateway]; labels=gate['Config']['Labels'].copy()
            gate['Config']['Labels']={**labels,'unknown-extra':'foreign'}
            self.assertTrue(asyncio.run(gateway.close()))
            gate['Config']['Labels']=labels
            self.assertEqual(asyncio.run(gateway.close()),[])
            self.assertFalse(server.containers); self.assertFalse(server.networks)
    def test_create_then_lost_response_timeout_and_invalid_id_survive_restart(self):
        # The daemon fixture really records creation BEFORE dropping/stalling its
        # HTTP response. Test waits use socket state/events, never fixed sleeps.
        for failure in ('closed','truncated','timeout','invalid'):
            with self.subTest(failure=failure), FakeEngine() as server:
                journal=server.root/'qualification-owned-intent.jsonl'
                original=server.route; observed=[]
                def route(method,target,raw):
                    if method=='POST' and target.endswith('/networks/create'):
                        pending=registry.active(journal)
                        self.assertEqual(len(pending),1)
                        intent=next(iter(pending.values())); self.assertEqual(intent['action'],'intent')
                        self.assertEqual(intent['kind'],'network'); self.assertEqual(intent['name'],'owned-private')
                        self.assertEqual(intent['labels']['io.youcoded.nonce'],'d'*32)
                        observed.append(intent)
                        response=original(method,target,raw)
                        if failure=='closed': raise ConnectionAbortedError('created, response lost')
                        if failure=='timeout': raise TimeoutError('created, transport deadline')
                        if failure=='truncated': return response
                        return 201,{'Id':'not-an-exact-id'},{}
                    return original(method,target,raw)
                # Use an owned asyncio Unix server for the failure framing; the
                # backing FakeEngine supplies actual create semantics/state.
                async def run():
                    socket=str(server.root/'loss.sock'); release=asyncio.Event(); tasks=set()
                    async def handle(reader,writer):
                        task=asyncio.current_task(); tasks.add(task)
                        try:
                            method,target,_=(await reader.readline()).decode().strip().split(' '); headers={}
                            while (line:=await reader.readline())!=b'\r\n':
                                k,v=line.decode().split(':',1); headers[k.lower()]=v.strip()
                            raw=await reader.readexactly(int(headers['content-length']))
                            try: status,result,extra=route(method,target,raw)
                            except TimeoutError:
                                await reader.read(); return
                            except ConnectionAbortedError: return
                            body=json.dumps(result).encode(); length=len(body)
                            if failure=='truncated': body=body[:5]
                            writer.write(f'HTTP/1.1 {status} OK\r\nContent-Length: {length}\r\n\r\n'.encode()+body); await writer.drain()
                        finally:
                            writer.close(); await writer.wait_closed(); tasks.remove(task); release.set()
                    listener=await asyncio.start_unix_server(handle,socket)
                    try:
                        with self.assertRaises((asyncio.IncompleteReadError,TimeoutError,ValueError)):
                            await registry.create(Engine(socket,timeout=.1),journal,'network',dict(Name='owned-private',Labels={'io.youcoded.session':'scope','io.youcoded.nonce':'d'*32}))
                        await asyncio.wait_for(release.wait(),2)
                    finally:
                        listener.close(); await listener.wait_closed()
                        for task in list(tasks): task.cancel()
                        if tasks: await asyncio.gather(*tasks,return_exceptions=True)
                asyncio.run(run())
                self.assertEqual(len(observed),1); self.assertEqual(len(server.networks),1)
                # Reload simulates a fresh controller, without preserving an
                # in-memory registry or a caller's exception object.
                restarted=importlib.reload(registry)
                with self.assertRaisesRegex(ValueError,'unresolved'): restarted.ensure_clean(server.root)
                pending=restarted.active(journal); self.assertEqual(len(pending),1)
                self.assertEqual(next(iter(pending))[0],'intent')
                self.assertFalse(any(method=='DELETE' for method,_ in server.calls))
    def test_every_gateway_qualification_and_trial_create_writes_intent_before_transport(self):
        from lab_engine_gateway import GatewaySession
        from lab_engine_qualification import EngineProbe
        from lab_engine import DockerCapability
        from dataclasses import replace
        for owner,target_kind in (('gateway','network'),('gateway','container'),('qualification','network'),('qualification','container'),('trial','container')):
            with self.subTest(owner=owner,kind=target_kind),FakeEngine() as server:
                manifest=dict(config=dict(sourceDir=str(server.root/'source'),ledgerPath=str(server.root/'ledger/ledger.json')),preparation=dict(cohort='modes-'+'f'*24,image=PIN))
                gateway=GatewaySession(manifest,server.root/'dummy',server.socket)
                policy=asyncio.run(gateway.acquire()) if owner=='trial' else None
                original=Engine.request; attempts=[]
                async def request(engine,method,path,payload=None,**kwargs):
                    kind='network' if path=='/networks/create' else 'container' if path.startswith('/containers/create') else None
                    if kind:
                        journals=list(server.root.glob('*.jsonl'))
                        pending=[(p,item) for p in journals for (k,_),item in registry.active(p).items() if k=='intent']
                        self.assertEqual(len(pending),1,'intent must be fsynced before each create request')
                        journal,intent=pending[0]; self.assertEqual(intent['kind'],kind)
                        self.assertTrue(intent['name']); self.assertTrue(intent['labels']['io.youcoded.nonce'])
                        response=await original(engine,method,path,payload,**kwargs)
                        if kind==target_kind:
                            attempts.append((journal,intent,response['Id']))
                            # Engine committed creation, but caller receives no
                            # usable exact identity. No discovery can resolve it.
                            return {'Id':'invalid-lost-response'}
                        return response
                    return await original(engine,method,path,payload,**kwargs)
                async def unused(cap): raise AssertionError('must fail before trial action')
                with patch.object(Engine,'request',request):
                    if owner=='gateway':
                        with self.assertRaisesRegex(ValueError,'uncertain'): asyncio.run(gateway.acquire())
                        errors=asyncio.run(gateway.close()); self.assertTrue(any('intent' in e for e in errors))
                    elif owner=='qualification':
                        probe=EngineProbe(server.root,server.socket); probe.image_id=IMAGE
                        with self.assertRaisesRegex(ValueError,'intent'): asyncio.run(probe.owned(unused))
                    else:
                        backend=DockerCapability(replace(policy,registry_path=str(server.root/'trial.ownership.jsonl')))
                        with self.assertRaisesRegex(ValueError,'uncertain'): asyncio.run(backend.start())
                        asyncio.run(backend.stop())  # No returned ID => no guessed DELETE.
                        errors=asyncio.run(gateway.close())
                self.assertEqual(len(attempts),1)
                journal,intent,unknown=attempts[0]
                self.assertIn(('intent',intent['operation']),registry.active(journal))
                with self.assertRaisesRegex(ValueError,'unresolved'): registry.ensure_clean(server.root)
                self.assertFalse(any(method=='DELETE' and unknown in path for method,path in server.calls))
    def test_primary_operation_failure_survives_identity_and_network_cleanup_failures(self):
        from lab_engine_qualification import EngineProbe
        with FakeEngine() as server:
            probe=EngineProbe(server.root,server.socket); probe.image_id=IMAGE
            original=server.route
            def route(method,target,raw):
                response=original(method,target,raw)
                if method=='POST' and target.endswith('/start'):
                    for container in server.containers.values(): container['Config']['Labels']={'foreign':'actual-inspected-labels'}
                    return 500,{'error':'injected primary start failure'},{}
                return response
            server.route=route
            async def unused(cap): self.fail('must not reach action')
            with self.assertRaises(ValueError) as raised: asyncio.run(probe.owned(unused))
            self.assertIn('primary operation failed',str(raised.exception))
            self.assertIn('500',str(raised.exception))
            self.assertIn('foreign gateway cleanup refused',str(raised.exception))
            journal=next(server.root.glob('qualification-owned-*.jsonl'))
            records=[json.loads(line) for line in journal.read_text().splitlines()]
            primary=next(r for r in records if r['action']=='operation-error')
            self.assertIn('500',primary['error'])
            failure=next(r for r in records if r['action']=='cleanup-error' and r['kind']=='container')
            self.assertEqual(failure['observed']['labels'],{'foreign':'actual-inspected-labels'})
            self.assertEqual(failure['observed']['image'],IMAGE)
            self.assertTrue(registry.active(journal))
    def test_registration_write_failure_preserves_unresolved_intent(self):
        with FakeEngine() as server:
            journal=server.root/'qualification-owned-write-failure.jsonl'; original=registry.event
            def fail_registration(path,**record):
                if record['action']=='acquired': raise OSError('injected fsync/registration failure')
                return original(path,**record)
            with patch.object(registry,'event',fail_registration):
                with self.assertRaisesRegex(OSError,'registration'):
                    asyncio.run(registry.create(Engine(server.socket),journal,'network',dict(Name='owned-private',Labels={'io.youcoded.session':'scope','io.youcoded.nonce':'d'*32})))
            self.assertEqual(len(server.networks),1)
            self.assertEqual(next(iter(registry.active(journal)))[0],'intent')
            with self.assertRaisesRegex(ValueError,'unresolved'): registry.ensure_clean(server.root)
    def test_returned_id_and_intent_resolution_are_one_durable_record(self):
        with FakeEngine() as server:
            journal=server.root/'qualification-owned-success.jsonl'
            response=asyncio.run(registry.create(Engine(server.socket),journal,'network',dict(Name='owned-private',Labels={'io.youcoded.session':'scope','io.youcoded.nonce':'d'*32})))
            records=[json.loads(line) for line in journal.read_text().splitlines()]
            self.assertEqual([r['action'] for r in records],['intent','acquired'])
            self.assertEqual(records[0]['id'],records[1]['operation'])
            self.assertEqual(set(registry.active(journal)),{('network',response['Id'])})


if __name__=='__main__': unittest.main()
