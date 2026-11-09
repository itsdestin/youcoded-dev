"""Controller-owned task export/reset. Never import this module inside an agent mount."""
import sys
sys.dont_write_bytecode=True
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

HERE=Path(__file__).resolve().parent
CONTRACT=json.loads((HERE/'comparison-contracts.json').read_text())
PIN=CONTRACT['source']['commit']
IDS=tuple(t['id'] for t in CONTRACT['tasks'])

def sha(b):return hashlib.sha256(b).hexdigest()
def need(ok,msg):
    if not ok:raise ValueError(msg)
def hashes(root,*,deadline=None):
    # WHY: preflight all metadata before reading any content, then stream from
    # no-follow descriptors under one ingestion/verification deadline.
    from bounded_inputs import hashes as bounded_hashes
    return bounded_hashes(root,deadline=deadline)

def snapshot(repo,out):
    repo=Path(repo).resolve();out=Path(out)
    need(not out.exists() and out.parent.is_dir(),'Fresh snapshot destination required')
    # WHY: Git objects, never checkout files, credential helpers, network, or working-tree state.
    env={'PATH':os.environ.get('PATH',''),'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':os.devnull,'GIT_NO_REPLACE_OBJECTS':'1'}
    def git(*args):return subprocess.check_output(['git','-C',str(repo),*args],env=env)
    need(git('rev-parse',PIN+'^{commit}').decode().strip()==PIN,'Pinned source object missing')
    license_text=git('show',PIN+':LICENSE')
    need(b'MIT License' in license_text and b'desktop/' in license_text,'Source license not verified')
    entries=git('ls-tree','-r','-z',PIN).split(b'\0')
    selected=[]
    for row in entries:
        if not row:continue
        meta,name=row.split(b'\t');mode,kind,oid=meta.split();name=name.decode()
        allowed=name in ('LICENSE','desktop/LICENSE','desktop/package.json') or name.startswith(('desktop/src/','desktop/scripts/','desktop/tests/'))
        # Only first-party source text; no vendored add-ons, binaries, eval tasks, instructions, keys or caches.
        allowed=allowed and not any(x in name.split('/') for x in ('eval','__pycache__','node_modules'))
        allowed=allowed and (name.endswith(('.ts','.tsx','.js','.cjs','.mjs','.json','.css','.md','.py')) or name.endswith('LICENSE'))
        allowed=allowed and Path(name).name not in ('CLAUDE.md','AGENTS.md') and not Path(name).name.startswith('.env')
        if allowed:
            need(mode in (b'100644',b'100755') and kind==b'blob','Unsupported Git entry')
            selected.append((name,oid.decode(),mode))
    out.mkdir(mode=0o700)
    try:
        source_bytes=0
        proc=subprocess.Popen(['git','-C',str(repo),'cat-file','--batch'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
        try:
            for name,oid,mode in selected:
                proc.stdin.write((oid+'\n').encode());proc.stdin.flush()
                header=proc.stdout.readline().split();need(len(header)==3 and header[1]==b'blob','Invalid Git blob')
                size=int(header[2]);need(size<8*1024**2,'Unexpected source blob size')
                data=proc.stdout.read(size);need(proc.stdout.read(1)==b'\n','Invalid Git framing')
                # Literal header-only security-test sentinels are not key material.
                need(not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{32,}?-----END',data) and not re.search(rb'sk-or-v1-[a-f0-9]{64}',data),'Potential credential in source; review required')
                p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o755 if mode==b'100755' else 0o644);source_bytes+=size
        finally:
            proc.stdin.close();proc.stdout.close();proc.wait()
        need(proc.returncode==0,'Git object extraction failed')
        identity=dict(repository=CONTRACT['source']['repository'],commit=PIN,license='MIT (selected desktop source; full license retained)',sourceFiles=len(selected),sourceBytes=source_bytes,productionSourceFiles=sum(name.startswith('desktop/src/') for name,_,_ in selected),testFiles=sum(name.startswith('desktop/tests/') for name,_,_ in selected),sourceDirectories=len({str(Path(name).parent) for name,_,_ in selected}),selection=CONTRACT['source']['selection'],contentManifestSha256=sha(json.dumps(hashes(out),sort_keys=True).encode()))
        # Sidecar is controller-owned and never part of the repository input.
        out.with_suffix('.identity.json').write_text(json.dumps(dict(identity=identity,files=hashes(out)),sort_keys=True))
        return identity
    except BaseException:
        shutil.rmtree(out);raise

def validate_snapshot(root):
    root=Path(root);record=json.loads(root.with_suffix('.identity.json').read_text())
    need(record['identity']['commit']==PIN and hashes(root)==record['files'],'Contaminated reset snapshot')
    need(record['identity']['contentManifestSha256']==sha(json.dumps(record['files'],sort_keys=True).encode()),'Changed snapshot identity')
    return record

CORPUS={
 'catalog-current':{'url':'https://capacity.invalid/catalog/v2','version':'2026-10-v2','body':'Current catalog v2. east-small: region east, 80 RPS, 4 GiB, runtime 22, latency 30 ms, 17 cents/hour, cap 3. west-small: region west, 70 RPS, 4 GiB, runtime 22, latency 45 ms, 13 cents/hour, cap 3. east-large: region east, 160 RPS, 8 GiB, runtime 24, latency 30 ms, 29 cents/hour, cap 2. west-large: region west, 150 RPS, 8 GiB, runtime 24, latency 45 ms, 27 cents/hour, cap 2.'},
 'billing-current':{'url':'https://capacity.invalid/billing/v2','version':'2026-10-v2','body':'Billing v2: each instance is billed in whole hours, rounded UP independently for the full requested duration. No free tier, discounts or transfer charges. Budget is an inclusive upper bound in integer cents.'},
 'runtime-current':{'url':'https://capacity.invalid/runtime/v2','version':'2026-10-v2','body':'A runtime 24 instance supports workloads requiring runtime 22 or 24. Runtime 22 does not support runtime 24. RPS capacities add linearly; when a region fails all of its instances are unavailable. No cross-region memory pooling.'},
 'deprecation':{'url':'https://capacity.invalid/notices/v2','version':'2026-10-v2','body':'The v1 catalog and billing-v1 were superseded by catalog-current and billing-current on 2026-10-01. v1 prices and per-minute billing must not be used for new plans.'},
 'catalog-v1':{'url':'https://capacity.invalid/catalog/v1','version':'2026-08-v1','body':'SUPERSEDED v1: all small instances cost 3 cents/hour and all large instances cost 5 cents/hour. See current deprecation notice.'},
 'billing-v1':{'url':'https://capacity.invalid/billing/v1','version':'2026-08-v1','body':'SUPERSEDED v1: per-minute prorated billing.'},
 'unrelated':{'url':'https://capacity.invalid/design','version':'v1','body':'Color and font selection guide. No capacity guarantees.'}}
WORKLOAD=dict(demandRps=210,failoverRps=100,minMemoryGiB=4,runtime=22,maxLatencyMs=50,durationMinutes=61,budgetCents=180)

def fixture(root,task,*,contract_version=None):
    need(task in IDS,'Unknown substantial task')
    shutil.copyfile(HERE/'comparison-loader.cjs',root/'comparison-loader.cjs')
    if task==IDS[2]:
        (root/'corpus').mkdir()
        for key,doc in CORPUS.items():(root/'corpus'/(key+'.json')).write_text(json.dumps(dict(id=key,**doc),indent=2)+'\n')
        (root/'workload.json').write_text(json.dumps(WORKLOAD,indent=2)+'\n')
        shutil.copyfile(HERE/'controlled-research.cjs',root/'research.cjs')
    goal=next(t['goal'] for t in CONTRACT['tasks'] if t['id']==task)
    if contract_version is not None:
        from external_verification import VERSION,CONTRACT as external
        need(contract_version==VERSION,'Unknown task contract version')
        goal+='\n\nACTIVE CONTRACT: '+VERSION+'\nThis explicitly replaces conflicting v1 internal assertions:\n'+external['replacements'][task]+'\n'+external['regressionTests']+'\n'+external['backend']
    (root/'TASK.md').write_text(goal+'\n')

def reset(source,out,task,*,contract_version=None):
    source=Path(source);out=Path(out)
    record=validate_snapshot(source)
    need(not out.exists() and out.parent.is_dir(),'Fresh reset required; attempts are never overwritten')
    shutil.copytree(source,out);fixture(out,task,contract_version=contract_version)
    expected=dict(record['files']);actual=hashes(out)
    need(all(actual[k]==v for k,v in expected.items()),'Reset source hash mismatch')
    out.with_suffix('.input.json').write_text(json.dumps(actual,sort_keys=True))
    out.with_suffix('.origin.json').write_text(json.dumps({'snapshot':str(source.resolve())}))
    return out

def reference(root,task):
    from comparison_reference import apply
    apply(Path(root),task)

def mutations(task):
    return ['forbidden','regression-tests','helper-only','bad-size','duplicate'] if task==IDS[0] else ['forbidden','regression-tests','stale-store','stale-consumer','non-idempotent'] if task==IDS[1] else ['forbidden','regression-tests','hardcoded','false-citation','old-price','no-receipts']

def mutate(root,task,label):
    root=Path(root)
    if label=='forbidden':(root/'desktop/package.json').write_text('{}')
    elif label=='regression-tests':(root/'submission/test.cjs').write_text('process.exit(0);')
    elif label in ('helper-only','stale-store','stale-consumer'):
        name={'helper-only':'desktop/scripts/generate-release-manifest.mjs','stale-store':'desktop/src/main/harness/context-settings-store.ts','stale-consumer':'desktop/src/main/providers/cloud-context.ts'}[label]
        # Restore only the disposable fixture from pinned Git, never a shared checkout.
        (root/name).write_bytes(subprocess.check_output(['git','-C',str(HERE.parents[1]/'youcoded'),'show',PIN+':'+name]))
    elif label in ('bad-size','duplicate'):
        p=root/'desktop/src/shared/release-validation.mts';s=p.read_text()
        p.write_text(s.replace('!Number.isSafeInteger(a.size) || a.size<0','false') if label=='bad-size' else s.replace('seen.has(a.name)','false'))
    elif label=='non-idempotent':
        p=root/'desktop/src/shared/context-migration.mts';p.write_text(p.read_text().replace('return {...config,','return {...config, migrationCount:(config.migrationCount||0)+1,'))
    elif label=='hardcoded':(root/'submission/planner.cjs').write_text('console.log('+json.dumps((root/'submission/plan.json').read_text())+');')
    elif label=='false-citation':(root/'submission/evidence.json').write_text('[{"document":"catalog-current","quote":"invented free price"}]')
    elif label=='old-price':
        p=root/'submission/planner.cjs';p.write_text(p.read_text().replace('17,3','3,3').replace('13,3','3,3').replace('29,2','5,2').replace('27,2','5,2'))
    elif label=='no-receipts':(root/'research-receipts.jsonl').unlink()
    else:raise ValueError('Unknown mutation')

def verify(root,task):
    """Legacy offline trusted-fixture qualification only; NEVER submission acceptance.

    Callers own the trust decision for fixture code. Real-submission entry points
    below and the exported shell intentionally remain fail-closed.
    """
    root=Path(root)
    # Controller-owned sidecar is outside the agent fixture mount.
    origin=Path(json.loads(root.with_suffix('.origin.json').read_text())['snapshot'])
    validate_snapshot(origin)
    return qualify_trusted_fixture_against(root,task,json.loads(root.with_suffix('.input.json').read_text()),origin)

def verify_against(root,task,baseline,origin,*,executor=None,backend=None,contract_version=None,deadline=None):
    # WHY: v1 internal-observation promises remain frozen/unverified. V2 is an
    # explicitly selected external API/persisted-state contract, not a waiver.
    if backend=='bwrap':
        from external_verification import VERSION,verify as external_verify
        from bwrap_executor import BwrapExecutor
        need(type(executor) is BwrapExecutor,'Explicit bwrap executor required')
        need(contract_version==VERSION,'Explicit external-v2 contract required; v1 remains unverified')
        return external_verify(root,task,baseline,origin,executor,deadline=deadline)
    need(backend in (None,'docker'),'Unknown verification backend')
    # Docker remains unqualified; never silently choose a different backend.
    if executor is None:
        return dict(passed=False,reward=0,category='infrastructure-error',protectedChecks=None,functionalChecks=False,
            submissionAcceptance=False,reason='Explicit isolated Docker executor required; host execution is forbidden')
    from secure_evaluation import DockerExecutor,verify as isolated_verify
    need(type(executor) is DockerExecutor,'Production submission API requires the isolated Docker executor')
    # WHY: the current observation boundary is unverified; do not hash an
    # unbounded origin sidecar or run anything merely to return that verdict.
    return isolated_verify(root,task,baseline,origin,executor)

def qualify_trusted_fixture_against(root,task,baseline,origin):
    """Execute only controller-owned, trusted fixtures; not safe for real submissions."""
    contract=next(t for t in CONTRACT['tasks'] if t['id']==task)
    try:
        current=hashes(root)
        allowed=lambda name:any(name==x or x.endswith('/') and name.startswith(x) for x in contract['allowed'])
        changed={k for k in set(baseline)|set(current) if baseline.get(k)!=current.get(k)}
        need(all(allowed(k) for k in changed),'protected-state')
        # Fresh compilation cache per process; hidden cases never enter agent mount.
        result=subprocess.run(['node',str(HERE/'comparison-verify.cjs'),str(root),task,'--trusted-fixture-qualification','--original-root',str(origin)],capture_output=True,text=True,timeout=90,env={'PATH':os.environ.get('PATH',''),'NODE_NO_WARNINGS':'1'})
        current=hashes(root)
        changed={k for k in set(baseline)|set(current) if baseline.get(k)!=current.get(k)}
        need(all(allowed(k) for k in changed),'protected-state-after-verification')
        if result.returncode!=0:
            try:category=json.loads(result.stderr.strip().splitlines()[-1])['category']
            except (ValueError,KeyError,IndexError):category='infrastructure-error'
            if category not in CONTRACT['failureTaxonomy']:category='infrastructure-error'
            return dict(passed=False,category=category,protectedChecks=True,functionalChecks=False)
        return dict(passed=True,category='trusted-fixture-qualified-only',protectedChecks=True,functionalChecks=True,submissionAcceptance=False)
    except subprocess.TimeoutExpired:return dict(passed=False,category='timeout',protectedChecks=None,functionalChecks=False)
    except (OSError,subprocess.SubprocessError):return dict(passed=False,category='infrastructure-error',protectedChecks=None,functionalChecks=False)
    except ValueError:return dict(passed=False,category='protected-state',protectedChecks=False,functionalChecks=False)

def export_suite(source,dest,image,limits):
    dest=Path(dest);need(not dest.exists(),'Fresh export required');dest.mkdir()
    for task in CONTRACT['tasks']:
        base=dest/task['id'];base.mkdir();(base/'environment').mkdir();(base/'tests').mkdir()
        reset(source,base/'environment/fixtures',task['id'])
        (base/'instruction.md').write_text('Work in /app. Read TASK.md. No live app or network access.\n'+task['goal']+'\n')
        (base/'environment/Dockerfile').write_text('FROM '+image+'\nWORKDIR /app\nCOPY fixtures/ /app/\n')
        (base/'task.toml').write_text('version = "1.0"\n[metadata]\nsplit = "development"\ndifficulty = "hard"\n[agent]\ntimeout_sec = '+str(limits['timeoutSec'])+'\n[verifier]\ntimeout_sec = '+str(limits['verifierTimeoutSec'])+'\n[environment]\ncpus = 2\nmemory_mb = 4096\nstorage_mb = 4096\n')
        for name in ('comparison-verify.cjs','comparison-loader.cjs'):shutil.copyfile(HERE/name,base/'tests'/name)
        for name in ('desktop/src/main/update-manifest-verify.ts','desktop/src/main/harness/context-settings-store.ts'):
            target=base/'tests/original'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(Path(source)/name,target)
        # Only a protected-state hash map, no expected outputs, enters verifier-only mount.
        (base/'tests/baseline-manifest.json').write_text(json.dumps(hashes(base/'environment/fixtures')))
        (base/'tests/contract.json').write_text(json.dumps(task))
        (base/'tests/test.sh').write_text('#!/bin/sh\nmkdir -p /logs/verifier\nif node /tests/comparison-verify.cjs /app '+task['id']+' --protected; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi\n')
        (base/'tests/test.sh').chmod(0o755)
