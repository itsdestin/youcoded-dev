#!/usr/bin/env python3
"""Build a one-point-at-a-time UI review page (a "deck"). Each step shows ONE screenshot
with ONE marker, one line of problem, one line of fix, and three buttons: Yes / No /
Tell me more. Nothing else competes. Keyboard: Y / N / M decide (and advance), ← → move, T cycles themes, space
flips Before/After when the step has both. Progress dots at the bottom jump; the last
step is the summary with the copyable feedback block.

History: 2026-08-25 a gallery of full-window sheets was rejected ("no quick way to give
feedback, nothing explained"); 2026-08-26 a prose-first page ("WAY too much text in
different areas") and then a board of cards ("still WAY too much going on visually… not
clear where I'm supposed to glance/select") were rejected. The deck is the answer to
"make the hierarchy immediately intuitive": look → read one line → click.

  python3 scripts/ui-review/review-cards.py crop  <spec.json>   cut the crops (needs magick)
  python3 scripts/ui-review/review-cards.py build <spec.json>   write the HTML next to the spec

Spec (JSON, paths relative to the spec's directory unless absolute):
  out, images, key, runs, labels, crops, title, lead  — see phase-c-cards.json
  items[]   {id, title, surface?,
             image: {crop, themes, cols, zoom?},       # the item's default picture
             points: [{n, kind: measured|judgment, what, fix,
                       at: [x%,y%] | {theme:[x%,y%]},  # ONE marker, percent of the image
                       why?: html, risk?: text,
                       image?: {crop, themes, cols, zoom?}}]   # per-point picture override
             more: [{crop, themes, cols, zoom?, points:[n]}]}  # picture for those points
  closing   optional HTML on the summary step
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


def point_image(it, pt):
    """The picture a point is shown on: its own, else the `more` figure that claims it, else the item's."""
    if pt.get('image'):
        return pt['image']
    for m in it.get('more', []):
        if pt['n'] in m.get('points', []):
            return m
    return it['image']


def all_images(spec):
    seen = set()
    for it in spec['items']:
        for img in [it['image'], *it.get('more', []), *[p['image'] for p in it['points'] if p.get('image')]]:
            k = (img['crop'], tuple(img['themes']), tuple(img['cols']))
            if k not in seen:
                seen.add(k)
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


def marker(pt, theme):
    at = pt.get('at')
    if isinstance(at, dict):
        at = at.get(theme)
    if not at:
        return ''
    return f'<span class="mk" style="left:{at[0]}%;top:{at[1]}%"></span>'


def step_html(spec, it, pt, idx, total):
    img = point_image(it, pt)
    themes, cols = img['themes'], img['cols']
    labels = spec['_labels']
    frames = []
    for t in themes:
        for c in cols:
            f = f'{spec["images"]}/{img["crop"]}--{t}--{c}.png'
            exists = os.path.exists(os.path.join(spec['_base'], f))
            on = t == themes[0] and c == cols[-1]
            zoom = f' style="zoom:{img["zoom"]}"' if img.get('zoom') else ''
            body = f'<img src="{f}"{zoom} alt="">' if exists else '<div class="missing">not captured</div>'
            frames.append(f'<div class="frame{" on" if on else ""}" data-theme="{t}" data-col="{c}">{body}{marker(pt, t)}</div>')
    tabs = ''.join(f'<button class="tab{" on" if i == 0 else ""}" data-theme="{t}">{NICE.get(t, t)}</button>'
                   for i, t in enumerate(themes)) if len(themes) > 1 else ''
    coltabs = ''.join(f'<button class="ctab{" on" if i == len(cols) - 1 else ""}" data-col="{c}">{html.escape(labels.get(c, c))}</button>'
                      for i, c in enumerate(cols)) if len(cols) > 1 else ''
    why = f'<details class="why"><summary>Why / details</summary>{pt["why"]}</details>' if pt.get('why') else ''
    risk = f'<p class="risk">Risk: {html.escape(pt["risk"])}</p>' if pt.get('risk') else ''
    key = f'{it["id"]}:{pt["n"]}'
    surface = f' · {html.escape(it["surface"])}' if it.get('surface') else ''
    return f'''<section class="step" data-key="{key}" data-idx="{idx}">
  <div class="kicker"><span class="pid">{it["id"]}</span> {it["title"]}{surface}<span class="count">{idx + 1} / {total}</span></div>
  <div class="stagewrap"><div class="stage">{"".join(frames)}</div>
    <div class="figbar"><span class="tabs">{tabs}</span><span class="seg">{coltabs}</span></div></div>
  <p class="what">{pt["what"]}</p>
  <p class="fix">→ {pt["fix"]}</p>
  <div class="meta"><span class="kind kind-{pt["kind"]}">{pt["kind"]}</span>{risk}{why}</div>
  <div class="decide"><button class="yes" data-v="yes">Yes, build it <kbd>Y</kbd></button><button class="no" data-v="no">No, leave it <kbd>N</kbd></button><button class="more" data-v="more">Tell me more <kbd>M</kbd></button>
    <input class="note" data-note="{key}" placeholder="note (optional)"></div>
</section>'''


CSS = '''
  :root { --ink:#1a1a1a; --ink2:#666; --line:#dedede; --bg:#f4f4f2; --acc:#2055ca;
          --meas:#0a6a2c; --measbg:#e3f3e8; --judg:#8a5a00; --judgbg:#fff0d6; --yes:#137a3a; --no:#b3261e; --more:#8a5a00 }
  * { box-sizing:border-box }
  html, body { height:100% } body { margin:0; font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink); background:var(--bg); display:flex; flex-direction:column }
  main { flex:1; display:flex; flex-direction:column; align-items:center; padding:18px 24px 8px; min-height:0 }
  .step { display:none; width:min(1060px, 100%); flex-direction:column; min-height:0 } .step.on { display:flex }
  .kicker { color:var(--ink2); font-size:13px; margin-bottom:8px; display:flex; gap:6px; align-items:baseline } .pid { font-weight:700; color:var(--acc) } .count { margin-left:auto; font-variant-numeric:tabular-nums }
  .stagewrap { background:#e6e6e3; border-radius:10px; padding:10px }
  .stage { position:relative; text-align:center; line-height:0; font-size:0; max-height:56vh; overflow:auto }
  .frame { display:none; position:relative; line-height:0 } .frame.on { display:inline-block; max-width:100% } .frame img { display:block; max-width:100%; height:auto }
  .missing { font:14px system-ui; color:#666; padding:40px }
  .mk { position:absolute; transform:translate(-50%,-50%); width:46px; height:46px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 0 3px var(--acc), 0 4px 14px rgba(0,0,0,.6); background:transparent; animation:pulse 1.6s ease-in-out infinite; pointer-events:none }
  @keyframes pulse { 0%,100% { box-shadow:0 0 0 3px var(--acc), 0 4px 14px rgba(0,0,0,.6) } 50% { box-shadow:0 0 0 7px rgba(32,85,202,.55), 0 4px 14px rgba(0,0,0,.6) } }
  .figbar { display:flex; justify-content:space-between; margin-top:8px; min-height:22px } .tab, .ctab { font:12px system-ui; padding:2px 9px; border:1px solid #bbb; background:#fff; border-radius:999px; margin-right:4px; cursor:pointer; color:#444 }
  .tab.on { background:#333; color:#fff; border-color:#333 } .ctab.on { background:var(--acc); color:#fff; border-color:var(--acc) }
  .what { font-size:21px; font-weight:650; line-height:1.3; margin:18px 0 6px } .fix { font-size:17px; color:#1f3a78; margin:0 0 8px }
  .meta { display:flex; gap:14px; align-items:baseline; flex-wrap:wrap; font-size:13px; color:var(--ink2); min-height:22px }
  .kind { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; padding:2px 8px; border-radius:8px } .kind-measured { background:var(--measbg); color:var(--meas) } .kind-judgment { background:var(--judgbg); color:var(--judg) }
  .risk { margin:0; color:#7a3b00 } .why summary { cursor:pointer; color:var(--acc) } .why { max-width:900px } .why p, .why ul { margin:6px 0 0 }
  .decide { display:flex; gap:12px; align-items:center; margin-top:14px; flex-wrap:wrap }
  .decide button { font:600 17px system-ui; padding:12px 26px; border-radius:10px; border:2px solid transparent; cursor:pointer; color:#fff } .decide kbd { font:11px ui-monospace,monospace; background:rgba(255,255,255,.25); padding:1px 5px; border-radius:4px; margin-left:8px }
  .yes { background:var(--yes) } .no { background:var(--no) } .more { background:var(--more) } .decide button.on { border-color:#111; box-shadow:0 0 0 3px #fff, 0 0 0 5px #111 } .step.decided .decide button:not(.on) { opacity:.35 }
  .note { flex:1; min-width:200px; font:14px system-ui; padding:10px 12px; border:1px solid var(--line); border-radius:8px }
  nav { display:flex; align-items:center; gap:10px; padding:10px 24px 16px; justify-content:center; flex-wrap:wrap }
  nav .arrow { font:14px system-ui; padding:6px 12px; border:1px solid #bbb; background:#fff; border-radius:8px; cursor:pointer } nav .arrow kbd { font:11px ui-monospace,monospace; color:#888; margin:0 3px }
  .dots { display:flex; gap:5px; flex-wrap:wrap; justify-content:center } .dot { width:14px; height:14px; border-radius:50%; background:#cfcfcf; border:2px solid transparent; cursor:pointer } .dot.yes { background:var(--yes) } .dot.no { background:var(--no) } .dot.more { background:var(--more) } .dot.on { border-color:#111 } .dot.sum { border-radius:3px }
  .summary { display:none; width:min(1060px,100%) } .summary.on { display:block } .summary h1 { font-size:22px; margin:0 0 8px } .summary table { border-collapse:collapse; width:100%; margin:10px 0 } .summary td, .summary th { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; font-size:14px } .summary td.v-yes { color:var(--yes); font-weight:700 } .summary td.v-no { color:var(--no); font-weight:700 } .summary td.v-more { color:var(--more); font-weight:700 }
  #feedback { width:100%; min-height:150px; font:12.5px ui-monospace,monospace; padding:10px; border:1px solid var(--line); border-radius:8px } #copy { font:600 15px system-ui; padding:10px 18px; border-radius:8px; border:0; background:var(--acc); color:#fff; cursor:pointer; margin:8px 0 } .closing { color:var(--ink2); font-size:13px }
  #st { color:var(--ink2); font-size:13px }
'''

JS = '''
(function(){
  const KEY=%s, STEPS=%s;   // STEPS: [{key,id,n,kind,what}]
  let st={}; try{ st=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  const q=new URLSearchParams(location.search).get('step');   // ?step=N for screenshots/deep links
  let cur=Math.min(q!=null?+q:(st.__cur||0), STEPS.length);
  const steps=[...document.querySelectorAll('.step')], sum=document.querySelector('.summary'), dots=[...document.querySelectorAll('.dot')];
  const save=()=>{ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} paint(); };
  function go(i){ cur=Math.max(0,Math.min(i,STEPS.length)); st.__cur=cur; save(); window.scrollTo(0,0); }
  function decide(v){ if(cur>=STEPS.length) return; st[STEPS[cur].key]=v; save(); setTimeout(()=>go(cur+1), 260); }
  function paint(){
    steps.forEach((s,i)=>{ s.classList.toggle('on', i===cur); const v=st[s.dataset.key]; s.classList.toggle('decided', !!v);
      s.querySelectorAll('.decide button').forEach(b=>b.classList.toggle('on', b.dataset.v===v)); });
    sum.classList.toggle('on', cur===STEPS.length);
    dots.forEach((d,i)=>{ d.classList.toggle('on', i===cur); if(i<STEPS.length){ const v=st[STEPS[i].key]; d.classList.toggle('yes', v==='yes'); d.classList.toggle('no', v==='no'); d.classList.toggle('more', v==='more'); } });
    let done=0; const lines=[KEY+' feedback ('+new Date().toISOString().slice(0,10)+')']; const rows=[]; let lastId='';
    for(const s of STEPS){ const v=st[s.key]; if(v) done++; const note=(st['note:'+s.key]||'').trim();
      lines.push(s.id+' #'+s.n+': '+(v||'?')+(note?' — '+note:'')); rows.push('<tr><td>'+(s.id!==lastId?s.id:'')+'</td><td>'+s.n+'</td><td>'+s.what+'</td><td class="v-'+(v||'')+'">'+(v||'—')+'</td><td>'+(note?note.replace(/</g,'&lt;'):'')+'</td></tr>'); lastId=s.id; }
    document.getElementById('feedback').value=lines.join('\\n'); document.getElementById('rows').innerHTML=rows.join('');
    document.getElementById('st').textContent=done+' of '+STEPS.length+' decided';
  }
  steps.forEach(s=>{ s.querySelectorAll('.decide button').forEach(b=>b.addEventListener('click',()=>decide(b.dataset.v)));
    const n=s.querySelector('.note'); n.value=st['note:'+s.dataset.key]||''; n.addEventListener('input',()=>{ st['note:'+s.dataset.key]=n.value; save(); });
    const show=()=>{ const t=s.querySelector('.tab.on')?.dataset.theme, c=s.querySelector('.ctab.on')?.dataset.col;
      s.querySelectorAll('.frame').forEach(f=>f.classList.toggle('on', (!t||f.dataset.theme===t)&&(!c||f.dataset.col===c))); };
    s.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{ s.querySelectorAll('.tab').forEach(x=>x.classList.remove('on')); b.classList.add('on'); show(); }));
    s.querySelectorAll('.ctab').forEach(b=>b.addEventListener('click',()=>{ s.querySelectorAll('.ctab').forEach(x=>x.classList.remove('on')); b.classList.add('on'); show(); }));
  });
  dots.forEach((d,i)=>d.addEventListener('click',()=>go(i)));
  document.getElementById('prev').addEventListener('click',()=>go(cur-1)); document.getElementById('next').addEventListener('click',()=>go(cur+1));
  document.addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return; const k=e.key.toLowerCase();
    if(k==='y') decide('yes'); else if(k==='n') decide('no'); else if(k==='m') decide('more'); else if(e.key==='ArrowRight') go(cur+1); else if(e.key==='ArrowLeft') go(cur-1);
    else if(k==='t'){ const s=steps[cur]; if(!s) return; const t=[...s.querySelectorAll('.tab')]; if(t.length<2) return; const i=t.findIndex(x=>x.classList.contains('on')); t[(i+1)%%t.length].click(); }
    else if(e.code==='Space'){ const s=steps[cur]; if(!s) return; const t=[...s.querySelectorAll('.ctab')]; if(t.length<2) return; e.preventDefault(); const i=t.findIndex(x=>x.classList.contains('on')); t[(i+1)%%t.length].click(); } });
  document.getElementById('copy').addEventListener('click',()=>{ const t=document.getElementById('feedback'); const ok=()=>{ document.getElementById('copied').textContent='Copied — paste it into the chat.'; };
    (navigator.clipboard?.writeText(t.value)||Promise.reject()).then(ok,()=>{ t.select(); document.execCommand('copy'); ok(); }); });
  paint();
})();
'''


def build(spec):
    steps, parts = [], []
    total = sum(len(it['points']) for it in spec['items'])
    for it in spec['items']:
        for pt in it['points']:
            steps.append({'key': f'{it["id"]}:{pt["n"]}', 'id': it['id'], 'n': pt['n'], 'kind': pt['kind'], 'what': pt['what']})
            parts.append(step_html(spec, it, pt, len(steps) - 1, total))
    dots = ''.join('<span class="dot"></span>' for _ in steps) + '<span class="dot sum" title="Summary"></span>'
    closing = f'<div class="closing">{spec["closing"]}</div>' if spec.get('closing') else ''
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{html.escape(spec["title"])}</title>
<style>{CSS}</style></head><body>
<main>
{chr(10).join(parts)}
<section class="summary"><h1>{html.escape(spec["title"])} — your answers</h1>
<p>{spec.get("lead", "")}</p>
<table><thead><tr><th>Item</th><th>#</th><th>Point</th><th>Answer</th><th>Note</th></tr></thead><tbody id="rows"></tbody></table>
<button id="copy">Copy feedback</button> <span id="copied"></span>
<textarea id="feedback" readonly></textarea>
{closing}
</section>
</main>
<nav><button class="arrow" id="prev"><kbd>←</kbd> back</button><span class="dots">{dots}</span><button class="arrow" id="next">next <kbd>→</kbd></button><span id="st"></span></nav>
<script>{JS % (json.dumps(spec.get("key", spec["title"])), json.dumps(steps))}</script>
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
