import json,sys
r=json.load(open(sys.argv[1]))
print(r['build']['sha'][:9],r['loadAvgStart'],r['loadAvgEnd'],r.get('status'),r.get('error'))
f=r['legs']['flood']
for k in ('terminalVisible','terminalHidden'):
    v=f.get(k)
    if not v: continue
    print('==',k)
    for a in ('status','wallMs','mbReceived','ipcMessages','mainProcessIpc','stallsOver150ms','cpuSecondsMainProcess','renderer','longtasks'):
        print(' ',a, json.dumps(v[a])[:600])
    fs=dict(v['finalState']); fs.pop('tail',None); print('  final',json.dumps(fs)[:600])
    pr=v['producer']; print('  producer last',pr['last'],'errors',pr['errors']); print('  prod mb',pr['writtenMbByMs'][:12])
    print('  recv mb',v['mbByMs'][:14])
    p=v['pipeline']; print('  rss first',p['rssMbFirst'],'peak',p['rssMbPeak'],'last',p['rssMbLast'],'gone',p['goneAtMs'])
    pm=v['pssMb']
    for k2 in ('before','afterRun','after12sSettle'):
        d={x['type']+str(x['pid'])[-3:]:x['mb'] for x in pm[k2]['perPid']}; print('  pss',k2,pm[k2]['totalMb'],d)
