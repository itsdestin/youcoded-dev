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


MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']


def as_row(c, today):
    """A card in the shape today_tab.row draws, so the live rows ARE the approved rows — with the rebuilt content
    (plain title, one-line summary, app area, side) and the live facts from its branches."""
    import datetime
    d = c.get('updated') or c.get('created') or ''
    try:
        dt = datetime.date.fromisoformat(d); days = (today - dt).days; nice = f'{MONTHS[dt.month - 1]} {dt.day}'
    except ValueError:
        days, nice = 0, d
    lv = c.get('live') or {}
    search = ' '.join([str(c['id']), c['title'], c.get('summary', ''), c.get('area', ''), ' '.join(c['tags']), c['body']]).lower()
    chats = [(x['date'], x['name'], x['result'], x['live']) for x in lv.get('chats', [])]
    return dict(id=str(c['id']), title=c['title'], stage=c['stage'], state='working' if lv.get('working') else '',
                area=[c['area']] if c.get('area') else [], tags=c['tags'], side=c.get('side') or None, platform=c.get('platform', ''),
                priority=c.get('priority'), release=c.get('release'), needs=c['needs'], related=c['related'],
                chats=chats, branches=lv.get('branches', []), prs=lv.get('prs', []), unsaved=lv.get('unsaved', False), failing=lv.get('failing', False),
                mergeable=lv.get('mergeable', False), paused=c.get('paused') or None,
                next=c.get('summary') or next_line(c), date=nice, days=days, search=search, screens=[])


def group(T, key, title, hint, tip, ctip, count, body, open_=False, tick=True):
    """WHY one group look for every section (Destin, 2026-10-16: "make the extra sections collapsible"; guide
    "Full screens": big groups use the Large heading — heading left, a one-line description under it, its
    tools right): the heading row itself folds the group, its tools sit at the right, cards follow."""
    # WHY a real button (Destin, 2026-10-16: "i hate clickable elements that are bare text")
    tools = (f'<button class="btn sm" data-tickall="{key}" data-tip="Ticks every item shown in this group.">Tick all</button>' if tick and count else '')
    return (f'<details class="lsec lgroup" data-stage="{key}"{" open" if open_ else ""}><summary class="lghead" data-tip="{T(tip)}">'
            f'<span class="gtext"><span class="gh">{E(title)}<span class="cnt" data-tip="{T(ctip)}">{count}</span></span><span class="gdesc">{E(hint)}</span></span>'
            f'<span class="lgtools">{tools}<span class="chev" aria-hidden="true">›</span></span></summary><div class="lgbody">{body}</div></details>')


def render(cards, leftovers, dev_only, T, sechead, fold, pic):
    import datetime
    today = datetime.date.today()
    rows = [as_row(c, today) for c in cards]
    out = []
    # ---- the controls in the fixed head: search and tag (143 items need finding)
    tags = sorted({t for c in cards for t in c['tags']})
    out.append('<div class="lensbar ltools"><input class="field lq" id="lq" type="search" placeholder="Search work items" aria-label="Search work items" data-tip="Shows only items whose number, name, tags or text contain these words.">'
               '<select class="field" id="ltag" aria-label="Tag" data-tip="Shows only items with this tag."><option value="">All tags</option>'
               + ''.join(f'<option>{E(t)}</option>' for t in tags) + '</select>'
               '<span class="t-2xs muted" data-tip="Tick items to combine them, move them to a stage, or delete them.">Tick items to edit several at once.</span></div>')
    # ---- Start here: the approved top card (today_tab, Q-7), its item picked as the most urgent in the furthest-along stage
    pool = [r for r in rows if r['stage'] in ('polish', 'build', 'planning')]
    # WHY no priority in the pick (Destin, 2026-10-16: scrap priority for now): the furthest-along stage, then work
    # with something to act on (a problem marker or a chat on it now), then the most recently worked on
    act = lambda r: 0 if (r.get('failing') or r.get('unsaved') or r.get('state') == 'working' or r.get('mergeable')) else 1
    hero = min(pool, key=lambda r: (ORDER.index(r['stage']), act(r), r['days'], int(r['id']))) if pool else None
    if hero:
        main, does = tt.next_step(hero)
        out.append(f'''<section class="card hero"><div class="eyebrow"><span data-tip="{T('today.start')}">Start here · suggested next</span></div>
<div class="ctl"><span class="t-lg"><span class="lid">#{hero['id']}</span> {E(hero['title'])}</span>{tt.stage_pill(hero)}{tt.markers(hero)}</div>
<p class="t-sm dim">{E(hero['next'])}</p><div class="cchips">{tt.chips(hero)}</div>
<p class="t-2xs muted">Suggested because it is the furthest along, and its next step is waiting.</p>
<div class="acts heroacts">{tt.menu()}<button class="btn sm" data-card-open="{hero['id']}" data-tip="Opens everything on this item.">Open item</button><button class="btn sm primary" data-does data-tip="{E(does)}">{E(main)}</button></div></section>''')
        hero['suggested'] = True
    by = {s: sorted([r for r in rows if r['stage'] == s], key=lambda r: (act(r), r['days'], int(r['id']))) for s in ORDER}
    cards_of = lambda s: ''.join(tt.row(r, pic, live=True) for r in by[s]) or '<p class="t-xs muted">Nothing is in this stage yet.</p>'
    # WHY these headings and lines: the approved Today (today_tab.render, round 3); your stage and the chats' open by default
    out.append(group(T, 'polish', 'Human polish & review', 'Built, and waiting on you: review it, ask for polish, or merge it. The filled button is the next step.', 'today.needs', 'today.needs.count', len(by['polish']), cards_of('polish'), open_=True))
    out.append(group(T, 'build', 'Agentic buildout', 'Chats are building these. A red marker means something needs fixing.', 'today.inprog', 'today.inprog.count', len(by['build']), cards_of('build'), open_=True))
    out.append(group(T, 'planning', 'Planning', 'Being decided: questions, plans and designs. Nothing built yet.', 'today.planning', 'today.planning.count', len(by['planning']), cards_of('planning')))
    # WHY exploration and merged appear here too (2026-10-16): bulk edit has to reach every item, and exploring items are the ones most often combined
    out.append(group(T, 'explore', 'Preliminary exploration', 'Not settled yet. These may overlap or contradict each other; combine them when one is ready to plan.', 'today.explore', 'today.explore.count', len(by['explore']), cards_of('explore')))
    if by['merged']:
        out.append(group(T, 'merged', 'Merged', 'In master; ships with the next release.', 'today.merged', 'today.merged.count', len(by['merged']), cards_of('merged')))
    n_tidy, tidy_html = tt.tidy(leftovers, dev_only, fold, [c['id'] for c in cards], raw=True)
    out.append('<p class="t-xs muted lnone" id="lnone" hidden>Nothing matches.</p>')
    # ---- the bulk bar (Destin, 2026-10-15: bulk edit in v1)
    out.append('''<div class="lbulk layer" id="lbulk" hidden role="toolbar" aria-label="Edit ticked items"><span class="n" id="lbn"></span>
<span class="mwrap"><button class="btn sm" id="lbstage" aria-haspopup="menu" data-tip="Moves every ticked item to one stage.">Move to stage…</button><span class="menu layer lup" id="lstagemenu" role="menu" hidden>'''
               + ''.join(f'<button class="mitem" role="menuitem" data-lstage="{s}" data-tip="{E(HINT[s])}"><span>{E(WORD[s])}</span><span class="mhint">{E(HINT[s])}</span></button>' for s in ORDER if s != 'merged')
               + '''<span class="mitem" style="cursor:default"><span class="mhint">Merged is set when its branch merges, not here.</span></span></span></span>
<button class="btn sm" id="lbcombine" data-tip="Pulls the ticked items into one, so one branch and one chat can do them all. Nothing is lost: their text, links and tags are kept.">Combine into one…</button>
<button class="btn sm" id="lbdelete" data-tip="Removes the ticked items. Asks first.">Delete…</button>
<button class="closebtn" id="lbclear" aria-label="Clear the ticks" data-tip="Clears the ticks."><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div>''')
    out.append('<script>window.LCARDS=' + json.dumps({str(c['id']): {k: c[k] for k in ('id', 'title', 'stage', 'priority', 'summary', 'area', 'side', 'platform', 'paused', 'live', 'tags', 'needs', 'related', 'neededBy', 'release', 'branch', 'finish', 'body', 'file')} for c in cards}).replace('</', '<\\/') + ';</script>')
    # ---- Tidy up: the approved content, in the same group look (its facts are still the Oct 12 snapshot)
    out.append(group(T, 'tidy', 'Tidy up', 'Housekeeping: nothing here changes the app.', 'today.tidy', 'today.tidy.count', n_tidy, tidy_html, tick=False))
    return out


CSS = '''
/* sections are cards (Destin, 2026-10-16: "the sections should be cards, that expand into bigger cards that contain
   the sub-cards"): a raised first-level box whose header row folds it (guide: a folded box opens inside itself, and
   pointing at it lights the whole box); the item cards inside take the nested look (guide: Card levels) */
.lgroup{margin:0 0 16px;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-xl);box-shadow:var(--layer-shadow);transition:background-color 120ms steps(4)}
.lgroup > summary{list-style:none} .lgroup > summary::-webkit-details-marker{display:none}
.lghead{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-radius:var(--radius-xl)}
@media (hover:hover){.lgroup:not([open]):has(> summary:hover){background:var(--inset)} .lgroup[open] > .lghead:hover{background:color-mix(in srgb,var(--inset) 60%,transparent)}}
.lghead .gtext{flex:1;min-width:0;display:flex;flex-direction:column}
.lghead .gh{font-size:16px;font-weight:500;color:var(--fg)} .lghead .gh .cnt{margin-left:6px}
.lghead .gdesc{font-size:12px;color:var(--fg-muted);margin-top:2px}
.lgtools{display:flex;align-items:center;gap:8px;flex:none}
.lgroup[open] > .lghead .chev{transform:rotate(90deg)}
.lghead:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.lgbody{padding:0 12px 12px}
.lgroup .crow{background:var(--inset);border:1px solid var(--edge-card);border-radius:var(--radius-lg);box-shadow:none;margin-bottom:8px}
.lgroup .crow:last-child{margin-bottom:0}
/* an item card opens its details when clicked anywhere that is not one of its own controls */
.lrow{cursor:pointer;transition:background-color 120ms steps(4)}
@media (hover:hover){.lgroup .lrow:hover{background:color-mix(in srgb,var(--inset) 88%,var(--fg))}}
/* live Today (live_today.py): the approved rows plus a tick box, and the bulk bar */
.ltools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.field{font:inherit;font-size:12px;line-height:16px;padding:6px 12px;border-radius:var(--radius-lg);border:1px solid var(--edge-card);background:var(--inset);color:var(--fg);width:240px}
select.field{width:auto;cursor:pointer} .field:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ltick{margin:3px 4px 0 0;width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex:none}
.lrow.sel{border-color:var(--fg)}
.lid{color:var(--fg-muted);font-weight:400;font-size:12px}
.spill.stage{background:var(--panel);border-color:var(--edge-strong);color:var(--fg)}
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
  $$('.lsec').forEach(s=>{const n=s.querySelectorAll('.lrow:not([hidden])').length;if(q||t){s.hidden=!n;if(n)s.open=true}else s.hidden=false});
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
  openPanel('','Work item #'+c.id,`<div class="card dtop"><div class="dtl"><span class="t-base fw">${e_(c.title)}</span><span class="spill stage" data-tip="Its stage.">${e_(W[c.stage])}</span></div>
    <div class="dchips">${c.area?`<span class="badge" data-tip="The part of the app it lands in.">${e_(c.area)}</span>`:''}${c.platform?`<span class="badge" data-tip="It only applies on this platform.">${e_(c.platform)}</span>`:''}${(c.live?.prs||[]).map(p=>`<span class="badge" data-tip="A change waiting to be merged into master.">Pull request ${e_(p)}</span>`).join('')}</div>
    ${c.summary?`<p class="t-sm dim">${e_(c.summary)}</p>`:''}${c.paused?`<p class="t-xs"><b>Paused because:</b> ${e_(c.paused)}</p>`:''}${c.finish?`<p class="t-xs"><b>Finish line:</b> ${e_(c.finish)}</p>`:''}</div>
    <div class="${right?'dcols':'dcol'}"><div class="dcol">${(c.live?.chats||[]).length?`<section class="dgroup"><div class="eyebrow" data-tip="Every chat that worked on this, newest first.">Chats</div><div class="card dcard">${c.live.chats.map(x=>`<div class="row slim"><span class="body"><span class="t-xs rt">${e_(x.date)} · ${e_(x.name)}</span><span class="hint wrap">${e_(x.result)}</span></span>${x.live?'<span class="spill info" data-tip="Worked on in the last 24 hours."><span class="dot" aria-hidden="true"></span>Working</span>':''}</div>`).join('')}</div></section>`:''}
      <details class="fold"><summary class="foldrow" data-tip="The original notes this item came from."><span class="t-xs">Original notes</span><span class="chev" aria-hidden="true">›</span></summary><div class="foldbody"><p class="dtext">${e_(c.body.replace(/\*\*/g,''))}</p></div></details></div>${right?`<div class="dcol">${right}</div>`:''}</div>
    ${(c.live?.branches||[]).length?'':`<p class="t-2xs muted">Branch name when work starts: ${e_(c.branch)} · ${e_(c.file)}</p>`}`,
    // WHY the card's own next step (2026-10-16): the popup's filled button disagreed with the card's
    (()=>{const pb=document.querySelector(`.lrow[data-cid="${c.id}"] .acts .btn.primary`);const lab=pb?pb.textContent:'Start a chat on this',tip=pb?pb.dataset.tip:'Starts a chat that already knows this item.';
      return `<button class="btn" data-ltickone="${c.id}" data-tip="Ticks this item, to combine or move it with others.">${SEL.has(c.id)?'Untick':'Tick'} this item</button><button class="btn primary" data-does data-tip="${e_(tip)}">${e_(lab)}</button>`})());
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
  // WHY the whole card (2026-10-16, no bare clickable text): a click on the card, not on its own controls, opens it
  const card=t.closest('.lrow');if(card&&!t.closest('button,input,a,select,label,summary,.menu,.cbody')){openCard(+card.dataset.cid);return}
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
