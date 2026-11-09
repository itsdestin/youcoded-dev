"""Harbor composition wrapper: real client run/resume, same container, explicit scripted user turns.

Transport stays with the existing guarded delegates. No model calls in module import/tests.
Manual compact is supported only by native YouCoded; do not fake competitor compaction by restarting.
"""
import json
import asyncio
import os
from pathlib import Path
import shutil
import tempfile
import time
import base64
import shlex
from controller_mutation import validate_change

from harbor.agents.base import BaseAgent
from harbor.agents.capabilities import AgentCapabilities
from harbor.models.agent.context import AgentContext
from comparison_agents import GatePi, GateClaudeCode, GateOpenCode, GateHermes, GateYouCoded
from comparison_report import answer_from_trajectory
from router_agents import (RouterYouCoded, RouterPi, RouterOpenCode, RouterClaudeCode, RouterHermes,
                           validate_context_window_tokens, validate_auto_compact_tokens)

AGENTS={'youcoded':GateYouCoded,'pi':GatePi,'claude-code':GateClaudeCode,'hermes':GateHermes,'opencode':GateOpenCode,
        'router-youcoded':RouterYouCoded,'router-pi':RouterPi,'router-opencode':RouterOpenCode,
        'router-claude-code':RouterClaudeCode,'router-hermes':RouterHermes}
NATIVE_CLIENTS={'youcoded','router-youcoded'}
LABELS={'initial','followup','correction','nudge','clarification-answer'}


def write_private_json(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,temporary=tempfile.mkstemp(prefix='.scenario-',dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as stream:
            json.dump(value,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def copy_private_snapshot(source,destination):
    source=Path(source);destination=Path(destination)
    if destination.is_symlink(): raise ValueError('Snapshot destination must not be a symlink')
    destination.mkdir(parents=True,exist_ok=True,mode=0o700)
    skipped=[]
    # Never dereference symlinks supplied by the agent, including links to private host paths.
    for directory,folders,files in os.walk(source,followlinks=False):
        relative=Path(directory).relative_to(source)
        for name in list(folders):
            if (Path(directory)/name).is_symlink():
                skipped.append(str(relative/name));folders.remove(name)
            else: (destination/relative/name).mkdir(parents=True,exist_ok=True,mode=0o700)
        for name in files:
            item=Path(directory)/name
            if item.is_symlink() or not item.is_file(): skipped.append(str(relative/name));continue
            target=destination/relative/name
            if target.is_symlink(): raise ValueError('Snapshot file must not be a symlink')
            shutil.copyfile(item,target);target.chmod(0o600)
    return skipped


def validate_steps(steps, *, native=False):
    if not isinstance(steps,list) or not 1 <= len(steps) <= 100:
        raise ValueError('Scenario needs 1–100 steps')
    for index,step in enumerate(steps):
        if not isinstance(step,dict) or step.get('kind') not in ('user','compact','external-change'):
            raise ValueError('Unsupported scenario action')
        if step['kind']=='external-change':
            validate_change(step)
            is_user=lambda value:isinstance(value,dict) and value.get('kind')=='user'
            if not any(map(is_user,steps[:index])) or not any(map(is_user,steps[index+1:])):
                raise ValueError('External change must be between user turns')
        if step['kind']=='compact' and not native:
            raise ValueError('Explicit compact is not implemented for this competitor; refuse before any model call')
        if step['kind']=='user' and (not isinstance(step.get('text'),str) or not step['text'].strip()):
            raise ValueError('User step requires text')
        if step.get('label') and step['label'] not in LABELS:
            raise ValueError('Unsupported scripted-input label')


async def run_conversation(delegate, environment, steps, snapshot, *, on_step=None, external_change=None):
    validate_steps(steps)
    if any(step['kind']=='external-change' for step in steps) and not callable(external_change):
        raise ValueError('External change controller is unavailable')
    if sum(step['kind']=='user' for step in steps)>1 and not delegate.capabilities.resume:
        raise ValueError('Delegate has no native resume capability')
    rows=[]
    for index,step in enumerate(steps):
        started=time.perf_counter(); context=AgentContext(); error=None; canceled=False
        if step['kind']=='external-change':
            evidence=None
            try:
                evidence=await external_change(step)
                if not isinstance(evidence,dict) or evidence.get('applied') is not True:
                    error='ControllerChangeUnconfirmed'
            except asyncio.CancelledError:
                error='CancelledError';canceled=True
            except Exception as exc:
                error=type(exc).__name__
            rows.append({'index':index,'kind':'external-change','label':None,'controllerOwned':True,
                         'status':'interrupted' if canceled else 'failed' if error else 'completed',
                         'errorClass':error,'evidence':evidence,'finalText':None,
                         'durationMs':(time.perf_counter()-started)*1000})
            if on_step: await on_step(rows[-1])
            if canceled: raise asyncio.CancelledError()
            if error: return {'status':'failed','steps':rows,'unexecutedSteps':len(steps)-len(rows)}
            continue
        try:
            if index==0: await delegate.run(step['text'],environment,context)
            else: await delegate.resume(step['text'],environment,context)
        except asyncio.CancelledError:
            error='CancelledError'; canceled=True
        except Exception as exc:
            error=type(exc).__name__ # never persist provider exception text that may include credentials
        elapsed=time.perf_counter()-started
        # WHY snapshot even after failure: paid partial work must not disappear with the exception.
        try: evidence=await snapshot(index,step,context)
        except Exception as exc: evidence={'captureError':type(exc).__name__,'captureComplete':False}
        if not error and evidence.get('captureComplete') is not True: error='CaptureIncomplete'
        rows.append({'index':index,'kind':'user','label':step.get('label','followup'),
                     'status':'interrupted' if canceled else 'failed' if error else 'completed','durationMs':elapsed*1000,
                     'errorClass':error,**evidence})
        if on_step: await on_step(rows[-1])
        if canceled: raise asyncio.CancelledError()
        if error:
            return {'status':'failed','steps':rows,'unexecutedSteps':len(steps)-len(rows)}
    return {'status':'completed','steps':rows,'unexecutedSteps':0}


class ConversationAgent(BaseAgent):
    capabilities=AgentCapabilities()

    def __init__(self,*args,client,scenario_file,gate_url,gate_token_file,desktop_dir=None,
                 context_window_tokens=None,auto_compact_tokens=None,**kwargs):
        context_window_tokens=validate_context_window_tokens(context_window_tokens)
        auto_compact_tokens=validate_auto_compact_tokens(auto_compact_tokens)
        if client not in AGENTS: raise ValueError('Unsupported conversation client')
        if context_window_tokens is not None and client not in {'router-pi','router-opencode','router-hermes'}:
            raise ValueError('context_window_tokens is not supported by this client')
        if auto_compact_tokens is not None and client!='router-claude-code':
            raise ValueError('auto_compact_tokens is supported only by router-claude-code')
        scenario=json.loads(Path(scenario_file).read_text())
        self.steps=scenario['steps'] if isinstance(scenario,dict) else scenario
        validate_steps(self.steps,native=client in NATIVE_CLIENTS)
        super().__init__(*args,**kwargs)
        self.client=client
        parameters={'logs_dir':self.logs_dir,'environment_logs_dir':self.environment_logs_dir,
                    'model_name':self.model_name,'gate_url':gate_url,'gate_token_file':gate_token_file}
        if client in {'router-pi','router-opencode','router-hermes'} and context_window_tokens is not None:
            parameters['context_window_tokens']=context_window_tokens
        if client=='router-claude-code' and auto_compact_tokens is not None:
            parameters['auto_compact_tokens']=auto_compact_tokens
        self.context_profile=None
        if context_window_tokens is not None or auto_compact_tokens is not None:
            self.context_profile={'requestedContextWindowTokens':context_window_tokens,
                'requestedAutoCompactTokens':auto_compact_tokens,
                'contextWindowControl':'adapter-config-requested' if client in {'router-pi','router-opencode','router-hermes'} and context_window_tokens is not None else 'not-configured',
                'autoCompactControl':'claude-cli-autocompact-flag-requested' if auto_compact_tokens is not None else None}
        if client in NATIVE_CLIENTS:
            if not desktop_dir: raise ValueError('YouCoded needs a compiled desktop_dir')
            parameters['desktop_dir']=desktop_dir
        self.delegate=AGENTS[client](**parameters)
        if client in NATIVE_CLIENTS: self.delegate.config['scenarioSteps']=self.steps

    @staticmethod
    def name(): return 'youcoded-lab-conversation'

    def version(self): return 'scenario-v1'

    async def setup(self,environment):
        await self.delegate.setup(environment)

    async def _external_change(self,environment,step):
        validate_change(step)
        source=Path(__file__).with_name('controller_mutation.py').read_text()
        encoded=base64.b64encode(json.dumps(step).encode()).decode()
        # Controller execution, not an agent tool or an invented user intervention.
        result=await environment.exec(command='/usr/bin/python3 -I -S -c '+shlex.quote(source)+' '+shlex.quote(encoded),timeout_sec=10)
        try: receipt=json.loads(result.stdout)
        except (TypeError,ValueError): raise RuntimeError('Controller fixture change refused') from None
        if not isinstance(receipt,dict) or receipt.get('controllerOwned') is not True or receipt.get('file')!=step['file']:
            raise RuntimeError('Invalid controller mutation receipt')
        if result.return_code!=0 and not (receipt.get('applied') is False and receipt.get('writeFailed') is True):
            raise RuntimeError('Controller fixture change refused')
        return receipt

    async def _snapshot(self,environment,index,step,context):
        # Store snapshots outside the agent-writable mirrored log directory.
        destination=self.logs_dir.parent/'scenario-checkpoints'/f'{index:03d}'
        if destination.parent.is_symlink() or destination.is_symlink(): raise ValueError('Unsafe snapshot path')
        destination.mkdir(parents=True,exist_ok=True,mode=0o700)
        # Download outside the mirrored log tree first, excluding previous snapshots to prevent recursion.
        with tempfile.TemporaryDirectory(prefix='yc-scenario-log-') as temporary:
            await environment.download_dir_with_exclusions(source_dir=str(self.environment_logs_dir),
                target_dir=Path(temporary),exclude=['scenario-checkpoints'])
            skipped=copy_private_snapshot(temporary,destination)
        original=self.delegate.logs_dir
        try:
            self.delegate.logs_dir=destination
            self.delegate.populate_context_post_run(context)
        finally: self.delegate.logs_dir=original
        trajectory=destination/'trajectory.json'
        parsed=json.loads(trajectory.read_text()) if trajectory.is_file() and not trajectory.is_symlink() else None
        captured=isinstance(parsed,dict) and isinstance(parsed.get('steps'),list) and bool(parsed['steps']) and not skipped
        answer=answer_from_trajectory(parsed) if captured else None
        return {'finalText':answer,'captureComplete':captured,'evidence':str(destination.relative_to(self.logs_dir.parent)),
                'skippedSymlinks':skipped,'nativeResume':index>0,'adapterUsage':context.model_dump()}

    async def run(self,instruction,environment,context):
        self.logs_dir.mkdir(parents=True,exist_ok=True)
        if self.client in NATIVE_CLIENTS:
            await self.delegate.run(instruction,environment,context)
            native_path=self.logs_dir/'youcoded-run.json'
            native=json.loads(native_path.read_text())
            result={**native['scenario'],'steps':native.get('scenarioCheckpoints',native['scenario']['steps'])}
        else:
            checkpoint_path=self.logs_dir/'scenario-result.json'
            partial={'status':'interrupted','steps':[],'unexecutedSteps':len(self.steps),'scriptedUserInputs':True,'client':self.client}
            async def save_step(row):
                partial['steps'].append(row);partial['unexecutedSteps']=len(self.steps)-len(partial['steps'])
                write_private_json(checkpoint_path,partial)
            result=await run_conversation(self.delegate,environment,self.steps,
                lambda index,step,ctx:self._snapshot(environment,index,step,ctx),on_step=save_step,
                external_change=lambda step:self._external_change(environment,step))
        result['scriptedUserInputs']=True
        result['client']=self.client
        # Controller-owned intent, not evidence that the adapter/provider applied or observed a limit.
        if self.context_profile is not None:
            result['contextProfileRequest']=self.context_profile
            result['contextProfileObservation']={'status':'not-observed',
                'reason':'Adapter metadata records requested controls; effective provider context was not independently measured.'}
        result['usageAuthority']='shared request ledger; do not add cumulative adapter step usage together'
        result['taskInstructionSource']='scenario_file; outer Harbor instruction is not an additional user turn'
        destination=self.logs_dir/'scenario-result.json'
        write_private_json(destination,result)
        context.metadata={'scenario':result}
        if result['status']!='completed': raise RuntimeError('Conversation failed; preserved scenario-result.json')
