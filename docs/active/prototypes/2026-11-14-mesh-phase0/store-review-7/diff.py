import json,sys,collections
def load(f):
    d={}
    for l in open(f):
        x=json.loads(l); d[x['seed']]=x
    return d
o=load(sys.argv[1]); n=load(sys.argv[2])
cats=collections.Counter()
for s in sorted(n):
    a=set(k for k in o[s]['kinds'] if k.startswith('DATA')); b=set(k for k in n[s]['kinds'] if k.startswith('DATA'))
    if a!=b:
        cats[(tuple(sorted(a-b)),tuple(sorted(b-a)),n[s]['fault'][:12])]+=1
        if len(sys.argv)>3: print(s,o[s]['fault'],'| old',sorted(a),o[s]['outcome'],'| new',sorted(b),n[s]['outcome'])
for k,v in cats.most_common(): print(v,k)
print('old DATA seeds',sum(1 for s in o if any(k.startswith('DATA') for k in o[s]['kinds'])),'new',sum(1 for s in n if any(k.startswith('DATA') for k in n[s]['kinds'])))
