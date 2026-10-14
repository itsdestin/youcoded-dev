"""The big-picture tab: the vision as a nested web of boxes, painted by evidence.

WHY this is its own module: the boxes come from Destin's words (vision-skeleton.json), never from
the code. Agents fill vision-evidence-*.json with status, evidence and relations. Rendering merges
the two; a node with no evidence file yet shows as "unchecked" rather than guessing.
"""
import json, os, html, glob

STATUS_WORD = {'done':'exists','building':'being built','planned':'planned','vision':'only an idea so far','unchecked':'not checked yet'}
E = html.escape

def load(here):
    sk = json.load(open(os.path.join(here, 'vision-skeleton.json')))
    ev_nodes, added, insights = {}, [], {}
    for f in sorted(glob.glob(os.path.join(here, 'vision-evidence-*.json'))):
        d = json.load(open(f))
        ev_nodes.update(d.get('nodes', {}))
        added += d.get('added', [])
        for k, v in d.get('insights', {}).items(): insights.setdefault(k, []).extend(v)
    # WHY: added features slot under their capability so the tree stays one tree.
    caps = {c['id']: c for p in sk['pillars'] for c in p['capabilities']}
    # WHY (2026-10-13): nine evidence items name a feature as their parent (e.g. 'Mac installers
    # signed' under 'Installs without scary warnings'); they used to vanish. They now sit in that
    # feature's capability, so the tree stays two levels deep and nothing found is hidden.
    feat_cap = {f['id']: c for p in sk['pillars'] for c in p['capabilities'] for f in c['features']}
    for a in added:
        c = caps.get(a.get('parent')) or feat_cap.get(a.get('parent'))
        if not c or any(f['id'] == a['id'] for f in c['features']): continue
        c['features'].append({'id': a['id'], 'title': a['title'], 'added': True})
        ev_nodes.setdefault(a['id'], {k: a.get(k) for k in ('status','since','evidence','why','needs','shares') if a.get(k) is not None})
    return sk, ev_nodes, insights

def flatten(sk):
    nodes = {}
    for p in sk['pillars']:
        nodes[p['id']] = dict(id=p['id'], title=p['title'], kind='pillar', pillar=p['id'], quote=p.get('quote'))
        for c in p['capabilities']:
            nodes[c['id']] = dict(id=c['id'], title=c['title'], kind='capability', pillar=p['id'], parent=p['id'], quote=c.get('quote'))
            for f in c['features']:
                nodes[f['id']] = dict(id=f['id'], title=f['title'], kind='feature', pillar=p['id'], parent=c['id'], added=f.get('added', False))
    return nodes

def track_for(nid, nodes, track_of):
    """TRACK — the nearest of feature, capability, area in the skeleton's track_of wins."""
    while nid:
        if nid in track_of: return track_of[nid]
        nid = nodes[nid].get('parent')
    return 'app'

def merge(nodes, ev):
    for nid, n in nodes.items():
        e = ev.get(nid, {})
        n['status'] = e.get('status', 'unchecked')
        n['since'] = e.get('since'); n['why'] = e.get('why'); n['evidence'] = e.get('evidence', [])
        n['needs'] = [x for x in e.get('needs', []) if isinstance(x, dict) and x.get('id') in nodes]
        n['shares'] = [x for x in e.get('shares', []) if isinstance(x, dict) and x.get('id') in nodes]
        n['needed_by'] = []
    for nid, n in nodes.items():
        for x in n['needs']: nodes[x['id']]['needed_by'].append(dict(id=nid, because=x.get('because', '')))
    # WHY: a capability with no status of its own is summarised from its features, in words not percentages.
    for nid, n in nodes.items():
        if n['kind'] == 'feature': continue
        kids = [m for m in nodes.values() if m.get('parent') == nid] if n['kind'] == 'capability' else [m for m in nodes.values() if m['kind'] == 'feature' and m['pillar'] == nid]
        n['counts'] = {s: sum(1 for k in kids if k['status'] == s) for s in STATUS_WORD}
        n['total'] = len(kids)
    return nodes

def bar(counts, total):
    if not total: return ''
    segs = ''.join(f'<i class="seg {s}" style="flex:{counts.get(s,0)}"></i>' for s in ('done','building','planned','vision','unchecked') if counts.get(s))
    return f'<div class="vbar" data-tip="{E(words(counts,total).capitalize() + ". " + TIPS["vis.bar"])}">{segs}</div>'

def words(counts, total):
    parts = []
    for s in ('done','building','planned','vision'):
        if counts.get(s): parts.append(f"{counts[s]} {STATUS_WORD[s].replace('only an idea so far','still ideas')}")
    if counts.get('unchecked'): parts.append(f"{counts['unchecked']} not checked yet")
    return f"of {total}: " + ', '.join(parts)

MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
def nice(d):
    """2026-10-08 -> 'Oct 8' (U9: a student cannot tell 10/08 from 8 October)."""
    try: return f"{MONTHS[int(d[5:7])-1]} {int(d[8:10])}"
    except Exception: return d

def dot(status):
    return f'<i class="sdot {E(status)}" aria-hidden="true"></i>'

TIPS = {}
def legend():
    # WHY each entry carries its hint: "exists" and "only an idea" are the page's own words for a status
    return ''.join(f'<span class="leg" data-tip="{E(TIPS["status." + s])}">{dot(s)}{w}</span>' for s, w in (('done','exists'),('building','being built'),('planned','planned'),('vision','only an idea')))

def render(here, tip, track_short):
    """WHY the cut (2026-10-13, Destin: "a confusing fucking disaster to navigate.... just wayyy too
    many controls"): the By area / By track switch and the four filter pills are gone. The tab opens
    on the mission, the two boxes and the ten area cards. Three plain links under the mission ask the
    only questions that were used: what is blocked, what is built twice, what shipped this month; each
    shows a flat list. Tracks stay as data: a small label on each item and a line on each area card."""
    TIPS.update(tip)
    T = lambda k: E(tip[k])
    sk, ev, insights = load(here)
    nodes = merge(flatten(sk), ev)
    tracks = sk.get('tracks', [{'id': 'app', 'title': 'The app', 'about': ''}])
    track_of = sk.get('track_of', {})
    for nid, n in nodes.items(): n['track'] = track_for(nid, nodes, track_of)
    screens_of = sk.get('screens_of', {})
    for nid, n in nodes.items():
        cap = nid if n['kind'] == 'capability' else n.get('parent') if n['kind'] == 'feature' else None
        n['screens'] = screens_of.get(cap, []) if cap else sorted({x for c, m in nodes.items() if m.get('parent') == nid and m['kind'] == 'capability' for x in screens_of.get(c, [])})
    feats = [n for n in nodes.values() if n['kind'] == 'feature']
    tot = {s: sum(1 for n in feats if n['status'] == s) for s in STATUS_WORD}
    blockers = sorted([n for n in feats if n['status'] in ('vision','planned') and n['needed_by']], key=lambda n: -len(n['needed_by']))[:6]
    recent = sorted([n for n in feats if n['status'] == 'done' and n['since'] and n['since'] >= '2026-09-12'], key=lambda n: n['since'], reverse=True)
    out = []
    out.append(f'''<div class="card mission"><div class="eyebrow" data-tip="{T('vis.mission')}">Your mission</div><div class="t-base mtext">{E(sk['mission'])}</div>
      <div class="t-sm dim msum">Of the {len(feats)} things you have said the app should do, <b>{tot['done']}</b> exist, <b>{tot['building']}</b> are being built, <b>{tot['planned']}</b> are planned and <b>{tot['vision']}</b> are only ideas{(' (' + str(tot['unchecked']) + ' not checked yet)') if tot['unchecked'] else ''}.</div>
      {bar(tot, len(feats))}<div class="legend t-2xs">{legend()}</div>
      <div class="vlinks t-sm"><button class="lnk" data-lens="blocked" aria-pressed="false" data-tip="{T('vis.blocked')}">What's blocked</button><span class="muted" aria-hidden="true">·</span><button class="lnk" data-lens="twice" aria-pressed="false" data-tip="{T('vis.twice')}">Built twice</button><span class="muted" aria-hidden="true">·</span><button class="lnk" data-lens="shipped" aria-pressed="false" data-tip="{T('vis.shipped')}">Shipped this month</button></div></div>''')
    out.append('<div id="voverview">')
    if blockers or recent:
        out.append('<div class="vinsights">')
        if blockers:
            out.append(f'<div class="card"><div class="eyebrow" data-tip="{T("vis.waitingon")}">What most things are waiting on</div>' + ''.join(f'<button class="irow" data-focus="{E(b["id"])}" data-tip="{E(TIPS["status." + b["status"]])} Click for details.">{dot(b["status"])}<span class="t-sm">{E(b["title"])}</span><span class="t-2xs muted irmeta" data-tip="{E(_needtip(len(b["needed_by"]), tip))}">{len(b["needed_by"])} need it</span></button>' for b in blockers) + '</div>')
        if recent:
            out.append(f'<div class="card"><div class="eyebrow" data-tip="{T("vis.becamereal")}">Became real in the last month</div>' + ''.join(f'<button class="irow" data-focus="{E(r["id"])}" data-tip="{T("vis.row")}">{dot("done")}<span class="t-sm">{E(r["title"])}</span><span class="t-2xs muted irmeta" data-tip="{T("vis.since")}">{E(nice(r["since"]))}</span></button>' for r in recent[:8]) + '</div>')
        out.append('</div>')
    out.append(f'<div class="sechead"><div class="gtext"><h2 class="gh"><span data-tip="{T("vis.areas")}">Areas</span><span class="cnt" data-tip="{T("vis.areas.count")}">{len(sk["pillars"])}</span></h2></div></div><div class="pgrid">')
    for p in sk['pillars']:
        n = nodes[p['id']]; c = n['counts']
        fs = [f for f in feats if f['pillar'] == p['id']]
        tr = [t for t in tracks if any(f['track'] == t['id'] for f in fs)]
        caps = ' · '.join(E(x['title']) for x in p['capabilities'])
        # WHY a line of words, not badges: an area that mixes lines of work says so; the hint says what a track is
        trl = f'<div class="t-2xs muted trkline" data-tip="{T("vis.tracks")}">{"Mixes" if len(tr) > 1 else "Track"}: {E(" · ".join(t["title"] for t in tr))}</div>' if tr else ''
        out.append(f'''<button class="card card-interactive pcard" data-open="{E(p['id'])}" data-tip="{T('vis.card')}"><div class="pctop"><span class="t-base">{E(p['title'])}</span></div>
          <div class="t-xs dim">{c.get('done',0)} of {n['total']} exist{(' · ' + str(c['building']) + ' being built') if c.get('building') else ''}</div>{bar(c, n['total'])}
          <div class="t-2xs pccaps">{caps}</div>{trl}<div class="pcopen t-xs fw">See inside<span class="chev" aria-hidden="true">›</span></div></button>''')
    out.append('</div></div>')
    out.append(f'<div id="vlist" hidden><div class="sechead"><div class="gtext"><h2 class="gh"><span id="vlt"></span><span class="cnt" id="vlc" data-tip="{T("vis.list.count")}"></span></h2><p class="gdesc" id="vld"></p></div><button class="btn sm" id="vall" data-tip="{T("vis.everything")}">Show everything</button></div><div class="card vlistcard" id="vlrows"></div></div>')
    out.append(f'<div id="vdetail" hidden><div class="vback"><button class="btn sm" id="vback" data-tip="{T("vis.back")}">‹ Back to all areas</button></div></div>')
    TT = {t['id']: t for t in tracks}
    def capbox(cid, label, fids):
        h = [f'<div class="cap" data-id="{E(cid)}"><button class="caphead t-xs" data-focus="{E(cid)}" data-tip="{T("vis.cap")}">{E(label)}</button><div class="chips">']
        for fid in fids:
            fn = nodes[fid]
            # WHY the track as a label on the item (2026-10-13 cut): tracks are no longer a page mode
            h.append(f'<button class="chip {E(fn["status"])}{" added" if fn.get("added") else ""}" data-focus="{E(fid)}" data-tip="{E(tip["status." + fn["status"]] + " Track: " + TT[fn["track"]]["title"] + ".")}">{dot(fn["status"])}{E(fn["title"])}<span class="ctrk" data-tip="{E(tip["track." + fn["track"]])}">{E(track_short[fn["track"]])}</span></button>')
        h.append('</div></div>')
        return ''.join(h)
    out.append('<div class="web" id="web-area" hidden><svg class="lines"></svg>')
    for p in sk['pillars']:
        n = nodes[p['id']]
        boxes = [capbox(c['id'], c['title'], [f['id'] for f in c['features']]) for c in p['capabilities'] if c['features']]
        ins = insights.get(p['id'], [])
        out.append(f'''<section class="pillar" data-id="{E(p['id'])}"><header class="phead"><div class="t-base ptitle">{E(p['title'])}</div>
          {f'<div class="quote t-xs">“{E(p["quote"])}”</div>' if p.get('quote') else ''}
          <div class="t-xs dim">{E(words(n['counts'], n['total']))}</div>{bar(n['counts'], n['total'])}<div class="legend t-2xs">{legend()}</div></header>
          <div class="caps">{''.join(boxes)}</div>''' +
          (f'<details class="fold pins"><summary class="foldrow" data-tip="{T("vis.evidence")}"><span class="t-xs">What the evidence says about this area</span><span class="chev" aria-hidden="true">›</span></summary><ul class="t-xs">' + ''.join(f'<li>{E(i)}</li>' for i in ins) + '</ul></details>' if ins else '') + '</section>')
    out.append('</div>')
    data = {nid: {k: n.get(k) for k in ('id','title','kind','pillar','parent','quote','status','since','why','evidence','needs','shares','needed_by','added','track','screens')} for nid, n in nodes.items()}
    data['_tracks'] = {t['id']: t['title'] for t in tracks}
    data['_short'] = track_short
    return ''.join(out), data, dict(total=len(feats), **tot)

def _needtip(n, tip):
    """'6 need it' -> 'Six other things on this page cannot be built until this exists.'"""
    if n == 1: return 'One other thing on this page cannot be built until this exists.'
    word = ['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'][n] if n <= 10 else str(n)
    return word + ' ' + tip['vis.needit']

CSS = '''
/* Big picture. Shared looks come from cc.css; this only arranges them. WHY rewritten (2026-10-13,
   audit.md #14, #27-#29): boxes, chips and bars now use the app's card levels, ProgressBar and
   action-chip recipes instead of their own numbers. */
.mission{margin-bottom:16px} .mission .mtext{max-width:880px;margin-top:4px} .mission .msum{margin-top:8px} .mission .vbar{margin-top:12px}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;color:var(--fg-muted)} .leg{display:inline-flex;align-items:center;gap:6px}
/* ProgressBar.tsx: 'h-1.5 rounded-full bg-inset overflow-hidden' */
.vbar{display:flex;height:6px;border-radius:var(--radius-full);overflow:hidden;background:var(--inset)} .vbar .seg{display:block}
.seg.done{background:var(--status-ok)} .seg.building{background:var(--fg-muted)} .seg.planned{background:var(--fg-faint)} .seg.vision{background:repeating-linear-gradient(45deg,var(--fg-faint) 0 2px,transparent 2px 5px)} .seg.unchecked{background:var(--status-warn);opacity:.5}
/* status dots: dot + neutral text */
.sdot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;border:1.5px solid var(--fg-muted);box-sizing:border-box}
.sdot.done{background:var(--status-ok);border-color:var(--status-ok)}
.sdot.building{background:linear-gradient(90deg,var(--fg-2) 50%,transparent 50%);border-color:var(--fg-2)}
.sdot.planned{background:transparent}
.sdot.vision{border-style:dotted;border-color:var(--fg-muted)}
.sdot.unchecked{border-color:var(--status-warn)}
.vinsights{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
/* plain rows inside a card (decisions "List rows by job": pick-one lists are plain rows, hover highlights) */
.irow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:0;border-radius:var(--radius-md);padding:6px 8px;margin:0 -8px;color:var(--fg);cursor:pointer;transition:background-color 120ms steps(4)}
.vinsights .eyebrow{margin-bottom:6px}
.irow .t-sm{flex:1;min-width:0} .irmeta{white-space:nowrap}
@media (hover:hover){.irow:hover{background:var(--inset)}} .irow:active{background:var(--edge)} .irow:focus-visible{outline:2px solid var(--accent)}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.pcard{color:var(--fg);text-align:left;display:flex;flex-direction:column;gap:8px}
.pctop{display:flex;align-items:center;gap:8px} .pctop .t-base{flex:1}
.pccaps{line-height:1.5;color:var(--fg-2)} /* WHY fg-2 (U12): fg-muted read as disabled on Midnight */
.pcard{height:100%} .pcopen{margin-top:auto;display:flex;align-items:center;justify-content:flex-end;gap:2px;color:var(--fg-2)}
.pgrid .legend,.sechead .legend{margin-top:2px}
.vback{margin:0 0 12px}
.web{position:relative;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;align-items:start}
.web.detail{grid-template-columns:1fr}
.lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:hidden}
/* an area = a raised first-level card; each capability inside = the nested level (CARD_LEVEL_2) */
.pillar{background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-xl);box-shadow:var(--layer-shadow);padding:16px}
.phead{margin-bottom:12px;display:flex;flex-direction:column;gap:6px} .phead .vbar{max-width:480px}
.ptitle{cursor:pointer} .web.detail .ptitle{font-size:18px;font-weight:500}
.web:not(.detail) .quote{display:none}
.caps{display:grid;gap:8px;grid-template-columns:1fr} .web.detail .caps{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.cap{background:var(--inset);border:1px solid var(--edge-card);border-radius:var(--radius-lg);padding:12px}
.caphead{font-size:12px;font-weight:500;background:none;border:0;padding:0;margin:0 0 8px;color:var(--fg-muted);cursor:pointer;text-align:left} .caphead:hover{color:var(--fg)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
/* a clickable item is an action chip = Button secondary sm ('rounded-lg border-edge-strong text-fg-2 text-2xs px-2.5 py-1') */
.chip{font-size:11px;line-height:14px;font-weight:500;text-align:left;padding:4px 10px;border-radius:var(--radius-lg);border:1px solid var(--edge-strong);background:transparent;color:var(--fg-2);cursor:pointer;max-width:100%;display:inline-flex;align-items:center;gap:6px;transition:background-color var(--dur-hover),box-shadow var(--dur-hover)}
@media (hover:hover){.chip:hover{background:var(--panel);color:var(--fg)}} .chip:active{background:var(--edge)} .chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.chip.added::after{content:" +";color:var(--fg-muted)}
.chip.hide,.cap.hide,.pillar.hide{display:none}
.chip.focus{box-shadow:0 0 0 2px var(--accent)} .chip.rel{box-shadow:0 0 0 2px var(--status-ok)} .chip.relby{box-shadow:0 0 0 2px var(--tag-blue)}
.pins{margin-top:12px} .pins ul{margin:0 12px 12px;padding-left:18px;color:var(--fg-2)} .pins li{margin:4px 0}
.ev{margin:0 12px 12px;padding-left:0;list-style:none} .ev li{padding:4px 0} .ev .kind{display:inline-block;min-width:72px;color:var(--fg-muted)}
.quote{border-left:2px solid var(--edge);padding-left:8px;color:var(--fg-2);font-style:italic;margin:4px 0;max-width:880px}
/* side-panel lists: plain rows, no lines between them (decisions "Card levels": no full-width lines in a popup) */
.panel .vlink{cursor:pointer;padding:6px 8px;margin:0 -8px;border-radius:var(--radius-md);display:flex;gap:8px;align-items:baseline;transition:background-color 120ms steps(4)}
@media (hover:hover){.panel .vlink:hover{background:var(--inset)}}
.panel .eyebrow + .vlink{margin-top:4px}
.trkline{display:flex;gap:4px;flex-wrap:wrap}
.badge.trk{font-size:11px}
/* the three questions under the mission: plain text links (2026-10-13 cut: they replaced a mode switch and four pills) */
.vlinks{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.lnk{color:var(--fg);text-decoration:underline;text-decoration-color:var(--edge-strong);text-underline-offset:3px;cursor:pointer;background:none;border:0;padding:0;font:inherit}
.lnk[aria-pressed="true"]{font-weight:600;text-decoration-color:var(--fg)}
.lnk:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* an item's track: a small quiet word after its name */
.ctrk{font-size:10px;font-weight:400;color:var(--fg-muted);margin-left:2px;white-space:nowrap}
.chip .ctrk::before{content:"· "}
.vlistcard{display:flex;flex-direction:column;gap:2px;padding:8px 16px}
.vlistcard .irow{align-items:flex-start} .vlistcard .irow .sdot{margin-top:5px}
.vlbody{flex:1;min-width:0;display:flex;flex-direction:column}
.vshots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.vshot{border:1px solid var(--edge-card);border-radius:var(--radius-md);background:var(--well);padding:0;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;color:var(--fg-2)}
.vshot img{height:64px;width:100%;object-fit:contain;padding:4px}
.vshot span{font-size:11px;padding:2px 6px;background:var(--panel);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
@media (hover:hover){.vshot:hover{border-color:var(--edge-strong)}}
@media (max-width:760px){.vinsights{grid-template-columns:1fr}}
'''

JS = r'''
const VN=%s; const SW=%s; const TRK=VN._tracks, TSH=VN._short; delete VN._tracks; delete VN._short;
// WHY one look and three questions (2026-10-13 cut): vLens is 'all' or one of the three links under the mission
let vLens='all', vOpen=null;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function nice(d){const m=/^\d{4}-(\d\d)-(\d\d)$/.exec(d||'');return m?MON[+m[1]-1]+' '+(+m[2]):(d||'')}
function shown(el){return el&&el.offsetParent!==null}
function web(){return $('#web-area')} function svg(){return web().querySelector('.lines')}
function center(el){const r=el.getBoundingClientRect(),w=web().getBoundingClientRect();return {x:r.left-w.left+r.width/2,y:r.top-w.top+r.height/2}}
function line(a,b,cls){if(!shown(a)||!shown(b))return;const p=center(a),q=center(b);const dx=(q.x-p.x)/2;const el=document.createElementNS('http://www.w3.org/2000/svg','path');el.setAttribute('d',`M${p.x},${p.y} C${p.x+dx},${p.y} ${q.x-dx},${q.y} ${q.x},${q.y}`);el.setAttribute('class',cls);svg().appendChild(el)}
function chipOf(id){return web().querySelector(`.chip[data-focus="${CSS.escape(id)}"]`)}
const OPEN=['vision','planned','building'];
const FEATS=Object.values(VN).filter(n=>n.kind==='feature');
const titles=xs=>xs.map(x=>VN[x.id].title).join(', ');
// the three questions: which items match, what the small line under each says, and the heading
const LISTS={
  blocked:{t:"What's blocked",d:'Each of these cannot be built until something else exists first.',
    items:()=>FEATS.filter(n=>n.status!=='done'&&(n.needs||[]).some(x=>OPEN.includes(VN[x.id].status))),
    meta:n=>'Waits on: '+titles(n.needs.filter(x=>OPEN.includes(VN[x.id].status)))},
  twice:{t:'Built twice',d:'Each of these shares parts with another item, so the shared part could be built once.',
    items:()=>FEATS.filter(n=>(n.shares||[]).length),meta:n=>'Shares parts with: '+titles(n.shares)},
  shipped:{t:'Shipped this month',d:'Everything that started to exist since Oct 1, newest first.',
    items:()=>FEATS.filter(n=>n.status==='done'&&(n.since||'')>='2026-10-01').sort((a,b)=>a.since<b.since?1:-1),meta:n=>'Since '+nice(n.since)}};
function vList(){const L=LISTS[vLens],xs=L.items();$('#vlt').textContent=L.t;$('#vlc').textContent=xs.length;$('#vld').textContent=L.d;
  $('#vlrows').innerHTML=xs.map(n=>`<button class="irow" data-focus="${n.id}" data-tip="${esc(TIP['status.'+n.status]+' Click for details.')}"><i class="sdot ${n.status}" aria-hidden="true"></i><span class="vlbody"><span class="t-sm">${esc(n.title)}</span><span class="t-2xs muted">${esc(VN[n.pillar].title)} · ${esc(L.meta(n))}</span></span><span class="ctrk" data-tip="${T('track.'+n.track)}">${TSH[n.track]}</span></button>`).join('')||'<div class="empty">Nothing here.</div>'}
function vApply(){$$('.web .lines').forEach(s=>s.innerHTML='');$$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const list=vLens!=='all',over=!list&&!vOpen;
  $('#voverview').hidden=!over;$('#vlist').hidden=!list;$('#vdetail').hidden=list||!vOpen;
  web().hidden=list||!vOpen;web().classList.toggle('detail',!!vOpen);
  $$('.vlinks [data-lens]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lens===vLens?'true':'false'));
  if(list){vList();return}
  if(vOpen)web().querySelectorAll('.pillar').forEach(p=>p.classList.toggle('hide',p.dataset.id!==vOpen))}
function openSection(id){vOpen=id;vLens='all';vApply();$('#scroller').scrollTop=0;fades()}
$$('.pcard').forEach(c=>c.onclick=()=>openSection(c.dataset.open));
$('#vback').onclick=()=>{vOpen=null;vApply();$('#scroller').scrollTop=0;fades()};
$('#vall').onclick=()=>{vLens='all';vOpen=null;closePanel();vApply();fades()};
// WHY pressing the pressed link goes back (G-14): the same rule as the filter pills
$$('.vlinks [data-lens]').forEach(b=>b.onclick=()=>{vLens=vLens===b.dataset.lens?'all':b.dataset.lens;vOpen=null;closePanel();vApply();$('#scroller').scrollTop=0;fades()});
function focus(id){const n=VN[id];if(!n)return;
  // WHY: from the overview an item opens its area; inside a flat list it stays in the list and only opens the details
  // WHY the BPV check (round 3): only the Areas view opens the item's area; the other views just open the panel
  if((window.BPV||'areas')==='areas'&&vLens==='all'&&vOpen!==n.pillar){vOpen=n.pillar;vApply()}
  $$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const ev=(n.evidence||[]);const kids=Object.values(VN).filter(m=>m.parent===id);
  const where=n.kind==='feature'?VN[n.pillar].title+' › '+VN[n.parent].title:(n.kind==='capability'?VN[n.pillar].title:'Area');
  const row=(x,extra)=>`<div class="vlink" data-focus="${x.id}" data-tip="${T('vis.row')}"><i class="sdot ${VN[x.id].status}" aria-hidden="true"></i><div><b class="t-sm">${VN[x.id].title}</b>${extra?`<div class="t-xs muted">${extra}</div>`:''}</div></div>`;
  const head=(w,k,cnt)=>`<div class="eyebrow pe" data-tip="${T(k)}">${w}${cnt!=null?` <span class="cnt" data-tip="${T(k+'.count')}">${cnt}</span>`:''}</div>`;
  // cross-links: the screens this part of the vision shows up on, and the open work on those screens
  const scr=typeof screensMatching==='function'?screensMatching(n.screens||[]):[];
  const work=[...new Set(scr.flatMap(s=>GI[s].work))].map(i=>EFF[i]);
  openPanel(where,n.title,`
  ${n.quote?`<div class="quote t-xs">“${n.quote}”</div>`:''}
  ${n.kind==='feature'?`<div class="statusline t-xs" data-tip="${T('status.'+n.status)}"><i class="sdot ${n.status}" aria-hidden="true"></i>${SW[n.status]}${n.since?' · since '+nice(n.since):''} · <span class="badge trk" data-tip="${T('track.'+n.track)}">${TRK[n.track]}</span></div><p class="t-sm">${n.why||'<span class="missing">No evidence gathered yet.</span>'}</p>`:''}
  ${kids.length?head('Inside','vis.inside',kids.length)+kids.map(k=>row(k,SW[k.status]+(k.kind==='feature'?' · '+TRK[k.track]:''))).join(''):''}
  ${(n.needs||[]).length?head('Needs first','vis.p.needs')+n.needs.map(x=>row(x,x.because)).join(''):''}
  ${(n.needed_by||[]).length?head('Needed by','vis.p.neededby')+n.needed_by.map(x=>row(x,x.because)).join(''):''}
  ${(n.shares||[]).length?head('Shares parts with','vis.p.shares')+n.shares.map(x=>row(x,x.because)).join(''):''}
  ${scr.length?head('Where it shows up','vis.wherescreens',scr.length)+`<div class="vshots">${scr.slice(0,6).map(s=>`<button class="vshot" data-shot="${s}" data-tip="${T('vis.shot')}"><img src="${GI[s].states[0].img}" alt=""><span>${GI[s].t}</span></button>`).join('')}</div>${scr.length>6?`<div class="t-xs muted">Showing 6 of ${scr.length}.</div>`:''}`:''}
  ${work.length?head('Work on those screens','vis.p.work')+work.map(w=>`<div class="row slim"><div class="body"><div class="t-xs">${w.title}</div><div class="hint">last worked on ${w.days===0?'today':w.days+' days ago'}</div></div></div>`).join(''):''}
  ${ev.length?`<details class="fold pe"><summary class="foldrow" data-tip="${T('vis.howknow')}"><span class="t-xs">How we know <span class="cnt" data-tip="${T('vis.howknow.count')}">${ev.length}</span></span><span class="chev">›</span></summary><ul class="ev t-xs">${ev.map(e=>`<li><span class="kind">${e.kind}</span>${e.note||''} <span class="muted">${nice(e.date||'')}</span><div class="muted t-2xs">${e.ref||''}</div></li>`).join('')}</ul></details>`:''}`,
  `<button class="btn" data-does data-tip="${T('vis.wrong')}">That's wrong</button><button class="btn primary" data-does data-tip="${T('vis.start')}">Start a session on this</button>`);
  $$('#pbody .vshot').forEach(b=>b.onclick=()=>openShot(b.dataset.shot));
  if(web().hidden)return;
  requestAnimationFrame(()=>{svg().innerHTML='';const me=chipOf(id);if(me){me.classList.add('focus');me.scrollIntoView({block:'nearest'})}
    (n.needs||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('rel');line(me,b,'dep')}});
    (n.needed_by||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('relby');line(b,me,'dep by')}});
    (n.shares||[]).forEach(x=>line(me,chipOf(x.id),'share'))})}
document.addEventListener('click',e=>{const t=e.target.closest('[data-focus]');if(t){e.preventDefault();focus(t.dataset.focus)}});
vApply();
'''
SVG_CSS = '''
.lines path{fill:none;stroke-width:1.5} .lines .dep{stroke:var(--status-ok)} .lines .dep.by{stroke:var(--tag-blue)} .lines .share{stroke:var(--tag-purple);stroke-dasharray:4 3}
'''
