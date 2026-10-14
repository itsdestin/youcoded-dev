#!/usr/bin/env python3
"""The Big picture switcher -> bigpicture.html. One view at a time in a frame, a switcher above.

WHY (Destin, 2026-10-14, vision-options choice deck): "i would want to be able to kinda switch
between any/all of them". The four views stay separate pages (each built by its own build.py from
facts.json) and this page only frames them. What you are looking at follows you across a switch:
a view reports its selection with postMessage, and the next view opens with #focus=<id>
(contract in ROUND2.md). Opened by file path; ?view=<name>&focus=<id> opens straight to a view.
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
CC = open(os.path.join(os.path.dirname(HERE), 'cc.css')).read()

# id, button word, the hover hint in plain words
VIEWS = [
    ('zoom', 'Systems', 'Every major system as a box, with each feature as a coloured square. Click a system to look inside it.'),
    ('journeys', 'Journeys', 'Things real people would do with the app, step by step: how far each gets today, and where it stops.'),
    ('stack', 'Foundations', 'What the big ideas rest on, from the ground up, and what to build next to unblock the most.'),
    ('wiring', 'How it works', "The app's real parts and how they connect. Follow a message, a sync or an install step by step."),
]

PAGE = r'''<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<title>Big picture</title>
<style>
/*CC*/
html,body{margin:0;height:100%;background:var(--panel);color:var(--fg);font-family:var(--font)}
.top{height:52px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 16px}
.ttl{font-size:14px;font-weight:500}
.focus{justify-self:end;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fg-dim);max-width:100%}
.focus b{font-weight:500;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22rem}
.focus[hidden]{display:none}
.frame{position:absolute;top:52px;left:10px;right:10px;bottom:10px;border-radius:var(--radius-xl);overflow:hidden;background:var(--canvas)}
iframe{width:100%;height:100%;border:0;display:block}
/* WHY a drawn hint, not title=: the operating system draws title= as its own grey box (round 3 rule);
   this copies the app's Tooltip look and timing as the main page does */
.tip{position:fixed;z-index:50;max-width:20rem;padding:4px 8px;font-size:11px;line-height:15px;color:var(--fg-2);
  background:var(--well);border:1px solid var(--edge);border-radius:var(--radius-md);box-shadow:var(--layer-shadow);
  pointer-events:none;opacity:0;transition:opacity 110ms}
.tip.on{opacity:1}
</style></head><body>
<div class="top">
  <div class="ttl">Big picture</div>
  <div class="tabs" role="tablist">/*BUTTONS*/</div>
  <div class="focus" id="focus" hidden><span>Looking at</span><b id="focusName"></b>
    <button class="btn sm ghost" id="clear" data-tip="Stop following this one thing; the next view opens on everything.">✕</button></div>
</div>
<div class="frame"><iframe id="view" title="Big picture view"></iframe></div>
<div class="tip" id="tip"></div>
<script>
const q = new URLSearchParams(location.search);
let view = q.get('view') || 'zoom', focus = q.get('focus') || null, focusTitle = '';
const frame = document.getElementById('view');
function show() {
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.view === view);
  frame.src = view + '/index.html' + (focus ? '#focus=' + encodeURIComponent(focus) : '');
  paintFocus();
}
function paintFocus() {
  const box = document.getElementById('focus');
  box.hidden = !focus;
  document.getElementById('focusName').textContent = focusTitle || focus || '';
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { if (b.dataset.view !== view) { view = b.dataset.view; show(); } });
document.getElementById('clear').onclick = () => { focus = null; focusTitle = ''; show(); };
// A view tells us what the person is looking at; we only remember it, so the NEXT view opens on it.
window.addEventListener('message', e => {
  const m = e.data;
  if (!m || m.bp !== 'focus') return;
  focus = m.id || null; focusTitle = m.id ? (m.title || '') : ''; paintFocus();
});
// hover hints: 800 ms before the first, 130 ms for a neighbour within 400 ms (the app's Tooltip timing)
const tip = document.getElementById('tip'); let timer, lastHide = 0;
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]'); if (!t) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    tip.textContent = t.dataset.tip; const r = t.getBoundingClientRect();
    tip.style.left = Math.max(12, Math.min(r.left, innerWidth - tip.offsetWidth - 12)) + 'px';
    tip.style.top = (r.bottom + 6) + 'px'; tip.classList.add('on');
  }, Date.now() - lastHide < 400 ? 130 : 800);
});
document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) { clearTimeout(timer); if (tip.classList.contains('on')) lastHide = Date.now(); tip.classList.remove('on'); } });
document.addEventListener('click', () => { clearTimeout(timer); tip.classList.remove('on'); });
show();
</script></body></html>'''

buttons = ''.join(f'<button role="tab" data-view="{v}" data-tip="{tip}">{word}</button>' for v, word, tip in VIEWS)
out = PAGE.replace('/*CC*/', CC).replace('/*BUTTONS*/', buttons)
open(os.path.join(HERE, 'bigpicture.html'), 'w').write(out)
print('wrote bigpicture.html')
