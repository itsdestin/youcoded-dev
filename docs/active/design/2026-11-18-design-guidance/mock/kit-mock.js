// Drawings of the Design kit tab, injected INTO the served Work board (scripts/manage.mjs) so they
// use the board's own styles. Not app code. window.__design picks the drawing:
//   T1 template rows · T2 three linked columns · T3 stacked template tiles · P1/P2 a surface's popup.
// Words (Destin, 2026-11-24): Surfaces (real screens), Surface templates, Components.
(() => {
  const S = (n) => 'shots/' + encodeURIComponent(n);
  const TPL = [
    ['One-job popup', 'handle-prompt.jpg', 'A popup that does one thing.', ['Popup', 'Text box', 'Button'], ['handle-prompt.jpg', 'chat__model-picker__switch-model.jpg', 'chat__resume__pick-model.jpg'], 14],
    ['Popup with several groups', 'chat__close-session.jpg', 'Labelled cards, buttons pinned to the bottom.', ['Popup', 'Section label', 'Switch', 'Button'], ['chat__close-session.jpg', 'chat__close-session#note.jpg', 'settings__about.jpg'], 12],
    ['Detail page', 'marketplace__detail.jpg', 'Something you open from a card.', ['Popup', 'Status pill', 'Fact chip', 'Button'], ['marketplace__detail.jpg', 'marketplace__detail__bundle.jpg', 'marketplace__detail__connection.jpg'], 6],
    ['Failed action', 'marketplace__detail__install#failed.jpg', 'A notice takes the buttons’ place.', ['Notice box', 'Fold row', 'Button'], ['marketplace__detail__install#failed.jpg', 'library#load-failed.jpg', 'library__themes#load-failed.jpg'], 9],
    ['Card grid', 'library.jpg', 'Things you open or install.', ['Card', 'Fact chip', 'Status pill'], ['library.jpg', 'library__themes.jpg', 'pages.jpg'], 7],
    ['Pick menu', 'chat__model-picker.jpg', 'A list that drops from a control.', ['Menu', 'Status pill'], ['chat__model-picker.jpg', 'chat__model-picker__fast-mode.jpg'], 23],
    ['First-time empty', 'library#empty.jpg', 'Nothing here yet, one button.', ['Card', 'Button'], ['library#empty.jpg', 'pages#empty.jpg'], 11],
    ['Full screen', 'projects.jpg', 'A whole screen with a back button.', ['Screen band', 'Tab strip', 'Card'], ['projects.jpg', 'pages.jpg', 'library.jpg'], 5],
  ];
  const DARK = 'background:var(--fg,#111);color:var(--bg,#fff)';
  const CMP = [
    ['Button', `<span class="btn sm" style="${DARK}">Save</span><span class="btn sm">Cancel</span>`, 152],
    ['Text box', '<span class="field" style="display:inline-block;padding:4px 10px;min-width:110px">Name</span>', 27],
    ['Switch', '<span class="fchip" aria-pressed="true">On</span>', 34],
    ['Status pill', '<span class="badge">● Working</span>', 20],
    ['Fact chip', '<span class="badge">Plugin</span><span class="badge">12 skills</span>', 5],
    ['Notice box', '<span class="badge" style="padding:6px 10px">Couldn’t load. <b>Try again</b></span>', 37],
    ['Popup', '<span class="badge" style="padding:6px 10px">Title  ✕</span>', 59],
    ['Fold row', '<span class="badge" style="padding:6px 10px">Details ›</span>', 19],
    ['Section label', '<span class="t-xs muted">In your lists</span>', 60],
    ['Menu', '<span class="badge" style="padding:6px 10px">Sonnet ▾</span>', 6],
    ['Tab strip', '<span class="fchip" aria-pressed="true">Day</span><span class="fchip">Week</span>', 12],
  ];
  const d = window.__design;
  const tabs = document.querySelector('.tabs');
  // Screens is renamed Surfaces in every drawing.
  const sb = tabs.querySelector('[data-view=app]');
  sb.childNodes.forEach(n => { if (n.nodeType === 3 && /Screens/.test(n.textContent)) n.textContent = 'Surfaces '; });
  const kitTab = document.createElement('button');
  kitTab.setAttribute('role', 'tab');
  kitTab.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>Design kit';
  tabs.insertBefore(kitTab, tabs.children[2]);
  tabs.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', 'false'));
  const onSurfaces = d[0] === 'P';
  (onSurfaces ? sb : kitTab).setAttribute('aria-selected', 'true');
  const head = document.getElementById('panehead');
  if (onSurfaces) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
    document.getElementById('app').classList.add('on');
    const q = document.getElementById('sq'); if (q) q.placeholder = 'Find a surface';
  } else {
    // WHY clone: the Surfaces tab's own search row lives in the pane head; copying keeps its layout.
    const src = head.querySelector('.lensbar.sbar');
    head.querySelectorAll('.lensbar').forEach(l => { l.style.display = 'none'; });
    const nb = src.cloneNode(true); nb.hidden = false; nb.style.display = '';
    nb.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    nb.querySelector('input').placeholder = 'Find a template or component';
    nb.querySelector('.fchips').innerHTML = ['Has an open question', 'Phone'].map(x => `<button class="fchip" aria-pressed="false">${x}</button>`).join('');
    // WHY replace the whole pill: the cloned one keeps its own label text from the Surfaces tab.
    const bp = nb.querySelector('.bandpill'); if (bp) bp.outerHTML = '<div class="bandpill showme"><select aria-label="Sort"><option>Sort: most used</option></select></div>';
    const ef = nb.querySelector('.effchip'); if (ef) ef.remove();
    head.appendChild(nb);
    document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  }
  const main = document.querySelector('.cc-main');
  const v = document.createElement('div'); v.className = 'view on';
  if (!onSurfaces) main.prepend(v);
  const sec = (title, n, body) => `<section class="gsec"><div class="sechead"><div class="gtext"><h2 class="gh"><span>${title}</span><span class="cnt">${n}</span></h2></div></div>${body}</section>`;
  const thumb = (s, h) => `<img src="${S(s)}" style="width:100%;height:${h}px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--edge,#ccc)">`;
  const ctile = (c) => `<figure class="tile"><div class="timg" style="display:flex;align-items:center;justify-content:center;gap:6px;min-height:88px">${c[1]}</div><figcaption class="tcap"><span class="tn">${c[0]}</span><span class="tp">On ${c[2]} surfaces</span></figcaption></figure>`;

  if (d === 'T1') {
    // Template rows: template picture | its name, job and the components it is made of | real surfaces using it.
    const row = (t) => `<div class="card" style="display:grid;grid-template-columns:220px 1fr 340px;gap:16px;align-items:center;padding:12px">
      ${thumb(t[1], 140)}
      <div style="display:flex;flex-direction:column;gap:8px"><span class="t-lg">${t[0]}</span><span class="t-sm dim">${t[2]}</span>
        <div class="cchips" style="display:flex;gap:6px;flex-wrap:wrap">${t[3].map(c => `<span class="badge">${c}</span>`).join('')}</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;position:relative">${t[4].slice(0, 3).map(s => thumb(s, 64)).join('')}
        <span class="t-xs muted" style="grid-column:1/-1;text-align:right">${t[5]} surfaces ›</span></div></div>`;
    v.innerHTML = sec('Surface templates', TPL.length, `<div style="display:flex;flex-direction:column;gap:12px">${TPL.slice(0, 4).map(row).join('')}</div>`)
      + sec('Components', CMP.length, `<div class="wall">${CMP.slice(0, 8).map(ctile).join('')}</div>`);
  }
  if (d === 'T2') {
    // Three linked columns, left to right: components -> templates -> surfaces. The chosen template
    // lights its components and its surfaces; everything else fades.
    const pick = TPL[1];
    const col = (title, n, body) => `<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><h2 class="gh"><span>${title}</span><span class="cnt">${n}</span></h2>${body}</div>`;
    const comps = CMP.map(c => { const on = pick[3].includes(c[0]); return `<button class="fchip" aria-pressed="${on}" style="display:flex;justify-content:space-between;${on ? '' : 'opacity:.4'}"><span>${c[0]}</span><span class="t-2xs muted">${c[2]}</span></button>`; }).join('');
    const tpls = TPL.map(t => { const on = t === pick; return `<div class="card" style="display:grid;grid-template-columns:84px 1fr;gap:10px;align-items:center;padding:8px;${on ? 'outline:2px solid var(--fg,#111)' : 'opacity:.55'}">${thumb(t[1], 54)}<div><b class="t-sm">${t[0]}</b><div class="t-2xs muted">${t[5]} surfaces</div></div></div>`; }).join('');
    const surfs = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${pick[4].concat(['chat__close-session#tag-edit.jpg', 'settings__about#fold-hover.jpg', 'chat__close-session#phone.jpg']).map(s => `<figure class="tile"><div class="timg">${thumb(s, 96)}</div></figure>`).join('')}</div>`;
    v.innerHTML = `<div style="display:grid;grid-template-columns:200px 1fr 1fr;gap:20px;margin-top:8px">${col('Components', CMP.length, comps)}${col('Surface templates', TPL.length, tpls)}${col('Surfaces using it', pick[5], surfs)}</div>`;
  }
  if (d === 'T3') {
    // Template tiles drawn as a stack: the template on top, its real surfaces fanned behind it,
    // the components it is made of along its foot. Components have their own tab strip page.
    const stack = (t) => `<figure class="tile" style="overflow:visible">
      <div style="position:relative;height:170px;margin:14px 14px 0">
        ${t[4].slice(1, 3).map((s, i) => `<img src="${S(s)}" style="position:absolute;inset:0;width:100%;height:150px;object-fit:cover;object-position:top;border-radius:10px;border:1px solid var(--edge,#ccc);transform:translate(${(i + 1) * 8}px,${(i + 1) * -8}px);opacity:${0.55 - i * 0.2}">`).join('')}
        <img src="${S(t[1])}" style="position:absolute;inset:0;width:100%;height:150px;object-fit:cover;object-position:top;border-radius:10px;border:1px solid var(--edge,#ccc);box-shadow:0 6px 16px rgba(0,0,0,.18)">
        <span class="badge" style="position:absolute;right:6px;top:6px">${t[5]} surfaces</span></div>
      <figcaption class="tcap"><span class="tn">${t[0]}</span><span class="tp" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${t[3].map(c => `<span class="badge">${c}</span>`).join('')}</span></figcaption></figure>`;
    v.innerHTML = `<div class="tabs" role="tablist" style="margin:8px 0 12px"><button role="tab" aria-selected="true">Surface templates <span class="count">${TPL.length}</span></button><button role="tab" aria-selected="false">Components <span class="count">${CMP.length}</span></button></div>`
      + `<div class="wall">${TPL.map(stack).join('')}</div>`;
  }
  if (onSurfaces) {
    const t2 = document.querySelector('[data-id="chat/close-session"]') || document.querySelector('.tile');
    t2.click();
    setTimeout(() => {
      const facts = document.querySelector('.dfacts');
      const el = document.createElement('div');
      el.innerHTML = `<div class="eyebrow">Surface template</div><button class="btn sm" style="margin-top:4px">Popup with several groups ›</button>`
        + (d === 'P2' ? `<p class="t-xs" style="margin-top:8px"><span class="badge">1 hand-made part</span></p>` : '');
      facts.insertBefore(el, facts.children[1]);
      window.__done = 1;
    }, 700);
  } else window.__done = 1;
})();
