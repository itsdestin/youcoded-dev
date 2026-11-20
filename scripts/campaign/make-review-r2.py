#!/usr/bin/env python3
"""Builds the round-two review page: every film, poster and voice clip on one page, with a
notes box and quick answers under each, and one button that copies everything Destin wrote.

    python3 scripts/campaign/make-review-r2.py   ->   ~/Documents/youcoded-campaign/round2/review.html

WHY one page with relative links: he asked for a single place to review instead of a list of
file paths; the page sits beside the films, so it works wherever the folder is opened from.
WHY "copy my notes" instead of saving: a plain file page cannot write to disk, so his answers
travel back through the chat. They are also kept in the browser in case the page is closed.
"""
import html, os, urllib.parse

OUT = os.path.expanduser("~/Documents/youcoded-campaign/round2/review.html")
q = urllib.parse.quote
e = html.escape

FILMS = [
    ("fairytale", "The fairytale", "77 seconds. Your script over a storybook town that goes from night to morning.",
     [("With the narrator", "fairytale (narrator).mp4"),
      ("Narrator, other music", "fairytale (narrator, other music).mp4"),
      ("No narrator, words on screen", "fairytale (no narrator, words on screen).mp4")],
     [("Narrator or no narrator?", ["Narrator", "No narrator", "Not sure"]),
      ("Is Lily's voice in the right direction?", ["Yes", "Close", "No"]),
      ("Which music?", ["Main", "Other", "Neither"]),
      ("77 seconds, or also a 60-second cut?", ["77 is fine", "Also make 60", "Only 60"])],
     ["The recording does not yet have your new line about privacy being the cost of convenience.",
      "The first shot is a dark night picture; it may be less striking small on a phone.",
      "The tower section in the middle still has a lot of purple sky."]),
    ("mine", "Make it mine", "60 seconds. One person changing their app by asking: a new look, their home, their money.",
     [("Main music", "make-it-mine.mp4"), ("Other music (disco-funk)", "make-it-mine (other music).mp4")],
     [("Which music?", ["Main", "Other", "Neither"]),
      ("Keep both the home and the money conversations?", ["Keep both", "Drop home", "Drop money"]),
      ("Typing sounds?", ["Keep", "Quieter", "Remove"])],
     ["Real: the app window, every typed message and reply, the look changing, the rain. Staged: the home controls, balances, bills and the email.",
      "Two stretches of a few seconds after each look change have only rain and a slow drift moving.",
      "In the ending, the conversation window covers the lower halves of the home and money screens."]),
    ("own", "Own everything", "24 seconds. The posters in motion, with the cross-out drawn by hand.",
     [("Tall, for phones", "own-everything (tall).mp4"), ("Tall, other music (electronic)", "own-everything (tall, other music).mp4"),
      ("Wide", "own-everything (wide).mp4")],
     [("Which music?", ["Main", "Other", "Neither"]),
      ("It never says what youcoded is. Fix that?", ["Leave it", "Flash the app", "Add a line at the end"]),
      ("The handwriting is revealed letter by letter, not truly drawn. Good enough?", ["Yes", "Make it truly drawn"])],
     ["The lower half of the tall version is empty colour, matching the posters."]),
]
POSTERS = [("nothing", "you'll own everything"), ("own-data", "own your data"), ("own-intelligence", "own your intelligence"),
           ("own-software", "own your software"), ("own-everything", "own everything")]
VOICES = [("Lily, as used in the film", "voice/lily-fast-tight.mp3"), ("Storyteller, same script", "voice/storyteller-woman-fast-tight.mp3"),
          ("Lily, with your new privacy line", "voice/lily-v2-tight.mp3"), ("Storyteller, with your new privacy line", "voice/storyteller-woman-v2-tight.mp3")]
OVERALL = [("Which film is closest to what you pictured?", ["Fairytale", "Make it mine", "Own everything", "None yet"]),
           ("Which is furthest?", ["Fairytale", "Make it mine", "Own everything"])]


def picks(key, questions):
    out = []
    for i, (label, options) in enumerate(questions):
        btns = "".join(f'<button type="button" class="pick" data-k="{key}-q{i}" data-v="{e(o)}">{e(o)}</button>' for o in options)
        out.append(f'<div class="q" data-label="{e(label)}" data-k="{key}-q{i}"><p>{e(label)}</p><div class="opts">{btns}</div></div>')
    return "".join(out)


def film(key, title, sub, versions, questions, notes):
    tabs = "".join(f'<button type="button" class="tab{" on" if i == 0 else ""}" data-src="{q(f)}">{e(l)}</button>' for i, (l, f) in enumerate(versions))
    known = "".join(f"<li>{e(n)}</li>" for n in notes)
    return f'''<section class="card" data-title="{e(title)}">
  <h2>{e(title)}</h2><p class="sub">{e(sub)}</p>
  <div class="tabs">{tabs}</div>
  <video controls preload="metadata" src="{q(versions[0][1])}"></video>
  <details><summary>Things I already know are weak</summary><ul>{known}</ul></details>
  {picks(key, questions)}
  <textarea data-k="{key}-notes" placeholder="Anything else about this film: what you like, what bothers you, a moment to change (give the second if you can)"></textarea>
</section>'''


posters = "".join(f'<figure><a href="../posters-round2/youcoded-{k}-social-4x5.png"><img loading="lazy" src="posters/{k}.jpg" alt="{e(t)}"></a><figcaption>{e(t)}</figcaption></figure>' for k, t in POSTERS)
voices = "".join(f'<div class="voice"><span>{e(l)}</span><audio controls preload="none" src="{q(f)}"></audio></div>' for l, f in VOICES)

PAGE = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>youcoded campaign: round two</title>
<style>
:root {{ --bg:#F7F0FB; --panel:#fff; --line:#C9B0DB; --text:#21152C; --text2:#43354E; --purple:#9750AA; --on:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#140B1E; --panel:#1F1329; --line:#3A2749; --text:#F3EAF9; --text2:#B3A8BC; --purple:#C387D3; --on:#140B1E; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:16px/1.5 "DM Sans",system-ui,sans-serif; }}
main {{ max-width:1000px; margin:0 auto; padding:32px 16px 120px; }}
h1 {{ font-size:34px; letter-spacing:-.04em; margin:0 0 4px; }} h1 b {{ color:var(--purple); }}
h2 {{ font-size:24px; letter-spacing:-.03em; margin:0; }}
.sub, .lede {{ color:var(--text2); margin:4px 0 14px; }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin:22px 0; }}
video {{ width:100%; max-height:70vh; background:#000; border-radius:10px; display:block; }}
.tabs, .opts {{ display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }}
button {{ font:inherit; cursor:pointer; border-radius:999px; padding:7px 14px; border:1px solid var(--line); background:transparent; color:var(--text); }}
button.on {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; }}
.q {{ margin:14px 0 0; }} .q p {{ margin:0 0 6px; font-weight:700; }}
textarea {{ width:100%; min-height:90px; margin-top:16px; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; resize:vertical; }}
details {{ margin:12px 0 0; color:var(--text2); }} summary {{ cursor:pointer; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }}
figure {{ margin:0; }} figure img {{ width:100%; border-radius:8px; display:block; border:1px solid var(--line); }} figcaption {{ font-size:13px; color:var(--text2); margin-top:4px; }}
.voice {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:8px 0; }} .voice span {{ flex:1 1 220px; }} audio {{ flex:1 1 280px; height:36px; }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }}
.bar button {{ background:var(--purple); border-color:var(--purple); color:var(--on); font-weight:700; padding:10px 22px; }}
#done {{ color:var(--text2); }}
</style></head><body><main>
<h1>round two: <b>rough cuts</b></h1>
<p class="lede">Three films, the posters and the narrator's voice. Watch, tap your answers, type anything else, then press <b>Copy my notes</b> at the bottom and paste into our chat. Your answers stay on this page if you close it.</p>

<section class="card" data-title="Overall">
  <h2>Overall</h2><p class="sub">Answer these after watching all three.</p>
  {picks("overall", OVERALL)}
  <textarea data-k="overall-notes" placeholder="Overall direction: what is working, what is not, what you want more or less of"></textarea>
</section>

{"".join(film(*f) for f in FILMS)}

<section class="card" data-title="Posters">
  <h2>Posters</h2><p class="sub">The five designs in the social shape. Click one for full size. Each also exists as story, square, wide, print and link-preview.</p>
  <div class="grid">{posters}</div>
  <textarea data-k="posters-notes" placeholder="Anything to change on the posters"></textarea>
</section>

<section class="card" data-title="Narrator voice">
  <h2>Narrator voice on its own</h2><p class="sub">The film uses the first one. The last two include your new line but are not in the film yet.</p>
  {voices}
  {picks("voice", [("Which voice is closer?", ["Lily", "Storyteller", "Neither"])])}
  <textarea data-k="voice-notes" placeholder="What the voice should be more or less of"></textarea>
</section>

<section class="card" data-title="Script">
  <h2>Script changes</h2><p class="sub">Any remaining changes to the fairytale's words. I will record once, after you say they are final.</p>
  {picks("script", [("Is the script final apart from what you type here?", ["Yes, record it", "No, more changes coming"])])}
  <textarea data-k="script-notes" placeholder="Paste or type the lines to change"></textarea>
</section>
</main>
<div class="bar"><button type="button" id="copy">Copy my notes</button><span id="done"></span></div>
<script>
// WHY try/catch around storage: some viewers block it; the page must still work without remembering.
const KEY = 'youcoded-r2-review';
let state = {{}};
try {{ state = JSON.parse(localStorage.getItem(KEY) || '{{}}'); }} catch (e) {{}}
const save = () => {{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}} }};
document.querySelectorAll('.pick').forEach((b) => {{
  if (state[b.dataset.k] === b.dataset.v) b.classList.add('on');
  b.onclick = () => {{
    const was = b.classList.contains('on');
    document.querySelectorAll('.pick[data-k="' + b.dataset.k + '"]').forEach((x) => x.classList.remove('on'));
    if (was) delete state[b.dataset.k]; else {{ b.classList.add('on'); state[b.dataset.k] = b.dataset.v; }}
    save();
  }};
}});
document.querySelectorAll('textarea').forEach((t) => {{ t.value = state[t.dataset.k] || ''; t.oninput = () => {{ state[t.dataset.k] = t.value; save(); }}; }});
document.querySelectorAll('.tabs').forEach((tabs) => tabs.querySelectorAll('.tab').forEach((b) => {{
  b.onclick = () => {{
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    const v = tabs.parentElement.querySelector('video'); const t = v.currentTime; v.src = b.dataset.src;
    // WHY keep the time: switching between two scores should compare the same moment.
    v.addEventListener('loadedmetadata', () => {{ v.currentTime = Math.min(t, v.duration || t); }}, {{ once: true }});
  }};
}}));
document.getElementById('copy').onclick = async () => {{
  const lines = ['Round two review'];
  document.querySelectorAll('section.card').forEach((s) => {{
    const part = [];
    s.querySelectorAll('.q').forEach((qd) => {{ if (state[qd.dataset.k]) part.push('- ' + qd.dataset.label + ' ' + state[qd.dataset.k]); }});
    const t = s.querySelector('textarea'); if (t && t.value.trim()) part.push('- Notes: ' + t.value.trim());
    if (part.length) lines.push('', s.dataset.title, ...part);
  }});
  const text = lines.join('\\n'), done = document.getElementById('done');
  try {{ await navigator.clipboard.writeText(text); done.textContent = 'Copied. Paste it into our chat.'; }}
  catch (e) {{ const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done.textContent = 'Copied. Paste it into our chat.'; }}
}};
</script></body></html>'''
open(OUT, "w").write(PAGE)
print(OUT)
