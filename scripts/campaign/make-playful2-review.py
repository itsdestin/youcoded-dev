#!/usr/bin/env python3
"""Builds the listening page for round two of the playful piece (and the sound-logo alternatives
once they exist).

    python3 scripts/campaign/make-playful2-review.py  ->  ~/Documents/youcoded-campaign/sound/round2.html

WHY: the version Destin picks here becomes the brand's songbook (its tune, chords and accompaniment
pattern), so the page asks which to build on and what to borrow from the others, in his words.
Sound logos are listed from whatever MP3s are in round2/logos/, so the page can be rebuilt as they arrive.
"""
import html, os, re
BASE = os.path.expanduser("~/Documents/youcoded-campaign/sound")
OUT = BASE + "/round2.html"
e = html.escape
SONGS = [
 ("pianos-1", "Two pianos, nothing else", "One piano sings the tune; the other bounces underneath and answers in the gaps. Halfway they swap, and the bounce drops lower.", "May sound thin on good speakers (little deep bass). The low bounce in the second half is the part most likely to feel thumpy."),
 ("pianos-2", "Two pianos and a warm synth", "A soft synth plays the bouncing pattern throughout, with a round low bass. In the second half the pianos sing the tune as a round, one a beat behind the other. Its composer's pick.", "The synth is the busiest part."),
 ("blend-1", "One becomes many", "The quieter one. A piano asks, a second piano answers after every phrase; plucked strings join, then held strings and a soft synth, then violins. Its composer's pick.", "May sound soft where it could sound crisp."),
 ("blend-2", "Mirror", "The bouncier one. The pianos trade whole bars; the second answers the signature upside down. Held strings from the start, plucked cellos and a soft bass join.", "The skipping rhythm may feel lopsided; the tune's quietest note only just leads."),
 ("chamber-1", "Pizzicato bounce", "Lighter. The piano plays the tune over plucked cellos and violas that bounce all the way through; plucked violins join the tune the second time, with long strings rising underneath.", "The darkest of the six; may sound a little muffled."),
 ("chamber-2", "Rocking piano, singing strings", "Warmer. The piano plays the tune over its own rocking left hand, then hands the tune to a solo violin and keeps rocking. Its composer's pick.", "Around 13.5 to 15 seconds the violin's quick notes may be buried under the piano."),
]
LOGO_NOTES = {}
notes_path = os.path.expanduser("~/youcoded-dev/worktrees/sessions/marketing-suite/scripts/campaign/sound/logo-alternatives/labels.txt")
def row(k, t, d, src, opts=("Yes", "Maybe", "No")):
    btns = "".join(f'<button type="button" class="pick" data-k="{k}" data-v="{v}">{v}</button>' for v in opts)
    return f'<div class="row" data-label="{e(t)}" data-k="{k}"><div class="txt"><b>{e(t)}</b><span>{e(d)}</span></div><audio controls preload="none" src="{src}"></audio><div class="opts">{btns}</div></div>'
songs = "".join(row(k, t, d + " Possible weak spot: " + w, f"round2/{k}.mp3") for k, t, d, w in SONGS)
logo_dir = BASE + "/round2/logos"
logos = ""
if os.path.isdir(logo_dir):
    labels = {}
    lp = logo_dir + "/labels.txt"
    if os.path.exists(lp):
        for line in open(lp):
            if "|" in line:
                a, b, c = (line.strip().split("|") + ["", ""])[:3]; labels[a] = (b, c)
    for f in sorted(os.listdir(logo_dir), key=lambda n: int(re.match(r"\d+", n).group()) if re.match(r"\d+", n) else 99):
        if f.endswith(".mp3"):
            k = f[:-4]; t, d = labels.get(k, (k, ""))
            logos += row("logo-" + k, t, d, f"round2/logos/{f}")
logo_section = f'<section class="card" data-title="Sound logo"><h2>The sound logo: alternatives</h2><p class="sub">Two to three seconds that play when the youcoded name appears. All land on the name at the same instant, so any can be swapped in.</p>{logos}<textarea data-k="logo-notes" placeholder="Which logo, or which parts of which"></textarea></section>' if logos else '<section class="card"><h2>The sound logo: alternatives</h2><p class="sub">Still being made. This page will be rebuilt when they arrive.</p></section>'
PAGE = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>youcoded playful sound, round two</title><style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:920px; margin:0 auto; padding:32px 16px 120px; }} h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }} h2 {{ font-size:22px; letter-spacing:-.03em; margin:0; }}
.sub, .lede {{ color:var(--text2); margin:4px 0 10px; }} .card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
.row {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px 0; border-top:1px solid var(--line); }} .txt {{ flex:1 1 260px; }} .txt span {{ display:block; font-size:13px; color:var(--text2); }}
audio {{ flex:1 1 250px; height:36px; max-width:100%; }} .opts {{ display:flex; gap:6px; flex-wrap:wrap; }}
button {{ font:inherit; cursor:pointer; border-radius:999px; padding:6px 12px; border:1px solid var(--line); background:transparent; color:var(--text); }} button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }}
textarea {{ width:100%; min-height:80px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }} .bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }} #done {{ color:var(--text2); }}
</style></head><body><main>
<h1>the playful sound, <b>round two</b></h1>
<p class="lede">Six new versions from three composers, written to your rulings: no drums, no clacks, no fake-outs or thwips, no stray high jingles, no bouncing volume. Each is one song, with a longer tune that grows out of "you-co-ded". The one you pick becomes the start of the brand's songbook. Tap, type, then <b>Copy my notes</b>.</p>
<section class="card" data-title="Playful versions"><h2>Six versions</h2><p class="sub">All 20 seconds, all ending on the current sound logo.</p>{songs}<textarea data-k="song-notes" placeholder="Which to build on, and what to borrow from the others (for example: the tune from one, the strings from another)"></textarea></section>
{logo_section}
</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>
const KEY='youcoded-playful2-review'; let state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}}}};
document.querySelectorAll('.pick').forEach((b)=>{{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{{b.classList.add('on');state[b.dataset.k]=b.dataset.v;}} save(); }}; }});
document.querySelectorAll('textarea').forEach((t)=>{{ t.value=state[t.dataset.k]||''; t.oninput=()=>{{state[t.dataset.k]=t.value;save();}}; }});
// WHY: starting one clip stops the others, so two never play at once while comparing.
document.querySelectorAll('audio').forEach((a)=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach((o)=>{{if(o!==a)o.pause();}})));
document.getElementById('copy').onclick=async()=>{{ const lines=['Playful round two review']; document.querySelectorAll('section.card').forEach((s)=>{{ const part=[]; s.querySelectorAll('.row').forEach((r)=>{{ if(state[r.dataset.k]) part.push('- '+r.dataset.label+': '+state[r.dataset.k]); }}); const t=s.querySelector('textarea'); if(t&&t.value.trim()) part.push('- Notes: '+t.value.trim()); if(part.length) lines.push('',s.dataset.title,...part); }});
 const text=lines.join('\\n'); try{{await navigator.clipboard.writeText(text)}}catch(e){{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}} document.getElementById('done').textContent='Copied. Paste it into our chat.'; }};
</script></body></html>'''
open(OUT, "w").write(PAGE); print(OUT)
