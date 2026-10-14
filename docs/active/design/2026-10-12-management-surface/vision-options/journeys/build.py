#!/usr/bin/env python3
"""Journeys view: builds index.html from the real vision files (read-only, one folder up x2).
WHY this shape (Destin 2026-10-14: "which major systems are complete/planned in progress ... still
haven't seen a good idea"): instead of grading systems by counts, walk real people through the app and
show how far each gets. Every step is a feature node carrying its real status from vision-evidence-*.json;
nothing here invents a status. Connections come only from each node's needs/shares."""
import json, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.dirname(os.path.dirname(HERE))  # the design folder
def load(n): return json.load(open(os.path.join(D, n), encoding='utf-8'))

sk = load('vision-skeleton.json')
ev = {}; added = []
for f in 'ABC':  # the three evidence files split the pillars between agents; together they are the full set
    d = load(f'vision-evidence-{f}.json'); ev.update(d['nodes']); added += d.get('added', [])

# ---- nodes: features (and added items) with title, system, capability, track, status
TRACKS = {t['id']: t for t in sk['tracks']}
nodes = {}
def track_for(nid):
    parts = nid.split('.')
    for i in range(len(parts), 0, -1):
        t = sk['track_of'].get('.'.join(parts[:i]))
        if t: return t
    return 'app'
for p in sk['pillars']:
    for c in p['capabilities']:
        for f in c['features']:
            e = ev[f['id']]
            nodes[f['id']] = dict(id=f['id'], title=f['title'], system=p['title'], sysid=p['id'], cap=c['title'],
                status=e['status'], since=e.get('since'), why=e.get('why', ''), track=track_for(f['id']),
                needs=[n['id'] for n in e.get('needs', [])], needsWhy={n['id']: n['because'] for n in e.get('needs', [])},
                shares=[s['id'] for s in e.get('shares', [])])
for a in added:
    pid = a['id'].split('.')[0]; p = next(p for p in sk['pillars'] if p['id'] == pid)
    nodes[a['id']] = dict(id=a['id'], title=a['title'], system=p['title'], sysid=pid, cap='', status=a['status'],
        since=a.get('since'), why=a.get('why', ''), track=track_for(a['id']), needs=[], needsWhy={}, shares=[])
# WHY: a few feature titles are one word ("Pages") and read as a screen name inside a row; these say what the step is
LABEL = {'marketplace.browse.pages': 'Find pages in the marketplace', 'marketplace.publish.share': 'Publish your own skill, theme or page',
         'everywhere.platforms.desktop': 'Install on Windows, Mac or Linux', 'marketplace.setup.install': 'One-click install with clear permissions'}
for k, v in LABEL.items(): nodes[k]['label'] = v
for n in nodes.values():  # drop connections to ids the skeleton does not have (one is flagged "assumed" in the data)
    n['needs'] = [x for x in n['needs'] if x in nodes]; n['shares'] = [x for x in n['shares'] if x in nodes]

# ---- the journeys, from Destin's own words (destin-words.md, 2026-10-07 voice notes + the skeleton quotes)
J = [
 dict(title='A student puts the app on a laptop and a phone, and picks a free model',
      quote='it\'s cross platform and everything is designed to work cross platform. So you can download it on anything',
      steps=['everywhere.platforms.desktop','everywhere.firstrun.setup','everywhere.platforms.android','sync.follow.projects','chat.converse.local','yours.model.free','yours.everyone.student']),
 dict(title='Someone builds a money page by describing it, then shares it',
      quote='you can either build something yourself from scratch, or pull in more or less any existing open source application',
      steps=['pages.build.create','pages.build.theme','pages.connect.connections','pages.connect.money','marketplace.publish.share','marketplace.browse.pages','marketplace.publish.fork']),
 dict(title='An agent runs overnight on whichever of your devices is on',
      quote='automatically hand it off to whichever of your devices are live and connected at any given moment',
      steps=['agents.unit.recipe','agents.background.personal','agents.background.scheduled','sync.follow.projects','sync.follow.safety','sync.mesh.handoff','agents.background.view']),
 dict(title='A page that updates itself every week with the research you need',
      quote='autonomous agents in the background that are tied to a specific page … they compile all this week\'s research … in a page',
      steps=['pages.build.create','agents.unit.recipe','agents.background.scheduled','pages.agents.attached','agents.background.view','yours.everyone.student']),
 dict(title='Start a chat on one device, pick it up on another',
      quote='I start a conversation on one device, I can pick it up on almost any of my other devices pretty much immediately',
      steps=['sync.follow.chats','sync.follow.remote','everywhere.platforms.web','everywhere.platforms.android','sync.follow.safety','sync.mesh.backup']),
 dict(title='A normal person finds free tools and has the assistant set them up',
      quote='download a single app and then see curated free content that would actually be useful to them in their daily lives',
      steps=['everywhere.platforms.desktop','everywhere.firstrun.setup','marketplace.browse.curated','marketplace.setup.install','marketplace.setup.walkthrough','yours.everyone.ostools']),
 dict(title='Use any AI you like, with no single company holding your work',
      quote='use any open weight model, any US or Chinese model to work with an open source document editor',
      steps=['chat.converse.cloud','chat.converse.local','chat.converse.native','yours.model.any','yours.model.free','yours.model.data']),
]
# WHY: two steps are marked done but their own evidence line says there is a catch; a row should not read cleaner than the evidence
CATCH = ['marketplace.publish.share', 'everywhere.platforms.android']
for n in CATCH: nodes[n]['catch'] = True
for j in J:
    for s in j['steps']: assert s in nodes, s

# ---- what each journey is held up by: its unfinished steps, plus everything unfinished they (transitively) need
def closure(start):
    seen, stack = set(), list(start)
    while stack:
        x = stack.pop()
        if x in seen: continue
        seen.add(x); stack += nodes[x]['needs']
    return seen
for i, j in enumerate(J):
    allx = closure(j['steps'])
    j['held'] = sorted(x for x in allx if nodes[x]['status'] != 'done')
    j['extra'] = [x for x in j['held'] if x not in j['steps']]
    st = [nodes[s]['status'] for s in j['steps']]
    j['stop'] = next((k for k, s in enumerate(st) if s != 'done'), None)

by_node = {}; by_sys = {}
for i, j in enumerate(J):
    for x in j['held']:
        by_node.setdefault(x, []).append(i)
        by_sys.setdefault(nodes[x]['sysid'], set()).add(i)
SYS = {p['id']: p['title'] for p in sk['pillars']}
data = dict(nodes=nodes, journeys=J, byNode=by_node, bySys={k: sorted(v) for k, v in by_sys.items()}, sys=SYS,
            tracks={k: v['title'] for k, v in TRACKS.items()}, mission=sk['mission'])

css = open(os.path.join(D, 'cc.css'), encoding='utf-8').read()
tpl = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
out = tpl.replace('/*CC_CSS*/', css).replace('/*DATA*/', 'const DATA=' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + ';')
open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(out)
print('built', len(out), 'bytes;', len(nodes), 'nodes;', len(J), 'journeys')
for i, j in enumerate(J):
    print(i + 1, 'stops at', None if j['stop'] is None else nodes[j['steps'][j['stop']]]['title'], '|', [nodes[s]['status'] for s in j['steps']])
