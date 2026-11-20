#!/usr/bin/env python3
"""Builds the round-three picture review page: three looks for the fairytale and the rebuilt Make it mine.

    python3 scripts/campaign/make-review-r3.py  ->  ~/Documents/youcoded-campaign/round3/review.html

WHY narrator-only and silent: the music is being rebuilt from the songbook, so these cuts carry no
score; Destin judges the PICTURES here, and above all picks which fairytale look to finish.
"""
import html, os
OUT = os.path.expanduser("~/Documents/youcoded-campaign/round3/review.html")
e = html.escape
def picks(key, label, options):
    btns = "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in options)
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">{btns}</div></div>'
FILMS = [
 ("book", "Fairytale: the living storybook", "A real open book in ink. The corporations are men in very tall top hats; ordinary people are small simple figures; the wonderful thing is a purple quill.", "fairytale-book.mp4",
  ["The outside reviewer's first choice: nearly every spoken line gets its own clear picture.", "Known weak: the three top hats sit on screen about 12 seconds in the middle; one drawn window has a message box that is not the real app's; the headlines move with the book; a dark flash before the closing card."]),
 ("town", "Fairytale: the paper town", "The reworked version of the one you saw. Padlocks snap onto people's things; a quill in the tower; the grey town blooms into colour at dawn.", "fairytale-town.mp4",
  ["The reviewer's second choice: the best ending, but dark, with detail too small for a phone.", "Known weak: the same wide town shot returns about five times; gloved arms with no body from 26 to 41 seconds; \"something wonderful happened\" plays over the dark towers."]),
 ("screens", "Fairytale: the wall of screens", "Modern and clean. Shelves of identical screens; padlocks; a price list; one \"ask\" box; the wall turns into different personal apps.", "fairytale-screens.mp4",
  ["The reviewer's last choice: it explains the product best but feels like a cold tech advert under a storybook voice.", "Known weak: about 13 near-static seconds in the middle; five of its six app looks were invented for the film and are not real themes."]),
]
def film(key, title, sub, src, notes):
    return f'<section class="card" data-title="{e(title)}"><h2>{e(title)}</h2><p class="sub">{e(sub)}</p><video controls preload="metadata" src="{src}"></video><ul class="notes">{"".join(f"<li>{e(n)}</li>" for n in notes)}</ul>{picks(key + "-like", "This look?", ["Finish this one", "Has good parts", "No"])}<textarea data-k="{key}-notes" placeholder="What to keep, what to lose, moments to fix (give the second if you can)"></textarea></section>'
PAGE = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>youcoded round three: pictures</title><style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:1000px; margin:0 auto; padding:32px 16px 120px; }} h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }} h2 {{ font-size:23px; letter-spacing:-.03em; margin:0; }}
.sub, .lede {{ color:var(--text2); margin:4px 0 12px; }} .notes {{ color:var(--text2); font-size:14px; padding-left:18px; }} .card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
video {{ width:100%; max-height:70vh; background:#000; border-radius:10px; display:block; }} .opts {{ display:flex; flex-wrap:wrap; gap:8px; }}
button {{ font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); }} button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }} .q {{ margin:14px 0 0; }} .q p {{ margin:0 0 6px; font-weight:700; }}
textarea {{ width:100%; min-height:80px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }} .bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }} #done {{ color:var(--text2); }}
</style></head><body><main>
<h1>round three: <b>the pictures</b></h1>
<p class="lede">Judge the pictures only. The fairytale clips have the narrator and no music; Make it mine is silent. Music comes from the songbook once you approve it. The fairytale clips use the previous script (with the hubris and shareholder-value lines), not your newest edit. The main decision: which fairytale look to finish. Tap, type, then <b>Copy my notes</b>.</p>
{"".join(film(*f) for f in FILMS)}
<section class="card" data-title="Make it mine"><h2>Make it mine, rebuilt</h2><p class="sub">Silent. The real app window with nothing hidden; real themes from your collection; much richer home and money screens.</p><video controls preload="metadata" src="make-it-mine-silent.mp4"></video>
<ul class="notes"><li>The look conversation now reads: "idk. kinda rainy anime tokyo type vibe? open to ideas", then "ok yeah. less gloomy tho", to match the two real themes used.</li><li>Home: favourites with sliders, thermostat dial, scenes, now playing. Money: net worth with a chart, cash, owed, a reminder, the bills list.</li></ul>
{picks("mine-window", "Is the app window right now?", ["Yes", "Nearly", "No"])}{picks("mine-themes", "The two themes?", ["Good", "Change them", "Drop the look change"])}{picks("mine-pages", "The home and money screens?", ["Rich enough", "Better, not there", "No"])}
<textarea data-k="mine-notes" placeholder="What works, what does not, moments to fix"></textarea></section>
</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>
const KEY='youcoded-r3-review'; let state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}}}};
document.querySelectorAll('.pick').forEach((b)=>{{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{{b.classList.add('on');state[b.dataset.k]=b.dataset.v;}} save(); }}; }});
document.querySelectorAll('textarea').forEach((t)=>{{ t.value=state[t.dataset.k]||''; t.oninput=()=>{{state[t.dataset.k]=t.value;save();}}; }});
// WHY: starting one film stops the others.
const media=[...document.querySelectorAll('video')]; media.forEach((a)=>a.addEventListener('play',()=>media.forEach((o)=>{{if(o!==a)o.pause();}})));
document.getElementById('copy').onclick=async()=>{{ const lines=['Round three picture review']; document.querySelectorAll('section.card').forEach((s)=>{{ const part=[]; s.querySelectorAll('.q').forEach((q)=>{{ if(state[q.dataset.k]) part.push('- '+q.dataset.label+' '+state[q.dataset.k]); }}); const t=s.querySelector('textarea'); if(t&&t.value.trim()) part.push('- Notes: '+t.value.trim()); if(part.length) lines.push('',s.dataset.title,...part); }});
 const text=lines.join('\\n'); try{{await navigator.clipboard.writeText(text)}}catch(e){{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}} document.getElementById('done').textContent='Copied. Paste it into our chat.'; }};
</script></body></html>'''
open(OUT, "w").write(PAGE); print(OUT)
