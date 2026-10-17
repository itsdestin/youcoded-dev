"""The page's search boxes, dropdowns and filter chips, in the app's own look.

WHY (Destin, 2026-10-16: "fix the dropdowns/filter menus/search bar to match youcoded ui styling"): the page used
the browser's own <select> menus and a plain text box. These copy the app's shared pieces on the UI-consistency
branch (youcoded/desktop/src/renderer/components/ui/):
- SearchFilterPill.tsx — an inset box with the theme's control corner, a magnifier glyph inside, the input bare,
  and an accent border on focus.
- Select.tsx + field.ts — the trigger is the field surface (inset, card outline, large corner) with a chevron;
  pointing at it changes the border, never the fill; the menu is a layer exactly the trigger's width, rows
  'px-2.5 py-1.5 rounded-md text-2xs', the chosen row filled with the accent.
- FilterChip.tsx — 'px-3 py-1 rounded-control text-sm', inset with an outline, the active one filled.
The native <select> stays in the page as the value holder (so every existing listener keeps working); a drawn
trigger and menu stand in front of it.
"""

SEARCH_GLYPH = ('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>')

CSS = '''
/* ---- the app's control shape (globals.css --radius-control: the built-in Round themes' 14px) ---- */
:root{--radius-control:14px}
/* SearchFilterPill.tsx: 'flex items-center gap-2 bg-inset border border-edge rounded-control pl-3 pr-3 py-1 focus-within:border-accent' */
.uisearch{display:inline-flex;align-items:center;gap:8px;background:var(--inset);border:1px solid var(--edge);border-radius:var(--radius-control);padding:4px 12px;min-width:240px;transition:border-color var(--dur-hover)}
.uisearch:focus-within{border-color:var(--accent)}
.uisearch .uiglyph{color:var(--fg-muted);display:inline-flex;flex:none}
.uisearch input{background:transparent;border:0;outline:none;font:inherit;font-size:13px;line-height:20px;color:var(--fg);width:100%;min-width:0;padding:0}
.uisearch input::placeholder{color:var(--fg-muted)}
.uisearch input::-webkit-search-cancel-button{display:none}
/* Select.tsx trigger: FIELD_SURFACE 'bg-inset border border-edge-card rounded-lg' + 'text-xs px-3 py-2', chevron; hover changes the border */
select.uinative{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important}
.uisel{position:relative;display:inline-flex}
.uitrig{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;min-width:120px;font:inherit;font-size:12px;line-height:16px;padding:6px 12px;
  background:var(--inset);border:1px solid var(--edge-card);border-radius:var(--radius-lg);color:var(--fg);cursor:pointer;text-align:left;transition:border-color var(--dur-hover)}
@media (hover:hover){.uitrig:hover{border-color:var(--fg-muted)}} .uitrig:active{border-color:var(--fg-dim)}
.uitrig[aria-expanded="true"],.uitrig:focus-visible{border-color:var(--accent);outline:none}
.uitrig .uival{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uitrig svg{width:12px;height:12px;flex:none;color:var(--fg-muted);fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.bandpill .uitrig{background:transparent;border-color:transparent;padding:4px 8px;min-width:0;border-radius:var(--radius-sm)}
@media (hover:hover){.bandpill .uitrig:hover{background:var(--edge);border-color:transparent}}
/* the menu: a layer the trigger's width; rows 'px-2.5 py-1.5 rounded-md text-2xs', chosen = accent */
.uimenu{position:fixed;z-index:60;padding:4px;max-height:256px;overflow-y:auto;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);box-shadow:var(--layer-shadow)}
.uimenu[hidden]{display:none}
.uiopt{display:block;width:100%;text-align:left;font:inherit;font-size:11px;line-height:15px;padding:6px 10px;border:0;border-radius:var(--radius-md);background:transparent;color:var(--fg-2);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uiopt.active{background:var(--inset)} .uiopt[aria-selected="true"]{background:var(--accent);color:var(--on-accent);font-weight:500}
/* FilterChip.tsx: the theme's control corner, never a hard-coded pill */
.fchip{border-radius:var(--radius-control)!important}
'''

JS = r'''
// ---- the app's Select, in front of each native select box (ui_controls.py) ----
(function(){
const CHEV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
let open=null;
function close(){if(!open)return;open.menu.hidden=true;open.trig.setAttribute('aria-expanded','false');open=null}
function enhance(sel){
  if(sel.dataset.ui)return;sel.dataset.ui=1;sel.classList.add('uinative');sel.tabIndex=-1;
  const wrap=document.createElement('span');wrap.className='uisel';sel.parentNode.insertBefore(wrap,sel);wrap.appendChild(sel);
  const trig=document.createElement('button');trig.type='button';trig.className='uitrig';trig.setAttribute('aria-haspopup','listbox');trig.setAttribute('aria-expanded','false');
  trig.dataset.tip=sel.dataset.tip||sel.getAttribute('aria-label')||'Choose one.';
  if(sel.getAttribute('aria-label'))trig.setAttribute('aria-label',sel.getAttribute('aria-label'));
  const menu=document.createElement('div');menu.className='uimenu layer';menu.setAttribute('role','listbox');menu.hidden=true;document.body.appendChild(menu);
  const paint=()=>{const o=sel.options[sel.selectedIndex];trig.innerHTML=`<span class="uival">${o?o.textContent:''}</span>${CHEV}`};
  paint();wrap.appendChild(trig);
  let act=-1;
  const rows=()=>[...menu.querySelectorAll('.uiopt')];
  const mark=i=>{act=i;rows().forEach((r,j)=>r.classList.toggle('active',j===i));const r=rows()[i];if(r)r.scrollIntoView({block:'nearest'})};
  const pick=i=>{if(i<0)return;sel.selectedIndex=i;sel.dispatchEvent(new Event('change',{bubbles:true}));paint();close();trig.focus()};
  trig.addEventListener('click',e=>{e.stopPropagation();if(open&&open.trig===trig){close();return}close();
    menu.innerHTML=[...sel.options].map((o,i)=>`<button type="button" class="uiopt" role="option" aria-selected="${i===sel.selectedIndex}" data-i="${i}" data-tip="${o.textContent.replace(/"/g,'&quot;')}">${o.textContent}</button>`).join('');
    const r=trig.getBoundingClientRect();menu.style.minWidth=r.width+'px';menu.style.left=r.left+'px';menu.hidden=false;
    const below=r.bottom+4+menu.offsetHeight<=innerHeight;menu.style.top=(below?r.bottom+4:r.top-4-menu.offsetHeight)+'px';
    trig.setAttribute('aria-expanded','true');open={trig,menu};mark(sel.selectedIndex)});
  menu.addEventListener('mousemove',e=>{const o=e.target.closest('.uiopt');if(o)mark(+o.dataset.i)});
  menu.addEventListener('click',e=>{const o=e.target.closest('.uiopt');if(o){e.stopPropagation();pick(+o.dataset.i)}});
  trig.addEventListener('keydown',e=>{if(!open||open.trig!==trig){if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();trig.click()}return}
    if(e.key==='ArrowDown'){e.preventDefault();mark(Math.min(act+1,sel.options.length-1))}
    else if(e.key==='ArrowUp'){e.preventDefault();mark(Math.max(act-1,0))}
    else if(e.key==='Enter'){e.preventDefault();pick(act)}});
  sel.addEventListener('change',paint);
}
document.addEventListener('click',close);addEventListener('resize',close);addEventListener('scroll',e=>{if(open&&!open.menu.contains(e.target))close()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){e.stopPropagation();const t=open.trig;close();t.focus()}},true);
// ---- the app's search pill around each search box ----
function search(inp){
  if(inp.dataset.ui)return;inp.dataset.ui=1;inp.classList.remove('field');inp.removeAttribute('style');
  const w=document.createElement('span');w.className='uisearch';w.dataset.tip=inp.dataset.tip||'';inp.parentNode.insertBefore(w,inp);
  w.innerHTML=`<span class="uiglyph">__GLYPH__</span>`;w.appendChild(inp);w.addEventListener('click',()=>inp.focus())}
function all(){document.querySelectorAll('select').forEach(enhance);document.querySelectorAll('input[type=search], input.field[type=text], input.field:not([type])').forEach(search)}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',all);else all();
window.uiControls=all;
})();
'''.replace('__GLYPH__', SEARCH_GLYPH)
