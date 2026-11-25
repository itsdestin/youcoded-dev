import json,sys,collections,glob
files=sys.argv[1:]
stats=collections.Counter(); n=0; viols=collections.Counter(); byfault=collections.defaultdict(collections.Counter); fk=collections.Counter()
ex={}
for f in files:
  for l in open(f):
    d=json.loads(l); n+=1
    for k,v in (d.get('stats') or {}).items(): stats[k]+=v
    for v in d['viols']:
        viols[v]+=1
        ex.setdefault(v,[]).append((d['seed'],d['fault']))
    fk[d.get('faultKind')]+=1
    for o in d['outcomes']:
        p=o.split('|')
        if p[0]!='first': continue
        kind=p[3]
        if kind=='intact' or kind=='retired-ok': k2='intact'
        elif kind.startswith('QUAR'): k2='quarantined'
        elif kind.startswith('flagged'): k2='flagged'
        elif kind=='SILENT-SHRINK': k2='silent-shrink'
        elif kind=='unread': k2='unread'
        else: k2=kind
        if p[2]=='F': byfault[d.get('faultKind')][k2]+=1
print('seeds',n); print('ops',dict(stats)); print('faults',dict(fk))
print('VIOLS'); 
for k,v in viols.most_common(): print(' ',v,k, ex[k][:4])
print('FAULTED-VERSION OUTCOME BY FAULT')
for f,c in sorted(byfault.items()): print(' ',f,dict(c))
