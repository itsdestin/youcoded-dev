"""Big picture, round 3: Journeys, Foundations and How it works as sub-views of the main page's Big
picture tab, next to the existing Areas view.

WHY (Destin, 2026-10-14, after round 2): "this is getting worse again… things just need to be more
nested/collapsible, labels/headers need to be clearer with better hierarchy, styling/statuses should
match the latest ui design principles in the ui consistency branch… also unclear how this ties in
with the existing screenshot views". Round 2 built each view as its own page with its own look
(hatching, dashed boxes, lines across the page, coloured words). Here every view is made only of the
pieces mockup.html already uses (cc.css / page.css, ported from the app's components): one Large
heading per view, small labels for groups, folded rows closed by default (FoldRow), status as a
tinted pill (Pill), and a click on any item opens the SAME side panel as Areas, which already shows
the screens it appears on and the work in progress on those screens. That panel is the tie to the
Today and Screens tabs. Data: vision-options/facts.json only (built by vision-options/facts.py).
"""
import json, os, html, functools

E = html.escape
HERE = os.path.dirname(os.path.abspath(__file__))
F = json.load(open(os.path.join(HERE, 'vision-options', 'facts.json')))
N = F['nodes']
SYS = {s['id']: s['title'] for s in F['systems']}

# WHY these words and tones: the same four status words as the Areas view (vision_tab.STATUS_WORD,
# shortened "only an idea"), each a tinted pill per the guide's "Status and notices": the colour is
# only in the tint, the word stays the normal text colour.
WORD = {'done': 'exists', 'building': 'being built', 'planned': 'planned', 'vision': 'only an idea', 'unchecked': 'not checked yet'}
TONE = {'done': 'ok', 'building': 'info', 'planned': '', 'vision': '', 'unchecked': 'warn'}
PART_STATUS = {'exists': 'done', 'building': 'building', 'planned': 'planned', 'idea': 'vision'}
CHEV = '<span class="chev" aria-hidden="true">›</span>'


def pill(status, tips, word=None, tone=None):
    return (f'<span class="spill {tone if tone is not None else TONE[status]}" data-tip="{E(tips["status." + status] if status in WORD else status)}">'
            f'{E(word or WORD[status])}</span>')


def title(k):
    return N[k].get('label') or N[k]['title']


def where(k):
    return SYS.get(N[k]['pillar'], '')


def item_row(k, hint, tips, extra=''):
    """One item as a boxed row that opens the side panel (data-focus is handled by vision_tab's JS)."""
    n = N[k]
    return (f'<button class="row rowbtn" data-focus="{E(k)}" data-tip="Opens its details: what it needs, what needs it, and the screens it shows up on.">'
            f'<span class="body"><span class="t-xs rt">{E(title(k))}</span><span class="hint wrap">{E(hint)}</span></span>'
            f'{extra}{pill(n["status"], tips)}</button>')


def fold(summary_title, hint, right, body, tip, open_=False, cls=''):
    hint_html = f'<span class="t-2xs muted fh">{hint}</span>' if hint else ''
    return (f'<details class="fold bpf {cls}"{" open" if open_ else ""}><summary class="foldrow" data-tip="{E(tip)}">'
            f'<span class="fbody"><span class="t-sm fw">{summary_title}</span>{hint_html}</span>'
            f'{right}{CHEV}</summary><div class="foldbody">{body}</div></details>')


def head(name, count, desc, tip):
    cnt = f'<span class="cnt" data-tip="{E(tip)}">{count}</span>' if count is not None else ''
    return f'<div class="sechead bph"><div class="gtext"><h2 class="gh">{E(name)}{cnt}</h2><p class="gdesc">{E(desc)}</p></div></div>'


def label(text, tip):
    return f'<div class="eyebrow bpl" data-tip="{E(tip)}">{E(text)}</div>'


def plural(n, one, many=None):
    return f'{n} {one if n == 1 else (many or one + "s")}'


# ----------------------------------------------------------------------------- Journeys
def journeys(tips):
    out = [head('Journeys', len(F['journeys']), 'Things real people would do with the app, step by step: how far each gets today, and where it stops.',
                'How many journeys are written down.')]
    tally = {}
    rows = []
    for i, j in enumerate(F['journeys'], 1):
        st = j['steps']
        stop = next((s for s, k in enumerate(st) if N[k]['status'] != 'done'), None)
        for k in st:
            if N[k]['status'] != 'done': tally.setdefault(k, set()).add(i)
        if stop is None:
            right, hint = pill('done', tips, f'all {len(st)} steps work', 'ok'), 'Works from start to finish today.'
        elif stop == 0:
            right, hint = pill('', tips, 'can’t start yet', ''), f'Step 1 does not exist yet: {E(title(st[0]))}'
        else:
            right, hint = pill('', tips, f'{stop} of {len(st)} steps work', ''), f'Stops at step {stop + 1}: {E(title(st[stop]))}'
        right = right.replace('data-tip=""', 'data-tip="How many steps in a row work today, from the first."')
        steps = []
        for s, k in enumerate(st):
            n = N[k]
            # WHY the evidence sentence (facts.py marks 'catch' True only): the hint says what the catch IS
            h = n['why'] if n.get('catch') and n.get('why') else where(k)
            mark = '<span class="spill warn" data-tip="The first step that does not exist yet. The journey cannot go past it today.">stops here</span>' if s == stop else ''
            if n.get('catch'): mark = '<span class="spill" data-tip="It exists, but not fully: the line under its name says what is missing.">with a catch</span>'
            steps.append(f'<div class="stepline"><span class="stepn t-2xs muted" aria-hidden="true">{s + 1}</span>{item_row(k, h, tips, mark)}</div>')
        quote = f'<div class="quote t-xs">“{E(j["quote"])}”</div>' if j.get('quote') else ''
        rows.append(fold(E(j['title']), hint, right, quote + ''.join(steps),
                         'Opens this journey, one row per step. Click a step for its details.'))
    out.append(label('Each journey', 'Folded to one line each. Open one to see every step and where it stops.'))
    out.append('<div class="bpstack">' + ''.join(rows) + '</div>')
    worst = sorted(((len(v), k) for k, v in tally.items() if len(v) > 1), key=lambda t: (-t[0], t[1]))
    if worst:
        out.append(label('What stops them', 'Single unbuilt things that more than one journey needs. Building one helps every journey listed.'))
        out.append('<div class="card bpcard">' + ''.join(
            item_row(k, f'{where(k)} · missing from {plural(c, "journey")}', tips) for c, k in worst) + '</div>')
    return ''.join(out)


# ----------------------------------------------------------------------------- Foundations
def foundations(tips):
    conn = [k for k, n in N.items() if n['needs'] or n['needed_by']]

    def trans(k, seen=None):
        seen = set() if seen is None else seen
        for x in N[k]['needed_by']:
            if x['id'] not in seen:
                seen.add(x['id']); trans(x['id'], seen)
        return seen

    missing = lambda k: [x['id'] for x in N[k]['needs'] if N[x['id']]['status'] != 'done']
    held = {k: len([h for h in trans(k) if N[h]['status'] != 'done']) for k in conn}
    names = lambda ks: '; '.join(title(x) for x in ks)  # WHY ';': the names themselves contain commas
    ready = sorted([k for k in conn if N[k]['status'] != 'done' and not missing(k)], key=lambda k: (-held[k], k))
    waiting = sorted([k for k in conn if N[k]['status'] != 'done' and missing(k)], key=lambda k: (-held[k], k))
    done = sorted([k for k in conn if N[k]['status'] == 'done'], key=lambda k: (-held[k], k))
    nxt = [k for k in ready if held[k]][:5]

    out = [head('Foundations', None, 'What the unbuilt ideas rest on, and what to build first to unblock the most.', '')]
    # WHY "Build next" open and everything else folded (Destin: "more nested/collapsible"): the one
    # question this view answers is on screen first; the full lists are one click away.
    out.append(label('Build next', 'Unbuilt things with nothing missing underneath them, ranked by how many other unbuilt things wait on them.'))
    out.append('<div class="card bpcard">' + ''.join(
        item_row(k, f'{where(k)} · unblocks {plural(held[k], "other thing")}', tips) for k in nxt) + '</div>')
    out.append(label('Everything that needs or holds up something', 'Every item linked to another by “needs”. Folded into three lists.'))

    def lst(ks, hint):
        return ''.join(item_row(k, hint(k), tips) for k in ks) or '<div class="empty">Nothing here.</div>'
    out.append('<div class="bpstack">' +
               fold('Ready to start', 'Not built yet, but nothing they need is missing.', f'<span class="cnt" data-tip="How many items.">{len(ready)}</span>',
                    lst(ready, lambda k: where(k) + (f' · unblocks {plural(held[k], "other thing")}' if held[k] else '')), 'Opens the list.') +
               fold('Waiting on something', 'Each needs something that does not exist yet.', f'<span class="cnt" data-tip="How many items.">{len(waiting)}</span>',
                    lst(waiting, lambda k: f'Waits on: {names(missing(k))}'), 'Opens the list.') +
               fold('Already exist', 'Built, and other things rest on them.', f'<span class="cnt" data-tip="How many items.">{len(done)}</span>',
                    lst(done, lambda k: where(k) + (f' · holds up {plural(len(N[k]["needed_by"]), "thing")}' if N[k]['needed_by'] else '')), 'Opens the list.') +
               '</div>')
    loose = {}
    for k, n in N.items():
        if k not in conn and n['kind'] == 'feature': loose.setdefault(n['pillar'], []).append(k)
    inner = ''.join(fold(E(SYS[p]), None, f'<span class="cnt" data-tip="How many items.">{len(ks)}</span>',
                         ''.join(item_row(k, '', tips) for k in ks), 'Opens the list.')
                    for p, ks in loose.items())
    tot = sum(len(v) for v in loose.values())
    out.append(label('Everything else', 'Items with no “needs” link either way, so they sit outside the building.'))
    out.append(fold('Stand-alone items', 'Nothing needs them and they need nothing, as far as the evidence says. By area.',
                    f'<span class="cnt" data-tip="How many items.">{tot}</span>', f'<div class="bpstack">{inner}</div>', 'Opens the list, by area.'))
    return ''.join(out)


# ----------------------------------------------------------------------------- How it works
def workings(tips):
    P = {p['id']: p for p in F['parts']}
    out = [head('How it works', len(P), "The app's real parts and how they connect.", 'How many parts.')]

    def part_status(p):
        return PART_STATUS.get(p['cls'], 'planned')

    # paths first: following one is the easiest way in (round-2 tester: "easy to follow once I clicked Next")
    out.append(label('Follow a path', 'Step by step: where a message, an install or a sync goes, and which part does what.'))
    traces = []
    for t in F['traces']:
        vs = t['variants']
        def steps(v):
            r = []
            for i, s in enumerate(v['steps'], 1):
                # a step is a hop along a connection ('e', with direction 'd') or work inside one part ('n')
                if 'e' in s:
                    e = next(x for x in F['edges'] if x['id'] == s['e'])
                    a, b = (e['a'], e['b']) if s.get('d', 1) == 1 else (e['b'], e['a'])
                    w = f'{P[a]["t"]} → {P[b]["t"]}'
                else:
                    w = P[s['n']]['t'] if s.get('n') in P else ''
                r.append(f'<div class="stepline"><span class="stepn t-2xs muted" aria-hidden="true">{i}</span><div class="row"><span class="body">'
                         f'<span class="t-xs rt">{E(s["s"])}</span><span class="hint">{E(w)}</span></span></div></div>')
            return ''.join(r)
        if len(vs) == 1:
            body = steps(vs[0])
        else:
            # WHY nested folds, not a switch: each way is its own list, closed until wanted (round-2 U14: the unexplained toggle)
            body = '<div class="bpstack">' + ''.join(
                fold(E(('With ' if t['id'] == 'message' else 'For ') + v['t'].replace('A ', 'a ', 1)), None,
                     f'<span class="cnt" data-tip="How many steps.">{len(v["steps"])}</span>', steps(v), 'Opens these steps.', open_=(i == 0))
                for i, v in enumerate(vs)) + '</div>'
        n = max(len(v['steps']) for v in vs)
        traces.append(fold(E(t['t']), E(t['hint']), f'<span class="cnt" data-tip="How many steps.">{n}</span>', body, 'Opens the path, one row per step.'))
    out.append('<div class="bpstack">' + ''.join(traces) + '</div>')

    groups = [('inside', 'Parts of the app', 'The pieces inside YouCoded that exist today.'),
              ('outside', 'Outside services', 'Companies and services the app talks to.'),
              ('ahead', 'Parts not built yet', 'Pieces your plans need that do not exist yet.')]
    for kind, name, tip in groups:
        ps = [p for p in F['parts'] if p['kind'] == kind]
        out.append(label(name, tip))
        rows = []
        for p in ps:
            links = []
            for e in F['edges']:
                if p['id'] in (e['a'], e['b']):
                    o = P[e['b'] if e['a'] == p['id'] else e['a']]
                    links.append(f'<div class="row slim"><span class="body"><span class="t-xs rt">{E(o["t"])}</span><span class="hint wrap">{E(e["s"])}</span></span></div>')
            ideas = ''.join(item_row(v['id'], where(v['id']), tips) for v in p.get('visionItems', []) if v['id'] in N)
            # WHY the rest only: the folded row already shows the first sentence; repeating it read as a stutter
            first = p['what'].split('. ')[0].rstrip('.') + '.'
            rest = p['what'][len(first):].strip()
            body = f'<p class="t-xs dim bpp">{E(rest)}</p>' if rest else ''
            if p.get('inside'): body += f'<p class="t-2xs muted bpp">Made of: {E(", ".join(p["inside"]))}</p>'
            if links: body += label('Talks to', 'The other parts this one passes things to or gets things from.') + ''.join(links)
            if ideas: body += label('Ideas that rest on this', 'Items from your plans that need this part. Click one for its details.') + ideas
            if p.get('code'):
                body += fold('Where the code lives', None, '', '<ul class="t-2xs muted bpcode">' + ''.join(f'<li>{E(c)}</li>' for c in p['code']) + '</ul>', 'Opens the list of files.')
            st = part_status(p)
            rows.append(fold(E(p['t']), E(first), pill(st, tips), body, 'Opens this part: what it is, what it talks to, and the ideas that rest on it.'))
        out.append('<div class="bpstack">' + ''.join(rows) + '</div>')
    return ''.join(out)


SUBVIEWS = [
    ('areas', 'Areas', 'Everything you have said the app should do, in ten areas, and how much of each exists.'),
    ('journeys', 'Journeys', 'Things real people would do with the app, step by step, and where each one stops today.'),
    ('foundations', 'Foundations', 'What the unbuilt ideas rest on, and what to build first to unblock the most.'),
    ('workings', 'How it works', "The app's real parts and how they connect. Follow a message, an install or a sync."),
]


def render(areas_html, tips):
    """Wraps the existing Areas view and adds the three others, with a tab strip that goes in the page's fixed head."""
    bar = ('<div class="lensbar"><div class="tabs bptabs" role="tablist" aria-label="Ways to look at the big picture">' +
           ''.join(f'<button role="tab" aria-selected="{"true" if i == 0 else "false"}" data-bp="{k}" data-tip="{E(t)}">{E(w)}</button>'
                   for i, (k, w, t) in enumerate(SUBVIEWS)) + '</div></div>')
    return (bar + f'<div class="bpv" id="bp-areas">{areas_html}</div>'
            f'<div class="bpv" id="bp-journeys" hidden>{journeys(tips)}</div>'
            f'<div class="bpv" id="bp-foundations" hidden>{foundations(tips)}</div>'
            f'<div class="bpv" id="bp-workings" hidden>{workings(tips)}</div>')


CSS = '''
/* Big picture sub-views (bigpicture_tab.py). Only arranges cc.css / page.css pieces. */
.bptabs button{font-size:12px;line-height:16px;padding:4px 12px}
.bph{margin-bottom:16px}
.bpl{margin:24px 4px 8px} .bph + .bpl{margin-top:0}
.bpstack{display:flex;flex-direction:column;gap:8px}
.bpf .fbody{display:flex;flex-direction:column;min-width:0}
.bpf .fh{margin-top:2px}
.bpf > .foldbody{display:flex;flex-direction:column;gap:8px;margin:4px 12px 12px}
.bpf .bpl{margin:8px 0 0}
.bpcard{display:flex;flex-direction:column;gap:8px;padding:12px}
/* a row that opens the side panel: the boxed SettingRow look, as a button */
.rowbtn{width:100%;margin:0;text-align:left;font:inherit;color:var(--fg);cursor:pointer;transition:background-color 120ms steps(4)}
@media (hover:hover){.rowbtn:hover{background:var(--inset)} .card .rowbtn:hover,.fold .rowbtn:hover{background:color-mix(in srgb,var(--inset) 92%,var(--fg))}}
.rowbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.row .body{display:flex;flex-direction:column}
.row .rt{font-weight:500}
.row .spill{flex:none}
.fold .row,.fold .fold{background:var(--inset)}
.stepline{display:flex;align-items:center;gap:8px} .stepline > .row{flex:1;min-width:0;margin:0}
.stepn{width:16px;text-align:right;flex:none}
.bpp{margin:0}
.bpcode{margin:0;padding-left:16px} .bpcode li{margin:2px 0;overflow-wrap:anywhere}
.spill.ok{background:color-mix(in srgb,var(--status-ok) 15%,transparent);border-color:color-mix(in srgb,var(--status-ok) 30%,transparent)}
.spill.info{background:color-mix(in srgb,var(--accent) 15%,transparent);border-color:color-mix(in srgb,var(--accent) 30%,transparent)}
.foldrow .cnt{font-size:12px}
'''

JS = r'''
// WHY window.BPV: vision_tab's focus() reads it, so a click in Journeys / Foundations / How it works
// opens the side panel without also switching the hidden Areas view into one area.
window.BPV='areas';
function bpShow(k){window.BPV=k;$$('.bptabs [data-bp]').forEach(b=>b.setAttribute('aria-selected',b.dataset.bp===k));
  $$('.bpv').forEach(v=>v.hidden=v.id!=='bp-'+k);closePanel();$('#scroller').scrollTop=0;fades()}
$$('.bptabs [data-bp]').forEach(b=>b.onclick=()=>bpShow(b.dataset.bp));
document.addEventListener('toggle',()=>fades(),true);
'''
