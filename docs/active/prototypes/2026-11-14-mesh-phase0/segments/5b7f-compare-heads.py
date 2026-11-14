import sys,json,subprocess,collections
def load(b):
    p=subprocess.Popen(['git','cat-file','blob',b],stdout=subprocess.PIPE); L=[]
    for l in p.stdout:
        try: j=json.loads(l)
        except: j={}
        L.append((j.get('type'),j.get('uuid'),j.get('subtype'),j.get('isCompactSummary'),j.get('sessionId'),j.get('timestamp'),j.get('parentUuid'),len(l)))
    return L
A=load(sys.argv[1]);B=load(sys.argv[2])
ua={x[1] for x in A if x[1]};ub={x[1] for x in B if x[1]}
print('A lines',len(A),'uuids',len(ua),'B lines',len(B),'uuids',len(ub),'common uuids',len(ua&ub))
for name,L in (('A',A),('B',B)):
    print(name,'type hist',dict(collections.Counter(x[0] for x in L).most_common(8)))
    print(name,'first 6 types',[x[0] for x in L[:6]], 'sessionIds',len({x[4] for x in L if x[4]}),'ts range',min(x[5] for x in L if x[5]),max(x[5] for x in L if x[5]))
    print(name,'compact boundaries',[i+1 for i,x in enumerate(L) if x[2]=='compact_boundary'],'summaries',[i+1 for i,x in enumerate(L) if x[3]])
    print(name,'first parentUuid in-file?',[ (x[6] in {y[1] for y in L}) for x in L[:5] if True])
