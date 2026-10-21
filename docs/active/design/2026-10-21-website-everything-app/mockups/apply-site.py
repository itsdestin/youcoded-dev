#!/usr/bin/env python3
"""Apply the approved 2026-10-21 repositioning to the REAL landing page (youcoded/docs/index.html).

One-shot and idempotent-ish: it refuses to run twice (looks for its own marker). Everything it
writes is plain markup/CSS/JS that lives in index.html from then on; this script is the record of
how the edit was made, kept beside the mockups it grew out of (build.py).

What it changes, each tied to Destin's deck answers (website-everything-app.*.answers.json):
  about copy (Q-3/B-3), the ten feature cards in customization-first order with per-theme clips
  (Q-4/Q-5/Q-12/C-1), the drawn device card (B-3 round 2), sample labels on Home/Money (B-4 r2),
  the roadmap relabel (Q-6), the ideas wall (Q-7/B-5), the integrations grid hidden (Q-14),
  one name (Q-14), the story folded on phones (Q-14), tips over the demo once it is interactive
  (Q-2/B-1/B-2 r2), Linux visitors get the device card second (Q-8/Q-9).
"""
import re, sys, html
from pathlib import Path

HERE = Path(__file__).resolve().parent
W = HERE.parents[4]
F = W / 'youcoded' / 'docs' / 'index.html'
doc = F.read_text()
MARK = '<!-- repositioning 2026-10-21 -->'
if MARK in doc:
    sys.exit('already applied')

sys.path.insert(0, str(HERE))
import build as mk   # the mockup generator: the drawn device pieces and the section finder

def replace_section(doc, sec_id, new):
    s, e = mk.section(doc, sec_id)
    return doc[:s] + new + doc[e:]

THEMES = ['youcoded', 'meadow-mist', 'halftone-dimension', 'golden-sunbreak']

# ---------------------------------------------------------------------------------------------
# About (Q-3 + B-3 edits, verbatim from Destin's note)
# ---------------------------------------------------------------------------------------------
ABOUT = MARK + '''
<section id="about"><div class="wrap">
  <p class="eyebrow">What is this?</p><h2>One app. Whatever you want it to be.</h2>
  <div class="panel prose">
    <p class="big">YouCoded is an AI assistant that does what you want, the way you want, with the screens and features you want. Hand it your files, your research and your writing. Ask it for a control panel for your house, a page for your money, or a game for a slow afternoon. Ask it to change its own look, give itself new features, or handle your requests in different ways. What exactly is YouCoded? That&rsquo;s for you to decide.</p>
    <div class="cols">
      <p>It runs on whichever AI you choose: Anthropic (Claude), OpenAI (ChatGPT), Alibaba (Qwen) and hundreds more, or an open model running privately on your own computer.</p>
    </div>
    <p class="permission">Nothing happens without your permission. YouCoded asks before taking actions.</p>
  </div>
</div></section>'''

# ---------------------------------------------------------------------------------------------
# The cards. media: ('clip', name) plays media/<name>--<theme>.webm for the page's theme;
# ('dev',) is the drawn device loop; ('sketch',) the roadmap drawing. `key` names the card for
# the Linux reorder.
# ---------------------------------------------------------------------------------------------
CARDS = [
  dict(key='yours', label='Make it yours', h='Describe the look you want.',
       p='Wallpapers, colors, mascots, fonts. Say what you are going for and the app changes to match. Not quite? Say so.',
       media=('clip', 'yours')),
  dict(key='home', label='Your home, your way', h='A smart-home panel, made by asking for one.',
       p='Not a built-in feature: a page one person asked for, for his own house, and uses every day. Lights, thermostat, speakers and TVs on one screen, arranged the way he wanted. Ask for yours and it will be different. The demo house here is fictional.',
       media=('clip', 'home'), chip='Sample page, not included'),
  dict(key='money', label='Your money, your way', h='Every account on one page, made by asking for it.',
       p='Not a built-in feature either: a page built through the chat for one person’s real accounts, with the view he wished his bank had. Yours could track anything. The numbers here are invented.',
       media=('clip', 'money'), chip='Sample page, not included'),
  dict(key='device', label='Your whole device', h='Don’t just customize the app. Customize your whole device.',
       p='Build a new control center or quick settings chip for your Linux device, rearrange your desktop or files, or build real utilities that change how you interact with your computer. <a href="https://github.com/itsdestin/swipe-keyboard#readme" target="_blank" rel="noopener">Swipe Keyboard for KDE Plasma</a> is just one example of what’s possible.',
       media=('dev',), chip='Built on Linux'),
  dict(key='any-ai', label='Any model', h='Use whichever AI you like. Switch mid-conversation.',
       p='Hundreds of models through OpenRouter, Claude or OpenAI on your own subscription, or an offline model on your own computer. Your tools and conversations work the same with all of them.',
       media=('clip', 'any-ai')),
  dict(key='artifact', label='Real work, edited live', h='Hand it a spreadsheet, get charts and analysis.',
       p='Attach a file and ask for what you want out of it. The assistant reads it, does the work, and hands it back in the panel beside the conversation, where you can open it, change it yourself, and hand it back for more.',
       media=('clip', 'artifact-edit')),
  dict(key='control', label='You’re in control', h='Nothing happens without your permission.',
       p='It asks before it acts. Permission modes set how much it may do on its own, and every standing permission is listed on one screen where you can revoke it. The whole app is open source, so anyone can check what it does.',
       media=('clip', 'does-things')),
  dict(key='organized', label='Stay organized', h='Projects, tags, notes and shortcuts.',
       p='Each project keeps its files, conversations and instructions together. Tag and annotate conversations, pin the ones that matter, hide the rest. Quick chips run the prompts you use every day in one tap.',
       media=('clip', 'organized')),
  dict(key='everywhere', label='Works everywhere', h='Start on your laptop. Finish on your phone.',
       p='Windows, macOS, Linux, Android, or any web browser through remote access. Conversations and files stay in sync through your own private GitHub, so you start on one device and resume on any other.',
       media=('clip', 'follow'), phone='phone'),
  dict(key='play', label='Play while it works', h='Multiplayer games, right beside the conversation.',
       p='Long tasks take a minute, so open the arcade in the side panel. Connect 4 or chess against a friend who is online, Flappy or 2048 on your own, then back to the answer when it is ready.',
       media=('clip', 'play')),
  dict(key='roadmap', label='On the roadmap', h='Hand it off.',
       p='Set up a job once: what to do, which tools it may use, where to stop and check with you. Then run it on a schedule or send it from your phone. Results and approvals land in an inbox.',
       media=('sketch',), chip='Roadmap'),
]

def clip_video(name, i, extra=''):
    return ('<video data-i="%d" data-clip="%s" muted loop playsinline preload="none" poster="media/%s--youcoded.webp"%s>'
            '<source src="media/%s--youcoded.webm" type="video/webm"></video>') % (i, name, name, extra, name)

def media_html(c, i):
    kind = c['media'][0]
    if kind == 'clip':
        out = clip_video(c['media'][1], i)
        if c.get('phone'):
            out += ('<div class="deck-phone" data-phone-for="%d"><video data-clip="%s" muted loop playsinline preload="none" width="390" height="844" '
                    'poster="media/%s--youcoded.webp" aria-label="The same conversation on a phone"><source src="media/%s--youcoded.webm" type="video/webm"></video></div>'
                    % (i, c['phone'], c['phone'], c['phone']))
        return out
    if kind == 'dev':
        return re.sub(r'^<div class="([^"]*)"', lambda m: '<div class="%s" data-i="%d"' % (m.group(1), i), mk.DEV_DIV, count=1)
    if kind == 'sketch':
        return mk.SKETCH.replace('class="sketch"', 'class="sketch" data-i="%d"' % i, 1)

def step_html(c, i):
    chip = ' <span class="rmchip">%s</span>' % html.escape(c['chip']) if c.get('chip') else ''
    return ('<div class="step" data-i="%d" data-card="%s">\n          <div class="step-label">%s%s</div>\n          <h3>%s</h3>\n          <p>%s</p>\n        </div>'
            % (i, c['key'], html.escape(c['label']), chip, c['h'], c['p']))

DEMO = '''<section id="demo" class="demo-deck deck-fade"><div class="wrap">
  <p class="eyebrow">Features</p><h2>Yours to shape. Yours to use.</h2>
  <div class="deck" id="deck">
    <div class="decktext" id="steps">%s</div>
    <div class="deckmedia" id="stage">%s</div>
  </div>
</div></section>''' % ('\n        '.join(step_html(c, i) for i, c in enumerate(CARDS)),
                       '\n        '.join(media_html(c, i) for i, c in enumerate(CARDS)))

# ---------------------------------------------------------------------------------------------
# The ideas wall (Q-7, B-5 round 2). Four stills exist today; more tiles when more sample pages do.
# ---------------------------------------------------------------------------------------------
IDEAS = [
  ('gallery/idea-home.webp', 'Give me a control panel for the lights, the thermostat and the TVs.'),
  ('gallery/idea-money.webp', 'Put every account, bill and loan on one page I can check at a glance.'),
  ('gallery/idea-paint.webp', 'I want a little paint program with brushes and an eraser.'),
  ('gallery/idea-trip.webp', 'Lisbon in October: the forecast for each day next to what’s booked.'),
]
GALLERY = '''<section id="gallery"><div class="wrap">
  <p class="eyebrow">Ideas</p><h2>Every one of these started as a sentence in the chat.</h2>
</div><div class="galwrap"><div class="gal ideas">%s</div></div></section>''' % ''.join(
    '<figure class="idea"><img src="%s" alt="" loading="lazy"><figcaption>&ldquo;%s&rdquo;</figcaption></figure>' % (img, q) for img, q in IDEAS)

CSS = '''
<style id="repositioning-css">
/* ---- 2026-10-21 repositioning: cards, device drawing, ideas wall, story fold, demo tips ---- */
.demo-deck .step .deckclip .devdemo{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;border-radius:11px}
.step p a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.gal.ideas{align-items:flex-start}
.idea{flex:none;width:420px;scroll-snap-align:center;margin:0}
.idea img{width:100%;display:block;border-radius:var(--radius);border:1px solid var(--hair)}
.idea figcaption{margin-top:10px;font-size:.95rem;line-height:1.35;opacity:.86;font-style:italic}
/* The story folds behind one line on a phone (Destin, Q-14): two screens of text became one tap. */
/* Every fold on the page (the FAQ cards, and the story on a phone) opens and closes with the
   same motion: the answer's box grows from 0 to its height while it fades in, the + turns into
   an x, and a press on the question dips the card (Destin, review R-10: "no expand animation or
   press feel"). The <details> element stays open during the closing motion; is-open drives it. */
.faq details .a,.storyfold .a{display:grid;grid-template-rows:0fr;opacity:0;
  transition:grid-template-rows .34s cubic-bezier(.2,.8,.2,1),opacity .22s ease}
.faq details .a>.a-in,.storyfold .a>.a-in{overflow:hidden;min-height:0}
.faq details.is-open .a,.storyfold.is-open .a{grid-template-rows:1fr;opacity:1}
.faq details .a{padding:0}
.faq details .a-in{padding:0 22px 20px}
/* The row's own corners follow the card's, and the press is a tint only: a transform on a
   row inside a blurred glass card made the browser paint a square dark block behind it
   (Destin, 2026-10-21 screenshot). */
.faq summary{border-radius:var(--radius);transition:background .18s}
.faq details.is-open summary{border-radius:var(--radius) var(--radius) 0 0}
.faq summary:hover{background:rgba(var(--fg-rgb),.04)}
.faq summary:active,.storyfold>summary:active{transform:none;background:rgba(var(--fg-rgb),.08)}
.storyfold>summary{transition:background .18s}
.faq summary::after{transition:transform .34s cubic-bezier(.2,.8,.2,1)}
.faq details[open] summary::after{content:'+'}
.faq details.is-open summary::after{transform:rotate(45deg)}
.storyfold>summary{list-style:none;display:none}
.storyfold>summary::-webkit-details-marker{display:none}
@media (prefers-reduced-motion:reduce){.faq details .a,.storyfold .a,.faq summary,.faq summary::after{transition:none}}
@media (max-width:760px){
  .storyfold{padding:0}
  .storyfold>summary{display:flex;gap:10px;cursor:pointer;padding:15px 17px;font-weight:700;font-size:.95rem;border-radius:var(--radius)}
  .storyfold.is-open>summary{border-radius:var(--radius) var(--radius) 0 0}
  .storyfold>summary::after{content:'+';margin-left:auto;color:var(--accent);font-size:1.3rem;line-height:1;transition:transform .34s cubic-bezier(.2,.8,.2,1)}
  .storyfold.is-open>summary::after{transform:rotate(45deg)}
  .storyfold .a-in{padding:0 17px 18px}
}
/* Tips over the live demo: glass chips hanging under the demo's own buttons on straight stems.
   They exist only once the visitor has clicked into the demo (B-1 round 2). */
.tips{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:var(--font-ui);display:none}
.embed.interactive .tips.on,.embed.interactive .tips.off{display:block}
/* Hidden tips leave one small button to bring them back; nothing else is drawn. */
.tips.off .tip,.tips.off .tips-lines{display:none}
.tips-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.tips-lines line{stroke:var(--accent);stroke-width:1.5;opacity:.55}
.tip{position:absolute;pointer-events:auto;display:inline-flex;align-items:center;gap:6px;max-width:250px;
  padding:5px 9px 5px 10px;border-radius:999px;font-size:.72rem;font-weight:600;line-height:1.25;white-space:nowrap;cursor:default;
  color:rgba(var(--fg-rgb),.92);background:var(--glass-prose);border:1px solid var(--hair);
  -webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);
  box-shadow:0 10px 24px -14px rgba(0,0,0,.45);transition:border-radius .15s}
.tip{transition:left .22s ease,top .22s ease}
.tip.open{transition:none;z-index:2}
.tip .tip-text{display:none;font-weight:500;opacity:.9}
.tip.open{white-space:normal;border-radius:14px;flex-wrap:wrap;row-gap:2px}
.tip.open .tip-text{display:block;flex-basis:100%}
.tip .tip-x{font-style:normal;opacity:.55;font-size:.85rem;line-height:1;padding:2px 3px;cursor:pointer;margin-left:auto;display:none}
.tip:hover .tip-x,.tip.open .tip-x{display:inline}
.tip .tip-x:hover{opacity:1}
.tips-hide{position:absolute;right:12px;top:44px;pointer-events:auto;font:600 .72rem var(--font-ui);padding:5px 11px;border-radius:999px;
  border:1px solid var(--hair);background:var(--glass-prose);color:rgba(var(--fg-rgb),.85);cursor:pointer;
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
@media (max-width:760px){.tips{display:none !important}}
</style>
'''

# --------------------------------------------------------------------------------------------
# Tips: anchored to the demo's own buttons (same origin), laid out so nothing overlaps.
# --------------------------------------------------------------------------------------------
TIPS_JS = r'''
<script>
// --- Tips over the live demo (2026-10-21). Chips hang under the demo's own toolbar buttons,
// found in the iframe's DOM (same origin), on straight vertical stems; inside Settings they sit
// beside the panel's rows on horizontal stems; while a page (Home, Finance) is open there are
// none. A chip expands in place into its description on hover or tap, and the others move to
// make room; x removes one, Hide tips removes them all (remembered). They appear only once the
// visitor has clicked into the demo -- never over the still.
(function(){
  var embed = document.querySelector('.embed'); if (!embed) return;
  var stage = embed.querySelector('.embed-stage'), frame = embed.querySelector('.embed-iframe');
  var CHAT = [
    { sel: 'button[aria-label="Settings"]',      label: 'Settings',  text: 'Every setting in one place: models, permissions, look, sync.' },
    { sel: 'button[aria-label="Open pages"]',    label: 'Pages',     text: 'Screens you asked for, pinned here for one click.' },
    { sel: 'button[aria-label="Open projects"]', label: 'Projects',  text: 'Files, conversations and instructions, kept together.' },
    { sel: 'button[aria-label="Open Home"]',     label: 'Home',      text: 'A smart-home panel, made by asking. Click to open it.' },
    { sel: 'button[aria-label="Open Finance"]',  label: 'Finance',   text: 'Every account on one page. Click to open it.' },
    { sel: 'button[aria-label="Session files"]', label: 'Files',     text: 'What the assistant made or changed in this conversation.', right: true },
    { sel: 'button[aria-label="Browser"]',       label: 'Browser',   text: 'The assistant’s own browser. Watch it work.', right: true },
    { sel: 'button[aria-label="Games"]',         label: 'Games',     text: 'Connect 4, chess, Flappy and 2048 while it works.', right: true },
    { sel: 'button[aria-label="Browse skills"]', label: 'Commands',  text: 'Your skills and workflows, one tap away.', above: true }
  ];
  var SETTINGS = [
    { row: 'Account',            text: 'Optional. Sign in to like themes and rate plugins.' },
    { row: 'Assistant settings', text: 'Which AI answers, what it may do without asking, and the defaults.' },
    { row: 'Appearance',         text: 'Themes, wallpapers, mascots, fonts. The four at the top of this page live here.' },
    { row: 'Buddy floater',      text: 'A small mascot that floats over your desktop and takes a screenshot straight into a prompt.' },
    { row: 'Backup & sync',      text: 'Your conversations and files, kept in your own private GitHub.' },
    { row: 'Remote access',      text: 'Open this app from your phone’s browser by scanning a code.' }
  ];
  var layer = document.createElement('div'); layer.className = 'tips';
  layer.innerHTML = '<svg class="tips-lines"></svg><button class="tips-hide" type="button">Hide tips</button>';
  stage.appendChild(layer);
  var svg = layer.querySelector('svg'), hideBtn = layer.querySelector('.tips-hide');
  var hidden = false; try { hidden = localStorage.getItem('yc-tips-hidden') === '1'; } catch (e) {}
  var gone = {}, pinned = null, mode = '';
  // WHY a toggle (Destin, 2026-10-21: "now they're just missing entirely"): Hide tips was
  // remembered with no way back, so one press in testing made the tips vanish for good on this
  // address. The same button now reads Show tips while they are hidden.
  hideBtn.addEventListener('click', function(){ hidden = !hidden; try { localStorage.setItem('yc-tips-hidden', hidden ? '1' : '0'); } catch (e) {} render(true); });
  function doc(){ try { return frame.contentDocument; } catch (e) { return null; } }
  function rect(el){ var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; }
  // What the demo is showing: a page (no tips), the settings panel, or the chat.
  function detect(d){
    if (!d || !d.body) return '';
    var back = [].slice.call(d.querySelectorAll('button')).some(function(b){ return /back to chat/i.test(b.textContent || '') && b.getBoundingClientRect().width; });
    if (back) return 'page';
    var close = d.querySelector('button[aria-label="Close settings"]');
    if (close && close.getBoundingClientRect().left >= 0) return 'settings';
    return 'chat';
  }
  function rowEl(d, label){
    var all = d.querySelectorAll('button, div, span, p');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length <= 1 && (el.textContent || '').trim() === label) {
        var r = el.getBoundingClientRect(); if (r.width && r.left >= 0) return el.closest('button') || el;
      }
    }
    return null;
  }
  function chip(t, key){
    var el = document.createElement('div'); el.className = 'tip' + (pinned === key ? ' open' : '');
    el.innerHTML = '<span class="tip-label"></span><span class="tip-text"></span><i class="tip-x" title="Dismiss">&times;</i>';
    el.querySelector('.tip-label').textContent = t.label || t.row;
    el.querySelector('.tip-text').textContent = t.text;
    // WHY the timer (Destin, 2026-10-21: "the hover effect is bugged"): opening re-lays the chips
    // out, and a chip that moved even a pixel away from the pointer closed, moved back, opened
    // again, forever. Now an open chip never moves (place() keeps its row and edge), and the
    // close waits 140 ms so crossing a gap between label and text cannot flicker it.
    var leaveT = null;
    el.addEventListener('mouseenter', function(){ clearTimeout(leaveT); if (pinned !== key && !el.classList.contains('open')) { el.classList.add('open'); place(); } });
    el.addEventListener('mouseleave', function(){ if (pinned === key) return; clearTimeout(leaveT); leaveT = setTimeout(function(){ el.classList.remove('open'); place(); }, 140); });
    el.addEventListener('click', function(e){ if (e.target.classList.contains('tip-x')) { gone[key] = 1; render(true); return; }
      pinned = pinned === key ? null : key; render(true); });
    return el;
  }
  var items = [], built = '';
  function render(force){
    var d = doc(); mode = detect(d);
    var live = mode && mode !== 'page' && embed.classList.contains('interactive'), show = live && !hidden;
    layer.classList.toggle('on', show); layer.classList.toggle('off', live && hidden);
    hideBtn.textContent = hidden ? 'Show tips' : 'Hide tips';
    if (!show) { built = ''; return; }
    // Chips are rebuilt only when the demo changes mode or one is dismissed; a mutation inside
    // the demo (a reply arriving, a hover) just re-places them, so a chip under the pointer
    // keeps its hover state instead of being replaced mid-hover.
    if (!force && built === mode && items.length) { place(); return; }
    layer.querySelectorAll('.tip').forEach(function(n){ n.remove(); }); items = []; built = mode;
    var list = mode === 'settings' ? SETTINGS : CHAT;
    list.forEach(function(t, i){
      var key = mode + ':' + i; if (gone[key]) return;
      var anchor = t.sel ? d.querySelector(t.sel) : rowEl(d, t.row);
      if (!anchor) return;
      var el = chip(t, key); layer.appendChild(el);
      items.push({ t: t, el: el, anchor: anchor });
    });
    place();
  }
  // Lay the chips out against the anchors' current positions; nothing may overlap. An OPEN chip
  // is laid out first and keeps the row and the edge it had while closed, so it only grows
  // (never slides out from under the pointer); closed chips pack around it, and rows below an
  // open chip move down by its extra height. Positions animate (CSS) except on the open chip.
  function place(){
    var d = doc(); if (!d) return;
    var sw = stage.clientWidth, gap = 8, lines = '';
    var groups = {};   // 'L' | 'R' (chat, below the toolbar) -> { rows: [[spans]], heights: [] }
    function grp(g){ return groups[g] || (groups[g] = { rows: [], heights: [] }); }
    function fits(g, i, l, r){ var rows = grp(g).rows; rows[i] = rows[i] || []; return !rows[i].some(function(s){ return l < s[1] + gap && r > s[0] - gap; }); }
    function take(g, i, l, r, h){ var G = grp(g); G.rows[i] = G.rows[i] || []; G.rows[i].push([l, r]); G.heights[i] = Math.max(G.heights[i] || 0, h); }
    var ordered = items.filter(function(it){ return it.el.classList.contains('open'); }).concat(items.filter(function(it){ return !it.el.classList.contains('open'); }));
    var plan = [];
    ordered.forEach(function(it){
      var a = rect(it.anchor), el = it.el, open = el.classList.contains('open'), w = el.offsetWidth, h = el.offsetHeight;
      if (!open) it.hc = h;                       // the closed height, kept while open
      var hc = it.hc || h;
      if (mode === 'settings') {
        // beside the row: top edge fixed at the closed chip's centre line, grows downward
        plan.push({ it: it, x: a.r + 14, y: a.cy - hc / 2, line: [a.r, a.cy, a.r + 14, a.cy] });
      } else if (it.t.above) {
        // above the message box: bottom edge fixed, grows upward
        plan.push({ it: it, x: a.cx - 10, y: a.t - 10 - h, line: [a.cx, a.t - 10, a.cx, a.t] });
      } else {
        var g = it.t.right ? 'R' : 'L';
        var x = it.t.right ? a.cx + 10 - w : a.cx - 10;
        x = Math.max(4, Math.min(x, sw - w - 4));
        var row;
        if (open && it.row != null) row = it.row;
        else { row = 0; while (!fits(g, row, x, x + w)) row++; it.row = row; }
        take(g, row, x, x + w, open ? h : hc);   // an open chip's full height pushes the rows below it down
        plan.push({ it: it, x: x, g: g, row: row, ab: a.b, cx: a.cx, hOpen: h, hc: hc });
      }
    });
    plan.forEach(function(p){
      var el = p.it.el, y;
      if (p.g) {
        // rows stack by the tallest chip in each row above
        var G = groups[p.g]; y = p.ab + 10;
        for (var i = 0; i < p.row; i++) y += (G.heights[i] || p.hc) + 6;
        lines += '<line x1="' + p.cx + '" y1="' + (p.ab + 2) + '" x2="' + p.cx + '" y2="' + y + '"/>';
      } else { y = p.y; lines += '<line x1="' + p.line[0] + '" y1="' + p.line[1] + '" x2="' + p.line[2] + '" y2="' + p.line[3] + '"/>'; }
      el.style.left = p.x + 'px'; el.style.top = y + 'px';
    });
    svg.innerHTML = lines;
  }
  // Re-render when the demo changes (a page opens, settings slides in) or the window resizes.
  var mo = null, queued = false;
  function queue(){ if (queued) return; queued = true; requestAnimationFrame(function(){ queued = false; render(); }); }
  function watch(){
    var d = doc(); if (!d || !d.body || mo) return;
    mo = new MutationObserver(queue); mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-label'] });
    d.defaultView.addEventListener('resize', queue);
  }
  // The app draws its toolbar a beat after the iframe's load event, so keep looking until
  // the first button exists (and give up after ten seconds).
  function armed(){ var d = doc(); return !!(d && d.body && d.querySelector(CHAT[0].sel)); }
  function arm(){ var tries = 0; (function tick(){ if (armed()) { watch(); render(true); return; } if (++tries < 34) setTimeout(tick, 300); })(); }
  frame.addEventListener('load', function(){ mo = null; arm(); });
  if (frame.src) arm();
  new MutationObserver(function(){ watch(); queue(); }).observe(embed, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', queue);
})();
</script>
'''

# Per-theme clips: every card's loop exists once per site theme (Q-12), so the page plays the
# visitor's theme. Swapped from applyTheme; a running clip is reloaded and resumed.
RETHEME_JS = '''
// --- Per-theme clips (2026-10-21): media/<name>--<theme>.webm for each of the four site themes.
var CLIP_THEMES = %s;
function rethemeClips(slug){
  var theme = CLIP_THEMES.indexOf(slug) >= 0 ? slug : CLIP_THEMES[0];
  document.querySelectorAll('video[data-clip]').forEach(function(v){
    var base = 'media/' + v.dataset.clip + '--' + theme;
    var s = v.querySelector('source'); if (!s || s.getAttribute('src') === base + '.webm') return;
    var running = !v.paused && !v.ended;
    v.setAttribute('poster', base + '.webp'); s.setAttribute('src', base + '.webm');
    v.load(); if (running) v.play().catch(function(){});
  });
}
''' % THEMES

# Linux visitors see the device card second (Q-8/Q-9): the one piece of the page tailored to
# the visitor's system, besides the highlighted download button.
LINUX_JS = '''
// --- Linux visitors: the device card moves up to second place (2026-10-21).
(function(){
  try {
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '', ua = navigator.userAgent || '';
    if (/Android/.test(ua) || !/Linux|X11|CrOS/.test(plat + ua)) return;
    var st = document.querySelector('.step[data-card="device"]'), first = document.querySelector('.step[data-i="0"]');
    var sl = document.querySelector('#stage > .devdemo'), firstSl = document.querySelector('#stage > [data-i="0"]');
    if (st && first && sl && firstSl) { first.after(st); firstSl.after(sl); }
  } catch (e) {}
})();
'''

# ---------------------------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------------------------
doc = replace_section(doc, 'about', ABOUT)
doc = replace_section(doc, 'demo', DEMO)
doc = replace_section(doc, 'gallery', GALLERY)
# Integrations: hidden, kept (Q-14: "don't delete, we may bring back later").
doc = doc.replace('<section id="integrations">', '<!-- integrations grid hidden 2026-10-21 (Destin): kept for later, not deleted -->\n<section id="integrations" hidden>', 1)
# Story fold on phones.
s, e = mk.section(doc, 'story')
story = doc[s:e]
story2 = story.replace('<div class="panel prose story">', '<details class="panel prose story storyfold" open><summary>Read the story</summary><div class="a"><div class="a-in">', 1)
story2 = story2.replace('</div>\n</div></section>', '</div></div></details>\n</div></section>', 1)
# FAQ answers get an inner box so the card can animate shut without its padding showing.
doc = re.sub(r'<div class="a">(?!<div class="a-in">)(.*?)</div></details>', lambda m: '<div class="a"><div class="a-in">' + m.group(1) + '</div></div></details>', doc, flags=re.S)
assert story2 != story and '</details>' in story2, 'story fold anchors'
doc = doc[:s] + story2 + doc[e:]
# One name.
doc = doc.replace('YouCoded Assistant', 'YouCoded')
# Styles: the page's own + the device drawing's.
dev_css = mk.DEV_STYLE.replace('<style>', '<style id="device-css">')
doc = doc.replace('</head>', CSS + dev_css + '</head>', 1)
# Scripts: the device loop, the tips, and the story fold's phone default.
FOLD_JS = '''
<script>
// The story opens folded on a phone, open everywhere else (Q-14).
(function(){ var d = document.querySelector('.storyfold'); if (d && matchMedia('(max-width: 760px)').matches) d.removeAttribute('open'); })();
// Animated folds: the FAQ cards and the story card. Opening sets `open` then, a frame later,
// is-open so the box transitions from 0; closing removes is-open and waits for the motion to
// end before the element actually closes. With reduced motion there is no wait.
(function(){
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.faq details, details.storyfold').forEach(function(d){
    var s = d.querySelector('summary'), a = d.querySelector('.a'); if (!s || !a) return;
    if (d.open) d.classList.add('is-open');
    s.addEventListener('click', function(e){
      e.preventDefault();
      if (d.classList.contains('is-open')) {
        d.classList.remove('is-open');
        if (reduced) { d.open = false; return; }
        var done = false, finish = function(){ if (done) return; done = true; if (!d.classList.contains('is-open')) d.open = false; };
        a.addEventListener('transitionend', function h(ev){ if (ev.propertyName === 'grid-template-rows') { a.removeEventListener('transitionend', h); finish(); } });
        setTimeout(finish, 450);
      } else {
        d.open = true;
        if (reduced) { d.classList.add('is-open'); return; }
        requestAnimationFrame(function(){ requestAnimationFrame(function(){ d.classList.add('is-open'); }); });
      }
    });
  });
})();
</script>
'''
doc = doc.replace('</body>', mk.DEV_SCRIPT + TIPS_JS + FOLD_JS + '</body>', 1)
# applyTheme hook + the function itself, and the Linux reorder before the deck collects its steps.
hook = '  setEmbedPoster();\n  if (typeof maskEmbed === \'function\') maskEmbed();\n}'
assert doc.count(hook) == 1, 'applyTheme anchor'
doc = doc.replace(hook, '  setEmbedPoster();\n  rethemeClips(slug);\n  if (typeof maskEmbed === \'function\') maskEmbed();\n}' + RETHEME_JS, 1)
anchor = "var steps  = [].slice.call(document.querySelectorAll('.step'));"
assert doc.count(anchor) == 1, 'deck anchor'
doc = doc.replace(anchor, LINUX_JS + anchor, 1)
F.write_text(doc)
print('applied to', F)
