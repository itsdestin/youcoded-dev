import subprocess,shutil,os,sys,json,glob,re,collections
S='/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-6'
D='/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop'
sys.path.insert(0,S)
from mutations import M
only=sys.argv[1:] 
res={}
for (mid,f,old,new,what) in M:
    if only and mid not in only: continue
    for x in glob.glob(S+'/mut/work/*.ts'): os.remove(x)
    for x in glob.glob(S+'/mut/orig/*.ts'): shutil.copy(x,S+'/mut/work/')
    p=S+'/mut/work/'+f; s=open(p).read(); assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
    env=dict(os.environ,TMPDIR=S+'/tmp')
    r=subprocess.run(['npx','vitest','run','-c',S+'/vitest.mut.config.mjs'],cwd=D,env=env,capture_output=True,text=True,timeout=600)
    out=r.stdout+r.stderr
    m=re.search(r'Tests\s+(?:(\d+) failed \| )?(\d+) passed',out); failed=int(m.group(1) or 0) if m else -1
    # my fuzz on the mutant
    tag='m_'+mid.replace('-','_')
    for x in glob.glob(S+f'/out/{tag}-*'): os.remove(x)
    env2=dict(os.environ,R6_SRC=S+'/mut/work')
    subprocess.run([S+'/shard.sh','1','8000','5',tag],env=env2,capture_output=True,timeout=1200)
    kinds=collections.Counter()
    for fn in glob.glob(S+f'/out/{tag}-*.jsonl'):
        for l in open(fn):
            try: d=json.loads(l)
            except: continue
            if d['sev']=='INFO': continue
            if 'tails/' in d['fault'] and d['kind'] in ('SILENT-SHRINK','tail-vanished'): continue
            kinds[d['kind']]+=1
    res[mid]={'repo_failed':failed,'fuzz':dict(kinds),'what':what}
    print(mid,json.dumps(res[mid]),flush=True)
    open(S+'/out/mutation_results.json','w').write(json.dumps(res,indent=1))
