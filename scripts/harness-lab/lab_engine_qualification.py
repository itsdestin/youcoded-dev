"""Current no-provider Engine probes, called ONLY by an authorized controller.

No discovery, pulls, provider keys, outbound connections or receipts-as-authority.
Each invocation owns fresh internal network/gateway/trial IDs. The gateway is an
inert peer for transport checks, not proof of a live provider route.
"""
import asyncio
from dataclasses import asdict, replace
import json
from pathlib import Path
import secrets

from bounded_inputs import need
from lab_engine import Engine, Policy, DockerCapability, PRIVATE_OPTIONS, expected_labels
from evaluation_qualification import LocalProbe


class EngineProbe(LocalProbe):
    def __init__(self,root,socket):
        super().__init__(root)
        self.engine=Engine(socket)

    def image(self,pin):
        async def probe():
            await self.engine.preflight()
            # The plan pin is immutable; never resolve a mutable tag or pull.
            need('@sha256:' in pin,'immutable image required')
            try:
                record=await self.engine.request('GET','/images/'+pin+'/json')
            except ValueError as error:
                # WHY: local builds have a config ID, not a registry manifest
                # digest. Only a missing repository pin may try the exact ID;
                # never resolve the mutable repository/tag or mask engine errors.
                if str(error) != "Engine status refused: ['HTTP/1.1', '404']": raise
                record=await self.engine.request('GET','/images/'+pin.rsplit('@',1)[1]+'/json')
            need(pin in record.get('RepoDigests',[]) or record.get('Id')==pin.rsplit('@',1)[1],'image pin mismatch')
            need(record.get('Architecture')=='amd64' and record.get('Os')=='linux' and not record.get('Config',{}).get('Volumes'),'image architecture/volumes mismatch')
            self.image_labels=expected_labels(record.get('Config',{}).get('Labels'),{})
            self.image_id=record['Id']
            self.runtime=dict(Id=self.image_id,RepoDigests=record.get('RepoDigests',[]),identityKind='registry-digest' if pin in record.get('RepoDigests',[]) else 'explicit-local-content-id',qualified=True,architecture='amd64',engine=await self.engine.preflight())
            return self.runtime
        return asyncio.run(probe())

    async def owned(self,action):
        need(self.image_id,'runtime image unavailable')
        nonce=secrets.token_hex(16); session='qualify-'+nonce; network='yc-'+session
        labels={'io.youcoded.session':session,'io.youcoded.nonce':nonce}
        image_labels=getattr(self,'image_labels',{})
        gateway_labels=expected_labels(image_labels,{**labels,'io.youcoded.role':'gateway'})
        from lab_engine_registry import event, create, active
        journal=str(self.root/('qualification-owned-'+nonce+'.jsonl'))
        netid=None; gateway=None; trial=None; primary=None
        try:
            record=await create(self.engine,journal,'network',dict(Name=network,Driver='bridge',Internal=True,EnableIPv6=False,Options=PRIVATE_OPTIONS,Labels=labels,CheckDuplicate=True))
            netid=record['Id']
            need(not record.get('Warning'),'network creation warning')
            result=await create(self.engine,journal,'container',dict(Image=self.image_id,Labels=gateway_labels,
                Entrypoint=[],Cmd=['sleep','infinity'],HostConfig=dict(NetworkMode=network,CapDrop=['ALL'],SecurityOpt=['no-new-privileges']),
                NetworkingConfig={'EndpointsConfig':{network:{'Aliases':['yc-router-gateway']}}}))
            gateway=result['Id']
            need(not result.get('Warnings'),'gateway creation warning')
            await self.engine.request('POST','/containers/'+gateway+'/start')
            policy=Policy(self.engine.socket,session,nonce,self.image_id,network,netid,gateway,self.image_id,registry_path=journal,image_labels=image_labels,gateway_image_labels=image_labels)
            trial=DockerCapability(policy,self.engine); await trial.start()
            return await action(trial)
        except BaseException as error:
            primary=error
            event(journal,action='operation-error',kind='qualification',id=nonce,
                  error=str(error)[:1000],errorType=type(error).__name__)
            raise
        finally:
            errors=['Unresolved acquisition intent '+cid for (kind,cid) in active(journal) if kind=='intent']
            if trial is not None:
                try: await trial.stop()
                except Exception as error: errors.append(str(error))
            for kind,cid in ([('container',gateway)] if gateway else [])+([('network',netid)] if netid else []):
                observed=None
                try:
                    endpoint='/containers/'+cid if kind=='container' else '/networks/'+cid
                    record=await self.engine.request('GET',endpoint+('/json' if kind=='container' else ''))
                    observed=dict(id=record.get('Id'),image=record.get('Image'),
                                  labels=record.get('Config',{}).get('Labels') if kind=='container' else record.get('Labels'),
                                  name=record.get('Name'),internal=record.get('Internal'),
                                  peers=list(record.get('Containers',{})))
                    if kind=='container': need(record.get('Id')==cid and record.get('Image')==self.image_id and record.get('Config',{}).get('Labels')==gateway_labels,'foreign gateway cleanup refused')
                    else: need(record.get('Id')==cid and record.get('Name')==network and record.get('Internal') is True and record.get('Labels')==labels and not record.get('Containers'),'foreign/nonempty network cleanup refused')
                    await self.engine.request('DELETE',endpoint+('?force=1&v=0' if kind=='container' else ''))
                    event(journal,action='deleted',kind=kind,id=cid)
                except Exception as error:
                    errors.append(str(error)); event(journal,action='cleanup-error',kind=kind,id=cid,error=str(error)[:300],observed=observed)
            if errors:
                detail=('primary operation failed: '+type(primary).__name__+': '+str(primary)+'; ') if primary is not None else ''
                raise ValueError(detail+'qualification cleanup unresolved: '+str(errors)) from primary

    def arm(self,arm,build):
        # Version/dependency observation and the actual existing adapter setup
        # share the SAME owned no-provider container; no extra per-cell runners.
        self._setup_arm=arm
        try:
            result=super().arm(arm,build)
            return dict(**result,setupQualified=True,setupScope='actual existing Harbor adapter setup; no model request')
        finally: self._setup_arm=None

    async def setup_adapter(self,trial):
        from harbor.agents.factory import AgentFactory
        from run_objective_comparison import AGENTS
        from bounded_inputs import need
        arm=self._setup_arm
        directory=self.root/('qualification-setup-'+secrets.token_hex(12)); directory.mkdir(mode=0o700)
        token=directory/'opaque-token'; token.write_text('yc-gate-'+secrets.token_urlsafe(32)); token.chmod(0o600)
        plan=json.loads((self.root/'plan.json').read_bytes())
        native=arm['adapter']=='youcoded'
        kwargs=dict(gate_url='http://yc-router-gateway:18766',gate_token_file=str(token))
        if native: kwargs.update(desktop_dir=str(self.root/'builds'/arm['id']),max_requests=plan['limits']['maxRequests'],timeout_sec=plan['limits']['timeoutSec'])
        plugin='mode_agents:ModeYouCoded' if native else 'router_agents:'+AGENTS[arm['adapter']]
        model=plan['model'] if native else 'openrouter/'+plan['model']
        agent=AgentFactory.create_agent_from_import_path(plugin,directory/'logs',model_name=model,**kwargs)
        try: await asyncio.wait_for(agent.setup(trial),60)
        except Exception as error: raise ValueError('Current adapter setup failed: '+str(error)[:300]) from error
        need(not trial.sealed,'adapter setup unexpectedly sealed writers')

    def isolated(self,script,mounts=()):
        async def action(trial):
            for source,target in mounts:
                need(target=='/build','qualification bind target refused')
                # No host bind, even readonly: transfer a descriptor-validated
                # private copy through the same bounded upload API as native setup.
                await trial.upload_dir(source,'/opt/youcoded-lab')
            result=await trial.exec(script.replace('/build','/opt/youcoded-lab'),timeout_sec=45)
            need(result.return_code==0,'runtime probe failed: '+(result.stderr or '')[:500])
            if getattr(self,'_setup_arm',None) is not None: await self.setup_adapter(trial)
            return result.stdout.strip()
        return asyncio.run(self.owned(action))

    def lifecycle(self):
        from lab_harbor_qualification import run_lifecycle
        need(self.image_id,'current image unavailable for actual Harbor lifecycle')
        return asyncio.run(run_lifecycle(self))


def write_controller_policy(path,policy,environment_dir,session_id=None,job_dir=None):
    """Trusted acquisition helper. Never called by submission or receipt loaders."""
    need(isinstance(policy,Policy),'controller capability required')
    need((session_id is not None) != (job_dir is not None),'exact session or controller-owned job scope required')
    if policy.registry_path is None: policy=replace(policy,registry_path=str(Path(path).resolve())+'.ownership.jsonl')
    data=dict(engine=asdict(policy),environmentDir=str(Path(environment_dir).resolve()))
    if session_id is not None: data['sessionId']=session_id
    else: data['jobDir']=str(Path(job_dir).resolve())
    import os
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream: json.dump(data,stream,sort_keys=True)
    return str(Path(path).resolve())
