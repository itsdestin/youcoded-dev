#!/usr/bin/env python3
"""Builds index.html: "How it works" - the app's real parts and the connections between them.

WHY: round 2 - every view reads one shared ../facts.json (parts, edges, traces and every status,
merged from all three evidence files by facts.py). The hand-written part/edge/trace lists that
used to live here were moved there unchanged; this file now only draws them.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.abspath(os.path.join(HERE, '..'))
if not os.path.exists(os.path.join(D, 'facts.json')):
    raise SystemExit('facts.json missing: run python3 ../facts.py first')
F = json.load(open(os.path.join(D, 'facts.json')))
cc_css = open(os.path.join(D, '..', 'cc.css')).read()
PARTS, EDGES, TRACES = F['parts'], F['edges'], F['traces']
# node id -> [plain title, system id]; lets the page map a focus id from another view to a part
NODES = {i: [n['title'], n.get('pillar')] for i, n in F['nodes'].items()}
DATA = dict(parts=PARTS, edges=EDGES, traces=TRACES, nodes=NODES)

CSS = r"""
/* page-specific rules only; every look (fonts, surfaces, radius, status colours) comes from cc.css */
.screen{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--panel)}
.band{height:40px;flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 12px}
.btitle{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500}
.body{flex:1;min-height:0;display:flex;padding:0 10px 10px}
.pane{flex:1;min-width:0;display:flex;background:var(--canvas);border-radius:var(--radius-xl);overflow:hidden}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.head{padding:12px 20px 8px;display:flex;flex-direction:column;gap:8px;position:relative}
.head::after{content:'';position:absolute;bottom:0;left:16px;right:16px;height:1px;background:linear-gradient(to right,transparent,var(--edge-card) 8%,var(--edge-card) 92%,transparent)}
.lens{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.legend{display:flex;gap:14px;align-items:center;margin-left:auto;font-size:11px;color:var(--fg-muted)}
.legend i{display:inline-block;width:26px;height:0;border-top:2px solid var(--status-ok);vertical-align:middle;margin-right:5px}
.legend i.box{width:16px;height:10px;border:1px dashed var(--fg-faint);border-radius:3px;margin-right:5px;vertical-align:-1px}
.legend i.building{border-top-color:var(--fg-muted)} .legend i.planned{border-top:2px dashed var(--fg-faint)}
.scroll{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:12px 20px 20px}
.stage{position:relative;width:944px;height:600px;margin:0 auto}
.stage svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.edge{fill:none;stroke-width:2;stroke-linecap:round}
.edge.exists{stroke:var(--status-ok)} .edge.building{stroke:var(--fg-muted);stroke-width:2.5}
.edge.planned{stroke:var(--fg-faint);stroke-dasharray:6 5}
.hit{fill:none;stroke:transparent;stroke-width:16;cursor:pointer}
.ehov{opacity:.9}
.stage.dim .edge,.stage.dim .node{opacity:.22}
.stage.dim .edge.on,.stage.dim .node.on{opacity:1}
.stage.dim .edge.seen,.stage.dim .node.seen{opacity:.6}
.edge.on{stroke-width:4.5}
.edge.sel{stroke-width:4}
.node{position:absolute;width:144px;height:70px;padding:8px 10px;border-radius:var(--radius-lg);border:1px solid var(--edge-card);background:var(--panel);box-shadow:var(--layer-shadow);cursor:pointer;display:flex;flex-direction:column;justify-content:center;gap:4px;text-align:left;color:var(--fg);font:inherit;transition:background-color 120ms steps(4)}
@media (hover:hover){.node:hover{background:var(--inset)}}
.node:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.node .nt{font-size:13px;font-weight:500;line-height:1.2}
.node .ns{font-size:11px;color:var(--fg-muted);display:flex;align-items:center;gap:5px}
.node.exists{border-left:4px solid var(--status-ok)}
.node.building{border-left:4px solid var(--fg-muted)}
.node.outside{background:var(--well);border-style:solid;box-shadow:none}
.node.ahead{background:transparent;box-shadow:none;border:1px dashed var(--fg-faint);border-left:1px dashed var(--fg-faint)}
.node.ahead.planned .nt{color:var(--fg-2)}
.node.ahead.building{background:var(--panel);border-style:dashed;border-left:4px solid var(--fg-muted)}
.node.ahead.idea{background:repeating-linear-gradient(45deg,transparent 0 5px,color-mix(in srgb,var(--fg-faint) 14%,transparent) 5px 6px)}
.node.sel{outline:2px solid var(--accent);outline-offset:2px}
.badge-n{position:absolute;top:-9px;right:-9px;min-width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;padding:0 4px}
.zone{position:absolute;font-size:11px;color:var(--fg-muted)}
.framed .band{display:none}
.zone.out{}
.dot.building{background:var(--fg-muted)} .dot.planned{background:var(--fg-faint)}
.dot.idea{background:repeating-linear-gradient(45deg,var(--fg-faint) 0 2px,transparent 2px 4px);border:1px solid var(--fg-faint)}
.dot.exists{background:var(--status-ok)}
.drawer{width:340px;flex:none;overflow:auto;padding:16px;border-left:1px solid var(--edge-card);background:var(--panel)}
.drawer h2{margin:0 0 4px;font-size:16px;font-weight:500}
.drawer h3{margin:16px 0 6px;font-size:12px;font-weight:500;color:var(--fg-muted)}
.drawer p{margin:6px 0;font-size:13px;line-height:1.45}
.crow{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;padding:8px 10px;margin:0 0 6px;border:1px solid var(--edge-card);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--inset) 50%,transparent);color:var(--fg);cursor:pointer;font-size:12px;line-height:1.4}
@media (hover:hover){.crow:hover{background:var(--inset)}}
.crow:focus-visible{outline:2px solid var(--accent)}
.crow .dot{margin-top:5px}
.crow b{font-weight:500}
.vrow{padding:6px 0;font-size:12px;border-top:1px solid var(--edge-dim)}
.vrow:first-child{border-top:0}
ul.plain{margin:4px 0;padding-left:18px;font-size:12px;color:var(--fg-2)}
details.code{margin-top:14px;font-size:11px;color:var(--fg-muted)}
details.code summary{cursor:pointer}
details.code code{display:block;font-size:11px;color:var(--fg-2);margin:3px 0;word-break:break-all}
.stepcard{border:1px solid var(--edge);border-radius:var(--radius-xl);padding:14px;background:var(--inset)}
.stepcard .sn{font-size:11px;color:var(--fg-muted)}
.stepcard p{font-size:14px;margin:6px 0 12px;line-height:1.45}
.stepcard .acts{display:flex;gap:8px;align-items:center}
.vtabs{margin:8px 0}.vtabs button{font-size:12px;padding:3px 10px}
.tooltip{position:fixed;z-index:50;max-width:300px;padding:8px 10px;border-radius:var(--radius-lg);background:var(--panel);border:1px solid var(--edge);box-shadow:var(--layer-shadow);font-size:12px;line-height:1.4;pointer-events:none;display:none}
.gl{border-bottom:1px dotted var(--fg-muted);cursor:help}
.same{margin:8px 0;font-size:12px;color:var(--fg-muted)}
.same div{color:var(--fg);padding:3px 0;display:flex;gap:6px;align-items:flex-start;line-height:1.35}
.same .dot{margin-top:4px}
.which{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;font-size:12px;color:var(--fg-muted)}
.which .tabs{margin:0}
.todo b{font-weight:500}
.hint1{font-size:12px;color:var(--fg-muted)}
.one{font-size:14px;line-height:1.4;margin:8px 0}
ul.facts{list-style:none;margin:8px 0;padding:0;font-size:13px;line-height:1.4}
ul.facts li{padding:4px 0;border-top:1px solid var(--edge-dim)} ul.facts li:first-child{border-top:0}
.todo{display:flex;gap:8px;align-items:center;width:100%;text-align:left;padding:7px 8px;border:0;border-radius:var(--radius-lg);background:transparent;color:var(--fg);cursor:pointer;font-size:13px;line-height:1.3}
@media (hover:hover){.todo:hover{background:var(--inset)}}
.todo:focus-visible{outline:2px solid var(--accent)}
details.more{margin-top:14px;font-size:12px}
details.more>summary{cursor:pointer;color:var(--fg-muted);font-size:12px}
details.more[open]>summary{margin-bottom:8px}
.steps{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 0}
.steps button{width:26px;height:26px;border-radius:50%;border:1px solid var(--edge);background:transparent;color:var(--fg-2);font-size:12px;cursor:pointer;padding:0}
.steps button[aria-current=true]{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.steps button.past{background:var(--inset)}
"""

JS = r"""
const D = JSON.parse(document.getElementById('data').textContent);
const W=144,H=70,PX=160;
const stage=document.getElementById('stage'), svg=document.getElementById('lines'), drawer=document.getElementById('drawer'), tip=document.getElementById('tooltip');
const VLABEL={cc:'Claude Code',engine:"YouCoded's own"};
const WORD={exists:'exists',building:'being built',planned:'planned',idea:'only an idea'};
const P={},E={},els={},eels={};
// WHY one word set in all four views (review U3): facts.json still says "only an idea so far" on some items
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sw=w=>String(w).replace('only an idea so far','only an idea');
// WHY plain meanings (review U2): every term he did not coin gets a hover; Mesh stays his word and gains one
const GLOSS={'Mesh':'Your own devices (computer, phone, others) acting as one group, so work can run on whichever is switched on. Not built yet.',
 'specialists':'Helpers the assistant hands a small job to, such as researching or checking something.',
 'doorway':'The one shared list of things a screen can ask the app to do. The computer window and the phone both use it.',
 'keeper':'The part that runs one conversation: it starts it, keeps its record and tells every screen what is new.',
 'Outside the app':'Not part of YouCoded. It is run by someone else and YouCoded only talks to it.'};
const glRe=new RegExp('\\b('+Object.keys(GLOSS).join('|')+')\\b','g');
// wrap glossary words inside already-escaped text
const gl=h=>String(h).replace(glRe,(m)=>`<span class="gl" data-gl="${esc(GLOSS[m])}">${m}</span>`);
// the exact title a part carries in the other views, when it stands for one single item
const label=p=>p.vision.length===1&&D.nodes[p.vision[0]]?D.nodes[p.vision[0]][0]:p.t;
D.parts.forEach(p=>{P[p.id]=p;p.px=p.x*PX;p.py=p.y});
D.edges.forEach(e=>E[e.id]=e);
function showTip(html,ev){tip.innerHTML=html;tip.style.display='block';moveTip(ev)}
function moveTip(ev){const r=tip.getBoundingClientRect();let x=ev.clientX+14,y=ev.clientY+14;if(x+r.width>innerWidth-8)x=ev.clientX-r.width-14;if(y+r.height>innerHeight-8)y=ev.clientY-r.height-14;tip.style.left=x+'px';tip.style.top=y+'px'}
function hideTip(){tip.style.display='none'}
// where a line meets a box: the point on the box's outline along the line to the other box's centre
function anchor(a,b,pad){const cx=a.px+W/2,cy=a.py+H/2,tx=b.px+W/2,ty=b.py+H/2,dx=tx-cx,dy=ty-cy;
  const sx=dx?(W/2+pad)/Math.abs(dx):1e9,sy=dy?(H/2+pad)/Math.abs(dy):1e9,t=Math.min(sx,sy);return[cx+dx*t,cy+dy*t]}
function edgePath(e){const a=P[e.a],b=P[e.b],[x1,y1]=anchor(a,b,3),[x2,y2]=anchor(b,a,3);return`M${x1},${y1} L${x2},${y2}`}
// nodes
D.parts.forEach(p=>{
  const b=document.createElement('button');b.className=`node ${p.kind} ${p.cls}`;b.style.left=p.px+'px';b.style.top=p.py+'px';b.dataset.id=p.id;
  const lead=p.kind==='outside'?'Outside the app':p.kind==='ahead'?WORD[p.cls]:'';
  b.innerHTML=`<span class="nt">${gl(esc(label(p)))}</span><span class="ns">${p.kind==='ahead'?`<i class="dot ${p.cls}"></i>${esc(WORD[p.cls])}`:p.kind==='outside'?'Outside the app':`<i class="dot ${p.cls}"></i>${esc(WORD[p.cls])}`}</span>`;
  // WHY the hover says what the part IS in plain words (review U2), not where it sits in the code
  b.onmouseenter=ev=>showTip(`<b>${esc(label(p))}</b> <span style="color:var(--fg-muted)">· ${p.kind==='outside'?'outside the app':esc(WORD[p.cls])}</span><br>${esc(first(p.what))}<br><span style="color:var(--fg-muted)">Click for more.</span>`,ev);
  b.onmousemove=moveTip;b.onmouseleave=hideTip;
  b.onclick=()=>{leaveTrace();select('node',p.id)};
  stage.appendChild(b);els[p.id]=b;
});
// edges
const NS='http://www.w3.org/2000/svg';
['exists','building','planned'].forEach(c=>{const m=document.createElementNS(NS,'marker');m.id='ar-'+c;m.setAttribute('viewBox','0 0 10 10');m.setAttribute('refX','8');m.setAttribute('refY','5');m.setAttribute('markerWidth','7');m.setAttribute('markerHeight','7');m.setAttribute('orient','auto-start-reverse');
 const pa=document.createElementNS(NS,'path');pa.setAttribute('d','M1,1 L9,5 L1,9 z');pa.setAttribute('fill',c==='exists'?'var(--status-ok)':c==='building'?'var(--fg-muted)':'var(--fg-faint)');m.appendChild(pa);svg.appendChild(m)});
D.edges.forEach(e=>{
  const d=edgePath(e);
  const p=document.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('class','edge '+e.cls);p.setAttribute('marker-end',`url(#ar-${e.cls})`);if(e.both)p.setAttribute('marker-start',`url(#ar-${e.cls})`);p.id='e-'+e.id;
  const h=document.createElementNS(NS,'path');h.setAttribute('d',d);h.setAttribute('class','hit');
  h.onmouseenter=ev=>showTip(`${esc(e.s)}<br><span style="color:var(--fg-muted)">${esc(WORD[e.cls])}. Click for why.</span>`,ev);h.onmousemove=moveTip;h.onmouseleave=hideTip;
  h.onclick=()=>{leaveTrace();select('edge',e.id)};
  svg.appendChild(p);svg.appendChild(h);eels[e.id]=p;
});
const dotLayer=document.createElementNS(NS,'g');svg.appendChild(dotLayer);

let sel=null,trace=null;
function clearMarks(){Object.values(els).forEach(n=>{n.classList.remove('on','seen','sel');const b=n.querySelector('.badge-n');if(b)b.remove()});Object.values(eels).forEach(n=>n.classList.remove('on','seen','sel'));stage.classList.remove('dim');dotLayer.innerHTML=''}
function dotRow(c){return`<i class="dot ${c}"></i>`}
function conRow(e,fromId){const other=P[e.a===fromId?e.b:e.a];
  return`<button class="crow" data-e="${e.id}"><i class="dot ${e.cls}"></i><span><b>${esc(label(other))}</b>: ${gl(esc(e.s))} <span class="muted">(${WORD[e.cls]})</span></span></button>`}
function bindRows(){drawer.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{select('edge',b.dataset.e)})}
// WHY every detail is: name, status, ONE sentence, at most three facts, the rest behind a closed More (ROUND2 section 3)
function first(t){const m=String(t).match(/^.*?[.!?](?=\s|$)/);return m?m[0]:t}
// WHY: a step that opens with a stub ("You press Enter.") reads as a fragment; keep the first two sentences together (review U14)
function lead(t){const a=first(t);if(a.length>=30)return a;const r=String(t).slice(a.length).trim();return r?a+' '+first(r):a}
const rest=(t,f)=>String(t).slice((f||first)(t).length).trim();
const more=inner=>`<details class="more"><summary>More</summary>${inner}</details>`;
function bindGl(){document.querySelectorAll('[data-gl]').forEach(x=>{x.onmouseenter=ev=>showTip(x.dataset.gl,ev);x.onmousemove=moveTip;x.onmouseleave=hideTip})}
function say(msg){if(window.parent!==window)parent.postMessage(msg,'*')}
function tell(id,title){say({bp:'focus',id:id,title:title})}
function renderDefault(){
  const open=D.edges.filter(e=>e.cls!=='exists');
  const order={building:0,planned:1};open.sort((a,b)=>order[a.cls]-order[b.cls]);
  // WHY one short line each: the reason lives in the hover and in the connection's own detail, not on the list
  drawer.innerHTML=`<h2>What is not finished</h2>`+
   open.map(e=>`<button class="todo" data-e="${e.id}" data-tip="${esc(e.s)}"><i class="dot ${e.cls}"></i><span><b>${gl(esc(label(P[e.a])))}</b><br>needs ${gl(esc(label(P[e.b])))} <span class="muted">· ${esc(WORD[e.cls])}</span></span></button>`).join('')+
   more(`<p class="hint1">Boxes are the app's real parts. Solid green lines work today, dashed grey lines are planned, and dashed boxes are not built yet. Pick a part or a line, or follow a path above.</p>`);
  drawer.querySelectorAll('.todo').forEach(b=>{const e=E[b.dataset.e];b.onclick=()=>{leaveTrace();select('edge',e.id)};b.onmouseenter=ev=>showTip(esc(e.s),ev);b.onmousemove=moveTip;b.onmouseleave=hideTip});bindGl();
}
function select(kind,id,quiet){
  clearMarks();sel={kind,id};
  if(kind==='node'){
    const p=P[id];els[id].classList.add('sel');
    const edges=D.edges.filter(e=>e.a===id||e.b===id);
    edges.forEach(e=>{eels[e.id].classList.add('on');els[e.a].classList.add('on');els[e.b].classList.add('on')});stage.classList.add('dim');els[id].classList.add('on');
    const names=l=>l.map(x=>esc(x)).join(', ');
    const needs=edges.filter(e=>e.a===id&&e.cls!=='exists').map(e=>P[e.b].t);
    const holds=edges.filter(e=>e.b===id&&e.cls!=='exists').map(e=>P[e.a].t);
    const todo=p.visionItems.filter(v=>v.cls!=='exists').length;
    const facts=[];
    if(needs.length)facts.push(`Waiting on: ${names(needs)}`);
    if(holds.length)facts.push(`Holds up: ${names(holds)}`);
    if(todo&&facts.length<3)facts.push(`${todo} of ${p.visionItems.length} big-picture items not finished`);
    if(facts.length<3){const w=edges.filter(e=>e.cls==='exists').length;if(w)facts.push(`Working link${w>1?'s':''} to ${w} other part${w>1?'s':''}`)}
    let h=`<h2>${esc(label(p))}</h2><p><span class="spill"><i class="dot ${p.cls}"></i>${p.kind==='outside'?gl('Outside the app'):esc(WORD[p.cls])}</span></p><p class="one">${gl(esc(first(p.what)))}</p>`;
    // WHY (review U3): the exact titles this part carries in the other views, first two shown, the rest under More
    if(p.visionItems.length&&label(p)===p.t)h+=`<div class="same">Called this in the other views:${p.visionItems.slice(0,2).map(v=>`<div><i class="dot ${v.cls}"></i><span><b class="fw">${esc(v.t)}</b> · ${esc(sw(v.w))}</span></div>`).join('')}${p.visionItems.length>2?`<div class="muted">and ${p.visionItems.length-2} more under More</div>`:''}</div>`;
    if(facts.length)h+=`<ul class="facts">${facts.slice(0,3).map(f=>`<li>${gl(f)}</li>`).join('')}</ul>`;
    let m='';
    if(rest(p.what))m+=`<p>${gl(esc(rest(p.what)))}</p>`;
    if(p.inside.length)m+=`<h3>Inside this part</h3><ul class="plain">${p.inside.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
    m+=`<h3>Connections (${edges.length})</h3>`+edges.map(e=>conRow(e,id)).join('');
    if(p.visionItems.length)m+=`<h3>Every big-picture item for this part</h3>`+p.visionItems.map(v=>`<div class="vrow"><i class="dot ${v.cls}"></i> <b class="fw">${esc(v.t)}</b> <span class="muted">· ${esc(sw(v.w))}</span><div class="muted">${esc(v.why)}</div></div>`).join('');
    if(p.code.length)m+=`<h3>Where it lives in the code</h3>`+p.code.map(c=>`<code style="display:block;font-size:11px;word-break:break-all">youcoded/desktop/src/${esc(c)}</code>`).join('')+`<div class="hint1" style="margin-top:6px">Read from: ${esc(p.src)}</div>`;
    drawer.innerHTML=h+more(m);bindGl();
    if(!quiet)tell('part:'+id,p.t);
  }else{
    const e=E[id];eels[id].classList.add('on','sel');els[e.a].classList.add('on');els[e.b].classList.add('on');stage.classList.add('dim');
    drawer.innerHTML=`<h2>${esc(label(P[e.a]))} ${e.both?'and':'to'} ${esc(label(P[e.b]))}</h2><p><span class="spill"><i class="dot ${e.cls}"></i>${esc(WORD[e.cls])}</span></p><p class="one">${gl(esc(first(e.s)))}</p>`+
    more((rest(e.s)?`<p>${esc(rest(e.s))}</p>`:'')+`<h3>Why we say so</h3><ul class="plain">${e.src.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><h3>Ends of this connection</h3><button class="crow" data-n="${e.a}"><b>${esc(P[e.a].t)}</b></button><button class="crow" data-n="${e.b}"><b>${esc(P[e.b].t)}</b></button>`);
    drawer.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>select('node',b.dataset.n));
  }
  bindRows();
}
// ---- traces
const lens=document.getElementById('traces');
D.traces.forEach(t=>{const b=document.createElement('button');b.className='fchip tip below';b.dataset.tip=t.hint;b.setAttribute('aria-pressed','false');b.textContent=t.t;b.dataset.t=t.id;b.onclick=()=>trace&&trace.t.id===t.id?leaveTrace():startTrace(t);lens.insertBefore(b,lens.querySelector('.legend'))});
function leaveTrace(){if(!trace)return;trace=null;lens.querySelectorAll('.fchip').forEach(b=>b.setAttribute('aria-pressed','false'));clearMarks();sel=null;renderDefault()}
function startTrace(t){leaveTrace();trace={t,v:t.variants[0],i:0};lens.querySelectorAll('.fchip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===t.id));drawStep()}
function stepNodes(s){return s.e?[E[s.e].a,E[s.e].b]:[s.n]}
function drawStep(){
  clearMarks();const steps=trace.v.steps,s=steps[trace.i];stage.classList.add('dim');
  // earlier steps stay softly lit; the current one is bold
  steps.slice(0,trace.i).forEach(p=>{(p.e?[p.e].concat(p.also||[]):[]).forEach(x=>eels[x].classList.add('seen'));stepNodes(p).forEach(n=>els[n].classList.add('seen'))});
  const cur=(s.e?[s.e]:[]).concat(s.also||[]);
  cur.forEach(x=>{eels[x].classList.remove('seen');eels[x].classList.add('on')});
  stepNodes(s).concat((s.also||[]).flatMap(x=>[E[x].a,E[x].b])).forEach(n=>{els[n].classList.remove('seen');els[n].classList.add('on')});
  const nb=document.createElement('span');nb.className='badge-n';nb.textContent=trace.i+1;els[stepNodes(s)[s.d===-1?1:0]].appendChild(nb);
  if(s.e){const e=E[s.e],a=s.d===-1?e.b:e.a,b=s.d===-1?e.a:e.b,[x1,y1]=anchor(P[a],P[b],3),[x2,y2]=anchor(P[b],P[a],3);
    const c=document.createElementNS(NS,'circle');c.setAttribute('r','5');c.setAttribute('fill','var(--accent)');
    const am=document.createElementNS(NS,'animateMotion');am.setAttribute('dur','1.4s');am.setAttribute('repeatCount','indefinite');am.setAttribute('path',`M${x1},${y1} L${x2},${y2}`);c.appendChild(am);dotLayer.appendChild(c)}
  const t=trace.t,multi=t.variants.length>1;
  // WHY one short sentence per step; the remainder of a long step and the step picker stay quiet
  drawer.innerHTML=`<h2>${esc(t.t)}</h2>`+// WHY a label on the toggle (review U14): it says what it chooses
   (multi?`<div class="which"><span>${esc(t.choose||'Which assistant answers:')}</span><div class="tabs vtabs">${t.variants.map(v=>`<button data-v="${v.id}" aria-selected="${v===trace.v}">${esc(VLABEL[v.id]||v.t)}</button>`).join('')}</div></div>`:'')+
   `<div class="stepcard"><div class="sn">Step ${trace.i+1} of ${steps.length}</div><p>${gl(esc(lead(s.s)))}</p>${rest(s.s,lead)?more(`<p>${gl(esc(rest(s.s,lead)))}</p>`):''}<div class="acts"><button class="btn sm" id="bk" ${trace.i?'':'disabled'}>Back</button><button class="btn sm primary" id="nx">${trace.i<steps.length-1?'Next':'Start again'}</button><span class="spacer"></span><button class="btn sm ghost" id="ex">Close</button></div></div>
   <div class="steps">`+steps.map((x,k)=>`<button data-k="${k}" class="${k<trace.i?'past':''}" ${k===trace.i?'aria-current="true"':''} data-tip="Step ${k+1}">${k+1}</button>`).join('')+`</div>`;
  bindGl();
  drawer.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{trace.v=t.variants.find(v=>v.id===b.dataset.v);trace.i=0;drawStep()});
  drawer.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{trace.i=+b.dataset.k;drawStep()});
  document.getElementById('nx').onclick=()=>{trace.i=(trace.i+1)%steps.length;drawStep()};
  document.getElementById('bk').onclick=()=>{trace.i--;drawStep()};document.getElementById('ex').onclick=leaveTrace;
}
stage.addEventListener('click',e=>{if(e.target===stage||e.target===svg){if(trace)return;sel=null;clearMarks();renderDefault();tell(null)}});
renderDefault();
// ---- opening on a thing chosen in another view (#focus=part:<id> or a node id)
function partFor(f){
  if(!f)return null;
  if(f.startsWith('part:')){const i=f.slice(5);return P[i]?i:null}
  const n=D.parts.find(p=>p.vision.includes(f));if(n)return n.id;
  const sys=(D.nodes[f]||[])[1]||f.split('.')[0];
  const m=D.parts.find(p=>p.vision.some(v=>(D.nodes[v]||[])[1]===sys))||D.parts.find(p=>p.id===sys);
  return m?m.id:null;
}
function applyHash(){
  const m=location.hash.match(/focus=([^&]+)/);if(!m)return;
  const id=partFor(decodeURIComponent(m[1]));
  if(id){leaveTrace();select('node',id,true);tell('part:'+id,P[id].t)}
}
applyHash();addEventListener('hashchange',applyHash);
"""

def icon():
    return '<svg class="ic" viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>'

page = f"""<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>How it works</title>
<script>if(window.self!==window.top)document.documentElement.classList.add("framed")</script>
<style>{cc_css}
{CSS}</style></head><body>
<div class="screen">
 <div class="band"><span></span><span class="btitle">{icon()}How it works</span><span></span></div>
 <div class="body"><div class="pane">
  <div class="main">
   <div class="head">
    <div class="t-xs muted tip" data-tip="The app's real parts and what connects them. Pick a part or a line, or follow one path step by step.">Pick a part or a line, or follow a path.</div>
    <div class="lens" id="traces"><span class="legend"><span><i></i>works today</span><span><i class="building"></i>being built</span><span><i class="planned"></i>planned</span><span><i class="box"></i>dashed box = not built yet</span></span></div>
   </div>
   <div class="scroll"><div class="stage" id="stage">
     <svg id="lines"></svg>
   </div></div>
  </div>
  <aside class="drawer" id="drawer"></aside>
 </div></div>
</div>
<div class="tooltip" id="tooltip"></div>
<script type="application/json" id="data">{json.dumps(DATA).replace('</', '<\\/')}</script>
<script>{JS}</script></body></html>"""
open(os.path.join(HERE, 'index.html'), 'w').write(page)
print('wrote index.html', len(page), 'bytes;', len(PARTS), 'parts,', len(EDGES), 'connections')
