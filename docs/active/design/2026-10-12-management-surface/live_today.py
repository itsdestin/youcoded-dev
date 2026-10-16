"""The Today tab drawn from the real work cards (cards/*.md), for the live page `node scripts/manage.mjs`.

WHY (Destin, 2026-10-16: "what happened to the real full page with all of our earlier design work? … the other
tabs?"): the live page is the approved mockup — Today, Screens, Big picture — not a separate list. This module
replaces today_tab.py's hand-written Oct 12 list with the cards, keeping the approved anatomy (today_tab.py,
round 3): stage sections, one row look, the ⋯ menu and View chats, the centred detail popup. Added on top,
because Destin asked for it in v1: a tick box on every row and a bar to Combine / Move to stage / Delete,
saved through the server (scripts/manage.mjs → cards.mjs, all-or-nothing).

What the cards cannot say yet is left out rather than guessed: which chats worked on an item (View chats
says none are recorded), whether checks fail, whether a copy is not backed up, whether a chat is working now.
"""
import html, json

import today_tab as tt   # menu() and the stage words / hints, shared with the approved mockup

E = html.escape
ORDER = ['polish', 'build', 'planning', 'explore', 'merged']
OPEN = {'polish', 'build'}   # WHY: the approved Today opens your stage and the chats'; planning and the rest fold
WORD = {'explore': 'Preliminary exploration', 'planning': 'Planning', 'build': 'Agentic buildout', 'polish': 'Human polish & review', 'merged': 'Merged'}
HINT = {'polish': 'Built, and waiting on you: review it, ask for polish, or merge it.',
        'build': 'Chats are building these.',
        'planning': 'Agreed, ready to plan the build. Planning items never overlap.',
        'explore': 'Not settled yet. These may overlap or contradict each other; combine them when one is ready to plan.',
        'merged': 'In master; ships with the next release.'}
PRI_TIP = {'P1': 'P1: urgent — a release blocker or a top-priority feature.', 'P2': 'P2: major, but not the next thing.', 'P3': 'P3: at leisure.'}


def next_line(c):
    """The row's one line: the card's own "Next:" when it says something, else the start of its text."""
    for line in c['body'].splitlines():
        if line.startswith('Next:') and 'not decided' not in line and 'plan it' not in line:
            return line
    text = c['body'].split('From the old roadmap', 1)[-1].split('\n', 1)[-1] if 'From the old roadmap' in c['body'] else c['body']
    text = ' '.join(text.replace('**', '').split())
    # WHY strip the lead-in and the title: the old roadmap text opens with "v1.3.1 release blocker." and then the
    # item's own name, so the row's second line repeated its first (seen 2026-10-16)
    import re
    text = re.sub(r'^v\d+(\.\d+)+ (release )?blocker[.,:]?\s*', '', text, flags=re.I)
    core = c['title'].rstrip('…').strip()
    if core and text.lower().startswith(core.lower()):
        text = text[len(core):].lstrip(' .:—–-')
    return (text[:180].rsplit(' ', 1)[0] + '…') if len(text) > 180 else text


def pri(c):
    p = c.get('priority')
    return f'<span class="spill {"danger" if p == "P1" else ""}" data-tip="{E(PRI_TIP.get(p, p))}">{E(p)}</span>' if p else ''


def chips(c, suggested=False):
    out = ['<span class="badge" data-tip="This is the suggested next step at the top of the page.">Suggested above</span>'] if suggested else []
    out += [f'<span class="badge" data-tip="A tag. Search for it to see only these.">{E(t)}</span>' for t in c['tags'][:4]]
    if c.get('release'): out.append(f'<span class="badge" data-tip="The release this is aimed at.">{E(c["release"])}</span>')
    if c['needs']: out.append(f'<span class="badge" data-tip="Must exist before this one can be built.">needs {", ".join("#" + str(n) for n in c["needs"])}</span>')
    if c['related']: out.append(f'<span class="badge" data-tip="Overlaps these exploration items.">overlaps {", ".join("#" + str(n) for n in c["related"])}</span>')
    return ''.join(out)


MAIN = ('Start a chat on this', 'Starts a chat that already knows this item: its text, what it needs and what needs it. (No chats are recorded on items yet, so this is always the next step for now.)')


def row(c, show_stage=False, suggested=False):
    stage = f'<span class="spill stage" data-tip="{E(WORD[c["stage"]] + ": " + HINT[c["stage"]])}">{E(WORD[c["stage"]])}</span>' if show_stage else ''
    search = ' '.join([str(c['id']), c['title'], ' '.join(c['tags']), c['body']]).lower()
    return (f'<div class="row crow lrow" data-cid="{c["id"]}" data-stage="{c["stage"]}" data-tags="{E(" ".join(c["tags"]))}" data-search="{E(search)}">'
            f'<div class="ctop"><input type="checkbox" class="ltick" aria-label="Tick #{c["id"]}" data-tip="Tick to edit several items at once.">'
            f'<div class="cmain"><div class="ctl"><button class="ltitle" data-card-open="{c["id"]}" data-tip="Opens everything on this item."><span class="lid">#{c["id"]}</span> {E(c["title"])}</button>{stage}{pri(c)}</div>'
            f'<div class="t-xs dim cnext">{E(next_line(c))}</div></div>'
            f'<div class="acts">{tt.menu()}<button class="btn sm copen" aria-expanded="false" data-tip="Shows, inside this row, the chats that worked on it.">View chats</button>'
            f'<button class="btn sm primary" data-does data-tip="{E(MAIN[1])}">{E(MAIN[0])}</button></div></div>'
            f'<div class="cmeta"><div class="cchips">{chips(c, suggested)}</div></div>'
            f'<div class="cbody" hidden><div class="eyebrow" data-tip="Every chat that worked on this item.">Chats <span class="cnt" data-tip="How many chats.">0</span></div>'
            f'<p class="t-xs muted" style="margin:0">No chats are recorded on this item yet. From now on, a chat that works on it adds itself here.</p>'
            f'<button class="btn bpfull" data-does data-tip="Starts a new chat that already knows this item, so it continues instead of starting over.">Start another chat on this card</button></div></div>')


def render(cards, leftovers, dev_only, T, sechead, fold):
    out = []
    # ---- the controls in the fixed head: search and tag (143 items need finding)
    tags = sorted({t for c in cards for t in c['tags']})
    out.append('<div class="lensbar ltools"><input class="field lq" id="lq" type="search" placeholder="Search work items" aria-label="Search work items" data-tip="Shows only items whose number, name, tags or text contain these words.">'
               '<select class="field" id="ltag" aria-label="Tag" data-tip="Shows only items with this tag."><option value="">All tags</option>'
               + ''.join(f'<option>{E(t)}</option>' for t in tags) + '</select>'
               '<span class="t-2xs muted" data-tip="Tick items to combine them, move them to a stage, or delete them.">Tick items to edit several at once.</span></div>')
    # ---- Start here: the most urgent item in the latest stage that has one
    rank = lambda c: (-ORDER[::-1].index(c['stage']) if c['stage'] in ORDER[:3] else 9, c.get('priority') or 'P9', c['id'])
    pool = [c for c in cards if c['stage'] in ('polish', 'build', 'planning')]
    hero = min(pool, key=lambda c: (ORDER.index(c['stage']), c.get('priority') or 'P9', c['id'])) if pool else None
    if hero:
        out.append(f'''<section class="card hero"><div class="eyebrow"><span data-tip="{T('today.start')}">Start here · suggested next</span></div>
<div class="ctl"><button class="ltitle t-lg" data-card-open="{hero['id']}" data-tip="Opens everything on this item."><span class="lid">#{hero['id']}</span> {E(hero['title'])}</button><span class="spill stage" data-tip="{E(HINT[hero['stage']])}">{E(WORD[hero['stage']])}</span>{pri(hero)}</div>
<p class="t-sm dim">{E(next_line(hero))}</p><div class="cchips">{chips(hero)}</div>
<p class="t-2xs muted">Picked because it is the most urgent item in the furthest-along stage.</p>
<div class="acts heroacts">{tt.menu()}<button class="btn sm" data-card-open="{hero['id']}" data-tip="Opens everything on this item.">Open item</button><button class="btn sm primary" data-does data-tip="{E(MAIN[1])}">{E(MAIN[0])}</button></div></section>''')
    by = {s: sorted([c for c in cards if c['stage'] == s], key=lambda c: (c.get('priority') or 'P9', c['id'])) for s in ORDER}
    for s in ORDER:
        lst = by[s]
        if not lst and s != 'polish': continue
        tickall = f'<button class="selall" data-tickall="{s}" data-tip="Ticks every item shown in this group.">tick all</button>'
        rows = ''.join(row(c, suggested=hero is not None and c['id'] == hero['id']) for c in lst) or f'<p class="t-xs muted">Nothing is in this stage yet.</p>'
        if s in OPEN:
            out.append(f'<section class="sec lsec" data-stage="{s}"><div class="sechead"><div class="gtext"><h2 class="gh"><span data-tip="{E(HINT[s])}">{E(WORD[s])}</span>'
                       f'<span class="cnt" data-tip="How many items.">{len(lst)}</span>{tickall if lst else ""}</h2><p class="gdesc">{E(HINT[s])}</p></div></div>{rows}</section>')
        else:
            out.append(f'<details class="fold sec lsec" data-stage="{s}"><summary class="foldrow big" data-tip="Shows or hides this group."><span class="fbody"><span class="gh">{E(WORD[s])} '
                       f'<span class="cnt" data-tip="How many items.">{len(lst)}</span></span><span class="t-xs muted">{E(HINT[s])}</span></span><span class="chev" aria-hidden="true">›</span></summary>'
                       f'<div class="foldbody">{tickall}<div class="cstack">{rows}</div></div></details>')
    out.append('<p class="t-xs muted lnone" id="lnone" hidden>Nothing matches.</p>')
    # ---- the bulk bar and its two popups' data
    out.append('''<div class="lbulk layer" id="lbulk" hidden role="toolbar" aria-label="Edit ticked items"><span class="n" id="lbn"></span>
<span class="mwrap"><button class="btn sm" id="lbstage" aria-haspopup="menu" data-tip="Moves every ticked item to one stage.">Move to stage…</button><span class="menu layer lup" id="lstagemenu" role="menu" hidden>'''
               + ''.join(f'<button class="mitem" role="menuitem" data-lstage="{s}" data-tip="{E(HINT[s])}"><span>{E(WORD[s])}</span><span class="mhint">{E(HINT[s])}</span></button>' for s in ORDER if s != 'merged')
               + '''<span class="mitem" style="cursor:default"><span class="mhint">Merged is set when its branch merges, not here.</span></span></span></span>
<button class="btn sm" id="lbcombine" data-tip="Pulls the ticked items into one, so one branch and one chat can do them all. Nothing is lost: their text, links and tags are kept.">Combine into one…</button>
<button class="btn sm" id="lbdelete" data-tip="Removes the ticked items. Asks first.">Delete…</button>
<button class="closebtn" id="lbclear" aria-label="Clear the ticks" data-tip="Clears the ticks."><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div>''')
    out.append('<script>window.LCARDS=' + json.dumps({str(c['id']): {k: c[k] for k in ('id', 'title', 'stage', 'priority', 'tags', 'needs', 'related', 'neededBy', 'release', 'branch', 'finish', 'body', 'file')} for c in cards}).replace('</', '<\\/') + ';</script>')
    # ---- the snapshot sections the cards do not cover yet stay as they were, labelled
    nocard = [w for w in leftovers['worktrees']]
    out.append(fold('Tidy up', 2, 'Housekeeping from the Oct 12 snapshot: nothing here changes the app.',
                    f'<div class="cstack"><div class="row crow"><div class="ctop"><div class="cmain"><span class="t-sm fw">7 automatic dependency updates fail their checks</span>'
                    f'<div class="t-xs dim cnext">Five for Android from Sept 3, two for desktop from Oct 5 and 8.</div></div></div></div>'
                    f'<div class="row crow"><div class="ctop"><div class="cmain"><span class="t-sm fw">{len(nocard)} leftover copies with unsaved changes</span>'
                    f'<div class="t-xs dim cnext">{E(", ".join(nocard))}.</div></div></div></div></div>', 'today.tidy', 'today.tidy.count'))
    return out


CSS = '''
/* live Today (live_today.py): the approved rows plus a tick box, and the bulk bar */
.ltools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.field{font:inherit;font-size:12px;line-height:16px;padding:6px 12px;border-radius:var(--radius-lg);border:1px solid var(--edge-card);background:var(--inset);color:var(--fg);width:240px}
select.field{width:auto;cursor:pointer} .field:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ltick{margin:3px 4px 0 0;width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex:none}
.lrow.sel{border-color:var(--fg)}
.ltitle{font:inherit;font-size:14px;font-weight:500;color:var(--fg);background:none;border:0;padding:0;text-align:left;cursor:pointer}
.ltitle.t-lg{font-size:18px;font-weight:600}
@media (hover:hover){.ltitle:hover{text-decoration:underline;text-underline-offset:3px}}
.lid{color:var(--fg-muted);font-weight:400;font-size:12px}
.spill.stage{background:var(--panel);border-color:var(--edge-strong);color:var(--fg)}
.selall{font-size:11px;font-weight:400;color:var(--fg-muted);background:none;border:0;cursor:pointer;padding:0 6px;text-decoration:underline;text-underline-offset:3px}
.foldbody > .selall{display:inline-block;margin:0 0 8px}
.lbulk{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 8px 8px 16px;z-index:25;border-radius:var(--radius-xl)}
.lbulk[hidden]{display:none} .lbulk .n{font-size:12px;font-weight:500;margin-right:8px;white-space:nowrap}
.menu.lup{top:auto;bottom:calc(100% + 6px);left:0;right:auto;min-width:260px}
.btn.danger{background:var(--status-error);color:#fff;border-color:transparent}
.lerr{border:1px solid color-mix(in srgb,var(--status-error) 30%,transparent);background:color-mix(in srgb,var(--status-error) 10%,transparent);border-radius:var(--radius-lg);padding:10px 12px;font-size:12px;white-space:pre-wrap}
.lerr[hidden]{display:none}
.lpick{display:flex;align-items:flex-start;gap:10px;padding:8px 12px;cursor:pointer;margin:0}
.lpick input{margin-top:3px;accent-color:var(--accent)}
.dtext{white-space:pre-wrap;font-size:12px;line-height:1.5;color:var(--fg-2);margin:0}
.crow[hidden],.lsec[hidden]{display:none!important}
@media (max-width:760px){.lbulk{left:8px;right:8px;transform:none;flex-wrap:wrap}.field{width:100%}}
'''

JS = r'''
// ---- live Today: ticks, the bulk bar, the item popup, and saving through the server (scripts/manage.mjs)
(function(){
if(!window.LCARDS)return;
const C=window.LCARDS, SEL=new Set(), W={explore:'Preliminary exploration',planning:'Planning',build:'Agentic buildout',polish:'Human polish & review',merged:'Merged'};
const e_=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LIVE=location.protocol.startsWith('http');
function bar(){$('#lbulk').hidden=!SEL.size;$('#lbn').textContent=SEL.size+' ticked';$('#lbcombine').disabled=SEL.size<2;
  $$('.lrow').forEach(r=>{const on=SEL.has(+r.dataset.cid);r.classList.toggle('sel',on);r.querySelector('.ltick').checked=on})}
function filter(){const q=$('#lq').value.trim().toLowerCase(),t=$('#ltag').value;let any=0;
  $$('.lrow').forEach(r=>{const ok=(!t||r.dataset.tags.split(' ').includes(t))&&(!q||r.dataset.search.includes(q));r.hidden=!ok;if(ok)any++});
  $$('.lsec').forEach(s=>{const n=s.querySelectorAll('.lrow:not([hidden])').length;if(q||t){s.hidden=!n;if(s.tagName==='DETAILS'&&n)s.open=true}else s.hidden=false});
  $('#lnone').hidden=!!any||!(q||t);fades()}
$('#lq').addEventListener('input',filter);$('#ltag').addEventListener('change',filter);
async function send(url,body){
  if(!LIVE)throw new Error('This copy of the page was opened as a file, so it cannot save. Start it with: node scripts/manage.mjs');
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Something went wrong.');return j}
function done(msg){sessionStorage.setItem('ltoast',msg);location.reload()}
const m0=sessionStorage.getItem('ltoast');if(m0){sessionStorage.removeItem('ltoast');setTimeout(()=>toast(m0),300)}
const link=id=>{const c=C[id];return c?`<button class="row rowbtn" data-card-open="${id}" data-tip="Opens this item."><span class="body"><span class="t-xs rt">#${id} ${e_(c.title)}</span></span><span class="spill stage" data-tip="Its stage.">${e_(W[c.stage])}</span></button>`:''};
let HIST=[],CUR=null;
function openCard(id,back){const c=C[id];if(!c)return;if(!back&&CUR&&CUR!==id&&!$('#iwrap').hidden)HIST.push(CUR);CUR=id;
  const g=(l,tip,ids)=>ids.length?`<section class="dgroup"><div class="eyebrow" data-tip="${tip}">${l}</div><div class="card dcard">${ids.map(link).join('')}</div></section>`:'';
  const right=g('Needs first','Must exist before this one can be built.',c.needs)+g('Needed by','Cannot be built until this one exists.',c.neededBy)+g('Overlaps','Exploration items covering some of the same ground.',c.related);
  openPanel('','Work item #'+c.id,`<div class="card dtop"><div class="dtl"><span class="t-base fw">${e_(c.title)}</span><span class="spill stage" data-tip="Its stage.">${e_(W[c.stage])}</span>${c.priority?`<span class="spill ${c.priority==='P1'?'danger':''}" data-tip="Its priority.">${c.priority}</span>`:''}</div>
    <div class="dchips">${c.tags.map(t=>`<span class="badge" data-tip="A tag.">${e_(t)}</span>`).join('')}${c.release?`<span class="badge" data-tip="The release it is aimed at.">${e_(c.release)}</span>`:''}</div>${c.finish?`<p class="t-xs"><b>Finish line:</b> ${e_(c.finish)}</p>`:''}</div>
    <div class="${right?'dcols':'dcol'}"><div class="dcol"><section class="dgroup"><div class="eyebrow" data-tip="Everything written on this item.">Details</div><div class="card dcard"><p class="dtext">${e_(c.body.replace(/\*\*/g,''))}</p></div></section></div>${right?`<div class="dcol">${right}</div>`:''}</div>
    <p class="t-2xs muted">Branch name when work starts: ${e_(c.branch)} · ${e_(c.file)}</p>`,
    `<button class="btn" data-ltickone="${c.id}" data-tip="Ticks this item, to combine or move it with others.">${SEL.has(c.id)?'Untick':'Tick'} this item</button><button class="btn primary" data-does data-tip="Starts a chat that already knows this item.">Start a chat on this</button>`);
  $('#pback').hidden=!HIST.length}
$('#pback').onclick=()=>{const p=HIST.pop();if(p)openCard(p,true)};
function combineDlg(){const items=[...SEL].map(i=>C[i]);const order=['explore','planning','build','polish','merged'];
  const first=[...items].sort((a,b)=>order.indexOf(b.stage)-order.indexOf(a.stage)||a.id-b.id)[0];
  openPanel('',`Combine ${items.length} items into one`,`<p class="t-xs dim" style="margin:0">One item survives. The others' text, tags and links are folded into it, and they are removed. Anything that pointed at them now points at the one that survives.</p>
    <section class="dgroup"><div class="eyebrow" data-tip="The survivor keeps its number and branch name.">Which one survives</div><div class="card dcard">${items.map(c=>`<label class="row lpick"><input type="radio" name="lkeep" value="${c.id}" ${c.id===first.id?'checked':''} data-tip="Keep this one."><span class="body"><span class="t-xs rt">#${c.id} ${e_(c.title)}</span><span class="hint">${W[c.stage]}${c.priority?' · '+c.priority:''}</span></span></label>`).join('')}</div></section>
    <section class="dgroup"><div class="eyebrow" data-tip="Leave empty to keep the survivor's name.">New name (optional)</div><input class="field" id="lnewtitle" style="width:100%" placeholder="Keep the survivor's name" data-tip="Leave empty to keep the survivor's name."></section><div class="lerr" id="lerr" hidden></div>`,
    `<button class="btn" id="lcancel" data-tip="Closes this without changing anything.">Cancel</button><button class="btn primary" id="lgo" data-tip="Combines them and saves.">Combine ${items.length} items</button>`);
  $('#lcancel').onclick=closePanel;
  $('#lgo').onclick=async()=>{try{const j=await send('/api/combine',{ids:[...SEL],keep:+document.querySelector('input[name=lkeep]:checked').value,title:$('#lnewtitle').value.trim()||undefined});done(`Combined into #${j.result.kept}. ${j.saved}`)}catch(e){$('#lerr').hidden=false;$('#lerr').textContent=e.message}}}
function deleteDlg(){const items=[...SEL].map(i=>C[i]);
  openPanel('',`Delete ${items.length} item${items.length>1?'s':''}?`,`<p class="t-xs dim" style="margin:0">These are removed, and links to them from other items are taken off. The change is committed, so it can be undone from history.</p><div class="card dcard">${items.map(c=>`<div class="row slim"><span class="body"><span class="t-xs rt">#${c.id} ${e_(c.title)}</span></span></div>`).join('')}</div><div class="lerr" id="lerr" hidden></div>`,
    `<button class="btn" id="lcancel" data-tip="Closes this without changing anything.">Cancel</button><button class="btn danger" id="lgo" data-tip="Deletes them and saves.">Delete ${items.length}</button>`);
  $('#lcancel').onclick=closePanel;
  $('#lgo').onclick=async()=>{try{const j=await send('/api/delete',{ids:[...SEL]});done(`Deleted ${j.result.length}. ${j.saved}`)}catch(e){$('#lerr').hidden=false;$('#lerr').textContent=e.message}}}
document.addEventListener('click',async e=>{const t=e.target;
  const tk=t.closest('.ltick');if(tk){const id=+tk.closest('.lrow').dataset.cid;tk.checked?SEL.add(id):SEL.delete(id);bar();return}
  const ta=t.closest('[data-tickall]');if(ta){e.preventDefault();$$(`.lsec[data-stage="${ta.dataset.tickall}"] .lrow:not([hidden])`).forEach(r=>SEL.add(+r.dataset.cid));bar();return}
  const co=t.closest('[data-card-open]');if(co){e.preventDefault();openCard(+co.dataset.cardOpen);return}
  const one=t.closest('[data-ltickone]');if(one){const id=+one.dataset.ltickone;SEL.has(id)?SEL.delete(id):SEL.add(id);bar();openCard(id,true);return}
  if(t.closest('#lbstage')){$('#lstagemenu').hidden=!$('#lstagemenu').hidden;return}
  const st=t.closest('[data-lstage]');if(st){$('#lstagemenu').hidden=true;try{const j=await send('/api/stage',{ids:[...SEL],stage:st.dataset.lstage});done(`Moved ${j.result.length} to ${W[st.dataset.lstage]}. ${j.saved}`)}catch(err){toast(err.message)}return}
  if(!t.closest('#lbulk .mwrap'))$('#lstagemenu').hidden=true;
  if(t.closest('#lbcombine')&&SEL.size>1){combineDlg();return}
  if(t.closest('#lbdelete')&&SEL.size){deleteDlg();return}
  if(t.closest('#lbclear')){SEL.clear();bar();return}
});
})();
'''
