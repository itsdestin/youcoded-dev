#!/usr/bin/env python3
"""Builds the round-four review page: the faster Own everything, Make it mine with its music, and the two
fairytale films after their scene-by-scene polish rounds.

    python3 scripts/campaign/make-review-r4.py  ->  ~/Documents/youcoded-campaign/round4/review.html

WHY one page: Destin reviews by tapping answers and pasting them into chat ("Copy my notes"); a plain file
page cannot save to disk. WHY tabs on Own everything: the versions differ only in music, so switching keeps
the film at the same moment.
"""
import html, os
e = html.escape
OUT = os.path.expanduser("~/Documents/youcoded-campaign/round4/review.html")
def picks(key, label, opts):
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">' + "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in opts) + '</div></div>'
def card(title, sub, body, key, ph="Notes; give the second if you can"):
    return f'<section class="card" data-title="{e(title)}"><h2>{e(title)}</h2><p class="lede">{sub}</p>{body}<textarea data-k="{key}-notes" placeholder="{e(ph)}"></textarea></section>'
TABS = [("Gentler", "own-everything/tall-fast-gentler.mp4"), ("Barest", "own-everything/tall-fast-barest.mp4"), ("Music as before", "own-everything/tall-fast-as-before.mp4"), ("Wide, gentler", "own-everything/wide-fast-gentler.mp4")]
tb = "".join(f'<button type="button" class="tab{" on" if i == 0 else ""}" data-src="{s}">{e(l)}</button>' for i, (l, s) in enumerate(TABS))
vid = lambda s: f'<video controls preload="metadata" src="{s}"></video>'
BODY = (
 card("Own everything, 18 seconds", "Was 24 seconds. Same film, played faster, with the struck poster still held long enough to read. Three strengths of music; the buttons keep your place.",
      f'<div class="tabs">{tb}</div><video id="own" controls preload="metadata" src="{TABS[0][1]}"></video>'
      + picks("own-speed", "The speed?", ["Right", "Still too slow", "Too fast now"])
      + picks("own-music", "Which music?", ["Gentler", "Barest", "Music as before", "None are right"])
      + picks("own-fade", "The colour change between the words?", ["Smooth", "Still not right"])
      + picks("own-done", "Is this film finished?", ["Yes", "After changes"]), "own")
 + card("Make it mine, with music", 'The second request is now "actuallyyy gimme desert. i\'m an ASU boy". First time with songbook music: one playful song that grows a little when the home screen arrives, again at the money screen, and at the closing lines. No typing or other sound effects.',
      vid("make-it-mine.mp4")
      + picks("mim-line", "The new line?", ["Good", "Change it"])
      + picks("mim-music", "The music?", ["Yes", "Nearly", "No"])
      + picks("mim-sfx", "Sound effects?", ["None is right", "Add very soft typing", "Add soft sounds when screens change"])
      + picks("mim-done", "Is this film finished?", ["Yes", "After changes"]), "mim")
 + card("Fairytale: the living storybook", "Interim cut, narrator only. New: a dark wooden desk in place of the flat purple, lighter and cleaner paper, larger chapter titles, headlines on a paper plate, and redrawn scenes. A stronger second pass is running now.",
      vid("fairytale-book.mp4")
      + picks("book-bg", "The desk background?", ["Better", "Still wrong"])
      + picks("book-paper", "The paper?", ["Better", "Still wrong"])
      + picks("book-head", "The chapter titles?", ["Better", "Still wrong"])
      + picks("book-dir", "Overall direction?", ["Getting there", "Still cheap", "Wrong direction"]), "book", "Which scenes still do not make sense or feel cheap; give the second")
 + card("Fairytale: the wall of screens", 'Interim cut, narrator only. New: after the turn, the screens show real youcoded windows in real themes with real pages; the invented "ask" bar is gone and people type in the app\'s own message box; typing and pointers redone. A stronger second pass is running now.',
      vid("fairytale-screens.mp4")
      + picks("scr-windows", "The real windows on the screens?", ["Right", "Better, not there", "No"])
      + picks("scr-ask", "The asking moments and typing?", ["Right", "Better, not there", "No"])
      + picks("scr-ptr", "The pointers?", ["Right", "Still strange", "Remove them"])
      + picks("scr-dir", "Overall direction?", ["Getting there", "Still cheap", "Wrong direction"]), "scr", "What still feels off; give the second"))
CSS = """:root { --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }
@media (prefers-color-scheme: dark) { :root { --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; } }
* { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }
main { max-width:960px; margin:0 auto; padding:32px 16px 120px; } h1 { font-size:32px; letter-spacing:-.04em; margin:0 0 4px; } h1 b { color:var(--purple); } h2 { font-size:24px; letter-spacing:-.03em; margin:0; }
.lede { color:var(--text2); margin:4px 0 12px; } .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }
video { width:100%; max-height:76vh; background:#000; border-radius:10px; display:block; } .tabs,.opts { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
button { font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); } button.on { background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; } .q { margin:14px 0 0; } .q p { margin:0 0 6px; font-weight:700; }
textarea { width:100%; min-height:80px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }
.bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; } .bar button { background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; } #done { color:var(--text2); }"""
JS = """const KEY='youcoded-round4'; let state={}; try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}};
document.querySelectorAll('.pick').forEach((b)=>{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{b.classList.add('on');state[b.dataset.k]=b.dataset.v;} save(); }; });
document.querySelectorAll('textarea').forEach((t)=>{ t.value=state[t.dataset.k]||''; t.oninput=()=>{state[t.dataset.k]=t.value;save();}; });
const v=document.getElementById('own'); document.querySelectorAll('.tab').forEach((b)=>{ b.onclick=()=>{ document.querySelectorAll('.tab').forEach((x)=>x.classList.remove('on')); b.classList.add('on'); const at=v.currentTime, playing=!v.paused; v.src=b.dataset.src;
 // WHY keep the time: comparing music means hearing the same moment again.
 v.addEventListener('loadedmetadata',()=>{ v.currentTime=Math.min(at,v.duration||at); if(playing) v.play(); },{once:true}); }; });
// WHY: starting one film pauses the others, so two never play at once.
document.querySelectorAll('video').forEach((a)=>a.addEventListener('play',()=>document.querySelectorAll('video').forEach((o)=>{ if(o!==a) o.pause(); })));
document.getElementById('copy').onclick=async()=>{ const lines=['Round four review']; document.querySelectorAll('section.card').forEach((s)=>{ const part=[]; s.querySelectorAll('.q').forEach((q)=>{ if(state[q.dataset.k]) part.push('- '+q.dataset.label+' '+state[q.dataset.k]); }); const t=s.querySelector('textarea'); if(t&&t.value.trim()) part.push('- Notes: '+t.value.trim()); if(part.length) lines.push('',s.dataset.title,...part); });
 const text=lines.join('\\n'); try{await navigator.clipboard.writeText(text)}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();} document.getElementById('done').textContent='Copied. Paste it into our chat.'; };"""
PAGE = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>youcoded films: round four</title><style>' + CSS + '</style></head><body><main>'
        '<h1>youcoded films: <b>round four</b></h1><p class="lede">Tap your answers, add notes, then press Copy my notes and paste into our chat.</p>' + BODY
        + '</main><div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>' + JS + '</script></body></html>')
open(OUT, "w").write(PAGE); print(OUT)
