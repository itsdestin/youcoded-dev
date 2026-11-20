#!/usr/bin/env python3
"""Builds the listening page for the versions of the playful "Felt and pulse" piece.

    python3 scripts/campaign/make-playful-review.py  ->  ~/Documents/youcoded-campaign/sound/playful.html

WHY: Destin was unsure what he disliked behind the piano ("the kickdrum or whatever the sound is in
the back"), so the page groups versions that REMOVE one thing (to find the culprit) apart from
versions that try a new backing, each with a quick yes/maybe/no. Answers come back by copy and paste.
"""
import html, os
OUT = os.path.expanduser("~/Documents/youcoded-campaign/sound/playful.html")
e = html.escape
GROUPS = [
 ("Start here: find what bothers you", "The original, then the same piece with one thing taken out each time.", [
  ("0-original", "Original", "The playful demo as you heard it."),
  ("1-no-kick", "No kick drum", "Only the low thud on each beat is removed."),
  ("2-no-drums", "No drums at all", "Piano, bass and soft background only."),
  ("3-no-pulse", "No pumping", "The drums stay; the background stops swelling and ducking in time.")]),
 ("Synth, strings and piano", "The energy behind the piano comes from instruments instead of drums.", [
  ("9-synth-arp", "Synth arp", "A warm, bubbling run of synth notes that brightens as it goes, with the softest thump."),
  ("10-synth-bass-drive", "Synth bass drive", "A bouncing, slightly gritty synth bass line, with tiny ticks."),
  ("11-strings-staccato", "Strings, short and bouncing", "Violin, viola and cello playing short notes. No drums."),
  ("12-strings-pizzicato", "Strings, plucked", "Light and witty. No drums."),
  ("13-strings-swell", "Strings, long swells", "No rhythm at all; long string lines rise under the piano."),
  ("14-two-pianos", "Two pianos", "A second, muted piano plays the rhythm. No drums."),
  ("15-piano-and-synth-hybrid", "Piano and synth together", "Second piano, a light synth pattern and a soft thump twice a bar. The composer's pick.")]),
 ("Gentler or different drums", "Still a beat, but not the original kick.", [
  ("4-soft-thump", "Soft thump", "A muffled, felt-like thump with light brushes."),
  ("5-piano-is-the-drum", "The piano is the drum", "Muted low notes and knocks on the piano's body; key clicks as the tick."),
  ("6-deep-sub", "Deep bass note", "One long, soft, deep note starts each bar, with tiny ticks on top."),
  ("7-clockwork", "Clockwork", "Dry ticks and tocks, like the typing sound grown into a rhythm."),
  ("8-half-time", "Half-time", "One deep soft thump per bar; relaxed, lots of space.")]),
]
def row(k, t, d):
    btns = "".join(f'<button type="button" class="pick" data-k="{k}" data-v="{v}">{v}</button>' for v in ["Yes", "Maybe", "No"])
    return f'<div class="row" data-label="{e(t)}" data-k="{k}"><div class="txt"><b>{e(t)}</b><span>{e(d)}</span></div><audio controls preload="none" src="playful/{k}.mp3"></audio><div class="opts">{btns}</div></div>'
body = "".join(f'<section class="card" data-title="{e(g)}"><h2>{e(g)}</h2><p class="sub">{e(s)}</p>{"".join(row(*r) for r in rows)}</section>' for g, s, rows in GROUPS)
PAGE = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>youcoded playful sound</title><style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:32px 16px 120px; }}
h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }} h2 {{ font-size:22px; letter-spacing:-.03em; margin:0; }}
.sub, .lede {{ color:var(--text2); margin:4px 0 10px; }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
.row {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--line); }}
.txt {{ flex:1 1 230px; }} .txt span {{ display:block; font-size:13px; color:var(--text2); }}
audio {{ flex:1 1 260px; height:36px; max-width:100%; }} .opts {{ display:flex; gap:6px; }}
button {{ font:inherit; cursor:pointer; border-radius:999px; padding:6px 12px; border:1px solid var(--line); background:transparent; color:var(--text); }}
button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }}
textarea {{ width:100%; min-height:90px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }}
.bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }} #done {{ color:var(--text2); }}
</style></head><body><main>
<h1>the playful sound: <b>16 ways</b></h1>
<p class="lede">Every clip is the same 20 seconds: same piano tune, same ending on the sound logo. Only what sits behind the piano changes. Tap Yes, Maybe or No on any you have a view on, then press <b>Copy my notes</b> and paste into our chat.</p>
{body}
<section class="card" data-title="Overall"><h2>Overall</h2><p class="sub">Which one or two should become the playful sound? Anything to combine?</p><textarea data-k="notes" placeholder="For example: 14 but with the bass from 10"></textarea></section>
</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div>
<script>
const KEY='youcoded-playful-review'; let state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}}}};
document.querySelectorAll('.pick').forEach((b)=>{{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{{b.classList.add('on');state[b.dataset.k]=b.dataset.v;}} save(); }}; }});
const t=document.querySelector('textarea'); t.value=state.notes||''; t.oninput=()=>{{state.notes=t.value;save();}};
// WHY: starting one clip stops the others, so two never play at once while comparing.
document.querySelectorAll('audio').forEach((a)=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach((o)=>{{if(o!==a)o.pause();}})));
document.getElementById('copy').onclick=async()=>{{ const lines=['Playful sound review']; document.querySelectorAll('.row').forEach((r)=>{{ if(state[r.dataset.k]) lines.push('- '+r.dataset.label+': '+state[r.dataset.k]); }}); if(t.value.trim()) lines.push('- Notes: '+t.value.trim());
 const text=lines.join('\\n'); try{{await navigator.clipboard.writeText(text)}}catch(e){{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}} document.getElementById('done').textContent='Copied. Paste it into our chat.'; }};
</script></body></html>'''
open(OUT, "w").write(PAGE); print(OUT)
