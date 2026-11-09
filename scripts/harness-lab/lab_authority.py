"""Private host launch lease, not a proof against the trusted machine owner.

Submissions cannot read/write this channel or mint an approved host receipt.
Every lease runs current qualification once, before any provider key handling;
child checks repeat immutable scope/receipt/source checks, not cached admission
from a historical run. One gateway acquisition may consume each launch lease.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import time
from bounded_inputs import need,root_open,flags

CHANNEL='YC_HARBOR_EXECUTION_AUTHORITY'


def private_json(path):
    path=Path(path); need(path.is_absolute(),'qualification requires absolute private authority path')
    parent=root_open(path.parent,time.monotonic()+5)
    try: fd=os.open(path.name,flags(),dir_fd=parent)
    finally: os.close(parent)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_size<=8*1024*1024,'qualification requires private owned regular authority/receipt')
        raw=stream.read(8*1024*1024+1)
        need(len(raw)==info.st_size,'authority changed during read')
    return json.loads(raw)


def bound_scope(path,approval):
    import evaluation_workflow as w
    import targeted_workflow as legacy
    import evaluation_qualification as q
    from external_verification import VERSION,CONTRACT
    path=Path(path).resolve(); approval=Path(approval).resolve()
    # Universal schema gate BEFORE legacy dispatch, keys, gateway or probes.
    raw=json.loads(path.read_bytes())
    need(raw.get('schemaVersion')==2,'qualification requires schema 2 external-v2; legacy execution authority unqualified')
    m=w.check(path)
    need(m.get('executionAuthorized') is False,'prepared scope cannot self-authorize')
    receipt=private_json(approval)
    need(receipt==legacy.receipt_for(m,path) and receipt.get('approved') is True,'qualification requires exact approved manifest/budget receipt')
    current=w.tree(q.HERE,True); plan=json.loads((path.parent/'plan.json').read_bytes())
    need(plan['sourceHashes']==current,'qualification controller source changed; prepare fresh scope')
    # Preparation replaces only this generated, manifest-hashed legacy overlay;
    # external-v2 rejects overlays and never executes it. All executable source
    # must still be byte-identical to the current trusted controller.
    need(all(m['snapshotHashes'].get(str(Path(m['config']['sourceDir'])/name))==sha for name,sha in current.items() if name!='gate-network.yaml'),'qualification frozen/runtime controller source mismatch')
    binding=dict(manifestPath=str(path),approvalPath=str(approval),manifestSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                 approvalSha256=hashlib.sha256(approval.read_bytes()).hexdigest(),controllerSha256=q.digest(current),
                 contractVersion=VERSION,contractSha256=q.digest(CONTRACT),scopeID=m['preparation']['scopeID'],
                 budget=m['preparation']['experimentLimitUsd'],engineSocket=os.environ.get('YC_HARBOR_ENGINE_SOCKET'))
    return m,binding


def current(manifest):
    need(manifest.get('schemaVersion')==2,'qualification requires schema 2 external-v2; legacy execution authority unqualified')
    channel=os.environ.get(CHANNEL)
    need(channel,'qualification requires approved private controller authority; execution authority unqualified')
    authority=private_json(channel)
    need(authority.get('closed') is False and 0<=time.monotonic()-authority['issuedMonotonic']<3600,'qualification authority expired/closed')
    prepared,binding=bound_scope(authority['binding']['manifestPath'],authority['binding']['approvalPath'])
    need(binding==authority['binding'],'qualification authority scope/source/receipt changed')
    candidate={k:v for k,v in manifest.items() if k!='authorizationReceiptSha256'}
    candidate['executionAuthorized']=False
    need(candidate==prepared,'qualification execution manifest differs from approved prepared scope')
    if manifest.get('executionAuthorized') is True:
        need(manifest.get('authorizationReceiptSha256')==binding['approvalSha256'],'qualification changed execution receipt')
    need(authority['qualification'].get('qualified') is True and authority['qualification'].get('preparedManifestSha256')==binding['manifestSha256'] and
         authority['qualification'].get('controllerSourceSha256')==binding['controllerSha256'],'qualification lease has no current complete matrix result')
    return authority['qualification']


@contextmanager
def execution_authority(manifest_path,approval):
    import evaluation_qualification as q
    path=Path(manifest_path).resolve()
    prepared,binding=bound_scope(path,approval)
    if os.environ.get(CHANNEL):
        # Reentrant public mode/acquisition APIs share one current launch, not a
        # historical receipt. Recheck every bound byte before joining its scope.
        existing=private_json(os.environ[CHANNEL])
        need(existing['binding']==binding,'qualification nested authority scope/receipt mismatch')
        yield current(prepared)
        return
    need(os.environ.get('YC_HARBOR_ENGINE_SOCKET'),'qualification requires explicit trusted Engine socket before execution')
    from lab_engine_registry import ensure_clean
    ensure_clean(path.parent)
    result=q.qualify(path,engine_socket=os.environ.get('YC_HARBOR_ENGINE_SOCKET'))
    need(result['qualified'],'Mode execution not qualified: '+json.dumps(result,sort_keys=True))
    _,after=bound_scope(path,approval); need(binding==after,'qualification scope changed during preflight')
    authority=dict(binding=binding,qualification=result,issuedMonotonic=time.monotonic(),closed=False)
    file=path.parent/('launch-authority-'+secrets.token_hex(16)+'.json')
    fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream: json.dump(authority,stream,sort_keys=True); stream.flush(); os.fsync(stream.fileno())
    previous=os.environ.get(CHANNEL); os.environ[CHANNEL]=str(file)
    try: yield result
    finally:
        if previous is None: os.environ.pop(CHANNEL,None)
        else: os.environ[CHANNEL]=previous
        authority['closed']=True
        # Replace this controller's own file atomically; keep closed evidence.
        tmp=file.with_suffix('.closed')
        fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as stream: json.dump(authority,stream,sort_keys=True); stream.flush(); os.fsync(stream.fileno())
        os.replace(tmp,file)


def claim_launch(manifest):
    current(manifest)
    file=Path(os.environ[CHANNEL]+'.launch-claimed')
    fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    os.close(fd)
