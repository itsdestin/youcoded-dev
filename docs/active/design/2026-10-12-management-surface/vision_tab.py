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
    return f'<div class="vbar" title="{E(words(counts,total))}">{segs}</div>'

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

LEGEND = ''.join(f'<span class="leg">{dot(s)}{w}</span>' for s, w in (('done','exists'),('building','being built'),('planned','planned'),('vision','only an idea')))

def render(here):
    """WHY the rebuild (2026-10-12 review): the old tab drew all 10 areas and ~160 items at once,
    plus six lens tabs and a checkbox. Now the first view is ten area cards (one line each); the
    items appear only when you open one area, or when a filter asks a question across all of them.
    WHY tracks (2026-10-13, Destin: "the big picture needs to make it easier to more clearly delineate
    different development tracks"): every item also belongs to one track (skeleton track_of). You
    switch between seeing the app by area or by track, and inside an area each track is its own lane."""
    sk, ev, insights = load(here)
    nodes = merge(flatten(sk), ev)
    tracks = sk.get('tracks', [{'id': 'app', 'title': 'The app', 'about': ''}])
    TT = {t['id']: t for t in tracks}
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
    def counts(fs): return {s: sum(1 for f in fs if f['status'] == s) for s in STATUS_WORD}
    out = []
    out.append(f'''<div class="card mission"><div class="eyebrow">Your mission</div><div class="t-base mtext">{E(sk['mission'])}</div>
      <div class="t-sm dim msum">Of the {len(feats)} things you have said the app should do, <b>{tot['done']}</b> exist, <b>{tot['building']}</b> are being built, <b>{tot['planned']}</b> are planned and <b>{tot['vision']}</b> are only ideas{(' (' + str(tot['unchecked']) + ' not checked yet)') if tot['unchecked'] else ''}.</div>
      {bar(tot, len(feats))}<div class="legend t-2xs">{LEGEND}</div></div>''')
    # the control bar: same pattern as Screens. SegmentedTabs = how you look; filter pills = what you see.
    out.append('''<div class="lensbar vbarctl"><div class="tabs vmode" role="tablist" aria-label="Look at it"><button role="tab" aria-selected="true" data-vmode="area">By area</button><button role="tab" aria-selected="false" data-vmode="track">By track</button></div>
      <div class="fchips vlens" role="group" aria-label="Show only"><button class="fchip" data-lens="missing" aria-pressed="false">Not started</button><button class="fchip" data-lens="building" aria-pressed="false">Being built</button><button class="fchip" data-lens="blocked" aria-pressed="false">Waiting on something</button><button class="fchip" data-lens="shared" aria-pressed="false">Built twice</button></div>
      <span class="t-xs muted lensnote"></span></div>''')
    out.append('<div id="voverview">')
    if blockers or recent:
        out.append('<div class="vinsights">')
        if blockers:
            out.append('<div class="card"><div class="eyebrow">Most things are waiting on</div>' + ''.join(f'<button class="irow" data-focus="{E(b["id"])}">{dot(b["status"])}<span class="t-sm">{E(b["title"])}</span><span class="t-2xs muted irmeta">{len(b["needed_by"])} need it</span></button>' for b in blockers) + '</div>')
        if recent:
            out.append('<div class="card"><div class="eyebrow">Became real in the last month</div>' + ''.join(f'<button class="irow" data-focus="{E(r["id"])}">{dot("done")}<span class="t-sm">{E(r["title"])}</span><span class="t-2xs muted irmeta">{E(nice(r["since"]))}</span></button>' for r in recent[:8]) + '</div>')
        out.append('</div>')
    # area cards
    out.append(f'<div class="vgrid" data-mode="area"><div class="sechead"><div class="gtext"><h2 class="gh">Areas<span class="cnt">{len(sk["pillars"])}</span></h2></div></div><div class="pgrid">')
    for p in sk['pillars']:
        n = nodes[p['id']]; c = n['counts']
        fs = [f for f in feats if f['pillar'] == p['id']]
        tr = [t for t in tracks if any(f['track'] == t['id'] for f in fs)]
        caps = ' · '.join(E(x['title']) for x in p['capabilities'])
        # WHY the track line: an area that mixes tracks says so on its card, in words
        trl = f'<div class="trkline">{"".join(f"<span class=\'badge trk\'>{E(t["title"])}</span>" for t in tr)}</div>' if len(tr) > 1 else f'<div class="trkline"><span class="badge trk">{E(tr[0]["title"])}</span></div>' if tr else ''
        out.append(f'''<button class="card card-interactive pcard" data-open="{E(p['id'])}"><div class="pctop"><span class="t-base">{E(p['title'])}</span></div>
          <div class="t-xs dim">{c.get('done',0)} of {n['total']} exist{(' · ' + str(c['building']) + ' being built') if c.get('building') else ''}</div>{bar(c, n['total'])}
          <div class="t-2xs pccaps">{caps}</div>{trl}<div class="pcopen t-xs fw">See inside<span class="chev" aria-hidden="true">›</span></div></button>''')
    out.append('</div></div>')
    # track cards
    out.append(f'<div class="vgrid" data-mode="track" hidden><div class="sechead"><div class="gtext"><h2 class="gh">Tracks<span class="cnt">{len(tracks)}</span></h2><p class="gdesc">A track is the line of work an item belongs to, whichever area of the app it shows up in.</p></div></div><div class="pgrid">')
    for t in tracks:
        fs = [f for f in feats if f['track'] == t['id']]
        if not fs: continue
        c = counts(fs)
        areas = [p for p in sk['pillars'] if any(f['pillar'] == p['id'] for f in fs)]
        out.append(f'''<button class="card card-interactive pcard" data-open="{E(t['id'])}"><div class="pctop"><span class="t-base">{E(t['title'])}</span></div>
          <div class="t-xs dim">{c.get('done',0)} of {len(fs)} exist{(' · ' + str(c['building']) + ' being built') if c.get('building') else ''}</div>{bar(c, len(fs))}
          <div class="t-2xs pccaps">{E(t['about'])}</div><div class="t-2xs muted">In {E(' · '.join(p['title'] for p in areas))}</div><div class="pcopen t-xs fw">See inside<span class="chev" aria-hidden="true">›</span></div></button>''')
    out.append('</div></div></div>')
    out.append('<div id="vdetail" hidden><div class="vback"><button class="btn sm" id="vback">‹ Back</button></div></div>')
    def capbox(cid, label, fids):
        h = [f'<div class="cap" data-id="{E(cid)}"><button class="caphead t-xs" data-focus="{E(cid)}">{E(label)}</button><div class="chips">']
        for fid in fids:
            fn = nodes[fid]
            h.append(f'<button class="chip {E(fn["status"])}{" added" if fn.get("added") else ""}" data-focus="{E(fid)}" title="{E(STATUS_WORD[fn["status"]])}">{dot(fn["status"])}{E(fn["title"])}</button>')
        h.append('</div></div>')
        return ''.join(h)
    def section(sid, title, quote, cnt, total, lanes, ins):
        h = [f'''<section class="pillar" data-id="{E(sid)}"><header class="phead"><div class="t-base ptitle">{E(title)}</div>
          {f'<div class="quote t-xs">“{E(quote)}”</div>' if quote else ''}
          <div class="t-xs dim">{E(words(cnt, total))}</div>{bar(cnt, total)}<div class="legend t-2xs">{LEGEND}</div></header>''']
        for lane_title, lane_about, boxes in lanes:
            if not boxes: continue
            h.append(f'<div class="lane">' + (f'<div class="lanehead"><span class="t-xs fw">{E(lane_title)}</span>{f"<span class=\'t-2xs muted\'>{E(lane_about)}</span>" if lane_about else ""}</div>' if lane_title else '') + '<div class="caps">' + ''.join(boxes) + '</div></div>')
        if ins: h.append('<details class="fold pins"><summary class="foldrow"><span class="t-xs">What the evidence says about this area</span><span class="chev" aria-hidden="true">›</span></summary><ul class="t-xs">' + ''.join(f'<li>{E(i)}</li>' for i in ins) + '</ul></details>')
        h.append('</section>')
        return ''.join(h)
    # by area: one section per area, a lane per track (a lane heading only when an area mixes tracks)
    out.append('<div class="web" id="web-area" data-mode="area" hidden><svg class="lines"></svg>')
    for p in sk['pillars']:
        n = nodes[p['id']]
        fs = [f for f in feats if f['pillar'] == p['id']]
        present = [t for t in tracks if any(f['track'] == t['id'] for f in fs)]
        lanes = []
        for t in present:
            boxes = [capbox(c['id'], c['title'], [f['id'] for f in c['features'] if nodes[f['id']]['track'] == t['id']]) for c in p['capabilities'] if any(nodes[f['id']]['track'] == t['id'] for f in c['features'])]
            lanes.append((t['title'] if len(present) > 1 else '', '', boxes))
        out.append(section(p['id'], p['title'], p.get('quote'), n['counts'], n['total'], lanes, insights.get(p['id'], [])))
    out.append('</div>')
    # by track: one section per track, a lane per area
    out.append('<div class="web" id="web-track" data-mode="track" hidden><svg class="lines"></svg>')
    for t in tracks:
        fs = [f for f in feats if f['track'] == t['id']]
        if not fs: continue
        lanes = []
        for p in sk['pillars']:
            boxes = [capbox(c['id'], c['title'], [f['id'] for f in c['features'] if nodes[f['id']]['track'] == t['id']]) for c in p['capabilities'] if any(nodes[f['id']]['track'] == t['id'] for f in c['features'])]
            lanes.append((p['title'], '', boxes))
        out.append(section(t['id'], t['title'], None, counts(fs), len(fs), lanes, []))
    out.append('</div>')
    data = {nid: {k: n.get(k) for k in ('id','title','kind','pillar','parent','quote','status','since','why','evidence','needs','shares','needed_by','added','track','screens')} for nid, n in nodes.items()}
    data['_tracks'] = {t['id']: t['title'] for t in tracks}
    return ''.join(out), data, dict(total=len(feats), **tot)

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
/* a lane = one track inside an area (or one area inside a track): a small heading, then its boxes */
.lane + .lane{margin-top:14px}
.lanehead{display:flex;align-items:baseline;gap:8px;margin:0 0 6px 2px}
.lane.hide{display:none}
.vbarctl{gap:12px}
.vshots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.vshot{border:1px solid var(--edge-card);border-radius:var(--radius-md);background:var(--well);padding:0;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;color:var(--fg-2)}
.vshot img{height:64px;width:100%;object-fit:contain;padding:4px}
.vshot span{font-size:11px;padding:2px 6px;background:var(--panel);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
@media (hover:hover){.vshot:hover{border-color:var(--edge-strong)}}
@media (max-width:760px){.vinsights{grid-template-columns:1fr}}
'''

JS = r'''
const VN=%s; const SW=%s; const TRK=VN._tracks; delete VN._tracks;
let vMode='area', vLens='all', vOpen=null;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function nice(d){const m=/^\d{4}-(\d\d)-(\d\d)$/.exec(d||'');return m?MON[+m[1]-1]+' '+(+m[2]):(d||'')}
function shown(el){return el&&el.offsetParent!==null}
// WHY one web per mode: the same item appears once by area and once by track; lines and focus use the visible one
function web(){return $('#web-'+vMode)} function svg(){return web().querySelector('.lines')}
function center(el){const r=el.getBoundingClientRect(),w=web().getBoundingClientRect();return {x:r.left-w.left+r.width/2,y:r.top-w.top+r.height/2}}
function line(a,b,cls){if(!shown(a)||!shown(b))return;const p=center(a),q=center(b);const dx=(q.x-p.x)/2;const el=document.createElementNS('http://www.w3.org/2000/svg','path');el.setAttribute('d',`M${p.x},${p.y} C${p.x+dx},${p.y} ${q.x-dx},${q.y} ${q.x},${q.y}`);el.setAttribute('class',cls);svg().appendChild(el)}
function chipOf(id){return web().querySelector(`.chip[data-focus="${CSS.escape(id)}"]`)}
const OPEN=['vision','planned','building'];
function lensOn(n,l){if(l==='missing')return ['vision','planned'].includes(n.status);if(l==='building')return n.status==='building';
  if(l==='blocked')return (n.needs||[]).some(x=>OPEN.includes(VN[x.id].status));if(l==='shared')return (n.shares||[]).length>0;return true}
const LNOTE={missing:'Planned or only an idea; nothing built yet.',building:'Someone is working on these now.',blocked:'Each needs something that does not exist yet. Lines show what.',shared:'Pairs of things that share parts. Lines join them; each pair could be built once.'};
function vApply(){$$('.web .lines').forEach(s=>s.innerHTML='');$$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const over=vLens==='all'&&!vOpen;$('.mission .legend').hidden=!over;$('#voverview').hidden=!over;$('#vdetail').hidden=!vOpen;
  $$('.vgrid').forEach(g=>g.hidden=g.dataset.mode!==vMode);
  $$('.web').forEach(w=>{w.hidden=over||w.dataset.mode!==vMode;w.classList.toggle('detail',!!vOpen)});
  $$('[data-vmode]').forEach(b=>b.setAttribute('aria-selected',b.dataset.vmode===vMode));
  $$('.vlens [data-lens]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lens===vLens?'true':'false'));
  $('.lensnote').textContent=LNOTE[vLens]||'';
  if(over)return;
  const W=web();
  W.querySelectorAll('.chip').forEach(c=>c.classList.toggle('hide',!lensOn(VN[c.dataset.focus],vLens)));
  W.querySelectorAll('.cap').forEach(c=>c.classList.toggle('hide',!c.querySelector('.chip:not(.hide)')));
  W.querySelectorAll('.lane').forEach(c=>c.classList.toggle('hide',!c.querySelector('.chip:not(.hide)')));
  W.querySelectorAll('.pillar').forEach(p=>p.classList.toggle('hide',(vOpen&&p.dataset.id!==vOpen)||!p.querySelector('.chip:not(.hide)')));
  requestAnimationFrame(()=>{
  if(vLens==='blocked')Object.values(VN).forEach(n=>(n.needs||[]).forEach(x=>{if(OPEN.includes(VN[x.id].status))line(chipOf(n.id),chipOf(x.id),'dep')}));
  if(vLens==='shared')Object.values(VN).forEach(n=>(n.shares||[]).forEach(x=>line(chipOf(n.id),chipOf(x.id),'share')))});}
function openSection(id){vOpen=id;vLens='all';vApply();$('#scroller').scrollTop=0;fades()}
$$('.pcard').forEach(c=>c.onclick=()=>openSection(c.dataset.open));
$('#vback').onclick=()=>{vOpen=null;vApply();$('#scroller').scrollTop=0;fades()};
$$('[data-vmode]').forEach(b=>b.onclick=()=>{vMode=b.dataset.vmode;vOpen=null;vApply();fades()});
// WHY filter pills toggle off (G-14): pressing the pressed one returns to everything
$$('.vlens [data-lens]').forEach(b=>b.onclick=()=>{vLens=vLens===b.dataset.lens?'all':b.dataset.lens;if(vLens!=='all')vOpen=null;vApply();fades()});
function focus(id){const n=VN[id];if(!n)return;
  // WHY: an item opens the section it lives in for the current look; an area has no single track, so it switches to By area
  if(n.kind==='pillar'&&vMode==='track')vMode='area';
  const sec=vMode==='area'?n.pillar:n.track;
  if(web().hidden||(vOpen&&vOpen!==sec)){vOpen=sec;vLens='all';vApply()}
  $$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const ev=(n.evidence||[]);const kids=Object.values(VN).filter(m=>m.parent===id);
  const where=n.kind==='feature'?VN[n.pillar].title+' › '+VN[n.parent].title:(n.kind==='capability'?VN[n.pillar].title:'Area');
  const row=(x,extra)=>`<div class="vlink" data-focus="${x.id}"><i class="sdot ${VN[x.id].status}"></i><div><b class="t-sm">${VN[x.id].title}</b>${extra?`<div class="t-xs muted">${extra}</div>`:''}</div></div>`;
  // cross-links: the screens this part of the vision shows up on, and the open work on those screens
  const scr=typeof screensMatching==='function'?screensMatching(n.screens||[]):[];
  const work=[...new Set(scr.flatMap(s=>GI[s].work))].map(i=>EFF[i]);
  openPanel(where,n.title,`
  ${n.quote?`<div class="quote t-xs">“${n.quote}”</div>`:''}
  ${n.kind==='feature'?`<div class="statusline t-xs"><i class="sdot ${n.status}"></i>${SW[n.status]}${n.since?' · since '+nice(n.since):''} · <span class="badge trk">${TRK[n.track]}</span></div><p class="t-sm">${n.why||'<span class="missing">No evidence gathered yet.</span>'}</p>`:''}
  ${kids.length?`<div class="eyebrow pe">Inside <span class="cnt">${kids.length}</span></div>`+kids.map(k=>row(k,SW[k.status]+(k.track!==n.track&&k.kind==='feature'?' · '+TRK[k.track]:''))).join(''):''}
  ${(n.needs||[]).length?`<div class="eyebrow pe">Needs first</div>`+n.needs.map(x=>row(x,x.because)).join(''):''}
  ${(n.needed_by||[]).length?`<div class="eyebrow pe">Needed by</div>`+n.needed_by.map(x=>row(x,x.because)).join(''):''}
  ${(n.shares||[]).length?`<div class="eyebrow pe">Shares parts with</div>`+n.shares.map(x=>row(x,x.because)).join(''):''}
  ${scr.length?`<div class="eyebrow pe">Where it shows up <span class="cnt">${scr.length}</span></div><div class="vshots">${scr.slice(0,6).map(s=>`<button class="vshot" data-shot="${s}" title="${GI[s].t}"><img src="${GI[s].states[0].img}" alt=""><span>${GI[s].t}</span></button>`).join('')}</div>${scr.length>6?`<button class="btn sm" id="vallscr">See all ${scr.length} on Screens</button>`:''}`:''}
  ${work.length?`<div class="eyebrow pe">Work on those screens</div>`+work.map(w=>`<div class="row slim"><div class="body"><div class="t-xs">${w.title}</div><div class="hint">last worked on ${w.days===0?'today':w.days+' days ago'}</div></div></div>`).join(''):''}
  ${ev.length?`<details class="fold pe"><summary class="foldrow"><span class="t-xs">How we know <span class="cnt">${ev.length}</span></span><span class="chev">›</span></summary><ul class="ev t-xs">${ev.map(e=>`<li><span class="kind">${e.kind}</span>${e.note||''} <span class="muted">${nice(e.date||'')}</span><div class="muted t-2xs">${e.ref||''}</div></li>`).join('')}</ul></details>`:''}`,
  `<button class="btn" data-does="asks you to say in a sentence why the status or track is wrong; the answer is recorded with the evidence">That's wrong</button><button class="btn primary" data-does="starts a session on this with its evidence, what it needs and what needs it pasted in">Start a session on this</button>`);
  $$('#pbody .vshot').forEach(b=>b.onclick=()=>openShot(b.dataset.shot));
  const va=$('#vallscr');if(va)va.onclick=()=>showScreens('Where it shows up: '+n.title,scr);
  requestAnimationFrame(()=>{svg().innerHTML='';const me=chipOf(id);if(me){me.classList.add('focus');me.scrollIntoView({block:'nearest'})}
    (n.needs||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('rel');line(me,b,'dep')}});
    (n.needed_by||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('relby');line(b,me,'dep by')}});
    (n.shares||[]).forEach(x=>line(me,chipOf(x.id),'share'))})}
document.addEventListener('click',e=>{const t=e.target.closest('[data-focus]');if(t){e.preventDefault();focus(t.dataset.focus)}});
window.addEventListener('resize',()=>{if(!web().hidden)vApply()});
vApply();
'''
SVG_CSS = '''
.lines path{fill:none;stroke-width:1.5} .lines .dep{stroke:var(--status-ok)} .lines .dep.by{stroke:var(--tag-blue)} .lines .share{stroke:var(--tag-purple);stroke-dasharray:4 3}
'''
