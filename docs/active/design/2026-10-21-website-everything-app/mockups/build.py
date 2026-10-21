#!/usr/bin/env python3
"""Mockups for the youcoded.ai repositioning (card #79, questions deck answered 2026-10-21).

Reads the REAL landing page (youcoded/docs/index.html), applies the approved direction, and
writes one page per feature-list layout into out/:

  out/fan.html      A  today's stacked-card deck, re-ordered and with the new cards
  out/bento.html    B  a tiled grid, everything visible at once
  out/theater.html  C  one big sticky stage with a chip rail; the text scrolls beside it

Every variant also carries the parts that are not layout choices: the chip tour over the hero
demo, the unified opening copy, the renamed headers, the hidden integrations grid, the ideas wall
in place of the gallery, and the keyboard animation (keyboard.html) in the device card.

The clips are NOT the final ones: new cards show stills (poster-*.webp) and old cards keep the
old loops, because every loop is being re-filmed at 1.3 zoom in all four themes after the layout
is chosen. The live page is never touched: out/ is git-ignored and its asset folders are symlinks.
"""
import os, re, sys, html
from pathlib import Path

HERE = Path(__file__).resolve().parent
WS = HERE.parents[4]                      # mockups → <date dir> → design → active → docs → the worktree root
SITE = WS / 'youcoded' / 'docs'
OUT = HERE / 'out'
ASSET_DIRS = ['media', 'gallery', 'wall', 'mascots', 'icons', 'brand', 'site', 'assets', 'screenshots']

src = (SITE / 'index.html').read_text()

def section(doc, sec_id):
    """Return (start, end) of <section id="…">…</section>; sections never nest on this page."""
    m = re.search(r'<section id="%s"[^>]*>' % re.escape(sec_id), doc)
    if not m: raise SystemExit('no section ' + sec_id)
    e = doc.index('</section>', m.start()) + len('</section>')
    return m.start(), e

def replace_section(doc, sec_id, new):
    s, e = section(doc, sec_id)
    return doc[:s] + new + doc[e:]

# ---------------------------------------------------------------------------------------------
# Copy. One unified story (Q-3: "the app is one unified thing with one core").
# ---------------------------------------------------------------------------------------------
ABOUT = '''<section id="about"><div class="wrap">
  <p class="eyebrow">What is this?</p><h2>One app. Whatever you want it to be.</h2>
  <div class="panel prose">
    <p class="big">YouCoded is an AI assistant that does what you want, the way you want, with the screens and features you want. Hand it your files, your research and your writing. Ask it for a control panel for your house, a page for your money, or a game for a slow afternoon. Ask it to change its own look. It is one app with one idea: you decide what it is.</p>
    <div class="cols">
      <p>It runs on whichever AI you choose: Anthropic (Claude), OpenAI (ChatGPT), Alibaba (Qwen) and hundreds more, or an open model running privately on your own computer.</p>
    </div>
    <p class="permission">Nothing happens without your permission. YouCoded asks before taking actions.</p>
  </div>
</div></section>'''

FEATURES_HEAD = '<p class="eyebrow">Features</p><h2>Yours to shape. Yours to use.</h2>'

# The card list, in the approved order (Q-4 yours-first; Q-5 merge + device + renamed headers;
# Q-6 relabel the roadmap). media: ('video', stem) keeps an existing loop (to be re-filmed),
# ('still', file) is a placeholder still, ('kb',) is the live keyboard animation,
# ('sketch',) the roadmap drawing. linux=True marks the card only Linux visitors see (Q-8/Q-9).
CARDS = [
  dict(label='Make it yours', h='Describe the look you want.',
       p='Wallpapers, colors, mascots, fonts. Say what you are going for and the app changes to match. Not quite? Say so.',
       media=('video', 'row6-yours')),
  dict(label='Your home, your way', h='A smart-home panel, built by asking for one.',
       p='Lights, thermostat, speakers and TVs on one screen, arranged how you want. Ask for it in chat, then run it from the panel or from the conversation. This demo house is fictional. Yours would be real.',
       media=('still', 'poster-home.webp')),
  dict(label='Your money, your way', h='Every account on one page.',
       p='Balances, bills, loans and what needs attention this week. Ask for the view you wish your bank had, then keep tweaking it. The demo numbers are invented.',
       media=('still', 'poster-finance.webp')),
  dict(label='Your whole device', h='Don’t just customize the app. Customize your whole device.',
       p='The same conversation that reshapes the app can reshape what is around it. This swipe keyboard for a Linux tablet was built by describing it, and it is free to install.',
       media=('kb',), chip='Built on Linux'),
  dict(label='Your desktop, too', h='A whole desktop restyle, by describing it.',
       p='Glass panels, a control center, a tablet mode that switches on when the keyboard comes off. Built on KDE Plasma through conversation. Linux visitors see this card; others do not.',
       media=('still', 'poster-desktop.webp'), chip='Linux only', linux=True),
  dict(label='Any model', h='Use whichever AI you like. Switch mid-conversation.',
       p='Hundreds of models through OpenRouter, Claude or OpenAI on your own subscription, or an offline model on your own computer. Your tools and conversations work the same with all of them.',
       media=('video', 'landing-row1-any-ai')),
  dict(label='Real work, edited live', h='Hand it a spreadsheet, get charts and analysis.',
       p='Attach a file and ask for what you want out of it. The assistant reads it, does the work, and hands it back in the panel beside the conversation, where you can open it, change it yourself, and hand it back for more.',
       media=('video', 'landing-row2-artifact-edit')),
  dict(label='You’re in control', h='Nothing happens without your permission.',
       p='It asks before it acts. Permission modes set how much it may do on its own, and every standing permission is listed on one screen where you can revoke it. The whole app is open source, so anyone can check what it does.',
       media=('video', 'row2-does-things')),
  dict(label='Stay organized', h='Projects, tags, notes and shortcuts.',
       p='Each project keeps its files, conversations and instructions together. Tag and annotate conversations, pin the ones that matter, hide the rest. Quick chips run the prompts you use every day in one tap.',
       media=('video', 'row4-organized')),
  dict(label='Works everywhere', h='Start on your laptop. Finish on your phone.',
       p='Windows, macOS, Linux, Android, or any web browser through remote access. Conversations and files stay in sync through your own private GitHub, so you start on one device and resume on any other.',
       media=('video', 'landing-row5-follow'), phone=True),
  dict(label='Play while it works', h='Multiplayer games, right beside the conversation.',
       p='Long tasks take a minute, so open the arcade in the side panel. Connect 4 or chess against a friend who is online, Flappy or 2048 on your own, then back to the answer when it is ready.',
       media=('video', 'landing-row7-play')),
  dict(label='On the roadmap', h='Hand it off.',
       p='Set up a job once: what to do, which tools it may use, where to stop and check with you. Then run it on a schedule or send it from your phone. Results and approvals land in an inbox.',
       media=('sketch',), chip='Roadmap'),
]

SKETCH = '''<div class="sketch">
          <div><div class="k">Agents</div><div class="li on2">Weekly grocery list</div><div class="li">Inbox digest &middot; 7am</div><div class="li">Receipts &rarr; spreadsheet</div></div>
          <div><div class="k">Weekly grocery list</div><div class="li">1 &middot; Read this week's plan</div><div class="li">2 &middot; Draft the list</div><div class="li on2">3 &middot; Check with me before ordering</div><div class="li">4 &middot; Send to my phone</div><div class="k" style="margin-top:14px">Inbox</div><div class="li">Needs approval &middot; Weekly grocery list &middot; 2 min ago</div></div>
        </div>'''

kb_src = (HERE / 'keyboard.html').read_text() if (HERE / 'keyboard.html').exists() else ''
def part(tag):
    # The LAST block: the style's own comment mentions "<script>", which a first-match grabbed.
    m = re.findall(r'<%s[^>]*>.*?</%s>' % (tag, tag), kb_src, re.S)
    return m[-1] if m else ''
KB_STYLE = re.sub(r'/\*.*?\*/', '', part('style'), flags=re.S)
# Only the .kbdemo rules travel: the file's :root/body/.wrap rules are for its own preview page
# (its flex body laid the whole landing page out sideways on 2026-10-21).
KB_STYLE = re.sub(r'^(:root|body|html|\.wrap)\s*\{[^}]*\}\s*$', '', KB_STYLE, flags=re.M)
KB_SCRIPT = part('script')
KB_DIV = re.search(r'<div class="kbdemo".*</div>\s*(?=<script|</body)', kb_src, re.S)
KB_DIV = KB_DIV.group(0).strip() if KB_DIV else '<div class="kbdemo"></div>'
# The demo page wraps the element in its own <div class="wrap">, so the greedy match ends on
# that wrapper's close tag: drop closers until the tags balance, or the extra one closes the
# landing page's own container and everything after it lays out sideways (seen 2026-10-21).
while KB_DIV.count('</div>') > KB_DIV.count('<div') and KB_DIV.endswith('</div>'):
    KB_DIV = KB_DIV[:-len('</div>')].rstrip()

def media_html(c, i, cls=''):
    kind = c['media'][0]
    if kind == 'video':
        stem = c['media'][1]
        v = '<video class="%s" data-i="%d" muted loop playsinline autoplay preload="none" poster="media/%s.webp"><source src="media/%s.webm" type="video/webm"></video>' % (cls, i, stem, stem)
        if c.get('phone'):
            v += '<div class="deck-phone" data-phone-for="%d"><video muted loop playsinline autoplay preload="none" width="390" height="844" poster="media/landing-row5-phone.webp"><source src="media/landing-row5-phone.webm" type="video/webm"></video></div>' % i
        return v
    if kind == 'still':
        return '<img class="slide-img %s" data-i="%d" src="%s" alt="">' % (cls, i, c['media'][1])
    if kind == 'kb':
        return KB_DIV.replace('class="kbdemo"', 'class="kbdemo %s" data-i="%d"' % (cls, i), 1)
    if kind == 'sketch':
        return SKETCH.replace('class="sketch"', 'class="sketch %s" data-i="%d"' % (cls, i), 1)

def label_html(c):
    chip = ' <span class="rmchip">%s</span>' % html.escape(c['chip']) if c.get('chip') else ''
    return '<div class="step-label">%s%s</div>' % (html.escape(c['label']), chip)

def copy_html(c, tag='h3'):
    return label_html(c) + '<%s>%s</%s><p>%s</p>' % (tag, c['h'], tag, c['p'])

# ---------------------------------------------------------------------------------------------
# A: the stacked deck the page has today, re-ordered.
# ---------------------------------------------------------------------------------------------
def fan():
    steps = ''.join('<div class="step%s" data-i="%d">%s</div>' % (' linux-card' if c.get('linux') else '', i, copy_html(c)) for i, c in enumerate(CARDS))
    stage = ''.join(media_html(c, i) for i, c in enumerate(CARDS))
    return '''<section id="demo" class="demo-deck deck-fade"><div class="wrap">
  %s
  <div class="deck" id="deck">
    <div class="decktext" id="steps">%s</div>
    <div class="deckmedia" id="stage">%s</div>
  </div>
</div></section>''' % (FEATURES_HEAD, steps, stage)

# ---------------------------------------------------------------------------------------------
# B: a bento grid. The three "yours" cards are big tiles; the rest are smaller tiles below.
# ---------------------------------------------------------------------------------------------
def bento():
    tiles = []
    for i, c in enumerate(CARDS):
        size = 'big' if i < 4 else ('wide' if c['media'][0] == 'sketch' else 'small')
        if c['media'][0] == 'kb': size = 'big'
        cls = 'fcard %s%s' % (size, ' linux-card' if c.get('linux') else '')
        tiles.append('<div class="%s"><div class="fmedia">%s</div><div class="fcopy">%s</div></div>' % (cls, media_html(c, i), copy_html(c)))
    return '''<section id="demo" class="demo-bento"><div class="wrap">
  %s
  <div class="fgrid">%s</div>
</div></section>''' % (FEATURES_HEAD, ''.join(tiles))

# ---------------------------------------------------------------------------------------------
# C: one sticky stage with a chip rail, copy scrolling beside it (the page's own .theater code).
# ---------------------------------------------------------------------------------------------
def theater():
    steps = ''.join('<div class="step%s" data-i="%d">%s</div>' % (' linux-card' if c.get('linux') else '', i, copy_html(c)) for i, c in enumerate(CARDS))
    stage = ''.join(media_html(c, i, 'on' if i == 0 else '') for i, c in enumerate(CARDS))
    rail = ''.join('<button class="railchip%s" data-n="%d">%s</button>' % (' on' if i == 0 else '', i, html.escape(c['label'])) for i, c in enumerate(CARDS))
    return '''<section id="demo" class="demo-theater"><div class="wrap">
  %s
  <div class="theater">
    <div class="decktext" id="steps">%s</div>
    <div class="stagewrap"><div class="stagecol"><div class="rail" id="rail">%s</div><div class="stage" id="stage">%s</div></div><div class="dots" id="dots"></div></div>
  </div>
</div></section>''' % (FEATURES_HEAD, steps, rail, stage)

# ---------------------------------------------------------------------------------------------
# The ideas wall (Q-7): stills of sample pages, each with the words that would make it.
# Four of the eight sample pages render real content in the practice data today; the other
# four stop at their permission card, so they are drawn as "to be built" tiles here.
# ---------------------------------------------------------------------------------------------
IDEAS = [
  ('poster-home.webp', 'Give me a control panel for the lights, the thermostat and the TVs.'),
  ('poster-finance.webp', 'Put every account, bill and loan on one page I can check at a glance.'),
  ('poster-paint.webp', 'I want a little paint program with brushes and an eraser.'),
  ('poster-trip.webp', 'Lisbon in October: the forecast for each day next to what is booked.'),
  (None, 'Show today and the next five days for Phoenix and Lisbon.'),
  (None, 'Turn my Todoist into a board I can drag between columns.'),
  (None, 'Make me a front page from the feeds I follow.'),
  (None, 'Let me paste any link and read it without the clutter.'),
]
def ideas():
    tiles = []
    for img, q in IDEAS:
        pic = '<img src="%s" alt="" loading="lazy">' % img if img else '<div class="idea-soon">Sample page still to be made</div>'
        tiles.append('<figure class="idea">%s<figcaption>&ldquo;%s&rdquo;</figcaption></figure>' % (pic, q))
    return '''<section id="gallery"><div class="wrap">
  <p class="eyebrow">Ideas</p><h2>Say it, and it&rsquo;s a page in the app.</h2>
  <p class="ideas-sub">Every one of these started as a sentence in the chat.</p>
</div><div class="galwrap"><div class="gal ideas">%s</div></div></section>''' % ''.join(tiles)

# ---------------------------------------------------------------------------------------------
# The chip tour over the hero demo (Q-2): labelled chips at the demo's own buttons, one shown
# expanded as it would be on hover, each with an x, and a "Hide tips" at the corner.
# ---------------------------------------------------------------------------------------------
# (icon x%, icon y%, chip x%, chip y%, label, description, expanded?). The icons sit 2.6% apart,
# closer than a chip is wide, so each chip is drawn clear of the toolbar in a cascade and a thin
# leader line runs back to its icon.
CHIPS = [
  (1.9, 2.6, 16.5, 7.5, 'Settings', 'Every setting in one place: models, permissions, look, sync.', False),
  (4.5, 2.6, 16.5, 12.5, 'Pages', 'Screens you asked for, pinned here for one-click access.', False),
  (7.1, 2.6, 16.5, 17.5, 'Projects', 'Files, conversations and instructions, kept together.', False),
  (9.8, 2.6, 16.5, 22.5, 'Home', 'A smart-home panel, built by asking. Click to open it.', True),
  (12.4, 2.6, 16.5, 27.5, 'Finance', 'Every account on one page. Click to open it.', False),
  (80.2, 2.6, 76.0, 7.5, 'Files', 'What the assistant made or changed in this conversation.', False),
  (85.0, 2.6, 76.0, 12.5, 'Browser', 'The assistant’s own browser. Watch it work.', False),
  (88.6, 2.6, 76.0, 17.5, 'Games', 'Connect 4, chess, Flappy and 2048 while it works.', False),
  (5.0, 95.5, 16.5, 88.5, 'Commands', 'Your skills and workflows, one tap away.', False),
]
def chip_tour():
    out = ['<div class="tour" aria-hidden="true"><button class="tour-hide">Hide tips</button>',
           '<svg class="tour-lines" viewBox="0 0 100 100" preserveAspectRatio="none">']
    for ix, iy, cx, cy, label, desc, open_ in CHIPS:
        out.append('<line x1="%s" y1="%s" x2="%s" y2="%s"/>' % (ix, iy, cx, cy))
    out.append('</svg>')
    for ix, iy, cx, cy, label, desc, open_ in CHIPS:
        out.append('<span class="tip-dot" style="left:%s%%;top:%s%%"></span>' % (ix, iy))
        side = 'left' if cx > 50 else ''
        out.append('<div class="tip %s %s" style="left:%s%%;top:%s%%"><span class="tip-pill">%s<i class="tip-x">&times;</i></span><span class="tip-desc">%s</span></div>'
                   % ('open' if open_ else '', side, cx, cy, html.escape(label), html.escape(desc)))
    out.append('</div>')
    return ''.join(out)

CSS = '''
<style id="mockup-css">
/* ---- mockup-only styles (2026-10-21 repositioning) ---- */
.rmchip.linux{border-style:solid}
.slide-img{object-fit:cover}
.demo-deck .step .deckclip img,.demo-deck .step .deckclip .kbdemo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:11px}
.demo-deck .step .deckclip .kbdemo{aspect-ratio:auto}
/* B: bento */
.fgrid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px;margin-top:28px}
.fcard{border-radius:var(--radius);background:var(--glass-prose);border:1px solid var(--hair);
  -webkit-backdrop-filter:blur(var(--blur-prose)) saturate(1.5);backdrop-filter:blur(var(--blur-prose)) saturate(1.5);
  box-shadow:inset 0 1px 0 var(--glass-hi), 0 26px 60px -28px var(--ink);padding:16px;display:flex;flex-direction:column;gap:14px}
.fcard.big{grid-column:span 6}
.fcard.small{grid-column:span 4}
.fcard.wide{grid-column:span 12;flex-direction:row;align-items:center}
.fcard.wide .fmedia{flex:0 0 46%}
.fmedia{position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid var(--hair);background:rgba(var(--canvas-rgb),.4)}
.fmedia>video,.fmedia>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fmedia>.kbdemo{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto}
.fmedia>.sketch{position:absolute;inset:0;opacity:1}
.fmedia .deck-phone{left:3%;bottom:4%;width:18%}
.fcard .step-label{margin-bottom:6px}
.fcard h3{font-family:var(--font-ui);font-size:1.18rem;font-weight:700;letter-spacing:-.02em;line-height:1.2}
.fcard.big h3{font-size:1.42rem}
.fcard p{margin-top:8px;opacity:.82;font-size:.92rem}
.fcard.small p{font-size:.88rem}
/* C: theater with a chip rail */
.demo-theater .theater{grid-template-columns:minmax(300px,400px) 1fr}
.stagecol{flex:1;display:flex;flex-direction:column;gap:12px}
.rail{display:flex;flex-wrap:wrap;gap:6px}
.railchip{font:600 .74rem var(--font-ui);padding:6px 11px;border-radius:999px;border:1px solid var(--hair);
  background:var(--glass);color:inherit;cursor:pointer;opacity:.7;transition:.2s}
.railchip.on{background:var(--accent);color:#fff;border-color:transparent;opacity:1}
.demo-theater .stage{border-radius:14px;overflow:hidden;border:1px solid var(--hair)}
.demo-theater .stage>.kbdemo{aspect-ratio:auto;opacity:0}
.demo-theater .stage>.kbdemo.on,.demo-theater .stage>.sketch.on{opacity:1}
.demo-theater .stage .deck-phone{left:3%;bottom:4%;width:18%}
.demo-theater .step{min-height:52vh}
.demo-theater .dots{display:none}
/* the ideas wall */
.ideas-sub{opacity:.75;margin-top:8px}
.gal.ideas{align-items:flex-start}
.idea{flex:none;width:420px;scroll-snap-align:center;margin:0}
.idea img{width:100%;display:block;border-radius:var(--radius);border:1px solid var(--hair)}
.idea-soon{aspect-ratio:16/10;border-radius:var(--radius);border:1px dashed var(--hair);display:flex;align-items:center;justify-content:center;
  font:500 .9rem var(--font-ui);opacity:.6;background:var(--glass)}
.idea figcaption{margin-top:10px;font-size:.95rem;line-height:1.35;opacity:.86;font-style:italic}
/* the chip tour over the demo */
.tour{position:absolute;inset:0;pointer-events:none;font-family:var(--font-ui);z-index:5}
.tour-hide{position:absolute;right:12px;top:-30px;font:600 .72rem var(--font-ui);padding:4px 10px;border-radius:999px;border:1px solid var(--hair);background:var(--glass);color:inherit;opacity:.8}
.tour-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.tour-lines line{stroke:var(--accent);stroke-width:1.5;vector-effect:non-scaling-stroke;opacity:.55}
.tip-dot{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--accent);transform:translate(-50%,-50%);
  box-shadow:0 0 0 4px rgba(124,58,237,.22)}
.tip{position:absolute;transform:translate(0,-50%);display:flex;align-items:center;gap:8px}
.tip.left{transform:translate(-100%,-50%);flex-direction:row-reverse}
.tip-pill{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:600;padding:5px 9px 5px 10px;border-radius:999px;
  background:var(--accent);color:#fff;box-shadow:0 8px 20px -8px rgba(0,0,0,.45);white-space:nowrap}
.tip-x{font-style:normal;opacity:.7;font-size:.8rem}
.tip-desc{display:none;max-width:240px;font-size:.8rem;line-height:1.3;padding:8px 11px;border-radius:12px;color:rgba(var(--fg-rgb),.9);
  background:var(--glass-prose);border:1px solid var(--hair);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  box-shadow:0 14px 30px -14px rgba(0,0,0,.45)}
.tip.open .tip-desc{display:block}
/* Linux-only card marker */
.linux-card{outline:2px dashed rgba(124,58,237,.45);outline-offset:-2px}
.story .fold{display:none}
</style>
'''

RAIL_JS = '''<script>
// Mirror the theater's dots onto the chip rail (the page's own show() toggles .on on the dots).
(function(){
  var rail = document.getElementById('rail'); if (!rail) return;
  var chips = [].slice.call(rail.children);
  chips.forEach(function(ch){ ch.addEventListener('click', function(){
    var st = document.querySelectorAll('.step')[+ch.dataset.n]; if (st) st.scrollIntoView({block:'center', behavior:'smooth'}); }); });
  new MutationObserver(function(){
    var on = [].slice.call(document.querySelectorAll('#dots .dot')).findIndex(function(d){ return d.classList.contains('on'); });
    chips.forEach(function(ch, i){ ch.classList.toggle('on', i === on); });
  }).observe(document.getElementById('dots'), { attributes: true, subtree: true, attributeFilter: ['class'] });
})();
</script>'''

def build(variant):
    doc = src
    doc = replace_section(doc, 'about', ABOUT)
    doc = replace_section(doc, 'demo', {'fan': fan, 'bento': bento, 'theater': theater}[variant]())
    # Q-14: hide the integrations grid on the live page, keep the markup for later.
    s, e = section(doc, 'integrations')
    doc = doc[:s] + '<!-- integrations grid hidden 2026-10-21 (Destin): kept for later -->' + doc[e:]
    doc = replace_section(doc, 'gallery', ideas())
    # The chip tour sits over the demo window.
    doc = doc.replace('<iframe class="embed-iframe"', chip_tour() + '<iframe class="embed-iframe"', 1)
    # One name everywhere (Q-14).
    doc = doc.replace('YouCoded Assistant', 'YouCoded')
    doc = doc.replace('</head>', CSS + KB_STYLE.replace('<style>', '<style id="kb-css">') + '</head>', 1)
    doc = doc.replace('</body>', KB_SCRIPT + RAIL_JS + '</body>', 1)
    doc = doc.replace('<title>', '<title>[mockup %s] ' % variant, 1)
    return doc

def main():
    OUT.mkdir(exist_ok=True)
    for d in ASSET_DIRS:
        link = OUT / d
        if not link.exists() and (SITE / d).exists():
            link.symlink_to(SITE / d)
    for f in HERE.glob('poster-*.webp'):
        (OUT / f.name).unlink(missing_ok=True)
        (OUT / f.name).symlink_to(f)
    for v in ['fan', 'bento', 'theater']:
        (OUT / (v + '.html')).write_text(build(v))
        print('wrote', OUT / (v + '.html'))

if __name__ == '__main__':
    main()
