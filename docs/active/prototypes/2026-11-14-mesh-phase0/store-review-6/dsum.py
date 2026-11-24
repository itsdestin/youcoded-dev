import json,glob,collections,re
c=collections.Counter(); ex={}
for f in glob.glob('/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-6/out/big-*.jsonl'):
    for l in open(f):
        try: d=json.loads(l)
        except: continue
        if d['sev']!='DATA': continue
        fl=re.sub(r'[0-9a-f]{8,}','H',d['fault']); fl=re.sub(r'v=\w+','',fl); fl=re.sub(r'snapAcked=\S+|hwNoted=\S+','',fl)
        k=(d['kind'],fl.strip()[:90]); c[k]+=1; ex.setdefault(k,[]).append(d['seed'])
for k,v in c.most_common(): print(v,k,ex[k][:4])
