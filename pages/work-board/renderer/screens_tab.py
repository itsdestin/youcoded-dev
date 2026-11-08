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
# WHY plain words (2026-11-07 review: situation names read "Cc", "Native", "Review ai"): short names in the
# screen list stand for these, and the owner should not have to know them
WORDS = {'cc': 'Claude Code', 'native': 'built-in assistant', 'ai': 'AI', 'cli': 'command line', 'ui': 'UI'}
def pretty(seg):
    seg = re.sub(r'^page-', '', seg)
    words = [WORDS.get(w, w) for w in re.split(r'[-_]', seg)]
    out = ' '.join(words)
    return out[:1].upper() + out[1:]

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

# SINCE THE RELEASE — 'changed' when any situation differs in any theme, 'new' when no situation existed
# then, else None (the same, or no what-changed run given)
def new_count(states):
    """WHY (2026-11-07 review: Chat gained 16 new situations and its popup said they "look the same"): how many
    situations of a screen are new since the release (new in a theme, changed in none) — the New filter and the
    tile's "3 new" tag read it, so new situations on an old screen are not hidden."""
    n = 0
    for st in states:
        v = [t['status'] for t in (st.get('ch') or {}).values()]
        if 'new' in v and 'changed' not in v and 'removed' not in v: n += 1
    return n

def since_of(states):
    # WHY nobefore is left out: "no picture from the release" says nothing about change, and is not news
    sts = [t['status'] for st in states for t in (st.get('ch') or {}).values() if t['status'] != 'nobefore']
    if not sts: return None
    if 'changed' in sts or 'removed' in sts: return 'changed'
    if all(x == 'new' for x in sts): return 'new'
    return 'new' if any(x == 'new' for x in sts) and not any(x == 'unchanged' for x in sts) else None

def change_meta(changes):
    """What the page script needs to name the two sides: the release's label and the themes photographed."""
    if not changes: return None
    lbl = changes['before']['label']
    return dict(release=re.sub(r'^v', '', lbl), themes=changes['themes'], tile=changes.get('tileTheme'))

# ---------------------------------------------------------------------------------------- build
def build(here, names, place_of, desc, efforts, release_pats, questions, matches, pics=None, changes=None):
    # WHY pics (2026-11-04): a what-changed run brings its own, newer pictures and screen list (make_changes.py)
    src = pics['dir'] if pics else here
    defs = {d['name']: d for d in json.load(open(os.path.join(src if os.path.exists(os.path.join(src, 'screen-defs.json')) else here, 'screen-defs.json')))}
    sizes = json.load(open(os.path.join(src, 'sizes.json') if pics else os.path.join(here, 'shots', 'sizes.json')))
    url = pics['url'] if pics else ''
    CH = (changes or {}).get('screens', {})
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
            # WHY ch: what changed on this state since the release, per theme (FORMAT.md's changes, trimmed)
            stl.append(dict(n=x, l=state_label(x), img=url + 'shots/' + f, win=url + 'thumbs/' + f, ch=CH.get(x),
                            crop=sz['crop'], ar=round(sz['w'] / sz['h'], 3), ph=phone(x, dx), er=problem(dx), ty=types_in(x, dx)))
        title = pretty(segs[-1])
        out.append(dict(
            id=k, t=title, crumbs=crumbs, chain=chain, parent=par, depth=len(chain) + 1,
            kind=kind_of((d0 or {}).get('tags', [])), place=place_of(k), desc=desc.get(k),
            states=stl,
            fl=dict(type=any(s['ty'] for s in stl), first=first_only(k), phone=any(s['ph'] for s in stl), err=any(s['er'] for s in stl)),
            work=wk, rel=rel, q=qs, since=since_of(stl), newn=new_count(stl),
            recent=min([efforts[i]['days'] for i in wk], default=None)))
    kids = {}
    for g in out:
        if g['parent']: kids.setdefault(g['parent'], []).append(g['id'])
    for g in out: g['kids'] = kids.get(g['id'], [])
    return out

# ---------------------------------------------------------------------------------------- page parts
# ---------------------------------------------------------------------------------------- page parts
SHOW_ME = ['Talks to the AI', 'Changes how it behaves', 'Add-ons', 'Permissions']

def head_controls(tip, changes=None):
    """The one control row, in the tab's fixed head. WHY this few (2026-10-13, Destin: "this is a
    confusing fucking disaster to navigate.... just wayyy too many controls"): a search box, five
    filter pills and one "Show me…" question. The Pictures/Tree/Trail switch, Group by, the sort
    menu and eleven more pills were cut; the click path now lives inside each screen's popup."""
    T = lambda k: E(tip[k])
    pills = ''.join(f'<button class="fchip" data-f="{f}" aria-pressed="false" data-tip="{T(k)}">{E(lbl)}</button>' for f, lbl, k in (
        ('kind:popup', 'Popups', 'scr.popups'), ('kind:menu', 'Menus', 'scr.menus'), ('first', 'First launch', 'scr.first'),
        ('phone', 'Phone', 'scr.phone'), ('work', 'Changing now', 'scr.work')))
    # WHY two pills only when a run is given: the filter Destin asked for (2026-11-03, "what changed since
    # last release"). New screens sit beside it as a pill, not inside "Show me…" (2026-11-05 review: the same
    # idea in two different controls, one of them hard to find); pressed together they show both.
    meta = change_meta(changes)
    if meta: pills += (f'<button class="fchip" data-f="since" aria-pressed="false" data-tip="{T("scr.since")}">Changed since {E(meta["release"])}</button>'
                       f'<button class="fchip" data-f="new" aria-pressed="false" data-tip="{T("scr.new")}">New since {E(meta["release"])}</button>')
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
/* ---- the comparison inside the popup. References: this popup's own picture well (.dimg), the Git review's
   diff tints (design guide "The code-change view": removed red, added green, status hues only as a tint) ---- */
.dcmp{display:flex;flex-direction:column;gap:12px}
.cmpbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.cmpbar .tabs button{font-size:12px;line-height:16px;padding:4px 10px}
.cmppics{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px} .cmppics.one{grid-template-columns:minmax(0,1fr)}
.cmppic{margin:0;min-width:0} .cmppic .eyebrow{margin:0 0 4px 2px}
.cmpwell{width:100%;font:inherit;color:inherit;background:var(--well);border:1px solid var(--edge-card);border-radius:var(--radius-lg);padding:8px;display:flex;align-items:center;justify-content:center;min-height:120px}
button.cmpwell{cursor:zoom-in} button.cmpwell:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cmpstage{position:relative;display:inline-block;max-width:100%;line-height:0}
.cmpcrop{position:relative;width:100%;overflow:hidden;border-radius:var(--radius-md)}
.cmpcrop .cmpstage{position:absolute;display:block;max-width:none} .cmpcrop .cmpstage img{width:100%;max-width:none;max-height:none;border-radius:0}
.cmpstage img{display:block;max-width:100%;max-height:max(260px,calc(100vh - 360px));width:auto;height:auto;border-radius:var(--radius-md)}
.hl{position:absolute;border:2px solid;border-radius:var(--radius-sm);pointer-events:none;transition:outline-color var(--dur-hover)}
.hl.old{background:color-mix(in srgb,var(--status-error) 12%,transparent);border-color:color-mix(in srgb,var(--status-error) 75%,transparent)}
.hl.new{background:color-mix(in srgb,var(--status-ok) 12%,transparent);border-color:color-mix(in srgb,var(--status-ok) 75%,transparent)}
.hl.hot{outline:2px solid var(--accent);outline-offset:2px}
.cmplist{display:flex;flex-direction:column;gap:6px}
.cmplist .sechead{margin-bottom:2px}
.wd{border-radius:var(--radius-sm);padding:0 3px;color:var(--fg)}
.wd.old{background:color-mix(in srgb,var(--status-error) 16%,transparent);text-decoration:line-through}
.wd.new{background:color-mix(in srgb,var(--status-ok) 16%,transparent)}
@media (max-width:760px){.cmppics{grid-template-columns:minmax(0,1fr)} .cmpbar .tabs{overflow-x:auto;max-width:100%}}
@media (max-width:760px){
  .field{width:100%}
  .dialog{max-width:100vw;max-height:calc(100vh - 2rem)}
  .wall{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))} .timg{height:128px}
  /* WHY wrap (2026-11-05 review): scrolled sideways, the last pills sat off screen with no hint on a phone */
  .sbar .fchips{flex-wrap:wrap}
  /* the list of changes first on a phone: stacked pictures pushed it below the fold */
  .dcmp .cmplist{order:2} .dcmp .cmppics{order:3}
}
:root,:root[data-theme="light"]{--scrim:rgba(73,73,73,.5)} :root[data-theme="dark"]{--scrim:rgba(7,7,7,.5)}
:root[data-theme="midnight"]{--scrim:rgba(5,7,9,.5)} :root[data-theme="creme"]{--scrim:rgba(74,71,66,.5)}
'''

JS = r'''
// ---------------------------------------------------------------- Screens tab
const SG=%s, EFF=%s, KINDW=%s, PLACES=%s, TIP=%s, CM=%s;
const GI=Object.fromEntries(SG.map(g=>[g.id,g]));
// WHY this little state (2026-10-13 cut): one search, five pills, one question; always grouped by place
const S={q:'',f:new Set(),ask:null,only:null,open:{}};
const IAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const T=k=>esc(TIP[k]||'');
function pathText(g){return g.crumbs.map(c=>c.w).join(' › ')}
// WHY: Popups and Menus widen each other (either kind); every other pill narrows (Popups AND Phone)
function pass(g){
  const fam={};S.f.forEach(f=>{const k=f.startsWith('kind:')?'kind':f==='new'?'since':f;(fam[k]=fam[k]||[]).push(f)});
  for(const k in fam){if(!fam[k].some(f=>f.startsWith('kind:')?g.kind===f.slice(5):f==='work'?g.work.length>0:f==='since'?g.since==='changed':f==='new'?g.newn>0:g.fl[f]))return false}
  if(S.ask!==null&&!g.q.includes(S.ask))return false;
  if(S.only&&!S.only.ids.has(g.id))return false;
  if(S.q){const t=(g.t+' '+g.id+' '+(g.desc||'')+' '+g.place).toLowerCase();if(!S.q.split(/\s+/).every(w=>t.includes(w)))return false}
  return true}
const byPath=(a,b)=>a.id<b.id?-1:1;
// a phone filter shows the phone picture
function pick(g){return S.f.has('phone')?(g.states.find(st=>st.ph)||g.states[0]):g.states[0]}
function tile(g,extra,cls,st){st=st||pick(g);const full=!st.crop&&!st.ph; // WHY: a phone picture is tall and thin; filling the tile would crop it
  const badges=(g.states.length>1?`<span class="badge" data-tip="${T('scr.situations')}">${g.states.length} situations</span>`:'')+(g.work.length&&!S.f.has('work')&&!S.f.has('since')&&!S.f.has('new')?`<span class="spill" data-tip="${T('scr.changing')}"><span class="dot"></span>being changed</span>`:'')+(g.since==='changed'&&CM?`<span class="badge" data-tip="${T('scr.badge.changed')}">Changed</span>`:'')
    // a whole new screen says New; an older screen with new situations says how many (it is not itself new)
    +(g.newn&&CM?`<span class="badge" data-tip="${T('scr.badge.new')}">${g.newn===g.states.length?'New':g.newn+' new'}</span>`:'');
  const tip=cls==='here'?'This is the screen you are looking at.':(g.desc?g.desc+' Click to open it.':TIP['scr.tile']);
  return `<figure class="tile${extra?' extra':''}${cls?' '+cls:''}" data-id="${esc(g.id)}" tabindex="0" data-tip="${esc(tip)}"><div class="timg${full?' full':''}"><img src="${st.img}" alt="" decoding="async" loading="lazy"><span class="tov">${badges}</span></div>
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
  // WHY the second sentence (2026-11-07 review: "nothing tells the owner that 152 screens could not be compared"):
  // looking for changes, the count also says how many screens the release has no picture of
  const nb=CM&&(S.f.has('since')||S.f.has('new'))?SG.reduce((k,g)=>k+g.states.filter(st=>stSince(st)==='nobefore').length,0):0;
  $('#scount').textContent=(n===SG.length?'All '+n+' screens':n+' of '+SG.length+' screens')+', grouped by where they are in the app.'+(nb?` ${nb} situations could not be compared: ${CM.release} has no picture of them.`:'');
  $$('.sbar [data-f]').forEach(b=>b.setAttribute('aria-pressed',S.f.has(b.dataset.f)?'true':'false'));
  const ec=$('#effchip');ec.hidden=!S.only;if(S.only)ec.innerHTML=`${esc(S.only.label)} <button aria-label="Show every screen again" data-tip="${T('scr.only.x')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg></button>`;
  if(S.only)ec.querySelector('button').onclick=()=>{S.only=null;sRender()};
  fades()}
$$('.sbar [data-f]').forEach(b=>b.onclick=()=>{const f=b.dataset.f;S.f.has(f)?S.f.delete(f):S.f.add(f);sRender()});
$('#sshow').onchange=e=>{const v=e.target.value;S.ask=v===''?null:+v;sRender()};
$('#sq').oninput=e=>{S.q=e.target.value.trim().toLowerCase();sRender()};
// ---- the picture popup
let DCUR=null,DST=0,DWIN=false,DPATH=false,LASTFOCUS=null;
// WHY compare state lives with the popup (2026-11-04): the comparison is this popup's "What changed" view, not
// a page of its own. DCMP on = the two sides; DTH the theme.
// DZOOM: one side shown at full width (click a picture), else both side by side.
let DCMP=false,DZOOM=null,DTH=null;
// WHY per situation (Destin, 2026-11-05: "for page without changes, the ui can be much simplified instead of
// offering 8 different pages of (nothing actually changed)"): the comparison is offered only on a situation
// that changed; one that is the same, or has no release picture, just says so under the usual picture.
function stSince(st){const v=Object.values(st.ch||{}).map(t=>t.status);if(!v.length)return null;
  return v.includes('changed')||v.includes('removed')?'changed':v.includes('new')?'new':v.every(s=>s==='nobefore')?'nobefore':'same'}
function openShot(id,stIdx){const g=GI[id];if(!g)return;if(!DCUR)LASTFOCUS=document.activeElement;DCUR=id;DWIN=false;DZOOM=null;DTH=null;
  // WHY: opened while looking for changes, the popup opens on the first situation that changed, compared
  const hunting=CM&&S.f.has('since'),first=g.states.findIndex(s=>stSince(s)==='changed');
  // looking for new things, the popup opens on the first new situation
  const firstNew=CM&&S.f.has('new')?g.states.findIndex(s=>stSince(s)==='new'):-1;
  DST=stIdx??(hunting&&first>=0?first:firstNew>=0?firstNew:Math.max(0,g.states.indexOf(pick(g))));if(hunting)DCMP=true;drawShot();
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
  const since=CM?stSince(st):null,cmpOn=DCMP&&since==='changed';
  if(cmpOn){$('#dbody').innerHTML=cmpHTML(g,st)+(DPATH?pathHTML(g):'');wireCmp(g)}else
  $('#dbody').innerHTML=`<div class="dgrid"><div class="dleft">${pic}
  <div class="dbar"><span class="t-xs muted">${g.states.length>1?`Situation ${DST+1} of ${g.states.length}: ${esc(st.l)}`:'One situation photographed'}${st.ph?' · phone size':''}${st.crop?(DWIN?' · click the picture to zoom back in':' · click the picture to see the whole window'):''}${since==='same'?' · looks the same as in '+esc(CM.release):since==='new'?' · new since '+esc(CM.release):since==='nobefore'?' · no picture of it from '+esc(CM.release):''}</span></div>
  ${g.states.length>1?`<div class="sstrip" role="group" aria-label="Situations">${g.states.map((s,i)=>`<button aria-pressed="${i===DST}" data-st="${i}" data-tip="${T('pop.situation')} (${esc(s.l)})"><span class="si"><img src="${s.img}" alt=""></span><span>${esc(s.l)}</span></button>`).join('')}</div>`:''}
  </div><div class="dfacts">
    <div><div class="eyebrow" data-tip="${T('pop.where')}">Where it is</div><div class="crumbs">${where}</div></div>
    ${g.desc?`<p class="t-sm">${esc(g.desc)}</p>`:''}
    <dl class="factlist"><dt data-tip="${T('pop.kind')}">Kind</dt><dd>${KINDW[g.kind]}</dd><dt data-tip="${T('pop.place')}">Place</dt><dd>${esc(g.place)}</dd><dt data-tip="${T('pop.clicks')}">Clicks to reach</dt><dd>${g.depth}</dd>${flags.length?`<dt data-tip="${T('pop.also')}">Also</dt><dd>${flags.join('<br>')}</dd>`:''}</dl>
    <div><div class="eyebrow" data-tip="${T('pop.work')}">Work changing it</div>${work.length?work.map(w=>`<div class="row slim"><div class="body"><div class="t-xs">${esc(w.title)}</div><div class="hint">last worked on ${w.days===0?'today':w.days+' days ago'}</div></div></div>`).join(''):'<div class="t-xs muted">Nothing open.</div>'}</div>
  </div></div>${DPATH?pathHTML(g):''}`;
  $('#dfoot').innerHTML=`<button class="btn" id="dpathbtn" aria-expanded="${DPATH}" data-tip="${DPATH?T('pop.path.hide'):T('pop.path')}">${DPATH?'Hide the way here':'How do I get here?'}</button>${CM?(since==='changed'?`<button class="btn" id="dcmpbtn" aria-expanded="${cmpOn}" data-tip="${cmpOn?T('pop.compare.hide'):T('pop.compare')}">${cmpOn?'Back to the screen':'Compare with '+esc(CM.release)}</button>`:''):`<button class="btn" data-does data-tip="${T('pop.changed')}">What changed last time</button>`}<button class="btn" data-does data-tip="${T('pop.ask')}">Ask the assistant about it</button><button class="btn primary" data-does data-tip="${T('pop.note')}">Leave a note</button>`;
  $$('#dbody [data-st]').forEach(b=>b.onclick=()=>{DST=+b.dataset.st;drawShot()});
  const z=$('#dzoom');if(z)z.onclick=()=>{DWIN=!DWIN;drawShot()};
  $$('#dpath .tile:not(.here)').forEach(t=>{t.onclick=()=>openShot(t.dataset.id);t.onkeydown=e=>{if(e.key==='Enter')openShot(t.dataset.id)}});
  const cb=$('#dcmpbtn');if(cb)cb.onclick=()=>{DCMP=!cmpOn;DZOOM=null;drawShot()};
  $('#dpathbtn').onclick=()=>{DPATH=!DPATH;drawShot();if(DPATH)requestAnimationFrame(()=>$('#dpath').scrollIntoView({block:'start',behavior:'smooth'}))};
  const i=VIS.findIndex(x=>x.id===DCUR);$('#dprev').disabled=i<=0;$('#dnext').disabled=i<0||i>=VIS.length-1;
  requestAnimationFrame(()=>fade($('#dbody')))}
// ---- the comparison: both sides of one screen, marked like the Git review's diff (red = how it was, green = now)
const ROLEW={button:['button','buttons'],link:['link','links'],checkbox:['tick box','tick boxes'],switch:['switch','switches'],textbox:['text box','text boxes'],combobox:['menu','menus'],tab:['tab','tabs'],img:['picture','pictures'],heading:['heading','headings'],menuitem:['menu item','menu items'],radio:['option','options']};
const PROPW={color:'text colour',background:'background',border:'outline',radius:'corners',font:'font',opacity:'transparency'};
const themeName=t=>t.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
function roleW(c,n){const r=ROLEW[c.role];if(r)return r[n>1?1:0];return c.kind==='pixels'?'':(n>1?'pieces of text':'text')}
const px=v=>Math.round(Math.abs(v));
// WHY words, not numbers in boxes (design guide: "say what happens"): "20 px wider", "moved 12 px down"
function shiftWords(c){const a=c.box,b=c.beforeBox;if(!a||!b)return '';const w=[],dw=a.w-b.w,dh=a.h-b.h,dx=a.x-b.x,dy=a.y-b.y;
  if(px(dw))w.push(px(dw)+' px '+(dw>0?'wider':'narrower'));if(px(dh))w.push(px(dh)+' px '+(dh>0?'taller':'shorter'));
  if(px(dx))w.push('moved '+px(dx)+' px '+(dx>0?'right':'left'));if(px(dy))w.push('moved '+px(dy)+' px '+(dy>0?'down':'up'));return w.join(', ')}
// one row per kind of change; the same change on many things (every session row 20 px wider) is one row
function groupChanges(list){const G=[],by={};list.forEach(c=>{const k=c.kind+'|'+(c.role||'')+'|'+(c.kind==='moved'?shiftWords(c):c.kind==='restyled'?(c.styleChanges||[]).map(x=>x.prop).join(','):c.kind==='pixels'?'':(c.hidden?'below':'')+c.kind+(c.name||'')+(c.oldText||'')+(c.newText||''));
  if(!by[k]){by[k]={k:c.kind,items:[]};G.push(by[k])}by[k].items.push(c)});return G}
// WHY a shift is the first line (2026-11-07, the spreadsheet that showed 159 boxes because the sheet sat lower):
// "everything below here moved" is one fact, marked as the band it opened, not one box per cell
function withShift(t){const G=groupChanges(t.changes||[]);const s=t.shift;if(!s||!s.y)return G;
  const y=s.fromY||0,band={x:0,y:s.y>0?y-s.y:y,w:t.vw,h:Math.abs(s.y)};
  return [{k:'shift',dy:s.y,items:[{kind:'shift',box:band,beforeBox:{x:0,y:s.y>0?y-s.y:y+s.y,w:t.vw,h:Math.abs(s.y)}}]},...G]}
function names(items){const n=items.filter(c=>c.name).map(c=>'“'+c.name+'”');return n.length<=3?n.join(', '):n.slice(0,3).join(', ')+' and '+(n.length-3)+' more'}
// WHY the join rule: the comparer trims each piece, so a space goes between pieces except before punctuation
// WHY whole sentences when most words changed (2026-11-07 review: a rewritten sentence read as confetti of struck and
// added words): the old line, then the new one, each whole, is easier to read
function wordsHTML(c){const ws=c.words||[],tot=ws.reduce((k,w)=>k+((w.same??w.old??w.new??'').split(' ').length),0),chg=ws.filter(w=>w.same==null).reduce((k,w)=>k+((w.old||w.new||'').split(' ').length),0);
  if(ws.length&&tot>6&&chg/tot>0.4)return `<span class="wd old">${esc(c.oldText||'')}</span><br><span class="wd new">${esc(c.newText||'')}</span>`;
  if(c.words&&c.words.length){let out='';c.words.forEach((w,i)=>{const first=w.same!=null?w.same:(w.old||w.new||'');
    if(i&&!/^[,.;:!?)]/.test(first))out+=' ';out+=w.same!=null?esc(w.same):(w.old?`<span class="wd old">${esc(w.old)}</span>`:'')+(w.old&&w.new?' ':'')+(w.new?`<span class="wd new">${esc(w.new)}</span>`:'')});return out}
  return `<span class="wd old">${esc(c.oldText||'')}</span> <span class="wd new">${esc(c.newText||'')}</span>`}
function rowText(gr){const c=gr.items[0],n=gr.items.length,r=roleW(c,n),one=n===1&&c.name?' “'+esc(c.name)+'”':'',cnt=n>1?n+' ':'';
  const fieldW=c.field==='title'?'hover hint':c.field==='placeholder'?'hint text':'words';
  // WHY its own wording (2026-11-08 review: About's new paragraph sat below the fold and went unreported): a change
  // the pictures cannot show is named, and the reader is told where to look for it
  if(c.hidden){const many=n>1?esc(names(gr.items)):'';
    if(gr.k==='added')return [`New words below the visible part${n>1?' ('+n+')':''}`,many||'“'+esc(c.newText||'')+'”. Scroll down in the app to see it.'];
    if(gr.k==='removed')return [`Gone from below the visible part${n>1?' ('+n+')':''}`,many||'“'+esc(c.oldText||'')+'” was further down in '+esc(CM.release)+'.'];
    if(gr.k==='text')return ['New words below the visible part',wordsHTML(c)]}
  switch(gr.k){
    case 'added':return [`New ${cnt}${n===1&&/^\d+$/.test(c.newText||'')?'number':r}${one}`,n>1?esc(names(gr.items)):'Not there in '+esc(CM.release)+'.'];
    case 'removed':return [`Gone: ${cnt}${r}${one}`,n>1?esc(names(gr.items)):'It was there in '+esc(CM.release)+'.'];
    // WHY its own line (2026-11-07 release audit): pushed below a scrolling edge is not gone
    case 'scrolled':return c.way==='out'?[`Out of view now: ${cnt}${r}${one}`,(n>1?esc(names(gr.items))+'. ':'')+'Still on the screen, scrolled away or covered.']:[`Now in view: ${cnt}${r}${one}`,(n>1?esc(names(gr.items))+'. ':'')+'It was out of view in '+esc(CM.release)+'.'];
    case 'text':return [`New ${fieldW} on ${r?'the '+r:'the screen'}${c.name&&c.kind==='text'&&c.role?' “'+esc(c.name)+'”':''}`,wordsHTML(c)];
    case 'moved':return [`${n>1?cnt+r:(r||'Something')[0].toUpperCase()+(r||'something').slice(1)+one} ${n>1?'are':'is'} ${esc(shiftWords(c))}`,n>1?esc(names(gr.items)):''];
    case 'restyled':return [`New look: ${cnt}${r}${one}`,'Its '+(c.styleChanges||[]).map(x=>PROPW[x.prop]||x.prop).join(', ')+(n>1?' · '+esc(names(gr.items)):'')];
    case 'shift':return [`Below this point, everything sits ${px(gr.dy)} px ${gr.dy>0?'lower':'higher'}`,'Something above it got '+(gr.dy>0?'taller':'shorter')+'.'];
    // WHY short (2026-11-07 review): the marks already show where; the line only has to say there is more
    default:return [n>1?`Other visual changes in ${n} places`:'Another visual change','']}}
function boxStyle(b,t){return `left:${b.x/t.vw*100}%%;top:${b.y/t.vh*100}%%;width:${b.w/t.vw*100}%%;height:${b.h/t.vh*100}%%`}
// a piece only one side shows (added, removed, scrolled in or out) is marked on that side only
function marks(list,side,t){return list.map((gr,gi)=>gr.items.map(c=>{const only=c.kind==='added'||c.kind==='removed'||c.kind==='scrolled'?c.side:null;
  const b=only?(only===side?c.box:null):side==='before'?(c.beforeBox||c.box):c.box;
  return b?`<span class="hl ${side==='before'?'old':'new'}" data-g="${gi}" style="${boxStyle(b,t)}" aria-hidden="true"></span>`:''}).join('')).join('')}
function cmpPic(g,st,t,side,list){const f=st.n.replace(/\//g,'__').replace(/#/g,'%%23');const has=t[side];
  const lab=side==='before'?esc(CM.release):'Now';
  // WHY a button: clicking a picture shows it at full width and clicking again shows both, as the popup's own
  // picture zooms (this replaced a Side by side / 1.3.3 / Now switch: one control fewer)
  const tag=has?'button':'div',attr=tag==='button'?` data-zoom="${side}" data-tip="${T(DZOOM?'cmp.unzoom':'cmp.zoom')}"`:'';
  // WHY a crop box for a dialog (make_changes.py's view): the window stays one picture, only the part shown
  // narrows, so the marks (percent of the whole window) keep lining up
  const v=t.view,stage=`<div class="cmpstage"${v?` style="width:${t.vw/v.w*100}%%;left:${-v.x/v.w*100}%%;top:${-v.y/v.h*100}%%"`:''}><img src="changes/cmp/${DTH}/${f}.${side}.jpg" alt="${esc(g.t)}, ${lab}">${marks(list,side,t)}</div>`;
  return `<figure class="cmppic"><div class="eyebrow">${lab}</div><${tag} class="cmpwell"${attr}>${has?(v?`<div class="cmpcrop" style="aspect-ratio:${v.w}/${v.h};max-width:calc(max(260px,100vh - 360px) * ${(v.w/v.h).toFixed(3)})">${stage}</div>`:stage):`<p class="t-xs muted">${side==='before'?'This screen did not exist in '+esc(CM.release)+'.':'This screen is gone now.'}</p>`}</${tag}></figure>`}
function cmpHTML(g,st){const ch=st.ch||{};
  // WHY only the themes that changed get a tab: a tab that opens "nothing is different" is a dead end
  const th=CM.themes.filter(x=>ch[x]&&ch[x].status==='changed'),same=CM.themes.filter(x=>ch[x]&&!th.includes(x));
  if(!DTH||!th.includes(DTH))DTH=th.includes(CM.tile)?CM.tile:th[0];
  const t=ch[DTH];const list=withShift(t);
  const tabs=th.length>1?`<div class="cmpbar"><div class="tabs" role="group" aria-label="Theme">${th.map(x=>`<button data-th="${x}" aria-pressed="${x===DTH}" data-tip="${T('cmp.theme')}">${esc(themeName(x))} <span class="count" data-tip="${T('cmp.count')}">${withShift(ch[x]).length}</span></button>`).join('')}</div></div>`:'';
  // WHY only the situations that changed: the same ones are summed up in one line instead
  const chg=g.states.map((s,i)=>[s,i]).filter(([s])=>stSince(s)==='changed');
  const strip=chg.length>1?`<div class="sstrip" role="group" aria-label="Situations that changed">${chg.map(([s,i])=>`<button aria-pressed="${i===DST}" data-st="${i}" data-tip="${T('pop.situation')} (${esc(s.l)})"><span class="si"><img src="${s.img}" alt=""></span><span>${esc(s.l)}</span></button>`).join('')}</div>`:'';
  const sides=DZOOM?[DZOOM]:['before','after'];
  const body=`<div class="cmppics${sides.length===1?' one':''}">${sides.map(sd=>cmpPic(g,st,t,sd,list)).join('')}</div>`;
  const rows=list.map((gr,gi)=>{const [a,b]=rowText(gr);return `<button class="row rowbtn slim cmprow" data-g="${gi}" data-tip="${T('cmp.row')}"><div class="body"><div class="t-xs">${a}</div>${b?`<div class="hint wrap">${b}</div>`:''}</div></button>`}).join('');
  // WHY counted apart (2026-11-07 review): new situations and ones the release has no picture of are not "the same"
  const by=k=>g.states.filter(x=>stSince(x)===k).length,nS=by('same'),nN=by('new'),nB=by('nobefore');
  const sit=(n,w)=>n===1?`1 other situation ${w[0]}`:`${n} other situations ${w[1]}`;
  const also=[th.length===1&&same.length?`Only in ${esc(themeName(DTH))}; ${same.map(x=>esc(themeName(x))).join(', ')} looks the same.`:'',
    nS?sit(nS,['looks the same.','look the same.']):'',nN?(nN===1?'1 situation is new.':nN+' situations are new.'):'',nB?(nB===1?`1 has no ${esc(CM.release)} picture.`:`${nB} have no ${esc(CM.release)} picture.`):''].filter(Boolean).join(' ');
  const note=`Red = ${esc(CM.release)}, green = now. Tap a line to find it.${also?' '+also:''}`;
  const steady=t.unstable?`<p class="t-xs muted">Moving parts (animations, clocks) were left out.</p>`:'';
  const listHTML=`<section class="cmplist"><div class="sechead"><div class="gtext"><h3 class="gh">What changed<span class="cnt" data-tip="${T('cmp.count')}">${list.length}</span></h3><p class="gdesc">${note}</p></div></div>${rows}${steady}</section>`;
  return `<div class="dcmp">${tabs}${strip}${body}${listHTML}</div>`}
function wireCmp(g){$$('#dbody [data-th]').forEach(b=>b.onclick=()=>{DTH=b.dataset.th;drawShot()});
  $$('#dbody [data-st]').forEach(b=>b.onclick=()=>{DST=+b.dataset.st;DZOOM=null;drawShot()});
  $$('#dbody [data-zoom]').forEach(b=>b.onclick=()=>{DZOOM=DZOOM?null:b.dataset.zoom;drawShot()});
  // WHY light up on point and on keyboard focus: the line and its marks are found together
  $$('#dbody .cmprow').forEach(r=>{const on=v=>$$('#dbody .hl[data-g="'+r.dataset.g+'"]').forEach(h=>h.classList.toggle('hot',v));
    r.onmouseenter=()=>on(true);r.onmouseleave=()=>on(false);r.onfocus=()=>on(true);r.onblur=()=>on(false);
    // WHY a tap keeps its marks lit: a phone has no pointing, so the tap is how the line is found there
    r.onclick=()=>{$$('#dbody .hl.hot').forEach(h=>h.classList.remove('hot'));on(true);const h=$('#dbody .hl[data-g="'+r.dataset.g+'"]');if(h)h.scrollIntoView({block:'nearest',behavior:'smooth'})}})}
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
