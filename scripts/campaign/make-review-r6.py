#!/usr/bin/env python3
"""Builds the round-six review page: the two fairytale films rebuilt from the round-three drafts.

    python3 scripts/campaign/make-review-r6.py  ->  ~/Documents/youcoded-campaign/round6/review.html

WHY one page: Destin reviews by tapping answers and pasting them into chat ("Copy my notes"); a plain file
page cannot save to disk. WHY the round-three cut sits under each new one: he asked for a retry from those
drafts, so the honest test is whether each film is better than the cut he already liked.
"""
import html, os
e = html.escape
OUT = os.path.expanduser("~/Documents/youcoded-campaign/round6/review.html")
def picks(key, label, opts):
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">' + "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in opts) + '</div></div>'
def card(title, sub, body, key, ph="Notes; give the second if you can"):
    return f'<section class="card" data-title="{e(title)}"><h2>{e(title)}</h2><p class="lede">{sub}</p>{body}<textarea data-k="{key}-notes" placeholder="{e(ph)}"></textarea></section>'
vid = lambda s: f'<video controls preload="metadata" src="{s}"></video>'
old = lambda s: f'<details><summary>The round-three cut, to compare</summary>{vid(s)}</details>'
BODY = (
 card("Fairytale: the living storybook", "Rebuilt from the round-three draft, narrator only. The book floats over our poster colours: dark while the corporations rule, light from \"something wonderful\". Three named people are followed all the way through, and what is taken from each early on is what each gets back. No chapter headings or page numbers.",
      vid("fairytale-book.mp4") + old("../round3/fairytale-book.mp4")
      + picks("book-vs", "Against the round-three cut?", ["Better", "About the same", "Worse"])
      + picks("book-bg", "The background the book floats over?", ["Right", "Better, needs more depth", "Still flat"])
      + picks("book-paper", "The paper and the book itself?", ["Right", "Still cheap"])
      + picks("book-head", "No chapter headings at all?", ["Good", "Bring some back"])
      + picks("book-story", "Do the pictures follow the words?", ["Yes", "Mostly", "Still random in places"])
      + '<p class="lede" style="margin-top:18px">Background options (look only at the background; the drawings on these pages are from an earlier stage). Left: light throughout. Middle: dark throughout. Right: palest. The film uses dark then light.</p><img src="book-looks/all-three-side-by-side.png" alt="Three background options side by side">'
      + picks("book-look", "Which background?", ["Dark then light, as in the film", "Light throughout", "Dark throughout", "Palest", "None"]), "book", "Which moments still feel random, flat or cheap; give the second")
 + card("Fairytale: the wall of screens", "Rebuilt from the round-three draft, narrator only. No pointers anywhere. The corporations' new technology is an \"Assistant\" card in their own app with a price tag lowered onto it. One person types a real request into the real youcoded message box, and after that every screen is a real youcoded window in a different real theme. The padlocks, the price and the receipt from the start each come undone at the end.",
      vid("fairytale-screens.mp4") + old("../round3/fairytale-screens.mp4")
      + picks("scr-vs", "Against the round-three cut?", ["Better", "About the same", "Worse"])
      + picks("scr-windows", "The real windows and how they sit in the screens?", ["Right", "Better, not there", "No"])
      + picks("scr-ask", "The typing and asking moment?", ["Right", "Better, not there", "No"])
      + picks("scr-assistant", "The corporations' \"Assistant\" card (invented on purpose)?", ["Works", "Change it"])
      + picks("scr-story", "Do the pictures follow the words?", ["Yes", "Mostly", "Still random in places"]), "scr", "What still feels off; give the second"))
CSS = """:root { --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }
@media (prefers-color-scheme: dark) { :root { --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; } }
* { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }
main { max-width:960px; margin:0 auto; padding:32px 16px 120px; } h1 { font-size:32px; letter-spacing:-.04em; margin:0 0 4px; } h1 b { color:var(--purple); } h2 { font-size:24px; letter-spacing:-.03em; margin:0; }
.lede { color:var(--text2); margin:4px 0 12px; } .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }
video { width:100%; max-height:76vh; background:#000; border-radius:10px; display:block; } .tabs,.opts { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
button { font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); } button.on { background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; } .q { margin:14px 0 0; } .q p { margin:0 0 6px; font-weight:700; }
textarea { width:100%; min-height:80px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }
img { width:100%; border-radius:10px; display:block; } details { margin:10px 0; color:var(--text2); } summary { cursor:pointer; margin-bottom:8px; } .bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; } .bar button { background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; } #done { color:var(--text2); }"""
JS = """const KEY='youcoded-round6'; let state={}; try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}};
document.querySelectorAll('.pick').forEach((b)=>{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{b.classList.add('on');state[b.dataset.k]=b.dataset.v;} save(); }; });
document.querySelectorAll('textarea').forEach((t)=>{ t.value=state[t.dataset.k]||''; t.oninput=()=>{state[t.dataset.k]=t.value;save();}; });
// WHY: starting one film pauses the others, so two never play at once.
document.querySelectorAll('video').forEach((a)=>a.addEventListener('play',()=>document.querySelectorAll('video').forEach((o)=>{ if(o!==a) o.pause(); })));
document.getElementById('copy').onclick=async()=>{ const lines=['Round six review']; document.querySelectorAll('section.card').forEach((s)=>{ const part=[]; s.querySelectorAll('.q').forEach((q)=>{ if(state[q.dataset.k]) part.push('- '+q.dataset.label+' '+state[q.dataset.k]); }); const t=s.querySelector('textarea'); if(t&&t.value.trim()) part.push('- Notes: '+t.value.trim()); if(part.length) lines.push('',s.dataset.title,...part); });
 const text=lines.join('\\n'); try{await navigator.clipboard.writeText(text)}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();} document.getElementById('done').textContent='Copied. Paste it into our chat.'; };"""
PAGE = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>youcoded films: round six</title><style>' + CSS + '</style></head><body><main>'
        '<h1>youcoded films: <b>round six</b></h1><p class="lede">Tap your answers, add notes, then press Copy my notes and paste into our chat.</p>' + BODY
        + '</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>' + JS + '</script></body></html>')
open(OUT, "w").write(PAGE); print(OUT)
