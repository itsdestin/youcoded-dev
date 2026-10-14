#!/usr/bin/env python3
"""Foundations up: the vision as a building with floors. Writes index.html next to this file.

WHY floors are computed: a block's floor is the longest chain of "needs" under it (needs[] in
vision-evidence-*.json). Floor 0 needs nothing; a block sits one floor above the highest thing it
needs. Nothing is placed by hand. Statuses come only from the evidence files.
"""
import json, os, html, functools, re

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.dirname(HERE)                            # vision-options (holds facts.json)
UP = os.path.dirname(VO)                              # .../2026-10-12-management-surface (cc.css, page.css)
E = html.escape

# WHY facts.json only: round 2 puts all four views on one merged set of facts (ROUND2.md section 1).
F = json.load(open(os.path.join(VO, 'facts.json')))
nodes = F['nodes']
for _k, _n in nodes.items():
    _n['title'] = _n.get('label') or _n['title']       # the plain label, where facts.py supplies one

STATUS_WORD = {'done': 'exists', 'building': 'being built', 'planned': 'planned', 'vision': 'only an idea', 'unchecked': 'not checked yet'}  # WHY: the four shared words (U3); only the seven systems themselves are unchecked (a system has no status of its own), and inventing 'planned' for them would be a made-up status
SHORT = {'chat': 'Chat', 'projects': 'Projects', 'pages': 'Pages', 'marketplace': 'Marketplace', 'social': 'Social',
         'sync': 'Sync & Mesh', 'agents': 'Agents', 'yours': 'Yours', 'everywhere': 'Everywhere', 'together': 'Built together'}
sk = {'pillars': [{'id': k} for k in SHORT]}

# --- the building: only blocks that take part in a "needs" link are drawn as floors -------------
conn = [k for k, n in nodes.items() if n['needs'] or n['needed_by']]

@functools.lru_cache(None)
def floor(k):
    ns = nodes[k]['needs']
    return 0 if not ns else 1 + max(floor(x['id']) for x in ns)

def trans(k, key, seen=None):
    """everything reachable by following needs (key='needs') or needed_by (key='needed_by')"""
    seen = set() if seen is None else seen
    for x in nodes[k][key]:
        if x['id'] not in seen:
            seen.add(x['id']); trans(x['id'], key, seen)
    return seen

def floating(k):
    """a block floats when something it needs is not built yet"""
    return [x['id'] for x in nodes[k]['needs'] if nodes[x['id']]['status'] != 'done']

TOP = max(floor(k) for k in conn)
FLOOR_NAME = {0: 'Foundations', 1: 'Built on the foundations', 2: 'Built on those', 3: 'Higher still', 4: 'Top of the building'}
FLOOR_SUB = {0: 'These need nothing else.', 1: 'Each needs something from the floor below.', 2: 'Needs things that themselves need things.',
             3: 'Needs three floors of other work.', 4: 'Needs four floors of other work.'}  # shown on hover only

# "build next": unfinished blocks ranked by how many other unfinished blocks wait on them (through any chain)
nxt = []
for k in conn:
    n = nodes[k]
    if n['status'] == 'done': continue
    # only those whose own foundations are in place can start now
    held = [h for h in trans(k, 'needed_by') if nodes[h]['status'] != 'done']
    if held:
        nxt.append((len(held), k, bool(floating(k))))
nxt.sort(key=lambda t: (-t[0], t[2], t[1]))
NEXT = nxt[:3]   # WHY 3: ROUND2 complaint - fewer things at once, full names

order_p = {p['id']: i for i, p in enumerate(sk['pillars'])}
groups = {}
for k in conn:
    groups.setdefault(floor(k), []).append(k)
for f in groups:
    groups[f].sort(key=lambda k: (order_p[nodes[k]['pillar']], k))

# --- loose features: nothing links to them, so nothing holds them or hangs off them ---------------
loose = {}
for k, n in nodes.items():
    if k in conn or n['kind'] != 'feature': continue
    loose.setdefault(n['pillar'], []).append(k)

# WHY U2: words Destin did not coin get a plain hover; his own words (Mesh, Fediverse) keep the word and gain one
GLOSS = [
    (r'Mesh', 'Mesh: your phone, computer and browser working together as one.'),
    (r'Fediverse', 'Fediverse: social networks (like Mastodon) that talk to each other instead of one company owning them.'),
    (r'AT protocol', 'AT protocol: the open system behind Bluesky.'),
    (r'MCP', 'MCP: a standard way to plug outside tools into the assistant.'),
    (r'Specialist file', 'Specialist file: a saved set of instructions for one kind of helper.'),
    (r'Harness engineering', 'Harness engineering: improving the machinery around the assistant so it does its work faster and cheaper.'),
]
def glossed(text):
    """escape text; wrap each glossary word in a span that carries its own hover"""
    out = E(text)
    for pat, tip in GLOSS:
        out = re.sub('(' + pat + ')', lambda m: f'<span class="gl" data-tip="{E(tip)}">{m.group(1)}</span>', out, count=1)
    return out

def short(k):
    return nodes[k]['title']


def data_for(k):
    n = nodes[k]
    why = n.get('why') or ''
    return dict(
        id=k, title=n['title'], status=n['status'], word=STATUS_WORD[n['status']], pillar=SHORT[n['pillar']],
        why=why, since=n.get('since'), floor=floor(k) if k in conn else None, catch=bool(n.get('catch')),
        needs=[dict(id=x['id'], why=x.get('because', '')) for x in n['needs']],
        holds=[dict(id=x['id'], why=x.get('because', '')) for x in n['needed_by']],
        shares=[dict(id=x['id'], why=x.get('because', '')) for x in n['shares']],
        proof=[dict(kind=e.get('kind', ''), ref=e.get('ref', ''), note=e.get('note', '')) for e in n.get('evidence', [])],
        floating=floating(k) if k in conn else [],
        held=sorted(trans(k, 'needed_by')) if k in conn else [], below=sorted(trans(k, 'needs')) if k in conn else [],
        kind=n['kind'])

DATA = {k: data_for(k) for k in nodes if k in conn or any(k in l for l in loose.values())}
TITLES = {k: n['title'] for k, n in nodes.items()}
# WHY: focus links from the switcher can name any node, or a wiring part; the page maps them to the nearest block
PARENT = {k: n.get('parent') for k, n in nodes.items()}
PARTS = {p['id']: [v if isinstance(v, str) else v.get('id') for v in (p.get('vision') or [])] for p in F['parts']}
PILLAR_OF = {k: n['pillar'] for k, n in nodes.items()}
CONN = sorted(conn)

def block(k):
    d = DATA[k]
    fl = bool(d['floating'])
    legs = '<span class="legs" aria-hidden="true"><i></i><i></i></span>' if fl else ''
    # WHY no "up" badge: the count of things resting on a block now lives only in the detail panel
    return (f'<button class="blk {d["status"]}{" float" if fl else ""}" data-id="{E(k)}" data-tip="{E(d["why"] or d["title"])}">'
            f'<span class="bt">{glossed(d["title"])}</span>'
            f'<span class="bs"><i class="sdot {d["status"]}"></i>{E(d["word"])}</span>{legs}</button>')

floors_html = []
tops = []
for f in range(TOP, -1, -1):
    ks = groups.get(f, [])
    nfl = sum(1 for k in ks if DATA[k]['floating'])
    note = f'<span class="fnote" data-tip="Missing support: something these blocks rest on is not built yet, so they cannot stand properly.">{nfl} missing support</span>' if nfl else ''
    # WHY: finished, well-supported blocks collapse into one quiet strip so the unfinished ones stand out
    quiet = [k for k in ks if DATA[k]['status'] == 'done' and not DATA[k]['floating']]
    shown = [k for k in ks if k not in quiet]
    strip = ''
    if quiet:
        strip = (f'<div class="strip"><button class="sbtn" aria-expanded="false" data-tip="Click to show or hide them.">'
                 f'<i class="sdot done"></i>{len(quiet)} {"things that already work" if len(quiet) != 1 else "thing that already works"}<span class="car">&#9656;</span></button>'
                 f'<div class="sblks">{"".join(block(k) for k in quiet)}</div></div>')
    (tops if f >= 3 else floors_html).append(
        f'<section class="floor" data-floor="{f}"><header class="fh"><span class="fn" data-tip="{E(FLOOR_SUB[f])}">{E(FLOOR_NAME[f])}</span>{note}</header>'
        f'<div class="bl">{"".join(block(k) for k in shown)}</div>{strip}</section>')

floors_html.insert(0, '<div class="tops">' + ''.join(reversed(tops)) + '</div>')
nxt_html = ''.join(
    f'<button class="nx" data-id="{E(k)}" data-tip="Not finished, and {c} other unfinished thing{"s" if c != 1 else ""} sit on it. Click to light them up.">'
    f'<i class="sdot {nodes[k]["status"]}"></i><b>{E(short(k))}</b></button>' for c, k, fl in NEXT)

loose_html = ''.join(
    f'<div class="lp"><div class="lph">{glossed(SHORT[p])}</div><div class="lc">' +
    ''.join(f'<button class="chip2 {nodes[k]["status"]}" data-id="{E(k)}" data-tip="{E(nodes[k].get("why") or nodes[k]["title"])}"><i class="sdot {nodes[k]["status"]}"></i>{glossed(nodes[k]["title"])}</button>' for k in sorted(ks)) +
    '</div></div>' for p, ks in sorted(loose.items(), key=lambda t: order_p[t[0]]))
nloose = sum(len(v) for v in loose.values())

CSS = open(os.path.join(UP, 'cc.css')).read() + open(os.path.join(UP, 'page.css')).read()
CSS += '''
.cc-main{max-width:none;margin:0;padding:16px 20px 48px}
body:has(.panel.open) .cc-main{padding-right:420px}
.lead{margin:0 0 6px}
.lead h1{font-size:16px;font-weight:600;margin:0;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.lead h1 span{font-size:12px;font-weight:400;color:var(--fg-muted)}
.lead p{margin:0;color:var(--fg-muted);font-size:12px}
.topline{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}
.nxbox{background:var(--panel);border:1px solid var(--edge-card);border-radius:var(--radius-xl);padding:8px 12px}
.nxbox h2{font-size:12px;font-weight:600;margin:0 0 6px;color:var(--fg)}
.nxbox h2 span{font-weight:400;color:var(--fg-muted)}
.nxs{display:flex;flex-wrap:wrap;gap:6px}
.nx{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:4px 10px;border-radius:var(--radius-lg);border:1px solid var(--edge-strong);background:transparent;color:var(--fg-2);cursor:pointer}
.nx b{font-weight:500;color:var(--fg);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .nx span{color:var(--fg-muted)}
@media (hover:hover){.nx:hover{background:var(--inset)}}
.legend{margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:11px;color:var(--fg-2);padding:6px 12px;background:var(--panel);border:1px solid var(--edge-card);border-radius:var(--radius-xl);white-space:nowrap}
.legend div{display:flex;align-items:center;gap:6px}
.legend .up2{font-size:10px;padding:0 6px;border-radius:9999px;background:color-mix(in srgb,var(--status-warn) 25%,transparent)}.legend .lgf{display:inline-block;width:22px;height:0;border-top:2px dashed var(--status-warn)}
.sdot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;border:1.5px solid var(--fg-muted);box-sizing:border-box}
.sdot.done{background:var(--status-ok);border-color:var(--status-ok)}
.sdot.building{background:linear-gradient(90deg,var(--fg-2) 50%,transparent 50%);border-color:var(--fg-2)}
.sdot.planned{background:transparent}
.sdot.vision{border-style:dotted}
.sdot.unchecked{border-color:var(--status-warn)}

#bld{position:relative}
#lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:0}
#lines path{fill:none;stroke:var(--fg);stroke-width:1.6;opacity:.7}
#lines path.dash{stroke:var(--status-warn);stroke-dasharray:5 4;opacity:1;stroke-width:1.8}
.floor{position:relative;padding:6px 0 8px;border-bottom:3px solid var(--edge-strong)}
.tops{display:flex;gap:28px;border-bottom:3px solid var(--edge-strong)}.tops .floor{border-bottom:0}.floor:last-of-type{border-bottom:0}
.floor[data-floor="0"]{border-bottom:0}
/* WHY a thick slab between floors: it is the "floor" a block stands on */
.fh{display:flex;align-items:baseline;gap:10px;margin:0 2px 6px}
.fn{font-size:12px;font-weight:600;color:var(--fg)}
.fs{font-size:11px;color:var(--fg-muted)}
.fnote{margin-left:auto;font-size:11px;color:var(--fg-2);padding:1px 8px;border-radius:var(--radius-full);background:color-mix(in srgb,var(--status-warn) 15%,transparent);border:1px solid color-mix(in srgb,var(--status-warn) 30%,transparent)}
.bl{display:flex;flex-wrap:wrap;gap:8px 8px;padding-bottom:8px}
.blk{position:relative;width:146px;height:54px;overflow:visible;text-align:left;display:flex;flex-direction:column;gap:3px;padding:5px 8px 5px;border-radius:var(--radius-lg);border:1px solid var(--edge-strong);background:var(--panel);color:var(--fg);cursor:pointer;transition:opacity var(--dur-hover),box-shadow var(--dur-hover),background-color var(--dur-hover)}
.blk .bt{font-size:11px;line-height:13px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.blk .bs{margin-top:auto;display:flex;align-items:center;gap:5px;font-size:10px;line-height:12px;color:var(--fg-muted)}
.blk .bs em{font-style:normal;margin-left:auto;color:var(--fg-faint);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.blk .up{white-space:nowrap;margin-left:auto;color:var(--fg);background:color-mix(in srgb,var(--status-warn) 25%,transparent);border-radius:var(--radius-full);padding:0 6px}
.blk.done{border-left:4px solid var(--status-ok)}
.blk.building{border-left:4px solid var(--fg-2)}
.blk.planned{border-left:4px solid var(--fg-faint);background:transparent}
.blk.vision{border-left:4px solid var(--fg-faint);background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--fg-faint) 22%,transparent) 0 2px,transparent 2px 7px)}
/* WHY dashed legs: a block whose foundation is not finished visibly hangs in the air */
.blk.float{border-style:dashed;border-color:var(--status-warn);margin-bottom:9px}
.blk .legs{position:absolute;left:0;right:0;top:100%;height:9px;display:flex;justify-content:space-around;padding:0 18px;pointer-events:none}
.blk .legs i{width:0;height:100%;border-left:2px dashed var(--status-warn)}
@media (hover:hover){.blk:hover{background:var(--inset)}}
.blk:focus-visible,.nx:focus-visible,.chip2:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* lighting */
body.lit .blk,body.lit .chip2{opacity:.28}
body.lit .blk.is-self,body.lit .blk.is-below,body.lit .blk.is-above{opacity:1}
.blk.is-self{box-shadow:0 0 0 2px var(--accent)}
.blk.is-below{box-shadow:0 0 0 2px var(--status-ok)}
.blk.is-above{box-shadow:0 0 0 2px var(--tag-blue)}
.blk.is-below.notdone{box-shadow:0 0 0 2px var(--status-warn)}
.tag{display:none;position:absolute;top:-8px;right:8px;font-size:9px;line-height:12px;padding:0 6px;border-radius:var(--radius-full);background:var(--accent);color:var(--on-accent)}
.blk.is-below .tag.b,.blk.is-above .tag.a{display:block}
.lit-key{display:none;margin:0 0 8px;font-size:11px;color:var(--fg-2)}
body.lit .lit-key{display:flex;gap:14px;flex-wrap:wrap}
.lit-key span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.lit-key .k1::before{background:var(--status-ok)} .lit-key .k2::before{background:var(--tag-blue)} .lit-key .k3::before{background:var(--status-warn)}
details.loose{margin-top:18px;background:var(--panel);border:1px solid var(--edge-card);border-radius:var(--radius-xl);padding:10px 12px}
details.loose summary{cursor:pointer;font-size:12px;font-weight:500;color:var(--fg)}
details.loose summary span{font-weight:400;color:var(--fg-muted)}
.lp{margin-top:10px} .lph{font-size:11px;font-weight:600;color:var(--fg-2);margin-bottom:4px}
.lc{display:flex;flex-wrap:wrap;gap:5px}
.chip2{font-size:11px;line-height:14px;padding:3px 9px;border-radius:var(--radius-lg);border:1px solid var(--edge-dim);background:transparent;color:var(--fg-2);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
@media (hover:hover){.chip2:hover{background:var(--inset)}}
.pbody .pst{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pbody h3{font-size:11px;font-weight:600;color:var(--fg-muted);margin:0 0 6px}
.pbody .ln{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:1px solid var(--edge-card);background:var(--inset);border-radius:var(--radius-lg);padding:7px 10px;margin-bottom:6px;cursor:pointer;color:var(--fg);font-size:12px}
.pbody .ln .t{display:flex;gap:6px;align-items:center;font-weight:500}
.pbody .ln .w{font-size:11px;color:var(--fg-muted)}
.pbody .none{font-size:12px;color:var(--fg-muted)}
.pbody .alert{font-size:12px;color:var(--fg-2);border:1px dashed var(--status-warn);border-radius:var(--radius-lg);padding:8px 10px}
.tipbubble{position:fixed;left:0;top:0;z-index:60;pointer-events:none;padding:4px 8px;max-width:20rem;font-size:11px;line-height:1.375;color:var(--fg-2);background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-xl);box-shadow:var(--layer-shadow)}
@media (max-width:760px){.topline{grid-template-columns:1fr}.blk{width:calc(50% - 4px)}body:has(.panel.open) .cc-main{padding-right:20px}}
'''
CSS += '''
/* ---- round 2 overrides: fewer, wider, fully readable blocks ---- */
.blk{width:184px;height:auto;min-height:40px;padding:4px 8px}
.legend{margin-bottom:5px;padding:4px 12px}.legend .lg1{color:var(--fg);margin-right:8px}
.nxbox{padding:6px 12px}.nxbox h2{margin-bottom:4px}
.floor{padding:4px 0 2px}.bl{padding-bottom:4px;gap:8px}.cc-main{padding-top:10px}
.tops{gap:20px}
.blk .bt{display:block;-webkit-line-clamp:unset;overflow:visible;font-size:12px;line-height:15px}
.bl{gap:10px 8px}
.nx b{max-width:none;white-space:normal;text-align:left}
.nx{font-size:12px;padding:5px 12px}
.nxbox h2 span{margin-left:4px}
.fh{margin-bottom:5px}
#lines path{stroke-width:1.2;opacity:.45}
#lines path.dash{stroke-width:1.3;opacity:.8}
.strip{padding:0 0 8px}
.sbtn{display:inline-flex;align-items:center;gap:7px;font-size:11px;padding:3px 10px;border-radius:var(--radius-lg);border:1px dashed var(--edge-strong);background:transparent;color:var(--fg-2);cursor:pointer}
.sbtn .car{display:inline-block;transition:transform var(--dur-hover);color:var(--fg-muted)}
.strip.open .sbtn .car{transform:rotate(90deg)}
.strip.has-lit .sbtn{box-shadow:0 0 0 2px var(--status-ok);color:var(--fg)}
@media (hover:hover){.sbtn:hover{background:var(--inset)}}
.sblks{display:none;flex-wrap:wrap;gap:8px;margin-top:8px}
.strip.open .sblks{display:flex}
.sbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
html.framed .band{display:none}
.pbody .facts{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--fg-2)}
.pbody .facts li{display:block;padding-left:12px;position:relative}.pbody .facts li::before{content:"\\2022";color:var(--fg-muted);position:absolute;left:0}
#pbody{display:flex;flex-direction:column;gap:10px}
details.more{border-top:1px solid var(--edge-card);padding-top:8px}
details.more summary{cursor:pointer;font-size:12px;color:var(--fg-muted)}
details.more[open] summary{margin-bottom:8px}
.pbody .ev{font-size:11px;color:var(--fg-muted);margin:0 0 4px}
.pbody p{margin:0}

/* ---- beta-test round 1 ---- */
/* WHY U1: lines sit UNDER the blocks (blocks are opaque, so a line can never cross text) and are faint */
#bld>.floor,#bld>.tops{position:relative;z-index:1}
.floor,.tops .floor{background:transparent}
.blk{position:relative;z-index:1;background-color:var(--panel)}
.blk.planned{background:var(--panel)}
.blk.vision{background-color:var(--panel)}
.blk:hover{z-index:3}
/* WHY: dimming by block opacity let lines show through the text of dimmed blocks; dim the contents instead so the block stays solid */
body.lit .blk,body.lit .chip2{opacity:1}
body.lit .blk:not(.is-self):not(.is-below):not(.is-above)>*{opacity:.3}
body.lit .chip2{opacity:.4}
.phd .t-base{white-space:normal;line-height:1.3}
#lines path{stroke-width:1.1;opacity:.3}
#lines path.dash{stroke-width:1.2;opacity:.45}
/* WHY U1: the detail panel appears in place (no slide). A slide caught mid-flight by a screenshot or a slow
   machine looks cut off at the right edge. It is also sized to the frame, never wider than it. */
.panel,.panel.open{transition:none}
.panel{width:min(400px,calc(100vw - 24px))}
.panel.open{box-shadow:-8px 0 24px rgba(0,0,0,.08)}
body:has(.panel.open) .cc-main{padding-right:calc(min(400px,100vw - 24px) + 16px)}
.gl{border-bottom:1px dotted var(--fg-muted);cursor:help}
/* WHY U10: a visible cue when there is more below (the scrollbar is hidden) */
.morebelow{position:fixed;left:calc(50% - 120px);bottom:18px;z-index:4;font-size:11px;padding:3px 12px;border-radius:9999px;background:var(--panel);border:1px solid var(--edge-strong);color:var(--fg-2);box-shadow:var(--layer-shadow);cursor:pointer;display:none}
.morebelow.on{display:block}
'''

page = f'''<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouCoded - the vision, foundations up</title>
<script>if(window.self!==window.top)document.documentElement.classList.add('framed')</script>
<style>{CSS}</style></head><body>
<div class="screen">
<header class="band"><div class="bl"></div><div class="btitle">Where the vision stands: foundations up</div><div class="br"><span class="t-2xs muted asof">Facts as of Oct 12</span></div></header>
<div class="screen-body"><div class="pane"><div class="panescroll fadescroll" id="scroller"><main class="cc-main">
<div class="legend"><div class="lg1">Each block rests on the ones it needs. Hover or click one.</div><div><i class="sdot done"></i>exists</div><div><i class="sdot building"></i>being built</div><div><i class="sdot planned"></i>planned</div><div><i class="sdot vision"></i>only an idea (hatched)</div><div data-tip="Dashed outline and legs: something this block rests on is not built yet."><span class="lgf"></span>missing support</div></div>
<div class="topline">
 <div class="nxbox"><h2 data-tip="The unfinished things that the most other unfinished things are waiting on. Finish these first and the most opens up.">Build next <span>(unfinished, with the most resting on it)</span></h2><div class="nxs">{nxt_html}</div></div>
</div>
<div class="lit-key"><span class="k1">holds it up</span><span class="k2">it holds up</span><span class="k3">holds it up, but not finished</span></div>
<div id="bld"><svg id="lines" aria-hidden="true"></svg>{''.join(floors_html)}</div>
<details class="loose" id="loose"><summary>Everything else <span>({nloose} other features, nothing depends on them)</span></summary>{loose_html}</details>
</main></div></div></div></div>
<aside class="panel" id="panel" aria-label="Details"><div class="phd hline"><div class="t-base" id="pti"></div><button class="closebtn" aria-label="Close" id="pclose" data-tip="Close this panel"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div><div class="pbody fadescroll" id="pbody"></div></aside>
<button class="morebelow" id="mb" aria-label="Scroll down for more">More below &#8595;</button>
<div class="tipbubble tooltip-in" id="tb" hidden></div>
<script>
const D={json.dumps(DATA)};
const T={json.dumps(TITLES)};
const PARENT={json.dumps(PARENT)},PARTS={json.dumps(PARTS)},PIL={json.dumps(PILLAR_OF)},CONN={json.dumps(CONN)};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let pinned=null,hover=null;
const blk=id=>$('#bld .blk[data-id="'+CSS.escape(id)+'"]');
const GL={json.dumps(GLOSS)};
const gl=s=>{{let o=esc(s);GL.forEach(([p,t])=>{{o=o.replace(new RegExp('('+p+')'),'<span class="gl" data-tip="'+esc(t).replace(/"/g,'&quot;')+'">$1</span>')}});return o}};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const tell=(id,title)=>{{if(window.parent!==window)parent.postMessage({{bp:'focus',id:id,title:title}},'*')}};
function clear(){{$$('.blk').forEach(b=>b.classList.remove('is-self','is-below','is-above','notdone'));$$('.strip').forEach(s=>s.classList.remove('has-lit'));document.body.classList.remove('lit');$('#lines').innerHTML=''}}
function light(id){{
  clear();const d=D[id];if(!d||d.floor===null)return;
  document.body.classList.add('lit');
  const set=new Set([id,...d.below,...d.held]);
  const mark=(x,c)=>{{const b=blk(x);if(!b)return;b.classList.add(c);const s=b.closest('.strip');if(s&&!s.classList.contains('open'))s.classList.add('has-lit')}};
  mark(id,'is-self');
  d.below.forEach(x=>{{mark(x,'is-below');const b=blk(x);if(b&&D[x].status!=='done')b.classList.add('notdone')}});
  d.held.forEach(x=>mark(x,'is-above'));
  const root=$('#bld').getBoundingClientRect(),svg=$('#lines');let p='';
  set.forEach(a=>D[a].needs.forEach(n=>{{
    if(!set.has(n.id))return;const A=blk(a),B=blk(n.id);if(!A||!B||!A.offsetParent||!B.offsetParent)return;
    const ra=A.getBoundingClientRect(),rb=B.getBoundingClientRect();
    const x1=ra.left+ra.width/2-root.left,y1=ra.bottom-root.top,x2=rb.left+rb.width/2-root.left,y2=rb.top-root.top;
    const my=(y1+y2)/2,dash=D[n.id].status!=='done'?' class="dash"':'';
    p+=`<path${{dash}} d="M${{x1}} ${{y1}} C ${{x1}} ${{my}}, ${{x2}} ${{my}}, ${{x2}} ${{y2}}"/>`}}));
  svg.innerHTML=p;
}}
function refresh(){{const id=hover||pinned;if(id)light(id);else clear()}}
function pill(d){{return `<span class="spill"><i class="sdot ${{d.status}}"></i>${{d.word}}</span>`}}
function lnk(x){{const d=D[x.id]||{{title:T[x.id],status:'unchecked'}};return `<button class="ln" data-open="${{x.id}}"><span class="t"><i class="sdot ${{d.status}}"></i>${{esc(d.title)}}</span><span class="w">${{esc(x.why||'')}}</span></button>`}}
function firstSentence(t){{const m=t.match(/^.*?[.!?](\\s|$)/);let a=m?m[0].trim():t,r=t.slice(a.length).trim();
  if(a.length>130){{const cut=a.lastIndexOf(' ',125);r=(a.slice(cut)+' '+r).trim();a=a.slice(0,cut)+'\\u2026'}}return [a,r]}}
const names=ids=>{{const t=ids.map(x=>T[x]);return t.length>2?t.slice(0,2).join(', ')+' and '+(t.length-2)+' more':t.join(' and ')}};
function open_(id){{
  const d=D[id];if(!d)return;pinned=id;
  $('#pti').textContent=d.title;
  const [lead,rest]=firstSentence(d.why||'');
  const facts=[];
  if(d.floor!==null){{
    if(d.floating.length)facts.push('Missing support: waiting on <b>'+esc(names(d.floating))+'</b>');
    else facts.push(d.needs.length?'Everything it rests on exists.':'Needs nothing else.');
    const open=d.held.filter(h=>D[h].status!=='done').length;
    facts.push(open?`Holds up ${{open}} other unfinished thing${{open>1?'s':''}}.`:d.held.length?`Holds up ${{d.held.length}} other thing${{d.held.length>1?'s':''}}.`:'Nothing else depends on it yet.');
  }}else facts.push('Nothing else needs it, and it needs nothing else.');
  facts.push(esc(d.pillar)+(d.since?', since '+esc(d.since):''));
  let h=`<div class="pst">${{pill(d)}}</div>`;
  if(lead)h+=`<p class="t-xs">${{gl(lead)}}</p>`;
  h+=`<ul class="facts">${{facts.slice(0,3).map(f=>'<li>'+f+'</li>').join('')}}</ul>`;
  let m='';
  if(rest)m+=`<p class="t-xs">${{esc(rest)}}</p>`;
  if(d.catch)m+='<div class="alert">Marked as working, but its own evidence names a catch.</div>';
  if(d.floor!==null){{
    if(d.needs.length)m+=`<div><h3>Rests on</h3>${{d.needs.map(lnk).join('')}}</div>`;
    if(d.holds.length)m+=`<div><h3>Holds up</h3>${{d.holds.map(lnk).join('')}}</div>`;
  }}
  if(d.shares.length)m+=`<div><h3>Overlaps with</h3>${{d.shares.map(lnk).join('')}}</div>`;
  if(d.proof.length)m+=`<div><h3>What backs this up</h3>${{d.proof.map(e=>`<div class="ev">${{esc(e.note||e.kind)}}${{e.ref?' ('+esc(e.ref)+')':''}}</div>`).join('')}}</div>`;
  if(m)h+=`<details class="more"><summary>More</summary>${{m}}</details>`;
  $('#pbody').innerHTML=h;$('#panel').classList.add('open');
  // WHY: a finished block inside a collapsed strip must be visible when it is the thing being looked at
  const sb=blk(id)&&blk(id).closest('.strip');if(sb)setStrip(sb,true);
  tell(id,d.title);
  requestAnimationFrame(()=>{{refresh();const b=blk(id);if(b&&b.offsetParent)b.scrollIntoView({{block:'center',behavior:'instant'}});}});
}}
function setStrip(s,on){{s.classList.toggle('open',on);s.querySelector('.sbtn').setAttribute('aria-expanded',on)}}
function close_(){{const was=pinned;pinned=null;$('#panel').classList.remove('open');requestAnimationFrame(refresh);if(was)tell(null,null)}}
document.addEventListener('click',e=>{{
  const o=e.target.closest('[data-open]');if(o){{open_(o.dataset.open);return}}
  const sb=e.target.closest('.sbtn');if(sb){{const s=sb.parentElement;setStrip(s,!s.classList.contains('open'));requestAnimationFrame(refresh);return}}
  const b=e.target.closest('.blk,.nx,.chip2');if(b){{open_(b.dataset.id);return}}
  if(e.target.closest('#pclose')){{close_();return}}
}});
document.addEventListener('keydown',e=>{{if(e.key==='Escape')close_()}});
$('#bld').addEventListener('mouseover',e=>{{const b=e.target.closest('.blk');if(b&&b.dataset.id!==hover){{hover=b.dataset.id;refresh()}}}});
$('#bld').addEventListener('mouseleave',()=>{{hover=null;refresh()}});
$$('.nx').forEach(n=>{{n.addEventListener('mouseenter',()=>{{hover=n.dataset.id;refresh()}});n.addEventListener('mouseleave',()=>{{hover=null;refresh()}})}});
addEventListener('resize',refresh);
// WHY U10: the scrollbar is hidden, so mark the edges that have more beyond them (fade) and offer a "More below" cue
const sc=$('#scroller'),mb=$('#mb');
function fades(el){{const t=el.scrollTop>4,b=el.scrollTop+el.clientHeight<el.scrollHeight-4;el.dataset.fadeTop=t;el.dataset.fadeBottom=b;return b}}
function fadeAll(){{const b=fades(sc);mb.classList.toggle('on',b);fades($('#pbody'))}}
sc.addEventListener('scroll',fadeAll);$('#pbody').addEventListener('scroll',fadeAll);addEventListener('resize',fadeAll);
mb.addEventListener('click',()=>sc.scrollBy({{top:sc.clientHeight*0.7,behavior:'smooth'}}));
new ResizeObserver(fadeAll).observe($('#bld'));addEventListener('load',fadeAll);document.addEventListener('click',()=>setTimeout(fadeAll,50));
const tb=$('#tb');
document.addEventListener('mouseover',e=>{{const t=e.target.closest('[data-tip]');if(!t){{tb.hidden=true;return}}
  tb.textContent=t.dataset.tip;tb.hidden=false;const r=t.getBoundingClientRect(),w=tb.offsetWidth,h=tb.offsetHeight;
  let x=Math.min(Math.max(8,r.left+r.width/2-w/2),innerWidth-w-8),y=r.top-h-8;if(y<8)y=r.bottom+8;tb.style.transform=`translate(${{x}}px,${{y}}px)`}});
document.addEventListener('mouseleave',()=>tb.hidden=true);
// focus from the switcher: a node, or part:<id>. Map to the block itself, else the nearest block in the same system.
function mapFocus(f){{
  if(!f)return null;
  if(f.startsWith('part:')){{const v=(PARTS[f.slice(5)]||[]).find(x=>D[x]);if(v)return v;f=null;return null}}
  let k=f;while(k){{if(D[k]&&D[k].floor!==null)return k;k=PARENT[k]}}
  const pil=PIL[f];if(!pil)return D[f]?f:null;
  const kin=CONN.find(x=>PIL[x]===pil&&(PARENT[x]===PARENT[f]))||CONN.find(x=>PIL[x]===pil);
  return kin||(D[f]?f:null)}}
function applyFocus(){{const t=mapFocus(decodeURIComponent((location.hash.match(/focus=([^&]+)/)||[])[1]||''));if(t)open_(t)}}
addEventListener('load',applyFocus);addEventListener('hashchange',applyFocus);
</script></body></html>'''

with open(os.path.join(HERE, 'index.html'), 'w') as f:
    f.write(page)
print('floors', {f: len(v) for f, v in sorted(groups.items())}, 'loose', nloose, 'next', [(c, k) for c, k, _ in NEXT])
