#!/usr/bin/env python3
"""Builds ONE review page for the whole campaign: <folder>/review.html.

WHY not the workspace review deck: that deck plays clips muted and shows cropped app screenshots;
an advert has to be judged with its sound, and posters are not app screens. This page sits beside
the finished files (films/, posters/, banners/), plays them in place, and lets Destin write a note
on each one and copy all notes out in one go to paste into chat.

usage: make-review.py <campaign folder>     (the folder holding films/ posters/ banners/)
"""
import html, json, subprocess, sys
from pathlib import Path

root = Path(sys.argv[1]).expanduser().resolve()
prev = root / "review-previews"
prev.mkdir(exist_ok=True)

def run(*a): subprocess.run(a, check=True)

# ---- small previews: the print poster alone is 4800x7200, far too heavy to page through ----
def preview(src: Path, max_side: int) -> str:
    out = prev / (src.stem + ".jpg")
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf",
            f"scale=w={max_side}:h={max_side}:force_original_aspect_ratio=decrease", "-q:v", "3", str(out))
    return f"review-previews/{out.name}"

def still(src: Path, t: float) -> str:
    out = prev / (src.stem + "-poster.jpg")
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        run("ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(src), "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "3", str(out))
    return f"review-previews/{out.name}"

FILMS = [
    ("F1", "hero60", "Main ad · 60 seconds", "YouTube and TV. The full argument: renting, asking, what you make is yours, everyone can change it.", 4.0, "wide"),
    ("F2", "hero30", "Main ad · 30-second cut", "The same story for shorter paid slots.", 2.5, "wide"),
    ("F3", "short-founder", "Short · founder", "20 s. “this app was built by someone who has never written code.”", 2.5, "tall"),
    ("F4", "short-rent", "Short · rent", "15 s. The rent argument, then a page in use.", 2.5, "tall"),
    ("F5", "short-house", "Short · house", "15 s. One sentence becomes a page that runs a home.", 5.5, "tall"),
    ("F6", "short-yours", "Short · yours", "15 s. One sentence changes the whole app's look.", 6.0, "tall"),
]
SIZES = [("social-4x5", "4:5 feed"), ("story-9x16", "9:16 story"), ("square", "Square"), ("landscape-16x9", "16:9"), ("link-1200x628", "Link preview"), ("print-24x36", "24×36 print")]
POSTERS = [
    ("P1", "own", "“software you own, not rent.”", "The campaign line, type only."),
    ("P2", "ask", "“build me a page that runs my house”", "The typed sentence and the page it made."),
    ("P3", "everyone", "“everyone who installs it can change it.”", "A wall of looks. These are the app's own themes, not things other users made."),
    ("P4", "quote", "Your quote, on dark", "Your words from the voice notes, punctuation tidied. Label above it is now “from the founder”."),
]
BANNERS = ["970x250", "728x90", "320x100", "320x50", "336x280", "300x250", "300x600", "160x600"]
DECISIONS = [
    ("D1", "The music", "Nobody has heard it. It was composed in code and only measured.",
     [("Keep it", "It sounds right to you."), ("Needs changes", "Say what is off in the note: too bright, too quiet, typing clicks, the ending.")], None),
    ("D2", "“pay forever. own nothing.”", "It echoes “own nothing and be happy”, which your vision doc quotes. One reviewer thought it could read as political.",
     [("Keep it", "It is the strongest line in the campaign and is your own framing."), ("Soften it", "For example “pay forever. keep nothing.” Safer, a little weaker.")], 0),
    ("D3", "The quote poster (P4)", "Two reviewers found the old label “time to fight back” shouty. The creative reviewer would not run this poster at all.",
     [("Run it with “from the founder”", "Calm, and nothing is put in your mouth."), ("Restore “time to fight back”", "Also your phrase, but you did not say it about this sentence."), ("Do not run it", "The other three designs carry the campaign.")], 0),
    ("D4", "The house claim on shorts and posters", "The two widescreen ads say “home control works with Home Assistant” in small print. The house short and three poster designs say “a page that runs your house” with no such note.",
     [("Add the note everywhere", "Honest everywhere. One more small line on those pieces."), ("Leave as is", "Cleaner, but a viewer may expect it to control devices with no set-up.")], 0),
    ("D5", "The wall of looks", "It sits under “everyone who installs it can change it”, but shows the app's own themes. One reviewer said it implies a bigger community than exists.",
     [("Keep it", "The sentence itself is true, and the wall is the clearest picture of it."), ("Fewer, larger tiles", "Reads as “many looks”, less as “a crowd”. Needs a re-cut of two films and one poster.")], 0),
    ("D6", "“Mac” in the platform line", "Your changelog says in one place that Mac downloads are verified, and in another that Mac users may see an “unverified developer” warning.",
     [("Mac users see no warning", "The line is fine as it is."), ("Mac users do see a warning", "Keep “Mac”, but worth fixing before paid ads send people there."), ("Not sure", "I will check the current build and tell you.")], None),
]

e = html.escape
parts = []

# ---- films ----
def film(card):
    fid, name, title, blurb, t, shape = card
    f = root / "films" / f"youcoded-{name}.mp4"
    return f"""<article class="card film {shape}" id="{fid}">
  <video controls preload="metadata" playsinline poster="{still(f, t)}" src="films/{f.name}"></video>
  <div class="meta"><span class="tag">{fid}</span><h3>{e(title)}</h3><p>{e(blurb)}</p>
  <p class="path">films/{f.name}</p>
  <textarea data-id="{fid}" data-label="{e(title)}" placeholder="Notes on {fid}. A time helps, e.g. “0:24 too slow”."></textarea></div>
</article>"""
parts.append('<section id="films"><h2>Films</h2><p class="lead">Play each with the sound on. Nobody has heard the music yet.</p>'
             + "".join(film(c) for c in FILMS[:2]) + '<div class="shorts">' + "".join(film(c) for c in FILMS[2:]) + "</div></section>")

# ---- posters: one design at a time, a row of size buttons above the picture ----
def poster(card):
    pid, idea, title, blurb = card
    tabs, imgs = [], []
    for i, (key, label) in enumerate(SIZES):
        src = root / "posters" / f"youcoded-{idea}-{key}.png"
        tabs.append(f'<button type="button" class="{"on" if i == 0 else ""}" data-show="{pid}-{key}">{e(label)}</button>')
        imgs.append(f'<a class="shot{" on" if i == 0 else ""}" id="{pid}-{key}" href="posters/{src.name}" target="_blank" title="Open the full-size file"><img loading="lazy" src="{preview(src, 1400)}" alt="{e(title)}, {e(label)}"></a>')
    return f"""<article class="card poster" id="{pid}">
  <div class="meta"><span class="tag">{pid}</span><h3>{e(title)}</h3><p>{e(blurb)}</p>
  <div class="tabs">{"".join(tabs)}</div>
  <p class="path">posters/youcoded-{idea}-&lt;size&gt;.png · click the picture for the full file</p>
  <textarea data-id="{pid}" data-label="{e(title)}" placeholder="Notes on {pid}. Name the size if it matters."></textarea></div>
  <div class="frame">{"".join(imgs)}</div>
</article>"""
parts.append('<section id="posters"><h2>Posters</h2><p class="lead">Four designs, six sizes each. Pick a size to see it.</p>' + "".join(poster(c) for c in POSTERS) + "</section>")

# ---- banners at the size they appear on a web page ----
bn = []
for b in BANNERS:
    w, h = b.split("x")
    src = root / "banners" / f"youcoded-banner-{b}.png"
    bn.append(f'<figure><img loading="lazy" width="{w}" height="{h}" src="{preview(src, 2000)}" alt="Banner {b}"><figcaption>{b}</figcaption></figure>')
parts.append(f"""<section id="banners"><h2>Web banners</h2><p class="lead">Shown at the size they appear on a web page.</p>
<article class="card" id="B1"><div class="banners">{"".join(bn)}</div>
<div class="meta"><span class="tag">B1</span><p class="path">banners/youcoded-banner-&lt;size&gt;.png</p>
<textarea data-id="B1" data-label="Web banners" placeholder="Notes on the banners. Name the size."></textarea></div></article></section>""")

# ---- decisions ----
def decision(d):
    did, title, why, opts, rec = d
    rows = "".join(
        f'<label class="opt"><input type="radio" name="{did}" value="{e(lab)}"><span><b>{e(lab)}</b>{" <i>my pick</i>" if i == rec else ""}<br>{e(note)}</span></label>'
        for i, (lab, note) in enumerate(opts))
    return f"""<article class="card decision" id="{did}"><div class="meta"><span class="tag">{did}</span><h3>{e(title)}</h3><p>{e(why)}</p>
  <div class="opts" data-id="{did}" data-label="{e(title)}">{rows}</div>
  <textarea data-id="{did}-note" data-label="{e(title)} (note)" placeholder="Anything to add."></textarea></div></article>"""
parts.append('<section id="decisions"><h2>Decisions for you</h2><p class="lead">Six things only you can settle.</p><div class="grid">' + "".join(decision(d) for d in DECISIONS) + "</div></section>")

CSS = """
:root{--bg:#F7F0FB;--panel:#fff;--lilac:#EFE3F6;--border:#C9B0DB;--ink:#21152C;--ink2:#43354E;--accent:#9750AA;--shadow:rgba(74,38,110,.14)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#140B1E;--panel:#1F1329;--lilac:#2A1B37;--border:#4A3660;--ink:#F3EAF9;--ink2:#B3A8BC;--accent:#C387D3;--shadow:rgba(0,0,0,.4)}}
:root[data-theme=dark]{--bg:#140B1E;--panel:#1F1329;--lilac:#2A1B37;--border:#4A3660;--ink:#F3EAF9;--ink2:#B3A8BC;--accent:#C387D3;--shadow:rgba(0,0,0,.4)}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--ink);font:500 16px/1.5 "DM Sans",system-ui,sans-serif}
header{padding:48px 16px 8px;max-width:1240px;margin:0 auto}
h1{font:900 clamp(34px,6vw,60px)/1 "DM Sans",system-ui,sans-serif;letter-spacing:-.05em;margin:0 0 12px;text-wrap:balance}
h1 em{font-style:normal;color:var(--accent)}
h2{font:900 34px/1.05 "DM Sans",system-ui,sans-serif;letter-spacing:-.045em;margin:0 0 4px}
h3{font:700 19px/1.25 "DM Sans",system-ui,sans-serif;letter-spacing:-.02em;margin:6px 0 4px}
p{margin:0 0 8px;color:var(--ink2);max-width:62ch}.lead{margin-bottom:20px}
nav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
nav div{max-width:1240px;margin:0 auto;padding:10px 16px;display:flex;gap:6px;align-items:center;overflow-x:auto}
nav a,button{font:600 14px/1 "DM Sans",system-ui,sans-serif;color:var(--ink);text-decoration:none;padding:9px 13px;border-radius:999px;border:1px solid transparent;background:none;cursor:pointer;white-space:nowrap}
nav a:hover{background:var(--lilac)}
nav .copy{margin-left:auto;background:var(--accent);color:var(--bg)}
main{max-width:1240px;margin:0 auto;padding:8px 16px 96px}section{padding-top:44px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:18px;margin-bottom:18px;box-shadow:0 10px 30px var(--shadow)}
.tag{display:inline-block;font:500 12px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.14em;color:var(--accent);border:1px solid var(--border);border-radius:6px;padding:5px 7px}
.path{font:500 12.5px/1.4 "JetBrains Mono",ui-monospace,monospace;color:var(--ink2);opacity:.85;overflow-wrap:anywhere}
video{width:100%;display:block;border-radius:12px;background:#140B1E}
.film.wide{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr);gap:20px;align-items:start}
.shorts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}.shorts .card{margin:0}.film.tall video{aspect-ratio:9/16}
.poster{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,1.5fr);gap:20px;align-items:start}
.frame{background:var(--lilac);border-radius:12px;padding:16px;display:grid;place-items:center;min-height:320px}
.shot{display:none}.shot.on{display:block}.shot img{display:block;max-width:100%;max-height:76vh;border-radius:6px;box-shadow:0 8px 26px var(--shadow)}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.tabs button{border-color:var(--border);padding:8px 11px}.tabs button.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
textarea{width:100%;min-height:76px;margin-top:8px;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--ink);font:500 15px/1.4 "DM Sans",system-ui,sans-serif;resize:vertical}
textarea:focus,button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.banners{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;overflow-x:auto;padding-bottom:6px}
figure{margin:0}figure img{display:block;max-width:none;box-shadow:0 4px 16px var(--shadow)}figcaption{font:500 12px/1 "JetBrains Mono",ui-monospace,monospace;color:var(--ink2);margin-top:8px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.grid .card{margin:0}
.opt{display:flex;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;margin-top:8px;cursor:pointer;color:var(--ink2)}
.opt b{color:var(--ink)}.opt i{font-style:normal;font-size:12px;color:var(--accent);border:1px solid var(--border);border-radius:999px;padding:1px 7px;margin-left:4px}
.opt:has(input:checked){border-color:var(--accent);background:var(--lilac)}input[type=radio]{accent-color:var(--accent);margin-top:4px}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:11px 16px;border-radius:999px;font-weight:600;opacity:0;pointer-events:none;transition:opacity .2s}#toast.on{opacity:1}
#out{display:none;width:100%;min-height:200px}
@media (max-width:900px){.film.wide,.poster,.grid{grid-template-columns:1fr}.shorts{grid-template-columns:repeat(2,minmax(0,1fr))}}
"""
JS = """
const KEY='youcoded-campaign-review';
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}};
document.querySelectorAll('textarea[data-id]').forEach(t=>{t.value=saved[t.dataset.id]||'';t.addEventListener('input',()=>{saved[t.dataset.id]=t.value;save()})});
document.querySelectorAll('.opts').forEach(g=>{g.querySelectorAll('input').forEach(r=>{if(saved[g.dataset.id]===r.value)r.checked=true;r.addEventListener('change',()=>{saved[g.dataset.id]=r.value;save()})})});
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{const c=b.closest('.poster');c.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));c.querySelectorAll('.shot').forEach(s=>s.classList.toggle('on',s.id===b.dataset.show))}));
// one film at a time: starting one pauses the others
document.querySelectorAll('video').forEach(v=>v.addEventListener('play',()=>document.querySelectorAll('video').forEach(o=>{if(o!==v)o.pause()})));
const toast=m=>{const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2600)};
document.getElementById('copy').addEventListener('click',async()=>{
  const lines=[];
  document.querySelectorAll('.opts').forEach(g=>{const r=g.querySelector('input:checked');if(r)lines.push(g.dataset.id+' '+g.dataset.label+': '+r.value)});
  document.querySelectorAll('textarea[data-id]').forEach(t=>{if(t.value.trim())lines.push(t.dataset.id+' '+t.dataset.label+': '+t.value.trim())});
  if(!lines.length){toast('Nothing written yet');return}
  const text='Campaign review notes\\n'+lines.join('\\n');
  try{await navigator.clipboard.writeText(text);toast('Copied. Paste it into chat.')}
  catch(e){const o=document.getElementById('out');o.style.display='block';o.value=text;o.focus();o.select();toast('Select all and copy the box at the bottom')}
});
"""
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Campaign Review</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700;900&family=JetBrains+Mono:wght@500&display=swap">
<style>{CSS}</style></head><body>
<header><h1>software you <em>own,</em> not rent.</h1>
<p>Everything in the campaign on one page: six films, four poster designs, eight web banners, and six decisions. Write a note under anything, then press <b>Copy my notes</b> and paste them into chat.</p></header>
<nav><div><a href="#films">Films</a><a href="#posters">Posters</a><a href="#banners">Banners</a><a href="#decisions">Decisions</a><button class="copy" id="copy" type="button">Copy my notes</button></div></nav>
<main>{"".join(parts)}<textarea id="out" readonly aria-label="Your notes, to copy"></textarea></main>
<div id="toast" role="status"></div>
<script>{JS}</script></body></html>"""
(root / "review.html").write_text(page)
print(root / "review.html")
