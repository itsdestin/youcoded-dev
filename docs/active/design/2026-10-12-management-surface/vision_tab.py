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

def render(here):
    sk, ev, insights = load(here)
    nodes = merge(flatten(sk), ev)
    feats = [n for n in nodes.values() if n['kind'] == 'feature']
    tot = {s: sum(1 for n in feats if n['status'] == s) for s in STATUS_WORD}
    # the things most often needed that do not exist: the real blockers
    blockers = sorted([n for n in feats if n['status'] in ('vision','planned') and n['needed_by']], key=lambda n: -len(n['needed_by']))[:6]
    recent = sorted([n for n in feats if n['status'] == 'done' and n['since'] and n['since'] >= '2026-09-12'], key=lambda n: n['since'], reverse=True)
    out = []
    out.append(f'''<div class="mission card"><div class="eyebrow">The mission, in your words</div><div class="t-base">{E(sk['mission'])}</div>
      <div class="t-sm dim" style="margin-top:8px">You have described <b>{len(feats)}</b> things the app should do. Today <b>{tot['done']}</b> exist, <b>{tot['building']}</b> are being built, <b>{tot['planned']}</b> are planned and <b>{tot['vision']}</b> are still only ideas{(' (' + str(tot['unchecked']) + ' not checked yet)') if tot['unchecked'] else ''}.</div>
      {bar(tot, len(feats))}</div>''')
    out.append('''<div class="vlens"><span class="t-sm">Show</span><div class="tabs vtabs">
      <button data-lens="all" aria-selected="true">Everything</button><button data-lens="missing">What's missing</button><button data-lens="building">Being built</button><button data-lens="recent">Shipped in the last month</button><button data-lens="blocked">What's blocked, and by what</button><button data-lens="shared">Built twice</button></div>
      <label class="t-xs"><input type="checkbox" id="alllines"> draw every dependency</label></div>''')
    if blockers or recent:
        out.append('<div class="vinsights">')
        if blockers:
            out.append('<div class="card inset"><div class="eyebrow">What most things are waiting on</div>' + ''.join(f'<div class="t-xs vlink" data-focus="{E(b["id"])}"><b>{E(b["title"])}</b> <span class="muted">({STATUS_WORD[b["status"]]}; {len(b["needed_by"])} other things need it)</span></div>' for b in blockers) + '</div>')
        if recent:
            out.append('<div class="card inset"><div class="eyebrow">Became real in the last month</div>' + ''.join(f'<div class="t-xs vlink" data-focus="{E(r["id"])}">{E(r["title"])} <span class="muted">{E(r["since"])}</span></div>' for r in recent[:8]) + '</div>')
        out.append('</div>')
    out.append('<div class="web" id="web"><svg class="lines" id="lines"></svg>')
    for p in sk['pillars']:
        n = nodes[p['id']]
        ins = insights.get(p['id'], [])
        out.append(f'''<section class="pillar" data-id="{E(p['id'])}"><header class="phead vlink" data-focus="{E(p['id'])}"><div class="t-base">{E(p['title'])}</div>{bar(n['counts'], n['total'])}<div class="t-2xs muted">{E(words(n['counts'], n['total']))}</div></header>''')
        for c in p['capabilities']:
            cn = nodes[c['id']]
            out.append(f'<div class="cap" data-id="{E(c["id"])}"><div class="caphead vlink t-xs" data-focus="{E(c["id"])}">{E(c["title"])}</div><div class="chips">')
            for f in c['features']:
                fn = nodes[f['id']]
                out.append(f'<button class="chip {E(fn["status"])}{" added" if fn.get("added") else ""}" data-focus="{E(f["id"])}" data-status="{E(fn["status"])}" data-since="{E(fn["since"] or "")}" title="{E(STATUS_WORD[fn["status"]])}">{E(f["title"])}</button>')
            out.append('</div></div>')
        if ins: out.append('<details class="pins"><summary class="t-2xs muted">What the evidence says about this pillar</summary><ul class="t-2xs">' + ''.join(f'<li>{E(i)}</li>' for i in ins) + '</ul></details>')
        out.append('</section>')
    out.append('</div>')
    data = {nid: {k: n.get(k) for k in ('id','title','kind','pillar','parent','quote','status','since','why','evidence','needs','shares','needed_by','added')} for nid, n in nodes.items()}
    return ''.join(out), data, dict(total=len(feats), **tot)

CSS = '''
.mission .vbar{margin-top:10px}
.vbar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--inset);border:1px solid var(--edge-dim)} .vbar .seg{display:block}
.seg.done{background:var(--status-ok)} .seg.building{background:var(--fg-muted)} .seg.planned{background:var(--fg-faint)} .seg.vision{background:repeating-linear-gradient(45deg,var(--fg-faint) 0 2px,transparent 2px 5px)} .seg.unchecked{background:var(--status-warn);opacity:.5}
.vlens{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0;position:sticky;top:48px;background:var(--canvas);padding:8px 0;z-index:2} .vtabs{flex-wrap:wrap;border-radius:var(--radius-lg)} .vtabs button{border-radius:var(--radius-md);font-size:12px}
.vinsights{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px} .vinsights .vlink{padding:3px 0;cursor:pointer} .vinsights .vlink:hover b{text-decoration:underline}
.web{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
.lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible}
.pillar{background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);padding:12px} .phead{cursor:pointer;margin-bottom:8px} .phead .vbar{margin:6px 0 4px}
.cap{background:var(--well);border:1px solid var(--edge-dim);border-radius:var(--radius-md);padding:8px;margin-top:8px} .caphead{cursor:pointer;color:var(--fg-2);margin-bottom:6px} .caphead:hover{color:var(--fg)}
.chip{font:inherit;font-size:11px;line-height:1.3;text-align:left;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--edge);background:var(--inset);color:var(--fg);cursor:pointer;max-width:100%;transition:opacity var(--dur-hover),box-shadow var(--dur-hover)}
.chip.done{border-color:color-mix(in srgb,var(--status-ok) 60%,transparent);background:color-mix(in srgb,var(--status-ok) 14%,transparent)}
.chip.building{border-color:var(--fg-muted);background:color-mix(in srgb,var(--fg-muted) 18%,transparent)}
.chip.planned{background:transparent}
.chip.vision{background:transparent;border-style:dashed;color:var(--fg-2)}
.chip.unchecked{border-color:color-mix(in srgb,var(--status-warn) 50%,transparent)}
.chip.added::after{content:" +";color:var(--fg-muted)}
.chip.faded,.cap.faded,.pillar.faded .chip{opacity:.18} .chip.focus{box-shadow:0 0 0 2px var(--accent)} .chip.rel{box-shadow:0 0 0 2px var(--status-ok)} .chip.relby{box-shadow:0 0 0 2px var(--tag-blue)}
.pins{margin-top:8px} .pins ul{margin:4px 0 0;padding-left:14px} .pins li{margin:2px 0}
.ev{margin:4px 0;padding-left:0;list-style:none} .ev li{padding:4px 0;border-bottom:1px solid var(--edge-dim)} .ev .kind{display:inline-block;min-width:64px;color:var(--fg-muted)}
.quote{border-left:2px solid var(--edge);padding-left:8px;color:var(--fg-2);font-style:italic;margin:8px 0}
@media (max-width:1100px){.web{grid-template-columns:1fr 1fr}}
'''

JS = r'''
const VN=%s; const SW=%s;
const web=$('#web'), svg=$('#lines');
function center(el){const r=el.getBoundingClientRect(),w=web.getBoundingClientRect();return {x:r.left-w.left+r.width/2,y:r.top-w.top+r.height/2}}
function line(a,b,cls){const p=center(a),q=center(b);const dx=(q.x-p.x)/2;const el=document.createElementNS('http://www.w3.org/2000/svg','path');el.setAttribute('d',`M${p.x},${p.y} C${p.x+dx},${p.y} ${q.x-dx},${q.y} ${q.x},${q.y}`);el.setAttribute('class',cls);svg.appendChild(el)}
function chipOf(id){return web.querySelector(`[data-focus="${CSS.escape(id)}"]`)}
function drawAll(){svg.innerHTML='';if(!$('#alllines').checked)return;Object.values(VN).forEach(n=>(n.needs||[]).forEach(x=>{const a=chipOf(n.id),b=chipOf(x.id);if(a&&b)line(a,b,'dep faint')}))}
function focus(id){const n=VN[id];if(!n)return;svg.innerHTML='';$$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));
  const me=chipOf(id);if(me&&me.classList.contains('chip'))me.classList.add('focus');
  (n.needs||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('rel');if(me)line(me,b,'dep')}});
  (n.needed_by||[]).forEach(x=>{const b=chipOf(x.id);if(b){b.classList.add('relby');if(me)line(b,me,'dep by')}});
  (n.shares||[]).forEach(x=>{const b=chipOf(x.id);if(b&&me)line(me,b,'share')});
  const p=$('#panel');const ev=(n.evidence||[]);const kids=Object.values(VN).filter(m=>m.parent===id);
  p.innerHTML=`<div class="eyebrow">${n.kind==='feature'?VN[n.pillar].title+' › '+VN[n.parent].title:(n.kind==='capability'?VN[n.pillar].title:'Pillar')}</div><div class="t-base">${n.title}</div>
  ${n.quote?`<div class="quote t-xs">“${n.quote}”</div>`:''}
  ${n.kind==='feature'?`<div class="status ${ {done:'ok',building:'idle',planned:'idle',vision:'idle',unchecked:'warn'}[n.status]}" style="margin:8px 0"><span class="dot"></span>${SW[n.status]}${n.since?' · since '+n.since:''}</div><p class="t-sm">${n.why||'<span class="missing">No evidence gathered yet.</span>'}</p>`:''}
  ${kids.length?`<div class="eyebrow" style="margin-top:10px">Inside</div>`+kids.map(k=>`<div class="t-xs vlink" data-focus="${k.id}"><span class="badge ${k.status}">${SW[k.status]}</span> ${k.title}</div>`).join(''):''}
  ${ev.length?`<div class="eyebrow" style="margin-top:12px">Evidence</div><ul class="ev t-2xs">${ev.map(e=>`<li><span class="kind">${e.kind}</span>${e.note||''} <span class="muted">${e.date||''}</span><div class="muted">${e.ref||''}</div></li>`).join('')}</ul>`:''}
  ${(n.needs||[]).length?`<div class="eyebrow" style="margin-top:12px">Needs first</div>`+n.needs.map(x=>`<div class="t-xs vlink" data-focus="${x.id}"><b>${VN[x.id].title}</b> <span class="badge ${VN[x.id].status}">${SW[VN[x.id].status]}</span><div class="muted">${x.because||''}</div></div>`).join(''):''}
  ${(n.needed_by||[]).length?`<div class="eyebrow" style="margin-top:12px">Needed by</div>`+n.needed_by.map(x=>`<div class="t-xs vlink" data-focus="${x.id}"><b>${VN[x.id].title}</b><div class="muted">${x.because||''}</div></div>`).join(''):''}
  ${(n.shares||[]).length?`<div class="eyebrow" style="margin-top:12px">Shares parts with</div>`+n.shares.map(x=>`<div class="t-xs vlink" data-focus="${x.id}"><b>${VN[x.id].title}</b><div class="muted">${x.because||''}</div></div>`).join(''):''}
  <div class="acts" style="margin-top:14px;justify-content:flex-start;flex-wrap:wrap"><button class="btn sm primary" data-does="starts a session on this with its evidence, what it needs and what needs it pasted in">Start a session on this</button><button class="btn sm" data-does="asks you to say in a sentence why the status is wrong; the answer is recorded with the evidence">That's wrong</button><button class="btn ghost sm" onclick="document.getElementById('panel').classList.remove('open')">Close</button></div>`;
  p.classList.add('open')}
document.addEventListener('click',e=>{const t=e.target.closest('[data-focus]');if(t){e.preventDefault();focus(t.dataset.focus)}});
$('#alllines').onchange=drawAll;
$$('.vtabs button').forEach(b=>b.onclick=()=>{$$('.vtabs button').forEach(x=>x.setAttribute('aria-selected',x===b));const l=b.dataset.lens;svg.innerHTML='';
  const month='2026-09-12';
  $$('.chip').forEach(c=>{const n=VN[c.dataset.focus];let on=true;
    if(l==='missing')on=['vision','planned'].includes(n.status);else if(l==='building')on=n.status==='building';else if(l==='recent')on=n.status==='done'&&n.since&&n.since>=month;
    else if(l==='blocked')on=(n.needs||[]).some(x=>['vision','planned','building'].includes(VN[x.id].status))||(n.needed_by||[]).length>0&&['vision','planned'].includes(n.status);
    else if(l==='shared')on=(n.shares||[]).length>0;
    c.classList.toggle('faded',!on)});
  if(l==='blocked'){Object.values(VN).forEach(n=>(n.needs||[]).forEach(x=>{if(['vision','planned','building'].includes(VN[x.id].status)){const a=chipOf(n.id),b=chipOf(x.id);if(a&&b)line(a,b,'dep')}}))}
  if(l==='shared'){Object.values(VN).forEach(n=>(n.shares||[]).forEach(x=>{const a=chipOf(n.id),b=chipOf(x.id);if(a&&b)line(a,b,'share')}))}});
window.addEventListener('resize',()=>{if($('#alllines').checked)drawAll()});
'''
SVG_CSS = '''
.lines path{fill:none;stroke-width:1.5} .lines .dep{stroke:var(--status-ok)} .lines .dep.by{stroke:var(--tag-blue)} .lines .dep.faint{stroke:var(--fg-faint);opacity:.6;stroke-width:1} .lines .share{stroke:var(--tag-purple);stroke-dasharray:4 3}
.badge.done{border-color:color-mix(in srgb,var(--status-ok) 60%,transparent)} .badge.vision{border-style:dashed}
'''
