#!/usr/bin/env python3
"""The script editor — a page where Destin rewrites the host's lines with a screenshot of each moment.

  python3 scripts/promo/script-editor.py [--port N] [--no-open] [--build]

One card per line, in film order: the frame from the current draft at the moment the bubble is
up (so he sees what is on screen and where the host stands), the headline under the window,
the line as it is, and a text box to rewrite it. Each box shows the most words that slot can
hold (the film's timing rule, 1.2 s + a quarter second a word, against the frames the line
actually has) and the counter turns red when a rewrite would not fit. Submit writes
docs/active/prototypes/promo-2026-09/narration-v2.answers.json and prints every changed line;
the next session copies the changes into the beats (the beats are the truth).

The cue list comes from cues.sh (every bubble's frame and length), the stills from
out/draft.mp4, so the page always matches the draft he last watched. The server binds
127.0.0.1 only. Run it in the background: its exit is the "he submitted" signal.
"""
import argparse, html, json, os, subprocess, sys, webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.abspath(os.path.join(HERE, '..', '..', 'docs', 'active', 'prototypes', 'promo-2026-09'))
STILLS = os.path.join(DOCS, 'script')
OUT = os.path.join(DOCS, 'narration-v2.answers.json')

# What is on screen at each line, in film order (matches narration-v2.md). Keyed by the line's
# text so a reordered cue list still finds its description; a line with no entry shows nothing.
SCREEN = {
    "Hi! I'm your assistant.": ("YouCoded Assistant", "The window has risen and settled; the host is on its title bar, waving."),
    "Tap a chip.": ("Just ask.", "The Briefing chip is tapped; the assistant starts (\"Connecting dots\")."),
    "Notes in, brief out.": ("Just ask.", "The reply streams in: \"Pulling your notes and the syllabus…\", tools running."),
    "Watch this.": ("Describe a look.", "\"build me a theme with the vibe of outdoor anime art\" is typed and sent."),
    "Golden hour.": ("Describe a look.", "Golden Sunbreak lands; the host has twirled into gold. One bar (2.1 s)."),
    "Borrow one.": ("Describe a look.", "Strawberry Kitty; the host poofed into the cat. One bar (2.1 s)."),
    "Or make your own, and share it.": ("Describe a look.", "Kuromi Dreamer holds for two bars."),
    "Claude, cloud, or local.": ("Your model, your call.", "The model list opens; Grok is picked 1.2 s later; the chip changes."),
    "Grok it is.": ("Your model, your call.", "The question goes out and Grok's answer grows in at the bottom-left."),
    "Drop in a spreadsheet, ask for a sort.": ("Your files, beside the chat.", "The spreadsheet chip appears; \"sort it by amount and add a totals row\" is typed under it."),
    "Sorted, totalled.": ("Your files, beside the chat.", "The sorted sheet re-opens in the panel beside the chat."),
    "Files, chats and notes, one project.": ("Everything in its project.", "Project view: Econ 201, its file grid, then the Context tab."),
    "Challenge a friend.": ("Play while it works.", "The friends list; Challenge next to Jake."),
    "Connect 4. Jake's going down.": ("Play while it works.", "Connect 4: our drop, then Jake's."),
    "Or chess.": ("Play while it works.", "One chess move; then the host dives into Flappy."),
    "Every chat, ever.": ("Every conversation, findable.", "The sessions menu drops from the title bar."),
    "Searchable.": ("Every conversation, findable.", "The Resume browser; \"econ\" is typed and the list narrows."),
    "Tags, notes.": ("Every conversation, findable.", "The Organize sheet: the Priority tag on, a note typed."),
    "Drag to reorder.": ("Every conversation, findable.", "\"plan my week\" is dragged along the tab strip."),
    "Oh hey, your phone.": ("Pick up on any device.", "The phone slides in with its session list."),
    "Asks first.": ("Pick up on any device.", "The phone asks \"This session is active on Desktop — take over here?\" (1.4 s)."),
    "Same chat, same files, synced.": ("Pick up on any device.", "Take over; the chat loads on the phone; then its project files."),
    "Need more? There's a marketplace.": ("Add what you need.", "The marketplace grid."),
    "Made by people like you.": ("Add what you need.", "The Remember plugin's page; Install (the host claps); \"Installed\"."),
    "In your chat.": ("Add what you need.", "Back in the chat; the Remember chip on the strip."),
    "That's me. See you in there!": ("YouCoded · Free. Open source. · www.youcoded.ai", "The close: the window fills the frame, the modal, the host beside the Y."),
}
READ_BASE, READ_WORD = 36, 8   # frames: Destin's rule, 1.2 s + ¼ s a word (beat.ts readOf)

CSS = """
:root{--bg:#f6f7f9;--card:#fff;--fg:#1b1d22;--muted:#6b7280;--line:#e3e6ea;--acc:#2f6fed;--ok:#148a4b;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e23;--fg:#e8eaee;--muted:#9aa2ad;--line:#2b3037;--acc:#5b8dff;--ok:#3fbf7f;--bad:#ff7b72}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--card);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0;flex:1}.prog{color:var(--muted);font-size:14px}
button.submit{background:var(--acc);color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;font-weight:600;cursor:pointer}
main{max-width:1000px;margin:0 auto;padding:20px}.intro{color:var(--muted);margin:0 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:16px}.card.changed{border-color:var(--acc)}
.card img{width:100%;border-radius:10px;border:1px solid var(--line);display:block;background:#000}
.meta{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.head{font-weight:700;margin:0 0 6px}.screen{color:var(--muted);font-size:14px;margin:0 0 10px}
.was{font-size:14px;color:var(--muted);margin:0 0 4px}.was b{color:var(--fg)}
input.line{width:100%;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:inherit;font-size:18px;background:var(--bg);color:var(--fg)}
.count{font-size:13px;margin-top:6px;color:var(--muted)}.count.bad{color:var(--bad);font-weight:600}.count.ok{color:var(--ok)}
textarea{width:100%;margin-top:8px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;background:var(--bg);color:var(--fg);resize:vertical;min-height:34px}
.thanks{display:none;text-align:center;padding:60px 20px;font-size:20px}
@media(max-width:760px){.card{grid-template-columns:1fr}}
"""
JS = r"""
const L=__L__;let state={lines:{}};
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
const words=(s)=>s.trim()?s.trim().split(/\s+/).length:0;
const main=document.getElementById('main');
L.forEach((l,i)=>{
  const c=el('div','card'); c.dataset.id=l.id;
  const left=el('div'); const img=el('img'); img.src='stills/'+l.still; img.alt=''; left.append(img);
  const meta=el('div','meta',l.time+' · section '+l.beat+' · '+l.len.toFixed(1)+' s on screen'); left.append(meta);
  const right=el('div');
  right.append(el('p','head','Headline: '+l.headline));
  if(l.screen) right.append(el('p','screen',l.screen));
  const was=el('p','was'); was.innerHTML='Now: <b></b>'; was.querySelector('b').textContent=l.text; right.append(was);
  const inp=el('input','line'); inp.value=l.text; inp.placeholder='Your line';
  const count=el('div','count');
  const upd=()=>{const n=words(inp.value); const over=n>l.fits; count.textContent=n+' word'+(n===1?'':'s')+' — fits '+l.fits+(over?' · too long for this slot (needs '+(READ_BASE+READ_WORD*n-l.frames)+' more frames — shorten it, or tell me to give it more time)':''); count.className='count '+(over?'bad':n?'ok':'');
    const changed=inp.value.trim()!==l.text; c.classList.toggle('changed',changed); state.lines[l.id]={...(state.lines[l.id]||{}),text:inp.value,changed}; save();};
  inp.oninput=upd; right.append(inp,count);
  const ta=el('textarea'); ta.placeholder='A note for me (optional): what you want the moment to feel like, or what to change on screen'; ta.oninput=()=>{state.lines[l.id]={...(state.lines[l.id]||{}),note:ta.value}; save();}; right.append(ta);
  c.append(left,right); main.append(c); inp._upd=upd;
});
const READ_BASE=__RB__, READ_WORD=__RW__;
let t=null; function save(){ progress(); clearTimeout(t); t=setTimeout(()=>fetch('/answers',{method:'POST',body:JSON.stringify(state)}),300); }
function progress(){ const n=Object.values(state.lines).filter(a=>a.changed||a.note).length; document.getElementById('prog').textContent=n+' of '+L.length+' changed'; }
document.getElementById('submit').onclick=async()=>{ await fetch('/submit',{method:'POST',body:JSON.stringify(state)}); document.getElementById('main').style.display='none'; document.querySelector('header').style.display='none'; document.getElementById('thanks').style.display='block'; };
fetch('/answers').then(r=>r.json()).then(s=>{ if(s&&s.lines){ state=s; for(const [id,a] of Object.entries(s.lines)){ const c=document.querySelector('.card[data-id="'+id+'"]'); if(!c) continue; const inp=c.querySelector('input.line'); if(a.text!=null){ inp.value=a.text; } if(a.note) c.querySelector('textarea').value=a.note; inp._upd(); } } document.querySelectorAll('input.line').forEach(i=>i._upd()); }).catch(()=>document.querySelectorAll('input.line').forEach(i=>i._upd()));
"""

def cues():
    r = subprocess.run(['bash', os.path.join(HERE, 'cues.sh'), '/tmp/promo-cues.json'], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists('/tmp/promo-cues.json'):
        sys.exit('cues.sh failed:\n' + r.stdout + r.stderr)
    return json.load(open('/tmp/promo-cues.json'))

def stills(cs):
    """One JPEG per line from out/draft.mp4, 14 frames into the bubble (it has popped in by then)."""
    os.makedirs(STILLS, exist_ok=True)
    draft = os.path.join(HERE, 'out', 'draft.mp4')
    if not os.path.exists(draft): sys.exit('no out/draft.mp4 — render the draft first (npm run render:draft)')
    expr = '+'.join(f"eq(n\\,{c['at'] + 14})" for c in cs)
    for f in os.listdir(STILLS): os.remove(os.path.join(STILLS, f))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', draft, '-vf', f"select='{expr}'", '-vsync', 'vfr', '-q:v', '3', os.path.join(STILLS, 'line-%02d.jpg')], check=True)
    return [f'line-{i + 1:02d}.jpg' for i in range(len(cs))]

def lines(cs, names):
    out = []
    for i, (c, n) in enumerate(zip(cs, names)):
        frames = (c['until'] or 0) - c['at'] + 2          # +2: the bubble pops in two frames after its line starts (beat.ts)
        headline, screen = SCREEN.get(c['text'], ('', ''))
        out.append({'id': f'l{i + 1:02d}', 'beat': c['beat'][1:], 'time': f"{int(c['sec'] // 60)}:{int(c['sec'] % 60):02d}", 'len': c['len'], 'frames': frames,
                    'fits': max(0, (frames - READ_BASE) // READ_WORD), 'text': c['text'], 'headline': headline, 'screen': screen, 'still': n})
    return out

def render(ls):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The host's lines</title><style>{CSS}</style></head>
<body><header><h1>The host's lines — edit any of them</h1><span class="prog" id="prog"></span><button class="submit" id="submit">Submit</button></header>
<main id="main"><p class="intro">One card per line, in film order. The picture is the exact moment from the draft. Rewrite the line in the box; the counter tells you how many words that moment can hold (the music cuts every 2.1 s and a line needs 1.2 s plus a quarter second a word to be read). A red counter means the line will not fit unless the shot gets more time — you can still submit it and say so in the note. Leave a line alone to keep it. Submit when you are done; I copy the changes into the film.</p></main>
<div class="thanks" id="thanks">Got it. Your lines are saved — I'll put them in the film.</div>
<script>{JS.replace('__L__', json.dumps(ls)).replace('__RB__', str(READ_BASE)).replace('__RW__', str(READ_WORD))}</script></body></html>"""

def summary(ls, state):
    rows = []
    for l in ls:
        a = (state.get('lines') or {}).get(l['id']) or {}
        if a.get('changed') or a.get('note'):
            rows.append(f"  {l['time']} {l['beat']:>3}  \"{l['text']}\" → \"{a.get('text', l['text']).strip()}\"" + (f"   note: {a['note']}" if a.get('note') else ''))
    return '\n'.join(rows) if rows else '  (no changes)'

def main(argv):
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8791); ap.add_argument('--no-open', action='store_true'); ap.add_argument('--build', action='store_true')
    a = ap.parse_args(argv)
    cs = cues(); names = stills(cs); ls = lines(cs, names); page = render(ls).encode()
    if a.build:
        p = os.path.join(DOCS, 'script-editor.html'); open(p, 'w').write(page.decode().replace("'stills/'", "'script/'")); print('wrote', p); return 0
    class H(BaseHTTPRequestHandler):
        def log_message(self, *x): pass
        def _j(self, code, obj):
            b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            if self.path == '/answers': return self._j(200, json.load(open(OUT)) if os.path.exists(OUT) else {})
            if self.path.startswith('/stills/'):
                f = os.path.join(STILLS, os.path.basename(self.path))
                if os.path.exists(f):
                    b = open(f, 'rb').read(); self.send_response(200); self.send_header('Content-Type', 'image/jpeg'); self.send_header('Content-Length', str(len(b))); self.end_headers(); return self.wfile.write(b)
                return self._j(404, {})
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(page))); self.end_headers(); self.wfile.write(page)
        def do_POST(self):
            host = (self.headers.get('Host') or '').split(':')[0]
            if host not in ('127.0.0.1', 'localhost'): return self._j(403, {'error': 'loopback only'})
            n = int(self.headers.get('Content-Length') or 0); state = json.loads(self.rfile.read(n) or b'{}')
            if self.path == '/submit':
                import datetime; state['submitted'] = datetime.datetime.now().isoformat(timespec='seconds')
            tmp = OUT + '.tmp'; json.dump(state, open(tmp, 'w'), indent=1); os.replace(tmp, OUT)
            self._j(200, {'ok': True})
            if self.path == '/submit': self.server.done = True
    srv = HTTPServer(('127.0.0.1', a.port), H); srv.done = False
    url = f'http://127.0.0.1:{a.port}/'; print(f'[script] {url}  ({len(ls)} lines; answers → {OUT})', flush=True)
    if not a.no_open: webbrowser.open(url)
    while not srv.done: srv.handle_request()
    print('[script] submitted →', OUT); print(summary(ls, json.load(open(OUT)))); return 0

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
