#!/usr/bin/env python3
"""Small offline preparation and explicitly receipted handoff to the existing runners.

No provider key contents are read here. Docker exists only behind Backend, used by run.
Settings are strict; see SETTINGS_FIELDS and POLICY_FIELDS below (all required except
expectedImageID, synthetic). An image must have a sha256 digest or expectedImageID.
"""
import sys
# WHY: imports must not modify either the working source or its frozen snapshot.
sys.dont_write_bytecode = True
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import stat
import subprocess
import tempfile
import time

import run_objective_comparison as serial

require = serial.require
SETTINGS_FIELDS = {'sourceDir','harbor','image','expectedImageID','sharedLedgerPath',
                   'gatePolicy','workers','stopMarginUsd','synthetic'}
POLICY_FIELDS = {'model','provider','maxContextTokens','maxOutputTokens',
                'maxPromptUsdPerMillion','maxCacheWriteUsdPerMillion',
                'maxCompletionUsdPerMillion','reservationUsd'}
ARMS = ('baseline','candidate')
SHA = re.compile(r'[a-f0-9]{64}')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fingerprint(value):
    # Match the existing runners' journal fingerprint, not the receipt's RAW bytes.
    return sha(json.dumps(value,sort_keys=True,allow_nan=False).encode())


def canonical(path):
    p=Path(os.path.abspath(path))
    require('..' not in Path(path).parts,'Path traversal refused')
    for ancestor in [*reversed(p.parents),p]:
        require(not ancestor.is_symlink(),'Symlink refused')
    require(p.resolve()==p,'Canonical path required')
    require(',' not in str(p) and '\n' not in str(p) and '\r' not in str(p),'Unsafe bind-mount path')
    return p


def read_json(path):
    p=canonical(path)
    require(p.is_file(),'Ordinary JSON file required')
    return json.loads(p.read_text(),parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def write_new(path,value):
    p=Path(path)
    p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as stream:
        stream.write(json.dumps(value,indent=2,allow_nan=False)+'\n')
        stream.flush();os.fsync(stream.fileno())


def tree(root,exclude_caches=False):
    root=canonical(root)
    require(root.is_dir(),'Snapshot directory missing')
    found={}; total=0
    def visit(directory):
        nonlocal total
        for p in sorted(directory.iterdir()):
            require(not p.is_symlink(),'Snapshot symlink refused')
            if exclude_caches and (p.name=='__pycache__' or p.suffix in ('.pyc','.pyo')):
                continue
            require(p.is_dir() or p.is_file(),'Special snapshot file refused')
            if p.is_dir():visit(p)
            else:
                total+=p.stat().st_size
                require(len(found)<20000 and p.stat().st_size<=128*1024**2 and total<=1024**3,
                        'Snapshot too large')
                found[p.relative_to(root).as_posix()]=sha(p.read_bytes())
    visit(root)
    return found


def relative(name):
    require(isinstance(name,str) and bool(name) and '\\' not in name and
            not Path(name).is_absolute() and all(x not in ('','.','..') for x in name.split('/')),
            'Unsafe snapshot relative path')
    return name


def verify_map(root,hashes,exact=False):
    require(isinstance(hashes,dict) and bool(hashes),'Snapshot hash map required')
    for name,digest in hashes.items():
        p=canonical(Path(root)/relative(name))
        require(isinstance(digest,str) and SHA.fullmatch(digest) and p.is_file() and
                sha(p.read_bytes())==digest,'Snapshot hash mismatch')
    if exact:require(tree(root)==hashes,'Unexpected snapshot inputs')


def copy_map(source,dest,hashes):
    for name in hashes:
        target=dest/relative(name)
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        shutil.copyfile(canonical(source/name),target)
        target.chmod(0o700 if os.access(source/name,os.X_OK) else 0o600)
    verify_map(dest,hashes,True)


def ledger_metadata(path):
    path=canonical(path)
    require(path.parent.is_dir() and stat.S_IMODE(path.parent.stat().st_mode)==0o700 and
            stat.S_IMODE(path.stat().st_mode)==0o600,'Shared ledger and parent must already be private')
    s=read_json(path)
    require(s.get('schemaVersion')==1 and s.get('closed') is False and
            isinstance(s.get('requests'),list),'Existing open shared ledger required')
    for name in ('limitUsd','priorUpperUsd','chargedUsd','reservedUsd'):
        serial.money(s[name])
    require(s['limitUsd']>0 and s['priorUpperUsd']<=s['limitUsd'],'Invalid shared cap/prior')
    mode=s.get('accountingMode','legacy')
    require(mode in ('legacy','estimated'),'Unknown accounting mode')
    external=s.get('externalPriorUsd',s['priorUpperUsd'])
    require(serial.money(external)<=s['priorUpperUsd'],'Invalid external prior')
    if mode=='estimated':serial.money(s['providerUsageUsd'])
    scopes=s.get('budgetScopes',{})
    require(isinstance(scopes,dict),'Invalid stored budget scopes')
    for scope,limit in scopes.items():
        require(isinstance(scope,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',scope)
                and serial.money(limit)>0,'Invalid stored budget scope')
    return dict(limitUsd=s['limitUsd'],priorUpperUsd=s['priorUpperUsd'],
                accountingMode=mode,externalPriorUsd=external)


def settings_validate(s,plan):
    require(isinstance(s,dict) and set(s)<=SETTINGS_FIELDS and
            SETTINGS_FIELDS-{'expectedImageID','synthetic'}<=set(s),'Explicit documented settings required')
    for name in ('sourceDir','harbor','sharedLedgerPath'):
        require(Path(s[name]).is_absolute(),'Absolute settings paths required');canonical(s[name])
    require(type(s['workers']) is int and 1<=s['workers']<=8,'Workers must be 1..8')
    require(0<serial.money(s['stopMarginUsd'])<plan['budgetUsd'],'Positive stop margin below experiment cap required')
    require(type(s.get('synthetic',False)) is bool,'Synthetic label must be boolean')
    image=s['image']
    require(isinstance(image,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/@:-]*',image),'Unsafe image reference')
    pinned=bool(re.fullmatch(r'.+@sha256:[0-9a-f]{64}',image))
    expected=s.get('expectedImageID')
    require(pinned or (isinstance(expected,str) and re.fullmatch(r'sha256:[0-9a-f]{64}',expected)),
            'Pinned image digest or explicit expectedImageID required')
    if expected is not None:require(re.fullmatch(r'sha256:[0-9a-f]{64}',expected),'Invalid image ID')
    p=s['gatePolicy']
    require(isinstance(p,dict) and set(p)==POLICY_FIELDS,'Exact explicit gatePolicy required')
    require(p['model']==plan['model'] and p['provider']==plan['pinnedProvider'],'Policy route differs from plan')
    require(type(p['maxContextTokens']) is int and p['maxContextTokens']>0 and
            type(p['maxOutputTokens']) is int and p['maxOutputTokens']==8192,'Explicit context and output cap 8192 required')
    for k in ('maxPromptUsdPerMillion','maxCacheWriteUsdPerMillion','maxCompletionUsdPerMillion','reservationUsd'):
        serial.money(p[k])
    bound=(p['maxContextTokens']*(p['maxPromptUsdPerMillion']+p['maxCacheWriteUsdPerMillion'])+
           8192*p['maxCompletionUsdPerMillion'])/1e6*1.1
    require(p['reservationUsd']>0 and p['reservationUsd']+1e-15>=bound,'Insufficient policy reservation')


def recheck_plan(plan,path,source):
    require(plan.get('mode')=='targeted-offline-planning' and plan.get('executionAuthorized') is False,
            'Offline targeted plan required')
    require(plan.get('profile') in ('smoke','confirmation'),'Unknown profile')
    tasks=plan['taskIds']; repeats=1 if plan['profile']=='smoke' else 3
    require(isinstance(tasks,list) and 1<=len(tasks)<=3 and len(set(tasks))==len(tasks), 'Select 1..3 tasks')
    for task in tasks:require(re.fullmatch(r'[A-Za-z0-9_-]+',task),'Unsafe task ID')
    serial.money(plan['budgetUsd']);require(plan['budgetUsd']>0,'Positive experiment budget required')
    require(set(plan['builds'])==set(ARMS),'Exactly two build arms required')
    # WHY: use the planner/exporter's current definitions, not a caller-supplied hash
    # as authority for which public development fixtures may reach the agent.
    script="""import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {developmentTasks,snapshotDesktop} from './targeted-plan.mjs';import {exportSuite} from './suite.mjs';
const p=JSON.parse(fs.readFileSync(process.argv[1]));const out=process.argv[2];
const selected=p.taskIds.map(id=>{const t=developmentTasks.find(x=>x.id===id);if(!t)throw Error('Unknown development task');return t;});
exportSuite(path.join(out,'tasks'),selected,{split:'development'});
console.log(JSON.stringify({definitions:Object.fromEntries(selected.map(t=>[t.id,createHash('sha256').update(JSON.stringify(t)).digest('hex')])),builds:Object.fromEntries(['baseline','candidate'].map(a=>[a,snapshotDesktop(p.builds[a].desktopDir)]))}));"""
    with tempfile.TemporaryDirectory(prefix='yc-targeted-check-') as tmp:
        proc=subprocess.run(['node','--input-type=module','-e',script,str(path),tmp],cwd=source,
                            env=serial.child_env({'sourceDir':str(source)}),capture_output=True,text=True)
        require(proc.returncode==0,'Current planner/exporter validation failed')
        current=json.loads(proc.stdout)
        require(current['definitions']==plan['taskDefinitionHashes'],'Task definitions changed')
        require(current['builds']==plan['builds'],'Build inputs changed')
        require(tree(Path(tmp)/'tasks')=={name.removeprefix('tasks/'):digest for name,digest in
                plan['exportedFileHashes'].items()},'Exported task definitions changed')
    verify_map(path.parent,plan['exportedFileHashes'])
    require(all(name.startswith('tasks/') for name in plan['exportedFileHashes']),'Unexpected export root')
    require(tree(path.parent/'tasks')=={k[6:]:v for k,v in plan['exportedFileHashes'].items()},'Unexpected task exports')
    require(plan['sameBuild']==(plan['builds']['baseline']['sha256']==plan['builds']['candidate']['sha256']),
            'Incorrect same-build label')
    expected={(t,plan['model'],a,r) for t in tasks for a in ARMS for r in range(repeats)}
    actual=[(c['taskId'],c['model'],c['agent'],c['repetition']) for c in plan['cells']]
    # Planner repetitions are deliberately checked, never renumbered by preparation.
    require(len(actual)==len(expected) and set(actual)==expected,'Unexpected matrix cells')
    for c in plan['cells']:
        require(c['client']=='youcoded' and c['pinnedProvider']==plan['pinnedProvider'] and
                c['buildSha256']==plan['builds'][c['agent']]['sha256'],'Changed cell identity')


def prepare(plan_path,settings_path,out):
    plan_path=canonical(plan_path);s=read_json(settings_path);p=read_json(plan_path)
    settings_validate(s,p)
    source=canonical(s['sourceDir'])
    require(source==Path(__file__).resolve().parent,'sourceDir must be this current lab source')
    source_hashes=tree(source,True)
    require(source_hashes and (source/'targeted-plan.mjs').is_file(),'Current lab source required')
    recheck_plan(p,plan_path,source)
    metadata=ledger_metadata(s['sharedLedgerPath'])
    require(p['budgetUsd']<=metadata['limitUsd'],'Experiment cap exceeds shared cap')
    out=canonical(out);require(out.parent.is_dir() and not out.exists(),'Fresh output directory required')
    roots=[source,plan_path.parent,canonical(s['sharedLedgerPath']).parent]+[
        canonical(p['builds'][a]['desktopDir']) for a in ARMS]
    require(not any(out==r or r in out.parents for r in roots),'Output overlaps protected inputs')
    out.mkdir(mode=0o700)
    try:
        cohort='targeted-'+secrets.token_hex(12)
        copy_map(plan_path.parent,out,p['exportedFileHashes'])
        copy_map(source,out/'source',source_hashes)
        variants={}
        for arm in ARMS:
            dest=out/'builds'/arm
            copy_map(Path(p['builds'][arm]['desktopDir']),dest,p['builds'][arm]['files'])
            variants[arm]=str(dest)
        network='yc-'+cohort;gateway=network+'-gateway'
        (out/'source/gate-network.yaml').write_text('services:\n  main:\n    networks: [default, budget]\nnetworks:\n  budget:\n    external: true\n    name: '+network+'\n')
        overlays=[]
        for task in p['taskIds']:
            directory=out/'tasks'/task
            docker=directory/'environment/Dockerfile';toml=directory/'task.toml'
            before={'Dockerfile':sha(docker.read_bytes()),'task.toml':sha(toml.read_bytes())}
            docker.write_text('FROM '+s['image']+'\nWORKDIR /app\nCOPY fixtures/ /app/\n')
            text=toml.read_text()
            require(text.count('[agent]\ntimeout_sec = 300')==1,'Unexpected agent timeout definition')
            toml.write_text(text.replace('[agent]\ntimeout_sec = 300','[agent]\ntimeout_sec = 180'))
            overlays.append(dict(taskId=task,before=before,after={'Dockerfile':sha(docker.read_bytes()),
                'task.toml':sha(toml.read_bytes())},image=s['image'],agentTimeoutSec=180))
        rows=[];grants={}
        for cell in p['cells']:
            key=json.dumps([cohort,cell['taskId'],cell['model'],'youcoded',cell['repetition'],cell['agent']],separators=(',',':'))
            row=dict(trialKey=key,taskId=cell['taskId'],model=cell['model'],agent='youcoded',
                     repetition=cell['repetition'],buildVariant=cell['agent'],taskPath=str(out/'tasks'/cell['taskId']))
            row['id']=serial.job_id(row);row['tokenFile']=str(out/'tokens'/row['id'])
            # WHY: adapters distinguish scoped lab tokens from provider credentials by this prefix.
            token='yc-gate-'+secrets.token_urlsafe(32)
            tokenpath=Path(row['tokenFile']);tokenpath.parent.mkdir(mode=0o700,exist_ok=True)
            fd=os.open(tokenpath,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w') as stream:stream.write(token+'\n')
            grants[token]=dict(trialId=row['id'],maxRequests=20,policy=s['gatePolicy'],
                               budgetScope=dict(id=cohort,limitUsd=p['budgetUsd']))
            rows.append(row)
        gate=dict(host='0.0.0.0',port=18766,allowNetworkBind=True,
                  ledgerPath='/ledger/'+Path(s['sharedLedgerPath']).name,tokens=grants,**metadata)
        write_new(out/'gateway-config.json',gate)
        config=dict(sourceDir=str(out/'source'),desktopVariants=variants,harbor=s['harbor'],
            ledgerPath=s['sharedLedgerPath'],jobsDir=str(out/'jobs'),eventsPath=str(out/'events.jsonl'),
            gateUrl='http://yc-router-gateway:18766',comparisonKey=cohort,
            budgetCapUsd=metadata['limitUsd'],stopMarginUsd=s['stopMarginUsd'])
        manifest=dict(schemaVersion=1,executionAuthorized=False,config=config,trials=rows,
            nativeSettings=dict(maxRequests=20,timeoutSec=180,differences='Prepared pinned image; common agent timeout 180s; dependencies supplied by image, not build snapshot.'),
            targeted=dict(profile=p['profile'],sameBuild=p['sameBuild'],provider=p['pinnedProvider'],
                buildFingerprints={a:p['builds'][a]['sha256'] for a in ARMS},synthetic=s.get('synthetic',False)),
            preparation=dict(cohort=cohort,scopeID=cohort,planSha256=sha(plan_path.read_bytes()),
                experimentLimitUsd=p['budgetUsd'],sharedLedger=metadata,image=s['image'],
                expectedImageID=s.get('expectedImageID'),network=network,gateway=gateway,overlays=overlays),
            snapshotHashes={})
        if s['workers']>1:manifest['parallel']=dict(workers=s['workers'],timingMode='contention-affected',
            timingCohort=cohort,reserveMemoryBytes=2*1024**3)
        for dirname in ('source','tasks','builds'):
            manifest['snapshotHashes'].update({str(out/dirname/k):v for k,v in tree(out/dirname).items()})
        manifest['preparation']['gatewayConfigSha256']=sha((out/'gateway-config.json').read_bytes())
        write_new(out/'prepared-manifest.json',manifest)
        receipt=receipt_for(manifest,out/'prepared-manifest.json');receipt['approved']=False
        write_new(out/'authorization-template.json',receipt)
        check(out/'prepared-manifest.json')
        return manifest
    except BaseException:
        # Only our newly reserved private output is disposable, never an input.
        shutil.rmtree(out)
        raise


def receipt_for(m,path):
    p=m['preparation']
    return dict(approved=True,preparedManifestSha256=sha(Path(path).read_bytes()),scopeID=p['scopeID'],
                experimentLimitUsd=p['experimentLimitUsd'],sharedLimitUsd=p['sharedLedger']['limitUsd'])


def check(manifest_path):
    path=canonical(manifest_path);m=read_json(path);root=path.parent
    if m.get('schemaVersion')==2:
        # WHY: share the reviewed receipt/gateway acquisition lifecycle, not its
        # legacy two-native-arm matrix or fixed 20-request/180-second limits.
        import evaluation_workflow
        return evaluation_workflow.check(path)
    require(m.get('schemaVersion')==1 and type(m.get('executionAuthorized')) is bool,'Invalid manifest')
    require(stat.S_IMODE(root.stat().st_mode)==0o700,'Prepared root must be private 0700')
    p=m['preparation'];c=m['config']
    require(re.fullmatch(r'targeted-[0-9a-f]{24}',p['cohort']) and p['scopeID']==p['cohort'] and
            p['network']=='yc-'+p['cohort'] and p['gateway']==p['network']+'-gateway',
            'Scoped Docker identity changed')
    require(c['sourceDir']==str(root/'source') and c['desktopVariants']=={a:str(root/'builds'/a) for a in ARMS},
            'Prepared paths changed')
    expected={str(root/d/k):v for d in ('source','tasks','builds') for k,v in tree(root/d).items()}
    require(expected==m['snapshotHashes'],'Snapshot coverage or hash changed')
    require(sha((root/'gateway-config.json').read_bytes())==p['gatewayConfigSha256'],'Gateway config changed')
    gate=read_json(root/'gateway-config.json')
    require(stat.S_IMODE((root/'gateway-config.json').stat().st_mode)==0o600,'Gateway config must be private')
    require(gate['limitUsd']==p['sharedLedger']['limitUsd'] and gate['ledgerPath']=='/ledger/'+Path(c['ledgerPath']).name,
            'Shared ledger configuration changed')
    require(ledger_metadata(c['ledgerPath'])==p['sharedLedger'],'Shared ledger metadata changed')
    ledger=read_json(c['ledgerPath'])
    bound=ledger.get('budgetScopes',{}).get(p['scopeID'])
    require(bound is None or bound==p['experimentLimitUsd'],'Stored scope limit changed')
    ids={r['id'] for r in m['trials']}
    require(all(req.get('budgetScopeId')==p['scopeID'] for req in ledger['requests'] if req.get('trialId') in ids),
            'Existing trial ledger scope mismatch')
    require(c['gateUrl']=='http://yc-router-gateway:18766' and c['comparisonKey']==p['cohort'] and
            c['jobsDir']==str(root/'jobs') and c['eventsPath']==str(root/'events.jsonl') and
            gate['host']=='0.0.0.0' and gate['port']==18766 and gate['allowNetworkBind'] is True,
            'Prepared runtime configuration changed')
    for r in m['trials']:
        require(r['id']==serial.job_id(r) and r['agent']=='youcoded' and r['buildVariant'] in ARMS,'Changed trial identity')
        token=canonical(r['tokenFile'])
        require(token.parent==root/'tokens' and token.is_file() and stat.S_IMODE(token.stat().st_mode)==0o600,
                'Private opaque token required')
        value=token.read_text().strip()
        require(gate['tokens'].get(value)==dict(trialId=r['id'],maxRequests=20,
            policy=gate['tokens'][value]['policy'],budgetScope=dict(id=p['scopeID'],limitUsd=p['experimentLimitUsd'])),
            'Changed scope or grant')
    require(len(gate['tokens'])==len(m['trials']),'Unexpected grants')
    serial.validate(m)
    return m


def private_key_metadata(path):
    p=canonical(path)
    require(p.is_file() and stat.S_IMODE(p.stat().st_mode)==0o600 and p.stat().st_uid==os.getuid(),
            'Provider key path must be owned regular 0600 file')
    return p


@contextmanager
def acquisition_signals():
    """Replay exact stop signals only after the acquired owner is registered."""
    previous={s:signal.getsignal(s) for s in (signal.SIGINT,signal.SIGTERM)}
    pending=[]
    def defer(signum,_frame):pending.append(signum)
    try:
        for sig,handler in previous.items():
            if handler!=signal.SIG_IGN:signal.signal(sig,defer)
        yield
    finally:
        # WHY: unlike serial.defer_spawn_signals' KeyboardInterrupt, replay to the
        # installed owner preserves SIGTERM/SIGINT and permits runner reaping.
        try:signal.signal(signal.SIGINT,previous[signal.SIGINT])
        finally:signal.signal(signal.SIGTERM,previous[signal.SIGTERM])
        for sig in pending:
            handler=previous[sig]
            if callable(handler):handler(sig,None)
            elif handler!=signal.SIG_IGN:raise KeyboardInterrupt


class Backend:
    """Inject this boundary in offline tests; never fake paid measurement evidence."""
    def command(self,args,**kwargs):
        return subprocess.run(args,env=serial.child_env({'sourceDir':''}),capture_output=True,text=True,timeout=30,**kwargs)

    def health(self,name):
        # No published port or billable inference: probe an unregistered GET inside gateway.
        script="fetch('http://127.0.0.1:18766/health').then(r=>process.exit(r.status===404?0:1)).catch(()=>process.exit(1))"
        for _ in range(20):
            if self.command(['docker','exec',name,'node','-e',script]).returncode==0:return True
            time.sleep(.25)
        return False

    def runner(self,args,env):
        child=None;previous={};pending=[]
        def forward(signum,_frame):
            if child is None:pending.append(signum)
            elif child.poll() is None:child.send_signal(signum)
        try:
            # WHY: own stop delivery before Popen, and defer it across the OS
            # acquisition/assignment window so outer cleanup cannot outrun child.
            for sig in (signal.SIGINT,signal.SIGTERM):
                previous[sig]=signal.signal(sig,forward)
            with acquisition_signals():
                child=subprocess.Popen(args,env=env)
            for sig in pending:forward(sig,None)
            return child.wait()
        except BaseException:
            if child is not None:
                forward(signal.SIGTERM,None)
                child.wait()
            raise
        finally:
            for sig,handler in previous.items():signal.signal(sig,handler)


def run(manifest_path,execute=False,authorization=None,key_file=None,backend=None):
    require(execute is True and authorization is not None,'Explicit --execute and authorization receipt required')
    import evaluation_qualification
    # Establish a fresh private launch lease from the exact approved receipt and
    # current complete matrix BEFORE even provider-key metadata is consulted.
    with evaluation_qualification.execution_authority(manifest_path,authorization):
        return _run_authorized(manifest_path,execute,authorization,key_file,backend)


def _run_authorized(manifest_path,execute=False,authorization=None,key_file=None,backend=None):
    require(execute is True and authorization is not None,'Explicit --execute and authorization receipt required')
    path=canonical(manifest_path)
    require(path.name=='prepared-manifest.json','Run requires prepared-manifest.json')
    # WHY: every NEW execution, including historical-schema replay, needs
    # current authority BEFORE check reads tokens/ledger or key metadata.
    import evaluation_qualification
    evaluation_qualification.admit_execution(read_json(path))
    m=check(path)
    if m.get('schemaVersion')==2:
        require(not m['evaluation']['blockers'],'Mode capabilities/track incomplete; execution blocked')
    receipt=read_json(authorization)
    require(type(receipt.get('approved')) is bool and receipt==receipt_for(m,path),
            'Authorization receipt does not exactly approve prepared manifest and limits')
    execution=json.loads(json.dumps(m));execution['executionAuthorized']=True
    execution['authorizationReceiptSha256']=sha(canonical(authorization).read_bytes())
    destination=path.parent/'execution-manifest.json'
    if destination.exists():require(read_json(destination)==execution,'Execution manifest or receipt changed')
    # WHY: receipt, caps and every fingerprint precede even key metadata or Docker.
    require(key_file is not None,'Explicit provider key file path required')
    key=private_key_metadata(key_file)
    b=backend or Backend();p=m['preparation'];root=path.parent
    lockfd=os.open(canonical(root/'workflow.lock'),os.O_CREAT|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    network_owned=False;gateway_owned=False;errors=[]
    previous={}
    def interrupted(_signum,_frame):
        raise serial.Refusal('Interrupted before runner admission; inspect scoped evidence')
    for sig in (signal.SIGINT,signal.SIGTERM):
        previous[sig]=signal.signal(sig,interrupted)
    try:
        try:fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise serial.Refusal('Targeted workflow already active')
        history=canonical(root/'cleanup.jsonl')
        if history.exists():
            require(all(not json.loads(line)['cleanupErrors'] for line in history.read_text().splitlines()),
                    'Previous cleanup failure requires inspection')
        if m.get('schemaVersion')==2 and m['config'].get('hostVerification'):
            # WHY: new external-v2 cells never enter the legacy shared bridge or
            # compose-overlay acquisition path. The Engine socket is a trusted
            # controller input, not a manifest/submission field or agent option.
            from lab_engine_gateway import run_matrix
            socket=os.environ.get('YC_HARBOR_ENGINE_SOCKET')
            require(socket and Path(socket).is_absolute(),'Explicit trusted Engine socket required')
            if not destination.exists():write_new(destination,execution)
            return run_matrix(execution,key,socket,b,destination)
        require(b.command(['docker','info']).returncode==0,'Docker unavailable; no names acquired')
        for kind,name in [('network',p['network']),('container',p['gateway'])]:
            probe=b.command(['docker',kind,'inspect',name])
            require(probe.returncode==1,'Preexisting or uninspectable Docker name refused')
        image=b.command(['docker','image','inspect',p['image']])
        require(image.returncode==0,'Prepared image must already exist; no pull')
        identity=json.loads(image.stdout)
        require(len(identity)==1,'Ambiguous image identity')
        image_id=identity[0]['Id']
        if p['expectedImageID']:require(image_id==p['expectedImageID'],'Image identity mismatch')
        else:require(p['image'] in identity[0].get('RepoDigests',[]),'Pinned image digest mismatch')
        if not destination.exists():write_new(destination,execution)
        def command(args):
            result=b.command(args);require(result.returncode==0,'Scoped Docker operation failed');return result
        # WHY: timeout/transport failure may hide a successful Docker creation.
        # Do not guess ownership or remove a name that another actor may own:
        # persist uncertainty and refuse resume until explicitly inspected.
        def acquire(args,kind,name):
            try:return command(args)
            except (OSError,subprocess.SubprocessError,serial.Refusal):
                errors.append('uncertain '+kind+' creation: '+name)
                raise
        with acquisition_signals():
            acquire(['docker','network','create',p['network']],'network',p['network'])
            network_owned=True
        # Separate create/start makes ownership precise even if startup fails.
        args=['docker','create','--pull=never','--name',p['gateway'],'--network',p['network'],
              '--network-alias','yc-router-gateway','--user',str(os.getuid())+':'+str(os.getgid()),
              '--read-only','--cap-drop=ALL',
              '--security-opt','no-new-privileges','--mount','type=bind,src='+str(root/'source')+',dst=/source,readonly',
              '--mount','type=bind,src='+str(root/'gateway-config.json')+',dst=/config.json,readonly',
              '--mount','type=bind,src='+str(key)+',dst=/provider-key,readonly',
              '--mount','type=bind,src='+str(Path(m['config']['ledgerPath']).parent)+',dst=/ledger',
              '--entrypoint','node',image_id,'/source/openrouter-gateway.mjs','--config','/config.json','--key-file','/provider-key']
        with acquisition_signals():
            acquire(args,'container',p['gateway'])
            gateway_owned=True
        command(['docker','start',p['gateway']])
        require(b.health(p['gateway']),'Gateway readiness failed')
        runner='run_parallel_comparison.py' if 'parallel' in m else 'run_objective_comparison.py'
        return b.runner([sys.executable,'-B',str(root/'source'/runner),'--manifest',str(destination),'--execute'],
                        serial.child_env(m['config']))
    finally:
        # WHY: let the runner finish its scoped shutdown first; a second signal
        # must not strand our gateway midway through the bounded cleanup below.
        for sig in previous:signal.signal(sig,signal.SIG_IGN)
        for owned,args in [(gateway_owned,['docker','stop','--time','30',p['gateway']]),
                           (gateway_owned,['docker','rm',p['gateway']]),
                           (network_owned,['docker','network','rm',p['network']])]:
            if owned:
                try:
                    if b.command(args).returncode!=0:errors.append(' '.join(args[:2]))
                except (OSError,subprocess.SubprocessError):errors.append(' '.join(args[:2]))
        try:
            if gateway_owned or network_owned or errors:
                fd=os.open(root/'cleanup.jsonl',os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW,0o600)
                with os.fdopen(fd,'a') as stream:
                    stream.write(json.dumps(dict(cleanupErrors=errors,at=time.time()))+'\n')
                    stream.flush();os.fsync(stream.fileno())
        finally:
            os.close(lockfd)
            for sig,handler in previous.items():signal.signal(sig,handler)
        require(not errors,'Scoped cleanup failed; inspect cleanup.jsonl before continuing')


def report(manifest_path,ledger_path,out):
    import targeted_report
    out=canonical(out)
    require(out.parent.is_dir() and not out.exists(),'Fresh report output required')
    result=targeted_report.load_targeted_report(canonical(manifest_path),canonical(ledger_path) if ledger_path else None)
    markdown=targeted_report.render_markdown(result)
    out.mkdir(mode=0o700)
    write_new(out/'summary.json',result)
    fd=os.open(out/'report.md',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(markdown)
    return result


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    prep=sub.add_parser('prepare',help='Offline only: recheck and privately copy a small plan')
    for name in ('plan','settings','out'):prep.add_argument('--'+name,required=True)
    for name in ('check','run','report'):
        cmd=sub.add_parser(name);cmd.add_argument('--manifest',required=True)
        if name=='run':
            cmd.add_argument('--execute',action='store_true');cmd.add_argument('--authorization');cmd.add_argument('--key-file')
        if name=='report':cmd.add_argument('--ledger');cmd.add_argument('--out',required=True)
    args=parser.parse_args(argv)
    try:
        if args.command=='prepare':prepare(args.plan,args.settings,args.out)
        elif args.command=='check':check(args.manifest)
        elif args.command=='run':return run(args.manifest,args.execute,args.authorization,args.key_file)
        else:report(args.manifest,args.ledger,args.out)
        return 0
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError):
        print('Targeted workflow refused: inspect inputs, authorization, snapshots and scoped evidence.',file=sys.stderr)
        return 1


if __name__=='__main__':sys.exit(main())
