import json,glob,sys,collections
tag=sys.argv[1]; c=collections.defaultdict(list)
for f in glob.glob(f'/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-6/out/{tag}-*.jsonl'):
    for l in open(f):
        try: d=json.loads(l)
        except: continue
        c[(d['sev'],d['kind'])].append(d)
for k,v in sorted(c.items()):
    fc=collections.Counter(x['fault'].split(' ')[0] for x in v)
    print(k,len(v),dict(fc.most_common(5)),'seeds',[x['seed'] for x in v[:4]])
