import subprocess,shutil,os,sys,json,glob,collections
S='/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-6'
sys.path.insert(0,S); from mutations import M
Mm={m[0]:m for m in M}
T=[('M1-park-id','park','sibling,swap,flip'),('M2-park-linehash','park','sibling,swap,flip'),('M3-env-version','none','foreign,sibling'),('M4-env-role','none','sibling,foreign,swap'),('M5-env-id','tail','sibling,swap,foreign'),('M6-hw-ladder','none','rbExact,rbPartial,older'),('M7-hw-nolower','none','rbExact,rbOverlay'),('M10-ck-boundary','evict2','flip,zerorange,older,sibling,overwrite'),('M12-tail-done-guard','tail','delete'),('M13-tail-readdone','tail','delete')]
res={}
for mid,prep,faults in T:
    mid_,f,old,new,what=Mm[mid]
    for x in glob.glob(S+'/mut/work/*.ts'): os.remove(x)
    for x in glob.glob(S+'/mut/orig/*.ts'): shutil.copy(x,S+'/mut/work/')
    p=S+'/mut/work/'+f; s=open(p).read(); open(p,'w').write(s.replace(old,new))
    tag='g_'+mid.replace('-','_')
    env=dict(os.environ,R6_SRC=S+'/mut/work',R6_FAULTS=faults)
    if prep!='none': env['R6_PREP']=prep
    subprocess.run([S+'/shard.sh','1','4000','5',tag],env=env,capture_output=True,timeout=1800)
    kinds=collections.Counter()
    for fn in glob.glob(S+f'/out/{tag}-*.jsonl'):
        for l in open(fn):
            try: d=json.loads(l)
            except: continue
            if d['sev']=='INFO': continue
            if 'tails/' in d['fault'] and d['kind'] in ('SILENT-SHRINK','tail-vanished'): continue
            kinds[d['kind']]+=1
    res[mid]=dict(kinds); print(mid,prep,faults,dict(kinds),flush=True)
    open(S+'/out/targeted_results.json','w').write(json.dumps(res,indent=1))
