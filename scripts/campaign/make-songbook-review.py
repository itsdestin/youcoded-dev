#!/usr/bin/env python3
"""Builds the listening page for the youcoded songbook demos.

    python3 scripts/campaign/make-songbook-review.py  ->  ~/Documents/youcoded-campaign/sound/songbook.html

WHY: the songbook is the foundation for all the brand's music, so before any film is scored from it
Destin hears the same tune in every mood and says whether it holds together and whether each mood
is right. Answers come back by copy and paste (a file page cannot save).
"""
import html, os
OUT = os.path.expanduser("~/Documents/youcoded-campaign/sound/songbook.html")
e = html.escape
ITEMS = [
 ("journey", "The journey", "60 seconds. The test of the whole idea: one tune through every mood.", "songbook/demo-journey.mp3",
  "0 to 12 s stark and dark; 12 to 17 s a hush; 17 to 29 s hopeful, gathering speed; 29 to 45 s playful, the whole tune; 45 to 55 s triumphant, violin and piano together; then the sound logo.",
  ["Does it stay one song through the changes?", ["Yes", "Mostly", "No"]]),
 ("playful", "Playful", "30 seconds, quick. For product films.", "songbook/demo-playful.mp3",
  "A bar of the bounce alone; the first phrase with a second piano answering; strings and a soft synth join; then the lift, where a solo violin takes the tune.",
  ["Right for the playful mood?", ["Yes", "Nearly", "No"]]),
 ("hopeful", "Hopeful", "40 seconds, slower. Built to sit under a narrator, so the first half is deliberately held back.", "songbook/demo-hopeful.mp3",
  "Two calm passages with the three-note signature over a rolling piano, strings joining; then the lift.",
  ["Right for the hopeful mood?", ["Yes", "Nearly", "No"]]),
 ("stark", "Stark, turning bright", "24 seconds. For type films like Own everything.", "songbook/demo-stark-to-bright.mp3",
  "Deadpan until 9 seconds: the tune over darker chords and a single slow repeated note. At 9 seconds the same tune comes back bright and builds.",
  ["Right for the stark mood, and does the turn work?", ["Yes", "Nearly", "No"]]),
 ("pianoend", "A piece ending on the piano-only logo", "16 seconds. Shows the quieter ending.", "songbook/example-piano-ending.mp3", "", ["Does this ending work?", ["Yes", "Nearly", "No"]]),
 ("logoalone", "The piano-only logo, alone", "As it would play with no other music.", "songbook/logo-alone.mp3", "", None),
]
def item(key, title, sub, src, what, q):
    qh = ""
    if q:
        btns = "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{v}">{v}</button>' for v in q[1])
        qh = f'<div class="q" data-label="{e(q[0])}" data-k="{key}"><p>{e(q[0])}</p><div class="opts">{btns}</div></div>'
    return f'<section class="card" data-title="{e(title)}"><h2>{e(title)}</h2><p class="sub">{e(sub)}</p><audio controls preload="none" src="{src}"></audio>{f"<p class=what>{e(what)}</p>" if what else ""}{qh}<textarea data-k="{key}-notes" placeholder="What works, what does not; give the second if you can"></textarea></section>'
def picks(key, label, options):
    btns = "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in options)
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">{btns}</div></div>'
PAGE = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>the youcoded songbook</title><style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:32px 16px 120px; }} h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }} h2 {{ font-size:23px; letter-spacing:-.03em; margin:0; }}
.sub, .lede, .what {{ color:var(--text2); margin:4px 0 12px; }} .what {{ font-size:14px; margin-top:10px; }} .card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
audio {{ width:100%; }} .opts {{ display:flex; flex-wrap:wrap; gap:8px; }} button {{ font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); }}
button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }} .q {{ margin:14px 0 0; }} .q p {{ margin:0 0 6px; font-weight:700; }}
textarea {{ width:100%; min-height:70px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }} .bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }} #done {{ color:var(--text2); }}
</style></head><body><main>
<h1>the youcoded <b>songbook</b></h1>
<p class="lede">One tune, built from the three versions you liked, played in every mood the brand needs. Every piece of marketing music would be assembled from these same parts. No drums, no clacks, no jingles, no whooshes. Listen to the journey first. Tap, type, then <b>Copy my notes</b>.</p>
{"".join(item(*i) for i in ITEMS)}
<section class="card" data-title="Overall"><h2>Overall</h2>
{picks("overall-tune", "The tune itself?", ["Love it", "Good", "Not memorable enough", "No"])}
{picks("overall-bright", "Brightness: three composers warned it might sound soft or muffled, so this version was brightened. How does it sound?", ["Right", "Still muffled", "Too glassy or thin"])}
{picks("overall-go", "Score the three films from this songbook now?", ["Yes", "After changes", "No"])}
<textarea data-k="overall-notes" placeholder="Anything the songbook needs before it is used for real"></textarea></section>
</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>
const KEY='youcoded-songbook-review'; let state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}}}};
document.querySelectorAll('.pick').forEach((b)=>{{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{{b.classList.add('on');state[b.dataset.k]=b.dataset.v;}} save(); }}; }});
document.querySelectorAll('textarea').forEach((t)=>{{ t.value=state[t.dataset.k]||''; t.oninput=()=>{{state[t.dataset.k]=t.value;save();}}; }});
// WHY: starting one clip stops the others, so two never play at once.
document.querySelectorAll('audio').forEach((a)=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach((o)=>{{if(o!==a)o.pause();}})));
document.getElementById('copy').onclick=async()=>{{ const lines=['Songbook review']; document.querySelectorAll('section.card').forEach((s)=>{{ const part=[]; s.querySelectorAll('.q').forEach((q)=>{{ if(state[q.dataset.k]) part.push('- '+q.dataset.label+' '+state[q.dataset.k]); }}); const t=s.querySelector('textarea'); if(t&&t.value.trim()) part.push('- Notes: '+t.value.trim()); if(part.length) lines.push('',s.dataset.title,...part); }});
 const text=lines.join('\\n'); try{{await navigator.clipboard.writeText(text)}}catch(e){{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}} document.getElementById('done').textContent='Copied. Paste it into our chat.'; }};
</script></body></html>'''
open(OUT, "w").write(PAGE); print(OUT)
