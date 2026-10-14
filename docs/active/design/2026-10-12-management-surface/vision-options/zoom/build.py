"""Zoom in: the whole vision as nested boxes on one canvas. Reads the real vision files, writes index.html.

WHY it reuses ../../vision_tab.py's loader: that is how the current page already merges the skeleton
with the three evidence files (A, B, C), so statuses here are exactly the ones the page shows.
Nothing is invented: a box's colour is the status in the evidence file; a line is a needs/shares entry.
"""
import json, os, sys, html
HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, DESIGN)
import vision_tab as vt

sk, ev, _ = vt.load(DESIGN)
nodes = vt.flatten(sk)
vt.merge(nodes, ev)

# ---- the tree the page draws: root > pillars > capabilities > features (leaf = a feature) ----
data = {'root': dict(id='root', title='The whole vision', kind='root', kids=[], parent=None)}
for nid, n in nodes.items():
    data[nid] = dict(id=nid, title=n['title'], kind=n['kind'], parent=n.get('parent') or 'root',
                     pillar=n['pillar'], kids=[], quote=n.get('quote'), status=(n['status'] if n['status'] != 'unchecked' else None),
                     since=n.get('since'), why=n.get('why'),
                     evidence=[dict(kind=e.get('kind'), ref=e.get('ref'), date=e.get('date'), note=e.get('note')) for e in n.get('evidence', [])],
                     needs=[dict(id=x['id'], because=x.get('because', '')) for x in n['needs']],
                     shares=[dict(id=x['id'], because=x.get('because', '')) for x in n['shares']])
for nid, n in nodes.items():
    data[n.get('parent') or 'root']['kids'].append(nid)
# only the keys that are needed in the browser
for d in data.values():
    d['kids'] = [k for k in d['kids'] if k in data]

# sanity: every feature has a real status (never invented)
bad = [n['id'] for n in nodes.values() if n['kind'] == 'feature' and n['status'] not in ('done', 'building', 'planned', 'vision')]
assert not bad, bad

css = open(os.path.join(DESIGN, 'cc.css')).read()
tpl = open(os.path.join(HERE, 'template.html')).read()
out = tpl.replace('/*CC_CSS*/', css).replace('/*DATA*/', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
open(os.path.join(HERE, 'index.html'), 'w').write(out)
print('wrote index.html', len(out), 'bytes;', sum(1 for n in nodes.values() if n['kind'] == 'feature'), 'features')
