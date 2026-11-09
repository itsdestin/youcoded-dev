"""Finite current no-provider Harbor/Engine lifecycle qualification.

Two Trials per selected task: controller reference fixture and unchanged submission
carrying forged rewards. Only the host verifier can produce their VerifierResults.
The gateway uses repository stub transports, not a provider or paid canary.
"""
import asyncio
from dataclasses import replace
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shlex

from harbor.agents.base import BaseAgent
from harbor.models.trial.config import TrialConfig
from harbor.trial.trial import Trial
from bounded_inputs import copy,need
import comparison_tasks as tasks
from external_verification import VERSION
from lab_engine_gateway import GatewaySession
from lab_harbor_export import plugin_config

HERE=Path(__file__).resolve().parent


class QualificationAgent(BaseAgent):
    """Trusted scripted fixture agent only; never selectable by paid modes."""
    def __init__(self,*args,candidate_dir,token,outbound_ip,**kwargs):
        self.candidate=Path(candidate_dir); self.token=token; self.outbound_ip=outbound_ip
        super().__init__(*args,**kwargs)
    @staticmethod
    def name(): return 'controller-qualification-fixture'
    def version(self): return 'external-v2'
    async def setup(self,environment): pass
    async def run(self,instruction,environment,context):
        await environment.upload_dir(self.candidate,'/app')
        # Exercise an in-container filesystem writer as well as the Engine upload
        # writer. Identical bytes must survive the later positive pause/snapshot.
        written=await environment.exec("node -e \"const fs=require('fs');for(const n of fs.readdirSync('/app')){const p='/app/'+n;if(fs.statSync(p).isFile())fs.writeFileSync(p,fs.readFileSync(p))}\"",timeout_sec=10)
        need(written.return_code==0,'in-container source writer probe failed')
        # Metadata checks alone do not prove routing. The positive owned-alias
        # request traverses the REAL gateway with a scoped opaque token and its
        # fixed stub upstream; the owned outbound-interface control must fail.
        script=r'''(async()=>{const token=TOKEN,base="http://yc-router-gateway:18766";const body=JSON.stringify({model:"anthropic/claude-haiku-5.5",messages:[{role:"user",content:"qualification-only"}],max_tokens:4});const send=t=>fetch(base+"/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+t},body,signal:AbortSignal.timeout(2000)});if((await fetch(base+"/health",{signal:AbortSignal.timeout(2000)})).status!==404)throw Error("gateway health");const good=await send(token);if(good.status!==200||(await good.json()).choices[0].message.content!=="qualification-only")throw Error("stub route");if((await send("unregistered-qualification-token")).status!==401)throw Error("opaque grant");let outside=false;try{await fetch("http://"+OUTSIDE+":18766/health",{signal:AbortSignal.timeout(500)});outside=true}catch{}if(outside)throw Error("outside connection");console.log("owned-gateway-only")})().catch(e=>{console.error(e.message);process.exit(1)})'''.replace('TOKEN',json.dumps(self.token)).replace('OUTSIDE',json.dumps(self.outbound_ip))
        result=await environment.exec('node -e '+shlex.quote(script),timeout_sec=10)
        need(result.return_code==0 and (result.stdout or '').strip()=='owned-gateway-only','actual private gateway route probe failed: '+str(result.stderr)[:300])
        result=await environment.exec('test ! -S /var/run/docker.sock && test ! -e /tests/host-contract.json && mkdir -p /logs/verifier && printf 1 > /logs/verifier/reward.txt',timeout_sec=10)
        need(result.return_code==0,'oracle/socket isolation probe failed')


def write_json(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream: json.dump(data,stream,sort_keys=True)


async def run_lifecycle(probe):
    import run_objective_comparison as parent
    import targeted_report
    from lab_engine_qualification import write_controller_policy
    from lab_engine_registry import active,cleanup_policy
    manifest=json.loads((probe.root/'prepared-manifest.json').read_bytes())
    plan=json.loads((probe.root/'plan.json').read_bytes())
    selected=plan['tasks']
    need(selected,'no lifecycle task selected')
    token='qualification-'+secrets.token_hex(20)
    # Retain controller-owned invocation/cleanup evidence outside frozen source.
    root=probe.root/('qualification-lifecycle-'+secrets.token_hex(12)); root.mkdir(mode=0o700)
    (root/'source').mkdir(); (root/'ledger').mkdir(mode=0o700)
    for name in ('openrouter-gateway.mjs','gateway-activity.mjs','openrouter-policy.mjs','budget-ledger.mjs','upstream-diagnostic.mjs','qualification-gateway.mjs'):
        (root/'source'/name).write_bytes((HERE/name).read_bytes())
    key=root/'dummy-key'; key.write_text('qualification-dummy-not-a-provider-key'); key.chmod(0o600)
    policy=dict(model='anthropic/claude-haiku-5.5',provider='Anthropic',maxContextTokens=1024,maxOutputTokens=4,maxPromptUsdPerMillion=1,maxCacheWriteUsdPerMillion=1,maxCompletionUsdPerMillion=5,reservationUsd=.01)
    write_json(root/'gateway-config.json',dict(host='0.0.0.0',port=18766,allowNetworkBind=True,ledgerPath='/ledger/ledger.json',limitUsd=1,priorUpperUsd=0,tokens={token:dict(trialId='qualification-only',maxRequests=2*len(selected),policy=policy,budgetScope=dict(id='qualification-only',limitUsd=1))}))
    gateway_manifest=dict(config=dict(sourceDir=str(root/'source'),ledgerPath=str(root/'ledger/ledger.json')),preparation=dict(cohort='qualify-'+secrets.token_hex(12),image=plan['image']))
    gateway=GatewaySession(gateway_manifest,key,probe.engine.socket,qualification=True)
    results=[]; policies=[]; failure=None
    try:
        capability=await gateway.acquire()
        inspected=await probe.engine.request('GET','/containers/'+capability.gateway_id+'/json')
        outside=next(v['IPAddress'] for v in inspected['NetworkSettings']['Networks'].values() if v['NetworkID']==capability.gateway_outbound)
        need(ipaddress.ip_address(outside).version==4,'owned outbound IPv4 probe unavailable')
        # WHY: lifecycle coverage must retain every selected task, including
        # legacy-only basic runs, rather than qualifying one external-v2 cell.
        for selected_task,label,expected in ((t,label,expected) for t in selected for label,expected in (('reference',1),('forged-reward',0))):
            task_id=selected_task['id']; row=next(r for r in manifest['trials'] if r['taskId']==task_id)
            case=root/(task_id+'-'+label); case.mkdir()
            task=case/task_id
            copy(probe.root/'tasks'/task_id,task,preserve_modes=True)
            # Trusted lifecycle fixture copies must retain baseline permission
            # identity just like the production upload's validated TAR records.
            candidate=case/'candidate'; copy(task/'environment/fixtures',candidate,preserve_modes=True)
            if expected:
                if selected_task.get('legacy'):
                    from legacy_verification import definitions
                    for name,text in definitions()[task_id]['oracle'].items():
                        path=candidate/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(text)
                else: tasks.reference(candidate,task_id)
            config=TrialConfig.model_validate(dict(trial_name=label,trials_dir=str(case/'jobs'),task={'path':str(task)},
                agent=dict(import_path='lab_harbor_qualification:QualificationAgent',kwargs=dict(candidate_dir=str(candidate),token=token,outbound_ip=outside)),
                environment=plugin_config()['environment'],verifier=plugin_config()['verifier']))
            trial=await Trial.create(config)
            need(not trial.agent_environment._mounts,'oracle/log eager mounts exposed')
            registry=str(case/'ownership.jsonl')
            bound=replace(capability,registry_path=registry); policies.append(bound)
            file=case/'controller-policy.json'
            write_controller_policy(file,bound,task/'environment',session_id=trial.agent_environment.session_id)
            previous=os.environ.get('YC_HARBOR_CONTROLLER_POLICY'); os.environ['YC_HARBOR_CONTROLLER_POLICY']=str(file)
            try: result=await asyncio.wait_for(trial.run(),180)
            finally:
                if previous is None: os.environ.pop('YC_HARBOR_CONTROLLER_POLICY',None)
                else: os.environ['YC_HARBOR_CONTROLLER_POLICY']=previous
            need(result.exception_info is None,'actual Harbor lifecycle exception: '+str(result.exception_info))
            acceptance_path=trial.paths.verifier_dir/'host-acceptance.json'
            acceptance=json.loads(acceptance_path.read_bytes()) if acceptance_path.is_file() else {}
            need(result.verifier_result.rewards=={'reward':expected},
                 'Harbor control reward mismatch: '+task_id+'/'+label+' expected='+str(expected)+
                 ' actual='+str(result.verifier_result.rewards)+' acceptance='+str(acceptance_path)+
                 ' reason='+str(acceptance.get('reason','unavailable'))+
                 ' protectedDifferences='+str(acceptance.get('protectedDifferences',[])))
            rewards,exception,infra=parent.outcome(case/'jobs')
            need(rewards=={'reward':expected} and not infra,'parent reward reconciliation failed')
            event=dict(event='outcome',trialKey=row['trialKey'],jobId=row['id'],rewards=rewards,exception=exception,infrastructureError=False)
            with (case/'events.jsonl').open('x') as stream: parent.append_event(stream,event)
            summary=targeted_report.summarize_targeted(manifest,[event],[],mode_plan=plan)
            outcome=next(r['outcome'] for r in summary['trials'] if r['id']==row['id'])
            need(outcome==('passed' if expected else 'verification-failed'),'report trusted outcome mismatch')
            need(not active(registry),'owned trial cleanup unresolved')
            backend=trial.agent_environment._backend
            need(backend.cid is None and trial.agent_environment._sealed,'trial not sealed/deleted')
            results.append(dict(task=task_id,control=label,reward=expected,reportedOutcome=outcome,ownershipJournal=registry))
    except BaseException as error:
        failure=error
        write_json(root/'primary-error.json',dict(errorType=type(error).__name__,error=str(error)[:2000]))
    finally:
        # A cancelled Harbor task may not finish its own stop. Recover exact
        # recorded trial IDs before tearing down their gateway/network parents.
        errors=[]
        for bound in policies: errors.extend(await cleanup_policy(bound))
        errors.extend(await gateway.close())
        unresolved=[item for bound in policies for item in active(bound.registry_path).values()]
        unresolved.extend(active(gateway.registry_path).values())
        write_json(root/'cleanup-result.json',dict(cleanupErrors=errors,unresolved=unresolved,
                   primaryError=dict(errorType=type(failure).__name__,error=str(failure)[:2000]) if failure is not None else None))
    if errors:
        detail=('primary operation failed: '+type(failure).__name__+': '+str(failure)+'; ') if failure is not None else ''
        raise ValueError(detail+'qualification gateway cleanup unresolved: '+str(errors)) from failure
    if failure is not None: raise failure
    return dict(qualified=True,runtimeQualified=True,contractVersion=VERSION,controls=results,providerCalls=0,
                realGatewayStubTransport=True,positiveSeal=True,boundedArchive=True,cleanup=True,evidenceDir=str(root),
                scope='current no-provider Engine/Harbor/bwrap acceptance and adapter setup; not paid model performance')
