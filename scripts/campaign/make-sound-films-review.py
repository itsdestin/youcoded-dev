#!/usr/bin/env python3
"""Builds the page where Destin hears the chosen "Felt and pulse" sound doing real jobs.

    python3 scripts/campaign/make-sound-films-review.py  ->  ~/Documents/youcoded-campaign/sound/in-use.html

WHY a separate page from the candidates: this is the first test of ONE sound across three kinds of
film, so the questions are about whether it works in use (under a voice, on the beat, deadpan),
and each clip says plainly whether its picture is finished, so he judges the sound, not the picture.
"""
import html, os
OUT = os.path.expanduser("~/Documents/youcoded-campaign/sound/in-use.html")
e = html.escape
ITEMS = [
 ("own", "Own everything", "24 seconds. Picture is finished.", "video", "films/own-everything.mp4",
  "Deadpan single piano notes under \"you'll own nothing\"; the marker sound on the cross-out; it turns bright as \"everything.\" is written; one statement per bar; the sound logo on the youcoded name.",
  ["The last two seconds are silent while the name is still on screen; it may feel like the sound stopped early.", "The marker and handwriting sounds are the least convincing."]),
 ("fairy-sound", "The fairytale: narrator and music, no picture", "75 seconds. The purest test of the sound under your script.", "audio", "films/fairytale-sound-only.mp3",
  "Quiet and sly at the start; near-silence on \"However, recently...\"; the three signature notes land on \"something truly wonderful\"; one small wink before \"shareholder value\"; biggest on \"to open source everything\"; then the sound logo.",
  ["Her voice sets the overall loudness, so the mix only gets a little louder by the end even though the music grows a lot underneath.", "On the last word the music sits close to her voice; check she is still clear.", "Her level is raised slightly over the film, from hushed to triumphant. Nobody asked for that; say if it sounds wrong."]),
 ("fairy-pic", "The fairytale, over an unfinished picture", "The picture is mid-rework and not yet reviewed. Judge the sound.", "video", "films/fairytale-unfinished-picture.mp4", "", []),
 ("fairy-music", "The fairytale: the music on its own", "Without the narrator, to hear what is under her.", "audio", "films/fairytale-music-only.mp3", "", []),
 ("mine", "Make it mine, over the OLD picture", "60 seconds. This is the earlier cut you rejected (wrong app window, old themes); the new one is still being built. Judge the sound.", "video", "films/make-it-mine-old-picture.mp4",
  "Piano leading at 120 beats a minute; the \"something changes\" sound on the big look change; small accents as things appear; a sweet, drum-free moment for the email; a breath of near-silence, then the peak when everything is revealed; much quieter typing sounds.",
  ["This uses the playful backing with the kick drum you were unsure about. Your pick from the sixteen versions will replace it.", "The first big change and the final peak are nearly the same loudness."]),
]
def picks(key, label, options):
    btns = "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in options)
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">{btns}</div></div>'
def item(key, title, sub, kind, src, what, weak):
    media = f'<video controls preload="metadata" src="{src}"></video>' if kind == "video" else f'<audio controls preload="none" src="{src}"></audio>'
    w = f'<details><summary>What the composer thinks is weak</summary><ul>{"".join(f"<li>{e(x)}</li>" for x in weak)}</ul></details>' if weak else ""
    wh = f'<p class="what">{e(what)}</p>' if what else ""
    return f'<section class="card" data-title="{e(title)}"><h2>{e(title)}</h2><p class="sub">{e(sub)}</p>{media}{wh}{w}{picks(key + "-fit", "Does the sound work here?", ["Yes", "Nearly", "No"])}<textarea data-k="{key}-notes" placeholder="What works, what does not, a moment to change (give the second if you can)"></textarea></section>'
PAGE = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>felt and pulse, in use</title><style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:960px; margin:0 auto; padding:32px 16px 120px; }} h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }} h2 {{ font-size:23px; letter-spacing:-.03em; margin:0; }}
.sub, .lede, .what {{ color:var(--text2); margin:4px 0 12px; }} .what {{ font-size:14px; margin-top:10px; }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
video {{ width:100%; max-height:70vh; background:#000; border-radius:10px; display:block; }} audio {{ width:100%; }}
.opts {{ display:flex; flex-wrap:wrap; gap:8px; }} button {{ font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); }}
button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }} .q {{ margin:14px 0 0; }} .q p {{ margin:0 0 6px; font-weight:700; }}
textarea {{ width:100%; min-height:80px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
details {{ margin:10px 0 0; color:var(--text2); }} summary {{ cursor:pointer; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }}
.bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }} #done {{ color:var(--text2); }}
</style></head><body><main>
<h1>felt and pulse, <b>in use</b></h1>
<p class="lede">The sound you chose, scoring three real films. The same few notes end every film: that is the sound logo. Two of the pictures are not final and are marked; for those, judge the sound. Tap your answers, type anything else, then <b>Copy my notes</b>.</p>
{"".join(item(*i) for i in ITEMS)}
<section class="card" data-title="Overall"><h2>Overall</h2>{picks("overall-vision", "Now that you hear it in use, is this the sound of youcoded?", ["Yes", "Getting there", "No"])}{picks("overall-logo", "The sound logo at the end of each film?", ["Keep", "Change it", "Drop it"])}<textarea data-k="overall-notes" placeholder="What the sound still needs"></textarea></section>
</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>
const KEY='youcoded-sound-in-use'; let state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}}}};
document.querySelectorAll('.pick').forEach((b)=>{{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{{b.classList.add('on');state[b.dataset.k]=b.dataset.v;}} save(); }}; }});
document.querySelectorAll('textarea').forEach((t)=>{{ t.value=state[t.dataset.k]||''; t.oninput=()=>{{state[t.dataset.k]=t.value;save();}}; }});
// WHY: starting one clip stops the others, so two never play at once.
const media=[...document.querySelectorAll('audio,video')]; media.forEach((a)=>a.addEventListener('play',()=>media.forEach((o)=>{{if(o!==a)o.pause();}})));
document.getElementById('copy').onclick=async()=>{{ const lines=['Felt and pulse in use']; document.querySelectorAll('section.card').forEach((s)=>{{ const part=[]; s.querySelectorAll('.q').forEach((q)=>{{ if(state[q.dataset.k]) part.push('- '+q.dataset.label+' '+state[q.dataset.k]); }}); const t=s.querySelector('textarea'); if(t&&t.value.trim()) part.push('- Notes: '+t.value.trim()); if(part.length) lines.push('',s.dataset.title,...part); }});
 const text=lines.join('\\n'); try{{await navigator.clipboard.writeText(text)}}catch(e){{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}} document.getElementById('done').textContent='Copied. Paste it into our chat.'; }};
</script></body></html>'''
open(OUT, "w").write(PAGE); print(OUT)
