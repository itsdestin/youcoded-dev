import json,glob,os,sys
tot_h=tot_l=0
for f in sorted(glob.glob('results/chk-*.json')+glob.glob('results/mut-*.json')+glob.glob('results/var-*.json')):
    d=json.load(open(f)); n=d['sched']
    print(os.path.basename(f)[:-5].ljust(28),'n',n,'fail',d['fail'],'loss',d['loss'],'inherent',d['inherent'],'copiesSched',d.get('copySched'),'staleSched',d.get('staleSched'),'tapCopy',d['tapCopy'],'tapPlace',d['tapPlace'],'override',d['overrideUser'],'tie',d.get('tie'),'tieLonger',d.get('tieLonger'),'gap',d.get('gap'),'dblSched',d.get('dblSched'),'unreach',d.get('unreachMarkSched'),'vac',d.get('vacChecked'))
    if d['failSeeds']: print('     seeds',d['failSeeds'])
print()
for f in sorted(glob.glob('results/own-*.json')):
    d=json.load(open(f)); n=d['runs']
    print(os.path.basename(f)[:-5].ljust(30),'n',n,'fail',d['failuresByProperty'],'with',d['schedulesWith'],'esc',d['totals'].get('escFail'),'override',d['totals'].get('override'),'vac',d['totals'].get('vacated'),'wipe',d['totals'].get('wipe'),'poison',d['totals'].get('poison'),'removes',d['totals'].get('removes'))
    if d.get('firstSeeds'): print('     seeds',d['firstSeeds'])
