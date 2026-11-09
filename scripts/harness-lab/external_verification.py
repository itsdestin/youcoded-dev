"""Independent v2 external behavior checks. Does not admit paid execution."""
import base64
import hashlib
import json
from pathlib import Path
import secrets
import tempfile
import time

import comparison_tasks as tasks
from bwrap_executor import BwrapExecutor
from bounded_inputs import copy as safe_copy, end, tick
from secure_evaluation import need, expected_migration, check_plan

VERSION='substantial-development-external-v2'
CONTRACT=json.loads((Path(__file__).parent/'comparison-external-v2.json').read_text())


def parse_json(data):
    def unique(pairs):
        out={}
        for key,value in pairs:
            need(key not in out,'duplicate JSON key');out[key]=value
        return out
    return json.loads(data,object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


class Checks:
    def __init__(self,root,executor,deadline):
        self.root=root;self.executor=executor;self.deadline=deadline;self.completed=0
    def run(self,**kw):
        tick(self.deadline)
        return self.executor.run(self.root,deadline=self.deadline,**kw)
    def api(self,op,*,inputs=None,**fields):
        result=self.run(request=dict(op=op,**fields),inputs=inputs)
        need(result['status']==0,'API process failed')
        frame=parse_json(result['stdout'])
        need(isinstance(frame,dict) and type(frame.get('ok')) is bool,'missing API result')
        need(set(frame)==({'ok','value'} if frame['ok'] else {'ok','error'}),'unexpected API fields')
        self.completed+=1
        return frame,result['files']
    def good(self,op,**kw):
        frame,files=self.api(op,**kw);need(frame['ok'],'unexpected API rejection')
        return frame['value'],files
    def bad(self,op,**kw):
        frame,_=self.api(op,**kw);need(not frame['ok'],'invalid input accepted: '+op+' '+str(kw.get('value',kw.get('version',''))))
        return frame.get('error')
    def cli(self,argv,**kw):
        result=self.run(argv=argv,**kw);self.completed+=1
        return result


def regression(c,origin,task):
    good=c.cli(['/work/submission/test.cjs']);need(good['status']==0,'submitted regression tests failed: '+good['stderr'].decode(errors='replace')[:400])
    with tempfile.TemporaryDirectory(prefix='yc-regression-') as tmp:
        root=Path(tmp)/'mutant';safe_copy(c.root,root,deadline=c.deadline)
        if task==tasks.IDS[0]:name='desktop/src/main/update-manifest-verify.ts'
        elif task==tasks.IDS[1]:name='desktop/src/main/harness/context-settings-store.ts'
        else:name=None
        if name:
            # Source was bounded/staged by verify, not executed in the host.
            (root/name).write_bytes((origin/name).read_bytes())
        else:(root/'submission/planner.cjs').write_text("module.exports={solve:()=>({infeasible:true})};if(require.main===module)console.log('{}');")
        result=c.executor.run(root,argv=['/work/submission/test.cjs'],deadline=c.deadline)
        need(result['status']!=0,'regression tests did not detect original defect')
        c.completed+=1


def release(c):
    b64=lambda b:base64.b64encode(b).decode()
    token=secrets.token_hex(5)
    good={'version':' v9.2.0 ','assets':[{'name':token+'.exe','sha256':'A'*64,'size':0},{'name':'a.deb','sha256':'b'*64,'size':42}]}
    expected={'version':'9.2.0','assets':sorted([{**a,'sha256':a['sha256'].lower()} for a in good['assets']],key=lambda a:a['name'])}
    need(c.good('parse',value=good)[0]==expected,'manifest normalization')
    bad=[None,[],{}, {**good,'version':''},{**good,'version':' v '},{**good,'assets':[]},{**good,'assets':[None]}]
    bad += [{**good,'assets':[{**good['assets'][0],'size':v}]} for v in [-1,1.5,9007199254740992,'2',None]]
    bad += [{**good,'assets':[{**good['assets'][0],'name':v}]} for v in ['', '.', '..','../x','a/b','a\\b']]
    bad += [{**good,'assets':[good['assets'][0]]*2},{**good,'assets':[{**good['assets'][0],'sha256':'bad'}]}]
    for value in bad:need(c.bad('parse',value=value).get('code')=='verify-failed','wrong parser rejection')
    assets={token+'.exe':secrets.token_bytes(21),'a.deb':secrets.token_bytes(45)}
    inputs={'assets/'+n:b for n,b in assets.items()}
    manifest={'version':'9.2.0','assets':[dict(name=n,sha256=hashlib.sha256(b).hexdigest(),size=len(b)) for n,b in sorted(assets.items())]}
    need(c.good('build',inputs=inputs,version='v9.2.0')[0]==manifest,'publisher output')
    for version in [None,4,'','   ']:c.bad('build',inputs=inputs,version=version)
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization
    key=Ed25519PrivateKey.generate()
    public=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    raw=json.dumps(manifest).encode()
    original=dict(fileName='a.deb',manifestBytes=b64(raw),signatureBytes=b64(key.sign(raw)),tag='v9.2.0',currentVersion='9.1.0',publicKeyPem=public)
    need(c.good('verify',input=original,inputs={'asset':assets['a.deb']})[0] is None,'valid signature rejected')
    for change in [dict(tag='v9.2.1'),dict(currentVersion='9.2.0'),dict(signatureBytes=b64(bytes(64))),dict(manifestBytes=b64(raw+b' '))]:
        c.bad('verify',input={**original,**change},inputs={'asset':assets['a.deb']})
    c.bad('verify',input=original,inputs={'asset':b'X'+assets['a.deb'][1:]})
    wrong=json.loads(raw)
    next(a for a in wrong['assets'] if a['name']=='a.deb')['size']+=1
    wrongraw=json.dumps(wrong).encode()
    c.bad('verify',input={**original,'manifestBytes':b64(wrongraw),'signatureBytes':b64(key.sign(wrongraw))},inputs={'asset':assets['a.deb']})
    private=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
    signed=c.cli(['/work/desktop/scripts/generate-release-manifest.mjs','--dir','/output','--version','v9.2.0','--key','/inputs/key'],inputs={'key':private},existing=assets)
    need(signed['status']==0,'signing CLI failed')
    files=signed['files']
    need(all(files.get(n)==b for n,b in assets.items()),'signing CLI changed installer bytes')
    raw=files['youcoded-release.json'];need(parse_json(raw)==manifest,'signed manifest output')
    key.public_key().verify(files['youcoded-release.json.sig'],raw)


def migration(c):
    legacy={'theme':secrets.token_hex(8),'native':{'other':7,'context':{'openrouter':'long','chatgpt':'bad'}}}
    migrated=expected_migration(legacy)
    for config in [legacy,migrated,{}, {'native':{'context':{'chatgpt':'long'}}}]:
        need(c.good('migrate',value=config)[0]==expected_migration(config),'migration output')
    for config in [None,[],3,{'native':{'context':{'version':3}}}]:c.bad('migrate',value=config)
    invalid=[None,[],{'other':'long'},{'chatgpt':'bogus'}]
    raw=json.dumps(migrated).encode()
    value,files=c.good('store',config=migrated,patches=invalid,inputs={'config.json':raw})
    need(files=={'config.json':raw} and all(not x['ok'] for x in value['results']),'rejected patches changed persisted state')
    for patches in [[{'openrouter':'long'},{'chatgpt':'standard'}],[{'chatgpt':'long'},{'openrouter':'standard'}]]:
        value,files=c.good('store',patches=patches,inputs={'config.json':json.dumps(legacy).encode()})
        prefs={k:'standard' for k in ('openrouter','chatgpt')};prefs.update(expected_migration(legacy)['native']['context']['providers'])
        for p in patches:prefs.update(p)
        expected={**legacy,'native':{**legacy['native'],'context':{'version':2,'providers':prefs}}}
        need(parse_json(files['config.json'])==expected,'persisted store merge')
        need(value['final']==prefs and all(x['ok'] for x in value['results']),'store API output')
    cases=[(['chatgpt',{'contextLength':272000,'maxContextLength':1100000},{'version':2,'providers':{'chatgpt':'long'}}],1100000),(['chatgpt',{'contextLength':272000,'maxContextLength':1100000},{'version':2,'providers':{'chatgpt':'standard'}}],272000),(['local',{'contextLength':272000,'maxContextLength':1100000},{'version':2,'providers':{'chatgpt':'long'}}],272000),(['openrouter',{'contextLength':2000000},{'version':2,'providers':{'openrouter':'long'}}],1200000),(['chatgpt',None,{'chatgpt':'long'}],None)]
    # WHY: usable metadata must exercise legacy preferences too; a null model cannot expose a lost long-window setting.
    cases.extend([
        (['chatgpt',{'contextLength':272000,'maxContextLength':1100000},{'chatgpt':'long'}],1100000),
        (['openrouter',{'contextLength':2000000},{'openrouter':'long'}],1200000),
        (['chatgpt',{'contextLength':272000,'maxContextLength':1100000},{'chatgpt':'standard'}],272000),
        (['openrouter',{'contextLength':2000000},{'openrouter':'standard'}],272000),
    ])
    for args,expected in cases:need(c.good('cloud',args=args)[0]==expected,'cloud consumer')
    batch=[legacy,migrated,{}, {'id':'duplicate','native':{'context':{'chatgpt':'long'}}},{'id':'duplicate','native':{'context':{'version':2,'providers':{'openrouter':'long'}}}}]
    argv=['/work/desktop/scripts/migrate-context.cjs','/inputs/input.json','/output/output.json']
    first=c.cli(argv,inputs={'input.json':json.dumps(batch).encode()})
    need(first['status']==0 and parse_json(first['files']['output.json'])==[expected_migration(x) for x in batch],'batch migration')
    data=first['files']['output.json'];need(data.endswith(b'\n') and data==json.dumps(parse_json(data),ensure_ascii=False,indent=2).encode()+b'\n','pretty deterministic JSON')
    again=c.cli(argv,inputs={'input.json':data});need(again['status']==0 and again['files']==first['files'],'batch idempotency')
    existing=c.cli(argv,inputs={'input.json':data},existing={'output.json':b'keep'})
    need(existing['status']!=0 and existing['files']=={'output.json':b'keep'},'exclusive output')
    for value in [[legacy,{'native':{'context':{'version':9}}}],None,{}]:
        failed=c.cli(argv,inputs={'input.json':json.dumps(value).encode()})
        need(failed['status']!=0 and not failed['files'],'atomic invalid batch')


def research(c):
    evidence=parse_json((c.root/'submission/evidence.json').read_bytes());need(isinstance(evidence,list),'evidence list')
    for name in ['catalog-current','billing-current','runtime-current','deprecation']:
        need(any(e.get('document')==name and isinstance(e.get('quote'),str) and len(e['quote'])>=30 and e['quote'] in tasks.CORPUS[name]['body'] for e in evidence),'citation missing')
    for e in evidence:need(e.get('document') in tasks.CORPUS and not e['document'].endswith('v1') and e.get('quote') in tasks.CORPUS[e['document']]['body'],'false citation')
    receipts=[parse_json(line) for line in (c.root/'research-receipts.jsonl').read_bytes().splitlines()]
    need(any(r['action']=='search' for r in receipts) and any(r['action']=='fetch' for r in receipts),'retrieval receipts missing')
    for r in receipts:
        need(r['track']=='synthetic-controlled-retrieval-v1' and isinstance(r['query'],str) and r['query'],'retrieval provenance')
        for d in r['results']:need(d['bodySha256']==hashlib.sha256(tasks.CORPUS[d['id']]['body'].encode()).hexdigest(),'retrieval hash')
    check_plan(parse_json((c.root/'submission/plan.json').read_bytes()),tasks.WORKLOAD)
    w=tasks.WORKLOAD
    variants=[w,*[{**w,'demandRps':d,'failoverRps':d//3} for d in [0,45,80,170,320,650,1000,int(secrets.randbelow(800))]]]
    for k,values in [('budgetCents',[0,90,500]),('minMemoryGiB',[8,16]),('runtime',[24,26]),('maxLatencyMs',[29,35]),('durationMinutes',[1,60,120,121])]:variants.extend({**w,k:v} for v in values)
    for value in variants:
        # stdin belongs to the CLI, not a wrapper claiming its status/stdout.
        r=c.cli(['/work/submission/planner.cjs'],request=value)
        need(r['status']==0,'planner process failed');check_plan(parse_json(r['stdout']),value)


def verify(root,task,baseline,origin,executor,*,deadline=None,submission_modes=None):
    started=time.monotonic();deadline=end(deadline);completed=0
    try:
        need(type(executor) is BwrapExecutor,'explicit bwrap executor required')
        need(task in tasks.IDS,'unknown task')
        allowed=next(t['allowed'] for t in tasks.CONTRACT['tasks'] if t['id']==task)
        with tempfile.TemporaryDirectory(prefix='yc-external-') as tmp:
            staged=Path(tmp)/'submission';safe_copy(Path(root),staged,deadline=deadline,preserve_modes=True)
            if submission_modes is not None:
                # Private snapshots are deliberately 0400. Compare the validated
                # TAR source modes, not those controller-imposed freeze bits.
                actual=tasks.hashes(staged,deadline=deadline)
                need(set(submission_modes)==set(actual),'snapshot mode inventory mismatch')
                for name,mode in submission_modes.items():
                    need(type(mode) is int and 0<=mode<=0o777,'snapshot mode invalid')
                    (staged/name).chmod(mode)
            original=Path(tmp)/'original';safe_copy(Path(origin),original,deadline=deadline)
            current=tasks.hashes(staged,deadline=deadline)
            differences=[dict(path=n,fields=[field for field in ('sha256','mode') if (baseline.get(n) or {}).get(field)!=(current.get(n) or {}).get(field)],
                              beforeMode=(baseline.get(n) or {}).get('mode'),afterMode=(current.get(n) or {}).get('mode'))
                         for n in sorted(set(baseline)|set(current)) if baseline.get(n)!=current.get(n) and
                         not any(n==a or a.endswith('/') and n.startswith(a) for a in allowed)]
            need(not differences,'protected-state')
            c=Checks(staged,executor,deadline)
            regression(c,original,task)
            {tasks.IDS[0]:release,tasks.IDS[1]:migration,tasks.IDS[2]:research}[task](c)
            completed=c.completed
            need(tasks.hashes(staged,deadline=deadline)==current,'protected-state-after-verification')
        return dict(passed=True,reward=1,submissionAcceptance=True,category='external-functional',contractVersion=VERSION,backend='bwrap',protectedChecks=True,functionalChecks=True,completedChecks=completed,matrixQualified=False,providerCalls=0,elapsedSec=time.monotonic()-started)
    except Exception as error:
        return dict(passed=False,reward=0,submissionAcceptance=False,category='timeout' if 'deadline' in str(error) else 'external-functional-failure',contractVersion=VERSION,backend='bwrap',functionalChecks=False,completedChecks=c.completed if 'c' in locals() else 0,reason=str(error)[:500],protectedDifferences=differences[:20] if 'differences' in locals() else [],matrixQualified=False,providerCalls=0,elapsedSec=time.monotonic()-started)


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',required=True);p.add_argument('--task',required=True,choices=tasks.IDS)
    p.add_argument('--baseline',required=True);p.add_argument('--origin',required=True)
    p.add_argument('--backend',required=True,choices=['bwrap'])
    p.add_argument('--contract-version',required=True,choices=[VERSION]);p.add_argument('--out',required=True)
    args=p.parse_args()
    result=tasks.verify_against(Path(args.root),args.task,parse_json(Path(args.baseline).read_bytes()),Path(args.origin),executor=BwrapExecutor(),backend=args.backend,contract_version=args.contract_version)
    with Path(args.out).open('x') as output:json.dump(result,output,indent=2);output.write('\n')
    print(json.dumps(result))
    raise SystemExit(0 if result['passed'] else 2)
