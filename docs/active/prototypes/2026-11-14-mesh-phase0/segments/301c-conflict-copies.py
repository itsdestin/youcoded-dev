import glob,json,itertools,os
d=os.path.expanduser('~/YouCoded/Personal/Conversations/claude/transcripts/youcoded-dev/')
fs=sorted(glob.glob(d+'301cfe19*.jsonl'))+[os.path.expanduser('~/.claude/projects/-home-destin-youcoded-dev/301cfe19-9c15-4c64-b2bb-f42d0d90ca71.jsonl')]
S={}
for f in fs:
    u=[]
    for l in open(f,'rb'):
        try: j=json.loads(l)
        except: continue
        if j.get('type') in('user','assistant') and j.get('uuid'): u.append(j['uuid'])
    S[os.path.basename(f)[37:70] or 'main']=(u,f)
names=list(S)
print({n:len(S[n][0]) for n in names})
for a,b in itertools.combinations(names,2):
    ua,ub=S[a][0],S[b][0]
    k=0
    while k<min(len(ua),len(ub)) and ua[k]==ub[k]: k+=1
    sa,sb=set(ua),set(ub)
    rel='prefix' if k==min(len(ua),len(ub)) else 'diverge@%d'%k
    print(a[:28],'|',b[:28],rel,'A-only',len(sa-sb),'B-only',len(sb-sa),'reordered' if (sa<=sb or sb<=sa) and rel!='prefix' else '')
