#!/usr/bin/env python3
"""Deck mockup G — F plus an adaptive layout (2026-08-27):
The page measures the space it has and the crop's shape, then scores four arrangements —
  A  Before | After side by side, cards in a row below
  B  Before over After (stacked) on the left, cards in a column on the right
  C  Before | After side by side on the left, cards in a column on the right
  D  Before over After, cards in a row below
— and uses whichever shows the pictures LARGEST (ties go to A). Re-picks on every resize, so
the same deck adapts to a browser tab, a narrow file panel, or a phone. Steps alternate between
a tall crop (Themes dialog 440×600) and a wide one (Marketplace hero 900×200) to show it moving.
Also: the bottom bar only reserves room for the file panel's Edit floater when the page is
embedded (window.top !== window) — in a browser tab there is no floater."""
import base64, os, sys

IMG = '/home/destin/youcoded-dev/docs/active/design/2026-08-25-ui-audit/images/phase-c-review'
OUT = sys.argv[1]
THEMES = [('midnight', 'Midnight'), ('light', 'Light'), ('halftone-dimension', 'Halftone')]
COLS = [('before', 'Before'), ('after', 'After')]
N = 13
CROPS = {
    'themes-dialog': {'box': {'after': (5, 16, 90, 12), 'before': (5, 14, 90, 10)}, 'where': ('Themes dialog', 'Settings → Appearance'),
                      'what': 'Every theme card is now the same height, so the active card no longer grows and stretches its neighbour.',
                      'changed': 'Picture on top, one text row at the bottom, every card 92 px tall. Built-ins got preview pictures from the marketplace generator; other themes show their own preview.',
                      'num': 'Measured: Dark 65 px vs Crème 34 px before',
                      'notice': 'The grid stops jumping when you pick a theme, and every card shows a real preview picture instead of a colour strip.',
                      'risk': 'In these screenshots Halftone and Meadow still show the colour strip because the rig cannot serve theme folders; in the app they show their own preview.'},
    'market-hero': {'box': {'after': (1, 22, 26, 62), 'before': (1, 22, 26, 62)}, 'where': ('Marketplace — featured card', 'Marketplace'),
                    'what': 'The featured card uses the theme’s normal card edge; the gold border is gone.',
                    'changed': 'One border style for every card. The “Featured” eyebrow alone marks the featured plugin.',
                    'num': 'Measured: 1 of 6 border colours remains',
                    'notice': 'The Marketplace opens calmer — no single card shouts — and the featured one still reads first because it sits first.',
                    'risk': ''},
}

def data(name):
    with open(os.path.join(IMG, name), 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()

ICON_CHANGE = '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12.5 7.5 4 4"/></svg>'
ICON_EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
ICON_WARN = '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6"/></svg>'

def step_html(crop):
    c = CROPS[crop]
    frames = ''.join(
        f'<figure class="frame" data-theme="{t}" data-col="{col}"><figcaption>{l}</figcaption><div class="pic"><img src="{data(f"{crop}--{t}--{col}.png")}" alt="">'
        f'<span class="box" style="left:{c["box"][col][0]}%;top:{c["box"][col][1]}%;width:{c["box"][col][2]}%;height:{c["box"][col][3]}%"></span></div></figure>'
        for t, _ in THEMES for col, l in COLS)
    thumbs = ''.join(f'<button class="thumb" data-v="{t}" title="{l}"><img src="{data(f"{crop}--{t}--after.png")}" alt=""><span>{l}</span></button>' for t, l in THEMES)
    risk = f'<section class="card risk"><h3>{ICON_WARN}Risk</h3><p>{c["risk"]}</p></section>' if c['risk'] else ''
    return f'''<div class="step" data-crop="{crop}" data-title="{c["where"][0]}" data-sub="{c["where"][1]}">
  <div class="thumbs">{thumbs}</div>
  <div class="content">
    <div class="stage"><div class="zoom"><button class="zout" title="Zoom out (−)">−</button><span class="lvl">100%</span><button class="zin" title="Zoom in (+)">+</button></div><div class="inner">{frames}</div></div>
    <div class="info"><p class="what">{c["what"]}</p><div class="cards">
      <section class="card"><h3>{ICON_CHANGE}What changed</h3><p>{c["changed"]}</p><p class="num">{c["num"]}</p></section>
      <section class="card"><h3>{ICON_EYE}You'll notice</h3><p>{c["notice"]}</p></section>{risk}</div></div>
  </div></div>'''

steps_html = step_html('themes-dialog') + step_html('market-hero')

TOKENS = '''
[data-theme="midnight"]{--canvas:#0D1117;--panel:#161B22;--inset:#21262D;--well:#0D1117;--accent:#B1BAC4;--on-accent:#0D1117;--fg:#C9D1D9;--fg-2:#A0AAB4;--fg-dim:#8B949E;--fg-muted:#6E7681;--fg-faint:#4E555E;--edge:#343A41;--link:#58A6FF;color-scheme:dark}
[data-theme="light"]{--canvas:#F2F2F2;--panel:#EAEAEA;--inset:#D7D7D7;--well:#F9F9F9;--accent:#1A1A1A;--on-accent:#F2F2F2;--fg:#1A1A1A;--fg-2:#444;--fg-dim:#656565;--fg-muted:#797979;--fg-faint:#989898;--edge:#C0C0C0;--link:#2055CA;color-scheme:light}
[data-theme="halftone-dimension"]{--canvas:#08060e;--panel:#100e1c;--inset:#181430;--well:#0C0A14;--accent:#E51F48;--on-accent:#fff;--fg:#F0E8F8;--fg-2:#D4CAE4;--fg-dim:#A498C0;--fg-muted:#7468A0;--fg-faint:#4D417A;--edge:#372D56;--link:#ff6b8f;color-scheme:dark;--radius-md:16px;--radius-lg:24px}
:root{--radius-sm:4px;--radius-md:8px;--radius-lg:12px;--radius-full:9999px;--yes:#2E9B57;--no:#E5484D;--other:#C99700;--mark:#FFB020;--font:'Cascadia Mono','Cascadia Code','Fira Code',monospace}
'''

CSS = TOKENS + '''
*{box-sizing:border-box} html,body{height:100%;margin:0}
body{font:13px/1.45 var(--font);color:var(--fg);background:var(--well);display:flex;flex-direction:column;padding:18px 10px 10px}
.deck{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--canvas);border:2px solid rgba(255,176,32,.6);border-radius:14px;overflow:visible;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 8px 30px rgba(0,0,0,.25)}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-weight:500}
/* the chip sits ON the frame: tool name | deck title */
.chip{position:absolute;top:-13px;left:18px;z-index:5;display:inline-flex;align-items:center;height:26px;background:var(--mark);color:#1a1100;border-radius:7px;padding:0 10px 0 9px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.chip .k{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase} .chip .div{width:1px;height:14px;background:rgba(0,0,0,.35);margin:0 9px} .chip .t{font-size:12px;font-weight:500;white-space:nowrap}
:root{--content:clamp(900px,80vw,1640px)}
.wrap{width:min(var(--content),100%);margin:0 auto;display:flex;align-items:center;gap:14px;min-width:0}
.top{height:clamp(56px,6vh,64px);flex:none;display:flex;padding:8px 20px 0;background:var(--panel);border-bottom:1px solid var(--edge);border-radius:12px 12px 0 0}
.top .where{min-width:0} .top .where .id{white-space:nowrap} @media (max-width:1400px){.top .where .eyebrow,.top .where .sep{display:none}} @media (max-width:950px){.top .count{display:none}}
.nav{display:flex;align-items:center;gap:8px;flex:1;justify-content:center;min-width:0} .top .where{flex:none}
.steps{display:flex;gap:3px;align-items:center;flex:1;max-width:360px;min-width:90px} .steps span{flex:1;height:7px;border-radius:3px;background:var(--inset);cursor:pointer;transition:transform .15s}
.steps span:hover{transform:scaleY(1.4)} .steps span.on{box-shadow:0 0 0 2px var(--panel),0 0 0 3px var(--fg)}
.steps span.yes{background:var(--yes)} .steps span.no{background:var(--no)} .steps span.other{background:var(--other)} .steps span.skip{background:var(--fg-faint)}
.count{font-size:11px;color:var(--fg-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.btn{font:inherit;font-size:12px;font-weight:500;height:32px;padding:0 14px;border-radius:var(--radius-md);border:1px solid var(--edge);background:transparent;color:var(--fg);cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;transition:background .15s,transform .15s,filter .15s}
.btn.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)} .btn.ghost{border-color:transparent;color:var(--fg-2)} .btn.sm{height:28px;padding:0 10px}
@media (hover:hover){ .btn:hover{background:var(--inset)} .btn.primary:hover{background:var(--accent);filter:brightness(1.12);transform:translateY(-1px)} .btn.ghost:hover{background:var(--inset);color:var(--fg)} }
.btn:disabled{opacity:.45;cursor:default;transform:none;filter:none}
.dot{width:8px;height:8px;border-radius:50%;flex:none} .dot.yes{background:var(--yes)} .dot.no{background:var(--no)} .dot.other{background:var(--other)}
.ans{border-color:var(--edge)} .ans.on{background:var(--inset);border-color:var(--fg);box-shadow:inset 0 0 0 1px var(--fg)}
main{flex:1;min-height:0;display:flex;justify-content:center;padding:14px 20px 16px;overflow:auto}
.step{display:none;width:min(var(--content),100%);flex-direction:column;gap:10px;min-height:0} .step.on{display:flex}
.where{display:flex;align-items:center;gap:10px} .where .id{font-weight:500;font-size:14px} .where .sep{color:var(--fg-faint)}
.step{position:relative}
.thumbs{position:absolute;left:calc(100% + 16px);top:0;display:flex;flex-direction:column;gap:10px}
body.thumbs-inline .thumbs{position:static;flex-direction:row;justify-content:flex-end;margin-bottom:8px}
.thumb{border:2px solid transparent;border-radius:var(--radius-md);padding:3px;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font:11px var(--font);color:var(--fg-dim)}
.thumb img{height:44px;width:auto;max-width:110px;object-fit:cover;border-radius:3px;display:block} .thumb.on{border-color:var(--accent);color:var(--fg)}
/* ── adaptive content: layout class chosen by JS ── */
.content{flex:1;min-height:0;display:grid;gap:12px}
.content.row-below{grid-template-columns:1fr;grid-template-rows:1fr auto auto;grid-template-areas:"stage" "info" "ctl"}          /* A, D */
.content.col-right{grid-template-columns:1fr minmax(320px,30%);grid-template-rows:1fr auto;grid-template-areas:"stage info" "ctl ctl"} /* B, C */
.content.compact{display:flex;flex-direction:column;flex:none}                    /* too small for any arrangement: one scrolling column */
.compact .stage{flex:none;overflow:visible} .compact .stage .inner{flex-direction:column;align-items:center} .compact .info{overflow:visible}
.step.compact-step{flex:none;min-height:0}
.stage{grid-area:stage} .info{grid-area:info} .controls{grid-area:ctl}
/* the three peer containers share one frame style */
.info,.controls{background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg)}
.info{padding:14px 16px} .controls{padding:clamp(10px,1.2vh,14px) 16px;display:flex;flex-wrap:wrap;align-items:center;gap:clamp(8px,0.8vw,14px)}
.compact .controls{display:grid;grid-template-columns:1fr 1fr 1fr;position:sticky;bottom:0;z-index:3;box-shadow:0 -8px 20px rgba(0,0,0,.35)} .compact .controls .ans{max-width:none} .compact .controls .note{grid-column:1/3} .compact .controls #save{grid-column:3}
body.embedded .deck{margin-bottom:62px}   /* the file panel's floating Edit button lives in this strip */
.stage{position:relative;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);overflow:auto;min-height:0;line-height:0;font-size:0}
.stage .inner{display:flex;justify-content:center;align-items:center;gap:18px;padding:12px 14px;min-width:100%;min-height:100%}
.content.stacked .stage .inner{flex-direction:column;align-items:center}
.frame{display:none;margin:0} .frame.on{display:block}
figcaption{font:500 11px/1 var(--font);text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);margin-bottom:6px;text-align:left}
.pic{position:relative;display:inline-block} .pic img{display:block;height:auto;border-radius:var(--radius-sm);cursor:none}
.box{position:absolute;border:2px solid var(--mark);border-radius:5px;box-shadow:0 0 0 3px rgba(255,176,32,.28),0 0 14px rgba(0,0,0,.45);pointer-events:none}
.zoom{position:sticky;top:10px;float:right;margin:10px 10px -42px 0;z-index:2;display:inline-flex;align-items:center;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-full);padding:2px;gap:2px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.zoom button{font:inherit;font-size:12px;font-weight:500;width:28px;height:26px;border:0;border-radius:var(--radius-full);background:transparent;color:var(--fg-2);cursor:pointer} .zoom .lvl{font-size:11px;color:var(--fg-dim);min-width:38px;text-align:center;font-variant-numeric:tabular-nums}
.loupe{position:fixed;width:180px;height:180px;border-radius:50%;border:2px solid var(--fg);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 8px 24px rgba(0,0,0,.45);background-repeat:no-repeat;pointer-events:none;display:none;z-index:9;background-color:var(--panel)}
.loupe::before,.loupe::after{content:"";position:absolute;left:50%;top:50%;background:var(--mark);box-shadow:0 0 0 1px rgba(0,0,0,.6)} .loupe::before{width:14px;height:2px;margin:-1px 0 0 -7px} .loupe::after{width:2px;height:14px;margin:-7px 0 0 -1px}
.info{display:flex;flex-direction:column;gap:12px;min-width:0;overflow:auto}
.what{font-size:clamp(15px,1.15vw,19px);font-weight:500;margin:0;line-height:1.35}
.cards{display:grid;gap:10px} .row-below .cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))} .col-right .cards{grid-template-columns:1fr}
.card{background:var(--inset);border:1px solid var(--edge);border-radius:var(--radius-md);padding:10px 12px} .card h3{margin:0 0 6px;font:500 11px/1 var(--font);text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);display:flex;align-items:center;gap:7px}
.card h3 svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round} .card p{margin:0;font-size:13px;color:var(--fg);line-height:1.45} .card .num{margin-top:6px;font-size:11px;color:var(--fg-dim)}
.card.risk{border-color:color-mix(in srgb, var(--mark) 45%, var(--edge))} .card.risk h3{color:var(--mark)}
.ans{flex:1 1 140px;max-width:280px;justify-content:center;height:clamp(34px,4.4vh,52px);font-size:clamp(12px,0.95vw,15px);border-radius:var(--radius-md)} .ans .dot{width:clamp(8px,0.7vw,11px);height:clamp(8px,0.7vw,11px)}
#save{height:clamp(34px,4.4vh,52px);font-size:clamp(12px,0.95vw,15px);padding:0 clamp(14px,1.4vw,26px)}
.note{flex:3 1 220px;font:inherit;font-size:clamp(12px,0.85vw,14px);height:clamp(34px,4.4vh,52px);padding:0 12px;border:1px solid var(--edge);border-radius:var(--radius-md);background:var(--well);color:var(--fg)} .note::placeholder{color:var(--fg-muted)}
@media (max-width:760px){ .top .long{display:none} .top .nav .btn{padding:0 6px} }
.veil{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:30} .veil.on{display:flex}
.dlg{width:min(520px,92vw);background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)} .dlg h2{margin:0 0 10px;font-size:16px;font-weight:500} .dlg p{margin:0 0 10px;color:var(--fg-2);font-size:13px;line-height:1.5} .dlg .warn{display:flex;gap:8px;align-items:flex-start;background:var(--inset);border:1px solid color-mix(in srgb, var(--mark) 45%, var(--edge));border-radius:var(--radius-md);padding:10px 12px;color:var(--fg);margin:12px 0}
.dlg .warn svg{width:16px;height:16px;flex:none;stroke:var(--mark);fill:none;stroke-width:1.8;margin-top:1px} .dlg .row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
#laybadge{position:fixed;left:50%;transform:translateX(-50%);bottom:2px;font:10px var(--font);color:#aaa;background:#000;border:1px solid #555;border-radius:999px;padding:3px 8px;z-index:20}
'''

JS = '''
const N=%d; const st={}; let cur=0, theme='midnight', zoom=1, loupeOn=true;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const stepsEl=$$('.step'); const loupe=$('.loupe');
const stepFor=i=>stepsEl[i%%2];                 // demo: odd steps tall crop, even steps wide crop
if(window.top!==window) document.body.classList.add('embedded');
const controls=$('.controls');
/* ── layout scoring: pick the arrangement that shows the pictures largest ── */
const CARD_COL=360, CARD_ROW=200, CTL=74, GAP=12, PAD=28, CAP=24;
function chooseLayout(step){
  const c=step.querySelector('.content'); const img=step.querySelector('.frame.on img'); if(!img||!img.naturalWidth) return;
  const w=img.naturalWidth, h=img.naturalHeight+CAP; const st=step.querySelector('.stage');
  const opts={A:'row-below',B:'col-right stacked',C:'col-right',D:'row-below stacked'}; const score={};
  step.classList.remove('compact-step');
  for(const k in opts){ if(opts[k].includes('col-right')&&c.clientWidth<820){score[k]=0;continue;}
    c.className='content '+opts[k]; const SW=st.clientWidth-PAD, SH=st.clientHeight-PAD; const stacked=opts[k].includes('stacked');
    score[k]=Math.min(stacked?SW/w:(SW-18)/2/w, stacked?(SH-18)/2/h:SH/h); }
  let best='A'; for(const k of ['B','C','D']) if(score[k]>score[best]*1.05) best=k;   // A wins ties (5%%)
  if(score[best]<0.5){ c.className='content compact'; step.classList.add('compact-step'); const SW=c.clientWidth-PAD; const s=Math.min(SW/w,1);
    step.querySelectorAll('.frame img').forEach(i=>i.style.width=(i.naturalWidth*s*zoom)+'px'); $('#laybadge').textContent='compact · '+Math.round(s*100)+'%%'; return; }
  c.className='content '+opts[best]; const s=Math.min(score[best],1.5);
  step.querySelectorAll('.frame img').forEach(i=>i.style.width=(i.naturalWidth*s*zoom)+'px');
  $('#laybadge').textContent='layout '+best+' · '+opts[best]+' · '+Math.round(s*100)+'%%'; }
function layout(){ const step=stepFor(cur); const margin=(document.querySelector('main').clientWidth-step.clientWidth)/2; document.body.classList.toggle('thumbs-inline', margin<150); step.querySelectorAll('.frame').forEach(f=>f.classList.toggle('on',f.dataset.theme===theme)); chooseLayout(step);
  step.querySelector('.lvl').textContent=Math.round(zoom*100)+'%%'; document.documentElement.dataset.theme=theme; $$('.thumb').forEach(t=>t.classList.toggle('on',t.dataset.v===theme));
  const b=step.querySelector('.frame.on .box'); if(b&&zoom>1) b.scrollIntoView({block:'center',inline:'center'}); }
function paint(){ stepsEl.forEach((s,i)=>s.classList.toggle('on',s===stepFor(cur))); stepFor(cur).querySelector('.content').appendChild(controls); $('#wtitle').textContent=stepFor(cur).dataset.title; $('#wsub').textContent=stepFor(cur).dataset.sub; const a=st[cur]||{}; $$('.ans').forEach(b=>b.classList.toggle('on',b.dataset.v===a.v));
  const note=$('.note'); note.value=a.note||''; note.placeholder=a.v==='other'?'Explain what you’d like instead…':'Add a note (optional)';
  $$('.steps span').forEach((s,i)=>{ s.className=(st[i]?.v||(st[i]?.seen?'skip':''))+(i===cur?' on':''); });
  const done=Object.values(st).filter(x=>x.v).length; $('#count').textContent='step '+(cur+1)+' of '+N+' · '+done+' answered';
  $('#save').disabled=!a.v; $('#prev').disabled=cur===0; $('#next').textContent=cur===N-1?'Last step':'Next ›'; $('#next').disabled=cur===N-1; layout(); }
function go(i){ st[cur]={...(st[cur]||{}),seen:true}; cur=Math.max(0,Math.min(N-1,i)); zoom=1; paint(); }
$$('.ans').forEach(b=>b.onclick=()=>{ st[cur]={...(st[cur]||{}),v:b.dataset.v,seen:true}; paint(); $('.note').focus(); });
$('.note').addEventListener('input',e=>{ st[cur]={...(st[cur]||{}),note:e.target.value}; });
$('#save').onclick=()=>go(cur+1); $('#next').onclick=()=>go(cur+1); $('#prev').onclick=()=>go(cur-1); $$('.steps span').forEach((s,i)=>s.onclick=()=>go(i));
$$('.zin').forEach(b=>b.onclick=()=>{zoom=Math.min(4,Math.round((zoom+0.1)*10)/10);layout();}); $$('.zout').forEach(b=>b.onclick=()=>{zoom=Math.max(1,Math.round((zoom-0.1)*10)/10);layout();});
$$('.thumb').forEach(t=>t.onclick=()=>{theme=t.dataset.v;layout();});
$('#done').onclick=()=>{ st[cur]={...(st[cur]||{}),seen:true}; const missing=[]; for(let i=0;i<N;i++) if(!st[i]?.v) missing.push(i+1);
  $('#skipped').style.display=missing.length?'flex':'none'; $('#skipn').textContent=missing.length+(missing.length===1?' step has':' steps have')+' no answer (step'+(missing.length>1?'s ':' ')+missing.join(', ')+').';
  $('#first').style.display=missing.length?'inline-flex':'none'; $('#first').onclick=()=>{ $('.veil').classList.remove('on'); go(missing[0]-1); }; $('.veil').classList.add('on'); };
$('#cancel').onclick=()=>$('.veil').classList.remove('on'); $('#submit').onclick=()=>{ $('.veil').classList.remove('on'); $('#done').textContent='Submitted ✓'; $('#done').disabled=true; };
const K=2.5,R=90;
$$('.stage').forEach(stage=>{ stage.addEventListener('mousemove',e=>{ if(!loupeOn){loupe.style.display='none';return;} const img=$$('.step.on .frame.on img').find(i=>{const r=i.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;}); if(!img){loupe.style.display='none';return;}
  const r=img.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top; loupe.style.display='block'; loupe.style.left=(e.clientX-R)+'px'; loupe.style.top=(e.clientY-R)+'px'; loupe.style.backgroundImage='url('+img.src+')'; loupe.style.backgroundSize=(r.width*K)+'px '+(r.height*K)+'px'; loupe.style.backgroundPosition=(-x*K+R)+'px '+(-y*K+R)+'px'; });
  stage.addEventListener('mouseleave',()=>loupe.style.display='none'); });
document.addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT')return; if(e.key==='ArrowRight')go(cur+1); if(e.key==='ArrowLeft')go(cur-1); if(e.key==='+'||e.key==='=')$('.step.on .zin').click(); if(e.key==='-')$('.step.on .zout').click(); if(e.key==='l'){loupeOn=!loupeOn; if(!loupeOn)loupe.style.display='none'; $$('.pic img').forEach(i=>i.style.cursor=loupeOn?'none':'default');} });
const Q=new URLSearchParams(location.search); if(Q.get('theme'))theme=Q.get('theme'); if(Q.get('step'))cur=+Q.get('step')-1;
if(Q.get('demo')){ st[0]={v:'yes',seen:true}; st[1]={v:'no',seen:true}; st[2]={seen:true}; st[3]={v:'other',note:'make the pencil bigger',seen:true}; cur=Q.get('step')?cur:4; }
window.addEventListener('resize',layout); window.addEventListener('load',paint); $$('.frame img').forEach(i=>i.addEventListener('load',layout)); paint();
if(Q.get('dialog')){ window.addEventListener('load',()=>$('#done').click()); }
'''

steps = '<div class="steps" title="Click a segment to revisit that step">' + ''.join('<span></span>' for _ in range(N)) + '</div>'

page = f'''<!doctype html><html lang="en" data-theme="midnight"><head><meta charset="utf-8"><title>Deck mockup G</title><style>{CSS}</style></head><body>
<div class="deck">
<div class="chip"><span class="k">Review deck</span><span class="div"></span><span class="t">Phase C review</span></div>
<header class="top"><div class="wrap"><div class="where"><span class="id" id="wtitle"></span><span class="sep">·</span><span class="eyebrow" id="wsub"></span></div>
  <div class="nav"><button class="btn ghost sm" id="prev">‹ Prev</button>{steps}<button class="btn ghost sm" id="next">Next ›</button></div>
  <span class="count" id="count"></span><button class="btn" id="done">Done<span class="long"> — Submit Feedback</span></button></div></header>
<main>{steps_html}</main>
<div class="controls"><button class="btn ans" data-v="yes"><span class="dot yes"></span>Yes, keep it</button>
<button class="btn ans" data-v="no"><span class="dot no"></span>No, revert it</button>
<button class="btn ans" data-v="other"><span class="dot other"></span>Other</button>
<input class="note" placeholder="Add a note (optional)">
<button class="btn primary" id="save">Save &amp; Next ›</button></div>
</div>
<div class="loupe"></div><span id="laybadge" title="mockup only: which layout the page chose"></span>
<div class="veil"><div class="dlg"><h2>Submit your feedback?</h2>
<p>Your answers have been saving to a file next to this deck as you went. Submitting tells Claude you're finished — it picks them up in the session and replies there. <b>Nothing to copy or paste</b>: close this tab and go back to the conversation.</p>
<div class="warn" id="skipped">{ICON_WARN}<span><span id="skipn"></span> Skipped steps are sent as "no answer"; Claude will leave those unchanged.</span></div>
<div class="row"><button class="btn ghost" id="cancel">Keep reviewing</button><button class="btn" id="first">Go to first skipped</button><button class="btn primary" id="submit">Submit</button></div></div></div>
<script>{JS % N}</script></body></html>'''

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, '2026-08-27-deck-mockup-g.html'), 'w').write(page)
print('ok')
