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
    for a in added:
        c = caps.get(a.get('parent'))
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

def dot(status):
    return f'<i class="sdot {E(status)}" aria-hidden="true"></i>'

LEGEND = ''.join(f'<span class="leg">{dot(s)}{w}</span>' for s, w in (('done','exists'),('building','being built'),('planned','planned'),('vision','only an idea')))

def render(here):
    """WHY the rebuild (2026-10-12 review): the old tab drew all 10 areas and ~160 items at once,
    plus six lens tabs and a checkbox. Now the first view is ten area cards (one line each); the
    items appear only when you open one area, or when a filter asks a question across all of them."""
    sk, ev, insights = load(here)
    nodes = merge(flatten(sk), ev)
    feats = [n for n in nodes.values() if n['kind'] == 'feature']
    tot = {s: sum(1 for n in feats if n['status'] == s) for s in STATUS_WORD}
    blockers = sorted([n for n in feats if n['status'] in ('vision','planned') and n['needed_by']], key=lambda n: -len(n['needed_by']))[:6]
    recent = sorted([n for n in feats if n['status'] == 'done' and n['since'] and n['since'] >= '2026-09-12'], key=lambda n: n['since'], reverse=True)
    out = []
    # 1. the mission, one sentence of meaning, the bar and its legend (the legend used to be missing)
    out.append(f'''<div class="card mission"><div class="eyebrow">Your mission</div><div class="t-base mtext">{E(sk['mission'])}</div>
      <div class="t-sm dim msum">Of the {len(feats)} things you have said the app should do, <b>{tot['done']}</b> exist, <b>{tot['building']}</b> are being built, <b>{tot['planned']}</b> are planned and <b>{tot['vision']}</b> are only ideas{(' (' + str(tot['unchecked']) + ' not checked yet)') if tot['unchecked'] else ''}.</div>
      {bar(tot, len(feats))}<div class="legend t-2xs">{LEGEND}</div></div>''')
    # 2. filters: filter pills (G-14), each a question you might ask across every area
    out.append('''<div class="lensbar"><div class="fchips vtabs" role="group" aria-label="Show">
      <button class="fchip" data-lens="all" aria-pressed="true">By area</button><button class="fchip" data-lens="missing">Not started</button><button class="fchip" data-lens="building">Being built</button><button class="fchip" data-lens="blocked">Waiting on something</button><button class="fchip" data-lens="shared">Overlaps</button></div>
      <span class="t-xs muted lensnote"></span></div>''')
    # 3. overview: what most things wait on, what just shipped, then the ten areas as cards
    out.append('<div id="voverview">')
    if blockers or recent:
        out.append('<div class="vinsights">')
        if blockers:
            out.append('<div class="card"><div class="eyebrow">Most things are waiting on</div>' + ''.join(f'<button class="irow" data-focus="{E(b["id"])}">{dot(b["status"])}<span class="t-sm">{E(b["title"])}</span><span class="t-2xs muted irmeta">{len(b["needed_by"])} need it</span></button>' for b in blockers) + '</div>')
        if recent:
            out.append('<div class="card"><div class="eyebrow">Became real in the last month</div>' + ''.join(f'<button class="irow" data-focus="{E(r["id"])}">{dot("done")}<span class="t-sm">{E(r["title"])}</span><span class="t-2xs muted irmeta">{E(r["since"][5:].replace("-","/"))}</span></button>' for r in recent[:8]) + '</div>')
        out.append('</div>')
    out.append(f'<div class="sechead"><span class="eyebrow">Areas <span class="cnt">{len(sk["pillars"])}</span></span></div><div class="pgrid">')
    for p in sk['pillars']:
        n = nodes[p['id']]
        c = n['counts']
        caps = ' · '.join(E(x['title']) for x in p['capabilities'])
        out.append(f'''<button class="card card-interactive pcard" data-pillar="{E(p['id'])}"><div class="pctop"><span class="t-base">{E(p['title'])}</span><span class="chev" aria-hidden="true">›</span></div>
          <div class="t-xs dim">{c.get('done',0)} of {n['total']} exist{(' · ' + str(c['building']) + ' being built') if c.get('building') else ''}</div>{bar(c, n['total'])}
          <div class="t-2xs muted pccaps">{caps}</div></button>''')
    out.append('</div></div>')
    # 4. the full tree, hidden until an area is opened or a filter is on
    out.append('<div id="vdetail" hidden><div class="vback"><button class="btn ghost sm" id="vback">‹ All areas</button></div></div>')
    out.append('<div class="web" id="web" hidden><svg class="lines" id="lines"></svg>')
    for p in sk['pillars']:
        n = nodes[p['id']]
        ins = insights.get(p['id'], [])
        out.append(f'''<section class="pillar" data-id="{E(p['id'])}"><header class="phead"><div class="t-base ptitle vlink" data-focus="{E(p['id'])}">{E(p['title'])}</div>
          {f'<div class="quote t-xs">“{E(p["quote"])}”</div>' if p.get('quote') else ''}
          <div class="t-xs dim">{E(words(n['counts'], n['total']))}</div>{bar(n['counts'], n['total'])}</header><div class="caps">''')
        for c in p['capabilities']:
            out.append(f'<div class="cap" data-id="{E(c["id"])}"><button class="caphead t-xs" data-focus="{E(c["id"])}">{E(c["title"])}</button><div class="chips">')
            for f in c['features']:
                fn = nodes[f['id']]
                out.append(f'<button class="chip {E(fn["status"])}{" added" if fn.get("added") else ""}" data-focus="{E(f["id"])}" title="{E(STATUS_WORD[fn["status"]])}">{dot(fn["status"])}{E(f["title"])}</button>')
            out.append('</div></div>')
        out.append('</div>')
        if ins: out.append('<details class="fold pins"><summary class="foldrow"><span class="t-xs">What the evidence says about this area</span><span class="chev" aria-hidden="true">›</span></summary><ul class="t-xs">' + ''.join(f'<li>{E(i)}</li>' for i in ins) + '</ul></details>')
        out.append('</section>')
    out.append('</div>')
    data = {nid: {k: n.get(k) for k in ('id','title','kind','pillar','parent','quote','status','since','why','evidence','needs','shares','needed_by','added')} for nid, n in nodes.items()}
    return ''.join(out), data, dict(total=len(feats), **tot)

CSS = '''
.mission{margin-bottom:16px} .mission .mtext{max-width:880px} .mission .msum{margin-top:8px} .mission .vbar{margin-top:12px}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;color:var(--fg-muted)} .leg{display:inline-flex;align-items:center;gap:6px}
.vbar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--inset);border:1px solid var(--edge-dim)} .vbar .seg{display:block}
.seg.done{background:var(--status-ok)} .seg.building{background:var(--fg-muted)} .seg.planned{background:var(--fg-faint)} .seg.vision{background:repeating-linear-gradient(45deg,var(--fg-faint) 0 2px,transparent 2px 5px)} .seg.unchecked{background:var(--status-warn);opacity:.5}
/* status dots — the one status signal on this tab (G-14 tag: dot + neutral text) */
.sdot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;border:1.5px solid var(--fg-muted);box-sizing:border-box}
.sdot.done{background:var(--status-ok);border-color:var(--status-ok)}
.sdot.building{background:linear-gradient(90deg,var(--fg-2) 50%,transparent 50%);border-color:var(--fg-2)}
.sdot.planned{background:transparent}
.sdot.vision{border-style:dashed;border-color:var(--fg-faint)}
.sdot.unchecked{border-color:var(--status-warn)}
.lensbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px;position:sticky;top:48px;background:var(--canvas);padding:8px 0;z-index:2}
.vinsights{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.irow{font:inherit;display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:0;border-radius:var(--radius-md);padding:6px 8px;margin:0 -8px;color:var(--fg);cursor:pointer;transition:background var(--dur-hover) var(--ease)}
.irow .t-sm{flex:1;min-width:0} .irmeta{white-space:nowrap}
@media (hover:hover){.irow:hover{background:var(--inset)}} .irow:active{background:var(--edge)} .irow:focus-visible{outline:2px solid var(--accent)}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.pcard{font:inherit;color:var(--fg);text-align:left;display:flex;flex-direction:column;gap:8px}
.pctop{display:flex;align-items:center;gap:8px} .pctop .t-base{flex:1} .chev{color:var(--fg-muted);font-size:16px;line-height:1}
.pccaps{line-height:1.5}
.vback{margin:-4px 0 8px}
.web{position:relative;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;align-items:start}
.web.detail{grid-template-columns:1fr}
.lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:hidden}
.pillar{background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);padding:16px}
.phead{margin-bottom:12px;display:flex;flex-direction:column;gap:6px} .phead .vbar{max-width:480px}
.ptitle{cursor:pointer} .web.detail .ptitle{font-size:18px;font-weight:600}
.web:not(.detail) .quote{display:none}
.caps{display:grid;gap:10px;grid-template-columns:1fr} .web.detail .caps{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.cap{background:var(--inset);border:1px solid var(--edge-dim);border-radius:var(--radius-md);padding:10px 12px}
.caphead{font:inherit;font-size:12px;font-weight:500;background:none;border:0;padding:0;margin:0 0 8px;color:var(--fg-2);cursor:pointer;text-align:left} .caphead:hover{color:var(--fg)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font:inherit;font-size:12px;line-height:1.3;text-align:left;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--edge-dim);background:var(--panel);color:var(--fg);cursor:pointer;max-width:100%;display:inline-flex;align-items:center;gap:6px;transition:background var(--dur-hover),box-shadow var(--dur-hover)}
@media (hover:hover){.chip:hover{background:var(--edge)}} .chip:focus-visible{outline:2px solid var(--accent)}
.chip.vision{color:var(--fg-2)}
.chip.added::after{content:" +";color:var(--fg-muted)}
.chip.hide,.cap.hide,.pillar.hide{display:none}
.chip.focus{box-shadow:0 0 0 2px var(--accent)} .chip.rel{box-shadow:0 0 0 2px var(--status-ok)} .chip.relby{box-shadow:0 0 0 2px var(--tag-blue)}
.pins{margin-top:12px} .pins ul{margin:8px 0 0;padding-left:18px;color:var(--fg-2)} .pins li{margin:4px 0}
.ev{margin:4px 0;padding-left:0;list-style:none} .ev li{padding:6px 0;border-bottom:1px solid var(--edge-dim)} .ev .kind{display:inline-block;min-width:72px;color:var(--fg-muted)}
.quote{border-left:2px solid var(--edge);padding-left:8px;color:var(--fg-2);font-style:italic;margin:4px 0;max-width:880px}
.panel .vlink{cursor:pointer;padding:6px 0;border-bottom:1px solid var(--edge-dim);display:flex;gap:8px;align-items:baseline} .panel .vlink:hover b{text-decoration:underline}
@media (max-width:760px){.vinsights{grid-template-columns:1fr}}
'''

JS = r'''
const VN=%s; const SW=%s;
const web=$('#web'), svg=$('#lines');
let vLens='all', vPillar=null;
function shown(el){return el&&el.offsetParent!==null}
function center(el){const r=el.getBoundingClientRect(),w=web.getBoundingClientRect();return {x:r.left-w.left+r.width/2,y:r.top-w.top+r.height/2}}
function line(a,b,cls){if(!shown(a)||!shown(b))return;const p=center(a),q=center(b);const dx=(q.x-p.x)/2;const el=document.createElementNS('http://www.w3.org/2000/svg','path');el.setAttribute('d',`M${p.x},${p.y} C${p.x+dx},${p.y} ${q.x-dx},${q.y} ${q.x},${q.y}`);el.setAttribute('class',cls);svg.appendChild(el)}
function chipOf(id){return web.querySelector(`.chip[data-focus="${CSS.escape(id)}"]`)}
const OPEN=['vision','planned','building'];
function lensOn(n,l){if(l==='missing')return ['vision','planned'].includes(n.status);if(l==='building')return n.status==='building';
  if(l==='blocked')return (n.needs||[]).some(x=>OPEN.includes(VN[x.id].status));if(l==='shared')return (n.shares||[]).length>0;return true}
const LNOTE={missing:'Planned or only an idea; nothing built yet.',building:'Someone is working on these now.',blocked:'Each needs something that does not exist yet. Lines show what.',shared:'Pairs that share parts. Lines join them; maybe build once.'};
// WHY one apply(): the tab has three states (areas overview / one area open / a filter across all areas) and every control just changes vLens or vPillar.
function vApply(){svg.innerHTML='';$$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const over=vLens==='all'&&!vPillar;$('#voverview').hidden=!over;web.hidden=over;$('#vdetail').hidden=!vPillar;
  web.classList.toggle('detail',!!vPillar);
  $$('.vtabs .fchip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lens===vLens));
  $('.lensnote').textContent=LNOTE[vLens]||'';
  if(over)return;
  $$('.chip').forEach(c=>c.classList.toggle('hide',!lensOn(VN[c.dataset.focus],vLens)));
  $$('.cap').forEach(c=>c.classList.toggle('hide',!c.querySelector('.chip:not(.hide)')));
  $$('.pillar').forEach(p=>p.classList.toggle('hide',(vPillar&&p.dataset.id!==vPillar)||!p.querySelector('.chip:not(.hide)')));
  requestAnimationFrame(()=>{
  if(vLens==='blocked')Object.values(VN).forEach(n=>(n.needs||[]).forEach(x=>{if(OPEN.includes(VN[x.id].status))line(chipOf(n.id),chipOf(x.id),'dep')}));
  if(vLens==='shared')Object.values(VN).forEach(n=>(n.shares||[]).forEach(x=>line(chipOf(n.id),chipOf(x.id),'share')))});}
function openPillar(id){vPillar=id;vLens='all';vApply();window.scrollTo(0,0)}
$$('.pcard').forEach(c=>c.onclick=()=>openPillar(c.dataset.pillar));
$('#vback').onclick=()=>{vPillar=null;vApply();window.scrollTo(0,0)};
$$('.vtabs .fchip').forEach(b=>b.onclick=()=>{vLens=b.dataset.lens;if(vLens!=='all')vPillar=null;vApply()});
function focus(id){const n=VN[id];if(!n)return;
  // WHY: an item picked from the overview lists opens its area first, so its lines have somewhere to land.
  if(web.hidden||(vPillar&&vPillar!==n.pillar)){vPillar=n.pillar;vLens='all';vApply()}
  $$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const ev=(n.evidence||[]);const kids=Object.values(VN).filter(m=>m.parent===id);
  const where=n.kind==='feature'?VN[n.pillar].title+' › '+VN[n.parent].title:(n.kind==='capability'?VN[n.pillar].title:'Area');
  const row=(x,extra)=>`<div class="vlink" data-focus="${x.id}"><i class="sdot ${VN[x.id].status}"></i><div><b class="t-sm">${VN[x.id].title}</b>${extra?`<div class="t-xs muted">${extra}</div>`:''}</div></div>`;
  openPanel(where,n.title,`
  ${n.quote?`<div class="quote t-xs">“${n.quote}”</div>`:''}
  ${n.kind==='feature'?`<div class="statusline t-xs"><i class="sdot ${n.status}"></i>${SW[n.status]}${n.since?' · since '+n.since:''}</div><p class="t-sm">${n.why||'<span class="missing">No evidence gathered yet.</span>'}</p>`:''}
  ${kids.length?`<div class="eyebrow pe">Inside <span class="cnt">${kids.length}</span></div>`+kids.map(k=>row(k,SW[k.status])).join(''):''}
  ${(n.needs||[]).length?`<div class="eyebrow pe">Needs first</div>`+n.needs.map(x=>row(x,x.because)).join(''):''}
  ${(n.needed_by||[]).length?`<div class="eyebrow pe">Needed by</div>`+n.needed_by.map(x=>row(x,x.because)).join(''):''}
  ${(n.shares||[]).length?`<div class="eyebrow pe">Shares parts with</div>`+n.shares.map(x=>row(x,x.because)).join(''):''}
  ${ev.length?`<details class="fold pe"><summary class="foldrow"><span class="t-xs">How we know <span class="cnt">${ev.length}</span></span><span class="chev">›</span></summary><ul class="ev t-xs">${ev.map(e=>`<li><span class="kind">${e.kind}</span>${e.note||''} <span class="muted">${e.date||''}</span><div class="muted t-2xs">${e.ref||''}</div></li>`).join('')}</ul></details>`:''}`,
  `<button class="btn" data-does="asks you to say in a sentence why the status is wrong; the answer is recorded with the evidence">That's wrong</button><button class="btn primary" data-does="starts a session on this with its evidence, what it needs and what needs it pasted in">Start a session on this</button>`);
  // WHY after openPanel + a frame: opening the pane narrows the page, so lines measured earlier point at stale spots.
  requestAnimationFrame(()=>{svg.innerHTML='';const me=chipOf(id);if(me){me.classList.add('focus');me.scrollIntoView({block:'nearest'})}
    (n.needs||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('rel');line(me,b,'dep')}});
    (n.needed_by||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('relby');line(b,me,'dep by')}});
    (n.shares||[]).forEach(x=>line(me,chipOf(x.id),'share'))})}
document.addEventListener('click',e=>{const t=e.target.closest('[data-focus]');if(t){e.preventDefault();focus(t.dataset.focus)}});
window.addEventListener('resize',()=>{if(!web.hidden)vApply()});
'''
SVG_CSS = '''
.lines path{fill:none;stroke-width:1.5} .lines .dep{stroke:var(--status-ok)} .lines .dep.by{stroke:var(--tag-blue)} .lines .share{stroke:var(--tag-purple);stroke-dasharray:4 3}
'''
