import json,glob,sys
kind=sys.argv[1]; lim=int(sys.argv[2]) if len(sys.argv)>2 else 3; fa=sys.argv[3] if len(sys.argv)>3 else None
n=0
for f in sorted(glob.glob('/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/store-review-6/out/*.jsonl')):
    for l in open(f):
        try: d=json.loads(l)
        except: continue
        if d['kind']==kind and (fa is None or d['fault'].startswith(fa)):
            print('SEED',d['seed'],d['kind'],d['detail'][:300]); print(' FAULT',d['fault']); print('\n'.join('   '+t for t in d['trace'][-int(sys.argv[4] if len(sys.argv)>4 else 14):])); n+=1
            if n>=lim: sys.exit()
