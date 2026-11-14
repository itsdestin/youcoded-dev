import sys,json,subprocess
def load(b):
    p=subprocess.Popen(['git','cat-file','blob',b],stdout=subprocess.PIPE); L=[]
    for l in p.stdout:
        try: L.append(json.loads(l))
        except: L.append({})
    return L
A=load('a38f3afcf0'); ua={x.get('uuid') for x in A if x.get('uuid')}
prev=None
for b in sys.argv[1:]:
    F=load(b); pos=[i+1 for i,x in enumerate(F) if x.get('uuid') in ua]
    uf=[x.get('uuid') for x in F if x.get('uuid')]
    ts=[x.get('timestamp') for x in F if x.get('timestamp')]
    print(b,'lines',len(F),'A-uuids',len(pos),(min(pos),max(pos)) if pos else None,'ts',ts[0],ts[-1],'prev-prefix-of-this' if prev and all(prev[i]==uf[i] for i in range(min(len(prev),len(uf)))) else 'NOT-prefix-by-uuid')
    prev=uf
