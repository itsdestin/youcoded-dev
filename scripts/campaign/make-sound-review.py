#!/usr/bin/env python3
"""Builds the listening page for the four candidate "sounds of youcoded".

    python3 scripts/campaign/make-sound-review.py   ->   ~/Documents/youcoded-campaign/sound/listen.html

WHY one page with the same nine clips per candidate: Destin picks the brand's sound by ear, so
the candidates must be comparable like for like (same logo/tune/demo slots), with a place to say
what he would keep from each. WHY "copy my notes": a plain file page cannot save to disk, so his
answers come back through the chat; they are also kept in the browser between visits.
"""
import html, os

OUT = os.path.expanduser("~/Documents/youcoded-campaign/sound/listen.html")
e = html.escape

CANDS = [
    ("felt-and-pulse", "Felt and pulse",
     "A soft, close piano is the person; clean electronics are the machine quietly doing what the person asks. The tune is three notes, in the rhythm of \"you-co-ded\", echoed back by a glass-like pluck.",
     "One real recording: a living-room upright piano (public domain). Everything else built in code.",
     ["The piano's softness is simulated, so repeated notes may sound mechanical.", "The marker sound may come across as a \"shh\" more than a pen.", "The playful demo is busy; the tune may be hard to pick out."]),
    ("music-box-machine", "The music-box machine",
     "A tiny wind-up music box plays a short tune, and a deep modern bass and drum machine underneath turns it into something big. One cheeky raised note lifts into the top, in every piece.",
     "Built entirely in code. No recordings.",
     ["The music box may sound too clean: no little mechanical noises.", "The grand section may sound plain where it should sound rich.", "The quiet opening ticks of the stark demo may be hard to hear on a phone."]),
    ("many-hands", "Many hands",
     "One person plays a tiny tune and more and more people answer with hands and voices until it sounds like a whole room. The signature is two claps answering the tune.",
     "Real recordings of harp, marimba, hand drums and finger snaps (all public domain). Claps and voices built in code.",
     ["The humming voices are the part most likely to sound artificial, especially the first five seconds of the hopeful demo.", "The claps are built in code; a real recorded crowd would convince more.", "A harp played short stands in for a guitar."]),
    ("open-air", "Open air",
     "A door opening onto a bright morning: four rising notes answered by four more, ending on a note that still feels like it is going somewhere. A glass bell leads, over wide shimmering chords and big soft drums that arrive late.",
     "Built entirely in code. No recordings.",
     ["The \"sung\" lead and bright chords are the parts most likely to sound fake or harsh.", "The first half of the stark demo is plain beeps; it may read as a test tone.", "The logo's sparkle may be soft where it should be crisp."]),
]
CLIPS = [("logo", "Sound logo", "plays when the youcoded name appears"), ("motif", "The tune on its own", "simple enough to hum"),
         ("demo-hopeful", "Hopeful demo", "30 s, for a narrated film"), ("demo-playful", "Playful demo", "20 s, for a product film"),
         ("demo-stark", "Stark demo", "12 s, turns bright at 7 s, for a type film")]
SFX = [("sfx-type-tick", "Key tick"), ("sfx-change", "Something changes"), ("sfx-arrive", "Something appears"), ("sfx-strike", "Marker stroke")]


def picks(key, label, options):
    btns = "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in options)
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">{btns}</div></div>'


def cand(key, title, idea, how, weak):
    clips = "".join(f'<div class="clip"><div><b>{e(l)}</b><span>{e(s)}</span></div><audio controls preload="none" src="{key}/{f}.mp3"></audio></div>' for f, l, s in CLIPS)
    sfx = "".join(f'<div class="sfx"><span>{e(l)}</span><audio controls preload="none" src="{key}/{f}.mp3"></audio></div>' for f, l in SFX)
    weak_html = "".join(f"<li>{e(w)}</li>" for w in weak)
    return f'''<section class="card" data-title="{e(title)}">
  <h2>{e(title)}</h2><p class="sub">{e(idea)}</p><p class="how">{e(how)}</p>
  {clips}
  <details><summary>The four small sounds</summary><div class="sfxgrid">{sfx}</div></details>
  <details><summary>What its composer thinks is weak (nobody has heard it yet)</summary><ul>{weak_html}</ul></details>
  {picks(key + "-rate", "How close is this to the sound of youcoded?", ["This is it", "Close", "Has something", "No"])}
  {picks(key + "-logo", "Its sound logo?", ["Love", "Fine", "No"])}
  <textarea data-k="{key}-notes" placeholder="What you would keep from this one, and what you would lose"></textarea>
</section>'''


PAGE = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>the sound of youcoded</title>
<style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:32px 16px 120px; }}
h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }}
h2 {{ font-size:24px; letter-spacing:-.03em; margin:0; }}
.sub, .lede {{ color:var(--text2); margin:4px 0 8px; }} .how {{ font-size:14px; color:var(--text2); margin:0 0 14px; }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
.clip {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:8px 0; border-top:1px solid var(--line); }}
.clip div {{ flex:1 1 220px; }} .clip span {{ display:block; font-size:13px; color:var(--text2); }}
audio {{ flex:1 1 300px; height:36px; max-width:100%; }}
.sfxgrid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; margin-top:10px; }} .sfx span {{ display:block; font-size:14px; }} .sfx audio {{ width:100%; }}
.opts {{ display:flex; flex-wrap:wrap; gap:8px; }}
button {{ font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); }}
button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }}
.q {{ margin:14px 0 0; }} .q p {{ margin:0 0 6px; font-weight:700; }}
textarea {{ width:100%; min-height:80px; margin-top:16px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
details {{ margin:12px 0 0; color:var(--text2); }} summary {{ cursor:pointer; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }}
.bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }}
#done {{ color:var(--text2); }}
</style></head><body><main>
<h1>the sound of <b>youcoded</b></h1>
<p class="lede">Four candidates for one consistent sound across all our marketing, each made from scratch by a different composer. Each has the same kit: a sound logo, a tune, three demos and four small sounds. Listen, tap your answers, then press <b>Copy my notes</b> and paste into our chat. Mixing parts from different candidates is a fine answer.</p>
{"".join(cand(*c) for c in CANDS)}
<section class="card" data-title="Overall">
  <h2>Overall</h2>
  {picks("overall-pick", "Which one do we build on?", [c[1] for c in CANDS] + ["A mix", "None, try again"])}
  {picks("overall-quality", "Does the best of these sound polished enough?", ["Yes", "Nearly", "No, it still sounds cheap"])}
  {picks("overall-eleven", "Try the paid music generator on your voice account for comparison clips?", ["Yes, try it", "Not yet", "No"])}
  <textarea data-k="overall-notes" placeholder="What the youcoded sound should be, in your words. Any music you would point to as a reference."></textarea>
</section>
</main>
<div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div>
<script>
// WHY try/catch around storage: some viewers block it; the page must still work without remembering.
const KEY = 'youcoded-sound-review';
let state = {{}};
try {{ state = JSON.parse(localStorage.getItem(KEY) || '{{}}'); }} catch (e) {{}}
const save = () => {{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}} }};
document.querySelectorAll('.pick').forEach((b) => {{
  if (state[b.dataset.k] === b.dataset.v) b.classList.add('on');
  b.onclick = () => {{
    const was = b.classList.contains('on');
    document.querySelectorAll('.pick[data-k="' + b.dataset.k + '"]').forEach((x) => x.classList.remove('on'));
    if (was) delete state[b.dataset.k]; else {{ b.classList.add('on'); state[b.dataset.k] = b.dataset.v; }}
    save();
  }};
}});
document.querySelectorAll('textarea').forEach((t) => {{ t.value = state[t.dataset.k] || ''; t.oninput = () => {{ state[t.dataset.k] = t.value; save(); }}; }});
// WHY: starting one clip stops the others, so two never play over each other while comparing.
document.querySelectorAll('audio').forEach((a) => a.addEventListener('play', () => document.querySelectorAll('audio').forEach((o) => {{ if (o !== a) o.pause(); }})));
document.getElementById('copy').onclick = async () => {{
  const lines = ['Sound review'];
  document.querySelectorAll('section.card').forEach((s) => {{
    const part = [];
    s.querySelectorAll('.q').forEach((qd) => {{ if (state[qd.dataset.k]) part.push('- ' + qd.dataset.label + ' ' + state[qd.dataset.k]); }});
    const t = s.querySelector('textarea'); if (t && t.value.trim()) part.push('- Notes: ' + t.value.trim());
    if (part.length) lines.push('', s.dataset.title, ...part);
  }});
  const text = lines.join('\\n'), done = document.getElementById('done');
  try {{ await navigator.clipboard.writeText(text); }} catch (e) {{ const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }}
  done.textContent = 'Copied. Paste it into our chat.';
}};
</script></body></html>'''
open(OUT, "w").write(PAGE)
print(OUT)
