"""Controller containment, NOT qualified task acceptance.

Docker provides host isolation, not trusted observations of submitted in-memory
side effects. A compromised worker can forge perfectly framed expected values.
All submission acceptance remains unverified/reward zero. No vm/worker sandbox
or captured builtin references are claimed as a fix.
"""
import base64
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import comparison_tasks as tasks

HERE=Path(__file__).resolve().parent
MAX_OUTPUT=262144

def need(ok,message):
    if not ok:raise ValueError(message)

def relative(name):
    need(isinstance(name,str) and name and not Path(name).is_absolute() and '\\' not in name and all(p not in ('','.','..') for p in name.split('/')),'escaped path')
    return name

def safe_copy(source,destination,*,deadline=None):
    from bounded_inputs import copy as bounded_copy
    return bounded_copy(source,destination,deadline=deadline)

def observation_boundary():
    # WHY: JSON framing authenticates no facts about in-memory side effects.
    # Submitted JS can patch serialization/fs and forge unchanged/config/counts.
    # Capturing builtins or moving to vm/workers is not an adversarial boundary.
    return dict(qualified=False,reason='Independent in-memory side-effect observation/enforcement is not implemented; worker frames are untrusted, including unchanged, config and mutations')

def decode(output,request):
    need(len(output.encode())<=MAX_OUTPUT,'protocol output bound')
    def unique(pairs):
        value={}
        for key,item in pairs:
            need(key not in value,'duplicate protocol key');value[key]=item
        return value
    try:frame=json.loads(output,object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))
    except (json.JSONDecodeError,UnicodeError):raise ValueError('incomplete or forged executor protocol')
    need(isinstance(frame,dict) and frame.get('id')==request['id'] and type(frame.get('ok')) is bool,'incomplete or forged executor protocol')
    need(set(frame)==({'id','ok','value'} if frame['ok'] else {'id','ok','error'}),'unexpected protocol fields')
    if not frame['ok']:
        error=frame['error']
        need(isinstance(error,dict) and set(error)=={'name','code'} and isinstance(error['name'],str) and (error['code'] is None or isinstance(error['code'],str)),'invalid error observation')
    return frame['value'] if frame['ok'] else Rejected(frame['error'])

class Rejected:
    def __init__(self,error):self.error=error

def container_args(image,name,source,adapter):
    need(re.fullmatch(r'sha256:[a-f0-9]{64}',image),'resolved local image ID required')
    return ['create','--interactive','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65534:65534','--pids-limit=64','--memory=512m','--memory-swap=512m','--cpus=1','--ulimit','nofile=128:128','--ulimit','fsize=1048576:1048576','--log-driver=none','--tmpfs','/work:rw,nosuid,nodev,size=128m,mode=1777','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777','--mount','type=bind,src='+str(source)+',dst=/input,readonly','--mount','type=bind,src='+str(adapter)+',dst=/adapter,readonly','--env','HOME=/tmp','--env','PATH=/usr/local/bin:/usr/bin:/bin','--env','NODE_NO_WARNINGS=1','--entrypoint','/bin/sh',image,'-c','cp -R /input/. /work/ && cd /work && exec env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp NODE_NO_WARNINGS=1 node /adapter/submission-executor.cjs']

class DockerExecutor:
    """One fresh container per call; no controller files ever enter its mounts."""
    def __init__(self,image,docker=('docker',),timeout=12):
        self.image=image;self.docker=list(docker);self.timeout=timeout;self.evidence=[]
    def command(self,args,**kwargs):
        return subprocess.run(self.docker+args,env={'PATH':os.environ.get('PATH',''),'HOME':'/tmp'},capture_output=True,text=True,timeout=kwargs.pop('timeout',30),**kwargs)
    def call(self,root,op,*,deadline=None,**fields):
        from bounded_inputs import end,tick
        deadline=end(deadline);tick(deadline)
        request=dict(id=secrets.token_hex(24),op=op,**fields)
        def command(args):
            tick(deadline)
            return self.command(args,timeout=max(.001,min(30,deadline-time.monotonic())))
        with tempfile.TemporaryDirectory(prefix='yc-executor-') as tmp:
            private=Path(tmp);private.chmod(0o755);source=private/'input';safe_copy(root,source,deadline=deadline);tick(deadline)
            adapter=private/'adapter';adapter.mkdir(mode=0o755)
            for n in ('submission-executor.cjs','comparison-loader.cjs'):shutil.copyfile(HERE/n,adapter/n);(adapter/n).chmod(0o644)
            name='yc-accept-'+secrets.token_hex(12);created=False;started=time.monotonic()
            try:
                r=command(container_args(self.image,name,source,adapter));need(r.returncode==0,'isolated executor create failed: '+r.stderr[:500]);created=True
                info=command(['inspect',name]);need(info.returncode==0,'executor inspect failed')
                cfg=json.loads(info.stdout)[0];h=cfg['HostConfig']
                need(h['ReadonlyRootfs'] and h['NetworkMode']=='none' and h['Privileged'] is False and h['CapDrop']==['ALL'] and cfg['Config']['User']=='65534:65534','executor capability drift')
                need(all(not m['RW'] for m in cfg['Mounts'] if m['Type']=='bind'),'writable host root refused')
                # Drain bounded pipes without buffering hostile output in host memory.
                import selectors
                child=subprocess.Popen(self.docker+['start','-a','-i',name],env={'PATH':os.environ.get('PATH',''),'HOME':'/tmp'},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                try:
                    child.stdin.write(json.dumps(request).encode());child.stdin.close()
                    streams=selectors.DefaultSelector();streams.register(child.stdout,selectors.EVENT_READ);streams.register(child.stderr,selectors.EVENT_READ)
                    data={child.stdout:bytearray(),child.stderr:bytearray()};deadline=min(deadline,time.monotonic()+self.timeout)
                    while streams.get_map():
                        need(time.monotonic()<deadline,'executor timeout')
                        for key,_ in streams.select(max(0,min(.2,deadline-time.monotonic()))):
                            chunk=os.read(key.fileobj.fileno(),8192)
                            if not chunk:streams.unregister(key.fileobj);continue
                            data[key.fileobj].extend(chunk);need(sum(map(len,data.values()))<=MAX_OUTPUT,'executor output bound')
                    child.wait(timeout=2);need(child.returncode==0,'executor exited without completion: '+data[child.stderr].decode(errors='replace')[:500])
                    state=json.loads(command(['inspect',name]).stdout)[0]['State'];need(state['ExitCode']==0 and not state['OOMKilled'],'executor failed/OOM')
                    return decode(data[child.stdout].decode(),request)
                finally:
                    if child.poll() is None:child.kill();child.wait()
                    child.stdout.close();child.stderr.close()
            finally:
                if created:
                    result=self.command(['rm','-f',name]);need(result.returncode==0,'executor cleanup failed')
                self.evidence.append(dict(op=op,image=self.image,elapsedSec=time.monotonic()-started,cleanup=created))

def expected_migration(c):
    need(isinstance(c,dict),'config object')
    n=c.get('native');n=n if isinstance(n,dict) else {}
    p=n.get('context');p=p if isinstance(p,dict) else {}
    need('version' not in p or p['version']==2,'future version')
    p=p.get('providers',{}) if p.get('version')==2 else p;p=p if isinstance(p,dict) else {}
    return {**c,'native':{**n,'context':{'version':2,'providers':{k:'long' if p.get(k)=='long' else 'standard' for k in ('openrouter','chatgpt')}}}}

PRODUCTS=[('east-small','east',80,4,22,30,17,3),('west-small','west',70,4,22,45,13,3),('east-large','east',160,8,24,30,29,2),('west-large','west',150,8,24,45,27,2)]
def measure(plan,w):
    seen=set();capacity=cost=count=0;regions={'east':0,'west':0}
    for a in plan['allocations']:
        need(isinstance(a,dict) and a.get('sku') not in seen,'duplicate allocation');seen.add(a.get('sku'))
        p=next((p for p in PRODUCTS if p[0]==a.get('sku')),None);n=a.get('count')
        need(p and type(n) is int and 1<=n<=p[7] and p[3]>=w['minMemoryGiB'] and p[4]>=w['runtime'] and p[5]<=w['maxLatencyMs'],'invalid allocation')
        capacity+=n*p[2];cost+=n*p[6]*((w['durationMinutes']+59)//60);count+=n;regions[p[1]]+=n*p[2]
    need(cost<=w['budgetCents'] and capacity>=w['demandRps'] and all(capacity-r>=w['failoverRps'] for r in regions.values()),'infeasible plan')
    return cost,count,capacity

def optimum(w):
    best=None;result=None
    for counts in itertools.product(*(range(p[7]+1) for p in PRODUCTS)):
        p={'allocations':[{'sku':row[0],'count':n} for row,n in zip(PRODUCTS,counts) if n]}
        try:cost,count,capacity=measure(p,w)
        except ValueError:continue
        if best is None or (cost,count)<best:best=(cost,count);result={**p,'costCents':cost,'capacityRps':capacity}
    return result or {'infeasible':True}

def check_plan(p,w):
    best=optimum(w)
    if best=={'infeasible':True}:need(p==best,'expected infeasible');return
    cost,count,capacity=measure(p,w);expected=measure(best,w)
    need(p.get('costCents')==cost and p.get('capacityRps')==capacity and (cost,count)==expected[:2],'nonoptimal plan or false totals')

def functional(root,task,executor):
    # Diagnostic algorithm retained for review, not a qualification oracle.
    # No call may treat compromised-worker side-effect fields as trusted.
    need(observation_boundary()['qualified'],'unverified observation boundary')
    call=lambda op,**kw:executor.call(root,op,**kw)
    rejected=lambda v:isinstance(v,Rejected)
    def result(v):need(not rejected(v),'unexpected rejection');return v
    test=result(call('test'));need(test['status']==0,'submitted regression tests failed')
    if task==tasks.IDS[0]:
        good={'version':' v9.2.0 ','assets':[{'name':'z.exe','sha256':'A'*64,'size':0},{'name':'a.deb','sha256':'b'*64,'size':42}]}
        need(result(call('parse',value=good))=={'version':'9.2.0','assets':[good['assets'][1],{**good['assets'][0],'sha256':'a'*64}]},'manifest normalization')
        bad=[None,[],{}, {**good,'version':''},{**good,'assets':[]}]
        bad += [{**good,'assets':[{**good['assets'][0],'size':v}]} for v in [-1,1.5,9007199254740992,'2',None]]
        bad += [{**good,'assets':[{**good['assets'][0],'name':v}]} for v in ['', '.', '..','../x','a/b','a\\b']]
        bad += [{**good,'assets':[good['assets'][0]]*2},{**good,'assets':[{**good['assets'][0],'sha256':'bad'}]}]
        for value in bad:
            v=call('parse',value=value);need(rejected(v) and v.error.get('code')=='verify-failed','invalid manifest accepted')
        b64=lambda b:base64.b64encode(b).decode()
        assets={'z.exe':b64(b'release-z'),'a.deb':b64(b'release-a')}
        manifest={'version':'9.2.0','assets':[{'name':n,'sha256':hashlib.sha256(base64.b64decode(b)).hexdigest(),'size':len(base64.b64decode(b))} for n,b in sorted(assets.items())]}
        need(result(call('build',assets=assets,version='v9.2.0'))==manifest,'publisher output')
        for version in [None,4,'','   ']:need(rejected(call('build',assets=assets,version=version)),'invalid publisher version')
        # Keys/signatures originate in the trusted controller. Only the final,
        # fresh signing-CLI container receives the throwaway private key; earlier
        # verification calls receive only the public key and signed test bytes.
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives import serialization
        from cryptography.exceptions import InvalidSignature
        key=Ed25519PrivateKey.generate();public=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        raw=json.dumps(manifest).encode();sig=key.sign(raw)
        original={'fileName':'a.deb','manifestBytes':b64(raw),'signatureBytes':b64(sig),'tag':'v9.2.0','currentVersion':'9.1.0','publicKeyPem':public}
        need(result(call('verify',input=original,bytes=assets['a.deb'])) is None,'good signature rejected')
        for change in [{'tag':'v9.2.1'},{'currentVersion':'9.2.0'},{'signatureBytes':b64(bytes(64))},{'manifestBytes':b64(raw+b' ')}]:need(rejected(call('verify',input={**original,**change},bytes=assets['a.deb'])),'verification bypass')
        wrong=json.loads(raw);wrong['assets'][0]['size']+=1;wrongraw=json.dumps(wrong).encode()
        need(rejected(call('verify',input={**original,'manifestBytes':b64(wrongraw),'signatureBytes':b64(key.sign(wrongraw))},bytes=assets['a.deb'])),'size bypass')
        need(rejected(call('verify',input=original,bytes=b64(b'Xelease-a'))),'hash bypass')
        private=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode()
        signed=result(call('sign',assets=assets,version='v9.2.0',key=private));need(signed['result']['status']==0,'signing CLI failed')
        signedraw=base64.b64decode(signed['manifest']);need(json.loads(signedraw)==manifest,'CLI manifest')
        try:key.public_key().verify(base64.b64decode(signed['signature']),signedraw)
        except InvalidSignature:raise ValueError('CLI signature invalid')
    elif task==tasks.IDS[1]:
        legacy={'theme':'keep','native':{'other':7,'context':{'openrouter':'long','chatgpt':'bad'}}};migrated=expected_migration(legacy)
        for c in [legacy,migrated,{}, {'native':{'context':{'chatgpt':'long'}}}]:
            v=result(call('migrate',value=c));need(v=={'result':expected_migration(c),'unchanged':True},'migration output/mutation')
        for c in [None,[],3,{'native':{'context':{'version':3}}}]:need(rejected(call('migrate',value=c)),'invalid migration accepted')
        v=result(call('store',config=migrated,patches=[None,[],{'other':'long'},{'chatgpt':'bogus'}]));need(v['mutations']==0 and all(not x['ok'] for x in v['results']),'invalid patches mutated state')
        c={'extra':44,'native':{'other':5,'context':{'chatgpt':'long'}}}
        v=result(call('store',config=c,patches=[{'openrouter':'long'},{'chatgpt':'standard'}]));need(v['config']==expected_migration({**c,'native':{'other':5,'context':{'openrouter':'long','chatgpt':'standard'}}}),'concurrent merge')
        v=result(call('store',config=migrated,patches=[{'chatgpt':'long'}],mutatePatch=True));need(v['final']['chatgpt']=='long','patch alias')
        for args,expected in [(['chatgpt',{'contextLength':272000,'maxContextLength':1100000},{'version':2,'providers':{'chatgpt':'long'}}],1100000),(['chatgpt',{'contextLength':272000,'maxContextLength':1100000},{'version':2,'providers':{'chatgpt':'standard'}}],272000),(['local',{'contextLength':272000,'maxContextLength':1100000},{'version':2,'providers':{'chatgpt':'long'}}],272000),(['openrouter',{'contextLength':2000000},{'version':2,'providers':{'openrouter':'long'}}],1200000),(['chatgpt',None,{'chatgpt':'long'}],None)]:need(result(call('cloud',args=args))==expected,'cloud consumer')
        batch=[legacy,migrated,{}, {'id':'duplicate','native':{'context':{'chatgpt':'long'}}},{'id':'duplicate','native':{'context':{'version':2,'providers':{'openrouter':'long'}}}}]
        v=result(call('batch',value=batch));need(v['result']['status']==0 and v['inputUnchanged'] and json.loads(v['output'])==[expected_migration(c) for c in batch],'batch conversion')
        again=result(call('batch',value=json.loads(v['output'])));need(again['output']==v['output'],'batch idempotency')
        v=result(call('batch',value=batch,existing=True));need(v['result']['status']!=0 and v['output']=='keep','exclusive output')
        v=result(call('batch',value=[legacy,{'native':{'context':{'version':9}}}]));need(v['result']['status']!=0 and v['output'] is None,'atomic invalid batch')
    elif task==tasks.IDS[2]:
        evidence=json.loads((root/'submission/evidence.json').read_text());need(isinstance(evidence,list),'evidence list')
        for name in ['catalog-current','billing-current','runtime-current','deprecation']:need(any(e.get('document')==name and isinstance(e.get('quote'),str) and len(e['quote'])>=30 and e['quote'] in tasks.CORPUS[name]['body'] for e in evidence),'citation missing')
        for e in evidence:need(e.get('document') in tasks.CORPUS and not e['document'].endswith('v1') and e.get('quote') in tasks.CORPUS[e['document']]['body'],'false citation')
        receipts=[json.loads(s) for s in (root/'research-receipts.jsonl').read_text().splitlines()]
        need(any(r['action']=='search' for r in receipts) and any(r['action']=='fetch' for r in receipts),'retrieval receipts missing')
        for r in receipts:
            need(r['track']=='synthetic-controlled-retrieval-v1' and isinstance(r['query'],str) and r['query'],'retrieval provenance')
            for d in r['results']:need(d['bodySha256']==hashlib.sha256(tasks.CORPUS[d['id']]['body'].encode()).hexdigest(),'retrieval hash')
        w=tasks.WORKLOAD;check_plan(json.loads((root/'submission/plan.json').read_text()),w)
        variants=[w,*[{**w,'demandRps':d,'failoverRps':d//3} for d in [0,45,80,170,320,650,1000]]]
        for k,values in [('budgetCents',[0,90,500]),('minMemoryGiB',[8,16]),('runtime',[24,26]),('maxLatencyMs',[29,35]),('durationMinutes',[1,60,120,121])]:variants.extend({**w,k:v} for v in values)
        for w in variants:
            v=result(call('planner',value=w));need(v['status']==0,'planner failed');check_plan(json.loads(v['stdout']),w)
    else:raise ValueError('unknown task')

def verify(root,task,baseline,origin,executor,*,deadline=None):
    from bounded_inputs import end,tick
    started=time.monotonic();deadline=end(deadline)
    try:
        tick(deadline)
        contract=next(t for t in tasks.CONTRACT['tasks'] if t['id']==task)
        current=tasks.hashes(root,deadline=deadline)
        allowed=lambda n:any(n==a or a.endswith('/') and n.startswith(a) for a in contract['allowed'])
        need(all(allowed(n) for n in set(baseline)|set(current) if baseline.get(n)!=current.get(n)),'protected-state')
        tick(deadline)
        # No executor call: even a perfectly shaped response with the expected
        # return value cannot attest to input purity, mutation counts or writes.
        return dict(passed=False,reward=0,submissionAcceptance=False,category='unverified-observation-boundary',reason=observation_boundary()['reason'],protectedChecks=True,functionalChecks=None,providerCalls=0,elapsedSec=time.monotonic()-started)
    except (ValueError,OSError,KeyError,TypeError,StopIteration) as error:
        return dict(passed=False,reward=0,submissionAcceptance=False,category='timeout' if 'deadline' in str(error) else 'protected-state',reason=str(error)[:500],protectedChecks=False,functionalChecks=None,providerCalls=0,elapsedSec=time.monotonic()-started)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',required=True);p.add_argument('--task',required=True,choices=tasks.IDS)
    p.add_argument('--baseline',required=True);p.add_argument('--origin',required=True)
    p.add_argument('--image',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();out=Path(a.out);need(not out.exists(),'fresh trusted verdict output required')
    baseline=json.loads(Path(a.baseline).read_text())
    verdict=tasks.verify_against(Path(a.root),a.task,baseline,Path(a.origin),executor=DockerExecutor(a.image))
    with out.open('x') as stream:json.dump(verdict,stream,sort_keys=True)
    print(json.dumps(verdict));raise SystemExit(0 if verdict['passed'] else 1)
