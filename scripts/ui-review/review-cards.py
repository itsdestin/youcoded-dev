#!/usr/bin/env python3
"""Build a glance-first UI review page: one CARD per item, the screenshot is the hero,
numbered markers are drawn ON the image, and every marker has a one-line problem, a
one-line fix and a Yes/No control beside it. Replaces the prose-first review-page.py
format (kept for the Phase A/B pages), after Destin rejected it on 2026-08-26: "gotta
read WAY too much text in different areas… images are poorly organized/annotated".

  python3 scripts/ui-review/review-cards.py crop  <spec.json>   cut the crops (needs magick)
  python3 scripts/ui-review/review-cards.py build <spec.json>   write the HTML next to the spec

Spec (JSON, paths relative to the spec's directory unless absolute):
  out            output HTML file
  images         directory the crops are written to / read from
  key            localStorage key + feedback header (keep stable across rebuilds)
  runs           {"today": "/abs/path/to/sweep"}  — a sweep is <run>/shots-<plan>/<theme>/<shot>.png
  labels         {"today": "Today", "after": "After"} column labels (optional)
  crops          {name: [plan, shot, "WxH+X+Y"]} — merged over scripts/ui-review/crops.json
  title, lead    page title and ONE sentence under it
  banner         optional HTML shown at the top (decisions, status)
  items[]        {id, title, surface?,
                  image: {crop, themes: [...], cols: ["today"] | ["before","after"], fit?: "width"|"none", zoom?: 0.5,
                          points?: [n,...]  # default: every point no `more` figure claims},
                  points: [{n, kind: measured|judgment, what, fix, at: [x%,y%] | {theme: [x%,y%]},
                            why?: html, risk?: text}],
                  more: [ {crop, themes, cols, note?, points?: [n,...]} ]   # optional extra images
                  }
  closing        optional HTML at the end

Per point, the reviewer clicks Yes or No; the feedback block reads "P-3: 1 yes · 2 yes · 3 no —
notes". Marker positions are PERCENTAGES of the crop so they survive scaling; a point with no
`at` gets no marker (a whole-image point).
"""
import html
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NICE = {'midnight': 'Midnight', 'dark': 'Dark', 'light': 'Light', 'creme': 'Crème',
        'halftone-dimension': 'Halftone', 'meadow-mist': 'Meadow'}
DEFAULT_LABELS = {'today': 'Today', 'before': 'Before', 'after': 'After', 'A': 'After'}


def load(path):
    spec = json.load(open(path))
    spec['_base'] = os.path.dirname(os.path.abspath(path))
    shared = json.load(open(os.path.join(HERE, 'crops.json')))
    shared.pop('_comment', None)
    spec['_crops'] = {**shared, **spec.get('crops', {})}
    spec['_labels'] = {**DEFAULT_LABELS, **spec.get('labels', {})}
    return spec


def all_images(spec):
    for it in spec['items']:
        for img in [it['image'], *it.get('more', [])]:
            yield img


def crop(spec):
    out = os.path.join(spec['_base'], spec['images'])
    os.makedirs(out, exist_ok=True)
    n = 0
    for img in all_images(spec):
        plan, shot, geo = spec['_crops'][img['crop']]
        for t in img['themes']:
            for c in img['cols']:
                run = spec['runs'].get(c)
                src = os.path.join(run, f'shots-{plan}', t, f'{shot}.png') if run else None
                if src and os.path.exists(src):
                    subprocess.run(['magick', src, '-crop', geo, '+repage',
                                    os.path.join(out, f'{img["crop"]}--{t}--{c}.png')], check=True)
                    n += 1
                else:
                    print(f'  not captured: {img["crop"]} {t} {c} ({src})', file=sys.stderr)
    print(f'{n} crops → {out}')


def marker_html(pt, theme):
    at = pt.get('at')
    if isinstance(at, dict):
        at = at.get(theme)
    if not at:
        return ''
    return (f'<span class="mk mk-{pt["kind"]}" data-pt="{pt["n"]}" style="left:{at[0]}%;top:{at[1]}%" '
            f'title="{html.escape(pt["what"])}">{pt["n"]}</span>')


def figure_html(spec, item, img, points, extra=False):
    """One image area: theme tabs + before/after toggle + the image with markers."""
    labels = spec['_labels']
    themes = img['themes']
    cols = img['cols']
    uid = f'{item["id"]}-{img["crop"]}'
    fit = img.get('fit', 'width')
    tabs = ''.join(f'<button class="tab{" on" if i == 0 else ""}" data-theme="{t}">{NICE.get(t, t)}</button>'
                   for i, t in enumerate(themes))
    coltabs = ''
    if len(cols) > 1:
        coltabs = '<span class="seg">' + ''.join(
            f'<button class="ctab{" on" if i == len(cols) - 1 else ""}" data-col="{c}">{html.escape(labels.get(c, c))}</button>'
            for i, c in enumerate(cols)) + '</span><span class="hint">space flips</span>'
    frames = []
    for t in themes:
        for c in cols:
            f = f'{spec["images"]}/{img["crop"]}--{t}--{c}.png'
            exists = os.path.exists(os.path.join(spec['_base'], f))
            on = (t == themes[0] and c == cols[-1])
            marks = ''.join(marker_html(p, t) for p in points)
            zoom = f' style="zoom:{img["zoom"]}"' if img.get('zoom') else ''
            body = (f'<img src="{f}"{zoom} alt="{img["crop"]} {t} {c}">' if exists
                    else '<div class="missing">not captured</div>')
            frames.append(f'<div class="frame{" on" if on else ""}" data-theme="{t}" data-col="{c}">{body}{marks}</div>')
    note = f'<p class="fignote">{img["note"]}</p>' if img.get('note') else ''
    return (f'<figure class="fig fit-{fit}{" extra" if extra else ""}" data-fig="{uid}">'
            f'<div class="figbar"><span class="tabs">{tabs}</span>{coltabs}</div>'
            f'<div class="stage">{"".join(frames)}</div>{note}</figure>')


def point_html(item, pt):
    why = f'<details><summary>why</summary>{pt["why"]}</details>' if pt.get('why') else ''
    risk = f'<div class="risk">Risk: {html.escape(pt["risk"])}</div>' if pt.get('risk') else ''
    key = f'{item["id"]}:{pt["n"]}'
    return f'''<li class="pt" data-pt="{pt["n"]}" data-key="{key}">
  <span class="n n-{pt["kind"]}">{pt["n"]}</span>
  <div class="ptbody">
    <div class="what">{pt["what"]}<span class="kind kind-{pt["kind"]}">{pt["kind"]}</span></div>
    <div class="fix">→ {pt["fix"]}</div>
    {risk}{why}
  </div>
  <span class="yn"><button data-v="yes">Yes</button><button data-v="no">No</button></span>
</li>'''


def item_html(spec, it):
    pts = it['points']
    # The hero image only carries the markers that no `more` figure claims (or an explicit
    # image.points list) — otherwise every point with an `at` lands on the hero too.
    claimed = {n for m in it.get('more', []) for n in m.get('points', [])}
    main_pts = ([p for p in pts if p['n'] in it['image']['points']] if it['image'].get('points')
                else [p for p in pts if p['n'] not in claimed])
    main = figure_html(spec, it, it['image'], main_pts)
    more = ''
    for m in it.get('more', []):
        sub = [p for p in pts if p['n'] in m.get('points', [])]
        more += figure_html(spec, it, m, sub, extra=True)
    surface = f'<span class="surface">{html.escape(it["surface"])}</span>' if it.get('surface') else ''
    return f'''<section class="card" id="{it["id"]}" data-item="{it["id"]}">
  <header><h2><span class="pid">{it["id"]}</span> {it["title"]}</h2>{surface}
    <span class="quick"><button data-q="measured">Yes to measured</button><button data-q="yes">Yes to all</button><button data-q="no">No to all</button></span></header>
  <div class="body">
    <div class="figs">{main}{more}</div>
    <div class="panel">
      <ol class="points">{"".join(point_html(it, p) for p in pts)}</ol>
      <textarea data-notes="{it["id"]}" placeholder="Notes (optional)"></textarea>
    </div>
  </div>
</section>'''


CSS = '''
  :root { --ink:#1b1b1b; --ink2:#5a5a5a; --line:#dcdcdc; --bg:#f3f3f1; --card:#fff; --acc:#2055ca;
          --meas:#0a6a2c; --measbg:#e3f3e8; --judg:#7a4d00; --judgbg:#fff0d6; --yes:#0a7a2f; --no:#b00020 }
  * { box-sizing:border-box }
  body { margin:0; padding:0 0 40px; font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink); background:var(--bg) }
  #top { position:sticky; top:0; z-index:20; background:#111; color:#eee; padding:8px 20px; display:flex; gap:14px; align-items:center; flex-wrap:wrap }
  #top h1 { font-size:15px; margin:0; font-weight:600 } #top .jump a { color:#bbb; text-decoration:none; margin-right:10px; font-size:13px }
  #top .jump a.done { color:#7fd49a } #top .st { margin-left:auto; font-size:13px; opacity:.9 }
  #top button { font:13px system-ui; padding:6px 12px; border-radius:6px; border:0; background:var(--acc); color:#fff; cursor:pointer }
  .lead { margin:14px 20px 4px; color:var(--ink2); max-width:1100px } .banner { margin:10px 20px; padding:10px 14px; background:#fff6e0; border:1px solid #e8c98a; border-radius:8px; max-width:1100px }
  .legend { margin:0 20px 6px; font-size:12px; color:var(--ink2) }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; margin:14px 20px; overflow:hidden }
  .card header { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--line); background:#fafafa }
  .card h2 { font-size:17px; margin:0 } .pid { color:var(--acc); font-weight:700; margin-right:4px } .surface { color:var(--ink2); font-size:13px }
  .quick { margin-left:auto; display:flex; gap:6px } .quick button { font:12px system-ui; padding:4px 9px; border:1px solid var(--line); background:#fff; border-radius:6px; cursor:pointer } .quick button:hover { border-color:var(--acc) }
  .body { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(360px,1fr); gap:0 }
  .figs { padding:12px; border-right:1px solid var(--line); background:#ececea; min-width:0 }
  .fig { margin:0 0 12px } .fig.extra { padding-top:8px; border-top:1px dashed #c9c9c9 }
  .figbar { display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap }
  .tabs .tab, .seg .ctab { font:12px system-ui; padding:3px 10px; border:1px solid #bbb; background:#fff; cursor:pointer; border-radius:999px; margin-right:4px }
  .tabs .tab.on { background:#333; color:#fff; border-color:#333 } .seg { margin-left:auto } .seg .ctab { border-radius:6px } .seg .ctab.on { background:var(--acc); color:#fff; border-color:var(--acc) }
  .hint { font-size:11px; color:var(--ink2) }
  .stage { position:relative; background:#8a8a8a; border-radius:6px; overflow:hidden; line-height:0; font-size:0 }
  /* The frame shrink-wraps the image (inline-block) so marker percentages are of the IMAGE, not of a wider stage. */
  .frame { display:none; position:relative; line-height:0; vertical-align:top } .frame.on { display:inline-block; max-width:100% }
  .fit-width .frame.on { display:block } .fit-width .frame img { width:100%; height:auto; display:block } .fit-none .frame img { display:block; max-width:100%; height:auto }
  .missing { color:#fff; font-style:italic; padding:40px; line-height:1.4 }
  .mk { position:absolute; transform:translate(-50%,-50%); width:24px; height:24px; border-radius:50%; font:700 13px/24px system-ui; text-align:center; color:#fff; box-shadow:0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.6); cursor:pointer; z-index:2 }
  .mk-measured { background:var(--meas) } .mk-judgment { background:var(--judg) } .mk.hot { transform:translate(-50%,-50%) scale(1.35); box-shadow:0 0 0 3px #ffde59, 0 2px 8px rgba(0,0,0,.7) }
  .fignote { font-size:12px; color:var(--ink2); margin:6px 2px 0; line-height:1.4 }
  .panel { padding:10px 14px 12px; display:flex; flex-direction:column; min-width:0 }
  .points { list-style:none; margin:0; padding:0 } .pt { display:grid; grid-template-columns:28px 1fr auto; gap:10px; padding:9px 6px; border-radius:8px; border-bottom:1px solid #eee; align-items:start }
  .pt.hot { background:#fffbe6 } .pt:last-child { border-bottom:0 }
  .n { width:24px; height:24px; border-radius:50%; color:#fff; font:700 13px/24px system-ui; text-align:center; margin-top:1px } .n-measured { background:var(--meas) } .n-judgment { background:var(--judg) }
  .what { font-weight:600; line-height:1.35 } .fix { color:#243d7a; margin-top:2px; line-height:1.35 } .risk { color:#7a3b00; font-size:12.5px; margin-top:3px }
  .kind { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:1px 6px; border-radius:8px; margin-left:8px; vertical-align:middle }
  .kind-measured { background:var(--measbg); color:var(--meas) } .kind-judgment { background:var(--judgbg); color:var(--judg) }
  details { font-size:12.5px; color:var(--ink2); margin-top:4px } summary { cursor:pointer; color:var(--acc) } details p, details ul { margin:4px 0; padding-left:18px } details p { padding-left:0 }
  .yn { display:flex; gap:4px } .yn button { font:12.5px system-ui; padding:4px 10px; border:1px solid #bbb; background:#fff; border-radius:6px; cursor:pointer; min-width:44px }
  .yn button.on[data-v=yes] { background:var(--yes); color:#fff; border-color:var(--yes) } .yn button.on[data-v=no] { background:var(--no); color:#fff; border-color:var(--no) }
  .panel textarea { margin-top:10px; width:100%; min-height:44px; font:13px system-ui; padding:6px 8px; border:1px solid var(--line); border-radius:6px; resize:vertical }
  .closing { margin:14px 20px; max-width:1100px; color:var(--ink2); font-size:13px } .closing h2 { font-size:15px; color:var(--ink) }
  #fb { margin:14px 20px } #feedback { width:100%; max-width:1100px; min-height:150px; font:12.5px ui-monospace,monospace; padding:10px; border:1px solid var(--line); border-radius:6px }
  @media (max-width: 1000px) { .body { grid-template-columns:1fr } .figs { border-right:0; border-bottom:1px solid var(--line) } }
'''

JS = '''
(function(){
  const KEY=%s; const ITEMS=%s;   // ITEMS: {id: [{n, kind}]}
  let st={}; try{ st=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  const save=()=>{ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} render(); };
  // --- decisions
  document.querySelectorAll('.pt').forEach(li=>{
    li.querySelectorAll('.yn button').forEach(b=>b.addEventListener('click',()=>{ st[li.dataset.key]=b.dataset.v; save(); }));
    li.addEventListener('mouseenter',()=>hot(li.closest('.card'), li.dataset.pt, true));
    li.addEventListener('mouseleave',()=>hot(li.closest('.card'), li.dataset.pt, false));
  });
  document.querySelectorAll('.quick button').forEach(b=>b.addEventListener('click',()=>{
    const card=b.closest('.card'); const id=card.dataset.item;
    for(const p of ITEMS[id]){ const k=id+':'+p.n;
      if(b.dataset.q==='measured') st[k]=(p.kind==='measured')?'yes':'no'; else st[k]=b.dataset.q; }
    save();
  }));
  document.querySelectorAll('textarea[data-notes]').forEach(t=>{ t.value=st['notes:'+t.dataset.notes]||'';
    t.addEventListener('input',()=>{ st['notes:'+t.dataset.notes]=t.value; save(); }); });
  // --- markers <-> points
  function hot(card,n,on){ card.querySelectorAll('[data-pt="'+n+'"]').forEach(e=>e.classList.toggle('hot',on)); }
  document.querySelectorAll('.mk').forEach(m=>{
    m.addEventListener('mouseenter',()=>hot(m.closest('.card'), m.dataset.pt, true));
    m.addEventListener('mouseleave',()=>hot(m.closest('.card'), m.dataset.pt, false));
    m.addEventListener('click',()=>{ const li=m.closest('.card').querySelector('.pt[data-pt="'+m.dataset.pt+'"]'); li.scrollIntoView({block:'nearest'}); hot(m.closest('.card'), m.dataset.pt, true); setTimeout(()=>hot(m.closest('.card'), m.dataset.pt, false), 1200); });
  });
  // --- theme tabs + before/after
  document.querySelectorAll('.fig').forEach(fig=>{
    const show=()=>{ const t=fig.querySelector('.tab.on')?.dataset.theme; const c=(fig.querySelector('.ctab.on')||{}).dataset?.col;
      fig.querySelectorAll('.frame').forEach(f=>f.classList.toggle('on', f.dataset.theme===t && (!c || f.dataset.col===c))); };
    fig.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{ fig.querySelectorAll('.tab').forEach(x=>x.classList.remove('on')); b.classList.add('on'); show(); }));
    fig.querySelectorAll('.ctab').forEach(b=>b.addEventListener('click',()=>{ fig.querySelectorAll('.ctab').forEach(x=>x.classList.remove('on')); b.classList.add('on'); show(); }));
    fig.addEventListener('mouseenter',()=>{ window.__fig=fig; });
  });
  document.addEventListener('keydown',e=>{ if(e.code!=='Space' || e.target.tagName==='TEXTAREA') return; const fig=window.__fig; if(!fig) return;
    const tabs=[...fig.querySelectorAll('.ctab')]; if(tabs.length<2) return; e.preventDefault();
    const i=tabs.findIndex(t=>t.classList.contains('on')); tabs[(i+1)%%tabs.length].click(); });
  // --- feedback + progress
  function render(){
    let total=0, done=0; const lines=[KEY+' feedback ('+new Date().toISOString().slice(0,10)+')'];
    for(const id in ITEMS){ const parts=[]; let idDone=true;
      for(const p of ITEMS[id]){ total++; const v=st[id+':'+p.n]; if(v) done++; else idDone=false; parts.push(p.n+' '+(v||'?')); }
      const notes=(st['notes:'+id]||'').replace(/\\s+/g,' ').trim();
      lines.push(id+': '+parts.join(' · ')+(notes?' — '+notes:''));
      const a=document.querySelector('#top .jump a[href="#'+id+'"]'); if(a) a.classList.toggle('done', idDone);
    }
    document.querySelectorAll('.pt').forEach(li=>{ const v=st[li.dataset.key]; li.querySelectorAll('.yn button').forEach(b=>b.classList.toggle('on', b.dataset.v===v)); });
    document.getElementById('feedback').value=lines.join('\\n');
    document.getElementById('status').textContent=done+' of '+total+' points decided'+(done<total?'':' — ready to copy');
  }
  document.getElementById('copy').addEventListener('click',()=>{ const t=document.getElementById('feedback');
    const ok=()=>{ document.getElementById('status').textContent='Copied — paste it into the chat.'; };
    (navigator.clipboard?.writeText(t.value)||Promise.reject()).then(ok,()=>{ t.select(); document.execCommand('copy'); ok(); }); });
  render();
})();
'''


def build(spec):
    items = {it['id']: [{'n': p['n'], 'kind': p['kind']} for p in it['points']] for it in spec['items']}
    jump = ''.join(f'<a href="#{it["id"]}">{it["id"]}</a>' for it in spec['items'])
    banner = f'<div class="banner">{spec["banner"]}</div>' if spec.get('banner') else ''
    closing = f'<div class="closing">{spec["closing"]}</div>' if spec.get('closing') else ''
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{html.escape(spec["title"])}</title>
<style>{CSS}</style></head><body>
<div id="top"><h1>{html.escape(spec["title"])}</h1><span class="jump">{jump}<a href="#fb">feedback</a></span><span class="st" id="status"></span><button id="copy">Copy feedback</button></div>
<p class="lead">{spec["lead"]}</p>
<p class="legend">Numbers on the image match the list beside it. <span class="kind kind-measured">measured</span> = a broken behaviour or a number you can check · <span class="kind kind-judgment">judgment</span> = taste; saying No costs nothing. Click Yes/No per point; hover a point to find it on the image; theme pills switch the screenshot. Your answers are kept by this page.</p>
{banner}
{chr(10).join(item_html(spec, it) for it in spec["items"])}
{closing}
<div id="fb"><h2 style="font-size:15px">Feedback</h2><textarea id="feedback" readonly></textarea></div>
<script>{JS % (json.dumps(spec.get("key", spec["title"])), json.dumps(items))}</script>
</body></html>
'''
    out = os.path.join(spec['_base'], spec['out'])
    with open(out, 'w') as f:
        f.write(page)
    print('wrote', out)


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('crop', 'build'):
        print(__doc__); sys.exit(2)
    spec = load(sys.argv[2])
    (crop if sys.argv[1] == 'crop' else build)(spec)
