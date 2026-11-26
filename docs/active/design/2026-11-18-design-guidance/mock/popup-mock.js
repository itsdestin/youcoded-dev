// Drawings of a surface's popup (Surfaces tab), injected INTO the served Work board so they use
// the board's own styles. Not app code. window.__design picks the drawing:
//   Q1 grouped cards in the side panel · Q2 no side panel, facts in one strip above the picture
//   Q3 side panel holds the template and the situations; the picture grows taller.
// WHY three: Destin (2026-11-25) on the plain facts list: "still dont like the visual styling and
// deadspace here".
(() => {
  const S = (n) => 'shots/' + encodeURIComponent(n);
  const d = window.__design;
  const sb = document.querySelector('.tabs [data-view=app]');
  sb.childNodes.forEach(n => { if (n.nodeType === 3 && /Screens/.test(n.textContent)) n.textContent = 'Surfaces '; });
  const facts = document.querySelector('.dfacts');
  const grid = facts.parentElement;
  const left = grid.querySelector('.dleft');
  const crumbs = facts.querySelector('.crumbs').outerHTML;
  const job = 'Finish a conversation and leave a note for next time.';
  const chips = ['Popup', 'Leaving & updating', '2 clicks', 'Has typing', 'Phone version', 'Error picture']
    .map(c => `<span class="badge">${c}</span>`).join('');
  // The template link: its picture, name and how many surfaces share it. Clicking opens the template.
  const tplCard = (h) => `<button class="card" style="display:grid;grid-template-columns:${h * 1.4}px 1fr auto;gap:10px;align-items:center;padding:8px;text-align:left;width:100%;cursor:pointer">
      <img src="${S('settings__about.jpg')}" style="width:100%;height:${h}px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--edge,#ccc)">
      <span style="display:flex;flex-direction:column;gap:2px"><span class="t-2xs muted">Surface template</span><b class="t-sm">Popup with several groups</b><span class="t-2xs muted">12 surfaces use it</span></span>
      <span class="t-sm muted">›</span></button>`;
  const card = (title, body) => `<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div class="eyebrow">${title}</div>${body}</div>`;

  if (d === 'Q1') {
    // Same layout as today; the side panel becomes three filled cards that run the panel's height.
    facts.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    facts.innerHTML = `<div>${crumbs}</div>`
      + tplCard(52)
      + card('What it is for', `<p class="t-sm" style="margin:0">${job}</p><div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>`)
      + card('Work changing it', `<span class="t-xs muted">None yet.</span>`);
  }
  if (d === 'Q2') {
    // No side panel: one strip of facts above a full-width picture.
    facts.remove();
    grid.style.gridTemplateColumns = '1fr';
    const strip = document.createElement('div');
    strip.style.cssText = 'display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:center;margin-bottom:12px';
    strip.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">${crumbs}<p class="t-sm" style="margin:0">${job}</p><div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div></div>` + tplCard(44);
    grid.parentElement.insertBefore(strip, grid);
    // WHY shorter: the strip above takes room; the situations row must stay fully visible.
    const z = left.querySelector('.dimg'); z.style.height = '420px'; z.style.overflow = 'hidden';
    const zi = z.querySelector('img'); zi.style.maxHeight = '100%'; zi.style.objectFit = 'contain';
  }
  if (d === 'Q3') {
    // Side panel = template on top, then the situations as a list that fills the rest.
    // The strip under the picture goes, so the picture grows taller.
    const strip = left.querySelector('.sstrip');
    const items = [...strip.querySelectorAll('button')].map(b => {
      const img = b.querySelector('img').getAttribute('src');
      const on = b.getAttribute('aria-pressed') === 'true';
      return `<button class="fchip" aria-pressed="${on}" style="display:grid;grid-template-columns:44px 1fr;gap:8px;align-items:center;padding:4px 8px;text-align:left;width:100%"><img src="${img}" style="width:44px;height:30px;object-fit:cover;object-position:top;border-radius:4px">${b.textContent.trim()}</button>`;
    }).join('');
    strip.remove();
    left.querySelector('.dbar').remove();
    const zoom = left.querySelector('.dimg');
    zoom.style.height = '600px';
    facts.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    facts.innerHTML = `<div>${crumbs}<p class="t-sm" style="margin:6px 0 0">${job}</p></div>`
      + `<div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>`
      + tplCard(48)
      + `<div class="eyebrow" style="margin-top:4px">Situations</div><div style="display:flex;flex-direction:column;gap:4px">${items}</div>`;
  }
  window.__done = 1;
})();
