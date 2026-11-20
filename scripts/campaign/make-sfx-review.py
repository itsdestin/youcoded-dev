#!/usr/bin/env python3
"""Builds the listening page for the brand's sound-effects kit (14 sounds, three alternatives each).

    python3 scripts/campaign/make-sfx-review.py  ->  ~/Documents/youcoded-campaign/sound/effects.html

WHY: the kit is reused in every film, so Destin picks each sound once, by ear. Each row plays the
three alternatives side by side with A / B / C / None, and the composer's pick is marked so he can
agree quickly or overrule it. Answers come back by copy and paste (a file page cannot save).
"""
import html, os
OUT = os.path.expanduser("~/Documents/youcoded-campaign/sound/effects.html")
e = html.escape
# name, title, what it is for, [a, b, c descriptions], composer's pick, extra clips (label, file)
KIT = [
 ("key-press", "Key press", "One soft key; typing is many of them. Much quieter than the rest.", ["Real laptop keys, softened", "A real soft-switch keyboard, rounder", "A fingertip on felt with a tiny key ring; softest"], "a", [("typing A", "typing-demo-a"), ("typing B", "typing-demo-b"), ("typing C", "typing-demo-c")]),
 ("send", "Send", "A message being sent.", ["A card pushed across a table", "A soft brush of cotton", "The flick at the end of a page turn"], "a", []),
 ("reply-arrives", "Reply arrives", "A reply appearing in the chat.", ["A sheet of paper laid down", "Two soft taps on felt: knock knock", "A small leather pouch set down"], "b", []),
 ("appear", "Something appears", "A card or panel arriving on screen.", ["A card slid into place", "A soft fold of cotton landing", "A puff of air with a felt touch"], "a", []),
 ("change", "Something changes", "The look transforming. The hard one: no sweep allowed.", ["A cloth flipped over", "A rustle of cotton", "A warm breath of air over a low body; calmest"], "a", []),
 ("move", "Things rearrange", "Things sliding into a new layout.", ["A card pushed across felt", "A soft slide on felt ending in a tap", "A hand smoothing rough fabric"], "a", []),
 ("grow", "Something grows", "A control getting bigger; a soft pop of emphasis.", ["A firm fingertip pressing into felt", "Soft leather squeezed", "A soft rubbery \"puk\"; most like an app sound"], "a", []),
 ("marker-stroke", "Marker stroke", "A marker drawing one firm line on paper.", ["Grainy, uneven marker", "One long even line; most likely to sound like \"shh\"", "Gritty felt-tip; clearest pen"], "c", [("short A", "marker-stroke-short-a"), ("short B", "marker-stroke-short-b"), ("short C", "marker-stroke-short-c")]),
 ("handwriting", "Handwriting", "A pen writing a word, then a tap for the full stop.", ["Marker (same pen as marker C)", "Ballpoint, finer and scratchier", "Another pen, quieter in texture"], "a", []),
 ("page-turn", "Page turn", "A paper page turning, for the storybook film.", ["A full book page, one second", "A crisp turn, softened", "A quiet, slow turn"], "a", []),
 ("lock", "Lock", "Something being locked away.", ["A book cover closing", "A small latch inside a felt-lined box", "A soft made-up latch; may sound like a \"bonk\""], "b", []),
 ("unlock", "Unlock", "The same thing letting go.", ["A book cover opening", "The small latch releasing", "A soft made-up release"], "b", []),
 ("count-up", "Counting up", "Numbers counting up. Any fast regular sound risks reading as ticking.", ["Paper taps", "Felt taps", "A trickle of paper grains"], "b", []),
 ("reveal", "Big reveal", "Many things revealed at once; the largest sound in the kit. No whoosh allowed.", ["A large sheet of fabric settling", "A deep bloom of air and low warmth", "A dozen cards landing with a cloth"], "a", []),
]
def sound(name, title, what, descs, pick, extra):
    cells = ""
    for i, letter in enumerate("abc"):
        star = ' <em>composer\'s pick</em>' if letter == pick else ""
        cells += f'<div class="alt"><b>{letter.upper()}</b>{star}<span>{e(descs[i])}</span><audio controls preload="none" src="sfx/{name}-{letter}.mp3"></audio></div>'
    ex = "".join(f'<div class="alt small"><b>{e(l)}</b><audio controls preload="none" src="sfx/{f}.mp3"></audio></div>' for l, f in extra)
    btns = "".join(f'<button type="button" class="pick" data-k="{name}" data-v="{v}">{v}</button>' for v in ["A", "B", "C", "None of these"])
    return f'<section class="card" data-label="{e(title)}" data-k="{name}"><h2>{e(title)}</h2><p class="sub">{e(what)}</p><div class="alts">{cells}</div>{f"<div class=alts>{ex}</div>" if ex else ""}<div class="opts">{btns}</div></section>'
PAGE = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>youcoded sound effects</title><style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:1000px; margin:0 auto; padding:32px 16px 120px; }} h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }} h2 {{ font-size:21px; letter-spacing:-.03em; margin:0; }}
.sub, .lede {{ color:var(--text2); margin:4px 0 12px; }} .card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:18px 20px; margin:18px 0; }}
.alts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:12px; }} .alt span {{ display:block; font-size:13px; color:var(--text2); min-height:2.6em; }} .alt em {{ font-style:normal; font-size:12px; color:var(--purple); margin-left:6px; }} .alt.small span {{ min-height:0; }}
audio {{ width:100%; height:34px; }} .opts {{ display:flex; gap:8px; flex-wrap:wrap; }}
button {{ font:inherit; cursor:pointer; border-radius:999px; padding:6px 14px; border:1px solid var(--line); background:transparent; color:var(--text); }} button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }}
textarea {{ width:100%; min-height:90px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }} .bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }} #done {{ color:var(--text2); }}
</style></head><body><main>
<h1>the youcoded <b>sound effects</b></h1>
<p class="lede">Fourteen small sounds, three alternatives each, made from real paper, felt, fabric, pens and soft keys. They sit on top of the music and match what happens on screen. Nothing here is a tune, chime, whoosh, thwip, clap or clack. Pick one per sound (or "None of these"), then <b>Copy my notes</b>. They are short: turn the volume up a little.</p>
{"".join(sound(*k) for k in KIT)}
<section class="card"><h2>Anything else</h2><p class="sub">Sounds that are missing, or a feel the whole kit should have.</p><textarea data-k="notes" placeholder="For example: all a bit quiet; the pen should be scratchier; add a sound for ..."></textarea></section>
</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>
const KEY='youcoded-sfx-review'; let state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}}}};
document.querySelectorAll('.pick').forEach((b)=>{{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{{b.classList.add('on');state[b.dataset.k]=b.dataset.v;}} save(); }}; }});
const t=document.querySelector('textarea'); t.value=state.notes||''; t.oninput=()=>{{state.notes=t.value;save();}};
// WHY: starting one clip stops the others, so two never play at once while comparing.
document.querySelectorAll('audio').forEach((a)=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach((o)=>{{if(o!==a)o.pause();}})));
document.getElementById('copy').onclick=async()=>{{ const lines=['Sound effects review']; document.querySelectorAll('section.card[data-k]').forEach((s)=>{{ if(state[s.dataset.k]) lines.push('- '+s.dataset.label+': '+state[s.dataset.k]); }}); if(t.value.trim()) lines.push('- Notes: '+t.value.trim());
 const text=lines.join('\\n'); try{{await navigator.clipboard.writeText(text)}}catch(e){{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}} document.getElementById('done').textContent='Copied. Paste it into our chat.'; }};
</script></body></html>'''
open(OUT, "w").write(PAGE); print(OUT)
