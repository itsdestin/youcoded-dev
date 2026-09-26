#!/usr/bin/env python3
"""Review page builder — the surface Destin approves UI changes on.

    python3 scripts/ui-review/review-page.py crop  <spec.json>   # cut 1:1 crops from the runs
    python3 scripts/ui-review/review-page.py build <spec.json>   # write the HTML page

Why this exists (2026-08-25): a gallery of shrunken full-window screenshots with a chat
summary was rejected as a review surface — "no quick way to give feedback and none of the
changes are explained". Every phase since is reviewed on ONE page where each numbered
change carries: the problem with measured numbers, the exact edit, 1:1 crops of the
affected element before/after per theme, what he'll notice + risks, alternatives, and a
decision control whose answers assemble into a copyable feedback block. Template spec:
docs/active/design/2026-08-25-ui-audit/phase-a-review.json.

Spec (JSON, paths relative to the spec file):
  out            HTML file to write
  images         directory for crops (git-ignored under docs/**/images/)
  sheets         directory of full sheets to link (optional)
  runs           {"before": "<run dir>", "A": "<run dir>", ...} — run dirs are run-review.sh
                 outputs (shots-<plan>/<theme>/<shot>.png)
  crops          {"name": ["plan", "shot", "WxH+X+Y"]} — merged over crops.json (this dir)
  labels         {"before": "Before (today)", "A": "After"} column labels (defaults shown)
  title, lead, howto, banner   page copy (HTML allowed; banner is the amber box, optional)
  items[]        {id, title, kind: measured|judgment|mixed, sections: [{h, html}],
                  looks: [{crop, themes, cols, labels?, note?, zoom?}], sheets: [names],
                  decision: [options]}
  closing        HTML after the items (what did NOT change, etc.)
"""
import html, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
THEMES = ['midnight', 'dark', 'light', 'creme', 'halftone-dimension', 'meadow-mist']
NICE = {'midnight': 'Midnight', 'dark': 'Dark', 'light': 'Light', 'creme': 'Crème',
        'halftone-dimension': 'Halftone Dimension', 'meadow-mist': 'Meadow Mist'}
KIND = {'measured': ('measured', 'A number or a broken behaviour you can check — not taste.'),
        'judgment': ('judgment', 'A consistency/taste argument. The baseline is not broken; say no freely.'),
        'mixed': ('mixed', 'Part measured, part judgment — the sections say which is which.')}
DEFAULT_LABELS = {'before': 'Before (today)', 'A': 'After', 'B': 'After (B)'}


def load(spec_path):
    with open(spec_path) as f:
        spec = json.load(f)
    base = os.path.dirname(os.path.abspath(spec_path))
    with open(os.path.join(HERE, 'crops.json')) as f:
        crops = json.load(f)
    crops.update(spec.get('crops', {}))
    spec['_base'] = base
    spec['_crops'] = crops
    spec['_labels'] = {**DEFAULT_LABELS, **spec.get('labels', {})}
    return spec


def crop(spec):
    out = os.path.join(spec['_base'], spec['images']); os.makedirs(out, exist_ok=True)
    wanted = {(l['crop'], t, c) for it in spec['items'] for l in it.get('looks', [])
              for t in l['themes'] for c in l['cols']}
    n = 0
    for name, theme, col in sorted(wanted):
        plan, shot, geo = spec['_crops'][name]
        run = spec['runs'].get(col)
        src = os.path.join(run, f'shots-{plan}', theme, f'{shot}.png') if run else None
        if src and os.path.exists(src):
            subprocess.run(['magick', src, '-crop', geo, '+repage', os.path.join(out, f'{name}--{theme}--{col}.png')], check=True)
            n += 1
        else:
            print(f'  not captured: {name} {theme} {col} ({src})', file=sys.stderr)
    print(f'{n} crops → {out}')


def looks_html(spec, look):
    labels = {**spec['_labels'], **look.get('labels', {})}
    out = ['<div class="crops">']
    if look.get('note'): out.append(f'<p class="capnote">{look["note"]}</p>')
    out.append('<table><thead><tr><th></th>' + ''.join(f'<th>{html.escape(labels.get(c, c))}</th>' for c in look['cols']) + '</tr></thead><tbody>')
    zoom = look.get('zoom', 1.0)
    for t in look['themes']:
        out.append(f'<tr><th class="theme">{NICE.get(t, t)}</th>')
        for c in look['cols']:
            f = f'{spec["images"]}/{look["crop"]}--{t}--{c}.png'
            if os.path.exists(os.path.join(spec['_base'], f)):
                out.append(f'<td><img src="{f}" style="zoom:{zoom}" loading="lazy" alt="{look["crop"]} {t} {c}"></td>')
            else:
                out.append('<td class="missing">not captured</td>')
        out.append('</tr>')
    out.append('</tbody></table></div>')
    return '\n'.join(out)


def item_html(spec, it):
    kind, kind_help = KIND[it.get('kind', 'judgment')]
    parts = [f'<h2 id="{it["id"]}">{it["id"]} — {it["title"]} <span class="kind kind-{kind}" title="{html.escape(kind_help)}">{kind}</span></h2>']
    for s in it.get('sections', []):
        parts.append(f'<h3>{s["h"]}</h3>\n{s["html"]}')
    if it.get('looks'):
        parts.append('<h3>Look</h3>')
        for l in it['looks']: parts.append(looks_html(spec, l))
    if it.get('sheets') and spec.get('sheets'):
        parts.append('<p>Full sheets: ' + ' · '.join(f'<a href="{spec["sheets"]}/{p}.jpg">{p}</a>' for p in it['sheets']) + '</p>')
    radios = ''.join(f'<label><input type="radio" name="{it["id"]}" value="{html.escape(v)}"> {html.escape(v)}</label>' for v in it['decision'])
    parts.append(f'''<div class="decide" data-item="{it["id"]}">
  <div class="radios">{radios}</div>
  <textarea data-notes="{it["id"]}" placeholder="Notes (optional): what to change, what you like, what worries you"></textarea>
</div>''')
    return '\n'.join(parts)


CSS = '''
  :root { --ink:#1b1b1b; --ink2:#555; --line:#d8d8d8; --bg:#fafafa; --card:#fff; --acc:#2055ca; --warnbg:#fff6e0; }
  * { box-sizing:border-box }
  body { margin:0; padding:24px 28px 120px; font:15px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--ink); background:var(--bg); max-width:1500px; }
  h1 { font-size:26px; margin:0 0 6px } h2 { font-size:21px; margin:44px 0 6px; padding-top:18px; border-top:2px solid var(--line) }
  h3 { font-size:15px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); margin:22px 0 6px }
  p, li { max-width:900px } .lead { font-size:16px; color:var(--ink2) }
  code { font:13px ui-monospace, SFMono-Regular, Menlo, monospace; background:#eee; padding:1px 4px; border-radius:3px }
  table { border-collapse:collapse; margin:8px 0 } th, td { border:1px solid var(--line); padding:6px 10px; vertical-align:top; text-align:left }
  th { background:#f0f0f0; font-weight:600 } .num td:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums }
  .crops table { background:#8a8a8a } .crops th { background:#e9e9e9 } .crops th.theme { white-space:nowrap }
  .crops td { padding:6px; background:#8a8a8a } .crops img { display:block; max-width:100%; height:auto; box-shadow:0 1px 4px rgba(0,0,0,.4) }
  .crops td.missing { color:#fff; font-style:italic } .capnote { font-size:13px; color:var(--ink2); margin:4px 0 6px }
  .box { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 18px; margin:10px 0; max-width:960px }
  .warn { background:var(--warnbg); border-color:#e8c98a }
  .kind { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; padding:2px 8px; border-radius:10px; vertical-align:middle; margin-left:8px; cursor:help }
  .kind-measured { background:#e3f3e8; color:#0a6a2c } .kind-judgment { background:#fff0d6; color:#7a4d00 } .kind-mixed { background:#e8ecf7; color:#2b3f7a }
  .decide { background:#eef3ff; border:1px solid #c5d3f5; border-radius:8px; padding:12px 16px; margin:14px 0 6px; max-width:960px }
  .decide .radios label { display:inline-block; margin:0 18px 6px 0; cursor:pointer } .decide textarea { width:100%; min-height:56px; margin-top:6px; font:14px system-ui; padding:8px; border:1px solid #c5d3f5; border-radius:6px }
  .bad { color:#b00020; font-weight:600 } .good { color:#0a7a2f; font-weight:600 }
  #summary { position:fixed; right:0; bottom:0; left:0; background:#111; color:#eee; padding:10px 28px; display:flex; gap:16px; align-items:center; font-size:14px; box-shadow:0 -2px 12px rgba(0,0,0,.3) }
  #summary button { font:14px system-ui; padding:8px 14px; border-radius:6px; border:0; background:var(--acc); color:#fff; cursor:pointer } #summary .st { flex:1; opacity:.85 }
  #feedback { width:100%; min-height:160px; font:13px ui-monospace, monospace; padding:10px; border:1px solid var(--line); border-radius:6px }
  .toc a { margin-right:16px }
'''

JS = '''
(function(){
  const items=%s; const KEY=%s;
  let state={}; try{ state=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  function render(){
    const lines=[KEY+' feedback ('+new Date().toISOString().slice(0,10)+')']; let decided=0;
    for(const id of items){ const s=state[id]||{}; if(s.choice) decided++;
      lines.push(id+': '+(s.choice||'(no decision)')+(s.notes?' — '+s.notes.replace(/\\s+/g,' ').trim():'')); }
    document.getElementById('feedback').value=lines.join('\\n');
    document.getElementById('status').textContent=decided+' of '+items.length+' decided'+(decided<items.length?' — scroll up for the rest':' — ready to copy');
  }
  document.querySelectorAll('.decide').forEach(box=>{
    const id=box.dataset.item; const s=state[id]||{};
    box.querySelectorAll('input[type=radio]').forEach(r=>{ if(r.value===s.choice) r.checked=true;
      r.addEventListener('change',()=>{ state[id]=Object.assign(state[id]||{}, {choice:r.value}); save(); }); });
    const ta=box.querySelector('textarea'); ta.value=s.notes||'';
    ta.addEventListener('input',()=>{ state[id]=Object.assign(state[id]||{}, {notes:ta.value}); save(); });
  });
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} render(); }
  document.getElementById('copy').addEventListener('click',()=>{
    const t=document.getElementById('feedback'); t.select();
    const done=()=>{ document.getElementById('status').textContent='Copied — paste it into the chat.'; };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t.value).then(done,()=>{ document.execCommand('copy'); done(); }); }
    else { document.execCommand('copy'); done(); }
  });
  render();
})();
'''


def build(spec):
    ids = [it['id'] for it in spec['items']]
    toc = ' '.join(f'<a href="#{it["id"]}">{it["id"]} {it["title"]}</a>' for it in spec['items']) + ' <a href="#fb">Feedback</a>'
    banner = f'<div class="box warn">{spec["banner"]}</div>' if spec.get('banner') else ''
    legend = ' · '.join(f'<span class="kind kind-{k}">{k}</span> {h}' for k, h in KIND.values())
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{html.escape(spec["title"])}</title>
<style>{CSS}</style></head><body>
<h1>{spec["title"]}</h1>
<p class="lead">{spec["lead"]}</p>
<div class="box"><strong>How to review.</strong> {spec.get("howto", "Read each section, look at the crops, click a decision and add notes if you want something different. The bar at the bottom collects everything into one block of text — press <em>Copy feedback</em> and paste it into the chat. Your selections are remembered by this page if you close it and come back.")}<br><span style="font-size:13px">Each change is tagged: {legend}</span></div>
{banner}
<p class="toc">{toc}</p>
{chr(10).join(item_html(spec, it) for it in spec["items"])}
{spec.get("closing", "")}
<h2 id="fb">Feedback</h2>
<p>This block is generated from your choices above. Copy it and paste it into the chat.</p>
<textarea id="feedback" readonly></textarea>
<div id="summary"><span class="st" id="status">No decisions yet.</span><button id="copy">Copy feedback</button></div>
<script>{JS % (json.dumps(ids), json.dumps(spec.get("key", spec["title"])))}</script>
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
