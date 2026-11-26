import json, sys, collections, glob, re
S = '/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/replicator-review-1'
files = sys.argv[1:] or sorted(glob.glob(S + '/fz-b*.jsonl'))
seeds = 0; ops = 0; cats = collections.Counter(); ex = collections.defaultdict(list); agg = collections.Counter()
for f in files:
    for l in open(f):
        d = json.loads(l)
        if d.get('summary'):
            for k, v in d['agg'].items(): agg[k] += v
            continue
        seeds += 1; ops += d['ops']
        diag = [t for t in (d.get('trail') or []) if t.startswith('DIAG ') and 'error' not in t[:12]]
        # reclassify non-convergence caused by a device whose own copy is damaged/refilling with no source: store limit 1 (sole copy destroyed), reported on that device
        sole = any(('refill-no-source' in t) or ('"dmg":' in t and '"dmg":null' not in t) for t in diag)
        for v in d['violations']:
            c = v['cat']
            if sole and c in ('QUIET-in-sync-but-behind-truth', 'UNNAMED-not-converged', 'DIVERGENT-lengths', 'LOUD-not-converged'): c = 'RECLASS-sole-copy-damaged(reported loud on that device)'
            cats[c] += 1; ex[c].append((d['seed'], v['msg']))
print('seeds', seeds, 'ops', ops)
print('agg ops', dict(agg))
for c, n in cats.most_common(): print(n, c, ex[c][:4])
