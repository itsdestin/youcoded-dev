"""Today's "Since the last release" section, drawn from the facts scripts/release-view.mjs works out each time.

WHY its own module (Destin, 2026-11-11: the section was "pointing to 1.3.0, which is janky"): build.py used to carry a
hand-typed list for an old release. Nothing here is typed in; every word comes from the facts, and when they cannot be read the
section says so instead of showing old numbers.
"""
import datetime
import html

NOTHING = 'Nothing visible.'  # release-lines.mjs NOTHING: a change nobody will see

E = html.escape
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
SHOW = 5  # lines listed per group before its own "Show all" button


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
    # WHY say the gap out loud (Destin, 2026-11-14, "option a"): lines for users are written by assistants when work lands,
    # so he needs to see at a glance how many changes still have none. (A per-line "Mark as read" tick was built and
    # removed the same day at his word: editing the changelog draft is the check.)
    if rel.get('missing'):
        m = rel['missing']
        out.append(f'<div class="t-xs muted relgaps" data-tip="{T("rel.gaps")}">{plural(m, "change")} {"has" if m == 1 else "have"} no line written for users yet and {"shows its" if m == 1 else "show their"} working title.</div>')
    # WHY this plain (Destin, 2026-11-14: "too busy and confusing. why so many different types of text? so much duplicative
    # information? why is there a single clickable chip … on only one item? why is there no 'see all' button?"):
    #   - one bullet is one sentence a user would notice, in one text style; a box's number is its bullet count
    #   - the working title is no longer printed under the sentence that already says it; it is the bullet's hover hint
    #   - the "#226" work-item chip is gone: it showed only on changes linked to one item, so it looked like a stray
    #   - changes nobody will see fold into one closing sentence instead of a row of "Nothing visible."
    # WHY one box, groups stacked, one button (Destin, 2026-11-14: "put all of these sections into a single box and let the
    # bulleted items run fully across horizontally with the sections stacked vertically. with a single bottom-right show all
    # button"): three side-by-side boxes made narrow, tall columns and three buttons.
    out.append('<div class="card inset relbox">')
    total = shown = 0
    for g in rel['groups']:
        rows, unseen = [], 0
        for c in g['changes']:
            where = f'From: {c["text"]}' + (f' (pull request #{c["pr"]})' if c.get('pr') else '')
            notice = c.get('notice') or []
            if notice == [NOTHING]:
                unseen += 1
            else:
                rows += [(n, where) for n in (notice or [c['text']])]
        if unseen:
            rows.append((f'{plural(unseen, "other change")} with nothing to see: tests and routine part updates.', 'Changes recorded as "Nothing visible" when they landed.'))
        n = len(rows)
        total += n
        shown += min(n, SHOW)
        lis = ''.join(f'<li{" class=\"relextra\" hidden" if i >= SHOW else ""} data-tip="{E(tip)}">{E(text)}</li>' for i, (text, tip) in enumerate(rows))
        out.append(f'<div class="eyebrow relhead"><span data-tip="{E(g["hint"])}">{E(g["title"])}</span> <span class="cnt" data-tip="{T("rel.groupcount")}">{n}</span></div><ul class="t-xs">{lis}</ul>')
    if total > shown:
        out.append(f'<div class="acts right"><button class="btn sm relall" data-n="{total}" aria-expanded="false" data-tip="{T("today.allchanges")}">Show all {total}</button></div>')
    out.append('</div>')
    if rel.get('draft'):
        # WHY a draft he can copy (Destin, 2026-11-14: "a changelog draft would be cool, with the expectation of significant
        # refinement/simplification for the actual published changelog"): the heading says draft so it is never mistaken for the real one.
        out.append(f'<details class="fold reldraftfold"><summary class="foldrow" data-tip="{T("rel.draft")}"><span class="t-xs">Changelog draft, to edit down before publishing</span><span class="chev" aria-hidden="true">›</span></summary>'
                   f'<div class="foldbody"><pre class="reldraft t-xs" id="reldraft">{E(rel["draft"])}</pre>'
                   f'<div class="acts right"><button class="btn sm" id="relcopy" data-tip="{T("rel.copy")}">Copy draft</button></div></div></details>')
    return ''.join(out)


CSS = '''
.relfresh{margin:0 0 8px}
.relwritten{margin-bottom:8px}
.relbox li[hidden]{display:none}
.relbox li{overflow-wrap:anywhere;margin-bottom:4px}
.relbox ul{margin:6px 0 0;padding-left:16px} .relbox .relhead:not(:first-child){margin-top:16px} .relbox .acts{margin-top:8px}
.relgaps{margin:0 0 8px}
.reldraftfold{margin-top:12px}
.reldraft{margin:0 0 8px;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;background:var(--well);border:1px solid var(--edge-card);border-radius:var(--radius-md);color:var(--fg-2);user-select:text;max-height:320px;overflow:auto}
'''

JS = r'''
// WHY one button for the whole list (Destin, 2026-11-14: "a single bottom-right show all button")
document.addEventListener('click',e=>{const b=e.target.closest('.relall');if(!b)return;
  const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',open);
  b.closest('.relbox').querySelectorAll('.relextra').forEach(li=>li.hidden=!open);
  b.textContent=open?'Show fewer':'Show all '+b.dataset.n;fades()});
(function(){const b=document.getElementById('relcopy');if(!b)return;
b.onclick=async()=>{const pre=document.getElementById('reldraft');
  // WHY the fallback: a page inside YouCoded may not be allowed to write to the clipboard; selecting the text lets Ctrl+C do it
  try{await navigator.clipboard.writeText(pre.textContent);b.textContent='Copied'}catch{const s=getSelection(),g=document.createRange();g.selectNodeContents(pre);s.removeAllRanges();s.addRange(g);b.textContent='Selected: press Ctrl+C'}
  setTimeout(()=>b.textContent='Copy draft',2500)};})();
'''
