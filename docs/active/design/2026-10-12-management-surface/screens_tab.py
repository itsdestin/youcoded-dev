"""The Screens tab: every photographed screen, with facets you can group, filter and sort by,
the click path into each one, and a picture popup.

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
def head_controls(questions_short, efforts):
    """The one control bar, in the tab's fixed head. WHY this split (one pattern on both tabs):
    SegmentedTabs choose HOW you look (Pictures / Tree / Trail, and Group by); filter pills choose
    WHAT you see, and can be combined; sort and search sit at the end."""
    # WHY short labels: sixteen long pills wrapped to three rows of fixed header; the full meaning is on hover.
    kp = ''.join(f'<button class="fchip" data-f="kind:{k}" title="{E(w)}">{E(lbl)}</button>' for k, lbl, w in KINDS if k != 'dev')
    hp = ''.join(f'<button class="fchip" data-f="{f}" title="{E(tip)}">{E(lbl)}</button>' for f, lbl, tip in (
        ('type', 'Text box', 'Has a box you type into: a message, a name, a key, a search, a document'),
        ('first', 'First launch', 'Shown only before you have used the app: setup, one-time warnings, the tour'),
        ('phone', 'Phone', 'Also photographed at phone width'),
        ('err', 'Problems', 'Has a picture of something going wrong: a failed load, a refused key')))
    wp = ''.join(f'<button class="fchip" data-f="{f}" title="{E(tip)}">{E(lbl)}</button>' for f, lbl, tip in (
        ('work', 'Changing now', 'Unfinished work touches it'),
        ('rel', 'Since release', 'Changed since v1.3.0 went out')))
    qp = ''.join(f'<button class="fchip" data-f="q:{i}" title="{E(q)}">{E(s)}</button>' for i, (q, s) in enumerate(questions_short))
    return f'''<div class="lensbar sbar">
  <div class="srow">
    <div class="tabs" role="tablist" aria-label="Look at them as"><button role="tab" aria-selected="true" data-sv="wall">Pictures</button><button role="tab" aria-selected="false" data-sv="tree">Tree</button><button role="tab" aria-selected="false" data-sv="trail">Trail</button></div>
    <span class="glab t-xs muted grpwrap">Group by</span><div class="tabs grpwrap" role="tablist" aria-label="Group by"><button role="tab" aria-selected="true" data-g="place">Place</button><button role="tab" aria-selected="false" data-g="kind">Kind</button><button role="tab" aria-selected="false" data-g="depth">Clicks in</button><button role="tab" aria-selected="false" data-g="work">Work</button></div>
    <div class="bandpill" title="Sort"><select id="ssort" aria-label="Sort"><option value="path">In click order</option><option value="shallow">Fewest clicks first</option><option value="deep">Most clicks first</option><option value="recent">Recently worked on</option><option value="states">Most situations</option></select></div>
    <input class="field" id="sq" type="search" placeholder="Find a screen" aria-label="Find a screen">
  </div>
  <div class="frow fchips" role="group" aria-label="Show only">
    {kp}<span class="fsep" aria-hidden="true"></span>{hp}<span class="fsep" aria-hidden="true"></span>{wp}<span class="fsep" aria-hidden="true"></span>{qp}
    <span class="fchip effchip" id="effchip" hidden></span>
    <button class="btn sm" id="fclear" hidden>Clear</button>
  </div>
</div>'''

def dialog_shell():
    """The picture popup. WHY a popup and not the side panel (Destin: "i don't like the side panel
    for images. should probably be a popup"): it is the app's Dialog (Dialog.tsx/.css) at wide size,
    image first: one-line 16px title, the drawn close button, the tapered line under the header,
    Esc and the scrim close it, the body fades at its edges, buttons in the footer with no line."""
    X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg>'
    L = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
    R = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
    return f'''<div class="scrim" id="scrim" hidden></div>
<div class="dwrap" id="dwrap" hidden><div class="dialog layer" role="dialog" aria-modal="true" aria-labelledby="dti">
  <div class="dhead hline"><h2 class="dtitle" id="dti"></h2><div class="dhbtns"><button class="closebtn" id="dprev" aria-label="Previous screen" title="Previous (left arrow)">{L}</button><button class="closebtn" id="dnext" aria-label="Next screen" title="Next (right arrow)">{R}</button><button class="closebtn" id="dclose" aria-label="Close">{X}</button></div></div>
  <div class="dbody fadescroll" id="dbody"></div>
  <div class="dfoot" id="dfoot"></div>
</div></div>'''

CSS = '''
/* ---- Screens: the control bar (one pattern on both tabs: SegmentedTabs = how you look; filter pills = what you see) ---- */
.sbar{flex-direction:column;align-items:stretch!important;gap:8px!important}
.srow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.glab{margin-left:8px}
/* FIELD_SURFACE (cardLevels.ts): 'bg-inset border border-edge-card rounded-lg', Input sm 'px-3 py-1.5 text-xs' */
.field{font:inherit;font-size:12px;line-height:16px;padding:6px 12px;border-radius:var(--radius-lg);border:1px solid var(--edge-card);background:var(--inset);color:var(--fg);width:200px}
.field::placeholder{color:var(--fg-muted)} .field:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.fsep{width:1px;align-self:stretch;margin:4px 4px;background:var(--edge-card)}
.effchip{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:var(--on-accent);border-color:var(--accent);cursor:default}
.effchip button{border:0;background:transparent;color:inherit;cursor:pointer;padding:0;display:inline-flex}
.effchip svg{width:14px;height:14px}
/* ---- the wall: the picture is the tile; one line of name, one small line of path (Destin: "text/label space is too big, and the actual images are too small") ---- */
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
/* ---- tree: nesting by click path ---- */
.tree{display:flex;flex-direction:column;gap:6px}
.tnode > .row{cursor:pointer;margin:0;transition:background-color 120ms steps(4)}
@media (hover:hover){.tnode > .row:hover{background:var(--inset)}}
.tnode > .row .mini{width:88px;height:55px;flex:none;background:var(--well);border-radius:var(--radius-md);border:1px solid var(--edge-card);display:flex;align-items:center;justify-content:center;overflow:hidden}
.tnode > .row .mini img{max-width:100%;max-height:100%;object-fit:contain}
.tnode.dimmed > .row{opacity:.55}
.tkids{margin:6px 0 0 24px;padding-left:12px;border-left:1px solid var(--edge-card);display:flex;flex-direction:column;gap:6px}
.tnode.closed > .tkids{display:none}
.twist{width:28px;height:28px;border:0;background:transparent;color:var(--fg-muted);border-radius:var(--radius-lg);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none}
.twist svg{width:16px;height:16px;transition:transform var(--dur-hover) var(--ease)} .tnode:not(.closed) > .row .twist svg{transform:rotate(90deg)}
.wordnode > .tgroup .twist svg{transform:none}
@media (hover:hover){.twist:hover{background:var(--inset);color:var(--fg)}}
.twist.none{visibility:hidden}
.rowtags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.tgroup{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:500;color:var(--fg-muted);padding:2px 0;cursor:pointer}
.wordnode:not(.closed) > .tgroup .twist svg{transform:rotate(90deg)}
/* ---- trail: a chosen screen's way in, and what opens from it ---- */
.trail{display:flex;align-items:center;gap:8px;overflow-x:auto;padding:12px 8px 20px}
.trail .tile{flex:none;width:208px}
.trail .tile.here{width:320px;outline:2px solid var(--accent);outline-offset:2px}
.trail .tile.here .timg{height:220px}
.trail .arrow{flex:none;color:var(--fg-muted)} .trail .arrow svg{width:20px;height:20px}
.trail .start{flex:none;width:120px;text-align:center}
.trailhead{display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;padding:0 4px}
.trailhead .gtext{flex:1}
/* ---- the picture popup: Dialog.tsx 'wide' + Dialog.css ---- */
.scrim{position:fixed;inset:0;background:var(--scrim);z-index:30}
.dwrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;z-index:31;pointer-events:none}
.dialog{pointer-events:auto;width:100%;max-width:min(1100px,94vw);max-height:calc(100vh - 6rem);display:flex;flex-direction:column;overflow:hidden}
.dhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:56px;padding:12px 16px}
.dtitle{font-size:16px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dhbtns{display:flex;gap:4px;flex:none}
.dbody{flex:1;padding:16px;overflow-wrap:anywhere}
.dfoot{flex:none;display:flex;justify-content:flex-end;gap:8px;padding:0 16px 16px;flex-wrap:wrap}
.dimg{background:var(--well);border-radius:var(--radius-lg);border:1px solid var(--edge-card);display:flex;align-items:center;justify-content:center;padding:12px;min-height:200px}
.dimg img{max-width:100%;max-height:max(260px,calc(100vh - 420px));object-fit:contain;border-radius:var(--radius-md);box-shadow:0 2px 10px rgba(0,0,0,var(--shadow-strength))}
.dimg.full{padding:0} .dimg.full img{border-radius:var(--radius-lg);box-shadow:none;max-height:max(260px,calc(100vh - 400px))}
.dbar{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.dbar .tabs button{font-size:12px;line-height:16px;padding:4px 10px}
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
.crumbs a,.lnk{color:var(--fg);text-decoration:underline;text-decoration-color:var(--edge-strong);text-underline-offset:3px;cursor:pointer;background:none;border:0;padding:0;font:inherit}
.crumbs .sep{color:var(--fg-muted)}
.kidchips{display:flex;flex-wrap:wrap;gap:6px}
.factlist{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px} .factlist dt{color:var(--fg-muted)} .factlist dd{margin:0;color:var(--fg)}
.dbody .row{margin-bottom:6px}
@media (max-width:900px){.dgrid{grid-template-columns:1fr}}
@media (max-width:760px){
  .field{width:100%} .glab{margin-left:0}
  .dgrid{grid-template-columns:1fr}
  .dialog{max-width:100vw;max-height:calc(100vh - 2rem)}
  .wall{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))} .timg{height:128px}
  .frow{flex-wrap:nowrap;overflow-x:auto}
  .srow .tabs{max-width:100%}
  .trail .tile.here{width:240px}
}
:root,:root[data-theme="light"]{--scrim:rgba(73,73,73,.5)} :root[data-theme="dark"]{--scrim:rgba(7,7,7,.5)}
:root[data-theme="midnight"]{--scrim:rgba(5,7,9,.5)} :root[data-theme="creme"]{--scrim:rgba(74,71,66,.5)}
'''

JS = r'''
// ---------------------------------------------------------------- Screens tab
const SG=%s, EFF=%s, QS=%s, KINDW=%s, PLACES=%s;
const GI=Object.fromEntries(SG.map(g=>[g.id,g]));
const S={view:'wall',group:'place',sort:'path',q:'',f:new Set(),only:null,trail:null,open:{}};
const ICH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
const IAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function pathText(g){return g.crumbs.map(c=>c.w).join(' › ')||PLACESHORT(g)}
function PLACESHORT(g){return ''}
function stOk(st,f){return f==='type'?st.ty:f==='phone'?st.ph:f==='err'?st.er:true}
// WHY: pills in the same family widen (Popups OR Menus); families narrow each other (Popups AND Phone version)
function pass(g){
  const fam={};S.f.forEach(f=>{const k=f.split(':')[0];(fam[k]=fam[k]||[]).push(f)});
  for(const k in fam){const ok=fam[k].some(f=>{if(f.startsWith('kind:'))return g.kind===f.slice(5);if(f.startsWith('q:'))return g.q.includes(+f.slice(2));
    if(f==='work')return g.work.length>0;if(f==='rel')return g.rel;return g.fl[f]});if(!ok)return false}
  if(S.only&&!S.only.ids.has(g.id))return false;
  if(S.q){const t=(g.t+' '+g.id+' '+(g.desc||'')+' '+g.place).toLowerCase();if(!S.q.split(/\s+/).every(w=>t.includes(w)))return false}
  return true}
const famOf=f=>f.startsWith('kind:')?'kind':f.startsWith('q:')?'q':(f==='work'||f==='rel')?'work':f;
function sorter(a,b){const s=S.sort;
  if(s==='shallow'&&a.depth!==b.depth)return a.depth-b.depth;
  if(s==='deep'&&a.depth!==b.depth)return b.depth-a.depth;
  if(s==='recent'){const x=a.recent??999,y=b.recent??999;if(x!==y)return x-y;if(a.rel!==b.rel)return a.rel?-1:1}
  if(s==='states'&&a.states.length!==b.states.length)return b.states.length-a.states.length;
  return a.id<b.id?-1:1}
// which picture a tile shows: the first state that fits the filter (a phone filter shows the phone picture)
function pick(g){const fs=['type','phone','err'].filter(f=>S.f.has(f));return g.states.find(st=>fs.every(f=>stOk(st,f)))||g.states[0]}
function tile(g,extra,cls){const st=pick(g);const full=!st.crop&&!st.ph; // WHY: a phone picture is tall and thin; filling the tile would crop it
  const badges=(g.states.length>1?`<span class="badge" title="The same screen in ${g.states.length} situations">${g.states.length} situations</span>`:'')+(g.work.length&&!S.f.has('work')?'<span class="spill" title="Unfinished work touches it"><span class="dot"></span>changing</span>':'');
  return `<figure class="tile${extra?' extra':''}${cls?' '+cls:''}" data-id="${esc(g.id)}" tabindex="0"><div class="timg${full?' full':''}"><img src="${st.img}" alt="" decoding="async"><span class="tov">${badges}</span></div>
  <figcaption class="tcap"><span class="tn" title="${esc(g.t)}">${esc(g.t)}</span><span class="tp" title="${esc(pathText(g))}">${esc(pathText(g)||KINDW[g.kind])}</span></figcaption></figure>`}
const GROUPW={place:g=>g.place,kind:g=>KINDW[g.kind],depth:g=>g.depth===1?'Opens from the main window':g.depth===2?'Two clicks in':g.depth===3?'Three clicks in':'Four or more clicks in',
  work:g=>g.work.length?'Being changed now':g.rel?'Changed since the last release':'Not touched since the release'};
const GROUPORDER={place:PLACES,kind:Object.values(KINDW),depth:['Opens from the main window','Two clicks in','Three clicks in','Four or more clicks in'],work:['Being changed now','Changed since the last release','Not touched since the release']};
const SHOWN=10;
function renderWall(list){const by={};list.forEach(g=>{const k=GROUPW[S.group](g);(by[k]=by[k]||[]).push(g)});
  const narrowed=S.f.size||S.q||S.only;
  return GROUPORDER[S.group].filter(k=>by[k]).map(k=>{const L=by[k].sort(sorter);const more=!narrowed&&L.length>SHOWN;const ex=S.open[k];
    return `<section class="gsec${ex?' expanded':''}" data-k="${esc(k)}"><div class="sechead"><div class="gtext"><h2 class="gh">${esc(k)}<span class="cnt">${L.length}</span></h2></div>${more?`<button class="btn sm showall">${ex?'Show fewer':'Show all '+L.length}</button>`:''}</div>
    <div class="wall">${L.map((g,i)=>tile(g,more&&i>=SHOWN)).join('')}</div></section>`}).join('')||'<div class="empty">No screen matches all of these. Take a filter off.</div>'}
// WHY word groups (Destin: "clearer nesting"): 'chat/first-time-warning/full-auto' has no screen called
// 'first-time-warning', so its three warnings used to sit loose under Chat. The in-between word now
// becomes a quiet heading they nest under; it is not clickable because nothing is photographed there.
function bucket(base,items){const direct=[],words={};items.forEach(g=>{const rest=(base?g.id.slice(base.length+1):g.id).split('/');if(rest.length>1){(words[rest[0]]=words[rest[0]]||[]).push(g)}else direct.push(g)});
  return {direct,words}}
function renderTree(list){const keep=new Set();list.forEach(g=>{keep.add(g.id);g.chain.forEach(c=>keep.add(c))});const hit=new Set(list.map(g=>g.id));
  const narrowed=S.f.size||S.q||S.only;
  const kidsHTML=(base,items)=>{const b=bucket(base,items);return b.direct.map(node).join('')+Object.keys(b.words).sort().map(w=>{const key='w:'+(base?base+'/':'')+w;const closed=S.open[key]===false;
    return `<div class="tnode wordnode${closed?' closed':''}" data-key="${esc(key)}"><div class="tgroup"><button class="twist" aria-label="Show or hide">${ICH}</button>${esc(w.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase()))} <span class="cnt">${b.words[w].length}</span></div><div class="tkids">${b.words[w].map(node).join('')}</div></div>`}).join('')};
  const node=g=>{const kids=g.kids.map(k=>GI[k]).filter(k=>keep.has(k.id)).sort(sorter);const st=pick(g);const closed=S.open['t:'+g.id]===false||(S.open['t:'+g.id]===undefined&&g.depth>=2&&!narrowed);
    const tags=[`<span class="badge">${KINDW[g.kind]}</span>`,g.states.length>1?`<span class="badge">${g.states.length} situations</span>`:'',g.fl.first?'<span class="badge">first launch</span>':'',g.fl.type?'<span class="badge">text box</span>':'',g.fl.phone?'<span class="badge">phone</span>':'',g.fl.err?'<span class="badge">problem</span>':'',g.work.length?'<span class="spill"><span class="dot"></span>changing</span>':''].join('');
    const hint=[kids.length?kids.length+(kids.length===1?' screen opens':' screens open')+' from here':'',g.desc?esc(g.desc):''].filter(Boolean).join(' · ');
    return `<div class="tnode${hit.has(g.id)?'':' dimmed'}${closed&&kids.length?' closed':''}" data-id="${esc(g.id)}"><div class="row"><button class="twist${kids.length?'':' none'}" aria-label="Show what opens from here">${ICH}</button><div class="mini"><img src="${st.img}" alt=""></div>
      <div class="body"><div class="t-sm">${esc(g.t)}</div>${hint?`<div class="hint">${hint}</div>`:''}<div class="rowtags">${tags}</div></div>
      <div class="acts"><button class="btn sm trace" data-id="${esc(g.id)}">Trace</button></div></div>${kids.length?`<div class="tkids">${kidsHTML(g.id,kids)}</div>`:''}</div>`};
  const roots=SG.filter(g=>!g.parent&&keep.has(g.id)).sort(sorter);
  const byPlace={};roots.forEach(g=>{(byPlace[g.place]=byPlace[g.place]||[]).push(g)});
  return PLACES.filter(p=>byPlace[p]).map(p=>`<section class="gsec"><div class="sechead"><div class="gtext"><h2 class="gh">${esc(p)}</h2></div></div><div class="tree">${kidsHTML('',byPlace[p])}</div></section>`).join('')||'<div class="empty">No screen matches all of these. Take a filter off.</div>'}
function renderTrail(list){const g=GI[S.trail];
  if(!g)return `<div class="trailhead"><div class="gtext"><h2 class="gh">Pick a screen to trace</h2><p class="gdesc">Its way in from the main window, and everything that opens from it, laid out in order. Click any picture below.</p></div></div><div class="wall">${list.slice().sort(sorter).slice(0,40).map(x=>tile(x)).join('')}</div>`;
  const chain=g.chain.map(id=>GI[id]);const kids=g.kids.map(k=>GI[k]).sort(sorter);const sib=g.parent?GI[g.parent].kids.filter(k=>k!==g.id).map(k=>GI[k]):[];
  return `<div class="trailhead"><div class="gtext"><h2 class="gh">The way to ${esc(g.t)}</h2><p class="gdesc">${g.depth===1?'It opens straight from the main window.':(g.depth-1)+(g.depth===2?' screen':' screens')+' open first, left to right. Click any picture to trace it instead.'}</p></div><button class="btn sm" id="trailopen">Open the picture</button></div>
  <div class="trail"><div class="start t-xs muted">The main window</div>${chain.map(c=>`<span class="arrow">${IAR}</span>`+tile(c)).join('')}<span class="arrow">${IAR}</span>${tile(g,false,'here')}</div>
  <section class="gsec"><div class="sechead"><div class="gtext"><h2 class="gh">Opens from here<span class="cnt">${kids.length}</span></h2>${kids.length?'':'<p class="gdesc">Nothing else opens from this screen.</p>'}</div></div><div class="wall">${kids.map(k=>tile(k)).join('')}</div></section>
  ${sib.length?`<section class="gsec"><div class="sechead"><div class="gtext"><h2 class="gh">Also opens from ${esc(GI[g.parent].t)}<span class="cnt">${sib.length}</span></h2></div></div><div class="wall">${sib.sort(sorter).map(k=>tile(k)).join('')}</div></section>`:''}`}
let VIS=[];
function sRender(){const list=SG.filter(pass);VIS=list.slice().sort(sorter);
  $('#sbody').innerHTML=S.view==='wall'?renderWall(list):S.view==='tree'?renderTree(list):renderTrail(list);
  $$('#sbody .tile').forEach(t=>{const go=()=>S.view==='trail'&&!t.classList.contains('here')?trace(t.dataset.id):openShot(t.dataset.id);t.onclick=go;t.onkeydown=e=>{if(e.key==='Enter')go()}});
  $$('#sbody .tnode > .row').forEach(r=>r.onclick=e=>{const id=r.parentElement.dataset.id;if(e.target.closest('.twist')){const n=r.parentElement;n.classList.toggle('closed');S.open['t:'+id]=!n.classList.contains('closed');fades();return}if(e.target.closest('.trace')){trace(id);return}openShot(id)});
  $$('#sbody .wordnode > .tgroup').forEach(h=>h.onclick=()=>{const n=h.parentElement;n.classList.toggle('closed');S.open[n.dataset.key]=!n.classList.contains('closed');fades()});
  $$('#sbody .showall').forEach(b=>b.onclick=()=>{const k=b.closest('.gsec').dataset.k;S.open[k]=!S.open[k];sRender()});
  const to=$('#trailopen');if(to)to.onclick=()=>openShot(S.trail);
  // WHY a sentence, not a bare number: it says what you are looking at and how it is arranged
  const n=list.length,how=S.view==='wall'?' Grouped by '+({place:'place',kind:'kind',depth:'how many clicks in',work:'work'})[S.group]+', '+$('#ssort').selectedOptions[0].text.toLowerCase()+'.':S.view==='tree'?' Each screen sits under the one that opens it.':'';
  $('#scount').textContent=(n===SG.length?'All '+n+' screens.':n+' of '+SG.length+' screens match.')+how;
  $('#fclear').hidden=!(S.f.size||S.q||S.only);
  $$('.sbar [data-f]').forEach(b=>b.setAttribute('aria-pressed',S.f.has(b.dataset.f)?'true':'false'));
  $$('.sbar [data-sv]').forEach(b=>b.setAttribute('aria-selected',b.dataset.sv===S.view));
  $$('.sbar [data-g]').forEach(b=>b.setAttribute('aria-selected',b.dataset.g===S.group));
  $$('.sbar .grpwrap').forEach(x=>x.hidden=S.view!=='wall');
  const ec=$('#effchip');ec.hidden=!S.only;if(S.only)ec.innerHTML=`${esc(S.only.label)} <button aria-label="Show every screen again"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg></button>`;
  if(S.only)ec.querySelector('button').onclick=()=>{S.only=null;sRender()};
  fades()}
function trace(id){S.view='trail';S.trail=id;closeShot();sRender();$('#scroller').scrollTop=0}
$$('.sbar [data-f]').forEach(b=>b.onclick=()=>{const f=b.dataset.f;S.f.has(f)?S.f.delete(f):S.f.add(f);sRender()});
$$('.sbar [data-sv]').forEach(b=>b.onclick=()=>{S.view=b.dataset.sv;sRender();$('#scroller').scrollTop=0});
$$('.sbar [data-g]').forEach(b=>b.onclick=()=>{S.group=b.dataset.g;sRender()});
$('#ssort').onchange=e=>{S.sort=e.target.value;sRender()};
$('#sq').oninput=e=>{S.q=e.target.value.trim().toLowerCase();sRender()};
$('#fclear').onclick=()=>{S.f.clear();S.q='';S.only=null;$('#sq').value='';sRender()};
// ---- the picture popup
let DCUR=null,DST=0,DWIN=false,LASTFOCUS=null;
function openShot(id,stIdx){const g=GI[id];if(!g)return;if(!DCUR)LASTFOCUS=document.activeElement;DCUR=id;DST=stIdx??Math.max(0,g.states.indexOf(pick(g)));DWIN=false;drawShot();
  $('#scrim').hidden=false;$('#dwrap').hidden=false;$('#dbody').scrollTop=0;fades();$('#dclose').focus({preventScroll:true})}
function drawShot(){const g=GI[DCUR],st=g.states[DST];$('#dti').textContent=g.t+(g.states.length>1&&st.l!=='Usual'?' · '+st.l:'');
  const crumbs=g.crumbs.length?g.crumbs.map(c=>c.id?`<a data-go="${esc(c.id)}">${esc(c.w)}</a>`:`<span>${esc(c.w)}</span>`).join('<span class="sep">›</span>')+`<span class="sep">›</span><b>${esc(g.t)}</b>`:'<span>Opens straight from the main window</span>';
  const kids=g.kids.map(k=>GI[k]);
  const work=g.work.map(i=>EFF[i]);
  const flags=[g.fl.first&&'Shown only on first launch',g.fl.type&&'Has a place to type',g.fl.phone&&'Has a phone version',g.fl.err&&'Has a picture of a problem',g.rel&&'Changed since the last release'].filter(Boolean);
  $('#dbody').innerHTML=`<div class="dgrid"><div class="dleft"><div class="dimg${(!st.crop||DWIN)?' full':''}"><img src="${DWIN?st.win:st.img}" alt="${esc(g.t)}"></div>
  <div class="dbar">${st.crop?`<div class="tabs" role="tablist" aria-label="Picture"><button role="tab" aria-selected="${!DWIN}" data-win="0">Close up</button><button role="tab" aria-selected="${DWIN}" data-win="1">In the window</button></div>`:''}<span class="t-xs muted">${g.states.length>1?`Situation ${DST+1} of ${g.states.length}: ${esc(st.l)}`:'One situation photographed'}${st.ph?' · phone width':''}${st.er?' · something going wrong':''}</span></div>
  ${g.states.length>1?`<div class="sstrip" role="group" aria-label="Situations">${g.states.map((s,i)=>`<button aria-pressed="${i===DST}" data-st="${i}" title="${esc(s.l)}"><span class="si"><img src="${s.img}" alt=""></span><span>${esc(s.l)}</span></button>`).join('')}</div>`:''}
  </div><div class="dfacts">
    <div><div class="eyebrow">Click path</div><div class="crumbs">${crumbs}</div></div>
    <p class="t-sm">${g.desc?esc(g.desc):'<span class="missing">No description yet. The real version has an agent write one sentence when this screen\'s code changes.</span>'}</p>
    <div><div class="eyebrow">Opens from here${kids.length?` <span class="cnt">${kids.length}</span>`:''}</div>${kids.length?`<div class="kidchips">${kids.map(k=>`<button class="btn sm" data-go="${esc(k.id)}">${esc(k.t)}</button>`).join('')}</div>`:'<div class="t-xs muted">Nothing else.</div>'}</div>
    <dl class="factlist"><dt>Kind</dt><dd>${KINDW[g.kind]}</dd><dt>Place</dt><dd>${esc(g.place)}</dd><dt>Clicks in</dt><dd>${g.depth}</dd>${flags.length?`<dt>Also</dt><dd>${flags.join('<br>')}</dd>`:''}</dl>
    <div><div class="eyebrow">Work changing it</div>${work.length?work.map(w=>`<div class="row slim"><div class="body"><div class="t-xs">${esc(w.title)}</div><div class="hint">last worked on ${w.days===0?'today':w.days+' days ago'}</div></div></div>`).join(''):'<div class="t-xs muted">Nothing open.</div>'}</div>
  </div></div>`;
  $('#dfoot').innerHTML=`<button class="btn" id="dtrace">Trace its path</button><button class="btn" data-does="opens the before/after for the last change that touched it">See before and after</button><button class="btn" data-does="opens a chat already pointed at this screen\'s code">Ask about this</button><button class="btn primary" data-does="saves your comment on this picture as a task with you as the source, and shows it in Today">Comment</button>`;
  $$('#dbody [data-st]').forEach(b=>b.onclick=()=>{DST=+b.dataset.st;drawShot()});
  $$('#dbody [data-win]').forEach(b=>b.onclick=()=>{DWIN=b.dataset.win==='1';drawShot()});
  $$('#dbody [data-go]').forEach(b=>b.onclick=()=>openShot(b.dataset.go));
  $('#dtrace').onclick=()=>trace(DCUR);
  const i=VIS.findIndex(x=>x.id===DCUR);$('#dprev').disabled=i<=0;$('#dnext').disabled=i<0||i>=VIS.length-1;
  requestAnimationFrame(()=>fade($('#dbody')))}
function stepShot(d){const i=VIS.findIndex(x=>x.id===DCUR);const n=VIS[i+d];if(n)openShot(n.id)}
function closeShot(){if(!DCUR)return;DCUR=null;$('#scrim').hidden=true;$('#dwrap').hidden=true;if(LASTFOCUS&&LASTFOCUS.focus)LASTFOCUS.focus({preventScroll:true})}
$('#dclose').onclick=closeShot;$('#scrim').onclick=closeShot;$('#dwrap').onclick=e=>{if(e.target.id==='dwrap')closeShot()};
$('#dprev').onclick=()=>stepShot(-1);$('#dnext').onclick=()=>stepShot(1);
$('#dbody').addEventListener('scroll',e=>fade(e.target),{passive:true});
document.addEventListener('keydown',e=>{if(!DCUR)return;if(e.key==='Escape'){e.stopImmediatePropagation();closeShot()}else if(e.key==='ArrowRight')stepShot(1);else if(e.key==='ArrowLeft')stepShot(-1)},true);
// WHY global: Today and Big picture link into the same popup and the same filters
window.showScreens=function(label,ids){S.only={label,ids:new Set(ids)};S.f.clear();S.q='';$('#sq').value='';S.view='wall';$('[data-view=app]').click();sRender()};
window.showScreensFor=function(effIdx){showScreens('Changed by: '+EFF[effIdx].title,SG.filter(g=>g.work.includes(effIdx)).map(g=>g.id))};
// screens whose path starts with any of these names (the same rule the work list uses)
window.screensMatching=function(pats){return SG.filter(g=>pats.some(p=>g.id===p||g.id.startsWith(p+'/')||g.id.startsWith(p+'#'))).map(g=>g.id)};
window.openShot=openShot;
sRender();
'''
