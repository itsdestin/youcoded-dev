"""Acquisition for NEW host-verified serial matrices only; historical paths stay frozen.

Never called until current whole-matrix admission has passed. The provider key
is mounted only into the gateway. The trial receives opaque tokens via existing
host-agent adapters, and never receives a socket, key mount or outbound endpoint.
"""
import asyncio
import hashlib
from dataclasses import asdict, replace
import json
import os
from pathlib import Path
import secrets

from bounded_inputs import need
from lab_engine import Engine, Policy, ID, gateway_signature, PRIVATE_OPTIONS, expected_labels
from lab_engine_registry import event, active, create


class GatewaySession:
    def __init__(self,manifest,key,socket,*,qualification=False):
        self.manifest=manifest; self.key=Path(key); self.engine=Engine(socket); self.qualification=qualification
        self.nonce=secrets.token_hex(16); self.networks=[]; self.gateway=None; self.policy=None
        self.session=manifest['preparation']['cohort']; self.root=Path(manifest['config']['sourceDir']).parent
        self.labels={'io.youcoded.session':self.session,'io.youcoded.nonce':self.nonce}
        self.registry_path=str(self.root/('gateway-ownership-'+self.nonce+'.jsonl'))

    def record_inspection(self,phase,record):
        # Fixed security/identity allowlist only. Never persist Env, arbitrary
        # argv/command text, key contents or general inspect payloads.
        config=record.get('Config',{}); host=record.get('HostConfig',{})
        safe=dict(Id=record.get('Id'),Image=record.get('Image'),Name=record.get('Name'),
            Config={k:config.get(k) for k in ('Labels','User','WorkingDir','Volumes','NetworkDisabled','Hostname','Domainname')},
            HostConfig={k:host.get(k) for k in ('NetworkMode','ReadonlyRootfs','CapDrop','CapAdd','SecurityOpt','Privileged','Binds','VolumesFrom','Devices','DeviceRequests','PortBindings','PublishAllPorts','Links','ExtraHosts','PidMode','IpcMode','UsernsMode','CgroupnsMode','Runtime','Memory','PidsLimit','NanoCpus','LogConfig')},
            Mounts=[{k:m.get(k) for k in ('Type','Source','Destination','RW','Mode','Propagation')} for m in record.get('Mounts',[])])
        event(self.registry_path,action='inspection',kind='container',id=self.gateway,phase=phase,
              signature=gateway_signature(record),observed=safe,
              fieldHashes={section:{k:hashlib.sha256(json.dumps(v,sort_keys=True).encode()).hexdigest() for k,v in (record.get(section) or {}).items() if k!='Env'} for section in ('Config','HostConfig')})

    async def acquire(self):
        await self.engine.preflight()
        pin=self.manifest['preparation']['image']
        try:
            record=await self.engine.request('GET','/images/'+pin+'/json')
        except ValueError as error:
            # WHY: qualification of a new local build uses its exact config ID,
            # not a fabricated registry manifest digest or a mutable tag lookup.
            if str(error) != "Engine status refused: ['HTTP/1.1', '404']": raise
            record=await self.engine.request('GET','/images/'+pin.rsplit('@',1)[-1]+'/json')
        need(pin in record.get('RepoDigests',[]) or record.get('Id')==pin.rsplit('@',1)[-1],'gateway image pin mismatch')
        image=record['Id']; self.image=image; need(record.get('Os')=='linux' and record.get('Architecture')=='amd64' and not record.get('Config',{}).get('Volumes'),'gateway image policy mismatch')
        self.image_labels=expected_labels(record.get('Config',{}).get('Labels'),{})
        self.gateway_labels=expected_labels(self.image_labels,{**self.labels,'io.youcoded.role':'gateway'})
        for suffix,internal in (('private',True),('outbound',False)):
            name='yc-'+self.session+'-'+self.nonce[:8]+'-'+suffix
            created=await create(self.engine,self.registry_path,'network',dict(Name=name,Driver='bridge',Internal=internal,EnableIPv6=False,Options=PRIVATE_OPTIONS if internal else {},Labels=self.labels,CheckDuplicate=True))
            self.networks.append((created['Id'],name,internal))
            need(not created.get('Warning'),'network creation warning refused')
        private,external=self.networks
        modules=('openrouter-gateway.mjs','gateway-activity.mjs','openrouter-policy.mjs','budget-ledger.mjs','upstream-diagnostic.mjs')
        # Do not bind the entire controller source: it also contains host oracle
        # code. Only the gateway's explicit, pinned dependency closure is visible.
        if self.qualification: modules += ('qualification-gateway.mjs',)
        mounts=[dict(Type='bind',Source=str(self.root/'source'/name),Target='/source/'+name,ReadOnly=True) for name in modules]
        mounts += [dict(Type='bind',Source=str(source),Target=target,ReadOnly=readonly) for source,target,readonly in (
            (self.root/'gateway-config.json','/config.json',True),
            (self.key,'/provider-key',True),(Path(self.manifest['config']['ledgerPath']).parent,'/ledger',False))]
        created=await create(self.engine,self.registry_path,'container',dict(Image=image,Labels=self.gateway_labels,
            User=str(os.getuid())+':'+str(os.getgid()),Entrypoint=['node'],Cmd=['/source/'+('qualification-gateway.mjs' if self.qualification else 'openrouter-gateway.mjs'),'--config','/config.json','--key-file','/provider-key'],
            HostConfig=dict(NetworkMode=external[1],ReadonlyRootfs=True,CapDrop=['ALL'],SecurityOpt=['no-new-privileges'],Mounts=mounts,
                            LogConfig={'Type':'none','Config':{}},Memory=536870912,MemorySwap=536870912,Runtime='runc',PidsLimit=64,NanoCpus=1000000000)))
        self.gateway=created['Id']
        need(not created.get('Warnings'),'gateway creation warning refused')
        await self.engine.request('POST','/networks/'+private[0]+'/connect',dict(Container=self.gateway,EndpointConfig={'Aliases':['yc-router-gateway']}))
        record=await self.engine.request('GET','/containers/'+self.gateway+'/json')
        need(record.get('Id')==self.gateway and record.get('Image')==image and record.get('Config',{}).get('Labels')==self.gateway_labels,'gateway registry identity mismatch')
        observed={(m.get('Source'),m.get('Destination'),not m.get('RW',True)) for m in record.get('Mounts',[])}
        need(observed=={(m['Source'],m['Target'],m['ReadOnly']) for m in mounts},'gateway mount policy mismatch')
        host=record.get('HostConfig',{})
        need(host.get('ReadonlyRootfs') is True and host.get('CapDrop')==['ALL'] and host.get('SecurityOpt')==['no-new-privileges'] and
             not any(host.get(k) for k in ('Privileged','Binds','VolumesFrom','Devices','DeviceRequests','PortBindings','PublishAllPorts','Links')),'gateway host policy mismatch')
        need(host.get('OomKillDisable') is None or host.get('OomKillDisable') is False,'gateway OOM killing must remain enabled')
        need(host.get('Memory')==536870912 and host.get('MemorySwap')==536870912 and host.get('Runtime')=='runc','gateway explicit resource/runtime policy mismatch')
        self.record_inspection('prestart',record)
        self.policy=Policy(self.engine.socket,self.session,self.nonce,image,private[1],private[0],self.gateway,image,gateway_signature(record),external[0],image_labels=self.image_labels,gateway_image_labels=self.image_labels)
        from lab_engine import DockerCapability
        await self.engine.request('POST','/containers/'+self.gateway+'/start')
        poststart=await self.engine.request('GET','/containers/'+self.gateway+'/json')
        self.record_inspection('poststart',poststart)
        posthost=poststart.get('HostConfig',{})
        need(posthost.get('OomKillDisable') is None or posthost.get('OomKillDisable') is False,'gateway OOM killing must remain enabled after start')
        need(posthost.get('Memory')==536870912 and posthost.get('MemorySwap')==536870912 and posthost.get('Runtime')=='runc','gateway explicit resource/runtime policy mismatch after start')
        await DockerCapability(self.policy,self.engine).network(False)
        # The existing gateway returns 404 for an unregistered health GET. Probe
        # inside the gateway's own loopback, without a published host port or key.
        probe=await self.engine.request('POST','/containers/'+self.gateway+'/exec',dict(AttachStdout=False,AttachStderr=False,
            Cmd=['node','-e',"(async()=>{for(let i=0;i<20;i++){try{if((await fetch('http://127.0.0.1:18766/health',{signal:AbortSignal.timeout(500)})).status===404)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,100))}process.exit(1)})()"]))
        eid=probe['Id']; need(ID.fullmatch(eid),'gateway probe identity')
        await self.engine.request('POST','/exec/'+eid+'/start',{'Detach':True,'Tty':False})
        # Bounded polling is runtime readiness, not a sleep standing in for a test
        # signal. A readiness failure is a refusal; never start any client anyway.
        for _ in range(150):
            observed=await self.engine.request('GET','/exec/'+eid+'/json')
            if observed.get('Running') is False:
                need(observed.get('ExitCode')==0,'gateway readiness failed'); break
            await asyncio.sleep(.1)
        else: raise ValueError('gateway readiness deadline')
        return self.policy

    def write_policies(self):
        import run_objective_comparison as serial
        jobs={}
        for row in self.manifest['trials']:
            host=self.manifest['config'].get('hostVerification',{})
            need(row['taskId'] in host.get('taskIds',[]),'mixed legacy/in-container verifier matrix cannot use private Engine transport')
            job=serial.job_id(row)
            jobs[job]=dict(engine=asdict(replace(self.policy,registry_path=str(self.root/(job+'.ownership.jsonl')))),environmentDir=str(Path(row['taskPath'])/'environment'),
                           jobDir=str(Path(self.manifest['config']['jobsDir'])/job))
        file=self.root/('controller-policy-'+self.nonce+'.json')
        fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as stream: json.dump(dict(jobs=jobs),stream,sort_keys=True)
        return str(file)

    async def close(self):
        # Unknown create outcomes have no safe DELETE target. Preserve them as
        # errors while still attempting cleanup of every known owned resource.
        errors=['Unresolved acquisition intent '+cid for (kind,cid) in active(self.registry_path) if kind=='intent']
        resources=([('container',self.gateway,None,None)] if self.gateway else [])+[
            ('network',cid,name,internal) for cid,name,internal in reversed(self.networks)]
        remaining=active(self.registry_path)
        for kind,cid,name,internal in resources:
            if (kind,cid) not in remaining: continue
            try:
                endpoint='/containers/'+cid if kind=='container' else '/networks/'+cid
                record=await self.engine.request('GET',endpoint+('/json' if kind=='container' else ''))
                if kind=='container':
                    if self.policy and gateway_signature(record)!=self.policy.gateway_spec:
                        self.record_inspection('cleanup',record)
                    need(record.get('Id')==cid and record.get('Image')==self.image and record.get('Config',{}).get('Labels')==self.gateway_labels,'foreign gateway cleanup refused')
                    if self.policy: need(gateway_signature(record)==self.policy.gateway_spec,'gateway registry changed before cleanup')
                else:
                    need(record.get('Id')==cid and record.get('Name')==name and record.get('Internal') is internal and record.get('Labels')==self.labels and not record.get('Containers'),'foreign/nonempty network cleanup refused')
                await self.engine.request('DELETE',endpoint+('?force=1&v=0' if kind=='container' else ''))
                event(self.registry_path,action='deleted',kind=kind,id=cid)
                if kind=='container': self.gateway=None
            except Exception as error:
                message=kind+' '+cid+': '+str(error)[:300]; errors.append(message)
                event(self.registry_path,action='cleanup-error',kind=kind,id=cid,error=message)
        # Every remaining safe cleanup is attempted even after one DELETE fails.
        return errors


def run_matrix(manifest,key,socket,backend,destination):
    from evaluation_qualification import admit_execution
    admit_execution(manifest)  # Universal authority gate BEFORE key or Engine use.
    from lab_authority import claim_launch
    from lab_engine_registry import ensure_clean
    ensure_clean(Path(manifest['config']['sourceDir']).parent)
    claim_launch(manifest)
    need(socket==os.environ.get('YC_HARBOR_ENGINE_SOCKET'),'qualification Engine socket scope mismatch')
    need('parallel' not in manifest,'private Engine transport is serial, no shared peer trials')
    session=GatewaySession(manifest,key,socket)
    try:
        asyncio.run(session.acquire())
        policy=session.write_policies()
        import run_objective_comparison as serial
        import sys
        env=serial.child_env(manifest['config']); env['YC_HARBOR_CONTROLLER_POLICY']=policy
        env['YC_HARBOR_ENGINE_SOCKET']=socket  # Repeated CURRENT host preflight, never agent exec env.
        return backend.runner([sys.executable,'-B',str(session.root/'source/run_objective_comparison.py'),'--manifest',str(destination),'--execute'],env)
    finally:
        errors=asyncio.run(session.close())
        event(session.root/'cleanup.jsonl',action='cleanup-complete',kind='session',id=session.nonce,
              cleanupErrors=errors,unresolved=list(active(session.registry_path).values()))
        need(not errors,'Scoped Engine cleanup failed; inspect cleanup.jsonl and ownership journal')
