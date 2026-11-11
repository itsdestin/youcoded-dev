"""Today's "Since the last release" section, drawn from the facts scripts/release-view.mjs works out each time.

WHY its own module (Destin, 2026-11-11: the section was "pointing to 1.3.0, which is janky"): build.py used to carry a
hand-typed list for an old release. Nothing here is typed in; every word comes from the facts, and when they cannot be read the
section says so instead of showing old numbers.
"""
import datetime
import html

E = html.escape
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
SHOW = 4  # changes shown per group before "Show all"


def nice_day(iso):
    try:
        d = datetime.date.fromisoformat(iso)
        return f'{MONTHS[d.month - 1]} {d.day}'
    except ValueError:
        return iso


def nice_when(iso):
    """'Nov 11, 3:42 pm' in this computer's own time."""
    try:
        t = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone()
        return f'{MONTHS[t.month - 1]} {t.day}, {t.strftime("%-I:%M %p").lower()}'
    except ValueError:
        return iso


def plural(n, word):
    return f'{n} {word}{"" if n == 1 else "s"}'


def hint(rel):
    """The one line under the section's heading."""
    if not rel or not rel.get('ok'):
        return 'Could not be worked out right now.'
    v, n = rel['version'], rel['count']
    if n == 0:
        return f'{v} is the latest release ({nice_day(rel["date"])}). Nothing has landed since.'
    return f'{v} is the latest release ({nice_day(rel["date"])}). {plural(n, "change")} would go out in a release today.'


def count(rel):
    return rel['count'] if rel and rel.get('ok') else None


def body(rel, T):
    if not rel or not rel.get('ok'):
        # WHY plain words and no old numbers: an old list would pass for the truth
        why = (rel or {}).get('reason') or 'The release facts were not available.'
        return f'<div class="lerr">{E(why)} Nothing is shown rather than guessing.</div>'
    out = []
    if rel['fresh']:
        fresh = f'Checked with GitHub when this page was drawn ({E(nice_when(rel["asOf"]))}).'
    else:
        when = f' on {E(nice_when(rel["asOf"]))}' if rel.get('asOf') else ''
        fresh = f'GitHub could not be reached, so this uses the last copy this computer saved{when}. Changes merged since then are missing.'
    out.append(f'<div class="t-xs muted relfresh" data-tip="{T("rel.fresh")}">{fresh}</div>')
    if rel.get('written'):
        out.append(f'<div class="card inset relwritten"><div class="eyebrow"><span data-tip="{T("rel.written")}">Written up in the changelog</span></div><ul class="t-xs">'
                   + ''.join(f'<li>{E(w)}</li>' for w in rel['written']) + '</ul></div>')
    if not rel['groups']:
        out.append(f'<p class="t-xs muted">Nothing has landed since {E(rel["version"])}, so a release today would change nothing.</p>')
        return ''.join(out)
    hidden = 0
    out.append('<div class="relgrid">')
    for g in rel['groups']:
        lis = []
        for i, c in enumerate(g['changes']):
            chips = ''.join(f'<button class="relchip" data-card-open="{it["id"]}" data-tip="{E("Opens work item #%d: %s" % (it["id"], it["title"]))}">#{it["id"]}</button>' for it in c['items'][:3])
            more = len(c['items']) - 3
            if more > 0:
                chips += f'<span class="t-2xs muted relmore1" data-tip="{T("rel.more")}">+{more} more</span>'
            det = f'<div class="t-2xs muted reldetail">{E(c["detail"])}</div>' if c.get('detail') else ''
            extra = i >= SHOW
            hidden += extra
            lis.append(f'<li{" class=\"relextra\" hidden" if extra else ""}><span class="reltext">{E(c["text"])}</span>{chips}{det}</li>')
        out.append(f'<div class="card inset"><div class="eyebrow"><span data-tip="{E(g["hint"])}">{E(g["title"])}</span> <span class="cnt" data-tip="{T("rel.groupcount")}">{len(g["changes"])}</span></div><ul class="t-xs">{"".join(lis)}</ul></div>')
    out.append('</div>')
    if hidden:
        out.append(f'<div class="acts right"><button class="btn sm" id="relall" data-n="{rel["count"]}" aria-expanded="false" data-tip="{T("today.allchanges")}">Show all {rel["count"]} changes</button></div>')
    return ''.join(out)


CSS = '''
.relfresh{margin:0 0 8px}
.relwritten{margin-bottom:8px}
.relgrid li[hidden]{display:none}
.relgrid li{overflow-wrap:anywhere}
.relchip,.relmore1{margin:2px 4px 0 0;vertical-align:baseline}
.reldetail{margin-top:2px}
.relchip{font:inherit;font-size:11px;line-height:14px;font-weight:500;padding:1px 8px;border-radius:var(--radius-lg);border:1px solid var(--edge-strong);background:transparent;color:var(--fg-2);cursor:pointer;transition:background-color 120ms steps(4)}
@media (hover:hover){.relchip:hover{background:var(--panel);color:var(--fg)}} .relchip:active{background:var(--edge)} .relchip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
'''

JS = r'''
// WHY (Destin, 2026-11-11: "See all N changes" did nothing): it now opens the rest of every group's list in place
(function(){const b=document.getElementById('relall');if(!b)return;
b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',open);
  document.querySelectorAll('.relextra').forEach(li=>li.hidden=!open);
  b.textContent=open?'Show fewer':'Show all '+b.dataset.n;fades()};})();
'''
