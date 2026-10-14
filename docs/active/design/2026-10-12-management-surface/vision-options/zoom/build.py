"""Zoom in (Systems view), round 2: reads ONLY ../facts.json (plus ../../cc.css for looks), writes index.html.

WHY: round 1 merged the evidence files itself; round 2 shares one fact sheet across all four views so
statuses and connections agree everywhere. Nothing is invented: colour = node status, link = needs/shares.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.abspath(os.path.join(HERE, '..'))
FACTS = os.path.join(VO, 'facts.json')
if not os.path.exists(FACTS):
    subprocess.check_call([sys.executable, os.path.join(VO, 'facts.py')])
facts = json.load(open(FACTS))
nodes = facts['nodes']

data = {'root': dict(id='root', title='The whole vision', kind='root', kids=[], parent=None)}
for nid, n in nodes.items():
    st = n['status'] if n['status'] in ('done', 'building', 'planned', 'vision') else None
    data[nid] = dict(id=nid, title=n['title'], kind=n['kind'], parent=n.get('parent') or 'root',
                     pillar=n['pillar'], kids=[], status=st, since=n.get('since'), why=n.get('why'),
                     evidence=[dict(kind=e.get('kind'), ref=e.get('ref'), date=e.get('date'), note=e.get('note')) for e in n.get('evidence', [])],
                     needs=[dict(id=x['id'], because=x.get('because', '')) for x in n['needs']],
                     shares=[dict(id=x['id'], because=x.get('because', '')) for x in n['shares']],
                     needed_by=[dict(id=x['id'], because=x.get('because', '')) for x in n.get('needed_by', [])])
for nid, n in nodes.items():
    data[n.get('parent') or 'root']['kids'].append(nid)
bad = [n['id'] for n in nodes.values() if n['kind'] == 'feature' and n['status'] not in ('done', 'building', 'planned', 'vision')]
assert not bad, bad

css = open(os.path.join(VO, '..', 'cc.css')).read()
tpl = open(os.path.join(HERE, 'template.html')).read()
out = tpl.replace('/*CC_CSS*/', css).replace('/*DATA*/', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
open(os.path.join(HERE, 'index.html'), 'w').write(out)
print('wrote index.html', len(out), 'bytes;', sum(1 for n in nodes.values() if n['kind'] == 'feature'), 'features')
