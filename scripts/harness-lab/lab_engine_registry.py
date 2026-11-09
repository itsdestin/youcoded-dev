"""Controller-private, fsync'd exact-ID acquisition and cleanup journal."""
import asyncio
import json
import os
from pathlib import Path
import stat
from bounded_inputs import need, root_open, flags
import time


def event(path, **record):
    if path is None: return
    path=Path(path); need(path.is_absolute(),'absolute ownership journal required')
    parent=root_open(path.parent,time.monotonic()+5)
    try: fd=os.open(path.name,os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW,0o600,dir_fd=parent)
    finally: os.close(parent)
    try:
        info=os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and info.st_size<1024*1024,'private bounded ownership journal required')
        data=(json.dumps(record,sort_keys=True,allow_nan=False)+'\n').encode()
        need(len(data)<16384,'ownership record limit')
        need(os.write(fd,data)==len(data),'partial ownership record'); os.fsync(fd)
    finally: os.close(fd)


async def create(engine,path,kind,payload,*,name=None):
    """Write-ahead uncertainty; one acquired record both registers ID and resolves.

    No exception path resolves an intent: transport failure does not prove the
    daemon failed to create. Unknown identities are NEVER discovered or deleted.
    """
    from lab_engine import ID
    import secrets
    need(kind in ('network','container'),'invalid acquisition type')
    operation=secrets.token_hex(16)
    metadata=dict(labels=payload.get('Labels',{}),name=name or payload.get('Name') or 'yc-create-'+operation)
    if kind=='container': metadata['image']=payload['Image']
    else: metadata['internal']=payload.get('Internal')
    event(path,action='intent',kind=kind,id=operation,operation=operation,**metadata)
    # Name is controller generated, never a submission field or socket input.
    from urllib.parse import quote
    endpoint='/networks/create' if kind=='network' else '/containers/create?name='+quote(metadata['name'],safe='')
    result=await engine.request('POST',endpoint,payload)
    need(isinstance(result,dict) and isinstance(result.get('Id'),str) and ID.fullmatch(result['Id']),'create response identity absent/invalid; acquisition uncertain')
    # WHY: a single append/fsync is atomic in replay semantics: there is no
    # "resolved" record that could survive without its exact owned registration.
    event(path,action='acquired',kind=kind,id=result['Id'],operation=operation,**metadata)
    return result


def active(path):
    path=Path(path)
    if not path.exists(): return {}
    parent=root_open(path.parent,time.monotonic()+5)
    try: fd=os.open(path.name,flags(),dir_fd=parent)
    finally: os.close(parent)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and info.st_size<=1024*1024,'private ownership journal required')
        records=stream.read(1024*1024+1).splitlines()
    result={}
    for raw in records:
        item=json.loads(raw); key=(item['kind'],item['id'])
        if item['action']=='intent':
            key=('intent',item['operation'])
            need(key not in result,'duplicate acquisition intent'); result[key]=item
        elif item['action']=='acquired':
            need(key not in result,'duplicate ownership acquisition')
            if 'operation' in item:
                intent=result.get(('intent',item['operation']))
                need(intent is not None and intent['kind']==item['kind'] and
                     all(intent.get(k)==item.get(k) for k in ('labels','image','name')),'unmatched acquisition intent')
                del result[('intent',item['operation'])]
            result[key]=item
        elif item['action']=='deleted': result.pop(key,None)
        elif item['action'] not in ('cleanup-error','operation-error','inspection'): raise ValueError('unknown ownership action')
    return result


def ensure_clean(root):
    """Refuse scope reuse after an interrupted controller, even without summary.

    Inspect only known controller journal locations, NEVER agent/artifact logs
    and NEVER daemon label/name discovery. This is a read-only admission check.
    """
    root=Path(root)
    paths=set()
    for pattern in ('*.ownership.jsonl','gateway-ownership-*.jsonl','qualification-owned-*.jsonl'):
        paths.update(root.glob(pattern))
    invocations=list(root.glob('qualification-lifecycle-*'))
    need(len(paths)+len(invocations)<=1000,'ownership inventory bound; inspect scope')
    for invocation in invocations:
        need(invocation.is_dir() and not invocation.is_symlink(),'unsafe ownership invocation path')
        paths.update(invocation.glob('gateway-ownership-*.jsonl'))
        for control in ('reference','forged-reward'):
            file=invocation/control/'ownership.jsonl'
            if file.exists(): paths.add(file)
    need(len(paths)<=3000,'ownership inventory bound; inspect scope')
    for path in sorted(paths):
        need(not active(path),'unresolved owned Engine resources; inspect '+str(path))


def cleanup_job(row,config,policy_path):
    """Crash fallback: select ONE controller-recorded job, never label discovery."""
    from lab_engine import Policy
    from run_objective_comparison import job_id
    from lab_authority import private_json
    data=private_json(policy_path); job=job_id(row)
    need(job in data.get('jobs',{}),'missing exact Engine job policy')
    data=data['jobs'][job]
    need(data['environmentDir']==str(Path(row['taskPath'])/'environment') and data['jobDir']==str(Path(config['jobsDir'])/job),'fallback job scope mismatch')
    policy=Policy(**data['engine']); need(policy.registry_path,'missing durable Engine ownership')
    return asyncio.run(cleanup_policy(policy))


async def cleanup_policy(policy):
    from lab_engine import DockerCapability
    errors=[]
    for (kind,cid),record in active(policy.registry_path).items():
        try:
            need(kind=='container' and record['image']==policy.image and record['labels']==policy.labels(),'foreign registry entry')
            backend=DockerCapability(policy,container_id=cid)
            await backend.stop()
        except Exception as error:
            event(policy.registry_path,action='cleanup-error',kind=kind,id=cid,error=str(error)[:300])
            errors.append('Engine cleanup unresolved '+cid+': '+str(error)[:300])
    return errors
