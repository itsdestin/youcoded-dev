// Floating variant switcher injected by serve.py into a copy of youcoded.ai.
// An `accent` recolours ONLY the default "youcoded" theme (other themes keep theirs), on the
// page through the site's own THEMES/applyTheme, and inside the live app demo frame.
(function(){
  var V = window.__VARIANTS || [], cur = 0, ORIG = THEMES.youcoded.accent;
  function active(){ var b=document.querySelector('.mascot.on, .sw.on'); return b ? b.dataset.theme : 'youcoded'; }
  function frameDoc(){ var f=document.querySelector('.embed-iframe'); try { return f && f.contentDocument; } catch(e){ return null; } }
  function paintFrame(){
    var d=frameDoc(); if(!d || !d.documentElement) return;
    var st=d.getElementById('sv-accent'), acc=V[cur] && V[cur].accent;
    if(!acc || active()!=='youcoded'){ if(st) st.remove(); return; }
    if(!st){ st=d.createElement('style'); st.id='sv-accent'; (d.head||d.documentElement).appendChild(st); }
    st.textContent=':root,:root *{--accent:'+acc+' !important}';
  }
  var extra=document.createElement('style'); document.head.appendChild(extra);
  function set(i){
    cur=i; var v=V[i]||{};
    THEMES.youcoded.accent = v.accent || ORIG;
    if(active()==='youcoded') applyTheme('youcoded');
    extra.textContent = v.css || '';
    paintFrame();
    bar.querySelectorAll('button').forEach(function(b,j){ b.classList.toggle('on', j===i); });
  }
  var css=document.createElement('style');
  css.textContent='#sv{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:flex;gap:6px;padding:6px;border-radius:999px;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);box-shadow:0 6px 24px rgba(40,10,70,.25);font:500 14px "DM Sans",system-ui,sans-serif;color:#21152C}'+
   '#sv button{display:flex;align-items:center;gap:6px;border:0;background:transparent;padding:7px 12px;border-radius:999px;font:inherit;color:inherit;cursor:pointer}'+
   '#sv i{width:14px;height:14px;border-radius:50%}#sv button.on{background:#21152C;color:#fff}';
  document.head.appendChild(css);
  var bar=document.createElement('div'); bar.id='sv';
  bar.innerHTML=V.map(function(v,i){ return '<button title="Key '+(i+1)+'">'+(v.accent?'<i style="background:'+v.accent+'"></i>':'')+v.name+'</button>'; }).join('');
  document.body.appendChild(bar);
  bar.addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) set([].indexOf.call(bar.children,b)); });
  document.addEventListener('keydown', function(e){ var n=parseInt(e.key,10); if(n>=1 && n<=V.length && !e.target.closest('input,textarea')) set(n-1); });
  // Theme switches and the demo frame loading late both need a repaint.
  document.addEventListener('click', function(e){ if(e.target.closest('.mascot,.sw')) setTimeout(function(){ set(cur); }, 60); });
  setInterval(paintFrame, 800);
  var q=(location.search.match(/[?&]v=(\d+)/)||[])[1];
  set(q ? Math.min(+q, V.length-1) : 0);
})();
