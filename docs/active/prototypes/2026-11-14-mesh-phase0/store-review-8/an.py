import json,collections,re,sys
for f in sys.argv[1:]:
    c=collections.defaultdict(collections.Counter); out=collections.Counter(); seeds=collections.defaultdict(list)
    try:
        for l in open(f+'.jsonl.detail'):
            d=json.loads(l); fa=re.sub(r' .*','',d['fault']); c[d['kind']][fa]+=1; seeds[(d['kind'],fa)].append(d['seed'])
    except FileNotFoundError: pass
    for l in open(f+'.jsonl'):
        d=json.loads(l); o=d['outcome']
        out['flag' if 'flag(' in o else 'err' if ('Err' in o or 'refused' in o) else 'clean']+=1
    print('==',f,dict(out))
    for k,v in c.items(): print(' ',k,dict(v), {a:seeds[(k,a)][:3] for a in v})
