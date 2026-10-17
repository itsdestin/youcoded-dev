"""The Screens tab: every photographed screen, grouped by place, with a search, five filter pills,
one "Show me…" question, and a picture popup that can show the click path into each screen.

WHY its own module (2026-10-13, Destin: "the tab should allow me to sort/filter/group in more
interesting/dynamic ways ... clearer nesting and ways to trace/visualize click-paths"): the facets
are derived here by RULES from three generated inputs, so the real version re-runs them after every
screenshot run and nothing is maintained by hand:
  - shots/sizes.json      (make_shots.py: each picture's size, and whether it was cut out of the window)
  - screen-defs.json      (the workbench screen list, desktop/src/renderer/dev/workbench/screens/*.ts,
                           dumped as JSON: name, tags, viewport, open-steps)
  - the screenshot names  (thumbs/*.jpg; 'a/b/c' = a path a person takes, '#x' = the same screen in
                           another situation)
How each facet is derived is written beside its function below.
"""
import json, os, re, html

E = html.escape

# ---------------------------------------------------------------------------------------- rules
def pretty(seg):
    seg = re.sub(r'^page-', '', seg)
    return seg.replace('-', ' ').replace('_', ' ').capitalize()

def kind_of(tags):
    """KIND — from the workbench definition's own tag (types.ts `tags`), never from the picture:
    'view' = a full screen; 'dialog' = a popup; 'menu'/'popover' = a menu; 'drawer'/'pane' = a panel
    that slides in beside or under the chat; 'bar'/'tour' = a strip or a one-time tip; 'dev' = a
    developer sheet (not part of the app). A state with no definition of its own uses its screen's."""
    t = set(tags)
    if 'dev' in t: return 'dev'
    if t & {'menu', 'popover'}: return 'menu'
    if t & {'drawer', 'pane'}: return 'panel'
    if t & {'bar', 'tour'}: return 'tip'
    if 'dialog' in t: return 'popup'
    return 'full'

KINDS = [('full', 'Full screens', 'Full screen'), ('popup', 'Popups', 'Popup'), ('menu', 'Menus', 'Menu'),
         ('panel', 'Slide-ins', 'Slide-in panel'), ('tip', 'Bars & tips', 'Bar or tip'), ('dev', 'Developer sheets', 'Developer sheet')]

# HAS A PLACE TO TYPE — three rules, any one is enough: (1) the screenshot run types into it
# (an `open` step with do:'type'); (2) a word in its path names a typing job; (3) it is a conversation
# or editor, which always has a box to type in. A name rule, so it can miss a box the name does not
# mention; the real version reads <input>/<textarea> in the component that registers the screen.
TYPE_WORDS = {'rename-session', 'key', 'add', 'edit', 'create', 'search', 'find', 'filter', 'bug-report', 'new-session',
              'handle-prompt', 'document', 'spreadsheet', 'presentation', 'terminal', 'document-comments', 'spreadsheet-comments', 'welcome'}
def types_in(name, d):
    if d and d.get('open') and '"type"' in json.dumps(d['open']): return True
    base = name.split('#')[0]
    if any(s in TYPE_WORDS for s in base.split('/')): return True
    return base == 'chat'   # the conversation: the composer is always there

# FIRST LAUNCH ONLY — a word in its path that only exists before you have used the app: the setup
# wizard, the one-time warnings, the welcome screen, the name prompt, the feature tour, the editors' first run.
FIRST_WORDS = {'first-run', 'first-time-warning', 'welcome', 'handle-prompt', 'tour'}
def first_only(name):
    return any(s in FIRST_WORDS for s in name.split('#')[0].split('/'))

# PHONE — the run photographed it at phone width (definition viewport under 500px wide, the
# 'narrow' tag, or a '#phone' state).
def phone(name, d):
    vp = (d or {}).get('viewport') or {}
    return ('narrow' in (d or {}).get('tags', [])) or (vp.get('width', 1440) < 500) or '#phone' in name

# SHOWS A PROBLEM — the definition is tagged 'error-state' (a failed load, a refused key, a stalled reply).
def problem(d):
    return 'error-state' in (d or {}).get('tags', [])

def state_label(name):
    if '#' not in name: return 'Usual'
    return pretty(name.split('#', 1)[1])

# ---------------------------------------------------------------------------------------- build
def build(here, names, place_of, desc, efforts, release_pats, questions, matches):
    defs = {d['name']: d for d in json.load(open(os.path.join(here, 'screen-defs.json')))}
    sizes = json.load(open(os.path.join(here, 'shots', 'sizes.json')))
    names = [n for n in names if n in sizes]
    groups = {}
    for n in names: groups.setdefault(n.split('#')[0], []).append(n)
    for k in groups:   # the usual state first, then the rest in name order
        groups[k].sort(key=lambda n: (n != k, n))
    keys = sorted(groups)
    keyset = set(keys)

    def parent_of(k):
        """CLICK PATH — the workbench opens 'a/b/c' by opening 'a', then 'a/b', then 'a/b/c' (index.ts,
        HOW A NAME OPENS). So a screen's parent is the longest shorter path that is itself a screen."""
        segs = k.split('/')
        for i in range(len(segs) - 1, 0, -1):
            p = '/'.join(segs[:i])
            if p in keyset: return p
        return None

    def defn(n):
        return defs.get(n) or defs.get(n.split('#')[0]) or next((defs[x] for x in groups.get(n.split('#')[0], []) if x in defs), None)

    out = []
    for k in keys:
        sts = groups[k]
        d0 = defn(sts[0])
        par = parent_of(k)
        chain = []
        p = par
        while p: chain.insert(0, p); p = parent_of(p)
        segs = k.split('/')
        # WHY crumbs keep the in-between words that are not screens ('menu', 'open'): they are part
        # of how the app names the path, but only real screens are clickable.
        crumbs = [dict(w=pretty(segs[i]), id=('/'.join(segs[:i + 1]) if '/'.join(segs[:i + 1]) in keyset else None)) for i in range(len(segs) - 1)]
        wk = [i for i, e in enumerate(efforts) if e['screens'] and any(matches(x, e['screens']) for x in sts)]
        rel = any(matches(x, release_pats) for x in sts)
        qs = [i for i, (q, pats) in enumerate(questions) if any(matches(x, pats) for x in sts)]
        stl = []
        for x in sts:
            dx = defn(x)
            sz = sizes[x]
            # WHY %23: a '#' in a file name would be read as the end of the address, so states never loaded
            f = x.replace('/', '__').replace('#', '%23') + '.jpg'
            stl.append(dict(n=x, l=state_label(x), img='shots/' + f, win='thumbs/' + f,
                            crop=sz['crop'], ar=round(sz['w'] / sz['h'], 3), ph=phone(x, dx), er=problem(dx), ty=types_in(x, dx)))
        title = pretty(segs[-1])
        out.append(dict(
            id=k, t=title, crumbs=crumbs, chain=chain, parent=par, depth=len(chain) + 1,
            kind=kind_of((d0 or {}).get('tags', [])), place=place_of(k), desc=desc.get(k),
            states=stl,
            fl=dict(type=any(s['ty'] for s in stl), first=first_only(k), phone=any(s['ph'] for s in stl), err=any(s['er'] for s in stl)),
            work=wk, rel=rel, q=qs,
            recent=min([efforts[i]['days'] for i in wk], default=None)))
    kids = {}
    for g in out:
        if g['parent']: kids.setdefault(g['parent'], []).append(g['id'])
    for g in out: g['kids'] = kids.get(g['id'], [])
    return out

# ---------------------------------------------------------------------------------------- page parts
# ---------------------------------------------------------------------------------------- page parts
SHOW_ME = ['Talks to the AI', 'Changes how it behaves', 'Add-ons', 'Permissions']

def head_controls(tip):
    """The one control row, in the tab's fixed head. WHY this few (2026-10-13, Destin: "this is a
    confusing fucking disaster to navigate.... just wayyy too many controls"): a search box, five
    filter pills and one "Show me…" question. The Pictures/Tree/Trail switch, Group by, the sort
    menu and eleven more pills were cut; the click path now lives inside each screen's popup."""
    T = lambda k: E(tip[k])
    pills = ''.join(f'<button class="fchip" data-f="{f}" aria-pressed="false" data-tip="{T(k)}">{E(lbl)}</button>' for f, lbl, k in (
        ('kind:popup', 'Popups', 'scr.popups'), ('kind:menu', 'Menus', 'scr.menus'), ('first', 'First launch', 'scr.first'),
        ('phone', 'Phone', 'scr.phone'), ('work', 'Changing now', 'scr.work')))
    opts = '<option value="">Show me… (every screen)</option>' + ''.join(f'<option value="{i}">{E(q)}</option>' for i, q in enumerate(SHOW_ME))
    return f'''<div class="lensbar sbar">
  <input class="field" id="sq" type="search" placeholder="Find a screen" aria-label="Find a screen" data-tip="{T('scr.search')}">
  <div class="fchips" role="group" aria-label="Show only">{pills}</div>
  <div class="bandpill showme" data-tip="{T('scr.showme')}"><select id="sshow" aria-label="Show me" data-tip="{T('scr.showme')}">{opts}</select></div>
  <span class="fchip effchip" id="effchip" data-tip="{T('scr.only')}" hidden></span>
</div>'''

def dialog_shell(tip):
    """The picture popup: the app's Dialog (Dialog.tsx/.css) at wide size, image first: one-line
    16px title, the drawn close button, the tapered line under the header, Esc and the scrim close
    it, the body fades at its edges, buttons in the footer with no line above them."""
    T = lambda k: E(tip[k])
    X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg>'
    L = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
    R = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
    return f'''<div class="scrim" id="scrim" hidden></div>
<div class="dwrap" id="dwrap" hidden><div class="dialog layer" role="dialog" aria-modal="true" aria-labelledby="dti">
  <div class="dhead hline"><h2 class="dtitle" id="dti" data-tip="{T('pop.title')}"></h2><div class="dhbtns"><button class="closebtn" id="dprev" aria-label="Previous screen" data-tip="{T('pop.prev')}">{L}</button><button class="closebtn" id="dnext" aria-label="Next screen" data-tip="{T('pop.next')}">{R}</button><button class="closebtn" id="dclose" aria-label="Close" data-tip="{T('pop.close')}">{X}</button></div></div>
  <div class="dbody fadescroll" id="dbody"></div>
  <div class="dfoot" id="dfoot"></div>
</div></div>'''

CSS = '''
/* ---- Screens: the one control row ---- */
.sbar{gap:8px!important}
/* FIELD_SURFACE (cardLevels.ts): 'bg-inset border border-edge-card rounded-lg', Input sm 'px-3 py-1.5 text-xs' */
.field{font:inherit;font-size:12px;line-height:16px;padding:6px 12px;border-radius:var(--radius-lg);border:1px solid var(--edge-card);background:var(--inset);color:var(--fg);width:200px}
.field::placeholder{color:var(--fg-muted)} .field:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.showme select{font-size:13px;padding:5px 8px}
.effchip{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:var(--on-accent);border-color:var(--accent);cursor:default}
.effchip button{border:0;background:transparent;color:inherit;cursor:pointer;padding:0;display:inline-flex}
.effchip svg{width:14px;height:14px}
/* ---- the wall: the picture is the tile; one line of name, one small line of path ---- */
.wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:12px}
.tile{margin:0;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-xl);box-shadow:var(--layer-shadow);overflow:hidden;cursor:pointer;transition:background-color 120ms steps(4),transform 200ms steps(5);display:flex;flex-direction:column}
@media (hover:hover){.tile:hover{background:var(--inset);transform:scale(1.02)}}
.tile:active{background:var(--edge)} .tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* WHY contain on a well: a popup keeps its real shape instead of being cropped to 16:10; a full screen fills it */
.timg{position:relative;height:176px;background:var(--well);display:flex;align-items:center;justify-content:center;padding:8px}
.timg img{max-width:100%;max-height:100%;object-fit:contain;display:block;border-radius:var(--radius-md);box-shadow:0 1px 4px rgba(0,0,0,var(--shadow-strength))}
.timg.full{padding:0} .timg.full img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:0;box-shadow:none}
.tov{position:absolute;top:8px;right:8px;left:8px;display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap}
.tov .badge,.tov .spill{background:var(--panel)}
.tcap{padding:6px 12px 8px;display:flex;flex-direction:column;min-width:0}
.tcap .tn{font-size:12px;font-weight:500;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcap .tp{font-size:11px;color:var(--fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gsec{margin:0 0 24px}
.scount{margin:0 4px 12px}
.gsec .tile.extra{display:none} .gsec.expanded .tile.extra{display:flex}
/* ---- "How do I get here?": the click path as pictures, inside the popup ---- */
.dpath{margin-top:20px}
.dpath .gh{font-size:14px}
.trail{display:flex;align-items:center;gap:8px;overflow-x:auto;padding:8px 4px 16px}
.trail .tile{flex:none;width:200px}
.trail .tile .timg{height:140px}
.trail .tile.here{width:260px;outline:2px solid var(--accent);outline-offset:2px;cursor:default}
.trail .tile.here .timg{height:180px}
.trail .arrow{flex:none;color:var(--fg-muted)} .trail .arrow svg{width:20px;height:20px}
.trail .start{flex:none;width:96px;text-align:center}
.dpath .wall{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))} .dpath .wall .timg{height:120px}
/* ---- the picture popup: Dialog.tsx 'wide' + Dialog.css ---- */
.scrim{position:fixed;inset:0;background:var(--scrim);z-index:30}
.dwrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;z-index:31;pointer-events:none}
.dialog{pointer-events:auto;width:100%;max-width:min(1100px,94vw);max-height:calc(100vh - 6rem);display:flex;flex-direction:column;overflow:hidden}
.dhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:56px;padding:12px 16px}
.dtitle{font-size:16px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dhbtns{display:flex;gap:4px;flex:none}
.dbody{flex:1;padding:16px;overflow-wrap:anywhere}
.dfoot{flex:none;display:flex;justify-content:flex-end;gap:8px;padding:0 16px 16px;flex-wrap:wrap}
.dimg{background:var(--well);border-radius:var(--radius-lg);border:1px solid var(--edge-card);display:flex;align-items:center;justify-content:center;padding:12px;min-height:200px;width:100%}
button.dimg{cursor:zoom-in;font:inherit} button.dimg.full{cursor:zoom-out} button.dimg:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.dimg img{max-width:100%;max-height:max(260px,calc(100vh - 420px));object-fit:contain;border-radius:var(--radius-md);box-shadow:0 2px 10px rgba(0,0,0,var(--shadow-strength))}
.dimg.full{padding:0} .dimg.full img{border-radius:var(--radius-lg);box-shadow:none;max-height:max(260px,calc(100vh - 400px))}
.dbar{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.sstrip{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 2px;margin-top:8px}
.sstrip button{flex:none;width:120px;padding:0;border:1px solid var(--edge-card);border-radius:var(--radius-md);background:var(--well);cursor:pointer;overflow:hidden;display:flex;flex-direction:column;text-align:left;color:var(--fg-2)}
.sstrip button .si{height:72px;display:flex;align-items:center;justify-content:center;padding:4px}
.sstrip button img{max-width:100%;max-height:100%;object-fit:contain}
.sstrip button span{font-size:11px;padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--panel)}
.sstrip button[aria-pressed="true"]{outline:2px solid var(--accent);outline-offset:1px;color:var(--fg)}
.dgrid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
.dfacts{display:flex;flex-direction:column;gap:14px;min-width:0}
.dfacts p{margin:0}
.dfacts .eyebrow{margin-bottom:4px}
.crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;font-size:12px;color:var(--fg-2)}
.crumbs .sep{color:var(--fg-muted)}
.factlist{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px} .factlist dt{color:var(--fg-muted)} .factlist dd{margin:0;color:var(--fg)}
.dbody .row{margin-bottom:6px}
@media (max-width:900px){.dgrid{grid-template-columns:1fr}}
@media (max-width:760px){
  .field{width:100%}
  .dialog{max-width:100vw;max-height:calc(100vh - 2rem)}
  .wall{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))} .timg{height:128px}
  .sbar .fchips{flex-wrap:nowrap;overflow-x:auto}
}
:root,:root[data-theme="light"]{--scrim:rgba(73,73,73,.5)} :root[data-theme="dark"]{--scrim:rgba(7,7,7,.5)}
:root[data-theme="midnight"]{--scrim:rgba(5,7,9,.5)} :root[data-theme="creme"]{--scrim:rgba(74,71,66,.5)}
'''

JS = r'''
// ---------------------------------------------------------------- Screens tab
const SG=%s, EFF=%s, KINDW=%s, PLACES=%s, TIP=%s;
const GI=Object.fromEntries(SG.map(g=>[g.id,g]));
// WHY this little state (2026-10-13 cut): one search, five pills, one question; always grouped by place
const S={q:'',f:new Set(),ask:null,only:null,open:{}};
const IAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const T=k=>esc(TIP[k]||'');
function pathText(g){return g.crumbs.map(c=>c.w).join(' › ')}
// WHY: Popups and Menus widen each other (either kind); every other pill narrows (Popups AND Phone)
function pass(g){
  const fam={};S.f.forEach(f=>{const k=f.startsWith('kind:')?'kind':f;(fam[k]=fam[k]||[]).push(f)});
  for(const k in fam){if(!fam[k].some(f=>f.startsWith('kind:')?g.kind===f.slice(5):f==='work'?g.work.length>0:g.fl[f]))return false}
  if(S.ask!==null&&!g.q.includes(S.ask))return false;
  if(S.only&&!S.only.ids.has(g.id))return false;
  if(S.q){const t=(g.t+' '+g.id+' '+(g.desc||'')+' '+g.place).toLowerCase();if(!S.q.split(/\s+/).every(w=>t.includes(w)))return false}
  return true}
const byPath=(a,b)=>a.id<b.id?-1:1;
// a phone filter shows the phone picture
function pick(g){return S.f.has('phone')?(g.states.find(st=>st.ph)||g.states[0]):g.states[0]}
function tile(g,extra,cls,st){st=st||pick(g);const full=!st.crop&&!st.ph; // WHY: a phone picture is tall and thin; filling the tile would crop it
  const badges=(g.states.length>1?`<span class="badge" data-tip="${T('scr.situations')}">${g.states.length} situations</span>`:'')+(g.work.length&&!S.f.has('work')?`<span class="spill" data-tip="${T('scr.changing')}"><span class="dot"></span>being changed</span>`:'');
  const tip=cls==='here'?'This is the screen you are looking at.':(g.desc?g.desc+' Click to open it.':TIP['scr.tile']);
  return `<figure class="tile${extra?' extra':''}${cls?' '+cls:''}" data-id="${esc(g.id)}" tabindex="0" data-tip="${esc(tip)}"><div class="timg${full?' full':''}"><img src="${st.img}" alt="" decoding="async"><span class="tov">${badges}</span></div>
  <figcaption class="tcap"><span class="tn">${esc(g.t)}</span><span class="tp">${esc(pathText(g)||KINDW[g.kind])}</span></figcaption></figure>`}
const SHOWN=6;
function renderWall(list){const by={};list.forEach(g=>{(by[g.place]=by[g.place]||[]).push(g)});
  const narrowed=S.f.size||S.q||S.only||S.ask!==null;
  return PLACES.filter(k=>by[k]).map(k=>{const L=by[k].sort(byPath);const more=!narrowed&&L.length>SHOWN;const ex=S.open[k];
    return `<section class="gsec${ex?' expanded':''}" data-k="${esc(k)}"><div class="sechead"><div class="gtext"><h2 class="gh"><span data-tip="${T('place.'+k)}">${esc(k)}</span><span class="cnt" data-tip="${T('scr.placecount')}">${L.length}</span></h2></div>${more?`<button class="btn sm showall" data-tip="${ex?T('scr.showfewer'):T('scr.showall')}">${ex?'Show fewer':'Show all '+L.length}</button>`:''}</div>
    <div class="wall">${L.map((g,i)=>tile(g,more&&i>=SHOWN)).join('')}</div></section>`}).join('')||`<div class="empty">No screen matches all of these. <button class="btn sm" id="sall" data-tip="${T('scr.everything')}">Show every screen</button></div>`}
let VIS=[];
function sRender(){const list=SG.filter(pass);VIS=list.slice().sort((a,b)=>PLACES.indexOf(a.place)-PLACES.indexOf(b.place)||byPath(a,b));
  $('#sbody').innerHTML=renderWall(list);
  $$('#sbody .tile').forEach(t=>{const go=()=>openShot(t.dataset.id);t.onclick=go;t.onkeydown=e=>{if(e.key==='Enter')go()}});
  $$('#sbody .showall').forEach(b=>b.onclick=()=>{const k=b.closest('.gsec').dataset.k;S.open[k]=!S.open[k];sRender()});
  const sa=$('#sall');if(sa)sa.onclick=()=>{S.f.clear();S.q='';S.ask=null;S.only=null;$('#sq').value='';$('#sshow').value='';sRender()};
  const n=list.length;
  $('#scount').textContent=(n===SG.length?'All '+n+' screens':n+' of '+SG.length+' screens')+', grouped by where they are in the app.';
  $$('.sbar [data-f]').forEach(b=>b.setAttribute('aria-pressed',S.f.has(b.dataset.f)?'true':'false'));
  const ec=$('#effchip');ec.hidden=!S.only;if(S.only)ec.innerHTML=`${esc(S.only.label)} <button aria-label="Show every screen again" data-tip="${T('scr.only.x')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg></button>`;
  if(S.only)ec.querySelector('button').onclick=()=>{S.only=null;sRender()};
  fades()}
$$('.sbar [data-f]').forEach(b=>b.onclick=()=>{const f=b.dataset.f;S.f.has(f)?S.f.delete(f):S.f.add(f);sRender()});
$('#sshow').onchange=e=>{S.ask=e.target.value===''?null:+e.target.value;sRender()};
$('#sq').oninput=e=>{S.q=e.target.value.trim().toLowerCase();sRender()};
// ---- the picture popup
let DCUR=null,DST=0,DWIN=false,DPATH=false,LASTFOCUS=null;
function openShot(id,stIdx){const g=GI[id];if(!g)return;if(!DCUR)LASTFOCUS=document.activeElement;DCUR=id;DST=stIdx??Math.max(0,g.states.indexOf(pick(g)));DWIN=false;drawShot();
  $('#scrim').hidden=false;$('#dwrap').hidden=false;$('#dbody').scrollTop=0;fades();$('#dclose').focus({preventScroll:true})}
function pathHTML(g){const chain=g.chain.map(id=>GI[id]);const kids=g.kids.map(k=>GI[k]).sort(byPath);
  return `<section class="dpath" id="dpath"><div class="sechead"><div class="gtext"><h3 class="gh" data-tip="${T('pop.way')}">How you get here</h3><p class="gdesc">${g.depth===1?'It opens straight from the main window.':'Start at the main window and click through these, left to right.'}</p></div></div>
  <div class="trail"><div class="start t-xs muted">The main window</div>${chain.map(c=>`<span class="arrow">${IAR}</span>`+tile(c,false,'',c.states[0])).join('')}<span class="arrow">${IAR}</span>${tile(g,false,'here',g.states[DST])}</div>
  <div class="sechead"><div class="gtext"><h3 class="gh"><span data-tip="${T('pop.opens')}">What opens from here</span><span class="cnt" data-tip="${T('pop.opens.count')}">${kids.length}</span></h3>${kids.length?'':'<p class="gdesc">Nothing else opens from this screen.</p>'}</div></div><div class="wall">${kids.map(k=>tile(k,false,'',k.states[0])).join('')}</div></section>`}
function drawShot(){const g=GI[DCUR],st=g.states[DST];$('#dti').textContent=g.t+(g.states.length>1&&st.l!=='Usual'?' · '+st.l:'');
  $('#dti').dataset.tip=g.desc||(KINDW[g.kind]+' in '+g.place+'.');
  const where=['The main window',...g.crumbs.map(c=>c.w)].map(w=>`<span>${esc(w)}</span>`).join('<span class="sep">›</span>')+`<span class="sep">›</span><b>${esc(g.t)}</b>`;
  const work=g.work.map(i=>EFF[i]);
  const flags=[g.fl.first&&'Shown only before you have used the app',g.fl.type&&'Has a place to type',g.fl.phone&&'Has a phone version',g.fl.err&&'Has a picture of something going wrong'].filter(Boolean);
  // WHY one picture you click instead of a Close up / In the window switch (2026-10-13 cut): the close-up shows first; clicking it shows the whole window
  const img=`<img src="${DWIN?st.win:st.img}" alt="${esc(g.t)}">`;
  const pic=st.crop?`<button class="dimg${DWIN?' full':''}" id="dzoom" data-tip="${DWIN?T('pop.zoomin'):T('pop.zoomout')}">${img}</button>`:`<div class="dimg full">${img}</div>`;
  $('#dbody').innerHTML=`<div class="dgrid"><div class="dleft">${pic}
  <div class="dbar"><span class="t-xs muted">${g.states.length>1?`Situation ${DST+1} of ${g.states.length}: ${esc(st.l)}`:'One situation photographed'}${st.ph?' · phone size':''}${st.crop?(DWIN?' · click the picture to zoom back in':' · click the picture to see the whole window'):''}</span></div>
  ${g.states.length>1?`<div class="sstrip" role="group" aria-label="Situations">${g.states.map((s,i)=>`<button aria-pressed="${i===DST}" data-st="${i}" data-tip="${T('pop.situation')} (${esc(s.l)})"><span class="si"><img src="${s.img}" alt=""></span><span>${esc(s.l)}</span></button>`).join('')}</div>`:''}
  </div><div class="dfacts">
    <div><div class="eyebrow" data-tip="${T('pop.where')}">Where it is</div><div class="crumbs">${where}</div></div>
    <p class="t-sm">${g.desc?esc(g.desc):'<span class="missing">No description yet. The real version has an agent write one sentence when this screen\'s code changes.</span>'}</p>
    <dl class="factlist"><dt data-tip="${T('pop.kind')}">Kind</dt><dd>${KINDW[g.kind]}</dd><dt data-tip="${T('pop.place')}">Place</dt><dd>${esc(g.place)}</dd><dt data-tip="${T('pop.clicks')}">Clicks to reach</dt><dd>${g.depth}</dd>${flags.length?`<dt data-tip="${T('pop.also')}">Also</dt><dd>${flags.join('<br>')}</dd>`:''}</dl>
    <div><div class="eyebrow" data-tip="${T('pop.work')}">Work changing it</div>${work.length?work.map(w=>`<div class="row slim"><div class="body"><div class="t-xs">${esc(w.title)}</div><div class="hint">last worked on ${w.days===0?'today':w.days+' days ago'}</div></div></div>`).join(''):'<div class="t-xs muted">Nothing open.</div>'}</div>
  </div></div>${DPATH?pathHTML(g):''}`;
  $('#dfoot').innerHTML=`<button class="btn" id="dpathbtn" aria-expanded="${DPATH}" data-tip="${DPATH?T('pop.path.hide'):T('pop.path')}">${DPATH?'Hide the way here':'How do I get here?'}</button><button class="btn" data-does data-tip="${T('pop.changed')}">What changed last time</button><button class="btn" data-does data-tip="${T('pop.ask')}">Ask the assistant about it</button><button class="btn primary" data-does data-tip="${T('pop.note')}">Leave a note</button>`;
  $$('#dbody [data-st]').forEach(b=>b.onclick=()=>{DST=+b.dataset.st;drawShot()});
  const z=$('#dzoom');if(z)z.onclick=()=>{DWIN=!DWIN;drawShot()};
  $$('#dpath .tile:not(.here)').forEach(t=>{t.onclick=()=>openShot(t.dataset.id);t.onkeydown=e=>{if(e.key==='Enter')openShot(t.dataset.id)}});
  $('#dpathbtn').onclick=()=>{DPATH=!DPATH;drawShot();if(DPATH)requestAnimationFrame(()=>$('#dpath').scrollIntoView({block:'start',behavior:'smooth'}))};
  const i=VIS.findIndex(x=>x.id===DCUR);$('#dprev').disabled=i<=0;$('#dnext').disabled=i<0||i>=VIS.length-1;
  requestAnimationFrame(()=>fade($('#dbody')))}
function stepShot(d){const i=VIS.findIndex(x=>x.id===DCUR);const n=VIS[i+d];if(n)openShot(n.id)}
function closeShot(){if(!DCUR)return;DCUR=null;$('#scrim').hidden=true;$('#dwrap').hidden=true;hideTip();if(LASTFOCUS&&LASTFOCUS.focus)LASTFOCUS.focus({preventScroll:true})}
$('#dclose').onclick=closeShot;$('#scrim').onclick=closeShot;$('#dwrap').onclick=e=>{if(e.target.id==='dwrap')closeShot()};
$('#dprev').onclick=()=>stepShot(-1);$('#dnext').onclick=()=>stepShot(1);
$('#dbody').addEventListener('scroll',e=>{fade(e.target);hideTip()},{passive:true});
document.addEventListener('keydown',e=>{if(!DCUR)return;if(e.key==='Escape'){e.stopImmediatePropagation();closeShot()}else if(e.key==='ArrowRight')stepShot(1);else if(e.key==='ArrowLeft')stepShot(-1)},true);
// WHY global: Today and Big picture link into the same popup and the same filters
window.showScreens=function(label,ids){S.only={label,ids:new Set(ids)};S.f.clear();S.q='';S.ask=null;$('#sq').value='';$('#sshow').value='';$('[data-view=app]').click();sRender()};
window.showScreensFor=function(effIdx){showScreens('Changed by: '+EFF[effIdx].title,SG.filter(g=>g.work.includes(effIdx)).map(g=>g.id))};
// screens whose path starts with any of these names (the same rule the work list uses)
window.screensMatching=function(pats){return SG.filter(g=>pats.some(p=>g.id===p||g.id.startsWith(p+'/')||g.id.startsWith(p+'#'))).map(g=>g.id)};
window.openShot=openShot;
sRender();
'''
