#!/usr/bin/env python3
"""Question deck — the page Destin answers a BATCH of questions on (four or more).

  python3 scripts/questions/serve.py <spec.json> [--port N] [--no-open] [--timeout MIN]
        render the page, serve it on loopback, open the browser, save answers to
        <spec-stem>.answers.json as they arrive, print a summary and exit when he submits
  python3 scripts/questions/serve.py <spec.json> --build
        only write <spec-stem>.html next to the spec (for a look before serving)

WHY this exists: a list of 38 questions in a chat message was rejected on 2026-09-01
("this sucks as an answer surface"). A wall of one-liners assumes the reader remembers every
item; he doesn't — he filed some months ago. Every question is therefore written for someone
with NO context, in plain words, in four parts that the page renders as labelled blocks:
  today     — what exists now: which part of the app, what it does for the user
  problem   — what goes wrong or what is missing, as the user experiences it
  proposal  — what would change, again as the user would notice it
  options   — the choices; each carries pros/cons ABOUT THE USER'S EXPERIENCE
Wording-only questions with fewer than four items still go in chat.

Spec (JSON):
  {"title": "...", "intro": "...",
   "sections": [{"title": "...", "intro": "...",
     "questions": [{"id": "slug", "area": "sync", "today": "...", "problem": "...", "proposal": "...",
                    "options": [{"label": "...", "pros": ["..."], "cons": ["..."]}, ...]}]}]}
  An `options` list of plain strings is allowed (no pros/cons). Omit `options` for a
  Yes / No / Don't know question; then `proposal` should say what each answer leads to.
  "Other" (with the note box) is always added.
Answers file: {"answers": {"<id>": {"pick": "<label>", "note": "..."}}, "submitted": "<iso>"}.
The server binds 127.0.0.1 only and refuses a POST whose Host is not loopback (a page on
another origin could otherwise forge a Submit). Run `serve` in the background: its exit is
the "he submitted" signal and it prints every answer.
"""
import argparse, html, json, os, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

CSS = """
:root{--bg:#f6f7f9;--card:#fff;--fg:#1b1d22;--muted:#6b7280;--line:#e3e6ea;--acc:#2f6fed;--acc2:#e9f0ff;--ok:#148a4b;--pro:#177a44;--con:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e23;--fg:#e8eaee;--muted:#9aa2ad;--line:#2b3037;--acc:#5b8dff;--acc2:#1f2a44;--ok:#3fbf7f;--pro:#4fc98a;--con:#ff7b72}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--card);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0;flex:1}.prog{color:var(--muted);font-size:14px}
button.submit{background:var(--acc);color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;font-weight:600;cursor:pointer}
button.submit[disabled]{opacity:.45;cursor:not-allowed}
main{max-width:920px;margin:0 auto;padding:20px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:28px 0 10px}
.intro{color:var(--muted);margin:0 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}.card.done{border-color:var(--ok)}
.area{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.part{margin:0 0 10px}.part b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px}
.opts{display:grid;gap:8px;margin-top:12px}
.opt{border:1px solid var(--line);border-radius:10px;padding:10px 14px;cursor:pointer;background:var(--bg)}
.opt.on{background:var(--acc2);border-color:var(--acc)}.opt .lab{font-weight:600}
.opt ul{margin:6px 0 0;padding-left:18px;font-size:14px}.opt li.pro::marker{color:var(--pro)}.opt li.con::marker{color:var(--con)}
.opt li.pro{color:var(--fg)}.opt li.con{color:var(--fg)}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.row .opt{flex:1 1 120px;text-align:center}
textarea{width:100%;margin-top:10px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;background:var(--bg);color:var(--fg);resize:vertical;min-height:38px}
.thanks{display:none;text-align:center;padding:60px 20px;font-size:20px}
"""

JS = r"""
const Q=__Q__;let state={answers:{}};
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!==undefined)e.innerHTML=h;return e};
function part(c,label,text){ if(!text) return; const p=el('div','part'); p.append(el('b','',label)); p.append(document.createTextNode(text)); c.append(p); }
function card(container,q){
  const c=el('div','card'); c.dataset.id=q.id; c.append(el('div','area',q.area||''));
  part(c,'Today',q.today); part(c,'The problem',q.problem); part(c,'Proposal',q.proposal);
  const opts=q.options?q.options.map(o=>typeof o==='string'?{label:o}:o):[{label:'Yes'},{label:'No'},{label:"Don't know"}];
  const rich=opts.some(o=>(o.pros&&o.pros.length)||(o.cons&&o.cons.length));
  const o=el('div',rich?'opts':'row'); const btns=[];
  const pick=(label,b)=>{state.answers[q.id]={...(state.answers[q.id]||{}),pick:label}; btns.forEach(x=>x.classList.toggle('on',x===b)); c.classList.add('done'); save();};
  opts.concat([{label:'Other'}]).forEach(op=>{ const b=el('div','opt'); b.setAttribute('role','button'); b.tabIndex=0; b.append(el('div','lab',op.label));
    if(rich&&((op.pros&&op.pros.length)||(op.cons&&op.cons.length))){ const ul=el('ul'); (op.pros||[]).forEach(t=>{const li=el('li','pro',t);ul.append(li)}); (op.cons||[]).forEach(t=>{const li=el('li','con',t);ul.append(li)}); b.append(ul); }
    b.onclick=()=>{pick(op.label,b); if(op.label==='Other') ta.focus();}; b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}}; btns.push(b); o.append(b); });
  c.append(o);
  const ta=el('textarea'); ta.placeholder='Note (optional — required if you picked Other)'; ta.oninput=()=>{state.answers[q.id]={...(state.answers[q.id]||{}),note:ta.value}; save();}; c.append(ta);
  container.append(c);
}
const main=document.getElementById('main'); let total=0;
Q.sections.forEach(s=>{ main.append(el('h2','',s.title)); if(s.intro) main.append(el('p','intro',s.intro)); const d=el('div'); main.append(d); s.questions.forEach(q=>{card(d,q); total++;}); });
let t=null; function save(){ progress(); clearTimeout(t); t=setTimeout(()=>fetch('/answers',{method:'POST',body:JSON.stringify(state)}),300); }
function progress(){ const n=Object.values(state.answers).filter(a=>a.pick).length; document.getElementById('prog').textContent=n+' of '+total+' answered'; document.getElementById('submit').disabled=n===0; }
document.getElementById('submit').onclick=async()=>{ const n=Object.values(state.answers).filter(a=>a.pick).length; if(n<total && !confirm((total-n)+' unanswered — submit anyway? Unanswered items stay as they are.')) return; await fetch('/submit',{method:'POST',body:JSON.stringify(state)}); document.getElementById('main').style.display='none'; document.querySelector('header').style.display='none'; document.getElementById('thanks').style.display='block'; };
fetch('/answers').then(r=>r.json()).then(s=>{ if(s&&s.answers){ state=s; for(const [id,a] of Object.entries(s.answers)){ const c=document.querySelector('.card[data-id="'+id+'"]'); if(!c) continue; if(a.pick){ c.querySelectorAll('.opt').forEach(b=>b.classList.toggle('on',b.querySelector('.lab').textContent===a.pick)); c.classList.add('done'); } if(a.note) c.querySelector('textarea').value=a.note; } } progress(); }).catch(progress);
"""

def render(spec):
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{html.escape(spec["title"])}</title><style>{CSS}</style></head><body>'
            f'<header><h1>{html.escape(spec["title"])}</h1><span class="prog" id="prog"></span><button class="submit" id="submit" disabled>Submit</button></header>'
            f'<main id="main"><p class="intro">{html.escape(spec.get("intro",""))}</p></main>'
            '<div class="thanks" id="thanks">Submitted. You can close this tab.</div>'
            '<script>' + JS.replace('__Q__', json.dumps(spec)) + '</script></body></html>')

def validate(spec):
    errs = []
    ids = set()
    for s in spec.get('sections', []):
        for q in s.get('questions', []):
            for k in ('id', 'today', 'problem', 'proposal'):
                if not q.get(k): errs.append(f'question {q.get("id","?")}: missing `{k}`')
            if q.get('id') in ids: errs.append(f'duplicate id {q["id"]}')
            ids.add(q.get('id'))
    if not ids: errs.append('no questions')
    return errs

def summary(spec, state):
    out = []
    for s in spec['sections']:
        for q in s['questions']:
            a = (state.get('answers') or {}).get(q['id']) or {}
            line = f'- {q["id"]} [{q.get("area","")}] → {a.get("pick") or "(unanswered)"}'
            if a.get('note'): line += f' — note: {a["note"].strip()}'
            out.append(line)
    return '\n'.join(out)

def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('spec'); ap.add_argument('--port', type=int, default=8765); ap.add_argument('--no-open', action='store_true')
    ap.add_argument('--build', action='store_true'); ap.add_argument('--timeout', type=float, default=240, help='minutes to wait for a submit (exit 2 after)')
    a = ap.parse_args(argv)
    spec = json.load(open(a.spec)); errs = validate(spec)
    if errs: print('\n'.join(errs), file=sys.stderr); return 1
    stem = os.path.splitext(os.path.abspath(a.spec))[0]; page = render(spec).encode(); out = stem + '.answers.json'
    if a.build:
        open(stem + '.html', 'w').write(page.decode()); print('wrote', stem + '.html'); return 0
    done = threading.Event()
    class H(BaseHTTPRequestHandler):
        def log_message(self, *x): pass
        def _j(self, code, obj):
            b = json.dumps(obj).encode(); self.send_response(code); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            if self.path == '/answers':
                return self._j(200, json.load(open(out)) if os.path.exists(out) else {})
            self.send_response(200); self.send_header('content-type', 'text/html; charset=utf-8'); self.send_header('content-length', str(len(page))); self.end_headers(); self.wfile.write(page)
        def do_POST(self):
            if self.headers.get('host', '').split(':')[0] not in ('127.0.0.1', 'localhost'): return self._j(403, {'error': 'wrong host'})
            try: state = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))) or b'{}')
            except ValueError: return self._j(400, {'error': 'body is not JSON'})
            if self.path == '/submit': state['submitted'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            tmp = out + '.tmp'; json.dump(state, open(tmp, 'w'), indent=1); os.replace(tmp, out)
            self._j(200, {'ok': True})
            if self.path == '/submit': done.set()
    # WHY: the first deck of 2026-09-01 was left serving on 8765; the rebuilt one died with
    # "Address already in use" and the browser opened the STALE page. Walk up to a free port.
    srv = None
    for port in range(a.port, a.port + 20):
        try: srv = HTTPServer(('127.0.0.1', port), H); a.port = port; break
        except OSError: continue
    if srv is None: print(f'[questions] no free port in {a.port}..{a.port + 19}', file=sys.stderr); return 1
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{a.port}/'; print(f'[questions] {url}')
    if not a.no_open: webbrowser.open(url)
    if not done.wait(a.timeout * 60):
        print('[questions] timed out waiting for Submit'); srv.shutdown(); return 2
    time.sleep(0.5); srv.shutdown()
    print(f'[questions] submitted → {out}\n' + summary(spec, json.load(open(out)))); return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
