import sys,json,subprocess
def load(b):
    p=subprocess.Popen(['git','cat-file','blob',b],stdout=subprocess.PIPE); L=[]
    for l in p.stdout:
        try: L.append(json.loads(l))
        except: L.append({})
    return L
A=load('a38f3afcf0');B=load('20db1c63cb');F=load('ed5ee674c7')
ua={x.get('uuid') for x in A if x.get('uuid')};uf={x.get('uuid') for x in F if x.get('uuid')}
print('A uuids in final',len(ua&uf),'of',len(ua))
print('B[0] parent in A?',B[0].get('parentUuid') in ua, 'B0 type',B[0].get('type'),'B0 isSidechain',B[0].get('isSidechain'))
print('version A',{x.get('version') for x in A if x.get('version')},'B',{x.get('version') for x in B if x.get('version')},'F',{x.get('version') for x in F if x.get('version')})
# is A's first-line content in final? count A lines whose raw uuid appears
print('A sessionId',{x.get('sessionId') for x in A},'F sessionIds',{x.get('sessionId') for x in F})
print('A cwd',{str(x.get('cwd'))[:3] for x in A if x.get('cwd')},'B cwd',{str(x.get('cwd'))[:3] for x in B if x.get('cwd')})
print('final first 3 types',[x.get('type') for x in F[:3]],'ts first/last', F[0].get('timestamp'),F[-1].get('timestamp'))
pos=[i+1 for i,x in enumerate(F) if x.get('uuid') in ua]
print('A-uuid positions in final: min',min(pos),'max',max(pos),'n',len(pos))
# contiguous runs
runs=[];s=pos[0];p=pos[0]
for q in pos[1:]:
    if q!=p+1: runs.append((s,p)); s=q
    p=q
runs.append((s,p)); print('runs',runs[:10],len(runs))
bpos=[i+1 for i,x in enumerate(F) if x.get('uuid') in {y.get('uuid') for y in B if y.get('uuid')}]
print('B uuids positions min/max/n',min(bpos),max(bpos),len(bpos))
# timestamps ordering check in final
ts=[(i+1,x.get('timestamp')) for i,x in enumerate(F) if x.get('timestamp')]
inv=[(a,b) for (a,t1),(b,t2) in zip(ts,ts[1:]) if t2<t1]
print('timestamp inversions in final',len(inv),inv[:5])
