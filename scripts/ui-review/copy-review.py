#!/usr/bin/env python3
"""Copy review page: turns a copy.md (sections of `| Old | New |` tables) into one
glanceable, editable HTML page and serves it the way the review deck does —
every decision is saved to <copy>.answers.json as it happens, Submit ends the
server, and the edits come back as <copy>.answers.md ready to apply.

  python3 scripts/ui-review/copy-review.py build <copy.md>        # write <copy>.review.html
  python3 scripts/ui-review/copy-review.py serve <copy.md> [--no-open] [--port N] [--timeout MIN]

WHY its own page rather than the deck: the deck is one picture + Yes/No per step;
a copy review is ~110 short strings where the useful action is *rewriting the
text in place*, so each row is an editable cell with Keep / No beside it."""
import argparse
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck.serve import already_served, serve  # noqa: E402


def parse(md_path):
    """Sections → rows. A row is a table line under a `## ` heading; a `**Destin:**`
    line attaches to the previous row; other prose becomes the section's note."""
    sections, cur = [], None
    with open(md_path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    body = lines
    if lines and lines[0].strip() == '---':          # frontmatter
        end = lines.index('---', 1)
        body = lines[end + 1:]
    for line in body:
        s = line.strip()
        if s.startswith('## '):
            cur = {'title': s[3:].strip(), 'note': [], 'rows': []}
            sections.append(cur)
            continue
        if cur is None:
            continue
        if s.startswith('|'):
            cells = [c.strip() for c in s.strip('|').split('|')]
            if len(cells) < 2 or cells[0] in ('Old', '---') or set(cells[0]) <= set('-: '):
                continue
            cur['rows'].append({'old': cells[0], 'new': cells[1], 'destin': ''})
        elif s.startswith('**Destin:**') and cur['rows']:
            cur['rows'][-1]['destin'] = s[len('**Destin:**'):].strip()
        elif s and not s.startswith('#') and s != '---':
            cur['note'].append(s)
    out = []
    for i, sec in enumerate(sections):
        if not sec['rows']:
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', sec['title'].lower()).strip('-')[:24]
        for j, r in enumerate(sec['rows']):
            r['id'] = f'{i:02d}-{slug}-{j:02d}'
        sec['note'] = ' '.join(sec['note'])
        out.append(sec)
    return out


def inline(md):
    """Escape, then render `code` spans and **bold**. Table cells never hold more than that."""
    t = html.escape(md)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', t)
    return t


PAGE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style>
:root{--bg:#f7f4ee;--card:#fff;--ink:#1f1d1a;--dim:#6b665e;--line:#e3ddd2;--accent:#b8583f;--ok:#2e7d4f;--no:#b23b3b;--edit:#8a5a00;--okbg:#e6f3ea;--nobg:#f9e3e3;--editbg:#fff3d6}
@media(prefers-color-scheme:dark){:root{--bg:#161513;--card:#201e1b;--ink:#ece7dd;--dim:#a19a8e;--line:#37332d;--okbg:#1d3326;--nobg:#3a1f1f;--editbg:#3a2e12}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 "DM Sans",system-ui,sans-serif}
code{font:12.5px/1.4 "JetBrains Mono",ui-monospace,monospace;background:rgba(127,127,127,.12);padding:1px 4px;border-radius:4px}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:10px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header h1{font-size:16px;margin:0 auto 0 0}
.prog{color:var(--dim);font-size:13px}.prog b{color:var(--ink)}
.filters button,.submit{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
.filters button[aria-pressed=true]{background:var(--ink);color:var(--card);border-color:var(--ink)}
.submit{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600}
.submit[disabled]{opacity:.5;cursor:default}
.layout{display:grid;grid-template-columns:220px 1fr;gap:0;max-width:1400px;margin:0 auto}
nav{position:sticky;top:52px;align-self:start;padding:18px 12px;font-size:13px;max-height:calc(100vh - 52px);overflow:auto}
nav a{display:flex;justify-content:space-between;gap:8px;color:var(--dim);text-decoration:none;padding:5px 8px;border-radius:6px}
nav a:hover{background:var(--card)}nav a span{color:var(--ok)}nav a span.left{color:var(--dim)}
main{padding:18px 24px 120px}
section{margin:0 0 26px}section h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:18px 0 8px}
.note{color:var(--dim);font-size:13px;margin:0 0 10px}
.row{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr) 150px;gap:0;background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
.row.ok{border-color:var(--ok)}.row.no{border-color:var(--no)}.row.edit{border-color:var(--edit)}
.old{padding:10px 12px;color:var(--dim);font-size:13.5px;border-right:1px solid var(--line);background:rgba(127,127,127,.04);overflow-wrap:anywhere}
.old:empty::before{content:"— new —";font-style:italic}
.new{padding:10px 12px;outline:0;overflow-wrap:anywhere;min-height:44px}
.new:focus{background:var(--editbg)}
.new .tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--dim);margin-right:4px}
.acts{display:flex;flex-direction:column;gap:6px;padding:8px;border-left:1px solid var(--line);align-items:stretch}
.acts button{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:7px;padding:5px 8px;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}
.row.ok .acts .b-ok{background:var(--okbg);border-color:var(--ok);color:var(--ok)}
.row.no .acts .b-no{background:var(--nobg);border-color:var(--no);color:var(--no)}
.row.edit .acts .b-edit{background:var(--editbg);border-color:var(--edit);color:var(--edit)}
.acts input{border:1px solid var(--line);border-radius:7px;padding:5px 8px;font:inherit;font-size:12.5px;background:transparent;color:var(--ink);width:100%}
.hide{display:none}
.destin{grid-column:1/-1;padding:6px 12px;border-top:1px dashed var(--line);font-size:13px;color:var(--edit)}
footer{position:fixed;bottom:0;left:0;right:0;background:var(--card);border-top:1px solid var(--line);padding:10px 20px;font-size:13px;color:var(--dim);display:flex;gap:12px;align-items:center}
@media(max-width:900px){.layout{grid-template-columns:1fr}nav{display:none}.row{grid-template-columns:1fr}.old{border-right:0;border-bottom:1px solid var(--line)}.acts{flex-direction:row;border-left:0;border-top:1px solid var(--line)}}
</style></head><body>
<header><h1>__TITLE__</h1>
<span class="prog"><b id="done">0</b> of <b id="total">0</b> decided · <span id="edits">0</span> edited · <span id="nos">0</span> no</span>
<span class="filters"><button data-f="all" aria-pressed="true">All</button><button data-f="open">Undecided</button><button data-f="edit">Edited</button><button data-f="no">No</button></span>
<button class="submit" id="submit">Submit</button></header>
<div class="layout"><nav id="nav"></nav><main id="main"></main></div>
<footer><span id="status">Click into any New cell to rewrite it — edits save as you type. Keep = the new text is fine. No = don't ship this (say why in the box). Submit when done.</span></footer>
<script>const DATA=__DATA__;</script>
<script>
(function(){
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const LS='copy-review:'+DATA.key; let server=false;
  const state={deck:DATA.key,started:new Date().toISOString(),submitted:null,answers:{}};
  const rows=[]; DATA.sections.forEach(s=>s.rows.forEach(r=>rows.push(r)));
  async function load(){
    try{const r=await fetch('/answers',{cache:'no-store'});if(r.ok){server=true;const j=await r.json();if(j&&j.answers)Object.assign(state,j);return;}}catch(e){}
    try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(j&&j.answers)Object.assign(state,j);}catch(e){}
  }
  let t=null; function save(){ clearTimeout(t); t=setTimeout(async()=>{ try{localStorage.setItem(LS,JSON.stringify(state));}catch(e){}
    if(server){try{await fetch('/answers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)});$('#status').textContent='Saved.';}catch(e){$('#status').textContent='Server gone — edits kept in this browser; tell Claude.';}} },250); }
  function cls(a){ return !a||!a.v?'':(a.v==='yes'?'ok':a.v==='no'?'no':'edit'); }
  function render(){
    const main=$('#main'), nav=$('#nav'); main.innerHTML=''; nav.innerHTML='';
    DATA.sections.forEach((s,si)=>{
      const sec=document.createElement('section'); sec.id='sec-'+si;
      sec.innerHTML='<h2>'+s.title+'</h2>'+(s.note?'<p class="note">'+s.note+'</p>':'');
      s.rows.forEach(r=>{
        const a=state.answers[r.id]||{}; const el=document.createElement('div'); el.className='row '+cls(a); el.dataset.id=r.id;
        const newHtml=(a.v==='other'&&a.note!=null)?esc(a.note):r.newHtml;
        el.innerHTML='<div class="old">'+r.oldHtml+'</div><div class="new" contenteditable="true" spellcheck="true">'+newHtml+'</div>'
          +'<div class="acts"><button class="b-ok">✓ Keep</button><button class="b-edit" tabindex="-1">✎ Edited</button><button class="b-no">✗ No</button><input class="why" placeholder="note / why" value="'+esc(a.v==='no'?(a.note||''):(a.why||''))+'"></div>'
          +(r.destin?'<div class="destin">Destin (from the .md): '+r.destin+'</div>':'');
        const nw=el.querySelector('.new');
        nw.addEventListener('input',()=>{ const txt=nw.innerText.trim(); state.answers[r.id]={v:'other',note:txt}; el.className='row edit'; paint(); save(); });
        el.querySelector('.b-ok').onclick=()=>{ state.answers[r.id]={v:'yes'}; nw.innerHTML=r.newHtml; el.className='row ok'; paint(); save(); };
        el.querySelector('.b-edit').onclick=()=>nw.focus();
        el.querySelector('.b-no').onclick=()=>{ const why=el.querySelector('.why'); state.answers[r.id]={v:'no',note:why.value}; el.className='row no'; paint(); save(); why.focus(); };
        el.querySelector('.why').addEventListener('input',e=>{ const a=state.answers[r.id]||{}; if(a.v==='no'){a.note=e.target.value;} else {a.why=e.target.value; if(!a.v){a.v='other'; a.note=nw.innerText.trim(); el.className='row edit';}} state.answers[r.id]=a; paint(); save(); });
        sec.appendChild(el);
      });
      main.appendChild(sec);
      const a=document.createElement('a'); a.href='#sec-'+si; a.dataset.sec=si; a.innerHTML=s.title+'<span></span>'; nav.appendChild(a);
    });
    paint();
  }
  function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
  function paint(){
    let done=0,edits=0,nos=0; rows.forEach(r=>{const a=state.answers[r.id]; if(a&&a.v){done++; if(a.v==='other')edits++; if(a.v==='no')nos++;}});
    $('#done').textContent=done; $('#total').textContent=rows.length; $('#edits').textContent=edits; $('#nos').textContent=nos;
    DATA.sections.forEach((s,si)=>{ const n=s.rows.filter(r=>state.answers[r.id]&&state.answers[r.id].v).length; const sp=$('#nav a[data-sec="'+si+'"] span'); sp.textContent=n+'/'+s.rows.length; sp.className=n===s.rows.length?'':'left'; });
    applyFilter();
    $('#submit').disabled=!!state.submitted;
  }
  let filter='all';
  function applyFilter(){ $$('.row').forEach(el=>{ const a=state.answers[el.dataset.id]; const v=a&&a.v; const show=filter==='all'||(filter==='open'&&!v)||(filter==='edit'&&v==='other')||(filter==='no'&&v==='no'); el.classList.toggle('hide',!show); }); }
  $$('.filters button').forEach(b=>b.onclick=()=>{ filter=b.dataset.f; $$('.filters button').forEach(x=>x.setAttribute('aria-pressed',x===b)); applyFilter(); });
  $('#submit').onclick=async()=>{
    const open=rows.length-Object.values(state.answers).filter(a=>a.v).length;
    if(open&&!confirm(open+' rows are still undecided — submit anyway? (undecided = keep as written)')) return;
    rows.forEach(r=>{ if(!state.answers[r.id]||!state.answers[r.id].v) state.answers[r.id]={v:'yes',implicit:true}; });
    state.submitted=new Date().toISOString();
    if(server){ try{ await fetch('/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)}); $('#status').textContent='Submitted — Claude has your edits.'; }catch(e){ $('#status').textContent='Submit failed — server gone; tell Claude the edits are in this browser.'; } }
    else { try{localStorage.setItem(LS,JSON.stringify(state));}catch(e){} $('#status').textContent='Submitted locally (no server) — tell Claude.'; }
    $('#submit').disabled=true;
  };
  load().then(render);
})();
</script></body></html>'''


def build(md_path):
    sections = parse(md_path)
    key = os.path.splitext(os.path.basename(md_path))[0]
    for s in sections:
        s['note'] = inline(s['note'])
        for r in s['rows']:
            r['oldHtml'] = inline(r['old'])
            new = r['new']
            m = re.fullmatch(r'\((unchanged|removed)[^)]*\)', new)
            r['newHtml'] = (f'<span class="tag">{html.escape(new)}</span>' if m else inline(new))
            r['destin'] = inline(r['destin'])
    data = {'key': key, 'sections': [{'title': html.escape(s['title']), 'note': s['note'], 'rows': s['rows']} for s in sections]}
    title = 'Landing page copy — review'
    page = PAGE.replace('__TITLE__', title).replace('__DATA__', json.dumps(data).replace('</', '<\\/'))
    out = os.path.join(os.path.dirname(os.path.abspath(md_path)), key + '.review.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    n = sum(len(s['rows']) for s in sections)
    return out, sections, n


def write_edits_md(md_path, sections, answers_path):
    """Everything that is not a plain Keep, as a markdown list Claude can apply."""
    with open(answers_path) as f:
        state = json.load(f)
    ans = state.get('answers') or {}
    out = answers_path[:-len('.json')] + '.md'
    lines = [f'# Copy review — edits ({state.get("submitted", "")[:16].replace("T", " ")})', '']
    for s in sections:
        items = []
        for r in s['rows']:
            a = ans.get(r['id']) or {}
            if a.get('v') == 'other':
                items.append(f'- **EDIT** ({r["id"]})\n  - was: {r["new"]}\n  - now: {a.get("note", "")}' + (f'\n  - note: {a["why"]}' if a.get('why') else ''))
            elif a.get('v') == 'no':
                items.append(f'- **NO** ({r["id"]}): {r["new"]}' + (f'\n  - why: {a.get("note")}' if a.get('note') else ''))
        if items:
            lines += [f'## {s["title"]}', *items, '']
    if len(lines) == 2:
        lines.append('_Every row kept as written._')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return out


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    b = sub.add_parser('build'); b.add_argument('md')
    s = sub.add_parser('serve'); s.add_argument('md'); s.add_argument('--no-open', action='store_true')
    s.add_argument('--port', type=int, default=0); s.add_argument('--timeout', type=int, default=240)
    a = ap.parse_args()
    out, sections, n = build(a.md)
    print(f'[copy-review] built {out} — {n} rows in {len(sections)} sections')
    if a.cmd == 'build':
        return 0
    base = os.path.dirname(out)
    spec = {'_base': base, '_stem': os.path.basename(out)[:-len('.html')], 'out': os.path.basename(out),
            'key': os.path.basename(a.md), 'steps': [{'id': r['id']} for sec in sections for r in sec['rows']]}
    other = already_served(spec)
    if other:
        print(f'REFUSING: already served by pid {other["pid"]} at {other["url"]}'); return 3
    rc = serve(spec, port=a.port, open_browser=not a.no_open, timeout_min=a.timeout, log=lambda m: print(m) if not m[:1].isdigit() else None)
    if rc == 0:
        edits = write_edits_md(a.md, sections, os.path.join(base, spec['_stem'] + '.answers.json'))
        print(f'[copy-review] edits written to {edits}')
    return rc


if __name__ == '__main__':
    sys.exit(main())
