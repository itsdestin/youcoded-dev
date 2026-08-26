#!/usr/bin/env python3
"""Builds docs/active/design/2026-08-25-ui-audit/phase-a-review.html from the crops in
images/phase-a/. Re-run after changing the copy below or regenerating crops."""
import html, os
ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = 'images/phase-a'
BUILTINS = ['midnight', 'dark', 'light', 'creme']
DARKS = ['midnight', 'dark']
LIGHTS = ['light', 'creme']
PACKS = ['halftone-dimension', 'meadow-mist']
NICE = {'midnight': 'Midnight', 'dark': 'Dark', 'light': 'Light', 'creme': 'Crème',
        'halftone-dimension': 'Halftone Dimension', 'meadow-mist': 'Meadow Mist'}
COL = {'before': 'Before (today)', 'A': 'After', 'B': 'After'}

def crops(name, themes, cols, labels=None, note=None, zoom=1.0):
    labels = labels or COL
    out = ['<div class="crops">']
    if note: out.append(f'<p class="capnote">{note}</p>')
    out.append('<table><thead><tr><th></th>' + ''.join(f'<th>{html.escape(labels[c])}</th>' for c in cols) + '</tr></thead><tbody>')
    for t in themes:
        out.append(f'<tr><th class="theme">{NICE[t]}</th>')
        for c in cols:
            f = f'{IMG}/{name}--{t}--{c}.png'
            if os.path.exists(os.path.join(ROOT, f)):
                out.append(f'<td><img src="{f}" style="zoom:{zoom}" loading="lazy" alt="{name} {t} {c}"></td>')
            else:
                out.append('<td class="missing">not captured</td>')
        out.append('</tr>')
    out.append('</tbody></table></div>')
    return '\n'.join(out)

def sheet_links(prefix_list):
    return ' · '.join(f'<a href="{IMG}/sheets/{p}.jpg">{p}</a>' for p in prefix_list)

def decision(id_, options, notes_placeholder='Notes (optional): what to change, what you like, what worries you'):
    radios = ''.join(
        f'<label><input type="radio" name="{id_}" value="{html.escape(v)}"> {html.escape(v)}</label>' for v in options)
    return f'''<div class="decide" data-item="{id_}">
  <div class="radios">{radios}</div>
  <textarea data-notes="{id_}" placeholder="{html.escape(notes_placeholder)}"></textarea>
</div>'''

page = []
page.append('''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Phase A review — readable greys, a real accent, lighter bubbles</title>
<style>
  :root { --ink:#1b1b1b; --ink2:#555; --line:#d8d8d8; --bg:#fafafa; --card:#fff; --acc:#2055ca; --warn:#8a5a00; --warnbg:#fff6e0; }
  * { box-sizing:border-box }
  body { margin:0; padding:24px 28px 120px; font:15px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--ink); background:var(--bg); max-width:1500px; }
  h1 { font-size:26px; margin:0 0 6px } h2 { font-size:21px; margin:44px 0 6px; padding-top:18px; border-top:2px solid var(--line) }
  h3 { font-size:15px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); margin:22px 0 6px }
  p, li { max-width:900px } .lead { font-size:16px; color:var(--ink2) }
  code { font:13px ui-monospace, SFMono-Regular, Menlo, monospace; background:#eee; padding:1px 4px; border-radius:3px }
  table { border-collapse:collapse; margin:8px 0 } th, td { border:1px solid var(--line); padding:6px 10px; vertical-align:top; text-align:left }
  th { background:#f0f0f0; font-weight:600 } .num td:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums }
  .crops table { background:#8a8a8a } .crops th { background:#e9e9e9 } .crops th.theme { white-space:nowrap }
  .crops td { padding:6px; background:#8a8a8a } .crops img { display:block; max-width:100%; height:auto; image-rendering:auto; box-shadow:0 1px 4px rgba(0,0,0,.4) }
  .crops td.missing { color:#fff; font-style:italic }
  .capnote { font-size:13px; color:var(--ink2); margin:4px 0 6px }
  .box { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 18px; margin:10px 0; max-width:960px }
  .warn { background:var(--warnbg); border-color:#e8c98a }
  .decide { background:#eef3ff; border:1px solid #c5d3f5; border-radius:8px; padding:12px 16px; margin:14px 0 6px; max-width:960px }
  .decide .radios label { display:inline-block; margin:0 18px 6px 0; cursor:pointer } .decide textarea { width:100%; min-height:56px; margin-top:6px; font:14px system-ui; padding:8px; border:1px solid #c5d3f5; border-radius:6px }
  .bad { color:#b00020; font-weight:600 } .good { color:#0a7a2f; font-weight:600 }
  #summary { position:fixed; right:0; bottom:0; left:0; background:#111; color:#eee; padding:10px 28px; display:flex; gap:16px; align-items:center; font-size:14px; box-shadow:0 -2px 12px rgba(0,0,0,.3) }
  #summary button { font:14px system-ui; padding:8px 14px; border-radius:6px; border:0; background:var(--acc); color:#fff; cursor:pointer } #summary .st { flex:1; opacity:.85 }
  #feedback { width:100%; min-height:160px; font:13px ui-monospace, monospace; padding:10px; border:1px solid var(--line); border-radius:6px }
  .toc a { margin-right:16px }
  dl { max-width:900px } dt { font-weight:600; margin-top:8px } dd { margin:2px 0 0 0 }
</style></head><body>
''')

page.append('''
<h1>Phase A review — readable greys, a real accent, lighter bubbles</h1>
<p class="lead">Four changes to the app's colour tokens and two theme packs. Every picture below is a 1:1 crop from a verified screenshot of the real app UI (workbench, six themes); the full-window sheets are linked under each section. Nothing here is merged — it lives on the branch <code>feat/ui-phase-a-tokens</code> (and <code>feat/ui-phase-a-mono</code> for option B).</p>
<div class="box">
<strong>How to review.</strong> Read each section, look at the crops, then click a decision and add notes if you want something different. The bar at the bottom collects everything into one block of text — press <em>Copy feedback</em> and paste it into the chat. Your selections are remembered by this page if you close it and come back.
</div>
<p class="toc"><a href="#p11">P-11 Readable grey text</a> <a href="#p12">P-12 Accent: A or B</a> <a href="#p13">P-13 User bubble on light themes</a> <a href="#p16">P-16 Theme-pack fixes</a> <a href="#other">What did <em>not</em> change</a> <a href="#fb">Feedback</a></p>
''')

# ---------------------------------------------------------------- P-11
page.append('<h2 id="p11">P-11 — Grey helper text becomes readable</h2>')
page.append('''
<h3>The problem</h3>
<p>The app has five levels of text colour, from strongest (<code>fg</code>, body text) to faintest (<code>fg-faint</code>). The second-faintest one, <code>fg-muted</code>, is used for the small helper lines you actually read: the sub-line under every Settings row, timestamps, file sizes, the status bar chips, "no results" copy. It sits mostly on <em>raised</em> surfaces (cards, rows, dialogs), and there it measured <span class="bad">3.0–3.3 : 1</span> in every built-in theme. The accessibility standard for small text is <span class="good">4.5 : 1</span> (WCAG AA). 3 : 1 is the bar for <em>large</em> headlines, and the app's own theme checker was only demanding that.</p>
<p>The faintest level, <code>fg-faint</code>, is at about 2 : 1 — fine for a divider line or a disabled chevron, unreadable for a word. 18 places were using it for words anyway (the "Skip setup" link in the onboarding wizard, a timestamp, an "or", the placeholder in dropdowns…), and the loading spinner cycled through it as one of its colours.</p>
<h3>What changed</h3>
<ul>
<li>In each of the four built-in themes, <code>fg-muted</code> was moved toward the body-text colour until it clears 4.5 : 1 on the raised surfaces. The step above it (<code>fg-dim</code>) — and in Crème the step above that — was nudged the same way so the three greys stay in order rather than collapsing into one.</li>
<li><code>fg-faint</code> is now <em>decorative-only</em>: the 18 text uses moved up to <code>fg-muted</code>; dividers, dots, icon-only buttons and disabled chips keep it (60 places, each checked by hand). The spinner drops it from its cycle.</li>
<li>A test now pins all of this (<code>fg-muted</code> ≥ 4.5 : 1 on raised surfaces, ladder stays ordered, <code>fg-faint</code> stays decorative), so a future theme edit can't quietly regress it.</li>
</ul>
<table class="num"><thead><tr><th>Theme</th><th>fg-muted on a card, before</th><th>after</th><th>fg-dim on a card, before</th><th>after</th></tr></thead><tbody>
<tr><td>Midnight</td><td>3.31</td><td>4.53</td><td>4.95</td><td>5.34</td></tr>
<tr><td>Dark</td><td>3.03</td><td>4.55</td><td>5.58</td><td>5.58 (unchanged)</td></tr>
<tr><td>Light</td><td>3.02</td><td>4.51</td><td>4.05</td><td>5.34</td></tr>
<tr><td>Crème</td><td>3.01</td><td>4.52</td><td>4.01</td><td>5.31</td></tr>
</tbody></table>
<h3>Look</h3>
''')
page.append(crops('drawer', BUILTINS, ['before', 'A'], note='Settings drawer — the sub-line under each row is fg-muted. Crop at 1:1.'))
page.append(crops('statusbar', BUILTINS, ['before', 'A'], note='Composer + status bar — chip text and the "Message Claude…" placeholder.'))
page.append(crops('resume', ['midnight', 'light'], ['before', 'A'], note='Resume Session — project, model, size and date lines under each session.'))
page.append(crops('firstrun', ['midnight', 'light'], ['before', 'A'], note='Onboarding wizard — "Skip setup" at the bottom was one of the 18 fg-faint text sites (now fg-muted, with a visible hover step).'))
page.append('''
<h3>What you will notice, and the risks</h3>
<ul>
<li>Small grey text everywhere is a touch stronger. Nothing moves or resizes.</li>
<li>The three grey levels are now closer together (roughly 5.3 / 4.5 / 2.0 on a card instead of 4.0–5.6 / 3.0 / 2.0), so "secondary" and "tertiary" text differ less. Size and placement still carry most of that hierarchy.</li>
<li>Only the four built-in themes changed. Community packs keep their own numbers, and the rule the theme checker enforces on <em>packs</em> is still 3 : 1 for this level — raising it would fail 6 of the 11 published packs. Whether to raise the pack rule is part of P-16's invisible half.</li>
<li>Faint separators (·, |, →) and disabled chips deliberately did <em>not</em> get stronger.</li>
</ul>
<h3>Alternatives considered</h3>
<ul>
<li><em>Make fg-faint readable instead</em> — rejected: then every divider and disabled glyph gets louder, which is the opposite of what those are for.</li>
<li><em>Only raise it where the text is small</em> — not possible: it is one token; the app has no "small-muted" variant, and adding one would be a sixth grey to police.</li>
</ul>
<p>Full sheets: ''' + sheet_links(['dark-main-settings-drawer', 'light-main-settings-drawer', 'dark-main-resume-browser', 'light-main-resume-browser', 'dark-overlays-first-run-authenticate', 'light-overlays-first-run-authenticate']) + '</p>')
page.append(decision('P-11', ['Approve', 'Approve with changes', 'Reject']))

# ---------------------------------------------------------------- P-12
page.append('<h2 id="p12">P-12 — Give the dark themes a real accent (A), or keep grey and add a second signal (B)</h2>')
page.append('''
<h3>The problem</h3>
<p>Every theme has one "accent" colour that means <em>this is the main action</em> or <em>this is the one that's selected</em>: the primary button, the chosen model, the active theme card, the send arrow, your own chat bubble. In Midnight and Dark the accent is a light grey that is almost the same colour as body text (they differ by only 1.27 : 1 and 1.12 : 1). A light-grey block with dark text is also exactly what a <em>disabled</em> control looks like — so primary and selected things read as switched off. Look at the Model &amp; Effort picker below: "Max" is disabled and "Auto" is selected, and they are the same kind of grey.</p>
<p>Light and Crème don't have this problem: their accent is near-black, and a black fill on a light screen is unmistakably "on". Halftone and Meadow bring their own accents (pink, green). So this only concerns the two dark built-ins.</p>
<h3>Option A — a real accent colour</h3>
<ul>
<li>Midnight: <code>#6CA0DC</code>, a soft blue (it sits next to Midnight's blue links, which is deliberate — GitHub does the same).</li>
<li>Dark: <code>#8DA6C9</code>, a steel blue-grey, so Dark stays the quieter of the two.</li>
<li>Text on the accent stays <em>dark</em> (the canvas colour), as it is today. White text was considered and rejected by arithmetic: a blue dark enough for white text to reach 4.5 : 1 is too dark for blue text to be readable on the black background — and the app uses the accent as text in 47 places. Both can't be true on a near-black canvas, so the accent is light and the text on it is dark. Measured: dark-on-accent 6.9 : 1 (Midnight) and 7.6 : 1 (Dark); accent as text on a card 5.6 and 6.4 : 1.</li>
</ul>
<h3>Option B — keep the grey, add a second signal</h3>
<ul>
<li>The theme engine notices when a dark theme's accent is "just another grey" (within 1.5 : 1 of the text colour) and flags it. Only then, primary/selected controls get <strong>bold text plus a thin dark line just inside their edge</strong> (a double-border look), and disabled primary buttons lose their fill and take a dashed outline. Nothing changes in themes that have a real accent.</li>
<li>Side effect you can see below: your own chat bubble shares the primary-button recipe, so it gets the inner line too. If you like B but not that, the bubble can be excluded with one line.</li>
<li>Not visible in any capture: the dashed "disabled" outline — no screen in the sweep has a disabled primary button. Treat that part as described, not demonstrated.</li>
</ul>
<h3>Look — three columns: today, A, B</h3>
''')
AB = {'before': 'Before (today)', 'A': 'A — blue accent', 'B': 'B — grey + signal'}
page.append(crops('model', DARKS, ['before', 'A', 'B'], AB, note='Model &amp; Effort — "Sonnet" and "Auto" are selected; "Max" is disabled.'))
page.append(crops('themes', DARKS, ['before', 'A', 'B'], AB, note='Appearance → Themes — the active card and the primary "Build New Theme" button.'))
page.append(crops('stalled', DARKS, ['before', 'A', 'B'], AB, note='Stalled-turn card — "Retry" is a primary button, "Stop" secondary.'))
page.append(crops('send', DARKS, ['before', 'A', 'B'], AB, note='Composer with text — the send arrow is accent-filled.'))
page.append(crops('bubble', DARKS, ['before', 'A', 'B'], AB, note='Your own message bubble (accent-filled on dark themes).'))
page.append('''
<h3>What you will notice, and the risks</h3>
<ul>
<li><strong>A</strong> is the single most visible change in the whole ledger: every primary button, selected tab, active card, send arrow and — in these two themes — your own chat bubble turns blue. Anyone used to the monochrome look will notice immediately. Links and buttons share a blue family in Midnight. Orange/green status chips, the red "danger" buttons and the pink/green community packs are untouched.</li>
<li><strong>B</strong> keeps the look but adds visual weight: bold + a double edge on every primary/selected element. It fixes "is this on or off?" but the app still has no colour to point with, and the bubble side effect above.</li>
<li>Either option is a token/CSS change only; no layout moves. The contrast checker and its tests pass for both.</li>
</ul>
<p><strong>My recommendation: A.</strong> B is a patch on a symptom; A gives the two most-used themes the one thing every other theme has.</p>
<p>Full sheets: ''' + sheet_links(['dark-main-home', 'dark-main-model-picker', 'dark-main-settings-appearance', 'dark-overlays-native-session-stalled-and-permission', 'dark-main-marketplace', 'dark-main-library', 'dark-main-projects', 'dark-overlays-close-session-prompt', 'dark-overlays-first-run-authenticate']) + '</p>')
page.append(decision('P-12', ['A — blue accent', 'A, but a different colour (say which in notes)', 'B — grey + signal', 'B, without the bubble outline', 'Neither / leave as is']))

# ---------------------------------------------------------------- P-13
page.append('<h2 id="p13">P-13 — Your bubble on light themes: grey instead of solid black</h2>')
page.append('''
<h3>The problem</h3>
<p>On Light and Crème the accent is near-black, so your own messages render as solid black blocks — the heaviest object on an otherwise pale screen, heavier than anything the assistant says. It draws the eye to the wrong side of the conversation.</p>
<h3>What changed</h3>
<p>The theme engine now stamps the page with whether the current theme is a light or dark scheme. On light schemes the user bubble is drawn on the "inset" grey (the same surface as the assistant's bubble) with normal body text; the timestamp inside it follows suit. Dark schemes keep their accent-coloured bubble (which, with P-12 A, becomes blue). This is how claude.ai draws the user bubble in both modes.</p>
<h3>Look</h3>
''')
page.append(crops('bubble', LIGHTS + ['meadow-mist'], ['before', 'A'], note='Your message bubble, 1:1. Meadow Mist is a light scheme, so the rule catches it too — see the scope question below.'))
page.append('''
<h3>What you will notice, and the risks</h3>
<ul>
<li>Your messages stop being the darkest thing on a light screen; the conversation reads as two equal grey bubbles on different sides.</li>
<li>Scope: the rule keys on "light scheme", so <strong>every light community pack</strong> (Meadow Mist today; any future light pack) gets the grey bubble too, including packs that painted the bubble in their accent on purpose. Halftone is dark and keeps its pink-glow bubble.</li>
<li>Community packs that style the bubble via CSS still work — the class names didn't change.</li>
</ul>
<h3>Alternatives</h3>
<ul>
<li><em>Grey bubble in every theme, dark included</em> (claude.ai's exact approach) — a one-line switch. Then the dark themes' bubble would not turn blue under P-12 A.</li>
<li><em>Built-in Light/Crème only</em> — possible, but the rule would then name themes instead of describing a property, which is the thing the theme system tries to avoid.</li>
</ul>
<p>Full sheets: ''' + sheet_links(['light-main-home', 'light-main-composer-typed', 'packs-main-home']) + '</p>')
page.append(decision('P-13', ['Approve — all light schemes (as built)', 'Approve — but built-in Light/Crème only', 'Change — grey bubble in every theme', 'Reject']))

# ---------------------------------------------------------------- P-16
page.append('<h2 id="p16">P-16 — Theme-pack fixes: outlines and glass in Meadow Mist and Halftone</h2>')
page.append('''
<h3>The problem</h3>
<p>Two of the app's bundled community packs draw their panels as translucent glass over a wallpaper. In Meadow Mist the glass was 58 % solid, and its border colour is used at 50 % opacity on top of that — so outlined ("secondary") buttons and the edges of rows faded into the sky behind them (finding T-5/T-6 in the audit: "Meadow erases its own outlined buttons"). Halftone's glass was 78 %, readable but at the edge.</p>
<h3>What changed (the visible half — the packs)</h3>
<ul>
<li>Meadow Mist: border-dim opacity 50 % → 80 %; panel glass 58 % → 85 % solid.</li>
<li>Halftone Dimension: panel glass 78 % → 85 % solid. Its checkboxes were <em>already</em> square (the checkbox has a fixed 4 px corner by design), so nothing to do there — the ledger line about checkboxes was already true.</li>
<li>These are edits to the copies bundled in the workbench for review. On approval the same two edits go to the <code>wecoded-themes</code> repo (a separate PR; its CI regenerates the previews), which is where the app actually downloads them from.</li>
</ul>
<h3>The invisible half (only after approval)</h3>
<p>The rules the theme checker enforces on every submitted pack gain: <em>border-dim on panel ≥ 1.5 : 1</em> (was 1.3), <em>glass that carries text ≥ 85 % solid</em>, and the accent may paint only the documented set of things. The checker file lives in three repos and must be merged in a fixed order (marketplace → themes → app), which is why it isn't in this branch.</p>
<h3>Look</h3>
''')
page.append(crops('drawerfull', PACKS, ['before', 'A'], note='Settings drawer over the wallpaper — row outlines and how much wallpaper shows through.', zoom=0.75))
page.append(crops('close', ['meadow-mist'], ['before', 'A'], note='Close-session prompt in Meadow Mist — the "Cancel" outline and the card edges.'))
page.append(crops('bubble', PACKS, ['before', 'A'], note='Both packs\' user bubble. Halftone keeps its accent (dark scheme); Meadow follows P-13.'))
page.append('''
<h3>What you will notice, and the risks</h3>
<ul>
<li>Less wallpaper shows through the settings drawer, header, status bar and overlays in these two packs — the glass is "frostier". Meadow Mist loses some of its airy look; that is the trade for readable outlines. If 85 % is too much, 75 % is the lowest that still keeps outlines visible in the crops I checked — say so in the notes.</li>
<li>Only these two packs change. Other packs are untouched until the checker rule lands, at which point authors get a failing check on their <em>next</em> submission, not a forced change.</li>
</ul>
<p>Full sheets: ''' + sheet_links(['packs-main-settings-drawer', 'packs-main-home', 'packs-overlays-close-session-prompt', 'packs-main-marketplace', 'packs-main-library']) + '</p>')
page.append(decision('P-16', ['Approve (85 %)', 'Approve, but Meadow at 75 %', 'Approve outlines only, keep the glass as it was', 'Reject']))

# ---------------------------------------------------------------- other
page.append('''
<h2 id="other">What did <em>not</em> change, and what to ignore</h2>
<ul>
<li>No layout, spacing, copy or component moved anywhere in Phase A. If a crop looks different in a way not described above, that is a bug — please point at it.</li>
<li>Halftone's checkboxes: already square, untouched.</li>
<li>The "before" Marketplace and Library screenshots were taken before the workbench had sample marketplace data, so those two screens have no honest before/after in this round (the after-sheets are still in the gallery, with data).</li>
<li>All checks pass on both branches: types, 6,068 unit tests, dead-code, lint and the code-shape invariants.</li>
<li>Every screenshot in this page was verified by the capture rig (112 of 112 surfaces, six themes for the branch; 77 of 77 for option B in the two dark themes). None is a mislabelled capture.</li>
</ul>

<h2 id="fb">Feedback</h2>
<p>This block is generated from your choices above. Copy it and paste it into the chat.</p>
<textarea id="feedback" readonly></textarea>
<div id="summary"><span class="st" id="status">No decisions yet.</span><button id="copy">Copy feedback</button></div>
<script>
(function(){
  const items=['P-11','P-12','P-13','P-16'];
  const KEY='phase-a-review-v1';
  let state={}; try{ state=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  function render(){
    const lines=['Phase A feedback ('+new Date().toISOString().slice(0,10)+')'];
    let decided=0;
    for(const id of items){ const s=state[id]||{}; if(s.choice) decided++;
      lines.push(id+': '+(s.choice||'(no decision)')+(s.notes?' — '+s.notes.replace(/\\s+/g,' ').trim():'')); }
    document.getElementById('feedback').value=lines.join('\\n');
    document.getElementById('status').textContent=decided+' of '+items.length+' decided'+(decided<items.length?' — scroll up for the rest':' — ready to copy');
  }
  document.querySelectorAll('.decide').forEach(box=>{
    const id=box.dataset.item; const s=state[id]||{};
    box.querySelectorAll('input[type=radio]').forEach(r=>{ if(r.value===s.choice) r.checked=true;
      r.addEventListener('change',()=>{ state[id]=Object.assign(state[id]||{}, {choice:r.value}); save(); }); });
    const ta=box.querySelector('textarea'); ta.value=s.notes||'';
    ta.addEventListener('input',()=>{ state[id]=Object.assign(state[id]||{}, {notes:ta.value}); save(); });
  });
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} render(); }
  document.getElementById('copy').addEventListener('click',()=>{
    const t=document.getElementById('feedback'); t.select();
    const done=()=>{ document.getElementById('status').textContent='Copied — paste it into the chat.'; };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t.value).then(done,()=>{ document.execCommand('copy'); done(); }); }
    else { document.execCommand('copy'); done(); }
  });
  render();
})();
</script>
</body></html>
''')

with open(os.path.join(ROOT, 'phase-a-review.html'), 'w') as f:
    f.write('\n'.join(page))
print('wrote', os.path.join(ROOT, 'phase-a-review.html'))
