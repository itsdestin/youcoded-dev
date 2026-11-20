#!/usr/bin/env python3
"""Builds the review page for the new cut of "Own everything" with its three pen-sound versions.

    python3 scripts/campaign/make-own-everything-review.py  ->  ~/Documents/youcoded-campaign/round3/own-everything.html

WHY one player with buttons: the three versions differ only in the pen sound, so switching keeps the
film at the same moment and he compares like for like.
"""
import html, os
e = html.escape
OUT = os.path.expanduser("~/Documents/youcoded-campaign/round3/own-everything.html")
def picks(key, label, opts):
    return f'<div class="q" data-label="{e(label)}" data-k="{key}"><p>{e(label)}</p><div class="opts">' + "".join(f'<button type="button" class="pick" data-k="{key}" data-v="{e(o)}">{e(o)}</button>' for o in opts) + '</div></div>'
TABS = [("Soft pen", "own-everything/tall-soft-pen.mp4"), ("Softer still", "own-everything/tall-softer-pen.mp4"), ("No pen sounds", "own-everything/tall-no-pen.mp4"), ("Wide, soft pen", "own-everything/wide-soft-pen.mp4")]
tb = "".join(f'<button type="button" class="tab{" on" if i == 0 else ""}" data-src="{s}">{e(l)}</button>' for i, (l, s) in enumerate(TABS))
QS = (picks("pen", "Which pen sound?", ["Soft pen", "Softer still", "No pen sounds", "None are right"])
      + picks("below", 'The handwritten "everything." below "nothing."?', ["Yes", "No"])
      + picks("page", "One page building up?", ["Yes", "Nearly", "No"])
      + picks("end", "Ending as the poster?", ["Yes", "Go back to the separate closing card"])
      + picks("done", "Is this film finished?", ["Yes", "After changes"]))
CSS = """:root { --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }
@media (prefers-color-scheme: dark) { :root { --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; } }
* { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }
main { max-width:900px; margin:0 auto; padding:32px 16px 120px; } h1 { font-size:32px; letter-spacing:-.04em; margin:0 0 4px; } h1 b { color:var(--purple); }
.lede { color:var(--text2); margin:4px 0 12px; } .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }
video { width:100%; max-height:76vh; background:#000; border-radius:10px; display:block; } .tabs,.opts { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
button { font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); } button.on { background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; } .q { margin:14px 0 0; } .q p { margin:0 0 6px; font-weight:700; }
textarea { width:100%; min-height:80px; margin-top:14px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }
.bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; } .bar button { background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; } #done { color:var(--text2); }"""
JS = """const KEY='youcoded-own-everything-2'; let state={}; try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}};
document.querySelectorAll('.pick').forEach((b)=>{ if(state[b.dataset.k]===b.dataset.v)b.classList.add('on'); b.onclick=()=>{ const was=b.classList.contains('on'); document.querySelectorAll('.pick[data-k="'+b.dataset.k+'"]').forEach((x)=>x.classList.remove('on')); if(was)delete state[b.dataset.k]; else{b.classList.add('on');state[b.dataset.k]=b.dataset.v;} save(); }; });
const t=document.querySelector('textarea'); t.value=state.notes||''; t.oninput=()=>{state.notes=t.value;save();};
const v=document.querySelector('video'); document.querySelectorAll('.tab').forEach((b)=>{ b.onclick=()=>{ document.querySelectorAll('.tab').forEach((x)=>x.classList.remove('on')); b.classList.add('on'); const at=v.currentTime, playing=!v.paused; v.src=b.dataset.src;
 // WHY keep the time: comparing pen sounds means hearing the same moment again.
 v.addEventListener('loadedmetadata',()=>{ v.currentTime=Math.min(at,v.duration||at); if(playing) v.play(); },{once:true}); }; });
document.getElementById('copy').onclick=async()=>{ const lines=['Own everything, new cut']; document.querySelectorAll('.q').forEach((q)=>{ if(state[q.dataset.k]) lines.push('- '+q.dataset.label+' '+state[q.dataset.k]); }); if(t.value.trim()) lines.push('- Notes: '+t.value.trim());
 const text=lines.join('\\n'); try{await navigator.clipboard.writeText(text)}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();} document.getElementById('done').textContent='Copied. Paste it into our chat.'; };"""
PAGE = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>own everything: new cut</title><style>' + CSS + '</style></head><body><main>'
        '<h1>own everything: <b>new cut</b></h1><p class="lede">Your four changes: "everything." written below "nothing."; one page that builds up line by line; ending as the poster with the logo at the bottom; softer pen sounds. Switch between the pen versions with the buttons; the film keeps its place.</p>'
        '<section class="card"><div class="tabs">' + tb + '</div><video controls preload="metadata" src="' + TABS[0][1] + '"></video>' + QS
        + '<textarea data-k="notes" placeholder="Anything left to fix; give the second if you can"></textarea></section></main>'
        '<div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div><script>' + JS + '</script></body></html>')
open(OUT, "w").write(PAGE); print(OUT)
