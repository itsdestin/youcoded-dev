"""Prospective host-owned behavior bridge, outside every agent mount.

Only the host launcher/Harbor plugin sees this policy. Container observations are
kept separate and never promoted to semantic, safety or human-input authority.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
import time

HERE=Path(__file__).resolve().parent
MAX_BYTES=16*1024*1024


def need(value,message):
    if not value: raise ValueError(message)


def read_private(path):
    path=Path(path)
    need(path.is_absolute() and path.resolve()==path,'Canonical controller path required')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and info.st_nlink==1 and info.st_size<=MAX_BYTES,'Bounded owned ordinary file required')
        return os.read(fd,MAX_BYTES+1)
    finally: os.close(fd)


def write_new(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())


def start(config,row,job_id):
    root=Path(config['eventsPath']).parent/'controller-behavior'
    # Parallel children use a journal subdirectory but share the manifest's
    # controller sibling, never jobs. No policy directory is uploaded to agents.
    if str(root.parent).endswith('.trials'): root=root.parent.parent/'controller-behavior'
    root.mkdir(mode=0o700,exist_ok=True)
    need(root.resolve()==root and root.stat().st_uid==os.getuid() and root.stat().st_mode&0o077==0,'Private controller directory required')
    jobs=Path(config['jobsDir']).resolve()
    need(not root.is_relative_to(jobs),'Controller directory inside agent jobs')
    nonce=secrets.token_hex(12); base=root/(job_id+'-'+nonce)
    policy=base.with_suffix('.policy.json'); callbacks=base.with_suffix('.callbacks.jsonl')
    write_new(callbacks,b'')
    value=dict(version=1,identity=dict(runId=job_id,taskId=row['taskId'],adapter=row['agent']),callbacks=str(callbacks),root=str(root))
    write_new(policy,json.dumps(value).encode())
    return policy


def record_host(kind,row,*,policy=None):
    """Called only by trusted host callbacks; never forward raw agent rows here."""
    policy=policy or os.environ.get('YC_BEHAVIOR_POLICY')
    if policy is None:return
    value=json.loads(read_private(policy)); path=Path(value['callbacks']); root=Path(value['root'])
    need(value['version']==1 and path.parent==root and Path(policy).parent==root,'Controller callback scope mismatch')
    need(root.stat().st_mode&0o077==0,'Controller callback directory is not private')
    need(kind in ('checkpoint','execution','safety','input','native-profile'),'Unsupported host callback')
    entry=dict(type=kind,row=row,at=time.monotonic_ns()/1e6,reference='host-callback:'+Path(policy).name)
    wire=json.dumps(entry,allow_nan=False,separators=(',',':')).encode()+b'\n'
    need(len(wire)<=65536,'Host callback row bound')
    import fcntl
    fd=os.open(path,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
    with os.fdopen(fd,'ab') as stream:
        fcntl.flock(stream,fcntl.LOCK_EX)
        need(os.fstat(stream.fileno()).st_size+len(wire)<=MAX_BYTES,'Host callback journal bound')
        stream.write(wire); stream.flush();os.fsync(stream.fileno())


def try_record_host(kind,row):
    """Optional diagnostics cannot replace an independent verifier result."""
    try:
        record_host(kind,row)
        return True
    except (ValueError,OSError,TypeError,RecursionError):
        return False


def run_owned_native_profile(policy,profile,output):
    """Trusted host fixture launch only; not a production/container attestation.

    Reuses existing native profiles. No arbitrary command, model, cwd, prompt or
    submitted script can enter this route. Call before final outcome publication.
    """
    module=(HERE/'native-behavior.mjs').as_uri()
    script='import {launchOwnedNativeProfile} from '+json.dumps(module)+'; console.log(JSON.stringify(await launchOwnedNativeProfile(process.argv[1])));'
    proc=subprocess.run(['node','--input-type=module','-e',script,profile],capture_output=True,timeout=40,env={'PATH':os.environ.get('PATH','')})
    need(proc.returncode==0 and len(proc.stdout)<=MAX_BYTES,'Owned native launch failed')
    capture=json.loads(proc.stdout)
    output=Path(output); output.parent.mkdir(parents=True,exist_ok=True)
    write_new(output,json.dumps(capture['raw'],ensure_ascii=False,separators=(',',':')).encode())
    record_host('native-profile',capture['attestation'],policy=policy)
    return capture['raw']


def seal(policy,job):
    value=json.loads(read_private(policy)); job=Path(job)
    native=list(job.glob('*/agent/youcoded-run.json')); atif=list(job.glob('*/agent/trajectory.json'))
    need(len(native)<=1 and len(atif)<=1,'Ambiguous behavior capture')
    selected=native or atif
    raw={'runtime':'createRuntime/NativeSessionHost','events':[],'requests':[],'status':'missing'} if value['identity']['adapter']=='youcoded' else {'agent':{'name':value['identity']['adapter']},'steps':[]}
    capture_path=None
    if selected:
        capture_path=selected[0]
        try:
            data=read_private(capture_path); observed=json.loads(data)
            if isinstance(observed,dict): raw=observed
        except (ValueError,OSError,RecursionError): pass
    callbacks=[json.loads(line) for line in read_private(value['callbacks']).splitlines()]
    # Untrusted raw values stay on the observation side. Never accept its
    # controllerEvidence, user-role labels, safety or registry completeness.
    observations=dict(source='agent-container/untrusted',sdkRequests=raw.get('requests'),clarifications=raw.get('clarifications'),continuation=raw.get('continuation'))
    wire=json.dumps(dict(identity=value['identity'],raw=raw,callbacks=callbacks,agentObservations=observations),allow_nan=False).encode()
    proc=subprocess.run(['node',str(HERE/'controller-behavior.mjs')],input=wire,capture_output=True,timeout=20,env={'PATH':os.environ.get('PATH','')})
    need(proc.returncode==0 and len(proc.stdout)<=MAX_BYTES,'Controller behavior sealing failed')
    envelope=json.loads(proc.stdout); payload=proc.stdout
    target=Path(policy).with_suffix('.envelope.json');write_new(target,payload)
    # Capture itself may be absent after an interrupted launch. The loader uses
    # this exact fallback instead of inventing adapter/runtime measurements.
    capture=Path(policy).with_suffix('.capture.json');write_new(capture,json.dumps(raw,separators=(',',':'),ensure_ascii=False).encode())
    return dict(path=str(target),sha256=hashlib.sha256(payload).hexdigest(),capturePath=str(capture),captureSha256=hashlib.sha256(capture.read_bytes()).hexdigest(),captureSource=str(capture_path) if capture_path else None)
