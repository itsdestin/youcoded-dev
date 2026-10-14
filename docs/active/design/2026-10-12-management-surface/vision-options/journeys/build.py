#!/usr/bin/env python3
"""Journeys view (round 2): builds index.html from ../facts.json ONLY (plus ../cc.css for looks).
WHY: round 2 makes every view read one shared set of facts so the switcher can show the same thing in
four shapes. Journey definitions, labels and "catch" flags now live in facts.json; what this file
computes (where a journey stops, what holds it back) is derived from nodes' needs. Nothing invents a status."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.dirname(HERE)  # vision-options/
F = json.load(open(os.path.join(D, 'facts.json'), encoding='utf-8'))

SYS = {s['id']: s['title'] for s in F['systems']}
nodes = {}
for k, n in F['nodes'].items():
    if n['kind'] != 'feature' and not n.get('added'): continue
    nodes[k] = dict(id=k, title=n['title'], label=n.get('label'), catch=bool(n.get('catch')),
        system=SYS.get(n['pillar'], n['pillar']), sysid=n['pillar'], cap=(F['nodes'].get(n['parent']) or {}).get('title', '') if n['parent'] != n['pillar'] else '',
        status=n['status'], since=n.get('since'), why=n.get('why') or '', track=n.get('track'),
        needs=[x['id'] for x in n['needs']], needsWhy={x['id']: x['because'] for x in n['needs']},
        shares=[x['id'] for x in n['shares']], evidence=n.get('evidence', []))
# keep connections only to pieces we carry (journey steps and their needs are all features)
for n in nodes.values():
    n['needs'] = [x for x in n['needs'] if x in nodes]; n['shares'] = [x for x in n['shares'] if x in nodes]

J = [dict(title=j['title'], quote=j['quote'], steps=j['steps']) for j in F['journeys']]
for j in J:
    for s in j['steps']: assert s in nodes, s

def closure(start):
    seen, stack = set(), list(start)
    while stack:
        x = stack.pop()
        if x in seen: continue
        seen.add(x); stack += nodes[x]['needs']
    return seen
for j in J:
    j['held'] = sorted(x for x in closure(j['steps']) if nodes[x]['status'] != 'done')
    j['extra'] = [x for x in j['held'] if x not in j['steps']]
    j['stop'] = next((k for k, s in enumerate(j['steps']) if nodes[s]['status'] != 'done'), None)

by_node, by_sys = {}, {}
for i, j in enumerate(J):
    for x in j['held']:
        by_node.setdefault(x, []).append(i); by_sys.setdefault(nodes[x]['sysid'], set()).add(i)
# which journeys a node/part focus maps to: parts carry a "vision" list of node ids
parts = {p['id']: p.get('vision', []) for p in F['parts']}
data = dict(nodes=nodes, journeys=J, byNode=by_node, bySys={k: sorted(v) for k, v in by_sys.items()}, sys=SYS,
            tracks={k: v['title'] for k, v in F['tracks'].items()}, parts=parts, pillarOf={k: v['pillar'] for k, v in F['nodes'].items()})

css = open(os.path.join(os.path.dirname(D), 'cc.css'), encoding='utf-8').read()
tpl = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
out = tpl.replace('/*CC_CSS*/', css).replace('/*DATA*/', 'const DATA=' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + ';')
open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(out)
print('built', len(out), 'bytes;', len(nodes), 'nodes;', len(J), 'journeys')
