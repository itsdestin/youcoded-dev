"""The approved page, made to run as Destin's own YouCoded page (`build.py --page-mode`).

WHY (Destin, 2026-10-16, plan deck Q-7/Q-8: his own page in his Pages folder, using only abilities any page has):
inside YouCoded the page sits in a frame that follows the app's theme, cannot load files, and talks to the app
only through `window.youcoded`. So, in page mode only:
  - the page's own header goes (the app's band already shows the page's name), and with it the theme picker,
    the Draft tag and "Facts as of Oct 12" (deck Q-10: the header date goes);
  - its own colour themes go, so the app's live theme variables (same names: --canvas, --panel, --fg …) apply;
  - pictures load through the page's program, a batch at a time, only when they scroll into view;
  - every button that said "Not built yet" does its real job: chats through the chats ability, new chats
    through the start-a-conversation ability, item changes through the program.
"""
import re

# One page-mode script, run after every other script on the page. It replaces the "not built yet" toast
# handler for the buttons it knows by running first (capture phase) and stopping the event.
JS = r'''
(()=>{
const Y=window.youcoded, PROG='work-items.mjs';
async function run(req){
  if(!Y||!Y.program)throw new Error('This page needs YouCoded with page programs.');
  const r=await Y.program.run(PROG,JSON.stringify(req));
  if(!r.ok)throw new Error(r.reason||'The page\'s program did not run.');
  let j;try{j=JSON.parse(r.output||'{}')}catch{throw new Error('The page\'s program answered with something unreadable.')}
  if(j.error)throw new Error(j.error);return j}
window.boardRun=run;
// WHY window.name: it survives a reload of this frame, so the message from a save is shown after the redraw
window.boardDone=msg=>{window.name='board-toast:'+msg;location.reload()};
if(window.name.startsWith('board-toast:')){const m=window.name.slice(12);window.name='';setTimeout(()=>toast(m),300)}

// ---------- pictures: asked for only when they come into view, a batch at a time ----------
const PIC=new Map(),WANT=new Set();let busy=false;
const isFile=s=>/^(thumbs|shots)\//.test(s||'');
async function pump(){if(busy||!WANT.size)return;busy=true;const names=[...WANT].slice(0,60);
  try{const j=await run({op:'pictures',names});for(const n of names){WANT.delete(n);if(j.pictures[n])PIC.set(n,j.pictures[n])}
    document.querySelectorAll('img[data-pic]').forEach(i=>{const u=PIC.get(i.dataset.pic);if(u&&i.src!==u)i.src=u})}
  catch{names.forEach(n=>WANT.delete(n))}busy=false;if(WANT.size)pump()}
const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){const n=e.target.dataset.pic;io.unobserve(e.target);if(PIC.has(n))e.target.src=PIC.get(n);else{WANT.add(n)}}pump()},{rootMargin:'400px'});
function adopt(img){const s=img.getAttribute('src');if(!isFile(s))return;const n=decodeURIComponent(s);img.dataset.pic=n;img.removeAttribute('src');if(PIC.has(n))img.src=PIC.get(n);else io.observe(img)}
document.querySelectorAll('img').forEach(adopt);
new MutationObserver(ms=>{for(const m of ms){if(m.type==='attributes'&&m.target.tagName==='IMG')adopt(m.target);
  for(const n of m.addedNodes||[])if(n.nodeType===1){if(n.tagName==='IMG')adopt(n);n.querySelectorAll&&n.querySelectorAll('img').forEach(adopt)}}})
  .observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});

// ---------- chats: which are open now, and which belong to which item ----------
let CHATS=[];
const C=window.LCARDS||{};
const branchesOf=id=>(C[id]&&C[id].work)||[];
const chatsOf=id=>CHATS.filter(c=>c.branch&&branchesOf(id).includes(c.branch)).sort((a,b)=>a.lastActive<b.lastActive?1:-1);
async function loadChats(){if(!Y||!Y.chats)return;const r=await Y.chats.list();if(!r.ok)return;CHATS=r.chats;
  // WHY (plan deck S-3): "Working" only while a chat on the item is open right now, never guessed
  document.querySelectorAll('.lrow').forEach(row=>{const id=+row.dataset.cid,open=chatsOf(id).some(c=>c.open);
    if(open&&!row.querySelector('.lworking')){const t=row.querySelector('.rt,.t-sm,.title');const s=document.createElement('span');s.className='spill info lworking';s.dataset.tip='A chat on this item is open right now.';s.innerHTML='<span class="dot" aria-hidden="true"></span>Working';(t&&t.parentNode||row).insertBefore(s,t?t.nextSibling:null)}
    const p=row.querySelector('.acts .btn.primary');if(open&&p&&!/Unpause/.test(p.textContent)){p.textContent='Go to chat';p.dataset.tip='A chat is working on it now. Switches to that conversation.'}})}
loadChats();

// ---------- the buttons ----------
const item=el=>{const r=el.closest('[data-cid]');if(r)return +r.dataset.cid;return typeof window.LCUR==='number'?window.LCUR:null};
async function start(prompt){if(!Y||!Y.startSession){toast('This page needs YouCoded with "Start a chat" for pages.');return}
  const r=await Y.startSession({prompt});if(!r.ok)toast(r.reason)}
const brief=id=>{const c=C[id];return `Work item #${c.id}: ${c.title}\nFile: ${c.file}${c.summary?'\nSummary: '+c.summary:''}`};
const ACT={
  'Start a chat on this':id=>start(`${brief(id)}\n\nStart work on this item. Begin with: node scripts/workspace-start.mjs --session ${C[id].branch} --item ${id} (add the repos it needs), then read the item's file.`),
  'Start another chat on this card':id=>ACT['Start a chat on this'](id),
  'Resume latest chat':async id=>{const c=chatsOf(id)[0];if(!c){toast('No chat for this item was found on this computer.');return}const r=await Y.chats.resume(c.id);if(!r.ok)toast(r.reason)},
  'Go to chat':async id=>{const c=chatsOf(id).find(x=>x.open)||chatsOf(id)[0];if(!c){toast('No open chat for this item was found.');return}const r=await Y.chats.resume(c.id);if(!r.ok)toast(r.reason)},
  'Fix failing checks':id=>start(`${brief(id)}\nBranches: ${branchesOf(id).join(', ')}\n\nIts checks fail. Find the failing checks on its pull requests, fix them on its branch, and push.`),
  'Merge to master':id=>start(`${brief(id)}\nBranches: ${branchesOf(id).join(', ')}\n\nMerge this item to master: merge and push each of its branches, run the close-out, archive its lifecycle docs, close the item (node scripts/cards.mjs close ${id} --ref "<merge commit>"), and clean up its copies and branches.`),
  'Open review deck':id=>start(`${brief(id)}\n\nServe this item's review deck so I can answer it.`),
  'Unpause':async id=>{try{boardDone((await run({op:'pause',id,reason:''})).message)}catch(e){toast(e.message)}},
  'Pause…':id=>pauseDlg(id),
  'Close…':id=>start(`${brief(id)}\nBranches: ${branchesOf(id).join(', ')}\n\nClose this item without merging: back up any unsaved changes, close its pull requests, remove its copies on this computer, and take it off the list. Its branches stay on GitHub.`),
};
function pauseDlg(id){openPanel('','Pause #'+id,`<p class="t-xs dim" style="margin:0">Paused items keep everything; only the marker changes. Say why, so it is clear later.</p><input class="field" id="preason" style="width:100%" placeholder="Why it is paused" data-tip="Shown on the item while it is paused."><div class="lerr" id="lerr" hidden></div>`,
  `<button class="btn" id="lcancel" data-tip="Closes this without changing anything.">Cancel</button><button class="btn primary" id="lgo" data-tip="Marks it paused with your reason and saves.">Pause</button>`);
  $('#lcancel').onclick=closePanel;$('#lgo').onclick=async()=>{const reason=$('#preason').value.trim();if(!reason){$('#lerr').hidden=false;$('#lerr').textContent='Say why it is paused.';return}
    try{boardDone((await run({op:'pause',id,reason})).message)}catch(e){$('#lerr').hidden=false;$('#lerr').textContent=e.message}}}
document.addEventListener('click',e=>{const tp=e.target.closest('[data-tidy-prompt]');if(tp){e.preventDefault();e.stopImmediatePropagation();start(tp.dataset.tidyPrompt).catch(err=>toast(err.message));return}
  const b=e.target.closest('button,[role=menuitem]');if(!b)return;
  // WHY the first span for a menu item: its effect is written under its name (today_tab.menu)
  const label=(b.getAttribute('role')==='menuitem'&&b.querySelector('span')||b).textContent.trim();const fn=ACT[label];
  if(!fn)return;const id=item(b);if(id==null||!C[id])return;e.preventDefault();e.stopImmediatePropagation();Promise.resolve(fn(id)).catch(err=>toast(err.message))},true);
})();
'''

# The page's own colour themes: `:root, :root[data-theme="light"]{…}` and one block per other theme.
THEME_BLOCK = re.compile(r':root(?:,\s*:root)?\[data-theme="[a-z]+"\]\{[^}]*\}')


def apply(page):
    """The built page, turned into the in-app page."""
    page = page.replace('<html lang="en" data-theme="light">', '<html lang="en">')
    page = THEME_BLOCK.sub('', page)
    page = re.sub(r'<header class="band">.*?</header>', '', page, count=1, flags=re.S)
    page = page.replace("$('#theme').onchange=e=>document.documentElement.dataset.theme=e.target.value;", '')
    return page.replace('</body></html>', f'<script>{JS}</script></body></html>')
